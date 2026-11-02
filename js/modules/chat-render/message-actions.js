window.sendPayResponse = async function(msgId, action) {
    const chat = db.characters.find(c => c.id === currentChatId);
    if (!chat) return;

    const msg = chat.history.find(m => m.id === msgId);
    if (!msg) return;

    // 用户同意代付时：从存钱罐扣款并记账
    if (action === 'pay') {
        const payReqMatch = (msg.content || '').match(/发起了代付请求[：:]([\d.]+)\|/);
        const amount = payReqMatch ? parseFloat(payReqMatch[1]) : 0;
        if (amount > 0 && typeof getPiggyBalance === 'function' && getPiggyBalance() < amount) {
            if (typeof showToast === 'function') showToast('存钱罐余额不足，无法代付');
            return;
        }
        if (amount > 0 && typeof addPiggyTransaction === 'function') {
            addPiggyTransaction({
                type: 'expense',
                amount,
                remark: '代付给' + (chat.realName || ''),
                source: '商城代付',
                charName: chat.realName || ''
            });
            if (window.WalletSystem && typeof window.WalletSystem.ensureCharacterWalletLedger === 'function') {
                const ledger = window.WalletSystem.ensureCharacterWalletLedger(chat);
                const eventId = `pay_request_${msg.id}`;
                if (!ledger.transactions.some(item => item.eventId === eventId)) {
                    ledger.transactions.unshift({
                        id: `cwt_${eventId}`,
                        eventId,
                        type: 'income',
                        amount,
                        source: 'pay_request',
                        remark: '用户已代付商城订单',
                        time: Date.now()
                    });
                    if (typeof ledger.balance === 'number') ledger.balance = Math.round((ledger.balance + amount) * 100) / 100;
                }
            }
        }
    }

    // 1. 更新原消息状态
    msg.payStatus = action === 'pay' ? 'paid' : 'rejected';
    
    // 2. 刷新界面（为了让原消息的小票立刻变成"已支付/已拒绝"状态）
    const wrapper = document.querySelector(`.message-wrapper[data-id="${msgId}"]`);
    if (wrapper) {
         renderMessages(false, false);
    }

    // 3. 构建指令消息文本
    const myName = chat.myName;
    const realName = chat.realName;
    let responseText = '';
    
    if (action === 'pay') {
        responseText = `[${myName}同意了${realName}的代付请求]`;
    } else {
        responseText = `[${myName}拒绝了${realName}的代付请求]`;
    }

    // 4. 【关键修改】直接手动添加消息，不走发送按钮逻辑
    // 这样就不会被包裹成 [用户消息：...] 了
    const newMsg = {
        id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        role: 'user',
        content: responseText,
        timestamp: Date.now(),
        // isStatusUpdate: true 标记为状态更新类消息
    };

    chat.history.push(newMsg);
    
    // 5. 保存并刷新到底部
    if (window.WalletSystem && typeof window.WalletSystem.persist === 'function') await window.WalletSystem.persist([currentChatId]);
    else if (typeof saveCharacter === 'function') await saveCharacter(currentChatId);
    else if (typeof saveData === 'function') await saveData();
    renderMessages(false, true); 
};


function addMessageBubble(message, targetChatId, targetChatType) {
    const interactiveOriginal = window.InteractiveMessages?.sourceOf(message) ? message : null;
    // Business-command readers get a neutral view; rendering retains the actual page object.
    if (interactiveOriginal) message = { ...message, content: '[互动页面]' };
    const isChatRoomActive = document.getElementById('chat-room-screen') && document.getElementById('chat-room-screen').classList.contains('active');
    const isViewingTargetChat = !!isChatRoomActive && targetChatId === currentChatId && targetChatType === currentChatType;
    const senderChat = (targetChatType === 'private')
        ? db.characters.find(c => c.id === targetChatId)
        : db.groups.find(g => g.id === targetChatId);
    const isLowDisturbancePoke = message.type === 'profile_update' || message.type === 'poke' && (
        message.targetId !== 'user_me' || !senderChat || senderChat.pokeNotificationMode !== 'normal'
    );

    // 特殊业务动作必须先于界面可见性分支处理，避免后台消息只出现文本、没有同步状态。
    if (!interactiveOriginal && targetChatType === 'private' && senderChat && window.WalletSystem && typeof window.WalletSystem.processFamilyCardActionMessage === 'function') {
        window.WalletSystem.processFamilyCardActionMessage(message, senderChat);
    }
    
    // 如果发送方不是自己，则准备组装系统通知
    let shouldShowSystemNotification = false;
    let notifTitle, notifBody, notifIcon;
    const mr = db.magicRoom || {};
    
    if (senderChat && message.senderId !== 'user_me' && message.role !== 'user') {
        let senderName, senderAvatar;
        if (targetChatType === 'private') {
            senderName = senderChat.remarkName;
            senderAvatar = senderChat.avatar;
        } else { 
            const sender = senderChat.members.find(m => m.id === message.senderId);
            if (sender) {
                senderName = sender.groupNickname;
                senderAvatar = sender.avatar;
            } else { 
                senderName = senderChat.name;
                senderAvatar = senderChat.avatar;
            }
        }

        let previewText = message.content;
        const textMatch = previewText.match(/\[.*?的消息[：:]([\s\S]+?)\]/);
        if (textMatch) {
            previewText = textMatch[1];
        } else {
            if (/\[.*?的表情包[：:].*?\]/.test(previewText)) previewText = '[表情包]';
            else if (/\[.*?的语音[：:].*?\]/.test(previewText)) previewText = '[语音]';
            else if (/\[.*?发来的照片\/视频[：:].*?\]/.test(previewText)) previewText = '[照片/视频]';
            else if (/\[.*?的转账[：:].*?\]/.test(previewText) || /\[.*?向.*?转账[：:].*?\]/.test(previewText)) previewText = '[转账]';
            else if (/\[(.+?)的位置[：:].*?\]/.test(previewText)) previewText = '[定位]';
            else if (/\[.*?送来的礼物[：:].*?\]/.test(previewText)) previewText = '[礼物]';
            else if (/\[.*?发来了一张图片[：:]\]/.test(previewText)) previewText = '[图片]';
            else if (/\[商城订单[：:].*?\]/.test(previewText)) previewText = '[商城订单]';
            else if (message.parts && message.parts.some(p => p.type === 'html')) previewText = '[互动]';
        }

        if (message.type === 'poke') previewText = message.displayText || '拍一拍';

        notifTitle = (mr.sysNotifSenderName && mr.sysNotifSenderName.trim()) ? mr.sysNotifSenderName.trim() : senderName;
        notifBody  = mr.sysNotifShowContent !== false ? previewText.substring(0, 60) : '你有一条新消息';
        notifIcon  = mr.sysNotifShowAvatar !== false ? senderAvatar : undefined;
        
        // 当不在当前聊天，或者（在当前聊天且开启了页内通知）时，触发系统通知
        if ((!isViewingTargetChat || mr.sysNotifInChatEnabled) && !isLowDisturbancePoke) {
            shouldShowSystemNotification = true;
        }
    }
    
    // 如果需要发送系统级通知
    if (shouldShowSystemNotification && mr.sysNotifEnabled && typeof showSystemNotification === 'function') {
        showSystemNotification({ title: notifTitle, body: notifBody, icon: notifIcon });
        // Server pushes are sent by server-side tasks to registered devices.
        // Sending this local notification back through the server would duplicate it.
    }
    
    if (!isViewingTargetChat) {
        if (senderChat && message.role !== 'user' && message.senderId !== 'user_me') {
            let invisibleRegex;
            if (senderChat.showStatusUpdateMsg) {
                // 在末尾添加 |<thinking>[\s\S]*?<\/thinking>
                invisibleRegex = /\[system:.*?\]|\[系统情景通知：.*?\]|\[.*?已接收礼物\]|\[.*?(?:接收|退回).*?的转账\]|\[.*?(?:接收|退还).*?的亲属卡\]|\[.*?(?:冻结|解冻|收回)了亲属卡\]|\[.*?调整亲属卡额度为：.*?\]|\[.*?同意了.*?的代付请求\]|\[.*?拒绝了.*?的代付请求\]|\[.*?拒绝了.*?的(?:视频|语音)通话\]|\[avatar-action:.*?\]|<thinking>[\s\S]*?<\/thinking>|^<thinking>[\s\S]*/;
            } else {
                // 在末尾添加 |<thinking>[\s\S]*?<\/thinking>
                invisibleRegex = /\[system:.*?\]|\[系统情景通知：.*?\]|\[.*?更新状态为：.*?\]|\[.*?已接收礼物\]|\[.*?(?:接收|退回).*?的转账\]|\[.*?(?:接收|退还).*?的亲属卡\]|\[.*?(?:冻结|解冻|收回)了亲属卡\]|\[.*?调整亲属卡额度为：.*?\]|\[.*?同意了.*?的代付请求\]|\[.*?拒绝了.*?的代付请求\]|\[.*?拒绝了.*?的(?:视频|语音)通话\]|\[avatar-action:.*?\]|<thinking>[\s\S]*?<\/thinking>|^<thinking>[\s\S]*/;
            }
            if (!invisibleRegex.test(message.content) && !isLowDisturbancePoke) {
                senderChat.unreadCount = (senderChat.unreadCount || 0) + 1;
                if (targetChatType === 'group' && typeof saveGroup === 'function') saveGroup(targetChatId);
                else if (targetChatType === 'private' && typeof saveCharacter === 'function') saveCharacter(targetChatId);
                else saveData();
                renderChatList(); 
            }
            
            let senderName, senderAvatar;
            if (targetChatType === 'private') {
                senderName = senderChat.remarkName;
                senderAvatar = senderChat.avatar;
            } else { 
                const sender = senderChat.members.find(m => m.id === message.senderId);
                if (sender) {
                    senderName = sender.groupNickname;
                    senderAvatar = sender.avatar;
                } else { 
                    senderName = senderChat.name;
                    senderAvatar = senderChat.avatar;
                }
            }

            let previewText = message.content;

            const textMatch = previewText.match(/\[.*?的消息[：:]([\s\S]+?)\]/);
            if (textMatch) {
                previewText = textMatch[1];
            } else {
                if (/\[.*?的表情包[：:].*?\]/.test(previewText)) previewText = '[表情包]';
                else if (/\[.*?的语音[：:].*?\]/.test(previewText)) previewText = '[语音]';
                else if (/\[.*?发来的照片\/视频[：:].*?\]/.test(previewText)) previewText = '[照片/视频]';
                else if (/\[.*?的转账[：:].*?\]/.test(previewText) || /\[.*?向.*?转账[：:].*?\]/.test(previewText)) previewText = '[转账]';
                else if (/\[(.+?)的位置[：:].*?\]/.test(previewText)) previewText = '[定位]';
                else if (/\[.*?送来的礼物[：:].*?\]/.test(previewText)) previewText = '[礼物]';
                else if (/\[.*?发来了一张图片[：:]\]/.test(previewText)) previewText = '[图片]';
                else if (/\[商城订单[：:].*?\]/.test(previewText)) previewText = '[商城订单]';
                else if (message.parts && message.parts.some(p => p.type === 'html')) previewText = '[互动]';
            }
            if (message.type === 'poke') previewText = message.displayText || '拍一拍';
            
            // === 后台消息弹窗通知开关检查 ===
            const isToastEnabled = senderChat.bgToastEnabled !== undefined ? senderChat.bgToastEnabled : (db.globalToastEnabled !== false);
            if (isToastEnabled && !isLowDisturbancePoke) {
                showToast({
                    avatar: senderAvatar,
                    name: senderName,
                    message: previewText.substring(0, 30)
                });
            }

        }
        return; 
    }

    if (currentChatType === 'private') {
        const character = db.characters.find(c => c.id === currentChatId);
        const updateStatusRegex = new RegExp(`\\[${character.realName}更新状态为[：:](.*?)\\]`);
        const transferActionRegex = new RegExp(`\\[${character.realName}(接收|退回)${character.myName}的转账\\]`);
        const giftReceivedRegex = new RegExp(`\\[${character.realName}已接收礼物\\]`);
        
        // AI 回应用户的代付请求
        const payAgreedRegex = new RegExp(`\\[${character.realName}同意了${character.myName}的代付请求\\]`);
        const payRejectedRegex = new RegExp(`\\[${character.realName}拒绝了${character.myName}的代付请求\\]`);
        
        // 用户回应 AI 的代付请求 (通过按钮触发的指令)
        const userPayAgreedRegex = new RegExp(`\\[${character.myName}同意了${character.realName}的代付请求\\]`);
        const userPayRejectedRegex = new RegExp(`\\[${character.myName}拒绝了${character.realName}的代付请求\\]`);

        if (message.content.match(updateStatusRegex)) {
            character.status = message.content.match(updateStatusRegex)[1];
            chatRoomStatusText.textContent = character.status;
            if (!character.showStatusUpdateMsg) {
                return;
            }
        }
        if (message.content.match(giftReceivedRegex) && message.role === 'assistant') {
            const lastPendingGiftIndex = character.history.slice().reverse().findIndex(m => m.role === 'user' && /送来的礼物[：:]/.test(m.content) && m.giftStatus !== 'received');
            if (lastPendingGiftIndex !== -1) {
                const actualIndex = character.history.length - 1 - lastPendingGiftIndex;
                const giftMsg = character.history[actualIndex];
                giftMsg.giftStatus = 'received';
                const giftCardOnScreen = messageArea.querySelector(`.message-wrapper[data-id="${giftMsg.id}"] .gift-card`);
                if (giftCardOnScreen) {
                    giftCardOnScreen.classList.add('received');
                }
            }
            return;
        }
        
        // 处理 AI 同意/拒绝 用户的请求
        if (message.content.match(payAgreedRegex) && message.role === 'assistant') {
            const lastPendingPayIndex = character.history.slice().reverse().findIndex(m => m.role === 'user' && /发起了代付请求[：:]/.test(m.content) && m.payStatus !== 'paid' && m.payStatus !== 'rejected');
            if (lastPendingPayIndex !== -1) {
                const actualIndex = character.history.length - 1 - lastPendingPayIndex;
                const payMsg = character.history[actualIndex];
                payMsg.payStatus = 'paid';
                const receiptBubble = messageArea.querySelector(`.message-wrapper[data-id="${payMsg.id}"] .receipt-bubble`);
                if (receiptBubble) {
                    // 更新底部状态文字
                    const statusSpan = receiptBubble.querySelector('.pay-status-text');
                    if (statusSpan) statusSpan.textContent = '已支付';
                    
                    // 移除操作按钮（如果存在）
                    const actions = receiptBubble.querySelector('.receipt-actions');
                    if (actions) actions.remove();
                }
            }
            return;
        }
        if (message.content.match(payRejectedRegex) && message.role === 'assistant') {
            const lastPendingPayIndex = character.history.slice().reverse().findIndex(m => m.role === 'user' && /发起了代付请求[：:]/.test(m.content) && m.payStatus !== 'paid' && m.payStatus !== 'rejected');
            if (lastPendingPayIndex !== -1) {
                const actualIndex = character.history.length - 1 - lastPendingPayIndex;
                const payMsg = character.history[actualIndex];
                payMsg.payStatus = 'rejected';
                const receiptBubble = messageArea.querySelector(`.message-wrapper[data-id="${payMsg.id}"] .receipt-bubble`);
                if (receiptBubble) {
                    // 更新底部状态文字
                    const statusSpan = receiptBubble.querySelector('.pay-status-text');
                    if (statusSpan) statusSpan.textContent = '已拒绝';
                    
                    // 移除操作按钮（如果存在）
                    const actions = receiptBubble.querySelector('.receipt-actions');
                    if (actions) actions.remove();
                }
            }
            return;
        }

        // 处理 用户 同意/拒绝 AI 的请求 (虽然按钮点击已经更新了状态，但这里处理指令消息本身的显示逻辑)
        if (message.content.match(userPayAgreedRegex) || message.content.match(userPayRejectedRegex)) {
            // 这条指令消息本身不需要特殊处理，它只是作为聊天记录存在
            // 状态更新已经在 sendPayResponse 中完成了
            // 但如果用户手动输入这条指令，我们也应该尝试更新状态
            if (message.role === 'user') {
                 const isAgreed = !!message.content.match(userPayAgreedRegex);
                 const lastPendingPayIndex = character.history.slice().reverse().findIndex(m => m.role === 'assistant' && /发起了代付请求[：:]/.test(m.content) && !m.payStatus);
                 
                 if (lastPendingPayIndex !== -1) {
                    const actualIndex = character.history.length - 1 - lastPendingPayIndex;
                    const payMsg = character.history[actualIndex];
                    // 只有当状态未设置时才更新，避免覆盖
                    if (!payMsg.payStatus) {
                        payMsg.payStatus = isAgreed ? 'paid' : 'rejected';
                        // 刷新界面
                        renderMessages(false, false);
                    }
                 }
            }
            return;
        }

        if (message.content.match(transferActionRegex) && message.role === 'assistant') {
            const action = message.content.match(transferActionRegex)[1];
            const statusToSet = action === '接收' ? 'received' : 'returned';
            const lastPendingTransferIndex = character.history.slice().reverse().findIndex(m => m.role === 'user' && /给你转账[：:]/.test(m.content) && m.transferStatus === 'pending');
            if (lastPendingTransferIndex !== -1) {
                const actualIndex = character.history.length - 1 - lastPendingTransferIndex;
                const transferMsg = character.history[actualIndex];
                transferMsg.transferStatus = statusToSet;
                if (statusToSet === 'returned' && typeof addPiggyTransaction === 'function') {
                    const amountMatch = transferMsg.content && transferMsg.content.match(/转账[：:]\s*([\d.,]+)\s*元/);
                    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '.')) : 0;
                    if (amount > 0) {
                        addPiggyTransaction({ type: 'income', amount, remark: '转账退回', source: '聊天', charName: character.realName || '' });
                    }
                }
                const transferCardOnScreen = messageArea.querySelector(`.message-wrapper[data-id="${transferMsg.id}"] .transfer-card`);
                if (transferCardOnScreen) {
                    transferCardOnScreen.classList.remove('received', 'returned');
                    transferCardOnScreen.classList.add(statusToSet);
                    const statusElem = transferCardOnScreen.querySelector('.transfer-status');
                    if (statusElem) statusElem.textContent = statusToSet === 'received' ? '已收款' : '已退回';
                }
            }
        }

        const familyCardActionRegex = /\[(.*?)(接收|退还)(.*?)的亲属卡\]/;
        if (message.content.match(familyCardActionRegex) && message.role === 'assistant') {
            const actionMatch = message.content.match(familyCardActionRegex);
            const statusToSet = actionMatch[2] === '接收' ? 'accepted' : 'returned';
            let lastPendingFcIndex = character.history.slice().reverse().findIndex(m => m.role === 'user' && m.familyCardId && m.familyCardStatus === 'pending');
            // WalletSystem 会在后台分支先落库；当前聊天界面仍需要找到刚更新的卡片刷新 DOM。
            if (lastPendingFcIndex === -1 && message.familyCardActionProcessed) {
                lastPendingFcIndex = character.history.slice().reverse().findIndex(m => m.role === 'user' && m.familyCardId && m.familyCardStatus === statusToSet);
            }
            if (lastPendingFcIndex !== -1) {
                const actualIndex = character.history.length - 1 - lastPendingFcIndex;
                const fcMsg = character.history[actualIndex];
                fcMsg.familyCardStatus = statusToSet;
                const fcCardOnScreen = messageArea.querySelector(`.message-wrapper[data-id="${fcMsg.id}"] .family-card-receipt`);
                if (fcCardOnScreen) {
                    fcCardOnScreen.classList.remove('accepted', 'returned');
                    fcCardOnScreen.classList.add(statusToSet);
                    const statusElem = fcCardOnScreen.querySelector('.family-card-status-text');
                    if (statusElem) statusElem.textContent = statusToSet === 'accepted' ? '已接收' : '已退还';
                    const actions = fcCardOnScreen.querySelector('.receipt-actions');
                    if (actions) actions.remove();
                }
            }
        }
        // 用户接收/退还角色发的亲属卡后，更新角色发的亲属卡消息气泡，且不渲染该条状态消息
        const userFamilyCardActionRegex = /\[(.*?)(接收|退还)(.*?)的亲属卡\]/;
        if (message.content.match(userFamilyCardActionRegex) && message.role === 'user') {
            const actionMatch = message.content.match(userFamilyCardActionRegex);
            const statusToSet = actionMatch[2] === '接收' ? 'accepted' : 'returned';
            const lastPendingRfcIndex = character.history.slice().reverse().findIndex(m => m.role === 'assistant' && m.receivedFamilyCardId && m.receivedFamilyCardStatus === 'pending');
            if (lastPendingRfcIndex !== -1) {
                const actualIndex = character.history.length - 1 - lastPendingRfcIndex;
                const rfcMsg = character.history[actualIndex];
                rfcMsg.receivedFamilyCardStatus = statusToSet;
                const fcCardOnScreen = messageArea.querySelector(`.message-wrapper[data-id="${rfcMsg.id}"] .family-card-receipt`);
                if (fcCardOnScreen) {
                    fcCardOnScreen.classList.remove('accepted', 'returned');
                    fcCardOnScreen.classList.add(statusToSet);
                    const statusElem = fcCardOnScreen.querySelector('.family-card-status-text');
                    if (statusElem) statusElem.textContent = statusToSet === 'accepted' ? '已接收' : '已退还';
                    const actions = fcCardOnScreen.querySelector('.receipt-actions');
                    if (actions) actions.remove();
                }
            }
            return;
        } else {
            let isContinuous = false;
            let invisibleRegex;
            if (character.showStatusUpdateMsg) {
                // 修改：正则末尾增加了 |<thinking>[\s\S]*?<\/thinking>
                invisibleRegex = /\[.*?(?:接收|退回).*?的转账\]|\[.*?(?:接收|退还).*?的亲属卡\]|\[.*?(?:冻结|解冻|收回)了亲属卡\]|\[.*?调整亲属卡额度为[：:].*?\]|\[.*?已接收礼物\]|\[.*?同意了.*?的代付请求\]|\[.*?拒绝了.*?的代付请求\]|\[system:.*?\]|\[.*?邀请.*?加入了群聊\]|\[.*?修改群名为：.*?\]|\[system-display:.*?\]|\[.*?拒绝了.*?的(?:视频|语音)通话\]|\[avatar-action:.*?\]|<thinking>[\s\S]*?<\/thinking>|^<thinking>[\s\S]*/;
            } else {
                // 修改：正则末尾增加了 |<thinking>[\s\S]*?<\/thinking>
                invisibleRegex = /\[.*?(?:接收|退回).*?的转账\]|\[.*?(?:接收|退还).*?的亲属卡\]|\[.*?(?:冻结|解冻|收回)了亲属卡\]|\[.*?调整亲属卡额度为[：:].*?\]|\[.*?更新状态为：.*?\]|\[.*?已接收礼物\]|\[.*?同意了.*?的代付请求\]|\[.*?拒绝了.*?的代付请求\]|\[system:.*?\]|\[.*?邀请.*?加入了群聊\]|\[.*?修改群名为：.*?\]|\[system-display:.*?\]|\[.*?拒绝了.*?的(?:视频|语音)通话\]|\[avatar-action:.*?\]|<thinking>[\s\S]*?<\/thinking>|^<thinking>[\s\S]*/;
            }
            const isSystemMsg = /\[system:.*?\]|\[system-display:.*?\]/.test(message.content) || message.type === 'poke';

            if (!isSystemMsg && character.history.length > 1) {
                let prevMsg = null;
                for (let i = character.history.length - 2; i >= 0; i--) {
                    const candidate = character.history[i];
                    if (candidate.type !== 'poke' && !invisibleRegex.test(candidate.content)) {
                        prevMsg = candidate;
                        break;
                    }
                }

                if (prevMsg) {
                    const currentSender = message.role === 'user' ? 'user' : (message.senderId || 'assistant');
                    const prevSender = prevMsg.role === 'user' ? 'user' : (prevMsg.senderId || 'assistant');
                    const timeGap = message.timestamp - prevMsg.timestamp;
                    const isTimeClose = timeGap < 10 * 60 * 1000;

                    if (currentSender === prevSender && isTimeClose) {
                        isContinuous = true;
                    }
                }
            }

            // 标记新消息，允许 NovelAI 自动生图
            if (message.id) _naiAutoGenNewMsgIds.add(message.id);
            const bubbleElement = createMessageBubbleElement(interactiveOriginal || message, isContinuous);
            if (bubbleElement) {
                // Check for timestamp display
                const history = character.history;
                let shouldShowTimestamp = false;
                if (history.length >= 2) {
                    const prevMsg = history[history.length - 2];
                    const timeDiff = message.timestamp - prevMsg.timestamp;
                    const isSameDay = new Date(message.timestamp).toDateString() === new Date(prevMsg.timestamp).toDateString();
                    if (timeDiff > 10 * 60 * 1000 || !isSameDay) {
                        shouldShowTimestamp = true;
                    }
                } else if (history.length === 1) {
                    shouldShowTimestamp = true;
                }

                if (shouldShowTimestamp) {
                    const timeDivider = document.createElement('div');
                    timeDivider.className = 'message-wrapper system-notification time-divider';
                    const timeText = formatTimeDivider(message.timestamp);
                    timeDivider.innerHTML = `<div class="system-notification-bubble" style="background-color: transparent; color: #999; font-size: 12px; padding: 2px 8px;">${timeText}</div>`;
                    messageArea.appendChild(timeDivider);
                }

                appendChatBubble(messageArea, bubbleElement);
                
                // 节点系统：渲染独立摘要
                if (message.nodeSummary) {
                    const summaryText = db.nodeSummaryText || '摘要';
                    const summaryWrapper = document.createElement('div');
                    const roleClass = message.role === 'user' ? 'sent' : 'received';
                    summaryWrapper.className = `message-wrapper system-notification independent-summary-wrapper ${roleClass}`;
                    summaryWrapper.style.margin = '10px 0';
                    
                    const summaryEl = document.createElement('div');
                    summaryEl.className = 'node-summary-container independent-summary';
                    summaryEl.style.maxWidth = '90%';
                    
                    summaryEl.innerHTML = `
                        <div class="node-summary-toggle">
                            <span class="node-summary-star spin">☆</span>
                            <span>${DOMPurify.sanitize(summaryText)}</span>
                        </div>
                        <div class="node-summary-content" style="display:none;">${DOMPurify.sanitize(message.nodeSummary)}</div>
                    `;
                    summaryEl.querySelector('.node-summary-toggle').addEventListener('click', () => {
                        const content = summaryEl.querySelector('.node-summary-content');
                        content.style.display = content.style.display === 'none' ? 'block' : 'none';
                    });
                    
                    summaryWrapper.appendChild(summaryEl);
                    messageArea.appendChild(summaryWrapper);
                }

                messageArea.scrollTop = messageArea.scrollHeight;
            }
        }
    } else { 
        const group = db.groups.find(g => g.id === currentChatId);
        
        // 处理群聊中的转账接收/退回（角色接收用户转账）
        if (message.role === 'assistant') {
            // 检查是否是角色接收/退回转账的消息格式：[角色名接收用户名的转账] 或 [角色名退回用户名的转账]
            const transferActionRegex = /\[(.*?)(接收|退回)(.*?)的转账\]/;
            const actionMatch = message.content.match(transferActionRegex);
            
            if (actionMatch) {
                const receiverName = actionMatch[1].trim();
                const action = actionMatch[2];
                const senderName = actionMatch[3].trim();
                const statusToSet = action === '接收' ? 'received' : 'returned';
                
                // 查找最近的待处理转账消息（用户向角色转账）
                const groupTransferRegex = /\[(.*?)\s*向\s*(.*?)\s*转账：([\d.,]+)元；备注：(.*?)\]/;
                const lastPendingTransferIndex = group.history.slice().reverse().findIndex(m => {
                    if (m.id === message.id) return false; // 排除当前消息
                    const mTransferMatch = m.content.match(groupTransferRegex);
                    if (!mTransferMatch) return false;
                    
                    const mFrom = mTransferMatch[1].trim();
                    const mTo = mTransferMatch[2].trim();
                    
                    // 查找用户向角色转账的待处理消息
                    // 需要匹配：1. 是用户发送的消息 2. 发送者是用户 3. 接收者是角色（通过名称匹配） 4. 状态是pending
                    const isUserMessage = m.role === 'user' && m.senderId === 'user_me';
                    const isFromUser = mFrom === group.me.nickname;
                    
                    // 检查接收者名称是否匹配角色名（支持 realName 和 groupNickname）
                    const isToReceiver = group.members.some(mem => {
                        const memRealName = (mem.realName || '').trim();
                        const memGroupNickname = (mem.groupNickname || '').trim();
                        const toName = (mTo || '').trim();
                        const receiverNameTrimmed = (receiverName || '').trim();
                        
                        // 转账消息中的接收者名称匹配角色的 realName 或 groupNickname
                        const toMatchesChar = (toName === memRealName || toName === memGroupNickname);
                        // 接收转账消息中的角色名匹配角色的 realName 或 groupNickname
                        const receiverMatchesChar = (receiverNameTrimmed === memRealName || receiverNameTrimmed === memGroupNickname);
                        
                        return toMatchesChar && receiverMatchesChar;
                    });
                    
                    const isPending = m.transferStatus === 'pending';
                    
                    return isUserMessage && isFromUser && isToReceiver && isPending;
                });
                
                if (lastPendingTransferIndex !== -1) {
                    const actualIndex = group.history.length - 1 - lastPendingTransferIndex;
                    const transferMsg = group.history[actualIndex];
                    transferMsg.transferStatus = statusToSet;
                    
                    // 如果是退回，需要更新存钱罐（退回给用户）
                    if (statusToSet === 'returned' && typeof addPiggyTransaction === 'function') {
                        const amountMatch = transferMsg.content && transferMsg.content.match(/转账[：:]\s*([\d.,]+)\s*元/);
                        const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '.')) : 0;
                        if (amount > 0) {
                            addPiggyTransaction({ 
                                type: 'income', 
                                amount, 
                                remark: '转账退回', 
                                source: '聊天', 
                                charName: receiverName || '' 
                            });
                        }
                    }
                    
                    // 更新界面上的转账卡片
                    const transferCardOnScreen = messageArea.querySelector(`.message-wrapper[data-id="${transferMsg.id}"] .transfer-card`);
                    if (transferCardOnScreen) {
                        transferCardOnScreen.classList.remove('received', 'returned');
                        transferCardOnScreen.classList.add(statusToSet);
                        const statusElem = transferCardOnScreen.querySelector('.transfer-status');
                        if (statusElem) statusElem.textContent = statusToSet === 'received' ? '已收款' : '已退回';
                        transferCardOnScreen.style.cursor = 'default';
                    }
                }
                // 转账指令消息本身不渲染为可见气泡，直接返回
                return;
            }
        }
        
        let isContinuous = false;
        let invisibleRegex;
        if (group.showStatusUpdateMsg) {
            // 修改：正则末尾增加了 |<thinking>[\s\S]*?<\/thinking>
            invisibleRegex = /\[.*?(?:接收|退回).*?的转账\]|\[.*?已接收礼物\]|\[system:.*?\]|\[.*?邀请.*?加入了群聊\]|\[.*?修改群名为：.*?\]|\[system-display:.*?\]|\[.*?拒绝了.*?的(?:视频|语音)通话\]|\[avatar-action:.*?\]|<thinking>[\s\S]*?<\/thinking>|^<thinking>[\s\S]*/;
        } else {
            // 修改：正则末尾增加了 |<thinking>[\s\S]*?<\/thinking>
            invisibleRegex = /\[.*?(?:接收|退回).*?的转账\]|\[.*?更新状态为：.*?\]|\[.*?已接收礼物\]|\[system:.*?\]|\[.*?邀请.*?加入了群聊\]|\[.*?修改群名为：.*?\]|\[system-display:.*?\]|\[.*?拒绝了.*?的(?:视频|语音)通话\]|\[avatar-action:.*?\]|<thinking>[\s\S]*?<\/thinking>|^<thinking>[\s\S]*/;
        }
        const isSystemMsg = /\[system:.*?\]|\[system-display:.*?\]/.test(message.content) || message.type === 'poke';

        if (!isSystemMsg && group.history.length > 1) {
            let prevMsg = null;
            for (let i = group.history.length - 2; i >= 0; i--) {
                const candidate = group.history[i];
            if (candidate.type !== 'poke' && !invisibleRegex.test(candidate.content)) {
                    prevMsg = candidate;
                    break;
                }
            }

            if (prevMsg) {
                const currentSender = message.role === 'user' ? 'user' : (message.senderId || 'assistant');
                const prevSender = prevMsg.role === 'user' ? 'user' : (prevMsg.senderId || 'assistant');
                const timeGap = message.timestamp - prevMsg.timestamp;
                const isTimeClose = timeGap < 10 * 60 * 1000;

                if (currentSender === prevSender && isTimeClose) {
                    isContinuous = true;
                }
            }
        }

        // 标记新消息，允许 NovelAI 自动生图
        if (message.id) _naiAutoGenNewMsgIds.add(message.id);
        const bubbleElement = createMessageBubbleElement(interactiveOriginal || message, isContinuous);
        if (bubbleElement) {
            // Check for timestamp display
            const history = group.history;
            let shouldShowTimestamp = false;
            if (history.length >= 2) {
                const prevMsg = history[history.length - 2];
                const timeDiff = message.timestamp - prevMsg.timestamp;
                const isSameDay = new Date(message.timestamp).toDateString() === new Date(prevMsg.timestamp).toDateString();
                if (timeDiff > 10 * 60 * 1000 || !isSameDay) {
                    shouldShowTimestamp = true;
                }
            } else if (history.length === 1) {
                shouldShowTimestamp = true;
            }

            if (shouldShowTimestamp) {
                const timeDivider = document.createElement('div');
                timeDivider.className = 'message-wrapper system-notification time-divider';
                const timeText = formatTimeDivider(message.timestamp);
                timeDivider.innerHTML = `<div class="system-notification-bubble" style="background-color: transparent; color: #999; font-size: 12px; padding: 2px 8px;">${timeText}</div>`;
                messageArea.appendChild(timeDivider);
            }

            messageArea.appendChild(bubbleElement);
            
            // 节点系统：渲染独立摘要
            if (message.nodeSummary) {
                const summaryText = db.nodeSummaryText || '摘要';
                const summaryWrapper = document.createElement('div');
                const roleClass = message.role === 'user' ? 'sent' : 'received';
                summaryWrapper.className = `message-wrapper system-notification independent-summary-wrapper ${roleClass}`;
                summaryWrapper.style.margin = '10px 0';
                
                const summaryEl = document.createElement('div');
                summaryEl.className = 'node-summary-container independent-summary';
                summaryEl.style.maxWidth = '90%';
                
                summaryEl.innerHTML = `
                    <div class="node-summary-toggle">
                        <span class="node-summary-star spin">☆</span>
                        <span>${DOMPurify.sanitize(summaryText)}</span>
                    </div>
                    <div class="node-summary-content" style="display:none;">${DOMPurify.sanitize(message.nodeSummary)}</div>
                `;
                summaryEl.querySelector('.node-summary-toggle').addEventListener('click', () => {
                    const content = summaryEl.querySelector('.node-summary-content');
                    content.style.display = content.style.display === 'none' ? 'block' : 'none';
                });
                
                summaryWrapper.appendChild(summaryEl);
                messageArea.appendChild(summaryWrapper);
            }

            messageArea.scrollTop = messageArea.scrollHeight;
        }
    }
}

// --- 【新增】解绑后的后台静默生图任务系统 ---
