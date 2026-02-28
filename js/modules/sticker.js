// --- 表情包管理 (js/modules/sticker.js) ---

/**
 * 宽泛格式解析单行：支持 名称:URL、名称：URL、名称 URL、名称URL 等
 * 通过识别 http(s):// 提取 URL，其前为名称（自动去除末尾分隔符）
 */
function parseStickerLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return null;
    // 注释行
    if (/^\s*[#\/\/]/.test(trimmed)) return null;
    const urlMatch = trimmed.match(/(https?:\/\/[^\s]+)/);
    if (!urlMatch) return null;
    const url = urlMatch[0].replace(/[.,;:：，、]+$/, '').trim();
    if (!url.startsWith('http')) return null;
    const urlIndex = trimmed.indexOf(url);
    let name = trimmed.substring(0, urlIndex).trim();
    name = name.replace(/[:：\-|,，、\s]+$/, '').trim();
    if (!name) return null;
    return { name, url };
}

/**
 * 从整段文本解析出所有表情条（每行一条，宽泛格式）
 */
function parseStickerText(text) {
    if (!text || typeof text !== 'string') return [];
    const lines = text.split(/\r?\n/);
    const result = [];
    const seen = new Set();
    for (const line of lines) {
        const item = parseStickerLine(line);
        if (item && !seen.has(item.url)) {
            seen.add(item.url);
            result.push(item);
        }
    }
    return result;
}

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

    document.getElementById('sticker-doc-import-open-btn').addEventListener('click', () => {
        batchAddStickerModal.classList.remove('visible');
        openStickerDocImportModal();
    });

    setupStickerDocImportModal();
    setupStickerDocPreviewModal();

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
        const parsed = parseStickerText(textInput);
        if (parsed.length === 0) return showToast('未解析到有效表情（需包含名称+http链接）');
        const newStickers = parsed.map(({ name, url }) => ({
            id: `sticker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name,
            data: url,
            group: groupName,
            lastUsedTime: Date.now()
        }));
        db.myStickers.push(...newStickers);
        await saveData();
        batchAddStickerModal.classList.remove('visible');
        showToast(`导入 ${newStickers.length} 个表情`);
        renderStickerCategories();
        renderStickerGrid();
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

    // 表情包智能匹配：输入框打字时在输入框上方显示匹配的表情，点击即发送
    const msgInput = document.getElementById('message-input');
    const smartMatchBar = document.getElementById('sticker-smart-match-bar');
    const smartMatchList = document.getElementById('sticker-smart-match-list');
    const SMART_MATCH_LIMIT = 12;
    let smartMatchDebounceTimer = null;

    function updateStickerSmartMatchBar() {
        if (!smartMatchBar || !smartMatchList || !msgInput) return;
        const text = (msgInput.value || '').trim().toLowerCase();
        const isPrivate = (typeof currentChatType !== 'undefined' && currentChatType === 'private');
        const character = isPrivate && typeof currentChatId !== 'undefined' && db.characters ? db.characters.find(c => c.id === currentChatId) : null;
        const enabled = character && (character.stickerSmartMatchEnabled === true);

        if (!enabled || !text) {
            smartMatchBar.style.display = 'none';
            smartMatchList.innerHTML = '';
            return;
        }

        const matched = (db.myStickers || []).filter(s => (s.name || '').toLowerCase().includes(text)).slice(0, SMART_MATCH_LIMIT);
        if (matched.length === 0) {
            smartMatchBar.style.display = 'none';
            smartMatchList.innerHTML = '';
            return;
        }

        smartMatchList.innerHTML = '';
        matched.forEach(sticker => {
            const item = document.createElement('div');
            item.className = 'sticker-smart-match-item';
            item.title = sticker.name;
            item.innerHTML = `<img src="${sticker.data}" alt="${sticker.name}">`;
            item.addEventListener('click', () => {
                sendSticker(sticker);
                smartMatchBar.style.display = 'none';
                smartMatchList.innerHTML = '';
                msgInput.value = '';
            });
            smartMatchList.appendChild(item);
        });
        smartMatchBar.style.display = 'block';
    }

    if (msgInput) {
        msgInput.addEventListener('input', () => {
            clearTimeout(smartMatchDebounceTimer);
            smartMatchDebounceTimer = setTimeout(updateStickerSmartMatchBar, 200);
        });
        msgInput.addEventListener('blur', () => {
            clearTimeout(smartMatchDebounceTimer);
            setTimeout(() => {
                if (smartMatchBar && document.activeElement !== msgInput) {
                    smartMatchBar.style.display = 'none';
                }
            }, 150);
        });
        msgInput.addEventListener('focus', () => {
            updateStickerSmartMatchBar();
        });
    }
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

// --- 文档导入表情包（TXT/DOCX/ZIP）---
let stickerDocParsedList = []; // 解析结果，供预览弹窗使用

function openStickerDocImportModal() {
    const modal = document.getElementById('sticker-doc-import-modal');
    const fileList = document.getElementById('sticker-doc-import-file-list');
    const startBtn = document.getElementById('sticker-doc-import-start-btn');
    const fileInput = document.getElementById('sticker-doc-import-file-input');
    if (!modal) return;
    fileList.innerHTML = '';
    startBtn.disabled = true;
    fileInput.value = '';
    modal.classList.add('visible');
}

function setupStickerDocImportModal() {
    const modal = document.getElementById('sticker-doc-import-modal');
    if (!modal) return;
    const fileInput = document.getElementById('sticker-doc-import-file-input');
    const dropZone = document.getElementById('sticker-doc-import-drop-zone');
    const fileListEl = document.getElementById('sticker-doc-import-file-list');
    const startBtn = document.getElementById('sticker-doc-import-start-btn');
    const cancelBtn = document.getElementById('sticker-doc-import-cancel-btn');
    const closeBtn = document.getElementById('sticker-doc-import-close-btn');
    let selectedFiles = [];

    function renderFileList() {
        fileListEl.innerHTML = '';
        if (selectedFiles.length === 0) {
            startBtn.disabled = true;
            return;
        }
        startBtn.disabled = false;
        selectedFiles.forEach((file, idx) => {
            const ext = file.name.split('.').pop().toLowerCase();
            const icon = ext === 'zip' ? '🗜️' : ext === 'docx' ? '📝' : '📄';
            const item = document.createElement('div');
            item.style.cssText = 'display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:8px; background:#f8f8f8; margin-bottom:6px;';
            item.innerHTML = `
                <span style="font-size:18px;">${icon}</span>
                <span style="flex:1; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${file.name}</span>
                <button type="button" style="background:none; border:none; color:#ff4d4f; cursor:pointer; font-size:16px; padding:2px 6px;">×</button>
            `;
            const removeBtn = item.querySelector('button');
            removeBtn.addEventListener('click', () => {
                selectedFiles.splice(idx, 1);
                renderFileList();
            });
            fileListEl.appendChild(item);
        });
    }

    function handleFiles(files) {
        const validExts = ['txt', 'docx', 'zip'];
        const newFiles = Array.from(files).filter(f => {
            const ext = f.name.split('.').pop().toLowerCase();
            return validExts.includes(ext);
        });
        if (newFiles.length < Array.from(files).length) {
            showToast('部分文件格式不支持，已过滤（仅支持 TXT/DOCX/ZIP）');
        }
        selectedFiles = [...selectedFiles, ...newFiles];
        const seen = new Set();
        selectedFiles = selectedFiles.filter(f => {
            if (seen.has(f.name)) return false;
            seen.add(f.name);
            return true;
        });
        renderFileList();
    }

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
        e.target.value = '';
    });
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#4a90e2';
        dropZone.style.background = '#f0f7ff';
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = '#ddd';
        dropZone.style.background = '';
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#ddd';
        dropZone.style.background = '';
        handleFiles(e.dataTransfer.files);
    });

    [cancelBtn, closeBtn].forEach(btn => {
        btn.addEventListener('click', () => {
            modal.classList.remove('visible');
            selectedFiles = [];
        });
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('visible');
            selectedFiles = [];
        }
    });

    startBtn.addEventListener('click', async () => {
        if (selectedFiles.length === 0) return;
        modal.classList.remove('visible');
        startBtn.disabled = true;
        showToast('正在解析文档…');
        const allParsed = [];
        const seenUrls = new Set();
        try {
            for (const file of selectedFiles) {
                const ext = file.name.split('.').pop().toLowerCase();
                if (ext === 'txt') {
                    const content = await readFileAsText(file);
                    const items = parseStickerText(content);
                    items.forEach(it => {
                        if (!seenUrls.has(it.url)) {
                            seenUrls.add(it.url);
                            allParsed.push(it);
                        }
                    });
                } else if (ext === 'docx') {
                    const content = await parseDocxFile(file);
                    const items = parseStickerText(content);
                    items.forEach(it => {
                        if (!seenUrls.has(it.url)) {
                            seenUrls.add(it.url);
                            allParsed.push(it);
                        }
                    });
                } else if (ext === 'zip') {
                    const extracted = await parseZipFile(file);
                    for (const { content } of extracted) {
                        const items = parseStickerText(content);
                        items.forEach(it => {
                            if (!seenUrls.has(it.url)) {
                                seenUrls.add(it.url);
                                allParsed.push(it);
                            }
                        });
                    }
                }
            }
        } catch (err) {
            console.error('文档解析失败:', err);
            showToast('解析失败: ' + (err.message || '未知错误'));
            startBtn.disabled = false;
            return;
        }
        selectedFiles = [];
        startBtn.disabled = false;
        if (allParsed.length === 0) {
            showToast('未从文档中解析到有效表情（需每行包含名称+http链接）');
            return;
        }
        stickerDocParsedList = allParsed;
        showStickerDocPreviewModal();
    });
}

function showStickerDocPreviewModal() {
    const modal = document.getElementById('sticker-doc-preview-modal');
    const listEl = document.getElementById('sticker-doc-preview-list');
    const countEl = document.getElementById('sticker-doc-preview-count');
    const groupInput = document.getElementById('sticker-doc-preview-group');
    if (!modal || !listEl) return;
    countEl.textContent = stickerDocParsedList.length;
    groupInput.value = '';
    listEl.innerHTML = '';
    stickerDocParsedList.forEach((it, i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; gap:10px; padding:6px 8px; border-radius:6px; background:#fff; margin-bottom:4px; border:1px solid #eee;';
        row.innerHTML = `
            <img src="${it.url}" alt="" style="width:40px; height:40px; object-fit:contain; border-radius:4px; flex-shrink:0;" onerror="this.style.background='#f0f0f0';this.src='';">
            <div style="flex:1; min-width:0;">
                <div style="font-size:13px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(it.name)}</div>
                <div style="font-size:11px; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(it.url)}</div>
            </div>
        `;
        listEl.appendChild(row);
    });
    modal.classList.add('visible');
}

function setupStickerDocPreviewModal() {
    const modal = document.getElementById('sticker-doc-preview-modal');
    if (!modal) return;
    const confirmBtn = document.getElementById('sticker-doc-preview-confirm-btn');
    const cancelBtn = document.getElementById('sticker-doc-preview-cancel-btn');
    const groupInput = document.getElementById('sticker-doc-preview-group');
    cancelBtn.addEventListener('click', () => {
        modal.classList.remove('visible');
        stickerDocParsedList = [];
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('visible');
            stickerDocParsedList = [];
        }
    });
    confirmBtn.addEventListener('click', async () => {
        const groupName = groupInput.value.trim();
        const newStickers = stickerDocParsedList.map(({ name, url }) => ({
            id: `sticker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name,
            data: url,
            group: groupName,
            lastUsedTime: Date.now()
        }));
        db.myStickers.push(...newStickers);
        await saveData();
        modal.classList.remove('visible');
        stickerDocParsedList = [];
        showToast(`已导入 ${newStickers.length} 个表情`);
        renderStickerCategories();
        renderStickerGrid();
    });
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
