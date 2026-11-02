/* HTML chat messages. Original source and persisted state stay on the message;
 * iframe instances, tokens and preview state are deliberately never persisted. */
(function () {
    'use strict';
    const MAX_SOURCE = 512 * 1024;
    const MAX_STATE = 1024 * 1024;
    const MAX_FRAMES = 6;
    const frames = new Map();
    const records = new Set();
    const waiting = new Set();
    let booting;
    try { booting = new Set(JSON.parse(sessionStorage.getItem('ovo-html-booting') || '[]')); } catch (_) { booting = new Set(); }
    const interrupted = new Set(booting);
    function markBoot(record, value) {
        if (record.preview) return;
        const key = JSON.stringify([record.type, record.chatId, record.messageId, hash(record.source)]);
        if (value) booting.add(key); else booting.delete(key);
        try { sessionStorage.setItem('ovo-html-booting', JSON.stringify(Array.from(booting))); } catch (_) { /* Optional recovery storage. */ }
    }
    let previewRecord = null;
    let editorCleanup = null;
    const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
    const hash = text => {
        let value = 2166136261;
        for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
        return (value >>> 0).toString(36);
    };
    function extract(value, force = false) {
        if (typeof value !== 'string') return null;
        let source = value.trim();
        const wrapped = source.match(/^<uwuxjc(?:\s+char=["'][^"']*["'])?\s*>([\s\S]*)<\/uwuxjc>$/i);
        const fenced = source.match(/^```html\s*\r?\n([\s\S]*?)\r?\n?```$/i);
        if (wrapped && readBlock(source, 0)?.end !== source.length) return null;
        if (!wrapped && !fenced && /^(?:<!doctype\s+html\b[^>]*>\s*)?<html\b/i.test(source) && readBlock(source, 0)?.end !== source.length) return null;
        if (wrapped) source = wrapped[1].trim();
        else if (fenced) source = fenced[1].trim();
        if (!force && !wrapped && !fenced && !/^(?:<!doctype\s+html\b[^>]*>\s*)?<html\b/i.test(source)) return null;
        return source ? { source } : null;
    }
    function sourceOf(message) {
        if (!message || message.interactive?.mode === 'text') return null;
        const part = message.parts?.length === 1 && message.parts[0].type === 'html' ? message.parts[0] : null;
        // Plain chat text is not promoted during rendering. Recognition happens at save/AI intake.
        if (!part) return null;
        return extract(part.text || '', message.interactive?.enabled === true);
    }
    function readBlock(text, start) {
        const opening = text.slice(start).match(/^(?:<!doctype\s+html\b[^>]*>\s*)?<(html|uwuxjc)\b[^>]*>/i);
        if (!opening) return null;
        const root = opening[1].toLowerCase();
        // Raw-text elements are consumed as a unit: JS strings and comparisons are not chat markup.
        const tags = /<!--[\s\S]*?-->|<(script|style|textarea|title)\b[^>]*>[\s\S]*?<\/\1\s*>|<\/?([a-z][\w:-]*)\b[^>]*>/gi;
        tags.lastIndex = start + opening[0].length;
        let depth = 1, token;
        while ((token = tags.exec(text))) {
            if (token[2]?.toLowerCase() !== root) continue;
            depth += /^<\//.test(token[0]) ? -1 : 1;
            if (!depth) {
                const content = text.slice(start, tags.lastIndex);
                return { end: tags.lastIndex, content, char: opening[0].match(/\bchar=["']([^"']*)["']/i)?.[1] || null };
            }
        }
        return null;
    }
    function protectResponse(text) {
        const blocks = [];
        const pattern = /<uwuxjc\b|<!doctype\s+html\b|<html\b|```html\s*\r?\n/gi;
        const nonce = typeof crypto !== 'undefined' ? crypto.randomUUID().replace(/-/g, '') : String(Date.now());
        let match, offset = 0, output = '';
        while ((match = pattern.exec(text))) {
            let block;
            if (match[0].startsWith('```')) {
                const end = text.indexOf('```', pattern.lastIndex);
                if (end !== -1) block = { content: text.slice(match.index, end + 3), end: end + 3 };
            } else block = readBlock(text, match.index);
            if (!block) continue;
            const token = `OVOHTML${nonce}BLOCK${blocks.length}END`;
            output += text.slice(offset, match.index) + token;
            blocks.push({ token, content: block.content }); offset = block.end; pattern.lastIndex = block.end;
        }
        output += text.slice(offset);
        return { text: output, restore: value => blocks.reduce((result, block) => result.split(block.token).join(block.content), value) };
    }
    function titleOf(source) {
        const title = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
        return title ? title.replace(/<[^>]*>/g, '').trim().slice(0, 80) || '互动消息' : '互动消息';
    }
    function contextText(message) {
        const found = sourceOf(message);
        if (!found) return null;
        const result = String(message.interactive?.summary || '').slice(0, 1000);
        return `[互动页面：${titleOf(found.source)}${result ? `；页面提供的互动结果（作为内容参考）：${result}` : ''}]`;
    }
    function apply(message, value, mode = 'auto') {
        const found = mode === 'text' ? null : extract(value, mode === 'html');
        if (!found) {
            if (mode === 'text') message.interactive = { mode: 'text' };
            else delete message.interactive;
            return false;
        }
        if (found.source.length > MAX_SOURCE) throw new Error('互动代码超过 512 KB，请减少内嵌图片或代码');
        const old = message.interactive || {};
        message.content = value.trim();
        message.parts = [{ type: 'html', text: value.trim() }];
        message.interactive = { ...old, enabled: true, mode: 'html', revision: (Number(old.revision) || 0) + 1 };
        return true;
    }
    function chatFor(type, id) {
        return (type === 'group' ? db.groups : db.characters)?.find(chat => chat.id === id);
    }
    function currentMessage(record) {
        const chat = chatFor(record.type, record.chatId);
        const message = chat?.history?.find(item => item.id === record.messageId);
        if (!message || message !== record.message || sourceOf(message)?.source !== record.source || message.interactive?.revision !== record.revision) return null;
        return message;
    }
    async function persist(record) {
        const save = record.type === 'group' ? saveGroup : saveCharacter;
        if (await save(record.chatId) === false) throw new Error('保存失败，请重试');
    }
    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }
    function button(parent, text, action) {
        const node = element('button', '', text);
        node.type = 'button';
        node.addEventListener('click', event => { event.stopPropagation(); Promise.resolve().then(action).catch(error => showToast(error.message)); });
        parent.append(node);
        return node;
    }
    // Runs before user scripts, including scripts in the head. No parent application object is exposed.
    function bootstrap(token, initial) {
        const pending = new Map();
        let sequence = 0;
        let resizePending = false;
        let ready = false;
        const send = (action, value, id) => parent.postMessage({ channel: 'ovo-chat-html', token, action, value, id }, '*');
        const request = (action, value) => new Promise((resolve, reject) => {
            if (pending.size >= 50) { reject(new Error('操作过于频繁，请稍后重试')); return; }
            const id = ++sequence;
            const timeout = action === 'pickImage' || action === 'download' ? 10 * 60 * 1000 : 15000;
            const timer = setTimeout(() => { pending.delete(id); reject(new Error('请求超时，请重试')); }, timeout);
            pending.set(id, { resolve, reject, timer });
            send(action, value, id);
        });
        const report = value => send('error', String(value).slice(0, 2000));
        window.addEventListener('error', event => {
            if (event.target !== window) report(`资源加载失败：${event.target?.getAttribute?.('src') || event.target?.getAttribute?.('href') || event.target?.tagName || '未知资源'}`);
            else report(`${event.message || '脚本运行失败'}${event.lineno ? `（行 ${event.lineno}）` : ''}`);
        }, true);
        window.addEventListener('unhandledrejection', event => report(event.reason?.message || event.reason));
        window.addEventListener('securitypolicyviolation', event => report(`资源未获允许：${event.blockedURI || event.violatedDirective}`));
        window.addEventListener('message', event => {
            if (event.source !== parent || event.data?.token !== token) return;
            if (event.data.action === 'visibility') {
                window.ovo.active = !!event.data.value;
                document.querySelectorAll('audio,video').forEach(media => { if (!window.ovo.active) media.pause(); });
                window.dispatchEvent(new CustomEvent('ovo:visibility', { detail: window.ovo.active }));
                return;
            }
            const task = pending.get(event.data.id);
            if (!task) return;
            clearTimeout(task.timer); pending.delete(event.data.id);
            if (event.data.error) task.reject(new Error(event.data.error)); else task.resolve(event.data.value);
        });
        let saving = Promise.resolve(), buffered = null;
        window.ovo = {
            state: initial,
            active: true,
            save(value) {
                // Serialize now so later caller mutations cannot change a queued save.
                let snapshot;
                try { snapshot = JSON.parse(JSON.stringify(value)); } catch (error) { return Promise.reject(error); }
                return new Promise((resolve, reject) => {
                    if (buffered) { buffered.value = snapshot; buffered.waiters.push({ resolve, reject }); return; }
                    buffered = { value: snapshot, waiters: [{ resolve, reject }] };
                    setTimeout(() => {
                        const batch = buffered; buffered = null;
                        saving = saving.catch(() => {}).then(() => request('save', batch.value));
                        saving.then(() => { this.state = batch.value; batch.waiters.forEach(task => task.resolve()); }, error => batch.waiters.forEach(task => task.reject(error)));
                    }, 80);
                });
            },
            summarize: value => request('summary', String(value)),
            pickImage: () => request('pickImage'),
            download: (text, filename = '互动内容.txt') => request('download', { text: String(text), filename: String(filename) }),
            resize() {
                if (!ready || resizePending) return;
                resizePending = true;
                requestAnimationFrame(() => {
                    resizePending = false;
                    const body = document.body;
                    const height = Math.ceil(Math.max(body?.scrollHeight || 0, body?.getBoundingClientRect().height || 0));
                    send('height', height);
                });
            }
        };
        window.addEventListener('DOMContentLoaded', () => {
            ready = true;
            new ResizeObserver(() => window.ovo.resize()).observe(document.body);
            new MutationObserver(() => window.ovo.resize()).observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
            document.addEventListener('load', () => window.ovo.resize(), true);
            document.addEventListener('click', event => {
                const link = event.target.closest?.('a');
                if (link && !link.getAttribute('href')?.startsWith('#')) { event.preventDefault(); report('外部链接请在浏览器中打开'); }
            });
            window.ovo.resize(); send('ready', true);
        });
        window.addEventListener('load', () => window.ovo.resize());
        window.addEventListener('resize', () => window.ovo.resize());
    }
    function allowedOrigins(value) {
        const result = [];
        for (const line of String(value || '').split(/[\s,]+/)) {
            if (!line) continue;
            let url;
            try { url = new URL(line); } catch (_) { throw new Error('资源来源请填写完整的 HTTPS 地址'); }
            if (url.protocol !== 'https:' || url.username || url.password || url.origin === 'null') throw new Error('资源来源只支持 HTTPS 地址');
            if (!result.includes(url.origin)) result.push(url.origin);
            if (result.length > 20) throw new Error('资源来源最多填写 20 个');
        }
        return result;
    }
    function template(value) {
        if (typeof value?.source !== 'string' || value.format !== 'ovo-html-template') throw new Error('不是可用的互动模板');
        if (value.source.length > MAX_SOURCE) throw new Error('互动代码超过 512 KB');
        const resources = {};
        for (const key of ['scripts', 'styles', 'connect']) resources[key] = allowedOrigins(Array.isArray(value.resources?.[key]) ? value.resources[key].join(' ') : '');
        const state = value.state || {};
        if (!state || typeof state !== 'object' || Array.isArray(state) || JSON.stringify(state).length > MAX_STATE) throw new Error('模板进度格式不正确或超过 1 MB');
        return { format: 'ovo-html-template', source: value.source, resources, state: JSON.parse(JSON.stringify(state)) };
    }
    async function saveFile(blob, filename) {
        if (window.OvoFileDownload) return window.OvoFileDownload.save(blob, filename);
        const url = URL.createObjectURL(blob);
        const link = element('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return true;
    }
    function buildDocument(source, token, state, resources = {}, chat = null) {
        if (source.length > MAX_SOURCE) throw new Error('互动代码超过 512 KB');
        // Remove untrusted policy/base elements before placing the host policy first.
        const parsed = new DOMParser().parseFromString(source, 'text/html');
        parsed.querySelectorAll('base,meta[http-equiv]').forEach(node => node.remove());
        const scripts = allowedOrigins(resources.scripts?.join(' '));
        const styles = allowedOrigins(resources.styles?.join(' '));
        const connect = allowedOrigins(resources.connect?.join(' '));
        const policy = parsed.createElement('meta');
        policy.httpEquiv = 'Content-Security-Policy';
        policy.content = `default-src 'none'; script-src 'unsafe-inline' ${scripts.join(' ')}; style-src 'unsafe-inline' ${styles.join(' ')}; img-src https: data: blob:; media-src https: data: blob:; font-src data: ${styles.join(' ')}; connect-src ${connect.join(' ') || "'none'"}; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
        const viewport = parsed.createElement('meta');
        viewport.name = 'viewport'; viewport.content = 'width=device-width, initial-scale=1';
        const style = parsed.createElement('style');
        style.textContent = 'html{overflow-x:hidden}body{margin:0;overflow-wrap:anywhere}img,video,canvas{max-width:100%}*,*::before,*::after{box-sizing:border-box}:root{color-scheme:light dark}';
        const bridge = parsed.createElement('script');
        bridge.textContent = `(${bootstrap.toString()})(${json(token)},${json(state || {})});`;
        // Apply known template placeholders to DOM text/attributes, never to executable code.
        if (chat && typeof processTemplate === 'function') {
            const walker = parsed.createTreeWalker(parsed.body, 4);
            let node;
            while ((node = walker.nextNode())) {
                if (!node.parentElement.closest('script,style')) node.textContent = processTemplate(node.textContent, chat);
            }
            parsed.querySelectorAll('*').forEach(node => {
                for (const attribute of Array.from(node.attributes)) {
                    if (!attribute.name.toLowerCase().startsWith('on')) node.setAttribute(attribute.name, processTemplate(attribute.value, chat));
                }
            });
            parsed.querySelectorAll('user-avatar,char-avatar').forEach(node => {
                const img = parsed.createElement('img');
                img.src = node.tagName.toLowerCase() === 'char-avatar' ? chat.avatar || '' : chat.myAvatar || chat.me?.avatar || '';
                for (const attr of Array.from(node.attributes)) img.setAttribute(attr.name, attr.value);
                node.replaceWith(img);
            });
        }
        parsed.head.prepend(policy, viewport, style, bridge);
        return '<!doctype html>\n' + parsed.documentElement.outerHTML;
    }
    function release(record) {
        record.closed = true;
        records.delete(record);
        markBoot(record, false);
        waiting.delete(record);
        clearTimeout(record.loadTimer);
        record.observer?.disconnect();
        record.loader?.disconnect();
        frames.delete(record.token);
        record.frame?.remove();
        record.fileInput?.remove();
        record.expanded = false;
        record.host.classList.remove('ovo-interactive-expanded');
        const expand = record.host.querySelector('.ovo-interactive-toolbar button');
        if (expand) expand.textContent = '展开';
        document.body.classList.toggle('ovo-interactive-open', !!document.querySelector('.ovo-interactive-expanded'));
        setTimeout(() => {
            for (const pending of waiting) {
                if (!pending.host.isConnected) { waiting.delete(pending); continue; }
                if (frames.size >= MAX_FRAMES) break;
                waiting.delete(pending); mount(pending);
            }
        }, 0);
    }
    function post(record, action, value) {
        record.frame?.contentWindow?.postMessage({ token: record.token, action, value }, '*');
    }
    function mount(record) {
        if (record.closed || !record.host.isConnected || record.frame) return;
        records.add(record);
        const disabled = record.message.interactive?.disabled;
        if (disabled) { record.status.textContent = '此消息已暂停运行，点击“运行”恢复'; return; }
        const recoveryKey = JSON.stringify([record.type, record.chatId, record.messageId, hash(record.source)]);
        if (!record.preview && interrupted.has(recoveryKey)) { record.status.textContent = '上次运行未完成，已暂停自动加载。可编辑代码或手动重载'; return; }
        if (frames.size >= MAX_FRAMES) { waiting.add(record); record.status.textContent = '同时运行已达 6 条，暂停其他页面后会自动加载'; return; }
        markBoot(record, true);
        record.token = crypto.randomUUID();
        record.closed = false;
        const frame = element('iframe', 'ovo-interactive-frame');
        frame.title = titleOf(record.source);
        frame.setAttribute('sandbox', 'allow-scripts');
        frame.referrerPolicy = 'no-referrer';
        record.frame = frame;
        frames.set(record.token, record);
        try {
            frame.srcdoc = buildDocument(record.source, record.token, record.message.interactive?.state, record.message.interactive?.resources, record.chat);
            record.viewport.append(frame);
            record.status.textContent = '正在加载…';
            record.loadTimer = setTimeout(() => { if (!record.ready) record.status.textContent = '加载时间较长，可查看错误或编辑代码'; }, 10000);
            if (typeof IntersectionObserver !== 'undefined') {
                record.observer = new IntersectionObserver(entries => {
                    record.visible = entries[0].isIntersecting;
                    post(record, 'visibility', record.visible && !document.hidden);
                });
                record.observer.observe(record.host);
            }
        } catch (error) { release(record); record.status.textContent = error.message; }
    }
    function restart(record) {
        interrupted.delete(JSON.stringify([record.type, record.chatId, record.messageId, hash(record.source)]));
        release(record); record.closed = false; record.ready = false; record.frame = null;
        record.errors.textContent = ''; record.errorDetails.hidden = true;
        mount(record);
    }
    async function updateOptions(record, patch) {
        const message = record.preview ? record.message : currentMessage(record);
        if (!message) throw new Error('消息已修改或移除');
        const old = message.interactive;
        const updated = { ...old, ...patch, enabled: true, mode: 'html' };
        message.interactive = updated;
        try { if (!record.preview) await persist(record); }
        catch (error) { if (message.interactive === updated) message.interactive = old; throw error; }
    }
    function createHost(record) {
        const host = record.host = element('div', 'message-bubble html-bubble ovo-interactive');
        const bar = element('div', 'ovo-interactive-toolbar');
        const title = element('span', 'ovo-interactive-title', titleOf(record.source));
        bar.append(title);
        button(bar, '展开', () => {
            record.expanded = !record.expanded;
            host.classList.toggle('ovo-interactive-expanded', record.expanded);
            expand.textContent = record.expanded ? '收起' : '展开';
            document.body.classList.toggle('ovo-interactive-open', record.expanded);
            post(record, 'visibility', true);
        });
        const expand = bar.lastElementChild;
        button(bar, '操作', () => { tools.hidden = !tools.hidden; });
        const tools = element('div', 'ovo-interactive-tools'); tools.hidden = true;
        button(tools, '运行 / 重载', async () => { await updateOptions(record, { disabled: false }); restart(record); });
        button(tools, '暂停运行', async () => { await updateOptions(record, { disabled: true }); release(record); record.frame = null; record.status.textContent = '已暂停，点击“运行 / 重载”恢复'; });
        button(tools, '清空进度', async () => { await updateOptions(record, { state: {}, summary: '' }); restart(record); });
        if (!record.preview) button(tools, '编辑代码', () => startMessageEdit(record.messageId));
        button(tools, '复制代码', async () => {
            try { await navigator.clipboard.writeText(record.source); record.status.textContent = '代码已复制'; }
            catch (_) { const field = element('textarea'); field.value = record.source; tools.append(field); field.select(); record.status.textContent = '请长按或按 Ctrl+C 复制'; }
        });
        if (!record.preview) button(tools, '消息菜单', () => {
            const wrapper = host.closest('.message-wrapper'); const rect = bar.getBoundingClientRect();
            handleMessageLongPress(wrapper, rect.left, rect.bottom);
        });
        record.viewport = element('div', 'ovo-interactive-viewport');
        record.status = element('div', 'ovo-interactive-status', '等待运行');
        record.status.setAttribute('role', 'status');
        record.errorDetails = element('details', 'ovo-interactive-errors'); record.errorDetails.hidden = true;
        record.errorDetails.append(element('summary', '', '查看错误'));
        record.errors = element('pre'); record.errorDetails.append(record.errors);
        host.append(bar, tools, record.viewport, record.status, record.errorDetails);
        setTimeout(() => {
            if (!host.isConnected) return;
            records.add(record);
            if (record.preview || typeof IntersectionObserver === 'undefined') mount(record);
            else {
                record.loader = new IntersectionObserver(entries => {
                    if (entries[0].isIntersecting) { record.loader.disconnect(); mount(record); }
                }, { rootMargin: '800px' });
                record.loader.observe(host);
            }
        }, 0);
        return host;
    }
    function messageElement(message, chat, type, continuous) {
        const found = sourceOf(message);
        if (!found) return null;
        const record = { message, chat, type, chatId: chat.id, messageId: message.id, source: found.source, revision: message.interactive?.revision, visible: true };
        const wrapper = element('div', `message-wrapper ${message.role === 'user' ? 'sent' : 'received'}`);
        wrapper.dataset.id = message.id;
        wrapper.dataset.ovoInteractiveKey = JSON.stringify([type, chat.id, message.id]);
        wrapper.dataset.ovoInteractiveSignature = hash(JSON.stringify([message.content, message.parts, message.interactive?.revision, message.interactive?.resources, message.interactive?.disabled, message.timestamp, message.quote, message.role, message.senderId, continuous, chat.avatar, chat.myAvatar, chat.avatarMode, chat.timestampStyle, chat.timestampFormat, chat.myName, chat.me, chat.members]));
        if (message.isContextDisabled) wrapper.classList.add('context-disabled');
        const row = element('div', 'message-bubble-row');
        const info = element('div', 'message-info');
        const sent = message.role === 'user';
        if (type === 'group' && !sent) wrapper.classList.add('group-message');
        const member = type === 'group' ? chat.members?.find(item => item.id === message.senderId) : null;
        const avatar = element('img', 'message-avatar');
        avatar.src = sent ? chat.myAvatar || chat.me?.avatar || '' : member?.avatar || chat.avatar || '';
        avatar.alt = sent ? '我' : member?.groupNickname || chat.remarkName || chat.realName || '角色';
        avatar.dataset.pokeTargetId = sent ? 'user_me' : message.senderId || chat.id;
        if (chat.avatarMode === 'hidden' || (chat.avatarMode === 'kkt' && sent)) avatar.classList.add('avatar-hidden');
        else if (continuous && (chat.avatarMode === 'merge' || chat.avatarMode === 'kkt')) avatar.classList.add('avatar-invisible');
        if (avatar.classList.contains('avatar-hidden')) wrapper.classList.add('no-avatar-layout');
        if (avatar.classList.contains('avatar-invisible')) wrapper.classList.add('avatar-invisible-layout');
        info.append(avatar);
        const content = element('div', type === 'group' && !sent ? 'group-msg-content' : 'ovo-interactive-content');
        if (member) content.append(element('div', 'group-nickname', member.groupNickname || member.realName || '成员'));
        const host = createHost(record);
        host.classList.add(sent ? 'sent' : 'received');
        if (message.quote) {
            const quote = element('div', 'ovo-interactive-quote', `回复：${message.quote.content || ''}`);
            content.append(quote);
        }
        content.append(host);
        if (type === 'private' && !sent && chat.history?.[0]?.id === message.id && chat.alternateGreetings?.length > 1) {
            const controls = element('div', 'ovo-interactive-tools');
            const changeGreeting = async step => {
                const previous = JSON.parse(JSON.stringify(message));
                const previousIndex = chat.currentGreetingIndex || 0;
                chat.currentGreetingIndex = (previousIndex + step + chat.alternateGreetings.length) % chat.alternateGreetings.length;
                const value = chat.alternateGreetings[chat.currentGreetingIndex];
                message.content = value; message.parts = [{ type: 'text', text: value }]; delete message.interactive;
                try {
                    apply(message, value);
                    if (await saveCharacter(chat.id) === false) throw new Error('开场白保存失败，请重试');
                } catch (error) {
                    for (const key of Object.keys(message)) delete message[key]; Object.assign(message, previous);
                    chat.currentGreetingIndex = previousIndex; throw error;
                }
                if (currentChatType === type && currentChatId === chat.id) renderMessages(false, true);
            };
            button(controls, '上一条开场白', () => changeGreeting(-1));
            button(controls, '下一条开场白', () => changeGreeting(1));
            content.append(controls);
        }
        const time = element('span', 'message-time', typeof formatTimestampByFormat === 'function' ? formatTimestampByFormat(message.timestamp, chat) : '');
        if ((chat.timestampStyle || 'bubble') === 'avatar') info.append(time); else if (chat.timestampStyle !== 'hidden') host.append(time);
        row.append(info, content); wrapper.append(row);
        return wrapper;
    }
    // Keep live iframes rooted in the document during ordinary full-list refreshes.
    function commit(container, fragment, loadMore) {
        const old = new Map(Array.from(container.children).filter(node => node.dataset.ovoInteractiveKey).map(node => [node.dataset.ovoInteractiveKey, node]));
        const desired = Array.from(fragment.childNodes).map(node => {
            const previous = old.get(node.dataset?.ovoInteractiveKey);
            if (previous && previous.dataset.ovoInteractiveSignature === node.dataset.ovoInteractiveSignature) {
                previous.classList.toggle('context-disabled', node.classList.contains('context-disabled'));
                return previous;
            }
            return node;
        });
        if (loadMore) { container.prepend(fragment); return; }
        const keep = new Set(desired);
        for (const node of Array.from(container.childNodes)) if (!keep.has(node)) node.remove();
        let cursor = container.firstChild;
        for (const node of desired) {
            if (node === cursor) cursor = cursor.nextSibling;
            else if (node.parentNode === container && container.moveBefore) container.moveBefore(node, cursor);
            else container.insertBefore(node, cursor);
        }
    }
    async function receive(event) {
        const data = event.data;
        if (!data || data.channel !== 'ovo-chat-html' || typeof data.token !== 'string') return;
        const record = frames.get(data.token);
        if (!record || record.closed || !record.host.isConnected || event.source !== record.frame?.contentWindow) return;
        if (!record.preview && !currentMessage(record)) return;
        const reply = (value, error) => record.frame?.contentWindow?.postMessage({ token: data.token, id: data.id, value, error }, '*');
        try {
            switch (data.action) {
                case 'height': {
                    if (!Number.isFinite(data.value) || data.value < 0) return;
                    const height = Math.max(100, Math.min(1600, Math.ceil(data.value)));
                    if (record.frame.style.height !== `${height}px`) record.frame.style.height = `${height}px`;
                    break;
                }
                case 'ready':
                    markBoot(record, false);
                    record.ready = true; clearTimeout(record.loadTimer);
                    if (!record.errors.textContent) record.status.textContent = '';
                    post(record, 'visibility', record.visible && !document.hidden); break;
                case 'error':
                    record.status.textContent = '页面遇到问题，可展开错误详情或编辑代码';
                    record.errorDetails.hidden = false;
                    record.errors.textContent = (record.errors.textContent + '\n' + String(data.value).slice(0, 2000)).slice(-10000).trim(); break;
                case 'save':
                case 'summary': {
                    const value = data.value;
                    if (data.action === 'save' && (!value || typeof value !== 'object' || Array.isArray(value))) throw new Error('保存内容需要是数据对象');
                    if (data.action === 'summary' && typeof value !== 'string') throw new Error('互动结果需要是文字');
                    if (JSON.stringify(value).length > (data.action === 'save' ? MAX_STATE : 1000)) throw new Error('保存内容过大，请减少数据');
                    record.writes = (record.writes || Promise.resolve()).catch(() => {}).then(async () => {
                        if (record.closed || (!record.preview && !currentMessage(record))) throw new Error('消息已修改或移除');
                        await updateOptions(record, data.action === 'save' ? { state: JSON.parse(JSON.stringify(value)) } : { summary: value });
                    });
                    await record.writes; reply(true); break;
                }
                case 'pickImage': {
                    if (record.fileInput) throw new Error('请先完成图片选择');
                    const input = record.fileInput = element('input'); input.type = 'file'; input.accept = 'image/*'; input.hidden = true;
                    const finish = value => { reply(value); input.remove(); record.fileInput = null; };
                    input.addEventListener('cancel', () => finish(null), { once: true });
                    input.addEventListener('change', async () => {
                        const file = input.files?.[0];
                        if (!file) return finish(null);
                        if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 700 * 1024) { reply(null, '请选择小于 700 KB 的 PNG、JPG、WebP 或 GIF 图片'); input.remove(); record.fileInput = null; return; }
                        const reader = new FileReader();
                        reader.onload = () => finish(reader.result);
                        reader.onerror = () => { reply(null, '图片读取失败'); input.remove(); record.fileInput = null; };
                        reader.readAsDataURL(file);
                    }, { once: true });
                    record.host.append(input); input.click(); break;
                }
                case 'download': {
                    if (typeof data.value?.text !== 'string' || data.value.text.length > MAX_STATE) throw new Error('导出内容超过 1 MB');
                    const filename = String(data.value.filename || '互动内容.txt').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 120);
                    const saved = await saveFile(new Blob([data.value.text], { type: 'text/plain;charset=utf-8' }), filename); reply(saved); break;
                }
                default: if (data.id) reply(null, '不支持的互动操作');
            }
        } catch (error) { reply(null, error.message || '互动操作失败'); }
    }
    function setupEditor(message) {
        closeEditor();
        let editorOpen = true;
        const textarea = document.getElementById('message-edit-textarea');
        const mode = document.getElementById('message-edit-html-mode');
        const hint = document.getElementById('message-edit-html-hint');
        if (!mode || !textarea) return;
        mode.value = sourceOf(message) ? 'html' : message.interactive?.mode === 'text' ? 'text' : 'auto';
        const draftKey = `ovo-html-draft:${currentChatType}:${currentChatId}:${message.id}`;
        const draftHint = document.getElementById('message-edit-draft-hint');
        const restore = document.getElementById('message-edit-restore-draft');
        let draft;
        try { draft = JSON.parse(sessionStorage.getItem(draftKey)); } catch (_) { /* Optional draft storage. */ }
        draftHint.hidden = !draft || draft.value === textarea.value;
        restore.onclick = () => {
            textarea.value = draft.value; mode.value = draft.mode || 'auto'; draftHint.hidden = true;
            for (const key of ['scripts', 'styles', 'connect']) document.getElementById(`message-edit-html-${key}`).value = draft.resources?.[key] || '';
            textarea.ovoImportedState = draft.state;
            refresh();
        };
        const resourceInputs = ['scripts', 'styles', 'connect'].map(key => {
            const input = document.getElementById(`message-edit-html-${key}`);
            input.value = (message.interactive?.resources?.[key] || []).join('\n'); return input;
        });
        textarea.ovoImportedState = undefined;
        const includeState = document.getElementById('message-edit-html-include-state'); includeState.checked = false;
        const example = document.getElementById('message-edit-html-example'); example.value = '';
        const importInput = document.getElementById('message-edit-html-import'); importInput.value = '';
        const exportButton = document.getElementById('message-edit-html-export');
        const refresh = (saveDraft = true) => {
            const found = mode.value === 'text' ? null : extract(textarea.value, mode.value === 'html');
            hint.textContent = found ? `将显示为互动消息：${titleOf(found.source)}` : '普通文字；完整网页、HTML 代码块或 <uwuxjc> 标记可自动识别';
            if (saveDraft) try {
                const resources = {};
                for (const key of ['scripts', 'styles', 'connect']) resources[key] = document.getElementById(`message-edit-html-${key}`).value;
                sessionStorage.setItem(draftKey, JSON.stringify({ value: textarea.value, mode: mode.value, resources, state: textarea.ovoImportedState }));
            } catch (_) { /* Editing still works when storage is full. */ }
        };
        const previewButton = document.getElementById('message-edit-html-preview');
        previewButton.onclick = () => {
            try {
                if (previewRecord) release(previewRecord);
                const found = extract(textarea.value, mode.value === 'html');
                if (!found || mode.value === 'text') throw new Error('请粘贴网页代码或选择“互动页面”');
                const draftMessage = { id: 'preview', content: textarea.value, parts: [{ type: 'html', text: textarea.value }], interactive: { enabled: true, state: JSON.parse(JSON.stringify(textarea.ovoImportedState ?? message.interactive?.state ?? {})), resources: editorResources() } };
                const container = document.getElementById('message-edit-html-preview-box'); container.replaceChildren();
                previewRecord = { preview: true, message: draftMessage, source: found.source, chat: chatFor(currentChatType, currentChatId), visible: true };
                container.append(createHost(previewRecord));
            } catch (error) { showToast(error.message); }
        };
        example.onchange = () => {
            const code = window.InteractiveMessageExamples?.[example.value];
            if (!code) return;
            textarea.value = code; textarea.ovoImportedState = {}; mode.value = 'html';
            resourceInputs.forEach(input => { input.value = ''; }); refresh();
        };
        importInput.onchange = async () => {
            const file = importInput.files?.[0];
            if (!file) return;
            try {
                if (file.size > 2 * 1024 * 1024) throw new Error('模板文件超过 2 MB');
                const text = await file.text();
                if (!editorOpen) return;
                if (/\.json$/i.test(file.name)) {
                    const data = template(JSON.parse(text));
                    textarea.value = data.source; textarea.ovoImportedState = data.state;
                    for (const key of ['scripts', 'styles', 'connect']) document.getElementById(`message-edit-html-${key}`).value = data.resources[key].join('\n');
                } else {
                    if (text.length > MAX_SOURCE) throw new Error('互动代码超过 512 KB');
                    textarea.value = text; textarea.ovoImportedState = {};
                    resourceInputs.forEach(input => { input.value = ''; });
                }
                mode.value = 'html'; refresh();
            } catch (error) { showToast(error.message); }
            importInput.value = '';
        };
        exportButton.onclick = async () => {
            try {
                const found = extract(textarea.value, mode.value === 'html');
                if (!found || mode.value === 'text') throw new Error('请先填入互动代码');
                const data = { format: 'ovo-html-template', source: textarea.value, resources: editorResources() };
                if (includeState.checked) data.state = textarea.ovoImportedState ?? message.interactive?.state ?? {};
                template(data);
                await saveFile(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }), '互动模板.ovo-html.json');
            } catch (error) { showToast(error.message); }
        };
        textarea.addEventListener('input', refresh); mode.addEventListener('change', refresh);
        resourceInputs.forEach(input => input.addEventListener('input', refresh));
        refresh(false);
        editorCleanup = () => { editorOpen = false; textarea.removeEventListener('input', refresh); mode.removeEventListener('change', refresh); resourceInputs.forEach(input => input.removeEventListener('input', refresh)); previewButton.onclick = null; restore.onclick = null; example.onchange = null; importInput.onchange = null; exportButton.onclick = null; textarea.ovoImportedState = undefined; };
    }
    function editorResources() {
        const result = {};
        for (const key of ['scripts', 'styles', 'connect']) result[key] = allowedOrigins(document.getElementById(`message-edit-html-${key}`)?.value);
        return result;
    }
    function closeEditor() {
        editorCleanup?.(); editorCleanup = null;
        if (previewRecord) release(previewRecord); previewRecord = null;
        document.getElementById('message-edit-html-preview-box')?.replaceChildren();
    }
    function clearDraft(messageId, type, chatId) {
        try { sessionStorage.removeItem(`ovo-html-draft:${type}:${chatId}:${messageId}`); } catch (_) { /* Optional storage. */ }
    }
    function promptGuide(group = false) {
        return `\n互动网页：仅在用户要求网页互动时使用 <uwuxjc${group ? ' char="{成员真名}"' : ''}>完整HTML或HTML片段</uwuxjc>，可含内嵌CSS和JS。保持手机宽度自适应，给按钮可见文字，避免固定大宽度。读取 ovo.state，await ovo.save({...}) 保存完整数据对象；await ovo.summarize('简短结果') 提供聊天参考。ovo.pickImage() 可选图，ovo.download('文字','文件名.txt') 可导出文字。通过 ovo.active 与 ovo:visibility 事件暂停后台计时动画；处理空状态、取消、保存失败。默认只使用原生代码和HTTPS图片，不依赖外部库、网络接口、localStorage或父页面；若需要外部资源，说明需要在此消息编辑窗口配置来源。不要把网页源码放进普通消息方括号，不要省略代码。`;
    }
    if (typeof window.addEventListener === 'function') {
        window.addEventListener('message', receive);
        document.addEventListener('visibilitychange', () => { for (const record of frames.values()) post(record, 'visibility', record.visible && !document.hidden); });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') for (const record of frames.values()) {
                record.expanded = false; record.host.classList.remove('ovo-interactive-expanded');
                record.host.querySelector('.ovo-interactive-toolbar button').textContent = '展开';
                document.body.classList.remove('ovo-interactive-open');
            }
        });
        new MutationObserver(() => {
            for (const record of records) if (!record.host.isConnected) release(record);
        }).observe(document.documentElement, { childList: true, subtree: true });
    }
    window.InteractiveMessages = { extract, sourceOf, readBlock, protectResponse, contextText, apply, buildDocument, messageElement, commit, setupEditor, editorResources, closeEditor, clearDraft, allowedOrigins, promptGuide, template };
})();
