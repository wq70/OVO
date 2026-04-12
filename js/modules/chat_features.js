// --- 聊天辅助功能模块 ---

// 辅助功能
function setupVoiceMessageSystem() {
    const voiceMessageBtn = document.getElementById('voice-message-btn');
    const sendVoiceForm = document.getElementById('send-voice-form');
    const sendVoiceModal = document.getElementById('send-voice-modal');
    const voiceDurationPreview = document.getElementById('voice-duration-preview');
    const voiceTextInput = document.getElementById('voice-text-input');

    voiceMessageBtn.addEventListener('click', () => {
        sendVoiceForm.reset();
        voiceDurationPreview.textContent = '0"';
        sendVoiceModal.classList.add('visible');
    });
    sendVoiceForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendMyVoiceMessage(voiceTextInput.value.trim());
    });
}

function sendMyVoiceMessage(text) {
    if (!text) return;
    document.getElementById('send-voice-modal').classList.remove('visible');
    setTimeout(() => {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        const myName = (currentChatType === 'private') ? chat.myName : chat.me.nickname;
        const content = `[${myName}的语音：${text}]`;
        const message = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: content,
            parts: [{type: 'text', text: content}],
            timestamp: Date.now()
        };
        if (currentChatType === 'group') {
            message.senderId = 'user_me';
        }
        chat.history.push(message);
        addMessageBubble(message, currentChatId, currentChatType);
        saveData();
        renderChatList();
    }, 100);
}

function setupPhotoVideoSystem() {
    const photoVideoBtn = document.getElementById('photo-video-btn');
    const sendPvForm = document.getElementById('send-pv-form');
    const sendPvModal = document.getElementById('send-pv-modal');
    const pvTextInput = document.getElementById('pv-text-input');

    photoVideoBtn.addEventListener('click', () => {
        sendPvForm.reset();
        sendPvModal.classList.add('visible');
    });
    sendPvForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendMyPhotoVideo(pvTextInput.value.trim());
    });
}

function sendMyPhotoVideo(text) {
    if (!text) return;
    document.getElementById('send-pv-modal').classList.remove('visible');
    setTimeout(() => {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        const myName = (currentChatType === 'private') ? chat.myName : chat.me.nickname;
        const content = `[${myName}发来的照片\/视频：${text}]`;
        const message = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: content,
            parts: [{type: 'text', text: content}],
            timestamp: Date.now()
        };
        if (currentChatType === 'group') {
            message.senderId = 'user_me';
        }
        chat.history.push(message);
        addMessageBubble(message, currentChatId, currentChatType);
        saveData();
        renderChatList();
    }, 100);
}

function setupImageRecognition() {
    const imageRecognitionBtn = document.getElementById('image-recognition-btn');
    const imageUploadInput = document.getElementById('image-upload-input');

    imageRecognitionBtn.addEventListener('click', () => {
        imageUploadInput.click();
    });
    imageUploadInput.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        const opts = { quality: 0.8, maxWidth: 1024, maxHeight: 1024 };
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                try {
                    const compressedUrl = await compressImage(file, opts);
                    sendImageForRecognition(compressedUrl);
                } catch (err) {
                    console.error('Image compression failed:', err);
                    showToast(`第 ${i + 1} 张图片处理失败，请重试`);
                }
            }
            if (files.length > 1) {
                showToast(`已发送 ${files.length} 张图片`);
            }
        } finally {
            e.target.value = null;
        }
    });
}

function setupCameraCapture() {
    const cameraCaptureBtn = document.getElementById('camera-capture-btn');
    const cameraUploadInput = document.getElementById('camera-upload-input');
    if (!cameraCaptureBtn || !cameraUploadInput) return;

    cameraCaptureBtn.addEventListener('click', () => {
        cameraUploadInput.click();
    });
    cameraUploadInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                const compressedUrl = await compressImage(file, {
                    quality: 0.8,
                    maxWidth: 1024,
                    maxHeight: 1024
                });
                sendImageForRecognition(compressedUrl);
            } catch (error) {
                console.error('Image compression failed:', error);
                showToast('图片处理失败，请重试');
            } finally {
                e.target.value = null;
            }
        }
    });
}

async function sendImageForRecognition(base64Data) {
    if (!base64Data || isGenerating) return;
    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    const myName = (currentChatType === 'private') ? chat.myName : chat.me.nickname;
    const textPrompt = `[${myName}发来了一张图片：]`;
    const message = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content: base64Data,
        parts: [{type: 'text', text: textPrompt}, {type: 'image', data: base64Data}],
        timestamp: Date.now(),
    };
    if (currentChatType === 'group') {
        message.senderId = 'user_me';
    }
    chat.history.push(message);
    addMessageBubble(message, currentChatId, currentChatType);
    await saveData();
    renderChatList();
}

function setupWalletSystem() {
    const walletBtn = document.getElementById('wallet-btn');
    const sendTransferForm = document.getElementById('send-transfer-form');
    const sendTransferModal = document.getElementById('send-transfer-modal');
    const transferAmountInput = document.getElementById('transfer-amount-input');
    const transferRemarkInput = document.getElementById('transfer-remark-input');
    const acceptTransferBtn = document.getElementById('accept-transfer-btn');
    const returnTransferBtn = document.getElementById('return-transfer-btn');

    walletBtn.addEventListener('click', () => {
        if (currentChatType === 'private') {
            sendTransferForm.reset();
            const methodList = document.getElementById('transfer-payment-methods');
            if (methodList) {
                const balance = typeof getPiggyBalance === 'function' ? getPiggyBalance() : 520;
                let html = '<label class="payment-method-item"><input type="radio" name="transfer-pay-method" value="balance" checked><span class="pm-name">余额</span><span class="pm-balance">' + balance + '</span></label>';
                const received = (db.piggyBank && db.piggyBank.receivedFamilyCards) ? db.piggyBank.receivedFamilyCards.filter(c => c.status === 'active') : [];
                if (received.length > 0) {
                    html += '<div class="fc-payment-section">';
                    html += '<div class="fc-payment-header" onclick="this.parentElement.classList.toggle(\'expanded\')"><span>亲属卡 (' + received.length + '张)</span><span class="fc-toggle-arrow">▶</span></div>';
                    html += '<div class="fc-payment-cards">';
                    received.forEach(c => {
                        const remaining = Math.max(0, c.limit - (c.usedAmount || 0));
                        html += '<label class="payment-method-item"><input type="radio" name="transfer-pay-method" value="' + c.id + '"><span class="pm-name">' + (c.fromCharName || '') + '的亲属卡</span><span class="pm-balance">剩余 ' + remaining + '</span></label>';
                    });
                    html += '</div></div>';
                }
                methodList.innerHTML = html;
            }
            sendTransferModal.classList.add('visible');
        } else if (currentChatType === 'group') {
            // currentGroupAction 应该在 group_chat.js 或全局定义
            if (typeof currentGroupAction !== 'undefined') {
                currentGroupAction.type = 'transfer';
            }
            renderGroupRecipientSelectionList('转账给');
            document.getElementById('group-recipient-selection-modal').classList.add('visible');
        }
    });
    sendTransferForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const amountStr = (transferAmountInput.value || '').trim().replace(',', '.');
        const amount = parseFloat(amountStr);
        const remark = transferRemarkInput.value.trim();
        if (isNaN(amount) || amount <= 0) {
            showToast('请输入有效的金额');
            return;
        }
        let totalDeduct = amount;
        if (currentChatType === 'group' && typeof currentGroupAction !== 'undefined' && currentGroupAction.recipients && currentGroupAction.recipients.length > 1) {
            totalDeduct = amount * currentGroupAction.recipients.length;
        }
        const payMethodRadio = document.querySelector('input[name="transfer-pay-method"]:checked');
        const payMethod = payMethodRadio ? payMethodRadio.value : 'balance';
        if (payMethod !== 'balance' && db.piggyBank && db.piggyBank.receivedFamilyCards) {
            const card = db.piggyBank.receivedFamilyCards.find(c => c.id === payMethod);
            if (card && card.status === 'active') {
                const remaining = card.limit - (card.usedAmount || 0);
                if (remaining < totalDeduct) {
                    showToast('亲属卡额度不足');
                    return;
                }
            } else {
                showToast('请选择有效的支付方式');
                return;
            }
        }
        if (typeof getPiggyBalance === 'function' && getPiggyBalance() < totalDeduct) {
            showToast('存钱罐余额不足，无法转账');
            return;
        }
        if (payMethod !== 'balance' && db.piggyBank && db.piggyBank.receivedFamilyCards) {
            const card = db.piggyBank.receivedFamilyCards.find(c => c.id === payMethod);
            if (card) {
                card.usedAmount = (card.usedAmount || 0) + totalDeduct;
                if (!card.transactions) card.transactions = [];
                const chat = currentChatType === 'private' ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
                const toName = currentChatType === 'private' ? (chat && chat.realName) : (currentGroupAction && currentGroupAction.recipients && currentGroupAction.recipients.length ? (chat.members || []).map(m => m.realName).filter(Boolean).join('、') : '');
                card.transactions.unshift({ id: 'rfct_' + Date.now(), amount: totalDeduct, scene: '转账', detail: remark || '转账', targetName: toName || '', time: Date.now() });
            }
        }
        if (typeof addPiggyTransaction === 'function') {
            const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
            let toName = '';
            if (currentChatType === 'private') {
                toName = chat && chat.realName;
            } else {
                // 群聊中，获取所有接收转账的角色名称
                if (typeof currentGroupAction !== 'undefined' && currentGroupAction.recipients && currentGroupAction.recipients.length > 0) {
                    const recipientNames = currentGroupAction.recipients.map(recipientId => {
                        const recipient = chat.members.find(m => m.id === recipientId);
                        return recipient ? (recipient.realName || recipient.groupNickname || '') : '';
                    }).filter(name => name).join('、');
                    toName = recipientNames || '';
                } else {
                    toName = chat && chat.me && chat.me.nickname;
                }
            }
            addPiggyTransaction({ type: 'expense', amount: totalDeduct, remark: remark || '转账', source: '转账', charName: toName || '' });
        }
        sendMyTransfer(amountStr, remark);
    });
    acceptTransferBtn.addEventListener('click', () => respondToTransfer('received'));
    returnTransferBtn.addEventListener('click', () => respondToTransfer('returned'));
}

function sendMyTransfer(amount, remark) {
    document.getElementById('send-transfer-modal').classList.remove('visible');
    setTimeout(() => {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (currentChatType === 'private') {
            const content = `[${chat.myName}给你转账：${amount}元；备注：${remark}]`;
            const message = {
                id: `msg_${Date.now()}`,
                role: 'user',
                content: content,
                parts: [{type: 'text', text: content}],
                timestamp: Date.now(),
                transferStatus: 'pending'
            };
            chat.history.push(message);
            addMessageBubble(message, currentChatId, currentChatType);
        } else { 
            if (typeof currentGroupAction !== 'undefined' && currentGroupAction.recipients) {
                currentGroupAction.recipients.forEach(recipientId => {
                    const recipient = chat.members.find(m => m.id === recipientId);
                    if (recipient) {
                        const content = `[${chat.me.nickname} 向 ${recipient.realName} 转账：${amount}元；备注：${remark}]`;
                        const message = {
                            id: `msg_${Date.now()}_${recipientId}`,
                            role: 'user',
                            content: content,
                            parts: [{type: 'text', text: content}],
                            timestamp: Date.now(),
                            senderId: 'user_me',
                            transferStatus: 'pending'
                        };
                        chat.history.push(message);
                        addMessageBubble(message, currentChatId, currentChatType);
                    }
                });
            }
        }
        saveData();
        renderChatList();
    }, 100);
}

function handleReceivedTransferClick(messageId) {
    currentTransferMessageId = messageId;
    document.getElementById('receive-transfer-actionsheet').classList.add('visible');
}

function parseTransferAmountFromContent(content) {
    if (!content || typeof content !== 'string') return 0;
    const m = content.match(/转账[：:]\s*([\d.,]+)\s*元/);
    return m ? parseFloat(m[1].replace(/,/g, '.')) || 0 : 0;
}

async function respondToTransfer(action) {
    if (!currentTransferMessageId) return;
    
    if (currentChatType === 'private') {
        const character = db.characters.find(c => c.id === currentChatId);
        const message = character.history.find(m => m.id === currentTransferMessageId);
        if (message) {
            message.transferStatus = action;
            const cardOnScreen = messageArea.querySelector(`.message-wrapper[data-id="${currentTransferMessageId}"] .transfer-card`);
            if (cardOnScreen) {
                cardOnScreen.classList.remove('received', 'returned');
                cardOnScreen.classList.add(action);
                cardOnScreen.querySelector('.transfer-status').textContent = action === 'received' ? '已收款' : '已退回';
                cardOnScreen.style.cursor = 'default';
            }
            if (typeof addPiggyTransaction === 'function' && action === 'received') {
                const amount = parseTransferAmountFromContent(message.content);
                if (amount > 0) {
                    addPiggyTransaction({
                        type: 'income',
                        amount,
                        remark: '收款',
                        source: '聊天',
                        charName: character.realName || ''
                    });
                }
            }
            let contextMessageContent = (action === 'received') ? `[${character.myName}接收${character.realName}的转账]` : `[${character.myName}退回${character.realName}的转账]`;
            const contextMessage = {
                id: `msg_${Date.now()}`,
                role: 'user',
                content: contextMessageContent,
                parts: [{type: 'text', text: contextMessageContent}],
                timestamp: Date.now()
            };
            character.history.push(contextMessage);
            await saveData();
            renderChatList();
        }
    } else if (currentChatType === 'group') {
        const group = db.groups.find(g => g.id === currentChatId);
        const message = group.history.find(m => m.id === currentTransferMessageId);
        if (message) {
            message.transferStatus = action;
            const cardOnScreen = messageArea.querySelector(`.message-wrapper[data-id="${currentTransferMessageId}"] .transfer-card`);
            if (cardOnScreen) {
                cardOnScreen.classList.remove('received', 'returned');
                cardOnScreen.classList.add(action);
                cardOnScreen.querySelector('.transfer-status').textContent = action === 'received' ? '已收款' : '已退回';
                cardOnScreen.style.cursor = 'default';
            }
            
            // 解析转账信息（只处理用户接收角色转账的情况）
            const groupTransferRegex = /\[(.*?)\s*向\s*(.*?)\s*转账[：:]([\d.,]+)元[；;]备注[：:](.*?)\]/;
            const transferMatch = message.content.match(groupTransferRegex);
            if (transferMatch) {
                const from = transferMatch[1];
                const to = transferMatch[2];
                const amount = parseTransferAmountFromContent(message.content);
                const myName = group.me.nickname;
                
                // 只处理角色向用户转账的情况（用户接收角色转账）
                if (message.role === 'assistant' && to === myName) {
                    if (typeof addPiggyTransaction === 'function' && action === 'received' && amount > 0) {
                        // 用户接收角色转账
                        const sender = group.members.find(m => (m.realName === from || m.groupNickname === from));
                        addPiggyTransaction({
                            type: 'income',
                            amount,
                            remark: '收款',
                            source: '聊天',
                            charName: sender ? (sender.realName || '') : ''
                        });
                    }
                    
                    // 创建上下文消息
                    const contextMessageContent = (action === 'received') 
                        ? `[${myName}接收${from}的转账]` 
                        : `[${myName}退回${from}的转账]`;
                    const contextMessage = {
                        id: `msg_${Date.now()}`,
                        role: 'user',
                        content: contextMessageContent,
                        parts: [{type: 'text', text: contextMessageContent}],
                        timestamp: Date.now(),
                        senderId: 'user_me'
                    };
                    group.history.push(contextMessage);
                }
            }
            
            await saveData();
            renderChatList();
        }
    }
    
    document.getElementById('receive-transfer-actionsheet').classList.remove('visible');
    currentTransferMessageId = null;
}

/**
 * 用户接收/退还角色发的亲属卡（私聊）
 * @param {string} msgId - 角色发送亲属卡的那条消息的 id
 * @param {'accept'|'return'} action
 */
window.sendFamilyCardResponse = async function(msgId, action) {
    if (currentChatType !== 'private') return;
    const character = db.characters.find(c => c.id === currentChatId);
    if (!character) return;
    const message = character.history.find(m => m.id === msgId);
    if (!message || !message.receivedFamilyCardId || message.receivedFamilyCardStatus !== 'pending') return;

    const statusToSet = action === 'accept' ? 'accepted' : 'returned';
    message.receivedFamilyCardStatus = statusToSet;

    if (action === 'return' && db.piggyBank && db.piggyBank.receivedFamilyCards) {
        const card = db.piggyBank.receivedFamilyCards.find(c => c.id === message.receivedFamilyCardId);
        if (card) card.status = 'returned';
    }

    const fcCardOnScreen = messageArea.querySelector(`.message-wrapper[data-id="${msgId}"] .family-card-receipt`);
    if (fcCardOnScreen) {
        fcCardOnScreen.classList.remove('accepted', 'returned');
        fcCardOnScreen.classList.add(statusToSet);
        const statusElem = fcCardOnScreen.querySelector('.family-card-status-text');
        if (statusElem) statusElem.textContent = statusToSet === 'accepted' ? '已接收' : '已退还';
        const actions = fcCardOnScreen.querySelector('.receipt-actions');
        if (actions) actions.remove();
    }

    const verb = action === 'accept' ? '接收' : '退还';
    const contextMessageContent = `[${character.myName}${verb}${character.realName}的亲属卡]`;
    const contextMessage = {
        id: 'msg_' + Date.now(),
        role: 'user',
        content: contextMessageContent,
        parts: [{ type: 'text', text: contextMessageContent }],
        timestamp: Date.now()
    };
    character.history.push(contextMessage);
    if (typeof addMessageBubble === 'function') addMessageBubble(contextMessage, currentChatId, currentChatType);
    if (typeof saveData === 'function') await saveData();
    if (typeof renderChatList === 'function') renderChatList();
};

function setupGiftSystem() {
    const giftBtn = document.getElementById('gift-btn');
    const sendGiftForm = document.getElementById('send-gift-form');
    const sendGiftModal = document.getElementById('send-gift-modal');
    const giftDescriptionInput = document.getElementById('gift-description-input');

    giftBtn.addEventListener('click', () => {
        if (currentChatType === 'private') {
            sendGiftForm.reset();
            sendGiftModal.classList.add('visible');
        } else if (currentChatType === 'group') {
            if (typeof currentGroupAction !== 'undefined') {
                currentGroupAction.type = 'gift';
            }
            renderGroupRecipientSelectionList('送礼物给');
            document.getElementById('group-recipient-selection-modal').classList.add('visible');
        }
    });
    sendGiftForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendMyGift(giftDescriptionInput.value.trim());
    });
}

function sendMyGift(description) {
    if (!description) return;
    document.getElementById('send-gift-modal').classList.remove('visible');
    setTimeout(() => {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);

        if (currentChatType === 'private') {
            const content = `[${chat.myName}送来的礼物：${description}]`;
            const message = {
                id: `msg_${Date.now()}`,
                role: 'user',
                content: content,
                parts: [{type: 'text', text: content}],
                timestamp: Date.now(),
                giftStatus: 'sent'
            };
            chat.history.push(message);
            addMessageBubble(message, currentChatId, currentChatType);
        } else { 
            if (typeof currentGroupAction !== 'undefined' && currentGroupAction.recipients) {
                currentGroupAction.recipients.forEach(recipientId => {
                    const recipient = chat.members.find(m => m.id === recipientId);
                    if (recipient) {
                        const content = `[${chat.me.nickname} 向 ${recipient.realName} 送来了礼物：${description}]`;
                        const message = {
                            id: `msg_${Date.now()}_${recipientId}`,
                            role: 'user',
                            content: content,
                            parts: [{type: 'text', text: content}],
                            timestamp: Date.now(),
                            senderId: 'user_me'
                        };
                        chat.history.push(message);
                        addMessageBubble(message, currentChatId, currentChatType);
                    }
                });
            }
        }
        saveData();
        renderChatList();
    }, 100);
}

function setupLocationSystem() {
    const locationBtn = document.getElementById('location-btn');
    const sendLocationModal = document.getElementById('send-location-modal');
    const sendLocationForm = document.getElementById('send-location-form');
    const locationPlaceInput = document.getElementById('location-place-input');
    const locationDistanceInput = document.getElementById('location-distance-input');
    const locationUnitSelect = document.getElementById('location-unit-select');

    if (!locationBtn || !sendLocationForm) return;

    locationBtn.addEventListener('click', () => {
        sendLocationForm.reset();
        sendLocationModal.classList.add('visible');
    });
    sendLocationModal.addEventListener('click', (e) => {
        if (e.target === sendLocationModal) sendLocationModal.classList.remove('visible');
    });
    sendLocationForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const place = (locationPlaceInput.value || '').trim();
        if (!place) {
            if (typeof showToast === 'function') showToast('请输入当前位置');
            return;
        }
        const distanceNum = (locationDistanceInput.value || '').trim();
        const unit = (locationUnitSelect && locationUnitSelect.value) || '千米';
        let content = `[我的位置：${place}`;
        if (distanceNum && !isNaN(parseFloat(distanceNum))) {
            content += `；距你约 ${distanceNum}${unit}`;
        }
        content += ']';
        sendMyLocation(content);
    });
}

function sendMyLocation(content) {
    document.getElementById('send-location-modal').classList.remove('visible');
    setTimeout(() => {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (!chat) return;
        const message = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: content,
            parts: [{ type: 'text', text: content }],
            timestamp: Date.now()
        };
        if (currentChatType === 'group') {
            message.senderId = 'user_me';
        }
        chat.history.push(message);
        addMessageBubble(message, currentChatId, currentChatType);
        saveData();
        renderChatList();
    }, 100);
}

function setupTimeSkipSystem() {
    const timeSkipBtn = document.getElementById('time-skip-btn');
    const timeSkipModal = document.getElementById('time-skip-modal');
    const timeSkipForm = document.getElementById('time-skip-form');
    const timeSkipInput = document.getElementById('time-skip-input');

    timeSkipBtn.addEventListener('click', () => {
        timeSkipForm.reset();
        timeSkipModal.classList.add('visible');
    });
    timeSkipModal.addEventListener('click', (e) => {
        if (e.target === timeSkipModal) timeSkipModal.classList.remove('visible');
    });
    timeSkipForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendTimeSkipMessage(timeSkipInput.value.trim());
    });
}

async function sendTimeSkipMessage(text) {
    if (!text) return;
    document.getElementById('time-skip-modal').classList.remove('visible');
    await new Promise(resolve => setTimeout(resolve, 100));
    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    if (!chat) return;

    const visualMessage = {
        id: `msg_visual_${Date.now()}`,
        role: 'system',
        content: `[system-display:${text}]`,
        parts: [],
        timestamp: Date.now()
    };
    const contextMessage = {
        id: `msg_context_${Date.now()}`,
        role: 'user',
        content: `[system: ${text}]`,
        parts: [{type: 'text', text: `[system: ${text}]`}],
        timestamp: Date.now()
    };
    if (currentChatType === 'group') {
        contextMessage.senderId = 'user_me';
        visualMessage.senderId = 'user_me';
    }

    chat.history.push(visualMessage, contextMessage);
    addMessageBubble(visualMessage, currentChatId, currentChatType);
    await saveData();
    renderChatList();
}

const AudioManager = {
    _audio: null,
    
    get audio() {
        if (!this._audio) {
            this._audio = new Audio();
            this._audio.addEventListener('ended', () => {
                if (typeof window.resumeMusicPlayback === 'function') {
                    window.resumeMusicPlayback();
                }
            });
            this._audio.addEventListener('error', (e) => {
                console.warn('Audio Object Error:', e);
            });
        }
        return this._audio;
    },

    play(source) {
        if (!source) return;
        const a = this.audio;
        
        // 如果当前正在播放且源相同，可以重置进度（打断重播）
        // 如果源不同，直接切换
        try {
            a.src = source;
            a.volume = 1.0; 
            a.currentTime = 0;
            
            const p = a.play();
            if (p && typeof p.catch === 'function') {
                p.catch(e => {
                    // 忽略 AbortError (被新的播放打断是正常的)
                    if (e.name !== 'AbortError') {
                        console.warn('播放提示音失败:', e);
                    }
                });
            }
        } catch (e) {
            console.warn('音频播放异常:', e);
        }
    },

    // 预热/解锁音频对象（用于在没有发送音效时获取播放权限）
    unlock() {
        if (db.globalReceiveSound) {
            const a = this.audio;
            // 记录当前状态
            const originalSrc = a.src;
            
            // 切换到接收音效进行预热
            if (!a.src || a.src !== db.globalReceiveSound) {
                 a.src = db.globalReceiveSound;
            }
            
            a.volume = 0; // 静音
            const p = a.play();
            if (p) {
                p.then(() => {
                    a.pause();
                    a.currentTime = 0;
                    a.volume = 1; 
                }).catch(e => {
                    // 预热失败也不影响流程
                    a.volume = 1;
                });
            }
        }
    }
};

function playSound(source) {
    AudioManager.play(source);
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupCameraCapture);
    } else {
        setupCameraCapture();
    }
}
