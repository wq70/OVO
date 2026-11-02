// Requires Playwright on NODE_PATH, like test-interactive-messages-browser.mjs.
// Uses an isolated in-memory database; never reads the user's browser storage.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const root = path.resolve(import.meta.dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const markup = read('src/html/screens/magic-storage-peek.html').split('        <div id="storage-analysis-screen"')[0];
const initial = {
    magicRoom: { customPromptEnabled: true, promptEditMode: 'items', momentsPrompts: { post: '保留的旧动态提示词' }, presets: [{name:'旧源码预设',template:'旧模板 {{角色名}}'}] },
    characters: [{id:'c1',realName:'测试角色',myName:'测试用户',persona:'测试人设',myPersona:'用户设定',history:[],nodes:[],memoryJournals:[],momentsSettings:{postEnabled:true,storyEnabled:true}}],
    apiSettings:{}, groups:[],favorites:[],myStickers:[],piggyBank:{},forumSettings:{},cotSettings:{},bubbleCssPresets:{},forumMessages:[],
    keepAliveCodeEnabled:false,keepAliveAutoWakeEnabled:false,keepAliveAudioEnabled:false
};
const harness = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="stylesheet" href="/css/base.css"><link rel="stylesheet" href="/css/layout.css"><link rel="stylesheet" href="/css/settings.css">
<div class="phone-screen">${markup}</div><div id="keep-alive-audio-modal" class="modal-overlay"><div class="modal-window"><button id="close-keep-alive-audio-btn">关闭音频配置</button></div></div>
<script>
window.db=${JSON.stringify(initial)};window.notices=[];window.exports=[];window.saved=[];window.promptAnswers=[];window.confirmAnswer=true;
window.showToast=v=>notices.push(v);window.customConfirm=async()=>confirmAnswer;window.customPrompt=async()=>promptAnswers.shift();window.confirm=()=>confirmAnswer;
window.saveGlobalSettings=async keys=>{saved.push({keys,db:structuredClone(db)});return true};window.saveData=async()=>true;
window.OvoFileDownload={save:async(blob,name)=>exports.push({name,text:await blob.text()})};
window.getActiveWorldBooksContents=()=>({before:'世界书',middle:'',after:''});window.getEffectivePersona=c=>c.persona||'';
window.getOnlineLogicRules=()=> '在线逻辑';window.getOnlineOutputFormats=()=> '输出格式';window.getLocalTimeInTimezone=()=> '2026年10月22日 12:00';
window.getMemoryTableContextBlock=()=>'';window.getVectorMemoryContextBlock=()=>'';window.filterHistoryForAI=(_,h)=>h;window.pad=v=>String(v).padStart(2,'0');
window.showSystemNotification=async data=>{window.testNotification=data};
Object.defineProperty(window,'Notification',{configurable:true,value:class{static permission='default';static async requestPermission(){this.permission='granted';return 'granted'}}});
</script>
<script src="/js/modules/moments.js"></script><script src="/js/modules/chat-ai/prompt-studio.js"></script><script src="/js/settings/prompt-studio-settings.js"></script><script src="/js/settings/magic-room-settings.js"></script><script src="/js/modules/keep_alive.js"></script>
<script>document.getElementById('magic-room-screen').classList.add('active');setupMagicRoomApp();KeepAliveModule.bindEvents();KeepAliveModule.restoreSettings();</script></html>`;
let replayData=null;
const server=http.createServer((req,res)=>{
    if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(harness);return;}
    if(req.url==='/replay'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(harness.replace('window.db='+JSON.stringify(initial),'window.db='+JSON.stringify(replayData)));return;}
    const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    try{res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));}
    catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browserType=process.env.OVO_TEST_BROWSER==='webkit'?webkit:chromium;
const browser=await browserType.launch({headless:true,...(process.env.OVO_TEST_CHROMIUM?{executablePath:process.env.OVO_TEST_CHROMIUM}:{})}).catch(error=>{server.close();throw error;});
const screenshotDir=process.env.OVO_MAGIC_SCREENSHOTS;
if(screenshotDir)fs.mkdirSync(screenshotDir,{recursive:true});
try{
    const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
    await page.clock.setFixedTime(new Date('2026-10-25T04:00:00Z'));
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const app=page.locator('#magic-room-screen');
    if(screenshotDir)await app.screenshot({path:path.join(screenshotDir,'magic-room-final.png'),animations:'disabled'});
    const draft=()=>page.evaluate(()=>PromptStudioUI.getDraft());
    const openItem=async id=>{
        const card=page.locator(`[data-item-id="${id}"]`);
        await card.evaluate(el=>{el.closest('details').open=true;});
        const button=card.locator('.prompt-studio-edit-btn');
        await button.click();
        const dialog=page.locator('#prompt-studio-editor-modal [role="dialog"]');
        assert.ok(await dialog.isVisible());
        assert.equal(await page.locator('#prompt-studio-item-list textarea').count(),0,'editing must not expand the list');
        return dialog;
    };
    const chooseTab=async name=>page.locator(`[data-magic-room-tab="${name}"]`).click();
    assert.equal((await draft()).items.length,25);
    const originalDraft=await draft();
    assert.deepEqual(await page.locator('#prompt-studio-item-list .prompt-studio-item').evaluateAll(nodes=>nodes.map(n=>n.dataset.itemId)),originalDraft.items.map(i=>i.id),'folding must preserve execution order');
    const beforeCompile=await page.evaluate(()=>PromptStudio.compileItems(db.characters[0],PromptStudioUI.getDraft().items,{preview:true}).prompt);

    // Editing is transactional and every tool opens directly above the list.
    let card=await openItem('persona.character');
    assert.ok(await page.locator('#magic-room-screen > main').evaluate(el=>el.inert));
    await card.getByRole('textbox',{name:'提示词内容',exact:true}).fill('测试修改 {{角色名}}');
    assert.deepEqual(await draft(),originalDraft,'typing must stay in the editor buffer');
    await card.getByRole('button',{name:'插入变量',exact:true}).click();
    const variableDialog=page.getByRole('dialog',{name:'变量库',exact:true});
    assert.ok(await variableDialog.isVisible());
    assert.ok(await card.evaluate(el=>el.closest('.modal-overlay').inert),'nested picker disables the editor');
    await page.locator('#prompt-studio-variable-list button').filter({hasText:'{{用户称呼}}'}).first().click();
    assert.ok((await card.getByRole('textbox',{name:'提示词内容',exact:true}).inputValue()).includes('{{用户称呼}}'));
    assert.deepEqual(await draft(),originalDraft,'variable insertion is also buffered');
    await page.locator('#prompt-studio-close-variables').click();
    assert.equal(await card.evaluate(el=>el.closest('.modal-overlay').inert),false);
    assert.equal(await page.evaluate(()=>document.activeElement.textContent),'插入变量');
    await card.getByRole('button',{name:'完成',exact:true}).click();
    await chooseTab('runtime');await chooseTab('moments');await chooseTab('prompts');
    card=await openItem('persona.character');
    assert.match(await card.getByRole('textbox',{name:'提示词内容',exact:true}).inputValue(),/测试修改/);
    await card.getByRole('button',{name:'取消',exact:true}).click();
    await page.locator('#prompt-studio-preview').click();
    assert.ok(await page.getByRole('dialog',{name:'最终提示词预览',exact:true}).isVisible());
    assert.ok((await page.locator('#prompt-studio-preview-content').innerText()).includes('测试角色'));
    await page.locator('#prompt-studio-close-preview').click();
    card=await openItem('persona.character');
    await card.getByRole('button',{name:'恢复本条默认',exact:true}).click();
    await card.getByRole('button',{name:'完成',exact:true}).click();
    assert.equal((await draft()).items.find(i=>i.id==='persona.character').content,originalDraft.items.find(i=>i.id==='persona.character').content);
    assert.equal(await page.evaluate(()=>PromptStudio.compileItems(db.characters[0],PromptStudioUI.getDraft().items,{preview:true}).prompt),beforeCompile);
    card=await openItem('persona.character');
    await card.getByRole('textbox',{name:'提示词内容',exact:true}).fill('取消时不保存');
    await page.keyboard.press('Escape');
    assert.deepEqual(await draft(),originalDraft);
    assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'编辑条目：角色身份与人设');

    card=page.locator('[data-item-id="context.weather"]');
    await card.evaluate(el=>{el.closest('details').open=true;});
    const idsBefore=(await draft()).items.map(i=>i.id);
    await card.getByRole('button',{name:'上移条目：天气与环境',exact:true}).click();
    const idsAfter=(await draft()).items.map(i=>i.id);
    const oldIndex=idsBefore.indexOf('context.weather');
    assert.equal(idsAfter[oldIndex-1],'context.weather','cross-category sorting remains available');
    assert.deepEqual(await page.locator('#prompt-studio-item-list .prompt-studio-item').evaluateAll(nodes=>nodes.map(n=>n.dataset.itemId)),idsAfter);
    await page.locator('[data-item-id="context.weather"] input[type="checkbox"]').uncheck();
    assert.equal((await draft()).items.find(i=>i.id==='context.weather').enabled,false);

    const beforeAdd=await draft();
    await page.locator('#prompt-studio-add-item').click({clickCount:3});
    card=page.locator('#prompt-studio-editor-modal [role="dialog"]');
    assert.ok(await card.isVisible(),'rapid taps open one editor immediately');
    await page.locator('#prompt-studio-add-item').evaluate(el=>{el.click();el.click();el.click();});
    assert.deepEqual(await draft(),beforeAdd,'repeated add does not create entries');
    await card.getByRole('textbox',{name:'条目名称',exact:true}).fill('取消的草稿');
    await card.getByRole('button',{name:'取消',exact:true}).click();
    assert.deepEqual(await draft(),beforeAdd,'cancel new entry leaves no blank entries');
    assert.equal(await page.locator('#magic-room-screen > main').evaluate(el=>el.inert),false);
    for(const dismissal of ['escape','backdrop','close']){
        await page.locator('#prompt-studio-add-item').click();
        if(dismissal==='escape')await page.keyboard.press('Escape');
        else if(dismissal==='backdrop')await page.locator('#prompt-studio-editor-modal').click({position:{x:2,y:2}});
        else await card.getByRole('button',{name:'关闭编辑条目',exact:true}).click();
        assert.deepEqual(await draft(),beforeAdd,dismissal+' cancels new entry');
    }
    const scrollBefore=await page.locator('#magic-room-screen > main').evaluate(el=>el.scrollTop);
    await page.locator('#prompt-studio-open-variables').click();
    assert.ok(await variableDialog.isVisible(),'variable library is in the viewport, not below the entries');
    await page.locator('#prompt-studio-close-variables').click();
    assert.equal(await page.locator('#magic-room-screen > main').evaluate(el=>el.scrollTop),scrollBefore,'tools preserve list position');

    await page.locator('#prompt-studio-add-item').click();
    await card.getByRole('textbox',{name:'条目名称',exact:true}).fill('自定义测试');
    await card.getByRole('combobox',{name:'条目分类',exact:true}).selectOption('persona');
    await card.getByRole('combobox',{name:'生效条件',exact:true}).selectOption('weather');
    await card.getByRole('textbox',{name:'提示词内容',exact:true}).fill('自定义 {{角色名}}');
    assert.deepEqual(await draft(),beforeAdd);
    await card.getByRole('button',{name:'完成',exact:true}).click();
    assert.equal((await draft()).items.length,beforeAdd.items.length+1);
    const added=(await draft()).items.at(-1);
    assert.equal(added.name,'自定义测试');assert.equal(added.category,'persona');assert.equal(added.condition,'weather');
    card=await openItem(added.id);
    await card.getByRole('button',{name:'复制条目',exact:true}).click();
    assert.equal((await draft()).items.length,beforeAdd.items.length+1,'copy waits for explicit confirmation');
    await card.getByRole('button',{name:'取消',exact:true}).click();
    assert.equal((await draft()).items.length,beforeAdd.items.length+1,'cancel copy leaves no duplicate');
    card=await openItem(added.id);
    await card.getByRole('button',{name:'复制条目',exact:true}).click();
    await card.getByRole('button',{name:'完成',exact:true}).click();
    const copied=(await draft()).items.at(-1);
    assert.equal(copied.name,'自定义测试 副本');
    card=await openItem(copied.id);
    await card.getByRole('button',{name:'删除',exact:true}).click();
    assert.equal((await draft()).items.at(-1).name,'自定义测试');

    // Migrate the 13 rules, then edit, reorder, disable, copy and remove draft items.
    await chooseTab('moments');
    await page.locator('#magic-room-moments-prompts > summary').click();
    const momentsDraft=()=>page.evaluate(()=>MomentsPromptUI.getDraft());
    const originalMoments=await momentsDraft();
    assert.equal(originalMoments.length,13);
    assert.equal(originalMoments[0].content,'保留的旧动态提示词');
    const openMomentsItem=async id=>{
        const card=page.locator(`[data-moments-item-id="${id}"]`);
        await card.evaluate(el=>{el.closest('details').open=true;});
        await card.getByRole('button',{name:`编辑条目：${(await momentsDraft()).find(i=>i.id===id).name}`,exact:true}).click();
        const dialog=page.getByRole('dialog',{name:'编辑条目',exact:true});
        assert.ok(await dialog.isVisible());
        assert.equal(await page.locator('#moments-prompt-item-list textarea').count(),0,'editing never expands the list');
        assert.ok(await page.locator('#magic-room-screen > main').evaluate(el=>el.inert),'background controls are disabled while editing');
        return dialog;
    };
    const finishMomentsEdit=()=>page.getByRole('dialog',{name:'编辑条目',exact:true}).getByRole('button',{name:'完成',exact:true}).click();
    card=await openMomentsItem('moments.post');
    await card.getByRole('textbox',{name:'提示词内容',exact:true}).fill('取消时不应该保存');
    assert.deepEqual(await momentsDraft(),originalMoments,'typing stays in the dialog buffer');
    await card.getByRole('button',{name:'取消',exact:true}).click();
    assert.deepEqual(await momentsDraft(),originalMoments,'cancel preserves original text');
    assert.equal(await page.locator('#magic-room-screen > main').evaluate(el=>el.inert),false);
    assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'编辑条目：自主发动态');
    await page.locator('#moments-prompt-add-item').click();
    await page.getByRole('dialog',{name:'编辑条目',exact:true}).getByRole('button',{name:'取消',exact:true}).click();
    assert.deepEqual(await momentsDraft(),originalMoments,'cancelling a new entry does not leave a blank item');
    const expectedMoments={};
    for(const entry of originalMoments){
        const card=await openMomentsItem(entry.id);
        expectedMoments[entry.key]='修改-'+entry.key;
        await card.getByRole('textbox',{name:'提示词内容',exact:true}).fill(expectedMoments[entry.key]);
        await finishMomentsEdit();
    }
    card=await openMomentsItem('moments.seen');
    await card.getByRole('button',{name:'插入 {{动态列表}}',exact:true}).click();
    assert.match(await card.getByRole('textbox',{name:'提示词内容',exact:true}).inputValue(),/\{\{动态列表\}\}/);
    await card.getByRole('textbox',{name:'提示词内容',exact:true}).fill(expectedMoments.seen);
    await finishMomentsEdit();
    card=page.locator('[data-moments-item-id="moments.browse"]');
    await card.evaluate(el=>{el.closest('details').open=true;});
    await card.getByRole('button',{name:'上移条目：自主浏览',exact:true}).click();
    assert.equal((await momentsDraft())[2].key,'browse','moving across categories preserves visual and compiler order');
    assert.deepEqual(await page.locator('[data-moments-item-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.momentsItemId)),(await momentsDraft()).map(i=>i.id));
    await page.locator('[data-moments-item-id="moments.browse"] input[type="checkbox"]').uncheck();
    expectedMoments.browse='';
    await page.locator('#moments-prompt-add-item').click();
    let momentsEditor=page.getByRole('dialog',{name:'编辑条目',exact:true});
    await momentsEditor.getByRole('textbox',{name:'条目名称',exact:true}).fill('额外发布习惯');
    await momentsEditor.getByRole('combobox',{name:'生效场景',exact:true}).selectOption('story');
    momentsEditor=page.getByRole('dialog',{name:'编辑条目',exact:true});
    await momentsEditor.getByRole('textbox',{name:'提示词内容',exact:true}).fill('额外 Story 习惯');
    await finishMomentsEdit();
    const addedMoments=(await momentsDraft()).at(-1);
    momentsEditor=await openMomentsItem(addedMoments.id);
    await momentsEditor.getByRole('button',{name:'复制条目',exact:true}).click();
    assert.equal((await momentsDraft()).length,14,'moments copy waits for confirmation');
    await momentsEditor.getByRole('button',{name:'取消',exact:true}).click();
    assert.equal((await momentsDraft()).length,14,'cancelling moments copy creates nothing');
    momentsEditor=await openMomentsItem(addedMoments.id);
    await momentsEditor.getByRole('button',{name:'复制条目',exact:true}).click();
    await finishMomentsEdit();
    assert.equal((await momentsDraft()).at(-1).name,'额外发布习惯 副本');
    momentsEditor=await openMomentsItem((await momentsDraft()).at(-1).id);
    await momentsEditor.getByRole('button',{name:'删除',exact:true}).click();
    assert.equal((await momentsDraft()).length,14);
    expectedMoments.story+='\n额外 Story 习惯';
    await page.locator('#moments-prompt-preview').click();
    assert.match(await page.locator('#moments-prompt-preview-content').innerText(),/额外 Story 习惯/,'preview compiles unsaved edits');
    assert.equal(await page.evaluate(()=>db.magicRoom.momentsPromptItems),undefined,'draft does not change runtime rules before save');
    await page.locator('#moments-prompt-close-preview').click();
    await page.evaluate(()=>confirmAnswer=false);
    await page.locator('#moments-prompt-reset-items').click();
    assert.equal((await momentsDraft()).length,14,'cancelled reset preserves draft');
    await page.evaluate(()=>confirmAnswer=true);
    const expectedMomentsItems=await momentsDraft();
    await chooseTab('runtime');
    await page.locator('#sysnotif-enabled').check();
    await page.locator('#sysnotif-sender-name').fill('测试通知名称');
    await page.locator('#sysnotif-show-avatar').uncheck();
    await page.locator('#sysnotif-in-chat-enabled').check();
    await page.locator('#sysnotif-show-content').uncheck();
    await page.locator('#sysnotif-custom-server').check();
    await page.locator('#sysnotif-server-url').fill('https://example.invalid/push');
    await page.locator('#sysnotif-server-key').fill('test-only-token');
    await page.locator('#sysnotif-request-permission').click();
    assert.ok((await page.locator('#sysnotif-permission-status').innerText()).includes('已授权'));
    await page.locator('#sysnotif-test-btn').click();
    assert.equal(await page.evaluate(()=>testNotification.title),'测试通知名称');
    await page.locator('#keep-alive-auto-wake-enabled').check();
    assert.equal(await page.evaluate(()=>db.keepAliveAutoWakeEnabled),true);
    await page.locator('#open-keep-alive-audio-btn').click();
    assert.ok(await page.locator('#keep-alive-audio-modal').evaluate(e=>e.classList.contains('visible')));
    await page.locator('#close-keep-alive-audio-btn').click();
    await page.locator('#magic-room-save-btn').click();
    const stored=await page.evaluate(()=>saved.at(-1).db.magicRoom);
    replayData=await page.evaluate(()=>saved.at(-1).db);
    assert.deepEqual(stored.momentsPrompts,expectedMoments);
    assert.deepEqual(stored.momentsPromptItems,expectedMomentsItems);
    assert.equal(stored.sysNotifEnabled,true);assert.equal(stored.sysNotifSenderName,'测试通知名称');
    assert.equal(stored.sysNotifShowAvatar,false);assert.equal(stored.sysNotifInChatEnabled,true);assert.equal(stored.sysNotifShowContent,false);
    assert.equal(stored.sysNotifCustomServer,true);assert.equal(stored.sysNotifServerUrl,'https://example.invalid/push');assert.equal(stored.sysNotifServerKey,'test-only-token');
    assert.deepEqual(stored.customPromptItems,(await draft()).items);

    // Server tests must never be satisfied by a local notification or an unsaved URL.
    await page.evaluate(()=>{
        window.pushCalls=[];
        window.OvoPush={
            connect:async values=>{pushCalls.push(['connect',values]);return 'a'.repeat(64)},
            test:async(values,id)=>{pushCalls.push(['test',values,id])},
            disconnect:async(values,id)=>{pushCalls.push(['disconnect',values,id]);return '已断开服务器推送'}
        };
    });
    await page.locator('#sysnotif-server-connect').click();
    await page.waitForFunction(()=>db.magicRoom.sysNotifPushDeviceId==='a'.repeat(64));
    assert.ok((await page.locator('#sysnotif-server-status').innerText()).includes('设备已登记'));
    await page.locator('#sysnotif-server-test').click();
    assert.equal(await page.evaluate(()=>pushCalls.at(-1)[0]),'test');
    assert.ok((await page.locator('#sysnotif-server-status').innerText()).includes('不代表测试通过'));
    await page.locator('#sysnotif-server-url').fill('https://changed.invalid');
    await page.locator('#sysnotif-server-test').click();
    assert.ok((await page.locator('#sysnotif-server-status').innerText()).includes('先断开旧推送'));
    assert.equal(await page.evaluate(()=>pushCalls.length),2,'changed draft must not silently test old server');
    await page.locator('#sysnotif-server-url').fill('https://example.invalid/push');
    await page.locator('#sysnotif-custom-server').uncheck();
    await page.locator('#magic-room-save-btn').click();
    assert.equal(await page.evaluate(()=>pushCalls.at(-1)[0]),'disconnect','saving notification off cancels subscription');
    assert.equal(await page.evaluate(()=>db.magicRoom.sysNotifPushDeviceId),'');
    await page.locator('#sysnotif-custom-server').check();
    await page.locator('#magic-room-save-btn').click();
    await page.locator('#sysnotif-server-status').scrollIntoViewIfNeeded();
    if(screenshotDir)await app.screenshot({path:path.join(screenshotDir,'server-push-settings.png')});

    // Old presets, rename bindings, import/export formats, and raw source remain compatible.
    await chooseTab('prompts');
    const oldId=await page.evaluate(()=>db.magicRoom.presets[0].id);
    await page.locator('#magic-room-preset-select').selectOption(oldId);await page.locator('#magic-room-apply-preset').click();
    assert.equal(await page.locator('#magic-room-custom-prompt').inputValue(),'旧模板 {{角色名}}');
    assert.equal((await draft()).mode,'source');
    await page.locator('#magic-room-custom-prompt').fill('自定义源码 {{角色名}}');
    await page.evaluate(()=>{promptAnswers.push('新预设');});
    await page.locator('#magic-room-save-preset').click();
    assert.equal(await page.locator('#magic-room-preset-select option').count(),3);
    await page.evaluate(id=>{db.characters[0].customPromptPreset=id;promptAnswers.push('旧预设改名');},oldId);
    await page.locator('#magic-room-manage-presets').click();
    const oldRow=page.locator('#magic-room-presets-list > div').filter({hasText:'旧源码预设'});
    await oldRow.getByRole('button',{name:'重命名',exact:true}).click();
    assert.equal(await page.evaluate(()=>db.characters[0].customPromptPresetId),oldId);
    assert.equal(await page.evaluate(()=>db.magicRoom.presets[0].name),'旧预设改名');
    await page.locator('#magic-room-presets-list > div').filter({hasText:'新预设'}).getByRole('button',{name:'删除',exact:true}).click();
    await page.locator('#magic-room-close-modal').click();
    await page.evaluate(()=>confirmAnswer=false);
    await page.locator('#magic-room-export-btn').click();
    await page.waitForFunction(()=>exports.length>0);
    const exported=await page.evaluate(()=>JSON.parse(exports.at(-1).text));
    assert.equal(exported.type,'ovo-system-prompt-template');assert.equal(exported.version,2);assert.equal(exported.mode,'source');assert.equal(exported.template,'自定义源码 {{角色名}}');
    const importFile=async data=>page.locator('#magic-room-import-input').setInputFiles({name:'template.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
    await page.locator('[data-prompt-mode="items"]').click();
    await importFile({type:'ovo-system-prompt-template',template:'旧版单模板 {{角色名}}'});
    await page.waitForFunction(()=>PromptStudioUI.getDraft().mode==='source');
    assert.equal(await page.locator('#magic-room-custom-prompt').inputValue(),'旧版单模板 {{角色名}}');
    await importFile({type:'ovo-system-prompt-template',version:2,mode:'items',items:[{id:'imported',name:'导入条目',category:'custom',content:'导入内容',condition:'always',enabled:true}]});
    await page.waitForFunction(()=>PromptStudioUI.getDraft().items[0].id==='imported');
    assert.equal((await draft()).mode,'items');assert.ok((await draft()).items.some(i=>i.id==='context.moments'));
    await importFile([{name:'导入旧预设',template:'旧版源码'}]);
    await page.waitForFunction(()=>db.magicRoom.presets.some(p=>p.name==='导入旧预设'));
    await page.evaluate(()=>confirmAnswer=true);await page.locator('#magic-room-export-btn').click();
    await page.waitForFunction(()=>exports.length>0&&Array.isArray(JSON.parse(exports.at(-1).text)));
    assert.ok(Array.isArray(await page.evaluate(()=>JSON.parse(exports.at(-1).text))));
    await page.locator('#prompt-studio-reset-items').click();
    assert.deepEqual((await draft()).items,originalDraft.items);
    await page.locator('#magic-room-custom-prompt-enabled').uncheck();
    assert.equal(await page.locator('#magic-room-prompt-editor').isVisible(),false);
    await page.locator('#magic-room-custom-prompt-enabled').check();
    assert.equal(await page.locator('#magic-room-prompt-editor').isVisible(),true);

    // Verify narrow phones, touch controls, larger text, dark mode and desktop.
    for(const width of [320,390,768,1280]){
        await page.setViewportSize({width,height:844});
        for(const tab of ['prompts','moments','runtime']){
            await chooseTab(tab);
            const geometry=await app.evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth,content:el.querySelector('main').scrollWidth}));
            if(geometry.scroll>geometry.client+1||geometry.content>geometry.client+1){
                console.error('Overflow details',geometry,await app.evaluate(el=>[...el.querySelectorAll('*')].map(n=>({tag:n.tagName,id:n.id,cls:n.className,right:n.getBoundingClientRect().right,width:n.getBoundingClientRect().width})).filter(n=>n.right>el.clientWidth+1).slice(0,12)));
                if(screenshotDir)await app.screenshot({path:path.join(screenshotDir,'overflow.png')});
            }
            assert.ok(geometry.scroll<=geometry.client+1&&geometry.content<=geometry.client+1,`${width}px ${tab} must not overflow`);
            assert.ok(await page.locator('#magic-room-save-btn').isVisible());
            if(screenshotDir&&width===390)await app.screenshot({path:path.join(screenshotDir,`magic-room-${tab}.png`)});
        }
        await chooseTab('prompts');
        let systemDialog=await openItem('persona.character');
        const systemBounds=await systemDialog.boundingBox();
        assert.ok(systemBounds.x>=15&&systemBounds.y>=15&&systemBounds.x+systemBounds.width<=width-15&&systemBounds.y+systemBounds.height<=829,'system editor stays in viewport');
        assert.ok(await systemDialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'system editor must not overflow');
        const systemFooter=await systemDialog.locator('footer').boundingBox();
        assert.ok(systemFooter.y+systemFooter.height<=829,'cancel and done remain visible');
        const buffered=await systemDialog.getByRole('textbox',{name:'提示词内容',exact:true}).inputValue();
        if(screenshotDir&&width===390)await app.screenshot({path:path.join(screenshotDir,'system-prompt-dialog.png')});
        await systemDialog.getByRole('button',{name:'插入变量',exact:true}).click();
        const variableBounds=await variableDialog.boundingBox();
        assert.ok(variableBounds.x>=15&&variableBounds.y>=15&&variableBounds.x+variableBounds.width<=width-15&&variableBounds.y+variableBounds.height<=829,'variable library stays in viewport');
        if(screenshotDir&&width===390)await app.screenshot({path:path.join(screenshotDir,'system-prompt-variables.png')});
        await page.keyboard.press('Escape');
        assert.equal(await systemDialog.getByRole('textbox',{name:'提示词内容',exact:true}).inputValue(),buffered,'closing library keeps the editor buffer');
        await systemDialog.getByRole('button',{name:'完成',exact:true}).focus();
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'关闭编辑条目');
        await page.keyboard.press('Escape');
        await chooseTab('moments');
        const dialog=await openMomentsItem('moments.post');
        const bounds=await dialog.boundingBox();
        assert.ok(Math.abs(bounds.x+bounds.width/2-width/2)<2,`${width}px dialog must be horizontally centered`);
        assert.ok(Math.abs(bounds.y+bounds.height/2-844/2)<2,`${width}px dialog must be vertically centered`);
        assert.ok(bounds.x>=15&&bounds.y>=15&&bounds.x+bounds.width<=width-15&&bounds.y+bounds.height<=829,'dialog must fit inside the viewport');
        assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'dialog must not overflow horizontally');
        const textarea=dialog.getByRole('textbox',{name:'提示词内容',exact:true});
        const textBounds=await textarea.boundingBox();
        assert.ok(textBounds.height>=240,'content editor must be large enough for longer prompts');
        await textarea.fill(await page.evaluate(()=>Moments.promptDefaults.post));
        if(screenshotDir)await app.screenshot({path:path.join(screenshotDir,`moments-dialog-${width}.png`)});
        await dialog.getByRole('button',{name:'完成',exact:true}).focus();
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'关闭条目编辑','Tab wraps inside the dialog');
        await page.keyboard.press('Shift+Tab');
        assert.equal(await page.evaluate(()=>document.activeElement.textContent),'完成');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#moments-prompt-modal').isVisible(),false,'Escape dismisses the dialog');
        assert.deepEqual(await momentsDraft(),expectedMomentsItems,'Escape discards the editor buffer');
    }
    await page.setViewportSize({width:390,height:480});
    await chooseTab('moments');
    card=await openMomentsItem('moments.post');
    const shortBounds=await card.boundingBox();
    const footerBounds=await card.locator('.moments-prompt-dialog-footer').boundingBox();
    assert.ok(shortBounds.y>=15&&shortBounds.y+shortBounds.height<=465,'short viewport keeps the dialog in view');
    assert.ok(footerBounds.y+footerBounds.height<=465,'footer stays visible when available height shrinks');
    assert.ok(await card.locator('.moments-prompt-dialog-body').evaluate(el=>el.scrollHeight>el.clientHeight),'only the editor body scrolls on short screens');
    await page.locator('#moments-prompt-modal').click({position:{x:2,y:2}});
    assert.deepEqual(await momentsDraft(),expectedMomentsItems,'backdrop dismissal leaves the draft unchanged');
    card=await openMomentsItem('moments.post');
    await page.locator('#moments-prompt-modal').evaluate(el=>el.classList.remove('visible'));
    await page.waitForFunction(()=>!document.querySelector('#magic-room-screen > main').inert);
    assert.deepEqual(await momentsDraft(),expectedMomentsItems,'external overlay closure releases the background');
    await chooseTab('prompts');
    card=await openItem('persona.character');
    const systemShortFooter=await card.locator('footer').boundingBox();
    assert.ok(systemShortFooter.y+systemShortFooter.height<=465,'system editor footer survives keyboard-height viewport');
    assert.ok(await card.locator('.moments-prompt-dialog-body').evaluate(el=>el.scrollHeight>el.clientHeight),'system editor scrolls only its body');
    await page.locator('#prompt-studio-editor-modal').evaluate(el=>el.classList.remove('visible'));
    await page.waitForFunction(()=>!document.querySelector('#magic-room-screen > main').inert);
    for(const id of ['persona.character','context.weather','context.moments','format.output']){
        if(!(await draft()).items.some(item=>item.id===id))continue;
        card=await openItem(id);
        await card.getByRole('button',{name:'取消',exact:true}).click();
    }
    await page.setViewportSize({width:320,height:844});
    await page.evaluate(()=>document.documentElement.style.setProperty('--app-font-scale','1.35'));
    for(const tab of ['prompts','moments','runtime']){await chooseTab(tab);assert.ok(await app.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'large text must fit');}
    await page.evaluate(()=>document.body.classList.add('night-mode-active'));
    assert.equal(await app.evaluate(el=>getComputedStyle(el).getPropertyValue('--magic-surface').trim()),'#181b20');
    await chooseTab('prompts');
    card=await openItem('persona.character');
    assert.ok(await card.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'large text fits the system editor');
    assert.equal(await card.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(24, 27, 32)');
    if(screenshotDir)await app.screenshot({path:path.join(screenshotDir,'system-prompt-dialog-dark.png')});
    await card.getByRole('button',{name:'取消',exact:true}).click();
    await chooseTab('moments');
    card=await openMomentsItem('moments.post');
    assert.ok(await card.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'large text must fit in the dialog');
    assert.equal(await card.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(24, 27, 32)');
    if(screenshotDir)await app.screenshot({path:path.join(screenshotDir,'moments-dialog-dark.png')});
    await card.getByRole('button',{name:'关闭条目编辑',exact:true}).click();
    await page.locator('#magic-room-tab-prompts').focus();await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#magic-room-tab-moments').getAttribute('aria-selected'),'true');
    const replay=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
    await replay.goto(`http://127.0.0.1:${server.address().port}/replay`);
    assert.deepEqual(await replay.evaluate(()=>PromptStudioUI.getDraft().items),stored.customPromptItems);
    assert.equal(await replay.locator('#sysnotif-sender-name').inputValue(),'测试通知名称');
    assert.equal(await replay.locator('#sysnotif-server-key').inputValue(),'test-only-token');
    assert.equal(await replay.locator('#keep-alive-auto-wake-enabled').isChecked(),true);
    assert.deepEqual(await replay.evaluate(()=>MomentsPromptUI.getDraft()),expectedMomentsItems);
    await chooseTab('moments');
    await page.locator('#moments-prompt-reset-items').click();
    assert.deepEqual(await momentsDraft(),await page.evaluate(()=>Moments.createPromptItems({})),'reset restores factory defaults, not legacy overrides');
    await replay.close();
    assert.deepEqual(errors,[]);
    console.log('Magic Room browser checks passed: transactional add/edit/copy/cancel, rapid taps, viewport dialogs, nested variables, fixed footer, focus/scroll restoration, order, presets, import/export, moments item migration/editing/sorting/toggles/copy/delete/preview/reset/persistence, keep-alive, tabs, responsive layout and dark mode.');
}finally{await browser.close();server.close();}
