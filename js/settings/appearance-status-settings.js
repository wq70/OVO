const appearanceStatusSettingKeys = ['nightModeSettings', 'homeStatusBarSettings'];

function saveAppearanceStatusSettings() {
    return saveGlobalSettings(appearanceStatusSettingKeys);
}

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
        await saveAppearanceStatusSettings();
        applyNightMode();
        showToast(enabledCb.checked ? '夜间模式已开启' : '夜间模式已关闭');
    });

    if (autoCb) autoCb.addEventListener('change', async () => {
        if (!db.nightModeSettings) db.nightModeSettings = {};
        db.nightModeSettings.auto = autoCb.checked;
        if (scheduleDiv) scheduleDiv.style.display = autoCb.checked ? 'flex' : 'none';
        await saveAppearanceStatusSettings();
        applyNightMode();
    });

    if (startInput) startInput.addEventListener('change', async () => {
        if (!db.nightModeSettings) db.nightModeSettings = {};
        db.nightModeSettings.startTime = startInput.value;
        await saveAppearanceStatusSettings();
        applyNightMode();
    });

    if (endInput) endInput.addEventListener('change', async () => {
        if (!db.nightModeSettings) db.nightModeSettings = {};
        db.nightModeSettings.endTime = endInput.value;
        await saveAppearanceStatusSettings();
        applyNightMode();
    });

    document.getElementById('night-css-apply-btn')?.addEventListener('click', async () => {
        if (!db.nightModeSettings) db.nightModeSettings = {};
        db.nightModeSettings.customCss = cssArea?.value || '';
        await saveAppearanceStatusSettings();
        applyNightMode();
        showToast('夜间模式 CSS 已应用');
    });

    document.getElementById('night-css-reset-btn')?.addEventListener('click', async () => {
        if (!db.nightModeSettings) db.nightModeSettings = {};
        db.nightModeSettings.customCss = '';
        if (cssArea) cssArea.value = DEFAULT_NIGHT_MODE_CSS;
        await saveAppearanceStatusSettings();
        applyNightMode();
        showToast('夜间模式 CSS 已重置为默认代码');
    });

    // 导出
    document.getElementById('night-mode-export-btn')?.addEventListener('click', async () => {
        const payload = { type: 'night-mode-config', settings: db.nightModeSettings || {} };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        await OvoFileDownload.save(blob, '夜间模式配置.json');

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
                await saveAppearanceStatusSettings();
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
        await saveAppearanceStatusSettings();
        applyHomeStatusBar();
        showToast(enabledCb.checked ? '顶栏状态栏已开启' : '顶栏状态栏已关闭');
    });

    document.getElementById('statusbar-apply-btn')?.addEventListener('click', async () => {
        if (!db.homeStatusBarSettings) db.homeStatusBarSettings = {};
        db.homeStatusBarSettings.containerCss = containerCssArea?.value || '';
        db.homeStatusBarSettings.timeCss = timeCssArea?.value || '';
        db.homeStatusBarSettings.batteryCss = batteryCssArea?.value || '';
        await saveAppearanceStatusSettings();
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
        await saveAppearanceStatusSettings();
        applyHomeStatusBar();
        showToast('顶栏样式已重置');
    });

    // 导出
    document.getElementById('statusbar-export-btn')?.addEventListener('click', async () => {
        const payload = { type: 'home-statusbar-config', settings: db.homeStatusBarSettings || {} };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        await OvoFileDownload.save(blob, '顶栏状态栏配置.json');

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
                await saveAppearanceStatusSettings();
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
        document.body.classList.remove('has-statusbar');
        let styleEl = document.getElementById('home-statusbar-custom-style');
        if (styleEl) styleEl.textContent = '';
        return;
    }
    
    document.body.classList.add('has-statusbar');

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

