// Isolated settings/reply harness: does not access the user's browser profile or data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const markup = ['basics', 'features', 'extensions', 'avatar-system', 'prompts-media-node'].map(name => read(`src/html/screens/chat-settings/${name}.html`)).join('');
const harness = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/css/base.css"><link rel="stylesheet" href="/css/layout.css"><link rel="stylesheet" href="/css/settings.css"><link rel="stylesheet" href="/css/chat.css">
<style>*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}#profile-messages{display:none}.phone-screen{flex-shrink:0}</style>
<div class="phone-screen">${read('src/html/screens/chat-core.html')}${markup}</div><div id="profile-messages"></div>
<script>
window.db={characters:[{id:'a',realName:'角色甲',remarkName:'旧备注',myName:'我的名字',myPersona:'用户设定',avatar:'',myAvatar:'',persona:'角色设定',history:[],worldBookIds:[],statusPanel:{},autoReply:{enabled:false},theme:'white_pink'}, {id:'b',realName:'角色乙',remarkName:'角色乙',myName:'乙的用户名字',persona:'',myPersona:'',history:[],worldBookIds:[],statusPanel:{},autoReply:{enabled:false}}],groups:[],worldBooks:[],myStickers:[],magicRoom:{},apiSettings:{},cotSettings:{presets:[]},myPersonaPresets:[],bubbleCssPresets:[],globalSettings:{}};
window.currentChatId='a';window.currentChatType='private';window.currentPage=1;window.saved=[];window.notices=[];window.failSave=false;
window.colorThemes={white_pink:{}};window.chatRoomTitle=document.getElementById('chat-room-title');
window.showToast=text=>notices.push(text);window.renderChatList=()=>{};window.renderContactList=()=>{};window.renderMessages=()=>{};
window.saveCharacter=async id=>{if(failSave)return false;saved.push(structuredClone(db.characters.find(c=>c.id===id)));return true};window.saveData=async()=>{saved.push(structuredClone(db.characters.find(c=>c.id===currentChatId)));return true};
window.BilingualContent={syncSettingsUi:()=>{}};window.renderSyncGroupList=()=>{};
window.updateBubbleCssPreview=()=>{};window.populateBubblePresetSelect=()=>{};window.populateBubbleThemeBindingsList=()=>{};window.populateMyPersonaSelect=()=>{};
window.collectBubbleThemeBindingsFromDOM=()=>[];
window.currentFolderId='all';window.pad=value=>String(value).padStart(2,'0');
</script><script src="/js/modules/poke.js"></script><script src="/js/modules/character-profile.js"></script><script src="/js/modules/chat_list.js"></script><script src="/js/contacts.js"></script><script src="/js/settings/chat-settings.js"></script>
<script>
document.querySelectorAll('.screen').forEach(screen=>screen.classList.remove('active'));
document.getElementById('chat-settings-screen').classList.add('active');
document.querySelectorAll('.settings-tab-item').forEach(tab=>tab.addEventListener('click',()=>{document.querySelectorAll('.settings-tab-item').forEach(t=>t.classList.toggle('active',t===tab));document.querySelectorAll('.settings-tab-content').forEach(p=>p.classList.toggle('active',p.id===tab.dataset.tab))}));
document.getElementById('setting-poke-enabled').addEventListener('change',event=>document.getElementById('setting-poke-options').style.display=event.target.checked?'block':'none');
document.getElementById('chat-settings-form').addEventListener('submit',event=>{event.preventDefault();window.lastSave=saveSettingsFromSidebar()});
window.loadTestCharacter=id=>{currentChatId=id;loadSettingsToSidebar()};
loadTestCharacter('a');window.ready=true;
</script></html>`;
const server = http.createServer((req, res) => {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(harness); return; }
    const target = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!target.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    try { res.setHeader('Content-Type', target.endsWith('.css') ? 'text/css' : 'application/javascript'); res.end(fs.readFileSync(target)); }
    catch (_) { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, ...(process.env.OVO_TEST_CHROMIUM ? { executablePath: process.env.OVO_TEST_CHROMIUM } : {}) });
try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => window.ready), true);
    const ids = ['setting-allow-character-remark-update', 'setting-allow-user-remark-update', 'setting-allow-character-poke-update', 'setting-allow-user-poke-update'];
    for (const id of ids) assert.equal(await page.locator('#' + id).isChecked(), false);
    await page.locator('#setting-user-remark').fill('手动给我的备注');
    const toggle = async id => {
        const control = page.locator('#' + id).locator('..');
        await control.scrollIntoViewIfNeeded();
        await control.click();
        assert.equal(await page.locator('#' + id).isChecked(), true);
    };
    await toggle(ids[0]);
    await toggle(ids[1]);
    await page.locator('[data-tab="setting-tab-func"]').click();
    await toggle('setting-poke-enabled');
    await toggle(ids[2]);
    await toggle(ids[3]);
    await page.evaluate(async () => { await saveSettingsFromSidebar(); });
    assert.equal(await page.evaluate(() => db.characters[0].userRemarkName), '手动给我的备注');
    assert.equal(await page.evaluate(() => db.characters[0].myName), '我的名字');
    assert.equal(await page.evaluate(() => saved.at(-1).allowUserPokeUpdate), true);
    await page.evaluate(() => loadTestCharacter('b'));
    for (const id of ids) assert.equal(await page.locator('#' + id).isChecked(), false, '角色乙默认关闭');
    assert.equal(await page.locator('#setting-user-remark').inputValue(), '');
    await page.evaluate(() => loadTestCharacter('a'));
    for (const id of ids) assert.equal(await page.locator('#' + id).isChecked(), true);

    await page.evaluate(async () => {
        const result = await CharacterProfile.consumeAiCommands('[PROFILE:characterRemark="新备注"]\n[PROFILE:userRemark="小月亮"]\n[PROFILE:characterPoke="的小猫耳朵"]\n[PROFILE:userPoke="的小脑袋"]', db.characters[0], 'private');
        result.messages.forEach(message => document.getElementById('profile-messages').append(CharacterProfile.renderMessage(message)));
    });
    assert.equal(await page.locator('#setting-user-remark').inputValue(), '小月亮');
    assert.equal(await page.locator('#setting-char-remark').inputValue(), '新备注');
    assert.equal(await page.locator('#setting-poke-char-suffix').inputValue(), '的小猫耳朵');
    assert.equal(await page.locator('#chat-room-title').textContent(), '新备注');
    assert.equal(await page.locator('#chat-list-container .item-name').first().textContent(), '新备注');
    assert.ok((await page.locator('#contacts-list').textContent()).includes('新备注'));
    assert.equal(await page.locator('#profile-messages .system-notification').count(), 4);
    assert.ok((await page.locator('#profile-messages').textContent()).includes('小月亮'));
    await page.locator('[data-tab="setting-tab-basic"]').click();
    await page.locator('#setting-user-remark').fill('我尚未保存的修改');
    await page.evaluate(async () => { await CharacterProfile.consumeAiCommands('[PROFILE:userRemark="另一个昵称"]', db.characters[0], 'private'); });
    assert.equal(await page.locator('#setting-user-remark').inputValue(), '我尚未保存的修改', '后台更新不覆盖用户正在输入的内容');
    await page.evaluate(() => loadTestCharacter('a'));
    await page.locator('#setting-user-remark').fill('');
    await page.evaluate(async () => { await saveSettingsFromSidebar(); });
    assert.equal(await page.evaluate(() => db.characters[0].userRemarkName), '');

    for (const width of [320, 390, 768]) {
        await page.setViewportSize({ width, height: 844 });
        assert.equal(Math.round(await page.locator('.phone-screen').evaluate(node => node.getBoundingClientRect().width)), width, '测试页面使用完整设备宽度');
        for (const night of [false, true]) {
            await page.evaluate(night => document.body.classList.toggle('night-mode-active', night), night);
            for (const [tab, rowIds] of [['setting-tab-basic', [ids[0], ids[1], 'setting-user-remark']], ['setting-tab-func', [ids[2], ids[3]]]]) {
                await page.locator(`[data-tab="${tab}"]`).click();
                for (const id of rowIds) {
                    const row = page.locator('#' + id).locator('xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," kkt-item ")][1]');
                    await row.scrollIntoViewIfNeeded();
                    const layout = await row.evaluate(row => {
                        const rect = row.getBoundingClientRect();
                        const control = row.querySelector('.kkt-item-control').getBoundingClientRect();
                        const label = row.querySelector('.kkt-item-label').getBoundingClientRect();
                        return { fits: rect.left >= 0 && rect.right <= innerWidth + 1, overlap: label.right > control.left + 1 };
                    });
                    assert.equal(layout.fits, true, `${id} at ${width}`);
                    assert.equal(layout.overlap, false, `${id} label overlaps control at ${width}`);
                }
            }
        }
    }
    const quotedRemark = 'x" onload="alert(1)';
    await page.evaluate(async remark => { await CharacterProfile.consumeAiCommands('[PROFILE:characterRemark=' + JSON.stringify(remark) + ']', db.characters[0], 'private'); }, quotedRemark);
    assert.equal(await page.locator('#chat-list-container .item-name').first().textContent(), quotedRemark);
    assert.equal(await page.locator('#chat-list-container .chat-avatar').first().getAttribute('alt'), quotedRemark);
    assert.equal(await page.locator('#chat-list-container .chat-avatar[onload], #contacts-list .profile-avatar[onload]').count(), 0, '备注中的引号只能作为文字');
    if (process.env.OVO_TEST_SCREENSHOT_DIR) {
        fs.mkdirSync(process.env.OVO_TEST_SCREENSHOT_DIR, { recursive: true });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => { db.characters[0].remarkName = '新备注'; loadTestCharacter('a'); });
        await page.locator('[data-tab="setting-tab-basic"]').click();
        await page.locator('#setting-user-remark').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(process.env.OVO_TEST_SCREENSHOT_DIR, 'character-profile-settings.png') });
        await page.locator('[data-tab="setting-tab-func"]').click();
        await page.locator('#setting-allow-character-poke-update').locator('..').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(process.env.OVO_TEST_SCREENSHOT_DIR, 'character-profile-poke.png') });
    }
    assert.deepEqual(errors, []);
    console.log('Character profile browser tests passed: real settings load/save, independent toggles, updates, manual edits, 320/390/768 layouts and night mode.');
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
