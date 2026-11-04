async function fetchAiResponse(settings, requestBody, headers, endpoint, forceStream = false, requestOptions = null) {
    if (settings?._roleBinding && !settings._roleAttempt) {
        const fallbacks = requestOptions?.allowRoleFallback === false ? [] : settings._roleBinding.fallbackConfigs || [];
        const candidates = [settings, ...fallbacks];
        let lastError;
        for (let index = 0; index < candidates.length; index++) {
            const candidate = candidates[index];
            try {
                if (candidate._bindingError) throw new Error(candidate._bindingError);
                const response = await fetchAiResponse({ ...candidate, _roleAttempt: true }, requestBody,
                    getApiConfigHeaders(candidate), getApiConfigEndpoint(candidate, forceStream), forceStream, requestOptions);
                if (!String(response || '').trim()) throw new Error('绑定的 API 未返回有效内容');
                settings._lastRoleApiUsed = window.RoleApiBindings.describe(candidate);
                settings._lastRoleApiUsed.fallback ||= index > 0;
                return response;
            } catch (error) { lastError = error; if (requestOptions?.signal?.aborted || requestOptions?.isAllowed && !requestOptions.isAllowed()) throw error; }
        }
        throw lastError;
    }
    const prepared = prepareAiProviderRequest(settings, requestBody, headers, endpoint, forceStream);
    requestBody = prepared.body; headers = prepared.headers; endpoint = prepared.endpoint;
    const provider = prepared.provider;
    const streamEnabled = forceStream || settings.streamEnabled;

    // 1. 针对流式传输调整 Request Body 和 Endpoint
    if (streamEnabled) {
        if (provider === 'gemini') {
            if (endpoint.includes(':generateContent')) {
                endpoint = endpoint.replace(':generateContent', ':streamGenerateContent');
            }
        } else {
            requestBody.stream = true;
        }
    }

    if (requestOptions?.beforeRequest) await requestOptions.beforeRequest();
    // Token records are diagnostics only and do not change request parameters.
    const tokenRecord = typeof recordAuxiliaryTokenRequest === 'function' ? recordAuxiliaryTokenRequest(settings, requestBody) : null;
    // 2. 发送请求
    let response;
    try { response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
        ...(requestOptions?.signal ? { signal: requestOptions.signal } : {})
    }); } catch (error) { if (tokenRecord) tokenRecord.status = 'failed'; throw error; }

    if (tokenRecord) tokenRecord.status = response.ok ? 'responded' : 'failed';
    if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`API Error: ${response.status} ${errorText}`);
        error.response = response;
        throw error;
    }

    // 3. 处理响应
    // 优先检查响应头是否指示流式，或者我们是否显式请求了流式
    const contentType = response.headers.get('content-type') || '';
    const isStreamResponse = streamEnabled || contentType.includes('text/event-stream');

    if (isStreamResponse) {
        return await readStreamResponse(response, provider, tokenRecord);
    } else {
        // 普通 JSON 响应 (带容错处理)
        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            // JSON 解析失败。检查是否是 SSE 格式的文本 (针对未设置 header 的流式响应)
            if (text.includes('data: ')) {
                console.warn("Received SSE response without header, parsing as text...");
                let fallbackContent = "";
                const lines = text.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                        try {
                            const json = JSON.parse(line.substring(6));
                            if (tokenRecord && typeof captureChatTokenUsage === 'function') captureChatTokenUsage(null, json, tokenRecord);
                            fallbackContent += json.choices[0].delta?.content || "";
                        } catch (e2) {}
                    }
                }
                if (fallbackContent) return fallbackContent;
            }
            throw new Error(`Failed to parse JSON response: ${text.substring(0, 100)}...`);
        }

        if (tokenRecord && typeof captureChatTokenUsage === 'function') captureChatTokenUsage(null, data, tokenRecord);
        return extractAiProviderResponse(data, provider).content;
    }
}

async function readStreamResponse(response, provider, tokenRecord = null) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = "";
    let accumulatedChunk = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulatedChunk += decoder.decode(value, { stream: true });

        if (provider !== 'gemini') {
            // OpenAI / Standard SSE logic
            const parts = accumulatedChunk.split("\n\n");
            accumulatedChunk = parts.pop();
            for (const part of parts) {
                if (part.startsWith("data: ")) {
                    const data = part.substring(6);
                    if (data.trim() !== "[DONE]") {
                        try {
                            const json = JSON.parse(data);
                            if (tokenRecord && typeof captureChatTokenUsage === 'function') captureChatTokenUsage(null, json, tokenRecord);
                            fullResponse += extractAiProviderResponse(json, provider, true).content;
                        } catch (e) {}
                    }
                }
            }
        }
    }

    // Handle remaining chunk for OpenAI
    if (provider !== 'gemini' && accumulatedChunk && accumulatedChunk.trim().length > 0) {
         if (accumulatedChunk.startsWith("data: ")) {
             const data = accumulatedChunk.substring(6);
             if (data.trim() !== "[DONE]") {
                 try {
                     const json = JSON.parse(data);
                            if (tokenRecord && typeof captureChatTokenUsage === 'function') captureChatTokenUsage(null, json, tokenRecord);
                     fullResponse += extractAiProviderResponse(json, provider, true).content;
                 } catch (e) {}
             }
         }
    }

    // Gemini logic (accumulate all and parse at the end)
    if (provider === 'gemini') {
        try {
            // 尝试解析为 JSON 数组
            const parsedStream = JSON.parse(accumulatedChunk);
            if (Array.isArray(parsedStream)) {
                fullResponse = parsedStream.map(item => { if (tokenRecord && typeof captureChatTokenUsage === 'function') captureChatTokenUsage(null, item, tokenRecord); return extractAiProviderResponse(item, provider, true).content; }).join('');
            }
        } catch (e) {
            console.error("Gemini stream parsing failed", e);
        }
    }

    return fullResponse;
}

// --- 图片查看器 ---
function openImageViewer(src, msgId = null) {
    const modal = document.getElementById('full-image-modal');
    const img = document.getElementById('full-image-view');
    const closeBtn = document.getElementById('close-full-image-btn');
    const downloadBtn = document.getElementById('download-full-image-btn');
    const regenBtn = document.getElementById('regen-full-image-btn');
    const editBtn = document.getElementById('edit-full-image-btn');
    const logsBtn = document.getElementById('logs-full-image-btn');
    const versionSwitcher = document.getElementById('full-image-version-switcher');
    const prevVersionBtn = document.getElementById('full-image-prev-version-btn');
    const nextVersionBtn = document.getElementById('full-image-next-version-btn');
    const versionText = document.getElementById('full-image-version-text');
    
    if (!modal || !img) return;
    
    img.src = src;
    modal.classList.add('visible');

    // 查找消息对象
    let msgObj = null;
    let chatObj = null;
    if (msgId && typeof currentChatId !== 'undefined' && typeof currentChatType !== 'undefined') {
        chatObj = currentChatType === 'private' ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (chatObj && chatObj.history) {
            msgObj = chatObj.history.find(m => m.id === msgId);
        }
    }

    // 处理图片版本切换逻辑
    let versionsCount = 1;
    let currentIdx = 0;
    
    const updateVersionUI = () => {
        if (versionsCount > 1) {
            versionSwitcher.style.display = 'flex';
            versionText.textContent = `${currentIdx + 1} / ${versionsCount}`;
        } else {
            versionSwitcher.style.display = 'none';
        }
    };

    if (msgObj && msgObj._imageVersions && msgObj._imageVersions.length > 0) {
        versionsCount = msgObj._imageVersions.length + (msgObj.novelAiImageUrl ? 1 : 0);
        currentIdx = msgObj._currentImageIndex !== undefined ? msgObj._currentImageIndex : versionsCount - 1;
        updateVersionUI();
    } else {
        if (versionSwitcher) versionSwitcher.style.display = 'none';
    }

    const handleVersionSwitch = (dir, event) => {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }
        if (versionsCount <= 1 || !msgObj) return;

        currentIdx += dir;
        if (currentIdx < 0) currentIdx = versionsCount - 1;
        if (currentIdx >= versionsCount) currentIdx = 0;

        msgObj._currentImageIndex = currentIdx;
        
        // 更新全屏图片显示
        if (currentIdx < msgObj._imageVersions.length) {
            img.src = msgObj._imageVersions[currentIdx].imageUrl;
        } else {
            img.src = msgObj.novelAiImageUrl;
        }
        
        updateVersionUI();
        
        // 顺便保存和更新背景的聊天气泡，保持同步
        if (typeof saveData === 'function') saveData();
        if (typeof renderMessages === 'function') renderMessages(false, false);
    };

    // 清理旧事件监听，防止多次绑定
    if (prevVersionBtn) {
        prevVersionBtn.onclick = (e) => handleVersionSwitch(-1, e);
    }
    if (nextVersionBtn) {
        nextVersionBtn.onclick = (e) => handleVersionSwitch(1, e);
    }

    // 根据消息状态显示/隐藏高级按钮
    const isAiGenerated = msgObj && (msgObj.novelAiImageUrl || msgObj.novelAiError || msgObj.isNovelAiGenerating || (msgObj.content && msgObj.content.match(/\[.*?发来的照片\/视频[：:]([\s\S]+?)\]/)));

    if (regenBtn) regenBtn.style.display = isAiGenerated ? 'flex' : 'none';
    if (editBtn) editBtn.style.display = isAiGenerated ? 'flex' : 'none';
    if (logsBtn) logsBtn.style.display = isAiGenerated ? 'flex' : 'none';
    
    // 简单的关闭逻辑
    const closeModal = () => {
        modal.classList.remove('visible');
        setTimeout(() => { img.src = ''; }, 300); // 动画结束后清空
    };
    
    if (closeBtn) closeBtn.onclick = closeModal;

    if (regenBtn && isAiGenerated) {
        regenBtn.onclick = (e) => {
            e.stopPropagation();
            if (typeof window.retryImageGen === 'function') {
                window.retryImageGen(msgId, currentChatId, currentChatType);
                closeModal();
                if (typeof showToast === 'function') showToast('已加入重新生成队列...');
            }
        };
    }

    if (editBtn && isAiGenerated) {
        editBtn.onclick = (e) => {
            e.stopPropagation();
            const editModal = document.getElementById('edit-image-prompt-modal');
            const textarea = document.getElementById('edit-image-prompt-textarea');
            const confirmBtn = document.getElementById('edit-image-prompt-confirm-btn');
            const cancelBtn = document.getElementById('edit-image-prompt-cancel-btn');

            if (!editModal || !textarea) return;

            // 提取提示词
            const pvMatch = msgObj.content.match(/\[.*?发来的照片\/视频[：:]([\s\S]+?)\]/);
            let originalPrompt = pvMatch ? pvMatch[1].trim() : '';

            // 去掉 {{ }} 包装以便于编辑
            const tagMatch = originalPrompt.match(/\{\{([\s\S]+?)\}\}/);
            if (tagMatch) originalPrompt = tagMatch[1].trim();
            const faceLock = window.OvoFaceLock;
            const parsedPrompt = faceLock?.parsePrompt(originalPrompt, currentChatType === 'private');
            if (parsedPrompt) originalPrompt = parsedPrompt.prompt;
            const referenceNote = document.getElementById('edit-image-face-lock-note');
            const referenceCharacter = faceLock?.messageCharacter(chatObj, currentChatType, msgObj);
            if (referenceNote) referenceNote.hidden = !faceLock?.enabledReferences(referenceCharacter, parsedPrompt?.subject).length;

            textarea.value = originalPrompt;
            editModal.classList.add('visible');

            const closeEditModal = () => {
                editModal.classList.remove('visible');
            };

            cancelBtn.onclick = closeEditModal;

            confirmBtn.onclick = () => {
                const newPrompt = faceLock ? faceLock.parsePrompt(textarea.value).prompt : textarea.value.trim();
                if (!newPrompt) {
                    if (typeof showToast === 'function') showToast('提示词不能为空');
                    return;
                }
                const markedPrompt = [newPrompt, ...(parsedPrompt?.markers || [])].join(', ');

                // 更新消息内容，保留消息包装格式
                if (pvMatch) {
                    msgObj.content = msgObj.content.replace(pvMatch[1], `{{${markedPrompt}}}`);
                } else {
                    // 如果由于某种原因正则没有匹配上，直接替换整个内容，并加上照片包装
                    const senderName = msgObj.role === 'assistant' ? (chatObj.remarkName || chatObj.name || 'AI') : '你';
                    msgObj.content = `[${senderName}发来的照片/视频：{{${markedPrompt}}}]`;
                }

                if (typeof saveData === 'function') saveData();
                if (typeof window.retryImageGen === 'function') {
                    window.retryImageGen(msgId, currentChatId, currentChatType);
                }
                
                closeEditModal();
                closeModal();
                if (typeof showToast === 'function') showToast('已保存新提示词并重新生成...');
            };
        };
    }

    if (logsBtn && isAiGenerated) {
        logsBtn.onclick = (e) => {
            e.stopPropagation();
            if (msgObj.novelAiError) {
                if (typeof showErrorModal === 'function') {
                    showErrorModal('生图出错了', new Error(msgObj.novelAiError));
                }
            } else {
                const logModal = document.getElementById('image-log-modal');
                const logContent = document.getElementById('image-log-content');
                const closeLogBtn = document.getElementById('close-image-log-btn');

                if (!logModal || !logContent) return;

                const activeMeta = currentIdx < (msgObj._imageVersions?.length || 0)
                    ? msgObj._imageVersions[currentIdx]?.metadata
                    : msgObj.imageGenerationMeta;
                let engine = activeMeta?.provider || db.activeImageProvider || '未知';

                const pvMatch = msgObj.content.match(/\[.*?发来的照片\/视频[：:]([\s\S]+?)\]/);
                let promptRaw = pvMatch ? pvMatch[1].trim() : msgObj.content;
                let finalPrompt = promptRaw;

                const tagMatch = promptRaw.match(/\{\{([\s\S]+?)\}\}/);
                if (tagMatch) finalPrompt = tagMatch[1].trim();
                if (window.OvoFaceLock) finalPrompt = window.OvoFaceLock.parsePrompt(finalPrompt).prompt;

                let logText = `引擎: ${engine.toUpperCase()}\n状态: 成功`;
                if (activeMeta?.model) logText += `\n模型: ${activeMeta.model}`;
                if (activeMeta?.size) logText += `\n尺寸/比例: ${activeMeta.size}`;
                if (activeMeta?.seed != null) logText += `\nSeed: ${activeMeta.seed}`;
                if (activeMeta?.faceLock) {
                    const labels = { both: 'CHAR 和 USER', user: 'USER' };
                    logText += `\n人物参考: 已使用 ${labels[activeMeta.faceLock.subject] || 'CHAR'} 参考`;
                }
                if (activeMeta?.vibeGroup) logText += `\nVIBE 组: ${activeMeta.vibeGroup}（${activeMeta.vibeCount || 0} 个）`;
                if (activeMeta?.correlationId) logText += `\n请求 ID: ${activeMeta.correlationId}`;
                logText += `\n\n[提取的提示词]\n${finalPrompt}`;

                if (engine === 'novelai' && activeMeta?.requestSnapshot) {
                    const snapshot = activeMeta.requestSnapshot;
                    logText += `\n\n[实际请求快照]\n${JSON.stringify(snapshot, null, 2)}`;
                } else if (engine === 'novelai' && db.novelAiSettings) {
                    // 兼容旧消息：没有请求快照时才展示当前设置，并明确它不是历史请求原文。
                    logText += '\n\n[当前设置（旧消息无历史快照）]';
                    if (db.novelAiSettings.systemPrompt) logText += `\n系统附加词: ${db.novelAiSettings.systemPrompt}`;
                    if (db.novelAiSettings.artistTags) logText += `\n画师附加词: ${db.novelAiSettings.artistTags}`;
                    if (db.novelAiSettings.negativePrompt) logText += `\n负面提示词: ${db.novelAiSettings.negativePrompt}`;
                } else if (engine === 'gpt' && db.gptImageSettings) {
                    if (db.gptImageSettings.systemPrompt) logText += `\n\n[系统附加词]\n${db.gptImageSettings.systemPrompt}`;
                    if (db.gptImageSettings.negativePrompt) logText += `\n\n[负面提示词]\n${db.gptImageSettings.negativePrompt}`;
                } else if (engine === 'google' && db.googleImageSettings) {
                    if (db.googleImageSettings.systemPrompt) logText += `\n\n[系统附加词]\n${db.googleImageSettings.systemPrompt}`;
                    if (db.googleImageSettings.negativePrompt) logText += `\n\n[避免内容]\n${db.googleImageSettings.negativePrompt}`;
                } else if (engine === 'stability' && db.stabilityImageSettings) {
                    if (db.stabilityImageSettings.systemPrompt) logText += `\n\n[系统附加词]\n${db.stabilityImageSettings.systemPrompt}`;
                    if (db.stabilityImageSettings.negativePrompt) logText += `\n\n[负面提示词]\n${db.stabilityImageSettings.negativePrompt}`;
                }

                logContent.textContent = logText;
                logModal.classList.add('visible');

                if (closeLogBtn) {
                    closeLogBtn.onclick = () => {
                        logModal.classList.remove('visible');
                    };
                }
            }
        };
    }
    
    if (downloadBtn) {
        downloadBtn.onclick = async (e) => {
            e.stopPropagation(); // 阻止事件冒泡到 modal 上导致关闭
            try {
                const selectedMeta = msgObj
                    ? (currentIdx < (msgObj._imageVersions?.length || 0) ? msgObj._imageVersions[currentIdx]?.metadata : msgObj.imageGenerationMeta)
                    : null;
                const downloadSrc = selectedMeta?.originalImageUrl || img.src || src;
                downloadBtn.disabled = true;
                await OvoFileDownload.saveImage(downloadSrc, `OVO_Image_${Date.now()}.png`, [img.src || src]);
            } catch (err) {
                console.error('下载图片失败:', err);
                showToast('❌ 下载失败，可能是跨域问题，请长按图片保存');
            } finally { downloadBtn.disabled = false; }
        };
    }
    
    modal.onclick = (e) => {
        if (e.target === modal || e.target.closest('.modal-window')) {
            // 忽略对按钮的点击
            const isActionButton = [downloadBtn, closeBtn, regenBtn, editBtn, logsBtn].some(btn => btn && (e.target === btn || btn.contains(e.target)));
            if (!isActionButton && e.target !== img) {
                closeModal();
            }
        }
    };
}

// === NovelAI 生图 API ===

// Blob 转 DataURL 辅助函数
function _nai_blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// 从 ZIP Blob 中提取图片，返回 DataURL
async function _nai_extractPngFromZipBlob(zipBlob, allImages = false) {
    const arrayBuffer = await zipBlob.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    // 标准 ZIP 中图片通常经过 deflate 压缩，不能只在压缩字节里搜索 PNG 签名。
    const view = new DataView(arrayBuffer);
    const extracted = [];
    for (let offset = 0; offset <= uint8.length - 46; offset++) {
        if (view.getUint32(offset, true) !== 0x02014b50) continue;
        const method = view.getUint16(offset + 10, true);
        const compressedSize = view.getUint32(offset + 20, true);
        const fileNameLength = view.getUint16(offset + 28, true);
        const extraLength = view.getUint16(offset + 30, true);
        const commentLength = view.getUint16(offset + 32, true);
        const localOffset = view.getUint32(offset + 42, true);
        const fileName = new TextDecoder().decode(uint8.slice(offset + 46, offset + 46 + fileNameLength));
        if (/\.(?:png|jpe?g|webp)$/i.test(fileName) && localOffset + 30 <= uint8.length && view.getUint32(localOffset, true) === 0x04034b50) {
            const localNameLength = view.getUint16(localOffset + 26, true);
            const localExtraLength = view.getUint16(localOffset + 28, true);
            const dataStart = localOffset + 30 + localNameLength + localExtraLength;
            const compressed = uint8.slice(dataStart, dataStart + compressedSize);
            let imageBytes = compressed;
            if (method === 8 && typeof DecompressionStream !== 'undefined') {
                const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
                imageBytes = new Uint8Array(await new Response(stream).arrayBuffer());
            } else if (method !== 0) {
                offset += 45 + fileNameLength + extraLength + commentLength;
                continue;
            }
            const mime = /\.jpe?g$/i.test(fileName) ? 'image/jpeg' : /\.webp$/i.test(fileName) ? 'image/webp' : 'image/png';
            const url = await _nai_blobToDataUrl(new Blob([imageBytes], { type: mime }));
            if (!allImages) return url;
            extracted.push(url);
        }
        offset += 45 + fileNameLength + extraLength + commentLength;
    }

    if (allImages) return extracted;
    // 在 zip 字节流中定位 PNG 签名 (89 50 4E 47)
    let pngStart = -1;
    for (let i = 0; i < uint8.length - 8; i++) {
        if (uint8[i] === 0x89 && uint8[i+1] === 0x50 && uint8[i+2] === 0x4E && uint8[i+3] === 0x47) {
            pngStart = i;
            break;
        }
    }

    if (pngStart >= 0) {
        // 找到 PNG IEND 标记来精确截取
        let pngEnd = uint8.length;
        for (let i = pngStart + 8; i < uint8.length - 8; i++) {
            // IEND chunk: 49 45 4E 44
            if (uint8[i] === 0x49 && uint8[i+1] === 0x45 && uint8[i+2] === 0x4E && uint8[i+3] === 0x44) {
                pngEnd = i + 8; // IEND(4) + CRC(4)
                break;
            }
        }
        const pngBlob = new Blob([uint8.slice(pngStart, pngEnd)], { type: 'image/png' });
        return await _nai_blobToDataUrl(pngBlob);
    }

    // 没找到 PNG，尝试找 JPEG 签名 (FF D8 FF)
    for (let i = 0; i < uint8.length - 3; i++) {
        if (uint8[i] === 0xFF && uint8[i+1] === 0xD8 && uint8[i+2] === 0xFF) {
            const jpgBlob = new Blob([uint8.slice(i)], { type: 'image/jpeg' });
            return await _nai_blobToDataUrl(jpgBlob);
        }
    }

    // 都找不到，直接当整个文件转
    return await _nai_blobToDataUrl(zipBlob);
}

// 从 base64 字符串解析为图片 DataURL
function _image_base64Kind(b64) {
    const value = String(b64 || '').replace(/^data:[^,]+,/, '').trim();
    if (value.startsWith('iVBOR')) return 'image/png';
    if (value.startsWith('/9j/')) return 'image/jpeg';
    if (value.startsWith('UklGR')) return 'image/webp';
    if (value.startsWith('R0lGOD')) return 'image/gif';
    if (value.startsWith('UEsDB')) return 'application/zip';
    return '';
}

function parseOvoImageDataUrl(value) {
    if (typeof value !== 'string') return null;
    const match = value.match(/^data:([^;,]+);base64,([\s\S]+)$/i);
    return match ? { mediaType: match[1].toLowerCase(), data: match[2] } : null;
}

function normalizeMultimodalPart(part, protocol) {
    if (!part || typeof part !== 'object') return part;
    if (part.type === 'text') return protocol === 'gemini' ? { text: part.text || '' } : { type: 'text', text: part.text || '' };
    const raw = part.image_url?.url || part.url || '';
    const data = parseOvoImageDataUrl(raw);
    if (protocol === 'anthropic') {
        if (data) return { type: 'image', source: { type: 'base64', media_type: data.mediaType, data: data.data } };
        return { type: 'image', source: { type: 'url', url: raw } };
    }
    if (protocol === 'gemini') {
        if (data) return { inlineData: { mimeType: data.mediaType, data: data.data } };
        return { fileData: { fileUri: raw } };
    }
    return part;
}

function applyConfiguredImageMode(messages, mode) {
    if (!mode) return messages;
    return (messages || []).map(message => ({
        ...message,
        content: Array.isArray(message.content) ? message.content.map(part => {
            if (part?.type !== 'image_url') return part;
            const raw = part.image_url?.url || '';
            const data = parseOvoImageDataUrl(raw);
            if (mode === 'reject' || mode === 'description') throw new Error(mode === 'reject' ? '当前 API 节点被用户设置为不发送图片' : '当前 API 节点只接收图片描述，但本次调用没有可替代的描述');
            if (mode === 'url') {
                if (data) throw new Error('当前 API 节点被用户设置为仅发送图片 URL，但本次图片只有 Base64 数据');
                return part;
            }
            if (mode === 'anthropic_base64' && data) return { type: 'image', source: { type: 'base64', media_type: data.mediaType, data: data.data } };
            if (mode === 'gemini_inline' && data) return { inlineData: { mimeType: data.mediaType, data: data.data } };
            return part;
        }) : message.content
    }));
}

function toAnthropicMessages(messages) {
    const system = [];
    const converted = [];
    (messages || []).forEach(message => {
        if (message.role === 'system' || message.role === 'developer') {
            const content = typeof message.content === 'string' ? message.content : (message.content || []).filter(p => p.type === 'text').map(p => p.text).join('\n');
            if (content) system.push(content); return;
        }
        const role = message.role === 'assistant' ? 'assistant' : 'user';
        const content = Array.isArray(message.content) ? message.content.map(part => normalizeMultimodalPart(part, 'anthropic')) : message.content;
        const previous = converted[converted.length - 1];
        const sourceIds = message.__ovoMessageId ? [message.__ovoMessageId] : (message.__ovoMessageIds || []);
        if (previous?.role === role) {
            const oldParts = Array.isArray(previous.content) ? previous.content : [{ type: 'text', text: previous.content || '' }];
            const newParts = Array.isArray(content) ? content : [{ type: 'text', text: content || '' }];
            previous.content = oldParts.concat(newParts);
            if (sourceIds.length) previous.__ovoMessageIds = [...(previous.__ovoMessageIds || []), ...sourceIds];
        } else converted.push({ role, content, ...(sourceIds.length ? { __ovoMessageIds: sourceIds } : {}) });
    });
    return { system: system.join('\n\n'), messages: converted };
}

function toGeminiContents(messages) {
    const system = [];
    const contents = [];
    (messages || []).forEach(message => {
        if (message.role === 'system' || message.role === 'developer') {
            const text = typeof message.content === 'string' ? message.content : (message.content || []).filter(p => p.type === 'text').map(p => p.text).join('\n');
            if (text) system.push(text); return;
        }
        const role = message.role === 'assistant' ? 'model' : 'user';
        const parts = Array.isArray(message.content) ? message.content.map(part => normalizeMultimodalPart(part, 'gemini')) : [{ text: message.content || '' }];
        const previous = contents[contents.length - 1];
        const sourceIds = message.__ovoMessageId ? [message.__ovoMessageId] : (message.__ovoMessageIds || []);
        if (previous?.role === role) {
            previous.parts.push(...parts);
            if (sourceIds.length) previous.__ovoMessageIds = [...(previous.__ovoMessageIds || []), ...sourceIds];
        } else contents.push({ role, parts, ...(sourceIds.length ? { __ovoMessageIds: sourceIds } : {}) });
    });
    return { systemInstruction: system.length ? { parts: [{ text: system.join('\n\n') }] } : undefined, contents };
}

function getLatestConversationTurnIds(history) {
    const list = Array.isArray(history) ? history : [];
    let lastAssistantIndex = -1;
    list.forEach((message, index) => {
        if (message && (message.role === 'assistant' || message.role === 'char')) lastAssistantIndex = index;
    });
    return list.slice(lastAssistantIndex + 1)
        .filter(message => message && message.role === 'user' && message.id && !message.excludeFromContext && !message.isContextDisabled)
        .map(message => message.id);
}

function protectLatestConversationTurn(messages, latestTurnIds) {
    const ids = new Set((latestTurnIds || []).filter(Boolean));
    if (!ids.size) return { messages: Array.isArray(messages) ? messages : [], protectedCount: 0 };
    const list = Array.isArray(messages) ? [...messages] : [];
    const currentTurn = [];
    const remaining = [];
    list.forEach(message => {
        if (message && ids.has(message.__ovoMessageId)) currentTurn.push(message);
        else remaining.push(message);
    });
    if (currentTurn.length !== ids.size) return { messages: list, protectedCount: currentTurn.length };

    // Real assistant prefill must remain the final message. Other injected rules/triggers
    // belong before the real current user turn so they cannot displace it as the trigger.
    let prefill = null;
    for (let index = remaining.length - 1; index >= 0; index--) {
        const message = remaining[index];
        if (message && message.role === 'assistant' && !message.__ovoMessageId) {
            prefill = remaining.splice(index, 1)[0];
            break;
        }
    }
    remaining.push(...currentTurn);
    if (prefill) remaining.push(prefill);
    return { messages: remaining, protectedCount: currentTurn.length };
}

function validateAndStripLatestTurnProtection(body, protocol, latestTurnIds) {
    const expected = new Set((latestTurnIds || []).filter(Boolean));
    const entries = protocol === 'gemini' ? (body && body.contents || []) : (body && body.messages || []);
    const positions = [];
    entries.forEach((entry, index) => {
        const ids = entry && (entry.__ovoMessageIds || (entry.__ovoMessageId ? [entry.__ovoMessageId] : []));
        ids.forEach(id => { if (expected.has(id)) positions.push({ id, index, role: entry.role }); });
    });
    const found = new Set(positions.map(item => item.id));
    const missingIds = [...expected].filter(id => !found.has(id));
    const lastProtectedIndex = positions.length ? Math.max(...positions.map(item => item.index)) : -1;
    const laterConversational = entries.slice(lastProtectedIndex + 1).filter(entry => {
        if (!entry) return false;
        if (protocol === 'gemini') return entry.role === 'user';
        return entry.role === 'user';
    });
    const valid = expected.size > 0 && missingIds.length === 0 && laterConversational.length === 0;

    stripLatestTurnProtectionMetadata(body);
    return { valid, missingIds, protectedCount: found.size, roles: entries.map(entry => entry && entry.role || '') };
}

function stripLatestTurnProtectionMetadata(value) {
    if (!value || typeof value !== 'object') return value;
    delete value.__ovoMessageId;
    delete value.__ovoMessageIds;
    Object.values(value).forEach(stripLatestTurnProtectionMetadata);
    return value;
}

function getGeminiThinkingLevels(model) {
    const name = String(model || '').toLowerCase();
    if (!/gemini-3/.test(name)) return null;
    if (/gemini-3\.(?:7|8)-flash/.test(name) || /gemini-3\.1-pro/.test(name)) return ['low', 'medium', 'high'];
    if (/gemini-3-pro/.test(name)) return ['low', 'high'];
    if (/gemini-3\.1-flash-lite-image/.test(name)) return ['minimal', 'high'];
    return ['minimal', 'low', 'medium', 'high'];
}

function applyNativeThinkingConfig(body, protocol, model, thinking) {
    if (!thinking || typeof thinking !== 'object') return;
    const enabled = thinking.enabled !== false;
    const effort = thinking.effort || 'auto';
    if (protocol === 'anthropic') {
        if (!enabled) {
            delete body.thinking;
            delete body.output_config;
        } else if (/claude-(?:3[-.]7|3-5|3\.5)/i.test(model || '')) {
            const budgets = { minimal: 1024, low: 2048, medium: 4096, high: 8192, max: 16384 };
            const budget_tokens = effort === 'auto' ? 4096 : (budgets[effort] || 4096);
            body.thinking = { type: 'enabled', budget_tokens };
            body.max_tokens = Math.max(body.max_tokens || 4096, budget_tokens + 1024);
        } else {
            body.thinking = { type: 'adaptive' };
            if (effort !== 'auto') body.output_config = { ...(body.output_config || {}), effort };
        }
    } else if (protocol === 'gemini') {
        body.generationConfig ||= {};
        const isGemini3 = /gemini-3/i.test(model || '');
        if (isGemini3) {
            if (enabled && effort === 'auto') {
                // "由模型决定" means omitting the level, not forcing high.
                delete body.generationConfig.thinkingConfig;
                return;
            }
            let level = enabled ? effort : 'minimal';
            const supported = getGeminiThinkingLevels(model) || [];
            if (!supported.includes(level)) {
                const incompatible = thinking.incompatible || 'error';
                if (incompatible === 'lowest') level = supported[0];
                else if (incompatible === 'provider_default') {
                    delete body.generationConfig.thinkingConfig;
                    return;
                } else {
                    throw new Error(`${model || '当前 Gemini 模型'} 不支持思考等级“${level}”，请在思维链设置中选择兼容处理方式`);
                }
            }
            body.generationConfig.thinkingConfig = { thinkingLevel: level };
        }
        else {
            const budgets = { minimal: 0, low: 1024, medium: 4096, high: 8192, max: 16384 };
            body.generationConfig.thinkingConfig = enabled ? (effort === 'auto' ? { includeThoughts: true } : { thinkingBudget: budgets[effort] ?? 4096, includeThoughts: true }) : { thinkingBudget: 0 };
        }
    } else if (protocol === 'deepseek') {
        body.thinking = { type: enabled ? 'enabled' : 'disabled' };
        if (enabled && effort !== 'auto') body.reasoning_effort = effort;
    } else if (enabled && effort !== 'auto') body.reasoning_effort = effort;
}

function parseApiStopSequences(value) {
    if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
    return String(value || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean);
}

function applyApiGenerationParams(body, settings, protocol) {
    if (!settings?.generationParams || typeof settings.generationParams !== 'object') return body;
    const params = normalizeApiGenerationParams(settings.generationParams, false, settings.temperature);
    const isGemini = protocol === 'gemini';
    const isAnthropic = protocol === 'anthropic';
    const target = isGemini ? (body.generationConfig ||= {}) : body;
    const mappings = isGemini ? {
        temperature: 'temperature', topP: 'topP', topK: 'topK', maxOutputTokens: 'maxOutputTokens',
        frequencyPenalty: 'frequencyPenalty', presencePenalty: 'presencePenalty', seed: 'seed',
        stopSequences: 'stopSequences', candidateCount: 'candidateCount', responseFormat: 'responseMimeType'
    } : isAnthropic ? {
        temperature: 'temperature', topP: 'top_p', topK: 'top_k', maxOutputTokens: 'max_tokens', stopSequences: 'stop_sequences'
    } : {
        temperature: 'temperature', topP: 'top_p', topK: 'top_k', minP: 'min_p', maxOutputTokens: 'max_tokens',
        frequencyPenalty: 'frequency_penalty', presencePenalty: 'presence_penalty', repetitionPenalty: 'repetition_penalty',
        seed: 'seed', stopSequences: 'stop', candidateCount: 'n', responseFormat: 'response_format'
    };
    const allKnownFields = isGemini
        ? ['temperature', 'topP', 'topK', 'minP', 'maxOutputTokens', 'frequencyPenalty', 'presencePenalty', 'repetitionPenalty', 'seed', 'stopSequences', 'candidateCount', 'responseMimeType']
        : ['temperature', 'top_p', 'top_k', 'min_p', 'max_tokens', 'max_completion_tokens', 'frequency_penalty', 'presence_penalty', 'repetition_penalty', 'seed', 'stop', 'stop_sequences', 'n', 'response_format'];
    allKnownFields.forEach(field => {
        if (!(isAnthropic && field === 'max_tokens')) delete target[field];
    });
    Object.entries(params).forEach(([key, entry]) => {
        const field = mappings[key];
        if (!field || !entry.enabled) return;
        let value = entry.value;
        if (key === 'stopSequences') value = parseApiStopSequences(value);
        if (key === 'responseFormat') {
            if (value === 'text') return;
            value = isGemini ? 'application/json' : { type: value };
        }
        if (value === '' || value === null || value === undefined || (Array.isArray(value) && !value.length)) return;
        target[field] = value;
    });
    if (isAnthropic && !params.maxOutputTokens?.enabled) body.max_tokens ||= 4096;
    return body;
}

function prepareAiProviderRequest(settings = {}, originalBody = {}, originalHeaders = {}, originalEndpoint = '', forceStream = false) {
    if (settings._roleBinding) {
        if (settings._bindingError) throw new Error(settings._bindingError);
        originalBody = { ...originalBody, model: settings.model };
        if (!originalBody.messages && Array.isArray(originalBody.contents)) {
            const instruction = originalBody.systemInstruction || originalBody.system_instruction;
            originalBody.messages = [
                ...(instruction ? [{ role: 'system', content: (instruction.parts || []).map(part => part.text || '').join('\n') }] : []),
                ...originalBody.contents.map(content => ({ role: content.role === 'model' ? 'assistant' : 'user', content: (content.parts || []).map(part => {
                    if (part.text !== undefined) return { type: 'text', text: part.text };
                    const inline = part.inlineData || part.inline_data;
                    return inline ? { type: 'image_url', image_url: { url: `data:${inline.mimeType || inline.mime_type};base64,${inline.data}` } } : null;
                }).filter(Boolean) }))
            ];
            const temperature = originalBody.generationConfig?.temperature;
            delete originalBody.contents; delete originalBody.systemInstruction; delete originalBody.system_instruction;
            delete originalBody.generationConfig;
            if (temperature !== undefined) originalBody.temperature = temperature;
        }
        originalEndpoint = getApiConfigEndpoint(settings, forceStream);
        originalHeaders = getApiConfigHeaders(settings);
    }
    const protocol = settings.apiProtocol || (settings.provider === 'gemini' ? 'gemini' : 'openai_chat');
    const provider = protocol === 'anthropic' ? 'anthropic' : protocol === 'gemini' ? 'gemini' : protocol === 'deepseek' ? 'deepseek' : (settings.provider || 'newapi');
    let body = JSON.parse(JSON.stringify(originalBody || {}));
    let endpoint = settings.chatEndpoint || originalEndpoint;
    let headers = { ...(originalHeaders || {}), ...(settings.customHeaders || {}) };
    const thinking = body.__ovoThinking; delete body.__ovoThinking;
    const messages = applyConfiguredImageMode(Array.isArray(body.messages) ? body.messages : [], settings.imageMode || '');
    if (protocol === 'anthropic') {
        const converted = toAnthropicMessages(messages);
        body = { model: body.model || settings.model, max_tokens: body.max_tokens || body.maxTokens || 4096, messages: converted.messages, ...(converted.system ? { system: converted.system } : {}), ...(originalBody.temperature !== undefined ? { temperature: originalBody.temperature } : {}), stream: forceStream || settings.streamEnabled, ...(settings.customBody || {}) };
        endpoint = endpoint && /\/messages(?:\?|$)/.test(endpoint) ? endpoint : `${settings.url.replace(/\/$/, '')}/v1/messages`;
        delete headers.Authorization;
        headers['x-api-key'] ||= getRandomValue(settings.key || ''); headers['anthropic-version'] ||= '2023-06-01'; headers['Content-Type'] = 'application/json';
    } else if (protocol === 'gemini') {
        if (messages.length) {
            const converted = toGeminiContents(messages);
            const { messages: _messages, __ovoThinking: _thinking, ...extras } = originalBody;
            body = { ...extras, contents: converted.contents, ...(converted.systemInstruction ? { systemInstruction: converted.systemInstruction } : {}), generationConfig: { ...(originalBody.generationConfig || {}), ...(originalBody.temperature !== undefined ? { temperature: originalBody.temperature } : {}) }, ...(settings.customBody || {}) };
        } else {
            body = { ...body, ...(settings.customBody || {}) };
            if (body.system_instruction && !body.systemInstruction) {
                body.systemInstruction = body.system_instruction;
                delete body.system_instruction;
            }
            if (Array.isArray(body.contents)) {
                body.contents = body.contents.map(content => ({
                    ...content,
                    parts: (content.parts || []).map(part => {
                        if (!part?.inline_data) return part;
                        const inline = part.inline_data;
                        const { inline_data: _legacyInline, ...rest } = part;
                        return { ...rest, inlineData: { mimeType: inline.mime_type || inline.mimeType, data: inline.data } };
                    })
                }));
            }
        }
        const method = forceStream || settings.streamEnabled ? 'streamGenerateContent' : 'generateContent';
        if (!endpoint || !/:generateContent|:streamGenerateContent/.test(endpoint)) endpoint = `${settings.url.replace(/\/$/, '')}/v1beta/models/${encodeURIComponent(settings.model)}:${method}?key=${encodeURIComponent(getRandomValue(settings.key || ''))}`;
        else endpoint = endpoint.replace(/:(?:streamGenerateContent|generateContent)/, `:${method}`);
    } else {
        body.messages = normalizeMessagesForProvider(messages, settings.provider);
        body = { ...body, ...(settings.customBody || {}) };
    }
    if (settings.chatEndpoint) endpoint = settings.chatEndpoint.replace(/\{model\}/g, encodeURIComponent(settings.model || '')).replace(/\{key\}/g, encodeURIComponent(getRandomValue(settings.key || '')));
    if (settings.authMode === 'none' || settings.authMode === 'custom') {
        delete headers.Authorization;
        delete headers['x-api-key'];
        endpoint = endpoint.replace(/([?&])(?:key|api_key)=[^&]*&?/i, (match, separator) => separator === '?' ? '?' : '').replace(/[?&]$/, '');
    }
    if (settings.authMode === 'x-api-key') {
        delete headers.Authorization;
        headers['x-api-key'] = getRandomValue(settings.key || '');
    } else if (settings.authMode === 'bearer' && settings.key) {
        headers.Authorization = `Bearer ${getRandomValue(settings.key)}`;
    } else if (settings.authMode === 'query' && settings.key && !/[?&](?:key|api_key)=/.test(endpoint)) {
        delete headers.Authorization;
        endpoint += `${endpoint.includes('?') ? '&' : '?'}key=${encodeURIComponent(getRandomValue(settings.key))}`;
    }
    applyApiGenerationParams(body, settings, protocol);
    applyNativeThinkingConfig(body, protocol, settings.model, thinking);
    return { body, headers, endpoint, provider, protocol };
}

function extractAiProviderResponse(data, provider, delta = false) {
    if (provider === 'gemini') {
        const parts = data?.candidates?.[0]?.content?.parts || [];
        return {
            content: parts.filter(part => !part.thought).map(part => part.text || '').join(''),
            reasoning: parts.filter(part => part.thought).map(part => part.text || '').join(''),
            thoughtSignatures: parts.map(part => part.thoughtSignature).filter(Boolean)
        };
    }
    if (provider === 'anthropic') {
        const blocks = Array.isArray(data?.content) ? data.content : (data?.delta ? [data.delta] : []);
        return {
            content: blocks.filter(block => block.type === 'text' || block.type === 'text_delta').map(block => block.text || '').join(''),
            reasoning: blocks.filter(block => block.type === 'thinking' || block.type === 'thinking_delta').map(block => block.thinking || '').join('')
        };
    }
    const message = delta ? data?.choices?.[0]?.delta : data?.choices?.[0]?.message;
    const reasoningText = value => {
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) return value.map(reasoningText).join('');
        if (value && typeof value === 'object') return reasoningText(value.text) || reasoningText(value.content);
        return '';
    };
    return {
        content: message?.content || '',
        reasoning: reasoningText(message?.reasoning_content) || reasoningText(message?.reasoning)
            || reasoningText(message?.reasoning_text) || reasoningText(message?.reasoning_details)
    };
}

function getApiConfigEndpoint(settings, stream = false) {
    if (settings.chatEndpoint) return settings.chatEndpoint;
    const url = String(settings.url || '').replace(/\/$/, '');
    if (settings.apiProtocol === 'anthropic') return `${url}/v1/messages`;
    if (settings.apiProtocol === 'gemini' || settings.provider === 'gemini') return `${url}/v1beta/models/${encodeURIComponent(settings.model || '')}:${stream ? 'streamGenerateContent' : 'generateContent'}?key=${encodeURIComponent(getRandomValue(settings.key || ''))}`;
    return `${url}/v1/chat/completions`;
}

function getApiConfigHeaders(settings) {
    if (settings.apiProtocol === 'gemini' || settings.provider === 'gemini') return { 'Content-Type': 'application/json' };
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${getRandomValue(settings.key || '')}` };
}

function _nai_resolveBase64Image(b64) {
    if (!b64 || typeof b64 !== 'string') return null;
    const value = b64.trim();
    if (/^https?:\/\//i.test(value) || value.startsWith('blob:')) return value;
    if (value.startsWith('data:image/')) return value;
    const mime = _image_base64Kind(value);
    return mime.startsWith('image/') ? `data:${mime};base64,${value.replace(/^data:[^,]+,/, '')}` : null;
}

function _image_base64ToBlob(b64, mimeType) {
    const value = String(b64 || '').replace(/^data:[^,]+,/, '').replace(/\s/g, '');
    const raw = atob(value);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new Blob([bytes], { type: mimeType || _image_base64Kind(value) || 'application/octet-stream' });
}

async function _image_resolveCandidate(candidate) {
    if (!candidate) return null;
    if (typeof candidate === 'object') {
        candidate = candidate.url || candidate.b64_json || candidate.base64 || candidate.image || candidate.data;
    }
    if (typeof candidate !== 'string') return null;
    const value = candidate.trim();
    if (/^https?:\/\//i.test(value) || value.startsWith('blob:') || value.startsWith('data:image/')) return value;
    const kind = _image_base64Kind(value);
    if (kind === 'application/zip') return _nai_extractPngFromZipBlob(_image_base64ToBlob(value, kind));
    return _nai_resolveBase64Image(value);
}

async function _image_extractFromJson(data) {
    const candidates = [
        Array.isArray(data?.data) ? data.data[0] : data?.data,
        data?.output?.[0], data?.images?.[0], data?.result?.images?.[0],
        data?.result?.image, data?.result, data?.image, data?.url, data?.b64_json
    ];
    for (const candidate of candidates) {
        const resolved = await _image_resolveCandidate(candidate);
        if (resolved) return resolved;
    }
    return null;
}

function _imageJoinUrl(base, path) {
    const value = String(base || '').trim();
    if (!value) return '';
    if (/\/(?:images\/(?:generations|edits)|generateContent|generate\/core|generate\/ultra)(?:\?|$)/i.test(value)) return value;
    if (value.replace(/\/$/, '').endsWith('/v1') && path.startsWith('/v1/')) return value.replace(/\/$/, '') + path.slice(3);
    return value.replace(/\/$/, '') + path;
}

function _imageGetAtmosphere(provider) {
    const groups = Array.isArray(db?.imageAtmosphereGroups) ? db.imageAtmosphereGroups : [];
    const group = groups.find(item => item && item.id === db.activeImageAtmosphereId && item.enabled !== false);
    if (!group) return { prompt: '', negativePrompt: '', name: '' };
    const providerPrompt = group.providerPrompts && group.providerPrompts[provider];
    return {
        name: group.name || '',
        prompt: [group.prompt, providerPrompt].filter(Boolean).join(', '),
        negativePrompt: group.negativePrompt || ''
    };
}

function _imageMergePrompt(basePrompt, provider, systemPrompt, negativePrompt) {
    // 历史“文字氛围组”继续保留在设置中供查看/编辑/导入导出，但它不是任何平台的
    // 原生 VIBE 能力，不能再跨平台静默改写用户的提示词。
    return {
        prompt: [systemPrompt, basePrompt].filter(Boolean).join(', '),
        negativePrompt: negativePrompt || '',
        atmosphere: ''
    };
}

async function _imageReadError(response, providerName) {
    let detail = '';
    try {
        const text = await response.text();
        try {
            const json = JSON.parse(text);
            detail = json?.error?.message || json?.message || json?.error || json?.code || text;
        } catch (_) {
            detail = text;
        }
    } catch (_) {}
    detail = String(detail || '').replace(/(?:Bearer\s*;?\s*|sk-)[A-Za-z0-9._-]{8,}/gi, '[已隐藏密钥]').slice(0, 300);
    const correlation = response.headers?.get?.('x-correlation-id');
    const suffix = correlation ? `；请求 ID：${correlation}` : '';
    if (response.status === 401 || response.status === 403) return new Error(`${providerName} 鉴权失败，请检查密钥和服务权限 (${response.status})${suffix}`);
    if (response.status === 402) return new Error(`${providerName} 额度不足 (402)${suffix}`);
    if (response.status === 429) return new Error(`${providerName} 请求过于频繁，请稍后再试 (429)${suffix}`);
    return new Error(`${providerName} 请求失败 (${response.status})${detail ? `：${detail}` : ''}${suffix}`);
}

/**
 * 调用 GPT (DALL-E格式) 图像生成 API
 * @param {string} prompt - 提示词
 * @param {object} [overrideSettings] - 可选，覆盖 db.gptImageSettings 的参数
 * @returns {Promise<{imageUrl: string}>} - 返回图片 URL 或 DataURL
 */
async function generateGptImage(prompt, overrideSettings = {}, signal = null) {
    const settings = overrideSettings._hasCharacterContext ? Object.assign({}, overrideSettings) : Object.assign({}, db.gptImageSettings || {}, overrideSettings);
    const url = settings.url;
    const key = settings.key;
    if (!url) throw new Error('GPT生图 API URL 未配置');
    if (!key) throw new Error('GPT生图 API Key 未配置');
    if (!prompt || !prompt.trim()) throw new Error('提示词不能为空');

    const model = settings.model || 'dall-e-3';
    const faceReference = settings._faceLock ? await window.OvoFaceLock.reference(settings, 'gpt', signal) : null;
    
    // 优先读取角色覆盖尺寸
    let finalSize = settings.size;
    if (settings._hasCharacterContext || (typeof currentChatId !== 'undefined' && typeof currentChatType !== 'undefined' && currentChatType === 'private')) {
        const charObj = settings._hasCharacterContext ? settings._character : (typeof db !== 'undefined' && db.characters ? db.characters.find(c => c.id === currentChatId) : null);
        if (charObj && charObj.gptImageSizeOverride && charObj.gptImageSizeOverride.trim() !== '') {
            finalSize = charObj.gptImageSizeOverride;
        }
    }
    
    let defaultSize = '512x512';
    const sizeDefaults = settings._hasCharacterContext ? settings : db.gptImageSettings;
    if (sizeDefaults && Object.keys(sizeDefaults).length > 0 && !sizeDefaults.size) {
        defaultSize = '1024x1024';
    }
    let size = finalSize || defaultSize;
    if (faceReference) {
        const dimensions = String(size).match(/^(\d+)x(\d+)$/);
        if (/^gpt-image-1/.test(model)) {
            if (!['auto', '1024x1024', '1024x1536', '1536x1024'].includes(size)) size = 'auto';
        } else if (size !== 'auto' && (!dimensions || Number(dimensions[1]) * Number(dimensions[2]) < 655360)) size = 'auto';
    }
    const systemPrompt = settings.systemPrompt || '';
    const negativePrompt = settings.negativePrompt || '';

    // 智能拼接提示词（保留旧系统词与角色画师词）
    const promptParts = [];
    if (systemPrompt) promptParts.push(systemPrompt);
    
    if (settings._hasCharacterContext || (typeof currentChatId !== 'undefined' && typeof currentChatType !== 'undefined' && currentChatType === 'private')) {
        const charObj = settings._hasCharacterContext ? settings._character : (typeof db !== 'undefined' && db.characters ? db.characters.find(c => c.id === currentChatId) : null);
        if (charObj && charObj.gptArtistPrompt) {
            promptParts.push(charObj.gptArtistPrompt);
        }
    }
    
    promptParts.push(prompt.trim());

    const merged = _imageMergePrompt(promptParts.filter(Boolean).join(', '), 'gpt', '', negativePrompt);
    let finalPrompt = merged.prompt;
    if (merged.negativePrompt) finalPrompt = `${finalPrompt} --no ${merged.negativePrompt}`;
    if (faceReference) finalPrompt += _imageFaceReferenceInstruction(faceReference.images);

    const endpoint = faceReference && /\/images\/generations(?:\?|$)/i.test(url)
        ? url.replace(/\/images\/generations(?=\?|$)/i, '/images/edits')
        : _imageJoinUrl(url, faceReference ? '/v1/images/edits' : '/v1/images/generations');
    const headers = { Authorization: `Bearer ${key.trim()}` };
    let body;
    if (faceReference) {
        body = new FormData();
        body.append('model', model);
        body.append('prompt', finalPrompt);
        body.append('n', '1');
        body.append('size', size);
        const imageField = faceReference.images.length > 1 ? 'image[]' : 'image';
        for (const { data, mimeType, subject } of faceReference.images) {
            const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1];
            body.append(imageField, _image_base64ToBlob(data, mimeType), `${subject}-reference.${extension}`);
        }
        if (/^gpt-image-1(?:\.5)?$/.test(model)) body.append('input_fidelity', 'high');
    } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({ model, prompt: finalPrompt, n: 1, size, response_format: 'b64_json' });
    }

    console.log('[GPT Image] 发送生图请求:', { endpoint, model, size, prompt: finalPrompt });

    const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body,
        signal: signal
    });

    if (!response.ok) {
        throw await _imageReadError(response, 'GPT 生图');
    }

    const data = await response.json();
    let imageUrl = await _image_extractFromJson(data);

    if (!imageUrl) {
        throw new Error('响应数据中没有有效的图片链接或Base64数据');
    }

    console.log('[GPT Image] ✅ 生图成功');
    return { imageUrl, provider: 'gpt', model, size, atmosphere: merged.atmosphere, faceLock: faceReference?.metadata || null };
}

/**
 * 统一的生图路由分发函数
 * 根据用户在全局设置中选择的引擎，调用对应提供商。
 * @param {string} prompt - 提示词
 * @returns {Promise<{imageUrl: string}>} - 返回生成的图片 DataURL/URL
 */
async function generateImageDispatch(prompt, signal = null, context = null) {
    if (context) {
        const generators = { gpt: generateGptImage, novelai: generateNovelAiImage, google: generateGoogleImage, stability: generateStabilityImage };
        const generator = generators[context.provider];
        if (!generator) throw new Error('未开启任何生图引擎，请先在 API 设置中启用一个生图平台');
        if (context.settings._faceLock && !window.OvoFaceLock.supported(context.provider, context.settings)) throw new Error('当前生图模型不支持锁脸，请选择支持人物参考的模型，或关闭对应的生图锁脸');
        return generator(prompt, context.settings, signal);
    }
    const enabled = {
        gpt: !!db.gptImageSettings?.enabled,
        novelai: !!db.novelAiSettings?.enabled,
        google: !!db.googleImageSettings?.enabled,
        stability: !!db.stabilityImageSettings?.enabled
    };
    let provider = db.activeImageProvider;
    if (!enabled[provider]) provider = ['gpt', 'novelai', 'google', 'stability'].find(key => enabled[key]);
    if (provider === 'gpt') return generateGptImage(prompt, {}, signal);
    if (provider === 'novelai') return generateNovelAiImage(prompt, {}, signal);
    if (provider === 'google') return generateGoogleImage(prompt, {}, signal);
    if (provider === 'stability') return generateStabilityImage(prompt, {}, signal);
    throw new Error('未开启任何生图引擎，请先在 API 设置中启用一个生图平台');
}

/**
 * 调用 NovelAI 图像生成 API
 * @param {string} prompt - 正面提示词 (英文 tag)
 * @param {object} [overrideSettings] - 可选，覆盖 db.novelAiSettings 的参数
 * @returns {Promise<{imageUrl: string}>} - 返回图片 DataURL
 */
async function generateNovelAiImage(prompt, overrideSettings = {}, signal = null) {
    const settings = overrideSettings._hasCharacterContext ? Object.assign({}, overrideSettings) : Object.assign({}, db.novelAiSettings || {}, overrideSettings);
    const token = settings.token;
    const authMode = settings.authMode || 'bearer';
    if (!token && authMode !== 'none') throw new Error('NovelAI Token 未配置');
    if (!prompt || !prompt.trim()) throw new Error('提示词不能为空');

    // 清理 Token 中可能的特殊字符
    const cleanToken = String(token || '').trim().replace(/[\r\n]/g, '');

    const customUrlEnabled = settings.customUrlEnabled || false;
    const customUrl = (settings.customUrl || '').trim();

    let model = settings.model || 'nai-diffusion-4-curated-preview';
    const resolution = settings.resolution || '832x1216';
    const [widthStr, heightStr] = resolution.split('x');
    const width = parseInt(widthStr) || 832;
    const height = parseInt(heightStr) || 1216;
    const sampler = settings.sampler || 'k_euler_ancestral';
    const steps = Number.isFinite(Number(settings.steps)) ? Number(settings.steps) : 28;
    const scale = Number.isFinite(Number(settings.scale)) ? Number(settings.scale) : 5;
    const systemPrompt = settings.systemPrompt || '';
    const artistTags = settings.artistTags || '';
    const negativePrompt = settings.negativePrompt || '';

    // 拼接最终 prompt：系统基础 Prompt + 画师串 + 用户 prompt。VIBE 走独立图片引用字段。
    const merged = _imageMergePrompt([artistTags, prompt].filter(Boolean).join(', '), 'novelai', systemPrompt, negativePrompt);
    const compat = window.NovelAiCompat;
    if (!compat) throw new Error('NovelAI 适配模块未加载，请刷新页面');
    const modernModel = /nai-diffusion-[45]/.test(model);
    const expanded = modernModel ? compat.prompts(merged.prompt, merged.negativePrompt, model, settings) : { prompt: merged.prompt, negativePrompt: merged.negativePrompt };
    const fullPrompt = expanded.prompt;
    const fullNegativePrompt = expanded.negativePrompt;
    if (modernModel && compat.catalog[model]) {
        if (!compat.catalog[model].quality.some(item => item.id === expanded.quality)) throw new Error('当前模型不支持所选质量预设，请使用 Standard 或关闭质量增强');
        if (!compat.catalog[model].negative.some(item => item.id === expanded.uc)) throw new Error('当前模型不支持所选负面预设，请调整负面预设后重试');
    }

    console.log('[NovelAI] 最终 Prompt:', fullPrompt);

    // inpainting 模型不能直接生成，回退到同版本普通模型
    if (model === 'nai-diffusion-3-inpainting') model = 'nai-diffusion-3';

    const modelFamily = window.NovelAiVibe?.modelFamily?.(model) || compat.family(model);
    const isV4 = modelFamily === 'v4';
    const isV5 = modelFamily === 'v5';
    const isModern = isV4 || isV5;
    const faceReference = settings._faceLock ? await window.OvoFaceLock.reference(settings, 'novelai', signal) : null;
    const configuredSeed = settings.seed === '' || settings.seed == null ? null : Number(settings.seed);
    if (configuredSeed !== null && (!Number.isInteger(configuredSeed) || configuredSeed < 0 || configuredSeed > 4294967295)) throw new Error('Seed 必须是 0 到 4294967295 的整数，或留空随机');
    const commonSeed = Number.isFinite(configuredSeed) ? Math.max(0, Math.trunc(configuredSeed)) : Math.floor(Math.random() * 0x100000000);
    const vibe = !faceReference && window.NovelAiVibe?.resolveForGeneration
        ? await window.NovelAiVibe.resolveForGeneration(model, settings, signal)
        : { images: [], information: [], strengths: [], groupName: '' };
    const precise = faceReference
        ? { images: [await compat.fitImage(faceReference.images[0].dataUrl, undefined, undefined, 'black', signal)], strengths: [0.8], fidelity: [1], descriptions: ['character'] }
        : window.NovelAiVibe?.resolvePreciseReferences
        ? await window.NovelAiVibe.resolvePreciseReferences(model, settings, signal)
        : { images: [], strengths: [], fidelity: [], descriptions: [] };
    const noiseSchedule = isV5 ? 'karras' : (settings.noiseSchedule || (isModern ? 'karras' : 'native'));
    const sampleCount = Math.max(1, Math.min(4, Math.trunc(Number(settings.nSamples) || 1)));
    if (isV5 && (!Number.isFinite(scale) || scale < 0 || scale > 10)) throw new Error('V5 的 Guidance 必须在 0 到 10 之间；请调整当前数值后重试');
    const qualityToggle = settings.qualityToggle !== false;
    const ucPreset = Number.isFinite(Number(settings.ucPreset)) ? Number(settings.ucPreset) : 0;
    if (!isModern && (ucPreset > 3 || settings.qualityPresetId === 'light')) throw new Error('V3 不支持所选预设，请使用原有负面预设与 Standard 质量预设');

    // 根据模型版本构建不同的请求体
    let requestBody;
    if (isModern) {
        requestBody = {
            input: fullPrompt,
            model: model,
            action: 'generate',
            parameters: {
                params_version: 4,
                width, height, scale, sampler, steps,
                seed: commonSeed,
                n_samples: sampleCount,
                ucPreset,
                qualityToggle,
                autoSmea: !!settings.autoSmea,
                dynamic_thresholding: false,
                controlnet_strength: 1,
                legacy: false,
                add_original_image: true,
                cfg_rescale: Number(settings.cfgRescale) || 0,
                noise_schedule: noiseSchedule,
                legacy_v3_extend: false,
                skip_cfg_above_sigma: null,
                use_coords: false,
                legacy_uc: false,
                normalize_reference_strength_multiple: true,
                characterPrompts: [],
                v4_prompt: {
                    caption: { base_caption: fullPrompt, char_captions: [] },
                    use_coords: false,
                    use_order: true
                },
                v4_negative_prompt: {
                    caption: { base_caption: fullNegativePrompt, char_captions: [] },
                    legacy_uc: false
                },
                negative_prompt: fullNegativePrompt,
                deliberate_euler_ancestral_bug: false,
                prefer_brownian: true
            }
        };
        requestBody.parameters.sm = !!settings.smea;
        requestBody.parameters.sm_dyn = !!settings.smeaDyn;
        const characterLimit = isV5 ? 22 : 6;
        const characters = (Array.isArray(settings.characterPrompts) ? settings.characterPrompts : [])
            .filter(item => item?.enabled !== false && String(item?.prompt || '').trim())
            .map(item => {
                const x = Number(item.center?.x);
                const y = Number(item.center?.y);
                return {
                    prompt: String(item.prompt).trim(), uc: String(item.uc || '').trim(),
                    center: {
                        x: Number.isFinite(x) ? (isV5 ? Math.min(1, Math.max(0, x)) : (Math.round(Math.min(0.9, Math.max(0.1, x)) * 5 - 0.5) * 2 + 1) / 10) : 0.5,
                        y: Number.isFinite(y) ? (isV5 ? Math.min(1, Math.max(0, y)) : (Math.round(Math.min(0.9, Math.max(0.1, y)) * 5 - 0.5) * 2 + 1) / 10) : 0.5
                    }
                };
            });
        if (characters.length > characterLimit) throw new Error(`当前模型最多 ${characterLimit} 个角色提示，已有 ${characters.length} 个；请调整角色列表，原数据不会被删除`);
        if (characters.length) {
            const useCoords = !!settings.characterUseCoords;
            requestBody.parameters.use_coords = useCoords;
            requestBody.parameters.characterPrompts = characters;
            requestBody.parameters.v4_prompt.use_coords = useCoords;
            requestBody.parameters.v4_prompt.use_order = settings.characterUseOrder !== false;
            requestBody.parameters.v4_prompt.caption.char_captions = characters.map(item => ({ char_caption: item.prompt, centers: [item.center] }));
            requestBody.parameters.v4_negative_prompt.caption.char_captions = characters.map(item => ({ char_caption: item.uc, centers: [item.center] }));
        }
        if (vibe.images.length) {
            requestBody.parameters.reference_image_multiple = vibe.images;
            requestBody.parameters.reference_strength_multiple = vibe.strengths;
        }
        if (precise.images.length) {
            requestBody.parameters.director_reference_images = precise.images;
            requestBody.parameters.director_reference_descriptions = precise.descriptions.map(description => ({ caption: { base_caption: description, char_captions: [] }, legacy_uc: false }));
            requestBody.parameters.director_reference_information_extracted = precise.images.map(() => 1);
            requestBody.parameters.director_reference_strength_values = precise.strengths;
            requestBody.parameters.director_reference_secondary_strength_values = precise.fidelity.map(value => 1 - value);
        }
        requestBody.parameters.tag_hint_qt = compat.hints[expanded.quality] ?? 0;
        requestBody.parameters.tag_hint_uc_preset = compat.hints[expanded.uc] ?? 0;
        delete requestBody.parameters.ucPreset;
        delete requestBody.parameters.qualityToggle;
        if (isV5) {
            requestBody.parameters.straight_alpha = settings.straightAlpha !== false;
            requestBody.parameters.tag_hint_transparent_background = !!settings.transparentBackground;
            requestBody.parameters.image_format = settings.imageFormat || 'png';
            delete requestBody.parameters.sm;
            delete requestBody.parameters.sm_dyn;
            delete requestBody.parameters.autoSmea;
            delete requestBody.parameters.skip_cfg_above_sigma;
        }
    } else {
        // V3 请求格式
        requestBody = {
            input: fullPrompt,
            model: model,
            action: 'generate',
            parameters: {
                width, height, scale, sampler, steps,
                seed: commonSeed,
                n_samples: sampleCount,
                ucPreset,
                qualityToggle,
                sm: !!settings.smea,
                sm_dyn: !!settings.smeaDyn,
                dynamic_thresholding: false,
                controlnet_strength: 1,
                legacy: false,
                add_original_image: false,
                cfg_rescale: Number(settings.cfgRescale) || 0,
                noise_schedule: noiseSchedule,
                negative_prompt: fullNegativePrompt
            }
        };
        if (vibe.images.length) {
            requestBody.parameters.reference_image_multiple = vibe.images;
            requestBody.parameters.reference_information_extracted_multiple = vibe.information;
            requestBody.parameters.reference_strength_multiple = vibe.strengths;
        }
    }

    const action = settings.action || 'generate';
    if (!['generate', 'img2img', 'infill'].includes(action)) throw new Error('不支持的 NovelAI 创作操作');
    requestBody.action = action;
    if (action !== 'generate') {
        if (!settings.initImage) throw new Error('请先选择原图');
        requestBody.parameters.image = await compat.fitImage(settings.initImage, width, height, isV5 ? 'transparent' : 'white', signal);
        requestBody.parameters.strength = Math.min(1, Math.max(0, Number.isFinite(Number(settings.strength)) ? Number(settings.strength) : 0.7));
        requestBody.parameters.noise = Math.min(1, Math.max(0, Number(settings.noise) || 0));
        requestBody.parameters.extra_noise_seed = commonSeed;
        if (!isV5) { requestBody.parameters.sm = false; requestBody.parameters.sm_dyn = false; }
        if (action === 'infill') {
            if (!settings.mask) throw new Error('请在原图上涂抹需要重绘的区域');
            requestBody.parameters.mask = await compat.fitImage(settings.mask, width, height, 'black', signal);
            if (isModern) requestBody.parameters.img2img = { strength: requestBody.parameters.strength, color_correct: true };
            const inpaintingModels = { 'nai-diffusion-4-curated-preview': 'nai-diffusion-4-curated-inpainting', 'nai-diffusion-5-curated': 'nai-diffusion-4-5-curated-inpainting' };
            requestBody.model = inpaintingModels[model] || model + '-inpainting';
            if (model === 'nai-diffusion-5-curated') throw new Error('V5 Curated 当前使用 V4.5 Curated 重绘；请在模型设置中明确选择 V4.5 Curated 后重试');
        }
    }
    if (settings.enhanceMax) {
        if (!isV5 || action !== 'img2img') throw new Error('Max Enhance 仅支持 V5 图生图');
        requestBody.parameters.upscaled_enhance = true;
    }
    const useStream = settings.generationMode === 'stream' || (settings.generationMode !== 'normal' && isModern);
    if (useStream) requestBody.parameters.stream = 'sse';
    const apiUrl = compat.endpoint(settings, useStream ? 'stream' : 'generate');
    const requestHeaders = compat.headers(settings, useStream ? 'text/event-stream' : 'application/json');
    const correlationId = requestHeaders['x-correlation-id'];
    console.log('[NovelAI] 发送生图请求:', { model: requestBody.model, modelFamily, width, height, steps, scale, sampler, correlationId });

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
        signal: signal
    });

    console.log(`[NovelAI] 响应状态: ${response.status}, Content-Type: ${response.headers.get('content-type')}`);

    if (!response.ok) {
        const error = await _imageReadError(response, 'NovelAI');
        if (!error.message.includes(correlationId)) error.message += `；请求 ID：${correlationId}`;
        throw error;
    }

    // === 根据响应 Content-Type 选择解析策略 ===
    const contentType = response.headers.get('content-type') || '';
    let imageDataUrl = null;
    let imageResults = [];

    if (contentType.includes('text/event-stream') || contentType.includes('application/x-ndjson')) {
        try { imageResults = await compat.readSSE(response, settings.onProgress, signal); }
        catch (error) { if (error.name !== 'AbortError') error.message += `；请求 ID：${correlationId}`; throw error; }
        imageDataUrl = imageResults[0]?.imageUrl;
    } else if (contentType.includes('application/json')) {
        // === JSON 响应（某些代理会返回 JSON） ===
        console.log('[NovelAI] 解析 JSON 响应...');
        const jsonData = await response.json();
        if (Array.isArray(jsonData.images)) {
            for (const [index, item] of jsonData.images.entries()) {
                const image = await _image_resolveCandidate(item);
                if (image) imageResults.push({ imageUrl: image, seed: item?.seed, index: item?.index ?? index });
            }
        }
        imageDataUrl = imageResults[0]?.imageUrl || await _image_extractFromJson(jsonData);
        if (!imageDataUrl) {
            throw new Error('JSON 响应中未找到图片数据');
        }

    } else {
        // === 默认当 ZIP / 二进制 Blob 处理（V3 常见）===
        console.log('[NovelAI] 解析二进制/ZIP 响应...');
        const blob = await response.blob();
        const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
        const looksLikeImage = (head[0] === 0x89 && head[1] === 0x50)
            || (head[0] === 0xff && head[1] === 0xd8)
            || (head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46);
        if ((blob.type && blob.type.startsWith('image/')) || looksLikeImage) {
            let typedBlob = blob;
            if (!blob.type.startsWith('image/')) {
                const mime = head[0] === 0xff ? 'image/jpeg' : (head[0] === 0x52 ? 'image/webp' : 'image/png');
                typedBlob = new Blob([await blob.arrayBuffer()], { type: mime });
            }
            imageDataUrl = await _nai_blobToDataUrl(typedBlob);
        } else {
            if (sampleCount > 1) {
                const urls = await _nai_extractPngFromZipBlob(blob, true);
                imageResults = urls.map((imageUrl, index) => ({ imageUrl, index }));
                imageDataUrl = imageResults[0]?.imageUrl;
            } else imageDataUrl = await _nai_extractPngFromZipBlob(blob);
        }
    }

    if (!imageDataUrl) {
        throw new Error('未能从响应中获取图片');
    }

    if (!imageResults.length) imageResults = [{ imageUrl: imageDataUrl, seed: commonSeed, index: 0 }];
    for (const result of imageResults) {
        if (!result.imageUrl.startsWith('http')) continue;
        try {
            const imgRes = await fetch(result.imageUrl, { signal });
            if (!imgRes.ok) throw new Error('图片下载失败');
            result.imageUrl = await _nai_blobToDataUrl(await imgRes.blob());
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            console.warn('[NovelAI] 原图持久化失败，保留原链接');
        }
    }
    imageDataUrl = imageResults[0].imageUrl;

    console.log('[NovelAI] ✅ 生图成功');
    const snapshotParameters = { ...requestBody.parameters };
    delete snapshotParameters.reference_image_multiple;
    delete snapshotParameters.director_reference_images;
    delete snapshotParameters.image;
    delete snapshotParameters.mask;
    return {
        imageUrl: imageDataUrl, originalImageUrl: imageDataUrl, images: imageResults.length ? imageResults : [{ imageUrl: imageDataUrl, seed: commonSeed, index: 0 }], provider: 'novelai', model: requestBody.model,
        size: resolution, seed: imageResults[0]?.seed ?? commonSeed, vibeGroup: vibe.groupName || '', vibeCount: vibe.images.length,
        faceLock: faceReference?.metadata || null,
        mimeType: /^data:([^;,]+)/.exec(imageDataUrl)?.[1] || '', correlationId,
        requestSnapshot: {
            input: requestBody.input, model: requestBody.model, action: requestBody.action,
            parameters: snapshotParameters,
            referenceCount: vibe.images.length,
            preciseReferenceCount: precise.images.length,
            referenceStrengths: vibe.strengths,
            referenceInformationExtracted: isV4 ? undefined : vibe.information
        }
    };
}

function _imageFaceReferenceInstruction(images) {
    const identities = images.map(({ subject }, index) => `参考图 ${index + 1} 对应 ${subject === 'user' ? 'USER' : 'CHAR'}`);
    return '\n' + identities.join('，') + '。每张参考图只用于对应人物的身份与面部特征，其他出镜者各自保持独立的外貌。人物数量、位置、服装、表情、动作、背景和构图按上述场景描述生成。';
}

/** 使用 Google Gemini 原生图片模型生成图片。 */
async function generateGoogleImage(prompt, overrideSettings = {}, signal = null) {
    const settings = overrideSettings._hasCharacterContext ? Object.assign({}, overrideSettings) : Object.assign({}, db.googleImageSettings || {}, overrideSettings);
    const key = String(settings.key || '').trim();
    const baseUrl = String(settings.url || 'https://generativelanguage.googleapis.com').trim();
    const model = settings.model || 'gemini-3.1-flash-image';
    if (!key) throw new Error('Google 生图 API Key 未配置');
    if (!prompt || !prompt.trim()) throw new Error('提示词不能为空');
    const faceReference = settings._faceLock ? await window.OvoFaceLock.reference(settings, 'google', signal) : null;

    const merged = _imageMergePrompt(prompt.trim(), 'google', settings.systemPrompt || '', settings.negativePrompt || '');
    let finalPrompt = merged.prompt;
    if (merged.negativePrompt) finalPrompt += `\n\n画面中不要出现：${merged.negativePrompt}`;
    if (faceReference) finalPrompt += _imageFaceReferenceInstruction(faceReference.images);
    const endpoint = /:generateContent(?:\?|$)/.test(baseUrl)
        ? baseUrl
        : `${baseUrl.replace(/\/$/, '')}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const generationConfig = { responseModalities: ['TEXT', 'IMAGE'] };
    if (settings.aspectRatio) generationConfig.imageConfig = { aspectRatio: settings.aspectRatio };

    const inputParts = [{ text: finalPrompt }];
    for (const { mimeType, data } of faceReference?.images || []) inputParts.push({ inlineData: { mimeType, data } });
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ role: 'user', parts: inputParts }], generationConfig }),
        signal
    });
    if (!response.ok) throw await _imageReadError(response, 'Google 生图');
    const data = await response.json();
    const parts = data?.candidates?.flatMap(candidate => candidate?.content?.parts || []) || [];
    const imagePart = parts.find(part => part.inlineData?.data || part.inline_data?.data);
    const inline = imagePart?.inlineData || imagePart?.inline_data;
    if (!inline?.data) {
        const reason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason;
        throw new Error(reason ? `Google 未返回图片：${reason}` : 'Google 响应中未找到图片数据');
    }
    const mimeType = inline.mimeType || inline.mime_type || 'image/png';
    return {
        imageUrl: `data:${mimeType};base64,${inline.data}`,
        provider: 'google', model, size: settings.aspectRatio || '', atmosphere: merged.atmosphere,
        faceLock: faceReference?.metadata || null
    };
}

/** 使用 Stability Stable Image 接口生成图片。 */
async function generateStabilityImage(prompt, overrideSettings = {}, signal = null) {
    const settings = overrideSettings._hasCharacterContext ? Object.assign({}, overrideSettings) : Object.assign({}, db.stabilityImageSettings || {}, overrideSettings);
    if (settings._faceLock) throw new Error('当前 Stability 生图接口不支持锁脸，请选择支持人物参考的生图服务，或关闭该角色的生图锁脸');
    const key = String(settings.key || '').trim();
    const baseUrl = String(settings.url || 'https://api.stability.ai').trim();
    const service = settings.service === 'ultra' ? 'ultra' : 'core';
    if (!key) throw new Error('Stability API Key 未配置');
    if (!prompt || !prompt.trim()) throw new Error('提示词不能为空');

    const merged = _imageMergePrompt(prompt.trim(), 'stability', settings.systemPrompt || '', settings.negativePrompt || '');
    const endpoint = /\/stable-image\/generate\/(?:core|ultra)(?:\?|$)/.test(baseUrl)
        ? baseUrl
        : `${baseUrl.replace(/\/$/, '')}/v2beta/stable-image/generate/${service}`;
    const form = new FormData();
    form.append('prompt', merged.prompt);
    if (merged.negativePrompt) form.append('negative_prompt', merged.negativePrompt);
    form.append('output_format', settings.outputFormat || 'png');
    if (settings.aspectRatio) form.append('aspect_ratio', settings.aspectRatio);
    if (settings.stylePreset) form.append('style_preset', settings.stylePreset);
    if (settings.seed !== '' && settings.seed != null) form.append('seed', String(settings.seed));

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, Accept: 'image/*' },
        body: form,
        signal
    });
    if (!response.ok) throw await _imageReadError(response, 'Stability');
    const contentType = response.headers.get('content-type') || '';
    let imageUrl;
    if (contentType.includes('application/json')) imageUrl = await _image_extractFromJson(await response.json());
    else imageUrl = await _nai_blobToDataUrl(await response.blob());
    if (!imageUrl) throw new Error('Stability 响应中未找到图片数据');
    return {
        imageUrl, provider: 'stability', model: `stable-image-${service}`,
        size: settings.aspectRatio || '', seed: settings.seed, atmosphere: merged.atmosphere
    };
}

/**
 * 使用已保存的 NovelAI 设置生成图片（便捷方法）
 * @param {string} prompt - 正面提示词
 * @returns {Promise<{imageUrl: string}>}
 */
async function novelAiGenerate(prompt) {
    if (!db.novelAiSettings || !db.novelAiSettings.enabled) {
        throw new Error('NovelAI 生图未启用，请在 API 设置中开启');
    }
    return generateNovelAiImage(prompt);
}

// 暴露给全局
window.showErrorModal = showErrorModal;
window.openImageViewer = openImageViewer;
window.getRandomValue = getRandomValue;
window.pad = pad;
window.formatTimeGap = formatTimeGap;
window.getLocalTimeInTimezone = getLocalTimeInTimezone;
window.filterHistoryForAI = filterHistoryForAI;
window.showToast = showToast;
window.showAppConfirmDialog = showAppConfirmDialog;
window.playSound = (typeof playSound !== 'undefined') ? playSound : null; // 防止循环依赖
window.generateGptImage = generateGptImage;
window.generateImageDispatch = generateImageDispatch;
window.generateNovelAiImage = generateNovelAiImage;
window.generateGoogleImage = generateGoogleImage;
window.generateStabilityImage = generateStabilityImage;
window.novelAiGenerate = novelAiGenerate;
window.writeOvoPngMetadata = writeOvoPngMetadata;
window.readOvoPngMetadata = readOvoPngMetadata;
