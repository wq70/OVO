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
        document.getElementById('test-user-tts-btn')?.addEventListener('click', () => this.testTTS(true));
        for (const type of ['char', 'user']) {
            const prefix = type === 'user' ? 'elevenlabs-user-' : 'elevenlabs-';
            document.getElementById(prefix + 'select-voice')?.addEventListener('click', () => {
                VoiceSelector.showElevenModal(type, this.readElevenFields(type), prefix + 'voice-id');
            });
            document.getElementById(prefix + 'load-models')?.addEventListener('click', () => this.loadElevenModels(type));
        }

        // 保存角色语言设置（在聊天设置保存时触发）
        const chatSettingsForm = document.getElementById('chat-settings-form');
        if (chatSettingsForm) {
            chatSettingsForm.addEventListener('submit', (e) => {
                // 不阻止表单提交，只是额外保存 TTS 配置
                this.saveChatTTSConfig();
            });
        }

        // 语速滑块实时显示
        const speedInput = document.getElementById('setting-tts-speed');
        const speedValueSpan = document.getElementById('setting-tts-speed-value');
        if (speedInput && speedValueSpan) {
            speedInput.addEventListener('input', () => { speedValueSpan.textContent = speedInput.value; });
        }
        const userSpeedInput = document.getElementById('setting-user-tts-speed');
        const userSpeedValueSpan = document.getElementById('setting-user-tts-speed-value');
        if (userSpeedInput && userSpeedValueSpan) {
            userSpeedInput.addEventListener('input', () => { userSpeedValueSpan.textContent = userSpeedInput.value; });
        }
    },

        // 加载 TTS 全局配置（角色 + 用户）
        loadSettings: function() {
            try {
                const config = MinimaxTTSService.config;
                const enabledInput = document.getElementById('minimax-tts-enabled');
                const providerSelect = document.getElementById('tts-provider');
                const groupIdInput = document.getElementById('minimax-group-id');
                const apiKeyInput = document.getElementById('minimax-api-key');
                const domainSelect = document.getElementById('minimax-domain');
                const modelSelect = document.getElementById('minimax-tts-model');
                
                if (enabledInput) enabledInput.checked = config.enabled || false;
                if (providerSelect) {
                    providerSelect.value = config.provider || 'minimax';
                    this.toggleProviderConfig('char', config.provider || 'minimax');
                    providerSelect.addEventListener('change', (e) => this.toggleProviderConfig('char', e.target.value));
                }

                if (groupIdInput) groupIdInput.value = config.groupId || '';
                if (apiKeyInput) apiKeyInput.value = config.apiKey || '';
                this.setSelectValue(domainSelect, config.domain || 'api.minimax.cn');
                this.setSelectValue(modelSelect, config.model || 'speech-2.8-hd');
                this.loadVolcengineFields('char', config);
                this.loadElevenFields('char', config);

                const userConfig = MinimaxTTSService.userConfig;
                const userEnabledInput = document.getElementById('minimax-user-tts-enabled');
                const userProviderSelect = document.getElementById('user-tts-provider');
                const userGroupIdInput = document.getElementById('minimax-user-group-id');
                const userApiKeyInput = document.getElementById('minimax-user-api-key');
                const userDomainSelect = document.getElementById('minimax-user-domain');
                const userModelSelect = document.getElementById('minimax-user-tts-model');

                if (userEnabledInput) userEnabledInput.checked = userConfig.enabled || false;
                if (userProviderSelect) {
                    userProviderSelect.value = userConfig.provider || 'minimax';
                    this.toggleProviderConfig('user', userConfig.provider || 'minimax');
                    userProviderSelect.addEventListener('change', (e) => this.toggleProviderConfig('user', e.target.value));
                }

                if (userGroupIdInput) userGroupIdInput.value = userConfig.groupId || '';
                if (userApiKeyInput) userApiKeyInput.value = userConfig.apiKey || '';
                this.setSelectValue(userDomainSelect, userConfig.domain || 'api.minimax.cn');
                this.setSelectValue(userModelSelect, userConfig.model || 'speech-2.8-hd');
                this.loadVolcengineFields('user', userConfig);
                this.loadElevenFields('user', userConfig);
            } catch (err) {
                console.error('[TTSSettings] 加载设置失败:', err);
            }
        },

        toggleProviderConfig: function(type, provider) {
            const prefix = type === 'user' ? 'minimax-user-' : 'minimax-';
            const minimaxWrap = document.getElementById(`${prefix}tts-config-wrap`);
            const volcWrap = document.getElementById(type === 'user' ? 'volcengine-user-tts-config-wrap' : 'volcengine-tts-config-wrap');
            if (minimaxWrap) minimaxWrap.style.display = provider === 'minimax' ? 'block' : 'none';
            if (volcWrap) volcWrap.style.display = provider === 'volcengine' ? 'block' : 'none';
            const elevenWrap = document.getElementById(type === 'user' ? 'elevenlabs-user-tts-config-wrap' : 'elevenlabs-tts-config-wrap');
            if (elevenWrap) elevenWrap.style.display = provider === 'elevenlabs' ? 'block' : 'none';
        },

        setSelectValue: function(select, value) {
            if (!select) return;
            if (![...select.options].some(option => option.value === value)) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = value;
                select.appendChild(option);
            }
            select.value = value;
        },

        readElevenFields: function(type) {
            const prefix = type === 'user' ? 'elevenlabs-user-' : 'elevenlabs-';
            const read = suffix => document.getElementById(prefix + suffix)?.value?.trim() || '';
            return { elevenApiKey: read('api-key'), elevenModel: read('model') || 'eleven_multilingual_v2',
                elevenVoiceId: read('voice-id'), elevenUrl: read('url') || 'https://api.elevenlabs.io',
                elevenTagMode: read('tag-mode') === 'custom' ? 'custom' : 'preset',
                elevenShowTagsInTranscript: document.getElementById(prefix + 'show-tags')?.checked === true };
        },

        loadElevenFields: function(type, config) {
            const prefix = type === 'user' ? 'elevenlabs-user-' : 'elevenlabs-';
            const values = { 'api-key': config.elevenApiKey || '', 'voice-id': config.elevenVoiceId || '',
                'url': config.elevenUrl || 'https://api.elevenlabs.io' };
            Object.entries(values).forEach(([suffix, value]) => {
                const input = document.getElementById(prefix + suffix);
                if (input) input.value = value;
            });
            this.setSelectValue(document.getElementById(prefix + 'model'), config.elevenModel || 'eleven_multilingual_v2');
            const tagMode = document.getElementById(prefix + 'tag-mode');
            if (tagMode) tagMode.value = config.elevenTagMode === 'custom' ? 'custom' : 'preset';
            const showTags = document.getElementById(prefix + 'show-tags');
            if (showTags) showTags.checked = config.elevenShowTagsInTranscript === true;
        },

        loadElevenModels: async function(type) {
            const prefix = type === 'user' ? 'elevenlabs-user-' : 'elevenlabs-';
            const button = document.getElementById(prefix + 'load-models');
            if (button?.disabled) return;
            const cfg = this.readElevenFields(type);
            if (!cfg.elevenApiKey) return showToast('请先填写 ElevenLabs API Key');
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            if (button) { button.disabled = true; button.textContent = '读取中'; }
            try {
                const response = await fetch(`${TTSService._elevenBaseUrl(cfg)}/v1/models`, {
                    headers: { 'xi-api-key': cfg.elevenApiKey }, signal: controller.signal
                });
                if (!response.ok) throw await TTSService._elevenError(response);
                const models = await response.json();
                if (!Array.isArray(models)) throw new Error('模型列表格式不正确');
                const select = document.getElementById(prefix + 'model');
                const selected = select.value;
                for (const model of models.filter(item => item.can_do_text_to_speech)) {
                    if (![...select.options].some(option => option.value === model.model_id)) {
                        const option = document.createElement('option');
                        option.value = model.model_id;
                        option.textContent = model.name || model.model_id;
                        select.appendChild(option);
                    }
                }
                select.value = selected;
                showToast('语音模型已读取');
            } catch (err) {
                showToast(err.name === 'AbortError' ? '读取模型超时，请重试或使用已有模型' : err.message);
            } finally {
                clearTimeout(timeout);
                if (button) { button.disabled = false; button.textContent = '读取'; }
            }
        },

        loadVolcengineFields: function(type, config) {
            const prefix = type === 'user' ? 'volcengine-user-' : 'volcengine-';
            const values = {
                'app-id': config.volcAppId || '',
                'access-token': config.volcAccessToken || '',
                'resource-id': config.volcResourceId || 'seed-tts-2.0',
                'voice-type': config.volcVoiceType || '',
                'tts-url': config.volcUrl || 'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
                'audio-format': config.volcFormat || 'mp3'
            };
            Object.entries(values).forEach(([suffix, value]) => {
                const element = document.getElementById(prefix + suffix);
                if (element) element.value = value;
            });
        },

        readVolcengineFields: function(type) {
            const prefix = type === 'user' ? 'volcengine-user-' : 'volcengine-';
            const read = suffix => document.getElementById(prefix + suffix)?.value?.trim() || '';
            return {
                volcAppId: read('app-id'), volcAccessToken: read('access-token'),
                volcResourceId: read('resource-id') || 'seed-tts-2.0',
                volcVoiceType: read('voice-type'),
                volcUrl: read('tts-url') || 'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
                volcFormat: read('audio-format') || 'mp3'
            };
        },

        // 保存 TTS 全局配置（角色 + 用户）
        saveTTSConfig: function() {
            try {
                const enabledInput = document.getElementById('minimax-tts-enabled');
                const providerSelect = document.getElementById('tts-provider');
                const groupIdInput = document.getElementById('minimax-group-id');
                const apiKeyInput = document.getElementById('minimax-api-key');
                const domainSelect = document.getElementById('minimax-domain');
                const modelSelect = document.getElementById('minimax-tts-model');
                
                const config = {
                    enabled: enabledInput?.checked || false,
                    provider: providerSelect?.value || 'minimax',
                    groupId: groupIdInput?.value?.trim() || '',
                    apiKey: apiKeyInput?.value?.trim() || '',
                    domain: domainSelect?.value || 'api.minimax.cn',
                    model: modelSelect?.value || 'speech-2.8-hd',
                    ...this.readVolcengineFields('char'),
                    ...this.readElevenFields('char')
                };
                
                if (config.enabled) {
                    if (config.provider === 'minimax' && !config.apiKey) {
                        showToast('请填写角色 Minimax TTS API Key');
                        return false;
                    }
                    if (config.provider === 'volcengine' && (!config.volcAppId || !config.volcAccessToken || !config.volcResourceId || !config.volcVoiceType || !config.volcUrl)) {
                        showToast('请填写完整的角色火山语音配置');
                        return false;
                    }
                    if (config.provider === 'elevenlabs' && !config.elevenApiKey) {
                        showToast('请填写角色 ElevenLabs API Key');
                        return false;
                    }
                    if (config.provider === 'elevenlabs') TTSService._elevenBaseUrl(config);
                }
                const userEnabledInput = document.getElementById('minimax-user-tts-enabled');
                const userProviderSelect = document.getElementById('user-tts-provider');
                const userGroupIdInput = document.getElementById('minimax-user-group-id');
                const userApiKeyInput = document.getElementById('minimax-user-api-key');
                const userDomainSelect = document.getElementById('minimax-user-domain');
                const userModelSelect = document.getElementById('minimax-user-tts-model');
                
                const userConfig = {
                    enabled: userEnabledInput?.checked || false,
                    provider: userProviderSelect?.value || 'minimax',
                    groupId: userGroupIdInput?.value?.trim() || '',
                    apiKey: userApiKeyInput?.value?.trim() || '',
                    domain: userDomainSelect?.value || 'api.minimax.cn',
                    model: userModelSelect?.value || 'speech-2.8-hd',
                    ...this.readVolcengineFields('user'),
                    ...this.readElevenFields('user')
                };

                if (userConfig.enabled) {
                    if (userConfig.provider === 'minimax' && !userConfig.apiKey) {
                        showToast('请填写用户 Minimax TTS API Key');
                        return false;
                    }
                    if (userConfig.provider === 'volcengine' && (!userConfig.volcAppId || !userConfig.volcAccessToken || !userConfig.volcResourceId || !userConfig.volcVoiceType || !userConfig.volcUrl)) {
                        showToast('请填写完整的用户火山语音配置');
                        return false;
                    }
                    if (userConfig.provider === 'elevenlabs' && !userConfig.elevenApiKey) {
                        showToast('请填写用户 ElevenLabs API Key');
                        return false;
                    }
                    if (userConfig.provider === 'elevenlabs') TTSService._elevenBaseUrl(userConfig);
                }
                if (!MinimaxTTSService.saveConfig(config) || !MinimaxTTSService.saveUserConfig(userConfig)) {
                    showToast('保存失败，请检查浏览器存储空间');
                    return false;
                }
    
                showToast('TTS 配置已保存');
                return true;
            } catch (err) {
                console.error('[TTSSettings] 保存配置失败:', err);
                showToast('保存失败');
                return false;
            }
        },

    // 测试 TTS 播放
    testTTS: async function(forUser = false) {
        const button = document.getElementById(forUser ? 'test-user-tts-btn' : 'test-minimax-tts-btn');
        if (button?.disabled) return;
        if (button) button.disabled = true;
        try {
            // 先保存配置
            if (!this.saveTTSConfig()) return;

            // 检查配置
            if (forUser ? !MinimaxTTSService.isUserConfigured() : !MinimaxTTSService.isConfigured()) {
                showToast('请先填写完整配置');
                return;
            }

            // 测试按钮点击时激活音频上下文
            await MinimaxTTSService.activateAudioContext();

            showToast('🔊 正在测试 TTS...');

            const testText = '你好，这是一个语音合成测试。Hello, this is a text-to-speech test.';
            const cfg = forUser ? MinimaxTTSService.userConfig : MinimaxTTSService.config;
            const testVoiceId = cfg.provider === 'elevenlabs' ? cfg.elevenVoiceId
                : cfg.provider === 'volcengine' ? cfg.volcVoiceType : 'female-shaonv';

            const played = await MinimaxTTSService.synthesizeAndPlay(testText, testVoiceId, 'auto', { forUser });
            if (played === false) return;
            showToast('✅ TTS 测试成功！');

        } catch (err) {
            console.error('[TTSSettings] 测试失败:', err);
            if (err.message.includes('API 请求失败')) {
                showToast('❌ API 请求失败，请检查接口地址和 API Key');
            } else if (err.message.includes('音频数据转换失败')) {
                showToast('❌ 音频数据格式错误');
            } else {
                showToast('❌ 测试失败: ' + err.message);
            }
        } finally {
            if (button) button.disabled = false;
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
            const speedInput = document.getElementById('setting-tts-speed');
            const chatTtsEnabledInput = document.getElementById('setting-chat-tts-enabled');
            const eleven = MinimaxTTSService.config.provider === 'elevenlabs';
            const userEleven = MinimaxTTSService.userConfig.provider === 'elevenlabs';
            chat.ttsConfig.language = languageSelect?.value || 'auto';
            chat.ttsConfig[eleven ? 'elevenCustomVoiceId' : 'customVoiceId'] = customVoiceIdInput?.value?.trim() || '';
            chat.ttsConfig[eleven ? 'elevenSpeed' : 'speed'] = eleven
                ? Math.min(1.2, Math.max(0.7, parseFloat(speedInput?.value) || 1))
                : Math.min(2, Math.max(0.5, parseFloat(speedInput?.value) || 1));
            chat.ttsConfig.chatTtsEnabled = chatTtsEnabledInput?.checked || false;

            const userLanguageSelect = document.getElementById('setting-user-tts-language');
            const userCustomVoiceIdInput = document.getElementById('setting-user-custom-voice-id');
            const userSpeedInput = document.getElementById('setting-user-tts-speed');
            if (userLanguageSelect) chat.ttsConfig.userLanguage = userLanguageSelect.value || 'auto';
            if (userCustomVoiceIdInput) chat.ttsConfig[userEleven ? 'userElevenCustomVoiceId' : 'userCustomVoiceId'] = userCustomVoiceIdInput.value?.trim() || '';
            if (userSpeedInput) chat.ttsConfig[userEleven ? 'userElevenSpeed' : 'userSpeed'] = userEleven
                ? Math.min(1.2, Math.max(0.7, parseFloat(userSpeedInput.value) || 1))
                : Math.min(2, Math.max(0.5, parseFloat(userSpeedInput.value) || 1));

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

            const eleven = MinimaxTTSService.config.provider === 'elevenlabs';
            const userEleven = MinimaxTTSService.userConfig.provider === 'elevenlabs';

            const languageSelect = document.getElementById('setting-tts-language');
            if (languageSelect) languageSelect.value = (chat.ttsConfig && chat.ttsConfig.language) || 'auto';
            const customVoiceIdInput = document.getElementById('setting-custom-voice-id');
            if (customVoiceIdInput) customVoiceIdInput.value = chat.ttsConfig?.[eleven ? 'elevenCustomVoiceId' : 'customVoiceId'] || '';
            const chatTtsEnabledInput = document.getElementById('setting-chat-tts-enabled');
            if (chatTtsEnabledInput) chatTtsEnabledInput.checked = (chat.ttsConfig && chat.ttsConfig.chatTtsEnabled) || false;
            const speedInput = document.getElementById('setting-tts-speed');
            const speedValueSpan = document.getElementById('setting-tts-speed-value');
            const charSpeed = chat.ttsConfig?.[eleven ? 'elevenSpeed' : 'speed'] ?? 1;
            if (speedInput) { speedInput.min = eleven ? '0.7' : '0.5'; speedInput.max = eleven ? '1.2' : '2'; speedInput.value = charSpeed; }
            if (speedValueSpan) speedValueSpan.textContent = String(charSpeed);

            const voiceNameSpan = document.getElementById('current-voice-name');
            if (voiceNameSpan) {
                const voiceId = chat.ttsConfig?.[eleven ? 'elevenVoiceId' : 'voiceId'];
                if (voiceId) {
                    const voice = VoiceSelector.voices.find(v => v.id === voiceId);
                    voiceNameSpan.textContent = eleven ? chat.ttsConfig.elevenVoiceName || voiceId : voice ? voice.name : '选择音色';
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
                if (userCustomInput) userCustomInput.value = chat.ttsConfig?.[userEleven ? 'userElevenCustomVoiceId' : 'userCustomVoiceId'] || '';
                const userSpeedInput = document.getElementById('setting-user-tts-speed');
                const userSpeedValueSpan = document.getElementById('setting-user-tts-speed-value');
                const userSpeed = chat.ttsConfig?.[userEleven ? 'userElevenSpeed' : 'userSpeed'] ?? 1;
                if (userSpeedInput) { userSpeedInput.min = userEleven ? '0.7' : '0.5'; userSpeedInput.max = userEleven ? '1.2' : '2'; userSpeedInput.value = userSpeed; }
                if (userSpeedValueSpan) userSpeedValueSpan.textContent = String(userSpeed);

                const userVoiceNameSpan = document.getElementById('current-user-voice-name');
                if (userVoiceNameSpan) {
                    const uid = chat.ttsConfig?.[userEleven ? 'userElevenVoiceId' : 'userVoiceId'];
                    if (uid) {
                        const uVoice = VoiceSelector.voices.find(v => v.id === uid);
                        userVoiceNameSpan.textContent = userEleven ? chat.ttsConfig.userElevenVoiceName || uid : uVoice ? uVoice.name : '选择音色';
                    } else {
                        userVoiceNameSpan.textContent = '选择音色';
                    }
                }

                // 仅当启用但未配置完全时显示「未配置完全」
                const hasUserVoice = userEleven ? !!VoiceSelector.getVoiceConfig(chatId, 'user')?.voiceId
                    : (chat.ttsConfig && (chat.ttsConfig.userVoiceId || (chat.ttsConfig.userCustomVoiceId && chat.ttsConfig.userCustomVoiceId.trim())));
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
