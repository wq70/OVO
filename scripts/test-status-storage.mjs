import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { File } from 'node:buffer';

const coreSource = fs.readFileSync('js/modules/status-storage.js', 'utf8');
const uiSource = fs.readFileSync('js/modules/status-storage-ui.js', 'utf8');
const template = '<style>' + '状态栏样式'.repeat(1200) + '</style><b>$1</b>';
const regex = String.raw`\[HP:(\d+)\]`;
const oldState = { raw: '[HP:10]', html: '<b>10</b>', timestamp: 10 };
const currentState = { raw: '[HP:30]', html: '<b>30</b>', timestamp: 30 };
function character(id = 'a') {
    return { id, realName: id === 'a' ? '角色甲' : '角色乙', myName: '我', persona: '保留人设',
        history: [10,20,30].map(number => ({ id: `${id}-${number}`, role: 'assistant', timestamp: number,
            content: `[HP:${number}]`, parts: [{ type: 'text', text: `[HP:${number}]` }], isStatusUpdate: true,
            statusSnapshot: { regex, replacePattern: template, ...(number === 20 ? { oldRaw: '[HP:20]' } : {}) } })),
        statusPanel: { enabled: true, regexPattern: regex, replacePattern: template, historyLimit: 3, historyRetentionLimit: 1,
            history: [structuredClone(currentState), { raw: '[HP:20]', html: '<b>20</b>', timestamp: 20 }, structuredClone(oldState)],
            currentStatusRaw: currentState.raw, currentStatusHtml: currentState.html }, theme: 'white_pink' };
}
class Table {
    constructor(key = 'id') { this.key = key; this.rows = new Map(); this.failId = null; this.beforeGet = null; }
    async get(id) { if (this.beforeGet) this.beforeGet(id); const row = this.rows.get(id); return row ? structuredClone(row) : undefined; }
    async put(row) { if (row[this.key] === this.failId) throw new Error('模拟配额不足'); this.rows.set(row[this.key], structuredClone(row)); }
    async bulkPut(rows) { for (const row of rows) await this.put(row); }
}
class Database {
    constructor() { this.characters = new Table(); this.groups = new Table(); this.globalSettings = new Table('key'); this.tail = Promise.resolve(); this.failCommit = false; this.beforeCommit = null; }
    async transaction(_mode, ...args) {
        const fn = args.pop(), tables = args;
        const previous = this.tail; let release;
        this.tail = new Promise(resolve => { release = resolve; }); await previous;
        const originals = tables.map(table => structuredClone(table.rows));
        try {
            const result = await fn();
            this.beforeCommit?.();
            if (this.failCommit) throw new Error('模拟事务提交失败');
            return result;
        } catch (error) { tables.forEach((table,index) => table.rows = originals[index]); throw error; }
        finally { release(); }
    }
}
async function harness(characters = [character()]) {
    const dexieDB = new Database();
    for (const chat of characters) await dexieDB.characters.put(chat);
    const db = { characters, groups: [], myStickers: [] };
    const context = vm.createContext({ window: {}, db, dexieDB, structuredClone, crypto, setTimeout, clearTimeout,
        console: { log() {}, warn() {}, error() {} }, currentChatId: characters[0]?.id, currentChatType: 'private', isGenerating: false,
        showToast() {}, addMessageBubble() {}, renderChatList() {}, getMixedContent: content => [{ type: 'text', content }],
        saveCharacter: async () => true });
    vm.runInContext(coreSource, context);
    return { db, dexieDB, context, api: context.window.StatusStorage };
}
const selection = archive => new Set(archive.groups.map(group => JSON.stringify([group.type,group.chatId])));

// 扫描只读，选择性删除只影响快照模板，当前状态与历史展示保持可用。
{
    const h = await harness(), chat = h.db.characters[0], before = structuredClone(chat);
    const report = await h.api.scan();
    assert.deepEqual(chat, before);
    assert.equal(report.rows.filter(row => row.kind === 'message').length, 3);
    assert.equal(report.rows.filter(row => row.kind === 'history').length, 2, '当前状态对应记录受保护');
    const plan = h.api.buildPlan([report.rows.find(row => row.messageId === 'a-20')], 'slim');
    const backup = h.api.recoveryArchive(plan);
    const result = await h.api.run(plan);
    assert.equal(result.completed.length, 1);
    assert.ok(result.completed[0].reduction > 5000);
    assert.equal(chat.history[1].statusSnapshot.replacePattern, undefined);
    assert.equal(chat.history[1].statusSnapshot.regex, regex);
    assert.equal(chat.history[1].statusSnapshot.oldRaw, '[HP:20]');
    assert.equal(chat.history[0].statusSnapshot.replacePattern, template);
    assert.deepEqual(chat.statusPanel, before.statusPanel);
    assert.equal(chat.persona, before.persona);
    assert.equal((await h.dexieDB.characters.get('a')).history[1].statusSnapshot.replacePattern, undefined);
    vm.runInContext(fs.readFileSync('js/core/ui-and-content-utils.js', 'utf8'), h.context);
    h.context.chatForTest = chat;
    const aiHistory = vm.runInContext('filterHistoryForAI(chatForTest, chatForTest.history)',h.context);
    assert.equal(aiHistory.filter(message => message.isStatusUpdate).length, 3, '清理模板后状态消息仍可进入 AI 上下文');
    chat.history.push({ id: 'new', content: '清理后新增聊天', timestamp: 50 });
    await h.api.persistChats(h.dexieDB.characters, [chat]);
    assert.equal(h.api.previewRestore(backup,selection(backup)).restorable, 1);
    await h.api.restore(backup,selection(backup),false);
    assert.equal(chat.history[1].statusSnapshot.replacePattern, template);
    assert.equal(chat.history.at(-1).content, '清理后新增聊天');
    assert.equal(h.api.previewRestore(backup,selection(backup)).restorable, 0, '重复恢复不重复添加字段');
}

// 共享模板、旧引用、版本引用和无引用模板的独立手动整理。
{
    const h = await harness(), chat = h.db.characters[0];
    const report = await h.api.scan(), rows = report.rows.filter(row => row.kind === 'message');
    const plan = h.api.buildPlan(rows,'shared'), backup = h.api.recoveryArchive(plan);
    await h.api.run(plan);
    assert.equal(Object.keys(chat.statusPanel.snapshotTemplates).length, 1);
    assert.ok(chat.history.every(message => h.api.templateOf(chat,message.statusSnapshot) === template));
    assert.equal(chat.history[0].statusSnapshot.templateRef, backup.groups[0].changes[0].after.templateRef, '备份引用与实际提交引用一致');
    assert.equal(h.api.previewRestore(backup,selection(backup)).restorable, 3);
    const ref = chat.history[0].statusSnapshot.templateRef;
    chat.history[0]._regenVersions = [{ statusSnapshot: { templateRef: ref } }];
    let scan = await h.api.scan();
    await h.api.run(h.api.buildPlan(scan.rows.filter(row => row.kind === 'message'),'slim'));
    scan = await h.api.scan();
    assert.equal(scan.rows.filter(row => row.kind === 'orphan').length, 0, '旧版本引用的模板不能当孤儿删除');
    delete chat.history[0]._regenVersions;
    scan = await h.api.scan();
    const orphan = scan.rows.find(row => row.kind === 'orphan');
    const orphanPlan = h.api.buildPlan([orphan],'orphan'), orphanBackup = h.api.recoveryArchive(orphanPlan);
    await h.api.run(orphanPlan);
    assert.equal(Object.keys(chat.statusPanel.snapshotTemplates).length, 0);
    await h.api.restore(orphanBackup,selection(orphanBackup),false);
    assert.equal(chat.statusPanel.snapshotTemplates[ref],template);
    await h.api.restore(backup,selection(backup),true);
    assert.equal(chat.history[0].statusSnapshot.replacePattern,template);
}

// 真正删除展示记录必须单独选择；恢复不丢失相同历史记录的数量。
{
    const chat = character(); chat.statusPanel.history.push(structuredClone(oldState));
    const h = await harness([chat]);
    const scan = await h.api.scan(), row = scan.rows.find(row => row.kind === 'history' && row.source.raw === oldState.raw);
    const plan = h.api.buildPlan([row],'history'), backup = h.api.recoveryArchive(plan);
    await h.api.run(plan);
    assert.equal(chat.statusPanel.history.filter(item => item.raw === oldState.raw).length, 1);
    assert.equal(chat.statusPanel.currentStatusHtml,currentState.html);
    await h.api.restore(backup,selection(backup),false);
    assert.equal(chat.statusPanel.history.filter(item => item.raw === oldState.raw).length, 2);
    await h.api.restore(backup,selection(backup),false);
    assert.equal(chat.statusPanel.history.filter(item => item.raw === oldState.raw).length, 2);
    const current = (await h.api.scan()).rows.find(row => row.kind === 'current');
    const currentPlan = h.api.buildPlan([current],'current'), currentBackup = h.api.recoveryArchive(currentPlan);
    await h.api.run(currentPlan);
    assert.equal(chat.statusPanel.currentStatusHtml,'');
    assert.equal(chat.statusPanel.history.some(item => item.raw === currentState.raw),false);
    assert.equal(chat.history.length,3);
    await h.api.restore(currentBackup,selection(currentBackup),false);
    assert.equal(chat.statusPanel.currentStatusHtml,currentState.html);
}

// 明确拒绝过期预览、正在生成、异页旧记录；失败回滚且停止后续会话。
{
    const h = await harness([character('a'),character('b')]);
    let report = await h.api.scan(), row = report.rows.find(row => row.kind === 'message');
    const stale = h.api.buildPlan([row],'slim'); h.db.characters[0].history[0].content = '已编辑';
    await assert.rejects(h.api.run(stale),/变化/);
    assert.equal(h.api.isRunning(),false);
    report = await h.api.scan();
    const plan = h.api.buildPlan(report.rows.filter(row => row.kind === 'message'),'slim');
    h.context.isGenerating = true;
    await assert.rejects(h.api.run(plan),/生成回复/); h.context.isGenerating = false;
    h.dexieDB.characters.failId = 'a';
    const before = structuredClone(h.db.characters);
    const failed = await h.api.run(plan);
    assert.equal(failed.completed.length,0); assert.equal(failed.failed.length,1); assert.equal(failed.pending.length,1);
    assert.deepEqual(h.db.characters,before);
    h.dexieDB.characters.failId = null; h.dexieDB.failCommit = true;
    const aborted = await h.api.run(plan);
    assert.equal(aborted.completed.length,0); assert.deepEqual(h.db.characters,before);
    assert.equal((await h.dexieDB.characters.get('a')).history[0].statusSnapshot.replacePattern,template);
    h.dexieDB.failCommit = false;
    const oldCopy = structuredClone(h.db.characters[0]);
    const stopped = await h.api.run(plan,() => h.api.stop());
    assert.equal(stopped.completed.length,1); assert.equal(stopped.pending.length,1);
    await h.api.persistChats(h.dexieDB.characters,[oldCopy]);
    assert.equal(oldCopy.history[0].statusSnapshot.replacePattern, undefined, '纯模板删除的旧副本安全同步，不写回模板');
    const dirtyCopy = structuredClone(before[0]); dirtyCopy.history[0].content = '未保存的本地编辑';
    await assert.rejects(h.api.persistChats(h.dexieDB.characters,[dirtyCopy]),/其他页面/);
    assert.equal(dirtyCopy.history[0].content, '未保存的本地编辑');
    assert.equal((await h.dexieDB.characters.get('a')).history[0].statusSnapshot.replacePattern,undefined);
}

// 提交期间新增的聊天不会被旧的整份历史覆盖。
{
    const h = await harness(), chat = h.db.characters[0];
    const report = await h.api.scan(), plan = h.api.buildPlan([report.rows.find(row => row.kind === 'message')],'slim');
    h.dexieDB.beforeCommit = () => { chat.history.push({ id: 'during',content: '提交期间新增' }); h.dexieDB.beforeCommit = null; };
    await h.api.run(plan);
    assert.equal(chat.history.at(-1).id,'during');
    await h.api.persistChats(h.dexieDB.characters,[chat]);
    assert.equal((await h.dexieDB.characters.get('a')).history.at(-1).id,'during');
}

// 提交期间快照关联信息发生变化，后续普通保存仍不能写回已清理的模板。
{
    const h = await harness(), chat = h.db.characters[0];
    const row = (await h.api.scan()).rows.find(row => row.messageId === 'a-10');
    h.dexieDB.beforeCommit = () => {
        chat.history[0].statusSnapshot.oldRaw = '[HP:9]';
        h.dexieDB.beforeCommit = null;
    };
    const result = await h.api.run(h.api.buildPlan([row], 'slim'));
    assert.equal(result.completed.length, 1);
    assert.equal(chat.history[0].statusSnapshot.oldRaw, '[HP:9]', '保留提交期间修改的关联信息');
    await h.api.persistChats(h.dexieDB.characters, [chat]);
    h.db.characters = [await h.dexieDB.characters.get('a')];
    assert.equal(h.db.characters[0].history[0].statusSnapshot.replacePattern, undefined, '重载后所选模板不能恢复');
    assert.equal((await h.api.scan()).rows.some(row => row.messageId === 'a-10'), false);
}

// 普通保存排在清理提交后执行，不能落入数据库提交与页面同步之间。
{
    const h = await harness(), chat = h.db.characters[0];
    const row = (await h.api.scan()).rows.find(row => row.messageId === 'a-10');
    let queuedSave;
    h.dexieDB.beforeCommit = () => {
        h.dexieDB.beforeCommit = null;
        queuedSave = h.api.persistChats(h.dexieDB.characters, [chat]).then(() => true, error => error.message);
    };
    await h.api.run(h.api.buildPlan([row], 'slim'));
    assert.equal(await queuedSave, true, '同页排队保存不误报其他页面冲突');
    assert.equal((await h.dexieDB.characters.get('a')).history[0].statusSnapshot.replacePattern, undefined);
}

// 新保存策略不迁移旧消息；默认、角色覆盖、跟随全局与编辑保留行为。
// 写入请求被忽略时，事务内核验拒绝假成功并回滚；提交后读失败也不能报告完成。
{
    const h = await harness(), chat = h.db.characters[0];
    const rows = (await h.api.scan()).rows.filter(row => row.kind === 'message');
    const plan = h.api.buildPlan(rows, 'slim');
    const put = h.dexieDB.characters.put;
    h.dexieDB.characters.put = async () => {};
    let result = await h.api.run(plan);
    assert.equal(result.completed.length, 0);
    assert.match(result.failed[0].reason, /核验/);
    assert.ok(chat.history.every(message => message.statusSnapshot.replacePattern));
    h.dexieDB.characters.put = put;
    h.dexieDB.beforeCommit = () => {
        h.dexieDB.beforeCommit = null;
        h.dexieDB.characters.beforeGet = () => {
            h.dexieDB.characters.beforeGet = null;
            throw new Error('模拟提交后磁盘读取失败');
        };
    };
    result = await h.api.run(plan);
    assert.equal(result.completed.length, 0);
    assert.equal(result.failed[0].committed, true);
    assert.match(result.failed[0].reason, /写入已提交/);
    assert.ok(chat.history.every(message => message.statusSnapshot.replacePattern), '未核验成功时不假装页面已同步');
    const report = await h.api.scan(null, null, { persisted:true });
    assert.equal(report.rows.filter(row => row.kind === 'message').length, 0, '重新检测读数据库，不能把旧内存模板再列出来');
    assert.ok(chat.history.every(message => !message.statusSnapshot.replacePattern), '纯模板删除可安全同步页面');
}

// 大快照清理后普通保存并重载，数据库中的原模板保持删除。
{
    const largeTemplate = '<style>' + 'x'.repeat(20 * 1024) + '</style><b>$1</b>';
    const chat = character();
    chat.history = Array.from({ length:7000 }, (_, index) => ({ id:'large-' + index,
        role:'assistant', content:'[HP:10]', timestamp:index, statusSnapshot:{ regex, replacePattern:largeTemplate } }));
    const h = await harness([chat]);
    // 使用实际页面的估算函数，不把 130MB 快照拼成额外的整库 JSON 字符串。
    const storageSource = fs.readFileSync('js/modules/storage.js', 'utf8');
    vm.runInContext(storageSource.slice(storageSource.indexOf('function estimateLegacyStorageValue'),
        storageSource.indexOf('async function analyzeLegacyChatStorage')), h.context);
    let report = await h.api.scan(null, null, { persisted:true });
    assert.ok(report.stats.templates > 130 * 1024 * 1024);
    const result = await h.api.run(h.api.buildPlan(report.rows.filter(row => row.kind === 'message'), 'slim'));
    assert.equal(result.completed.length, 1);
    assert.equal(result.completed[0].verified, true);
    assert.ok(result.completed[0].reduction > 130 * 1024 * 1024);
    await h.api.persistChats(h.dexieDB.characters, [chat]);
    h.db.characters = [await h.dexieDB.characters.get('a')];
    report = await h.api.scan(null, null, { persisted:true });
    assert.equal(report.stats.templates, 0);
    assert.equal(report.rows.filter(row => row.kind === 'message').length, 0);
    assert.equal(h.db.characters[0].history.length, 7000);
    assert.equal(h.db.characters[0].statusPanel.currentStatusHtml, currentState.html);
}

// 新保存策略不迁移旧消息；默认、角色覆盖、跟随全局与编辑保留行为。
{
    const h = await harness(), chat = h.db.characters[0], before = structuredClone(chat.history);
    assert.equal(h.api.policy(chat),'full');
    await h.api.setPolicies('slim',[],true);
    assert.deepEqual(chat.history,before); assert.equal(h.api.policy(chat),'slim');
    assert.equal(h.api.makeSnapshot(chat,regex).replacePattern,undefined);
    assert.equal(h.api.makeSnapshot(chat,regex,'[HP:10]',chat.history[0].statusSnapshot).replacePattern,template);
    await h.api.setPolicies('shared',['a'],false,true);
    assert.equal(h.api.policy(chat),'shared');
    const a = h.api.makeSnapshot(chat,regex), b = h.api.makeSnapshot(chat,regex);
    assert.equal(a.templateRef,b.templateRef); assert.equal(h.api.templateOf(chat,a),template);
    await h.api.setPolicies('inherit',['a'],false,false);
    assert.equal(h.api.policy(chat),'slim'); assert.deepEqual(chat.history,before);
    await h.api.setPolicies('slim',['a'],false,true);
    assert.equal(h.api.makeSnapshot(chat,regex,'[HP:10]',chat.history[0].statusSnapshot).replacePattern,undefined);
    const priorSetting = structuredClone(h.db.statusStorageSettings);
    await h.api.setPolicies('full',[],true);
    await assert.rejects(h.api.persistSetting(priorSetting),/其他页面/);
}

// 实际 AI 回复处理入口验证三种策略与“不因超过参考条数自动删除”。
{
    const h = await harness(), chat = h.db.characters[0];
    vm.runInContext(fs.readFileSync('js/modules/chat-ai/response-and-control.js','utf8'),h.context);
    for (const mode of ['full','slim','shared']) {
        chat.statusPanel.snapshotStorageMode = mode;
        const beforeCount = chat.statusPanel.history.length;
        h.context.replyChat = chat;
        await vm.runInContext("handleAiReplyContent('[HP:40]',replyChat,'a','private',true,false,{suppressAutoTasks:true})",h.context);
        assert.equal(chat.statusPanel.history.length,beforeCount + 1);
        const snapshot = chat.history.at(-1).statusSnapshot;
        assert.equal(snapshot.regex,regex);
        assert.equal(typeof snapshot.replacePattern === 'string',mode === 'full');
        assert.equal(typeof snapshot.templateRef === 'string',mode === 'shared');
        assert.ok(chat.statusPanel.currentStatusHtml.includes('40'));
    }
}

// 局部恢复冲突和异常存档均有明确边界。
{
    const h = await harness(), chat = h.db.characters[0];
    let report = await h.api.scan(), plan = h.api.buildPlan([report.rows.find(row => row.kind === 'message')],'slim');
    const backup = h.api.recoveryArchive(plan); await h.api.run(plan);
    chat.history[0].content = '用户后来编辑的正文';
    assert.equal(h.api.previewRestore(backup,selection(backup)).restorable,0);
    await h.api.restore(backup,selection(backup),true);
    assert.equal(chat.history[0].content,'用户后来编辑的正文');
    assert.equal(chat.history[0].statusSnapshot.replacePattern,template);
    chat.history.push({ id: 'bad', statusSnapshot: { regex,templateRef: 'missing' } },
        { id: 'a-20',statusSnapshot: { regex,replacePattern: template } });
    report = await h.api.scan();
    assert.ok(report.issues.length >= 3);
    assert.ok(report.rows.every(row => row.messageId !== 'bad' && row.messageId !== 'a-20'));
    assert.throws(() => h.api.validateArchive({ format:'ovo-status-recovery',formatRevision:1,groups:[{ type:'private',chatId:'a',changes:[{kind:'unknown'}] }] }),/未知操作/);
}

// 用户操作链：入口→默认未选→筛选全选→预览→备份→确认→结果→局部恢复→新消息设置。
{
    const h = await harness([character('a'),character('b')]);
    const markup = fs.readFileSync('src/html/screens/magic-storage-peek.html','utf8')
        + fs.readFileSync('src/html/screens/chat-settings/extensions.html','utf8');
    const dom = new JSDOM('<!doctype html><body>' + markup + '</body>', { runScripts:'outside-only',url:'https://local.test/' });
    const w = dom.window;
    Object.assign(w,{ db:h.db,dexieDB:h.dexieDB,structuredClone,TextEncoder,Blob,File,showToast() {} });
    Object.defineProperty(w,'crypto',{ value:crypto });
    w.HTMLElement.prototype.scrollIntoView = function () {};
    let downloaded = null, confirmations = 0;
    w.URL.createObjectURL = blob => { downloaded = blob; return 'blob:test'; }; w.URL.revokeObjectURL = () => {};
    w.HTMLAnchorElement.prototype.click = function () {};
    w.showAppConfirmDialog = async () => { confirmations++; return 'confirm'; };
    w.eval(fs.readFileSync('js/core/file-download.js', 'utf8'));
    w.eval(coreSource); w.eval(uiSource); w.setupStatusStorageScreen();
    const get = id => w.document.getElementById('status-storage-' + id);
    const change = (id,value) => { get(id).value = value; get(id).dispatchEvent(new w.Event('input',{ bubbles:true })); };
    const wait = async predicate => { for (let attempt=0;attempt<80;attempt++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve,5)); } throw new Error('UI 操作没有完成'); };
    w.document.getElementById('storage-status-open').click();
    await wait(() => get('status').textContent.includes('检测完成'));
    assert.ok(get('modal').classList.contains('visible'));
    assert.match(get('count').textContent,/已选 0 项/);
    assert.equal(get('preview-open').disabled,true);
    change('keep','1'); get('select-all').click(); assert.match(get('count').textContent,/已选 4 项/);
    get('select-none').click(); change('keep','0');
    change('search','角色甲'); get('select-filtered').click();
    assert.match(get('count').textContent,/已选 3 项/);
    change('search','角色乙'); assert.match(get('count').textContent,/3 项不在当前/);
    get('preview-open').click(); assert.equal(get('preview').hidden,false);
    assert.match(get('preview-text').textContent,/1 个会话、3 项/);
    get('execute').click(); assert.match(get('status').textContent,/先完成所选备份/);
    get('export').click(); await wait(() => downloaded && get('status').textContent.includes('文件已生成'));
    get('saved').checked = true; get('execute').click();
    await wait(() => !get('result').hidden && get('result').textContent.includes('已完成 1 个会话'));
    assert.ok(h.db.characters[0].history.every(message => !message.statusSnapshot.replacePattern));
    assert.ok(h.db.characters[1].history.every(message => message.statusSnapshot.replacePattern));
    assert.match(get('stats').textContent, /消息内模板：约/);
    assert.match(get('result').textContent, /数据库回读已核验/);
    w.document.querySelector('[data-view="restore"]').click();
    const file = new File([await downloaded.arrayBuffer()],'恢复.json',{ type:'application/json' });
    Object.defineProperty(get('file'),'files',{ configurable:true,value:[file] }); get('file').dispatchEvent(new w.Event('change'));
    await wait(() => get('file-info').textContent.includes('1 个会话'));
    assert.equal(get('restore-list').querySelector('input').checked,false);
    assert.equal(get('restore-execute').disabled,true);
    get('restore-all').click(); get('restore-preview').click(); assert.match(get('restore-summary').textContent,/可恢复 3 项/);
    get('restore-execute').click(); await wait(() => h.db.characters[0].history.every(message => message.statusSnapshot.replacePattern) && get('stop').hidden);
    w.document.querySelector('[data-view="policies"]').click();
    assert.ok([...get('policy-list').querySelectorAll('input')].every(input => !input.checked));
    get('mode').value = 'slim'; get('global').checked = true; get('policy-save').click();
    await wait(() => h.db.statusStorageSettings?.mode === 'slim');
    assert.ok(h.db.characters[0].history.every(message => message.statusSnapshot.replacePattern), '切换策略不清理旧消息');
    assert.equal(confirmations,3);
    get('close').click(); assert.equal(get('modal').classList.contains('visible'),false);
    assert.ok(w.document.getElementById('storage-audit-clean'), '原有图片清理入口保留');
    assert.ok(w.document.getElementById('setting-status-history-limit'), '发送给 AI 的条数配置保留');
    dom.window.close();
}
// 部分失败仍列出失败会话，统计和重新打开后的列表来自数据库。
{
    const h = await harness([character('a'), character('b')]);
    const markup = fs.readFileSync('src/html/screens/magic-storage-peek.html', 'utf8');
    const dom = new JSDOM('<!doctype html><body>' + markup + '</body>', { runScripts:'outside-only', url:'https://local.test/' });
    const w = dom.window;
    Object.assign(w, { db:h.db, dexieDB:h.dexieDB, structuredClone });
    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.showAppConfirmDialog = async () => 'confirm';
    w.eval(coreSource); w.eval(uiSource); w.setupStatusStorageScreen();
    const get = id => w.document.getElementById('status-storage-' + id);
    const wait = async predicate => { for (let attempt=0; attempt<100; attempt++) {
        if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 5));
    } throw new Error('失败结果 UI 操作没有完成'); };
    w.document.getElementById('storage-status-open').click();
    await wait(() => get('status').textContent.includes('检测完成'));
    get('select-all').click(); get('preview-open').click();
    get('backup').value = 'none'; get('backup').dispatchEvent(new w.Event('change')); get('saved').checked = true;
    h.dexieDB.characters.failId = 'b';
    get('execute').click();
    await wait(() => !get('result').hidden && get('stop').hidden);
    assert.match(get('result').textContent, /已完成 1 个会话/);
    assert.match(get('result').textContent, /失败：角色乙/);
    assert.match(get('list').textContent, /角色乙/);
    assert.doesNotMatch(get('list').textContent, /角色甲/);
    assert.match(get('count').textContent, /已选 3 项/);
    assert.match(get('last').textContent, /失败：角色乙/);
    // 故意让页面重持有旧副本；重新打开必须从数据库检测，并安全同步纯模板差异。
    h.db.characters[0] = character('a');
    get('close').click(); w.document.getElementById('storage-status-open').click();
    await wait(() => get('status').textContent.includes('检测完成') && get('stop').hidden);
    assert.doesNotMatch(get('list').textContent, /角色甲/);
    assert.match(get('list').textContent, /角色乙/);
    assert.ok(h.db.characters[0].history.every(message => !message.statusSnapshot.replacePattern));
    dom.window.close();
}

console.log('Status storage tests passed: 130MB cleanup/reload, verified commits, rollback, queued saves, stale copies, selective cleanup, backup/restore, and failure UI.');
