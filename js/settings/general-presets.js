function setupPresetFeatures() {
    setupChatAppearancePresets();
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

    const widgetPresetModalClose = document.getElementById('widget-presets-close-modal');
    if (widgetPresetModalClose) widgetPresetModalClose.addEventListener('click', () => {
        const m = document.getElementById('widget-presets-modal');
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
    // 全局聊天壁纸（在壁纸APP中管理）
    setupGlobalChatWallpaperInWallpaperScreen();
    
    // 全局通话壁纸（在壁纸APP中管理）
    setupGlobalCallWallpaperInWallpaperScreen();
}

function setupGlobalChatWallpaperInWallpaperScreen() {
    const GLOBAL_CHAT_BG_KEY = 'global_chat_bg';
    const preview = document.getElementById('global-chat-wallpaper-preview');
    const previewText = document.getElementById('global-chat-wallpaper-preview-text');
    const localBtn = document.getElementById('global-chat-wallpaper-local-btn');
    const urlBtn = document.getElementById('global-chat-wallpaper-url-btn');
    const resetBtn = document.getElementById('global-chat-wallpaper-reset-btn');
    const urlRow = document.getElementById('global-chat-wallpaper-url-row');
    const urlInput = document.getElementById('global-chat-wallpaper-url-input');
    const urlApply = document.getElementById('global-chat-wallpaper-url-apply');
    const fileInput = document.getElementById('global-chat-wallpaper-file-input');

    function refreshPreview() {
        var url = db.globalChatWallpaper || '';
        if (preview) {
            if (url) {
                preview.style.backgroundImage = 'url(' + url + ')';
                if (previewText) previewText.style.display = 'none';
            } else {
                preview.style.backgroundImage = '';
                if (previewText) previewText.style.display = '';
            }
        }
    }

    refreshPreview();

    if (localBtn && fileInput) {
        localBtn.addEventListener('click', function () { fileInput.click(); });
        fileInput.addEventListener('change', async function () {
            var file = this.files && this.files[0];
            if (!file) return;
            try {
                var dataUrl = await compressImage(file, { quality: 0.85, maxWidth: 1080, maxHeight: 1920 });
                db.globalChatWallpaper = dataUrl;
                await saveData();
                refreshPreview();
                showToast('全局聊天壁纸已更新');
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
        urlApply.addEventListener('click', async function () {
            var url = urlInput.value.trim();
            if (!url) return;
            if (!url.startsWith('http')) { showToast('请输入有效的 http/https 链接'); return; }
            db.globalChatWallpaper = url;
            await saveData();
            refreshPreview();
            if (urlRow) urlRow.style.display = 'none';
            showToast('全局聊天壁纸已更新');
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', async function () {
            db.globalChatWallpaper = '';
            await saveData();
            refreshPreview();
            showToast('已恢复默认全局聊天壁纸');
        });
    }
}

function setupGlobalCallWallpaperInWallpaperScreen() {
    const preview = document.getElementById('global-call-wallpaper-preview');
    const previewText = document.getElementById('global-call-wallpaper-preview-text');
    const localBtn = document.getElementById('global-call-wallpaper-local-btn');
    const urlBtn = document.getElementById('global-call-wallpaper-url-btn');
    const resetBtn = document.getElementById('global-call-wallpaper-reset-btn');
    const urlRow = document.getElementById('global-call-wallpaper-url-row');
    const urlInput = document.getElementById('global-call-wallpaper-url-input');
    const urlApply = document.getElementById('global-call-wallpaper-url-apply');
    const fileInput = document.getElementById('global-call-wallpaper-file-input');

    function refreshPreview() {
        var url = db.globalCallWallpaper || '';
        if (preview) {
            if (url) {
                preview.style.backgroundImage = 'url(' + url + ')';
                if (previewText) previewText.style.display = 'none';
            } else {
                preview.style.backgroundImage = '';
                if (previewText) previewText.style.display = '';
            }
        }
    }

    refreshPreview();

    if (localBtn && fileInput) {
        localBtn.addEventListener('click', function () { fileInput.click(); });
        fileInput.addEventListener('change', async function () {
            var file = this.files && this.files[0];
            if (!file) return;
            try {
                var dataUrl = await compressImage(file, { quality: 0.85, maxWidth: 1080, maxHeight: 1920 });
                db.globalCallWallpaper = dataUrl;
                await saveData();
                refreshPreview();
                showToast('全局通话壁纸已更新');
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
        urlApply.addEventListener('click', async function () {
            var url = urlInput.value.trim();
            if (!url) return;
            if (!url.startsWith('http')) { showToast('请输入有效的 http/https 链接'); return; }
            db.globalCallWallpaper = url;
            await saveData();
            refreshPreview();
            if (urlRow) urlRow.style.display = 'none';
            showToast('全局通话壁纸已更新');
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', async function () {
            db.globalCallWallpaper = '';
            await saveData();
            refreshPreview();
            showToast('已恢复默认全局通话壁纸');
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
    for (const key of ['elevenVoiceId', 'elevenCustomVoiceId', 'elevenVoiceName', 'elevenSpeed',
        'userElevenVoiceId', 'userElevenCustomVoiceId', 'userElevenVoiceName', 'userElevenSpeed',
        'fishVoiceId', 'fishSpeed', 'userFishVoiceId', 'userFishSpeed']) {
        if (tc[key] != null) preset[key] = tc[key];
    }

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
    for (const key of ['elevenVoiceId', 'elevenCustomVoiceId', 'elevenVoiceName', 'elevenSpeed',
        'userElevenVoiceId', 'userElevenCustomVoiceId', 'userElevenVoiceName', 'userElevenSpeed',
        'fishVoiceId', 'fishSpeed', 'userFishVoiceId', 'userFishSpeed']) {
        if (p[key] != null) chat.ttsConfig[key] = p[key];
    }

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
