// Character-authored content outside chat. Chat bubbles keep their existing parser and settings.
(function () {
    const scopes = ['moments', 'peek', 'journal', 'forum', 'battery', 'pomodoro', 'theater', 'friendRequest'];
    const defaults = { display: 'click', scopes: Object.fromEntries(scopes.map(scope => [scope, true])) };
    const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const settings = () => db.bilingualSettings && typeof db.bilingualSettings === 'object' ? db.bilingualSettings : defaults;
    const peekDisplayModes = ['click', 'both', 'inline'];
    const peekDisplay = () => peekDisplayModes.includes(settings().peekConversationDisplay) ? settings().peekConversationDisplay : 'inherit';
    function displayMode(peekConversation) {
        const mode = peekConversation ? peekDisplay() : 'inherit';
        return mode === 'inherit' ? (settings().display === 'both' ? 'both' : 'click') : mode;
    }
    const formatTranslation = (translation, mode) => mode === 'inline' && translation ? `「${translation}」` : translation;
    const enabled = (character, scope) => !!character?.bilingualModeEnabled && scopes.includes(scope) && settings().scopes?.[scope] !== false;
    const language = character => String(character?.bilingualLanguage || '').trim() || '符合角色人设的非中文常用语言';
    const prompt = (character, scope, description = '角色本人撰写或说出的文字') => enabled(character, scope)
        ? `\n【角色语言】${description}须使用${language(character)}自然表达；不要为展示目的在正文中追加中文翻译。保留原有 JSON/XML 标签、字段名、ID、链接、数值及机器提示词格式。其他人物说的话仍按各自人设语言表达。\n`
        : '';
    function key(characterId, scope, source) {
        let hash = 2166136261;
        const input = characterId + '\u0000' + scope + '\u0000' + source;
        for (let i = 0; i < input.length; i++) hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
        return (hash >>> 0).toString(36) + ':' + input.length;
    }
    function cached(characterId, scope, source) {
        const entry = db.bilingualTranslations?.[key(characterId, scope, source)];
        return entry?.source === source && entry?.characterId === characterId && entry?.scope === scope ? entry.translation : '';
    }
    function alreadyChinese(value, character) {
        if (/日语|日本語|韩语|朝鲜语|韓國語/.test(character?.bilingualLanguage || '') || /[\u3040-\u30ff\uac00-\ud7af]/.test(value)) return false;
        const letters = Array.from(value).filter(char => /\p{L}/u.test(char));
        return letters.length > 0 && letters.filter(char => /[\u3400-\u9fff]/.test(char)).length / letters.length > 0.6;
    }
    function html(source, character, scope, feature = scope, options = {}) {
        const value = String(source ?? '');
        const original = options.originalHtml ?? escape(value).replace(/\n/g, '<br>');
        if (!value.trim() || !enabled(character, scope) || alreadyChinese(value, options.peekSpeaker === 'partner' ? null : character)) return original;
        const translation = cached(character.id, scope, value);
        const mode = displayMode(!!options.peekSpeaker);
        const expanded = mode !== 'click' && !!translation;
        const label = expanded ? '收起翻译' : '查看翻译';
        const button = `<button type="button" class="bilingual-reveal" aria-expanded="${expanded}" aria-label="${label}">${label}</button>`;
        const output = `<span class="bilingual-translation"${expanded ? '' : ' hidden'}>${escape(formatTranslation(translation, mode))}</span>`;
        return `<span class="bilingual-content" data-character-id="${escape(character.id)}" data-scope="${escape(scope)}" data-feature="${escape(feature)}" data-source="${escape(value)}" data-bilingual-display="${mode}"${options.peekSpeaker ? ' data-peek-conversation' : ''}><span class="bilingual-original">${original}</span>${mode === 'inline' ? output + button : button + output}</span>`;
    }
    const pending = new Map();
    function apiConfig(feature, character) {
        let fallback = db.apiSettings;
        const configured = feature === 'peek' ? db.peekApiSettings
            : feature === 'journal' ? db.summaryApiSettings
            : feature === 'moments' ? db.backgroundApiSettings
            : feature === 'forum' && db.forumApiSettings?.useForumApi ? db.forumApiSettings
            : feature === 'theater' ? db.theaterApiSettings : null;
        if (configured && (typeof isApiConfigReady === 'function' ? isApiConfigReady(configured) : configured.url && configured.model && configured.key)) fallback = configured;
        return typeof getApiConfigForFeature === 'function' ? getApiConfigForFeature(feature, fallback, character) : fallback;
    }
    async function translate(character, scope, source, feature) {
        const cacheKey = key(character.id, scope, source);
        const saved = cached(character.id, scope, source);
        if (saved) return saved;
        if (pending.has(cacheKey)) return pending.get(cacheKey);
        const work = (async () => {
            const config = apiConfig(feature, character);
            if (typeof isApiConfigReady === 'function' ? !isApiConfigReady(config) : !config?.url || !config?.model || !config?.key) throw new Error('请先配置可用的翻译 API');
            const url = String(config.url).replace(/\/+$/, '') + '/v1/chat/completions';
            const body = { model: config.model, messages: [{ role: 'system', content: '你是翻译器。只将用户提供的原文翻译成自然的简体中文。保留人名、@提及、网址、金额、换行和原有语气。不要续写、解释或添加引号；若原文已经是中文，则原样返回。' }, { role: 'user', content: source }], temperature: 0.2 };
            const raw = await fetchAiResponse(config, body, { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (config.key || '') }, url);
            const translation = String(raw || '').trim().replace(/^```(?:text)?\s*|\s*```$/g, '').trim();
            if (!translation) throw new Error('翻译 API 没有返回内容');
            if (!db.bilingualTranslations || typeof db.bilingualTranslations !== 'object') db.bilingualTranslations = {};
            db.bilingualTranslations[cacheKey] = { characterId: character.id, scope, source, translation, updatedAt: Date.now() };
            const entries = Object.entries(db.bilingualTranslations);
            if (entries.length > 1500) entries.sort((a, b) => (a[1]?.updatedAt || 0) - (b[1]?.updatedAt || 0)).slice(0, entries.length - 1500).forEach(([oldKey]) => delete db.bilingualTranslations[oldKey]);
            await saveGlobalSettings(['bilingualTranslations']);
            return translation;
        })();
        pending.set(cacheKey, work);
        try { return await work; } finally { pending.delete(cacheKey); }
    }
    async function composeNative(character, scope, source, feature = scope) {
        if (!enabled(character, scope)) return source;
        const config = apiConfig(feature);
        if (typeof isApiConfigReady === 'function' ? !isApiConfigReady(config) : !config?.url || !config?.model || !config?.key) return source;
        const body = { model: config.model, messages: [{ role: 'system', content: `将这句短消息自然地改写成${language(character)}，保留原意和人物语气，只输出消息正文。` }, { role: 'user', content: source }], temperature: 0.3 };
        const result = await fetchAiResponse(config, body, { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (config.key || '') }, String(config.url).replace(/\/+$/, '') + '/v1/chat/completions');
        return String(result || '').trim() || source;
    }
    function setTranslation(node, translation) {
        const button = node.querySelector('.bilingual-reveal');
        const output = node.querySelector('.bilingual-translation');
        const label = translation ? '收起翻译' : '查看翻译';
        output.textContent = formatTranslation(translation, node.dataset.bilingualDisplay);
        output.hidden = !translation;
        if (!node.dataset.loading) button.textContent = label;
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-expanded', String(!!translation));
    }
    async function reveal(node, automatic = false) {
        if (!node || node.dataset.loading === 'true') return;
        const button = node.querySelector('.bilingual-reveal');
        const output = node.querySelector('.bilingual-translation');
        if (!button || !output) return;
        if (!output.hidden) {
            if (!automatic) setTranslation(node, '');
            return;
        }
        const character = (db.characters || []).find(item => item.id === node.dataset.characterId);
        if (!enabled(character, node.dataset.scope)) return;
        const startingMode = node.dataset.bilingualDisplay;
        node.dataset.loading = 'true';
        button.disabled = true;
        button.textContent = '翻译中…';
        try {
            const result = await translate(character, node.dataset.scope, node.dataset.source, node.dataset.feature);
            if (!node.isConnected) return;
            const mode = node.dataset.bilingualDisplay;
            const show = enabled(character, node.dataset.scope) && (mode !== 'click' || (!automatic && startingMode === 'click'));
            delete node.dataset.loading;
            setTranslation(node, show ? result : '');
        } catch (error) {
            button.textContent = '重试翻译';
            if (typeof showToast === 'function') showToast(error.message || '翻译失败');
        } finally { button.disabled = false; delete node.dataset.loading; }
    }
    document.addEventListener('click', event => {
        const button = event.target.closest('.bilingual-reveal');
        if (button) { event.preventDefault(); event.stopPropagation(); reveal(button.closest('.bilingual-content')); }
    }, true);
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting && entry.target.dataset.bilingualDisplay !== 'click') {
            observer.unobserve(entry.target);
            reveal(entry.target, true);
        }
    }, { rootMargin: '100px' }) : null;
    const mount = () => {
        if (!observer) return;
        document.querySelectorAll('.bilingual-content:not([data-bilingual-display="click"]):not([data-observed])').forEach(node => { node.dataset.observed = 'true'; observer.observe(node); });
    };
    function syncSettingsUi() {
        document.querySelectorAll('[data-bilingual-scope]').forEach(input => { input.checked = settings().scopes?.[input.dataset.bilingualScope] !== false; });
        const display = document.getElementById('setting-bilingual-global-display');
        if (display) display.value = displayMode(false);
        const conversationDisplay = document.getElementById('setting-bilingual-peek-conversation-display');
        if (conversationDisplay) conversationDisplay.value = peekDisplay();
    }
    document.addEventListener('change', event => {
        const input = event.target;
        if (!input.matches?.('[data-bilingual-scope], #setting-bilingual-global-display, #setting-bilingual-peek-conversation-display')) return;
        if (!db.bilingualSettings || typeof db.bilingualSettings !== 'object') db.bilingualSettings = structuredClone(defaults);
        if (!db.bilingualSettings.scopes) db.bilingualSettings.scopes = { ...defaults.scopes };
        if (input.dataset.bilingualScope) db.bilingualSettings.scopes[input.dataset.bilingualScope] = input.checked;
        else if (input.id === 'setting-bilingual-peek-conversation-display') db.bilingualSettings.peekConversationDisplay = peekDisplayModes.includes(input.value) ? input.value : 'inherit';
        else db.bilingualSettings.display = input.value === 'both' ? 'both' : 'click';
        saveGlobalSettings(['bilingualSettings']);
        if (input.dataset.bilingualScope) return;
        document.querySelectorAll('.bilingual-content').forEach(node => {
            const mode = displayMode(node.hasAttribute('data-peek-conversation'));
            if (node.dataset.bilingualDisplay === mode) return;
            node.dataset.bilingualDisplay = mode;
            observer?.unobserve(node);
            delete node.dataset.observed;
            const button = node.querySelector('.bilingual-reveal');
            const output = node.querySelector('.bilingual-translation');
            if (mode === 'inline') output.after(button);
            else button.after(output);
            const translation = mode === 'click' ? '' : cached(node.dataset.characterId, node.dataset.scope, node.dataset.source);
            setTranslation(node, translation);
        });
        mount();
    });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncSettingsUi, { once: true });
    else syncSettingsUi();
    if (typeof MutationObserver === 'function') new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
    window.BilingualContent = { scopes, enabled, prompt, html, mount, escape, syncSettingsUi, composeNative, translate };
})();
