// Isolated browser profile and fake messages; no access to the user's browser/database.
// Simulated visual viewport changes verify layout, not a physical phone keyboard.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let browsers;
try { browsers = require('playwright'); } catch { browsers = require('playwright-core'); }
const root = path.resolve(import.meta.dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const engine = process.env.OVO_TEST_BROWSER === 'webkit' ? 'webkit' : 'chromium';
const fixture = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="stylesheet" href="/css/base.css"><link rel="stylesheet" href="/css/layout.css"><link rel="stylesheet" href="/css/chat.css"><link rel="stylesheet" href="/css/settings.css">
<style id="user-beautification">.phone-screen {width:calc(100% - 8px);margin:0 4px;border:2px solid #9ab7c1}.message-input-area{background:#d8e9ed!important;border-radius:17px}.message-bubble{background:#edf5f7;color:#25444e}</style>
<style>*,*::before,*::after{animation:none!important;transition:none!important} .message-area{scroll-behavior:auto} #message-area{min-height:0}</style>
<div class="phone-screen" style="--user-kept: 12px;">${read('src/html/screens/chat-core.html')}
<div id="customize-screen" class="screen"><header class="app-header"><h1>主屏幕自定义</h1></header><main class="content"><form id="customize-form"></form></main></div></div>
<script src="/js/data/defaults-and-state.js"></script>
<script>
window.keyboardHeight=null;window.keyboardTop=0;window.keyboardScale=1;
window.fakeViewport=new EventTarget();
Object.defineProperties(fakeViewport,{height:{get:()=>keyboardHeight??innerHeight},offsetTop:{get:()=>keyboardTop},scale:{get:()=>keyboardScale}});
Object.defineProperty(window,'visualViewport',{configurable:true,value:new URLSearchParams(location.search).has('noViewport')?undefined:fakeViewport});
window.setKeyboard=(height,top=0,scale=1)=>{keyboardHeight=height;keyboardTop=top;keyboardScale=scale;fakeViewport.dispatchEvent(new Event('resize'));fakeViewport.dispatchEvent(new Event('scroll'));window.dispatchEvent(new Event('resize'))};
window.failSave=false;window.savedCount=0;window.notices=[];
if(localStorage.getItem('keyboard-config')) db.chatKeyboardSettings=JSON.parse(localStorage.getItem('keyboard-config'));
window.saveGlobalSettings=async keys=>{if(failSave)return false;if(keys.length!==1||keys[0]!=='chatKeyboardSettings')throw Error('Unexpected settings write');savedCount++;localStorage.setItem('keyboard-config',JSON.stringify(db.chatKeyboardSettings));return true};
window.showToast=text=>notices.push(text);
for(const name of ['populateGlobalCssPresetSelect','populateFontPresetSelect','populateSoundPresetSelect','populateWidgetPresetSelect','populateWidgetWallpaperPresetSelect','populateIconPresetSelect','populateNamePresetSelect','populateVoicePresetSelect'])window[name]=()=>{};
window.switchFixtureScreen=id=>{document.querySelectorAll('.screen').forEach(el=>el.classList.toggle('active',el.id===id));if(id==='customize-screen'){renderCustomizeForm();document.querySelector('[data-tab="system"]').click()}};
</script>
<script src="/js/modules/chat-keyboard-layout.js"></script><script src="/js/settings/customize-settings.js"></script><script src="/js/settings/appearance-status-settings.js"></script>
<script>
setupCustomizeApp();ChatKeyboardLayout.init();ChatKeyboardLayout.init();
document.querySelector('#chat-room-title').textContent='键盘避让测试';
document.querySelector('#message-area').innerHTML=Array.from({length:35},(_,i)=>'<div class="message-wrapper"><div class="message-bubble">测试消息 '+(i+1)+'：输入时仍能看清文字。</div></div>').join('');
switchFixtureScreen('chat-room-screen');window.ready=true;
</script></html>`;
const server = http.createServer((req, res) => {
    if (req.url.split('?')[0] === '/') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(fixture); return; }
    const target = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!target.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    try { res.setHeader('Content-Type', target.endsWith('.css') ? 'text/css' : 'application/javascript'); res.end(fs.readFileSync(target)); }
    catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await browsers[engine].launch({ headless: true,
    ...(engine === 'chromium' && process.env.OVO_TEST_CHROMIUM ? { executablePath: process.env.OVO_TEST_CHROMIUM } : {}) });
try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    const url = `http://127.0.0.1:${server.address().port}`;
    await page.goto(url);
    await page.waitForFunction(() => window.ready);
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const active = () => page.locator('.phone-screen').evaluate(el => el.classList.contains('chat-keyboard-adjusting'));
    const inputBox = () => page.locator('#message-input').boundingBox();
    const checkAbove = async (bottom, top = 0) => {
        const box = await inputBox();
        assert.ok(box.y >= top && box.y + box.height <= bottom + 1, `Input ${JSON.stringify(box)} must be in ${top}..${bottom}`);
    };
    const openSettings = async () => { await page.evaluate(() => {document.activeElement?.blur();setKeyboard(null);switchFixtureScreen('customize-screen')}); await settle(); };
    const chat = async () => { await page.evaluate(() => switchFixtureScreen('chat-room-screen')); await page.locator('#message-input').focus(); await settle(); };
    const toggle = async selector => page.locator('label').filter({has:page.locator(selector)}).click();
    const saveToggle = async (selector, checked) => { if (await page.locator(selector).isChecked() !== checked) await toggle(selector); await page.waitForFunction(() => document.querySelector('#chat-keyboard-save-status').textContent === '已保存'); await settle(); };
    const setRange = async (selector, value) => { await page.locator(selector).evaluate((el, v) => {el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}, String(value)); await settle(); };
    const initialStyle = await page.locator('.phone-screen').getAttribute('style');
    const originalCss = await page.locator('#user-beautification').textContent();
    const initialBox = await inputBox();
    assert.equal(await page.evaluate(() => globalSettingKeysForBackup.includes('chatKeyboardSettings')), true);

    // Disabled stays exactly as before, even when the keyboard is simulated.
    await page.locator('#message-input').fill('不应被改动的草稿');
    await page.evaluate(() => setKeyboard(500)); await settle();
    assert.equal(await active(), false);
    assert.deepEqual(await inputBox(), initialBox);
    assert.equal(await page.locator('.phone-screen').getAttribute('style'), initialStyle);
    assert.equal(await page.evaluate(() => savedCount), 0);
    await openSettings();
    assert.equal(await page.locator('#chat-keyboard-enabled').isChecked(), false);
    assert.equal(await page.locator('#chat-keyboard-options').isVisible(), false);
    await saveToggle('#chat-keyboard-enabled', true);
    assert.equal(await page.locator('#chat-keyboard-automatic').isChecked(), true);

    // Android/Chromium style: layout stays tall, only visible viewport shrinks.
    await chat();
    assert.equal(await active(), false, 'hardware keyboard / ordinary focus must not move the layout');
    await page.evaluate(() => {const area=document.querySelector('#message-area');area.scrollTop=area.scrollHeight;setKeyboard(500)}); await settle();
    assert.equal(await active(), true); await checkAbove(500);
    assert.equal(await page.locator('#message-input').inputValue(), '不应被改动的草稿');
    assert.equal(await page.locator('.phone-screen').evaluate(el => el.getBoundingClientRect().width), 382);
    assert.equal(await page.locator('.message-input-area').evaluate(el => getComputedStyle(el).borderRadius), '17px');
    assert.ok(await page.locator('#message-area').evaluate(el => el.scrollHeight-el.clientHeight-el.scrollTop < 2));
    const saves = await page.evaluate(() => savedCount);

    // iOS-style viewport pan, predictive bar height changes, zoom and close.
    await page.evaluate(() => setKeyboard(440, 70)); await settle(); await checkAbove(510, 70);
    await page.evaluate(() => setKeyboard(470, 40)); await settle(); await checkAbove(510, 40);
    await page.evaluate(() => document.querySelector('#message-area').scrollTop=90);
    await page.evaluate(() => setKeyboard(460, 40)); await settle();
    assert.equal(await page.locator('#message-area').evaluate(el => el.scrollTop), 90, 'reading history must not jump to bottom');
    await page.locator('#send-message-btn').focus(); await settle();
    assert.equal(await active(), true, 'send-button focus must not drop a still-open keyboard layout');
    await page.locator('#message-input').focus();
    await page.evaluate(() => setKeyboard(460,0,2)); await settle(); assert.equal(await active(), false);
    await page.evaluate(() => setKeyboard(null)); await settle(); assert.equal(await active(), false);
    assert.deepEqual(await inputBox(), initialBox);
    assert.equal(await page.evaluate(() => savedCount), saves, 'viewport events must never write settings');

    // Auto fine adjustment, persistence, manual mode, save failures and return to defaults.
    await openSettings(); await setRange('#chat-keyboard-extra', 32);
    await chat(); await page.evaluate(() => setKeyboard(500)); await settle(); await checkAbove(468);
    await page.reload(); await page.waitForFunction(() => window.ready);
    await openSettings();
    assert.equal(await page.locator('#chat-keyboard-enabled').isChecked(), true);
    assert.equal(await page.locator('#chat-keyboard-extra').inputValue(), '32');
    await saveToggle('#chat-keyboard-automatic', false);
    await setRange('#chat-keyboard-manual', 340);
    await chat(); await checkAbove(504);
    await page.evaluate(() => setKeyboard(500)); await settle();
    await openSettings(); await page.evaluate(() => {failSave=true});
    await toggle('#chat-keyboard-enabled'); await settle();
    assert.equal(await page.locator('#chat-keyboard-enabled').isChecked(), true);
    assert.match(await page.locator('#chat-keyboard-save-status').innerText(), /保存失败/);
    await page.evaluate(() => {failSave=false});
    await saveToggle('#chat-keyboard-automatic', true);

    // Both layout and visual viewport shrink (older Android / resizes-content).
    await chat(); await page.evaluate(() => setKeyboard(500));
    await page.setViewportSize({width:390,height:500}); await settle(); await checkAbove(468);
    await page.setViewportSize({width:390,height:844}); await page.evaluate(() => setKeyboard(null)); await settle();
    assert.equal(await active(), false);

    // Orientation change with keyboard open, then closing while focus remains.
    await page.setViewportSize({width:844,height:390}); await page.evaluate(() => setKeyboard(220)); await settle(); await checkAbove(188);
    await page.evaluate(() => setKeyboard(null)); await settle(); assert.equal(await active(), false);
    await page.setViewportSize({width:390,height:844}); await page.evaluate(() => setKeyboard(null)); await settle();
    await openSettings(); await saveToggle('#chat-keyboard-enabled', false);
    await chat(); await page.evaluate(() => setKeyboard(500)); await settle();
    assert.equal(await active(), false);
    assert.equal(await page.locator('#user-beautification').textContent(), originalCss);
    assert.equal(await page.locator('.phone-screen').getAttribute('style'), initialStyle);
    assert.deepEqual(await inputBox(), initialBox);

    // Settings card responsive layout, also in night mode.
    await openSettings(); await saveToggle('#chat-keyboard-enabled', true);
    for (const width of [320,390,768]) {
        await page.setViewportSize({width,height:844}); await settle();
        const card = await page.locator('#chat-keyboard-settings').boundingBox();
        assert.ok(card.x>=0 && card.x+card.width<=width, 'settings card fits viewport');
        assert.ok(await page.locator('#chat-keyboard-settings').evaluate(el => el.scrollWidth<=el.clientWidth+1), `settings text/controls must not overflow at ${width}: ${JSON.stringify(await page.locator('#chat-keyboard-settings').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,overflow:[...el.querySelectorAll('*')].filter(child=>child.getBoundingClientRect().right>el.getBoundingClientRect().right).map(child=>({tag:child.tagName,id:child.id,class:child.className,width:child.getBoundingClientRect().width}))})))}`);
    }
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(() => document.body.classList.add('night-mode-active'));
    if (process.env.OVO_KEYBOARD_SCREENSHOTS) {
        fs.mkdirSync(process.env.OVO_KEYBOARD_SCREENSHOTS,{recursive:true});
        await page.locator('#chat-keyboard-settings').screenshot({path:path.join(process.env.OVO_KEYBOARD_SCREENSHOTS,`keyboard-settings-${engine}.png`)});
    }
    await page.evaluate(() => document.body.classList.remove('night-mode-active'));
    await chat(); await page.evaluate(() => setKeyboard(500)); await settle(); await checkAbove(468);
    if (process.env.OVO_KEYBOARD_SCREENSHOTS) await page.screenshot({path:path.join(process.env.OVO_KEYBOARD_SCREENSHOTS,`keyboard-chat-${engine}.png`)});
    await page.evaluate(() => switchFixtureScreen('home-screen')); await settle(); assert.equal(await active(), false);

    // Manual fallback works even on browsers without VisualViewport.
    await page.goto(url+'/?noViewport=1'); await page.waitForFunction(() => window.ready);
    await openSettings(); await saveToggle('#chat-keyboard-automatic', false);
    await chat(); await checkAbove(504);
    await page.locator('#message-input').blur(); await settle(); assert.equal(await active(), false);
    assert.deepEqual(errors, []);
    console.log(`${engine}: keyboard layout checks passed (disabled CSS preservation, automatic/manual, pan, zoom, close, rotation, content resize, draft/history, persistence, save failure, no VisualViewport and responsive settings).`);
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
