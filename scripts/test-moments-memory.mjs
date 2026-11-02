import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/modules/moments.js', import.meta.url), 'utf8');
const code = source.replace(/\}\)\(\);\s*$/, 'window.__memoryTest = { memoryState, openMemory, memoryRows, filteredMemoryRows, renderMemory, forgetMemories, applyActorAction, viewPostForActor, recentContextFor, deliverActivity, recordActivity, addComment }; })();');
assert.notEqual(source, code);
const elements = new Map();
const element = id => {
    if (!elements.has(id)) elements.set(id, { innerHTML:'', value:'', textContent:'', disabled:false, hidden:true, classList:{contains:()=>false} });
    return elements.get(id);
};
const post = { id:'live', authorId:'user', kind:'post', text:'只看没有回复的秘密', audienceIds:['user','char:a','char:b'], seenBy:{'char:a':1,'char:b':1}, comments:[], likes:[], createdAt:1 };
const db = {
    characters:[
        {id:'a',realName:'甲',momentsSettings:{browseEnabled:true,interactEnabled:true},history:[]},
        {id:'b',realName:'乙',momentsSettings:{interactEnabled:true},history:[]}
    ],
    myPersonaPresets:[{id:'me',name:'我'}],activePersonaId:'me',
    apiSettings:{url:'https://example.invalid',model:'test',key:'test'},
    moments:{posts:[post],activityEvents:[],contacts:[],groups:[],notifications:[]}
};
let choice = 'confirm', saveSucceeds = true, savedCharacter, throws = false, ai = async () => '{}', saveHook;
const sandbox = {
    db, console:{...console,error(){}}, document:{getElementById:element},
    saveGlobalSettings:async()=>true,
    saveCharacter:async id=>{ if (saveHook) await saveHook(); if (throws) throw new Error('disk failed'); if (!saveSucceeds) return false; savedCharacter = structuredClone(db.characters.find(c=>c.id===id)); return true; },
    showAppConfirmDialog:async()=>choice, showToast:text=>{sandbox.toast=text;}, switchScreen:id=>{sandbox.screen=id;},
    isApiConfigReady:config=>Boolean(config?.url && config?.key && config?.model), fetchAiResponse:(...args)=>ai(...args)
};
sandbox.window=sandbox;
vm.runInNewContext(code,sandbox);
const t = sandbox.__memoryTest, a=db.characters[0], b=db.characters[1];
const viewed = t.recordActivity('view','char:a',post);
await t.deliverActivity(viewed);
const deletedPost = {...post,id:'deleted',text:'已删除的旧动态'};
const deletedView = t.recordActivity('view','char:a',deletedPost);
const deleted = t.recordActivity('delete','user',deletedPost,'',['char:a','char:b']);
// Legacy narration has no post ID: the event ID must still allow removal.
const legacy = {id:'old',isMomentsActivity:true,momentsEventId:deletedView.id,content:deletedView.text};
const ordinary = {id:'chat',role:'assistant',content:'普通聊天要保留'};
const nickname = {id:'nickname',isMomentsActivity:true,content:'改网名'};
a.history.push(legacy,ordinary,nickname);
await t.deliverActivity(deleted);
const bBefore = JSON.stringify(b);
t.openMemory();
assert.equal(sandbox.screen,'moments-memory-screen');
assert.deepEqual(Array.from(t.memoryRows(),r=>r.postId).sort(),['deleted','live']);
assert.match(element('moments-memory-list').innerHTML,/已删除的动态/);
t.memoryState.query='旧动态';
assert.deepEqual(Array.from(t.filteredMemoryRows(),r=>r.postId),['deleted']);
t.memoryState.query='';
assert.match(sandbox.Moments.promptForCharacter('a'),/只看没有回复的秘密|已删除的旧动态/);
choice='cancel';
assert.equal(await t.forgetMemories(['deleted']),false);
assert.ok(a.history.includes(legacy));
choice='confirm'; saveSucceeds=false;
const previousHistory = Array.from(a.history);
assert.equal(await t.forgetMemories(['deleted','live']),false);
assert.equal(a.momentsSettings.forgottenPostIds,undefined);
assert.deepEqual(Array.from(a.history),previousHistory,'failed save restores narration in order');
assert.match(sandbox.Moments.promptForCharacter('a'),/只看没有回复的秘密/);
throws=true;saveSucceeds=true;
assert.equal(await t.forgetMemories(['deleted']),false);
assert.equal(t.memoryState.busy,false);
assert.equal(a.momentsSettings.forgottenPostIds,undefined);
throws=false;
assert.equal(await t.forgetMemories(['deleted','live']),true);
assert.equal(t.memoryRows().length,0);
assert.doesNotMatch(sandbox.Moments.promptForCharacter('a'),/只看没有回复的秘密|已删除的旧动态/);
assert.doesNotMatch(JSON.stringify(t.recentContextFor('char:a')),/只看没有回复的秘密|已删除的旧动态/);
assert.deepEqual(Array.from(a.history),[ordinary,nickname],'only targeted dynamic narration is removed');
assert.equal(JSON.stringify(b),bBefore,'other characters are unchanged');
assert.match(sandbox.Moments.promptForCharacter('b'),/只看没有回复的秘密|已删除的旧动态/);
assert.ok(db.moments.posts.includes(post));
assert.equal(post.seenBy['char:a'],1,'keep view marker so automatic scheduling does not immediately replay');
assert.equal((await t.applyActorAction('char:a',{type:'view',postId:post.id})).ok,false);
assert.equal(t.addComment(post,'char:a','过期回复'),null);
await t.deliverActivity(viewed);
assert.deepEqual(Array.from(a.history),[ordinary,nickname],'late delivery cannot restore narration');
assert.ok(!t.recordActivity('delete','user',post,'',['char:a','char:b']).knownTo.includes('char:a'));
db.characters[0]=structuredClone(savedCharacter);
assert.doesNotMatch(sandbox.Moments.promptForCharacter('a'),/只看没有回复的秘密|已删除的旧动态/,'forgetting survives reload');
// New post IDs are independent, even if the text is the same.
const repost={...post,id:'repost'};db.moments.posts.push(repost);
assert.match(sandbox.Moments.promptForCharacter('a'),/只看没有回复的秘密/);
assert.deepEqual(Array.from(t.memoryRows(),r=>r.postId),['repost']);
// A view already waiting for the API must not add comments after forgetting.
let resolveAi;
ai=()=>new Promise(resolve=>{resolveAi=resolve;});
const inFlight=t.viewPostForActor('repost','char:a');
for(let i=0;i<20&&!resolveAi;i++)await Promise.resolve();
assert.equal(typeof resolveAi,'function', JSON.stringify(repost.viewResults));
assert.equal(await t.forgetMemories(['repost']),true);
resolveAi(JSON.stringify({like:true,comment:'不应写入',thought:'旧观看结果'}));
await inFlight;
assert.equal(repost.comments.length,0);
assert.equal(repost.likes.length,0);
assert.doesNotMatch(sandbox.Moments.promptForCharacter('a'),/只看没有回复的秘密/);
// Search text and imported event text must be escaped in the management screen.
const unsafe=t.recordActivity('view','char:b',{...post,id:'unsafe',text:'<img src=x onerror=alert(1)>'});
t.memoryState.actorId='char:b'; t.renderMemory();
assert.ok(unsafe);
assert.match(element('moments-memory-list').innerHTML,/&lt;img/);
assert.doesNotMatch(element('moments-memory-list').innerHTML,/<img src=x/);
db.characters=[];t.renderMemory();
assert.match(element('moments-memory-list').innerHTML,/还没有聊天角色/);
assert.equal(element('moments-memory-clear-all').disabled,true);
console.log('Moments memory: viewed-only and deleted posts, search, cancellation, rollback, character isolation, reload, narration, late replies and escaped content passed.');
