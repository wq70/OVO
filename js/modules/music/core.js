(function () {
    'use strict';
    const platforms = ['netease', 'tencent', 'kuwo', 'kugou', 'qishui', 'joox', 'bilibili', 'local'];
    const text = (v, n = 500) => typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, n) : '';
    function mediaUrl(value, kind = 'image') {
        const s = text(value, typeof value === 'string' && value.startsWith('data:image/') ? 2100000 : 12000).trim();
        if (/^https?:\/\//i.test(s)) {
            try { const u = new URL(s); return u.username || u.password ? '' : u.href; } catch (_) { return ''; }
        }
        if (kind === 'image' && /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(s)) return s;
        return '';
    }
    function track(value) {
        if (!value || typeof value !== 'object' || !platforms.includes(value.platform)) return null;
        const id = text(value.id, 200).trim();
        if (!id || /[\x00-\x1f]/.test(id)) return null;
        return {
            key: `${value.platform}:${id}`, id, platform: value.platform,
            name: text(value.name, 250) || '未命名歌曲', artist: text(value.artist, 400) || '未知歌手',
            album: text(value.album, 250), cover: mediaUrl(value.cover),
            duration: Math.max(0, Math.min(86400, Number(value.duration) || 0)),
            provider: text(value.provider, 100), picId: text(value.picId, 200), lyricId: text(value.lyricId, 200),
            ...(value.platform === 'local' ? { assetId: text(value.assetId, 200) || id } : {}),
            ...(typeof value.lyric === 'string' ? { lyric: value.lyric.slice(0, 150000) } : {})
        };
    }
    function library(raw) {
        raw = raw && typeof raw === 'object' ? raw : {};
        const byKey = new Map();
        (Array.isArray(raw.tracks) ? raw.tracks : []).slice(0, 30000).forEach(v => { const t = track(v); if (t) byKey.set(t.key, t); });
        const keys = list => [...new Set((Array.isArray(list) ? list : []).filter(k => byKey.has(k)))];
        const ids = new Set();
        const playlists = (Array.isArray(raw.playlists) ? raw.playlists : []).slice(0, 1000).map(p => {
            if (!p || !text(p.id, 100) || ids.has(String(p.id))) return null;
            ids.add(String(p.id));
            return { id: text(p.id, 100), name: text(p.name, 100) || '我的歌单', description: text(p.description, 1000), cover: mediaUrl(p.cover), keys: keys(p.keys), updatedAt: Number(p.updatedAt) || Date.now() };
        }).filter(Boolean);
        return { version: 1, tracks: [...byKey.values()], playlists, liked: keys(raw.liked), recent: keys(raw.recent).slice(0, 200), queue: (Array.isArray(raw.queue) ? raw.queue : []).filter(k => byKey.has(k)).slice(0, 5000), current: byKey.has(raw.current) ? raw.current : '', position: Number.isFinite(Number(raw.position)) ? Math.max(0, Math.min(86400, Number(raw.position))) : 0, mode: ['order', 'loop', 'one', 'shuffle'].includes(raw.mode) ? raw.mode : 'order', volume: Number.isFinite(raw.volume) ? Math.max(0, Math.min(1, raw.volume)) : 0.8 };
    }
    function lrc(source) {
        const lines = []; let offset = 0;
        for (const row of text(source, 150000).split(/\r?\n/)) {
            const off = row.match(/\[offset:([+-]?\d+)\]/i); if (off) offset = Number(off[1]) / 1000;
            const matches = [...row.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
            const content = row.replace(/\[[^\]]*\]/g, '').trim();
            for (const m of matches) if (Number(m[2]) < 60) lines.push({ time: Number(m[1]) * 60 + Number(m[2]) + Number(`0.${m[3] || 0}`), text: content });
        }
        return lines.map(v => ({ ...v, time: Math.max(0, v.time + offset) })).sort((a, b) => a.time - b.time);
    }
    function parseLink(input, platform = 'netease', kind = 'playlist') {
        let s = text(input, 3000).trim();
        if (/^[\w-]{1,200}$/.test(s)) return { platform, id: s, kind };
        try {
            const u = new URL(s.match(/https?:\/\/[^\s]+/)?.[0] || s);
            const host = u.hostname.toLowerCase();
            if (host === 'music.163.com' || host.endsWith('.music.163.com')) platform = 'netease';
            else if (host === 'y.qq.com' || host.endsWith('.y.qq.com')) platform = 'tencent';
            else throw new Error();
            const q = new URLSearchParams((u.hash.includes('?') ? u.hash.split('?')[1] : u.search).replace(/^\?/, ''));
            const id = q.get('id') || q.get('disstid') || q.get('songmid') || u.pathname.match(/\/(?:playlist|songDetail|song|album)\/([\w-]+)/)?.[1];
            if (!id || !/^[\w-]{1,200}$/.test(id)) throw new Error();
            return { platform, id, kind: /(?:song|songDetail)/i.test(u.pathname + u.hash) ? 'song' : kind };
        } catch (_) { throw new Error('请填写歌曲／歌单 ID，或网易云、QQ 音乐的完整链接'); }
    }
    function planImport(current, incoming) {
        const clean = library(incoming), merged = library(current), map = new Map(merged.tracks.map(t => [t.key, t]));
        let added = 0;
        clean.tracks.forEach(t => { if (!map.has(t.key)) added++; map.set(t.key, { ...map.get(t.key), ...t }); });
        merged.tracks = [...map.values()]; merged.liked = [...new Set([...merged.liked, ...clean.liked])];
        clean.playlists.forEach(p => { const old = merged.playlists.find(x => x.id === p.id); if (old) { old.keys = [...new Set([...old.keys, ...p.keys])]; } else merged.playlists.push(p); });
        return { library: library(merged), added, duplicates: clean.tracks.length - added, playlists: clean.playlists.length };
    }
    const escape = value => text(value, 150000).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    window.OVOMusicCore = { text, mediaUrl, track, library, lrc, parseLink, planImport, escape, platforms };
})();
