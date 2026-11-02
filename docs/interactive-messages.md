# HTML 互动消息

在聊天中编辑一条消息，把整段 HTML 代码粘进去，选择自动识别或互动页面，点击运行预览，再保存。私聊和群聊均可使用。无需把 HTML、CSS、JS 分开粘贴。

自动识别完整的 `<html>…</html>` 文档、整条消息中的 HTML 代码块，以及 `<uwuxjc>…</uwuxjc>` 标记。局部 HTML 可选择“互动页面”。讨论代码时选择“普通文字”，内容不会执行。旧的普通 HTML 片段仍由原有清理与渲染逻辑显示。

消息上方的展开按钮可以放大当前页面；操作菜单提供运行或重载、暂停、清空进度、编辑、复制源码和原有消息菜单。重载保留已保存的进度，清空进度会重置。Escape 可收起展开页面。

## 编辑与分享

编辑窗口内置滑动图集、翻牌、抽签、草稿表单、小测试和 Canvas 接星星示例。选择示例会替换当前代码框，点击预览可以试用；保存后才改变消息。

编辑草稿在当前浏览器标签页中保留，重新编辑时可以恢复。预览使用独立的状态副本，不会改变正式消息进度。编辑源码和预览错误均不会丢掉原始代码。

可以导入 HTML 文件或 `.ovo-html.json` 模板。导出模板默认只含源码与资源来源配置；勾选“包含互动进度”后才附带进度，以及进度中保存的图片。源码本来就写入的图片地址或内嵌图片仍属于源码，分享前需自行检查。转发消息创建独立实例，默认不带原来的互动进度。

完整应用备份沿用现有聊天记录格式，包含消息源码、资源配置和已保存进度。删除消息会一并删除存放在消息里的状态，运行时实例和令牌不会写入备份。

## 编写页面

页面运行于 `sandbox="allow-scripts"` 的独立 iframe 中，支持原生 HTML、CSS、JS、事件、触摸、Canvas 和音视频。页面无法直接访问父页面 DOM、其他聊天、主程序存储和 API 密钥。每条消息中的同名 ID、CSS 和 JS 变量互不干扰。

HTML 代码按正常文档顺序运行。完整网页保留自己的 head/body，局部代码由浏览器补齐外壳。桥接接口在用户脚本前安装，原始源码单独保存，不混入生成的桥接代码。

使用 `width:100%`、合理的 `max-width` 和响应式布局，避免固定大宽度。图片、内容及展开状态改变时会自动报告高度；显示高度限制在 100–1600 像素，较长内容可以在框内滚动或展开查看。横向图集建议设置 `touch-action:pan-y`，并处理 pointercancel，让纵向滚动交给聊天页面。

名字和头像占位符只在 DOM 文字及普通属性中替换，不替换 script/style 文本或事件代码。不要依赖 JS 字符串中的模板替换。

## 状态接口

`ovo.state` 是此消息已保存的状态对象。`await ovo.save({...})` 替换整个对象；保留其他字段时使用 `{...ovo.state, index: nextIndex}`。保存成功后 `ovo.state` 才更新；失败返回拒绝的 Promise，页面应保留旧显示并提供重试提示。

同一时段的连续保存会短暂合并，并按顺序落盘。状态按私聊或群聊、聊天 ID、消息 ID 隔离。源码编辑后旧实例的迟到请求失效。第三方代码只存在内存变量里的状态无法自动恢复，必须接入保存接口。

```html
<uwuxjc>
<button id="next">下一张</button>
<output id="page"></output>
<script>
let index = Number(ovo.state.index) || 0;
const output = document.getElementById('page');
output.textContent = index + 1;
document.getElementById('next').onclick = async () => {
    const next = (index + 1) % 5;
    try {
        await ovo.save({ index: next });
        index = next;
        output.textContent = index + 1;
    } catch (error) {
        output.textContent = '保存失败，请重试';
    }
};
</script>
</uwuxjc>
```

`await ovo.summarize('简短的互动结果')` 提供最多 1000 字符的文字供聊天参考。给 AI 的历史上下文只包含页面标题和主动上报的结果，不反复发送整段源码。页面内的聊天指令示例也不会作为主程序的转账、通话、头像或掌控指令执行。

## 图片与文件

`await ovo.pickImage()` 返回用户选取图片的 data URL，取消返回 null。支持小于 700 KB 的 PNG、JPEG、WebP、GIF；如需保存，可把结果写入状态对象，但整个状态仍受 1 MB 限制。

`await ovo.download('要导出的文字', '文件名.txt')` 导出最多 1 MB 的文字，使用应用已有的文件保存流程。支持文字和 JSON 内容，不提供任意主程序文件读取。

## 外部资源

HTTPS 图片及音视频可以直接引用，媒体通常需要用户点击播放。外部脚本、样式、字体和数据请求按此消息编辑窗口中的来源列表加载，只接受 HTTPS 来源。来源配置保留来源地址，不保存 API 密钥。远端服务器仍须满足 CORS、资源有效性和自身的访问要求。

默认不允许外部脚本、网络接口、嵌套 iframe、表单提交、弹窗、父页面导航和动态 eval。需要 eval 或站点登录、同源 localStorage、服务器会话的第三方页面不能直接保证兼容。外部链接在消息内拦截，并提示在浏览器打开。

## 生命周期与恢复

页面通过 `ovo.active` 和 `ovo:visibility` 事件获知是否在可见区域及应用是否位于前台，配套动画示例会暂停和恢复；音视频在后台暂停。第三方计时器和动画需要主动响应该通知。

```js
window.addEventListener('ovo:visibility', event => {
    if (event.detail) resumeAnimation();
    else pauseAnimation();
});
```

接近可见区域的页面才加载，同时最多运行 6 个页面。达到上限时显示等待提示，暂停其他页面释放位置后继续加载。关闭预览、删除消息和离开聊天会清理对应 iframe、监听与观察器。普通消息列表刷新复用已有页面，避免收到新消息就重复初始化。

JS 错误、Promise 拒绝、资源加载失败和策略拦截会显示错误详情。iframe 不能保证中断阻塞浏览器主线程的无限循环；加载前会记录未完成标记。若页面在加载完成前卡死，刷新同一标签页后会暂停该消息的自动运行，可以编辑或手动重载。加载完成后才触发的阻塞仍需关闭或刷新页面，不能声称完全隔离性能问题。

源码上限 512 KB，消息状态上限 1 MB。超限时保留编辑内容并显示原因。

## 验证

`node scripts/test-interactive-messages.mjs` 验证消息识别、混合内容解析、旧卡片兼容、上下文摘要与 AI 指令隔离。

`node scripts/test-interactive-messages-browser.mjs` 使用 Playwright 在本地隔离聊天中验证附件图集的点击及触摸切换、手机宽度、独立实例、列表刷新保留页面、展开收起、保存与失败、编辑预览、普通文字和群聊隔离，以及六种示例和模板导入导出。Playwright 需在模块搜索路径中；可用 `OVO_TEST_CHROMIUM` 指定测试浏览器。
