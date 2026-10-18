// --- 节点系统模块 (js/modules/node_system.js) ---

const NodeSystem = {
    init() {
        this.bindEvents();
        this.checkActiveNodeUI();
    },

    bindEvents() {
        // 1. 功能面板入口
        const entryBtn = document.getElementById('node-system-btn');
        if (entryBtn) {
            entryBtn.addEventListener('click', () => {
                if (currentChatType !== 'private') {
                    showToast('节点系统目前仅支持私聊');
                    return;
                }
                this.openEntryModal();
                // 关闭功能面板
                if (typeof showPanel === 'function') showPanel('none');
            });
        }

        // 2. 入口选择弹窗
        const entryModal = document.getElementById('node-system-entry-modal');
        if (entryModal) {
            document.getElementById('node-entry-open-btn').addEventListener('click', () => {
                const char = db.characters.find(c => c.id === currentChatId);
                if (char && char.activeNodeId) {
                    // 当前有活跃节点，点击则结束节点
                    entryModal.classList.remove('visible');
                    const node = char.nodes.find(n => n.id === char.activeNodeId);
                    if (node) {
                        document.getElementById('node-end-name').textContent = node.name;
                        const nameInput = document.getElementById('node-end-name-input');
                        if (nameInput) nameInput.value = node.name;
                        document.getElementById('node-end-modal').classList.add('visible');
                    }
                } else {
                    // 没有活跃节点，展开选项
                    const optionsDiv = document.getElementById('node-entry-options');
                    optionsDiv.style.display = optionsDiv.style.display === 'none' ? 'flex' : 'none';
                    this.renderCustomTemplatesInEntry();
                }
            });

            document.getElementById('node-entry-hall-btn').addEventListener('click', () => {
                entryModal.classList.remove('visible');
                this.openNodeHall();
            });

            document.getElementById('node-entry-close-btn').addEventListener('click', () => {
                entryModal.classList.remove('visible');
            });

            // 绑定选项点击
            const optionsDiv = document.getElementById('node-entry-options');
            optionsDiv.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                if (!btn) return;
                
                const type = btn.dataset.type;
                const tplId = btn.dataset.tplId;
                
                entryModal.classList.remove('visible');
                this.openConfigModal(type, tplId);
            });
        }

        // 3. 开启节点配置弹窗
        const configForm = document.getElementById('node-config-form');
        if (configForm) {
            document.getElementById('node-config-cancel-btn').addEventListener('click', () => {
                document.getElementById('node-config-modal').classList.remove('visible');
            });

            configForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.startNode();
            });
        }

        // 4. 结束节点弹窗
        const endModal = document.getElementById('node-end-modal');
        if (endModal) {
            document.getElementById('node-end-cancel-btn').addEventListener('click', () => {
                endModal.classList.remove('visible');
            });
            document.getElementById('node-end-archive-btn').addEventListener('click', () => this.endNode('archive'));
            document.getElementById('node-end-delete-btn').addEventListener('click', () => this.endNode('delete'));
            document.getElementById('node-end-summarize-btn').addEventListener('click', () => this.endNode('summarize'));
            const summarizeArchiveBtn = document.getElementById('node-end-summarize-archive-btn');
            if (summarizeArchiveBtn) {
                summarizeArchiveBtn.addEventListener('click', () => this.endNode('summarize_and_archive'));
            }
        }

        // 5. 节点大厅 Tabs
        const tabs = document.querySelectorAll('.node-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                tabs.forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                
                document.querySelectorAll('.node-tab-content').forEach(c => c.style.display = 'none');
                document.getElementById(`node-${e.target.dataset.tab}-list`).style.display = 'flex';

                const isTemplate = e.target.dataset.tab === 'template';
                document.getElementById('node-template-add-btn').style.display = isTemplate ? 'block' : 'none';
            });
        });

        // 6. 自定义模板管理
        const addTplBtn = document.getElementById('node-template-add-btn');
        if (addTplBtn) {
            addTplBtn.addEventListener('click', () => this.openTemplateEditModal());
        }

        // 6.1 模板导出
        const exportTplBtn = document.getElementById('node-template-export-btn');
        if (exportTplBtn) {
            exportTplBtn.addEventListener('click', () => this.exportTemplates());
        }

        // 6.2 模板导入
        const importTplBtn = document.getElementById('node-template-import-btn');
        if (importTplBtn) {
            importTplBtn.addEventListener('click', () => this.triggerImportTemplates());
        }

        // 6.3 导入确认弹窗
        const importCancelBtn = document.getElementById('node-import-cancel-btn');
        if (importCancelBtn) {
            importCancelBtn.addEventListener('click', () => {
                document.getElementById('node-import-modal').classList.remove('visible');
                this._pendingImportData = null;
            });
        }
        const importConfirmBtn = document.getElementById('node-import-confirm-btn');
        if (importConfirmBtn) {
            importConfirmBtn.addEventListener('click', () => this.confirmImportTemplates());
        }

        // 7. 节点设置
        const settingsBtn = document.getElementById('node-settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                const modal = document.getElementById('node-settings-modal');
                const input = document.getElementById('node-summary-text-input');
                input.value = db.nodeSummaryText || '摘要';
                const floorInput = document.getElementById('node-summary-floor-input');
                if (floorInput) floorInput.value = db.nodeSummaryFloor || 10;
                modal.classList.add('visible');
            });
        }

        const settingsCancelBtn = document.getElementById('node-settings-cancel-btn');
        if (settingsCancelBtn) {
            settingsCancelBtn.addEventListener('click', () => {
                document.getElementById('node-settings-modal').classList.remove('visible');
            });
        }

        const settingsSaveBtn = document.getElementById('node-settings-save-btn');
        if (settingsSaveBtn) {
            settingsSaveBtn.addEventListener('click', async () => {
                const input = document.getElementById('node-summary-text-input');
                db.nodeSummaryText = input.value.trim() || '摘要';
                const floorInput = document.getElementById('node-summary-floor-input');
                const floorVal = parseInt(floorInput ? floorInput.value : '', 10);
                db.nodeSummaryFloor = (floorVal > 0) ? floorVal : 10;
                await saveData();
                document.getElementById('node-settings-modal').classList.remove('visible');
                showToast('设置已保存');
                renderMessages(false, true);
            });
        }

        // 8. 重新总结
        const summarizeBtn = document.getElementById('node-record-summarize-btn');
        if (summarizeBtn) {
            summarizeBtn.addEventListener('click', () => {
                const nodeId = document.getElementById('node-record-message-area').dataset.nodeId;
                if (nodeId) {
                    this.resummarizeNode(nodeId);
                }
            });
        }

        // 9. 插入节点弹窗
        const insertForm = document.getElementById('node-insert-form');
        if (insertForm) {
            document.getElementById('node-insert-cancel-btn').addEventListener('click', () => {
                document.getElementById('node-insert-modal').classList.remove('visible');
            });

            // 监听类型切换，自动填充名称
            const typeSelect = document.getElementById('node-insert-type');
            const nameInput = document.getElementById('node-insert-name');
            typeSelect.addEventListener('change', () => {
                if (typeSelect.value === 'offline') nameInput.value = '线下';
                else if (typeSelect.value === 'spinoff') nameInput.value = '番外';
                else nameInput.value = '';
            });

            // 监听开始/结束切换，隐藏/显示类型选择
            const actionRadios = document.querySelectorAll('input[name="node-insert-action"]');
            const typeGroup = document.getElementById('node-insert-type-group');
            actionRadios.forEach(radio => {
                radio.addEventListener('change', () => {
                    if (radio.value === 'start') {
                        typeGroup.style.display = 'block';
                    } else {
                        typeGroup.style.display = 'none';
                    }
                });
            });

            insertForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.confirmInsertNode();
            });
        }

        const tplForm = document.getElementById('node-template-edit-form');
        if (tplForm) {
            document.getElementById('node-tpl-cancel-btn').addEventListener('click', () => {
                document.getElementById('node-template-edit-modal').classList.remove('visible');
            });
            tplForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveTemplate();
            });
        }

        // 监听聊天界面切换，更新悬浮按钮
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.target.id === 'chat-room-screen' && mutation.target.classList.contains('active')) {
                    this.checkActiveNodeUI();
                }
            });
        });
        const chatScreen = document.getElementById('chat-room-screen');
        if (chatScreen) {
            observer.observe(chatScreen, { attributes: true, attributeFilter: ['class'] });
        }
    },

    // --- UI 交互方法 ---

    openEntryModal() {
        const char = db.characters.find(c => c.id === currentChatId);
        if (!char) return;

        const openBtn = document.getElementById('node-entry-open-btn');
        const optionsDiv = document.getElementById('node-entry-options');
        
        if (char.activeNodeId) {
            openBtn.textContent = '结束当前节点';
            openBtn.classList.remove('btn-primary');
            openBtn.classList.add('btn-danger');
            optionsDiv.style.display = 'none';
        } else {
            openBtn.textContent = '开启节点';
            openBtn.classList.remove('btn-danger');
            openBtn.classList.add('btn-primary');
            optionsDiv.style.display = 'none';
        }

        document.getElementById('node-system-entry-modal').classList.add('visible');
    },

    renderCustomTemplatesInEntry() {
        const container = document.getElementById('node-entry-custom-list');
        container.innerHTML = '';
        
        if (!db.nodeTemplates || db.nodeTemplates.length === 0) {
            return;
        }

        db.nodeTemplates.forEach(tpl => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-secondary btn-small';
            btn.dataset.type = 'custom';
            btn.dataset.tplId = tpl.id;
            btn.textContent = tpl.title;
            container.appendChild(btn);
        });
    },

    openConfigModal(type, tplId = null) {
        const modal = document.getElementById('node-config-modal');
        const titleEl = document.getElementById('node-config-title');
        const nameInput = document.getElementById('node-config-name');
        const typeInput = document.getElementById('node-config-type');
        const tplIdInput = document.getElementById('node-config-template-id');
        const memoryGroup = document.getElementById('node-config-memory-group');
        const memoryHint = document.getElementById('node-config-memory-hint');
        const summaryCheck = document.getElementById('node-config-summary-enabled');
        const memoryCheck = document.getElementById('node-config-read-memory');
        const spinoffModeGroup = document.getElementById('node-config-spinoff-mode-group');
        const spinoffBgGroup = document.getElementById('node-config-spinoff-bg-group');
        const spinoffBgInput = document.getElementById('node-config-spinoff-bg');

        typeInput.value = type;
        tplIdInput.value = tplId || '';
        nameInput.value = '';
        summaryCheck.checked = true;
        memoryCheck.checked = false;
        if (spinoffModeGroup) spinoffModeGroup.style.display = 'none';
        if (spinoffBgGroup) spinoffBgGroup.style.display = 'none';
        if (spinoffBgInput) spinoffBgInput.value = '';

        const styleWbContainer = document.getElementById('node-config-style-wb-container');
        const styleWbDisplay = document.getElementById('node-config-style-wb-display');
        const styleWbDropdown = document.getElementById('node-config-style-wb-dropdown');
        const styleWbOptions = document.getElementById('node-config-style-wb-options');

        // 填充文风世界书选项
        if (styleWbOptions) {
            styleWbOptions.innerHTML = '';
            const worldBooks = db.worldBooks || [];
            if (worldBooks.length === 0) {
                styleWbOptions.innerHTML = '<div style="padding: 8px; color: #999; text-align: center;">暂无世界书</div>';
            } else {
                worldBooks.forEach(wb => {
                    const label = document.createElement('label');
                    label.className = 'theater-multiselect-option';
                    label.innerHTML = `
                        <input type="checkbox" value="${wb.id}">
                        <span>${DOMPurify.sanitize(wb.name)}</span>
                    `;
                    styleWbOptions.appendChild(label);
                });
            }
        }

        // 绑定下拉框展开/收起事件
        if (styleWbDisplay && !styleWbDisplay.dataset.bound) {
            styleWbDisplay.addEventListener('click', (e) => {
                e.stopPropagation();
                styleWbDropdown.classList.toggle('show');
            });
            document.addEventListener('click', (e) => {
                if (!e.target.closest('#node-config-style-wb-container')) {
                    if (styleWbDropdown) styleWbDropdown.classList.remove('show');
                }
            });
            styleWbDisplay.dataset.bound = 'true';
        }

        // 更新占位符文本
        const updateStyleWbPlaceholder = () => {
            if (!styleWbOptions || !styleWbDisplay) return;
            const checked = styleWbOptions.querySelectorAll('input[type="checkbox"]:checked');
            const placeholder = styleWbDisplay.querySelector('.theater-multiselect-placeholder');
            if (checked.length === 0) {
                placeholder.textContent = '请选择文风世界书（可选）';
                placeholder.style.color = '#999';
            } else {
                const names = Array.from(checked).map(cb => cb.nextElementSibling.textContent);
                placeholder.textContent = names.join(', ');
                placeholder.style.color = '#333';
            }
        };

        if (styleWbOptions && !styleWbOptions.dataset.bound) {
            styleWbOptions.addEventListener('change', updateStyleWbPlaceholder);
            styleWbOptions.dataset.bound = 'true';
        }

        // 监听番外模式切换，控制文风选择的显示
        const updateSpinoffStyleWbState = () => {
            if (type === 'spinoff') {
                const modeRadio = document.querySelector('input[name="node-spinoff-mode"]:checked');
                if (styleWbContainer) {
                    styleWbContainer.style.display = (modeRadio && modeRadio.value === 'offline') ? 'block' : 'none';
                }
            }
        };

        if (spinoffModeGroup) {
            const radios = spinoffModeGroup.querySelectorAll('input[name="node-spinoff-mode"]');
            radios.forEach(r => {
                r.removeEventListener('change', updateSpinoffStyleWbState);
                r.addEventListener('change', updateSpinoffStyleWbState);
            });
        }

        if (type === 'offline') {
            titleEl.textContent = '开启 线下 节点';
            nameInput.value = '线下';
            memoryGroup.style.display = 'none';
            memoryHint.style.display = 'none';
            if (styleWbContainer) styleWbContainer.style.display = 'block';
        } else if (type === 'spinoff') {
            titleEl.textContent = '开启 番外 节点';
            nameInput.value = '番外';
            memoryGroup.style.display = 'flex';
            memoryHint.style.display = 'block';
            if (spinoffModeGroup) spinoffModeGroup.style.display = 'block';
            if (spinoffBgGroup) spinoffBgGroup.style.display = 'block';
            updateSpinoffStyleWbState();
        } else if (type === 'custom' && tplId) {
            const tpl = db.nodeTemplates.find(t => t.id === tplId);
            if (tpl) {
                titleEl.textContent = `开启 ${tpl.title} 节点`;
                nameInput.value = tpl.title;
                summaryCheck.checked = tpl.enableSummary;
                memoryCheck.checked = tpl.readMemory;
                memoryGroup.style.display = 'flex';
                memoryHint.style.display = 'block';
            }
        }

        modal.classList.add('visible');
    },

    // --- 核心逻辑：开启节点 ---
    async startNode() {
        const char = db.characters.find(c => c.id === currentChatId);
        if (!char) return;

        const type = document.getElementById('node-config-type').value;
        const tplId = document.getElementById('node-config-template-id').value;
        const name = document.getElementById('node-config-name').value.trim() || '未命名节点';
        const enableSummary = document.getElementById('node-config-summary-enabled').checked;
        const readMemory = type === 'offline' ? true : document.getElementById('node-config-read-memory').checked;

        let spinoffMode = 'online';
        if (type === 'spinoff') {
            const modeRadio = document.querySelector('input[name="node-spinoff-mode"]:checked');
            if (modeRadio) spinoffMode = modeRadio.value;
        }

        const styleWorldBookIds = [];
        if (type === 'offline' || (type === 'spinoff' && spinoffMode === 'offline')) {
            document.querySelectorAll('#node-config-style-wb-options input[type="checkbox"]:checked').forEach(cb => {
                styleWorldBookIds.push(cb.value);
            });
        }

        let prompt = '';
        let customConfig = {
            baseMode: 'offline',
            injectedFormats: [],
            styleWorldBookIds: styleWorldBookIds,
            customOutputFormat: []
        };

        if (type === 'offline') {
            prompt = `[System Directive: 当前已进入线下模式。请根据用户的引导展开剧情。]`;
            customConfig.baseMode = 'offline';
        } else if (type === 'spinoff') {
            prompt = `[System Directive: 当前已进入番外剧情模式。请根据用户的引导展开剧情。]`;
            const spinoffBg = document.getElementById('node-config-spinoff-bg').value.trim();
            if (spinoffBg) {
                prompt += `\n<spinoff_background>\n${spinoffBg}\n</spinoff_background>`;
            }
            customConfig.baseMode = spinoffMode;
        } else if (type === 'custom' && tplId) {
            const tpl = db.nodeTemplates.find(t => t.id === tplId);
            if (tpl) {
                prompt = tpl.prompt;
                if (tpl.customConfig) {
                    customConfig = JSON.parse(JSON.stringify(tpl.customConfig)); // 深拷贝
                }
            }
        }

        if (enableSummary) {
            prompt += `\n\n[强制要求：在本次回复的最末尾，必须新起一行，严格按照以下格式输出本轮剧情的简要摘要：\n<summary>x年x月x日/yy:mm/本轮的简要剧情概述（要求客观平实叙述事实、禁止强烈的情感倾向、禁止升华价值。严禁包含任何主观评价、感悟或总结性评价。）</summary>]`;
        }

        const nodeId = 'node_' + Date.now();
        const newNode = {
            id: nodeId,
            name: name,
            type: type,
            status: 'active',
            prompt: prompt,
            enableSummary: enableSummary,
            readMemory: readMemory,
            createdAt: Date.now(),
            customConfig: customConfig
        };

        if (type === 'spinoff') {
            newNode.spinoffMode = spinoffMode;
        }

        if (!char.nodes) char.nodes = [];
        char.nodes.push(newNode);
        char.activeNodeId = nodeId;

        // 插入边界消息
        const boundaryMsg = {
            id: 'msg_node_start_' + Date.now(),
            role: 'system',
            content: `[节点开启：${name}]`,
            isNodeBoundary: true,
            nodeAction: 'start',
            nodeId: nodeId,
            timestamp: Date.now()
        };
        
        if (!char.history) char.history = [];
        char.history.push(boundaryMsg);

        await saveData();
        
        document.getElementById('node-config-modal').classList.remove('visible');
        showToast(`已开启节点：${name}`);
        
        this.checkActiveNodeUI();
        renderMessages(false, true);
    },

    // --- 核心逻辑：结束节点 ---
    async endNode(action) {
        const char = db.characters.find(c => c.id === currentChatId);
        if (!char || !char.activeNodeId) return;

        const nodeId = char.activeNodeId;
        const nodeIndex = char.nodes.findIndex(n => n.id === nodeId);
        if (nodeIndex === -1) return;

        const node = char.nodes[nodeIndex];
        
        // 获取并更新节点名称
        const nameInput = document.getElementById('node-end-name-input');
        if (nameInput && nameInput.value.trim()) {
            node.name = nameInput.value.trim();
        }

        // 检查是否已经有结束边界消息
        let endIndex = char.history.findIndex(m => m.isNodeBoundary && m.nodeAction === 'end' && m.nodeId === nodeId);
        
        if (endIndex === -1) {
            // 插入结束边界消息
            const boundaryMsg = {
                id: 'msg_node_end_' + Date.now(),
                role: 'system',
                content: `[节点结束：${node.name}]`,
                isNodeBoundary: true,
                nodeAction: 'end',
                nodeId: nodeId,
                timestamp: Date.now()
            };
            char.history.push(boundaryMsg);
            endIndex = char.history.length - 1;
        }

        // 找到该节点的所有消息范围
        const startIndex = char.history.findIndex(m => m.isNodeBoundary && m.nodeAction === 'start' && m.nodeId === nodeId);

        // 处理不同操作
        if (action === 'summarize') {
            node.status = 'closed'; // 总结保留在聊天流中
            node.closedAt = Date.now();
            
            if (startIndex !== -1 && typeof generateJournal === 'function') {
                // 调用日记总结逻辑，传入 nodeInfo
                // 注意：generateJournal 接收的是 1-based 的序号，所以是 index + 1
                generateJournal(startIndex + 1, endIndex + 1, false, false, {
                    isNodeSummary: true,
                    nodeId: nodeId,
                    nodeName: node.name
                });
            } else {
                showToast('无法生成总结：未找到节点消息或总结函数缺失');
            }
        } else if (action === 'archive') {
            node.status = 'archived'; // 收纳，在聊天流中隐藏
            node.closedAt = Date.now();
            
            // 插入一条不加入上下文的系统消息，提示已收纳
            char.history.push({
                id: 'msg_system_' + Date.now(),
                role: 'system',
                content: `[system-display:${node.name} 节点已收纳]`,
                timestamp: Date.now() + 1
            });
            showToast('节点已收纳');
        } else if (action === 'summarize_and_archive') {
            node.status = 'archived'; // 收纳，在聊天流中隐藏
            node.closedAt = Date.now();
            
            if (startIndex !== -1 && typeof generateJournal === 'function') {
                generateJournal(startIndex + 1, endIndex + 1, false, false, {
                    isNodeSummary: true,
                    nodeId: nodeId,
                    nodeName: node.name
                });
            }
            
            // 插入一条不加入上下文的系统消息，提示已收纳
            char.history.push({
                id: 'msg_system_' + Date.now(),
                role: 'system',
                content: `[system-display:${node.name} 节点已收纳]`,
                timestamp: Date.now() + 1
            });
            showToast('节点已总结并收纳');
        } else if (action === 'delete') {
            // 找到 start 和 end 之间的所有消息并删除
            if (startIndex !== -1) {
                char.history.splice(startIndex, endIndex - startIndex + 1);
            }
            // 从 nodes 中移除
            char.nodes.splice(nodeIndex, 1);
            showToast('节点记录已彻底删除');
        }

        char.activeNodeId = null;
        await saveData();
        
        document.getElementById('node-end-modal').classList.remove('visible');
        this.checkActiveNodeUI();
        renderMessages(false, true);
    },

    // 检查并渲染悬浮的“结束节点”按钮 (已根据用户要求移除多余的 UI，仅保留清理逻辑)
    checkActiveNodeUI() {
        const floatBtn = document.getElementById('end-node-float-btn');
        if (floatBtn) {
            floatBtn.remove();
        }
    },

    // --- 节点大厅 ---
    openNodeHall() {
        if (typeof switchScreen === 'function') {
            switchScreen('node-system-screen');
        }
        
        // 默认显示收纳箱 (手动切换状态，避免 click() 可能带来的问题)
        const tabs = document.querySelectorAll('.node-tab');
        tabs.forEach(t => t.classList.remove('active'));
        const archiveTab = document.querySelector('.node-tab[data-tab="archive"]');
        if (archiveTab) archiveTab.classList.add('active');
        
        document.querySelectorAll('.node-tab-content').forEach(c => c.style.display = 'none');
        const archiveList = document.getElementById('node-archive-list');
        if (archiveList) archiveList.style.display = 'flex';
        
        this.exitMultiSelectMode();
        this.renderArchiveList();
        this.renderTemplateList();
        this.bindMultiSelectEvents();

        // 默认收纳箱 tab，隐藏模板相关按钮
        document.getElementById('node-template-add-btn').style.display = 'none';
    },

    bindMultiSelectEvents() {
        if (this._multiSelectBound) return;
        this._multiSelectBound = true;

        const multiSelectBtn = document.getElementById('node-archive-multi-select-btn');
        const cancelMultiBtn = document.getElementById('node-cancel-multi-btn');
        const selectAllBtn = document.getElementById('node-select-all-btn');
        const deleteSelectedBtn = document.getElementById('node-delete-selected-btn');

        if (multiSelectBtn) {
            multiSelectBtn.addEventListener('click', () => {
                const container = document.getElementById('node-system-screen');
                container.classList.add('node-system-multi-select');
                document.getElementById('node-multi-select-bar').style.display = 'flex';
                multiSelectBtn.style.display = 'none';
                this.updateMultiSelectCount();
            });
        }

        if (cancelMultiBtn) {
            cancelMultiBtn.addEventListener('click', () => this.exitMultiSelectMode());
        }

        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => {
                const cards = document.querySelectorAll('#node-archive-list .node-card');
                const allSelected = Array.from(cards).every(card => card.classList.contains('selected'));
                
                cards.forEach(card => {
                    if (allSelected) {
                        card.classList.remove('selected');
                    } else {
                        card.classList.add('selected');
                    }
                });
                this.updateMultiSelectCount();
            });
        }

        if (deleteSelectedBtn) {
            deleteSelectedBtn.addEventListener('click', async () => {
                const selectedCards = document.querySelectorAll('#node-archive-list .node-card.selected');
                if (selectedCards.length === 0) return;

                if (!confirm(`确定要彻底删除选中的 ${selectedCards.length} 个节点记录吗？此操作不可恢复。`)) return;

                const char = db.characters.find(c => c.id === currentChatId);
                if (!char) return;

                let deletedCount = 0;
                selectedCards.forEach(card => {
                    const nodeId = card.dataset.id;
                    const nodeIndex = char.nodes.findIndex(n => n.id === nodeId);
                    if (nodeIndex !== -1) {
                        // 删除 history 中的消息
                        const startIndex = char.history.findIndex(m => m.isNodeBoundary && m.nodeAction === 'start' && m.nodeId === nodeId);
                        const endIndex = char.history.findIndex(m => m.isNodeBoundary && m.nodeAction === 'end' && m.nodeId === nodeId);
                        
                        if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
                            char.history.splice(startIndex, endIndex - startIndex + 1);
                        }
                        char.nodes.splice(nodeIndex, 1);
                        deletedCount++;
                    }
                });

                if (deletedCount > 0) {
                    await saveData();
                    showToast(`已删除 ${deletedCount} 个节点`);
                    this.exitMultiSelectMode();
                    this.renderArchiveList();
                }
            });
        }
    },

    exitMultiSelectMode() {
        const container = document.getElementById('node-system-screen');
        if (container) {
            container.classList.remove('node-system-multi-select');
        }
        const bar = document.getElementById('node-multi-select-bar');
        if (bar) bar.style.display = 'none';
        const multiSelectBtn = document.getElementById('node-archive-multi-select-btn');
        if (multiSelectBtn) multiSelectBtn.style.display = 'block';
        
        document.querySelectorAll('#node-archive-list .node-card').forEach(card => {
            card.classList.remove('selected');
        });
    },

    updateMultiSelectCount() {
        const selectedCount = document.querySelectorAll('#node-archive-list .node-card.selected').length;
        const countSpan = document.getElementById('node-selected-count');
        const deleteBtn = document.getElementById('node-delete-selected-btn');
        
        if (countSpan) countSpan.textContent = `已选 ${selectedCount} 项`;
        if (deleteBtn) deleteBtn.disabled = selectedCount === 0;
    },

    renderArchiveList() {
        const container = document.getElementById('node-archive-list');
        container.innerHTML = '';

        const char = db.characters.find(c => c.id === currentChatId);
        
        const emptyStateHTML = `
            <div class="node-empty-state">
                <div class="node-empty-icon">📦</div>
                <div class="node-empty-text">收纳箱空空如也</div>
                <div class="node-empty-hint">在聊天中结束节点即可收纳到这里<br>方便日后回顾或重新总结</div>
            </div>
        `;

        if (!char || !char.nodes || char.nodes.length === 0) {
            container.innerHTML = emptyStateHTML;
            return;
        }

        const archivedNodes = char.nodes.filter(n => n.status === 'archived').sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0));

        if (archivedNodes.length === 0) {
            container.innerHTML = emptyStateHTML;
            return;
        }

        archivedNodes.forEach(node => {
            const card = document.createElement('div');
            card.className = 'node-card';
            card.dataset.id = node.id;
            
            const dateStr = new Date(node.createdAt).toLocaleString();
            
            let icon = '🔖';
            let typeLabel = '自定义';
            if (node.type === 'offline') { icon = '☕'; typeLabel = '线下'; }
            else if (node.type === 'spinoff') { icon = '🎬'; typeLabel = '番外'; }

            card.innerHTML = `
                <div class="node-card-checkbox"></div>
                <div class="node-card-header">
                    <div class="node-card-title-wrap">
                        <div class="node-card-icon">${icon}</div>
                        <h4 class="node-card-title">${DOMPurify.sanitize(node.name)}</h4>
                    </div>
                    <span class="node-card-type ${node.type}">${typeLabel}</span>
                </div>
                <div class="node-card-meta">
                    <span>创建于: ${dateStr}</span>
                </div>
                ${node.summaryContent ? `<div class="node-card-summary">${DOMPurify.sanitize(node.summaryContent)}</div>` : ''}
                <div class="node-card-actions">
                    <button class="btn btn-small btn-secondary view-record-btn" data-id="${node.id}">查看记录</button>
                    <button class="btn btn-small btn-neutral delete-node-btn" data-id="${node.id}" style="color: #ff4d4f; background: transparent; border: 1px solid #ffccc7;">删除</button>
                </div>
            `;

            // 多选点击逻辑
            card.addEventListener('click', (e) => {
                if (document.getElementById('node-system-screen').classList.contains('node-system-multi-select')) {
                    card.classList.toggle('selected');
                    this.updateMultiSelectCount();
                }
            });

            card.querySelector('.view-record-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.viewNodeRecord(node.id);
            });
            card.querySelector('.delete-node-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteArchivedNode(node.id);
            });

            container.appendChild(card);
        });
    },

    async deleteArchivedNode(nodeId) {
        if (!confirm('确定要彻底删除该节点的记录吗？此操作不可恢复。')) return;

        const char = db.characters.find(c => c.id === currentChatId);
        if (!char) return;

        const nodeIndex = char.nodes.findIndex(n => n.id === nodeId);
        if (nodeIndex === -1) return;

        // 删除 history 中的消息
        const startIndex = char.history.findIndex(m => m.isNodeBoundary && m.nodeAction === 'start' && m.nodeId === nodeId);
        const endIndex = char.history.findIndex(m => m.isNodeBoundary && m.nodeAction === 'end' && m.nodeId === nodeId);
        
        if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
            char.history.splice(startIndex, endIndex - startIndex + 1);
        }

        char.nodes.splice(nodeIndex, 1);
        await saveData();
        showToast('已删除');
        this.renderArchiveList();
    },

    viewNodeRecord(nodeId) {
        const char = db.characters.find(c => c.id === currentChatId);
        if (!char) return;

        const node = char.nodes.find(n => n.id === nodeId);
        if (!node) return;

        document.getElementById('node-record-title').textContent = node.name;
        
        const area = document.getElementById('node-record-message-area');
        area.innerHTML = '';
        area.dataset.nodeId = nodeId;

        let inNode = false;
        const fragment = document.createDocumentFragment();

        // 简单复用 createMessageBubbleElement，但需要注意上下文
        // 这里为了安全，我们自己构建简单的气泡，或者临时修改 currentChatId
        char.history.forEach(msg => {
            if (msg.isNodeBoundary && msg.nodeId === nodeId) {
                if (msg.nodeAction === 'start') inNode = true;
                if (msg.nodeAction === 'end') inNode = false;
                return;
            }
            if (inNode) {
                // 简单渲染
                const wrapper = document.createElement('div');
                wrapper.className = `message-wrapper ${msg.role === 'user' ? 'sent' : 'received'}`;
                wrapper.style.marginBottom = '15px';
                
                let content = msg.content;
                const summaryText = db.nodeSummaryText || '摘要';

                wrapper.innerHTML = `
                    <div class="message-bubble-row">
                        <div class="message-bubble ${msg.role === 'user' ? 'sent' : 'received'}" style="max-width:85%;">
                            <span class="bubble-content">${DOMPurify.sanitize(content).replace(/\n/g, '<br>')}</span>
                        </div>
                    </div>
                `;
                fragment.appendChild(wrapper);
                
                if (msg.nodeSummary) {
                    const summaryWrapper = document.createElement('div');
                    summaryWrapper.style.cssText = 'text-align: center; margin: 10px 0;';
                    summaryWrapper.innerHTML = `<div style="display: inline-block; color:#888; font-size:12px; background:rgba(0,0,0,0.05); padding:8px 12px; border-radius:8px; max-width: 90%; text-align: left;">★${DOMPurify.sanitize(summaryText)}：${DOMPurify.sanitize(msg.nodeSummary)}</div>`;
                    fragment.appendChild(summaryWrapper);
                }
            }
        });

        if (fragment.childNodes.length === 0) {
            area.innerHTML = '<div style="text-align:center;color:#999;margin-top:50px;">该节点内没有消息记录</div>';
        } else {
            area.appendChild(fragment);
        }

        if (typeof switchScreen === 'function') {
            switchScreen('node-record-screen');
        }
    },

    // --- 重新总结 ---
    async resummarizeNode(nodeId) {
        const char = db.characters.find(c => c.id === currentChatId);
        if (!char) return;

        const node = char.nodes.find(n => n.id === nodeId);
        if (!node) return;
        
        const startIndex = char.history.findIndex(m => m.isNodeBoundary && m.nodeAction === 'start' && m.nodeId === nodeId);
        let endIndex = char.history.findIndex(m => m.isNodeBoundary && m.nodeAction === 'end' && m.nodeId === nodeId);
        
        if (endIndex === -1) {
            endIndex = char.history.length - 1;
        }

        if (startIndex !== -1 && typeof generateJournal === 'function') {
            // 调用日记总结逻辑，传入 nodeInfo
            generateJournal(startIndex + 1, endIndex + 1, false, false, {
                isNodeSummary: true,
                nodeId: nodeId,
                nodeName: node.name,
                isResummarize: true // 标记为重新总结，以便在生成后刷新大厅列表
            });
        } else {
            showToast('无法生成总结：未找到节点消息');
        }
    },

    // --- 插入节点 ---
    async insertNodeBoundary(messageId, position) {
        const char = db.characters.find(c => c.id === currentChatId);
        if (!char) return;

        const msgIndex = char.history.findIndex(m => m.id === messageId);
        if (msgIndex === -1) return;

        document.getElementById('node-insert-msg-id').value = messageId;
        document.getElementById('node-insert-position').value = position;
        
        // 重置表单
        document.getElementById('node-insert-action-start').checked = true;
        document.getElementById('node-insert-type-group').style.display = 'block';
        document.getElementById('node-insert-type').value = 'offline';
        document.getElementById('node-insert-name').value = '线下';

        document.getElementById('node-insert-modal').classList.add('visible');
    },

    async confirmInsertNode() {
        const char = db.characters.find(c => c.id === currentChatId);
        if (!char) return;

        const messageId = document.getElementById('node-insert-msg-id').value;
        const position = document.getElementById('node-insert-position').value;
        const action = document.querySelector('input[name="node-insert-action"]:checked').value;
        const type = document.getElementById('node-insert-type').value;
        const name = document.getElementById('node-insert-name').value.trim() || '未命名节点';

        const msgIndex = char.history.findIndex(m => m.id === messageId);
        if (msgIndex === -1) return;

        const nodeId = 'node_insert_' + Date.now();
        
        const boundaryMsg = {
            id: 'msg_node_' + action + '_' + Date.now(),
            role: 'system',
            content: `[节点${action === 'start' ? '开启' : '结束'}：${name}]`,
            isNodeBoundary: true,
            nodeAction: action,
            nodeId: nodeId,
            timestamp: char.history[msgIndex].timestamp + (position === 'after' ? 1 : -1)
        };

        const insertIndex = position === 'after' ? msgIndex + 1 : msgIndex;
        char.history.splice(insertIndex, 0, boundaryMsg);

        // 如果是 start，还需要在 nodes 数组中注册
        if (action === 'start') {
            if (!char.nodes) char.nodes = [];
            char.nodes.push({
                id: nodeId,
                name: name,
                type: type,
                status: 'active', // 插入的节点默认 active，直到插入 end
                prompt: type === 'offline' ? `[System Directive: 当前已进入线下模式。请严格遵守以下规则：\n1. 弱化网络聊天感，增加动作、神态、环境的描写。\n2. 回复应当像是在现实中面对面交流，字数可以适当加长，细节更加丰富。]` : `[System Directive: 当前已进入番外剧情模式。请根据用户的引导展开剧情。]`,
                enableSummary: true,
                readMemory: type === 'offline',
                createdAt: Date.now()
            });
        }

        await saveData();
        document.getElementById('node-insert-modal').classList.remove('visible');
        renderMessages(false, true);
        showToast('节点标记已插入');
    },

    // --- 自定义模板管理 ---
    renderTemplateList() {
        const container = document.getElementById('node-template-list');
        container.innerHTML = '';
        
        document.getElementById('node-template-add-btn').style.display = 'block';

        if (!db.nodeTemplates || db.nodeTemplates.length === 0) {
            container.innerHTML = `
                <div class="node-empty-state">
                    <div class="node-empty-icon">📝</div>
                    <div class="node-empty-text">暂无自定义模板</div>
                    <div class="node-empty-hint">点击右上角 "+" 创建你的专属节点模板<br>例如：平行宇宙、真心话大冒险</div>
                </div>
            `;
            return;
        }

        db.nodeTemplates.forEach(tpl => {
            const card = document.createElement('div');
            card.className = 'node-card template-card';
            card.innerHTML = `
                <div class="node-card-header">
                    <div class="node-card-title-wrap">
                        <div class="node-card-icon">✨</div>
                        <h4 class="node-card-title">${DOMPurify.sanitize(tpl.title)}</h4>
                    </div>
                </div>
                <div class="node-card-summary" style="-webkit-line-clamp: 2; border-left-color: #a8b8e0;">${DOMPurify.sanitize(tpl.prompt)}</div>
                <div class="node-tpl-tags">
                    <span class="node-tpl-tag ${tpl.enableSummary ? 'active' : ''}">${tpl.enableSummary ? '✓ 开启摘要' : '✗ 关闭摘要'}</span>
                    <span class="node-tpl-tag ${tpl.readMemory ? 'active' : ''}">${tpl.readMemory ? '✓ 读取记忆' : '✗ 隔离记忆'}</span>
                </div>
                <div class="node-card-actions">
                    <button class="btn btn-small btn-secondary edit-tpl-btn" data-id="${tpl.id}">编辑</button>
                    <button class="btn btn-small btn-neutral delete-tpl-btn" data-id="${tpl.id}" style="color: #ff4d4f; background: transparent; border: 1px solid #ffccc7;">删除</button>
                </div>
            `;

            card.querySelector('.edit-tpl-btn').addEventListener('click', () => this.openTemplateEditModal(tpl.id));
            card.querySelector('.delete-tpl-btn').addEventListener('click', () => this.deleteTemplate(tpl.id));

            container.appendChild(card);
        });
    },

    openTemplateEditModal(tplId = null) {
        const modal = document.getElementById('node-template-edit-modal');
        const titleEl = document.getElementById('node-template-edit-title');
        const idInput = document.getElementById('node-tpl-id');
        const titleInput = document.getElementById('node-tpl-title');
        const promptInput = document.getElementById('node-tpl-prompt');
        const summaryCheck = document.getElementById('node-tpl-summary-enabled');
        const memoryCheck = document.getElementById('node-tpl-read-memory');

        // 高级配置项
        const baseModeOffline = document.getElementById('node-tpl-base-mode-offline');
        const baseModeOnline = document.getElementById('node-tpl-base-mode-online');
        const injectedFormatsContainer = document.getElementById('node-tpl-injected-formats-container');
        const injectedFormats = document.querySelectorAll('#node-tpl-injected-formats input[type="checkbox"]');
        const formatsListContainer = document.getElementById('node-tpl-custom-output-formats-list');
        const addFormatBtn = document.getElementById('node-tpl-add-format-btn');
        
        const styleWbContainer = document.getElementById('node-tpl-style-wb-container');
        const styleWbDisplay = document.getElementById('node-tpl-style-wb-display');
        const styleWbDropdown = document.getElementById('node-tpl-style-wb-dropdown');
        const styleWbOptions = document.getElementById('node-tpl-style-wb-options');

        // 填充文风世界书选项
        if (styleWbOptions) {
            styleWbOptions.innerHTML = '';
            const worldBooks = db.worldBooks || [];
            if (worldBooks.length === 0) {
                styleWbOptions.innerHTML = '<div style="padding: 8px; color: #999; text-align: center;">暂无世界书</div>';
            } else {
                worldBooks.forEach(wb => {
                    const label = document.createElement('label');
                    label.className = 'theater-multiselect-option';
                    label.innerHTML = `
                        <input type="checkbox" value="${wb.id}">
                        <span>${DOMPurify.sanitize(wb.name)}</span>
                    `;
                    styleWbOptions.appendChild(label);
                });
            }
        }

        // 绑定下拉框展开/收起事件
        if (styleWbDisplay && !styleWbDisplay.dataset.bound) {
            styleWbDisplay.addEventListener('click', (e) => {
                e.stopPropagation();
                styleWbDropdown.classList.toggle('show');
            });
            document.addEventListener('click', (e) => {
                if (!e.target.closest('#node-tpl-style-wb-container')) {
                    if (styleWbDropdown) styleWbDropdown.classList.remove('show');
                }
            });
            styleWbDisplay.dataset.bound = 'true';
        }

        // 更新占位符文本
        const updateStyleWbPlaceholder = () => {
            if (!styleWbOptions || !styleWbDisplay) return;
            const checked = styleWbOptions.querySelectorAll('input[type="checkbox"]:checked');
            const placeholder = styleWbDisplay.querySelector('.theater-multiselect-placeholder');
            if (checked.length === 0) {
                placeholder.textContent = '请选择文风世界书（可选）';
                placeholder.style.color = '#999';
            } else {
                const names = Array.from(checked).map(cb => cb.nextElementSibling.textContent);
                placeholder.textContent = names.join(', ');
                placeholder.style.color = '#333';
            }
        };

        if (styleWbOptions && !styleWbOptions.dataset.bound) {
            styleWbOptions.addEventListener('change', updateStyleWbPlaceholder);
            styleWbOptions.dataset.bound = 'true';
        }

        // 动态添加格式输入框的函数
        const addFormatInput = (value = '', renderAsSystem = false) => {
            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.gap = '8px';
            wrapper.style.alignItems = 'center';
            
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'node-tpl-custom-format-input';
            input.placeholder = '例如：[系统提示：{内容}]';
            input.value = value;
            input.style.flex = '1';
            input.style.padding = '8px';
            input.style.borderRadius = '6px';
            input.style.border = '1px solid #eee';
            input.style.fontSize = '13px';

            const sysLabel = document.createElement('label');
            sysLabel.style.cssText = 'display:flex;align-items:center;gap:3px;font-size:11px;color:#888;white-space:nowrap;cursor:pointer;';
            const sysCheck = document.createElement('input');
            sysCheck.type = 'checkbox';
            sysCheck.className = 'node-tpl-format-as-system';
            sysCheck.checked = renderAsSystem;
            sysCheck.style.margin = '0';
            sysLabel.appendChild(sysCheck);
            sysLabel.appendChild(document.createTextNode('第三方'));
            
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'btn btn-neutral btn-small';
            delBtn.textContent = '×';
            delBtn.style.padding = '4px 8px';
            delBtn.style.color = '#ff4d4f';
            delBtn.onclick = () => wrapper.remove();
            
            wrapper.appendChild(input);
            wrapper.appendChild(sysLabel);
            wrapper.appendChild(delBtn);
            formatsListContainer.appendChild(wrapper);
        };

        // 绑定添加按钮事件 (确保只绑定一次)
        if (addFormatBtn && !addFormatBtn.dataset.bound) {
            addFormatBtn.addEventListener('click', () => addFormatInput());
            addFormatBtn.dataset.bound = 'true';
        }

        // 联动逻辑：切换基础模式时显示/隐藏点菜区和文风选择
        const updateInjectedFormatsState = () => {
            const isOnline = baseModeOnline && baseModeOnline.checked;
            if (injectedFormatsContainer) {
                injectedFormatsContainer.style.display = isOnline ? 'block' : 'none';
            }
            if (styleWbContainer) {
                styleWbContainer.style.display = isOnline ? 'none' : 'block';
            }
            if (!isOnline && injectedFormats) {
                injectedFormats.forEach(cb => cb.checked = false);
            }
            if (isOnline && styleWbOptions) {
                styleWbOptions.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
                updateStyleWbPlaceholder();
            }
        };

        if (baseModeOffline && baseModeOnline) {
            baseModeOffline.removeEventListener('change', updateInjectedFormatsState);
            baseModeOnline.removeEventListener('change', updateInjectedFormatsState);
            baseModeOffline.addEventListener('change', updateInjectedFormatsState);
            baseModeOnline.addEventListener('change', updateInjectedFormatsState);
        }

        // 清空旧的格式列表
        if (formatsListContainer) formatsListContainer.innerHTML = '';

        if (tplId) {
            const tpl = db.nodeTemplates.find(t => t.id === tplId);
            if (tpl) {
                titleEl.textContent = '编辑节点模板';
                idInput.value = tpl.id;
                titleInput.value = tpl.title;
                promptInput.value = tpl.prompt;
                summaryCheck.checked = tpl.enableSummary;
                memoryCheck.checked = tpl.readMemory;

                // 回显高级配置
                if (tpl.customConfig) {
                    if (tpl.customConfig.baseMode === 'online') {
                        if (baseModeOnline) baseModeOnline.checked = true;
                    } else {
                        if (baseModeOffline) baseModeOffline.checked = true;
                    }
                    
                    if (injectedFormats && tpl.customConfig.injectedFormats) {
                        injectedFormats.forEach(cb => {
                            cb.checked = tpl.customConfig.injectedFormats.includes(cb.value);
                        });
                    }

                    if (styleWbOptions && tpl.customConfig.styleWorldBookIds) {
                        styleWbOptions.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                            cb.checked = tpl.customConfig.styleWorldBookIds.includes(cb.value);
                        });
                        updateStyleWbPlaceholder();
                    }
                    
                    // 回显自定义输出格式 (兼容旧版字符串和新版数组)
                    if (tpl.customConfig.customOutputFormat) {
                        if (Array.isArray(tpl.customConfig.customOutputFormat)) {
                            tpl.customConfig.customOutputFormat.forEach(fmt => {
                                if (typeof fmt === 'object' && fmt !== null) {
                                    addFormatInput(fmt.format || '', !!fmt.renderAsSystem);
                                } else {
                                    addFormatInput(fmt);
                                }
                            });
                        } else if (typeof tpl.customConfig.customOutputFormat === 'string') {
                            // 尝试按行分割旧的字符串
                            const lines = tpl.customConfig.customOutputFormat.split('\n').filter(l => l.trim() !== '');
                            if (lines.length > 0) {
                                lines.forEach(fmt => addFormatInput(fmt));
                            } else {
                                addFormatInput();
                            }
                        }
                    } else {
                        addFormatInput(); // 默认给一个空输入框
                    }
                } else {
                    // 默认值
                    if (baseModeOffline) baseModeOffline.checked = true;
                    if (injectedFormats) injectedFormats.forEach(cb => cb.checked = false);
                    addFormatInput();
                }
            }
        } else {
            titleEl.textContent = '新建节点模板';
            idInput.value = '';
            titleInput.value = '';
            promptInput.value = '';
            summaryCheck.checked = true;
            memoryCheck.checked = false;
            
            // 默认值
            if (baseModeOffline) baseModeOffline.checked = true;
            if (injectedFormats) injectedFormats.forEach(cb => cb.checked = false);
            if (styleWbOptions) {
                styleWbOptions.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
                updateStyleWbPlaceholder();
            }
            addFormatInput();
        }

        updateInjectedFormatsState();
        modal.classList.add('visible');
    },

    async saveTemplate() {
        const id = document.getElementById('node-tpl-id').value;
        const title = document.getElementById('node-tpl-title').value.trim();
        const prompt = document.getElementById('node-tpl-prompt').value.trim();
        const enableSummary = document.getElementById('node-tpl-summary-enabled').checked;
        const readMemory = document.getElementById('node-tpl-read-memory').checked;

        // 读取高级配置
        const baseModeRadio = document.querySelector('input[name="node-tpl-base-mode"]:checked');
        const baseMode = baseModeRadio ? baseModeRadio.value : 'offline';
        
        const injectedFormats = [];
        document.querySelectorAll('#node-tpl-injected-formats input[type="checkbox"]:checked').forEach(cb => {
            injectedFormats.push(cb.value);
        });

        const styleWorldBookIds = [];
        document.querySelectorAll('#node-tpl-style-wb-options input[type="checkbox"]:checked').forEach(cb => {
            styleWorldBookIds.push(cb.value);
        });
        
        // 收集自定义输出格式数组
        const customOutputFormats = [];
        document.querySelectorAll('#node-tpl-custom-output-formats-list > div').forEach(wrapper => {
            const input = wrapper.querySelector('.node-tpl-custom-format-input');
            const sysCheck = wrapper.querySelector('.node-tpl-format-as-system');
            const val = input ? input.value.trim() : '';
            if (val) {
                customOutputFormats.push({
                    format: val,
                    renderAsSystem: sysCheck ? sysCheck.checked : false
                });
            }
        });

        const customConfig = {
            baseMode: baseMode,
            injectedFormats: injectedFormats,
            styleWorldBookIds: styleWorldBookIds,
            customOutputFormat: customOutputFormats
        };

        if (!title || !prompt) return;

        if (!db.nodeTemplates) db.nodeTemplates = [];

        if (id) {
            const index = db.nodeTemplates.findIndex(t => t.id === id);
            if (index !== -1) {
                db.nodeTemplates[index] = { id, title, prompt, enableSummary, readMemory, customConfig };
            }
        } else {
            db.nodeTemplates.push({
                id: 'tpl_' + Date.now(),
                title,
                prompt,
                enableSummary,
                readMemory,
                customConfig
            });
        }

        await saveData();
        document.getElementById('node-template-edit-modal').classList.remove('visible');
        showToast('保存成功');
        this.renderTemplateList();
    },

    async deleteTemplate(tplId) {
        if (!confirm('确定删除该模板吗？')) return;
        
        db.nodeTemplates = db.nodeTemplates.filter(t => t.id !== tplId);
        await saveData();
        showToast('已删除');
        this.renderTemplateList();
    },

    // --- 模板导出 ---
    async exportTemplates() {
        if (!db.nodeTemplates || db.nodeTemplates.length === 0) {
            showToast('暂无模板可导出');
            return;
        }
        const exportData = {
            type: 'node_templates_export',
            version: 1,
            exportedAt: Date.now(),
            templates: JSON.parse(JSON.stringify(db.nodeTemplates))
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        await OvoFileDownload.save(blob, `节点模板_${new Date().toLocaleDateString().replace(/\//g, '-')}.json`);

    },

    // --- 模板导入 ---
    triggerImportTemplates() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (!data || data.type !== 'node_templates_export' || !Array.isArray(data.templates)) {
                        showToast('文件格式不正确，请选择有效的节点模板导出文件');
                        return;
                    }
                    this._pendingImportData = data.templates;
                    const preview = document.getElementById('node-import-preview');
                    preview.textContent = `即将导入 ${data.templates.length} 个模板，是否继续？（同名模板将被覆盖）`;
                    document.getElementById('node-import-modal').classList.add('visible');
                } catch (err) {
                    showToast('文件解析失败：' + err.message);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    },

    async confirmImportTemplates() {
        const templates = this._pendingImportData;
        if (!templates || !Array.isArray(templates)) return;

        if (!db.nodeTemplates) db.nodeTemplates = [];

        let addedCount = 0;
        let updatedCount = 0;
        templates.forEach(tpl => {
            if (!tpl.title || !tpl.prompt) return;
            const existIndex = db.nodeTemplates.findIndex(t => t.title === tpl.title);
            if (existIndex !== -1) {
                db.nodeTemplates[existIndex] = { ...tpl, id: db.nodeTemplates[existIndex].id };
                updatedCount++;
            } else {
                db.nodeTemplates.push({ ...tpl, id: 'tpl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) });
                addedCount++;
            }
        });

        await saveData();
        this._pendingImportData = null;
        document.getElementById('node-import-modal').classList.remove('visible');
        showToast(`导入完成：新增 ${addedCount} 个，更新 ${updatedCount} 个`);
        this.renderTemplateList();
    }
};

// 暴露给全局
window.NodeSystem = NodeSystem;
