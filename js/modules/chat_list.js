// --- 聊天列表与文件夹管理模块 ---

// 聊天列表屏幕逻辑
function setupChatListScreen() {
    renderChatList();

    // 初始化商城系统 (集成点)
    if (typeof setupShopSystem === 'function') {
        setupShopSystem();
    }

    // 绑定旧按钮事件 (如果存在)
    const addChatBtn = document.getElementById('add-chat-btn');
    if (addChatBtn) {
        addChatBtn.addEventListener('click', () => {
            openCreateCharMethodSheet();
        });
    }

    // 绑定 KKT 风格 Header 新按钮
    const addChatBtnKkt = document.getElementById('add-chat-btn-kkt');
    if (addChatBtnKkt) {
        addChatBtnKkt.addEventListener('click', () => {
            openCreateCharMethodSheet();
        });
    }

    const createGroupBtnKkt = document.getElementById('create-group-btn-kkt');
    if (createGroupBtnKkt) {
        createGroupBtnKkt.addEventListener('click', () => {
            renderMemberSelectionList();
            document.getElementById('create-group-modal').classList.add('visible');
        });
    }

    const importBtnKkt = document.getElementById('import-btn-kkt');
    const cardInput = document.getElementById('character-card-input');
    const ovoCardInput = document.getElementById('ovo-character-card-input');
    if (importBtnKkt) {
        importBtnKkt.addEventListener('click', () => {
            cardInput.click();
        });
    }

    cardInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleCharacterImport(file);
        }
        e.target.value = null;
    });

    ovoCardInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            showToast('正在解析专属角色卡...');
            try {
                let result;
                if (file.name.endsWith('.png')) {
                    result = await readOvoPngMetadata(file);
                } else if (file.name.endsWith('.json')) {
                    result = await parseCharJson(file); // JSON can be parsed exactly the same
                } else {
                    throw new Error('不支持的文件格式。请选择 .png 或 .json 文件。');
                }

                if (result && result.data) {
                    const importedChar = result.data.data || result.data;
                    importedChar.id = `char_${Date.now()}`; // 重新生成 ID 防止冲突
                    
                    // 如果没有头像但导出了 PNG 头像，则合并回去
                    if (result.avatar && !importedChar.avatar) {
                        importedChar.avatar = result.avatar;
                    }
                    
                    db.characters.push(importedChar);
                    await saveData();
                    renderChatList();
                    if (typeof renderContactList === 'function') renderContactList();
                    showToast(`专属角色卡“${importedChar.remarkName || importedChar.realName || '未命名'}”导入成功！`);
                }
            } catch (error) {
                console.error('专属角色卡导入失败:', error);
                showToast(`导入失败: ${error.message}`);
            }
        }
        e.target.value = null;
    });

    const chatListContainer = document.getElementById('chat-list-container');
    chatListContainer.addEventListener('click', (e) => {
        const chatItem = e.target.closest('.chat-item');
        if (chatItem) {
            currentChatId = chatItem.dataset.id;
            currentChatType = chatItem.dataset.type;

            const chat = (currentChatType === 'private')
                ? db.characters.find(c => c.id === currentChatId)
                : db.groups.find(g => g.id === currentChatId);

            if (chat) {
                updateCustomBubbleStyle(currentChatId, chat.customBubbleCss, chat.useCustomBubbleCss);
            }

            openChatRoom(currentChatId, currentChatType);
        }
    });

    chatListContainer.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const chatItem = e.target.closest('.chat-item');
        if (!chatItem) return;
        handleChatListLongPress(chatItem.dataset.id, chatItem.dataset.type, e.clientX, e.clientY);
    });
    chatListContainer.addEventListener('touchstart', (e) => {
        const chatItem = e.target.closest('.chat-item');
        if (!chatItem) return;
        longPressTimer = setTimeout(() => {
            const touch = e.touches[0];
            handleChatListLongPress(chatItem.dataset.id, chatItem.dataset.type, touch.clientX, touch.clientY);
        }, 400);
    });
    chatListContainer.addEventListener('touchend', () => clearTimeout(longPressTimer));
    chatListContainer.addEventListener('touchmove', () => clearTimeout(longPressTimer));

    setupFolderManagement();
    setupImportConfirmModal();
    // 初始化文档导入功能
    setupCreateCharMethodSheet();
    setupDocImportSelectModal();
    setupDocPreviewModal();
}

// 文件夹管理
function setupFolderManagement() {
    const folderModal = document.getElementById('folder-manage-modal');
    const folderNameInput = document.getElementById('folder-name-input');
    const confirmBtn = document.getElementById('folder-confirm-btn');
    const deleteBtn = document.getElementById('folder-delete-btn');
    const cancelBtn = document.getElementById('folder-cancel-btn');

    window.openCreateFolderModal = () => {
        currentFolderActionTarget = null;
        document.getElementById('folder-modal-title').textContent = '新建文件夹';
        folderNameInput.value = '';
        deleteBtn.style.display = 'none';
        folderModal.classList.add('visible');
    };

    window.openEditFolderModal = (folderId) => {
        const folder = db.chatFolders.find(f => f.id === folderId);
        if (!folder) return;

        currentFolderActionTarget = folderId;
        document.getElementById('folder-modal-title').textContent = '管理文件夹';
        folderNameInput.value = folder.name;
        deleteBtn.style.display = 'block';
        folderModal.classList.add('visible');
    };

    confirmBtn.addEventListener('click', async () => {
        const name = folderNameInput.value.trim();
        if (!name) return showToast('请输入文件夹名称');

        if (currentFolderActionTarget) {
            const folder = db.chatFolders.find(f => f.id === currentFolderActionTarget);
            if (folder) folder.name = name;
            showToast('文件夹已更新');
        } else {
            const newFolder = {
                id: `folder_${Date.now()}`,
                name: name
            };
            if (!db.chatFolders) db.chatFolders = [];
            db.chatFolders.push(newFolder);
            showToast('文件夹已创建');
        }

        await saveData();
        renderChatFolders();
        folderModal.classList.remove('visible');
    });

    deleteBtn.addEventListener('click', async () => {
        if (!currentFolderActionTarget) return;
        if (confirm('确定删除此文件夹吗？其中的聊天不会被删除，将归入"全部"列表。')) {
            db.chatFolders = db.chatFolders.filter(f => f.id !== currentFolderActionTarget);

            db.characters.forEach(c => { if (c.folderId === currentFolderActionTarget) delete c.folderId; });
            db.groups.forEach(g => { if (g.folderId === currentFolderActionTarget) delete g.folderId; });

            if (currentFolderId === currentFolderActionTarget) {
                currentFolderId = 'all';
            }

            await saveData();
            renderChatFolders();
            renderChatList();
            folderModal.classList.remove('visible');
            showToast('文件夹已删除');
        }
    });

    cancelBtn.addEventListener('click', () => folderModal.classList.remove('visible'));

    const moveFolderModal = document.getElementById('move-to-folder-modal');
    const folderSelectionList = document.getElementById('folder-selection-list');
    const closeMoveModalBtn = document.getElementById('close-move-folder-modal');
    let chatToMove = null;

    window.openMoveToFolderModal = (chatId, chatType) => {
        chatToMove = { id: chatId, type: chatType };
        folderSelectionList.innerHTML = '';

        const removeLi = document.createElement('li');
        removeLi.className = 'list-item';
        removeLi.textContent = '❌ 移出文件夹 (归入全部)';
        removeLi.onclick = async () => {
            await moveChatToFolder(null);
            moveFolderModal.classList.remove('visible');
        };
        folderSelectionList.appendChild(removeLi);

        if (db.chatFolders && db.chatFolders.length > 0) {
            db.chatFolders.forEach(folder => {
                const li = document.createElement('li');
                li.className = 'list-item';
                li.textContent = `📁 ${folder.name}`;
                li.onclick = async () => {
                    await moveChatToFolder(folder.id);
                    moveFolderModal.classList.remove('visible');
                };
                folderSelectionList.appendChild(li);
            });
        } else {
            const emptyLi = document.createElement('li');
            emptyLi.textContent = '暂无自定义文件夹，请先创建';
            emptyLi.style.padding = '15px';
            emptyLi.style.color = '#999';
            emptyLi.style.textAlign = 'center';
            folderSelectionList.appendChild(emptyLi);
        }

        moveFolderModal.classList.add('visible');
    };

    closeMoveModalBtn.addEventListener('click', () => moveFolderModal.classList.remove('visible'));

    async function moveChatToFolder(folderId) {
        if (!chatToMove) return;
        const { id, type } = chatToMove;
        const chat = (type === 'private') ? db.characters.find(c => c.id === id) : db.groups.find(g => g.id === id);

        if (chat) {
            if (folderId) {
                chat.folderId = folderId;
                showToast('已移动到文件夹');
            } else {
                delete chat.folderId;
                showToast('已移出文件夹');
            }
            await saveData();
            renderChatList();
        }
    }
}

function renderChatFolders() {
    const container = document.getElementById('chat-category-tabs');
    if (!container) return;

    container.innerHTML = '';

    const allTab = document.createElement('div');
    allTab.className = `tab-item ${currentFolderId === 'all' ? 'active pill-black' : 'pill-white'}`;
    allTab.textContent = 'All';
    allTab.onclick = () => {
        currentFolderId = 'all';
        renderChatFolders();
        renderChatList();
    };
    container.appendChild(allTab);

    if (db.chatFolders && db.chatFolders.length > 0) {
        db.chatFolders.forEach(folder => {
            const tab = document.createElement('div');
            tab.className = `tab-item ${currentFolderId === folder.id ? 'active pill-black' : 'pill-white'}`;
            tab.textContent = folder.name;

            tab.onclick = () => {
                currentFolderId = folder.id;
                renderChatFolders();
                renderChatList();
            };

            tab.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                window.openEditFolderModal(folder.id);
            });
            let pressTimer;
            tab.addEventListener('touchstart', () => {
                pressTimer = setTimeout(() => window.openEditFolderModal(folder.id), 500);
            });
            tab.addEventListener('touchend', () => clearTimeout(pressTimer));

            container.appendChild(tab);
        });
    }

    const addTab = document.createElement('div');
    addTab.className = 'tab-item tab-manage';
    addTab.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-list-stars" viewBox="0 0 16 16">
<path fill-rule="evenodd" d="M5 11.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5z"/>
<path d="M2.242 2.194a.27.27 0 0 1 .516 0l.162.53c.035.115.14.194.258.194h.551c.259 0 .37.333.164.493l-.468.363a.277.277 0 0 0-.094.3l.173.569c.078.256-.213.462-.423.3l-.417-.324a.267.267 0 0 0-.328 0l-.417.323c-.21.163-.5-.043-.423-.299l.173-.57a.277.277 0 0 0-.094-.299l-.468-.363c-.206-.16-.095-.493.164-.493h.55a.271.271 0 0 0 .259-.194l.162-.53zm0 4a.27.27 0 0 1 .516 0l.162.53c.035.115.14.194.258.194h.551c.259 0 .37.333.164.493l-.468.363a.277.277 0 0 0-.094.3l.173.569c.078.255-.213.462-.423.3l-.417-.324a.267.267 0 0 0-.328 0l-.417.323c-.21.163-.5-.043-.423-.299l.173-.57a.277.277 0 0 0-.094-.299l-.468-.363c-.206-.16-.095-.493.164-.493h.55a.271.271 0 0 0 .259-.194l.162-.53zm0 4a.27.27 0 0 1 .516 0l.162.53c.035.115.14.194.258.194h.551c.259 0 .37.333.164.493l-.468.363a.277.277 0 0 0-.094.3l.173.569c.078.255-.213.462-.423.3l-.417-.324a.267.267 0 0 0-.328 0l-.417.323c-.21.163-.5-.043-.423-.299l.173-.57a.277.277 0 0 0-.094-.299l-.468-.363c-.206-.16-.095-.493.164-.493h.55a.271.271 0 0 0 .259-.194l.162-.53z"/>
</svg>`;
    addTab.onclick = () => window.openCreateFolderModal();
    container.appendChild(addTab);
}

function handleChatListLongPress(chatId, chatType, x, y) {
    clearTimeout(longPressTimer);
    // 清除可能存在的文本选择，防止干扰菜单点击
    if (window.getSelection) {
        window.getSelection().removeAllRanges();
    }
    const chatItem = (chatType === 'private') ? db.characters.find(c => c.id === chatId) : db.groups.find(g => g.id === chatId);
    if (!chatItem) return;
    const itemName = chatType === 'private' ? chatItem.remarkName : chatItem.name;
    const menuItems = [
        {
            label: chatItem.isPinned ? '取消置顶' : '置顶聊天',
            action: async () => {
                chatItem.isPinned = !chatItem.isPinned;
                await saveData();
                renderChatList();
            }
        },
        {
            label: '移动到文件夹...',
            action: () => {
                window.openMoveToFolderModal(chatId, chatType);
            }
        },
        {
            label: '删除聊天',
            danger: true,
            action: async () => {
                if (confirm(`确定要删除与“${itemName}”的聊天记录吗？此操作不可恢复。`)) {
                    if (chatType === 'private') {
                        await dexieDB.characters.delete(chatId);
                        db.characters = db.characters.filter(c => c.id !== chatId);
                    } else {
                        await dexieDB.groups.delete(chatId);
                        db.groups = db.groups.filter(g => g.id !== chatId);
                    }
                    renderChatList();
                    showToast('聊天已删除');
                }
            }
        }
    ];
    createContextMenu(menuItems, x, y);
}

function renderChatList() {
    const chatListContainer = document.getElementById('chat-list-container');
    chatListContainer.innerHTML = '';

    if (document.getElementById('chat-category-tabs').children.length === 0) {
        renderChatFolders();
    }

    const allChats = [...db.characters.map(c => ({ ...c, type: 'private' })), ...db.groups.map(g => ({
        ...g,
        type: 'group'
    }))];

    let filteredChats;
    if (currentFolderId === 'all') {
        filteredChats = allChats.filter(chat => !chat.folderId);
    } else {
        filteredChats = allChats.filter(chat => chat.folderId === currentFolderId);
    }

    document.getElementById('no-chats-placeholder').style.display = filteredChats.length === 0 ? 'block' : 'none';

    const sortedChats = filteredChats.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        const lastMsgTimeA = a.history && a.history.length > 0 ? a.history[a.history.length - 1].timestamp : 0;
        const lastMsgTimeB = b.history && b.history.length > 0 ? b.history[b.history.length - 1].timestamp : 0;
        return lastMsgTimeB - lastMsgTimeA;
    });

    sortedChats.forEach(chat => {
        let lastMessageText = '开始聊天吧...';
        if (chat.history && chat.history.length > 0) {
            let invisibleRegex;
            if (chat.showStatusUpdateMsg) {
                invisibleRegex = /\[.*?(?:接收|退回).*?的转账\]|\[.*?已接收礼物\]|\[system:.*?\]|\[.*?邀请.*?加入了群聊\]|\[.*?修改群名为：.*?\]|\[system-display:.*?\]|\[avatar-action:.*?\]/;
            } else {
                invisibleRegex = /\[.*?(?:接收|退回).*?的转账\]|\[.*?更新状态为：.*?\]|\[.*?已接收礼物\]|\[system:.*?\]|\[.*?邀请.*?加入了群聊\]|\[.*?修改群名为：.*?\]|\[system-display:.*?\]|\[avatar-action:.*?\]/;
            }
            const visibleHistory = chat.history.filter(msg => !invisibleRegex.test(msg.content));
            if (visibleHistory.length > 0) {
                const lastMsg = visibleHistory[visibleHistory.length - 1];
                const urlRegex = /^(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|bmp|svg)|data:image\/[a-z]+;base64,)/i;
                const imageRecogRegex = /\[.*?发来了一张图片：\]/
                const voiceRegex = /\[.*?的语音：.*?\]/;
                const photoVideoRegex = /\[.*?发来的照片\/视频：.*?\]/;
                const transferRegex = /\[.*?的转账：.*?元.*?\]|\[.*?给你转账：.*?元.*?\]|\[.*?向.*?转账：.*?元.*?\]/;
                const locationRegex = /\[(.+?)的位置[：:].*?\]/;
                const stickerRegex = /\[.*?的表情包：.*?\]|\[.*?发送的表情包：.*?\]/;
                const giftRegex = /\[.*?送来的礼物：.*?\]|\[.*?向.*?送来了礼物：.*?\]/;

                if (giftRegex.test(lastMsg.content)) {
                    lastMessageText = '[礼物]';
                } else if (stickerRegex.test(lastMsg.content)) {
                    lastMessageText = '[表情包]';
                } else if (voiceRegex.test(lastMsg.content)) {
                    lastMessageText = '[语音]';
                } else if (photoVideoRegex.test(lastMsg.content)) {
                    lastMessageText = '[照片/视频]';
                } else if (transferRegex.test(lastMsg.content)) {
                    lastMessageText = '[转账]';
                } else if (locationRegex.test(lastMsg.content)) {
                    lastMessageText = '[定位]';
                } else if (imageRecogRegex.test(lastMsg.content) || (lastMsg.parts && lastMsg.parts.some(p => p.type === 'image'))) {
                    lastMessageText = '[图片]';
                } else if ((lastMsg.parts && lastMsg.parts.some(p => p.type === 'html'))) {
                    lastMessageText = '[互动]';
                } else {
                    let text = lastMsg.content.trim();
                    const plainTextMatch = text.match(/^\[.*?：([\s\S]*)\]$/);
                    if (plainTextMatch && plainTextMatch[1]) {
                        text = plainTextMatch[1].trim();
                    }
                    text = text.replace(/\[发送时间:.*?\]$/, '').trim();
                    const htmlRegex = /<[a-z][\s\S]*>/i;
                    if (htmlRegex.test(text)) {
                        lastMessageText = '[互动]';
                    } else {
                        lastMessageText = urlRegex.test(text) ? '[图片]' : text;
                    }
                }
            } else {
                const lastEverMsg = chat.history[chat.history.length - 1];
                const inviteRegex = /\[(.*?)邀请(.*?)加入了群聊\]/;
                const renameRegex = /\[.*?修改群名为：.*?\]/;
                const timeSkipRegex = /\[system-display:([\s\S]+?)\]/;
                const timeSkipMatch = lastEverMsg.content.match(timeSkipRegex);

                if (timeSkipMatch) {
                    lastMessageText = timeSkipMatch[1];
                } else if (inviteRegex.test(lastEverMsg.content)) {
                    lastMessageText = '新成员加入了群聊';
                } else if (renameRegex.test(lastEverMsg.content)) {
                    lastMessageText = '群聊名称已修改';
                } else {
                    lastMessageText = 'ta正在等你';
                }

            }
        }
        const li = document.createElement('li');
        li.className = 'list-item chat-item';
        if (chat.isPinned) li.classList.add('pinned');
        if (chat.type === 'private' && chat.isBlocked) li.classList.add('chat-item-blocked');
        if (chat.type === 'private' && chat.isBlockedByChar) li.classList.add('chat-item-blocked-by-char');
        li.dataset.id = chat.id;
        li.dataset.type = chat.type;
        const avatarClass = chat.type === 'group' ? 'group-avatar' : '';
        const itemName = chat.type === 'private' ? chat.remarkName : chat.name;
        const pinBadgeHTML = chat.isPinned ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="color: #999; margin-left: 4px; flex-shrink: 0;"><path d="M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z" /></svg>' : '';
        const blockedBadgeHTML = (chat.type === 'private' && chat.isBlocked) ? '<span class="chat-item-blocked-badge">已拉黑</span>' : '';
        const blockedByCharBadgeHTML = (chat.type === 'private' && chat.isBlockedByChar) ? '<span class="chat-item-blocked-by-char-badge">被对方拉黑</span>' : '';

        let timeString = '';
        const lastMessage = chat.history && chat.history.length > 0 ? chat.history[chat.history.length - 1] : null;
        if (lastMessage) {
            const date = new Date(lastMessage.timestamp);
            const now = new Date();
            const yesterday = new Date(now);
            yesterday.setDate(now.getDate() - 1);

            if (date.toDateString() === now.toDateString()) {
                timeString = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
            } else if (date.toDateString() === yesterday.toDateString()) {
                timeString = '昨天';
            } else {
                timeString = `${pad(date.getMonth() + 1)}月${pad(date.getDate())}日`;
            }
        }

        const unreadCount = chat.unreadCount || 0;
        const unreadClass = unreadCount > 0 ? 'visible' : '';
        const unreadText = unreadCount > 99 ? '99+' : unreadCount;

        li.innerHTML = `
            <img src="${chat.avatar}" alt="${itemName}" class="chat-avatar ${avatarClass}">
            <div class="item-details">
                <div class="item-details-row" style="justify-content: flex-start; align-items: center;">
                    <div class="item-name">${itemName}</div>
                    ${pinBadgeHTML}
                    ${blockedBadgeHTML}
                    ${blockedByCharBadgeHTML}
                </div>
                <div class="item-preview-wrapper">
                    <div class="item-preview">${lastMessageText}</div>
                </div>
            </div>
            <div class="item-meta-container">
                <span class="item-time">${timeString}</span>
                <span class="unread-badge ${unreadClass}">${unreadText}</span>
            </div>`;

        chatListContainer.appendChild(li);
    });
}
