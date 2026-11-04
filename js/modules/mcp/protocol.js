(function () {
    'use strict';

    const HANDSHAKE_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
    const TERMUX_PREFERRED_VERSION = '2025-06-18';
    const TERMUX_HANDSHAKE_VERSIONS = [
        TERMUX_PREFERRED_VERSION,
        ...HANDSHAKE_VERSIONS.filter(version => version !== TERMUX_PREFERRED_VERSION)
    ];
    const BLOCKED_HEADERS = new Set([
        'host', 'origin', 'cookie', 'content-length', 'accept', 'content-type',
        'authorization', 'mcp-session-id', 'mcp-protocol-version', 'last-event-id'
    ]);

    function uid(prefix) {
        const random = window.crypto && typeof window.crypto.randomUUID === 'function'
            ? window.crypto.randomUUID()
            : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
        return `${prefix}_${random}`;
    }

    function timeoutError(ms) {
        const error = new Error(`连接超时（${Math.round(ms / 1000)} 秒）`);
        error.name = 'McpTimeoutError';
        return error;
    }

    function normalizeHeaders(value) {
        if (!value) return {};
        const source = typeof value === 'string' ? JSON.parse(value) : value;
        if (!source || Array.isArray(source) || typeof source !== 'object') {
            throw new Error('附加 Headers 必须是 JSON 对象。');
        }
        const output = {};
        Object.entries(source).forEach(([name, headerValue]) => {
            const normalized = String(name).trim();
            if (!normalized || BLOCKED_HEADERS.has(normalized.toLowerCase())) {
                throw new Error(`不允许覆盖请求头 ${normalized || '(空名称)'}。`);
            }
            if (typeof headerValue !== 'string') throw new Error(`请求头 ${normalized} 的值必须是字符串。`);
            output[normalized] = headerValue;
        });
        return output;
    }

    function buildHeaders(connection, secret, initialized, options) {
        const headers = {
            Accept: 'application/json, text/event-stream',
            'Content-Type': 'application/json',
            ...normalizeHeaders(connection.customHeaders)
        };
        if (['bearer', 'oauth'].includes(connection.authType) && secret) headers.Authorization = `Bearer ${secret}`;
        if (['api_key', 'custom', 'header'].includes(connection.authType) && connection.headerName && secret) {
            headers[connection.headerName] = secret;
        }
        if (initialized && connection.protocolVersion) headers['MCP-Protocol-Version'] = connection.protocolVersion;
        if (initialized && connection.sessionId) headers['Mcp-Session-Id'] = connection.sessionId;
        if (connection.pairingCode) headers['X-MCP-Pairing-Code'] = connection.pairingCode;
        if (options && options.lastEventId) headers['Last-Event-ID'] = options.lastEventId;
        return headers;
    }

    function parseSseEvents(text) {
        const events = [];
        String(text || '').split(/\r?\n\r?\n/).forEach(block => {
            if (!block.trim()) return;
            let id = '';
            let event = 'message';
            const data = [];
            block.split(/\r?\n/).forEach(line => {
                if (line.startsWith('id:')) id = line.slice(3).trim();
                else if (line.startsWith('event:')) event = line.slice(6).trim();
                else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
            });
            if (!data.length) return;
            let payload = data.join('\n');
            try { payload = JSON.parse(payload); } catch (error) { /* Keep diagnostic text. */ }
            events.push({ id, event, data: payload });
        });
        return events;
    }

    function parseRpcPayload(text, contentType, requestId, onMessage) {
        if (!String(text || '').trim()) return null;
        if (String(contentType || '').includes('text/event-stream')) {
            const events = parseSseEvents(text);
            events.forEach(item => {
                if (item.data && typeof item.data === 'object' && item.data.id !== requestId && onMessage) onMessage(item.data, item);
            });
            return events.map(item => item.data).find(item => item && item.id === requestId)
                || events.map(item => item.data).find(item => item && (item.result !== undefined || item.error))
                || null;
        }
        try { return JSON.parse(text); }
        catch (error) { throw new Error('服务器返回了无法解析的 MCP 响应。'); }
    }

    function describeNetworkError(error) {
        if (/Failed to fetch|NetworkError|Load failed/i.test(error && error.message || '')) {
            return new Error('浏览器无法访问端点。请检查 HTTPS、CORS、局域网权限、服务地址和桥接器状态。');
        }
        return error;
    }

    function createClient(options) {
        const connection = options.connection;
        const getSecret = options.getSecret || (() => '');
        const timeoutMs = () => Math.max(1000, Number(options.getTimeout && options.getTimeout()) || 20000);
        const onMessage = options.onMessage || (() => {});
        let reconnectPromise = null;
        let streamController = null;
        let lastEventId = '';

        async function sendResponse(id, result, rpcError) {
            if (id === undefined || id === null) return;
            const response = await fetch(connection.endpoint, {
                method: 'POST',
                headers: buildHeaders(connection, await getSecret(connection.id), true),
                body: JSON.stringify({ jsonrpc: '2.0', id, ...(rpcError ? { error: rpcError } : { result }) }),
                cache: 'no-store'
            });
            if (!response.ok && response.status !== 202) throw new Error(`MCP 响应回传失败：${response.status}`);
        }

        async function rawRequest(method, params, requestOptions) {
            const opts = requestOptions || {};
            const requestId = opts.notification ? undefined : uid('rpc');
            const controller = new AbortController();
            const abortExternal = () => controller.abort();
            if (opts.signal) {
                if (opts.signal.aborted) controller.abort();
                else opts.signal.addEventListener('abort', abortExternal, { once: true });
            }
            const timeout = setTimeout(() => controller.abort(), timeoutMs());
            let response;
            try {
                response = await fetch(connection.endpoint, {
                    method: 'POST',
                    headers: buildHeaders(connection, await getSecret(connection.id), method !== 'initialize', opts),
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        ...(requestId ? { id: requestId } : {}),
                        method,
                        ...(params !== undefined ? { params } : {})
                    }),
                    signal: controller.signal,
                    cache: 'no-store'
                });
            } catch (error) {
                if (error.name === 'AbortError' && opts.signal && opts.signal.aborted) throw error;
                if (error.name === 'AbortError') throw timeoutError(timeoutMs());
                throw describeNetworkError(error);
            } finally {
                clearTimeout(timeout);
                if (opts.signal) opts.signal.removeEventListener('abort', abortExternal);
            }
            if (method === 'initialize') connection.sessionId = response.headers.get('Mcp-Session-Id') || '';
            if (!response.ok) {
                const body = await response.text().catch(() => '');
                const error = new Error(`服务器返回 ${response.status}${body ? `：${body.slice(0, 300)}` : ''}`);
                error.status = response.status;
                error.wwwAuthenticate = response.headers.get('WWW-Authenticate') || '';
                error.retryAfter = response.headers.get('Retry-After') || '';
                throw error;
            }
            if (opts.notification || response.status === 202) return null;
            const payload = parseRpcPayload(await response.text(), response.headers.get('content-type'), requestId, onMessage);
            if (!payload) throw new Error('服务器没有返回对应的 MCP 响应。');
            if (payload.error) {
                const error = new Error(payload.error.message || `MCP 错误 ${payload.error.code || ''}`.trim());
                error.code = payload.error.code;
                error.data = payload.error.data;
                throw error;
            }
            return payload.result;
        }

        async function initialize(signal) {
            if (!connection.endpoint) throw new Error('请先填写 MCP 端点。');
            // Match the first handshake used by 330 for Termux bridges.
            const versions = connection.type === 'termux' ? TERMUX_HANDSHAKE_VERSIONS : HANDSHAKE_VERSIONS;
            let lastError;
            for (const protocolVersion of versions) {
                try {
                    const result = await rawRequest('initialize', {
                        protocolVersion,
                        capabilities: {
                            roots: { listChanged: true },
                            experimental: { ovoActivityCards: true }
                        },
                        clientInfo: { name: 'OVO MCP', version: '2.0.0' }
                    }, { signal });
                    if (!result || !result.protocolVersion) throw new Error('服务器没有返回有效初始化结果。');
                    connection.protocolVersion = result.protocolVersion;
                    connection.serverInfo = result.serverInfo || {};
                    connection.serverCapabilities = result.capabilities || {};
                    connection.instructions = result.instructions || '';
                    await rawRequest('notifications/initialized', undefined, { notification: true, signal });
                    return result;
                } catch (error) {
                    lastError = error;
                    connection.sessionId = '';
                    connection.protocolVersion = '';
                    if (![400, 404, 406].includes(error.status) && error.code !== -32602) break;
                }
            }
            throw lastError || new Error('MCP 初始化失败。');
        }

        async function request(method, params, requestOptions) {
            const opts = requestOptions || {};
            try {
                return await rawRequest(method, params, opts);
            } catch (error) {
                const expired = [400, 404, 410].includes(error.status) && connection.sessionId;
                if (!expired || opts.noReconnect || method === 'initialize') throw error;
                connection.sessionId = '';
                connection.protocolVersion = '';
                if (!reconnectPromise) reconnectPromise = initialize(opts.signal).finally(() => { reconnectPromise = null; });
                await reconnectPromise;
                return rawRequest(method, params, { ...opts, noReconnect: true });
            }
        }

        async function listPaged(method, key, signal, limit) {
            let cursor;
            const seen = new Set();
            const output = [];
            const max = Math.max(1, Number(limit) || 2000);
            do {
                const result = await request(method, cursor ? { cursor } : {}, { signal });
                output.push(...(result && Array.isArray(result[key]) ? result[key] : []));
                cursor = result && result.nextCursor;
                if (cursor && seen.has(cursor)) throw new Error(`${method} 返回了重复分页游标。`);
                if (cursor) seen.add(cursor);
            } while (cursor && output.length < max);
            return output.slice(0, max);
        }

        async function discover(signal) {
            const declared = connection.serverCapabilities || {};
            const specs = [
                ['tools', 'tools/list', 'tools'],
                ['resources', 'resources/list', 'resources'],
                ['resourceTemplates', 'resources/templates/list', 'resourceTemplates'],
                ['prompts', 'prompts/list', 'prompts']
            ];
            const capabilities = { tools: [], resources: [], resourceTemplates: [], prompts: [], errors: {} };
            await Promise.all(specs.map(async ([name, method, key]) => {
                const declaredKey = name === 'resourceTemplates' ? 'resources' : name;
                if (Object.keys(declared).length && !declared[declaredKey]) return;
                try { capabilities[name] = await listPaged(method, key, signal); }
                catch (error) { capabilities.errors[name] = error.message || String(error); }
            }));
            connection.capabilities = capabilities;
            return capabilities;
        }

        async function openServerStream(handler, signal) {
            if (streamController) streamController.abort();
            streamController = new AbortController();
            const externalAbort = () => streamController.abort();
            if (signal) signal.addEventListener('abort', externalAbort, { once: true });
            try {
                const response = await fetch(connection.endpoint, {
                    method: 'GET',
                    headers: buildHeaders(connection, await getSecret(connection.id), true, { lastEventId }),
                    signal: streamController.signal,
                    cache: 'no-store'
                });
                if (response.status === 405 || response.status === 404) return false;
                if (!response.ok) throw new Error(`服务器事件流返回 ${response.status}`);
                if (!response.body || !response.body.getReader) return false;
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                while (true) {
                    const chunk = await reader.read();
                    if (chunk.done) break;
                    buffer += decoder.decode(chunk.value, { stream: true });
                    const blocks = buffer.split(/\r?\n\r?\n/);
                    buffer = blocks.pop() || '';
                    parseSseEvents(blocks.join('\n\n')).forEach(event => {
                        if (event.id) lastEventId = event.id;
                        if (handler) handler(event.data, event);
                        onMessage(event.data, event);
                    });
                }
                return true;
            } finally {
                if (signal) signal.removeEventListener('abort', externalAbort);
            }
        }

        async function close() {
            if (streamController) streamController.abort();
            if (!connection.sessionId) return;
            try {
                await fetch(connection.endpoint, {
                    method: 'DELETE',
                    headers: buildHeaders(connection, await getSecret(connection.id), true),
                    cache: 'no-store'
                });
            } catch (error) { /* Best effort session cleanup. */ }
            connection.sessionId = '';
        }

        return { connection, initialize, discover, request, listPaged, openServerStream, sendResponse, close };
    }

    window.McpProtocol = {
        HANDSHAKE_VERSIONS,
        createClient,
        normalizeHeaders,
        parseSseEvents,
        buildHeaders
    };
})();
