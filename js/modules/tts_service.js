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
    // 配置项（从 localStorage 加载）
    config: {
        enabled: false,
        groupId: '',
        apiKey: '',
        domain: 'api.minimaxi.com',
        model: 'speech-2.8-hd'
    },

    // 音频缓存 (文本+音色ID作为key)
    audioCache: new Map(),
    
    // 当前播放的音频对象
    currentAudio: null,
    
    // 播放队列
    playQueue: [],
    isPlaying: false,

    // 初始化 - 从 localStorage 加载配置
    init: function() {
        this.loadConfig();
        console.log('[TTS] 服务已初始化', this.config);
    },

    // 加载配置
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

    // 保存配置
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

    // 检查配置是否完整
    isConfigured: function() {
        return this.config.enabled && 
               this.config.groupId && 
               this.config.apiKey;
    },

    // 合成语音
    synthesize: async function(text, voiceId, language = 'auto') {
        if (!this.isConfigured()) {
            throw new Error('TTS 未配置或未启用');
        }

        // 清理文本
        const cleanText = this.cleanText(text);
        if (!cleanText) {
            throw new Error('文本为空');
        }

        // 检查缓存
        const cacheKey = `${cleanText}_${voiceId}_${language}`;
        if (this.audioCache.has(cacheKey)) {
            console.log('[TTS] 使用缓存:', cacheKey);
            return this.audioCache.get(cacheKey);
        }

        console.log('[TTS] 开始合成:', { text: cleanText, voiceId, language });

        try {
            // 将 GroupId 放到 URL 参数中，减少触发 CORS 预检
            const url = `https://${this.config.domain}/v1/t2a_v2?GroupId=${encodeURIComponent(this.config.groupId)}`;
            
            // ✅ 按照官方文档的嵌套结构组织请求体
            const requestBody = {
                model: this.config.model,
                text: cleanText,
                stream: false,  // ✅ 必需参数：非流式输出
                voice_setting: {  // ✅ 嵌套对象
                    voice_id: voiceId,
                    speed: 1,
                    vol: 1,
                    pitch: 0
                },
                audio_setting: {  // ✅ 嵌套对象
                    sample_rate: 32000,
                    bitrate: 128000,
                    format: 'mp3',
                    channel: 1
                }
            };

            // 若指定了语言，将前端语言码映射为 API 要求的 language_boost 枚举值后传入
            if (language && language !== 'auto') {
                const apiValue = LANGUAGE_BOOST_MAP[language] || language;
                requestBody.language_boost = apiValue;
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
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

    // 播放音频
    play: async function(audioUrl) {
        return new Promise((resolve, reject) => {
            try {
                // 停止当前播放
                if (this.currentAudio) {
                    this.currentAudio.pause();
                    this.currentAudio = null;
                }

                const audio = new Audio(audioUrl);
                this.currentAudio = audio;

                audio.onended = () => {
                    this.currentAudio = null;
                    resolve();
                };

                audio.onerror = (err) => {
                    this.currentAudio = null;
                    reject(new Error('音频播放失败'));
                };

                audio.play().catch(reject);

            } catch (err) {
                reject(err);
            }
        });
    },

    // 停止播放
    stop: function() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }
        this.playQueue = [];
        this.isPlaying = false;
    },

    // 合成并播放
    synthesizeAndPlay: async function(text, voiceId, language = 'auto') {
        try {
            const audioUrl = await this.synthesize(text, voiceId, language);
            await this.play(audioUrl);
        } catch (err) {
            console.error('[TTS] 播放失败:', err);
            throw err;
        }
    },

    // 清理文本（移除特殊标记和旁白）
    cleanText: function(text) {
        if (!text) return '';
        
        // 移除方括号内容（如 [系统消息]）
        let cleaned = text.replace(/\[.*?\]/g, '');
        
        // 移除圆括号和中文括号内容（旁白）
        cleaned = cleaned.replace(/[\(（].*?[\)）]/g, '');
        
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
