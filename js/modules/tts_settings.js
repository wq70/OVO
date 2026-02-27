// js/modules/tts_settings.js
// TTS 设置管理

const TTSSettings = {
    init: function() {
        this.bindEvents();
        this.loadSettings();
    },

    bindEvents: function() {
        // 保存 TTS 配置按钮
        const saveTTSBtn = document.getElementById('save-minimax-tts-btn');
        if (saveTTSBtn) {
            saveTTSBtn.addEventListener('click', () => this.saveTTSConfig());
        }

        // 测试 TTS 按钮
        const testTTSBtn = document.getElementById('test-minimax-tts-btn');
        if (testTTSBtn) {
            testTTSBtn.addEventListener('click', () => this.testTTS());
        }

        // 保存角色语言设置（在聊天设置保存时触发）
        const chatSettingsForm = document.getElementById('chat-settings-form');
        if (chatSettingsForm) {
            chatSettingsForm.addEventListener('submit', (e) => {
                // 不阻止表单提交，只是额外保存 TTS 配置
                this.saveChatTTSConfig();
            });
        }
    },

    // 加载 TTS 全局配置
    loadSettings: function() {
        try {
            const config = MinimaxTTSService.config;
            
            // 填充表单
            const enabledInput = document.getElementById('minimax-tts-enabled');
            const groupIdInput = document.getElementById('minimax-group-id');
            const apiKeyInput = document.getElementById('minimax-api-key');
            const domainSelect = document.getElementById('minimax-domain');
            const modelSelect = document.getElementById('minimax-tts-model');

            if (enabledInput) enabledInput.checked = config.enabled || false;
            if (groupIdInput) groupIdInput.value = config.groupId || '';
            if (apiKeyInput) apiKeyInput.value = config.apiKey || '';
            if (domainSelect) domainSelect.value = config.domain || 'api.minimaxi.com';
            if (modelSelect) modelSelect.value = config.model || 'speech-2.8-hd';

        } catch (err) {
            console.error('[TTSSettings] 加载设置失败:', err);
        }
    },

    // 保存 TTS 全局配置
    saveTTSConfig: function() {
        try {
            const enabledInput = document.getElementById('minimax-tts-enabled');
            const groupIdInput = document.getElementById('minimax-group-id');
            const apiKeyInput = document.getElementById('minimax-api-key');
            const domainSelect = document.getElementById('minimax-domain');
            const modelSelect = document.getElementById('minimax-tts-model');

            const config = {
                enabled: enabledInput?.checked || false,
                groupId: groupIdInput?.value?.trim() || '',
                apiKey: apiKeyInput?.value?.trim() || '',
                domain: domainSelect?.value || 'api.minimaxi.com',
                model: modelSelect?.value || 'speech-2.8-hd'
            };

            // 验证
            if (config.enabled && (!config.groupId || !config.apiKey)) {
                showToast('请填写完整的 GroupId 和 API Key');
                return;
            }

            // 保存
            const success = MinimaxTTSService.saveConfig(config);
            if (success) {
                showToast('TTS 配置已保存');
            } else {
                showToast('保存失败，请重试');
            }

        } catch (err) {
            console.error('[TTSSettings] 保存配置失败:', err);
            showToast('保存失败');
        }
    },

    // 测试 TTS 播放
    testTTS: async function() {
        try {
            // 先保存配置
            this.saveTTSConfig();

            // 检查配置
            if (!MinimaxTTSService.isConfigured()) {
                showToast('请先填写完整配置');
                return;
            }

            showToast('🔊 正在测试 TTS...');

            const testText = '你好，这是一个语音合成测试。Hello, this is a text-to-speech test.';
            const testVoiceId = 'female-shaonv'; // 默认测试音色

            await MinimaxTTSService.synthesizeAndPlay(testText, testVoiceId, 'auto');
            showToast('✅ TTS 测试成功！');

        } catch (err) {
            console.error('[TTSSettings] 测试失败:', err);
            if (err.message.includes('API 请求失败')) {
                showToast('❌ API 请求失败，请检查 GroupId 和 API Key');
            } else if (err.message.includes('音频数据转换失败')) {
                showToast('❌ 音频数据格式错误');
            } else {
                showToast('❌ 测试失败: ' + err.message);
            }
        }
    },

    // 保存角色 TTS 配置（音色和语言）
    saveChatTTSConfig: async function() {
        try {
            if (typeof currentChatId === 'undefined' || !currentChatId) return;
            if (typeof db === 'undefined' || !db.characters) return;

            const chat = db.characters.find(c => c.id === currentChatId);
            if (!chat) return;

            // 获取语言选择
            const languageSelect = document.getElementById('setting-tts-language');
            const language = languageSelect?.value || 'auto';
            
            // 获取自定义 Voice ID
            const customVoiceIdInput = document.getElementById('setting-custom-voice-id');
            const customVoiceId = customVoiceIdInput?.value?.trim() || '';

            // 初始化 ttsConfig
            if (!chat.ttsConfig) {
                chat.ttsConfig = {};
            }

            // 保存配置（音色ID已经在 VoiceSelector 中保存了）
            chat.ttsConfig.language = language;
            chat.ttsConfig.customVoiceId = customVoiceId;

            await saveData();
            console.log('[TTSSettings] 角色 TTS 配置已保存', chat.ttsConfig);

        } catch (err) {
            console.error('[TTSSettings] 保存角色配置失败:', err);
        }
    },

    // 加载角色 TTS 配置到表单
    loadChatTTSConfig: function(chatId) {
        try {
            if (typeof db === 'undefined' || !db.characters) return;
            
            const chat = db.characters.find(c => c.id === chatId);
            if (!chat) return;

            // 加载语言设置
            const languageSelect = document.getElementById('setting-tts-language');
            if (languageSelect && chat.ttsConfig && chat.ttsConfig.language) {
                languageSelect.value = chat.ttsConfig.language;
            } else if (languageSelect) {
                languageSelect.value = 'auto';
            }
            
            // 加载自定义 Voice ID
            const customVoiceIdInput = document.getElementById('setting-custom-voice-id');
            if (customVoiceIdInput && chat.ttsConfig && chat.ttsConfig.customVoiceId) {
                customVoiceIdInput.value = chat.ttsConfig.customVoiceId;
            } else if (customVoiceIdInput) {
                customVoiceIdInput.value = '';
            }

            // 更新音色显示
            const voiceNameSpan = document.getElementById('current-voice-name');
            if (voiceNameSpan && chat.ttsConfig && chat.ttsConfig.voiceId) {
                const voice = VoiceSelector.voices.find(v => v.id === chat.ttsConfig.voiceId);
                if (voice) {
                    voiceNameSpan.textContent = voice.name;
                } else {
                    voiceNameSpan.textContent = '选择音色';
                }
            } else if (voiceNameSpan) {
                voiceNameSpan.textContent = '选择音色';
            }

        } catch (err) {
            console.error('[TTSSettings] 加载角色配置失败:', err);
        }
    }
};

// 导出全局变量
window.TTSSettings = TTSSettings;

// 页面加载时初始化
if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        TTSSettings.init();
    });
}
