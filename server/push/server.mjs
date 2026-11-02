import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';

class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}

export class JsonSubscriptionStore {
    constructor(filename) {
        this.filename = path.resolve(filename);
        try { this.records = new Map(Object.entries(JSON.parse(fs.readFileSync(this.filename, 'utf8')))); }
        catch (error) { if (error.code !== 'ENOENT') throw error; this.records = new Map(); }
    }
    get(id) { return this.records.get(id); }
    entries() { return [...this.records.entries()]; }
    set(id, value) { const next = new Map(this.records); next.set(id, value); this.commit(next); }
    delete(id) { const next = new Map(this.records); next.delete(id); this.commit(next); }
    commit(next) {
        fs.mkdirSync(path.dirname(this.filename), { recursive: true });
        const temporary = this.filename + '.tmp';
        fs.writeFileSync(temporary, JSON.stringify(Object.fromEntries(next)), { mode: 0o600 });
        fs.renameSync(temporary, this.filename);
        this.records = next;
    }
}

function validSubscription(value) {
    if (!value || typeof value.endpoint !== 'string' || value.endpoint.length > 2048) throw new HttpError(400, '订阅格式无效');
    let endpoint;
    try { endpoint = new URL(value.endpoint); } catch (_) { throw new HttpError(400, '订阅地址无效'); }
    // Only known browser push gateways may be contacted; never send requests to arbitrary URLs.
    const domains = ['fcm.googleapis.com', 'push.services.mozilla.com', 'web.push.apple.com', 'notify.windows.com'];
    if (endpoint.protocol !== 'https:' || endpoint.port || endpoint.username || endpoint.password || endpoint.hash ||
        !domains.some(domain => endpoint.hostname === domain || endpoint.hostname.endsWith('.' + domain))) {
        throw new HttpError(400, '订阅地址必须属于支持的浏览器推送网关');
    }
    const { p256dh, auth } = value.keys || {};
    if (typeof p256dh !== 'string' || !/^[\w-]{87}=?$/.test(p256dh) || Buffer.from(p256dh, 'base64url')[0] !== 4 ||
        typeof auth !== 'string' || !/^[\w-]{22}(==)?$/.test(auth)) throw new HttpError(400, '订阅密钥无效');
    return { endpoint: endpoint.href, keys: { p256dh, auth } };
}

function authorized(req, token) {
    const actual = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from('Bearer ' + token);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readBody(req) {
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new HttpError(415, '需要 JSON 请求体');
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > 16384) throw new HttpError(413, '请求体过大');
        chunks.push(chunk);
    }
    let result;
    try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch (_) { throw new HttpError(400, 'JSON 格式无效'); }
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new HttpError(400, '请求体必须是对象');
    return result;
}

export function createPushServer({ clientToken, sendToken, publicKey, allowedOrigins, store, sendNotification }) {
    if (typeof clientToken !== 'string' || typeof sendToken !== 'string' || clientToken.length < 32 || sendToken.length < 32 || clientToken === sendToken) {
        throw new Error('请使用两个不同的、至少 32 字符的随机 Token');
    }
    if (!Array.isArray(allowedOrigins) || !allowedOrigins.length || allowedOrigins.some(origin => {
        try { const url = new URL(origin); return url.origin !== origin || !/^https?:$/.test(url.protocol); } catch (_) { return true; }
    })) throw new Error('ALLOWED_ORIGINS 必须是网站来源列表（协议和域名，不含页面路径）');

    async function deliver(id, payload) {
        const subscription = store.get(id);
        if (!subscription) return 'missing';
        try { await sendNotification(subscription, JSON.stringify(payload)); return 'accepted'; }
        catch (error) {
            if ([404, 410].includes(error.statusCode)) { store.delete(id); return 'expired'; }
            return 'failed';
        }
    }

    const server = http.createServer(async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Vary', 'Origin');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const reply = (status, value) => { res.writeHead(status); res.end(JSON.stringify(value)); };
        try {
            const origin = req.headers.origin;
            if (origin && !allowedOrigins.includes(origin)) throw new HttpError(403, '未允许的网站来源');
            if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
            if (req.method === 'OPTIONS') {
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
                res.writeHead(204); res.end(); return;
            }
            const route = new URL(req.url, 'http://localhost').pathname;
            if (!authorized(req, route === '/send' ? sendToken : clientToken)) throw new HttpError(401, 'Token 无效');
            if (route === '/vapid-public-key' && req.method === 'GET') return reply(200, { protocol: 'ovo-web-push-v1', publicKey });
            if (!['POST', 'DELETE'].includes(req.method)) throw new HttpError(404, '接口不存在');
            const body = await readBody(req);
            if (route === '/subscriptions' && req.method === 'POST') {
                const subscription = validSubscription(body.subscription);
                const id = createHash('sha256').update(subscription.endpoint).digest('hex');
                if (!store.get(id) && store.entries().length >= 100) throw new HttpError(409, '设备登记数量已达上限');
                store.set(id, subscription);
                return reply(200, { deviceId: id });
            }
            if (route === '/subscriptions' && req.method === 'DELETE') {
                if (typeof body.deviceId !== 'string' || !/^[a-f0-9]{64}$/.test(body.deviceId)) throw new HttpError(400, '设备 ID 无效');
                store.delete(body.deviceId);
                return reply(200, { removed: true });
            }
            if (route === '/test' && req.method === 'POST') {
                const result = await deliver(body.deviceId, { title: '服务器推送测试', body: '这条通知由 OVO 推送服务器发出，请以实际收到通知确认送达。' });
                if (result !== 'accepted') throw new HttpError(result === 'failed' ? 502 : 404, '设备已失效或推送发送失败');
                return reply(200, { accepted: true });
            }
            if (route === '/send' && req.method === 'POST') {
                if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 100 ||
                    typeof body.body !== 'string' || body.body.length > 500) throw new HttpError(400, '请提供通知标题（1–100 字符）和正文（最多 500 字符）');
                if (body.deviceId !== undefined && (typeof body.deviceId !== 'string' || !/^[a-f0-9]{64}$/.test(body.deviceId))) throw new HttpError(400, '设备 ID 无效');
                const ids = body.deviceId ? [body.deviceId] : store.entries().map(([id]) => id);
                if (!ids.length) throw new HttpError(404, '没有已登记的设备');
                const results = await Promise.all(ids.map(id => deliver(id, { title: body.title, body: body.body })));
                const counts = Object.fromEntries(['accepted', 'expired', 'failed', 'missing'].map(name => [name, results.filter(v => v === name).length]));
                return reply(counts.accepted ? 200 : (counts.failed ? 502 : 404), counts);
            }
            throw new HttpError(404, '接口不存在');
        } catch (error) {
            if (!res.headersSent) reply(error.status || 500, { error: error.status ? error.message : '服务内部错误' });
            else res.end();
        }
    });
    server.requestTimeout = 15000;
    server.headersTimeout = 10000;
    return server;
}
