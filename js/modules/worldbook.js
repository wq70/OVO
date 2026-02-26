// --- 世界书功能 (js/modules/worldbook.js) ---

function enterWorldBookMultiSelectMode(initialId, initialCategory = null) {
    if (isWorldBookMultiSelectMode) return;
    isWorldBookMultiSelectMode = true;

    document.getElementById('add-world-book-btn').style.display = 'none';
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
        switchScreen('edit-world-book-screen');
    });
    
    editWorldBookForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = worldBookNameInput.value.trim();
        const content = worldBookContentInput.value.trim();
        const category = document.getElementById('world-book-category').value.trim();
        const position = document.querySelector('input[name="world-book-position"]:checked').value;
        if (!name || !content) return showToast('名称和内容不能为空');
        if (currentEditingWorldBookId) {
            const book = db.worldBooks.find(wb => wb.id === currentEditingWorldBookId);
            if (book) {
                book.name = name;
                book.content = content;
                book.position = position;
                book.category = category;
            }
        } else {
            db.worldBooks.push({id: `wb_${Date.now()}`, name, content, position, category});
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
        
        header.innerHTML = `
            <div class="category-select-area">
                ${checkboxHTML}
            </div>
            <div class="category-toggle-area" style="flex-grow: 1; display: flex; justify-content: space-between; align-items: center;">
                <div style="font-weight:bold; color:#333; font-size: 15px;">${category}</div>
                <span class="collapsible-arrow">▼</span>
            </div>
        `;

        const content = document.createElement('div');
        content.className = 'collapsible-content';
        const categoryList = document.createElement('ul');
        categoryList.className = 'list-container';
        categoryList.style.padding = '0';

        groupedBooks[category].forEach(book => {
            const li = document.createElement('li');
            li.className = 'list-item world-book-item';
            li.dataset.id = book.id;

            if (isWorldBookMultiSelectMode) {
                li.classList.add('is-selecting');
                if (selectedWorldBookIds.has(book.id)) {
                    li.classList.add('selected');
                }
            }

            li.innerHTML = `<div class="item-details" style="padding-left: 0;"><div class="item-name">${book.name}</div><div class="item-preview">${book.content}</div></div>`;
            
            if (!isWorldBookMultiSelectMode) {
                const delBtn = document.createElement('button');
                delBtn.className = 'action-btn';
                delBtn.style.cssText = 'position: absolute; right: 8px; top: 50%; transform: translateY(-50%); padding: 6px; border: none; background: transparent;';
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
                li.style.position = 'relative';
                li.appendChild(delBtn);
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
