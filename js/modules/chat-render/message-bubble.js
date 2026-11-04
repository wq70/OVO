function extractVoiceMessageText(content) {
    const prefix = /\[(?:.+?)的语音[：:]/.exec(content);
    if (!prefix) return null;
    const start = prefix.index + prefix[0].length;
    const closingBracket = findClosingSquareBracket(content, prefix.index);
    // Preserve the legacy fallback for messages with unbalanced brackets.
    const end = closingBracket >= start ? closingBracket : content.indexOf(']', start);
    return end > start ? content.slice(start, end).trim() : null;
}

function createQuotedMessageElement(quote, chat, chatType) {
    let name;
    if (quote.senderId === 'user_me') {
        name = chatType === 'private' ? window.CharacterProfile?.getUserNickname(chat) || chat.myName : chat.me.nickname;
    } else if (chatType === 'private') {
        name = chat.remarkName;
    } else {
        const sender = chat.members.find(member => member.id === quote.senderId);
        name = sender ? sender.groupNickname : '未知成员';
    }

    const element = document.createElement('div');
    element.className = 'quoted-message';
    element.innerHTML = '<span class="quoted-sender"></span><p class="quoted-text"></p>';
    element.firstElementChild.textContent = `回复 ${name}`;
    element.lastElementChild.innerHTML = DOMPurify.sanitize(quote.content, { ALLOWED_TAGS: [] });
    return element;
}

function createMessageBubbleElement(message, isContinuous = false) {
    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    const showDebugContent = currentChatType === 'private' && !!chat.showDebugContent;
    const debugVisible = isDebugMode || showDebugContent;
    if (message.isMomentsActivity && !chat?.momentsSettings?.showActivityNarration) return null;
    // 旧版 MCP 活动卡没有消息 id；使用活动 id 补齐，沿用聊天的长按删除流程。
    if (message.type === 'mcp_activity' && !message.id && message.mcpActivity?.id) {
        message.id = `mcp_${message.mcpActivity.id}`;
    }
    // 这里需要把 isThinking 从 message 里解构出来
    let {role, content, timestamp, id, transferStatus, giftStatus, stickerData, senderId, quote, isWithdrawn, originalContent, isStatusUpdate, isThinking} = message;
    if (message.interactive?.mode === 'text' && typeof content === 'string') {
        content = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    // 角色消息中的 {{user}} 替换为当前对话的「我的名字」
    if (role === 'assistant' && chat && chat.myName && typeof content === 'string') {
        content = content.replace(/\{\{user\}\}/g, chat.myName);
    }
    // 【新增补丁】如果内容以 <thinking> 开头，强制标记为 isThinking
    // 防止因为数据库加载导致 isThinking 属性丢失，或者正则没匹配到的情况
    if (content && typeof content === 'string' && content.trim().startsWith('<thinking>')) {
        isThinking = true;
    }

    if (isThinking && !showDebugContent && (message.thinkingDisplay === 'summary' || message.thinkingDisplay === 'detail')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'message-wrapper received cot-thinking-visible';
        wrapper.dataset.id = id || '';
        const details = document.createElement('details');
        details.className = 'cot-thinking-details';
        const summary = document.createElement('summary');
        summary.textContent = message.thinkingDisplay === 'summary' ? '思考摘要' : '思考详情';
        const body = document.createElement('div');
        body.className = 'cot-thinking-body';
        const plain = String(content || '').replace(/^\s*<thinking>|<\/thinking>\s*$/g, '').trim();
        body.textContent = message.thinkingDisplay === 'summary' && plain.length > 180 ? `${plain.slice(0, 180)}…` : plain;
        details.append(summary, body);
        wrapper.appendChild(details);
        return wrapper;
    }

    // 拦截：如果是状态更新、思考过程或转账指令消息，且没开调试模式，直接不渲染
    if ((isStatusUpdate || isThinking || message.isTransferAction) && !debugVisible) return null;
    // 拦截：hiddenFromDisplay 标记的消息（如角色自知上下文消息），不渲染成气泡
    if (message.hiddenFromDisplay && !debugVisible) return null;

    // Explicit interactive pages bypass text-command regexes inside user scripts.
    if (!isWithdrawn && !isThinking && window.InteractiveMessages?.sourceOf(message)) {
        return window.InteractiveMessages.messageElement(message, chat, currentChatType, isContinuous);
    }

    if (message.type === 'profile_update' && window.CharacterProfile) {
        return window.CharacterProfile.renderMessage(message);
    }

    if (message.type === 'poke' && window.PokeSystem) {
        return window.PokeSystem.renderMessage(message, chat);
    }

    // MCP 活动卡是用户可见的执行状态，但永远不作为普通聊天内容发回模型。
    if (message.type === 'mcp_activity' && window.mcpManager && typeof window.mcpManager.renderMessageCard === 'function') {
        const wrapper = document.createElement('div');
        wrapper.className = 'message-wrapper received mcp-activity-wrapper';
        wrapper.dataset.id = id || '';
        wrapper.innerHTML = window.mcpManager.renderMessageCard(message);
        return wrapper;
    }

    // 节点系统：渲染独立摘要消息
    if (message.isNodeSummaryMsg) {
        const wrapper = document.createElement('div');
        wrapper.className = 'message-wrapper system-notification independent-summary-wrapper received';
        wrapper.dataset.id = id;
        wrapper.style.margin = '10px 0';
        
        const summaryText = db.nodeSummaryText || '摘要';
        const summaryEl = document.createElement('div');
        summaryEl.className = 'node-summary-container independent-summary';
        summaryEl.style.maxWidth = '90%';
        
        summaryEl.innerHTML = `
            <div class="node-summary-toggle">
                <span class="node-summary-star spin">☆</span>
                <span>${DOMPurify.sanitize(summaryText)}</span>
            </div>
            <div class="node-summary-content" style="display:none;">${DOMPurify.sanitize(message.content)}</div>
        `;
        
        summaryEl.querySelector('.node-summary-toggle').addEventListener('click', () => {
            const content = summaryEl.querySelector('.node-summary-content');
            content.style.display = content.style.display === 'none' ? 'block' : 'none';
        });
        
        wrapper.appendChild(summaryEl);
        return wrapper;
    }

    // 节点系统：渲染节点边界分割线
    if (message.isNodeBoundary) {
        const wrapper = document.createElement('div');
        wrapper.className = 'node-divider-wrapper';
        wrapper.dataset.id = id;
        
        const node = chat.nodes ? chat.nodes.find(n => n.id === message.nodeId) : null;
        const nodeName = node ? node.name : '未知节点';
        
        if (message.nodeAction === 'start') {
            wrapper.innerHTML = `
                <div class="node-divider-line"></div>
                <div class="node-divider-content active">
                    <div class="node-divider-icon pulse"></div>
                    <span>${DOMPurify.sanitize(nodeName)} 开启</span>
                </div>
                <div class="node-divider-line"></div>
            `;
        } else {
            wrapper.innerHTML = `
                <div class="node-divider-line"></div>
                <div class="node-divider-content node-end-text" style="cursor:pointer;" title="点击管理该节点">
                    <div class="node-divider-icon"></div>
                    <span>${DOMPurify.sanitize(nodeName)} 结束</span>
                </div>
                <div class="node-divider-line"></div>
            `;
            
            const textEl = wrapper.querySelector('.node-end-text');
            if (textEl) {
                textEl.addEventListener('click', () => {
                    if (typeof NodeSystem !== 'undefined') {
                        // 检查节点是否已经被收纳或删除
                        const char = db.characters.find(c => c.id === currentChatId);
                        if (char && char.nodes) {
                            const node = char.nodes.find(n => n.id === message.nodeId);
                            if (node && node.status !== 'archived') {
                                document.getElementById('node-end-name').textContent = nodeName;
                                const modal = document.getElementById('node-end-modal');
                                // 临时将 activeNodeId 设为该节点，以便 endNode 逻辑能正确找到它
                                char.activeNodeId = message.nodeId;
                                modal.classList.add('visible');
                            } else {
                                showToast('该节点已收纳或删除，请在节点大厅管理');
                            }
                        }
                    }
                });
            }
        }
        return wrapper;
    }

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

    const isBilingualMode = chat.bilingualModeEnabled && (currentChatType !== 'group' || !chat.bilingualMembers?.length || chat.bilingualMembers.includes(senderId));
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
        avatarImg.dataset.pokeTargetId = senderId || chat.id;
        avatarImg.setAttribute('aria-label', `${senderNickname || chat.remarkName || chat.realName || '角色'}头像，连点两次拍一拍`);
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
            translationDiv.className = chat.autoExpandTranslation === true ? 'translation-text active' : 'translation-text';
            translationDiv.textContent = chineseText;
            wrapper.appendChild(translationDiv);
        }

        if (quote) bubbleElement.prepend(createQuotedMessageElement(quote, chat, currentChatType));

        return wrapper;
    }

    const timeSkipRegex = /\[system-display:([\s\S]+?)\]/;
    const inviteRegex = /\[(.*?)邀请(.*?)加入了群聊\]/;
    const renameRegex = /\[(.*?)修改群名为[：:](.*?)\]/;
    const updateStatusRegex = /\[(.*?)更新状态为[：:](.*?)\]/;
    const callInviteRegex = /\[(.*?)向(.*?)发起了(视频|语音)通话\]/;
    const callRejectRegex = /\[(.*?)拒绝了(.*?)的(视频|语音)通话\]/;
    const reminderMsgRegex = /\[(.*?)(?:创建了提醒|添加了待办|完成了待办|提醒你|的待办到期|提醒.*?)[：:](.*?)\]/;

    const timeSkipMatch = content.match(timeSkipRegex);
    const inviteMatch = content.match(inviteRegex);
    const renameMatch = content.match(renameRegex);
    const updateStatusMatch = content.match(updateStatusRegex);
    const callInviteMatch = content.match(callInviteRegex);
    const callRejectMatch = content.match(callRejectRegex);
    const reminderMsgMatch = message.isReminderMsg ? content.match(reminderMsgRegex) : null;

    // 私聊消息正则
    const privateRegex = /^\[Private: (.*?) -> (.*?): ([\s\S]+?)\]$/;
    const privateEndRegex = /^\[Private-End: (.*?) -> (.*?)\]$/;

    let invisibleRegex;
    if (chat.showStatusUpdateMsg) {
        invisibleRegex = /\[.*?(?:接收|退回).*?的转账\]|\[.*?(?:接收|退还).*?的亲属卡\]|\[.*?(?:冻结|解冻|收回)了(?:给.*?的)?亲属卡\]|\[.*?调整(?:给.*?的)?亲属卡额度为：.*?\]|\[.*?已接收礼物\]|\[system:.*?\]|\[系统情景通知：.*?\]|\[.*?同意了.*?的代付请求\]|\[.*?拒绝了.*?的代付请求\]|<thinking>[\s\S]*?<\/thinking>|^<thinking>[\s\S]*/;
    } else {
        invisibleRegex = /\[.*?(?:接收|退回).*?的转账\]|\[.*?(?:接收|退还).*?的亲属卡\]|\[.*?(?:冻结|解冻|收回)了(?:给.*?的)?亲属卡\]|\[.*?调整(?:给.*?的)?亲属卡额度为：.*?\]|\[.*?更新状态为：.*?\]|\[.*?已接收礼物\]|\[system:.*?\]|\[系统情景通知：.*?\]|\[.*?同意了.*?的代付请求\]|\[.*?拒绝了.*?的代付请求\]|<thinking>[\s\S]*?<\/thinking>|^<thinking>[\s\S]*/;
    }

    let isDebugHiddenMsg = false;
    // 提醒事项消息：开关关闭时隐藏
    const isHiddenReminder = message.isReminderMsg && chat.showReminderMsg === false;
    // 头像操作消息：开关关闭时隐藏
    const avatarActionMatch = content.match(/^\[avatar-action:([\s\S]+?)\]$/);
    const isHiddenAvatarAction = !!avatarActionMatch && !chat.showAvatarActionMsg;
    // 在这里增加 || isThinking，只要标记为思考中，就强制走隐形消息逻辑
    if (invisibleRegex.test(content) || privateRegex.test(content) || privateEndRegex.test(content) || isThinking || isHiddenReminder || isHiddenAvatarAction || (showDebugContent && (isStatusUpdate || message.isTransferAction || message.hiddenFromDisplay))) {
        if (!debugVisible) return null;
        isDebugHiddenMsg = true;       
    }

    const wrapper = document.createElement('div');
    wrapper.dataset.id = id;
    if (isDebugHiddenMsg) {
        wrapper.className = showDebugContent ? 'message-wrapper received debug-thought-visible' : 'message-wrapper received';
        if (showDebugContent) {
            wrapper.dataset.debugTimestamp = String(timestamp || 0);
            if (message.replyRequestId) wrapper.dataset.replyRequestId = message.replyRequestId;
            const details = document.createElement('details');
            details.className = 'debug-thought-details';
            const summary = document.createElement('summary');
            summary.textContent = '我思故我在';
            const body = document.createElement('div');
            body.className = 'debug-thought-body';
            const entry = document.createElement('div');
            entry.className = 'message-wrapper debug-thought-entry';
            entry.dataset.id = id || '';
            if (message.isContextDisabled) entry.classList.add('context-disabled');
            entry.textContent = String(content || '');
            body.appendChild(entry);
            details.append(summary, body);
            wrapper.appendChild(details);
        } else {
            if (message.isContextDisabled) wrapper.classList.add('context-disabled');
            const bubbleRow = document.createElement('div');
            bubbleRow.className = 'message-bubble-row';
            const bubble = document.createElement('div');
            bubble.className = 'message-bubble debug-visible';
            bubble.textContent = content;
            bubbleRow.appendChild(bubble);
            wrapper.appendChild(bubbleRow);
        }
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
    // 头像操作消息：开关开启时渲染为灰色系统通知
    if (avatarActionMatch && chat.showAvatarActionMsg && !isThinking) {
        wrapper.className = 'message-wrapper system-notification';
        if (message.isContextDisabled) wrapper.classList.add('context-disabled');
        wrapper.innerHTML = `<div class="system-notification-bubble">💫 ${DOMPurify.sanitize(avatarActionMatch[1])}</div>`;
        return wrapper;
    }
    // 【新增】 && !isThinking —— 只有当不是思考过程时，才允许渲染成系统通知气泡
    if ((timeSkipMatch || inviteMatch || renameMatch || (updateStatusMatch && chat.showStatusUpdateMsg) || callInviteMatch || callRejectMatch || (reminderMsgMatch && chat.showReminderMsg !== false)) && !isThinking) {
        wrapper.className = 'message-wrapper system-notification';
        if (message.isContextDisabled) wrapper.classList.add('context-disabled');
        let bubbleText = '';
        if (timeSkipMatch) bubbleText = timeSkipMatch[1];
        if (inviteMatch) bubbleText = `${inviteMatch[1]}邀请${inviteMatch[2]}加入了群聊`;
        if (renameMatch) bubbleText = `${renameMatch[1]}修改群名为“${renameMatch[2]}”`;
        if (updateStatusMatch) bubbleText = `${updateStatusMatch[1]} 更新状态为：${updateStatusMatch[2]}`;
        if (callInviteMatch) bubbleText = `${callInviteMatch[1]}向${callInviteMatch[2]}发起了${callInviteMatch[3]}通话`;
        if (callRejectMatch) bubbleText = `${callRejectMatch[1]}拒绝了${callRejectMatch[2]}的${callRejectMatch[3]}通话`;
        if (reminderMsgMatch) bubbleText = content.replace(/^\[/, '').replace(/\]$/, '');
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
        } else if (message.isMomentsActivity) {
            const bubble = document.createElement('div');
            bubble.className = 'system-notification-bubble';
            bubble.textContent = bubbleText;
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
    
    const photoVideoRegex = /\[(?:.+?)发来的照片\/视频[：:]([\s\S]+?)\]/;
    const privateSentTransferRegex = /\[.*?给你转账[：:]([\d.,]+)元[；;]备注[：:](.*?)\]/;
    const privateReceivedTransferRegex = /\[.*?的转账[：:]([\d.,]+)元[；;]备注[：:](.*?)\]/;
    const groupTransferRegex = /\[(.*?)\s*向\s*(.*?)\s*转账[：:]([\d.,]+)元[；;]备注[：:](.*?)\]/;
    const familyCardGiftRegex = /\[(.+?)赠送(.+?)亲属卡[：:]额度([\d.,]+)元[；;]刷新周期[：:](.+?)\]/;
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
    const voiceText = extractVoiceMessageText(content);
    const photoVideoMatch = content.match(photoVideoRegex);
    const privateSentTransferMatch = content.match(privateSentTransferRegex);
    const privateReceivedTransferMatch = content.match(privateReceivedTransferRegex);
    const groupTransferMatch = content.match(groupTransferRegex);
    const familyCardGiftMatch = content.match(familyCardGiftRegex);
    const familyCardData = (message.familyCardId && db.piggyBank && db.piggyBank.familyCards) ? db.piggyBank.familyCards.find(c => c.id === message.familyCardId) : null;
    const receivedFamilyCardData = (message.receivedFamilyCardId && db.piggyBank && db.piggyBank.receivedFamilyCards) ? db.piggyBank.receivedFamilyCards.find(c => c.id === message.receivedFamilyCardId) : null;
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
        const itemsStr = shopOrderMatchNew[5].replace(/[；;]\s*支付方式[：:]\s*(?:用户)?亲属卡\s*$/i, '').trim();
        const paymentLabel = message.shopPaymentStatus === 'failed'
            ? `订单未完成：${message.shopPaymentError || '支付失败'}`
            : (message.shopPaymentSource === 'user_family_card' ? '亲属卡已支付' : '已支付');
        
        // 解析商品列表字符串 "汉堡 x2, 可乐 x1" -> [{name, qty}]
        const items = itemsStr.split(/,\s*/).map(s => {
            const parts = s.match(/(.+?)\s*x(\d+)$/);
            if (parts) {
                return { name: DOMPurify.sanitize(parts[1]), qty: parts[2] };
            }
            return { name: DOMPurify.sanitize(s), qty: 1 };
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
                    <span>${DOMPurify.sanitize(`${isPickup ? '门店自提' : deliveryType} · ${paymentLabel}`)}</span>
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
        bubbleElement.className = 'image-bubble sticker-bubble';
        let stickerSrc = '';
        
        // 新消息保存发送时选定的图片；旧消息仍按名称查找以兼容历史记录。
        if (stickerData) {
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
        bubbleElement.innerHTML = `<img src="${stickerSrc}" alt="表情包" onclick="openImageViewer(this.src)" style="cursor: zoom-in;">`;
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
    } else if (voiceText !== null) {
        bubbleElement = document.createElement('div');
        bubbleElement.className = 'voice-bubble';
        bubbleElement.dataset.voiceText = voiceText;
        if (!chat.useCustomBubbleCss) {
            bubbleElement.style.backgroundColor = bubbleTheme.bg;
            bubbleElement.style.color = bubbleTheme.text;
        }
        bubbleElement.innerHTML = `<svg class="play-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg><svg class="pause-icon" viewBox="0 0 24 24" fill="currentColor" style="display:none;"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg><span class="duration">${calculateVoiceDuration(voiceText)}"</span>`;
        const transcriptDiv = document.createElement('div');
        transcriptDiv.className = 'voice-transcript';
        transcriptDiv.textContent = window.TTSService?.formatVoiceTranscript(voiceText, isSent) ?? voiceText;
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
            bubbleElement.className = 'image-bubble photo-bubble';
            bubbleElement.innerHTML = `<img src="${realPhotoUrl}" alt="${pvContent}" onclick="openImageViewer(this.src, '${message.id}')" style="cursor: zoom-in;">`;
        } else {
            // === 自动生图逻辑 (NovelAI 或 GPT) ===
            const gptEnabled = db.gptImageSettings && db.gptImageSettings.enabled && db.gptImageSettings.url && db.gptImageSettings.key;
            const naiEnabled = db.novelAiSettings && db.novelAiSettings.enabled && (db.novelAiSettings.token || db.novelAiSettings.authMode === 'none');
            const googleEnabled = db.googleImageSettings?.enabled && db.googleImageSettings?.key;
            const stabilityEnabled = db.stabilityImageSettings?.enabled && db.stabilityImageSettings?.key;
            const _imgEnabled = gptEnabled || naiEnabled || googleEnabled || stabilityEnabled;
            
            if (message.isNovelAiGenerating) {
                // 后台生图进行中...
                let bgStyle = '';
                let bgOverlay = '';
                let currentUrl = message.novelAiImageUrl;
                if (message._imageVersions && message._currentImageIndex !== undefined) {
                    if (message._currentImageIndex < message._imageVersions.length) {
                        currentUrl = message._imageVersions[message._currentImageIndex].imageUrl;
                    }
                }
                if (currentUrl) {
                    bgStyle = `background-image: url('${currentUrl}'); background-size: cover; background-position: center;`;
                    bgOverlay = `<div style="position: absolute; top:0; left:0; right:0; bottom:0; background: rgba(255,255,255,0.7); backdrop-filter: blur(4px);"></div>`;
                }

                bubbleElement = document.createElement('div');
                bubbleElement.className = 'image-bubble nai-generating';
                bubbleElement.innerHTML = `
                    <div class="nai-loading-card" style="width: 84px; height: 84px; border-radius: 8px; background: #f0f0f0; ${bgStyle} display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; overflow: hidden; position: relative;">
                        ${bgOverlay}
                        <div class="nai-loading-shimmer" style="position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent); animation: nai-shimmer 1.5s infinite;"></div>
                        <div style="width: 16px; height: 16px; border: 2px solid #ccc; border-top-color: #999; border-radius: 50%; animation: nai-spin 0.8s linear infinite; z-index: 1;"></div>
                        <span style="font-size: 10px; color: ${currentUrl ? '#333' : '#999'}; font-weight: ${currentUrl ? 'bold' : 'normal'}; z-index: 1; transform: scale(0.8);">作画中</span>
                    </div>`;
            } else if (message.novelAiImageUrl) {
                // 已有生成好的图片
                let currentUrl = message.novelAiImageUrl;
                let versionsCount = (message._imageVersions ? message._imageVersions.length : 0) + 1;
                let currentIdx = message._currentImageIndex !== undefined ? message._currentImageIndex : versionsCount - 1;
                
                if (message._imageVersions && currentIdx < message._imageVersions.length) {
                    currentUrl = message._imageVersions[currentIdx].imageUrl;
                }

                bubbleElement = document.createElement('div');
                bubbleElement.className = 'image-bubble';

                bubbleElement.innerHTML = `
                    <img src="${currentUrl}" alt="${pvContent}" onclick="openImageViewer(this.src, '${message.id}')" style="cursor: zoom-in; display: block;">
                `;
            } else if (message.novelAiError) {
                // 生图失败卡片
                bubbleElement = document.createElement('div');
                bubbleElement.className = 'pv-card';
                const displayContent = pvContent.replace(/\{\{[\s\S]+?\}\}/, '').trim();
                const errMsg = message.novelAiError;
                const safeErrMsg = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(errMsg) : errMsg;
                const encodedErrMsg = encodeURIComponent(errMsg);
                bubbleElement.innerHTML = `
                    <div class="pv-card-content">${displayContent}</div>
                    <div class="pv-card-image-overlay" style="background-image: url('${isSent ? 'https://i.postimg.cc/L8NFrBrW/1752307494497.jpg' : 'https://i.postimg.cc/1tH6ds9g/1752301200490.jpg'}'); filter: grayscale(1) opacity(0.3);"></div>
                    <div class="pv-card-footer" style="flex-direction: column; align-items: stretch; gap: 8px;">
                        <div style="display: flex; align-items: center; gap: 5px; color: #d32f2f;">
                            <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; flex-shrink: 0;"><path fill="currentColor" d="M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z" /></svg>
                            <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px;">${safeErrMsg}</span>
                        </div>
                        <div style="display: flex; gap: 8px; pointer-events: auto;">
                            <button class="btn btn-small btn-neutral" style="flex: 1; font-size: 11px; padding: 4px; background: #eee; border: none;" onclick="window.showErrorModal('生图出错了', new Error(decodeURIComponent('${encodedErrMsg}')))">查看报错</button>
                            <button class="btn btn-small btn-primary" style="flex: 1; font-size: 11px; padding: 4px; border: none;" onclick="window.retryImageGen('${message.id}', '${currentChatId}', '${currentChatType}')">重新生成</button>
                        </div>
                    </div>`;
            } else if (_imgEnabled && !isSent && _naiAutoGenNewMsgIds.has(message.id)) {
                // 首次触发静默生图
                message.isNovelAiGenerating = true;
                bubbleElement = document.createElement('div');
                bubbleElement.className = 'image-bubble nai-generating';
                bubbleElement.innerHTML = `
                    <div class="nai-loading-card" style="width: 84px; height: 84px; border-radius: 8px; background: #f0f0f0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; overflow: hidden; position: relative;">
                        <div class="nai-loading-shimmer" style="position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent); animation: nai-shimmer 1.5s infinite;"></div>
                        <div style="width: 16px; height: 16px; border: 2px solid #ccc; border-top-color: #999; border-radius: 50%; animation: nai-spin 0.8s linear infinite;"></div>
                        <span style="font-size: 10px; color: #999; z-index: 1; transform: scale(0.8);">作画中</span>
                    </div>`;
                
                // 将任务放入队列并在后台处理，不再和 DOM 直接绑定
                window._scheduleBackgroundNaiGen(message.id, currentChatId, currentChatType, pvContent);
                _naiAutoGenNewMsgIds.delete(message.id);
            } else {
                // 生图未启用或是用户发的，显示原始 pv-card
                const displayContent = pvContent.replace(/\{\{[\s\S]+?\}\}/, '').trim() || pvContent;
                bubbleElement = document.createElement('div');
                bubbleElement.className = 'pv-card';
                bubbleElement.innerHTML = `<div class="pv-card-content">${displayContent}</div><div class="pv-card-image-overlay" style="background-image: url('${isSent ? 'https://i.postimg.cc/L8NFrBrW/1752307494497.jpg' : 'https://i.postimg.cc/1tH6ds9g/1752301200490.jpg'}');"></div><div class="pv-card-footer"><svg viewBox="0 0 24 24"><path d="M4,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M4,6V18H20V6H4M10,9A1,1 0 0,1 11,10A1,1 0 0,1 10,11A1,1 0 0,1 9,10A1,1 0 0,1 10,9M8,17L11,13L13,15L17,10L20,14V17H8Z"></path></svg><span>照片/视频・点击查看</span></div>`;
            }
        }
    } else if (familyCardGiftMatch || familyCardData || receivedFamilyCardData) {
        const card = familyCardData || receivedFamilyCardData;
        const status = message.familyCardStatus || message.receivedFamilyCardStatus || 'pending';
        const statusText = status === 'accepted' ? '已接收' : status === 'returned' ? '已退还' : status === 'revoked' ? '已收回' : status === 'frozen' ? '已冻结' : status === 'replaced' ? '已替换' : '待接收';
        const cardNum = card ? card.cardNumber : '****';
        const limitNum = card ? card.limit : (familyCardGiftMatch ? familyCardGiftMatch[3] : '');
        const periodText = card ? (card.refreshPeriod === 'daily' ? '每天' : card.refreshPeriod === 'weekly' ? '每周' : card.refreshPeriod === 'monthly' ? '每月' : (card.refreshDays || 30) + '天') : (familyCardGiftMatch ? familyCardGiftMatch[4] : '');
        const holderName = isSent ? (card ? card.targetCharName : (familyCardGiftMatch ? familyCardGiftMatch[2] : '')) : (card ? card.fromCharName : '');
        const now = new Date(timestamp);
        const dateStr = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const cardIdShort = (card && card.id) ? card.id.slice(-8) : String(timestamp).slice(-8);
        let actionButtonsHtml = '';
        if (!isSent && status === 'pending') {
            actionButtonsHtml = `
                <div class="receipt-actions">
                    <button class="receipt-action-btn family-card-accept" data-msg-id="${DOMPurify.sanitize(id)}">接收</button>
                    <button class="receipt-action-btn family-card-return" data-msg-id="${DOMPurify.sanitize(id)}">退回</button>
                </div>`;
        }
        bubbleElement = document.createElement('div');
        bubbleElement.className = 'receipt-bubble family-card-receipt ' + (isSent ? 'sent' : 'received') + (status !== 'pending' ? ' ' + status : '');
        bubbleElement.innerHTML = `
            <div class="receipt-header">
                <div class="receipt-brand">亲 属 卡</div>
                <div class="receipt-id">CARD.${DOMPurify.sanitize(cardIdShort)}</div>
            </div>
            <div class="receipt-items">
                <div class="receipt-item-row">
                    <span class="receipt-item-name">持卡人</span>
                    <span class="receipt-dots"></span>
                    <span class="receipt-item-qty">${DOMPurify.sanitize(holderName || '—')}</span>
                </div>
                <div class="receipt-item-row">
                    <span class="receipt-item-name">刷新周期</span>
                    <span class="receipt-dots"></span>
                    <span class="receipt-item-qty">${DOMPurify.sanitize(periodText || '—')}</span>
                </div>
            </div>
            <div class="receipt-total-section">
                <span class="receipt-total-price">¥${DOMPurify.sanitize(String(limitNum))}</span>
            </div>
            <div class="receipt-footer">
                <div class="receipt-delivery-info">
                    <span class="family-card-status-text">${DOMPurify.sanitize(statusText)}</span>
                    <span>${DOMPurify.sanitize(dateStr)}</span>
                </div>
                ${actionButtonsHtml}
            </div>`;
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
        bubbleElement.className = 'image-bubble photo-bubble';
        const imagePart = message.parts && message.parts.find(part => part && part.type === 'image' && part.data);
        const imageSource = imagePart ? imagePart.data : content;
        bubbleElement.innerHTML = `<img src="${imageSource}" alt="图片消息" onclick="openImageViewer(this.src, '${message.id}')" style="cursor: zoom-in;">`;
    } else if (textMatch) {
        bubbleElement = document.createElement('div');
        bubbleElement.className = `message-bubble ${isSent ? 'sent' : 'received'}`;
        let userText = textMatch[1].trim().replace(/\[发送时间:.*?\]/g, '').trim();
        bubbleElement.innerHTML = `<span class="bubble-content">${DOMPurify.sanitize(userText)}</span>`;
        if (!chat.useCustomBubbleCss) {
            bubbleElement.style.backgroundColor = bubbleTheme.bg;
            bubbleElement.style.color = bubbleTheme.text;
        }
    } else if (message && message.interactive?.mode !== 'text' && Array.isArray(message.parts) && message.parts.length > 0 && message.parts[0].type === 'html') {
        bubbleElement = document.createElement('div');
        bubbleElement.className = `message-bubble ${isSent ? 'sent' : 'received'} html-bubble`;
        let htmlContent = message.parts[0].text;
        htmlContent = htmlContent.replace(/<uwuxjc>/gi, '').replace(/<\/uwuxjc>/gi, '').trim();
        if (htmlContent.includes('<!DOCTYPE html>') || htmlContent.includes('<html')) {
            const processedHtml = processTemplate(htmlContent, chat);
            const frame = document.createElement('iframe');
            frame.setAttribute('sandbox', ''); // Static fallback when the interactive runtime is unavailable.
            frame.title = 'HTML 消息';
            frame.style.cssText = 'width:100%;min-width:0;height:350px;border:none;background:white;border-radius:10px';
            frame.srcdoc = processedHtml;
            bubbleElement.appendChild(frame);
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
    // 小票、小剧场分享、亲属卡等卡片内部自带时间，不追加气泡外大时间戳
    if (bubbleElement && timestampStyle === 'bubble' && !bubbleElement.classList.contains('receipt-bubble') && !bubbleElement.classList.contains('theater-share-card-bubble') && !bubbleElement.classList.contains('family-card-receipt')) {
        bubbleElement.appendChild(timeSpan);
    }
    
    // Create message-info element manually to allow appending timestamp if needed
    const messageInfo = document.createElement('div');
    messageInfo.className = 'message-info';
    const avatarImg = document.createElement('img');
    avatarImg.src = avatarUrl;
    avatarImg.className = avatarClass;
    avatarImg.dataset.pokeTargetId = messageSenderId || (currentChatType === 'private' ? chat.id : '');
    avatarImg.setAttribute('aria-label', `${isSent ? '我' : (senderNickname || chat.remarkName || chat.realName || '角色')}的头像，连点两次拍一拍`);
    messageInfo.appendChild(avatarImg);

    if (timestampStyle === 'avatar') {
        messageInfo.appendChild(timeSpan);
    }

    if (quote && bubbleElement) bubbleElement.prepend(createQuotedMessageElement(quote, chat, currentChatType));

    if (currentChatType === 'group' && !isSent) {
        // 群聊接收消息布局：头像左侧，右侧垂直排列昵称和气泡
        const contentContainer = document.createElement('div');
        contentContainer.className = 'group-msg-content';
        
        if (nicknameHTML) {
            contentContainer.innerHTML += nicknameHTML;
        }
        
        if (bubbleElement) {
            contentContainer.appendChild(bubbleElement);
        }
        
        bubbleRow.appendChild(messageInfo);
        bubbleRow.appendChild(contentContainer);
    } else {
        // 私聊或发送消息布局：保持原样
        bubbleRow.appendChild(messageInfo);
        
        if (bubbleElement) {
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
            if (currentChatType === 'group' && typeof saveGroup === 'function') saveGroup(currentChatId);
            else if (currentChatType === 'private' && typeof saveCharacter === 'function') saveCharacter(currentChatId);
            else if (typeof saveData === 'function') saveData();
            renderMessages(false, true);
        };
        leftBtn.addEventListener('click', (e) => { e.stopPropagation(); applyGreeting(idx - 1); });
        rightBtn.addEventListener('click', (e) => { e.stopPropagation(); applyGreeting(idx + 1); });
        return container;
    }
    return wrapper;
}

// 全局函数：处理代付响应（用户回应角色的代付请求）
