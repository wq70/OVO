// --- 界面交互逻辑 (js/ui.js) ---

// DOM 元素缓存 (将在脚本加载时初始化)
const screens = document.querySelectorAll('.screen');
const homeScreen = document.getElementById('home-screen');
const chatRoomScreen = document.getElementById('chat-room-screen');
const chatExpansionPanel = document.getElementById('chat-expansion-panel');
const panelFunctionArea = document.getElementById('panel-function-area');
const panelStickerArea = document.getElementById('panel-sticker-area');
const messageArea = document.getElementById('message-area');
const chatRoomHeaderDefault = document.getElementById('chat-room-header-default');
const chatRoomHeaderSelect = document.getElementById('chat-room-header-select');
const multiSelectBar = document.getElementById('multi-select-bar');
const multiSelectTitle = document.getElementById('multi-select-title');
const selectCount = document.getElementById('select-count');
const deleteSelectedBtn = document.getElementById('delete-selected-btn');
const chatRoomTitle = document.getElementById('chat-room-title');
const chatRoomStatusText = document.getElementById('chat-room-status-text');
const typingIndicator = document.getElementById('typing-indicator');
const messageInput = document.getElementById('message-input');
const getReplyBtn = document.getElementById('get-reply-btn');
const regenerateBtn = document.getElementById('regenerate-btn');

// 屏幕切换
const switchScreen = (targetId) => {
    // 离开聊天室时停止 TTS 播放，避免退出后继续读
    if (targetId !== 'chat-room-screen' && typeof MinimaxTTSService !== 'undefined' && MinimaxTTSService.stop) {
        MinimaxTTSService.stop();
    }
    // 离开聊天室时清理自定义样式
    if (targetId !== 'chat-room-screen') {
        const customStyles = document.querySelectorAll('style[id^="custom-bubble-style-for-"]');
        customStyles.forEach(style => style.remove());
    } else {
        // 返回聊天室时重新应用样式
        if (typeof currentChatId !== 'undefined' && currentChatId) {
            const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
            if (chat) {
                updateCustomBubbleStyle(currentChatId, chat.customBubbleCss, chat.useCustomBubbleCss);
            }
        }
    }
    
    screens.forEach(screen => screen.classList.remove('active'));
    const targetScreen = document.getElementById(targetId);
    if (targetScreen) targetScreen.classList.add('active');
    
    // 关闭所有覆盖层和侧边栏
    const overlays = document.querySelectorAll('.modal-overlay, .action-sheet-overlay, .settings-sidebar');
    overlays.forEach(o => o.classList.remove('visible', 'open'));

    // 离开设置页面时清空CSS预览区域，防止预览样式(可能是全局的)污染其他页面
    if (targetId !== 'chat-settings-screen' && targetId !== 'group-settings-screen') {
        const previewContainers = document.querySelectorAll('.bubble-css-preview');
        previewContainers.forEach(el => el.innerHTML = '');
    }

    // 控制全局底栏显示与状态
    const globalNav = document.getElementById('global-bottom-nav');
    if (globalNav) {
        if (targetId === 'chat-list-screen' || targetId === 'contacts-screen' || targetId === 'more-screen' || targetId === 'phone-screen') {
            globalNav.style.display = 'flex';
            // 更新选中状态
            const navItems = globalNav.querySelectorAll('.nav-item');
            navItems.forEach(item => {
                if (item.getAttribute('data-target') === targetId) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
        } else {
            globalNav.style.display = 'none';
        }
    }

    if (targetId === 'more-screen') {
        renderMoreScreen();
    }
    if (targetId === 'piggy-bank-screen' && typeof renderPiggyBankScreen === 'function') {
        renderPiggyBankScreen();
    }
    if (targetId === 'family-card-list-screen' && typeof renderFamilyCardList === 'function') {
        renderFamilyCardList();
    }
    if (targetId === 'music-screen') {
        if (typeof initMusicPlayer === 'function') initMusicPlayer();
        if (typeof onShowMusicScreen === 'function') onShowMusicScreen();
    }
    if (targetId === 'contacts-screen') {
        if (typeof renderContactList === 'function') renderContactList();
        if (typeof renderMyProfile === 'function') renderMyProfile();
    }
    if (targetId === 'appearance-settings-screen' && typeof renderAppearanceSettingsScreen === 'function') {
        renderAppearanceSettingsScreen();
    }
};

function renderMoreScreen() {
    let myName = 'User Name';
    let myAvatar = 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg';

    let activePersona = null;
    if (db.activePersonaId) {
        activePersona = db.myPersonaPresets.find(p => p.id === db.activePersonaId);
    }
    
    if (!activePersona && db.myPersonaPresets && db.myPersonaPresets.length > 0) {
        activePersona = db.myPersonaPresets[0];
    }

    if (activePersona) {
        myName = activePersona.name || 'User';
        myAvatar = activePersona.avatar || myAvatar;
    } else if (db.characters && db.characters.length > 0) {
        const firstChar = db.characters[0];
        myName = firstChar.myName || 'User Name';
        myAvatar = firstChar.myAvatar || 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg';
    }
    
    const avatarEl = document.getElementById('more-my-avatar');
    const nameEl = document.getElementById('more-my-name');
    const dateEl = document.getElementById('more-date-display');

    if (avatarEl) avatarEl.src = myAvatar;
    if (nameEl) nameEl.textContent = myName;
    
    // 更新日期显示 (格式: YYYY#MMDD)
    if (dateEl) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        dateEl.textContent = `${year}#${month}${day}`;
    }

    // 应用自定义背景图
    const bgLayer = document.querySelector('.glass-background-layer');
    if (bgLayer && db.moreProfileCardBg) {
        bgLayer.style.backgroundImage = `url('${db.moreProfileCardBg}')`;
    }

    // 触发搜索引导
    if (window.GuideSystem) {
        window.GuideSystem.check('guide_search_entry');
    }
}

function setupMoreCardBgModal() {
    const modal = document.getElementById('more-card-bg-modal');
    const form = document.getElementById('more-card-bg-form');
    const preview = document.getElementById('more-card-bg-preview');
    const urlInput = document.getElementById('more-card-bg-url-input');
    const fileUpload = document.getElementById('more-card-bg-file-upload');
    
    // 绑定点击事件到背景层
    // 注意：由于 renderMoreScreen 可能会被多次调用，我们需要使用事件委托或者确保只绑定一次
    // 这里我们使用事件委托绑定到 document，在 renderMoreScreen 中不需要重复绑定
    document.body.addEventListener('click', (e) => {
        // 只要点击了更多界面的个人卡片区域（包括背景和内容），都触发更换背景
        // 这样可以避免因为内容层遮挡背景层导致点击无效
        // 2026-01-21 修改：将点击范围限定在背景层 (glass-background-layer)，避免点击头像/名字触发
        if (e.target.classList.contains('glass-background-layer')) {
            // 打开模态框
            modal.classList.add('visible');
            urlInput.value = '';
            fileUpload.value = null;
            preview.style.backgroundImage = `url('${db.moreProfileCardBg || 'https://i.postimg.cc/XvFDdTKY/Smart-Select-20251013-023208.jpg'}')`;
            preview.innerHTML = '';
        }
    });

    // URL 输入预览
    urlInput.addEventListener('input', () => {
        if (urlInput.value) {
            preview.style.backgroundImage = `url('${urlInput.value}')`;
            preview.innerHTML = '';
        }
    });

    // 文件上传预览
    fileUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.style.backgroundImage = `url('${e.target.result}')`;
                preview.innerHTML = '';
                // 临时存储 base64，提交时使用
                fileUpload.dataset.base64 = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    // 保存
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        let newBg = db.moreProfileCardBg;

        if (fileUpload.files.length > 0 && fileUpload.dataset.base64) {
            newBg = fileUpload.dataset.base64;
        } else if (urlInput.value) {
            newBg = urlInput.value;
        }

        if (newBg !== db.moreProfileCardBg) {
            db.moreProfileCardBg = newBg;
            await saveData();
            renderMoreScreen(); // 重新渲染以应用更改
            showToast('背景已更新');
        }
        
        modal.classList.remove('visible');
        // 清理
        fileUpload.dataset.base64 = '';
    });
}

// 右键菜单
function createContextMenu(items, x, y) {
    removeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    if (items.length <= 5) {
        menu.classList.add('few-items');
    }
    
    menu.style.visibility = 'hidden';
    document.body.appendChild(menu);

    items.forEach(item => {
        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item';
        if (item.danger || item.label === '删除') menuItem.classList.add('danger');
        
        const labelDiv = document.createElement('span');
        labelDiv.textContent = item.label;

        menuItem.appendChild(labelDiv);

        menuItem.onclick = () => {
            item.action();
            removeContextMenu();
        };
        menu.appendChild(menuItem);
    });

    const rect = menu.getBoundingClientRect();
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;
    const padding = 15; // 屏幕边缘间距

    // 水平方向调整
    if (x + rect.width > winWidth - padding) {
        x = winWidth - rect.width - padding;
    }
    if (x < padding) {
        x = padding;
    }
    
    // 垂直方向调整
    if (y + rect.height > winHeight - padding) {
        // 如果下方空间不足，向上弹出
        y = y - rect.height;
    }

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.visibility = 'visible';

    document.addEventListener('click', removeContextMenu, {once: true});
}

function removeContextMenu() {
    const menu = document.querySelector('.context-menu');
    if (menu) menu.remove();
}

// 更新气泡样式
function updateCustomBubbleStyle(chatId, css, enabled) {
    const STYLE_TAG_CLASS = 'dynamic-chat-style-tag';
    const existingStyles = document.querySelectorAll(`.${STYLE_TAG_CLASS}, style[id^="custom-bubble-style-for-"]`);
    existingStyles.forEach(el => el.remove());

    if (!enabled || !css) return;

    // 获取 chat 对象以支持模板变量
    let chat = null;
    if (typeof db !== 'undefined') {
        chat = db.characters.find(c => c.id === chatId) || db.groups.find(g => g.id === chatId);
    }

    // 处理模板变量 ({{char_avatar}}, {{user_avatar}} 等)
    // processTemplate 定义在 js/utils.js 中
    const processedCss = (typeof processTemplate === 'function' && chat) ? processTemplate(css, chat) : css;

    const styleElement = document.createElement('style');
    styleElement.id = `custom-bubble-style-for-${chatId}`;
    styleElement.className = STYLE_TAG_CLASS;

    styleElement.textContent = processedCss;

    document.head.appendChild(styleElement);
}

function updateBubbleCssPreview(previewContainer, css, useDefault, theme) {
    previewContainer.innerHTML = '';

    const sentBubble = document.createElement('div');
    sentBubble.className = 'message-bubble sent';
    sentBubble.textContent = '这是我方气泡。';
    sentBubble.style.alignSelf = 'flex-end';
    sentBubble.style.borderBottomRightRadius = '5px';

    const receivedBubble = document.createElement('div');
    receivedBubble.className = 'message-bubble received';
    receivedBubble.textContent = '这是对方气泡。';
    receivedBubble.style.alignSelf = 'flex-start';
    receivedBubble.style.borderBottomLeftRadius = '5px';

    [sentBubble, receivedBubble].forEach(bubble => {
        bubble.style.maxWidth = '70%';
        bubble.style.padding = '8px 12px';
        bubble.style.wordWrap = 'break-word';
        bubble.style.lineHeight = '1.4';
    });

    if (useDefault || !css) {
        sentBubble.style.backgroundColor = theme.sent.bg;
        sentBubble.style.color = theme.sent.text;
        sentBubble.style.borderRadius = '18px';
        sentBubble.style.borderBottomRightRadius = '5px';
        receivedBubble.style.backgroundColor = theme.received.bg;
        receivedBubble.style.color = theme.received.text;
        receivedBubble.style.borderRadius = '18px';
        receivedBubble.style.borderBottomLeftRadius = '5px';
    } else {
        const styleTag = document.createElement('style');
        styleTag.textContent = `
            #${previewContainer.id} {
                ${css}
            }
        `;
        previewContainer.appendChild(styleTag);
    }
    previewContainer.appendChild(receivedBubble);
    previewContainer.appendChild(sentBubble);
}

// 主屏幕逻辑
let currentPageIndex = 0;

function setupHomeScreen() {
    const getIcon = (id) => db.customIcons[id] || defaultIcons[id].url;
    const getName = (id) => (db.customAppNames && db.customAppNames[id]) || defaultIcons[id].name;
    if (!db.insWidgetSettings) {
        db.insWidgetSettings = {
            avatar1: 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg',
            bubble1: '„- ω -„',
            avatar2: 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg',
            bubble2: 'ｷ...✩'
        };
    }
    const insWidget = db.insWidgetSettings;

    const homeScreenHTML = `
    <div class="home-screen-swiper">
        <div class="home-screen-page">
            <div class="home-widget-container">
                <div class="central-circle" style="background-image: url('${db.homeWidgetSettings.centralCircleImage}');"></div>
                <div class="satellite-oval oval-top-left" data-widget-part="topLeft">
                    <span class="satellite-emoji" contenteditable="true">${db.homeWidgetSettings.topLeft.emoji || '❤️'}</span>
                    <span class="satellite-text" contenteditable="true">${db.homeWidgetSettings.topLeft.text}</span>
                </div>
                <div class="satellite-oval oval-top-right" data-widget-part="topRight">
                    <span class="satellite-emoji" contenteditable="true">${db.homeWidgetSettings.topRight.emoji || '🧡'}</span>
                    <span class="satellite-text" contenteditable="true">${db.homeWidgetSettings.topRight.text}</span>
                </div>
                <div class="satellite-oval oval-bottom-left" data-widget-part="bottomLeft">
                    <span class="satellite-emoji" contenteditable="true">${db.homeWidgetSettings.bottomLeft.emoji || '💛'}</span>
                    <span class="satellite-text" contenteditable="true">${db.homeWidgetSettings.bottomLeft.text}</span>
                </div>
                <div class="satellite-oval oval-bottom-right" data-widget-part="bottomRight">
                    <span class="satellite-emoji" contenteditable="true">${db.homeWidgetSettings.bottomRight.emoji || '💙'}</span>
                    <span class="satellite-text" contenteditable="true">${db.homeWidgetSettings.bottomRight.text}</span>
                </div>


                <div class="widget-time" id="time-display"></div>
                <div contenteditable="true" class="widget-signature" id="widget-signature" placeholder="编辑个性签名..."></div>
                <div class="widget-date" id="date-display"></div>
                <div class="widget-battery">
                    <svg width="32" height="23" viewBox="0 0 24 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 2.5C1 1.94772 1.44772 1.5 2 1.5H20C20.5523 1.5 21 1.94772 21 2.5V9.5C21 10.0523 20.5523 10.5 20 10.5H2C1.44772 10.5 1 10.0523 1 9.5V2.5Z" stroke="#666" stroke-opacity="0.8" stroke-width="1"/>
                        <path d="M22.5 4V8" stroke="#666" stroke-opacity="0.8" stroke-width="1.5" stroke-linecap="round"/>
                        <rect id="battery-fill-rect" x="2" y="2.5" width="18" height="7" rx="0.5" fill="#666" fill-opacity="0.8"/>
                    </svg>
                    <span id="battery-level">--%</span>
                </div>
            </div>
            <div class="app-grid">
                <div class="app-grid-widget-container">
                   <div class="app-grid-widget">
                        <div class="ins-widget">
                            <div class="ins-widget-row user">
                                <img src="${insWidget.avatar1}" alt="Character Avatar" class="ins-widget-avatar" id="ins-widget-avatar-1">
                                <div class="ins-widget-bubble" id="ins-widget-bubble-1" contenteditable="true">${insWidget.bubble1}</div>
                            </div>
                            <div class="ins-widget-divider"><span>୨୧</span></div>
                            <div class="ins-widget-row character">
                                <div class="ins-widget-bubble" id="ins-widget-bubble-2" contenteditable="true">${insWidget.bubble2}</div>
                                <img src="${insWidget.avatar2}" alt="User Avatar" class="ins-widget-avatar" id="ins-widget-avatar-2">
                            </div>
                        </div>
                   </div>
                </div>
                <a href="#" class="app-icon" data-target="chat-list-screen"><img src="${getIcon('chat-list-screen')}" alt="404" class="icon-img"><span class="app-name">${getName('chat-list-screen')}</span></a>
                <a href="#" class="app-icon" data-target="api-settings-screen"><img src="${getIcon('api-settings-screen')}" alt="API" class="icon-img"><span class="app-name">${getName('api-settings-screen')}</span></a>
                <a href="#" class="app-icon" data-target="wallpaper-screen"><img src="${getIcon('wallpaper-screen')}" alt="Wallpaper" class="icon-img"><span class="app-name">${getName('wallpaper-screen')}</span></a>
                <a href="#" class="app-icon" data-target="world-book-screen"><img src="${getIcon('world-book-screen')}" alt="World Book" class="icon-img"><span class="app-name">${getName('world-book-screen')}</span></a>
                <a href="#" class="app-icon" data-target="customize-screen"><img src="${getIcon('customize-screen')}" alt="Customize" class="icon-img"><span class="app-name">${getName('customize-screen')}</span></a>
                <a href="#" class="app-icon" data-target="tutorial-screen"><img src="${getIcon('tutorial-screen')}" alt="Tutorial" class="icon-img"><span class="app-name">${getName('tutorial-screen')}</span></a>
                <div class="heart-photo-widget"></div>
            </div>
        </div>

        <div class="home-screen-page">
             <div class="app-grid">
                <a href="#" class="app-icon" data-target="pomodoro-screen">
                    <img src="${getIcon('pomodoro-screen')}" alt="番茄钟" class="icon-img">
                    <span class="app-name">${getName('pomodoro-screen')}</span>
                </a>
                <a href="#" class="app-icon" data-target="forum-screen">
                    <img src="${getIcon('forum-screen')}" alt="论坛" class="icon-img">
                    <span class="app-name">${getName('forum-screen')}</span>
                </a>
                <a href="#" class="app-icon" data-target="piggy-bank-screen">
                    <img src="${getIcon('piggy-bank-screen')}" alt="存钱罐" class="icon-img">
                    <span class="app-name">${getName('piggy-bank-screen')}</span>
                </a>
                <a href="#" class="app-icon" data-target="music-screen">
                    <img src="${getIcon('music-screen')}" alt="音乐" class="icon-img">
                    <span class="app-name">${getName('music-screen')}</span>
                </a>
                <a href="#" class="app-icon" data-target="theater-screen">
                    <img src="${getIcon('theater-screen')}" alt="小剧场" class="icon-img">
                    <span class="app-name">${getName('theater-screen')}</span>
                </a>
                <a href="#" class="app-icon" data-target="appearance-settings-screen">
                    <img src="${getIcon('appearance-settings-screen')}" alt="外观" class="icon-img">
                    <span class="app-name">${getName('appearance-settings-screen')}</span>
                </a>
                <a href="#" class="app-icon" data-action="biekan-app">
                    <img src="${getIcon('biekan-app')}" alt="别看" class="icon-img">
                    <span class="app-name">${getName('biekan-app')}</span>
                </a>
                <a href="#" class="app-icon" data-action="xiaowu-app">
                    <img src="${getIcon('xiaowu-app')}" alt="小屋" class="icon-img">
                    <span class="app-name">${getName('xiaowu-app')}</span>
                </a>
             </div>
        </div>

    </div>
    <div class="page-indicator">
        <span class="dot active" data-page="0"></span>
        <span class="dot" data-page="1"></span>
    </div>
    <div class="dock">
        <a href="#" class="app-icon" id="day-mode-btn"><img src="${getIcon('day-mode-btn')}" alt="日间" class="icon-img"></a>
        <a href="#" class="app-icon" id="night-mode-btn"><img src="${getIcon('night-mode-btn')}" alt="夜间" class="icon-img"></a>
        <a href="#" class="app-icon" data-target="storage-analysis-screen"><img src="${getIcon('storage-analysis-screen')}" alt="存储" class="icon-img"></a>
        <a href="#" class="app-icon" data-target="app-settings-screen"><img src="${getIcon('api-settings-screen')}" alt="应用设置" class="icon-img"></a>
    </div>`;
    homeScreen.innerHTML = homeScreenHTML;

    const polaroidImage = db.homeWidgetSettings?.polaroidImage;
    if (polaroidImage) {
        updatePolaroidImage(polaroidImage);
    }

    updateClock();
    applyWallpaper(db.wallpaper);
    applyHomeScreenMode(db.homeScreenMode);
    applyNightMode();
    applyHomeStatusBar();
    
    document.getElementById('day-mode-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        applyHomeScreenMode('day');
    });
    document.getElementById('night-mode-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        applyHomeScreenMode('night');
    });
    /* 外观设置：点击进入页面，由 showScreen 时调用 renderAppearanceSettingsScreen */
    document.querySelector('[data-target="world-book-screen"]').addEventListener('click', renderWorldBookList);
    document.querySelector('[data-target="customize-screen"]').addEventListener('click', renderCustomizeForm);
    document.querySelector('[data-target="tutorial-screen"]').addEventListener('click', renderTutorialContent);
    document.querySelector('[data-action="biekan-app"]')?.addEventListener('click', (e) => { e.preventDefault(); showToast('别看APP正在开发中…'); });
    document.querySelector('[data-action="xiaowu-app"]')?.addEventListener('click', (e) => { e.preventDefault(); showToast('小屋APP正在开发中…'); });
    if (typeof setupPiggyBankApp === 'function') setupPiggyBankApp();
    if (typeof setupReminderModule === 'function') setupReminderModule();

    // 主屏 app-icon 入口：拦截 main.js 全局委托中对 piggy-bank / music 的"开发中"拦截
    const piggyIcon = homeScreen.querySelector('.app-icon[data-target="piggy-bank-screen"]');
    if (piggyIcon) piggyIcon.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); switchScreen('piggy-bank-screen'); });
    const musicIcon = homeScreen.querySelector('.app-icon[data-target="music-screen"]');
    if (musicIcon) musicIcon.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); switchScreen('music-screen'); });

    updateBatteryStatus();

    const homeWidgetContainer = homeScreen.querySelector('.home-widget-container');

    // Central Circle Click
    const centralCircle = homeWidgetContainer.querySelector('.central-circle');
    if (centralCircle) {
        centralCircle.addEventListener('click', () => {
            const modal = document.getElementById('ins-widget-avatar-modal');
            const preview = document.getElementById('ins-widget-avatar-preview');
            const urlInput = document.getElementById('ins-widget-avatar-url-input');
            const fileUpload = document.getElementById('ins-widget-avatar-file-upload');
            const targetInput = document.getElementById('ins-widget-avatar-target');

            targetInput.value = 'centralCircle'; 
            preview.style.backgroundImage = `url("${db.homeWidgetSettings.centralCircleImage}")`;
            preview.innerHTML = '';
            urlInput.value = '';
            fileUpload.value = null;
            modal.classList.add('visible');
        });
    }

    // Blur to Save Logic
    homeScreen.addEventListener('blur', async (e) => {
        const target = e.target;
        if (target.hasAttribute('contenteditable')) {
            const oval = target.closest('.satellite-oval');
            if (oval) { 
                const part = oval.dataset.widgetPart;
                const prop = target.classList.contains('satellite-emoji') ? 'emoji' : 'text';
                const newValue = target.textContent.trim();

                if (db.homeWidgetSettings[part] && db.homeWidgetSettings[part][prop] !== newValue) {
                    db.homeWidgetSettings[part][prop] = newValue;
                    await saveData();
                    showToast('小组件已更新');
                }
            } else if (target.id === 'widget-signature') { 
                const newSignature = target.textContent.trim();
                if (db.homeSignature !== newSignature) {
                    db.homeSignature = newSignature;
                    await saveData();
                    showToast('签名已保存');
                }
            } else if (target.id === 'ins-widget-bubble-1' || target.id === 'ins-widget-bubble-2') { 
                 const bubbleId = target.id === 'ins-widget-bubble-1' ? 'bubble1' : 'bubble2';
                 const newText = target.textContent.trim();
                 if (db.insWidgetSettings[bubbleId] !== newText) {
                     db.insWidgetSettings[bubbleId] = newText;
                     await saveData();
                     showToast('小组件文字已保存');
                 }
            }
        }
    }, true); 
    
    const signatureWidget = document.getElementById('widget-signature');
    if (signatureWidget) {
        signatureWidget.textContent = db.homeSignature || '';
    }

    // Home Screen Swipe Logic
    const swiper = homeScreen.querySelector('.home-screen-swiper');
    let touchStartX = 0;
    let touchEndX = 0;
    const totalPages = 2;
    const swipeThreshold = 50; 
    let isDragging = false;

    swiper.style.transform = `translateX(-${currentPageIndex * 100 / totalPages}%)`;
    updatePageIndicator(currentPageIndex);

    swiper.addEventListener('touchstart', (e) => {
        if (e.target.closest('[contenteditable]')) return; 
        isDragging = true;
        touchStartX = e.changedTouches[0].screenX;
        touchEndX = e.changedTouches[0].screenX; 
    }, { passive: true });

    swiper.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        touchEndX = e.changedTouches[0].screenX;
    }, { passive: true });

    swiper.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        isDragging = false;
        handleSwipe();
    });

    swiper.addEventListener('mousedown', (e) => {
        if (e.target.closest('[contenteditable]')) return; 
        e.preventDefault();
        isDragging = true;
        touchStartX = e.screenX;
        touchEndX = e.screenX; 
        swiper.style.cursor = 'grabbing';
    });

    swiper.addEventListener('mousemove', (e) => {
        if (isDragging) {
            touchEndX = e.screenX;
        }
    });

    swiper.addEventListener('mouseup', (e) => {
        if (isDragging) {
            isDragging = false;
            swiper.style.cursor = 'grab';
            handleSwipe();
        }
    });

    swiper.addEventListener('mouseleave', (e) => {
        if (isDragging) {
            isDragging = false;
            swiper.style.cursor = 'grab';
            touchStartX = 0;
            touchEndX = 0;
        }
    });

    function handleSwipe() {
        if (touchEndX === 0 && touchStartX === 0) return; 
        
        const deltaX = touchEndX - touchStartX;

        if (Math.abs(deltaX) > swipeThreshold) {
            if (deltaX < 0 && currentPageIndex < totalPages - 1) {
                currentPageIndex++;
            } else if (deltaX > 0 && currentPageIndex > 0) {
                currentPageIndex--;
            }
        }
        
        swiper.style.transform = `translateX(-${currentPageIndex * 100 / totalPages}%)`;
        updatePageIndicator(currentPageIndex);

        touchStartX = 0;
        touchEndX = 0;
    }

    homeScreen.addEventListener('click', (e) => {
        const activeEl = document.activeElement;
        if (activeEl && activeEl.hasAttribute('contenteditable') && e.target !== activeEl) {
            activeEl.blur();
        }
    });

    homeScreen.querySelectorAll('.satellite-emoji').forEach(span => {
        span.addEventListener('input', (e) => {
            const chars = [...e.target.textContent];
            if (chars.length > 1) {
                e.target.textContent = chars[0];
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(e.target);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });
    });
}

function updateClock() {
    const now = new Date();
    const timeString = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const dateString = `${now.getFullYear()}年${pad(now.getMonth() + 1)}月${pad(now.getDate())}日`;

    const homeTimeDisplay = document.getElementById('time-display');
    const homeDateDisplay = document.getElementById('date-display');
    if (homeTimeDisplay) homeTimeDisplay.textContent = timeString;
    if (homeDateDisplay) homeDateDisplay.textContent = dateString;

    const peekTimeDisplay = document.getElementById('peek-time-display');
    const peekDateDisplay = document.getElementById('peek-date-display');
    if (peekTimeDisplay) peekTimeDisplay.textContent = timeString;
    if (peekDateDisplay) peekDateDisplay.textContent = dateString;
}

function updatePageIndicator(index) {
    const dots = document.querySelectorAll('.page-indicator .dot');
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
    });
}

function applyWallpaper(url) {
    if (homeScreen) homeScreen.style.backgroundImage = `url(${url})`;
}

async function applyHomeScreenMode(mode) {
    if (mode === 'day') {
        homeScreen.classList.add('day-mode');
    } else {
        homeScreen.classList.remove('day-mode');
    }
    db.homeScreenMode = mode;
    await saveData();
}

function applyGlobalFont(fontUrl) {
    const styleId = 'global-font-style';
    let styleElement = document.getElementById(styleId);
    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = styleId;
        document.head.appendChild(styleElement);
    }
    if (fontUrl) {
        const fontName = 'CustomGlobalFont';
        styleElement.innerHTML = `@font-face { font-family: '${fontName}'; src: url('${fontUrl}'); } :root { --font-family: '${fontName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }`;
    } else {
        styleElement.innerHTML = `:root { --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }`;
    }
}

function applyGlobalCss(css) {
    const styleId = 'global-css-style';
    let styleElement = document.getElementById(styleId);
    
    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = styleId;
        document.head.appendChild(styleElement);
    }
    
    styleElement.innerHTML = css || '';
}

function applyFontSize(scale) {
    document.documentElement.style.setProperty('--app-font-scale', scale);
}

// 统一面板控制函数
function showPanel(type) {
    triggerHapticFeedback('light');
    const toggleExpansionBtn = document.getElementById('toggle-expansion-btn');
    const panel = document.getElementById('chat-expansion-panel');

    if (type === 'none') {
        chatExpansionPanel.classList.remove('visible');
        if (toggleExpansionBtn) toggleExpansionBtn.classList.remove('rotate-45');
        return;
    }

    chatExpansionPanel.classList.add('visible');

    if (type === 'function') {
        panelFunctionArea.style.display = 'flex';
        panelStickerArea.style.display = 'none';
        
        // 初始化功能面板的分页滑动
        if (!document.querySelector('.function-swiper-wrapper')) {
            setupFunctionPanelSwiper();
        }

        if (toggleExpansionBtn) toggleExpansionBtn.classList.add('rotate-45');

        // 触发功能面板引导
        if (window.GuideSystem) {
            if (currentChatType === 'private') {
                window.GuideSystem.check('guide_char_gallery');
            } else if (currentChatType === 'group') {
                window.GuideSystem.check('guide_group_summary');
            }
        }
    } else if (type === 'sticker') {
        panelFunctionArea.style.display = 'none';
        panelStickerArea.style.display = 'flex';
        if (toggleExpansionBtn) toggleExpansionBtn.classList.remove('rotate-45');
        renderStickerCategories();
        renderStickerGrid();
    }

    setTimeout(() => {
        messageArea.scrollTop = messageArea.scrollHeight;
    }, 50);
}

function initKeyboardDetection() {
    if (!window.visualViewport) return;

    let maxViewportHeight = window.visualViewport.height;
    
    // 初始化应用保存的高度
    if (db.savedKeyboardHeight) {
        document.documentElement.style.setProperty('--panel-height', `${db.savedKeyboardHeight}px`);
    }

    window.visualViewport.addEventListener('resize', () => {
        const currentHeight = window.visualViewport.height;
        const activeElement = document.activeElement;
        const isInputFocused = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');
        
        // 如果高度变小了，且输入框聚焦，说明键盘弹出了
        if (currentHeight < maxViewportHeight && isInputFocused) {
            const diff = maxViewportHeight - currentHeight;
            // 简单的阈值判断，防止误判
            if (diff > 150) { 
                const keyboardHeight = diff;
                document.documentElement.style.setProperty('--panel-height', `${keyboardHeight}px`);
                
                // 保存到 DB (防抖)
                if (db.savedKeyboardHeight !== keyboardHeight) {
                    db.savedKeyboardHeight = keyboardHeight;
                    if (typeof saveData === 'function') {
                        saveData();
                    }
                }
            }
        } else if (currentHeight > maxViewportHeight) {
            // 可能是地址栏收起导致的高度增加，更新最大高度
            maxViewportHeight = currentHeight;
        } else if (currentHeight === maxViewportHeight && !isInputFocused) {
            // 键盘收起，高度恢复，不做处理，保持 --panel-height 为最后一次键盘高度
        }
    });
}

// 底部导航栏逻辑
function setupBottomNavigation() {
    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const targetId = item.getAttribute('data-target');
            if (targetId) {
                // 切换屏幕
                switchScreen(targetId);
                
                // 更新所有底部导航栏的选中状态
                document.querySelectorAll('.bottom-nav .nav-item').forEach(nav => {
                    if (nav.getAttribute('data-target') === targetId) {
                        nav.classList.add('active');
                    } else {
                        nav.classList.remove('active');
                    }
                });
            }
        });
    });
}

function setupPhoneScreen() {
    const bubble = document.getElementById('burnout-bubble');
    if (bubble) {
        bubble.addEventListener('click', () => {
            document.getElementById('burnout-update-modal').classList.add('visible');
        });
    }
}

function setupFunctionPanelSwiper() {
    const panelArea = document.getElementById('panel-function-area');
    const originalGrid = panelArea.querySelector('.expansion-grid');
    if (!originalGrid) return; 

    // 获取所有 expansion-item
    const items = Array.from(originalGrid.querySelectorAll('.expansion-item'));
    if (items.length === 0) return;

    // 创建新结构
    const swiperContainer = document.createElement('div');
    swiperContainer.className = 'function-swiper-container';
    
    const wrapper = document.createElement('div');
    wrapper.className = 'function-swiper-wrapper';

    const pagination = document.createElement('div');
    pagination.className = 'function-pagination';

    const itemsPerPage = 8;
    const pageCount = Math.ceil(items.length / itemsPerPage);

    for (let i = 0; i < pageCount; i++) {
        const slide = document.createElement('div');
        slide.className = 'function-slide';
        
        const pageItems = items.slice(i * itemsPerPage, (i + 1) * itemsPerPage);
        pageItems.forEach(item => slide.appendChild(item));
        
        wrapper.appendChild(slide);

        const dot = document.createElement('span');
        dot.className = `dot ${i === 0 ? 'active' : ''}`;
        dot.dataset.page = String(i);
        pagination.appendChild(dot);
    }

    // 移除旧 grid
    originalGrid.remove();

    swiperContainer.appendChild(wrapper);
    // 只有多页时才显示 pagination
    if (pageCount > 1) {
        swiperContainer.appendChild(pagination);
    }
    
    panelArea.appendChild(swiperContainer);

    // 绑定滚动事件更新 pagination
    wrapper.addEventListener('scroll', () => {
        const width = wrapper.offsetWidth;
        if (width > 0) {
            const index = Math.round(wrapper.scrollLeft / width);
            const dots = pagination.querySelectorAll('.dot');
            dots.forEach((d, i) => d.classList.toggle('active', i === index));
        }
    });

    // 点击圆点切换页
    pagination.querySelectorAll('.dot').forEach((dot, i) => {
        dot.addEventListener('click', () => {
            const width = wrapper.offsetWidth;
            wrapper.scrollTo({ left: i * width, behavior: 'smooth' });
        });
    });
}
