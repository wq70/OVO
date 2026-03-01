// js/modules/voice_selector.js
// 语音音色选择器

const VoiceSelector = {
    // 精选系统音色列表（来自官方文档）
    voices: [
        // 中文普通话 - 精选常用
        { id: 'male-qn-qingse', name: '青涩青年', lang: '中文', gender: '男' },
        { id: 'male-qn-jingying', name: '精英青年', lang: '中文', gender: '男' },
        { id: 'male-qn-badao', name: '霸道青年', lang: '中文', gender: '男' },
        { id: 'male-qn-daxuesheng', name: '青年大学生', lang: '中文', gender: '男' },
        { id: 'female-shaonv', name: '少女', lang: '中文', gender: '女' },
        { id: 'female-yujie', name: '御姐', lang: '中文', gender: '女' },
        { id: 'female-chengshu', name: '成熟女性', lang: '中文', gender: '女' },
        { id: 'female-tianmei', name: '甜美女性', lang: '中文', gender: '女' },
        { id: 'clever_boy', name: '聪明男童', lang: '中文', gender: '男' },
        { id: 'lovely_girl', name: '萌萌女童', lang: '中文', gender: '女' },
        { id: 'bingjiao_didi', name: '病娇弟弟', lang: '中文', gender: '男' },
        { id: 'junlang_nanyou', name: '俊朗男友', lang: '中文', gender: '男' },
        { id: 'tianxin_xiaoling', name: '甜心小玲', lang: '中文', gender: '女' },
        { id: 'wumei_yujie', name: '妩媚御姐', lang: '中文', gender: '女' },
        { id: 'Chinese (Mandarin)_Warm_Bestie', name: '温暖闺蜜', lang: '中文', gender: '女' },
        { id: 'Chinese (Mandarin)_Gentleman', name: '温润男声', lang: '中文', gender: '男' },
        { id: 'Chinese (Mandarin)_Sweet_Lady', name: '甜美女声', lang: '中文', gender: '女' },
        
        // 中文粤语
        { id: 'Cantonese_GentleLady', name: '温柔女声', lang: '中文', gender: '女' },
        { id: 'Cantonese_PlayfulMan', name: '活泼男声', lang: '中文', gender: '男' },
        { id: 'Cantonese_CuteGirl', name: '可爱女孩', lang: '中文', gender: '女' },
        
        // 英文
        { id: 'Sweet_Girl', name: 'Sweet Girl', lang: '英文', gender: '女' },
        { id: 'Charming_Lady', name: 'Charming Lady', lang: '英文', gender: '女' },
        { id: 'English_Trustworthy_Man', name: 'Trustworthy Man', lang: '英文', gender: '男' },
        { id: 'English_Graceful_Lady', name: 'Graceful Lady', lang: '英文', gender: '女' },
        { id: 'Attractive_Girl', name: 'Attractive Girl', lang: '英文', gender: '女' },
        { id: 'Serene_Woman', name: 'Serene Woman', lang: '英文', gender: '女' },
        
        // 日文
        { id: 'Japanese_DecisivePrincess', name: 'Decisive Princess', lang: '日文', gender: '女' },
        { id: 'Japanese_LoyalKnight', name: 'Loyal Knight', lang: '日文', gender: '男' },
        { id: 'Japanese_KindLady', name: 'Kind Lady', lang: '日文', gender: '女' },
        { id: 'Japanese_GentleButler', name: 'Gentle Butler', lang: '日文', gender: '男' },
        { id: 'Japanese_GracefulMaiden', name: 'Graceful Maiden', lang: '日文', gender: '女' },
        
        // 韩文
        { id: 'Korean_SweetGirl', name: 'Sweet Girl', lang: '韩文', gender: '女' },
        { id: 'Korean_CheerfulBoyfriend', name: 'Cheerful Boyfriend', lang: '韩文', gender: '男' },
        { id: 'Korean_ElegantPrincess', name: 'Elegant Princess', lang: '韩文', gender: '女' },
        { id: 'Korean_BraveYouth', name: 'Brave Youth', lang: '韩文', gender: '男' },
        
        // 西班牙文
        { id: 'Spanish_SereneWoman', name: 'Serene Woman', lang: '其他', gender: '女' },
        { id: 'Spanish_ConfidentWoman', name: 'Confident Woman', lang: '其他', gender: '女' },
        
        // 法文
        { id: 'French_Male_Speech_New', name: 'Level-Headed Man', lang: '其他', gender: '男' },
        { id: 'French_Female_News Anchor', name: 'Patient Female', lang: '其他', gender: '女' },
        
        // 德文
        { id: 'German_FriendlyMan', name: 'Friendly Man', lang: '其他', gender: '男' },
        { id: 'German_SweetLady', name: 'Sweet Lady', lang: '其他', gender: '女' },
        
        // 俄文
        { id: 'Russian_HandsomeChildhoodFriend', name: 'Handsome Friend', lang: '其他', gender: '男' },
        { id: 'Russian_BrightHeroine', name: 'Bright Queen', lang: '其他', gender: '女' },
    ],

    selectedVoiceId: null,
    currentFilter: 'all',
    // 'char' = 角色音色, 'user' = 用户音色
    currentMode: 'char',

    // 初始化
    init: function() {
        this.bindEvents();
        this.renderVoices();
    },

    // 绑定事件
    bindEvents: function() {
        const selectBtn = document.getElementById('select-voice-id-btn');
        if (selectBtn) {
            selectBtn.addEventListener('click', () => {
                this.currentMode = 'char';
                this.showModal();
            });
        }
        const selectUserBtn = document.getElementById('select-user-voice-id-btn');
        if (selectUserBtn) {
            selectUserBtn.addEventListener('click', () => {
                this.currentMode = 'user';
                this.showModal();
            });
        }

        // 关闭弹窗
        const cancelBtn = document.getElementById('voice-cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.hideModal());
        }

        // 不选择（清除当前选择）
        const clearBtn = document.getElementById('voice-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.selectedVoiceId = null;
                this.renderVoices();
            });
        }

        // 确认选择
        const confirmBtn = document.getElementById('voice-confirm-btn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => this.confirmSelection());
        }

        // 搜索
        const searchInput = document.getElementById('voice-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
        }

        // 分类过滤
        const filterBtns = document.querySelectorAll('.voice-lang-filter');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentFilter = btn.dataset.lang;
                this.renderVoices();
            });
        });
    },

    // 显示弹窗
    showModal: function() {
        const modal = document.getElementById('voice-id-modal');
        if (!modal) return;
        
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('visible'), 10);
        
        // 加载当前选中的音色
        this.loadCurrentVoice();
    },

    // 隐藏弹窗
    hideModal: function() {
        const modal = document.getElementById('voice-id-modal');
        if (!modal) return;
        
        modal.classList.remove('visible');
        setTimeout(() => modal.style.display = 'none', 300);
    },

    // 渲染音色列表
    renderVoices: function(searchTerm = '') {
        const container = document.getElementById('voice-list-container');
        if (!container) return;

        let filteredVoices = this.voices;

        // 语言过滤
        if (this.currentFilter !== 'all') {
            filteredVoices = filteredVoices.filter(v => v.lang === this.currentFilter);
        }

        // 搜索过滤
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filteredVoices = filteredVoices.filter(v => 
                v.name.toLowerCase().includes(term) || 
                v.id.toLowerCase().includes(term)
            );
        }

        // 生成 HTML
        container.innerHTML = filteredVoices.map(voice => `
            <div class="voice-item ${this.selectedVoiceId === voice.id ? 'selected' : ''}" 
                 data-voice-id="${voice.id}" 
                 data-voice-name="${voice.name}"
                 style="padding: 12px; border: 1px solid #eee; border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s; background: ${this.selectedVoiceId === voice.id ? '#e3f2fd' : 'white'};">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: bold; margin-bottom: 3px;">${voice.name}</div>
                        <div style="font-size: 11px; color: #999;">${voice.lang} · ${voice.gender}</div>
                    </div>
                    <div style="font-size: 11px; color: #666; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${voice.id}</div>
                </div>
            </div>
        `).join('');

        // 绑定点击事件
        container.querySelectorAll('.voice-item').forEach(item => {
            item.addEventListener('click', () => {
                const voiceId = item.dataset.voiceId;
                const voiceName = item.dataset.voiceName;
                this.selectVoice(voiceId, voiceName);
            });
        });

        if (filteredVoices.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #999; padding: 40px;">没有找到匹配的音色</div>';
        }
    },

    // 选择音色（仅更新UI）
    selectVoice: function(voiceId, voiceName) {
        this.selectedVoiceId = voiceId;
        
        // 更新选中状态
        document.querySelectorAll('.voice-item').forEach(item => {
            if (item.dataset.voiceId === voiceId) {
                item.classList.add('selected');
                item.style.background = '#e3f2fd';
            } else {
                item.classList.remove('selected');
                item.style.background = 'white';
            }
        });
    },

    // 确认选择
    confirmSelection: function() {
        const isUser = this.currentMode === 'user';
        const btnText = document.getElementById(isUser ? 'current-user-voice-name' : 'current-voice-name');
        if (!this.selectedVoiceId) {
            if (btnText) btnText.textContent = '选择音色';
            if (typeof currentChatId !== 'undefined' && currentChatId) {
                this.saveVoiceToChat(currentChatId, null, this.currentMode);
            }
            this.hideModal();
            showToast('已清除音色选择');
            return;
        }

        const voice = this.voices.find(v => v.id === this.selectedVoiceId);
        if (!voice) return;

        if (btnText) btnText.textContent = voice.name;
        if (typeof currentChatId !== 'undefined' && currentChatId) {
            this.saveVoiceToChat(currentChatId, this.selectedVoiceId, this.currentMode);
        }
        this.hideModal();
        showToast(`已选择：${voice.name}`);
    },

    // 保存到聊天配置。mode: 'char' | 'user'，voiceId 为 null 时表示清除
    saveVoiceToChat: async function(chatId, voiceId, mode) {
        try {
            if (typeof db === 'undefined' || !db.characters) return;
            const chat = db.characters.find(c => c.id === chatId);
            if (!chat) return;

            if (!chat.ttsConfig) chat.ttsConfig = {};
            const key = mode === 'user' ? 'userVoiceId' : 'voiceId';
            if (voiceId === null || voiceId === '') {
                delete chat.ttsConfig[key];
                console.log('[VoiceSelector] 已清除' + (mode === 'user' ? '用户' : '角色') + '音色配置');
            } else {
                chat.ttsConfig[key] = voiceId;
                console.log('[VoiceSelector] 音色已保存到' + (mode === 'user' ? '用户' : '角色') + '配置');
            }
            await saveData();
        } catch (err) {
            console.error('[VoiceSelector] 保存失败:', err);
        }
    },

    // 加载当前音色（按 currentMode 读角色或用户）
    loadCurrentVoice: function() {
        try {
            if (typeof currentChatId === 'undefined' || !currentChatId) return;
            const chat = db.characters.find(c => c.id === currentChatId);
            const key = this.currentMode === 'user' ? 'userVoiceId' : 'voiceId';
            this.selectedVoiceId = (chat && chat.ttsConfig && chat.ttsConfig[key]) ? chat.ttsConfig[key] : null;
            this.renderVoices();
        } catch (err) {
            console.error('[VoiceSelector] 加载当前音色失败:', err);
        }
    },

    // 搜索处理
    handleSearch: function(term) {
        this.renderVoices(term);
    },

    // 获取音色配置。mode 可选 'char' | 'user'，默认 'char'
    getVoiceConfig: function(chatId, mode) {
        try {
            if (typeof db === 'undefined' || !db.characters) return null;
            const chat = db.characters.find(c => c.id === chatId);
            if (!chat || !chat.ttsConfig) return null;

            const isUser = mode === 'user';
            const customKey = isUser ? 'userCustomVoiceId' : 'customVoiceId';
            const voiceKey = isUser ? 'userVoiceId' : 'voiceId';
            const langKey = isUser ? 'userLanguage' : 'language';

            const customVoiceId = chat.ttsConfig[customKey];
            if (customVoiceId && customVoiceId.trim()) {
                return {
                    voiceId: customVoiceId.trim(),
                    language: chat.ttsConfig[langKey] || 'auto'
                };
            }
            return {
                voiceId: chat.ttsConfig[voiceKey] || (isUser ? '' : 'female-shaonv'),
                language: chat.ttsConfig[langKey] || 'auto'
            };
        } catch (err) {
            console.error('[VoiceSelector] 获取配置失败:', err);
            return null;
        }
    }
};

// 导出全局变量
window.VoiceSelector = VoiceSelector;

// 页面加载时初始化
if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        VoiceSelector.init();
    });
}
