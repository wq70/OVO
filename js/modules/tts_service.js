// js/modules/tts_service.js
// 多提供商 TTS 语音合成服务（保留 MinimaxTTSService 全局别名兼容旧调用）
// language_boost 取值见官方文档: https://platform.minimaxi.com/docs/api-reference/speech-t2a-http

const LANGUAGE_BOOST_MAP = {
    zh: 'Chinese',
    yue: 'Chinese,Yue',
    en: 'English',
    ja: 'Japanese',
    ko: 'Korean',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    ru: 'Russian',
    pt: 'Portuguese',
    it: 'Italian',
    ar: 'Arabic',
    th: 'Thai',
    vi: 'Vietnamese',
    id: 'Indonesian',
    tr: 'Turkish',
    nl: 'Dutch',
    uk: 'Ukrainian',
    pl: 'Polish'
};

const TTSService = {
    // 角色 TTS 配置（从 localStorage 加载）
    config: {
        enabled: false,
        provider: 'minimax',
        // Minimax
        groupId: '',
        apiKey: '',
        domain: 'api.minimax.cn',
        model: 'speech-2.8-hd',
        volcAppId: '',
        volcAccessToken: '',
        volcResourceId: 'seed-tts-2.0',
        volcVoiceType: '',
        volcUrl: 'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
        volcFormat: 'mp3',
        elevenApiKey: '',
        elevenModel: 'eleven_multilingual_v2',
        elevenVoiceId: '',
        elevenUrl: 'https://api.elevenlabs.io'
    },

    // 用户 TTS 配置（独立存储）
    userConfig: {
        enabled: false,
        provider: 'minimax',
        // Minimax
        groupId: '',
        apiKey: '',
        domain: 'api.minimax.cn',
        model: 'speech-2.8-hd',
        volcAppId: '',
        volcAccessToken: '',
        volcResourceId: 'seed-tts-2.0',
        volcVoiceType: '',
        volcUrl: 'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
        volcFormat: 'mp3',
        elevenApiKey: '',
        elevenModel: 'eleven_multilingual_v2',
        elevenVoiceId: '',
        elevenUrl: 'https://api.elevenlabs.io'
    },

    // 音频缓存 (文本+音色ID作为key，用户缓存加 user_ 前缀)
    audioCache: new Map(),
    pendingSynthesis: new Map(),
    requestControllers: new Set(),
    playbackGeneration: 0,
    queueGeneration: 0,
    configGeneration: 0,
    finishPlayback: null,
    
    // 当前播放的音频对象
    currentAudio: null,
    // 当前播放对应的消息标识（用于聊天语音条暂停/恢复，由调用方传入 playKey）
    currentPlayKey: null,
    // 是否处于暂停状态（仅在有 currentAudio 时有效）
    isPaused: false,

    // 播放队列
    playQueue: [],
    isPlaying: false,

    // 音频上下文激活状态
    audioContextActivated: false,
    hasShownAutoplayTip: false,

    // 派发 TTS 状态变化，供聊天页更新语音条 UI
    _dispatchState: function() {
        try {
            document.dispatchEvent(new CustomEvent('ttsStateChange', {
                detail: {
                    currentPlayKey: this.currentPlayKey,
                    isPlaying: !!this.currentAudio,
                    isPaused: this.isPaused
                }
            }));
        } catch (e) {}
    },

    /**
     * 激活音频上下文 - 必须在用户交互时调用
     * 绕过浏览器的自动播放限制，确保后续TTS能自动播放
     */
    activateAudioContext: async function() {
        if (this.audioContextActivated) return true;
        
        try {
            // 播放一个极短的静音音频来激活音频播放权限
            const silentAudio = new Audio();
            // 使用一个极短的空白MP3（大约0.1秒）
            silentAudio.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAADhAC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////AAAA8UxhdmM1OC4xMzQAAAAAAAAAAAAAAAAkAAAAAAAAAAOEaGMGmgAAAAAAAAAAAAAAAAAAAAD/+xDEAAPAAAGkAAAAIAAANIAAAARMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ==';
            silentAudio.volume = 0.01;
            await silentAudio.play();
            this.audioContextActivated = true;
            console.log('[TTS] 音频上下文已激活');
            return true;
        } catch (err) {
            console.warn('[TTS] 音频上下文激活失败（浏览器可能阻止自动播放）:', err);
            return false;
        }
    },

    // 初始化 - 从 localStorage 加载配置
    init: function() {
        this.loadConfig();
        this.loadUserConfig();
        console.log('[TTS] 服务已初始化', { provider: this.config.provider, enabled: this.config.enabled });
    },

    // 加载角色 TTS 配置
    loadConfig: function() {
        try {
            const saved = localStorage.getItem('minimax_tts_config');
            if (saved) {
                const parsed = JSON.parse(saved);
                this.config = { ...this.config, ...parsed };
            }
        } catch (err) {
            console.error('[TTS] 加载配置失败:', err);
        }
    },

    // 加载用户 TTS 配置
    loadUserConfig: function() {
        try {
            const saved = localStorage.getItem('minimax_user_tts_config');
            if (saved) {
                const parsed = JSON.parse(saved);
                this.userConfig = { ...this.userConfig, ...parsed };
            }
        } catch (err) {
            console.error('[TTS] 加载用户配置失败:', err);
        }
    },

    // 保存角色 TTS 配置
    saveConfig: function(newConfig) {
        try {
            const next = { ...this.config, ...newConfig };
            localStorage.setItem('minimax_tts_config', JSON.stringify(next));
            if (JSON.stringify(this.config) !== JSON.stringify(next)) this.configGeneration++;
            this.config = next;
            console.log('[TTS] 配置已保存', { provider: this.config.provider, enabled: this.config.enabled });
            return true;
        } catch (err) {
            console.error('[TTS] 保存配置失败:', err);
            return false;
        }
    },

    // 保存用户 TTS 配置
    saveUserConfig: function(newConfig) {
        try {
            const next = { ...this.userConfig, ...newConfig };
            localStorage.setItem('minimax_user_tts_config', JSON.stringify(next));
            if (JSON.stringify(this.userConfig) !== JSON.stringify(next)) this.configGeneration++;
            this.userConfig = next;
            console.log('[TTS] 用户配置已保存', { provider: this.userConfig.provider, enabled: this.userConfig.enabled });
            return true;
        } catch (err) {
            console.error('[TTS] 保存用户配置失败:', err);
            return false;
        }
    },

    // 检查角色 TTS 配置是否完整
    isConfigured: function() {
        return this.isConfigComplete(this.config);
    },

    // 检查用户 TTS 配置是否完整（仅当启用时要求配置）
    isUserConfigured: function() {
        return this.isConfigComplete(this.userConfig);
    },

    isConfigComplete: function(cfg) {
        if (!cfg?.enabled) return false;
        const provider = cfg.provider || 'minimax';
        if (provider === 'volcengine') return !!(cfg.volcAppId && cfg.volcAccessToken && cfg.volcResourceId && cfg.volcVoiceType && cfg.volcUrl);
        if (provider === 'elevenlabs') return !!(cfg.elevenApiKey && cfg.elevenModel);
        if (provider === 'minimax') return !!cfg.apiKey;
        return false;
    },

    resolveVoiceId: function(voiceId, cfg) {
        if (cfg.provider !== 'elevenlabs') return voiceId;
        const isMinimaxVoice = globalThis.VoiceSelector?.voices?.some(item => item.id === voiceId);
        return (voiceId && !isMinimaxVoice ? voiceId : cfg.elevenVoiceId) || '';
    },

    // 合成语音。options.forUser === true 时使用用户 TTS 配置
    synthesize: async function(text, voiceId, language = 'auto', options = {}) {
        const forUser = !!options.forUser;
        const cfg = options.config || (forUser ? this.userConfig : this.config);

        if (options.config) {
            if (!this.isConfigComplete(cfg)) throw new Error('TTS 配置不完整');
        } else if (forUser) {
            if (!this.isUserConfigured()) {
                throw new Error('用户 TTS 未配置或未启用');
            }
        } else {
            if (!this.isConfigured()) {
                throw new Error('TTS 未配置或未启用');
            }
        }

        // 清理文本
        const cleanText = this.cleanText(text, cfg);
        if (!cleanText) {
            throw new Error('文本为空');
        }

        const provider = cfg.provider || 'minimax';
        const speed = provider === 'elevenlabs'
            ? Math.min(1.2, Math.max(0.7, Number(options.speed) || 1))
            : Math.min(2, Math.max(0.5, Number(options.speed) || 1));
        voiceId = this.resolveVoiceId(voiceId, cfg);
        if (provider === 'elevenlabs' && !voiceId) throw new Error('请先选择 ElevenLabs 音色或填写 Voice ID');

        // 检查缓存（提供商也作为 key 的一部分）
        const cacheKey = JSON.stringify([forUser, this.configGeneration, provider, cleanText, voiceId, language, speed,
            cfg.model, cfg.domain, cfg.groupId, cfg.volcUrl, cfg.volcResourceId, cfg.volcVoiceType, cfg.volcFormat,
            cfg.elevenModel, cfg.elevenUrl]);
        if (!options.config && this.audioCache.has(cacheKey)) {
            console.log('[TTS] 使用音频缓存');
            return this.audioCache.get(cacheKey);
        }

        if (!options.config && this.pendingSynthesis.has(cacheKey)) return this.pendingSynthesis.get(cacheKey);
        const task = this._synthesizeAudio(cleanText, voiceId, language, speed, cfg, cacheKey, !!options.config);
        if (!options.config) this.pendingSynthesis.set(cacheKey, task);
        try {
            return await task;
        } finally {
            if (this.pendingSynthesis.get(cacheKey) === task) this.pendingSynthesis.delete(cacheKey);
        }
    },

    _synthesizeAudio: async function(cleanText, voiceId, language, speed, cfg, cacheKey, uncached) {
        const provider = cfg.provider || 'minimax';
        const controller = new AbortController();
        this.requestControllers.add(controller);
        let timedOut = false;
        const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 60000);
        const generation = this.configGeneration;

        try {
            let audioUrl;
            
            if (provider === 'volcengine') {
                audioUrl = await this._synthesizeVolcengine(cleanText, voiceId, language, speed, cfg, controller.signal);
            } else if (provider === 'elevenlabs') {
                audioUrl = await this._synthesizeElevenLabs(cleanText, voiceId, language, speed, cfg, controller.signal);
            } else if (provider === 'minimax') {
                // 默认使用 Minimax TTS 服务
                const url = `https://${cfg.domain || 'api.minimax.cn'}/v1/t2a_v2${cfg.groupId ? `?GroupId=${encodeURIComponent(cfg.groupId)}` : ''}`;
                const requestBody = {
                    model: cfg.model,
                    text: cleanText,
                    stream: false,
                    voice_setting: {
                        voice_id: voiceId,
                        speed: speed,
                        vol: 1,
                        pitch: 0
                    },
                    audio_setting: {
                        sample_rate: 32000,
                        bitrate: 128000,
                        format: 'mp3',
                        channel: 1
                    }
                };

                if (language && language !== 'auto') {
                    const apiValue = LANGUAGE_BOOST_MAP[language] || language;
                    requestBody.language_boost = apiValue;
                }

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${cfg.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('[TTS] API 错误:', response.status, errorText);
                    throw new Error(`API 请求失败: ${response.status}`);
                }

                const result = await response.json();
                
                if (result.base_resp && result.base_resp.status_code !== 0) {
                    console.error('[TTS] API 返回错误:', result.base_resp);
                    throw new Error(`API 错误: ${result.base_resp.status_msg || '未知错误'}`);
                }

                if (!result || !result.data || !result.data.audio) {
                    console.error('[TTS] 返回格式错误:', result);
                    throw new Error('API 返回格式错误');
                }

                const audioData = result.data.audio;
                const blob = this.hexToBlob(audioData, 'audio/mpeg');
                audioUrl = URL.createObjectURL(blob);
            } else {
                throw new Error('不支持的 TTS 提供商');
            }

            if (controller.signal.aborted) {
                URL.revokeObjectURL(audioUrl);
                throw new DOMException('语音合成已取消', 'AbortError');
            }

            // 存入缓存
            if (!uncached && generation === this.configGeneration) this.audioCache.set(cacheKey, audioUrl);
            
            // 限制缓存大小
            if (this.audioCache.size > 100) {
                const firstKey = this.audioCache.keys().next().value;
                const firstUrl = this.audioCache.get(firstKey);
                URL.revokeObjectURL(firstUrl); // 释放 Blob URL
                this.audioCache.delete(firstKey);
            }

            console.log('[TTS] 合成成功');
            return audioUrl;

        } catch (err) {
            if (timedOut) throw new Error('语音合成超时，请稍后重试');
            if (err.name !== 'AbortError') console.error('[TTS] 合成失败:', err);
            throw err;
        } finally {
            clearTimeout(timeout);
            this.requestControllers.delete(controller);
        }
    },

    _elevenBaseUrl: function(cfg) {
        const url = new URL(cfg.elevenUrl || 'https://api.elevenlabs.io');
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
            throw new Error('ElevenLabs 接口地址无效');
        }
        return url.href.replace(/\/+$/, '').replace(/\/v[12]$/, '');
    },

    _elevenError: async function(response) {
        let detail = '';
        try {
            const body = await response.json();
            detail = typeof body.detail === 'string' ? body.detail : body.detail?.message || body.message || '';
        } catch (_) {}
        const message = response.status === 401 ? 'ElevenLabs API Key 无效或已失效'
            : response.status === 403 ? 'ElevenLabs 权限不足，请检查账号、音色权限和 API Key'
            : response.status === 429 ? 'ElevenLabs 请求或额度受限，请稍后重试或检查余额'
            : response.status === 404 ? 'ElevenLabs 音色或接口不存在，请检查 Voice ID 和接口地址'
            : `ElevenLabs 请求失败 (${response.status})`;
        return new Error(`${message}${detail ? `：${detail.slice(0, 180)}` : ''}`);
    },

    _synthesizeElevenLabs: async function(text, voiceId, language, speed, cfg, signal) {
        const body = { text, model_id: cfg.elevenModel || 'eleven_multilingual_v2', voice_settings: { speed } };
        if (language && language !== 'auto' && body.model_id !== 'eleven_multilingual_v2') body.language_code = language;
        const response = await fetch(`${this._elevenBaseUrl(cfg)}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
            method: 'POST', headers: { 'xi-api-key': cfg.elevenApiKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
            body: JSON.stringify(body), signal
        });
        if (!response.ok) throw await this._elevenError(response);
        const data = await response.blob();
        if (!data.size || /json|text\//i.test(data.type)) throw new Error('ElevenLabs 未返回有效音频');
        return URL.createObjectURL(new Blob([data], { type: 'audio/mpeg' }));
    },

    listElevenLabsVoices: async function(cfg, signal) {
        if (!cfg.elevenApiKey) throw new Error('请先填写 ElevenLabs API Key');
        const voices = [];
        let next = '';
        const seen = new Set();
        const pages = new Set();
        do {
            if (pages.has(next)) break;
            pages.add(next);
            const query = new URLSearchParams({ page_size: '100' });
            if (next) query.set('next_page_token', next);
            const response = await fetch(`${this._elevenBaseUrl(cfg)}/v2/voices?${query}`, {
                headers: { 'xi-api-key': cfg.elevenApiKey }, signal
            });
            if (!response.ok) throw await this._elevenError(response);
            const data = await response.json();
            for (const voice of data.voices || []) {
                if (voice.voice_id && !seen.has(voice.voice_id)) { seen.add(voice.voice_id); voices.push(voice); }
            }
            const token = data.has_more ? data.next_page_token : '';
            if (token === next) break;
            next = token || '';
        } while (next);
        return voices;
    },

    _synthesizeVolcengine: async function(text, voiceId, language, speed, cfg, signal) {
        const requestId = (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
            ? globalThis.crypto.randomUUID()
            : `ovo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const format = cfg.volcFormat || 'mp3';
        const isMinimaxPreset = Array.isArray(globalThis.VoiceSelector?.voices)
            && globalThis.VoiceSelector.voices.some(item => item.id === voiceId);
        const selectedVoice = (voiceId && !isMinimaxPreset) ? voiceId : cfg.volcVoiceType;
        if (!selectedVoice) throw new Error('火山语音音色 ID 未配置');
        const body = {
            user: { uid: 'ovo-browser-user' },
            req_params: {
                text,
                speaker: selectedVoice,
                audio_params: {
                    format,
                    sample_rate: 24000,
                    speech_rate: Math.round((Math.min(2, Math.max(0.5, Number(speed) || 1)) - 1) * 100),
                    loudness_rate: 0
                },
                additions: JSON.stringify({ disable_markdown_filter: true, enable_language_detector: language === 'auto' })
            }
        };
        const headers = {
            'Content-Type': 'application/json',
            'X-Api-App-Key': cfg.volcAppId,
            'X-Api-Access-Key': cfg.volcAccessToken,
            'X-Api-Resource-Id': cfg.volcResourceId,
            'X-Api-Request-Id': requestId
        };
        const response = await fetch(cfg.volcUrl, { method: 'POST', headers, body: JSON.stringify(body), signal });
        if (!response.ok) {
            const detail = (await response.text()).slice(0, 240);
            const logId = response.headers.get('x-tt-logid');
            const trace = logId ? `（请求 ID：${logId}）` : '';
            if (response.status === 401 || response.status === 403) throw new Error(`火山语音鉴权失败，请检查 App ID、Access Token 和 Resource ID${trace}`);
            if (response.status === 429) throw new Error('火山语音请求过于频繁，请稍后再试');
            throw new Error(`火山语音请求失败 (${response.status})${detail ? `：${detail}` : ''}${trace}`);
        }
        const contentType = response.headers.get('content-type') || '';
        let blob;
        if (contentType.includes('json') || contentType.includes('text/') || !contentType) {
            const textResponse = await response.text();
            const chunks = [];
            let lastMessage = '';
            for (const line of textResponse.split(/\r?\n/)) {
                const payload = line.trim().replace(/^data:\s*/, '');
                if (!payload || payload === '[DONE]') continue;
                try {
                    const item = JSON.parse(payload);
                    if (item.message) lastMessage = item.message;
                    if (item.data) chunks.push(new Uint8Array(await this.base64ToBlob(item.data).arrayBuffer()));
                } catch (_) {}
            }
            if (!chunks.length) {
                try {
                    const item = JSON.parse(textResponse);
                    if (item.data) chunks.push(new Uint8Array(await this.base64ToBlob(item.data).arrayBuffer()));
                    lastMessage = item.message || lastMessage;
                } catch (_) {}
            }
            if (!chunks.length) {
                const message = lastMessage || '未返回音频数据';
                if (/grant|authenticate|access denied|resource.*mismatch/i.test(message)) throw new Error(`火山语音权限或鉴权失败：${message}`);
                if (/quota|concurrency/i.test(message)) throw new Error(`火山语音额度或并发不足：${message}`);
                if (/voice|speaker|音色/i.test(message)) throw new Error(`火山语音音色不可用：${message}`);
                throw new Error(`火山语音合成失败：${message}`);
            }
            const mime = { mp3: 'audio/mpeg', ogg_opus: 'audio/ogg', wav: 'audio/wav', pcm: 'audio/pcm' }[format] || 'audio/mpeg';
            blob = new Blob(chunks, { type: mime });
        } else {
            blob = await response.blob();
        }
        if (format === 'pcm') blob = await this.pcmToWavBlob(blob, 24000, 1, 16);
        return URL.createObjectURL(blob);
    },

    // 播放音频。playKey 为可选，用于标识当前播放（如消息 id），便于聊天页暂停/恢复
    play: async function(audioUrl, playKey) {
        return new Promise((resolve, reject) => {
            try {
                // 停止当前播放
                if (this.finishPlayback) this.finishPlayback();
                this.currentPlayKey = playKey || null;
                this.isPaused = false;

                const audio = new Audio(audioUrl);
                this.currentAudio = audio;

                let settled = false;
                const finish = (error) => {
                    if (settled) return;
                    settled = true;
                    audio.pause();
                    audio.onended = null;
                    audio.onerror = null;
                    this.finishPlayback = null;
                    this.currentAudio = null;
                    this.currentPlayKey = null;
                    this.isPaused = false;
                    this._dispatchState();
                    if (![...this.audioCache.values()].includes(audioUrl)) URL.revokeObjectURL(audioUrl);
                    if (error) reject(error); else resolve();
                };
                this.finishPlayback = finish;
                audio.onended = () => finish();
                audio.onerror = () => finish(new Error('音频播放失败'));

                this._dispatchState();
                audio.play().catch(finish);

            } catch (err) {
                this.currentPlayKey = null;
                this.isPaused = false;
                reject(err);
            }
        });
    },

    // 暂停当前播放（不清空队列，仅聊天单条用）
    pause: function() {
        if (!this.currentAudio) return;
        this.currentAudio.pause();
        this.isPaused = true;
        this._dispatchState();
    },

    // 从暂停恢复
    resume: function() {
        if (!this.currentAudio || !this.isPaused) return;
        this.currentAudio.play().catch(function() {});
        this.isPaused = false;
        this._dispatchState();
    },

    // 切换暂停/恢复，返回当前是否已暂停（true=已暂停，false=正在播）
    togglePause: function() {
        if (!this.currentAudio) return null;
        if (this.isPaused) {
            this.resume();
            return false;
        }
        this.pause();
        return true;
    },

    // 供 UI 查询：当前播放 key、是否正在播、是否暂停
    getPlayState: function() {
        return {
            currentPlayKey: this.currentPlayKey,
            isPlaying: !!this.currentAudio,
            isPaused: this.isPaused
        };
    },

    // 停止播放（清空队列，离开聊天时调用）
    stop: function() {
        this.playbackGeneration++;
        this.queueGeneration++;
        for (const controller of this.requestControllers) controller.abort();
        this.pendingSynthesis.clear();
        if (this.finishPlayback) this.finishPlayback();
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }
        this.currentPlayKey = null;
        this.isPaused = false;
        this.playQueue = [];
        this.isPlaying = false;
        this._dispatchState();
    },

    // 合成并播放。options.forUser === true 时使用用户 TTS 配置；options.playKey 为当前条标识（用于暂停/恢复）
    synthesizeAndPlay: async function(text, voiceId, language = 'auto', options = {}) {
        const generation = ++this.playbackGeneration;
        const configGeneration = this.configGeneration;
        try {
            const audioUrl = await this.synthesize(text, voiceId, language, options);
            if (generation !== this.playbackGeneration || configGeneration !== this.configGeneration) {
                if (![...this.audioCache.values()].includes(audioUrl)) URL.revokeObjectURL(audioUrl);
                return false;
            }
            await this.play(audioUrl, options.playKey);
            return generation === this.playbackGeneration;
        } catch (err) {
            if (err.name === 'AbortError') return false;
            console.error('[TTS] 播放失败:', err);
            throw err;
        }
    },

    // 排队播放下一条（内部使用）
    _processQueue: function() {
        if (this.isPlaying || this.playQueue.length === 0) return;
        const item = this.playQueue.shift();
        const generation = this.queueGeneration;
        this.isPlaying = true;
        const self = this;
        const opts = item.options || (item.forUser ? { forUser: true } : {});
        this.synthesizeAndPlay(item.text, item.voiceId, item.language, opts)
            .catch(err => {
                console.error('[TTS] 队列播放失败:', err);
            })
            .finally(() => {
                if (generation !== self.queueGeneration) return;
                self.isPlaying = false;
                self._processQueue();
            });
    },

    /**
     * 排队合成并播放：若当前正在播放则加入队列，播完当前后按顺序播放下一条。
     * 用于语音/视频通话场景。options.forUser 为 true 时使用用户 TTS。
     */
    synthesizeAndPlayQueued: function(text, voiceId, language = 'auto', options = {}) {
        const forUser = !!options.forUser;
        if (forUser ? !this.isUserConfigured() : !this.isConfigured()) return;
        const cleanText = this.cleanText(text, forUser ? this.userConfig : this.config);
        if (!cleanText) return;

        const item = { text, voiceId, language: language || 'auto', forUser, options };
        if (this.isPlaying) {
            this.playQueue.push(item);
            return;
        }
        this.isPlaying = true;
        const generation = this.queueGeneration;
        const self = this;
        this.synthesizeAndPlay(text, voiceId, language, options)
            .catch(err => {
                console.error('[TTS] 队列首条播放失败:', err);
            })
            .finally(() => {
                if (generation !== self.queueGeneration) return;
                self.isPlaying = false;
                self._processQueue();
            });
    },

    // 清理文本（移除特殊标记、旁白、双语翻译）
    cleanText: function(text, cfg = this.config) {
        if (!text) return '';
        
        // 移除方括号内容（如 [系统消息]）
        const expressiveEleven = cfg.provider === 'elevenlabs' && /^eleven_v[34](?:_|$)/.test(cfg.elevenModel || '');
        const elevenTags = /^(?:whispers?|whispering|laughs?|laughing|chuckles?|sighs?|sighing|gasps?|excited|sad|angry|curious|sarcastic|crying|shouting|nervous|calm|happy|thoughtful|cheerfully)$/i;
        let cleaned = text.replace(/\[(.*?)\]/g, (whole, tag) => expressiveEleven && elevenTags.test(tag.trim()) ? whole : '');
        
        // 移除圆括号和中文括号内容（旁白）
        const expressiveMinimax = (cfg.provider || 'minimax') === 'minimax' && /^speech-2\.8-/.test(cfg.model || '');
        const minimaxTags = /^(?:laughs|chuckle|coughs|clear-throat|groans|breath|pant|inhale|exhale|gasps|sniffs|sighs|snorts|burps|lip-smacking|humming|hissing|emm|sneezes)$/;
        cleaned = cleaned.replace(/[\(（](.*?)[\)）]/g, (whole, tag) => expressiveMinimax && minimaxTags.test(tag) ? whole : '');
        
        // 移除双语模式的「中文翻译」，只读原文
        cleaned = cleaned.replace(/「.*?」/g, '');
        
        // 移除多余空白
        cleaned = cleaned.trim();
        
        return cleaned;
    },

    // Hex 转 Blob（Minimax API 返回的是 hex 编码）
    hexToBlob: function(hex, mimeType = 'audio/mpeg') {
        try {
            // 移除可能的空格和换行
            hex = hex.replace(/\s/g, '');
            
            const byteArray = new Uint8Array(hex.length / 2);
            
            for (let i = 0; i < hex.length; i += 2) {
                byteArray[i / 2] = parseInt(hex.substr(i, 2), 16);
            }
            
            return new Blob([byteArray], { type: mimeType });
        } catch (err) {
            console.error('[TTS] Hex 转换失败:', err);
            throw new Error('音频数据转换失败');
        }
    },

    // Base64 转 Blob（备用，目前不使用）
    base64ToBlob: function(base64, mimeType = 'audio/mpeg') {
        try {
            const byteCharacters = atob(base64);
            const byteNumbers = new Array(byteCharacters.length);
            
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            
            const byteArray = new Uint8Array(byteNumbers);
            return new Blob([byteArray], { type: mimeType });
        } catch (err) {
            console.error('[TTS] Base64 转换失败:', err);
            throw new Error('音频数据转换失败');
        }
    },

    // 浏览器不能直接播放裸 PCM，补齐 WAV 文件头后再播放或下载
    pcmToWavBlob: async function(pcmBlob, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
        const pcm = new Uint8Array(await pcmBlob.arrayBuffer());
        const header = new ArrayBuffer(44);
        const view = new DataView(header);
        const write = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
        const byteRate = sampleRate * channels * bitsPerSample / 8;
        write(0, 'RIFF');
        view.setUint32(4, 36 + pcm.byteLength, true);
        write(8, 'WAVE');
        write(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, channels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, channels * bitsPerSample / 8, true);
        view.setUint16(34, bitsPerSample, true);
        write(36, 'data');
        view.setUint32(40, pcm.byteLength, true);
        return new Blob([header, pcm], { type: 'audio/wav' });
    },

    // 下载语音文件
    download: async function(text, voiceId, language, options = {}) {
        try {
            const audioUrl = await this.synthesize(text, voiceId, language, options);
            // 从 blob URL 获取 blob
            const blob = await OvoFileDownload.readMedia(audioUrl, 'audio');
            const now = new Date();
            const ts = now.getFullYear().toString() +
                String(now.getMonth() + 1).padStart(2, '0') +
                String(now.getDate()).padStart(2, '0') + '_' +
                String(now.getHours()).padStart(2, '0') +
                String(now.getMinutes()).padStart(2, '0') +
                String(now.getSeconds()).padStart(2, '0');
            const extension = ({ 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/flac': 'flac' })[blob.type] || 'mp3';
            const filename = '语音_' + ts + '.' + extension;
            return await OvoFileDownload.save(blob, filename);
        } catch (err) {
            console.error('[TTS] 下载失败:', err);
            throw err;
        }
    },

    // 清空缓存
    clearCache: function() {
        // 释放所有 Blob URL
        for (const url of this.audioCache.values()) {
            URL.revokeObjectURL(url);
        }
        this.audioCache.clear();
        console.log('[TTS] 缓存已清空');
    }
};

// 导出统一名称，并保留旧名称供现有聊天、通话和插件调用
const MinimaxTTSService = TTSService;
window.TTSService = TTSService;
window.MinimaxTTSService = TTSService;

// 页面加载时初始化
if (typeof window !== 'undefined') {
    // 延迟初始化，确保 DOM 和其他依赖已加载
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            TTSService.init();
        });
    } else {
        TTSService.init();
    }
}
