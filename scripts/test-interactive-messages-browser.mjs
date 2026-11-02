// Run with Playwright available in NODE_PATH. Uses an isolated, local test chat.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(import.meta.dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const dialog = read('src/html/screens/chat-dialogs.html').split('<!-- Message Edit Modal -->')[1].split('<!-- Insert Message Modal -->')[0];
const gallery = read('scripts/fixtures/interactive-gallery.html');
const harness = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/css/chat.css"><style>body{margin:0;font:14px sans-serif}.message-bubble-row{display:flex;gap:8px}.message-info{width:32px}.message-avatar{width:32px;height:32px}#message-area{width:100%;max-width:420px}.modal-overlay{display:none}.modal-overlay.visible{display:block}.modal-window{max-width:400px;margin:auto}textarea{width:90%}</style>
<div id="message-area"></div>${dialog}
<script>
window.db={characters:[{id:'c',realName:'角色',name:'角色',myName:'我',history:[]}],groups:[{id:'g',me:{nickname:'我'},members:[{id:'m',realName:'成员',groupNickname:'成员'}],history:[]}]};
window.currentChatId='c';window.currentChatType='private';window.editingMessageId=null;window.isRawEditMode=false;window.isDebugMode=false;window.currentPage=1;window.isInMultiSelectMode=false;
window.messageArea=document.getElementById('message-area');window.notices=[];window.showToast=v=>notices.push(v);window.exitMultiSelectMode=()=>{};window.recalculateChatStatus=()=>{};window.renderChatList=()=>{};window.pad=v=>String(v).padStart(2,'0');window.formatTimestampByFormat=()=> '12:00';
window.snapshots=[];window.failSave=false;window.saveCharacter=async id=>{if(failSave)return false;snapshots.push(structuredClone(db.characters.find(c=>c.id===id)));return true};window.saveGroup=async id=>{if(failSave)return false;snapshots.push(structuredClone(db.groups.find(c=>c.id===id)));return true};
</script>
<script src="/js/core/ui-and-content-utils.js"></script><script src="/js/modules/interactive-messages.js"></script><script src="/js/modules/interactive-message-examples.js"></script><script src="/js/modules/chat-render/message-bubble.js"></script><script src="/js/modules/chat_ops.js"></script>
<script>
window.exitMultiSelectMode=()=>{};
window.renderMessages=()=>{const chat=(currentChatType==='group'?db.groups:db.characters).find(c=>c.id===currentChatId);const f=document.createDocumentFragment();for(const message of chat.history){if(InteractiveMessages.sourceOf(message)){f.append(createMessageBubbleElement(message))}else{const d=document.createElement('div');d.textContent=message.content;f.append(d)}}InteractiveMessages.commit(messageArea,f,false)};
window.addPage=(source,id)=>{const chat=(currentChatType==='group'?db.groups:db.characters).find(c=>c.id===currentChatId);const m={id,role:'assistant',content:source,parts:[],timestamp:Date.now(),...(currentChatType==='group'?{senderId:'m'}:{})};InteractiveMessages.apply(m,source,'html');chat.history.push(m);renderMessages();return m.id};
</script>`;
const server = http.createServer((req, res) => {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(harness); return; }
    const pathname = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!pathname.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    try { res.setHeader('Content-Type', pathname.endsWith('.css') ? 'text/css' : 'application/javascript'); res.end(fs.readFileSync(pathname)); }
    catch (_) { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, ...(process.env.OVO_TEST_CHROMIUM ? { executablePath: process.env.OVO_TEST_CHROMIUM } : {}) });
try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(source => addPage(source, 'gallery'), gallery);
    const frame = page.frameLocator('[data-id="gallery"] iframe');
    await frame.locator('.c_v5b7.s_act').waitFor();
    assert.equal(await frame.locator('.c_v5b7').count(), 5);
    const nextCard = await frame.locator('.s_next').boundingBox();
    await frame.locator('.s_next').click({ position: { x: nextCard.width - 4, y: 20 } });
    assert.ok((await frame.locator('.s_act').innerText()).includes('第二张'));
    await frame.locator('#gl_01').evaluate(node => {
        const start = new Event('touchstart'); start.touches = [{ clientX: 200 }]; node.dispatchEvent(start);
        const end = new Event('touchend'); end.changedTouches = [{ clientX: 90 }]; node.dispatchEvent(end);
    });
    assert.ok((await frame.locator('.s_act').innerText()).includes('第三张'));
    if (process.env.OVO_TEST_SCREENSHOT) await page.screenshot({ path: process.env.OVO_TEST_SCREENSHOT });
    assert.equal(await frame.locator('body').evaluate(() => { try { return !!parent.db; } catch (_) { return false; } }), false);
    const beforeFrame = await page.locator('[data-id="gallery"] iframe').elementHandle();
    await page.evaluate(source => addPage(source, 'gallery2'), gallery);
    const afterFrame = await page.locator('[data-id="gallery"] iframe').elementHandle();
    assert.equal(await beforeFrame.evaluate((node, other) => node === other, afterFrame), true, 'refresh keeps live iframe');
    assert.ok((await frame.locator('.s_act').innerText()).includes('第三张'));
    assert.ok((await page.frameLocator('[data-id="gallery2"] iframe').locator('.s_act').innerText()).includes('第一张'));
    const width = await page.locator('[data-id="gallery"] .ovo-interactive').boundingBox();
    assert.ok(width.width <= 350, 'interactive page fits phone chat');
    await page.locator('[data-id="gallery"] .ovo-interactive-toolbar button').first().click();
    assert.equal(await page.locator('.ovo-interactive-expanded').count(), 1);
    assert.equal(await beforeFrame.evaluate(node => node.isConnected), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.ovo-interactive-expanded').count(), 0);

    const counter = `<html><head><title>计数</title></head><body><button id="inc">增加</button><output id="count"></output><script>let n=ovo.state.n||0;count.textContent=n;inc.onclick=async()=>{n++;await ovo.save({n});count.textContent=n;await ovo.summarize('次数'+n)};<\/script></body></html>`;
    await page.evaluate(source => addPage(source, 'counter'), counter);
    await page.locator('[data-id="counter"]').scrollIntoViewIfNeeded();
    const counterFrame = page.frameLocator('[data-id="counter"] iframe');
    await counterFrame.locator('#inc').click();
    await counterFrame.locator('#count').filter({ hasText: '1' }).waitFor();
    await page.waitForFunction(() => db.characters[0].history.find(m=>m.id==='counter').interactive.summary === '次数1');
    assert.equal(await page.evaluate(() => db.characters[0].history.find(m => m.id === 'counter').interactive.state.n), 1);
    await page.evaluate(() => { messageArea.replaceChildren(); renderMessages(); });
    await page.locator('[data-id="counter"]').scrollIntoViewIfNeeded();
    await page.frameLocator('[data-id="counter"] iframe').locator('#count').filter({ hasText: '1' }).waitFor();
    await page.evaluate(() => { failSave = true; });
    await page.frameLocator('[data-id="counter"] iframe').locator('#inc').click();
    await page.locator('[data-id="counter"] .ovo-interactive-errors').waitFor();
    assert.equal(await page.evaluate(() => db.characters[0].history.find(m => m.id === 'counter').interactive.state.n), 1);
    await page.evaluate(() => { failSave = false; startMessageEdit('counter'); });
    assert.ok((await page.locator('#message-edit-textarea').inputValue()).includes('<script>'));
    await page.locator('#message-edit-html-preview').click();
    const preview = page.frameLocator('#message-edit-html-preview-box iframe');
    await preview.locator('#inc').click();
    await preview.locator('#count').filter({ hasText: '2' }).waitFor();
    assert.equal(await page.evaluate(() => db.characters[0].history.find(m => m.id === 'counter').interactive.state.n), 1, 'preview does not write real progress');
    await page.evaluate(() => cancelMessageEdit());
    assert.equal(await page.locator('#message-edit-html-preview-box iframe').count(), 0);
    await page.evaluate(() => startMessageEdit('counter'));
    await page.locator('#message-edit-textarea').fill('<uwuxjc><button onclick="this.textContent=\'正常\'">点我</button></uwuxjc>');
    await page.evaluate(() => saveMessageEdit());
    await page.frameLocator('[data-id="counter"] iframe').getByRole('button', { name: '点我' }).click();
    await page.frameLocator('[data-id="counter"] iframe').getByRole('button', { name: '正常' }).waitFor();
    assert.equal(await page.evaluate(() => db.characters[0].history.find(m => m.id === 'counter').parts[0].type), 'html');
    await page.evaluate(() => startMessageEdit('counter'));
    await page.locator('#message-edit-html-mode').selectOption('text');
    await page.evaluate(() => saveMessageEdit());
    assert.equal(await page.locator('[data-id="counter"] iframe').count(), 0);
    assert.equal(await page.evaluate(() => InteractiveMessages.sourceOf(db.characters[0].history.find(m => m.id === 'counter'))), null);

    await page.evaluate(source => { currentChatType='group';currentChatId='g';addPage(source,'group-counter'); }, counter);
    await page.frameLocator('[data-id="group-counter"] iframe').locator('#inc').click();
    await page.frameLocator('[data-id="group-counter"] iframe').locator('#count').filter({ hasText: '1' }).waitFor();
    assert.equal(await page.evaluate(() => db.groups[0].history[0].interactive.state.n), 1);
    assert.equal(await page.evaluate(() => db.characters[0].history.find(m=>m.id==='counter').interactive?.state?.n), undefined);
    await page.evaluate(() => { db.groups[0].history=[];renderMessages(); });
    assert.equal(await page.locator('.ovo-interactive-frame').count(), 0);
    for (const name of ['gallery', 'flip', 'draw', 'form', 'quiz', 'canvas']) {
        await page.evaluate(name => { db.groups[0].history=[];addPage(InteractiveMessageExamples[name],'sample'); }, name);
        await page.locator('[data-id="sample"]').scrollIntoViewIfNeeded();
        await page.frameLocator('[data-id="sample"] iframe').locator('h2').waitFor();
        if (name === 'gallery') {
            await page.frameLocator('[data-id="sample"] iframe').locator('#next').click();
            await page.frameLocator('[data-id="sample"] iframe').locator('#position').filter({hasText:'2 / 3'}).waitFor();
        } else if (name === 'flip') {
            await page.frameLocator('[data-id="sample"] iframe').locator('#card').click();
            await page.frameLocator('[data-id="sample"] iframe').locator('#card').filter({hasText:'认真对待'}).waitFor();
        } else if (name === 'draw') {
            await page.frameLocator('[data-id="sample"] iframe').locator('#draw').click();
            await page.waitForFunction(()=>db.groups[0].history[0].interactive.state?.history?.length===1);
        } else if (name === 'form') {
            await page.frameLocator('[data-id="sample"] iframe').locator('#note').fill('草稿内容');
            await page.waitForFunction(()=>db.groups[0].history[0].interactive.state?.note==='草稿内容');
        } else if (name === 'quiz') {
            await page.frameLocator('[data-id="sample"] iframe').getByRole('button',{name:'看看远处'}).click();
            await page.frameLocator('[data-id="sample"] iframe').locator('#result').filter({hasText:'答对'}).waitFor();
        } else {
            await page.frameLocator('[data-id="sample"] iframe').locator('#game').waitFor();
            assert.equal(await page.frameLocator('[data-id="sample"] iframe').locator('#score').innerText(),'得分：0');
        }
    }
    await page.evaluate(()=>startMessageEdit('sample'));
    await page.locator('.ovo-html-template-tools summary').click();
    const noStateDownload = page.waitForEvent('download');
    await page.locator('#message-edit-html-export').click();
    const download = await noStateDownload;
    const exported = JSON.parse(fs.readFileSync(await download.path(),'utf8'));
    assert.equal(exported.state,undefined,'template sharing excludes progress by default');
    assert.equal(exported.format,'ovo-html-template');
    await page.locator('#message-edit-html-import').setInputFiles({name:'test.ovo-html.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'ovo-html-template',source:counter,state:{n:7}}))});
    await page.waitForFunction(()=>document.getElementById('message-edit-textarea').ovoImportedState?.n===7);
    await page.evaluate(()=>saveMessageEdit());
    await page.locator('[data-id="sample"]').scrollIntoViewIfNeeded();
    await page.frameLocator('[data-id="sample"] iframe').locator('#count').filter({hasText:'7'}).waitFor();
    await page.evaluate(()=>startMessageEdit('sample'));
    await page.locator('.ovo-html-template-tools summary').click();
    await page.locator('#message-edit-html-import').setInputFiles({name:'same.ovo-html.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'ovo-html-template',source:counter,state:{n:9}}))});
    await page.waitForFunction(()=>document.getElementById('message-edit-textarea').ovoImportedState?.n===9);
    await page.evaluate(()=>saveMessageEdit());
    await page.locator('[data-id="sample"]').scrollIntoViewIfNeeded();
    await page.frameLocator('[data-id="sample"] iframe').locator('#count').filter({hasText:'9'}).waitFor();
    assert.deepEqual(pageErrors.filter(message => message !== '保存失败，请重试'), []);
    console.log('Browser checks passed: supplied gallery click/touch, mobile layout, isolated instances, retained iframe, expanded view, persistence/failure, editor/preview, plain text/group isolation, six examples and template import/export.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
