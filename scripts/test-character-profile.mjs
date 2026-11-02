import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const inputs = new Map();
const saved = new Map();
const bubbles = [];
const notices = [];
let failSave = false;
let saveHook;
const db = { characters: [], groups: [], magicRoom: {}, apiSettings: {}, favorites: [], myStickers: [], piggyBank: {}, forumSettings: {}, cotSettings: {}, bubbleCssPresets: {}, forumMessages: [] };
const context = vm.createContext({
    console, setTimeout, clearTimeout, URL, crypto, db, window: {},
    document: { getElementById: id => inputs.get(id) || null, addEventListener() {} },
    currentChatId: 'viewed', currentChatType: 'private',
    saveCharacter: async id => {
        if (saveHook) await saveHook();
        if (failSave === 'throw') throw new Error('disk unavailable');
        if (failSave) return false;
        saved.set(id, structuredClone(db.characters.find(c => c.id === id)));
        return true;
    },
    saveGroup: async () => true,
    showToast: text => notices.push(text),
    renderChatList() {}, renderContactList() {},
    addMessageBubble: (message, id, type) => bubbles.push({ message, id, type }),
    getActiveWorldBooksContents: () => ({ before: '', middle: '', after: '' }),
    getEffectivePersona: chat => chat.persona || '',
    getOnlineLogicRules: () => '聊天规则', getOnlineOutputFormats: () => '消息格式',
    getLocalTimeInTimezone: () => '', filterHistoryForAI: (_, history) => history,
    pad: value => String(value).padStart(2, '0')
});
for (const file of ['js/modules/character-profile.js', 'js/modules/poke.js', 'js/modules/interactive-messages.js', 'js/modules/chat-ai/prompt-studio.js', 'js/modules/chat-ai/private-prompt.js', 'js/modules/chat-ai/response-and-control.js']) {
    vm.runInContext(read(file), context, { filename: file });
}
const api = context.window.CharacterProfile;
const utilsContext = vm.createContext({ window: context.window, console });
vm.runInContext(read('js/core/ui-and-content-utils.js'), utilsContext);
context.getMixedContent = utilsContext.getMixedContent;
const permissions = ['allowCharacterRemarkUpdate', 'allowUserRemarkUpdate', 'allowCharacterPokeUpdate', 'allowUserPokeUpdate'];
const keys = ['remarkName', 'userRemarkName', 'pokeCharacterSuffix', 'pokeUserSuffix'];
const names = ['characterRemark', 'userRemark', 'characterPoke', 'userPoke'];
const command = (name, value) => `[PROFILE:${name}=${JSON.stringify(value)}]`;
let serial = 0;
function character(options = {}) {
    const chat = { id: 'test-' + ++serial, realName: '陆沉', remarkName: '旧备注', myName: '原名字', history: [], nodes: [], memoryJournals: [], persona: '', myPersona: '', status: '在线', ...options };
    db.characters.push(chat);
    return chat;
}
function enable(chat) { permissions.forEach(key => { chat[key] = true; }); chat.pokeEnabled = true; return chat; }

// 全部 16 种权限组合：未打开的项目无法执行，身份名字和其他角色保持独立。
for (let mask = 0; mask < 16; mask++) {
    const chat = character({ pokeEnabled: true });
    permissions.forEach((key, index) => { chat[key] = !!(mask & (1 << index)); });
    const other = character();
    const result = await api.consumeAiCommands(names.map((name, index) => command(name, '新值' + index)).join('\n'), chat, 'private');
    assert.equal(result.ok, true);
    keys.forEach((key, index) => assert.equal(chat[key], mask & (1 << index) ? '新值' + index : index === 0 ? '旧备注' : undefined));
    assert.equal(result.messages.length, permissions.filter(key => chat[key]).length);
    assert.equal(result.cleaned, '');
    assert.equal(chat.myName, '原名字');
    assert.equal(other.remarkName, '旧备注');
    if (result.messages.length) assert.equal(saved.get(chat.id).history.length, result.messages.length);
    result.messages.forEach(message => assert.equal(message.isContextDisabled, true));
}

const disabledPoke = enable(character({ pokeAllowCharacterInitiated: false }));
disabledPoke.pokeEnabled = false;
await api.consumeAiCommands(command('characterPoke', '的脑袋'), disabledPoke, 'private');
assert.equal(disabledPoke.pokeCharacterSuffix, undefined, '拍一拍总开关必须开启');
disabledPoke.pokeEnabled = true;
await api.consumeAiCommands(command('characterPoke', '的脑袋'), disabledPoke, 'private');
assert.equal(disabledPoke.pokeCharacterSuffix, '的脑袋', '无需开启角色主动拍一拍');

const group = enable({ id: 'group', history: [], remarkName: '群备注' });
const deniedGroup = await api.consumeAiCommands(names.map(name => command(name, '禁止')).join('\n'), group, 'group');
assert.equal(group.remarkName, '群备注');
assert.equal(deniedGroup.messages.length, 0);
assert.equal(deniedGroup.cleaned, '');
const deleted = enable(character());
db.characters = db.characters.filter(c => c !== deleted);
await api.consumeAiCommands(command('characterRemark', '禁止'), deleted, 'private');
assert.equal(deleted.remarkName, '旧备注', '已删除的角色不能被迟到回复重新写入');

const chat = enable(character());
for (const text of [
    command('characterRemark', ''), command('characterRemark', '长'.repeat(25)),
    command('userRemark', '<img src=x>'), command('userRemark', 'a\nb'),
    command('characterPoke', '长'.repeat(21)), '[PROFILE:userRemark=无效 JSON]', '[PROFILE:userRemark="截断',
    '[PROFILE:myName="冒名"]', '[PROFILE:allowUserRemarkUpdate=true]',
    `<thinking>${command('userRemark', '思考示例')}</thinking>`,
    `<think>${command('userRemark', '未闭合思考')}`,
    '```text\n' + command('userRemark', '代码示例') + '\n```',
    '~~~text\n' + command('userRemark', '代码示例') + '\n~~~',
    '> ' + command('userRemark', '引用示例'),
    '[陆沉的消息：' + command('userRemark', '消息里的示例') + ']'
]) {
    const result = await api.consumeAiCommands(text, chat, 'private');
    assert.equal(result.messages.length, 0, text);
    assert.equal(chat.userRemarkName, undefined);
    assert.ok(!result.cleaned.includes('[PROFILE:'), '内部指令应移除');
}
let result = await api.consumeAiCommands(command('userRemark', '小"月亮]🌙') + '\n' + command('userRemark', '第二次'), chat, 'private');
assert.equal(chat.userRemarkName, '小"月亮]🌙', '字符串中的引号与方括号可正确处理');
assert.equal(result.messages.length, 1, '每项每轮最多一次');
result = await api.consumeAiCommands(command('userRemark', chat.userRemarkName), chat, 'private');
assert.equal(result.messages.length, 0, '相同内容不产生提示');
await api.consumeAiCommands(command('userRemark', '') + '\n' + command('userPoke', ''), chat, 'private');
assert.equal(chat.userRemarkName, '');
assert.equal(chat.myName, '原名字');

// 保存失败恢复原字段（包含字段原本不存在的情况），不发布成功提示。
for (const mode of [true, 'throw']) {
    const failed = enable(character());
    failSave = mode;
    const failure = await api.consumeAiCommands(command('characterRemark', '未保存') + '\n' + command('userRemark', '未保存'), failed, 'private');
    assert.equal(failure.ok, false);
    assert.equal(failed.remarkName, '旧备注');
    assert.equal(Object.hasOwn(failed, 'userRemarkName'), false);
    assert.equal(failed.history.length, 0);
    assert.equal(failure.messages.length, 0);
}
failSave = false;

const editedDuringSave = enable(character({ userRemarkName: '原备注' }));
failSave = true;
saveHook = async () => {
    editedDuringSave.userRemarkName = '用户正在手动修改';
    editedDuringSave.history.push({ id: 'concurrent-user-message', role: 'user', content: '同时发来的消息' });
};
await api.consumeAiCommands(command('userRemark', '待保存的新备注'), editedDuringSave, 'private');
assert.equal(editedDuringSave.userRemarkName, '用户正在手动修改', '失败回滚不覆盖并发手动修改');
assert.equal(editedDuringSave.history.length, 1);
assert.equal(editedDuringSave.history[0].id, 'concurrent-user-message', '失败回滚不删除并发新消息');
failSave = false;
saveHook = null;

// 同角色请求串行处理；失败回滚不能抹掉另一条已保存更新。
const concurrent = enable(character());
let release;
saveHook = () => new Promise(resolve => { release = resolve; });
const first = api.consumeAiCommands(command('userRemark', '先到'), concurrent, 'private');
await new Promise(resolve => setImmediate(resolve));
const second = api.consumeAiCommands(command('userRemark', '后到'), concurrent, 'private');
saveHook = null;
release();
await Promise.all([first, second]);
assert.equal(concurrent.userRemarkName, '后到');
assert.equal(saved.get(concurrent.id).userRemarkName, '后到');
assert.equal(concurrent.history.length, 2);
const stopped = enable(character());
await api.consumeAiCommands(command('userRemark', '已停止'), stopped, 'private', () => true);
assert.equal(stopped.userRemarkName, undefined);

// 设置往返、手动备注与四个开关互相独立。
const toggleIds = ['setting-allow-character-remark-update', 'setting-allow-user-remark-update', 'setting-allow-character-poke-update', 'setting-allow-user-poke-update'];
toggleIds.forEach(id => inputs.set(id, { checked: true }));
inputs.set('setting-user-remark', { value: '旧输入' });
const settingsChat = character();
api.loadSettings(settingsChat);
toggleIds.forEach(id => assert.equal(inputs.get(id).checked, false, '旧角色默认关闭'));
inputs.get('setting-user-remark').value = '  手动备注  ';
inputs.get(toggleIds[1]).checked = true;
api.saveSettings(settingsChat);
assert.equal(settingsChat.userRemarkName, '手动备注');
assert.equal(settingsChat.allowUserRemarkUpdate, true);
assert.equal(settingsChat.allowCharacterRemarkUpdate, false);
assert.equal(settingsChat.myName, '原名字');
inputs.get('setting-user-remark').value = 'x'.repeat(25);
assert.throws(() => api.saveSettings(settingsChat), /24/);
assert.equal(settingsChat.userRemarkName, '手动备注');
inputs.clear();

// 当前资料和能力在默认、自定义模板、节点、条目模式下均可用，预览与实际一致。
const prompted = enable(character({ userRemarkName: '小月亮' }));
const assertPrompt = prompt => {
    assert.equal(prompt.split('【单聊备注与拍一拍资料】').length, 2, '能力只注入一次');
    names.forEach(name => assert.ok(prompt.includes('[PROFILE:' + name + '=')));
    assert.ok(prompt.includes('小月亮'));
};
db.magicRoom = { customPromptEnabled: true, customPromptTemplate: '模板 {{角色名}} {{用户称呼}}' };
assertPrompt(context.generatePrivateSystemPrompt(prompted));
db.magicRoom = { customPromptEnabled: true, promptEditMode: 'items', customPromptItems: context.window.PromptStudio.createDefaultItems() };
assertPrompt(context.generatePrivateSystemPrompt(prompted));
assertPrompt(context.window.PromptStudio.compile(prompted, { preview: true }).prompt);
db.magicRoom = {};
assertPrompt(context.generatePrivateSystemPrompt(prompted));
prompted.activeNodeId = 'node';
prompted.nodes = [{ id: 'node', name: '节点', prompt: '节点设定', isOffline: true }];
assertPrompt(context.generatePrivateSystemPrompt(prompted));
permissions.forEach(key => { prompted[key] = false; });
assert.ok(api.prompt(prompted).includes('小月亮'));
assert.ok(!api.prompt(prompted).includes('[PROFILE:'));
assert.equal(api.prompt(character()), '');

// 真实回复管线：后台修改目标角色、旧拍一拍快照保留、新事件使用新后缀。
const integrated = enable(character({ pokeCharacterSuffix: '的旧袖口', pokeUserSuffix: '的旧耳朵', pokeEffectMode: 'off', pokeVibrationEnabled: false }));
const viewed = character({ id: 'viewed' });
const oldEvent = context.window.PokeSystem.createEvent(integrated, 'private', 'user_me', integrated.id, 'double_tap');
context.window.PokeSystem.playFeedback = () => {};
await context.handleAiReplyContent(command('characterRemark', '新备注') + '\n' + command('characterPoke', '的新袖口') + '\n' + command('userPoke', '的新耳朵') + '\n[POKE:actor=陆沉|target=用户]\n[陆沉的消息：你好]', integrated, integrated.id, 'private', true);
assert.equal(integrated.remarkName, '新备注');
assert.equal(viewed.remarkName, '旧备注');
assert.equal(oldEvent.suffixSnapshot, '的旧袖口');
assert.equal(integrated.history.find(message => message.source === 'ai').suffixSnapshot, '的新耳朵');
assert.ok(integrated.history.some(message => message.content === '[陆沉的消息：你好]'));
assert.ok(bubbles.filter(item => item.message.type === 'profile_update').every(item => item.id === integrated.id));

const protectedChat = enable(character({ _cotDisplayMode: 'hidden' }));
const page = '<uwuxjc char="陆沉"><!doctype html><html><body><script>const example = ' + JSON.stringify(command('userRemark', '页面代码')) + ';</script></body></html></uwuxjc>';
await context.handleAiReplyContent('<thinking>\n' + command('userRemark', '思考') + '\n</thinking>\n' + page, protectedChat, protectedChat.id, 'private', true);
assert.equal(protectedChat.userRemarkName, undefined);
assert.ok(protectedChat.history.some(message => message.interactive?.source?.includes('页面代码') || message.content.includes('页面代码')));
const failIntegrated = enable(character());
const previousBubbles = bubbles.length;
failSave = true;
assert.equal(await context.handleAiReplyContent(command('userRemark', '失败'), failIntegrated, failIntegrated.id, 'private', true), false);
assert.equal(failIntegrated.userRemarkName, undefined);
assert.equal(bubbles.length, previousBubbles, '失败不渲染成功消息');
failSave = false;

console.log('Character profile tests passed (permissions, isolation, storage rollback, prompts, protected content and reply integration).');
