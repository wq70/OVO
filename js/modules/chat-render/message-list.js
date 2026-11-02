// --- 消息渲染模块 ---

// NovelAI 自动生图队列（避免同时发出大量请求）
const _naiAutoGenQueue = [];
let _naiAutoGenRunning = false;
// 标记：仅新消息触发自动生图，历史消息加载时不触发
let _naiAutoGenNewMsgIds = new Set();
function appendChatBubble(container, bubble) {
    const previous = container.lastElementChild;
    if (bubble.classList.contains('debug-thought-visible') && previous?.classList.contains('debug-thought-visible')) {
        const previousRequestId = previous.dataset.replyRequestId;
        const nextRequestId = bubble.dataset.replyRequestId;
        const previousTime = Number(previous.dataset.debugTimestamp);
        const nextTime = Number(bubble.dataset.debugTimestamp);
        const sameReply = previousRequestId && nextRequestId
            ? previousRequestId === nextRequestId
            : previousTime > 0 && nextTime > 0 && Math.abs(nextTime - previousTime) < 60000;
        const previousBody = previous.querySelector('.debug-thought-body');
        const nextBody = bubble.querySelector('.debug-thought-body');
        if (sameReply && previousBody && nextBody) {
            while (nextBody.firstChild) previousBody.appendChild(nextBody.firstChild);
            previous.dataset.debugTimestamp = bubble.dataset.debugTimestamp;
            return previous;
        }
    }
    container.appendChild(bubble);
    return bubble;
}
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
    
    // 节点系统：过滤掉已收纳节点的消息
    let displayHistory = chat.history;
    if (currentChatType === 'private' && chat.nodes) {
        const archivedNodeIds = new Set(chat.nodes.filter(n => n.status === 'archived').map(n => n.id));
        if (archivedNodeIds.size > 0) {
            let currentArchivedNodeId = null;
            displayHistory = chat.history.filter(m => {
                // 如果消息本身带有 nodeId 且该节点已被收纳，直接过滤掉（包括 start 和 end 边界消息）
                if (m.nodeId && archivedNodeIds.has(m.nodeId)) {
                    return false;
                }
                
                // 兼容旧逻辑：处理没有 nodeId 的普通消息，通过 start/end 边界来判断
                if (m.isNodeBoundary) {
                    if (m.nodeAction === 'start' && archivedNodeIds.has(m.nodeId)) {
                        currentArchivedNodeId = m.nodeId;
                        return false;
                    }
                    if (m.nodeAction === 'end' && m.nodeId === currentArchivedNodeId) {
                        currentArchivedNodeId = null;
                        return false;
                    }
                }
                if (currentArchivedNodeId) return false;
                return true;
            });
        }
    }
    if (currentChatType === 'private' && !chat.momentsSettings?.showActivityNarration) displayHistory = displayHistory.filter(message => !message.isMomentsActivity);

    const totalMessages = displayHistory.length;
    
    // 确保 MESSAGES_PER_PAGE 存在
    const pageSize = (typeof MESSAGES_PER_PAGE !== 'undefined') ? MESSAGES_PER_PAGE : 20;

    const end = totalMessages - (currentPage - 1) * pageSize;
    const start = Math.max(0, end - pageSize);
    const messagesToRender = displayHistory.slice(start, end);
    if (!isLoadMore && !window.InteractiveMessages) messageArea.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    let lastMsgTime = 0;
    
    if (start > 0) {
        lastMsgTime = displayHistory[start - 1].timestamp;
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
            invisibleRegex = /\[.*?(?:接收|退回).*?的转账\]|\[.*?(?:接收|退还).*?的亲属卡\]|\[.*?(?:冻结|解冻|收回)了(?:给.*?的)?亲属卡\]|\[.*?调整(?:给.*?的)?亲属卡额度为：.*?\]|\[.*?已接收礼物\]|\[system:.*?\]|\[.*?邀请.*?加入了群聊\]|\[.*?修改群名为：.*?\]|\[system-display:.*?\]|\[.*?同意了.*?的代付请求\]|\[.*?拒绝了.*?的代付请求\]|\[avatar-action:.*?\]|<thinking>[\s\S]*?<\/thinking>|^<thinking>[\s\S]*/;
        } else {
            invisibleRegex = /\[.*?(?:接收|退回).*?的转账\]|\[.*?(?:接收|退还).*?的亲属卡\]|\[.*?(?:冻结|解冻|收回)了(?:给.*?的)?亲属卡\]|\[.*?调整(?:给.*?的)?亲属卡额度为：.*?\]|\[.*?更新状态为：.*?\]|\[.*?已接收礼物\]|\[system:.*?\]|\[.*?邀请.*?加入了群聊\]|\[.*?修改群名为：.*?\]|\[system-display:.*?\]|\[.*?同意了.*?的代付请求\]|\[.*?拒绝了.*?的代付请求\]|\[avatar-action:.*?\]|<thinking>[\s\S]*?<\/thinking>|^<thinking>[\s\S]*/;
        }

        const isSystemMsg = /\[system:.*?\]|\[system-display:.*?\]/.test(msg.content) || msg.isNodeBoundary || msg.type === 'poke';
        
        if (!isSystemMsg) {
            let prevMsg = null;
            let currentIndexInHistory = start + index;
            
            for (let i = currentIndexInHistory - 1; i >= 0; i--) {
                const candidate = displayHistory[i];
                // 跳过隐藏的上下文消息（如角色自知消息），不影响连续消息判断
                if (candidate.hiddenFromDisplay || candidate.isNodeBoundary || candidate.type === 'poke') continue;
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
        if (bubble) {
            appendChatBubble(fragment, bubble);
            
            // 节点系统：渲染独立摘要
            if (msg.nodeSummary) {
                // 判断是否是连续带有相同摘要的最后一条消息
                let isLastSummaryMsg = true;
                let currentIndexInHistory = start + index;
                
                // 往后找下一条可见消息
                for (let i = currentIndexInHistory + 1; i < displayHistory.length; i++) {
                    const nextMsg = displayHistory[i];
                    // 跳过隐藏消息
                    if (nextMsg.hiddenFromDisplay || nextMsg.isNodeBoundary || (nextMsg.isThinking && nextMsg.thinkingDisplay !== 'summary' && nextMsg.thinkingDisplay !== 'detail')) continue;
                    
                    // 如果下一条消息是同一个发送者，且带有相同的摘要，则当前消息不是最后一条
                    const currentSender = msg.role === 'user' ? 'user' : (msg.senderId || 'assistant');
                    const nextSender = nextMsg.role === 'user' ? 'user' : (nextMsg.senderId || 'assistant');
                    
                    if (currentSender === nextSender && nextMsg.nodeSummary === msg.nodeSummary) {
                        isLastSummaryMsg = false;
                    }
                    break; // 只看下一条可见消息
                }

                if (isLastSummaryMsg) {
                    const summaryText = db.nodeSummaryText || '摘要';
                    const summaryWrapper = document.createElement('div');
                    const roleClass = msg.role === 'user' ? 'sent' : 'received';
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
                        <div class="node-summary-content" style="display:none;">${DOMPurify.sanitize(msg.nodeSummary)}</div>
                    `;
                    summaryEl.querySelector('.node-summary-toggle').addEventListener('click', () => {
                        const content = summaryEl.querySelector('.node-summary-content');
                        content.style.display = content.style.display === 'none' ? 'block' : 'none';
                    });
                    
                    summaryWrapper.appendChild(summaryEl);
                    fragment.appendChild(summaryWrapper);
                }
            }
        }
    });
    const existingLoadBtn = document.getElementById('load-more-btn');
    if (existingLoadBtn) existingLoadBtn.remove();
    const existingLoadNewerBtn = document.getElementById('load-newer-btn');
    if (existingLoadNewerBtn) existingLoadNewerBtn.remove();
    if (window.InteractiveMessages) window.InteractiveMessages.commit(messageArea, fragment, isLoadMore);
    else messageArea.prepend(fragment);
    
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

