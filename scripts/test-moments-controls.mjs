import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseFragment } from 'parse5';

// 使用生产模块和 API 请求函数，在隔离数据中验证完整设置与调用链。
let now = 1800000000000;
class TestDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
const nodes = new Map();
class Element {
    constructor(id = '', attrs = {}, tag = '') {
        this.id = id; this.attrs = attrs; this.tag = tag; this.listeners = {}; this.children = []; this.elements = {};
        this.value = attrs.value || ''; this.name = attrs.name || ''; this.checked = 'checked' in attrs; this.disabled = 'disabled' in attrs;
        this.hidden = true; this.dataset = Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-')).map(([k,v]) => [k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v]));
        this.classList = { contains: () => false }; this.style = {}; this.textContent = ''; this._html = '';
    }
    addEventListener(type, handler) { this.listeners[type] = handler; }
    setAttribute() {} focus() {}
    set innerHTML(value) {
        this._html = value; this.children = []; this.elements = {};
        const visit = (p, parent) => {
            for (const c of p.childNodes || []) {
                if (!c.tagName) continue;
                const attrs = Object.fromEntries((c.attrs || []).map(a => [a.name,a.value]));
                const e = new Element(attrs.id, attrs, c.tagName); parent.children.push(e); if (e.id) nodes.set(e.id, e);
                if (e.name) this.elements[e.name] = e;
                visit(c,e);
                if (e.tag === 'select') { const options = e.children.filter(o => o.tag === 'option'); e.value = (options.find(o => 'selected' in o.attrs) || options[0])?.value || ''; }
                if (e.tag === 'textarea') e.value = (c.childNodes || []).filter(n=>n.nodeName==='#text').map(n=>n.value).join('');
            }
        };
        visit(parseFragment(value),this);
    }
    get innerHTML() { return this._html; }
    querySelectorAll(selector) {
        const result = [], attr = selector.match(/\[([^=\]]+)(?:="([^"]*)")?\]/), wantChecked = selector.endsWith(':checked');
        const visit = parent => { for (const c of parent.children) { if (attr && attr[1] in c.attrs && (attr[2]===undefined || c.attrs[attr[1]]===attr[2]) && (!wantChecked || c.checked)) result.push(c); visit(c); } };
        visit(this); return result;
    }
    querySelector(s) { return this.querySelectorAll(s)[0] || null; }
}
function element(id) { if (!nodes.has(id)) nodes.set(id,new Element(id)); return nodes.get(id); }
const db = {
    characters: [
        { id:'a',realName:'甲',persona:'经营花店',history:[],momentsSettings:{ postEnabled:true,storyEnabled:true,browseEnabled:true,interactEnabled:true,contactsEnabled:true } },
        { id:'b',realName:'乙',persona:'朋友',history:[],momentsSettings:{ interactEnabled:true } },
        { id:'fresh',realName:'新角色',history:[] },
        { id:'legacy',realName:'旧角色',history:[],momentsSettings:{postEnabled:false} },
    ],
    apiSettings:{ url:'https://example.invalid',model:'test',key:'test' },
    myPersonaPresets:[{id:'p',name:'我',avatar:''}],activePersonaId:'p',
    moments:{ settings:{interactionVisibility:'all'},contacts:[{id:'npc1',actorId:'npc_x',kind:'npc',ownerCharId:'a',name:'人脉',persona:'朋友',enabled:true,mayInteract:true,mayPost:true}],posts:[],groups:[],notifications:[],friendRequests:[],activityEvents:[] },
};
let requests = 0, response = { action:'none' }, saveSucceeds = true, pendingResponse, failRequests = 0;
const sandbox = {
    db, Date:TestDate, Intl, Math, console, AbortController,
    document:{ getElementById:element,querySelectorAll:()=>[],addEventListener() {},visibilityState:'visible' },
    setTimeout:()=>1,clearTimeout(){}, setInterval(){ throw Error('固定轮询不应被注册'); },
    saveGlobalSettings:async()=>saveSucceeds,saveCharacter:async()=>saveSucceeds,showToast:message=>{sandbox.toast=message;},switchScreen:id=>{sandbox.screen=id;},
    isApiConfigReady:config=>Boolean(config?.url && config?.model && config?.key),prepareAiProviderRequest:(_s,body,headers,endpoint)=>({body,headers,endpoint,provider:'openai'}),
    extractAiProviderResponse:data=>({content:data.choices[0].message.content}),
    getApiConfigHeaders:()=>({}),getApiConfigEndpoint:()=>'https://example.invalid',RoleApiBindings:{describe:()=>({})},
    fetch:async(_url,options)=>{
        requests++; if(pendingResponse)await pendingResponse(options.signal);
        if (failRequests > 0) { failRequests--; return { ok:false,status:503,text:async()=>'unavailable' }; }
        return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify(response)}}]})};
    },
};
sandbox.window=sandbox;
let controlsSource=fs.readFileSync(new URL('../js/modules/moments-controls.js',import.meta.url),'utf8');
controlsSource=controlsSource.replace('window.MomentsControls={','window.__controlsTest={data,wake,execute,save,readTempo}; window.MomentsControls={');
vm.runInNewContext(controlsSource,sandbox);
const core=fs.readFileSync(new URL('../js/core/api-and-image-utils.js',import.meta.url),'utf8');
vm.runInNewContext(core.slice(0,core.indexOf('async function readStreamResponse')),sandbox);
const momentsSource=fs.readFileSync(new URL('../js/modules/moments.js',import.meta.url),'utf8').replace(/\}\)\(\);\s*$/,'window.__momentsTest={generateReplies,addComment,applyActorAction,generatePost,prepareForChat,sendUserComment,viewPostForActor,interactionContextFor,showResult,state,publish};})();');
vm.runInNewContext(momentsSource,sandbox);
const policy=sandbox.MomentsControls, test=sandbox.__controlsTest, moments=sandbox.__momentsTest;
sandbox.Moments.init();
await test.wake('startup',true);
assert.equal(requests,0,'启动及能力开关不能隐含授权 API 调用');
await sandbox.Moments.prepareForChat(db.characters[0],'看看动态');
assert.equal(requests,0,'聊天前额外判断默认关闭');

// The default flow needs no scheduler or permission setup.
assert.equal(policy.settings().triggers.userPost,true);
assert.equal(policy.localPreferences('char:fresh').postEnabled,undefined,'rendering does not turn inherited defaults into local overrides');
assert.equal(policy.preferences('char:legacy').postEnabled,false,'explicit legacy choices survive the initial render');
test.data().preferences.postEnabled=false;
assert.equal(policy.preferences('char:fresh').postEnabled,false);
test.data().preferences.postEnabled=true;
assert.equal(policy.settings().triggers.timer,false);
policy.open();
let form=element('moments-controls-form');
assert.doesNotMatch(form.innerHTML,/override\.|pairA|copyActor|requests\.|triggers\.|高级|时间窗口|统计周期|轻度|中度|重度|postIntervalMs|次检查|data-tempo-preset/);
assert.match(form.innerHTML,/data-tempo-slider/,'comment pacing remains configurable');
element('moments-tempo-replyDelayMs').value='7';form.oninput({target:element('moments-tempo-replyDelayMs')});
await test.save({preventDefault(){}});
assert.equal(policy.preferences().replyDelayMs,7000);
assert.equal(policy.preferences().conversationRounds,0);
policy.open();form=element('moments-controls-form');
element('moments-tempo-conversationRounds').value='2';form.oninput({target:element('moments-tempo-conversationRounds')});
await test.save({preventDefault(){}});
assert.equal(policy.preferences().conversationRounds,2);
policy.open();element('moments-tempo-conversationRounds').value='0';await test.save({preventDefault(){}});
policy.open();element('moments-tempo-conversationRounds').value='0.5';await test.save({preventDefault(){}});
assert.equal(policy.preferences().conversationRounds,0,'fractional rounds are rejected without changing settings');
policy.open();element('moments-tempo-replyDelayMs').value='-1';await test.save({preventDefault(){}});
assert.equal(policy.preferences().replyDelayMs,7000,'invalid settings retain prior values');

// Individual comment controls stay inside chat settings. Only changed items override.
sandbox.Moments.loadCharacterSettings(db.characters[0]);
assert.match(element('setting-moments-tempo').innerHTML,/跟随全局/);
assert.doesNotMatch(element('setting-moments-tempo').innerHTML,/NPC 回复等待时间|postIntervalMs/);
assert.match(element('setting-moments-tempo').innerHTML,/互相接话轮数/);
element('moments-role-tempo-replyDelayMs-mode').value='custom';element('moments-role-tempo-replyDelayMs').value='13';
element('setting-moments-reply-enabled').value='off';
sandbox.Moments.saveCharacterSettings(db.characters[0]);
assert.equal(policy.preferences('char:a').replyDelayMs,13000);
assert.equal(policy.preferences('char:a').replyEnabled,false);
test.data().preferences.replyDelayMs=9000;
assert.equal(policy.preferences('char:a').replyDelayMs,13000);
assert.equal(policy.preferences('char:b').replyDelayMs,9000);
delete policy.localPreferences('char:a').replyDelayMs;
policy.localPreferences('char:a').replyEnabled=true;

// Chat linkage is on for old data, inherits globally, and has one per-role override.
assert.equal(policy.preferences().chatLinked,true);
assert.equal(sandbox.Moments.isChatLinked('fresh'),true);
assert.equal(policy.localPreferences('char:fresh').chatLinked,undefined);
assert.ok(sandbox.Moments.promptForCharacter('fresh').includes('<visible_moments>'));
policy.open();form=element('moments-controls-form');
const linkSwitch=form.elements['preference.chatLinked'];
assert.equal(linkSwitch.checked,true);
assert.match(form.innerHTML,/聊天关联动态/);
linkSwitch.checked=false;await test.save({preventDefault(){}});
assert.equal(policy.preferences().chatLinked,false);
assert.equal(sandbox.screen,'moments-settings-screen');
assert.equal(sandbox.toast,'动态设置已保存');
assert.equal(sandbox.Moments.promptForCharacter('a'),'');
assert.equal(policy.settings('char:a').actions.post,true,'linkage does not change dynamic participation');
policy.localPreferences('char:fresh').chatLinked=true;
sandbox.Moments.loadCharacterSettings(db.characters[2]);
assert.equal(element('setting-moments-chat-linked').value,'on');
assert.ok(sandbox.Moments.promptForCharacter('fresh').includes('<visible_moments>'));
element('setting-moments-chat-linked').value='inherit';
sandbox.Moments.saveCharacterSettings(db.characters[2]);
assert.equal(policy.localPreferences('char:fresh').chatLinked,undefined);
assert.equal(sandbox.Moments.promptForCharacter('fresh'),'');
policy.open();form=element('moments-controls-form');
assert.equal(form.elements['preference.chatLinked'].checked,false,'reopening retains the global choice');
form.elements['preference.chatLinked'].checked=true;await test.save({preventDefault(){}});
element('setting-moments-chat-linked').value='off';
sandbox.Moments.saveCharacterSettings(db.characters[2]);
assert.equal(sandbox.Moments.promptForCharacter('fresh'),'','a role can opt out of enabled global linkage');
sandbox.Moments.loadCharacterSettings(db.characters[2]);
assert.equal(element('setting-moments-chat-linked').value,'off');
policy.open('char:fresh');await test.save({preventDefault(){}});
assert.equal(policy.localPreferences('char:fresh').chatLinked,false,'other actor controls preserve the hidden override');
policy.open();form=element('moments-controls-form');
form.elements['preference.chatLinked'].checked=false;saveSucceeds=false;
await test.save({preventDefault(){}});saveSucceeds=true;
assert.equal(policy.preferences().chatLinked,true,'failed saving restores the previous global choice');
assert.equal(sandbox.toast,'设置保存失败');
delete policy.localPreferences('char:fresh').chatLinked;

const prompts=[];
sandbox.fetchAiResponse=async(_config,body,_headers,_url,_stream,opts)=>{
    if(opts?.beforeRequest)await opts.beforeRequest();
    prompts.push(body.messages[0].content);requests++;
    if(pendingResponse)await pendingResponse(opts?.signal);
    if(failRequests){failRequests--;throw Error('网络断开');}
    const result=typeof response==='function'?response(body.messages[0].content):response;
    return typeof result==='string'?result:JSON.stringify(result);
};
function newPost(id,audience=['user','char:a','char:b','npc_x']){const p={id,kind:'post',authorId:'user',authorPersonaId:'p',text:'今天有点累，想聊聊',audienceIds:audience,likes:[],comments:[],createdAt:now};db.moments.posts.push(p);return p;}
async function settle(){for(let i=0;i<80;i++){await new Promise(setImmediate);if(!test.data().tasks.some(t=>t.status==='running'))return;}throw Error('tasks did not settle');}
db.myPersonaPresets[0].persona='用户身份设定';db.characters[0].myPersona='我们是相识多年的朋友';
db.characters[0].history=[{role:'user',content:'私聊秘密标记'},{role:'assistant',content:'我记得我们一起去看海'}];
db.characters[0].memoryJournals=[{title:'回忆',content:'共同记忆标记',isFavorited:true}];
db.characters[0].worldBookIds=['world'];db.worldBooks=[{id:'world',content:'角色世界书标记'}];
let post=newPost('auto');post.reminderIds=['char:a'];response={like:true,comment:'我陪你聊聊',replyTo:'',thought:'想陪伴'};
const before=requests;await policy.postEvent(post);await settle();
assert.equal(requests,before+3,'visible roles and NPC view directly without an extra decision request');
assert.equal(post.viewResults.length,3);assert.equal(post.comments.length,3);
assert.ok(post.seenBy['char:a']);assert.ok(post.seenBy['npc_x']);
assert.equal(test.data().tasks.filter(t=>t.type==='view'&&t.postId===post.id&&t.actorIds.includes('char:a')).length,1,'automatic view and reminder merge');
assert.ok(prompts.some(p=>p.includes('用户专门提醒你')));
const rolePrompt=prompts.find(p=>p.includes('私聊秘密标记'));
assert.match(rolePrompt,/用户身份设定|相识多年的朋友/);assert.match(rolePrompt,/共同记忆标记/);assert.match(rolePrompt,/角色世界书标记/);
const npcPrompt=prompts.find(p=>p.includes('你的身份：人脉'));
assert.doesNotMatch(npcPrompt,/私聊秘密标记|共同记忆标记|角色世界书标记/,'NPC does not inherit owner private context or unbound books');

// Closed linkage removes automatic dynamic knowledge in every prompt path, not user conversation.
test.data().preferences.chatLinked=false;
const historySnapshot=JSON.stringify(db.characters[0].history);
const activitySnapshot=JSON.stringify(db.moments.activityEvents);
assert.equal(sandbox.Moments.promptForCharacter('a'),'');
assert.match(moments.interactionContextFor('char:a',post),/私聊秘密标记/,'dynamics still remember private chat');
assert.match(moments.interactionContextFor('char:a',post),/共同记忆标记/,'dynamics still remember shared memories');
assert.equal(JSON.stringify(db.characters[0].history),historySnapshot);
assert.equal(JSON.stringify(db.moments.activityEvents),activitySnapshot);
const promptSandbox={...sandbox,
    getActiveWorldBooksContents:()=>({before:'',middle:'',after:''}),getEffectivePersona:c=>c.persona||'',
    getOnlineLogicRules:()=>'',getOnlineOutputFormats:()=>'',pad:v=>String(v).padStart(2,'0'),
};
promptSandbox.window=promptSandbox;
const uiSource=fs.readFileSync(new URL('../js/core/ui-and-content-utils.js',import.meta.url),'utf8');
const filterStart=uiSource.indexOf('function filterHistoryForAI(');
const filterEnd=uiSource.indexOf('\nfunction ',filterStart+1);
vm.runInNewContext(uiSource.slice(filterStart,filterEnd),promptSandbox);
const userMessage={role:'user',content:'我想聊聊今天的动态'};
const activityMessage={role:'system',content:'自动动态旁白标记',isMomentsActivity:true,excludeFromContext:true};
assert.deepEqual(Array.from(promptSandbox.filterHistoryForAI(db.characters[0],[activityMessage,userMessage]),m=>m.content),[userMessage.content]);
assert.deepEqual(Array.from(promptSandbox.filterHistoryForAI(db.characters[0],[activityMessage,userMessage],true),m=>m.content),[userMessage.content]);
vm.runInNewContext(fs.readFileSync(new URL('../js/modules/chat-ai/private-prompt.js',import.meta.url),'utf8'),promptSandbox);
const character={id:'a',realName:'甲',myName:'我',persona:'经营花店',history:[userMessage],memoryJournals:[]};
const oldMagic=db.magicRoom;
db.magicRoom={};
assert.doesNotMatch(promptSandbox.generatePrivateSystemPrompt(character),/<visible_moments>|MOMENT:/);
db.magicRoom={customPromptEnabled:true,customPromptTemplate:'自定义 {{角色名}} {{动态能力与已看内容}}'};
vm.runInNewContext(fs.readFileSync(new URL('../js/modules/chat-ai/prompt-studio.js',import.meta.url),'utf8'),promptSandbox);
assert.doesNotMatch(promptSandbox.generatePrivateSystemPrompt(character),/<visible_moments>|MOMENT:|\{\{动态能力与已看内容\}\}/);
db.magicRoom={};promptSandbox.PromptStudio=undefined;
character.activeNodeId='node';character.nodes=[{id:'node',name:'剧情节点',prompt:'继续剧情',readMemory:true}];
const actualHistory=db.characters[0].history;db.characters[0].history=[activityMessage,userMessage,{isNodeBoundary:true,nodeAction:'start',nodeId:'node',content:''}];
character.history=db.characters[0].history;
assert.doesNotMatch(promptSandbox.generatePrivateSystemPrompt(character),/<visible_moments>|MOMENT:|自动动态旁白标记/);
delete character.activeNodeId;
const linked={id:'alt',source:'forum',linkedCharId:'a',realName:'小号',history:[],momentsSettings:{preferences:{}}};
db.characters.push(linked);
assert.doesNotMatch(promptSandbox.generatePrivateSystemPrompt(linked),/自动动态旁白标记/);
vm.runInNewContext(fs.readFileSync(new URL('../js/modules/chat-ai/prompt-studio.js',import.meta.url),'utf8'),promptSandbox);
assert.doesNotMatch(promptSandbox.PromptStudio.buildVariables(linked,{} )['关系与功能上下文'],/自动动态旁白标记/);
db.characters.pop();db.characters[0].history=actualHistory;db.magicRoom=oldMagic;
test.data().preferences.chatLinked=true;
assert.match(sandbox.Moments.promptForCharacter('a'),/<visible_moments>/,'turning back on reuses the retained dynamic history');
response={replies:[]};await policy.postEvent(post);await settle();assert.equal(test.data().tasks.filter(t=>t.type==='view'&&t.postId===post.id).length,3,'same publication never schedules duplicate views');assert.equal(post.viewResults.length,3);
for(const task of test.data().tasks)if(task.status==='waiting')task.status='cancelled';response={like:true,comment:'我陪你聊聊',replyTo:'',thought:'想陪伴'};
moments.showResult(post.id);assert.match(element('moments-result-content').innerHTML,/查看返回详情/);assert.doesNotMatch(element('moments-result-content').innerHTML,/过段时间/);

// Viewing does not require the ability to comment; disabled actions get explanations.
for(const key of ['likeEnabled','commentEnabled','replyEnabled'])policy.localPreferences('char:b')[key]=false;
post=newPost('blocked',['user','char:b']);await policy.postEvent(post);await settle();
assert.ok(post.seenBy['char:b']);assert.equal(post.comments.length,0);
assert.equal(post.viewResults[0].status,'blocked');assert.match(post.viewResults[0].summary,/未执行|关闭/);
policy.localPreferences('char:b').watchEnabled=false;
post=newPost('no-watch',['user','char:b']);const noWatch=requests;await policy.postEvent(post);await settle();
assert.equal(requests,noWatch);assert.match(post.viewResults[0].summary,/未观看/);

// Every error appears in the same viewing history; late responses cannot write.
post=newPost('error',['user','char:a']);response='这不是 JSON';await policy.postEvent(post);await settle();
assert.equal(post.viewResults[0].status,'error');assert.match(post.viewResults[0].summary,/JSON/);
assert.equal(post.seenBy,undefined);
response={like:false,comment:'迟到回复'};post=newPost('late',['user','char:a']);
let release;pendingResponse=()=>new Promise(resolve=>{release=resolve;});
await policy.postEvent(post);await new Promise(setImmediate);
post.revision=1;release();pendingResponse=null;await settle();
assert.equal(post.comments.length,0);assert.equal(post.viewResults[0].status,'cancelled');

// Comment pacing is per actor, not delayed by the slowest NPC.
policy.localPreferences('char:b').watchEnabled=true;policy.localPreferences('char:b').replyEnabled=true;
test.data().preferences.replyDelayMs=0;test.data().preferences.npcReplyDelayMs=8000;
post=newPost('discussion');post.seenBy={'char:a':now,'char:b':now,npc_x:now};
const user=moments.addComment(post,'user','你们怎么看？');await policy.commentEvents(post,[user]);
const queued=test.data().tasks.filter(t=>t.commentId===user.id);
assert.equal(queued.length,3);
assert.equal(queued.find(t=>t.actorIds[0]==='char:a').dueAt,now);
assert.equal(queued.find(t=>t.actorIds[0]==='npc_x').dueAt,now+8000);
response={replies:[{actorId:'char:a',text:'我在这里'}]};await test.execute(queued.find(t=>t.actorIds[0]==='char:a'));
assert.equal(post.comments.filter(c=>c.replyTo===user.id&&c.authorId==='char:a').length,1);
assert.equal((await moments.applyActorAction('char:b',{type:'like',postId:post.id})).ok,false);

// NPCs without legacy flags inherit global reply participation.
const npc=db.moments.contacts[0];delete npc.preferences;delete npc.mayInteract;delete npc.mayPost;
post=newPost('npc-inherit');post.seenBy={npc_x:now};
const npcUser=moments.addComment(post,'user','聊一下？');await policy.commentEvents(post,[npcUser]);
assert.ok(test.data().tasks.some(t=>t.commentId===npcUser.id&&t.actorIds[0]==='npc_x'));

db.moments.contacts.push({id:'new-npc',actorId:'npc_new',kind:'npc',ownerCharId:'a',enabled:true,preferences:{},mayInteract:false,mayPost:false});
assert.equal(policy.preferences('npc_new').replyEnabled,true,'new NPCs follow global settings even when compatibility flags are present');
assert.equal(policy.preferences('npc_new').postEnabled,true);

// Permissions and Story expiry are checked before requesting and after responses.
post=newPost('hidden',['user','char:a']);const hiddenTask={...policy.context('userPost',['char:a'],post),type:'view'};
post.audienceIds=['user'];const hiddenRequests=requests;await test.execute(hiddenTask);assert.equal(requests,hiddenRequests);assert.equal(hiddenTask.status,'cancelled');
post=newPost('expired',['user','char:a']);post.kind='story';post.expiresAt=now-1;
assert.equal(policy.valid(policy.context('userPost',['char:a'],post)),false);
for(const task of test.data().tasks)if(task.status==='waiting')task.status='cancelled';
post=newPost('save-fail',['user','char:a']);saveSucceeds=false;const saveRequests=requests;await policy.postEvent(post);saveSucceeds=true;
assert.equal(requests,saveRequests);assert.equal(post.viewResults[0].status,'error');assert.equal(post.seenBy,undefined);

for(const task of test.data().tasks)if(task.status==='waiting')task.status='cancelled';
// Added reminders immediately revisit even an already viewed post, once per edit.
post=newPost('remind-edit',['user','char:a']);post.seenBy={'char:a':now};post.revision=1;post.reminderIds=['char:a'];response={like:false,comment:'',thought:'收到提醒'};
const reminderRequests=requests;await policy.postEvent(post,{actorIds:['char:a'],reminderIds:['char:a']});await settle();
assert.equal(requests,reminderRequests+1);assert.equal(post.viewResults[0].reminded,true);
await policy.postEvent(post,{actorIds:['char:a'],reminderIds:['char:a']});await settle();assert.equal(requests,reminderRequests+1);

// Many participants do not multiply replies into a branching request storm.
for(const task of test.data().tasks)if(task.status==='waiting')task.status='cancelled';
test.data().preferences.replyDelayMs=0;test.data().preferences.npcReplyDelayMs=0;test.data().preferences.conversationRounds=3;
policy.localPreferences('char:b').commentEnabled=true;
post=newPost('rounds');post.seenBy={'char:a':now,'char:b':now,npc_x:now};
const roundUser=moments.addComment(post,'user','大家一起来聊聊');await policy.commentEvents(post,[roundUser]);
response=prompt=>{const actor=prompt.includes('你的身份：甲')?'char:a':prompt.includes('你的身份：乙')?'char:b':'npc_x';return {replies:[{actorId:actor,text:'我想接话'}]};};
let turns=0;
while(test.data().tasks.some(t=>t.postId===post.id&&t.status==='waiting')){
    const task=test.data().tasks.find(t=>t.postId===post.id&&t.status==='waiting');await test.execute(task);assert.ok(++turns<40,'reply loop must terminate');
}
const replies=post.comments.filter(c=>c.authorId!=='user');assert.ok(replies.length>3);assert.ok(replies.length<=12,'one user reply plus at most three AI rounds per participant');
for(const actor of ['char:a','char:b','npc_x'])for(let round=0;round<=3;round++)assert.ok(replies.filter(c=>c.authorId===actor&&c.generationRound===round).length<=1);
const resume=moments.addComment(post,'user','继续说吧',roundUser.id);await policy.commentEvents(post,[resume]);
assert.equal(test.data().tasks.filter(t=>t.commentId===resume.id).length,3,'new user comments reopen the discussion without carrying the old round cap');

// Identity changes do not change the recorded author of old posts.
const author=post.authorPersonaId;db.myPersonaPresets.push({id:'other',name:'另一身份',persona:'另一身份秘密'});db.activePersonaId='other';
assert.equal(post.authorPersonaId,author);
assert.doesNotMatch(moments.interactionContextFor('char:a',post),/另一身份秘密/);
// The actual dynamic generation request also keeps chat context while linkage is off.
test.data().preferences.chatLinked=false;
// The longer finite conversation can age the original fixture out of the recent-history slice.
db.characters[0].history.push({role:'user',content:'私聊秘密标记'});
response={text:'花店今天很忙'};
const generationPromptStart=prompts.length;
assert.equal(await sandbox.Moments.generatePost('char:a','post',true),true);
assert.ok(prompts.slice(generationPromptStart).some(prompt=>prompt.includes('私聊秘密标记')));
await settle();
assert.equal(sandbox.Moments.promptForCharacter('a'),'');

// The default UX is one initial comment and one response to each new user comment.
db.activePersonaId='p';
for(const task of test.data().tasks)if(task.status==='waiting')task.status='cancelled';
test.data().preferences.conversationRounds=0;test.data().preferences.replyDelayMs=300000;test.data().preferences.npcReplyDelayMs=300000;
delete policy.localPreferences('char:a').conversationRounds;delete policy.localPreferences('npc_x').conversationRounds;
post=newPost('no-ai-loop',['user','char:a','npc_x']);post.seenBy={'char:a':now,npc_x:now};
const initialNpc=moments.addComment(post,'npc_x','初始评论');await policy.commentEvents(post,[initialNpc]);
assert.equal(test.data().tasks.filter(t=>t.postId===post.id&&t.type==='reply').length,0,'AI comments do not schedule AI replies by default');
for(const source of ['timer','chat','background','view']){
    const denied=await moments.applyActorAction('char:a',{type:'comment',postId:post.id,replyTo:initialNpc.id,text:'继续互相聊'},policy.context(source,['char:a'],post));
    assert.equal(denied.ok,false,source+' cannot bypass the zero-round policy');
}
assert.ok(moments.addComment(post,'char:a','我看到了'));
assert.equal(moments.addComment(post,'char:a','又浏览了一遍，又评论一次'),null);
const directUser=moments.addComment(post,'user','我想问你们一件事',initialNpc.id);await policy.commentEvents(post,[directUser]);
const directTasks=test.data().tasks.filter(t=>t.commentId===directUser.id);
assert.equal(directTasks.length,2);assert.ok(directTasks.every(t=>t.dueAt===now+300000));
await policy.commentEvents(post,[directUser]);assert.equal(test.data().tasks.filter(t=>t.commentId===directUser.id).length,2,'duplicate events do not reset or reopen a discussion');
response=prompt=>({replies:[{actorId:prompt.includes('你的身份：甲')?'char:a':'npc_x',text:'回复用户'}]});
for(const task of directTasks)await test.execute(task);
assert.equal(post.comments.filter(c=>c.replyTo===directUser.id).length,2);
assert.equal(test.data().tasks.filter(t=>t.postId===post.id&&t.source==='aiComment').length,0);
assert.ok(prompts.at(-1).includes('禁止回复角色或 NPC 的评论'));

// Browsing/chat writes share the same finite counter instead of recording every reply as round 1.
test.data().preferences.conversationRounds=2;
post=newPost('direct-finite',['user','char:a','npc_x']);post.seenBy={'char:a':now,npc_x:now};
let parent=moments.addComment(post,'npc_x','开始');
for(const [actor,round] of [['char:a',1],['npc_x',2]]){
    const result=await moments.applyActorAction(actor,{type:'comment',postId:post.id,replyTo:parent.id,text:'有限交流'},policy.context('chat',[actor],post));
    assert.equal(result.ok,true);parent=post.comments.at(-1);assert.equal(parent.generationRound,round);
}
assert.equal((await moments.applyActorAction('char:a',{type:'comment',postId:post.id,replyTo:parent.id,text:'越过上限'},policy.context('timer',['char:a'],post))).ok,false);
const rootComment=post.comments[0];
assert.equal(moments.addComment(post,'char:a','重复本轮',rootComment.id),null);

// Changing the setting while an AI request is running must discard the late response.
for(const task of test.data().tasks)if(task.status==='waiting')task.status='cancelled';
post=newPost('late-setting',['user','char:a','npc_x']);post.seenBy={'char:a':now,npc_x:now};
const lateParent=moments.addComment(post,'npc_x','待回复');await policy.commentEvents(post,[lateParent]);
const lateTask=test.data().tasks.find(t=>t.postId===post.id&&t.actorIds[0]==='char:a');
let releaseSetting;pendingResponse=()=>new Promise(resolve=>{releaseSetting=resolve;});
response={replies:[{actorId:'char:a',text:'设置关闭后不能写入'}]};
const lateExecution=test.execute(lateTask);await new Promise(setImmediate);
test.data().preferences.conversationRounds=0;await policy.reschedule();
assert.equal(lateTask.status,'cancelled');releaseSetting();pendingResponse=null;await lateExecution;
assert.equal(post.comments.length,1);

// Imported legacy settings/tasks are stopped automatically; sixty existing replies remain readable.
post=newPost('legacy-loop',['user','char:a','npc_x']);post.seenBy={'char:a':now,npc_x:now};
const oldUser=moments.addComment(post,'user','旧用户评论');
for(let i=0;i<60;i++)post.comments.push({id:'legacy-reply-'+i,authorId:i%2?'npc_x':'char:a',text:'旧回复 '+i,replyTo:i?'legacy-reply-'+(i-1):oldUser.id,generationRound:1,createdAt:now-i});
const pendingUser=moments.addComment(post,'user','还没得到回复的问题');
const oldAiTask={...policy.context('aiComment',['char:a'],post,post.comments[1]),type:'reply',round:1,status:'waiting',dueAt:now+300000};
const oldRunning={...oldAiTask,id:'legacy-running',status:'running'};
const oldUserTask={...policy.context('userComment',['char:a'],post,pendingUser),type:'reply',round:1,status:'waiting',dueAt:now+300000,discussionGeneration:0};
const oldComments=JSON.stringify(post.comments);
db.characters[0].momentsSettings.preferences={postIntervalMs:240*60000,replyDelayMs:300000,conversationRounds:1,likeEnabled:false};
db.moments.controls={preferences:{...test.data().preferences,conversationRounds:3},tasks:[oldAiTask,oldRunning,oldUserTask],schedules:{},requests:[],publications:[]};
assert.equal(policy.preferences().conversationRounds,0);assert.equal(policy.preferences('char:a').conversationRounds,0);assert.equal(policy.preferences('npc_x').conversationRounds,0);
assert.equal(policy.preferences('char:a').postIntervalMs,240*60000);assert.equal(policy.preferences('char:a').replyDelayMs,300000);assert.equal(policy.preferences('char:a').likeEnabled,false);
assert.equal(oldAiTask.status,'cancelled');assert.equal(oldRunning.status,'cancelled');assert.equal(policy.valid(oldRunning),false);
assert.equal(oldUserTask.status,'waiting');assert.equal(JSON.stringify(post.comments),oldComments,'migration never deletes or rewrites comment history');
assert.equal(moments.addComment(post,'char:a','重新开一串评论'),null,'legacy replies also count as already commenting on the post');
await test.execute(oldUserTask);assert.equal(post.comments.filter(c=>c.replyTo===pendingUser.id).length,1);
const freshUser=moments.addComment(post,'user','更新后新问题',oldUser.id);await policy.commentEvents(post,[freshUser]);
assert.equal(test.data().tasks.filter(t=>t.commentId===freshUser.id).length,2,'new user questions still work on migrated threads');
await policy.commentEvents(post,[oldUser]);assert.equal(test.data().tasks.filter(t=>t.commentId===oldUser.id).length,0,'replaying old events cannot restart the old conversation');
test.data().preferences.conversationRounds=1;policy.localPreferences('char:a').conversationRounds=2;
assert.equal(moments.addComment(post,'char:a','不能把旧回复当成新轮次',post.comments[2].id),null);
assert.equal(policy.preferences('char:a').conversationRounds,2,'completed migration preserves subsequent explicit choices');
await test.wake();assert.equal(policy.preferences('char:a').conversationRounds,2);

// Role and NPC controls retain independent overrides, and returning to inheritance is explicit.
policy.renderActorSettings('char:a');
assert.equal(element('moments-role-tempo-conversationRounds').value,'2');
element('moments-role-tempo-conversationRounds-mode').value='inherit';
element('setting-moments-tempo').onchange({target:element('moments-role-tempo-conversationRounds-mode')});
assert.equal(element('moments-role-tempo-conversationRounds').disabled,true);
assert.equal(Object.hasOwn(policy.readActorSettings('char:a'),'conversationRounds'),false);
policy.open('npc_x');form=element('moments-controls-form');
assert.match(form.innerHTML,/NPC 回复等待时间/);assert.doesNotMatch(form.innerHTML,/角色回复等待时间/);
element('moments-tempo-conversationRounds-mode').value='custom';form.onchange({target:element('moments-tempo-conversationRounds-mode')});
element('moments-tempo-conversationRounds').value='0';await test.save({preventDefault(){}});
assert.equal(policy.preferences('npc_x').conversationRounds,0);assert.equal(policy.preferences('char:a').conversationRounds,2);
// There is no automatic decision request on elapsed time, reopening, or resuming.
for(const task of test.data().tasks)if(task.status==='waiting')task.status='cancelled';
const idleRequests=requests;
now+=24*3600000;await policy.tick();await test.wake();await settle();
assert.equal(requests,idleRequests);
assert.equal(Object.keys(test.data().schedules).length,0);

// Background publishing has its own switch; chat permissions and other activity remain.
test.data().preferences.chatLinked=true;
const role=db.characters[0];role.autoReply={enabled:true};role.momentsSettings.backgroundPostEnabled=false;
assert.match(sandbox.Moments.promptForCharacter('a'),/\[MOMENT:post\]/);
assert.doesNotMatch(sandbox.Moments.promptForCharacter('a',true),/\[MOMENT:(post|story)\]/);
assert.match(sandbox.Moments.promptForCharacter('a',true),/MOMENT:(like|comment)/);
let countBefore=requests;
await sandbox.Moments.consumeAiCommands('[MOMENT:post][MOMENT:story]',role,true);
assert.equal(requests,countBefore,'disabled background posting never sends a generation request');
assert.equal(policy.publicationEnabled('npc_x','post','background'),false,'NPC follows owner background switch');
role.momentsSettings.backgroundPostEnabled=true;
assert.match(sandbox.Moments.promptForCharacter('a',true),/\[MOMENT:post\]/);
role.autoReply.enabled=false;
assert.doesNotMatch(sandbox.Moments.promptForCharacter('a',true),/\[MOMENT:(post|story)\]/);
assert.equal(policy.publicationEnabled('npc_x','post','background'),false);

// Default, custom templates, prompt studio and node prompts receive the request scope.
role.autoReply.enabled=true;role.momentsSettings.backgroundPostEnabled=false;
const savedMagic=db.magicRoom;const savedNode=role.activeNodeId;
promptSandbox.PromptStudio=undefined;db.magicRoom={};
assert.doesNotMatch(promptSandbox.generatePrivateSystemPrompt(role,{isBackground:true}),/\[MOMENT:(post|story)\]/);
assert.match(promptSandbox.generatePrivateSystemPrompt(role),/\[MOMENT:post\]/);
db.magicRoom={customPromptEnabled:true,customPromptTemplate:'自定义 {{动态能力与已看内容}}'};
vm.runInNewContext(fs.readFileSync(new URL('../js/modules/chat-ai/prompt-studio.js',import.meta.url),'utf8'),promptSandbox);
assert.doesNotMatch(promptSandbox.generatePrivateSystemPrompt(role,{isBackground:true}),/\[MOMENT:(post|story)\]/);
assert.match(promptSandbox.generatePrivateSystemPrompt(role),/\[MOMENT:post\]/);
assert.doesNotMatch(promptSandbox.PromptStudio.buildVariables(role,{isBackground:true})['动态能力与已看内容'],/\[MOMENT:(post|story)\]/);
db.magicRoom={};promptSandbox.PromptStudio=undefined;
role.activeNodeId='bg-node';role.nodes=[{id:'bg-node',name:'剧情节点',prompt:'继续剧情',readMemory:false}];
assert.doesNotMatch(promptSandbox.generatePrivateSystemPrompt(role,{isBackground:true}),/\[MOMENT:(post|story)\]/);
if(savedNode===undefined)delete role.activeNodeId;else role.activeNodeId=savedNode;
db.magicRoom=savedMagic;

const requestSource=fs.readFileSync(new URL('../js/modules/chat-ai/request-and-stream.js',import.meta.url),'utf8');
assert.match(requestSource,/generatePrivateSystemPrompt\(chat, \{ isPhoneControlRevokeAttempt, weatherText, isBackground \}\)/);
assert.match(requestSource,/await window\.Moments\.chatEvent\(chat, isBackground, replyTask\?\.id/);

// Saving/reopening the new switch keeps it separate from ordinary publishing.
sandbox.Moments.loadCharacterSettings(role);
assert.equal(element('setting-moments-background-post-enabled').checked,false);
element('setting-moments-background-post-enabled').checked=true;sandbox.Moments.saveCharacterSettings(role);
assert.equal(role.momentsSettings.backgroundPostEnabled,true);
sandbox.Moments.loadCharacterSettings(role);assert.equal(element('setting-moments-background-post-enabled').checked,true);

// API chooses to post, with no arbitrary cooldown between successful chat decisions.
for(const actor of ['char:a','char:b','npc_x','npc_new'])policy.localPreferences(actor).watchEnabled=false;
response={text:'由当前聊天决定分享'};
let postCount=db.moments.posts.length;
await sandbox.Moments.consumeAiCommands('[MOMENT:post]',role,false);
await sandbox.Moments.consumeAiCommands('[MOMENT:post]',role,false);
assert.equal(db.moments.posts.length,postCount+2);
countBefore=requests;await sandbox.Moments.consumeAiCommands('本次只聊天',role,false);
assert.equal(requests,countBefore,'choosing not to post never requests generated content');

// Closing background or ordinary permission during generation discards late content.
let releasePost;pendingResponse=()=>new Promise(resolve=>{releasePost=resolve;});
postCount=db.moments.posts.length;
let generation=sandbox.Moments.consumeAiCommands('[MOMENT:post]',role,true);await new Promise(setImmediate);
role.momentsSettings.backgroundPostEnabled=false;releasePost();pendingResponse=null;await generation;
assert.equal(db.moments.posts.length,postCount);
role.momentsSettings.backgroundPostEnabled=true;
pendingResponse=()=>new Promise(resolve=>{releasePost=resolve;});
generation=sandbox.Moments.consumeAiCommands('[MOMENT:post]',role,false);await new Promise(setImmediate);
policy.localPreferences('char:a').postEnabled=false;releasePost();pendingResponse=null;await generation;
assert.equal(db.moments.posts.length,postCount);
policy.localPreferences('char:a').postEnabled=true;

// NPCs act only on owner chat events, use their own context, and can choose silence.
for(const actor of ['npc_x','npc_new']){const p=policy.localPreferences(actor);p.postEnabled=true;p.storyEnabled=false;p.browseEnabled=false;p.likeEnabled=false;p.commentEnabled=false;p.replyEnabled=false;}
response={action:'none'};countBefore=requests;
await sandbox.Moments.chatEvent(role,false,'owner-turn-1');await settle();
assert.equal(requests,countBefore+2);
await sandbox.Moments.chatEvent(role,false,'owner-turn-1');await settle();
assert.equal(requests,countBefore+2,'same completed owner request does not trigger NPCs twice');
assert.ok(prompts.at(-2).includes('你的身份：人脉'));
assert.doesNotMatch(prompts.at(-2),/私聊秘密标记|共同记忆标记/);
role.autoReply.enabled=false;countBefore=requests;
await sandbox.Moments.chatEvent(role,true,'owner-background-off');await settle();assert.equal(requests,countBefore);
role.autoReply.enabled=true;response=prompt=>prompt.includes('可选择：')?{action:'post'}:{text:'NPC 自己决定分享'};
postCount=db.moments.posts.length;
await sandbox.Moments.chatEvent(role,true,'owner-background-on');await settle();
assert.equal(db.moments.posts.length,postCount+2);
role.momentsSettings.backgroundPostEnabled=false;response={action:'post'};postCount=db.moments.posts.length;
const disabledPromptStart=prompts.length;
await sandbox.Moments.chatEvent(role,true,'owner-background-publish-off');await settle();
assert.equal(db.moments.posts.length,postCount);
assert.ok(prompts.slice(disabledPromptStart).every(prompt=>!prompt.match(/可选择：[^。]*\b(post|story)\b/)));

// Old timer tasks stop while view/user-reply tasks and history survive migration.
const legacyTask={...policy.context('timer',['char:a']),type:'activity',status:'waiting',dueAt:now-1};
const pendingView={...policy.context('userPost',['char:a'],post),type:'view',status:'waiting',dueAt:now+60000};
const savedControls=db.moments.controls;
db.moments.controls={...savedControls,autonomyPolicyVersion:undefined,schedules:{'char:a':{nextAt:now-1}},tasks:[legacyTask,pendingView]};
test.data();assert.equal(legacyTask.status,'cancelled');assert.equal(pendingView.status,'waiting');
assert.equal(Object.keys(test.data().schedules).length,0);
db.moments.controls=savedControls;

// Forgetting a post invalidates queued/in-flight work without pausing other characters.
const memoryTask=policy.context('view',['char:a'],post);
const previouslyForgotten=role.momentsSettings.forgottenPostIds;
role.momentsSettings.forgottenPostIds=[post.id];
assert.equal(policy.valid(memoryTask),false);
assert.equal(policy.commentAllowed(post,'char:a'),false);
assert.ok(!policy.candidates(post,post.comments[0],['char:a']).includes('char:a'));
if(previouslyForgotten===undefined)delete role.momentsSettings.forgottenPostIds;
else role.momentsSettings.forgottenPostIds=previouslyForgotten;

console.log('Moments settings and regressions passed: zero-round defaults, finite replies across all entry points, old-data migration, late-response cancellation, retained history, background publishing, owner-triggered NPCs, overrides, user replies, editing, views, reminders and context.');
