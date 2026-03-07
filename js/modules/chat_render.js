// --- 消息渲染模块 ---

// NovelAI 自动生图队列（避免同时发出大量请求）
const _naiAutoGenQueue = [];
let _naiAutoGenRunning = false;
// 标记：仅新消息触发自动生图，历史消息加载时不触发
let _naiAutoGenNewMsgIds = new Set();
async function _naiAutoGenProcess() {
    if (_naiAutoGenRunning) return;
    _naiAutoGenRunning = true;
    while (_naiAutoGenQueue.length > 0) {
        const task = _naiAutoGenQueue.shift();
        try {
            await task();
        } catch (e) {
            console.error('[NovelAI AutoGen Queue] 任务出错:', e);
        }
    }
    _naiAutoGenRunning = false;
}

// 根据时间戳格式设置生成时间字符串
function formatTimestampByFormat(timestamp, chat) {
    const d = new Date(timestamp);
    const fmt = chat.timestampFormat || 'hm';
    if (fmt === 'hms') {
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
    if (fmt === 'ymd') {
        return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
    }
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderMessages(isLoadMore = false, forceScrollToBottom = false) {
    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    if (!chat || !chat.history) return;
    const oldScrollHeight = messageArea.scrollHeight;
    const totalMessages = chat.history.length;
    
    // 确保 MESSAGES_PER_PAGE 存在
    const pageSize = (typeof MESSAGES_PER_PAGE !== 'undefined') ? MESSAGES_PER_PAGE : 20;

    const end = totalMessages - (currentPage - 1) * pageSize;
    const start = Math.max(0, end - pageSize);
    const messagesToRender = chat.history.slice(start, end);
    if (!isLoadMore) messageArea.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    let lastMsgTime = 0;
    
    if (start > 0) {
        lastMsgTime = chat.history[start - 1].timestamp;
    }

    messagesToRender.forEach((msg, index) => {
        const currentMsgTime = msg.timestamp;
        const timeDiff = currentMsgTime - lastMsgTime;
        const isSameDay = new Date(currentMsgTime).toDateString() === new Date(lastMsgTime).toDateString();
        
        if (timeDiff > 10 * 60 * 1000 || !isSameDay || lastMsgTime === 0) {
            const timeDivider = document.createElement('div');
            timeDivider.className = 'message-wrapper system-notification time-divider'; 
            
            const timeText = formatTimeDivider(currentMsgTime);
            
            timeDivider.innerHTML = `<div class="system-notification-bubble" style="background-color: transparent; color: #999; font-size: 12px; padding: 2px 8px;">${timeText}</div>`;
            fragment.appendChild(timeDivider);
        }
        lastMsgTime = currentMsgTime;

        let isContinuous = false;
        
        let invisibleRegex;
        if (chat.showStatusUpdateMsg) {
            // 在末尾添加 |<thinking>[\s\S]*?<\/thinking>
            invisibleRegex = /\[.*?(?:接收|退回).*?的转账\]|\[.*?已接收礼物\]|\[system:.*?\]|\[.*?邀请.*?加入了群聊\]|\[.*?修改群名为：.*?\]|\[system-display:.*?\]|\[.*?同意了.*?的代付请求\]|\[.*?拒绝了.*?的代付请求\]|<thinking>[\s\S]*?<\/thinking>|^<thinking>[\s\S]*/;
        } else {
            // 在末尾添加 |<thinking>[\s\S]*?<\/thinking>
            invisibleRegex = /\[.*?(?:接收|退回).*?的转账\]|\[.*?更新状态为：.*?\]|\[.*?已接收礼物\]|\[system:.*?\]|\[.*?邀请.*?加入了群聊\]|\[.*?修改群名为：.*?\]|\[system-display:.*?\]|\[.*?同意了.*?的代付请求\]|\[.*?拒绝了.*?的代付请求\]|<thinking>[\s\S]*?<\/thinking>|^<thinking>[\s\S]*/;
        }

        const isSystemMsg = /\[system:.*?\]|\[system-display:.*?\]/.test(msg.content);
        
        if (!isSystemMsg) {
            let prevMsg = null;
            let currentIndexInHistory = start + index;
            
            for (let i = currentIndexInHistory - 1; i >= 0; i--) {
                const candidate = chat.history[i];
                // 跳过隐藏的上下文消息（如角色自知消息），不影响连续消息判断
                if (candidate.hiddenFromDisplay) continue;
                if (!invisibleRegex.test(candidate.content)) {
                    prevMsg = candidate;
                    break;
                }
            }

            if (prevMsg) {
                const currentSender = msg.role === 'user' ? 'user' : (msg.senderId || 'assistant');
                const prevSender = prevMsg.role === 'user' ? 'user' : (prevMsg.senderId || 'assistant');
                
                const timeGap = msg.timestamp - prevMsg.timestamp;
                const isTimeClose = timeGap < 10 * 60 * 1000;

                if (currentSender === prevSender && isTimeClose) {
                    isContinuous = true;
                }
            }
        }

        const bubble = createMessageBubbleElement(msg, isContinuous);
        if (bubble) fragment.appendChild(bubble);
    });
    const existingLoadBtn = document.getElementById('load-more-btn');
    if (existingLoadBtn) existingLoadBtn.remove();
    const existingLoadNewerBtn = document.getElementById('load-newer-btn');
    if (existingLoadNewerBtn) existingLoadNewerBtn.remove();
    messageArea.prepend(fragment);
    
    if (totalMessages > currentPage * pageSize) {
        const loadMoreButton = document.createElement('button');
        loadMoreButton.id = 'load-more-btn';
        loadMoreButton.className = 'load-more-btn';
        loadMoreButton.textContent = '加载更早的消息';
        messageArea.prepend(loadMoreButton);
    }
    // 当不在最新页时，显示"加载更新的消息"按钮
    if (currentPage > 1) {
        const loadNewerButton = document.createElement('button');
        loadNewerButton.id = 'load-newer-btn';
        loadNewerButton.className = 'load-more-btn';
        loadNewerButton.textContent = '加载更新的消息';
        messageArea.appendChild(loadNewerButton);
    }
    if (forceScrollToBottom) {
        setTimeout(() => {
            messageArea.scrollTop = messageArea.scrollHeight;
        }, 0);
    } else if (isLoadMore) {
        // 临时禁用平滑滚动以防止位置跳动
        messageArea.style.scrollBehavior = 'auto';
        messageArea.scrollTop = messageArea.scrollHeight - oldScrollHeight;
        // 恢复平滑滚动 (使用 setTimeout 确保渲染周期完成)
        setTimeout(() => {
            messageArea.style.scrollBehavior = '';
        }, 0);
    }
}

function loadMoreMessages() {
    currentPage++;
    renderMessages(true, false);
}

function loadNewerMessages() {
    if (currentPage > 1) {
        currentPage--;
        renderMessages(false, false);
        // 滚动到顶部以便用户从上往下阅读
        const area = document.getElementById('message-area');
        if (area) area.scrollTop = 0;
    }
}

function createMessageBubbleElement(message, isContinuous = false) {
    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    // 这里需要把 isThinking 从 message 里解构出来
    let {role, content, timestamp, id, transferStatus, giftStatus, stickerData, senderId, quote, isWithdrawn, originalContent, isStatusUpdate, isThinking} = message;
    // 角色消息中的 {{user}} 替换为当前对话的「我的名字」
    if (role === 'assistant' && chat && chat.myName && typeof content === 'string') {
        content = content.replace(/\{\{user\}\}/g, chat.myName);
    }
    // 【新增补丁】如果内容以 <thinking> 开头，强制标记为 isThinking
    // 防止因为数据库加载导致 isThinking 属性丢失，或者正则没匹配到的情况
    if (content && typeof content === 'string' && content.trim().startsWith('<thinking>')) {
        isThinking = true;
    }

    // 拦截：如果是状态更新、思考过程或转账指令消息，且没开调试模式，直接不渲染
    if ((isStatusUpdate || isThinking || message.isTransferAction) && !isDebugMode) return null;
    // 拦截：hiddenFromDisplay 标记的消息（如角色自知上下文消息），不渲染成气泡
    if (message.hiddenFromDisplay && !isDebugMode) return null;

    // ... 后续代码不变 ...


    const avatarMode = chat.avatarMode || 'full';
    let avatarClass = 'message-avatar';
    
    if (avatarMode === 'hidden') {
        avatarClass += ' avatar-hidden';
    } else if (avatarMode === 'kkt') {
        if (role === 'user') {
            avatarClass += ' avatar-hidden';
        } else if (isContinuous) {
            avatarClass += ' avatar-invisible';
        }
    } else if (avatarMode === 'merge') {
        if (isContinuous) {
            avatarClass += ' avatar-invisible';
        }
    }

    const isBilingualMode = chat.bilingualModeEnabled;
    let bilingualMatch = null;
    // 增加 && !isThinking，防止思考内容被当成双语消息解析
    if (isBilingualMode && role === 'assistant' && !isThinking) {
        // 修改正则以兼容 "的消息：" 和 "回复：" (包括 "并回复")
const contentMatch = content.match(/^\[.*?(?:消息|回复)[：:]([\s\S]+)\]$/);
        if (contentMatch) {
            const mainText = contentMatch[1].trim();
            
            // 优先尝试匹配「」
            const lastCloseBracket = mainText.lastIndexOf('」');
            if (lastCloseBracket > -1) {
                const lastOpenBracket = mainText.lastIndexOf('「', lastCloseBracket);
                if (lastOpenBracket > -1) {
                    const chineseText = mainText.substring(lastOpenBracket + 1, lastCloseBracket).trim();
                    const foreignText = mainText.substring(0, lastOpenBracket).trim();
                    if (foreignText && chineseText) {
                        bilingualMatch = [null, foreignText, chineseText];
                    }
                }
            }

            // 如果没有匹配到「」，则回退匹配 () 或 （）以兼容旧消息
            if (!bilingualMatch) {
                const lastCloseParen = Math.max(mainText.lastIndexOf(')'), mainText.lastIndexOf('）'));
                if (lastCloseParen > -1) {
                    const lastOpenParen = Math.max(
                        mainText.lastIndexOf('(', lastCloseParen),
                        mainText.lastIndexOf('（', lastCloseParen)
                    );
                    if (lastOpenParen > -1) {
                        const chineseText = mainText.substring(lastOpenParen + 1, lastCloseParen).trim();
                        const foreignText = mainText.substring(0, lastOpenParen).trim();
                        if (foreignText && chineseText) {
                            bilingualMatch = [null, foreignText, chineseText];
                        }
                    }
                }
            }
        }
    }

    if (bilingualMatch) {
        const foreignText = bilingualMatch[1].trim();
        const chineseText = bilingualMatch[2].trim();
        const wrapper = document.createElement('div');
        wrapper.dataset.id = id;
        wrapper.className = 'message-wrapper received';
        if (message.isContextDisabled) wrapper.classList.add('context-disabled');
        
        if (currentChatType === 'group') {
            wrapper.classList.add('group-message');
        }

        let avatarUrl = chat.avatar;
        let senderNickname = '';
        if (currentChatType === 'group') {
            const sender = chat.members.find(m => m.id === senderId);
            if (sender) {
                avatarUrl = sender.avatar;
                senderNickname = sender.groupNickname;
            } else {
                avatarUrl = 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg';
            }
        }

        const bubbleRow = document.createElement('div');
        bubbleRow.className = 'message-bubble-row';
        const timeString = formatTimestampByFormat(timestamp, chat);
        
        const bubbleElement = document.createElement('div');
        bubbleElement.className = 'message-bubble received bilingual-bubble';
        
        const styleMode = chat.bilingualBubbleStyle || 'under';
        
        if (styleMode === 'inner' || styleMode === 'inner-no-line') {
            if (styleMode === 'inner-no-line') {
                bubbleElement.classList.add('inner-no-line-style');
            } else {
                bubbleElement.classList.add('inner-style');
            }
            
            bubbleElement.innerHTML = `
                <span>${DOMPurify.sanitize(foreignText)}</span>
                <div class="bilingual-divider"></div>
                <span class="translation-inner">${DOMPurify.sanitize(chineseText)}</span>
            `;
        } else {
            bubbleElement.innerHTML = `<span>${DOMPurify.sanitize(foreignText)}</span>`;
        }

        const themeKey = chat.theme || 'white_pink';
        const theme = colorThemes[themeKey] || colorThemes['white_pink'];
        const bubbleTheme = theme.received;
        if (!chat.useCustomBubbleCss) {
            bubbleElement.style.backgroundColor = bubbleTheme.bg;
            bubbleElement.style.color = bubbleTheme.text;
        }
        
        // Time Stamp Logic for Bilingual
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.textContent = timeString;

        const timestampStyle = chat.timestampStyle || 'bubble';

        // Append Time Stamp to Bubble (if style is bubble)
        if (timestampStyle === 'bubble') {
            bubbleElement.appendChild(timeSpan);
        }

        const messageInfo = document.createElement('div');
        messageInfo.className = 'message-info';
        const avatarImg = document.createElement('img');
        avatarImg.src = avatarUrl;
        avatarImg.className = avatarClass;
        messageInfo.appendChild(avatarImg);

        if (timestampStyle === 'avatar') {
            messageInfo.appendChild(timeSpan);
        }

        if (currentChatType === 'group') {
            const contentContainer = document.createElement('div');
            contentContainer.className = 'group-msg-content';
            
            if (senderNickname) {
                const nicknameDiv = document.createElement('div');
                nicknameDiv.className = 'group-nickname';
                nicknameDiv.textContent = senderNickname;
                contentContainer.appendChild(nicknameDiv);
            }
            
            contentContainer.appendChild(bubbleElement);
            bubbleRow.appendChild(messageInfo);
            bubbleRow.appendChild(contentContainer);
        } else {
            bubbleRow.appendChild(messageInfo);
            bubbleRow.appendChild(bubbleElement);
        }

        wrapper.appendChild(bubbleRow);

        if (styleMode === 'under') {
            const translationDiv = document.createElement('div');
            translationDiv.className = 'translation-text';
            translationDiv.textContent = chineseText;
            wrapper.appendChild(translationDiv);
        }

        // --- 【新增】在双语消息中注入引用(回复)气泡渲染逻辑 ---
        if (quote) {
            let quotedSenderName = '';
            // 解析被引用人的名字
            if (quote.senderId === 'user_me') {
                quotedSenderName = (currentChatType === 'private') ? chat.myName : chat.me.nickname;
            } else {
                if (currentChatType === 'private') {
                    quotedSenderName = chat.remarkName;
                } else {
                    const sender = chat.members.find(m => m.id === quote.senderId);
                    quotedSenderName = sender ? sender.groupNickname : '未知成员';
                }
            }
            
            // 创建引用气泡 DOM
            const quoteDiv = document.createElement('div');
            quoteDiv.className = 'quoted-message';
            const sanitizedQuotedText = DOMPurify.sanitize(quote.content, { ALLOWED_TAGS: [] });
            quoteDiv.innerHTML = `<span class="quoted-sender">回复 ${quotedSenderName}</span><p class="quoted-text">${sanitizedQuotedText}</p>`;
            
            // 将引用气泡插入到双语主气泡的前面 (CSS绝对定位会自动处理位置)
            bubbleElement.prepend(quoteDiv);
        }
        // ---------------------------------------------------
        
        return wrapper;
    }

    const timeSkipRegex = /\[system-display:([\s\S]+?)\]/;
    const inviteRegex = /\[(.*?)邀请(.*?)加入了群聊\]/;
    const renameRegex = /\[(.*?)修改群名为[：:](.*?)\]/;
    const updateStatusRegex = /\[(.*?)更新状态为[：:](.*?)\]/;
    const callInviteRegex = /\[(.*?)向(.*?)发起了(视频|语音)通话\]/;
    const callRejectRegex = /\[(.*?)拒绝了(.*?)的(视频|语音)通话\]/;

    const timeSkipMatch = content.match(timeSkipRegex);
    const inviteMatch = content.match(inviteRegex);
    const renameMatch = content.match(renameRegex);
    const updateStatusMatch = content.match(updateStatusRegex);
    const callInviteMatch = content.match(callInviteRegex);
    const callRejectMatch = content.match(callRejectRegex);

    // 私聊消息正则
    const privateRegex = /^\[Private: (.*?) -> (.*?): ([\s\S]+?)\]$/;
    const privateEndRegex = /^\[Private-End: (.*?) -> (.*?)\]$/;

    let invisibleRegex;
    if (chat.showStatusUpdateMsg) {
        // 在末尾添加 |<thinking>[\s\S]*?<\/thinking>
        invisibleRegex = /\[.*?(?:接收|退回).*?的转账\]|\[.*?已接收礼物\]|\[system:.*?\]|\[系统情景通知：.*?\]|\[.*?同意了.*?的代付请求\]|\[.*?拒绝了.*?的代付请求\]|<thinking>[\s\S]*?<\/thinking>|^<thinking>[\s\S]*/;
    } else {
        // 在末尾添加 |<thinking>[\s\S]*?<\/thinking>
        invisibleRegex = /\[.*?(?:接收|退回).*?的转账\]|\[.*?更新状态为：.*?\]|\[.*?已接收礼物\]|\[system:.*?\]|\[系统情景通知：.*?\]|\[.*?同意了.*?的代付请求\]|\[.*?拒绝了.*?的代付请求\]|<thinking>[\s\S]*?<\/thinking>|^<thinking>[\s\S]*/;
    }

    let isDebugHiddenMsg = false;
    // 在这里增加 || isThinking，只要标记为思考中，就强制走隐形消息逻辑
    if (invisibleRegex.test(content) || privateRegex.test(content) || privateEndRegex.test(content) || isThinking) {
        if (!isDebugMode) return null; 
        isDebugHiddenMsg = true;       
    }

    const wrapper = document.createElement('div');
    wrapper.dataset.id = id;
    if (isDebugHiddenMsg) {
        wrapper.className = 'message-wrapper received';
        if (message.isContextDisabled) wrapper.classList.add('context-disabled'); 
        const bubbleRow = document.createElement('div');
        bubbleRow.className = 'message-bubble-row';
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble debug-visible'; 
        bubble.textContent = content; 
        bubbleRow.appendChild(bubble);
        wrapper.appendChild(bubbleRow);
        return wrapper;
    }

    if (isWithdrawn) {
        wrapper.className = 'message-wrapper system-notification';
        if (message.isContextDisabled) wrapper.classList.add('context-disabled');
        const withdrawnText = (role === 'user') ? '你撤回了一条消息' : `${chat.remarkName || chat.name}撤回了一条消息`;
        wrapper.innerHTML = `<div><span class="withdrawn-message">${withdrawnText}</span></div><div class="withdrawn-content">${originalContent ? DOMPurify.sanitize(originalContent.replace(/\[.*?的消息[：:]([\s\S]+?)\]/, '$1')) : ''}</div>`;
        const withdrawnMessageSpan = wrapper.querySelector('.withdrawn-message');
        if (withdrawnMessageSpan) {
            withdrawnMessageSpan.addEventListener('click', () => {
                const withdrawnContent = wrapper.querySelector('.withdrawn-content');
                if (withdrawnContent && withdrawnContent.textContent.trim()) {
                    withdrawnContent.classList.toggle('active');
                }
            });
        }
        return wrapper;
    }
    // 【新增】 && !isThinking —— 只有当不是思考过程时，才允许渲染成系统通知气泡
    if ((timeSkipMatch || inviteMatch || renameMatch || (updateStatusMatch && chat.showStatusUpdateMsg) || callInviteMatch || callRejectMatch) && !isThinking) {
        wrapper.className = 'message-wrapper system-notification';
        if (message.isContextDisabled) wrapper.classList.add('context-disabled');
        let bubbleText = '';
        if (timeSkipMatch) bubbleText = timeSkipMatch[1];
        if (inviteMatch) bubbleText = `${inviteMatch[1]}邀请${inviteMatch[2]}加入了群聊`;
        if (renameMatch) bubbleText = `${renameMatch[1]}修改群名为“${renameMatch[2]}”`;
        if (updateStatusMatch) bubbleText = `${updateStatusMatch[1]} 更新状态为：${updateStatusMatch[2]}`;
        if (callInviteMatch) bubbleText = `${callInviteMatch[1]}向${callInviteMatch[2]}发起了${callInviteMatch[3]}通话`;
        if (callRejectMatch) bubbleText = `${callRejectMatch[1]}拒绝了${callRejectMatch[2]}的${callRejectMatch[3]}通话`;
        // 如果消息携带了 theaterScenarioId，则气泡可点击跳转到对应小剧场
        if (message.theaterScenarioId) {
            const bubble = document.createElement('div');
            bubble.className = 'system-notification-bubble theater-notify-bubble';
            bubble.style.cssText = 'cursor:pointer; text-decoration:underline dotted rgba(0,0,0,0.25);';
            bubble.title = '点击查看小剧场';
            bubble.textContent = bubbleText + ' ▶';
            bubble.addEventListener('click', () => {
                // 调试模式下不跳转（气泡已显示原始内容，供调试查看）
                if (typeof isDebugMode !== 'undefined' && isDebugMode) return;
                const scId = message.theaterScenarioId;
                const scMode = message.theaterScenarioMode || 'text';
                // 切换到小剧场App，然后打开对应的场景详情
                // 标记：从聊天气泡打开，返回时需回到聊天界面
                window._theaterDetailFromChat = true;
                if (typeof openApp === 'function') openApp('theater');
                // 稍作延迟等待视图切换后再查找场景
                setTimeout(() => {
                    // 直接根据 scMode 查找对应模式的小剧场，无需切换 theaterCurrentMode
                    let scenario = null;
                    if (scMode === 'html') {
                        // HTML 模式：直接从 db.theaterHtmlScenarios 查找
                        if (typeof db !== 'undefined' && db.theaterHtmlScenarios) {
                            scenario = db.theaterHtmlScenarios.find(s => s.id === scId);
                        }
                    } else {
                        // 文本模式：直接从 db.theaterScenarios 查找
                        if (typeof db !== 'undefined' && db.theaterScenarios) {
                            scenario = db.theaterScenarios.find(s => s.id === scId);
                        }
                    }
                    // 如果按模式找不到，尝试在两种模式中都查找（兼容旧数据）
                    if (!scenario) {
                        if (typeof db !== 'undefined') {
                            if (db.theaterHtmlScenarios) {
                                scenario = db.theaterHtmlScenarios.find(s => s.id === scId);
                            }
                            if (!scenario && db.theaterScenarios) {
                                scenario = db.theaterScenarios.find(s => s.id === scId);
                            }
                        }
                    }
                    if (scenario) {
                        // 根据 scenario.mode 或 scMode 决定调用哪个详情函数
                        const actualMode = scenario.mode || scMode;
                        if (actualMode === 'html' && typeof showTheaterHtmlScenarioDetail === 'function') {
                            showTheaterHtmlScenarioDetail(scenario);
                        } else if (typeof showTheaterScenarioDetail === 'function') {
                            showTheaterScenarioDetail(scenario);
                        }
                    } else {
                        if (typeof showToast === 'function') showToast('未找到该小剧场，可能已被删除');
                    }
                }, 300);
            });
            wrapper.appendChild(bubble);
        } else {
            wrapper.innerHTML = `<div class="system-notification-bubble">${bubbleText}</div>`;
        }
        return wrapper;
    }

    const isSent = (role === 'user');
    let avatarUrl, bubbleTheme, senderNickname = '';
    const themeKey = chat.theme || 'white_pink';
    const theme = colorThemes[themeKey] || colorThemes['white_pink'];
    let messageSenderId = isSent ? 'user_me' : senderId;
    if (isSent) {
        avatarUrl = (currentChatType === 'private') ? chat.myAvatar : chat.me.avatar;
        bubbleTheme = theme.sent;
    } else {
        if (currentChatType === 'private') {
            avatarUrl = chat.avatar;
        } else {
            const sender = chat.members.find(m => m.id === senderId);
            if (sender) {
                avatarUrl = sender.avatar;
                senderNickname = sender.groupNickname;
            } else {
                avatarUrl = 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg';
            }
        }
        bubbleTheme = theme.received;
    }
    const timeString = formatTimestampByFormat(timestamp, chat);
    wrapper.className = `message-wrapper ${isSent ? 'sent' : 'received'}`;
    if (message.isContextDisabled) wrapper.classList.add('context-disabled');
    if (currentChatType === 'group' && !isSent) {
        wrapper.classList.add('group-message');
    }
    if (avatarClass.includes('avatar-hidden')) {
        wrapper.classList.add('no-avatar-layout');
    }
    if (avatarClass.includes('avatar-invisible')) {
        wrapper.classList.add('avatar-invisible-layout');
    }
    if (currentChatType === 'private' && chat.history && chat.history[0] && chat.history[0].id === id && role === 'assistant') {
        wrapper.classList.add('is-first-greeting');
    }
    const bubbleRow = document.createElement('div');
    bubbleRow.className = 'message-bubble-row';
    let bubbleElement;
    const urlRegex = /^(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|bmp|svg)|data:image\/[a-z]+;base64,)/i;
    
    const sentStickerRegex = /\[(?:.+?)发送的表情包[：:](.+?)\]/i;
    const receivedStickerRegex = /\[(?:.*?的)?表情包[：:](.+?)\]/i;
    
    const voiceRegex = /\[(?:.+?)的语音[：:]([\s\S]+?)\]/;
    const photoVideoRegex = /\[(?:.+?)发来的照片\/视频[：:]([\s\S]+?)\]/;
    const privateSentTransferRegex = /\[.*?给你转账[：:]([\d.,]+)元[；;]备注[：:](.*?)\]/;
    const privateReceivedTransferRegex = /\[.*?的转账[：:]([\d.,]+)元[；;]备注[：:](.*?)\]/;
    const groupTransferRegex = /\[(.*?)\s*向\s*(.*?)\s*转账[：:]([\d.,]+)元[；;]备注[：:](.*?)\]/;
    const privateGiftRegex = /\[(?:.+?)送来的礼物[：:]([\s\S]+?)\]/;
    const groupGiftRegex = /\[(.*?)\s*向\s*(.*?)\s*送来了礼物[：:]([\s\S]+?)\]/;
    const imageRecogRegex = /\[.*?发来了一张图片[：:]\]/;
    const textRegex = /\[(?:.+?)的消息[：:]([\s\S]+?)\]/;
    /* 用户定位 [我的位置：...] 或 角色定位 [XXX的位置：...] */
    const locationRegex = /\[(.+?)的位置[：:](.+?)(?:；距你约\s*([\d.]+)\s*(米|千米|公里))?\]/;
    
    // 新版购物车小票格式: [A为B下单了：配送方式|总价|商品名 x数量]
    const shopOrderRegexNew = /\[(.*?)为(.*?)下单了[：:](.*?)\|(.*?)\|(.*?)\]/;
    // 代付请求格式: [A向B发起了代付请求:总价|商品名 x数量]
    const shopPayRequestRegex = /\[(.*?)向(.*?)发起了代付请求[：:](.*?)\|(.*?)\]/;
    
    // 通话记录格式: [视频通话记录：时间；时长；总结] 或 [语音通话记录：...]
    const callRecordRegex = /\[(视频|语音)通话记录[：:](.*?)[；;](.*?)[；;](.*?)\]/;
    // 小剧场分享卡片占位符: [小剧场分享:scenarioId]
    const theaterShareRegex = /^\[小剧场分享[：:](.+?)\]$/;
    
    const pomodoroRecordRegex = /\[专注记录\]\s*任务[：:]([\s\S]+?)，时长[：:]([\s\S]+?)，期间与 .*? 互动 (\d+)\s*次。/;
    const pomodoroMatch = content.match(pomodoroRecordRegex);
    const shopOrderMatchNew = content.match(shopOrderRegexNew);
    const shopPayRequestMatch = content.match(shopPayRequestRegex);
    const callRecordMatch = content.match(callRecordRegex);
    const theaterShareMatch = content.match(theaterShareRegex);
    
    const sentStickerMatch = content.match(sentStickerRegex);
    const receivedStickerMatch = content.match(receivedStickerRegex);
    const voiceMatch = content.match(voiceRegex);
    const photoVideoMatch = content.match(photoVideoRegex);
    const privateSentTransferMatch = content.match(privateSentTransferRegex);
    const privateReceivedTransferMatch = content.match(privateReceivedTransferRegex);
    const groupTransferMatch = content.match(groupTransferRegex);
    const privateGiftMatch = content.match(privateGiftRegex);
    const groupGiftMatch = content.match(groupGiftRegex);
    const imageRecogMatch = content.match(imageRecogRegex);
    const textMatch = content.match(textRegex);
    const locationMatch = content.match(locationRegex);
    
    if (callRecordMatch) {
        // 匹配结果: [0]全文, [1]类型(视频/语音), [2]时间, [3]时长, [4]总结
        const type = callRecordMatch[1]; 
        const durationStr = callRecordMatch[3];
        
        // 复用系统通知样式，覆盖默认的 sent/received 类
        wrapper.className = 'message-wrapper system-notification';
        if (message.isContextDisabled) wrapper.classList.add('context-disabled');
        
        const title = type === '视频' ? '视频通话结束' : '语音通话结束';

        // 直接设置 wrapper 内容，模仿系统通知
        wrapper.innerHTML = `
            <div class="system-notification-bubble" style="cursor: pointer;" title="点击查看详情">
                ${title} ${durationStr} <span style="font-size: 10px; opacity: 0.6;">›</span>
            </div>
        `;
        
        // 绑定点击事件打开详情
        const bubble = wrapper.querySelector('.system-notification-bubble');
        if (message.callRecordId && bubble) {
            bubble.addEventListener('click', () => {
                if (window.VideoCallModule && typeof window.VideoCallModule.showDetailModal === 'function') {
                    window.VideoCallModule.showDetailModal(message.callRecordId);
                }
            });
        }
        
        return wrapper; // 直接返回，跳过后续的气泡组装逻辑

    } else if (shopOrderMatchNew) {
        // 新版小票渲染 (普通订单)
        // [A为B下单了：配送方式|总价|商品名 x数量]
        const deliveryType = shopOrderMatchNew[3];
        const totalPrice = shopOrderMatchNew[4];
        const itemsStr = shopOrderMatchNew[5];
        
        // 解析商品列表字符串 "汉堡 x2, 可乐 x1" -> [{name, qty}]
        const items = itemsStr.split(/,\s*/).map(s => {
            const parts = s.match(/(.+?)\s*x(\d+)$/);
            if (parts) {
                return { name: parts[1], qty: parts[2] };
            }
            return { name: s, qty: 1 };
        });

        const now = new Date(timestamp);
        const orderId = `NO.${now.getTime().toString().slice(-8)}`;
        const dateStr = `${now.getMonth()+1}/${now.getDate()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

        bubbleElement = document.createElement('div');
        bubbleElement.className = 'receipt-bubble';
        
        // 检查是否为自提订单
        const pickupMatch = deliveryType.match(/自提口令:\s*(.*)/);
        let isPickup = !!pickupMatch;
        let pickupCode = pickupMatch ? pickupMatch[1] : '';
        let isPickedUp = message.isPickedUp || false;

        let itemsHtml = '';
        let stampHtml = '';

        if (isPickup && !isPickedUp) {
            // 未自提：隐藏商品
            itemsHtml = `
                <div class="receipt-item-row">
                    <span class="receipt-item-name">🎁 神秘商品</span>
                    <span class="receipt-dots"></span>
                    <span class="receipt-item-qty">x?</span>
                </div>
            `;
        } else {
            // 已自提或普通订单：显示商品
            itemsHtml = items.map(item => `
                <div class="receipt-item-row">
                    <span class="receipt-item-name">${item.name}</span>
                    <span class="receipt-dots"></span>
                    <span class="receipt-item-qty">x${item.qty}</span>
                </div>
            `).join('');
        }

        if (isPickup && isPickedUp) {
            // 使用 SVG 图标替代印章
            stampHtml = `
            <svg class="receipt-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M8 12l3 3 5-5"></path>
            </svg>`;
        }

        let pickupCodeHtml = '';
        if (isPickup && !isPickedUp) {
            pickupCodeHtml = `<div class="receipt-pickup-code">🔑 ${pickupCode}</div>`;
        }

        bubbleElement.innerHTML = `
            ${stampHtml}
            <div class="receipt-header">
                <div class="receipt-brand">UwU MART</div>
                <div class="receipt-id">${orderId}</div>
            </div>
            <div class="receipt-items">
                ${itemsHtml}
            </div>
            <div class="receipt-total-section">
                <span class="receipt-total-price">¥${totalPrice}</span>
            </div>
            <div class="receipt-footer">
                ${pickupCodeHtml}
                <div class="receipt-delivery-info">
                    <span>${isPickup ? '门店自提' : deliveryType}</span>
                    <span>${dateStr}</span>
                </div>
            </div>
        `;

    } else if (shopPayRequestMatch) {
        // 代付请求小票渲染
        // [A向B发起了代付请求:总价|商品名 x数量]
        let stampHtml = '';
        const totalPrice = shopPayRequestMatch[3];
        const itemsStr = shopPayRequestMatch[4];
        
        const items = itemsStr.split(/,\s*/).map(s => {
            const parts = s.match(/(.+?)\s*x(\d+)$/);
            if (parts) {
                return { name: parts[1], qty: parts[2] };
            }
            return { name: s, qty: 1 };
        });

        const now = new Date(timestamp);
        const orderId = `REQ.${now.getTime().toString().slice(-8)}`;
        const dateStr = `${now.getMonth()+1}/${now.getDate()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

        bubbleElement = document.createElement('div');
        bubbleElement.className = 'receipt-bubble pay-request';
        
        let itemsHtml = items.map(item => `
            <div class="receipt-item-row">
                <span class="receipt-item-name">${item.name}</span>
                <span class="receipt-dots"></span>
                <span class="receipt-item-qty">x${item.qty}</span>
            </div>
        `).join('');

        // 移除印章逻辑，改为修改底部文字
        let statusText = '待支付';
        if (message.payStatus === 'paid') {
            statusText = '已支付';
        } else if (message.payStatus === 'rejected') {
            statusText = '已拒绝';
        }

        let actionButtonsHtml = '';
        // 如果是接收到的消息 (AI -> User) 且状态为 pending，显示操作按钮
        if (!isSent && !message.payStatus) {
            actionButtonsHtml = `
                <div class="receipt-actions">
                    <button class="receipt-action-btn" onclick="sendPayResponse('${id}', 'pay')">支付</button>
                    <button class="receipt-action-btn" onclick="sendPayResponse('${id}', 'reject')">拒绝</button>
                </div>
            `;
        }

        bubbleElement.innerHTML = `
            ${stampHtml}
            <div class="receipt-header">
                <div class="receipt-brand">PAY FOR ME</div>
                <div class="receipt-id">${orderId}</div>
            </div>
            <div class="receipt-items">
                ${itemsHtml}
            </div>
            <div class="receipt-total-section">
                <span class="receipt-total-price">¥${totalPrice}</span>
            </div>
            <div class="receipt-footer">
                <div class="receipt-delivery-info">
                    <span class="pay-status-text">${statusText}</span>
                    <span>${dateStr}</span>
                </div>
                ${actionButtonsHtml}
            </div>
        `;

    } else if (pomodoroMatch) {
        const taskName = pomodoroMatch[1];
        const duration = pomodoroMatch[2];
        const pokeCount = pomodoroMatch[3];
        bubbleElement = document.createElement('div');
        bubbleElement.className = 'pomodoro-record-card';
        const details = { taskName, duration, pokeCount };
        bubbleElement.innerHTML = `<img src="https://i.postimg.cc/sgdS9khZ/chan-122.png" class="pomodoro-record-icon" alt="pomodoro complete"><div class="pomodoro-record-body"><p class="task-name">${taskName}</p></div>`;
        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'pomodoro-record-details';
        detailsDiv.innerHTML = `<p><strong>任务名称:</strong> ${taskName}</p><p><strong>专注时长:</strong> ${duration}</p><p><strong>“戳一戳”次数:</strong> ${pokeCount}</p>`;
        wrapper.appendChild(detailsDiv);
        bubbleElement.addEventListener('click', () => {
            detailsDiv.classList.toggle('active');
        });
    } else if (theaterShareMatch) {
        // 小剧场分享卡片渲染
        const scenarioId = theaterShareMatch[1];
        let scenario = null;
        if (typeof db !== 'undefined' && db) {
            if (Array.isArray(db.theaterScenarios)) {
            scenario = db.theaterScenarios.find(s => s.id === scenarioId);
            }
            if (!scenario && Array.isArray(db.theaterHtmlScenarios)) {
                scenario = db.theaterHtmlScenarios.find(s => s.id === scenarioId);
            }
        }

        bubbleElement = document.createElement('div');
        bubbleElement.className = 'theater-share-card-bubble';

        let title = '小剧场';
        let category = '未分类';
        let charName = '';
        let preview = '';

        if (scenario) {
            title = scenario.title || '剧情';
            category = scenario.category || '未分类';
            if (scenario.charId && db && Array.isArray(db.characters)) {
                const ch = db.characters.find(c => c.id === scenario.charId);
                if (ch) {
                    charName = ch.remarkName || ch.realName || '';
                }
            }
            if (scenario.content) {
                const raw = scenario.content.replace(/\s+/g, ' ').trim();
                preview = raw.slice(0, 60) + (raw.length > 60 ? '…' : '');
            }
        }

        const charLine = charName ? `角色：${DOMPurify.sanitize(charName)}` : '小剧场分享';

        bubbleElement.innerHTML = `
            <div class="theater-share-card-header">
                <span class="theater-share-tag">小剧场</span>
                <span class="theater-share-category">${DOMPurify.sanitize(category)}</span>
            </div>
            <div class="theater-share-title">${DOMPurify.sanitize(title)}</div>
            ${preview ? `<div class="theater-share-preview">${DOMPurify.sanitize(preview)}</div>` : ''}
            <div class="theater-share-footer">
                <span class="theater-share-char">${charLine}</span>
                <span class="theater-share-time">${timeString}</span>
            </div>
        `;

        if (scenario) {
            bubbleElement.addEventListener('click', () => {
                try {
                    // 标记：从聊天气泡打开，返回时需回到聊天界面
                    window._theaterDetailFromChat = true;
                    if (scenario.mode === 'html' && typeof showTheaterHtmlScenarioDetail === 'function') {
                        showTheaterHtmlScenarioDetail(scenario);
                    } else if (typeof showTheaterScenarioDetail === 'function') {
                        showTheaterScenarioDetail(scenario);
                    }
                } catch (e) {
                    console.error('Failed to open theater scenario detail:', e);
                }
            });
        }
    } else if ((isSent && sentStickerMatch) || (!isSent && receivedStickerMatch)) {
        bubbleElement = document.createElement('div');
        bubbleElement.className = 'image-bubble';
        let stickerSrc = '';
        
        if (isSent && stickerData) {
            stickerSrc = stickerData;
        } else {
            const stickerName = isSent ? sentStickerMatch[1].trim() : receivedStickerMatch[1].trim();
            
            const groups = (chat.stickerGroups || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
            
            let targetSticker = null;
            if (groups.length > 0) {
                targetSticker = db.myStickers.find(s => groups.includes(s.group) && s.name === stickerName);
            }
            
            if (!targetSticker) {
                targetSticker = db.myStickers.find(s => s.name === stickerName);
            }
            
            if (targetSticker) {
                stickerSrc = targetSticker.data;
            } else {
                stickerSrc = 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg'; 
            }
        }
        bubbleElement.innerHTML = `<img src="${stickerSrc}" alt="表情包">`;
    } else if (privateGiftMatch || groupGiftMatch) {
        const match = privateGiftMatch || groupGiftMatch;
        bubbleElement = document.createElement('div');
        bubbleElement.className = 'gift-card';
        if (giftStatus === 'received') {
            bubbleElement.classList.add('received');
        }
        let giftText;
        if (groupGiftMatch) {
            const from = groupGiftMatch[1];
            const to = groupGiftMatch[2];
            giftText = isSent ? `你送给 ${to} 的礼物` : `${from} 送给 ${to} 的礼物`;
        } else {
            giftText = isSent ? '您有一份礼物～' : '您有一份礼物～';
        }
        bubbleElement.innerHTML = `<img src="https://i.postimg.cc/rp0Yg31K/chan-75.png" alt="gift" class="gift-card-icon"><div class="gift-card-text">${giftText}</div><div class="gift-card-received-stamp">已查收</div>`;
        const description = groupGiftMatch ? groupGiftMatch[3].trim() : match[1].trim();
        const descriptionDiv = document.createElement('div');
        descriptionDiv.className = 'gift-card-description';
        descriptionDiv.textContent = description;
        wrapper.appendChild(descriptionDiv);
    } else if (content.startsWith('[论坛分享]')) {
        const forumShareRegex = /\[论坛分享\]标题：([\s\S]+?)\n摘要：([\s\S]+)/;
        const forumShareMatch = content.match(forumShareRegex);
        if (forumShareMatch) {
            const title = forumShareMatch[1].trim();
            const summary = forumShareMatch[2].trim();
            bubbleElement = document.createElement('div');
            bubbleElement.className = 'forum-share-card';
            bubbleElement.innerHTML = `<div class="forum-share-header"><svg viewBox="0 0 24 24"><path d="M21,3H3A2,2 0 0,0 1,5V19A2,2 0 0,0 3,21H21A2,2 0 0,0 23,19V5A2,2 0 0,0 21,3M21,19H3V5H21V19M8,11H16V9H8V11M8,15H13V13H8V15Z" /></svg><span>来自论坛的分享</span></div><div class="forum-share-content"><div class="forum-share-title">${title}</div><div class="forum-share-summary">${summary}</div></div>`;
        }
    } else if (content.startsWith('[论坛分享-评论]')) {
        const forumCommentShareRegex = /\[论坛分享-评论\]\n帖子标题：([\s\S]*?)\n帖子内容：([\s\S]*?)\n评论（来自 ([^)]+)）：([\s\S]*)/;
        const forumCommentMatch = content.match(forumCommentShareRegex);
        if (forumCommentMatch) {
            const postTitle = forumCommentMatch[1].trim();
            const postContent = forumCommentMatch[2].trim().replace(/\n/g, ' ');
            const commentAuthor = forumCommentMatch[3].trim();
            const commentContent = forumCommentMatch[4].trim().replace(/\n/g, '<br>');
            const contentShort = postContent.length > 80 ? postContent.slice(0, 80) + '…' : postContent;
            bubbleElement = document.createElement('div');
            bubbleElement.className = 'forum-share-card forum-share-comment-card';
            bubbleElement.innerHTML = `<div class="forum-share-header"><svg viewBox="0 0 24 24"><path d="M21,3H3A2,2 0 0,0 1,5V19A2,2 0 0,0 3,21H21A2,2 0 0,0 23,19V5A2,2 0 0,0 21,3M21,19H3V5H21V19M8,11H16V9H8V11M8,15H13V13H8V15Z" /></svg><span>来自论坛的评论分享</span></div><div class="forum-share-content"><div class="forum-share-title">${postTitle}</div><div class="forum-share-summary">${contentShort}</div><div class="forum-share-comment-block"><span class="forum-share-comment-author">${commentAuthor}</span>：<span class="forum-share-comment-text">${commentContent}</span></div></div>`;
        }
    } else if (voiceMatch) {
        bubbleElement = document.createElement('div');
        bubbleElement.className = 'voice-bubble';
        if (!chat.useCustomBubbleCss) {
            bubbleElement.style.backgroundColor = bubbleTheme.bg;
            bubbleElement.style.color = bubbleTheme.text;
        }
        bubbleElement.innerHTML = `<svg class="play-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg><svg class="pause-icon" viewBox="0 0 24 24" fill="currentColor" style="display:none;"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg><span class="duration">${calculateVoiceDuration(voiceMatch[1].trim())}"</span>`;
        const transcriptDiv = document.createElement('div');
        transcriptDiv.className = 'voice-transcript';
        transcriptDiv.textContent = voiceMatch[1].trim();
        wrapper.appendChild(transcriptDiv);
    } else if (photoVideoMatch) {
        const pvContent = photoVideoMatch[1].trim();
        let isRealPhoto = false;
        let realPhotoUrl = '';

        // 检查真实相册匹配
        if (currentChatType === 'private' && !isSent && chat.useRealGallery && chat.gallery) {
            const galleryItem = chat.gallery.find(item => item.name === pvContent);
            if (galleryItem) {
                isRealPhoto = true;
                realPhotoUrl = galleryItem.url;
            }
        }

        if (isRealPhoto) {
            bubbleElement = document.createElement('div');
            bubbleElement.className = 'image-bubble';
            bubbleElement.innerHTML = `<img src="${realPhotoUrl}" alt="${pvContent}" onclick="openImageViewer(this.src)" style="cursor: zoom-in;">`;
        } else {
            // === NovelAI 自动生图逻辑 ===
            const _naiEnabled = db.novelAiSettings && db.novelAiSettings.enabled && db.novelAiSettings.token;
            
            if (message.novelAiImageUrl) {
                // 已有生成好的图片（即使 NovelAI 已关闭也显示已生成的图片）
                bubbleElement = document.createElement('div');
                bubbleElement.className = 'image-bubble';
                bubbleElement.innerHTML = `<img src="${message.novelAiImageUrl}" alt="${pvContent}" onclick="openImageViewer(this.src)" style="cursor: zoom-in; max-width: 280px; border-radius: 12px;">`;
            } else if (_naiEnabled && !isSent && _naiAutoGenNewMsgIds.has(message.id)) {
                // NovelAI 已启用，角色发的新照片消息，触发自动生成
                bubbleElement = document.createElement('div');
                bubbleElement.className = 'image-bubble nai-generating';
                bubbleElement.innerHTML = `
                    <div class="nai-loading-card" style="width: 200px; height: 280px; border-radius: 12px; background: #f0f0f0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; overflow: hidden; position: relative;">
                        <div class="nai-loading-shimmer" style="position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent); animation: nai-shimmer 1.5s infinite;"></div>
                        <div style="width: 24px; height: 24px; border: 2.5px solid #ccc; border-top-color: #999; border-radius: 50%; animation: nai-spin 0.8s linear infinite;"></div>
                        <span style="font-size: 12px; color: #999; z-index: 1;">加载中...</span>
                    </div>`;
                
                // 异步触发 NovelAI 生图（使用队列避免并发请求过多）
                const msgId = message.id;
                const bubbleRef = bubbleElement;
                const _pvContent = pvContent;
                const _isSent = isSent;
                _naiAutoGenQueue.push(async () => {
                    try {
                        // 从内容中提取 {{英文 tag}} 部分作为 prompt
                        const tagMatch = _pvContent.match(/\{\{([\s\S]+?)\}\}/);
                        let naiPrompt;
                        if (tagMatch) {
                            naiPrompt = tagMatch[1].trim();
                        } else {
                            // 没有 {{}} 标记，直接用整段描述
                            naiPrompt = _pvContent;
                        }
                        
                        console.log('[NovelAI Auto] 为消息生图, prompt:', naiPrompt);
                        const result = await generateNovelAiImage(naiPrompt);
                        
                        if (result && result.imageUrl) {
                            // 将生成的图片保存到消息对象中
                            const chat = currentChatType === 'private' 
                                ? db.characters.find(c => c.id === currentChatId)
                                : db.groups.find(g => g.id === currentChatId);
                            if (chat && chat.history) {
                                const msg = chat.history.find(m => m.id === msgId);
                                if (msg) {
                                    msg.novelAiImageUrl = result.imageUrl;
                                    saveData();
                                }
                            }
                            
                            // 更新 DOM
                            bubbleRef.className = 'image-bubble';
                            bubbleRef.innerHTML = `<img src="${result.imageUrl}" alt="${_pvContent}" onclick="openImageViewer(this.src)" style="cursor: zoom-in; max-width: 280px; border-radius: 12px;">`;
                        }
                    } catch (err) {
                        console.error('[NovelAI Auto] 生图失败:', err);
                        // 失败时回退为普通 pv-card
                        bubbleRef.className = 'pv-card';
                        const displayContent = _pvContent.replace(/\{\{[\s\S]+?\}\}/, '').trim();
                        bubbleRef.innerHTML = `<div class="pv-card-content">${displayContent}</div><div class="pv-card-image-overlay" style="background-image: url('${_isSent ? 'https://i.postimg.cc/L8NFrBrW/1752307494497.jpg' : 'https://i.postimg.cc/1tH6ds9g/1752301200490.jpg'}');"></div><div class="pv-card-footer"><svg viewBox="0 0 24 24"><path d="M4,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M4,6V18H20V6H4M10,9A1,1 0 0,1 11,10A1,1 0 0,1 10,11A1,1 0 0,1 9,10A1,1 0 0,1 10,9M8,17L11,13L13,15L17,10L20,14V17H8Z"></path></svg><span>生图失败・${err.message || '未知错误'}</span></div>`;
                    }
                });
                _naiAutoGenProcess();
            } else {
                // NovelAI 未启用或是用户发的，显示原始 pv-card
                const displayContent = pvContent.replace(/\{\{[\s\S]+?\}\}/, '').trim() || pvContent;
                bubbleElement = document.createElement('div');
                bubbleElement.className = 'pv-card';
                bubbleElement.innerHTML = `<div class="pv-card-content">${displayContent}</div><div class="pv-card-image-overlay" style="background-image: url('${isSent ? 'https://i.postimg.cc/L8NFrBrW/1752307494497.jpg' : 'https://i.postimg.cc/1tH6ds9g/1752301200490.jpg'}');"></div><div class="pv-card-footer"><svg viewBox="0 0 24 24"><path d="M4,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M4,6V18H20V6H4M10,9A1,1 0 0,1 11,10A1,1 0 0,1 10,11A1,1 0 0,1 9,10A1,1 0 0,1 10,9M8,17L11,13L13,15L17,10L20,14V17H8Z"></path></svg><span>照片/视频・点击查看</span></div>`;
            }
        }
    } else if (privateSentTransferMatch || privateReceivedTransferMatch || groupTransferMatch) {
        const isSentTransfer = !!privateSentTransferMatch || (groupTransferMatch && isSent);
        const match = privateSentTransferMatch || privateReceivedTransferMatch || groupTransferMatch;
        let amount, remarkText, titleText;
        if (groupTransferMatch) {
            const from = groupTransferMatch[1];
            const to = groupTransferMatch[2];
            amount = parseFloat(groupTransferMatch[3].replace(/,/g, '')).toFixed(2);
            remarkText = groupTransferMatch[4] || '';
            
            const myName = (currentChatType === 'private') ? chat.myName : chat.me.nickname;
            const isToMe = (to === myName);

            if (isSent) {
                titleText = `向 ${to} 转账`;
            } else {
                if (isToMe) {
                    titleText = `${from} 向你转账`;
                } else {
                    titleText = `${from} 向 ${to} 转账`;
                }
            }
        } else {
            amount = parseFloat(match[1].replace(/,/g, '')).toFixed(2);
            remarkText = match[2] || '';
            titleText = isSentTransfer ? '给你转账' : '转账';
        }
        bubbleElement = document.createElement('div');
        bubbleElement.className = `transfer-card ${isSentTransfer ? 'sent-transfer' : 'received-transfer'}`;
        
        let statusText = isSentTransfer ? '待查收' : '转账给你';
        if (groupTransferMatch && !isSent) {
            const to = groupTransferMatch[2];
            const myName = (currentChatType === 'private') ? chat.myName : chat.me.nickname;
            if (to === myName) {
                statusText = '转账给你';
            } else {
                statusText = '转账给Ta';
            }
        }
        
        if (transferStatus === 'received') {
            statusText = '已收款';
            bubbleElement.classList.add('received');
        } else if (transferStatus === 'returned') {
            statusText = '已退回';
            bubbleElement.classList.add('returned');
        }
        // 在群聊中，如果是待处理的转账且是发给用户的，应该可以点击
        if (currentChatType === 'group') {
            if (transferStatus === 'pending' && groupTransferMatch) {
                const to = groupTransferMatch[2];
                const myName = chat.me.nickname;
                const isToMe = (to === myName);
                // 只有发给用户的转账（角色向用户转账）可以点击接收
                if (isToMe && !isSent) {
                    bubbleElement.style.cursor = 'pointer';
                } else {
                    bubbleElement.style.cursor = 'default';
                }
            } else {
                bubbleElement.style.cursor = 'default';
            }
        } else if (transferStatus !== 'pending' && currentChatType === 'private') {
            bubbleElement.style.cursor = 'default';
        }
        const remarkHTML = remarkText ? `<p class="transfer-remark">${remarkText}</p>` : '';
        bubbleElement.innerHTML = `<div class="overlay"></div><div class="transfer-content"><p class="transfer-title">${titleText}</p><p class="transfer-amount">¥${amount}</p>${remarkHTML}<p class="transfer-status">${statusText}</p></div>`;
    } else if (locationMatch) {
        const who = (locationMatch[1] || '').trim();
        const place = (locationMatch[2] || '').trim();
        const distanceNum = locationMatch[3];
        const unit = locationMatch[4] || '千米';
        const titleText = who === '我' ? '位置' : (DOMPurify.sanitize(who) + '的位置');
        bubbleElement = document.createElement('div');
        bubbleElement.className = 'location-card';
        let distanceHtml = '';
        if (distanceNum && unit) {
            distanceHtml = `<p class="location-distance">距你约 ${distanceNum} ${unit}</p>`;
        }
        bubbleElement.innerHTML = `<div class="overlay"></div><div class="location-content"><p class="location-title">${titleText}</p><p class="location-place">${DOMPurify.sanitize(place)}</p>${distanceHtml}<p class="location-status">位置分享</p></div>`;
    } else if (imageRecogMatch || urlRegex.test(content)) {
        bubbleElement = document.createElement('div');
        bubbleElement.className = 'image-bubble';
        bubbleElement.innerHTML = `<img src="${content}" alt="图片消息">`;
    } else if (textMatch) {
        bubbleElement = document.createElement('div');
        bubbleElement.className = `message-bubble ${isSent ? 'sent' : 'received'}`;
        let userText = textMatch[1].trim().replace(/\[发送时间:.*?\]/g, '').trim();
        bubbleElement.innerHTML = `<span class="bubble-content">${DOMPurify.sanitize(userText)}</span>`;
        if (!chat.useCustomBubbleCss) {
            bubbleElement.style.backgroundColor = bubbleTheme.bg;
            bubbleElement.style.color = bubbleTheme.text;
        }
    } else if (message && Array.isArray(message.parts) && message.parts.length > 0 && message.parts[0].type === 'html') {
        bubbleElement = document.createElement('div');
        bubbleElement.className = `message-bubble ${isSent ? 'sent' : 'received'} html-bubble`;
        const htmlContent = message.parts[0].text;
        if (htmlContent.includes('<!DOCTYPE html>') || htmlContent.includes('<html')) {
            const processedHtml = processTemplate(htmlContent, chat);
            bubbleElement.innerHTML = `<iframe srcdoc="${processedHtml.replace(/"/g, '"')}" style="width: 100%; min-width: 250px; height: 350px; border: none; background: white; border-radius: 10px;"></iframe>`;
        } else {
            const processedHtml = processTemplate(htmlContent, chat);
            bubbleElement.innerHTML = DOMPurify.sanitize(processedHtml, { ADD_TAGS: ['style'], ADD_ATTR: ['style'] });
        }
    } else {
        bubbleElement = document.createElement('div');
        bubbleElement.className = `message-bubble ${isSent ? 'sent' : 'received'}`;
        let displayedContent = content;
        const plainTextMatch = content.match(/^\[.*?[：:]([\s\S]*)\]$/);
        if (plainTextMatch && plainTextMatch[1]) {
            displayedContent = plainTextMatch[1].trim();
        }
        displayedContent = displayedContent.replace(/\[发送时间:.*?\]/g, '').trim();

        if (currentChatType === 'private' && !isSent && chat.statusPanel && chat.statusPanel.enabled && chat.statusPanel.regexPattern && !isDebugMode) {
            try {
                let pattern = chat.statusPanel.regexPattern;
                let flags = 'gs';

                const matchParts = pattern.match(/^\/(.*?)\/([a-z]*)$/);
                if (matchParts) {
                    pattern = matchParts[1];
                    flags = matchParts[2] || 'gs';
                    if (!flags.includes('g')) flags += 'g';
                }

                const regex = new RegExp(pattern, flags);
                displayedContent = displayedContent.replace(regex, '').trim();
            } catch (e) {
                console.error("渲染时隐藏状态码失败:", e);
            }
        }

        bubbleElement.innerHTML = `<span class="bubble-content">${DOMPurify.sanitize(displayedContent)}</span>`;
        if (!chat.useCustomBubbleCss) {
            bubbleElement.style.backgroundColor = bubbleTheme.bg;
            bubbleElement.style.color = bubbleTheme.text;
        }
    }
    const nicknameHTML = (currentChatType === 'group' && !isSent && senderNickname) ? `<div class="group-nickname">${senderNickname}</div>` : '';

    // Time Stamp Logic
    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = timeString;

    const timestampStyle = chat.timestampStyle || 'bubble';

    // Append Time Stamp to Bubble (if style is bubble)
    // 小票、小剧场分享等卡片内部自带时间，不追加气泡外大时间戳
    if (bubbleElement && timestampStyle === 'bubble' && !bubbleElement.classList.contains('receipt-bubble') && !bubbleElement.classList.contains('theater-share-card-bubble')) {
        bubbleElement.appendChild(timeSpan);
    }
    
    // Create message-info element manually to allow appending timestamp if needed
    const messageInfo = document.createElement('div');
    messageInfo.className = 'message-info';
    const avatarImg = document.createElement('img');
    avatarImg.src = avatarUrl;
    avatarImg.className = avatarClass;
    messageInfo.appendChild(avatarImg);

    if (timestampStyle === 'avatar') {
        messageInfo.appendChild(timeSpan);
    }

    if (currentChatType === 'group' && !isSent) {
        // 群聊接收消息布局：头像左侧，右侧垂直排列昵称和气泡
        const contentContainer = document.createElement('div');
        contentContainer.className = 'group-msg-content';
        
        if (nicknameHTML) {
            contentContainer.innerHTML += nicknameHTML;
        }
        
        if (bubbleElement) {
            if (quote) {
                let quotedSenderName = '';
                if (quote.senderId === 'user_me') {
                    quotedSenderName = (currentChatType === 'private') ? chat.myName : chat.me.nickname;
                } else {
                    if (currentChatType === 'private') {
                        quotedSenderName = chat.remarkName;
                    } else {
                        const sender = chat.members.find(m => m.id === quote.senderId);
                        quotedSenderName = sender ? sender.groupNickname : '未知成员';
                    }
                }
                const quoteDiv = document.createElement('div');
                quoteDiv.className = 'quoted-message';
                const sanitizedQuotedText = DOMPurify.sanitize(quote.content, { ALLOWED_TAGS: [] });
                quoteDiv.innerHTML = `<span class="quoted-sender">回复 ${quotedSenderName}</span><p class="quoted-text">${sanitizedQuotedText}</p>`;
                bubbleElement.prepend(quoteDiv);
            }
            contentContainer.appendChild(bubbleElement);
        }
        
        bubbleRow.appendChild(messageInfo);
        bubbleRow.appendChild(contentContainer);
    } else {
        // 私聊或发送消息布局：保持原样
        bubbleRow.appendChild(messageInfo);
        
        if (bubbleElement) {
            if (quote) {
                let quotedSenderName = '';
                if (quote.senderId === 'user_me') {
                    quotedSenderName = (currentChatType === 'private') ? chat.myName : chat.me.nickname;
                } else {
                    if (currentChatType === 'private') {
                        quotedSenderName = chat.remarkName;
                    } else {
                        const sender = chat.members.find(m => m.id === quote.senderId);
                        quotedSenderName = sender ? sender.groupNickname : '未知成员';
                    }
                }
                const quoteDiv = document.createElement('div');
                quoteDiv.className = 'quoted-message';
                const sanitizedQuotedText = DOMPurify.sanitize(quote.content, { ALLOWED_TAGS: [] });
                quoteDiv.innerHTML = `<span class="quoted-sender">回复 ${quotedSenderName}</span><p class="quoted-text">${sanitizedQuotedText}</p>`;
                bubbleElement.prepend(quoteDiv);
            }
            bubbleRow.appendChild(bubbleElement);
        }
    }
    wrapper.prepend(bubbleRow);

    // 首条开场白且有多条可切换时，包一层并显示左右箭头
    const isFirstGreeting = currentChatType === 'private' &&
        chat.history && chat.history[0] && chat.history[0].id === id &&
        role === 'assistant' &&
        chat.alternateGreetings && Array.isArray(chat.alternateGreetings) && chat.alternateGreetings.length > 1;
    if (isFirstGreeting) {
        const container = document.createElement('div');
        container.className = 'greeting-switcher-container';
        const idx = Math.max(0, Math.min(chat.currentGreetingIndex || 0, chat.alternateGreetings.length - 1));
        container.innerHTML = `
            <div class="greeting-switcher-body"></div>
            <div class="greeting-switcher-btns">
                <button type="button" class="greeting-switcher-btn greeting-switcher-left" title="上一条开场白" aria-label="上一条">‹</button>
                <button type="button" class="greeting-switcher-btn greeting-switcher-right" title="下一条开场白" aria-label="下一条">›</button>
            </div>
        `;
        const body = container.querySelector('.greeting-switcher-body');
        body.appendChild(wrapper);
        const leftBtn = container.querySelector('.greeting-switcher-left');
        const rightBtn = container.querySelector('.greeting-switcher-right');
        const applyGreeting = (newIndex) => {
            if (!chat.history.length) return;
            const next = (newIndex + chat.alternateGreetings.length) % chat.alternateGreetings.length;
            chat.currentGreetingIndex = next;
            chat.history[0].content = chat.alternateGreetings[next];
            if (typeof saveData === 'function') saveData();
            renderMessages(false, true);
        };
        leftBtn.addEventListener('click', (e) => { e.stopPropagation(); applyGreeting(idx - 1); });
        rightBtn.addEventListener('click', (e) => { e.stopPropagation(); applyGreeting(idx + 1); });
        return container;
    }
    return wrapper;
}

// 全局函数：处理代付响应（用户回应角色的代付请求）
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
    if (typeof saveData === 'function') await saveData(); 
    renderMessages(false, true); 
};


function addMessageBubble(message, targetChatId, targetChatType) {
    if (targetChatId !== currentChatId || targetChatType !== currentChatType) {
        const senderChat = (targetChatType === 'private')
            ? db.characters.find(c => c.id === targetChatId)
            : db.groups.find(g => g.id === targetChatId);
        
        if (senderChat) {
            let invisibleRegex;
            if (senderChat.showStatusUpdateMsg) {
                // 在末尾添加 |<thinking>[\s\S]*?<\/thinking>
                invisibleRegex = /\[system:.*?\]|\[.*?已接收礼物\]|\[.*?(?:接收|退回).*?的转账\]|\[.*?同意了.*?的代付请求\]|\[.*?拒绝了.*?的代付请求\]|\[.*?拒绝了.*?的(?:视频|语音)通话\]|<thinking>[\s\S]*?<\/thinking>|^<thinking>[\s\S]*/;
            } else {
                // 在末尾添加 |<thinking>[\s\S]*?<\/thinking>
                invisibleRegex = /\[system:.*?\]|\[.*?更新状态为：.*?\]|\[.*?已接收礼物\]|\[.*?(?:接收|退回).*?的转账\]|\[.*?同意了.*?的代付请求\]|\[.*?拒绝了.*?的代付请求\]|\[.*?拒绝了.*?的(?:视频|语音)通话\]|<thinking>[\s\S]*?<\/thinking>|^<thinking>[\s\S]*/;
            }
            if (!invisibleRegex.test(message.content)) {
                senderChat.unreadCount = (senderChat.unreadCount || 0) + 1;
                saveData(); 
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
            
            showToast({
                avatar: senderAvatar,
                name: senderName,
                message: previewText.substring(0, 30)
            });
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
        } else {
            let isContinuous = false;
            let invisibleRegex;
            if (character.showStatusUpdateMsg) {
                // 修改：正则末尾增加了 |<thinking>[\s\S]*?<\/thinking>
                invisibleRegex = /\[.*?(?:接收|退回).*?的转账\]|\[.*?已接收礼物\]|\[.*?同意了.*?的代付请求\]|\[.*?拒绝了.*?的代付请求\]|\[system:.*?\]|\[.*?邀请.*?加入了群聊\]|\[.*?修改群名为：.*?\]|\[system-display:.*?\]|\[.*?拒绝了.*?的(?:视频|语音)通话\]|<thinking>[\s\S]*?<\/thinking>|^<thinking>[\s\S]*/;
            } else {
                // 修改：正则末尾增加了 |<thinking>[\s\S]*?<\/thinking>
                invisibleRegex = /\[.*?(?:接收|退回).*?的转账\]|\[.*?更新状态为：.*?\]|\[.*?已接收礼物\]|\[.*?同意了.*?的代付请求\]|\[.*?拒绝了.*?的代付请求\]|\[system:.*?\]|\[.*?邀请.*?加入了群聊\]|\[.*?修改群名为：.*?\]|\[system-display:.*?\]|\[.*?拒绝了.*?的(?:视频|语音)通话\]|<thinking>[\s\S]*?<\/thinking>|^<thinking>[\s\S]*/;
            }
            const isSystemMsg = /\[system:.*?\]|\[system-display:.*?\]/.test(message.content);

            if (!isSystemMsg && character.history.length > 1) {
                let prevMsg = null;
                for (let i = character.history.length - 2; i >= 0; i--) {
                    const candidate = character.history[i];
                    if (!invisibleRegex.test(candidate.content)) {
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
            const bubbleElement = createMessageBubbleElement(message, isContinuous);
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

                messageArea.appendChild(bubbleElement);
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
            invisibleRegex = /\[.*?(?:接收|退回).*?的转账\]|\[.*?已接收礼物\]|\[system:.*?\]|\[.*?邀请.*?加入了群聊\]|\[.*?修改群名为：.*?\]|\[system-display:.*?\]|\[.*?拒绝了.*?的(?:视频|语音)通话\]|<thinking>[\s\S]*?<\/thinking>|^<thinking>[\s\S]*/;
        } else {
            // 修改：正则末尾增加了 |<thinking>[\s\S]*?<\/thinking>
            invisibleRegex = /\[.*?(?:接收|退回).*?的转账\]|\[.*?更新状态为：.*?\]|\[.*?已接收礼物\]|\[system:.*?\]|\[.*?邀请.*?加入了群聊\]|\[.*?修改群名为：.*?\]|\[system-display:.*?\]|\[.*?拒绝了.*?的(?:视频|语音)通话\]|<thinking>[\s\S]*?<\/thinking>|^<thinking>[\s\S]*/;
        }
        const isSystemMsg = /\[system:.*?\]|\[system-display:.*?\]/.test(message.content);

        if (!isSystemMsg && group.history.length > 1) {
            let prevMsg = null;
            for (let i = group.history.length - 2; i >= 0; i--) {
                const candidate = group.history[i];
                if (!invisibleRegex.test(candidate.content)) {
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
        const bubbleElement = createMessageBubbleElement(message, isContinuous);
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
            messageArea.scrollTop = messageArea.scrollHeight;
        }
    }
}
