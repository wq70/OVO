// 自由主屏幕的数据与手势独立于经典主屏幕，旧预设仍由 ui.js 渲染。
const FREE_HOME_APPS = [
    'chat-list-screen', 'api-settings-screen', 'wallpaper-screen', 'world-book-screen',
    'customize-screen', 'tutorial-screen', 'pomodoro-screen', 'forum-screen',
    'piggy-bank-screen', 'music-screen', 'theater-screen', 'appearance-settings-screen',
    'biekan-app'
];
const FREE_HOME_DOCK = ['day-mode-btn', 'night-mode-btn', 'storage-analysis-screen', 'magic-room-screen'];
const FREE_WIDGETS = {
    custom: { name: '自定义代码组件', cells: 4 },
    clock: { name: '时钟与日期', cells: 8, legacy: true },
    photo: { name: '拍立得照片', cells: 4 },
    note: { name: '文字卡片', cells: 4, legacy: true },
    memory: { name: '回忆组合', cells: 8 },
    ins: { name: '双人留言', cells: 4 }
};
let freeHomePage = 0;
let freeHomeEditing = false;
let freeHomeSheet = null;
let freeHomePointer = null;
let freeHomePlacement = null;
let freeHomeSuppressClick = false;
let freeHomeModulesInitialized = false;
let freeHomeLastSaved = null;
let freeHomeBattery = null;
let freeHomeBatteryPending = false;
const freeHomeHistory = [];

function freeHomeId() {
    return `fh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function freeHomeInitialLayout() {
    return {
        pages: [
            { id: freeHomeId(), items: FREE_HOME_APPS.slice(0, 8).map(appId => ({ id: freeHomeId(), type: 'app', appId })) },
            { id: freeHomeId(), items: FREE_HOME_APPS.slice(8).map(appId => ({ id: freeHomeId(), type: 'app', appId })) }
        ],
        dock: FREE_HOME_DOCK.slice()
    };
}

function freeHomeValidLayout(layout) {
    if (!layout || !Array.isArray(layout.pages) || !layout.pages.length || layout.pages.length > 30) return false;
    if (!Array.isArray(layout.dock) || layout.dock.some(id => !FREE_HOME_DOCK.includes(id))) return false;
    const ids = new Set();
    return layout.pages.every(page => {
        if (!page || !Array.isArray(page.items) || page.items.length > 16 || typeof page.id !== 'string') return false;
        return page.items.every(item => {
            if (!item || typeof item.id !== 'string' || ids.has(item.id)) return false;
            ids.add(item.id);
            if (item.type === 'app') return FREE_HOME_APPS.includes(item.appId);
            if (item.type === 'folder') return Array.isArray(item.apps) && item.apps.length >= 2 && item.apps.every(id => FREE_HOME_APPS.includes(id));
            return item.type === 'widget' && !!FREE_WIDGETS[item.widget] && (item.widget !== 'custom' || customWidgetValid(item.settings));
        }) && (page.items.every(item => Number.isInteger(item.row) && Number.isInteger(item.col))
            ? freeHomePositionsValid(page.items) : freeHomeCanFit(page.items));
    });
}

function freeHomeData() {
    if (!db.freeHomeLayout || !Array.isArray(db.freeHomeLayout.pages) || !db.freeHomeLayout.pages.length) {
        db.freeHomeLayout = freeHomeInitialLayout();
    }
    let migrated = false;
    for (const page of db.freeHomeLayout.pages) {
        const items = page.items.flatMap(item => {
            if (item.type === 'app' && item.appId === 'xiaowu-app') return [];
            if (item.type !== 'folder' || !Array.isArray(item.apps) || !item.apps.includes('xiaowu-app')) return [item];
            const apps = item.apps.filter(id => id !== 'xiaowu-app');
            if (!apps.length) return [];
            if (apps.length === 1) {
                const { name, apps: oldApps, ...rest } = item;
                return [{ ...rest, type: 'app', appId: apps[0] }];
            }
            return [{ ...item, apps }];
        });
        if (items.length !== page.items.length || items.some((item, index) => item !== page.items[index])) {
            page.items = items;
            migrated = true;
        }
        if (page.items.some(item => !Number.isInteger(item.row) || !Number.isInteger(item.col))) migrated = true;
        freeHomeEnsurePositions(page.items);
        for (const item of page.items) {
            if (item.type !== 'widget' || !['memory', 'ins', 'photo'].includes(item.widget)) continue;
            const complete = freeHomeWidgetSnapshot(item.widget, item.settings);
            if (JSON.stringify(item.settings) !== JSON.stringify(complete)) {
                item.settings = complete;
                migrated = true;
            }
        }
    }
    if (migrated) saveGlobalSettings(['freeHomeLayout']);
    return db.freeHomeLayout;
}

function freeHomeWidgetSnapshot(widget, settings = {}) {
    const value = settings && typeof settings === 'object' ? settings : {};
    if (widget === 'photo') return { ...value, image: value.image ?? db.homeWidgetSettings?.polaroidImage ?? 'https://i.postimg.cc/XvFDdTKY/Smart-Select-20251013-023208.jpg' };
    if (widget === 'ins') {
        const classic = db.insWidgetSettings || {};
        return {
            ...value,
            avatar1: value.avatar1 ?? classic.avatar1 ?? 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg',
            avatar2: value.avatar2 ?? classic.avatar2 ?? 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg',
            bubble1: value.bubble1 ?? classic.bubble1 ?? 'love u.',
            bubble2: value.bubble2 ?? classic.bubble2 ?? 'miss u.'
        };
    }
    if (widget === 'memory') {
        const classic = db.homeWidgetSettings || defaultWidgetSettings;
        const result = { ...value, image: value.image ?? classic.centralCircleImage ?? defaultWidgetSettings.centralCircleImage, signature: value.signature ?? db.homeSignature ?? '' };
        for (const part of ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']) {
            result[part] = { emoji: value[part]?.emoji ?? classic[part]?.emoji ?? defaultWidgetSettings[part].emoji, text: value[part]?.text ?? classic[part]?.text ?? defaultWidgetSettings[part].text };
        }
        return result;
    }
    return JSON.parse(JSON.stringify(value));
}

function freeHomeSave() {
    const snapshot = JSON.stringify(freeHomeData());
    if (freeHomeLastSaved && freeHomeLastSaved !== snapshot) {
        freeHomeHistory.push(freeHomeLastSaved);
        if (freeHomeHistory.length > 20) freeHomeHistory.shift();
    }
    freeHomeLastSaved = snapshot;
    return saveGlobalSettings(['homeLayoutMode', 'freeHomeLayout']);
}

function freeHomeUndo() {
    const previous = freeHomeHistory.pop();
    if (!previous) { showToast('没有可撤销的操作'); return; }
    db.freeHomeLayout = JSON.parse(previous);
    freeHomeLastSaved = previous;
    freeHomePage = Math.min(freeHomePage, db.freeHomeLayout.pages.length - 1);
    saveGlobalSettings(['freeHomeLayout']);
    renderFreeHomeScreen();
    showToast('已撤销上次布局操作');
}

function freeHomeCellCount(item) {
    return item.type === 'widget' ? (item.size === 'wide' ? 8 : item.size === 'square' ? 4 : (FREE_WIDGETS[item.widget]?.cells || 4)) : 1;
}

function freeHomeSize(item) {
    const cells = freeHomeCellCount(item);
    return { width: cells === 8 ? 4 : cells === 4 ? 2 : 1, height: cells === 1 ? 1 : 2 };
}

function freeHomeAreaFree(cells, item, row, col) {
    const { width, height } = freeHomeSize(item);
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row + height > 4 || col + width > 4) return false;
    for (let y = row; y < row + height; y++) for (let x = col; x < col + width; x++) if (cells[y][x]) return false;
    return true;
}

function freeHomeMarkArea(cells, item, row, col) {
    const { width, height } = freeHomeSize(item);
    for (let y = row; y < row + height; y++) for (let x = col; x < col + width; x++) cells[y][x] = true;
}

function freeHomeFirstSpace(cells, item) {
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
        if (freeHomeAreaFree(cells, item, row, col)) return { row, col };
    }
    return null;
}

function freeHomePositionsValid(items) {
    if (!items.every(item => Number.isInteger(item.row) && Number.isInteger(item.col))) return true; // 旧预设按原顺序迁移
    const cells = Array.from({ length: 4 }, () => Array(4).fill(false));
    return items.every(item => {
        if (!freeHomeAreaFree(cells, item, item.row, item.col)) return false;
        freeHomeMarkArea(cells, item, item.row, item.col);
        return true;
    });
}

function freeHomeEnsurePositions(items) {
    if (items.every(item => Number.isInteger(item.row) && Number.isInteger(item.col)) && freeHomePositionsValid(items)) return true;
    const cells = Array.from({ length: 4 }, () => Array(4).fill(false));
    for (const item of items) {
        const position = freeHomeFirstSpace(cells, item);
        if (!position) return false;
        Object.assign(item, position);
        freeHomeMarkArea(cells, item, position.row, position.col);
    }
    return true;
}

function freeHomePlace(items, moving, row, col) {
    const cells = Array.from({ length: 4 }, () => Array(4).fill(false));
    if (!freeHomeAreaFree(cells, moving, row, col)) return null;
    freeHomeMarkArea(cells, moving, row, col);
    const positions = new Map([[moving.id, { row, col }]]);
    for (const item of items) {
        if (item.id === moving.id) continue;
        const desired = freeHomeAreaFree(cells, item, item.row, item.col) ? { row: item.row, col: item.col } : freeHomeFirstSpace(cells, item);
        if (!desired) return null;
        positions.set(item.id, desired);
        freeHomeMarkArea(cells, item, desired.row, desired.col);
    }
    return positions;
}

function freeHomeReflow(items) {
    for (const item of items) { delete item.row; delete item.col; }
    return freeHomeEnsurePositions(items);
}

function freeHomeCanFit(items) {
    const cells = Array.from({ length: 4 }, () => Array(4).fill(false));
    for (const item of items) {
        const width = freeHomeCellCount(item) === 8 ? 4 : freeHomeCellCount(item) === 4 ? 2 : 1;
        const height = freeHomeCellCount(item) === 1 ? 1 : 2;
        let placed = false;
        for (let row = 0; row <= 4 - height && !placed; row++) {
            for (let col = 0; col <= 4 - width && !placed; col++) {
                let fits = true;
                for (let y = row; y < row + height; y++) for (let x = col; x < col + width; x++) if (cells[y][x]) fits = false;
                if (fits) {
                    for (let y = row; y < row + height; y++) for (let x = col; x < col + width; x++) cells[y][x] = true;
                    placed = true;
                }
            }
        }
        if (!placed) return false;
    }
    return true;
}

function freeHomeClassifyDrop(source, target, fractionX, fractionY, folderArmed = false) {
    if (!source || !target) return { intent: 'append', folderEligible: false, after: false };
    const gap = fractionX < .16 || fractionX > .84;
    const folderEligible = source.type === 'app' && (target.type === 'app' || target.type === 'folder')
        && !gap && fractionY >= .12 && fractionY <= .88;
    return {
        intent: folderEligible ? (folderArmed ? 'folder' : 'swap')
            : (gap || source.type === 'widget' || target.type === 'widget' ? 'insert' : 'swap'),
        folderEligible,
        after: gap && fractionX > .84
    };
}

function freeHomeUsed(page, excludingId) {
    return page.items.reduce((sum, item) => sum + (item.id === excludingId ? 0 : freeHomeCellCount(item)), 0);
}

function freeHomeFind(id) {
    for (const page of freeHomeData().pages) {
        const index = page.items.findIndex(item => item.id === id);
        if (index !== -1) return { page, index, item: page.items[index] };
    }
    return null;
}

function freeHomeElement(tag, className, textValue) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (textValue !== undefined) element.textContent = textValue;
    return element;
}

function freeHomeAppName(id) {
    return (db.customAppNames && db.customAppNames[id]) || defaultIcons[id]?.name || id;
}

function freeHomeIcon(id) {
    return (db.customIcons && db.customIcons[id]) || defaultIcons[id]?.url || '';
}

function freeHomeClassicWidget(item) {
    const settings = freeHomeWidgetSnapshot(item.widget, item.settings);
    if (item.widget === 'photo') {
        const photo = freeHomeElement('div', 'heart-photo-widget');
        photo.style.setProperty('--free-home-photo-image', `url(${JSON.stringify(settings.image)})`);
        if (!settings.image) photo.append(freeHomeElement('span', 'free-home-photo-placeholder', '选择照片'));
        return photo;
    }
    if (item.widget === 'ins') {
        const shell = freeHomeElement('div', 'app-grid-widget');
        const widget = freeHomeElement('div', 'ins-widget');
        const first = freeHomeElement('div', 'ins-widget-row user');
        const avatar1 = freeHomeElement(settings.avatar1 ? 'img' : 'span', 'ins-widget-avatar');
        if (settings.avatar1) { avatar1.src = settings.avatar1; avatar1.alt = ''; }
        else { avatar1.classList.add('free-home-image-placeholder'); avatar1.textContent = '头像'; }
        first.append(avatar1, freeHomeElement('div', 'ins-widget-bubble', settings.bubble1));
        const divider = freeHomeElement('div', 'ins-widget-divider');
        divider.append(freeHomeElement('span', '', '୨୧'));
        const second = freeHomeElement('div', 'ins-widget-row character');
        const avatar2 = freeHomeElement(settings.avatar2 ? 'img' : 'span', 'ins-widget-avatar');
        if (settings.avatar2) { avatar2.src = settings.avatar2; avatar2.alt = ''; }
        else { avatar2.classList.add('free-home-image-placeholder'); avatar2.textContent = '头像'; }
        second.append(freeHomeElement('div', 'ins-widget-bubble', settings.bubble2), avatar2);
        widget.append(first, divider, second); shell.append(widget);
        return shell;
    }
    const stage = freeHomeElement('div', 'free-home-memory-stage');
    const widget = freeHomeElement('div', 'home-widget-container');
    const circle = freeHomeElement('div', 'central-circle');
    circle.style.backgroundImage = `url(${JSON.stringify(settings.image)})`;
    if (!settings.image) { circle.classList.add('free-home-image-placeholder'); circle.textContent = '选择图片'; }
    widget.append(circle);
    for (const [part, klass] of [['topLeft', 'oval-top-left'], ['topRight', 'oval-top-right'], ['bottomLeft', 'oval-bottom-left'], ['bottomRight', 'oval-bottom-right']]) {
        const oval = freeHomeElement('div', `satellite-oval ${klass}`);
        oval.append(freeHomeElement('span', 'satellite-emoji', settings[part].emoji), freeHomeElement('span', 'satellite-text', settings[part].text));
        widget.append(oval);
    }
    const now = new Date();
    widget.append(freeHomeElement('div', 'widget-time', `${pad(now.getHours())}:${pad(now.getMinutes())}`));
    const signature = freeHomeElement('div', 'widget-signature', settings.signature);
    signature.setAttribute('placeholder', '编辑个性签名...');
    widget.append(signature);
    widget.append(freeHomeElement('div', 'widget-date', `${now.getFullYear()}年${pad(now.getMonth() + 1)}月${pad(now.getDate())}日`));
    const battery = freeHomeElement('div', 'widget-battery');
    battery.innerHTML = '<svg width="32" height="23" viewBox="0 0 24 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 2.5C1 1.94772 1.44772 1.5 2 1.5H20C20.5523 1.5 21 1.94772 21 2.5V9.5C21 10.0523 20.5523 10.5 20 10.5H2C1.44772 10.5 1 10.0523 1 9.5V2.5Z" stroke="#666" stroke-opacity="0.8" stroke-width="1"/><path d="M22.5 4V8" stroke="#666" stroke-opacity="0.8" stroke-width="1.5" stroke-linecap="round"/><rect class="free-home-battery-fill" x="2" y="2.5" width="18" height="7" rx="0.5" fill="#666" fill-opacity="0.8"/></svg>';
    battery.append(freeHomeElement('span', 'free-home-battery-level', '--%'));
    widget.append(battery); stage.append(widget);
    return stage;
}

function freeHomeMakeTile(item) {
    const tile = freeHomeElement('div', `free-home-tile free-home-${item.type}`);
    tile.dataset.itemId = item.id;
    if (Number.isInteger(item.row) && Number.isInteger(item.col)) {
        tile.style.gridRow = `${item.row + 1} / span ${freeHomeSize(item).height}`;
        tile.style.gridColumn = `${item.col + 1} / span ${freeHomeSize(item).width}`;
    }
    if (item.type === 'widget') {
        tile.classList.add(freeHomeCellCount(item) === 8 ? 'free-home-widget-wide' : 'free-home-widget-square');
        tile.classList.add(`free-home-kind-${item.widget}`);
        if (item.widget === 'custom') {
            tile.append(customWidgetFrame(item, !freeHomeFind(item.id)));
        } else if (['memory', 'ins', 'photo'].includes(item.widget)) {
            tile.classList.add('free-home-classic-widget');
            tile.append(freeHomeClassicWidget(item));
        } else {
            const content = freeHomeElement('div', 'free-home-widget-content');
            if (item.widget === 'clock') {
                const now = new Date();
                content.append(freeHomeElement('strong', 'free-home-clock', `${pad(now.getHours())}:${pad(now.getMinutes())}`), freeHomeElement('span', 'free-home-date', `${now.getFullYear()}年${pad(now.getMonth() + 1)}月${pad(now.getDate())}日`));
            } else if (item.widget === 'note') {
                content.append(freeHomeElement('span', 'free-home-note', item.settings?.text || '点击编辑文字'));
            }
            tile.append(content);
        }
        const manage = freeHomeElement('button', 'free-home-tile-manage', '⋯');
        manage.type = 'button';
        manage.setAttribute('aria-label', '编辑小组件');
        tile.append(manage);
    } else if (item.type === 'folder') {
        const preview = freeHomeElement('div', 'free-home-folder-preview');
        (item.apps || []).slice(0, 4).forEach(appId => {
            const img = freeHomeElement('img', '');
            img.src = freeHomeIcon(appId);
            img.alt = '';
            preview.append(img);
        });
        tile.append(preview, freeHomeElement('span', 'app-name', item.name || '文件夹'));
    } else {
        const img = freeHomeElement('img', 'icon-img');
        img.src = freeHomeIcon(item.appId);
        img.alt = '';
        img.draggable = false;
        tile.append(img, freeHomeElement('span', 'app-name', freeHomeAppName(item.appId)));
    }
    return tile;
}

function freeHomeSetPage(index, animate = true) {
    const layout = freeHomeData();
    if (freeHomePlacement && index !== freeHomePage) {
        const previousGrid = homeScreen.querySelector(`.free-home-page[data-page-index="${freeHomePage}"] .free-home-grid`);
        layout.pages[freeHomePage]?.items.forEach(item => {
            const tile = [...(previousGrid?.querySelectorAll('.free-home-tile[data-item-id]') || [])].find(el => el.dataset.itemId === item.id);
            if (tile) { tile.style.gridRow = `${item.row + 1} / span ${freeHomeSize(item).height}`; tile.style.gridColumn = `${item.col + 1} / span ${freeHomeSize(item).width}`; }
        });
    }
    freeHomePage = Math.max(0, Math.min(index, layout.pages.length - 1));
    const track = homeScreen.querySelector('.free-home-track');
    if (track) {
        track.style.transition = animate ? '' : 'none';
        track.style.transform = `translate3d(-${freeHomePage * 100}%,0,0)`;
    }
    homeScreen.querySelectorAll('.free-home-dot').forEach((dot, i) => dot.classList.toggle('active', i === freeHomePage));
    const previous = homeScreen.querySelector('[data-home-action="placement-prev"]');
    if (previous) previous.disabled = freeHomePage === 0;
    const next = homeScreen.querySelector('[data-home-action="placement-next"]');
    if (next) next.textContent = freeHomePage === layout.pages.length - 1 ? '新增页' : '下一页';
    if (freeHomePlacement) freeHomePreviewFirstSpace();
}

function freeHomeUpdateClocks() {
    const now = new Date();
    homeScreen.querySelectorAll('.free-home-clock').forEach(el => el.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`);
    homeScreen.querySelectorAll('.free-home-date').forEach(el => el.textContent = `${now.getFullYear()}年${pad(now.getMonth() + 1)}月${pad(now.getDate())}日`);
    homeScreen.querySelectorAll('.free-home-memory-stage .widget-time').forEach(el => el.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`);
    homeScreen.querySelectorAll('.free-home-memory-stage .widget-date').forEach(el => el.textContent = `${now.getFullYear()}年${pad(now.getMonth() + 1)}月${pad(now.getDate())}日`);
}

function freeHomeFitClassicWidgets(root = document) {
    root.querySelectorAll('.free-home-memory-stage').forEach(stage => {
        const tile = stage.closest('.free-home-tile');
        if (!tile) return;
        const scale = Math.min(1, tile.clientWidth / 354, tile.clientHeight / 230);
        stage.style.setProperty('--free-home-memory-scale', String(Math.max(0, scale)));
    });
}

function freeHomeUpdateBattery() {
    const widgets = document.querySelectorAll('.free-home-memory-stage .widget-battery');
    if (!widgets.length) return;
    if (!('getBattery' in navigator)) { widgets.forEach(el => el.style.display = 'none'); return; }
    const update = () => {
        if (!freeHomeBattery) return;
        const level = Math.floor(freeHomeBattery.level * 100);
        document.querySelectorAll('.free-home-memory-stage .free-home-battery-level').forEach(el => el.textContent = `${level}%`);
        document.querySelectorAll('.free-home-memory-stage .free-home-battery-fill').forEach(el => {
            el.setAttribute('width', 18 * freeHomeBattery.level);
            el.setAttribute('fill', freeHomeBattery.charging ? '#4CAF50' : level <= 20 ? '#f44336' : '#666');
        });
    };
    if (freeHomeBattery) { update(); return; }
    if (freeHomeBatteryPending) return;
    freeHomeBatteryPending = true;
    navigator.getBattery().then(battery => {
        freeHomeBattery = battery;
        battery.addEventListener('levelchange', update);
        battery.addEventListener('chargingchange', update);
        update();
    }).catch(() => document.querySelectorAll('.free-home-memory-stage .widget-battery').forEach(el => el.style.display = 'none'));
}

function freeHomeShowEditingControls() {
    homeScreen.classList.add('free-home-editing');
    const toolbar = homeScreen.querySelector('.free-home-toolbar');
    if (toolbar && !toolbar.children.length) {
        for (const [label, action] of [['＋ 小组件', 'widgets'], ['撤销', 'undo'], ['完成', 'done']]) {
            const button = freeHomeElement('button', 'free-home-toolbar-btn', label);
            button.type = 'button'; button.dataset.homeAction = action;
            if (action === 'undo') button.disabled = freeHomeHistory.length === 0;
            toolbar.append(button);
        }
    }
    const controls = homeScreen.querySelector('.free-home-page-controls');
    if (controls && !controls.querySelector('.free-home-edit-actions')) {
        const actions = freeHomeElement('div', 'free-home-edit-actions');
        for (const [label, action] of [['管理页面', 'pages'], ['创建文件夹', 'create-folder']]) {
            const button = freeHomeElement('button', 'free-home-pages-btn', label);
            button.type = 'button'; button.dataset.homeAction = action; actions.append(button);
        }
        controls.prepend(actions);
    }
}

function renderFreeHomeScreen() {
    const layout = freeHomeData();
    if (freeHomeLastSaved === null) freeHomeLastSaved = JSON.stringify(layout);
    homeScreen.classList.add('free-home-active');
    homeScreen.classList.toggle('free-home-editing', freeHomeEditing);
    homeScreen.classList.toggle('free-home-placing', !!freeHomePlacement);
    homeScreen.replaceChildren();
    const toolbar = freeHomeElement('div', 'free-home-toolbar');
    if (freeHomeEditing && !freeHomePlacement) {
        const left = freeHomeElement('button', 'free-home-toolbar-btn', '＋ 小组件');
        left.type = 'button'; left.dataset.homeAction = 'widgets'; toolbar.append(left);
        const undo = freeHomeElement('button', 'free-home-toolbar-btn', '撤销');
        undo.type = 'button'; undo.dataset.homeAction = 'undo';
        undo.disabled = freeHomeHistory.length === 0;
        toolbar.append(undo);
        const done = freeHomeElement('button', 'free-home-toolbar-btn', '完成');
        done.type = 'button'; done.dataset.homeAction = 'done'; toolbar.append(done);
    }
    const viewport = freeHomeElement('div', 'free-home-viewport');
    const track = freeHomeElement('div', 'free-home-track');
    layout.pages.forEach((page, index) => {
        const pageEl = freeHomeElement('div', 'free-home-page');
        pageEl.dataset.pageId = page.id;
        pageEl.dataset.pageIndex = index;
        const grid = freeHomeElement('div', 'free-home-grid');
        page.items.forEach(item => grid.append(freeHomeMakeTile(item)));
        if (freeHomePlacement && index === freeHomePage) {
            const preview = freeHomeMakeTile(freeHomePlacement.item);
            preview.classList.add('free-home-placement-preview');
            preview.removeAttribute('data-item-id');
            grid.append(preview);
        }
        pageEl.append(grid);
        track.append(pageEl);
    });
    viewport.append(track);
    const controls = freeHomeElement('div', 'free-home-page-controls');
    if (freeHomeEditing) {
        const actions = freeHomeElement('div', 'free-home-edit-actions');
        const pages = freeHomeElement('button', 'free-home-pages-btn', '管理页面');
        pages.type = 'button'; pages.dataset.homeAction = 'pages'; actions.append(pages);
        if (!freeHomePlacement) {
            const folder = freeHomeElement('button', 'free-home-pages-btn', '创建文件夹');
            folder.type = 'button'; folder.dataset.homeAction = 'create-folder'; actions.append(folder);
        }
        if (freeHomePlacement) {
            for (const [label, action] of [['上一页', 'placement-prev'], ['下一页', 'placement-next']]) {
                const button = freeHomeElement('button', 'free-home-pages-btn', label);
                button.type = 'button'; button.dataset.homeAction = action; actions.append(button);
            }
        }
        controls.append(actions);
    }
    const dots = freeHomeElement('div', 'free-home-dots');
    layout.pages.forEach((_, i) => {
        const dot = freeHomeElement('button', 'free-home-dot');
        dot.type = 'button'; dot.dataset.homePage = i;
        dot.setAttribute('aria-label', `第 ${i + 1} 页`);
        dots.append(dot);
    });
    controls.append(dots);
    if (freeHomePlacement) {
        const placementBar = freeHomeElement('div', 'free-home-placement-bar');
        const cancel = freeHomeElement('button', 'free-home-pages-btn', '取消');
        cancel.type = 'button'; cancel.dataset.homeAction = 'cancel-placement';
        const hint = freeHomeElement('span', 'free-home-placement-hint', '点按或拖动选择位置');
        const confirm = freeHomeElement('button', 'free-home-pages-btn', '放在这里');
        confirm.type = 'button'; confirm.dataset.homeAction = 'confirm-placement';
        placementBar.append(cancel, hint, confirm); controls.append(placementBar);
    }
    const dock = freeHomeElement('div', 'dock free-home-dock');
    layout.dock.forEach(id => {
        const icon = freeHomeElement('a', 'app-icon');
        icon.href = '#';
        icon.dataset.homeDock = id;
        if (id === 'day-mode-btn' || id === 'night-mode-btn') icon.id = id;
        else if (id === 'magic-room-screen') icon.dataset.action = 'magic-room-app';
        else icon.dataset.target = id;
        const img = freeHomeElement('img', 'icon-img');
        img.src = freeHomeIcon(id); img.alt = freeHomeAppName(id);
        icon.append(img); dock.append(icon);
    });
    homeScreen.append(toolbar, viewport, controls, dock);
    freeHomeFitClassicWidgets(homeScreen);
    if (freeHomePlacement) freeHomePlacement.last = null;
    freeHomeSetPage(freeHomePage, false);
    applyWallpaper(db.wallpaper);
    homeScreen.classList.toggle('day-mode', db.homeScreenMode === 'day');
    applyNightMode();
    freeHomeUpdateClocks();
    freeHomeUpdateBattery();
    homeScreen.querySelector('#day-mode-btn')?.addEventListener('click', e => { e.preventDefault(); applyHomeScreenMode('day'); });
    homeScreen.querySelector('#night-mode-btn')?.addEventListener('click', e => { e.preventDefault(); applyHomeScreenMode('night'); });
    homeScreen.querySelector('[data-action="magic-room-app"]')?.addEventListener('click', e => {
        e.preventDefault();
        if (typeof setupMagicRoomApp === 'function') setupMagicRoomApp();
        switchScreen('magic-room-screen');
    });
    if (!freeHomeModulesInitialized) {
        freeHomeModulesInitialized = true;
        applyHomeStatusBar();
        if (typeof setupPiggyBankApp === 'function') setupPiggyBankApp();
        if (typeof setupReminderModule === 'function') setupReminderModule();
    }
}

function freeHomeCloseSheet() {
    freeHomeSheet?.remove();
    freeHomeSheet = null;
}

function freeHomeOpenSheet(title, build, centered = false) {
    freeHomeCloseSheet();
    const overlay = freeHomeElement('div', `free-home-sheet-overlay${centered ? ' free-home-sheet-centered' : ''}`);
    const sheet = freeHomeElement('div', 'free-home-sheet');
    sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
    const head = freeHomeElement('div', 'free-home-sheet-head');
    head.append(freeHomeElement('strong', '', title));
    const close = freeHomeElement('button', 'free-home-sheet-close', '关闭');
    close.type = 'button'; close.onclick = freeHomeCloseSheet; head.append(close);
    sheet.append(head); build(sheet);
    overlay.append(sheet);
    overlay.addEventListener('click', e => { if (e.target === overlay) freeHomeCloseSheet(); });
    document.body.append(overlay);
    freeHomeSheet = overlay;
}

function freeHomeSheetButton(parent, label, action, detail) {
    const button = freeHomeElement('button', 'free-home-sheet-row');
    button.type = 'button';
    button.append(freeHomeElement('span', '', label));
    if (detail) button.append(freeHomeElement('small', '', detail));
    button.onclick = action;
    parent.append(button);
    return button;
}

function freeHomeSwitchMode(mode) {
    if (mode === db.homeLayoutMode) return;
    if (freeHomePlacement) freeHomeCancelPlacement();
    freeHomeEditing = false;
    freeHomeCloseSheet();
    db.homeLayoutMode = mode;
    if (mode === 'free') freeHomeData();
    homeScreen.classList.toggle('free-home-active', mode === 'free');
    setupHomeScreen();
    freeHomeSave();
    if (typeof renderCustomizeForm === 'function' && document.getElementById('customize-screen')?.classList.contains('active')) {
        renderCustomizeForm();
        document.querySelector('#customize-form [data-tab="desktop"]')?.click();
    }
    showToast(mode === 'free' ? '已切换到自由布局' : '已切换到经典布局');
}

function freeHomeOpenLayoutSheet() {
    freeHomeOpenSheet('主屏布局', sheet => {
        freeHomeSheetButton(sheet, '经典布局', () => freeHomeSwitchMode('classic'), '保留原有小组件和预设位置');
        freeHomeSheetButton(sheet, '自由布局', () => freeHomeSwitchMode('free'), '拖动 APP、文件夹与小组件');
    });
}

function freeHomeOpenWidgetPicker() {
    freeHomeOpenSheet('添加小组件', sheet => {
        freeHomeSheetButton(sheet, '制作小组件 · HTML / CSS / JS', () => customWidgetEditor());
        freeHomeSheetButton(sheet, '桌面预设 · 保存 / 导出 / 导入', () => freeHomeOpenDesktopPresets(), '全部页面');
        freeHomeSheetButton(sheet, '多选导出小组件预设', () => freeHomeExportSelection('widget'));
        Object.entries(FREE_WIDGETS).filter(([key, info]) => !info.legacy && key !== 'custom').forEach(([widget, info]) => {
            const choice = freeHomeElement('button', 'free-home-widget-choice');
            choice.type = 'button';
            const preview = freeHomeMakeTile({ id: 'preview', type: 'widget', widget, settings: freeHomeWidgetSnapshot(widget) });
            preview.querySelector('.free-home-tile-manage')?.remove();
            choice.append(preview);
            choice.append(freeHomeElement('span', '', info.name), freeHomeElement('small', '', info.cells === 8 ? '横向 · 4×2 格' : '方形 · 2×2 格'));
            choice.onclick = () => freeHomeStartPlacement({ id: freeHomeId(), type: 'widget', widget, settings: freeHomeWidgetSnapshot(widget) });
            sheet.append(choice);
        });
        const presets = Array.isArray(db.freeHomeWidgetPresets) ? db.freeHomeWidgetPresets.filter(preset => preset && FREE_WIDGETS[preset.widget]) : [];
        const availablePresets = presets.filter(preset => !FREE_WIDGETS[preset.widget].legacy);
        if (availablePresets.length) sheet.append(freeHomeElement('strong', 'free-home-sheet-subtitle', '我的小组件预设'));
        availablePresets.forEach(preset => {
            const row = freeHomeElement('div', 'free-home-preset-row');
            const add = freeHomeElement('button', 'free-home-widget-choice');
            const preview = preset.widget === 'custom' ? freeHomeElement('div', 'free-home-tile free-home-code-cover', 'HTML / CSS / JS') : freeHomeMakeTile({ id: 'preset-preview', type: 'widget', widget: preset.widget, size: preset.size, settings: preset.settings || {} });
            preview.querySelector('.free-home-tile-manage')?.remove();
            add.append(preview);
            add.append(freeHomeElement('span', '', preset.name), freeHomeElement('small', '', FREE_WIDGETS[preset.widget]?.name || '小组件'));
            add.type = 'button'; add.onclick = () => freeHomeStartPlacement({ id: freeHomeId(), type: 'widget', widget: preset.widget, size: preset.size, settings: freeHomeWidgetSnapshot(preset.widget, preset.settings) });
            row.append(add);
            const manage = freeHomeElement('button', 'free-home-mini-btn', '管理');
            manage.type = 'button'; manage.onclick = () => freeHomeManageWidgetPreset(preset.id);
            row.append(manage); sheet.append(row);
        });
        const oldPresets = presets.filter(preset => FREE_WIDGETS[preset.widget].legacy);
        if (oldPresets.length) sheet.append(freeHomeElement('strong', 'free-home-sheet-subtitle', '旧组件预设（仅供管理）'));
        oldPresets.forEach(preset => {
            const row = freeHomeElement('div', 'free-home-preset-row');
            row.append(freeHomeElement('span', 'free-home-legacy-preset-name', preset.name));
            const manage = freeHomeElement('button', 'free-home-mini-btn', '管理');
            manage.type = 'button'; manage.onclick = () => freeHomeManageWidgetPreset(preset.id);
            row.append(manage); sheet.append(row);
        });
        const importLabel = freeHomeElement('label', 'free-home-upload-btn', '导入小组件预设');
        const input = freeHomeElement('input', 'free-home-hidden-file');
        input.type = 'file'; input.accept = '.json,application/json';
        input.onchange = () => freeHomeImportWidgetPreset(input.files?.[0]);
        importLabel.append(input); sheet.append(importLabel);
    });
    freeHomeFitClassicWidgets(freeHomeSheet);
    freeHomeUpdateBattery();
}

function freeHomeAskName(title, initial, callback) {
    freeHomeOpenSheet(title, sheet => {
        const label = freeHomeElement('label', 'free-home-field-label', '名称');
        const input = freeHomeElement('input', 'free-home-field');
        input.value = initial; input.maxLength = 40;
        label.append(input); sheet.append(label);
        const save = () => {
            const name = input.value.trim();
            if (!name) { showToast('请输入名称'); return; }
            callback(name);
        };
        input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
        freeHomeSheetButton(sheet, '保存', save);
        setTimeout(() => input.focus(), 0);
    }, true);
}

function freeHomeWidgetPresetSettings(item) {
    return freeHomeWidgetSnapshot(item.widget, item.settings);
}

function freeHomeSaveWidgetPreset(item) {
    freeHomeAskName('保存小组件预设', FREE_WIDGETS[item.widget].name, name => {
        const presets = db.freeHomeWidgetPresets ||= [];
        const existing = presets.find(preset => preset.name === name);
        const preset = { id: existing?.id || freeHomeId(), name, widget: item.widget, size: item.size, settings: freeHomeWidgetPresetSettings(item) };
        if (existing) Object.assign(existing, preset); else presets.push(preset);
        saveGlobalSettings(['freeHomeWidgetPresets']); freeHomeCloseSheet(); showToast('小组件预设已保存');
    });
}

function freeHomeManageWidgetPreset(id) {
    const preset = (db.freeHomeWidgetPresets || []).find(p => p.id === id);
    if (!preset) return;
    freeHomeOpenSheet(preset.name, sheet => {
        if (preset.widget === 'custom') freeHomeSheetButton(sheet, '编辑代码', () => customWidgetEditor(null, preset));
        if (!FREE_WIDGETS[preset.widget]?.legacy) freeHomeSheetButton(sheet, '添加到主屏', () => freeHomeStartPlacement({ id: freeHomeId(), type: 'widget', widget: preset.widget, size: preset.size, settings: freeHomeWidgetSnapshot(preset.widget, preset.settings) }));
        freeHomeSheetButton(sheet, '重命名', () => freeHomeAskName('重命名小组件预设', preset.name, name => {
            preset.name = name; saveGlobalSettings(['freeHomeWidgetPresets']); freeHomeOpenWidgetPicker();
        }));
        freeHomeSheetButton(sheet, '导出', () => {
            customWidgetDownload({ type: 'free-home-widget-preset', preset }, preset.name);

        });
        freeHomeSheetButton(sheet, '删除预设', () => freeHomeOpenSheet('删除预设？', confirm => {
            confirm.append(freeHomeElement('p', 'free-home-sheet-help', `删除「${preset.name}」不会删除主屏上已有的小组件。`));
            freeHomeSheetButton(confirm, '确认删除', () => {
                db.freeHomeWidgetPresets = db.freeHomeWidgetPresets.filter(p => p.id !== id);
                saveGlobalSettings(['freeHomeWidgetPresets']); freeHomeOpenWidgetPicker();
            });
        }, true));
    }, true);
}

function freeHomeImportWidgetPreset(file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { showToast('预设文件需小于 20 MB'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const data = JSON.parse(reader.result);
            if (await freeHomeImportBundle(data, 'widget')) return;
            const p = data?.preset;
            if (data?.type !== 'free-home-widget-preset' || !p || !FREE_WIDGETS[p.widget] || FREE_WIDGETS[p.widget].legacy || !['wide', 'square', undefined].includes(p.size) || typeof p.name !== 'string' || !p.name.trim() || !p.settings || typeof p.settings !== 'object' || Array.isArray(p.settings)) throw new Error('格式无效');
            const presets = db.freeHomeWidgetPresets ||= [];
            const existing = p.widget === 'custom' ? null : presets.find(item => item.name === p.name.trim());
            if (p.widget === 'custom' && !customWidgetValid(p.settings)) throw new Error('代码无效');
            const record = { id: existing?.id || freeHomeId(), name: p.widget === 'custom' && presets.some(item => item.name === p.name.trim()) ? p.name.trim().slice(0, 32) + '（导入）' : p.name.trim().slice(0, 40), widget: p.widget, size: p.size, settings: freeHomeWidgetSnapshot(p.widget, p.settings) };
            if (existing) Object.assign(existing, record); else presets.push(record);
            saveGlobalSettings(['freeHomeWidgetPresets']); freeHomeOpenWidgetPicker(); showToast('小组件预设已导入');
        } catch { showToast('小组件预设文件无效'); }
    };
    reader.readAsText(file);
}

function freeHomeStartPlacement(item) {
    freeHomeCloseSheet();
    freeHomeEditing = true;
    const marker = freeHomeId();
    history.pushState({ ...history.state, freeHomePlacement: marker }, '');
    freeHomePlacement = { item, position: null, positions: null, marker };
    renderFreeHomeScreen();
    if (!freeHomePlacement.position) showToast('当前页空间不足，可切换到其他页面或添加页面');
}

function freeHomeCancelPlacement(fromPop = false) {
    if (!freeHomePlacement) return;
    const marker = freeHomePlacement.marker;
    freeHomePlacement = null;
    renderFreeHomeScreen();
    if (!fromPop && history.state?.freeHomePlacement === marker) history.back();
}

function freeHomePreviewFirstSpace() {
    if (!freeHomePlacement) return;
    const page = freeHomeData().pages[freeHomePage];
    const cells = Array.from({ length: 4 }, () => Array(4).fill(false));
    page.items.forEach(item => freeHomeMarkArea(cells, item, item.row, item.col));
    let first = freeHomeFirstSpace(cells, freeHomePlacement.item);
    if (!first) {
        const { width, height } = freeHomeSize(freeHomePlacement.item);
        for (let row = 0; row <= 4 - height && !first; row++) for (let col = 0; col <= 4 - width && !first; col++) {
            if (freeHomePlace(page.items, freeHomePlacement.item, row, col)) first = { row, col };
        }
    }
    freeHomePreviewAt(first?.row, first?.col);
}

function freeHomeMovePreviewToGrid(grid) {
    const preview = grid.querySelector('.free-home-placement-preview') || homeScreen.querySelector('.free-home-placement-preview');
    if (preview && preview.parentElement !== grid) grid.append(preview);
    return preview;
}

function freeHomePreviewAt(row, col) {
    if (!freeHomePlacement) return;
    const key = `${freeHomePage}:${row}:${col}`;
    if (freeHomePlacement.last === key) return;
    freeHomePlacement.last = key;
    const page = freeHomeData().pages[freeHomePage];
    const positions = freeHomePlace(page.items, freeHomePlacement.item, row, col);
    freeHomePlacement.position = positions ? { row, col, page: freeHomePage } : null;
    freeHomePlacement.positions = positions;
    const grid = homeScreen.querySelector(`.free-home-page[data-page-index="${freeHomePage}"] .free-home-grid`);
    if (!grid) return;
    const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const before = animate ? new Map([...grid.querySelectorAll('.free-home-tile')].map(tile => [tile, tile.getBoundingClientRect()])) : null;
    const preview = freeHomeMovePreviewToGrid(grid);
    if (preview) {
        preview.classList.toggle('free-home-placement-invalid', !positions);
        preview.style.gridRow = Number.isInteger(row) ? `${row + 1} / span ${freeHomeSize(freeHomePlacement.item).height}` : '';
        preview.style.gridColumn = Number.isInteger(col) ? `${col + 1} / span ${freeHomeSize(freeHomePlacement.item).width}` : '';
        preview.style.visibility = Number.isInteger(row) && Number.isInteger(col) ? 'visible' : 'hidden';
        freeHomeFitClassicWidgets(grid);
    }
    page.items.forEach(item => {
        const tile = [...grid.querySelectorAll('.free-home-tile[data-item-id]')].find(el => el.dataset.itemId === item.id);
        const place = positions?.get(item.id) || item;
        if (tile) { tile.style.gridRow = `${place.row + 1} / span ${freeHomeSize(item).height}`; tile.style.gridColumn = `${place.col + 1} / span ${freeHomeSize(item).width}`; }
    });
    if (before) for (const [tile, rect] of before) {
        if (tile.style.visibility === 'hidden' || typeof tile.animate !== 'function') continue;
        const next = tile.getBoundingClientRect();
        const dx = rect.left - next.left, dy = rect.top - next.top;
        if (Math.abs(dx) + Math.abs(dy) > 2) tile.animate([
            { transform: `translate3d(${dx}px,${dy}px,0)` }, { transform: 'translate3d(0,0,0)' }
        ], { duration: 155, easing: 'ease-out' });
    }
    const confirm = homeScreen.querySelector('[data-home-action="confirm-placement"]');
    if (confirm) confirm.disabled = !positions;
}

function freeHomePreviewFromPointer(event) {
    const grid = document.elementFromPoint(event.clientX, event.clientY)?.closest('.free-home-grid');
    if (!grid || grid.closest('.free-home-page')?.dataset.pageIndex !== String(freeHomePage)) return;
    const rect = grid.getBoundingClientRect();
    const col = Math.max(0, Math.min(4 - freeHomeSize(freeHomePlacement.item).width, Math.floor((event.clientX - rect.left) / (rect.width / 4))));
    const row = Math.max(0, Math.min(4 - freeHomeSize(freeHomePlacement.item).height, Math.floor((event.clientY - rect.top) / (rect.height / 4))));
    freeHomePreviewAt(row, col);
}

function freeHomeConfirmPlacement() {
    const placement = freeHomePlacement;
    if (!placement?.position || !placement.positions) return;
    const page = freeHomeData().pages[placement.position.page];
    page.items.forEach(item => Object.assign(item, placement.positions.get(item.id)));
    Object.assign(placement.item, placement.position);
    delete placement.item.page;
    page.items.push(placement.item);
    freeHomePlacement = null;
    if (history.state?.freeHomePlacement === placement.marker) history.back();
    freeHomeSave(); renderFreeHomeScreen(); showToast('小组件已放置');
    if (placement.item.widget === 'note' || placement.item.widget === 'photo') freeHomeEditWidget(placement.item.id);
}

function freeHomeCopyClassicWidgets() {
    const layout = freeHomeData();
    let added = 0;
    for (const widget of ['memory', 'ins', 'photo']) {
        if (layout.pages.some(page => page.items.some(item => item.type === 'widget' && item.widget === widget))) continue;
        const item = { id: freeHomeId(), type: 'widget', widget, settings: freeHomeWidgetSnapshot(widget) };
        let page = layout.pages.find(candidate => freeHomeCanFit([...candidate.items, item]));
        if (!page) {
            page = { id: freeHomeId(), items: [] };
            layout.pages.push(page);
        }
        page.items.push(item);
        freeHomeReflow(page.items);
        added++;
    }
    if (added) { freeHomeSave(); renderFreeHomeScreen(); showToast(`已加入 ${added} 个经典小组件`); }
    else showToast('经典小组件已经在自由主屏中');
}

function freeHomeTextField(sheet, labelText, value, multiline = false) {
    const label = freeHomeElement('label', 'free-home-field-label', labelText);
    const input = freeHomeElement(multiline ? 'textarea' : 'input', 'free-home-field');
    input.value = value ?? '';
    label.append(input); sheet.append(label);
    return input;
}

function freeHomeImageField(sheet, labelText, value) {
    const input = freeHomeTextField(sheet, labelText, value);
    input.placeholder = '图片链接或从手机选择';
    const uploadLabel = freeHomeElement('label', 'free-home-upload-btn', '从手机选择图片');
    const upload = freeHomeElement('input', 'free-home-hidden-file');
    upload.type = 'file'; upload.accept = 'image/*';
    upload.onchange = async () => {
        const file = upload.files?.[0];
        if (!file) return;
        input.dataset.loading = 'true';
        try {
            if (typeof compressImage === 'function') input.value = await compressImage(file, { quality: .8, maxWidth: 400, maxHeight: 400 });
            else {
                if (file.size > 2 * 1024 * 1024) { showToast('图片需小于 2 MB'); return; }
                input.value = await new Promise((resolve, reject) => {
                    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file);
                });
            }
            showToast('图片已选，点击保存内容');
        } catch { showToast('图片读取失败，请重试'); }
        finally { delete input.dataset.loading; }
    };
    uploadLabel.append(upload); sheet.append(uploadLabel);
    return input;
}

function freeHomeEditWidget(id) {
    const found = freeHomeFind(id);
    if (!found || found.item.type !== 'widget') return;
    const item = found.item;
    const state = freeHomeWidgetSnapshot(item.widget, item.settings);
    freeHomeOpenSheet(`${FREE_WIDGETS[item.widget].name}设置`, sheet => {
        const fields = {};
        if (item.widget === 'custom') freeHomeSheetButton(sheet, '编辑 HTML / CSS / JS', () => customWidgetEditor(item));
        if (item.widget === 'photo') fields.image = freeHomeImageField(sheet, '照片', state.image);
        if (item.widget === 'memory') {
            fields.image = freeHomeImageField(sheet, '中心图片', state.image);
            fields.signature = freeHomeTextField(sheet, '个性签名', state.signature);
            for (const [part, label] of [['topLeft', '左上'], ['topRight', '右上'], ['bottomLeft', '左下'], ['bottomRight', '右下']]) {
                fields[`${part}Emoji`] = freeHomeTextField(sheet, `${label}图案`, state[part].emoji);
                fields[`${part}Text`] = freeHomeTextField(sheet, `${label}文字`, state[part].text);
            }
        }
        if (item.widget === 'ins') {
            fields.avatar1 = freeHomeImageField(sheet, '上方头像', state.avatar1);
            fields.bubble1 = freeHomeTextField(sheet, '上方气泡', state.bubble1);
            fields.avatar2 = freeHomeImageField(sheet, '下方头像', state.avatar2);
            fields.bubble2 = freeHomeTextField(sheet, '下方气泡', state.bubble2);
        }
        if (item.widget === 'note') fields.text = freeHomeTextField(sheet, '显示文字', state.text, true);
        const draft = () => {
            if (Object.values(fields).some(field => field.dataset.loading === 'true')) { showToast('图片正在处理，请稍候'); return null; }
            const next = JSON.parse(JSON.stringify(state));
            for (const [key, field] of Object.entries(fields)) {
                const value = field.value.trim();
                const part = key.match(/^(topLeft|topRight|bottomLeft|bottomRight)(Emoji|Text)$/);
                if (part) next[part[1]][part[2].toLowerCase()] = value;
                else next[key] = value;
            }
            return next;
        };
        if (Object.keys(fields).length) freeHomeSheetButton(sheet, '保存内容', () => {
            const next = draft(); if (!next) return;
            item.settings = next; freeHomeSave(); freeHomeCloseSheet(); renderFreeHomeScreen(); showToast('小组件已保存');
        });
        freeHomeSheetButton(sheet, '复制小组件', () => {
            if (!freeHomeCanFit([...found.page.items, item])) { showToast('当前页空间不足'); return; }
            const next = draft(); if (!next) return;
            found.page.items.splice(found.index + 1, 0, { ...JSON.parse(JSON.stringify(item)), id: freeHomeId(), settings: next });
            freeHomeReflow(found.page.items);
            freeHomeSave(); freeHomeCloseSheet(); renderFreeHomeScreen();
        });
        const changedSize = freeHomeCellCount(item) === 8 ? 'square' : 'wide';
        freeHomeSheetButton(sheet, changedSize === 'wide' ? '改为横向尺寸' : '改为方形尺寸', () => {
            const oldSize = item.size;
            item.size = changedSize;
            if (!freeHomeCanFit(found.page.items)) { item.size = oldSize; showToast('当前页空间不足'); return; }
            const next = draft(); if (!next) { item.size = oldSize; return; }
            item.settings = next; freeHomeReflow(found.page.items);
            freeHomeSave(); freeHomeCloseSheet(); renderFreeHomeScreen();
        });
        if (!FREE_WIDGETS[item.widget].legacy) freeHomeSheetButton(sheet, '保存为小组件预设', () => {
            const next = draft(); if (next) freeHomeSaveWidgetPreset({ ...item, settings: next });
        });
        freeHomeSheetButton(sheet, '移除小组件', () => {
            found.page.items.splice(found.index, 1); freeHomeSave(); freeHomeCloseSheet(); renderFreeHomeScreen();
        });
    });
}

function freeHomeExportSelection(kind) {
    const desktop = kind === 'desktop';
    const presets = desktop ? _getWidgetWallpaperPresets() : (db.freeHomeWidgetPresets || []);
    const selected = new Set();
    freeHomeOpenSheet(desktop ? '多选导出桌面预设' : '多选导出小组件预设', sheet => {
        if (!presets.length) sheet.append(freeHomeElement('p', 'free-home-sheet-help', '暂无已保存的预设，请先保存预设。'));
        const buttons = [];
        const update = () => {
            buttons.forEach((button, index) => { button.classList.toggle('selected', selected.has(index)); button.setAttribute('aria-pressed', String(selected.has(index))); });
            submit.disabled = !selected.size;
            submit.querySelector('span').textContent = `导出已选 ${selected.size} 项`;
        };
        freeHomeSheetButton(sheet, '全选', () => { presets.forEach((_, index) => selected.add(index)); update(); });
        freeHomeSheetButton(sheet, '取消全选', () => { selected.clear(); update(); });
        presets.forEach((preset, index) => {
            const button = freeHomeSheetButton(sheet, preset.name, () => { if (selected.has(index)) selected.delete(index); else selected.add(index); update(); });
            button.setAttribute('aria-pressed', 'false'); buttons.push(button);
        });
        const submit = freeHomeSheetButton(sheet, '导出已选 0 项', () => customWidgetDownload({ type: desktop ? 'free-home-desktop-bundle' : 'free-home-widget-bundle', presets: presets.filter((_, index) => selected.has(index)) }, desktop ? '桌面预设合集' : '小组件预设合集'), '图片默认不分享');
        update();
        freeHomeSheetButton(sheet, '返回', desktop ? freeHomeOpenDesktopPresets : freeHomeOpenWidgetPicker);
    });
}

async function freeHomeImportBundle(data, kind) {
    const desktop = kind === 'desktop';
    if (data.type !== (desktop ? 'free-home-desktop-bundle' : 'free-home-widget-bundle')) return false;
    if (!Array.isArray(data.presets) || !data.presets.length || data.presets.length > 200) throw new Error('预设合集需包含 1–200 项');
    const records = data.presets.map(preset => {
        if (!preset || typeof preset.name !== 'string' || !preset.name.trim()) throw new Error('预设名称无效');
        if (desktop) {
            if (!['free', 'classic'].includes(preset.layoutMode) || (preset.layoutMode === 'free' && !freeHomeValidLayout(preset.freeHomeLayout))) throw new Error('桌面布局无效');
        } else if (!FREE_WIDGETS[preset.widget] || !['square', 'wide', undefined].includes(preset.size) || !preset.settings || typeof preset.settings !== 'object' || Array.isArray(preset.settings) || (preset.widget === 'custom' && !customWidgetValid(preset.settings))) throw new Error('小组件格式无效');
        const record = JSON.parse(JSON.stringify(preset));
        if (desktop) record.imageSharing = widgetWallpaperImageSharing(preset);
        return record;
    });
    const key = desktop ? 'widgetWallpaperPresets' : 'freeHomeWidgetPresets';
    const previous = db[key];
    const combined = [...(previous || [])];
    for (const record of records) {
        const name = record.name.trim().slice(0, 40); let candidate = name, suffix = 1;
        while (combined.some(preset => preset.name === candidate)) candidate = `${name}（导入${suffix++}）`;
        record.name = candidate;
        if (!desktop) record.id = freeHomeId();
        combined.push(record);
    }
    db[key] = combined;
    if (await saveGlobalSettings([key]) === false) { db[key] = previous; throw new Error('保存失败，请重试'); }
    if (desktop) { populateWidgetWallpaperPresetSelect(); freeHomeOpenDesktopPresets(); } else freeHomeOpenWidgetPicker();
    showToast(`已导入 ${records.length} 项预设`);
    return true;
}

function freeHomeResetLayout() {
    freeHomeOpenSheet('重置自由布局？', sheet => {
        sheet.append(freeHomeElement('p', 'free-home-sheet-help', '恢复默认分页、应用排列和 Dock，移除当前桌面组件。壁纸、图标外观及预设库保留；可通过“撤销”恢复本次布局。'));
        freeHomeSheetButton(sheet, '确认重置布局', async () => {
            const previous = JSON.stringify(freeHomeData());
            const previousPage = freeHomePage;
            db.freeHomeLayout = freeHomeInitialLayout(); freeHomePage = 0;
            if (await saveGlobalSettings(['freeHomeLayout']) === false) { db.freeHomeLayout = JSON.parse(previous); freeHomePage = previousPage; return; }
            if (freeHomePointer) { clearTimeout(freeHomePointer.edgeTimer); clearTimeout(freeHomePointer.timer); freeHomePointer.ghost?.remove(); freeHomePointer = null; }
            const marker = freeHomePlacement?.marker; freeHomePlacement = null;
            if (marker && history.state?.freeHomePlacement === marker) history.back();
            freeHomeHistory.push(previous); if (freeHomeHistory.length > 20) freeHomeHistory.shift();
            freeHomeLastSaved = JSON.stringify(db.freeHomeLayout);
            freeHomeCloseSheet(); renderFreeHomeScreen(); showToast('已恢复默认自由布局，可撤销');
        });
        freeHomeSheetButton(sheet, '取消', freeHomeOpenPages);
    }, true);
}

function freeHomeOpenDesktopPresets() {
    freeHomeOpenSheet('桌面预设', sheet => {
        sheet.append(freeHomeElement('p', 'free-home-sheet-help', '保存全部页面、图标位置、文件夹、Dock 和小组件代码与配置。图片默认不分享，导出时可确认选择；单个小组件请在其预设管理中导出。'));
        freeHomeSheetButton(sheet, '保存当前桌面', () => {
            const scheme = _captureCurrentWidgetWallpaperScheme();
            freeHomeAskName('保存桌面预设（同名覆盖）', '我的桌面', name => {
                const presets = _getWidgetWallpaperPresets();
                const index = presets.findIndex(preset => preset.name === name);
                const preset = { name, ...scheme };
                if (index >= 0) presets[index] = preset; else presets.push(preset);
                _saveWidgetWallpaperPresets(presets); populateWidgetWallpaperPresetSelect();
                freeHomeOpenDesktopPresets(); showToast('桌面预设已保存');
            });
        });
        freeHomeSheetButton(sheet, '导出当前完整桌面', () => customWidgetDownload({ type: 'widget-wallpaper-scheme', version: 2, preset: { name: '自由主屏', ..._captureCurrentWidgetWallpaperScheme() } }, '自由主屏'), '图片默认不分享');
        const label = freeHomeElement('label', 'free-home-upload-btn', '导入桌面预设');
        const input = freeHomeElement('input', 'free-home-hidden-file');
        input.type = 'file'; input.accept = '.json,application/json';
        input.onchange = () => { const file = input.files?.[0]; if (file) { freeHomeCloseSheet(); importWidgetWallpaperScheme(file); } };
        label.append(input); sheet.append(label);
        const presets = _getWidgetWallpaperPresets();
        freeHomeSheetButton(sheet, '多选 / 全选导出桌面预设', () => freeHomeExportSelection('desktop'));
        if (presets.length) sheet.append(freeHomeElement('strong', 'free-home-sheet-subtitle', '已保存的桌面'));
        presets.forEach(preset => freeHomeSheetButton(sheet, preset.name, () => {
            freeHomeOpenSheet(preset.name, detail => {
                freeHomeSheetButton(detail, '应用这个桌面', () => { applyWidgetWallpaperPreset(preset.name); freeHomeCloseSheet(); });
                freeHomeSheetButton(detail, '导出这个桌面', () => customWidgetDownload({ type: 'widget-wallpaper-scheme', version: preset.layoutMode === 'free' ? 2 : 1, preset }, preset.name), '图片默认不分享');
                freeHomeSheetButton(detail, '返回桌面预设', freeHomeOpenDesktopPresets);
            });
        }, preset.layoutMode === 'free' ? `${preset.freeHomeLayout?.pages?.length || 0} 页` : '经典布局'));
        freeHomeSheetButton(sheet, '返回添加小组件', freeHomeOpenWidgetPicker);
    });
}

function freeHomeOpenPages() {
    freeHomeOpenSheet('管理页面', sheet => {
        freeHomeSheetButton(sheet, '重置为默认自由布局', freeHomeResetLayout);
        freeHomeSheetButton(sheet, '保存整个主屏为方案', () => saveCurrentWidgetWallpaperAsPreset());
        freeHomeSheetButton(sheet, '导出当前主屏', () => customWidgetDownload({ type: 'widget-wallpaper-scheme', version: 2, preset: { name: '自由主屏', ..._captureCurrentWidgetWallpaperScheme() } }, '自由主屏'), '图片默认不分享');
        const importLabel = freeHomeElement('label', 'free-home-upload-btn', '导入屏幕方案');
        const input = freeHomeElement('input', 'free-home-hidden-file'); input.type = 'file'; input.accept = '.json,application/json';
        input.onchange = () => importWidgetWallpaperScheme(input.files?.[0]); importLabel.append(input); sheet.append(importLabel);
        const layout = freeHomeData();
        layout.pages.forEach((page, index) => {
            const row = freeHomeElement('div', 'free-home-page-row');
            const preview = freeHomeElement('div', 'free-home-page-preview');
            page.items.slice(0, 16).forEach(item => {
                const mark = freeHomeElement('span', item.type === 'widget' ? 'is-widget' : '');
                mark.style.gridRow = `${item.row + 1} / span ${freeHomeSize(item).height}`;
                mark.style.gridColumn = `${item.col + 1} / span ${freeHomeSize(item).width}`;
                preview.append(mark);
            });
            row.append(preview);
            row.append(freeHomeElement('span', '', `第 ${index + 1} 页 · ${page.items.length} 项`));
            for (const [label, direction] of [['↑', -1], ['↓', 1]]) {
                const button = freeHomeElement('button', 'free-home-mini-btn', label);
                button.type = 'button'; button.disabled = index + direction < 0 || index + direction >= layout.pages.length;
                button.onclick = () => {
                    const next = index + direction;
                    [layout.pages[index], layout.pages[next]] = [layout.pages[next], layout.pages[index]];
                    freeHomePage = next; freeHomeSave(); renderFreeHomeScreen(); freeHomeOpenPages();
                }; row.append(button);
            }
            const destinationIndex = layout.pages.findIndex((candidate, i) => i !== index && freeHomeCanFit([...candidate.items, ...page.items]));
            const remove = freeHomeElement('button', 'free-home-mini-btn', page.items.length ? '迁移并删除' : '删除');
            remove.type = 'button'; remove.disabled = layout.pages.length === 1 || (page.items.length > 0 && destinationIndex < 0);
            remove.onclick = () => {
                if (page.items.length) {
                    layout.pages[destinationIndex].items.push(...page.items);
                    freeHomeReflow(layout.pages[destinationIndex].items);
                }
                layout.pages.splice(index, 1); freeHomePage = Math.min(freeHomePage, layout.pages.length - 1);
                freeHomeSave(); renderFreeHomeScreen(); freeHomeOpenPages();
            }; row.append(remove); sheet.append(row);
        });
        freeHomeSheetButton(sheet, '＋ 添加页面', () => {
            if (layout.pages.length >= 30) { showToast('最多可添加 30 页'); return; }
            layout.pages.push({ id: freeHomeId(), items: [] });
            freeHomePage = layout.pages.length - 1; freeHomeSave(); renderFreeHomeScreen(); freeHomeOpenPages();
        });
    });
}

function freeHomeOpenFolder(id) {
    const found = freeHomeFind(id);
    if (!found || found.item.type !== 'folder') return;
    const folder = found.item;
    freeHomeOpenSheet(folder.name || '文件夹', sheet => {
        if (freeHomeEditing) {
            const label = freeHomeElement('label', 'free-home-field-label', '文件夹名称');
            const input = freeHomeElement('input', 'free-home-field'); input.value = folder.name || '文件夹';
            label.append(input); sheet.append(label);
            freeHomeSheetButton(sheet, '保存名称', () => {
                folder.name = input.value.trim() || '文件夹'; freeHomeSave(); freeHomeCloseSheet(); renderFreeHomeScreen();
            });
        }
        folder.apps.forEach((appId, index) => {
            const appButton = freeHomeSheetButton(sheet, freeHomeAppName(appId), () => {
                if (freeHomeEditing) {
                    if (folder.apps.length > 2 && !freeHomeCanFit([...found.page.items, { type: 'app' }])) { showToast('当前页空间不足'); return; }
                    folder.apps.splice(index, 1);
                    found.page.items.splice(found.index + 1, 0, { id: freeHomeId(), type: 'app', appId });
                    if (folder.apps.length === 1) found.page.items.splice(found.index, 1, { id: freeHomeId(), type: 'app', appId: folder.apps[0] });
                    freeHomeReflow(found.page.items);
                    freeHomeSave(); freeHomeCloseSheet(); renderFreeHomeScreen(); showToast('已移出文件夹');
                } else { freeHomeCloseSheet(); freeHomeOpenApp(appId); }
            }, freeHomeEditing ? '点击移出文件夹' : '打开应用');
            const icon = freeHomeElement('img', 'free-home-folder-app-icon');
            icon.src = freeHomeIcon(appId); icon.alt = '';
            appButton.prepend(icon);
            if (freeHomeEditing && index > 0) {
                freeHomeSheetButton(sheet, `↑ 将「${freeHomeAppName(appId)}」前移`, () => {
                    [folder.apps[index - 1], folder.apps[index]] = [folder.apps[index], folder.apps[index - 1]];
                    freeHomeSave(); freeHomeCloseSheet(); renderFreeHomeScreen(); freeHomeOpenFolder(folder.id);
                });
            }
        });
        freeHomeSheetButton(sheet, '解散文件夹', () => freeHomeConfirmDissolve(folder.id), '应用将回到桌面');
    }, true);
}

function freeHomeConfirmDissolve(id) {
    const found = freeHomeFind(id);
    if (!found || found.item.type !== 'folder') return;
    const pageIndex = freeHomeData().pages.indexOf(found.page);
    const otherItems = found.page.items.filter(item => item.id !== id);
    let available = 0;
    for (const appId of found.item.apps) {
        if (freeHomeCanFit([...otherItems, ...Array.from({ length: available + 1 }, () => ({ type: 'app' }))])) available++;
        else break;
    }
    const remaining = found.item.apps.length - available;
    const dissolve = () => {
            const layout = freeHomeData();
            let overflow = remaining;
            for (const [index, page] of layout.pages.entries()) {
                if (index === pageIndex) continue;
                const capacity = 16 - page.items.reduce((sum, item) => sum + freeHomeCellCount(item), 0);
                overflow -= Math.min(overflow, capacity);
            }
            if (layout.pages.length + Math.ceil(Math.max(0, overflow) / 16) > 30) { showToast('页面数量已达上限，无法解散'); return; }
            const source = layout.pages[pageIndex];
            const apps = found.item.apps.map(appId => ({ id: freeHomeId(), type: 'app', appId }));
            source.items.splice(found.index, 1);
            let inserted = 0;
            while (inserted < apps.length && freeHomeCanFit([...source.items, apps[inserted]])) {
                source.items.splice(found.index + inserted, 0, apps[inserted]); inserted++;
            }
            freeHomeReflow(source.items);
            for (; inserted < apps.length; inserted++) {
                let destination = layout.pages.find((page, index) => index !== pageIndex && freeHomeCanFit([...page.items, apps[inserted]]));
                if (!destination) { destination = { id: freeHomeId(), items: [] }; layout.pages.push(destination); }
                destination.items.push(apps[inserted]); freeHomeReflow(destination.items);
            }
            freeHomeSave(); freeHomeCloseSheet(); renderFreeHomeScreen(); showToast('文件夹已解散，可撤销');
    };
    if (!remaining) { dissolve(); return; }
    freeHomeOpenSheet('解散文件夹？', sheet => {
        sheet.append(freeHomeElement('p', 'free-home-sheet-help', remaining
            ? `${available} 个应用回到第 ${pageIndex + 1} 页，另 ${remaining} 个放到其他页面；空间不足时会新增页面。可撤销。`
            : `${found.item.apps.length} 个应用会回到第 ${pageIndex + 1} 页的文件夹位置附近。可撤销。`));
        freeHomeSheetButton(sheet, '确认解散', dissolve);
    }, true);
}

function freeHomeCreateFolderFromSelection(page, selectedIds) {
    if (selectedIds.length !== 2) return false;
    const entries = selectedIds.map(id => page.items.find(item => item.id === id));
    if (entries.some(item => !item || item.type !== 'app')) return false;
    const position = Math.min(...selectedIds.map(id => page.items.findIndex(item => item.id === id)));
    page.items = page.items.filter(item => !selectedIds.includes(item.id));
    page.items.splice(position, 0, { id: freeHomeId(), type: 'folder', name: '文件夹', apps: entries.map(item => item.appId) });
    freeHomeReflow(page.items);
    freeHomeSave();
    return true;
}

function freeHomeOpenCreateFolder() {
    const page = freeHomeData().pages[freeHomePage];
    freeHomeOpenSheet('创建文件夹', sheet => {
        sheet.append(freeHomeElement('p', 'free-home-sheet-help', '选择当前页的两个 APP，创建后可继续拖入其他 APP。'));
        const selected = [];
        let confirm;
        page.items.filter(item => item.type === 'app').forEach(item => {
            const row = freeHomeSheetButton(sheet, freeHomeAppName(item.appId), () => {
                const index = selected.indexOf(item.id);
                if (index >= 0) selected.splice(index, 1);
                else if (selected.length < 2) selected.push(item.id);
                row.classList.toggle('selected', selected.includes(item.id));
                confirm.disabled = selected.length !== 2;
            });
        });
        confirm = freeHomeSheetButton(sheet, '创建文件夹', () => {
            if (!freeHomeCreateFolderFromSelection(page, selected)) return;
            freeHomeCloseSheet(); renderFreeHomeScreen(); showToast('文件夹已创建');
        });
        confirm.disabled = true;
    });
}

function freeHomeOpenApp(appId) {
    if (appId === 'biekan-app') { if (window.McpManager) window.McpManager.open(); return; }
    if (appId === 'piggy-bank-screen') { switchScreen(appId); return; }
    if (appId === 'diary-screen') { showToast('该应用正在开发中，敬请期待！'); return; }
    if (appId === 'world-book-screen') renderWorldBookList();
    if (appId === 'customize-screen') renderCustomizeForm();
    if (appId === 'tutorial-screen') {
        renderTutorialContent();
        const bgToastEl = document.getElementById('setting-bg-toast-enabled');
        if (bgToastEl) {
            bgToastEl.checked = db.globalToastEnabled !== false;
            bgToastEl.onchange = async e => {
                db.globalToastEnabled = e.target.checked;
                await saveData();
                showToast(e.target.checked ? '已开启全局消息弹窗' : '已关闭全局消息弹窗');
            };
        }
    }
    switchScreen(appId);
}

function freeHomeCommitMove(id, targetId, targetPageIndex, intent = 'append', after = false) {
    const source = freeHomeFind(id);
    const targetPage = freeHomeData().pages[targetPageIndex];
    if (!source || !targetPage) return false;
    const target = targetId ? freeHomeFind(targetId) : null;
    if (target?.item.id === source.item.id) return false;
    if (intent === 'folder' && target && source.item.type === 'app' && (target.item.type === 'app' || target.item.type === 'folder')) {
        if (source.item.id === target.item.id) return false;
        source.page.items.splice(source.index, 1);
        const relocated = freeHomeFind(targetId);
        if (relocated.item.type === 'app') {
            relocated.page.items.splice(relocated.index, 1, { id: freeHomeId(), type: 'folder', name: '文件夹', apps: [relocated.item.appId, source.item.appId], row: relocated.item.row, col: relocated.item.col });
        } else relocated.item.apps.push(source.item.appId);
        freeHomeSave(); return true;
    }
    if (intent === 'swap' && target && source.item.type !== 'widget' && target.item.type !== 'widget') {
        const sourceIndex = source.index;
        const targetIndex = target.index;
        const sourcePosition = { row: source.item.row, col: source.item.col };
        source.item.row = target.item.row; source.item.col = target.item.col;
        Object.assign(target.item, sourcePosition);
        source.page.items[sourceIndex] = target.item;
        target.page.items[targetIndex] = source.item;
        freeHomeSave(); return true;
    }
    const proposed = targetPage.items.filter(item => item.id !== source.item.id);
    const proposedIndex = target ? proposed.findIndex(item => item.id === targetId) : proposed.length;
    proposed.splice(proposedIndex < 0 ? proposed.length : proposedIndex + (after ? 1 : 0), 0, source.item);
    if (!freeHomeCanFit(proposed)) {
        showToast('目标页面空间不足'); return false;
    }
    source.page.items.splice(source.index, 1);
    const index = target ? targetPage.items.findIndex(item => item.id === targetId) : targetPage.items.length;
    targetPage.items.splice(index < 0 ? targetPage.items.length : index + (after ? 1 : 0), 0, source.item);
    freeHomeReflow(targetPage.items);
    if (source.page !== targetPage) freeHomeReflow(source.page.items);
    freeHomeSave(); return true;
}

function freeHomeMoveToCell(id, pageIndex, row, col) {
    const source = freeHomeFind(id);
    const page = freeHomeData().pages[pageIndex];
    if (!source || !page) return false;
    const items = page.items.filter(item => item.id !== id);
    const positions = freeHomePlace(items, source.item, row, col);
    if (!positions) { showToast('目标位置空间不足'); return false; }
    source.page.items.splice(source.index, 1);
    items.forEach(item => Object.assign(item, positions.get(item.id)));
    Object.assign(source.item, positions.get(id));
    page.items.push(source.item);
    freeHomeSave();
    return true;
}

function freeHomeDragEnd(event) {
    const state = freeHomePointer;
    freeHomePointer = null;
    if (!state) return;
    clearTimeout(state.timer); clearTimeout(state.edgeTimer); clearTimeout(state.folderTimer);
    if (state.placing) {
        if (event.type !== 'pointercancel') {
            if (freeHomePage === state.page && Math.abs(event.clientX - state.x) > 60 && Math.abs(event.clientX - state.x) > Math.abs(event.clientY - state.y) * 1.5) {
                freeHomeSetPage(freeHomePage + (event.clientX < state.x ? 1 : -1));
            } else freeHomePreviewFromPointer(event);
        }
        return;
    }
    if (state.dragging) {
        const before = new Map([...homeScreen.querySelectorAll('.free-home-tile')].map(el => [el.dataset.itemId, el.getBoundingClientRect()]));
        if (state.ghost) before.set(state.itemId, state.ghost.getBoundingClientRect());
        state.ghost?.remove();
        homeScreen.querySelectorAll('.free-home-drop-cell').forEach(el => el.remove());
        homeScreen.querySelectorAll('.free-home-swap-target, .free-home-folder-pending, .free-home-folder-ready, .free-home-insert-before, .free-home-insert-after').forEach(el => {
            el.classList.remove('free-home-swap-target', 'free-home-folder-pending', 'free-home-folder-ready', 'free-home-insert-before', 'free-home-insert-after');
        });
        if (event.type !== 'pointercancel' && state.targetPage !== undefined) {
            if (state.intent === 'folder' || state.intent === 'swap' || state.intent === 'insert') freeHomeCommitMove(state.itemId, state.targetId, state.targetPage, state.intent, state.insertAfter);
            else if (state.targetCell) freeHomeMoveToCell(state.itemId, state.targetPage, state.targetCell.row, state.targetCell.col);
            else freeHomeCommitMove(state.itemId, state.targetId, state.targetPage, state.intent, state.insertAfter);
        }
        freeHomeSuppressClick = true;
        setTimeout(() => { freeHomeSuppressClick = false; }, 350);
        renderFreeHomeScreen();
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            homeScreen.querySelectorAll('.free-home-tile').forEach(el => {
                const previous = before.get(el.dataset.itemId);
                if (!previous || typeof el.animate !== 'function') return;
                const next = el.getBoundingClientRect();
                const dx = previous.left - next.left, dy = previous.top - next.top;
                if (Math.abs(dx) + Math.abs(dy) > 2) el.animate([
                    { transform: `translate3d(${dx}px,${dy}px,0) scale(${el.dataset.itemId === state.itemId ? 1.05 : 1})` },
                    { transform: 'translate3d(0,0,0) scale(1)' }
                ], { duration: 230, easing: 'cubic-bezier(.22,.8,.25,1)' });
            });
        }
        return;
    }
    if (state.swiping && Math.abs(event.clientX - state.x) > 45) {
        freeHomeSetPage(freeHomePage + (event.clientX < state.x ? 1 : -1));
        freeHomeSuppressClick = true;
        setTimeout(() => { freeHomeSuppressClick = false; }, 350);
    }
}

function freeHomePointerDown(event) {
    if (db.homeLayoutMode !== 'free' || freeHomeSheet || event.button !== 0) return;
    if (event.target.closest('button, .free-home-dock')) return;
    const bounds = homeScreen.getBoundingClientRect();
    if (event.clientX < bounds.left + 18 || event.clientX > bounds.right - 18) return;
    if (freeHomePlacement) {
        freeHomePointer = { pointerId: event.pointerId, placing: true, x: event.clientX, y: event.clientY, page: freeHomePage };
        homeScreen.setPointerCapture(event.pointerId);
        freeHomePreviewFromPointer(event);
        return;
    }
    const tile = event.target.closest('.free-home-tile');
    freeHomePointer = { x: event.clientX, y: event.clientY, itemId: tile?.dataset.itemId, pointerId: event.pointerId, swiping: true, dragging: false };
    const state = freeHomePointer;
    state.timer = setTimeout(() => {
        if (freeHomePointer !== state) return;
        if (!tile) { freeHomePointer = null; freeHomeEditing = true; freeHomeShowEditingControls(); showToast('可拖动图标整理主屏'); return; }
        const ghost = tile.cloneNode(true);
        ghost.classList.add('free-home-drag-ghost');
        ghost.style.width = `${tile.getBoundingClientRect().width}px`;
        ghost.style.height = `${tile.getBoundingClientRect().height}px`;
        freeHomeEditing = true;
        freeHomeShowEditingControls();
        document.body.append(ghost);
        state.ghost = ghost; state.dragging = true; state.swiping = false;
        homeScreen.setPointerCapture(state.pointerId);
        tile.classList.add('free-home-origin');
        freeHomeMoveGhost(state, event.clientX, event.clientY);
        if (navigator.vibrate) navigator.vibrate(12);
    }, freeHomeEditing ? 120 : 360);
}

function freeHomeMoveGhost(state, x, y) {
    state.ghost.style.transform = `translate3d(${x - state.ghost.offsetWidth / 2}px, ${y - state.ghost.offsetHeight / 2}px, 0) scale(1.08)`;
}

function freeHomePointerMove(event) {
    const state = freeHomePointer;
    if (!state || state.pointerId !== event.pointerId) return;
    if (state.placing) {
        event.preventDefault(); freeHomePreviewFromPointer(event);
        const rect = homeScreen.getBoundingClientRect();
        const direction = event.clientX > rect.right - 30 ? 1 : event.clientX < rect.left + 30 ? -1 : 0;
        if (direction !== state.edgeDirection) {
            clearTimeout(state.edgeTimer); state.edgeDirection = direction;
            if (direction && freeHomePage + direction >= 0 && freeHomePage + direction < freeHomeData().pages.length) {
                state.edgeTimer = setTimeout(() => { freeHomeSetPage(freeHomePage + direction); state.edgeDirection = 0; }, 480);
            }
        }
        return;
    }
    if (!state.dragging) {
        if (Math.hypot(event.clientX - state.x, event.clientY - state.y) > 12) clearTimeout(state.timer);
        return;
    }
    event.preventDefault();
    freeHomeMoveGhost(state, event.clientX, event.clientY);
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const target = hit?.closest('.free-home-tile');
    const page = hit?.closest('.free-home-page');
    const source = freeHomeFind(state.itemId);
    const grid = page?.querySelector('.free-home-grid');
    if (grid) {
        const rect = grid.getBoundingClientRect();
        const { width, height } = freeHomeSize(source?.item || { type: 'app' });
        state.targetCell = {
            col: Math.max(0, Math.min(4 - width, Math.floor((event.clientX - rect.left) / (rect.width / 4)))),
            row: Math.max(0, Math.min(4 - height, Math.floor((event.clientY - rect.top) / (rect.height / 4))))
        };
    }
    homeScreen.querySelectorAll('.free-home-drop-cell').forEach(el => el.remove());
    if (grid && state.targetCell && source) {
        const candidates = page.dataset.pageIndex === String(freeHomeData().pages.indexOf(source.page))
            ? source.page.items.filter(item => item.id !== source.item.id)
            : freeHomeData().pages[Number(page.dataset.pageIndex)].items;
        const valid = !!freeHomePlace(candidates, source.item, state.targetCell.row, state.targetCell.col);
        const cell = freeHomeElement('div', `free-home-drop-cell${valid ? '' : ' free-home-drop-cell-invalid'}`);
        cell.style.gridRow = `${state.targetCell.row + 1} / span ${freeHomeSize(source.item).height}`;
        cell.style.gridColumn = `${state.targetCell.col + 1} / span ${freeHomeSize(source.item).width}`;
        grid.append(cell);
    }
    const onSource = target?.dataset.itemId === state.itemId
        && (!state.targetCell || (state.targetCell.row === source?.item.row && state.targetCell.col === source?.item.col));
    const targetId = target?.dataset.itemId !== state.itemId ? target?.dataset.itemId : null;
    const destination = targetId ? freeHomeFind(targetId) : null;
    const targetRect = targetId ? target.getBoundingClientRect() : null;
    const fractionX = targetRect ? (event.clientX - targetRect.left) / targetRect.width : 0;
    const fractionY = targetRect ? (event.clientY - targetRect.top) / targetRect.height : 0;
    const classification = freeHomeClassifyDrop(source?.item, destination?.item, fractionX, fractionY, state.folderArmed);
    const folderEligible = !!targetId && classification.folderEligible;
    if (!folderEligible || state.folderTargetId !== targetId) {
        clearTimeout(state.folderTimer);
        state.folderTargetId = folderEligible ? targetId : null;
        state.folderArmed = false;
        if (folderEligible) {
            state.folderTimer = setTimeout(() => {
                if (freeHomePointer !== state || state.folderTargetId !== targetId) return;
                state.folderArmed = true;
                state.intent = 'folder';
                target.classList.remove('free-home-swap-target', 'free-home-folder-pending');
                target.classList.add('free-home-folder-ready');
                if (navigator.vibrate) navigator.vibrate(18);
            }, 480);
        }
    }
    homeScreen.querySelectorAll('.free-home-swap-target, .free-home-folder-pending, .free-home-folder-ready, .free-home-insert-before, .free-home-insert-after').forEach(el => {
        el.classList.remove('free-home-swap-target', 'free-home-folder-pending', 'free-home-folder-ready', 'free-home-insert-before', 'free-home-insert-after');
    });
    state.targetId = targetId;
    state.targetPage = onSource ? undefined : (page ? Number(page.dataset.pageIndex) : undefined);
    state.insertAfter = classification.after;
    state.intent = classification.intent;
    if (targetId) {
        if (folderEligible) {
            target.classList.add(state.folderArmed ? 'free-home-folder-ready' : 'free-home-folder-pending');
        } else if (state.intent === 'insert') {
            target.classList.add(state.insertAfter ? 'free-home-insert-after' : 'free-home-insert-before');
        } else {
            state.intent = 'swap';
            target.classList.add('free-home-swap-target');
        }
    }
    const rect = homeScreen.getBoundingClientRect();
    const direction = event.clientX > rect.right - 30 ? 1 : event.clientX < rect.left + 30 ? -1 : 0;
    if (direction !== state.edgeDirection) {
        clearTimeout(state.edgeTimer);
        state.edgeDirection = direction;
        if (direction && freeHomePage + direction >= 0 && freeHomePage + direction < freeHomeData().pages.length) {
            state.edgeTimer = setTimeout(() => {
                freeHomeSetPage(freeHomePage + direction);
                state.targetPage = freeHomePage; state.targetId = null; state.intent = 'append';
                clearTimeout(state.folderTimer); state.folderTargetId = null; state.folderArmed = false;
                state.edgeDirection = 0;
            }, 480);
        }
    }
}

function freeHomeBindEvents() {
    homeScreen.addEventListener('click', event => {
        if (db.homeLayoutMode !== 'free') return;
        if (freeHomeSuppressClick) { freeHomeSuppressClick = false; event.preventDefault(); event.stopPropagation(); return; }
        if (freeHomePlacement && event.target.closest('.free-home-dock')) { event.preventDefault(); event.stopPropagation(); return; }
        const action = event.target.closest('[data-home-action]')?.dataset.homeAction;
        if (action) {
            event.preventDefault();
            if (action === 'edit') { freeHomeEditing = true; renderFreeHomeScreen(); }
            if (action === 'done') { freeHomeEditing = false; renderFreeHomeScreen(); }
            if (action === 'layout') freeHomeOpenLayoutSheet();
            if (action === 'widgets') freeHomeOpenWidgetPicker();
            if (action === 'pages') freeHomeOpenPages();
            if (action === 'placement-prev') freeHomeSetPage(freeHomePage - 1);
            if (action === 'placement-next') {
                if (freeHomePage === freeHomeData().pages.length - 1) {
                    if (freeHomeData().pages.length >= 30) return showToast('最多可添加 30 页');
                    freeHomeData().pages.push({ id: freeHomeId(), items: [] });
                    freeHomePage++; freeHomeSave(); renderFreeHomeScreen();
                } else freeHomeSetPage(freeHomePage + 1);
            }
            if (action === 'undo') freeHomeUndo();
            if (action === 'create-folder') freeHomeOpenCreateFolder();
            if (action === 'cancel-placement') freeHomeCancelPlacement();
            if (action === 'confirm-placement') freeHomeConfirmPlacement();
            return;
        }
        const pageButton = event.target.closest('[data-home-page]');
        if (pageButton) { freeHomeSetPage(Number(pageButton.dataset.homePage)); return; }
        if (freeHomePlacement) { event.preventDefault(); return; }
        const tile = event.target.closest('.free-home-tile');
        if (!tile) return;
        const found = freeHomeFind(tile.dataset.itemId);
        if (!found) return;
        if (found.item.type === 'widget') {
            event.preventDefault(); event.stopPropagation();
            if (!freeHomeEditing || event.target.closest('.free-home-tile-manage')) freeHomeEditWidget(found.item.id);
            return;
        }
        if (freeHomeEditing) {
            if (found.item.type === 'folder') freeHomeOpenFolder(found.item.id);
            return;
        }
        if (found.item.type === 'folder') freeHomeOpenFolder(found.item.id);
        else if (found.item.type === 'app') freeHomeOpenApp(found.item.appId);
    }, true);
    homeScreen.addEventListener('pointerdown', freeHomePointerDown);
    homeScreen.addEventListener('pointermove', freeHomePointerMove, { passive: false });
    homeScreen.addEventListener('pointerup', freeHomeDragEnd);
    homeScreen.addEventListener('pointercancel', freeHomeDragEnd);
    homeScreen.addEventListener('contextmenu', e => { if (db.homeLayoutMode === 'free') e.preventDefault(); });
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        if (freeHomeSheet) { freeHomeCloseSheet(); e.preventDefault(); }
        else if (freeHomePlacement) { freeHomeCancelPlacement(); e.preventDefault(); }
        else if (db.homeLayoutMode === 'free' && freeHomeEditing) { freeHomeEditing = false; renderFreeHomeScreen(); e.preventDefault(); }
    });
    window.addEventListener('popstate', () => { if (freeHomePlacement) freeHomeCancelPlacement(true); });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden || !freeHomePointer) return;
        clearTimeout(freeHomePointer.timer); clearTimeout(freeHomePointer.edgeTimer); clearTimeout(freeHomePointer.folderTimer);
        freeHomePointer.ghost?.remove(); freeHomePointer = null;
        if (db.homeLayoutMode === 'free') renderFreeHomeScreen();
    });
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => {
        if (db.homeLayoutMode === 'free') freeHomeFitClassicWidgets(homeScreen);
    }).observe(homeScreen);
    else window.addEventListener('resize', () => { if (db.homeLayoutMode === 'free') freeHomeFitClassicWidgets(homeScreen); });
    setInterval(() => { if (db.homeLayoutMode === 'free') freeHomeUpdateClocks(); }, 30000);
}

document.addEventListener('DOMContentLoaded', freeHomeBindEvents);
