import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');

const context = vm.createContext({
    console,
    Date,
    Math,
    Set,
    Map,
    String,
    Number,
    Object,
    Array,
    JSON,
    RegExp,
    isFinite,
    parseInt,
    crypto: globalThis.crypto,
    saveData() {},
    showToast() {},
    confirm() { return true; },
    document: { getElementById() { return null; }, querySelector() { return null; }, body: { appendChild() {} } },
    db: {
        forumPosts: [], forumMessages: [], forumStrangerProfiles: {}, forumSettings: {},
        forumAltAccounts: [{ id: 'alt_a', username: '小号A', avatar: '', bio: '' }],
        forumActiveAccountId: 'main', forumUserProfile: { username: '大号', avatar: '', bio: '' },
        forumPendingRequestFromUser: {}, forumAccountStates: {}, forumRelationships: {},
        forumKnowledge: [], forumSocialEdges: [], forumStoryThreads: [], forumEvents: [],
        forumNotifications: [], forumDrafts: [], characters: []
    }
});

vm.runInContext(read('js/modules/forum/core.js'), context, { filename: 'forum/core.js' });
vm.runInContext(read('js/modules/forum/direct-messages.js'), context, { filename: 'forum/direct-messages.js' });

context.forumEnsureData();
assert.equal(context.db.forumSchemaVersion, 2, 'forum data migrates to current schema');
assert.equal(context.forumEscapeHtml('<img src=x onerror=1>'), '&lt;img src=x onerror=1&gt;', 'forum content is escaped');
assert.match(context.forumSafeImageUrl('javascript:alert(1)'), /^https:/, 'unsafe image protocols fall back');

context.db.forumMessages.push(
    { id: 'm1', accountId: 'main', fromUserId: 'npc_main', toUserId: 'user', content: 'main', timestamp: 1 },
    { id: 'm2', accountId: 'alt_a', fromUserId: 'npc_alt', toUserId: 'user', content: 'alt', timestamp: 2 }
);
context.db.forumStrangerProfiles.npc_main = { id: 'npc_main', name: '主号联系人' };
context.db.forumStrangerProfiles.npc_alt = { id: 'npc_alt', name: '小号联系人' };
assert.deepEqual(Array.from(context.forumGetDMUserList(), item => item.id), ['npc_main'], 'main account sees only its DMs');
context.db.forumActiveAccountId = 'alt_a';
assert.deepEqual(Array.from(context.forumGetDMUserList(), item => item.id), ['npc_alt'], 'alt account sees only its DMs');

context.forumSetPendingFriendRequestFromUser('npc_alt', true);
context.db.forumActiveAccountId = 'main';
assert.equal(context.forumHasPendingFriendRequestFromUser('npc_alt'), false, 'friend requests are account scoped');
context.db.forumActiveAccountId = 'alt_a';
assert.equal(context.forumHasPendingFriendRequestFromUser('npc_alt'), true, 'alt friend request remains available to its owner');

const post = { id: 'post_test', isLiked: true, isFavorited: false };
context.db.forumActiveAccountId = 'main';
assert.equal(context.forumGetReaction(post, 'like'), true, 'legacy main-account reaction migrates lazily');
context.db.forumActiveAccountId = 'alt_a';
assert.equal(context.forumGetReaction(post, 'like'), false, 'reaction state does not leak to alt');
context.forumSetReaction(post, 'favorite', true);
context.db.forumActiveAccountId = 'main';
assert.equal(context.forumGetReaction(post, 'favorite'), false, 'alt favorite does not leak to main');
const privateAltPost = { id: 'private_alt', authorId: 'alt_a', visibility: 'private' };
assert.equal(context.forumCanViewPost(privateAltPost), false, 'private alt posts do not leak into the main account');
context.db.forumActiveAccountId = 'alt_a';
assert.equal(context.forumCanViewPost(privateAltPost), true, 'private posts remain visible to their owning account');

const first = context.forumResolveNpcId('', '同名用户', 'one');
const second = context.forumResolveNpcId('', '同名用户', 'two');
assert.notEqual(first, second, 'same display names do not collapse distinct NPC identities');
assert.equal(context.forumResolveNpcId(first, '改名后的同一人', 'reuse'), first, 'explicit stable NPC IDs survive renames');

const rel = context.forumAdjustRelationship(first, { trust: 12, familiarity: 4 }, '测试互动', 'alt_a');
assert.equal(rel.trust, 12);
assert.equal(rel.events.length, 1, 'relationship changes keep an explainable event trail');
const fact = context.forumAddKnowledge(first, 'alt_a', '喜欢在句尾用波浪号', 'public_post', 75, 'alt_a');
assert.equal(fact.source, 'public_post');
assert.equal(context.forumAddKnowledge(first, 'alt_a', fact.fact, fact.source, 75, 'alt_a').id, fact.id, 'knowledge facts deduplicate');

context.db.forumActiveAccountId = 'main';
const job = context.forumStartJob('test');
context.db.forumActiveAccountId = 'alt_a';
assert.equal(context.forumJobIsCurrent(job), false, 'async result becomes stale after account switch');

context.db.forumPosts.push({ id: 'p_story', authorId: first, title: '深夜咖啡馆事件', content: '内容', comments: [], timestamp: Date.now() });
const story = context.forumTrackStoryThread(context.db.forumPosts.at(-1));
assert.ok(story.postIds.includes('p_story'), 'posts attach to persistent story threads');
assert.equal(context.forumRunLocalSearch('咖啡馆').length, 1, 'local search searches stored posts');
context.forumRememberPostVisit('p_story');
assert.equal(context.forumGetAccountState().historyPostIds[0], 'p_story', 'browse history is account scoped and ordered by recency');

const generationSource = read('js/modules/forum/post-generation.js');
assert.ok(generationSource.includes('enhancedPosts.concat(db.forumPosts || [])'), 'refresh appends instead of replacing community history');
assert.ok(!generationSource.includes('jsonData.comments.length'), 'auto-comment feedback does not reference an undefined result object');
assert.ok(generationSource.includes("filter === 'history'"), 'stored browse history has a reachable feed filter');
assert.ok(generationSource.includes("filteredPosts = filteredPosts.filter(p => forumGetReaction(p, 'like'))"), 'feed filters preserve visibility boundaries');
const composerSource = read('js/modules/forum/settings-and-profile.js');
assert.ok(composerSource.includes('forumSaveComposerDraft'), 'draft saving is connected to a visible composer control');
const dmSource = read('js/modules/forum/direct-messages.js');
assert.ok(dmSource.includes('forumMessageBelongsToAccount'), 'DM paths enforce account ownership');
const aiInteractionSource = read('js/modules/forum/ai-interactions.js');
assert.ok(aiInteractionSource.includes('p.authorId === targetUserId || p.npcId === targetUserId'), 'DM persona history follows stable NPC IDs instead of display names');

vm.runInContext(read('js/modules/forum/settings-and-profile.js'), context, { filename: 'forum/settings-and-profile.js' });
context.db.forumActiveAccountId = 'main';
context.renderForumPosts = () => {};
context.switchScreen = () => {};
context.document.getElementById = () => null;
context.document.querySelector = () => null;
context.document.querySelectorAll = () => [
    { dataset: { id: 'p_npc_1' } },
    { dataset: { id: 'p_npc_2' } }
];
context.db.forumPosts = [
    { id: 'p_main', authorId: 'user', title: '大号帖子', comments: [] },
    { id: 'p_alt', authorId: 'alt_a', title: '小号帖子', comments: [] },
    { id: 'p_npc_1', authorId: first, title: '他人帖子一', comments: [] },
    { id: 'p_npc_2', authorId: second, title: '他人帖子二', comments: [] },
    { id: 'p_npc_private', authorId: first, visibility: 'private', title: '不可见帖子', comments: [] }
];
context.forumTogglePostDeleteMode('others');
assert.equal(context.forumPostMatchesDeleteMode(context.db.forumPosts[0]), false, 'other-post mode excludes the main account');
assert.equal(context.forumPostMatchesDeleteMode(context.db.forumPosts[1]), false, 'other-post mode excludes owned alt accounts');
assert.equal(context.forumPostMatchesDeleteMode(context.db.forumPosts[2]), true, 'other-post mode includes visible NPC posts');
assert.equal(context.forumPostMatchesDeleteMode(context.db.forumPosts[4]), false, 'other-post mode excludes invisible posts');
context.forumPostSelectAll();
assert.equal(context.forumSelectedPostIds.size, 2, 'select all selects the visible other-person cards');
context.forumPostDeleteSelected();
assert.deepEqual(Array.from(context.db.forumPosts, post => post.id), ['p_main', 'p_alt', 'p_npc_private'], 'bulk deletion preserves own identities and invisible posts');
context.forumDeletePost('p_alt', true);
assert.ok(context.db.forumPosts.some(post => post.id === 'p_alt'), 'single other-person deletion cannot remove an owned alt post');
context.forumDeletePost('p_npc_private', true);
assert.ok(context.db.forumPosts.some(post => post.id === 'p_npc_private'), 'single deletion cannot remove an invisible post');
context.db.forumPosts.find(post => post.id === 'p_npc_private').visibility = 'public';
context.forumDeletePost('p_npc_private', true);
assert.equal(context.db.forumPosts.some(post => post.id === 'p_npc_private'), false, 'single deletion removes a visible other-person post');
context.forumTogglePostDeleteMode();
assert.equal(context.forumPostMatchesDeleteMode(context.db.forumPosts[0]), true, 'existing own-post mode still includes the main account');
assert.equal(context.forumPostMatchesDeleteMode(context.db.forumPosts[1]), false, 'existing own-post mode still excludes other identities');
context.forumPostCancelDeleteMode();

vm.runInContext(read('js/modules/forum/accounts-and-binding.js'), context, { filename: 'forum/accounts-and-binding.js' });
vm.runInContext(generationSource, context, { filename: 'forum/post-generation.js' });
vm.runInContext(aiInteractionSource, context, { filename: 'forum/ai-interactions.js' });

const classicPromptToggle = { checked: false };
const publicPromptField = { value: '' };
const privatePromptField = { value: '' };
const forumElements = {
    'forum-char-alt-classic-prompt': classicPromptToggle,
    'forum-public-custom-prompt': publicPromptField,
    'forum-private-custom-prompt': privatePromptField,
    'forum-refresh-btn': {},
    'forum-posts-container': {},
    'forum-search-input': { value: '' }
};
context.document.getElementById = id => forumElements[id] || null;
context.forumLoadSettings();
assert.equal(classicPromptToggle.checked, false, 'existing settings default to the current prompt');
assert.equal(privatePromptField.value, '', 'existing settings default to an empty custom prompt');

context.db.apiSettings = { url: 'https://example.invalid', key: 'test-key', model: 'test-model' };
context.db.characters = [{ id: 'char_one', realName: '角色甲', persona: '现在的人设：寡言而克制' }];
context.db.forumStrangerProfiles.npc_alt = {
    name: '论坛马甲', linkedCharId: 'char_one', basicPersona: '普通论坛用户', privatePersona: '创建小号时的人设'
};
context.db.forumMessages.push(
    { accountId: 'main', fromUserId: 'user', toUserId: 'npc_alt', content: '当前账号的对话' },
    { accountId: 'alt_a', fromUserId: 'user', toUserId: 'npc_alt', content: '另一个账号的对话' }
);
context.forumAddKnowledge('npc_alt', 'main', '公开文字习惯相似（相似度72%）', 'public_writing_analysis', 72, 'main');
context.BilingualContent = { prompt: () => '\n双语要求' };
context.forumRenderDMConversation = () => {};
context.showApiError = error => { throw error; };
let dmPrompt;
let aiResponse = '<result><replies><reply>测试回复</reply></replies></result>';
context.fetchAiResponse = async (_apiSettings, request) => {
    dmPrompt = request.messages[0].content;
    return aiResponse;
};
context.forumCurrentDMUserId = 'npc_alt';
await context.forumGenerateAIDMReply();
assert.match(dmPrompt, /角色与马甲[\s\S]*现在的人设：寡言而克制[\s\S]*语气、态度和习惯可以自然流露/);
assert.match(dmPrompt, /这只是线索，不能据此认定身份/);
assert.match(dmPrompt, /按你的人设和当下的关系决定同意、拒绝或暂缓/);
assert.doesNotMatch(dmPrompt, /创建小号时的人设|主动程度|恋爱剧情倾向|冲突剧情强度|\/100|72%|低于10个回合|创作一些通用的、有趣有网感的论坛帖子/);
assert.doesNotMatch(dmPrompt, /自定义论坛提示词/, 'empty settings leave the default prompt intact');

classicPromptToggle.checked = true;
publicPromptField.value = '  多写社区日常  ';
privatePromptField.value = '  关系自然推进\n沿用角色口吻  ';
context.forumSaveSettings();
classicPromptToggle.checked = false;
privatePromptField.value = '';
context.forumLoadSettings();
assert.equal(classicPromptToggle.checked, true, 'the saved classic selection reloads');
assert.equal(privatePromptField.value, '关系自然推进\n沿用角色口吻', 'saved prompt keeps its line breaks');
await context.forumGenerateAIDMReply();
assert.match(dmPrompt, /现在的人设：寡言而克制/);
assert.match(dmPrompt, /维持马甲[\s\S]*双语要求[\s\S]*当前账号的对话/);
assert.doesNotMatch(dmPrompt, /另一个账号的对话|创建小号时的人设|冲突剧情强度|社区常驻居民/);
assert.match(dmPrompt, /<friendDecision>none<\/friendDecision>[\s\S]*关系自然推进\n沿用角色口吻/);
assert.doesNotMatch(dmPrompt, /多写社区日常/);

context.forumCurrentDMUserId = 'npc_main';
await context.forumGenerateAIDMReply();
assert.match(dmPrompt, /社区常驻居民/, 'unbound NPCs still use the full forum context');
assert.doesNotMatch(dmPrompt, /角色与马甲|冲突剧情强度/);

classicPromptToggle.checked = false;
context.forumSaveSettings();
context.forumCurrentDMUserId = 'npc_alt';
await context.forumGenerateAIDMReply();
assert.match(dmPrompt, /社区常驻居民[\s\S]*角色与马甲/, 'turning off classic restores the full forum context');
assert.match(dmPrompt, /关系自然推进/, 'custom private style also works with the current prompt');

context.renderForumPosts = () => {};
context.renderPostDetail = () => {};
context.forumRenderDMList = () => {};
context.forumUpdateDMUnreadBadge = () => {};
const publicPostId = context.db.forumPosts[0].id;
const commentResponse = '<comments><comment><username>测试居民</username><content>测试评论</content></comment></comments>';
for (const [generate, response] of [
    [() => context.handleForumRefresh(), '<posts><post><title>新帖</title><content>测试帖子</content></post></posts>'],
    [() => context.forumGenerateAutoReplies(publicPostId, 1), commentResponse],
    [() => context.forumGenerateAICommentReplies(publicPostId), commentResponse]
]) {
    dmPrompt = '';
    aiResponse = response;
    await generate();
    assert.match(dmPrompt, /多写社区日常/);
    assert.doesNotMatch(dmPrompt, /关系自然推进|主动程度|恋爱剧情倾向|冲突剧情强度|\/100/);
}

aiResponse = '<dms><dm><senderName>测试网友</senderName><content>测试开场</content></dm></dms>';
await context.forumGenerateStrangerDMs();
assert.match(dmPrompt, /<dms>/);
assert.match(dmPrompt, /关系自然推进/);
assert.doesNotMatch(dmPrompt, /多写社区日常/);

privatePromptField.value = '   ';
context.forumSaveSettings();
assert.equal(context.forumCustomPromptSection('privateCustomPrompt'), '', 'clearing the field restores the built-in prompt');

console.log('Forum tests passed: migration, XSS safety, account isolation, reactions, stable NPCs, relationships, knowledge, stale jobs, story continuity, local search, post deletion, and custom prompts.');
