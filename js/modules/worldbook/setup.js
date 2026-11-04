function setupWorldBookApp() {
    const addWorldBookBtn = document.getElementById('add-world-book-btn');
    const editWorldBookForm = document.getElementById('edit-world-book-form');
    const worldBookNameInput = document.getElementById('world-book-name');
    const worldBookCategoryInput = document.getElementById('world-book-category');
    const worldBookTagsInput = document.getElementById('world-book-tags');
    const worldBookContentInput = document.getElementById('world-book-content');
    const worldBookListContainer = document.getElementById('world-book-list-container');
    const worldBookIdInput = document.getElementById('world-book-id');
    const searchInput = document.getElementById('world-book-search-input');
    const filterSelect = document.getElementById('world-book-filter-select');

    if (searchInput) {
        searchInput.addEventListener('input', () => renderWorldBookList());
    }
    if (filterSelect) {
        filterSelect.addEventListener('change', () => renderWorldBookList());
    }

    const addWbActionSheet = document.getElementById('add-world-book-actionsheet');
    if (addWorldBookBtn && addWbActionSheet) {
        addWorldBookBtn.addEventListener('click', () => {
            addWbActionSheet.classList.add('visible');
        });
    }
    
    const manualWbBtn = document.getElementById('wb-method-manual-btn');
    if (manualWbBtn) {
        manualWbBtn.addEventListener('click', () => {
            if (addWbActionSheet) addWbActionSheet.classList.remove('visible');
            currentEditingWorldBookId = null;
            editWorldBookForm.reset();
            document.querySelector('input[name="world-book-position"][value="before"]').checked = true;
            document.getElementById('world-book-global').checked = false;
            document.getElementById('world-book-always-on').checked = true;
            document.getElementById('world-book-weight').value = 100;
            document.getElementById('world-book-keywords-group').style.display = 'none';
            switchScreen('edit-world-book-screen');
        });
    }

    const importWorldBookFileInput = document.getElementById('import-world-book-file-input');
    const importWbBtn = document.getElementById('wb-method-import-btn');
    if (importWbBtn && importWorldBookFileInput) {
        importWbBtn.addEventListener('click', () => {
            if (addWbActionSheet) addWbActionSheet.classList.remove('visible');
            importWorldBookFileInput.click();
        });
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

    const cancelWbMethodBtn = document.getElementById('wb-method-cancel-btn');
    if (cancelWbMethodBtn && addWbActionSheet) {
        cancelWbMethodBtn.addEventListener('click', () => {
            addWbActionSheet.classList.remove('visible');
        });
    }

    const alwaysOnCheckbox = document.getElementById('world-book-always-on');
    if (alwaysOnCheckbox) {
        alwaysOnCheckbox.addEventListener('change', (e) => {
            document.getElementById('world-book-keywords-group').style.display = e.target.checked ? 'none' : 'block';
        });
    }

    const exportWorldBookBtn = document.getElementById('export-world-book-btn');
    const exportWbActionSheet = document.getElementById('export-world-book-actionsheet');
    const customExportModal = document.getElementById('world-book-custom-export-modal');

    if (exportWorldBookBtn && exportWbActionSheet) {
        exportWorldBookBtn.addEventListener('click', () => {
            exportWbActionSheet.classList.add('visible');
        });
    }

    if (exportWbActionSheet) {
        const exportAllBtn = document.getElementById('wb-export-all-btn');
        const exportCustomBtn = document.getElementById('wb-export-custom-btn');
        const exportCancelBtn = document.getElementById('wb-export-cancel-btn');

        if (exportAllBtn) {
            exportAllBtn.addEventListener('click', () => {
                exportWbActionSheet.classList.remove('visible');
                handleExportWorldBookBtnClick();
            });
        }

        if (exportCustomBtn) {
            exportCustomBtn.addEventListener('click', () => {
                exportWbActionSheet.classList.remove('visible');
                openWorldBookCustomExportModal();
            });
        }

        if (exportCancelBtn) {
            exportCancelBtn.addEventListener('click', () => {
                exportWbActionSheet.classList.remove('visible');
            });
        }
    }

    if (customExportModal) {
        const closeBtn = document.getElementById('wb-custom-export-close-btn');
        const confirmBtn = document.getElementById('wb-custom-export-confirm-btn');
        const selectAllCheckbox = document.getElementById('wb-custom-export-select-all');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                customExportModal.classList.remove('visible');
            });
        }

        if (confirmBtn) {
            confirmBtn.addEventListener('click', handleCustomExportConfirm);
        }

        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                const checkboxes = customExportModal.querySelectorAll('.custom-export-item-checkbox');
                checkboxes.forEach(cb => {
                    cb.checked = e.target.checked;
                });
                // 更新分类复选框状态
                const categoryCheckboxes = customExportModal.querySelectorAll('.custom-export-category-checkbox');
                categoryCheckboxes.forEach(cb => {
                    cb.checked = e.target.checked;
                });
                updateCustomExportSelectCount();
            });
        }
    }
    
    editWorldBookForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = worldBookNameInput.value.trim();
        const content = worldBookContentInput.value.trim();
        const category = worldBookCategoryInput.value.trim();
        const tagsRaw = worldBookTagsInput ? worldBookTagsInput.value.trim() : '';
        const tags = tagsRaw ? tagsRaw.split(/[,，]+/).map(t => t.trim()).filter(t => t) : [];
        const position = document.querySelector('input[name="world-book-position"]:checked').value;
        const isGlobal = document.getElementById('world-book-global').checked;
        const alwaysOn = document.getElementById('world-book-always-on').checked;
        const keywordsRaw = document.getElementById('world-book-keywords').value.trim();
        const keywords = keywordsRaw ? keywordsRaw.split(/[,，]+/).map(k => k.trim()).filter(k => k) : [];
        const weight = parseInt(document.getElementById('world-book-weight').value, 10) || 100;

        if (!name || !content) return showToast('名称和内容不能为空');
        if (currentEditingWorldBookId) {
            const book = db.worldBooks.find(wb => wb.id === currentEditingWorldBookId);
            if (book) {
                if (!worldBookCanEdit(book)) return;
                book.name = name;
                book.content = content;
                book.position = position;
                book.category = category;
                book.tags = tags;
                book.isGlobal = isGlobal;
                book.alwaysOn = alwaysOn;
                book.keywords = keywords;
                book.weight = weight;
                if (typeof book.disabled === 'undefined') book.disabled = false;
            }
        } else {
            db.worldBooks.push({
                id: `wb_${Date.now()}`, name, content, position, category, tags, isGlobal, disabled: false,
                alwaysOn, keywords, weight
            });
        }
        if (await saveData() === false) return;
        showToast('世界书条目已保存');
        renderWorldBookList();
        switchScreen('world-book-screen');
    });

    worldBookListContainer.addEventListener('click', e => {
        const worldBookItem = e.target.closest('.world-book-item');

        if (isWorldBookMultiSelectMode) {
            if (e.target.matches('.category-checkbox')) {
                const category = e.target.dataset.category;
                const booksInCategory = db.worldBooks.filter(b => worldBookInCategory(b, category));
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
                    if (!worldBookCanEdit(book)) return;
                    currentEditingWorldBookId = book.id;
                    worldBookIdInput.value = book.id;
                    worldBookNameInput.value = book.name;
                    worldBookContentInput.value = book.content;
                    worldBookCategoryInput.value = typeof book.category === 'string' ? book.category : '';
                    if (worldBookTagsInput) {
                        worldBookTagsInput.value = Array.isArray(book.tags) ? book.tags.join(', ') : '';
                    }
                    document.querySelector(`input[name="world-book-position"][value="${['before', 'middle', 'after'].includes(book.position) ? book.position : 'before'}"]`).checked = true;
                    document.getElementById('world-book-global').checked = book.isGlobal || false;
                    
                    const alwaysOn = book.alwaysOn !== false;
                    document.getElementById('world-book-always-on').checked = alwaysOn;
                    document.getElementById('world-book-keywords-group').style.display = alwaysOn ? 'none' : 'block';
                    document.getElementById('world-book-keywords').value = Array.isArray(book.keywords) ? book.keywords.join(', ') : '';
                    document.getElementById('world-book-weight').value = book.weight !== undefined ? book.weight : 100;
                    
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

    const selectAllBtn = document.getElementById('world-book-select-all-btn');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            const listItems = document.querySelectorAll('#world-book-list-container .world-book-item');
            if (listItems.length > 0) {
                // 如果在首页（有分类折叠的情况），全选按钮不一定好处理所有展开和未展开的。
                // 简化处理：全选当前显示在列表里的所有条目的所属分类，但实际上首页渲染的是分类卡片，没有单独的 item
                // 因为当前首页结构不同，这里的全选按钮通常是在详情页才更有用。
                // 不过如果首页有全选按钮，我们可以全选数据库中所有受当前筛选器影响的条目：
                
                let filteredBooks = db.worldBooks;
                const filterSelect = document.getElementById('world-book-filter-select');
                if (filterSelect && filterSelect.value !== 'all') {
                    if (filterSelect.value === 'global') filteredBooks = filteredBooks.filter(b => b.isGlobal);
                    else if (filterSelect.value === 'disabled') filteredBooks = filteredBooks.filter(b => b.disabled);
                }
                const searchInput = document.getElementById('world-book-search-input');
                if (searchInput && searchInput.value.trim()) {
                    const searchKeyword = searchInput.value.trim().toLowerCase();
                    filteredBooks = filteredBooks.filter(b => {
                        return worldBookMatchesSearch(b, searchKeyword);
                    });
                }
                
                const allSelected = filteredBooks.every(b => selectedWorldBookIds.has(b.id));
                if (allSelected) {
                    filteredBooks.forEach(b => selectedWorldBookIds.delete(b.id));
                } else {
                    filteredBooks.forEach(b => selectedWorldBookIds.add(b.id));
                }
                renderWorldBookList();
                updateWorldBookSelectCount();
            }
        });
    }

    const exportSelectedBtn = document.getElementById('export-selected-world-books-btn');
    if (exportSelectedBtn) exportSelectedBtn.addEventListener('click', handleExportSelectedWorldBooksBtnClick);

    document.getElementById('delete-selected-world-books-btn').addEventListener('click', deleteSelectedWorldBooks);
    document.getElementById('move-selected-world-books-btn').addEventListener('click', showMoveCategoryModal);
    document.getElementById('toggle-selected-world-books-btn').addEventListener('click', toggleSelectedWorldBooks);
    document.getElementById('cancel-wb-multi-select-btn').addEventListener('click', exitWorldBookMultiSelectMode);

    // 移动到分类模态框的事件处理
    const moveCategoryModal = document.getElementById('world-book-move-category-modal');
    const moveCategoryConfirmBtn = document.getElementById('wb-move-category-confirm-btn');
    const moveCategoryCancelBtn = document.getElementById('wb-move-category-cancel-btn');
    if (moveCategoryModal && moveCategoryConfirmBtn && moveCategoryCancelBtn) {
        moveCategoryConfirmBtn.addEventListener('click', () => {
            const categoryList = document.getElementById('wb-move-category-list');
            const selectedOption = categoryList.querySelector('.wb-move-category-option[data-selected="true"]:not(.wb-move-category-new)');
            if (selectedOption) {
                const targetCategory = selectedOption.dataset.category;
                moveSelectedWorldBooksToCategory(targetCategory);
                moveCategoryModal.classList.remove('visible');
                // 清除选择状态
                categoryList.querySelectorAll('.wb-move-category-option').forEach(opt => {
                    opt.style.backgroundColor = '';
                    delete opt.dataset.selected;
                });
            } else {
                showToast('请先选择一个分类');
            }
        });
        moveCategoryCancelBtn.addEventListener('click', () => {
            moveCategoryModal.classList.remove('visible');
            // 清除选择状态
            const categoryList = document.getElementById('wb-move-category-list');
            if (categoryList) {
                categoryList.querySelectorAll('.wb-move-category-option').forEach(opt => {
                    opt.style.backgroundColor = '';
                    delete opt.dataset.selected;
                });
            }
        });
    }

    const deleteCategoryModal = document.getElementById('world-book-delete-category-modal');
    const deleteCategoryAndEntriesBtn = document.getElementById('wb-delete-category-and-entries-btn');
    const deleteCategoryMoveEntriesBtn = document.getElementById('wb-delete-category-move-entries-btn');
    const deleteCategoryCancelBtn = document.getElementById('wb-delete-category-cancel-btn');
    if (deleteCategoryModal && deleteCategoryAndEntriesBtn && deleteCategoryMoveEntriesBtn && deleteCategoryCancelBtn) {
        deleteCategoryAndEntriesBtn.addEventListener('click', async () => {
            if (!pendingWbCategoryDelete) return;
            const cat = pendingWbCategoryDelete.category;
            const idsToDelete = db.worldBooks.filter(wb => worldBookInCategory(wb, cat)).map(wb => wb.id);
            await dexieDB.worldBooks.bulkDelete(idsToDelete);
            db.worldBooks = db.worldBooks.filter(wb => !worldBookInCategory(wb, cat));
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
            if (worldBookInCategory(book, cat)) book.category = '';
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

    // 详情页相关事件
    const detailSearchInput = document.getElementById('world-book-detail-search-input');
    const detailFilterSelect = document.getElementById('world-book-detail-filter-select');
    if (detailSearchInput) detailSearchInput.addEventListener('input', () => renderWorldBookDetailList(currentWorldBookCategory));
    if (detailFilterSelect) detailFilterSelect.addEventListener('change', () => renderWorldBookDetailList(currentWorldBookCategory));

    const detailExportBtn = document.getElementById('detail-export-world-book-btn');
    if (detailExportBtn) detailExportBtn.addEventListener('click', handleDetailExportWorldBookBtnClick);

    const detailAddBtn = document.getElementById('detail-add-world-book-btn');
    if (detailAddBtn) {
        detailAddBtn.addEventListener('click', () => {
            if (addWbActionSheet) addWbActionSheet.classList.add('visible');
        });
    }

    const detailSelectAllBtn = document.getElementById('world-book-detail-select-all-btn');
    if (detailSelectAllBtn) {
        detailSelectAllBtn.addEventListener('click', () => {
            const listItems = document.querySelectorAll('#world-book-detail-list-container .world-book-item');
            if (listItems.length > 0) {
                let filteredBooks = db.worldBooks.filter(b => worldBookInCategory(b, currentWorldBookCategory));
                
                const filterSelect = document.getElementById('world-book-detail-filter-select');
                if (filterSelect && filterSelect.value !== 'all') {
                    if (filterSelect.value === 'global') filteredBooks = filteredBooks.filter(b => b.isGlobal);
                    else if (filterSelect.value === 'disabled') filteredBooks = filteredBooks.filter(b => b.disabled);
                }
                const searchInput = document.getElementById('world-book-detail-search-input');
                if (searchInput && searchInput.value.trim()) {
                    const searchKeyword = searchInput.value.trim().toLowerCase();
                    filteredBooks = filteredBooks.filter(b => {
                        return worldBookMatchesSearch(b, searchKeyword);
                    });
                }

                const allSelected = filteredBooks.every(b => selectedWorldBookIds.has(b.id));
                if (allSelected) {
                    filteredBooks.forEach(b => selectedWorldBookIds.delete(b.id));
                } else {
                    filteredBooks.forEach(b => selectedWorldBookIds.add(b.id));
                }
                renderWorldBookDetailList(currentWorldBookCategory);
                updateWorldBookSelectCount();
            }
        });
    }

    const detailCancelMultiBtn = document.getElementById('detail-cancel-wb-multi-select-btn');
    if (detailCancelMultiBtn) detailCancelMultiBtn.addEventListener('click', exitWorldBookMultiSelectMode);

    const detailExportSelectedBtn = document.getElementById('detail-export-selected-world-books-btn');
    if (detailExportSelectedBtn) detailExportSelectedBtn.addEventListener('click', handleExportSelectedWorldBooksBtnClick);

    const detailDeleteBtn = document.getElementById('detail-delete-selected-world-books-btn');
    if (detailDeleteBtn) detailDeleteBtn.addEventListener('click', deleteSelectedWorldBooks);

    const detailMoveBtn = document.getElementById('detail-move-selected-world-books-btn');
    if (detailMoveBtn) detailMoveBtn.addEventListener('click', showMoveCategoryModal);

    const detailToggleBtn = document.getElementById('detail-toggle-selected-world-books-btn');
    if (detailToggleBtn) detailToggleBtn.addEventListener('click', toggleSelectedWorldBooks);

    const detailListContainer = document.getElementById('world-book-detail-list-container');
    if (detailListContainer) {
        detailListContainer.addEventListener('click', e => {
            const worldBookItem = e.target.closest('.world-book-item');

            if (isWorldBookMultiSelectMode) {
                if (worldBookItem) {
                    toggleWorldBookSelection(worldBookItem.dataset.id);
                    renderWorldBookDetailList(currentWorldBookCategory);
                    return;
                }
            } else {
                if (worldBookItem && !e.target.closest('.action-btn')) {
                    const book = db.worldBooks.find(wb => wb.id === worldBookItem.dataset.id);
                    if (book) {
                        if (!worldBookCanEdit(book)) return;
                        currentEditingWorldBookId = book.id;
                        worldBookIdInput.value = book.id;
                        worldBookNameInput.value = book.name;
                        worldBookContentInput.value = book.content;
                        worldBookCategoryInput.value = typeof book.category === 'string' ? book.category : '';
                        if (worldBookTagsInput) {
                            worldBookTagsInput.value = Array.isArray(book.tags) ? book.tags.join(', ') : '';
                        }
                        document.querySelector(`input[name="world-book-position"][value="${['before', 'middle', 'after'].includes(book.position) ? book.position : 'before'}"]`).checked = true;
                        document.getElementById('world-book-global').checked = book.isGlobal || false;
                        
                        const alwaysOn = book.alwaysOn !== false;
                        document.getElementById('world-book-always-on').checked = alwaysOn;
                        document.getElementById('world-book-keywords-group').style.display = alwaysOn ? 'none' : 'block';
                        document.getElementById('world-book-keywords').value = Array.isArray(book.keywords) ? book.keywords.join(', ') : '';
                        document.getElementById('world-book-weight').value = book.weight !== undefined ? book.weight : 100;
                        
                        switchScreen('edit-world-book-screen');
                    }
                }
            }
        });

        detailListContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const item = e.target.closest('.world-book-item');
            if (item) {
                enterWorldBookMultiSelectMode(item.dataset.id, currentWorldBookCategory);
            }
        });
        
        detailListContainer.addEventListener('touchstart', (e) => {
            const item = e.target.closest('.world-book-item');
            if (!item) return;
            longPressTimer = setTimeout(() => {
                enterWorldBookMultiSelectMode(item.dataset.id, currentWorldBookCategory);
            }, 500);
        });
        detailListContainer.addEventListener('mouseup', () => clearTimeout(longPressTimer));
        detailListContainer.addEventListener('mouseleave', () => clearTimeout(longPressTimer));
        detailListContainer.addEventListener('touchend', () => clearTimeout(longPressTimer));
        detailListContainer.addEventListener('touchmove', () => clearTimeout(longPressTimer));
    }
}

