// 单聊资料自主修改：权限按当前角色隔离，保存成功后才向用户展示结果。
(function () {
    const fields = {
        characterRemark: { key: 'remarkName', permission: 'allowCharacterRemarkUpdate', input: 'setting-char-remark', toggle: 'setting-allow-character-remark-update', label: '自己的备注', max: 24 },
        userRemark: { key: 'userRemarkName', permission: 'allowUserRemarkUpdate', input: 'setting-user-remark', toggle: 'setting-allow-user-remark-update', label: '给你的备注', max: 24 },
        characterPoke: { key: 'pokeCharacterSuffix', permission: 'allowCharacterPokeUpdate', input: 'setting-poke-char-suffix', toggle: 'setting-allow-character-poke-update', label: '自己的拍一拍后缀', max: 20, poke: true },
        userPoke: { key: 'pokeUserSuffix', permission: 'allowUserPokeUpdate', input: 'setting-poke-user-suffix', toggle: 'setting-allow-user-poke-update', label: '你的拍一拍后缀', max: 20, poke: true }
    };
    const queues = new Map();
    const byId = id => document.getElementById(id);
    const allowed = (chat, field) => chat[field.permission] === true && (!field.poke || chat.pokeEnabled === true);

    function validate(value, field, ownRemark = false) {
        if (typeof value !== 'string') throw new Error('请填写文字');
        const text = value.trim();
        if (ownRemark && !text) throw new Error('角色备注不能为空');
        if (text.length > field.max) throw new Error(`最多填写 ${field.max} 个字符`);
        if (/[<>\u0000-\u001f\u007f]/.test(text)) throw new Error('请使用单行纯文字');
        return text;
    }

    function loadSettings(chat) {
        for (const field of Object.values(fields)) {
            if (byId(field.toggle)) byId(field.toggle).checked = chat[field.permission] === true;
        }
        if (byId('setting-user-remark')) byId('setting-user-remark').value = chat.userRemarkName || '';
        const enabled = byId('setting-user-nickname-enabled');
        const visible = byId('setting-user-nickname-visible');
        const nickname = byId('setting-user-nickname');
        if (enabled && visible && nickname) {
            enabled.checked = chat.userNicknameEnabled === true;
            visible.checked = chat.userNicknameVisible === true;
            nickname.value = chat.userNickname || '';
            enabled.onchange = () => { visible.disabled = !enabled.checked; };
            enabled.onchange();
        }
    }

    function getUserNickname(chat) {
        return chat?.userNicknameEnabled === true && typeof chat.userNickname === 'string' ? chat.userNickname.trim() : '';
    }

    function getVisibleUserNickname(chat) {
        return chat.userNicknameVisible === true ? getUserNickname(chat) : '';
    }

    function nicknamePrompt(chat) {
        const nickname = getVisibleUserNickname(chat);
        return nickname ? `【旁白】用户在这个聊天里的网名是 ${JSON.stringify(nickname)}。可以在合适时用网名称呼用户，消息格式中的身份名字仍是 ${JSON.stringify(chat.myName || '用户')}。` : '';
    }

    function saveNicknameSettings(chat) {
        const enabled = byId('setting-user-nickname-enabled');
        const visible = byId('setting-user-nickname-visible');
        const input = byId('setting-user-nickname');
        if (!enabled || !visible || !input) return;
        const nickname = validate(input.value, { max: 24 });
        const previous = getVisibleUserNickname(chat);
        chat.userNicknameEnabled = enabled.checked;
        chat.userNicknameVisible = visible.checked;
        chat.userNickname = nickname;
        const shared = getVisibleUserNickname(chat);
        if (shared && shared !== previous) {
            const action = previous ? '你将公开的网名改为' : '你向角色公开了网名';
            (chat.history ||= []).push({
                id: `nickname_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                type: 'profile_update', role: 'system', timestamp: Date.now(),
                content: '[system-display:聊天网名旁白]', displayText: `${action}「${shared}」`,
                isUserNicknameNotice: true, isContextDisabled: true, excludeFromContext: true
            });
        }
    }

    function saveSettings(chat) {
        const input = byId('setting-user-remark');
        // 先校验再写入，避免无效输入导致开关只保存一半。
        const remark = input ? validate(input.value, fields.userRemark) : chat.userRemarkName;
        saveNicknameSettings(chat);
        for (const field of Object.values(fields)) {
            if (byId(field.toggle)) chat[field.permission] = byId(field.toggle).checked;
        }
        if (input) chat.userRemarkName = remark;
    }

    function prompt(chat) {
        const enabled = Object.entries(fields).filter(([, field]) => allowed(chat, field));
        if (!enabled.length && !chat.userRemarkName) return nicknamePrompt(chat);
        const lines = ['【单聊备注与拍一拍资料】', `用户的身份名字是 ${JSON.stringify(chat.myName || '')}；你给用户的独立备注是 ${JSON.stringify(chat.userRemarkName || '')}。独立备注可自然用于称呼，但不能替换消息格式中的用户名字。`];
        lines.push(`你在此单聊的当前备注是 ${JSON.stringify(chat.remarkName || chat.realName || '')}，当前双方被拍后缀分别是 ${JSON.stringify(chat.pokeCharacterSuffix || '')}、${JSON.stringify(chat.pokeUserSuffix || '')}。`);
        if (enabled.length) {
            lines.push('仅在关系或当前对话适合时偶尔自主修改，不必每轮使用。以下为本轮获准的修改类型；未列出的类型禁止修改。每项每轮最多一次，不修改真名、用户身份名字、其他角色或群聊资料。');
            for (const [name, field] of enabled) {
                lines.push(`- 修改${field.label}： [PROFILE:${name}="新内容"]，内容为 JSON 字符串，最多 ${field.max} 个字符，单行纯文字${name === 'characterRemark' ? '且不能为空' : '；空字符串表示清空'}。`);
            }
            lines.push('每条指令各占一行，独立放在普通消息之外，不在思考、代码块、引用示例或互动页面中输出；系统负责保存和展示修改提示，无须另发一条声称修改成功的消息。');
        }
        const narration = nicknamePrompt(chat);
        if (narration) lines.push(narration);
        return lines.join('\n');
    }

    function renderMessage(message) {
        const wrapper = document.createElement('div');
        wrapper.className = 'message-wrapper system-notification';
        wrapper.dataset.id = message.id;
        const bubble = document.createElement('span');
        bubble.className = 'system-notification-bubble';
        bubble.textContent = message.displayText;
        wrapper.appendChild(bubble);
        return wrapper;
    }

    function refresh(chat, changes) {
        if (typeof currentChatId !== 'undefined' && typeof currentChatType !== 'undefined' && currentChatId === chat.id && currentChatType === 'private') {
            const title = byId('chat-room-title');
            const name = byId('setting-char-name-display');
            if (title) title.textContent = chat.remarkName || chat.realName || '';
            if (name) name.textContent = chat.remarkName || chat.realName || '';
            for (const change of changes) {
                const input = byId(change.field.input);
                // 保留用户已输入但尚未保存的内容，只同步未编辑的旧值。
                if (input && input.value === (change.before || '')) input.value = change.value;
            }
        }
        if (typeof renderChatList === 'function') renderChatList();
        if (typeof renderContactList === 'function') renderContactList();
    }

    async function applyCommands(text, chat, chatType, shouldStop) {
        const changes = [];
        const used = new Set();
        // 思考与代码示例都不是操作；即使思考标签未闭合也不执行其中的指令。
        const source = String(text || '').replace(/<(thinking|think)>[\s\S]*?(?:<\/\1>|$)/gi, '').replace(/(```|~~~)[\s\S]*?(?:\1|$)/g, block => block.replace(/\[PROFILE:[^\r\n]*?\]/gi, ''));
        const cleaned = source.replace(/^[ \t]*\[PROFILE:([a-zA-Z]+)=("(?:[^"\\\r\n]|\\.)*"|[^\]\r\n]*)\][ \t]*\r?$/gm, (raw, name, encoded) => {
            const field = fields[name];
            if (!field || chatType !== 'private' || !chat || !allowed(chat, field) || used.has(name) || shouldStop?.()) return '';
            // 始终按请求目标处理，不能用正在看的聊天替代请求目标。
            if (typeof db === 'undefined' || !db.characters?.includes(chat)) return '';
            try {
                const value = validate(JSON.parse(encoded), field, name === 'characterRemark');
                used.add(name);
                if (value !== (chat[field.key] || '')) changes.push({ field, value, before: chat[field.key], existed: Object.hasOwn(chat, field.key) });
            } catch (_) { /* 无效内容被移除，不执行、不泄露内部指令。 */ }
            return '';
        }).replace(/\[PROFILE:[a-zA-Z]+="(?:[^"\\\r\n]|\\.)*"\]/gi, '').replace(/\[PROFILE:[^\]\r\n]*(?:\]|$)/gim, '').replace(/\n{3,}/g, '\n\n').trim();
        if (!changes.length || shouldStop?.()) return { cleaned, messages: [], ok: true };
        const messages = changes.map((change, index) => {
            const displayText = change.value ? `TA 将${change.field.label}改为「${change.value}」` : `TA 清空了${change.field.label}`;
            return {
                id: `profile_${Date.now()}_${Math.random().toString(36).slice(2)}_${index}`,
                type: 'profile_update', role: 'system', timestamp: Date.now(),
                content: `[system-display:${displayText}]`, displayText,
                isContextDisabled: true,
                profileChange: { field: change.field.key, before: change.before || '', after: change.value }
            };
        });
        changes.forEach(change => { chat[change.field.key] = change.value; });
        chat.history = chat.history || [];
        chat.history.push(...messages);
        try {
            if (typeof saveCharacter !== 'function' || await saveCharacter(chat.id) !== true) throw new Error('资料未保存');
        } catch (error) {
            for (const change of changes) {
                if (chat[change.field.key] !== change.value) continue;
                if (change.existed) chat[change.field.key] = change.before;
                else delete chat[change.field.key];
            }
            const ids = new Set(messages.map(message => message.id));
            chat.history = chat.history.filter(message => !ids.has(message.id));
            if (typeof showToast === 'function') showToast('备注或拍一拍修改未保存，已恢复原值，请重试保存');
            return { cleaned, messages: [], ok: false };
        }
        refresh(chat, changes);
        return { cleaned, messages, ok: true };
    }

    async function consumeAiCommands(text, chat, chatType, shouldStop) {
        const key = `${chatType}:${chat?.id || ''}`;
        const previous = queues.get(key) || Promise.resolve();
        const task = previous.catch(() => {}).then(() => applyCommands(text, chat, chatType, shouldStop));
        queues.set(key, task);
        try { return await task; }
        finally { if (queues.get(key) === task) queues.delete(key); }
    }

    window.CharacterProfile = { loadSettings, saveSettings, prompt, getUserNickname, nicknamePrompt, consumeAiCommands, renderMessage };
})();
