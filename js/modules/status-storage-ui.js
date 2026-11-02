// 复用存储分析弹窗的视觉语言。选择、预览、备份和执行均由用户触发。
(function () {
    'use strict';
    const modes = { full: '完整保存', slim: '精简保存', shared: '共享模板' };
    const $ = id => document.getElementById('status-storage-' + id);
    const format = size => size < 1024 ? size + ' B' : size < 1048576 ? (size / 1024).toFixed(2) + ' KB' : (size / 1048576).toFixed(2) + ' MB';
    const date = stamp => stamp ? new Date(stamp).toLocaleString('zh-CN', { hour12: false }) : '未记录时间';
    let report = null, plan = null, archive = null, busy = false, generation = 0, backupSaved = false;
    const selected = new Set(), restoreSelected = new Set();
    let returnFocus = null;
    let taskController = null;

    function element(tag, className, text) {
        const node = document.createElement(tag); if (className) node.className = className;
        if (text !== undefined) node.textContent = text; return node;
    }
    function button(text, onClick) {
        const node = element('button', 'status-storage-button', text); node.type = 'button'; node.addEventListener('click', onClick); return node;
    }
    function check(text, checked, onChange) {
        const label = element('label', 'status-storage-check');
        const input = document.createElement('input'); input.type = 'checkbox'; input.checked = checked;
        const span = element('span', '', text); label.append(input, span);
        input.addEventListener('change', () => onChange(input.checked)); return { label, input };
    }
    function status(text) { $('status').textContent = text; }
    function invalidate() {
        plan = null; backupSaved = false; $('preview').hidden = true; $('saved').checked = false;
    }
    function setBusy(value, kind) {
        busy = value;
        for (const control of $('modal').querySelectorAll('button, input, select')) {
            if (control.id !== 'status-storage-stop') control.disabled = value;
        }
        $('stop').hidden = !value || !['scan','backup','operation'].includes(kind);
        $('stop').textContent = kind === 'scan' ? '取消检测' : kind === 'backup' ? '取消备份' : '停止（当前会话提交后停止）';
        if (!value) { taskController = null; $('execute').disabled = !plan; $('restore-execute').disabled = !restorePreview?.restorable; updateCount(); }
    }
    function fail(error) { status('操作未完成：' + error.message); }

    function mount() {
        if ($('modal')) return;
        const modal = element('div', 'modal-overlay storage-analysis-modal'); modal.id = 'status-storage-modal';
        modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'status-storage-title');
        modal.innerHTML = `
          <div class="modal-window storage-analysis-window status-storage-window">
            <div class="storage-modal-heading"><div><h3 id="status-storage-title">状态栏数据整理</h3><small>手动选择 · 先预览 · 不自动清理</small></div><button type="button" id="status-storage-close" class="storage-modal-close" aria-label="关闭状态栏整理">×</button></div>
            <div class="status-storage-tabs" role="tablist" aria-label="状态栏数据管理">
              <button type="button" data-view="old" role="tab" aria-selected="true">旧数据</button><button type="button" data-view="policies" role="tab" aria-selected="false">新消息保存</button><button type="button" data-view="restore" role="tab" aria-selected="false">恢复备份</button>
            </div>
            <div id="status-storage-status" class="storage-audit-status" role="status" aria-live="polite">准备检测</div>
            <div class="status-storage-body">
              <section id="status-storage-old" role="tabpanel">
                <p class="status-storage-note">移除消息模板不删除聊天和状态栏展示历史。正则与编辑关联信息始终保留。需要删除展示历史或当前状态时，请单独选择对应操作。</p>
                <div class="status-storage-toolbar"><button type="button" id="status-storage-scan" class="status-storage-button">重新检测</button><span id="status-storage-last" class="status-storage-note"></span></div>
                <div id="status-storage-stats" class="status-storage-stats"></div>
                <details class="status-storage-details"><summary id="status-storage-issues-title">异常数据</summary><div id="status-storage-issues" class="status-storage-note"></div></details>
                <div class="storage-chat-controls status-storage-controls">
                  <label>处理内容<select id="status-storage-action"><option value="slim">移除消息中的冗余模板（推荐）</option><option value="shared">合并重复模板，保留消息引用</option><option value="history">删除状态栏展示历史（影响翻看）</option><option value="current">清空当前状态（独立操作）</option><option value="orphan">删除无引用的共享模板</option></select></label>
                  <p id="status-storage-impact" class="status-storage-note"></p>
                  <input id="status-storage-search" type="search" placeholder="搜索角色或群聊名称" aria-label="搜索整理会话">
                  <div class="storage-chat-control-row"><select id="status-storage-type" aria-label="会话类型"><option value="all">全部会话</option><option value="private">角色</option><option value="group">群聊</option></select><select id="status-storage-sort" aria-label="排序"><option value="size">占用从大到小</option><option value="name">按名称</option><option value="count">记录数从多到少</option></select></div>
                  <label id="status-storage-template-label">按模板筛选<select id="status-storage-template"><option value="all">全部模板</option></select></label>
                  <div id="status-storage-date-range" class="status-storage-range"><label>起始日期<input id="status-storage-from" type="date"></label><label>结束日期<input id="status-storage-to" type="date"></label></div>
                  <label>每个会话保留最近多少条，不参与本次整理<input id="status-storage-keep" type="number" min="0" step="1" value="0" inputmode="numeric"></label>
                  <label class="status-storage-check"><input id="status-storage-duplicates" type="checkbox"><span>只选择有重复模板的消息，保留独有模板</span></label>
                </div>
                <div class="status-storage-toolbar"><button type="button" id="status-storage-select-filtered" class="status-storage-button">全选当前筛选结果</button><button type="button" id="status-storage-select-all" class="status-storage-button">全选此操作全部候选</button><button type="button" id="status-storage-select-none" class="status-storage-button">取消全选</button></div>
                <p id="status-storage-count" class="status-storage-note"></p><button type="button" id="status-storage-show-selected" class="status-storage-button">查看全部已选项</button>
                <div id="status-storage-list" class="status-storage-list"></div><div id="status-storage-selected" class="status-storage-list" hidden></div>
                <button type="button" id="status-storage-preview-open" class="status-storage-button status-storage-primary">预览所选操作</button>
                <section id="status-storage-preview" class="status-storage-preview" hidden>
                  <strong>执行前预览</strong><div id="status-storage-preview-text" class="status-storage-note"></div>
                  <details class="status-storage-details"><summary>查看会话与所选记录</summary><div id="status-storage-preview-list"></div></details>
                  <label>备份方式<select id="status-storage-backup"><option value="recovery">导出本次操作的恢复备份（推荐）</option><option value="full">导出完整数据备份</option><option value="none">不生成备份，直接执行</option></select></label>
                  <button type="button" id="status-storage-export" class="status-storage-button">生成并下载备份</button>
                  <label class="status-storage-check"><input id="status-storage-saved" type="checkbox"><span id="status-storage-saved-label">我已确认备份文件保存成功</span></label>
                  <label id="status-storage-risk-label" class="status-storage-check" hidden><input id="status-storage-risk" type="checkbox"><span>我理解删除所选展示历史或当前状态会影响状态栏查看</span></label>
                  <button type="button" id="status-storage-execute" class="status-storage-button status-storage-danger">确认执行所选操作</button>
                </section>
              </section>
              <section id="status-storage-policies" role="tabpanel" hidden>
                <p class="status-storage-note">默认保持完整保存。切换只影响新消息，不整理已有消息；已有状态栏展示历史继续保留。角色覆盖优先于全局默认。</p>
                <label>保存方式<select id="status-storage-mode"><option value="full">完整保存：每条消息保存模板</option><option value="slim">精简保存：仅保留必要匹配及关联信息</option><option value="shared">共享模板：模板一份，消息保留引用</option><option value="inherit">跟随全局：取消所选角色覆盖</option></select></label>
                <label class="status-storage-check"><input id="status-storage-global" type="checkbox"><span>应用为全局默认（不覆盖已有角色单独设置）</span></label>
                <label class="status-storage-check"><input id="status-storage-set-edit" type="checkbox"><span>同时设置所选角色编辑旧消息时的保存行为</span></label>
                <label class="status-storage-check"><input id="status-storage-edit" type="checkbox"><span>编辑旧消息时也按当前策略整理模板（默认关闭）</span></label>
                <p class="status-storage-note">普通编辑默认延续旧消息原来的模板保存方式。开启上项后，编辑会改变这条消息的模板保存方式，精简保存可能移除其模板副本。</p>
                <p id="status-storage-global-label" class="status-storage-note"></p>
                <div class="status-storage-toolbar"><button type="button" id="status-storage-policy-all" class="status-storage-button">全选角色</button><button type="button" id="status-storage-policy-none" class="status-storage-button">取消全选</button></div>
                <input id="status-storage-policy-search" type="search" placeholder="搜索角色" aria-label="搜索角色保存设置"><div id="status-storage-policy-list" class="status-storage-list"></div>
                <button type="button" id="status-storage-policy-save" class="status-storage-button status-storage-primary">保存所选设置</button>
                <p class="status-storage-note">状态历史数量仅用于提醒，不因新增消息或保存设置自动删除。发送给 AI 的条数仍在角色设置中单独配置。</p>
              </section>
              <section id="status-storage-restore" role="tabpanel" hidden>
                <p class="status-storage-note">导入“本次操作恢复备份”，手动选择需要恢复的会话。只恢复状态字段与展示记录，不替换聊天正文，不复活已删除消息。完整数据备份请使用原有备份导入入口。</p>
                <input id="status-storage-file" type="file" accept=".json,.gz" hidden><button type="button" id="status-storage-file-open" class="status-storage-button">选择恢复备份</button>
                <p id="status-storage-file-info" class="status-storage-note"></p>
                <div class="status-storage-toolbar"><button type="button" id="status-storage-restore-all" class="status-storage-button">全选备份会话</button><button type="button" id="status-storage-restore-none" class="status-storage-button">取消全选</button></div><div id="status-storage-restore-list" class="status-storage-list"></div>
                <label class="status-storage-check"><input id="status-storage-force" type="checkbox"><span>允许覆盖已修改消息的状态字段或非空的当前状态（正文仍保留）</span></label>
                <button type="button" id="status-storage-restore-preview" class="status-storage-button">预览恢复与冲突</button><div id="status-storage-restore-summary" class="status-storage-note"></div>
                <button type="button" id="status-storage-restore-execute" class="status-storage-button status-storage-primary" disabled>确认恢复所选会话</button>
              </section>
              <div id="status-storage-result" class="status-storage-note" hidden></div>
            </div>
            <button type="button" id="status-storage-stop" class="status-storage-button" hidden>停止（当前会话提交后停止）</button>
          </div>`;
        document.body.appendChild(modal);
        $('close').addEventListener('click', close);
        modal.addEventListener('click', event => { if (event.target === modal) close(); });
        modal.addEventListener('keydown', event => {
            if (document.getElementById('app-confirm-dialog')?.classList.contains('visible')) return;
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
            if (event.key === 'Tab') {
                const items = [...modal.querySelectorAll('button,input,select,summary')].filter(node => !node.disabled && node.getClientRects().length);
                if (event.shiftKey && document.activeElement === items[0]) { items.at(-1)?.focus(); event.preventDefault(); }
                else if (!event.shiftKey && document.activeElement === items.at(-1)) { items[0]?.focus(); event.preventDefault(); }
            }
        });
        modal.querySelectorAll('[data-view]').forEach(node => node.addEventListener('click', () => {
            view(node.dataset.view);
            if (node.dataset.view === 'old' && !busy) void scan();
        }));
        $('scan').addEventListener('click', () => void scan());
        $('stop').addEventListener('click', () => {
            if (taskController) { taskController.abort(); status('正在取消检测或备份，不会执行数据清理。'); }
            else { window.StatusStorage.stop(); status('已请求停止，将完成当前会话提交后停止。'); }
        });
        $('action').addEventListener('change', () => { selected.clear(); invalidate(); render(); });
        ['search','type','sort','from','to','keep','duplicates','template'].forEach(id => $(id).addEventListener('input', () => {
            if (id === 'keep' || id === 'duplicates') {
                const allowed = new Set(eligibleRows().map(row => row.key));
                for (const key of selected) if (!allowed.has(key)) selected.delete(key);
            }
            invalidate(); render();
        }));
        $('select-filtered').addEventListener('click', () => selectRows(filteredRows(), true));
        $('select-all').addEventListener('click', () => selectRows(eligibleRows(), true));
        $('select-none').addEventListener('click', () => { selected.clear(); invalidate(); render(); });
        $('show-selected').addEventListener('click', () => { $('selected').hidden = !$('selected').hidden; renderSelected(); });
        $('preview-open').addEventListener('click', preview);
        $('backup').addEventListener('change', () => {
            backupSaved = false; $('saved').checked = false;
            const none = $('backup').value === 'none'; $('export').hidden = none;
            $('saved-label').textContent = none ? '我理解本次不生成恢复备份，删除内容无法由本操作恢复' : '我已确认备份文件保存成功';
        });
        $('export').addEventListener('click', () => void exportBackup());
        $('execute').addEventListener('click', () => void execute());
        $('mode').addEventListener('change', () => { if ($('mode').value === 'inherit') $('global').checked = false; });
        $('global').addEventListener('change', () => { if ($('mode').value === 'inherit') { $('global').checked = false; status('跟随全局只用于角色，不能设为全局默认。'); } });
        $('policy-search').addEventListener('input', renderPolicies);
        $('policy-all').addEventListener('click', () => { (db.characters || []).forEach(chat => policySelected.add(chat.id)); renderPolicies(); });
        $('policy-none').addEventListener('click', () => { policySelected.clear(); renderPolicies(); });
        $('policy-save').addEventListener('click', () => void savePolicy());
        $('file-open').addEventListener('click', () => $('file').click());
        $('file').addEventListener('change', () => void readArchive());
        $('restore-all').addEventListener('click', () => { archive?.groups.forEach(group => restoreSelected.add(JSON.stringify([group.type, group.chatId]))); renderRestore(); });
        $('restore-none').addEventListener('click', () => { restoreSelected.clear(); renderRestore(); });
        $('force').addEventListener('change', () => { restorePreview = null; $('restore-execute').disabled = true; });
        $('restore-preview').addEventListener('click', previewRestore);
        $('restore-execute').addEventListener('click', () => void restore());
    }

    async function open(initial = 'old') {
        mount(); returnFocus = document.activeElement;
        $('modal').classList.add('visible'); $('close').focus();
        if (!policySelected.size) $('mode').value = db.statusStorageSettings?.mode || 'full';
        view(initial);
        await scan();
    }
    function close() {
        if (busy) { status('操作正在执行。请先点击停止，当前会话提交结束后可关闭。'); return; }
        $('modal').classList.remove('visible'); returnFocus?.focus();
    }
    function view(value) {
        ['old','policies','restore'].forEach(id => $(id).hidden = id !== value);
        $('modal').querySelectorAll('[data-view]').forEach(node => node.setAttribute('aria-selected', String(node.dataset.view === value)));
        if (value === 'policies') renderPolicies();
    }
    async function scan() {
        if (busy) return;
        setBusy(true,'scan'); taskController = new AbortController(); selected.clear(); invalidate(); const token = ++generation;
        try {
            await refreshReport(taskController.signal, token);
            status('检测完成。已读取数据库记录；占用为估算值，所有删除均需手动选择、预览和确认。');
        } catch (error) { fail(error); } finally { setBusy(false); }
    }
    async function refreshReport(signal, token = generation) {
            const next = await window.StatusStorage.scan(count => status(`正在读取数据库，已检查 ${count} 条状态消息…`),signal,{ persisted:true });
            if (token !== generation) return;
            report = next;
            const available = new Set(report.rows.map(row => row.key));
            for (const key of selected) if (!available.has(key)) selected.delete(key);
            $('stats').replaceChildren();
            const labels = { snapshots: '消息快照', templates: '消息内模板', metadata: '必要关联信息', shared: '共享模板库', display: '展示历史', current: '当前状态' };
            for (const [key, label] of Object.entries(labels)) $('stats').append(element('span', '', `${label}：约 ${format(report.stats[key])}`));
            $('issues-title').textContent = `异常或无法确认的数据：${report.issues.length} 项（不处理）`;
            $('issues').textContent = report.issues.join('\n') || '没有发现异常。';
            const templates = new Map();
            for (const row of report.rows) if (row.kind === 'message') {
                if (!templates.has(row.template)) templates.set(row.template,{ index:templates.size,count:0 });
                const item = templates.get(row.template); item.count++; row.templateIndex = String(item.index);
            }
            $('template').replaceChildren(new Option('全部模板','all'));
            for (const [template,item] of templates) $('template').append(new Option(`模板 ${item.index + 1} · ${item.count} 条 · ${format(template.length)}`,String(item.index)));
            const last = await dexieDB.globalSettings.get('_statusStorageLastRun');
            const value = last?.value;
            const unverified = value?.completed?.filter(item => item.verified === false) || [];
            $('last').textContent = value ? `上次操作${value.finishedAt ? '' : '可能被中断'}：已完成 ${value.completed.length - unverified.length} 个会话。${unverified.length ? '尚未完成提交后核验：' + unverified.map(item => item.name).join('、') + '。' : ''}${value.failed?.length ? '失败：' + value.failed.map(item => item.name + ' · ' + item.reason).join('；') + '。' : ''}${value.pending?.length ? '未处理：' + value.pending.join('、') + '。' : ''}中断后不会自动继续。` : '';
            render();
    }
    function actionRows() {
        const kind = ['slim','shared'].includes($('action').value) ? 'message' : $('action').value;
        return report?.rows.filter(row => row.kind === kind) || [];
    }
    function eligibleRows() {
        const action = $('action').value;
        const keep = Math.max(0, Number($('keep').value) || 0);
        const protectedKeys = new Set();
        if (keep && !['current','orphan'].includes(action)) {
            const chats = new Map();
            for (const row of actionRows()) { const key = JSON.stringify([row.type,row.chatId]); if (!chats.has(key)) chats.set(key, []); chats.get(key).push(row); }
            for (const rows of chats.values()) {
                const chat = (rows[0].type === 'group' ? db.groups : db.characters).find(item => item.id === rows[0].chatId);
                const protectedCurrent = action === 'history' ? (chat?.statusPanel?.history || []).filter(item => item.raw === chat.statusPanel.currentStatusRaw && item.html === chat.statusPanel.currentStatusHtml).length : 0;
                rows.sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0) || (action === 'history' ? a.index - b.index : b.index - a.index))
                    .slice(0,Math.max(0,keep - protectedCurrent)).forEach(row => protectedKeys.add(row.key));
            }
        }
        return actionRows().filter(row => !protectedKeys.has(row.key)
            && (!['slim','shared'].includes(action) || !$('duplicates').checked || row.duplicate));
    }
    function filteredRows() {
        const action = $('action').value, search = $('search').value.trim().toLowerCase();
        const from = $('from').value ? new Date($('from').value + 'T00:00:00').getTime() : -Infinity;
        const to = $('to').value ? new Date($('to').value + 'T23:59:59.999').getTime() : Infinity;
        return eligibleRows().filter(row => (!search || row.name.toLowerCase().includes(search)) && ($('type').value === 'all' || row.type === $('type').value)
            && (['current','orphan'].includes(action) || from === -Infinity && to === Infinity || row.timestamp && row.timestamp >= from && row.timestamp <= to)
            && (!['slim','shared'].includes(action) || ((!$('duplicates').checked || row.duplicate) && ($('template').value === 'all' || row.templateIndex === $('template').value))));
    }
    function selectRows(rows, value) {
        for (const row of rows) if (value) selected.add(row.key); else selected.delete(row.key);
        invalidate(); render();
    }
    function render() {
        if (!report) return;
        const action = $('action').value;
        const impacts = { slim: '仅移除消息内模板或模板引用；保留正则、编辑关联信息、正文及展示历史。共享库中的旧模板不会自动删除。',
            shared: '同一会话中内容完全相同的模板共享一份，独有模板仍保留；正文和展示历史不变。',
            history: '删除所选可翻看的历史状态，聊天正文保留。当前状态及其对应记录受到保护。',
            current: '清空当前显示的状态，并删除对应展示记录；聊天正文和其他历史状态保留。这是独立的高影响操作。',
            orphan: '仅删除经检测没有任何消息或其他记录引用的共享模板；执行前再次检查引用。' };
        $('impact').textContent = impacts[action];
        $('duplicates').closest('label').hidden = !['slim','shared'].includes(action);
        $('template-label').hidden = !['slim','shared'].includes(action);
        $('date-range').hidden = ['current','orphan'].includes(action);
        $('keep').closest('label').hidden = ['current','orphan'].includes(action);
        const rows = filteredRows();
        const groups = new Map();
        for (const row of rows) { const key = JSON.stringify([row.type,row.chatId]); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); }
        const chats = [...groups.values()];
        const size = values => values.reduce((sum,row) => sum + row.size, 0);
        chats.sort((a,b) => $('sort').value === 'name' ? a[0].name.localeCompare(b[0].name, 'zh-CN') : $('sort').value === 'count' ? b.length - a.length : size(b) - size(a));
        $('list').replaceChildren();
        for (const items of chats) renderGroup(items);
        if (!chats.length) $('list').append(element('p','storage-chat-empty','没有符合条件的可处理数据。必要正则和当前状态对应历史不会列为普通模板清理项。'));
        $('select-filtered').textContent = `全选当前结果（${rows.length} 项）`;
        $('select-all').textContent = `跨筛选全选（${eligibleRows().length} 项，保留限制生效）`;
        updateCount(); renderSelected();
    }
    function renderGroup(rows) {
        const details = element('details','status-storage-details');
        const summary = element('summary','status-storage-group');
        const chosen = rows.filter(row => selected.has(row.key)).length;
        const cb = check('', chosen === rows.length, value => selectRows(rows, value)); cb.input.indeterminate = chosen > 0 && chosen < rows.length;
        cb.input.setAttribute('aria-label', '选择 ' + rows[0].name + ' 的当前筛选项');
        cb.label.addEventListener('click', event => event.stopPropagation());
        const text = element('span','status-storage-group-name',rows[0].name);
        const meta = element('small','',`${rows.length} 项 · ${format(rows.reduce((sum,row) => sum + row.size,0))}`);
        summary.append(cb.label,text,meta); details.append(summary);
        const list = element('div','status-storage-message-list'); details.append(list);
        let limit = 40;
        const fill = () => {
            list.replaceChildren();
            for (const row of rows.slice(0, limit)) {
                const item = check(`${date(row.timestamp)} · ${row.label} · ${format(row.size)}`, selected.has(row.key), value => {
                    value ? selected.add(row.key) : selected.delete(row.key); invalidate(); updateCount(); renderSelected();
                    const count = rows.filter(entry => selected.has(entry.key)).length; cb.input.checked = count === rows.length; cb.input.indeterminate = count > 0 && count < rows.length;
                });
                list.append(item.label);
                if (row.kind === 'message') {
                    const preview = element('details','status-storage-details'); preview.append(element('summary','','查看模板内容（只读）'));
                    preview.addEventListener('toggle', () => { if (preview.open && preview.childNodes.length === 1) {
                        const source = element('textarea','status-storage-source'); source.readOnly = true; source.value = row.template;
                        source.setAttribute('aria-label','模板内容'); preview.append(source);
                    } }); list.append(preview);
                }
            }
            if (rows.length > limit) list.append(button(`再显示 40 项（还剩 ${rows.length - limit} 项）`, () => { limit += 40; fill(); }));
        };
        details.addEventListener('toggle', () => { if (details.open && !list.childNodes.length) fill(); });
        $('list').append(details);
    }
    function updateCount() {
        const visible = new Set(filteredRows().map(row => row.key));
        const hidden = [...selected].filter(key => !visible.has(key)).length;
        $('count').textContent = `已选 ${selected.size} 项，其中 ${hidden} 项不在当前筛选结果。预览会列出全部已选项。`;
        $('preview-open').disabled = busy || !selected.size;
    }
    function renderSelected() {
        if ($('selected').hidden) return;
        $('selected').replaceChildren();
        const rows = report?.rows.filter(row => selected.has(row.key)) || [];
        // 已选清单也分块显示，避免大存档一次创建数万个节点。
        let limit = 60;
        const fill = () => {
            $('selected').replaceChildren();
            rows.slice(0, limit).forEach(row => $('selected').append(check(`${row.name} · ${row.label}`, true, () => { selected.delete(row.key); invalidate(); updateCount(); renderSelected(); }).label));
            if (rows.length > limit) $('selected').append(button('显示更多已选项', () => { limit += 60; fill(); }));
        }; fill();
    }
    function preview() {
        if (busy || !report || !selected.size) return;
        if (!Number.isSafeInteger(Number($('keep').value)) || Number($('keep').value) < 0) { status('保留最近条数必须是非负整数。'); return; }
        if ($('from').value && $('to').value && $('from').value > $('to').value) { status('起始日期不能晚于结束日期。'); return; }
        try {
            plan = window.StatusStorage.buildPlan(report.rows.filter(row => selected.has(row.key)), $('action').value);
            backupSaved = false; $('saved').checked = false; $('risk').checked = false;
            $('preview-text').textContent = `将处理 ${plan.groups.length} 个会话、${plan.count} 项。预计减少约 ${format(plan.reduction)} 数据（不等于磁盘立即释放量）。\n${$('impact').textContent}\n全部必要匹配信息保留。异常数据不处理。`;
            $('preview-list').replaceChildren();
            plan.groups.forEach(group => {
                const detail = element('details','status-storage-details'); detail.append(element('summary','',`${group.name} · ${group.rows.length} 项`));
                const list = element('div','status-storage-note'); detail.append(list);
                detail.addEventListener('toggle', () => { if (detail.open && !list.childNodes.length) {
                    let limit = 40;
                    const fill = () => { list.replaceChildren(); group.rows.slice(0,limit).forEach(row => list.append(element('p','',row.label))); if (group.rows.length > limit) list.append(button('显示更多', () => { limit += 40; fill(); })); }; fill();
                } }); $('preview-list').append(detail);
            });
            $('risk-label').hidden = !['history','current'].includes(plan.action);
            $('preview').hidden = false; $('execute').disabled = false;
            $('preview').scrollIntoView({ block: 'start', behavior: 'smooth' }); status('请核对预览、备份方式与影响，然后手动确认执行。');
        } catch (error) { fail(error); }
    }

    async function download(blob, filename) {
        return OvoFileDownload.save(blob, filename);
    }
    function packArchive(value) {
        const templates = {}, ids = new Map(); let next = 0;
        const packed = structuredClone(value);
        for (const group of packed.groups) for (const change of group.changes) if (change.kind === 'message') {
            if (!ids.has(change.template)) { const id = 't' + next++; ids.set(change.template,id); templates[id] = change.template; }
            change.backupTemplate = ids.get(change.template); delete change.template;
            if (Object.hasOwn(change.before,'replacePattern')) { change.hadInlineTemplate = true; delete change.before.replacePattern; }
        }
        packed.templates = templates; return packed;
    }
    function unpackArchive(value) {
        if (!Array.isArray(value?.groups)) throw new Error('恢复备份结构不完整');
        if (value.templates) for (const group of value.groups) for (const change of group.changes || []) if (change.kind === 'message') {
            if (!Object.hasOwn(value.templates,change.backupTemplate) || typeof value.templates[change.backupTemplate] !== 'string') throw new Error('恢复备份缺少模板内容');
            change.template = value.templates[change.backupTemplate];
            if (change.hadInlineTemplate) change.before.replacePattern = change.template;
            delete change.backupTemplate; delete change.hadInlineTemplate;
        }
        return window.StatusStorage.validateArchive(value);
    }
    async function exportBackup() {
        if (!plan || busy) return;
        setBusy(true,'backup'); taskController = new AbortController();
        try {
            await window.StatusStorage.validate(plan); status('正在生成备份…');
            const full = $('backup').value === 'full';
            let blob, extension;
            if (full) { blob = await createCompressedBackupBlob({ signal:taskController.signal }); extension = '.ee'; }
            else {
                const text = JSON.stringify(packArchive(window.StatusStorage.recoveryArchive(plan)));
                const checksum = globalThis.crypto?.subtle ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(byte => byte.toString(16).padStart(2,'0')).join('') : null;
                blob = new Blob([JSON.stringify({ format: 'ovo-status-recovery-envelope', checksum, payload: JSON.parse(text) })], { type: 'application/json' }); extension = '.json';
                if (typeof CompressionStream !== 'undefined') { blob = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob(); extension += '.gz'; }
            }
            if (taskController.signal.aborted) throw new Error('备份已取消，没有执行整理');
            if (!await download(blob, `${full ? '完整数据备份' : '状态栏整理恢复备份'}_${plan.id}${extension}`)) {
                backupSaved = false; status('尚未完成文件保存，请重试备份。'); return;
            }
            backupSaved = true; status('备份文件已生成并请求下载。请确认文件已保存成功后勾选确认，再执行整理。');
        } catch (error) { backupSaved = false; fail(error); } finally { setBusy(false); }
    }
    async function execute() {
        if (!plan || busy) return;
        if (!$('saved').checked || ($('backup').value !== 'none' && !backupSaved)) { status('请先完成所选备份并确认文件保存，或明确选择无备份执行。'); return; }
        if (['history','current'].includes(plan.action) && !$('risk').checked) { status('请先确认删除展示历史或当前状态的影响。'); return; }
        setBusy(true);
        try {
            await window.StatusStorage.validate(plan);
            const decision = await showAppConfirmDialog({ title: '确认状态栏整理',
                message: `将对 ${plan.groups.length} 个会话的 ${plan.count} 项执行“${$('action').selectedOptions[0].textContent}”。\n${$('impact').textContent}\n${$('backup').value === 'none' ? '本次没有生成恢复备份。' : '请确保备份文件已保存。'}\n失败时停止后续会话；不会自动继续。`,
                confirmText: '确认执行', cancelText: '取消', dismissText: '' });
            if (decision !== 'confirm') return;
            setBusy(true,'operation');
            const result = await window.StatusStorage.run(plan,(index,total,name) => status(`正在处理 ${index + 1}/${total}：${name}`));
            const completed = new Set(result.completed.map(item => JSON.stringify([item.type,item.chatId])));
            for (const row of report.rows) if (completed.has(JSON.stringify([row.type,row.chatId]))) selected.delete(row.key);
            invalidate();
            try { await refreshReport(); }
            catch (error) {
                $('stats').replaceChildren(element('span','','重新读取数据库统计失败，请重新检测。'));
                result.failed.push({ name:'重新检测', reason:error.message });
                render();
            }
            showResult(result);
        } catch (error) { fail(error); } finally { setBusy(false); }
    }
    function showResult(result) {
        const lines = [`已完成 ${result.completed.length} 个会话。`];
        result.completed.forEach(item => lines.push(`${item.name}：${item.count} 项${item.reduction === undefined ? '' : '，数据库回读已核验，模板及所选状态数据估算减少 ' + format(item.reduction)}`));
        result.failed.forEach(item => lines.push(`失败：${item.name} · ${item.reason}`));
        if (result.pending.length) lines.push('尚未处理：' + result.pending.join('、'));
        if (result.conflicts?.length) lines.push('未恢复或无需恢复：\n' + result.conflicts.join('\n'));
        lines.push(result.action === 'restore' || result.failed.some(item => item.name === '重新检测')
            ? '请重新检测核对。备份恢复不会自动执行。'
            : '列表与占用已重新读取数据库；失败及尚未处理的候选保留。备份恢复不会自动执行。');
        $('result').textContent = lines.join('\n'); $('result').hidden = false;
        status(result.failed.length || result.pending.length ? '操作未全部完成，请查看失败及未处理项。'
            : result.action === 'restore' ? '恢复完成，请重新检测核对。' : '操作完成，清理结果已通过数据库回读核验。');
    }

    const policySelected = new Set();
    function renderPolicies() {
        $('global-label').textContent = `全局默认：${modes[db.statusStorageSettings?.mode] || modes.full}。已选 ${policySelected.size} 个角色。`;
        $('policy-list').replaceChildren(); const query = $('policy-search').value.trim().toLowerCase();
        for (const chat of (db.characters || [])) {
            const name = chat.remarkName || chat.realName || chat.id;
            if (query && !name.toLowerCase().includes(query)) continue;
            const local = chat.statusPanel?.snapshotStorageMode;
            $('policy-list').append(check(`${name} · ${local ? '角色覆盖' : '跟随全局'}：${modes[window.StatusStorage.policy(chat)]} · 编辑旧消息${chat.statusPanel?.compactEditedSnapshots ? '按当前策略' : '保持原方式'}`,
                policySelected.has(chat.id), value => { value ? policySelected.add(chat.id) : policySelected.delete(chat.id); $('global-label').textContent = `全局默认：${modes[db.statusStorageSettings?.mode] || modes.full}。已选 ${policySelected.size} 个角色。`; }).label);
        }
    }
    async function savePolicy() {
        if (busy) return;
        if (!policySelected.size && !$('global').checked) { status('请勾选角色或“应用为全局默认”。'); return; }
        setBusy(true);
        try {
            const decision = await showAppConfirmDialog({ title: '保存新消息策略', message: `将对 ${policySelected.size} 个角色${$('global').checked ? '及全局默认' : ''}设置“${$('mode').selectedOptions[0].textContent}”。已有消息不改动。${$('set-edit').checked && $('edit').checked ? '\n已开启编辑旧消息时也整理模板；精简策略可能移除被编辑消息的模板副本。' : ''}`,
                confirmText: '保存设置', cancelText: '取消', dismissText: '' });
            if (decision !== 'confirm') return;
            await window.StatusStorage.setPolicies($('mode').value,[...policySelected],$('global').checked,$('set-edit').checked ? $('edit').checked : undefined);
            policySelected.clear(); renderPolicies(); status('保存成功。已有消息没有批量整理，新消息按所选策略保存。');
        }
        catch (error) { fail(error); } finally { setBusy(false); }
    }

    let restorePreview = null;
    async function readArchive() {
        const file = $('file').files[0]; if (!file || busy) return;
        archive = null; restoreSelected.clear(); restorePreview = null; renderRestore(); $('file-info').textContent = ''; setBusy(true);
        try {
            let blob = file;
            const signature = new Uint8Array(await file.slice(0,2).arrayBuffer());
            if (signature[0] === 31 && signature[1] === 139) {
                if (typeof DecompressionStream === 'undefined') throw new Error('当前浏览器无法解压此备份，请换支持解压的浏览器');
                blob = await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).blob();
            }
            const envelope = JSON.parse(await blob.text()); let payload = envelope;
            if (envelope.format === 'ovo-status-recovery-envelope') {
                payload = envelope.payload;
                if (envelope.checksum) {
                    if (!globalThis.crypto?.subtle) throw new Error('当前环境无法校验备份完整性');
                    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload))))).map(byte => byte.toString(16).padStart(2,'0')).join('');
                    if (digest !== envelope.checksum) throw new Error('备份完整性校验失败，未恢复任何数据');
                }
            }
            archive = unpackArchive(payload); $('file-info').textContent = `${file.name} · ${archive.groups.length} 个会话 · ${date(archive.createdAt)}。所有会话默认未选。`;
            renderRestore(); status('备份已读取。请选择会话，预览恢复与冲突。');
        } catch (error) { fail(error); } finally { $('file').value = ''; setBusy(false); }
    }
    function renderRestore() {
        restorePreview = null; $('restore-execute').disabled = true; $('restore-summary').textContent = '';
        $('restore-list').replaceChildren();
        archive?.groups.forEach(group => {
            const key = JSON.stringify([group.type,group.chatId]);
            $('restore-list').append(check(`${group.name} · ${group.changes.length} 项`,restoreSelected.has(key),value => { value ? restoreSelected.add(key) : restoreSelected.delete(key); restorePreview = null; $('restore-execute').disabled = true; }).label);
        });
    }
    function previewRestore() {
        if (!archive || !restoreSelected.size) { status('请先读取恢复备份并勾选会话。'); return; }
        try {
            restorePreview = window.StatusStorage.previewRestore(archive,restoreSelected,$('force').checked);
            $('restore-summary').textContent = `可恢复 ${restorePreview.restorable} 项。\n${restorePreview.conflicts.join('\n') || '没有发现冲突。'}\n历史记录将合并恢复，不覆盖新增聊天。`;
            $('restore-execute').disabled = !restorePreview.restorable;
        } catch (error) { fail(error); }
    }
    async function restore() {
        if (busy || !archive || !restorePreview?.restorable) return;
        setBusy(true);
        try {
            const decision = await showAppConfirmDialog({ title: '确认局部恢复', message: `恢复所选 ${restoreSelected.size} 个会话的状态字段或展示记录，聊天正文不替换。${$('force').checked ? '\n你已允许覆盖发生冲突的状态字段或非空的当前状态。' : '\n冲突项目跳过。'}\n恢复前会重新核对，失败时停止后续会话。`, confirmText: '确认恢复', cancelText: '取消', dismissText: '' });
            if (decision !== 'confirm') return;
            setBusy(true,'operation');
            const result = await window.StatusStorage.restore(archive,restoreSelected,$('force').checked,(index,total,name) => status(`正在恢复 ${index + 1}/${total}：${name}`));
            showResult(result); restorePreview = null; report = null;
        }
        catch (error) { fail(error); } finally { setBusy(false); $('restore-execute').disabled = true; }
    }
    window.setupStatusStorageScreen = function () {
        document.getElementById('storage-status-open')?.addEventListener('click', () => void open());
        document.getElementById('setting-status-storage-open')?.addEventListener('click', () => void open('policies'));
    };
})();
