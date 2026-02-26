// --- 表情包管理 (js/modules/sticker.js) ---

async function setupStickerSystem() {
    const stickerMenuBtn = document.getElementById('sticker-menu-btn');
    const stickerMenuActionSheet = document.getElementById('sticker-menu-actionsheet');
    const stickerCategoryBar = document.getElementById('sticker-category-bar');
    
    const menuMultiSelectBtn = document.getElementById('menu-multi-select-btn');
    const menuBatchImportBtn = document.getElementById('menu-batch-import-btn');
    const menuAddNewBtn = document.getElementById('menu-add-new-btn');
    const menuCancelBtn = document.getElementById('menu-cancel-btn');

    const deleteSelectedStickersBtn = document.getElementById('delete-selected-stickers-btn');
    const moveStickerGroupBtn = document.getElementById('move-sticker-group-btn');
    const stickerManageBar = document.getElementById('sticker-manage-bar');
    const selectAllStickersBtn = document.getElementById('select-all-stickers-btn');

    const moveStickerModal = document.getElementById('move-sticker-modal');
    const moveTargetGroupInput = document.getElementById('move-target-group-input');
    const confirmMoveStickerBtn = document.getElementById('confirm-move-sticker-btn');
    const cancelMoveStickerBtn = document.getElementById('cancel-move-sticker-btn');
    const existingGroupsList = document.getElementById('existing-groups-list');

    const batchAddStickerModal = document.getElementById('batch-add-sticker-modal');
    const batchAddStickerForm = document.getElementById('batch-add-sticker-form');
    const stickerUrlsTextarea = document.getElementById('sticker-urls-textarea');
    const batchStickerGroupInput = document.getElementById('batch-sticker-group');
    const addStickerModal = document.getElementById('add-sticker-modal');
    const addStickerForm = document.getElementById('add-sticker-form');
    const stickerNameInput = document.getElementById('sticker-name');
    const stickerGroupInput = document.getElementById('sticker-group');
    const stickerEditIdInput = document.getElementById('sticker-edit-id');
    const stickerPreview = document.getElementById('sticker-preview');
    const stickerUrlInput = document.getElementById('sticker-url-input');
    const stickerFileUpload = document.getElementById('sticker-file-upload');
    const addStickerModalTitle = document.getElementById('add-sticker-modal-title');

    stickerMenuBtn.addEventListener('click', () => {
        if (isStickerManageMode) {
            exitStickerManageMode();
        } else {
            stickerMenuActionSheet.classList.add('visible');
        }
    });

    menuCancelBtn.addEventListener('click', () => stickerMenuActionSheet.classList.remove('visible'));

    menuMultiSelectBtn.addEventListener('click', () => {
        stickerMenuActionSheet.classList.remove('visible');
        enterStickerManageMode();
    });

    function enterStickerManageMode() {
        isStickerManageMode = true;
        stickerManageBar.style.display = 'block';
        
        stickerMenuBtn.innerHTML = '<span style="font-size:14px; font-weight:bold; color:var(--primary-color);">完成</span>';
        selectedStickerIds.clear();
        updateStickerSelectCount();
        renderStickerGrid(); 
    }

    function exitStickerManageMode() {
        isStickerManageMode = false;
        stickerManageBar.style.display = 'none';
        
        stickerMenuBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z" /></svg>';
        selectedStickerIds.clear();
        renderStickerGrid();
    }

    function updateStickerSelectCount() {
        const count = selectedStickerIds.size;
        document.getElementById('sticker-select-count').textContent = `已选 ${count} 项`;
        deleteSelectedStickersBtn.disabled = count === 0;
        moveStickerGroupBtn.disabled = count === 0;
    }

    menuBatchImportBtn.addEventListener('click', () => {
        stickerMenuActionSheet.classList.remove('visible');
        batchAddStickerModal.classList.add('visible');
        stickerUrlsTextarea.value = '';
        batchStickerGroupInput.value = '';
    });

    menuAddNewBtn.addEventListener('click', () => {
        stickerMenuActionSheet.classList.remove('visible');
        addStickerModalTitle.textContent = '添加新表情';
        addStickerForm.reset();
        stickerEditIdInput.value = '';
        stickerPreview.innerHTML = '<span>预览</span>';
        stickerUrlInput.disabled = false;
        addStickerModal.classList.add('visible');
    });

    selectAllStickersBtn.addEventListener('click', () => {
        let stickersToSelect = [];
        
        if (currentStickerCategory === 'recent') {
            stickersToSelect = [...db.myStickers]
                .sort((a, b) => (b.lastUsedTime || 0) - (a.lastUsedTime || 0))
                .slice(0, 20);
        } else if (currentStickerCategory === 'all') {
            stickersToSelect = [...db.myStickers];
        } else if (currentStickerCategory === 'ungrouped') {
            stickersToSelect = db.myStickers.filter(s => !s.group);
        } else {
            stickersToSelect = db.myStickers.filter(s => s.group === currentStickerCategory);
        }

        stickersToSelect.forEach(s => selectedStickerIds.add(s.id));
        
        updateStickerSelectCount();
        renderStickerGrid();
        showToast(`已全选当前分组 ${stickersToSelect.length} 个表情`);
    });

    deleteSelectedStickersBtn.addEventListener('click', async () => {
        if (selectedStickerIds.size === 0) return;
        if (confirm(`确定要删除这 ${selectedStickerIds.size} 个表情吗？`)) {
            const idsToDelete = Array.from(selectedStickerIds);

            await dexieDB.myStickers.bulkDelete(idsToDelete);

            db.myStickers = db.myStickers.filter(s => !selectedStickerIds.has(s.id));
            
            await saveData();
            
            showToast('表情已彻底删除');
            exitStickerManageMode();
        }
    });

    moveStickerGroupBtn.addEventListener('click', () => {
        existingGroupsList.innerHTML = '';
        const groups = [...new Set(db.myStickers.map(s => s.group).filter(g => g))];
        groups.forEach(g => {
            const option = document.createElement('option');
            option.value = g;
            existingGroupsList.appendChild(option);
        });
        
        moveTargetGroupInput.value = '';
        moveStickerModal.classList.add('visible');
    });

    cancelMoveStickerBtn.addEventListener('click', () => moveStickerModal.classList.remove('visible'));

    confirmMoveStickerBtn.addEventListener('click', async () => {
        const newGroup = moveTargetGroupInput.value.trim();
        
        db.myStickers.forEach(s => {
            if (selectedStickerIds.has(s.id)) {
                s.group = newGroup;
            }
        });
        
        await saveData();
        showToast('分组已更新');
        moveStickerModal.classList.remove('visible');
        exitStickerManageMode();
        renderStickerCategories(); 
        renderStickerGrid();
    });

    stickerCategoryBar.addEventListener('click', (e) => {
        const item = e.target.closest('.sticker-category-item');
        if (item) {
            currentStickerCategory = item.dataset.category;
            renderStickerCategories(); 
            renderStickerGrid(); 
        }
    });

    batchAddStickerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const textInput = stickerUrlsTextarea.value.trim();
        const groupName = batchStickerGroupInput.value.trim();
        if (!textInput) return showToast('请输入数据');
        const lines = textInput.split('\n');
        const newStickers = [];
        for (const line of lines) {
            let trimmedLine = line.trim().replace('：', ':');
            if (!trimmedLine) continue;
            const colonIndex = trimmedLine.indexOf(':');
            if (colonIndex <= 0) continue;
            const name = trimmedLine.substring(0, colonIndex).trim();
            const url = trimmedLine.substring(colonIndex + 1).trim();
            if (name && url.startsWith('http')) {
                newStickers.push({
                    id: `sticker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name: name,
                    data: url,
                    group: groupName,
                    lastUsedTime: Date.now() 
                });
            }
        }
        if (newStickers.length > 0) {
            db.myStickers.push(...newStickers);
            await saveData();
            batchAddStickerModal.classList.remove('visible');
            showToast(`导入 ${newStickers.length} 个表情`);
            renderStickerCategories();
            renderStickerGrid();
        } else {
            showToast('格式错误');
        }
    });

    addStickerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = stickerNameInput.value.trim();
        const group = stickerGroupInput.value.trim();
        const id = stickerEditIdInput.value;
        const previewImg = stickerPreview.querySelector('img');
        const data = previewImg ? previewImg.src : null;
        if (!name || !data) return showToast('请填写完整');
        
        const stickerData = { name, data, group, lastUsedTime: Date.now() };
        
        if (id) {
            const index = db.myStickers.findIndex(s => s.id === id);
            if (index > -1) db.myStickers[index] = { ...db.myStickers[index], ...stickerData };
        } else {
            stickerData.id = `sticker_${Date.now()}`;
            db.myStickers.push(stickerData);
        }
        await saveData();
        addStickerModal.classList.remove('visible');
        showToast('保存成功');
        renderStickerCategories();
        renderStickerGrid();
    });
    
    stickerUrlInput.addEventListener('input', (e) => {
        stickerPreview.innerHTML = `<img src="${e.target.value}" alt="预览">`;
        stickerFileUpload.value = '';
    });
    stickerFileUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                const compressedUrl = await compressImage(file, {quality: 0.8, maxWidth: 200, maxHeight: 200});
                stickerPreview.innerHTML = `<img src="${compressedUrl}" alt="预览">`;
                stickerUrlInput.value = '';
                stickerUrlInput.disabled = true;
            } catch (error) {
                showToast('压缩失败');
            }
        }
    });

    const stickerToggleBtn = document.getElementById('sticker-toggle-btn');
    stickerToggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const msgInput = document.getElementById('message-input');
        const isKeyboardOpen = (document.activeElement === msgInput);
        
        if (msgInput) msgInput.blur(); // 强制收起键盘

        if (isKeyboardOpen) {
             // 键盘 -> 面板：无动画
             showPanel('sticker', true);
        } else {
            if (chatExpansionPanel.classList.contains('visible') && panelStickerArea.style.display !== 'none') {
                showPanel('none'); // 面板 -> 关闭：默认有动画
            } else {
                // 关闭 -> 面板 或 面板(功能) -> 面板(表情)：默认有动画
                showPanel('sticker');
            }
        }
    });
}

function renderStickerCategories() {
    const bar = document.getElementById('sticker-category-bar');
    
    // 保存搜索状态
    const existingSearchInput = document.getElementById('sticker-search-input');
    const searchValue = existingSearchInput ? existingSearchInput.value : '';
    const isSearchExpanded = existingSearchInput && (existingSearchInput.value || document.activeElement === existingSearchInput || existingSearchInput.closest('.sticker-search-tag.expanded'));

    bar.innerHTML = '';

    const groups = [...new Set(db.myStickers.map(s => s.group).filter(g => g))];
    
    // 1. 最近使用
    createCategoryItem(bar, { id: 'recent', name: '最近使用' });

    // 2. 搜索 Tag (插入在中间)
    const searchTag = document.createElement('div');
    searchTag.className = `sticker-category-item sticker-search-tag ${isSearchExpanded ? 'expanded' : ''}`;
    searchTag.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="search-icon"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input type="text" id="sticker-search-input" class="sticker-search-input" placeholder="搜索..." value="${searchValue}" autocomplete="off">
    `;
    
    const input = searchTag.querySelector('input');
    
    // 阻止 input 上的事件冒泡，防止被外层容器拦截（解决无法输入问题）
    ['mousedown', 'click', 'touchstart'].forEach(eventType => {
        input.addEventListener(eventType, (e) => {
            e.stopPropagation();
        });
    });

    // 点击 Tag 展开/收起
    searchTag.addEventListener('click', (e) => {
        // 如果点击的是 input，不要触发收起逻辑，保持聚焦
        if (e.target === input) {
            return;
        }
        
        if (searchTag.classList.contains('expanded')) {
            // 已展开 -> 收起
            searchTag.classList.remove('expanded');
            input.value = ''; // 清空内容
            input.blur(); // 移除焦点
            renderStickerGrid(); // 恢复显示所有表情
        } else {
            // 未展开 -> 展开
            searchTag.classList.add('expanded');
            // 稍微延迟聚焦，确保 CSS 动画开始，解决部分设备无法输入的问题
            setTimeout(() => input.focus(), 50);
        }
    });

    // 输入事件
    input.addEventListener('input', (e) => {
        renderStickerGrid(e.target.value); 
    });

    // 失去焦点且为空时收起
    input.addEventListener('blur', (e) => {
        if (!e.target.value) {
            searchTag.classList.remove('expanded');
            // 恢复当前分类显示
            renderStickerGrid();
        }
    });
    
    bar.appendChild(searchTag);

    // 3. 全部
    createCategoryItem(bar, { id: 'all', name: '全部' });

    // 4. 其他分组
    groups.forEach(g => createCategoryItem(bar, { id: g, name: g }));
    createCategoryItem(bar, { id: 'ungrouped', name: '未分类' });
}

function createCategoryItem(container, cat) {
    const item = document.createElement('div');
    item.className = `sticker-category-item ${currentStickerCategory === cat.id ? 'active' : ''}`;
    item.textContent = cat.name;
    item.dataset.category = cat.id;
    container.appendChild(item);
}

function renderStickerGrid(searchQuery = '') {
    const container = document.getElementById('sticker-grid-container');
    container.innerHTML = '';

    let stickersToShow = [];

    if (searchQuery) {
        // 搜索模式：全局搜索
        const lowerQuery = searchQuery.toLowerCase();
        stickersToShow = db.myStickers.filter(s => s.name.toLowerCase().includes(lowerQuery));
        
        if (stickersToShow.length === 0) {
            container.innerHTML = '<p style="color:#aaa; text-align:center; grid-column:1/-1; padding:20px;">未找到匹配的表情</p>';
            return;
        }
    } else {
        // 正常分类模式
        if (currentStickerCategory === 'recent') {
            stickersToShow = [...db.myStickers]
                .sort((a, b) => (b.lastUsedTime || 0) - (a.lastUsedTime || 0))
                .slice(0, 20);
            if (stickersToShow.length === 0) {
                container.innerHTML = '<p style="color:#aaa; text-align:center; grid-column:1/-1; padding:20px;">还没有使用过表情包哦</p>';
                return;
            }
        } else if (currentStickerCategory === 'all') {
            stickersToShow = [...db.myStickers];
        } else if (currentStickerCategory === 'ungrouped') {
            stickersToShow = db.myStickers.filter(s => !s.group);
        } else {
            stickersToShow = db.myStickers.filter(s => s.group === currentStickerCategory);
        }

        if (stickersToShow.length === 0) {
            container.innerHTML = '<p style="color:#aaa; text-align:center; grid-column:1/-1; padding:20px;">该分组下没有表情</p>';
            return;
        }
    }

    stickersToShow.forEach(sticker => {
        const item = document.createElement('div');
        item.className = 'sticker-item';
        
        if (isStickerManageMode) {
            item.classList.add('is-managing');
            if (selectedStickerIds.has(sticker.id)) {
                item.classList.add('is-selected');
            }
        }
        
        item.innerHTML = `<img src="${sticker.data}" alt="${sticker.name}"><span style="font-size:10px; margin-top:4px; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; width:100%; text-align:center;">${sticker.name}</span>`;

        item.addEventListener('click', () => {
            if (isStickerManageMode) {
                if (selectedStickerIds.has(sticker.id)) {
                    selectedStickerIds.delete(sticker.id);
                    item.classList.remove('is-selected');
                } else {
                    selectedStickerIds.add(sticker.id);
                    item.classList.add('is-selected');
                }
                const count = selectedStickerIds.size;
                document.getElementById('sticker-select-count').textContent = `已选 ${count} 项`;
                document.getElementById('delete-selected-stickers-btn').disabled = count === 0;
                document.getElementById('move-sticker-group-btn').disabled = count === 0;
            } else {
                sendSticker(sticker);
            }
        });

        container.appendChild(item);
    });
}

function handleStickerLongPress(stickerId) {
    if (isStickerManageMode) return;
    clearTimeout(longPressTimer);
    currentStickerActionTarget = stickerId;
    document.getElementById('sticker-actionsheet').classList.add('visible');
}

async function sendSticker(sticker) {
    const dbSticker = db.myStickers.find(s => s.id === sticker.id);
    if (dbSticker) {
        dbSticker.lastUsedTime = Date.now();
    }

    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    const myName = (currentChatType === 'private') ? chat.myName : chat.me.nickname;
    
    const messageContentForAI = `[${myName}发送的表情包：${sticker.name}]`;
    const message = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content: messageContentForAI,
        parts: [{type: 'text', text: messageContentForAI}],
        timestamp: Date.now(),
        stickerData: sticker.data 
    };
    if (currentChatType === 'group') {
        message.senderId = 'user_me';
    }
    chat.history.push(message);
    addMessageBubble(message, currentChatId, currentChatType);
    
    await saveData(); 
    renderChatList();
    
    showPanel('none');
}
