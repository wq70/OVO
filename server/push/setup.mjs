import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import webpush from 'web-push';

const [origin, subject] = process.argv.slice(2);
if (!origin || !subject || new URL(origin).origin !== origin || !/^(mailto:|https:\/\/)[^\s]+$/.test(subject)) {
    throw new Error('用法：npm run setup -- https://你的用户名.github.io mailto:你的邮箱');
}
const keys = webpush.generateVAPIDKeys();
const env = [
    'PORT=8787', 'HOST=127.0.0.1', `ALLOWED_ORIGINS=${origin}`, `VAPID_SUBJECT=${subject}`,
    `VAPID_PUBLIC_KEY=${keys.publicKey}`, `VAPID_PRIVATE_KEY=${keys.privateKey}`,
    `PUSH_CLIENT_TOKEN=${randomBytes(32).toString('hex')}`, `PUSH_SEND_TOKEN=${randomBytes(32).toString('hex')}`,
    'PUSH_DATA_FILE=./data/subscriptions.json', ''
].join('\n');
fs.writeFileSync('.env', env, { flag: 'wx', mode: 0o600 });
console.log('已生成 .env（不会覆盖已有配置）。将其中 PUSH_CLIENT_TOKEN 填入网页；PUSH_SEND_TOKEN 仅供服务端任务使用。');
