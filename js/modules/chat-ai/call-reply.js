function normalizeCallResponseContent(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content.map(part => {
        if (typeof part === 'string') return part;
        if (!part || typeof part !== 'object') return '';
        return typeof part.text === 'string' ? part.text
            : (typeof part.content === 'string' ? part.content : '');
    }).join('');
}

function extractCallResponseText(payload, provider, useDelta = false) {
    if (!payload) return '';
    if (Array.isArray(payload)) {
        return payload.map(item => extractCallResponseText(item, provider, useDelta)).join('');
    }
    if (typeof extractAiProviderResponse === 'function') {
        const normalized = extractAiProviderResponse(payload, provider, useDelta);
        if (normalized.content) return normalized.content;
    }

    const geminiText = (payload.candidates || []).map(candidate => {
        const parts = candidate && candidate.content && candidate.content.parts;
        return Array.isArray(parts) ? parts.map(part => part && part.text || '').join('') : '';
    }).join('');
    if (provider === 'gemini' || geminiText) return geminiText;

    const choice = payload.choices && payload.choices[0];
    if (choice) {
        const source = useDelta ? (choice.delta || choice.message) : (choice.message || choice.delta);
        const choiceText = normalizeCallResponseContent(source && source.content);
        if (choiceText) return choiceText;
        if (typeof choice.text === 'string') return choice.text;
    }

    if (typeof payload.output_text === 'string') return payload.output_text;
    if (Array.isArray(payload.output)) {
        return payload.output.map(item => normalizeCallResponseContent(item && item.content)).join('');
    }
    return '';
}

function parseCallStreamBlock(rawBlock, provider) {
    const block = String(rawBlock || '').trim();
    if (!block) return { text: '', parsed: false };

    const dataLines = block.split(/\r?\n/)
        .filter(line => /^data\s*:/.test(line))
        .map(line => line.replace(/^data\s*:\s?/, ''));
    if (dataLines.length) {
        const joinedValue = dataLines.join('\n').trim();
        if (!joinedValue || joinedValue === '[DONE]') return { text: '', parsed: true };
        try {
            return { text: extractCallResponseText(JSON.parse(joinedValue), provider, true), parsed: true };
        } catch (error) {
            let text = '';
            let parsed = false;
            for (const dataLine of dataLines) {
                const value = dataLine.trim();
                if (!value || value === '[DONE]') {
                    parsed = true;
                    continue;
                }
                try {
                    text += extractCallResponseText(JSON.parse(value), provider, true);
                    parsed = true;
                } catch (lineError) {
                    // Continue so one malformed event cannot discard later valid events.
                }
            }
            return { text, parsed };
        }
    }

    try {
        return { text: extractCallResponseText(JSON.parse(block), provider, true), parsed: true };
    } catch (error) {
        // Fall through to NDJSON parsing.
    }

    let text = '';
    let parsed = false;
    for (const line of block.split(/\r?\n/)) {
        const value = line.replace(/^data\s*:\s?/, '').trim();
        if (!value || value === '[DONE]' || value.startsWith(':')) continue;
        try {
            text += extractCallResponseText(JSON.parse(value), provider, true);
            parsed = true;
        } catch (error) {
            // The caller reports the aggregate parsing failure without exposing content.
        }
    }
    return { text, parsed };
}

async function readCallStreamResponse(response, provider) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let text = '';
    let parsedBlocks = 0;
    let failedBlocks = 0;

    const consume = block => {
        const result = parseCallStreamBlock(block, provider);
        if (result.parsed) {
            parsedBlocks += 1;
            text += result.text;
        } else if (String(block || '').trim()) {
            failedBlocks += 1;
        }
    };

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const blocks = pending.split(/\r?\n\r?\n/);
        pending = blocks.pop();
        blocks.forEach(consume);
    }

    pending += decoder.decode();
    if (pending.trim()) consume(pending);

    if (failedBlocks) {
        console.warn('[VideoCall] Some stream blocks could not be parsed:', {
            provider,
            parsedBlocks,
            failedBlocks
        });
    }
    return text;
}

async function getCallReply(chat, callType, callContext, onStreamUpdate, options = {}) {
    const callFeature = typeof VideoCallModule !== 'undefined' && VideoCallModule.state.realCameraActive && VideoCallModule.state.lastCapturedFrame ? 'callVision' : 'call';
    let apiConfig = typeof getApiConfigForFeature === 'function' ? getApiConfigForFeature(callFeature, db.apiSettings, chat) : db.apiSettings;
    let {url, key, model, provider, streamEnabled} = apiConfig;
    if (streamEnabled === undefined) streamEnabled = !!db.apiSettings?.streamEnabled;
    
    // 【用户设置】移除强制关闭流式，允许后台流式生成
    // streamEnabled = false; 

    if (typeof isApiConfigReady === 'function' ? !isApiConfigReady(apiConfig) : (!url || !key || !model)) {
        showToast(apiConfig._bindingError || '请先在“api”应用中完成设置！');
        return;
    }
    if (url.endsWith('/')) url = url.slice(0, -1);

    if (chat.memoryMode === 'vector' && typeof prepareVectorMemoryContext === 'function') {
        try {
            const callQuery = (callContext || []).slice(-6)
                .map(message => `${message.role === 'user' ? (chat.myName || '用户') : (chat.realName || '角色')}: ${message.content || ''}`)
                .join('\n');
            await prepareVectorMemoryContext(chat, { queryText: callQuery || undefined });
        } catch (error) {
            console.warn('[VectorMemory] call context fallback:', error);
        }
    }

    // 1. 构建 System Prompt
    const now = new Date();
    let currentTime = `${now.getFullYear()}年${pad(now.getMonth() + 1)}月${pad(now.getDate())}日 ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    if (chat.enableDynamicTimezone && chat.charTimezone) {
        const tzTime = getLocalTimeInTimezone(chat.charTimezone);
        if (tzTime) currentTime = tzTime;
    }
    
    // 获取世界书（包含全局）
    const { before: worldBooksBefore, middle: worldBooksMiddle, after: worldBooksAfter } = getActiveWorldBooksContents(chat);

    let systemPrompt = `你正在一个名为“404”的线上聊天软件中扮演一个角色，正在与${chat.myName}进行${callType === 'video' ? '视频' : '语音'}通话。请严格遵守以下规则：\n`;
    systemPrompt += `核心规则：\n`;
    systemPrompt += `A. 当前时间：现在是 ${currentTime}。你应知晓当前时间，但除非对话内容明确相关，否则不要主动提及或评论时间（例如，不要催促我睡觉）。\n`;
    if (!db.apiSettings || db.apiSettings.onlineRoleEnabled !== false) {
        systemPrompt += `B. 纯线上互动：这是一个完全虚拟的线上聊天。你扮演的角色和我之间没有任何线下关系。严禁提出任何关于线下见面、现实世界互动或转为其他非本平台联系方式的建议。你必须始终保持在线角色的身份。\n\n`;
    } else {
        systemPrompt += `\n`;
    }

    
    systemPrompt += `角色和对话规则：\n`;
    if (worldBooksBefore) {
        systemPrompt += `${worldBooksBefore}\n`;
    }
    if (worldBooksMiddle) {
        systemPrompt += `${worldBooksMiddle}\n`;
    }
    systemPrompt += `<char_settings>\n`;
    const statusPrompt = chat.onlineStatusPromptEnabled === false ? '' : `你的当前状态是：${chat.status}。`;
    systemPrompt += `1. 你的角色名是：${chat.realName}。我的称呼是：${chat.myName}。${statusPrompt}\n`;
    systemPrompt += `2. 你的角色设定是：${getEffectivePersona(chat)}\n`;
    if ((chat.source === 'forum' || chat.source === 'peek') && (chat.supplementPersonaEnabled || chat.supplementPersonaAiEnabled)) {
        systemPrompt += `3. 在对话中可根据与用户的互动逐步丰富、补充你的人设（用户可在设置中查看并编辑「已补齐的人设」）。\n`;
    }
    if (worldBooksAfter) {
        systemPrompt += `${worldBooksAfter}\n`;
    }
    systemPrompt += `</char_settings>\n\n`;
    systemPrompt += `<user_settings>\n`
    if (chat.myPersona) {
        systemPrompt += `3. 关于我的人设：${chat.myPersona}\n`;
    }
    systemPrompt += `</user_settings>\n`
    
    if (window.WeatherService) {
        const charWeather = await window.WeatherService.getCharacterWeatherPrompt(chat);
        const userWeather = await window.WeatherService.getUserWeatherPrompt(chat);
        if (charWeather || userWeather) {
            systemPrompt += `\n<environment>\n${charWeather ? charWeather + '\n' : ''}${userWeather ? userWeather + '\n' : ''}</environment>\n`;
        }
    }

    // 检查是否启用“角色活人运转” (默认关闭)
    if (db.cotSettings && db.cotSettings.humanRunEnabled) {
        systemPrompt += HUMAN_RUN_PROMPT + '\n';
    }

    systemPrompt += `<memoir>\n`
    const tableMemoryText = chat.memoryMode === 'table' && typeof getMemoryTableContextBlock === 'function'
        ? getMemoryTableContextBlock(chat)
        : (chat.memoryMode === 'vector' && typeof getVectorMemoryContextBlock === 'function'
            ? getVectorMemoryContextBlock(chat)
            : '');
    if (tableMemoryText) {
        systemPrompt += `${tableMemoryText}\n`;
    } else {
        const favoritedJournals = (chat.memoryJournals || [])
            .filter(j => j.isFavorited)
            .map(j => `标题：${j.title}\n内容：${j.content}`)
            .join('\n\n---\n\n');

        if (favoritedJournals) {
            systemPrompt += `【共同回忆】\n这是你需要长期记住的、我们之间发生过的往事背景：\n${favoritedJournals}\n\n`;
        }
    }
    systemPrompt += `</memoir>\n\n`

    // --- 注入最近聊天记录 ---
    const maxMemory = chat.maxMemory || 20;
    let recentHistory = chat.history.slice(-maxMemory);
    
    // 使用通用过滤函数
    if (typeof filterHistoryForAI === 'function') {
        recentHistory = filterHistoryForAI(chat, recentHistory);
    }
    // 再次过滤掉不应进入上下文的消息
    recentHistory = recentHistory.filter(m => !m.isContextDisabled);

    if (recentHistory.length > 0) {
        const historyText = recentHistory.map(m => {
            // 简单清理内容中的特殊标签，避免干扰
            let content = m.content;
            // 如果是多模态消息(parts)，提取文本
            if (m.parts && m.parts.length > 0) {
                content = m.parts.map(p => p.text || '[图片]').join('');
            }
            return content;
        }).join('\n');

        systemPrompt += `<recent_chat_context>\n`;
        systemPrompt += `这是通话前的文字聊天记录（仅供参考背景，请勿重复回复，基于此背景进行自然的实时通话）：\n`;
        systemPrompt += `${historyText}\n`;
        systemPrompt += `</recent_chat_context>\n\n`;
    }

    systemPrompt += `【重要规则】\n`;
    systemPrompt += `1. 这是实时通话，请保持口语化，模拟真人的说话习惯，语气自然。\n`;  
    systemPrompt += `${callType === 'video' ? '你需要同时描述画面/环境音和你的语音内容。' : '你需要描述环境音和你的语音内容。'}\n`;
    systemPrompt += `2. 描述画面/环境音时，请使用描述性语言，第三人称视角，客观平然。`;

    if (chat.bilingualModeEnabled) {
        systemPrompt += `\n3. 【双语模式】\n`;
        systemPrompt += `当你的角色的母语为中文以外的语言时（优先使用${chat.bilingualLanguage || '符合人设的外语'}），你的**声音消息**回复**必须**严格遵循双语模式下的普通消息格式：[${chat.realName}的声音：{外语原文}「中文翻译」],例如: [${chat.realName}的声音：Of course, I'd love to.「当然，我很乐意。」],中文翻译文本视为系统自翻译，不视为角色的原话;当你的角色想要说中文时，需要根据你的角色设定自行判断对于中文的熟悉程度来造句，并使用普通声音消息的标准格式: [${chat.realName}的声音：{中文消息内容}] 。这条规则的优先级非常高，请务必遵守。格式为：[${chat.realName}的声音：{外语原文}「中文翻译」]。\n`;
        systemPrompt += `例如：[${chat.realName}的声音：Hello, how are you?「你好，最近怎么样？」]\n`;
        systemPrompt += `仅有声音消息需要翻译，画面/环境音消息还是以中文输出。`;
    }

    // === 真实摄像头模式提示词注入 ===
    const realCameraActive = typeof VideoCallModule !== 'undefined' && VideoCallModule.state.realCameraActive;
    if (realCameraActive) {
        systemPrompt += `\n【真实摄像头模式】\n`;
        systemPrompt += `${chat.myName}已开启真实摄像头，你可以通过附带的图片看到${chat.myName}的真实画面。请根据你看到的画面内容自然地融入对话中（比如评论对方的穿着、表情、动作、环境等），但不要每次都刻意提及，保持自然。如果图片模糊或看不清，也不必强行描述。\n`;
    }

    // === 视频通话生图模式 ===
    const _vcNaiEnabled = chat.vcNovelAiEnabled && db.novelAiSettings && db.novelAiSettings.enabled && (db.novelAiSettings.token || db.novelAiSettings.authMode === 'none') && callType === 'video';
    const _vcGptDrawEnabled = chat.vcGptDrawEnabled && db.gptImageSettings && db.gptImageSettings.enabled && db.gptImageSettings.url && db.gptImageSettings.key && callType === 'video';
    const _vcGoogleEnabled = chat.vcGoogleImageEnabled && db.googleImageSettings?.enabled && db.googleImageSettings?.key && callType === 'video';
    const _vcStabilityEnabled = chat.vcStabilityImageEnabled && db.stabilityImageSettings?.enabled && db.stabilityImageSettings?.key && callType === 'video';
    const _vcImageEnabled = _vcNaiEnabled || _vcGptDrawEnabled || _vcGoogleEnabled || _vcStabilityEnabled;
    if (_vcImageEnabled) {
        systemPrompt += `\n【视频通话生图模式】\n`;
        systemPrompt += `你正在视频通话中，每次回复时你必须额外输出一条 [${chat.realName}的画面生图：{{english, danbooru, tags}}] 来描述当前视频画面中你的样子。\n`;
        systemPrompt += `tag 规则：根据角色性别用 1boy 或 1girl，必须包含角色外貌特征（发色、瞳色、发型等）、当前服装、表情、动作/姿势、背景/场景。不要加质量词。不超过 25 个 tag。用英文逗号分隔。\n`;
        systemPrompt += `示例：[${chat.realName}的画面生图：{{1girl, long black hair, blue eyes, white t-shirt, smiling, waving hand, bedroom, sitting on bed, webcam view, looking at viewer}}]\n`;
        systemPrompt += `每次回复都必须包含恰好一条画面生图指令，放在回复最前面。\n\n`;
    }

    systemPrompt += `【输出格式】\n`;
    systemPrompt += `请严格按照以下格式输出（可以发送多条）：\n`;
    if (_vcImageEnabled) {
        systemPrompt += `[${chat.realName}的画面生图：{{english, danbooru, tags}}]（每次必须恰好输出一条）\n`;
    }
    systemPrompt += `${callType === 'video' ? `[${chat.realName}的画面/环境音：描述画面动作或环境声音]\n[${chat.realName}的声音：${chat.realName}说话的内容]` : `[${chat.realName}的环境音：描述环境声音]\n[${chat.realName}的声音：${chat.realName}说话的内容]`}\n`;

    // 2. 构建消息历史
    // 将 callContext 转换为 API 格式
    const messages = [{role: 'system', content: systemPrompt}];
    
    // 获取真实摄像头截图（如果有）
    const capturedFrame = (typeof VideoCallModule !== 'undefined' && VideoCallModule.state.lastCapturedFrame) ? VideoCallModule.state.lastCapturedFrame : null;

    callContext.forEach((msg, idx) => {
        const role = msg.role === 'ai' ? 'assistant' : 'user';
        let content = msg.content;
        
        // 去掉可能存在的首尾括号，避免双重括号
        let cleanContent = msg.content.replace(/^\[\s*|\s*\]$/g, '');

        if (msg.role === 'user') {
            if (msg.type === 'visual') {
                content = `[${chat.myName}的画面/环境音：${cleanContent}]`;
            } else if (msg.type === 'voice') {
                content = `[${chat.myName}的声音：${cleanContent}]`;
            }
        } else if (msg.role === 'ai') {
            if (msg.type === 'visual') {
                content = `[${chat.realName}的画面/环境音：${cleanContent}]`;
            } else {
                content = `[${chat.realName}的声音：${cleanContent}]`;
            }
        }

        // 在最后一条用户消息上附加摄像头截图
        const isLastUserMsg = msg.role === 'user' && idx === callContext.length - 1;
        if (isLastUserMsg && capturedFrame && realCameraActive) {
            messages.push({
                role,
                content: [
                    { type: 'text', text: content },
                    { type: 'image_url', image_url: { url: capturedFrame } }
                ]
            });
        } else {
            messages.push({role, content});
        }
    });

    // === 插入 CoT 序列 (如果开启) ===
    let useCharCot = false;
    if (chat.cotSettings && chat.cotSettings.enabled) {
        useCharCot = true;
    }
    const cotEnabled = useCharCot ? chat.cotSettings.callEnabled : (db.cotSettings && db.cotSettings.callEnabled);
    
    const activePresetId = useCharCot ? (chat.cotSettings.activeCallPresetId || 'default_call') : ((db.cotSettings && db.cotSettings.activeCallPresetId) || 'default_call');
    const hasExplicitCotPolicy = !!db.cotSettings?.modePolicies?.call?.runMode;
    if (cotEnabled && !hasExplicitCotPolicy) {
        let cotInstruction = '';
        const preset = (db.cotPresets || []).find(p => p.id === activePresetId);
        
        if (preset && preset.items) {
            cotInstruction = preset.items
                .filter(item => item.enabled)
                .map(item => item.content)
                .join('\n\n');
        }

        if (cotInstruction) {
            // 1. 插入后置指令
            messages.push({
                role: 'system',
                content: cotInstruction
            });

            // 2. 插入触发器
            messages.push({
                role: 'user',
                content: '[incipere]'
            });

            // 3. 插入 Prefill (预填/强塞)
            const quickReply = db.apiSettings && db.apiSettings.quickReplyEnabled;
            messages.push({
                role: 'assistant',
                content: quickReply
                    ? '<thinking>\n跳过cot，专注回复\n</thinking>\n[finire]'
                    : '<thinking>'
            });
        }
    }
    // ===============================

    // 3. 发起请求
    let configuredMessages = messages;
    let activeCotRuntime = null;
    if (typeof applyConfiguredCotPolicy === 'function') {
        activeCotRuntime = await applyConfiguredCotPolicy(messages, { mode: 'call', scope: 'call', provider, model, nodeId: apiConfig._nodeId || '', presetId: activePresetId, cotEnabled, quickReply: !!db.apiSettings?.quickReplyEnabled });
        configuredMessages = activeCotRuntime.messages;
        chat._cotDisplayMode = activeCotRuntime.displayMode || '';
        chat._cotTagStart = activeCotRuntime.tagMode === 'on' ? activeCotRuntime.tagStart : '';
        chat._cotTagEnd = activeCotRuntime.tagMode === 'on' ? activeCotRuntime.tagEnd : '';
    }
    const outgoingMessages = normalizeMessagesForProvider(configuredMessages, provider);
    let requestBody = {
        model: model,
        messages: outgoingMessages,
        stream: streamEnabled,
        temperature: 0.7 // 通话稍微低一点，保持稳定
    };
    if (activeCotRuntime?.nativeThinking) requestBody.__ovoThinking = activeCotRuntime.nativeThinking;

    const geminiMethod = streamEnabled ? 'streamGenerateContent' : 'generateContent';
    let endpoint = (provider === 'gemini') ? `${url}/v1beta/models/${model}:${geminiMethod}?key=${getRandomValue(key)}` : `${url}/v1/chat/completions`;
    let headers = (provider === 'gemini') ? {'Content-Type': 'application/json'} : {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
    };
    const unpreparedRequestBody = JSON.parse(JSON.stringify(requestBody));
    const fallbackBody = provider === 'gemini' ? {
        contents: configuredMessages.filter(message => message.role !== 'system').map(message => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: Array.isArray(message.content) ? message.content.map(part => part.type === 'text' ? { text: part.text } : part).filter(Boolean) : [{ text: message.content }]
        })),
        system_instruction: { parts: [{ text: configuredMessages.filter(message => message.role === 'system').map(message => message.content).join('\n\n') }] },
        generationConfig: { temperature: requestBody.temperature }
    } : requestBody;
    const preparedRequest = typeof prepareAiProviderRequest === 'function'
        ? prepareAiProviderRequest(apiConfig, requestBody, headers, endpoint, streamEnabled)
        : { body: fallbackBody, headers, endpoint, provider };
    requestBody = preparedRequest.body; headers = preparedRequest.headers; endpoint = preparedRequest.endpoint; provider = preparedRequest.provider;

    console.log('[VideoCall] Request:', {
        provider,
        model,
        stream: !!streamEnabled,
        callType,
        messageCount: messages.length,
        hasCameraFrame: !!capturedFrame
    });

    try {
        const sendPrepared = (targetEndpoint, targetHeaders, targetBody) => fetch(targetEndpoint, {
            method: 'POST',
            headers: targetHeaders,
            body: JSON.stringify(targetBody),
            signal: options.signal
        });
        let response;
        const triedRoleFallbacks = new Set();
        try { response = await sendPrepared(endpoint, headers, requestBody); }
        catch (error) {
            if (!apiConfig._roleBinding || options.signal?.aborted) throw error;
            let lastError = error;
            for (const fallbackConfig of getApiFallbackConfigsForFeature(callFeature, apiConfig._nodeId || '', apiConfig)) {
                triedRoleFallbacks.add(fallbackConfig._nodeId || 'system');
                try {
                    const fallbackStream = fallbackConfig.streamEnabled ?? streamEnabled;
                    const next = prepareAiProviderRequest(fallbackConfig, unpreparedRequestBody, getApiConfigHeaders(fallbackConfig), getApiConfigEndpoint(fallbackConfig, fallbackStream), fallbackStream);
                    response = await sendPrepared(next.endpoint, next.headers, next.body);
                    if (response.ok) { streamEnabled = fallbackStream; provider = next.provider; apiConfig = { ...fallbackConfig, _roleBinding: { ...fallbackConfig._roleBinding, usedFallback: true } }; break; }
                } catch (nextError) { lastError = nextError; if (options.signal?.aborted) throw nextError; }
            }
            if (!response) throw lastError;
        }

        if (!response.ok) {
            let failureMode = activeCotRuntime?.prefillFailure;
            if (response.status === 400 && failureMode === 'ask') failureMode = await resolveCotPerRequestChoice('预填不兼容处理', ['retry_without', 'retry_simulated', 'error']);
            if (response.status === 400 && (failureMode === 'retry_without' || failureMode === 'retry_simulated')) {
                const retryBody = JSON.parse(JSON.stringify(unpreparedRequestBody));
                const retryLast = retryBody.messages && retryBody.messages[retryBody.messages.length - 1];
                if (retryLast?.role === 'assistant') retryBody.messages.pop();
                if (failureMode === 'retry_simulated') retryBody.messages.push({ role: 'user', content: activeCotRuntime.simulatedPrefillContent });
                const retryPrepared = prepareAiProviderRequest(apiConfig, retryBody, getApiConfigHeaders(apiConfig), getApiConfigEndpoint(apiConfig, streamEnabled), streamEnabled);
                response = await sendPrepared(retryPrepared.endpoint, retryPrepared.headers, retryPrepared.body);
                provider = retryPrepared.provider;
            }
            if (!response.ok) {
                const fallbacks = typeof getApiFallbackConfigsForFeature === 'function' ? getApiFallbackConfigsForFeature(callFeature, apiConfig._nodeId || '', apiConfig) : [];
                for (const fallbackConfig of fallbacks) {
                    if (triedRoleFallbacks.has(fallbackConfig._nodeId || 'system')) continue;
                    try {
                        const fallbackStream = apiConfig._roleBinding ? fallbackConfig.streamEnabled ?? streamEnabled : streamEnabled;
                        const fallbackPrepared = prepareAiProviderRequest(fallbackConfig, unpreparedRequestBody, getApiConfigHeaders(fallbackConfig), getApiConfigEndpoint(fallbackConfig, fallbackStream), fallbackStream);
                        response = await sendPrepared(fallbackPrepared.endpoint, fallbackPrepared.headers, fallbackPrepared.body);
                        if (response.ok) { streamEnabled = fallbackStream; provider = fallbackPrepared.provider; apiConfig = { ...fallbackConfig, _roleBinding: fallbackConfig._roleBinding ? { ...fallbackConfig._roleBinding, usedFallback: true } : undefined }; break; }
                    } catch (nextError) { if (!apiConfig._roleBinding || options.signal?.aborted) throw nextError; }
                }
            }
            if (!response.ok) throw new Error(`API Error: ${response.status} ${await response.text()}`);
        }

        if (!streamEnabled) {
            const data = await response.json();
            const extracted = typeof extractAiProviderResponse === 'function' ? extractAiProviderResponse(data, provider) : { content: '', reasoning: '' };
            let text = extracted.content || extractCallResponseText(data, provider, false);
            if (extracted.reasoning) text = `<thinking>${extracted.reasoning}</thinking>\n${text}`;
            if (chat._cotTagStart && chat._cotTagEnd && chat._cotTagStart !== '<thinking>') text = text.split(chat._cotTagStart).join('<thinking>').split(chat._cotTagEnd).join('</thinking>');
            if (!text && provider !== 'gemini' && (!data.choices || !data.choices.length)) {
                console.error("Invalid API Response Structure:", {
                    provider,
                    topLevelKeys: data && typeof data === 'object' ? Object.keys(data) : []
                });
                throw new Error("API返回数据格式异常，缺少可识别的回复字段");
            }

            // === CoT 处理：补全开头，提取思考，净化输出 ===
            let useCharCot = false;
            if (chat.cotSettings && chat.cotSettings.enabled) {
                useCharCot = true;
            }
            const currentCotEnabled = useCharCot ? chat.cotSettings.callEnabled : (db.cotSettings && db.cotSettings.callEnabled);
            
            if (currentCotEnabled && text) {
                // 1. 补全开头 (如果被 Prefill 吃掉)
                if (!text.trim().startsWith('<thinking>') && text.includes('</thinking>')) {
                    text = '<thinking>' + text;
                }
                
                // 2. 提取并移除思考内容
                const thinkingMatch = text.match(/<thinking>([\s\S]*?)<\/thinking>/);
                if (thinkingMatch) {
                    console.log('[VideoCall CoT] Thinking removed:', { length: thinkingMatch[1].length });
                    // 移除思考标签及内容
                    text = text.replace(/<thinking>[\s\S]*?<\/thinking>/, "").trim();
                }
                
                // 3. 移除 [incipere] (如果有残留)
                text = text.replace(/\[incipere\]/g, "");
            }
            // =============================================

            console.log('[VideoCall] Response parsed:', { provider, textLength: text.length, streamed: false });
            // 一次性回调
            onStreamUpdate(text);
            return text;
        } else {
            console.log('[VideoCall] Stream started (Background Mode)...');
            let buffer = await readCallStreamResponse(response, provider);
            if (chat._cotTagStart && chat._cotTagEnd && chat._cotTagStart !== '<thinking>') buffer = buffer.split(chat._cotTagStart).join('<thinking>').split(chat._cotTagEnd).join('</thinking>');

            console.log('[VideoCall] Stream collected:', { provider, textLength: buffer.length });

            // === CoT 处理：补全开头，提取思考，净化输出 ===
            let useCharCotStream = false;
            if (chat.cotSettings && chat.cotSettings.enabled) {
                useCharCotStream = true;
            }
            const currentCotEnabledStream = useCharCotStream ? chat.cotSettings.callEnabled : (db.cotSettings && db.cotSettings.callEnabled);

            if (currentCotEnabledStream && buffer) {
                // 1. 补全开头 (如果被 Prefill 吃掉)
                if (!buffer.trim().startsWith('<thinking>') && buffer.includes('</thinking>')) {
                    buffer = '<thinking>' + buffer;
                }
                
                // 2. 提取并移除思考内容
                const thinkingMatch = buffer.match(/<thinking>([\s\S]*?)<\/thinking>/);
                if (thinkingMatch) {
                    console.log('[VideoCall CoT] Thinking removed:', { length: thinkingMatch[1].length });
                    // 移除思考标签及内容
                    buffer = buffer.replace(/<thinking>[\s\S]*?<\/thinking>/, "").trim();
                }
                
                // 3. 移除 [incipere] (如果有残留)
                buffer = buffer.replace(/\[incipere\]/g, "");
            }

            // 流结束后一次性回调
            onStreamUpdate(buffer);
            return buffer;
        }
    } catch (e) {
        if (e && e.name === 'AbortError') return null;
        console.error("Call API Error:", e);
        showToast("通话连接不稳定...");
        return null;
    }
}

async function generateCallSummary(chat, callContext) {
    // === 使用总结API（如果已配置）===
    let apiConfig;
    if (db.summaryApiSettings && db.summaryApiSettings.url && db.summaryApiSettings.key && db.summaryApiSettings.model) {
        apiConfig = db.summaryApiSettings;
    } else {
        apiConfig = db.apiSettings;
    }
    apiConfig = typeof getApiConfigForFeature === 'function' ? getApiConfigForFeature('summary', apiConfig, chat) : apiConfig;
    
    let {url, key, model, provider} = apiConfig;
    if (typeof isApiConfigReady === 'function' ? !isApiConfigReady(apiConfig) : (!url || !key || !model)) return null;
    if (url.endsWith('/')) url = url.slice(0, -1);

    // 获取世界书（包含全局）
    const { before: worldBooksBefore, middle: worldBooksMiddle, after: worldBooksAfter } = getActiveWorldBooksContents(chat);

    // 获取回忆日记
    const favoritedJournals = (chat.memoryJournals || [])
        .filter(j => j.isFavorited)
        .map(j => `标题：${j.title}\n内容：${j.content}`)
        .join('\n\n---\n\n');

    let prompt = `请根据以下背景信息和通话记录，生成一段简短的聊天记录总结。\n\n`;

    prompt += `<char_settings>\n`;
    prompt += `角色名：${chat.realName}\n`;
    prompt += `角色设定：${getEffectivePersona(chat) || "无"}\n`;
    if (worldBooksBefore) prompt += `${worldBooksBefore}\n`;
    if (worldBooksMiddle) prompt += `${worldBooksMiddle}\n`;
    if (worldBooksAfter) prompt += `${worldBooksAfter}\n`;
    prompt += `</char_settings>\n\n`;

    prompt += `<user_settings>\n`;
    prompt += `用户称呼：${chat.myName}\n`;
    prompt += `用户人设：${chat.myPersona || "无"}\n`;
    prompt += `</user_settings>\n\n`;

    if (favoritedJournals) {
        prompt += `<memoir>\n`;
        prompt += `【共同回忆】\n${favoritedJournals}\n`;
        prompt += `</memoir>\n\n`;
    }

    prompt += `通话记录：\n`;
    prompt += `${callContext.map(m => `${m.role === 'ai' ? chat.realName : chat.myName} (${m.type}): ${m.content}`).join('\n')}\n\n`;

    prompt += `要求：\n`;
    prompt += `1. 第三人称叙述。\n`;
    prompt += `2. **客观平实**：使用第三人称视角，客观陈述事实。**绝对禁止使用强烈的情绪词汇**（如“极度愤怒”、“痛彻心扉”、“欣喜若狂”等），保持冷静、克制的叙述风格。\n`;
    prompt += `3. **无升华**：不要进行价值升华、感悟或总结性评价，仅记录发生了什么。\n`;
    prompt += `4. 不要包含“通话记录如下”等废话，直接输出总结内容。\n`;

    const messages = [{role: 'user', content: prompt}];
    
    const requestBody = {
        model: model,
        messages: messages,
        stream: false
    };
    const endpoint = (provider === 'gemini') ? `${url}/v1beta/models/${model}:generateContent?key=${getRandomValue(key)}` : `${url}/v1/chat/completions`;
    const headers = (provider === 'gemini') ? {'Content-Type': 'application/json'} : {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
    };

    try {
        return (await fetchAiResponse(apiConfig, requestBody, headers, endpoint, false)).trim();
    } catch (e) {
        console.error("Summary API Error:", e);
        return null;
    }
}
