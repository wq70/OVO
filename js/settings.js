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
            char.myAvatar = compressedUrl;
            await saveData();
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
            if (typeof saveData === 'function') saveData();
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
                    await saveData();
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
        await saveData();
        showToast('已恢复默认背景');
    });
    
    document.getElementById('clear-chat-history-btn')?.addEventListener('click', async () => {
        const character = db.characters.find(c => c.id === currentChatId);
        if (!character) return;
        if (confirm(`你确定要清空与“${character.remarkName}”的所有聊天记录吗？这个操作是不可恢复的！`)) {
            character.history = [];
            character.status = '在线';
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
            await saveData();
            renderMessages(false, true);
            renderChatList();
            if (currentChatId === character.id) {
                document.getElementById('chat-room-status-text').textContent = '在线';
            }
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

            const pngDataUrl = await writeOvoPngMetadata(base64Image, exportChar);
            const a = document.createElement('a');
            a.href = pngDataUrl;
            a.download = `OVO角色卡_${character.remarkName || character.realName || '未命名'}_${new Date().toISOString().slice(0, 10)}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showToast('PNG 角色卡导出成功');
        } catch (error) {
            console.error('导出 PNG 角色卡失败:', error);
            showToast(`导出失败: ${error.message}`);
        }
    });

    document.getElementById('export-ovo-card-json-btn')?.addEventListener('click', () => {
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

        const jsonStr = JSON.stringify(exportChar, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `OVO角色卡_${character.remarkName || character.realName || '未命名'}_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast('JSON 角色卡导出成功');
    });

    // --- 聊天记录导出 ---
    document.getElementById('export-chat-history-btn')?.addEventListener('click', () => {
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
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `聊天记录_${character.remarkName}_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('聊天记录导出成功');
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

            await saveData();
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
            showToast('还有待处理的好友申请');
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
        phoneControlEnabledEl?.addEventListener('change', function () {
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
                this.checked = true;
                if (typeof getAiReply === 'function' && currentChatType === 'private' && currentChatId) {
                    getAiReply(currentChatId, 'private', true, false, false, true);
                    if (typeof showToast === 'function') showToast('TA 可能不会轻易同意…');
                }
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
                await saveData();
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
                await saveData();
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
            await saveData();
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
        const globalIds = (db.worldBooks || []).filter(wb => wb.isGlobal && !wb.disabled).map(wb => wb.id);
        let displayIds = [];
        if (currentChatType === 'private') {
            const character = db.characters.find(c => c.id === currentChatId);
            if (!character) return;
            const ids = currentWorldBookMode === 'offline' ? (character.offlineWorldBookIds || []) : (character.worldBookIds || []);
            displayIds = [...new Set([...ids, ...globalIds])];
        } else if (currentChatType === 'group') {
            const group = db.groups.find(g => g.id === currentChatId);
            if (!group) return;
            const ids = currentWorldBookMode === 'offline' ? (group.offlineWorldBookIds || []) : (group.worldBookIds || []);
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

    document.getElementById('save-world-book-selection-btn')?.addEventListener('click', async () => {
        const globalIds = (db.worldBooks || []).filter(wb => wb.isGlobal && !wb.disabled).map(wb => wb.id);
        const selectedIds = Array.from(document.getElementById('world-book-selection-list').querySelectorAll('.item-checkbox:checked')).map(input => input.value);
        const toSave = selectedIds.filter(id => !globalIds.includes(id));
        if (currentChatType === 'private') {
            const character = db.characters.find(c => c.id === currentChatId);
            if (character) {
                if (currentWorldBookMode === 'offline') {
                    character.offlineWorldBookIds = toSave;
                } else {
                    character.worldBookIds = toSave;
                }
            }
        } else if (currentChatType === 'group') {
            const group = db.groups.find(g => g.id === currentChatId);
            if (group) {
                if (currentWorldBookMode === 'offline') {
                    group.offlineWorldBookIds = toSave;
                } else {
                    group.worldBookIds = toSave;
                }
            }
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
        const realNameEl = document.getElementById('setting-char-real-name');
        if (realNameEl) realNameEl.value = e.realName || '';
        
        const birthdayEl = document.getElementById('setting-char-birthday');
        if (birthdayEl) birthdayEl.value = e.birthday || '';
        
        const enableDynamicAgeEl = document.getElementById('setting-char-enable-dynamic-age');
        if (enableDynamicAgeEl) enableDynamicAgeEl.checked = e.enableDynamicAge || false;
        
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
        
        const journalFavTopEl = document.getElementById('setting-journal-favorite-top');
        if (journalFavTopEl) journalFavTopEl.checked = e.journalFavoriteTop !== false; // 默认开启

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
        document.getElementById('setting-timestamp-format').value = e.timestampFormat || 'hm';
        document.getElementById('setting-show-status').checked = e.showStatus !== false;
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

        document.getElementById('setting-shop-interaction-enabled').checked = e.shopInteractionEnabled !== false;

        const familyCardEnabledEl = document.getElementById('setting-family-card-enabled');
        if (familyCardEnabledEl) familyCardEnabledEl.checked = e.familyCardEnabled === true;

        document.getElementById('setting-video-call-enabled').checked = e.videoCallEnabled || false;
        document.getElementById('setting-real-camera-enabled').checked = e.realCameraEnabled || false;
        document.getElementById('setting-vc-novelai-enabled').checked = e.vcNovelAiEnabled || false;
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

        const ar = e.autoReply || {};
        document.getElementById('setting-auto-reply-enabled').checked = ar.enabled || false;
        document.getElementById('setting-auto-reply-interval').value = ar.interval || 60;

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
    }
}

async function saveSettingsFromSidebar() {
    const e = db.characters.find(e => e.id === currentChatId);
    if (e) {
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
        if (window.AvatarSystem && e.charSenseAvatarChangeEnabled && e.myAvatar && _newMyAvatar !== e.myAvatar) {
            await window.AvatarSystem.recognizeAndNotifyUserAvatarChange(currentChatId, e.myAvatar, _newMyAvatar);
        }
        e.myAvatar = _newMyAvatar;
        e.myName = document.getElementById('setting-my-name').value;
        e.myPersona = document.getElementById('setting-my-persona').value;
        
        const myBirthdayInput = document.getElementById('setting-my-birthday');
        if (myBirthdayInput) e.myBirthday = (myBirthdayInput.value || '').trim();
        const myEnableDynamicAgeInput = document.getElementById('setting-my-enable-dynamic-age');
        if (myEnableDynamicAgeInput) e.myEnableDynamicAge = myEnableDynamicAgeInput.checked;
        
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
        const journalFavTopEl = document.getElementById('setting-journal-favorite-top');
        if (journalFavTopEl) e.journalFavoriteTop = journalFavTopEl.checked;

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

        e.timestampFormat = document.getElementById('setting-timestamp-format').value;

        e.showStatus = document.getElementById('setting-show-status').checked;
        const subtitle = document.getElementById('chat-room-subtitle');
        if (subtitle) {
            subtitle.style.display = e.showStatus ? 'flex' : 'none';
        }

        e.showStatusUpdateMsg = document.getElementById('setting-show-status-update-msg').checked;
        e.showReminderMsg = document.getElementById('setting-show-reminder-msg').checked;
        e.avatarSystemEnabled = document.getElementById('setting-avatar-system-enabled').checked;
        e.charSenseAvatarChangeEnabled = document.getElementById('setting-char-sense-avatar-change').checked;
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

        // 保存角色正则过滤设置
        if (!e.regexFilter) e.regexFilter = {};
        e.regexFilter.enabled = document.getElementById('setting-regex-filter-enabled').checked;
        const rfRulesText = document.getElementById('setting-regex-filter-rules').value;
        e.regexFilter.rules = (typeof parseRegexFilterRulesText === 'function') ? parseRegexFilterRulesText(rfRulesText) : [];

        const webSearchEnabledElSave = document.getElementById('setting-char-web-search-enabled');
        const webSearchPayloadElSave = document.getElementById('setting-char-web-search-payload');
        e.webSearchEnabled = webSearchEnabledElSave ? webSearchEnabledElSave.checked : false;
        e.webSearchPayload = webSearchPayloadElSave ? webSearchPayloadElSave.value.trim() : '';
        
        e.shopInteractionEnabled = document.getElementById('setting-shop-interaction-enabled').checked;
        const familyCardEnabledEl = document.getElementById('setting-family-card-enabled');
        if (familyCardEnabledEl) e.familyCardEnabled = familyCardEnabledEl.checked;

        e.videoCallEnabled = document.getElementById('setting-video-call-enabled').checked;
        e.realCameraEnabled = document.getElementById('setting-real-camera-enabled').checked;
        e.vcNovelAiEnabled = document.getElementById('setting-vc-novelai-enabled').checked;
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

        if (!e.autoReply) e.autoReply = {};
        e.autoReply.enabled = document.getElementById('setting-auto-reply-enabled').checked;
        const autoReplyIntervalInput = parseInt(document.getElementById('setting-auto-reply-interval').value, 10);
        e.autoReply.interval = isNaN(autoReplyIntervalInput) ? 60 : autoReplyIntervalInput;

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
        // phoneControlVisibleCharIds 的保存将在弹窗确认时直接操作 db 并触发 saveData，这里无需额外处理，只需保持状态同步

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
    if (db.apiSettings && typeof db.apiSettings.onlineRoleEnabled !== 'undefined') { document.getElementById('online-role-switch').checked = db.apiSettings.onlineRoleEnabled; } else { document.getElementById('online-role-switch').checked = true; }
    if (db.apiSettings && typeof db.apiSettings.timePerceptionEnabled !== 'undefined') { document.getElementById('time-perception-switch').checked = db.apiSettings.timePerceptionEnabled; }
    if (db.apiSettings && typeof db.apiSettings.streamEnabled !== 'undefined') { document.getElementById('stream-switch').checked = db.apiSettings.streamEnabled; } else { document.getElementById('stream-switch').checked = true; }
    if (db.apiSettings && typeof db.apiSettings.quickReplyEnabled !== 'undefined') { document.getElementById('quick-reply-switch').checked = db.apiSettings.quickReplyEnabled; } else { document.getElementById('quick-reply-switch').checked = false; }

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
    n?.addEventListener('change', () => {
        if (r) r.value = c[n.value] || ''
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

    t?.addEventListener('click', () => window.fetchAndPopulateModels(true));
    e?.addEventListener('submit', async (e) => {
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
            onlineRoleEnabled: document.getElementById('online-role-switch').checked,
            timePerceptionEnabled: document.getElementById('time-perception-switch').checked,
            streamEnabled: document.getElementById('stream-switch').checked,
            quickReplyEnabled: document.getElementById('quick-reply-switch').checked,
            temperature: parseFloat(document.getElementById('temperature-slider').value)
        };
        
        // 保存自动识图全局开关
        const irSwitch = document.getElementById('imageRecognition-enabled-switch');
        if (irSwitch) {
            db.imageRecognitionEnabled = irSwitch.checked;
        }

        await saveData();
        showToast('API设置已保存！')
    });
    
    // === 副API设置：总结API ===
    setupSubApiSettings('summary', 'summaryApiSettings', 'summaryApiPresets');
    
    // === 副API设置：后台活动API ===
    setupSubApiSettings('background', 'backgroundApiSettings', 'backgroundApiPresets');
    
    // === 副API设置：补齐人设API ===
    setupSubApiSettings('supplementPersona', 'supplementPersonaApiSettings', 'supplementPersonaApiPresets');
    
    // === 副API设置：偷看手机API ===
    setupSubApiSettings('peek', 'peekApiSettings', 'peekApiPresets');

    // === 副API设置：自动识图 API ===
    setupSubApiSettings('imageRecognition', 'imageRecognitionApiSettings', 'imageRecognitionApiPresets');
    
    if (db.imageRecognitionEnabled !== undefined) {
        document.getElementById('imageRecognition-enabled-switch').checked = db.imageRecognitionEnabled;
    } else {
        document.getElementById('imageRecognition-enabled-switch').checked = false; // 默认关闭
    }

    // === 副API设置：表情包识图 API ===
    setupSubApiSettings('stickerRecognition', 'stickerRecognitionApiSettings', 'stickerRecognitionApiPresets');

    // === NovelAI 生图 API 设置 ===
    setupNovelAiSettings();
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
    var subApiDisplayNames = { summary: '总结', background: '后台活动', supplementPersona: '补齐人设', peek: '偷看手机', imageRecognition: '自动识图', stickerRecognition: '表情包识图' };
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
        if (presetSelect) presetSelect.innerHTML = '<option value="">— 选择 —</option>';
        presets.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.name;
            opt.textContent = p.name;
            if (presetSelect) presetSelect.appendChild(opt);
        });
    }
    
    populatePresets();
    
    // 应用预设
    applyBtn?.addEventListener('click', async () => {
        const name = presetSelect ? presetSelect.value : '';
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
    savePresetBtn?.addEventListener('click', () => {
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
    manageBtn?.addEventListener('click', () => {
        renderPresetsList();
        if (modal) modal.style.display = 'flex';
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
            if (presetsList) presetsList.appendChild(div);
        });
    }
    
    closeModalBtn?.addEventListener('click', () => {
        if (modal) modal.style.display = 'none';
    });
    
    // 导入预设
    importBtn?.addEventListener('click', () => {
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
    exportBtn?.addEventListener('click', () => {
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

// === NovelAI 生图 API 设置 ===
function setupNovelAiSettings() {
    const enabledEl = document.getElementById('novelai-enabled');
    const tokenEl = document.getElementById('novelai-token');
    const modelEl = document.getElementById('novelai-model');
    const resolutionEl = document.getElementById('novelai-resolution');
    const samplerEl = document.getElementById('novelai-sampler');
    const stepsSlider = document.getElementById('novelai-steps');
    const stepsValue = document.getElementById('novelai-steps-value');
    const scaleSlider = document.getElementById('novelai-scale');
    const scaleValue = document.getElementById('novelai-scale-value');
    const systemPromptEl = document.getElementById('novelai-system-prompt');
    const artistTagsEl = document.getElementById('novelai-artist-tags');
    const negativePromptEl = document.getElementById('novelai-negative-prompt');
    const saveBtn = document.getElementById('novelai-save-btn');
    const testBtn = document.getElementById('novelai-test-btn');

    // 加载已保存的设置
    if (db.novelAiSettings) {
        const s = db.novelAiSettings;
        if (enabledEl) enabledEl.checked = !!s.enabled;
        if (tokenEl) tokenEl.value = s.token || '';
        if (modelEl && s.model) modelEl.value = s.model;
        if (resolutionEl && s.resolution) resolutionEl.value = s.resolution;
        if (samplerEl && s.sampler) samplerEl.value = s.sampler;
        if (stepsSlider && s.steps !== undefined) {
            stepsSlider.value = s.steps;
            if (stepsValue) stepsValue.textContent = s.steps;
        }
        if (scaleSlider && s.scale !== undefined) {
            scaleSlider.value = s.scale;
            if (scaleValue) scaleValue.textContent = s.scale;
        }
        if (systemPromptEl && s.systemPrompt !== undefined) {
            systemPromptEl.value = s.systemPrompt;
        }
        if (artistTagsEl && s.artistTags !== undefined) {
            artistTagsEl.value = s.artistTags;
        }
        if (negativePromptEl && s.negativePrompt !== undefined) {
            negativePromptEl.value = s.negativePrompt;
        }
    }

    // 滑块实时反馈
    if (stepsSlider && stepsValue) {
        stepsSlider.addEventListener('input', (e) => {
            stepsValue.textContent = e.target.value;
        });
    }
    if (scaleSlider && scaleValue) {
        scaleSlider.addEventListener('input', (e) => {
            scaleValue.textContent = e.target.value;
        });
    }

    // 保存设置
    if (saveBtn) {
        saveBtn?.addEventListener('click', async () => {
            db.novelAiSettings = {
                enabled: enabledEl ? enabledEl.checked : false,
                token: tokenEl ? tokenEl.value.trim() : '',
                model: modelEl ? modelEl.value : 'nai-diffusion-4-curated-preview',
                resolution: resolutionEl ? resolutionEl.value : '832x1216',
                sampler: samplerEl ? samplerEl.value : 'k_euler',
                steps: stepsSlider ? parseInt(stepsSlider.value) : 28,
                scale: scaleSlider ? parseFloat(scaleSlider.value) : 5,
                systemPrompt: systemPromptEl ? systemPromptEl.value.trim() : '',
                artistTags: artistTagsEl ? artistTagsEl.value.trim() : '',
                negativePrompt: negativePromptEl ? negativePromptEl.value : ''
            };
            await saveData();
            showToast('NovelAI 生图设置已保存！');
        });
    }

    // 测试生图
    if (testBtn) {
        testBtn?.addEventListener('click', async () => {
            const token = tokenEl ? tokenEl.value.trim() : '';
            if (!token) {
                showToast('请先填写 NovelAI API Token');
                return;
            }

            testBtn.disabled = true;
            testBtn.querySelector('.btn-text').textContent = '⏳ 生成中...';

            try {
                const result = await generateNovelAiImage('1girl, upper body, beautiful', {
                    token: token,
                    model: modelEl ? modelEl.value : 'nai-diffusion-4-curated-preview',
                    resolution: resolutionEl ? resolutionEl.value : '832x1216',
                    sampler: samplerEl ? samplerEl.value : 'k_euler',
                    steps: stepsSlider ? parseInt(stepsSlider.value) : 28,
                    scale: scaleSlider ? parseFloat(scaleSlider.value) : 5,
                    systemPrompt: systemPromptEl ? systemPromptEl.value.trim() : '',
                    artistTags: artistTagsEl ? artistTagsEl.value.trim() : '',
                    negativePrompt: negativePromptEl ? negativePromptEl.value : ''
                });

                if (result && result.imageUrl) {
                    const preview = document.getElementById('novelai-test-preview');
                    const img = document.getElementById('novelai-test-image');
                    if (preview && img) {
                        img.src = result.imageUrl;
                        preview.style.display = 'block';
                    }
                    showToast('✅ 测试生图成功！');
                }
            } catch (err) {
                console.error('[NovelAI] 测试生图失败:', err);
                showToast('❌ 生图失败: ' + (err.message || '未知错误'));
            } finally {
                testBtn.disabled = false;
                testBtn.querySelector('.btn-text').textContent = '🎨 测试生图';
            }
        });
    }
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

function populateBubbleThemeBindingsList(bindings) {
    const listEl = document.getElementById('bubble-css-theme-bindings-list');
    const emptyEl = document.getElementById('bubble-css-theme-bindings-empty');
    if (!listEl || !emptyEl) return;
    listEl.innerHTML = '';
    const presets = _getBubblePresets();
    if (!bindings || bindings.length === 0) {
        listEl.style.display = 'none';
        emptyEl.style.display = 'block';
        return;
    }
    listEl.style.display = 'block';
    emptyEl.style.display = 'none';
    bindings.forEach((b, idx) => {
        const row = document.createElement('div');
        row.className = 'bubble-theme-binding-row';
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-color,#eee);';
        row.dataset.presetName = b.presetName;
        const nameSpan = document.createElement('span');
        nameSpan.style.cssText = 'min-width:100px;font-weight:500;color:var(--text-color,#333);';
        nameSpan.textContent = b.presetName;
        const descInput = document.createElement('input');
        descInput.type = 'text';
        descInput.placeholder = '选填描述';
        descInput.value = b.description || '';
        descInput.style.cssText = 'flex:1;padding:6px 8px;border-radius:6px;border:1px solid var(--border-color,#eee);font-size:13px;';
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn-small';
        delBtn.style.cssText = 'padding:4px 8px;border-radius:6px;color:#c62828;';
        delBtn.textContent = '移除';
        delBtn.addEventListener('click', () => {
            const char = db.characters.find(c => c.id === currentChatId);
            if (!char) return;
            if (!Array.isArray(char.bubbleCssThemeBindings)) char.bubbleCssThemeBindings = [];
            const i = char.bubbleCssThemeBindings.findIndex(x => x.presetName === b.presetName);
            if (i >= 0) char.bubbleCssThemeBindings.splice(i, 1);
            populateBubbleThemeBindingsList(char.bubbleCssThemeBindings);
        });
        row.appendChild(nameSpan);
        row.appendChild(descInput);
        row.appendChild(delBtn);
        listEl.appendChild(row);
    });
}

function collectBubbleThemeBindingsFromDOM() {
    const listEl = document.getElementById('bubble-css-theme-bindings-list');
    if (!listEl) return [];
    const rows = listEl.querySelectorAll('.bubble-theme-binding-row');
    return Array.from(rows).map(row => ({
        presetName: row.dataset.presetName || '',
        description: (row.querySelector('input') && row.querySelector('input').value) ? row.querySelector('input').value.trim() : ''
    })).filter(b => b.presetName);
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
                chat.currentBubbleCssPresetName = presetName;
                chat.themeJustChangedByUser = presetName;
            }
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
                if (p.avatar && p.avatar !== e.myAvatar && window.AvatarSystem && e.charSenseAvatarChangeEnabled) {
                    await window.AvatarSystem.recognizeAndNotifyUserAvatarChange(currentChatId, e.myAvatar, p.avatar);
                }
                e.myPersona = p.persona || '';
                e.myAvatar = p.avatar || '';
                await saveData();
                showToast('预设已应用并保存到当前聊天');
                if (typeof loadSettingsToSidebar === 'function') try{ loadSettingsToSidebar(); }catch(e){}
                if (typeof renderChatList === 'function') try{ renderChatList(); }catch(e){}
                if (typeof renderMessages === 'function') renderMessages(false, true);
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
    const urlVal = fontUrlInput ? fontUrlInput.value.trim() : '';
    const currentFont = urlVal || db.fontUrl || '';
    if (!currentFont) return showToast('当前无字体可保存');
    
    let name = prompt('请输入预设名称（将覆盖同名预设）：');
    if (!name) return;
    
    const presets = _getFontPresets();
    const idx = presets.findIndex(p => p.name === name);
    const preset = { name, url: currentFont, localFontName: db.localFontName || '' };
    
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
    const isLocal = p.url && p.url.startsWith('data:');
    if (fontUrlInput) fontUrlInput.value = isLocal ? '' : p.url;
    
    db.fontUrl = p.url;
    db.localFontName = p.localFontName || '';
    saveData();
    applyGlobalFont(p.url);
    
    const nameEl = document.getElementById('local-font-name');
    if (nameEl) {
        if (isLocal && p.localFontName) {
            nameEl.textContent = '已加载本地字体：' + p.localFontName;
            nameEl.style.display = 'block';
        } else {
            nameEl.style.display = 'none';
        }
    }
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
        const select = document.getElementById('bubble-preset-select');
        const selVal = select ? select.value : '';
        if (!selVal) return showToast('请选择要应用的预设');
        applyPresetToCurrentChat(selVal);
    });
    if (bubbleSaveBtn) bubbleSaveBtn.addEventListener('click', saveCurrentTextareaAsPreset);
    if (bubbleManageBtn) bubbleManageBtn.addEventListener('click', openManagePresetsModal);
    if (bubbleModalClose) bubbleModalClose.addEventListener('click', () => {
        const modal = document.getElementById('bubble-presets-modal');
        if (modal) modal.style.display = 'none';
    });

    const allowCharSwitchCssCb = document.getElementById('setting-allow-char-switch-bubble-css');
    const bubbleBindingsWrap = document.getElementById('bubble-css-theme-bindings-wrap');
    if (allowCharSwitchCssCb && bubbleBindingsWrap) {
        allowCharSwitchCssCb.addEventListener('change', () => {
            bubbleBindingsWrap.style.display = allowCharSwitchCssCb.checked ? 'block' : 'none';
        });
    }
    const bubbleAddThemeBtn = document.getElementById('bubble-css-add-theme-binding-btn');
    const bubbleAddThemeModal = document.getElementById('bubble-add-theme-modal');
    const bubbleAddThemePresetSelect = document.getElementById('bubble-add-theme-preset-select');
    const bubbleAddThemeDescInput = document.getElementById('bubble-add-theme-desc-input');
    const bubbleAddThemeCancelBtn = document.getElementById('bubble-add-theme-cancel-btn');
    const bubbleAddThemeConfirmBtn = document.getElementById('bubble-add-theme-confirm-btn');
    if (bubbleAddThemeBtn) bubbleAddThemeBtn.addEventListener('click', () => {
        const char = db.characters.find(c => c.id === currentChatId);
        if (!char) return showToast('请先选择角色');
        const presets = _getBubblePresets();
        const boundNames = (char.bubbleCssThemeBindings || []).map(b => b.presetName);
        const available = presets.filter(p => !boundNames.includes(p.name));
        if (!bubbleAddThemePresetSelect) return;
        bubbleAddThemePresetSelect.innerHTML = '<option value="">— 选择预设 —</option>';
        available.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.name;
            opt.textContent = p.name;
            bubbleAddThemePresetSelect.appendChild(opt);
        });
        if (bubbleAddThemeDescInput) bubbleAddThemeDescInput.value = '';
        if (bubbleAddThemeModal) bubbleAddThemeModal.style.display = 'flex';
    });
    if (bubbleAddThemeCancelBtn) bubbleAddThemeCancelBtn.addEventListener('click', () => {
        if (bubbleAddThemeModal) bubbleAddThemeModal.style.display = 'none';
    });
    if (bubbleAddThemeConfirmBtn) bubbleAddThemeConfirmBtn.addEventListener('click', () => {
        const presetName = bubbleAddThemePresetSelect && bubbleAddThemePresetSelect.value;
        if (!presetName) return showToast('请选择预设');
        const char = db.characters.find(c => c.id === currentChatId);
        if (!char) return;
        if (!Array.isArray(char.bubbleCssThemeBindings)) char.bubbleCssThemeBindings = [];
        char.bubbleCssThemeBindings.push({
            presetName,
            description: (bubbleAddThemeDescInput && bubbleAddThemeDescInput.value) ? bubbleAddThemeDescInput.value.trim() : ''
        });
        populateBubbleThemeBindingsList(char.bubbleCssThemeBindings);
        if (bubbleAddThemeModal) bubbleAddThemeModal.style.display = 'none';
    });

    if (groupBubbleApplyBtn) groupBubbleApplyBtn.addEventListener('click', () => {
        const select = document.getElementById('group-bubble-preset-select');
        const selVal = select ? select.value : '';
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
    if (personaApplyBtn) personaApplyBtn.addEventListener('click', function(){ const v = personaSelect ? personaSelect.value : ''; if(!v) return showToast('请选择要应用的预设'); applyMyPersonaPresetToCurrentChat(v); });
    if (personaModalClose) personaModalClose.addEventListener('click', function(){ const m = document.getElementById('mypersona-presets-modal'); if(m) m.style.display='none'; });

    const globalCssModalClose = document.getElementById('global-css-close-modal');
    if (globalCssModalClose) globalCssModalClose.addEventListener('click', () => {
        const m = document.getElementById('global-css-presets-modal');
        if(m) m.style.display = 'none';
    });

    const fontModalClose = document.getElementById('font-close-modal');
    if (fontModalClose) fontModalClose.addEventListener('click', () => {
        const m = document.getElementById('font-presets-modal');
        if (m) m.style.display = 'none';
    });

    const soundModalClose = document.getElementById('sound-close-modal');
    if (soundModalClose) soundModalClose.addEventListener('click', () => {
        const m = document.getElementById('sound-presets-modal');
        if(m) m.style.display = 'none';
    });

    const iconPresetModalClose = document.getElementById('icon-presets-close-modal');
    if (iconPresetModalClose) iconPresetModalClose.addEventListener('click', () => {
        const m = document.getElementById('icon-presets-modal');
        if (m) m.style.display = 'none';
    });

    const voicePresetModalClose = document.getElementById('voice-presets-close-modal');
    if (voicePresetModalClose) voicePresetModalClose.addEventListener('click', () => {
        const m = document.getElementById('voice-presets-modal');
        if(m) m.style.display = 'none';
    });

    const namePresetModalClose = document.getElementById('name-presets-close-modal');
    if (namePresetModalClose) namePresetModalClose.addEventListener('click', () => {
        const m = document.getElementById('name-presets-modal');
        if (m) m.style.display = 'none';
    });

    const widgetWallpaperModalClose = document.getElementById('widget-wallpaper-presets-close-modal');
    if (widgetWallpaperModalClose) widgetWallpaperModalClose.addEventListener('click', () => {
        const m = document.getElementById('widget-wallpaper-presets-modal');
        if (m) m.style.display = 'none';
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
    // 音乐播放器壁纸（在壁纸APP中管理）
    setupMusicWallpaperInWallpaperScreen();
}

function setupMusicWallpaperInWallpaperScreen() {
    const MUSIC_BG_KEY = 'music_player_bg';
    const MUSIC_BG_COVER_KEY = 'music_player_bg_cover_vinyl';
    const preview = document.getElementById('music-wallpaper-preview');
    const previewText = document.getElementById('music-wallpaper-preview-text');
    const localBtn = document.getElementById('music-wallpaper-local-btn');
    const urlBtn = document.getElementById('music-wallpaper-url-btn');
    const resetBtn = document.getElementById('music-wallpaper-reset-btn');
    const urlRow = document.getElementById('music-wallpaper-url-row');
    const urlInput = document.getElementById('music-wallpaper-url-input');
    const urlApply = document.getElementById('music-wallpaper-url-apply');
    const fileInput = document.getElementById('music-wallpaper-file-input');
    const coverVinylCheck = document.getElementById('music-wallpaper-cover-vinyl');

    function loadMBg() { try { return localStorage.getItem(MUSIC_BG_KEY) || ''; } catch (_) { return ''; } }
    function saveMBg(v) { try { localStorage.setItem(MUSIC_BG_KEY, v || ''); } catch (_) {} }
    function loadCover() { try { return localStorage.getItem(MUSIC_BG_COVER_KEY) === 'true'; } catch (_) { return false; } }
    function saveCover(v) { try { localStorage.setItem(MUSIC_BG_COVER_KEY, v ? 'true' : 'false'); } catch (_) {} }

    function refreshPreview() {
        var url = loadMBg();
        if (preview) {
            if (url) {
                preview.style.backgroundImage = 'url(' + url + ')';
                if (previewText) previewText.style.display = 'none';
            } else {
                preview.style.backgroundImage = '';
                if (previewText) previewText.style.display = '';
            }
        }
        if (coverVinylCheck) coverVinylCheck.checked = loadCover();
        // 同步到音乐播放器
        if (typeof window.applyMusicBgFromWallpaper === 'function') window.applyMusicBgFromWallpaper();
    }

    refreshPreview();

    if (localBtn && fileInput) {
        localBtn.addEventListener('click', function () { fileInput.click(); });
        fileInput.addEventListener('change', async function () {
            var file = this.files && this.files[0];
            if (!file) return;
            try {
                var dataUrl = await compressImage(file, { quality: 0.85, maxWidth: 1080, maxHeight: 1920 });
                saveMBg(dataUrl);
                refreshPreview();
                showToast('音乐壁纸已更新');
            } catch (_) {
                showToast('图片压缩失败');
            }
            this.value = '';
        });
    }

    if (urlBtn) {
        urlBtn.addEventListener('click', function () {
            if (urlRow) urlRow.style.display = urlRow.style.display === 'none' ? 'flex' : 'none';
            if (urlRow && urlRow.style.display === 'flex' && urlInput) urlInput.focus();
        });
    }

    if (urlApply && urlInput) {
        urlApply.addEventListener('click', function () {
            var url = urlInput.value.trim();
            if (!url) return;
            if (!url.startsWith('http')) { showToast('请输入有效的 http/https 链接'); return; }
            saveMBg(url);
            refreshPreview();
            if (urlRow) urlRow.style.display = 'none';
            showToast('音乐壁纸已更新');
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', function () {
            saveMBg('');
            saveCover(false);
            refreshPreview();
            showToast('已恢复默认音乐背景');
        });
    }

    if (coverVinylCheck) {
        coverVinylCheck.addEventListener('change', function () {
            saveCover(this.checked);
            refreshPreview();
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
    const messageSentUrl = (document.getElementById('global-message-sent-sound-url')?.value || '').trim();
    const incomingCallUrl = (document.getElementById('global-incoming-call-sound-url')?.value || '').trim();
    
    if (!sendUrl && !receiveUrl && !messageSentUrl && !incomingCallUrl) return showToast('提示音配置为空，无法保存');
    
    let name = prompt('请输入预设名称（将覆盖同名预设）：');
    if (!name) return;
    
    const presets = _getSoundPresets();
    const idx = presets.findIndex(p => p.name === name);
    const preset = { name, sendSound: sendUrl, receiveSound: receiveUrl, messageSentSound: messageSentUrl, incomingCallSound: incomingCallUrl };
    
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

// ========== 音色预设库 ==========
function _getVoicePresets() {
    return db.voicePresets || [];
}
function _saveVoicePresets(arr) {
    db.voicePresets = arr || [];
    saveData();
}

function populateVoicePresetSelect() {
    const sel = document.getElementById('voice-preset-select');
    if (!sel) return;
    const presets = _getVoicePresets();
    sel.innerHTML = '<option value="">— 选择 —</option>';
    presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        sel.appendChild(opt);
    });
}

function saveCurrentVoiceAsPreset() {
    if (typeof currentChatId === 'undefined' || !currentChatId) return showToast('请先打开一个角色');
    const chat = db.characters && db.characters.find(c => c.id === currentChatId);
    if (!chat || !chat.ttsConfig) return showToast('当前角色无语音配置');

    const tc = chat.ttsConfig;
    const preset = {
        voiceId: tc.voiceId || '',
        customVoiceId: tc.customVoiceId || '',
        language: tc.language || 'auto',
        speed: tc.speed != null ? tc.speed : 1,
        userVoiceId: tc.userVoiceId || '',
        userCustomVoiceId: tc.userCustomVoiceId || '',
        userLanguage: tc.userLanguage || 'auto',
        userSpeed: tc.userSpeed != null ? tc.userSpeed : 1
    };

    const name = prompt('请输入音色预设名称（将覆盖同名预设）：');
    if (!name) return;

    const presets = _getVoicePresets();
    const idx = presets.findIndex(p => p.name === name);
    const entry = { name, ...preset };
    if (idx >= 0) presets[idx] = entry;
    else presets.push(entry);

    _saveVoicePresets(presets);
    populateVoicePresetSelect();
    showToast('音色预设已保存');
}

function applyVoicePreset(name) {
    if (typeof currentChatId === 'undefined' || !currentChatId) return showToast('请先打开一个角色');
    const chat = db.characters && db.characters.find(c => c.id === currentChatId);
    if (!chat) return showToast('未找到角色');

    const presets = _getVoicePresets();
    const p = presets.find(x => x.name === name);
    if (!p) return showToast('未找到该预设');

    if (!chat.ttsConfig) chat.ttsConfig = {};
    chat.ttsConfig.voiceId = p.voiceId || '';
    chat.ttsConfig.customVoiceId = p.customVoiceId || '';
    chat.ttsConfig.language = p.language || 'auto';
    chat.ttsConfig.speed = p.speed != null ? p.speed : 1;
    chat.ttsConfig.userVoiceId = p.userVoiceId || '';
    chat.ttsConfig.userCustomVoiceId = p.userCustomVoiceId || '';
    chat.ttsConfig.userLanguage = p.userLanguage || 'auto';
    chat.ttsConfig.userSpeed = p.userSpeed != null ? p.userSpeed : 1;

    saveData();

    // 刷新表单 UI
    if (typeof TTSSettings !== 'undefined') TTSSettings.loadChatTTSConfig(currentChatId);

    showToast('已应用音色预设：' + name);
}

function openVoicePresetManageModal() {
    const modal = document.getElementById('voice-presets-modal');
    const list = document.getElementById('voice-presets-list');
    if (!modal || !list) return;

    list.innerHTML = '';
    const presets = _getVoicePresets();
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
        // 显示预设名 + 简要信息
        const voiceLabel = p.customVoiceId || p.voiceId || '未设置';
        nameDiv.innerHTML = '<div>' + p.name + '</div><div style="font-size:11px;color:#999;">' + voiceLabel + '</div>';
        row.appendChild(nameDiv);

        const btnWrap = document.createElement('div');
        btnWrap.style.display = 'flex';
        btnWrap.style.gap = '6px';

        const applyBtn = document.createElement('button');
        applyBtn.className = 'btn btn-primary';
        applyBtn.style.padding = '6px 8px;border-radius:8px';
        applyBtn.textContent = '应用';
        applyBtn.onclick = function () { applyVoicePreset(p.name); modal.style.display = 'none'; };

        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn';
        renameBtn.style.padding = '6px 8px;border-radius:8px';
        renameBtn.textContent = '重命名';
        renameBtn.onclick = function () {
            const newName = prompt('输入新名称：', p.name);
            if (!newName) return;
            const all = _getVoicePresets();
            all[idx].name = newName;
            _saveVoicePresets(all);
            openVoicePresetManageModal();
            populateVoicePresetSelect();
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn';
        deleteBtn.style.padding = '6px 8px;border-radius:8px;color:#e53935';
        deleteBtn.textContent = '删除';
        deleteBtn.onclick = function () {
            if (!confirm('确认删除该预设？')) return;
            const all = _getVoicePresets();
            all.splice(idx, 1);
            _saveVoicePresets(all);
            openVoicePresetManageModal();
            populateVoicePresetSelect();
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

// ---------- 主屏幕预设方案 ----------
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
    // 收集当前角色的偷看图标
    let peekCustomIcons = {};
    if (typeof currentChatId !== 'undefined' && db.characters) {
        const char = db.characters.find(c => c.id === currentChatId);
        if (char && char.peekScreenSettings && char.peekScreenSettings.customIcons) {
            peekCustomIcons = JSON.parse(JSON.stringify(char.peekScreenSettings.customIcons));
        }
    }
    return {
        wallpaper: db.wallpaper || DEFAULT_WALLPAPER_URL,
        homeWidgetSettings: JSON.parse(JSON.stringify(db.homeWidgetSettings || {})),
        homeSignature: db.homeSignature !== undefined ? db.homeSignature : DEFAULT_HOME_SIGNATURE,
        insWidgetSettings: JSON.parse(JSON.stringify(db.insWidgetSettings || DEFAULT_INS_WIDGET)),
        customIcons: JSON.parse(JSON.stringify(db.customIcons || {})),
        customAppNames: JSON.parse(JSON.stringify(db.customAppNames || {})),
        peekCustomIcons: peekCustomIcons
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
    if (p.customIcons && typeof p.customIcons === 'object') {
        db.customIcons = JSON.parse(JSON.stringify(p.customIcons));
    }
    if (p.customAppNames && typeof p.customAppNames === 'object') {
        db.customAppNames = JSON.parse(JSON.stringify(p.customAppNames));
    }
    // 应用偷看图标
    if (p.peekCustomIcons && typeof p.peekCustomIcons === 'object' && Object.keys(p.peekCustomIcons).length > 0) {
        if (typeof currentChatId !== 'undefined' && db.characters) {
            const char = db.characters.find(c => c.id === currentChatId);
            if (char) {
                if (!char.peekScreenSettings) {
                    char.peekScreenSettings = { wallpaper: '', customIcons: {}, unlockAvatar: '', unlockCommentsEnabled: false, charAwarePeek: false, refreshCounts: {} };
                }
                char.peekScreenSettings.customIcons = JSON.parse(JSON.stringify(p.peekCustomIcons));
            }
        }
    }
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
    renderCustomizeForm();
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
        const schemeName = prompt('请输入导出方案名称（留空则使用预设名称）：', p.name);
        if (schemeName === null) return; // 用户取消
        const exportPreset = JSON.parse(JSON.stringify(p));
        if (schemeName.trim()) exportPreset.name = schemeName.trim();
        payload = { type: 'widget-wallpaper-scheme', version: 1, preset: exportPreset };
    } else {
        const current = _captureCurrentWidgetWallpaperScheme();
        const schemeName = prompt('请输入导出方案名称（留空则使用默认名称）：', '当前主屏');
        if (schemeName === null) return; // 用户取消
        const finalName = schemeName.trim() || '当前主屏';
        payload = { type: 'widget-wallpaper-scheme', version: 1, preset: { name: finalName, ...current } };
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (payload.preset.name || '主屏幕预设方案') + '.json';
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
                showToast('不是有效的主屏幕预设方案文件');
                return;
            }
            const preset = data.preset;
            const name = preset.name || '导入的方案';
            const presets = _getWidgetWallpaperPresets();
            const existingIdx = presets.findIndex(p => p.name === name);
            const toAdd = { name, wallpaper: preset.wallpaper, homeWidgetSettings: preset.homeWidgetSettings || {}, homeSignature: preset.homeSignature, insWidgetSettings: preset.insWidgetSettings || {}, customIcons: preset.customIcons || {}, customAppNames: preset.customAppNames || {}, peekCustomIcons: preset.peekCustomIcons || {} };
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
    if (!confirm('确定要恢复默认吗？将清除当前所有主屏幕预设设置（小组件、壁纸、应用图标）。')) return;
    db.wallpaper = DEFAULT_WALLPAPER_URL;
    if (typeof applyWallpaper === 'function') applyWallpaper(DEFAULT_WALLPAPER_URL);
    db.homeWidgetSettings = JSON.parse(JSON.stringify(defaultWidgetSettings));
    db.homeSignature = DEFAULT_HOME_SIGNATURE;
    db.insWidgetSettings = JSON.parse(JSON.stringify(DEFAULT_INS_WIDGET));
    db.customIcons = {};
    db.customAppNames = {};
    // 同时清除当前角色的偷看图标
    if (typeof currentChatId !== 'undefined' && db.characters) {
        const char = db.characters.find(c => c.id === currentChatId);
        if (char && char.peekScreenSettings) {
            char.peekScreenSettings.customIcons = {};
        }
    }
    saveData();
    if (typeof setupHomeScreen === 'function') setupHomeScreen();
    const preview = document.getElementById('wallpaper-preview');
    if (preview) {
        preview.style.backgroundImage = `url(${DEFAULT_WALLPAPER_URL})`;
        preview.textContent = '';
    }
    renderCustomizeForm();
    showToast('已恢复默认（主屏幕预设）');
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

function _getNamePresets() {
    return db.namePresets || [];
}
function _saveNamePresets(arr) {
    db.namePresets = arr || [];
    saveData();
}

function populateNamePresetSelect() {
    const sel = document.getElementById('name-preset-select');
    if (!sel) return;
    const presets = _getNamePresets();
    sel.innerHTML = '<option value="">— 选择预设 —</option>';
    presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        sel.appendChild(opt);
    });
}

function saveCurrentNamesAsPreset() {
    const customAppNames = db.customAppNames ? JSON.parse(JSON.stringify(db.customAppNames)) : {};
    if (!Object.keys(customAppNames).length) return showToast('当前没有自定义名称，无法保存');
    const name = prompt('请输入预设名称（将覆盖同名预设）：');
    if (!name) return;
    const presets = _getNamePresets();
    const idx = presets.findIndex(p => p.name === name);
    const preset = { name, customAppNames };
    if (idx >= 0) presets[idx] = preset;
    else presets.push(preset);
    _saveNamePresets(presets);
    populateNamePresetSelect();
    showToast('名称预设已保存');
}

function applyNamePreset(name) {
    const presets = _getNamePresets();
    const p = presets.find(x => x.name === name);
    if (!p) return showToast('未找到该预设');
    db.customAppNames = p.customAppNames ? JSON.parse(JSON.stringify(p.customAppNames)) : {};
    saveData();
    if (typeof setupHomeScreen === 'function') setupHomeScreen();
    renderCustomizeForm();
    showToast('已应用名称预设');
}

function openNamePresetManageModal() {
    const modal = document.getElementById('name-presets-modal');
    const list = document.getElementById('name-presets-list');
    if (!modal || !list) return;
    list.innerHTML = '';
    const presets = _getNamePresets();
    if (!presets.length) list.innerHTML = '<p style="color:#888;margin:6px 0;">暂无预设</p>';
    presets.forEach((p, idx) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f0f0f0;';
        const nameDiv = document.createElement('div');
        nameDiv.style.cssText = 'flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        nameDiv.textContent = p.name;
        row.appendChild(nameDiv);
        const btnWrap = document.createElement('div');
        btnWrap.style.cssText = 'display:flex;gap:6px;';
        const applyBtn = document.createElement('button');
        applyBtn.className = 'btn btn-primary';
        applyBtn.style.cssText = 'padding:6px 8px;border-radius:8px';
        applyBtn.textContent = '应用';
        applyBtn.onclick = function(){ applyNamePreset(p.name); modal.style.display = 'none'; };
        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn';
        renameBtn.style.cssText = 'padding:6px 8px;border-radius:8px';
        renameBtn.textContent = '重命名';
        renameBtn.onclick = function(){
            const newName = prompt('输入新名称：', p.name);
            if (!newName) return;
            const all = _getNamePresets();
            all[idx].name = newName;
            _saveNamePresets(all);
            openNamePresetManageModal();
            populateNamePresetSelect();
        };
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn';
        deleteBtn.style.cssText = 'padding:6px 8px;border-radius:8px;color:#e53935';
        deleteBtn.textContent = '删除';
        deleteBtn.onclick = function(){
            if (!confirm('确认删除该预设？')) return;
            const all = _getNamePresets();
            all.splice(idx, 1);
            _saveNamePresets(all);
            openNamePresetManageModal();
            populateNamePresetSelect();
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

        if (target.matches('.reset-name-btn')) {
            const nameId = target.dataset.nameResetId;
            if (db.customAppNames) {
                delete db.customAppNames[nameId];
            }
            await saveData();
            renderCustomizeForm();
            setupHomeScreen();
            showToast('名称已重置');
        }

        if (target.matches('#reset-all-names-btn')) {
            if (confirm('确定要将所有应用名称恢复为默认吗？')) {
                db.customAppNames = {};
                await saveData();
                renderCustomizeForm();
                setupHomeScreen();
                showToast('所有名称已恢复默认');
            }
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
            db.localFontName = '';
            await saveData();
            applyGlobalFont(fontUrl);
            const nameEl = document.getElementById('local-font-name');
            if (nameEl) nameEl.style.display = 'none';
            showToast('新字体已应用！');
        }
        
        if (target.matches('#restore-font-btn')) {
            document.getElementById('customize-font-url').value = '';
            db.fontUrl = '';
            db.localFontName = '';
            await saveData();
            applyGlobalFont('');
            const nameEl = document.getElementById('local-font-name');
            if (nameEl) nameEl.style.display = 'none';
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

        if (target.matches('#voice-apply-preset-btn')) {
            const select = document.getElementById('voice-preset-select');
            const presetName = select && select.value;
            if (!presetName) return showToast('请选择一个预设');
            applyVoicePreset(presetName);
        }
        if (target.matches('#voice-save-preset-btn')) {
            saveCurrentVoiceAsPreset();
        }
        if (target.matches('#voice-manage-presets-btn')) {
            openVoicePresetManageModal();
        }

        if (target.matches('#name-apply-preset-btn')) {
            const select = document.getElementById('name-preset-select');
            const presetName = select && select.value;
            if (!presetName) return showToast('请选择一个预设');
            applyNamePreset(presetName);
        }
        if (target.matches('#name-save-preset-btn')) {
            saveCurrentNamesAsPreset();
        }
        if (target.matches('#name-manage-presets-btn')) {
            openNamePresetManageModal();
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
        if (target.matches('#test-message-sent-sound-btn')) {
            const formGroup = target.closest('.form-group');
            const urlInput = formGroup && formGroup.querySelector('input[type="url"]');
            const url = (urlInput && urlInput.value && urlInput.value.trim()) || '';
            if (url) {
                db.globalMessageSentSound = url;
                saveData();
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
        if (target.matches('#reset-message-sent-sound-btn')) {
            const formGroup = target.closest('.form-group');
            const urlInput = formGroup && formGroup.querySelector('input[type="url"]');
            if (urlInput) urlInput.value = '';
            db.globalMessageSentSound = '';
            saveData();
            showToast('已重置');
        }
        if (target.matches('#test-incoming-call-sound-btn')) {
            const url = document.getElementById('global-incoming-call-sound-url').value;
            if (url) {
                try {
                    // 停止之前的测试音频
                    if (window._testRingAudio) {
                        window._testRingAudio.pause();
                        window._testRingAudio.src = '';
                        window._testRingAudio = null;
                    }
                    const audio = new Audio();
                    audio.preload = 'auto';
                    audio.loop = true;
                    audio.addEventListener('canplaythrough', () => {
                        audio.play().catch(e => showToast('播放失败: ' + e.message));
                    }, { once: true });
                    audio.addEventListener('ended', () => {
                        if (window._testRingAudio === audio) {
                            try { audio.currentTime = 0; audio.play().catch(() => {}); } catch(e) {}
                        }
                    });
                    audio.src = url;
                    audio.load();
                    window._testRingAudio = audio;
                    setTimeout(() => {
                        if (window._testRingAudio === audio) {
                            audio.pause();
                            audio.src = '';
                            window._testRingAudio = null;
                        }
                    }, 5000);
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
        else if (target.dataset.nameId) {
            const nameId = target.dataset.nameId;
            const newName = target.value.trim();
            if (!db.customAppNames) db.customAppNames = {};
            if (newName) {
                db.customAppNames[nameId] = newName;
            } else {
                delete db.customAppNames[nameId];
            }
            await saveData();
            setupHomeScreen();
        }
        else if (target.id === 'global-send-sound-url') {
            db.globalSendSound = target.value.trim();
            await saveData();
        }
        else if (target.id === 'global-receive-sound-url') {
            db.globalReceiveSound = target.value.trim();
            await saveData();
        }
        else if (target.id === 'global-message-sent-sound-url') {
            db.globalMessageSentSound = target.value.trim();
            await saveData();
        }
        else if (target.id === 'global-incoming-call-sound-url') {
            db.globalIncomingCallSound = target.value.trim();
            await saveData();
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
        if (e.target.id === 'global-send-sound-upload' || e.target.id === 'global-receive-sound-upload' || e.target.id === 'global-message-sent-sound-upload' || e.target.id === 'global-incoming-call-sound-upload') {
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
                } else if (e.target.id === 'global-message-sent-sound-upload') {
                    db.globalMessageSentSound = base64;
                    document.getElementById('global-message-sent-sound-url').value = base64;
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

        // 本地字体上传
        if (e.target.id === 'local-font-upload') {
            const file = e.target.files[0];
            if (!file) return;
            const maxSize = 5 * 1024 * 1024; // 5MB
            if (file.size > maxSize) {
                showToast('字体文件过大（超过 5MB），请选择较小的文件或使用 URL 链接');
                e.target.value = null;
                return;
            }
            if (file.size > 2 * 1024 * 1024) {
                if (!confirm('该字体文件较大（' + (file.size / 1024 / 1024).toFixed(1) + 'MB），可能导致应用卡顿或闪退。是否继续？')) {
                    e.target.value = null;
                    return;
                }
            }
            const reader = new FileReader();
            reader.onload = async (evt) => {
                const base64 = evt.target.result;
                db.fontUrl = base64;
                db.localFontName = file.name;
                const fontUrlInput = document.getElementById('customize-font-url');
                if (fontUrlInput) fontUrlInput.value = '';
                const nameEl = document.getElementById('local-font-name');
                if (nameEl) {
                    nameEl.textContent = '已加载本地字体：' + file.name;
                    nameEl.style.display = 'block';
                }
                await saveData();
                applyGlobalFont(base64);
                showToast('本地字体已应用！');
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
        'day-mode-btn', 'night-mode-btn', 'forum-screen', 'music-screen', 'diary-screen', 'piggy-bank-screen', 'pomodoro-screen', 'storage-analysis-screen', 'appearance-settings-screen', 'theater-screen', 'biekan-app', 'xiaowu-app'
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

    let namesContentHTML = '';
    iconOrder.forEach(id => {
        const { name } = defaultIcons[id];
        const currentName = (db.customAppNames && db.customAppNames[id]) || '';
        namesContentHTML += `
        <div class="kkt-item">
            <div class="kkt-item-label">
                <span style="font-size:14px;">${name}</span>
            </div>
            <div class="kkt-item-control" style="gap: 8px;">
                <input type="text" placeholder="${name}" value="${currentName}" data-name-id="${id}" style="text-align:right; border:none; background:transparent; width: 120px; font-size: 13px; color: #888;">
                <button type="button" class="reset-name-btn btn btn-small" data-name-reset-id="${id}" style="padding: 4px 8px; font-size: 12px; margin: 0; background-color: #f0f0f0; color: #666; border:none;">↺</button>
            </div>
        </div>`;
    });

    const namesSectionHTML = `
    <div class="kkt-group collapsible-section" style="background-color: #fff; border: none; margin-bottom: 15px;">
        <div class="kkt-item collapsible-header" style="background-color: #fff; border-bottom: 1px solid #f5f5f5; cursor: pointer; padding: 15px;">
            <div class="kkt-item-label" style="font-weight:bold; color:#333; font-size: 15px;">应用名称自定义</div>
            <span class="collapsible-arrow">▼</span>
        </div>
        <div class="collapsible-content">
            ${namesContentHTML}
            <div style="background:#f9f9f9; padding:10px; border-radius:8px; margin:15px 15px 15px 15px; border: 1px solid #f0f0f0;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                    <label for="name-preset-select" style="width:auto;color:#666;font-size:13px;">名称预设库</label>
                    <select id="name-preset-select" style="flex:1;padding:6px;border-radius:6px;border:1px solid #ddd;font-size:13px; background: transparent;"><option value="">— 选择 —</option></select>
                </div>
                <div style="display:flex;gap:8px;justify-content: flex-end;">
                    <button type="button" id="name-apply-preset-btn" class="btn btn-small btn-primary" style="padding:4px 8px;">应用</button>
                    <button type="button" id="name-save-preset-btn" class="btn btn-small" style="padding:4px 8px;">保存</button>
                    <button type="button" id="name-manage-presets-btn" class="btn btn-small" style="padding:4px 8px;">管理</button>
                </div>
            </div>
            <div style="padding: 15px; display: flex; justify-content: flex-end;">
                <button type="button" id="reset-all-names-btn" class="btn btn-neutral btn-small" style="width: auto;">全部重置</button>
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
            <div class="kkt-item-label" style="font-weight:bold; color:#333; font-size: 15px;">主屏幕预设方案</div>
            <span class="collapsible-arrow">▼</span>
        </div>
        <div class="collapsible-content">
            <div class="kkt-item" style="display:block; padding: 15px;">
                <p style="font-size: 13px; color: #888; margin-bottom: 12px; line-height: 1.5;">将当前主屏幕的「所有小组件 + 壁纸 + 应用图标 + 偷看图标」保存为方案，可导出分享或导入他人方案；一键恢复默认。与下方「应用图标自定义」中的图标预设库相互独立。</p>
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
                    <button type="button" id="widget-wallpaper-reset-btn" class="btn btn-neutral btn-small" style="width: auto;">恢复默认（主屏幕预设）</button>
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

                        <div class="css-template-card" style="background: #fff; border: 1px solid #eee; border-radius: 10px; padding: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <div>
                                    <h6 style="margin: 0; font-size: 1em; color: #333;">iOS 灵动岛/刘海屏防遮挡适配补丁</h6>
                                    <span style="font-size: 12px; color: #999;">作者：1900</span>
                                </div>
                                <button type="button" class="btn btn-secondary btn-small copy-css-btn">复制</button>
                            </div>
                            <pre style="background: #f5f5f5; padding: 10px; border-radius: 8px; white-space: pre-wrap; word-wrap: break-word; font-size: 12px; max-height: 150px; overflow-y: auto;"><code>/* --- iOS 灵动岛/刘海屏防遮挡适配补丁 --- */

/* 1. 修复所有页面通用顶栏 (如聊天、列表、功能页) */
.app-header {
    padding-top: calc(15px + env(safe-area-inset-top)) !important;
    height: auto !important;
}

/* 2. 修复主屏幕 (锁屏/桌面) 小组件遮挡 */
#home-screen {
    padding-top: calc(45px + env(safe-area-inset-top)) !important;
}

/* 3. 修复右侧滑出的设置菜单顶栏遮挡 */
.settings-sidebar .header {
    padding-top: calc(15px + env(safe-area-inset-top)) !important;
}

/* 4. (可选) 底部小横条防遮挡输入框 */
.message-input-area,
#multi-select-bar,
#world-book-multi-select-bar {
    padding-bottom: calc(10px + env(safe-area-inset-bottom)) !important;
}</code></pre>
                        </div>

                        <div class="css-template-card" style="background: #fff; border: 1px solid #eee; border-radius: 10px; padding: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <div>
                                    <h6 style="margin: 0; font-size: 1em; color: #333;">核心容器尺寸调整：全宽幅矮窗</h6>
                                    <span style="font-size: 12px; color: #999;">作者：萤火</span>
                                </div>
                                <button type="button" class="btn btn-secondary btn-small copy-css-btn">复制</button>
                            </div>
                            <pre style="background: #f5f5f5; padding: 10px; border-radius: 8px; white-space: pre-wrap; word-wrap: break-word; font-size: 12px; max-height: 150px; overflow-y: auto;"><code>/* =========================================================
   核心容器尺寸调整：全宽幅矮窗 (左右贴边·垂直居中)
   ========================================================= */

/* 1. 主容器：全宽 + 垂直百分比缩放 */
#chat-room-screen {
    position: fixed !important;
    top: 50% !important;
    left: 0 !important;
    right: 0 !important;
    transform: translateY(-50%) !important;
    width: 100% !important;
    max-width: 100% !important;
    height: 70vh !important;
    max-height: 100vh !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
    z-index: 59 !important;
    box-shadow: none !important;
    border: none !important;
    border-radius: 0 !important;
}

/* 2. 底部输入栏：跟随容器宽度 */
.bottom-input-area,
.chat-input-wrapper {
    position: absolute !important;
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
    width: 100% !important;
    margin: 0 !important;
    transform: none !important;
    z-index: 100 !important;
}

/* 3. 顶部栏：跟随容器宽度 */
.app-header,
#chat-room-header-default {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    z-index: 100 !important;
    border-radius: 0 !important;
}

/* 4. 内容区域：保留原有背景 */
.content {
    position: relative !important;
    width: auto !important;
    height: auto !important;
    min-height: 100% !important;
    padding-top: 60px !important;
    padding-bottom: 35px !important;
    box-sizing: border-box !important;
    overflow-y: auto !important;
    background: none !important;
    background-color: transparent !important;
}

/* 5. 消息区域 */
.message-area {
    width: 100% !important;
    box-sizing: border-box !important;
    min-height: 100% !important;
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
                    <div style="display: flex; gap: 8px; margin-top: 5px;">
                        <input type="url" id="customize-font-url" placeholder="例如：https://example.com/font.woff2" value="${db.fontUrl && !db.fontUrl.startsWith('data:') ? db.fontUrl : ''}" style="flex:1; border:1px solid #eee; border-radius:8px; padding:10px;">
                        <input type="file" id="local-font-upload" accept=".woff2,.woff,.ttf,.otf,.eot,.svg,.ttc" style="display: none;">
                        <label for="local-font-upload" class="btn btn-secondary btn-small" style="margin: 0; display: flex; align-items: center; cursor: pointer; white-space: nowrap;">📂 本地上传</label>
                    </div>
                    <p id="local-font-name" style="font-size: 12px; color: var(--primary-color); margin-top: 5px; display: ${db.fontUrl && db.fontUrl.startsWith('data:') ? 'block' : 'none'};">${db.localFontName ? '已加载本地字体：' + db.localFontName : ''}</p>
                    <p style="font-size: 12px; color: #999; margin-top: 5px;">支持 woff2, woff, ttf, otf, eot, svg, ttc 格式。设置后将应用到全局。</p>
                    <p style="font-size: 12px; color: #e67e22; margin-top: 3px;">⚠️ 本地上传限制 5MB，过大的字体文件可能导致应用闪退，建议使用较小的字体文件或使用 URL 链接。</p>
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
                    <label style="font-weight: bold; font-size: 14px; color: var(--primary-color);">发消息提示音</label>
                    <div style="display: flex; gap: 8px; margin-top: 5px;">
                        <input type="url" id="global-message-sent-sound-url" placeholder="音频URL" value="${db.globalMessageSentSound || ''}" style="flex: 1; border: 1px solid #eee; border-radius: 8px; padding: 8px;">
                        <input type="file" id="global-message-sent-sound-upload" accept="audio/*" style="display: none;">
                        <label for="global-message-sent-sound-upload" class="btn btn-secondary btn-small" style="margin: 0; display: flex; align-items: center; cursor: pointer;">📂</label>
                        <button type="button" id="test-message-sent-sound-btn" class="btn btn-primary btn-small" style="margin: 0;">▶</button>
                        <button type="button" id="reset-message-sent-sound-btn" class="btn btn-danger btn-small" style="margin: 0;">×</button>
                    </div>
                    <p style="font-size: 12px; color: #999; margin-top: 5px;">在输入框发送一条消息时播放。不设置则发送时不播放。</p>
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
    
    // ---------- 夜间模式设置 ----------
    const nightSettings = db.nightModeSettings || {};
    const DEFAULT_NIGHT_MODE_CSS = `/* 基础颜色变量 */
body.night-mode-active {
    --bg-color: #121212;
    --text-color: #e0e0e0;
    --white-color: #e0e0e0;
    --primary-color: #1e1e1e;
    --secondary-color: #666;
    --accent-color: #1e1e1e;
    --top-pinned-bg: #1a1a1a;
    --panel-bg: #181818;
    --chat-bottom-bar-bg: #181818;
    --folder-pill-bg: #1e1e1e;
    --folder-pill-text: #bbb;
    --folder-pill-active-bg: #333;
    --folder-pill-active-text: #fff;
    --global-title-color: #e0e0e0;
    --nav-icon-color: #777;
    --nav-active-icon-color: #e0e0e0;
    --kkt-icon-color: #e0e0e0;
    --func-icon-color: #e0e0e0;
}

/* 背景色设置 */
body.night-mode-active, 
body.night-mode-active .phone-screen, 
body.night-mode-active .screen, 
body.night-mode-active .content,
body.night-mode-active .chat-item {
    background-color: #121212 !important;
}

/* 头部栏与底部栏 */
body.night-mode-active .app-header,
body.night-mode-active .bottom-nav {
    background-color: #181818 !important;
    border-color: #222 !important;
}

/* 聊天气泡 */
body.night-mode-active .message-bubble {
    background-color: #1e1e1e !important;
    color: #e0e0e0 !important;
}
body.night-mode-active .message-wrapper.sent .message-bubble {
    background-color: #2a2a2a !important;
}

/* 输入区域 */
body.night-mode-active .message-input-area {
    background-color: #181818 !important;
    border-top-color: #222 !important;
}
body.night-mode-active .message-input-area textarea {
    background-color: #1e1e1e !important;
    color: #e0e0e0 !important;
}`;

    const nightModeSectionHTML = `
    <div class="kkt-group collapsible-section" style="background-color: #fff; border: none; margin-bottom: 15px;">
        <div class="kkt-item collapsible-header" style="background-color: #fff; border-bottom: 1px solid #f5f5f5; cursor: pointer; padding: 15px;">
            <div class="kkt-item-label" style="font-weight:bold; color:#333; font-size: 15px;">夜间模式</div>
            <span class="collapsible-arrow">▼</span>
        </div>
        <div class="collapsible-content">
            <div class="kkt-item" style="display:block; padding: 15px;">
                <p style="font-size: 13px; color: #888; margin-bottom: 12px; line-height: 1.5;">开启后整个应用切换为暗色主题，也可设置定时自动切换。支持自定义夜间模式的 CSS 样式覆盖。</p>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <label style="font-size:14px; color:#333;">启用夜间模式</label>
                    <label class="kkt-switch"><input type="checkbox" id="night-mode-enabled" ${nightSettings.enabled ? 'checked' : ''}><span class="kkt-slider"></span></label>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <label style="font-size:14px; color:#333;">定时自动切换</label>
                    <label class="kkt-switch"><input type="checkbox" id="night-mode-auto" ${nightSettings.auto ? 'checked' : ''}><span class="kkt-slider"></span></label>
                </div>
                <div id="night-mode-schedule" style="display:${nightSettings.auto ? 'flex' : 'none'}; gap:10px; align-items:center; margin-bottom:12px; flex-wrap:wrap;">
                    <label style="font-size:13px; color:#666;">开始</label>
                    <input type="time" id="night-mode-start" value="${nightSettings.startTime || '22:00'}" style="border:1px solid #ddd; border-radius:6px; padding:4px 8px; font-size:13px;">
                    <label style="font-size:13px; color:#666;">结束</label>
                    <input type="time" id="night-mode-end" value="${nightSettings.endTime || '07:00'}" style="border:1px solid #ddd; border-radius:6px; padding:4px 8px; font-size:13px;">
                </div>

                <div style="margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <label style="font-size:14px; color:#333;">自定义夜间 CSS</label>
                        <div style="display:flex; gap:6px;">
                            <button type="button" id="night-css-apply-btn" class="btn btn-primary btn-small" style="padding:4px 8px;">应用</button>
                            <button type="button" id="night-css-reset-btn" class="btn btn-small" style="padding:4px 8px;">重置</button>
                        </div>
                    </div>
                    <textarea id="night-mode-custom-css" rows="12" placeholder="在此输入自定义夜间模式CSS代码..." style="width:100%; border:1px solid #eee; border-radius:8px; padding:10px; font-size:12px; font-family:monospace;">${nightSettings.customCss || DEFAULT_NIGHT_MODE_CSS}</textarea>
                </div>

                <div style="display:flex; gap:8px; justify-content:flex-end;">
                    <button type="button" id="night-mode-export-btn" class="btn btn-small btn-neutral" style="padding:4px 8px;">导出配置</button>
                    <button type="button" id="night-mode-import-btn" class="btn btn-small btn-neutral" style="padding:4px 8px;">导入配置</button>
                    <input type="file" id="night-mode-import-file" accept=".json" style="display:none;">
                </div>
            </div>
        </div>
    </div>
    `;

    // ---------- 顶栏状态栏设置 ----------
    const statusBarSettings = db.homeStatusBarSettings || {};
    const statusBarSectionHTML = `
    <div class="kkt-group collapsible-section" style="background-color: #fff; border: none; margin-bottom: 15px;">
        <div class="kkt-item collapsible-header" style="background-color: #fff; border-bottom: 1px solid #f5f5f5; cursor: pointer; padding: 15px;">
            <div class="kkt-item-label" style="font-weight:bold; color:#333; font-size: 15px;">顶栏电量 + 时间</div>
            <span class="collapsible-arrow">▼</span>
        </div>
        <div class="collapsible-content">
            <div class="kkt-item" style="display:block; padding: 15px;">
                <p style="font-size: 13px; color: #888; margin-bottom: 12px; line-height: 1.5;">在所有页面顶部透明显示实时时间和电量，融入界面不遮挡。可自定义顶栏容器、时间、电量的 CSS 样式。</p>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <label style="font-size:14px; color:#333;">显示顶栏状态栏</label>
                    <label class="kkt-switch"><input type="checkbox" id="home-statusbar-enabled" ${statusBarSettings.enabled ? 'checked' : ''}><span class="kkt-slider"></span></label>
                </div>

                <div style="background:#f5f5f5; border-radius:10px; padding:10px 16px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; font-size:13px; color:#333;">
                    <span id="statusbar-preview-time" style="font-weight:600;">--:--</span>
                    <span style="display:flex; align-items:center; gap:4px;">
                        <svg width="18" height="11" viewBox="0 0 24 12" fill="none"><path d="M1 2.5C1 1.95 1.45 1.5 2 1.5H20C20.55 1.5 21 1.95 21 2.5V9.5C21 10.05 20.55 10.5 20 10.5H2C1.45 10.5 1 10.05 1 9.5V2.5Z" stroke="#666" stroke-width="1"/><path d="M22.5 4V8" stroke="#666" stroke-width="1.5" stroke-linecap="round"/><rect id="statusbar-preview-battery-fill" x="2" y="2.5" width="18" height="7" rx="0.5" fill="#666"/></svg>
                        <span id="statusbar-preview-level">--%</span>
                    </span>
                </div>

                <div style="margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <label style="font-size:14px; color:#333;">顶栏容器 CSS</label>
                    </div>
                    <textarea id="statusbar-container-css" rows="4" placeholder="例如：\nbackground: rgba(0,0,0,0.3);\ncolor: #fff;\nborder-radius: 0;" style="width:100%; border:1px solid #eee; border-radius:8px; padding:10px; font-size:12px; font-family:monospace;">${statusBarSettings.containerCss || ''}</textarea>
                </div>

                <div style="margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <label style="font-size:14px; color:#333;">时间样式 CSS</label>
                    </div>
                    <textarea id="statusbar-time-css" rows="3" placeholder="例如：\nfont-size: 14px;\nfont-weight: bold;\ncolor: #fff;" style="width:100%; border:1px solid #eee; border-radius:8px; padding:10px; font-size:12px; font-family:monospace;">${statusBarSettings.timeCss || ''}</textarea>
                </div>

                <div style="margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <label style="font-size:14px; color:#333;">电量样式 CSS</label>
                    </div>
                    <textarea id="statusbar-battery-css" rows="3" placeholder="例如：\nfont-size: 12px;\ncolor: #4CAF50;" style="width:100%; border:1px solid #eee; border-radius:8px; padding:10px; font-size:12px; font-family:monospace;">${statusBarSettings.batteryCss || ''}</textarea>
                </div>

                <div style="display:flex; gap:8px; justify-content:flex-end; margin-bottom:8px;">
                    <button type="button" id="statusbar-apply-btn" class="btn btn-primary btn-small" style="padding:4px 8px;">应用</button>
                    <button type="button" id="statusbar-reset-btn" class="btn btn-small" style="padding:4px 8px;">重置</button>
                </div>
                <div style="display:flex; gap:8px; justify-content:flex-end;">
                    <button type="button" id="statusbar-export-btn" class="btn btn-small btn-neutral" style="padding:4px 8px;">导出配置</button>
                    <button type="button" id="statusbar-import-btn" class="btn btn-small btn-neutral" style="padding:4px 8px;">导入配置</button>
                    <input type="file" id="statusbar-import-file" accept=".json" style="display:none;">
                </div>
            </div>
        </div>
    </div>
    `;

    container.innerHTML = iconsSectionHTML + namesSectionHTML + widgetSectionHTML + widgetWallpaperSectionHTML + fontsSectionHTML + soundSectionHTML + globalCssSectionHTML + nightModeSectionHTML + statusBarSectionHTML;
    customizeForm.appendChild(container);

    populateGlobalCssPresetSelect();
    populateFontPresetSelect();
    populateSoundPresetSelect();
    populateWidgetPresetSelect();
    populateWidgetWallpaperPresetSelect();
    populateIconPresetSelect();
    populateNamePresetSelect();
    populateVoicePresetSelect();

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

    // ---------- 夜间模式事件绑定 ----------
    setupNightModeBindings();
    // ---------- 顶栏状态栏事件绑定 ----------
    setupStatusBarBindings();
}

// ============================================
// 夜间模式
// ============================================

function setupNightModeBindings() {
    const enabledCb = document.getElementById('night-mode-enabled');
    const autoCb = document.getElementById('night-mode-auto');
    const scheduleDiv = document.getElementById('night-mode-schedule');
    const startInput = document.getElementById('night-mode-start');
    const endInput = document.getElementById('night-mode-end');
    const cssArea = document.getElementById('night-mode-custom-css');

    if (enabledCb) enabledCb.addEventListener('change', async () => {
        if (!db.nightModeSettings) db.nightModeSettings = {};
        db.nightModeSettings.enabled = enabledCb.checked;
        await saveData();
        applyNightMode();
        showToast(enabledCb.checked ? '夜间模式已开启' : '夜间模式已关闭');
    });

    if (autoCb) autoCb.addEventListener('change', async () => {
        if (!db.nightModeSettings) db.nightModeSettings = {};
        db.nightModeSettings.auto = autoCb.checked;
        if (scheduleDiv) scheduleDiv.style.display = autoCb.checked ? 'flex' : 'none';
        await saveData();
        applyNightMode();
    });

    if (startInput) startInput.addEventListener('change', async () => {
        if (!db.nightModeSettings) db.nightModeSettings = {};
        db.nightModeSettings.startTime = startInput.value;
        await saveData();
        applyNightMode();
    });

    if (endInput) endInput.addEventListener('change', async () => {
        if (!db.nightModeSettings) db.nightModeSettings = {};
        db.nightModeSettings.endTime = endInput.value;
        await saveData();
        applyNightMode();
    });

    document.getElementById('night-css-apply-btn')?.addEventListener('click', async () => {
        if (!db.nightModeSettings) db.nightModeSettings = {};
        db.nightModeSettings.customCss = cssArea?.value || '';
        await saveData();
        applyNightMode();
        showToast('夜间模式 CSS 已应用');
    });

    document.getElementById('night-css-reset-btn')?.addEventListener('click', async () => {
        if (!db.nightModeSettings) db.nightModeSettings = {};
        db.nightModeSettings.customCss = '';
        if (cssArea) cssArea.value = DEFAULT_NIGHT_MODE_CSS;
        await saveData();
        applyNightMode();
        showToast('夜间模式 CSS 已重置为默认代码');
    });

    // 导出
    document.getElementById('night-mode-export-btn')?.addEventListener('click', () => {
        const payload = { type: 'night-mode-config', settings: db.nightModeSettings || {} };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = '夜间模式配置.json';
        a.click();
        URL.revokeObjectURL(a.href);
        showToast('夜间模式配置已导出');
    });

    // 导入
    document.getElementById('night-mode-import-btn')?.addEventListener('click', () => {
        document.getElementById('night-mode-import-file')?.click();
    });
    document.getElementById('night-mode-import-file')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const data = JSON.parse(reader.result);
                if (!data || data.type !== 'night-mode-config' || !data.settings) {
                    showToast('不是有效的夜间模式配置文件');
                    return;
                }
                db.nightModeSettings = data.settings;
                await saveData();
                applyNightMode();
                renderCustomizeForm();
                showToast('夜间模式配置已导入');
            } catch (_) {
                showToast('文件解析失败');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });
}

function applyNightMode() {
    const settings = db.nightModeSettings || {};
    let shouldBeNight = false;

    if (settings.enabled) {
        if (settings.auto) {
            const now = new Date();
            const hhmm = now.getHours() * 60 + now.getMinutes();
            const start = parseTimeToMinutes(settings.startTime || '22:00');
            const end = parseTimeToMinutes(settings.endTime || '07:00');
            if (start > end) {
                shouldBeNight = hhmm >= start || hhmm < end;
            } else {
                shouldBeNight = hhmm >= start && hhmm < end;
            }
        } else {
            shouldBeNight = true;
        }
    }

    if (shouldBeNight) {
        document.body.classList.add('night-mode-active');
    } else {
        document.body.classList.remove('night-mode-active');
    }

    // 自定义CSS
    let styleEl = document.getElementById('night-mode-custom-style');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'night-mode-custom-style';
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = shouldBeNight && settings.customCss ? settings.customCss : '';
}

function parseTimeToMinutes(str) {
    const [h, m] = (str || '00:00').split(':').map(Number);
    return h * 60 + (m || 0);
}

// ============================================
// 顶栏状态栏
// ============================================

function setupStatusBarBindings() {
    const enabledCb = document.getElementById('home-statusbar-enabled');
    const containerCssArea = document.getElementById('statusbar-container-css');
    const timeCssArea = document.getElementById('statusbar-time-css');
    const batteryCssArea = document.getElementById('statusbar-battery-css');

    // 实时预览
    updateStatusBarPreviewInSettings();

    if (enabledCb) enabledCb.addEventListener('change', async () => {
        if (!db.homeStatusBarSettings) db.homeStatusBarSettings = {};
        db.homeStatusBarSettings.enabled = enabledCb.checked;
        await saveData();
        applyHomeStatusBar();
        showToast(enabledCb.checked ? '顶栏状态栏已开启' : '顶栏状态栏已关闭');
    });

    document.getElementById('statusbar-apply-btn')?.addEventListener('click', async () => {
        if (!db.homeStatusBarSettings) db.homeStatusBarSettings = {};
        db.homeStatusBarSettings.containerCss = containerCssArea?.value || '';
        db.homeStatusBarSettings.timeCss = timeCssArea?.value || '';
        db.homeStatusBarSettings.batteryCss = batteryCssArea?.value || '';
        await saveData();
        applyHomeStatusBar();
        showToast('顶栏样式已应用');
    });

    document.getElementById('statusbar-reset-btn')?.addEventListener('click', async () => {
        if (!db.homeStatusBarSettings) db.homeStatusBarSettings = {};
        db.homeStatusBarSettings.containerCss = '';
        db.homeStatusBarSettings.timeCss = '';
        db.homeStatusBarSettings.batteryCss = '';
        if (containerCssArea) containerCssArea.value = '';
        if (timeCssArea) timeCssArea.value = '';
        if (batteryCssArea) batteryCssArea.value = '';
        await saveData();
        applyHomeStatusBar();
        showToast('顶栏样式已重置');
    });

    // 导出
    document.getElementById('statusbar-export-btn')?.addEventListener('click', () => {
        const payload = { type: 'home-statusbar-config', settings: db.homeStatusBarSettings || {} };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = '顶栏状态栏配置.json';
        a.click();
        URL.revokeObjectURL(a.href);
        showToast('顶栏配置已导出');
    });

    // 导入
    document.getElementById('statusbar-import-btn')?.addEventListener('click', () => {
        document.getElementById('statusbar-import-file')?.click();
    });
    document.getElementById('statusbar-import-file')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const data = JSON.parse(reader.result);
                if (!data || data.type !== 'home-statusbar-config' || !data.settings) {
                    showToast('不是有效的顶栏配置文件');
                    return;
                }
                db.homeStatusBarSettings = data.settings;
                await saveData();
                applyHomeStatusBar();
                renderCustomizeForm();
                showToast('顶栏配置已导入');
            } catch (_) {
                showToast('文件解析失败');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });
}

function updateStatusBarPreviewInSettings() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const timeEl = document.getElementById('statusbar-preview-time');
    if (timeEl) timeEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    if ('getBattery' in navigator) {
        navigator.getBattery().then(battery => {
            const level = Math.floor(battery.level * 100);
            const levelEl = document.getElementById('statusbar-preview-level');
            const fillEl = document.getElementById('statusbar-preview-battery-fill');
            if (levelEl) levelEl.textContent = `${level}%`;
            if (fillEl) fillEl.setAttribute('width', 18 * battery.level);
        }).catch(() => {});
    }
}

function applyHomeStatusBar() {
    const phoneScreen = document.querySelector('.phone-screen');
    if (!phoneScreen) return;
    const settings = db.homeStatusBarSettings || {};
    let bar = phoneScreen.querySelector('.home-top-statusbar');

    if (!settings.enabled) {
        if (bar) bar.remove();
        let styleEl = document.getElementById('home-statusbar-custom-style');
        if (styleEl) styleEl.textContent = '';
        return;
    }

    if (!bar) {
        bar = document.createElement('div');
        bar.className = 'home-top-statusbar';
        bar.innerHTML = `
            <span class="htsb-time"></span>
            <span class="htsb-battery">
                <svg width="18" height="11" viewBox="0 0 24 12" fill="none">
                    <path d="M1 2.5C1 1.95 1.45 1.5 2 1.5H20C20.55 1.5 21 1.95 21 2.5V9.5C21 10.05 20.55 10.5 20 10.5H2C1.45 10.5 1 10.05 1 9.5V2.5Z" stroke="currentColor" stroke-width="1"/>
                    <path d="M22.5 4V8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    <rect class="htsb-battery-fill" x="2" y="2.5" width="18" height="7" rx="0.5" fill="currentColor"/>
                </svg>
                <span class="htsb-battery-level">--%</span>
            </span>`;
        phoneScreen.insertBefore(bar, phoneScreen.firstChild);
    }

    // 更新时间
    const pad = n => String(n).padStart(2, '0');
    const updateBar = () => {
        const now = new Date();
        const timeEl = bar.querySelector('.htsb-time');
        if (timeEl) timeEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    };
    updateBar();

    // 更新电量
    if ('getBattery' in navigator) {
        navigator.getBattery().then(battery => {
            const updateBat = () => {
                const level = Math.floor(battery.level * 100);
                const levelEl = bar.querySelector('.htsb-battery-level');
                const fillEl = bar.querySelector('.htsb-battery-fill');
                if (levelEl) levelEl.textContent = `${level}%`;
                if (fillEl) fillEl.setAttribute('width', 18 * battery.level);
            };
            updateBat();
            battery.addEventListener('levelchange', updateBat);
            battery.addEventListener('chargingchange', updateBat);
        }).catch(() => {});
    }

    // 自定义CSS
    let styleEl = document.getElementById('home-statusbar-custom-style');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'home-statusbar-custom-style';
        document.head.appendChild(styleEl);
    }
    let css = '';
    if (settings.containerCss) css += `.home-top-statusbar { ${settings.containerCss} }\n`;
    if (settings.timeCss) css += `.home-top-statusbar .htsb-time { ${settings.timeCss} }\n`;
    if (settings.batteryCss) css += `.home-top-statusbar .htsb-battery, .home-top-statusbar .htsb-battery-level { ${settings.batteryCss} }\n`;
    styleEl.textContent = css;
}

// 定时刷新顶栏时间
setInterval(() => {
    const bar = document.querySelector('.phone-screen > .home-top-statusbar .htsb-time');
    if (bar) {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        bar.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }
}, 30000);

// 定时检查夜间模式自动切换
setInterval(() => {
    if (db.nightModeSettings?.enabled && db.nightModeSettings?.auto) {
        applyNightMode();
    }
}, 60000);


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
