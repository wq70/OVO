import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createECDH, randomBytes } from 'node:crypto';
import webpush from 'web-push';
import { createPushServer, JsonSubscriptionStore } from './server.mjs';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ovo-push-startup-'));
let child;
try {
    const setup = spawnSync(process.execPath, [path.join(import.meta.dirname, 'setup.mjs'), 'https://example.github.io', 'mailto:owner@example.com'], { cwd: directory, encoding: 'utf8' });
    assert.equal(setup.status, 0, 'setup generates a new configuration');
    const envPath = path.join(directory, '.env');
    const original = fs.readFileSync(envPath, 'utf8');
    const configuration = Object.fromEntries(original.trim().split('\n').map(line => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)]; }));
    assert.equal(configuration.PUSH_CLIENT_TOKEN.length, 64);
    assert.notEqual(configuration.PUSH_CLIENT_TOKEN, configuration.PUSH_SEND_TOKEN);
    const second = spawnSync(process.execPath, [path.join(import.meta.dirname, 'setup.mjs'), 'https://example.github.io', 'mailto:owner@example.com'], { cwd: directory, encoding: 'utf8' });
    assert.notEqual(second.status, 0, 'setup must refuse to replace existing VAPID keys');
    assert.equal(fs.readFileSync(envPath, 'utf8'), original);

    const ec = createECDH('prime256v1');
    const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/test-device', keys: { p256dh: ec.generateKeys().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
    const payload = JSON.stringify({ title: '测试', body: '真实加密请求' });
    const details = webpush.generateRequestDetails(subscription, payload, { TTL: 3600, vapidDetails: {
        subject: configuration.VAPID_SUBJECT, publicKey: configuration.VAPID_PUBLIC_KEY, privateKey: configuration.VAPID_PRIVATE_KEY
    } });
    assert.equal(details.headers['Content-Encoding'], 'aes128gcm');
    assert.ok(details.headers.Authorization.startsWith('vapid '));
    assert.ok(Buffer.isBuffer(details.body));
    assert.equal(details.body.includes(Buffer.from(payload)), false, 'notification content is encrypted');

    // Verify the actual library can create a delivery request through the API.
    const store = new JsonSubscriptionStore(path.join(directory, 'crypto-subscriptions.json'));
    const server = createPushServer({ clientToken: configuration.PUSH_CLIENT_TOKEN, sendToken: configuration.PUSH_SEND_TOKEN,
        publicKey: configuration.VAPID_PUBLIC_KEY, allowedOrigins: ['https://example.github.io'], store,
        sendNotification: async (target, content) => {
            const request = webpush.generateRequestDetails(target, content, { vapidDetails: {
                subject: configuration.VAPID_SUBJECT, publicKey: configuration.VAPID_PUBLIC_KEY, privateKey: configuration.VAPID_PRIVATE_KEY
            } });
            assert.ok(request.body.length > content.length);
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const base = `http://127.0.0.1:${server.address().port}`;
        const headers = { Authorization: 'Bearer ' + configuration.PUSH_CLIENT_TOKEN, 'Content-Type': 'application/json' };
        const registered = await fetch(base + '/subscriptions', { method: 'POST', headers, body: JSON.stringify({ subscription }) });
        assert.equal(registered.status, 200);
        const { deviceId } = await registered.json();
        const test = await fetch(base + '/test', { method: 'POST', headers, body: JSON.stringify({ deviceId }) });
        assert.equal(test.status, 200);
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

    child = spawn(process.execPath, ['--env-file=' + envPath, path.join(import.meta.dirname, 'start.mjs')], {
        cwd: directory, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
    });
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('服务启动超时')), 10000);
        child.stdout.on('data', () => { clearTimeout(timer); resolve(); });
        child.on('error', error => { clearTimeout(timer); reject(error); });
        child.on('exit', code => { clearTimeout(timer); reject(new Error('服务启动失败：' + code)); });
    });
    console.log('Push service setup, key preservation, real VAPID/AES encryption and standalone startup passed. No external push gateway was contacted.');
} finally {
    if (child && child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('exit', resolve)); }
    fs.rmSync(directory, { recursive: true, force: true });
}
