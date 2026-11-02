import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const events = new EventTarget(), notices = [], calls = [];
class AudioStub extends EventTarget {
    constructor() { super(); this.paused = true; this.currentTime = 0; this.duration = 240; this.readyState = 0; this.src = ''; }
    setAttribute() {}
    removeAttribute() { this.src = ''; }
    load() { this.readyState = this.src ? 1 : 0; if (this.src) queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata'))); }
    pause() { const was = this.paused; this.paused = true; if (!was) this.dispatchEvent(new Event('pause')); }
    async play() { this.paused = false; queueMicrotask(() => this.dispatchEvent(new Event('playing'))); }
}
const db = {};
const assets = new Map();
const context = vm.createContext({ console, URL, URLSearchParams, Map, Set, Date, Math, JSON, String, Number, Array, Object, Promise, AbortController, DOMException, Event, CustomEvent, setTimeout, clearTimeout, queueMicrotask, Audio: AudioStub,
    db, document: Object.assign(new EventTarget(), { visibilityState: 'visible' }), navigator: { mediaSession: { setActionHandler() {}, setPositionState() {} } }, MediaMetadata: class { constructor(v) { Object.assign(this, v); } },
    saveGlobalSettings: async () => true, dexieDB: { musicAssets: { get: async id => assets.get(id), bulkPut: async rows => rows.forEach(a => assets.set(a.id, a)) }, globalSettings: { put: async () => {} }, transaction: async (...args) => args.at(-1)() },
    fetch: async url => { calls.push(url); return { ok: true, text: async () => JSON.stringify({ result: { songs: [{ id: 123, name: 'Song', artists: [{ name: 'Singer' }], album: { name: 'Album', picUrl: 'https://example.org/a.jpg' }, duration: 240000 }] }, code: 200 }) }; }
});
context.window = context; context.addEventListener = events.addEventListener.bind(events); context.dispatchEvent = events.dispatchEvent.bind(events); context.showToast = s => notices.push(s);
for (const file of ['core', 'providers', 'library', 'player']) vm.runInContext(fs.readFileSync(path.join(root, `js/modules/music/${file}.js`), 'utf8'), context);
const C = context.OVOMusicCore, P = context.MusicProviders, L = context.MusicLibrary, A = context.MusicPlayer;
assert.equal(A.holdsMedia(), false, 'keep-alive can initialize before the music library');
L.init();
assert.equal(db.musicSettings.theme, 'light');
assert.equal(C.track({ platform: 'unknown', id: '1' }), null);
assert.equal(C.mediaUrl('javascript:alert(1)'), '');
assert.equal(C.mediaUrl('https://user:password@example.org/a'), '');
const a = C.track({ platform: 'netease', id: '123', name: '<script>x</script>', artist: 'Singer', cover: 'javascript:bad' });
assert.equal(a.cover, ''); assert.ok(!C.escape(a.name).includes('<script>'));
const lyrics = C.lrc('[offset:-500]\n[00:01.00][00:02.50]Hello\n[00:04.005]World');
assert.equal(lyrics.length, 3); assert.equal(lyrics[0].time, .5); assert.equal(lyrics[1].time, 2); assert.equal(lyrics[2].time, 3.505);
assert.equal(C.parseLink('https://music.163.com/#/playlist?id=123').id, '123');
assert.equal(C.parseLink('https://y.qq.com/n/ryqq/songDetail/abc123').kind, 'song');
assert.throws(() => C.parseLink('https://example.org/playlist?id=123'));
const normalized = P.normalize({ name: 'Song', artist: 'Singer', url: 'https://api.qijieya.cn/meting/?type=url&id=123', pic: 'https://example.org/a.jpg' }, P.get('qijie-old'), 'netease');
assert.equal(normalized.id, '123'); assert.equal(normalized.key, 'netease:123');
const result = await P.run('search', 'Song', 'netease', { provider: 'jerry', only: true });
assert.equal(result.tracks[0].duration, 240);
L.remember([normalized, C.track({ platform: 'netease', id: '124', name: 'Other', artist: 'Singer' })]);
await L.like(normalized.key); const p = await L.create('List', [normalized.key]); await L.add(p.id, [normalized.key]); assert.equal(p.keys.length, 1);
db.musicSecrets = { yaohu: 'secret-never-export' };
const exported = await L.exportData(); assert.ok(!JSON.stringify(exported).includes('secret-never-export')); assert.ok(!JSON.stringify(exported).includes('type=url'));
const plan = L.previewImport(exported); assert.equal(plan.added, 0); assert.equal(plan.duplicates, 2);
assert.throws(() => L.previewImport({ format: 'other', version: 1, library: { tracks: [] } }));
assert.throws(() => L.previewImport({ ...exported, library: { tracks: [{ id: 'file', platform: 'local' }] }, assets: [{ id: 'file', data: 'data:text/html;base64,abcd' }] }));
await L.commitImport(plan); assert.equal(L.data().playlists.length, 1);
await A.play(normalized.key, { queue: ['netease:123', 'netease:124'] }); assert.equal(A.state.status, 'playing');
A.interrupt('tts', true); assert.equal(A.state.status, 'paused');
A.pause(); A.interrupt('tts', false); await new Promise(r => setTimeout(r, 0)); assert.equal(A.state.status, 'paused', 'manual pause prevents automatic resume');
await A.resume(); assert.equal(A.state.status, 'playing');
A.interrupt('tts', true); A.interrupt('call', true); A.interrupt('tts', false); assert.equal(A.state.status, 'paused');
A.interrupt('call', false); await new Promise(r => setTimeout(r, 0)); assert.equal(A.state.status, 'playing');
A.pause();
console.log('Music: safe metadata, service protocols, LRC, portable import/export, queue playback, and audio focus passed.');
