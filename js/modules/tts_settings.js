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

    // 加载 TTS 全局配置（角色 + 用户）
    loadSettings: function() {
        try {
            const config = MinimaxTTSService.config;
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

            const userConfig = MinimaxTTSService.userConfig;
            const userEnabledInput = document.getElementById('minimax-user-tts-enabled');
            const userGroupIdInput = document.getElementById('minimax-user-group-id');
            const userApiKeyInput = document.getElementById('minimax-user-api-key');
            const userDomainSelect = document.getElementById('minimax-user-domain');
            const userModelSelect = document.getElementById('minimax-user-tts-model');
            if (userEnabledInput) userEnabledInput.checked = userConfig.enabled || false;
            if (userGroupIdInput) userGroupIdInput.value = userConfig.groupId || '';
            if (userApiKeyInput) userApiKeyInput.value = userConfig.apiKey || '';
            if (userDomainSelect) userDomainSelect.value = userConfig.domain || 'api.minimaxi.com';
            if (userModelSelect) userModelSelect.value = userConfig.model || 'speech-2.8-hd';
        } catch (err) {
            console.error('[TTSSettings] 加载设置失败:', err);
        }
    },

    // 保存 TTS 全局配置（角色 + 用户）
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
            if (config.enabled && (!config.groupId || !config.apiKey)) {
                showToast('请填写完整的角色 TTS GroupId 和 API Key');
                return;
            }
            MinimaxTTSService.saveConfig(config);

            const userEnabledInput = document.getElementById('minimax-user-tts-enabled');
            const userGroupIdInput = document.getElementById('minimax-user-group-id');
            const userApiKeyInput = document.getElementById('minimax-user-api-key');
            const userDomainSelect = document.getElementById('minimax-user-domain');
            const userModelSelect = document.getElementById('minimax-user-tts-model');
            const userConfig = {
                enabled: userEnabledInput?.checked || false,
                groupId: userGroupIdInput?.value?.trim() || '',
                apiKey: userApiKeyInput?.value?.trim() || '',
                domain: userDomainSelect?.value || 'api.minimaxi.com',
                model: userModelSelect?.value || 'speech-2.8-hd'
            };
            if (userConfig.enabled && (!userConfig.groupId || !userConfig.apiKey)) {
                showToast('请填写完整的用户 TTS GroupId 和 API Key');
                return;
            }
            MinimaxTTSService.saveUserConfig(userConfig);

            showToast('TTS 配置已保存');
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

    // 保存角色 + 用户 TTS 配置（音色和语言）
    saveChatTTSConfig: async function() {
        try {
            if (typeof currentChatId === 'undefined' || !currentChatId) return;
            if (typeof db === 'undefined' || !db.characters) return;

            const chat = db.characters.find(c => c.id === currentChatId);
            if (!chat) return;

            if (!chat.ttsConfig) chat.ttsConfig = {};

            const languageSelect = document.getElementById('setting-tts-language');
            const customVoiceIdInput = document.getElementById('setting-custom-voice-id');
            chat.ttsConfig.language = languageSelect?.value || 'auto';
            chat.ttsConfig.customVoiceId = customVoiceIdInput?.value?.trim() || '';

            const userLanguageSelect = document.getElementById('setting-user-tts-language');
            const userCustomVoiceIdInput = document.getElementById('setting-user-custom-voice-id');
            if (userLanguageSelect) chat.ttsConfig.userLanguage = userLanguageSelect.value || 'auto';
            if (userCustomVoiceIdInput) chat.ttsConfig.userCustomVoiceId = userCustomVoiceIdInput.value?.trim() || '';

            await saveData();
            console.log('[TTSSettings] 角色与用户 TTS 配置已保存', chat.ttsConfig);
        } catch (err) {
            console.error('[TTSSettings] 保存角色配置失败:', err);
        }
    },

    // 加载角色 + 用户 TTS 配置到表单，并控制用户语音区块显隐
    loadChatTTSConfig: function(chatId) {
        try {
            if (typeof db === 'undefined' || !db.characters) return;
            const chat = db.characters.find(c => c.id === chatId);
            if (!chat) return;

            const languageSelect = document.getElementById('setting-tts-language');
            if (languageSelect) languageSelect.value = (chat.ttsConfig && chat.ttsConfig.language) || 'auto';
            const customVoiceIdInput = document.getElementById('setting-custom-voice-id');
            if (customVoiceIdInput) customVoiceIdInput.value = (chat.ttsConfig && chat.ttsConfig.customVoiceId) || '';

            const voiceNameSpan = document.getElementById('current-voice-name');
            if (voiceNameSpan) {
                const voiceId = chat.ttsConfig && chat.ttsConfig.voiceId;
                if (voiceId) {
                    const voice = VoiceSelector.voices.find(v => v.id === voiceId);
                    voiceNameSpan.textContent = voice ? voice.name : '选择音色';
                } else {
                    voiceNameSpan.textContent = '选择音色';
                }
            }

            // 用户语音区块：仅当 API 中启用用户 TTS 时显示
            const userWrap = document.getElementById('user-voice-settings-wrap');
            const userIncompleteHint = document.getElementById('user-voice-incomplete-hint');
            const userTTSEnabled = typeof MinimaxTTSService !== 'undefined' && MinimaxTTSService.userConfig && MinimaxTTSService.userConfig.enabled;

            if (userWrap) {
                userWrap.style.display = userTTSEnabled ? 'block' : 'none';
            }
            if (userTTSEnabled) {
                const userLanguageSelect = document.getElementById('setting-user-tts-language');
                if (userLanguageSelect) userLanguageSelect.value = (chat.ttsConfig && chat.ttsConfig.userLanguage) || 'auto';
                const userCustomInput = document.getElementById('setting-user-custom-voice-id');
                if (userCustomInput) userCustomInput.value = (chat.ttsConfig && chat.ttsConfig.userCustomVoiceId) || '';

                const userVoiceNameSpan = document.getElementById('current-user-voice-name');
                if (userVoiceNameSpan) {
                    const uid = chat.ttsConfig && chat.ttsConfig.userVoiceId;
                    if (uid) {
                        const uVoice = VoiceSelector.voices.find(v => v.id === uid);
                        userVoiceNameSpan.textContent = uVoice ? uVoice.name : '选择音色';
                    } else {
                        userVoiceNameSpan.textContent = '选择音色';
                    }
                }

                // 仅当启用但未配置完全时显示「未配置完全」
                const hasUserVoice = (chat.ttsConfig && (chat.ttsConfig.userVoiceId || (chat.ttsConfig.userCustomVoiceId && chat.ttsConfig.userCustomVoiceId.trim())));
                if (userIncompleteHint) userIncompleteHint.style.display = hasUserVoice ? 'none' : 'block';
            } else if (userIncompleteHint) {
                userIncompleteHint.style.display = 'none';
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
