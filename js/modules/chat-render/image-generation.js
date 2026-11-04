window._naiGenAbortControllers = {};

function saveImageGenerationChat(chatId, chatType) {
    if (chatType === 'group' && typeof saveGroup === 'function') return saveGroup(chatId);
    if (chatType === 'private' && typeof saveCharacter === 'function') return saveCharacter(chatId);
    if (typeof saveData === 'function') return saveData();
    return Promise.resolve();
}

window._scheduleBackgroundNaiGen = function(msgId, chatId, chatType, pvContent) {
    const tagMatch = pvContent.match(/\{\{([\s\S]+?)\}\}/);
    const parsedPrompt = window.OvoFaceLock?.parsePrompt(tagMatch ? tagMatch[1] : pvContent, chatType === 'private');
    const naiPrompt = parsedPrompt ? parsedPrompt.prompt : (tagMatch ? tagMatch[1].trim() : pvContent);
    const taskChat = chatType === 'private' ? db.characters.find(c => c.id === chatId) : db.groups.find(g => g.id === chatId);
    const taskMessage = taskChat?.history?.find(message => message.id === msgId);
    const taskCharacter = window.OvoFaceLock?.messageCharacter(taskChat, chatType, taskMessage);
    const imageContext = window.OvoFaceLock?.capture(taskCharacter, parsedPrompt?.subject);
    if (imageContext && chatType === 'group') imageContext.settings._character = null;
    _naiAutoGenQueue.push(async () => {
        // 设置 AbortController 并支持可配置的超时时间
        const controller = new AbortController();
        window._naiGenAbortControllers[msgId] = controller;
        const timeoutMs = (db.imageGenTimeout ?? 120) * 1000; // 默认 120 秒，0代表不限制
        let timeoutId;
        if (timeoutMs > 0) {
            timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        }

        let isSuccess = false;
        let finalImageUrl = null;
        let finalMetadata = null;
        let errorReason = null;

        try {
            console.log('[Image Auto Background] 为消息生图, prompt:', naiPrompt);
            const result = await generateImageDispatch(naiPrompt, controller.signal, imageContext);
            
            if (result && result.imageUrl) {
                finalImageUrl = result.imageUrl;
                finalMetadata = {
                    provider: result.provider || db.activeImageProvider || '', model: result.model || '',
                    size: result.size || '', seed: result.seed ?? null, atmosphere: result.atmosphere || '',
                    vibeGroup: result.vibeGroup || '', vibeCount: result.vibeCount || 0,
                    faceLock: result.faceLock || null,
                    mimeType: result.mimeType || '', correlationId: result.correlationId || '',
                    requestSnapshot: result.requestSnapshot || null,
                    originalImageUrl: result.originalImageUrl || result.imageUrl,
                    generatedAt: Date.now()
                };
                // 自动压缩只生成聊天预览；原始文件单独保留，下载时不丢 PNG 元数据或透明通道。
                if (db.autoCompressImage !== false) {
                    try {
                        const blob = await fetch(finalImageUrl).then(res => res.blob());
                        const compressedUrl = await compressImage(blob, { quality: 0.85, maxWidth: 1080, maxHeight: 1920 });
                        finalImageUrl = compressedUrl;
                    } catch (compressErr) {
                        console.error('[Image Auto Background] 自动压缩失败，降级保存原图', compressErr);
                    }
                }
                // 预览与原图相同时只保存一份；下载逻辑会使用当前图片作为原图。
                if (finalMetadata.originalImageUrl === finalImageUrl) delete finalMetadata.originalImageUrl;
                isSuccess = true;
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('[Image Auto Background] 生图被取消或超时:', msgId);
                errorReason = '生图超时或已取消';
            } else {
                console.error('[Image Auto Background] 生图失败:', err);
                errorReason = err.message || '未知网络错误';
            }
        } finally {
            clearTimeout(timeoutId);
            delete window._naiGenAbortControllers[msgId];
            
            // 重要：为了防止闭包里的 db 引用过期，在这里重新查找最新的消息对象！
            const currentChat = chatType === 'private' ? db.characters.find(c => c.id === chatId) : db.groups.find(g => g.id === chatId);
            if (currentChat && currentChat.history) {
                const currentMsg = currentChat.history.find(m => m.id === msgId);
                if (currentMsg) {
                    if (isSuccess && finalImageUrl) {
                        // 保存旧图到版本历史
                        if (currentMsg.novelAiImageUrl) {
                            if (!currentMsg._imageVersions) currentMsg._imageVersions = [];
                            // 避免重复存同样的图
                            if (currentMsg._imageVersions.length === 0 || currentMsg._imageVersions[currentMsg._imageVersions.length - 1].imageUrl !== currentMsg.novelAiImageUrl) {
                                currentMsg._imageVersions.push({
                                    imageUrl: currentMsg.novelAiImageUrl,
                                    savedAt: Date.now(),
                                    metadata: currentMsg.imageGenerationMeta || null
                                });
                            }
                        }
                        currentMsg.novelAiImageUrl = finalImageUrl;
                        currentMsg.imageGenerationMeta = finalMetadata;
                        currentMsg._currentImageIndex = currentMsg._imageVersions ? currentMsg._imageVersions.length : 0;
                        currentMsg.novelAiError = null;
                        currentMsg.isNovelAiGenerating = false;
                    } else if (errorReason) {
                        currentMsg.novelAiError = errorReason;
                        currentMsg.isNovelAiGenerating = false;
                    }
                }
            }

            // 数据落盘
            saveImageGenerationChat(chatId, chatType);
            
            // 如果用户还留在这个聊天界面，主动刷新气泡
            if (window.currentChatId === chatId && window.currentChatType === chatType) {
                renderMessages(false, false);
            }
        }
    });
    _naiAutoGenProcess();
};

window.switchImageVersion = function(msgId, dir, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    if (typeof currentChatId === 'undefined' || typeof currentChatType === 'undefined') return;
    const chat = currentChatType === 'private' ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    if (!chat || !chat.history) return;
    const msg = chat.history.find(m => m.id === msgId);
    if (!msg) return;

    const versionsCount = (msg._imageVersions ? msg._imageVersions.length : 0) + 1;
    if (versionsCount <= 1) return;

    let currentIdx = msg._currentImageIndex !== undefined ? msg._currentImageIndex : versionsCount - 1;
    currentIdx += dir;
    if (currentIdx < 0) currentIdx = versionsCount - 1;
    if (currentIdx >= versionsCount) currentIdx = 0;

    msg._currentImageIndex = currentIdx;
    
    saveImageGenerationChat(currentChatId, currentChatType);
    if (typeof renderMessages === 'function') renderMessages(false, false);
};

window.cancelImageGen = function(msgId) {
    let controllerFound = false;
    if (window._naiGenAbortControllers[msgId]) {
        window._naiGenAbortControllers[msgId].abort();
        controllerFound = true;
    }

    // 保底处理：处理已不存在于内存中但数据库状态仍标记为生图中（僵尸状态）的情况
    if (!controllerFound && typeof currentChatId !== 'undefined' && typeof currentChatType !== 'undefined') {
        const chat = currentChatType === 'private' ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (chat && chat.history) {
            const msg = chat.history.find(m => m.id === msgId);
            if (msg && msg.isNovelAiGenerating) {
                console.log(`[Image Auto Background] 发现僵尸状态消息 ${msgId}，执行强制取消...`);
                msg.isNovelAiGenerating = false;
                msg.novelAiError = '生图已取消或中断';
                saveImageGenerationChat(currentChatId, currentChatType);
                if (typeof renderMessages === 'function') renderMessages(false, false);
            }
        }
    }
};

window.retryImageGen = function(msgId, chatId, chatType) {
    const chat = chatType === 'private' ? db.characters.find(c => c.id === chatId) : db.groups.find(g => g.id === chatId);
    if (!chat || !chat.history) return;
    const msg = chat.history.find(m => m.id === msgId);
    if (!msg) return;

    // 如果不是照片/视频格式，则将其转换为照片/视频格式
    const pvMatch = msg.content.match(/\[.*?发来的照片\/视频[：:]([\s\S]+?)\]/);
    let extractPrompt = '';
    
    if (pvMatch) {
        extractPrompt = pvMatch[1].trim();
    } else {
        // 从普通消息提取文本作为 prompt
        const textMatch = msg.content.match(/\[.*?：([\s\S]*?)\]$/);
        if (textMatch) {
            extractPrompt = textMatch[1].trim();
        } else {
            extractPrompt = msg.content.replace(/^\[(.*?)\]$/, '$1').trim();
        }
        
        // 获取发送者名称
        let senderName = '角色';
        if (msg.role === 'user') {
            senderName = (chatType === 'private') ? (chat.myName || '我') : (chat.me ? chat.me.nickname : '我');
        } else {
            if (chatType === 'private') {
                senderName = chat.remarkName || chat.name || '角色';
            } else {
                const sender = chat.members.find(m => m.id === msg.senderId);
                senderName = sender ? sender.groupNickname : '未知成员';
            }
        }
        
        // 修改内容格式
        msg.content = `[${senderName}发来的照片/视频：${extractPrompt}]`;
        if (msg.parts && msg.parts.length > 0) {
            msg.parts[0].text = msg.content;
        }
    }

    msg.novelAiError = null;
    msg.isNovelAiGenerating = true;
    saveImageGenerationChat(chatId, chatType);
    renderMessages(false, false);

    if (extractPrompt) {
        window._scheduleBackgroundNaiGen(msgId, chatId, chatType, extractPrompt);
    }
};
