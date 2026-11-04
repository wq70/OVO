const saveTTSGlobalSettings = () => saveGlobalSettings(['ttsPresets']);

function saveCurrentTTSAsPreset() {
    const name = prompt('请输入 TTS 预设名称：');
    if (!name || !name.trim()) return;
    
    const enabled = document.getElementById('minimax-tts-enabled')?.checked || false;
    const groupId = document.getElementById('minimax-group-id')?.value || '';
    const apiKey = document.getElementById('minimax-api-key')?.value || '';
    const domain = document.getElementById('minimax-domain')?.value || 'api.minimax.cn';
    const model = document.getElementById('minimax-tts-model')?.value || 'speech-2.8-hd';
    const provider = document.getElementById('tts-provider')?.value || 'minimax';
    const volc = typeof TTSSettings !== 'undefined' ? TTSSettings.readVolcengineFields('char') : {};
    const eleven = typeof TTSSettings !== 'undefined' ? TTSSettings.readElevenFields('char') : {};
    
    if (!db.ttsPresets) db.ttsPresets = [];
    
    db.ttsPresets.push({
        name: name.trim(),
        provider,
        enabled,
        groupId,
        apiKey,
        domain,
        model,
        ...volc,
        ...eleven
    });
    
    saveTTSGlobalSettings();
    showToast('TTS 预设已保存');
    populateTTSPresetSelect();
}

function applyTTSPreset(name) {
    if (!db.ttsPresets) return;
    const preset = db.ttsPresets.find(p => p.name === name);
    if (!preset) return showToast('预设不存在');
    
    document.getElementById('minimax-tts-enabled').checked = preset.enabled || false;
    document.getElementById('minimax-group-id').value = preset.groupId || '';
    document.getElementById('minimax-api-key').value = preset.apiKey || '';
    TTSSettings.setSelectValue(document.getElementById('minimax-domain'), preset.domain || 'api.minimax.cn');
    document.getElementById('minimax-tts-model').value = preset.model || 'speech-2.8-hd';
    const provider = preset.provider || 'minimax';
    const providerSelect = document.getElementById('tts-provider');
    if (providerSelect) providerSelect.value = provider;
    if (typeof TTSSettings !== 'undefined') {
        TTSSettings.loadVolcengineFields('char', preset);
        TTSSettings.loadElevenFields('char', preset);
        TTSSettings.toggleProviderConfig('char', provider);
    }
    
    showToast(`已应用 TTS 预设：${name}`);
}

function populateTTSPresetSelect() {
    const select = document.getElementById('tts-preset-select');
    if (!select) return;
    select.innerHTML = '<option value="">— 选择 —</option>';
    (db.ttsPresets || []).forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        select.appendChild(opt);
    });
}

function openTTSManageModal() {
    const modal = document.getElementById('tts-presets-modal');
    const list = document.getElementById('tts-presets-list');
    if (!modal || !list) return;
    list.innerHTML = '';
    const presets = db.ttsPresets || [];
    if (!presets.length) list.innerHTML = '<p style="color:#888;margin:6px 0;">暂无预设</p>';
    
    presets.forEach((p, idx) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '8px 0';
        row.style.borderBottom = '1px solid #f0f0f0';
        
        const nameDiv = document.createElement('div');
        nameDiv.style.flex = '1';
        nameDiv.textContent = p.name;
        row.appendChild(nameDiv);

        const btnWrap = document.createElement('div');
        btnWrap.style.display = 'flex';
        btnWrap.style.gap = '6px';

        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn';
        renameBtn.style.padding = '6px 8px';
        renameBtn.textContent = '重命名';
        renameBtn.onclick = function() {
            const newName = prompt('输入新名称：', p.name);
            if (!newName || newName === p.name) return;
            db.ttsPresets[idx].name = newName;
            saveTTSGlobalSettings();
            openTTSManageModal();
            populateTTSPresetSelect();
        };

        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-danger';
        delBtn.style.padding = '6px 8px';
        delBtn.textContent = '删除';
        delBtn.onclick = function() {
            if (!confirm('确定删除预设 "' + p.name + '" ?')) return;
            db.ttsPresets.splice(idx, 1);
            saveTTSGlobalSettings();
            openTTSManageModal();
            populateTTSPresetSelect();
        };

        btnWrap.appendChild(renameBtn);
        btnWrap.appendChild(delBtn);
        row.appendChild(btnWrap);
        list.appendChild(row);
    });
    modal.style.display = 'flex';
}

function importTTSPresets() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const imported = JSON.parse(text);
            if (!Array.isArray(imported)) throw new Error('格式错误');
            db.ttsPresets = db.ttsPresets || [];
            db.ttsPresets.push(...imported);
            await saveTTSGlobalSettings();
            populateTTSPresetSelect();
            showToast(`已导入 ${imported.length} 个 TTS 预设`);
        } catch (err) {
            showToast('导入失败: ' + err.message);
        }
    };
    input.click();
}

async function exportTTSPresets() {
    const presets = db.ttsPresets || [];
    if (!presets.length) return showToast('没有可导出的 TTS 预设');
    const safePresets = presets.map(({ apiKey, volcAccessToken, elevenApiKey, ...preset }) => ({ ...preset, apiKey: '', volcAccessToken: '', elevenApiKey: '' }));
    const blob = new Blob([JSON.stringify(safePresets, null, 2)], { type: 'application/json' });
    await OvoFileDownload.save(blob, 'tts_presets_' + Date.now() + '.json');

}

// 在页面加载时填充 TTS 预设列表，并绑定气泡样式「导入文档」（委托到 document，因按钮在 chat/group-settings-form 内）
document.addEventListener('DOMContentLoaded', () => {
    populateTTSPresetSelect();

    document.addEventListener('click', (e) => {
        if (e.target.matches('#bubble-css-import-doc-btn')) {
            const el = document.getElementById('bubble-css-import-file');
            if (el) el.click();
        } else if (e.target.matches('#group-bubble-css-import-doc-btn')) {
            const el = document.getElementById('group-bubble-css-import-file');
            if (el) el.click();
        }
    });
    document.addEventListener('change', async (e) => {
        if (e.target.id === 'bubble-css-import-file' || e.target.id === 'group-bubble-css-import-file') {
            const file = e.target.files && e.target.files[0];
            e.target.value = '';
            const textareaId = e.target.id === 'bubble-css-import-file' ? 'setting-custom-bubble-css' : 'setting-group-custom-bubble-css';
            if (!file) return;
            const ext = (file.name.split('.').pop() || '').toLowerCase();
            const textarea = document.getElementById(textareaId);
            if (!textarea) return;
            try {
                let content = '';
                if (ext === 'txt') {
                    content = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (ev) => resolve(ev.target.result || '');
                        reader.onerror = () => reject(new Error('读取TXT失败'));
                        reader.readAsText(file, 'UTF-8');
                    });
                } else if (ext === 'docx') {
                    if (typeof mammoth === 'undefined') {
                        showToast('mammoth.js 未加载，无法解析 DOCX');
                        return;
                    }
                    content = await parseDocxFile(file);
                } else {
                    showToast('仅支持 .txt 或 .docx 文件');
                    return;
                }
                textarea.value = (content || '').trim();
                showToast('已导入文档内容');
            } catch (err) {
                console.error('导入文档失败', err);
                showToast('导入失败：' + (err.message || '未知错误'));
            }
        }
    });
});


// 备份提示
function promptForBackupIfNeeded(triggerType) {
    if (triggerType === 'history_milestone') {
        showToast('uwu提醒您：记得备份噢');
    }
}
