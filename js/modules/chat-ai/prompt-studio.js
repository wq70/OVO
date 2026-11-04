(function () {
    const CATEGORY_LABELS = {
        core: '核心环境',
        persona: '角色与用户',
        context: '动态上下文',
        memory: '记忆与关系',
        capability: '聊天能力',
        format: '输出规则',
        custom: '自定义'
    };

    const VARIABLE_CATALOG = [
        ['time', '时间与环境', [
            ['{{当前时间}}', '当前时间'], ['{{当前日期}}', '当前日期'], ['{{角色当地时间}}', '角色当地时间'],
            ['{{用户当地时间}}', '用户当地时间'], ['{{天气信息}}', '完整天气环境']
        ]],
        ['persona', '角色与用户', [
            ['{{角色名}}', '角色名'], ['{{角色状态}}', '角色状态'], ['{{角色人设}}', '角色人设'],
            ['{{用户称呼}}', '用户称呼'], ['{{用户人设}}', '用户人设'], ['{{角色生日}}', '角色生日'],
            ['{{角色年龄}}', '角色年龄'], ['{{用户生日}}', '用户生日'], ['{{用户年龄}}', '用户年龄'],
            ['{{角色时间年龄通知}}', '角色年龄与时区通知'], ['{{用户时间年龄通知}}', '用户年龄与时区通知']
        ]],
        ['world', '世界书', [
            ['{{世界书_前}}', '角色定义前'], ['{{世界书_中}}', '角色定义中'], ['{{世界书_后}}', '角色定义后'],
            ['{{世界书_全部}}', '全部世界书']
        ]],
        ['context', '动态功能模块', [
            ['{{当前节点}}', '当前剧情节点'], ['{{身份与伪装}}', '论坛小号/主号身份'], ['{{关系与功能上下文}}', '拉黑、亲属卡、窥屏、手机等'],
            ['{{角色增强上下文}}', '提醒、头像、活人运转'], ['{{状态栏要求}}', '状态栏输出要求'], ['{{动态能力与已看内容}}', '已启用的动态能力与实际已看内容']
        ]],
        ['memory', '记忆', [
            ['{{共同回忆}}', '当前记忆模式内容'], ['{{用户收藏内容}}', '用户收藏的消息']
        ]],
        ['rules', '规则与格式', [
            ['{{在线逻辑规则}}', '特殊消息与聊天功能'], ['{{输出格式}}', '全部消息格式'], ['{{双语规则}}', '双语模式规则'],
            ['{{回复条数规则}}', '回复条数'], ['{{自主收藏规则}}', '角色自主收藏协议']
        ]]
    ];

    function uid(prefix) {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
        return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function item(id, name, category, content, condition = 'always', protectedItem = false) {
        return { id, name, category, content, condition, enabled: true, protected: protectedItem };
    }

    function createDefaultItems() {
        return [
            item('core.scene', '聊天场景', 'core', '你正在一个名为“404”的线上聊天软件中扮演一个角色。请严格遵守以下规则：', 'always', true),
            item('core.time', '当前时间', 'core', '核心规则：\nA. 当前时间：现在是 {{当前时间}}。你应知晓当前时间，但除非对话内容明确相关，否则不要主动提及或评论时间。'),
            item('core.character-age', '角色年龄与时区', 'core', '{{角色时间年龄通知}}', 'characterTime'),
            item('core.online-only', '纯线上互动', 'core', 'B. 纯线上互动：这是一个完全虚拟的线上聊天。你扮演的角色和我之间没有任何线下关系。严禁提出任何关于线下见面、现实世界互动或转为其他非本平台联系方式的建议。你必须始终保持在线角色的身份。', 'onlineRole'),
            item('context.weather', '天气与环境', 'context', '{{天气信息}}', 'weather'),
            item('context.node', '当前剧情节点', 'context', '{{当前节点}}', 'activeNode'),
            item('persona.world-before', '世界书·前', 'persona', '{{世界书_前}}', 'worldBefore'),
            item('persona.world-middle', '世界书·中', 'persona', '{{世界书_中}}', 'worldMiddle'),
            item('persona.character', '角色身份与人设', 'persona', '<char_settings>\n你的角色名是：{{角色名}}。我的称呼是：{{用户称呼}}。你的当前状态是：{{角色状态}}。\n你的角色设定是：{{角色人设}}\n{{身份与伪装}}\n</char_settings>', 'always', true),
            item('persona.world-after', '世界书·后', 'persona', '{{世界书_后}}', 'worldAfter'),
            item('persona.user', '用户人设', 'persona', '<user_settings>\n关于我的人设：{{用户人设}}\n{{用户时间年龄通知}}\n</user_settings>', 'userContext'),
            item('context.relationship', '关系与手机功能', 'context', '{{关系与功能上下文}}', 'relationshipContext'),
            item('context.enhancements', '提醒、头像与活人运转', 'context', '{{角色增强上下文}}', 'enhancementContext'),
            item('context.moments', '动态能力与已看内容', 'context', '{{动态能力与已看内容}}', 'moments'),
            item('memory.primary', '共同回忆', 'memory', '<memoir>\n{{共同回忆}}\n</memoir>', 'memory'),
            item('capability.logic', '在线互动逻辑', 'capability', '<logic_rules>\n{{在线逻辑规则}}\n</logic_rules>', 'always', true),
            item('format.status-panel', '状态栏要求', 'format', '{{状态栏要求}}', 'statusPanel'),
            item('format.protocols', '消息输出格式', 'format', '<output_formats>\n你的输出格式必须严格遵循以下格式：{{输出格式}}\n</output_formats>', 'always', true),
            item('format.bilingual', '双语模式', 'format', '{{双语规则}}', 'bilingual'),
            item('format.reply-count', '回复条数', 'format', '{{回复条数规则}}', 'always'),
            item('format.special-messages', '特殊消息使用原则', 'format', '请把语音、撤回、转账、商城互动、更新状态、引用、定位等特殊格式视为增强互动的调味剂，自然、主动且多样地使用，不要频繁重复。'),
            item('format.anti-repeat', '防复读', 'format', '在本轮回复中必须区别于过往聊天记录，变换句式和词汇，不要重复或模仿历史记录的文本结构。'),
            item('format.keep-chatting', '保持对话', 'format', '不要主动终止聊天进程，除非我明确提出。保持你的人设，自然地进行对话。'),
            item('capability.auto-favorite', '角色自主收藏', 'capability', '{{自主收藏规则}}', 'autoFavorite'),
            item('memory.user-favorites', '用户收藏内容', 'memory', '{{用户收藏内容}}', 'userFavorites')
        ];
    }

    function calculateAge(value) {
        if (!value) return { birthday: '', age: '', isBirthday: false };
        const birthday = new Date(value);
        if (Number.isNaN(birthday.getTime())) return { birthday: value, age: '', isBirthday: false };
        const today = new Date();
        let age = today.getFullYear() - birthday.getFullYear();
        const monthDelta = today.getMonth() - birthday.getMonth();
        if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthday.getDate())) age--;
        return {
            birthday: `${birthday.getFullYear()}年${birthday.getMonth() + 1}月${birthday.getDate()}日`,
            age: String(Math.max(0, age)),
            isBirthday: today.getMonth() === birthday.getMonth() && today.getDate() === birthday.getDate()
        };
    }

    function buildGroupMemory(character) {
        if (!character.syncGroupMemory || !Array.isArray(db.groups)) return '';
        let groups = db.groups.filter(group => group.members?.some(member => member.originalCharId === character.id));
        if (Array.isArray(character.syncGroupIds) && character.syncGroupIds.length) {
            groups = groups.filter(group => character.syncGroupIds.includes(group.id));
        }
        let result = '';
        groups.forEach(group => {
            let journals = (group.memoryJournals || []).filter(entry => entry.isFavorited);
            const summaryCount = Number(character.groupMemorySummaryCount) || 0;
            if (summaryCount > 0) journals = journals.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, summaryCount);
            const journalText = journals.map(entry => `标题：${entry.title}\n内容：${entry.content}`).join('\n\n---\n\n');
            let history = (group.history || []).slice(-(Number(character.groupMemoryHistoryCount) || 20));
            if (typeof filterHistoryForAI === 'function') history = filterHistoryForAI(group, history);
            history = history.filter(message => !message.isContextDisabled);
            if (!journalText && !history.length) return;
            result += `\n【群聊“${group.name}”的背景信息】\n`;
            if (journalText) result += `群聊总结：\n${journalText}\n`;
            if (history.length) {
                const historyText = history.map(message => {
                    const content = message.parts?.length ? message.parts.map(part => part.text || '[图片]').join('') : message.content;
                    const sender = message.senderId
                        ? (group.members.find(member => member.id === message.senderId)?.groupNickname || '未知')
                        : (message.role === 'user' ? group.me?.nickname : '系统');
                    return `${sender}: ${content || ''}`;
                }).join('\n');
                result += `最近群聊记录：\n${historyText}\n`;
            }
        });
        return result ? `【群聊记忆互通】\n以下是你所在群聊的相关背景信息：${result}` : '';
    }

    function buildMemory(character) {
        let primary = '';
        if (character.memoryMode === 'table' && typeof getMemoryTableContextBlock === 'function') primary = getMemoryTableContextBlock(character) || '';
        else if (character.memoryMode === 'vector' && typeof getVectorMemoryContextBlock === 'function') primary = getVectorMemoryContextBlock(character) || '';
        else {
            const journals = (character.memoryJournals || []).filter(entry => entry.isFavorited)
                .map(entry => `标题：${entry.title}\n内容：${entry.content}`).join('\n\n---\n\n');
            if (journals) primary = `【共同回忆】\n这是你需要长期记住的、我们之间发生过的往事背景：\n${journals}`;
        }
        return [primary, buildGroupMemory(character)].filter(Boolean).join('\n\n');
    }

    function buildIdentity(character, linkedChar) {
        if (!linkedChar) return '';
        return `【双重身份与伪装规则】\n你当前正在使用论坛小号（网名：${character.realName}）与我聊天，但你的真实身份是${linkedChar.realName}。\n表面伪装设定：${getEffectivePersona(character)}\n真实性格和设定：${getEffectivePersona(linkedChar)}\n在未被识破前保持马甲，但真实性格、态度和习惯可以自然流露；被明确揭穿后，根据人设决定承认或辩解。`;
    }

    function buildAltAccountContext(character) {
        if (!db.forumSettings?.enableCharAltDm) return '';
        const linkedChar = character.source === 'forum' && character.linkedCharId
            ? (db.characters || []).find(entry => entry.id === character.linkedCharId)
            : null;
        const limit = Math.max(1, Number((linkedChar || character).maxMemory) || 20);
        if (linkedChar) {
            const history = (linkedChar.history || []).filter(message => !message.isContextDisabled && (!message.isMomentsActivity || window.Moments?.isChatLinked?.(character.id) !== false)).slice(-limit);
            if (!history.length) return '';
            const lines = history.map(message => `${message.role === 'user' ? '用户' : `主号(${linkedChar.realName || ''})`}：${(message.content || '').trim().slice(0, 200)}`).join('\n');
            return `<main_shared_memory>\n你与主号记忆互通。主号与用户最近的互动：\n${lines}\n</main_shared_memory>`;
        }
        const altCharacters = (db.characters || []).filter(entry => entry.source === 'forum' && entry.linkedCharId === character.id);
        if (!altCharacters.length) return '';
        const sections = [];
        altCharacters.forEach(alt => {
            const forumMessages = (db.forumMessages || []).filter(message =>
                (message.fromUserId === 'user' && message.toUserId === alt.forumUserId)
                || (message.fromUserId === alt.forumUserId && message.toUserId === 'user')
            ).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)).slice(-limit);
            const chatMessages = (alt.history || []).filter(message => !message.isContextDisabled && (!message.isMomentsActivity || window.Moments?.isChatLinked?.(character.id) !== false)).slice(-limit);
            const lines = [];
            forumMessages.forEach(message => lines.push(`- ${message.fromUserId === 'user' ? '用户论坛账号' : '角色小号'}：${(message.content || '').trim().slice(0, 200)}`));
            chatMessages.forEach(message => lines.push(`- ${message.role === 'user' ? '用户' : '小号'}：${(message.content || '').trim().slice(0, 200)}`));
            if (lines.length) sections.push(`小号“${alt.realName || alt.forumUserId || '未命名'}”：\n${lines.join('\n')}`);
        });
        return sections.length ? `<alt_shared_memory>\n你知道自己论坛小号发生的互动，但必须区分对方使用的论坛账号，不得在无证据时把陌生小号认定为用户本人。\n${sections.join('\n\n')}\n</alt_shared_memory>` : '';
    }

    function buildFamilyCards(character) {
        const familyCards = db.piggyBank?.familyCards || [];
        const receivedCards = db.piggyBank?.receivedFamilyCards || [];
        const fromUser = familyCards.find(card => card.targetCharId === character.id && card.status === 'active');
        const toUser = receivedCards.find(card => card.fromCharId === character.id && card.status === 'active');
        const blocks = [];
        function transactions(card) {
            return (card.transactions || []).slice(0, 5).map(entry => `${entry.time ? new Date(entry.time).toLocaleDateString('zh-CN') : ''} ${entry.scene || ''} ${entry.detail || ''} -${entry.amount || 0}`).join('\n');
        }
        if (fromUser) {
            const recent = transactions(fromUser);
            blocks.push(`<family_card_from_user>\n你从${character.myName}处收到了亲属卡（${fromUser.bankName || '亲属卡'} *${fromUser.cardNumber || ''}）。额度：${fromUser.limit}元，已用：${fromUser.usedAmount || 0}元，剩余：${fromUser.limit - (fromUser.usedAmount || 0)}元。${recent ? `\n最近消费记录：\n${recent}` : ''}\n</family_card_from_user>`);
        }
        if (toUser) {
            const recent = transactions(toUser);
            blocks.push(`<family_card_to_user>\n你给了${character.myName}一张亲属卡（${toUser.bankName || '亲属卡'} *${toUser.cardNumber || ''}）。额度：${toUser.limit}元，用户已用：${toUser.usedAmount || 0}元，剩余：${toUser.limit - (toUser.usedAmount || 0)}元。${recent ? `\n最近使用记录：\n${recent}` : ''}\n</family_card_to_user>`);
        } else if (character.familyCardEnabled) {
            blocks.push(`<family_card_to_user>\n你目前没有向${character.myName}赠送过亲属卡。只有真实发送赠送指令后才能表示已赠出，不得编造卡号。\n</family_card_to_user>`);
        }
        return blocks.join('\n\n');
    }

    function buildPeekContext(character) {
        const blocks = [];
        const contactMemory = window.PeekMemory?.prompt(character);
        if (contactMemory) blocks.push(contactMemory);
        if (character.peekScreenSettings?.charAwarePeek && character.peekViewedByUser?.length) {
            const viewed = character.peekViewedByUser.map(entry => typeof formatPeekContentForPrompt === 'function' ? formatPeekContentForPrompt(entry) : '').filter(Boolean).join('\n');
            if (viewed) blocks.push(`<peek_awareness>\n用户曾偷看过你的手机，并查看了以下内容。请根据人设和对话氛围自然反应：\n${viewed}\n</peek_awareness>`);
        }
        const conversations = character.peekData?.messages?.conversations;
        if (character.peekScreenSettings?.charAwarePeek && character.peekScreenSettings?.impersonateEnabled && Array.isArray(conversations)) {
            const lines = [];
            conversations.forEach(conversation => {
                const messages = (conversation.history || []).filter(message => message.sender === 'char' && message.isImpersonated);
                if (!messages.length) return;
                const summary = messages.map(message => (message.content || '').trim()).filter(Boolean).slice(0, 5).map(text => text.length > 80 ? `${text.slice(0, 80)}…` : text).join('；');
                lines.push(`与${conversation.partnerName || '某人'}的对话中有人冒充你发送了：${summary || '（若干条消息）'}`);
            });
            if (lines.length) blocks.push(`<peek_impersonation_awareness>\n你发现有人曾用你的手机冒充你发消息：\n${lines.join('\n')}\n</peek_impersonation_awareness>`);
        }
        return blocks.join('\n\n');
    }

    function buildThemeContext(character) {
        if (!character.allowCharSwitchBubbleCss || !character.bubbleCssThemeBindings?.length) return '';
        const list = character.bubbleCssThemeBindings.map(binding => `- ${binding.presetName}${binding.description?.trim() ? `：${binding.description.trim()}` : ''}`).join('\n');
        const current = character.currentBubbleCssPresetName || '当前为自定义样式或默认';
        const changed = character.themeJustChangedByUser?.trim();
        return `<chat_themes>\n你与用户共用的对话主题：\n${list}\n当前使用：${current}${changed ? `\n用户刚刚将主题更换为：${changed}。请根据人设自然反应。` : ''}\n你可以在合适时机使用 [更换主题：主题名] 请求更换。\n</chat_themes>`;
    }

    function buildRelationshipContext(character, opts) {
        const blocks = [];
        const recentUserMessages = (character.history || []).filter(message => message.role === 'user').slice(-15);
        if (recentUserMessages.some(message => message.sentByCharControl)) blocks.push('<subtle_hint>\n用户最近的某些消息可能不太像平时的说话风格，你可根据自己的判断决定是否相信是用户本人发的。\n</subtle_hint>');
        blocks.push(buildAltAccountContext(character));
        blocks.push(buildFamilyCards(character));
        if (typeof buildBlockMemoryContext === 'function') blocks.push(buildBlockMemoryContext(character) || '');
        if (character.canBlockUser !== false) blocks.push('<char_ability>\n你拥有拉黑用户的能力。只在极度愤怒、伤心或不想再对话时，可以在回复末尾添加 [char-action:block-user|reason:你的拉黑理由]。\n</char_ability>');
        if (typeof buildCharBlockMemoryContext === 'function') blocks.push(buildCharBlockMemoryContext(character) || '');
        blocks.push(buildPeekContext(character));
        if (character.phoneControlEnabled && typeof formatUserPhoneStateForPrompt === 'function') {
            let phone = formatUserPhoneStateForPrompt(character) || '';
            if (opts.isPhoneControlRevokeAttempt) phone += '\n用户正在尝试关闭你对TA手机的查看与操控权限。你必须选择 [同意关闭] 或 [拒绝关闭]，并根据人设说明态度和理由。';
            blocks.push(phone);
        }
        blocks.push(buildThemeContext(character));
        return blocks.filter(Boolean).join('\n\n');
    }

    function buildEnhancements(character) {
        const blocks = [];
        if (db.cotSettings?.humanRunEnabled && typeof HUMAN_RUN_PROMPT !== 'undefined') blocks.push(HUMAN_RUN_PROMPT);
        if (typeof generateReminderPrompt === 'function') blocks.push(generateReminderPrompt(character) || '');
        if (window.AvatarSystem && typeof window.AvatarSystem.generateAvatarSystemPrompt === 'function') blocks.push(window.AvatarSystem.generateAvatarSystemPrompt(character) || '');
        return blocks.filter(Boolean).join('\n');
    }

    function buildUserFavorites(character) {
        if (!character.charAwareUserFavorites) return '';
        let favorites = (db.favorites || []).filter(entry => entry.favoriteBy === 'user');
        if (character.awareFavoriteScope !== 'all') favorites = favorites.filter(entry => entry.chatId === character.id && entry.chatType === 'private');
        if (!favorites.length) return '';
        const lines = favorites.map(entry => `- 内容：${entry.content || ''}${entry.note ? ` （用户寄语：${entry.note}）` : ''}`).join('\n');
        return `【用户收藏的内容】\n这是用户主动收藏的消息，你可以借此了解用户的喜好和内心想法：\n${lines}`;
    }

    function buildVariables(character, opts) {
        const now = new Date();
        const linkedChar = character.source === 'forum' && character.linkedCharId ? (db.characters || []).find(entry => entry.id === character.linkedCharId) : null;
        const world = getActiveWorldBooksContents(character);
        const charAge = calculateAge(character.birthday);
        const userAge = calculateAge(character.myBirthday);
        const charLocalTime = character.enableDynamicTimezone && character.charTimezone ? (getLocalTimeInTimezone(character.charTimezone) || '') : '';
        const userLocalTime = character.myEnableDynamicTimezone && character.myTimezone ? (getLocalTimeInTimezone(character.myTimezone) || '') : '';
        const currentTime = charLocalTime || `${now.getFullYear()}年${pad(now.getMonth() + 1)}月${pad(now.getDate())}日 ${pad(now.getHours())}:${pad(now.getMinutes())}`;
        const charNotice = [];
        if (character.enableDynamicAge && charAge.age) charNotice.push(`[系统提示] 你的出生日期是${charAge.birthday}，${charAge.isBirthday ? `今天是你${charAge.age}岁的生日` : `你现在${charAge.age}岁`}。`);
        if (charLocalTime) charNotice.push(`[系统提示] 你当前所在地的当地时间是：${charLocalTime} (${character.charTimezone})。`);
        const userNotice = [];
        if (character.myEnableDynamicAge && userAge.age) userNotice.push(`[系统提示] 与你对话的用户出生于${userAge.birthday}，${userAge.isBirthday ? `今天是其${userAge.age}岁生日` : `现在${userAge.age}岁`}。`);
        if (userLocalTime) userNotice.push(`[系统提示] 用户当前所在地的当地时间是：${userLocalTime} (${character.myTimezone})。`);
        const activeNode = character.activeNodeId && character.nodes ? character.nodes.find(node => node.id === character.activeNodeId) : null;
        const nodeText = activeNode ? `<node_directive>\n当前剧情节点：${activeNode.name}\n${activeNode.prompt || ''}\n</node_directive>` : '';
        const minReply = Number(character.replyCountMin) || 3;
        const maxReply = Number(character.replyCountMax) || 8;
        const replyRule = character.replyCountEnabled
            ? `你可以一次生成多条短消息，每次回复必须限定在${minReply}-${maxReply}条以内，保持数量的随机性和多样性。`
            : '你可以一次生成3-8条短消息，保持数量的随机性和多样性。';
        const bilingual = character.bilingualModeEnabled ? `双语模式：当角色母语为中文以外的语言时，优先使用${character.bilingualLanguage || '符合人设的外语'}，消息必须使用 [${character.realName}的消息：{外语原文}「中文翻译」] 格式；语音消息也必须带中文翻译。` : '';
        const autoFavorite = character.characterAutoFavoriteEnabled ? `【消息收藏功能】\n你可以主动收藏用户发送的重要消息。使用 [FAVORITE:消息ID:收藏寄语]，只收藏用户消息，不要过度收藏，且不在对话中提及收藏行为。` : '';
        return {
            '当前时间': currentTime,
            '当前日期': `${now.getFullYear()}年${pad(now.getMonth() + 1)}月${pad(now.getDate())}日`,
            '角色当地时间': charLocalTime,
            '用户当地时间': userLocalTime,
            '天气信息': opts.weatherText || '',
            '角色名': character.realName || '',
            '用户称呼': character.myName || '',
            '角色状态': character.onlineStatusPromptEnabled === false ? '' : character.status || '在线',
            '角色人设': getEffectivePersona(character) || '',
            '用户人设': character.myPersona || '',
            '角色生日': charAge.birthday,
            '角色年龄': charAge.age,
            '用户生日': userAge.birthday,
            '用户年龄': userAge.age,
            '角色时间年龄通知': charNotice.join('\n'),
            '用户时间年龄通知': userNotice.join('\n'),
            '世界书_前': world.before || '',
            '世界书_中': world.middle || '',
            '世界书_后': world.after || '',
            '世界书_全部': [world.before, world.middle, world.after].filter(Boolean).join('\n'),
            '当前节点': nodeText,
            '身份与伪装': buildIdentity(character, linkedChar),
            '关系与功能上下文': buildRelationshipContext(character, opts),
            '角色增强上下文': buildEnhancements(character),
            '共同回忆': buildMemory(character),
            '在线逻辑规则': getOnlineLogicRules(character, 4),
            '输出格式': getOnlineOutputFormats(character, world.before, world.after),
            '状态栏要求': character.statusPanel?.enabled && character.statusPanel.promptSuffix ? `额外输出要求：${character.statusPanel.promptSuffix}` : '',
            '双语规则': bilingual,
            '回复条数规则': replyRule,
            '自主收藏规则': autoFavorite,
            '用户收藏内容': buildUserFavorites(character),
            '动态能力与已看内容': window.Moments?.promptForCharacter(character.id, !!opts.isBackground) || ''
        };
    }

    function conditionMet(condition, variables) {
        const map = {
            always: true,
            characterTime: !!variables['角色时间年龄通知'],
            onlineRole: !db.apiSettings || db.apiSettings.onlineRoleEnabled !== false,
            weather: !!variables['天气信息'],
            activeNode: !!variables['当前节点'],
            worldBefore: !!variables['世界书_前'],
            worldMiddle: !!variables['世界书_中'],
            worldAfter: !!variables['世界书_后'],
            userContext: !!(variables['用户人设'] || variables['用户时间年龄通知']),
            relationshipContext: !!variables['关系与功能上下文'],
            enhancementContext: !!variables['角色增强上下文'],
            memory: !!variables['共同回忆'],
            statusPanel: !!variables['状态栏要求'],
            bilingual: !!variables['双语规则'],
            autoFavorite: !!variables['自主收藏规则'],
            userFavorites: !!variables['用户收藏内容'],
            moments: !!variables['动态能力与已看内容']
        };
        return condition in map ? map[condition] : true;
    }

    function renderTemplate(content, variables, unresolved) {
        let template = String(content || '');
        if (variables['角色状态'] === '') {
            template = template.replace(/你的当前状态是[：:]\s*\{\{\s*角色状态\s*\}\}[。.]?/g, '')
                .replaceAll('、更新状态、引用、定位', '、引用、定位');
        }
        return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, key) => {
            if (Object.prototype.hasOwnProperty.call(variables, key)) return variables[key] == null ? '' : String(variables[key]);
            unresolved.add(key);
            return match;
        });
    }

    function normalizeItems(items) {
        if (!Array.isArray(items)) return [];
        return items.filter(entry => entry && typeof entry === 'object').map((entry, index) => ({
            id: entry.id || uid('prompt-item'),
            name: String(entry.name || `未命名条目 ${index + 1}`),
            category: CATEGORY_LABELS[entry.category] ? entry.category : 'custom',
            content: String(entry.content || ''),
            condition: entry.condition || 'always',
            enabled: entry.enabled !== false,
            protected: !!entry.protected
        }));
    }

    function resolvePreset(character) {
        const room = db.magicRoom || {};
        const presets = Array.isArray(room.presets) ? room.presets : [];
        const reference = character.customPromptPresetId || character.customPromptPreset;
        if (reference) {
            const preset = presets.find(entry => entry.id === reference || entry.name === reference);
            if (preset) return preset;
        }
        return null;
    }

    function getConfig(character) {
        const room = db.magicRoom || {};
        const preset = resolvePreset(character);
        if (preset) {
            const mode = preset.mode || (Array.isArray(preset.items) ? 'items' : 'source');
            return { enabled: true, mode, items: normalizeItems(preset.items), template: preset.template || '', preset };
        }
        if (!room.customPromptEnabled) return { enabled: false };
        const mode = room.promptEditMode || (Array.isArray(room.customPromptItems) && room.customPromptItems.length ? 'items' : 'source');
        return { enabled: true, mode, items: normalizeItems(room.customPromptItems), template: room.customPromptTemplate || '', preset: null };
    }

    function compile(character, opts = {}) {
        const config = getConfig(character);
        if (!config.enabled || config.mode !== 'items' || !config.items.length) return null;
        return compileItems(character, config.items, opts, config.preset);
    }

    function compileItems(character, items, opts = {}, preset = null) {
        const variables = buildVariables(character, opts);
        const unresolved = new Set();
        const details = [];
        const pieces = [];
        const normalized = normalizeItems(items);
        normalized.forEach((entry, index) => {
            const active = entry.enabled && conditionMet(entry.condition, variables);
            const rendered = active ? renderTemplate(entry.content, variables, unresolved).trim() : '';
            if (rendered) pieces.push(rendered);
            details.push({ id: entry.id, name: entry.name, enabled: entry.enabled, active, text: rendered, order: index });
        });
        if (variables['动态能力与已看内容'] && !normalized.some(entry => entry.id === 'context.moments' || entry.content.includes('{{动态能力与已看内容}}'))) pieces.push(variables['动态能力与已看内容']);
        if (!opts.preview && character.themeJustChangedByUser && pieces.some(piece => piece.includes('<chat_themes>'))) {
            character.themeJustChangedByUser = '';
        }
        const profilePrompt = window.CharacterProfile?.prompt(character);
        if (profilePrompt) {
            pieces.push(profilePrompt);
            details.push({ id: 'capability.character-profile', name: '单聊备注与拍一拍资料', enabled: true, active: true, text: profilePrompt, order: normalized.length });
        }
        if (opts.historyText) pieces.push(opts.historyText);
        return { prompt: pieces.join('\n\n'), details, unresolved: [...unresolved], variables, preset };
    }

    function ensurePresetIds(room) {
        if (!room || !Array.isArray(room.presets)) return false;
        let changed = false;
        room.presets.forEach(preset => {
            if (!preset.id) {
                preset.id = uid('prompt-preset');
                changed = true;
            }
        });
        (db.characters || []).forEach(character => {
            const reference = character.customPromptPresetId || character.customPromptPreset;
            if (!reference) return;
            const preset = room.presets.find(entry => entry.id === reference || entry.name === reference);
            if (preset && character.customPromptPresetId !== preset.id) {
                character.customPromptPresetId = preset.id;
                changed = true;
            }
        });
        return changed;
    }

    window.PromptStudio = {
        CATEGORY_LABELS,
        VARIABLE_CATALOG,
        clone,
        compile,
        compileItems,
        createDefaultItems,
        ensurePresetIds,
        normalizeItems,
        uid,
        renderTemplate,
        buildVariables
    };
})();
