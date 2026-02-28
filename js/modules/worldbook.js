// --- 世界书功能 (js/modules/worldbook.js) ---
let pendingWbCategoryDelete = null; // 删除分类弹窗用：{ category, count }

function enterWorldBookMultiSelectMode(initialId, initialCategory = null) {
    if (isWorldBookMultiSelectMode) return;
    isWorldBookMultiSelectMode = true;

    document.getElementById('add-world-book-btn').style.display = 'none';
    const importBtn = document.getElementById('import-world-book-btn');
    if (importBtn) importBtn.style.display = 'none';
    document.getElementById('cancel-wb-multi-select-btn').style.display = 'inline-block';
    document.getElementById('world-book-multi-select-bar').style.display = 'flex';
    document.querySelector('#world-book-screen .content').style.paddingBottom = '70px';

    selectedWorldBookIds.clear();
    if (initialId) {
        selectedWorldBookIds.add(initialId);
    }

    updateWorldBookSelectCount();
    renderWorldBookList(initialCategory); 
}

function exitWorldBookMultiSelectMode() {
    isWorldBookMultiSelectMode = false;

    document.getElementById('add-world-book-btn').style.display = 'inline-block';
    const importBtn = document.getElementById('import-world-book-btn');
    if (importBtn) importBtn.style.display = 'inline-block';
    document.getElementById('cancel-wb-multi-select-btn').style.display = 'none';
    document.getElementById('world-book-multi-select-bar').style.display = 'none';
    document.querySelector('#world-book-screen .content').style.paddingBottom = '0';

    selectedWorldBookIds.clear();
    renderWorldBookList();
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
    document.getElementById('delete-selected-world-books-btn').disabled = count === 0;
}

/**
 * 从纯文本（TXT/DOCX 提取结果）解析为分类与条目：按双换行分段落，每段首行为条目名、其余为内容，归为「导入」分类
 */
function parseTextToWorldBookEntries(text) {
    const entries = [];
    const raw = (text || '').trim();
    if (!raw) return entries;
    const blocks = raw.split(/\n\s*\n/).map(b => b.trim()).filter(B => B.length > 0);
    const category = '导入';
    blocks.forEach(block => {
        const lines = block.split(/\n/);
        const name = lines[0].trim();
        const content = lines.slice(1).join('\n').trim();
        if (name && content) {
            entries.push({ name, content, category });
        } else if (block.length > 0) {
            entries.push({ name: name || '未命名条目', content: content || block, category });
        }
    });
    return entries;
}

/**
 * 从 JSON 解析为世界书条目，支持：character_book.entries、{ categories: [...] }、条目数组
 */
function parseJsonToWorldBookEntries(jsonText) {
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
        const category = '导入';
        Object.values(data.entries).forEach(entry => {
            if (!entry || typeof entry !== 'object') return;
            const name = (entry.comment || entry.name || entry.title || '未命名').trim();
            const content = (entry.content || entry.text || '').trim();
            if (name && content) entries.push({ name, content, category });
        });
        return entries;
    }
    if (data.character_book && Array.isArray(data.character_book.entries)) {
        const category = data.name || data.character_name || '导入';
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
            const category = (item.category || item.categoryName || '导入').trim() || '导入';
            if (name && content) entries.push({ name, content, category });
        });
        return entries;
    }
    return entries;
}

async function handleImportWorldBookFile(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    let entries = [];
    let text = '';

    if (ext === 'txt') {
        text = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result || '');
            reader.onerror = () => reject(new Error('读取 TXT 失败'));
            reader.readAsText(file, 'UTF-8');
        });
        entries = parseTextToWorldBookEntries(text);
    } else if (ext === 'docx') {
        if (typeof parseDocxFile === 'undefined') {
            showToast('无法解析 DOCX，请刷新后重试');
            return;
        }
        text = await parseDocxFile(file);
        entries = parseTextToWorldBookEntries(text);
    } else if (ext === 'json') {
        text = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result || '');
            reader.onerror = () => reject(new Error('读取 JSON 失败'));
            reader.readAsText(file, 'UTF-8');
        });
        entries = parseJsonToWorldBookEntries(text);
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
        category: e.category || '导入',
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

function setupWorldBookApp() {
    const addWorldBookBtn = document.getElementById('add-world-book-btn');
    const editWorldBookForm = document.getElementById('edit-world-book-form');
    const worldBookNameInput = document.getElementById('world-book-name');
    const worldBookContentInput = document.getElementById('world-book-content');
    const worldBookListContainer = document.getElementById('world-book-list-container');
    const worldBookIdInput = document.getElementById('world-book-id');

    addWorldBookBtn.addEventListener('click', () => {
        currentEditingWorldBookId = null;
        editWorldBookForm.reset();
        document.querySelector('input[name="world-book-position"][value="before"]').checked = true;
        document.getElementById('world-book-global').checked = false;
        switchScreen('edit-world-book-screen');
    });

    const importWorldBookBtn = document.getElementById('import-world-book-btn');
    const importWorldBookFileInput = document.getElementById('import-world-book-file-input');
    if (importWorldBookBtn && importWorldBookFileInput) {
        importWorldBookBtn.addEventListener('click', () => importWorldBookFileInput.click());
        importWorldBookFileInput.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            e.target.value = '';
            if (!file) return;
            try {
                await handleImportWorldBookFile(file);
            } catch (err) {
                console.error('世界书导入失败', err);
                showToast('导入失败：' + (err.message || '未知错误'));
            }
        });
    }
    
    editWorldBookForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = worldBookNameInput.value.trim();
        const content = worldBookContentInput.value.trim();
        const category = document.getElementById('world-book-category').value.trim();
        const position = document.querySelector('input[name="world-book-position"]:checked').value;
        const isGlobal = document.getElementById('world-book-global').checked;
        if (!name || !content) return showToast('名称和内容不能为空');
        if (currentEditingWorldBookId) {
            const book = db.worldBooks.find(wb => wb.id === currentEditingWorldBookId);
            if (book) {
                book.name = name;
                book.content = content;
                book.position = position;
                book.category = category;
                book.isGlobal = isGlobal;
                if (typeof book.disabled === 'undefined') book.disabled = false;
            }
        } else {
            db.worldBooks.push({id: `wb_${Date.now()}`, name, content, position, category, isGlobal, disabled: false});
        }
        await saveData();
        showToast('世界书条目已保存');
        renderWorldBookList();
        switchScreen('world-book-screen');
    });

    worldBookListContainer.addEventListener('click', e => {
        const worldBookItem = e.target.closest('.world-book-item');

        if (isWorldBookMultiSelectMode) {
            if (e.target.matches('.category-checkbox')) {
                const category = e.target.dataset.category;
                const booksInCategory = db.worldBooks.filter(b => (b.category || '未分类') === category);
                const bookIdsInCategory = booksInCategory.map(b => b.id);
                const shouldSelectAll = e.target.checked;

                bookIdsInCategory.forEach(bookId => {
                    if (shouldSelectAll) {
                        selectedWorldBookIds.add(bookId);
                    } else {
                        selectedWorldBookIds.delete(bookId);
                    }
                });
                renderWorldBookList(category); 
                updateWorldBookSelectCount();
                return;
            }

            if (worldBookItem) {
                toggleWorldBookSelection(worldBookItem.dataset.id);
                const category = worldBookItem.closest('.collapsible-section').dataset.category;
                renderWorldBookList(category);
                return;
            }
            
            if (e.target.closest('.category-toggle-area')) {
                e.target.closest('.collapsible-section').classList.toggle('open');
                return;
            }

        } else { 
            if (e.target.closest('.collapsible-header')) {
                e.target.closest('.collapsible-section').classList.toggle('open');
                return;
            }
            
            if (worldBookItem && !e.target.closest('.action-btn')) {
                const book = db.worldBooks.find(wb => wb.id === worldBookItem.dataset.id);
                if (book) {
                    currentEditingWorldBookId = book.id;
                    worldBookIdInput.value = book.id;
                    worldBookNameInput.value = book.name;
                    worldBookContentInput.value = book.content;
                    document.getElementById('world-book-category').value = book.category || '';
                    document.querySelector(`input[name="world-book-position"][value="${book.position}"]`).checked = true;
                    document.getElementById('world-book-global').checked = book.isGlobal || false;
                    switchScreen('edit-world-book-screen');
                }
            }
        }
    });

    worldBookListContainer.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const item = e.target.closest('.world-book-item');
        if (item) {
            const category = item.closest('.collapsible-section')?.dataset.category;
            enterWorldBookMultiSelectMode(item.dataset.id, category);
        }
    });
    
    worldBookListContainer.addEventListener('touchstart', (e) => {
        const item = e.target.closest('.world-book-item');
        if (!item) return;
        longPressTimer = setTimeout(() => {
            const category = item.closest('.collapsible-section')?.dataset.category;
            enterWorldBookMultiSelectMode(item.dataset.id, category);
        }, 500);
    });
    worldBookListContainer.addEventListener('mouseup', () => clearTimeout(longPressTimer));
    worldBookListContainer.addEventListener('mouseleave', () => clearTimeout(longPressTimer));
    worldBookListContainer.addEventListener('touchend', () => clearTimeout(longPressTimer));
    worldBookListContainer.addEventListener('touchmove', () => clearTimeout(longPressTimer));

    document.getElementById('delete-selected-world-books-btn').addEventListener('click', deleteSelectedWorldBooks);
    document.getElementById('cancel-wb-multi-select-btn').addEventListener('click', exitWorldBookMultiSelectMode);

    const deleteCategoryModal = document.getElementById('world-book-delete-category-modal');
    const deleteCategoryAndEntriesBtn = document.getElementById('wb-delete-category-and-entries-btn');
    const deleteCategoryMoveEntriesBtn = document.getElementById('wb-delete-category-move-entries-btn');
    const deleteCategoryCancelBtn = document.getElementById('wb-delete-category-cancel-btn');
    if (deleteCategoryModal && deleteCategoryAndEntriesBtn && deleteCategoryMoveEntriesBtn && deleteCategoryCancelBtn) {
        deleteCategoryAndEntriesBtn.addEventListener('click', async () => {
            if (!pendingWbCategoryDelete) return;
            const cat = pendingWbCategoryDelete.category;
            const idsToDelete = db.worldBooks.filter(wb => (wb.category || '未分类') === cat).map(wb => wb.id);
            await dexieDB.worldBooks.bulkDelete(idsToDelete);
            db.worldBooks = db.worldBooks.filter(wb => (wb.category || '未分类') !== cat);
            db.characters.forEach(char => {
                if (char.worldBookIds) char.worldBookIds = char.worldBookIds.filter(id => !idsToDelete.includes(id));
            });
            db.groups.forEach(group => {
                if (group.worldBookIds) group.worldBookIds = group.worldBookIds.filter(id => !idsToDelete.includes(id));
            });
            await saveData();
            renderWorldBookList();
            deleteCategoryModal.classList.remove('visible');
            pendingWbCategoryDelete = null;
            showToast(`已删除分类及其下 ${idsToDelete.length} 个条目`);
        });
        deleteCategoryMoveEntriesBtn.addEventListener('click', async () => {
            if (!pendingWbCategoryDelete) return;
            const cat = pendingWbCategoryDelete.category;
            db.worldBooks.forEach(book => {
                if ((book.category || '未分类') === cat) book.category = '';
            });
            await saveData();
            renderWorldBookList();
            deleteCategoryModal.classList.remove('visible');
            pendingWbCategoryDelete = null;
            showToast('已删除分类，条目已移至「未分类」');
        });
        deleteCategoryCancelBtn.addEventListener('click', () => {
            deleteCategoryModal.classList.remove('visible');
            pendingWbCategoryDelete = null;
        });
    }
}

function renderWorldBookList(expandedCategory = null) {
    const worldBookListContainer = document.getElementById('world-book-list-container');
    worldBookListContainer.innerHTML = '';
    document.getElementById('no-world-books-placeholder').style.display = db.worldBooks.length === 0 ? 'block' : 'none';
    if (db.worldBooks.length === 0) return;

    const groupedBooks = db.worldBooks.reduce((acc, book) => {
        const category = book.category || '未分类';
        if (!acc[category]) acc[category] = [];
        acc[category].push(book);
        return acc;
    }, {});

    const sortedCategories = Object.keys(groupedBooks).sort((a, b) => {
        if (a === '未分类') return 1;
        if (b === '未分类') return -1;
        return a.localeCompare(b);
    });

    sortedCategories.forEach(category => {
        const section = document.createElement('div');
        section.className = 'kkt-group collapsible-section';
        section.style.cssText = 'background-color: #fff; border: none; margin-bottom: 15px; box-shadow: none;';
        section.dataset.category = category; 

        if (isWorldBookMultiSelectMode && category === expandedCategory) {
            section.classList.add('open');
        }

        const header = document.createElement('div');
        header.className = 'kkt-item collapsible-header';
        header.style.cssText = 'background-color: #fff; border-bottom: 1px solid #f5f5f5; cursor: pointer; padding: 15px;';
        
        let checkboxHTML = '';
        if (isWorldBookMultiSelectMode) {
            const allInCategory = groupedBooks[category].every(book => selectedWorldBookIds.has(book.id));
            checkboxHTML = `<input type="checkbox" class="category-checkbox" data-category="${category}" ${allInCategory ? 'checked' : ''}>`;
        }
        
        const categoryNameEscaped = category.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const editCategoryBtnHTML = !isWorldBookMultiSelectMode
            ? `<button type="button" class="action-btn world-book-edit-category-btn" title="编辑分类名" style="padding: 4px; border: none; background: transparent; margin-right: 4px;"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>`
            : '';
        const deleteCategoryBtnHTML = !isWorldBookMultiSelectMode
            ? `<button type="button" class="action-btn world-book-delete-category-btn" title="删除该分类（其下条目将移至「未分类」）" style="padding: 6px; border: none; background: transparent; margin-left: 8px;"><img src="https://i.postimg.cc/hGW6B0Wf/icons8-50.png" alt="删除分类" style="width: 20px; height: 20px; object-fit: contain;"></button>`
            : '';
        header.innerHTML = `
            <div class="category-select-area">
                ${checkboxHTML}
            </div>
            <div class="category-toggle-area" style="flex-grow: 1; display: flex; justify-content: space-between; align-items: center;">
                <div style="font-weight:bold; color:#333; font-size: 15px; display: flex; align-items: center;">${categoryNameEscaped}${editCategoryBtnHTML}</div>
                <div style="display: flex; align-items: center;">
                    ${deleteCategoryBtnHTML}
                    <span class="collapsible-arrow">▼</span>
                </div>
            </div>
        `;

        if (editCategoryBtnHTML) {
            const editCategoryBtn = header.querySelector('.world-book-edit-category-btn');
            if (editCategoryBtn) {
                editCategoryBtn.addEventListener('click', async (ev) => {
                    ev.stopPropagation();
                    const newName = prompt('输入新分类名：', category);
                    if (newName === null) return;
                    const trimmed = newName.trim();
                    if (!trimmed) return showToast('分类名不能为空');
                    if (trimmed === category) return;
                    const oldCat = category;
                    db.worldBooks.forEach(book => {
                        if ((book.category || '未分类') === oldCat) book.category = trimmed;
                    });
                    await saveData();
                    renderWorldBookList();
                    showToast('分类名已修改');
                });
            }
        }
        if (deleteCategoryBtnHTML) {
            const deleteCategoryBtn = header.querySelector('.world-book-delete-category-btn');
            if (deleteCategoryBtn) {
                deleteCategoryBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const cat = category;
                    const count = groupedBooks[category].length;
                    pendingWbCategoryDelete = { category: cat, count };
                    document.getElementById('wb-delete-category-modal-title').textContent = `删除分类「${cat}」`;
                    document.getElementById('wb-delete-category-modal-desc').textContent = `该分类下有 ${count} 个条目。要同时删除这些条目，还是将它们移至「未分类」？`;
                    document.getElementById('world-book-delete-category-modal').classList.add('visible');
                });
            }
        }

        const content = document.createElement('div');
        content.className = 'collapsible-content';
        const categoryList = document.createElement('ul');
        categoryList.className = 'list-container';
        categoryList.style.padding = '0';

        groupedBooks[category].forEach(book => {
            const li = document.createElement('li');
            li.className = 'list-item world-book-item';
            li.dataset.id = book.id;
            const isDisabled = !!book.disabled;
            if (isDisabled) li.classList.add('world-book-item-disabled');

            if (isWorldBookMultiSelectMode) {
                li.classList.add('is-selecting');
                if (selectedWorldBookIds.has(book.id)) {
                    li.classList.add('selected');
                }
            }

            const disabledBadge = isDisabled ? ' <span class="world-book-disabled-badge">未启用</span>' : '';
            li.innerHTML = `<div class="item-details" style="padding-left: 0;"><div class="item-name">${book.name}${book.isGlobal ? ' <span style="display:inline-block;background:#4CAF50;color:white;font-size:10px;padding:2px 6px;border-radius:3px;margin-left:6px;">全局</span>' : ''}${disabledBadge}</div><div class="item-preview">${book.content}</div></div>`;
            
            if (!isWorldBookMultiSelectMode) {
                const btnWrap = document.createElement('div');
                btnWrap.className = 'world-book-item-actions';
                btnWrap.style.cssText = 'position: absolute; right: 8px; top: 50%; transform: translateY(-50%); display: flex; align-items: center; gap: 4px;';
                const toggleBtn = document.createElement('button');
                toggleBtn.type = 'button';
                toggleBtn.className = 'action-btn world-book-toggle-enabled-btn';
                toggleBtn.title = isDisabled ? '点击启用' : '点击停用（停用后不会被读取）';
                toggleBtn.style.cssText = 'padding: 4px 8px; border: none; border-radius: 4px; font-size: 12px; background: ' + (isDisabled ? '#e0e0e0' : '#e8f5e9') + '; color: ' + (isDisabled ? '#666' : '#2e7d32') + ';';
                toggleBtn.textContent = isDisabled ? '启用' : '停用';
                toggleBtn.addEventListener('click', async (ev) => {
                    ev.stopPropagation();
                    const b = db.worldBooks.find(wb => wb.id === book.id);
                    if (b) {
                        b.disabled = !b.disabled;
                        await saveData();
                        renderWorldBookList();
                        showToast(b.disabled ? '已停用，该条目不会被读取' : '已启用');
                    }
                });
                const delBtn = document.createElement('button');
                delBtn.className = 'action-btn';
                delBtn.style.cssText = 'padding: 6px; border: none; background: transparent;';
                delBtn.title = '删除世界书';
                delBtn.innerHTML = '<img src="https://i.postimg.cc/hGW6B0Wf/icons8-50.png" alt="删除" style="width: 22px; height: 22px; object-fit: contain;">';
                delBtn.addEventListener('click', async (ev) => {
                    ev.stopPropagation();
                    if (!confirm('确定要删除这个世界书条目吗？')) return;
                    const bookIdToDelete = book.id;
                    await dexieDB.worldBooks.delete(bookIdToDelete);
                    db.worldBooks = db.worldBooks.filter(wb => wb.id !== bookIdToDelete);
                    db.characters.forEach(char => {
                        if (char.worldBookIds) char.worldBookIds = char.worldBookIds.filter(id => id !== bookIdToDelete);
                    });
                    db.groups.forEach(group => {
                        if (group.worldBookIds) group.worldBookIds = group.worldBookIds.filter(id => id !== bookIdToDelete);
                    });
                    await saveData();
                    renderWorldBookList();
                    showToast('世界书条目已删除');
                });
                btnWrap.appendChild(toggleBtn);
                btnWrap.appendChild(delBtn);
                li.style.position = 'relative';
                li.appendChild(btnWrap);
            }
            categoryList.appendChild(li);
        });

        content.appendChild(categoryList);
        section.appendChild(header);
        section.appendChild(content);
        worldBookListContainer.appendChild(section);
    });
}

function renderCategorizedWorldBookList(container, books, selectedIds, idPrefix) {
    container.innerHTML = '';
    if (!books || books.length === 0) {
        container.innerHTML = '<li style="color: #888; text-align: center; padding: 15px;">暂无世界书条目</li>';
        return;
    }

    const groupedBooks = books.reduce((acc, book) => {
        const category = book.category || '未分类';
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(book);
        return acc;
    }, {});

    const sortedCategories = Object.keys(groupedBooks).sort((a, b) => {
        if (a === '未分类') return 1;
        if (b === '未分类') return -1;
        return a.localeCompare(b);
    });

    sortedCategories.forEach(category => {
        const categoryBooks = groupedBooks[category];
        const allInCategorySelected = categoryBooks.every(book => selectedIds.includes(book.id));

        const groupEl = document.createElement('div');
        groupEl.className = 'world-book-category-group';

        groupEl.innerHTML = `
            <div class="world-book-category-header">
                <input type="checkbox" class="category-checkbox" ${allInCategorySelected ? 'checked' : ''}>
                <span class="category-name">${category}</span>
                <span class="category-arrow">▼</span>
            </div>
            <ul class="world-book-items-list">
                ${categoryBooks.map(book => {
                    const isChecked = selectedIds.includes(book.id);
                    return `
                        <li class="world-book-select-item">
                            <input type="checkbox" class="item-checkbox" id="${idPrefix}-${book.id}" value="${book.id}" ${isChecked ? 'checked' : ''}>
                            <label for="${idPrefix}-${book.id}">${book.name}</label>
                        </li>
                    `;
                }).join('')}
            </ul>
        `;
        container.appendChild(groupEl);
    });

    container.querySelectorAll('.world-book-category-header').forEach(header => {
        header.addEventListener('click', (e) => {
            if (e.target.type === 'checkbox') return; 
            const group = header.closest('.world-book-category-group');
            group.classList.toggle('open');
        });
    });

    container.querySelectorAll('.category-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const group = e.target.closest('.world-book-category-group');
            const itemCheckboxes = group.querySelectorAll('.item-checkbox');
            itemCheckboxes.forEach(itemCb => {
                itemCb.checked = e.target.checked;
            });
        });
    });

    container.querySelectorAll('.item-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const group = e.target.closest('.world-book-category-group');
            const categoryCheckbox = group.querySelector('.category-checkbox');
            const allItems = group.querySelectorAll('.item-checkbox');
            const allChecked = Array.from(allItems).every(item => item.checked);
            categoryCheckbox.checked = allChecked;
        });
    });
}
