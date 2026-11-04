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

    const pokeEnabled = document.getElementById('setting-poke-enabled');
    const pokeOptions = document.getElementById('setting-poke-options');
    if (pokeEnabled && pokeOptions) {
        pokeEnabled.addEventListener('change', () => {
            pokeOptions.style.display = pokeEnabled.checked ? 'block' : 'none';
        });
    }
    
    document.getElementById('chat-settings-btn')?.addEventListener('click', () => {
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
    
    document.querySelector('.phone-screen')?.addEventListener('click', e => {
        const openSidebar = document.querySelector('.settings-sidebar.open');
        if (openSidebar && !openSidebar.contains(e.target) && !e.target.closest('.action-btn') && !e.target.closest('.modal-overlay') && !e.target.closest('.action-sheet-overlay')) {
            openSidebar.classList.remove('open');
        }
    });

    document.getElementById('chat-settings-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveSettingsFromSidebar();
    });

    document.getElementById('chat-scroll-to-top-current-btn')?.addEventListener('click', () => {
        switchScreen('chat-room-screen');
        setTimeout(() => {
            const area = document.getElementById('message-area');
            if (area) area.scrollTop = 0;
        }, 80);
    });
    document.getElementById('chat-scroll-to-top-all-btn')?.addEventListener('click', () => {
        switchScreen('chat-room-screen');
        setTimeout(() => {
            const chat = (typeof currentChatType !== 'undefined' && currentChatType === 'private')
                ? db.characters.find(c => c.id === currentChatId)
                : db.groups.find(g => g.id === currentChatId);
            if (chat && chat.history && chat.history.length > 0 && typeof renderMessages === 'function') {
                const pageSize = (typeof MESSAGES_PER_PAGE !== 'undefined') ? MESSAGES_PER_PAGE : 50;
                currentPage = Math.ceil(chat.history.length / pageSize) || 1;
                renderMessages(false, false);
                const area = document.getElementById('message-area');
                if (area) area.scrollTop = 0;
            }
        }, 80);
    });
    document.getElementById('chat-scroll-to-bottom-btn')?.addEventListener('click', () => {
        switchScreen('chat-room-screen');
        setTimeout(() => {
            const area = document.getElementById('message-area');
            if (area) area.scrollTop = area.scrollHeight;
        }, 80);
    });

    const scrollToTopOrBottomGroup = (mode) => {
        switchScreen('chat-room-screen');
        setTimeout(() => {
            const area = document.getElementById('message-area');
            if (!area) return;
            if (mode === 'bottom') {
                area.scrollTop = area.scrollHeight;
                return;
            }
            if (mode === 'topAll') {
                const chat = (typeof currentChatType !== 'undefined' && currentChatType === 'group')
                    ? db.groups.find(g => g.id === currentChatId)
                    : db.characters.find(c => c.id === currentChatId);
                if (chat && chat.history && chat.history.length > 0 && typeof renderMessages === 'function') {
                    const pageSize = (typeof MESSAGES_PER_PAGE !== 'undefined') ? MESSAGES_PER_PAGE : 50;
                    currentPage = Math.ceil(chat.history.length / pageSize) || 1;
                    renderMessages(false, false);
                    area.scrollTop = 0;
                }
            } else {
                area.scrollTop = 0;
            }
        }, 80);
    };
    const groupTopCurrentBtn = document.getElementById('group-chat-scroll-to-top-current-btn');
    const groupTopAllBtn = document.getElementById('group-chat-scroll-to-top-all-btn');
    const groupBottomBtn = document.getElementById('group-chat-scroll-to-bottom-btn');
    if (groupTopCurrentBtn) groupTopCurrentBtn.addEventListener('click', () => scrollToTopOrBottomGroup('topCurrent'));
    if (groupTopAllBtn) groupTopAllBtn.addEventListener('click', () => scrollToTopOrBottomGroup('topAll'));
    if (groupBottomBtn) groupBottomBtn.addEventListener('click', () => scrollToTopOrBottomGroup('bottom'));

    // --- Tab 切换逻辑 ---
    // 仅选择聊天设置和群聊设置中的 Tab，排除 CoT 设置
    const tabs = document.querySelectorAll('#chat-settings-screen .settings-tab-item, #group-settings-screen .settings-tab-item');
    const contents = document.querySelectorAll('.settings-tab-content');

    tabs.forEach(tab => {
        tab?.addEventListener('click', () => {
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
            // 从拓展 Tab 切走时关闭「头像识别系统」子页，避免再切回拓展时还停在子页
            const avatarPanel = document.getElementById('setting-avatar-system-panel');
            const extTab = document.getElementById('setting-tab-ext');
            if (avatarPanel) avatarPanel.style.display = 'none';
            if (extTab) extTab.style.display = '';
        });
    });

    // 头像识别系统：拓展 Tab 内一行入口，点击进入子页面
    const avatarSystemEntry = document.getElementById('setting-avatar-system-entry');
    const avatarSystemPanel = document.getElementById('setting-avatar-system-panel');
    const avatarSystemBack = document.getElementById('setting-avatar-system-back');
    if (avatarSystemEntry && avatarSystemPanel) {
        avatarSystemEntry?.addEventListener('click', () => {
            if (document.getElementById('setting-tab-ext')) document.getElementById('setting-tab-ext').style.display = 'none';
            avatarSystemPanel.style.display = 'block';
        });
    }
    if (avatarSystemBack && avatarSystemPanel) {
        avatarSystemBack?.addEventListener('click', () => {
            avatarSystemPanel.style.display = 'none';
            if (document.getElementById('setting-tab-ext')) document.getElementById('setting-tab-ext').style.display = '';
        });
    }
    
    const useCustomCssCheckbox = document.getElementById('setting-use-custom-css'),
        customCssTextarea = document.getElementById('setting-custom-bubble-css'),
        resetCustomCssBtn = document.getElementById('reset-custom-bubble-css-btn'),
        privatePreviewBox = document.getElementById('private-bubble-css-preview');
        
    useCustomCssCheckbox?.addEventListener('change', (e) => {
        triggerHapticFeedback('light');
        if (customCssTextarea) customCssTextarea.disabled = !e.target.checked;
        const char = db.characters.find(c => c.id === currentChatId);
        if (char) {
            const themeKey = char.theme || 'white_pink';
            const theme = colorThemes[themeKey];
            updateBubbleCssPreview(privatePreviewBox, customCssTextarea ? customCssTextarea.value : '', !e.target.checked, theme);
        }
    });
    
    customCssTextarea?.addEventListener('input', (e) => {
        const char = db.characters.find(c => c.id === currentChatId);
        if (char && useCustomCssCheckbox && useCustomCssCheckbox.checked) {
            const themeKey = char.theme || 'white_pink';
            const theme = colorThemes[themeKey];
            updateBubbleCssPreview(privatePreviewBox, e.target.value, false, theme);
        }
    });
    
    resetCustomCssBtn?.addEventListener('click', () => {
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
    
    document.getElementById('setting-char-avatar-upload')?.addEventListener('change', async (e) => {
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
    
    document.getElementById('setting-my-avatar-upload')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const char = db.characters.find(c => c.id === currentChatId);
        if (!char) return;
        try {
            const compressedUrl = await compressImage(file, {quality: 0.8, maxWidth: 400, maxHeight: 400});
            const oldMyAvatar = char.myAvatar;
            if (oldMyAvatar && compressedUrl !== oldMyAvatar && window.AvatarSystem && char.charSenseAvatarChangeEnabled) {
                showToast('正在识别头像变化…');
                await window.AvatarSystem.recognizeAndNotifyUserAvatarChange(currentChatId, oldMyAvatar, compressedUrl);
            }
            if (window.AvatarSystem && typeof window.AvatarSystem.syncManualAvatarChange === 'function') {
                window.AvatarSystem.syncManualAvatarChange(currentChatId, compressedUrl, undefined);
            }
            char.myAvatar = compressedUrl;
            await saveCharacter(currentChatId);
            document.getElementById('setting-my-avatar-preview').src = compressedUrl;
            showToast('我的头像已更新');
            if (typeof renderMessages === 'function') renderMessages(false, true);
        } catch (error) {
            showToast('头像压缩失败，请重试');
        }
        e.target.value = '';
    });

    const avatarLibraryBtn = document.getElementById('setting-avatar-library-btn');
    if (avatarLibraryBtn && window.AvatarSystem) {
        avatarLibraryBtn?.addEventListener('click', () => window.AvatarSystem.openAvatarLibraryModal(currentChatId));
    }
    const charAvatarLibraryBtn = document.getElementById('setting-char-avatar-library-btn');
    if (charAvatarLibraryBtn && window.AvatarSystem) {
        charAvatarLibraryBtn?.addEventListener('click', () => window.AvatarSystem.openCharAvatarLibraryModal(currentChatId));
    }
    const coupleAvatarLibraryBtn = document.getElementById('setting-couple-avatar-library-btn');
    if (coupleAvatarLibraryBtn && window.AvatarSystem) {
        coupleAvatarLibraryBtn?.addEventListener('click', () => window.AvatarSystem.openCoupleAvatarLibraryModal(currentChatId));
    }

    (function initAvatarRecognitionDetailModal() {
        const row = document.getElementById('setting-avatar-recognition-detail-row');
        const displaySpan = document.getElementById('avatar-recognition-detail-display');
        const modal = document.getElementById('avatar-recognition-detail-modal');
        const radios = document.querySelectorAll('input[name="ar-detail-level"]');
        const customContainer = document.getElementById('ar-custom-words-container');
        const customInput = document.getElementById('ar-custom-words-input');
        const cancelBtn = document.getElementById('ar-detail-cancel-btn');
        const confirmBtn = document.getElementById('ar-detail-confirm-btn');

        function getDisplayText() {
            const val = db.avatarRecognitionDetailLevel;
            if (val === 'brief') return '简洁（10-20字）';
            if (val === 'standard') return '标准（30-50字）';
            if (val === 'detailed' || !val) return '详细（不限）';
            const n = typeof val === 'number' ? val : parseInt(val, 10);
            return (!isNaN(n) && n > 0) ? '自定义（' + n + '字）' : '详细（不限）';
        }

        function updateDisplay() {
            if (displaySpan) displaySpan.textContent = getDisplayText();
        }

        if (row && modal) {
            row?.addEventListener('click', function () {
                const val = db.avatarRecognitionDetailLevel;
                const isNum = typeof val === 'number' || (typeof val === 'string' && /^\d+$/.test(val));
                if (isNum) {
                    const n = typeof val === 'number' ? val : parseInt(val, 10);
                    customInput.value = isNaN(n) ? '' : n;
                    customContainer.style.display = '';
                    const customRadio = document.querySelector('input[name="ar-detail-level"][value="custom"]');
                    if (customRadio) customRadio.checked = true;
                    radios.forEach(function (r) { if (r.value !== 'custom') r.checked = false; });
                } else {
                    const v = (val === 'brief' || val === 'standard' || val === 'detailed') ? val : 'detailed';
                    radios.forEach(function (r) { r.checked = (r.value === v); });
                    customContainer.style.display = 'none';
                }
                modal.classList.add('visible');
            });
        }

        radios.forEach(function (r) {
            r?.addEventListener('change', function () {
                customContainer.style.display = this.value === 'custom' ? '' : 'none';
            });
        });

        if (cancelBtn) cancelBtn?.addEventListener('click', function () { modal.classList.remove('visible'); });
        if (confirmBtn) confirmBtn?.addEventListener('click', function () {
            const checked = document.querySelector('input[name="ar-detail-level"]:checked');
            if (checked && checked.value === 'custom' && customInput) {
                const n = parseInt(customInput.value, 10);
                db.avatarRecognitionDetailLevel = (!isNaN(n) && n > 0) ? Math.min(500, Math.max(5, n)) : 50;
            } else if (checked) {
                db.avatarRecognitionDetailLevel = checked.value;
            }
            if (typeof saveGlobalSettings === 'function') saveGlobalSettings();
            updateDisplay();
            modal.classList.remove('visible');
        });
        modal?.addEventListener('click', function (e) { if (e.target === modal) modal.classList.remove('visible'); });

        updateDisplay();
    })();

    document.getElementById('setting-chat-bg-upload')?.addEventListener('change', async (e) => {
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
                    await saveCharacter(currentChatId);
                    showToast('聊天背景已更换');
                } catch (error) {
                    showToast('背景压缩失败，请重试');
                }
            }
        }
    });

    document.getElementById('reset-chat-bg-btn')?.addEventListener('click', async () => {
        const char = db.characters.find(c => c.id === currentChatId);
        if (!char) return;
        char.chatBg = '';
        chatRoomScreen.style.backgroundImage = 'none';
        await saveCharacter(currentChatId);
        showToast('已恢复默认背景');
    });

    document.getElementById('setting-call-bg-upload')?.addEventListener('change', async (e) => {
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
                    char.callWallpaper = compressedUrl;
                    await saveCharacter(currentChatId);
                    showToast('通话背景已更换');
                } catch (error) {
                    showToast('背景压缩失败，请重试');
                }
            }
        }
    });

    document.getElementById('reset-call-bg-btn')?.addEventListener('click', async () => {
        const char = db.characters.find(c => c.id === currentChatId);
        if (!char) return;
        char.callWallpaper = '';
        await saveCharacter(currentChatId);
        showToast('已恢复默认通话背景');
    });
    
    for (const [id, field] of [
        ['setting-online-status-prompt', 'onlineStatusPromptEnabled'],
        ['setting-reset-status-on-new-game', 'resetStatusOnNewGame']
    ]) {
        document.getElementById(id)?.addEventListener('change', async (event) => {
            const input = event.currentTarget;
            const character = db.characters.find(c => c.id === currentChatId);
            if (!character) return;
            const previous = character[field];
            character[field] = input.checked;
            input.disabled = true;
            try {
                if (!await saveCharacter(character.id)) {
                    character[field] = previous;
                    if (currentChatId === character.id) input.checked = previous !== false;
                    showToast('在线状态设置保存失败');
                }
            } finally {
                input.disabled = false;
            }
        });
    }

    document.getElementById('reset-online-status-btn')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        const character = db.characters.find(c => c.id === currentChatId);
        if (!character) return;
        const previousStatus = character.status;
        const previousResetAt = character.onlineStatusResetAt;
        resetChatStatus(character);
        button.disabled = true;
        try {
            if (!await saveCharacter(character.id)) {
                character.onlineStatusResetAt = previousResetAt;
                if (character.status === '在线') setChatStatus(character, previousStatus);
                showToast('在线状态重置失败');
                return;
            }
            showToast('角色状态已恢复为「在线」');
        } finally {
            button.disabled = false;
        }
    });

    document.getElementById('clear-chat-history-btn')?.addEventListener('click', async () => {
        const character = db.characters.find(c => c.id === currentChatId);
        if (!character) return;
        if (confirm(`你确定要清空与“${character.remarkName}”的所有聊天记录吗？这个操作是不可恢复的！`)) {
            character.history = [];
            resetChatStatus(character);
            // 清除拉黑相关记忆
            character.blockHistory = [];
            character.friendRequests = [];
            character.charBlockHistory = [];
            character.userFriendRequests = [];
            character.isBlocked = false;
            character.blockedAt = null;
            character.blockReapply = null;
            character.isBlockedByChar = false;
            character.blockedByCharAt = null;
            character.blockedByCharReason = null;
            // 隐藏角色拉黑遮罩（如果有）
            var charBlockedOverlay = document.getElementById('char-blocked-overlay');
            if (charBlockedOverlay) charBlockedOverlay.style.display = 'none';
            await saveCharacter(currentChatId);
            renderMessages(false, true);
            renderChatList();
            showToast('聊天记录已清空');
        }
    });

    // --- 导出角色卡 ---
    document.getElementById('export-ovo-card-png-btn')?.addEventListener('click', async () => {
        const character = db.characters.find(c => c.id === currentChatId);
        if (!character) return showToast('未找到角色数据');

        try {
            showToast('正在生成 PNG 角色卡...');
            let base64Image = character.avatar;
            
            // 如果头像是 URL，尝试 fetch 它
            if (base64Image.startsWith('http')) {
                try {
                    const res = await fetch(base64Image);
                    const blob = await res.blob();
                    base64Image = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                } catch (e) {
                    console.warn('获取在线头像失败，使用默认头像', e);
                    // 提供一个内置的 base64 占位图或者提醒用户无法获取
                    return showToast('无法获取在线头像，请先更换为本地上传的头像再导出 PNG');
                }
            }

            // 清理多余的数据：聊天记录、屏蔽历史、手机操控历史等
            const exportChar = JSON.parse(JSON.stringify(character));
            delete exportChar.history;
            delete exportChar.blockHistory;
            delete exportChar.charBlockHistory;
            delete exportChar.friendRequests;
            delete exportChar.userFriendRequests;
            delete exportChar.phoneControlHistory;
            delete exportChar.userImageFaceLock;

            const pngDataUrl = await writeOvoPngMetadata(base64Image, exportChar);
            await OvoFileDownload.saveImage(pngDataUrl, `OVO角色卡_${character.remarkName || character.realName || '未命名'}_${new Date().toISOString().slice(0, 10)}.png`);
        } catch (error) {
            console.error('导出 PNG 角色卡失败:', error);
            showToast(`导出失败: ${error.message}`);
        }
    });

    document.getElementById('export-ovo-card-json-btn')?.addEventListener('click', async () => {
        const character = db.characters.find(c => c.id === currentChatId);
        if (!character) return showToast('未找到角色数据');

        // 清理多余的数据：聊天记录、屏蔽历史、手机操控历史等
        const exportChar = JSON.parse(JSON.stringify(character));
        delete exportChar.history;
        delete exportChar.blockHistory;
        delete exportChar.charBlockHistory;
        delete exportChar.friendRequests;
        delete exportChar.userFriendRequests;
        delete exportChar.phoneControlHistory;
        delete exportChar.userImageFaceLock;

        const jsonStr = JSON.stringify(exportChar, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        await OvoFileDownload.save(blob, `OVO角色卡_${character.remarkName || character.realName || '未命名'}_${new Date().toISOString().slice(0, 10)}.json`);
        
        
    });

    // --- 聊天记录导出 ---
    document.getElementById('export-chat-history-btn')?.addEventListener('click', async () => {
        const character = db.characters.find(c => c.id === currentChatId);
        if (!character) return;
        if (!character.history || character.history.length === 0) {
            showToast('当前没有聊天记录可导出');
            return;
        }
        const exportData = {
            type: 'uwu-chat-history',
            version: 1,
            charId: character.id,
            charName: character.remarkName,
            exportTime: Date.now(),
            history: character.history
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        await OvoFileDownload.save(blob, `聊天记录_${character.remarkName}_${new Date().toISOString().slice(0, 10)}.json`);

    });

    // --- 聊天记录导入 ---
    const importChatDropZone = document.getElementById('import-chat-file-drop-zone');
    const importChatFileInput = document.getElementById('import-chat-history-file');
    const importChatFileName = document.getElementById('import-chat-file-name');

    // 点击触发文件选择
    importChatDropZone?.addEventListener('click', () => importChatFileInput?.click());
    importChatFileInput?.addEventListener('change', () => {
        if (importChatFileInput.files[0]) {
            if (importChatFileName) importChatFileName.textContent = importChatFileInput.files[0].name;
            if (importChatFileName) importChatFileName.style.color = '#333';
            if (importChatDropZone) importChatDropZone.style.borderColor = '#4a9eff';
        }
    });
    // 拖拽支持
    importChatDropZone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (importChatDropZone) importChatDropZone.style.borderColor = '#4a9eff';
        if (importChatDropZone) importChatDropZone.style.background = 'rgba(74,158,255,0.05)';
    });
    importChatDropZone?.addEventListener('dragleave', () => {
        if (importChatDropZone) importChatDropZone.style.borderColor = '#ccc';
        if (importChatDropZone) importChatDropZone.style.background = '';
    });
    importChatDropZone?.addEventListener('drop', (e) => {
        e.preventDefault();
        if (importChatDropZone) importChatDropZone.style.borderColor = '#ccc';
        if (importChatDropZone) importChatDropZone.style.background = '';
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.json')) {
            const dt = new DataTransfer();
            dt.items.add(file);
            if (importChatFileInput) importChatFileInput.files = dt.files;
            if (importChatFileName) importChatFileName.textContent = file.name;
            if (importChatFileName) importChatFileName.style.color = '#333';
            if (importChatDropZone) importChatDropZone.style.borderColor = '#4a9eff';
        } else {
            showToast('请选择 .json 文件');
        }
    });

    document.getElementById('import-chat-history-btn')?.addEventListener('click', () => {
        const character = db.characters.find(c => c.id === currentChatId);
        if (!character) return;
        // 重置文件输入和单选按钮
        importChatFileInput.value = '';
        importChatFileName.textContent = '点击选择文件或拖拽到此处';
        importChatFileName.style.color = '#999';
        importChatDropZone.style.borderColor = '#ccc';
        importChatDropZone.style.background = '';
        const appendRadio = document.querySelector('input[name="import-chat-mode"][value="append"]');
        if (appendRadio) appendRadio.checked = true;
        document.getElementById('import-chat-mode-hint').textContent = '追加：将导入的记录添加到现有记录后面';
        document.getElementById('import-chat-history-modal').classList.add('visible');
    });

    // 导入模式切换提示
    document.querySelectorAll('input[name="import-chat-mode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const hint = document.getElementById('import-chat-mode-hint');
            if (e.target.value === 'append') {
                hint.textContent = '追加：将导入的记录添加到现有记录后面';
            } else {
                hint.textContent = '覆盖：清空现有记录，替换为导入的记录';
                hint.style.color = '#d32f2f';
            }
        });
    });

    document.getElementById('cancel-import-chat-btn')?.addEventListener('click', () => {
        document.getElementById('import-chat-history-modal').classList.remove('visible');
    });
    document.getElementById('import-chat-history-modal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('import-chat-history-modal')) {
            document.getElementById('import-chat-history-modal').classList.remove('visible');
        }
    });

    document.getElementById('confirm-import-chat-btn')?.addEventListener('click', async () => {
        const fileInput = document.getElementById('import-chat-history-file');
        const file = fileInput.files[0];
        if (!file) {
            showToast('请先选择文件');
            return;
        }
        const character = db.characters.find(c => c.id === currentChatId);
        if (!character) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            // 验证数据格式
            if (!data.history || !Array.isArray(data.history)) {
                showToast('文件格式不正确，缺少聊天记录数据');
                return;
            }
            if (data.type && data.type !== 'uwu-chat-history') {
                showToast('文件类型不匹配');
                return;
            }

            const mode = document.querySelector('input[name="import-chat-mode"]:checked').value;
            const importHistory = data.history;

            if (mode === 'overwrite') {
                if (!confirm(`覆盖导入将清空当前所有聊天记录（${character.history.length}条），替换为导入的${importHistory.length}条记录。确定继续吗？`)) {
                    return;
                }
                character.history = importHistory;
            } else {
                // 追加模式：为避免ID冲突，给导入的消息生成新ID
                const existingIds = new Set(character.history.map(m => m.id));
                importHistory.forEach(msg => {
                    if (existingIds.has(msg.id)) {
                        msg.id = generateUUID();
                    }
                });
                character.history = character.history.concat(importHistory);
                // 按时间排序
                character.history.sort((a, b) => a.timestamp - b.timestamp);
            }

            if (typeof recalculateChatStatus === 'function') {
                recalculateChatStatus(character);
            }

            await saveCharacter(currentChatId);
            currentPage = 1;
            renderMessages(false, true);
            renderChatList();
            document.getElementById('import-chat-history-modal').classList.remove('visible');
            showToast(`成功${mode === 'overwrite' ? '覆盖' : '追加'}导入 ${importHistory.length} 条聊天记录`);
        } catch (e) {
            console.error('导入聊天记录失败:', e);
            showToast('导入失败：文件解析错误');
        }
    });

    const blockCharacterBtn = document.getElementById('block-character-btn');
    const blockSettingsPanel = document.getElementById('block-settings-panel');
    const blockConfirmModal = document.getElementById('block-confirm-modal');
    const blockReapplyModeEl = document.getElementById('block-reapply-mode');
    const blockFixedIntervalRow = document.getElementById('block-fixed-interval-row');
    if (blockCharacterBtn) {
        blockCharacterBtn.addEventListener('click', () => {
            if (!blockConfirmModal) return;
            const modeFixed = document.querySelector('input[name="block-mode"][value="fixed"]');
            const initIntervalEl = document.getElementById('block-init-interval');
            if (modeFixed) modeFixed.checked = true;
            if (initIntervalEl) initIntervalEl.value = '30';
            blockConfirmModal.classList.add('visible');
        });
    }
    document.getElementById('block-confirm-cancel') && document.getElementById('block-confirm-cancel').addEventListener('click', () => {
        if (blockConfirmModal) blockConfirmModal.classList.remove('visible');
    });
    if (blockConfirmModal) blockConfirmModal.addEventListener('click', function (ev) {
        if (ev.target === blockConfirmModal) blockConfirmModal.classList.remove('visible');
    });
    document.getElementById('block-confirm-ok')?.addEventListener('click', () => {
        const character = db.characters.find(c => c.id === currentChatId);
        if (!character) return;
        const modeEl = document.querySelector('input[name="block-mode"]:checked');
        const initIntervalEl = document.getElementById('block-init-interval');
        const mode = (modeEl && modeEl.value) || 'fixed';
        const fixedInterval = initIntervalEl ? Math.max(1, parseInt(initIntervalEl.value, 10) || 30) : 30;
        if (blockConfirmModal) blockConfirmModal.classList.remove('visible');
        if (typeof blockCharacter === 'function') blockCharacter(character.id, mode, fixedInterval);
        if (blockSettingsPanel) blockSettingsPanel.style.display = 'block';
        if (blockCharacterBtn) blockCharacterBtn.style.display = 'none';
    });
    if (blockReapplyModeEl) {
        blockReapplyModeEl?.addEventListener('change', () => {
            if (blockFixedIntervalRow) blockFixedIntervalRow.style.display = (blockReapplyModeEl.value === 'fixed') ? '' : 'none';
        });
    }
    document.getElementById('trigger-friend-request-btn')?.addEventListener('click', async () => {
        const character = db.characters.find(c => c.id === currentChatId);
        if (!character || !character.isBlocked) return;
        if (character.blockReapply && character.blockReapply.pendingRequestId) {
            if (typeof reopenPendingFriendRequest === 'function') {
                reopenPendingFriendRequest(character.id);
            } else {
                showToast('还有待处理的好友申请');
            }
            return;
        }
        if (typeof generateAndShowFriendRequest === 'function') await generateAndShowFriendRequest(character);
    });
    document.getElementById('unblock-character-btn')?.addEventListener('click', () => {
        const character = db.characters.find(c => c.id === currentChatId);
        if (!character) return;
        if (confirm('确定解除拉黑吗？角色将重新出现在聊天列表中。')) {
            if (typeof unblockCharacter === 'function') unblockCharacter(character.id);
            if (blockSettingsPanel) blockSettingsPanel.style.display = 'none';
            if (blockCharacterBtn) blockCharacterBtn.style.display = '';
        }
    });

    // 角色掌控模式：开关、警告弹窗、强制关闭、查看条数、日志、回收站
    (function () {
        const phoneControlEnabledEl = document.getElementById('setting-phone-control-enabled');
        const phoneControlOptionsEl = document.getElementById('setting-phone-control-options');
        const phoneControlActionsEl = document.getElementById('setting-phone-control-actions');
        const phoneControlCharFilterEl = document.getElementById('setting-phone-control-char-filter');
        const phoneControlCharSelectionEl = document.getElementById('setting-phone-control-char-selection');
        const phoneControlViewLimitEl = document.getElementById('setting-phone-control-view-limit');
        const phoneControlViewLimitValueEl = document.getElementById('setting-phone-control-view-limit-value');
        const warningModal = document.getElementById('phone-control-warning-modal');
        const forceCloseModal = document.getElementById('phone-control-force-close-modal');
        if (!phoneControlEnabledEl) return;
        function showPhoneControlOptions() {
            if (phoneControlOptionsEl) phoneControlOptionsEl.style.display = 'block';
            if (phoneControlActionsEl) phoneControlActionsEl.style.display = 'flex';
            if (phoneControlCharFilterEl) phoneControlCharFilterEl.style.display = 'flex';
            const charFilterOn = document.getElementById('setting-phone-control-char-filter-enabled');
            if (phoneControlCharSelectionEl) phoneControlCharSelectionEl.style.display = (charFilterOn && charFilterOn.checked) ? 'flex' : 'none';
        }
        function hidePhoneControlOptions() {
            if (phoneControlOptionsEl) phoneControlOptionsEl.style.display = 'none';
            if (phoneControlActionsEl) phoneControlActionsEl.style.display = 'none';
            if (phoneControlCharFilterEl) phoneControlCharFilterEl.style.display = 'none';
            if (phoneControlCharSelectionEl) phoneControlCharSelectionEl.style.display = 'none';
        }
        phoneControlEnabledEl?.addEventListener('change', async function () {
            if (this.checked) {
                // 开启时：计算并显示 token 消耗提醒
                if (warningModal) {
                    const tokenWarningEl = document.getElementById('phone-control-token-warning');
                    if (tokenWarningEl && currentChatId) {
                        const character = db.characters.find(c => c.id === currentChatId);
                        if (character) {
                            // 估算手机掌控模式额外 token（指令集模板约 350 + 操控历史）
                            const historyCount = (character.phoneControlHistory || []).length;
                            const extraTokens = 350 + Math.min(historyCount, 15) * 30;
                            document.getElementById('phone-control-extra-tokens').textContent = extraTokens + '+';
                            // 当前对话总 token
                            let currentTokens = 0;
                            if (typeof estimateChatTokens === 'function') {
                                currentTokens = estimateChatTokens(character.id, 'private');
                            }
                            document.getElementById('phone-control-current-tokens').textContent = currentTokens;
                            tokenWarningEl.style.display = 'block';
                        }
                    }
                    warningModal.style.display = 'flex';
                } else {
                    showPhoneControlOptions();
                }
            } else {
                hidePhoneControlOptions();
            }
        });
        if (phoneControlViewLimitEl && phoneControlViewLimitValueEl) {
            phoneControlViewLimitEl?.addEventListener('input', function () {
                phoneControlViewLimitValueEl.textContent = this.value;
            });
        }
        document.getElementById('phone-control-warning-cancel')?.addEventListener('click', () => {
            if (warningModal) warningModal.style.display = 'none';
            if (phoneControlEnabledEl) phoneControlEnabledEl.checked = false;
            hidePhoneControlOptions();
        });
        document.getElementById('phone-control-warning-confirm')?.addEventListener('click', () => {
            if (warningModal) warningModal.style.display = 'none';
            showPhoneControlOptions();
        });
        document.getElementById('setting-phone-control-char-filter-enabled')?.addEventListener('change', function () {
            if (phoneControlCharSelectionEl) phoneControlCharSelectionEl.style.display = this.checked ? 'flex' : 'none';
        });
        
        // 绑定选择角色按钮事件
        const selectCharsBtn = document.getElementById('setting-phone-control-select-chars-btn');
        if (selectCharsBtn) {
            selectCharsBtn?.addEventListener('click', () => {
                const char = db.characters.find(c => c.id === currentChatId);
                if (!char) return;
                const modal = document.getElementById('phone-control-char-select-modal');
                const list = document.getElementById('phone-control-char-list');
                const selectAllCb = document.getElementById('phone-control-char-select-all');
                if (!modal || !list) return;
                
                list.innerHTML = '';
                const visibleIds = char.phoneControlVisibleCharIds || [];
                const otherChars = (db.characters || []).filter(c => c.id !== char.id);
                
                if (otherChars.length === 0) {
                    list.innerHTML = '<div style="color:#999;text-align:center;padding:20px;">没有其他角色可选</div>';
                } else {
                    let allChecked = true;
                    otherChars.forEach(c => {
                        const isChecked = visibleIds.includes(c.id);
                        if (!isChecked) allChecked = false;
                        
                        const label = document.createElement('label');
                        label.style.cssText = 'display:flex; align-items:center; gap:8px; padding:8px; border-bottom:1px solid #eee; cursor:pointer;';
                        
                        const cb = document.createElement('input');
                        cb.type = 'checkbox';
                        cb.value = c.id;
                        cb.className = 'phone-control-char-cb';
                        cb.checked = isChecked;
                        cb.style.margin = '0';
                        
                        const img = document.createElement('img');
                        img.src = c.avatar || 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg';
                        img.style.cssText = 'width:30px; height:30px; border-radius:50%; object-fit:cover;';
                        
                        const nameSpan = document.createElement('span');
                        nameSpan.textContent = c.remarkName || c.realName || '未知';
                        nameSpan.style.flex = '1';
                        
                        label.appendChild(cb);
                        label.appendChild(img);
                        label.appendChild(nameSpan);
                        list.appendChild(label);
                        
                        cb.addEventListener('change', () => {
                            const cbs = Array.from(list.querySelectorAll('.phone-control-char-cb'));
                            if (selectAllCb) selectAllCb.checked = cbs.every(x => x.checked);
                        });
                    });
                    if (selectAllCb) selectAllCb.checked = otherChars.length > 0 && allChecked;
                }
                
                modal.style.display = 'flex';
            });
        }
        
        const selectAllCb = document.getElementById('phone-control-char-select-all');
        if (selectAllCb) {
            selectAllCb?.addEventListener('change', function() {
                const cbs = document.querySelectorAll('.phone-control-char-cb');
                cbs.forEach(cb => cb.checked = this.checked);
            });
        }
        
        const confirmCharsBtn = document.getElementById('phone-control-char-confirm-btn');
        if (confirmCharsBtn) {
            confirmCharsBtn?.addEventListener('click', async () => {
                const char = db.characters.find(c => c.id === currentChatId);
                if (!char) return;
                const cbs = Array.from(document.querySelectorAll('.phone-control-char-cb:checked'));
                char.phoneControlVisibleCharIds = cbs.map(cb => cb.value);
                await saveCharacter(currentChatId);
                document.getElementById('phone-control-char-select-modal').style.display = 'none';
                showToast('已保存可见角色设置');
            });
        }
        
        const cancelCharsBtn = document.getElementById('phone-control-char-cancel-btn');
        if (cancelCharsBtn) {
            cancelCharsBtn?.addEventListener('click', () => {
                const modal = document.getElementById('phone-control-char-select-modal');
                if (modal) modal.style.display = 'none';
            });
        }

        document.getElementById('setting-phone-control-force-close-btn')?.addEventListener('click', () => {
            // 强制关闭前显示 token 信息
            const tokenInfoEl = document.getElementById('phone-control-close-token-info');
            if (tokenInfoEl && currentChatId) {
                const character = db.characters.find(c => c.id === currentChatId);
                if (character) {
                    const msgCount = character.history ? character.history.length : 0;
                    let tokenCount = 0;
                    if (typeof estimateChatTokens === 'function') {
                        tokenCount = estimateChatTokens(character.id, 'private');
                    }
                    document.getElementById('force-close-msg-count').textContent = msgCount;
                    document.getElementById('force-close-token-count').textContent = tokenCount;
                    tokenInfoEl.style.display = (msgCount > 0) ? 'block' : 'none';
                }
            }
            if (forceCloseModal) forceCloseModal.style.display = 'flex';
        });
        document.getElementById('phone-control-force-cancel')?.addEventListener('click', () => {
            if (forceCloseModal) forceCloseModal.style.display = 'none';
        });
        document.getElementById('phone-control-force-confirm')?.addEventListener('click', async () => {
            const character = db.characters.find(c => c.id === currentChatId);
            if (character) {
                character.phoneControlEnabled = false;
                await saveCharacter(currentChatId);
                if (phoneControlEnabledEl) phoneControlEnabledEl.checked = false;
                hidePhoneControlOptions();
                if (typeof showToast === 'function') showToast('已强制关闭');
            }
            if (forceCloseModal) forceCloseModal.style.display = 'none';
        });
        document.getElementById('setting-phone-control-log-btn')?.addEventListener('click', () => {
            const character = db.characters.find(c => c.id === currentChatId);
            if (!character) return;
            const history = character.phoneControlHistory || [];
            const lines = history.length ? history.slice().reverse().map(h => {
                const t = h.timestamp ? new Date(h.timestamp) : null;
                const timeStr = t ? t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0') + ' ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0') : '';
                return timeStr + ' ' + (h.type === 'view' ? '查看' : '操作') + ' ' + (h.action || '') + (h.target ? ' (' + h.target + ')' : '') + (h.detail ? ' — ' + String(h.detail).slice(0, 60) : '');
            }).join('\n') : '暂无记录';
            alert('【操控日志】\n\n' + lines);
        });
        function renderPhoneControlRecycleList() {
            const listEl = document.getElementById('phone-control-recycle-list');
            if (!listEl) return;
            const bin = db.phoneControlRecycleBin || [];
            if (bin.length === 0) {
                listEl.innerHTML = '<p style="color:#999;padding:12px;">回收站为空</p>';
            } else {
                listEl.innerHTML = bin.map((item, i) => {
                    const name = item.remarkName || item.realName || '未知';
                    return '<div class="kkt-item" style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0;">' +
                        '<span>' + name + '</span>' +
                        '<button type="button" class="btn btn-small btn-primary phone-control-restore-btn" data-index="' + i + '">恢复</button>' +
                        '</div>';
                }).join('');
            }
        }
        document.getElementById('setting-phone-control-recycle-btn')?.addEventListener('click', () => {
            const modal = document.getElementById('phone-control-recycle-modal');
            const listEl = document.getElementById('phone-control-recycle-list');
            if (!modal || !listEl) return;
            renderPhoneControlRecycleList();
            modal.style.display = 'flex';
        });
        document.getElementById('phone-control-recycle-list')?.addEventListener('click', async (e) => {
            const btn = e.target.closest('.phone-control-restore-btn');
            if (!btn) return;
            const idx = parseInt(btn.getAttribute('data-index'), 10);
            const bin2 = db.phoneControlRecycleBin || [];
            if (isNaN(idx) || idx < 0 || idx >= bin2.length) return;
            const character = bin2[idx];
            delete character.recycledAt;
            delete character.recycledByCharId;
            db.phoneControlRecycleBin = bin2.filter((_, i) => i !== idx);
            db.characters.push(character);
            await saveData(); // 这里恢复了角色，修改了 db.characters 数组，保留全量保存或可考虑精细化但暂时保留 saveData
            if (typeof renderChatList === 'function') renderChatList();
            if (typeof showToast === 'function') showToast('已恢复');
            renderPhoneControlRecycleList();
        });
        document.getElementById('phone-control-recycle-close')?.addEventListener('click', () => {
            const modal = document.getElementById('phone-control-recycle-modal');
            if (modal) modal.style.display = 'none';
        });
    })();

    let currentWorldBookMode = 'online';

    function renderWorldBookSelectionList() {
        document.getElementById('world-book-token-draft')?.remove();
        const globalIds = (db.worldBooks || []).filter(wb => wb.isGlobal && !wb.disabled).map(wb => wb.id);
        let displayIds = [];
        if (currentChatType === 'private') {
            const character = db.characters.find(c => c.id === currentChatId);
            if (!character) return;
            const ids = currentWorldBookMode === 'offline' && (character.offlineWorldBookSelectionExplicit || character.offlineWorldBookIds?.length) ? (character.offlineWorldBookIds || []) : (character.worldBookIds || []);
            displayIds = [...new Set([...ids, ...globalIds])];
        } else if (currentChatType === 'group') {
            const group = db.groups.find(g => g.id === currentChatId);
            if (!group) return;
            const ids = currentWorldBookMode === 'offline' && (group.offlineWorldBookSelectionExplicit || group.offlineWorldBookIds?.length) ? (group.offlineWorldBookIds || []) : (group.worldBookIds || []);
            displayIds = [...new Set([...ids, ...globalIds])];
        }
        renderCategorizedWorldBookList(document.getElementById('world-book-selection-list'), db.worldBooks, displayIds, 'wb-select');
    }

    document.getElementById('link-world-book-btn')?.addEventListener('click', () => {
        currentWorldBookMode = 'online';
        const tabs = document.querySelectorAll('#world-book-mode-tabs .settings-tab-item');
        tabs.forEach(t => t.classList.remove('active'));
        const onlineTab = document.querySelector('#world-book-mode-tabs .settings-tab-item[data-mode="online"]');
        if (onlineTab) onlineTab.classList.add('active');
        
        renderWorldBookSelectionList();
        document.getElementById('world-book-selection-modal').classList.add('visible');
    });

    const wbModeTabs = document.querySelectorAll('#world-book-mode-tabs .settings-tab-item');
    wbModeTabs.forEach(tab => {
        tab?.addEventListener('click', () => {
            wbModeTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentWorldBookMode = tab.getAttribute('data-mode');
            renderWorldBookSelectionList();
        });
    });

    // Selection is a draft until the existing confirmation action succeeds.
    document.getElementById('world-book-selection-list')?.addEventListener('change', () => {
        const list = document.getElementById('world-book-selection-list');
        let hint = document.getElementById('world-book-token-draft');
        if (!hint) { hint = document.createElement('div'); hint.id = 'world-book-token-draft'; hint.className = 'token-method'; list.after(hint); }
        const selected = Array.from(list.querySelectorAll('.item-checkbox:checked')).map(input => input.value);
        const chat = currentChatType === 'private' ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (!chat) return;
        const offline = window.ChatTokenStats?.isOffline(chat);
        if ((currentWorldBookMode === 'offline') !== !!offline) { hint.textContent = '当前选择尚未保存；此设置将在对应的线上或线下模式生效。'; return; }
        try {
            const overrides = currentWorldBookMode === 'offline' ? { offlineWorldBookIds:selected, offlineWorldBookSelectionExplicit:true } : { worldBookIds:selected };
            const data = getChatTokenBreakdown(currentChatId,currentChatType,{ overrides });
            hint.textContent = '尚未保存 · 当前模式预计输入 ' + data.total + ' Token（仅模拟）';
        } catch (_) { hint.textContent = '当前选择尚未保存，保存后自动更新统计。'; }
    });

    document.getElementById('save-world-book-selection-btn')?.addEventListener('click', async event => {
        const button = event.currentTarget; if (button.disabled) return;
        if (!['private', 'group'].includes(currentChatType)) {
            await saveData();
            document.getElementById('world-book-selection-modal').classList.remove('visible');
            showToast('世界书关联已更新');
            return;
        }
        const globalIds = (db.worldBooks || []).filter(wb => wb.isGlobal && !wb.disabled).map(wb => wb.id);
        const selectedIds = Array.from(document.getElementById('world-book-selection-list').querySelectorAll('.item-checkbox:checked')).map(input => input.value);
        const toSave = [...new Set(selectedIds.filter(id => !globalIds.includes(id)))];
        const chat = currentChatType === 'private' ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (!chat) return;
        const key = currentWorldBookMode === 'offline' ? 'offlineWorldBookIds' : 'worldBookIds';
        const previous = chat[key], explicit = chat.offlineWorldBookSelectionExplicit;
        chat[key] = toSave;
        if (currentWorldBookMode === 'offline') chat.offlineWorldBookSelectionExplicit = true;
        button.disabled = true;
        let saved;
        try { saved = await (currentChatType === 'private' ? saveCharacter(currentChatId) : saveGroup(currentChatId)); }
        catch (_) { saved = false; }
        finally { button.disabled = false; }
        if (saved === false) {
            chat[key] = previous;
            if (explicit === undefined) delete chat.offlineWorldBookSelectionExplicit; else chat.offlineWorldBookSelectionExplicit = explicit;
            showToast('保存失败，请重试；世界书选择尚未保存');
            return;
        }
        window.ChatTokenStats?.changed(currentChatId, currentChatType, '世界书绑定已更新');
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

    const retentionUnlimited = document.getElementById('setting-status-retention-unlimited');
    if (retentionUnlimited) {
        retentionUnlimited.addEventListener('change', () => {
            document.getElementById('setting-status-retention-limit').disabled = retentionUnlimited.checked;
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
        autoJournalSwitch.addEventListener('change', async (e) => {
            triggerHapticFeedback('light');
            const container = document.getElementById('setting-auto-journal-interval-container');
            if (container) {
                container.style.display = e.target.checked ? 'flex' : 'none';
            }

            const chat = db.characters.find(character => character.id === currentChatId);
            if (!chat) return;

            const intervalInput = parseInt(document.getElementById('setting-auto-journal-interval').value, 10);
            chat.autoJournalInterval = (isNaN(intervalInput) || intervalInput < 10) ? 100 : intervalInput;

            if (typeof applyAutoJournalToggleDecision === 'function') {
                await applyAutoJournalToggleDecision(chat, e.target.checked, { chatType: 'private' });
            } else {
                chat.autoJournalEnabled = e.target.checked;
            }

            if (typeof saveCharacter === 'function') {
                await saveCharacter(currentChatId);
            } else {
                await saveData();
            }
        });
    }

    const autoJournalRetryBtn = document.getElementById('setting-auto-journal-retry-btn');
    if (autoJournalRetryBtn) {
        autoJournalRetryBtn.addEventListener('click', async () => {
            const chat = db.characters.find(character => character.id === currentChatId);
            if (!chat) return;

            const intervalInput = parseInt(document.getElementById('setting-auto-journal-interval').value, 10);
            chat.autoJournalInterval = (isNaN(intervalInput) || intervalInput < 10) ? 100 : intervalInput;

            if (typeof retryAutoJournalForChat === 'function') {
                await retryAutoJournalForChat(chat, { chatType: 'private' });
            }

            if (typeof saveCharacter === 'function') {
                await saveCharacter(currentChatId);
            } else {
                await saveData();
            }
        });
    }

    const summarizeLatestBtn = document.getElementById('setting-summarize-latest-btn');
    if (summarizeLatestBtn) {
        summarizeLatestBtn.addEventListener('click', async () => {
            const chat = db.characters.find(character => character.id === currentChatId);
            if (!chat) return;

            const intervalInput = parseInt(document.getElementById('setting-auto-journal-interval').value, 10);
            chat.autoJournalInterval = (isNaN(intervalInput) || intervalInput < 10) ? 100 : intervalInput;

            if (typeof getAutoJournalCursorInfo !== 'function' || typeof askSummarizeLatestOptions !== 'function' || typeof summarizeUntilLatest !== 'function') {
                return;
            }

            const info = getAutoJournalCursorInfo(chat);
            if (info.unsummarizedCount <= 0) {
                showToast('当前没有新增消息需要总结');
                return;
            }

            const choice = await askSummarizeLatestOptions(info);
            if (!choice) return;

            await summarizeUntilLatest(chat, {
                chatType: 'private',
                mode: choice.mode,
                splitSize: choice.splitSize,
                includeRemainder: choice.includeRemainder
            });

            if (typeof saveCharacter === 'function') {
                await saveCharacter(currentChatId);
            } else {
                await saveData();
            }
        });
    }

    const autoJournalIntervalInputEl = document.getElementById('setting-auto-journal-interval');
    if (autoJournalIntervalInputEl) {
        autoJournalIntervalInputEl.addEventListener('blur', async () => {
            const chat = db.characters.find(character => character.id === currentChatId);
            if (!chat) return;

            const intervalInput = parseInt(autoJournalIntervalInputEl.value, 10);
            chat.autoJournalInterval = (isNaN(intervalInput) || intervalInput < 10) ? 100 : intervalInput;

            if (typeof refreshAutoJournalButton === 'function') {
                refreshAutoJournalButton(chat, 'private');
            }

            if (typeof saveCharacter === 'function') {
                await saveCharacter(currentChatId);
            } else {
                await saveData();
            }
        });
    }

    const charAwareUserFavoritesEl = document.getElementById('setting-char-aware-user-favorites');
    if (charAwareUserFavoritesEl) {
        charAwareUserFavoritesEl.addEventListener('change', (e) => {
            triggerHapticFeedback('light');
            const container = document.getElementById('setting-aware-favorite-scope-container');
            if (container) {
                container.style.display = e.target.checked ? 'block' : 'none';
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

/**
 * 渲染小剧场世界书分类下拉（与创建剧场页面风格一致）
 * @param {string[]} selectedIds - 已选中的世界书ID数组
 */
function _populateCharTheaterWbDropdown(selectedIds) {
    const wbOptions = document.getElementById('setting-char-theater-wb-options');
    const wbDisplay = document.getElementById('setting-char-theater-wb-display');
    const wbDropdown = document.getElementById('setting-char-theater-wb-dropdown');
    if (!wbOptions || !wbDisplay) return;

    // 绑定展开/收起
    if (wbDropdown && !wbDisplay._charTheaterWbBound) {
        wbDisplay._charTheaterWbBound = true;
        wbDisplay.addEventListener('click', (e) => {
            e.stopPropagation();
            wbDropdown.style.display = wbDropdown.style.display === 'block' ? 'none' : 'block';
        });
        document.addEventListener('click', (e) => {
            if (!wbDropdown.contains(e.target) && e.target !== wbDisplay) {
                wbDropdown.style.display = 'none';
            }
        });
    }

    wbOptions.innerHTML = '';
    const allBooks = db.worldBooks || [];
    const selectedSet = new Set(selectedIds);

    if (allBooks.length === 0) {
        wbOptions.innerHTML = '<div style="padding:10px;font-size:12px;color:#999;">暂无世界书</div>';
        _updateCharTheaterWbDisplay(wbDisplay, wbOptions);
        return;
    }

    // 按分类分组
    const grouped = allBooks.reduce((acc, book) => {
        const cat = (book.category && book.category.trim()) || '未分类';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(book);
        return acc;
    }, {});

    const sortedCats = Object.keys(grouped).sort((a, b) => {
        if (a === '未分类') return -1;
        if (b === '未分类') return 1;
        return a.localeCompare(b, 'zh-Hans');
    });

    sortedCats.forEach(cat => {
        const group = document.createElement('div');
        group.className = 'theater-multiselect-group';

        const header = document.createElement('div');
        header.className = 'theater-multiselect-group-header';
        header.innerHTML = `<span class="theater-multiselect-group-title">${cat}</span><span class="theater-multiselect-group-arrow">⌃</span>`;

        const body = document.createElement('div');
        body.className = 'theater-multiselect-group-body';

        grouped[cat].forEach(book => {
            const option = document.createElement('div');
            option.className = 'theater-multiselect-option' + (selectedSet.has(book.id) ? ' selected' : '');
            option.dataset.id = book.id;
            option.innerHTML = `<div class="theater-multiselect-checkbox">✓</div><div class="theater-multiselect-label">${book.name || book.title || '未命名世界书'}</div>`;
            option.addEventListener('click', () => {
                option.classList.toggle('selected');
                _updateCharTheaterWbDisplay(wbDisplay, wbOptions);
            });
            body.appendChild(option);
        });

        if (cat !== '未分类') group.classList.add('collapsed');
        header.addEventListener('click', (e) => { e.stopPropagation(); group.classList.toggle('collapsed'); });

        group.appendChild(header);
        group.appendChild(body);
        wbOptions.appendChild(group);
    });

    _updateCharTheaterWbDisplay(wbDisplay, wbOptions);
}

function _updateCharTheaterWbDisplay(displayEl, optionsEl) {
    if (!displayEl || !optionsEl) return;
    const placeholder = displayEl.querySelector('.theater-multiselect-placeholder');
    if (!placeholder) return;
    const selected = optionsEl.querySelectorAll('.theater-multiselect-option.selected');
    if (selected.length === 0) {
        placeholder.textContent = '请选择世界书（可选）';
        displayEl.classList.remove('has-selection');
    } else {
        const names = Array.from(selected).map(o => {
            const lbl = o.querySelector('.theater-multiselect-label');
            return lbl ? lbl.textContent : '';
        }).filter(Boolean);
        placeholder.textContent = names.length > 2
            ? `已选 ${selected.length} 项：${names.slice(0, 2).join('、')}...`
            : `已选 ${selected.length} 项：${names.join('、')}`;
        displayEl.classList.add('has-selection');
    }
}

function loadSettingsToSidebar() {
    const e = db.characters.find(e => e.id === currentChatId);
    if (e) {
        const avatarPreviewEl = document.getElementById('setting-char-avatar-preview');
        if (avatarPreviewEl) {
            avatarPreviewEl.src = e.avatar;
        }
        const nameDisplay = document.getElementById('setting-char-name-display');
        if(nameDisplay) nameDisplay.textContent = e.remarkName;
        if (window.Moments) window.Moments.loadCharacterSettings(e);
        const realNameEl = document.getElementById('setting-char-real-name');
        if (realNameEl) realNameEl.value = e.realName || '';
        
        const birthdayEl = document.getElementById('setting-char-birthday');
        if (birthdayEl) birthdayEl.value = e.birthday || '';
        
        const enableDynamicAgeEl = document.getElementById('setting-char-enable-dynamic-age');
        if (enableDynamicAgeEl) enableDynamicAgeEl.checked = e.enableDynamicAge || false;
        
        document.getElementById('setting-char-remark').value = e.remarkName;
        window.CharacterProfile?.loadSettings(e);
        
        const timezoneEl = document.getElementById('setting-char-timezone');
        const timezonePresetEl = document.getElementById('setting-char-timezone-preset');
        if (timezoneEl) timezoneEl.value = e.charTimezone || '';
        if (timezonePresetEl) {
            timezonePresetEl.value = '';
            timezonePresetEl.onchange = function() {
                if (this.value && timezoneEl) timezoneEl.value = this.value;
            };
        }
        
        const enableDynamicTimezoneEl = document.getElementById('setting-char-enable-dynamic-timezone');
        if (enableDynamicTimezoneEl) enableDynamicTimezoneEl.checked = e.enableDynamicTimezone || false;

        const customPromptPresetEl = document.getElementById('setting-char-custom-prompt-preset');
        if (customPromptPresetEl) {
            customPromptPresetEl.innerHTML = '<option value="">跟随全局设置</option>';
            if (db.magicRoom && db.magicRoom.presets) {
                db.magicRoom.presets.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.id || p.name;
                    opt.textContent = p.name;
                    customPromptPresetEl.appendChild(opt);
                });
            }
            const presetRef = e.customPromptPresetId || e.customPromptPreset || '';
            const matchedPreset = (db.magicRoom && db.magicRoom.presets || []).find(p => p.id === presetRef || p.name === presetRef);
            customPromptPresetEl.value = matchedPreset ? (matchedPreset.id || matchedPreset.name) : '';
        }
        
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
            if (e.source === 'forum' || e.source === 'peek') {
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

        const stickerDescEnabledEl = document.getElementById('setting-char-sticker-description-enabled');
        if (stickerDescEnabledEl) {
            stickerDescEnabledEl.checked = e.stickerDescriptionEnabled || false;
        }

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
            const myAvatarPreviewEl = document.getElementById('setting-my-avatar-preview');
            if (myAvatarPreviewEl) myAvatarPreviewEl.src = e.myAvatar || 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg';
            const myNameEl = document.getElementById('setting-my-name');
            if (myNameEl) myNameEl.value = e.myName || '';
            const myPersonaEl = document.getElementById('setting-my-persona');
            if (myPersonaEl) myPersonaEl.value = e.myPersona || '';
            
            const myBirthdayEl = document.getElementById('setting-my-birthday');
            if (myBirthdayEl) myBirthdayEl.value = e.myBirthday || '';
            const myEnableDynamicAgeEl = document.getElementById('setting-my-enable-dynamic-age');
            if (myEnableDynamicAgeEl) myEnableDynamicAgeEl.checked = e.myEnableDynamicAge || false;
            
            const myEnableDynamicTimezoneEl = document.getElementById('setting-my-enable-dynamic-timezone');
            if (myEnableDynamicTimezoneEl) myEnableDynamicTimezoneEl.checked = e.myEnableDynamicTimezone || false;
            const myTimezoneEl = document.getElementById('setting-my-timezone');
            const myTimezonePresetEl = document.getElementById('setting-my-timezone-preset');
            if (myTimezoneEl) myTimezoneEl.value = e.myTimezone || '';
            if (myTimezonePresetEl) {
                myTimezonePresetEl.value = '';
                myTimezonePresetEl.onchange = function() {
                    if (this.value && myTimezoneEl) myTimezoneEl.value = this.value;
                };
            }
        }
        const themeColorEl = document.getElementById('setting-theme-color');
        if (themeColorEl) themeColorEl.value = e.theme || 'white_pink';
        const maxMemoryEl = document.getElementById('setting-max-memory');
        if (maxMemoryEl) maxMemoryEl.value = e.maxMemory;
        const syncGroupMemoryEl = document.getElementById('setting-sync-group-memory');
        if (syncGroupMemoryEl) syncGroupMemoryEl.checked = e.syncGroupMemory || false;
        
        // 群聊记忆互通相关设置
        const groupMemoryHistoryCount = e.groupMemoryHistoryCount !== undefined ? e.groupMemoryHistoryCount : 20;
        const groupMemorySummaryCount = e.groupMemorySummaryCount !== undefined ? e.groupMemorySummaryCount : 0;
        
        const groupJournalFavTopEl = document.getElementById('setting-group-journal-favorite-top');
        if (groupJournalFavTopEl) groupJournalFavTopEl.checked = e.journalFavoriteTop !== false; // 默认开启
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
        const showDebugContentEl = document.getElementById('setting-show-debug-content');
        if (showDebugContentEl) showDebugContentEl.checked = !!e.showDebugContent;
        const replyCountContainer = document.getElementById('setting-reply-count-container');
        if (replyCountContainer) {
            replyCountContainer.style.display = e.replyCountEnabled ? 'flex' : 'none';
        }
        document.getElementById('setting-reply-count-min').value = e.replyCountMin || 3;
        document.getElementById('setting-reply-count-max').value = e.replyCountMax || 8;

        const stickerSmartMatchEl = document.getElementById('setting-sticker-smart-match');
        if (stickerSmartMatchEl) stickerSmartMatchEl.checked = e.stickerSmartMatchEnabled || false;

        document.getElementById('setting-auto-journal-enabled').checked = e.autoJournalEnabled || false;
        const memoryModeEl = document.getElementById('setting-memory-mode');
        if (memoryModeEl) memoryModeEl.value = e.memoryMode || 'journal';
        const autoJournalIntervalContainer = document.getElementById('setting-auto-journal-interval-container');
        if (autoJournalIntervalContainer) {
            autoJournalIntervalContainer.style.display = e.autoJournalEnabled ? 'flex' : 'none';
        }
        document.getElementById('setting-auto-journal-interval').value = e.autoJournalInterval || 100;
        if (typeof ensureAutoJournalState === 'function') {
            ensureAutoJournalState(e);
        }
        if (typeof refreshAutoJournalButton === 'function') {
            refreshAutoJournalButton(e, 'private');
        }

        const charAutoFavEl = document.getElementById('setting-char-auto-favorite');
        if (charAutoFavEl) charAutoFavEl.checked = e.characterAutoFavoriteEnabled || false;
        
        const charAwareUserFavoritesEl = document.getElementById('setting-char-aware-user-favorites');
        const awareFavoriteScopeContainer = document.getElementById('setting-aware-favorite-scope-container');
        if (charAwareUserFavoritesEl) {
            charAwareUserFavoritesEl.checked = e.charAwareUserFavorites || false;
            if (awareFavoriteScopeContainer) {
                awareFavoriteScopeContainer.style.display = e.charAwareUserFavorites ? 'block' : 'none';
            }
        }
        
        const awareScopeCurrent = document.getElementById('setting-aware-favorite-scope-current');
        const awareScopeAll = document.getElementById('setting-aware-favorite-scope-all');
        if (e.awareFavoriteScope === 'all') {
            if (awareScopeAll) awareScopeAll.checked = true;
        } else {
            if (awareScopeCurrent) awareScopeCurrent.checked = true;
        }
        
        const journalFavTopEl = document.getElementById('setting-journal-favorite-top');
        if (journalFavTopEl) journalFavTopEl.checked = e.journalFavoriteTop !== false; // 默认开启
        const journalNewestFirstEl = document.getElementById('setting-journal-newest-first');
        if (journalNewestFirstEl) journalNewestFirstEl.checked = e.journalNewestFirst === true;

        // 加载单人思维链设置
        const charCotEnabledEl = document.getElementById('setting-char-cot-enabled');
        const charCotOptionsEl = document.getElementById('setting-char-cot-options');
        const charCotChatEnabledEl = document.getElementById('setting-char-cot-chat-enabled');
        const charCotChatPresetEl = document.getElementById('setting-char-cot-chat-preset');
        const charCotChatPresetCont = document.getElementById('setting-char-cot-chat-preset-container');
        const charCotCallEnabledEl = document.getElementById('setting-char-cot-call-enabled');
        const charCotCallPresetEl = document.getElementById('setting-char-cot-call-preset');
        const charCotCallPresetCont = document.getElementById('setting-char-cot-call-preset-container');
        const charCotOfflineEnabledEl = document.getElementById('setting-char-cot-offline-enabled');
        const charCotOfflinePresetEl = document.getElementById('setting-char-cot-offline-preset');
        const charCotOfflinePresetCont = document.getElementById('setting-char-cot-offline-preset-container');
        
        if (charCotEnabledEl) {
            charCotEnabledEl.checked = e.cotSettings?.enabled || false;
            if (charCotOptionsEl) {
                charCotOptionsEl.style.display = e.cotSettings?.enabled ? 'block' : 'none';
            }
            charCotEnabledEl.onchange = function() {
                if (charCotOptionsEl) charCotOptionsEl.style.display = this.checked ? 'block' : 'none';
            };
        }
        
        if (charCotChatEnabledEl) {
            charCotChatEnabledEl.checked = e.cotSettings?.chatEnabled || false;
            if (charCotChatPresetCont) charCotChatPresetCont.style.display = charCotChatEnabledEl.checked ? 'block' : 'none';
            charCotChatEnabledEl.onchange = function() {
                if (charCotChatPresetCont) charCotChatPresetCont.style.display = this.checked ? 'block' : 'none';
            };
        }
        if (charCotCallEnabledEl) {
            charCotCallEnabledEl.checked = e.cotSettings?.callEnabled || false;
            if (charCotCallPresetCont) charCotCallPresetCont.style.display = charCotCallEnabledEl.checked ? 'block' : 'none';
            charCotCallEnabledEl.onchange = function() {
                if (charCotCallPresetCont) charCotCallPresetCont.style.display = this.checked ? 'block' : 'none';
            };
        }
        if (charCotOfflineEnabledEl) {
            charCotOfflineEnabledEl.checked = e.cotSettings?.offlineEnabled || false;
            if (charCotOfflinePresetCont) charCotOfflinePresetCont.style.display = charCotOfflineEnabledEl.checked ? 'block' : 'none';
            charCotOfflineEnabledEl.onchange = function() {
                if (charCotOfflinePresetCont) charCotOfflinePresetCont.style.display = this.checked ? 'block' : 'none';
            };
        }
        
        // 填充预设下拉框
        const presets = db.cotPresets || [];
        const populateCotPreset = (selectEl, defaultText, activeId) => {
            if (!selectEl) return;
            selectEl.innerHTML = `<option value="">${defaultText}</option>`;
            presets.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                selectEl.appendChild(opt);
            });
            if (activeId) selectEl.value = activeId;
        };
        
        populateCotPreset(charCotChatPresetEl, '默认预设', e.cotSettings?.activePresetId);
        populateCotPreset(charCotCallPresetEl, '默认通话预设', e.cotSettings?.activeCallPresetId);
        populateCotPreset(charCotOfflinePresetEl, '默认线下预设', e.cotSettings?.activeOfflinePresetId);

        // 加载小剧场设置
        const charTheaterEnabledEl = document.getElementById('setting-char-theater-enabled');
        const charTheaterOptionsEl = document.getElementById('setting-char-theater-options');
        const charTheaterProbEl = document.getElementById('setting-char-theater-probability');
        const charTheaterProbValEl = document.getElementById('setting-char-theater-probability-value');
        const charTheaterFormatEl = document.getElementById('setting-char-theater-format');
        const charTheaterPromptEl = document.getElementById('setting-char-theater-prompt');
        if (charTheaterEnabledEl) {
            charTheaterEnabledEl.checked = e.charTheaterEnabled || false;
            if (charTheaterOptionsEl) {
                charTheaterOptionsEl.style.display = e.charTheaterEnabled ? '' : 'none';
            }
            charTheaterEnabledEl.onchange = function() {
                if (charTheaterOptionsEl) charTheaterOptionsEl.style.display = this.checked ? '' : 'none';
            };
        }
        if (charTheaterProbEl) {
            const prob = e.charTheaterProbability !== undefined ? e.charTheaterProbability : 20;
            charTheaterProbEl.value = prob;
            if (charTheaterProbValEl) charTheaterProbValEl.textContent = prob + '%';
            charTheaterProbEl.oninput = function() {
                if (charTheaterProbValEl) charTheaterProbValEl.textContent = this.value + '%';
            };
        }
        if (charTheaterFormatEl) charTheaterFormatEl.value = e.charTheaterFormat || 'text';
        if (charTheaterPromptEl) charTheaterPromptEl.value = e.charTheaterPrompt || '';

        // 加载聊天条数、日记条数
        const charTheaterChatCountEl = document.getElementById('setting-char-theater-chat-count');
        const charTheaterJournalCountEl = document.getElementById('setting-char-theater-journal-count');
        if (charTheaterChatCountEl) charTheaterChatCountEl.value = e.charTheaterChatCount !== undefined ? e.charTheaterChatCount : 20;
        if (charTheaterJournalCountEl) charTheaterJournalCountEl.value = e.charTheaterJournalCount !== undefined ? e.charTheaterJournalCount : 0;

        // 渲染世界书分类下拉多选（与创建剧场页面相同风格）
        _populateCharTheaterWbDropdown(e.charTheaterWorldBookIds || []);

        // 填充预设提示词下拉
        const charTheaterPresetSel = document.getElementById('setting-char-theater-prompt-preset');
        if (charTheaterPresetSel) {
            charTheaterPresetSel.innerHTML = '<option value="">— 从预设中选择 —</option>';
            const presets = (typeof getTheaterPromptPresets === 'function') ? getTheaterPromptPresets() : (db.theaterPromptPresets || []);
            presets.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id || p.name;
                opt.textContent = p.name;
                charTheaterPresetSel.appendChild(opt);
            });
        }
        // 应用预设按钮
        const charTheaterPresetApplyBtn = document.getElementById('setting-char-theater-prompt-apply');
        if (charTheaterPresetApplyBtn) {
            charTheaterPresetApplyBtn.onclick = () => {
                const sel = document.getElementById('setting-char-theater-prompt-preset');
                const textarea = document.getElementById('setting-char-theater-prompt');
                if (!sel || !textarea) return;
                const presets = (typeof getTheaterPromptPresets === 'function') ? getTheaterPromptPresets() : (db.theaterPromptPresets || []);
                const preset = presets.find(p => (p.id || p.name) === sel.value);
                if (preset) textarea.value = preset.content || '';
            };
        }

        // 自知开关
        const charTheaterSelfAwareEl = document.getElementById('setting-char-theater-self-aware');
        if (charTheaterSelfAwareEl) {
            // 兼容历史数据：可能是字符串 "true"/"false"
            const v = e.charTheaterSelfAware;
            const normalized = (v === true || v === 'true');
            charTheaterSelfAwareEl.checked = normalized;
            // 顺便把旧数据归一化为 boolean，避免后续真值判断踩坑
            e.charTheaterSelfAware = normalized;
        }

        // 独立 API 设置
        const charTheaterUseCustomApiEl = document.getElementById('setting-char-theater-use-custom-api');
        const charTheaterApiConfigEl = document.getElementById('setting-char-theater-api-config');
        if (charTheaterUseCustomApiEl && charTheaterApiConfigEl) {
            charTheaterUseCustomApiEl.checked = e.charTheaterUseCustomApi || false;
            charTheaterApiConfigEl.style.display = e.charTheaterUseCustomApi ? '' : 'none';
            charTheaterUseCustomApiEl.onchange = () => {
                charTheaterApiConfigEl.style.display = charTheaterUseCustomApiEl.checked ? '' : 'none';
            };
            const urlEl = document.getElementById('setting-char-theater-api-url');
            const keyEl = document.getElementById('setting-char-theater-api-key');
            const modelEl = document.getElementById('setting-char-theater-api-model');
            if (urlEl) urlEl.value = e.charTheaterApiUrl || '';
            if (keyEl) keyEl.value = e.charTheaterApiKey || '';
            if (modelEl) {
                // 先确保已保存的模型作为一个选项存在，再设置选中值
                const savedModel = e.charTheaterApiModel || '';
                if (savedModel) {
                    let found = Array.from(modelEl.options).some(o => o.value === savedModel);
                    if (!found) {
                        const opt = document.createElement('option');
                        opt.value = savedModel;
                        opt.textContent = savedModel;
                        modelEl.appendChild(opt);
                    }
                    modelEl.value = savedModel;
                }
            }

            // 拉取模型按钮
            const fetchModelsBtn = document.getElementById('setting-char-theater-fetch-models-btn');
            if (fetchModelsBtn) {
                fetchModelsBtn.onclick = async () => {
                    const apiUrl = (urlEl ? urlEl.value.trim() : '');
                    const apiKey = (keyEl ? keyEl.value.trim() : '');
                    if (!apiUrl || !apiKey) {
                        showToast('请先填写 API URL 和 Key');
                        return;
                    }
                    const blockedDomains = (typeof BLOCKED_API_DOMAINS !== 'undefined') ? BLOCKED_API_DOMAINS : [];
                    if (blockedDomains.some(d => apiUrl.includes(d))) {
                        showToast('该API站点已被屏蔽');
                        return;
                    }
                    const endpoint = `${apiUrl.replace(/\/$/, '')}/v1/models`;
                    fetchModelsBtn.disabled = true;
                    const origText = fetchModelsBtn.textContent;
                    fetchModelsBtn.textContent = '拉取中…';
                    try {
                        const resp = await fetch(endpoint, { headers: { 'Authorization': `Bearer ${apiKey}` } });
                        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                        const json = await resp.json();
                        const models = (json.data || []).map(m => m.id).filter(Boolean).sort();
                        if (!models.length) { showToast('未找到可用模型'); return; }
                        const cur = modelEl ? modelEl.value : '';
                        if (modelEl) {
                            modelEl.innerHTML = '';
                            models.forEach(m => {
                                const opt = document.createElement('option');
                                opt.value = m;
                                opt.textContent = m;
                                modelEl.appendChild(opt);
                            });
                            if (models.includes(cur)) modelEl.value = cur;
                        }
                        showToast(`成功拉取 ${models.length} 个模型`);
                    } catch (err) {
                        console.error('拉取模型失败', err);
                        showToast('拉取模型失败：' + (err.message || '未知错误'));
                    } finally {
                        fetchModelsBtn.disabled = false;
                        fetchModelsBtn.textContent = origText;
                    }
                };
            }

            // 填充预设下拉
            const presetSel = document.getElementById('setting-char-theater-api-preset');
            if (presetSel) {
                presetSel.innerHTML = '<option value="">— 选择预设配置 —</option>';
                const allPresets = [
                    ...(db.apiPresets || []).map(p => ({ name: p.name + '（主API）', data: p.data })),
                    ...(db.summaryApiPresets || []).map(p => ({ name: p.name + '（总结API）', data: p.data })),
                    ...(db.backgroundApiPresets || []).map(p => ({ name: p.name + '（后台API）', data: p.data })),
                    ...(db.supplementPersonaApiPresets || []).map(p => ({ name: p.name + '（补齐人设API）', data: p.data })),
                    ...(db.peekApiPresets || []).map(p => ({ name: p.name + '（偷看手机API）', data: p.data })),
                ];
                allPresets.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = JSON.stringify(p.data);
                    opt.textContent = p.name;
                    presetSel.appendChild(opt);
                });
                presetSel.onchange = () => {
                    if (!presetSel.value) return;
                    try {
                        const data = JSON.parse(presetSel.value);
                        if (urlEl) urlEl.value = data.apiUrl || data.url || '';
                        if (keyEl) keyEl.value = data.apiKey || data.key || '';
                        if (modelEl) {
                            const m = data.model || '';
                            // 如果该模型尚不在 select 列表中，先添加再选中
                            if (m) {
                                let found = Array.from(modelEl.options).some(o => o.value === m);
                                if (!found) {
                                    const opt = document.createElement('option');
                                    opt.value = m;
                                    opt.textContent = m;
                                    modelEl.appendChild(opt);
                                }
                                modelEl.value = m;
                            }
                        }
                    } catch (err) { console.warn('预设解析失败', err); }
                    presetSel.value = '';
                };
            }
        }

        document.getElementById('setting-bilingual-mode').checked = e.bilingualModeEnabled || false;
        document.getElementById('setting-bilingual-language').value = e.bilingualLanguage || '';
        BilingualContent.syncSettingsUi();
        document.getElementById('setting-bilingual-style').value = e.bilingualBubbleStyle || 'under';
        document.getElementById('setting-auto-expand-translation').checked = e.autoExpandTranslation === true;

        if (window.PokeSystem) window.PokeSystem.ensureSettings(e);
        const pokeEnabledEl = document.getElementById('setting-poke-enabled');
        const pokeOptionsEl = document.getElementById('setting-poke-options');
        if (pokeEnabledEl) pokeEnabledEl.checked = e.pokeEnabled === true;
        if (pokeOptionsEl) pokeOptionsEl.style.display = e.pokeEnabled === true ? 'block' : 'none';
        const pokeTriggerModeEl = document.getElementById('setting-poke-trigger-mode');
        if (pokeTriggerModeEl) pokeTriggerModeEl.value = ['auto', 'both', 'avatar', 'title'].includes(e.pokeTriggerMode) ? e.pokeTriggerMode : 'auto';
        const pokeCharacterEl = document.getElementById('setting-poke-character-initiated');
        if (pokeCharacterEl) pokeCharacterEl.checked = e.pokeAllowCharacterInitiated !== false;
        const pokeReplyEl = document.getElementById('setting-poke-trigger-reply');
        if (pokeReplyEl) pokeReplyEl.checked = e.pokeTriggerReply !== false;
        const pokeCharSuffixEl = document.getElementById('setting-poke-char-suffix');
        if (pokeCharSuffixEl) pokeCharSuffixEl.value = e.pokeCharacterSuffix || '';
        const pokeUserSuffixEl = document.getElementById('setting-poke-user-suffix');
        if (pokeUserSuffixEl) pokeUserSuffixEl.value = e.pokeUserSuffix || '';
        const pokeEffectEl = document.getElementById('setting-poke-effect-mode');
        if (pokeEffectEl) pokeEffectEl.value = e.pokeEffectMode || 'full';
        const pokeVibrationEl = document.getElementById('setting-poke-vibration');
        if (pokeVibrationEl) pokeVibrationEl.checked = e.pokeVibrationEnabled !== false;
        const pokeNotificationEl = document.getElementById('setting-poke-notification-mode');
        if (pokeNotificationEl) pokeNotificationEl.value = e.pokeNotificationMode || 'in_chat';
        const pokeContextEl = document.getElementById('setting-poke-context');
        if (pokeContextEl) pokeContextEl.checked = e.pokeContextEnabled !== false;
        
        document.getElementById('setting-avatar-mode').value = e.avatarMode || 'full';
        const avatarRadius = e.avatarRadius !== undefined ? e.avatarRadius : 50;
        document.getElementById('setting-avatar-radius').value = avatarRadius;
        document.getElementById('setting-avatar-radius-value').textContent = `${avatarRadius}%`;
        
        const radiusSlider = document.getElementById('setting-avatar-radius');
        const radiusValue = document.getElementById('setting-avatar-radius-value');
        radiusSlider.oninput = () => {
            radiusValue.textContent = `${radiusSlider.value}%`;
        };

        // 头像圆角重置按钮
        const resetAvatarRadiusBtn = document.getElementById('reset-avatar-radius-btn');
        if (resetAvatarRadiusBtn) {
            resetAvatarRadiusBtn.onclick = () => {
                radiusSlider.value = 50;
                radiusValue.textContent = '50%';
            };
        }

        document.getElementById('setting-bubble-blur').checked = e.bubbleBlurEnabled !== false; 

        document.getElementById('setting-title-layout').value = e.titleLayout || 'left';
        document.getElementById('setting-show-timestamp').checked = e.showTimestamp || false;
        document.getElementById('setting-timestamp-style').value = e.timestampStyle || 'bubble';
        document.getElementById('setting-timestamp-format').value = e.timestampFormat || 'hm';
        document.getElementById('setting-show-status').checked = e.showStatus !== false;
        document.getElementById('setting-online-status-prompt').checked = e.onlineStatusPromptEnabled !== false;
        document.getElementById('setting-reset-status-on-new-game').checked = e.resetStatusOnNewGame !== false;
        document.getElementById('setting-show-status-update-msg').checked = e.showStatusUpdateMsg || false;
        document.getElementById('setting-show-reminder-msg').checked = e.showReminderMsg !== false;
        document.getElementById('setting-avatar-system-enabled').checked = e.avatarSystemEnabled || false;
        document.getElementById('setting-char-sense-avatar-change').checked = e.charSenseAvatarChangeEnabled === true;
        const arDisplaySpan = document.getElementById('avatar-recognition-detail-display');
        if (arDisplaySpan) {
            const val = db.avatarRecognitionDetailLevel;
            if (val === 'brief') arDisplaySpan.textContent = '简洁（10-20字）';
            else if (val === 'standard') arDisplaySpan.textContent = '标准（30-50字）';
            else if (val === 'detailed' || !val) arDisplaySpan.textContent = '详细（不限）';
            else {
                const n = typeof val === 'number' ? val : parseInt(val, 10);
                arDisplaySpan.textContent = (!isNaN(n) && n > 0) ? '自定义（' + n + '字）' : '详细（不限）';
            }
        }
        document.getElementById('setting-show-avatar-action-msg').checked = e.showAvatarActionMsg || false;
        const charCanSwitchEl = document.getElementById('setting-char-can-switch-avatar');
        if (charCanSwitchEl) charCanSwitchEl.checked = e.charCanSwitchAvatarEnabled === true;
        const charCollectEl = document.getElementById('setting-char-collect-image-as-avatar');
        if (charCollectEl) charCollectEl.checked = e.charCollectImageAsAvatarEnabled === true;
        const charCollectCoupleEl = document.getElementById('setting-char-collect-couple-avatar');
        if (charCollectCoupleEl) charCollectCoupleEl.checked = e.charCollectCoupleAvatarEnabled === true;
        const charSenseCoupleEl = document.getElementById('setting-char-sense-couple-avatar');
        if (charSenseCoupleEl) charSenseCoupleEl.checked = e.charSenseCoupleAvatarEnabled === true;
        document.getElementById('setting-char-reminder-enabled').checked = e.charReminderEnabled || false;

        // 消息版本管理
        const keepRegenEl = document.getElementById('setting-keep-regen-versions');
        if (keepRegenEl) keepRegenEl.checked = e.keepRegenVersions || false;

        const sp = e.statusPanel || {};
        document.getElementById('setting-status-panel-enabled').checked = sp.enabled || false;
        document.getElementById('setting-status-prompt-suffix').value = sp.promptSuffix || '';
        document.getElementById('setting-status-regex').value = sp.regexPattern || '';
        document.getElementById('setting-status-replace').value = sp.replacePattern || '';
        document.getElementById('setting-status-history-limit').value = sp.historyLimit !== undefined ? sp.historyLimit : 3;
        const retentionLimit = sp.historyRetentionLimit;
        const retentionUnlimited = document.getElementById('setting-status-retention-unlimited');
        const retentionInput = document.getElementById('setting-status-retention-limit');
        retentionUnlimited.checked = retentionLimit === 0;
        retentionInput.value = Number.isSafeInteger(retentionLimit) && retentionLimit > 0 ? retentionLimit : 20;
        retentionInput.disabled = retentionUnlimited.checked;
        
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

        const newGameBtn = document.getElementById('archive-new-game-btn');
        if (newGameBtn) {
            // 先解绑之前的事件防止重复
            const newBtn = newGameBtn.cloneNode(true);
            newGameBtn.parentNode.replaceChild(newBtn, newGameBtn);
            
            newBtn.addEventListener('click', async () => {
                const cid = currentChatId;
                if (!cid) {
                    showToast('请先进入一个角色的聊天');
                    return;
                }
                const char = db.characters.find(c => c.id === cid);
                if (!char) return;
                
                const confirmed = await customConfirm('确定要为该角色开启新档吗？\n当前角色的所有聊天记录、上下文和日记将被清空，但人设等基础设置会保留。\n\n建议在此操作前先保存当前进度的存档！', '提示');
                if (!confirmed) return;
                
                // 清空记录与状态
                char.history = [];
                if (char.resetStatusOnNewGame !== false) resetChatStatus(char);
                char.tokens = 0;
                if (char.memory) {
                    char.memory.journal = [];
                    char.memory.context = '';
                }
                char.nodes = [];
                char.chatHistory = [];
                char.messages = [];
                char.chatContext = '';
                char.chatSummary = '';
                if (char.memoryTables && typeof char.memoryTables === 'object') {
                    char.memoryTables.data = {};
                    char.memoryTables.history = [];
                    char.memoryTables.lastChangedFieldPaths = [];
                }
                if (char.vectorMemory && typeof char.vectorMemory === 'object') {
                    char.vectorMemory.entries = [];
                    char.vectorMemory.history = [];
                    char.vectorMemory.lastSummarizedMsgId = null;
                    char.vectorMemory.lastSummarizedMsgTimestamp = null;
                    char.vectorMemory.lastContextBlock = '';
                    char.vectorMemory.lastRetrievedEntryIds = [];
                    char.vectorMemory.lastQueryText = '';
                    char.vectorMemory.autoSummaryState = 'idle';
                    char.vectorMemory.autoSummaryPending = false;
                }
                
                // 同步清空拉黑和好友申请相关记忆
                char.blockHistory = [];
                char.friendRequests = [];
                char.charBlockHistory = [];
                char.userFriendRequests = [];
                char.isBlocked = false;
                char.blockedAt = null;
                char.blockReapply = null;
                char.isBlockedByChar = false;
                char.blockedByCharAt = null;
                char.blockedByCharReason = null;
                
                // 隐藏角色拉黑遮罩（如果有）
                var charBlockedOverlay = document.getElementById('char-blocked-overlay');
                if (charBlockedOverlay) charBlockedOverlay.style.display = 'none';
                
                await saveData();
                
                showToast('新档开启成功！');
                if (currentChatId === cid && typeof renderMessages === 'function') {
                    renderMessages();
                }
                if (typeof renderChatList === 'function') renderChatList();
                
                // 自动保存一个初始存档
                await createArchive(cid, '初始状态');
            });
        }

        // 加载角色正则过滤设置
        const rf = e.regexFilter || {};
        document.getElementById('setting-regex-filter-enabled').checked = rf.enabled || false;
        const rfRulesText = (rf.rules || []).map(r => r.replace ? `${r.pattern}|||${r.replace}` : r.pattern).join('\n');
        document.getElementById('setting-regex-filter-rules').value = rfRulesText;
        const regexFilterContainer = document.getElementById('regex-filter-settings-container');
        if (regexFilterContainer) {
            if (rf.enabled) {
                regexFilterContainer.style.maxHeight = '5000px';
                regexFilterContainer.style.paddingBottom = '20px';
            } else {
                regexFilterContainer.style.maxHeight = '0';
                regexFilterContainer.style.paddingBottom = '0';
            }
        }
        if (typeof populateRegexFilterPresetSelect === 'function') populateRegexFilterPresetSelect();

        const webSearchEnabledEl = document.getElementById('setting-char-web-search-enabled');
        const webSearchPayloadEl = document.getElementById('setting-char-web-search-payload');
        const webSearchPayloadCont = document.getElementById('setting-char-web-search-payload-container');
        if (webSearchEnabledEl) {
            webSearchEnabledEl.checked = !!e.webSearchEnabled;
            if (webSearchPayloadCont) {
                webSearchPayloadCont.style.display = e.webSearchEnabled ? 'flex' : 'none';
            }
            webSearchEnabledEl.onchange = function() {
                if (webSearchPayloadCont) {
                    webSearchPayloadCont.style.display = this.checked ? 'flex' : 'none';
                }
            };
        }
        if (webSearchPayloadEl) {
            webSearchPayloadEl.value = e.webSearchPayload || '';
        }

        // 加载环境与天气增强设置
        const charWeatherEnabledEl = document.getElementById('setting-char-weather-enabled');
        const charWeatherCityCont = document.getElementById('setting-char-weather-city-container');
        const charWeatherCityEl = document.getElementById('setting-char-weather-city');
        const userWeatherEnabledEl = document.getElementById('setting-user-weather-enabled');
        const userWeatherCityCont = document.getElementById('setting-user-weather-city-container');
        const userWeatherCityEl = document.getElementById('setting-user-weather-city');
        const locateBtn = document.getElementById('setting-user-weather-locate-btn');

        // 单人独立天气 API
        const charWeatherCustomApiEnabledEl = document.getElementById('setting-char-weather-custom-api-enabled');
        const charWeatherCustomApiCont = document.getElementById('setting-char-weather-custom-api-container');
        const charWeatherProviderEl = document.getElementById('setting-char-weather-provider');
        const charWeatherKeyCont = document.getElementById('setting-char-weather-key-container');
        const charWeatherKeyEl = document.getElementById('setting-char-weather-key');

        if (charWeatherEnabledEl) {
            charWeatherEnabledEl.checked = e.weatherSettings?.charEnabled || false;
            if (charWeatherCityCont) charWeatherCityCont.style.display = charWeatherEnabledEl.checked ? 'flex' : 'none';
            charWeatherEnabledEl.onchange = function() {
                if (charWeatherCityCont) charWeatherCityCont.style.display = this.checked ? 'flex' : 'none';
            };
        }
        if (charWeatherCityEl) charWeatherCityEl.value = e.weatherSettings?.charCity || '';

        if (userWeatherEnabledEl) {
            userWeatherEnabledEl.checked = e.weatherSettings?.userEnabled || false;
            if (userWeatherCityCont) userWeatherCityCont.style.display = userWeatherEnabledEl.checked ? 'flex' : 'none';
            userWeatherEnabledEl.onchange = function() {
                if (userWeatherCityCont) userWeatherCityCont.style.display = this.checked ? 'flex' : 'none';
            };
        }
        if (userWeatherCityEl) userWeatherCityEl.value = e.weatherSettings?.userCity || '';

        if (charWeatherCustomApiEnabledEl) {
            charWeatherCustomApiEnabledEl.checked = e.weatherSettings?.customApiEnabled || false;
            if (charWeatherCustomApiCont) charWeatherCustomApiCont.style.display = charWeatherCustomApiEnabledEl.checked ? 'block' : 'none';
            charWeatherCustomApiEnabledEl.onchange = function() {
                if (charWeatherCustomApiCont) charWeatherCustomApiCont.style.display = this.checked ? 'block' : 'none';
            };
        }
        if (charWeatherProviderEl) {
            charWeatherProviderEl.value = e.weatherSettings?.provider || 'openmeteo';
            const updateKeyVis = () => {
                if (charWeatherProviderEl.value === 'qweather' || charWeatherProviderEl.value === 'seniverse') {
                    if (charWeatherKeyCont) charWeatherKeyCont.style.display = 'flex';
                } else {
                    if (charWeatherKeyCont) charWeatherKeyCont.style.display = 'none';
                }
            };
            charWeatherProviderEl.onchange = updateKeyVis;
            updateKeyVis();
        }
        if (charWeatherKeyEl) charWeatherKeyEl.value = e.weatherSettings?.apiKey || '';

        // 定位按钮功能
        if (locateBtn && userWeatherCityEl) {
            // 避免重复绑定
            locateBtn.replaceWith(locateBtn.cloneNode(true));
            document.getElementById('setting-user-weather-locate-btn').addEventListener('click', async () => {
                const btn = document.getElementById('setting-user-weather-locate-btn');
                btn.textContent = '定位中...';
                btn.disabled = true;
                
                try {
                    if (!navigator.geolocation) {
                        throw new Error('浏览器不支持定位功能');
                    }
                    
                    const position = await new Promise((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
                    });
                    
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    
                    // 将经纬度填入输入框，让获取天气的逻辑去解析坐标
                    userWeatherCityEl.value = `${lat.toFixed(4)},${lon.toFixed(4)}`;
                    showToast('定位成功！');
                } catch (error) {
                    console.error('定位失败', error);
                    showToast(error.message || '获取位置失败，请手动输入');
                } finally {
                    btn.textContent = '📍 定位';
                    btn.disabled = false;
                }
            });
        }

        document.getElementById('setting-shop-interaction-enabled').checked = e.shopInteractionEnabled !== false;

        const familyCardEnabledEl = document.getElementById('setting-family-card-enabled');
        if (familyCardEnabledEl) familyCardEnabledEl.checked = e.familyCardEnabled === true;

        const autonomousShoppingEl = document.getElementById('setting-autonomous-shopping-enabled');
        if (autonomousShoppingEl) autonomousShoppingEl.checked = e.autonomousShoppingEnabled === true;
        const ownWalletShoppingEl = document.getElementById('setting-character-own-wallet-shopping-enabled');
        if (ownWalletShoppingEl) ownWalletShoppingEl.checked = e.characterOwnWalletShoppingEnabled !== false;
        const familyCardSpendingEl = document.getElementById('setting-character-family-card-spending-enabled');
        if (familyCardSpendingEl) familyCardSpendingEl.checked = e.characterFamilyCardSpendingEnabled === true;
        const selfShoppingEl = document.getElementById('setting-character-self-shopping-enabled');
        if (selfShoppingEl) selfShoppingEl.checked = e.characterSelfShoppingEnabled !== false;
        const giftShoppingEl = document.getElementById('setting-character-gift-shopping-enabled');
        if (giftShoppingEl) giftShoppingEl.checked = e.characterGiftShoppingEnabled !== false;
        const payRequestEl = document.getElementById('setting-character-pay-request-enabled');
        if (payRequestEl) payRequestEl.checked = e.characterPayRequestEnabled !== false;
        const shoppingSingleLimitEl = document.getElementById('setting-character-shopping-single-limit');
        if (shoppingSingleLimitEl) shoppingSingleLimitEl.value = e.characterShoppingSingleLimit ?? 200;
        const shoppingBudgetEl = document.getElementById('setting-character-shopping-period-budget');
        if (shoppingBudgetEl) shoppingBudgetEl.value = e.characterShoppingPeriodBudget ?? 1000;
        const shoppingFrequencyEl = document.getElementById('setting-character-shopping-frequency');
        if (shoppingFrequencyEl) shoppingFrequencyEl.value = e.characterShoppingFrequency || 'rare';
        const shoppingCategoriesEl = document.getElementById('setting-character-shopping-categories');
        if (shoppingCategoriesEl) shoppingCategoriesEl.value = e.characterShoppingAllowedCategories || '';

        document.getElementById('setting-video-call-enabled').checked = e.videoCallEnabled || false;
        document.getElementById('setting-real-camera-enabled').checked = e.realCameraEnabled || false;
        document.getElementById('setting-vc-novelai-enabled').checked = e.vcNovelAiEnabled || false;
        const vcGptDrawEl = document.getElementById('setting-vc-gpt-draw-enabled');
        if (vcGptDrawEl) vcGptDrawEl.checked = e.vcGptDrawEnabled || false;
        const vcGoogleImageEl = document.getElementById('setting-vc-google-image-enabled');
        if (vcGoogleImageEl) vcGoogleImageEl.checked = e.vcGoogleImageEnabled || false;
        const vcStabilityImageEl = document.getElementById('setting-vc-stability-image-enabled');
        if (vcStabilityImageEl) vcStabilityImageEl.checked = e.vcStabilityImageEnabled || false;
        const saveCallOnInterruptEl = document.getElementById('setting-save-call-on-interrupt');
        if (saveCallOnInterruptEl) saveCallOnInterruptEl.checked = e.saveCallOnInterrupt || false;

        // === 加载 NovelAI 生图设置（模型/尺寸/画师串）到拓展 Tab ===
        if (db.novelAiSettings) {
            const ns = db.novelAiSettings;
            const naiModelEl = document.getElementById('novelai-model');
            const naiResEl = document.getElementById('novelai-resolution');
            const naiArtistEl = document.getElementById('novelai-artist-tags');
            if (naiModelEl && ns.model) naiModelEl.value = ns.model;
            if (naiResEl && ns.resolution) naiResEl.value = ns.resolution;
            if (naiArtistEl && ns.artistTags !== undefined) naiArtistEl.value = ns.artistTags;
        }

        // === 加载 GPT 专属画师串到拓展 Tab ===
        const gptArtistEl = document.getElementById('gpt-artist-prompt');
        if (gptArtistEl) {
            gptArtistEl.value = e.gptArtistPrompt || '';
        }
        window.OvoFaceLock?.loadSettings(e);

        const ar = e.autoReply || {};
        document.getElementById('setting-auto-reply-enabled').checked = ar.enabled || false;
        document.getElementById('setting-auto-reply-interval').value = ar.interval || 60;
        
        const modeSelect = document.getElementById('setting-auto-reply-mode');
        const fixedContainer = document.getElementById('setting-auto-reply-fixed-container');
        const randomContainer = document.getElementById('setting-auto-reply-random-container');
        
        if (modeSelect) {
            modeSelect.value = ar.mode || 'fixed';
            
            const updateModeDisplay = () => {
                if (modeSelect.value === 'random') {
                    if (fixedContainer) fixedContainer.style.display = 'none';
                    if (randomContainer) randomContainer.style.display = 'flex';
                } else {
                    if (fixedContainer) fixedContainer.style.display = 'flex';
                    if (randomContainer) randomContainer.style.display = 'none';
                }
            };
            
            updateModeDisplay();
            modeSelect.addEventListener('change', updateModeDisplay);
        }
        
        const minInput = document.getElementById('setting-auto-reply-min');
        if (minInput) minInput.value = ar.minInterval || 60;
        
        const maxInput = document.getElementById('setting-auto-reply-max');
        if (maxInput) maxInput.value = ar.maxInterval || 180;

        // === 加载角色回复后追发设置 ===
        const followUp = window.FollowUpReply
            ? window.FollowUpReply.ensureSettings(e)
            : (e.followUpReply || {});
        const followUpEnabledEl = document.getElementById('setting-follow-up-enabled');
        const followUpOptionsEl = document.getElementById('setting-follow-up-options');
        const followUpModeEl = document.getElementById('setting-follow-up-mode');
        const followUpFixedEl = document.getElementById('setting-follow-up-fixed-container');
        const followUpRandomEl = document.getElementById('setting-follow-up-random-container');
        const followUpProbabilityEl = document.getElementById('setting-follow-up-probability');
        const followUpProbabilityValueEl = document.getElementById('setting-follow-up-probability-value');
        const hoursValue = minutes => Math.round((Number(minutes || 0) / 60) * 1000) / 1000;
        if (followUpEnabledEl) followUpEnabledEl.checked = followUp.enabled === true;
        if (followUpOptionsEl) followUpOptionsEl.style.display = followUp.enabled === true ? 'block' : 'none';
        if (followUpModeEl) followUpModeEl.value = followUp.delayMode === 'fixed' ? 'fixed' : 'random';
        const followUpFixedHoursEl = document.getElementById('setting-follow-up-fixed-hours');
        const followUpMinHoursEl = document.getElementById('setting-follow-up-min-hours');
        const followUpMaxHoursEl = document.getElementById('setting-follow-up-max-hours');
        if (followUpFixedHoursEl) followUpFixedHoursEl.value = hoursValue(followUp.fixedDelayMinutes || 120);
        if (followUpMinHoursEl) followUpMinHoursEl.value = hoursValue(followUp.minDelayMinutes || 60);
        if (followUpMaxHoursEl) followUpMaxHoursEl.value = hoursValue(followUp.maxDelayMinutes || 180);
        if (followUpProbabilityEl) followUpProbabilityEl.value = followUp.probability ?? 35;
        if (followUpProbabilityValueEl) followUpProbabilityValueEl.textContent = `${followUp.probability ?? 35}%`;
        const followUpMaxCountEl = document.getElementById('setting-follow-up-max-count');
        if (followUpMaxCountEl) followUpMaxCountEl.value = String(followUp.maxFollowUps || 1);
        const updateFollowUpVisibility = () => {
            const enabled = followUpEnabledEl && followUpEnabledEl.checked;
            const fixedMode = followUpModeEl && followUpModeEl.value === 'fixed';
            if (followUpOptionsEl) followUpOptionsEl.style.display = enabled ? 'block' : 'none';
            if (followUpFixedEl) followUpFixedEl.style.display = fixedMode ? 'flex' : 'none';
            if (followUpRandomEl) followUpRandomEl.style.display = fixedMode ? 'none' : 'flex';
        };
        if (followUpEnabledEl) followUpEnabledEl.onchange = updateFollowUpVisibility;
        if (followUpModeEl) followUpModeEl.onchange = updateFollowUpVisibility;
        if (followUpProbabilityEl) {
            followUpProbabilityEl.oninput = function () {
                if (followUpProbabilityValueEl) followUpProbabilityValueEl.textContent = `${this.value}%`;
            };
        }
        updateFollowUpVisibility();

        // === 加载消息弹窗通知设置 ===
        const bgToastEl = document.getElementById('setting-bg-toast-enabled');
        if (bgToastEl) {
            // 如果单人设置未定义，则显示全局设置的状态
            bgToastEl.checked = e.bgToastEnabled !== undefined ? e.bgToastEnabled : (db.globalToastEnabled !== false);
        }

        // === 加载免打扰时段设置 ===
        const qh = ar.quietHours || {};
        const qhEnabledEl = document.getElementById('setting-quiet-hours-enabled');
        const qhRangeEl = document.getElementById('quiet-hours-range');
        qhEnabledEl.checked = qh.enabled || false;
        document.getElementById('setting-quiet-hours-start').value = qh.start || '23:00';
        document.getElementById('setting-quiet-hours-end').value = qh.end || '07:00';
        qhRangeEl.style.display = qhEnabledEl.checked ? 'block' : 'none';
        qhEnabledEl.addEventListener('change', () => {
            qhRangeEl.style.display = qhEnabledEl.checked ? 'block' : 'none';
        });

        document.getElementById('setting-use-real-gallery').checked = e.useRealGallery || false;

        // === 加载 TTS 配置 ===
        if (typeof TTSSettings !== 'undefined' && TTSSettings.loadChatTTSConfig) {
            TTSSettings.loadChatTTSConfig(currentChatId);
        }

        // === 拉黑与好友申请面板 ===
        const blockCharacterBtnEl = document.getElementById('block-character-btn');
        const blockSettingsPanelEl = document.getElementById('block-settings-panel');
        const blockReapplyModeEl = document.getElementById('block-reapply-mode');
        const blockFixedIntervalEl = document.getElementById('block-fixed-interval');
        const blockFixedIntervalRowEl = document.getElementById('block-fixed-interval-row');
        const blockRequestCountEl = document.getElementById('block-request-count');
        const canBlockUserEl = document.getElementById('setting-can-block-user');
        if (canBlockUserEl) canBlockUserEl.checked = e.canBlockUser !== false;

        // 角色掌控模式
        const phoneControlEnabledEl = document.getElementById('setting-phone-control-enabled');
        const phoneControlOptionsEl = document.getElementById('setting-phone-control-options');
        const phoneControlActionsEl = document.getElementById('setting-phone-control-actions');
        const phoneControlViewLimitEl = document.getElementById('setting-phone-control-view-limit');
        const phoneControlViewLimitValueEl = document.getElementById('setting-phone-control-view-limit-value');
        if (phoneControlEnabledEl) {
            phoneControlEnabledEl.checked = e.phoneControlEnabled || false;
            if (phoneControlOptionsEl) phoneControlOptionsEl.style.display = phoneControlEnabledEl.checked ? 'block' : 'none';
            if (phoneControlActionsEl) phoneControlActionsEl.style.display = phoneControlEnabledEl.checked ? 'flex' : 'none';
        }
        const phoneControlCharFilterEl = document.getElementById('setting-phone-control-char-filter');
        const phoneControlCharSelectionEl = document.getElementById('setting-phone-control-char-selection');
        const phoneControlCharFilterEnabledEl = document.getElementById('setting-phone-control-char-filter-enabled');
        if (phoneControlCharFilterEl) phoneControlCharFilterEl.style.display = e.phoneControlEnabled ? 'flex' : 'none';
        if (phoneControlCharFilterEnabledEl) phoneControlCharFilterEnabledEl.checked = e.phoneControlCharFilterEnabled || false;
        if (phoneControlCharSelectionEl) phoneControlCharSelectionEl.style.display = (e.phoneControlEnabled && e.phoneControlCharFilterEnabled) ? 'flex' : 'none';
        if (phoneControlViewLimitEl) {
            const limit = Math.min(50, Math.max(5, parseInt(e.phoneControlViewLimit, 10) || 10));
            phoneControlViewLimitEl.value = limit;
            if (phoneControlViewLimitValueEl) phoneControlViewLimitValueEl.textContent = limit;
        }

        if (blockCharacterBtnEl && blockSettingsPanelEl) {
            if (e.isBlocked) {
                blockCharacterBtnEl.style.display = 'none';
                blockSettingsPanelEl.style.display = 'block';
                const br = e.blockReapply || {};
                if (blockReapplyModeEl) blockReapplyModeEl.value = br.mode || 'fixed';
                if (blockFixedIntervalEl) blockFixedIntervalEl.value = Math.max(1, br.fixedInterval || 30);
                if (blockRequestCountEl) blockRequestCountEl.textContent = (e.friendRequests && e.friendRequests.length) ? e.friendRequests.length : 0;
                if (blockFixedIntervalRowEl) blockFixedIntervalRowEl.style.display = (br.mode === 'auto') ? 'none' : '';
                
                const triggerBtn = document.getElementById('trigger-friend-request-btn');
                if (triggerBtn) {
                    if (e.blockReapply && e.blockReapply.pendingRequestId) {
                        triggerBtn.textContent = '查看未处理申请';
                        triggerBtn.classList.add('pending');
                    } else {
                        triggerBtn.textContent = '生成好友申请';
                        triggerBtn.classList.remove('pending');
                    }
                }
            } else {
                blockCharacterBtnEl.style.display = '';
                blockSettingsPanelEl.style.display = 'none';
            }
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
        const allowCharSwitchCssEl = document.getElementById('setting-allow-char-switch-bubble-css');
        const bindingsWrap = document.getElementById('bubble-css-theme-bindings-wrap');
        if (allowCharSwitchCssEl) allowCharSwitchCssEl.checked = !!e.allowCharSwitchBubbleCss;
        if (bindingsWrap) bindingsWrap.style.display = (e.allowCharSwitchBubbleCss ? 'block' : 'none');
        populateBubbleThemeBindingsList(e.bubbleCssThemeBindings || []);
        populateMyPersonaSelect();
        if (typeof populateStatusBarPresetSelect === 'function') {
            populateStatusBarPresetSelect();
        }
        if (window.McpManager) window.McpManager.renderPermissionEditor(document.getElementById('chat-mcp-settings'), e);
    }
}

async function saveSettingsFromSidebar() {
    const e = db.characters.find(e => e.id === currentChatId);
    if (e) {
        const retentionInput = document.getElementById('setting-status-retention-limit');
        const retentionUnlimited = document.getElementById('setting-status-retention-unlimited').checked;
        const retentionText = retentionInput.value.trim();
        const retentionLimit = retentionUnlimited ? 0 : Number(retentionText);
        if (!retentionUnlimited && (!/^\d+$/.test(retentionText) || !Number.isSafeInteger(retentionLimit) || retentionLimit < 1)) {
            showToast('请输入大于 0 的整数作为历史数量提醒阈值');
            retentionInput.focus();
            return;
        }
        // 保存提醒阈值不删展示历史，整理在独立页面由用户手动确认。
        try { window.OvoFaceLock?.saveSettings(e); }
        catch (error) { showToast(error.message); return; }
        try { if (window.Moments) window.Moments.saveCharacterSettings(e); }
        catch (error) { showToast(error.message || '动态设置无效，请检查时间'); return; }
        try { window.CharacterProfile?.saveSettings(e); }
        catch (error) { showToast(error.message); return; }
        const avatarPreviewEl = document.getElementById('setting-char-avatar-preview');
        if (avatarPreviewEl) {
            e.avatar = avatarPreviewEl.src;
        }
        const realNameInput = document.getElementById('setting-char-real-name');
        if (realNameInput) e.realName = (realNameInput.value || '').trim();
        
        const birthdayInput = document.getElementById('setting-char-birthday');
        if (birthdayInput) e.birthday = (birthdayInput.value || '').trim();
        
        const enableDynamicAgeInput = document.getElementById('setting-char-enable-dynamic-age');
        if (enableDynamicAgeInput) e.enableDynamicAge = enableDynamicAgeInput.checked;
        
        e.remarkName = document.getElementById('setting-char-remark').value;
        
        const timezoneInput = document.getElementById('setting-char-timezone');
        const timezonePresetEl = document.getElementById('setting-char-timezone-preset');
        if (timezoneInput) {
            e.charTimezone = (timezoneInput.value || '').trim();
            if (timezonePresetEl && timezonePresetEl.value && !timezoneInput.value) {
                e.charTimezone = timezonePresetEl.value;
            }
        }
        
        const enableDynamicTimezoneInput = document.getElementById('setting-char-enable-dynamic-timezone');
        if (enableDynamicTimezoneInput) e.enableDynamicTimezone = enableDynamicTimezoneInput.checked;
        
        const customPromptPresetInput = document.getElementById('setting-char-custom-prompt-preset');
        if (customPromptPresetInput) {
            e.customPromptPresetId = customPromptPresetInput.value;
            e.customPromptPreset = customPromptPresetInput.value;
        }

        e.persona = document.getElementById('setting-char-persona').value;
        
        if (e.source === 'forum' || e.source === 'peek') {
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

        const stickerDescEnabledEl = document.getElementById('setting-char-sticker-description-enabled');
        if (stickerDescEnabledEl) {
            e.stickerDescriptionEnabled = stickerDescEnabledEl.checked;
        }

        // 头像系统：有头像变动则识别（含缓存）并系统通知
        const myAvatarPreviewEl = document.getElementById('setting-my-avatar-preview');
        const _newMyAvatar = myAvatarPreviewEl ? myAvatarPreviewEl.src : e.myAvatar;
        const _previousCharAvatar = e.avatar;
        const _senseAvatarChangeEnabled = document.getElementById('setting-char-sense-avatar-change').checked;
        if (window.AvatarSystem && _senseAvatarChangeEnabled && e.myAvatar && _newMyAvatar !== e.myAvatar) {
            await window.AvatarSystem.recognizeAndNotifyUserAvatarChange(currentChatId, e.myAvatar, _newMyAvatar);
        }
        if (window.AvatarSystem && typeof window.AvatarSystem.syncManualAvatarChange === 'function') {
            window.AvatarSystem.syncManualAvatarChange(currentChatId, _newMyAvatar, avatarPreviewEl ? avatarPreviewEl.src : _previousCharAvatar);
        }
        e.myAvatar = _newMyAvatar;
        e.myName = document.getElementById('setting-my-name').value;
        e.myPersona = document.getElementById('setting-my-persona').value;
        
        const myBirthdayInput = document.getElementById('setting-my-birthday');
        if (myBirthdayInput) e.myBirthday = (myBirthdayInput.value || '').trim();
        const myEnableDynamicAgeInput = document.getElementById('setting-my-enable-dynamic-age');
        if (myEnableDynamicAgeInput) e.myEnableDynamicAge = myEnableDynamicAgeInput.checked;
        
        const myEnableDynamicTimezoneInput = document.getElementById('setting-my-enable-dynamic-timezone');
        if (myEnableDynamicTimezoneInput) e.myEnableDynamicTimezone = myEnableDynamicTimezoneInput.checked;
        
        const myTimezoneInput = document.getElementById('setting-my-timezone');
        const myTimezonePresetEl = document.getElementById('setting-my-timezone-preset');
        if (myTimezoneInput) {
            e.myTimezone = (myTimezoneInput.value || '').trim();
            if (myTimezonePresetEl && myTimezonePresetEl.value && !myTimezoneInput.value) {
                e.myTimezone = myTimezonePresetEl.value;
            }
        }
        
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
        const showDebugContentEl = document.getElementById('setting-show-debug-content');
        if (showDebugContentEl) e.showDebugContent = showDebugContentEl.checked;
        e.replyCountMin = parseInt(document.getElementById('setting-reply-count-min').value, 10) || 3;
        e.replyCountMax = parseInt(document.getElementById('setting-reply-count-max').value, 10) || 8;
        const stickerSmartMatchCb = document.getElementById('setting-sticker-smart-match');
        e.stickerSmartMatchEnabled = stickerSmartMatchCb ? stickerSmartMatchCb.checked : false;

        if (typeof ensureAutoJournalState === 'function') {
            ensureAutoJournalState(e);
        }
        e.autoJournalEnabled = document.getElementById('setting-auto-journal-enabled').checked;
        const memoryModeElSave = document.getElementById('setting-memory-mode');
        e.memoryMode = memoryModeElSave ? memoryModeElSave.value : 'journal';
        const autoJournalIntervalInput = parseInt(document.getElementById('setting-auto-journal-interval').value, 10);
        e.autoJournalInterval = (isNaN(autoJournalIntervalInput) || autoJournalIntervalInput < 10) ? 100 : autoJournalIntervalInput;
        const charAutoFavEl = document.getElementById('setting-char-auto-favorite');
        e.characterAutoFavoriteEnabled = charAutoFavEl ? charAutoFavEl.checked : false;

        const charAwareUserFavoritesEl = document.getElementById('setting-char-aware-user-favorites');
        e.charAwareUserFavorites = charAwareUserFavoritesEl ? charAwareUserFavoritesEl.checked : false;
        
        const awareScopeAll = document.getElementById('setting-aware-favorite-scope-all');
        e.awareFavoriteScope = (awareScopeAll && awareScopeAll.checked) ? 'all' : 'current';

        const journalFavTopEl = document.getElementById('setting-journal-favorite-top');
        if (journalFavTopEl) {
            e.journalFavoriteTop = journalFavTopEl.checked;
        } else if (e.journalFavoriteTop === undefined) {
            e.journalFavoriteTop = true; // 如果元素不存在且未定义过，默认保护为 true
        }
        const journalNewestFirstEl = document.getElementById('setting-journal-newest-first');
        if (journalNewestFirstEl) e.journalNewestFirst = journalNewestFirstEl.checked;

        // 保存单人思维链设置
        const charCotEnabledSave = document.getElementById('setting-char-cot-enabled');
        const charCotChatEnabledSave = document.getElementById('setting-char-cot-chat-enabled');
        const charCotChatPresetSave = document.getElementById('setting-char-cot-chat-preset');
        const charCotCallEnabledSave = document.getElementById('setting-char-cot-call-enabled');
        const charCotCallPresetSave = document.getElementById('setting-char-cot-call-preset');
        const charCotOfflineEnabledSave = document.getElementById('setting-char-cot-offline-enabled');
        const charCotOfflinePresetSave = document.getElementById('setting-char-cot-offline-preset');
        
        if (!e.cotSettings) e.cotSettings = {};
        e.cotSettings.enabled = charCotEnabledSave ? charCotEnabledSave.checked : false;
        e.cotSettings.chatEnabled = charCotChatEnabledSave ? charCotChatEnabledSave.checked : false;
        e.cotSettings.activePresetId = charCotChatPresetSave ? charCotChatPresetSave.value : '';
        e.cotSettings.callEnabled = charCotCallEnabledSave ? charCotCallEnabledSave.checked : false;
        e.cotSettings.activeCallPresetId = charCotCallPresetSave ? charCotCallPresetSave.value : '';
        e.cotSettings.offlineEnabled = charCotOfflineEnabledSave ? charCotOfflineEnabledSave.checked : false;
        e.cotSettings.activeOfflinePresetId = charCotOfflinePresetSave ? charCotOfflinePresetSave.value : '';

        // 保存小剧场设置
        const charTheaterEnabledSave = document.getElementById('setting-char-theater-enabled');
        const charTheaterProbSave = document.getElementById('setting-char-theater-probability');
        const charTheaterFormatSave = document.getElementById('setting-char-theater-format');
        const charTheaterPromptSave = document.getElementById('setting-char-theater-prompt');
        e.charTheaterEnabled = charTheaterEnabledSave ? charTheaterEnabledSave.checked : false;
        e.charTheaterProbability = charTheaterProbSave ? parseInt(charTheaterProbSave.value, 10) : 20;
        e.charTheaterFormat = charTheaterFormatSave ? charTheaterFormatSave.value : 'text';
        e.charTheaterPrompt = charTheaterPromptSave ? charTheaterPromptSave.value.trim() : '';
        // 保存聊天条数、日记条数
        const charTheaterChatCountSave = document.getElementById('setting-char-theater-chat-count');
        const charTheaterJournalCountSave = document.getElementById('setting-char-theater-journal-count');
        e.charTheaterChatCount = charTheaterChatCountSave ? Math.max(0, parseInt(charTheaterChatCountSave.value, 10) || 0) : 20;
        e.charTheaterJournalCount = charTheaterJournalCountSave ? Math.max(0, parseInt(charTheaterJournalCountSave.value, 10) || 0) : 0;
        // 保存世界书多选（theater风格下拉）
        const charTheaterWbOptionsCont = document.getElementById('setting-char-theater-wb-options');
        if (charTheaterWbOptionsCont) {
            e.charTheaterWorldBookIds = Array.from(
                charTheaterWbOptionsCont.querySelectorAll('.theater-multiselect-option.selected')
            ).map(opt => opt.dataset.id).filter(Boolean);
        } else {
            e.charTheaterWorldBookIds = [];
        }
        // 保存自知开关
        const charTheaterSelfAwareSave = document.getElementById('setting-char-theater-self-aware');
        e.charTheaterSelfAware = charTheaterSelfAwareSave ? charTheaterSelfAwareSave.checked : false;

        // 保存独立 API 设置
        const charTheaterUseCustomApiSave = document.getElementById('setting-char-theater-use-custom-api');
        e.charTheaterUseCustomApi = charTheaterUseCustomApiSave ? charTheaterUseCustomApiSave.checked : false;
        e.charTheaterApiUrl = (document.getElementById('setting-char-theater-api-url')?.value || '').trim();
        e.charTheaterApiKey = (document.getElementById('setting-char-theater-api-key')?.value || '').trim();
        e.charTheaterApiModel = (document.getElementById('setting-char-theater-api-model')?.value || '').trim();

        e.useCustomBubbleCss = document.getElementById('setting-use-custom-css').checked;
        e.customBubbleCss = document.getElementById('setting-custom-bubble-css').value;
        e.allowCharSwitchBubbleCss = document.getElementById('setting-allow-char-switch-bubble-css').checked;
        e.bubbleCssThemeBindings = collectBubbleThemeBindingsFromDOM();
        if (e.allowCharSwitchBubbleCss) {
            const cssTrim = (e.customBubbleCss || '').trim();
            const presets = _getBubblePresets();
            const matched = presets.find(p => p.css && (p.css.trim() === cssTrim));
            e.currentBubbleCssPresetName = matched ? matched.name : '';
        }
        e.bilingualModeEnabled = document.getElementById('setting-bilingual-mode').checked;
        e.bilingualLanguage = document.getElementById('setting-bilingual-language').value.trim();
        e.bilingualBubbleStyle = document.getElementById('setting-bilingual-style').value;
        e.autoExpandTranslation = document.getElementById('setting-auto-expand-translation').checked;
        
        e.avatarMode = document.getElementById('setting-avatar-mode').value;
        e.avatarRadius = parseInt(document.getElementById('setting-avatar-radius').value, 10);

        const chatScreen = document.getElementById('chat-room-screen');

        e.bubbleBlurEnabled = document.getElementById('setting-bubble-blur').checked;
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

        e.timestampFormat = document.getElementById('setting-timestamp-format').value;

        e.showStatus = document.getElementById('setting-show-status').checked;
        const subtitle = document.getElementById('chat-room-subtitle');
        if (subtitle) {
            subtitle.style.display = e.showStatus ? 'flex' : 'none';
        }

        e.showStatusUpdateMsg = document.getElementById('setting-show-status-update-msg').checked;
        e.showReminderMsg = document.getElementById('setting-show-reminder-msg').checked;
        const pokeEnabledEl = document.getElementById('setting-poke-enabled');
        e.pokeEnabled = !!(pokeEnabledEl && pokeEnabledEl.checked);
        const pokeTriggerModeEl = document.getElementById('setting-poke-trigger-mode');
        e.pokeTriggerMode = pokeTriggerModeEl ? pokeTriggerModeEl.value : 'auto';
        const pokeCharacterEl = document.getElementById('setting-poke-character-initiated');
        e.pokeAllowCharacterInitiated = !pokeCharacterEl || pokeCharacterEl.checked;
        const pokeReplyEl = document.getElementById('setting-poke-trigger-reply');
        e.pokeTriggerReply = !pokeReplyEl || pokeReplyEl.checked;
        const pokeCharSuffixEl = document.getElementById('setting-poke-char-suffix');
        e.pokeCharacterSuffix = window.PokeSystem ? window.PokeSystem.cleanSuffix(pokeCharSuffixEl && pokeCharSuffixEl.value) : ((pokeCharSuffixEl && pokeCharSuffixEl.value) || '').trim();
        const pokeUserSuffixEl = document.getElementById('setting-poke-user-suffix');
        e.pokeUserSuffix = window.PokeSystem ? window.PokeSystem.cleanSuffix(pokeUserSuffixEl && pokeUserSuffixEl.value) : ((pokeUserSuffixEl && pokeUserSuffixEl.value) || '').trim();
        const pokeEffectEl = document.getElementById('setting-poke-effect-mode');
        e.pokeEffectMode = pokeEffectEl ? pokeEffectEl.value : 'full';
        const pokeVibrationEl = document.getElementById('setting-poke-vibration');
        e.pokeVibrationEnabled = !pokeVibrationEl || pokeVibrationEl.checked;
        const pokeNotificationEl = document.getElementById('setting-poke-notification-mode');
        e.pokeNotificationMode = pokeNotificationEl ? pokeNotificationEl.value : 'in_chat';
        const pokeContextEl = document.getElementById('setting-poke-context');
        e.pokeContextEnabled = !pokeContextEl || pokeContextEl.checked;
        if (window.PokeSystem) window.PokeSystem.updateTriggerUI(e, 'private');
        e.avatarSystemEnabled = document.getElementById('setting-avatar-system-enabled').checked;
        e.charSenseAvatarChangeEnabled = _senseAvatarChangeEnabled;
        const charCanSwitchInput = document.getElementById('setting-char-can-switch-avatar');
        e.charCanSwitchAvatarEnabled = charCanSwitchInput ? charCanSwitchInput.checked : false;
        const charCollectInput = document.getElementById('setting-char-collect-image-as-avatar');
        e.charCollectImageAsAvatarEnabled = charCollectInput ? charCollectInput.checked : false;
        const charCollectCoupleInput = document.getElementById('setting-char-collect-couple-avatar');
        e.charCollectCoupleAvatarEnabled = charCollectCoupleInput ? charCollectCoupleInput.checked : false;
        const charSenseCoupleInput = document.getElementById('setting-char-sense-couple-avatar');
        e.charSenseCoupleAvatarEnabled = charSenseCoupleInput ? charSenseCoupleInput.checked : false;
        e.showAvatarActionMsg = document.getElementById('setting-show-avatar-action-msg').checked;
        e.charReminderEnabled = document.getElementById('setting-char-reminder-enabled').checked;

        // 消息版本管理
        const keepRegenSave = document.getElementById('setting-keep-regen-versions');
        e.keepRegenVersions = keepRegenSave ? keepRegenSave.checked : false;

        if (!e.statusPanel) e.statusPanel = {};
        e.statusPanel.enabled = document.getElementById('setting-status-panel-enabled').checked;
        e.statusPanel.promptSuffix = document.getElementById('setting-status-prompt-suffix').value;
        e.statusPanel.regexPattern = document.getElementById('setting-status-regex').value;
        e.statusPanel.replacePattern = document.getElementById('setting-status-replace').value;
        const historyLimitInput = parseInt(document.getElementById('setting-status-history-limit').value, 10);
        e.statusPanel.historyLimit = isNaN(historyLimitInput) ? 3 : historyLimitInput;
        e.statusPanel.historyRetentionLimit = retentionLimit;

        // 保存角色正则过滤设置
        if (!e.regexFilter) e.regexFilter = {};
        e.regexFilter.enabled = document.getElementById('setting-regex-filter-enabled').checked;
        const rfRulesText = document.getElementById('setting-regex-filter-rules').value;
        e.regexFilter.rules = (typeof parseRegexFilterRulesText === 'function') ? parseRegexFilterRulesText(rfRulesText) : [];

        const webSearchEnabledElSave = document.getElementById('setting-char-web-search-enabled');
        const webSearchPayloadElSave = document.getElementById('setting-char-web-search-payload');
        e.webSearchEnabled = webSearchEnabledElSave ? webSearchEnabledElSave.checked : false;
        e.webSearchPayload = webSearchPayloadElSave ? webSearchPayloadElSave.value.trim() : '';

        // 保存环境与天气增强设置
        if (!e.weatherSettings) e.weatherSettings = {};
        e.weatherSettings.charEnabled = document.getElementById('setting-char-weather-enabled')?.checked || false;
        e.weatherSettings.charCity = (document.getElementById('setting-char-weather-city')?.value || '').trim();
        e.weatherSettings.userEnabled = document.getElementById('setting-user-weather-enabled')?.checked || false;
        e.weatherSettings.userCity = (document.getElementById('setting-user-weather-city')?.value || '').trim();
        
        e.weatherSettings.customApiEnabled = document.getElementById('setting-char-weather-custom-api-enabled')?.checked || false;
        e.weatherSettings.provider = document.getElementById('setting-char-weather-provider')?.value || 'openmeteo';
        e.weatherSettings.apiKey = (document.getElementById('setting-char-weather-key')?.value || '').trim();

        e.shopInteractionEnabled = document.getElementById('setting-shop-interaction-enabled').checked;
        const familyCardEnabledEl = document.getElementById('setting-family-card-enabled');
        if (familyCardEnabledEl) e.familyCardEnabled = familyCardEnabledEl.checked;

        const autonomousShoppingEl = document.getElementById('setting-autonomous-shopping-enabled');
        if (autonomousShoppingEl) e.autonomousShoppingEnabled = autonomousShoppingEl.checked;
        const ownWalletShoppingEl = document.getElementById('setting-character-own-wallet-shopping-enabled');
        if (ownWalletShoppingEl) e.characterOwnWalletShoppingEnabled = ownWalletShoppingEl.checked;
        const familyCardSpendingEl = document.getElementById('setting-character-family-card-spending-enabled');
        if (familyCardSpendingEl) e.characterFamilyCardSpendingEnabled = familyCardSpendingEl.checked;
        const selfShoppingEl = document.getElementById('setting-character-self-shopping-enabled');
        if (selfShoppingEl) e.characterSelfShoppingEnabled = selfShoppingEl.checked;
        const giftShoppingEl = document.getElementById('setting-character-gift-shopping-enabled');
        if (giftShoppingEl) e.characterGiftShoppingEnabled = giftShoppingEl.checked;
        const payRequestEl = document.getElementById('setting-character-pay-request-enabled');
        if (payRequestEl) e.characterPayRequestEnabled = payRequestEl.checked;
        const shoppingSingleLimitEl = document.getElementById('setting-character-shopping-single-limit');
        if (shoppingSingleLimitEl) e.characterShoppingSingleLimit = Math.max(0, Number(shoppingSingleLimitEl.value) || 0);
        const shoppingBudgetEl = document.getElementById('setting-character-shopping-period-budget');
        if (shoppingBudgetEl) e.characterShoppingPeriodBudget = Math.max(0, Number(shoppingBudgetEl.value) || 0);
        const shoppingFrequencyEl = document.getElementById('setting-character-shopping-frequency');
        if (shoppingFrequencyEl) e.characterShoppingFrequency = shoppingFrequencyEl.value || 'rare';
        const shoppingCategoriesEl = document.getElementById('setting-character-shopping-categories');
        if (shoppingCategoriesEl) e.characterShoppingAllowedCategories = shoppingCategoriesEl.value.trim();

        e.videoCallEnabled = document.getElementById('setting-video-call-enabled').checked;
        e.realCameraEnabled = document.getElementById('setting-real-camera-enabled').checked;
        e.vcNovelAiEnabled = document.getElementById('setting-vc-novelai-enabled').checked;
        const vcGptDrawSave = document.getElementById('setting-vc-gpt-draw-enabled');
        e.vcGptDrawEnabled = vcGptDrawSave ? vcGptDrawSave.checked : false;
        const vcGoogleImageSave = document.getElementById('setting-vc-google-image-enabled');
        e.vcGoogleImageEnabled = vcGoogleImageSave ? vcGoogleImageSave.checked : false;
        const vcStabilityImageSave = document.getElementById('setting-vc-stability-image-enabled');
        e.vcStabilityImageEnabled = vcStabilityImageSave ? vcStabilityImageSave.checked : false;
        const saveCallOnInterruptSave = document.getElementById('setting-save-call-on-interrupt');
        e.saveCallOnInterrupt = saveCallOnInterruptSave ? saveCallOnInterruptSave.checked : false;

        // === 保存 NovelAI 生图设置（模型/尺寸/画师串）回 db.novelAiSettings ===
        {
            const naiModelEl = document.getElementById('novelai-model');
            const naiResEl = document.getElementById('novelai-resolution');
            const naiArtistEl = document.getElementById('novelai-artist-tags');
            if (!db.novelAiSettings) db.novelAiSettings = {};
            if (naiModelEl) db.novelAiSettings.model = naiModelEl.value;
            if (naiResEl) db.novelAiSettings.resolution = naiResEl.value;
            if (naiArtistEl) db.novelAiSettings.artistTags = naiArtistEl.value.trim();
        }

        // === 保存 GPT 专属画师串 ===
        const gptArtistEl = document.getElementById('gpt-artist-prompt');
        if (gptArtistEl) {
            e.gptArtistPrompt = gptArtistEl.value.trim();
        }

        if (!e.autoReply) e.autoReply = {};
        e.autoReply.enabled = document.getElementById('setting-auto-reply-enabled').checked;
        
        const modeSelect = document.getElementById('setting-auto-reply-mode');
        e.autoReply.mode = modeSelect ? modeSelect.value : 'fixed';
        
        const autoReplyIntervalInput = parseInt(document.getElementById('setting-auto-reply-interval').value, 10);
        e.autoReply.interval = isNaN(autoReplyIntervalInput) ? 60 : autoReplyIntervalInput;
        
        const autoReplyMinInput = parseInt(document.getElementById('setting-auto-reply-min').value, 10);
        e.autoReply.minInterval = isNaN(autoReplyMinInput) ? 60 : autoReplyMinInput;
        
        const autoReplyMaxInput = parseInt(document.getElementById('setting-auto-reply-max').value, 10);
        e.autoReply.maxInterval = isNaN(autoReplyMaxInput) ? 180 : autoReplyMaxInput;

        // === 保存角色回复后追发设置 ===
        const followUp = window.FollowUpReply
            ? window.FollowUpReply.ensureSettings(e)
            : (e.followUpReply || (e.followUpReply = {}));
        const followUpEnabledEl = document.getElementById('setting-follow-up-enabled');
        const followUpModeEl = document.getElementById('setting-follow-up-mode');
        const followUpFixedHoursEl = document.getElementById('setting-follow-up-fixed-hours');
        const followUpMinHoursEl = document.getElementById('setting-follow-up-min-hours');
        const followUpMaxHoursEl = document.getElementById('setting-follow-up-max-hours');
        const followUpProbabilityEl = document.getElementById('setting-follow-up-probability');
        const followUpMaxCountEl = document.getElementById('setting-follow-up-max-count');
        const toMinutes = (input, fallback) => {
            const hours = Number(input && input.value);
            if (!Number.isFinite(hours)) return fallback;
            return Math.min(10080, Math.max(5, Math.round(hours * 60)));
        };
        followUp.enabled = !!(followUpEnabledEl && followUpEnabledEl.checked);
        followUp.delayMode = followUpModeEl && followUpModeEl.value === 'fixed' ? 'fixed' : 'random';
        followUp.fixedDelayMinutes = toMinutes(followUpFixedHoursEl, 120);
        followUp.minDelayMinutes = toMinutes(followUpMinHoursEl, 60);
        followUp.maxDelayMinutes = toMinutes(followUpMaxHoursEl, 180);
        if (followUp.minDelayMinutes > followUp.maxDelayMinutes) {
            const oldMin = followUp.minDelayMinutes;
            followUp.minDelayMinutes = followUp.maxDelayMinutes;
            followUp.maxDelayMinutes = oldMin;
        }
        followUp.probability = Math.min(100, Math.max(0, parseInt(followUpProbabilityEl && followUpProbabilityEl.value, 10) || 0));
        followUp.maxFollowUps = Math.min(3, Math.max(1, parseInt(followUpMaxCountEl && followUpMaxCountEl.value, 10) || 1));
        if (!followUp.enabled) followUp.pending = null;

        // === 保存消息弹窗通知设置 ===
        const bgToastEl = document.getElementById('setting-bg-toast-enabled');
        if (bgToastEl) e.bgToastEnabled = bgToastEl.checked;

        // === 保存免打扰时段设置 ===
        if (!e.autoReply.quietHours) e.autoReply.quietHours = {};
        e.autoReply.quietHours.enabled = document.getElementById('setting-quiet-hours-enabled').checked;
        e.autoReply.quietHours.start = document.getElementById('setting-quiet-hours-start').value || '23:00';
        e.autoReply.quietHours.end = document.getElementById('setting-quiet-hours-end').value || '07:00';

        e.useRealGallery = document.getElementById('setting-use-real-gallery').checked;

        if (e.isBlocked) {
            if (!e.blockReapply) e.blockReapply = {};
            const blockModeEl = document.getElementById('block-reapply-mode');
            const blockIntervalEl = document.getElementById('block-fixed-interval');
            e.blockReapply.mode = (blockModeEl && blockModeEl.value) || 'fixed';
            e.blockReapply.fixedInterval = blockIntervalEl ? Math.max(1, parseInt(blockIntervalEl.value, 10) || 30) : 30;
        }
        const canBlockUserCheckbox = document.getElementById('setting-can-block-user');
        if (canBlockUserCheckbox) e.canBlockUser = canBlockUserCheckbox.checked;

        const phoneControlEnabledCheckbox = document.getElementById('setting-phone-control-enabled');
        if (phoneControlEnabledCheckbox) e.phoneControlEnabled = phoneControlEnabledCheckbox.checked;
        const phoneControlViewLimitInput = document.getElementById('setting-phone-control-view-limit');
        if (phoneControlViewLimitInput) e.phoneControlViewLimit = Math.min(50, Math.max(5, parseInt(phoneControlViewLimitInput.value, 10) || 10));
        const phoneControlCharFilterCheckbox = document.getElementById('setting-phone-control-char-filter-enabled');
        if (phoneControlCharFilterCheckbox) e.phoneControlCharFilterEnabled = phoneControlCharFilterCheckbox.checked;
        if (window.McpManager && document.getElementById('chat-mcp-settings')) e.mcpSettings = window.McpManager.readPermissionEditor(document.getElementById('chat-mcp-settings'));
        // phoneControlVisibleCharIds 的保存将在弹窗确认时直接操作 db 并触发 saveData，这里无需额外处理，只需保持状态同步

        if (await saveData() === false) return;
        if (window.MomentsControls) await window.MomentsControls.reschedule(e.momentsActorId || 'char:' + e.id);
        if (currentChatId === e.id && typeof currentQuoteInfo !== 'undefined' && currentQuoteInfo?.senderId === 'user_me') {
            const name = window.CharacterProfile?.getUserNickname(e) || e.myName;
            document.querySelector('#reply-preview-bar .reply-preview-name').textContent = `回复 ${name}`;
        }
        showToast('设置已保存！');
        chatRoomTitle.textContent = e.remarkName;
        renderChatList();
        // updateCustomBubbleStyle(currentChatId, e.customBubbleCss, e.useCustomBubbleCss); // 移除实时应用以防污染设置页
        currentPage = 1;
        renderMessages(false, true);
    }
}

