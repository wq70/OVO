import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z8S8AAAAASUVORK5CYII=';
const imageA = 'data:image/png;base64,' + png;
const imageB = 'data:image/jpeg;base64,' + Buffer.from('reference-B').toString('base64');
const sent = [];
const context = vm.createContext({
    window: {}, document: { getElementById: () => null },
    db: { characters: [], groups: [], imageGenTimeout: 0, autoCompressImage: false },
    console: { log() {}, error() {}, warn() {} },
    crypto: webcrypto, Blob, FormData, Response, Uint8Array, DataView, TextDecoder, TextEncoder,
    AbortController, DOMException, URL, setTimeout, clearTimeout, atob, btoa,
    fetch: async (url, options) => {
        if (url.startsWith('data:')) return fetch(url, options);
        sent.push({ url, options });
        if (url.includes('generateContent')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: png } }] } }] }));
        return new Response(JSON.stringify({ data: [{ b64_json: png }] }), { headers: { 'content-type': 'application/json' } });
    },
    showErrorModal() {}, showToast() {}, showAppConfirmDialog: async () => true,
    getRandomValue: value => value, pad: value => value, formatTimeGap: () => '',
    getLocalTimeInTimezone: () => '', filterHistoryForAI: value => value,
    writeOvoPngMetadata: async value => value, readOvoPngMetadata: () => null,
    saveCharacter: async () => {}, saveGroup: async () => {}, renderMessages() {},
    _naiAutoGenQueue: [], _naiAutoGenProcess() {}, currentChatId: 'B', currentChatType: 'private'
});
for (const file of ['js/core/face-lock.js', 'js/core/novelai-compat.js', 'js/core/api-and-image-utils.js', 'js/modules/chat-render/image-generation.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}
const face = context.window.OvoFaceLock;
const a = { id: 'A', avatar: imageA, myAvatar: imageB, gptArtistPrompt: 'style-A', imageFaceLock: { enabled: true, referenceImage: imageA }, history: [{ id: 'a-msg', role: 'assistant' }, { id: 'user-portrait', role: 'assistant' }] };
const b = { id: 'B', avatar: imageB, gptArtistPrompt: 'style-B', imageFaceLock: { enabled: true, referenceImage: imageB }, history: [{ id: 'b-msg', role: 'assistant' }] };
context.db.characters = [a, b];
context.db.gptImageSettings = { enabled: true, url: 'https://gpt.test/v1/images/generations', key: 'original-key', model: 'gpt-image-2', size: '512x512' };
context.db.googleImageSettings = { enabled: true, key: 'google-key', model: 'gemini-3.1-flash-image' };
context.db.activeImageProvider = 'gpt';

assert.equal(face.parsePrompt('selfie, ovo_subject_self').subject, 'self');
assert.equal(face.parsePrompt('selfie, ovo_subject_self').prompt, 'selfie');
assert.equal(face.parsePrompt('selfie, ovo_subject_self, smiling').prompt, 'selfie,  smiling');
assert.equal(face.parsePrompt('portrait, OVO_SUBJECT_USER').subject, 'user');
assert.equal(face.parsePrompt('portrait, OVO_SUBJECT_USER').prompt, 'portrait');
assert.match(face.subjectInstruction(true), /ovo_subject_user/);
assert.doesNotMatch(face.subjectInstruction(), /ovo_subject_user/);
for (const prompt of ['a landscape', 'a cat, ovo_subject_other', 'group photo, ovo_subject_self, ovo_subject_other', 'group photo, ovo_subject_self, ovo_subject_user']) {
    assert.equal(face.parsePrompt(prompt).subject, 'other', 'unknown, scenery and contradictory subjects must not borrow a face');
    assert.equal(face.capture(a, face.parsePrompt(prompt).subject).settings._faceLock, undefined);
}
assert.equal(face.capture(null, 'self').settings._faceLock, undefined);
assert.equal(face.messageCharacter(a, 'private', { role: 'user' }), null);
const group = { id: 'G', members: [{ id: 'member_A', originalCharId: 'A' }], history: [{ id: 'group-msg', role: 'assistant', senderId: 'member_A' }] };
context.db.groups.push(group);
assert.equal(face.messageCharacter(group, 'group', group.history[0]).id, 'A');
assert.equal(face.messageCharacter(group, 'group', { role: 'assistant', senderId: 'missing' }), null);

// 两个开关独立，USER 默认取自己的头像，只有保存后才影响生成。
const controls = new Map();
for (const prefix of ['setting-face-lock-', 'setting-user-face-lock-']) {
    for (const suffix of ['enabled', 'reference', 'preview', 'empty', 'change', 'status', 'file', 'source']) {
        controls.set(prefix + suffix, { removeAttribute() {} });
    }
}
context.document.getElementById = id => controls.get(id);
context.compressImage = async () => imageB;
face.loadSettings(a);
const userToggle = controls.get('setting-user-face-lock-enabled');
assert.equal(userToggle.checked, false);
userToggle.checked = true;
await userToggle.onchange();
assert.equal(controls.get('setting-user-face-lock-preview').src, imageB);
assert.equal(controls.get('setting-face-lock-preview').src, imageA);
assert.equal(face.capture(a, 'user').settings._faceLock, undefined);
face.saveSettings(a);
assert.equal(a.userImageFaceLock.referenceImage, imageB);
assert.equal(face.capture(b, 'user').settings._faceLock, undefined);

// 实际排队后切换界面、模型、密钥和参考图；两个任务仍各用自己的排队快照。
context.window._scheduleBackgroundNaiGen('a-msg', 'A', 'private', '自拍{{selfie, ovo_subject_self}}');
context.window._scheduleBackgroundNaiGen('b-msg', 'B', 'private', '自拍{{selfie, ovo_subject_self}}');
context.window._scheduleBackgroundNaiGen('user-portrait', 'A', 'private', '你的单人照{{portrait, ovo_subject_user}}');
context.window._scheduleBackgroundNaiGen('group-msg', 'G', 'group', '你的单人照{{portrait, ovo_subject_user}}');
a.imageFaceLock.referenceImage = imageB;
a.userImageFaceLock.referenceImage = imageA;
a.gptArtistPrompt = 'changed-style';
context.db.gptImageSettings.key = 'changed-key';
context.db.gptImageSettings.model = 'dall-e-3';
context.db.activeImageProvider = 'google';
for (const task of context._naiAutoGenQueue.splice(0)) await task();
assert.equal(sent.length, 4);
for (const request of sent.slice(0, 3)) {
    assert.equal(request.url, 'https://gpt.test/v1/images/edits', 'full configured generation URLs must route to edits for references');
    assert.equal(request.options.headers.Authorization, 'Bearer original-key');
    assert.equal(request.options.body.get('model'), 'gpt-image-2');
    assert.equal(request.options.body.get('size'), 'auto', 'legacy small image dimensions must remain usable');
    assert.equal(request.options.body.get('input_fidelity'), null, 'models with native high fidelity must not receive unsupported parameters');
    assert.doesNotMatch(request.options.body.get('prompt'), /ovo_subject_|changed-style/);
}
assert.equal(await sent[0].options.body.get('image').text(), Buffer.from(png, 'base64').toString());
assert.equal(await sent[1].options.body.get('image').text(), 'reference-B');
assert.equal(await sent[2].options.body.get('image').text(), 'reference-B');
assert.equal(sent[3].url, 'https://gpt.test/v1/images/generations', 'group messages must not borrow a private USER reference');
assert.doesNotMatch(JSON.parse(sent[3].options.body).prompt, /ovo_subject_/);
assert.match(sent[0].options.body.get('prompt'), /style-A/);
assert.match(sent[1].options.body.get('prompt'), /style-B/);
assert.equal(a.history[0].imageGenerationMeta.faceLock.characterId, 'A');
assert.equal(b.history[0].imageGenerationMeta.faceLock.characterId, 'B');
assert.equal(a.history[1].imageGenerationMeta.faceLock.subject, 'user');
assert.equal(group.history[0].imageGenerationMeta.faceLock, null);
assert.equal(JSON.parse(JSON.stringify(a)).imageFaceLock.referenceImage, imageB, 'ordinary character serialization retains the reference');

// Google 输入必须实际携带图片，返回数据保留人物参考使用信息。
a.imageFaceLock.referenceImage = imageA;
let result = await context.generateImageDispatch('portrait on a beach', null, face.capture(a, 'self', 'google'));
let body = JSON.parse(sent.at(-1).options.body);
assert.equal(body.contents[0].parts[1].inlineData.data, png);
assert.equal(result.faceLock.characterId, 'A');
await context.generateImageDispatch('a landscape', null, face.capture(a, 'other', 'google'));
assert.equal(JSON.parse(sent.at(-1).options.body).contents[0].parts.length, 1);

// NovelAI 只覆盖本次请求；原有全局参考和 VIBE 都仍可独立使用。
context.db.novelAiSettings = { enabled: true, authMode: 'none', model: 'nai-diffusion-4-5-full', resolution: '832x1216' };
context.db.novelAiVibeSettings = { enabled: true, activeGroupId: 'old-group' };
context.db.novelAiPreciseReferenceSettings = { enabled: true, items: [{ assetId: 'old-reference' }] };
const beforeGlobal = JSON.stringify([context.db.novelAiVibeSettings, context.db.novelAiPreciseReferenceSettings]);
context.window.NovelAiCompat.fitImage = async data => data.replace(/^data:[^,]+,/, '');
let vibeCalls = 0;
let preciseCalls = 0;
context.window.NovelAiVibe = {
    modelFamily: context.window.NovelAiCompat.family,
    resolveForGeneration: async () => { vibeCalls++; return { images: ['legacy-vibe'], strengths: [0.4], information: [1] }; },
    resolvePreciseReferences: async () => { preciseCalls++; return { images: [], strengths: [], fidelity: [], descriptions: [] }; }
};
result = await context.generateImageDispatch('1girl, smiling', null, face.capture(a, 'self', 'novelai'));
body = JSON.parse(sent.at(-1).options.body);
assert.equal(body.parameters.director_reference_images[0], png);
assert.equal(body.parameters.director_reference_descriptions[0].caption.base_caption, 'character');
assert.equal(body.parameters.reference_image_multiple, undefined);
assert.equal(result.faceLock.characterId, 'A');
assert.equal(vibeCalls + preciseCalls, 0);
assert.equal(JSON.stringify([context.db.novelAiVibeSettings, context.db.novelAiPreciseReferenceSettings]), beforeGlobal);
assert.equal(result.requestSnapshot.parameters.director_reference_images, undefined, 'diagnostics must not duplicate image data');
a.userImageFaceLock.referenceImage = imageB;
result = await context.generateImageDispatch('portrait of the user', null, face.capture(a, 'user', 'novelai'));
body = JSON.parse(sent.at(-1).options.body);
assert.equal(body.parameters.director_reference_images[0], imageB.split(',')[1]);
assert.equal(result.faceLock.subject, 'user');
assert.equal(vibeCalls + preciseCalls, 0);
await context.generateImageDispatch('a cat', null, face.capture(a, 'other', 'novelai'));
assert.equal(vibeCalls, 1);
assert.equal(preciseCalls, 1);

// 不支持、参考丢失、服务拒绝均明确失败，不花费第二次请求进行静默降级。
const beforeFailures = sent.length;
context.db.stabilityImageSettings = { enabled: true, key: 'stability-key' };
await assert.rejects(context.generateImageDispatch('portrait', null, face.capture(a, 'self', 'stability')), /不支持锁脸/);
await assert.rejects(context.generateImageDispatch('portrait', null, face.capture(a, 'self', 'gpt')), /不支持锁脸/);
a.imageFaceLock.referenceImage = '';
await assert.rejects(context.generateImageDispatch('portrait', null, face.capture(a, 'self', 'google')), /参考图已丢失/);
assert.equal(sent.length, beforeFailures);
a.imageFaceLock.referenceImage = imageA;
context.fetch = async () => { sent.push({ rejected: true }); return new Response(JSON.stringify({ error: { message: 'reference not supported' } }), { status: 400 }); };
await assert.rejects(context.generateImageDispatch('portrait', null, face.capture(a, 'self', 'google')), /reference not supported/);
assert.equal(sent.length, beforeFailures + 1);
assert.equal(a.imageFaceLock.enabled, true);

console.log('Face lock tests passed: reference payloads, queue isolation, subjects, provider errors, global reference preservation and metadata.');
