import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
    const storage = new Map();
    const blobs = new Map();
    const audios = [];
    const elements = new Map();
    let sequence = 0;
    class Element {
        value = ''; checked = false; disabled = false; textContent = ''; innerHTML = ''; options = [];
        style = {}; classList = { add() {}, remove() {}, toggle() {} };
        appendChild(item) { this.options.push(item); }
        addEventListener() {} dispatchEvent() {} querySelectorAll() { return []; }
    }
    const context = {
        window: {}, console: { log() {}, warn() {}, error() {} }, Blob, Response, URLSearchParams,
        ArrayBuffer, DataView, Uint8Array, AbortController, DOMException, Event, setTimeout, clearTimeout,
        CustomEvent: class {}, atob: value => Buffer.from(value, 'base64').toString('binary'),
        crypto: { randomUUID: () => 'request-id' },
        localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
        URL: class extends URL {
            static createObjectURL(blob) { const url = `blob:tts-${++sequence}`; blobs.set(url, blob); return url; }
            static revokeObjectURL(url) { blobs.delete(url); }
        },
        Audio: class {
            constructor(src) { this.src = src; audios.push(this); }
            play() { return context.failPlay ? Promise.reject(new Error('play blocked')) : Promise.resolve(); }
            pause() {}
        },
        document: {
            readyState: 'loading', addEventListener() {}, dispatchEvent() {},
            getElementById: id => elements.get(id) || null,
            querySelectorAll: () => [], createElement: () => new Element()
        },
        db: { characters: [{ id: 'chat', ttsConfig: { voiceId: 'female-shaonv', customVoiceId: 'old-clone', speed: 1.8, chatTtsEnabled: true } }], ttsPresets: [] },
        currentChatId: 'chat', saveData: async () => {}, saveGlobalSettings: async () => {},
        showToast: message => context.toasts.push(message), toasts: [], prompt: () => 'saved',
        fetch: async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/mpeg' } })
    };
    vm.createContext(context);
    for (const file of ['js/core/file-download.js', 'js/modules/tts_service.js', 'js/modules/voice_selector.js', 'js/modules/tts_settings.js', 'js/settings/tts-settings.js']) {
        vm.runInContext(read(file), context, { filename: file });
    }
    const service = context.window.TTSService;
    const selector = context.window.VoiceSelector;
    context.VoiceSelector = selector;
    const settings = context.window.TTSSettings;
    const element = (id, value = '') => { const el = new Element(); el.value = value; elements.set(id, el); return el; };
    const eleven = { ...service.config, provider: 'elevenlabs', enabled: true, elevenApiKey: 'eleven-secret', elevenVoiceId: 'eleven-voice' };
    return { context, service, selector, settings, storage, blobs, audios, elements, element, eleven };
}

// Official and historical MiniMax configurations retain their endpoint, model and optional GroupId.
{
    const { service, context, storage } = fixture();
    assert.equal(context.window.MinimaxTTSService, service);
    storage.set('minimax_tts_config', JSON.stringify({ enabled: true, domain: 'api.minimaxi.chat', model: 'speech-02-hd', apiKey: 'old-key', groupId: 'old-group' }));
    service.loadConfig();
    let request;
    context.fetch = async (url, options) => { request = { url, options }; return new Response(JSON.stringify({ data: { audio: '010203' }, base_resp: { status_code: 0 } })); };
    await service.synthesize('你好', 'female-shaonv', 'zh');
    assert.equal(request.url, 'https://api.minimaxi.chat/v1/t2a_v2?GroupId=old-group');
    assert.equal(JSON.parse(request.options.body).model, 'speech-02-hd');
    assert.equal(JSON.parse(request.options.body).language_boost, 'Chinese');
    service.saveConfig({ domain: 'api.minimax.cn', model: 'speech-2.8-hd', groupId: '' });
    assert.equal(service.isConfigured(), true);
    await service.synthesize('你好', 'female-shaonv', 'zh');
    assert.equal(request.url, 'https://api.minimax.cn/v1/t2a_v2');
    assert.equal(service.cleanText('你好(laughs)（旁白）[系统]'), '你好(laughs)');
}

// ElevenLabs returns binary audio, uses its own key/voice and clamps only its own speed range.
{
    const { service, context, eleven, blobs } = fixture();
    service.saveConfig(eleven);
    let request; let count = 0;
    context.fetch = async (url, options) => { count++; request = { url, options }; return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/mpeg' } }); };
    const url = await service.synthesize('你好', 'female-shaonv', 'zh', { speed: 2 });
    assert.match(request.url, /\/v1\/text-to-speech\/eleven-voice\?output_format=mp3_44100_128$/);
    assert.equal(request.options.headers['xi-api-key'], 'eleven-secret');
    const body = JSON.parse(request.options.body);
    assert.equal(body.voice_settings.speed, 1.2);
    assert.equal(body.language_code, undefined);
    assert.deepEqual([...new Uint8Array(await blobs.get(url).arrayBuffer())], [1, 2, 3]);
    assert.equal(await service.synthesize('你好', 'female-shaonv', 'zh', { speed: 2 }), url);
    assert.equal(count, 1);
    service.saveConfig({ elevenModel: 'eleven_v3' });
    await service.synthesize('你好', 'female-shaonv', 'zh', { speed: 2 });
    assert.equal(count, 2);
    assert.equal(JSON.parse(request.options.body).language_code, 'zh');
    assert.equal(service.cleanText('[whispers]你好（旁白）[系统]'), '[whispers]你好');
    assert.equal(service._elevenBaseUrl({ elevenUrl: 'https://proxy.test/prefix/v1/' }), 'https://proxy.test/prefix');
    assert.throws(() => service._elevenBaseUrl({ elevenUrl: 'javascript:alert(1)' }), /无效/);
    service.saveConfig({ elevenApiKey: 'new-key' });
    await service.synthesize('你好', 'female-shaonv', 'zh', { speed: 2 });
    assert.equal(count, 3);
    assert.ok([...service.audioCache.keys()].every(key => !key.includes('secret') && !key.includes('new-key')));
}

// The existing Volcengine fallback still joins JSON audio chunks and honors its resource ID.
{
    const { service, context, blobs } = fixture();
    service.saveConfig({ enabled: true, provider: 'volcengine', volcAppId: 'app', volcAccessToken: 'token',
        volcResourceId: 'seed-tts-2.0', volcVoiceType: 'volc-voice' });
    let request;
    context.fetch = async (_url, options) => {
        request = options;
        return new Response(`${JSON.stringify({ code: 0, data: 'AQI=' })}\n${JSON.stringify({ code: 0, data: 'AwQ=' })}\n`, { headers: { 'content-type': 'application/json' } });
    };
    const url = await service.synthesize('你好', 'female-shaonv', 'zh');
    assert.deepEqual([...new Uint8Array(await blobs.get(url).arrayBuffer())], [1, 2, 3, 4]);
    assert.equal(JSON.parse(request.body).req_params.speaker, 'volc-voice');
    assert.equal(request.headers['X-Api-Resource-Id'], 'seed-tts-2.0');
}

// User synthesis works with role synthesis disabled; missing and invalid voices fail before requests.
{
    const { service, context, eleven } = fixture();
    service.saveUserConfig(eleven);
    assert.equal(service.isConfigured(), false);
    let request;
    context.fetch = async (url, options) => { request = options; return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/mpeg' } }); };
    await service.synthesize('用户消息', '', 'auto', { forUser: true });
    assert.equal(request.headers['xi-api-key'], 'eleven-secret');
    service.saveUserConfig({ elevenVoiceId: '' });
    await assert.rejects(service.synthesize('用户消息', '', 'auto', { forUser: true }), /选择.*音色/);
    service.saveConfig({ enabled: true, provider: 'unknown', apiKey: 'key' });
    assert.equal(service.isConfigured(), false);
}

// Repeated clicks share one synthesis; stopping aborts it and cannot start late playback.
{
    const { service, context, eleven, audios } = fixture();
    service.saveConfig(eleven);
    let count = 0;
    context.fetch = (_url, { signal }) => { count++; return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true })); };
    const one = service.synthesize('重复点击', 'eleven-voice');
    const two = service.synthesize('重复点击', 'eleven-voice');
    const play = service.synthesizeAndPlay('重复点击', 'eleven-voice');
    assert.equal(count, 1);
    service.stop();
    const results = await Promise.allSettled([one, two, play]);
    assert.equal(results[0].reason.name, 'AbortError');
    assert.equal(results[1].reason.name, 'AbortError');
    assert.equal(results[2].value, false);
    assert.equal(audios.length, 0);
    assert.equal(service.pendingSynthesis.size, 0);
    assert.equal(service.requestControllers.size, 0);
}

// Replacement and stop settle playback tasks and an old rejection cannot clear a new audio.
{
    const { service, context, eleven, audios } = fixture();
    service.saveConfig(eleven);
    const first = service.synthesizeAndPlay('一', 'eleven-voice');
    await tick();
    service.pause(); assert.equal(service.getPlayState().isPaused, true);
    service.resume(); assert.equal(service.getPlayState().isPaused, false);
    const second = service.synthesizeAndPlay('二', 'eleven-voice');
    await tick();
    await first;
    assert.equal(service.currentAudio, audios[1]);
    service.stop(); await second;
    assert.equal(service.currentAudio, null);
    context.failPlay = true;
    await assert.rejects(service.synthesizeAndPlay('三', 'eleven-voice'), /play blocked/);
    assert.equal(service.getPlayState().isPlaying, false);
}

// A stopped queue cannot drain into a new session; the new queue completes normally.
{
    const { service, eleven, audios } = fixture();
    service.saveConfig(eleven);
    service.synthesizeAndPlayQueued('旧一句', 'eleven-voice');
    service.synthesizeAndPlayQueued('旧二句', 'eleven-voice');
    await tick(); service.stop();
    service.synthesizeAndPlayQueued('新一句', 'eleven-voice');
    await tick();
    assert.equal(audios.length, 2);
    assert.equal(service.isPlaying, true);
    audios[1].onended(); await tick();
    assert.equal(service.isPlaying, false);
    assert.equal(service.playQueue.length, 0);
}

// Errors remain actionable and JSON/empty responses are not cached as audio.
for (const [status, message] of [[401, /Key/], [403, /权限/], [404, /音色/], [429, /受限/], [422, /请求失败/]]) {
    const { service, context, eleven } = fixture();
    service.saveConfig(eleven);
    context.fetch = async () => new Response(JSON.stringify({ detail: { message: 'reason' } }), { status, headers: { 'content-type': 'application/json' } });
    await assert.rejects(service.synthesize('失败测试', 'eleven-voice'), message);
    assert.equal(service.audioCache.size, 0);
}
{
    const { service, context, eleven } = fixture();
    service.saveConfig(eleven);
    context.fetch = async () => new Response('{}', { headers: { 'content-type': 'application/json' } });
    await assert.rejects(service.synthesize('测试', 'eleven-voice'), /有效音频/);
}

// Voice pagination handles duplicates and malformed repeating tokens without looping.
{
    const { service, context, eleven } = fixture();
    let calls = 0;
    context.fetch = async url => {
        calls++;
        if (calls > 1) assert.match(url, /next_page_token=next/);
        return new Response(JSON.stringify({ voices: [{ voice_id: 'same', name: '声音' }], has_more: true, next_page_token: 'next' }));
    };
    assert.equal((await service.listElevenLabsVoices(eleven)).length, 1);
    assert.equal(calls, 2);
}

// Role form edits and presets preserve MiniMax voices/speeds alongside ElevenLabs settings.
{
    const { context, service, selector, settings, element, eleven } = fixture();
    service.saveConfig(eleven); service.saveUserConfig(eleven);
    element('setting-custom-voice-id', 'role-eleven'); element('setting-user-custom-voice-id', 'user-eleven');
    element('setting-tts-speed', '0.9'); element('setting-user-tts-speed', '1.1');
    element('setting-tts-language', 'zh'); element('setting-user-tts-language', 'en');
    element('setting-chat-tts-enabled').checked = true;
    await settings.saveChatTTSConfig();
    const tc = context.db.characters[0].ttsConfig;
    assert.equal(tc.customVoiceId, 'old-clone'); assert.equal(tc.speed, 1.8);
    assert.equal(selector.getVoiceConfig('chat').voiceId, 'role-eleven');
    assert.equal(selector.getVoiceConfig('chat', 'user').voiceId, 'user-eleven');
    assert.equal(selector.getVoiceConfig('chat').speed, 0.9);
    service.saveConfig({ provider: 'minimax', enabled: true, apiKey: 'key' });
    assert.equal(selector.getVoiceConfig('chat').voiceId, 'old-clone');
    assert.equal(selector.getVoiceConfig('chat').speed, 1.8);
    vm.runInContext(read('js/settings/general-presets.js'), context);
    vm.runInContext('saveCurrentVoiceAsPreset()', context);
    tc.elevenCustomVoiceId = 'changed';
    vm.runInContext('applyVoicePreset("saved")', context);
    assert.equal(tc.elevenCustomVoiceId, 'role-eleven');
    assert.equal(tc.customVoiceId, 'old-clone');
    assert.equal(selector.escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
}

// API settings and presets round-trip without exposing exported keys.
{
    const { context, service, settings, element, storage, blobs } = fixture();
    element('tts-provider', 'elevenlabs'); element('user-tts-provider', 'minimax');
    element('minimax-tts-enabled').checked = true; element('minimax-user-tts-enabled');
    element('elevenlabs-api-key', 'private-key'); element('elevenlabs-model', 'eleven_v3');
    element('elevenlabs-voice-id', 'saved-voice'); element('elevenlabs-url', 'https://api.elevenlabs.io');
    element('minimax-group-id'); element('minimax-api-key'); element('minimax-domain', 'api.minimax.cn');
    element('minimax-tts-model', 'speech-2.8-hd');
    assert.equal(settings.saveTTSConfig(), true);
    assert.equal(JSON.parse(storage.get('minimax_tts_config')).elevenVoiceId, 'saved-voice');
    vm.runInContext('saveCurrentTTSAsPreset()', context);
    element('elevenlabs-voice-id', 'changed');
    vm.runInContext('applyTTSPreset("saved")', context);
    assert.equal(context.document.getElementById('elevenlabs-voice-id').value, 'saved-voice');
    let exported;
    context.document.createElement = () => ({ click() { exported = blobs.get(this.href); } });
    // Inspect the existing exporter payload; delivery is covered by file-download tests.
    context.OvoFileDownload.save = async blob => { exported = blob; return true; };
    await vm.runInContext('exportTTSPresets()', context);
    const data = JSON.parse(await exported.text());
    assert.equal(data[0].elevenApiKey, ''); assert.equal(data[0].elevenVoiceId, 'saved-voice');
    const previous = service.config;
    context.localStorage.setItem = () => { throw new Error('storage full'); };
    assert.equal(service.saveConfig({ elevenVoiceId: 'lost' }), false);
    assert.equal(service.config, previous);
}

console.log('TTS provider, playback, cancellation, settings and compatibility tests passed.');
