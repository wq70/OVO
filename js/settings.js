// --- 设置与管理逻辑 (js/settings.js) ---

function setupChatSettings() {
    const themeSelect = document.getElementById('setting-theme-color');
    themeSelect.innerHTML = '';
    Object.keys(colorThemes).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = colorThemes[key].name;
        themeSelect.appendChild(option);
    });
    
    document.getElementById('chat-settings-btn').addEventListener('click', () => {
        if (currentChatType === 'private') {
            loadSettingsToSidebar();
            switchScreen('chat-settings-screen');
        } else if (currentChatType === 'group') {
            loadGroupSettingsToSidebar();
            switchScreen('group-settings-screen');
        }
    });

    const moreSettingsBtn = document.getElementById('more-settings-btn');
    if (moreSettingsBtn) {
        moreSettingsBtn.addEventListener('click', () => {
            switchScreen('api-settings-screen');
        });
    }
    
    document.querySelector('.phone-screen').addEventListener('click', e => {
        const openSidebar = document.querySelector('.settings-sidebar.open');
        if (openSidebar && !openSidebar.contains(e.target) && !e.target.closest('.action-btn') && !e.target.closest('.modal-overlay') && !e.target.closest('.action-sheet-overlay')) {
            openSidebar.classList.remove('open');
        }
    });

    document.getElementById('chat-settings-form').addEventListener('submit', e => {
        e.preventDefault();
        saveSettingsFromSidebar();
    });

    // --- Tab 切换逻辑 ---
    // 仅选择聊天设置和群聊设置中的 Tab，排除 CoT 设置
    const tabs = document.querySelectorAll('#chat-settings-screen .settings-tab-item, #group-settings-screen .settings-tab-item');
    const contents = document.querySelectorAll('.settings-tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // 移除所有 active 类
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            // 添加当前 active 类
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-tab');
            if (targetId) {
                const targetEl = document.getElementById(targetId);
                if (targetEl) targetEl.classList.add('active');
            }
        });
    });
    
    const useCustomCssCheckbox = document.getElementById('setting-use-custom-css'),
        customCssTextarea = document.getElementById('setting-custom-bubble-css'),
        resetCustomCssBtn = document.getElementById('reset-custom-bubble-css-btn'),
        privatePreviewBox = document.getElementById('private-bubble-css-preview');
        
    useCustomCssCheckbox.addEventListener('change', (e) => {
        triggerHapticFeedback('light');
        customCssTextarea.disabled = !e.target.checked;
        const char = db.characters.find(c => c.id === currentChatId);
        if (char) {
            const themeKey = char.theme || 'white_pink';
            const theme = colorThemes[themeKey];
            updateBubbleCssPreview(privatePreviewBox, customCssTextarea.value, !e.target.checked, theme);
        }
    });
    
    customCssTextarea.addEventListener('input', (e) => {
        const char = db.characters.find(c => c.id === currentChatId);
        if (char && useCustomCssCheckbox.checked) {
            const themeKey = char.theme || 'white_pink';
            const theme = colorThemes[themeKey];
            updateBubbleCssPreview(privatePreviewBox, e.target.value, false, theme);
        }
    });
    
    resetCustomCssBtn.addEventListener('click', () => {
        const char = db.characters.find(c => c.id === currentChatId);
        if (char) {
            customCssTextarea.value = '';
            useCustomCssCheckbox.checked = false;
            customCssTextarea.disabled = true;
            const themeKey = char.theme || 'white_pink';
            const theme = colorThemes[themeKey];
            updateBubbleCssPreview(privatePreviewBox, '', true, theme);
            showToast('样式已重置为默认');
        }
    });
    
    document.getElementById('setting-char-avatar-upload').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                const compressedUrl = await compressImage(file, {quality: 0.8, maxWidth: 400, maxHeight: 400});
                document.getElementById('setting-char-avatar-preview').src = compressedUrl;
            } catch (error) {
                showToast('头像压缩失败，请重试');
            }
        }
    });
    
    document.getElementById('setting-my-avatar-upload').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                const compressedUrl = await compressImage(file, {quality: 0.8, maxWidth: 400, maxHeight: 400});
                document.getElementById('setting-my-avatar-preview').src = compressedUrl;
            } catch (error) {
                showToast('头像压缩失败，请重试');
            }
        }
    });
    
    document.getElementById('setting-chat-bg-upload').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            const char = db.characters.find(c => c.id === currentChatId);
            if (char) {
                try {
                    const compressedUrl = await compressImage(file, {
                        quality: 0.85,
                        maxWidth: 1080,
                        maxHeight: 1920
                    });
                    char.chatBg = compressedUrl;
                    chatRoomScreen.style.backgroundImage = `url(${compressedUrl})`;
                    await saveData();
                    showToast('聊天背景已更换');
                } catch (error) {
                    showToast('背景压缩失败，请重试');
                }
            }
        }
    });
    
    document.getElementById('clear-chat-history-btn').addEventListener('click', async () => {
        const character = db.characters.find(c => c.id === currentChatId);
        if (!character) return;
        if (confirm(`你确定要清空与“${character.remarkName}”的所有聊天记录吗？这个操作是不可恢复的！`)) {
            character.history = [];
            character.status = '在线'; 
            await saveData();
            renderMessages(false, true);
            renderChatList();
            if (currentChatId === character.id) {
                document.getElementById('chat-room-status-text').textContent = '在线';
            }
            showToast('聊天记录已清空');
        }
    });
    
    document.getElementById('link-world-book-btn').addEventListener('click', () => {
        const globalIds = (db.worldBooks || []).filter(wb => wb.isGlobal && !wb.disabled).map(wb => wb.id);
        let displayIds = [];
        if (currentChatType === 'private') {
            const character = db.characters.find(c => c.id === currentChatId);
            if (!character) return;
            displayIds = [...new Set([...(character.worldBookIds || []), ...globalIds])];
        } else if (currentChatType === 'group') {
            const group = db.groups.find(g => g.id === currentChatId);
            if (!group) return;
            displayIds = [...new Set([...(group.worldBookIds || []), ...globalIds])];
        }
        renderCategorizedWorldBookList(document.getElementById('world-book-selection-list'), db.worldBooks, displayIds, 'wb-select');
        document.getElementById('world-book-selection-modal').classList.add('visible');
    });

    document.getElementById('save-world-book-selection-btn').addEventListener('click', async () => {
        const globalIds = (db.worldBooks || []).filter(wb => wb.isGlobal && !wb.disabled).map(wb => wb.id);
        const selectedIds = Array.from(document.getElementById('world-book-selection-list').querySelectorAll('.item-checkbox:checked')).map(input => input.value);
        const toSave = selectedIds.filter(id => !globalIds.includes(id));
        if (currentChatType === 'private') {
            const character = db.characters.find(c => c.id === currentChatId);
            if (character) character.worldBookIds = toSave;
        } else if (currentChatType === 'group') {
            const group = db.groups.find(g => g.id === currentChatId);
            if (group) group.worldBookIds = toSave;
        }
        await saveData();
        document.getElementById('world-book-selection-modal').classList.remove('visible');
        showToast('世界书关联已更新');
    });

    const statusPanelSwitch = document.getElementById('setting-status-panel-enabled');
    if (statusPanelSwitch) {
        statusPanelSwitch.addEventListener('change', (e) => {
            triggerHapticFeedback('light');
            const container = document.getElementById('status-panel-settings-container');
            if (container) {
                if (e.target.checked) {
                    container.style.maxHeight = '5000px';
                    container.style.paddingBottom = '20px';
                } else {
                    container.style.maxHeight = '0';
                    container.style.paddingBottom = '0';
                }
            }
        });
    }

    const replyCountSwitch = document.getElementById('setting-reply-count-enabled');
    if (replyCountSwitch) {
        replyCountSwitch.addEventListener('change', (e) => {
            triggerHapticFeedback('light');
            const container = document.getElementById('setting-reply-count-container');
            if (container) {
                container.style.display = e.target.checked ? 'flex' : 'none';
            }
        });
    }

    const autoJournalSwitch = document.getElementById('setting-auto-journal-enabled');
    if (autoJournalSwitch) {
        autoJournalSwitch.addEventListener('change', (e) => {
            triggerHapticFeedback('light');
            const container = document.getElementById('setting-auto-journal-interval-container');
            if (container) {
                container.style.display = e.target.checked ? 'flex' : 'none';
            }
        });
    }

    const syncGroupMemorySwitch = document.getElementById('setting-sync-group-memory');
    if (syncGroupMemorySwitch) {
        syncGroupMemorySwitch.addEventListener('change', (e) => {
            triggerHapticFeedback('light');
            const historyContainer = document.getElementById('setting-group-memory-container');
            const summaryContainer = document.getElementById('setting-group-summary-container');
            const syncGroupListContainer = document.getElementById('setting-sync-group-list');
            if (historyContainer) {
                historyContainer.style.display = e.target.checked ? 'flex' : 'none';
            }
            if (summaryContainer) {
                summaryContainer.style.display = e.target.checked ? 'flex' : 'none';
            }
            if (syncGroupListContainer) {
                syncGroupListContainer.style.display = e.target.checked ? 'block' : 'none';
                // 如果开关打开，渲染群聊列表
                if (e.target.checked) {
                    const character = db.characters.find(c => c.id === currentChatId);
                    if (character) {
                        renderSyncGroupList(character);
                    }
                }
            }
        });
    }
}

function renderSyncGroupList(character) {
    const syncGroupListContainer = document.getElementById('setting-sync-group-list');
    if (!syncGroupListContainer) {
        console.warn('setting-sync-group-list container not found');
        return;
    }
    
    // 如果角色不存在，清空并隐藏
    if (!character) {
        syncGroupListContainer.innerHTML = '';
        syncGroupListContainer.style.display = 'none';
        return;
    }
    
    // 如果开关未打开，清空内容但保持容器存在（显示状态由调用者控制）
    if (!character.syncGroupMemory) {
        syncGroupListContainer.innerHTML = '';
        return;
    }
    
    // 确保容器显示
    syncGroupListContainer.style.display = 'block';
    syncGroupListContainer.innerHTML = '';
    
    // 获取角色所在的所有群聊
    const groupsWithCharacter = db.groups.filter(group => 
        group.members && group.members.some(member => member.originalCharId === character.id)
    );
    
    if (groupsWithCharacter.length === 0) {
        syncGroupListContainer.innerHTML = '<div style="padding: 10px; color: #999; font-size: 12px;">该角色未加入任何群聊</div>';
    } else {
        // 添加标题
        const title = document.createElement('div');
        title.style.fontSize = '13px';
        title.style.color = '#666';
        title.style.marginBottom = '10px';
        title.style.fontWeight = '500';
        title.textContent = '选择要互通的群聊：';
        syncGroupListContainer.appendChild(title);
        
        const syncGroupIds = character.syncGroupIds || [];
        groupsWithCharacter.forEach(group => {
            const checkbox = document.createElement('label');
            checkbox.style.display = 'flex';
            checkbox.style.alignItems = 'center';
            checkbox.style.padding = '8px 0';
            checkbox.style.cursor = 'pointer';
            checkbox.style.userSelect = 'none';
            
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.value = group.id;
            input.checked = syncGroupIds.includes(group.id);
            input.style.marginRight = '10px';
            input.style.width = '18px';
            input.style.height = '18px';
            input.style.cursor = 'pointer';
            
            const label = document.createElement('span');
            label.textContent = group.name || '未命名群聊';
            label.style.fontSize = '14px';
            label.style.color = '#333';
            label.style.flex = '1';
            
            checkbox.appendChild(input);
            checkbox.appendChild(label);
            syncGroupListContainer.appendChild(checkbox);
        });
    }
}

function loadSettingsToSidebar() {
    const e = db.characters.find(e => e.id === currentChatId);
    if (e) {
        document.getElementById('setting-char-avatar-preview').src = e.avatar;
        const nameDisplay = document.getElementById('setting-char-name-display');
        if(nameDisplay) nameDisplay.textContent = e.remarkName;
        const realNameEl = document.getElementById('setting-char-real-name');
        if (realNameEl) realNameEl.value = e.realName || '';
        document.getElementById('setting-char-remark').value = e.remarkName;
        document.getElementById('setting-char-persona').value = e.persona;
        
        if (e.source === 'forum' && db.forumUserProfile) {
            const fp = db.forumUserProfile;
            const defaultAvatar = (fp.avatar && fp.avatar.trim()) ? fp.avatar : 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg';
            document.getElementById('setting-my-avatar-preview').src = (e.myAvatar && e.myAvatar.trim()) ? e.myAvatar : defaultAvatar;
            document.getElementById('setting-my-name').value = (e.myName && String(e.myName).trim()) ? e.myName : (fp.username || '用户');
            document.getElementById('setting-my-persona').value = (e.myPersona && String(e.myPersona).trim()) ? e.myPersona : (fp.bio || '');
        }
        
        const forumSupplementContainer = document.getElementById('setting-forum-supplement-container');
        if (forumSupplementContainer) {
            if (e.source === 'forum') {
                forumSupplementContainer.style.display = 'block';
                const supplementCb = document.getElementById('setting-forum-supplement-persona-enabled');
                const supplementAiCb = document.getElementById('setting-forum-supplement-persona-ai-enabled');
                const supplementTextEl = document.getElementById('setting-forum-supplement-persona-text');
                var manualOn = !!e.supplementPersonaEnabled;
                var aiOn = !!e.supplementPersonaAiEnabled;
                if (manualOn && aiOn) {
                    aiOn = false;
                    e.supplementPersonaAiEnabled = false;
                }
                if (supplementCb) supplementCb.checked = manualOn;
                if (supplementAiCb) supplementAiCb.checked = aiOn;
                if (supplementTextEl) {
                    supplementTextEl.value = e.supplementPersonaText || '';
                    supplementTextEl.style.display = (manualOn || aiOn) ? 'block' : 'none';
                }
                function updateSupplementTextareaVisibility() {
                    if (supplementTextEl) supplementTextEl.style.display = (supplementCb && supplementCb.checked) || (supplementAiCb && supplementAiCb.checked) ? 'block' : 'none';
                }
                if (supplementCb) supplementCb.onchange = function() {
                    if (supplementCb.checked && supplementAiCb) { supplementAiCb.checked = false; }
                    updateSupplementTextareaVisibility();
                };
                if (supplementAiCb) supplementAiCb.onchange = function() {
                    if (supplementAiCb.checked && supplementCb) { supplementCb.checked = false; }
                    updateSupplementTextareaVisibility();
                };
            } else {
                forumSupplementContainer.style.display = 'none';
            }
        }
        
        const stickerGroupsContainer = document.getElementById('setting-char-sticker-groups-container');
        stickerGroupsContainer.innerHTML = '';
        
        const allGroups = [...new Set(db.myStickers.map(s => s.group || '未分类'))].filter(g => g);
        const charGroups = (e.stickerGroups || '').split(/[,，]/).map(s => s.trim());

        if (allGroups.length === 0) {
            stickerGroupsContainer.innerHTML = '<span style="color:#999; font-size:12px;">暂无表情包分组，请先在表情包管理中添加。</span>';
        } else {
            allGroups.forEach(group => {
                const tag = document.createElement('div');
                tag.className = 'sticker-group-tag';
                if (charGroups.includes(group)) {
                    tag.classList.add('selected');
                }
                tag.textContent = group;
                tag.dataset.group = group;
                
                tag.addEventListener('click', () => {
                    tag.classList.toggle('selected');
                });
                
                stickerGroupsContainer.appendChild(tag);
            });
        }
        
        if (e.source !== 'forum') {
            document.getElementById('setting-my-avatar-preview').src = e.myAvatar || 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg';
            document.getElementById('setting-my-name').value = e.myName || '';
            document.getElementById('setting-my-persona').value = e.myPersona || '';
        }
        document.getElementById('setting-theme-color').value = e.theme || 'white_pink';
        document.getElementById('setting-max-memory').value = e.maxMemory;
        document.getElementById('setting-sync-group-memory').checked = e.syncGroupMemory || false;
        
        // 群聊记忆互通相关设置
        const groupMemoryHistoryCount = e.groupMemoryHistoryCount !== undefined ? e.groupMemoryHistoryCount : 20;
        const groupMemorySummaryCount = e.groupMemorySummaryCount !== undefined ? e.groupMemorySummaryCount : 0;
        document.getElementById('setting-group-memory-history-count').value = groupMemoryHistoryCount;
        document.getElementById('setting-group-memory-summary-count').value = groupMemorySummaryCount;
        
        // 根据开关状态显示/隐藏设置项
        const historyContainer = document.getElementById('setting-group-memory-container');
        const summaryContainer = document.getElementById('setting-group-summary-container');
        const syncGroupListContainer = document.getElementById('setting-sync-group-list');
        
        if (historyContainer) {
            historyContainer.style.display = e.syncGroupMemory ? 'flex' : 'none';
        }
        if (summaryContainer) {
            summaryContainer.style.display = e.syncGroupMemory ? 'flex' : 'none';
        }
        
        // 渲染群聊选择列表（函数内部会根据开关状态控制显示）
        renderSyncGroupList(e);
        
        // 确保容器显示状态正确（在渲染后再次确认）
        if (syncGroupListContainer) {
            syncGroupListContainer.style.display = e.syncGroupMemory ? 'block' : 'none';
        }
        
        document.getElementById('setting-reply-count-enabled').checked = e.replyCountEnabled || false;
        const replyCountContainer = document.getElementById('setting-reply-count-container');
        if (replyCountContainer) {
            replyCountContainer.style.display = e.replyCountEnabled ? 'flex' : 'none';
        }
        document.getElementById('setting-reply-count-min').value = e.replyCountMin || 3;
        document.getElementById('setting-reply-count-max').value = e.replyCountMax || 8;

        const stickerSmartMatchEl = document.getElementById('setting-sticker-smart-match');
        if (stickerSmartMatchEl) stickerSmartMatchEl.checked = e.stickerSmartMatchEnabled || false;

        document.getElementById('setting-auto-journal-enabled').checked = e.autoJournalEnabled || false;
        const autoJournalIntervalContainer = document.getElementById('setting-auto-journal-interval-container');
        if (autoJournalIntervalContainer) {
            autoJournalIntervalContainer.style.display = e.autoJournalEnabled ? 'flex' : 'none';
        }
        document.getElementById('setting-auto-journal-interval').value = e.autoJournalInterval || 100;

        const charAutoFavEl = document.getElementById('setting-char-auto-favorite');
        if (charAutoFavEl) charAutoFavEl.checked = e.characterAutoFavoriteEnabled || false;

        document.getElementById('setting-bilingual-mode').checked = e.bilingualModeEnabled || false;
        document.getElementById('setting-bilingual-style').value = e.bilingualBubbleStyle || 'under';
        
        document.getElementById('setting-avatar-mode').value = e.avatarMode || 'full';
        const avatarRadius = e.avatarRadius !== undefined ? e.avatarRadius : 50;
        document.getElementById('setting-avatar-radius').value = avatarRadius;
        document.getElementById('setting-avatar-radius-value').textContent = `${avatarRadius}%`;
        
        const radiusSlider = document.getElementById('setting-avatar-radius');
        const radiusValue = document.getElementById('setting-avatar-radius-value');
        radiusSlider.oninput = () => {
            radiusValue.textContent = `${radiusSlider.value}%`;
        };

        document.getElementById('setting-bubble-blur').checked = e.bubbleBlurEnabled !== false; 

        document.getElementById('setting-title-layout').value = e.titleLayout || 'left';
        document.getElementById('setting-show-timestamp').checked = e.showTimestamp || false;
        document.getElementById('setting-timestamp-style').value = e.timestampStyle || 'bubble';
        document.getElementById('setting-show-status').checked = e.showStatus !== false;
        document.getElementById('setting-show-status-update-msg').checked = e.showStatusUpdateMsg || false;

        const sp = e.statusPanel || {};
        document.getElementById('setting-status-panel-enabled').checked = sp.enabled || false;
        document.getElementById('setting-status-prompt-suffix').value = sp.promptSuffix || '';
        document.getElementById('setting-status-regex').value = sp.regexPattern || '';
        document.getElementById('setting-status-replace').value = sp.replacePattern || '';
        document.getElementById('setting-status-history-limit').value = sp.historyLimit !== undefined ? sp.historyLimit : 3;
        
        const statusPanelContainer = document.getElementById('status-panel-settings-container');
        if (statusPanelContainer) {
            if (sp.enabled) {
                statusPanelContainer.style.maxHeight = '5000px';
                statusPanelContainer.style.paddingBottom = '20px';
            } else {
                statusPanelContainer.style.maxHeight = '0';
                statusPanelContainer.style.paddingBottom = '0';
            }
        }

        document.getElementById('setting-shop-interaction-enabled').checked = e.shopInteractionEnabled !== false;

        document.getElementById('setting-video-call-enabled').checked = e.videoCallEnabled || false;

        const ar = e.autoReply || {};
        document.getElementById('setting-auto-reply-enabled').checked = ar.enabled || false;
        document.getElementById('setting-auto-reply-interval').value = ar.interval || 60;

        document.getElementById('setting-use-real-gallery').checked = e.useRealGallery || false;

        // === 加载 TTS 配置 ===
        if (typeof TTSSettings !== 'undefined' && TTSSettings.loadChatTTSConfig) {
            TTSSettings.loadChatTTSConfig(currentChatId);
        }

        const useCustomCssCheckbox = document.getElementById('setting-use-custom-css'),
            customCssTextarea = document.getElementById('setting-custom-bubble-css'),
            privatePreviewBox = document.getElementById('private-bubble-css-preview');
        useCustomCssCheckbox.checked = e.useCustomBubbleCss || false;
        customCssTextarea.value = e.customBubbleCss || '';
        customCssTextarea.disabled = !useCustomCssCheckbox.checked;
        const theme = colorThemes[e.theme || 'white_pink'];
        updateBubbleCssPreview(privatePreviewBox, e.customBubbleCss, !e.useCustomBubbleCss, theme);
        populateBubblePresetSelect('bubble-preset-select');
        populateMyPersonaSelect();
        if (typeof populateStatusBarPresetSelect === 'function') {
            populateStatusBarPresetSelect();
        }
    }
}

async function saveSettingsFromSidebar() {
    const e = db.characters.find(e => e.id === currentChatId);
    if (e) {
        e.avatar = document.getElementById('setting-char-avatar-preview').src;
        const realNameInput = document.getElementById('setting-char-real-name');
        if (realNameInput) e.realName = (realNameInput.value || '').trim();
        e.remarkName = document.getElementById('setting-char-remark').value;
        e.persona = document.getElementById('setting-char-persona').value;
        
        if (e.source === 'forum') {
            const supplementEnabledEl = document.getElementById('setting-forum-supplement-persona-enabled');
            const supplementAiEl = document.getElementById('setting-forum-supplement-persona-ai-enabled');
            const supplementTextEl = document.getElementById('setting-forum-supplement-persona-text');
            if (supplementEnabledEl) e.supplementPersonaEnabled = supplementEnabledEl.checked;
            if (supplementAiEl) e.supplementPersonaAiEnabled = supplementAiEl.checked;
            if (supplementTextEl) e.supplementPersonaText = supplementTextEl.value || '';
        }
        
        const selectedGroups = Array.from(document.querySelectorAll('#setting-char-sticker-groups-container .sticker-group-tag.selected'))
            .map(tag => tag.dataset.group)
            .join(',');
        e.stickerGroups = selectedGroups;

        e.myAvatar = document.getElementById('setting-my-avatar-preview').src;
        e.myName = document.getElementById('setting-my-name').value;
        e.myPersona = document.getElementById('setting-my-persona').value;
        e.theme = document.getElementById('setting-theme-color').value;
        e.maxMemory = document.getElementById('setting-max-memory').value;
        e.syncGroupMemory = document.getElementById('setting-sync-group-memory').checked;
        e.groupMemoryHistoryCount = parseInt(document.getElementById('setting-group-memory-history-count').value, 10) || 20;
        e.groupMemorySummaryCount = parseInt(document.getElementById('setting-group-memory-summary-count').value, 10) || 0;
        
        // 保存选中的群聊ID列表
        const syncGroupListContainer = document.getElementById('setting-sync-group-list');
        if (syncGroupListContainer && e.syncGroupMemory) {
            const selectedCheckboxes = syncGroupListContainer.querySelectorAll('input[type="checkbox"]:checked');
            e.syncGroupIds = Array.from(selectedCheckboxes).map(cb => cb.value);
        } else {
            e.syncGroupIds = [];
        }

        e.replyCountEnabled = document.getElementById('setting-reply-count-enabled').checked;
        e.replyCountMin = parseInt(document.getElementById('setting-reply-count-min').value, 10) || 3;
        e.replyCountMax = parseInt(document.getElementById('setting-reply-count-max').value, 10) || 8;
        const stickerSmartMatchCb = document.getElementById('setting-sticker-smart-match');
        e.stickerSmartMatchEnabled = stickerSmartMatchCb ? stickerSmartMatchCb.checked : false;
        e.autoJournalEnabled = document.getElementById('setting-auto-journal-enabled').checked;
        const autoJournalIntervalInput = parseInt(document.getElementById('setting-auto-journal-interval').value, 10);
        e.autoJournalInterval = (isNaN(autoJournalIntervalInput) || autoJournalIntervalInput < 10) ? 100 : autoJournalIntervalInput;
        const charAutoFavEl = document.getElementById('setting-char-auto-favorite');
        e.characterAutoFavoriteEnabled = charAutoFavEl ? charAutoFavEl.checked : false;
        e.useCustomBubbleCss = document.getElementById('setting-use-custom-css').checked;
        e.customBubbleCss = document.getElementById('setting-custom-bubble-css').value;
        e.bilingualModeEnabled = document.getElementById('setting-bilingual-mode').checked;
        e.bilingualBubbleStyle = document.getElementById('setting-bilingual-style').value;
        
        e.avatarMode = document.getElementById('setting-avatar-mode').value;
        e.avatarRadius = parseInt(document.getElementById('setting-avatar-radius').value, 10);

        e.bubbleBlurEnabled = document.getElementById('setting-bubble-blur').checked;
        const chatScreen = document.getElementById('chat-room-screen');
        if (e.bubbleBlurEnabled) {
            chatScreen.classList.remove('disable-blur');
        } else {
            chatScreen.classList.add('disable-blur');
        }

        e.titleLayout = document.getElementById('setting-title-layout').value;
        const header = document.getElementById('chat-room-header-default');
        if (e.titleLayout === 'center') {
            header.classList.add('title-centered');
        } else {
            header.classList.remove('title-centered');
        }

        e.showTimestamp = document.getElementById('setting-show-timestamp').checked;
        
        if (e.showTimestamp) {
            chatScreen.classList.add('show-timestamp');
        } else {
            chatScreen.classList.remove('show-timestamp');
        }
        chatScreen.classList.remove('timestamp-side');

        e.timestampStyle = document.getElementById('setting-timestamp-style').value;
        chatScreen.classList.remove('timestamp-style-bubble', 'timestamp-style-avatar');
        chatScreen.classList.add(`timestamp-style-${e.timestampStyle || 'bubble'}`);

        e.showStatus = document.getElementById('setting-show-status').checked;
        const subtitle = document.getElementById('chat-room-subtitle');
        if (subtitle) {
            subtitle.style.display = e.showStatus ? 'flex' : 'none';
        }

        e.showStatusUpdateMsg = document.getElementById('setting-show-status-update-msg').checked;

        if (!e.statusPanel) e.statusPanel = {};
        e.statusPanel.enabled = document.getElementById('setting-status-panel-enabled').checked;
        e.statusPanel.promptSuffix = document.getElementById('setting-status-prompt-suffix').value;
        e.statusPanel.regexPattern = document.getElementById('setting-status-regex').value;
        e.statusPanel.replacePattern = document.getElementById('setting-status-replace').value;
        const historyLimitInput = parseInt(document.getElementById('setting-status-history-limit').value, 10);
        e.statusPanel.historyLimit = isNaN(historyLimitInput) ? 3 : historyLimitInput;

        e.shopInteractionEnabled = document.getElementById('setting-shop-interaction-enabled').checked;

        e.videoCallEnabled = document.getElementById('setting-video-call-enabled').checked;

        if (!e.autoReply) e.autoReply = {};
        e.autoReply.enabled = document.getElementById('setting-auto-reply-enabled').checked;
        const autoReplyIntervalInput = parseInt(document.getElementById('setting-auto-reply-interval').value, 10);
        e.autoReply.interval = isNaN(autoReplyIntervalInput) ? 60 : autoReplyIntervalInput;

        e.useRealGallery = document.getElementById('setting-use-real-gallery').checked;

        await saveData();
        showToast('设置已保存！');
        chatRoomTitle.textContent = e.remarkName;
        renderChatList();
        // updateCustomBubbleStyle(currentChatId, e.customBubbleCss, e.useCustomBubbleCss); // 移除实时应用以防污染设置页
        currentPage = 1;
        renderMessages(false, true);
    }
}

function setupApiSettingsApp() {
    const e = document.getElementById('api-form'), t = document.getElementById('fetch-models-btn'),
        a = document.getElementById('api-model'), n = document.getElementById('api-provider'),
        r = document.getElementById('api-url'), s = document.getElementById('api-key'), c = {
            newapi: '',
            deepseek: 'https://api.deepseek.com',
            claude: 'https://api.anthropic.com',
            gemini: 'https://generativelanguage.googleapis.com'
        };
    db.apiSettings && (n.value = db.apiSettings.provider || 'newapi', r.value = db.apiSettings.url || '', s.value = db.apiSettings.key || '', db.apiSettings.model && (a.innerHTML = `<option value="${db.apiSettings.model}">${db.apiSettings.model}</option>`));
    if (db.apiSettings && typeof db.apiSettings.timePerceptionEnabled !== 'undefined') { document.getElementById('time-perception-switch').checked = db.apiSettings.timePerceptionEnabled; }
    if (db.apiSettings && typeof db.apiSettings.streamEnabled !== 'undefined') { document.getElementById('stream-switch').checked = db.apiSettings.streamEnabled; } else { document.getElementById('stream-switch').checked = true; } 

    const tempSlider = document.getElementById('temperature-slider');
    const tempValue = document.getElementById('temperature-value');
    if (tempSlider && tempValue) {
        const savedTemp = (db.apiSettings && db.apiSettings.temperature !== undefined) ? db.apiSettings.temperature : 1.0;
        tempSlider.value = savedTemp;
        tempValue.textContent = savedTemp;

        tempSlider.addEventListener('input', (e) => {
            tempValue.textContent = e.target.value;
        });
    }

    populateApiSelect();
    n.addEventListener('change', () => {
        r.value = c[n.value] || ''
    });

    // 提取为全局函数以便复用
    window.fetchAndPopulateModels = async (showToastFlag = true) => {
        const provider = n.value;
        let apiUrl = r.value.trim();
        const apiKey = s.value.trim();
        const modelSelect = a;
        const fetchBtn = t;

        if (!apiUrl || !apiKey) {
            if (showToastFlag) showToast('请先填写API地址和密钥！');
            return;
        }

        if (BLOCKED_API_DOMAINS.some(domain => apiUrl.includes(domain))) {
            if (showToastFlag) showToast('该 API 站点已被屏蔽，无法使用！');
            return;
        }

        if (apiUrl.endsWith('/')) apiUrl = apiUrl.slice(0, -1);
        
        const endpoint = provider === 'gemini' 
            ? `${apiUrl}/v1beta/models?key=${getRandomValue(apiKey)}` 
            : `${apiUrl}/v1/models`;

        if (fetchBtn) {
            fetchBtn.classList.add('loading');
            fetchBtn.disabled = true;
        }

        try {
            const headers = provider === 'gemini' ? {} : { Authorization: `Bearer ${apiKey}` };
            const response = await fetch(endpoint, { method: 'GET', headers });
            
            if (!response.ok) {
                const error = new Error(`网络响应错误: ${response.status}`);
                error.response = response;
                throw error;
            }

            const data = await response.json();
            let models = [];
            
            if (provider !== 'gemini' && data.data) {
                models = data.data.map(e => e.id);
            } else if (provider === 'gemini' && data.models) {
                models = data.models.map(e => e.name.replace('models/', ''));
            }

            // 保留当前选中的值（如果仍在列表中）
            const currentVal = modelSelect.value;
            
            modelSelect.innerHTML = '';
            if (models.length > 0) {
                models.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m;
                    opt.textContent = m;
                    modelSelect.appendChild(opt);
                });
                
                // 尝试恢复之前的选择，或者使用设置中的值
                if (models.includes(currentVal)) {
                    modelSelect.value = currentVal;
                } else if (db.apiSettings && db.apiSettings.model && models.includes(db.apiSettings.model)) {
                    modelSelect.value = db.apiSettings.model;
                }
                
                if (showToastFlag) showToast('模型列表拉取成功！');
            } else {
                modelSelect.innerHTML = '<option value="">未找到任何模型</option>';
                if (showToastFlag) showToast('未找到任何模型');
            }
        } catch (err) {
            console.error(err);
            if (showToastFlag) {
                showApiError(err);
                modelSelect.innerHTML = '<option value="">拉取失败</option>';
            }
        } finally {
            if (fetchBtn) {
                fetchBtn.classList.remove('loading');
                fetchBtn.disabled = false;
            }
        }
    };

    t.addEventListener('click', () => window.fetchAndPopulateModels(true));
    e.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!a.value) return showToast('请选择模型后保存！');
        if (BLOCKED_API_DOMAINS.some(domain => r.value.includes(domain))) {
            return showToast('该 API 站点已被屏蔽，无法保存！');
        }
        db.apiSettings = {
            provider: n.value,
            url: r.value,
            key: s.value,
            model: a.value,
            timePerceptionEnabled: document.getElementById('time-perception-switch').checked,
            streamEnabled: document.getElementById('stream-switch').checked, 
            temperature: parseFloat(document.getElementById('temperature-slider').value)
        };
        await saveData();
        showToast('API设置已保存！')
    })
    
    // === 副API设置：总结API ===
    setupSubApiSettings('summary', 'summaryApiSettings', 'summaryApiPresets');
    
    // === 副API设置：后台活动API ===
    setupSubApiSettings('background', 'backgroundApiSettings', 'backgroundApiPresets');
    
    // === 副API设置：补齐人设API ===
    setupSubApiSettings('supplementPersona', 'supplementPersonaApiSettings', 'supplementPersonaApiPresets');
}

// --- 预设管理 ---
function _getApiPresets() {
    return db.apiPresets || [];
}
function _saveApiPresets(arr) {
    db.apiPresets = arr || [];
    saveData();
}

function populateApiSelect() {
    const sel = document.getElementById('api-preset-select');
    if (!sel) return;
    const presets = _getApiPresets();
    sel.innerHTML = '<option value="">— 选择 API 预设 —</option>';
    presets.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    sel.appendChild(opt);
    });
}

function saveCurrentApiAsPreset() {
    const apiKeyEl = document.querySelector('#api-key');
    const apiUrlEl = document.querySelector('#api-url');
    const providerEl = document.querySelector('#api-provider');
    const modelEl = document.querySelector('#api-model');

    const data = {
        apiKey: apiKeyEl ? apiKeyEl.value : '',
        apiUrl: apiUrlEl ? apiUrlEl.value : '',
        provider: providerEl ? providerEl.value : '',
        model: modelEl ? modelEl.value : ''
    };
    
    let name = prompt('为该 API 预设填写名称（会覆盖同名预设）：');
    if (!name) return;
    const presets = _getApiPresets();
    const idx = presets.findIndex(p => p.name === name);
    const preset = {name: name, data: data};
    if (idx >= 0) presets[idx] = preset; else presets.push(preset);
    _saveApiPresets(presets);
    populateApiSelect();
    showToast('API 预设已保存');
}

async function applyApiPreset(name) {
    const presets = _getApiPresets();
    const p = presets.find(x => x.name === name);
    if (!p) return showToast('未找到该预设');
    try {
        const apiKeyEl = document.querySelector('#api-key');
        const apiUrlEl = document.querySelector('#api-url');
        const providerEl = document.querySelector('#api-provider');
        const modelEl = document.querySelector('#api-model');

        if (apiKeyEl && p.data && typeof p.data.apiKey !== 'undefined') apiKeyEl.value = p.data.apiKey;
        if (apiUrlEl && p.data && typeof p.data.apiUrl !== 'undefined') apiUrlEl.value = p.data.apiUrl;
        if (providerEl && p.data && typeof p.data.provider !== 'undefined') providerEl.value = p.data.provider;
        if (modelEl && p.data && typeof p.data.model !== 'undefined') {
            modelEl.innerHTML = `<option value="${p.data.model}">${p.data.model}</option>`;
            modelEl.value = p.data.model;
        }

        showToast('已应用 API 预设');
    } catch(e) {
        console.error('applyApiPreset error', e);
    }
}

function openApiManageModal() {
    const modal = document.getElementById('api-presets-modal');
    const list = document.getElementById('api-presets-list');
    if (!modal || !list) return;
    list.innerHTML = '';
    const presets = _getApiPresets();
    if (!presets.length) {
        list.innerHTML = '<p style="color:#888;margin:6px 0;">暂无预设</p>';
    }
    presets.forEach((p, idx) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '8px 6px';
        row.style.borderBottom = '1px solid #f6f6f6';

        const left = document.createElement('div');
        left.style.flex = '1';
        left.style.minWidth = '0';
        left.innerHTML = '<div style="font-weight:600;">'+p.name+'</div><div style="font-size:12px;color:#666;margin-top:4px;">' + (p.data && p.data.provider ? ('提供者：'+p.data.provider) : '') + '</div>';

        const btns = document.createElement('div');
        btns.style.display = 'flex';
        btns.style.gap = '6px';

        const applyBtn = document.createElement('button');
        applyBtn.className = 'btn';
        applyBtn.textContent = '应用';
        applyBtn.onclick = function(){ applyApiPreset(p.name); modal.style.display='none'; };

        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn';
        renameBtn.textContent = '重命名';
        renameBtn.onclick = function(){
            const newName = prompt('输入新名称：', p.name);
            if (!newName) return;
            const all = _getApiPresets();
            all[idx].name = newName;
            _saveApiPresets(all);
            openApiManageModal();
            populateApiSelect();
        };

        const delBtn = document.createElement('button');
        delBtn.className = 'btn';
        delBtn.textContent = '删除';
        delBtn.onclick = function(){ if(!confirm('确定删除 "'+p.name+'" ?')) return; const all=_getApiPresets(); all.splice(idx,1); _saveApiPresets(all); openApiManageModal(); populateApiSelect(); };

        btns.appendChild(applyBtn); btns.appendChild(renameBtn); btns.appendChild(delBtn);

        row.appendChild(left); row.appendChild(btns);
        list.appendChild(row);
    });
    modal.style.display = 'flex';
}

function exportApiPresets() {
    const presets = _getApiPresets();
    const blob = new Blob([JSON.stringify(presets, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'api_presets.json'; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
}
function importApiPresets() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json';
    inp.onchange = function(e){
        const f = e.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = function(){ try { const data = JSON.parse(r.result); if (Array.isArray(data)) { _saveApiPresets(data); populateApiSelect(); openApiManageModal(); } else alert('文件格式不正确'); } catch(e){ alert('导入失败：'+e.message); } };
        r.readAsText(f);
    };
    inp.click();
}

// === 副API通用设置函数 ===
var subApiDisplayNames = { summary: '总结', background: '后台活动', supplementPersona: '补齐人设' };
function setupSubApiSettings(prefix, dbKey, presetsKey) {
    const displayName = subApiDisplayNames[prefix] || prefix;
    const providerEl = document.getElementById(`${prefix}-api-provider`);
    const urlEl = document.getElementById(`${prefix}-api-url`);
    const keyEl = document.getElementById(`${prefix}-api-key`);
    const modelEl = document.getElementById(`${prefix}-api-model`);
    const fetchBtn = document.getElementById(`${prefix}-fetch-models-btn`);
    const saveBtn = document.getElementById(`${prefix}-api-save-btn`);
    
    const providerUrls = {
        newapi: '',
        deepseek: 'https://api.deepseek.com',
        claude: 'https://api.anthropic.com',
        gemini: 'https://generativelanguage.googleapis.com'
    };
    
    // 加载保存的设置
    if (db[dbKey]) {
        providerEl.value = db[dbKey].provider || 'newapi';
        urlEl.value = db[dbKey].url || '';
        keyEl.value = db[dbKey].key || '';
        if (db[dbKey].model) {
            modelEl.innerHTML = `<option value="${db[dbKey].model}">${db[dbKey].model}</option>`;
        }
    }
    
    // 服务商切换时自动填充URL
    providerEl.addEventListener('change', () => {
        urlEl.value = providerUrls[providerEl.value] || '';
    });
    
    // 拉取模型列表
    fetchBtn.addEventListener('click', async () => {
        const provider = providerEl.value;
        let apiUrl = urlEl.value.trim();
        const apiKey = keyEl.value.trim();
        
        if (!apiUrl || !apiKey) {
            showToast('请先填写API地址和密钥！');
            return;
        }
        
        if (BLOCKED_API_DOMAINS.some(domain => apiUrl.includes(domain))) {
            showToast('该 API 站点已被屏蔽，无法使用！');
            return;
        }
        
        if (apiUrl.endsWith('/')) apiUrl = apiUrl.slice(0, -1);
        
        const endpoint = provider === 'gemini' 
            ? `${apiUrl}/v1beta/models?key=${getRandomValue(apiKey)}` 
            : `${apiUrl}/v1/models`;
        
        fetchBtn.classList.add('loading');
        fetchBtn.disabled = true;
        
        try {
            const headers = provider === 'gemini' ? {} : { Authorization: `Bearer ${apiKey}` };
            const response = await fetch(endpoint, { method: 'GET', headers });
            
            if (!response.ok) {
                throw new Error(`网络响应错误: ${response.status}`);
            }
            
            const data = await response.json();
            let models = [];
            
            if (provider !== 'gemini' && data.data) {
                models = data.data.map(e => e.id);
            } else if (provider === 'gemini' && data.models) {
                models = data.models.map(e => e.name.replace('models/', ''));
            }
            
            modelEl.innerHTML = '';
            if (models.length > 0) {
                models.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m;
                    opt.textContent = m;
                    modelEl.appendChild(opt);
                });
                showToast('模型列表拉取成功！');
            } else {
                modelEl.innerHTML = '<option value="">未找到任何模型</option>';
                showToast('未找到任何模型');
            }
        } catch (err) {
            console.error(err);
            showApiError(err);
            modelEl.innerHTML = '<option value="">拉取失败</option>';
        } finally {
            fetchBtn.classList.remove('loading');
            fetchBtn.disabled = false;
        }
    });
    
    // 保存设置
    saveBtn.addEventListener('click', async () => {
        if (!modelEl.value && (urlEl.value.trim() || keyEl.value.trim())) {
            showToast('请选择模型后保存！');
            return;
        }
        
        if (BLOCKED_API_DOMAINS.some(domain => urlEl.value.includes(domain))) {
            showToast('该 API 站点已被屏蔽，无法保存！');
            return;
        }
        
        // 如果全部为空，则清空设置
        if (!urlEl.value.trim() && !keyEl.value.trim() && !modelEl.value) {
            db[dbKey] = {};
            await saveData();
            showToast(displayName + 'API设置已清空！');
            return;
        }
        
        db[dbKey] = {
            provider: providerEl.value,
            url: urlEl.value,
            key: keyEl.value,
            model: modelEl.value
        };
        await saveData();
        showToast(displayName + 'API设置已保存！');
    });
    
    // 预设管理
    setupSubApiPresets(prefix, dbKey, presetsKey);
}

// === 副API预设管理 ===
function setupSubApiPresets(prefix, dbKey, presetsKey) {
    const presetSelect = document.getElementById(`${prefix}-api-preset-select`);
    const applyBtn = document.getElementById(`${prefix}-api-apply-preset`);
    const savePresetBtn = document.getElementById(`${prefix}-api-save-preset`);
    const manageBtn = document.getElementById(`${prefix}-api-manage-presets`);
    const importBtn = document.getElementById(`${prefix}-api-import-presets`);
    const exportBtn = document.getElementById(`${prefix}-api-export-presets`);
    const modal = document.getElementById(`${prefix}-api-presets-modal`);
    const closeModalBtn = document.getElementById(`${prefix}-api-close-modal`);
    const presetsList = document.getElementById(`${prefix}-api-presets-list`);
    
    // 填充预设列表
    function populatePresets() {
        const presets = db[presetsKey] || [];
        presetSelect.innerHTML = '<option value="">— 选择 —</option>';
        presets.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.name;
            opt.textContent = p.name;
            presetSelect.appendChild(opt);
        });
    }
    
    populatePresets();
    
    // 应用预设
    applyBtn.addEventListener('click', async () => {
        const name = presetSelect.value;
        if (!name) return showToast('请选择预设');
        
        const presets = db[presetsKey] || [];
        const preset = presets.find(p => p.name === name);
        if (!preset) return showToast('未找到该预设');
        
        try {
            const providerEl = document.getElementById(`${prefix}-api-provider`);
            const urlEl = document.getElementById(`${prefix}-api-url`);
            const keyEl = document.getElementById(`${prefix}-api-key`);
            const modelEl = document.getElementById(`${prefix}-api-model`);
            
            if (providerEl && preset.data.provider) providerEl.value = preset.data.provider;
            if (urlEl && preset.data.apiUrl) urlEl.value = preset.data.apiUrl;
            if (keyEl && preset.data.apiKey) keyEl.value = preset.data.apiKey;
            if (modelEl && preset.data.model) {
                modelEl.innerHTML = `<option value="${preset.data.model}">${preset.data.model}</option>`;
            }
            
            showToast('预设已应用到表单！');
        } catch (err) {
            console.error(err);
            showToast('应用预设失败');
        }
    });
    
    // 另存为预设
    savePresetBtn.addEventListener('click', () => {
        const providerEl = document.getElementById(`${prefix}-api-provider`);
        const urlEl = document.getElementById(`${prefix}-api-url`);
        const keyEl = document.getElementById(`${prefix}-api-key`);
        const modelEl = document.getElementById(`${prefix}-api-model`);
        
        const data = {
            provider: providerEl ? providerEl.value : '',
            apiUrl: urlEl ? urlEl.value : '',
            apiKey: keyEl ? keyEl.value : '',
            model: modelEl ? modelEl.value : ''
        };
        
        let name = prompt('为该预设填写名称（会覆盖同名预设）：');
        if (!name) return;
        
        const presets = db[presetsKey] || [];
        const idx = presets.findIndex(p => p.name === name);
        const preset = { name: name, data: data };
        
        if (idx >= 0) presets[idx] = preset;
        else presets.push(preset);
        
        db[presetsKey] = presets;
        saveData();
        populatePresets();
        showToast('预设已保存');
    });
    
    // 管理预设
    manageBtn.addEventListener('click', () => {
        renderPresetsList();
        modal.style.display = 'flex';
    });
    
    function renderPresetsList() {
        const presets = db[presetsKey] || [];
        presetsList.innerHTML = '';
        
        if (presets.length === 0) {
            presetsList.innerHTML = '<p style="text-align:center;color:#999;">暂无预设</p>';
            return;
        }
        
        presets.forEach((preset, idx) => {
            const div = document.createElement('div');
            div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px;margin-bottom:6px;border:1px solid #e0e0e0;border-radius:6px;background:#fafafa;';
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = preset.name;
            nameSpan.style.cssText = 'flex:1;font-weight:500;';
            
            const delBtn = document.createElement('button');
            delBtn.textContent = '删除';
            delBtn.className = 'btn btn-small';
            delBtn.style.cssText = 'background:#ff4444;color:white;padding:4px 12px;';
            delBtn.onclick = () => {
                if (confirm(`确定删除预设"${preset.name}"吗？`)) {
                    presets.splice(idx, 1);
                    db[presetsKey] = presets;
                    saveData();
                    renderPresetsList();
                    populatePresets();
                    showToast('预设已删除');
                }
            };
            
            div.appendChild(nameSpan);
            div.appendChild(delBtn);
            presetsList.appendChild(div);
        });
    }
    
    closeModalBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    // 导入预设
    importBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const imported = JSON.parse(text);
                
                if (!Array.isArray(imported)) {
                    showToast('文件格式错误');
                    return;
                }
                
                db[presetsKey] = db[presetsKey] || [];
                imported.forEach(preset => {
                    const idx = db[presetsKey].findIndex(p => p.name === preset.name);
                    if (idx >= 0) db[presetsKey][idx] = preset;
                    else db[presetsKey].push(preset);
                });
                
                await saveData();
                populatePresets();
                showToast('预设已导入');
            } catch (err) {
                console.error(err);
                showToast('导入失败，请检查文件格式');
            }
        };
        input.click();
    });
    
    // 导出预设
    exportBtn.addEventListener('click', () => {
        const presets = db[presetsKey] || [];
        if (presets.length === 0) {
            showToast('暂无预设可导出');
            return;
        }
        
        const json = JSON.stringify(presets, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${prefix}_api_presets_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('预设已导出');
    });
}

function _getBubblePresets() {
    return db.bubbleCssPresets || [];
}
function _saveBubblePresets(arr) {
    db.bubbleCssPresets = arr || [];
    saveData();
}

function populateBubblePresetSelect(selectId) { 
    const sel = document.getElementById(selectId); 
    if (!sel) return;
    const presets = _getBubblePresets();
    sel.innerHTML = '<option value="">— 选择预设 —</option>';
    presets.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        sel.appendChild(opt);
    });
}

async function applyPresetToCurrentChat(presetName) {
    const presets = _getBubblePresets();
    const preset = presets.find(p => p.name === presetName);
    if (!preset) { showToast('未找到该预设'); return; }
    
    let textarea;
    if (currentChatType === 'private') {
        textarea = document.getElementById('setting-custom-bubble-css');
    } else {
        textarea = document.getElementById('setting-group-custom-bubble-css');
    }
    if (textarea) textarea.value = preset.css;

    try {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (chat) {
            chat.customBubbleCss = preset.css;
            chat.useCustomBubbleCss = true;
            if (currentChatType === 'private') {
                document.getElementById('setting-use-custom-css').checked = true;
                document.getElementById('setting-custom-bubble-css').disabled = false;
            } else {
                document.getElementById('setting-group-use-custom-css').checked = true;
                document.getElementById('setting-group-custom-bubble-css').disabled = false;
            }
        }
    } catch(e){
        console.warn('applyPresetToCurrentChat: cannot write to db object', e);
    }

    try {
        // updateCustomBubbleStyle(window.currentChatId || null, preset.css, true);
        
        let previewBox;
        if (currentChatType === 'private') {
            previewBox = document.getElementById('private-bubble-css-preview');
        } else {
            previewBox = document.getElementById('group-bubble-css-preview');
        }

        if (previewBox) {
            const themeKey = (currentChatType === 'private' ? db.characters.find(c => c.id === currentChatId).theme : db.groups.find(g => g.id === currentChatId).theme) || 'white_pink';
            updateBubbleCssPreview(previewBox, preset.css, false, colorThemes[themeKey]);
        }
        showToast('预设已应用到当前聊天并保存');
        await saveData();
    } catch(e){
        console.error('applyPresetToCurrentChat error', e);
    }
}

function saveCurrentTextareaAsPreset() {
    const textarea = document.getElementById('setting-custom-bubble-css') || document.getElementById('setting-group-custom-bubble-css');
    if (!textarea) return showToast('找不到自定义 CSS 文本框');
    const css = textarea.value.trim();
    if (!css) return showToast('当前 CSS 为空，无法保存');
    let name = prompt('请输入预设名称（将覆盖同名预设）:');
    if (!name) return;
    const presets = _getBubblePresets();
    const idx = presets.findIndex(p => p.name === name);
    if (idx >= 0) presets[idx].css = css;
    else presets.push({name, css});
    _saveBubblePresets(presets);
    populateBubblePresetSelect('bubble-preset-select'); populateBubblePresetSelect('group-bubble-preset-select');
    showToast('预设已保存');
}

function openManagePresetsModal() {
    const modal = document.getElementById('bubble-presets-modal');
    const list = document.getElementById('bubble-presets-list');
    if (!modal || !list) return;
    list.innerHTML = '';
    const presets = _getBubblePresets();
    if (!presets.length) list.innerHTML = '<p style="color:#888;margin:6px 0;">暂无预设</p>';
    presets.forEach((p, idx) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '8px 0';
        row.style.borderBottom = '1px solid #f0f0f0';
        const nameDiv = document.createElement('div');
        nameDiv.style.flex = '1';
        nameDiv.style.whiteSpace = 'nowrap';
        nameDiv.style.overflow = 'hidden';
        nameDiv.style.textOverflow = 'ellipsis';
        nameDiv.textContent = p.name;
        row.appendChild(nameDiv);

        const btnWrap = document.createElement('div');
        btnWrap.style.display = 'flex';
        btnWrap.style.gap = '6px';

        const applyBtn = document.createElement('button');
        applyBtn.className = 'btn btn-primary';
        applyBtn.style.padding = '6px 8px;border-radius:8px';
        applyBtn.textContent = '应用';
        applyBtn.onclick = function(){ applyPresetToCurrentChat(p.name); modal.style.display = 'none'; };

        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn';
        renameBtn.style.padding = '6px 8px;border-radius:8px';
        renameBtn.textContent = '重命名';
        renameBtn.onclick = function(){
            const newName = prompt('输入新名称：', p.name);
            if (!newName) return;
            const presetsAll = _getBubblePresets();
            presetsAll[idx].name = newName;
            _saveBubblePresets(presetsAll);
            openManagePresetsModal(); 
            populateBubblePresetSelect('bubble-preset-select'); populateBubblePresetSelect('group-bubble-preset-select');
        };

        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-danger';
        delBtn.style.padding = '6px 8px;border-radius:8px';
        delBtn.textContent = '删除';
        delBtn.onclick = function(){
            if (!confirm('确定删除预设 \"' + p.name + '\" ?')) return;
            const presetsAll = _getBubblePresets();
            presetsAll.splice(idx, 1);
            _saveBubblePresets(presetsAll);
            openManagePresetsModal();
            populateBubblePresetSelect('bubble-preset-select'); populateBubblePresetSelect('group-bubble-preset-select');
        };

        btnWrap.appendChild(applyBtn);
        btnWrap.appendChild(renameBtn);
        btnWrap.appendChild(delBtn);
        row.appendChild(btnWrap);
        list.appendChild(row);
    });
    modal.style.display = 'flex';
}

function _getMyPersonaPresets() {
    return db.myPersonaPresets || [];
}
function _saveMyPersonaPresets(arr) {
    db.myPersonaPresets = arr || [];
    saveData();
}

function populateMyPersonaSelect() {
    const sel = document.getElementById('mypersona-preset-select');
    if (!sel) return;
    const presets = _getMyPersonaPresets();
    sel.innerHTML = '<option value="">— 选择预设 —</option>';
    presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        sel.appendChild(opt);
    });
}

function saveCurrentMyPersonaAsPreset() {
    const personaEl = document.getElementById('setting-my-persona');
    const avatarEl = document.getElementById('setting-my-avatar-preview');
    if (!personaEl || !avatarEl) return showToast('找不到我的人设或头像控件');
    const persona = personaEl.value.trim();
    const avatar = avatarEl.src || '';
    if (!persona && !avatar) return showToast('人设和头像都为空，无法保存');
    const name = prompt('请输入预设名称（将覆盖同名预设）：');
    if (!name) return;
    const presets = _getMyPersonaPresets();
    const idx = presets.findIndex(p => p.name === name);
    const preset = { name, persona, avatar };
    if (idx >= 0) presets[idx] = preset; else presets.push(preset);
    _saveMyPersonaPresets(presets);
    populateMyPersonaSelect();
    showToast('我的人设预设已保存');
}

async function applyMyPersonaPresetToCurrentChat(presetName) {
    const presets = _getMyPersonaPresets();
    const p = presets.find(x => x.name === presetName);
    if (!p) { showToast('未找到该预设'); return; }

    const personaEl = document.getElementById('setting-my-persona');
    const avatarEl = document.getElementById('setting-my-avatar-preview');
    if (personaEl) personaEl.value = p.persona || '';
    if (avatarEl) avatarEl.src = p.avatar || '';

    try {
        if (currentChatType === 'private') {
            const e = db.characters.find(c => c.id === currentChatId);
            if (e) {
                e.myPersona = p.persona || '';
                e.myAvatar = p.avatar || '';
                await saveData();
                showToast('预设已应用并保存到当前聊天');
                if (typeof loadSettingsToSidebar === 'function') try{ loadSettingsToSidebar(); }catch(e){}
                if (typeof renderChatList === 'function') try{ renderChatList(); }catch(e){}
            }
        } else {
            showToast('预设已应用到界面（未检测到当前聊天保存入口）');
        }
    } catch(err) {
        console.error('applyMyPersonaPresetToCurrentChat error', err);
    }
}

function openManageMyPersonaModal() {
    const modal = document.getElementById('mypersona-presets-modal');
    const list = document.getElementById('mypersona-presets-list');
    if (!modal || !list) return;
    list.innerHTML = '';
    const presets = _getMyPersonaPresets();
    if (!presets.length) list.innerHTML = '<p style="color:#888;margin:6px 0;">暂无预设</p>';
    presets.forEach((p, idx) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '8px 0';
        row.style.borderBottom = '1px solid #f0f0f0';

        const nameDiv = document.createElement('div');
        nameDiv.style.flex = '1';
        nameDiv.style.whiteSpace = 'nowrap';
        nameDiv.style.overflow = 'hidden';
        nameDiv.style.textOverflow = 'ellipsis';
        nameDiv.textContent = p.name;
        row.appendChild(nameDiv);

        const btnWrap = document.createElement('div');
        btnWrap.style.display = 'flex';
        btnWrap.style.gap = '6px';

        const applyBtn = document.createElement('button');
        applyBtn.className = 'btn btn-primary';
        applyBtn.style.padding = '6px 8px;border-radius:8px';
        applyBtn.textContent = '应用';
        applyBtn.onclick = function(){ applyMyPersonaPresetToCurrentChat(p.name); modal.style.display = 'none'; };

        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn';
        renameBtn.style.padding = '6px 8px;border-radius:8px';
        renameBtn.textContent = '重命名';
        renameBtn.onclick = function(){
            const newName = prompt('输入新名称：', p.name);
            if (!newName) return;
            const all = _getMyPersonaPresets();
            all[idx].name = newName;
            _saveMyPersonaPresets(all);
            openManageMyPersonaModal();
            populateMyPersonaSelect();
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn';
        deleteBtn.style.padding = '6px 8px;border-radius:8px;color:#e53935';
        deleteBtn.textContent = '删除';
        deleteBtn.onclick = function(){
            if (!confirm('确认删除该预设？')) return;
            const all = _getMyPersonaPresets();
            all.splice(idx,1);
            _saveMyPersonaPresets(all);
            openManageMyPersonaModal();
            populateMyPersonaSelect();
        };

        btnWrap.appendChild(applyBtn);
        btnWrap.appendChild(renameBtn);
        btnWrap.appendChild(deleteBtn);
        row.appendChild(btnWrap);

        list.appendChild(row);
    });

    modal.style.display = 'flex';
}

function _getFontPresets() {
    return db.fontPresets || [];
}
function _saveFontPresets(arr) {
    db.fontPresets = arr || [];
    saveData();
}

function populateFontPresetSelect() {
    const sel = document.getElementById('font-preset-select');
    if (!sel) return;
    const presets = _getFontPresets();
    sel.innerHTML = '<option value="">— 选择预设 —</option>';
    presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        sel.appendChild(opt);
    });
}

function saveCurrentFontAsPreset() {
    const fontUrlInput = document.getElementById('customize-font-url');
    if (!fontUrlInput) return showToast('找不到字体 URL 输入框');
    const url = fontUrlInput.value.trim();
    if (!url) return showToast('字体 URL 为空，无法保存');
    
    let name = prompt('请输入预设名称（将覆盖同名预设）：');
    if (!name) return;
    
    const presets = _getFontPresets();
    const idx = presets.findIndex(p => p.name === name);
    const preset = { name, url };
    
    if (idx >= 0) presets[idx] = preset; 
    else presets.push(preset);
    
    _saveFontPresets(presets);
    populateFontPresetSelect();
    showToast('字体预设已保存');
}

function applyFontPreset(name) {
    const presets = _getFontPresets();
    const p = presets.find(x => x.name === name);
    if (!p) return showToast('未找到该预设');
    
    const fontUrlInput = document.getElementById('customize-font-url');
    if (fontUrlInput) fontUrlInput.value = p.url;
    
    db.fontUrl = p.url;
    saveData();
    applyGlobalFont(p.url);
    showToast('已应用字体预设');
}

function openFontManageModal() {
    const modal = document.getElementById('font-presets-modal');
    const list = document.getElementById('font-presets-list');
    if (!modal || !list) return;
    
    list.innerHTML = '';
    const presets = _getFontPresets();
    if (!presets.length) list.innerHTML = '<p style="color:#888;margin:6px 0;">暂无预设</p>';
    
    presets.forEach((p, idx) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '8px 0';
        row.style.borderBottom = '1px solid #f0f0f0';

        const nameDiv = document.createElement('div');
        nameDiv.style.flex = '1';
        nameDiv.style.whiteSpace = 'nowrap';
        nameDiv.style.overflow = 'hidden';
        nameDiv.style.textOverflow = 'ellipsis';
        nameDiv.textContent = p.name;
        row.appendChild(nameDiv);

        const btnWrap = document.createElement('div');
        btnWrap.style.display = 'flex';
        btnWrap.style.gap = '6px';

        const applyBtn = document.createElement('button');
        applyBtn.className = 'btn btn-primary';
        applyBtn.style.padding = '6px 8px;border-radius:8px';
        applyBtn.textContent = '应用';
        applyBtn.onclick = function(){ applyFontPreset(p.name); modal.style.display = 'none'; };

        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn';
        renameBtn.style.padding = '6px 8px;border-radius:8px';
        renameBtn.textContent = '重命名';
        renameBtn.onclick = function(){
            const newName = prompt('输入新名称：', p.name);
            if (!newName) return;
            const all = _getFontPresets();
            all[idx].name = newName;
            _saveFontPresets(all);
            openFontManageModal();
            populateFontPresetSelect();
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn';
        deleteBtn.style.padding = '6px 8px;border-radius:8px;color:#e53935';
        deleteBtn.textContent = '删除';
        deleteBtn.onclick = function(){
            if (!confirm('确认删除该预设？')) return;
            const all = _getFontPresets();
            all.splice(idx,1);
            _saveFontPresets(all);
            openFontManageModal();
            populateFontPresetSelect();
        };

        btnWrap.appendChild(applyBtn);
        btnWrap.appendChild(renameBtn);
        btnWrap.appendChild(deleteBtn);
        row.appendChild(btnWrap);

        list.appendChild(row);
    });

    modal.style.display = 'flex';
}

function setupPresetFeatures() {
    const saveBtn = document.getElementById('api-save-preset');
    const manageBtn = document.getElementById('api-manage-presets');
    const applyBtn = document.getElementById('api-apply-preset');
    const select = document.getElementById('api-preset-select');
    const modalClose = document.getElementById('api-close-modal');
    const importBtn = document.getElementById('api-import-presets');
    const exportBtn = document.getElementById('api-export-presets');

    if (saveBtn) saveBtn.addEventListener('click', saveCurrentApiAsPreset);
    if (manageBtn) manageBtn.addEventListener('click', openApiManageModal);
    if (applyBtn) applyBtn.addEventListener('click', function(){ const v=select.value; if(!v) return showToast('请选择预设'); applyApiPreset(v); });
    if (modalClose) modalClose.addEventListener('click', function(){ document.getElementById('api-presets-modal').style.display='none'; });
    if (importBtn) importBtn.addEventListener('click', importApiPresets);
    if (exportBtn) exportBtn.addEventListener('click', exportApiPresets);
    
    // === TTS 预设管理 ===
    const ttsSaveBtn = document.getElementById('tts-save-preset');
    const ttsManageBtn = document.getElementById('tts-manage-presets');
    const ttsApplyBtn = document.getElementById('tts-apply-preset');
    const ttsSelect = document.getElementById('tts-preset-select');
    const ttsModalClose = document.getElementById('tts-close-modal');
    const ttsImportBtn = document.getElementById('tts-import-presets');
    const ttsExportBtn = document.getElementById('tts-export-presets');

    if (ttsSaveBtn) ttsSaveBtn.addEventListener('click', saveCurrentTTSAsPreset);
    if (ttsManageBtn) ttsManageBtn.addEventListener('click', openTTSManageModal);
    if (ttsApplyBtn) ttsApplyBtn.addEventListener('click', function(){ const v=ttsSelect.value; if(!v) return showToast('请选择预设'); applyTTSPreset(v); });
    if (ttsModalClose) ttsModalClose.addEventListener('click', function(){ document.getElementById('tts-presets-modal').style.display='none'; });
    if (ttsImportBtn) ttsImportBtn.addEventListener('click', importTTSPresets);
    if (ttsExportBtn) ttsExportBtn.addEventListener('click', exportTTSPresets);
    
    const bubbleApplyBtn = document.getElementById('apply-preset-btn');
    const bubbleSaveBtn = document.getElementById('save-preset-btn');
    const bubbleManageBtn = document.getElementById('manage-presets-btn');
    const bubbleModalClose = document.getElementById('close-presets-modal');

    const groupBubbleApplyBtn = document.getElementById('group-apply-preset-btn');
    const groupBubbleSaveBtn = document.getElementById('group-save-preset-btn');
    const groupBubbleManageBtn = document.getElementById('group-manage-presets-btn');

    if (bubbleApplyBtn) bubbleApplyBtn.addEventListener('click', () => {
        const selVal = document.getElementById('bubble-preset-select').value;
        if (!selVal) return showToast('请选择要应用的预设');
        applyPresetToCurrentChat(selVal);
    });
    if (bubbleSaveBtn) bubbleSaveBtn.addEventListener('click', saveCurrentTextareaAsPreset);
    if (bubbleManageBtn) bubbleManageBtn.addEventListener('click', openManagePresetsModal);
    if (bubbleModalClose) bubbleModalClose.addEventListener('click', () => {
        document.getElementById('bubble-presets-modal').style.display = 'none';
    });

    if (groupBubbleApplyBtn) groupBubbleApplyBtn.addEventListener('click', () => {
        const selVal = document.getElementById('group-bubble-preset-select').value;
        if (!selVal) return showToast('请选择要应用的预设');
        applyPresetToCurrentChat(selVal);
    });
    if (groupBubbleSaveBtn) groupBubbleSaveBtn.addEventListener('click', saveCurrentTextareaAsPreset);
    if (groupBubbleManageBtn) groupBubbleManageBtn.addEventListener('click', openManagePresetsModal);

    const personaSaveBtn = document.getElementById('mypersona-save-btn');
    const personaManageBtn = document.getElementById('mypersona-manage-btn');
    const personaApplyBtn = document.getElementById('mypersona-apply-btn');
    const personaSelect = document.getElementById('mypersona-preset-select');
    const personaModalClose = document.getElementById('mypersona-close-modal');

    if (personaSaveBtn) personaSaveBtn.addEventListener('click', saveCurrentMyPersonaAsPreset);
    if (personaManageBtn) personaManageBtn.addEventListener('click', openManageMyPersonaModal);
    if (personaApplyBtn) personaApplyBtn.addEventListener('click', function(){ const v = personaSelect.value; if(!v) return showToast('请选择要应用的预设'); applyMyPersonaPresetToCurrentChat(v); });
    if (personaModalClose) personaModalClose.addEventListener('click', function(){ document.getElementById('mypersona-presets-modal').style.display='none'; });

    const globalCssModalClose = document.getElementById('global-css-close-modal');
    if (globalCssModalClose) globalCssModalClose.addEventListener('click', () => {
        document.getElementById('global-css-presets-modal').style.display = 'none';
    });

    const fontModalClose = document.getElementById('font-close-modal');
    if (fontModalClose) fontModalClose.addEventListener('click', () => {
        document.getElementById('font-presets-modal').style.display = 'none';
    });

    const soundModalClose = document.getElementById('sound-close-modal');
    if (soundModalClose) soundModalClose.addEventListener('click', () => {
        document.getElementById('sound-presets-modal').style.display = 'none';
    });

    const iconPresetModalClose = document.getElementById('icon-presets-close-modal');
    if (iconPresetModalClose) iconPresetModalClose.addEventListener('click', () => {
        document.getElementById('icon-presets-modal').style.display = 'none';
    });

    const widgetWallpaperModalClose = document.getElementById('widget-wallpaper-presets-close-modal');
    if (widgetWallpaperModalClose) widgetWallpaperModalClose.addEventListener('click', () => {
        document.getElementById('widget-wallpaper-presets-modal').style.display = 'none';
    });
}

const DEFAULT_WALLPAPER_URL = 'https://i.postimg.cc/W4Z9R9x4/ins-1.jpg';

function setupWallpaperApp() {
    const e = document.getElementById('wallpaper-upload'), t = document.getElementById('wallpaper-preview');
    if (t) {
        t.style.backgroundImage = `url(${db.wallpaper})`;
        t.textContent = '';
    }
    const resetBtn = document.getElementById('wallpaper-reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            db.wallpaper = DEFAULT_WALLPAPER_URL;
            applyWallpaper(DEFAULT_WALLPAPER_URL);
            if (t) {
                t.style.backgroundImage = `url(${DEFAULT_WALLPAPER_URL})`;
                t.textContent = '';
            }
            if (e) e.value = '';
            await saveData();
            showToast('已恢复默认壁纸');
        });
    }
    if (e) {
        e.addEventListener('change', async (a) => {
            const n = a.target.files[0];
            if (n) {
                try {
                    const r = await compressImage(n, {quality: 0.85, maxWidth: 1080, maxHeight: 1920});
                    db.wallpaper = r;
                    applyWallpaper(r);
                    if (t) t.style.backgroundImage = `url(${r})`;
                    await saveData();
                    showToast('壁纸已更新');
                } catch (error) {
                    showToast('壁纸压缩失败');
                }
            }
        });
    }
}

function populateGlobalCssPresetSelect() {
    const select = document.getElementById('global-css-preset-select');
    if (!select) return;
    select.innerHTML = '<option value="">— 选择预设 —</option>';
    (db.globalCssPresets || []).forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        select.appendChild(opt);
    });
}

function openGlobalCssManageModal() {
    const modal = document.getElementById('global-css-presets-modal');
    const list = document.getElementById('global-css-presets-list');
    if (!modal || !list) return;
    list.innerHTML = '';
    const presets = db.globalCssPresets || [];
    if (!presets.length) list.innerHTML = '<p style="color:#888;margin:6px 0;">暂无预设</p>';
    
    presets.forEach((p, idx) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '8px 0';
        row.style.borderBottom = '1px solid #f0f0f0';
        
        const nameDiv = document.createElement('div');
        nameDiv.style.flex = '1';
        nameDiv.style.whiteSpace = 'nowrap';
        nameDiv.style.overflow = 'hidden';
        nameDiv.style.textOverflow = 'ellipsis';
        nameDiv.textContent = p.name;
        row.appendChild(nameDiv);

        const btnWrap = document.createElement('div');
        btnWrap.style.display = 'flex';
        btnWrap.style.gap = '6px';

        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn';
        renameBtn.style.padding = '6px 8px';
        renameBtn.textContent = '重命名';
        renameBtn.onclick = function() {
            const newName = prompt('输入新名称：', p.name);
            if (!newName || newName === p.name) return;
            db.globalCssPresets[idx].name = newName;
            saveData();
            openGlobalCssManageModal();
            populateGlobalCssPresetSelect();
        };

        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-danger';
        delBtn.style.padding = '6px 8px';
        delBtn.textContent = '删除';
        delBtn.onclick = function() {
            if (!confirm('确定删除预设 "' + p.name + '" ?')) return;
            db.globalCssPresets.splice(idx, 1);
            saveData();
            openGlobalCssManageModal();
            populateGlobalCssPresetSelect();
        };

        btnWrap.appendChild(renameBtn);
        btnWrap.appendChild(delBtn);
        row.appendChild(btnWrap);
        list.appendChild(row);
    });
    modal.style.display = 'flex';
}

function _getSoundPresets() {
    return db.soundPresets || [];
}
function _saveSoundPresets(arr) {
    db.soundPresets = arr || [];
    saveData();
}

function populateSoundPresetSelect() {
    const sel = document.getElementById('sound-preset-select');
    if (!sel) return;
    const presets = _getSoundPresets();
    sel.innerHTML = '<option value="">— 选择预设 —</option>';
    presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        sel.appendChild(opt);
    });
}

function saveCurrentSoundAsPreset() {
    const sendUrl = document.getElementById('global-send-sound-url').value.trim();
    const receiveUrl = document.getElementById('global-receive-sound-url').value.trim();
    const incomingCallUrl = (document.getElementById('global-incoming-call-sound-url')?.value || '').trim();
    
    if (!sendUrl && !receiveUrl && !incomingCallUrl) return showToast('提示音配置为空，无法保存');
    
    let name = prompt('请输入预设名称（将覆盖同名预设）：');
    if (!name) return;
    
    const presets = _getSoundPresets();
    const idx = presets.findIndex(p => p.name === name);
    const preset = { name, sendSound: sendUrl, receiveSound: receiveUrl, incomingCallSound: incomingCallUrl };
    
    if (idx >= 0) presets[idx] = preset; 
    else presets.push(preset);
    
    _saveSoundPresets(presets);
    populateSoundPresetSelect();
    showToast('提示音预设已保存');
}

function applySoundPreset(name) {
    const presets = _getSoundPresets();
    const p = presets.find(x => x.name === name);
    if (!p) return showToast('未找到该预设');
    
    const sendInput = document.getElementById('global-send-sound-url');
    const receiveInput = document.getElementById('global-receive-sound-url');
    const incomingCallInput = document.getElementById('global-incoming-call-sound-url');
    
    if (sendInput) sendInput.value = p.sendSound || '';
    if (receiveInput) receiveInput.value = p.receiveSound || '';
    if (incomingCallInput) incomingCallInput.value = p.incomingCallSound || '';
    
    db.globalSendSound = p.sendSound || '';
    db.globalReceiveSound = p.receiveSound || '';
    db.globalIncomingCallSound = p.incomingCallSound || '';
    saveData();
    
    showToast('已应用提示音预设');
}

function openSoundManageModal() {
    const modal = document.getElementById('sound-presets-modal');
    const list = document.getElementById('sound-presets-list');
    if (!modal || !list) return;
    
    list.innerHTML = '';
    const presets = _getSoundPresets();
    if (!presets.length) list.innerHTML = '<p style="color:#888;margin:6px 0;">暂无预设</p>';
    
    presets.forEach((p, idx) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '8px 0';
        row.style.borderBottom = '1px solid #f0f0f0';

        const nameDiv = document.createElement('div');
        nameDiv.style.flex = '1';
        nameDiv.style.whiteSpace = 'nowrap';
        nameDiv.style.overflow = 'hidden';
        nameDiv.style.textOverflow = 'ellipsis';
        nameDiv.textContent = p.name;
        row.appendChild(nameDiv);

        const btnWrap = document.createElement('div');
        btnWrap.style.display = 'flex';
        btnWrap.style.gap = '6px';

        const applyBtn = document.createElement('button');
        applyBtn.className = 'btn btn-primary';
        applyBtn.style.padding = '6px 8px;border-radius:8px';
        applyBtn.textContent = '应用';
        applyBtn.onclick = function(){ applySoundPreset(p.name); modal.style.display = 'none'; };

        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn';
        renameBtn.style.padding = '6px 8px;border-radius:8px';
        renameBtn.textContent = '重命名';
        renameBtn.onclick = function(){
            const newName = prompt('输入新名称：', p.name);
            if (!newName) return;
            const all = _getSoundPresets();
            all[idx].name = newName;
            _saveSoundPresets(all);
            openSoundManageModal();
            populateSoundPresetSelect();
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn';
        deleteBtn.style.padding = '6px 8px;border-radius:8px;color:#e53935';
        deleteBtn.textContent = '删除';
        deleteBtn.onclick = function(){
            if (!confirm('确认删除该预设？')) return;
            const all = _getSoundPresets();
            all.splice(idx,1);
            _saveSoundPresets(all);
            openSoundManageModal();
            populateSoundPresetSelect();
        };

        btnWrap.appendChild(applyBtn);
        btnWrap.appendChild(renameBtn);
        btnWrap.appendChild(deleteBtn);
        row.appendChild(btnWrap);

        list.appendChild(row);
    });

    modal.style.display = 'flex';
}

function _getWidgetPresets() {
    return db.homeWidgetPresets || [];
}
function _saveWidgetPresets(arr) {
    db.homeWidgetPresets = arr || [];
    saveData();
}

function populateWidgetPresetSelect() {
    const sel = document.getElementById('widget-preset-select');
    if (!sel) return;
    const presets = _getWidgetPresets();
    sel.innerHTML = '<option value="">— 选择预设 —</option>';
    presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        sel.appendChild(opt);
    });
}

function saveCurrentWidgetAsPreset() {
    const currentSettings = JSON.parse(JSON.stringify(db.homeWidgetSettings || {}));
    let name = prompt('请输入预设名称（将覆盖同名预设）：');
    if (!name) return;
    const presets = _getWidgetPresets();
    const idx = presets.findIndex(p => p.name === name);
    const preset = { name, settings: currentSettings };
    if (idx >= 0) presets[idx] = preset;
    else presets.push(preset);
    _saveWidgetPresets(presets);
    populateWidgetPresetSelect();
    showToast('小组件预设已保存');
}

function applyWidgetPreset(name) {
    const presets = _getWidgetPresets();
    const p = presets.find(x => x.name === name);
    if (!p) return showToast('未找到该预设');
    db.homeWidgetSettings = JSON.parse(JSON.stringify(p.settings));
    saveData();
    if (typeof setupHomeScreen === 'function') setupHomeScreen();
    if (typeof updatePolaroidImage === 'function' && db.homeWidgetSettings.polaroidImage) {
        updatePolaroidImage(db.homeWidgetSettings.polaroidImage);
    }
    showToast('已应用小组件预设');
}

function openWidgetManageModal() {
    const modal = document.getElementById('widget-presets-modal');
    const list = document.getElementById('widget-presets-list');
    if (!modal || !list) return;
    list.innerHTML = '';
    const presets = _getWidgetPresets();
    if (!presets.length) {
        list.innerHTML = '<p style="color:#888;margin:6px 0;">暂无预设</p>';
    }
    presets.forEach((p, idx) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f0f0f0;';
        const nameDiv = document.createElement('div');
        nameDiv.style.cssText = 'flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        nameDiv.textContent = p.name;
        row.appendChild(nameDiv);
        const btnWrap = document.createElement('div');
        btnWrap.style.cssText = 'display:flex;gap:8px;';
        const applyBtn = document.createElement('button');
        applyBtn.className = 'btn btn-primary';
        applyBtn.style.cssText = 'padding:6px 8px;border-radius:8px;';
        applyBtn.textContent = '应用';
        applyBtn.onclick = function () { applyWidgetPreset(p.name); modal.style.display = 'none'; };
        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn';
        renameBtn.style.cssText = 'padding:6px 8px;border-radius:8px;';
        renameBtn.textContent = '重命名';
        renameBtn.onclick = function () {
            const newName = prompt('输入新名称：', p.name);
            if (!newName) return;
            const all = _getWidgetPresets();
            all[idx].name = newName;
            _saveWidgetPresets(all);
            openWidgetManageModal();
            populateWidgetPresetSelect();
        };
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn';
        deleteBtn.style.cssText = 'padding:6px 8px;border-radius:8px;color:#e53935;';
        deleteBtn.textContent = '删除';
        deleteBtn.onclick = function () {
            if (!confirm('确认删除该预设？')) return;
            const all = _getWidgetPresets();
            all.splice(idx, 1);
            _saveWidgetPresets(all);
            openWidgetManageModal();
            populateWidgetPresetSelect();
        };
        btnWrap.appendChild(applyBtn);
        btnWrap.appendChild(renameBtn);
        btnWrap.appendChild(deleteBtn);
        row.appendChild(btnWrap);
        list.appendChild(row);
    });
    modal.style.display = 'flex';
}

// ---------- 小组件和壁纸方案 ----------
const DEFAULT_HOME_SIGNATURE = '编辑个性签名...';
const DEFAULT_INS_WIDGET = { avatar1: 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg', bubble1: 'love u.', avatar2: 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg', bubble2: 'miss u.' };

function _getWidgetWallpaperPresets() {
    return db.widgetWallpaperPresets || [];
}
function _saveWidgetWallpaperPresets(arr) {
    db.widgetWallpaperPresets = arr || [];
    saveData();
}

function _captureCurrentWidgetWallpaperScheme() {
    return {
        wallpaper: db.wallpaper || DEFAULT_WALLPAPER_URL,
        homeWidgetSettings: JSON.parse(JSON.stringify(db.homeWidgetSettings || {})),
        homeSignature: db.homeSignature !== undefined ? db.homeSignature : DEFAULT_HOME_SIGNATURE,
        insWidgetSettings: JSON.parse(JSON.stringify(db.insWidgetSettings || DEFAULT_INS_WIDGET))
    };
}

function populateWidgetWallpaperPresetSelect() {
    const sel = document.getElementById('widget-wallpaper-preset-select');
    if (!sel) return;
    const presets = _getWidgetWallpaperPresets();
    sel.innerHTML = '<option value="">— 选择方案 —</option>';
    presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        sel.appendChild(opt);
    });
}

function saveCurrentWidgetWallpaperAsPreset() {
    const scheme = _captureCurrentWidgetWallpaperScheme();
    const name = prompt('请输入方案名称（将覆盖同名方案）：');
    if (!name || !name.trim()) return;
    const presets = _getWidgetWallpaperPresets();
    const idx = presets.findIndex(p => p.name === name.trim());
    const preset = { name: name.trim(), ...scheme };
    if (idx >= 0) presets[idx] = preset;
    else presets.push(preset);
    _saveWidgetWallpaperPresets(presets);
    populateWidgetWallpaperPresetSelect();
    showToast('方案已保存到预设库');
}

function applyWidgetWallpaperPreset(name) {
    const presets = _getWidgetWallpaperPresets();
    const p = presets.find(x => x.name === name);
    if (!p) return showToast('未找到该方案');
    db.wallpaper = p.wallpaper || DEFAULT_WALLPAPER_URL;
    if (typeof applyWallpaper === 'function') applyWallpaper(db.wallpaper);
    db.homeWidgetSettings = JSON.parse(JSON.stringify(p.homeWidgetSettings || {}));
    db.homeSignature = p.homeSignature !== undefined ? p.homeSignature : DEFAULT_HOME_SIGNATURE;
    db.insWidgetSettings = JSON.parse(JSON.stringify(p.insWidgetSettings || DEFAULT_INS_WIDGET));
    saveData();
    if (typeof setupHomeScreen === 'function') setupHomeScreen();
    if (typeof updatePolaroidImage === 'function' && db.homeWidgetSettings.polaroidImage) {
        updatePolaroidImage(db.homeWidgetSettings.polaroidImage);
    }
    const preview = document.getElementById('wallpaper-preview');
    if (preview) {
        preview.style.backgroundImage = `url(${db.wallpaper})`;
        preview.textContent = '';
    }
    showToast('已应用方案');
}

function openWidgetWallpaperManageModal() {
    const modal = document.getElementById('widget-wallpaper-presets-modal');
    const list = document.getElementById('widget-wallpaper-presets-list');
    if (!modal || !list) return;
    list.innerHTML = '';
    const presets = _getWidgetWallpaperPresets();
    if (!presets.length) {
        list.innerHTML = '<p style="color:#888;margin:6px 0;">暂无方案</p>';
    }
    presets.forEach((p, idx) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f0f0f0;';
        const nameDiv = document.createElement('div');
        nameDiv.style.cssText = 'flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        nameDiv.textContent = p.name;
        row.appendChild(nameDiv);
        const btnWrap = document.createElement('div');
        btnWrap.style.cssText = 'display:flex;gap:8px;';
        const applyBtn = document.createElement('button');
        applyBtn.className = 'btn btn-primary';
        applyBtn.style.cssText = 'padding:6px 8px;border-radius:8px;';
        applyBtn.textContent = '应用';
        applyBtn.onclick = function () { applyWidgetWallpaperPreset(p.name); modal.style.display = 'none'; };
        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn';
        renameBtn.style.cssText = 'padding:6px 8px;border-radius:8px;';
        renameBtn.textContent = '重命名';
        renameBtn.onclick = function () {
            const newName = prompt('输入新名称：', p.name);
            if (!newName || !newName.trim()) return;
            const all = _getWidgetWallpaperPresets();
            all[idx].name = newName.trim();
            _saveWidgetWallpaperPresets(all);
            openWidgetWallpaperManageModal();
            populateWidgetWallpaperPresetSelect();
        };
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn';
        deleteBtn.style.cssText = 'padding:6px 8px;border-radius:8px;color:#e53935;';
        deleteBtn.textContent = '删除';
        deleteBtn.onclick = function () {
            if (!confirm('确认删除该方案？')) return;
            const all = _getWidgetWallpaperPresets();
            all.splice(idx, 1);
            _saveWidgetWallpaperPresets(all);
            openWidgetWallpaperManageModal();
            populateWidgetWallpaperPresetSelect();
        };
        btnWrap.appendChild(applyBtn);
        btnWrap.appendChild(renameBtn);
        btnWrap.appendChild(deleteBtn);
        row.appendChild(btnWrap);
        list.appendChild(row);
    });
    modal.style.display = 'flex';
}

function exportWidgetWallpaperScheme() {
    const presets = _getWidgetWallpaperPresets();
    const sel = document.getElementById('widget-wallpaper-preset-select');
    const chosen = sel && sel.value;
    let payload;
    if (chosen) {
        const p = presets.find(x => x.name === chosen);
        if (!p) return showToast('未找到所选方案');
        payload = { type: 'widget-wallpaper-scheme', version: 1, preset: p };
    } else {
        const current = _captureCurrentWidgetWallpaperScheme();
        payload = { type: 'widget-wallpaper-scheme', version: 1, preset: { name: '当前主屏', ...current } };
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '小组件壁纸方案.json';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('方案已导出');
}

function importWidgetWallpaperScheme(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
        try {
            const data = JSON.parse(reader.result);
            if (!data || data.type !== 'widget-wallpaper-scheme' || !data.preset) {
                showToast('不是有效的小组件壁纸方案文件');
                return;
            }
            const preset = data.preset;
            const name = preset.name || '导入的方案';
            const presets = _getWidgetWallpaperPresets();
            const existingIdx = presets.findIndex(p => p.name === name);
            const toAdd = { name, wallpaper: preset.wallpaper, homeWidgetSettings: preset.homeWidgetSettings || {}, homeSignature: preset.homeSignature, insWidgetSettings: preset.insWidgetSettings || {} };
            if (existingIdx >= 0) presets[existingIdx] = toAdd;
            else presets.push(toAdd);
            _saveWidgetWallpaperPresets(presets);
            populateWidgetWallpaperPresetSelect();
            if (confirm('已加入预设库。是否立即应用该方案？')) {
                applyWidgetWallpaperPreset(name);
            } else {
                showToast('方案已导入到预设库');
            }
        } catch (e) {
            showToast('导入失败：' + (e.message || '文件格式错误'));
        }
    };
    reader.readAsText(file);
}

function resetWidgetWallpaperToDefault() {
    if (!confirm('确定要恢复默认吗？将清除当前所有小组件和壁纸设置。')) return;
    db.wallpaper = DEFAULT_WALLPAPER_URL;
    if (typeof applyWallpaper === 'function') applyWallpaper(DEFAULT_WALLPAPER_URL);
    db.homeWidgetSettings = JSON.parse(JSON.stringify(defaultWidgetSettings));
    db.homeSignature = DEFAULT_HOME_SIGNATURE;
    db.insWidgetSettings = JSON.parse(JSON.stringify(DEFAULT_INS_WIDGET));
    saveData();
    if (typeof setupHomeScreen === 'function') setupHomeScreen();
    const preview = document.getElementById('wallpaper-preview');
    if (preview) {
        preview.style.backgroundImage = `url(${DEFAULT_WALLPAPER_URL})`;
        preview.textContent = '';
    }
    renderCustomizeForm();
    showToast('已恢复默认（小组件+壁纸）');
}

function _getIconPresets() {
    return db.iconPresets || [];
}
function _saveIconPresets(arr) {
    db.iconPresets = arr || [];
    saveData();
}

function populateIconPresetSelect() {
    const sel = document.getElementById('icon-preset-select');
    if (!sel) return;
    const presets = _getIconPresets();
    sel.innerHTML = '<option value="">— 选择预设 —</option>';
    presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        sel.appendChild(opt);
    });
}

function saveCurrentIconsAsPreset() {
    const customIcons = db.customIcons ? JSON.parse(JSON.stringify(db.customIcons)) : {};
    const name = prompt('请输入预设名称（将覆盖同名预设）：');
    if (!name) return;
    const presets = _getIconPresets();
    const idx = presets.findIndex(p => p.name === name);
    const preset = { name, customIcons };
    if (idx >= 0) presets[idx] = preset;
    else presets.push(preset);
    _saveIconPresets(presets);
    populateIconPresetSelect();
    showToast('图标预设已保存');
}

function applyIconPreset(name) {
    const presets = _getIconPresets();
    const p = presets.find(x => x.name === name);
    if (!p) return showToast('未找到该预设');
    db.customIcons = p.customIcons ? JSON.parse(JSON.stringify(p.customIcons)) : {};
    saveData();
    const iconIds = Object.keys(defaultIcons || {});
    iconIds.forEach(id => {
        const url = (db.customIcons && db.customIcons[id]) || (defaultIcons[id] && defaultIcons[id].url) || '';
        const input = document.querySelector(`input[data-icon-id="${id}"][type="url"]`);
        const preview = document.getElementById(`icon-preview-${id}`);
        if (input) input.value = url || '';
        if (preview) preview.src = url;
    });
    if (typeof setupHomeScreen === 'function') setupHomeScreen();
    showToast('已应用图标预设');
}

function openIconPresetManageModal() {
    const modal = document.getElementById('icon-presets-modal');
    const list = document.getElementById('icon-presets-list');
    if (!modal || !list) return;
    list.innerHTML = '';
    const presets = _getIconPresets();
    if (!presets.length) list.innerHTML = '<p style="color:#888;margin:6px 0;">暂无预设</p>';
    presets.forEach((p, idx) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '8px 0';
        row.style.borderBottom = '1px solid #f0f0f0';
        const nameDiv = document.createElement('div');
        nameDiv.style.flex = '1';
        nameDiv.style.whiteSpace = 'nowrap';
        nameDiv.style.overflow = 'hidden';
        nameDiv.style.textOverflow = 'ellipsis';
        nameDiv.textContent = p.name;
        row.appendChild(nameDiv);
        const btnWrap = document.createElement('div');
        btnWrap.style.display = 'flex';
        btnWrap.style.gap = '6px';
        const applyBtn = document.createElement('button');
        applyBtn.className = 'btn btn-primary';
        applyBtn.style.padding = '6px 8px;border-radius:8px';
        applyBtn.textContent = '应用';
        applyBtn.onclick = function () { applyIconPreset(p.name); modal.style.display = 'none'; };
        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn';
        renameBtn.style.padding = '6px 8px;border-radius:8px';
        renameBtn.textContent = '重命名';
        renameBtn.onclick = function () {
            const newName = prompt('输入新名称：', p.name);
            if (!newName) return;
            const all = _getIconPresets();
            all[idx].name = newName;
            _saveIconPresets(all);
            openIconPresetManageModal();
            populateIconPresetSelect();
        };
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn';
        deleteBtn.style.padding = '6px 8px;border-radius:8px;color:#e53935';
        deleteBtn.textContent = '删除';
        deleteBtn.onclick = function () {
            if (!confirm('确认删除该预设？')) return;
            const all = _getIconPresets();
            all.splice(idx, 1);
            _saveIconPresets(all);
            openIconPresetManageModal();
            populateIconPresetSelect();
        };
        btnWrap.appendChild(applyBtn);
        btnWrap.appendChild(renameBtn);
        btnWrap.appendChild(deleteBtn);
        row.appendChild(btnWrap);
        list.appendChild(row);
    });
    modal.style.display = 'flex';
}

function setupCustomizeApp() {
    const customizeForm = document.getElementById('customize-form');
    
    customizeForm.addEventListener('click', async (e) => {
        const target = e.target;

        const header = target.closest('.collapsible-header');
        if (header) {
            const section = header.closest('.collapsible-section');
            if (section) {
                section.classList.toggle('open');
                return; 
            }
        }

        if (target.matches('.reset-icon-btn')) {
            const iconId = target.dataset.id;
            if (db.customIcons) {
                delete db.customIcons[iconId];
            }
            await saveData();
            renderCustomizeForm();
            setupHomeScreen();
            showToast('图标已重置');
        }

        if (target.matches('#reset-widget-btn')) {
            if (confirm('确定要将小部件恢复为默认设置吗？')) {
                db.homeWidgetSettings = JSON.parse(JSON.stringify(defaultWidgetSettings));
                await saveData();
                renderCustomizeForm();
                setupHomeScreen();
                showToast('小部件已恢复默认');
            }
        }

        if (target.classList.contains('copy-css-btn')) {
            const codeBlock = target.closest('.css-template-card').querySelector('code');
            if (codeBlock) {
                navigator.clipboard.writeText(codeBlock.textContent.trim()).then(() => {
                    showToast('代码已复制到剪贴板！');
                }).catch(err => {
                    showToast('复制失败: ' + err);
                    console.error('Copy failed', err);
                });
            }
        }
        
        if (target.matches('#apply-global-css-now-btn')) {
            const textarea = document.getElementById('global-beautification-css');
            const newCss = textarea.value;
            db.globalCss = newCss;
            applyGlobalCss(newCss);
            await saveData();
            showToast('全局样式已应用');
        }
        
        if (target.matches('#global-css-import-doc-btn')) {
            document.getElementById('global-css-import-file').click();
            return;
        }
        if (target.matches('#bubble-css-import-doc-btn')) {
            document.getElementById('bubble-css-import-file').click();
            return;
        }
        if (target.matches('#group-bubble-css-import-doc-btn')) {
            document.getElementById('group-bubble-css-import-file').click();
            return;
        }
        
        if (target.matches('#reset-global-css-btn')) {
            const textarea = document.getElementById('global-beautification-css');
            textarea.value = '';
            db.globalCss = '';
            applyGlobalCss('');
            await saveData();
            showToast('已重置CSS内容');
        }
        
        if (target.matches('#global-css-apply-btn')) {
            const select = document.getElementById('global-css-preset-select');
            const presetName = select.value;
            if (!presetName) return showToast('请选择一个预设');
            const preset = db.globalCssPresets.find(p => p.name === presetName);
            if (preset) {
                const textarea = document.getElementById('global-beautification-css');
                textarea.value = preset.css;
                db.globalCss = preset.css;
                applyGlobalCss(preset.css);
                saveData();
                showToast('全局CSS预设已应用');
            }
        }
        
        if (target.matches('#global-css-save-btn')) {
            const textarea = document.getElementById('global-beautification-css');
            const css = textarea.value.trim();
            if (!css) return showToast('CSS内容为空，无法保存');
            const name = prompt('请输入此预设的名称（同名将覆盖）:');
            if (!name) return;
            if (!db.globalCssPresets) db.globalCssPresets = [];
            const existingIndex = db.globalCssPresets.findIndex(p => p.name === name);
            if (existingIndex > -1) {
                db.globalCssPresets[existingIndex].css = css;
            } else {
                db.globalCssPresets.push({ name, css });
            }
            saveData();
            populateGlobalCssPresetSelect();
            showToast('全局CSS预设已保存');
        }
        
        if (target.matches('#global-css-manage-btn')) {
            openGlobalCssManageModal();
        }
        
        if (target.matches('#apply-font-btn')) {
            const fontUrl = document.getElementById('customize-font-url').value.trim();
            db.fontUrl = fontUrl;
            await saveData();
            applyGlobalFont(fontUrl);
            showToast('新字体已应用！');
        }
        
        if (target.matches('#restore-font-btn')) {
            document.getElementById('customize-font-url').value = '';
            db.fontUrl = '';
            await saveData();
            applyGlobalFont('');
            showToast('已恢复默认字体！');
        }

        if (target.matches('#font-apply-preset-btn')) {
            const select = document.getElementById('font-preset-select');
            const presetName = select.value;
            if (!presetName) return showToast('请选择一个预设');
            applyFontPreset(presetName);
        }
        
        if (target.matches('#font-save-preset-btn')) {
            saveCurrentFontAsPreset();
        }
        
        if (target.matches('#font-manage-presets-btn')) {
            openFontManageModal();
        }

        if (target.matches('#sound-apply-preset-btn')) {
            const select = document.getElementById('sound-preset-select');
            const presetName = select.value;
            if (!presetName) return showToast('请选择一个预设');
            applySoundPreset(presetName);
        }
        
        if (target.matches('#sound-save-preset-btn')) {
            saveCurrentSoundAsPreset();
        }
        
        if (target.matches('#sound-manage-presets-btn')) {
            openSoundManageModal();
        }

        if (target.matches('#widget-apply-preset')) {
            const select = document.getElementById('widget-preset-select');
            const presetName = select && select.value;
            if (!presetName) return showToast('请选择一个预设');
            applyWidgetPreset(presetName);
        }
        if (target.matches('#widget-save-preset')) {
            saveCurrentWidgetAsPreset();
        }
        if (target.matches('#widget-manage-presets')) {
            openWidgetManageModal();
        }
        if (target.matches('#widget-presets-close-modal')) {
            const m = document.getElementById('widget-presets-modal');
            if (m) m.style.display = 'none';
        }

        if (target.matches('#widget-wallpaper-apply-preset')) {
            const select = document.getElementById('widget-wallpaper-preset-select');
            const presetName = select && select.value;
            if (!presetName) return showToast('请选择一个方案');
            applyWidgetWallpaperPreset(presetName);
        }
        if (target.matches('#widget-wallpaper-save-preset')) {
            saveCurrentWidgetWallpaperAsPreset();
        }
        if (target.matches('#widget-wallpaper-manage-presets')) {
            openWidgetWallpaperManageModal();
        }
        if (target.matches('#widget-wallpaper-export-btn')) {
            exportWidgetWallpaperScheme();
        }
        if (target.matches('#widget-wallpaper-import-btn')) {
            const input = document.getElementById('widget-wallpaper-import-file');
            if (input) input.click();
        }
        if (target.matches('#widget-wallpaper-reset-btn')) {
            resetWidgetWallpaperToDefault();
        }
        if (target.matches('#widget-wallpaper-presets-close-modal')) {
            const m = document.getElementById('widget-wallpaper-presets-modal');
            if (m) m.style.display = 'none';
        }

        if (target.matches('#icon-apply-preset-btn')) {
            const select = document.getElementById('icon-preset-select');
            const presetName = select && select.value;
            if (!presetName) return showToast('请选择一个预设');
            applyIconPreset(presetName);
        }
        if (target.matches('#icon-save-preset-btn')) {
            saveCurrentIconsAsPreset();
        }
        if (target.matches('#icon-manage-presets-btn')) {
            openIconPresetManageModal();
        }

        if (target.matches('#test-send-sound-btn')) {
            const url = document.getElementById('global-send-sound-url').value;
            if (url) {
                try {
                    const audio = new Audio(url);
                    audio.play().catch(e => showToast('播放失败: ' + e.message));
                } catch (e) {
                    showToast('无效的音频地址');
                }
            } else {
                showToast('未设置提示音');
            }
        }
        if (target.matches('#reset-send-sound-btn')) {
            document.getElementById('global-send-sound-url').value = '';
            db.globalSendSound = '';
            saveData();
            showToast('已重置');
        }
        if (target.matches('#test-receive-sound-btn')) {
            const url = document.getElementById('global-receive-sound-url').value;
            if (url) {
                try {
                    const audio = new Audio(url);
                    audio.play().catch(e => showToast('播放失败: ' + e.message));
                } catch (e) {
                    showToast('无效的音频地址');
                }
            } else {
                showToast('未设置提示音');
            }
        }
        if (target.matches('#reset-receive-sound-btn')) {
            document.getElementById('global-receive-sound-url').value = '';
            db.globalReceiveSound = '';
            saveData();
            showToast('已重置');
        }
        if (target.matches('#test-incoming-call-sound-btn')) {
            const url = document.getElementById('global-incoming-call-sound-url').value;
            if (url) {
                try {
                    const audio = new Audio(url);
                    audio.loop = true;
                    audio.play().catch(e => showToast('播放失败: ' + e.message));
                    setTimeout(() => audio.pause(), 3000);
                } catch (e) {
                    showToast('无效的音频地址');
                }
            } else {
                showToast('未设置提示音');
            }
        }
        if (target.matches('#reset-incoming-call-sound-btn')) {
            document.getElementById('global-incoming-call-sound-url').value = '';
            db.globalIncomingCallSound = '';
            saveData();
            showToast('已重置');
        }
    });

    customizeForm.addEventListener('input', async (e) => {
        const target = e.target;

        if (target.dataset.iconId) { 
            const iconId = target.dataset.iconId;
            const newUrl = target.value.trim();
            const previewImg = document.getElementById(`icon-preview-${iconId}`);
            if (newUrl) {
                if (!db.customIcons) db.customIcons = {};
                db.customIcons[iconId] = newUrl;
                if(previewImg) previewImg.src = newUrl;
            }
            await saveData();
            setupHomeScreen();
        } 
        else if (target.dataset.widgetPart) {
            const part = target.dataset.widgetPart;
            const prop = target.dataset.widgetProp;
            const newValue = target.value.trim();

            if (prop) { 
                db.homeWidgetSettings[part][prop] = newValue;
            } else { 
                db.homeWidgetSettings[part] = newValue;
            }
            await saveData();
            setupHomeScreen();
        }
    });

    customizeForm.addEventListener('change', async (e) => {
        if (e.target.id === 'widget-wallpaper-import-file') {
            const file = e.target.files && e.target.files[0];
            e.target.value = '';
            if (file) importWidgetWallpaperScheme(file);
            return;
        }
        if (e.target.id === 'global-css-import-file') {
            const file = e.target.files && e.target.files[0];
            e.target.value = '';
            if (!file) return;
            const ext = (file.name.split('.').pop() || '').toLowerCase();
            const textarea = document.getElementById('global-beautification-css');
            if (!textarea) return;
            try {
                let content = '';
                if (ext === 'txt') {
                    content = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (ev) => resolve(ev.target.result || '');
                        reader.onerror = () => reject(new Error('读取TXT失败'));
                        reader.readAsText(file, 'UTF-8');
                    });
                } else if (ext === 'docx') {
                    if (typeof mammoth === 'undefined') {
                        showToast('mammoth.js 未加载，无法解析 DOCX');
                        return;
                    }
                    content = await parseDocxFile(file);
                } else {
                    showToast('仅支持 .txt 或 .docx 文件');
                    return;
                }
                textarea.value = (content || '').trim();
                showToast('已导入文档内容');
            } catch (err) {
                console.error('导入文档失败', err);
                showToast('导入失败：' + (err.message || '未知错误'));
            }
            return;
        }
        if (e.target.id === 'bubble-css-import-file') {
            const file = e.target.files && e.target.files[0];
            e.target.value = '';
            if (!file) return;
            const ext = (file.name.split('.').pop() || '').toLowerCase();
            const textarea = document.getElementById('setting-custom-bubble-css');
            if (!textarea) return;
            try {
                let content = '';
                if (ext === 'txt') {
                    content = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (ev) => resolve(ev.target.result || '');
                        reader.onerror = () => reject(new Error('读取TXT失败'));
                        reader.readAsText(file, 'UTF-8');
                    });
                } else if (ext === 'docx') {
                    if (typeof mammoth === 'undefined') {
                        showToast('mammoth.js 未加载，无法解析 DOCX');
                        return;
                    }
                    content = await parseDocxFile(file);
                } else {
                    showToast('仅支持 .txt 或 .docx 文件');
                    return;
                }
                textarea.value = (content || '').trim();
                showToast('已导入文档内容');
            } catch (err) {
                console.error('导入文档失败', err);
                showToast('导入失败：' + (err.message || '未知错误'));
            }
            return;
        }
        if (e.target.id === 'group-bubble-css-import-file') {
            const file = e.target.files && e.target.files[0];
            e.target.value = '';
            if (!file) return;
            const ext = (file.name.split('.').pop() || '').toLowerCase();
            const textarea = document.getElementById('setting-group-custom-bubble-css');
            if (!textarea) return;
            try {
                let content = '';
                if (ext === 'txt') {
                    content = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (ev) => resolve(ev.target.result || '');
                        reader.onerror = () => reject(new Error('读取TXT失败'));
                        reader.readAsText(file, 'UTF-8');
                    });
                } else if (ext === 'docx') {
                    if (typeof mammoth === 'undefined') {
                        showToast('mammoth.js 未加载，无法解析 DOCX');
                        return;
                    }
                    content = await parseDocxFile(file);
                } else {
                    showToast('仅支持 .txt 或 .docx 文件');
                    return;
                }
                textarea.value = (content || '').trim();
                showToast('已导入文档内容');
            } catch (err) {
                console.error('导入文档失败', err);
                showToast('导入失败：' + (err.message || '未知错误'));
            }
            return;
        }
        if (e.target.matches('.icon-upload-input')) {
            const file = e.target.files[0];
            if (!file) return;
            const iconId = e.target.dataset.iconId;
            
            try {
                showToast('正在处理图片...');
                const compressedUrl = await compressImage(file, { quality: 0.8, maxWidth: 200, maxHeight: 200 });
                
                if (!db.customIcons) db.customIcons = {};
                db.customIcons[iconId] = compressedUrl;
                
                const previewImg = document.getElementById(`icon-preview-${iconId}`);
                const urlInput = document.querySelector(`input[data-icon-id="${iconId}"][type="url"]`);
                
                if (previewImg) previewImg.src = compressedUrl;
                if (urlInput) urlInput.value = compressedUrl;
                
                await saveData();
                setupHomeScreen();
                showToast('图标已更新');
            } catch (error) {
                console.error('图标上传失败', error);
                showToast('图片处理失败，请重试');
            } finally {
                e.target.value = null;
            }
        }

        if (e.target.id === 'global-send-sound-url') {
            db.globalSendSound = e.target.value.trim();
            saveData();
        }
        if (e.target.id === 'global-receive-sound-url') {
            db.globalReceiveSound = e.target.value.trim();
            saveData();
        }
        if (e.target.id === 'global-incoming-call-sound-url') {
            db.globalIncomingCallSound = e.target.value.trim();
            saveData();
        }
        if (e.target.id === 'multi-msg-sound-switch') {
            db.multiMsgSoundEnabled = e.target.checked;
            saveData();
        }
        if (e.target.id === 'global-send-sound-upload' || e.target.id === 'global-receive-sound-upload' || e.target.id === 'global-incoming-call-sound-upload') {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
                showToast('文件过大，请限制在 2MB 以内');
                e.target.value = null;
                return;
            }
            const reader = new FileReader();
            reader.onload = async (evt) => {
                const base64 = evt.target.result;
                if (e.target.id === 'global-send-sound-upload') {
                    db.globalSendSound = base64;
                    document.getElementById('global-send-sound-url').value = base64;
                } else if (e.target.id === 'global-receive-sound-upload') {
                    db.globalReceiveSound = base64;
                    document.getElementById('global-receive-sound-url').value = base64;
                } else {
                    db.globalIncomingCallSound = base64;
                    document.getElementById('global-incoming-call-sound-url').value = base64;
                }
                await saveData();
                showToast('提示音已上传');
            };
            reader.readAsDataURL(file);
            e.target.value = null;
        }
    });
}

function renderCustomizeForm() {
    const customizeForm = document.getElementById('customize-form');
    customizeForm.innerHTML = ''; 
    
    const container = document.createElement('div');
    container.className = 'kkt-settings-container';
    
    const iconOrder = [
        'chat-list-screen', 'api-settings-screen', 'wallpaper-screen',
        'world-book-screen', 'customize-screen', 'tutorial-screen',
        'day-mode-btn', 'night-mode-btn', 'forum-screen', 'music-screen', 'diary-screen', 'piggy-bank-screen', 'pomodoro-screen', 'storage-analysis-screen', 'theater-screen'
    ];

    let iconsContentHTML = '';
    iconOrder.forEach(id => {
        const { name, url } = defaultIcons[id];
        const currentIcon = (db.customIcons && db.customIcons[id]) || url;
        iconsContentHTML += `
        <div class="kkt-item">
            <div class="kkt-item-label">
                <img src="${currentIcon}" alt="${name}" class="kkt-small-avatar" id="icon-preview-${id}" style="width: 40px; height: 40px; border-radius: 10px; margin-right: 10px; object-fit: cover;">
                <span>${name || '模式切换'}</span>
            </div>
            <div class="kkt-item-control" style="gap: 8px;">
                <input type="url" placeholder="URL" value="${(db.customIcons && db.customIcons[id]) || ''}" data-icon-id="${id}" style="text-align:right; border:none; background:transparent; width: 100px; font-size: 13px; color: #888;">
                <input type="file" id="upload-icon-${id}" data-icon-id="${id}" accept="image/*" style="display:none;" class="icon-upload-input">
                <label for="upload-icon-${id}" class="btn btn-small btn-neutral" style="padding: 4px 8px; font-size: 12px; margin: 0; cursor: pointer;">📷</label>
                <button type="button" class="reset-icon-btn btn btn-small" data-id="${id}" style="padding: 4px 8px; font-size: 12px; margin: 0; background-color: #f0f0f0; color: #666; border:none;">↺</button>
            </div>
        </div>`;
    });

    const iconsSectionHTML = `
    <div class="kkt-group collapsible-section" style="background-color: #fff; border: none; margin-bottom: 15px;">
        <div class="kkt-item collapsible-header" style="background-color: #fff; border-bottom: 1px solid #f5f5f5; cursor: pointer; padding: 15px;">
            <div class="kkt-item-label" style="font-weight:bold; color:#333; font-size: 15px;">应用图标自定义</div>
            <span class="collapsible-arrow">▼</span>
        </div>
        <div class="collapsible-content">
            ${iconsContentHTML}
            <div style="background:#f9f9f9; padding:10px; border-radius:8px; margin:15px 15px 15px 15px; border: 1px solid #f0f0f0;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                    <label for="icon-preset-select" style="width:auto;color:#666;font-size:13px;">图标预设库</label>
                    <select id="icon-preset-select" style="flex:1;padding:6px;border-radius:6px;border:1px solid #ddd;font-size:13px; background: transparent;"><option value="">— 选择 —</option></select>
                </div>
                <div style="display:flex;gap:8px;justify-content: flex-end;">
                    <button type="button" id="icon-apply-preset-btn" class="btn btn-small btn-primary" style="padding:4px 8px;">应用</button>
                    <button type="button" id="icon-save-preset-btn" class="btn btn-small" style="padding:4px 8px;">保存</button>
                    <button type="button" id="icon-manage-presets-btn" class="btn btn-small" style="padding:4px 8px;">管理</button>
                </div>
            </div>
        </div>
    </div>
    `;
    
    const widgetSectionHTML = `
    <div class="kkt-group collapsible-section" style="background-color: #fff; border: none; margin-bottom: 15px;">
        <div class="kkt-item collapsible-header" style="background-color: #fff; border-bottom: 1px solid #f5f5f5; cursor: pointer; padding: 15px;">
            <div class="kkt-item-label" style="font-weight:bold; color:#333; font-size: 15px;">主页小部件设置</div>
            <span class="collapsible-arrow">▼</span>
        </div>
        <div class="collapsible-content">
            <div class="kkt-item" style="display:block; padding: 15px;">
                <div style="background:#f9f9f9; padding:10px; border-radius:8px; margin-bottom:12px; border: 1px solid #f0f0f0;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                        <label for="widget-preset-select" style="width:auto;color:#666;font-size:13px;">预设库</label>
                        <select id="widget-preset-select" style="flex:1;padding:6px;border-radius:6px;border:1px solid #ddd;font-size:13px; background: transparent;"><option value="">— 选择预设 —</option></select>
                    </div>
                    <div style="display:flex;gap:8px;justify-content: flex-end;">
                        <button type="button" id="widget-apply-preset" class="btn btn-small btn-primary" style="padding:4px 8px;">应用</button>
                        <button type="button" id="widget-save-preset" class="btn btn-small" style="padding:4px 8px;">保存</button>
                        <button type="button" id="widget-manage-presets" class="btn btn-small" style="padding:4px 8px;">管理</button>
                    </div>
                </div>
                <p style="font-size: 13px; color: #888; margin-bottom: 10px; line-height: 1.5;">主屏幕上的小组件内容可以直接点击编辑，失焦后自动保存。<br>中央头像则是在主屏幕点击后弹窗更换。</p>
                <div style="display: flex; justify-content: flex-end;">
                     <button type="button" id="reset-widget-btn" class="btn btn-neutral btn-small" style="width: auto;">恢复默认</button>
                </div>
            </div>
        </div>
    </div>
    `;

    const widgetWallpaperSectionHTML = `
    <div class="kkt-group collapsible-section" style="background-color: #fff; border: none; margin-bottom: 15px;">
        <div class="kkt-item collapsible-header" style="background-color: #fff; border-bottom: 1px solid #f5f5f5; cursor: pointer; padding: 15px;">
            <div class="kkt-item-label" style="font-weight:bold; color:#333; font-size: 15px;">小组件和壁纸</div>
            <span class="collapsible-arrow">▼</span>
        </div>
        <div class="collapsible-content">
            <div class="kkt-item" style="display:block; padding: 15px;">
                <p style="font-size: 13px; color: #888; margin-bottom: 12px; line-height: 1.5;">将当前主屏幕的「所有小组件 + 壁纸」保存为方案，可导出分享或导入他人方案；一键恢复默认。</p>
                <div style="background:#f9f9f9; padding:10px; border-radius:8px; margin-bottom:12px; border: 1px solid #f0f0f0;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                        <label for="widget-wallpaper-preset-select" style="width:auto;color:#666;font-size:13px;">方案预设库</label>
                        <select id="widget-wallpaper-preset-select" style="flex:1;padding:6px;border-radius:6px;border:1px solid #ddd;font-size:13px; background: transparent;"><option value="">— 选择方案 —</option></select>
                    </div>
                    <div style="display:flex;gap:8px;justify-content: flex-end; flex-wrap: wrap;">
                        <button type="button" id="widget-wallpaper-apply-preset" class="btn btn-small btn-primary" style="padding:4px 8px;">应用</button>
                        <button type="button" id="widget-wallpaper-save-preset" class="btn btn-small" style="padding:4px 8px;">保存为方案</button>
                        <button type="button" id="widget-wallpaper-manage-presets" class="btn btn-small" style="padding:4px 8px;">管理</button>
                    </div>
                </div>
                <div style="display:flex;gap:8px;justify-content: flex-end; flex-wrap: wrap; margin-bottom: 12px;">
                    <button type="button" id="widget-wallpaper-export-btn" class="btn btn-small btn-neutral" style="padding:4px 8px;">导出方案</button>
                    <button type="button" id="widget-wallpaper-import-btn" class="btn btn-small btn-neutral" style="padding:4px 8px;">导入方案</button>
                </div>
                <div style="display: flex; justify-content: flex-end;">
                    <button type="button" id="widget-wallpaper-reset-btn" class="btn btn-neutral btn-small" style="width: auto;">恢复默认（小组件+壁纸）</button>
                </div>
                <input type="file" id="widget-wallpaper-import-file" accept=".json,.ee" style="display:none;">
            </div>
        </div>
    </div>
    `;

    const globalCssSectionHTML = `
    <div class="kkt-group collapsible-section" style="background-color: #fff; border: none; margin-bottom: 15px;">
        <div class="kkt-item collapsible-header" style="background-color: #fff; border-bottom: 1px solid #f5f5f5; cursor: pointer; padding: 15px;">
            <div class="kkt-item-label" style="font-weight:bold; color:#333; font-size: 15px;">全局CSS美化</div>
            <span class="collapsible-arrow">▼</span>
        </div>
        <div class="collapsible-content">
            <div class="kkt-item" style="display:block; padding: 15px;">
                <div class="form-group" style="margin-bottom: 15px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <label for="global-beautification-css" style="font-weight: bold; font-size: 14px; color: var(--primary-color); margin-bottom: 0;">CSS代码</label>
                        <div style="display: flex; gap: 8px;">
                            <button type="button" id="global-css-import-doc-btn" class="btn btn-small" style="width:auto;">导入文档</button>
                            <button type="button" id="apply-global-css-now-btn" class="btn btn-primary btn-small" style="width:auto;">立即应用</button>
                            <button type="button" id="reset-global-css-btn" class="btn btn-small" style="width:auto;">重置</button>
                        </div>
                    </div>
                    <input type="file" id="global-css-import-file" accept=".txt,.docx" style="display:none;">
                    <textarea id="global-beautification-css" class="form-group" rows="8" placeholder="在此输入CSS代码..." style="width:100%; border:1px solid #eee; border-radius:8px; padding:10px;"></textarea>
                </div>
                
                <div style="background:#f9f9f9; padding:10px; border-radius:8px; margin-bottom:15px; border: 1px solid #f0f0f0;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                        <label for="global-css-preset-select" style="width:auto;color:#666;font-size:13px;">预设库</label>
                        <select id="global-css-preset-select" style="flex:1;padding:6px;border-radius:6px;border:1px solid #ddd;font-size:13px; background: transparent;"><option value="">-- 选择 --</option></select>
                    </div>
                    <div style="display:flex;gap:8px;justify-content: flex-end;">
                        <button type="button" id="global-css-apply-btn" class="btn btn-small btn-primary" style="padding:4px 8px;">应用</button>
                        <button type="button" id="global-css-save-btn" class="btn btn-small" style="padding:4px 8px;">保存</button>
                        <button type="button" id="global-css-manage-btn" class="btn btn-small" style="padding:4px 8px;">管理</button>
                    </div>
                </div>

                <div class="css-template-module" style="border-top: 1px solid #eee; padding-top: 15px;">
                    <h5 style="font-size: 14px; color: var(--secondary-color); margin-bottom: 15px; margin-top: 0;">拓展美化代码库</h5>
                    <div class="css-template-list" style="display: flex; flex-direction: column; gap: 10px;">

                        <div class="css-template-card" style="background: #fff; border: 1px solid #eee; border-radius: 10px; padding: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <h6 style="margin: 0; font-size: 1em; color: #333;">隐藏聊天顶栏线</h6>
                                <button type="button" class="btn btn-secondary btn-small copy-css-btn">复制</button>
                            </div>
                            <pre style="background: #f5f5f5; padding: 10px; border-radius: 8px; white-space: pre-wrap; word-wrap: break-word; font-size: 12px; max-height: 150px; overflow-y: auto;"><code>/* --- 3. 进入聊天界面-顶部栏的底部那条线的隐藏 --- */
#chat-room-screen .app-header {
border-bottom: none !important;
}</code></pre>
                        </div>
                    
                        <div class="css-template-card" style="background: #fff; border: 1px solid #eee; border-radius: 10px; padding: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <h6 style="margin: 0; font-size: 1em; color: #333;">隐藏头像</h6>
                                <button type="button" class="btn btn-secondary btn-small copy-css-btn">复制</button>
                            </div>
                            <pre style="background: #f5f5f5; padding: 10px; border-radius: 8px; white-space: pre-wrap; word-wrap: break-word; font-size: 12px; max-height: 150px; overflow-y: auto;"><code>/* --- 隐藏聊天界面的所有头像和时间戳 --- */
.message-info {
display: none !important;
}

/* --- 修正语音和翻译气泡的边距 --- */
.voice-transcript, .translation-text {
margin-left: 8px !important;
margin-right: 8px !important;
}

/* 确保发送方的语音/翻译气泡仍然正确对齐 */
.message-wrapper.sent .voice-transcript,
.message-wrapper.sent .translation-text {
align-self: flex-end;
margin-left: auto !important;
}</code></pre>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    </div>
    `;
    
    const fontsSectionHTML = `
    <div class="kkt-group collapsible-section" style="background-color: #fff; border: none; margin-bottom: 15px;">
        <div class="kkt-item collapsible-header" style="background-color: #fff; border-bottom: 1px solid #f5f5f5; cursor: pointer; padding: 15px;">
            <div class="kkt-item-label" style="font-weight:bold; color:#333; font-size: 15px;">字体设置</div>
            <span class="collapsible-arrow">▼</span>
        </div>
        <div class="collapsible-content">
            <div class="kkt-item" style="display:block; padding: 15px;">
                <!-- Font Size Slider -->
                <div class="form-group" style="margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <label style="font-weight: bold; font-size: 14px; color: var(--primary-color);">全局字体大小</label>
                        <span id="font-size-value" style="color: var(--primary-color); font-weight: bold;">${(db.fontSizeScale || 1.0).toFixed(1)}x</span>
                    </div>
                    <input type="range" id="font-size-slider" min="0.8" max="1.5" step="0.1" value="${db.fontSizeScale || 1.0}" style="width: 100%; accent-color: var(--primary-color);">
                </div>

                <div class="form-group">
                    <label for="customize-font-url" style="font-weight: bold; font-size: 14px; color: var(--primary-color);">字体文件 URL</label>
                    <input type="url" id="customize-font-url" placeholder="例如：https://example.com/font.woff2" value="${db.fontUrl || ''}" style="width:100%; border:1px solid #eee; border-radius:8px; padding:10px;">
                    <p style="font-size: 12px; color: #999; margin-top: 5px;">支持 woff2, woff, ttf 格式。设置后将应用到全局。</p>
                </div>

                <!-- 字体预设管理区域 -->
                <div style="background:#f9f9f9; padding:10px; border-radius:8px; margin-top:15px; margin-bottom:15px; border: 1px solid #f0f0f0;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                        <label for="font-preset-select" style="width:auto;color:#666;font-size:13px;">预设库</label>
                        <select id="font-preset-select" style="flex:1;padding:6px;border-radius:6px;border:1px solid #ddd;font-size:13px; background: transparent;"><option value="">— 选择 —</option></select>
                    </div>
                    <div style="display:flex;gap:8px;justify-content: flex-end;">
                        <button type="button" id="font-apply-preset-btn" class="btn btn-small btn-primary" style="padding:4px 8px;">应用</button>
                        <button type="button" id="font-save-preset-btn" class="btn btn-small" style="padding:4px 8px;">保存</button>
                        <button type="button" id="font-manage-presets-btn" class="btn btn-small" style="padding:4px 8px;">管理</button>
                    </div>
                </div>

                <div style="display:flex; gap:10px; justify-content: flex-end; margin-top: 15px;">
                    <button type="button" id="restore-font-btn" class="btn btn-neutral btn-small">恢复默认</button>
                    <button type="button" id="apply-font-btn" class="btn btn-primary btn-small">直接应用</button>
                </div>
            </div>
        </div>
    </div>
    `;

    const soundSectionHTML = `
    <div class="kkt-group collapsible-section" style="background-color: #fff; border: none; margin-bottom: 15px;">
        <div class="kkt-item collapsible-header" style="background-color: #fff; border-bottom: 1px solid #f5f5f5; cursor: pointer; padding: 15px;">
            <div class="kkt-item-label" style="font-weight:bold; color:#333; font-size: 15px;">提示音设置</div>
            <span class="collapsible-arrow">▼</span>
        </div>
        <div class="collapsible-content">
            <div class="kkt-item" style="display:block; padding: 15px;">
                <div class="form-group" style="margin-bottom: 15px;">
                    <label style="font-weight: bold; font-size: 14px; color: var(--primary-color);">开始生成提示音</label>
                    <div style="display: flex; gap: 8px; margin-top: 5px;">
                        <input type="url" id="global-send-sound-url" placeholder="音频URL" value="${db.globalSendSound || ''}" style="flex: 1; border: 1px solid #eee; border-radius: 8px; padding: 8px;">
                        <input type="file" id="global-send-sound-upload" accept="audio/*" style="display: none;">
                        <label for="global-send-sound-upload" class="btn btn-secondary btn-small" style="margin: 0; display: flex; align-items: center; cursor: pointer;">📂</label>
                        <button type="button" id="test-send-sound-btn" class="btn btn-primary btn-small" style="margin: 0;">▶</button>
                        <button type="button" id="reset-send-sound-btn" class="btn btn-danger btn-small" style="margin: 0;">×</button>
                    </div>
                </div>
                <div class="form-group">
                    <label style="font-weight: bold; font-size: 14px; color: var(--primary-color);">收到回复提示音</label>
                    <div style="display: flex; gap: 8px; margin-top: 5px;">
                        <input type="url" id="global-receive-sound-url" placeholder="音频URL" value="${db.globalReceiveSound || ''}" style="flex: 1; border: 1px solid #eee; border-radius: 8px; padding: 8px;">
                        <input type="file" id="global-receive-sound-upload" accept="audio/*" style="display: none;">
                        <label for="global-receive-sound-upload" class="btn btn-secondary btn-small" style="margin: 0; display: flex; align-items: center; cursor: pointer;">📂</label>
                        <button type="button" id="test-receive-sound-btn" class="btn btn-primary btn-small" style="margin: 0;">▶</button>
                        <button type="button" id="reset-receive-sound-btn" class="btn btn-danger btn-small" style="margin: 0;">×</button>
                    </div>
                </div>
                <div class="form-group">
                    <label style="font-weight: bold; font-size: 14px; color: var(--primary-color);">来电提示音</label>
                    <div style="display: flex; gap: 8px; margin-top: 5px;">
                        <input type="url" id="global-incoming-call-sound-url" placeholder="音频URL" value="${db.globalIncomingCallSound || ''}" style="flex: 1; border: 1px solid #eee; border-radius: 8px; padding: 8px;">
                        <input type="file" id="global-incoming-call-sound-upload" accept="audio/*" style="display: none;">
                        <label for="global-incoming-call-sound-upload" class="btn btn-secondary btn-small" style="margin: 0; display: flex; align-items: center; cursor: pointer;">📂</label>
                        <button type="button" id="test-incoming-call-sound-btn" class="btn btn-primary btn-small" style="margin: 0;">▶</button>
                        <button type="button" id="reset-incoming-call-sound-btn" class="btn btn-danger btn-small" style="margin: 0;">×</button>
                    </div>
                    <p style="font-size: 12px; color: #999; margin-top: 5px;">角色主动发起通话时循环播放，接听或拒绝后停止。不设置则来电时不播放任何声音。</p>
                </div>
                
                <div class="form-group" style="margin-top: 15px; display: flex; justify-content: space-between; align-items: center;">
                    <label for="multi-msg-sound-switch" style="font-weight: bold; font-size: 14px; color: var(--primary-color); margin-bottom: 0;">多条消息连续提示音</label>
                    <label class="switch">
                        <input type="checkbox" id="multi-msg-sound-switch" ${db.multiMsgSoundEnabled ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                </div>
                <p style="font-size: 12px; color: #999; margin-top: 5px;">开启后，AI 连续回复的多条消息（气泡）都会触发提示音。关闭则仅第一条触发。</p>

                <p style="font-size: 12px; color: #999; margin-top: 10px;">支持 URL 或本地上传 (mp3, wav, ogg)。本地文件将转为 Base64 存储 (限 2MB)。</p>

                <!-- 提示音预设管理区域 -->
                <div style="background:#f9f9f9; padding:10px; border-radius:8px; margin-top:15px; margin-bottom:15px; border: 1px solid #f0f0f0;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                        <label for="sound-preset-select" style="width:auto;color:#666;font-size:13px;">预设库</label>
                        <select id="sound-preset-select" style="flex:1;padding:6px;border-radius:6px;border:1px solid #ddd;font-size:13px; background: transparent;"><option value="">— 选择 —</option></select>
                    </div>
                    <div style="display:flex;gap:8px;justify-content: flex-end;">
                        <button type="button" id="sound-apply-preset-btn" class="btn btn-small btn-primary" style="padding:4px 8px;">应用</button>
                        <button type="button" id="sound-save-preset-btn" class="btn btn-small" style="padding:4px 8px;">保存</button>
                        <button type="button" id="sound-manage-presets-btn" class="btn btn-small" style="padding:4px 8px;">管理</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;
    
    container.innerHTML = iconsSectionHTML + widgetSectionHTML + widgetWallpaperSectionHTML + fontsSectionHTML + soundSectionHTML + globalCssSectionHTML;
    customizeForm.appendChild(container);

    populateGlobalCssPresetSelect();
    populateFontPresetSelect();
    populateSoundPresetSelect();
    populateWidgetPresetSelect();
    populateWidgetWallpaperPresetSelect();
    populateIconPresetSelect();

    const fontSizeSlider = document.getElementById('font-size-slider');
    const fontSizeValue = document.getElementById('font-size-value');
    if (fontSizeSlider) {
        fontSizeSlider.addEventListener('input', (e) => {
            const scale = parseFloat(e.target.value);
            fontSizeValue.textContent = `${scale.toFixed(1)}x`;
            applyFontSize(scale);
        });
        fontSizeSlider.addEventListener('change', async (e) => {
            const scale = parseFloat(e.target.value);
            db.fontSizeScale = scale;
            await saveData();
            showToast('字体大小已保存');
        });
    }

    const globalCssTextarea = document.getElementById('global-beautification-css');
    if (globalCssTextarea) {
        globalCssTextarea.value = db.globalCss || '';
    }
}


// ============================================
// TTS 预设管理
// ============================================

function saveCurrentTTSAsPreset() {
    const name = prompt('请输入 TTS 预设名称：');
    if (!name || !name.trim()) return;
    
    const enabled = document.getElementById('minimax-tts-enabled')?.checked || false;
    const groupId = document.getElementById('minimax-group-id')?.value || '';
    const apiKey = document.getElementById('minimax-api-key')?.value || '';
    const domain = document.getElementById('minimax-domain')?.value || 'api.minimaxi.com';
    const model = document.getElementById('minimax-tts-model')?.value || 'speech-2.8-hd';
    
    if (!db.ttsPresets) db.ttsPresets = [];
    
    db.ttsPresets.push({
        name: name.trim(),
        enabled,
        groupId,
        apiKey,
        domain,
        model
    });
    
    saveData();
    showToast('TTS 预设已保存');
    populateTTSPresetSelect();
}

function applyTTSPreset(name) {
    if (!db.ttsPresets) return;
    const preset = db.ttsPresets.find(p => p.name === name);
    if (!preset) return showToast('预设不存在');
    
    document.getElementById('minimax-tts-enabled').checked = preset.enabled || false;
    document.getElementById('minimax-group-id').value = preset.groupId || '';
    document.getElementById('minimax-api-key').value = preset.apiKey || '';
    document.getElementById('minimax-domain').value = preset.domain || 'api.minimaxi.com';
    document.getElementById('minimax-tts-model').value = preset.model || 'speech-2.8-hd';
    
    showToast(`已应用 TTS 预设：${name}`);
}

function populateTTSPresetSelect() {
    const select = document.getElementById('tts-preset-select');
    if (!select) return;
    select.innerHTML = '<option value="">— 选择 —</option>';
    (db.ttsPresets || []).forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        select.appendChild(opt);
    });
}

function openTTSManageModal() {
    const modal = document.getElementById('tts-presets-modal');
    const list = document.getElementById('tts-presets-list');
    if (!modal || !list) return;
    list.innerHTML = '';
    const presets = db.ttsPresets || [];
    if (!presets.length) list.innerHTML = '<p style="color:#888;margin:6px 0;">暂无预设</p>';
    
    presets.forEach((p, idx) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '8px 0';
        row.style.borderBottom = '1px solid #f0f0f0';
        
        const nameDiv = document.createElement('div');
        nameDiv.style.flex = '1';
        nameDiv.textContent = p.name;
        row.appendChild(nameDiv);

        const btnWrap = document.createElement('div');
        btnWrap.style.display = 'flex';
        btnWrap.style.gap = '6px';

        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn';
        renameBtn.style.padding = '6px 8px';
        renameBtn.textContent = '重命名';
        renameBtn.onclick = function() {
            const newName = prompt('输入新名称：', p.name);
            if (!newName || newName === p.name) return;
            db.ttsPresets[idx].name = newName;
            saveData();
            openTTSManageModal();
            populateTTSPresetSelect();
        };

        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-danger';
        delBtn.style.padding = '6px 8px';
        delBtn.textContent = '删除';
        delBtn.onclick = function() {
            if (!confirm('确定删除预设 "' + p.name + '" ?')) return;
            db.ttsPresets.splice(idx, 1);
            saveData();
            openTTSManageModal();
            populateTTSPresetSelect();
        };

        btnWrap.appendChild(renameBtn);
        btnWrap.appendChild(delBtn);
        row.appendChild(btnWrap);
        list.appendChild(row);
    });
    modal.style.display = 'flex';
}

function importTTSPresets() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const imported = JSON.parse(text);
            if (!Array.isArray(imported)) throw new Error('格式错误');
            db.ttsPresets = db.ttsPresets || [];
            db.ttsPresets.push(...imported);
            await saveData();
            populateTTSPresetSelect();
            showToast(`已导入 ${imported.length} 个 TTS 预设`);
        } catch (err) {
            showToast('导入失败: ' + err.message);
        }
    };
    input.click();
}

function exportTTSPresets() {
    const presets = db.ttsPresets || [];
    if (!presets.length) return showToast('没有可导出的 TTS 预设');
    const blob = new Blob([JSON.stringify(presets, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tts_presets_' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('TTS 预设已导出');
}

// 在页面加载时填充 TTS 预设列表，并绑定气泡样式「导入文档」（委托到 document，因按钮在 chat/group-settings-form 内）
document.addEventListener('DOMContentLoaded', () => {
    populateTTSPresetSelect();

    document.addEventListener('click', (e) => {
        if (e.target.matches('#bubble-css-import-doc-btn')) {
            const el = document.getElementById('bubble-css-import-file');
            if (el) el.click();
        } else if (e.target.matches('#group-bubble-css-import-doc-btn')) {
            const el = document.getElementById('group-bubble-css-import-file');
            if (el) el.click();
        }
    });
    document.addEventListener('change', async (e) => {
        if (e.target.id === 'bubble-css-import-file' || e.target.id === 'group-bubble-css-import-file') {
            const file = e.target.files && e.target.files[0];
            e.target.value = '';
            const textareaId = e.target.id === 'bubble-css-import-file' ? 'setting-custom-bubble-css' : 'setting-group-custom-bubble-css';
            if (!file) return;
            const ext = (file.name.split('.').pop() || '').toLowerCase();
            const textarea = document.getElementById(textareaId);
            if (!textarea) return;
            try {
                let content = '';
                if (ext === 'txt') {
                    content = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (ev) => resolve(ev.target.result || '');
                        reader.onerror = () => reject(new Error('读取TXT失败'));
                        reader.readAsText(file, 'UTF-8');
                    });
                } else if (ext === 'docx') {
                    if (typeof mammoth === 'undefined') {
                        showToast('mammoth.js 未加载，无法解析 DOCX');
                        return;
                    }
                    content = await parseDocxFile(file);
                } else {
                    showToast('仅支持 .txt 或 .docx 文件');
                    return;
                }
                textarea.value = (content || '').trim();
                showToast('已导入文档内容');
            } catch (err) {
                console.error('导入文档失败', err);
                showToast('导入失败：' + (err.message || '未知错误'));
            }
        }
    });
});


// 备份提示
function promptForBackupIfNeeded(triggerType) {
    if (triggerType === 'history_milestone') {
        showToast('uwu提醒您：记得备份噢');
    }
}

// 重新计算并更新角色状态
function recalculateChatStatus(chat) {
    if (!chat || !chat.history) return;
    
    // 仅针对私聊且非群聊
    // 注意：虽然函数参数叫 chat，但在调用处需确保是 private 类型或者在这里判断
    // 由于群聊没有状态栏，这里主要针对 private
    // 但为了通用性，我们可以检查 chat.realName 是否存在
    
    if (!chat.realName) return; // 简单判断，群聊通常没有单人的 realName 用于状态更新（群聊逻辑不同）

    const updateStatusRegex = new RegExp(`\\[${chat.realName}更新状态为：(.*?)\\]`);
    let foundStatus = '在线'; // 默认状态

    // 倒序遍历历史记录
    for (let i = chat.history.length - 1; i >= 0; i--) {
        const msg = chat.history[i];
        // 忽略被撤回的消息
        if (msg.isWithdrawn) continue;

        const match = msg.content.match(updateStatusRegex);
        if (match) {
            foundStatus = match[1];
            break; // 找到最近的一个状态，停止遍历
        }
    }

    // 更新状态
    chat.status = foundStatus;
    
    // 如果当前正在该聊天室，实时更新 UI
    if (currentChatId === chat.id) {
        const statusTextEl = document.getElementById('chat-room-status-text');
        if (statusTextEl) {
            statusTextEl.textContent = foundStatus;
        }
    }
}
