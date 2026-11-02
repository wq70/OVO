import webpush from 'web-push';
import { createPushServer, JsonSubscriptionStore } from './server.mjs';

const required = ['VAPID_SUBJECT', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'PUSH_CLIENT_TOKEN', 'PUSH_SEND_TOKEN', 'ALLOWED_ORIGINS'];
for (const key of required) if (!process.env[key]) throw new Error(`缺少 ${key}，请先运行 npm run setup`);
webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
const server = createPushServer({
    clientToken: process.env.PUSH_CLIENT_TOKEN,
    sendToken: process.env.PUSH_SEND_TOKEN,
    publicKey: process.env.VAPID_PUBLIC_KEY,
    allowedOrigins: process.env.ALLOWED_ORIGINS.split(',').map(v => v.trim()),
    store: new JsonSubscriptionStore(process.env.PUSH_DATA_FILE || './data/subscriptions.json'),
    sendNotification: (subscription, payload) => webpush.sendNotification(subscription, payload, { TTL: 3600, timeout: 10000 })
});
server.listen(Number(process.env.PORT || 8787), process.env.HOST || '127.0.0.1', () => {
    console.log('OVO 推送服务已启动，请通过 HTTPS 反向代理访问。');
});
