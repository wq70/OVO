// --- 外观设置 (Appearance Settings) ---
// 整体 UI 切换：论坛、设置、APP 布局、小组件等（聊天列表与聊天详情页保持不变）
// 当前为占位：点击显示「正在开发中」

const APPEARANCE_STORAGE_KEY = 'ovo_appearance_ui_mode';

function getAppearanceMode() {
    try {
        return localStorage.getItem(APPEARANCE_STORAGE_KEY) || 'classic';
    } catch (_) {
        return 'classic';
    }
}

function setAppearanceMode(mode) {
    try {
        localStorage.setItem(APPEARANCE_STORAGE_KEY, mode);
    } catch (_) {}
}

function renderAppearanceSettingsScreen() {
    const screen = document.getElementById('appearance-settings-screen');
    if (!screen) return;
    if (screen.querySelector('.appearance-settings-inner')) return;

    const inner = document.createElement('div');
    inner.className = 'appearance-settings-inner';

    inner.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="home-screen">‹</button>
            <div class="title-container">
                <h1 class="title">外观设置</h1>
            </div>
            <div class="placeholder"></div>
        </header>
        <main class="content" style="display:flex; align-items:center; justify-content:center; padding:20px;">
            <p class="appearance-placeholder-text" style="font-size:16px; color:#888; text-align:center; margin:0;">正在开发中</p>
        </main>
    `;

    screen.appendChild(inner);
}

(function initAppearanceSettings() {
    function injectWhenReady() {
        const screen = document.getElementById('appearance-settings-screen');
        if (!screen || screen.querySelector('.appearance-settings-inner')) return;
        renderAppearanceSettingsScreen();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectWhenReady);
    } else {
        injectWhenReady();
    }
})();
