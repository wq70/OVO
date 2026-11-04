// Separate temporary browser profile and fake characters; never reads the user's database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const home = read('src/html/screens/forum-social.html');
const screens = read('src/html/screens/magic-storage-peek.html');
const settings = read('src/html/screens/video-call.html');
const scripts = ['setup-and-storage', 'history-and-memory', 'history-ui', 'social-apps', 'app-renderers', 'prompt-and-generation'];
const fixture = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/css/base.css"><link rel="stylesheet" href="/css/layout.css"><link rel="stylesheet" href="/css/chat.css"><link rel="stylesheet" href="/css/modules/peek.css">
<style>*,*::before,*::after{animation:none!important;transition:none!important} .phone-screen{flex-shrink:0}</style>
<div class="phone-screen">${home.slice(home.indexOf('<div id="peek-screen"'), home.indexOf('<div id="forum-screen"'))}${screens.slice(screens.indexOf('<div id="peek-messages-screen"'))}${settings.slice(settings.indexOf('<!-- New Peek Wallpaper Modal -->'))}</div>
<script>
window.peekScreenApps={messages:{name:'消息',url:''},album:{name:'相册',url:''},memos:{name:'备忘录',url:''},wallet:{name:'钱包',url:''}};
const makeCharacter=id=>({id,realName:'角色'+id,history:[],peekData:{messages:{conversations:[{partnerId:'contact-'+id,partnerName:'小雨 <好朋友>',partnerRelation:'朋友',history:[{sender:'char',content:'周末一起去看展吧'},{sender:'partner',content:'好呀，我来订票'}]},{partnerId:'secret-'+id,partnerName:'同事',history:[{sender:'partner',content:'不应同步的工作消息'}]}]}}});
window.db={worldBooks:[],characters:[makeCharacter('甲'),makeCharacter('乙')],apiSettings:{url:'https://fake.test',key:'fake',model:'fake'},wallpaper:''};window.currentChatId='甲';window.currentChatType='private';window.failSave=false;window.saved=[];window.notices=[];
window.saveCharacter=async id=>{if(failSave)return false;saved.push(structuredClone(db.characters.find(c=>c.id===id)));return true};window.saveData=async()=>saveCharacter(currentChatId);
window.showToast=text=>notices.push(text);window.showApiError=error=>notices.push(error.message);window.updateClock=()=>{};window.generatingPeekApps=new Set();window.filterHistoryForAI=(_,messages)=>messages;
window.switchScreen=id=>document.querySelectorAll('.screen').forEach(screen=>screen.classList.toggle('active',screen.id===id));
window.fetchAiResponse=async()=>JSON.stringify({conversations:[{partnerName:'小雨 <好朋友>',partnerRelation:'朋友',history:[{sender:'char',content:'看完展去吃晚饭'}]}]});window.parseFixture=()=>{};
</script>${scripts.map(name => `<script src="/js/modules/peek/${name}.js"></script>`).join('')}
<script>setupPeekFeature();renderPeekScreen();switchScreen('peek-screen');window.openFixtureContact=()=>{currentPeekConversation=db.characters.find(c=>c.id===currentChatId).peekData.messages.conversations[0];renderPeekConversation(currentPeekConversation);switchScreen('peek-conversation-screen')};window.ready=true;</script></html>`;
const server = http.createServer((req, res) => {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(fixture); return; }
    const target = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!target.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    try { res.setHeader('Content-Type', target.endsWith('.css') ? 'text/css' : 'application/javascript'); res.end(fs.readFileSync(target)); }
    catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, ...(process.env.OVO_TEST_CHROMIUM ? { executablePath: process.env.OVO_TEST_CHROMIUM } : {}) });
try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    assert.equal(await page.evaluate(() => window.ready), true);
    assert.deepEqual(errors, []);
    await page.locator('#peek-home-history').click();
    assert.match(await page.locator('.peek-memory-history-status').innerText(), /未开启保存/);
    await page.locator('#peek-history-settings').click();
    assert.equal(await page.locator('.peek-memory-app-settings input:checked').count(), 0);
    await page.getByLabel('保存消息历史').check();
    await page.locator('#peek-history-save').click();
    await page.waitForFunction(() => document.querySelector('.peek-memory-history-status')?.textContent.includes('1 份历史'));
    assert.equal(await page.evaluate(() => window.PeekMemory.prompt(db.characters[0])), '');
    await page.getByRole('button', {name:'关闭', exact:true}).click();
    await page.evaluate(() => { db.characters[0].peekScreenSettings = {responseFormat:'json'}; });
    await page.evaluate(() => generateAndRenderPeekContent('messages',{forceRefresh:true,background:true}));
    await page.locator('#peek-home-history').click();
    assert.match(await page.locator('.peek-memory-history-status').innerText(), /2 份历史/);
    await page.locator('[data-view="contacts"]').click();
    await page.locator('.peek-memory-record summary').first().click();
    assert.match(await page.locator('.peek-memory-thread').first().innerText(), /周末一起去看展吧/);
    assert.match(await page.locator('.peek-memory-thread').first().innerText(), /看完展去吃晚饭/);
    assert.equal(await page.locator('.peek-memory-thread script').count(), 0);
    await page.getByRole('button', {name:'关闭', exact:true}).click();
    await page.evaluate(() => openFixtureContact());
    await page.locator('#peek-contact-memory').click();
    assert.equal(await page.locator('[name="peek-contact-mode"]:checked').inputValue(), 'off');
    await page.locator('.peek-memory-modes label').filter({ has: page.locator('[value="manual"]') }).click();
    await page.locator('#peek-contact-sync').click();
    await page.waitForFunction(() => window.PeekMemory.prompt(db.characters[0]).includes('看完展去吃晚饭'));
    assert.doesNotMatch(await page.evaluate(() => window.PeekMemory.prompt(db.characters[0])), /不应同步|用户.*偷看/);
    assert.equal(await page.locator('#peek-contact-past').isChecked(), false);
    await page.getByRole('button', {name:'关闭', exact:true}).click();

    // Save failure keeps the dialog open and leaves the previous permission intact.
    await page.locator('#peek-contact-memory').click();
    await page.locator('.peek-memory-modes label').filter({ has: page.locator('[value="off"]') }).click();
    await page.evaluate(() => {failSave=true;});
    await page.locator('#peek-contact-save').click();
    await page.waitForFunction(() => document.querySelector('.peek-memory-feedback').textContent.includes('保存失败'));
    assert.match(await page.evaluate(() => window.PeekMemory.prompt(db.characters[0])), /看完展去吃晚饭/);
    await page.evaluate(() => {failSave=false;});
    await page.locator('#peek-contact-save').click();
    await page.waitForFunction(() => window.PeekMemory.prompt(db.characters[0]) === '');
    await page.getByRole('button', {name:'关闭', exact:true}).click();
    await page.evaluate(() => {currentChatId='乙';openFixtureContact();});
    await page.locator('#peek-contact-memory').click();
    assert.equal(await page.locator('[name="peek-contact-mode"]:checked').inputValue(), 'off');
    await page.locator('.peek-memory-modes label').filter({ has: page.locator('[value="auto"]') }).click();
    assert.equal(await page.locator('#peek-contact-past').isChecked(), false);
    await page.locator('#peek-contact-save').click();
    await page.waitForFunction(() => window.PeekMemory.prompt(db.characters[1]).includes('周末一起去看展吧'));
    await page.getByRole('button', {name:'关闭', exact:true}).click();
    await page.evaluate(() => {db.characters[1].peekScreenSettings={impersonateEnabled:true,responseFormat:'json'};openFixtureContact();});
    await page.locator('#peek-impersonate-input').fill('帮我留一张票');
    await page.locator('#peek-impersonate-send-btn').click();
    await page.waitForFunction(() => window.PeekMemory.prompt(db.characters[1]).includes('他人代发：帮我留一张票'));
    await page.evaluate(() => {failSave=true;});
    await page.locator('#peek-impersonate-input').fill('保存失败的代发');
    await page.locator('#peek-impersonate-send-btn').click();
    await page.waitForFunction(() => notices.some(text=>text.includes('保存失败')));
    assert.doesNotMatch(await page.evaluate(() => window.PeekMemory.prompt(db.characters[1])), /保存失败的代发/);
    await page.evaluate(async () => {
        failSave=false;
        let resolveReply;
        fetchAiResponse=()=>new Promise(resolve=>{resolveReply=resolve;});
        const task=requestPeekNPCReply();
        currentChatId='甲';openFixtureContact();
        resolveReply(JSON.stringify({replies:['晚回复也只属于原联系人'],newSuspicion:5}));
        await task;
    });
    assert.match(await page.evaluate(() => window.PeekMemory.prompt(db.characters[1])), /晚回复也只属于原联系人/);
    assert.equal(await page.evaluate(() => window.PeekMemory.prompt(db.characters[0])), '');
    await page.evaluate(() => {currentChatId='乙';openFixtureContact();});
    await page.locator('#peek-contact-memory').click();

    for (const width of [320, 390, 768]) {
        await page.setViewportSize({ width, height: 844 });
        for (const dark of [false, true]) {
            await page.evaluate(value => document.body.classList.toggle('night-mode-active', value), dark);
            const dimensions = await page.locator('.peek-memory-sheet').evaluate(node => ({ width:node.getBoundingClientRect().width, scroll:node.scrollWidth, client:node.clientWidth }));
            assert.ok(dimensions.width <= width && dimensions.scroll <= dimensions.client + 1, '联系人设置适配窄屏与夜间模式');
            const headerLayout = await page.locator('#peek-conversation-screen .app-header').evaluate(node => {
                const title=node.querySelector('.title-container').getBoundingClientRect();
                const actions=node.querySelector('.action-btn-group').getBoundingClientRect();
                return title.right <= actions.left;
            });
            assert.equal(headerLayout, true, '长联系人名称不遮挡知晓和刷新按钮');
        }
    }
    await page.setViewportSize({ width:390, height:844 });
    await page.evaluate(() => document.body.classList.remove('night-mode-active'));
    if (process.env.OVO_PEEK_SCREENSHOTS) {
        fs.mkdirSync(process.env.OVO_PEEK_SCREENSHOTS, {recursive:true});
        await page.screenshot({path:path.join(process.env.OVO_PEEK_SCREENSHOTS,'peek-contact.png')});
        await page.getByRole('button', {name:'关闭', exact:true}).click();
        await page.evaluate(() => { currentChatId='甲'; window.PeekHistoryUI.openHistory(); });
        await page.screenshot({path:path.join(process.env.OVO_PEEK_SCREENSHOTS,'peek-history.png')});
        await page.locator('#peek-history-settings').click();
        await page.screenshot({path:path.join(process.env.OVO_PEEK_SCREENSHOTS,'peek-history-settings.png')});
    }
    assert.deepEqual(errors, []);
    console.log('Peek browser passed: actual settings, refresh archive, contact sync, escaping, save failure, role isolation, 320/390/768 widths and dark mode.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
