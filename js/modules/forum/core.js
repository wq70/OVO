// Forum continuity and identity foundation. Kept as classic-script globals for the
// existing application architecture.
var FORUM_SCHEMA_VERSION = 2;
var forumGenerationJobs = {};
var forumEnsuringData = false;

function forumNewId(prefix) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return prefix + '_' + crypto.randomUUID();
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

function forumEscapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function forumSafeImageUrl(value, fallback) {
    var url = String(value || '').trim();
    if (/^(https?:|data:image\/(?:png|jpe?g|gif|webp);base64,|blob:)/i.test(url)) return url;
    return fallback || (typeof FORUM_DEFAULT_AVATAR !== 'undefined' ? FORUM_DEFAULT_AVATAR : 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg');
}

function forumCurrentAccountId() {
    var id = db && db.forumActiveAccountId ? db.forumActiveAccountId : 'main';
    if (id !== 'main' && !(db.forumAltAccounts || []).some(function(a) { return a.id === id; })) return 'main';
    return id;
}

function forumLegacyAuthorId(accountId) {
    return accountId === 'main' ? 'user' : accountId;
}

function forumGetAccountById(accountId) {
    if (accountId === 'main' || accountId === 'user') {
        return { id: 'main', username: (db.forumUserProfile && db.forumUserProfile.username) || '用户', avatar: db.forumUserProfile && db.forumUserProfile.avatar, bio: db.forumUserProfile && db.forumUserProfile.bio, isAlt: false };
    }
    var alt = (db.forumAltAccounts || []).find(function(a) { return a.id === accountId; });
    return alt ? { id: alt.id, username: alt.username, avatar: alt.avatar, bio: alt.bio, isAlt: true } : null;
}

function forumAccountOwnsAuthor(authorId, accountId) {
    accountId = accountId || forumCurrentAccountId();
    return authorId === forumLegacyAuthorId(accountId) || authorId === accountId || (accountId === 'main' && authorId === 'user');
}

function forumIsOtherPersonPost(post) {
    return !!post && !forumGetAccountById(post.authorId);
}

function forumMessageBelongsToAccount(message, accountId) {
    accountId = accountId || forumCurrentAccountId();
    return (message.accountId || 'main') === accountId;
}

function forumGetAccountState(accountId) {
    forumEnsureData();
    accountId = accountId || forumCurrentAccountId();
    if (!db.forumAccountStates[accountId]) {
        db.forumAccountStates[accountId] = {
            followingIds: [], blockedIds: [], mutedTopicIds: [], historyPostIds: [],
            reputation: {}, lastSeenAt: 0, quietHours: { enabled: false, start: '23:00', end: '08:00' }
        };
    }
    return db.forumAccountStates[accountId];
}

function forumStableNpcId(name, hint) {
    if (!forumEnsuringData) forumEnsureData();
    var normalized = String(name || '路人').trim().toLowerCase();
    var existing = Object.keys(db.forumStrangerProfiles).find(function(id) {
        var p = db.forumStrangerProfiles[id];
        return p && String(p.name || '').trim().toLowerCase() === normalized && (!hint || !p.identityHint || p.identityHint === hint);
    });
    if (existing) return existing;
    var id = forumNewId('npc');
    db.forumStrangerProfiles[id] = forumNormalizeNpcProfile({ id: id, name: name || '路人', identityHint: hint || '' }, id);
    return id;
}

function forumResolveNpcId(candidateId, name, hint) {
    forumEnsureData();
    candidateId = String(candidateId || '').trim();
    if (/^npc[_-][A-Za-z0-9_-]{3,120}$/.test(candidateId)) {
        db.forumStrangerProfiles[candidateId] = forumNormalizeNpcProfile(Object.assign({}, db.forumStrangerProfiles[candidateId], { name: name || (db.forumStrangerProfiles[candidateId] && db.forumStrangerProfiles[candidateId].name) || '路人' }), candidateId);
        return candidateId;
    }
    var id = forumNewId('npc');
    db.forumStrangerProfiles[id] = forumNormalizeNpcProfile({ id: id, name: name || '路人', identityHint: hint || '' }, id);
    return id;
}

function forumNormalizeNpcProfile(profile, id) {
    profile = profile && typeof profile === 'object' ? profile : {};
    id = id || profile.id || forumNewId('npc');
    return Object.assign({
        id: id, name: id.replace(/^npc_?/, '') || '路人', avatar: '', bio: '', basicPersona: '',
        publicPersona: '', privatePersona: '', disguisePersona: '', identityHint: '', linkedCharId: null,
        habits: { activeHours: '', replyPace: 'normal', punctuation: '', expressions: '', lurker: false },
        values: [], boundaries: [], interests: [], currentLife: '', longTermGoal: '', secrets: [],
        createdAt: Date.now(), lastActiveAt: Date.now(), postIds: [], commentIds: []
    }, profile, { id: id });
}

function forumGetRelationship(npcId, accountId) {
    forumEnsureData();
    accountId = accountId || forumCurrentAccountId();
    var key = accountId + '::' + npcId;
    if (!db.forumRelationships[key]) {
        db.forumRelationships[key] = {
            accountId: accountId, npcId: npcId, familiarity: 0, trust: 0, curiosity: 0,
            attraction: 0, safety: 0, guard: 15, jealousy: 0, grievance: 0,
            dependence: 0, respect: 0, unresolvedConflict: 0, publicCloseness: 0,
            privateCloseness: 0, commitment: 0, identitySuspicion: 0, identityEvidence: [], status: 'stranger', updatedAt: Date.now(), events: []
        };
    }
    if (db.forumRelationships[key].identitySuspicion == null) db.forumRelationships[key].identitySuspicion = 0;
    if (!Array.isArray(db.forumRelationships[key].identityEvidence)) db.forumRelationships[key].identityEvidence = [];
    if (!Array.isArray(db.forumRelationships[key].events)) db.forumRelationships[key].events = [];
    return db.forumRelationships[key];
}

function forumAdjustRelationship(npcId, changes, reason, accountId) {
    var rel = forumGetRelationship(npcId, accountId);
    Object.keys(changes || {}).forEach(function(key) {
        if (typeof rel[key] === 'number') rel[key] = Math.max(0, Math.min(100, rel[key] + Number(changes[key] || 0)));
    });
    rel.updatedAt = Date.now();
    rel.events.push({ id: forumNewId('rel'), at: Date.now(), reason: reason || '', changes: Object.assign({}, changes) });
    if (rel.events.length > 80) rel.events = rel.events.slice(-80);
    return rel;
}

function forumAddKnowledge(ownerId, subjectId, fact, source, confidence, accountId) {
    forumEnsureData();
    var item = { id: forumNewId('fact'), ownerId: ownerId, subjectId: subjectId, accountId: accountId || forumCurrentAccountId(), fact: String(fact || '').trim(), source: source || 'forum_public', confidence: Math.max(0, Math.min(100, Number(confidence == null ? 70 : confidence))), createdAt: Date.now(), confirmed: false, denied: false };
    if (!item.fact) return null;
    var duplicate = db.forumKnowledge.find(function(k) { return k.ownerId === item.ownerId && k.subjectId === item.subjectId && k.accountId === item.accountId && k.fact === item.fact; });
    if (duplicate) return duplicate;
    db.forumKnowledge.push(item);
    if (db.forumKnowledge.length > 1200) db.forumKnowledge = db.forumKnowledge.slice(-1200);
    return item;
}

function forumRecordEvent(type, data, accountId) {
    forumEnsureData();
    var event = Object.assign({ id: forumNewId('evt'), type: type, accountId: accountId || forumCurrentAccountId(), createdAt: Date.now() }, data || {});
    db.forumEvents.push(event);
    if (db.forumEvents.length > 2000) db.forumEvents = db.forumEvents.slice(-2000);
    return event;
}

function forumRecordSocialInteraction(fromNpcId, toNpcId, kind) {
    if (!fromNpcId || !toNpcId || fromNpcId === toNpcId) return;
    forumEnsureData();
    var edge = db.forumSocialEdges.find(function(item) { return item.fromNpcId === fromNpcId && item.toNpcId === toNpcId && item.kind === kind; });
    if (!edge) {
        edge = { id: forumNewId('edge'), fromNpcId: fromNpcId, toNpcId: toNpcId, kind: kind || 'interaction', strength: 0, lastAt: 0 };
        db.forumSocialEdges.push(edge);
    }
    edge.strength = Math.min(100, (edge.strength || 0) + 2);
    edge.lastAt = Date.now();
}

function forumTrackStoryThread(post) {
    forumEnsureData();
    var source = ((post && post.title) || '').replace(/[\s，。！？、,.!?：:；;【】\[\]()（）]/g, '');
    var key = source.slice(0, 10).toLowerCase() || (post && post.id);
    var thread = db.forumStoryThreads.find(function(item) { return item.key === key; });
    if (!thread) {
        thread = { id: forumNewId('story'), key: key, title: (post && post.title) || '社区话题', status: 'active', postIds: [], participantIds: [], createdAt: Date.now(), updatedAt: Date.now() };
        db.forumStoryThreads.push(thread);
    }
    if (post && thread.postIds.indexOf(post.id) < 0) thread.postIds.push(post.id);
    if (post && post.authorId && thread.participantIds.indexOf(post.authorId) < 0) thread.participantIds.push(post.authorId);
    thread.updatedAt = Date.now();
    return thread;
}

function forumAddNotification(accountId, type, text, data) {
    forumEnsureData();
    db.forumNotifications.unshift(Object.assign({ id: forumNewId('notice'), accountId: accountId || 'main', type: type, text: text || '', createdAt: Date.now(), isRead: false }, data || {}));
    if (db.forumNotifications.length > 300) db.forumNotifications.length = 300;
    if (typeof forumUpdateDMUnreadBadge === 'function') forumUpdateDMUnreadBadge();
}

function forumGetUnreadNotificationCount(accountId) {
    accountId = accountId || forumCurrentAccountId();
    return (db.forumNotifications || []).filter(function(n) { return n.accountId === accountId && !n.isRead; }).length;
}

function forumStartJob(kind, targetId) {
    var id = forumNewId('job');
    forumGenerationJobs[kind] = { id: id, kind: kind, targetId: targetId || '', accountId: forumCurrentAccountId(), startedAt: Date.now(), cancelled: false };
    return forumGenerationJobs[kind];
}

function forumJobIsCurrent(job) {
    return !!job && forumGenerationJobs[job.kind] === job && !job.cancelled && job.accountId === forumCurrentAccountId();
}

function forumFinishJob(job) {
    if (job && forumGenerationJobs[job.kind] === job) delete forumGenerationJobs[job.kind];
}

function forumCancelJob(kind) {
    if (forumGenerationJobs[kind]) forumGenerationJobs[kind].cancelled = true;
}

function forumFormatTime(value) {
    var time = typeof value === 'number' ? value : Date.parse(value || '');
    if (!isFinite(time)) return String(value || '');
    var diff = Date.now() - time;
    if (diff >= 0 && diff < 60000) return '刚刚';
    if (diff >= 0 && diff < 3600000) return Math.max(1, Math.floor(diff / 60000)) + '分钟前';
    var d = new Date(time), now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    var yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return '昨天 ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleString();
}

function forumEnsureData() {
    if (typeof db === 'undefined' || !db) return;
    if (forumEnsuringData) return;
    forumEnsuringData = true;
    if (!Array.isArray(db.forumPosts)) db.forumPosts = [];
    if (!Array.isArray(db.forumMessages)) db.forumMessages = [];
    if (!db.forumStrangerProfiles || typeof db.forumStrangerProfiles !== 'object') db.forumStrangerProfiles = {};
    if (!db.forumAccountStates || typeof db.forumAccountStates !== 'object') db.forumAccountStates = {};
    if (!db.forumRelationships || typeof db.forumRelationships !== 'object') db.forumRelationships = {};
    if (!Array.isArray(db.forumKnowledge)) db.forumKnowledge = [];
    if (!Array.isArray(db.forumSocialEdges)) db.forumSocialEdges = [];
    if (!Array.isArray(db.forumStoryThreads)) db.forumStoryThreads = [];
    if (!Array.isArray(db.forumEvents)) db.forumEvents = [];
    if (!Array.isArray(db.forumNotifications)) db.forumNotifications = [];
    if (!Array.isArray(db.forumDrafts)) db.forumDrafts = [];
    if (!Array.isArray(db.forumAltAccounts)) db.forumAltAccounts = [];
    if (!db.forumSettings || typeof db.forumSettings !== 'object') db.forumSettings = {};
    var defaultSettings = { preserveNpcPosts: true, activeFeed: 'all', proactiveIntensity: 50, contentSafety: 'balanced', quietHoursEnabled: false, quietHoursStart: '23:00', quietHoursEnd: '08:00', autoAdvanceOnOpen: false, enableRelationshipContinuity: true, enableKnowledgeBoundaries: true, enableCommunityContinuity: true };
    Object.keys(defaultSettings).forEach(function(k) { if (db.forumSettings[k] === undefined) db.forumSettings[k] = defaultSettings[k]; });

    Object.keys(db.forumStrangerProfiles).forEach(function(id) { db.forumStrangerProfiles[id] = forumNormalizeNpcProfile(db.forumStrangerProfiles[id], id); });
    db.forumPosts.forEach(function(post) {
        if (!post.id) post.id = forumNewId('post');
        if (!post.timestamp) post.timestamp = Number(String(post.id).split('_')[1]) || Date.now();
        if (!post.authorId) post.authorId = 'npc';
        if (post.authorId === 'npc' || (post.authorId && String(post.authorId).indexOf('npc_') === 0)) {
            if (!post.npcId || post.npcId === 'npc') post.npcId = forumResolveNpcId('', post.username || '楼主', 'legacy-post:' + post.id);
            post.authorId = post.npcId;
        }
        if (!Array.isArray(post.comments)) post.comments = [];
        post.comments.forEach(function(comment) {
            if (!comment.id) comment.id = forumNewId('comment');
            if (!comment.timestampMs) comment.timestampMs = typeof comment.timestamp === 'number' ? comment.timestamp : (Date.parse(comment.timestamp || '') || post.timestamp);
            if (comment.authorId === 'npc' || !comment.authorId) {
                comment.npcId = comment.npcId || forumResolveNpcId('', comment.username || '路人', 'legacy-comment:' + comment.id);
                comment.authorId = comment.npcId;
            }
        });
    });
    db.forumMessages.forEach(function(message) {
        if (!message.id) message.id = forumNewId('dm');
        if (!message.accountId) message.accountId = 'main';
        if (!message.timestamp) message.timestamp = Date.now();
    });
    db.forumSchemaVersion = FORUM_SCHEMA_VERSION;
    forumEnsuringData = false;
}

function forumIsQuietTime() {
    var settings = db.forumSettings || {};
    if (!settings.quietHoursEnabled) return false;
    var toMinutes = function(text) { var parts = String(text || '00:00').split(':'); return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0); };
    var now = new Date(); var current = now.getHours() * 60 + now.getMinutes();
    var start = toMinutes(settings.quietHoursStart || '23:00'); var end = toMinutes(settings.quietHoursEnd || '08:00');
    return start <= end ? current >= start && current < end : current >= start || current < end;
}

function forumMaybeAutoAdvance() {
    forumEnsureData();
    if (!db.forumSettings.autoAdvanceOnOpen || forumIsQuietTime() || forumGenerationJobs['forum-refresh']) return;
    var state = forumGetAccountState();
    var intensity = Math.max(0, Math.min(100, Number(db.forumSettings.proactiveIntensity == null ? 50 : db.forumSettings.proactiveIntensity)));
    var minimumMinutes = Math.round(180 - intensity * 1.35);
    if (Date.now() - (state.lastAutoAdvanceAt || 0) < minimumMinutes * 60000) return;
    state.lastAutoAdvanceAt = Date.now();
    saveData();
    if (typeof handleForumRefresh === 'function') handleForumRefresh();
}

function forumRunLocalSearch(query) {
    query = String(query || '').trim().toLowerCase();
    if (!query) return (db.forumPosts || []).filter(forumCanViewPost);
    return (db.forumPosts || []).filter(function(post) {
        if (!forumCanViewPost(post)) return false;
        var text = [post.title, post.summary, post.content, post.username].concat((post.comments || []).map(function(c) { return (c.username || '') + ' ' + (c.content || ''); })).join('\n').toLowerCase();
        return text.indexOf(query) !== -1;
    });
}

function forumCanViewPost(post, accountId) {
    accountId = accountId || forumCurrentAccountId();
    if (!post || !post.visibility || post.visibility === 'public') return true;
    if (forumAccountOwnsAuthor(post.authorId, accountId)) return true;
    if (post.visibility === 'private') return false;
    if (post.visibility === 'friends') return !!post.authorId && forumIsFriend(post.authorId);
    return true;
}

function forumRememberPostVisit(postId) {
    var state = forumGetAccountState();
    state.historyPostIds = state.historyPostIds.filter(function(id) { return id !== postId; });
    state.historyPostIds.unshift(postId);
    if (state.historyPostIds.length > 150) state.historyPostIds.length = 150;
    saveData();
}

function forumReadComposer() {
    return {
        title: (document.getElementById('forum-post-title-input') || {}).value || '',
        content: (document.getElementById('forum-post-content-input') || {}).value || '',
        type: (document.getElementById('forum-post-type-input') || {}).value || 'discussion',
        visibility: (document.getElementById('forum-post-visibility-input') || {}).value || 'public',
        tags: (document.getElementById('forum-post-tags-input') || {}).value || '',
        pollOptions: (document.getElementById('forum-poll-options-input') || {}).value || '',
        anonymous: !!((document.getElementById('forum-post-anonymous-input') || {}).checked)
    };
}

function forumApplyComposer(draft) {
    var mapping = { 'forum-post-title-input': 'title', 'forum-post-content-input': 'content', 'forum-post-type-input': 'type', 'forum-post-visibility-input': 'visibility', 'forum-post-tags-input': 'tags', 'forum-poll-options-input': 'pollOptions' };
    Object.keys(mapping).forEach(function(id) { var el = document.getElementById(id); if (el) el.value = draft[mapping[id]] || ''; });
    var anonymous = document.getElementById('forum-post-anonymous-input'); if (anonymous) anonymous.checked = !!draft.anonymous;
    var pollGroup = document.getElementById('forum-poll-options-group'); if (pollGroup) pollGroup.style.display = draft.type === 'poll' ? 'block' : 'none';
}

function forumSaveComposerDraft() {
    forumEnsureData();
    var draft = forumReadComposer();
    if (!draft.title.trim() && !draft.content.trim()) return showToast('还没有可以保存的内容');
    draft.id = forumNewId('draft'); draft.accountId = forumCurrentAccountId(); draft.updatedAt = Date.now();
    db.forumDrafts.unshift(draft); saveData(); showToast('草稿已保存');
}

function forumRenderDrafts() {
    forumEnsureData();
    var accountId = forumCurrentAccountId();
    var drafts = db.forumDrafts.filter(function(d) { return d.accountId === accountId; });
    var modal = document.getElementById('forum-drafts-modal');
    if (!modal) { modal = document.createElement('div'); modal.id = 'forum-drafts-modal'; modal.className = 'modal-overlay'; document.body.appendChild(modal); }
    modal.innerHTML = '<div class="modal-window forum-drafts-window"><div class="forum-notice-head"><h3>草稿箱</h3><button type="button" class="forum-notice-close">×</button></div><div class="forum-draft-list">' + (drafts.length ? drafts.map(function(d) { return '<div class="forum-draft-item" data-draft-id="' + forumEscapeHtml(d.id) + '"><button type="button" data-action="load"><strong>' + forumEscapeHtml(d.title || '无标题草稿') + '</strong><small>' + forumEscapeHtml(forumFormatTime(d.updatedAt)) + '</small></button><button type="button" class="forum-draft-delete" data-action="delete">删除</button></div>'; }).join('') : '<p class="placeholder-text">暂无草稿</p>') + '</div></div>';
    modal.querySelector('.forum-notice-close').onclick = function() { modal.classList.remove('visible'); };
    modal.querySelectorAll('.forum-draft-item').forEach(function(row) {
        row.querySelector('[data-action="load"]').onclick = function() { var draft = db.forumDrafts.find(function(d) { return d.id === row.dataset.draftId; }); if (draft) { forumApplyComposer(draft); modal.classList.remove('visible'); showToast('草稿已载入'); } };
        var del = row.querySelector('[data-action="delete"]'); del.onclick = function() { if (del.dataset.confirm !== 'true') { del.dataset.confirm = 'true'; del.textContent = '确认'; return; } db.forumDrafts = db.forumDrafts.filter(function(d) { return d.id !== row.dataset.draftId; }); saveData(); forumRenderDrafts(); };
    });
    modal.classList.add('visible');
}

function forumCollectAccountPublicText(accountId) {
    var authorId = forumLegacyAuthorId(accountId);
    var parts = [];
    (db.forumPosts || []).forEach(function(post) {
        if (post.authorId === authorId || post.authorId === accountId) parts.push(post.title || '', post.content || '');
        (post.comments || []).forEach(function(comment) { if (comment.authorId === authorId || comment.authorId === accountId) parts.push(comment.content || ''); });
    });
    return parts.join('\n').slice(-12000);
}

function forumWritingFingerprint(text) {
    text = String(text || '');
    var punctuation = ['！', '？', '~', '～', '…', '。', '，'];
    var counts = punctuation.map(function(mark) { return (text.split(mark).length - 1) / Math.max(1, text.length); });
    return { length: text.length, average: text.split(/\n+/).filter(Boolean).reduce(function(sum, item) { return sum + item.length; }, 0) / Math.max(1, text.split(/\n+/).filter(Boolean).length), punctuation: counts };
}

function forumEvaluateIdentityEvidence(accountId) {
    forumEnsureData();
    if (db.forumSettings && db.forumSettings.enableKnowledgeBoundaries === false) return;
    accountId = accountId || forumCurrentAccountId();
    if (accountId === 'main') return;
    var mainText = forumCollectAccountPublicText('main');
    var altText = forumCollectAccountPublicText(accountId);
    if (mainText.length < 40 || altText.length < 40) return;
    var a = forumWritingFingerprint(mainText), b = forumWritingFingerprint(altText);
    var punctuationDistance = a.punctuation.reduce(function(sum, value, index) { return sum + Math.abs(value - b.punctuation[index]); }, 0);
    var averageDistance = Math.abs(a.average - b.average) / Math.max(1, a.average, b.average);
    var similarity = Math.max(0, Math.min(100, Math.round(100 - punctuationDistance * 800 - averageDistance * 45)));
    if (similarity < 58) return;
    Object.keys(db.forumStrangerProfiles).forEach(function(npcId) {
        var profile = db.forumStrangerProfiles[npcId];
        if (!profile || !profile.linkedCharId) return;
        var rel = forumGetRelationship(npcId, accountId);
        var evidenceText = '大号与当前小号的公开文字习惯相似（相似度' + similarity + '%）';
        if (rel.identityEvidence.indexOf(evidenceText) < 0) rel.identityEvidence.push(evidenceText);
        rel.identitySuspicion = Math.max(rel.identitySuspicion || 0, Math.min(92, Math.round((similarity - 45) * 1.6)));
        forumAddKnowledge(npcId, accountId, evidenceText, 'public_writing_analysis', similarity, accountId);
    });
}

function forumCustomPromptSection(setting) {
    const value = db.forumSettings?.[setting];
    const prompt = typeof value === 'string' ? value.trim() : '';
    return prompt ? `\n\n===== 自定义论坛提示词 =====\n口吻、题材和互动节奏按以下偏好处理。身份、知情范围和输出格式仍按本次任务的要求执行。\n${prompt}` : '';
}

function forumRelationshipSummary(rel) {
    if (!rel) return '尚不熟悉';
    if (rel.commitment >= 65) return '关系非常重要';
    if (rel.attraction >= 55 && rel.trust >= 45) return '明显亲近';
    if (rel.trust >= 45 || rel.familiarity >= 50) return '逐渐熟悉';
    if (rel.guard >= 55 || rel.grievance >= 45) return '保持戒备';
    return rel.familiarity >= 15 ? '有些印象' : '尚不熟悉';
}

function forumRenderNpcProfile(npcId) {
    forumEnsureData();
    var profile = db.forumStrangerProfiles[npcId];
    if (!profile) return showToast('暂时没有找到该用户资料');
    var rel = forumGetRelationship(npcId);
    var modal = document.getElementById('forum-npc-profile-modal');
    if (!modal) {
        modal = document.createElement('div'); modal.id = 'forum-npc-profile-modal'; modal.className = 'modal-overlay'; document.body.appendChild(modal);
        modal.addEventListener('click', function(e) { if (e.target === modal || e.target.closest('.forum-npc-profile-close')) modal.classList.remove('visible'); });
    }
    var posts = (db.forumPosts || []).filter(function(p) { return !p.isAnonymous && forumCanViewPost(p) && (p.authorId === npcId || p.npcId === npcId); }).slice(0, 5);
    modal.innerHTML = '<div class="modal-window forum-npc-profile-window"><button type="button" class="forum-npc-profile-close" aria-label="关闭">×</button><div class="forum-npc-profile-head"><img src="' + forumEscapeHtml(forumSafeImageUrl(profile.avatar)) + '" alt=""><div><h3>' + forumEscapeHtml(profile.name) + '</h3><p>' + forumEscapeHtml(profile.bio || profile.publicPersona || profile.basicPersona || '这个人还没有公开更多信息。') + '</p></div></div><div class="forum-npc-profile-meta"><span>' + forumEscapeHtml(forumRelationshipSummary(rel)) + '</span><span>' + posts.length + ' 篇帖子</span></div><div class="forum-npc-profile-actions"><button type="button" class="btn btn-neutral btn-small" data-action="follow">' + (forumIsFollowing(npcId) ? '已关注' : '关注') + '</button><button type="button" class="btn btn-primary btn-small" data-action="dm">发私信</button></div><div class="forum-npc-profile-posts">' + (posts.length ? posts.map(function(p) { return '<button type="button" data-post-id="' + forumEscapeHtml(p.id) + '"><strong>' + forumEscapeHtml(p.title || '无标题') + '</strong><small>' + forumEscapeHtml(forumFormatTime(p.timestamp)) + '</small></button>'; }).join('') : '<p class="placeholder-text">暂时没有公开帖子</p>') + '</div></div>';
    modal.querySelector('[data-action="follow"]').onclick = function(e) { var followed = forumToggleFollow(npcId); e.currentTarget.textContent = followed ? '已关注' : '关注'; };
    modal.querySelector('[data-action="dm"]').onclick = function() { modal.classList.remove('visible'); forumOpenDMConversation(npcId, profile.name); };
    modal.querySelectorAll('[data-post-id]').forEach(function(button) { button.onclick = function() { var post = db.forumPosts.find(function(p) { return p.id === button.dataset.postId; }); if (post) { modal.classList.remove('visible'); renderPostDetail(post); switchScreen('forum-post-detail-screen'); } }; });
    modal.classList.add('visible');
}

function forumOpenPostEditModal(postId) {
    var post = (db.forumPosts || []).find(function(p) { return p.id === postId; });
    if (!post || !forumAccountOwnsAuthor(post.authorId)) return showToast('只能编辑当前身份发布的帖子');
    var modal = document.getElementById('forum-post-edit-modal');
    if (!modal) {
        modal = document.createElement('div'); modal.id = 'forum-post-edit-modal'; modal.className = 'modal-overlay'; document.body.appendChild(modal);
        modal.addEventListener('click', function(e) { if (e.target === modal || e.target.closest('[data-action="cancel-edit"]')) modal.classList.remove('visible'); });
    }
    modal.innerHTML = '<div class="modal-window forum-post-edit-window"><h3>编辑帖子</h3><label>标题<input id="forum-edit-post-title" type="text" maxlength="50"></label><label>内容<textarea id="forum-edit-post-content" rows="7"></textarea></label><label>话题标签<input id="forum-edit-post-tags" type="text" placeholder="用逗号分隔"></label><div class="forum-edit-actions"><button type="button" class="btn btn-neutral" data-action="cancel-edit">取消</button><button type="button" class="btn btn-primary" data-action="save-edit">保存</button></div></div>';
    modal.querySelector('#forum-edit-post-title').value = post.title || '';
    modal.querySelector('#forum-edit-post-content').value = post.content || '';
    modal.querySelector('#forum-edit-post-tags').value = (post.tags || []).join('，');
    modal.querySelector('[data-action="save-edit"]').onclick = function() {
        var title = modal.querySelector('#forum-edit-post-title').value.trim();
        var content = modal.querySelector('#forum-edit-post-content').value.trim();
        if (!title || !content) return showToast('标题和内容不能为空');
        post.title = title; post.content = content; post.summary = content.length > 100 ? content.slice(0, 100) + '...' : content;
        post.tags = modal.querySelector('#forum-edit-post-tags').value.split(/[,，]/).map(function(v) { return v.trim(); }).filter(Boolean).slice(0, 8);
        post.editedAt = Date.now();
        forumRecordEvent('post_edited', { postId: post.id });
        saveData(); modal.classList.remove('visible'); renderPostDetail(post); showToast('帖子已更新');
    };
    modal.classList.add('visible');
}

function forumOpenCommentEditModal(postId, commentId) {
    var post = (db.forumPosts || []).find(function(p) { return p.id === postId; });
    var comment = post && (post.comments || []).find(function(c) { return c.id === commentId; });
    if (!comment || !forumAccountOwnsAuthor(comment.authorId)) return showToast('只能编辑当前身份发布的评论');
    var modal = document.getElementById('forum-comment-edit-modal');
    if (!modal) { modal = document.createElement('div'); modal.id = 'forum-comment-edit-modal'; modal.className = 'modal-overlay'; document.body.appendChild(modal); }
    modal.innerHTML = '<div class="modal-window forum-post-edit-window"><h3>编辑评论</h3><label>内容<textarea id="forum-edit-comment-content" rows="6"></textarea></label><div class="forum-edit-actions"><button type="button" class="btn btn-danger" data-action="delete-comment">删除</button><button type="button" class="btn btn-neutral" data-action="cancel-comment">取消</button><button type="button" class="btn btn-primary" data-action="save-comment">保存</button></div></div>';
    modal.querySelector('textarea').value = comment.content || '';
    modal.querySelector('[data-action="cancel-comment"]').onclick = function() { modal.classList.remove('visible'); };
    modal.querySelector('[data-action="save-comment"]').onclick = function() { var value = modal.querySelector('textarea').value.trim(); if (!value) return showToast('评论内容不能为空'); comment.content = value; comment.editedAt = Date.now(); forumRecordEvent('comment_edited', { postId: postId, commentId: commentId }); saveData(); modal.classList.remove('visible'); renderPostDetail(post); showToast('评论已更新'); };
    var deleteButton = modal.querySelector('[data-action="delete-comment"]');
    deleteButton.onclick = function() { if (deleteButton.dataset.confirm !== 'true') { deleteButton.dataset.confirm = 'true'; deleteButton.textContent = '确认删除'; return; } post.comments = post.comments.filter(function(c) { return c.id !== commentId; }); forumRecordEvent('comment_deleted', { postId: postId, commentId: commentId }); saveData(); modal.classList.remove('visible'); renderPostDetail(post); showToast('评论已删除'); };
    modal.classList.add('visible');
}

function forumGetReaction(post, kind, accountId) {
    accountId = accountId || forumCurrentAccountId();
    var mapName = kind === 'favorite' ? 'favoritedByAccounts' : 'likedByAccounts';
    if (!post[mapName] || typeof post[mapName] !== 'object') post[mapName] = {};
    if (post[mapName][accountId] === undefined && accountId === 'main') {
        post[mapName][accountId] = kind === 'favorite' ? !!post.isFavorited : !!post.isLiked;
    }
    return !!post[mapName][accountId];
}

function forumSetReaction(post, kind, value, accountId) {
    accountId = accountId || forumCurrentAccountId();
    var mapName = kind === 'favorite' ? 'favoritedByAccounts' : 'likedByAccounts';
    if (!post[mapName] || typeof post[mapName] !== 'object') post[mapName] = {};
    post[mapName][accountId] = !!value;
    if (accountId === 'main') {
        if (kind === 'favorite') post.isFavorited = !!value; else post.isLiked = !!value;
    }
}

function forumVotePoll(postId, optionId) {
    var post = (db.forumPosts || []).find(function(p) { return p.id === postId; });
    if (!post || !post.poll || !Array.isArray(post.poll.options)) return false;
    if (!post.poll.votesByAccount || typeof post.poll.votesByAccount !== 'object') post.poll.votesByAccount = {};
    var accountId = forumCurrentAccountId();
    var previousId = post.poll.votesByAccount[accountId];
    if (previousId === optionId) return false;
    var previous = post.poll.options.find(function(o) { return o.id === previousId; });
    var next = post.poll.options.find(function(o) { return o.id === optionId; });
    if (!next) return false;
    if (previous) previous.votes = Math.max(0, (previous.votes || 0) - 1);
    next.votes = (next.votes || 0) + 1;
    post.poll.votesByAccount[accountId] = optionId;
    forumRecordEvent('poll_voted', { postId: postId, optionId: optionId }, accountId);
    saveData();
    return true;
}

function forumToggleFollow(npcId) {
    var state = forumGetAccountState();
    var index = state.followingIds.indexOf(npcId);
    if (index >= 0) state.followingIds.splice(index, 1); else state.followingIds.push(npcId);
    saveData();
    return index < 0;
}

function forumIsFollowing(npcId) {
    return forumGetAccountState().followingIds.indexOf(npcId) >= 0;
}

function forumUpdateIdentityChip() {
    var chip = document.getElementById('forum-current-identity-chip');
    if (!chip) return;
    var account = forumGetActiveAccount();
    chip.innerHTML = '<img src="' + forumEscapeHtml(forumSafeImageUrl(account.avatar)) + '" alt=""><span>' + forumEscapeHtml(account.username || '用户') + '</span><small>' + (account.isAlt ? '小号' : '大号') + '</small>';
}

function forumRenderNotifications() {
    forumEnsureData();
    var modal = document.getElementById('forum-notifications-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'forum-notifications-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = '<div class="modal-window forum-notice-window"><div class="forum-notice-head"><h3>与我相关</h3><button type="button" class="forum-notice-close" aria-label="关闭">×</button></div><div id="forum-notice-list"></div></div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', function(e) { if (e.target === modal || e.target.closest('.forum-notice-close')) modal.classList.remove('visible'); });
    }
    var accountId = forumCurrentAccountId();
    var notices = db.forumNotifications.filter(function(n) { return n.accountId === accountId; });
    var list = modal.querySelector('#forum-notice-list');
    list.innerHTML = notices.length ? notices.slice(0, 100).map(function(n) { return '<button type="button" class="forum-notice-item" data-post-id="' + forumEscapeHtml(n.postId || '') + '"><span>' + forumEscapeHtml(n.text || '') + '</span><small>' + forumEscapeHtml(forumFormatTime(n.createdAt)) + '</small></button>'; }).join('') : '<p class="placeholder-text">暂时没有与你相关的新动态</p>';
    notices.forEach(function(n) { n.isRead = true; });
    saveData();
    modal.classList.add('visible');
    var badge = document.querySelector('#forum-notifications-btn .forum-dm-badge');
    if (badge) badge.remove();
    if (typeof forumUpdateMoreNoticeBadge === 'function') forumUpdateMoreNoticeBadge();
    list.onclick = function(e) {
        var item = e.target.closest('[data-post-id]');
        var post = item && db.forumPosts.find(function(p) { return p.id === item.dataset.postId; });
        if (post && forumCanViewPost(post)) { modal.classList.remove('visible'); renderPostDetail(post); switchScreen('forum-post-detail-screen'); }
    };
}

if (typeof window !== 'undefined') {
    window.forumEnsureData = forumEnsureData;
    window.forumEscapeHtml = forumEscapeHtml;
    window.forumSafeImageUrl = forumSafeImageUrl;
}
