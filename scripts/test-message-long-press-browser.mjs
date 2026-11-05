// Isolated messages/profile; synthetic event ordering plus real Chromium touch input.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const browsers = require('playwright');
const root = path.resolve(import.meta.dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const dialog = read('src/html/screens/chat-dialogs.html').split('<!-- Message Edit Modal -->')[1].split('<!-- Insert Message Modal -->')[0];
const fixture = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/css/chat.css"><link rel="stylesheet" href="/css/base.css">
<style>body{margin:0;font:16px sans-serif}#message-area{height:500px;overflow:auto;scroll-behavior:auto}.message-wrapper{padding:20px;background:#eee}.message-bubble{padding:12px}.modal-overlay{display:none}.modal-overlay.visible{display:flex}</style>
<div id="message-area"><div class="message-wrapper" data-id="m"><div class="message-bubble"><span id="text">偷笑什么：长按测试消息</span></div><input id="card-input" value="卡片输入"><div contenteditable="true" id="card-editor"><span>可编辑内容</span></div></div>
<div class="node-divider-wrapper" data-id="node">节点分隔线</div><div style="height:1200px">历史消息</div></div>${dialog}
<script>
window.db={characters:[{id:'c',realName:'角色',history:[{id:'m',role:'user',content:'[我的消息：偷笑什么]',timestamp:1000},{id:'node',isNodeBoundary:true,content:'节点',timestamp:2000}]}],groups:[{id:'g',me:{nickname:'我'},history:[{id:'m',role:'user',content:'[我的消息：群聊消息]',timestamp:1000}]}]};
window.currentChatId='c';window.currentChatType='private';window.isInMultiSelectMode=false;window.isDebugMode=false;window.editingMessageId=null;window.isRawEditMode=false;
window.triggerHapticFeedback=()=>{};window.recalculateChatStatus=()=>{};window.renderMessages=()=>{};window.renderChatList=()=>{};window.showToast=()=>{};
window.saved=0;window.saveCharacter=async()=>{saved++;return true};window.saveGroup=async()=>{saved++;return true};
</script><script src="/js/ui.js"></script><script src="/js/chat.js"></script><script src="/js/modules/chat_ops.js"></script>
<script>
window.exitMultiSelectMode=()=>{isInMultiSelectMode=false};
window.menuCount=0;const originalMenu=createContextMenu;createContextMenu=(...args)=>{menuCount++;originalMenu(...args)};
setupMessageLongPress(messageArea);
window.touch=(type,selector='#text',points=[[80,60]])=>{
 const target=document.querySelector(selector),touches=points.map(([clientX,clientY],identifier)=>({identifier,clientX,clientY,target}));
 const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'touches',{value:touches});target.dispatchEvent(e);return e.defaultPrevented;
};
window.context=(selector='#text',pointerType='touch',button=2)=>{const e=new PointerEvent('contextmenu',{bubbles:true,cancelable:true,pointerType,button,clientX:80,clientY:60});document.querySelector(selector).dispatchEvent(e);return e.defaultPrevented};
window.selectText=()=>{const range=document.createRange();range.selectNodeContents(document.querySelector('#text'));getSelection().removeAllRanges();getSelection().addRange(range)};
</script>`;
const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(req.url.split('?')[0]);
    if (pathname === '/') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(fixture); return; }
    const target = path.resolve(root, '.' + pathname);
    if (!target.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    try { res.setHeader('Content-Type', target.endsWith('.css') ? 'text/css' : 'application/javascript'); res.end(fs.readFileSync(target)); }
    catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const engine = process.env.OVO_TEST_BROWSER === 'webkit' ? 'webkit' : 'chromium';
let browser;
try {
    browser = await browsers[engine].launch({ headless: true, ...(engine === 'chromium' && process.env.OVO_TEST_CHROMIUM ? { executablePath: process.env.OVO_TEST_CHROMIUM } : {}) });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    const reset = async () => { await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForFunction(() => typeof touch === 'function'); };
    const count = () => page.evaluate(() => menuCount);
    await reset();
    assert.equal(await page.locator('#text').evaluate(el => getComputedStyle(el).getPropertyValue('user-select') || getComputedStyle(el).getPropertyValue('-webkit-user-select')), 'none');
    for (const selector of ['#card-input', '#card-editor span', '#message-edit-textarea']) {
        assert.notEqual(await page.locator(selector).evaluate(el => getComputedStyle(el).getPropertyValue('user-select') || getComputedStyle(el).getPropertyValue('-webkit-user-select')), 'none', selector);
    }

    // Android contextmenu before our timer must open once, even after selection starts.
    await page.evaluate(() => { touch('touchstart'); selectText(); });
    assert.equal(await page.evaluate(() => context()), true);
    await page.waitForTimeout(450);
    assert.equal(await count(), 1);
    assert.equal(await page.evaluate(() => getSelection().isCollapsed), true);
    assert.equal(await page.evaluate(() => context()), true);
    assert.equal(await count(), 1, 'late native contextmenu must not duplicate the menu');
    assert.equal(await page.evaluate(() => touch('touchend', '#text', [])), true);
    await page.evaluate(() => document.querySelector('#text').click());
    assert.equal(await page.locator('.context-menu').count(), 1, 'release click must not dismiss the menu');
    assert.ok((await page.locator('.context-menu').innerText()).includes('编辑'));
    assert.ok((await page.locator('.context-menu').innerText()).includes('删除'));

    // Actual edit action and persistence for private chat and group chat.
    for (const type of ['private', 'group']) {
        if (type === 'group') {
            await page.evaluate(() => { currentChatType='group';currentChatId='g';touch('touchstart');context();touch('touchend','#text',[]); });
        }
        await page.locator('.context-menu-item').filter({ hasText: /^编辑$/ }).click();
        assert.equal(await page.locator('#message-edit-modal').evaluate(el => el.classList.contains('visible')), true);
        await page.locator('#message-edit-textarea').fill('长按后修改成功');
        await page.evaluate(() => saveMessageEdit());
        assert.ok(await page.evaluate(() => (currentChatType==='group'?db.groups[0]:db.characters[0]).history[0].content.includes('长按后修改成功')));
    }
    assert.equal(await page.evaluate(() => saved), 2);

    // Timer path, existing selection, small jitter, and legacy MouseEvent-shaped contextmenu.
    await reset();
    await page.evaluate(() => { selectText();touch('touchstart');touch('touchmove','#text',[[82,62]]); });
    await page.waitForTimeout(450);
    assert.equal(await count(), 1);
    assert.equal(await page.evaluate(() => context('#text', '', 0)), true);
    assert.equal(await count(), 1);

    for (const cancel of ['move', 'end', 'cancel', 'multitouch', 'scroll', 'removed']) {
        await reset();
        await page.evaluate(kind => {
            touch('touchstart');
            if(kind==='move')touch('touchmove','#text',[[80,90]]);
            if(kind==='end')touch('touchend','#text',[]);
            if(kind==='cancel')touch('touchcancel','#text',[]);
            if(kind==='multitouch')touch('touchstart','#text',[[80,60],[100,60]]);
            if(kind==='scroll')document.querySelector('#message-area').dispatchEvent(new Event('scroll'));
            if(kind==='removed')document.querySelector('.message-wrapper').remove();
            if(kind!=='removed')context();
        }, cancel);
        await page.waitForTimeout(450);
        assert.equal(await count(), 0, cancel + ' must not open a menu');
    }
    await reset();
    await page.evaluate(() => { isInMultiSelectMode=true;touch('touchstart');context(); });
    await page.waitForTimeout(450);
    assert.equal(await count(), 0);
    for (const selector of ['#card-input', '#card-editor span']) {
        await reset();
        await page.evaluate(selector => touch('touchstart',selector), selector);
        assert.equal(await page.evaluate(selector => context(selector), selector), false);
        await page.waitForTimeout(450);
        assert.equal(await count(), 0, selector + ' keeps native editing');
    }
    await reset();
    await page.evaluate(() => { touch('touchstart','.node-divider-wrapper');context('.node-divider-wrapper'); });
    assert.equal(await count(), 1, 'node actions work');

    // Real Chromium input also exercises browser-generated events and touch scrolling.
    if (engine === 'chromium') {
        await reset();
        const cdp = await context.newCDPSession(page);
        const box = await page.locator('#text').boundingBox();
        const point = { x: box.x + 20, y: box.y + 8 };
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
        await page.waitForTimeout(600);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await page.waitForTimeout(100);
        assert.equal(await count(), 1);
        assert.equal(await page.locator('.context-menu').count(), 1);
        await reset();
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:100}]});
        for (let y=90;y>=30;y-=10) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:120,y}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await page.waitForTimeout(450);
        assert.equal(await count(), 0);
        assert.ok(await page.locator('#message-area').evaluate(el => el.scrollTop > 0), 'touch scrolling still works');
    }
    const desktop = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    await desktop.goto(`http://127.0.0.1:${server.address().port}`);
    assert.notEqual(await desktop.locator('#text').evaluate(el => getComputedStyle(el).getPropertyValue('user-select') || getComputedStyle(el).getPropertyValue('-webkit-user-select')), 'none');
    await desktop.evaluate(() => selectText());
    assert.equal(await desktop.evaluate(() => context('#text','mouse')), false, 'desktop selected text keeps native menu');
    await desktop.evaluate(() => getSelection().removeAllRanges());
    assert.equal(await desktop.evaluate(() => context('#text','mouse')), true);
    assert.equal(await desktop.locator('.context-menu').count(), 1);
    assert.deepEqual(errors, []);
    console.log(`${engine}: long-press ordering, selection, jitter, cancellation, click suppression, editing, controls and desktop behavior passed.`);
} finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
}
