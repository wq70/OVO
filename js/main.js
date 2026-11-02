// --- 主程序入口 (js/main.js) ---

// 注册 Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register(new URL('sw.js', window.OVOFileUpdate?.baseUrl || window.location.href).href, { updateViaCache: 'none' })
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
            if (target === 'diary-screen' || target === 'piggy-bank-screen') {
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
    if (db.fontUrl === 'local' && db.fontBuffer) {
        applyGlobalFont('local');
    } else {
        applyGlobalFont(db.fontUrl);
    }
    applyGlobalCss(db.globalCss);
    applyFontSize(db.fontSizeScale || 1.0);
    applyPomodoroBackgrounds();
    if (typeof applyThemeSettings === 'function') applyThemeSettings();

    // 初始化各个模块
    setupGlobalRescueGesture(); // 全局救援手势
    setupHomeScreen();
    setupChatListScreen();
    setupContactsScreen();
    setupBottomNavigation();
    setupAddCharModal();
    setupChatRoom();
    setupChatSettings();
    setupArchiveApp();
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
    try { setupWorldBookApp(); } catch(e) { console.error("setupWorldBookApp failed:", e); }
    try { setupGroupChatSystem(); } catch(e) { console.error("setupGroupChatSystem failed:", e); }
    try { setupCustomizeApp(); } catch(e) { console.error("setupCustomizeApp failed:", e); }
    try { setupTutorialApp(); } catch(e) { console.error("setupTutorialApp failed:", e); }
    
    checkForUpdates();
    setupPeekFeature();
    setupMemoryJournalScreen(); 
    if (typeof setupMemoryTableScreen === 'function') setupMemoryTableScreen();
    if (typeof setupVectorMemoryScreen === 'function') setupVectorMemoryScreen();
    setupDeleteHistoryChunk();
    setupForumBindingFeature();
    setupForumFeature();
    if (window.Moments) { try { window.Moments.init(); } catch (e) { console.error('动态初始化失败:', e); } }
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
    if (window.McpManager) { window.McpManager.injectPermissionContainers(); await window.McpManager.init(); }
    if (window.VideoCallModule) window.VideoCallModule.init();
    if (typeof NodeSystem !== 'undefined') NodeSystem.init();
    if (typeof KeepAliveModule !== 'undefined') KeepAliveModule.init();
    if (window.MusicApp) await window.MusicApp.init();
    if (window.ReplyResilience) await window.ReplyResilience.init();
    if (window.PokeSystem) window.PokeSystem.init();

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
    
    if (window.fetchAndPopulateGptModels && db.gptImageSettings && db.gptImageSettings.url && db.gptImageSettings.key) {
        setTimeout(() => {
            window.fetchAndPopulateGptModels(false);
        }, 1000);
    }

    // 检查并请求持久化存储 (抗系统清理)
    if (typeof checkAndRequestPersistence === 'function') {
        setTimeout(checkAndRequestPersistence, 2000); // 延迟一点，避免与初始化逻辑冲突
    }

    // 追踪是否有正在进行的保存操作
    let _isSaving = false;
    const _origSaveData = window.saveData;
    window.saveData = async (...args) => {
        _isSaving = true;
        try {
            await _origSaveData(...args);
        } finally {
            _isSaving = false;
        }
    };

    // 用户关闭或刷新页面时，如有未完成保存则弹出提示
    window.addEventListener('beforeunload', (e) => {
        if (_isSaving) {
            e.preventDefault();
            e.returnValue = '数据正在保存中，请稍候再关闭页面...';
        }
    });
};

let autoReplyCheckRunning = false;

async function checkAutoReply() {
    if (autoReplyCheckRunning || typeof db === 'undefined' || !Array.isArray(db.characters)) return;
    if (window.StorageSaveHealth?.canRunBackground() === false) return;
    autoReplyCheckRunning = true;
    const now = Date.now();
    try {
      if (window.FollowUpReply) await window.FollowUpReply.checkDue();
      for (const char of db.characters) {
        if (char.autoReply && char.autoReply.enabled) {
            // 已排定的回复后追发优先，避免两种主动消息抢在一起发送。
            if (window.FollowUpReply && window.FollowUpReply.hasPending(char)) continue;
            const mode = char.autoReply.mode || 'fixed';
            let intervalMs;
            
            if (mode === 'random') {
                if (!char.autoReply.nextRandomIntervalMs) {
                    const min = char.autoReply.minInterval || 60;
                    const max = char.autoReply.maxInterval || 180;
                    const randomMinutes = Math.floor(Math.random() * (max - min + 1)) + min;
                    char.autoReply.nextRandomIntervalMs = randomMinutes * 60 * 1000;
                }
                intervalMs = char.autoReply.nextRandomIntervalMs;
            } else {
                intervalMs = (char.autoReply.interval || 60) * 60 * 1000;
            }
            
            const lastTriggerTime = char.autoReply.lastSuccessTime || char.autoReply.lastTriggerTime || 0;
            const retryAt = Number(char.autoReply.retryAt || 0);
            
            // 正常周期未到，且当前不是失败后的到期重试。
            if ((!retryAt || now < retryAt) && now - lastTriggerTime < intervalMs) continue;
            if (retryAt && now < retryAt) continue;
            if (typeof isInQuietHours === 'function' && isInQuietHours(char.id)) continue;

            let lastMsgTime = 0;
            if (char.history && char.history.length > 0) {
                lastMsgTime = char.history[char.history.length - 1].timestamp;
            } else {
                // 如果没有历史记录，暂不触发，或者可以设置为创建时间
                continue;
            }

            // 检查无操作时间 (最后一条消息到现在的时间)
            if (now - lastMsgTime > intervalMs) {
                console.log(`Auto-reply triggered for ${char.remarkName} (mode: ${mode}, interval: ${intervalMs/60000}m)`);
                char.autoReply.lastAttemptTime = now;
                // 先持久化尝试标记，但不提前消耗成功周期。
                if (await saveCharacter(char.id) === false) break;
                const succeeded = await getAiReply(char.id, 'private', true);
                if (succeeded) {
                    const completedAt = Date.now();
                    if (window.FollowUpReply) window.FollowUpReply.markOtherBackgroundSuccess(char, completedAt);
                    char.autoReply.lastTriggerTime = completedAt;
                    char.autoReply.lastSuccessTime = completedAt;
                    char.autoReply.retryAt = 0;
                    char.autoReply.failureCount = 0;
                    if (mode === 'random') {
                        const min = char.autoReply.minInterval || 60;
                        const max = char.autoReply.maxInterval || 180;
                        const randomMinutes = Math.floor(Math.random() * (max - min + 1)) + min;
                        char.autoReply.nextRandomIntervalMs = randomMinutes * 60 * 1000;
                    }
                } else {
                    const failureCount = Math.min(3, Number(char.autoReply.failureCount || 0) + 1);
                    char.autoReply.failureCount = failureCount;
                    // 1/3/15 分钟退避，页面恢复或联网后也会及时补检。
                    const backoffMinutes = failureCount === 1 ? 1 : failureCount === 2 ? 3 : 15;
                    char.autoReply.retryAt = Date.now() + backoffMinutes * 60 * 1000;
                }
                await saveCharacter(char.id);
            }
        }
      }
    } finally {
        autoReplyCheckRunning = false;
    }
}

// 从后台回到页面或网络恢复时做一次补检；单次补检每个角色最多触发一条。
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkAutoReply();
});
window.addEventListener('pageshow', () => { void checkAutoReply(); });
window.addEventListener('online', () => { void checkAutoReply(); });

// === 主入口 ===
document.addEventListener('DOMContentLoaded', async () => {
    try {
        initDatabase();
        await init();
        if (typeof compactLegacyChatMedia === 'function') {
            void compactLegacyChatMedia().catch(error => console.error('聊天媒体整理失败:', error));
        }
    } catch (error) {
        console.error('应用初始化失败:', error);
        if (typeof showToast === 'function') {
            showToast('应用初始化失败，请刷新页面重试', 6000);
        }
    }
});

// === 全局救援手势 (五击打开样式救援) ===
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

function getRescueChatTarget() {
    if (typeof currentChatId === 'undefined' || typeof currentChatType === 'undefined') return null;
    const type = currentChatType;
    if (type !== 'private' && type !== 'group') return null;
    const chat = (type === 'private' ? db.characters : db.groups).find(item => item.id === currentChatId);
    return chat ? { chat, type } : null;
}

async function clearRescueCss(target = null) {
    const label = target ? '当前聊天美化' : '全局 CSS';
    if (!confirm(`确定要清空${label}吗？此操作不可撤销。`)) return false;

    // 先解除页面样式，存储缓慢或失败也不应阻止用户脱困。
    if (target) {
        target.chat.customBubbleCss = '';
        target.chat.useCustomBubbleCss = false;
        updateCustomBubbleStyle(target.chat.id, '', false);
        const prefix = target.type === 'private' ? 'setting-' : 'setting-group-';
        const textarea = document.getElementById(`${prefix}custom-bubble-css`);
        const checkbox = document.getElementById(`${prefix}use-custom-css`);
        if (textarea) {
            textarea.value = '';
            textarea.disabled = true;
        }
        if (checkbox) checkbox.checked = false;
        // 设置页中的预览也可能包含导致页面错乱的 CSS。
        const preview = document.getElementById(`${target.type === 'private' ? 'private' : 'group'}-bubble-css-preview`);
        if (preview) preview.innerHTML = '';
    } else {
        db.globalCss = '';
        applyGlobalCss('');
        const textarea = document.getElementById('global-beautification-css');
        if (textarea) textarea.value = '';
    }

    showToast(`${label}已在当前页面清除，正在保存…`);
    try {
        // 只更新救援涉及的字段，保留聊天内容、其他会话和预设。
        if (target) {
            const table = target.type === 'private' ? dexieDB.characters : dexieDB.groups;
            const updated = await table.update(target.chat.id, { customBubbleCss: '', useCustomBubbleCss: false });
            if (!updated) throw new Error('聊天记录不存在');
        } else {
            await dexieDB.globalSettings.put({ key: 'globalCss', value: '' });
        }
        showToast(`${label}已清空并保存。`);
        return true;
    } catch (error) {
        console.error('[StyleRescue] 保存失败:', error);
        showToast(`${label}已在当前页面清除，但保存失败；刷新后可能恢复，请重试。`, 6000);
        return false;
    }
}

function showGlobalRescuePanel() {
    // 防止重复创建
    if (document.getElementById('global-rescue-panel')) return;

    const target = getRescueChatTarget();
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
            <h3 style="margin: 0 0 10px; color: #333; font-size: 18px;">样式救援</h3>
            <p style="margin: 0 0 20px; color: #666; font-size: 14px; line-height: 1.5;">
                检测到您快速点击了五次屏幕。<br>
                全局 CSS 与聊天美化独立生效，请清空导致界面错乱的样式。若两者都有问题，可分别清空。
            </p>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <button id="rescue-clear-btn" style="background: #d32f2f; color: #fff; border: none; padding: 12px; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer;">仅清空全局 CSS</button>
                ${target ? '<button id="rescue-clear-chat-btn" style="background: #d32f2f; color: #fff; border: none; padding: 12px; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer;">清空当前聊天美化</button>' : ''}
                <button id="rescue-cancel-btn" style="background: #f5f5f5; color: #666; border: none; padding: 12px; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer;">关闭</button>
            </div>
        </div>
    `;

    document.body.appendChild(panel);

    const bindClearButton = (id, chatTarget) => {
        const button = document.getElementById(id);
        if (!button) return;
        button.onclick = async () => {
            button.disabled = true;
            try {
                await clearRescueCss(chatTarget);
            } finally {
                button.disabled = false;
            }
        };
    };
    bindClearButton('rescue-clear-btn', null);
    bindClearButton('rescue-clear-chat-btn', target);

    document.getElementById('rescue-cancel-btn').onclick = () => {
        panel.remove();
    };
}
