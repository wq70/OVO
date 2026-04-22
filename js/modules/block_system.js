// --- 拉黑与好友申请系统 ---

(function () {
    let blockSystemIntervalId = null;
    let currentPendingRequestCharId = null;
    let currentPendingRequestId = null;

    function formatTimeAgo(ts) {
        if (!ts || typeof ts !== 'number') return '';
        const diff = Date.now() - ts;
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
        if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
        return Math.floor(diff / 86400000) + '天前';
    }

    function getBlockMemoryContext(character) {
        if (!character.blockHistory || character.blockHistory.length === 0) return '';
        var context = '\n## 拉黑与好友申请记忆\n';
        context += '你曾被用户拉黑 ' + character.blockHistory.length + ' 次。\n';
        if (character.friendRequests && character.friendRequests.length > 0) {
            context += '你发送过的好友申请：\n';
            character.friendRequests.forEach(function (req, i) {
                var statusText = req.status === 'accepted' ? '被接受' : '被拒绝';
                context += '  第' + (i + 1) + '次："' + (req.reason || '') + '" → ' + statusText + '\n';
            });
        }
        var blockedMessages = (character.history || []).filter(function (m) { return m.sentWhileBlocked; });
        if (blockedMessages.length > 0) {
            context += '\n用户在拉黑你之后，独自在对话框中写下了这些话：\n';
            blockedMessages.forEach(function (m) {
                var text = (m.content || '').replace(/\[.*?的消息：/, '').replace(/\]$/, '').trim();
                if (text) context += '  "' + text.slice(0, 200) + (text.length > 200 ? '…' : '') + '"\n';
            });
            context += '这些话是用户在拉黑你、你无法回复的时候写的。你现在知道了这些内容。\n';
        }
        context += '\n你应该记得这段经历。它会影响你的情绪和态度，但你不需要每句话都提起——像真人一样自然地体现就好。\n';
        return context;
    }

    if (typeof window.buildBlockMemoryContext === 'undefined') {
        window.buildBlockMemoryContext = getBlockMemoryContext;
    }

    // 角色拉黑用户后的记忆：解除拉黑后注入
    function getCharBlockMemoryContext(character) {
        if (!character.charBlockHistory || character.charBlockHistory.length === 0) return '';
        var context = '\n## 你曾拉黑用户的记忆\n';
        context += '你曾主动拉黑用户 ' + character.charBlockHistory.length + ' 次。\n';
        if (character.charBlockHistory.length > 0) {
            character.charBlockHistory.forEach(function (entry, i) {
                var reason = (entry.reason || '').slice(0, 100);
                context += '  第' + (i + 1) + '次拉黑理由：' + (reason || '（未记录）') + '\n';
            });
        }
        var charBlockedMessages = (character.history || []).filter(function (m) { return m.sentWhileCharBlocked; });
        if (charBlockedMessages.length > 0) {
            context += '\n你在拉黑用户期间，在对话框里说过这些话：\n';
            charBlockedMessages.forEach(function (m) {
                var text = (m.content || '').replace(/\[.*?的消息：/, '').replace(/\]$/, '').trim();
                if (text) context += '  "' + text.slice(0, 200) + (text.length > 200 ? '…' : '') + '"\n';
            });
            context += '这些是你拉黑用户后自己发的，你都记得。\n';
        }
        if (character.userFriendRequests && character.userFriendRequests.length > 0) {
            context += '\n用户发给你的好友申请：\n';
            character.userFriendRequests.forEach(function (req, i) {
                var statusText = req.status === 'accepted' ? '你接受了' : '你拒绝了';
                var reason = (req.reason || '').slice(0, 80);
                context += '  第' + (i + 1) + '次申请理由："' + reason + '" → ' + statusText;
                if (req.status === 'rejected' && (req.rejectReason || '').trim()) context += '，拒绝理由："' + (req.rejectReason || '').trim().slice(0, 80) + '"';
                context += '\n';
            });
        }
        context += '\n你应该记得这段经历，会影响你对用户的态度。\n';
        return context;
    }
    if (typeof window.buildCharBlockMemoryContext === 'undefined') {
        window.buildCharBlockMemoryContext = getCharBlockMemoryContext;
    }

    async function callBlockApi(systemPrompt, userContent) {
        var apiConfig = db.apiSettings;
        if (!apiConfig || !apiConfig.url || !apiConfig.key || !apiConfig.model) {
            return { ok: false, error: '请先在 api 应用中完成设置' };
        }
        var url = apiConfig.url.replace(/\/$/, '');
        var key = typeof getRandomValue === 'function' ? getRandomValue(apiConfig.key) : apiConfig.key;
        var model = apiConfig.model;
        var provider = (apiConfig.provider || 'gemini').toLowerCase();
        var endpoint = provider === 'gemini'
            ? url + '/v1beta/models/' + model + ':generateContent?key=' + key
            : url + '/v1/chat/completions';
        var headers = { 'Content-Type': 'application/json' };
        if (provider !== 'gemini') headers.Authorization = 'Bearer ' + key;
        var body;
        if (provider === 'gemini') {
            body = {
                contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n' + userContent }] }],
                generationConfig: { temperature: (db.apiSettings && db.apiSettings.temperature != null) ? db.apiSettings.temperature : 0.9 }
            };
        } else {
            var rawMessages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent }
            ];
            body = {
                model: model,
                messages: normalizeMessagesForProvider(rawMessages, provider),
                stream: false,
                temperature: (db.apiSettings && db.apiSettings.temperature != null) ? db.apiSettings.temperature : 0.9
            };
        }
        try {
            var res = await fetch(endpoint, { method: 'POST', headers: headers, body: JSON.stringify(body) });
            var text = await res.text();
            if (!res.ok) return { ok: false, error: text || res.statusText };
            var data = JSON.parse(text);
            var raw = provider === 'gemini'
                ? (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text)
                : (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content);
            return { ok: true, text: (raw || '').trim() };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }

    function getEffectivePersonaForBlock(character) {
        if (!character) return '';
        var p = character.persona || '';
        const useSupplement = (character.source === 'forum' || character.source === 'peek') && (character.supplementPersonaEnabled || character.supplementPersonaAiEnabled) && (character.supplementPersonaText || '').trim();
        if (useSupplement) {
            p = (p ? p + '\n\n[已补齐的人设]\n' : '[已补齐的人设]\n') + (character.supplementPersonaText || '').trim();
        }
        return p || '一个友好、乐于助人的伙伴。';
    }

    async function generateFriendRequestReason(char) {
        var rejectedRequests = (char.friendRequests || []).filter(function (r) { return r.status === 'rejected'; });
        var lastMessages = (char.history || [])
            .filter(function (m) { return !m.isContextDisabled; })
            .slice(-10)
            .map(function (m) {
                var prefix = m.sentWhileBlocked ? '[拉黑后用户独白]' : (m.role === 'user' ? '用户' : (char.realName || ''));
                var content = (m.content || '').replace(/\[.*?的消息：/, '').replace(/\]$/, '').trim().slice(0, 150);
                return prefix + ': ' + content;
            }).join('\n');

        var prompt = '你是「' + (char.realName || char.remarkName || '角色') + '」，你的人设：\n' + getEffectivePersonaForBlock(char) + '\n\n';
        prompt += '当前状态：\n';
        prompt += '- 用户在 ' + formatTimeAgo(char.blockedAt) + ' 把你拉黑了\n';
        prompt += '- 你已发过 ' + rejectedRequests.length + ' 次好友申请，全部被拒\n';
        if (rejectedRequests.length > 0) {
            rejectedRequests.forEach(function (r, i) {
                prompt += '  第' + (i + 1) + '次："' + (r.reason || '') + '" → 被拒绝\n';
            });
        }
        prompt += '- 你和用户最近的对话（含用户拉黑你后独自说的话）：\n' + (lastMessages || '（无）') + '\n\n';
        prompt += '请以 JSON 格式回复，且只输出这一行，不要其他内容：\n';
        prompt += '{"reason":"你的好友申请理由（50字以内，符合你的性格，体现情绪递进，不重复之前写过的）"}\n';

        var result = await callBlockApi('你是一个角色扮演助手。请严格只输出要求的 JSON，不要 markdown 代码块，不要多余文字。', prompt);
        if (!result.ok) return { ok: false, error: result.error };
        try {
            var jsonStr = result.text.replace(/^[\s\S]*?\{/, '{').replace(/\}[\s\S]*$/, '}');
            var obj = JSON.parse(jsonStr);
            return { ok: true, reason: (obj.reason || '').trim() || '我想重新加回你好友。' };
        } catch (e) {
            return { ok: true, reason: result.text.slice(0, 80) || '我想重新加回你好友。' };
        }
    }

    async function aiDecideAndMaybeSendRequest(char) {
        var rejectedRequests = (char.friendRequests || []).filter(function (r) { return r.status === 'rejected'; });
        var lastRejectedAt = rejectedRequests.length > 0 ? Math.max.apply(null, rejectedRequests.map(function (r) { return r.respondedAt || 0; })) : char.blockedAt;
        var minutesSince = Math.floor((Date.now() - lastRejectedAt) / 60000);

        var prompt = '你是「' + (char.realName || char.remarkName || '角色') + '」，你的人设：\n' + getEffectivePersonaForBlock(char) + '\n\n';
        prompt += '你被用户拉黑了。已发过 ' + rejectedRequests.length + ' 次好友申请且都被拒。距离上次被拒绝已过 ' + minutesSince + ' 分钟。\n';
        prompt += '请以 JSON 格式回复，且只输出这一行：\n';
        prompt += '{"shouldSendNow":true或false,"reason":"若shouldSendNow为true则写申请理由(50字内)","nextCheckMinutes":数字}\n';
        prompt += 'nextCheckMinutes 表示多少分钟后再来问你（心急角色可填1~5，慢热可填60~180）。';

        var result = await callBlockApi('你是一个角色扮演助手。只输出一行 JSON，不要 markdown。', prompt);
        if (!result.ok) {
            if (typeof showToast === 'function') showToast('好友申请生成失败：' + (result.error || 'API 错误'));
            char.blockReapply = char.blockReapply || {};
            char.blockReapply.nextCheckTime = Date.now() + 10 * 60 * 1000;
            return;
        }
        try {
            var jsonStr = result.text.replace(/^[\s\S]*?\{/, '{').replace(/\}[\s\S]*$/, '}');
            var obj = JSON.parse(jsonStr);
            var nextMin = Math.max(1, Math.min(1440, parseInt(obj.nextCheckMinutes, 10) || 10));
            char.blockReapply = char.blockReapply || {};
            char.blockReapply.nextCheckTime = Date.now() + nextMin * 60 * 1000;
            if (obj.shouldSendNow && obj.reason) {
                await doAddRequestAndShowModal(char, (obj.reason || '').trim() || '我想重新加回你好友。');
            }
        } catch (e) {
            char.blockReapply.nextCheckTime = Date.now() + 10 * 60 * 1000;
        }
        if (typeof saveData === 'function') saveData();
    }

    async function doAddRequestAndShowModal(char, reason) {
        var requestId = 'req_' + Date.now();
        if (!char.friendRequests) char.friendRequests = [];
        char.friendRequests.push({
            id: requestId,
            reason: reason,
            status: 'pending',
            createdAt: Date.now(),
            respondedAt: null
        });
        char.blockReapply = char.blockReapply || {};
        char.blockReapply.pendingRequestId = requestId;
        char.blockReapply.lastRequestTime = Date.now();
        if (typeof saveData === 'function') saveData();

        currentPendingRequestCharId = char.id;
        currentPendingRequestId = requestId;
        showFriendRequestModal(char, requestId);
    }

    async function generateAndShowFriendRequest(char) {
        if (char.blockReapply && char.blockReapply.pendingRequestId) return;
        if (typeof showToast === 'function') showToast('正在生成好友申请…');
        var result = await generateFriendRequestReason(char);
        if (!result.ok) {
            if (typeof showToast === 'function') showToast(result.error || '生成失败');
            return;
        }
        await doAddRequestAndShowModal(char, result.reason);
    }

    function showFriendRequestModal(char, requestId) {
        var req = (char.friendRequests || []).find(function (r) { return r.id === requestId; });
        if (!req) return;
        var avatarEl = document.getElementById('friend-request-avatar');
        var nameEl = document.getElementById('friend-request-name');
        var reasonEl = document.getElementById('friend-request-reason');
        var metaEl = document.getElementById('friend-request-meta');
        var modal = document.getElementById('friend-request-modal');
        if (!avatarEl || !nameEl || !reasonEl || !metaEl || !modal) return;

        var rejectedCount = (char.friendRequests || []).filter(function (r) { return r.status === 'rejected'; }).length;
        var lastRejected = (char.friendRequests || []).filter(function (r) { return r.status === 'rejected'; }).sort(function (a, b) { return (b.respondedAt || 0) - (a.respondedAt || 0); })[0];
        var metaText = '第 ' + (rejectedCount + 1) + ' 次申请';
        if (lastRejected && lastRejected.respondedAt) metaText += ' · 上次被拒绝于 ' + formatTimeAgo(lastRejected.respondedAt);

        avatarEl.src = (char.avatar && char.avatar.trim()) ? char.avatar : '';
        nameEl.textContent = char.realName || char.remarkName || '角色';
        reasonEl.textContent = req.reason || '';
        metaEl.textContent = metaText;
        modal.classList.add('visible');
    }

    function closeFriendRequestModal() {
        var modal = document.getElementById('friend-request-modal');
        if (modal) modal.classList.remove('visible');
        currentPendingRequestCharId = null;
        currentPendingRequestId = null;
    }

    function acceptFriendRequest() {
        if (!currentPendingRequestCharId || !currentPendingRequestId) return;
        var char = db.characters.find(function (c) { return c.id === currentPendingRequestCharId; });
        var req = char && (char.friendRequests || []).find(function (r) { return r.id === currentPendingRequestId; });
        if (!char || !req) { closeFriendRequestModal(); return; }

        req.status = 'accepted';
        req.respondedAt = Date.now();
        char.isBlocked = false;
        char.blockedAt = null;
        char.blockReapply = char.blockReapply || {};
        char.blockReapply.pendingRequestId = null;

        var lastBlock = char.blockHistory && char.blockHistory[char.blockHistory.length - 1];
        if (lastBlock) lastBlock.unblockedAt = Date.now();

        if (!char.history) char.history = [];
        char.history.push({
            id: 'msg_system_' + Date.now(),
            role: 'system',
            content: '[system-display:' + (char.realName || char.remarkName) + ' 已重新添加为好友]',
            parts: [],
            timestamp: Date.now()
        });

        if (typeof saveData === 'function') saveData();
        if (typeof renderChatList === 'function') renderChatList();
        if (typeof showToast === 'function') showToast('已重新添加 ' + (char.realName || char.remarkName) + ' 为好友');
        closeFriendRequestModal();
    }

    function rejectFriendRequest() {
        if (!currentPendingRequestCharId || !currentPendingRequestId) return;
        var char = db.characters.find(function (c) { return c.id === currentPendingRequestCharId; });
        var req = char && (char.friendRequests || []).find(function (r) { return r.id === currentPendingRequestId; });
        if (!char || !req) { closeFriendRequestModal(); return; }

        req.status = 'rejected';
        req.respondedAt = Date.now();
        char.blockReapply = char.blockReapply || {};
        char.blockReapply.pendingRequestId = null;

        if (typeof saveData === 'function') saveData();
        if (typeof showToast === 'function') showToast('已拒绝 ' + (char.realName || char.remarkName) + ' 的好友申请');
        closeFriendRequestModal();
    }

    function checkBlockedCharacterRequests() {
        if (!db.characters || !Array.isArray(db.characters)) return;
        var now = Date.now();
        db.characters.filter(function (c) { return c.isBlocked; }).forEach(function (char) {
            if (char.blockReapply && char.blockReapply.pendingRequestId) return;
            var lastTime = (char.blockReapply && char.blockReapply.lastRequestTime) || char.blockedAt;
            if (!lastTime) return;

            if ((char.blockReapply && char.blockReapply.mode) === 'auto') {
                var nextCheck = char.blockReapply.nextCheckTime || char.blockedAt;
                if (now < nextCheck) return;
                aiDecideAndMaybeSendRequest(char);
            } else {
                var interval = ((char.blockReapply && char.blockReapply.fixedInterval) || 30) * 60 * 1000;
                if (now - lastTime < interval) return;
                generateAndShowFriendRequest(char);
            }
        });
    }

    function startBlockSystemInterval() {
        if (blockSystemIntervalId) return;
        blockSystemIntervalId = setInterval(checkBlockedCharacterRequests, 60000);
    }

    function blockCharacter(charId, mode, fixedInterval) {
        var char = db.characters.find(function (c) { return c.id === charId; });
        if (!char) return;
        char.isBlocked = true;
        char.blockedAt = Date.now();
        if (!char.blockHistory) char.blockHistory = [];
        char.blockHistory.push({ blockedAt: Date.now(), unblockedAt: null });
        if (!char.friendRequests) char.friendRequests = [];
        char.blockReapply = {
            mode: mode || 'fixed',
            fixedInterval: fixedInterval || 30,
            lastRequestTime: null,
            nextCheckTime: null,
            pendingRequestId: null
        };
        if (typeof saveData === 'function') saveData();
        if (typeof renderChatList === 'function') renderChatList();
        if (typeof showToast === 'function') showToast('已拉黑该角色');
        if (typeof switchScreen === 'function') switchScreen('chat-list-screen');
    }

    function unblockCharacter(charId) {
        var char = db.characters.find(function (c) { return c.id === charId; });
        if (!char) return;
        char.isBlocked = false;
        char.blockedAt = null;
        if (char.blockReapply) char.blockReapply.pendingRequestId = null;
        var lastBlock = char.blockHistory && char.blockHistory[char.blockHistory.length - 1];
        if (lastBlock) lastBlock.unblockedAt = Date.now();
        if (typeof saveData === 'function') saveData();
        if (typeof renderChatList === 'function') renderChatList();
        if (typeof showToast === 'function') showToast('已解除拉黑');
    }

    // 角色主动拉黑用户（由 AI 回复中的 [char-action:block-user|reason:xxx] 触发）
    function charBlockUser(charId, reason) {
        var char = db.characters.find(function (c) { return c.id === charId; });
        if (!char) return;
        char.isBlockedByChar = true;
        char.blockedByCharAt = Date.now();
        char.blockedByCharReason = (reason || '').trim() || '不想再聊了';
        if (!char.charBlockHistory) char.charBlockHistory = [];
        char.charBlockHistory.push({ blockedAt: Date.now(), reason: char.blockedByCharReason, unblockedAt: null });
        if (typeof saveData === 'function') saveData();
        if (typeof renderChatList === 'function') renderChatList();
        if (typeof showToast === 'function') showToast('对方已将你拉黑');
        var overlay = document.getElementById('char-blocked-overlay');
        if (overlay) overlay.style.display = 'flex';
    }

    // 用户提交好友申请 → 立即调 API 让角色决定接受/拒绝，几秒内返回
    async function submitUserFriendRequest(charId, reason) {
        var char = db.characters.find(function (c) { return c.id === charId; });
        if (!char || !char.isBlockedByChar) return { ok: false, error: '当前未被该角色拉黑' };
        var userRequests = char.userFriendRequests || [];
        var lastRejects = userRequests.filter(function (r) { return r.status === 'rejected'; });
        var prompt = '你是「' + (char.realName || char.remarkName || '角色') + '」，你的人设：\n' + getEffectivePersonaForBlock(char) + '\n\n';
        prompt += '你之前拉黑了用户。用户现在发来好友申请，申请理由：「' + (reason || '').trim().slice(0, 200) + '」。\n';
        prompt += '这是用户第 ' + (userRequests.length + 1) + ' 次申请。';
        if (lastRejects.length > 0) {
            prompt += ' 之前你拒绝过 ' + lastRejects.length + ' 次，用户之前的申请理由分别是：';
            lastRejects.forEach(function (r, i) { prompt += ' 第' + (i + 1) + '次「' + (r.reason || '').slice(0, 80) + '」；'; });
            prompt += '\n';
        }
        prompt += '请以 JSON 格式回复，且只输出这一行，不要其他内容：\n';
        prompt += '{"accept":true或false,"rejectReason":"若accept为false则写拒绝理由(30字内)"}\n';

        var result = await callBlockApi('你是一个角色扮演助手。请严格只输出要求的 JSON，不要 markdown 代码块，不要多余文字。', prompt);
        if (!result.ok) {
            if (typeof showToast === 'function') showToast('好友申请失败：' + (result.error || 'API 错误'));
            return result;
        }
        var accept = false;
        var rejectReason = '';
        try {
            var jsonStr = result.text.replace(/^[\s\S]*?\{/, '{').replace(/\}[\s\S]*$/, '}');
            var obj = JSON.parse(jsonStr);
            accept = !!obj.accept;
            rejectReason = (obj.rejectReason || '').trim().slice(0, 100);
        } catch (e) {
            accept = false;
            rejectReason = '我还没想好。';
        }
        var requestId = 'ureq_' + Date.now();
        if (!char.userFriendRequests) char.userFriendRequests = [];
        char.userFriendRequests.push({
            id: requestId,
            reason: (reason || '').trim(),
            status: accept ? 'accepted' : 'rejected',
            createdAt: Date.now(),
            respondedAt: Date.now(),
            rejectReason: rejectReason
        });
        if (accept) {
            char.isBlockedByChar = false;
            char.blockedByCharAt = null;
            char.blockedByCharReason = '';
            var lastEntry = char.charBlockHistory && char.charBlockHistory[char.charBlockHistory.length - 1];
            if (lastEntry) lastEntry.unblockedAt = Date.now();
            if (!char.history) char.history = [];
            char.history.push({
                id: 'msg_system_' + Date.now(),
                role: 'system',
                content: '[system-display:你已通过对方的好友申请，可以继续聊天]',
                parts: [],
                timestamp: Date.now()
            });
            if (typeof saveData === 'function') saveData();
            if (typeof renderChatList === 'function') renderChatList();
            var overlay = document.getElementById('char-blocked-overlay');
            if (overlay) overlay.style.display = 'none';
            if (typeof showToast === 'function') showToast('对方已同意你的好友申请');
            if (typeof renderMessages === 'function') renderMessages(false, true);
        } else {
            if (typeof saveData === 'function') saveData();
            if (typeof showToast === 'function') showToast('对方拒绝了你：' + (rejectReason || '未说明理由'));
        }
        return { ok: true, accept: accept, rejectReason: rejectReason };
    }

    window.blockCharacter = blockCharacter;
    window.unblockCharacter = unblockCharacter;
    window.charBlockUser = charBlockUser;
    window.submitUserFriendRequest = submitUserFriendRequest;
    window.generateAndShowFriendRequest = generateAndShowFriendRequest;
    window.checkBlockedCharacterRequests = checkBlockedCharacterRequests;
    window.acceptFriendRequest = acceptFriendRequest;
    window.rejectFriendRequest = rejectFriendRequest;

    document.addEventListener('DOMContentLoaded', function () {
        startBlockSystemInterval();
        var acceptBtn = document.getElementById('friend-request-accept-btn');
        var rejectBtn = document.getElementById('friend-request-reject-btn');
        if (acceptBtn) acceptBtn.addEventListener('click', acceptFriendRequest);
        if (rejectBtn) rejectBtn.addEventListener('click', rejectFriendRequest);

        var modal = document.getElementById('friend-request-modal');
        if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) closeFriendRequestModal(); });

        // 角色拉黑用户后的覆盖层：「让TA说说」→ 调 API 让角色发一轮话
        var charBlockedSayBtn = document.getElementById('char-blocked-say-btn');
        if (charBlockedSayBtn) {
            charBlockedSayBtn.addEventListener('click', function () {
                if (typeof currentChatId === 'undefined' || typeof currentChatType === 'undefined') return;
                var char = db.characters && db.characters.find(function (c) { return c.id === currentChatId; });
                if (!char || !char.isBlockedByChar) return;
                if (typeof getAiReply === 'function') getAiReply(currentChatId, currentChatType, false, false, true);
            });
        }
        // 「发送好友申请」→ 弹出理由输入框，提交后立即调 API 几秒内返回
        var charBlockedFriendBtn = document.getElementById('char-blocked-friend-request-btn');
        var userReqModal = document.getElementById('user-friend-request-modal');
        var userReqInput = document.getElementById('user-friend-request-reason');
        var userReqSubmit = document.getElementById('user-friend-request-submit');
        var userReqCancel = document.getElementById('user-friend-request-cancel');
        if (userReqCancel) userReqCancel.addEventListener('click', function () {
            if (userReqModal) userReqModal.classList.remove('visible');
            if (userReqSubmit) { userReqSubmit.disabled = false; userReqSubmit.textContent = '提交'; }
        });
        if (userReqModal) userReqModal.addEventListener('click', function (e) {
            if (e.target === userReqModal) {
                userReqModal.classList.remove('visible');
                if (userReqSubmit) { userReqSubmit.disabled = false; userReqSubmit.textContent = '提交'; }
            }
        });
        if (charBlockedFriendBtn && userReqModal && userReqInput && userReqSubmit) {
            charBlockedFriendBtn.addEventListener('click', function () {
                if (typeof currentChatId === 'undefined') return;
                var char = db.characters && db.characters.find(function (c) { return c.id === currentChatId; });
                if (!char || !char.isBlockedByChar) return;
                userReqInput.value = '';
                userReqModal.classList.add('visible');
                userReqInput.focus();
            });
            userReqSubmit.addEventListener('click', async function () {
                if (typeof currentChatId === 'undefined') return;
                var reason = (userReqInput.value || '').trim();
                userReqSubmit.disabled = true;
                userReqSubmit.textContent = '等待对方回复…';
                var result = await submitUserFriendRequest(currentChatId, reason);
                userReqModal.classList.remove('visible');
                userReqSubmit.disabled = false;
                userReqSubmit.textContent = '提交';
                if (result && !result.ok && result.error && typeof showToast === 'function') showToast(result.error);
            });
        }
    });
})();
