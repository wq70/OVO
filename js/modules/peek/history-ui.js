window.PeekHistoryUI = (() => {
    const esc = value => window.PeekMemory.html(value);
    const date = at => new Date(at).toLocaleString('zh-CN', { hour12: false });
    const current = () => db.characters.find(character => character.id === currentChatId);
    const appName = app => peekScreenApps[app]?.name || app;
    let overlay;
    let restoreFocus;
    let activeCharacter;

    function close() {
        overlay?.remove();
        overlay = null;
        if (restoreFocus?.isConnected) restoreFocus.focus();
    }

    function dialog(character, title, subtitle) {
        close();
        restoreFocus = document.activeElement;
        activeCharacter = character;
        const node = document.createElement('div');
        node.className = 'modal-overlay visible peek-memory-overlay';
        node.innerHTML = `<section class="modal-window peek-memory-sheet" role="dialog" aria-modal="true" aria-labelledby="peek-memory-title" tabindex="-1">
            <header class="peek-memory-heading"><div><h3 id="peek-memory-title">${esc(title)}</h3><p>${esc(subtitle)}</p></div><button type="button" class="peek-memory-close" aria-label="关闭">×</button></header>
            <div class="peek-memory-body"></div><p class="peek-memory-feedback" role="status"></p></section>`;
        (document.querySelector('.phone-screen') || document.body).append(node);
        overlay = node;
        node.querySelector('.peek-memory-close').onclick = close;
        node.addEventListener('click', event => { if (event.target === node) close(); });
        node.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.stopPropagation(); close(); }
            if (event.key !== 'Tab') return;
            const controls = [...node.querySelectorAll('button, input, select, summary, [tabindex="0"]')].filter(item => !item.disabled && item.getClientRects().length);
            if (!controls.length) return;
            if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
            else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
        });
        node.querySelector('section').focus();
        return node.querySelector('.peek-memory-body');
    }

    async function save(node, character, action, onSuccess) {
        if (current()?.id !== character.id || !db.characters.includes(character)) {
            close(); showToast('角色已切换，请重新打开设置'); return;
        }
        const controls = [...node.querySelectorAll('button, input, select')];
        const disabled = controls.map(control => control.disabled);
        controls.forEach(control => { control.disabled = true; });
        const feedback = node.querySelector('.peek-memory-feedback');
        feedback.textContent = '正在保存…';
        try {
            await action();
            if (node === overlay) { feedback.textContent = '已保存'; onSuccess?.(); }
        } catch (error) {
            feedback.textContent = '保存失败，设置未生效，请重试。';
            console.error('[Peek] 历史或联系人设置保存失败', error);
        } finally {
            controls.forEach((control, index) => { control.disabled = disabled[index]; });
        }
    }

    function entry(screenId, id, label, callback) {
        const header = document.querySelector(`#${screenId} .app-header`);
        if (!header) return;
        header.classList.add('peek-memory-header');
        let button = header.querySelector('#' + id);
        if (!button) {
            button = document.createElement('button');
            button.type = 'button'; button.id = id; button.className = 'peek-memory-entry';
            button.textContent = label;
            let group = header.querySelector(':scope > .action-btn-group');
            if (!group) {
                group = document.createElement('div');
                group.className = 'action-btn-group';
                header.querySelectorAll(':scope > .action-btn').forEach(action => group.append(action));
                header.append(group);
            }
            group.prepend(button);
        }
        button.onclick = event => { event.stopPropagation(); callback(); };
    }

    function openContact(conversation) {
        const character = current();
        if (!character || !conversation) return;
        const policy = character.peekContactMemory?.[conversation.partnerId] || {};
        const body = dialog(character, '角色知晓', `与 ${conversation.partnerName || '联系人'} 的聊天`);
        body.innerHTML = `<p class="peek-memory-note">让角色记得自己与这位联系人的聊天，用于后续对话。此设置独立于“知晓用户窥屏”。</p>
            <fieldset class="peek-memory-modes"><legend>同步方式</legend>${[['off','关闭'],['manual','手动'],['auto','自动']].map(([value, name]) => `<label><input type="radio" name="peek-contact-mode" value="${value}"${(policy.mode || 'off') === value ? ' checked' : ''}><span>${name}</span></label>`).join('')}</fieldset>
            <p class="peek-memory-mode-hint"></p>
            <div class="peek-memory-contact-options">
                <label class="peek-memory-switch"><span><strong>保留已同步的旧内容</strong><small>关闭时仅使用当前版本；刷新后手动同步的旧版本将停止进入上下文。</small></span><input id="peek-contact-past" type="checkbox"${policy.keepPast ? ' checked' : ''}></label>
                <label class="peek-memory-limit"><span>每次聊天最多参考</span><span><input id="peek-contact-limit" type="number" min="1" max="200" step="1" value="${Number(policy.limit) || 20}" aria-label="联系人上下文消息条数"> 条</span></label>
                <p class="peek-memory-note">同步会保存一份聊天副本，并增加后续聊天的 Token。旧内容保留另行占用存储，默认关闭。</p>
            </div>
            <p class="peek-memory-sync-status">${policy.snapshot ? `最近同步：${esc(date(policy.snapshot.at))}` : '尚未同步任何聊天内容'}</p>
            <div class="peek-memory-actions"><button type="button" class="btn btn-secondary" id="peek-contact-save">保存设置</button><button type="button" class="btn btn-primary" id="peek-contact-sync">同步当前聊天</button></div>`;
        const node = overlay;
        const mode = () => body.querySelector('input[name="peek-contact-mode"]:checked').value;
        const update = () => {
            const value = mode();
            body.querySelector('.peek-memory-contact-options').hidden = value === 'off';
            body.querySelector('#peek-contact-sync').hidden = value !== 'manual';
            body.querySelector('.peek-memory-mode-hint').textContent = { off: '不向角色发送这位联系人的聊天内容。保存关闭后会移除该联系人的同步副本。', manual: '点击“同步当前聊天”时同步一次，之后的新消息需要再次手动同步。', auto: '保存后立即同步当前聊天；此联系人的后续回复与刷新内容将自动更新。' }[value];
        };
        body.querySelectorAll('[name="peek-contact-mode"]').forEach(input => { input.onchange = update; });
        const submit = syncNow => {
            const limit = body.querySelector('#peek-contact-limit').valueAsNumber;
            if (mode() !== 'off' && (!Number.isSafeInteger(limit) || limit < 1 || limit > 200)) {
                node.querySelector('.peek-memory-feedback').textContent = '消息条数请输入 1～200 的整数';
                body.querySelector('#peek-contact-limit').focus(); return;
            }
            const live = character.peekData?.messages?.conversations?.find(item => item.partnerId === conversation.partnerId);
            if (!live) { node.querySelector('.peek-memory-feedback').textContent = '对话已刷新，请关闭后重新打开联系人。'; return; }
            const options = { mode: mode(), keepPast: body.querySelector('#peek-contact-past').checked, limit };
            save(node, character, () => window.PeekMemory.setContact(character, live, options, syncNow), () => {
                const saved = character.peekContactMemory?.[conversation.partnerId];
                body.querySelector('.peek-memory-sync-status').textContent = saved?.snapshot ? `最近同步：${date(saved.snapshot.at)}` : '尚未同步任何聊天内容';
            });
        };
        body.querySelector('#peek-contact-save').onclick = () => submit(false);
        body.querySelector('#peek-contact-sync').onclick = () => submit(true);
        update();
    }

    const names = { conversations:'联系人聊天', partnerName:'联系人', partnerRelation:'关系', history:'聊天记录', sender:'发言者', content:'内容', photos:'照片', description:'描述', imagePrompt:'画面描述', imageDescription:'画面描述', type:'类型', url:'链接', memos:'备忘录', title:'标题', entries:'条目', items:'条目', name:'名称', price:'价格', spec:'规格', quantity:'数量', annotation:'批注', detail:'正文', draft:'草稿', to:'收件人', recipient:'收件人', currentSteps:'步数', trajectory:'活动轨迹', time:'时间', location:'地点', activity:'活动', thoughts:'时光想说', characterSelfDescription:'当时的自己', thought:'想说的话', nickname:'昵称', handle:'账号', bio:'简介', posts:'帖子', comments:'评论', author:'作者', timestamp:'时间', income:'收入', expense:'支出', summary:'汇总', balance:'余额', amount:'金额', date:'日期', category:'类别', remark:'备注' };
    Object.assign(names, {userAge:'用户年龄',characterAge:'角色年龄',whatToSay:'想说的话',whatToDo:'想做的事',emotion:'心情',monthIncome:'本月收入',monthExpense:'本月支出',source:'来源',replyTo:'回复对象'});
    const privateKeys = new Set(['partnerId','id','isFriend','friendRequestPending','suspicionLevel','supplementPersona','partnerPersona','isImpersonated']);
    function dataText(data, depth = 0) {
        if (depth > 12 || data == null) return '';
        if (Array.isArray(data)) return data.map((item, index) => `${index + 1}. ${dataText(item, depth + 1)}`).join('\n\n');
        if (typeof data === 'object') return Object.entries(data).filter(([key]) => !privateKeys.has(key)).map(([key, value]) => `${names[key] || key}：${dataText(value, depth + 1)}`).join('\n');
        return String(data);
    }

    function messagesHtml(history) {
        return (history || []).map(message => `<div class="peek-memory-message ${message.sender === 'char' ? 'from-character' : ''}"><small>${message.sender === 'char' ? (message.isImpersonated ? '他人代发' : '角色') : '联系人'}</small><p>${esc(message.content)}</p></div>`).join('');
    }

    function openHistory(initialApp = 'messages') {
        const character = current();
        if (!character) return;
        const body = dialog(character, '查手机历史', '按应用保存，随时回看');
        body.innerHTML = `<div class="peek-memory-toolbar"><select id="peek-history-app" aria-label="历史应用">${Object.entries(peekScreenApps).map(([app, info]) => `<option value="${app}">${esc(info.name)}</option>`).join('')}</select><button type="button" class="peek-memory-text-button" id="peek-history-settings">保存设置</button></div>
            <div class="peek-memory-tabs" role="group" aria-label="历史查看方式"><button type="button" data-view="batches" aria-pressed="true">按批次</button><button type="button" data-view="contacts" aria-pressed="false">按联系人</button></div>
            <p class="peek-memory-history-status"></p><div class="peek-memory-records"></div>
            <div class="peek-memory-clean"><button type="button" class="peek-memory-text-button" id="peek-history-clear">清空此应用历史</button><div class="peek-memory-confirm" hidden><p>只删除历史副本，当前内容与角色同步记忆保留。</p><button type="button" class="peek-memory-text-button" id="peek-history-cancel">取消</button><button type="button" class="peek-memory-text-button" id="peek-history-confirm">确认清空</button></div></div>`;
        const node = overlay;
        const selector = body.querySelector('#peek-history-app');
        selector.value = Object.hasOwn(peekScreenApps, initialApp) ? initialApp : 'messages';
        let view = 'batches';
        const render = () => {
            const app = selector.value;
            const records = character.peekArchive?.[app] || [];
            const enabled = character.peekHistorySettings?.apps?.includes(app);
            body.querySelector('.peek-memory-history-status').textContent = `${enabled ? '已开启保存' : '未开启保存'} · ${records.length} 份历史${enabled ? '' : ' · 可在保存设置中开启'}`;
            body.querySelector('[data-view="contacts"]').hidden = app !== 'messages';
            body.querySelector('.peek-memory-confirm').hidden = true;
            body.querySelector('#peek-history-clear').hidden = records.length === 0;
            const list = body.querySelector('.peek-memory-records');
            if (view === 'contacts' && app === 'messages') {
                const contacts = new Map();
                records.forEach(record => (record.data.conversations || []).forEach(conversation => {
                    const key = conversation.partnerId || conversation.partnerName;
                    if (!contacts.has(key)) contacts.set(key, { name: conversation.partnerName, versions: [] });
                    contacts.get(key).versions.push({ at: record.at, data: conversation });
                }));
                list.innerHTML = [...contacts.values()].map(contact => `<details class="peek-memory-record"><summary><strong>${esc(contact.name)}</strong><small>${contact.versions.length} 个批次</small></summary><div class="peek-memory-thread">${window.PeekMemory.mergeVersions(contact.versions).length ? messagesHtml(window.PeekMemory.mergeVersions(contact.versions)) : '<p>暂无消息</p>'}</div></details>`).join('');
                const policies = Object.entries(character.peekContactMemory || {}).filter(([, policy]) => policy.mode !== 'off');
                if (policies.length) {
                    const management = document.createElement('details');
                    management.className = 'peek-memory-record';
                    management.innerHTML = `<summary><strong>管理角色知晓</strong><small>${policies.length} 位联系人</small></summary>${policies.map(([id, policy]) => `<div class="peek-memory-manage"><span>${esc(policy.name)}<small>${policy.mode === 'auto' ? '自动同步' : '手动同步'}</small></span><button type="button" class="peek-memory-text-button" data-stop="${esc(id)}">关闭并移除记忆</button></div>`).join('')}`;
                    management.querySelectorAll('[data-stop]').forEach(button => { button.onclick = () => save(node, character, () => window.PeekMemory.setContact(character, { partnerId: button.dataset.stop }, { mode: 'off' }), render); });
                    list.append(management);
                }
            } else {
                list.innerHTML = [...records].reverse().map(record => `<details class="peek-memory-record"><summary><strong>${esc(date(record.at))}</strong><small>${esc(appName(app))}</small></summary><div class="peek-memory-record-content">${app === 'messages' ? (record.data.conversations || []).map(conversation => `<h4>${esc(conversation.partnerName)}</h4>${messagesHtml(conversation.history)}`).join('') : `<pre>${esc(dataText(record.data))}</pre>`}</div></details>`).join('');
            }
            if (!list.children.length) list.innerHTML = `<div class="peek-memory-empty"><strong>还没有${view === 'contacts' ? '联系人' : ''}历史</strong><p>默认不保留历史。开启对应应用的保存开关后，当前内容与之后的刷新会留下记录。</p></div>`;
        };
        selector.onchange = () => { view = 'batches'; updateTabs(); render(); };
        const updateTabs = () => body.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
        body.querySelectorAll('[data-view]').forEach(button => { button.onclick = () => { view = button.dataset.view; updateTabs(); render(); }; });
        body.querySelector('#peek-history-settings').onclick = () => openHistorySettings(character, selector.value);
        body.querySelector('#peek-history-clear').onclick = () => { body.querySelector('.peek-memory-confirm').hidden = false; };
        body.querySelector('#peek-history-cancel').onclick = () => { body.querySelector('.peek-memory-confirm').hidden = true; };
        body.querySelector('#peek-history-confirm').onclick = () => save(node, character, () => window.PeekMemory.clearArchive(character, selector.value), render);
        render();
    }

    function openHistorySettings(character, app) {
        const selected = character.peekHistorySettings?.apps || [];
        const body = dialog(character, '历史保存设置', '仅对当前角色生效');
        body.innerHTML = `<p class="peek-memory-note">全部默认关闭。开启后保存当前内容与之后的刷新，增加本地存储占用，不额外调用 AI，也不会自动发送给角色。</p>
            <div class="peek-memory-app-settings">${Object.entries(peekScreenApps).map(([id, info]) => `<label class="peek-memory-switch"><span>${esc(info.name)}</span><input type="checkbox" value="${id}"${selected.includes(id) ? ' checked' : ''} aria-label="保存${esc(info.name)}历史"></label>`).join('')}</div>
            <p class="peek-memory-note">关闭后停止新增，已有历史仍可回看或手动清理。历史不会自动删除；角色知晓请到对应联系人聊天页单独设置。</p>
            <div class="peek-memory-actions"><button type="button" class="btn btn-secondary" id="peek-history-back">返回历史</button><button type="button" class="btn btn-primary" id="peek-history-save">保存设置</button></div>`;
        const node = overlay;
        body.querySelector('#peek-history-back').onclick = () => openHistory(app);
        body.querySelector('#peek-history-save').onclick = () => {
            const apps = [...body.querySelectorAll('input:checked')].map(input => input.value);
            save(node, character, () => window.PeekMemory.setHistoryApps(character, apps), () => openHistory(app));
        };
    }

    document.addEventListener('click', () => { if (overlay && current()?.id !== activeCharacter?.id) close(); }, true);
    return {
        mountHome: () => entry('peek-screen', 'peek-home-history', '历史', () => openHistory()),
        mountList: () => entry('peek-messages-screen', 'peek-list-history', '历史', () => openHistory('messages')),
        mountContact: conversation => entry('peek-conversation-screen', 'peek-contact-memory', '角色知晓', () => openContact(conversation)),
        openHistory, openContact
    };
})();
