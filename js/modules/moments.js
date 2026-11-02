// 熟人动态：独立于公开论坛，所有可见性判断先于提示词生成。
(function () {
    'use strict';
    const el = id => document.getElementById(id);
    const controls = window.MomentsControls;
    const state = { compose: null, currentPostId: null, profileActorId: null, profilePersonaId: '', resultPostId: '', picker: null, editor: null, commentEdit: null, regeneratingComments: new Set(), deletingComments: new Set(), batch: null, recorder: null, recordStream: null, recordFinishing: false, mediaBusy: false, running: false, confirming: false, initialized: false, deleteArmed: '', friendActorId: '', selectingNotifications: false, selectedNotificationIds: new Set(), notificationDeleteArmed: false, selectedPostIds: new Set(), manageQuery: '', manageAuthor: '', deletingPosts: false, stickerTarget: '', stickerCategory: 'all', stickerQuery: '' };
    const mediaModes = new Set(['off', 'manual', 'auto', 'ai']);
    const memoryState = { actorId: '', query: '', selected: new Set(), busy: false };
    const promptDefaults = {
        post: '你可以在聊天中自主决定发动态，也可以响应用户要求。发动态指令：[MOMENT:post]。你也可以删除自己发布的动态：[MOMENT:delete:动态ID]；删除后你仍会记得自己发过并删除了什么。',
        story: '你可以自主决定发布 24 小时 Story。指令：[MOMENT:story]。',
        browse: '你可以自主决定浏览有权看的动态。指令：[MOMENT:view:动态ID]。未打开前不知道帖子内容。',
        explicitView: '用户明确要求看某条动态时，你可以查看以完成请求。指令：[MOMENT:view:动态ID]。未打开前不知道帖子内容。',
        interact: '你可以给已看过或自己发布的动态点赞、评论，也可以评论自己的帖子、自言自语或回复别人。指令：[MOMENT:like:动态ID]、[MOMENT:comment:动态ID:评论文本]、[MOMENT:reply:动态ID:评论ID:回复文本]。可用表情包见下方列表；发送表情包指令：[MOMENT:sticker:动态ID:表情ID]、[MOMENT:reply-sticker:动态ID:评论ID:表情ID]。实际执行后才可以说已经完成。',
        contacts: '你知道自己的人脉及关系：{{人脉列表}}。可以自然地根据关系说起他们，不要泄露未公开的私聊。',
        seen: '以下是你实际已经看到的动态，未列出的动态内容你不知道：\n{{动态列表}}',
        unseen: '尚未打开的帖子（只知道作者和时间）：{{动态列表}}',
        postGeneration: '请写像真人随手分享的内容，不要每次都围绕用户，避免重复句式和无意义日常。',
        autonomy: '你可以自主决定此刻是否做动态相关的事，不要因为用户发帖就机械跟发。',
        chatViewDecision: '你可以决定是否现在打开一条查看，再继续私聊；没打开前不要假装看过正文。',
        viewDecision: '结合人设自然决定是否回应；可以完全不行动，也可以给自己的动态点赞、评论、自言自语或回复别人。不要机械夸赞，不要声称没执行的操作。',
        friendDecision: '根据人设、关系及最近发生的事独立决定同意、拒绝或忽略；忽略可以长期保持。也可选择是否告诉原本认识的角色。'
    };
    const promptDefinitions = [
        ['post', '自主发动态', '发帖与记录', '角色允许在当前场景发动态'],
        ['story', '自主发 Story', '发帖与记录', '角色允许在当前场景发 Story'],
        ['postGeneration', '发帖内容生成', '发帖与记录', '实际生成动态或 Story 正文时'],
        ['browse', '自主浏览', '浏览与互动', '角色已开启自主浏览'],
        ['explicitView', '明确请求观看', '浏览与互动', '仅开启互动、未开启自主浏览时'],
        ['interact', '点赞与评论', '浏览与互动', '角色已开启动态互动'],
        ['seen', '已看动态上下文', '浏览与互动', '存在实际已看过或自己发布的动态'],
        ['unseen', '未看帖子索引', '浏览与互动', '已开启浏览且存在未看帖子（不含正文）'],
        ['contacts', '角色人脉', '人脉与自主活动', '已开启人脉且存在可用人脉'],
        ['autonomy', '自主活动判断', '人脉与自主活动', '后台判断是否进行动态活动时'],
        ['chatViewDecision', '私聊中查看判断', '人脉与自主活动', '私聊中判断是否打开未看帖子时'],
        ['viewDecision', '观看后互动判断', '人脉与自主活动', '实际打开动态后决定如何互动时'],
        ['friendDecision', '人脉好友判断', '人脉与自主活动', '人脉处理好友申请时']
    ];
    function createPromptItems(room = db.magicRoom || {}) {
        return promptDefinitions.map(([key, name]) => ({
            id: `moments.${key}`, key, name, enabled: true,
            content: String(room.momentsPrompts?.[key] ?? promptDefaults[key])
        }));
    }
    function normalizePromptItems(items) {
        const used = new Set();
        return (Array.isArray(items) ? items : []).filter(entry => entry && Object.hasOwn(promptDefaults, entry.key)).map((entry, index) => {
            let itemId = String(entry.id || `moments.item.${index}`);
            while (used.has(itemId)) itemId += `.${index}`;
            used.add(itemId);
            return { id: itemId, key: entry.key, name: String(entry.name || '未命名条目'), content: String(entry.content ?? ''), enabled: entry.enabled !== false };
        });
    }
    function getPromptItems(room = db.magicRoom || {}) {
        // An intentionally empty list means all editable rules have been removed.
        return Array.isArray(room.momentsPromptItems) ? normalizePromptItems(room.momentsPromptItems) : createPromptItems(room);
    }
    function compilePromptRules(rules, items = getPromptItems()) {
        return items.filter(entry => entry.enabled && Object.hasOwn(rules, entry.key)).map(entry => {
            const variables = rules[entry.key];
            return entry.content.replace(/\{\{([^{}]+)\}\}/g, (match, name) => Object.hasOwn(variables, name) ? String(variables[name]) : match).trim();
        }).filter(Boolean).join('\n');
    }
    function promptRule(key, variables = {}) {
        return compilePromptRules({ [key]: variables });
    }
    let persistQueue = Promise.resolve();
    const id = prefix => prefix + '_' + (globalThis.crypto?.randomUUID?.() || Date.now() + '_' + Math.random().toString(36).slice(2));
    const esc = value => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const bilingualContent = window.BilingualContent || { prompt: () => '', html: (_text, _character, _scope, _feature, options) => options?.originalHtml || '' };
    const safeImage = value => /^(https?:\/\/|data:image\/(?:png|jpeg|jpg|gif|webp);base64,)/i.test(String(value || '')) ? String(value) : '';
    const safeMedia = (value, type) => new RegExp('^data:' + type + '/[a-z0-9.+-]+(?:;[a-z0-9=.+-]+)*;base64,', 'i').test(String(value || '')) ? String(value) : '';
    const toast = message => { if (typeof showToast === 'function') showToast(message); };

    function ensure() {
        if (!db.moments || typeof db.moments !== 'object') db.moments = {};
        const m = db.moments;
        if (!Array.isArray(m.posts)) m.posts = [];
        if (!Array.isArray(m.contacts)) m.contacts = [];
        if (!Array.isArray(m.groups)) m.groups = [];
        if (!Array.isArray(m.notifications)) m.notifications = [];
        if (!Array.isArray(m.friendRequests)) m.friendRequests = [];
        if (!Array.isArray(m.activityEvents)) m.activityEvents = [];
        if (!m.characterPersonaIds || typeof m.characterPersonaIds !== 'object') m.characterPersonaIds = {};
        if (!m.settings || typeof m.settings !== 'object') m.settings = {};
        if (!['mutual', 'all'].includes(m.settings.interactionVisibility)) m.settings.interactionVisibility = 'mutual';
        m.settings.viewMode = 'now';
        if (!['remark', 'real'].includes(m.settings.characterNameSource)) m.settings.characterNameSource = 'remark';
        for (const key of ['characterNicknameAwareness', 'contactNicknameAwareness', 'characterSelfRename', 'contactSelfRename']) m.settings[key] = m.settings[key] === true;
        if (!Number.isFinite(m.lastCatchupAt)) m.lastCatchupAt = 0;
        return m;
    }
    function persist() { persistQueue = persistQueue.catch(() => false).then(() => saveGlobalSettings(['moments'])); return persistQueue; }
    function charActor(charId) { const character = (db.characters || []).find(c => c.id === charId); return character?.momentsActorId || 'char:' + charId; }
    function findCharacter(actorId) { return (db.characters || []).find(c => c.momentsActorId === actorId || (String(actorId || '').startsWith('char:') && c.id === actorId.slice(5))) || null; }
    function memoryAllowed(postId, actorId) {
        return !postId || !findCharacter(actorId)?.momentsSettings?.forgottenPostIds?.includes(postId);
    }
    function characterSettings(character) {
        if (!character.momentsSettings || typeof character.momentsSettings !== 'object') character.momentsSettings = {};
        const s={...character.momentsSettings};
        if (controls) {
            const p=controls.preferences(charActor(character.id));
            for(const key of ['postEnabled','storyEnabled','browseEnabled','watchEnabled','likeEnabled','commentEnabled','replyEnabled','contactsEnabled','chatLinked'])s[key]=p[key];
            s.interactEnabled=p.likeEnabled||p.commentEnabled||p.replyEnabled;
        } else {
            for(const key of ['postEnabled','storyEnabled','browseEnabled','interactEnabled','contactsEnabled'])s[key]=s[key]===true;
            for(const key of ['likeEnabled','commentEnabled','replyEnabled'])if(typeof s[key]!=='boolean')s[key]=s.interactEnabled;
            if(typeof s.watchEnabled!=='boolean')s.watchEnabled=true;
            s.chatLinked=(s.preferences?.chatLinked ?? ensure().controls?.preferences?.chatLinked) !== false;
        }
        s.showActivityNarration=s.showActivityNarration===true;
        s.backgroundPostEnabled=s.backgroundPostEnabled!==false;
        for(const key of ['nicknameAwareness','selfRename'])if(!['inherit','on','off'].includes(s[key]))s[key]='inherit';
        s.imageMode=mediaModes.has(s.imageMode)?s.imageMode:'off';s.voiceMode=mediaModes.has(s.voiceMode)?s.voiceMode:'off';
        return s;
    }
    function contactsFor(charId) {
        const direct = ensure().contacts.filter(c => c.ownerCharId === charId);
        const linkedIds = new Set(direct.filter(c => c.kind === 'linked').map(c => c.actorId));
        const incoming = ensure().contacts.filter(c => c.kind === 'linked' && findCharacter(c.actorId)?.id === charId && !linkedIds.has(charActor(c.ownerCharId)) && (db.characters || []).some(ch => ch.id === c.ownerCharId));
        return [...direct, ...incoming.map(c => ({ ...c, ownerCharId: charId, actorId: charActor(c.ownerCharId), relationship: c.reverseRelationship || '', reverseRelationship: c.relationship || '', mayInteract: c.reverseMayInteract === true, mayPost: c.reverseMayPost === true, mayStory: c.reverseMayStory === true, reverseOfId: c.id }))];
    }
    function activeContactsFor(charId) { return contactsFor(charId).filter(c => c.enabled !== false && (c.kind !== 'linked' || findCharacter(c.actorId))); }
    function worldCategoryPath(value) { return String(value || '未分类').trim().replace(/^[\/\\]+|[\/\\]+$/g, '').replace(/\\/g, '/') || '未分类'; }
    function boundWorldBooks(contact) {
        const binding = contact?.worldBookBinding;
        if (!binding) return [];
        const owner = (db.characters || []).find(c => c.id === contact.ownerCharId);
        const ids = new Set([...(binding.itemIds || []), ...(binding.inheritOwner ? owner?.worldBookIds || [] : [])]);
        const paths = binding.mode === 'follow' ? binding.categoryPaths || [] : [];
        return (db.worldBooks || []).filter(book => !book.disabled && !((binding.excludedItemIds || []).includes(book.id)) && (ids.has(book.id) || paths.some(path => worldCategoryPath(book.category) === path || worldCategoryPath(book.category).startsWith(path + '/'))));
    }
    function activePreset() { return (db.myPersonaPresets || []).find(p => p.id === db.activePersonaId) || (db.myPersonaPresets || [])[0] || null; }
    function ensureUserPreset() {
        if (!Array.isArray(db.myPersonaPresets)) db.myPersonaPresets = [];
        if (db.myPersonaPresets.length) {
            let changed = false;
            for (const preset of db.myPersonaPresets) {
                if (!preset.id) { preset.id = id('persona'); changed = true; }
                if (!preset.bindings) { preset.bindings = {}; changed = true; }
            }
            if (changed) saveGlobalSettings(['myPersonaPresets']);
            return activePreset();
        }
        const first = (db.characters || [])[0];
        const preset = { id: id('persona'), name: first?.myName || '我', avatar: first?.myAvatar || '', persona: first?.myPersona || '', bindings: {}, momentsProfile: {} };
        db.myPersonaPresets.push(preset);
        saveGlobalSettings(['myPersonaPresets']);
        return preset;
    }
    function migrateLegacyUserPosts() {
        const m = ensure();
        const legacy = m.posts.filter(post => post.authorId === 'user' && !post.authorPersonaId);
        if (!legacy.length && !m.posts.some(post => (post.comments || []).some(c => c.authorId === 'user' && !c.authorPersonaId))) return false;
        if (!m.legacyUserIdentity) {
            const current = userIdentity();
            m.legacyUserIdentity = { name: current.name, avatar: current.avatar, persona: current.persona };
        }
        for (const post of m.posts) {
            if (post.authorId === 'user' && !post.authorPersonaId) { post.authorPersonaId = 'legacy'; post.authorSnapshot ||= { name: m.legacyUserIdentity.name, avatar: m.legacyUserIdentity.avatar }; }
            for (const comment of post.comments || []) if (comment.authorId === 'user' && !comment.authorPersonaId) { comment.authorPersonaId = 'legacy'; comment.authorSnapshot ||= { name: m.legacyUserIdentity.name, avatar: m.legacyUserIdentity.avatar }; }
            if ((post.likes || []).includes('user') && !post.userLikePersonaId) post.userLikePersonaId = post.authorId === 'user' ? post.authorPersonaId : 'legacy';
        }
        return true;
    }
    function userIdentity(personaId = '') {
        if (personaId === 'legacy') return { id: 'user', personaId: 'legacy', ...(ensure().legacyUserIdentity || { name: '旧用户身份', avatar: '', persona: '' }), signature: '', cover: '' };
        const preset = (db.myPersonaPresets || []).find(p => p.id === personaId) || (!personaId ? activePreset() : null);
        if (personaId && !preset) {
            const post = ensure().posts.find(item => item.authorPersonaId === personaId && item.authorSnapshot);
            const comment = post ? null : ensure().posts.flatMap(item => item.comments || []).find(item => item.authorPersonaId === personaId && item.authorSnapshot);
            return { id: 'user', personaId, name: post?.authorSnapshot?.name || comment?.authorSnapshot?.name || '已删除的人设', avatar: post?.authorSnapshot?.avatar || comment?.authorSnapshot?.avatar || '', persona: '', signature: '', cover: '' };
        }
        const first = (db.characters || [])[0];
        return { id: 'user', personaId: preset?.id || '', name: preset?.momentsProfile?.nickname || preset?.name || first?.myName || '我', baseName: preset?.name || first?.myName || '我', nickname: preset?.momentsProfile?.nickname || '', avatar: preset?.avatar || first?.myAvatar || '', persona: preset?.persona || '', signature: preset?.momentsProfile?.signature || '', cover: preset?.momentsProfile?.cover || '' };
    }
    function knownPersonaId(actorId, fallbackId = activePreset()?.id || '') {
        const char = findCharacter(actorId);
        const ownerId = char?.id || ensure().contacts.find(c => c.actorId === actorId)?.ownerCharId;
        if (!ownerId) return fallbackId;
        const explicit = ensure().characterPersonaIds[ownerId];
        if (explicit && (db.myPersonaPresets || []).some(p => p.id === explicit)) return explicit;
        const bound = (db.myPersonaPresets || []).filter(p => p.bindings?.[ownerId]);
        return bound.length === 1 ? bound[0].id : bound.length > 1 ? '' : fallbackId;
    }
    function profilePersonaForPost(post) { return post?.authorId === 'user' ? post.authorPersonaId || 'legacy' : post?.userRecipientPersonaId || knownPersonaId(post?.authorId); }
    function actorProfile(actorId, personaId = '') {
        if (actorId === 'user') return userIdentity(personaId);
        const character = findCharacter(actorId);
        if (character) {
            const baseName = ensure().settings.characterNameSource === 'real' ? character.realName || character.remarkName || '角色' : character.remarkName || character.realName || '角色';
            return { id: actorId, name: character.momentsProfile?.nickname || baseName, baseName, nickname: character.momentsProfile?.nickname || '', avatar: character.avatar || '', persona: character.persona || '', signature: character.momentsProfile?.signature || '', cover: character.momentsProfile?.cover || character.bannerImage || '', character };
        }
        const contact = ensure().contacts.find(c => c.actorId === actorId && c.kind === 'npc');
        return contact ? { id: actorId, name: contact.nickname || contact.name || '人脉', baseName: contact.name || '人脉', nickname: contact.nickname || '', avatar: contact.avatar || '', persona: contact.persona || '', signature: contact.signature || '', cover: contact.cover || '', contact } : null;
    }
    function person(actorId) {
        if (actorId === 'user') return userIdentity();
        return actorProfile(actorId);
    }
    function nicknameSetting(actorId, key) {
        const character = findCharacter(actorId);
        const contact = character ? null : ensure().contacts.find(c => c.actorId === actorId && c.kind === 'npc');
        if (!character && !contact) return false;
        const local = character ? characterSettings(character)[key] : contact[key] || 'inherit';
        if (local === 'on') return true;
        if (local === 'off') return false;
        const globalKey = (character ? 'character' : 'contact') + (key === 'selfRename' ? 'SelfRename' : 'NicknameAwareness');
        return ensure().settings[globalKey] === true;
    }
    function aiName(actorId, viewerId, personaId = '') {
        const profile = actorId === 'user' ? userIdentity(personaId) : person(actorId);
        if (!profile) return '某人';
        return viewerId !== 'user' && !nicknameSetting(viewerId, 'nicknameAwareness') && !(viewerId === actorId && nicknameSetting(actorId, 'selfRename')) ? profile.character?.realName || profile.baseName || profile.name : profile.name;
    }
    function availableStickers(actorId = 'user') {
        const stickers = Array.isArray(db.myStickers) ? db.myStickers : [];
        if (actorId === 'user') return stickers;
        const contact = ensure().contacts.find(item => item.actorId === actorId);
        const character = findCharacter(actorId) || (db.characters || []).find(item => item.id === contact?.ownerCharId);
        if (!character) return [];
        const groups = String(character.stickerGroups || '').split(/[,，]/).map(value => value.trim()).filter(value => value && value !== '未分类');
        return stickers.filter(sticker => groups.includes(sticker.group));
    }
    function stickerSnapshot(stickerId, actorId = 'user') {
        const sticker = availableStickers(actorId).find(item => item.id === stickerId);
        return sticker && safeImage(sticker.data) ? { id: sticker.id, name: String(sticker.name || '表情包').slice(0, 80), data: sticker.data, description: String(sticker.description || '').slice(0, 180) } : null;
    }
    function stickerChoices(actorId) {
        return availableStickers(actorId).filter(item => safeImage(item.data)).map(item => `${item.id}=${String(item.name || '表情包').slice(0, 30)}${item.description ? `（${String(item.description).slice(0, 45)}）` : ''}`).join('；');
    }
    function stickerHtml(sticker, className = 'moments-comment-sticker') {
        const src = safeImage(sticker?.data);
        return src ? `<img class="${className}" src="${esc(src)}" alt="${esc(sticker.name || '表情包')}" title="${esc(sticker.name || '表情包')}">` : '';
    }
    function postSummary(post) {
        const text = String(post?.text || '').replace(/\s+/g, ' ').trim();
        const sticker = (post?.media || []).find(item => item.type === 'sticker');
        const stickerText = sticker ? `[表情包：${sticker.name || '表情包'}]` : '';
        return (text ? text.slice(0, 95) + (stickerText ? ' ' + stickerText : '') : stickerText || ((post?.media || []).length ? '[媒体]' : '[无文字]')).slice(0, 130);
    }
    function postAuthorName(post) { return post?.authorId === 'user' ? userIdentity(profilePersonaForPost(post)).name : person(post?.authorId)?.name || '某人'; }
    function commentAuthorName(post, comment) { return comment?.authorId === 'user' ? userIdentity(comment.authorPersonaId || profilePersonaForPost(post)).name : person(comment?.authorId)?.name || '有人'; }
    function postContextText(post, limit) {
        const stickerNames = (post?.media || []).filter(item => item.type === 'sticker').map(item => `[表情包：${item.name || '表情包'}]`).join(' ');
        return [String(post?.text || (stickerNames ? '' : '[媒体]')).slice(0, limit), stickerNames].filter(Boolean).join(' ');
    }
    function commentSummary(comment) { return [String(comment?.text || '').trim(), comment?.sticker ? `[表情包：${comment.sticker.name || '表情包'}]` : ''].filter(Boolean).join(' ').slice(0, 180); }
    function recordActivity(type, actorId, post, detail = '', knownTo = [], commentId = '') {
        const ids = [...new Set([actorId, ...knownTo].filter(value => value && value !== 'user' && person(value) && memoryAllowed(post.id, value)))];
        const authorName = (actorId === 'user' ? userIdentity(post.authorPersonaId || post.userInteractionPersonaId || 'legacy') : person(actorId))?.name || '有人';
        const subject = postSummary(post);
        const actions = { post: '发布了动态', story: '发布了 Story', edit: '编辑了动态', delete: '删除了动态', view: '查看了动态', like: '赞了动态', unlike: '取消了点赞', comment: '评论了动态', reply: '回复了评论', 'edit-comment': '修改了评论', 'delete-comment': '删除了评论' };
        const text = `${authorName}${actions[type] || '操作了动态'}「${subject}」${detail ? `：${String(detail).replace(/\s+/g, ' ').slice(0, 130)}` : ''}`.replace(/\[/g, '（').replace(/\]/g, '）');
        const event = { id: id('moments_activity'), type, actorId, postId: post.id, postAuthorId: post.authorId, ...(commentId ? { commentId } : {}), knownTo: ids, text, createdAt: Date.now() };
        ensure().activityEvents.push(event);
        return event;
    }
    async function deliverActivity(event) {
        if (!event) return;
        for (const actorId of event.knownTo || []) {
            const character = findCharacter(actorId);
            if (!character || !memoryAllowed(event.postId, actorId)) continue;
            if (!Array.isArray(character.history)) character.history = [];
            if (character.history.some(message => message.momentsEventId === event.id)) continue;
            const message = { id: 'msg_' + event.id, role: 'system', content: `[system-display:${event.text}]`, timestamp: event.createdAt, parts: [], isMomentsActivity: true, excludeFromContext: true, momentsEventId: event.id, momentsPostId: event.postId || '' };
            character.history.push(message);
            try { await saveCharacter(character.id); } catch (error) { console.error('动态旁白保存失败', error); }
            if (typeof currentChatType !== 'undefined' && currentChatType === 'private' && currentChatId === character.id && characterSettings(character).showActivityNarration && typeof addMessageBubble === 'function') addMessageBubble(message, character.id, 'private');
        }
    }
    function activityContext(actorId) {
        const events = ensure().activityEvents.filter(event => (event.knownTo || []).includes(actorId) && (event.type !== 'nickname' || nicknameSetting(actorId, 'nicknameAwareness') || (event.actorId === actorId && nicknameSetting(actorId, 'selfRename'))) && (!event.commentId || event.type === 'delete-comment' || findPost(event.postId)?.comments?.some(comment => comment.id === event.commentId && !comment.deletedAt)));
        const remembered = events.filter(event => memoryAllowed(event.postId, actorId));
        const recent = remembered.slice(-8);
        const deleted = remembered.filter(event => event.type === 'delete' && event.postAuthorId === actorId && !recent.includes(event)).slice(-30);
        const relevant = [...deleted, ...recent].sort((a, b) => a.createdAt - b.createdAt);
        return relevant.map(event => `- ${event.text}`).join('\n');
    }
    async function changeNickname(actorId, personaId, value, selfChosen = false) {
        const character = findCharacter(actorId);
        const contact = character ? null : ensure().contacts.find(c => c.actorId === actorId && c.kind === 'npc');
        const preset = actorId === 'user' ? (db.myPersonaPresets || []).find(p => p.id === personaId) : null;
        if (!character && !contact && !preset) return { ok: false, reason: '资料已不存在' };
        if (selfChosen && !nicknameSetting(actorId, 'selfRename')) return { ok: false, reason: '自主修改网名未开启' };
        const nickname = String(value || '').trim();
        if (nickname.length > 24 || /[\[\]\r\n\u0000-\u001f]/u.test(nickname)) return { ok: false, reason: '网名最多 24 字，不能包含换行或指令符号' };
        if (selfChosen && !nickname) return { ok: false, reason: '自主修改时不能清空网名' };
        const holder = character ? characterSettings(character) : contact;
        if (selfChosen && Date.now() - (holder.lastNicknameAt || 0) < 24 * 60 * 60 * 1000) return { ok: false, reason: '距离上次自主改名不足一天' };
        const before = actorId === 'user' ? userIdentity(personaId).name : person(actorId).name;
        const previous = character ? character.momentsProfile?.nickname || '' : contact ? contact.nickname || '' : preset.momentsProfile?.nickname || '';
        if (previous === nickname) return { ok: true, unchanged: true };
        for (const post of ensure().posts) {
            if (post.mentions?.includes(actorId) && !post.mentionLabels?.[actorId]) {
                const label = mentionLabel(post.text, actorId, 'user', before);
                if (label) (post.mentionLabels ||= {})[actorId] = label;
            }
            for (const comment of post.comments || []) if (comment.mentions?.includes(actorId) && !comment.mentionLabels?.[actorId]) {
                const label = mentionLabel(comment.text, actorId, 'user', before);
                if (label) (comment.mentionLabels ||= {})[actorId] = label;
            }
        }
        if (character || preset) (character || preset).momentsProfile ||= {};
        if (character) character.momentsProfile.nickname = nickname;
        else if (contact) contact.nickname = nickname;
        else preset.momentsProfile.nickname = nickname;
        const previousTime = holder?.lastNicknameAt;
        if (holder) holder.lastNicknameAt = Date.now();
        const saved = character ? await saveCharacter(character.id) : contact ? await persist() : await saveGlobalSettings(['myPersonaPresets']);
        if (!saved) {
            if (character) character.momentsProfile.nickname = previous;
            else if (contact) contact.nickname = previous;
            else preset.momentsProfile.nickname = previous;
            if (holder) holder.lastNicknameAt = previousTime;
            return { ok: false, reason: '网名保存失败' };
        }
        const after = actorId === 'user' ? userIdentity(personaId).name : person(actorId).name;
        const knownTo = actorId === 'user'
            ? (db.characters || []).filter(c => knownPersonaId(charActor(c.id)) === personaId && nicknameSetting(charActor(c.id), 'nicknameAwareness')).map(c => charActor(c.id))
            : [...friendIds(actorId)].filter(id => id !== 'user' && nicknameSetting(id, 'nicknameAwareness'));
        if (actorId !== 'user' && (nicknameSetting(actorId, 'nicknameAwareness') || nicknameSetting(actorId, 'selfRename'))) knownTo.push(actorId);
        const event = { id: id('moments_activity'), type: 'nickname', actorId, personaId: actorId === 'user' ? personaId : '', knownTo: [...new Set(knownTo)], text: `${before}将动态网名改为「${after}」`, createdAt: Date.now() };
        ensure().activityEvents.push(event);
        await persist();
        await deliverActivity(event);
        renderFeed();
        if (el('moments-profile-screen').classList.contains('active') && state.profileActorId === actorId) renderProfile(actorId, state.profilePersonaId);
        if (el('moments-detail-screen').classList.contains('active') && state.currentPostId) renderDetail(state.currentPostId);
        return { ok: true };
    }
    function avatar(actorId, className = 'moments-avatar', interactive = true, personaId = '') {
        const p = actorId === 'user' ? userIdentity(personaId) : person(actorId);
        const src = safeImage(p?.avatar);
        const content = src ? `<img src="${esc(src)}" alt="">` : `<span class="moments-avatar-fallback">${esc((p?.name || '?').slice(0, 1))}</span>`;
        return interactive ? `<button type="button" class="${className}" data-action="profile" data-actor-id="${esc(actorId)}" ${actorId === 'user' ? `data-persona-id="${esc(p.personaId)}"` : ''} aria-label="查看${esc(p?.name || '用户')}主页">${content}</button>` : `<span class="${className}">${content}</span>`;
    }
    function visibleTo(post, actorId) {
        return !!post && (post.authorId === actorId || (Array.isArray(post.audienceIds) && post.audienceIds.includes(actorId)));
    }
    function friendIds(actorId) {
        const friends = new Set([actorId]);
        if (actorId === 'user') {
            (db.characters || []).forEach(c => friends.add(charActor(c.id)));
        } else if (findCharacter(actorId)) {
            friends.add('user');
            activeContactsFor(findCharacter(actorId).id).forEach(c => friends.add(c.actorId));
            ensure().contacts.filter(c => c.actorId === actorId && c.enabled !== false).forEach(c => friends.add(charActor(c.ownerCharId)));
            ensure().contacts.filter(c => c.kind === 'linked' && c.actorId === actorId && c.enabled !== false).forEach(c => friends.add(charActor(c.ownerCharId)));
        } else {
            const contact = ensure().contacts.find(c => c.actorId === actorId);
            if (contact) {
                friends.add(charActor(contact.ownerCharId));
                activeContactsFor(contact.ownerCharId).forEach(c => friends.add(c.actorId));
            }
        }
        return friends;
    }
    function canSeeInteraction(post, viewerId, actorId, interactionPersonaId = '') {
        if (!visibleTo(post, viewerId)) return false;
        if (actorId === 'user' && viewerId !== 'user' && interactionPersonaId && interactionPersonaId !== 'legacy' && (post.viewerPersonaIds?.[viewerId] || knownPersonaId(viewerId)) !== interactionPersonaId) return false;
        if (!visibleTo(post, actorId) && actorId !== post.authorId && viewerId !== 'user' && viewerId !== post.authorId) return false;
        if (viewerId === 'user' || viewerId === post.authorId || ensure().settings.interactionVisibility === 'all') return true;
        return actorId === post.authorId || actorId === viewerId || friendIds(viewerId).has(actorId);
    }
    function readableTime(timestamp) {
        const delta = Date.now() - timestamp;
        if (delta < 60000) return '刚刚';
        if (delta < 3600000) return Math.max(1, Math.floor(delta / 60000)) + ' 分钟前';
        if (delta < 86400000) return Math.floor(delta / 3600000) + ' 小时前';
        return new Date(timestamp).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
    }
    function mentionLabel(text, actorId, viewerId, previous = '') {
        const profile = person(actorId);
        const candidates = [previous, aiName(actorId, viewerId), profile?.name, profile?.character?.realName, profile?.character?.remarkName].filter(Boolean);
        return candidates.sort((a, b) => b.length - a.length).find(name => String(text).includes('@' + name)) || '';
    }
    function renderText(text, mentions, mentionLabels = {}, authorId = '') {
        let html = esc(text);
        for (const actorId of (mentions || [])) {
            const name = mentionLabels?.[actorId] || person(actorId)?.name;
            if (!name) continue;
            const needle = '@' + esc(name);
            html = html.split(needle).join(`<span class="moments-mention">${needle}</span>`);
        }
        const character = findCharacter(authorId);
        return character ? bilingualContent.html(text, character, 'moments', 'moments', { originalHtml: html }) : html;
    }
    function mediaHtml(post) {
        const media = Array.isArray(post.media) ? post.media : [];
        if (!media.length) return '';
        const items = media.map((item, index) => {
            if (item.status === 'pending' || item.status === 'error' || item.status === 'working') {
                return `<div class="moments-media-pending">${esc(item.type === 'image' ? '图片' : '语音')}${item.status === 'error' ? '生成失败' + (item.faceLockError ? '：' + esc(item.faceLockError) : '') : item.status === 'working' ? '生成中…' : '待生成'}${post.authorId !== 'user' && item.status !== 'working' ? `<button type="button" data-action="generate-media" data-post-id="${esc(post.id)}" data-index="${index}">生成</button>` : ''}</div>`;
            }
            if (item.type === 'image' || item.type === 'sticker') return `<img class="${item.type === 'sticker' ? 'moments-post-sticker' : ''}" src="${esc(safeImage(item.data))}" alt="${esc(item.type === 'sticker' ? item.name || '表情包' : '动态图片')}" data-action="view-image" data-post-id="${esc(post.id)}" data-index="${index}">`;
            if (item.type === 'video') return `<video src="${esc(safeMedia(item.data, 'video'))}" controls preload="metadata" playsinline></video>`;
            if (item.type === 'audio') return `<audio src="${esc(safeMedia(item.data, 'audio'))}" controls preload="none"></audio>`;
            return '';
        }).join('');
        return `<div class="moments-media-grid${media.length === 1 ? ' single' : ''}">${items}</div>`;
    }
    function cardHtml(post, viewerId = 'user') {
        const author = post.authorId === 'user' ? userIdentity(profilePersonaForPost(post)) : person(post.authorId);
        if (!author || !visibleTo(post, viewerId)) return '';
        const likes = (post.likes || []).filter(actorId => canSeeInteraction(post, viewerId, actorId, actorId === 'user' ? post.userLikePersonaId : '') && person(actorId));
        const comments = (post.comments || []).filter(c => !c.deletedAt && canSeeInteraction(post, viewerId, c.authorId, c.authorPersonaId) && person(c.authorId));
        const likeNames = likes.slice(0, 8).map(a => esc(a === 'user' ? userIdentity(post.userLikePersonaId || profilePersonaForPost(post)).name : person(a).name)).join('、');
        const previewComments = comments.slice(-3).map(c => `<p><b>${esc(c.authorId === 'user' ? userIdentity(c.authorPersonaId || profilePersonaForPost(post)).name : person(c.authorId)?.name)}</b>${c.replyTo ? ` 回复 <b>${esc(person((post.comments || []).find(x => x.id === c.replyTo)?.authorId)?.name || '对方')}</b>` : ''}：${renderText(c.text, c.mentions, c.mentionLabels, c.authorId)}${stickerHtml(c.sticker)}</p>`).join('');
        const isLiked = (post.likes || []).includes('user');
        const heartSvg = isLiked
            ? `<svg class="moments-action-svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
            : `<svg class="moments-action-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
        const commentSvg = `<svg class="moments-action-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 4H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z" stroke-linejoin="round"/><circle cx="8" cy="11" r="1.1" fill="currentColor"/><circle cx="12" cy="11" r="1.1" fill="currentColor"/><circle cx="16" cy="11" r="1.1" fill="currentColor"/></svg>`;
        const interactionHeart = `<span class="moments-interactions-heart" aria-hidden="true"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></span>`;
        const dotsSvg = `<svg class="moments-dots-svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`;
        return `<article class="moments-card" data-post-id="${esc(post.id)}"><div class="moments-card-head">${avatar(post.authorId, 'moments-avatar', true, profilePersonaForPost(post))}<div class="moments-card-meta"><button type="button" class="moments-card-name" data-action="profile" data-actor-id="${esc(post.authorId)}" ${post.authorId === 'user' ? `data-persona-id="${esc(profilePersonaForPost(post))}"` : ''}>${esc(author.name)}</button><div class="moments-card-time">${readableTime(post.createdAt)}${post.authorId === 'user' ? ' · ' + (post.audienceIds?.length === 1 ? '仅自己' : '部分可见') : ''}</div></div><button type="button" class="moments-card-menu" data-action="post-menu" data-post-id="${esc(post.id)}" aria-label="更多操作">⋯</button></div>${post.text ? `<div class="moments-card-text">${renderText(post.text, post.mentions, post.mentionLabels, post.authorId)}</div>` : ''}${mediaHtml(post)}<div class="moments-card-actions"><button type="button" data-action="like" data-post-id="${esc(post.id)}" class="${isLiked ? 'liked' : ''}"><span class="moments-action-icon">${heartSvg}</span> <span class="moments-action-count">${likes.length || '赞'}</span></button><button type="button" data-action="detail" data-post-id="${esc(post.id)}"><span class="moments-action-icon">${commentSvg}</span> <span class="moments-action-count">${comments.length || '评论'}</span></button>${post.authorId === 'user' ? `<button type="button" class="moments-result-btn" data-action="result" data-post-id="${esc(post.id)}" aria-label="查看结果" title="查看结果">${dotsSvg}</button>` : ''}</div>${likeNames || previewComments ? `<div class="moments-interactions">${likeNames ? `<p class="moments-interactions-likes">${interactionHeart} <span>${likeNames}</span></p>` : ''}${previewComments}${comments.length > 3 ? `<button type="button" data-action="detail" data-post-id="${esc(post.id)}">查看全部 ${comments.length} 条评论</button>` : ''}</div>` : ''}</article>`;
    }
    function activeStories() { return ensure().posts.filter(p => p.kind === 'story' && p.expiresAt > Date.now() && visibleTo(p, 'user')).sort((a, b) => b.createdAt - a.createdAt); }
    function renderStories() {
        const stories = activeStories();
        const seen = new Set();
        const items = [`<button type="button" class="moments-story-item mine" data-action="new-story"><span class="moments-story-ring">${avatar('user', 'moments-avatar', false)}</span><span>我的 Story</span></button>`, `<button type="button" class="moments-story-item" data-action="profile" data-actor-id="user"><span class="moments-story-ring">${avatar('user', 'moments-avatar', false)}</span><span>我的主页</span></button>`];
        for (const story of stories) {
            const storyAuthorKey = story.authorId === 'user' ? 'user:' + profilePersonaForPost(story) : story.authorId;
            if (seen.has(storyAuthorKey)) continue;
            seen.add(storyAuthorKey);
            items.push(`<button type="button" class="moments-story-item" data-action="story" data-post-id="${esc(story.id)}"><span class="moments-story-ring">${avatar(story.authorId, 'moments-avatar', false, profilePersonaForPost(story))}</span><span>${esc(postAuthorName(story) || '好友')}</span></button>`);
        }
        el('moments-story-strip').innerHTML = items.join('');
    }
    function renderFeed() {
        renderStories();
        if (el('moments-my-avatar')) el('moments-my-avatar').innerHTML = avatar('user', 'moments-avatar', false);
        const posts = ensure().posts.filter(p => p.kind === 'post' && visibleTo(p, 'user')).sort((a, b) => b.createdAt - a.createdAt);
        el('moments-feed').innerHTML = posts.length ? posts.map(p => cardHtml(p)).join('') : '<div class="moments-empty">这里还没有动态。<br>发一条动态，或在角色聊天设置中开启主动发布。</div>';
        el('moments-unread-badge').hidden = !ensure().notifications.some(n => n.toId === 'user' && !n.read);
    }
    function findPost(postId) { return ensure().posts.find(p => p.id === postId); }
    function replyAuthorName(post, reply) { return reply?.authorId === 'user' ? userIdentity(reply.authorPersonaId || profilePersonaForPost(post)).name : person(reply?.authorId)?.name || '对方'; }
    function archivedRepliesHtml(post, comment) {
        const archives = (post.archivedCommentReplies || []).filter(item => item.parentCommentId === comment.id);
        if (!archives.length) return '';
        return `<details class="moments-comment-history"><summary>查看修改前的回复 (${archives.reduce((count, item) => count + item.comments.length, 0)})</summary>${archives.map(item => `<div class="moments-comment-history-entry"><small>修改前：${comment.deletedAt ? '该评论已删除' : esc(item.previousText || '[表情包]')}</small>${item.comments.map(reply => `<p><b>${esc(replyAuthorName(post, reply))}</b>${reply.replyTo && reply.replyTo !== comment.id ? ` 回复 ${esc(replyAuthorName(post, item.comments.find(c => c.id === reply.replyTo)))} ` : '：'}${renderText(reply.text, reply.mentions, reply.mentionLabels, reply.authorId)}${stickerHtml(reply.sticker)}</p>`).join('')}</div>`).join('')}</details>`;
    }
    function renderDetail(postId) {
        const post = findPost(postId);
        if (!post || !visibleTo(post, 'user')) { toast('这条动态已不可查看'); switchScreen('moments-screen'); return; }
        if (state.currentPostId !== postId) {
            el('moments-comment-input').value = '';
            el('moments-comment-input').dataset.replyTo = '';
            el('moments-comment-input').dataset.mentions = '';
        }
        state.currentPostId = postId;
        const comments = (post.comments || []).filter(c => canSeeInteraction(post, 'user', c.authorId, c.authorPersonaId) && person(c.authorId));
        el('moments-detail-content').innerHTML = cardHtml(post) + `<div class="moments-detail-comments"><h2>评论 · ${comments.filter(c => !c.deletedAt).length}</h2>${comments.map(c => `<div class="moments-detail-comment">${avatar(c.authorId, 'moments-avatar', true, c.authorPersonaId || profilePersonaForPost(post))}<div><b>${esc(replyAuthorName(post, c))}</b><p>${c.deletedAt ? '<span class="moments-comment-deleted">该评论已删除</span>' : `${c.replyTo ? `回复 ${esc(replyAuthorName(post, (post.comments || []).find(item => item.id === c.replyTo)))}：` : ''}${renderText(c.text, c.mentions, c.mentionLabels, c.authorId)}`}</p>${c.deletedAt ? '' : stickerHtml(c.sticker)}<small>${readableTime(c.createdAt)}${!c.deletedAt && c.editedAt ? ' · 已编辑' : ''}</small>${c.deletedAt ? '' : `<button type="button" data-action="reply" data-post-id="${esc(post.id)}" data-comment-id="${esc(c.id)}">回复</button>${c.authorId === 'user' ? `<button type="button" data-action="edit-comment" data-post-id="${esc(post.id)}" data-comment-id="${esc(c.id)}">编辑</button>` : ''}${c.authorId === 'user' && c.editedAt && (post.comments || []).some(item => item.replyTo === c.id && item.authorId !== 'user' && !item.deletedAt) ? `<button type="button" data-action="regenerate-comment-replies" data-post-id="${esc(post.id)}" data-comment-id="${esc(c.id)}" ${state.regeneratingComments.has(c.id) ? 'disabled' : ''}>${state.regeneratingComments.has(c.id) ? '回复中…' : '重新回复'}</button>` : ''}<button type="button" class="moments-comment-delete" data-action="delete-comment" data-post-id="${esc(post.id)}" data-comment-id="${esc(c.id)}" ${state.deletingComments.has(c.id) ? 'disabled' : ''}>删除</button>`}${archivedRepliesHtml(post, c)}</div></div>`).join('') || '<p class="moments-hint">还没有评论</p>'}</div>`;
        const reply = post.comments?.find(item => item.id === el('moments-comment-input').dataset.replyTo && !item.deletedAt);
        el('moments-reply-target').hidden = !reply;
        if (reply) el('moments-reply-target-label').textContent = `回复 ${replyAuthorName(post, reply)}`;
        else if (el('moments-comment-input').dataset.replyTo) clearReplyTarget();
        const replyPersonaId = profilePersonaForPost(post);
        el('moments-comment-input').placeholder = `以${userIdentity(replyPersonaId).name}评论，输入 @ 可提及…`;
        switchScreen('moments-detail-screen');
    }
    function renderProfile(actorId, personaId = '') {
        const selectedPersonaId = actorId === 'user' ? personaId || activePreset()?.id || '' : '';
        const p = actorProfile(actorId, selectedPersonaId);
        if (!p) return;
        state.profileActorId = actorId;
        state.profilePersonaId = selectedPersonaId;
        const posts = ensure().posts.filter(post => post.authorId === actorId && post.kind === 'post' && visibleTo(post, 'user') && (actorId !== 'user' || profilePersonaForPost(post) === selectedPersonaId)).sort((a, b) => b.createdAt - a.createdAt);
        const npc = ensure().contacts.find(c => c.actorId === actorId && c.kind === 'npc');
        const request = ensure().friendRequests.find(r => r.actorId === actorId && r.status === 'pending');
        const friendButton = npc && !findCharacter(actorId) ? `<div class="moments-inline-actions"><button type="button" data-action="add-friend" data-actor-id="${esc(actorId)}" ${request ? 'disabled' : ''}>${request ? '好友申请已发送' : '＋ 加好友'}</button></div>` : '';
        const hasLegacyPosts = ensure().posts.some(post => post.authorId === 'user' && profilePersonaForPost(post) === 'legacy');
        const archivedPersonaIds = actorId === 'user' ? [...new Set(ensure().posts.filter(post => post.authorId === 'user' && post.authorPersonaId && post.authorPersonaId !== 'legacy' && !(db.myPersonaPresets || []).some(item => item.id === post.authorPersonaId)).map(post => post.authorPersonaId))] : [];
        const personas = actorId === 'user' && ((db.myPersonaPresets || []).length > 1 || hasLegacyPosts || archivedPersonaIds.length) ? `<label class="moments-profile-persona">查看身份<select id="moments-profile-persona-select">${db.myPersonaPresets.map(item => `<option value="${esc(item.id)}" ${item.id === selectedPersonaId ? 'selected' : ''}>${esc(item.name || '未命名身份')}</option>`).join('')}${hasLegacyPosts ? `<option value="legacy" ${selectedPersonaId === 'legacy' ? 'selected' : ''}>旧动态身份</option>` : ''}${archivedPersonaIds.map(id => `<option value="${esc(id)}" ${selectedPersonaId === id ? 'selected' : ''}>${esc(userIdentity(id).name)}（已删除）</option>`).join('')}</select></label>` : '';
        const legacyTools = actorId === 'user' && selectedPersonaId === 'legacy' ? `<div class="moments-legacy-tools"><small>旧动态没有保存发布人设。可把收件人都认识同一人设的帖子归属过去，其他帖子会保留。</small><select id="moments-legacy-target">${(db.myPersonaPresets || []).map(item => `<option value="${esc(item.id)}">${esc(item.name || '未命名身份')}</option>`).join('')}</select><button type="button" data-action="claim-legacy-posts">归属兼容的旧动态</button></div>` : '';
        const cameraIconSvg = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
        const editableName = actorId !== 'user' || (db.myPersonaPresets || []).some(item => item.id === selectedPersonaId);
        const name = editableName ? `<button type="button" class="moments-profile-name" data-action="edit-profile-nickname" aria-label="编辑动态网名：${esc(p.name)}" title="点击修改动态网名">${esc(p.name)}</button>` : `<h2 class="moments-profile-name">${esc(p.name)}</h2>`;
        el('moments-profile-content').innerHTML = `<div class="moments-profile-cover-wrap"><button type="button" class="moments-profile-banner" data-action="edit-profile-cover" aria-label="更换背景图"><span class="moments-profile-banner-tip">${cameraIconSvg} 更换背景</span></button></div><div class="moments-profile-header-bar"><div class="moments-profile-header-main">${name}<button type="button" class="moments-profile-avatar-button" data-action="edit-profile-avatar" aria-label="更换头像">${avatar(actorId, 'moments-avatar', false, selectedPersonaId)}</button></div><div class="moments-profile-bio-bar"><button type="button" class="moments-profile-signature" data-action="edit-profile-signature">${esc(p.signature || '点击设置个人签名')}</button>${findCharacter(actorId) && p.signature ? bilingualContent.html(p.signature, findCharacter(actorId), 'moments', 'moments', { originalHtml: '' }) : ''}${personas}${legacyTools}${friendButton}</div></div><div class="moments-profile-feed">${posts.length ? posts.map(post => cardHtml(post)).join('') : '<div class="moments-empty">还没有动态</div>'}</div>`;
        const banner = el('moments-profile-content').querySelector('.moments-profile-banner');
        if (banner && safeImage(p.cover)) banner.style.backgroundImage = `url("${safeImage(p.cover).replace(/["\\]/g, '')}")`;
        switchScreen('moments-profile-screen');
    }
    async function claimLegacyPosts() {
        const targetId = el('moments-legacy-target')?.value;
        if (!(db.myPersonaPresets || []).some(p => p.id === targetId)) return;
        const old = ensure().posts.filter(post => post.authorId === 'user' && profilePersonaForPost(post) === 'legacy');
        const compatible = old.filter(post => (post.audienceIds || []).every(actorId => actorId === 'user' || knownPersonaId(actorId, targetId) === targetId));
        if (!compatible.length) { toast('没有收件人身份一致的旧动态'); return; }
        const choice = await showAppConfirmDialog({ title: '归属旧动态', message: `将 ${compatible.length} 条旧动态归属到“${userIdentity(targetId).name}”，${old.length - compatible.length} 条收件人身份不一致的动态保留。确认吗？`, confirmText: '归属', cancelText: '取消', dismissText: '' });
        if (choice !== 'confirm') return;
        for (const post of compatible) {
            post.authorPersonaId = targetId;
            post.authorSnapshot = { name: userIdentity(targetId).name, avatar: userIdentity(targetId).avatar };
            for (const comment of post.comments || []) if (comment.authorId === 'user' && comment.authorPersonaId === 'legacy') { comment.authorPersonaId = targetId; comment.authorSnapshot = { ...post.authorSnapshot }; }
            if (post.userLikePersonaId === 'legacy') post.userLikePersonaId = targetId;
            for (const notice of ensure().notifications) if (notice.postId === post.id && notice.fromId === 'user' && notice.fromPersonaId === 'legacy') notice.fromPersonaId = targetId;
        }
        await persist();
        renderFeed(); renderProfile('user', old.length > compatible.length ? 'legacy' : targetId);
        toast(`已归属 ${compatible.length} 条旧动态`);
    }
    function userNotifications() { return ensure().notifications.filter(n => n.toId === 'user').sort((a, b) => b.createdAt - a.createdAt); }
    function renderNotificationsList() {
        const notices = userNotifications();
        const selecting = state.selectingNotifications;
        const selected = state.selectedNotificationIds;
        el('moments-notifications-manage').textContent = selecting ? '取消' : '管理';
        el('moments-notifications-manage').disabled = !selecting && !notices.length;
        el('moments-notifications-toolbar').hidden = !selecting;
        if (selecting) {
            el('moments-notifications-select-all').textContent = notices.length && notices.every(n => selected.has(n.id)) ? '取消全选' : '全选';
            const deleteButton = el('moments-notifications-delete');
            deleteButton.disabled = !selected.size;
            deleteButton.textContent = `${state.notificationDeleteArmed ? '确认删除' : '删除'} (${selected.size})`;
        }
        el('moments-notifications-content').innerHTML = notices.length ? notices.map(n => `<button type="button" class="moments-notification${selecting ? ' is-selecting' : ''}" data-action="notification" data-notice-id="${esc(n.id)}" data-post-id="${esc(n.postId)}"${selecting ? ` aria-pressed="${selected.has(n.id)}"` : ''}>${selecting ? `<span class="moments-notification-check${selected.has(n.id) ? ' is-checked' : ''}" aria-hidden="true"></span>` : ''}${avatar(n.fromId, 'moments-avatar', false, n.fromPersonaId || '')}<span class="moments-notification-text"><b>${esc(n.fromId === 'user' ? userIdentity(n.fromPersonaId || 'legacy').name : person(n.fromId)?.name || '有人')}</b> ${esc(n.text)}</span><small>${readableTime(n.createdAt)}</small></button>`).join('') : '<div class="moments-empty">暂无动态消息</div>';
    }
    function renderNotifications() {
        state.selectingNotifications = false;
        state.selectedNotificationIds.clear();
        state.notificationDeleteArmed = false;
        userNotifications().forEach(n => { if (!n.id) n.id = id('notice'); n.read = true; });
        persist();
        renderNotificationsList();
        el('moments-unread-badge').hidden = !ensure().notifications.some(n => n.toId === 'user' && !n.read);
        switchScreen('moments-notifications-screen');
    }
    function toggleNotificationSelection(noticeId) {
        if (!state.selectingNotifications) return;
        const selected = state.selectedNotificationIds;
        if (selected.has(noticeId)) selected.delete(noticeId);
        else if (userNotifications().some(n => n.id === noticeId)) selected.add(noticeId);
        state.notificationDeleteArmed = false;
        renderNotificationsList();
    }
    function toggleAllNotifications() {
        if (!state.selectingNotifications) return;
        const notices = userNotifications();
        if (notices.every(n => state.selectedNotificationIds.has(n.id))) state.selectedNotificationIds.clear();
        else notices.forEach(n => state.selectedNotificationIds.add(n.id));
        state.notificationDeleteArmed = false;
        renderNotificationsList();
    }
    async function deleteSelectedNotifications() {
        if (!state.selectingNotifications || !state.selectedNotificationIds.size) return;
        if (!state.notificationDeleteArmed) { state.notificationDeleteArmed = true; renderNotificationsList(); return; }
        const selected = state.selectedNotificationIds;
        const count = ensure().notifications.filter(n => n.toId === 'user' && selected.has(n.id)).length;
        ensure().notifications = ensure().notifications.filter(n => n.toId !== 'user' || !selected.has(n.id));
        state.selectingNotifications = false;
        selected.clear();
        state.notificationDeleteArmed = false;
        await persist();
        renderNotificationsList();
        renderFeed();
        toast(`已删除 ${count} 条动态消息`);
    }
    function showStory(postId) {
        const post = findPost(postId);
        if (!post || post.kind !== 'story' || post.expiresAt <= Date.now() || !visibleTo(post, 'user')) return;
        const media = (post.media || []).map(item => item.status && item.status !== 'done' ? `<div class="moments-media-pending">${item.status === 'working' ? '媒体生成中…' : '媒体待生成'}</div>` : item.type === 'image' || item.type === 'sticker' ? `<img src="${esc(safeImage(item.data))}" alt="${esc(item.type === 'sticker' ? item.name || '表情包' : 'Story 图片')}">` : item.type === 'video' ? `<video src="${esc(safeMedia(item.data, 'video'))}" controls playsinline></video>` : item.type === 'audio' ? `<audio src="${esc(safeMedia(item.data, 'audio'))}" controls></audio>` : '').join('');
        const all = activeStories();
        const next = all[(all.findIndex(p => p.id === postId) + 1) % all.length];
        el('moments-story-content').innerHTML = `<div class="moments-story-meta">${avatar(post.authorId, 'moments-avatar', true, profilePersonaForPost(post))}<b>${esc(postAuthorName(post))}</b><span>${readableTime(post.createdAt)}</span></div><div class="moments-story-body">${media}${post.text ? `<p>${renderText(post.text, post.mentions, post.mentionLabels, post.authorId)}</p>` : ''}</div><div class="moments-story-actions"><button type="button" data-action="like" data-post-id="${esc(post.id)}">${(post.likes || []).includes('user') ? '已赞' : '点赞'}</button><button type="button" data-action="story-reply" data-post-id="${esc(post.id)}">回复</button>${post.authorId === 'user' ? `<button type="button" data-action="result" data-post-id="${esc(post.id)}">查看结果</button>` : ''}${all.length > 1 ? `<button type="button" data-action="story" data-post-id="${esc(next.id)}">下一条</button>` : ''}</div>`;
        el('moments-story-viewer').hidden = false;
    }

    const roleBehaviorInputs = { 'setting-moments-post-enabled':'postEnabled', 'setting-moments-story-enabled':'storyEnabled', 'setting-moments-browse-enabled':'browseEnabled', 'setting-moments-watch-enabled':'watchEnabled', 'setting-moments-like-enabled':'likeEnabled', 'setting-moments-comment-enabled':'commentEnabled', 'setting-moments-reply-enabled':'replyEnabled', 'setting-moments-contacts-enabled':'contactsEnabled', 'setting-moments-chat-linked':'chatLinked' };
    function loadCharacterSettings(character) {
        const s=characterSettings(character), actorId=charActor(character.id), local=controls?.localPreferences(actorId)||character.momentsSettings.preferences||{};
        for(const [id,key] of Object.entries(roleBehaviorInputs))if(el(id))el(id).value=Object.hasOwn(local,key)?local[key]?'on':'off':'inherit';
        if(el('setting-moments-show-activity-narration'))el('setting-moments-show-activity-narration').checked=s.showActivityNarration;
        if(el('setting-moments-background-post-enabled'))el('setting-moments-background-post-enabled').checked=s.backgroundPostEnabled;
        for(const [id,key] of [['setting-moments-nickname-awareness','nicknameAwareness'],['setting-moments-self-rename','selfRename'],['setting-moments-image-mode','imageMode'],['setting-moments-voice-mode','voiceMode']])if(el(id))el(id).value=s[key];
        const identity=el('setting-moments-user-persona');if(identity){identity.innerHTML='<option value="">按已有身份绑定</option>'+(db.myPersonaPresets||[]).map(p=>`<option value="${esc(p.id)}">${esc(p.name||'未命名身份')}</option>`).join('');identity.value=ensure().characterPersonaIds[character.id]||'';}
        controls?.renderActorSettings(actorId);
    }
    function saveCharacterSettings(character) {
        characterSettings(character);
        const s=character.momentsSettings, priorNarration=s.showActivityNarration, actorId=charActor(character.id);
        const local=controls?.readActorSettings(actorId)||s.preferences||{};
        for(const [id,key] of Object.entries(roleBehaviorInputs))if(el(id)){const v=el(id).value;if(v==='inherit')delete local[key];else if(v==='on'||v==='off')local[key]=v==='on';}
        s.preferences=local;
        const identity=el('setting-moments-user-persona');if(identity){if(identity.value)ensure().characterPersonaIds[character.id]=identity.value;else delete ensure().characterPersonaIds[character.id];void persist();}
        if(el('setting-moments-show-activity-narration'))s.showActivityNarration=el('setting-moments-show-activity-narration').checked;
        if(el('setting-moments-background-post-enabled'))s.backgroundPostEnabled=el('setting-moments-background-post-enabled').checked;
        for(const [id,key] of [['setting-moments-nickname-awareness','nicknameAwareness'],['setting-moments-self-rename','selfRename'],['setting-moments-image-mode','imageMode'],['setting-moments-voice-mode','voiceMode']])if(el(id))s[key]=el(id).value;
        characterSettings(character);
        if(priorNarration!==s.showActivityNarration&&typeof currentChatId!=='undefined'&&currentChatId===character.id&&typeof renderMessages==='function')renderMessages();
    }
    function openContacts() {
        const character = (db.characters || []).find(c => c.id === currentChatId);
        if (!character) { toast('请先打开角色聊天设置'); return; }
        el('moments-contacts-heading').textContent = person(charActor(character.id)).name + '的人脉';
        renderContacts();
        switchScreen('moments-contacts-screen');
    }
    function renderContacts() {
        const contacts = contactsFor(currentChatId);
        el('moments-contacts-list').innerHTML = contacts.length ? contacts.map(contact => {
            const p = person(contact.actorId);
            const nicknameOptions = contact.kind === 'npc' ? `<div class="moments-contact-nickname-options">${[['nicknameAwareness', '感知网名'], ['selfRename', '自主改名']].map(([key, label]) => `<label>${label}<select data-contact-nickname="${key}"><option value="inherit" ${(contact[key] || 'inherit') === 'inherit' ? 'selected' : ''}>跟随动态设置</option><option value="on" ${contact[key] === 'on' ? 'selected' : ''}>允许</option><option value="off" ${contact[key] === 'off' ? 'selected' : ''}>禁止</option></select></label>`).join('')}</div>` : '';
            return `<div class="moments-list-row" data-contact-id="${esc(contact.id)}">${avatar(contact.actorId)}<div class="moments-list-row-main"><strong>${esc(p?.name || '已删除角色')}</strong><small>${esc(contact.relationship || (contact.kind === 'linked' ? '已有角色' : '人脉'))}</small><div class="moments-contact-flags"><label><input type="checkbox" data-contact-flag="enabled" ${contact.enabled !== false ? 'checked' : ''}>启用</label>${contact.kind==='linked'?`<label><input type="checkbox" data-contact-flag="mayInteract" ${contact.mayInteract === true ? 'checked' : ''}>互动</label><label><input type="checkbox" data-contact-flag="mayPost" ${contact.mayPost === true ? 'checked' : ''}>发动态</label><label><input type="checkbox" data-contact-flag="mayStory" ${contact.mayStory === true ? 'checked' : ''}>发 Story</label>`:''}</div>${nicknameOptions}<div class="moments-inline-actions"><button type="button" data-action="actor-controls" data-actor-id="${esc(contact.actorId)}">动态设置</button></div></div><button type="button" data-action="edit-contact" data-contact-id="${esc(contact.id)}">编辑</button><button type="button" data-action="delete-contact" data-contact-id="${esc(contact.id)}">删除</button></div>`;
        }).join('') : '<div class="moments-empty">还没有人脉。可以手动添加、关联现有角色，或让 AI 生成。</div>';
    }
    function renderGroups() {
        const groups = ensure().groups;
        el('moments-groups-list').innerHTML = groups.length ? groups.map(group => `<div class="moments-list-row"><div class="moments-list-row-main"><strong>${esc(group.name)}</strong><small>${group.charIds.length} 位角色</small></div><button type="button" data-action="edit-group" data-group-id="${esc(group.id)}">编辑</button><button type="button" data-action="delete-group" data-group-id="${esc(group.id)}">删除</button></div>`).join('') : '<p class="moments-hint">还没有分组。</p>';
    }
    function openSettings() {
        el('moments-interaction-visibility').value = ensure().settings.interactionVisibility;
        el('moments-character-name-source').value = ensure().settings.characterNameSource;
        for (const key of ['characterNicknameAwareness', 'contactNicknameAwareness', 'characterSelfRename', 'contactSelfRename']) el('moments-' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())).checked = ensure().settings[key];
        renderGroups();
        switchScreen('moments-settings-screen');
    }
    function memoryRows(actorId = memoryState.actorId) {
        const rows = new Map();
        const add = (postId, text, time, event = null) => {
            if (!postId || !memoryAllowed(postId, actorId)) return;
            let row = rows.get(postId);
            if (!row) { row = { postId, text, time: time || 0, events: [] }; rows.set(postId, row); }
            if (event) row.events.push(event);
            if (time >= row.time) { row.time = time; row.text = text || row.text; }
        };
        const m = ensure();
        for (const post of m.posts) if (post.authorId === actorId || post.seenBy?.[actorId]) add(post.id, postSummary(post), post.seenBy?.[actorId] || post.createdAt);
        for (const event of m.activityEvents) if (event.knownTo?.includes(actorId)) add(event.postId, event.text, event.createdAt, event);
        for (const message of findCharacter(actorId)?.history || []) if (message.isMomentsActivity && message.momentsPostId) add(message.momentsPostId, message.content, message.timestamp);
        return [...rows.values()].sort((a, b) => b.time - a.time);
    }
    function filteredMemoryRows() {
        const query = memoryState.query.trim().toLocaleLowerCase();
        return memoryRows().filter(row => !query || [row.text, ...row.events.map(event => event.text)].join(' ').toLocaleLowerCase().includes(query));
    }
    function renderMemory() {
        const characters = db.characters || [];
        if (!characters.some(c => charActor(c.id) === memoryState.actorId)) memoryState.actorId = characters[0] ? charActor(characters[0].id) : '';
        el('moments-memory-actor').innerHTML = characters.map(c => `<option value="${esc(charActor(c.id))}">${esc(c.remarkName || c.realName || '未命名角色')}</option>`).join('');
        el('moments-memory-actor').value = memoryState.actorId;
        const all = memoryRows(), rows = filteredMemoryRows();
        const validIds = new Set(all.map(row => row.postId));
        for (const postId of memoryState.selected) if (!validIds.has(postId)) memoryState.selected.delete(postId);
        el('moments-memory-count').textContent = `共 ${all.length} 条动态记忆，显示 ${rows.length} 条`;
        el('moments-memory-list').innerHTML = rows.length ? rows.map(row => {
            const post = findPost(row.postId), selected = memoryState.selected.has(row.postId);
            return `<article class="moments-memory-card moments-settings-card"><button type="button" class="moments-manage-row" data-action="toggle-memory" data-post-id="${esc(row.postId)}" aria-pressed="${selected}" ${memoryState.busy ? 'disabled' : ''}><span class="moments-manage-check" aria-hidden="true">${selected ? '✓' : ''}</span><span class="moments-manage-row-main"><strong>${esc(post ? postAuthorName(post) + '的' + (post.kind === 'story' ? ' Story' : '动态') : '已删除的动态 / Story')}</strong><small>${esc(readableTime(row.time))} · ${row.events.length} 条活动记录</small><span>${esc(post ? postSummary(post) : row.text)}</span></span></button>${row.events.length ? `<details><summary>查看记忆记录</summary><ul>${row.events.map(event => `<li>${esc(event.text)}</li>`).join('')}</ul></details>` : '<p class="moments-hint">角色已看过或发布过这条动态。</p>'}<div class="moments-inline-actions"><button type="button" data-action="forget-memory" data-post-id="${esc(row.postId)}" ${memoryState.busy ? 'disabled' : ''}>清除这条记忆</button></div></article>`;
        }).join('') : `<div class="moments-empty">${!characters.length ? '还没有聊天角色。' : memoryState.query.trim() ? '没有找到匹配的动态记忆。' : '这个角色没有可清除的动态记忆。'}</div>`;
        el('moments-memory-delete-selected').textContent = `清除选中 (${memoryState.selected.size})`;
        el('moments-memory-delete-selected').disabled = memoryState.busy || !memoryState.selected.size;
        el('moments-memory-clear-all').disabled = memoryState.busy || !all.length;
        el('moments-memory-select-all').disabled = memoryState.busy || !rows.length;
        el('moments-memory-actor').disabled = memoryState.busy;
        el('moments-memory-search').disabled = memoryState.busy;
    }
    function openMemory() {
        memoryState.query = ''; memoryState.selected.clear();
        el('moments-memory-search').value = '';
        renderMemory(); switchScreen('moments-memory-screen');
    }
    async function forgetMemories(postIds) {
        if (memoryState.busy) return false;
        const actorId = memoryState.actorId, character = findCharacter(actorId);
        const available = new Set(memoryRows(actorId).map(row => row.postId));
        const ids = new Set(postIds.filter(postId => available.has(postId)));
        if (!character || !ids.size) return false;
        memoryState.busy = true; renderMemory();
        try {
            const choice = await showAppConfirmDialog({ title: '清除动态记忆', message: `确定让${character.remarkName || character.realName || '这个角色'}忘记这 ${ids.size} 条动态？观看、互动、删除记录及隐藏旁白将从该角色的动态上下文中清除，这些动态也不会再自动观看或参与互动。动态和其他角色的记忆会保留。普通聊天、总结和其他记忆中已经提到的内容需另行删除。`, confirmText: '清除记忆', cancelText: '取消', dismissText: '' });
            if (choice !== 'confirm' || findCharacter(actorId) !== character) return false;
            character.momentsSettings ||= {};
            const previous = character.momentsSettings.forgottenPostIds;
            // Store only post IDs on this character: the shared event remains available to other witnesses.
            character.momentsSettings.forgottenPostIds = [...new Set([...(previous || []), ...ids])];
            const eventIds = new Set(ensure().activityEvents.filter(event => ids.has(event.postId)).map(event => event.id));
            const removed = (character.history || []).map((message, index) => ({ message, index })).filter(({ message }) => message.isMomentsActivity && (ids.has(message.momentsPostId) || eventIds.has(message.momentsEventId)));
            const removedMessages = new Set(removed.map(entry => entry.message));
            if (removed.length) character.history = character.history.filter(message => !removedMessages.has(message));
            let saved = false;
            try { saved = await saveCharacter(character.id); } catch (error) { console.error('动态记忆清除保存失败', error); }
            if (!saved) {
                if (previous === undefined) delete character.momentsSettings.forgottenPostIds;
                else character.momentsSettings.forgottenPostIds = previous;
                for (const { message, index } of removed) character.history.splice(index, 0, message);
                toast('保存失败，动态记忆未清除'); return false;
            }
            for (const postId of ids) memoryState.selected.delete(postId);
            if (typeof currentChatId !== 'undefined' && currentChatId === character.id && typeof renderMessages === 'function') renderMessages();
            toast(`已清除 ${ids.size} 条动态记忆`);
            return true;
        } finally { memoryState.busy = false; renderMemory(); }
    }
    function managedPosts() {
        const query = state.manageQuery.trim().toLocaleLowerCase();
        return ensure().posts.filter(post => (!state.manageAuthor || post.authorId === state.manageAuthor) && (!query || String(post.text || '').toLocaleLowerCase().includes(query))).sort((a, b) => b.createdAt - a.createdAt);
    }
    function renderManage() {
        const posts = ensure().posts;
        const authorIds = [...new Set(posts.map(post => post.authorId))];
        const authorSelect = el('moments-manage-author');
        authorSelect.innerHTML = '<option value="">全部发布人</option>' + authorIds.map(actorId => `<option value="${esc(actorId)}">${esc(person(actorId)?.name || '已删除的发布者')}</option>`).join('');
        if (state.manageAuthor && !authorIds.includes(state.manageAuthor)) state.manageAuthor = '';
        authorSelect.value = state.manageAuthor;
        el('moments-manage-search').value = state.manageQuery;
        const filtered = managedPosts();
        const selected = state.selectedPostIds;
        for (const postId of selected) if (!posts.some(post => post.id === postId)) selected.delete(postId);
        el('moments-manage-count').textContent = `共 ${posts.length} 条 · 当前 ${filtered.length} 条`;
        el('moments-manage-select-all').textContent = filtered.length && filtered.every(post => selected.has(post.id)) ? '取消全选' : '全选结果';
        el('moments-manage-select-all').disabled = !filtered.length;
        el('moments-manage-delete-selected').textContent = `删除选中 (${selected.size})`;
        el('moments-manage-delete-selected').disabled = !selected.size || state.deletingPosts;
        el('moments-manage-clear-all').disabled = !posts.length || state.deletingPosts;
        el('moments-manage-list').innerHTML = filtered.length ? filtered.map(post => `<button type="button" class="moments-manage-row" data-action="manage-select" data-post-id="${esc(post.id)}" aria-pressed="${selected.has(post.id)}"><span class="moments-manage-check" aria-hidden="true">${selected.has(post.id) ? '✓' : ''}</span><span class="moments-manage-row-main"><strong>${esc(postAuthorName(post) || '已删除的发布者')}</strong><small>${post.kind === 'story' ? 'Story' : '动态'} · ${readableTime(post.createdAt)}</small><span>${esc(String(post.text || ((post.media || []).length ? '[媒体]' : '[无文字]')).replace(/\s+/g, ' ').slice(0, 100))}</span></span></button>`).join('') : '<div class="moments-empty">没有匹配的动态</div>';
    }
    function openManage() {
        state.manageQuery = '';
        state.manageAuthor = '';
        state.selectedPostIds.clear();
        renderManage();
        switchScreen('moments-manage-screen');
    }
    function toggleManagedPost(postId) {
        if (!ensure().posts.some(post => post.id === postId)) return;
        if (state.selectedPostIds.has(postId)) state.selectedPostIds.delete(postId);
        else state.selectedPostIds.add(postId);
        renderManage();
    }
    function toggleAllManagedPosts() {
        const filtered = managedPosts();
        if (filtered.length && filtered.every(post => state.selectedPostIds.has(post.id))) filtered.forEach(post => state.selectedPostIds.delete(post.id));
        else filtered.forEach(post => state.selectedPostIds.add(post.id));
        renderManage();
    }
    async function removePosts(postIds) {
        if (state.deletingPosts) return 0;
        const m = ensure();
        const ids = new Set(postIds);
        const removed = m.posts.filter(post => ids.has(post.id));
        if (!removed.length) return 0;
        state.deletingPosts = true;
        const previousPosts = m.posts;
        const previousNotifications = m.notifications;
        m.posts = previousPosts.filter(post => !ids.has(post.id));
        m.notifications = previousNotifications.filter(notice => !ids.has(notice.postId));
        const events = removed.map(post => recordActivity('delete', 'user', post, '', [post.authorId, ...Object.keys(post.seenBy || {})]));
        try {
            if (!await persist()) {
                m.posts = previousPosts;
                m.notifications = previousNotifications;
                m.activityEvents.splice(-events.length);
                return 0;
            }
            for (const event of events) await deliverActivity(event);
            removed.forEach(post => state.selectedPostIds.delete(post.id));
            if (ids.has(state.currentPostId)) state.currentPostId = null;
            if (ids.has(state.resultPostId)) { state.resultPostId = ''; el('moments-result-dialog').hidden = true; }
            el('moments-story-viewer').hidden = true;
            state.deletingPosts = false;
            renderFeed();
            if (el('moments-manage-screen').classList.contains('active')) renderManage();
            return removed.length;
        } finally { state.deletingPosts = false; }
    }
    async function deleteManagedPosts(all = false) {
        if (state.deletingPosts) return;
        const ids = all ? ensure().posts.map(post => post.id) : [...state.selectedPostIds];
        if (!ids.length) return;
        const choice = await showAppConfirmDialog({ title: all ? '清除全部动态' : '删除选中动态', message: `确定删除 ${ids.length} 条动态或 Story？相关动态消息也会清除，此操作无法撤销。`, confirmText: '删除', cancelText: '取消', dismissText: '' });
        if (choice !== 'confirm') return;
        const count = await removePosts(ids);
        if (count) toast(`已删除 ${count} 条动态`);
    }
    function imageField(name, label, value = '') {
        return `<div class="moments-field moments-image-field"><label>${label}<input name="${name}" type="text" inputmode="url" value="${esc(value)}" placeholder="https://..."></label><div class="moments-image-preview" data-preview-field="${name}">${safeImage(value) ? `<img src="${esc(value)}" alt="图片预览">` : '<span>默认图片</span>'}</div><div class="moments-inline-actions"><button type="button" data-action="upload-profile-image" data-image-field="${name}">本地上传</button><button type="button" data-action="reset-profile-image" data-image-field="${name}">重置</button></div><input class="moments-hidden-file" type="file" accept="image/*" data-file-field="${name}" hidden></div>`;
    }
    function updateImagePreview(name) {
        const form = el('moments-editor-form');
        const value = safeImage(form.elements[name]?.value?.trim());
        const box = form.querySelector(`[data-preview-field="${name}"]`);
        if (box) box.innerHTML = value ? `<img src="${esc(value)}" alt="图片预览">` : '<span>默认图片</span>';
    }
    function openProfileEditor(kind) {
        const actorId = state.profileActorId;
        const personaId = state.profilePersonaId;
        if (actorId === 'user' && !(db.myPersonaPresets || []).some(p => p.id === personaId)) { toast('历史身份无法编辑，请先将旧动态归属到现有人设'); return; }
        const profile = actorProfile(actorId, personaId);
        if (!profile) return;
        state.editor = { mode: 'profile-' + kind, actorId, personaId, itemId: null };
        el('moments-editor-title').textContent = kind === 'avatar' ? '更换头像' : kind === 'cover' ? '更换背景图' : kind === 'nickname' ? '编辑动态网名' : '编辑个人签名';
        el('moments-editor-fields').innerHTML = kind === 'nickname'
            ? `<label class="moments-field">动态网名<input name="nickname" maxlength="24" autocomplete="off" value="${esc(profile.nickname || '')}" placeholder="不填写时显示${esc(profile.baseName || profile.name)}"></label><p class="moments-hint">仅用于动态。清空后恢复默认显示，不修改真名、备注或身份姓名。</p>`
            : kind === 'signature'
            ? `<label class="moments-field">个人签名<textarea name="signature" maxlength="80" placeholder="写一句属于自己的话">${esc(profile.signature)}</textarea></label><div class="moments-inline-actions"><button type="button" data-action="generate-profile-signature">AI 生成签名</button></div>`
            : imageField(kind, kind === 'avatar' ? '头像 URL' : '背景图 URL', kind === 'avatar' ? profile.avatar : (actorId === 'user' ? profile.cover : profile.character?.momentsProfile?.cover || profile.contact?.cover || ''));
        el('moments-editor-dialog').hidden = false;
    }
    function openEditor(mode, item) {
        state.editor = { mode, itemId: item?.id || null };
        const title = mode === 'group' ? (item?.id ? '编辑分组' : '新建分组') : mode === 'linked' ? '关联已有角色' : mode === 'edit-linked' ? '编辑关联角色' : (item?.id ? '编辑人脉' : '添加人脉');
        el('moments-editor-title').textContent = title;
        let fields = '';
        if (mode === 'group') {
            fields = `<label class="moments-field">分组名称<input name="name" required maxlength="24" value="${esc(item?.name || '')}"></label><div class="moments-field">包含的角色</div>${(db.characters || []).map(c => `<label class="moments-picker-choice"><input type="checkbox" name="charIds" value="${esc(c.id)}" ${(item?.charIds || []).includes(c.id) ? 'checked' : ''}><span>${esc(person(charActor(c.id))?.name || '角色')}</span></label>`).join('')}`;
        } else if (mode === 'linked') {
            const linkedIds = new Set(contactsFor(currentChatId).filter(c => c.kind === 'linked').map(c => c.actorId));
            fields = `<label class="moments-field">已有角色<select name="actorId" required><option value="">选择角色</option>${(db.characters || []).filter(c => c.id !== currentChatId && !linkedIds.has(charActor(c.id))).map(c => `<option value="${esc(charActor(c.id))}">${esc(person(charActor(c.id))?.name || '角色')}</option>`).join('')}</select></label><label class="moments-field">对方是当前角色的<input name="relationship" maxlength="40" placeholder="例如：女儿、朋友"></label><label class="moments-field">当前角色是对方的<input name="reverseRelationship" maxlength="40" placeholder="例如：父亲、朋友"></label>`;
        } else if (mode === 'edit-linked') {
            const counterpart = contactsFor(findCharacter(item.actorId)?.id).find(c => c.kind === 'linked' && c.actorId === charActor(currentChatId));
            fields = `<p class="moments-hint">${esc(person(item.actorId)?.name || '已删除角色')}</p><label class="moments-field">对方是当前角色的<input name="relationship" maxlength="40" value="${esc(item.relationship || '')}" placeholder="例如：朋友、父亲"></label><label class="moments-field">当前角色是对方的<input name="reverseRelationship" maxlength="40" value="${esc(counterpart?.relationship || '')}" placeholder="例如：朋友、女儿"></label>`;
        } else {
            fields = `<label class="moments-field">姓名<input name="name" required maxlength="40" value="${esc(item?.name || '')}"></label><label class="moments-field">与角色的关系<input name="relationship" maxlength="40" value="${esc(item?.relationship || '')}" placeholder="朋友、同事、家人…"></label><label class="moments-field">人设<textarea name="persona" required maxlength="2000">${esc(item?.persona || '')}</textarea></label><label class="moments-field">个人签名<input name="signature" maxlength="80" value="${esc(item?.signature || '')}" placeholder="一句公开的个人签名"></label><div class="moments-inline-actions"><button type="button" data-action="generate-profile-signature">AI 生成签名</button></div>${imageField('avatar', '头像 URL（选填）', item?.avatar || '')}${imageField('cover', '背景图 URL（选填）', item?.cover || '')}`;
            if (item && Object.prototype.hasOwnProperty.call(item, 'gender')) fields += `<label class="moments-field">性别<input name="gender" maxlength="30" value="${esc(item.gender || '')}"></label>`;
            if (item?.batchExtras) fields += `<details class="moments-batch-extra"><summary>生成的扩展设定</summary>${Object.entries(item.batchExtras).map(([key, value]) => `<label class="moments-field">${esc(batchExtraFields[key] || key)}<textarea name="batchExtra_${esc(key)}" maxlength="1000">${esc(value)}</textarea></label>`).join('')}</details>`;
            if (item?.kind === 'npc') fields += worldBindingEditorFields(item.worldBookBinding);
        }
        if (item?.actorId) fields += `<div class="moments-inline-actions"><button type="button" data-action="actor-controls" data-actor-id="${esc(item.actorId)}">动态设置</button></div>`;
        el('moments-editor-fields').innerHTML = fields;
        el('moments-editor-dialog').hidden = false;
    }
    function closeEditor() { el('moments-editor-dialog').hidden = true; state.editor = null; }
    function worldBindingEditorFields(binding) {
        const paths = [...new Set((db.worldBooks || []).map(book => worldCategoryPath(book.category)))].sort((a, b) => a.localeCompare(b));
        const activeIds = new Set([...(binding?.itemIds || []), ...(db.worldBooks || []).filter(book => (binding?.categoryPaths || []).some(path => worldCategoryPath(book.category) === path || worldCategoryPath(book.category).startsWith(path + '/')) && !(binding?.excludedItemIds || []).includes(book.id)).map(book => book.id)]);
        return `<details class="moments-batch-extra"><summary>世界书绑定（选填）</summary>
            <label class="moments-field">绑定方式<select name="worldMode"><option value="follow" ${binding?.mode !== 'snapshot' ? 'selected' : ''}>随分类更新</option><option value="snapshot" ${binding?.mode === 'snapshot' ? 'selected' : ''}>锁定当前条目</option></select></label>
            <label class="moments-batch-world-choice"><input type="checkbox" name="worldInherit" value="1" ${binding?.inheritOwner ? 'checked' : ''}>沿用所属角色的世界书</label>
            <div class="moments-batch-world-list">${paths.map(path => `<div class="moments-batch-world-category"><label class="moments-batch-world-choice"><input type="checkbox" name="worldCategoryPath" value="${esc(path)}" ${binding?.categoryPaths?.includes(path) ? 'checked' : ''}>整个分类：${esc(path)}（含子分类）</label>${(db.worldBooks || []).filter(book => worldCategoryPath(book.category) === path).map(book => `<label class="moments-batch-world-choice moments-batch-world-item"><input type="checkbox" name="worldItemId" value="${esc(book.id)}" data-category-path="${esc(path)}" ${activeIds.has(book.id) ? 'checked' : ''}>${esc(book.name || '未命名条目')}${book.disabled ? '（已禁用）' : ''}</label>`).join('')}</div>`).join('')}</div>
            <p class="moments-hint">分类可包含子分类；取消其中单条勾选可排除该条目。</p>
        </details>`;
    }
    async function saveProfileEditor(fd) {
        const { actorId, personaId, mode } = state.editor;
        const key = mode.slice(8);
        const character = findCharacter(actorId);
        const contact = ensure().contacts.find(c => c.actorId === actorId && c.kind === 'npc');
        const preset = actorId === 'user' ? (db.myPersonaPresets || []).find(p => p.id === personaId) : null;
        if (!character && !contact && !preset) { toast('资料已不存在'); return false; }
        if (key === 'nickname') {
            const result = await changeNickname(actorId, personaId, fd.get('nickname'));
            if (!result.ok) toast(result.reason);
            return result.ok;
        }
        const holder = preset || character || contact;
        if (preset || character) holder.momentsProfile ||= {};
        if (key === 'signature') {
            const value = String(fd.get('signature') || '').trim().slice(0, 80);
            if (contact && !character) contact.signature = value;
            else holder.momentsProfile.signature = value;
            if (contact && character) contact.signature = value;
        } else {
            const value = String(fd.get(key) || '').trim();
            if (value && !safeImage(value)) { toast('请输入有效的图片 URL，或选择本地图片'); return false; }
            if (key === 'cover') {
                if (contact && !character) contact.cover = value;
                else holder.momentsProfile.cover = value;
                if (contact && character) contact.cover = value;
            } else if (key === 'avatar') {
                if (!Object.prototype.hasOwnProperty.call(holder, 'momentsOriginalAvatar')) holder.momentsOriginalAvatar = holder.avatar || '';
                holder.avatar = value || (contact && !character ? '' : holder.momentsOriginalAvatar);
                if (contact && character) contact.avatar = holder.avatar;
                if (preset) {
                    for (const charId of Object.keys(preset.bindings || {})) {
                        const bound = (db.characters || []).find(c => c.id === charId);
                        if (!bound) continue;
                        if (window.AvatarSystem?.syncManualAvatarChange) window.AvatarSystem.syncManualAvatarChange(charId, holder.avatar, undefined);
                        bound.myAvatar = holder.avatar;
                        await saveCharacter(charId);
                    }
                }
            }
        }
        const saved = character ? await saveCharacter(character.id) : contact ? await persist() : await saveGlobalSettings(['myPersonaPresets']);
        if (character && contact) await persist();
        if (!saved) { toast('资料保存失败'); return false; }
        if (key === 'avatar' && character) { if (typeof renderChatList === 'function') renderChatList(); if (typeof renderContactList === 'function') renderContactList(); }
        if (key === 'avatar' && preset && typeof renderMyProfile === 'function') renderMyProfile();
        renderFeed();
        renderProfile(actorId, personaId);
        return true;
    }
    async function generateSignatureForEditor(button) {
        if (!state.editor) return;
        const form = el('moments-editor-form');
        const name = state.editor.mode === 'npc' ? form.elements.name?.value : actorProfile(state.editor.actorId, state.editor.personaId)?.name;
        const persona = state.editor.mode === 'npc' ? form.elements.persona?.value : actorProfile(state.editor.actorId, state.editor.personaId)?.persona;
        if (!name) { toast('请先填写姓名'); return; }
        const oldLabel = button.textContent;
        button.disabled = true; button.textContent = '生成中…';
        try {
            const result = await askAI(`请为“${String(name).slice(0, 40)}”写一句公开显示在熟人动态个人主页的个性签名。人物设定：${String(persona || '未提供').slice(0, 1000)}。只写本人会主动公开的一句话，不要复述人设、关系、私聊或秘密。自然、有个人表达习惯，8到40个汉字左右。${bilingualContent.prompt(findCharacter(state.editor.actorId), 'moments', '角色本人主页的公开签名')}只返回 JSON：{"signature":"签名"}。`, state.editor.actorId);
            const field = form.elements.signature;
            if (field) field.value = String(result.signature || '').trim().slice(0, 80);
            if (!field?.value) throw new Error('没有生成有效签名');
            toast('已生成，请检查后保存');
        } catch (error) { toast(error.message || '签名生成失败'); }
        finally { button.disabled = false; button.textContent = oldLabel; }
    }
    async function saveEditor(event) {
        event.preventDefault();
        if (!state.editor) return;
        if (state.editor.imageBusy) { toast('请等待图片处理完成'); return; }
        const form = el('moments-editor-form');
        const fd = new FormData(form);
        if (state.editor.mode.startsWith('profile-')) { if (await saveProfileEditor(fd)) { closeEditor(); toast('已保存'); } return; }
        const m = ensure();
        if (state.editor.mode === 'group') {
            const charIds = fd.getAll('charIds');
            if (!charIds.length) { toast('请至少选择一位角色'); return; }
            const group = m.groups.find(g => g.id === state.editor.itemId);
            if (group) { group.name = String(fd.get('name')).trim(); group.charIds = charIds; }
            else m.groups.push({ id: id('group'), name: String(fd.get('name')).trim(), charIds });
            renderGroups();
        } else if (state.editor.mode === 'linked') {
            const actorId = String(fd.get('actorId') || '');
            if (!findCharacter(actorId)) { toast('请选择已有角色'); return; }
            if (contactsFor(currentChatId).some(c => c.kind === 'linked' && c.actorId === actorId)) { toast('该角色已关联'); return; }
            m.contacts.push({ id: id('contact'), kind: 'linked', ownerCharId: currentChatId, actorId, relationship: String(fd.get('relationship') || '').trim(), reverseRelationship: String(fd.get('reverseRelationship') || '').trim(), enabled: true, mayInteract: false, mayPost: false, mayStory: false });
            renderContacts();
        } else if (state.editor.mode === 'edit-linked') {
            const shown = contactsFor(currentChatId).find(c => c.id === state.editor.itemId && c.kind === 'linked');
            const contact = m.contacts.find(c => c.id === state.editor.itemId && c.kind === 'linked');
            if (!shown || !contact) { toast('人脉已不存在'); return; }
            const ownRelationship = String(fd.get('relationship') || '').trim();
            const otherRelationship = String(fd.get('reverseRelationship') || '').trim();
            const other = m.contacts.find(c => c.kind === 'linked' && c.ownerCharId === findCharacter(shown.actorId)?.id && c.actorId === charActor(currentChatId));
            if (shown.reverseOfId) {
                contact.reverseRelationship = ownRelationship;
                contact.relationship = otherRelationship;
            } else {
                contact.relationship = ownRelationship;
                if (other) other.relationship = otherRelationship;
                else contact.reverseRelationship = otherRelationship;
            }
            renderContacts();
        } else {
            const contact = m.contacts.find(c => c.id === state.editor.itemId);
            const avatarValue = String(fd.get('avatar') || '').trim();
            const coverValue = String(fd.get('cover') || '').trim();
            if ((avatarValue && !safeImage(avatarValue)) || (coverValue && !safeImage(coverValue))) { toast('请输入有效的图片 URL，或选择本地图片'); return; }
            const values = { name: String(fd.get('name') || '').trim(), relationship: String(fd.get('relationship') || '').trim(), persona: String(fd.get('persona') || '').trim(), signature: String(fd.get('signature') || '').trim().slice(0, 80), avatar: avatarValue, cover: coverValue };
            if (fd.get('gender') !== null) values.gender = String(fd.get('gender') || '').trim().slice(0, 30);
            if (!values.name || !values.persona) { toast('请填写姓名和人设'); return; }
            if (contact) {
                Object.assign(contact, values);
                if (contact.batchExtras) for (const key of Object.keys(contact.batchExtras)) contact.batchExtras[key] = String(fd.get('batchExtra_' + key) || '').trim().slice(0, 1000);
                if (fd.get('worldMode') !== null) {
                    const categories = fd.getAll('worldCategoryPath').map(String);
                    const selected = fd.getAll('worldItemId').map(String);
                    const mode = String(fd.get('worldMode'));
                    const excluded = mode === 'follow' ? (db.worldBooks || []).filter(book => categories.some(path => worldCategoryPath(book.category) === path || worldCategoryPath(book.category).startsWith(path + '/')) && !selected.includes(book.id)).map(book => book.id) : [];
                    const explicit = mode === 'follow' ? selected.filter(itemId => {
                        const book = (db.worldBooks || []).find(entry => entry.id === itemId);
                        return book && !categories.some(path => worldCategoryPath(book.category) === path || worldCategoryPath(book.category).startsWith(path + '/'));
                    }) : selected;
                    const inheritOwner = fd.get('worldInherit') !== null;
                    contact.worldBookBinding = categories.length || explicit.length || inheritOwner ? { mode, categoryPaths: mode === 'follow' ? categories : [], itemIds: explicit, excludedItemIds: excluded, inheritOwner } : null;
                    if (mode === 'snapshot' && contact.worldBookBinding) contact.worldBookBinding = batchWorldBinding(contact.ownerCharId, { ...contact.worldBookBinding, categoryPaths: categories, excludedItemIds: [] });
                }
            }
            else m.contacts.push({ id: id('contact'), actorId: id('npc'), kind: 'npc', ownerCharId: currentChatId, ...values, enabled: true, preferences: {}, mayInteract: false, mayPost: false, mayStory: false });
            renderContacts();
        }
        await persist();
        closeEditor();
        toast('已保存');
    }
    function newCompose(kind = 'post') {
        if (state.recorder?.state === 'recording') { state.recordFinishing = true; state.recorder.stop(); }
        ensureUserPreset();
        state.compose = { kind, text: '', media: [], audienceIds: ['user'], reminderIds: [], mentions: [], viewMode: 'default', personaId: activePreset()?.id || '' };
        el('moments-compose-text').value = '';
        el('moments-compose-persona').innerHTML = (db.myPersonaPresets || []).map(p => `<option value="${esc(p.id)}">${esc(p.name || '未命名身份')}</option>`).join('');
        el('moments-compose-persona').value = state.compose.personaId;
        el('moments-compose-persona').disabled = false;
        renderComposeAuthor();
        el('moments-compose-title').textContent = kind === 'story' ? '发布 Story' : '发布动态';
        document.querySelectorAll('.moments-compose-kind button').forEach(button => button.classList.toggle('active', button.dataset.kind === kind));
        renderComposeMedia();
        updateComposeLabels();
        switchScreen('moments-compose-screen');
    }
    function renderComposeAuthor() {
        const personaId = state.compose?.personaId || activePreset()?.id || '';
        el('moments-compose-author').innerHTML = avatar('user', 'moments-avatar', false, personaId) + `<span>${esc(userIdentity(personaId).name)}</span>`;
    }
    function renderComposeMedia() {
        el('moments-compose-media').innerHTML = (state.compose?.media || []).map((item, index) => `<div class="moments-media-chip"><span>${esc(item.name || item.type)}</span><button type="button" data-action="remove-compose-media" data-index="${index}" aria-label="删除附件">×</button></div>`).join('');
    }
    function openStickerPicker(target) {
        state.stickerTarget = target;
        state.stickerCategory = 'all';
        state.stickerQuery = '';
        el('moments-sticker-title').textContent = target === 'compose' ? '添加表情包' : '发送表情包';
        el('moments-sticker-search').value = '';
        renderStickerPicker();
        el('moments-sticker-picker').hidden = false;
    }
    function closeStickerPicker() { el('moments-sticker-picker').hidden = true; state.stickerTarget = ''; }
    function renderStickerPicker() {
        const stickers = availableStickers();
        const categories = [['all', '全部'], ['recent', '最近'], ['ungrouped', '未分类'], ...[...new Set([...(db.stickerCategories || []), ...stickers.map(item => item.group).filter(Boolean)])].map(value => [value, value])];
        el('moments-sticker-categories').innerHTML = categories.map(([value, label]) => `<button type="button" data-action="sticker-category" data-category="${esc(value)}" class="${state.stickerCategory === value ? 'active' : ''}" aria-pressed="${state.stickerCategory === value}">${esc(label)}</button>`).join('');
        let shown = stickers;
        if (state.stickerQuery) shown = shown.filter(item => String(item.name || '').toLowerCase().includes(state.stickerQuery));
        else if (state.stickerCategory === 'recent') shown = [...shown].filter(item => item.lastUsedTime).sort((a, b) => (b.lastUsedTime || 0) - (a.lastUsedTime || 0)).slice(0, 20);
        else if (state.stickerCategory === 'ungrouped') shown = shown.filter(item => !item.group);
        else if (state.stickerCategory !== 'all') shown = shown.filter(item => item.group === state.stickerCategory);
        shown = shown.filter(item => safeImage(item.data));
        el('moments-sticker-grid').innerHTML = shown.length ? shown.map(item => `<button type="button" data-action="choose-sticker" data-sticker-id="${esc(item.id)}" aria-label="${esc(item.name || '表情包')}"><img src="${esc(safeImage(item.data))}" alt=""><span>${esc(item.name || '表情包')}</span></button>`).join('') : '<p class="moments-sticker-empty">这里还没有表情包</p>';
    }
    async function chooseSticker(stickerId) {
        const snapshot = stickerSnapshot(stickerId);
        if (!snapshot) { toast('表情包不可用'); return; }
        const target = state.stickerTarget;
        closeStickerPicker();
        const saved = db.myStickers.find(item => item.id === stickerId);
        if (saved) {
            saved.lastUsedTime = Date.now();
            if (typeof dexieDB !== 'undefined' && dexieDB.myStickers) dexieDB.myStickers.put(saved).catch(error => console.error('表情包最近使用记录保存失败', error));
        }
        if (target === 'compose') {
            if (!state.compose) return;
            if (state.compose.media.length >= 9) { toast('一条动态最多添加 9 个附件'); return; }
            state.compose.media.push({ ...snapshot, type: 'sticker', stickerId: snapshot.id });
            renderComposeMedia();
        } else if (target === 'comment') await sendUserComment(snapshot);
    }
    function clearReplyTarget() {
        const input = el('moments-comment-input');
        input.dataset.replyTo = '';
        input.dataset.mentions = '';
        el('moments-reply-target').hidden = true;
    }
    function openCommentEditor(postId, commentId) {
        const post = findPost(postId);
        const comment = post?.comments?.find(item => item.id === commentId && item.authorId === 'user' && !item.deletedAt);
        if (!comment) return;
        state.commentEdit = { postId, commentId, mentions: [...(comment.mentions || [])] };
        el('moments-comment-edit-text').value = comment.text || '';
        el('moments-comment-edit-mentions').hidden = true;
        el('moments-comment-edit-dialog').hidden = false;
        el('moments-comment-edit-text').focus();
    }
    function closeCommentEditor(force = false) {
        if (state.commentEdit?.busy && !force) return;
        el('moments-comment-edit-dialog').hidden = true;
        el('moments-comment-edit-mentions').hidden = true;
        state.commentEdit = null;
    }
    async function saveCommentEdit(event) {
        event.preventDefault();
        const edit = state.commentEdit;
        const post = findPost(edit?.postId);
        const comment = post?.comments?.find(item => item.id === edit?.commentId && item.authorId === 'user' && !item.deletedAt);
        if (!comment) { closeCommentEditor(); toast('评论已不存在'); return; }
        const text = el('moments-comment-edit-text').value.trim().slice(0, 1000);
        if (!text && !comment.sticker) { toast('评论内容不能为空'); return; }
        if (text === comment.text) { closeCommentEditor(); return; }
        if (edit.busy) return;
        edit.busy = true;
        const previous = { text: comment.text, mentions: comment.mentions, mentionLabels: comment.mentionLabels, editedAt: comment.editedAt, revision: comment.revision, replyBasisText: comment.replyBasisText };
        const previousNotifications = ensure().notifications.slice();
        const mentions = edit.mentions.filter(actorId => actorId !== 'user' && visibleTo(post, actorId) && person(actorId) && mentionLabel(text, actorId, 'user', comment.mentionLabels?.[actorId]));
        comment.text = text;
        comment.mentions = [...new Set(mentions)];
        comment.mentionLabels = Object.fromEntries(comment.mentions.map(actorId => [actorId, mentionLabel(text, actorId, 'user', previous.mentionLabels?.[actorId])]));
        comment.editedAt = Date.now();
        comment.revision = (comment.revision || 0) + 1;
        if ((post.comments || []).some(item => item.replyTo === comment.id && item.authorId !== 'user' && !item.deletedAt) && comment.replyBasisText == null) comment.replyBasisText = previous.text;
        comment.mentions.filter(actorId => !(previous.mentions || []).includes(actorId)).forEach(actorId => notice(actorId, 'user', post.id, '在评论中提到了你', comment.id));
        const eventItem = recordActivity('edit-comment', 'user', post, text, [post.authorId, ...(post.comments || []).filter(item => item.replyTo === comment.id).map(item => item.authorId), ...comment.mentions], comment.id);
        const saveButton = el('moments-comment-edit-save');
        saveButton.disabled = true;
        try {
            let saved = false;
            try { saved = await persist(); } catch (error) { console.error('动态评论修改保存失败', error); }
            if (!saved) {
                Object.assign(comment, previous);
                ensure().notifications = previousNotifications;
                ensure().activityEvents.pop();
                toast('评论修改保存失败');
                return;
            }
            closeCommentEditor(true);
            await deliverActivity(eventItem);
            renderPostAfterChange(post.id);
            toast((post.comments || []).some(item => item.replyTo === comment.id && item.authorId !== 'user' && !item.deletedAt) ? '评论已修改，点击“重新回复”可让角色按新内容回复' : '评论已修改');
        } finally { edit.busy = false; saveButton.disabled = false; }
    }
    async function deleteComment(postId, commentId) {
        const post = findPost(postId);
        const comment = post?.comments?.find(item => item.id === commentId && !item.deletedAt);
        if (!comment || state.deletingComments.has(commentId)) return;
        const hasReplies = post.comments.some(item => item.replyTo === commentId);
        const hasArchive = (post.archivedCommentReplies || []).some(item => item.parentCommentId === commentId);
        state.deletingComments.add(commentId);
        try {
            const choice = await showAppConfirmDialog({ title: '删除评论', message: hasReplies || hasArchive ? '删除后这条评论会显示为“该评论已删除”，已有回复仍可查看。此操作无法撤销。' : '确定删除这条评论？此操作无法撤销。', confirmText: '删除', cancelText: '取消', dismissText: '' });
            if (choice !== 'confirm' || findPost(postId) !== post || !post.comments.includes(comment) || comment.deletedAt) return;
            const keepPlaceholder = post.comments.some(item => item.replyTo === commentId) || (post.archivedCommentReplies || []).some(item => item.parentCommentId === commentId);
            const previousComments = post.comments;
            const previousComment = { ...comment };
            const previousArchive = post.archivedCommentReplies;
            const previousNotifications = ensure().notifications;
            const previousEventCount = ensure().activityEvents.length;
            const parent = post.comments.find(item => item.id === comment.replyTo);
            const knownTo = [post.authorId, comment.authorId, parent?.authorId, ...post.comments.filter(item => item.replyTo === commentId).map(item => item.authorId), ...(comment.mentions || [])];
            if (keepPlaceholder) {
                comment.deletedAt = Date.now();
                comment.text = '';
                comment.mentions = [];
                comment.mentionLabels = {};
                comment.revision = (comment.revision || 0) + 1;
                comment.replyGeneration = (comment.replyGeneration || 0) + 1;
                delete comment.sticker;
                delete comment.replyBasisText;
                if (post.archivedCommentReplies) post.archivedCommentReplies = post.archivedCommentReplies.map(item => item.parentCommentId === commentId ? { ...item, previousText: '' } : item);
            } else post.comments = post.comments.filter(item => item.id !== commentId);
            ensure().notifications = previousNotifications.filter(item => item.commentId !== commentId);
            const eventItem = recordActivity('delete-comment', 'user', post, '', knownTo, commentId);
            let saved = false;
            try { saved = await persist(); } catch (error) { console.error('动态评论删除保存失败', error); }
            if (!saved) {
                post.comments = previousComments;
                for (const key of Object.keys(comment)) delete comment[key];
                Object.assign(comment, previousComment);
                post.archivedCommentReplies = previousArchive;
                ensure().notifications = previousNotifications;
                ensure().activityEvents.splice(previousEventCount);
                toast('评论删除保存失败');
                return;
            }
            await deliverActivity(eventItem);
            renderPostAfterChange(postId);
            toast('评论已删除');
        } finally { state.deletingComments.delete(commentId); }
    }
    function updateComposeLabels() {
        const ids = (state.compose?.audienceIds || []).filter(a => a !== 'user');
        el('moments-audience-label').textContent = ids.length ? ids.length + ' 位角色　›' : '仅自己　›';
        el('moments-remind-label').textContent = state.compose?.reminderIds?.length ? state.compose.reminderIds.length + ' 位角色　›' : '选择角色　›';
    }
    function openPicker(mode) {
        if (!state.compose) return;
        state.picker = mode;
        el('moments-picker-title').textContent = mode === 'audience' ? '谁可以看' : '提醒谁看';
        el('moments-picker-done').hidden = false;
        const audience = new Set(state.compose.audienceIds || []);
        let choices = '';
        if (mode === 'audience') {
            const npcContacts = ensure().contacts.filter(c => { const owner = (db.characters || []).find(ch => ch.id === c.ownerCharId); return c.kind === 'npc' && c.enabled !== false && !findCharacter(c.actorId) && owner && characterSettings(owner).contactsEnabled; });
            choices = `<label><input type="checkbox" data-all-characters>所有角色</label>${ensure().groups.map(g => `<label><input type="checkbox" data-group-id="${esc(g.id)}">分组：${esc(g.name)}</label>`).join('')}${(db.characters || []).map(c => `<label><input type="checkbox" data-character-choice value="${esc(charActor(c.id))}" ${audience.has(charActor(c.id)) ? 'checked' : ''}>${esc(person(charActor(c.id))?.name || '角色')}</label>`).join('')}${npcContacts.length ? '<p class="moments-hint">角色人脉</p>' : ''}${npcContacts.map(c => `<label><input type="checkbox" value="${esc(c.actorId)}" ${audience.has(c.actorId) ? 'checked' : ''}>${esc(person(c.actorId)?.name || c.name)}</label>`).join('')}`;
        } else {
            choices = [...audience].filter(a => a !== 'user' && person(a)).map(actorId => `<label><input type="checkbox" value="${esc(actorId)}" ${state.compose.reminderIds.includes(actorId) ? 'checked' : ''}>${esc(person(actorId).name)}</label>`).join('') || '<p class="moments-hint">请先选择可见角色。</p>';
        }
        el('moments-picker-options').innerHTML = choices;
        el('moments-picker').hidden = false;
    }
    function closePicker() { el('moments-picker').hidden = true; state.picker = null; }
    function applyPicker() {
        const selected = Array.from(el('moments-picker-options').querySelectorAll('input[value]:checked')).map(input => input.value);
        if (state.picker === 'audience') {
            state.compose.audienceIds = ['user', ...selected];
            state.compose.reminderIds = state.compose.reminderIds.filter(id => selected.includes(id));
            state.compose.mentions = state.compose.mentions.filter(id => selected.includes(id));
        } else if (state.picker === 'remind') state.compose.reminderIds = selected;
        updateComposeLabels();
        closePicker();
    }
    async function fileToDataUrl(file) {
        return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
    }
    async function addFiles(files) {
        if (!state.compose || state.mediaBusy) return;
        const draft = state.compose;
        state.mediaBusy = true;
        try { for (const file of Array.from(files || [])) {
            const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : '';
            if (!type) { toast('仅支持图片、视频和音频'); continue; }
            if (draft.media.length >= 9) { toast('一条动态最多添加 9 个附件'); break; }
            const max = type === 'video' ? 30 : type === 'audio' ? 12 : 10;
            if (file.size > max * 1024 * 1024) { toast(`${type === 'video' ? '视频' : type === 'audio' ? '音频' : '图片'}不能超过 ${max}MB`); continue; }
            try {
                const data = type === 'image' && typeof compressImage === 'function' ? await compressImage(file, { quality: 0.82, maxWidth: 1440, maxHeight: 1440 }) : await fileToDataUrl(file);
                if (state.compose !== draft) break;
                draft.media.push({ id: id('media'), type, name: file.name || (type === 'audio' ? '录音' : '附件'), data, mime: file.type });
            } catch (error) { console.error('动态附件读取失败', error); toast('附件读取失败'); }
        } } finally { state.mediaBusy = false; if (state.compose === draft) renderComposeMedia(); }
    }
    async function toggleRecord() {
        if (state.recorder && state.recorder.state === 'recording') { state.recordFinishing = true; state.recorder.stop(); return; }
        if (state.recordFinishing || !state.compose) return;
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { toast('当前浏览器不支持录音'); return; }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            state.recordStream = stream;
            const draft = state.compose;
            const chunks = [];
            const recorder = new MediaRecorder(stream);
            state.recorder = recorder;
            recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
            recorder.onstop = async () => {
                stream.getTracks().forEach(track => track.stop());
                if (state.recorder === recorder) { state.recorder = null; state.recordStream = null; }
                el('moments-record-btn').classList.remove('recording');
                el('moments-record-btn').querySelector('span').textContent = '录音';
                try {
                    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
                    if (blob.size > 12 * 1024 * 1024) { toast('录音不能超过 12MB'); return; }
                    if (state.compose === draft) { draft.media.push({ id: id('media'), type: 'audio', name: '我的录音', data: await fileToDataUrl(blob), mime: blob.type }); renderComposeMedia(); }
                } catch (error) { console.error('录音读取失败', error); toast('录音读取失败'); }
                finally { state.recordFinishing = false; }
            };
            recorder.start();
            el('moments-record-btn').classList.add('recording');
            el('moments-record-btn').querySelector('span').textContent = '停止';
        } catch (error) { state.recordStream?.getTracks().forEach(track => track.stop()); state.recordStream = null; console.error('动态录音失败', error); toast('无法使用麦克风'); }
    }

    function notice(toId, fromId, postId, text, commentId = '') {
        if (!toId || toId === fromId || !person(toId)) return;
        const list = ensure().notifications;
        const post = findPost(postId);
        list.unshift({ id: id('notice'), toId, fromId, ...(fromId === 'user' ? { fromPersonaId: post?.authorId === 'user' ? profilePersonaForPost(post) : post?.userInteractionPersonaId || knownPersonaId(toId) } : {}), postId, ...(commentId ? { commentId } : {}), text, createdAt: Date.now(), read: false });
        if (list.length > 300) list.length = 300;
    }
    function addComment(post, authorId, text, replyTo = '', mentions = [], sticker = null, task = null) {
        if (!memoryAllowed(post.id, authorId)) return null;
        if (!visibleTo(post, authorId) || !person(authorId) || (!String(text || '').trim() && !sticker) || (replyTo && !post.comments?.some(item => item.id === replyTo && !item.deletedAt))) return null;
        if (controls && !controls.commentAllowed(post, authorId, replyTo, task)) return null;
        const cleanText = String(text).trim().slice(0, 1000);
        const validMentions = mentions.filter(actorId => actorId !== authorId && visibleTo(post, actorId) && person(actorId) && mentionLabel(cleanText, actorId, authorId));
        const comment = { id: id('comment'), authorId, ...(authorId === 'user' ? { authorPersonaId: post.userInteractionPersonaId || profilePersonaForPost(post), authorSnapshot: { name: userIdentity(post.userInteractionPersonaId || profilePersonaForPost(post)).name, avatar: userIdentity(post.userInteractionPersonaId || profilePersonaForPost(post)).avatar } } : {}), text: cleanText, replyTo, mentions: validMentions, mentionLabels: Object.fromEntries(validMentions.map(actorId => [actorId, mentionLabel(cleanText, actorId, authorId)])), createdAt: Date.now() };
        if (sticker) comment.sticker = sticker;
        if (controls && authorId !== 'user') Object.assign(comment, controls.commentMetadata(post,replyTo,task));
        else if (task) { comment.generationTaskId = task.id; comment.generationRound = task.round || 0; comment.discussionGeneration = task.discussionGeneration || 0; comment.discussionId = task.rootId || ''; }
        if (!Array.isArray(post.comments)) post.comments = [];
        post.comments.push(comment);
        if (task) task.pendingComments = (task.pendingComments || 0) + 1;
        notice(post.authorId, authorId, post.id, '评论了你的动态', comment.id);
        if (replyTo) notice(post.comments.find(c => c.id === replyTo)?.authorId, authorId, post.id, '回复了你的评论', comment.id);
        comment.mentions.forEach(actorId => notice(actorId, authorId, post.id, '在评论中提到了你', comment.id));
        recordActivity(replyTo ? 'reply' : 'comment', authorId, post, [cleanText, sticker ? `[表情包：${sticker.name}]` : ''].filter(Boolean).join(' '), [post.authorId, replyTo ? post.comments.find(item => item.id === replyTo)?.authorId : '', ...comment.mentions], comment.id);
        return comment;
    }
    async function toggleLike(postId, actorId = 'user') {
        const post = findPost(postId);
        if (!post || !visibleTo(post, actorId)) return;
        if (actorId === 'user' && post.authorId !== 'user' && !profilePersonaForPost(post)) { toast('请先在该角色的聊天设置中指定这个角色认识的身份'); return; }
        if (actorId === 'user') { post.userInteractionPersonaId = profilePersonaForPost(post); post.userLikePersonaId = post.userInteractionPersonaId; }
        if (!Array.isArray(post.likes)) post.likes = [];
        const index = post.likes.indexOf(actorId);
        if (index >= 0) post.likes.splice(index, 1);
        else { post.likes.push(actorId); notice(post.authorId, actorId, post.id, '赞了你的动态'); }
        const event = recordActivity(index >= 0 ? 'unlike' : 'like', actorId, post, '', [post.authorId]);
        await persist();
        await deliverActivity(event);
        renderFeed();
        if (el('moments-detail-screen').classList.contains('active')) renderDetail(postId);
        if (!el('moments-story-viewer').hidden) showStory(postId);
    }
    async function sendUserComment(sticker = null) {
        const post = findPost(state.currentPostId);
        const input = el('moments-comment-input');
        if (!post || (!input.value.trim() && !sticker)) return;
        if (input.dataset.replyTo && !post.comments?.some(item => item.id === input.dataset.replyTo && !item.deletedAt)) { clearReplyTarget(); toast('原评论已变化，请重新选择回复对象'); return; }
        if (post.authorId !== 'user' && !profilePersonaForPost(post)) { toast('请先在该角色的聊天设置中指定这个角色认识的身份'); return; }
        const mentions = Array.from(new Set((input.dataset.mentions || '').split(',').filter(actorId => actorId && visibleTo(post, actorId) && input.value.includes('@' + person(actorId)?.name))));
        const previousNotifications = ensure().notifications.slice();
        post.userInteractionPersonaId = profilePersonaForPost(post);
        const comment = addComment(post, 'user', input.value, input.dataset.replyTo || '', mentions, sticker);
        const event = ensure().activityEvents.at(-1);
        if (!await persist()) { post.comments.pop(); ensure().activityEvents.pop(); ensure().notifications = previousNotifications; toast('评论保存失败'); return; }
        await deliverActivity(event);
        input.value = '';
        clearReplyTarget();
        renderDetail(post.id);
        renderFeed();
        toast('评论成功');
        if (comment) {
            if (controls) await controls.commentEvents(post, [comment]);
            else generateReplies(post.id, comment.id).catch(error => console.error('动态回复生成失败', error));
        }
    }
    async function publish() {
        if (!state.compose) return;
        if (state.mediaBusy) { toast('请等附件读取完成'); return; }
        if (state.recorder || state.recordFinishing) { toast('请先停止录音并等待保存'); return; }
        const draft = state.compose;
        const text = el('moments-compose-text').value.trim();
        if (!text && !draft.media.length) { toast('写点文字或添加媒体再发布'); return; }
        const button = el('moments-publish-btn');
        button.disabled = true;
        try {
            const m = ensure();
            const existing = draft.editPostId ? m.posts.find(item => item.id === draft.editPostId && item.authorId === 'user') : null;
            const selectedPersonaId = existing ? existing.authorPersonaId || 'legacy' : draft.personaId;
            const recipients = draft.audienceIds.filter(actorId => actorId !== 'user' && !!person(actorId));
            const groups = new Map();
            for (const actorId of recipients) {
                const personaId = existing && selectedPersonaId === 'legacy' ? 'legacy' : knownPersonaId(actorId, selectedPersonaId);
                if (!personaId) { toast(`${person(actorId)?.name || '角色'}绑定了多个人设，请先在该角色的聊天设置中指定其认识的身份`); return; }
                if (!groups.has(personaId)) groups.set(personaId, []);
                groups.get(personaId).push(actorId);
            }
            if (recipients.length && !groups.has(selectedPersonaId)) { toast('所选对象都认识其他身份，请调整可见对象或发布身份'); return; }
            if (!groups.size) groups.set(selectedPersonaId, []);
            if (existing && groups.size > 1) { toast('编辑动态时请只选择认识同一身份的对象'); return; }
            if (groups.size > 1) {
                const choice = await showAppConfirmDialog({ title: '按人设分别发布', message: `所选对象认识 ${groups.size} 个不同身份。将发布 ${groups.size} 条内容相同、互动独立的动态，确认吗？`, confirmText: '分别发布', cancelText: '返回修改', dismissText: '' });
                if (choice !== 'confirm') return;
            }
            const prior = existing ? structuredClone(existing) : null;
            const priorNotifications = m.notifications.slice();
            const priorEventsLength = m.activityEvents.length;
            const viewMode = 'now';
            const created = [];
            const events = [];
            for (const [personaId, actorIds] of groups) {
                const audienceIds = ['user', ...actorIds];
                const reminderIds = draft.reminderIds.filter(actorId => audienceIds.includes(actorId));
                const mentions = draft.mentions.filter(actorId => audienceIds.includes(actorId) && mentionLabel(text, actorId, 'user', prior?.mentionLabels?.[actorId]));
                const post = existing || { id: id('moment'), authorId: 'user', likes: [], comments: [], createdAt: Date.now() };
                Object.assign(post, { kind: draft.kind, text: text.slice(0, 5000), media: draft.media.map(item => ({ ...item })), audienceIds, reminderIds, mentions, mentionLabels: Object.fromEntries(mentions.map(actorId => [actorId, mentionLabel(text, actorId, 'user', prior?.mentionLabels?.[actorId])])), viewerPersonaIds: Object.fromEntries(actorIds.map(actorId => [actorId, personaId])), authorPersonaId: personaId, authorSnapshot: prior?.authorSnapshot || { name: userIdentity(personaId).name, avatar: userIdentity(personaId).avatar }, viewMode: 'now', revision: (prior?.revision || 0) + (existing ? 1 : 0) });
                if (!post.seenBy || typeof post.seenBy !== 'object') post.seenBy = {};
                if (!Array.isArray(post.viewResults)) post.viewResults = [];
                if (post.kind === 'story') post.expiresAt = prior?.kind === 'story' ? prior.expiresAt : Date.now() + 24 * 3600000;
                else delete post.expiresAt;
                if (!existing) m.posts.push(post);
                else m.notifications = m.notifications.filter(n => n.postId !== post.id || visibleTo(post, n.toId));
                reminderIds.filter(actorId => !prior?.reminderIds?.includes(actorId)).forEach(actorId => notice(actorId, 'user', post.id, '提醒你看一条动态'));
                mentions.filter(actorId => !prior?.mentions?.includes(actorId)).forEach(actorId => notice(actorId, 'user', post.id, '在动态中提到了你'));
                events.push(recordActivity(existing ? 'edit' : post.kind, 'user', post, '', existing ? Object.keys(post.seenBy || {}) : []));
                created.push(post);
            }
            const saved = await persist();
            if (!saved) {
                if (prior) m.posts[m.posts.findIndex(item => item.id === prior.id)] = prior;
                else m.posts.splice(m.posts.length - created.length, created.length);
                m.notifications = priorNotifications;
                m.activityEvents.splice(priorEventsLength);
                toast('保存失败，请检查存储空间');
                return;
            }
            for (const event of events) await deliverActivity(event);
            state.compose = null;
            renderFeed();
            switchScreen('moments-screen');
            toast(existing ? '修改成功' : created.length > 1 ? `已按 ${created.length} 个身份分别发布` : '发布成功');
            for(const post of created){
                const addedReminders=existing?(post.reminderIds||[]).filter(a=>!prior.reminderIds?.includes(a)):[];
                const viewers=existing?(post.audienceIds||[]).filter(a=>!post.seenBy?.[a]||addedReminders.includes(a)):post.audienceIds;
                if(controls)await controls.postEvent(post,{actorIds:viewers,reminderIds:addedReminders});
                else Promise.allSettled((viewers||[]).filter(a=>a!=='user'&&person(a)&&actorMayWatch(a)).map(a=>viewPostForActor(post.id,a,true))).then(()=>renderPostAfterChange(post.id));
            }
        } finally { button.disabled = false; }
    }
    function apiConfig(actorId) {
        const background = db.backgroundApiSettings;
        const fallback = typeof isApiConfigReady === 'function' && isApiConfigReady(background) ? background : db.apiSettings;
        const owner = actorId ? findCharacter(actorId) || (db.characters || []).find(char => char.id === ensure().contacts.find(contact => contact.actorId === actorId)?.ownerCharId) : null;
        return typeof getApiConfigForFeature === 'function' ? getApiConfigForFeature('moments', fallback, owner) : fallback;
    }
    async function askAI(prompt, actorId, task = null) {
        const config = apiConfig(actorId);
        if (!(typeof isApiConfigReady === 'function' ? isApiConfigReady(config) : config?.url && config?.model && config?.key)) throw new Error('请先配置动态可用的 API');
        let url = String(config.url).replace(/\/+$/, '');
        if(actorId){const post=task?.postId?findPost(task.postId):null;const user=userIdentity(interactionPersonaId(actorId,post));prompt=(interactionContextFor(actorId,post)+'\n'+prompt+'\n'+(controls?.discussionPrompt(actorId,task)||'')).replace(/\{\{user\}\}/gi,user.baseName||user.name).replace(/\{\{char\}\}/gi,person(actorId)?.character?.realName||person(actorId)?.name||'角色');}
        const body = { model: config.model, messages: [{ role: 'user', content: prompt }], temperature: config.temperature ?? 0.85 };
        const requestOptions = controls?.requestOptions(actorId, task);
        let response, requestError;
        try { response = await fetchAiResponse(config, body, { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (config.key || '') }, url + '/v1/chat/completions', false, requestOptions); }
        catch (error) { requestError = error; throw error; }
        finally { requestOptions?.release(requestError); }
        if (controls && !controls.valid(task)) throw new Error('动态任务已取消或评论已变化，返回内容未写入');
        const value = String(response || '');
        const start = value.indexOf('{');
        const end = value.lastIndexOf('}');
        if (start < 0 || end <= start) { const error = new Error('API 返回内容不是 JSON'); error.rawResponse = value; throw error; }
        let parsed;
        try { parsed = JSON.parse(value.slice(start, end + 1)); }
        catch (error) { error.rawResponse = value; throw error; }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { const error = new Error('API 返回内容不是 JSON 对象'); error.rawResponse = value; throw error; }
        parsed.__rawResponse = value;
        return parsed;
    }
    async function askForActors(prompt,actorIds,resultKey,task=null) {
        const result={[resultKey]:[]};
        // Each request uses the actor's own API binding and private context.
        for(const actorId of actorIds){
            const response=await askAI(prompt+'\n本次仅扮演 ID '+actorId+'；只返回此人的动作或回复。',actorId,task?{...task,actorIds:[actorId]}:null);
            result[resultKey].push(...(Array.isArray(response[resultKey])?response[resultKey]:[]).filter(item=>item.actorId===actorId));
        }
        return result;
    }
    function recentContextFor(actorId) {
        const own = findCharacter(actorId);
        const contact = ensure().contacts.find(c => c.actorId === actorId && c.kind === 'npc');
        const owner = own || (contact?.ownerCharId ? (db.characters || []).find(c => c.id === contact.ownerCharId) : null);
        const history = own ? (own.history || []).filter(message => !message.isContextDisabled && (!message.isMomentsActivity || memoryAllowed(message.momentsPostId || ensure().activityEvents.find(event => event.id === message.momentsEventId)?.postId, actorId))).slice(-8).map(message => `${message.role === 'user' ? '用户' : '角色'}：${String(message.content || '').slice(0, 180)}`).join('\n') : '';
        const posts = ensure().posts.filter(post => memoryAllowed(post.id, actorId) && visibleTo(post, actorId) && (post.authorId === actorId || post.seenBy?.[actorId])).sort((a, b) => b.createdAt - a.createdAt).slice(0, 6).map(post => `${aiName(post.authorId, actorId, profilePersonaForPost(post))}：${postSummary(post)}`).join('\n');
        const ownBooks = (owner?.worldBookIds || []).map(bookId => (db.worldBooks || []).find(book => book.id === bookId)).filter(book => book && !book.disabled);
        const relevantBooks = contact ? boundWorldBooks(contact) : [];
        const books = [...new Map((contact?relevantBooks:ownBooks).map(book => [book.id,book])).values()];
        const world = books.slice(0, contact?.worldBookBinding ? 8 : 2).map(book => String(book.content || '').slice(0, contact?.worldBookBinding ? 500 : 350)).join('\n');
        return { history, posts, world };
    }
    function interactionPersonaId(actorId, post = null) {
        return post?.authorId==='user'?profilePersonaForPost(post):post?.authorId===actorId?post.userRecipientPersonaId||knownPersonaId(actorId):post?.viewerPersonaIds?.[actorId]||knownPersonaId(actorId);
    }
    function interactionContextFor(actorId, post = null) {
        const actor=person(actorId), character=findCharacter(actorId), contact=actor?.contact;
        const personaId=interactionPersonaId(actorId,post);
        const user=userIdentity(personaId), binding=(db.myPersonaPresets||[]).find(p=>p.id===personaId)?.bindings?.[character?.id];
        const matches=!!character&&knownPersonaId(actorId)===personaId;
        const userPersona=binding?(binding.override?binding.extraPersona||'':[user.persona,binding.extraPersona].filter(Boolean).join('\n')):matches?character.myPersona||user.persona:user.persona;
        const replace=text=>String(text||'').replace(/\{\{user\}\}/gi,user.baseName||user.name).replace(/\{\{char\}\}/gi,actor?.character?.realName||actor?.baseName||actor?.name||'角色');
        const parts=['私聊、共同记忆和人设里的未公开信息仅用于理解关系与心情；发表评论时不要向其他可见对象泄露这些内容。',`你的身份：${aiName(actorId,actorId)}。你的人设：${replace(actor?.persona)||'未提供'}。`, `本次用户身份：${user.baseName||user.name}；动态显示名：${user.name}。用户人设：${replace(userPersona)||'未提供'}。`];
        if(character&&matches){
            const history=(character.history||[]).filter(m=>!m.isContextDisabled&&(!m.userPersonaId||m.userPersonaId===personaId)).slice(-12).map(m=>`${m.role==='user'?user.baseName||user.name:actor.name}：${String(m.content||'')}`).join('\n');
            if(history)parts.push('你们已有的私聊与关系经历（延续这些背景，不要仅因动态名字不同就重新判断为陌生人）：\n'+replace(history));
            let memory='';
            if(character.memoryMode==='table'&&typeof getMemoryTableContextBlock==='function')memory=getMemoryTableContextBlock(character);
            else if(character.memoryMode==='vector'&&typeof getVectorMemoryContextBlock==='function')memory=getVectorMemoryContextBlock(character);
            else memory=(character.memoryJournals||[]).filter(j=>j.isFavorited&&(!j.userPersonaId||j.userPersonaId===personaId)).map(j=>`${j.title||''}：${j.content||''}`).join('\n');
            if(memory)parts.push('你们的共同记忆：\n'+replace(memory));
        }
        if(contact){parts.push(`你与${aiName(charActor(contact.ownerCharId),actorId)}的关系：${contact.relationship||'未提供'}。你与用户的关系以自己的人设和亲历记录为准，所属角色的私聊不会传给你。`);}
        const books=character?(db.worldBooks||[]).filter(b=>!b.disabled&&(character.worldBookIds||[]).includes(b.id)):boundWorldBooks(contact);
        if(books.length)parts.push('适用的世界背景：\n'+books.map(b=>replace(b.content)).join('\n'));
        const activity=activityContext(actorId);if(activity)parts.push('你亲历的动态操作：\n'+replace(activity));
        if(post){
            parts.push(`这条动态由${aiName(post.authorId,actorId,profilePersonaForPost(post))}发布。`);
            if(post.reminderIds?.includes(actorId))parts.push('用户专门提醒你看这条动态；你知道自己收到了这次提醒。');
            else parts.push('这次观看没有用户专门提醒你的信息。');
            const media=(post.media||[]).map(m=>m.description||m.prompt||m.transcript||m.name||(m.type==='image'?'[图片，未提供识别结果]':m.type==='audio'?'[音频，未提供转写]':'')).filter(Boolean);
            if(media.length)parts.push('动态媒体信息：'+media.join('；'));
        }
        return parts.join('\n');
    }
    function audienceForActor(actorId) {
        const character = findCharacter(actorId);
        if (character) {
            const related = characterSettings(character).contactsEnabled ? activeContactsFor(character.id).map(c => c.actorId) : [];
            const linkedOwners = ensure().contacts.filter(c => c.kind === 'linked' && c.actorId === actorId && c.enabled !== false).map(c => charActor(c.ownerCharId));
            const originalOwners = ensure().contacts.filter(c => c.kind === 'npc' && c.actorId === actorId && c.enabled !== false).map(c => charActor(c.ownerCharId));
            return ['user', ...linkedOwners, ...originalOwners, ...related.filter(id => id !== actorId)];
        }
        const contact = ensure().contacts.find(c => c.actorId === actorId);
        if (!contact) return ['user'];
        return ['user', charActor(contact.ownerCharId), ...activeContactsFor(contact.ownerCharId).map(c => c.actorId).filter(id => id !== actorId)];
    }
    function mediaSettingsFor(actorId) {
        const character = findCharacter(actorId) || (db.characters || []).find(c => c.id === ensure().contacts.find(contact => contact.actorId === actorId)?.ownerCharId);
        return character ? characterSettings(character) : { imageMode: 'off', voiceMode: 'off' };
    }
    async function generatePost(actorId, kind = 'post', manual = false, feedback = null, task = null) {
        const actor = person(actorId);
        if (!actor || actorId === 'user') return false;
        task ||= controls?.context(manual ? 'manual' : 'chat', [actorId]) || { source: manual ? 'manual' : 'chat' };
        task.publicationKind = kind;
        if (!publicationEnabled(actorId, kind, task.source)) { if (manual) toast('请先允许角色发布' + (kind === 'story' ? ' Story' : '动态')); return false; }
        if (controls) {
            if (!controls.publicationAllowed(actorId, kind, task)) { if (manual) toast('当前设置暂停了调用或已达到发布限制'); return false; }
            if (!controls.settings(actorId).requests.postContent) { if (manual) toast('未允许额外生成动态正文'); return false; }
        }
        const ownCharacter = findCharacter(actorId);
        if (ownCharacter && !characterSettings(ownCharacter)[kind === 'story' ? 'storyEnabled' : 'postEnabled']) { if (manual) toast('请先开启角色自主发布开关'); return false; }
        const contact = ensure().contacts.find(c => c.actorId === actorId && c.kind === 'npc');
        const owner = contact && (db.characters || []).find(c => c.id === contact.ownerCharId);
        if (contact && !ownCharacter && (!contact.enabled || !owner || !characterSettings(owner).contactsEnabled || !(controls?controls.preferences(actorId)[kind==='story'?'storyEnabled':'postEnabled']:contact[kind==='story'?'mayStory':'mayPost'])) && !manual) return false;
        const context = recentContextFor(actorId);
        const audience = audienceForActor(actorId).filter((value, index, list) => list.indexOf(value) === index && person(value));
        const socialUserName = knownPersonaId(actorId) ? aiName('user', actorId, knownPersonaId(actorId)) : ownCharacter?.myName || owner?.myName || '用户';
        const extraContext = contact?.batchExtras ? Object.entries(contact.batchExtras).filter(([key, value]) => !['voice', 'gap'].includes(key) && String(value || '').trim()).map(([key, value]) => `${key}：${String(value).slice(0, 500)}`).join('\n') : '';
        let prompt = `你是熟人动态模拟器。请只以“${aiName(actorId, actorId)}”的身份写一条${kind === 'story' ? '24小时限时 Story' : '日常动态'}。角色人设：${actor.persona || '未提供'}。你当前的个人签名：${actor.signature || '未设置'}。${contact ? `与${aiName(charActor(contact.ownerCharId), actorId)}的关系：${contact.relationship || '朋友'}。` : ''}${extraContext ? `\n此人自己的补充设定（未公开内容不得泄露）：\n${extraContext}\n` : ''}\n世界设定：${context.world || '无'}\n${context.history ? `该角色近期私聊（仅帮助理解心情，绝不能把聊天秘密、用户隐私或未公开内容转述给其他人）：\n${context.history}\n` : ''}你能看到的近期动态：\n${context.posts || '暂无'}\n你亲历的近期动态操作：\n${activityContext(actorId) || '暂无'}\n${promptRule('postGeneration')}若提及别人，只能提及已被允许查看本帖的人：${audience.map(id => `${id}=${id === 'user' ? socialUserName : aiName(id, actorId)}`).join('，')}。可选用的表情包：${stickerChoices(actorId) || '无'}。请返回严格 JSON 对象，不要 Markdown：{"text":"1到180字自然动态","imagePrompt":"适合配图时填写画面描述，否则留空","voiceText":"适合配语音时填写口语化短句，否则留空","stickerId":"适合配表情包时填写可用表情ID，否则留空","mentions":["被艾特者的ID"]}。`;
        prompt += bilingualContent.prompt(ownCharacter, 'moments', '动态正文及角色录制的语音文字');
        if (ownCharacter?.imageFaceLock?.enabled) prompt += '\nJSON 额外包含 imageSubject：只有发布者本人单独出镜（自拍、单人人像）填 "self"；风景、食物、宠物、其他人物或多人合照填 "other"。imagePrompt 不包含这个内部标记。';
        let result;
        if (controls?.settings(actorId).publish.habit) prompt += '\n用户设置的发布习惯：' + controls.settings(actorId).publish.habit;
        try { result = await askAI(prompt, actorId, task); }
        catch (error) { console.error('动态生成失败', error); if (feedback) feedback.error = error.message || '动态生成失败'; if (manual) toast(error.message || '动态生成失败'); if (task?.status === 'running') throw error; return false; }
        if (controls && !controls.publicationAllowed(actorId, kind, task)) return false;
        if (!publicationEnabled(actorId, kind, task.source)) return false;
        const text = String(result.text || '').trim().slice(0, 500);
        if (!text) { if (feedback) feedback.error = 'API 没有生成动态内容'; if (manual) toast('API 没有生成动态内容'); return false; }
        const settings = mediaSettingsFor(actorId);
        const media = [];
        const sticker = result.stickerId ? stickerSnapshot(String(result.stickerId), actorId) : null;
        if (sticker) media.push({ ...sticker, type: 'sticker', stickerId: sticker.id });
        const imagePrompt = String(result.imagePrompt || '').trim().slice(0, 600);
        const voiceText = String(result.voiceText || '').trim().slice(0, 250);
        if (settings.imageMode === 'manual' || settings.imageMode === 'auto' || (settings.imageMode === 'ai' && imagePrompt)) media.push({ id: id('media'), type: 'image', status: 'pending', prompt: imagePrompt || text, imageSubject: result.imageSubject === 'self' ? 'self' : 'other' });
        if (settings.voiceMode === 'manual' || settings.voiceMode === 'auto' || (settings.voiceMode === 'ai' && voiceText)) media.push({ id: id('media'), type: 'audio', status: 'pending', prompt: voiceText || text });
        const mentions = (Array.isArray(result.mentions) ? result.mentions : []).filter(id => audience.includes(id));
        const post = { id: id('moment'), kind, authorId: actorId, text, media, audienceIds: audience, userRecipientPersonaId: knownPersonaId(actorId), viewerPersonaIds: Object.fromEntries(audience.filter(id => id !== 'user').map(id => [id, knownPersonaId(id)])), reminderIds: [], mentions, mentionLabels: Object.fromEntries(mentions.map(id => [id, mentionLabel(text, id, actorId)])), likes: [], comments: [], createdAt: Date.now() };
        if (kind === 'story') post.expiresAt = post.createdAt + 24 * 3600000;
        ensure().posts.push(post);
        const event = recordActivity(kind, actorId, post);
        post.mentions.forEach(id => notice(id, actorId, post.id, kind === 'story' ? '在 Story 中提到了你' : '在动态中提到了你'));
        if (!await persist()) { const m = ensure(); m.posts = m.posts.filter(p => p !== post); m.activityEvents = m.activityEvents.filter(e => e !== event); m.notifications = m.notifications.filter(n => n.postId !== post.id); if (manual) toast('动态保存失败'); return false; }
        if (controls) { controls.published(post); await persist(); await controls.postEvent(post); }
        await deliverActivity(event);
        renderFeed();
        for (let index = 0; index < media.length; index++) {
            if (media[index].type === 'sticker') continue;
            const mode = media[index].type === 'image' ? settings.imageMode : settings.voiceMode;
            if ((mode === 'auto' || mode === 'ai') && (!controls || controls.valid(task) && controls.settings(actorId).requests[media[index].type === 'image' ? 'image' : 'voice'])) await generateMedia(post.id, index, false, task);
        }
        if (manual) toast('已生成动态');
        return true;
    }
    async function generateMedia(postId, index, feedback = true, task = null) {
        const post = findPost(postId);
        const item = post?.media?.[index];
        if (!item || item.status === 'working' || item.status === 'done') return;
        item.status = 'working';
        delete item.faceLockError;
        renderFeed();
        const imageContext = item.type === 'image' ? window.OvoFaceLock?.capture(findCharacter(post.authorId), item.imageSubject) : null;
        try {
            if (controls && task) await controls.request(post.authorId, task);
            if (item.type === 'image') {
                const result = await generateImageDispatch(item.prompt || post.text, null, imageContext);
                if (!result?.imageUrl) throw new Error('生图接口没有返回图片');
                const blob = await fetch(result.imageUrl).then(response => response.blob());
                item.data = typeof compressImage === 'function' ? await compressImage(blob, { quality: 0.83, maxWidth: 1440, maxHeight: 1440 }) : await fileToDataUrl(blob);
                item.mime = blob.type || 'image/png';
                item.faceLock = result.faceLock || null;
            } else if (item.type === 'audio') {
                const charId = findCharacter(post.authorId)?.id || ensure().contacts.find(c => c.actorId === post.authorId)?.ownerCharId;
                const voice = typeof VoiceSelector !== 'undefined' ? VoiceSelector.getVoiceConfig(charId) : null;
                if (!voice || typeof TTSService === 'undefined' || !TTSService.isConfigured()) throw new Error('请先配置角色音色和 TTS');
                const url = await TTSService.synthesize(item.prompt || post.text, voice.voiceId, voice.language, { speed: voice.speed });
                const blob = await fetch(url).then(response => response.blob());
                item.data = await fileToDataUrl(blob);
                item.mime = blob.type || 'audio/mpeg';
            }
            if (controls && !controls.valid(task)) { item.status = 'pending'; return; }
            item.status = 'done';
            await persist();
            if (feedback) toast('媒体生成成功');
        } catch (error) {
            item.status = 'error';
            if (imageContext?.settings._faceLock) item.faceLockError = error.message || '锁脸生图失败';
            await persist();
            console.error('动态媒体生成失败', error);
            if (feedback || imageContext?.settings._faceLock) toast(error.message || '媒体生成失败');
        }
        renderFeed();
        if (el('moments-detail-screen').classList.contains('active') && state.currentPostId === postId) renderDetail(postId);
    }
    function candidatesForPost(post) {
        const ids = new Set();
        for (const actorId of post.audienceIds || []) {
            if (actorId === 'user' || actorId === post.authorId || !person(actorId)) continue;
            if (memoryAllowed(post.id, actorId) && actorMayInteract(actorId) && visibleTo(post, actorId)) ids.add(actorId);
        }
        return [...ids];
    }
    async function generateReactions(postId) {
        const post = findPost(postId);
        if (!post) return;
        const candidates = candidatesForPost(post).slice(0, 8);
        if (!candidates.length) return;
        const actorDescriptions = candidates.map(actorId => `${actorId}：${aiName(actorId, actorId)}，认识的原作者为${aiName(post.authorId, actorId, profilePersonaForPost(post))}，${String(person(actorId).persona || '').slice(0, 220)}`).join('\n');
        let prompt = `你正在模拟一条熟人动态下自然发生的互动。原作者：${aiName(post.authorId, '', profilePersonaForPost(post))}；内容：${postSummary(post)}。可参与者：\n${actorDescriptions}\n请结合各自人设及关系决定谁会点赞、谁会评论，也可以有人完全不互动。评论应短而有区别，不要每人都夸赞，不要重复。只允许从给出的 ID 中选择。各人的可用表情包：${candidates.map(actorId => `${actorId}：${stickerChoices(actorId) || '无'}`).join('；')}。只返回 JSON：{"actions":[{"actorId":"ID","like":true,"comment":"评论，可空","stickerId":"可用表情ID，可空","mentions":["可见者ID"]}]}。最多 ${Math.min(candidates.length, 4)} 人行动。`;
        prompt += candidates.map(actorId => bilingualContent.prompt(findCharacter(actorId), 'moments', `ID ${actorId}（${person(actorId)?.name}）自己写的评论`)).join('');
        try {
            const result = await askForActors(prompt, candidates, 'actions');
            if (findPost(postId) !== post) return;
            const eventStart = ensure().activityEvents.length;
            const allowed = new Set(candidates);
            const used = new Set();
            for (const action of (Array.isArray(result.actions) ? result.actions : []).slice(0, 4)) {
                if (!allowed.has(action.actorId) || used.has(action.actorId) || !visibleTo(post, action.actorId)) continue;
                used.add(action.actorId);
                if (action.like === true && !(post.likes || []).includes(action.actorId)) { post.likes.push(action.actorId); notice(post.authorId, action.actorId, post.id, '赞了你的动态'); recordActivity('like', action.actorId, post, '', [post.authorId]); }
                const sticker = action.stickerId ? stickerSnapshot(String(action.stickerId), action.actorId) : null;
                if (String(action.comment || '').trim() || sticker) addComment(post, action.actorId, String(action.comment || '').slice(0, 300), '', Array.isArray(action.mentions) ? action.mentions : [], sticker);
            }
            await persist();
            for (const event of ensure().activityEvents.slice(eventStart)) await deliverActivity(event);
            renderFeed();
            if (state.currentPostId === post.id && el('moments-detail-screen').classList.contains('active')) renderDetail(post.id);
        } catch (error) { console.error('动态互动 API 失败', error); }
    }
    async function generateReplies(postId, commentId, task = null) {
        const post = findPost(postId);
        const comment = post?.comments?.find(item => item.id === commentId);
        if (!post || !comment || comment.deletedAt) return;
        const revision = comment.revision || 0;
        const replyGeneration = comment.replyGeneration || 0;
        const originalText = comment.text;
        const candidateIds = candidatesForPost(post);
        const author = findCharacter(post.authorId);
        if (author && characterSettings(author).interactEnabled || controls && actorMayInteract(post.authorId)) candidateIds.unshift(post.authorId);
        let candidates = [...new Set(candidateIds)].filter(actorId => memoryAllowed(post.id, actorId) && actorId !== comment.authorId && (post.authorId === actorId || post.seenBy?.[actorId]) && canSeeInteraction(post, actorId, comment.authorId, comment.authorPersonaId));
        if (controls) { task ||= controls.context(comment.authorId === 'user' ? 'userComment' : 'aiComment', candidates, post, comment); candidates = controls.candidates(post, comment, candidates.filter(a => task.actorIds.includes(a)), task.source, task); task.actorIds = candidates; }
        else candidates = candidates.slice(0, 8);
        if (!candidates.length) return;
        let prompt = `以下是一条熟人动态及新评论。动态作者：${postAuthorName(post)}；动态：${postSummary(post)}；${commentAuthorName(post, comment)}评论：“${commentSummary(comment)}”。可回复的人：\n${candidates.map(actorId => `${actorId}：${person(actorId)?.name}，参与者；表情包：${stickerChoices(actorId) || '无'}`).join('\n')}\n请自然决定是否有人会接话，可以无人回复。不要机械附和，回复要与对话相关且各有说话习惯。只返回 JSON：{"replies":[{"actorId":"给定ID","text":"简短回复，可空","stickerId":"可用表情ID，可空"}]}。最多 2 人。`;
        prompt += candidates.map(actorId => bilingualContent.prompt(findCharacter(actorId), 'moments', `ID ${actorId}（${person(actorId)?.name}）自己写的回复`)).join('');
        try {
            if (controls) {
                const limits = candidates.map(a => controls.settings(a, post, controls.thread(post, comment)).discussion.perActor);
                prompt = prompt.replace('最多 2 人。', `参与人数不超过 ${candidates.length} 人。各人每轮最多条数：${candidates.map((a,i) => a + '=' + (limits[i] || '不限')).join('；')}。可以无人回复，不要求凑数。现有可见评论：${(post.comments || []).filter(c => !c.deletedAt && candidates.every(a => canSeeInteraction(post, a, c.authorId, c.authorPersonaId))).slice(-12).map(c => commentAuthorName(post,c) + '：' + commentSummary(c)).join('；')}`);
            }
            const result = await askForActors(prompt, candidates, 'replies', task);
            if (findPost(postId) !== post || !post.comments?.includes(comment) || comment.deletedAt || (comment.revision || 0) !== revision || (comment.replyGeneration || 0) !== replyGeneration || comment.text !== originalText) return;
            const eventStart = ensure().activityEvents.length;
            const used = new Map(), added = [];
            for (const reply of (Array.isArray(result.replies) ? result.replies : []).slice(0, controls ? undefined : 2)) {
                const sticker = reply.stickerId ? stickerSnapshot(String(reply.stickerId), reply.actorId) : null;
                const limit = controls ? controls.settings(reply.actorId, post, controls.thread(post, comment)).discussion.perActor : 1;
                if (!candidates.includes(reply.actorId) || (limit && (used.get(reply.actorId) || 0) >= limit) || (!String(reply.text || '').trim() && !sticker)) continue;
                used.set(reply.actorId, (used.get(reply.actorId) || 0) + 1);
                const created = addComment(post, reply.actorId, String(reply.text || '').slice(0, 300), comment.id, [], sticker, task);
                if (created) added.push(created);
            }
            if (!await persist()) {
                const ids = new Set(added.map(c => c.id)), m = ensure();
                post.comments = post.comments.filter(c => !ids.has(c.id));
                m.notifications = m.notifications.filter(n => !ids.has(n.commentId));
                m.activityEvents = m.activityEvents.filter(e => !ids.has(e.commentId));
                if (task) task.pendingComments = 0;
                throw new Error('回复保存失败，未启动后续接话');
            }
            if (controls) await controls.commentEvents(post, added, task);
            for (const event of ensure().activityEvents.slice(eventStart)) await deliverActivity(event);
            renderPostAfterChange(post.id);
        } catch (error) { if (controls && !controls.valid(task)) return; console.error('动态回复 API 失败', error); if (task?.status === 'running') throw error; }
    }
    function replyBranch(post, directReplies) {
        const ids = new Set(directReplies.map(item => item.id));
        let changed = true;
        while (changed) {
            changed = false;
            for (const item of post.comments || []) if (ids.has(item.replyTo) && !ids.has(item.id)) { ids.add(item.id); changed = true; }
        }
        return (post.comments || []).filter(item => ids.has(item.id));
    }
    async function regenerateCommentReplies(postId, commentId) {
        const post = findPost(postId);
        const comment = post?.comments?.find(item => item.id === commentId && item.authorId === 'user' && !item.deletedAt);
        const oldReplies = (post?.comments || []).filter(item => item.replyTo === commentId && item.authorId !== 'user' && !item.deletedAt);
        if (!comment || !oldReplies.length || state.regeneratingComments.has(commentId)) return;
        const revision = comment.revision || 0;
        const originalText = comment.text;
        const oldReplyIds = oldReplies.map(item => item.id);
        const actorIds = [...new Set(oldReplies.map(item => item.authorId))].filter(actorId => memoryAllowed(post.id, actorId) && person(actorId) && visibleTo(post, actorId) && actorMayInteract(actorId) && (post.authorId === actorId || post.seenBy?.[actorId]) && canSeeInteraction(post, actorId, 'user', comment.authorPersonaId));
        if (actorIds.length !== new Set(oldReplies.map(item => item.authorId)).size) { toast('原回复角色当前无法互动，旧回复已保留'); return; }
        state.regeneratingComments.add(commentId);
        renderDetail(postId);
        try {
            let prompt = `以下是一条熟人动态及用户修改后的评论。动态作者：${postAuthorName(post)}；动态：${postSummary(post)}；${commentAuthorName(post, comment)}评论：“${commentSummary(comment)}”。需要重新回复的原回复（按顺序逐条替换）：\n${oldReplies.map(reply => `${reply.id}：${reply.authorId} ${person(reply.authorId)?.name}，${String(person(reply.authorId)?.persona || '').slice(0, 180)}；表情包：${stickerChoices(reply.authorId) || '无'}`).join('\n')}\n请让每条原回复的作者按修改后的评论重新回复。不要沿用修改前的内容；同一角色有多条原回复时，也要分别给出相同数量的新回复。只返回 JSON：{"replies":[{"replyId":"原回复ID","actorId":"给定角色ID","text":"简短回复，可空","stickerId":"可用表情ID，可空"}]}。每个原回复ID恰好对应一条。`;
        prompt += actorIds.map(actorId => bilingualContent.prompt(findCharacter(actorId), 'moments', `ID ${actorId}（${person(actorId)?.name}）自己写的回复`)).join('');
            const result = await askForActors(prompt, actorIds, 'replies', controls?.context('regenerate', actorIds, post, comment));
            const currentReplyIds = (post.comments || []).filter(item => item.replyTo === commentId && item.authorId !== 'user' && !item.deletedAt).map(item => item.id);
            if (findPost(postId) !== post || !post.comments?.includes(comment) || comment.deletedAt || (comment.revision || 0) !== revision || comment.text !== originalText || currentReplyIds.length !== oldReplyIds.length || currentReplyIds.some((replyId, index) => replyId !== oldReplyIds[index])) { toast('评论或回复已变化，本次生成未替换原回复'); return; }
            const replacements = [];
            if (actorIds.some(actorId => !memoryAllowed(postId, actorId))) return;
            for (const oldReply of oldReplies) {
                const reply = (Array.isArray(result.replies) ? result.replies : []).find(item => item.replyId === oldReply.id && item.actorId === oldReply.authorId);
                const sticker = reply?.stickerId ? stickerSnapshot(String(reply.stickerId), oldReply.authorId) : null;
                const text = String(reply?.text || '').trim().slice(0, 300);
                if (!reply || (!text && !sticker) || (reply.stickerId && !sticker)) { toast('角色回复不完整，原回复已保留'); return; }
                replacements.push({ actorId: oldReply.authorId, text, sticker });
            }
            const archived = replyBranch(post, oldReplies);
            const previousComments = post.comments;
            const previousArchive = post.archivedCommentReplies;
            const previousBasis = comment.replyBasisText;
            const previousGeneration = comment.replyGeneration;
            const previousNotifications = ensure().notifications.slice();
            const previousEventCount = ensure().activityEvents.length;
            const archivedIds = new Set(archived.map(item => item.id));
            post.comments = post.comments.filter(item => !archivedIds.has(item.id));
            post.archivedCommentReplies = [...(previousArchive || []), { parentCommentId: commentId, previousText: previousBasis ?? originalText, comments: archived, archivedAt: Date.now() }];
            comment.replyBasisText = originalText;
            comment.replyGeneration = (comment.replyGeneration || 0) + 1;
            for (const replacement of replacements) addComment(post, replacement.actorId, replacement.text, commentId, [], replacement.sticker, controls?.context('regenerate', actorIds, post, comment));
            let saved = false;
            try { saved = await persist(); } catch (error) { console.error('动态重新回复保存失败', error); }
            if (!saved) {
                post.comments = previousComments;
                post.archivedCommentReplies = previousArchive;
                comment.replyBasisText = previousBasis;
                comment.replyGeneration = previousGeneration;
                ensure().notifications = previousNotifications;
                ensure().activityEvents.splice(previousEventCount);
                toast('新回复保存失败，原回复已保留');
                return;
            }
            for (const eventItem of ensure().activityEvents.slice(previousEventCount)) await deliverActivity(eventItem);
            renderPostAfterChange(postId);
            toast('角色已根据修改后的评论重新回复');
        } catch (error) { console.error('动态重新回复失败', error); toast(error.message || '重新回复失败，原回复已保留'); }
        finally {
            state.regeneratingComments.delete(commentId);
            if (state.currentPostId === postId && el('moments-detail-screen').classList.contains('active')) renderDetail(postId);
        }
    }
    const batchExtraFields = {
        experience: '共同经历', network: '人脉关系网', life: '独立生活', conflict: '人际矛盾',
        scenes: '出现场景', voice: '口吻试听', reveal: '信息逐渐揭示', gap: '人脉空白分析'
    };
    const batchFeatures = [
        ['experience', '共同经历'], ['worldReference', '世界书参考'], ['worldBinding', '保存世界书绑定'],
        ['avatar', '生图头像'], ['cover', '生图背景'], ['network', '人脉关系网'],
        ['life', '独立生活'], ['conflict', '人际矛盾'], ['scenes', '出现场景'],
        ['voice', '口吻试听'], ['reveal', '信息逐渐揭示'], ['gap', '人脉空白分析']
    ];
    function batchStatus(message, review = false) {
        const node = el(review ? 'moments-batch-review-status' : 'moments-batch-status');
        if (node) node.textContent = message;
    }
    function batchPeople(group) {
        const count = Number.isInteger(group.count) && group.count > 0 ? Math.min(group.count, 50) : 0;
        return Array.from({ length: count }, (_, index) => group.people?.[index] || { gender: '', relationship: '' });
    }
    function uniqueBatchRelation(value) {
        const relation = String(value || '').trim();
        if (/^(母亲|妈妈|亲生母亲)$/.test(relation)) return '母亲';
        if (/^(父亲|爸爸|亲生父亲)$/.test(relation)) return '父亲';
        return '';
    }
    function batchPerson(group, index) {
        const person = batchPeople(group)[index] || { gender: '', relationship: '' };
        const relationship = String(person.relationship || '').trim();
        const gender = String(person.gender || '').trim() || (uniqueBatchRelation(relationship) === '母亲' ? '女' : uniqueBatchRelation(relationship) === '父亲' ? '男' : '');
        const reservedRelations = batchPeople(group).filter((_, personIndex) => personIndex !== index).map(item => uniqueBatchRelation(item.relationship)).filter(Boolean);
        return { ...group, gender, relationship, reservedRelations };
    }
    function batchProgress(batch, message, detail = '') {
        if (state.batch !== batch) return;
        const total = batch.groups.reduce((sum, group) => sum + group.count, 0);
        const done = batch.candidates.length;
        const imageTotal = total * (Number(!!batch.options.avatar) + Number(!!batch.options.cover));
        const imageDone = batch.imageDone || 0;
        el('moments-batch-progress').hidden = false;
        el('moments-batch-progress-text').textContent = message;
        el('moments-batch-progress-detail').textContent = `${done} / ${total} 人已生成${imageTotal ? ` · ${imageDone} / ${imageTotal} 张图片已处理` : ''}${detail ? ' · ' + detail : ''}`;
        const percent = total + imageTotal ? Math.round((done + imageDone) / (total + imageTotal) * 100) : 0;
        el('moments-batch-progress-fill').style.width = percent + '%';
        el('moments-batch-progress-track').setAttribute('aria-valuenow', String(percent));
    }
    function openBatchDialog() {
        const owner = (db.characters || []).find(c => c.id === currentChatId);
        if (!owner) { toast('请先打开角色聊天设置'); return; }
        state.batch = { groups: [{ ownerCharId: owner.id, count: 3, people: [], note: '' }], options: {}, candidates: [], busy: false, cancelled: false, world: null };
        el('moments-batch-config').hidden = false;
        el('moments-batch-review').hidden = true;
        el('moments-batch-dialog').hidden = false;
        el('moments-batch-progress').hidden = true;
        el('moments-batch-options').innerHTML = batchFeatures.map(([key, label]) => `<label><input type="checkbox" data-batch-feature="${key}">${label}</label>`).join('');
        renderBatchGroups();
        renderBatchWorld();
        updateBatchEstimate();
    }
    function closeBatchDialog() {
        if (state.batch) state.batch.cancelled = true;
        state.batch = null;
        el('moments-batch-progress').hidden = true;
        el('moments-batch-dialog').hidden = true;
    }
    function readBatchGroups() {
        if (!state.batch) return;
        state.batch.groups = [...el('moments-batch-groups').querySelectorAll('.moments-batch-group')].map(row => {
            const value = key => row.querySelector(`[data-batch-field="${key}"]`)?.value || '';
            const people = [...row.querySelectorAll('[data-batch-person]')].map(personRow => {
                const field = key => personRow.querySelector(`[data-batch-person-field="${key}"]`)?.value || '';
                return { gender: field('gender') === 'custom' ? field('customGender').trim() : field('gender'), customGenderEmpty: field('gender') === 'custom' && !field('customGender').trim(), relationship: field('relationship').trim() };
            });
            return { ownerCharId: value('owner'), count: Number(value('count')), people, note: value('note').trim() };
        });
    }
    function renderBatchGroups() {
        if (!state.batch) return;
        const characters = db.characters || [];
        el('moments-batch-groups').innerHTML = state.batch.groups.map((group, index) => `<div class="moments-batch-group">
            <div class="moments-batch-group-head"><strong>第 ${index + 1} 组</strong>${state.batch.groups.length > 1 ? `<button type="button" data-batch-action="remove-group" data-index="${index}">移除</button>` : ''}</div>
            <div class="moments-batch-row">
                <label class="moments-field">所属角色<select data-batch-field="owner">${characters.map(c => `<option value="${esc(c.id)}" ${c.id === group.ownerCharId ? 'selected' : ''}>${esc(c.realName || c.remarkName || '角色')}</option>`).join('')}</select></label>
                <label class="moments-field moments-batch-count">人数<input data-batch-field="count" type="number" min="1" max="50" step="1" value="${group.count}"></label>
            </div>
            <div class="moments-batch-people">${batchPeople(group).map((person, personIndex) => `<div class="moments-batch-person" data-batch-person="${personIndex}">
                <strong>第 ${personIndex + 1} 人</strong>
                <div class="moments-batch-row"><label class="moments-field">性别<select data-batch-person-field="gender"><option value="">不限定</option>${['女', '男', '非二元'].map(value => `<option value="${value}" ${person.gender === value ? 'selected' : ''}>${value}</option>`).join('')}<option value="custom" ${person.customGenderEmpty || person.gender && !['女', '男', '非二元'].includes(person.gender) ? 'selected' : ''}>自定义</option></select></label>
                <label class="moments-field">与所属角色的关系<input data-batch-person-field="relationship" maxlength="40" value="${esc(person.relationship || '')}" placeholder="如：母亲；留空由 AI 决定"></label></div>
                <label class="moments-field" data-batch-custom-wrap ${!person.customGenderEmpty && (!person.gender || ['女', '男', '非二元'].includes(person.gender)) ? 'hidden' : ''}>自定义性别<input data-batch-person-field="customGender" maxlength="30" value="${esc(person.gender && !['女', '男', '非二元'].includes(person.gender) ? person.gender : '')}"></label>
            </div>`).join('')}</div>
            <p class="moments-hint">每一行对应一人。填“母亲”仅指定该行；未选性别时，母亲默认女、父亲默认男。</p>
            <label class="moments-field">补充要求<textarea data-batch-field="note" maxlength="1000" placeholder="选填：年龄、职业、亲疏程度、必须遵守或避免的设定">${esc(group.note)}</textarea></label>
        </div>`).join('');
    }
    function renderBatchWorld() {
        const categories = [...new Set((db.worldBooks || []).filter(book => !book.disabled).map(book => worldCategoryPath(book.category)))].sort((a, b) => a.localeCompare(b));
        el('moments-batch-world').innerHTML = `<div class="moments-batch-world-list">
            <label class="moments-batch-world-choice"><input type="checkbox" data-batch-world-inherit>沿用所属角色已关联的世界书</label>
            ${categories.map(path => {
                const books = (db.worldBooks || []).filter(book => !book.disabled && worldCategoryPath(book.category) === path);
                return `<div class="moments-batch-world-category"><label class="moments-batch-world-choice"><input type="checkbox" data-batch-world-category="${esc(path)}">整个分类：${esc(path)}（含子分类）</label><small>取消下方单条勾选可排除该条目</small>${books.map(book => `<label class="moments-batch-world-choice moments-batch-world-item"><input type="checkbox" data-batch-world-item="${esc(book.id)}" data-category-path="${esc(path)}"><span>${esc(book.name || '未命名条目')}</span></label>`).join('')}</div>`;
            }).join('')}
        </div><label class="moments-field">分类绑定方式<select id="moments-batch-world-mode"><option value="follow">随分类更新（新条目自动纳入）</option><option value="snapshot">锁定当前条目</option></select></label><p class="moments-hint">选中的世界书只在开启相应开关时参与生成或保存。分类内容过多时会提示缩小范围。</p>`;
        el('moments-batch-world').hidden = true;
    }
    function readBatchOptions() {
        return Object.fromEntries(batchFeatures.map(([key]) => [key, !!el('moments-batch-options').querySelector(`[data-batch-feature="${key}"]`)?.checked]));
    }
    function updateBatchEstimate() {
        if (!state.batch || el('moments-batch-config').hidden) return;
        readBatchGroups();
        const groups = state.batch.groups;
        const total = groups.reduce((sum, group) => sum + (Number.isInteger(group.count) && group.count > 0 ? group.count : 0), 0);
        const calls = groups.reduce((sum, group) => {
            const counts = new Map();
            batchPeople(group).forEach((_, index) => {
                const person = batchPerson(group, index);
                const key = JSON.stringify([person.gender, person.relationship]);
                counts.set(key, (counts.get(key) || 0) + 1);
            });
            return sum + [...counts.values()].reduce((count, amount) => count + Math.ceil(amount / 4), 0);
        }, 0);
        const options = readBatchOptions();
        const images = total * (Number(options.avatar) + Number(options.cover));
        batchStatus(`合计 ${total} 人，预计至少 ${calls} 次文本请求${images ? `、${images} 次图片请求` : ''}。失败或重生成会增加请求次数。`);
    }
    function readBatchWorld() {
        const box = el('moments-batch-world');
        const categories = [...box.querySelectorAll('[data-batch-world-category]:checked')].map(node => node.dataset.batchWorldCategory);
        const selected = [...box.querySelectorAll('[data-batch-world-item]:checked')].map(node => node.dataset.batchWorldItem);
        const excluded = [...box.querySelectorAll('[data-batch-world-item]:not(:checked)')].filter(node => categories.some(path => node.dataset.categoryPath === path || node.dataset.categoryPath.startsWith(path + '/'))).map(node => node.dataset.batchWorldItem);
        const mode = el('moments-batch-world-mode').value;
        return { mode, categoryPaths: mode === 'follow' ? categories : [], itemIds: mode === 'snapshot' ? selected : selected.filter(idValue => {
            const book = (db.worldBooks || []).find(item => item.id === idValue);
            return book && !categories.some(path => worldCategoryPath(book.category) === path || worldCategoryPath(book.category).startsWith(path + '/'));
        }), excludedItemIds: mode === 'follow' ? excluded : [], inheritOwner: !!box.querySelector('[data-batch-world-inherit]')?.checked };
    }
    function booksForBatch(ownerId, binding) {
        const owner = (db.characters || []).find(c => c.id === ownerId);
        const ids = new Set([...(binding.itemIds || []), ...(binding.inheritOwner ? owner?.worldBookIds || [] : [])]);
        const paths = binding.categoryPaths || [];
        return (db.worldBooks || []).filter(book => !book.disabled && !binding.excludedItemIds.includes(book.id) && (ids.has(book.id) || paths.some(path => worldCategoryPath(book.category) === path || worldCategoryPath(book.category).startsWith(path + '/'))));
    }
    function batchWorldBinding(ownerId, world) {
        if (world.mode === 'follow') return { ...world, categoryPaths: [...world.categoryPaths], itemIds: [...world.itemIds], excludedItemIds: [...world.excludedItemIds] };
        return { mode: 'snapshot', categoryPaths: [], itemIds: booksForBatch(ownerId, world).map(book => book.id), excludedItemIds: [], inheritOwner: false };
    }
    function batchPrompt(group, amount, batch) {
        const owner = (db.characters || []).find(c => c.id === group.ownerCharId);
        const used = [...contactsFor(group.ownerCharId).map(c => person(c.actorId)?.name), ...batch.candidates.filter(c => c.ownerCharId === group.ownerCharId).map(c => c.name)].filter(Boolean);
        const usedRelations = [...contactsFor(group.ownerCharId).map(c => c.relationship), ...batch.candidates.filter(c => c.ownerCharId === group.ownerCharId).map(c => c.relationship)].filter(Boolean);
        const books = batch.options.worldReference ? booksForBatch(group.ownerCharId, batch.world) : [];
        const world = books.map(book => `【${book.name || '世界书'}】${book.content || ''}`).join('\n');
        if (world.length > 18000) throw new Error('所选世界书内容超过本次生成容量，请缩小选择范围');
        const keys = ['name', 'relationship', 'gender', 'persona', 'signature', ...Object.keys(batchExtraFields).filter(key => batch.options[key]), ...(batch.options.avatar ? ['avatarPrompt'] : []), ...(batch.options.cover ? ['coverPrompt'] : [])];
        const shape = Object.fromEntries(keys.map(key => [key, '文字']));
        return `请为角色“${owner.realName || owner.remarkName}”生成恰好 ${amount} 位不同的人脉。角色人设：${String(owner.persona || '无').slice(0, 5000)}。
指定关系：${group.relationship || '自由安排'}；指定性别：${group.gender || '不限定'}；补充要求：${group.note || '无'}。
已有人脉和本次已生成姓名：${used.join('、') || '无'}；已有关系：${usedRelations.join('、') || '无'}。${group.reservedRelations?.length ? `其他待生成人物已指定的亲属身份：${[...new Set(group.reservedRelations)].join('、')}，本次未指定该身份的人不可占用。` : ''}不要重名或重复唯一亲属身份。关系必须是“新人物相对于所属角色”的方向；若指定了关系或性别，原样填写对应字段并让人设严格一致。遇到既有设定冲突时不要擅自改写原设定，返回无法满足的原因。
基本人设包含身份、日常和说话风格，不得自动编造具体共同经历、秘密、人物间关系或未来事件。
${batch.options.experience ? '共同经历：仅在 experience 中写具体往事与时间。' : ''}
${batch.options.network ? '人脉关系网：仅在 network 中写此人认识谁以及双方关系，不得与既有设定冲突。' : ''}
${batch.options.life ? '独立生活：仅在 life 中写本人的目标、近况和活动习惯。' : ''}
${batch.options.conflict ? '人际矛盾：仅在 conflict 中写有缘由的分歧，允许没有冲突。' : ''}
${batch.options.scenes ? '出现场景：仅在 scenes 中写自然参与互动的可能场景，不要预设必然发生。' : ''}
${batch.options.voice ? '口吻试听：仅在 voice 中写一条动态、一句评论及一句对角色说的话，供审核，不会自动发布。' : ''}
${batch.options.reveal ? '信息逐渐揭示：仅在 reveal 中写公开与非公开信息的界限。' : ''}
${batch.options.gap ? '人脉空白分析：仅在 gap 中简要说明此人如何补足该角色已有生活圈。' : ''}
${batch.options.avatar ? 'avatarPrompt 写适合单人头像的图像提示词，不能使用真实人物肖像。' : ''}
${batch.options.cover ? 'coverPrompt 写适合此人主页背景的场景图提示词。' : ''}
${batch.options.worldReference ? '可参考以下世界书，不得违背：\n' + world : ''}
只返回严格 JSON 对象：{"contacts":[${JSON.stringify(shape)}]}，不要 Markdown。若条件确实无法满足，返回 {"contacts":[],"reason":"原因"}。`;
    }
    function normalizeBatchCandidate(raw, group, groupIndex, batch, slotIndex = -1) {
        if (!raw || typeof raw !== 'object') return null;
        const name = String(raw.name || '').trim().slice(0, 40);
        const persona = String(raw.persona || '').trim().slice(0, 2000);
        if (!name || !persona) return null;
        const returnedGender = String(raw.gender || '').trim();
        const genderAliases = { 女: ['女', '女性', '女生'], 男: ['男', '男性', '男生'], 非二元: ['非二元', '非二元性别'] };
        if (group.gender && !(genderAliases[group.gender] || [group.gender]).includes(returnedGender)) return null;
        const returnedRelation = String(raw.relationship || '').trim();
        const relationAliases = { 母亲: ['母亲', '妈妈'], 父亲: ['父亲', '爸爸'] };
        if (group.relationship && !(relationAliases[group.relationship] || [group.relationship]).includes(returnedRelation) && !returnedRelation.includes(group.relationship)) return null;
        const uniqueRelation = uniqueBatchRelation(returnedRelation);
        if (!group.relationship && uniqueRelation && (group.reservedRelations?.includes(uniqueRelation) || contactsFor(group.ownerCharId).some(c => uniqueBatchRelation(c.relationship) === uniqueRelation) || batch.candidates.some(c => c.ownerCharId === group.ownerCharId && uniqueBatchRelation(c.relationship) === uniqueRelation))) return null;
        const names = [...contactsFor(group.ownerCharId).map(c => person(c.actorId)?.name), ...batch.candidates.filter(c => c.ownerCharId === group.ownerCharId).map(c => c.name)];
        if (names.some(value => String(value || '').trim().toLocaleLowerCase() === name.toLocaleLowerCase())) return null;
        const extras = Object.fromEntries(Object.keys(batchExtraFields).filter(key => batch.options[key]).map(key => [key, String(raw[key] || '').trim().slice(0, 1000)]));
        return { draftId: id('draft'), groupIndex, slotIndex, ownerCharId: group.ownerCharId, name, relationship: group.relationship || String(raw.relationship || '').trim().slice(0, 40), gender: group.gender || String(raw.gender || '').trim().slice(0, 30), persona, signature: String(raw.signature || '').trim().slice(0, 80), avatarPrompt: batch.options.avatar ? String(raw.avatarPrompt || '').trim().slice(0, 600) : '', coverPrompt: batch.options.cover ? String(raw.coverPrompt || '').trim().slice(0, 600) : '', avatar: '', cover: '', extras, selected: true, imageError: '', worldBookBinding: batch.options.worldBinding ? batchWorldBinding(group.ownerCharId, batch.world) : null };
    }
    async function generateBatchContacts(missingOnly = false) {
        const batch = state.batch;
        if (!batch || batch.busy) return;
        if (!missingOnly) {
            readBatchGroups();
            batch.options = readBatchOptions();
            batch.world = readBatchWorld();
            batch.candidates = [];
        }
        const total = batch.groups.reduce((sum, group) => sum + group.count, 0);
        if (!batch.groups.length || batch.groups.some(group => !Number.isInteger(group.count) || group.count < 1 || group.count > 50 || !(db.characters || []).some(c => c.id === group.ownerCharId)) || total > 50) { toast('每组至少 1 人，全部合计最多 50 人'); return; }
        if (batch.groups.some(group => batchPeople(group).some(person => person.customGenderEmpty))) { toast('请填写自定义性别'); return; }
        if ((batch.options.worldReference || batch.options.worldBinding) && batch.groups.some(group => !booksForBatch(group.ownerCharId, batch.world).length)) { toast('请为每个目标角色选择可用的世界书'); return; }
        batch.busy = true;
        batch.cancelled = false;
        batch.imageDone = batch.candidates.reduce((count, candidate) => count + Number(!!candidate.avatar && !!batch.options.avatar) + Number(!!candidate.cover && !!batch.options.cover), 0);
        el('moments-batch-generate').disabled = true;
        el('moments-batch-progress').querySelector('[data-batch-action="stop"]').disabled = false;
        batchStatus('正在生成人脉…');
        batchProgress(batch, '正在准备生成人脉…', '等待文本请求');
        let errorText = '';
        batch.errorText = '';
        try {
            for (let index = 0; index < batch.groups.length; index++) {
                const group = batch.groups[index];
                const pools = new Map();
                for (let slotIndex = 0; slotIndex < group.count; slotIndex++) {
                    if (batch.candidates.some(c => c.groupIndex === index && c.slotIndex === slotIndex)) continue;
                    const requestGroup = batchPerson(group, slotIndex);
                    const key = JSON.stringify([requestGroup.gender, requestGroup.relationship]);
                    if (!pools.has(key)) pools.set(key, { requestGroup, slots: [] });
                    pools.get(key).slots.push(slotIndex);
                }
                for (const pool of pools.values()) {
                    while (pool.slots.length && !batch.cancelled && state.batch === batch) {
                        const requestedSlots = pool.slots.slice(0, 4);
                        batchProgress(batch, `正在生成第 ${index + 1} 组的人脉…`, `本次请求 ${requestedSlots.length} 人，等待 AI 返回`);
                        const result = await askAI(batchPrompt(pool.requestGroup, requestedSlots.length, batch), charActor(pool.requestGroup.ownerCharId));
                        if (batch.cancelled || state.batch !== batch) break;
                        const before = batch.candidates.length;
                        const returned = Array.isArray(result.contacts) ? result.contacts : [];
                        requestedSlots.forEach((slotIndex, offset) => {
                            const candidate = normalizeBatchCandidate(returned[offset], pool.requestGroup, index, batch, slotIndex);
                            if (candidate) batch.candidates.push(candidate);
                        });
                        pool.slots = pool.slots.filter(slotIndex => !batch.candidates.some(c => c.groupIndex === index && c.slotIndex === slotIndex));
                        batchProgress(batch, `已生成 ${batch.candidates.length} / ${total} 人`, pool.slots.length ? '正在准备余下人脉' : '本组请求已完成');
                        if (batch.candidates.length === before) { errorText = String(result.reason || '本组未返回有效人脉'); break; }
                    }
                }
            }
            if (batch.cancelled || state.batch !== batch) return;
            el('moments-batch-config').hidden = true;
            el('moments-batch-review').hidden = false;
            renderBatchCandidates();
            if (batch.options.avatar || batch.options.cover) {
                for (const [candidateIndex, candidate] of batch.candidates.entries()) {
                    if (batch.cancelled || state.batch !== batch) return;
                    if (batch.options.avatar && !candidate.avatar) {
                        batchProgress(batch, `正在生成${candidate.name}的头像…`, `图片 ${candidateIndex + 1} / ${batch.candidates.length}`);
                        await generateBatchImage(candidate, 'avatar');
                        batch.imageDone++;
                    }
                    if (batch.cancelled || state.batch !== batch) return;
                    if (batch.options.cover && !candidate.cover) {
                        batchProgress(batch, `正在生成${candidate.name}的背景…`, `图片 ${candidateIndex + 1} / ${batch.candidates.length}`);
                        await generateBatchImage(candidate, 'cover');
                        batch.imageDone++;
                    }
                }
            }
            if (errorText) { batch.errorText = errorText; batchStatus(`部分生成未完成：${errorText}`, true); }
            else renderBatchCandidates();
        } catch (error) {
            console.error('批量生成人脉失败', error);
            errorText = error.message || '生成失败';
            if (batch.candidates.length) {
                el('moments-batch-config').hidden = true;
                el('moments-batch-review').hidden = false;
                renderBatchCandidates();
                batch.errorText = errorText;
                batchStatus(`部分生成未完成：${errorText}`, true);
            } else batchStatus(errorText);
        } finally {
            batch.busy = false;
            if (state.batch === batch) {
                el('moments-batch-progress').hidden = true;
                el('moments-batch-generate').disabled = false;
                if (batch.cancelled) {
                    if (batch.candidates.length) {
                        el('moments-batch-config').hidden = true;
                        el('moments-batch-review').hidden = false;
                        batch.errorText = '已停止生成，可检查并保存现有草稿或补齐缺少';
                    } else batchStatus('已停止生成，可调整配置后重试');
                }
                renderBatchCandidates();
                if (errorText && !batch.candidates.length) toast(errorText);
            }
        }
    }
    function renderBatchCandidates() {
        const batch = state.batch;
        if (!batch) return;
        const total = batch.groups.reduce((sum, group) => sum + group.count, 0);
        batchStatus(`请求 ${total} 人 · 已生成 ${batch.candidates.length} 人 · 已选 ${batch.candidates.filter(c => c.selected).length} 人${batch.busy ? ' · 处理中…' : ''}${batch.errorText ? ' · 部分未完成：' + batch.errorText : ''}`, true);
        el('moments-batch-candidates').inert = batch.busy;
        el('moments-batch-review').querySelector('[data-batch-action="retry-missing"]').hidden = batch.candidates.length >= total || batch.busy;
        el('moments-batch-save').disabled = batch.busy || !batch.candidates.some(c => c.selected);
        el('moments-batch-candidates').innerHTML = batch.candidates.map(candidate => {
            const owner = (db.characters || []).find(c => c.id === candidate.ownerCharId);
            return `<div class="moments-batch-candidate" data-draft-id="${esc(candidate.draftId)}">
                <div class="moments-batch-candidate-head"><input type="checkbox" data-batch-select="${esc(candidate.draftId)}" ${candidate.selected ? 'checked' : ''} aria-label="选择${esc(candidate.name)}"><strong>${esc(candidate.name)} · ${esc(owner?.realName || owner?.remarkName || '角色')}的人脉</strong><button type="button" data-batch-action="regenerate" data-draft-id="${esc(candidate.draftId)}" ${batch.busy ? 'disabled' : ''}>重生成</button><button type="button" data-batch-action="remove" data-draft-id="${esc(candidate.draftId)}" ${batch.busy ? 'disabled' : ''}>移除</button></div>
                <div class="moments-batch-row"><label class="moments-field">姓名<input data-batch-edit="name" maxlength="40" value="${esc(candidate.name)}"></label><label class="moments-field">性别<input data-batch-edit="gender" maxlength="30" value="${esc(candidate.gender)}"></label><label class="moments-field">关系<input data-batch-edit="relationship" maxlength="40" value="${esc(candidate.relationship)}"></label></div>
                <label class="moments-field">人设<textarea data-batch-edit="persona" maxlength="2000">${esc(candidate.persona)}</textarea></label>
                <label class="moments-field">个人签名<input data-batch-edit="signature" maxlength="80" value="${esc(candidate.signature)}"></label>
                ${Object.entries(candidate.extras).map(([key, value]) => `<details class="moments-batch-extra"><summary>${batchExtraFields[key]}</summary><textarea data-batch-extra="${key}" maxlength="1000">${esc(value)}</textarea></details>`).join('')}
                ${candidate.worldBookBinding ? `<small class="moments-hint">已设置世界书绑定：${esc(candidate.worldBookBinding.mode === 'follow' ? '随分类更新' : '锁定当前条目')}</small>` : ''}
                ${batch.options.avatar ? `<div class="moments-batch-row"><label class="moments-field">头像提示词<input data-batch-edit="avatarPrompt" maxlength="600" value="${esc(candidate.avatarPrompt)}"></label>${candidate.avatar ? `<img class="moments-batch-preview" src="${esc(candidate.avatar)}" alt="${esc(candidate.name)}头像">` : ''}<button type="button" data-batch-action="image-avatar" data-draft-id="${esc(candidate.draftId)}" ${batch.busy ? 'disabled' : ''}>${candidate.avatar ? '重生成头像' : '生成头像'}</button></div>` : ''}
                ${batch.options.cover ? `<div class="moments-batch-row"><label class="moments-field">背景提示词<input data-batch-edit="coverPrompt" maxlength="600" value="${esc(candidate.coverPrompt)}"></label>${candidate.cover ? `<img class="moments-batch-preview" src="${esc(candidate.cover)}" alt="${esc(candidate.name)}背景">` : ''}<button type="button" data-batch-action="image-cover" data-draft-id="${esc(candidate.draftId)}" ${batch.busy ? 'disabled' : ''}>${candidate.cover ? '重生成背景' : '生成背景'}</button></div>` : ''}
                ${candidate.imageError ? `<small class="moments-hint">${esc(candidate.imageError)}</small>` : ''}
            </div>`;
        }).join('') || '<p class="moments-hint">还没有有效人脉，请返回配置调整要求。</p>';
    }
    async function generateBatchImage(candidate, kind) {
        const batch = state.batch;
        if (!batch || !batch.options[kind]) return;
        const prompt = String(candidate[kind + 'Prompt'] || (kind === 'avatar' ? `单人头像，${candidate.name}，${candidate.persona}` : `人物主页背景，${candidate.name}的生活环境，${candidate.persona}`)).slice(0, 700);
        try {
            batchStatus(`正在为${candidate.name}生成${kind === 'avatar' ? '头像' : '背景'}…`, true);
            const result = await generateImageDispatch(prompt);
            if (!result?.imageUrl) throw new Error('生图接口没有返回图片');
            const blob = await fetch(result.imageUrl).then(response => response.blob());
            const data = typeof compressImage === 'function' ? await compressImage(blob, { quality: 0.82, maxWidth: kind === 'avatar' ? 400 : 1200, maxHeight: kind === 'avatar' ? 400 : 800 }) : await fileToDataUrl(blob);
            if (state.batch !== batch || batch.cancelled) return;
            candidate[kind] = data;
            candidate.imageError = '';
        } catch (error) {
            candidate.imageError = `${kind === 'avatar' ? '头像' : '背景'}生成失败：${error.message || error}。文字草稿仍可保存。`;
        }
        if (state.batch === batch && !batch.cancelled) renderBatchCandidates();
    }
    async function regenerateBatchCandidate(draftId) {
        const batch = state.batch;
        const previous = batch?.candidates.find(c => c.draftId === draftId);
        if (!previous || batch.busy) return;
        const group = batch.groups[previous.groupIndex];
        batch.busy = true;
        batch.candidates = batch.candidates.filter(c => c !== previous);
        renderBatchCandidates();
        try {
            const requestGroup = previous.slotIndex >= 0 ? batchPerson(group, previous.slotIndex) : group;
            const result = await askAI(batchPrompt(requestGroup, 1, batch) + `\n不要使用刚才的姓名“${previous.name}”，请给出另一个不同候选人。`, charActor(requestGroup.ownerCharId));
            if (state.batch !== batch || batch.cancelled) return;
            const candidate = normalizeBatchCandidate(result.contacts?.[0], requestGroup, previous.groupIndex, batch, previous.slotIndex);
            if (!candidate) throw new Error('没有返回符合条件的新人脉');
            batch.candidates.push(candidate);
            if (batch.options.avatar) await generateBatchImage(candidate, 'avatar');
            if (batch.options.cover) await generateBatchImage(candidate, 'cover');
        } catch (error) {
            batch.candidates.push(previous);
            toast(error.message || '重生成失败，原草稿已保留');
        } finally {
            batch.busy = false;
            if (state.batch === batch) renderBatchCandidates();
        }
    }
    async function saveBatchContacts() {
        const batch = state.batch;
        if (!batch || batch.busy) return;
        const selected = batch.candidates.filter(c => c.selected);
        if (!selected.length) { toast('请先选择要保存的人脉'); return; }
        const used = new Set();
        for (const candidate of selected) {
            const name = candidate.name.trim();
            if (!name || !candidate.persona.trim()) { toast('每位选中人脉都需要姓名和人设'); return; }
            const key = candidate.ownerCharId + ':' + name.toLocaleLowerCase();
            if (used.has(key) || contactsFor(candidate.ownerCharId).some(c => person(c.actorId)?.name?.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) { toast(`人脉姓名重复：${name}`); return; }
            used.add(key);
        }
        const m = ensure();
        const previous = m.contacts;
        const added = selected.map(c => ({ id: id('contact'), actorId: id('npc'), kind: 'npc', ownerCharId: c.ownerCharId, name: c.name.trim(), relationship: c.relationship.trim(), gender: c.gender.trim(), persona: c.persona.trim(), signature: c.signature.trim(), avatar: c.avatar, cover: c.cover, ...(Object.keys(c.extras).length ? { batchExtras: { ...c.extras } } : {}), ...(c.worldBookBinding ? { worldBookBinding: c.worldBookBinding } : {}), enabled: true, preferences: {}, mayInteract: false, mayPost: false, mayStory: false }));
        batch.busy = true;
        el('moments-batch-save').disabled = true;
        m.contacts = [...previous, ...added];
        try {
            if (!await persist()) throw new Error('保存失败');
            closeBatchDialog();
            renderContacts();
            toast(`已保存 ${added.length} 位人脉`);
        } catch (error) {
            m.contacts = previous;
            toast(error.message || '保存失败，草稿仍在');
        } finally {
            batch.busy = false;
            if (state.batch === batch) renderBatchCandidates();
        }
    }
    async function generateContact() {
        const owner = (db.characters || []).find(c => c.id === currentChatId);
        if (!owner) return;
        const button = el('moments-ai-person-btn');
        button.disabled = true;
        button.textContent = '生成中…';
        try {
            const existing = contactsFor(owner.id).map(c => person(c.actorId)?.name).filter(Boolean).join('、');
            const result = await askAI(`请为角色“${owner.realName || owner.remarkName}”设计一位可信、能长期参与动态互动的人脉。角色人设：${owner.persona || '无'}。已有人脉：${existing || '无'}。避免与已有姓名重复，关系要具体，人物有独立生活和表达习惯。签名是此人愿意公开在主页的一句话，不要暴露私聊或秘密。只返回 JSON：{"name":"姓名或昵称","relationship":"与角色关系","persona":"80到180字的人设，包括日常生活、说话风格、对角色的态度","signature":"8到40字的个人签名"}。`, charActor(owner.id));
            openEditor('npc', { name: String(result.name || '').slice(0, 40), relationship: String(result.relationship || '').slice(0, 40), persona: String(result.persona || '').slice(0, 1000), signature: String(result.signature || '').slice(0, 80) });
            state.editor.itemId = null;
            toast('已生成，请检查后保存');
        } catch (error) { console.error('生成人脉失败', error); toast(error.message || '人脉生成失败'); }
        finally { button.disabled = false; button.textContent = 'AI 生成人脉'; }
    }
    function openFriendDialog(actorId) {
        const contact = ensure().contacts.find(c => c.actorId === actorId && c.kind === 'npc');
        if (!contact || findCharacter(actorId)) return;
        state.friendActorId = actorId;
        el('moments-friend-title').textContent = `添加 ${contact.name} 为好友`;
        el('moments-friend-description').textContent = '对方会按自己的人设决定同意、拒绝或暂时忽略。';
        el('moments-friend-dialog').hidden = false;
    }
    async function resolveFriendRequest(request, task = null) {
        const contact = ensure().contacts.find(c => c.actorId === request.actorId && c.kind === 'npc');
        if (!contact || request.status !== 'pending') return;
        try {
            const owner = person(charActor(contact.ownerCharId));
            const applicant = userIdentity(request.userPersonaId || knownPersonaId(contact.actorId));
            const result = await askAI(`你是${aiName(contact.actorId, contact.actorId)}。人设：${contact.persona}。你当前主页签名：${contact.signature || '未设置'}。你与${aiName(charActor(contact.ownerCharId), contact.actorId)}的关系：${contact.relationship || '熟人'}。${aiName('user', contact.actorId, applicant.personaId)}申请与你成为好友并开启私聊。${promptRule('friendDecision')}只返回 JSON：{"decision":"accept/reject/ignore","tellOwner":false,"reason":"简短内心原因"}。`, contact.actorId, task);
            request.raw = result.__rawResponse || '';
            request.checkedAt = Date.now();
            request.tellOwner = result.tellOwner === true;
            if (result.decision === 'accept') {
                request.status = 'accepted';
                const known = applicant;
                const char = { id: id('moments_friend'), momentsActorId: contact.actorId, realName: contact.name, remarkName: contact.name, avatar: contact.avatar || '', persona: contact.persona || '', momentsProfile: { nickname: contact.nickname || '', signature: contact.signature || '', cover: contact.cover || '' }, history: [], myName: known.baseName || known.name, myAvatar: known.avatar, myPersona: known.persona, source: 'moments', momentsSettings: { postEnabled: contact.mayPost === true, storyEnabled: contact.mayStory === true, browseEnabled: contact.mayInteract === true, interactEnabled: contact.mayInteract === true, contactsEnabled: false, nicknameAwareness: nicknameSetting(contact.actorId, 'nicknameAwareness') ? 'on' : 'off', selfRename: nicknameSetting(contact.actorId, 'selfRename') ? 'on' : 'off', imageMode: 'off', voiceMode: 'off' } };
                db.characters.push(char);
                ensure().characterPersonaIds[char.id] = known.personaId;
                await saveData();
                if (typeof renderChatList === 'function') renderChatList();
                if (typeof renderContactList === 'function') renderContactList();
                toast(`${contact.name}已同意好友申请`);
            } else if (result.decision === 'reject') { request.status = 'rejected'; toast(`${contact.name}拒绝了好友申请`); }
            else request.status = 'pending';
            if (request.tellOwner && result.decision !== 'ignore') request.ownerMessage = `${contact.name}${result.decision === 'accept' ? '同意' : '拒绝'}了用户的好友申请`;
            await persist();
            if (state.profileActorId === request.actorId && el('moments-profile-screen').classList.contains('active')) renderProfile(request.actorId);
        } catch (error) { request.error = String(error.message || error); await persist(); console.error('人脉好友判断失败', error); if (task?.status === 'running') throw error; }
    }
    async function sendFriendRequest() {
        const actorId = state.friendActorId;
        const contact = ensure().contacts.find(c => c.actorId === actorId && c.kind === 'npc');
        if (!contact || findCharacter(actorId) || ensure().friendRequests.some(r => r.actorId === actorId && r.status === 'pending')) return;
        const request = { id: id('friend_request'), actorId, userPersonaId: knownPersonaId(actorId), status: 'pending', createdAt: Date.now(), checkedAt: 0 };
        ensure().friendRequests.push(request);
        await persist();
        el('moments-friend-dialog').hidden = true;
        renderProfile(actorId);
        toast('好友申请已发送');
        resolveFriendRequest(request);
    }
    function actorMayWatch(actorId) {
        const character=findCharacter(actorId);
        if(character)return characterSettings(character).watchEnabled;
        const contact=ensure().contacts.find(c=>c.actorId===actorId&&c.kind==='npc'), owner=contact&&(db.characters||[]).find(c=>c.id===contact.ownerCharId);
        return !!(contact&&contact.enabled!==false&&owner&&characterSettings(owner).contactsEnabled&&(!controls||controls.preferences(actorId).watchEnabled));
    }
    function viewStatus(postId,actorId,status,summary,task=null) {
        const post=findPost(postId);if(!post)return null;
        post.viewResults||=[];
        let log=task&&post.viewResults.find(l=>l.taskId===task.id);
        if(!log){log={actorId,createdAt:Date.now(),raw:'',taskId:task?.id||'',reminded:post.reminderIds?.includes(actorId)===true};post.viewResults.push(log);}
        Object.assign(log,{status,summary});
        renderPostAfterChange(postId);
        if(state.resultPostId===postId&&!el('moments-result-dialog').hidden)showResult(postId);
        return log;
    }
    function actorMayInteract(actorId) {
        const character = findCharacter(actorId);
        if (character) return characterSettings(character).interactEnabled;
        const contact = ensure().contacts.find(c => c.actorId === actorId && c.kind === 'npc');
        const owner = contact && (db.characters || []).find(c => c.id === contact.ownerCharId);
        return !!(contact&&contact.enabled!==false&&owner&&characterSettings(owner).contactsEnabled&&(controls?controls.settings(actorId).actions.interact:contact.mayInteract));
    }
    async function applyActorAction(actorId, action, task = null) {
        const post = findPost(String(action.postId || ''));
        if (!post || !visibleTo(post, actorId) || (post.kind === 'story' && post.expiresAt <= Date.now())) return { ok: false, reason: '无权查看或动态已失效' };
        if (!memoryAllowed(post.id, actorId)) return { ok: false, reason: '这条动态的记忆已清除' };
        if (controls && (!controls.valid(task) || post.controlsPaused)) return { ok: false, reason: '动态任务已暂停或内容已变化' };
        if (controls && action.type !== 'view' && !controls.settings(actorId, post).actions.interact) return { ok: false, reason: '当前设置未允许点赞评论动作' };
        if (action.type === 'view') {
            post.seenBy ||= {};
            const firstView = !post.seenBy[actorId];
            const previousSeen=post.seenBy[actorId];
            post.seenBy[actorId] = Date.now();
            const event = firstView ? recordActivity('view', actorId, post, '', []) : null;
            if(!await persist()){if(previousSeen)post.seenBy[actorId]=previousSeen;else delete post.seenBy[actorId];if(event)ensure().activityEvents.splice(ensure().activityEvents.indexOf(event),1);return {ok:false,reason:'观看记录保存失败'};}
            await deliverActivity(event);
            return { ok: true, post };
        }
        if (!actorMayInteract(actorId)) return { ok: false, reason: '此对象关闭了点赞和评论' };
        const permissions=controls?.settings(actorId,post).actions||characterSettings(findCharacter(actorId)||{momentsSettings:{interactEnabled:true}});
        if(action.type==='like'&&permissions.like===false)return {ok:false,reason:'此对象设置为不点赞'};
        if(action.type==='comment'&&(action.replyTo?permissions.reply===false:permissions.comment===false))return {ok:false,reason:action.replyTo?'此对象设置为不回复评论':'此对象设置为不发表评论'};
        if (!post.seenBy?.[actorId] && post.authorId !== actorId) return { ok: false, reason: '尚未观看这条动态' };
        const eventStart = ensure().activityEvents.length;
        const before={likes:[...(post.likes||[])],comments:[...(post.comments||[])],notifications:ensure().notifications.slice(),pending:task?.pendingComments||0};
        if (action.type === 'like') {
            post.likes ||= [];
            if (!post.likes.includes(actorId)) { post.likes.push(actorId); notice(post.authorId, actorId, post.id, '赞了你的动态'); recordActivity('like', actorId, post, '', [post.authorId]); }
        } else if (action.type === 'comment') {
            const replyTo = String(action.replyTo || '');
            if (replyTo && !post.comments?.some(c => c.id === replyTo && !c.deletedAt && canSeeInteraction(post, actorId, c.authorId, c.authorPersonaId))) return { ok: false, reason: '要回复的评论不可见' };
            const sticker = action.stickerId ? stickerSnapshot(action.stickerId, actorId) : null;
            if (action.stickerId && !sticker) return { ok: false, reason: '表情包不可用' };
            const blocked=controls?.commentBlockReason(post,actorId,replyTo,task);if(blocked)return {ok:false,reason:blocked};
            if (!addComment(post, actorId, String(action.text || '').slice(0, 300), replyTo, [], sticker, task)) return { ok: false, reason: '评论为空或回复对象已失效' };
        } else return { ok: false, reason: '未知操作' };
        if(!await persist()){post.likes=before.likes;post.comments=before.comments;ensure().notifications=before.notifications;ensure().activityEvents.splice(eventStart);if(task)task.pendingComments=before.pending;return {ok:false,reason:'互动保存失败，未写入评论或点赞'};}
        for (const event of ensure().activityEvents.slice(eventStart)) await deliverActivity(event);
        if (controls && action.type === 'comment') await controls.commentEvents(post, post.comments.filter(c => ensure().activityEvents.slice(eventStart).some(e => e.commentId === c.id)), task);
        renderPostAfterChange(post.id);
        return { ok: true, post };
    }
    async function deleteActorPost(actorId, postId) {
        const post = findPost(postId);
        if (!post || post.authorId !== actorId || !findCharacter(actorId)) return { ok: false, reason: '只能删除自己发布的动态' };
        const m = ensure();
        const previousPosts = m.posts;
        const previousNotifications = m.notifications;
        const event = recordActivity('delete', actorId, post);
        m.posts = m.posts.filter(item => item.id !== postId);
        m.notifications = m.notifications.filter(item => item.postId !== postId);
        if (!await persist()) {
            m.posts = previousPosts;
            m.notifications = previousNotifications;
            m.activityEvents.pop();
            return { ok: false, reason: '删除保存失败' };
        }
        await deliverActivity(event);
        renderFeed();
        if (state.currentPostId === postId && el('moments-detail-screen').classList.contains('active')) switchScreen('moments-screen');
        return { ok: true };
    }
    async function viewPostForActor(postId,actorId,immediate=false,feedback=null,task=null) {
        const post=findPost(postId);if(!post||!memoryAllowed(postId,actorId)||!visibleTo(post,actorId)||!person(actorId))return;
        if(controls)task||=controls.context(immediate?'view':'chatPrep',[actorId],post);
        if(controls&&!controls.allowed(actorId,task.source,post)){viewStatus(postId,actorId,'blocked','未观看：此对象的观看设置已关闭',task);await persist();return;}
        const log=viewStatus(postId,actorId,'running',`${person(actorId).name}正在观看…`,task);
        try{
            if(!await persist())throw new Error('观看记录保存失败，未发送请求');
            const comments=(post.comments||[]).filter(c=>!c.deletedAt&&canSeeInteraction(post,actorId,c.authorId,c.authorPersonaId)).slice(-12);
            const allowed=controls?.settings(actorId,post).actions||{like:actorMayInteract(actorId),comment:actorMayInteract(actorId),reply:actorMayInteract(actorId)};
            const result=await askAI(`你现在已经打开这条${post.kind==='story'?'Story':'动态'}：${postContextText(post,5000)}。现有可见评论：${comments.map(c=>`${c.id} ${aiName(c.authorId,actorId,c.authorPersonaId||profilePersonaForPost(post))}：${commentSummary(c)}`).join('；')||'无'}。${promptRule('viewDecision')}允许动作：${allowed.like?'点赞、':''}${allowed.comment?'发表评论、':''}${allowed.reply?'回复评论':''}；未允许的动作留空。表情包：${stickerChoices(actorId)||'无'}。${bilingualContent.prompt(findCharacter(actorId),'moments','角色自己的评论文字')}只返回 JSON：{"like":false,"comment":"可留空","replyTo":"可见评论ID，可留空","stickerId":"可用表情ID，可留空","thought":"简短说明本次决定"}。`,actorId,task);
            log.raw=result.__rawResponse||'';
            if(findPost(postId)!==post)throw new Error('动态已删除');
            const viewed=await applyActorAction(actorId,{type:'view',postId},task);if(!viewed.ok)throw new Error(viewed.reason);
            const actions=[], blocked=[];
            if(result.like===true){const applied=await applyActorAction(actorId,{type:'like',postId},task);if(applied.ok)actions.push('点赞');else blocked.push(applied.reason);}
            if(String(result.comment||'').trim()||result.stickerId){const applied=await applyActorAction(actorId,{type:'comment',postId,text:result.comment,replyTo:result.replyTo,stickerId:result.stickerId},task);if(applied.ok)actions.push(result.replyTo?'回复评论':'评论');else blocked.push(applied.reason);}
            log.status=blocked.length?'blocked':'done';
            log.summary=`${person(actorId).name}已观看${actions.length?'，并'+actions.join('、'):blocked.length?'，互动未执行':'，选择不回应'}${blocked.length?'：'+[...new Set(blocked)].join('；'):''}`;
            log.decision=String(result.thought||'');
            if(!await persist())throw new Error('观看结果保存失败');
            if(feedback)feedback.action=actions.length?'浏览并互动':'浏览动态';
        }catch(error){
            const cancelled=controls&&!controls.valid(task);
            log.status=cancelled?'cancelled':'error';log.summary=`${person(actorId)?.name||'角色'}${cancelled?'观看已取消：动态或设置发生变化':'观看失败：'+(error.message||error)}`;
            log.raw=String(error.rawResponse||log.raw||error.message||error);
            if(feedback)feedback.error=error.message||'观看失败';
            await persist();renderPostAfterChange(postId);if(state.resultPostId===postId&&!el('moments-result-dialog').hidden)showResult(postId);
            if(task?.status==='running'&&!cancelled)throw error;
            return;
        }
        renderPostAfterChange(postId);if(state.resultPostId===postId&&!el('moments-result-dialog').hidden)showResult(postId);
    }
    function showResult(postId) {
        const post=findPost(postId);if(!post||post.authorId!=='user')return;
        state.resultPostId=postId;
        const logs=post.viewResults||[], subjects=(post.audienceIds||[]).filter(a=>a!=='user'&&person(a));
        const results=logs.length?logs.map(log=>`<div class="moments-view-result"><p>${esc(log.summary||log.status)}</p>${log.reminded?'<small class="moments-hint">已收到你的观看提醒</small>':''}${log.decision?`<p class="moments-hint">${esc(log.decision)}</p>`:''}${log.raw?`<details><summary>查看返回详情</summary><pre class="moments-result-log">${esc(log.raw)}</pre></details>`:''}</div>`).join(''):'<p class="moments-hint">'+(subjects.length?'观看正在安排中。':'这条动态仅自己可见。')+'</p>';
        el('moments-result-content').innerHTML=`<p class="moments-hint">${subjects.length} 位可见对象 · ${post.reminderIds?.length||0} 位收到提醒</p>${results}`;
        el('moments-result-dialog').hidden=false;
    }
    async function autonomousActivity(actorId, force = false, feedback = null, task = null) {
        const actor = person(actorId);
        if (!actor) return false;
        const character = findCharacter(actorId);
        const contact = ensure().contacts.find(c => c.actorId === actorId && c.kind === 'npc');
        const owner = contact && (db.characters || []).find(c => c.id === contact.ownerCharId);
        const settings = character ? characterSettings(character) : owner && characterSettings(owner).contactsEnabled && contact.enabled !== false ? controls?{...controls.preferences(actorId),interactEnabled:controls.settings(actorId).actions.interact}:{postEnabled:contact.mayPost,storyEnabled:contact.mayStory,browseEnabled:contact.mayInteract,interactEnabled:contact.mayInteract} : null;
        if (!settings || (!settings.postEnabled && !settings.storyEnabled && !settings.browseEnabled && !settings.interactEnabled && !nicknameSetting(actorId, 'selfRename'))) return false;
        if (controls) { task ||= controls.context(force ? 'manual' : 'timer', [actorId]); if (!controls.allowed(actorId, task.source)) return false; }
        const holder = character ? character.momentsSettings : contact;
        if (!controls && !force && Date.now() - (holder.lastActivityAt || 0) < 60 * 60 * 1000) return false;
        holder.lastActivityAt = Date.now();
        if (character) await saveCharacter(character.id); else await persist();
        const currentPosts = ensure().posts.filter(post => memoryAllowed(post.id, actorId) && visibleTo(post, actorId) && (post.kind !== 'story' || post.expiresAt > Date.now())).sort((a, b) => b.createdAt - a.createdAt);
        const browseable = settings.browseEnabled ? currentPosts.filter(post => post.authorId !== actorId && !post.seenBy?.[actorId]).slice(0, 8) : [];
        const interactable = settings.interactEnabled ? currentPosts.filter(post => (post.authorId === actorId || post.seenBy?.[actorId]) && (!controls || controls.commentAllowed(post, actorId))).slice(0, 8) : [];
        const ownPosts = currentPosts.filter(post => post.authorId === actorId).slice(0, 8);
        const mayRename = nicknameSetting(actorId, 'selfRename') && Date.now() - (holder.lastNicknameAt || 0) >= 24 * 60 * 60 * 1000;
        const configured = controls?.settings(actorId);
        const choices = ['none', ...(settings.postEnabled && (!controls || configured.actions.post && configured.requests.postContent && controls.publicationAllowed(actorId, 'post', task)) ? ['post'] : []), ...(settings.storyEnabled && (!controls || configured.actions.story && configured.requests.postContent && controls.publicationAllowed(actorId, 'story', task)) ? ['story'] : []), ...(mayRename && (!controls || configured.actions.rename) ? ['rename'] : []), ...(ownPosts.length && (!controls || configured.actions.delete) ? ['delete'] : []), ...(browseable.length && (!controls || configured.actions.browse) ? ['browse'] : []), ...(interactable.length && (!controls || configured.actions.interact) ? ['interact'] : [])];
        if (choices.length === 1) return false;
        try {
            const result = await askAI(`你是${aiName(actorId, actorId)}。人设：${actor.persona || '未提供'}。你当前主页签名：${actor.signature || '未设置'}。${contact ? `你与${aiName(charActor(contact.ownerCharId), actorId)}的关系：${contact.relationship || '熟人'}。` : ''}近期私聊和生活：${recentContextFor(actorId).history || '暂无'}。你亲历的动态操作：${activityContext(actorId) || '暂无'}。${promptRule('autonomy')}可选择：${choices.join('、')}。自己可删除的动态：${ownPosts.map(p => `${p.id} ${postSummary(p)}`).join('；') || '无'}。尚未看过、可选择浏览：${browseable.map(p => `${p.id} ${aiName(p.authorId, actorId, profilePersonaForPost(p))}，${p.kind === 'story' ? 'Story' : '动态'}，${readableTime(p.createdAt)}`).join('；') || '无'}。自己发布或已经看过、可选择互动：${interactable.map(p => `${p.id} ${aiName(p.authorId, actorId, profilePersonaForPost(p))}：${postSummary(p).slice(0, 80)}`).join('；') || '无'}。你尚不知道未浏览帖子的正文。改名应偶尔自然发生，不要每次检查都改；只能改自己的动态网名。只返回 JSON：{"action":"选择项","postId":"浏览、互动或删除时填写对应ID","nickname":"改名时填写新网名，其他操作留空","reason":"简短原因"}。` + (configured?.publish.habit ? `\n用户设置的发布习惯：${configured.publish.habit}` : ''), actorId, task);
            if (!choices.includes(result.action)) { if (feedback) feedback.error = '返回动作不在用户允许范围内'; return true; }
            if (result.action === 'rename' && mayRename) {
                const changed = await changeNickname(actorId, '', result.nickname, true);
                if (feedback) { if (changed.ok) feedback.action = changed.unchanged ? '' : '修改动态网名'; else feedback.error = changed.reason; }
            } else if (result.action === 'post' && settings.postEnabled) {
                if (await generatePost(actorId, 'post', false, feedback, task) && feedback) feedback.action = '发布动态';
            } else if (result.action === 'story' && settings.storyEnabled) {
                if (await generatePost(actorId, 'story', false, feedback, task) && feedback) feedback.action = '发布 Story';
            } else if (result.action === 'delete' && ownPosts.some(post => post.id === result.postId)) {
                const applied = await deleteActorPost(actorId, result.postId);
                if (feedback) { if (applied.ok) feedback.action = '删除自己的动态'; else feedback.error = applied.reason; }
            } else if (result.action === 'browse' && browseable.some(p => p.id === result.postId)) await viewPostForActor(result.postId, actorId, false, feedback, task);
            else if (result.action === 'interact' && interactable.some(p => p.id === result.postId)) await viewPostForActor(result.postId, actorId, false, feedback, task);
            else if (result.action !== 'none' && feedback) feedback.error = 'API 返回了无法执行的自主动态操作';
        } catch (error) { if (feedback) feedback.error = error.message || '检查失败'; console.error('自主动态检查失败', error); if (task?.status === 'running') throw error; }
        return true;
    }
    async function catchUp(force = false) {
        const summary = { busy: false, checked: 0, actions: [], errors: [] };
        if (state.running) { summary.busy = true; return summary; }
        state.running = true;
        try {
            const pending = ensure().friendRequests.find(request => request.status === 'pending' && (!request.checkedAt || Date.now() - request.checkedAt > 24 * 60 * 60 * 1000));
            if (pending) await resolveFriendRequest(pending);
            const actors = new Set();
            (db.characters || []).forEach(char => {
                actors.add(charActor(char.id));
                if (characterSettings(char).contactsEnabled) activeContactsFor(char.id).filter(c => c.kind === 'npc').forEach(c => actors.add(c.actorId));
            });
            let checked = 0;
            for (const actorId of [...actors].sort((a, b) => (findCharacter(a)?.momentsSettings?.lastActivityAt || ensure().contacts.find(c => c.actorId === a)?.lastActivityAt || 0) - (findCharacter(b)?.momentsSettings?.lastActivityAt || ensure().contacts.find(c => c.actorId === b)?.lastActivityAt || 0))) {
                const holder = findCharacter(actorId)?.momentsSettings || ensure().contacts.find(c => c.actorId === actorId);
                if (!force && Date.now() - (holder?.lastActivityAt || 0) < 60 * 60 * 1000) continue;
                const feedback = {};
                if (await autonomousActivity(actorId, force, feedback)) {
                    summary.checked = ++checked;
                    if (feedback.action) summary.actions.push(feedback.action);
                    if (feedback.error) summary.errors.push(feedback.error);
                    if (checked >= 2) break;
                }
            }
        } finally { state.running = false; }
        return summary;
    }
    function isChatLinked(charId) {
        const character = findCharacter(charActor(charId));
        return !character || characterSettings(character).chatLinked !== false;
    }
    function publicationEnabled(actorId, kind, source = 'chat') {
        if (controls) return controls.publicationEnabled(actorId, kind, source);
        const character = findCharacter(actorId);
        const contact = ensure().contacts.find(c => c.actorId === actorId && c.kind === 'npc');
        const owner = character || (db.characters || []).find(c => c.id === contact?.ownerCharId);
        const enabled = character ? characterSettings(character)[kind === 'story' ? 'storyEnabled' : 'postEnabled'] : contact?.[kind === 'story' ? 'mayStory' : 'mayPost'] === true;
        return enabled && (source !== 'background' || !!owner?.autoReply?.enabled && owner.momentsSettings?.backgroundPostEnabled !== false);
    }
    async function chatEvent(character, isBackground = false, requestId = '') {
        if (!controls || !character || !characterSettings(character).contactsEnabled || isBackground && !character.autoReply?.enabled) return;
        const source = isBackground ? 'background' : 'chat', ownerActorId = charActor(character.id);
        const eventId = requestId || id('moments_chat');
        for (const contact of activeContactsFor(character.id).filter(c => c.kind === 'npc')) {
            if (!controls.allowed(contact.actorId, source)) continue;
            const task = { ...controls.context(source, [contact.actorId]), ownerActorId, type: 'activity', dueAt: Date.now(), key: 'chat-activity:' + eventId + ':' + contact.actorId };
            await controls.enqueue(task);
        }
        await controls.tick();
    }
    function promptForCharacter(charId, isBackground = false, promptItems) {
        const actorId = charActor(charId);
        const m = ensure();
        const character = findCharacter(actorId);
        const settings = character && characterSettings(character);
        if (!settings || settings.chatLinked === false) return '';
        const source = isBackground ? 'background' : 'chat';
        settings.postEnabled = publicationEnabled(actorId, 'post', source);
        settings.storyEnabled = publicationEnabled(actorId, 'story', source);
        const activity = activityContext(actorId);
        const ownSignature = character.momentsProfile?.signature || '';
        const knownUserId = knownPersonaId(actorId);
        const knownUser = knownUserId ? userIdentity(knownUserId) : null;
        const aware = nicknameSetting(actorId, 'nicknameAwareness');
        const ownName = aware || nicknameSetting(actorId, 'selfRename') ? `你当前动态主页显示为“${aiName(actorId, actorId)}”。` : '';
        const profileContext = [ownName, ownSignature ? `你当前主页的个人签名是“${ownSignature}”。` : '', knownUser?.signature ? `你认识的${aiName('user', actorId, knownUserId)}的主页签名是“${knownUser.signature}”。` : '', aware && knownUser?.nickname ? `你认识的用户当前动态网名是“${knownUser.name}”。` : ''].filter(Boolean).join('\n');
        if (![settings.postEnabled, settings.storyEnabled, settings.browseEnabled, settings.interactEnabled, settings.contactsEnabled, nicknameSetting(actorId, 'selfRename')].some(Boolean)) return activity || profileContext ? '\n<visible_moments>\n' + [profileContext, activity ? '你亲历的动态操作记录：\n' + activity : ''].filter(Boolean).join('\n') + '\n</visible_moments>\n' : '';
        const reminders = m.notifications.filter(n => n.toId === actorId && memoryAllowed(n.postId, actorId) && m.posts.some(post => post.id === n.postId && visibleTo(post, actorId))).sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
        const remindedIds = reminders.map(n => n.postId);
        const posts = m.posts.filter(post => memoryAllowed(post.id, actorId) && visibleTo(post, actorId) && (post.authorId === actorId || post.seenBy?.[actorId]) && (post.kind === 'post' || post.expiresAt > Date.now())).sort((a, b) => Number(remindedIds.includes(b.id)) - Number(remindedIds.includes(a.id)) || b.createdAt - a.createdAt).slice(0, 5);
        const lines = posts.map(post => {
            const comments = (post.comments || []).filter(c => !c.deletedAt && canSeeInteraction(post, actorId, c.authorId, c.authorPersonaId)).slice(-3).map(c => `[评论ID:${c.id}] ${aiName(c.authorId, actorId, c.authorPersonaId || profilePersonaForPost(post))}：${commentSummary(c).slice(0, 80)}`).join('；');
            const reminder = reminders.find(n => n.postId === post.id);
            return `- [ID:${post.id}] ${reminder ? `[${reminder.text}] ` : ''}${aiName(post.authorId, actorId, profilePersonaForPost(post))}：${postContextText(post, 180)}${comments ? `；评论：${comments}` : ''}`;
        });
        const capabilities = profileContext ? [profileContext] : [];
        const rules = {};
        const addRule = (key, variables = {}) => { rules[key] = variables; };
        if (controls) {
            const c = controls.settings(actorId);
            c.actions.post = settings.postEnabled; c.actions.story = settings.storyEnabled;
            capabilities.push(controls.discussionPrompt(actorId));
            capabilities.push(`用户设置的动态规则：当前允许动作：${Object.keys(c.actions).filter(k => c.actions[k]).join('、') || '无'}。${c.requests.postContent ? '' : '禁止额外生成动态正文，不要输出发帖指令。'}${c.publish.habit ? '发布习惯：' + c.publish.habit : ''}是否行动由你判断，可以完全不行动，不要求凑发布数量。不要对同一评论重复接话；重复参与仅在用户允许时执行。`);
        }
        if (settings.postEnabled) addRule('post');
        if (posts.some(post => post.authorId === actorId)) capabilities.push('你可自主删除自己发布的动态：[MOMENT:delete:动态ID]。只能删除自己的帖子，完成后你会记得此事。');
        if (settings.storyEnabled) addRule('story');
        if (nicknameSetting(actorId, 'selfRename')) capabilities.push('你可以自然地决定修改自己的动态网名，指令：[MOMENT:rename:新网名]。只能修改自己的网名，不能频繁改名；执行成功后新网名会成为当前主页名字。');
        if (settings.browseEnabled) addRule('browse');
        else if (settings.interactEnabled) addRule('explicitView');
        if (settings.interactEnabled) { if(controls){const a=controls.settings(actorId).actions;capabilities.push(`你当前动态权限：点赞${a.like?'允许':'禁止'}；发表评论${a.comment?'允许':'禁止'}；回复评论${a.reply?'允许':'禁止'}。禁止的动作不要输出指令。`);} addRule('interact'); const stickers = stickerChoices(actorId); if (stickers) capabilities.push('你可在动态评论和回复中使用的表情包：' + stickers + '。指令：[MOMENT:sticker:动态ID:表情ID]、[MOMENT:reply-sticker:动态ID:评论ID:表情ID]。'); }
        if (settings.contactsEnabled) {
            const contacts = activeContactsFor(character.id).map(c => `${aiName(c.actorId, actorId)}（${c.relationship || '熟人'}）`);
            if (contacts.length) addRule('contacts', { 人脉列表: contacts.join('、') });
            const told = m.friendRequests.filter(r => r.tellOwner && r.ownerMessage && m.contacts.some(c => c.actorId === r.actorId && c.ownerCharId === character.id)).slice(-3);
            if (told.length) capabilities.push('人脉主动告诉你的消息：' + told.map(r => r.ownerMessage).join('；'));
        }
        if (posts.length) addRule('seen', { 动态列表: lines.join('\n') });
        if (activity) capabilities.push('你亲历的动态操作记录（删除的动态已不可查看，但你记得自己的经历）：\n' + activity);
        if (settings.browseEnabled) {
            const unseen = m.posts.filter(post => memoryAllowed(post.id, actorId) && visibleTo(post, actorId) && post.authorId !== actorId && !post.seenBy?.[actorId] && (post.kind !== 'story' || post.expiresAt > Date.now())).sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
            if (unseen.length) addRule('unseen', { 动态列表: unseen.map(post => `[ID:${post.id}] ${aiName(post.authorId, actorId, profilePersonaForPost(post))}，${post.kind === 'story' ? 'Story' : '动态'}，${readableTime(post.createdAt)}`).join('；') });
        }
        capabilities.push(compilePromptRules(rules, promptItems));
        const activeCapabilities = capabilities.filter(Boolean);
        return activeCapabilities.length ? '\n<visible_moments>\n' + activeCapabilities.join('\n') + '\n</visible_moments>\n' : '';
    }
    async function prepareForChat(character, userText = '', isBackground = false) {
        if (!character) return;
        const settings = characterSettings(character);
        const actorId = charActor(character.id);
        if (controls && !controls.allowed(actorId, 'chatPrep')) return;
        if (settings.browseEnabled) await autonomousActivity(actorId, false, null, controls?.context('chatPrep', [actorId]));
        if (isBackground || !settings.interactEnabled && !settings.browseEnabled) return;
        if (!/(动态|朋友圈|Story|story|点赞|点个赞|评论)/i.test(String(userText))) return;
        const available = ensure().posts.filter(post => memoryAllowed(post.id, actorId) && visibleTo(post, actorId) && !post.seenBy?.[actorId] && (post.kind !== 'story' || post.expiresAt > Date.now())).sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
        if (!available.length) return;
        try {
            const result = await askAI(`你是${aiName(actorId, actorId)}，人设：${character.persona || '未提供'}。用户刚说：“${String(userText).slice(0, 350)}”。你尚未看过的帖子：${available.map(post => `${post.id} ${aiName(post.authorId, actorId, profilePersonaForPost(post))}，${post.kind === 'story' ? 'Story' : '动态'}，${readableTime(post.createdAt)}`).join('；')}。这里没有正文。${promptRule('chatViewDecision')}只返回 JSON：{"postId":"要查看的给定ID，不看则留空"}。`, charActor(character.id), controls?.context('chatPrep', [actorId]));
            if (available.some(post => post.id === result.postId)) await viewPostForActor(result.postId, actorId);
        } catch (error) { console.error('私聊动态观看判断失败', error); }
    }
    async function consumeAiCommands(content, character, isBackground = false) {
        const pattern = /\[MOMENT:(post|story|view|like|comment|reply|delete|sticker|reply-sticker|rename)(?::([^\]\n]*))?\]/g;
        const commands = [...String(content || '').matchAll(pattern)].slice(0, controls ? undefined : 5);
        const cleaned = String(content || '').replace(pattern, '').replace(/\n{3,}/g, '\n\n').trim();
        if (!commands.length || !character) return { cleaned, errors: [] };
        const actorId = charActor(character.id);
        if (controls && !controls.chatAllowed(actorId, isBackground)) return { cleaned, errors: ['当前设置未允许此类聊天中的动态操作'] };
        const task = controls?.context(isBackground ? 'background' : 'chat', [actorId]) || { source: isBackground ? 'background' : 'chat' };
        const settings = characterSettings(character);
        const errors = [];
        for (const command of commands) {
            const type = command[1];
            const actionName = type === 'view' ? 'browse' : ['like', 'comment', 'reply', 'sticker', 'reply-sticker'].includes(type) ? 'interact' : type;
            if (controls && !controls.settings(actorId).actions[actionName]) { errors.push('当前设置未允许此动作：' + type); continue; }
            const parts = String(command[2] || '').split(':');
            try {
                if (type === 'post' || type === 'story') {
                    if (!publicationEnabled(actorId, type, task.source)) { errors.push('当前设置不允许发布' + (type === 'story' ? ' Story' : '动态')); continue; }
                    if (!settings[type === 'post' ? 'postEnabled' : 'storyEnabled'] || !await generatePost(actorId, type, false, null, task)) errors.push(`${type} 发布失败`);
                } else if (type === 'rename') {
                    const result = await changeNickname(actorId, '', String(command[2] || ''), true);
                    if (!result.ok) errors.push(result.reason);
                } else if (type === 'delete') {
                    const result = await deleteActorPost(actorId, parts[0]);
                    if (!result.ok) errors.push(result.reason);
                } else if (type === 'view') {
                    const userText = [...(character.history || [])].reverse().find(item => item.role === 'user')?.content || '';
                    if (!settings.browseEnabled && !(settings.interactEnabled && /(动态|朋友圈|Story|story|点赞|评论)/i.test(String(userText)))) errors.push('自主刷动态未开启');
                    else { const result = await applyActorAction(actorId, { type: 'view', postId: parts[0] }); if (!result.ok) errors.push(result.reason); }
                } else {
                    const isReply = type === 'reply' || type === 'reply-sticker';
                    const isSticker = type === 'sticker' || type === 'reply-sticker';
                    const action = { type: isReply || isSticker ? 'comment' : type, postId: parts[0], replyTo: isReply ? parts[1] : '', text: isSticker ? '' : parts.slice(isReply ? 2 : 1).join(':'), stickerId: isSticker ? parts[isReply ? 2 : 1] : '' };
                    const result = await applyActorAction(actorId, action, task);
                    if (!result.ok) errors.push(result.reason);
                }
            } catch (error) { errors.push(String(error.message || error)); }
        }
        if (errors.length) toast('动态操作未完成：' + errors.join('；'));
        return { cleaned, errors };
    }

    function showPostMenu(postId) {
        const post = findPost(postId);
        if (!post) return;
        state.deleteArmed = '';
        el('moments-post-dialog-actions').innerHTML = (post.authorId === 'user'
            ? `<button type="button" data-action="edit-post" data-post-id="${esc(postId)}">编辑动态</button>`
            : `<button type="button" data-action="profile" data-actor-id="${esc(post.authorId)}">查看主页</button>`)
            + `<button type="button" class="moments-danger" data-action="delete-post" data-post-id="${esc(postId)}">删除动态</button>`;
        el('moments-post-dialog').hidden = false;
    }
    function closePostDialog() { el('moments-post-dialog').hidden = true; state.deleteArmed = ''; }
    function editPost(postId) {
        const post = findPost(postId);
        if (!post || post.authorId !== 'user') return;
        newCompose(post.kind);
        state.compose.editPostId = postId;
        state.compose.personaId = post.authorPersonaId || 'legacy';
        if (state.compose.personaId === 'legacy') el('moments-compose-persona').insertAdjacentHTML('beforeend', '<option value="legacy">旧动态身份</option>');
        el('moments-compose-persona').value = state.compose.personaId;
        el('moments-compose-persona').disabled = true;
        renderComposeAuthor();
        state.compose.media = (post.media || []).map(item => ({ ...item }));
        state.compose.audienceIds = [...(post.audienceIds || ['user'])];
        state.compose.reminderIds = [...(post.reminderIds || [])];
        state.compose.mentions = [...(post.mentions || [])];
        el('moments-compose-title').textContent = '编辑动态';
        el('moments-compose-text').value = post.text || '';
        renderComposeMedia();
        updateComposeLabels();
        closePostDialog();
    }
    async function deletePost(postId, button) {
        if (state.deleteArmed !== postId) { state.deleteArmed = postId; button.textContent = '确认删除'; return; }
        const count = await removePosts([postId]);
        if (!count) { state.deleteArmed = ''; button.textContent = '删除动态'; return; }
        closePostDialog();
        switchScreen('moments-screen');
        toast('已删除动态');
    }
    function showMentionSuggestions(input, target) {
        const post = target === 'comment' ? findPost(state.currentPostId) : target === 'comment-edit' ? findPost(state.commentEdit?.postId) : null;
        const box = el(target === 'comment' ? 'moments-comment-mentions' : target === 'comment-edit' ? 'moments-comment-edit-mentions' : 'moments-compose-mentions');
        const before = input.value.slice(0, input.selectionStart);
        const match = before.match(/@([^\s@]*)$/u);
        if (!match) { box.hidden = true; return; }
        const allowed = target === 'comment' || target === 'comment-edit'
            ? [...new Set([post?.authorId, ...(post?.audienceIds || [])])].filter(id => id && id !== 'user' && visibleTo(post, id))
            : (state.compose?.audienceIds || []).filter(id => id !== 'user');
        const query = match[1].toLowerCase();
        const choices = allowed.filter(id => person(id)?.name.toLowerCase().includes(query)).slice(0, 8);
        if (!choices.length) { box.hidden = true; return; }
        state.mentionInsert = { target, start: input.selectionStart - match[0].length, end: input.selectionStart };
        box.innerHTML = choices.map(actorId => `<button type="button" data-action="insert-mention" data-actor-id="${esc(actorId)}" data-target="${target}">@${esc(person(actorId).name)}</button>`).join('');
        box.hidden = false;
    }
    function insertMention(actorId, target) {
        if (!person(actorId) || !state.mentionInsert || state.mentionInsert.target !== target) return;
        const input = el(target === 'comment' ? 'moments-comment-input' : target === 'comment-edit' ? 'moments-comment-edit-text' : 'moments-compose-text');
        const { start, end } = state.mentionInsert;
        input.value = input.value.slice(0, start) + '@' + person(actorId).name + ' ' + input.value.slice(end);
        const caret = start + person(actorId).name.length + 2;
        input.focus(); input.setSelectionRange(caret, caret);
        if (target === 'comment') input.dataset.mentions = [...new Set([...(input.dataset.mentions || '').split(',').filter(Boolean), actorId])].join(',');
        else if (target === 'comment-edit' && state.commentEdit) state.commentEdit.mentions = [...new Set([...state.commentEdit.mentions, actorId])];
        else if (state.compose) state.compose.mentions = [...new Set([...state.compose.mentions, actorId])];
        el(target === 'comment' ? 'moments-comment-mentions' : target === 'comment-edit' ? 'moments-comment-edit-mentions' : 'moments-compose-mentions').hidden = true;
    }
    function renderPostAfterChange(postId) {
        renderFeed();
        if (state.currentPostId === postId && el('moments-detail-screen').classList.contains('active')) renderDetail(postId);
    }
    async function handleAction(action, target) {
        if(controls&&action==='actor-controls'){closeEditor();const char=findCharacter(target.dataset.actorId);if(char){currentChatId=char.id;currentChatType='private';if(typeof loadSettingsToSidebar==='function')loadSettingsToSidebar();else loadCharacterSettings(char);switchScreen('chat-settings-screen');}else controls.open(target.dataset.actorId,'moments-contacts-screen');return;}
        const postId = target.dataset.postId;
        if (action === 'notification') {
            if (state.selectingNotifications) toggleNotificationSelection(target.dataset.noticeId);
            else renderDetail(postId);
        }
        else if (action === 'profile') { closePicker(); closePostDialog(); el('moments-story-viewer').hidden = true; renderProfile(target.dataset.actorId, target.dataset.personaId || ''); }
        else if (action === 'edit-profile-avatar') openProfileEditor('avatar');
        else if (action === 'edit-profile-cover') openProfileEditor('cover');
        else if (action === 'edit-profile-signature') openProfileEditor('signature');
        else if (action === 'edit-profile-nickname') openProfileEditor('nickname');
        else if (action === 'claim-legacy-posts') await claimLegacyPosts();
        else if (action === 'detail') renderDetail(postId);
        else if (action === 'result') showResult(postId);
        else if (action === 'close-result') el('moments-result-dialog').hidden = true;
        else if (action === 'add-friend') openFriendDialog(target.dataset.actorId);
        else if (action === 'close-friend') el('moments-friend-dialog').hidden = true;
        else if (action === 'like') await toggleLike(postId);
        else if (action === 'post-menu') showPostMenu(postId);
        else if (action === 'close-post-dialog') closePostDialog();
        else if (action === 'edit-post') editPost(postId);
        else if (action === 'delete-post') await deletePost(postId, target);
        else if (action === 'manage-select') toggleManagedPost(postId);
        else if (action === 'story') showStory(postId);
        else if (action === 'new-story') newCompose('story');
        else if (action === 'story-reply') { el('moments-story-viewer').hidden = true; renderDetail(postId); }
        else if (action === 'close-sticker-picker') closeStickerPicker();
        else if (action === 'sticker-category') { state.stickerCategory = target.dataset.category; state.stickerQuery = ''; el('moments-sticker-search').value = ''; renderStickerPicker(); }
        else if (action === 'choose-sticker') await chooseSticker(target.dataset.stickerId);
        else if (action === 'view-image') {
            const source = findPost(postId)?.media?.[Number(target.dataset.index)]?.data;
            if (source && typeof openImageViewer === 'function') openImageViewer(source);
        } else if (action === 'generate-media') await generateMedia(postId, Number(target.dataset.index));
        else if (action === 'reply') {
            const post = findPost(postId);
            const comment = post?.comments?.find(c => c.id === target.dataset.commentId && !c.deletedAt);
            if (comment) { const input = el('moments-comment-input'); input.dataset.replyTo = comment.id; input.value = comment.authorId === 'user' ? '' : '@' + replyAuthorName(post, comment) + ' '; input.dataset.mentions = comment.authorId === 'user' ? '' : comment.authorId; el('moments-reply-target-label').textContent = `回复 ${replyAuthorName(post, comment)}`; el('moments-reply-target').hidden = false; input.focus(); }
        } else if (action === 'edit-comment') openCommentEditor(postId, target.dataset.commentId);
        else if (action === 'delete-comment') await deleteComment(postId, target.dataset.commentId);
        else if (action === 'regenerate-comment-replies') await regenerateCommentReplies(postId, target.dataset.commentId);
        else if (action === 'close-comment-edit') closeCommentEditor();
        else if (action === 'remove-compose-media') {
            state.compose?.media.splice(Number(target.dataset.index), 1);
            renderComposeMedia();
        } else if (action === 'insert-mention') insertMention(target.dataset.actorId, target.dataset.target);
        else if (action === 'edit-contact') { const contact = contactsFor(currentChatId).find(c => c.id === target.dataset.contactId); if (contact) openEditor(contact.kind === 'linked' ? 'edit-linked' : 'npc', contact); }
        else if (action === 'delete-contact') {
            const key = target.dataset.contactId;
            if (state.deleteArmed !== key) { state.deleteArmed = key; target.textContent = '确认'; return; }
            const shown = contactsFor(currentChatId).find(c => c.id === key);
            if (!shown) return;
            const otherId = findCharacter(shown.actorId)?.id;
            ensure().contacts = ensure().contacts.filter(c => c.id !== key && !(shown.kind === 'linked' && c.kind === 'linked' && c.ownerCharId === otherId && c.actorId === charActor(currentChatId)));
            await persist(); renderContacts(); toast('已删除人脉');
        } else if (action === 'edit-group') openEditor('group', ensure().groups.find(g => g.id === target.dataset.groupId));
        else if (action === 'delete-group') {
            const key = target.dataset.groupId;
            if (state.deleteArmed !== key) { state.deleteArmed = key; target.textContent = '确认'; return; }
            ensure().groups = ensure().groups.filter(g => g.id !== key); await persist(); renderGroups(); toast('已删除分组');
        }
    }
    function bind(idValue, event, handler) { el(idValue)?.addEventListener(event, handler); }
    function init() {
        if (state.initialized) return;
        state.initialized = true;
        ensureUserPreset();
        ensure();
        if (migrateLegacyUserPosts()) persist();
        bind('moments-create-btn', 'click', () => newCompose());
        bind('moments-notifications-btn', 'click', renderNotifications);
        bind('moments-notifications-manage', 'click', () => {
            state.selectingNotifications = !state.selectingNotifications;
            state.selectedNotificationIds.clear();
            state.notificationDeleteArmed = false;
            renderNotificationsList();
        });
        bind('moments-notifications-select-all', 'click', toggleAllNotifications);
        bind('moments-notifications-delete', 'click', deleteSelectedNotifications);
        bind('moments-settings-btn', 'click', openSettings);
        bind('moments-controls-btn', 'click', () => controls?.open());
        bind('moments-character-name-source', 'change', async event => {
            ensure().settings.characterNameSource = event.target.value === 'real' ? 'real' : 'remark';
            await persist(); renderFeed();
            if (el('moments-profile-screen').classList.contains('active') && state.profileActorId) renderProfile(state.profileActorId, state.profilePersonaId);
        });
        for (const key of ['characterNicknameAwareness', 'contactNicknameAwareness', 'characterSelfRename', 'contactSelfRename']) {
            bind('moments-' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()), 'change', async event => { ensure().settings[key] = event.target.checked; await persist(); });
        }
        bind('moments-manage-btn', 'click', openManage);
        bind('moments-memory-btn', 'click', openMemory);
        bind('moments-memory-actor', 'change', event => { memoryState.actorId = event.target.value; memoryState.selected.clear(); renderMemory(); });
        bind('moments-memory-search', 'input', event => { memoryState.query = event.target.value; memoryState.selected.clear(); renderMemory(); });
        bind('moments-memory-select-all', 'click', () => {
            const rows = filteredMemoryRows(), selected = rows.length && rows.every(row => memoryState.selected.has(row.postId));
            for (const row of rows) if (selected) memoryState.selected.delete(row.postId); else memoryState.selected.add(row.postId);
            renderMemory();
        });
        bind('moments-memory-delete-selected', 'click', () => forgetMemories([...memoryState.selected]));
        bind('moments-memory-clear-all', 'click', () => forgetMemories(memoryRows().map(row => row.postId)));
        el('moments-memory-list')?.addEventListener('click', event => {
            const target = event.target.closest('[data-action]');
            if (!target || memoryState.busy) return;
            const postId = target.dataset.postId;
            if (target.dataset.action === 'forget-memory') void forgetMemories([postId]);
            else if (target.dataset.action === 'toggle-memory') {
                if (memoryState.selected.has(postId)) memoryState.selected.delete(postId); else memoryState.selected.add(postId);
                renderMemory();
            }
        });
        bind('moments-manage-search', 'input', event => { state.manageQuery = event.target.value; state.selectedPostIds.clear(); renderManage(); });
        bind('moments-manage-author', 'change', event => { state.manageAuthor = event.target.value; state.selectedPostIds.clear(); renderManage(); });
        bind('moments-manage-select-all', 'click', toggleAllManagedPosts);
        bind('moments-manage-delete-selected', 'click', () => deleteManagedPosts());
        bind('moments-manage-clear-all', 'click', () => deleteManagedPosts(true));
        bind('moments-publish-btn', 'click', publish);
        bind('moments-compose-persona', 'change', event => { if (!state.compose) return; state.compose.personaId = event.target.value; renderComposeAuthor(); });
        el('moments-profile-content')?.addEventListener('change', event => { if (event.target.id === 'moments-profile-persona-select') renderProfile('user', event.target.value); });
        bind('moments-compose-sticker-btn', 'click', () => openStickerPicker('compose'));
        bind('moments-comment-sticker-btn', 'click', () => openStickerPicker('comment'));
        bind('moments-reply-cancel', 'click', () => { clearReplyTarget(); el('moments-comment-input').value = ''; el('moments-comment-input').focus(); });
        bind('moments-sticker-search', 'input', event => { state.stickerQuery = event.target.value.trim().toLowerCase(); renderStickerPicker(); });
        bind('moments-comment-send', 'click', () => sendUserComment());
        bind('moments-comment-input', 'keydown', event => { if (event.key === 'Enter') { event.preventDefault(); sendUserComment(); } });
        bind('moments-comment-edit-form', 'submit', saveCommentEdit);
        bind('moments-comment-edit-text', 'input', event => showMentionSuggestions(event.target, 'comment-edit'));
        bind('moments-compose-text', 'input', event => showMentionSuggestions(event.target, 'compose'));
        bind('moments-comment-input', 'input', event => showMentionSuggestions(event.target, 'comment'));
        document.querySelectorAll('.moments-compose-kind button').forEach(button => button.addEventListener('click', () => {
            if (!state.compose) return;
            state.compose.kind = button.dataset.kind;
            el('moments-compose-title').textContent = button.dataset.kind === 'story' ? '发布 Story' : '发布动态';
            document.querySelectorAll('.moments-compose-kind button').forEach(item => item.classList.toggle('active', item === button));
        }));
        for (const [buttonId, accept, multiple] of [['moments-image-btn', 'image/*', true], ['moments-video-btn', 'video/*', false], ['moments-audio-btn', 'audio/*', false]]) {
            bind(buttonId, 'click', () => { const input = el('moments-media-input'); input.accept = accept; input.multiple = multiple; input.value = ''; input.click(); });
        }
        bind('moments-media-input', 'change', event => addFiles(event.target.files));
        bind('moments-record-btn', 'click', toggleRecord);
        el('moments-compose-screen')?.querySelector('.back-btn')?.addEventListener('click', () => {
            if (state.recorder?.state === 'recording') { state.recordFinishing = true; state.recorder.stop(); }
            state.compose = null;
        });
        bind('moments-audience-btn', 'click', () => openPicker('audience'));
        bind('moments-remind-btn', 'click', () => openPicker('remind'));
        bind('moments-picker-done', 'click', applyPicker);
        bind('moments-editor-form', 'submit', saveEditor);
        bind('moments-story-close', 'click', () => { el('moments-story-viewer').hidden = true; });
        bind('moments-interaction-visibility', 'change', async event => { ensure().settings.interactionVisibility = event.target.value; await persist(); renderFeed(); });
        bind('moments-friend-send', 'click', sendFriendRequest);
        bind('moments-add-group-btn', 'click', () => openEditor('group'));
        bind('moments-add-person-btn', 'click', () => openEditor('npc'));
        bind('moments-link-char-btn', 'click', () => openEditor('linked'));
        bind('moments-ai-person-btn', 'click', generateContact);
        bind('moments-ai-batch-btn', 'click', openBatchDialog);
        bind('moments-batch-generate', 'click', () => generateBatchContacts());
        bind('moments-batch-save', 'click', saveBatchContacts);
        el('moments-batch-dialog')?.addEventListener('click', async event => {
            const target = event.target.closest('[data-batch-action]');
            if (!target) return;
            const action = target.dataset.batchAction;
            const batch = state.batch;
            if (action === 'close') { closeBatchDialog(); return; }
            if (action === 'stop' && batch?.busy) {
                batch.cancelled = true;
                target.disabled = true;
                batchProgress(batch, '正在停止生成…', '当前请求结束后停止');
                return;
            }
            if (!batch || batch.busy) return;
            if (action === 'add-group') {
                readBatchGroups();
                batch.groups.push({ ownerCharId: currentChatId, count: 1, people: [], note: '' });
                renderBatchGroups();
                updateBatchEstimate();
            } else if (action === 'remove-group') {
                readBatchGroups();
                batch.groups.splice(Number(target.dataset.index), 1);
                renderBatchGroups();
                updateBatchEstimate();
            } else if (action === 'back') {
                el('moments-batch-review').hidden = true;
                el('moments-batch-config').hidden = false;
            } else if (action === 'retry-missing') await generateBatchContacts(true);
            else if (action === 'remove') {
                batch.candidates = batch.candidates.filter(c => c.draftId !== target.dataset.draftId);
                renderBatchCandidates();
            } else if (action === 'regenerate') await regenerateBatchCandidate(target.dataset.draftId);
            else if (action === 'image-avatar' || action === 'image-cover') {
                const candidate = batch.candidates.find(c => c.draftId === target.dataset.draftId);
                if (!candidate) return;
                batch.busy = true;
                renderBatchCandidates();
                try { await generateBatchImage(candidate, action === 'image-avatar' ? 'avatar' : 'cover'); }
                finally { batch.busy = false; if (state.batch === batch) renderBatchCandidates(); }
            }
        });
        el('moments-batch-dialog')?.addEventListener('change', event => {
            const batch = state.batch;
            if (!batch) return;
            const feature = event.target.dataset.batchFeature;
            if (feature) {
                const options = readBatchOptions();
                el('moments-batch-world').hidden = !options.worldReference && !options.worldBinding;
                updateBatchEstimate();
            }
            if (event.target.dataset.batchField === 'count') {
                readBatchGroups();
                renderBatchGroups();
                updateBatchEstimate();
            }
            if (event.target.dataset.batchPersonField === 'gender') {
                const wrap = event.target.closest('[data-batch-person]').querySelector('[data-batch-custom-wrap]');
                wrap.hidden = event.target.value !== 'custom';
            }
            const category = event.target.dataset.batchWorldCategory;
            if (category) el('moments-batch-world').querySelectorAll('[data-category-path]').forEach(input => {
                if (input.dataset.categoryPath === category || input.dataset.categoryPath.startsWith(category + '/')) input.checked = event.target.checked;
            });
            const selectedId = event.target.dataset.batchSelect;
            if (selectedId) {
                const candidate = batch.candidates.find(c => c.draftId === selectedId);
                if (candidate) candidate.selected = event.target.checked;
                const total = batch.groups.reduce((sum, group) => sum + group.count, 0);
                batchStatus(`请求 ${total} 人 · 已生成 ${batch.candidates.length} 人 · 已选 ${batch.candidates.filter(c => c.selected).length} 人`, true);
                el('moments-batch-save').disabled = !batch.candidates.some(c => c.selected);
            }
        });
        el('moments-batch-dialog')?.addEventListener('input', event => {
            if (event.target.closest('.moments-batch-group')) { updateBatchEstimate(); return; }
            const candidate = state.batch?.candidates.find(c => c.draftId === event.target.closest('[data-draft-id]')?.dataset.draftId);
            if (!candidate) return;
            const field = event.target.dataset.batchEdit;
            const extra = event.target.dataset.batchExtra;
            if (field && Object.prototype.hasOwnProperty.call(candidate, field)) candidate[field] = event.target.value;
            if (extra && Object.prototype.hasOwnProperty.call(candidate.extras, extra)) candidate.extras[extra] = event.target.value;
        });
        bind('setting-moments-contacts-btn', 'click', () => { const char = (db.characters || []).find(c => c.id === currentChatId); if (char) { saveCharacterSettings(char); saveCharacter(char.id); } openContacts(); });
        bind('setting-moments-generate-btn', 'click', async () => { const charId = currentChatId; if (!charId || state.running) return; const char = (db.characters || []).find(c => c.id === charId); if (char) { saveCharacterSettings(char); await saveCharacter(char.id); state.running = true; try { await generatePost(charActor(charId), 'post', true); } finally { state.running = false; } } });
        bind('moments-generate-now-btn', 'click', async () => {
            if (controls) { controls.open(); return; }
            if (state.confirming) return;
            if (state.running) { toast('自主动态正在检查中，请稍候'); return; }
            const button = el('moments-generate-now-btn');
            const label = button.textContent;
            state.confirming = true;
            button.disabled = true;
            try {
                const choice = await showAppConfirmDialog({
                    title: '检查自主动态',
                    message: '将检查最多 2 位已开启自主动态的角色或人脉，可能消耗 API 额度，并由其自行决定是否发布、浏览或互动。确认开始吗？',
                    confirmText: '开始检查', cancelText: '取消', dismissText: ''
                });
                if (choice !== 'confirm') return;
                if (state.running) { toast('自主动态正在检查中，请稍候'); return; }
                button.textContent = '检查中…';
                toast('正在检查自主动态…');
                const summary = await catchUp(true);
                if (summary.busy) { toast('自主动态正在检查中，请稍候'); return; }
                if (!summary.checked) { toast('没有开启自主动态的角色或人脉'); return; }
                if (summary.errors.length) {
                    const actionText = summary.actions.length ? `，完成 ${summary.actions.length} 项行动` : '';
                    toast(`已检查 ${summary.checked} 位${actionText}，${summary.errors.length} 位失败：${String(summary.errors[0]).slice(0, 80)}`);
                } else if (summary.actions.length) toast(`已检查 ${summary.checked} 位：${summary.actions.join('、')}`);
                else toast(`已检查 ${summary.checked} 位，角色均选择暂不行动`);
            } catch (error) {
                console.error('手动检查自主动态失败', error);
                toast(`自主动态检查失败：${error.message || error}`);
            } finally {
                button.disabled = false;
                button.textContent = label;
                state.confirming = false;
            }
        });
        el('moments-picker-options')?.addEventListener('change', event => {
            if (event.target.matches('[data-all-characters]')) el('moments-picker-options').querySelectorAll('input[data-character-choice]').forEach(input => { input.checked = event.target.checked; });
            if (event.target.matches('[data-group-id]')) {
                const group = ensure().groups.find(g => g.id === event.target.dataset.groupId);
                (group?.charIds || []).forEach(charId => { const input = [...el('moments-picker-options').querySelectorAll('input[value]')].find(item => item.value === charActor(charId)); if (input) input.checked = event.target.checked; });
            }
        });
        el('moments-contacts-list')?.addEventListener('change', async event => {
            const flag = event.target.dataset.contactFlag;
            const nicknameKey = event.target.dataset.contactNickname;
            const shown = contactsFor(currentChatId).find(c => c.id === event.target.closest('[data-contact-id]')?.dataset.contactId);
            const contact = shown && ensure().contacts.find(c => c.id === shown.id);
            if (flag && contact) {
                const key = shown.reverseOfId && flag !== 'enabled' ? 'reverse' + flag[0].toUpperCase() + flag.slice(1) : flag;
                contact[key] = event.target.checked;
                if(contact.kind==='npc'&&controls){const p=controls.localPreferences(contact.actorId);if(flag==='mayPost')p.postEnabled=event.target.checked;if(flag==='mayStory')p.storyEnabled=event.target.checked;if(flag==='mayInteract')for(const k of ['likeEnabled','commentEnabled','replyEnabled'])p[k]=event.target.checked;}
                await persist();
            }
            if (nicknameKey && contact?.kind === 'npc' && ['nicknameAwareness', 'selfRename'].includes(nicknameKey)) {
                contact[nicknameKey] = event.target.value;
                await persist();
            }
        });
        for (const screenId of ['moments-screen', 'moments-compose-screen', 'moments-detail-screen', 'moments-profile-screen', 'moments-notifications-screen', 'moments-settings-screen', 'moments-manage-screen', 'moments-contacts-screen', 'moments-story-viewer', 'moments-picker', 'moments-sticker-picker', 'moments-post-dialog', 'moments-comment-edit-dialog', 'moments-result-dialog', 'moments-friend-dialog']) {
            el(screenId)?.addEventListener('click', event => { const target = event.target.closest('[data-action]'); if (!target) return; const action = target.dataset.action; if (action === 'close-picker') closePicker(); else handleAction(action, target); });
        }
        el('moments-editor-dialog')?.addEventListener('click', event => {
            const target = event.target.closest('[data-action]');
            if (!target) return;
            if (target.dataset.action === 'close-editor') closeEditor();
            else if (target.dataset.action === 'generate-profile-signature') generateSignatureForEditor(target);
            else if (target.dataset.action === 'upload-profile-image') el('moments-editor-form').querySelector(`[data-file-field="${target.dataset.imageField}"]`)?.click();
            else if (target.dataset.action === 'reset-profile-image') {
                const form = el('moments-editor-form');
                form.elements[target.dataset.imageField].value = '';
                const file = form.querySelector(`[data-file-field="${target.dataset.imageField}"]`);
                if (file) file.value = '';
                updateImagePreview(target.dataset.imageField);
            }
        });
        el('moments-editor-dialog')?.addEventListener('input', event => { if (['avatar', 'cover'].includes(event.target.name)) updateImagePreview(event.target.name); });
        el('moments-editor-dialog')?.addEventListener('change', async event => {
            if (event.target.name === 'worldCategoryPath') {
                const path = event.target.value;
                el('moments-editor-dialog').querySelectorAll('[name="worldItemId"][data-category-path]').forEach(input => {
                    if (input.dataset.categoryPath === path || input.dataset.categoryPath.startsWith(path + '/')) input.checked = event.target.checked;
                });
                return;
            }
            const field = event.target.dataset.fileField;
            if (!field) return;
            const file = event.target.files?.[0];
            if (!file) return;
            if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024 || (file.type === 'image/gif' && file.size > 2 * 1024 * 1024)) { toast('请选择不超过 8 MB 的图片；GIF 不超过 2 MB'); return; }
            const editor = state.editor;
            if (editor) editor.imageBusy = true;
            const submit = el('moments-editor-form').querySelector('button[type="submit"]');
            if (submit) submit.disabled = true;
            try {
                const data = typeof compressImage === 'function' ? await compressImage(file, { quality: 0.82, maxWidth: field === 'cover' ? 1200 : 400, maxHeight: field === 'cover' ? 800 : 400 }) : await fileToDataUrl(file);
                if (state.editor !== editor) return;
                el('moments-editor-form').elements[field].value = data;
                updateImagePreview(field);
                toast('图片已选择，保存后生效');
            } catch (error) { toast('图片处理失败'); }
            finally { if (editor) editor.imageBusy = false; if (submit) submit.disabled = false; }
        });
        renderFeed();
        if (controls) controls.init({
            ensure, persist, character: findCharacter, characterSettings, person, post: findPost, visibleTo, memoryAllowed, detail: renderDetail,
            actors: () => [...new Set([...(db.characters || []).map(c => charActor(c.id)), ...ensure().contacts.filter(c => c.kind === 'npc').map(c => c.actorId)])],
            replyCandidates: post => [...new Set([...(actorMayInteract(post.authorId) && post.authorId !== 'user' ? [post.authorId] : []), ...candidatesForPost(post)])].filter(a => (post.authorId === a || post.seenBy?.[a]) && visibleTo(post, a)),
            eventCandidates: post => (post.audienceIds||[]).filter(a=>a!=='user'&&a!==post.authorId&&person(a)&&memoryAllowed(post.id,a)),
            viewStatus,
            friend: (requestId, task) => { const request = ensure().friendRequests.find(r => r.id === requestId && r.status === 'pending'); return request ? resolveFriendRequest(request, task) : Promise.resolve(); },
            replies: (postId, commentId, task) => generateReplies(postId, commentId, task),
            view: (postId, actorId, task) => viewPostForActor(postId, actorId, true, null, task),
            generate: (actorId, kind, task) => generatePost(actorId, kind, true, null, task),
            activity: (actorId, task) => autonomousActivity(actorId, true, null, task),
        });
    }
    function open() { if (!state.initialized) init(); renderFeed(); switchScreen('moments-screen'); }
    window.Moments = { init, open, loadCharacterSettings, saveCharacterSettings, isChatLinked, promptForCharacter, prepareForChat, consumeAiCommands, generatePost, chatEvent, promptDefaults, promptDefinitions, createPromptItems, normalizePromptItems, getPromptItems, compilePromptRules, visibleTo, canSeeInteraction };
})();
