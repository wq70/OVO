function renderWorldBookList(expandedCategory = null) {
    const worldBookListContainer = document.getElementById('world-book-list-container');
    worldBookListContainer.innerHTML = '';
    
    // 清理之前的 sortable 实例
    if (categorySortable) {
        try { categorySortable.destroy(); } catch (e) {}
        categorySortable = null;
    }
    itemSortables.forEach(s => {
        try { s.destroy(); } catch (e) {}
    });
    itemSortables = [];
    
    let filteredBooks = db.worldBooks;
    
    // 应用搜索和筛选
    const searchInput = document.getElementById('world-book-search-input');
    const filterSelect = document.getElementById('world-book-filter-select');
    
    if (filterSelect && filterSelect.value !== 'all') {
        const filterValue = filterSelect.value;
        if (filterValue === 'global') {
            filteredBooks = filteredBooks.filter(b => b.isGlobal);
        } else if (filterValue === 'disabled') {
            filteredBooks = filteredBooks.filter(b => b.disabled);
        }
    }
    
    let searchKeyword = '';
    if (searchInput && searchInput.value.trim()) {
        searchKeyword = searchInput.value.trim().toLowerCase();
        filteredBooks = filteredBooks.filter(b => {
            return worldBookMatchesSearch(b, searchKeyword);
        });
    }

    document.getElementById('no-world-books-placeholder').style.display = filteredBooks.length === 0 ? 'block' : 'none';
    if (filteredBooks.length === 0) {
        return;
    }

    // 解析多级分类 (支持 / 分隔)
    const categoryTree = Object.create(null);
    
    filteredBooks.forEach(book => {
        const categoryPath = worldBookCategoryPath(book.category);
        
        const parts = categoryPath.split(/[\/\\]/).map(p => p.trim()).filter(p => p);
        if (parts.length === 0) parts.push('未分类');

        let currentLevel = categoryTree;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!currentLevel[part]) {
                currentLevel[part] = { _books: [], _children: Object.create(null) };
            }
            if (i === parts.length - 1) {
                currentLevel[part]._books.push(book);
            }
            currentLevel = currentLevel[part]._children;
        }
    });

    // 递归渲染分类树
    function renderCategoryNode(nodeName, nodeData, level = 0, parentPath = '') {
        const fullPath = parentPath ? `${parentPath}/${nodeName}` : nodeName;
        
        const section = document.createElement('div');
        section.className = 'kkt-group collapsible-section';
        section.style.cssText = `background-color: #fff; border: none; margin-bottom: ${level === 0 ? '15px' : '0'}; box-shadow: none; margin-left: ${level > 0 ? '15px' : '0'}; border-left: ${level > 0 ? '2px solid #f0f0f0' : 'none'}; padding-left: ${level > 0 ? '10px' : '0'};`;
        section.dataset.category = fullPath; 

        // 搜索时，如果该分类包含匹配项，或者该分类本身名称匹配了关键词，则自动展开
        const header = document.createElement('div');
        header.className = 'kkt-item world-book-folder-header';
        header.style.cssText = `background-color: #fff; border-bottom: 1px solid #f5f5f5; cursor: pointer; padding: 15px; border-radius: 12px; margin-bottom: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);`;
        
        let checkboxHTML = '';
        if (isWorldBookMultiSelectMode) {
            // 如果该分类或其子分类下的所有书都被选中
            let allBookIds = [];
            function collectIds(nd) {
                allBookIds.push(...nd._books.map(b => b.id));
                Object.values(nd._children).forEach(collectIds);
            }
            collectIds(nodeData);
            
            if (allBookIds.length > 0) {
                const allSelected = allBookIds.every(id => selectedWorldBookIds.has(id));
                checkboxHTML = `<input type="checkbox" class="category-checkbox" data-category="${worldBookEscape(fullPath)}" ${allSelected ? 'checked' : ''} style="margin-right: 12px;">`;
            }
        }
        
        const categoryNameEscaped = worldBookEscape(nodeName);
        
        // 统计该分类及其所有子分类下的总条目数
        let totalCount = 0;
        function countBooks(nd) {
            totalCount += nd._books.length;
            Object.values(nd._children).forEach(countBooks);
        }
        countBooks(nodeData);

        const editCategoryBtnHTML = !isWorldBookMultiSelectMode
            ? `<button type="button" class="action-btn world-book-edit-category-btn" title="编辑当前层级名" style="padding: 4px; border: none; background: transparent; margin-right: 4px;"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>`
            : '';
        const deleteCategoryBtnHTML = !isWorldBookMultiSelectMode
            ? `<button type="button" class="action-btn world-book-delete-category-btn" title="删除该分类（其下条目将移至「未分类」）" style="padding: 6px; border: none; background: transparent; margin-left: 8px;"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #ff3b30;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>`
            : '';
            
        header.innerHTML = `
            <div style="display: flex; align-items: center; width: 100%;">
                ${checkboxHTML}
                <div class="folder-icon" style="margin-right: 12px; color: var(--primary-color);">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                </div>
                <div class="category-toggle-area" style="flex-grow: 1; display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-weight:600; color:#333; font-size: 16px; display: flex; align-items: center;">
                        ${categoryNameEscaped} <span style="color:#999; font-size:13px; font-weight:normal; margin-left:6px;">(${totalCount} 项)</span>
                    </div>
                    <div style="display: flex; align-items: center;">
                        ${editCategoryBtnHTML}
                        ${deleteCategoryBtnHTML}
                    </div>
                </div>
            </div>
        `;

        // 点击进入详情页
        header.addEventListener('click', (ev) => {
            if (ev.target.type === 'checkbox' || ev.target.closest('.action-btn')) return;
            currentWorldBookCategory = fullPath;
            document.getElementById('world-book-detail-title').textContent = nodeName;
            renderWorldBookDetailList(fullPath);
            switchScreen('world-book-detail-screen');
        });

        if (editCategoryBtnHTML) {
            const editCategoryBtn = header.querySelector('.world-book-edit-category-btn');
            if (editCategoryBtn) {
                editCategoryBtn.addEventListener('click', async (ev) => {
                    ev.stopPropagation();
                    const newName = prompt('输入新分类名（仅修改当前层级）：', nodeName);
                    if (newName === null) return;
                    const trimmed = newName.trim().replace(/[\/\\]/g, ''); // 不允许输入斜杠
                    if (!trimmed) return showToast('分类名不能为空且不能包含斜杠');
                    if (trimmed === nodeName) return;
                    
                    const parentPrefix = parentPath ? `${parentPath}/` : '';
                    const oldFullPath = `${parentPrefix}${nodeName}`;
                    const newFullPath = `${parentPrefix}${trimmed}`;
                    
                    db.worldBooks.forEach(book => {
                        let cat = worldBookCategoryPath(book.category);
                        if (cat === oldFullPath || cat.startsWith(`${oldFullPath}/`)) {
                            book.category = cat.replace(oldFullPath, newFullPath);
                        }
                    });
                    (db.moments?.contacts || []).forEach(contact => {
                        const paths = contact.worldBookBinding?.categoryPaths;
                        if (Array.isArray(paths)) contact.worldBookBinding.categoryPaths = paths.map(path => path === oldFullPath || path.startsWith(`${oldFullPath}/`) ? newFullPath + path.slice(oldFullPath.length) : path);
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
                    let count = 0;
                    db.worldBooks.forEach(b => {
                        let cat = worldBookCategoryPath(b.category);
                        if (cat === fullPath || cat.startsWith(`${fullPath}/`)) count++;
                    });
                    
                    pendingWbCategoryDelete = { category: fullPath, count };
                    document.getElementById('wb-delete-category-modal-title').textContent = `删除分类「${nodeName}」`;
                    document.getElementById('wb-delete-category-modal-desc').textContent = `该分类（及其子分类）下共有 ${count} 个条目。要同时删除这些条目，还是将它们移至「未分类」？`;
                    document.getElementById('world-book-delete-category-modal').classList.add('visible');
                });
            }
        }

        // 首页不再渲染具体书籍和子分类内容，只显示卡片
        section.appendChild(header);
        return section;
    }

    // 从根节点开始渲染 (读取保存的分类顺序)
    let rootKeys = Object.keys(categoryTree);
    if (db.worldBookCategoryOrder) {
        rootKeys.sort((a, b) => {
            const indexA = db.worldBookCategoryOrder.indexOf(a);
            const indexB = db.worldBookCategoryOrder.indexOf(b);
            if (indexA === -1 && indexB === -1) return a.localeCompare(b);
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });
    } else {
        rootKeys.sort((a, b) => {
            if (a === '未分类') return 1;
            if (b === '未分类') return -1;
            return a.localeCompare(b);
        });
    }

    rootKeys.forEach(rootKey => {
        const section = renderCategoryNode(rootKey, categoryTree[rootKey]);
        worldBookListContainer.appendChild(section);
    });

    // 初始化分类拖拽排序（移动端/触摸设备不启用，避免影响点击）
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (typeof Sortable !== 'undefined' && !isWorldBookMultiSelectMode && !searchKeyword && !isTouchDevice) {
        categorySortable = new Sortable(worldBookListContainer, {
            animation: 150,
            handle: '.collapsible-header', // 点击头部拖拽
            ghostClass: 'sortable-ghost',
            onEnd: async function () {
                const newOrder = Array.from(worldBookListContainer.children).map(el => {
                    const categoryPath = el.dataset.category;
                    return categoryPath.split(/[\/\\]/)[0]; // 记录根节点顺序
                });
                db.worldBookCategoryOrder = newOrder;
                await saveData();
            }
        });

        // 初始化条目拖拽排序
        const lists = worldBookListContainer.querySelectorAll('.list-container');
        lists.forEach(listEl => {
            const sortable = new Sortable(listEl, {
                animation: 150,
                group: 'worldBookItems', // 允许在不同分类间拖拽
                ghostClass: 'sortable-ghost',
                onEnd: async function (evt) {
                    // 更新数据库中的分类和顺序
                    const itemEl = evt.item;
                    const bookId = itemEl.dataset.id;
                    const book = db.worldBooks.find(b => b.id === bookId);
                    
                    const newSection = itemEl.closest('.collapsible-section');
                    if (newSection && book) {
                        book.category = newSection.dataset.category;
                    }

                    // 重新排序 db.worldBooks (简单地把当前列表的所有书移到最后，保持它们之间的相对顺序)
                    // 更严谨的做法是更新所有书籍的 order 字段，但这里为了简便，依赖数组自身的顺序
                    const currentListIds = Array.from(evt.to.children).map(el => el.dataset.id);
                    const otherBooks = db.worldBooks.filter(b => !currentListIds.includes(b.id));
                    const sortedBooksInList = currentListIds.map(id => db.worldBooks.find(b => b.id === id)).filter(b => b);
                    
                    db.worldBooks = [...otherBooks, ...sortedBooksInList];

                    await dexieDB.worldBooks.bulkPut(db.worldBooks);
                    await saveData();
                    
                    // 如果跨分类拖拽了，需要重新渲染以更新数量等
                    if (evt.from !== evt.to) {
                        renderWorldBookList(newSection ? newSection.dataset.category : null);
                    }
                }
            });
            itemSortables.push(sortable);
        });
    }
}

function renderWorldBookDetailList(categoryPath) {
    const listContainer = document.getElementById('world-book-detail-list-container');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    itemSortables.forEach(s => {
        try { s.destroy(); } catch (e) {}
    });
    itemSortables = [];

    let filteredBooks = db.worldBooks.filter(b => worldBookInCategory(b, categoryPath));

    // 应用搜索和筛选
    const searchInput = document.getElementById('world-book-detail-search-input');
    const filterSelect = document.getElementById('world-book-detail-filter-select');
    
    if (filterSelect && filterSelect.value !== 'all') {
        const filterValue = filterSelect.value;
        if (filterValue === 'global') {
            filteredBooks = filteredBooks.filter(b => b.isGlobal);
        } else if (filterValue === 'disabled') {
            filteredBooks = filteredBooks.filter(b => b.disabled);
        }
    }
    
    if (searchInput && searchInput.value.trim()) {
        const searchKeyword = searchInput.value.trim().toLowerCase();
        filteredBooks = filteredBooks.filter(b => {
            return worldBookMatchesSearch(b, searchKeyword);
        });
    }

    const placeholder = document.getElementById('no-world-books-detail-placeholder');
    if (placeholder) placeholder.style.display = filteredBooks.length === 0 ? 'block' : 'none';

    if (filteredBooks.length === 0) return;

    filteredBooks.forEach(book => {
        const li = document.createElement('li');
        li.className = 'list-item world-book-item';
        li.style.cssText = 'border-radius: 12px; margin-bottom: 10px; border: 1px solid #f0f0f0; box-shadow: 0 1px 3px rgba(0,0,0,0.02); overflow: hidden;';
        li.dataset.id = book.id;
        
        const isDisabled = !!book.disabled;
        if (isDisabled) li.classList.add('world-book-item-disabled');

        if (isWorldBookMultiSelectMode) {
            li.classList.add('is-selecting');
            if (selectedWorldBookIds.has(book.id)) {
                li.classList.add('selected');
            }
        }

        const disabledBadge = isDisabled ? ' <span class="world-book-disabled-badge" style="background:#e0e0e0;color:#666;font-size:10px;padding:2px 6px;border-radius:4px;margin-left:6px;">未启用</span>' : '';
        let metaHTML = '';
        if (book.alwaysOn !== false) {
            metaHTML += '<span style="font-size:10px;color:#fff;background:var(--primary-color);padding:2px 6px;border-radius:4px;margin-right:4px;">常驻</span>';
        }
        if (book.weight !== undefined) {
            metaHTML += `<span style="font-size:10px;color:#666;background:#eee;padding:2px 6px;border-radius:4px;margin-right:4px;">权重:${worldBookEscape(book.weight)}</span>`;
        }
        
        let tagsHTML = '';
        if (Array.isArray(book.tags) && book.tags.length > 0) {
            tagsHTML = `<div class="item-tags" style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px;">${book.tags.map(t => `<span style="font-size:11px;color:var(--primary-color);background:rgba(255,128,171,0.1);padding:3px 8px;border-radius:12px;">#${worldBookEscape(t)}</span>`).join('')}</div>`;
        }
        
        let keywordHTML = '';
        if (book.alwaysOn === false && Array.isArray(book.keywords) && book.keywords.length > 0) {
            keywordHTML = `<div style="font-size:12px;color:#888;margin-top:6px; background:#f9f9f9; padding:4px 8px; border-radius:6px; display:inline-block;"><span style="color:#666;">🔑</span> ${worldBookEscape(book.keywords.join(', '))}</div>`;
        }

        // 显示子分类路径
        let subCategoryHTML = '';
        if (worldBookCategoryPath(book.category) !== worldBookCategoryPath(categoryPath)) {
            const relPath = worldBookCategoryPath(book.category).replace(categoryPath + '/', '');
            subCategoryHTML = `<div style="font-size:11px; color:#999; margin-bottom:4px;">📂 ${worldBookEscape(relPath)}</div>`;
        }
        
        li.innerHTML = `
            <div class="item-details" style="padding: 12px; ${isWorldBookMultiSelectMode ? 'padding-left: 45px;' : ''}">
                ${subCategoryHTML}
                <div class="item-name" style="margin-bottom: 6px; font-size: 15px; font-weight: 600; color: #333;">
                    ${worldBookEscape(book.name)}
                    ${book.isGlobal ? ' <span style="display:inline-block;background:#4CAF50;color:white;font-size:10px;padding:2px 6px;border-radius:4px;margin-left:6px;vertical-align:middle;">全局</span>' : ''}
                    ${disabledBadge}
                </div>
                <div style="margin-bottom: 8px;">${metaHTML}</div>
                <div class="item-preview" style="color: #666; font-size: 13px; line-height: 1.5; background: #fafafa; padding: 10px; border-radius: 8px; margin-top: 8px;">${typeof book.content === 'string' ? worldBookEscape(book.content).replace(/\n/g, '<br>') : '<span role="status">正文格式异常，原始数据已保留。请先导出备份核对内容。</span>'}</div>
                ${keywordHTML}
                ${tagsHTML}
            </div>
        `;
        
        if (!isWorldBookMultiSelectMode) {
            const btnWrap = document.createElement('div');
            btnWrap.className = 'world-book-item-actions';
            btnWrap.style.cssText = 'position: absolute; right: 12px; top: 12px; display: flex; align-items: center; gap: 8px;';
            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'action-btn world-book-toggle-enabled-btn';
            toggleBtn.title = isDisabled ? '点击启用' : '点击停用（停用后不会被读取）';
            toggleBtn.style.cssText = 'padding: 4px 10px; border: none; border-radius: 12px; font-size: 12px; background: ' + (isDisabled ? '#f0f0f0' : '#e8f5e9') + '; color: ' + (isDisabled ? '#666' : '#2e7d32') + '; cursor: pointer; transition: all 0.2s;';
            toggleBtn.textContent = isDisabled ? '启用' : '停用';
            toggleBtn.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                const b = db.worldBooks.find(wb => wb.id === book.id);
                if (b) {
                    b.disabled = !b.disabled;
                    await saveData();
                    renderWorldBookDetailList(categoryPath);
                    showToast(b.disabled ? '已停用，该条目不会被读取' : '已启用');
                }
            });
            const delBtn = document.createElement('button');
            delBtn.className = 'action-btn';
            delBtn.style.cssText = 'padding: 4px; border: none; background: transparent; color: #ff3b30; cursor: pointer; display: flex; align-items: center; justify-content: center;';
            delBtn.title = '删除世界书';
            delBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
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
                renderWorldBookList(); // 更新首页的数字
                renderWorldBookDetailList(categoryPath);
                showToast('世界书条目已删除');
            });
            btnWrap.appendChild(toggleBtn);
            btnWrap.appendChild(delBtn);
            li.appendChild(btnWrap);
        }
        listContainer.appendChild(li);
    });

    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (typeof Sortable !== 'undefined' && !isWorldBookMultiSelectMode && !isTouchDevice && !searchInput?.value) {
        const sortable = new Sortable(listContainer, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: async function (evt) {
                // ... 可以在这里实现同分类下的排序逻辑，当前暂不支持自定义 order
            }
        });
        itemSortables.push(sortable);
    }
}

function renderCategorizedWorldBookList(container, books, selectedIds, idPrefix) {
    container.innerHTML = '';
    if (!books || books.length === 0) {
        container.innerHTML = '<li style="color: #888; text-align: center; padding: 15px;">暂无世界书条目</li>';
        return;
    }

    // 选择世界书界面也支持多级分类渲染（这里为了简化展示，将多级路径拍平展示）
    const groupedBooks = books.reduce((acc, book) => {
        const category = worldBookCategoryPath(book.category);
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(book);
        return acc;
    }, Object.create(null));

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
                <span class="category-name">${worldBookEscape(category)}</span>
                <span class="category-arrow">▼</span>
            </div>
            <ul class="world-book-items-list">
                ${categoryBooks.map(book => {
                    const isChecked = selectedIds.includes(book.id);
                    return `
                        <li class="world-book-select-item">
                            <input type="checkbox" class="item-checkbox" id="${idPrefix}-${book.id}" value="${book.id}" ${isChecked ? 'checked' : ''}>
                            <label for="${idPrefix}-${book.id}">${worldBookEscape(book.name)}</label>
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
