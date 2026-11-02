const saveMagicRoomSettings = () => saveGlobalSettings(['magicRoom']);

function setupMagicRoomApp() {
    const app = document.getElementById('magic-room-screen');
    if (!app) return;

    // Keep every panel mounted so switching categories never discards unsaved edits.
    const navigation = app.querySelector('.magic-room-nav');
    if (navigation && navigation.dataset.ready !== 'true') {
        navigation.dataset.ready = 'true';
        const tabs = [...navigation.querySelectorAll('[data-magic-room-tab]')];
        const panels = [...app.querySelectorAll('[data-magic-room-panel]')];
        const selectTab = tab => {
            tabs.forEach(button => {
                const selected = button === tab;
                button.classList.toggle('active', selected);
                button.setAttribute('aria-selected', String(selected));
                button.tabIndex = selected ? 0 : -1;
            });
            panels.forEach(panel => { panel.hidden = panel.dataset.magicRoomPanel !== tab.dataset.magicRoomTab; });
        };
        navigation.addEventListener('click', event => {
            const tab = event.target.closest('[data-magic-room-tab]');
            if (tabs.includes(tab)) selectTab(tab);
        });
        navigation.addEventListener('keydown', event => {
            const current = tabs.indexOf(event.target);
            if (current < 0) return;
            let next;
            if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
            else if (event.key === 'ArrowLeft') next = (current + tabs.length - 1) % tabs.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = tabs.length - 1;
            else return;
            event.preventDefault();
            selectTab(tabs[next]);
            tabs[next].focus();
        });
    }

    const enabledSwitch = document.getElementById('magic-room-custom-prompt-enabled');
    const editorSection = document.getElementById('magic-room-prompt-editor');
    const promptTextarea = document.getElementById('magic-room-custom-prompt');
    const saveBtn = document.getElementById('magic-room-save-btn');
    const resetBtn = document.getElementById('magic-room-reset-prompt-btn');
    const importBtn = document.getElementById('magic-room-import-btn');
    const exportBtn = document.getElementById('magic-room-export-btn');
    const importInput = document.getElementById('magic-room-import-input');
    const promptStudioUi = typeof setupPromptStudioEditor === 'function' ? setupPromptStudioEditor() : null;
    const promptPresetIdsMigrated = window.PromptStudio ? window.PromptStudio.ensurePresetIds(db.magicRoom) : false;
    const momentsPromptUi = typeof setupMomentsPromptEditor === 'function' ? setupMomentsPromptEditor() : null;
    if (promptPresetIdsMigrated) saveMagicRoomSettings();

    // 默认底层提示词模板
    const defaultTemplate = `你正在一个名为“404”的线上聊天软件中扮演一个角色。请严格遵守以下规则：
核心规则：
A. 当前时间：现在是 {{当前时间}}。你应知晓当前时间，但除非对话内容明确相关，否则不要主动提及或评论时间（例如，不要催促我睡觉）。
{{角色时间年龄通知}}
B. 纯线上互动：这是一个完全虚拟的线上聊天。你扮演的角色和我之间没有任何线下关系。严禁提出任何关于线下见面、现实世界互动或转为其他非本平台联系方式的建议。你必须始终保持在线角色的身份。

角色和对话规则：
{{世界书_前}}
{{世界书_中}}
<char_settings>
1. 你的角色名是：{{角色名}}。我的称呼是：{{用户称呼}}。你的当前状态是：{{角色状态}}。
2. 你的角色设定是：{{角色人设}}
3. 在对话中可根据与用户的互动逐步丰富、补充你的人设（用户可在设置中查看并编辑「已补齐的人设」）。
{{世界书_后}}
</char_settings>

<user_settings>
3. 关于我的人设：{{用户人设}}
{{用户时间年龄通知}}
</user_settings>

<memoir>
{{共同回忆}}
</memoir>

<logic_rules>
{{在线逻辑规则}}
</logic_rules>

<output_formats>
16. 你的输出格式必须严格遵循以下格式：
{{输出格式}}
</output_formats>`;

    // Load initial settings
    if (db.magicRoom) {
        enabledSwitch.checked = db.magicRoom.customPromptEnabled || false;
        if (db.magicRoom.customPromptTemplate) {
            promptTextarea.value = db.magicRoom.customPromptTemplate;
        } else {
            promptTextarea.value = defaultTemplate;
        }
        editorSection.style.display = enabledSwitch.checked ? 'block' : 'none';
    }

    enabledSwitch.addEventListener('change', () => {
        editorSection.style.display = enabledSwitch.checked ? 'block' : 'none';
    });

    resetBtn.addEventListener('click', () => {
        if (confirm('确定要恢复默认模板吗？当前的修改将会丢失。')) {
            promptTextarea.value = defaultTemplate;
            showToast('已重置为默认模板');
        }
    });

    importBtn.addEventListener('click', () => {
        importInput.click();
    });

    // --- 提示词预设库管理逻辑 ---
    const presetSelect = document.getElementById('magic-room-preset-select');
    const applyPresetBtn = document.getElementById('magic-room-apply-preset');
    const savePresetBtn = document.getElementById('magic-room-save-preset');
    const managePresetsBtn = document.getElementById('magic-room-manage-presets');
    const presetsModal = document.getElementById('magic-room-presets-modal');
    const presetsList = document.getElementById('magic-room-presets-list');
    const closePresetsModalBtn = document.getElementById('magic-room-close-modal');

    function populateMagicRoomPresets() {
        if (!presetSelect) return;
        presetSelect.innerHTML = '<option value="">— 选择 —</option>';
        if (db.magicRoom && db.magicRoom.presets) {
            db.magicRoom.presets.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id || p.name;
                opt.textContent = p.name;
                presetSelect.appendChild(opt);
            });
        }
    }
    
    // 初始化时填充
    populateMagicRoomPresets();

    if (applyPresetBtn) {
        applyPresetBtn.addEventListener('click', () => {
            const selected = presetSelect.value;
            if (!selected) return showToast('请先选择预设');
            const preset = (db.magicRoom.presets || []).find(p => p.id === selected || p.name === selected);
            if (preset) {
                promptTextarea.value = preset.template || '';
                if (promptStudioUi) promptStudioUi.loadPreset(preset);
                showToast('已加载预设：' + selected);
            }
        });
    }

    if (savePresetBtn) {
        savePresetBtn.addEventListener('click', async () => {
            const template = promptTextarea.value.trim();
            const draft = promptStudioUi ? promptStudioUi.getDraft() : null;
            if (!template && !(draft && draft.mode === 'items' && draft.items.length)) return showToast('提示词为空，无法保存');
            const name = typeof customPrompt === 'function'
                ? await customPrompt('请输入预设名称（将覆盖同名预设）：', '', '保存提示词预设')
                : prompt('请输入预设名称（将覆盖同名预设）：');
            if (!name || !name.trim()) return;
            
            if (!db.magicRoom) db.magicRoom = {};
            if (!db.magicRoom.presets) db.magicRoom.presets = [];
            
            const idx = db.magicRoom.presets.findIndex(p => p.name === name.trim());
            const presetObj = {
                id: idx >= 0 ? db.magicRoom.presets[idx].id : (window.PromptStudio ? window.PromptStudio.uid('prompt-preset') : `prompt-preset-${Date.now()}`),
                name: name.trim(),
                template: template,
                mode: draft ? draft.mode : 'source',
                items: draft ? draft.items : undefined
            };
            if (idx >= 0) {
                db.magicRoom.presets[idx] = presetObj;
            } else {
                db.magicRoom.presets.push(presetObj);
            }
            
            await saveMagicRoomSettings();
            populateMagicRoomPresets();
            showToast('预设已保存');
        });
    }

    if (managePresetsBtn) {
        managePresetsBtn.addEventListener('click', () => {
            if (!presetsModal || !presetsList) return;
            presetsList.innerHTML = '';
            const presets = (db.magicRoom && db.magicRoom.presets) || [];
            if (presets.length === 0) {
                presetsList.innerHTML = '<p style="text-align:center;color:#999;padding:10px;">暂无预设</p>';
            } else {
                presets.forEach((p, idx) => {
                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid #f0f0f0;';
                    
                    const nameDiv = document.createElement('div');
                    nameDiv.style.cssText = 'flex:1;font-weight:500;';
                    nameDiv.textContent = p.name;
                    
                    const btnWrap = document.createElement('div');
                    btnWrap.style.cssText = 'display:flex;gap:6px;';
                    
                    const renameBtn = document.createElement('button');
                    renameBtn.className = 'btn btn-small';
                    renameBtn.textContent = '重命名';
                    renameBtn.onclick = async () => {
                        const newName = typeof customPrompt === 'function'
                            ? await customPrompt('输入新名称：', p.name, '重命名提示词预设')
                            : prompt('输入新名称：', p.name);
                        if (!newName || !newName.trim() || newName.trim() === p.name) return;
                        const oldName = p.name;
                        db.magicRoom.presets[idx].name = newName.trim();
                        (db.characters || []).forEach(character => {
                            const reference = character.customPromptPresetId || character.customPromptPreset;
                            if (reference === oldName || reference === p.id) {
                                character.customPromptPresetId = p.id;
                                character.customPromptPreset = p.id;
                            }
                        });
                        await saveMagicRoomSettings();
                        if (typeof saveData === 'function') await saveData();
                        populateMagicRoomPresets();
                        managePresetsBtn.click(); // re-render
                    };
                    
                    const delBtn = document.createElement('button');
                    delBtn.className = 'btn btn-danger btn-small';
                    delBtn.textContent = '删除';
                    delBtn.onclick = async () => {
                        if (!confirm('确定删除预设：' + p.name + '？')) return;
                        db.magicRoom.presets.splice(idx, 1);
                        await saveMagicRoomSettings();
                        populateMagicRoomPresets();
                        managePresetsBtn.click();
                    };
                    
                    btnWrap.appendChild(renameBtn);
                    btnWrap.appendChild(delBtn);
                    row.appendChild(nameDiv);
                    row.appendChild(btnWrap);
                    presetsList.appendChild(row);
                });
            }
            presetsModal.style.display = 'flex';
        });
    }

    if (closePresetsModalBtn) {
        closePresetsModalBtn.addEventListener('click', () => {
            presetsModal.style.display = 'none';
        });
    }

    importInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            // 兼容单个模板导入
            if (data && data.type === 'ovo-system-prompt-template' && (data.template || Array.isArray(data.items))) {
                promptTextarea.value = data.template || '';
                if (promptStudioUi) {
                    promptStudioUi.loadPreset({ name: data.name || '导入模板', template: data.template, mode: data.mode, items: data.items });
                }
                showToast('模板导入成功');
            } 
            // 支持多个预设数组导入
            else if (Array.isArray(data) && data.length > 0 && (data[0].template || Array.isArray(data[0].items))) {
                if (!db.magicRoom) db.magicRoom = {};
                if (!db.magicRoom.presets) db.magicRoom.presets = [];
                data.forEach(p => {
                    if (!p.id && window.PromptStudio) p.id = window.PromptStudio.uid('prompt-preset');
                    const idx = db.magicRoom.presets.findIndex(exist => exist.name === p.name);
                    if (idx >= 0) db.magicRoom.presets[idx] = p;
                    else db.magicRoom.presets.push(p);
                });
                await saveMagicRoomSettings();
                populateMagicRoomPresets();
                showToast(`成功导入 ${data.length} 个预设`);
            } else {
                showToast('无效的模板文件');
            }
        } catch (err) {
            showToast('导入失败：' + err.message);
        }
        e.target.value = '';
    });

    exportBtn.addEventListener('click', async () => {
        // 如果有预设，优先提示是否导出整个预设库
        if (db.magicRoom && db.magicRoom.presets && db.magicRoom.presets.length > 0) {
            if (confirm('是否导出整个预设库？（点击取消则仅导出当前编辑框内容）')) {
                const blob = new Blob([JSON.stringify(db.magicRoom.presets, null, 2)], { type: 'application/json' });
                await OvoFileDownload.save(blob, `系统提示词预设库_${new Date().toISOString().slice(0, 10)}.json`);

                return;
            }
        }
        
        const template = promptTextarea.value;
        const draft = promptStudioUi ? promptStudioUi.getDraft() : null;
        if (!template && !(draft && draft.mode === 'items' && draft.items.length)) return showToast('提示词为空，无法导出');
        const data = {
            type: 'ovo-system-prompt-template',
            version: 2,
            template: template,
            mode: draft ? draft.mode : 'source',
            items: draft ? draft.items : undefined
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        await OvoFileDownload.save(blob, `系统提示词模板_${new Date().toISOString().slice(0, 10)}.json`);

    });

    saveBtn.addEventListener('click', async () => {
        if (pushBusy) return showToast('推送操作进行中，请稍候');
        if (!db.magicRoom) db.magicRoom = {};
        const previous = db.magicRoom;
        if (previous.sysNotifPushDeviceId && (!sysnotifEnabled.checked || !sysnotifCustomSrv.checked ||
            previous.sysNotifServerUrl !== sysnotifSrvUrl.value.trim() || previous.sysNotifServerKey !== sysnotifSrvKey.value.trim())) {
            try {
                pushBusy = true;
                const message = await OvoPush.disconnect(savedPushConfig(), previous.sysNotifPushDeviceId);
                previous.sysNotifPushDeviceId = '';
                pushStatus.textContent = message + '。如需推送，请重新连接。';
            } catch (error) { showToast(error.message); return; }
            finally { pushBusy = false; }
        }
        db.magicRoom.customPromptEnabled = enabledSwitch.checked;
        db.magicRoom.customPromptTemplate = promptTextarea.value;
        if (momentsPromptUi) momentsPromptUi.saveToDb();
        if (promptStudioUi) promptStudioUi.saveToDb();
        // 保存系统通知设置
        db.magicRoom.sysNotifEnabled      = sysnotifEnabled ? sysnotifEnabled.checked : false;
        db.magicRoom.sysNotifSenderName   = sysnotifSenderName ? sysnotifSenderName.value.trim() : '';
        db.magicRoom.sysNotifShowAvatar   = sysnotifShowAvatar ? sysnotifShowAvatar.checked : true;
        const sysNotifInChatEnabledEl = document.getElementById('sysnotif-in-chat-enabled');
        db.magicRoom.sysNotifInChatEnabled = sysNotifInChatEnabledEl ? sysNotifInChatEnabledEl.checked : false;
        db.magicRoom.sysNotifShowContent  = sysnotifShowContent ? sysnotifShowContent.checked : true;
        db.magicRoom.sysNotifCustomServer = sysnotifCustomSrv ? sysnotifCustomSrv.checked : false;
        db.magicRoom.sysNotifServerUrl    = sysnotifSrvUrl ? sysnotifSrvUrl.value.trim() : '';
        db.magicRoom.sysNotifServerKey    = sysnotifSrvKey ? sysnotifSrvKey.value.trim() : '';
        await saveMagicRoomSettings();
        showToast('魔法屋设置已保存！');
    });

    // ===== 系统通知设置初始化 =====
    const sysnotifEnabled    = document.getElementById('sysnotif-enabled');
    const sysnotifOptions    = document.getElementById('sysnotif-options');
    const sysnotifSenderName = document.getElementById('sysnotif-sender-name');
    const sysnotifShowAvatar = document.getElementById('sysnotif-show-avatar');
    const sysnotifShowContent= document.getElementById('sysnotif-show-content');
    const sysnotifCustomSrv  = document.getElementById('sysnotif-custom-server');
    const sysnotifSrvOptions = document.getElementById('sysnotif-server-options');
    const sysnotifSrvUrl     = document.getElementById('sysnotif-server-url');
    const sysnotifSrvKey     = document.getElementById('sysnotif-server-key');
    const sysnotifReqPerm    = document.getElementById('sysnotif-request-permission');
    const sysnotifPermStatus = document.getElementById('sysnotif-permission-status');
    const pushStatus = document.getElementById('sysnotif-server-status');
    const pushButtons = ['connect', 'test', 'disconnect'].map(action => document.getElementById('sysnotif-server-' + action));
    let pushBusy = false;
    const savedPushConfig = () => ({ url: db.magicRoom?.sysNotifServerUrl || '', key: db.magicRoom?.sysNotifServerKey || '' });
    const draftPushConfig = () => ({ url: sysnotifSrvUrl.value.trim(), key: sysnotifSrvKey.value.trim() });

    async function pushAction(action) {
        if (pushBusy) return;
        pushBusy = true;
        pushButtons.forEach(button => { if (button) button.disabled = true; });
        saveBtn.disabled = true;
        pushStatus.textContent = '正在处理推送请求…';
        try {
            if (!window.OvoPush) throw new Error('推送组件未加载，请刷新页面后重试');
            if (!db.magicRoom) db.magicRoom = {};
            const mr = db.magicRoom;
            const values = draftPushConfig();
            const changed = mr.sysNotifServerUrl !== values.url || mr.sysNotifServerKey !== values.key;
            if (action !== 'disconnect' && mr.sysNotifPushDeviceId && changed) throw new Error('地址或 Token 已修改，请先断开旧推送连接，再连接新服务');
            if (action === 'connect') {
                if (!sysnotifEnabled.checked || !sysnotifCustomSrv.checked) throw new Error('请先开启系统通知和自定义推送服务器');
                const deviceId = await OvoPush.connect(values);
                const previous = { ...mr };
                Object.assign(mr, { sysNotifEnabled: true, sysNotifCustomServer: true, sysNotifServerUrl: values.url, sysNotifServerKey: values.key, sysNotifPushDeviceId: deviceId });
                try {
                    if (await saveMagicRoomSettings() === false) throw new Error('推送设置保存失败，请重试连接');
                } catch (error) {
                    await OvoPush.disconnect(values, deviceId).catch(() => {});
                    Object.assign(mr, previous, { sysNotifPushDeviceId: '' });
                    throw error;
                }
                pushStatus.textContent = '设备已登记，推送设置已保存。请测试服务器推送以确认送达。';
            } else if (action === 'test') {
                await OvoPush.test(savedPushConfig(), mr.sysNotifPushDeviceId);
                pushStatus.textContent = '推送服务已受理测试。请以实际收到的“服务器推送测试”通知确认送达；未收到不代表测试通过。';
            } else {
                const message = await OvoPush.disconnect(savedPushConfig(), mr.sysNotifPushDeviceId);
                mr.sysNotifPushDeviceId = '';
                if (await saveMagicRoomSettings() === false) throw new Error('已取消本机订阅，但设置保存失败，请重试保存');
                pushStatus.textContent = message;
            }
        } catch (error) {
            pushStatus.textContent = error.message || '推送操作失败，请重试';
            showToast(pushStatus.textContent);
        } finally {
            pushBusy = false;
            pushButtons.forEach(button => { if (button) button.disabled = false; });
            saveBtn.disabled = false;
        }
    }
    pushButtons.forEach((button, index) => button?.addEventListener('click', () => pushAction(['connect', 'test', 'disconnect'][index])));

    if (sysnotifEnabled) {
        const mr = db.magicRoom || {};
        // 从 db 回填数据
        sysnotifEnabled.checked             = !!mr.sysNotifEnabled;
        sysnotifOptions.style.display       = mr.sysNotifEnabled ? 'block' : 'none';
        sysnotifSenderName.value            = mr.sysNotifSenderName || '';
        sysnotifShowAvatar.checked          = mr.sysNotifShowAvatar !== false;
        const sysNotifInChatEnabledEl = document.getElementById('sysnotif-in-chat-enabled');
        if (sysNotifInChatEnabledEl) sysNotifInChatEnabledEl.checked = !!mr.sysNotifInChatEnabled;
        sysnotifShowContent.checked         = mr.sysNotifShowContent !== false;
        sysnotifCustomSrv.checked           = !!mr.sysNotifCustomServer;
        sysnotifSrvOptions.style.display    = mr.sysNotifCustomServer ? 'block' : 'none';
        sysnotifSrvUrl.value                = mr.sysNotifServerUrl || '';
        sysnotifSrvKey.value                = mr.sysNotifServerKey || '';
        if (pushStatus && mr.sysNotifPushDeviceId) pushStatus.textContent = '此设备已登记过，请测试服务器推送以确认订阅仍然有效。';

        // 更新权限状态提示
        function updateSysNotifPermStatus() {
            if (!('Notification' in window)) {
                sysnotifPermStatus.textContent = '⚠️ 当前浏览器不支持通知 API';
                return;
            }
            const map = {
                granted: '✅ 已授权，系统通知功能可正常使用',
                denied:  '❌ 已被拒绝，请在浏览器/系统设置中手动开启',
                default: '⚪ 尚未申请权限，请点击上方按钮申请'
            };
            sysnotifPermStatus.textContent = map[Notification.permission] || '';
        }
        updateSysNotifPermStatus();

        // 总开关
        sysnotifEnabled.addEventListener('change', () => {
            sysnotifOptions.style.display = sysnotifEnabled.checked ? 'block' : 'none';
        });

        // 自定义服务器开关
        sysnotifCustomSrv.addEventListener('change', () => {
            sysnotifSrvOptions.style.display = sysnotifCustomSrv.checked ? 'block' : 'none';
        });

        // 申请权限按钮
        sysnotifReqPerm.addEventListener('click', async () => {
            if (!('Notification' in window)) {
                showToast('当前浏览器不支持通知 API');
                return;
            }
            const result = await Notification.requestPermission();
            updateSysNotifPermStatus();
            if (result === 'granted') {
                showToast('✅ 通知权限已授权！');
            } else if (result === 'denied') {
                showToast('❌ 权限被拒绝，请在浏览器设置中手动开启');
            } else {
                showToast('未授权，请重试');
            }
        });

        // 发送测试通知按钮
        const sysnotifTestBtn = document.getElementById('sysnotif-test-btn');
        if (sysnotifTestBtn) {
            sysnotifTestBtn.addEventListener('click', async () => {
                if (!('Notification' in window)) {
                    showToast('当前浏览器不支持通知 API');
                    return;
                }
                if (Notification.permission !== 'granted') {
                    showToast('请先申请系统通知权限！');
                    return;
                }
                const name = sysnotifSenderName.value.trim() || '章鱼喷墨机';
                await showSystemNotification({
                    title: name,
                    body: '这是本机通知测试，仅验证本机通知权限，不验证推送服务器。',
                    icon: 'https://i.postimg.cc/Vk042Snv/5F3BCD91056B989330AE34D11901BD6E.png'
                });
            });
        }
    }
}

