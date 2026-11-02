# 自定义服务器推送

网页继续部署在 GitHub Pages 等静态托管上；`server/push/` 是需要单独运行的 Node.js 推送服务，不能由 GitHub Pages 执行。每个服务实例供一个用户的多个设备使用，最多登记 100 个设备；多人产品需要另加账号和设备隔离。

## 能做什么

- 在 HTTPS 网页中申请通知权限，连接推送服务，登记本机的 Web Push 订阅。
- 服务端任务调用 `/send` 后，浏览器推送网关可以在网页关闭后把通知交给设备；系统限制、浏览器被强制停止、网络和订阅过期等情况会影响实际送达。
- 测试按钮区分本机通知和服务器推送。HTTP 成功只表示推送网关受理，需要实际收到通知才能确认设备送达。

当前聊天、角色定时活动和 AI 生成仍在网页运行。这个服务只发送通知，不在网页关闭后生成角色回复，也不同步聊天记录。需要离线角色回复时，必须另外实现服务器上的定时任务、AI 请求、记录存储和重新打开后的同步；不能靠浏览器保活或推送开关完成。

## 部署推送服务

准备 Node.js 22 或更新版本，以及可以长期运行 Node 服务并保存持久数据的托管环境。以下命令在本机或服务器的 `server/push/` 目录运行：

```sh
npm ci
npm run setup -- https://你的用户名.github.io mailto:你的邮箱
npm start
```

`setup` 会生成 `.env`，包含 VAPID 公私钥、两个不同的随机 Token 和允许的网站来源。不会覆盖旧文件。把示例域名和邮箱换成真实值；来源只包含协议、域名及可选端口，不含 `/仓库名/`。多个来源用逗号分隔。默认监听 `127.0.0.1:8787`，通过 HTTPS 反向代理向外提供服务，例如 `https://push.example.com`。容器或托管平台需要外部监听时，将 `HOST` 设置为 `0.0.0.0`，并按平台要求设置 `PORT`。

- 网页中的客户端 Token 使用 `.env` 里的 `PUSH_CLIENT_TOKEN`。该 Token 可登记、测试和移除这个用户的设备。
- `PUSH_SEND_TOKEN` 只交给可信服务端任务，不填入网页，用于向已登记设备发送自定义通知。
- 保持 VAPID 私钥稳定，重部署时保留 `.env` 和 `PUSH_DATA_FILE` 指向的数据文件；密钥更换后需让设备取消旧订阅并重新连接。
- 单实例运行，数据保存在 JSON 文件中；不要让多个进程共用同一文件。没有持久磁盘时需要改接数据库。
- 不要将 `.env`、订阅数据、Token 或私钥上传到 GitHub Pages。`.gitignore` 已排除本地配置和数据；只把网页静态文件发布到 Pages。

支持 Docker，构建上下文使用 `server/push/`：

```sh
docker build -t ovo-push .
docker run --env-file .env -e HOST=0.0.0.0 -e PUSH_DATA_FILE=/data/subscriptions.json -p 127.0.0.1:8787:8787 -v ovo-push-data:/data ovo-push
```

Docker 命令将订阅文件固定放在 `/data/subscriptions.json`，使用持久数据卷。再用 HTTPS 反向代理暴露此端口。

## 网页连接步骤

1. 以 HTTPS 打开网页。iOS 用户从主屏幕安装的应用打开后操作。
2. 打开“系统通知”，申请并允许通知权限。
3. 打开“使用自定义推送服务器”，填写服务根地址，例如 `https://push.example.com`，不要加 `/send`。
4. 填入客户端 Token，点击“连接并保存推送设置”。这一步保存推送开关、地址和 Token，并将当前设备订阅交给服务器。
5. 点击“测试服务器推送”，确认设备实际出现“服务器推送测试”通知。
6. 使用下方的外部请求测试关闭网页后的通知。只有“测试本机通知”成功不算验证通过。

断开按钮会取消浏览器订阅，并尝试移除服务器登记。关闭任一通知开关后点击底部“保存设置”，也会取消已有的服务器订阅。修改服务地址或 Token 前可先断开旧连接，修改后需要重新连接；仅保存新地址不会登记新服务。取消授权、清理浏览器数据或订阅过期后也需重新连接。

原来的通用 webhook 地址不等于 Web Push 服务，旧版本填写的任意 `/send` 接口不自动兼容。本次去掉了把本机消息再次转发回服务器的逻辑，以免同一消息出现两次通知。

## 服务器发送通知

从可信服务端调用（Token 从环境变量读取）。省略 `deviceId` 时发送给本实例下所有已登记设备：

```js
const response = await fetch('https://push.example.com/send', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + process.env.PUSH_SEND_TOKEN,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ title: 'OVO', body: '来自服务端的提醒' })
});
if (!response.ok) throw new Error('推送发送失败：' + response.status);
console.log(await response.json());
```

`accepted` 为推送网关已受理的设备数，`expired` 为已失效且移除的数量，`failed` 为临时发送失败数，`missing` 为指定设备不存在的数量。这些均不是设备已读回执。已登记设备标识可从 `/subscriptions` 返回的 `deviceId` 获取。

接口采用 `ovo-web-push-v1` 协议：

| 接口 | 鉴权 | 用途 |
| --- | --- | --- |
| `GET /vapid-public-key` | 客户端 Token | 协议标识及 VAPID 公钥 |
| `POST /subscriptions` | 客户端 Token | 登记 `{ subscription }`，返回 `{ deviceId }` |
| `DELETE /subscriptions` | 客户端 Token | 移除 `{ deviceId }` |
| `POST /test` | 客户端 Token | 向 `{ deviceId }` 发送固定测试通知 |
| `POST /send` | 服务端 Token | 发送 `{ title, body, deviceId? }` |

## 验证

仓库根目录运行 `node scripts/test-push.mjs` 检查前端订阅和实际 HTTP 接口之间的登记、鉴权、持久化、失效清理和断开流程。在 `server/push/` 安装依赖后运行 `npm test`，另检查配置生成、不覆盖旧密钥、真实 VAPID/AES 加密和独立启动。测试模拟推送网关，不会向真实设备发送消息。正式验收还需部署 HTTPS 服务，连接真实手机，并在关闭网页后从外部任务发送通知。

实现依据：[浏览器订阅接口](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe)、[web-push 服务端库](https://github.com/web-push-libs/web-push)。
