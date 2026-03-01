// js/modules/tts_service.js
// Minimax TTS 语音合成服务
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

const MinimaxTTSService = {
    // 角色 TTS 配置（从 localStorage 加载）
    config: {
        enabled: false,
        groupId: '',
        apiKey: '',
        domain: 'api.minimaxi.com',
        model: 'speech-2.8-hd'
    },

    // 用户 TTS 配置（独立存储）
    userConfig: {
        enabled: false,
        groupId: '',
        apiKey: '',
        domain: 'api.minimaxi.com',
        model: 'speech-2.8-hd'
    },

    // 音频缓存 (文本+音色ID作为key，用户缓存加 user_ 前缀)
    audioCache: new Map(),
    
    // 当前播放的音频对象
    currentAudio: null,
    // 当前播放对应的消息标识（用于聊天语音条暂停/恢复，由调用方传入 playKey）
    currentPlayKey: null,
    // 是否处于暂停状态（仅在有 currentAudio 时有效）
    isPaused: false,

    // 播放队列
    playQueue: [],
    isPlaying: false,

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

    // 初始化 - 从 localStorage 加载配置
    init: function() {
        this.loadConfig();
        this.loadUserConfig();
        console.log('[TTS] 服务已初始化', this.config);
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
            this.config = { ...this.config, ...newConfig };
            localStorage.setItem('minimax_tts_config', JSON.stringify(this.config));
            console.log('[TTS] 配置已保存', this.config);
            return true;
        } catch (err) {
            console.error('[TTS] 保存配置失败:', err);
            return false;
        }
    },

    // 保存用户 TTS 配置
    saveUserConfig: function(newConfig) {
        try {
            this.userConfig = { ...this.userConfig, ...newConfig };
            localStorage.setItem('minimax_user_tts_config', JSON.stringify(this.userConfig));
            console.log('[TTS] 用户配置已保存', this.userConfig);
            return true;
        } catch (err) {
            console.error('[TTS] 保存用户配置失败:', err);
            return false;
        }
    },

    // 检查角色 TTS 配置是否完整
    isConfigured: function() {
        return this.config.enabled &&
               this.config.groupId &&
               this.config.apiKey;
    },

    // 检查用户 TTS 配置是否完整（仅当启用时要求 groupId/apiKey）
    isUserConfigured: function() {
        return this.userConfig.enabled &&
               this.userConfig.groupId &&
               this.userConfig.apiKey;
    },

    // 合成语音。options.forUser === true 时使用用户 TTS 配置
    synthesize: async function(text, voiceId, language = 'auto', options = {}) {
        const forUser = !!options.forUser;
        const cfg = forUser ? this.userConfig : this.config;

        if (forUser) {
            if (!this.isUserConfigured()) {
                throw new Error('用户 TTS 未配置或未启用');
            }
        } else {
            if (!this.isConfigured()) {
                throw new Error('TTS 未配置或未启用');
            }
        }

        // 清理文本
        const cleanText = this.cleanText(text);
        if (!cleanText) {
            throw new Error('文本为空');
        }

        // 检查缓存（用户与角色分开）
        const cacheKey = (forUser ? 'user_' : '') + `${cleanText}_${voiceId}_${language}`;
        if (this.audioCache.has(cacheKey)) {
            console.log('[TTS] 使用缓存:', cacheKey);
            return this.audioCache.get(cacheKey);
        }

        console.log('[TTS] 开始合成:', { forUser, text: cleanText, voiceId, language });

        try {
            const url = `https://${cfg.domain}/v1/t2a_v2?GroupId=${encodeURIComponent(cfg.groupId)}`;
            const requestBody = {
                model: cfg.model,
                text: cleanText,
                stream: false,
                voice_setting: {
                    voice_id: voiceId,
                    speed: 1,
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
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[TTS] API 错误:', response.status, errorText);
                throw new Error(`API 请求失败: ${response.status}`);
            }

            const result = await response.json();
            
            // ✅ 先检查 base_resp 状态码
            if (result.base_resp && result.base_resp.status_code !== 0) {
                console.error('[TTS] API 返回错误:', result.base_resp);
                throw new Error(`API 错误: ${result.base_resp.status_msg || '未知错误'}`);
            }

            // ✅ 再检查 data.audio
            if (!result || !result.data || !result.data.audio) {
                console.error('[TTS] 返回格式错误:', result);
                throw new Error('API 返回格式错误');
            }

            // ✅ 将 HEX 音频数据转为 Blob（官方返回的是 hex 编码，不是 base64）
            const audioData = result.data.audio;
            const blob = this.hexToBlob(audioData, 'audio/mpeg');
            const audioUrl = URL.createObjectURL(blob);

            // 存入缓存
            this.audioCache.set(cacheKey, audioUrl);
            
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
            console.error('[TTS] 合成失败:', err);
            throw err;
        }
    },

    // 播放音频。playKey 为可选，用于标识当前播放（如消息 id），便于聊天页暂停/恢复
    play: async function(audioUrl, playKey) {
        return new Promise((resolve, reject) => {
            try {
                // 停止当前播放
                if (this.currentAudio) {
                    this.currentAudio.pause();
                    this.currentAudio = null;
                }
                this.currentPlayKey = playKey || null;
                this.isPaused = false;

                const audio = new Audio(audioUrl);
                this.currentAudio = audio;

                audio.onended = () => {
                    this.currentAudio = null;
                    this.currentPlayKey = null;
                    this.isPaused = false;
                    this._dispatchState();
                    resolve();
                };

                audio.onerror = () => {
                    this.currentAudio = null;
                    this.currentPlayKey = null;
                    this.isPaused = false;
                    this._dispatchState();
                    reject(new Error('音频播放失败'));
                };

                this._dispatchState();
                audio.play().catch(reject);

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
        try {
            const audioUrl = await this.synthesize(text, voiceId, language, options);
            await this.play(audioUrl, options.playKey);
        } catch (err) {
            console.error('[TTS] 播放失败:', err);
            throw err;
        }
    },

    // 排队播放下一条（内部使用）
    _processQueue: function() {
        if (this.isPlaying || this.playQueue.length === 0) return;
        const item = this.playQueue.shift();
        this.isPlaying = true;
        const self = this;
        const opts = item.forUser ? { forUser: true } : {};
        this.synthesizeAndPlay(item.text, item.voiceId, item.language, opts)
            .catch(err => {
                console.error('[TTS] 队列播放失败:', err);
            })
            .finally(() => {
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
        const cleanText = this.cleanText(text);
        if (!cleanText) return;

        const item = { text, voiceId, language: language || 'auto', forUser };
        if (this.isPlaying) {
            this.playQueue.push(item);
            return;
        }
        this.isPlaying = true;
        const self = this;
        this.synthesizeAndPlay(text, voiceId, language, options)
            .catch(err => {
                console.error('[TTS] 队列首条播放失败:', err);
            })
            .finally(() => {
                self.isPlaying = false;
                self._processQueue();
            });
    },

    // 清理文本（移除特殊标记、旁白、双语翻译）
    cleanText: function(text) {
        if (!text) return '';
        
        // 移除方括号内容（如 [系统消息]）
        let cleaned = text.replace(/\[.*?\]/g, '');
        
        // 移除圆括号和中文括号内容（旁白）
        cleaned = cleaned.replace(/[\(（].*?[\)）]/g, '');
        
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

// 导出全局变量
window.MinimaxTTSService = MinimaxTTSService;

// 页面加载时初始化
if (typeof window !== 'undefined') {
    // 延迟初始化，确保 DOM 和其他依赖已加载
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            MinimaxTTSService.init();
        });
    } else {
        MinimaxTTSService.init();
    }
}
