// --- 回忆日记功能 (js/modules/journal.js) ---

let generatingChatId = null;
const autoJournalRetryTimers = {};
const autoJournalActiveTasks = new Map();

function setupMemoryJournalScreen() {
    if (typeof setupAutoJournalVisualization === 'function') {
        setupAutoJournalVisualization();
    }

    const journalTitleBtn = document.getElementById('journal-title-btn');
    const journalTitleActionsheet = document.getElementById('journal-title-actionsheet');
    const journalTitleCancelBtn = document.getElementById('journal-title-cancel-btn');
    const manualAddJournalBtn = document.getElementById('manual-add-journal-btn');
    const searchJournalBtn = document.getElementById('search-journal-btn');
    const journalSearchBar = document.getElementById('journal-search-bar');
    const journalSearchInput = document.getElementById('journal-search-input');
    const manualJournalModal = document.getElementById('manual-journal-modal');
    const manualJournalForm = document.getElementById('manual-journal-form');
    const manualJournalCancelBtn = document.getElementById('manual-journal-cancel-btn');
    
    // 导入/导出
    const exportJournalBtn = document.getElementById('export-journal-btn');
    const importJournalBtn = document.getElementById('import-journal-btn');
    const importJournalFileInput = document.getElementById('import-journal-file-input');
    const journalBatchExportBtn = document.getElementById('journal-batch-export-btn');

    const generateNewJournalBtn = document.getElementById('generate-new-journal-btn');
    const generateJournalModal = document.getElementById('generate-journal-modal');
    const generateJournalForm = document.getElementById('generate-journal-form');
    const includeFavoritedCheckboxEl = document.getElementById('journal-include-favorited');
    const journalListContainer = document.getElementById('journal-list-container');
    const editDetailBtn = document.getElementById('edit-journal-detail-btn');
    const saveDetailBtn = document.getElementById('save-journal-detail-btn');
    const bindWorldBookBtn = document.getElementById('bind-journal-worldbook-btn');
    // 新增元素引用
    const journalStyleModal = document.getElementById('journal-style-selection-modal');
    const saveJournalStyleBtn = document.getElementById('save-journal-style-btn');
    const journalStyleRadios = document.querySelectorAll('input[name="journal-style-mode"]');
    const customStyleContainer = document.getElementById('journal-custom-style-container');
    const journalStyleWorldBookList = document.getElementById('journal-style-worldbook-list');
    // 新增：多选管理相关元素
    const manageBtn = document.getElementById('journal-manage-btn');
    const cancelManageBtn = document.getElementById('journal-cancel-manage-btn');
    const multiSelectBar = document.getElementById('journal-multi-select-bar');
    const batchDeleteBtn = document.getElementById('journal-batch-delete-btn');
    const mergeBtn = document.getElementById('journal-merge-btn');
    const selectCountSpan = document.getElementById('journal-select-count');
    const selectAllBtn = document.getElementById('journal-select-all-btn');

    let isMultiSelectMode = false;
    let selectedJournalIds = new Set();

    // 绑定标题点击事件
    if (journalTitleBtn) {
        journalTitleBtn.addEventListener('click', () => {
            if (journalTitleActionsheet) journalTitleActionsheet.classList.add('visible');
        });
    }

    if (journalTitleCancelBtn) {
        journalTitleCancelBtn.addEventListener('click', () => {
            if (journalTitleActionsheet) journalTitleActionsheet.classList.remove('visible');
        });
    }

    // 绑定搜索按钮事件
    if (searchJournalBtn) {
        searchJournalBtn.addEventListener('click', () => {
            if (journalTitleActionsheet) journalTitleActionsheet.classList.remove('visible');
            if (journalSearchBar) {
                if (journalSearchBar.style.display === 'none') {
                    journalSearchBar.style.display = 'block';
                    if (journalSearchInput) journalSearchInput.focus();
                } else {
                    journalSearchBar.style.display = 'none';
                    if (journalSearchInput) {
                        journalSearchInput.value = '';
                        renderJournalList();
                    }
                }
            }
        });
    }

    // 绑定导入导出按钮事件
    if (exportJournalBtn) {
        exportJournalBtn.addEventListener('click', () => {
            if (journalTitleActionsheet) journalTitleActionsheet.classList.remove('visible');
            exportAllJournals();
        });
    }
    
    if (importJournalBtn) {
        importJournalBtn.addEventListener('click', () => {
            if (journalTitleActionsheet) journalTitleActionsheet.classList.remove('visible');
            if (importJournalFileInput) importJournalFileInput.click();
        });
    }
    
    if (importJournalFileInput) {
        importJournalFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            importJournals(file);
            e.target.value = ''; // 清空选中以便下次重新选同一个文件
        });
    }

    if (journalSearchInput) {
        journalSearchInput.addEventListener('input', (e) => {
            renderJournalList(e.target.value.trim());
        });
    }

    // 绑定手动添加按钮事件
    if (manualAddJournalBtn) {
        manualAddJournalBtn.addEventListener('click', () => {
            if (journalTitleActionsheet) journalTitleActionsheet.classList.remove('visible');
            if (manualJournalForm) manualJournalForm.reset();
            if (manualJournalModal) manualJournalModal.classList.add('visible');
        });
    }

    if (manualJournalCancelBtn) {
        manualJournalCancelBtn.addEventListener('click', () => {
            if (manualJournalModal) manualJournalModal.classList.remove('visible');
        });
    }

    // 手动添加日记表单提交
    if (manualJournalForm) {
        manualJournalForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const titleInput = document.getElementById('manual-journal-title');
            const contentInput = document.getElementById('manual-journal-content');
            
            const title = titleInput.value.trim();
            const content = contentInput.value.trim();

            if (!title || !content) {
                showToast('标题和内容不能为空');
                return;
            }

            const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
            if (!chat) return;

            const newJournal = {
                id: `journal_${Date.now()}`,
                range: { start: 0, end: 0 }, // 手动添加的暂不绑定具体消息范围
                title: title,
                content: content,
                createdAt: Date.now(),
                chatId: currentChatId,
                chatType: currentChatType,
                isFavorited: false 
            };

            if (!chat.memoryJournals) {
                chat.memoryJournals = [];
            }
            chat.memoryJournals.push(newJournal);
            await saveData();

            if (manualJournalModal) manualJournalModal.classList.remove('visible');
            renderJournalList();
            showToast('已手动添加新记忆');
        });
    }

    // 绑定按钮点击事件
    if (manageBtn) {
        manageBtn.addEventListener('click', () => {
            toggleMultiSelectMode(true);
        });
    }

    if (cancelManageBtn) {
        cancelManageBtn.addEventListener('click', () => {
            toggleMultiSelectMode(false);
        });
    }

    if (batchDeleteBtn) {
        batchDeleteBtn.addEventListener('click', async () => {
            if (selectedJournalIds.size === 0) return;
            if (confirm(`确定要删除选中的 ${selectedJournalIds.size} 篇日记吗？此操作不可恢复。`)) {
                const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
                if (!chat) return;

                chat.memoryJournals = chat.memoryJournals.filter(j => !selectedJournalIds.has(j.id));
                await saveData();
                toggleMultiSelectMode(false);
                renderJournalList();
                showToast('已批量删除');
            }
        });
    }
    
    if (journalBatchExportBtn) {
        journalBatchExportBtn.addEventListener('click', () => {
            if (selectedJournalIds.size === 0) return;
            exportSelectedJournals(Array.from(selectedJournalIds));
            toggleMultiSelectMode(false);
        });
    }

    if (mergeBtn) {
        mergeBtn.addEventListener('click', async () => {
            if (selectedJournalIds.size < 2) {
                showToast('请至少选择 2 篇日记进行合并');
                return;
            }
            await mergeJournals(Array.from(selectedJournalIds));
        });
    }

    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            toggleSelectAll();
        });
    }

    function toggleMultiSelectMode(active) {
        isMultiSelectMode = active;
        selectedJournalIds.clear();
        updateSelectCount();

        const container = document.getElementById('journal-list-container');
        const cards = container.querySelectorAll('.journal-card');
        
        if (active) {
            manageBtn.style.display = 'none';
            cancelManageBtn.style.display = 'flex';
            multiSelectBar.style.display = 'flex';
            generateNewJournalBtn.style.display = 'none'; // 隐藏生成按钮避免干扰
            if (bindWorldBookBtn) bindWorldBookBtn.style.display = 'none';
            
            cards.forEach(card => {
                card.classList.add('select-mode');
            });
        } else {
            manageBtn.style.display = 'flex';
            cancelManageBtn.style.display = 'none';
            multiSelectBar.style.display = 'none';
            generateNewJournalBtn.style.display = 'flex';
            if (bindWorldBookBtn && currentChatType === 'private') bindWorldBookBtn.style.display = 'flex';

            cards.forEach(card => {
                card.classList.remove('select-mode');
                const checkbox = card.querySelector('.journal-checkbox');
                if (checkbox) checkbox.classList.remove('checked');
            });
            
            // 退出多选模式时重置全选按钮
            if (selectAllBtn) selectAllBtn.textContent = '全选';
        }
    }

    function updateSelectCount() {
        if (selectCountSpan) {
            selectCountSpan.textContent = `已选 ${selectedJournalIds.size} 篇`;
        }
        
        // 更新全选按钮文字
        if (selectAllBtn) {
            const chat = (currentChatType === 'private') 
                ? db.characters.find(c => c.id === currentChatId) 
                : db.groups.find(g => g.id === currentChatId);
            
            if (chat && chat.memoryJournals) {
                const totalCount = chat.memoryJournals.length;
                const isAllSelected = selectedJournalIds.size === totalCount && totalCount > 0;
                selectAllBtn.textContent = isAllSelected ? '取消全选' : '全选';
            }
        }
    }

    function toggleSelectAll() {
        const chat = (currentChatType === 'private') 
            ? db.characters.find(c => c.id === currentChatId) 
            : db.groups.find(g => g.id === currentChatId);
        
        if (!chat || !chat.memoryJournals) return;
        
        const allJournalIds = chat.memoryJournals.map(j => j.id);
        const isAllSelected = allJournalIds.every(id => selectedJournalIds.has(id));
        
        if (isAllSelected) {
            // 取消全选
            selectedJournalIds.clear();
            document.querySelectorAll('.journal-checkbox').forEach(checkbox => {
                checkbox.classList.remove('checked');
            });
        } else {
            // 全选
            allJournalIds.forEach(id => selectedJournalIds.add(id));
            document.querySelectorAll('.journal-checkbox').forEach(checkbox => {
                checkbox.classList.add('checked');
            });
        }
        
        updateSelectCount();
    }
    
    // --- 导出所有日记 ---
    function exportAllJournals() {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (!chat || !chat.memoryJournals || chat.memoryJournals.length === 0) {
            showToast('当前没有可导出的日记');
            return;
        }
        downloadJournalsJson(chat.memoryJournals, `${chat.name || chat.remarkName || '未知角色'}_日记导出`);
    }
    
    // --- 导出选中的日记 ---
    function exportSelectedJournals(ids) {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (!chat || !chat.memoryJournals) return;
        
        const selectedJournals = chat.memoryJournals.filter(j => ids.includes(j.id));
        if (selectedJournals.length === 0) {
             showToast('未选择要导出的日记');
             return;
        }
        downloadJournalsJson(selectedJournals, `${chat.name || chat.remarkName || '未知角色'}_选定日记导出`);
    }
    
    // --- 下载 JSON 工具函数 ---
    async function downloadJournalsJson(journalsData, defaultFilename) {
        try {
            const dataStr = JSON.stringify(journalsData, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            await OvoFileDownload.save(blob, `${defaultFilename}_${new Date().getTime()}.json`);

        } catch (e) {
            console.error('导出日记失败:', e);
            showToast('导出日记失败');
        }
    }
    
    // --- 导入日记逻辑 ---
    function importJournals(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (!Array.isArray(importedData)) {
                    throw new Error("格式错误，请确保导入的是包含日记数组的 JSON 文件。");
                }
                
                const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
                if (!chat) return;
                if (!chat.memoryJournals) {
                    chat.memoryJournals = [];
                }
                
                let count = 0;
                // 为了避免 ID 冲突，给导入的日记重新生成 ID，并确保格式正确
                importedData.forEach(item => {
                    if (item.title && item.content) {
                        const newJournal = {
                            id: `journal_imp_${Date.now()}_${Math.random().toString(36).substring(2,9)}`,
                            range: item.range || { start: 0, end: 0 },
                            title: item.title,
                            content: item.content,
                            createdAt: item.createdAt || Date.now(),
                            chatId: currentChatId,
                            chatType: currentChatType,
                            isFavorited: !!item.isFavorited
                        };
                        if (item.isNodeSummary) {
                            newJournal.isNodeSummary = true;
                            newJournal.nodeId = item.nodeId || `node_imp_${Date.now()}`;
                        }
                        chat.memoryJournals.push(newJournal);
                        count++;
                    }
                });
                
                if (count > 0) {
                    await saveData();
                    renderJournalList();
                    showToast(`成功导入 ${count} 篇日记`);
                } else {
                    showToast('未在文件中找到有效的日记数据');
                }
            } catch (err) {
                console.error('解析日记文件失败:', err);
                showToast('导入失败：文件格式不正确');
            }
        };
        reader.readAsText(file);
    }

    async function mergeJournals(journalIds) {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (!chat) return;

        // 1. 获取选中的日记对象并排序
        const selectedJournals = chat.memoryJournals
            .filter(j => journalIds.includes(j.id))
            .sort((a, b) => a.range.start - b.range.start); // 按消息范围起始排序

        if (selectedJournals.length === 0) return;

        // 2. 计算合并后的范围
        const mergedStart = selectedJournals[0].range.start;
        const mergedEnd = selectedJournals[selectedJournals.length - 1].range.end;

        // 3. 拼接内容
        const combinedContent = selectedJournals.map(j => `【${j.title}】\n${j.content}`).join('\n\n---\n\n');

        // 4. 构建 Prompt
        let summaryPrompt = `你是一个专业的档案记录员。请将以下多篇日记合并整理成一篇连贯、精简的“回忆录”。\n\n`;

        summaryPrompt += `【核心要求】\n`;
        summaryPrompt += `1. **体现时间进程**：正文内容必须按时间顺序组织，并明确指出时间点。**格式规范：**请严格按照“x年x月x日，发生了[事件]”的格式进行叙述，确保时间线清晰。\n`;
        summaryPrompt += `2. **客观平实**：使用第三人称视角，客观陈述事实。**绝对禁止使用强烈的情绪词汇**（如“极度愤怒”、“痛彻心扉”、“欣喜若狂”等），保持冷静、克制的叙述风格。\n`;
        summaryPrompt += `3. **抓取重点**：识别对话中的核心事件、重要话题转折、关键决策或信息。忽略无关的闲聊和琐碎细节。\n`;
        summaryPrompt += `4. **关键原话摘录（重要）**：\n`;
        summaryPrompt += `    - 仅当出现具有**极高情感价值**（如表白、郑重承诺、极具感染力的情感宣泄）或**重大剧情价值**（如揭示核心秘密、决定性瞬间）的对话时，请**直接引用角色的原话**。\n`;
        summaryPrompt += `    - **引用格式**：使用引号包裹原话，例如：${chat.realName}说：“我永远不会离开你。”\n`;
        summaryPrompt += `    - **严格控制数量**：只摘录最闪光、最不可替代的那几句。如果聊天记录平淡无奇或全是日常琐事，**请不要摘录任何原话**，以免破坏摘要的精简性。\n`;
        summaryPrompt += `5. **无升华**：不要进行价值升华、感悟或总结性评价，仅记录发生了什么。\n\n`;

        summaryPrompt += `请严格使用以下 XML 标签格式输出你的结果，不要输出任何其他多余的解释：\n`;
        summaryPrompt += `<journal>\n`;
        summaryPrompt += `    <title>一个概括性的标题，例如“1月上旬·关于旅行的筹备与出发”</title>\n`;
        summaryPrompt += `    <content>合并后的正文内容</content>\n`;
        summaryPrompt += `</journal>\n\n`;
        summaryPrompt += `待合并的日记内容如下：\n\n${combinedContent}`;

        showToast('正在合并精简，请稍候...');
        
        // 退出多选模式并显示加载状态
        toggleMultiSelectMode(false);
        
        // 显示列表占位卡片
        const container = document.getElementById('journal-list-container');
        const loadingCard = document.createElement('li');
        loadingCard.className = 'journal-card generating';
        loadingCard.id = 'journal-generating-card';
        loadingCard.innerHTML = `
            <div class="spinner"></div>
            <div class="text">正在合并回忆...</div>
        `;
        if (container.firstChild) {
            container.insertBefore(loadingCard, container.firstChild);
        } else {
            container.appendChild(loadingCard);
        }
        container.scrollTop = 0;

        isGenerating = true;
        generatingChatId = currentChatId;

        try {
            let apiConfig = db.summaryApiSettings
                && db.summaryApiSettings.url
                && db.summaryApiSettings.key
                && db.summaryApiSettings.model
                ? db.summaryApiSettings
                : db.apiSettings;
            apiConfig = typeof getApiConfigForFeature === 'function' ? getApiConfigForFeature('journal', apiConfig, chat) : apiConfig;
            const rawContent = await requestJournalSummary(apiConfig, summaryPrompt);
            const journalData = parseJournalResponse(rawContent);

            const newJournal = {
                id: `journal_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                range: { start: mergedStart, end: mergedEnd },
                title: journalData.title,
                content: journalData.content,
                createdAt: Date.now(),
                chatId: currentChatId,
                chatType: currentChatType,
                isFavorited: false 
            };

            if (!chat.memoryJournals) {
                chat.memoryJournals = [];
            }
            chat.memoryJournals.push(newJournal);
            await saveData();

            renderJournalList();
            showToast('日记合并完成！');

        } catch (error) {
            const card = document.getElementById('journal-generating-card');
            if(card) card.remove();
            showApiError(error);
        } finally {
            isGenerating = false;
            generatingChatId = null;
        }
    }

    bindWorldBookBtn.addEventListener('click', () => {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (!chat) return;

        // 仅私聊支持新风格设置
        if (currentChatType === 'private') {
            // 智能迁移
            const migrationMsg = migrateJournalSettings(chat);
            if (migrationMsg) {
                showToast(migrationMsg);
            }

            // 设置 Radio 状态
            const currentMode = chat.journalStyleSettings.mode || 'default';
            const radio = document.querySelector(`input[name="journal-style-mode"][value="${currentMode}"]`);
            if (radio) radio.checked = true;

            // 显示/隐藏自定义列表
            customStyleContainer.style.display = (currentMode === 'custom') ? 'flex' : 'none';

            // 渲染世界书列表 (总是渲染，以便切换时可用)
            renderCategorizedWorldBookList(journalStyleWorldBookList, db.worldBooks, chat.journalStyleSettings.customWorldBookIds || [], 'journal-style-wb-select');
            
            journalStyleModal.classList.add('visible');
        } else {
            showToast('群聊暂不支持自定义风格设置');
        }
    });

    // Radio 切换事件
    journalStyleRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            customStyleContainer.style.display = (e.target.value === 'custom') ? 'flex' : 'none';
        });
    });

    // 保存按钮点击事件
    saveJournalStyleBtn.addEventListener('click', async () => {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : null;
        if (!chat) return;

        const selectedMode = document.querySelector('input[name="journal-style-mode"]:checked').value;
        const selectedIds = Array.from(journalStyleWorldBookList.querySelectorAll('.item-checkbox:checked')).map(input => input.value);

        chat.journalStyleSettings = {
            mode: selectedMode,
            customWorldBookIds: selectedIds
        };
        
        // 同步更新旧字段以保持潜在的向后兼容性
        chat.journalWorldBookIds = selectedIds;

        await saveData();
        journalStyleModal.classList.remove('visible');
        showToast('日记风格设置已保存');
    });

    generateNewJournalBtn.addEventListener('click', () => {
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        const totalMessages = chat ? chat.history.length : 0;
        
        const rangeInfo = document.getElementById('journal-range-info');
        rangeInfo.textContent = `当前聊天总消息数: ${totalMessages}`;

        const modalTitle = document.querySelector('#generate-journal-modal h3');
        if (modalTitle) {
            modalTitle.textContent = (currentChatType === 'group') ? '生成群聊总结' : '指定总结范围';
        }

        generateJournalForm.reset();
        if (chat && includeFavoritedCheckboxEl) {
            ensureAutoJournalState(chat);
            includeFavoritedCheckboxEl.checked = !!chat.journalIncludeFavorited;
        }
        generateJournalModal.classList.add('visible');
    });

    generateJournalForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const startInput = document.getElementById('journal-range-start');
        const endInput = document.getElementById('journal-range-end');
        const includeFavoritedCheckbox = document.getElementById('journal-include-favorited');

        const start = parseInt(startInput.value);
        const end = parseInt(endInput.value);
        const includeFavorited = includeFavoritedCheckbox.checked;
        
        if (isNaN(start) || isNaN(end) || start <= 0 || end < start) {
            showToast('请输入有效的起止范围');
            return;
        }

        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (chat) {
            ensureAutoJournalState(chat);
            chat.journalIncludeFavorited = includeFavorited;
            await saveData();
        }

        generateJournalModal.classList.remove('visible');
        await generateJournal(start, end, includeFavorited);
    });

    journalListContainer.addEventListener('click', async (e) => {
        const target = e.target;
        const card = target.closest('.journal-card');
        if (!card) return;

        const journalId = card.dataset.id;
        
        // 多选模式逻辑
        if (isMultiSelectMode) {
            if (selectedJournalIds.has(journalId)) {
                selectedJournalIds.delete(journalId);
                card.querySelector('.journal-checkbox').classList.remove('checked');
            } else {
                selectedJournalIds.add(journalId);
                card.querySelector('.journal-checkbox').classList.add('checked');
            }
            updateSelectCount();
            return; // 阻止进入详情页
        }

        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (!chat) return;
        const journal = chat.memoryJournals.find(j => j.id === journalId);
        if (!journal) return;

        if (target.closest('.delete-journal-btn')) {
            if (confirm('确定要删除这篇日记吗？')) {
                chat.memoryJournals = chat.memoryJournals.filter(j => j.id !== journalId);
                await saveData();
                renderJournalList();
                showToast('日记已删除');
            }
            return;
        }

        if (target.closest('.favorite-journal-btn')) {
            journal.isFavorited = !journal.isFavorited;
            await saveData();
            target.closest('.favorite-journal-btn').classList.toggle('favorited', journal.isFavorited);
            showToast(journal.isFavorited ? '已收藏' : '已取消收藏');
            renderJournalList();
            return;
        }
        
        const date = new Date(journal.createdAt);
        const formattedDate = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
        
        currentJournalDetailId = journal.id;

        const titleEl = document.getElementById('journal-detail-title');
        const contentEl = document.getElementById('journal-detail-content');

        titleEl.isContentEditable = false;
        contentEl.isContentEditable = false;
        titleEl.style.border = 'none';
        contentEl.style.border = 'none';
        titleEl.style.padding = '0';
        contentEl.style.padding = '0';
        editDetailBtn.style.display = '';
        saveDetailBtn.style.display = 'none';

        titleEl.innerHTML = journal.bilingualAuthored !== false && !journal.isNodeSummary && currentChatType === 'private'
            ? BilingualContent.html(journal.title, chat, 'journal', 'journal') : escapeJournalHtml(journal.title);
        document.getElementById('journal-detail-meta').textContent = `创建于 ${formattedDate} | 消息范围: ${journal.range.start}-${journal.range.end}`;
        contentEl.innerHTML = journal.bilingualAuthored !== false && !journal.isNodeSummary && currentChatType === 'private'
            ? BilingualContent.html(journal.content, chat, 'journal', 'journal')
            : escapeJournalHtml(journal.content).replace(/\n/g, '<br>');
        
        switchScreen('memory-journal-detail-screen');
    });

    editDetailBtn.addEventListener('click', () => {
        if (!currentJournalDetailId) return;

        const titleEl = document.getElementById('journal-detail-title');
        const contentEl = document.getElementById('journal-detail-content');
        const chat = currentChatType === 'private' ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        const journal = chat?.memoryJournals?.find(item => item.id === currentJournalDetailId);
        if (journal) { titleEl.textContent = journal.title; contentEl.textContent = journal.content; }

        titleEl.setAttribute('contenteditable', 'true');
        contentEl.setAttribute('contenteditable', 'true');
        titleEl.style.border = '1px dashed #ccc';
        titleEl.style.padding = '5px';
        contentEl.style.border = '1px dashed #ccc';
        contentEl.style.padding = '10px';
        editDetailBtn.style.display = 'none';
        saveDetailBtn.style.display = '';
        titleEl.focus();
    });

    saveDetailBtn.addEventListener('click', async () => {
        if (!currentJournalDetailId) return;

        const titleEl = document.getElementById('journal-detail-title');
        const contentEl = document.getElementById('journal-detail-content');

        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (!chat) return;
        const journal = chat.memoryJournals.find(j => j.id === currentJournalDetailId);
        if (!journal) return;

        journal.title = titleEl.textContent.trim();
        journal.content = contentEl.textContent.trim();
        await saveData();

        titleEl.isContentEditable = false;
        contentEl.isContentEditable = false;
        titleEl.style.border = 'none';
        contentEl.style.border = 'none';
        titleEl.style.padding = '0';
        contentEl.style.padding = '0';
        saveDetailBtn.style.display = 'none';
        editDetailBtn.style.display = '';
        showToast('日记已保存');
        renderJournalList();
    });
}
