// --- 回忆日记功能 (js/modules/journal.js) ---

let generatingChatId = null;

function setupMemoryJournalScreen() {
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
    function downloadJournalsJson(journalsData, defaultFilename) {
        try {
            const dataStr = JSON.stringify(journalsData, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${defaultFilename}_${new Date().getTime()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast(`成功导出 ${journalsData.length} 篇日记`);
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
            let { url, key, model } = db.apiSettings;
            if (!url || !key || !model) {
                throw new Error("API设置不完整。");
            }

            if (url.endsWith('/')) {
                url = url.slice(0, -1);
            }

            const requestBody = {
                model: model,
                messages: [{ role: 'user', content: summaryPrompt }],
                temperature: 0.7
            };
            const endpoint = `${url}/v1/chat/completions`;
            const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };

            const rawContent = await fetchAiResponse(db.apiSettings, requestBody, headers, endpoint);

            const titleMatch = rawContent.match(/<title>([\s\S]*?)<\/title>/i);
            const contentMatch = rawContent.match(/<content>([\s\S]*?)<\/content>/i);

            const journalData = {
                title: titleMatch ? titleMatch[1].trim() : "合并日记",
                content: contentMatch ? contentMatch[1].trim() : "内容提取失败。"
            };

            const newJournal = {
                id: `journal_${Date.now()}`,
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

        titleEl.textContent = journal.title;
        document.getElementById('journal-detail-meta').textContent = `创建于 ${formattedDate} | 消息范围: ${journal.range.start}-${journal.range.end}`;
        document.getElementById('journal-detail-content').textContent = journal.content;
        
        switchScreen('memory-journal-detail-screen');
    });

    editDetailBtn.addEventListener('click', () => {
        if (!currentJournalDetailId) return;

        const titleEl = document.getElementById('journal-detail-title');
        const contentEl = document.getElementById('journal-detail-content');

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

function renderJournalList(searchQuery = '') {
    const container = document.getElementById('journal-list-container');
    const placeholder = document.getElementById('no-journals-placeholder');
    container.innerHTML = '';

    const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    let journals = chat ? chat.memoryJournals : [];

    if (searchQuery && journals) {
        const lowerQuery = searchQuery.toLowerCase();
        journals = journals.filter(j => j.title && j.title.toLowerCase().includes(lowerQuery));
    }

    // 更新标题和按钮显示
    const bindBtn = document.getElementById('bind-journal-worldbook-btn');
    const title = document.querySelector('#memory-journal-screen .title');
    
    if (currentChatType === 'group') {
        if (bindBtn) bindBtn.style.display = 'none';
        if (title) title.textContent = '智能总结';
        if (placeholder) {
            placeholder.innerHTML = '<p>还没有总结哦~</p><p>点击右上角的“+号”来生成第一篇吧！</p>';
        }
    } else {
        if (bindBtn) bindBtn.style.display = 'flex';
        if (title) title.textContent = '回忆日记';
        if (placeholder) {
            placeholder.innerHTML = '<p>还没有日记哦~</p><p>点击右上角的“+号”来创建第一篇吧！</p>';
        }
    }

    let isShowingLoading = false;
    // 恢复生成状态卡片
    if (typeof isGenerating !== 'undefined' && isGenerating && generatingChatId === currentChatId) {
        const loadingCard = document.createElement('li');
        loadingCard.className = 'journal-card generating';
        loadingCard.id = 'journal-generating-card';
        loadingCard.innerHTML = `
            <div class="spinner"></div>
            <div class="text">正在${currentChatType === 'group' ? '总结群聊' : '编织回忆'}...</div>
        `;
        container.appendChild(loadingCard);
        isShowingLoading = true;
    }

    if ((!journals || journals.length === 0) && !isShowingLoading) {
        if (placeholder) placeholder.style.display = 'block';
        return;
    }

    if (placeholder) placeholder.style.display = 'none';

    const chatInstance = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
    const favoriteTop = chatInstance ? (chatInstance.journalFavoriteTop !== false) : true; // 默认开启

    const sortedJournals = [...journals].sort((a, b) => {
        if (favoriteTop) {
            if (a.isFavorited && !b.isFavorited) return -1;
            if (!a.isFavorited && b.isFavorited) return 1;
        }
        return a.createdAt - b.createdAt;
    });

    sortedJournals.forEach(journal => {
        const card = document.createElement('li');
        card.className = 'journal-card';
        card.dataset.id = journal.id;

        const date = new Date(journal.createdAt);
        const formattedDate = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

        let nodeTagHtml = '';
        if (journal.isNodeSummary) {
            nodeTagHtml = `<span style="font-size: 10px; background: rgba(0,0,0,0.05); padding: 2px 6px; border-radius: 4px; color: #888; margin-left: 8px;">节点总结</span>`;
        }

        card.innerHTML = `
            <div class="journal-checkbox"></div>
            <div class="journal-card-header">
                <div class="journal-card-title">${journal.title}</div>
            </div>
            <div class="journal-card-actions">
                <button class="action-icon-btn favorite-journal-btn" title="收藏">
                    <svg viewBox="0 0 24 24">
                        <path class="star-outline" d="M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z" fill="currentColor"/>
                        <path class="star-solid" d="M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z"/>
                    </svg>
                </button>
                <button class="action-icon-btn delete-journal-btn" title="删除">
                    <svg viewBox="0 0 24 24"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" /></svg>
                </button>
            </div>
            <div class="journal-card-footer" style="justify-content: space-between; height: auto; opacity: 1; margin-top: 10px; align-items: center;">
                <span class="journal-card-date">${formattedDate}${nodeTagHtml}</span>
                <span class="journal-card-range">范围: ${journal.range ? `${journal.range.start}-${journal.range.end}` : '节点'}</span>
            </div>
        `;

        if (journal.isFavorited) {
            card.querySelector('.favorite-journal-btn').classList.add('favorited');
        }

        container.appendChild(card);
    });
}

async function generateJournal(start, end, includeFavorited = false, silent = false, nodeInfo = null) {
    if (!silent) {
        showToast('正在生成日记，请稍候...');
    }

    // 显示列表占位卡片
    const container = document.getElementById('journal-list-container');
    const placeholder = document.getElementById('no-journals-placeholder');
    if (placeholder) placeholder.style.display = 'none';

    const loadingCard = document.createElement('li');
    loadingCard.className = 'journal-card generating';
    loadingCard.id = 'journal-generating-card';
    loadingCard.innerHTML = `
        <div class="spinner"></div>
        <div class="text">正在${currentChatType === 'group' ? '总结群聊' : '编织回忆'}...</div>
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
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (!chat) {
            throw new Error("未找到当前聊天。");
        }

        const startIndex = start - 1;
        const endIndex = end;
        
        if (startIndex < 0 || endIndex > chat.history.length || startIndex >= endIndex) {
            throw new Error("无效的消息范围。");
        }

        // ...
        let messagesToSummarize = chat.history.slice(startIndex, endIndex);
        
        // 1. 保持原样：第三个参数设为 true，确保你想要的“高权重”隐藏消息能被读进来
        messagesToSummarize = filterHistoryForAI(chat, messagesToSummarize, true);

        // 2. 【新增】精准剔除 thinking 消息
        // 你的 chat_ai.js 中生成的思考消息带有 isThinking: true 属性
        // 即使它们包含在上下文里，我们也在生成日记前把它们扔掉
        messagesToSummarize = messagesToSummarize.filter(m => !m.isThinking);

        // 3. 【可选保险】防止只有标签没有属性的情况（针对旧历史记录）
        // 如果你担心以前的历史记录里有 thinking 标签但没有 isThinking 属性，可以加一步正则清洗
        messagesToSummarize.forEach(m => {
            if (m.content && typeof m.content === 'string') {
               m.content = m.content.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
            }
        });

        let worldBooksContent = '';
        let summaryPrompt = '';
        let favoritedJournalsPrompt = '';

        // 新增：读取已收藏的日记 (通用逻辑)
        if (includeFavorited) {
            const favoritedJournals = (chat.memoryJournals || [])
                .filter(j => j.isFavorited)
                .map(j => `标题：${j.title}\n内容：${j.content}`)
                .join('\n\n---\n\n');
            
            if (favoritedJournals) {
                favoritedJournalsPrompt = `【过往回顾】\n这是你之前已经写下的内容，请参考它们，以确保新内容的连续性，并避免重复记录已经记录过的事件。\n\n${favoritedJournals}\n\n`;
            }
        }

        if (currentChatType === 'group') {
            // 群聊逻辑
            // 收集关联的 + 全局的世界书（去重）
            const associatedIds = chat.worldBookIds || [];
            const globalBooks = db.worldBooks.filter(wb => wb.isGlobal && !wb.disabled);
            const globalIds = globalBooks.map(wb => wb.id);
            const allBookIds = [...new Set([...associatedIds, ...globalIds])];
            const groupWorldBooks = allBookIds.map(id => db.worldBooks.find(wb => wb.id === id)).filter(wb => wb && !wb.disabled);
            worldBooksContent = groupWorldBooks.map(wb => wb.content).join('\n\n');

            summaryPrompt = `你是一个群聊记录总结助手。请以完全客观的第三视角，对以下群聊记录进行精简总结。\n\n`;
            
            if (favoritedJournalsPrompt) {
                summaryPrompt += favoritedJournalsPrompt;
            }

            // 注入群聊基础信息
            summaryPrompt += `群聊名称: ${chat.name}\n`;
            summaryPrompt += `群成员列表: ${chat.members.map(m => `${m.groupNickname}(${m.realName})`).join(', ')}\n\n`;

            // 注入群聊关联的世界书
            if (worldBooksContent) {
                summaryPrompt += `背景设定参考:\n${worldBooksContent}\n\n`;
            }

            summaryPrompt += `总结要求：\n`;
            summaryPrompt += `1. **客观中立**：使用第三人称视角，不带个人情感色彩，不使用强烈的情绪词汇。\n`;
            summaryPrompt += `2. **精简准确**：只陈述事实，概括主要话题和事件，去除无关的闲聊细节。\n`;
            summaryPrompt += `3. **无升华**：不要进行价值升华、感悟或总结性评价，仅记录发生了什么。\n\n`;

            summaryPrompt += `请严格使用以下 XML 标签格式输出你的结果，不要输出任何其他多余的解释：\n`;
            summaryPrompt += `<journal>\n`;
            summaryPrompt += `    <title>格式为“日期·核心事件”，例如“1月20日·讨论周末计划”</title>\n`;
            summaryPrompt += `    <content>总结正文。分条列出主要讨论点或事件。</content>\n`;
            summaryPrompt += `</journal>\n\n`;
            summaryPrompt += `聊天记录如下：\n\n---\n${(() => {
                let lastTime = 0;
                return messagesToSummarize.map(m => {
                    let prefix = '';
                    const currentTime = m.timestamp;
                    const timeDiff = currentTime - lastTime;
                    const isSameDay = new Date(currentTime).toDateString() === new Date(lastTime).toDateString();
                    
                    if (lastTime === 0 || timeDiff > 20 * 60 * 1000 || !isSameDay) {
                        const d = new Date(currentTime);
                        const timeStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                        prefix = `\n[系统时间: ${timeStr}]\n`;
                    }
                    lastTime = currentTime;
                    return `${prefix}${m.content}`;
                }).join('\n');
            })()}\n---`;

        } else {
            // 私聊逻辑
            // 0. 确保迁移
            migrateJournalSettings(chat);

            // 1. 自动获取通用世界书 (Context) + 全局世界书
            let isOfflineNode = false;
            if (chat.activeNodeId && chat.nodes) {
                const activeNode = chat.nodes.find(n => n.id === chat.activeNodeId);
                if (activeNode) {
                    let baseMode = (activeNode.customConfig && activeNode.customConfig.baseMode) ? activeNode.customConfig.baseMode : 
                                   (activeNode.type === 'offline' || (activeNode.type === 'spinoff' && activeNode.spinoffMode === 'offline') ? 'offline' : 'online');
                    if (baseMode === 'offline') {
                        isOfflineNode = true;
                    }
                }
            }
            let associatedIds = chat.worldBookIds || [];
            if (isOfflineNode) {
                associatedIds = (chat.offlineWorldBookIds && chat.offlineWorldBookIds.length > 0) ? chat.offlineWorldBookIds : (chat.worldBookIds || []);
            }
            const globalBooks = db.worldBooks.filter(wb => wb.isGlobal && !wb.disabled);
            const globalIds = globalBooks.map(wb => wb.id);
            const allBookIds = [...new Set([...associatedIds, ...globalIds])];
            const commonWorldBooks = allBookIds.map(id => db.worldBooks.find(wb => wb.id === id)).filter(wb => wb && !wb.disabled);
            worldBooksContent = commonWorldBooks.map(wb => wb.content).join('\n\n');

            // 2. 获取风格设置
            const styleSettings = chat.journalStyleSettings || { mode: 'default', customWorldBookIds: [] };
            
            // 3. 构建 Prompt
            if (styleSettings.mode === 'summary') {
                // 摘要总结风格
                summaryPrompt = `你是一个专业的对话记录总结助手。请根据提供的聊天记录，生成一份精简的摘要总结。\n\n`;
                
                if (favoritedJournalsPrompt) {
                    summaryPrompt += favoritedJournalsPrompt;
                }

                summaryPrompt += `要求：
1. **体现时间进程**：正文内容必须按时间顺序组织，并明确指出时间点。**格式规范：**请严格按照“x年x月x日，发生了[事件]”的格式进行叙述，确保时间线清晰。
2. **客观平实**：使用第三人称视角，客观陈述事实。**绝对禁止使用强烈的情绪词汇**（如“极度愤怒”、“痛彻心扉”、“欣喜若狂”等），保持冷静、克制的叙述风格。
3. **抓取重点**：识别对话中的核心事件、重要话题转折、关键决策或信息。忽略无关的闲聊和琐碎细节。
4. **关键原话摘录（重要）**：
    - 仅当出现具有**极高情感价值**（如表白、郑重承诺、极具感染力的情感宣泄）或**重大剧情价值**（如揭示核心秘密、决定性瞬间）的对话时，请**直接引用角色的原话**。
    - **引用格式**：使用引号包裹原话，例如：${chat.realName}说：“我永远不会离开你。”
    - **严格控制数量**：只摘录最闪光、最不可替代的那几句。如果聊天记录平淡无奇或全是日常琐事，**请不要摘录任何原话**，以免破坏摘要的精简性。
5. **无升华**：不要进行价值升华、感悟或总结性评价，仅记录发生了什么。

请严格使用以下 XML 标签格式输出你的结果，不要输出任何其他多余的解释：
<journal>
    <title>格式为“日期范围·核心事件”，例如“1月20日-1月22日·关于旅行计划的讨论”</title>
    <content>总结正文</content>
</journal>

聊天记录如下：\n\n---\n${(() => {
                let lastTime = 0;
                return messagesToSummarize.map(m => {
                    let prefix = '';
                    const currentTime = m.timestamp;
                    const timeDiff = currentTime - lastTime;
                    const isSameDay = new Date(currentTime).toDateString() === new Date(lastTime).toDateString();
                    
                    if (lastTime === 0 || timeDiff > 20 * 60 * 1000 || !isSameDay) {
                        const d = new Date(currentTime);
                        const timeStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                        prefix = `\n[系统时间: ${timeStr}]\n`;
                    }
                    lastTime = currentTime;
                    return `${prefix}${m.content}`;
                }).join('\n');
            })()}\n---`;

            } else {
                // 默认风格 (流水账) 或 自定义风格
                // 基础 Prompt (第一人称)
                summaryPrompt = `你是一个日记整理助手。请以角色 "${chat.remarkName || chat.name}" 的第一人称视角，总结以下聊天记录。请专注于重要的情绪、事件和细节。\n\n`;
                
                if (favoritedJournalsPrompt) {
                    summaryPrompt += favoritedJournalsPrompt;
                }

                summaryPrompt += "为了更好地理解角色和背景，请参考以下信息：\n";
                summaryPrompt += "=====\n";

                if (worldBooksContent) {
                    summaryPrompt += `世界观设定:\n${worldBooksContent}\n\n`;
                }

                summaryPrompt += `你的角色设定:\n- 角色名: ${chat.realName}\n- 人设: ${chat.persona || "一个友好、乐于助人的伙伴。"}\n\n`;
                summaryPrompt += `我的角色设定:\n- 我的称呼: ${chat.myName}\n- 我的人设: ${chat.myPersona || "无特定人设。"}\n\n`;
                summaryPrompt += "=====\n";

                // 如果是自定义风格，注入额外要求
                if (styleSettings.mode === 'custom') {
                    const customWorldBooks = (styleSettings.customWorldBookIds || []).map(id => db.worldBooks.find(wb => wb.id === id)).filter(wb => wb && !wb.disabled);
                    const customStyleContent = customWorldBooks.map(wb => wb.content).join('\n\n');
                    
                    if (customStyleContent) {
                        summaryPrompt += `\n**特别日记格式/风格要求**：\n请优先严格遵循以下风格指南或格式要求来撰写日记：\n${customStyleContent}\n\n`;
                    }
                }

                summaryPrompt += `请基于以上所有背景信息，总结以下聊天记录。请严格使用以下 XML 标签格式输出你的结果，不要输出任何其他多余的解释：\n<journal>\n    <title>年月日·一个简洁的标题</title>\n    <content>完整的日记正文</content>\n</journal>\n\n聊天记录如下：\n\n---\n${(() => {
                let lastTime = 0;
                return messagesToSummarize.map(m => {
                    let prefix = '';
                    const currentTime = m.timestamp;
                    const timeDiff = currentTime - lastTime;
                    const isSameDay = new Date(currentTime).toDateString() === new Date(lastTime).toDateString();
                    
                    if (lastTime === 0 || timeDiff > 20 * 60 * 1000 || !isSameDay) {
                        const d = new Date(currentTime);
                        const timeStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                        prefix = `\n[系统时间: ${timeStr}]\n`;
                    }
                    lastTime = currentTime;
                    return `${prefix}${m.content}`;
                }).join('\n');
            })()}\n---`;
            }
        }

        // === 使用总结API（如果已配置）===
        let apiConfig;
        if (db.summaryApiSettings && db.summaryApiSettings.url && db.summaryApiSettings.key && db.summaryApiSettings.model) {
            apiConfig = db.summaryApiSettings;
        } else {
            apiConfig = db.apiSettings;
        }
        
        let { url, key, model, provider } = apiConfig;
        if (!url || !key || !model) {
            throw new Error("API设置不完整。");
        }

        if (url.endsWith('/')) {
            url = url.slice(0, -1);
        }

        const requestBody = {
            model: model,
            messages: [{ role: 'user', content: summaryPrompt }],
            temperature: 0.7
        };
        const endpoint = `${url}/v1/chat/completions`;
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };

        const rawContent = await fetchAiResponse(apiConfig, requestBody, headers, endpoint);

        const titleMatch = rawContent.match(/<title>([\s\S]*?)<\/title>/i);
        const contentMatch = rawContent.match(/<content>([\s\S]*?)<\/content>/i);

        const journalData = {
            title: titleMatch ? titleMatch[1].trim() : "无标题日记",
            content: contentMatch ? contentMatch[1].trim() : "内容提取失败。"
        };

        const newJournal = {
            id: `journal_${Date.now()}`,
            range: { start, end },
            title: journalData.title,
            content: journalData.content,
            createdAt: Date.now(),
            chatId: currentChatId,
            chatType: currentChatType,
            isFavorited: false 
        };

        // 如果是节点总结，附加节点信息
        if (nodeInfo && nodeInfo.isNodeSummary) {
            newJournal.isNodeSummary = true;
            newJournal.nodeId = nodeInfo.nodeId;
            if (nodeInfo.nodeName) {
                newJournal.title = `节点总结：${nodeInfo.nodeName}`;
            }
        }

        if (!chat.memoryJournals) {
            chat.memoryJournals = [];
        }

        // 如果是重新总结，查找并替换旧的总结
        if (nodeInfo && nodeInfo.isResummarize) {
            const existingIndex = chat.memoryJournals.findIndex(j => j.isNodeSummary && j.nodeId === nodeInfo.nodeId);
            if (existingIndex !== -1) {
                // 保留原有的 id 和 createdAt，只更新内容和标题
                chat.memoryJournals[existingIndex].content = newJournal.content;
                chat.memoryJournals[existingIndex].title = newJournal.title;
                chat.memoryJournals[existingIndex].range = newJournal.range;
            } else {
                chat.memoryJournals.push(newJournal);
            }
        } else {
            chat.memoryJournals.push(newJournal);
        }

        // 如果是节点总结，同时更新节点对象中的 summaryContent
        if (nodeInfo && nodeInfo.nodeId && chat.nodes) {
            const node = chat.nodes.find(n => n.id === nodeInfo.nodeId);
            if (node) {
                node.summaryContent = newJournal.content;
            }
        }

        await saveData();

        renderJournalList();
        
        // 如果是重新总结且在节点大厅，刷新列表
        if (nodeInfo && nodeInfo.isResummarize && document.getElementById('node-system-screen').classList.contains('active')) {
            if (typeof NodeSystem !== 'undefined' && typeof NodeSystem.renderArchiveList === 'function') {
                NodeSystem.renderArchiveList();
            }
        }

        showToast(silent ? `日记总结已生成 (第${start}-${end}条)` : '新日记已生成！');

    } catch (error) {
        // 移除生成卡片
        const card = document.getElementById('journal-generating-card');
        if(card) card.remove();
        
        // 如果列表为空，恢复显示 placeholder
        const chat = (currentChatType === 'private') ? db.characters.find(c => c.id === currentChatId) : db.groups.find(g => g.id === currentChatId);
        if (!chat || !chat.memoryJournals || chat.memoryJournals.length === 0) {
             const placeholder = document.getElementById('no-journals-placeholder');
             if (placeholder) placeholder.style.display = 'block';
        }

        showApiError(error);
    } finally {
        isGenerating = false; 
        generatingChatId = null;
    }
}

function migrateJournalSettings(chat) {
    if (!chat.journalStyleSettings) {
        const oldJournalIds = chat.journalWorldBookIds || [];
        let isOfflineNode = false;
        if (chat.activeNodeId && chat.nodes) {
            const activeNode = chat.nodes.find(n => n.id === chat.activeNodeId);
            if (activeNode) {
                let baseMode = (activeNode.customConfig && activeNode.customConfig.baseMode) ? activeNode.customConfig.baseMode : 
                               (activeNode.type === 'offline' || (activeNode.type === 'spinoff' && activeNode.spinoffMode === 'offline') ? 'offline' : 'online');
                if (baseMode === 'offline') {
                    isOfflineNode = true;
                }
            }
        }
        let chatCommonIds = chat.worldBookIds || [];
        if (isOfflineNode) {
            chatCommonIds = (chat.offlineWorldBookIds && chat.offlineWorldBookIds.length > 0) ? chat.offlineWorldBookIds : (chat.worldBookIds || []);
        }
        
        // 1. 剔除重复项 (在通用里已存在的)
        const uniqueCustomIds = oldJournalIds.filter(id => !chatCommonIds.includes(id));
        
        // 2. 决定模式
        let newMode = 'default';
        let migrationMsg = '';

        if (oldJournalIds.length > 0) {
            if (uniqueCustomIds.length === 0) {
                // 情况 A: 旧关联全是通用背景 -> 迁移到默认模式
                newMode = 'default';
                migrationMsg = '日记功能升级：已自动关联聊天室背景，您的旧设置已合并到“默认风格”。';
            } else {
                // 情况 B: 有额外的世界书 -> 迁移到自定义模式，保留额外项
                newMode = 'custom';
                migrationMsg = `日记功能升级：已自动关联聊天室背景，剩余 ${uniqueCustomIds.length} 个特殊设定已保留在“自定义风格”中。`;
            }
        } else {
            // 情况 C: 无旧关联 -> 默认
            newMode = 'default';
        }

        // 3. 应用设置
        chat.journalStyleSettings = { 
            mode: newMode, 
            customWorldBookIds: uniqueCustomIds 
        };
        
        return migrationMsg;
    }
    return null;
}

/**
 * 在 AI 回复完成后调用：若开启自动总结且达到间隔，则静默总结到最近一个完整区间（如 1-100），不包含超出部分。
 * @param {Object} chat - 当前聊天对象（character 或 group）
 */
async function checkAndTriggerAutoJournal(chat) {
    if (!chat || !chat.autoJournalEnabled) return;
    if (typeof isGenerating !== 'undefined' && isGenerating) return;

    const currentCount = (chat.history || []).length;
    const lastIndex = chat.lastAutoJournalIndex || 0;
    const interval = Math.max(10, parseInt(chat.autoJournalInterval, 10) || 100);
    const passedCount = currentCount - lastIndex;

    if (passedCount < interval) return;

    const completedIntervals = Math.floor(passedCount / interval);
    const endIndex = lastIndex + completedIntervals * interval;
    const startIndex = lastIndex + 1;

    const savedChatId = currentChatId;
    const savedChatType = currentChatType;
    currentChatId = chat.id;
    currentChatType = db.characters.some(c => c.id === chat.id) ? 'private' : 'group';

    try {
        await generateJournal(startIndex, endIndex, false, true);
        chat.lastAutoJournalIndex = endIndex;
        await saveData();
    } catch (err) {
        console.error('自动总结失败:', err);
        showApiError(err);
    } finally {
        currentChatId = savedChatId;
        currentChatType = savedChatType;
    }
}
