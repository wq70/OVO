// Use the same display path for imported and existing entries without rewriting their data.
function worldBookCategoryPath(value) {
    if (typeof value !== 'string') return '未分类';
    return value.split(/[\/\\]/).map(part => part.trim()).filter(Boolean).join('/') || '未分类';
}

function worldBookInCategory(book, path) {
    const category = worldBookCategoryPath(book.category);
    const target = worldBookCategoryPath(path);
    return category === target || category.startsWith(`${target}/`);
}

function worldBookEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

function worldBookMatchesSearch(book, keyword) {
    return [book.name, typeof book.content === 'string' ? book.content : '',
        worldBookCategoryPath(book.category), ...(Array.isArray(book.tags) ? book.tags : [])]
        .some(value => String(value ?? '').toLowerCase().includes(keyword));
}

function worldBookCanEdit(book) {
    if (typeof book.content === 'string') return true;
    showToast('此条目正文格式异常，原始数据已保留。请先导出备份，再核对原始内容。');
    return false;
}

// --- 世界书功能 (js/modules/worldbook.js) ---
let pendingWbCategoryDelete = null; // 删除分类弹窗用：{ category, count }
let currentWorldBookCategory = null; // 当前正在查看的详情分类

function enterWorldBookMultiSelectMode(initialId, initialCategory = null) {
    if (isWorldBookMultiSelectMode) return;
    isWorldBookMultiSelectMode = true;

    document.getElementById('add-world-book-btn').style.display = 'none';
    const exportBtn = document.getElementById('export-world-book-btn');
    if (exportBtn) exportBtn.style.display = 'none';
    const detailExportBtn = document.getElementById('detail-export-world-book-btn');
    if (detailExportBtn) detailExportBtn.style.display = 'none';
    document.getElementById('cancel-wb-multi-select-btn').style.display = 'inline-block';
    document.getElementById('world-book-multi-select-bar').style.display = 'flex';
    document.querySelector('#world-book-screen .content').style.paddingBottom = '70px';
    
    // 如果在详情页
    const detailBar = document.getElementById('world-book-detail-multi-select-bar');
    if (detailBar && document.getElementById('world-book-detail-screen').classList.contains('active')) {
        detailBar.style.display = 'flex';
        document.querySelector('#world-book-detail-screen .content').style.paddingBottom = '70px';
        document.getElementById('world-book-multi-select-bar').style.display = 'none'; // 隐藏首页的多选栏
    }

    selectedWorldBookIds.clear();
    if (initialId) {
        selectedWorldBookIds.add(initialId);
    }

    updateWorldBookSelectCount();
    
    if (document.getElementById('world-book-detail-screen').classList.contains('active')) {
        renderWorldBookDetailList(currentWorldBookCategory);
    } else {
        renderWorldBookList(initialCategory); 
    }
}

function exitWorldBookMultiSelectMode() {
    isWorldBookMultiSelectMode = false;

    document.getElementById('add-world-book-btn').style.display = 'inline-block';
    const exportBtn = document.getElementById('export-world-book-btn');
    if (exportBtn) exportBtn.style.display = 'inline-block';
    const detailExportBtn = document.getElementById('detail-export-world-book-btn');
    if (detailExportBtn) detailExportBtn.style.display = 'inline-block';
    document.getElementById('cancel-wb-multi-select-btn').style.display = 'none';
    document.getElementById('world-book-multi-select-bar').style.display = 'none';
    document.querySelector('#world-book-screen .content').style.paddingBottom = '0';
    
    const detailBar = document.getElementById('world-book-detail-multi-select-bar');
    if (detailBar) detailBar.style.display = 'none';
    const detailContent = document.querySelector('#world-book-detail-screen .content');
    if (detailContent) detailContent.style.paddingBottom = '0';

    selectedWorldBookIds.clear();
    if (document.getElementById('world-book-detail-screen').classList.contains('active')) {
        renderWorldBookDetailList(currentWorldBookCategory);
    } else {
        renderWorldBookList();
    }
}

function toggleWorldBookSelection(bookId) {
    const itemEl = document.getElementById('world-book-list-container').querySelector(`.world-book-item[data-id="${bookId}"]`);
    if (selectedWorldBookIds.has(bookId)) {
        selectedWorldBookIds.delete(bookId);
        if(itemEl) itemEl.classList.remove('selected');
    } else {
        selectedWorldBookIds.add(bookId);
        if(itemEl) itemEl.classList.add('selected');
    }
    updateWorldBookSelectCount();
}

function updateWorldBookSelectCount() {
    const count = selectedWorldBookIds.size;
    document.getElementById('world-book-select-count').textContent = `已选择 ${count} 项`;
    
    // 详情页的多选统计
    const detailCountEl = document.getElementById('world-book-detail-select-count');
    if (detailCountEl) detailCountEl.textContent = `已选择 ${count} 项`;

    const exportBtn = document.getElementById('export-selected-world-books-btn');
    const deleteBtn = document.getElementById('delete-selected-world-books-btn');
    const moveBtn = document.getElementById('move-selected-world-books-btn');
    const toggleBtn = document.getElementById('toggle-selected-world-books-btn');
    
    const detailExportBtn = document.getElementById('detail-export-selected-world-books-btn');
    const detailDeleteBtn = document.getElementById('detail-delete-selected-world-books-btn');
    const detailMoveBtn = document.getElementById('detail-move-selected-world-books-btn');
    const detailToggleBtn = document.getElementById('detail-toggle-selected-world-books-btn');

    if (exportBtn) exportBtn.disabled = count === 0;
    if (deleteBtn) deleteBtn.disabled = count === 0;
    if (moveBtn) moveBtn.disabled = count === 0;
    if (toggleBtn) toggleBtn.disabled = count === 0;
    
    if (detailExportBtn) detailExportBtn.disabled = count === 0;
    if (detailDeleteBtn) detailDeleteBtn.disabled = count === 0;
    if (detailMoveBtn) detailMoveBtn.disabled = count === 0;
    if (detailToggleBtn) detailToggleBtn.disabled = count === 0;

    // 根据选中项的状态更新按钮文字
    if (count > 0) {
        const selectedBooks = db.worldBooks.filter(book => selectedWorldBookIds.has(book.id));
        const allDisabled = selectedBooks.length > 0 && selectedBooks.every(book => !!book.disabled);
        if (toggleBtn) toggleBtn.textContent = allDisabled ? '启用已选' : '停用已选';
        if (detailToggleBtn) detailToggleBtn.textContent = allDisabled ? '启用已选' : '停用已选';
    }
}

/**
 * 从纯文本（TXT/DOCX 提取结果）解析为分类与条目：按双换行分段落，每段首行为条目名、其余为内容，归为「导入」分类
 */
function parseTextToWorldBookEntries(text, defaultCategory = '导入') {
    const entries = [];
    const raw = (text || '').trim();
    if (!raw) return entries;
    const category = defaultCategory;
    const lines = raw.split(/\n/);
    const name = lines[0].trim() || '未命名条目';
    entries.push({ name, content: raw, category });
    return entries;
}

/**
 * 从 JSON 解析为世界书条目，支持：character_book.entries、{ categories: [...] }、条目数组
 */
function parseJsonToWorldBookEntries(jsonText, defaultCategory = '导入') {
    const entries = [];
    let data;
    try {
        data = JSON.parse(jsonText);
    } catch (e) {
        throw new Error('JSON 格式无效');
    }
    if (!data || typeof data !== 'object') return entries;

    // SillyTavern/角色卡式：entries 为对象 { "0": { comment, content }, "1": ... }
    if (data.entries && typeof data.entries === 'object' && !Array.isArray(data.entries)) {
        const category = defaultCategory;
        Object.values(data.entries).forEach(entry => {
            if (!entry || typeof entry !== 'object') return;
            const name = (entry.comment || entry.name || entry.title || '未命名').trim();
            const content = (entry.content || entry.text || '').trim();
            if (name && content) entries.push({ name, content, category });
        });
        return entries;
    }
    if (data.character_book && Array.isArray(data.character_book.entries)) {
        const category = data.name || data.character_name || defaultCategory;
        data.character_book.entries.forEach(entry => {
            const name = entry.comment || entry.name || '未命名';
            const content = entry.content || '';
            if (name && content) entries.push({ name, content, category });
        });
        return entries;
    }
    if (Array.isArray(data.categories) && data.categories.length > 0) {
        data.categories.forEach(cat => {
            const category = (cat.name || cat.title || '未分类').trim() || '未分类';
            const list = cat.entries || cat.items || [];
            list.forEach(entry => {
                const name = (entry.name || entry.title || entry.comment || '未命名').trim();
                const content = (entry.content || entry.text || '').trim();
                if (name && content) entries.push({ name, content, category });
            });
        });
        return entries;
    }
    if (Array.isArray(data)) {
        data.forEach(item => {
            const name = (item.name || item.title || item.comment || '未命名').trim();
            const content = (item.content || item.text || '').trim();
            const category = (item.category || item.categoryName || defaultCategory).trim() || defaultCategory;
            if (name && content) entries.push({ name, content, category });
        });
        return entries;
    }
    return entries;
}

async function handleImportWorldBookFile(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    let fileNameWithoutExt = file.name;
    const lastDotIndex = file.name.lastIndexOf('.');
    if (lastDotIndex > 0) {
        fileNameWithoutExt = file.name.substring(0, lastDotIndex);
    }
    const defaultCategory = fileNameWithoutExt || '导入';
    let entries = [];
    let text = '';

    if (ext === 'txt') {
        text = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result || '');
            reader.onerror = () => reject(new Error('读取 TXT 失败'));
            reader.readAsText(file, 'UTF-8');
        });
        entries = parseTextToWorldBookEntries(text, defaultCategory);
    } else if (ext === 'docx') {
        if (typeof parseDocxFile === 'undefined') {
            showToast('无法解析 DOCX，请刷新后重试');
            return;
        }
        text = await parseDocxFile(file);
        entries = parseTextToWorldBookEntries(text, defaultCategory);
    } else if (ext === 'json') {
        text = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result || '');
            reader.onerror = () => reject(new Error('读取 JSON 失败'));
            reader.readAsText(file, 'UTF-8');
        });
        entries = parseJsonToWorldBookEntries(text, defaultCategory);
    } else {
        showToast('仅支持 .txt、.json、.docx 格式');
        return;
    }

    if (entries.length === 0) {
        showToast('未能解析出任何条目，请检查文件格式');
        return;
    }

    const toAdd = entries.map((e, i) => ({
        id: `wb_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}`,
        name: e.name,
        content: e.content,
        category: e.category || defaultCategory,
        position: 'before',
        isGlobal: false,
        disabled: false
    }));

    db.worldBooks.push(...toAdd);
    await dexieDB.worldBooks.bulkPut(toAdd);
    await saveData();
    renderWorldBookList();
    showToast(`已导入 ${toAdd.length} 条世界书`);
}

async function deleteSelectedWorldBooks() {
    const count = selectedWorldBookIds.size;
    if (count === 0) return;

    if (confirm(`确定要删除这 ${count} 个世界书条目吗？此操作不可恢复。`)) {
        const idsToDelete = Array.from(selectedWorldBookIds);
        
        await dexieDB.worldBooks.bulkDelete(idsToDelete);
        db.worldBooks = db.worldBooks.filter(book => !selectedWorldBookIds.has(book.id));
        
        db.characters.forEach(char => {
            if (char.worldBookIds) {
                char.worldBookIds = char.worldBookIds.filter(id => !selectedWorldBookIds.has(id));
            }
        });
        db.groups.forEach(group => {
            if (group.worldBookIds) {
                group.worldBookIds = group.worldBookIds.filter(id => !selectedWorldBookIds.has(id));
            }
        });

        await saveData();
        showToast(`已成功删除 ${count} 个条目`);
        exitWorldBookMultiSelectMode();
    }
}

function showMoveCategoryModal() {
    const count = selectedWorldBookIds.size;
    if (count === 0) {
        showToast('请先选择要移动的世界书条目');
        return;
    }

    const modal = document.getElementById('world-book-move-category-modal');
    const desc = document.getElementById('wb-move-category-modal-desc');
    const categoryList = document.getElementById('wb-move-category-list');
    
    if (!modal || !desc || !categoryList) return;

    desc.textContent = `将 ${count} 个条目移动到分类：`;
    categoryList.innerHTML = '';

    // 获取所有分类
    const categories = new Set();
    db.worldBooks.forEach(book => {
        const cat = worldBookCategoryPath(book.category);
        categories.add(cat);
    });

    // 排序：未分类优先，其余按名称排序
    const sortedCategories = Array.from(categories).sort((a, b) => {
        if (a === '未分类') return -1;
        if (b === '未分类') return 1;
        return a.localeCompare(b);
    });

    // 创建分类选项
    sortedCategories.forEach(category => {
        const option = document.createElement('div');
        option.className = 'wb-move-category-option';
        option.style.cssText = 'padding: 12px; border-bottom: 1px solid #f0f0f0; cursor: pointer; transition: background-color 0.2s;';
        option.dataset.category = category;
        
        option.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <span style="font-weight: 500; color: #333;">${worldBookEscape(category)}</span>
                <span style="color: #999; font-size: 12px;">›</span>
            </div>
        `;

        option.addEventListener('click', () => {
            // 移除之前的选中状态
            categoryList.querySelectorAll('.wb-move-category-option').forEach(opt => {
                opt.style.backgroundColor = '';
                delete opt.dataset.selected;
            });
            // 设置当前选中
            option.style.backgroundColor = '#e8f5e9';
            option.dataset.selected = 'true';
        });

        option.addEventListener('mouseenter', () => {
            if (!option.dataset.selected) {
                option.style.backgroundColor = '#f5f5f5';
            }
        });

        option.addEventListener('mouseleave', () => {
            if (!option.dataset.selected) {
                option.style.backgroundColor = '';
            }
        });

        categoryList.appendChild(option);
    });

    // 添加"新建分类"选项
    const newCategoryOption = document.createElement('div');
    newCategoryOption.className = 'wb-move-category-option wb-move-category-new';
    newCategoryOption.style.cssText = 'padding: 12px; border-top: 2px solid #e0e0e0; cursor: pointer; transition: background-color 0.2s;';
    newCategoryOption.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between;">
            <span style="font-weight: 500; color: var(--primary-color);">+ 新建分类</span>
            <span style="color: #999; font-size: 12px;">›</span>
        </div>
    `;
    newCategoryOption.addEventListener('click', () => {
        const newCategoryName = prompt('输入新分类名称：', '');
        if (newCategoryName === null) return;
        const trimmed = newCategoryName.trim();
        if (!trimmed) {
            showToast('分类名不能为空');
            return;
        }
        // 直接移动到新分类
        moveSelectedWorldBooksToCategory(trimmed);
        modal.classList.remove('visible');
        // 清除选择状态
        categoryList.querySelectorAll('.wb-move-category-option').forEach(opt => {
            opt.style.backgroundColor = '';
            delete opt.dataset.selected;
        });
    });
    newCategoryOption.addEventListener('mouseenter', () => {
        newCategoryOption.style.backgroundColor = '#f5f5f5';
    });
    newCategoryOption.addEventListener('mouseleave', () => {
        newCategoryOption.style.backgroundColor = '';
    });
    categoryList.appendChild(newCategoryOption);

    modal.classList.add('visible');
}

async function moveSelectedWorldBooksToCategory(targetCategory) {
    const count = selectedWorldBookIds.size;
    if (count === 0) return;

    const idsToMove = Array.from(selectedWorldBookIds);
    let movedCount = 0;

    idsToMove.forEach(bookId => {
        const book = db.worldBooks.find(wb => wb.id === bookId);
        if (book) {
            book.category = targetCategory || '';
            movedCount++;
        }
    });

    if (movedCount > 0) {
        // 批量更新数据库
        const booksToUpdate = db.worldBooks.filter(wb => idsToMove.includes(wb.id));
        await dexieDB.worldBooks.bulkPut(booksToUpdate);
        await saveData();
        
        showToast(`已成功将 ${movedCount} 个条目移动到「${targetCategory || '未分类'}」`);
        renderWorldBookList();
        exitWorldBookMultiSelectMode();
    }
}

// --- 导出世界书 ---
async function exportWorldBooks(booksToExport, defaultFilename = 'worldbook_export') {
    if (!booksToExport || booksToExport.length === 0) {
        showToast('没有可导出的世界书条目');
        return;
    }
    
    const exportData = {
        character_book: {
            entries: booksToExport.map(book => ({
                comment: book.name,
                content: book.content,
                // 这里暂不包含我们特有的一些字段，为了与主流格式兼容
            }))
        },
        // 可以同时在顶层保留一份带有分类和特有字段的数组，以供我们自己的系统完整导入
        custom_entries: booksToExport
    };
    
    return OvoFileDownload.save(new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' }), `${defaultFilename}.json`);
}

function handleExportWorldBookBtnClick() {
    // 导出所有
    exportWorldBooks(db.worldBooks, 'all_worldbooks');
}

// --- 自定义导出逻辑 ---
function openWorldBookCustomExportModal() {
    const modal = document.getElementById('world-book-custom-export-modal');
    if (!modal) return;

    const listContainer = document.getElementById('wb-custom-export-list');
    const selectAllCheckbox = document.getElementById('wb-custom-export-select-all');
    
    if (selectAllCheckbox) selectAllCheckbox.checked = false;
    updateCustomExportSelectCount(0);

    // 解析多级分类，复用原有的逻辑或者重新拍平
    // 这里使用树状结构渲染
    const categoryTree = Object.create(null);
    db.worldBooks.forEach(book => {
        const categoryPath = worldBookCategoryPath(book.category);
        
        if (!categoryTree[categoryPath]) {
            categoryTree[categoryPath] = [];
        }
        categoryTree[categoryPath].push(book);
    });

    // 排序
    const sortedCategories = Object.keys(categoryTree).sort((a, b) => {
        if (a === '未分类') return 1;
        if (b === '未分类') return -1;
        return a.localeCompare(b);
    });

    listContainer.innerHTML = '';
    
    if (db.worldBooks.length === 0) {
        listContainer.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">没有可导出的世界书</div>';
    } else {
        sortedCategories.forEach(category => {
            const books = categoryTree[category];
            const groupEl = document.createElement('div');
            groupEl.className = 'custom-export-group';
            groupEl.style.cssText = 'margin-bottom: 10px; border: 1px solid #f0f0f0; border-radius: 8px; overflow: hidden;';

            // 分类头部
            const headerEl = document.createElement('div');
            headerEl.style.cssText = 'background: #f9f9f9; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;';
            headerEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" class="custom-export-category-checkbox" data-category="${worldBookEscape(category)}">
                    <span style="font-weight: 600; font-size: 14px; color: #333;">${worldBookEscape(category)} <span style="color:#999; font-size:12px; font-weight:normal;">(${books.length})</span></span>
                </div>
                <span class="custom-export-arrow" style="font-size: 12px; color: #999; transition: transform 0.2s;">▼</span>
            `;

            // 条目列表容器
            const itemsContainer = document.createElement('div');
            itemsContainer.className = 'custom-export-items';
            itemsContainer.style.cssText = 'padding: 5px 12px; display: block;'; // 默认展开

            books.forEach(book => {
                const itemEl = document.createElement('div');
                itemEl.style.cssText = 'padding: 8px 0; border-bottom: 1px solid #f5f5f5; display: flex; align-items: flex-start; gap: 8px;';
                
                // 处理描述的截断
                let briefContent = typeof book.content === 'string' ? book.content : '正文格式异常，原始数据已保留';
                if (briefContent.length > 30) briefContent = briefContent.substring(0, 30) + '...';

                itemEl.innerHTML = `
                    <input type="checkbox" class="custom-export-item-checkbox" value="${book.id}" style="margin-top: 3px;">
                    <div style="flex: 1;">
                        <div style="font-size: 14px; color: #333;">${worldBookEscape(book.name)}</div>
                        <div style="font-size: 12px; color: #999; margin-top: 2px;">${worldBookEscape(briefContent)}</div>
                    </div>
                `;
                itemsContainer.appendChild(itemEl);
            });

            groupEl.appendChild(headerEl);
            groupEl.appendChild(itemsContainer);
            listContainer.appendChild(groupEl);

            // 事件绑定
            const categoryCheckbox = headerEl.querySelector('.custom-export-category-checkbox');
            const arrow = headerEl.querySelector('.custom-export-arrow');
            const itemCheckboxes = itemsContainer.querySelectorAll('.custom-export-item-checkbox');

            // 点击展开/折叠 (点击头部除复选框外的区域)
            headerEl.addEventListener('click', (e) => {
                if (e.target.tagName.toLowerCase() === 'input') return;
                const isHidden = itemsContainer.style.display === 'none';
                itemsContainer.style.display = isHidden ? 'block' : 'none';
                arrow.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
            });

            // 点击分类复选框，全选/取消全选该分类下的所有条目
            categoryCheckbox.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                itemCheckboxes.forEach(cb => cb.checked = isChecked);
                updateCustomExportSelectCount();
            });

            // 点击单个条目复选框，更新状态并联动分类复选框和全选按钮
            itemCheckboxes.forEach(cb => {
                cb.addEventListener('change', () => {
                    const allChecked = Array.from(itemCheckboxes).every(c => c.checked);
                    const someChecked = Array.from(itemCheckboxes).some(c => c.checked);
                    categoryCheckbox.checked = allChecked;
                    categoryCheckbox.indeterminate = someChecked && !allChecked;
                    updateCustomExportSelectCount();
                });
            });
        });
    }

    modal.classList.add('visible');
}

function updateCustomExportSelectCount(count) {
    let selectedCount = count;
    if (typeof selectedCount === 'undefined') {
        const modal = document.getElementById('world-book-custom-export-modal');
        if (modal) {
            const checkedBoxes = modal.querySelectorAll('.custom-export-item-checkbox:checked');
            selectedCount = checkedBoxes.length;
            
            // 联动全选按钮
            const selectAllCheckbox = document.getElementById('wb-custom-export-select-all');
            const totalBoxes = modal.querySelectorAll('.custom-export-item-checkbox').length;
            if (selectAllCheckbox && totalBoxes > 0) {
                selectAllCheckbox.checked = selectedCount === totalBoxes;
            }
        }
    }
    
    const countEl = document.getElementById('wb-custom-export-count');
    if (countEl) {
        countEl.textContent = `已选 ${selectedCount} 项`;
    }
}

function handleCustomExportConfirm() {
    const modal = document.getElementById('world-book-custom-export-modal');
    if (!modal) return;

    const checkedBoxes = modal.querySelectorAll('.custom-export-item-checkbox:checked');
    if (checkedBoxes.length === 0) {
        showToast('请至少选择一项进行导出');
        return;
    }

    const selectedIds = Array.from(checkedBoxes).map(cb => cb.value);
    const booksToExport = db.worldBooks.filter(book => selectedIds.includes(book.id));

    exportWorldBooks(booksToExport, 'custom_selected_worldbooks');
    modal.classList.remove('visible');
}

function handleDetailExportWorldBookBtnClick() {
    if (!currentWorldBookCategory) return;
    const books = db.worldBooks.filter(b => worldBookInCategory(b, currentWorldBookCategory));
    exportWorldBooks(books, `worldbooks_${currentWorldBookCategory.replace(/[\/\\]/g, '_')}`);
}

function handleExportSelectedWorldBooksBtnClick() {
    const count = selectedWorldBookIds.size;
    if (count === 0) return;
    const books = db.worldBooks.filter(book => selectedWorldBookIds.has(book.id));
    exportWorldBooks(books, 'selected_worldbooks');
}

async function toggleSelectedWorldBooks() {
    const count = selectedWorldBookIds.size;
    if (count === 0) return;

    const selectedBooks = db.worldBooks.filter(book => selectedWorldBookIds.has(book.id));
    if (selectedBooks.length === 0) return;

    // 判断是否全部已停用
    const allDisabled = selectedBooks.every(book => !!book.disabled);
    const newDisabledState = !allDisabled;

    // 批量更新状态
    selectedBooks.forEach(book => {
        book.disabled = newDisabledState;
    });

    // 批量更新数据库
    await dexieDB.worldBooks.bulkPut(selectedBooks);
    await saveData();

    const actionText = newDisabledState ? '停用' : '启用';
    showToast(`已${actionText} ${selectedBooks.length} 个条目`);
    renderWorldBookList();
    updateWorldBookSelectCount();
}

let categorySortable = null;
let itemSortables = [];

