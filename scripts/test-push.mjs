import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createECDH, randomBytes } from 'node:crypto';
import { createPushServer, JsonSubscriptionStore } from '../server/push/server.mjs';

const root = path.resolve(import.meta.dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ovo-push-test-'));
const filename = path.join(directory, 'subscriptions.json');
const clientToken = randomBytes(32).toString('hex');
const sendToken = randomBytes(32).toString('hex');
const ec = createECDH('prime256v1');
const publicKey = ec.generateKeys().toString('base64url');
const subscriptionData = { endpoint: 'https://fcm.googleapis.com/fcm/send/test-device', keys: { p256dh: publicKey, auth: randomBytes(16).toString('base64url') } };
const store = new JsonSubscriptionStore(filename);
const delivered = [];
let deliveryError;
const server = createPushServer({ clientToken, sendToken, publicKey, allowedOrigins: ['https://example.github.io'], store,
    sendNotification: async (subscription, payload) => {
        if (deliveryError) throw deliveryError;
        delivered.push({ subscription, payload: JSON.parse(payload) });
    }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
let subscription = null;
let subscriptionsCreated = 0;
let unsubscribed = 0;
let failEnrollment = false;
const pushManager = {
    getSubscription: async () => subscription,
    subscribe: async options => {
        assert.equal(options.userVisibleOnly, true);
        assert.deepEqual(Buffer.from(options.applicationServerKey), Buffer.from(publicKey, 'base64url'));
        subscriptionsCreated++;
        subscription = { options, toJSON: () => subscriptionData, unsubscribe: async () => { subscription = null; unsubscribed++; return true; } };
        return subscription;
    }
};
const context = vm.createContext({ window: { isSecureContext: true, PushManager: function () {}, Notification: {} },
    location: { protocol: 'https:' }, Notification: { permission: 'granted' },
    navigator: { serviceWorker: { ready: Promise.resolve({ pushManager }) } },
    URL, Uint8Array, AbortSignal, atob, setTimeout, clearTimeout,
    fetch: (address, options) => {
        if (failEnrollment && options.method === 'POST' && address.endsWith('/subscriptions')) return Promise.resolve(new Response('{}', { status: 503 }));
        return fetch(address, { ...options, headers: { ...options.headers, Origin: 'https://example.github.io' } });
    }
});
vm.runInContext(fs.readFileSync(path.join(root, 'js/core/push-notifications.js'), 'utf8'), context);
const push = context.window.OvoPush;
const values = { url, key: clientToken };
async function call(route, body, token = clientToken, origin = 'https://example.github.io') {
    const response = await fetch(url + route, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
}
try {
    assert.throws(() => push.config({ url: 'http://example.com', key: clientToken }), /HTTPS/);
    assert.throws(() => push.config({ url: 'https://example.com/?token=x', key: clientToken }), /查询参数/);
    assert.throws(() => push.config({ url, key: '' }), /Token/);
    context.location.protocol = 'file:';
    await assert.rejects(push.connect(values), /本地文件/);
    context.location.protocol = 'https:';
    context.Notification.permission = 'denied';
    await assert.rejects(push.connect(values), /允许通知/);
    context.Notification.permission = 'granted';
    await assert.rejects(push.connect({ url, key: 'invalid' }), /Token 无效/);
    assert.equal(subscriptionsCreated, 0);
    failEnrollment = true;
    await assert.rejects(push.connect(values), /503/);
    assert.equal(subscription, null, 'failed server enrollment rolls back new browser subscription');
    assert.equal(unsubscribed, 1);
    failEnrollment = false;
    const deviceId = await push.connect(values);
    assert.match(deviceId, /^[a-f0-9]{64}$/);
    assert.equal((await push.connect(values)), deviceId, 'reconnect updates the same endpoint');
    assert.equal(subscriptionsCreated, 2, 'reconnect reuses the existing browser subscription');
    assert.equal(store.entries().length, 1);
    assert.equal(new JsonSubscriptionStore(filename).entries().length, 1, 'subscription survives server restart');
    await push.test(values, deviceId);
    assert.equal(delivered.at(-1).payload.title, '服务器推送测试');
    assert.equal((await call('/send', { title: '通知', body: '内容' })).status, 401, 'browser token cannot send arbitrary notifications');
    assert.equal((await call('/subscriptions', { subscription: subscriptionData }, sendToken)).status, 401, 'sender secret cannot register devices');
    assert.equal((await call('/test', { deviceId }, clientToken, 'https://untrusted.example')).status, 403);
    assert.equal((await call('/subscriptions', { subscription: { ...subscriptionData, endpoint: 'https://127.0.0.1/private' } })).status, 400, 'arbitrary endpoints cannot become outbound request targets');
    assert.equal((await call('/subscriptions', { subscription: { ...subscriptionData, endpoint: 'https://fcm.googleapis.com.evil.example/send' } })).status, 400);
    assert.equal((await call('/send', { title: '通知', body: 'x'.repeat(501) }, sendToken)).status, 400);
    // No browser code or connection is needed when an external server task sends a notification.
    const result = await call('/send', { title: '关闭网页后的通知', body: '来自服务端任务' }, sendToken);
    assert.equal(result.status, 200);
    assert.equal(result.body.accepted, 1);
    assert.equal(delivered.at(-1).payload.title, '关闭网页后的通知');
    deliveryError = { statusCode: 503 };
    await assert.rejects(push.test(values, deviceId), /502/);
    assert.equal(store.entries().length, 1, 'temporary gateway failures retain the subscription');
    deliveryError = { statusCode: 410 };
    await assert.rejects(push.test(values, deviceId), /不存在/);
    assert.equal(store.entries().length, 0, 'expired push endpoints are removed');
    deliveryError = null;
    await push.connect(values);
    assert.match(await push.disconnect(values, deviceId), /已断开/);
    assert.equal(subscription, null);
    assert.equal(store.entries().length, 0);
    await assert.rejects(push.test(values, deviceId), /已失效/);
    console.log('Push tests passed: browser registration, real HTTP API, persistence, authentication, SSRF rejection, delivery errors and unsubscribe. Gateway delivery was simulated; a real device is required to confirm actual notification receipt.');
} finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
}
