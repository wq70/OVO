(function () {
    'use strict';

    function config(values) {
        let url;
        try { url = new URL(values.url); } catch (_) { throw new Error('请填写已部署的 OVO 推送服务地址'); }
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
            throw new Error('推送服务必须使用 HTTPS（本机调试除外）');
        }
        if (url.username || url.password || url.search || url.hash) throw new Error('服务地址不能包含账号、查询参数或锚点');
        if (!values.key?.trim()) throw new Error('请填写推送服务的客户端 Token');
        return { url: url.href.replace(/\/$/, ''), key: values.key.trim() };
    }

    async function request(values, route, method = 'GET', body) {
        const settings = config(values);
        let response;
        try {
            response = await fetch(settings.url + route, {
                method, credentials: 'omit', redirect: 'error', cache: 'no-store',
                headers: { Authorization: 'Bearer ' + settings.key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
                body: body ? JSON.stringify(body) : undefined,
                signal: AbortSignal.timeout(12000)
            });
        } catch (error) {
            throw new Error(error.name === 'TimeoutError' ? '推送服务器响应超时' : '无法连接推送服务器，请检查地址、网络及服务器允许的网站来源');
        }
        if (!response.ok) {
            const messages = { 401: '推送服务器 Token 无效', 403: '服务器未允许当前网站来源', 404: '推送接口或设备登记不存在，请检查服务地址或重新连接' };
            throw new Error(messages[response.status] || `推送服务器请求失败（${response.status}）`);
        }
        let result;
        try { result = await response.json(); } catch (_) { throw new Error('服务器返回格式不正确，请使用配套的 OVO 推送服务'); }
        return result;
    }

    async function registration() {
        if (!window.isSecureContext || !/^https?:$/.test(location.protocol)) throw new Error('请通过 HTTPS 网站打开应用，本地文件不能订阅推送');
        if (!navigator.serviceWorker || !('PushManager' in window) || !('Notification' in window)) {
            throw new Error('当前环境不支持 Web Push；iOS 请添加到主屏幕后打开');
        }
        let timer;
        try {
            return await Promise.race([
                navigator.serviceWorker.ready,
                new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('通知服务尚未就绪，请刷新网页后重试')), 12000); })
            ]);
        } finally { clearTimeout(timer); }
    }

    function decodeKey(key) {
        if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{87}$/.test(key)) throw new Error('服务器 VAPID 公钥无效');
        const bytes = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='), c => c.charCodeAt(0));
        if (bytes.length !== 65 || bytes[0] !== 4) throw new Error('服务器 VAPID 公钥无效');
        return bytes;
    }

    async function connect(values) {
        config(values);
        const reg = await registration();
        if (Notification.permission !== 'granted') throw new Error('请先点击“申请系统通知权限”并允许通知');
        const info = await request(values, '/vapid-public-key');
        if (info.protocol !== 'ovo-web-push-v1') throw new Error('服务器不兼容，请部署配套的 OVO 推送服务');
        const key = decodeKey(info.publicKey);
        let subscription = await reg.pushManager.getSubscription();
        if (subscription) {
            const previous = subscription.options?.applicationServerKey;
            if (!previous || !key.every((v, i) => new Uint8Array(previous)[i] === v) || previous.byteLength !== key.byteLength) {
                throw new Error('当前设备已订阅其他推送服务，请先断开旧连接');
            }
        }
        const created = !subscription;
        if (created) subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        try {
            const result = await request(values, '/subscriptions', 'POST', { subscription: subscription.toJSON() });
            if (typeof result.deviceId !== 'string' || !/^[a-f0-9]{64}$/.test(result.deviceId)) throw new Error('服务器未返回有效的设备登记信息');
            return result.deviceId;
        } catch (error) {
            if (created) await subscription.unsubscribe().catch(() => {});
            throw error;
        }
    }

    async function disconnect(values, deviceId) {
        // Stop delivery on this browser even when the old server cannot be reached.
        const reg = await registration();
        const subscription = await reg.pushManager.getSubscription();
        if (subscription && !await subscription.unsubscribe()) throw new Error('设备订阅未能取消，请重试');
        if (deviceId) {
            try { await request(values, '/subscriptions', 'DELETE', { deviceId }); }
            catch (_) { return '本机已取消订阅，服务器登记清理失败；失效登记将在下次推送时清理'; }
        }
        return '已断开服务器推送';
    }

    async function test(values, deviceId) {
        if (!deviceId) throw new Error('请先连接并登记当前设备');
        const reg = await registration();
        if (!await reg.pushManager.getSubscription()) throw new Error('本机推送订阅已失效，请重新连接');
        const result = await request(values, '/test', 'POST', { deviceId });
        if (result.accepted !== true) throw new Error('推送服务未确认发送成功');
    }

    window.OvoPush = { connect, disconnect, test, config };
})();
