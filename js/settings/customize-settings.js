const customizeSettingKeys = [
    'customAppNames', 'customIcons', 'fontBuffer', 'fontSizeScale', 'fontUrl',
    'globalCss', 'globalCssPresets', 'globalIncomingCallSound',
    'globalMessageSentSound', 'globalReceiveSound', 'globalSendSound',
    'homeStatusBarSettings', 'homeWidgetSettings', 'localFontName',
    'multiMsgSoundEnabled', 'nightModeSettings'
];

function saveCustomizeSettings() {
    return saveGlobalSettings(customizeSettingKeys);
}

function setupCustomizeApp() {
    const customizeForm = document.getElementById('customize-form');
    
    customizeForm.addEventListener('click', async (e) => {
        const target = e.target;

        if (target.closest('[data-home-layout-mode]')) {
            freeHomeSwitchMode(target.closest('[data-home-layout-mode]').dataset.homeLayoutMode);
            return;
        }
        if (target.closest('#free-home-open-editor')) {
            freeHomeEditing = true;
            switchScreen('home-screen');
            setupHomeScreen();
            return;
        }
        if (target.closest('#free-home-copy-classic')) {
            freeHomeCopyClassicWidgets();
            return;
        }

        // 分段标签页切换
        const tabBtn = target.closest('.cust-tab-btn');
        if (tabBtn) {
            const tabId = tabBtn.dataset.tab;
            const container = customizeForm.querySelector('.cust-screen-container');
            if (container) {
                container.querySelectorAll('.cust-tab-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.tab === tabId);
                });
                container.querySelectorAll('.cust-tab-pane').forEach(pane => {
                    pane.classList.toggle('active', pane.id === `cust-pane-${tabId}`);
                });
            }
            return;
        }

        if (target.matches('.reset-icon-btn') || target.closest('.reset-icon-btn')) {
            const btn = target.matches('.reset-icon-btn') ? target : target.closest('.reset-icon-btn');
            const iconId = btn.dataset.id;
            if (db.customIcons) {
                delete db.customIcons[iconId];
            }
            await saveCustomizeSettings();
            const previewImg = document.getElementById(`icon-preview-${iconId}`);
            if (previewImg && defaultIcons[iconId]) {
                previewImg.src = defaultIcons[iconId].url;
            }
            const urlInput = document.querySelector(`input[data-icon-id="${iconId}"][type="url"]`);
            if (urlInput) urlInput.value = '';
            setupHomeScreen();
            showToast('图标已重置');
            return;
        }

        if (target.matches('.reset-name-btn') || target.closest('.reset-name-btn')) {
            const btn = target.matches('.reset-name-btn') ? target : target.closest('.reset-name-btn');
            const nameId = btn.dataset.nameResetId;
            if (db.customAppNames) {
                delete db.customAppNames[nameId];
            }
            await saveCustomizeSettings();
            const nameInput = document.querySelector(`input[data-name-id="${nameId}"]`);
            if (nameInput) nameInput.value = '';
            setupHomeScreen();
            showToast('名称已重置');
            return;
        }

        if (target.matches('#reset-all-names-btn')) {
            if (confirm('确定要将所有应用名称恢复为默认吗？')) {
                db.customAppNames = {};
                await saveCustomizeSettings();
                renderCustomizeForm();
                setupHomeScreen();
                showToast('所有名称已恢复默认');
            }
        }

        if (target.matches('#reset-widget-btn')) {
            if (confirm('确定要将小部件恢复为默认设置吗？')) {
                db.homeWidgetSettings = JSON.parse(JSON.stringify(defaultWidgetSettings));
                await saveCustomizeSettings();
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
            await saveCustomizeSettings();
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
            await saveCustomizeSettings();
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
                saveCustomizeSettings();
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
            saveCustomizeSettings();
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
            await saveCustomizeSettings();
            applyGlobalFont(fontUrl);
            const nameEl = document.getElementById('local-font-name');
            if (nameEl) nameEl.style.display = 'none';
            showToast('新字体已应用！');
        }
        
        if (target.matches('#restore-font-btn')) {
            document.getElementById('customize-font-url').value = '';
            db.fontUrl = '';
            db.localFontName = '';
            await saveCustomizeSettings();
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
            saveCustomizeSettings();
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
            saveCustomizeSettings();
            showToast('已重置');
        }
        if (target.matches('#test-message-sent-sound-btn')) {
            const formGroup = target.closest('.form-group');
            const urlInput = formGroup && formGroup.querySelector('input[type="url"]');
            const url = (urlInput && urlInput.value && urlInput.value.trim()) || '';
            if (url) {
                db.globalMessageSentSound = url;
                saveCustomizeSettings();
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
            saveCustomizeSettings();
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
            saveCustomizeSettings();
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
            await saveCustomizeSettings();
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
            await saveCustomizeSettings();
            setupHomeScreen();
        }
        else if (target.id === 'global-send-sound-url') {
            db.globalSendSound = target.value.trim();
            await saveCustomizeSettings();
        }
        else if (target.id === 'global-receive-sound-url') {
            db.globalReceiveSound = target.value.trim();
            await saveCustomizeSettings();
        }
        else if (target.id === 'global-message-sent-sound-url') {
            db.globalMessageSentSound = target.value.trim();
            await saveCustomizeSettings();
        }
        else if (target.id === 'global-incoming-call-sound-url') {
            db.globalIncomingCallSound = target.value.trim();
            await saveCustomizeSettings();
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
            await saveCustomizeSettings();
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
                
                await saveCustomizeSettings();
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
            saveCustomizeSettings();
        }
        if (e.target.id === 'global-receive-sound-url') {
            db.globalReceiveSound = e.target.value.trim();
            saveCustomizeSettings();
        }
        if (e.target.id === 'global-incoming-call-sound-url') {
            db.globalIncomingCallSound = e.target.value.trim();
            saveCustomizeSettings();
        }
        if (e.target.id === 'multi-msg-sound-switch') {
            db.multiMsgSoundEnabled = e.target.checked;
            saveCustomizeSettings();
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
                await saveCustomizeSettings();
                showToast('提示音已上传');
            };
            reader.readAsDataURL(file);
            e.target.value = null;
        }

        // 本地字体上传
        if (e.target.id === 'local-font-upload') {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = async (evt) => {
                const arrayBuffer = evt.target.result;
                
                if (!db.fontBuffer || db.fontBuffer.constructor === ArrayBuffer) {
                    db.fontBuffer = {};
                }
                db.fontBuffer[file.name] = arrayBuffer;
                
                db.fontUrl = 'local:' + file.name;
                db.localFontName = file.name;
                
                const fontUrlInput = document.getElementById('customize-font-url');
                if (fontUrlInput) fontUrlInput.value = '';
                
                const nameEl = document.getElementById('local-font-name');
                if (nameEl) {
                    nameEl.textContent = '已加载本地字体：' + file.name;
                    nameEl.style.display = 'block';
                }
                
                await saveCustomizeSettings();
                applyGlobalFont(db.fontUrl);
                showToast('本地字体已应用！');
            };
            reader.readAsArrayBuffer(file);
            e.target.value = null;
        }
    });
}

function renderCustomizeForm() {
    const customizeForm = document.getElementById('customize-form');
    customizeForm.innerHTML = ''; 
    
    const container = document.createElement('div');
    container.className = 'cust-screen-container';
    
    const iconOrder = [
        'chat-list-screen', 'api-settings-screen', 'wallpaper-screen',
        'world-book-screen', 'customize-screen', 'tutorial-screen',
        'day-mode-btn', 'night-mode-btn', 'forum-screen', 'music-screen', 'diary-screen', 'piggy-bank-screen', 'pomodoro-screen', 'storage-analysis-screen', 'appearance-settings-screen', 'theater-screen', 'biekan-app', 'magic-room-screen'
    ];

    // 1. 顶部纯白分段控制器 Segmented Tab Bar
    const navTabsHTML = `
    <div class="cust-tab-wrapper">
        <div class="cust-segmented-bar">
            <button type="button" class="cust-tab-btn active" data-tab="apps">应用外观</button>
            <button type="button" class="cust-tab-btn" data-tab="desktop">桌面方案</button>
            <button type="button" class="cust-tab-btn" data-tab="media">字体声音</button>
            <button type="button" class="cust-tab-btn" data-tab="system">系统美化</button>
        </div>
    </div>
    `;

    // 2. 标签页 1：应用外观 (图标与名称一体化设计)
    let appItemsHTML = '';
    iconOrder.forEach(id => {
        const { name, url } = defaultIcons[id];
        const currentIcon = (db.customIcons && db.customIcons[id]) || url;
        const currentName = (db.customAppNames && db.customAppNames[id]) || '';
        const iconUrlVal = (db.customIcons && db.customIcons[id]) || '';

        appItemsHTML += `
        <div class="cust-app-row">
            <div class="cust-app-avatar-wrap">
                <img src="${currentIcon}" alt="${name}" id="icon-preview-${id}">
                <label for="upload-icon-${id}" class="cust-app-avatar-badge" title="上传图标">
                    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
                </label>
                <input type="file" id="upload-icon-${id}" data-icon-id="${id}" accept="image/*" style="display:none;" class="icon-upload-input">
            </div>
            <div class="cust-app-fields">
                <input type="text" class="cust-app-name-input" placeholder="${name}" value="${currentName}" data-name-id="${id}">
                <input type="url" class="cust-app-url-input" placeholder="图标图片URL (可选)" value="${iconUrlVal}" data-icon-id="${id}">
            </div>
            <div class="cust-app-actions">
                <button type="button" class="reset-icon-btn cust-mini-btn" data-id="${id}" title="重置图标">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                </button>
                <button type="button" class="reset-name-btn cust-mini-btn" data-name-reset-id="${id}" title="重置名称">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
                </button>
            </div>
        </div>`;
    });

    const paneAppsHTML = `
    <div class="cust-tab-pane active" id="cust-pane-apps">
        <div class="cust-card">
            <div class="cust-card-header">
                <div>
                    <h3 class="cust-card-title">应用外观与名称</h3>
                    <p class="cust-card-subtitle">直接修改每个应用的显示名称、自定义图标链接或上传本地图片。</p>
                </div>
                <button type="button" id="reset-all-names-btn" class="cust-btn cust-btn-danger" style="height:30px; padding:0 10px; font-size:12px;">重置全称</button>
            </div>

            <div class="cust-preset-bar">
                <div class="cust-preset-select-row">
                    <label for="icon-preset-select">图标预设</label>
                    <select id="icon-preset-select"><option value="">— 选择图标预设 —</option></select>
                </div>
                <div class="cust-btn-group">
                    <button type="button" id="icon-apply-preset-btn" class="cust-btn cust-btn-primary" style="flex:1;">应用预设</button>
                    <button type="button" id="icon-save-preset-btn" class="cust-btn" style="flex:1;">保存方案</button>
                    <button type="button" id="icon-manage-presets-btn" class="cust-btn" style="flex:1;">管理库</button>
                </div>
            </div>

            <div class="cust-preset-bar">
                <div class="cust-preset-select-row">
                    <label for="name-preset-select">名称预设</label>
                    <select id="name-preset-select"><option value="">— 选择名称预设 —</option></select>
                </div>
                <div class="cust-btn-group">
                    <button type="button" id="name-apply-preset-btn" class="cust-btn cust-btn-primary" style="flex:1;">应用预设</button>
                    <button type="button" id="name-save-preset-btn" class="cust-btn" style="flex:1;">保存方案</button>
                    <button type="button" id="name-manage-presets-btn" class="cust-btn" style="flex:1;">管理库</button>
                </div>
            </div>

            <div class="cust-app-grid">
                ${appItemsHTML}
            </div>
        </div>
    </div>
    `;

    // 3. 标签页 2：桌面方案与小部件
    const paneDesktopHTML = `
    <div class="cust-tab-pane" id="cust-pane-desktop">
        <div class="cust-card">
            <div class="cust-card-header"><div>
                <h3 class="cust-card-title">主屏布局</h3>
                <p class="cust-card-subtitle">经典布局保留现有作品；自由布局可拖动 APP、小组件并管理页面。</p>
            </div></div>
            <div class="cust-btn-group home-layout-choices">
                <button type="button" class="cust-btn ${db.homeLayoutMode !== 'free' ? 'cust-btn-primary' : ''}" data-home-layout-mode="classic">经典布局</button>
                <button type="button" class="cust-btn ${db.homeLayoutMode === 'free' ? 'cust-btn-primary' : ''}" data-home-layout-mode="free">自由布局</button>
            </div>
            ${db.homeLayoutMode === 'free' ? '<div class="cust-btn-group"><button type="button" id="free-home-open-editor" class="cust-btn">前往编辑主屏</button><button type="button" id="free-home-copy-classic" class="cust-btn">加入经典小组件</button></div>' : ''}
        </div>
        <div class="cust-card">
            <div class="cust-card-header">
                <div>
                    <h3 class="cust-card-title">主屏幕完整方案</h3>
                    <p class="cust-card-subtitle">将当前主屏全部小组件、壁纸与图标组合保存为完整预设方案。导出默认不分享图片，确认选择后才会包含。</p>
                </div>
            </div>
            <div class="cust-preset-bar">
                <div class="cust-preset-select-row">
                    <label for="widget-wallpaper-preset-select">方案预设</label>
                    <select id="widget-wallpaper-preset-select"><option value="">— 选择方案 —</option></select>
                </div>
                <div class="cust-btn-group">
                    <button type="button" id="widget-wallpaper-apply-preset" class="cust-btn cust-btn-primary" style="flex:1;">应用方案</button>
                    <button type="button" id="widget-wallpaper-save-preset" class="cust-btn" style="flex:1;">保存当前</button>
                    <button type="button" id="widget-wallpaper-manage-presets" class="cust-btn" style="flex:1;">方案管理</button>
                </div>
            </div>
            <div class="cust-btn-group">
                <button type="button" id="widget-wallpaper-export-btn" class="cust-btn" style="flex:1;">导出方案文件</button>
                <button type="button" id="widget-wallpaper-import-btn" class="cust-btn" style="flex:1;">导入方案文件</button>
            </div>
            <button type="button" id="widget-wallpaper-reset-btn" class="cust-btn cust-btn-danger">恢复默认（主屏幕预设）</button>
            <input type="file" id="widget-wallpaper-import-file" accept=".json,.ee" style="display:none;">
        </div>

        <div class="cust-card">
            <div class="cust-card-header">
                <div>
                    <h3 class="cust-card-title">主页小部件设置</h3>
                    <p class="cust-card-subtitle">主屏幕小部件内容可直接点击编辑。在此可单独管理小部件预设。</p>
                </div>
            </div>
            <div class="cust-preset-bar">
                <div class="cust-preset-select-row">
                    <label for="widget-preset-select">部件预设</label>
                    <select id="widget-preset-select"><option value="">— 选择部件预设 —</option></select>
                </div>
                <div class="cust-btn-group">
                    <button type="button" id="widget-apply-preset" class="cust-btn cust-btn-primary" style="flex:1;">应用</button>
                    <button type="button" id="widget-save-preset" class="cust-btn" style="flex:1;">保存</button>
                    <button type="button" id="widget-manage-presets" class="cust-btn" style="flex:1;">管理</button>
                </div>
            </div>
            <button type="button" id="reset-widget-btn" class="cust-btn cust-btn-danger">恢复小部件默认内容</button>
        </div>
    </div>
    `;

    // 4. 标签页 3：字体与声音
    const paneMediaHTML = `
    <div class="cust-tab-pane" id="cust-pane-media">
        <div class="cust-card">
            <div class="cust-card-header">
                <div>
                    <h3 class="cust-card-title">全局字体设置</h3>
                    <p class="cust-card-subtitle">调整全局字体大小或加载个性化字体文件。</p>
                </div>
            </div>

            <div class="cust-field-item">
                <div class="cust-field-item-row">
                    <span class="cust-field-label">字体大小缩放</span>
                    <span id="font-size-value" style="font-weight:600; color:#0f172a;">${(db.fontSizeScale || 1.0).toFixed(1)}x</span>
                </div>
                <input type="range" id="font-size-slider" min="0.8" max="1.5" step="0.1" value="${db.fontSizeScale || 1.0}" style="width:100%; accent-color:#0f172a; margin:6px 0;">
            </div>

            <div class="cust-field-item">
                <span class="cust-field-label">网络字体文件 URL</span>
                <input type="url" id="customize-font-url" class="cust-input-text" placeholder="https://example.com/font.woff2" value="${db.fontUrl && !db.fontUrl.startsWith('data:') ? db.fontUrl : ''}">
                <div style="display:flex; gap:8px; align-items:center;">
                    <input type="file" id="local-font-upload" accept=".woff2,.woff,.ttf,.otf,.eot,.svg,.ttc" style="display:none;">
                    <label for="local-font-upload" class="cust-btn" style="flex:1; cursor:pointer;">本地字体上传</label>
                    <button type="button" id="apply-font-btn" class="cust-btn cust-btn-primary" style="flex:1;">应用字体</button>
                    <button type="button" id="restore-font-btn" class="cust-btn" style="flex:1;">恢复默认</button>
                </div>
                <p id="local-font-name" style="font-size:12px; color:#0f172a; margin:2px 0 0; display:${db.fontUrl && db.fontUrl.startsWith('data:') ? 'block' : 'none'};">${db.localFontName ? '已加载本地字体：' + db.localFontName : ''}</p>
                <span class="cust-field-hint">支持 woff2, woff, ttf, otf, eot 等格式，本地上传限制 5MB 内。</span>
            </div>

            <div class="cust-preset-bar">
                <div class="cust-preset-select-row">
                    <label for="font-preset-select">字体预设</label>
                    <select id="font-preset-select"><option value="">— 选择字体预设 —</option></select>
                </div>
                <div class="cust-btn-group">
                    <button type="button" id="font-apply-preset-btn" class="cust-btn cust-btn-primary" style="flex:1;">应用预设</button>
                    <button type="button" id="font-save-preset-btn" class="cust-btn" style="flex:1;">保存预设</button>
                    <button type="button" id="font-manage-presets-btn" class="cust-btn" style="flex:1;">管理预设</button>
                </div>
            </div>
        </div>

        <div class="cust-card">
            <div class="cust-card-header">
                <div>
                    <h3 class="cust-card-title">提示音与铃声</h3>
                    <p class="cust-card-subtitle">设置操作反馈音与通话铃声，支持网络链接与本地音频。</p>
                </div>
            </div>

            <!-- 开始生成提示音 -->
            <div class="cust-field-item">
                <span class="cust-field-label">开始生成提示音</span>
                <div class="cust-sound-row">
                    <input type="url" id="global-send-sound-url" placeholder="音频链接" value="${db.globalSendSound || ''}">
                    <input type="file" id="global-send-sound-upload" accept="audio/*" style="display:none;">
                    <label for="global-send-sound-upload" class="cust-mini-btn" title="本地上传">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                    </label>
                    <button type="button" id="test-send-sound-btn" class="cust-mini-btn" title="试听">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </button>
                    <button type="button" id="reset-send-sound-btn" class="cust-mini-btn" title="重置">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            </div>

            <!-- 收到回复提示音 -->
            <div class="cust-field-item">
                <span class="cust-field-label">收到回复提示音</span>
                <div class="cust-sound-row">
                    <input type="url" id="global-receive-sound-url" placeholder="音频链接" value="${db.globalReceiveSound || ''}">
                    <input type="file" id="global-receive-sound-upload" accept="audio/*" style="display:none;">
                    <label for="global-receive-sound-upload" class="cust-mini-btn" title="本地上传">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                    </label>
                    <button type="button" id="test-receive-sound-btn" class="cust-mini-btn" title="试听">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </button>
                    <button type="button" id="reset-receive-sound-btn" class="cust-mini-btn" title="重置">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            </div>

            <!-- 发消息提示音 -->
            <div class="cust-field-item">
                <span class="cust-field-label">发消息提示音</span>
                <div class="cust-sound-row">
                    <input type="url" id="global-message-sent-sound-url" placeholder="音频链接" value="${db.globalMessageSentSound || ''}">
                    <input type="file" id="global-message-sent-sound-upload" accept="audio/*" style="display:none;">
                    <label for="global-message-sent-sound-upload" class="cust-mini-btn" title="本地上传">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                    </label>
                    <button type="button" id="test-message-sent-sound-btn" class="cust-mini-btn" title="试听">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </button>
                    <button type="button" id="reset-message-sent-sound-btn" class="cust-mini-btn" title="重置">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            </div>

            <!-- 来电提示音 -->
            <div class="cust-field-item">
                <span class="cust-field-label">来电提示音</span>
                <div class="cust-sound-row">
                    <input type="url" id="global-incoming-call-sound-url" placeholder="音频链接" value="${db.globalIncomingCallSound || ''}">
                    <input type="file" id="global-incoming-call-sound-upload" accept="audio/*" style="display:none;">
                    <label for="global-incoming-call-sound-upload" class="cust-mini-btn" title="本地上传">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                    </label>
                    <button type="button" id="test-incoming-call-sound-btn" class="cust-mini-btn" title="试听">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </button>
                    <button type="button" id="reset-incoming-call-sound-btn" class="cust-mini-btn" title="重置">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            </div>

            <div class="cust-field-item-row" style="padding-top:6px;">
                <div>
                    <div class="cust-field-label">多条连续消息提示音</div>
                    <div class="cust-field-hint">开启后 AI 连续输出多个气泡均播放提示音</div>
                </div>
                <label class="kkt-switch">
                    <input type="checkbox" id="multi-msg-sound-switch" ${db.multiMsgSoundEnabled ? 'checked' : ''}>
                    <span class="kkt-slider"></span>
                </label>
            </div>

            <div class="cust-preset-bar">
                <div class="cust-preset-select-row">
                    <label for="sound-preset-select">提示音预设</label>
                    <select id="sound-preset-select"><option value="">— 选择提示音预设 —</option></select>
                </div>
                <div class="cust-btn-group">
                    <button type="button" id="sound-apply-preset-btn" class="cust-btn cust-btn-primary" style="flex:1;">应用预设</button>
                    <button type="button" id="sound-save-preset-btn" class="cust-btn" style="flex:1;">保存预设</button>
                    <button type="button" id="sound-manage-presets-btn" class="cust-btn" style="flex:1;">管理预设</button>
                </div>
            </div>
        </div>
    </div>
    `;

    // 5. 标签页 4：系统与美化代码 (顶栏、夜间模式、CSS代码实验室)
    const nightSettings = db.nightModeSettings || {};
    const statusBarSettings = db.homeStatusBarSettings || {};
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

    const paneSystemHTML = `
    <div class="cust-tab-pane" id="cust-pane-system">
        ${window.ChatKeyboardLayout?.settingsHtml() || ''}
        <!-- 顶栏状态栏 -->
        <div class="cust-card">
            <div class="cust-card-header">
                <div>
                    <h3 class="cust-card-title">顶栏时间与电量</h3>
                    <p class="cust-card-subtitle">在全应用顶栏显示无遮挡的实时时间与电量。</p>
                </div>
                <label class="kkt-switch">
                    <input type="checkbox" id="home-statusbar-enabled" ${statusBarSettings.enabled ? 'checked' : ''}>
                    <span class="kkt-slider"></span>
                </label>
            </div>

            <div class="cust-statusbar-preview">
                <span id="statusbar-preview-time" style="font-weight:600;">--:--</span>
                <span style="display:flex; align-items:center; gap:6px;">
                    <svg width="18" height="11" viewBox="0 0 24 12" fill="none"><path d="M1 2.5C1 1.95 1.45 1.5 2 1.5H20C20.55 1.5 21 1.95 21 2.5V9.5C21 10.05 20.55 10.5 20 10.5H2C1.45 10.5 1 10.05 1 9.5V2.5Z" stroke="#0f172a" stroke-width="1.2"/><path d="M22.5 4V8" stroke="#0f172a" stroke-width="1.5" stroke-linecap="round"/><rect id="statusbar-preview-battery-fill" x="2" y="2.5" width="18" height="7" rx="0.5" fill="#0f172a"/></svg>
                    <span id="statusbar-preview-level">--%</span>
                </span>
            </div>

            <div class="cust-field-item">
                <span class="cust-field-label">容器 CSS</span>
                <textarea id="statusbar-container-css" class="cust-textarea" rows="3" placeholder="background: transparent;\ncolor: #333;">${statusBarSettings.containerCss !== undefined ? statusBarSettings.containerCss : 'background: transparent;\ncolor: #333;\nborder-radius: 0;'}</textarea>
            </div>
            <div class="cust-field-item">
                <span class="cust-field-label">时间 CSS</span>
                <textarea id="statusbar-time-css" class="cust-textarea" rows="2" placeholder="font-size: 14px;\nfont-weight: bold;">${statusBarSettings.timeCss !== undefined ? statusBarSettings.timeCss : 'font-size: 14px;\nfont-weight: bold;\ncolor: #333;'}</textarea>
            </div>
            <div class="cust-field-item">
                <span class="cust-field-label">电量 CSS</span>
                <textarea id="statusbar-battery-css" class="cust-textarea" rows="2" placeholder="font-size: 12px;\ncolor: #4CAF50;">${statusBarSettings.batteryCss !== undefined ? statusBarSettings.batteryCss : 'font-size: 12px;\ncolor: #4CAF50;'}</textarea>
            </div>

            <div class="cust-btn-group">
                <button type="button" id="statusbar-apply-btn" class="cust-btn cust-btn-primary" style="flex:1;">应用样式</button>
                <button type="button" id="statusbar-reset-btn" class="cust-btn" style="flex:1;">重置默认</button>
                <button type="button" id="statusbar-export-btn" class="cust-btn" style="flex:1;">导出</button>
                <button type="button" id="statusbar-import-btn" class="cust-btn" style="flex:1;">导入</button>
                <input type="file" id="statusbar-import-file" accept=".json" style="display:none;">
            </div>
        </div>

        <!-- 夜间模式 -->
        <div class="cust-card">
            <div class="cust-card-header">
                <div>
                    <h3 class="cust-card-title">夜间暗色模式</h3>
                    <p class="cust-card-subtitle">支持定时自动切换与自定义夜间 CSS 样式覆盖。</p>
                </div>
                <label class="kkt-switch">
                    <input type="checkbox" id="night-mode-enabled" ${nightSettings.enabled ? 'checked' : ''}>
                    <span class="kkt-slider"></span>
                </label>
            </div>

            <div class="cust-field-item-row">
                <span class="cust-field-label">定时自动切换</span>
                <label class="kkt-switch">
                    <input type="checkbox" id="night-mode-auto" ${nightSettings.auto ? 'checked' : ''}>
                    <span class="kkt-slider"></span>
                </label>
            </div>

            <div id="night-mode-schedule" style="display:${nightSettings.auto ? 'flex' : 'none'}; gap:10px; align-items:center;">
                <label style="font-size:13px; color:#64748b;">开始</label>
                <input type="time" id="night-mode-start" value="${nightSettings.startTime || '22:00'}" class="cust-input-text" style="flex:1; height:34px;">
                <label style="font-size:13px; color:#64748b;">结束</label>
                <input type="time" id="night-mode-end" value="${nightSettings.endTime || '07:00'}" class="cust-input-text" style="flex:1; height:34px;">
            </div>

            <div class="cust-field-item">
                <div class="cust-field-item-row">
                    <span class="cust-field-label">夜间自定义 CSS</span>
                    <div style="display:flex; gap:6px;">
                        <button type="button" id="night-css-apply-btn" class="cust-btn cust-btn-primary" style="height:28px; padding:0 8px; font-size:12px;">应用</button>
                        <button type="button" id="night-css-reset-btn" class="cust-btn" style="height:28px; padding:0 8px; font-size:12px;">重置</button>
                    </div>
                </div>
                <textarea id="night-mode-custom-css" class="cust-textarea" rows="8" placeholder="在此输入自定义夜间CSS代码...">${nightSettings.customCss || DEFAULT_NIGHT_MODE_CSS}</textarea>
            </div>

            <div class="cust-btn-group">
                <button type="button" id="night-mode-export-btn" class="cust-btn" style="flex:1;">导出夜间配置</button>
                <button type="button" id="night-mode-import-btn" class="cust-btn" style="flex:1;">导入夜间配置</button>
                <input type="file" id="night-mode-import-file" accept=".json" style="display:none;">
            </div>
        </div>

        <!-- 全局 CSS 美化 -->
        <div class="cust-card">
            <div class="cust-card-header">
                <div>
                    <h3 class="cust-card-title">全局 CSS 美化与拓展</h3>
                    <p class="cust-card-subtitle">自由编写或应用 CSS 预设定制全应用细节。</p>
                </div>
            </div>

            <div class="cust-field-item">
                <div class="cust-field-item-row">
                    <span class="cust-field-label">CSS 代码</span>
                    <div style="display:flex; gap:6px;">
                        <button type="button" id="global-css-import-doc-btn" class="cust-btn" style="height:28px; padding:0 8px; font-size:12px;">导入文档</button>
                        <button type="button" id="apply-global-css-now-btn" class="cust-btn cust-btn-primary" style="height:28px; padding:0 8px; font-size:12px;">立即应用</button>
                        <button type="button" id="reset-global-css-btn" class="cust-btn" style="height:28px; padding:0 8px; font-size:12px;">重置</button>
                    </div>
                </div>
                <input type="file" id="global-css-import-file" accept=".txt,.docx" style="display:none;">
                <textarea id="global-beautification-css" class="cust-textarea" rows="8" placeholder="在此输入CSS代码..."></textarea>
            </div>

            <div class="cust-preset-bar">
                <div class="cust-preset-select-row">
                    <label for="global-css-preset-select">CSS 预设</label>
                    <select id="global-css-preset-select"><option value="">-- 选择预设 --</option></select>
                </div>
                <div class="cust-btn-group">
                    <button type="button" id="global-css-apply-btn" class="cust-btn cust-btn-primary" style="flex:1;">应用</button>
                    <button type="button" id="global-css-save-btn" class="cust-btn" style="flex:1;">保存</button>
                    <button type="button" id="global-css-manage-btn" class="cust-btn" style="flex:1;">管理</button>
                </div>
            </div>

            <div class="cust-field-item">
                <span class="cust-field-label" style="margin-bottom:6px;">拓展美化代码库</span>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    <div class="cust-code-card css-template-card">
                        <div class="cust-field-item-row">
                            <span style="font-weight:600; font-size:13px; color:#0f172a;">隐藏聊天顶栏分割线</span>
                            <button type="button" class="cust-btn cust-btn-primary copy-css-btn" style="height:28px; padding:0 10px; font-size:12px;">复制代码</button>
                        </div>
                        <pre><code>#chat-room-screen .app-header {
border-bottom: none !important;
}</code></pre>
                    </div>

                    <div class="cust-code-card css-template-card">
                        <div class="cust-field-item-row">
                            <span style="font-weight:600; font-size:13px; color:#0f172a;">隐藏聊天头像与时间戳</span>
                            <button type="button" class="cust-btn cust-btn-primary copy-css-btn" style="height:28px; padding:0 10px; font-size:12px;">复制代码</button>
                        </div>
                        <pre><code>.message-info {
display: none !important;
}
.voice-transcript, .translation-text {
margin-left: 8px !important;
margin-right: 8px !important;
}
.message-wrapper.sent .voice-transcript,
.message-wrapper.sent .translation-text {
align-self: flex-end;
margin-left: auto !important;
}</code></pre>
                    </div>

                    <div class="cust-code-card css-template-card">
                        <div class="cust-field-item-row">
                            <span style="font-weight:600; font-size:13px; color:#0f172a;">iOS 灵动岛/刘海屏防遮挡补丁</span>
                            <button type="button" class="cust-btn cust-btn-primary copy-css-btn" style="height:28px; padding:0 10px; font-size:12px;">复制代码</button>
                        </div>
                        <pre><code>.app-header {
    padding-top: calc(15px + env(safe-area-inset-top)) !important;
    height: auto !important;
}
#home-screen {
    padding-top: calc(45px + env(safe-area-inset-top)) !important;
}
.settings-sidebar .header {
    padding-top: calc(15px + env(safe-area-inset-top)) !important;
}
.message-input-area,
#multi-select-bar,
#world-book-multi-select-bar {
    padding-bottom: calc(10px + env(safe-area-inset-bottom)) !important;
}</code></pre>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;

    container.innerHTML = navTabsHTML + paneAppsHTML + paneDesktopHTML + paneMediaHTML + paneSystemHTML;
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
            await saveCustomizeSettings();
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
    window.ChatKeyboardLayout?.bindSettings();
}

// ============================================
// 夜间模式
// ============================================
