// --- 思维链(CoT)设置模块 ---

const DEFAULT_COT_ITEMS = [
    { id: 'cot_item_1', name: '引子', content: '[System Directive]:\n你必须严格遵守 [incipere] 协议。在回复前，请先进入 <thinking> 标签进行深度推演。\n请按以下步骤查阅 System Prompt 中的模块并思考：', enabled: true, locked: true },
    { id: 'cot_item_2', name: '准备动脑了吗？', content: '---\n## 【前置规则】\n### **必须**读取所有<logic_rules>和<output_formats>：了解**所有**需要遵守的规则，然后进行以下步骤精简准确的思考', enabled: true },
    { id: 'cot_item_3', name: '给我读设定！', content: '---\n## 【行为校准】\n基于<char_settings>和<角色活人运转>构建角色人格\n### Phase1: person\n1. **自我意识校验 (Ref: <char_settings>和<角色活人运转>)**\n   - 是否塑造鲜活真实人格？\n   - 你（角色）是否具有自己的聊天习惯/风格？\n   - 你想如何回应我？', enabled: true },
    { id: 'cot_item_4', name: '当个人吧。', content: '### Phase2: Verisimilitude\n2.**真实聊天**\n   - 是否根据以下两点要求采用了真人聊天思路？\n    - 正常人的注意力是有限的，不会每句话都非得逐句回复。\n    - 不对已有信息进行重复反问。\n    - 断点处理：若与上一条消息间隔较久，默认双方只是自然忙碌后重新拿起手机或默认期间以其他方式保持联系，自然接续话题。', enabled: true },
    { id: 'cot_item_5', name: '有特殊格式吗？', content: '### Phase3: chat role\n3. **逻辑检索 (Ref: <logic_rules>)**\n   - 当前是否为双语对话情境？若无，跳过此条\n   - 是否需要输出状态栏？若无相关要求，则跳过此条', enabled: true },
    { id: 'cot_item_6', name: '最后确认一下。', content: '## 【最后确认】\n\n4. 整合<Chatting Guidelines>，是否合理自然回复且不偏离人设？回顾<output_formats>，输出消息格式是否正确？', enabled: true },
    { id: 'cot_item_7', name: '闭合标签', content: '## 【闭合标签】\n\n5.当前是否需要闭合<thinking>的xml标签？若是，在思考结束后谨记闭合标签，切勿忘记。', enabled: true },
    { id: 'cot_item_8', name: '尾声', content: '每轮输出前，必须先严格按照<thinking>…</thinking>内的步骤进行逐条思考，无需重复其中的条目，但思考内容需精简准确、清晰、可执行，不得跳步骤。\n<thinking>中的所有分析必须在输出中完全落实，不得偏离、删减或弱化。\n\n格式：\n<thinking>\n...思考过程...\n</thinking>', enabled: true, locked: true }
];

const DEFAULT_CALL_COT_ITEMS = [
    { id: 'cot_call_item_1', name: '引子', content: '[System Directive]:\n你必须严格遵守 [incipere] 协议。在回复前，请先进入 <thinking> 标签进行深度推演。\n请按以下步骤查阅 System Prompt 中的模块并思考：', enabled: true, locked: true },
    { id: 'cot_call_item_2', name: '给我读设定！', content: '---\n## 【行为校准】\n基于<char_settings>和<角色活人运转>构建角色人格\n### Phase1: person\n1. **自我意识校验 (Ref: <char_settings>和<角色活人运转>)**\n   - 是否塑造鲜活真实人格？\n   - 你（角色）是否具有自己的说话习惯/风格？\n   - 你想如何回应我？', enabled: true },
    { id: 'cot_call_item_3', name: '通话情境感知', content: '---\n## 【情境感知】\n1. **实时性检查**：这是一个实时视频/语音通话。你的反应必须即时、自然、口语化。\n2. **环境与画面**：\n   - 如果是视频通话，你需要意识到摄像头捕捉到的画面（你的表情、动作、背景）。\n   - 如果是语音通话，你需要意识到声音传递的情绪和背景音。', enabled: true },
    { id: 'cot_call_item_4', name: '输出检查', content: '## 【输出检查】\n1. **格式确认**：是否严格遵守了 `[画面/环境音：...]` 和 `[声音：...]` 的格式？\n2. **内容净化**：确保没有输出任何不属于通话内容的心理活动或旁白（除非放在画面描述中）。\n', enabled: true },
    { id: 'cot_call_item_5', name: '闭合标签', content: '## 【闭合标签】\n\n5.当前是否需要闭合<thinking>的xml标签？若是，在思考结束后谨记闭合标签，切勿忘记。', enabled: true },
    { id: 'cot_call_item_6', name: '尾声', content: '每轮输出前，必须先严格按照<thinking>…</thinking>内的步骤进行逐条思考。\n<thinking>中的所有分析必须在输出中完全落实。\n\n格式：\n<thinking>\n...思考过程...\n</thinking>', enabled: true, locked: true }
];

const DEFAULT_OFFLINE_COT_ITEMS = [
    { id: 'cot_offline_item_1', name: '引子', content: '[System Directive]:\n你必须严格遵守 [incipere] 协议。在回复前，请先进入 <thinking> 标签进行深度推演。\n请按以下步骤查阅 System Prompt 中的模块并思考：', enabled: true, locked: true },
    { id: 'cot_offline_item_2', name: '准备动脑了吗？', content: '---\n## 【前置规则】\n### **必须**读取所有<logic_rules>和<output_formats>：了解**所有**需要遵守的规则，然后进行以下步骤精简准确的思考', enabled: true },
    { id: 'cot_offline_item_3', name: '给我读设定！', content: '---\n## 【行为校准】\n基于<char_settings>和<角色活人运转>构建角色人格\n### Phase1: person\n1. **自我意识校验 (Ref: <char_settings>和<角色活人运转>)**\n   - 是否塑造鲜活真实人格？\n   - 你（角色）是否具有自己的聊天习惯/风格？\n   - 你想如何回应我？', enabled: true },
    { id: 'cot_offline_item_4', name: '有特殊格式吗？', content: '### Phase3: chat role\n3. **逻辑检索 (Ref: <logic_rules>)**\n   - 当前是否为双语对话情境？若无，跳过此条\n   - 是否需要输出状态栏？若无相关要求，则跳过此条', enabled: true },
    { id: 'cot_offline_item_5', name: '最后确认一下。', content: '## 【最后确认】\n\n4. 整合<Chatting Guidelines>，是否合理自然回复且不偏离人设？回顾<output_formats>，输出消息格式是否正确？', enabled: true },
    { id: 'cot_offline_item_6', name: '闭合标签', content: '## 【闭合标签】\n\n5.当前是否需要闭合<thinking>的xml标签？若是，在思考结束后谨记闭合标签，切勿忘记。', enabled: true },
    { id: 'cot_offline_item_7', name: '尾声', content: '每轮输出前，必须先严格按照<thinking>…</thinking>内的步骤进行逐条思考，无需重复其中的条目，但思考内容需精简准确、清晰、可执行，不得跳步骤。\n<thinking>中的所有分析必须在输出中完全落实，不得偏离、删减或弱化。\n\n格式：\n<thinking>\n...思考过程...\n</thinking>', enabled: true, locked: true }
];

let currentCotMode = 'chat'; // 'chat', 'call', or 'offline'

// 初始化 CoT 设置
function initCotSettings() {
    // 绑定入口按钮事件 (在更多菜单中)
    const cotEntryBtn = document.querySelector('.menu-item[data-action="cot-settings"]');
    if (cotEntryBtn) {
        cotEntryBtn.addEventListener('click', () => {
            loadCotSettings();
            switchScreen('cot-settings-screen');
        });
    }

    // 绑定 Tab 切换
    const tabs = document.querySelectorAll('#cot-settings-tabs .settings-tab-item');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentCotMode = tab.dataset.mode;
            loadCotSettings();
        });
    });

    // 绑定全局开关
    const enabledSwitch = document.getElementById('cot-enabled-switch');
    if (enabledSwitch) {
        enabledSwitch.addEventListener('change', async (e) => {
            if (!db.cotSettings) db.cotSettings = { enabled: false, activePresetId: 'default' };
            
            if (currentCotMode === 'chat') {
                db.cotSettings.enabled = e.target.checked;
            } else if (currentCotMode === 'call') {
                db.cotSettings.callEnabled = e.target.checked;
            } else if (currentCotMode === 'offline') {
                db.cotSettings.offlineEnabled = e.target.checked;
            }
            
            await saveData();
            showToast(e.target.checked ? '思维链已启用' : '思维链已禁用');
        });
    }

    // 绑定角色活人运转开关
    const humanRunSwitch = document.getElementById('cot-human-run-switch');
    if (humanRunSwitch) {
        humanRunSwitch.addEventListener('change', async (e) => {
            if (!db.cotSettings) db.cotSettings = { enabled: false, activePresetId: 'default' };
            db.cotSettings.humanRunEnabled = e.target.checked;
            await saveData();
            showToast(e.target.checked ? '角色活人运转已启用' : '角色活人运转已禁用');
        });
    }

    // 绑定预设选择
    const presetSelect = document.getElementById('cot-preset-select');
    if (presetSelect) {
        presetSelect.addEventListener('change', async (e) => {
            const presetId = e.target.value;
            if (presetId) {
                if (currentCotMode === 'chat') {
                    db.cotSettings.activePresetId = presetId;
                } else if (currentCotMode === 'call') {
                    db.cotSettings.activeCallPresetId = presetId;
                } else if (currentCotMode === 'offline') {
                    db.cotSettings.activeOfflinePresetId = presetId;
                }
                await saveData();
                renderCotItems();
                showToast('已切换预设');
            }
        });
    }

    // 绑定新建预设按钮
    document.getElementById('cot-new-preset-btn').addEventListener('click', createNewCotPreset);

    // 绑定管理预设按钮
    document.getElementById('cot-manage-presets-btn').addEventListener('click', openCotPresetManageModal);

    // 绑定重置预设按钮
    const resetBtn = document.getElementById('cot-reset-preset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetCotPreset);
    }

    // 绑定添加条目按钮
    document.getElementById('cot-add-item-btn').addEventListener('click', openAddCotItemModal);

    // 绑定条目编辑模态框按钮
    document.getElementById('cot-item-edit-form').addEventListener('submit', saveCotItem);
    document.getElementById('cot-item-cancel-btn').addEventListener('click', () => {
        document.getElementById('cot-item-edit-modal').classList.remove('visible');
    });

    // 绑定预设管理模态框按钮
    document.getElementById('cot-close-manage-modal-btn').addEventListener('click', () => {
        document.getElementById('cot-preset-manage-modal').classList.remove('visible');
        loadCotSettings(); // 刷新主界面
    });
    document.getElementById('cot-import-preset-btn').addEventListener('click', () => {
        document.getElementById('cot-import-file').click();
    });
    document.getElementById('cot-import-file').addEventListener('change', importCotPreset);

    // 初始化 XML 说明功能
    initXmlHelpFeature();
}

// 初始化 XML 说明功能
function initXmlHelpFeature() {
    // 1. 找到目标位置 (Prompt 条目序列 的标题栏)
    const labels = document.querySelectorAll('.kkt-item-label');
    let targetLabel = null;
    for (const label of labels) {
        if (label.textContent.includes('Prompt 条目序列')) {
            targetLabel = label;
            break;
        }
    }

    if (targetLabel && !targetLabel.querySelector('.cot-help-btn')) {
        // 创建问号按钮
        const helpBtn = document.createElement('button');
        helpBtn.className = 'cot-help-btn';
        helpBtn.innerHTML = '?';
        helpBtn.title = '查看 XML 标签说明';
        helpBtn.onclick = openXmlHelpModal;
        
        // 插入到 label 后面
        targetLabel.parentNode.appendChild(helpBtn);
        // 调整父元素样式以支持横向排列
        targetLabel.parentNode.style.display = 'flex';
        targetLabel.parentNode.style.justifyContent = 'space-between';
        targetLabel.parentNode.style.alignItems = 'center';
    }

    // 2. 创建模态框 (如果不存在)
    if (!document.getElementById('cot-xml-help-modal')) {
        const modalHtml = `
            <div id="cot-xml-help-modal" class="modal-overlay">
                <div class="modal-window" style="max-width: 600px; max-height: 80vh; display: flex; flex-direction: column;">
                    <h3>XML 标签说明</h3>
                    <div class="cot-xml-help-content" style="flex: 1; overflow-y: auto; padding: 10px; line-height: 1.6; color: #444;">
                        <p>默认思维链中使用了以下 XML 标签来构建 System Prompt，了解它们有助于你更好地调整预设或在思维链中快捷引用：</p>
                        
                        <div class="xml-tag-item">
              <code><char_settings></code>
              <p><strong>角色设定</strong>：包含角色设定以及世界书·后（不包含世界书·前）</p>
            </div>

            <div class="xml-tag-item">
              <code><user_settings></code>
              <p><strong>用户设定</strong>：包含你的名字以及你对自己的人设描述。</p>
            </div>

            <div class="xml-tag-item">
              <code><logic_rules></code>
              <p><strong>逻辑规则</strong>：包含各种交互逻辑的详细说明，如表情包列表、相册图片、特殊指令（转账、礼物、撤回等）的处理规则。</p>
            </div>

            <div class="xml-tag-item">
              <code><output_formats></code>
              <p><strong>输出格式</strong>：AI 回复消息的格式总规范。</p>
            </div>

            <div class="xml-tag-item">
              <code><Chatting Guidelines></code>
              <p><strong>对话指南</strong>：定义对话的节奏、回复条数限制以及风格建议。</p>
            </div>

            <div class="xml-tag-item">
              <code><thinking></code>
              <p><strong>思维链</strong>：AI 的思考过程将包裹在此标签内。这部分内容不会显示在聊天界面上，仅用于 AI 进行逻辑推演。</p>
            </div>
                    </div>
                    <div style="margin-top: 15px; text-align: right;">
                        <button class="btn btn-primary" onclick="document.getElementById('cot-xml-help-modal').classList.remove('visible')">关闭</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
}

function openXmlHelpModal() {
    document.getElementById('cot-xml-help-modal').classList.add('visible');
}

// 加载设置到界面
function loadCotSettings() {
    if (!db.cotSettings) db.cotSettings = { enabled: false, activePresetId: 'default' };
    if (!db.cotPresets || db.cotPresets.length === 0) {
        // 恢复默认预设
        db.cotPresets = [{
            id: 'default',
            name: '默认思维链',
            items: JSON.parse(JSON.stringify(DEFAULT_COT_ITEMS))
        }];
        saveData();
    } else {
        // 检查并修复旧数据的锁定状态
        const defaultPreset = db.cotPresets.find(p => p.id === 'default');
        if (defaultPreset) {
            let hasChanges = false;
            defaultPreset.items.forEach(item => {
                if ((item.id === 'cot_item_1' || item.id === 'cot_item_7') && !item.locked) {
                    item.locked = true;
                    hasChanges = true;
                }
            });
            if (hasChanges) saveData();
        }
    }

    // 确保通话预设存在
    let callPreset = db.cotPresets.find(p => p.id === 'default_call');
    if (!callPreset) {
        callPreset = {
            id: 'default_call',
            name: '默认通话思维链',
            items: JSON.parse(JSON.stringify(DEFAULT_CALL_COT_ITEMS))
        };
        db.cotPresets.push(callPreset);
        saveData();
    }

    // 确保 activeCallPresetId 存在
    if (!db.cotSettings.activeCallPresetId) {
        db.cotSettings.activeCallPresetId = 'default_call';
        saveData();
    }

    // 确保线下预设存在
    let offlinePreset = db.cotPresets.find(p => p.id === 'default_offline');
    if (!offlinePreset) {
        offlinePreset = {
            id: 'default_offline',
            name: '默认线下思维链',
            items: JSON.parse(JSON.stringify(DEFAULT_OFFLINE_COT_ITEMS))
        };
        db.cotPresets.push(offlinePreset);
        saveData();
    }

    // 确保 activeOfflinePresetId 存在
    if (!db.cotSettings.activeOfflinePresetId) {
        db.cotSettings.activeOfflinePresetId = 'default_offline';
        saveData();
    }

    // 根据当前模式设置开关状态
    const enabledSwitch = document.getElementById('cot-enabled-switch');
    if (currentCotMode === 'chat') {
        enabledSwitch.checked = db.cotSettings.enabled;
    } else if (currentCotMode === 'call') {
        enabledSwitch.checked = db.cotSettings.callEnabled || false;
    } else if (currentCotMode === 'offline') {
        enabledSwitch.checked = db.cotSettings.offlineEnabled || false;
    }
    
    // 加载角色活人运转开关状态 (默认为 false)
    const humanRunSwitch = document.getElementById('cot-human-run-switch');
    if (humanRunSwitch) {
        humanRunSwitch.checked = (db.cotSettings.humanRunEnabled !== undefined) ? db.cotSettings.humanRunEnabled : false;
    }

    renderCotPresetSelect();
    renderCotItems();
}

// 渲染预设下拉框
function renderCotPresetSelect() {
    const select = document.getElementById('cot-preset-select');
    select.innerHTML = '';
    
    db.cotPresets.forEach(preset => {
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = preset.name;
        select.appendChild(option);
    });

    // 确保选中当前激活的预设
    let activeId;
    if (currentCotMode === 'chat') {
        activeId = db.cotSettings.activePresetId;
    } else if (currentCotMode === 'call') {
        activeId = db.cotSettings.activeCallPresetId;
    } else if (currentCotMode === 'offline') {
        activeId = db.cotSettings.activeOfflinePresetId;
    }

    if (activeId) {
        // 检查 activePresetId 是否存在，不存在则默认第一个
        const exists = db.cotPresets.find(p => p.id === activeId);
        if (!exists && db.cotPresets.length > 0) {
            activeId = db.cotPresets[0].id;
            if (currentCotMode === 'chat') {
                db.cotSettings.activePresetId = activeId;
            } else if (currentCotMode === 'call') {
                db.cotSettings.activeCallPresetId = activeId;
            } else if (currentCotMode === 'offline') {
                db.cotSettings.activeOfflinePresetId = activeId;
            }
            saveData();
        }
        select.value = activeId;
    }
}

// 渲染条目列表
function renderCotItems() {
    const list = document.getElementById('cot-items-list');
    list.innerHTML = '';
    list.className = 'cot-items-container'; // 使用新 CSS 类

    let activeId;
    if (currentCotMode === 'chat') {
        activeId = db.cotSettings.activePresetId;
    } else if (currentCotMode === 'call') {
        activeId = db.cotSettings.activeCallPresetId;
    } else if (currentCotMode === 'offline') {
        activeId = db.cotSettings.activeOfflinePresetId;
    }

    const activePreset = db.cotPresets.find(p => p.id === activeId);
    if (!activePreset || !activePreset.items) return;

    activePreset.items.forEach((item, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = `cot-item-card ${item.locked ? 'locked' : ''}`;
        
        // 开关
        const switchLabel = document.createElement('label');
        switchLabel.className = 'kkt-switch kkt-switch-small';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = item.enabled;
        checkbox.addEventListener('change', async (e) => {
            item.enabled = e.target.checked;
            await saveData();
        });
        const slider = document.createElement('span');
        slider.className = 'kkt-slider';
        switchLabel.appendChild(checkbox);
        switchLabel.appendChild(slider);

        // 内容区域
        const contentDiv = document.createElement('div');
        contentDiv.className = 'cot-item-content';
        
        const nameEl = document.createElement('div');
        nameEl.className = 'cot-item-name';
        nameEl.textContent = item.name;
        
        const previewEl = document.createElement('div');
        previewEl.className = 'cot-item-preview';
        previewEl.textContent = item.content.substring(0, 50).replace(/\n/g, ' ') + (item.content.length > 50 ? '...' : '');
        
        contentDiv.appendChild(nameEl);
        contentDiv.appendChild(previewEl);

        // 按钮组
        const btnGroup = document.createElement('div');
        btnGroup.className = 'cot-btn-group';

        // 排序按钮 (锁定条目不可移动)
        if (!item.locked) {
            const upBtn = createIconBtn('↑', () => moveCotItem(index, -1));
            const downBtn = createIconBtn('↓', () => moveCotItem(index, 1));
            
            // 检查边界：如果上一个是锁定的，则不能上移；如果下一个是锁定的，则不能下移
            const prevItem = activePreset.items[index - 1];
            const nextItem = activePreset.items[index + 1];
            
            if (index === 0 || (prevItem && prevItem.locked)) upBtn.disabled = true;
            if (index === activePreset.items.length - 1 || (nextItem && nextItem.locked)) downBtn.disabled = true;
            
            btnGroup.appendChild(upBtn);
            btnGroup.appendChild(downBtn);
        }

        // 编辑按钮
        const editBtn = createIconBtn('✎', () => openEditCotItemModal(item));
        btnGroup.appendChild(editBtn);
        
        // 删除按钮 (锁定条目不可删除)
        if (!item.locked) {
            const deleteBtn = createIconBtn('×', () => deleteCotItem(index), true);
            btnGroup.appendChild(deleteBtn);
        }

        itemEl.appendChild(switchLabel);
        itemEl.appendChild(contentDiv);
        itemEl.appendChild(btnGroup);
        list.appendChild(itemEl);
    });
}

function createIconBtn(text, onClick, isDanger = false) {
    const btn = document.createElement('button');
    btn.className = `cot-icon-btn ${isDanger ? 'danger' : ''}`;
    
    // 使用 SVG 图标替代文字
    let iconSvg = '';
    if (text === '↑') iconSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg>';
    else if (text === '↓') iconSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>';
    else if (text === '✎') iconSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
    else if (text === '×') iconSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
    
    btn.innerHTML = iconSvg || text;
    btn.title = text; // Tooltip
    
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
    });
    return btn;
}

// 移动条目
async function moveCotItem(index, direction) {
    let activeId;
    if (currentCotMode === 'chat') {
        activeId = db.cotSettings.activePresetId;
    } else if (currentCotMode === 'call') {
        activeId = db.cotSettings.activeCallPresetId;
    } else if (currentCotMode === 'offline') {
        activeId = db.cotSettings.activeOfflinePresetId;
    }
    const activePreset = db.cotPresets.find(p => p.id === activeId);
    if (!activePreset) return;

    const item = activePreset.items[index];
    if (item.locked) return showToast('锁定条目无法移动');

    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= activePreset.items.length) return;

    const targetItem = activePreset.items[newIndex];
    if (targetItem.locked) return showToast('无法移动到锁定条目之外');

    const temp = activePreset.items[index];
    activePreset.items[index] = activePreset.items[newIndex];
    activePreset.items[newIndex] = temp;

    await saveData();
    renderCotItems();
}

// 删除条目
async function deleteCotItem(index) {
    let activeId;
    if (currentCotMode === 'chat') {
        activeId = db.cotSettings.activePresetId;
    } else if (currentCotMode === 'call') {
        activeId = db.cotSettings.activeCallPresetId;
    } else if (currentCotMode === 'offline') {
        activeId = db.cotSettings.activeOfflinePresetId;
    }
    const activePreset = db.cotPresets.find(p => p.id === activeId);
    if (!activePreset) return;

    const item = activePreset.items[index];
    if (item.locked) return showToast('锁定条目无法删除');

    if (!confirm('确定要删除这个条目吗？')) return;

    activePreset.items.splice(index, 1);
    await saveData();
    renderCotItems();
}

// 打开添加条目模态框
function openAddCotItemModal() {
    document.getElementById('cot-item-id').value = ''; // 空ID表示新建
    document.getElementById('cot-item-name').value = '';
    document.getElementById('cot-item-content').value = '';
    
    // 重置只读状态
    document.getElementById('cot-item-name').readOnly = false;
    document.getElementById('cot-item-content').readOnly = false;
    document.getElementById('cot-item-content').classList.remove('cot-readonly-textarea');
    
    // 显示保存按钮
    const saveBtn = document.querySelector('#cot-item-edit-form button[type="submit"]');
    if (saveBtn) saveBtn.style.display = 'block';
    
    // 移除提示
    const existingNotice = document.querySelector('.cot-lock-notice');
    if (existingNotice) existingNotice.remove();

    document.getElementById('cot-item-edit-modal').classList.add('visible');
}

// 打开编辑条目模态框
function openEditCotItemModal(item) {
    document.getElementById('cot-item-id').value = item.id;
    document.getElementById('cot-item-name').value = item.name;
    document.getElementById('cot-item-content').value = item.content;
    
    const nameInput = document.getElementById('cot-item-name');
    const contentInput = document.getElementById('cot-item-content');
    const saveBtn = document.querySelector('#cot-item-edit-form button[type="submit"]');
    const form = document.getElementById('cot-item-edit-form');
    
    // 移除旧提示
    const existingNotice = document.querySelector('.cot-lock-notice');
    if (existingNotice) existingNotice.remove();

    if (item.locked) {
        // 锁定状态：只读
        nameInput.readOnly = true;
        contentInput.readOnly = true;
        contentInput.classList.add('cot-readonly-textarea');
        if (saveBtn) saveBtn.style.display = 'none';
        
        // 添加提示
        const notice = document.createElement('div');
        notice.className = 'cot-lock-notice';
        notice.innerHTML = '🔒 此条目为核心规则，已被锁定，无法修改。';
        form.insertBefore(notice, form.firstChild);
    } else {
        // 正常状态
        nameInput.readOnly = false;
        contentInput.readOnly = false;
        contentInput.classList.remove('cot-readonly-textarea');
        if (saveBtn) saveBtn.style.display = 'block';
    }

    document.getElementById('cot-item-edit-modal').classList.add('visible');
}

// 保存条目
async function saveCotItem(e) {
    e.preventDefault();
    const id = document.getElementById('cot-item-id').value;
    const name = document.getElementById('cot-item-name').value.trim();
    const content = document.getElementById('cot-item-content').value;

    if (!name) return showToast('请输入条目名称');

    let activeId;
    if (currentCotMode === 'chat') {
        activeId = db.cotSettings.activePresetId;
    } else if (currentCotMode === 'call') {
        activeId = db.cotSettings.activeCallPresetId;
    } else if (currentCotMode === 'offline') {
        activeId = db.cotSettings.activeOfflinePresetId;
    }
    const activePreset = db.cotPresets.find(p => p.id === activeId);
    if (!activePreset) return;

    if (id) {
        // 编辑现有
        const item = activePreset.items.find(i => i.id === id);
        if (item) {
            if (item.locked) return showToast('锁定条目无法修改');
            item.name = name;
            item.content = content;
        }
    } else {
        // 新建：插入到倒数第二个位置（即尾声之前），如果存在尾声的话
        const newItem = {
            id: `cot_item_${Date.now()}`,
            name: name,
            content: content,
            enabled: true
        };
        
        // 查找最后一个锁定条目（通常是尾声）
        const lastLockedIndex = activePreset.items.map(i => i.locked).lastIndexOf(true);
        
        if (lastLockedIndex !== -1 && lastLockedIndex === activePreset.items.length - 1) {
            // 如果最后一个是锁定的，插入到它前面
            activePreset.items.splice(lastLockedIndex, 0, newItem);
        } else {
            // 否则追加到末尾
            activePreset.items.push(newItem);
        }
    }

    await saveData();
    document.getElementById('cot-item-edit-modal').classList.remove('visible');
    renderCotItems();
    showToast('条目已保存');
}

// 新建预设
async function createNewCotPreset() {
    const name = prompt('请输入新预设名称：');
    if (!name) return;

    let activeId;
    if (currentCotMode === 'chat') {
        activeId = db.cotSettings.activePresetId;
    } else if (currentCotMode === 'call') {
        activeId = db.cotSettings.activeCallPresetId;
    } else if (currentCotMode === 'offline') {
        activeId = db.cotSettings.activeOfflinePresetId;
    }
    const activePreset = db.cotPresets.find(p => p.id === activeId);
    // 复制当前预设的条目
    const newItems = activePreset ? JSON.parse(JSON.stringify(activePreset.items)) : [];
    
    const newPreset = {
        id: `cot_preset_${Date.now()}`,
        name: name,
        items: newItems
    };

    db.cotPresets.push(newPreset);
    
    if (currentCotMode === 'chat') {
        db.cotSettings.activePresetId = newPreset.id;
    } else if (currentCotMode === 'call') {
        db.cotSettings.activeCallPresetId = newPreset.id;
    } else if (currentCotMode === 'offline') {
        db.cotSettings.activeOfflinePresetId = newPreset.id;
    }
    await saveData();
    
    loadCotSettings(); // 重新加载以更新下拉框和列表
    showToast('新预设已创建');
}

// 重置当前预设
async function resetCotPreset() {
    let activeId;
    if (currentCotMode === 'chat') {
        activeId = db.cotSettings.activePresetId;
    } else if (currentCotMode === 'call') {
        activeId = db.cotSettings.activeCallPresetId;
    } else if (currentCotMode === 'offline') {
        activeId = db.cotSettings.activeOfflinePresetId;
    }
    const activePreset = db.cotPresets.find(p => p.id === activeId);
    if (!activePreset) return;

    if (!confirm(`确定要将预设“${activePreset.name}”重置为默认思维链吗？\n此操作将覆盖当前所有条目。`)) return;

    // 深度复制默认条目
    if (currentCotMode === 'chat') {
        activePreset.items = JSON.parse(JSON.stringify(DEFAULT_COT_ITEMS));
    } else if (currentCotMode === 'call') {
        activePreset.items = JSON.parse(JSON.stringify(DEFAULT_CALL_COT_ITEMS));
    } else if (currentCotMode === 'offline') {
        activePreset.items = JSON.parse(JSON.stringify(DEFAULT_OFFLINE_COT_ITEMS));
    }
    
    await saveData();
    renderCotItems();
    showToast('预设已重置为默认状态');
}

// 打开预设管理模态框
function openCotPresetManageModal() {
    const modal = document.getElementById('cot-preset-manage-modal');
    const list = document.getElementById('cot-preset-list-container');
    list.innerHTML = '';

    db.cotPresets.forEach((preset, index) => {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0f0;';
        
        let isActive = false;
        if (currentCotMode === 'chat' && preset.id === db.cotSettings.activePresetId) isActive = true;
        if (currentCotMode === 'call' && preset.id === db.cotSettings.activeCallPresetId) isActive = true;
        if (currentCotMode === 'offline' && preset.id === db.cotSettings.activeOfflinePresetId) isActive = true;

        const nameDiv = document.createElement('div');
        nameDiv.textContent = preset.name + (isActive ? ' (当前)' : '');
        nameDiv.style.fontWeight = isActive ? 'bold' : 'normal';

        const btnGroup = document.createElement('div');
        btnGroup.style.display = 'flex';
        btnGroup.style.gap = '5px';

        const renameBtn = createIconBtn('✎', async () => {
            const newName = prompt('请输入新名称：', preset.name);
            if (newName) {
                preset.name = newName;
                await saveData();
                openCotPresetManageModal(); // 刷新列表
                renderCotPresetSelect(); // 刷新主界面下拉框
            }
        });

        const exportBtn = createIconBtn('⭳', () => { // 使用下载符号
            const blob = new Blob([JSON.stringify(preset, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cot_preset_${preset.name}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });

        const deleteBtn = createIconBtn('×', async () => {
            if (db.cotPresets.length <= 1) return showToast('至少保留一个预设');
            if (!confirm(`确定要删除预设“${preset.name}”吗？`)) return;
            
            db.cotPresets.splice(index, 1);
            
            // 如果删除的是当前激活的，重置为第一个
            if (preset.id === db.cotSettings.activePresetId) {
                db.cotSettings.activePresetId = db.cotPresets[0].id;
            }
            if (preset.id === db.cotSettings.activeCallPresetId) {
                db.cotSettings.activeCallPresetId = db.cotPresets[0].id;
            }
            if (preset.id === db.cotSettings.activeOfflinePresetId) {
                db.cotSettings.activeOfflinePresetId = db.cotPresets[0].id;
            }

            await saveData();
            openCotPresetManageModal();
            loadCotSettings();
        }, true);

        btnGroup.appendChild(renameBtn);
        btnGroup.appendChild(exportBtn);
        btnGroup.appendChild(deleteBtn);

        row.appendChild(nameDiv);
        row.appendChild(btnGroup);
        list.appendChild(row);
    });

    modal.classList.add('visible');
}

// 导入预设
async function importCotPreset(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const preset = JSON.parse(text);
        
        if (!preset.items || !Array.isArray(preset.items)) {
            throw new Error('格式错误：缺少 items 数组');
        }

        preset.id = `cot_preset_${Date.now()}`; // 重新生成ID避免冲突
        preset.name = preset.name + ' (导入)';
        
        db.cotPresets.push(preset);
        
        if (currentCotMode === 'chat') {
            db.cotSettings.activePresetId = preset.id;
        } else if (currentCotMode === 'call') {
            db.cotSettings.activeCallPresetId = preset.id;
        } else if (currentCotMode === 'offline') {
            db.cotSettings.activeOfflinePresetId = preset.id;
        }
        await saveData();
        
        document.getElementById('cot-preset-manage-modal').classList.remove('visible');
        loadCotSettings();
        showToast('预设导入成功');
    } catch (err) {
        console.error(err);
        showToast('导入失败：' + err.message);
    } finally {
        e.target.value = '';
    }
}


// 暴露给全局
window.initCotSettings = initCotSettings;
