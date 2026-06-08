(function () {
    const VECTOR_MEMORY_DEFAULT_INTERVAL = 200;
    const VECTOR_MEMORY_DEFAULT_TOP_K = 5;
    const VECTOR_MEMORY_DEFAULT_THRESHOLD = 0.28;
    const VECTOR_MEMORY_DEFAULT_MAX_ENTRY_LENGTH = 1200;
    const uiState = {
        tab: 'entries',
        editingTemplateId: null
    };

    function createVectorId(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function createStarterVectorTemplate() {
        return {
            id: createVectorId('vector_tpl'),
            name: '默认向量模板',
            description: '用于把聊天提炼为可检索的长期记忆，支持自动总结、手动总结和三种记忆模式互转。',
            topK: VECTOR_MEMORY_DEFAULT_TOP_K,
            similarityThreshold: VECTOR_MEMORY_DEFAULT_THRESHOLD,
            maxEntryLength: VECTOR_MEMORY_DEFAULT_MAX_ENTRY_LENGTH,
            summaryTemperature: 0.35,
            summaryPrompt: [
                '请把下面这段聊天内容整理成一条适合“长期检索”的客观记忆，不要写成聊天口吻。',
                '输出必须严格使用以下 XML：',
                '<vector_memory>',
                '  <title>简洁标题</title>',
                '  <content>可被长期检索的客观记忆正文，突出事件、关系变化、关键事实。</content>',
                '  <tags>标签1,标签2</tags>',
                '</vector_memory>',
                '',
                '要求：',
                '1. 不要编造。',
                '2. 保留人物、事件、时间线和关系变化。',
                '3. 内容尽量利于后续检索。',
                '4. 如果没有值得记录的新信息，也要输出 XML，但 content 留空。',
                '',
                '角色名：{{charName}}',
                '用户称呼：{{userName}}',
                '消息范围：{{rangeLabel}}',
                '',
                '聊天内容：',
                '{{history}}'
            ].join('\n'),
            injectPrompt: [
                '【向量长期记忆】',
                '以下是基于当前聊天语义检索出的高相关长期记忆，它们比普通历史消息更可靠。',
                '如果这些记忆与当前对话无关，请不要强行引用；如果记忆未明确写出，请不要擅自脑补。',
                '',
                '当前检索线索：{{query}}',
                '共命中 {{count}} 条：',
                '{{memories}}'
            ].join('\n')
        };
    }

    function ensureVectorTemplateStore() {
        if (!Array.isArray(db.vectorMemoryTemplates)) {
            db.vectorMemoryTemplates = [];
        }
        if (db.vectorMemoryTemplates.length === 0) {
            db.vectorMemoryTemplates.push(createStarterVectorTemplate());
        }
    }

    function ensureVectorMemoryState(chat) {
        if (!chat) return;
        ensureVectorTemplateStore();
        if (!chat.vectorMemory || typeof chat.vectorMemory !== 'object') {
            chat.vectorMemory = {};
        }
        const state = chat.vectorMemory;
        if (state.enabled === undefined) state.enabled = true;
        if (!Array.isArray(state.entries)) state.entries = [];
        if (!Array.isArray(state.history)) state.history = [];
        if (state.boundTemplateId === undefined) state.boundTemplateId = null;
        if (!Number.isFinite(parseInt(state.topK, 10))) state.topK = VECTOR_MEMORY_DEFAULT_TOP_K;
        if (!Number.isFinite(parseFloat(state.threshold))) state.threshold = VECTOR_MEMORY_DEFAULT_THRESHOLD;
        if (state.autoSummaryEnabled === undefined) state.autoSummaryEnabled = false;
        if (!Number.isFinite(parseInt(state.autoSummaryInterval, 10))) state.autoSummaryInterval = VECTOR_MEMORY_DEFAULT_INTERVAL;
        if (!state.autoSummaryState) state.autoSummaryState = 'idle';
        if (state.autoSummaryPending === undefined) state.autoSummaryPending = false;
        if (state.lastSummarizedMsgId === undefined) state.lastSummarizedMsgId = null;
        if (state.lastSummarizedMsgTimestamp === undefined) state.lastSummarizedMsgTimestamp = null;
        if (state.lastContextBlock === undefined) state.lastContextBlock = '';
        if (!Array.isArray(state.lastRetrievedEntryIds)) state.lastRetrievedEntryIds = [];
        if (state.lastQueryText === undefined) state.lastQueryText = '';
        if (state.lastPreparedAt === undefined) state.lastPreparedAt = null;
        if (!state.boundTemplateId || !db.vectorMemoryTemplates.some(item => item.id === state.boundTemplateId)) {
            state.boundTemplateId = db.vectorMemoryTemplates[0] ? db.vectorMemoryTemplates[0].id : null;
        }
        state.entries.forEach(entry => {
            if (!entry.id) entry.id = createVectorId('vector_entry');
            if (!entry.title) entry.title = `向量记忆 ${new Date(entry.createdAt || Date.now()).toLocaleDateString()}`;
            if (!Array.isArray(entry.vector)) entry.vector = [];
            if (!Array.isArray(entry.tags)) entry.tags = [];
            if (entry.pinned === undefined) entry.pinned = false;
            if (!Number.isFinite(parseFloat(entry.weight))) entry.weight = 1;
            if (entry.createdAt === undefined) entry.createdAt = Date.now();
            if (entry.updatedAt === undefined) entry.updatedAt = entry.createdAt;
        });
    }

    function getCurrentVectorChat() {
        if (!currentChatId || currentChatType !== 'private') return null;
        const chat = db.characters.find(item => item.id === currentChatId);
        if (chat) ensureVectorMemoryState(chat);
        return chat || null;
    }

    function getActiveVectorTemplate(chat) {
        ensureVectorTemplateStore();
        ensureVectorMemoryState(chat);
        const state = chat && chat.vectorMemory;
        return db.vectorMemoryTemplates.find(item => item.id === state.boundTemplateId) || db.vectorMemoryTemplates[0] || null;
    }

    function getSummaryApiConfig() {
        const apiConfig = (db.summaryApiSettings && db.summaryApiSettings.url && db.summaryApiSettings.key && db.summaryApiSettings.model)
            ? db.summaryApiSettings
            : db.apiSettings;
        if (!apiConfig || !apiConfig.url || !apiConfig.key || !apiConfig.model) {
            throw new Error('请先配置总结 API');
        }
        return apiConfig;
    }

    function getVectorApiConfig() {
        const apiConfig = (db.vectorApiSettings && db.vectorApiSettings.url && db.vectorApiSettings.key && db.vectorApiSettings.model)
            ? db.vectorApiSettings
            : ((db.summaryApiSettings && db.summaryApiSettings.url && db.summaryApiSettings.key && db.summaryApiSettings.model)
                ? db.summaryApiSettings
                : db.apiSettings);
        if (!apiConfig || !apiConfig.url || !apiConfig.key || !apiConfig.model) {
            throw new Error('请先配置向量 API');
        }
        return apiConfig;
    }

    async function requestVectorSummary(prompt, temperature) {
        const apiConfig = getSummaryApiConfig();
        let { url, key, model } = apiConfig;
        url = (url || '').replace(/\/$/, '');
        const provider = apiConfig.provider || 'newapi';
        const endpoint = provider === 'gemini'
            ? `${url}/v1beta/models/${model}:generateContent?key=${getRandomValue(key)}`
            : `${url}/v1/chat/completions`;
        const headers = provider === 'gemini'
            ? { 'Content-Type': 'application/json' }
            : {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`
            };
        const requestBody = provider === 'gemini'
            ? {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature }
            }
            : {
                model,
                temperature,
                messages: [{ role: 'user', content: prompt }]
            };
        return fetchAiResponse(apiConfig, requestBody, headers, endpoint);
    }

    async function fetchEmbeddingBatch(texts) {
        const apiConfig = getVectorApiConfig();
        let { url, key, model } = apiConfig;
        const provider = apiConfig.provider || 'newapi';
        url = (url || '').replace(/\/$/, '');
        if (provider === 'gemini') {
            const outputs = [];
            for (const text of texts) {
                const endpoint = `${url}/v1beta/models/${model}:embedContent?key=${getRandomValue(key)}`;
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: {
                            parts: [{ text }]
                        }
                    })
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Embedding API Error: ${response.status} ${errorText}`);
                }
                const data = await response.json();
                outputs.push(data.embedding?.values || []);
            }
            return outputs;
        }

        const endpoint = `${url}/v1/embeddings`;
        const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`
        };
        const body = {
            model,
            input: texts.length === 1 ? texts[0] : texts
        };
        if (Number.isFinite(parseInt(apiConfig.dimensions, 10))) {
            body.dimensions = parseInt(apiConfig.dimensions, 10);
        }
        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Embedding API Error: ${response.status} ${errorText}`);
        }
        const data = await response.json();
        const list = Array.isArray(data.data) ? data.data : [];
        return list.map(item => item.embedding || []);
    }

    async function fetchEmbeddings(texts) {
        const list = (Array.isArray(texts) ? texts : [texts]).map(item => (item || '').trim()).filter(Boolean);
        if (list.length === 0) return [];
        const batchSize = Math.max(1, parseInt((db.vectorApiSettings && db.vectorApiSettings.batchSize) || 8, 10) || 8);
        const outputs = [];
        for (let index = 0; index < list.length; index += batchSize) {
            const batch = list.slice(index, index + batchSize);
            const vectors = await fetchEmbeddingBatch(batch);
            outputs.push(...vectors);
        }
        return outputs;
    }

    function cosineSimilarity(a, b) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
        let dot = 0;
        let normA = 0;
        let normB = 0;
        for (let index = 0; index < a.length; index++) {
            const av = Number(a[index]) || 0;
            const bv = Number(b[index]) || 0;
            dot += av * bv;
            normA += av * av;
            normB += bv * bv;
        }
        if (!normA || !normB) return 0;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function trimText(text, limit) {
        const value = String(text || '').trim();
        if (value.length <= limit) return value;
        return `${value.slice(0, Math.max(0, limit - 1)).trim()}…`;
    }

    function readMessageText(message) {
        if (!message) return '';
        if (Array.isArray(message.parts) && message.parts.length > 0) {
            return message.parts.map(part => part.text || '[图片]').join('');
        }
        return message.content || '';
    }

    function formatMessageForMemory(chat, message) {
        const speaker = message.role === 'user' ? (chat.myName || '用户') : (chat.realName || '角色');
        return `${speaker}: ${readMessageText(message)}`;
    }

    function buildHistoryText(chat, startIndex, endIndex) {
        const history = Array.isArray(chat && chat.history) ? chat.history : [];
        return history
            .slice(startIndex, endIndex)
            .filter(item => item && !item.isContextDisabled && !item.isThinking)
            .map(item => formatMessageForMemory(chat, item))
            .join('\n');
    }

    function fillTemplateString(template, values) {
        let output = String(template || '');
        Object.keys(values).forEach(key => {
            const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            output = output.replace(pattern, values[key] == null ? '' : String(values[key]));
        });
        return output;
    }

    function buildVectorQueryText(chat) {
        const history = Array.isArray(chat && chat.history) ? chat.history : [];
        const usable = history.filter(item => item && !item.isContextDisabled && !item.isThinking);
        const recent = usable.slice(-8);
        const queryText = recent.map(item => formatMessageForMemory(chat, item)).join('\n');
        if (queryText.trim()) return queryText.trim();
        return `${chat.myName || '用户'} 与 ${chat.realName || '角色'} 的当前聊天语境`;
    }

    function getEntryTags(entry) {
        if (!entry || !Array.isArray(entry.tags)) return '';
        return entry.tags.filter(Boolean).join(', ');
    }

    function buildMemoryListText(entries) {
        return entries.map((entry, index) => {
            const parts = [
                `${index + 1}. 标题：${entry.title || '未命名记忆'}`,
                `来源：${entry.source || 'manual'}`
            ];
            if (entry._score !== undefined) {
                parts.push(`相似度：${entry._score.toFixed(3)}`);
            }
            if (entry.rangeLabel) {
                parts.push(`范围：${entry.rangeLabel}`);
            }
            const tags = getEntryTags(entry);
            if (tags) {
                parts.push(`标签：${tags}`);
            }
            parts.push(`内容：${entry.text || ''}`);
            return `- ${parts.join('\n  ')}`;
        }).join('\n\n');
    }

    function buildContextBlock(chat, entries, queryText) {
        if (!entries || entries.length === 0) return '';
        const template = getActiveVectorTemplate(chat);
        const text = buildMemoryListText(entries);
        if (template && template.injectPrompt) {
            return fillTemplateString(template.injectPrompt, {
                query: queryText,
                count: entries.length,
                memories: text
            }).trim();
        }
        return `【向量长期记忆】\n当前检索线索：${queryText}\n${text}`;
    }

    function computeLexicalScore(entry, queryText) {
        const haystack = `${entry.title || ''}\n${entry.text || ''}\n${getEntryTags(entry)}`.toLowerCase();
        const tokens = String(queryText || '')
            .toLowerCase()
            .split(/[\s,，。！？!?:：、;；\n]+/)
            .filter(token => token && token.length >= 2);
        if (tokens.length === 0) return entry.pinned ? 1 : 0;
        let hits = 0;
        tokens.forEach(token => {
            if (haystack.includes(token)) hits += 1;
        });
        const base = hits / tokens.length;
        return base + (entry.pinned ? 0.35 : 0) + ((Number(entry.weight) || 1) - 1) * 0.08;
    }

    function selectFallbackEntries(chat, queryText) {
        ensureVectorMemoryState(chat);
        const template = getActiveVectorTemplate(chat);
        const topK = Math.max(1, parseInt(template?.topK || chat.vectorMemory.topK, 10) || VECTOR_MEMORY_DEFAULT_TOP_K);
        const threshold = Number.isFinite(parseFloat(template?.similarityThreshold))
            ? parseFloat(template.similarityThreshold)
            : parseFloat(chat.vectorMemory.threshold || VECTOR_MEMORY_DEFAULT_THRESHOLD);
        return [...chat.vectorMemory.entries]
            .map(entry => ({
                ...entry,
                _score: computeLexicalScore(entry, queryText),
                rangeLabel: entry.range ? `${entry.range.start}-${entry.range.end}` : ''
            }))
            .filter(entry => entry.pinned || entry._score >= Math.max(0.05, threshold * 0.45))
            .sort((a, b) => {
                if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
                if (b._score !== a._score) return b._score - a._score;
                return (b.updatedAt || 0) - (a.updatedAt || 0);
            })
            .slice(0, topK);
    }

    function clearVectorContextCache(chat) {
        ensureVectorMemoryState(chat);
        chat.vectorMemory.lastContextBlock = '';
        chat.vectorMemory.lastRetrievedEntryIds = [];
        chat.vectorMemory.lastQueryText = '';
        chat.vectorMemory.lastPreparedAt = null;
    }

    function getVectorMemoryContextBlock(chat, options = {}) {
        ensureVectorMemoryState(chat);
        if (chat.memoryMode !== 'vector' && !options.force) return '';
        if (chat.vectorMemory.lastContextBlock) {
            return chat.vectorMemory.lastContextBlock;
        }
        const queryText = options.queryText || buildVectorQueryText(chat);
        const entries = selectFallbackEntries(chat, queryText);
        const block = buildContextBlock(chat, entries, queryText);
        chat.vectorMemory.lastContextBlock = block;
        chat.vectorMemory.lastRetrievedEntryIds = entries.map(item => item.id);
        chat.vectorMemory.lastQueryText = queryText;
        chat.vectorMemory.lastPreparedAt = Date.now();
        return block;
    }

    async function prepareVectorMemoryContext(chat, options = {}) {
        ensureVectorMemoryState(chat);
        const queryText = options.queryText || buildVectorQueryText(chat);
        if (!chat.vectorMemory.entries.length) {
            clearVectorContextCache(chat);
            return '';
        }
        if (chat.vectorMemory.lastContextBlock && chat.vectorMemory.lastQueryText === queryText) {
            return chat.vectorMemory.lastContextBlock;
        }

        const template = getActiveVectorTemplate(chat);
        const topK = Math.max(1, parseInt(template?.topK || chat.vectorMemory.topK, 10) || VECTOR_MEMORY_DEFAULT_TOP_K);
        const threshold = Number.isFinite(parseFloat(template?.similarityThreshold))
            ? parseFloat(template.similarityThreshold)
            : parseFloat(chat.vectorMemory.threshold || VECTOR_MEMORY_DEFAULT_THRESHOLD);

        let selectedEntries = [];
        try {
            const vectors = await fetchEmbeddings([queryText]);
            const queryVector = vectors[0];
            if (Array.isArray(queryVector) && queryVector.length > 0) {
                selectedEntries = chat.vectorMemory.entries
                    .map(entry => {
                        const similarity = cosineSimilarity(queryVector, entry.vector);
                        const score = similarity + (entry.pinned ? 0.35 : 0) + ((Number(entry.weight) || 1) - 1) * 0.08;
                        return {
                            ...entry,
                            _score: score,
                            rangeLabel: entry.range ? `${entry.range.start}-${entry.range.end}` : ''
                        };
                    })
                    .filter(entry => entry.pinned || entry._score >= threshold)
                    .sort((a, b) => {
                        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
                        if (b._score !== a._score) return b._score - a._score;
                        return (b.updatedAt || 0) - (a.updatedAt || 0);
                    })
                    .slice(0, topK);
            }
        } catch (error) {
            console.warn('[VectorMemory] prepare context fallback:', error);
        }

        if (selectedEntries.length === 0) {
            selectedEntries = selectFallbackEntries(chat, queryText);
        }
        const block = buildContextBlock(chat, selectedEntries, queryText);
        chat.vectorMemory.lastContextBlock = block;
        chat.vectorMemory.lastRetrievedEntryIds = selectedEntries.map(item => item.id);
        chat.vectorMemory.lastQueryText = queryText;
        chat.vectorMemory.lastPreparedAt = Date.now();
        return block;
    }

    async function embedEntriesIfNeeded(entries) {
        const targets = entries.filter(item => !Array.isArray(item.vector) || item.vector.length === 0);
        if (targets.length === 0) return;
        const texts = targets.map(item => item.text || '');
        const vectors = await fetchEmbeddings(texts);
        targets.forEach((item, index) => {
            item.vector = Array.isArray(vectors[index]) ? vectors[index] : [];
        });
    }

    function pushVectorHistory(chat, action, summary) {
        ensureVectorMemoryState(chat);
        chat.vectorMemory.history.unshift({
            id: createVectorId('vector_history'),
            action,
            summary,
            createdAt: Date.now()
        });
        chat.vectorMemory.history = chat.vectorMemory.history.slice(0, 80);
    }

    function inferEntryTitle(text) {
        const compact = String(text || '').replace(/\s+/g, ' ').trim();
        if (!compact) return '未命名记忆';
        return compact.length > 18 ? `${compact.slice(0, 18)}…` : compact;
    }

    async function addVectorEntry(chat, payload) {
        ensureVectorMemoryState(chat);
        const text = String(payload && payload.text || '').trim();
        if (!text) {
            throw new Error('记忆内容不能为空');
        }
        const entry = {
            id: createVectorId('vector_entry'),
            title: String(payload.title || '').trim() || inferEntryTitle(text),
            text,
            vector: Array.isArray(payload.vector) ? payload.vector : [],
            tags: Array.isArray(payload.tags) ? payload.tags.filter(Boolean) : [],
            source: payload.source || 'manual',
            pinned: !!payload.pinned,
            weight: Number.isFinite(parseFloat(payload.weight)) ? parseFloat(payload.weight) : 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            range: payload.range || null,
            meta: payload.meta || {}
        };
        if (!entry.vector.length) {
            const vectors = await fetchEmbeddings([entry.text]);
            entry.vector = Array.isArray(vectors[0]) ? vectors[0] : [];
        }
        chat.vectorMemory.entries.unshift(entry);
        pushVectorHistory(chat, 'create', `新增记忆：${entry.title}`);
        clearVectorContextCache(chat);
        return entry;
    }

    function parseVectorSummaryXml(rawContent) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(`<root>${rawContent || ''}</root>`, 'text/xml');
        if (xmlDoc.querySelector('parsererror')) {
            return null;
        }
        return {
            title: xmlDoc.querySelector('title')?.textContent?.trim() || '',
            content: xmlDoc.querySelector('content')?.textContent?.trim() || '',
            tags: (xmlDoc.querySelector('tags')?.textContent || '')
                .split(',')
                .map(item => item.trim())
                .filter(Boolean)
        };
    }

    async function summarizeRangeToVectorEntry(chat, start, end, options = {}) {
        ensureVectorMemoryState(chat);
        const history = Array.isArray(chat && chat.history) ? chat.history : [];
        if (start < 1 || end < start || end > history.length) {
            throw new Error('请输入有效的总结范围');
        }
        const template = getActiveVectorTemplate(chat);
        const historyText = buildHistoryText(chat, start - 1, end);
        if (!historyText.trim()) {
            throw new Error('当前范围内没有可总结的消息');
        }
        const prompt = fillTemplateString(template?.summaryPrompt || '', {
            charName: chat.realName || '',
            userName: chat.myName || '',
            rangeLabel: `${start}-${end}`,
            history: historyText
        });
        const rawContent = await requestVectorSummary(prompt, Number(template?.summaryTemperature) || 0.35);
        const parsed = parseVectorSummaryXml(rawContent);
        const summaryText = parsed && parsed.content
            ? trimText(parsed.content, Math.max(200, parseInt(template?.maxEntryLength, 10) || VECTOR_MEMORY_DEFAULT_MAX_ENTRY_LENGTH))
            : trimText(String(rawContent || '').replace(/<[^>]+>/g, '').trim(), Math.max(200, parseInt(template?.maxEntryLength, 10) || VECTOR_MEMORY_DEFAULT_MAX_ENTRY_LENGTH));
        if (!summaryText) {
            throw new Error('没有提取到有效的向量记忆内容');
        }
        const entry = await addVectorEntry(chat, {
            title: parsed && parsed.title ? parsed.title : `记忆 ${start}-${end}`,
            text: summaryText,
            tags: parsed ? parsed.tags : [],
            source: options.source || 'manual_summary',
            range: { start, end }
        });
        entry.rangeLabel = `${start}-${end}`;
        pushVectorHistory(chat, options.source || 'manual_summary', `总结消息 ${start}-${end}`);
        return entry;
    }

    function getAutoVectorCursorInfo(chat) {
        ensureVectorMemoryState(chat);
        const history = Array.isArray(chat && chat.history) ? chat.history : [];
        const interval = Math.max(10, parseInt(chat.vectorMemory.autoSummaryInterval, 10) || VECTOR_MEMORY_DEFAULT_INTERVAL);
        const cursorIndex = chat.vectorMemory.lastSummarizedMsgId
            ? history.findIndex(message => message.id === chat.vectorMemory.lastSummarizedMsgId)
            : -1;
        const nextStartIndex = cursorIndex + 1;
        const unsummarizedCount = Math.max(0, history.length - nextStartIndex);
        const completedBatchCount = Math.floor(unsummarizedCount / interval);
        return {
            history,
            interval,
            cursorIndex,
            nextStartIndex,
            unsummarizedCount,
            completedBatchCount
        };
    }

    function getNextAutoVectorRange(chat) {
        const info = getAutoVectorCursorInfo(chat);
        if (info.completedBatchCount <= 0) return null;
        return {
            start: info.nextStartIndex + 1,
            end: info.nextStartIndex + info.interval,
            info
        };
    }

    function setVectorCursorByEndIndex(chat, endIndex) {
        ensureVectorMemoryState(chat);
        const history = Array.isArray(chat && chat.history) ? chat.history : [];
        const message = history[endIndex - 1] || null;
        chat.vectorMemory.lastSummarizedMsgId = message ? message.id : null;
        chat.vectorMemory.lastSummarizedMsgTimestamp = message ? (message.timestamp || null) : null;
        chat.vectorMemory.autoSummaryState = 'idle';
    }

    function resetVectorCursorToLatest(chat) {
        ensureVectorMemoryState(chat);
        const history = Array.isArray(chat && chat.history) ? chat.history : [];
        setVectorCursorByEndIndex(chat, history.length);
        chat.vectorMemory.autoSummaryPending = false;
    }

    async function runVectorAutoSummary(chat, options = {}) {
        ensureVectorMemoryState(chat);
        if (!chat.vectorMemory.autoSummaryEnabled && !options.force) return 0;
        if (chat.vectorMemory.autoSummaryState === 'running') return 0;
        if (chat.vectorMemory.autoSummaryState === 'failed' && !options.ignoreFailedState) return 0;
        const nextRange = getNextAutoVectorRange(chat);
        if (!nextRange) {
            if (!options.silent) showToast('当前没有可补的向量自动总结范围');
            return 0;
        }
        chat.vectorMemory.autoSummaryState = 'running';
        chat.vectorMemory.autoSummaryPending = false;
        try {
            await summarizeRangeToVectorEntry(chat, nextRange.start, nextRange.end, { source: 'auto_summary' });
            setVectorCursorByEndIndex(chat, nextRange.end);
            chat.vectorMemory.autoSummaryState = 'idle';
            await saveCharacter(chat.id);
            return 1;
        } catch (error) {
            chat.vectorMemory.autoSummaryState = 'failed';
            chat.vectorMemory.autoSummaryPending = false;
            await saveCharacter(chat.id);
            throw error;
        }
    }

    async function checkAndTriggerVectorMemory(chat) {
        if (!chat) return;
        if (!db.characters || !db.characters.some(item => item.id === chat.id)) return;
        ensureVectorMemoryState(chat);
        if (!chat.vectorMemory.autoSummaryEnabled) return;
        if (chat.vectorMemory.autoSummaryState === 'running' || chat.vectorMemory.autoSummaryState === 'failed') return;
        const nextRange = getNextAutoVectorRange(chat);
        if (!nextRange) return;
        try {
            await runVectorAutoSummary(chat, { silent: true });
        } catch (error) {
            console.error('[VectorMemory] auto summary failed:', error);
        }
    }

    function buildEntriesAggregateText(chat) {
        ensureVectorMemoryState(chat);
        return chat.vectorMemory.entries
            .slice()
            .sort((a, b) => (b.pinned === a.pinned) ? ((b.updatedAt || 0) - (a.updatedAt || 0)) : (a.pinned ? -1 : 1))
            .map(item => `标题：${item.title}\n来源：${item.source || 'manual'}\n内容：${item.text}`)
            .join('\n\n---\n\n');
    }

    function createJournalEntry(chat, title, content, source) {
        if (!Array.isArray(chat.memoryJournals)) chat.memoryJournals = [];
        chat.memoryJournals.unshift({
            id: createVectorId('journal'),
            range: null,
            title: title || '向量记忆整理',
            content,
            createdAt: Date.now(),
            chatId: chat.id,
            chatType: 'private',
            isFavorited: true,
            source: source || 'vector_memory_conversion'
        });
    }

    async function convertVectorToJournal() {
        const chat = getCurrentVectorChat();
        if (!chat) {
            showToast('请先进入一个角色聊天');
            return;
        }
        ensureVectorMemoryState(chat);
        if (!chat.vectorMemory.entries.length) {
            showToast('当前没有可转换的向量记忆');
            return;
        }
        const text = buildEntriesAggregateText(chat);
        const prompt = [
            '请把下面这些向量记忆整理成一篇适合长期回忆的客观记忆日记。',
            '只输出以下 XML：',
            '<journal>',
            '  <title>标题</title>',
            '  <content>正文</content>',
            '</journal>',
            '',
            '要求：',
            '1. 不要编造。',
            '2. 保持时间线和事件逻辑。',
            '3. 适合导入回忆日记作为长期记忆。',
            '',
            text
        ].join('\n');
        try {
            const rawContent = await requestVectorSummary(prompt, 0.45);
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(`<root>${rawContent || ''}</root>`, 'text/xml');
            if (xmlDoc.querySelector('parsererror')) {
                throw new Error('向量转日记返回格式解析失败');
            }
            const title = xmlDoc.querySelector('title')?.textContent?.trim() || '向量记忆整理';
            const content = xmlDoc.querySelector('content')?.textContent?.trim() || '';
            if (!content) {
                throw new Error('没有提取到有效日记内容');
            }
            createJournalEntry(chat, title, content, 'vector_to_journal');
            pushVectorHistory(chat, 'vector_to_journal', '已生成 1 篇日记');
            await saveCharacter(chat.id);
            showToast('已根据向量记忆生成新日记');
        } catch (error) {
            console.error('[VectorMemory] vector to journal failed:', error);
            if (typeof showApiError === 'function') showApiError(error);
            else showToast(error.message || '向量转日记失败');
        }
    }

    async function convertJournalsToVector() {
        const chat = getCurrentVectorChat();
        if (!chat) {
            showToast('请先进入一个角色聊天');
            return;
        }
        const journals = (chat.memoryJournals || []).slice();
        if (journals.length === 0) {
            showToast('当前没有可转换的日记');
            return;
        }
        const prepared = journals.map(item => ({
            id: createVectorId('vector_entry'),
            title: item.title || '日记导入',
            text: trimText(item.content || '', 1200),
            vector: [],
            tags: ['日记转换'],
            source: 'from_journal',
            pinned: !!item.isFavorited,
            weight: item.isFavorited ? 1.15 : 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            range: item.range || null,
            meta: { journalId: item.id }
        }));
        try {
            await embedEntriesIfNeeded(prepared);
            prepared.reverse().forEach(entry => {
                chat.vectorMemory.entries.unshift(entry);
            });
            pushVectorHistory(chat, 'journal_to_vector', `已导入 ${prepared.length} 条日记为向量记忆`);
            clearVectorContextCache(chat);
            await saveCharacter(chat.id);
            renderVectorMemoryScreen();
            showToast(`已将 ${prepared.length} 篇日记转为向量记忆`);
        } catch (error) {
            console.error('[VectorMemory] journal to vector failed:', error);
            if (typeof showApiError === 'function') showApiError(error);
            else showToast(error.message || '日记转向量失败');
        }
    }

    async function convertTableToVector() {
        const chat = getCurrentVectorChat();
        if (!chat) {
            showToast('请先进入一个角色聊天');
            return;
        }
        const tableContext = typeof window.exportMemoryTableContext === 'function'
            ? window.exportMemoryTableContext(chat, { force: true })
            : (typeof getMemoryTableContextBlock === 'function' ? getMemoryTableContextBlock(chat, { force: true }) : '');
        if (!tableContext) {
            showToast('当前没有可转换的表格记忆');
            return;
        }
        try {
            await addVectorEntry(chat, {
                title: '结构记忆快照',
                text: tableContext,
                tags: ['表格转换'],
                source: 'from_table',
                pinned: true
            });
            pushVectorHistory(chat, 'table_to_vector', '已保存一份结构记忆快照');
            await saveCharacter(chat.id);
            renderVectorMemoryScreen();
            showToast('已将当前表格记忆转为向量记忆');
        } catch (error) {
            console.error('[VectorMemory] table to vector failed:', error);
            if (typeof showApiError === 'function') showApiError(error);
            else showToast(error.message || '表格转向量失败');
        }
    }

    async function convertVectorToTable() {
        const chat = getCurrentVectorChat();
        if (!chat) {
            showToast('请先进入一个角色聊天');
            return;
        }
        if (!chat.vectorMemory.entries.length) {
            showToast('当前没有可转换的向量记忆');
            return;
        }
        if (typeof window.convertTextToMemoryTable !== 'function') {
            showToast('结构化记忆转换能力未加载');
            return;
        }
        try {
            const text = buildEntriesAggregateText(chat);
            const changedCount = await window.convertTextToMemoryTable(chat, text, { source: 'vector_memory_conversion' });
            renderVectorMemoryScreen();
            showToast(changedCount > 0 ? `已写入 ${changedCount} 项表格变更` : '没有检测到可更新的表格字段');
        } catch (error) {
            console.error('[VectorMemory] vector to table failed:', error);
            if (typeof showApiError === 'function') showApiError(error);
            else showToast(error.message || '向量转表格失败');
        }
    }

    function buildVectorPackagePayload(chat) {
        ensureVectorMemoryState(chat);
        const template = getActiveVectorTemplate(chat);
        return {
            type: 'vector_memory_package',
            version: 1,
            template: template ? deepClone(template) : null,
            binding: {
                memoryMode: chat.memoryMode,
                autoSummaryEnabled: !!chat.vectorMemory.autoSummaryEnabled,
                autoSummaryInterval: chat.vectorMemory.autoSummaryInterval || VECTOR_MEMORY_DEFAULT_INTERVAL,
                boundTemplateId: template ? template.id : null
            },
            entries: deepClone(chat.vectorMemory.entries || [])
        };
    }

    function downloadJson(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function exportVectorTemplates() {
        ensureVectorTemplateStore();
        downloadJson(db.vectorMemoryTemplates || [], 'vector-memory-templates.json');
    }

    function exportVectorMemoryPackage() {
        const chat = getCurrentVectorChat();
        if (!chat) {
            showToast('请先进入一个角色聊天');
            return;
        }
        ensureVectorMemoryState(chat);
        if (!chat.vectorMemory.entries.length) {
            showToast('当前没有可导出的向量记忆');
            return;
        }
        downloadJson(buildVectorPackagePayload(chat), `${chat.remarkName || chat.realName || 'vector'}_vector_memory_package.json`);
    }

    function cloneTemplateWithFreshId(template) {
        return {
            ...deepClone(template),
            id: createVectorId('vector_tpl')
        };
    }

    async function importVectorFile(file) {
        if (!file) return;
        let parsed;
        try {
            parsed = JSON.parse(await file.text());
        } catch (error) {
            showToast('导入失败：JSON 无法解析');
            return;
        }
        ensureVectorTemplateStore();
        const chat = getCurrentVectorChat();
        if (parsed && parsed.type === 'vector_memory_package') {
            let importedTemplate = null;
            if (parsed.template) {
                importedTemplate = cloneTemplateWithFreshId(parsed.template);
                db.vectorMemoryTemplates.unshift(importedTemplate);
            }
            if (chat && Array.isArray(parsed.entries)) {
                ensureVectorMemoryState(chat);
                const importedEntries = deepClone(parsed.entries).map(entry => ({
                    ...entry,
                    id: createVectorId('vector_entry'),
                    vector: Array.isArray(entry.vector) ? entry.vector : [],
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                }));
                chat.vectorMemory.entries.unshift(...importedEntries.reverse());
                if (parsed.binding) {
                    chat.vectorMemory.autoSummaryEnabled = !!parsed.binding.autoSummaryEnabled;
                    chat.vectorMemory.autoSummaryInterval = Math.max(10, parseInt(parsed.binding.autoSummaryInterval, 10) || VECTOR_MEMORY_DEFAULT_INTERVAL);
                    if (importedTemplate) {
                        chat.vectorMemory.boundTemplateId = importedTemplate.id;
                    }
                    if (parsed.binding.memoryMode) {
                        chat.memoryMode = parsed.binding.memoryMode;
                    }
                }
                try {
                    await embedEntriesIfNeeded(chat.vectorMemory.entries);
                } catch (error) {
                    console.warn('[VectorMemory] import package embed fallback:', error);
                }
                pushVectorHistory(chat, 'import_package', `已导入 ${importedEntries.length} 条向量记忆`);
                clearVectorContextCache(chat);
                await saveCharacter(chat.id);
            }
            await saveData();
            renderVectorMemoryScreen();
            showToast('已导入向量模板/记忆包');
            return;
        }

        const list = Array.isArray(parsed) ? parsed : [parsed];
        const templates = list.filter(item => item && item.name && (item.summaryPrompt || item.injectPrompt));
        if (templates.length === 0) {
            showToast('未在文件中找到有效的向量模板');
            return;
        }
        templates.forEach(template => {
            db.vectorMemoryTemplates.unshift(cloneTemplateWithFreshId(template));
        });
        await saveData();
        renderVectorMemoryScreen();
        showToast(`已导入 ${templates.length} 个向量模板`);
    }

    function renderVectorEntriesTab(chat) {
        const content = document.getElementById('vector-memory-content');
        if (!content) return;
        ensureVectorMemoryState(chat);
        const activeIds = new Set(chat.vectorMemory.lastRetrievedEntryIds || []);
        if (chat.vectorMemory.entries.length === 0) {
            content.innerHTML = '<div class="vector-memory-empty-card">还没有向量记忆。可以先手动总结，或把日记/表格转过来。</div>';
            return;
        }
        content.innerHTML = chat.vectorMemory.entries.map(entry => `
            <div class="vector-memory-card ${activeIds.has(entry.id) ? 'is-hit' : ''}">
                <div class="vector-memory-card-head">
                    <div>
                        <div class="vector-memory-card-title">${escapeHtml(entry.title || '未命名记忆')}</div>
                        <div class="vector-memory-card-meta">
                            <span>${escapeHtml(entry.source || 'manual')}</span>
                            <span>${new Date(entry.updatedAt || entry.createdAt || Date.now()).toLocaleString()}</span>
                            ${entry.range ? `<span>范围 ${entry.range.start}-${entry.range.end}</span>` : ''}
                            ${activeIds.has(entry.id) ? '<span>当前命中</span>' : ''}
                        </div>
                    </div>
                    <div class="vector-memory-card-actions">
                        <button type="button" class="btn btn-small ${entry.pinned ? 'btn-primary' : 'btn-secondary'}" data-action="toggle-pin" data-entry-id="${entry.id}">${entry.pinned ? '已置顶' : '置顶'}</button>
                        <button type="button" class="btn btn-small btn-secondary" data-action="boost-weight" data-entry-id="${entry.id}">加权</button>
                        <button type="button" class="btn btn-small btn-danger" data-action="delete-entry" data-entry-id="${entry.id}">删除</button>
                    </div>
                </div>
                <div class="vector-memory-card-body">${escapeHtml(entry.text || '')}</div>
                <div class="vector-memory-card-tags">${getEntryTags(entry) ? `标签：${escapeHtml(getEntryTags(entry))}` : '标签：暂无'} · 权重 ${Number(entry.weight || 1).toFixed(2)}</div>
            </div>
        `).join('');
    }

    function renderVectorTemplatesTab(chat) {
        const content = document.getElementById('vector-memory-content');
        if (!content) return;
        ensureVectorTemplateStore();
        ensureVectorMemoryState(chat);
        content.innerHTML = db.vectorMemoryTemplates.map(template => {
            const isActive = chat.vectorMemory.boundTemplateId === template.id;
            return `
                <div class="vector-memory-card ${isActive ? 'is-hit' : ''}">
                    <div class="vector-memory-card-head">
                        <div>
                            <div class="vector-memory-card-title">${escapeHtml(template.name || '未命名模板')}</div>
                            <div class="vector-memory-card-meta">
                                <span>TopK ${template.topK || VECTOR_MEMORY_DEFAULT_TOP_K}</span>
                                <span>阈值 ${Number(template.similarityThreshold || VECTOR_MEMORY_DEFAULT_THRESHOLD).toFixed(2)}</span>
                                <span>最长 ${template.maxEntryLength || VECTOR_MEMORY_DEFAULT_MAX_ENTRY_LENGTH} 字</span>
                            </div>
                        </div>
                        <div class="vector-memory-card-actions">
                            <button type="button" class="btn btn-small ${isActive ? 'btn-primary' : 'btn-secondary'}" data-action="bind-template" data-template-id="${template.id}">${isActive ? '当前使用中' : '绑定到当前角色'}</button>
                            <button type="button" class="btn btn-small btn-secondary" data-action="edit-template" data-template-id="${template.id}">编辑</button>
                            <button type="button" class="btn btn-small btn-secondary" data-action="export-template" data-template-id="${template.id}">导出</button>
                            <button type="button" class="btn btn-small btn-danger" data-action="delete-template" data-template-id="${template.id}">删除</button>
                        </div>
                    </div>
                    <div class="vector-memory-card-body">${escapeHtml(template.description || '暂无描述')}</div>
                </div>
            `;
        }).join('');
    }

    function renderVectorHistoryTab(chat) {
        const content = document.getElementById('vector-memory-content');
        if (!content) return;
        ensureVectorMemoryState(chat);
        if (!chat.vectorMemory.history.length) {
            content.innerHTML = '<div class="vector-memory-empty-card">还没有操作记录。</div>';
            return;
        }
        content.innerHTML = chat.vectorMemory.history.map(item => `
            <div class="vector-memory-card">
                <div class="vector-memory-card-head">
                    <div>
                        <div class="vector-memory-card-title">${escapeHtml(item.action || 'history')}</div>
                        <div class="vector-memory-card-meta">
                            <span>${new Date(item.createdAt || Date.now()).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
                <div class="vector-memory-card-body">${escapeHtml(item.summary || '')}</div>
            </div>
        `).join('');
    }

    function refreshVectorAutoControls(chat) {
        const toggle = document.getElementById('vector-memory-auto-toggle');
        const intervalInput = document.getElementById('vector-memory-auto-interval');
        const status = document.getElementById('vector-memory-auto-status');
        if (!toggle || !intervalInput || !status) return;
        if (!chat) {
            toggle.checked = false;
            intervalInput.value = VECTOR_MEMORY_DEFAULT_INTERVAL;
            status.textContent = '独立自动总结：未启用';
            return;
        }
        ensureVectorMemoryState(chat);
        const info = getAutoVectorCursorInfo(chat);
        toggle.checked = !!chat.vectorMemory.autoSummaryEnabled;
        intervalInput.value = chat.vectorMemory.autoSummaryInterval || VECTOR_MEMORY_DEFAULT_INTERVAL;
        const state = chat.vectorMemory.autoSummaryState || 'idle';
        status.textContent = `独立自动总结：${chat.vectorMemory.autoSummaryEnabled ? '已开启' : '已关闭'} · 未处理消息 ${info.unsummarizedCount} 条 · 状态 ${state}`;
    }

    function refreshVectorHeader(chat) {
        const summary = document.getElementById('vector-memory-chat-summary');
        const modePill = document.getElementById('vector-memory-mode-pill');
        if (!summary || !modePill) return;
        if (!chat) {
            summary.textContent = '请先进入一个私聊角色。';
            modePill.textContent = '未选择角色';
            modePill.style.background = 'rgba(160,160,160,0.12)';
            modePill.style.color = '#666';
            return;
        }
        ensureVectorMemoryState(chat);
        const template = getActiveVectorTemplate(chat);
        summary.textContent = `${chat.remarkName || chat.realName || '当前角色'} · ${chat.vectorMemory.entries.length} 条向量记忆 · 模板 ${template ? template.name : '未绑定'}`;
        const map = {
            journal: { label: '日记模式', bg: 'rgba(255, 181, 71, 0.12)', color: '#b26a00' },
            table: { label: '表格模式', bg: 'rgba(73, 129, 255, 0.12)', color: '#335eea' },
            vector: { label: '向量模式', bg: 'rgba(116, 87, 255, 0.12)', color: '#5a38d6' }
        };
        const meta = map[chat.memoryMode] || map.journal;
        modePill.textContent = meta.label;
        modePill.style.background = meta.bg;
        modePill.style.color = meta.color;
        document.querySelectorAll('[data-vector-memory-mode-switch]').forEach(button => {
            button.classList.toggle('btn-primary', button.dataset.vectorMemoryModeSwitch === chat.memoryMode);
            button.classList.toggle('btn-secondary', button.dataset.vectorMemoryModeSwitch !== chat.memoryMode);
        });
    }

    function renderVectorMemoryScreen() {
        const chat = getCurrentVectorChat();
        const screen = document.getElementById('vector-memory-screen');
        if (!screen) return;
        refreshVectorHeader(chat);
        refreshVectorAutoControls(chat);
        document.querySelectorAll('.vector-memory-tab-btn').forEach(button => {
            button.classList.toggle('active', button.dataset.tab === uiState.tab);
            button.classList.toggle('btn-primary', button.dataset.tab === uiState.tab);
            button.classList.toggle('btn-secondary', button.dataset.tab !== uiState.tab);
        });
        if (!chat) {
            const content = document.getElementById('vector-memory-content');
            if (content) {
                content.innerHTML = '<div class="vector-memory-empty-card">向量记忆暂时只支持单角色私聊。</div>';
            }
            return;
        }
        if (uiState.tab === 'templates') renderVectorTemplatesTab(chat);
        else if (uiState.tab === 'history') renderVectorHistoryTab(chat);
        else renderVectorEntriesTab(chat);
    }

    function openTemplateModal(template) {
        const modal = document.getElementById('vector-template-modal');
        if (!modal) return;
        uiState.editingTemplateId = template ? template.id : null;
        document.getElementById('vector-template-name').value = template?.name || '';
        document.getElementById('vector-template-description').value = template?.description || '';
        document.getElementById('vector-template-topk').value = template?.topK || VECTOR_MEMORY_DEFAULT_TOP_K;
        document.getElementById('vector-template-threshold').value = template?.similarityThreshold || VECTOR_MEMORY_DEFAULT_THRESHOLD;
        document.getElementById('vector-template-max-length').value = template?.maxEntryLength || VECTOR_MEMORY_DEFAULT_MAX_ENTRY_LENGTH;
        document.getElementById('vector-template-summary-prompt').value = template?.summaryPrompt || createStarterVectorTemplate().summaryPrompt;
        document.getElementById('vector-template-inject-prompt').value = template?.injectPrompt || createStarterVectorTemplate().injectPrompt;
        modal.classList.add('visible');
    }

    function closeTemplateModal() {
        const modal = document.getElementById('vector-template-modal');
        if (modal) modal.classList.remove('visible');
        uiState.editingTemplateId = null;
    }

    async function saveTemplateFromModal() {
        ensureVectorTemplateStore();
        const name = (document.getElementById('vector-template-name')?.value || '').trim();
        if (!name) {
            showToast('模板名称不能为空');
            return;
        }
        const template = {
            id: uiState.editingTemplateId || createVectorId('vector_tpl'),
            name,
            description: (document.getElementById('vector-template-description')?.value || '').trim(),
            topK: Math.max(1, parseInt(document.getElementById('vector-template-topk')?.value, 10) || VECTOR_MEMORY_DEFAULT_TOP_K),
            similarityThreshold: Math.max(0, Math.min(1, parseFloat(document.getElementById('vector-template-threshold')?.value) || VECTOR_MEMORY_DEFAULT_THRESHOLD)),
            maxEntryLength: Math.max(200, parseInt(document.getElementById('vector-template-max-length')?.value, 10) || VECTOR_MEMORY_DEFAULT_MAX_ENTRY_LENGTH),
            summaryPrompt: (document.getElementById('vector-template-summary-prompt')?.value || '').trim(),
            injectPrompt: (document.getElementById('vector-template-inject-prompt')?.value || '').trim(),
            summaryTemperature: 0.35
        };
        const index = db.vectorMemoryTemplates.findIndex(item => item.id === template.id);
        if (index >= 0) db.vectorMemoryTemplates[index] = template;
        else db.vectorMemoryTemplates.unshift(template);
        const chat = getCurrentVectorChat();
        if (chat && !chat.vectorMemory.boundTemplateId) {
            chat.vectorMemory.boundTemplateId = template.id;
        }
        await saveData();
        if (chat) await saveCharacter(chat.id);
        closeTemplateModal();
        renderVectorMemoryScreen();
        showToast('向量模板已保存');
    }

    function openManualModal() {
        const chat = getCurrentVectorChat();
        const modal = document.getElementById('vector-manual-modal');
        if (!chat || !modal) return;
        const historyLength = Array.isArray(chat.history) ? chat.history.length : 0;
        document.getElementById('vector-manual-recent-count').value = Math.max(1, Math.min(40, historyLength || 20));
        document.getElementById('vector-manual-range-start').value = Math.max(1, historyLength - 19);
        document.getElementById('vector-manual-range-end').value = historyLength || 1;
        document.getElementById('vector-manual-title').value = '';
        document.getElementById('vector-manual-text').value = '';
        modal.classList.add('visible');
    }

    function closeManualModal() {
        const modal = document.getElementById('vector-manual-modal');
        if (modal) modal.classList.remove('visible');
    }

    async function submitManualSummary() {
        const chat = getCurrentVectorChat();
        if (!chat) return;
        const mode = document.querySelector('input[name="vector-manual-mode"]:checked')?.value || 'recent';
        try {
            if (mode === 'text') {
                await addVectorEntry(chat, {
                    title: (document.getElementById('vector-manual-title')?.value || '').trim(),
                    text: (document.getElementById('vector-manual-text')?.value || '').trim(),
                    source: 'manual_text',
                    pinned: true
                });
                pushVectorHistory(chat, 'manual_text', '手动录入 1 条向量记忆');
            } else if (mode === 'range') {
                const start = Math.max(1, parseInt(document.getElementById('vector-manual-range-start')?.value, 10) || 1);
                const end = Math.max(start, parseInt(document.getElementById('vector-manual-range-end')?.value, 10) || start);
                await summarizeRangeToVectorEntry(chat, start, end, { source: 'manual_range' });
            } else {
                const recentCount = Math.max(1, parseInt(document.getElementById('vector-manual-recent-count')?.value, 10) || 20);
                const history = Array.isArray(chat.history) ? chat.history : [];
                const start = Math.max(1, history.length - recentCount + 1);
                const end = history.length;
                await summarizeRangeToVectorEntry(chat, start, end, { source: 'manual_recent' });
            }
            await saveCharacter(chat.id);
            closeManualModal();
            renderVectorMemoryScreen();
            showToast('向量记忆已生成');
        } catch (error) {
            console.error('[VectorMemory] manual summary failed:', error);
            if (typeof showApiError === 'function' && /API/i.test(error.message || '')) showApiError(error);
            else showToast(error.message || '手动总结失败');
        }
    }

    async function summarizeVectorLatest(chat) {
        ensureVectorMemoryState(chat);
        const info = getAutoVectorCursorInfo(chat);
        if (info.unsummarizedCount <= 0) {
            showToast('当前没有新增消息需要总结');
            return;
        }
        const start = info.nextStartIndex + 1;
        const end = info.history.length;
        await summarizeRangeToVectorEntry(chat, start, end, { source: 'latest_summary' });
        setVectorCursorByEndIndex(chat, end);
        await saveCharacter(chat.id);
        renderVectorMemoryScreen();
        showToast(`已总结到最新（第${start}-${end}条）`);
    }

    async function retryVectorAutoSummary(chat) {
        ensureVectorMemoryState(chat);
        if (chat.vectorMemory.autoSummaryState === 'running') {
            showToast('向量自动总结进行中，请稍候...');
            return;
        }
        let count = 0;
        try {
            while (getNextAutoVectorRange(chat)) {
                count += await runVectorAutoSummary(chat, { force: true, ignoreFailedState: true, silent: true });
            }
            renderVectorMemoryScreen();
            showToast(count > 0 ? `已补做 ${count} 次向量自动总结` : '当前没有可补的向量自动总结范围');
        } catch (error) {
            console.error('[VectorMemory] retry auto summary failed:', error);
            if (typeof showApiError === 'function') showApiError(error);
            else showToast(error.message || '向量自动总结失败');
        }
    }

    async function bindTemplateToCurrentChat(templateId) {
        const chat = getCurrentVectorChat();
        if (!chat) return;
        ensureVectorMemoryState(chat);
        chat.vectorMemory.boundTemplateId = templateId;
        clearVectorContextCache(chat);
        await saveCharacter(chat.id);
        renderVectorMemoryScreen();
        showToast('已绑定新的向量模板');
    }

    async function deleteTemplate(templateId) {
        if (!window.confirm('确定删除这个向量模板吗？')) return;
        const index = db.vectorMemoryTemplates.findIndex(item => item.id === templateId);
        if (index < 0) return;
        db.vectorMemoryTemplates.splice(index, 1);
        ensureVectorTemplateStore();
        db.characters.forEach(chat => {
            ensureVectorMemoryState(chat);
            if (chat.vectorMemory.boundTemplateId === templateId) {
                chat.vectorMemory.boundTemplateId = db.vectorMemoryTemplates[0]?.id || null;
                clearVectorContextCache(chat);
            }
        });
        await saveData();
        renderVectorMemoryScreen();
        showToast('向量模板已删除');
    }

    function exportTemplate(templateId) {
        const template = db.vectorMemoryTemplates.find(item => item.id === templateId);
        if (!template) return;
        downloadJson(template, `${template.name || 'vector-template'}.json`);
    }

    async function handleEntryAction(action, entryId) {
        const chat = getCurrentVectorChat();
        if (!chat) return;
        ensureVectorMemoryState(chat);
        const entry = chat.vectorMemory.entries.find(item => item.id === entryId);
        if (!entry) return;
        if (action === 'toggle-pin') {
            entry.pinned = !entry.pinned;
            entry.updatedAt = Date.now();
            clearVectorContextCache(chat);
            await saveCharacter(chat.id);
            renderVectorMemoryScreen();
            showToast(entry.pinned ? '已置顶该记忆' : '已取消置顶');
        } else if (action === 'boost-weight') {
            entry.weight = Math.min(3, (Number(entry.weight) || 1) + 0.15);
            entry.updatedAt = Date.now();
            clearVectorContextCache(chat);
            await saveCharacter(chat.id);
            renderVectorMemoryScreen();
            showToast(`记忆权重已提升到 ${entry.weight.toFixed(2)}`);
        } else if (action === 'delete-entry') {
            if (!window.confirm('确定删除这条向量记忆吗？')) return;
            chat.vectorMemory.entries = chat.vectorMemory.entries.filter(item => item.id !== entryId);
            pushVectorHistory(chat, 'delete', `删除记忆：${entry.title}`);
            clearVectorContextCache(chat);
            await saveCharacter(chat.id);
            renderVectorMemoryScreen();
            showToast('向量记忆已删除');
        }
    }

    function switchVectorMemoryMode(mode) {
        const chat = getCurrentVectorChat();
        if (!chat) return;
        if (!['journal', 'table', 'vector'].includes(mode)) return;
        chat.memoryMode = mode;
        saveCharacter(chat.id);
        renderVectorMemoryScreen();
        showToast(mode === 'journal' ? '已切换为日记模式' : (mode === 'table' ? '已切换为表格模式' : '已切换为向量模式'));
    }

    function setupVectorMemoryScreen() {
        ensureVectorTemplateStore();

        const createTemplateBtn = document.getElementById('vector-memory-create-template-btn');
        if (createTemplateBtn) {
            createTemplateBtn.addEventListener('click', () => openTemplateModal(null));
        }

        const saveTemplateBtn = document.getElementById('vector-template-save-btn');
        if (saveTemplateBtn) saveTemplateBtn.addEventListener('click', saveTemplateFromModal);

        const cancelTemplateBtn = document.getElementById('vector-template-cancel-btn');
        if (cancelTemplateBtn) cancelTemplateBtn.addEventListener('click', closeTemplateModal);

        const manualBtn = document.getElementById('vector-memory-manual-btn');
        if (manualBtn) manualBtn.addEventListener('click', openManualModal);

        const manualCancelBtn = document.getElementById('vector-manual-cancel-btn');
        if (manualCancelBtn) manualCancelBtn.addEventListener('click', closeManualModal);

        const manualSaveBtn = document.getElementById('vector-manual-save-btn');
        if (manualSaveBtn) manualSaveBtn.addEventListener('click', submitManualSummary);

        const importBtn = document.getElementById('vector-memory-import-btn');
        const importInput = document.getElementById('vector-memory-import-input');
        if (importBtn && importInput) {
            importBtn.addEventListener('click', () => importInput.click());
            importInput.addEventListener('change', async () => {
                await importVectorFile(importInput.files[0]);
                importInput.value = '';
            });
        }

        const exportAllBtn = document.getElementById('vector-memory-export-all-btn');
        if (exportAllBtn) exportAllBtn.addEventListener('click', exportVectorTemplates);

        const exportPackageBtn = document.getElementById('vector-memory-export-package-btn');
        if (exportPackageBtn) exportPackageBtn.addEventListener('click', exportVectorMemoryPackage);

        const fromJournalBtn = document.getElementById('vector-memory-from-journal-btn');
        if (fromJournalBtn) fromJournalBtn.addEventListener('click', convertJournalsToVector);

        const fromTableBtn = document.getElementById('vector-memory-from-table-btn');
        if (fromTableBtn) fromTableBtn.addEventListener('click', convertTableToVector);

        const toJournalBtn = document.getElementById('vector-memory-to-journal-btn');
        if (toJournalBtn) toJournalBtn.addEventListener('click', convertVectorToJournal);

        const toTableBtn = document.getElementById('vector-memory-to-table-btn');
        if (toTableBtn) toTableBtn.addEventListener('click', convertVectorToTable);

        const autoToggle = document.getElementById('vector-memory-auto-toggle');
        if (autoToggle) {
            autoToggle.addEventListener('change', async (event) => {
                const chat = getCurrentVectorChat();
                if (!chat) return;
                ensureVectorMemoryState(chat);
                chat.vectorMemory.autoSummaryEnabled = event.target.checked;
                if (!event.target.checked) {
                    chat.vectorMemory.autoSummaryPending = false;
                    if (chat.vectorMemory.autoSummaryState === 'running') chat.vectorMemory.autoSummaryState = 'idle';
                } else {
                    chat.vectorMemory.autoSummaryState = 'idle';
                }
                await saveCharacter(chat.id);
                refreshVectorAutoControls(chat);
            });
        }

        const autoInterval = document.getElementById('vector-memory-auto-interval');
        if (autoInterval) {
            autoInterval.addEventListener('blur', async () => {
                const chat = getCurrentVectorChat();
                if (!chat) return;
                ensureVectorMemoryState(chat);
                chat.vectorMemory.autoSummaryInterval = Math.max(10, parseInt(autoInterval.value, 10) || VECTOR_MEMORY_DEFAULT_INTERVAL);
                await saveCharacter(chat.id);
                refreshVectorAutoControls(chat);
            });
        }

        const latestBtn = document.getElementById('vector-memory-latest-btn');
        if (latestBtn) {
            latestBtn.addEventListener('click', async () => {
                const chat = getCurrentVectorChat();
                if (!chat) return;
                try {
                    await summarizeVectorLatest(chat);
                } catch (error) {
                    console.error('[VectorMemory] summarize latest failed:', error);
                    if (typeof showApiError === 'function') showApiError(error);
                    else showToast(error.message || '总结到最新失败');
                }
            });
        }

        const retryBtn = document.getElementById('vector-memory-retry-btn');
        if (retryBtn) {
            retryBtn.addEventListener('click', async () => {
                const chat = getCurrentVectorChat();
                if (!chat) return;
                await retryVectorAutoSummary(chat);
            });
        }

        document.querySelectorAll('.vector-memory-tab-btn').forEach(button => {
            button.addEventListener('click', () => {
                uiState.tab = button.dataset.tab || 'entries';
                renderVectorMemoryScreen();
            });
        });

        document.querySelectorAll('[data-vector-memory-mode-switch]').forEach(button => {
            button.addEventListener('click', () => {
                switchVectorMemoryMode(button.dataset.vectorMemoryModeSwitch);
            });
        });

        const screen = document.getElementById('vector-memory-screen');
        if (screen) {
            screen.addEventListener('click', async (event) => {
                const actionEl = event.target.closest('[data-action]');
                if (!actionEl) return;
                const action = actionEl.dataset.action;
                if (action === 'bind-template') {
                    await bindTemplateToCurrentChat(actionEl.dataset.templateId);
                } else if (action === 'edit-template') {
                    const template = db.vectorMemoryTemplates.find(item => item.id === actionEl.dataset.templateId);
                    if (template) openTemplateModal(template);
                } else if (action === 'delete-template') {
                    await deleteTemplate(actionEl.dataset.templateId);
                } else if (action === 'export-template') {
                    exportTemplate(actionEl.dataset.templateId);
                } else if (action === 'toggle-pin' || action === 'delete-entry' || action === 'boost-weight') {
                    await handleEntryAction(action, actionEl.dataset.entryId);
                }
            });
        }

        const openFromSettingsBtn = document.getElementById('setting-open-vector-memory-btn');
        if (openFromSettingsBtn) {
            openFromSettingsBtn.addEventListener('click', () => {
                renderVectorMemoryScreen();
                switchScreen('vector-memory-screen');
            });
        }
    }

    window.setupVectorMemoryScreen = setupVectorMemoryScreen;
    window.renderVectorMemoryScreen = renderVectorMemoryScreen;
    window.ensureVectorMemoryState = ensureVectorMemoryState;
    window.getVectorMemoryContextBlock = getVectorMemoryContextBlock;
    window.prepareVectorMemoryContext = prepareVectorMemoryContext;
    window.checkAndTriggerVectorMemory = checkAndTriggerVectorMemory;
    window.resetVectorCursorToLatest = resetVectorCursorToLatest;
})();
