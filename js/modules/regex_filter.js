// --- Regex Filter Module (正则过滤) ---

// 初始化正则过滤模块
function initRegexFilter() {
    // 绑定管理界面按钮
    const addBtn = document.getElementById('add-regex-preset-btn');
    if (addBtn) addBtn.addEventListener('click', () => openRegexFilterEditor());

    const saveBtn = document.getElementById('save-regex-preset-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveRegexFilterPreset);

    const importBtn = document.getElementById('import-regex-preset-btn');
    if (importBtn) importBtn.addEventListener('click', () => document.getElementById('regex-preset-import-input').click());

    const importInput = document.getElementById('regex-preset-import-input');
    if (importInput) importInput.addEventListener('change', importRegexFilterPreset);

    const addRuleBtn = document.getElementById('rf-add-rule-btn');
    if (addRuleBtn) addRuleBtn.addEventListener('click', () => addRegexRuleRow());

    // 测试区实时预览
    const testInput = document.getElementById('rf-test-input');
    if (testInput) testInput.addEventListener('input', updateRegexFilterPreview);

    // 角色设置中的正则过滤开关
    const regexFilterSwitch = document.getElementById('setting-regex-filter-enabled');
    if (regexFilterSwitch) {
        regexFilterSwitch.addEventListener('change', (e) => {
            if (typeof triggerHapticFeedback === 'function') triggerHapticFeedback('light');
            const container = document.getElementById('regex-filter-settings-container');
            if (container) {
                if (e.target.checked) {
                    container.style.maxHeight = '5000px';
                    container.style.paddingBottom = '20px';
                } else {
                    container.style.maxHeight = '0';
                    container.style.paddingBottom = '0';
                }
            }
        });
    }
}

// 打开正则过滤管理界面
function openRegexFilterManager() {
    renderRegexFilterManager();
    switchScreen('regex-filter-manager-screen');
}

// 渲染正则过滤预设列表
function renderRegexFilterManager() {
    const listContainer = document.getElementById('regex-filter-preset-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const presets = db.regexFilterPresets || [];

    if (presets.length === 0) {
        listContainer.innerHTML = '<div class="placeholder-text" style="grid-column:1/-1;">暂无正则方案，点击右上角"+"添加</div>';
        return;
    }

    presets.forEach(preset => {
        const div = document.createElement('div');
        div.className = 'preset-card';
        div.onclick = (e) => {
            if (e.target.closest('.preset-action-btn')) return;
            openRegexFilterEditor(preset.id);
        };

        const boundNames = getBoundCharNames(preset.boundCharIds);
        const rulesCount = (preset.rules || []).length;

        div.innerHTML = `
            <div class="preset-info-col">
                <div class="preset-name">${escapeHtml(preset.name)}</div>
                <div class="preset-desc">${rulesCount} 条规则 · 绑定: ${boundNames || '无'}</div>
            </div>
            <div class="preset-actions-col">
                <button class="preset-action-btn" onclick="exportRegexFilterPreset('${preset.id}')" title="导出">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                </button>
                <button class="preset-action-btn delete" onclick="deleteRegexFilterPreset('${preset.id}', event)" title="删除">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        `;
        listContainer.appendChild(div);
    });
}

// 获取绑定角色名称
function getBoundCharNames(charIds) {
    if (!charIds || charIds.length === 0) return '';
    return charIds.map(id => {
        const c = db.characters.find(ch => ch.id === id);
        return c ? c.remarkName : '未知';
    }).join(', ');
}

// 打开正则过滤编辑器
window.openRegexFilterEditor = function(presetId = null) {
    const title = document.getElementById('regex-filter-editor-title');
    const nameInput = document.getElementById('rf-preset-name');
    const idInput = document.getElementById('rf-preset-id');
    const rulesList = document.getElementById('rf-rules-list');
    const testInput = document.getElementById('rf-test-input');
    const charBindList = document.getElementById('rf-char-bind-list');

    rulesList.innerHTML = '';

    if (presetId) {
        const preset = (db.regexFilterPresets || []).find(p => p.id === presetId);
        if (preset) {
            title.textContent = '编辑正则方案';
            nameInput.value = preset.name;
            idInput.value = preset.id;
            (preset.rules || []).forEach(rule => addRegexRuleRow(rule));
        }
    } else {
        title.textContent = '新建正则方案';
        nameInput.value = '';
        idInput.value = '';
        addRegexRuleRow(); // 默认添加一条空规则
    }

    testInput.value = '';
    document.getElementById('rf-preview-container').innerHTML = '<span style="color:#ccc;">请输入测试文本...</span>';

    // 渲染角色绑定列表
    renderCharBindList(charBindList, presetId);

    switchScreen('regex-filter-editor-screen');
};

// 添加一条规则行
function addRegexRuleRow(rule = null) {
    const rulesList = document.getElementById('rf-rules-list');
    const row = document.createElement('div');
    row.className = 'rf-rule-row';
    row.innerHTML = `
        <div style="display:flex; gap:8px; align-items:center;">
            <input type="text" class="rf-rule-pattern code-input" placeholder="正则表达式，如：确实如此|不得不说" value="${rule ? escapeHtml(rule.pattern) : ''}" style="flex:1;">
            <button type="button" class="preset-action-btn delete rf-remove-rule-btn" title="删除规则">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
        </div>
        <input type="text" class="rf-rule-replace" placeholder="替换为（留空则删除匹配内容）" value="${rule ? escapeHtml(rule.replace || '') : ''}" style="width:100%; margin-top:5px;">
    `;
    row.querySelector('.rf-remove-rule-btn').addEventListener('click', () => {
        row.remove();
        updateRegexFilterPreview();
    });
    row.querySelectorAll('input').forEach(inp => inp.addEventListener('input', updateRegexFilterPreview));
    rulesList.appendChild(row);
}

// 渲染角色绑定多选列表
function renderCharBindList(container, presetId) {
    container.innerHTML = '';
    const preset = presetId ? (db.regexFilterPresets || []).find(p => p.id === presetId) : null;
    const boundIds = preset ? (preset.boundCharIds || []) : [];

    db.characters.forEach(c => {
        const tag = document.createElement('div');
        tag.className = 'sticker-group-tag' + (boundIds.includes(c.id) ? ' selected' : '');
        tag.textContent = c.remarkName;
        tag.dataset.charId = c.id;
        tag.addEventListener('click', () => tag.classList.toggle('selected'));
        container.appendChild(tag);
    });
}

// 收集当前编辑器中的规则
function collectRulesFromEditor() {
    const rows = document.querySelectorAll('#rf-rules-list .rf-rule-row');
    const rules = [];
    rows.forEach(row => {
        const pattern = row.querySelector('.rf-rule-pattern').value.trim();
        const replace = row.querySelector('.rf-rule-replace').value;
        if (pattern) {
            rules.push({ pattern, replace });
        }
    });
    return rules;
}

// 收集绑定的角色ID
function collectBoundCharIds() {
    return Array.from(document.querySelectorAll('#rf-char-bind-list .sticker-group-tag.selected'))
        .map(tag => tag.dataset.charId);
}

// 更新测试预览
function updateRegexFilterPreview() {
    const testText = document.getElementById('rf-test-input').value;
    const previewContainer = document.getElementById('rf-preview-container');

    if (!testText) {
        previewContainer.innerHTML = '<span style="color:#ccc;">请输入测试文本...</span>';
        return;
    }

    const rules = collectRulesFromEditor();
    let result = testText;

    for (const rule of rules) {
        try {
            const regex = new RegExp(rule.pattern, 'g');
            result = result.replace(regex, rule.replace);
        } catch (e) {
            previewContainer.innerHTML = `<span style="color:red;">正则错误: ${e.message}</span>`;
            return;
        }
    }

    // 清理多余空行
    result = result.replace(/\n{3,}/g, '\n\n').trim();
    previewContainer.textContent = result || '（过滤后为空）';
}

// 保存正则过滤预设
async function saveRegexFilterPreset() {
    const id = document.getElementById('rf-preset-id').value;
    const name = document.getElementById('rf-preset-name').value.trim();
    const rules = collectRulesFromEditor();
    const boundCharIds = collectBoundCharIds();

    if (!name) {
        showToast('请输入方案名称');
        return;
    }

    if (rules.length === 0) {
        showToast('请至少添加一条规则');
        return;
    }

    // 校验所有正则有效性
    for (const rule of rules) {
        try {
            new RegExp(rule.pattern);
        } catch (e) {
            showToast(`正则表达式无效: ${rule.pattern}`);
            return;
        }
    }

    if (!db.regexFilterPresets) db.regexFilterPresets = [];

    if (id) {
        const index = db.regexFilterPresets.findIndex(p => p.id === id);
        if (index !== -1) {
            db.regexFilterPresets[index] = { id, name, rules, boundCharIds };
        }
    } else {
        db.regexFilterPresets.push({
            id: Date.now().toString(),
            name,
            rules,
            boundCharIds
        });
    }

    await saveData();
    showToast('方案已保存');
    openRegexFilterManager();
}

// 删除预设
window.deleteRegexFilterPreset = async function(presetId, event) {
    event.stopPropagation();
    if (confirm('确定要删除这个正则方案吗？')) {
        db.regexFilterPresets = (db.regexFilterPresets || []).filter(p => p.id !== presetId);
        await saveData();
        renderRegexFilterManager();
        showToast('方案已删除');
    }
};

// 导出预设
window.exportRegexFilterPreset = function(presetId) {
    const preset = (db.regexFilterPresets || []).find(p => p.id === presetId);
    if (!preset) return;
    const data = JSON.stringify(preset, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `regex_filter_${preset.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
};

// 导入预设
function importRegexFilterPreset(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(event) {
        try {
            const preset = JSON.parse(event.target.result);
            if (!preset.name || !preset.rules) {
                showToast('无效的正则方案文件');
                return;
            }
            if (!db.regexFilterPresets) db.regexFilterPresets = [];
            preset.id = Date.now().toString();
            if (!preset.boundCharIds) preset.boundCharIds = [];
            db.regexFilterPresets.push(preset);
            await saveData();
            renderRegexFilterManager();
            showToast('导入成功');
        } catch (err) {
            showToast('导入失败: ' + err.message);
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// 填充角色设置中的正则预设下拉框
function populateRegexFilterPresetSelect() {
    const select = document.getElementById('setting-regex-filter-preset-select');
    if (!select) return;

    select.innerHTML = '<option value="">-- 选择正则预设 --</option>';
    const presets = db.regexFilterPresets || [];

    presets.forEach(preset => {
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = `${preset.name} (${preset.rules.length}条规则)`;
        select.appendChild(option);
    });

    select.onchange = function() {
        const presetId = this.value;
        if (!presetId) return;
        const preset = (db.regexFilterPresets || []).find(p => p.id === presetId);
        if (preset) {
            const rulesText = preset.rules.map(r => r.replace ? `${r.pattern}|||${r.replace}` : r.pattern).join('\n');
            document.getElementById('setting-regex-filter-rules').value = rulesText;
            showToast('已填充预设规则');
        }
    };
}

// === 核心：应用正则过滤到消息内容 ===
function applyRegexFilter(content, charId) {
    if (!content || !charId) return content;

    const char = db.characters.find(c => c.id === charId);
    if (!char) return content;

    let result = content;

    // 1. 应用全局绑定的正则方案
    const presets = db.regexFilterPresets || [];
    for (const preset of presets) {
        if (preset.boundCharIds && preset.boundCharIds.includes(charId)) {
            result = applyRules(result, preset.rules);
        }
    }

    // 2. 应用角色自身的正则过滤规则
    if (char.regexFilter && char.regexFilter.enabled && char.regexFilter.rules) {
        result = applyRules(result, char.regexFilter.rules);
    }

    return result.replace(/\n{3,}/g, '\n\n').trim();
}

// 应用规则列表
function applyRules(content, rules) {
    if (!rules || rules.length === 0) return content;
    let result = content;
    for (const rule of rules) {
        try {
            const regex = new RegExp(rule.pattern, 'g');
            result = result.replace(regex, rule.replace || '');
        } catch (e) {
            console.error('正则过滤规则错误:', rule.pattern, e);
        }
    }
    return result;
}

// 解析角色设置中的规则文本为规则数组
function parseRegexFilterRulesText(text) {
    if (!text || !text.trim()) return [];
    return text.split('\n').filter(line => line.trim()).map(line => {
        const parts = line.split('|||');
        return {
            pattern: parts[0].trim(),
            replace: parts.length > 1 ? parts[1] : ''
        };
    }).filter(r => r.pattern);
}
