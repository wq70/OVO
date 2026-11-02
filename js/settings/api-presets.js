const saveApiPresetSettings = async (additionalKeys = []) => {
    const saved = await saveGlobalSettings([
        'apiPresets',
        ...(Array.isArray(additionalKeys) ? additionalKeys : [])
    ]);
    return saved !== false;
};

function _getApiPresets() {
    return db.apiPresets || [];
}
function _saveApiPresets(arr) {
    db.apiPresets = arr || [];
    saveApiPresetSettings();
}

function populateApiSelect() {
    const sel = document.getElementById('api-preset-select');
    if (!sel) return;
    const presets = _getApiPresets();
    sel.innerHTML = '<option value="">— 选择 API 预设 —</option>';
    presets.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    sel.appendChild(opt);
    });
}

function saveCurrentApiAsPreset() {
    const apiKeyEl = document.querySelector('#api-key');
    const apiUrlEl = document.querySelector('#api-url');
    const providerEl = document.querySelector('#api-provider');
    const modelEl = document.querySelector('#api-model');

    const data = {
        apiKey: apiKeyEl ? apiKeyEl.value : '',
        apiUrl: apiUrlEl ? apiUrlEl.value : '',
        provider: providerEl ? providerEl.value : '',
        model: modelEl ? modelEl.value : '',
        generationParams: typeof window.getMainApiGenerationParams === 'function'
            ? window.getMainApiGenerationParams()
            : (typeof db !== 'undefined' ? normalizeApiGenerationParams(db.apiSettings?.generationParams, false, db.apiSettings?.temperature) : null),
        behavior: {
            onlineRoleEnabled: document.getElementById('online-role-switch')?.checked !== false,
            timePerceptionEnabled: !!document.getElementById('time-perception-switch')?.checked,
            streamEnabled: !!document.getElementById('stream-switch')?.checked,
            quickReplyEnabled: !!document.getElementById('quick-reply-switch')?.checked,
            latestTurnProtectionEnabled: !!document.getElementById('latest-turn-protection-switch')?.checked
        }
    };
    
    let name = prompt('为该 API 预设填写名称（会覆盖同名预设）：');
    if (!name) return;
    const presets = _getApiPresets();
    const idx = presets.findIndex(p => p.name === name);
    const preset = {name: name, data: data};
    if (idx >= 0) presets[idx] = preset; else presets.push(preset);
    _saveApiPresets(presets);
    populateApiSelect();
    showToast('API 预设已保存');
}

async function applyApiPreset(name) {
    const presets = _getApiPresets();
    const p = presets.find(x => x.name === name);
    if (!p) return showToast('未找到该预设');
    try {
        const apiKeyEl = document.querySelector('#api-key');
        const apiUrlEl = document.querySelector('#api-url');
        const providerEl = document.querySelector('#api-provider');
        const modelEl = document.querySelector('#api-model');

        if (apiKeyEl && p.data && typeof p.data.apiKey !== 'undefined') apiKeyEl.value = p.data.apiKey;
        if (apiUrlEl && p.data && typeof p.data.apiUrl !== 'undefined') apiUrlEl.value = p.data.apiUrl;
        if (providerEl && p.data && typeof p.data.provider !== 'undefined') providerEl.value = p.data.provider;
        if (providerEl && typeof window.updateMainApiGenerationProtocol === 'function') window.updateMainApiGenerationProtocol(providerEl.value);
        if (modelEl && p.data && typeof p.data.model !== 'undefined') {
            modelEl.innerHTML = `<option value="${p.data.model}">${p.data.model}</option>`;
            modelEl.value = p.data.model;
        }
        if (p.data?.generationParams && typeof window.setMainApiGenerationParams === 'function') {
            window.setMainApiGenerationParams(p.data.generationParams, p.data.temperature);
        }
        if (p.data?.behavior) {
            const behaviorFields = {
                onlineRoleEnabled: 'online-role-switch', timePerceptionEnabled: 'time-perception-switch', streamEnabled: 'stream-switch',
                quickReplyEnabled: 'quick-reply-switch', latestTurnProtectionEnabled: 'latest-turn-protection-switch'
            };
            Object.entries(behaviorFields).forEach(([key, id]) => {
                const input = document.getElementById(id);
                if (input && typeof p.data.behavior[key] === 'boolean') input.checked = p.data.behavior[key];
            });
        }

        showToast('已应用 API 预设');
    } catch(e) {
        console.error('applyApiPreset error', e);
    }
}

function openApiManageModal() {
    const modal = document.getElementById('api-presets-modal');
    const list = document.getElementById('api-presets-list');
    if (!modal || !list) return;
    list.innerHTML = '';
    const presets = _getApiPresets();
    if (!presets.length) {
        list.innerHTML = '<p style="color:#888;margin:6px 0;">暂无预设</p>';
    }
    presets.forEach((p, idx) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '8px 6px';
        row.style.borderBottom = '1px solid #f6f6f6';

        const left = document.createElement('div');
        left.style.flex = '1';
        left.style.minWidth = '0';
        left.innerHTML = '<div style="font-weight:600;">'+p.name+'</div><div style="font-size:12px;color:#666;margin-top:4px;">' + (p.data && p.data.provider ? ('提供者：'+p.data.provider) : '') + '</div>';

        const btns = document.createElement('div');
        btns.style.display = 'flex';
        btns.style.gap = '6px';

        const applyBtn = document.createElement('button');
        applyBtn.className = 'btn';
        applyBtn.textContent = '应用';
        applyBtn.onclick = function(){ applyApiPreset(p.name); modal.style.display='none'; };

        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn';
        renameBtn.textContent = '重命名';
        renameBtn.onclick = function(){
            const newName = prompt('输入新名称：', p.name);
            if (!newName) return;
            const all = _getApiPresets();
            all[idx].name = newName;
            _saveApiPresets(all);
            openApiManageModal();
            populateApiSelect();
        };

        const delBtn = document.createElement('button');
        delBtn.className = 'btn';
        delBtn.textContent = '删除';
        delBtn.onclick = function(){ if(!confirm('确定删除 "'+p.name+'" ?')) return; const all=_getApiPresets(); all.splice(idx,1); _saveApiPresets(all); openApiManageModal(); populateApiSelect(); };

        btns.appendChild(applyBtn); btns.appendChild(renameBtn); btns.appendChild(delBtn);

        row.appendChild(left); row.appendChild(btns);
        list.appendChild(row);
    });
    modal.style.display = 'flex';
}

async function exportApiPresets() {
    const presets = _getApiPresets();
    const blob = new Blob([JSON.stringify(presets, null, 2)], {type: 'application/json'});
    await OvoFileDownload.save(blob, 'api_presets.json');
}
function importApiPresets() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json';
    inp.onchange = function(e){
        const f = e.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = function(){ try { const data = JSON.parse(r.result); if (Array.isArray(data)) { _saveApiPresets(data); populateApiSelect(); openApiManageModal(); } else alert('文件格式不正确'); } catch(e){ alert('导入失败：'+e.message); } };
        r.readAsText(f);
    };
    inp.click();
}

    // === 副API通用设置函数 ===
    var subApiDisplayNames = { summary: '总结', background: '后台活动', vector: '向量记忆', supplementPersona: '补齐人设', peek: '偷看手机', imageRecognition: '自动识图', stickerRecognition: '表情包识图' };
function setupSubApiSettings(prefix, dbKey, presetsKey) {
    const displayName = subApiDisplayNames[prefix] || prefix;
    const providerEl = document.getElementById(`${prefix}-api-provider`);
    const urlEl = document.getElementById(`${prefix}-api-url`);
    const keyEl = document.getElementById(`${prefix}-api-key`);
    const modelEl = document.getElementById(`${prefix}-api-model`);
    const customModelEl = document.getElementById(`${prefix}-api-model-custom`);
    const fetchBtn = document.getElementById(`${prefix}-fetch-models-btn`);
    const saveBtn = document.getElementById(`${prefix}-api-save-btn`);
    const testBtn = document.getElementById(`${prefix}-api-test-btn`);
    const testStatusEl = document.getElementById(`${prefix}-api-test-status`);
    const escapeOptionText = value => String(value || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    
    const providerUrls = {
        newapi: '',
        deepseek: 'https://api.deepseek.com',
        claude: 'https://api.anthropic.com',
        gemini: 'https://generativelanguage.googleapis.com'
    };
    if (prefix === 'vector') providerUrls.ollama = 'http://localhost:11434';

    const getModelValue = () => (customModelEl?.value || modelEl?.value || '').trim();
    const setModelValue = value => {
        const model = String(value || '').trim();
        if (customModelEl) customModelEl.value = model;
        if (modelEl && model) modelEl.innerHTML = `<option value="${escapeOptionText(model)}">${escapeOptionText(model)}</option>`;
    };
    const buildCurrentConfig = () => ({
        provider: providerEl.value,
        url: urlEl.value.trim(),
        key: keyEl.value.trim(),
        model: getModelValue()
    });
    
    // 加载保存的设置
    if (db[dbKey]) {
        providerEl.value = db[dbKey].provider || 'newapi';
        urlEl.value = db[dbKey].url || '';
        keyEl.value = db[dbKey].key || '';
        if (db[dbKey].model) {
            setModelValue(db[dbKey].model);
        }
        if (testStatusEl && db[dbKey].health?.status === 'healthy') {
            testStatusEl.dataset.dimensions = String(db[dbKey].health.dimensions || '');
            testStatusEl.dataset.profileKey = db[dbKey].health.profileKey || '';
            testStatusEl.dataset.testedAt = String(db[dbKey].health.testedAt || '');
            testStatusEl.textContent = `上次测试正常 · ${db[dbKey].health.dimensions || '未知'} 维`;
        }
    }

    const refreshVectorEndpointPreview = () => {
        if (prefix !== 'vector' || !testStatusEl || !window.VectorMemoryCore || testBtn?.classList.contains('loading')) return;
        const endpoint = window.VectorMemoryCore.buildVectorEndpoint(buildCurrentConfig(), 'embeddings');
        testStatusEl.textContent = endpoint ? `实际向量地址：${endpoint}` : '可先测试实际 Embedding，再保存配置';
    };
    const invalidateVectorTest = () => {
        if (!testStatusEl) return;
        delete testStatusEl.dataset.dimensions;
        delete testStatusEl.dataset.profileKey;
        delete testStatusEl.dataset.testedAt;
    };
    
    // 服务商切换时自动填充URL
    providerEl.addEventListener('change', () => {
        invalidateVectorTest();
        urlEl.value = providerUrls[providerEl.value] || '';
        refreshVectorEndpointPreview();
    });
    urlEl.addEventListener('input', () => { invalidateVectorTest(); refreshVectorEndpointPreview(); });
    keyEl.addEventListener('input', invalidateVectorTest);
    customModelEl?.addEventListener('input', () => { invalidateVectorTest(); refreshVectorEndpointPreview(); });
    
    // 拉取模型列表
    fetchBtn.addEventListener('click', async () => {
        const provider = providerEl.value;
        let apiUrl = urlEl.value.trim();
        const apiKey = keyEl.value.trim();
        
        const keyOptional = provider === 'ollama' || provider === 'openai-noauth';
        if (!apiUrl || (!apiKey && !keyOptional)) {
            showToast(keyOptional ? '请先填写API地址！' : '请先填写API地址和密钥！');
            return;
        }
        
        if (BLOCKED_API_DOMAINS.some(domain => apiUrl.includes(domain))) {
            showToast('该 API 站点已被屏蔽，无法使用！');
            return;
        }
        
        if (apiUrl.endsWith('/')) apiUrl = apiUrl.slice(0, -1);
        
        const endpointBase = prefix === 'vector' && window.VectorMemoryCore
            ? window.VectorMemoryCore.buildVectorEndpoint({ provider, url: apiUrl }, 'models')
            : (provider === 'gemini' ? `${apiUrl}/v1beta/models` : `${apiUrl}/v1/models`);
        const endpoint = provider === 'gemini' ? `${endpointBase}?key=${getRandomValue(apiKey)}` : endpointBase;
        
        fetchBtn.classList.add('loading');
        fetchBtn.disabled = true;
        
        try {
            const headers = provider === 'gemini' || keyOptional ? {} : { Authorization: `Bearer ${apiKey}` };
            const response = await fetch(endpoint, { method: 'GET', headers });
            
            if (!response.ok) {
                throw new Error(`网络响应错误: ${response.status}`);
            }
            
            const data = await response.json();
            let models = [];
            
            if (provider === 'ollama' && Array.isArray(data.models)) {
                models = data.models.map(item => item.name || item.model).filter(Boolean);
            } else if (provider !== 'gemini' && data.data) {
                models = data.data.map(e => e.id);
            } else if (provider === 'gemini' && data.models) {
                models = data.models
                    .filter(item => !Array.isArray(item.supportedGenerationMethods) || item.supportedGenerationMethods.includes('embedContent'))
                    .map(e => e.name.replace('models/', ''));
            }
            
            modelEl.innerHTML = '';
            if (models.length > 0) {
                invalidateVectorTest();
                models.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m;
                    opt.textContent = m;
                    modelEl.appendChild(opt);
                });
                if (customModelEl && !customModelEl.value) customModelEl.value = models[0];
                showToast('模型列表拉取成功！');
            } else {
                modelEl.innerHTML = '<option value="">未找到任何模型</option>';
                showToast('未找到任何模型');
            }
        } catch (err) {
            console.error(err);
            showApiError(err);
            modelEl.innerHTML = '<option value="">拉取失败</option>';
        } finally {
            fetchBtn.classList.remove('loading');
            fetchBtn.disabled = false;
        }
    });

    modelEl?.addEventListener('change', () => {
        invalidateVectorTest();
        if (customModelEl && modelEl.value) customModelEl.value = modelEl.value;
        refreshVectorEndpointPreview();
    });

    testBtn?.addEventListener('click', async () => {
        if (typeof window.testVectorApiConfiguration !== 'function') {
            showToast('向量测试能力未加载');
            return;
        }
        const config = buildCurrentConfig();
        const keyOptional = config.provider === 'ollama' || config.provider === 'openai-noauth';
        if (!config.url || !config.model || (!config.key && !keyOptional)) {
            showToast('请先填写完整的向量 API 地址、模型和密钥');
            return;
        }
        testBtn.disabled = true;
        testBtn.classList.add('loading');
        if (testStatusEl) testStatusEl.textContent = '正在发送实际 Embedding 测试…';
        try {
            const result = await window.testVectorApiConfiguration(config);
            if (testStatusEl) {
                testStatusEl.dataset.dimensions = String(result.dimensions);
                testStatusEl.dataset.profileKey = result.profileKey || '';
                testStatusEl.dataset.testedAt = String(Date.now());
            }
            if (testStatusEl) testStatusEl.textContent = `连接正常 · ${result.dimensions} 维 · ${result.latencyMs}ms`;
            showToast('向量 API 测试成功');
        } catch (error) {
            if (testStatusEl) testStatusEl.textContent = `测试失败：${error.message || '未知错误'}`;
            if (typeof showApiError === 'function') showApiError(error);
            else showToast(error.message || '向量 API 测试失败');
        } finally {
            testBtn.disabled = false;
            testBtn.classList.remove('loading');
        }
    });
    
    // 保存设置
    saveBtn.addEventListener('click', async () => {
        const modelValue = getModelValue();
        if (!modelValue && (urlEl.value.trim() || keyEl.value.trim())) {
            showToast('请选择模型后保存！');
            return;
        }
        
        if (BLOCKED_API_DOMAINS.some(domain => urlEl.value.includes(domain))) {
            showToast('该 API 站点已被屏蔽，无法保存！');
            return;
        }
        
        // 如果全部为空，则清空设置
        if (!urlEl.value.trim() && !keyEl.value.trim() && !modelValue) {
            db[dbKey] = {};
            if (!await saveApiPresetSettings([dbKey, presetsKey])) return;
            showToast(displayName + 'API设置已清空！');
            return;
        }
        
        const previousConfig = db[dbKey] || {};
        const configUnchanged = previousConfig.provider === providerEl.value
            && previousConfig.url === urlEl.value
            && previousConfig.key === keyEl.value
            && previousConfig.model === modelValue;
        db[dbKey] = {
            ...previousConfig,
            provider: providerEl.value,
            url: urlEl.value,
            key: keyEl.value,
            model: modelValue,
            health: testStatusEl?.dataset.dimensions ? {
                status: 'healthy',
                dimensions: Number(testStatusEl.dataset.dimensions),
                profileKey: testStatusEl.dataset.profileKey || '',
                testedAt: Number(testStatusEl.dataset.testedAt) || Date.now()
            } : (configUnchanged ? previousConfig.health || null : null)
        };
        if (!await saveApiPresetSettings([dbKey, presetsKey])) return;
        showToast(displayName + 'API设置已保存！');
    });
    
    // 预设管理
    setupSubApiPresets(prefix, dbKey, presetsKey);
}

// === 副API预设管理 ===
function setupSubApiPresets(prefix, dbKey, presetsKey) {
    const presetSelect = document.getElementById(`${prefix}-api-preset-select`);
    const applyBtn = document.getElementById(`${prefix}-api-apply-preset`);
    const savePresetBtn = document.getElementById(`${prefix}-api-save-preset`);
    const manageBtn = document.getElementById(`${prefix}-api-manage-presets`);
    const importBtn = document.getElementById(`${prefix}-api-import-presets`);
    const exportBtn = document.getElementById(`${prefix}-api-export-presets`);
    const modal = document.getElementById(`${prefix}-api-presets-modal`);
    const closeModalBtn = document.getElementById(`${prefix}-api-close-modal`);
    const presetsList = document.getElementById(`${prefix}-api-presets-list`);
    
    // 填充预设列表
    function populatePresets() {
        const presets = db[presetsKey] || [];
        if (presetSelect) presetSelect.innerHTML = '<option value="">— 选择 —</option>';
        presets.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.name;
            opt.textContent = p.name;
            if (presetSelect) presetSelect.appendChild(opt);
        });
    }
    
    populatePresets();
    
    // 应用预设
    applyBtn?.addEventListener('click', async () => {
        const name = presetSelect ? presetSelect.value : '';
        if (!name) return showToast('请选择预设');
        
        const presets = db[presetsKey] || [];
        const preset = presets.find(p => p.name === name);
        if (!preset) return showToast('未找到该预设');
        
        try {
            const providerEl = document.getElementById(`${prefix}-api-provider`);
            const urlEl = document.getElementById(`${prefix}-api-url`);
            const keyEl = document.getElementById(`${prefix}-api-key`);
            const modelEl = document.getElementById(`${prefix}-api-model`);
            const customModelEl = document.getElementById(`${prefix}-api-model-custom`);
            
            if (providerEl && preset.data.provider) providerEl.value = preset.data.provider;
            if (urlEl && preset.data.apiUrl) urlEl.value = preset.data.apiUrl;
            if (keyEl && preset.data.apiKey) keyEl.value = preset.data.apiKey;
            if (modelEl && preset.data.model) {
                modelEl.innerHTML = `<option value="${preset.data.model}">${preset.data.model}</option>`;
            }
            if (customModelEl && preset.data.model) customModelEl.value = preset.data.model;
            
            showToast('预设已应用到表单！');
        } catch (err) {
            console.error(err);
            showToast('应用预设失败');
        }
    });
    
    // 另存为预设
    savePresetBtn?.addEventListener('click', async () => {
        const providerEl = document.getElementById(`${prefix}-api-provider`);
        const urlEl = document.getElementById(`${prefix}-api-url`);
        const keyEl = document.getElementById(`${prefix}-api-key`);
        const modelEl = document.getElementById(`${prefix}-api-model`);
        const customModelEl = document.getElementById(`${prefix}-api-model-custom`);
        
        const data = {
            provider: providerEl ? providerEl.value : '',
            apiUrl: urlEl ? urlEl.value : '',
            apiKey: keyEl ? keyEl.value : '',
            model: customModelEl?.value || (modelEl ? modelEl.value : '')
        };
        
        let name = prompt('为该预设填写名称（会覆盖同名预设）：');
        if (!name) return;
        
        const presets = db[presetsKey] || [];
        const idx = presets.findIndex(p => p.name === name);
        const preset = { name: name, data: data };
        
        if (idx >= 0) presets[idx] = preset;
        else presets.push(preset);
        
        db[presetsKey] = presets;
        if (!await saveApiPresetSettings([dbKey, presetsKey])) return;
        populatePresets();
        showToast('预设已保存');
    });
    
    // 管理预设
    manageBtn?.addEventListener('click', () => {
        renderPresetsList();
        if (modal) modal.style.display = 'flex';
    });
    
    function renderPresetsList() {
        const presets = db[presetsKey] || [];
        presetsList.innerHTML = '';
        
        if (presets.length === 0) {
            presetsList.innerHTML = '<p style="text-align:center;color:#999;">暂无预设</p>';
            return;
        }
        
        presets.forEach((preset, idx) => {
            const div = document.createElement('div');
            div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px;margin-bottom:6px;border:1px solid #e0e0e0;border-radius:6px;background:#fafafa;';
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = preset.name;
            nameSpan.style.cssText = 'flex:1;font-weight:500;';
            
            const delBtn = document.createElement('button');
            delBtn.textContent = '删除';
            delBtn.className = 'btn btn-small';
            delBtn.style.cssText = 'background:#ff4444;color:white;padding:4px 12px;';
            delBtn.onclick = async () => {
                if (confirm(`确定删除预设"${preset.name}"吗？`)) {
                    presets.splice(idx, 1);
                    db[presetsKey] = presets;
                    if (!await saveApiPresetSettings([dbKey, presetsKey])) return;
                    renderPresetsList();
                    populatePresets();
                    showToast('预设已删除');
                }
            };
            
            div.appendChild(nameSpan);
            div.appendChild(delBtn);
            if (presetsList) presetsList.appendChild(div);
        });
    }
    
    closeModalBtn?.addEventListener('click', () => {
        if (modal) modal.style.display = 'none';
    });
    
    // 导入预设
    importBtn?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const imported = JSON.parse(text);
                
                if (!Array.isArray(imported)) {
                    showToast('文件格式错误');
                    return;
                }
                
                db[presetsKey] = db[presetsKey] || [];
                imported.forEach(preset => {
                    const idx = db[presetsKey].findIndex(p => p.name === preset.name);
                    if (idx >= 0) db[presetsKey][idx] = preset;
                    else db[presetsKey].push(preset);
                });
                
                if (!await saveApiPresetSettings([dbKey, presetsKey])) return;
                populatePresets();
                showToast('预设已导入');
            } catch (err) {
                console.error(err);
                showToast('导入失败，请检查文件格式');
            }
        };
        input.click();
    });
    
    // 导出预设
    exportBtn?.addEventListener('click', async () => {
        const presets = db[presetsKey] || [];
        if (presets.length === 0) {
            showToast('暂无预设可导出');
            return;
        }
        
        const json = JSON.stringify(presets, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        await OvoFileDownload.save(blob, `${prefix}_api_presets_${Date.now()}.json`);

    });
}

// === NovelAI 生图 API 设置 ===
// === GPT 生图 API 设置 ===
