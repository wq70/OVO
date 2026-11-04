// Isolated Edge profile and IndexedDB; never opens the user's application database.
// Requires playwright and dexie on NODE_PATH, like the other browser checks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(import.meta.dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const storage = read('js/data/indexed-db.js');
const saveCode = storage.slice(storage.indexOf('let saveDataPromise'), storage.indexOf('/**', storage.indexOf('const saveData =')));
const theaterHtml = read('src/html/screens/archive-theater.html');
const menus = theaterHtml.slice(theaterHtml.indexOf('<!-- 新建世界书菜单 -->'), theaterHtml.indexOf('<div id="theater-detail-screen"'));
const fixture = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/css/base.css"><link rel="stylesheet" href="/css/layout.css"><link rel="stylesheet" href="/css/modules/worldbook.css">
<style>.screen{animation:none}.modal-overlay:not(.visible){display:none}</style>
<div class="phone-screen">${read('src/html/screens/worldbook.html')}${menus}</div>
<script src="/dexie.js"></script><script>
var db={characters:[],groups:[],worldBooks:[],myStickers:[]}, globalSettingKeys=[];
var currentEditingWorldBookId=null,isWorldBookMultiSelectMode=false,selectedWorldBookIds=new Set(),longPressTimer;
window.notices=[];window.exports=[];window.failSave=false;
window.showToast=text=>notices.push(text);
window.switchScreen=id=>document.querySelectorAll('.screen').forEach(el=>el.classList.toggle('active',el.id===id));
document.addEventListener('click',event=>{const target=event.target.closest('[data-target]');if(target)switchScreen(target.dataset.target)});
window.OvoFileDownload={save:async(blob,name)=>{exports.push({name,data:JSON.parse(await blob.text())});return true}};
window.dexieDB=new Dexie('worldbook-regression');
var tables={};
for(const name of ['characters','groups','worldBooks','myStickers','naiVibeAssets','naiVibeEncodings','naiVibeGroups']){
 tables[name]='&id';tables['import'+name[0].toUpperCase()+name.slice(1)]='&id';
}
tables.globalSettings='key';tables.importGlobalSettings='key';dexieDB.version(1).stores(tables);
dexieDB.worldBooks.hook('updating',()=>{if(failSave)throw Error('fixture save failure')});
window.reloadFixture=async()=>{for(const key of ['characters','groups','worldBooks','myStickers'])db[key]=await dexieDB[key].toArray()};
${saveCode}
</script><script src="/js/modules/tutorial/backup-and-restore.js"></script>
${['import-export','setup','render'].map(name=>`<script src="/js/modules/worldbook/${name}.js"></script>`).join('')}
<script>window.ready=(async()=>{await dexieDB.open();await reloadFixture();setupWorldBookApp();renderWorldBookList();switchScreen('world-book-screen')})();</script></html>`;
const server = http.createServer((req,res)=>{
    const name = decodeURIComponent(req.url.split('?')[0]);
    if(name==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(fixture);return;}
    const target = name==='/dexie.js' ? require.resolve('dexie') : path.resolve(root,'.'+name);
    if(name!=='/dexie.js' && !target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    try{res.setHeader('Content-Type',target.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(target));}
    catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
    browser = await chromium.launch({headless:true,executablePath:process.env.OVO_TEST_CHROMIUM || (process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined)});
    const page = await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://**/*',route=>route.abort());
    const origin=`http://127.0.0.1:${server.address().port}`;
    await page.goto(origin);await page.evaluate(()=>ready);
    const books=[
        {id:'a',name:'正常条目',content:'原始正文\n第二行',legacyField:{keep:true}},
        {id:'b',name:'空分类',category:'',content:'空分类正文'},
        {id:'c',name:'空格分类',category:'  ',content:'空格正文'},
        {id:'d',name:'带空格未分类',category:' 未分类 ',content:'带空格正文'},
        {id:'e',name:'空路径分类',category:' / \\ / ',content:'空路径正文'},
        {id:'f',name:'缺失正文'},
        {id:'g',name:'对象正文',content:{text:'不能丢失',length:80}},
        {id:'h',name:'空值正文',category:null,content:null},
        {id:'i',name:'数字分类',category:123,content:'保留数字分类原值'},
        {id:'j',name:'嵌套条目',category:' / 设定 \\ 城市 / ',content:'城市正文'},
        {id:'k',name:'特殊分类',category:'__proto__',content:'特殊名称'},
        {id:'l',name:'<b>字面名称</b>',category:'设定/地区',content:'<img src=x onerror="window.injected=true">',tags:[123,'<标签>']}
    ];
    const backup={worldBooks:books,characters:[{id:'char',worldBookIds:books.map(b=>b.id),history:[]}],groups:[{id:'group',worldBookIds:['a','g'],history:[]}],myStickers:[]};
    await page.evaluate(async data=>{await stageBackupObject(data,false);await reloadFixture();renderWorldBookList()},backup);
    assert.deepEqual(await page.evaluate(()=>db.worldBooks),books,'backup import preserves the original records');
    await page.evaluate(async()=>{
        const blob=await createCompressedBackupBlob();
        const result=await importStreamBackupData(blob);
        if(!result.success)throw Error(result.error);
        await reloadFixture();renderWorldBookList();
    });
    assert.deepEqual(await page.evaluate(()=>db.worldBooks),books,'compressed backup round trip preserves malformed entries too');
    const openFolder=async name=>{
        await page.locator('#world-book-screen .world-book-folder-header').filter({hasText:name}).click();
        await page.locator('#world-book-detail-screen.active').waitFor();
    };
    await openFolder('未分类');
    assert.equal(await page.locator('#world-book-detail-list-container > li').count(),9);
    assert.equal(await page.locator('#world-book-detail-list-container [role=status]').count(),3);
    await page.locator('[data-id="g"] .item-name').click();
    assert.equal(await page.locator('#edit-world-book-screen.active').count(),0,'malformed content cannot be overwritten from the editor');
    assert.match(await page.evaluate(()=>notices.at(-1)),/原始数据已保留/);
    await page.locator('#detail-export-world-book-btn').click();
    await page.waitForFunction(()=>exports.length===1);
    assert.deepEqual(await page.evaluate(()=>exports[0].data.custom_entries),books.slice(0,9));
    await page.locator('[data-id="a"] .item-name').click();
    await page.locator('#edit-world-book-screen.active').waitFor();
    assert.equal(await page.locator('input[name=world-book-position]:checked').inputValue(),'before','legacy missing position is editable');
    await page.locator('#world-book-content').fill('修改后保留\n第二行');
    await page.locator('#edit-world-book-form button[type=submit]').click();
    await page.locator('#world-book-screen.active').waitFor();
    await page.reload();await page.evaluate(()=>ready);
    await openFolder('未分类');
    assert.match(await page.locator('[data-id="a"] .item-preview').innerText(),/修改后保留/);
    assert.deepEqual(await page.evaluate(()=>db.characters[0].worldBookIds),backup.characters[0].worldBookIds);
    assert.deepEqual(await page.evaluate(()=>db.groups[0].worldBookIds),['a','g']);
    const saved=await page.evaluate(()=>db.worldBooks);
    assert.deepEqual(saved.slice(1),books.slice(1),'other entries including malformed originals survive save and reload');
    assert.deepEqual(saved[0].legacyField,{keep:true});
    await page.locator('#world-book-detail-search-input').fill('空格');
    assert.equal(await page.locator('#world-book-detail-list-container > li').count(),2);
    await page.locator('#world-book-detail-search-input').fill('');
    await page.evaluate(()=>enterWorldBookMultiSelectMode());
    await page.locator('#world-book-detail-select-all-btn').click();
    assert.equal(await page.evaluate(()=>selectedWorldBookIds.size),9);
    await page.evaluate(()=>exitWorldBookMultiSelectMode());
    await page.locator('#world-book-detail-screen .back-btn').click();
    await openFolder('设定');
    assert.equal(await page.locator('#world-book-detail-list-container > li').count(),2);
    assert.equal(await page.locator('[data-id="l"] .item-preview img').count(),0,'imported text is displayed literally');
    assert.equal(await page.locator('[data-id="l"] .item-name b').count(),0);
    assert.equal(await page.evaluate(()=>window.injected),undefined);
    await page.evaluate(()=>switchScreen('world-book-screen'));
    await openFolder('__proto__');
    assert.equal(await page.locator('#world-book-detail-list-container > li').count(),1);
    await page.evaluate(()=>switchScreen('world-book-screen'));
    await page.locator('#world-book-search-input').fill('对象正文');
    assert.equal(await page.locator('.world-book-folder-header').count(),1);
    await page.locator('#world-book-search-input').fill('');
    await page.evaluate(()=>openWorldBookCustomExportModal());
    assert.equal(await page.locator('.custom-export-item-checkbox').count(),books.length);
    await page.locator('#wb-custom-export-close-btn').click();
    await openFolder('未分类');
    await page.locator('[data-id="a"] .item-name').click();
    await page.locator('#world-book-content').fill('失败后应可重试');
    await page.evaluate(()=>{failSave=true;notices.length=0});
    await page.locator('#edit-world-book-form button[type=submit]').click();
    await page.waitForFunction(()=>notices.some(n=>n.includes('保存失败')));
    assert.equal(await page.locator('#edit-world-book-screen.active').count(),1);
    assert.ok(!await page.evaluate(()=>notices.includes('世界书条目已保存')));
    await page.evaluate(()=>failSave=false);
    await page.locator('#edit-world-book-form button[type=submit]').click();
    await page.locator('#world-book-screen.active').waitFor();
    await page.reload();await page.evaluate(()=>ready);await openFolder('未分类');
    assert.match(await page.locator('[data-id="a"] .item-preview').innerText(),/失败后应可重试/);
    await page.setViewportSize({width:1280,height:900});
    await page.locator('#world-book-detail-screen .back-btn').click();await openFolder('未分类');
    assert.equal(await page.locator('#world-book-detail-list-container > li').count(),9);
    await page.locator('#world-book-detail-screen .back-btn').click();
    await page.evaluate(()=>enterWorldBookMultiSelectMode());
    await page.locator('.collapsible-section[data-category="设定"] .category-checkbox').check();
    assert.deepEqual(await page.evaluate(()=>[...selectedWorldBookIds].sort()),['j','l'],'folder selection includes exactly the displayed descendants');
    await page.evaluate(()=>exitWorldBookMultiSelectMode());
    await page.locator('.collapsible-section[data-category="设定"] .world-book-delete-category-btn').click();
    await page.locator('#wb-delete-category-move-entries-btn').click();
    await page.waitForFunction(()=>db.worldBooks.filter(b=>b.category==='').length===4);
    await page.reload();await page.evaluate(()=>ready);await openFolder('未分类');
    assert.equal(await page.locator('#world-book-detail-list-container > li').count(),11);
    assert.deepEqual(await page.evaluate(()=>db.characters[0].worldBookIds),backup.characters[0].worldBookIds,'moving a folder retains all role bindings');
    await page.locator('#world-book-detail-screen .back-btn').click();
    await page.locator('.collapsible-section[data-category="__proto__"] .world-book-delete-category-btn').click();
    await page.locator('#wb-delete-category-and-entries-btn').click();
    await page.waitForFunction(()=>db.worldBooks.length===11);
    await page.reload();await page.evaluate(()=>ready);
    assert.deepEqual(await page.evaluate(()=>db.characters[0].worldBookIds),backup.characters[0].worldBookIds.filter(id=>id!=='k'),'deleting one fixture folder never removes unrelated role bindings');
    assert.deepEqual(errors,[]);
    console.log('Worldbook browser checks passed: real backup import, uncategorized/nested paths, malformed originals, edit/save/reload, bindings, export, search, selection and failed-save retry.');
} finally {
    await browser?.close();await new Promise(resolve=>server.close(resolve));
}
