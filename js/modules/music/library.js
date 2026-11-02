(function () {
    'use strict';
    const C = window.OVOMusicCore;
    const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let saving = Promise.resolve();
    function init() {
        db.musicSettings = { theme: 'light', provider: 'qijie', source: 'netease', fallback: true, quality: 320, pauseOnVoice: true, custom: [], ...db.musicSettings };
        if (!['light', 'dark'].includes(db.musicSettings.theme)) db.musicSettings.theme = 'light';
        db.musicLibrary = C.library(db.musicLibrary);
        db.musicSecrets ||= {};
    }
    function save(keys = ['musicLibrary']) {
        const operation = saving.catch(() => {}).then(async () => {
            if (!await saveGlobalSettings(keys)) throw new Error('音乐资料保存失败，请检查设备存储空间');
        });
        saving = operation; return operation;
    }
    const data = () => db.musicLibrary;
    const find = key => data().tracks.find(t => t.key === key);
    function remember(items) {
        const map = new Map(data().tracks.map(t => [t.key, t]));
        items.forEach(v => { const t = C.track(v); if (t) map.set(t.key, { ...map.get(t.key), ...t, cover: t.cover || map.get(t.key)?.cover || '' }); });
        data().tracks = [...map.values()];
        return items.map(t => find(t.key)).filter(Boolean);
    }
    async function like(key) {
        if (!find(key)) return;
        data().liked = data().liked.includes(key) ? data().liked.filter(k => k !== key) : [...data().liked, key]; await save();
    }
    async function create(name, keys = [], description = '') {
        const p = { id: uid(), name: C.text(name, 100).trim() || '我的歌单', keys: [...new Set(keys)].filter(find), description: C.text(description, 1000), cover: '', updatedAt: Date.now() };
        data().playlists.unshift(p); await save(); return p;
    }
    async function add(id, keys) {
        const p = data().playlists.find(p => p.id === id); if (!p) throw new Error('歌单不存在');
        p.keys = [...new Set([...p.keys, ...keys.filter(find)])]; p.updatedAt = Date.now(); await save();
    }
    const reader = file => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('无法读取文件')); r.readAsDataURL(file); });
    const basename = name => name.replace(/\.[^.]+$/, '').toLowerCase();
    async function importFiles(files) {
        const selected = [...files]; const lyrics = new Map(), covers = new Map(); let count = 0;
        for (const file of selected) {
            if (/\.lrc$/i.test(file.name)) { if (file.size > 300000) throw new Error('歌词文件不能超过 300KB'); lyrics.set(basename(file.name), await file.text()); }
            if (/\.(png|jpe?g|webp)$/i.test(file.name)) { if (file.size > 1500000) throw new Error('封面不能超过 1.5MB'); covers.set(basename(file.name), await reader(file)); }
        }
        const assets = [], items = [];
        for (const file of selected.filter(f => /^audio\//i.test(f.type) || /\.(mp3|m4a|wav|ogg|flac|aac|opus)$/i.test(f.name))) {
            if (file.size > 30 * 1024 * 1024) throw new Error(`${file.name} 超过 30MB`);
            const id = uid(), stem = basename(file.name), parts = file.name.replace(/\.[^.]+$/, '').split(' - ');
            let encoded = await reader(file);
            if (encoded.startsWith('data:application/octet-stream') || encoded.startsWith('data:;')) {
                const extension = file.name.split('.').pop().toLowerCase();
                const mime = ({ mp3: 'mpeg', m4a: 'mp4', wav: 'wav', flac: 'flac', ogg: 'ogg', opus: 'ogg', aac: 'aac' })[extension] || 'mpeg';
                encoded = encoded.replace(/^data:[^;]*;/, `data:audio/${mime};`);
            }
            assets.push({ id, data: encoded, name: file.name });
            items.push(C.track({ id, assetId: id, platform: 'local', name: parts.length > 1 ? parts.slice(1).join(' - ') : parts[0], artist: parts.length > 1 ? parts[0] : '本地音乐', cover: covers.get(stem), lyric: lyrics.get(stem) || '' })); count++;
        }
        // A separately selected LRC or cover can be attached to an existing local song.
        const patched = data().tracks.filter(t => t.platform === 'local').map(t => {
            const stem = basename(`${t.artist === '本地音乐' ? '' : t.artist + ' - '}${t.name}`);
            if (!lyrics.has(stem) && !covers.has(stem)) return null;
            return { ...t, ...(lyrics.has(stem) ? { lyric: lyrics.get(stem) } : {}), ...(covers.has(stem) ? { cover: covers.get(stem) } : {}) };
        }).filter(Boolean);
        if (!items.length && !patched.length) throw new Error('请选择音频，或与歌曲同名的歌词／封面文件');
        const next = C.planImport(data(), { tracks: [...items, ...patched] }).library;
        await dexieDB.transaction('rw', dexieDB.musicAssets, dexieDB.globalSettings, async () => {
            if (assets.length) await dexieDB.musicAssets.bulkPut(assets);
            await dexieDB.globalSettings.put({ key: 'musicLibrary', value: next });
        });
        db.musicLibrary = next; return count || patched.length;
    }
    async function exportData(options = {}) {
        const current = C.library(data());
        if (options.playlist) {
            current.playlists = current.playlists.filter(p => p.id === options.playlist);
            const keys = new Set(current.playlists.flatMap(p => p.keys));
            current.tracks = current.tracks.filter(t => keys.has(t.key)); current.liked = []; current.recent = []; current.queue = []; current.current = '';
        }
        // Playback links and service credentials never enter portable music files.
        current.queue = []; current.current = ''; current.position = 0;
        const result = { format: 'ovo-music', version: 1, exportedAt: new Date().toISOString(), library: current, assets: [] };
        if (options.audio) {
            let total = 0;
            for (const t of current.tracks.filter(t => t.platform === 'local')) {
                const asset = await dexieDB.musicAssets.get(t.assetId); if (!asset) continue;
                total += asset.data.length; if (total > 120000000) throw new Error('音频打包超过 120MB，请按歌单分别导出');
                result.assets.push(asset);
            }
        }
        return result;
    }
    function previewImport(value) {
        if (value?.format !== 'ovo-music' || value.version !== 1 || !value.library || !Array.isArray(value.library.tracks)) throw new Error('这不是有效的 OVO 音乐资料文件');
        if (value.library.tracks.length > 30000 || (value.library.playlists || []).length > 1000) throw new Error('音乐资料过大，请分批导入');
        const plan = C.planImport(data(), value.library);
        const local = new Set(plan.library.tracks.filter(t => t.platform === 'local').map(t => t.assetId));
        let bytes = 0;
        plan.assets = (Array.isArray(value.assets) ? value.assets : []).map(a => {
            if (!a || !local.has(a.id) || typeof a.data !== 'string' || !/^data:audio\/[a-z0-9.+-]+(?:;codecs=[a-z0-9.-]+)?;base64,[a-z0-9+/=]+$/i.test(a.data)) throw new Error('导入文件中包含无效音频');
            bytes += a.data.length; if (a.data.length > 45000000 || bytes > 120000000) throw new Error('导入音频超过大小限制');
            return { id: a.id, data: a.data, name: C.text(a.name, 300) };
        });
        return plan;
    }
    async function commitImport(plan) {
        // Recalculate against current data in case playback or a favourite changed during preview.
        const next = C.planImport(data(), plan.library).library;
        await dexieDB.transaction('rw', dexieDB.musicAssets, dexieDB.globalSettings, async () => {
            if (plan.assets.length) await dexieDB.musicAssets.bulkPut(plan.assets);
            await dexieDB.globalSettings.put({ key: 'musicLibrary', value: next });
        });
        db.musicLibrary = next;
    }
    window.MusicLibrary = { init, data, find, remember, save, like, create, add, importFiles, exportData, previewImport, commitImport, uid };
})();
