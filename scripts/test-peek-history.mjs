import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const copy = value => JSON.parse(JSON.stringify(value));
let fail = false;
let saves = 0;
const context = vm.createContext({ window: {}, console, crypto: webcrypto,
    peekScreenApps: { messages: { name: '消息' }, memos: { name: '备忘录' } },
    saveCharacter: async () => { saves++; return !fail; }, showToast() {} });
vm.runInContext(fs.readFileSync(new URL('../js/modules/peek/history-and-memory.js', import.meta.url), 'utf8'), context);
const memory = context.window.PeekMemory;
const conversation = (text, name = '小雨', id = 'a') => ({ partnerId: id, partnerName: name, partnerRelation: '朋友', history: [{ sender: 'char', content: text }] });
const character = { id: 'one', peekData: { messages: { conversations: [conversation('旧聊天')] } } };
const other = { id: 'two', peekData: {} };
async function refresh(char, conversations, isCurrent) {
    const data = { conversations };
    return memory.commitGenerated(char, 'messages', data, async () => {
        if (fail) throw new Error('保存失败');
        char.peekData.messages = data;
        return true;
    }, isCurrent);
}

assert.equal(memory.prompt(character), '');
await refresh(character, [conversation('默认刷新')]);
assert.equal(character.peekArchive, undefined, '默认关闭历史，刷新不创建副本');
assert.equal(character.peekContactMemory, undefined);
assert.equal(memory.prompt(character), '', '默认不增加聊天上下文');
assert.equal(memory.prompt(other), '');

await memory.setHistoryApps(character, ['messages']);
assert.equal(character.peekArchive.messages.length, 1, '开启即保存当前内容');
await refresh(character, [conversation('下一批')]);
assert.equal(character.peekArchive.messages.length, 2, '开启后刷新保留旧内容');
assert.equal(character.peekArchive.messages[0].data.conversations[0].history[0].content, '默认刷新');
assert.equal(character.peekArchive.memos, undefined, '未勾选应用不留历史');
assert.equal(memory.prompt(character), '', '仅保存历史不会向角色发送内容');
await memory.setHistoryApps(character, []);
await refresh(character, [conversation('关闭后的内容')]);
assert.equal(character.peekArchive.messages.length, 2, '关闭停止新增，但保留已存历史');

let live = character.peekData.messages.conversations[0];
await memory.setContact(character, live, { mode: 'manual', limit: 20 });
assert.equal(memory.prompt(character), '', '选择手动但未同步时不发送上下文');
await memory.setContact(character, live, { mode: 'manual', limit: 20 }, true);
assert.match(memory.prompt(character), /关闭后的内容/);
assert.doesNotMatch(memory.prompt(character), /用户.*偷看/);
assert.equal(memory.prompt(other), '', '联系人记忆按角色隔离');
await refresh(character, [conversation('新版本')]);
assert.equal(memory.prompt(character), '', '关闭旧内容保留时，旧手动同步不随刷新继续进入上下文');

live = character.peekData.messages.conversations[0];
await memory.setContact(character, live, { mode: 'auto', keepPast: true, limit: 20 });
await refresh(character, [conversation('后续版本')]);
assert.match(memory.prompt(character), /新版本/);
assert.match(memory.prompt(character), /后续版本/);
live = character.peekData.messages.conversations[0];
await memory.editConversation(character, live, [{ sender: 'partner', content: '<script>仅作文本</script>' }]);
const prompt = memory.prompt(character);
assert.match(prompt, /&lt;script&gt;/);
assert.equal(prompt.match(/后续版本/g).length, 1, '连续回复快照共同前缀不会重复进入上下文');
await memory.setContact(character, live, { mode: 'auto', keepPast: false, limit: 1 });
assert.doesNotMatch(memory.prompt(character), /新版本|后续版本/);
assert.match(memory.prompt(character), /仅作文本/);
assert.equal(character.peekContactMemory[live.partnerId].past.length, 0, '关闭保留后清除同步旧副本');

const before = copy(character);
fail = true;
await assert.rejects(memory.setHistoryApps(character, ['memos']), /保存失败/);
assert.deepEqual(copy(character), before, '历史开关保存失败完整恢复');
await assert.rejects(memory.setContact(character, live, { mode: 'off' }), /保存失败/);
assert.deepEqual(copy(character), before, '同步关闭保存失败恢复旧权限');
await assert.rejects(refresh(character, [conversation('不应进入记忆')]), /保存失败/);
assert.deepEqual(copy(character), before, '刷新保存失败不留下未提交的历史和同步副本');
fail = false;

const existingId = live.partnerId;
await refresh(character, [conversation('同名甲'), conversation('同名乙')]);
assert.ok(character.peekData.messages.conversations.every(item => item.partnerId !== existingId), '同名同关系身份有歧义时不继承同步权限');
assert.equal(memory.prompt(character), '', '默认不保留旧版本，不把新同名联系人误同步');
await memory.setContact(character, { partnerId: existingId }, { mode: 'off' });
assert.equal(Object.keys(character.peekContactMemory).length, 0);

await memory.setHistoryApps(character, ['messages']);
const historyBeforeCancel = copy(character.peekArchive);
await refresh(character, [conversation('清空期间返回')], () => false);
assert.deepEqual(copy(character.peekArchive), historyBeforeCancel, '失效请求不会写回历史');
const undo = memory.clearFields(character, ['messages']);
assert.equal(character.peekArchive.messages, undefined);
undo();
assert.deepEqual(copy(character.peekArchive), historyBeforeCancel, '原有清空操作失败时支持恢复新数据');
await memory.clearArchive(character, 'messages');
assert.equal(character.peekArchive.messages, undefined);
assert.ok(character.peekData.messages, '仅清历史保留当前内容');

// 验证实际刷新入口会同时保存历史、恢复失败数据，并保留后台清空防护。
const refreshSource = fs.readFileSync(new URL('../js/modules/peek/prompt-and-generation.js', import.meta.url), 'utf8');
context.db = { characters: [character], apiSettings: { url: 'https://example.test', key: 'fake', model: 'fake' } };
context.currentChatId = character.id;
context.generatingPeekApps = new Set();
context.peekAppViews = { messages: ['screen', () => {}] };
context.getPeekClearRevision = () => 0;
context.filterHistoryForAI = (_, messages) => messages;
context.getPeekResponseFormat = () => 'json';
context.generatePeekContentPrompt = () => '生成聊天';
context.parsePeekResponse = JSON.parse;
context.recordPeekViewedByUser = () => {};
context.fetchAiResponse = async () => JSON.stringify({ conversations: [conversation('真实刷新入口')] });
vm.runInContext(refreshSource.slice(refreshSource.indexOf('async function generateAndRenderPeekContent(')), context);
await memory.setHistoryApps(character, ['messages']);
const oldData = character.peekData.messages;
assert.equal(await context.generateAndRenderPeekContent('messages', { forceRefresh: true, background: true }), true);
assert.equal(character.peekArchive.messages.at(-1).data.conversations[0].history[0].content, '真实刷新入口');
context.fetchAiResponse = async () => JSON.stringify({ conversations: [conversation('保存失败的新内容')] });
const archiveBeforeFailure = copy(character.peekArchive);
const dataBeforeFailure = character.peekData.messages;
fail = true;
assert.equal(await context.generateAndRenderPeekContent('messages', { forceRefresh: true, background: true }), false);
assert.equal(character.peekData.messages, dataBeforeFailure);
assert.deepEqual(copy(character.peekArchive), archiveBeforeFailure);
fail = false;
assert.notEqual(character.peekData.messages, oldData);
const liveForEdit = character.peekData.messages.conversations[0];
await memory.setContact(character, liveForEdit, { mode: 'auto', keepPast: false, limit: 20 });
await memory.editConversation(character, liveForEdit, [{sender:'partner',content:'自动同步的新回复'}], 8);
assert.match(memory.prompt(character), /自动同步的新回复/);
const beforeEdit = copy(character);
fail = true;
await assert.rejects(memory.editConversation(character, liveForEdit, [{sender:'partner',content:'保存失败的回复'}], 25), /保存失败/);
assert.deepEqual(copy(character), beforeEdit, '回复与同步副本保存失败一起回滚');
fail = false;

// 实际单聊入口：自定义模板缺省动态能力时仍能同步，已包含时不重复注入。
const privateSource = fs.readFileSync(new URL('../js/modules/chat-ai/private-prompt.js', import.meta.url), 'utf8');
vm.runInContext(privateSource.slice(0, privateSource.indexOf('function generatePrivateSystemPromptBase(')), context);
context.generatePrivateSystemPromptBase = () => '自定义聊天模板';
assert.match(context.generatePrivateSystemPrompt(character), /自动同步的新回复/);
context.generatePrivateSystemPromptBase = () => memory.prompt(character);
assert.equal(context.generatePrivateSystemPrompt(character).match(/<peek_contact_memory>/g).length, 1);

// 实际清空入口与同步保存共用队列，清空后的旧请求不能复活记忆。
vm.runInContext(fs.readFileSync(new URL('../js/modules/peek/setup-and-storage.js', import.meta.url), 'utf8'), context);
let unblock;
const blocking = memory.serialize(character, () => new Promise(resolve => { unblock = resolve; }));
while (!unblock) await Promise.resolve();
const clearing = context.clearPeekStoredData(character, ['messages'], false);
const lateEdit = memory.editConversation(character, liveForEdit, [{sender:'partner',content:'不应恢复'}]);
unblock();
await blocking;
assert.equal(await clearing, true);
assert.equal(await lateEdit, false);
assert.equal(memory.prompt(character), '');
assert.equal(character.peekArchive.messages, undefined);
assert.ok(saves > 0);
console.log('Peek history/memory passed: default-off, opt-in retention, refresh integration, rollback, per-contact identity, isolation, context limits, and clearing.');
