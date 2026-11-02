// Isolated browser fixture: no user database, music account, or model API is accessed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(import.meta.dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const files = ['core', 'providers', 'library', 'player', 'ui'];
const wav = Buffer.alloc(44 + 8000 * 2 * 60);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
const harness = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="stylesheet" href="/css/base.css"><link rel="stylesheet" href="/css/layout.css"><link rel="stylesheet" href="/css/modules/music.css">
<style>body{margin:0}.phone-screen{height:100vh}.screen{min-height:0}#music-screen{animation:none}</style>
<div class="phone-screen">${read('src/html/screens/music.html')}</div>
<script>
window.db={characters:[{id:'c1',realName:'测试角色',persona:'温和的音乐爱好者',history:[]}],apiSettings:{url:'https://model.invalid',model:'test',key:'model-secret'},musicSecrets:{yaohu:'service-secret'}};
window.saved=[];window.notices=[];window.exports=[];window.aiRequests=[];window.assetMap=new Map();
window.saveGlobalSettings=async keys=>{saved.push(keys);return true};window.saveCharacter=async()=>true;window.showToast=v=>notices.push(v);window.customConfirm=async()=>true;
window.dexieDB={musicAssets:{get:async id=>assetMap.get(id),bulkPut:async a=>a.forEach(x=>assetMap.set(x.id,x)),delete:async id=>assetMap.delete(id)},globalSettings:{put:async()=>{}},transaction:async(...args)=>args.at(-1)()};
window.OvoFileDownload={save:async(blob,name)=>{exports.push({name,body:JSON.parse(await blob.text())});return true}};
window.getApiConfigForFeature=(feature,config,owner)=>{window.lastRole=owner.character.id;return config};window.isApiConfigReady=c=>!!c.model;window.getApiConfigHeaders=()=>({});window.getApiConfigEndpoint=()=>'';
window.fetchAiResponse=async(config,body,headers,endpoint,stream,options)=>{aiRequests.push(body);await new Promise(r=>setTimeout(r,40));return '这首歌让人很放松。'};
window.switchScreen=id=>{document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active',s.id===id));window.MusicApp?.onScreen(id)};
</script>${files.map(f=>`<script src="/js/modules/music/${f}.js"></script>`).join('')}
<script>(async()=>{await MusicApp.init();switchScreen('music-screen');window.ready=true})()</script></html>`;
const server = http.createServer((req, res) => {
    const name = decodeURIComponent(req.url.split('?')[0]);
    if (name === '/') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(harness); return; }
    if (name === '/tone.wav') { res.setHeader('Content-Type', 'audio/wav'); res.setHeader('Accept-Ranges', 'bytes'); res.setHeader('Access-Control-Allow-Origin', '*'); res.end(wav); return; }
    if (name === '/cover.svg') { res.setHeader('Content-Type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#345370"/><text x="30" y="160" fill="white" font-size="38">Music</text></svg>'); return; }
    const target = path.resolve(root, '.' + name); if (!target.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    try { res.setHeader('Content-Type', target.endsWith('.css') ? 'text/css' : 'application/javascript'); res.end(fs.readFileSync(target)); } catch (_) { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.OVO_TEST_CHROMIUM || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const routes = [];
    await page.route('https://**/*', async route => {
        const url = new URL(route.request().url()); routes.push(url.href);
        if (url.hostname === 'musicapi.qijieya.cn') { await route.fulfill({ status: 521, headers: { 'access-control-allow-origin': '*' }, body: '' }); return; }
        if (url.hostname === 'api.qijieya.cn') {
            const type = url.searchParams.get('type');
            if (type === 'url') { await route.fulfill({ status: 302, headers: { location: origin + '/tone.wav', 'access-control-allow-origin': '*' } }); return; }
            if (type === 'lrc') { await route.fulfill({ headers: { 'content-type': 'text/plain', 'access-control-allow-origin': '*' }, body: '[00:00.00]First line\n[00:03.00]Second line' }); return; }
            const body = [123, 124, 125].map((id, i) => ({ name: ['测试歌曲', 'Another Song', 'Third Song'][i], artist: '测试歌手', url: `https://api.qijieya.cn/meting/?type=url&id=${id}`, pic: origin + '/cover.svg' }));
            await route.fulfill({ headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify(body) }); return;
        }
        await route.abort();
    });
    await page.goto(origin); await page.waitForFunction(() => window.ready && !document.querySelector('#music-screen [role="status"].music-loading'));
    await page.locator('.sp-album').first().waitFor();
    assert.equal(await page.locator('#music-screen').getAttribute('data-theme'), 'light');
    assert.equal(await page.locator('#music-screen').evaluate(el => getComputedStyle(el).color), 'rgb(23, 23, 23)');
    await page.locator('[data-music-action="theme"]').click();
    await page.waitForFunction(() => db.musicSettings.theme === 'dark');
    assert.equal(await page.locator('#music-screen').evaluate(el => getComputedStyle(el).color), 'rgb(255, 255, 255)');
    await page.locator('[data-music-action="theme"]').click();
    await page.locator('[data-music-page="search"]').click();
    await page.locator('#music-query').fill('测试'); await page.locator('#music-search-form').press('Enter');
    await page.locator('#music-search-results .sp-track').first().waitFor();
    await page.locator('#music-search-results .sp-track-name').first().click();
    await page.waitForFunction(() => MusicPlayer.state.status === 'playing');
    assert.equal(await page.evaluate(() => MusicPlayer.state.route), 'qijie-old', 'failed audio origin falls back to another service');
    assert.ok(routes.some(u => u.includes('type=search')));
    await page.locator('#music-player [data-music-action="lyrics"]').click();
    await page.locator('#music-lyrics button').first().waitFor();
    await page.locator('#music-lyrics button').nth(1).click();
    assert.ok(await page.evaluate(() => MusicPlayer.audio.currentTime >= 2.9));
    await page.locator('#music-player [data-music-action="lyrics"]').click();
    await page.locator('#music-player [data-music-action="like-current"]').click();
    await page.waitForFunction(() => db.musicLibrary.liked.length === 1);
    await page.locator('#music-player [data-music-action="together"]').click();
    await page.locator('[data-invite="c1"]').click();
    await page.locator('#music-together-question').fill('你觉得这首歌怎么样？');
    await page.locator('#music-together-form').press('Enter');
    await page.waitForFunction(() => MusicApp.ui.together.messages.length === 2);
    assert.equal(await page.evaluate(() => lastRole), 'c1');
    assert.ok(!await page.evaluate(() => JSON.stringify(aiRequests).includes('model-secret')));
    await page.locator('[data-music-action="end-together"]').click();
    await page.locator('#music-player [data-music-action="close-player"]').click();
    await page.locator('[data-music-page="library"]').click();
    await page.locator('[data-music-action="create"]').click();
    await page.locator('#music-playlist-name').fill('学习歌单');
    await page.locator('#music-playlist-description').fill('自己的音乐');
    await page.locator('#music-playlist-form button[type="submit"]').click();
    await page.waitForFunction(() => db.musicLibrary.playlists.some(p => p.name === '学习歌单'));
    await page.evaluate(async () => { await MusicLibrary.add(db.musicLibrary.playlists[0].id, ['netease:123']); MusicApp.render(); });
    assert.equal(await page.locator('#music-list-tracks .sp-track').count(), 1);
    await page.locator('[data-music-action="export-list"]').click();
    await page.locator('[data-music-action="export-confirm"]').click();
    await page.waitForFunction(() => exports.length === 1);
    assert.equal(await page.evaluate(() => exports[0].body.library.tracks.length), 1);
    assert.ok(!await page.evaluate(() => JSON.stringify(exports).includes('service-secret')));
    await page.evaluate(() => { MusicPlayer.pause(); MusicApp.ui.player=false; MusicApp.render(); });
    await page.locator('[data-music-page="library"]').click();
    await page.locator('[data-music-list="local"]').first().click();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.locator('[data-music-action="local-import"]').first().click();
    const chooser = await chooserPromise;
    await chooser.setFiles([{ name: 'Singer - Local Song.wav', mimeType: 'audio/wav', buffer: wav }, { name: 'Singer - Local Song.lrc', mimeType: 'text/plain', buffer: Buffer.from('[00:00.00]Local lyrics\n[00:02.00]Next line') }]);
    await page.waitForFunction(() => db.musicLibrary.tracks.some(t=>t.platform==='local'));
    assert.equal(await page.evaluate(() => assetMap.size), 1);
    await page.locator('#music-list-tracks .sp-track-name').first().click();
    await page.waitForFunction(() => MusicPlayer.state.status === 'playing' && MusicPlayer.current().platform === 'local');
    await page.evaluate(() => { document.dispatchEvent(new CustomEvent('ttsStateChange',{detail:{isPlaying:true,isPaused:false}})); });
    assert.equal(await page.evaluate(() => MusicPlayer.state.status), 'paused');
    await page.evaluate(() => { MusicPlayer.pause(); document.dispatchEvent(new CustomEvent('ttsStateChange',{detail:{isPlaying:false}})); });
    assert.equal(await page.evaluate(() => MusicPlayer.state.status), 'paused');
    const packed = await page.evaluate(async () => MusicLibrary.exportData({audio:true}));
    assert.equal(packed.assets.length, 1); assert.ok(packed.assets[0].data.startsWith('data:audio/wav;'));
    const local = packed.library.tracks.find(t=>t.platform==='local'); assert.ok(local.lyric.includes('Local lyrics'));
    await page.evaluate(async p => { const plan=MusicLibrary.previewImport(p);await MusicLibrary.commitImport(plan); }, packed);
    assert.equal(await page.evaluate(() => db.musicLibrary.tracks.filter(t=>t.platform==='local').length), 1, 'reimport merges duplicate tracks');
    await page.locator('#music-player [data-music-action="close-player"]').click();
    await page.locator('[data-music-page="home"]').click();
    if (process.env.OVO_MUSIC_SCREENSHOTS) {
        fs.mkdirSync(path.join(root,'docs'),{recursive:true});
        await page.locator('#music-screen').screenshot({path:path.join(root,'docs/music-day-preview.png')});
        await page.locator('[data-music-action="theme"]').click();
        await page.locator('#music-screen').screenshot({path:path.join(root,'docs/music-night-preview.png')});
    }
    await page.setViewportSize({width:320,height:640});
    await page.locator('#music-mini [data-music-action="player"]').click();
    const playerBox=await page.locator('#music-player').boundingBox();
    assert.ok(playerBox.width<=320);
    assert.ok(await page.locator('#music-screen').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    assert.equal(await page.evaluate(()=>MusicPlayer.audio.paused),true,'restoring UI never auto-plays');
    assert.deepEqual(errors,[]);
    console.log('Music browser: light/dark, search, real audio + failover, lyrics, role chat, playlists, local audio, export/import, focus and 320px layout passed.');
} finally { await browser.close(); await new Promise(r=>server.close(r)); }
