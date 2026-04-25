// --- 消息操作模块 (编辑、撤回、多选、截图、历史记录管理) ---

let currentMultiSelectMode = 'delete'; // 'delete' or 'capture'

function handleMessageLongPress(messageWrapper, x, y) {
    if (isInMultiSelectMode) return;
    clearTimeout(longPressTimer);
    // 清除可能存在的文本选择，防止干扰菜单点击
    if (window.getSelection) {
        window.getSelection().removeAllRanges();
    }
    const messageId = messageWrapper.dataset.id;
    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    const message = chat.history.find(m => m.id === messageId);
    if (!message) return;

    let menuItems = [];

    if (message.isNodeBoundary) {
        menuItems.push({
            label: '删除节点标记',
            action: async () => {
                if (confirm('确定要删除该节点标记吗？如果是开始标记，将同时删除该节点记录。')) {
                    const char = db.characters.find(c => c.id === currentChatId);
                    if (!char) return;
                    
                    if (message.nodeAction === 'start') {
                        if (char.nodes) {
                            char.nodes = char.nodes.filter(n => n.id !== message.nodeId);
                        }
                        if (char.activeNodeId === message.nodeId) {
                            char.activeNodeId = null;
                        }
                    } else if (message.nodeAction === 'end') {
                        if (char.nodes) {
                            const node = char.nodes.find(n => n.id === message.nodeId);
                            if (node) {
                                node.status = 'active';
                                char.activeNodeId = message.nodeId;
                            }
                        }
                    }
                    
                    char.history = char.history.filter(m => m.id !== messageId);
                    
                    await saveData();
                    renderMessages(false, true);
                    if (typeof NodeSystem !== 'undefined') {
                        NodeSystem.checkActiveNodeUI();
                    }
                    showToast('节点标记已删除');
                }
            }
        });
        
        if (menuItems.length > 0) {
            triggerHapticFeedback('medium');
            createContextMenu(menuItems, x, y);
        }
        return;
    }

    const isImageRecognitionMsg = message.parts && message.parts.some(p => p.type === 'image');
    const isVoiceMessage = /\[.*?的语音：.*?\]/.test(message.content);
    const isStickerMessage = /\[.*?的表情包：.*?\]|\[.*?发送的表情包：.*?\]/.test(message.content);
    const isPhotoVideoMessage = /\[.*?发来的照片\/视频：.*?\]/.test(message.content);
    const isTransferMessage = /\[.*?给你转账：.*?\]|\[.*?的转账：.*?\]|\[.*?向.*?转账：.*?\]/.test(message.content);
    const isGiftMessage = /\[.*?送来的礼物：.*?\]|\[.*?向.*?送来了礼物：.*?\]/.test(message.content);
    
    let invisibleRegex;
    if (chat.showStatusUpdateMsg) {
        invisibleRegex = /\[.*?(?:接收|退回).*?的转账\]|\[.*?已接收礼物\]|\[system:.*?\]|\[.*?邀请.*?加入了群聊\]|\[.*?修改群名为：.*?\]|\[system-display:.*?\]|\[avatar-action:.*?\]/;
    } else {
        invisibleRegex = /\[.*?(?:接收|退回).*?的转账\]|\[.*?更新状态为：.*?\]|\[.*?已接收礼物\]|\[system:.*?\]|\[.*?邀请.*?加入了群聊\]|\[.*?修改群名为：.*?\]|\[system-display:.*?\]|\[avatar-action:.*?\]/;
    }
    const isInvisibleMessage = invisibleRegex.test(message.content);
    const isWithdrawn = message.isWithdrawn; 

    if (!isWithdrawn) {
        if (!isImageRecognitionMsg && !isVoiceMessage && !isStickerMessage && !isPhotoVideoMessage && !isTransferMessage && !isGiftMessage && !isInvisibleMessage) {
            menuItems.push({label: '编辑', action: () => startMessageEdit(messageId)});
        }
        
        if (!isInvisibleMessage) {
            menuItems.push({label: '引用', action: () => startQuoteReply(messageId)});
        }

        if (message.role === 'user') {
            menuItems.push({label: '撤回', action: () => withdrawMessage(messageId)});
        }
    }

    if (!isInvisibleMessage) {
        menuItems.push({label: '收藏', action: () => { if (typeof addMessageToFavorites === 'function') addMessageToFavorites(messageId); }});
    }

    menuItems.push({
        label: isDebugMode ? '退出调试' : '进入调试',
        action: () => {
            isDebugMode = !isDebugMode;
            showToast(isDebugMode ? '已进入调试模式' : '已退出调试模式');
            renderMessages(false, true); 
        }
    });

    if (currentChatType === 'private') {
        menuItems.push({
            label: '插入节点',
            action: () => {
                // 优化：使用自定义弹窗代替原生 confirm
                const position = confirm('点击“确定”在此消息之后插入，点击“取消”在此消息之前插入') ? 'after' : 'before';
                if (typeof NodeSystem !== 'undefined') {
                    NodeSystem.insertNodeBoundary(messageId, position);
                }
            }
        });
    }

    // 下载语音：全局 TTS 开关 + 角色 TTS 开关都开启时才显示
    if (!isWithdrawn && !isInvisibleMessage &&
        typeof MinimaxTTSService !== 'undefined' && MinimaxTTSService.config.enabled && MinimaxTTSService.isConfigured() &&
        chat.ttsConfig && chat.ttsConfig.chatTtsEnabled &&
        typeof VoiceSelector !== 'undefined') {
        menuItems.push({
            label: '下载语音',
            action: async () => {
                const isUserMsg = message.role === 'user';
                const mode = isUserMsg ? 'user' : 'char';
                // 用户消息需要用户 TTS 也配置好
                if (isUserMsg && !MinimaxTTSService.isUserConfigured()) {
                    showToast('用户 TTS 未配置');
                    return;
                }
                const voiceConfig = VoiceSelector.getVoiceConfig(currentChatId, mode);
                if (!voiceConfig || !voiceConfig.voiceId) {
                    showToast('未设置' + (isUserMsg ? '用户' : '角色') + '音色');
                    return;
                }
                // 提取纯文本
                let text = message.content || '';
                const textMatch = text.match(/^\[.*?：([\s\S]*?)\]$/);
                if (textMatch && textMatch[1]) {
                    text = textMatch[1];
                }
                text = text.replace(/\[.*?\]/g, '').replace(/[\(（].*?[\)）]/g, '').replace(/「.*?」/g, '').trim();
                if (!text) {
                    showToast('消息内容为空');
                    return;
                }
                try {
                    showToast('🔊 正在生成语音...');
                    const opts = { speed: voiceConfig.speed };
                    if (isUserMsg) opts.forUser = true;
                    await MinimaxTTSService.download(text, voiceConfig.voiceId, voiceConfig.language || 'auto', opts);
                    showToast('✅ 语音已下载');
                } catch (err) {
                    console.error('[ChatOps] 下载语音失败:', err);
                    showToast('❌ 下载失败: ' + err.message);
                }
            }
        });
    }

    // 重新生图：NovelAI 已启用 + 消息是已生成过图的照片/视频消息
    if (!isWithdrawn && isPhotoVideoMessage && message.novelAiImageUrl &&
        db.novelAiSettings && db.novelAiSettings.enabled && db.novelAiSettings.token) {
        menuItems.push({
            label: '重新生图',
            action: async () => {
                // 从消息内容提取 prompt
                const pvMatch = message.content.match(/\[(?:.+?)发来的照片\/视频[：:]([\s\S]+?)\]/);
                if (!pvMatch) { showToast('无法提取图片描述'); return; }
                const pvContent = pvMatch[1].trim();
                const tagMatch = pvContent.match(/\{\{([\s\S]+?)\}\}/);
                const naiPrompt = tagMatch ? tagMatch[1].trim() : pvContent;
                if (!naiPrompt) { showToast('提示词为空'); return; }

                try {
                    showToast('🎨 正在重新生图...');
                    const result = await generateNovelAiImage(naiPrompt);
                    if (result && result.imageUrl) {
                        // 保存旧图到版本历史
                        if (!message._imageVersions) message._imageVersions = [];
                        message._imageVersions.push({
                            imageUrl: message.novelAiImageUrl,
                            savedAt: Date.now()
                        });
                        // 更新为新图
                        message.novelAiImageUrl = result.imageUrl;
                        await saveData();
                        renderMessages(false, true);
                        showToast('✅ 生图完成');
                    }
                } catch (err) {
                    console.error('[ChatOps] 重新生图失败:', err);
                    showToast('❌ 生图失败: ' + err.message);
                }
            }
        });
    }

    menuItems.push({label: '删除', action: () => enterMultiSelectMode(messageId)});
    if (!isInvisibleMessage) {
        menuItems.push({label: '多选收藏', action: () => enterMultiSelectMode(messageId, 'favorite')});
    }
    
    // 新增：转发选项
    menuItems.push({
        label: '转发',
        action: () => {
            enterMultiSelectMode(messageId, 'forward');
        }
    });

    if (menuItems.length > 0) {
        triggerHapticFeedback('medium');
        createContextMenu(menuItems, x, y);
    }
}

function startDebugEdit(messageId) {
    exitMultiSelectMode();
    editingMessageId = messageId;
    isRawEditMode = true; 

    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    const message = chat.history.find(m => m.id === messageId);
    if (!message) return;

    const modal = document.getElementById('message-edit-modal');
    const textarea = document.getElementById('message-edit-textarea');
    const title = modal.querySelector('h3');
    const deleteBtn = document.getElementById('debug-delete-msg-btn'); 

    if (!modal.dataset.originalTitle) modal.dataset.originalTitle = title.textContent;
    title.textContent = "调试/编辑源码";

    const textMatch = message.content.match(/^\[(.*?)的消息：([\s\S]+?)\]$/);
    if (message.quote && textMatch) {
        const name = textMatch[1];
        const text = textMatch[2];
        const quoteContent = message.quote.content;
        textarea.value = `[${name}引用“${quoteContent}”并回复：${text}]`;
    } else if (message.parts && message.parts.some(p => p.type !== 'text')) {
        // 如果是多模态消息，在调试模式下以 JSON 格式显示其结构，并保护 Base64 数据
        const partsCopy = JSON.parse(JSON.stringify(message.parts));
        partsCopy.forEach(p => {
            if (p.type === 'image' && p.data) {
                p.data = '[[BASE64_DATA_PRESERVED]]';
                if (!p.description) {
                    p.description = ''; // 预留空字段方便用户填写
                }
            }
        });
        textarea.value = JSON.stringify(partsCopy, null, 2);
    } else {
        textarea.value = message.content; 
    }

    const timestampInput = document.getElementById('message-edit-timestamp');
    const timestampGroup = document.getElementById('message-edit-timestamp-group');
    if (timestampInput && timestampGroup) {
        const date = new Date(message.timestamp);
        const Y = date.getFullYear();
        const M = String(date.getMonth() + 1).padStart(2, '0');
        const D = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const m = String(date.getMinutes()).padStart(2, '0');
        timestampInput.value = `${Y}-${M}-${D}T${h}:${m}`;
        timestampInput.dataset.originalValue = timestampInput.value;
        timestampGroup.style.display = 'flex';
    }
    
    if (deleteBtn) {
        deleteBtn.style.display = 'block';
        const newDeleteBtn = deleteBtn.cloneNode(true);
        deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
        
        newDeleteBtn.addEventListener('click', async () => {
            if (confirm('【调试模式】确定要永久删除这条消息吗？')) {
                chat.history = chat.history.filter(m => m.id !== messageId);
                
                if (currentChatType === 'private') {
                    recalculateChatStatus(chat);
                }

                await saveData(); 
                renderMessages(false, true); 
                cancelMessageEdit(); 
                showToast('消息已删除');
            }
        });
    }

    modal.classList.add('visible');
    textarea.focus();
}

function startQuoteReply(messageId) {
    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    const message = chat.history.find(m => m.id === messageId);
    if (!message) return;

    let senderName = '';
    let senderId = '';
    if (message.role === 'user') {
        senderName = (currentChatType === 'private') ? chat.myName : chat.me.nickname;
        senderId = 'user_me';
    } else { 
        if (currentChatType === 'private') {
            senderName = chat.remarkName;
            senderId = chat.id;
        } else {
            const sender = chat.members.find(m => m.id === message.senderId);
            senderName = sender ? sender.groupNickname : '未知成员';
            senderId = sender ? sender.id : 'unknown';
        }
    }
    
    let previewContent = message.content;
    const textMatch = message.content.match(/\[.*?的消息：([\s\S]+?)\]/);
    if (textMatch) {
        previewContent = textMatch[1];
    } else if (/\[.*?的表情包：.*?\]/.test(message.content)) {
        previewContent = '[表情包]';
    } else if (/\[.*?的语音：.*?\]/.test(message.content)) {
        previewContent = '[语音]';
    } else if (/\[.*?发来的照片\/视频：.*?\]/.test(message.content)) {
        previewContent = '[照片/视频]';
    } else if (message.parts && message.parts.some(p => p.type === 'image')) {
        previewContent = '[图片]';
    }
    
    currentQuoteInfo = {
        id: message.id,
        senderId: senderId,
        senderName: senderName,
        content: previewContent.substring(0, 100) 
    };

    const previewBar = document.getElementById('reply-preview-bar');
    previewBar.querySelector('.reply-preview-name').textContent = `回复 ${senderName}`;
    previewBar.querySelector('.reply-preview-text').textContent = currentQuoteInfo.content;
    previewBar.classList.add('visible');
    
    messageInput.focus();
}

function cancelQuoteReply() {
    currentQuoteInfo = null;
    const previewBar = document.getElementById('reply-preview-bar');
    previewBar.classList.remove('visible');
}

function startMessageEdit(messageId) {
    exitMultiSelectMode();
    editingMessageId = messageId;
    isRawEditMode = false;
    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    const message = chat.history.find(m => m.id === messageId);
    if (!message) return;

    const modal = document.getElementById('message-edit-modal');
    const textarea = document.getElementById('message-edit-textarea');

    let contentToEdit = message.content;
    const plainTextMatch = contentToEdit.match(/^\[.*?：([\s\S]*)\]$/);
    if (plainTextMatch && plainTextMatch[1]) {
        contentToEdit = plainTextMatch[1].trim();
    }
    contentToEdit = contentToEdit.replace(/\[发送时间:.*?\]/g, '').trim();
    
    textarea.value = contentToEdit;

    const timestampInput = document.getElementById('message-edit-timestamp');
    const timestampGroup = document.getElementById('message-edit-timestamp-group');
    if (timestampInput && timestampGroup) {
        const date = new Date(message.timestamp);
        const Y = date.getFullYear();
        const M = String(date.getMonth() + 1).padStart(2, '0');
        const D = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const m = String(date.getMinutes()).padStart(2, '0');
        timestampInput.value = `${Y}-${M}-${D}T${h}:${m}`;
        timestampInput.dataset.originalValue = timestampInput.value;
        timestampGroup.style.display = 'flex';
    }

    modal.classList.add('visible');
    textarea.focus();
}

async function saveMessageEdit() {
    const newText = document.getElementById('message-edit-textarea').value.trim();
    if (!newText || !editingMessageId) {
        cancelMessageEdit();
        return;
    }

    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    const messageIndex = chat.history.findIndex(m => m.id === editingMessageId);
    if (messageIndex === -1) {
        cancelMessageEdit();
        return;
    }

    if (isRawEditMode) {
        // 尝试解析 JSON（处理多模态消息的编辑）
        let isJsonEdit = false;
        try {
            if (newText.trim().startsWith('[') && newText.trim().endsWith(']')) {
                const parsedParts = JSON.parse(newText);
                if (Array.isArray(parsedParts) && parsedParts.some(p => p.type)) {
                    isJsonEdit = true;
                    // 恢复 Base64 数据
                    const originalParts = chat.history[messageIndex].parts || [];
                    parsedParts.forEach((p, i) => {
                        if (p.type === 'image' && p.data === '[[BASE64_DATA_PRESERVED]]') {
                            const originalPart = originalParts.find(op => op.type === 'image' && op.data);
                            if (originalPart) {
                                p.data = originalPart.data;
                            }
                        }
                    });
                    chat.history[messageIndex].parts = parsedParts;
                    // 更新 content 为纯文本表示
                    chat.history[messageIndex].content = parsedParts.map(p => {
                        if (p.type === 'text' || p.type === 'html') return p.text;
                        if (p.type === 'image') return p.description ? `[图片描述：${p.description}]` : '[图片]';
                        return '';
                    }).join('');
                }
            }
        } catch (e) {
            // 不是合法的 JSON，按普通文本处理
        }

        if (!isJsonEdit) {
            const quoteRegex = /^\[(.*?)引用[“"]([\s\S]*?)[”"]并回复：([\s\S]*?)\]$/;
            const match = newText.match(quoteRegex);

            if (match) {
                const name = match[1];
                const quoteContent = match[2];
                const replyText = match[3];

                if (chat.history[messageIndex].quote) {
                    chat.history[messageIndex].quote.content = quoteContent;

                    const targetContent = quoteContent.trim();
                    const originalMessage = chat.history.slice().reverse().find(m => {
                        if (m.id === chat.history[messageIndex].id) return false;
                        let text = m.content;
                        const plainTextMatch = text.match(/^\[.*?：([\s\S]*)\]$/);
                        if (plainTextMatch && plainTextMatch[1]) {
                            text = plainTextMatch[1].trim();
                        }
                        text = text.replace(/\[发送时间:.*?\]$/, '').trim();
                        return text === targetContent;
                    });

                    if (originalMessage) {
                        let newSenderId;
                        if (originalMessage.role === 'user') {
                            newSenderId = 'user_me';
                        } else {
                            newSenderId = originalMessage.senderId || (currentChatType === 'private' ? chat.id : 'unknown');
                        }
                        chat.history[messageIndex].quote.senderId = newSenderId;
                        chat.history[messageIndex].quote.messageId = originalMessage.id;
                    }
                }
                chat.history[messageIndex].content = `[${name}的消息：${replyText}]`;
            } else {
                chat.history[messageIndex].content = newText;
            }

            if (chat.history[messageIndex].parts) {
                chat.history[messageIndex].parts = [{type: 'text', text: chat.history[messageIndex].content}];
            }
        }
    } else {
        const oldContent = chat.history[messageIndex].content;
        const prefixMatch = oldContent.match(/(\[.*?的消息：)[\s\S]+\]/);
        let newContent;

        if (prefixMatch && prefixMatch[1]) {
            const prefix = prefixMatch[1];
            newContent = `${prefix}${newText}]`;
        } else {
            newContent = newText;
        }

        chat.history[messageIndex].content = newContent;
        if (chat.history[messageIndex].parts) {
        chat.history[messageIndex].parts = [{type: 'text', text: newContent}];
        }
    }

    const timestampInput = document.getElementById('message-edit-timestamp');
    if (timestampInput && timestampInput.value) {
        if (timestampInput.value !== timestampInput.dataset.originalValue) {
            const newTime = new Date(timestampInput.value).getTime();
            if (!isNaN(newTime)) {
                chat.history[messageIndex].timestamp = newTime;
                chat.history.sort((a, b) => a.timestamp - b.timestamp);
            }
        }
    }
    
    if (currentChatType === 'private') {
        recalculateChatStatus(chat);

        if (chat.statusPanel && chat.statusPanel.enabled && chat.statusPanel.regexPattern) {
            try {
                let pattern = chat.statusPanel.regexPattern;
                let flags = 'gs'; 

                const matchParts = pattern.match(/^\/(.*?)\/([a-z]*)$/);
                if (matchParts) {
                    pattern = matchParts[1];
                    flags = matchParts[2] || 'gs';
                    if (!flags.includes('s')) flags += 's';
                }

                const regex = new RegExp(pattern, flags);
                const match = regex.exec(chat.history[messageIndex].content);
                
                if (match) {
                    const rawStatus = match[0];
                    
                    let html = chat.statusPanel.replacePattern;
                    
                    for (let i = 1; i < match.length; i++) {
                        html = html.replace(new RegExp(`\\$${i}`, 'g'), match[i]);
                    }

                    // 更新 history 中对应的旧条目
                    if (!chat.statusPanel.history) chat.statusPanel.history = [];
                    const oldRaw = chat.history[messageIndex].statusSnapshot
                        ? chat.history[messageIndex].statusSnapshot.oldRaw || ''
                        : '';
                    const existingIndex = chat.statusPanel.history.findIndex(h => h.raw === oldRaw || h.raw === rawStatus);
                    if (existingIndex !== -1) {
                        chat.statusPanel.history[existingIndex].raw = rawStatus;
                        chat.statusPanel.history[existingIndex].html = html;
                        chat.statusPanel.history[existingIndex].timestamp = Date.now();
                    } else {
                        // 之前不是状态消息，现在编辑成了状态消息，新增一条
                        chat.statusPanel.history.unshift({
                            raw: rawStatus,
                            html: html,
                            timestamp: Date.now()
                        });
                        if (chat.statusPanel.history.length > 20) {
                            chat.statusPanel.history = chat.statusPanel.history.slice(0, 20);
                        }
                    }

                    chat.statusPanel.currentStatusRaw = rawStatus;
                    chat.statusPanel.currentStatusHtml = html;
                    
                    chat.history[messageIndex].isStatusUpdate = true;
                    chat.history[messageIndex].statusSnapshot = {
                        regex: pattern,
                        replacePattern: chat.statusPanel.replacePattern,
                        oldRaw: rawStatus
                    };
                } else {
                    // 编辑后不再匹配状态，从 history 中移除旧条目
                    if (chat.history[messageIndex].isStatusUpdate && chat.statusPanel.history) {
                        const oldRaw = chat.history[messageIndex].statusSnapshot
                            ? chat.history[messageIndex].statusSnapshot.oldRaw || ''
                            : '';
                        if (oldRaw) {
                            const removeIndex = chat.statusPanel.history.findIndex(h => h.raw === oldRaw);
                            if (removeIndex !== -1) {
                                chat.statusPanel.history.splice(removeIndex, 1);
                            }
                        }
                        // 重新计算 currentStatus 为最新的 history 条目
                        if (chat.statusPanel.history.length > 0) {
                            chat.statusPanel.currentStatusRaw = chat.statusPanel.history[0].raw;
                            chat.statusPanel.currentStatusHtml = chat.statusPanel.history[0].html;
                        } else {
                            chat.statusPanel.currentStatusRaw = '';
                            chat.statusPanel.currentStatusHtml = '';
                        }
                    }
                    chat.history[messageIndex].isStatusUpdate = false;
                    delete chat.history[messageIndex].statusSnapshot;
                }
            } catch (e) {
                console.error("编辑时解析状态栏错误:", e);
            }
        }
    }

    await saveData();
    currentPage = 1;
    renderMessages(false, true);
    renderChatList();
    
    cancelMessageEdit();
}

function cancelMessageEdit() {
    editingMessageId = null;
    isRawEditMode = false; 
    const modal = document.getElementById('message-edit-modal');
    const deleteBtn = document.getElementById('debug-delete-msg-btn');
    if (deleteBtn) deleteBtn.style.display = 'none';

    const timestampInput = document.getElementById('message-edit-timestamp');
    const timestampGroup = document.getElementById('message-edit-timestamp-group');
    if (timestampInput && timestampGroup) {
        timestampInput.value = '';
        timestampGroup.style.display = 'none';
    }

    if (modal) {
        modal.classList.remove('visible');
        const title = modal.querySelector('h3');
        if (modal.dataset.originalTitle) {
            title.textContent = modal.dataset.originalTitle;
        } else {
            title.textContent = "编辑消息";
        }
    }
}

function enterMultiSelectMode(initialMessageId, mode = 'delete') {
    isInMultiSelectMode = true;
    currentMultiSelectMode = mode;
    
    chatRoomHeaderDefault.style.display = 'none';
    chatRoomHeaderSelect.style.display = 'flex';
    document.querySelector('.chat-input-wrapper').style.display = 'none';
    
    const delBtn = document.getElementById('delete-selected-btn');
    const favBtn = document.getElementById('favorite-selected-btn');
    const mergeBtn = document.getElementById('favorite-merge-btn');
    const fwdBtn = document.getElementById('forward-selected-btn');

    if (mode === 'delete') {
        multiSelectBar.classList.add('visible');
        document.getElementById('multi-select-title').textContent = '选择消息';
        if (delBtn) delBtn.style.display = '';
        if (favBtn) favBtn.style.display = 'none';
        if (mergeBtn) mergeBtn.style.display = 'none';
        if (fwdBtn) fwdBtn.style.display = 'none';
    } else if (mode === 'capture') {
        document.getElementById('capture-mode-bar').classList.add('visible');
        document.getElementById('multi-select-title').textContent = '选择截图范围';
    } else if (mode === 'favorite') {
        multiSelectBar.classList.add('visible');
        document.getElementById('multi-select-title').textContent = '选择要收藏的消息';
        if (delBtn) delBtn.style.display = 'none';
        if (fwdBtn) fwdBtn.style.display = 'none';
        if (favBtn) { favBtn.style.display = ''; favBtn.disabled = selectedMessageIds.size === 0; }
        if (mergeBtn) { mergeBtn.style.display = ''; mergeBtn.disabled = selectedMessageIds.size === 0; }
    } else if (mode === 'forward') {
        multiSelectBar.classList.add('visible');
        document.getElementById('multi-select-title').textContent = '选择要转发的消息';
        if (delBtn) delBtn.style.display = 'none';
        if (favBtn) favBtn.style.display = 'none';
        if (mergeBtn) mergeBtn.style.display = 'none';
        if (fwdBtn) { fwdBtn.style.display = ''; fwdBtn.disabled = selectedMessageIds.size === 0; }
    }
    
    chatRoomScreen.classList.add('multi-select-active');
    selectedMessageIds.clear();
    if (initialMessageId) {
        toggleMessageSelection(initialMessageId);
    }
}

function exitMultiSelectMode() {
    isInMultiSelectMode = false;
    chatRoomHeaderDefault.style.display = 'flex';
    chatRoomHeaderSelect.style.display = 'none';
    document.querySelector('.chat-input-wrapper').style.display = 'block';
    
    multiSelectBar.classList.remove('visible');
    document.getElementById('capture-mode-bar').classList.remove('visible');
    const delBtn = document.getElementById('delete-selected-btn');
    const favBtn = document.getElementById('favorite-selected-btn');
    const mergeBtn = document.getElementById('favorite-merge-btn');
    const fwdBtn = document.getElementById('forward-selected-btn');
    if (delBtn) delBtn.style.display = '';
    if (favBtn) favBtn.style.display = 'none';
    if (mergeBtn) mergeBtn.style.display = 'none';
    if (fwdBtn) fwdBtn.style.display = 'none';
    
    chatRoomScreen.classList.remove('multi-select-active');
    selectedMessageIds.forEach(id => {
        const el = messageArea.querySelector(`.message-wrapper[data-id="${id}"]`);
        if (el) el.classList.remove('multi-select-selected');
    });
    selectedMessageIds.clear();
    currentMultiSelectMode = 'delete';
}

function toggleMessageSelection(messageId) {
    const el = messageArea.querySelector(`.message-wrapper[data-id="${messageId}"]`);
    if (!el) return;
    if (selectedMessageIds.has(messageId)) {
        selectedMessageIds.delete(messageId);
        el.classList.remove('multi-select-selected');
    } else {
        selectedMessageIds.add(messageId);
        el.classList.add('multi-select-selected');
    }
    
    if (currentMultiSelectMode === 'delete') {
        selectCount.textContent = `已选择 ${selectedMessageIds.size} 项`;
        deleteSelectedBtn.disabled = selectedMessageIds.size === 0;
    } else if (currentMultiSelectMode === 'capture') {
        document.getElementById('capture-select-count').textContent = `已选择 ${selectedMessageIds.size} 项`;
    } else if (currentMultiSelectMode === 'favorite') {
        selectCount.textContent = `已选择 ${selectedMessageIds.size} 项`;
        const favBtn = document.getElementById('favorite-selected-btn');
        const mergeBtn = document.getElementById('favorite-merge-btn');
        if (favBtn) favBtn.disabled = selectedMessageIds.size === 0;
        if (mergeBtn) mergeBtn.disabled = selectedMessageIds.size === 0;
    } else if (currentMultiSelectMode === 'forward') {
        selectCount.textContent = `已选择 ${selectedMessageIds.size} 项`;
        const fwdBtn = document.getElementById('forward-selected-btn');
        if (fwdBtn) fwdBtn.disabled = selectedMessageIds.size === 0;
    }
}

async function generateCapture() {
    if (selectedMessageIds.size === 0) return showToast('请至少选择一条消息');
    
    showToast('正在生成截图，请稍候...', 3000);
    
    // 1. 获取选中的消息元素并排序
    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    const sortedMessages = chat.history.filter(m => selectedMessageIds.has(m.id));
    
    // 2. 创建临时容器
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.top = '-9999px';
    tempContainer.style.left = '0';
    tempContainer.style.width = '400px'; // 固定宽度模拟手机
    tempContainer.style.backgroundColor = '#f5f5f5'; // 默认背景
    if (chat.chatBg) {
        tempContainer.style.backgroundImage = `url(${chat.chatBg})`;
        tempContainer.style.backgroundSize = 'cover';
        tempContainer.style.backgroundPosition = 'center';
    } else if (chat.theme) {
        // 应用主题背景色
        const theme = colorThemes[chat.theme] || colorThemes['white_pink'];
        // 这里简单处理，如果需要更精确的主题背景，可能需要更多逻辑
    }
    
    tempContainer.style.padding = '20px';
    tempContainer.style.display = 'flex';
    tempContainer.style.flexDirection = 'column';
    
    // 3. 克隆并处理消息元素
    // 为了保证样式正确，我们需要重新渲染这些消息，或者克隆现有的 DOM
    // 这里选择重新渲染，因为现有的 DOM 可能包含多选状态的样式
    
    // 临时借用 createMessageBubbleElement，但需要注意它依赖全局状态
    // 我们可以手动构建或者克隆现有的 DOM 并移除 .multi-select-selected 类
    
    sortedMessages.forEach(msg => {
        const originalEl = messageArea.querySelector(`.message-wrapper[data-id="${msg.id}"]`);
        if (originalEl) {
            const clone = originalEl.cloneNode(true);
            clone.classList.remove('multi-select-selected');
            clone.style.marginBottom = '15px';
            
            // 处理一些可能在截图时显示不正常的元素
            // 例如：如果是 HTML 气泡，iframe 可能无法被 html2canvas 捕获
            // 这里暂时不做特殊处理，html2canvas 对 iframe 支持有限
            
            tempContainer.appendChild(clone);
        }
    });
    
    // 添加水印
    
    
    document.body.appendChild(tempContainer);
    
    try {
        // 4. 生成截图
        const canvas = await html2canvas(tempContainer, {
            useCORS: true, // 允许跨域图片
            scale: 2, // 提高清晰度
            backgroundColor: null // 透明背景
        });
        
        const imgUrl = canvas.toDataURL('image/png');
        
        // 5. 显示结果
        const previewContainer = document.getElementById('capture-preview-container');
        previewContainer.innerHTML = '';
        const img = document.createElement('img');
        img.src = imgUrl;
        previewContainer.appendChild(img);
        
        // 设置下载按钮
        const downloadBtn = document.getElementById('download-capture-btn');
        if (downloadBtn) {
            downloadBtn.onclick = () => {
                const link = document.createElement('a');
                link.href = imgUrl;
                link.download = `uwu_chat_${new Date().getTime()}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            };
        }

        document.getElementById('capture-result-modal').classList.add('visible');
        exitMultiSelectMode();
        
    } catch (error) {
        console.error('截图生成失败:', error);
        showToast('截图生成失败，请重试');
    } finally {
        document.body.removeChild(tempContainer);
    }
}

async function deleteSelectedMessages() {
    if (selectedMessageIds.size === 0) return;
    const deletedCount = selectedMessageIds.size;
    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);

    // 收集需要一并删除的关联消息 ID（思维链 + 状态栏消息）
    const idsToDelete = new Set(selectedMessageIds);

    for (const msgId of selectedMessageIds) {
        const msgIndex = chat.history.findIndex(m => m.id === msgId);
        if (msgIndex === -1) continue;
        const msg = chat.history[msgIndex];

        // 1. 如果删除的是普通 assistant 消息，查找紧邻其前面的 isThinking 消息一并删除
        if (msg.role === 'assistant' && !msg.isThinking) {
            for (let i = msgIndex - 1; i >= 0; i--) {
                const prev = chat.history[i];
                // 找到紧邻的思维链消息（时间差在 30 秒内，属于同一轮对话）
                if (prev.isThinking && prev.role === 'assistant' && (msg.timestamp - prev.timestamp) < 30000) {
                    idsToDelete.add(prev.id);
                }
                // 遇到非 thinking 的 assistant 消息或 user 消息就停止向前搜索
                if (!prev.isThinking) break;
            }
            // 同时查找紧邻其后面的 isStatusUpdate 消息
            for (let i = msgIndex + 1; i < chat.history.length; i++) {
                const next = chat.history[i];
                if (next.isStatusUpdate && next.role === 'assistant' && (next.timestamp - msg.timestamp) < 5000) {
                    idsToDelete.add(next.id);
                }
                if (!next.isStatusUpdate && !next.isThinking) break;
            }
        }

        // 2. 如果删除的消息带有状态栏快照，清理 statusPanel.history 中对应的条目
        if (msg.isStatusUpdate && msg.statusSnapshot && chat.statusPanel && chat.statusPanel.history) {
            const msgContent = msg.content;
            chat.statusPanel.history = chat.statusPanel.history.filter(h => {
                // 通过 raw 内容匹配：如果状态栏历史的 raw 文本包含在被删消息中，则移除
                return !msgContent.includes(h.raw);
            });
            // 更新当前状态为最新的历史记录，或清空
            if (chat.statusPanel.history.length > 0) {
                chat.statusPanel.currentStatusHtml = chat.statusPanel.history[0].html;
                chat.statusPanel.currentStatusRaw = chat.statusPanel.history[0].raw;
            } else {
                chat.statusPanel.currentStatusHtml = '';
                chat.statusPanel.currentStatusRaw = '';
            }
        }
    }

    chat.history = chat.history.filter(m => !idsToDelete.has(m.id));

    if (currentChatType === 'private') {
        recalculateChatStatus(chat);
    }

    await saveData();
    currentPage = 1;
    renderMessages(false, true);
    renderChatList();
    exitMultiSelectMode();
    showToast(`已删除 ${deletedCount} 条消息`);
}

async function withdrawMessage(messageId) {
    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    if (!chat) return;

    const messageIndex = chat.history.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    const message = chat.history[messageIndex];
    const messageTime = message.timestamp;
    const now = Date.now();

    if (now - messageTime > 2 * 60 * 1000) {
        showToast('超过2分钟的消息无法撤回');
        return;
    }

    message.isWithdrawn = true;

    const cleanContentMatch = message.content.match(/\[.*?的消息：([\s\S]+?)\]/);
    const cleanOriginalContent = cleanContentMatch ? cleanContentMatch[1] : message.content;
    message.originalContent = cleanOriginalContent; 

    const myName = (currentChatType === 'private') ? chat.myName : chat.me.nickname;

    message.content = `[${myName} 撤回了一条消息：${cleanOriginalContent}]`;

    if (currentChatType === 'private') {
        recalculateChatStatus(chat);
    }

    await saveData();

    currentPage = 1;
    renderMessages(false, true);
    renderChatList();
    showToast('消息已撤回');
    triggerHapticFeedback('medium');
}

function openDeleteChunkModal() {
    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    if (!chat || !chat.history || chat.history.length === 0) {
        showToast('当前没有聊天记录可管理');
        return;
    }
    const totalMessages = chat.history.length;
    const rangeInfo = document.getElementById('delete-chunk-range-info');
    rangeInfo.textContent = `当前聊天总消息数: ${totalMessages}`;
    
    // 计算并显示已隐藏的范围
    updateHiddenRangesInfo(chat);
    
    document.getElementById('delete-chunk-form').reset();
    document.getElementById('delete-chunk-preview-box').innerHTML = '<p style="color: #999; text-align: center; margin-top: 30px;">输入范围以预览内容</p>';
    
    document.getElementById('delete-chunk-modal').classList.add('visible');
}

function updateHiddenRangesInfo(chat) {
    const hiddenInfo = document.getElementById('delete-chunk-hidden-info');
    if (!hiddenInfo) return;

    if (!chat.history || chat.history.length === 0) {
        hiddenInfo.textContent = '';
        return;
    }

    const ranges = [];
    let start = -1;

    for (let i = 0; i < chat.history.length; i++) {
        const isHidden = chat.history[i].isContextDisabled;
        if (isHidden) {
            if (start === -1) start = i; // Start of a range
        } else {
            if (start !== -1) {
                // End of a range
                ranges.push(start === i - 1 ? `${start + 1}` : `${start + 1}-${i}`);
                start = -1;
            }
        }
    }
    // Handle case where range goes until the end
    if (start !== -1) {
        ranges.push(start === chat.history.length - 1 ? `${start + 1}` : `${start + 1}-${chat.history.length}`);
    }

    if (ranges.length > 0) {
        hiddenInfo.textContent = `当前已隐藏范围: ${ranges.join(', ')}`;
        hiddenInfo.style.display = 'block';
    } else {
        hiddenInfo.textContent = '';
        hiddenInfo.style.display = 'none';
    }
}

function generateRangePreview(chat, startIndex, endIndex) {
    const previewBox = document.getElementById('delete-chunk-preview-box');
    if (!previewBox) return;

    if (startIndex < 0 || endIndex > chat.history.length || startIndex >= endIndex) {
        previewBox.innerHTML = '<p style="color: #999; text-align: center; margin-top: 30px;">无效的范围</p>';
        return;
    }

    const messagesToPreview = chat.history.slice(startIndex, endIndex);
    const totalToPreview = messagesToPreview.length;
    let previewHtml = '';

    if (totalToPreview === 0) {
        previewBox.innerHTML = '<p style="color: #999; text-align: center; margin-top: 30px;">范围为空</p>';
        return;
    }

    const renderMsg = (msg) => {
        const contentMatch = msg.content.match(/\[.*?的消息：([\s\S]+)\]/);
        let text = contentMatch ? contentMatch[1] : msg.content;
        text = text.replace(/</g, '<').replace(/>/g, '>'); // Escape HTML
        const sender = msg.role === 'user' ? '我' : (chat.remarkName || chat.name || '对方');
        const status = msg.isContextDisabled ? ' <span style="color:red; font-size:10px;">(已隐藏)</span>' : '';
        return `<div style="margin-bottom:4px; padding-bottom:4px; border-bottom:1px solid #eee;">
            <span style="font-weight:600; color:#555;">${sender}</span>${status}: 
            <span style="color:#666;">${text.substring(0, 60)}${text.length > 60 ? '...' : ''}</span>
        </div>`;
    };

    if (totalToPreview <= 5) {
        previewHtml = messagesToPreview.map(renderMsg).join('');
    } else {
        const firstThree = messagesToPreview.slice(0, 3);
        const lastTwo = messagesToPreview.slice(-2);
        
        previewHtml = firstThree.map(renderMsg).join('') + 
                      `<div style="text-align: center; color: #999; margin: 8px 0; font-size: 10px;">... 共 ${totalToPreview} 条 ...</div>` + 
                      lastTwo.map(renderMsg).join('');
    }
    
    previewBox.innerHTML = previewHtml;
}

function setupDeleteHistoryChunk() {
    const deleteChunkModal = document.getElementById('delete-chunk-modal');
    const startInput = document.getElementById('delete-range-start');
    const endInput = document.getElementById('delete-range-end');
    
    // Real-time Preview Logic
    const updatePreview = () => {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (!chat) return;
        
        const s = parseInt(startInput.value);
        const e = parseInt(endInput.value);
        
        if (!isNaN(s) && !isNaN(e) && s > 0 && e >= s && e <= chat.history.length) {
            generateRangePreview(chat, s - 1, e);
        }
    };

    startInput.addEventListener('input', updatePreview);
    endInput.addEventListener('input', updatePreview);

    // Button Actions
    const btnBlock = document.getElementById('btn-block-range');
    const btnRestore = document.getElementById('btn-restore-range');
    const btnDelete = document.getElementById('btn-delete-range');
    
    const getRange = () => {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        const s = parseInt(startInput.value);
        const e = parseInt(endInput.value);
        if (!chat || isNaN(s) || isNaN(e) || s <= 0 || e < s || e > chat.history.length) {
            showToast('请输入有效的起止范围');
            return null;
        }
        return { chat, startIndex: s - 1, endIndex: e, count: e - s + 1 };
    };

    if (btnBlock) {
        btnBlock.addEventListener('click', async () => {
            const range = getRange();
            if (!range) return;
            
            let changedCount = 0;
            const modifiedIds = [];
            for (let i = range.startIndex; i < range.endIndex; i++) {
                if (!range.chat.history[i].isContextDisabled) {
                    range.chat.history[i].isContextDisabled = true;
                    modifiedIds.push(range.chat.history[i].id);
                    changedCount++;
                }
            }
            
            if (changedCount > 0) {
                await saveData();
                showToast(`已屏蔽 ${changedCount} 条消息`);
                // Update DOM in-place
                modifiedIds.forEach(id => {
                    const el = document.querySelector(`.message-wrapper[data-id="${id}"]`);
                    if (el) el.classList.add('context-disabled');
                });
                updateHiddenRangesInfo(range.chat);
                generateRangePreview(range.chat, range.startIndex, range.endIndex);
            } else {
                showToast('选中范围内没有需要屏蔽的消息');
            }
        });
    }

    if (btnRestore) {
        btnRestore.addEventListener('click', async () => {
            const range = getRange();
            if (!range) return;
            
            let changedCount = 0;
            const modifiedIds = [];
            for (let i = range.startIndex; i < range.endIndex; i++) {
                const msg = range.chat.history[i];
                // 检查是否为思维链消息 (isThinking 标记或内容以 <thinking> 开头)
                const isThinkingMsg = msg.isThinking || (msg.content && typeof msg.content === 'string' && msg.content.trim().startsWith('<thinking>'));
                
                if (msg.isContextDisabled && !isThinkingMsg) {
                    msg.isContextDisabled = false;
                    modifiedIds.push(msg.id);
                    changedCount++;
                }
            }
            
            if (changedCount > 0) {
                await saveData();
                showToast(`已恢复 ${changedCount} 条消息`);
                // Update DOM in-place
                modifiedIds.forEach(id => {
                    const el = document.querySelector(`.message-wrapper[data-id="${id}"]`);
                    if (el) el.classList.remove('context-disabled');
                });
                updateHiddenRangesInfo(range.chat);
                generateRangePreview(range.chat, range.startIndex, range.endIndex);
            } else {
                showToast('选中范围内没有被屏蔽的消息');
            }
        });
    }

    // Delete Logic (With Confirmation)
    const confirmDeleteModal = document.getElementById('delete-chunk-confirm-modal');
    const confirmDeleteBtn = document.getElementById('confirm-delete-chunk-btn');
    const cancelDeleteBtn = document.getElementById('cancel-delete-chunk-btn');
    
    let pendingDeleteRange = null;

    if (btnDelete) {
        btnDelete.addEventListener('click', () => {
            const range = getRange();
            if (range) {
                pendingDeleteRange = range;
                confirmDeleteModal.classList.add('visible');
            }
        });
    }

    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', async () => {
            if (!pendingDeleteRange) return;
            
            const { chat, startIndex, count } = pendingDeleteRange;

            // 清理被删除消息中关联的状态栏历史
            if (currentChatType === 'private' && chat.statusPanel && chat.statusPanel.history) {
                const deletedMsgs = chat.history.slice(startIndex, startIndex + count);
                for (const msg of deletedMsgs) {
                    if (msg.isStatusUpdate && msg.statusSnapshot) {
                        chat.statusPanel.history = chat.statusPanel.history.filter(h => !msg.content.includes(h.raw));
                    }
                }
                if (chat.statusPanel.history.length > 0) {
                    chat.statusPanel.currentStatusHtml = chat.statusPanel.history[0].html;
                    chat.statusPanel.currentStatusRaw = chat.statusPanel.history[0].raw;
                } else {
                    chat.statusPanel.currentStatusHtml = '';
                    chat.statusPanel.currentStatusRaw = '';
                }
            }

            chat.history.splice(startIndex, count);

            if (currentChatType === 'private') {
                recalculateChatStatus(chat);
            }

            await saveData();
            confirmDeleteModal.classList.remove('visible');
            deleteChunkModal.classList.remove('visible');
            showToast(`已永久删除 ${count} 条消息`);
            
            currentPage = 1;
            renderMessages(false, true);
            renderChatList();
            
            pendingDeleteRange = null;
        });
    }

    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', () => {
            confirmDeleteModal.classList.remove('visible');
            pendingDeleteRange = null;
        });
    }

    document.getElementById('close-delete-modal-btn').addEventListener('click', () => {
        deleteChunkModal.classList.remove('visible');
    });
}

// 重新计算并更新角色状态
function recalculateChatStatus(chat) {
    if (!chat || !chat.history) return;
    
    // 仅针对私聊且非群聊
    // 注意：虽然函数参数叫 chat，但在调用处需确保是 private 类型或者在这里判断
    // 由于群聊没有状态栏，这里主要针对 private
    // 但为了通用性，我们可以检查 chat.realName 是否存在
    
    if (!chat.realName) return; // 简单判断，群聊通常没有单人的 realName 用于状态更新（群聊逻辑不同）

    const updateStatusRegex = new RegExp(`\\[${chat.realName}更新状态为：(.*?)\\]`);
    let foundStatus = '在线'; // 默认状态

    // 倒序遍历历史记录
    for (let i = chat.history.length - 1; i >= 0; i--) {
        const msg = chat.history[i];
        // 忽略被撤回的消息
        if (msg.isWithdrawn) continue;

        const match = msg.content.match(updateStatusRegex);
        if (match) {
            foundStatus = match[1];
            break; // 找到最近的一个状态，停止遍历
        }
    }

    // 更新状态
    chat.status = foundStatus;
    
    // 如果当前正在该聊天室，实时更新 UI
    if (currentChatId === chat.id) {
        const statusTextEl = document.getElementById('chat-room-status-text');
        if (statusTextEl) {
            statusTextEl.textContent = foundStatus;
        }
    }
}

// 在当前编辑的消息下方插入新消息
function insertMessageBelow() {
    if (!editingMessageId) {
        showToast('无法获取当前编辑的消息');
        return;
    }

    // 显示自定义插入消息弹窗
    const insertModal = document.getElementById('insert-message-modal');
    const insertTextarea = document.getElementById('insert-message-textarea');
    
    if (!insertModal || !insertTextarea) {
        showToast('弹窗元素不存在，请刷新页面');
        return;
    }
    
    insertTextarea.value = '';
    insertModal.classList.add('visible');
    insertTextarea.focus();
}

// 确认插入新消息
async function confirmInsertMessage() {
    const newContent = document.getElementById('insert-message-textarea').value.trim();
    if (!newContent) {
        showToast('请输入消息内容');
        return;
    }

    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    if (!chat) {
        showToast('无法获取聊天数据');
        return;
    }

    const currentMessageIndex = chat.history.findIndex(m => m.id === editingMessageId);
    if (currentMessageIndex === -1) {
        showToast('找不到当前消息');
        return;
    }

    const currentMessage = chat.history[currentMessageIndex];
    
    // 计算新消息的时间戳
    let newTimestamp;
    if (currentMessageIndex < chat.history.length - 1) {
        const nextMessage = chat.history[currentMessageIndex + 1];
        // 在当前消息和下一条消息之间插入（取中间时间）
        newTimestamp = Math.floor((currentMessage.timestamp + nextMessage.timestamp) / 2);
    } else {
        // 如果当前消息是最后一条，则在其后1分钟
        newTimestamp = currentMessage.timestamp + 60000;
    }

    // 根据当前编辑消息的角色决定新消息的角色
    const isCharMessage = currentMessage.role === 'char' || currentMessage.role === 'assistant';
    const messageContent = isCharMessage
        ? `[${chat.name || '角色'}的消息：${newContent}]`
        : `[${chat.myName || '我'}的消息：${newContent}]`;
    const newMessage = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        content: messageContent,
        parts: [{type: 'text', text: messageContent}],
        timestamp: newTimestamp,
        role: isCharMessage ? 'assistant' : 'user',
        senderId: isCharMessage ? (currentMessage.senderId || chat.id) : 'user_me'
    };

    // 插入新消息到数组
    chat.history.splice(currentMessageIndex + 1, 0, newMessage);

    // 保存数据
    if (currentChatType === 'private') {
        recalculateChatStatus(chat);
    }

    await saveData();
    currentPage = 1;
    renderMessages(false, true);
    renderChatList();

    // 关闭插入弹窗和编辑弹窗
    document.getElementById('insert-message-modal').classList.remove('visible');
    cancelMessageEdit();
    
    showToast('新消息已插入');
}

// 打开转发选择目标弹窗
function openForwardModal() {
    if (selectedMessageIds.size === 0) {
        showToast('请至少选择一条要转发的消息');
        return;
    }

    const modal = document.getElementById('forward-message-modal');
    const targetList = document.getElementById('forward-target-list');
    const searchInput = document.getElementById('forward-search-input');
    if (!modal || !targetList) return;

    // 获取所有联系人(角色)和群聊
    let allTargets = [];
    db.characters.forEach(c => {
        allTargets.push({
            id: c.id,
            type: 'private',
            name: c.remarkName || c.realName || c.name,
            avatar: c.avatar || 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg'
        });
    });
    db.groups.forEach(g => {
        allTargets.push({
            id: g.id,
            type: 'group',
            name: g.name,
            avatar: g.avatar || 'https://i.postimg.cc/mDMBh2R8/group-default.png'
        });
    });

    // 渲染列表函数
    const renderList = (targets) => {
        targetList.innerHTML = '';
        if (targets.length === 0) {
            targetList.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">没有找到联系人</div>';
            return;
        }

        targets.forEach(target => {
            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.alignItems = 'center';
            li.style.padding = '10px';
            li.style.borderBottom = '1px solid #f0f0f0';
            li.style.cursor = 'pointer';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = `${target.type}:${target.id}`;
            checkbox.className = 'forward-target-checkbox';
            checkbox.style.marginRight = '10px';
            checkbox.style.width = '18px';
            checkbox.style.height = '18px';

            const avatar = document.createElement('img');
            avatar.src = target.avatar;
            avatar.className = 'squircle';
            avatar.style.width = '40px';
            avatar.style.height = '40px';
            avatar.style.marginRight = '10px';
            avatar.style.objectFit = 'cover';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = target.name;
            nameSpan.style.flex = '1';
            nameSpan.style.fontSize = '14px';
            nameSpan.style.fontWeight = '500';

            li.appendChild(checkbox);
            li.appendChild(avatar);
            li.appendChild(nameSpan);

            // 点击整行触发选中
            li.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                }
            });

            targetList.appendChild(li);
        });
    };

    renderList(allTargets);

    // 搜索功能
    if (searchInput) {
        searchInput.value = '';
        searchInput.oninput = () => {
            const keyword = searchInput.value.toLowerCase();
            const filtered = allTargets.filter(t => t.name.toLowerCase().includes(keyword));
            renderList(filtered);
        };
    }

    modal.classList.add('visible');

    // 绑定确认/取消按钮
    document.getElementById('confirm-forward-btn').onclick = confirmForwardMessages;
    document.getElementById('cancel-forward-btn').onclick = () => modal.classList.remove('visible');
}

// 确认转发消息
async function confirmForwardMessages() {
    const checkboxes = document.querySelectorAll('.forward-target-checkbox:checked');
    if (checkboxes.length === 0) {
        showToast('请至少选择一个转发目标');
        return;
    }

    // 获取当前聊天中选中的消息
    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    if (!chat || !chat.history) return;

    // 按时间顺序获取选中的消息内容
    const messagesToForward = chat.history
        .filter(m => selectedMessageIds.has(m.id))
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    let forwardCount = 0;

    // 遍历选中的接收目标
    for (const cb of checkboxes) {
        const [targetType, targetId] = cb.value.split(':');
        const targetChat = (targetType === 'private') ? db.characters.find(c => c.id === targetId) : db.groups.find(g => g.id === targetId);
        
        if (!targetChat) continue;
        if (!targetChat.history) targetChat.history = [];

        // 获取用户在这个聊天里的名字
        const myName = (targetType === 'private') ? (targetChat.myName || '我') : (targetChat.me ? targetChat.me.nickname : '我');

        // 转发每条消息
        for (let i = 0; i < messagesToForward.length; i++) {
            const originalMsg = messagesToForward[i];
            let cleanText = '';

            // 提取纯文本内容，去掉原本的 [xxx的消息：...] 等
            if (typeof originalMsg.content === 'string') {
                const match = originalMsg.content.match(/^\[.*?：([\s\S]*?)\]$/);
                if (match && match[1]) {
                    cleanText = match[1].trim();
                } else {
                    // 如果不是标准格式，直接取原内容但需要稍微清理可能的括号
                    cleanText = originalMsg.content.replace(/^\[(.*?)\]$/, '$1').trim();
                }
            } else if (originalMsg.parts && originalMsg.parts.length > 0) {
                // 如果是复合消息(通常新版不会，但以防万一)
                cleanText = originalMsg.parts.map(p => p.text || '').join('');
                const match = cleanText.match(/^\[.*?：([\s\S]*?)\]$/);
                if (match && match[1]) cleanText = match[1].trim();
            }

            if (!cleanText) cleanText = "不支持转发的消息格式";

            const newContent = `[${myName}的消息：${cleanText}]`;
            
            // 为了保证时间戳递增，在当前时间基础上微加偏移
            const newTimestamp = Date.now() + i;

            const newMessage = {
                id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                role: 'user', // 转成用户发出的
                content: newContent,
                parts: [{type: 'text', text: newContent}],
                timestamp: newTimestamp,
                senderId: 'user_me'
            };

            targetChat.history.push(newMessage);
        }

        // 如果是私聊，更新一下状态
        if (targetType === 'private' && typeof recalculateChatStatus === 'function') {
            recalculateChatStatus(targetChat);
        }

        forwardCount++;
    }

    await saveData();
    
    // 更新外层聊天列表显示
    if (typeof renderChatList === 'function') {
        renderChatList();
    }

    // 关闭弹窗和多选模式
    document.getElementById('forward-message-modal').classList.remove('visible');
    exitMultiSelectMode();

    showToast(`已成功转发 ${messagesToForward.length} 条消息给 ${forwardCount} 个联系人`);
}

// 供外部调用
window.openForwardModal = openForwardModal;
