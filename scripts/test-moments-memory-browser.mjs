// Runs against an isolated database; never opens or edits the user's saved chats.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const root=path.resolve(import.meta.dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const utils=read('js/core/ui-and-content-utils.js');
const confirmDialog=utils.slice(utils.indexOf('function showAppConfirmDialog('),utils.indexOf('// 系统级通知'));
const fixture={
    characters:[{id:'a',realName:'阿岚',history:[{id:'normal',role:'user',content:'普通聊天'}],momentsSettings:{interactEnabled:true}},{id:'b',realName:'小夏',history:[],momentsSettings:{interactEnabled:true}}],
    myPersonaPresets:[{id:'me',name:'我'}],activePersonaId:'me',
    moments:{posts:[{id:'live',authorId:'user',authorPersonaId:'me',kind:'post',text:'午后喝到一杯很好喝的咖啡',audienceIds:['user','char:a','char:b'],seenBy:{'char:a':1,'char:b':1},comments:[],likes:[],createdAt:Date.now()}],contacts:[],groups:[],notifications:[],activityEvents:[
        {id:'view',postId:'live',type:'view',actorId:'char:a',knownTo:['char:a','char:b'],text:'阿岚查看了动态「午后喝到一杯很好喝的咖啡」',createdAt:Date.now()},
        {id:'oldView',postId:'deleted',type:'view',actorId:'char:a',knownTo:['char:a'],text:'阿岚查看了动态「已经删除的小秘密」',createdAt:Date.now()},
        {id:'oldDelete',postId:'deleted',type:'delete',actorId:'user',knownTo:['char:a','char:b'],text:'我删除了动态「已经删除的小秘密」',createdAt:Date.now()}
    ]}
};
const harness=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/base.css"><link rel="stylesheet" href="/css/layout.css"><link rel="stylesheet" href="/css/modules/moments.css"><div class="phone-screen">${read('src/html/screens/moments.html')}</div><script>
window.db=${JSON.stringify(fixture)};window.saved=null;window.saveSucceeds=true;
window.saveCharacter=async id=>{if(!saveSucceeds)return false;window.saved=JSON.parse(JSON.stringify(db.characters.find(c=>c.id===id)));return true;};window.saveGlobalSettings=async()=>true;window.showToast=text=>{window.lastToast=text;};
window.switchScreen=id=>{document.querySelectorAll('.screen').forEach(el=>el.classList.toggle('active',el.id===id));};
document.addEventListener('click',e=>{const back=e.target.closest('.back-btn[data-target]');if(back)switchScreen(back.dataset.target);});
</script><script>${confirmDialog}</script><script>window.lastToast='';</script><script src="/js/modules/moments.js"></script><script>Moments.init();switchScreen('moments-screen');</script></html>`;
const server=http.createServer((req,res)=>{
    if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(harness);return;}
    const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    try{res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
    browser=await chromium.launch({headless:true,...(process.env.OVO_TEST_CHROMIUM?{executablePath:process.env.OVO_TEST_CHROMIUM}:{})});
    const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(e.stack));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('#moments-settings-btn').click();
    await page.getByRole('button',{name:'管理动态记忆',exact:true}).click();
    const screen=page.locator('#moments-memory-screen');
    assert.equal(await screen.isVisible(),true);
    assert.equal(await screen.locator('.moments-memory-card').count(),2);
    await page.locator('#moments-memory-search').fill('小秘密');
    assert.equal(await screen.locator('.moments-memory-card').count(),1);
    await page.getByRole('button',{name:'清除这条记忆',exact:true}).click();
    await page.locator('#app-confirm-dialog [data-action="cancel"]').click();
    assert.equal(await screen.locator('.moments-memory-card').count(),1);
    await page.evaluate(()=>saveSucceeds=false);
    await page.getByRole('button',{name:'清除这条记忆',exact:true}).click();
    await page.locator('#app-confirm-dialog [data-action="confirm"]').click();
    await page.waitForFunction(()=>lastToast==='保存失败，动态记忆未清除');
    assert.equal(await screen.locator('.moments-memory-card').count(),1);
    await page.evaluate(()=>saveSucceeds=true);
    await page.locator('#moments-memory-search').fill('');
    await screen.locator('details').last().locator('summary').click();
    for(const width of [320,390,768]){
        await page.setViewportSize({width,height:844});
        assert.equal(await screen.evaluate(el=>el.scrollWidth<=el.clientWidth),true,`no horizontal overflow at ${width}px`);
    }
    if(process.env.OVO_MOMENTS_SCREENSHOTS){
        fs.mkdirSync(process.env.OVO_MOMENTS_SCREENSHOTS,{recursive:true});
        await page.setViewportSize({width:390,height:844});
        await screen.screenshot({path:path.join(process.env.OVO_MOMENTS_SCREENSHOTS,'moments-memory-day.png'),animations:'disabled'});
        await page.evaluate(()=>document.body.classList.add('night-mode-active'));
        await screen.screenshot({path:path.join(process.env.OVO_MOMENTS_SCREENSHOTS,'moments-memory-night.png'),animations:'disabled'});
    }
    await page.locator('#moments-memory-select-all').click();
    assert.equal(await page.locator('#moments-memory-delete-selected').textContent(),'清除选中 (2)');
    await page.locator('#moments-memory-delete-selected').click();
    await page.locator('#app-confirm-dialog [data-action="confirm"]').click();
    await page.waitForFunction(()=>lastToast==='已清除 2 条动态记忆');
    assert.equal(await screen.locator('.moments-memory-card').count(),0);
    assert.equal(await page.evaluate(()=>Moments.promptForCharacter('a').includes('小秘密')),false);
    assert.equal(await page.evaluate(()=>db.moments.posts.length),1);
    await page.locator('#moments-memory-actor').selectOption('char:b');
    assert.equal(await screen.locator('.moments-memory-card').count(),2);
    await page.locator('#moments-memory-clear-all').click();
    await page.locator('#app-confirm-dialog [data-action="confirm"]').click();
    await page.waitForFunction(()=>db.characters[1].momentsSettings.forgottenPostIds?.length===2);
    assert.equal(await screen.locator('.moments-memory-card').count(),0);
    assert.deepEqual(errors,[]);
    console.log('Moments memory browser: settings entry, deleted-post search, confirmation, failed saves, multi-select, per-character clear-all, role isolation, 320/390/768px and dark mode passed.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
