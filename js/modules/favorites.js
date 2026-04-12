// --- 消息收藏模块 ---

// 从消息 content 中提取纯文本预览（去 [xxx的消息：] 等包裹）
function getMessagePreview(content) {
    if (!content || typeof content !== 'string') return '';
    const match = content.match(/\[.*?的消息：([\s\S]+?)\]$/);
    if (match && match[1]) return match[1].trim();
    if (/\[.*?的表情包：.*?\]/.test(content)) return '[表情包]';
    if (/\[.*?的语音：.*?\]/.test(content)) return '[语音]';
    if (/\[.*?发来的照片\/视频：.*?\]/.test(content)) return '[照片/视频]';
    return content;
}

// 获取发送者显示名
function getSenderName(chat, message) {
    if (message.role === 'user') {
        return (currentChatType === 'private') ? (chat.myName || '我') : (chat.me && chat.me.nickname ? chat.me.nickname : '我');
    }
    if (currentChatType === 'private') return chat.remarkName || chat.name || '对方';
    const member = chat.members && chat.members.find(m => m.id === message.senderId);
    return member ? (member.groupNickname || member.name || '成员') : '未知';
}

// 获取聊天显示名（角色名或群名）
function getChatDisplayName(chatType, chatId) {
    if (chatType === 'private') {
        const c = db.characters.find(c => c.id === chatId);
        return c ? (c.remarkName || c.name || '角色') : '未知';
    }
    const g = db.groups.find(g => g.id === chatId);
    return g ? (g.name || '群聊') : '未知';
}

// 单条消息收藏
function addMessageToFavorites(messageId) {
    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    if (!chat || !chat.history) return;
    const message = chat.history.find(m => m.id === messageId);
    if (!message) return;

    const content = typeof message.content === 'string' ? message.content : (message.parts && message.parts[0] ? message.parts[0].text : '');
    const chatName = getChatDisplayName(currentChatType, currentChatId);
    const sender = getSenderName(chat, message);

    const existing = (db.favorites || []).find(f => f.chatId === currentChatId && f.chatType === currentChatType && f.messageId === messageId && (f.favoriteBy !== 'character'));
    if (existing) {
        showToast('该消息已在收藏中');
        return;
    }

    const fav = {
        id: 'fav_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
        messageId: message.id,
        chatId: currentChatId,
        chatType: currentChatType,
        chatName: chatName,
        content: content,
        timestamp: message.timestamp || Date.now(),
        favoriteTime: Date.now(),
        note: '',
        sender: sender,
        favoriteBy: 'user',
        characterId: null
    };
    if (!db.favorites) db.favorites = [];
    db.favorites.push(fav);
    saveData().then(() => {
        showToast('已收藏');
        if (typeof triggerHapticFeedback === 'function') triggerHapticFeedback('light');
    });
}

// 多选收藏：将当前选中的消息全部加入收藏
function addFavoritesFromSelection() {
    if (!selectedMessageIds || selectedMessageIds.size === 0) {
        showToast('请至少选择一条消息');
        return;
    }
    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    if (!chat || !chat.history) return;

    let added = 0;
    const existingIds = new Set((db.favorites || []).filter(f => f.chatId === currentChatId && f.chatType === currentChatType && (f.favoriteBy !== 'character')).map(f => f.messageId));

    const chatName = getChatDisplayName(currentChatType, currentChatId);
    const messages = chat.history.filter(m => selectedMessageIds.has(m.id));

    if (!db.favorites) db.favorites = [];
    messages.forEach(message => {
        if (existingIds.has(message.id)) return;
        const content = typeof message.content === 'string' ? message.content : (message.parts && message.parts[0] ? message.parts[0].text : '');
        const sender = getSenderName(chat, message);
        db.favorites.push({
            id: 'fav_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
            messageId: message.id,
            chatId: currentChatId,
            chatType: currentChatType,
            chatName: chatName,
            content: content,
            timestamp: message.timestamp || Date.now(),
            favoriteTime: Date.now(),
            note: '',
            sender: sender,
            favoriteBy: 'user',
            characterId: null
        });
        existingIds.add(message.id);
        added++;
    });

    saveData().then(() => {
        if (typeof exitMultiSelectMode === 'function') exitMultiSelectMode();
        showToast(added > 0 ? `已收藏 ${added} 条消息` : '选中消息已在收藏中');
        if (added > 0 && typeof triggerHapticFeedback === 'function') triggerHapticFeedback('medium');
    });
}

// 多选收藏（合并为一条）：将选中的消息按时间顺序合并成一条收藏，便于连贯查看
function addFavoritesFromSelectionMerged() {
    if (!selectedMessageIds || selectedMessageIds.size === 0) {
        showToast('请至少选择一条消息');
        return;
    }
    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    if (!chat || !chat.history) return;

    const messages = chat.history
        .filter(m => selectedMessageIds.has(m.id))
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    if (messages.length === 0) return;

    const chatName = getChatDisplayName(currentChatType, currentChatId);
    const parts = [];
    messages.forEach(m => {
        const content = typeof m.content === 'string' ? m.content : (m.parts && m.parts[0] ? m.parts[0].text : '');
        const text = getMessagePreview(content) || content || '';
        if (text.trim()) parts.push(text.trim());
    });
    const mergedContent = parts.join('\n\n');

    const first = messages[0];
    const fav = {
        id: 'fav_merged_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
        messageId: first.id,
        chatId: currentChatId,
        chatType: currentChatType,
        chatName: chatName,
        content: mergedContent,
        timestamp: first.timestamp || Date.now(),
        favoriteTime: Date.now(),
        note: '',
        sender: '多条消息',
        favoriteBy: 'user',
        characterId: null,
        merged: true
    };
    if (!db.favorites) db.favorites = [];
    db.favorites.push(fav);
    saveData().then(() => {
        if (typeof exitMultiSelectMode === 'function') exitMultiSelectMode();
        showToast(`已合并 ${messages.length} 条消息为一条收藏`);
        if (typeof triggerHapticFeedback === 'function') triggerHapticFeedback('medium');
    });
}

// 角色静默收藏（仅收藏用户消息，不提示）
function addCharacterFavorite(messageId, characterId, note) {
    const chat = db.characters.find(c => c.id === characterId);
    if (!chat || !chat.history) return;
    const message = chat.history.find(m => m.id === messageId);
    if (!message) return;
    if (message.role !== 'user') return;
    const existing = (db.favorites || []).find(
        f => f.messageId === messageId && f.characterId === characterId && f.favoriteBy === 'character'
    );
    if (existing) return;
    const content = typeof message.content === 'string' ? message.content : (message.parts && message.parts[0] ? message.parts[0].text : '');
    const chatName = chat.remarkName || chat.name || '角色';
    const sender = chat.myName || '我';
    const fav = {
        id: 'fav_char_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
        messageId: message.id,
        chatId: characterId,
        chatType: 'private',
        chatName: chatName,
        content: content,
        timestamp: message.timestamp || Date.now(),
        favoriteTime: Date.now(),
        note: (note || '').trim(),
        sender: sender,
        favoriteBy: 'character',
        characterId: characterId
    };
    if (!db.favorites) db.favorites = [];
    db.favorites.push(fav);
    saveData();
}

// 打开收藏界面（从更多页进入）
function openFavoritesScreen() {
    if (favoritesMultiSelectMode) exitFavoritesMultiSelectMode();
    currentFavoritesFilter = 'user';
    renderFavoritesList(currentFavoritesFilter);
    switchScreen('favorites-screen');
    const tabs = document.querySelectorAll('.favorites-tab');
    tabs.forEach(t => {
        t.classList.toggle('active', t.dataset.filter === currentFavoritesFilter);
    });
}

let currentFavoritesFilter = 'user';

// 按 chatKey 分组：私聊用 chatId，群聊用 chatId（仅用户收藏）
function getFavoritesByChat() {
    const list = (db.favorites || []).filter(f => f.favoriteBy !== 'character');
    const map = {};
    list.forEach(f => {
        const key = f.chatType + '_' + f.chatId;
        if (!map[key]) map[key] = { chatId: f.chatId, chatType: f.chatType, chatName: f.chatName, items: [] };
        map[key].items.push(f);
    });
    return Object.values(map).map(g => ({
        ...g,
        items: g.items.sort((a, b) => b.favoriteTime - a.favoriteTime)
    })).sort((a, b) => {
        const lastA = a.items[0] && a.items[0].favoriteTime || 0;
        const lastB = b.items[0] && b.items[0].favoriteTime || 0;
        return lastB - lastA;
    });
}

// 按角色分组的角色收藏
function getCharacterFavoritesByCharacter() {
    const list = (db.favorites || []).filter(f => f.favoriteBy === 'character');
    const map = {};
    list.forEach(f => {
        const key = f.characterId || f.chatId;
        if (!map[key]) map[key] = { characterId: key, characterName: f.chatName, items: [] };
        map[key].items.push(f);
    });
    return Object.values(map).map(g => ({
        ...g,
        items: g.items.sort((a, b) => b.favoriteTime - a.favoriteTime)
    })).sort((a, b) => {
        const lastA = a.items[0] && a.items[0].favoriteTime || 0;
        const lastB = b.items[0] && b.items[0].favoriteTime || 0;
        return lastB - lastA;
    });
}

// 渲染收藏列表（按 tab：我的收藏 / 角色收藏）
function renderFavoritesList(filter) {
    const f = (typeof filter === 'string') ? filter : currentFavoritesFilter;
    currentFavoritesFilter = f;
    const container = document.getElementById('favorites-list-container');
    const emptyEl = document.getElementById('favorites-empty-placeholder');
    const emptyText = document.getElementById('favorites-empty-text');
    const emptyHint = document.getElementById('favorites-empty-hint');
    if (!container) return;

    if (f === 'character') {
        const groups = getCharacterFavoritesByCharacter();
        if (groups.length === 0) {
            container.innerHTML = '';
            if (emptyEl) emptyEl.style.display = 'block';
            if (emptyText) emptyText.textContent = '角色还没有收藏任何消息';
            if (emptyHint) emptyHint.textContent = '在对应角色的设置→功能中开启「角色自主收藏」后，该角色会自主收藏认为重要的用户消息';
        } else {
            if (emptyEl) emptyEl.style.display = 'none';
            container.innerHTML = groups.map(g => {
                const itemsHtml = g.items.map(fav => {
                    const preview = getMessagePreview(fav.content);
                    const previewShort = preview.length > 60 ? preview.slice(0, 60) + '…' : preview;
                    const timeStr = formatFavoriteTime(fav.favoriteTime);
                    const note = (fav.note || '').trim();
                    return `
                    <div class="favorite-card character-favorite" data-favorite-id="${fav.id}">
                        <div class="favorite-checkbox"></div>
                        <div class="favorite-card-content">${escapeHtml(previewShort)}</div>
                        ${note ? `<div class="favorite-card-note"><span class="character-thought-icon">💭</span>${escapeHtml(note)}</div>` : ''}
                        <div class="favorite-card-meta">
                            <span class="favorite-card-time">${timeStr}</span>
                        </div>
                    </div>`;
                }).join('');
                return `
                <div class="favorites-group character-favorites-group">
                    <div class="favorites-group-header" style="display: flex; align-items: center;">
                        <span class="favorites-group-name">${escapeHtml(g.characterName)}</span>
                        <span class="favorites-group-badge character-favorite-badge">角色收藏</span>
                        <div style="flex: 1;"></div>
                        <button class="icon-btn-simple favorites-group-delete-btn" data-chat-id="${g.characterId}" data-favorite-by="character" title="删除该角色所有收藏">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#ff4d4f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                    </div>
                    <div class="favorites-group-list">${itemsHtml}</div>
                </div>`;
            }).join('');
        }
    } else {
        const groups = getFavoritesByChat();
        if (groups.length === 0) {
            container.innerHTML = '';
            if (emptyEl) emptyEl.style.display = 'block';
            if (emptyText) emptyText.textContent = '还没有收藏任何消息';
            if (emptyHint) emptyHint.textContent = '在聊天中长按消息，选择「收藏」或「多选收藏」即可添加';
        } else {
            if (emptyEl) emptyEl.style.display = 'none';
            container.innerHTML = groups.map(g => {
                const typeLabel = g.chatType === 'private' ? '私聊' : '群聊';
                const itemsHtml = g.items.map(fav => {
                    const preview = getMessagePreview(fav.content);
                    const previewShort = preview.length > 80 ? preview.slice(0, 80) + '…' : preview;
                    const favoriteTimeStr = formatFavoriteTime(fav.favoriteTime);
                    const sendTimeStr = formatMessageSendTime(fav.timestamp);
                    const note = (fav.note || '').trim();
                    return `
                    <div class="favorite-card" data-favorite-id="${fav.id}">
                        <div class="favorite-checkbox"></div>
                        <div class="favorite-card-content">${escapeHtml(previewShort)}</div>
                        <div class="favorite-card-meta">
                            <span class="favorite-card-time">${sendTimeStr}</span>
                            <span class="favorite-card-time-sep">·</span>
                            <span class="favorite-card-time">${favoriteTimeStr}</span>
                            ${note ? `<span class="favorite-card-note-tag">${escapeHtml(note)}</span>` : ''}
                        </div>
                    </div>`;
                }).join('');
                return `
                <div class="favorites-group" data-chat-id="${g.chatId}" data-chat-type="${g.chatType}">
                    <div class="favorites-group-header" style="display: flex; align-items: center;">
                        <span class="favorites-group-name">${escapeHtml(g.chatName)}</span>
                        <span class="favorites-group-badge">${typeLabel}</span>
                        <div style="flex: 1;"></div>
                        <button class="icon-btn-simple favorites-group-delete-btn" data-chat-id="${g.chatId}" data-chat-type="${g.chatType}" data-favorite-by="user" title="删除该分组所有收藏">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#ff4d4f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                    </div>
                    <div class="favorites-group-list">${itemsHtml}</div>
                </div>`;
            }).join('');
        }
    }

    // 点击由 initFavoritesScreen 中容器上的事件委托统一处理
}

let favoritesMultiSelectMode = false;
let selectedFavoriteIds = new Set();

function onFavoritesListClick(e) {
    const card = e.target.closest('.favorite-card');
    if (!card) return;
    const favoriteId = card.dataset.favoriteId;
    if (!favoriteId) return;

    if (favoritesMultiSelectMode) {
        if (selectedFavoriteIds.has(favoriteId)) {
            selectedFavoriteIds.delete(favoriteId);
            const cb = card.querySelector('.favorite-checkbox');
            if (cb) cb.classList.remove('checked');
        } else {
            selectedFavoriteIds.add(favoriteId);
            const cb = card.querySelector('.favorite-checkbox');
            if (cb) cb.classList.add('checked');
        }
        updateFavoritesSelectCount();
        return;
    }
    openFavoriteDetail(favoriteId);
}

function updateFavoritesSelectCount() {
    const el = document.getElementById('favorites-select-count');
    if (el) el.textContent = `已选 ${selectedFavoriteIds.size} 项`;
    const deleteBtn = document.getElementById('favorites-batch-delete-btn');
    if (deleteBtn) deleteBtn.disabled = selectedFavoriteIds.size === 0;
}

function enterFavoritesMultiSelectMode() {
    favoritesMultiSelectMode = true;
    selectedFavoriteIds.clear();
    const screen = document.getElementById('favorites-screen');
    const bar = document.getElementById('favorites-multi-select-bar');
    const deleteBtn = document.getElementById('favorites-delete-btn');
    if (screen) screen.classList.add('favorites-multi-select-mode');
    if (bar) bar.style.display = 'flex';
    if (deleteBtn) deleteBtn.style.display = 'none'; // 进入多选后隐藏删除图标，由底部栏操作
    updateFavoritesSelectCount();
}

function exitFavoritesMultiSelectMode() {
    favoritesMultiSelectMode = false;
    selectedFavoriteIds.clear();
    const screen = document.getElementById('favorites-screen');
    const bar = document.getElementById('favorites-multi-select-bar');
    const deleteBtn = document.getElementById('favorites-delete-btn');
    if (screen) screen.classList.remove('favorites-multi-select-mode');
    if (bar) bar.style.display = 'none';
    if (deleteBtn) deleteBtn.style.display = '';
    const container = document.getElementById('favorites-list-container');
    if (container) container.querySelectorAll('.favorite-checkbox').forEach(cb => cb.classList.remove('checked'));
    
    // 恢复全选按钮文本
    const selectAllBtn = document.getElementById('favorites-select-all-btn');
    if (selectAllBtn) selectAllBtn.textContent = '全选';
}

function selectAllFavorites() {
    const container = document.getElementById('favorites-list-container');
    if (!container) return;
    
    const allCards = container.querySelectorAll('.favorite-card');
    if (allCards.length === 0) return;
    
    if (selectedFavoriteIds.size === allCards.length) {
        // 如果已经全选，则取消全选
        selectedFavoriteIds.clear();
        allCards.forEach(card => {
            const cb = card.querySelector('.favorite-checkbox');
            if (cb) cb.classList.remove('checked');
        });
        const selectAllBtn = document.getElementById('favorites-select-all-btn');
        if (selectAllBtn) selectAllBtn.textContent = '全选';
    } else {
        // 否则全选
        allCards.forEach(card => {
            const id = card.dataset.favoriteId;
            if (id) {
                selectedFavoriteIds.add(id);
                const cb = card.querySelector('.favorite-checkbox');
                if (cb) cb.classList.add('checked');
            }
        });
        const selectAllBtn = document.getElementById('favorites-select-all-btn');
        if (selectAllBtn) selectAllBtn.textContent = '取消全选';
    }
    updateFavoritesSelectCount();
}

function deleteSelectedFavorites() {
    if (selectedFavoriteIds.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedFavoriteIds.size} 条收藏吗？`)) return;
    db.favorites = (db.favorites || []).filter(f => !selectedFavoriteIds.has(f.id));
    saveData().then(() => {
        showToast('已删除');
        exitFavoritesMultiSelectMode();
        renderFavoritesList(currentFavoritesFilter);
    });
}

function deleteFavoritesByGroup(chatType, chatId, favoriteBy) {
    if (!confirm('确定要删除该分组下的所有收藏记录吗？此操作不可恢复。')) return;
    
    db.favorites = (db.favorites || []).filter(f => {
        if (favoriteBy === 'character') {
            const key = f.characterId || f.chatId;
            return !(f.favoriteBy === 'character' && key === chatId);
        } else {
            return !(f.favoriteBy !== 'character' && f.chatType === chatType && f.chatId === chatId);
        }
    });
    
    saveData().then(() => {
        showToast('已删除该分组所有收藏');
        renderFavoritesList(currentFavoritesFilter);
    });
}

function formatFavoriteTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    let dateStr;
    if (dDate.getTime() === today.getTime()) dateStr = '今天';
    else if (dDate.getTime() === yesterday.getTime()) dateStr = '昨天';
    else dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${dateStr} ${timeStr} 收藏`;
}

// 消息发送时间（用于列表展示，不含「收藏」后缀）
function formatMessageSendTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    let dateStr;
    if (dDate.getTime() === today.getTime()) dateStr = '今天';
    else if (dDate.getTime() === yesterday.getTime()) dateStr = '昨天';
    else dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${dateStr} ${timeStr} 发送`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 打开收藏详情（查看内容 + 编辑寄语）
function openFavoriteDetail(favoriteId) {
    const fav = (db.favorites || []).find(f => f.id === favoriteId);
    if (!fav) return;
    const titleEl = document.getElementById('favorite-detail-title');
    const contentEl = document.getElementById('favorite-detail-content');
    const metaEl = document.getElementById('favorite-detail-meta');
    const noteInput = document.getElementById('favorite-detail-note');
    const deleteBtn = document.getElementById('favorite-detail-delete-btn');
    const saveNoteBtn = document.getElementById('favorite-detail-save-note-btn');
    const noteSection = document.querySelector('.favorite-detail-note-section');
    if (!contentEl || !noteInput) return;

    currentFavoriteDetailId = favoriteId;
    const preview = getMessagePreview(fav.content);
    const timeStr = formatFavoriteTime(fav.favoriteTime);
    const msgTimeStr = formatFavoriteTime(fav.timestamp);
    const isCharacterFavorite = fav.favoriteBy === 'character';

    if (titleEl) titleEl.textContent = fav.chatName;
    if (metaEl) {
        if (isCharacterFavorite) {
            metaEl.textContent = `由 ${fav.chatName} 收藏 · ${timeStr} · 消息时间 ${msgTimeStr} · ${fav.sender}`;
        } else {
            metaEl.textContent = `收藏于 ${timeStr} · 消息时间 ${msgTimeStr} · ${fav.sender}`;
        }
    }
    contentEl.textContent = preview;
    noteInput.value = fav.note || '';
    noteInput.readOnly = isCharacterFavorite;
    noteInput.placeholder = isCharacterFavorite ? '角色的收藏寄语（只读）' : '写一句想记住的话…';
    if (saveNoteBtn) saveNoteBtn.style.display = isCharacterFavorite ? 'none' : '';
    if (noteSection) {
        const label = noteSection.querySelector('.favorite-detail-note-label');
        if (label) label.textContent = isCharacterFavorite ? '角色收藏寄语' : '收藏寄语';
    }
    if (deleteBtn) {
        deleteBtn.onclick = () => confirmDeleteFavorite(favoriteId);
    }
    switchScreen('favorites-detail-screen');
}

// 保存收藏寄语
function saveFavoriteNote() {
    const id = currentFavoriteDetailId;
    const noteInput = document.getElementById('favorite-detail-note');
    if (!id || !noteInput) return;
    const fav = (db.favorites || []).find(f => f.id === id);
    if (!fav) return;
    fav.note = noteInput.value.trim();
    saveData().then(() => {
        showToast('寄语已保存');
        renderFavoritesList(currentFavoritesFilter);
    });
}

function confirmDeleteFavorite(favoriteId) {
    if (!confirm('确定要取消收藏这条消息吗？')) return;
    db.favorites = (db.favorites || []).filter(f => f.id !== favoriteId);
    saveData().then(() => {
        showToast('已取消收藏');
        switchScreen('favorites-screen');
        renderFavoritesList(currentFavoritesFilter);
    });
}

let currentFavoriteDetailId = null;

// 初始化收藏界面事件
function initFavoritesScreen() {
    const backBtn = document.querySelector('#favorites-screen .back-btn');
    if (backBtn) backBtn.addEventListener('click', () => { exitFavoritesMultiSelectMode(); switchScreen('more-screen'); });

    const detailBackBtn = document.querySelector('#favorites-detail-screen .back-btn');
    if (detailBackBtn) detailBackBtn.addEventListener('click', () => switchScreen('favorites-screen'));

    const saveNoteBtn = document.getElementById('favorite-detail-save-note-btn');
    if (saveNoteBtn) saveNoteBtn.addEventListener('click', saveFavoriteNote);

    // 收藏列表点击委托：多选时勾选/取消，否则进入详情，处理分组删除
    const listContainer = document.getElementById('favorites-list-container');
    if (listContainer) {
        listContainer.addEventListener('click', (e) => {
            const deleteGroupBtn = e.target.closest('.favorites-group-delete-btn');
            if (deleteGroupBtn) {
                e.stopPropagation();
                const chatId = deleteGroupBtn.dataset.chatId;
                const chatType = deleteGroupBtn.dataset.chatType;
                const favoriteBy = deleteGroupBtn.dataset.favoriteBy;
                deleteFavoritesByGroup(chatType, chatId, favoriteBy);
                return;
            }
            onFavoritesListClick(e);
        });
    }

    // 右上角删除按钮：进入多选删除模式
    const deleteBtn = document.getElementById('favorites-delete-btn');
    if (deleteBtn) deleteBtn.addEventListener('click', enterFavoritesMultiSelectMode);

    const cancelMultiBtn = document.getElementById('favorites-multi-select-cancel-btn');
    if (cancelMultiBtn) cancelMultiBtn.addEventListener('click', exitFavoritesMultiSelectMode);

    const batchDeleteBtn = document.getElementById('favorites-batch-delete-btn');
    if (batchDeleteBtn) batchDeleteBtn.addEventListener('click', deleteSelectedFavorites);
    
    const selectAllBtn = document.getElementById('favorites-select-all-btn');
    if (selectAllBtn) selectAllBtn.addEventListener('click', selectAllFavorites);

    document.querySelectorAll('.favorites-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const filter = tab.dataset.filter;
            if (!filter) return;
            if (favoritesMultiSelectMode) exitFavoritesMultiSelectMode();
            currentFavoritesFilter = filter;
            document.querySelectorAll('.favorites-tab').forEach(t => t.classList.toggle('active', t.dataset.filter === filter));
            renderFavoritesList(filter);
        });
    });
}

// 供全局调用
window.addMessageToFavorites = addMessageToFavorites;
window.addFavoritesFromSelection = addFavoritesFromSelection;
window.addFavoritesFromSelectionMerged = addFavoritesFromSelectionMerged;
window.addCharacterFavorite = addCharacterFavorite;
window.openFavoritesScreen = openFavoritesScreen;
window.renderFavoritesList = renderFavoritesList;
