// Shared accounting for prepared requests, previews and provider usage. No prompt/data mutation during preview.
const ChatTokenStats = (() => {
    const ENGINE = 'prepared-context-20261001';
    const measured = new Map(), jobs = new Map(), workers = new Map(), pendingCounts = new Map(), previous = new Map(), sessions = new WeakMap();
    let sequence = 0, timer;
    const auxiliary = { id:'token-auxiliary', history:[] };
    const labels = { systemRules: '系统规则', worldBook: '世界书', charPersona: '角色人设', userPersona: '用户人设', memoir: '共同回忆',
        tableMemory: '表格记忆', vectorMemory: '向量记忆', groupMemory: '群聊记忆', altMemory: '记忆互通', peek: '窥屏知晓', theme: '对话主题',
        sticker: '表情包', humanRun: '活人运转', reminder: '提醒事项', shortTermMemory: '对话历史', cot: 'CoT 与预填', tools: '工具定义与结果', extra: '额外请求内容', framing: '协议开销（估算）' };
    const findChat = (id, type) => (type === 'private' ? db.characters : db.groups)?.find(c => c.id === id);
    function hash(value) {
        const text = typeof value === 'string' ? value : JSON.stringify(value); let a = 2166136261, b = 5381;
        for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
        return `${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}:${text.length}`;
    }
    // Data in actual image/audio blocks is excluded by documents(). If encoded media is
    // embedded in a TEXT block, the server receives text too: count it and diagnose the leak.
    const cleanText = text => String(text || '');
    function weight(text) { let n = 0; for (const c of cleanText(text)) n += /[\u3400-\u9fff]/u.test(c) ? 1.2 : 0.4; return n; }
    function config(chat, type) {
        const base = db.apiSettings || {};
        try { return typeof getApiConfigForFeature === 'function' ? getApiConfigForFeature(type === 'group' ? 'groupChat' : 'chat', base, { chat }) : base; } catch (_) { return base; }
    }
    function encoding(model) {
        if (/^(?:gpt-4o|gpt-4\.1|gpt-5|o[134])(?:-|$)/i.test(model || '')) return 'o200k_base';
        if (/^(?:gpt-3\.5-turbo|gpt-4(?:-turbo|-\d|$))/i.test(model || '')) return 'cl100k_base';
        return '';
    }
    function history(chat, type = 'private') {
        if (typeof getChatRequestHistory === 'function') return getChatRequestHistory(chat, type);
        let list = (chat.history || []).filter(m => m && !m.isMomentsActivity && !m.isUserNicknameNotice).slice(-Math.max(1, Number(chat.maxMemory) || 20));
        if (typeof filterHistoryForAI === 'function') list = filterHistoryForAI(chat, list);
        return list.filter(m => !m.isContextDisabled && !m.excludeFromContext && m.type !== 'mcp_activity' && !m.isThinking && !(typeof m.content === 'string' && m.content.trim().startsWith('<thinking>')));
    }
    function isOffline(chat) {
        const node = chat.nodes?.find(n => n.id === chat.activeNodeId);
        return !!node && (node.customConfig?.baseMode || (node.type === 'offline' || (node.type === 'spinoff' && node.spinoffMode === 'offline') ? 'offline' : 'online')) === 'offline';
    }
    function fallbackMessages(list) {
        return list.map(m => ({ role: m.role === 'char' ? 'assistant' : m.role || 'user', content: m.parts?.length ? m.parts.flatMap(p => p.type === 'image'
            ? [{ type: 'image_url', image_url: { url: p.data || '' } }, ...(p.description ? [{ type: 'text', text: `[图片描述：${p.description}]` }] : [])]
            : p.text ? [{ type: 'text', text: p.text }] : []) : /^data:image\//i.test(m.content || '') ? [{ type: 'image_url', image_url: { url: m.content } }] : m.content || '' }));
    }
    function sources(chat, type, prompt) {
        const result = [], add = (key, text, id = key, desc = '') => { if (typeof text === 'string' && text.trim()) result.push({ key, text: cleanText(text), id: String(id), desc }); };
        const linked = type === 'private' && chat.source === 'forum' ? db.characters?.find(c => c.id === chat.linkedCharId) : null;
        let world = typeof getActiveWorldBooksContents === 'function' ? getActiveWorldBooksContents(chat) : {};
        const node = chat.nodes?.find(n => n.id === chat.activeNodeId);
        if (type === 'group') {
            const offline = isOffline(chat);
            const ids = offline && (chat.offlineWorldBookSelectionExplicit || chat.offlineWorldBookIds?.length) ? chat.offlineWorldBookIds || [] : chat.worldBookIds || [];
            world = { entries: (db.worldBooks || []).filter(w => !w.disabled && (ids.includes(w.id) || w.isGlobal)) };
        }
        if (world.entries?.length) world.entries.forEach(w => add('worldBook', w.content, w.id, `${w.name || '世界书条目'} · ${w.origin || (w.isGlobal ? '全局' : '绑定')} · ${w.reason || '注入'}`));
        else if ((db.worldBooks || []).length) ['before', 'middle', 'after'].forEach(k => add('worldBook', world[k], k));
        (node?.customConfig?.styleWorldBookIds || []).forEach(id => { const w = db.worldBooks?.find(w => w.id === id && !w.disabled); if (w) add('worldBook', w.content, id, `${w.name} · 文风参考`); });
        if (type === 'private') add('charPersona', typeof getEffectivePersona === 'function' ? getEffectivePersona(linked || chat) : chat.persona, (linked || chat).id);
        else (chat.members || []).forEach(m => add('charPersona', m.persona, m.id, m.realName || '群成员'));
        add('userPersona', chat.myPersona || chat.me?.persona);
        for (const [tag, key] of [['group_memories','groupMemory'], ['past_online_chats','shortTermMemory'], ['alt_shared_memory','altMemory'], ['main_shared_memory','altMemory'], ['peek_contact_memory','peek'], ['peek_awareness','peek'], ['peek_impersonation_awareness','peek'], ['chat_themes','theme']]) {
            for (const m of prompt.matchAll(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'g'))) add(key, m[0], tag);
        }
        if (chat.memoryMode === 'table' && typeof getMemoryTableContextBlock === 'function') add('tableMemory', getMemoryTableContextBlock(chat));
        if (chat.memoryMode === 'vector' && typeof getVectorMemoryContextBlock === 'function') add('vectorMemory', getVectorMemoryContextBlock(chat));
        if (!['table', 'vector'].includes(chat.memoryMode)) (chat.memoryJournals || []).filter(j => j.isFavorited).forEach((j, i) => add('memoir', `标题：${j.title}\n内容：${j.content}`, j.id || i, j.title));
        for (const m of prompt.matchAll(/<memoir>[\s\S]*?<\/memoir>/g)) add(chat.memoryMode === 'table' ? 'tableMemory' : chat.memoryMode === 'vector' ? 'vectorMemory' : 'memoir', m[0], 'memoir-wrapper');
        if (typeof HUMAN_RUN_PROMPT !== 'undefined') add('humanRun', HUMAN_RUN_PROMPT);
        if (chat.charReminderEnabled && typeof generateReminderPrompt === 'function') add('reminder', generateReminderPrompt(chat));
        (db.cotPresets || []).forEach(p => (p.items || []).filter(i => i.enabled).forEach(i => add('cot', i.content, i.id || hash(i.content))));
        Object.values(db.cotSettings?.modePolicies || {}).forEach(p => ['triggerContent','prefillContent','simulatedPrefillContent'].forEach(k => add('cot', p[k], k)));
        if (type === 'private' && typeof getAvailablePrivateStickers === 'function') { const list = getAvailablePrivateStickers(chat); if (list.length) add('sticker', list.map(s => s.name).join(', ')); }
        return result;
    }
    function spans(text, candidates, fallback) {
        const ranges = [], overlaps = (a, b) => ranges.some(r => a < r.end && b > r.start);
        // Only source text actually present in the final content can be attributed. Source labels never decide the category.
        for (const c of candidates.filter(c => c.text).sort((a,b) => (a.id === 'memoir-wrapper') - (b.id === 'memoir-wrapper') || b.text.length - a.text.length)) {
            let at = 0; while ((at = text.indexOf(c.text, at)) !== -1) { const end = at + c.text.length; if (!overlaps(at, end)) ranges.push({ start: at, end, key: c.key, id: c.id, desc: c.desc }); at = end; }
        }
        ranges.sort((a,b) => a.start - b.start); const result = []; let at = 0;
        for (const r of ranges) { if (r.start > at) result.push({ start: at, end: r.start, key: fallback, id: fallback }); result.push(r); at = r.end; }
        if (at < text.length) result.push({ start: at, end: text.length, key: fallback, id: fallback }); return result;
    }
    function documents(body, candidates = [], meta = {}) {
        const docs = []; let mediaCount = 0, messageCount = 0, index = 0, encodedMediaText = 0;
        const add = (value, key, role, messageId = '') => {
            if (typeof value !== 'string' || !value) return; const text = cleanText(value);
            if (meta.historyTexts && !['system','developer','tools'].includes(role)) key = meta.historyTexts.includes(value) ? 'shortTermMemory' : key === 'tools' ? 'tools' : 'extra';
            for (const m of text.matchAll(/data:(?:image|audio|video|application)\/[\w.+-]+(?:;[\w=.+-]+)*;base64,[A-Za-z0-9+/=\r\n]+/gi)) encodedMediaText += m[0].length;
            docs.push({ text, role, messageId, spans: spans(text, ['systemRules','extra','cot'].includes(key) ? candidates : [], key) });
        };
        const parts = (content, key, role, id) => {
            if (typeof content === 'string') { add(content, key, role, id); return; }
            for (const p of content || []) {
                if (typeof p === 'string') add(p, key, role, id);
                else if (p.text != null) add(p.text, key, role, id);
                else if (p.type === 'tool_result' || p.type === 'tool_use' || p.functionCall || p.functionResponse) add(JSON.stringify(p), 'tools', role, id);
                else if (p.image_url || ['image','document','input_audio','audio','video'].includes(p.type) || p.inline_data || p.inlineData || p.fileData) mediaCount++;
            }
        };
        for (const m of body.messages || body.contents || []) {
            const system = ['system','developer'].includes(m.role), key = system ? 'systemRules' : m.role === 'tool' ? 'tools' : meta.history && index >= meta.history.length ? 'extra' : 'shortTermMemory';
            if (!system) { messageCount++; index++; }
            parts(m.content ?? m.parts, key, m.role, m.__ovoMessageId || meta.history?.[index - 1]?.id || '');
            if (m.tool_calls) add(JSON.stringify(m.tool_calls), 'tools', m.role); if (m.name) add(m.name, 'framing', m.role);
        }
        parts(body.system, 'systemRules', 'system'); parts(body.systemInstruction?.parts || body.system_instruction?.parts, 'systemRules', 'system');
        if (body.tools) add(JSON.stringify(body.tools), 'tools', 'tools'); if (body.response_format) add(JSON.stringify(body.response_format), 'extra', 'format');
        return { docs, mediaCount, messageCount, encodedMediaText };
    }
    function measure(docs, counts) {
        const map = new Map(); let total = 0;
        docs.forEach((d, index) => {
            let cumulative = 0, assigned = 0;
            d.spans.forEach((s, i) => {
                cumulative += weight(d.text.slice(s.start, s.end)); const next = Math.ceil(cumulative), n = counts ? counts[index]?.[i] || 0 : next - assigned; assigned = next; total += n;
                const entry = map.get(s.key) || { key: s.key, name: labels[s.key] || '其他提示词', value: 0, sources: [] }; entry.value += n;
                if (s.desc || s.id !== s.key || d.messageId) entry.sources.push({ id: s.id, desc: s.desc || '', tokens: n, messageId: d.messageId, chars: s.end - s.start }); map.set(s.key, entry);
            });
        });
        return { total, details: [...map.values()].filter(e => e.value > 0).map(e => ({ ...e, desc: `${e.name}：按实际上下文中的文本归类。\n${e.sources.slice(0,12).map(s => `${s.desc || (s.messageId ? '消息 ' + s.messageId : '来源 ' + s.id)} · ${s.tokens} Token`).join('\n')}` })) };
    }
    function analyze(body, settings = {}, candidates = [], meta = {}) {
        const doc = documents(body, candidates, meta), model = body.model || settings.model || '', enc = encoding(model);
        const fingerprint = hash([ENGINE, model, settings.apiProtocol || settings.provider, doc.docs]), bpe = measured.get(fingerprint), stats = measure(doc.docs, bpe);
        const framing = enc && doc.messageCount ? 3 + (body.messages || []).length * 3 : 0;
        if (framing) { stats.total += framing; stats.details.push({ key: 'framing', name: labels.framing, value: framing, desc: '消息协议包装开销估算，服务端用量可能不同。' }); }
        return { ...stats, ...doc, fingerprint, model, encoding: enc, method: bpe ? `${enc} 文本分词；协议开销估算` : enc ? '字符估算；正在准备模型分词' : '字符估算；模型分词器未知',
            textExact: !!bpe, mediaUnknown: doc.mediaCount > 0, at: Date.now(), pending: meta.pending || [], systemTokens: stats.details.filter(d => d.key !== 'shortTermMemory').reduce((n,d) => n + d.value,0), historyTokens: stats.details.find(d => d.key === 'shortTermMemory')?.value || 0 };
    }
    function historyTexts(chat,type,selected,settings,memberId) {
        const opts = memberId ? { member:chat.members?.find(m => m.id === memberId) } : {};
        const messages = settings.provider === 'gemini' && typeof serializeChatHistoryForGemini === 'function'
            ? serializeChatHistoryForGemini(chat,type,selected,settings,opts)
            : typeof serializeChatHistoryMessages === 'function' ? serializeChatHistoryMessages(chat,type,selected,settings,opts) : fallbackMessages(selected);
        return documents({ messages }).docs.map(d => d.text);
    }
    function preview(chat, type, options = {}) {
        const settings = { ...config(chat,type) }, shadow = { ...chat, ...(options.overrides || {}) }, selected = history(shadow,type), pending = [];
        // Existing memory getters refresh nested caches. Give preview its own state so
        // opening statistics cannot replace the live retrieval/table state.
        for (const key of ['memoryTables','vectorMemory']) if (shadow[key]) shadow[key] = JSON.parse(JSON.stringify(shadow[key]));
        const prompt = type === 'private' ? (typeof generatePrivateSystemPrompt === 'function' ? generatePrivateSystemPrompt(shadow,{ preview:true }) : '') : (typeof generateGroupSystemPrompt === 'function' ? generateGroupSystemPrompt(shadow,{ preview:true }) : '');
        let body, prepared;
        if (settings.provider === 'gemini' && typeof serializeChatHistoryForGemini === 'function') {
            const contents = serializeChatHistoryForGemini(shadow,type,selected,settings); if (contents.at(-1)?.role === 'model') contents.push({ role:'user', parts:[{ text:'[继续对话。]' }] });
            body = { model:settings.model, contents, system_instruction:{ parts:[{ text:prompt }] } };
        } else {
            const messages = [{ role:'system', content:prompt }, ...(typeof serializeChatHistoryMessages === 'function' ? serializeChatHistoryMessages(shadow,type,selected,settings) : fallbackMessages(selected))];
            if (messages.at(-1)?.role === 'assistant') messages.push({ role:'user', content:'[继续对话。]' });
            const offline = isOffline(shadow), cot = type === 'private' && shadow.cotSettings?.enabled ? shadow.cotSettings : db.cotSettings;
            const enabled = offline ? cot?.offlineEnabled : shadow.cotSettings?.enabled ? cot?.chatEnabled : cot?.enabled, mode = offline ? 'offline' : 'chat';
            if (enabled && !db.cotSettings?.modePolicies?.[mode]?.runMode) {
                const presetId = (offline ? cot?.activeOfflinePresetId : cot?.activePresetId) || (offline ? 'default_offline' : 'default');
                const instruction = (db.cotPresets || []).find(p => p.id === presetId)?.items?.filter(i => i.enabled).map(i => i.content).join('\n\n');
                if (instruction) messages.push({ role:'system', content:instruction }, { role:'user', content:'[incipere]' }, { role:'assistant', content:db.apiSettings?.quickReplyEnabled ? '<thinking>\n跳过cot，专注回复\n</thinking>\n[finire]' : '<thinking>' });
            }
            body = { model:settings.model, messages };
        }
        if (db.cotSettings?.modePolicies?.[isOffline(shadow) ? 'offline' : 'chat']?.runMode) pending.push('CoT 规则将在实际发送时确定');
        if (shadow.webSearchEnabled) { try { if (shadow.webSearchPayload?.trim()) Object.assign(body,JSON.parse(shadow.webSearchPayload)); else body.tools = settings.provider === 'gemini' ? [{ googleSearch:{} }] : [{ type:'web_search' }]; } catch (_) { pending.push('联网参数无法解析'); } }
        if (typeof prepareAiProviderRequest === 'function' && settings.url) { try { prepared = prepareAiProviderRequest(settings,body,typeof getApiConfigHeaders === 'function' ? getApiConfigHeaders(settings) : {},typeof getApiConfigEndpoint === 'function' ? getApiConfigEndpoint(settings) : '',false); body = prepared.body; } catch (e) { pending.push('接口参数需在发送时确认：' + e.message); } }
        if (window.WeatherService) pending.push('天气在发送时准备'); if (shadow.memoryMode === 'vector') pending.push('发送时可能更新检索记忆'); if (window.Moments?.prepareForChat) pending.push('动态在发送时准备');
        const candidates = sources(shadow,type,prompt), data = analyze(body,settings,candidates,{ history:selected,pending,historyTexts:historyTexts(shadow,type,selected,settings) });
        data.actualUsage = chat._lastTokenUsage || null; data.worldBookCount = new Set(data.details.find(d => d.key === 'worldBook')?.sources?.map(s => s.id) || []).size;
        data.excludedMessages = Math.max(0,(shadow.history || []).length - selected.length); data.historyIds = selected.map(m => m.id || ''); data.requestLedger = chat._tokenRequests || [];
        Object.defineProperty(data,'_context',{ value:{ body,settings,candidates,selected,prepared },enumerable:false }); return data;
    }
    async function refine(data) {
        if (!data.encoding || measured.has(data.fingerprint) || typeof Worker === 'undefined') return data;
        if (pendingCounts.has(data.fingerprint)) { await pendingCounts.get(data.fingerprint); return data; }
        const task = countWithWorker(data); pendingCounts.set(data.fingerprint,task);
        try { await task; return data; } finally { pendingCounts.delete(data.fingerprint); }
    }
    async function countWithWorker(data) {
        let w = workers.get(data.encoding);
        if (!w) {
            w = new Worker('js/modules/chat-ai/token-counter-worker.js'); workers.set(data.encoding,w);
            w.onmessage = e => { const j = jobs.get(e.data.id); if (!j) return; jobs.delete(e.data.id); e.data.error ? j.reject(new Error(e.data.error)) : j.resolve(e.data.counts); };
            w.onerror = () => { for (const [id,j] of jobs) if (j.worker === w) { jobs.delete(id); j.reject(new Error('模型分词加载失败')); } workers.delete(data.encoding); w.terminate(); };
        }
        const id = ++sequence, counts = await new Promise((resolve,reject) => {
            const t = setTimeout(() => { jobs.delete(id); reject(new Error('本地分词超时')); },20000);
            jobs.set(id,{ worker:w,resolve:v => { clearTimeout(t); resolve(v); },reject:e => { clearTimeout(t); reject(e); } }); w.postMessage({ id,encoding:data.encoding,docs:data.docs });
        });
        measured.set(data.fingerprint,counts); if (measured.size > 40) measured.delete(measured.keys().next().value);
    }
    function changed(id,type = 'private',reason = '上下文已更新') {
        // Coalesced saves can affect several chats: refresh the currently visible entry,
        // rather than letting the last unrelated save suppress an earlier notification.
        clearTimeout(timer); timer = setTimeout(() => {
            if (typeof document === 'undefined') return;
            const cardId = document.getElementById('pc-message-btn')?.dataset.charId;
            if (cardId) { const value = document.getElementById('pc-stat-memory'); if (value) { try {
                const snapshot = getChatTokenBreakdown(cardId,'private'); value.textContent = snapshot?.total || 0;
                if (snapshot) refine(snapshot).then(() => {
                    if (document.getElementById('pc-message-btn')?.dataset.charId !== cardId) return;
                    const fresh = getChatTokenBreakdown(cardId,'private'); if (fresh?.fingerprint === snapshot.fingerprint) value.textContent = fresh.total;
                }).catch(() => {});
            } catch (_) { value.textContent = '待检测'; } } }
            const modal = document.getElementById('token-distribution-modal');
            if (modal?.classList.contains('visible')) { try { openTokenDistributionModal(modal.dataset.chatId,modal.dataset.chatType || 'private',reason); } catch (_) {} }
        },60);
    }
    function record(chat,type,body,settings,meta = {}) {
        if (meta.history) meta = { ...meta,historyTexts:historyTexts(chat,type,meta.history,settings,meta.memberId) };
        const owner = findChat(chat.id,type) || chat, candidates = type === 'auxiliary' ? [] : sources(chat,type,meta.systemPrompt || ''), stats = analyze(body,settings,candidates,meta);
        const r = { id:`token-${Date.now()}-${++sequence}`,roundId:meta.roundId || `turn-${chat.history?.at(-1)?.id || Date.now()}`,at:Date.now(),model:stats.model,protocol:settings.apiProtocol || settings.provider || 'openai_chat',
            scope:meta.scope || 'chat',memberId:meta.memberId || '',estimatedInput:stats.total,method:stats.method,mediaUnknown:stats.mediaUnknown,messageCount:stats.messageCount,fingerprint:stats.fingerprint,
            details:stats.details.map(d => ({ key:d.key,name:d.name,value:d.value })),status:'sending',usage:null };
        owner._tokenRequests = [...(owner._tokenRequests || []).slice(-29),r]; sessions.set(r,{ owner,chat,type });
        if (typeof Worker !== 'undefined') refine(stats).then(() => { const next = analyze(body,settings,candidates,meta); r.estimatedInput = next.total; r.method = next.method; r.details = next.details.map(d => ({ key:d.key,name:d.name,value:d.value })); changed(owner.id,type); }).catch(() => {});
        changed(owner.id,type); return r;
    }
    function usage(chat,response,record) {
        const u = response?.usage || response?.usageMetadata || response?.message?.usage;
        if (!chat && record) chat = sessions.get(record)?.chat;
        if (!u || !chat) return;
        const take = (...v) => { const value = v.find(x => x != null), n = Number(value); return value != null && Number.isFinite(n) && n >= 0 ? n : undefined; };
        const next = { ...(record?.usage || (chat._lastTokenUsage?.requestId === '' ? chat._lastTokenUsage : {}) || {}),at:Date.now(),requestId:record?.id || '',model:record?.model || '' };
        const input = take(u.prompt_tokens,u.input_tokens,u.promptTokenCount), output = take(u.completion_tokens,u.output_tokens,u.candidatesTokenCount), cached = take(u.prompt_tokens_details?.cached_tokens,u.cachedContentTokenCount,u.cache_read_input_tokens), write = take(u.cache_creation_input_tokens);
        if (input != null) next.rawInput = input; if (cached != null) next.cached = cached; if (write != null) next.cacheWrite = write;
        const anthropic = record?.protocol === 'anthropic' || u.cache_read_input_tokens != null || u.cache_creation_input_tokens != null;
        if (next.rawInput != null) next.input = next.rawInput + (anthropic ? (next.cached || 0) + (next.cacheWrite || 0) : 0);
        if (output != null) next.output = output; const thinking = take(u.completion_tokens_details?.reasoning_tokens,u.thoughtsTokenCount); if (thinking != null) next.thinking = thinking;
        if (next.input == null && next.output == null) return;
        if (record) { record.usage = next; record.status = 'completed'; }
        chat._lastTokenUsage = next; const s = record && sessions.get(record); if (s) s.owner._lastTokenUsage = next; changed(chat.id,s?.type || 'private');
    }
    function validate(chat,data) {
        const issues = [];
        for (const key of ['worldBookIds','offlineWorldBookIds']) {
            const ids = chat[key]; if (ids != null && !Array.isArray(ids)) issues.push({ code:'binding-type',key,repairable:false,message:`${key} 数据类型异常，保留原数据` });
            if (Array.isArray(ids) && new Set(ids).size !== ids.length) issues.push({ code:'duplicate-binding',key,repairable:true,message:`${key} 存在重复绑定引用` });
            if (Array.isArray(ids) && ids.some(id => !(db.worldBooks || []).some(w => w.id === id))) issues.push({ code:'missing-binding',key,repairable:false,message:`${key} 引用了不存在的条目，已保留以便核对` });
        }
        if (chat.maxMemory != null && (!Number.isFinite(Number(chat.maxMemory)) || Number(chat.maxMemory) < 1)) issues.push({ code:'memory-limit',repairable:false,message:'历史条数异常，请在聊天设置核对' });
        if (data) {
            if (data.encodedMediaText) issues.push({ code:'encoded-media-text',repairable:false,message:`发现 ${data.encodedMediaText} 个字符的媒体编码嵌入文字；实际请求也会发送这些文字，不能仅在统计中删去` });
            if (!(db.worldBooks || []).length && data.details.some(d => d.key === 'worldBook' && d.value)) issues.push({ code:'empty-world',repairable:true,message:'没有世界书却出现世界书占用，需重建统计' });
            if (data.details.reduce((n,d) => n + d.value,0) !== data.total) issues.push({ code:'sum',repairable:true,message:'分类合计与总数不一致，需重建统计' });
            for (const d of data.details) { const ids = new Map(); for (const s of d.sources || []) if (!s.messageId && s.id !== d.key) ids.set(s.id,(ids.get(s.id) || 0) + 1); if ([...ids.values()].some(n => n > 1)) issues.push({ code:'repeated-source',repairable:false,message:`${d.name} 有同一来源多次注入；保留实际次数，避免误删有意重复` }); }
        }
        if ((chat._tokenRequests || []).slice(-5).some(r => !r.mediaUnknown && r.method?.includes('文本分词') && r.usage?.input != null && Math.abs(r.usage.input - r.estimatedInput) > Math.max(200,r.usage.input * .25))) issues.push({ code:'usage-gap',repairable:false,message:'近期请求的本地分词与接口用量差异较大，请核对模型别名、接口附加内容或协议开销；未改动正文' });
        return issues;
    }
    async function detect(id,type = 'private',repair = true,all = false) {
        const targets = all ? [...(db.characters || []).map(c => [c,'private']),...(db.groups || []).map(c => [c,'group'])] : [[findChat(id,type),type]], results = [];
        for (const [chat,kind] of targets) {
            if (!chat) continue; let data,error; try { data = preview(chat,kind); } catch (e) { error = e.message; }
            const issues = validate(chat,data); if (error) issues.push({ code:'preview-failed',repairable:false,message:'上下文无法组装：' + error });
            const patches = issues.filter(i => repair && i.code === 'duplicate-binding').map(i => ({ key:i.key,before:[...chat[i.key]],after:[...new Set(chat[i.key])] }));
            if (patches.length) {
                const oldLog = chat._tokenRepairs;
                const correction = { chatId:chat.id,type:kind,at:Date.now(),patches };
                patches.forEach(p => { chat[p.key] = p.after; }); chat._tokenRepairs = [...(oldLog || []).slice(-4),correction];
                const saved = await (kind === 'private' ? saveCharacter(chat.id) : saveGroup(chat.id));
                if (saved === false) { patches.forEach(p => { chat[p.key] = p.before; }); if (oldLog === undefined) delete chat._tokenRepairs; else chat._tokenRepairs = oldLog; issues.push({ code:'save-failed',repairable:false,message:'纠正未保存，已恢复原数据' }); }
                else { changed(chat.id,kind,'检测已纠正重复绑定'); }
            }
            if (issues.some(i => ['sum','empty-world'].includes(i.code))) { measured.clear(); changed(chat.id,kind,'统计已重建'); }
            results.push({ chatId:chat.id,type:kind,issues,corrected:patches.length && !issues.some(i => i.code === 'save-failed') ? patches.length : 0 });
            if (all) await new Promise(resolve => setTimeout(resolve,0));
        } return results;
    }
    async function undo(id,type = 'private') {
        const chat = findChat(id,type),r = chat?._tokenRepairs?.at(-1); if (!r) return false;
        if (r.patches.some(p => JSON.stringify(chat[p.key]) !== JSON.stringify(p.after))) throw new Error('绑定已再次修改，不能覆盖新设置');
        const oldLog = chat._tokenRepairs;
        r.patches.forEach(p => { chat[p.key] = p.before; }); chat._tokenRepairs = oldLog.slice(0,-1);
        const saved = await (type === 'private' ? saveCharacter(id) : saveGroup(id));
        if (saved === false) { r.patches.forEach(p => { chat[p.key] = p.after; }); chat._tokenRepairs = oldLog; throw new Error('撤销保存失败'); }
        changed(id,type,'已撤销检测纠正'); return true;
    }
    async function official(data) {
        const { body,settings } = data._context, prepared = data._context.prepared || prepareAiProviderRequest(settings,body,typeof getApiConfigHeaders === 'function' ? getApiConfigHeaders(settings) : {},getApiConfigEndpoint(settings),false);
        let endpoint = prepared.endpoint,countBody;
        if (prepared.protocol === 'anthropic') {
            endpoint = endpoint.replace(/\/messages(\?.*)?$/,'/messages/count_tokens$1');
            countBody = Object.fromEntries(['model','messages','system','tools','tool_choice','thinking'].filter(k => prepared.body[k] != null).map(k => [k,prepared.body[k]]));
        } else if (prepared.protocol === 'gemini') {
            endpoint = endpoint.replace(/:(?:generateContent|streamGenerateContent)/,':countTokens');
            countBody = { generateContentRequest:{ ...Object.fromEntries(['contents','systemInstruction','tools','toolConfig','generationConfig','cachedContent','safetySettings'].filter(k => prepared.body[k] != null).map(k => [k,prepared.body[k]])),model:`models/${String(settings.model).replace(/^models\//,'')}` } };
        }
        else throw new Error('当前接口没有已适配的官方预计算，可查看模型分词和实际用量');
        const controller = new AbortController(),t = setTimeout(() => controller.abort(),15000);
        try { const response = await fetch(endpoint,{ method:'POST',headers:prepared.headers,body:JSON.stringify(countBody),signal:controller.signal }); if (!response.ok) throw new Error(`官方计数失败（HTTP ${response.status}），当前估算仍可使用`);
            const result = await response.json(),value = result.input_tokens ?? result.totalTokens,input = Number(value); if (value == null || !Number.isFinite(input) || input < 0) throw new Error('接口未返回有效计数'); return { input,fingerprint:data.fingerprint,at:Date.now() };
        } finally { clearTimeout(t); }
    }
    function diagnostics(id,type = 'private') {
        const chat = findChat(id,type),d = preview(chat,type);
        return { engine:ENGINE,type,model:d.model,method:d.method,fingerprint:d.fingerprint,at:new Date(d.at).toISOString(),total:d.total,mediaUnknown:d.mediaUnknown,messageCount:d.messageCount,excludedMessages:d.excludedMessages,worldBookCount:d.worldBookCount,
            details:d.details.map(x => ({ key:x.key,name:x.name,value:x.value,sourceCount:x.sources?.length || 0 })),issues:validate(chat,d).map(i => ({ code:i.code,repairable:i.repairable })),encodedMediaText:d.encodedMediaText,pending:d.pending,
            requests:(chat._tokenRequests || []).map(r => ({ at:r.at,model:r.model,scope:r.scope,status:r.status,estimatedInput:r.estimatedInput,method:r.method,usage:r.usage && { input:r.usage.input,output:r.usage.output,cached:r.usage.cached,thinking:r.usage.thinking } })),
            auxiliaryRequests:(auxiliary._tokenRequests || []).slice(-5).map(r => ({ at:r.at,model:r.model,status:r.status,estimatedInput:r.estimatedInput,usage:r.usage && { input:r.usage.input,output:r.usage.output } })),
            worker:typeof Worker !== 'undefined',serviceWorker:typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller,pageEngine:typeof document !== 'undefined' ? document.getElementById('token-distribution-modal')?.dataset.tokenLayout || '' : '' };
    }
    function delta(id,type,data) {
        const key = `${type}:${id}`,old = previous.get(key); previous.set(key,{ model:data.model,method:data.method,details:data.details.map(d => ({ key:d.key,name:d.name,value:d.value })) });
        if (previous.size > 40) previous.delete(previous.keys().next().value);
        if (!old || old.model !== data.model || old.method !== data.method) return '';
        return [...new Set([...old.details.map(d => d.key),...data.details.map(d => d.key)])].map(k => { const a = old.details.find(d => d.key === k),b = data.details.find(d => d.key === k),diff = (b?.value || 0) - (a?.value || 0); return diff ? `${b?.name || a.name} ${diff > 0 ? '+' : ''}${diff}` : ''; }).filter(Boolean).join(' · ');
    }
    function selfTest() {
        const d = analyze({ messages:[{ role:'user',content:[{ type:'text',text:'你好' },{ type:'image_url',image_url:{ url:'data:image/png;base64,' + 'A'.repeat(100000) } }] }] });
        const fixture = { maxMemory:20,activeNodeId:'token-check',nodes:[{ id:'token-check' }],history:[{ id:'old',role:'assistant',content:'旧文本'.repeat(5000) },{ id:'boundary',isNodeBoundary:true,nodeAction:'start',nodeId:'token-check' },{ id:'current',role:'user',content:'你好' }] };
        const selected = history(fixture,'private');
        const checks = [d.total < 100,d.mediaCount === 1,d.details.reduce((n,x) => n + x.value,0) === d.total,!d.details.some(x => x.key === 'worldBook'),d.encodedMediaText === 0,selected.length === 1 && selected[0].id === 'current'];
        return { passed:checks.every(Boolean),checks:checks.length,engine:ENGINE };
    }
    return { ENGINE,history,isOffline,preview,analyze,refine,changed,record,usage,detect,undo,official,diagnostics,delta,selfTest,weight,labels,
        auxiliaryRequest:(settings,body) => record(auxiliary,'auxiliary',body,settings,{ scope:'auxiliary' }) };
})();
function estimateTokenFromText(text) { return !text || typeof text !== 'string' || /^data:image\//i.test(text) ? 0 : Math.ceil(ChatTokenStats.weight(text)); }
function captureChatTokenUsage(chat,response,record) { ChatTokenStats.usage(chat,response,record); }
function recordChatTokenRequest(chat,type,body,settings,meta) {
    // A diagnostic failure must never interrupt a previously working chat request.
    try { return ChatTokenStats.record(chat,type,body,settings,meta); }
    catch (_) { if (chat) chat._tokenAccountingError = true; return null; }
}
function recordAuxiliaryTokenRequest(settings,body) { try { return ChatTokenStats.auxiliaryRequest(settings,body); } catch (_) { return null; } }
function estimateChatTokens(id,type = 'private') { return getChatTokenBreakdown(id,type)?.total || 0; }
function getChatTokenBreakdown(id,type = 'private',options) { const chat = (type === 'private' ? db.characters : db.groups)?.find(c => c.id === id); return chat ? ChatTokenStats.preview(chat,type,options) : null; }
function getTokenHistoryInfo(chat) { const list = ChatTokenStats.history(chat),d = ChatTokenStats.analyze({ messages:list.map(m => ({ role:m.role,content:m.parts || m.content })) }); return { tokens:d.total,mediaCount:d.mediaCount,messageCount:list.length,largestMessages:[] }; }
function describeTokenHistory(info) { return `本次带入 ${info.messageCount} 条消息。`; }
if (typeof window !== 'undefined') window.ChatTokenStats = ChatTokenStats;
