import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../js/modules/moments.js', import.meta.url), 'utf8');
const now = Date.now();
const elements = new Map();
function element(id) {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', hidden: true, disabled: false, textContent: '', value: '', dataset: {}, listeners: {}, classList: { contains: () => false }, addEventListener(type, handler) { this.listeners[type] = handler; }, querySelector: () => null, focus() {} });
    return elements.get(id);
}
const sandbox = {
    console,
    db: {
        characters: [
            { id: 'a', realName: '甲', persona: '朋友', momentsSettings: { interactEnabled: true } },
            { id: 'b', realName: '乙', persona: '同事', momentsSettings: { interactEnabled: true } }
        ],
        moments: {
            settings: { interactionVisibility: 'mutual' },
            contacts: [{ id: 'c', kind: 'npc', ownerCharId: 'a', actorId: 'npc_c', name: '丙', persona: '邻居', enabled: true }],
            groups: [], notifications: [], lastCatchupAt: now,
            posts: [
                { id: 'private', kind: 'post', authorId: 'user', text: '只给甲看的事', audienceIds: ['user', 'char:a'], likes: [], comments: [], createdAt: now },
                { id: 'role', kind: 'post', authorId: 'char:a', text: '周末散步', audienceIds: ['user', 'char:b', 'npc_c'], seenBy: { 'char:b': now }, likes: ['npc_c'], comments: [{ id: 'comment', authorId: 'npc_c', text: '路边的花开了', createdAt: now }], createdAt: now }
            ]
        }
    },
    saveGlobalSettings: async () => true,
    saveCharacter: async () => true,
    document: { getElementById: element, querySelectorAll: () => [] },
    setTimeout: () => 0,
    setInterval: () => 0,
    switchScreen: id => { sandbox.screenId = id; },
    showToast: message => { sandbox.lastToast = message; }
};
sandbox.window = sandbox;
vm.runInNewContext(code, sandbox, { filename: 'moments.js' });

const moments = sandbox.Moments;
const [privatePost, rolePost] = sandbox.db.moments.posts;
assert.equal(moments.visibleTo(privatePost, 'char:a'), true);
assert.equal(moments.visibleTo(privatePost, 'char:b'), false);
assert.equal(moments.visibleTo(privatePost, 'npc_c'), false, 'selected role does not grant access to its contacts');
assert.equal(moments.canSeeInteraction(rolePost, 'char:b', 'npc_c'), false, 'mutual mode hides non mutual contacts');
assert.equal(moments.canSeeInteraction(rolePost, 'user', 'npc_c'), true, 'user sees all interactions on role posts');
assert.doesNotMatch(moments.promptForCharacter('a'), /只给甲看的事/, 'visibility alone does not reveal unread content');
privatePost.seenBy = { 'char:a': now };
assert.match(moments.promptForCharacter('a'), /只给甲看的事/);
assert.doesNotMatch(moments.promptForCharacter('b'), /只给甲看的事/);
assert.doesNotMatch(moments.promptForCharacter('b'), /路边的花开了/);
sandbox.db.moments.settings.interactionVisibility = 'all';
assert.equal(moments.canSeeInteraction(rolePost, 'char:b', 'npc_c'), true, 'all mode reveals permitted interactions');
assert.match(moments.promptForCharacter('b'), /路边的花开了/);
const a = sandbox.db.characters[0];
// Item editing must preserve legacy text, intentional emptiness and runtime gates.
sandbox.db.magicRoom = { momentsPrompts: { post: '旧发帖 {{未识别变量}}', story: '', seen: '已看：{{动态列表}}' } };
const migrated = moments.getPromptItems();
assert.equal(migrated.length, 13);
assert.equal(migrated.find(item => item.key === 'post').content, '旧发帖 {{未识别变量}}');
assert.equal(migrated.find(item => item.key === 'story').content, '');
const orderedItems = [
    { id: 'first', key: 'interact', name: '互动', enabled: true, content: '互动排序第一' },
    { id: 'second', key: 'seen', name: '已看', enabled: true, content: '已看排序第二 {{动态列表}}' },
    { id: 'off', key: 'interact', name: '停用', enabled: false, content: '停用条目不能注入' },
    { id: 'gated', key: 'post', name: '发帖', enabled: true, content: '未开启发帖不能注入' },
    { id: 'task', key: 'postGeneration', name: '正文', enabled: true, content: '正文生成单独使用' }
];
sandbox.db.magicRoom.momentsPromptItems = orderedItems;
const orderedPrompt = moments.promptForCharacter('a');
assert.ok(orderedPrompt.indexOf('互动排序第一') < orderedPrompt.indexOf('已看排序第二'));
assert.match(orderedPrompt, /只给甲看的事/);
assert.doesNotMatch(orderedPrompt, /停用条目不能注入|未开启发帖不能注入|正文生成单独使用|\{\{动态列表\}\}/);
orderedItems.reverse();
const reversedPrompt = moments.promptForCharacter('a');
assert.ok(reversedPrompt.indexOf('已看排序第二') < reversedPrompt.indexOf('互动排序第一'));
assert.equal(moments.compilePromptRules({ postGeneration: {} }), '正文生成单独使用');
assert.equal(moments.compilePromptRules({ contacts: { 人脉列表: '{{动态列表}}' } }, [{key:'contacts',enabled:true,content:'{{人脉列表}} {{动态列表}}'}]), '{{动态列表}} {{动态列表}}', 'inserted data must not recursively expand as a variable');
const previewPrompt = moments.promptForCharacter('a', false, [{key:'interact',enabled:true,content:'仅用于草稿预览'}]);
assert.match(previewPrompt, /仅用于草稿预览/);
assert.doesNotMatch(moments.promptForCharacter('a'), /仅用于草稿预览/);
sandbox.db.magicRoom.momentsPromptItems = [];
assert.equal(moments.getPromptItems().length, 0, 'deleted rules never reappear through legacy fallback');
assert.doesNotMatch(moments.promptForCharacter('a'), /MOMENT:like|只给甲看的事/);
const normalized = moments.normalizePromptItems([{id:'duplicate',key:'post',content:''},{id:'duplicate',key:'story'},{key:'invalid'}]);
assert.equal(normalized.length, 2);
assert.notEqual(normalized[0].id, normalized[1].id);
sandbox.db.magicRoom = {};
a.momentsSettings.interactEnabled = false;
assert.equal(moments.promptForCharacter('a'), '', 'all disabled moments abilities inject nothing');
let blocked = await moments.consumeAiCommands('[MOMENT:like:private]', a);
assert.equal(blocked.errors.length, 1, 'disabled interaction cannot change likes');
a.momentsSettings.interactEnabled = true;
const executed = await moments.consumeAiCommands('[MOMENT:like:private][MOMENT:comment:role:我自己也来说一句]', a);
assert.equal(executed.errors.length, 0);
assert.equal(privatePost.likes.includes('char:a'), true, 'private chat command changes actual like data');
assert.equal(rolePost.comments.at(-1).authorId, 'char:a', 'character can comment on own post');
assert.equal(executed.cleaned, '', 'commands do not leak into chat display');
assert.match(moments.promptForCharacter('a'), /甲评论了动态/, 'successful operations remain in the character context');

sandbox.db.myStickers = [{ id: 'flower', name: '花', group: '常用', data: 'data:image/png;base64,AAAA', description: '一朵花' }];
a.stickerGroups = '常用';
const stickerReply = await moments.consumeAiCommands('[MOMENT:reply-sticker:role:comment:flower]', a);
assert.equal(stickerReply.errors.length, 0, 'character can reply with an allowed sticker');
assert.equal(rolePost.comments.at(-1).sticker.name, '花');
const deletedByRole = await moments.consumeAiCommands('[MOMENT:delete:role]', a);
assert.equal(deletedByRole.errors.length, 0);
assert.equal(sandbox.db.moments.posts.some(post => post.id === 'role'), false, 'character deletes its own post');
assert.match(moments.promptForCharacter('a'), /甲删除了动态「周末散步」/, 'deleted post remains in character memory');
const forbiddenDelete = await moments.consumeAiCommands('[MOMENT:delete:private]', a);
assert.equal(forbiddenDelete.errors.length, 1, 'character cannot delete someone else’s post');
sandbox.db.moments.posts.push(rolePost);

moments.init();
sandbox.db.apiSettings = { url: 'https://example.test', model: 'test', key: 'test' };
sandbox.fetchAiResponse = async () => '{"replies":[]}';
element('moments-screen').listeners.click({ target: { closest: () => ({ dataset: { action: 'detail', postId: 'role' } }) } });
element('moments-detail-screen').listeners.click({ target: { closest: () => ({ dataset: { action: 'reply', postId: 'role', commentId: 'comment' } }) } });
assert.equal(element('moments-reply-target').hidden, false, 'reply target is visible to the user');
element('moments-comment-sticker-btn').listeners.click();
assert.match(element('moments-sticker-grid').innerHTML, /data-sticker-id="flower"/, 'existing sticker is available in moments');
element('moments-sticker-picker').listeners.click({ target: { closest: () => ({ dataset: { action: 'choose-sticker', stickerId: 'flower' } }) } });
await new Promise(setImmediate);
assert.equal(rolePost.comments.at(-1).replyTo, 'comment', 'sticker replies retain the selected comment');
assert.equal(rolePost.comments.at(-1).sticker.name, '花');
assert.equal(element('moments-reply-target').hidden, true, 'reply target clears after sending');
element('moments-create-btn').listeners.click();
element('moments-compose-sticker-btn').listeners.click();
element('moments-sticker-picker').listeners.click({ target: { closest: () => ({ dataset: { action: 'choose-sticker', stickerId: 'flower' } }) } });
await new Promise(setImmediate);
await element('moments-publish-btn').listeners.click();
assert.equal(sandbox.db.moments.posts.at(-1).media[0].type, 'sticker', 'user can publish a sticker-only moment');
assert.equal(sandbox.screenId, 'moments-screen', 'publishing returns to the moments feed');
const postsBeforeNoticeDelete = sandbox.db.moments.posts.length;
sandbox.db.moments.notifications = [
    { id: 'n1', toId: 'user', fromId: 'char:a', postId: 'private', text: '赞了你的动态', createdAt: now, read: false },
    { id: 'n2', toId: 'user', fromId: 'char:a', postId: 'private', text: '评论了你的动态', createdAt: now - 1, read: false },
    { id: 'other', toId: 'char:a', fromId: 'user', postId: 'private', text: '提醒你看动态', createdAt: now - 2, read: false }
];
await element('moments-notifications-btn').listeners.click();
assert.equal(sandbox.screenId, 'moments-notifications-screen');
assert.equal(sandbox.db.moments.notifications[0].read, true, 'opening messages still marks user notices read');
assert.equal(sandbox.db.moments.notifications[2].read, false, 'other recipients remain unread');
assert.match(element('moments-notifications-content').innerHTML, /data-post-id="private"/, 'normal message remains a detail entry');
element('moments-notifications-manage').listeners.click();
assert.equal(element('moments-notifications-toolbar').hidden, false);
const notificationClick = noticeId => element('moments-notifications-screen').listeners.click({ target: { closest: () => ({ dataset: { action: 'notification', noticeId, postId: 'private' } }) } });
notificationClick('n1');
assert.match(element('moments-notifications-content').innerHTML, /data-notice-id="n1"[^>]*aria-pressed="true"/);
assert.equal(element('moments-notifications-delete').textContent, '删除 (1)');
element('moments-notifications-select-all').listeners.click();
assert.equal(element('moments-notifications-delete').textContent, '删除 (2)');
await element('moments-notifications-delete').listeners.click();
assert.equal(sandbox.db.moments.notifications.length, 3, 'first delete click only asks for confirmation');
assert.equal(element('moments-notifications-delete').textContent, '确认删除 (2)');
notificationClick('n2');
assert.equal(element('moments-notifications-delete').textContent, '删除 (1)', 'changing selection cancels confirmation');
await element('moments-notifications-delete').listeners.click();
await element('moments-notifications-delete').listeners.click();
assert.deepEqual(sandbox.db.moments.notifications.map(n => n.id), ['n2', 'other'], 'only selected user notice is deleted');
assert.equal(sandbox.db.moments.posts.length, postsBeforeNoticeDelete, 'deleting messages leaves posts intact');
assert.equal(element('moments-notifications-toolbar').hidden, true);
assert.equal(sandbox.lastToast, '已删除 1 条动态消息');
notificationClick('n2');
assert.equal(sandbox.screenId, 'moments-detail-screen', 'normal message navigation still opens its post');

let confirmChoice = 'cancel';
let confirmOptions;
let apiCalls = 0;
sandbox.showAppConfirmDialog = async options => { confirmOptions = options; return confirmChoice; };
sandbox.saveCharacter = async () => true;
sandbox.db.apiSettings = { url: 'https://example.test', model: 'test', key: 'test' };
const checkButton = element('moments-generate-now-btn');
checkButton.textContent = '检查一次自主动态';
const clickCheck = () => checkButton.listeners.click();
a.momentsSettings = { postEnabled: true };
sandbox.db.characters[1].momentsSettings = {};
sandbox.fetchAiResponse = async () => { apiCalls++; return JSON.stringify({ action: 'none' }); };
await clickCheck();
assert.match(confirmOptions.message, /最多 2 位/);
assert.equal(apiCalls, 0, 'cancel does not start a check');
assert.equal(checkButton.disabled, false, 'button is restored after cancel');

confirmChoice = 'confirm';
a.momentsSettings.postEnabled = false;
await clickCheck();
assert.equal(sandbox.lastToast, '没有开启自主动态的角色或人脉');
assert.equal(apiCalls, 0, 'no enabled actor does not call the API');

a.momentsSettings.postEnabled = true;
await clickCheck();
assert.equal(sandbox.lastToast, '已检查 1 位，角色均选择暂不行动');
assert.equal(apiCalls, 1);

sandbox.fetchAiResponse = async (config, body) => {
    apiCalls++;
    return JSON.stringify(body.messages[0].content.includes('请只以')
        ? { text: '今天散步时看见了花。', imagePrompt: '', voiceText: '', mentions: [] }
        : { action: 'post' });
};
const postCount = sandbox.db.moments.posts.length;
await clickCheck();
assert.equal(sandbox.db.moments.posts.length, postCount + 1, 'confirmed check can publish a post');
assert.match(sandbox.lastToast, /已检查 1 位：发布动态/);

sandbox.fetchAiResponse = async () => { throw new Error('网络断开'); };
await clickCheck();
assert.match(sandbox.lastToast, /1 位失败：网络断开/, 'API failure is reported instead of success');
assert.equal(checkButton.disabled, false, 'button is restored after failure');
assert.equal(checkButton.textContent, '检查一次自主动态');

const m = sandbox.db.moments;
m.posts.push(
    { id: 'npc-post', kind: 'post', authorId: 'npc_c', text: '街角的咖啡', audienceIds: ['user'], likes: [], comments: [], createdAt: now + 2 },
    { id: 'story', kind: 'story', authorId: 'user', text: '今天的 Story', audienceIds: ['user'], likes: [], comments: [], createdAt: now + 3, expiresAt: now + 86400000 }
);
m.notifications.push({ id: 'post-notice', toId: 'user', fromId: 'npc_c', postId: 'npc-post', text: '新动态', createdAt: now });
const actionClick = async (screenId, dataset) => {
    element(screenId).listeners.click({ target: { closest: () => ({ dataset }) } });
    await new Promise(setImmediate);
};
await actionClick('moments-screen', { action: 'post-menu', postId: 'role' });
assert.equal(element('moments-post-dialog').hidden, false, 'post actions open a centered dialog');
assert.match(element('moments-post-dialog-actions').innerHTML, /查看主页/);
assert.match(element('moments-post-dialog-actions').innerHTML, /删除动态/, 'role post can be deleted');
const roleDeleteButton = { dataset: { action: 'delete-post', postId: 'role' }, textContent: '删除动态' };
await actionClick('moments-post-dialog', roleDeleteButton.dataset);
assert.equal(m.posts.some(post => post.id === 'role'), true, 'first click only arms single deletion');
await actionClick('moments-post-dialog', roleDeleteButton.dataset);
assert.equal(m.posts.some(post => post.id === 'role'), false);
assert.equal(element('moments-post-dialog').hidden, true);
await actionClick('moments-screen', { action: 'post-menu', postId: 'private' });
assert.match(element('moments-post-dialog-actions').innerHTML, /编辑动态/, 'own edit action remains');
assert.match(element('moments-post-dialog-actions').innerHTML, /删除动态/);
await actionClick('moments-post-dialog', { action: 'close-post-dialog' });

element('moments-manage-btn').listeners.click();
assert.equal(sandbox.screenId, 'moments-manage-screen');
element('moments-manage-screen').classList.contains = name => name === 'active' && sandbox.screenId === 'moments-manage-screen';
assert.match(element('moments-manage-list').innerHTML, /data-post-id="story"/, 'management includes Story');
element('moments-manage-author').listeners.change({ target: { value: 'npc_c' } });
assert.match(element('moments-manage-list').innerHTML, /data-post-id="npc-post"/);
assert.doesNotMatch(element('moments-manage-list').innerHTML, /data-post-id="private"/);
element('moments-manage-search').listeners.input({ target: { value: '咖啡' } });
assert.match(element('moments-manage-list').innerHTML, /data-post-id="npc-post"/, 'content search works with author filter');
element('moments-manage-select-all').listeners.click();
assert.equal(element('moments-manage-delete-selected').textContent, '删除选中 (1)');
confirmChoice = 'cancel';
await element('moments-manage-delete-selected').listeners.click();
assert.equal(m.posts.some(post => post.id === 'npc-post'), true, 'cancel preserves selected posts');
confirmChoice = 'confirm';
await element('moments-manage-delete-selected').listeners.click();
assert.equal(m.posts.some(post => post.id === 'npc-post'), false);
assert.equal(m.notifications.some(notice => notice.postId === 'npc-post'), false, 'related notice is removed');

element('moments-manage-author').listeners.change({ target: { value: '' } });
element('moments-manage-search').listeners.input({ target: { value: '' } });
const remaining = m.posts.length;
element('moments-manage-select-all').listeners.click();
assert.equal(element('moments-manage-delete-selected').textContent, `删除选中 (${remaining})`, 'select all covers current results');
element('moments-manage-select-all').listeners.click();
assert.equal(element('moments-manage-delete-selected').textContent, '删除选中 (0)', 'select all can be reversed');
await actionClick('moments-manage-screen', { action: 'manage-select', postId: 'private' });
await actionClick('moments-manage-screen', { action: 'manage-select', postId: 'story' });
assert.equal(element('moments-manage-delete-selected').textContent, '删除选中 (2)', 'individual multiselect works');
const saved = sandbox.saveGlobalSettings;
sandbox.saveGlobalSettings = async () => false;
await element('moments-manage-clear-all').listeners.click();
assert.equal(m.posts.length, remaining, 'failed save restores posts');
sandbox.saveGlobalSettings = saved;
await element('moments-manage-clear-all').listeners.click();
assert.equal(m.posts.length, 0, 'clear all includes regular posts and Story');
assert.equal(m.notifications.length, 0, 'clear all removes related notices');
assert.equal(element('moments-manage-clear-all').disabled, true);

let formValues = {};
sandbox.FormData = class {
    get(key) { return formValues[key] ?? null; }
    getAll(key) { return formValues[key] || []; }
};
sandbox.currentChatId = 'a';
a.momentsSettings.contactsEnabled = true;
sandbox.db.characters[1].momentsSettings.contactsEnabled = true;
element('moments-link-char-btn').listeners.click();
formValues = { actorId: 'char:b', relationship: '女儿', reverseRelationship: '父亲' };
await element('moments-editor-form').listeners.submit({ preventDefault() {} });
const linked = m.contacts.find(c => c.kind === 'linked');
assert.equal(linked.ownerCharId, 'a');
assert.equal(m.contacts.filter(c => c.kind === 'linked').length, 1, 'one stored link represents both directions');
assert.match(moments.promptForCharacter('a'), /乙（女儿）/);
assert.match(moments.promptForCharacter('b'), /甲（父亲）/, 'other character sees the reverse relationship');
sandbox.currentChatId = 'b';
element('moments-link-char-btn').listeners.click();
assert.doesNotMatch(element('moments-editor-fields').innerHTML, /value="char:a"/, 'already linked character cannot be linked again');
await element('moments-contacts-list').listeners.change({ target: { dataset: { contactFlag: 'mayInteract' }, checked: true, closest: () => ({ dataset: { contactId: linked.id } }) } });
assert.equal(linked.reverseMayInteract, true, 'reverse interaction setting belongs to the reverse direction');
assert.equal(linked.mayInteract, false, 'reverse setting does not change the original direction');
await actionClick('moments-contacts-screen', { action: 'edit-contact', contactId: linked.id });
assert.match(element('moments-editor-fields').innerHTML, /value="父亲"/, 'reverse relationship is editable from the other character');
formValues = { relationship: '父亲', reverseRelationship: '女儿' };
await element('moments-editor-form').listeners.submit({ preventDefault() {} });
assert.match(moments.promptForCharacter('b'), /甲（父亲）/);
await actionClick('moments-contacts-screen', { action: 'delete-contact', contactId: linked.id });
await actionClick('moments-contacts-screen', { action: 'delete-contact', contactId: linked.id });
assert.equal(m.contacts.some(c => c.kind === 'linked'), false, 'deleting either side removes the shared link');
assert.doesNotMatch(moments.promptForCharacter('a'), /乙（女儿）/);
assert.doesNotMatch(moments.promptForCharacter('b'), /甲（父亲）/);
m.contacts.push({ id: 'legacy', kind: 'linked', ownerCharId: 'a', actorId: 'char:b', relationship: '朋友', enabled: true });
assert.match(moments.promptForCharacter('b'), /甲（熟人）/, 'old one-way links appear in the reverse contacts without guessing a title');
await actionClick('moments-contacts-screen', { action: 'edit-contact', contactId: 'legacy' });
formValues = { relationship: '同学', reverseRelationship: '朋友' };
await element('moments-editor-form').listeners.submit({ preventDefault() {} });
assert.match(moments.promptForCharacter('b'), /甲（同学）/);
assert.match(moments.promptForCharacter('a'), /乙（朋友）/);
m.contacts.push({ id: 'legacy-reverse', kind: 'linked', ownerCharId: 'b', actorId: 'char:a', relationship: '朋友', enabled: true });
await actionClick('moments-contacts-screen', { action: 'delete-contact', contactId: 'legacy-reverse' });
await actionClick('moments-contacts-screen', { action: 'delete-contact', contactId: 'legacy-reverse' });
assert.equal(m.contacts.some(c => c.kind === 'linked'), false, 'deleting an old two-record pair removes both directions');

assert.equal(privatePost.authorPersonaId, 'legacy', 'old user posts keep a separate historical identity');
sandbox.db.myPersonaPresets = [
    { id: 'persona-b', name: 'B身份', avatar: 'https://example.test/b.png', persona: 'B设定', bindings: { a: {} }, momentsProfile: { signature: 'B的签名' } },
    { id: 'persona-c', name: 'C身份', avatar: 'https://example.test/c.png', persona: 'C设定', bindings: { b: {} }, momentsProfile: { signature: 'C的签名' } }
];
sandbox.db.activePersonaId = 'persona-b';
m.characterPersonaIds = { a: 'persona-b', b: 'persona-c' };
element('moments-create-btn').listeners.click();
element('moments-compose-text').value = '同一段生活记录';
element('moments-audience-btn').listeners.click();
element('moments-picker-options').querySelectorAll = selector => selector === 'input[value]:checked' ? [{ value: 'char:a' }, { value: 'char:b' }] : [];
element('moments-picker-done').listeners.click();
const beforeSplit = m.posts.length;
confirmChoice = 'confirm';
await element('moments-publish-btn').listeners.click();
const splitPosts = m.posts.slice(beforeSplit);
assert.equal(splitPosts.length, 2, 'different known personas create separate posts');
assert.deepEqual(splitPosts.map(post => post.authorPersonaId), ['persona-b', 'persona-c']);
assert.deepEqual(splitPosts.map(post => post.audienceIds.join(',')), ['user,char:a', 'user,char:b']);
sandbox.db.activePersonaId = 'persona-c';
moments.open();
assert.match(element('moments-feed').innerHTML, /B身份/, 'changing the displayed persona does not rename the old B post');
await actionClick('moments-screen', { action: 'profile', actorId: 'user', personaId: 'persona-b' });
assert.match(element('moments-profile-content').innerHTML, /B的签名/);
assert.doesNotMatch(element('moments-profile-content').innerHTML, /C的签名/);
assert.match(moments.promptForCharacter('a'), /B的签名/);
assert.doesNotMatch(moments.promptForCharacter('a'), /C的签名/);
sandbox.currentChatId = 'a';
element('moments-add-person-btn').listeners.click();
assert.match(element('moments-editor-fields').innerHTML, /本地上传/);
assert.match(element('moments-editor-fields').innerHTML, /重置/);
formValues = { name: '新朋友', persona: '喜欢摄影', relationship: '朋友', signature: '去看日落', avatar: 'https://example.test/avatar.png', cover: 'https://example.test/cover.png' };
await element('moments-editor-form').listeners.submit({ preventDefault() {} });
const newContact = m.contacts.find(c => c.name === '新朋友');
assert.equal(newContact.signature, '去看日落');
assert.equal(newContact.cover, 'https://example.test/cover.png');
await actionClick('moments-screen', { action: 'profile', actorId: 'char:a' });
await actionClick('moments-profile-screen', { action: 'edit-profile-signature' });
formValues = { signature: '我有自己的签名' };
await element('moments-editor-form').listeners.submit({ preventDefault() {} });
assert.equal(a.momentsProfile.signature, '我有自己的签名');
assert.match(moments.promptForCharacter('a'), /我有自己的签名/, 'character knows its saved signature');
await actionClick('moments-screen', { action: 'profile', actorId: 'user', personaId: 'persona-b' });
await actionClick('moments-profile-screen', { action: 'edit-profile-signature' });
formValues = { signature: '新的B签名' };
await element('moments-editor-form').listeners.submit({ preventDefault() {} });
assert.equal(sandbox.db.myPersonaPresets[0].momentsProfile.signature, '新的B签名');
await actionClick('moments-profile-screen', { action: 'edit-profile-avatar' });
const profileForm = element('moments-editor-form');
const avatarInput = { value: '' };
const avatarPreview = { innerHTML: '' };
const avatarFile = { value: 'selected' };
const profileSubmit = { disabled: false };
profileForm.elements = { avatar: avatarInput };
profileForm.querySelector = selector => selector.includes('button[type=') ? profileSubmit : selector.includes('data-preview-field') ? avatarPreview : selector.includes('data-file-field') ? avatarFile : null;
sandbox.compressImage = async () => 'data:image/jpeg;base64,AA==';
await element('moments-editor-dialog').listeners.change({ target: { dataset: { fileField: 'avatar' }, files: [{ type: 'image/png', size: 100 }] } });
assert.equal(avatarInput.value, 'data:image/jpeg;base64,AA==', 'local avatar upload reaches the editor field');
assert.equal(profileSubmit.disabled, false, 'save returns after image processing');
element('moments-editor-dialog').listeners.click({ target: { closest: () => ({ dataset: { action: 'reset-profile-image', imageField: 'avatar' } }) } });
assert.equal(avatarInput.value, '', 'avatar reset clears the pending image');

console.log('Moments visibility, profiles, persona separation, contacts and existing interaction checks passed.');
