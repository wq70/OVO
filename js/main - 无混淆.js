// --- 主程序入口 (js/main.js) ---

// 注册 Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}

const init = async () => {
    await loadData();
    if (!db.homeWidgetSettings || !db.homeWidgetSettings.topLeft) {
        db.homeWidgetSettings = JSON.parse(JSON.stringify(defaultWidgetSettings));
    }

    // 全局点击事件委托
    document.body.addEventListener('click', (e) => {
        // 全局点击触感反馈
        // if (e.target.closest('button, .btn, .action-btn, .nav-item, .icon-btn, .list-item, input[type="checkbox"], input[type="radio"], .back-btn')) {
        //     triggerHapticFeedback('light');
        // }

        if (e.target.closest('.context-menu')) {
            e.stopPropagation();
            return;
        }
        removeContextMenu();

        const backBtn = e.target.closest('.back-btn');
        if (backBtn) {
            e.preventDefault();
            switchScreen(backBtn.getAttribute('data-target'));
        }

        const openOverlay = document.querySelector('.modal-overlay.visible, .action-sheet-overlay.visible');
        if (openOverlay && e.target === openOverlay) {
            openOverlay.classList.remove('visible');
        }
    });

    // 导航栏跳转
    document.body.addEventListener('click', e => {
        const navLink = e.target.closest('.app-icon[data-target]');
        if (navLink) {
            e.preventDefault();
            const target = navLink.getAttribute('data-target');
            if (target === 'music-screen' || target === 'diary-screen' || target === 'piggy-bank-screen') {
                showToast('该应用正在开发中，敬请期待！');
                return;
            }
            switchScreen(target);
        }
    });

    // 定时任务
    updateClock();
    setInterval(updateClock, 30000);
    setInterval(checkAutoReply, 60000);

    // 应用全局设置
    applyGlobalFont(db.fontUrl);
    applyGlobalCss(db.globalCss);
    applyFontSize(db.fontSizeScale || 1.0);
    applyPomodoroBackgrounds();
    if (typeof applyThemeSettings === 'function') applyThemeSettings();

    if (typeof db.globalToastEnabled === 'undefined') {
        db.globalToastEnabled = true;
    }

    // 初始化各个模块
    setupGlobalRescueGesture(); // 全局救援手势
    setupHomeScreen();
    setupChatListScreen();
    setupContactsScreen();
    setupBottomNavigation();
    setupAddCharModal();
    setupChatRoom();
    setupChatSettings();
    setupApiSettingsApp();
    setupWallpaperApp();
    await setupStickerSystem();
    setupPresetFeatures();
    setupVoiceMessageSystem();
    setupPhotoVideoSystem();
    setupImageRecognition();
    setupWalletSystem();
    setupGiftSystem();
    setupTimeSkipSystem();
    setupGalleryManagement();
    
    // 错误处理包裹的模块初始化
    try { setupArchiveApp(); } catch(e) { console.error("setupArchiveApp failed:", e); }
    try { setupWorldBookApp(); } catch(e) { console.error("setupWorldBookApp failed:", e); }
    try { setupGroupChatSystem(); } catch(e) { console.error("setupGroupChatSystem failed:", e); }
    try { setupCustomizeApp(); } catch(e) { console.error("setupCustomizeApp failed:", e); }
    try { setupTutorialApp(); } catch(e) { console.error("setupTutorialApp failed:", e); }
    
    checkForUpdates();
    setupPeekFeature();
    setupMemoryJournalScreen(); 
    setupDeleteHistoryChunk();
    setupForumBindingFeature();
    setupForumFeature();
    setupShareModal();
    setupStorageAnalysisScreen();
    setupPomodoroApp();
    setupPomodoroSettings();
    setupPomodoroGlobalSettings(); 
    setupInsWidgetAvatarModal();
    setupHeartPhotoModal();
    setupMoreCardBgModal();
    if (typeof setupShopSystem === 'function') setupShopSystem();
    // if (typeof initKeyboardDetection === 'function') initKeyboardDetection();
    if (window.BatteryInteraction) window.BatteryInteraction.init();
    if (typeof initMoreMenu === 'function') initMoreMenu();
    if (typeof setupPhoneScreen === 'function') setupPhoneScreen();
    if (typeof initCotSettings === 'function') initCotSettings();
    if (window.VideoCallModule) window.VideoCallModule.init();
    if (window.NodeSystem) window.NodeSystem.init();

    // 全局事件绑定
    const delWBBtn = document.getElementById('delete-selected-world-books-btn');
    if(delWBBtn) delWBBtn.addEventListener('click', deleteSelectedWorldBooks);
    
    const cancelWBBtn = document.getElementById('cancel-wb-multi-select-btn');
    if(cancelWBBtn) cancelWBBtn.addEventListener('click', exitWorldBookMultiSelectMode);
    
    if(window.GitHubMgr) {
        window.GitHubMgr.init();
    }

    // 自动尝试拉取模型列表
    if (window.fetchAndPopulateModels && db.apiSettings && db.apiSettings.url && db.apiSettings.key) {
        // 稍微延迟一点，确保 API 设置 DOM 已加载
        setTimeout(() => {
            window.fetchAndPopulateModels(true);
        }, 1000);
    }

    // 检查并请求持久化存储 (抗系统清理)
    if (typeof checkAndRequestPersistence === 'function') {
        setTimeout(checkAndRequestPersistence, 2000); // 延迟一点，避免与初始化逻辑冲突
    }
};

async function checkAutoReply() {
    const now = Date.now();
    for (const char of db.characters) {
        if (char.autoReply && char.autoReply.enabled) {
            const intervalMs = (char.autoReply.interval || 60) * 60 * 1000;
            const lastTriggerTime = char.autoReply.lastTriggerTime || 0;
            
            // 检查上次触发时间
            if (now - lastTriggerTime < intervalMs) continue;

            let lastMsgTime = 0;
            if (char.history && char.history.length > 0) {
                lastMsgTime = char.history[char.history.length - 1].timestamp;
            } else {
                // 如果没有历史记录，暂不触发，或者可以设置为创建时间
                continue;
            }

            // 检查无操作时间 (最后一条消息到现在的时间)
            if (now - lastMsgTime > intervalMs) {
                console.log(`Auto-reply triggered for ${char.remarkName}`);
                char.autoReply.lastTriggerTime = now;
                await saveData(); // 先保存触发时间，防止重复触发
                await getAiReply(char.id, 'private', true);
            }
        }
    }
}

// === 登录界面与逻辑 ===
function renderLoginOverlay() {
    // 防止重复生成
    if (document.getElementById('login-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'login-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
        background: rgba(0,0,0,0.85); z-index: 99999; 
        display: flex; flex-direction: column; 
        justify-content: center; align-items: center; 
        backdrop-filter: blur(5px);
    `;

    // 注入 CSS
    const style = document.createElement('style');
    style.textContent = `
        .browser {
            width: 100%;
            height: 100%;
            background: #c7cccd;
            border-radius: 0;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            position: relative;
            box-shadow: none;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            animation: fadeIn 0.3s ease-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        /* 标签栏 */
        .tabs-head {
            background-color: #bababa;
            height: 40px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            padding-left: 15px;
            padding-right: 12px;
        }

        .tabs-head .tab-open {
            width: 100px;
            height: 32px;
            border-radius: 8px 8px 0 0;
            background-color: #eaf5ff;
            display: flex;
            gap: 5px;
            align-items: center;
            justify-content: space-between;
            padding: 0 10px;
            position: relative;
        }

        .tabs-head .tab-open .rounded-l {
            position: absolute;
            background-color: #eaf5ff;
            width: 20px; height: 20px;
            bottom: 0; left: -20px;
            overflow: hidden;
        }
        .tabs-head .tab-open .rounded-l .mask-round {
            width: 100%; height: 100%;
            background-color: #bababa;
            border-radius: 0 0 10px 0;
        }

        .tabs-head .tab-open .rounded-r {
            position: absolute;
            background-color: #eaf5ff;
            width: 20px; height: 20px;
            bottom: 0; right: -20px;
            overflow: hidden;
        }
        .tabs-head .tab-open .rounded-r .mask-round {
            width: 100%; height: 100%;
            background-color: #bababa;
            border-radius: 0 0 0 10px;
        }

        .tabs-head .tab-open span { color: #555; font-size: 12px; font-weight: 600; }
        .tabs-head .tab-open .close-tab { color: #999; font-size: 10px; cursor: pointer; }

        .window-opt { display: flex; gap: 6px; margin-bottom: 10px; }
        .window-opt button {
            width: 10px; height: 10px; border-radius: 50%; border: none; padding: 0;
            cursor: pointer;
        }
        .window-opt button:nth-child(1) { background: #ff5f57; }
        .window-opt button:nth-child(2) { background: #ffbd2e; }
        .window-opt button:nth-child(3) { background: #28c940; }

        /* 地址栏 */
        .head-browser {
            background-color: #eaf5ff;
            padding: 8px 15px;
            display: flex;
            align-items: center;
            gap: 10px;
            border-bottom: 1px solid #c7e0f8;
        }
        .head-browser button { color: #888; background: none; border: none; font-size: 14px; cursor: pointer; }
        .head-browser input {
            flex: 1;
            background: #fdffff;
            border: 1px solid #c7e0f8;
            border-radius: 15px;
            height: 26px;
            padding: 0 15px;
            font-size: 12px;
            color: #666;
            outline: none;
            text-align: center;
        }

        /* 内容区域 */
        .browser-content {
            flex: 1;
            background: #fdffff;
            padding: 30px 25px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center; /* 垂直居中 */
        }

        /* 限制内容最大宽度，优化排版 */
        .login-form-container {
            width: 100%;
            max-width: 320px;
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .login-title {
            font-size: 24px;
            font-weight: 700;
            color: #555;
            margin-bottom: 8px;
            letter-spacing: 1px;
            text-align: center;
        }

        .login-divider {
            font-size: 12px;
            color: #c7e0f8;
            margin-bottom: 35px;
            font-family: monospace;
            text-align: center;
        }

        .login-input {
            width: 100%;
            padding: 14px 15px;
            margin-bottom: 18px;
            border: 2px solid #eaf5ff;
            background: #f8fdff;
            border-radius: 12px;
            font-size: 15px;
            outline: none;
            transition: all 0.3s;
            box-sizing: border-box;
            color: #555;
        }
        .login-input:focus {
            border-color: #c7e0f8;
            background: #fff;
            box-shadow: 0 0 0 4px rgba(199, 224, 248, 0.2);
        }
        .login-input::placeholder { color: #bababa; }

        .login-btn {
            width: 100%;
            padding: 14px;
            margin-top: 15px;
            background: #c7e0f8;
            color: #fff;
            border: none;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 4px 15px rgba(199, 224, 248, 0.4);
        }
        .login-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(199, 224, 248, 0.6);
            filter: brightness(0.95);
        }
        .login-btn:active { transform: translateY(1px); }

        .login-hint {
            margin-top: 20px;
            font-size: 12px;
            color: #007aff;
            text-align: center;
            line-height: 1.6;
            cursor: pointer;
            text-decoration: underline;
        }
        .login-hint:hover {
            color: #0056b3;
        }

        /* 强制弹窗样式 */
        #forced-modal-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6); z-index: 100000;
            display: flex; justify-content: center; align-items: center;
            backdrop-filter: blur(3px);
            animation: fadeIn 0.3s;
        }
        #forced-modal-window {
            background: #fff; width: 85%; max-width: 320px;
            border-radius: 12px; padding: 20px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            text-align: left;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        #forced-modal-title {
            font-size: 18px; font-weight: bold; color: #333;
            margin-bottom: 15px; text-align: center;
        }
        #forced-modal-content {
            font-size: 14px; color: #555; line-height: 1.6;
            margin-bottom: 20px;
        }
        #forced-modal-btn {
            width: 100%; padding: 12px;
            background: #ccc; color: #fff;
            border: none; border-radius: 8px;
            font-size: 14px; cursor: not-allowed;
            transition: background 0.3s;
        }
        #forced-modal-btn.active {
            background: #007aff; cursor: pointer;
        }

        #login-msg {
            margin-top: 15px;
            font-size: 13px;
            min-height: 20px;
            text-align: center;
            font-weight: 500;
        }
    `;
    document.head.appendChild(style);

    overlay.innerHTML = `
        <div class="browser">
            <div class="tabs-head">
                <div class="tabs">
                    <div class="tab-open">
                        <div class="rounded-l"><div class="mask-round"></div></div>
                        <span>UwU</span>
                        <div class="close-tab">✕</div>
                        <div class="rounded-r"><div class="mask-round"></div></div>
                    </div>
                </div>
                <div class="window-opt">
                    <button></button>
                    <button></button>
                    <button class="window-close"></button>
                </div>
            </div>

            <div class="head-browser">
                <button>←</button>
                <button style="opacity:0.5">→</button>
                <input type="text" value="UwUbibobibo.com" readonly>
                <button>⋮</button>
                <button class="star">✰</button>
            </div>

            <div class="browser-content">
                <div class="login-form-container">
                    <div class="login-title">小章鱼UwU登录系统</div>
                    <div class="login-divider">₊┈𓏴𓏴₊-୨★୧-₊𓏴𓏴┈₊</div>
                    
                    <input type="text" id="login-uid" placeholder="请输入账号 ID" class="login-input">
                    <input type="password" id="login-pwd" placeholder="请输入密码" class="login-input">
                    
                    <button id="btn-login-submit" class="login-btn">登 录</button>
                    <div class="login-hint" id="forgot-pwd-link">忘记密码？(点击查看获取方法)</div>
                    <p id="login-msg"></p>
                </div>
            </div>
        </div>
    `;

    document.body.prepend(overlay);

    // 绑定事件 (确保元素存在后才绑定)
    document.getElementById('btn-login-submit').onclick = tryLogin;
    document.getElementById('login-pwd').onkeypress = function(e) {
        if (e.key === 'Enter') tryLogin();
    };
    
    // 绑定关闭按钮（可选：清空输入）
    overlay.querySelector('.window-close').onclick = () => {
        document.getElementById('login-uid').value = '';
        document.getElementById('login-pwd').value = '';
        document.getElementById('login-msg').textContent = '';
    };

    // 忘记密码弹窗逻辑
    const forgotLink = document.getElementById('forgot-pwd-link');
    if (forgotLink) {
        forgotLink.onclick = () => {
            const modal = document.createElement('div');
            modal.id = 'forced-modal-overlay';
            modal.innerHTML = `
                <div id="forced-modal-window">
                    <div id="forced-modal-title">获取账密方法</div>
                    <div id="forced-modal-content">
                        请前往 <span style="color: #ff453a;">dc尾巴镇-ee小手机主频道</span><br>发送<span style="color: #ff453a;">/小手机</span>指令获取账密。<br><br>
                        <strong>注意事项：</strong><br>
                        1. 输入/小手机时，输入框上方会自动弹出<strong style="color: #ff453a;">小狗图标</strong>的可点击指令，点击小狗图标指令<strong style="color: #ff453a;">再点击发送</strong><br>
                        2. 如未自动出现带图标的指令，优先更新discord或使用网页端<br>
                        3. 发送指令时<strong>【仅限ee小手机频道】</strong>，其他频道无效<br>
                        4. 如发送指令未能成功获取账密，请<strong style="color: #ff453a;">自行删除</strong>那条消息
                    </div>
                    <button id="forced-modal-btn" disabled>请阅读 (10s)</button>
                </div>
            `;
            document.body.appendChild(modal);

            const btn = document.getElementById('forced-modal-btn');
            let timeLeft = 10;
            
            const timer = setInterval(() => {
                timeLeft--;
                if (timeLeft > 0) {
                    btn.textContent = `请阅读 (${timeLeft}s)`;
                } else {
                    clearInterval(timer);
                    btn.textContent = '我已了解';
                    btn.disabled = false;
                    btn.classList.add('active');
                    btn.onclick = () => modal.remove();
                }
            }, 1000);
        };
    }
}

async function tryLogin() {
    // 获取元素
    const uidEl = document.getElementById('login-uid');
    const pwdEl = document.getElementById('login-pwd');
    const msgEl = document.getElementById('login-msg');
    const btn = document.getElementById('btn-login-submit');

    // 安全检查
    if (!uidEl || !pwdEl) {
        console.error("找不到登录输入框，请刷新页面");
        return;
    }

    const uid = uidEl.value.trim();
    const pwd = pwdEl.value.trim();

    if (!uid || !pwd) {
        msgEl.textContent = "请输入完整的账号和密码";
        return;
    }

    // UI 反馈：正在验证
    msgEl.style.color = "#007aff";
    msgEl.textContent = "正在连接服务器验证...";
    const originalBtnText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "验证中...";

    try {
        // 调用新 API 验证
        const res = await fetch('https://puppy-subscription-api.zeabur.app/api/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account: uid, password: pwd })
        });

        const data = await res.json();

        if (data.success) {
            // 验证成功
            msgEl.style.color = "#32d74b";
            msgEl.textContent = "验证通过，正在进入...";

            // 保存登录状态
            localStorage.setItem('ephone_auth', 'true');

            // 初始化数据库 (无参数，使用默认库名)
            initDatabase();
            
            // 移除遮罩
            const overlay = document.getElementById('login-overlay');
            if (overlay) {
                overlay.style.transition = 'opacity 0.5s ease';
                overlay.style.opacity = '0';
                setTimeout(() => overlay.remove(), 500);
            }
            
            // 启动 App
            init(); 
        } else {
            // 验证失败
            throw new Error(data.message || '账号或密码错误');
        }
    } catch (error) {
        console.error(error);
        msgEl.style.color = "#ff453a";
        msgEl.textContent = "验证失败: " + (error.message || "网络错误");
        btn.style.background = "#ff453a";
        setTimeout(() => btn.style.background = "#007aff", 500);
    } finally {
        // 恢复按钮状态
        btn.disabled = false;
        btn.textContent = originalBtnText;
    }
}

// === 主入口 ===
document.addEventListener('DOMContentLoaded', () => {
    // 检查本地是否已登录
    const isAuth = localStorage.getItem('ephone_auth');

    if (isAuth === 'true') {
        console.log(`[Auto Login] 检测到已授权状态`);
        try {
            // 已登录：直接初始化数据库并启动
            initDatabase();
            init(); 
        } catch (e) {
            console.error("自动登录出错，重置状态:", e);
            localStorage.removeItem('ephone_auth');
            renderLoginOverlay();
        }
    } else {
        // 未登录：显示登录框
        renderLoginOverlay();
    }
});

// === 全局救援手势 (三击清空全局CSS) ===
// 将变量提升到顶层，防止混淆器错误处理闭包作用域
let globalRescueClickCount = 0;
let globalRescueLastClickTime = 0;

function setupGlobalRescueGesture() {
    const CLICK_TIMEOUT = 400; // 400ms 间隔

    document.addEventListener('click', (e) => {
        const now = Date.now();
        const gap = now - globalRescueLastClickTime;
        
        if (gap < CLICK_TIMEOUT) {
            globalRescueClickCount++;
        } else {
            globalRescueClickCount = 1;
        }
        
        
        globalRescueLastClickTime = now;

        if (globalRescueClickCount === 5) {
            console.log('[GlobalGesture] Triggering rescue panel!');
            showGlobalRescuePanel();
            globalRescueClickCount = 0;
        }
    }, true); // 使用捕获阶段，确保尽早触发
}

function showGlobalRescuePanel() {
    // 防止重复创建
    if (document.getElementById('global-rescue-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'global-rescue-panel';
    panel.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.85); z-index: 999999;
        display: flex; flex-direction: column;
        justify-content: center; align-items: center;
        backdrop-filter: blur(5px);
    `;

    panel.innerHTML = `
        <div style="background: #fff; width: 85%; max-width: 320px; border-radius: 16px; padding: 25px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
            <div style="width: 60px; height: 60px; background: #ffebee; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px;">
                <svg style="width: 32px; height: 32px; color: #d32f2f;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            </div>
            <h3 style="margin: 0 0 10px; color: #333; font-size: 18px;">全局样式救援</h3>
            <p style="margin: 0 0 20px; color: #666; font-size: 14px; line-height: 1.5;">
                检测到您快速点击了五次屏幕。<br>
                如果因为错误的全局 CSS 导致界面错乱，您可以在这里一键清空。
            </p>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <button id="rescue-clear-btn" style="background: #d32f2f; color: #fff; border: none; padding: 12px; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer;">清空全局 CSS</button>
                <button id="rescue-cancel-btn" style="background: #f5f5f5; color: #666; border: none; padding: 12px; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer;">取消</button>
            </div>
        </div>
    `;

    document.body.appendChild(panel);

    document.getElementById('rescue-clear-btn').onclick = async () => {
        if (confirm('确定要清空全局 CSS 吗？此操作不可撤销。')) {
            db.globalCss = '';
            await saveData();
            applyGlobalCss('');
            // 更新设置页面的文本框（如果存在）
            const textarea = document.getElementById('global-beautification-css');
            if (textarea) textarea.value = '';
            
            showToast('全局 CSS 已清空，界面应已恢复正常。');
            panel.remove();
        }
    };

    document.getElementById('rescue-cancel-btn').onclick = () => {
        panel.remove();
    };
}
