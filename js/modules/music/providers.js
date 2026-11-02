(function () {
    'use strict';
    const C = window.OVOMusicCore;
    const presets = [
        { id: 'qijie', name: 'Qijieya Enhanced', protocol: 'meting', url: 'https://musicapi.qijieya.cn/meting/', sources: ['netease'] },
        { id: 'qijie-old', name: '祈杰 Meting', protocol: 'meting', url: 'https://api.qijieya.cn/meting/', sources: ['netease', 'tencent'] },
        { id: 'dream', name: 'DreamMeting', protocol: 'meting', url: 'https://music.3e0.cn/', sources: ['netease', 'tencent'], search: false },
        { id: 'jerry', name: 'JerryMusicAPI', protocol: 'netease', url: 'https://music-api.jerrynis.com/api/', sources: ['netease'] },
        { id: 'openmusic', name: 'OpenMusic', protocol: 'openmusic', url: 'https://meting.imlam.com/api', sources: ['netease', 'tencent', 'kugou', 'qishui'] },
        { id: 'gd', name: 'GD Studio', protocol: 'gd', url: 'https://music-api.gdstudio.xyz/api.php', sources: ['netease', 'tencent', 'kuwo', 'kugou', 'joox', 'bilibili'] },
        { id: 'ourcraft', name: 'Ourcraft', protocol: 'ourcraft', url: 'https://scriptnetease.vercel.app/api', sources: ['netease', 'kugou', 'kuwo'] },
        { id: 'yaohu', name: '妖狐酷我', protocol: 'yaohu', url: 'https://api.yaohud.cn/api/music/kuwo', sources: ['kuwo'], key: true },
        { id: 'aiapi', name: 'AIAPI', protocol: 'aiapi', url: 'https://aiapi.vip/v1/', sources: ['netease', 'tencent', 'kuwo', 'kugou'], key: true }
    ];
    const cache = new Map();
    function all() { return [...presets, ...(db.musicSettings?.custom || []).filter(p => p && /^custom-/.test(p.id) && ['meting', 'netease', 'gd', 'openmusic'].includes(p.protocol))]; }
    const get = id => all().find(p => p.id === id) || presets[0];
    function endpoint(p, type, id, source, page = 1) {
        const base = C.mediaUrl(p.url, 'audio'); if (!base) throw new Error('音乐接口地址无效');
        const quality = db.musicSettings?.quality || 320;
        let u = new URL(base), args;
        if (p.protocol === 'netease') {
            const paths = { search: 'search', song: 'song/detail', playlist: 'playlist/detail', url: 'song/url', lrc: 'song/lyric' };
            u = new URL(paths[type], base.replace(/\/?$/, '/'));
            args = type === 'search' ? { keywords: id, limit: 30, offset: (page - 1) * 30 } : { [type === 'song' ? 'ids' : 'id']: id };
        } else if (p.protocol === 'gd') args = { types: type === 'lrc' ? 'lyric' : type, source, ...(type === 'search' ? { name: id, count: 30, pages: page } : { id }), br: quality, size: 500 };
        else if (p.protocol === 'yaohu') args = { action: type === 'search' ? 'so' : 'song', ...(type === 'search' ? { msg: id, g: 30 } : { id }), size: quality >= 740 ? 'lossless' : 'SQ' };
        else if (p.protocol === 'aiapi') {
            u = new URL(({ search: 'search', playlist: 'getMusicList', url: 'musicUrl' })[type] || 'musicUrl', base.replace(/\/?$/, '/'));
            args = { type: ({ netease: 'wy', tencent: 'qq', kuwo: 'kw', kugou: 'kg' })[source], ...(type === 'search' ? { text: id, page, size: 30 } : { id }), info: true };
        } else args = { server: source, type, id, limit: 30, page, br: quality, ...(p.protocol === 'openmusic' ? { quality: quality >= 740 ? 'lossless' : quality <= 128 ? 'standard' : 'exhigh' } : {}), ...(p.protocol === 'ourcraft' ? { json: 1 } : {}) };
        if (p.key) { const key = db.musicSecrets?.[p.id]; if (!key) throw new Error(`${p.name} 需要填写 API Key`); args.key = key; }
        Object.entries(args).forEach(([k, v]) => u.searchParams.set(k, v)); return u.href;
    }
    async function request(url, signal, json = true) {
        const controller = new AbortController();
        const abort = () => controller.abort(signal?.reason);
        if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(() => controller.abort(), 10000);
        try {
            const response = await fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
            if (!response.ok) throw new Error(`接口返回 ${response.status}`);
            const text = await response.text();
            if (text.length > 8000000) throw new Error('接口返回内容过大');
            if (/^\s*</.test(text)) throw new Error('接口返回网页或访问验证，请更换音乐服务');
            if (!json) return text;
            try { return JSON.parse(text); } catch (_) { throw new Error('接口没有返回有效的音乐数据'); }
        } catch (e) {
            if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
            if (e.name === 'AbortError') throw new Error('音乐服务响应超时');
            if (e instanceof TypeError) throw new Error('无法连接音乐服务，可能受网络或跨域限制');
            throw e;
        } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
    }
    function normalize(raw, p, source) {
        const ref = (() => { try { return new URL(raw.url || '', p.url).searchParams.get('id'); } catch (_) { return ''; } })();
        const id = raw.id ?? raw.rid ?? raw.songmid ?? ref;
        const artists = raw.artist ?? raw.artists ?? raw.ar ?? raw.author ?? raw.singer;
        const artist = Array.isArray(artists) ? artists.map(a => typeof a === 'object' ? a.name : a).filter(Boolean).join(' / ') : artists;
        const album = raw.album ?? raw.al;
        return C.track({ id, platform: source, name: raw.name || raw.title || raw.songname, artist, album: typeof album === 'object' ? album?.name : album,
            cover: raw.pic || raw.picture || raw.cover || album?.picUrl || raw.picUrl,
            duration: raw.dt ? raw.dt / 1000 : raw.duration ? (p.protocol === 'netease' ? raw.duration / 1000 : raw.duration) : 0,
            picId: raw.pic_id || id, lyricId: raw.lyric_id || id, provider: p.id });
    }
    function list(data) {
        if (Array.isArray(data)) return data;
        return data?.result?.songs || data?.songs || data?.playlist?.tracks || data?.data?.songs || data?.data?.list || data?.data?.tracks || (Array.isArray(data?.data) ? data.data : []);
    }
    function candidates(source, operation, preferred) {
        const selected = get(preferred || db.musicSettings?.provider);
        let choices = db.musicSettings?.fallback === false ? [selected] : [selected, ...all().filter(p => p.id !== selected.id && !p.key && p.id !== 'jerry')];
        choices = choices.filter(p => (p.sources || []).includes(source) && !(operation === 'search' && p.search === false) && !(p.protocol === 'gd' && ['playlist', 'song'].includes(operation)));
        if (!choices.length) throw new Error('所选音乐服务不支持这个曲库或操作，请切换服务');
        return choices.slice(0, 4);
    }
    async function run(type, id, source, options = {}) {
        const choices = options.only ? [get(options.provider)] : candidates(source, type, options.provider), failures = [];
        for (const p of choices) {
            if (options.signal?.aborted) throw new DOMException('已取消', 'AbortError');
            const url = endpoint(p, type, id, source, options.page || 1);
            const cached = cache.get(url);
            if (cached && cached.until > Date.now() && type !== 'url') return cached.value;
            try {
                let data;
                if (type === 'url' && p.protocol === 'meting') return { url, provider: p.id, quality: '', direct: true };
                data = await request(url, options.signal, type !== 'lrc' || ['netease', 'gd'].includes(p.protocol));
                let value;
                if (type === 'url') {
                    const v = (Array.isArray(data?.data) ? data.data[0] : data?.data) || (Array.isArray(data) ? data[0] : data);
                    const audio = C.mediaUrl(v?.url || v?.vipmusic?.url, 'audio');
                    if (!audio) throw new Error('未获取到播放地址');
                    value = { url: audio, provider: p.id, quality: String(v.quality || v.br || v.bitrate || ''), trial: !!v.freeTrialInfo };
                } else if (type === 'lrc') value = { lyric: typeof data === 'string' ? data : data?.lrc?.lyric || data?.lyric || data?.data?.lyric || '', translation: data?.tlyric?.lyric || data?.tlyric || '' };
                else {
                    const items = list(data).map(r => normalize(r, p, source)).filter(Boolean);
                    if (!items.length) {
                        if (type === 'search' && (data?.code === 200 || Array.isArray(data))) return { tracks: [], provider: p.id, total: 0 };
                        throw new Error(data?.message || data?.msg || '没有获取到歌曲，请检查链接、ID 或音乐服务');
                    }
                    value = { tracks: items, provider: p.id, total: data?.result?.songCount || data?.playlist?.trackCount || items.length, name: C.text(data?.playlist?.name || data?.data?.name || '', 100) };
                }
                if (type !== 'url') { if (cache.size > 100) cache.delete(cache.keys().next().value); cache.set(url, { value, until: Date.now() + 180000 }); }
                return value;
            } catch (e) { if (e.name === 'AbortError') throw e; failures.push(`${p.name}：${e.message}`); }
        }
        throw new Error(failures.join('；').slice(0, 450));
    }
    window.MusicProviders = { presets, all, get, endpoint, normalize, run, candidates, request };
})();
