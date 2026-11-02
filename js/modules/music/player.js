(function () {
    'use strict';
    const C = window.OVOMusicCore, L = window.MusicLibrary, P = window.MusicProviders;
    const state = { status: 'idle', error: '', route: '', quality: '', trial: false, lyric: [], translation: [], lyricText: '', lyricOffset: 0, queueIndex: 0, timer: 0, endAfterSong: false };
    let audio, controller, generation = 0, objectUrl = '', loadedKey = '', history = [], pendingResume = false, lyricController, checkpoint = 0;
    const focus = new Set();
    let keepAliveResume = false;
    function current() { return L.data()?.current ? L.find(L.data().current) : null; }
    function changed() { window.dispatchEvent(new CustomEvent('ovo-music-change')); }
    const store = () => L.save().catch(e => window.showToast?.(e.message));
    function ownMedia() {
        if (!navigator.mediaSession || !current()) return;
        const t = current();
        try {
            if (typeof MediaMetadata !== 'undefined') navigator.mediaSession.metadata = new MediaMetadata({ title: t.name, artist: t.artist, album: t.album, artwork: t.cover ? [{ src: t.cover }] : [] });
            const handlers = { play: () => void resume(), pause, stop: pause, previoustrack: previous, nexttrack: () => next(true), seekto: d => seek(d.seekTime), seekbackward: d => seek(audio.currentTime - (d.seekOffset || 10)), seekforward: d => seek(audio.currentTime + (d.seekOffset || 10)) };
            Object.entries(handlers).forEach(([name, handler]) => { try { navigator.mediaSession.setActionHandler(name, handler); } catch (_) {} });
            navigator.mediaSession.playbackState = audio?.paused ? 'paused' : 'playing';
            if (Number.isFinite(audio?.duration) && audio.duration > 0) navigator.mediaSession.setPositionState?.({ duration: audio.duration, playbackRate: 1, position: Math.min(audio.duration, audio.currentTime) });
        } catch (_) { /* Media controls differ across browsers. */ }
    }
    function acquire() {
        if (typeof KeepAliveModule !== 'undefined') {
            if (KeepAliveModule.audioElement && !KeepAliveModule.audioElement.paused) { keepAliveResume = true; KeepAliveModule.pauseAudio(); }
            KeepAliveModule.clearInitialPlayHandler?.();
        }
        ownMedia();
    }
    function release() {
        if (typeof KeepAliveModule !== 'undefined' && keepAliveResume && db.keepAliveAudioEnabled) {
            keepAliveResume = false; KeepAliveModule.setupMediaSession();
            void KeepAliveModule.playAudio({ silentAutoplayFailure: true });
        }
    }
    function holdsMedia() { return !!current() && ['loading', 'buffering', 'playing', 'paused'].includes(state.status); }
    function init() {
        if (audio) return;
        audio = new Audio(); audio.preload = 'metadata'; audio.setAttribute('playsinline', ''); audio.volume = L.data().volume;
        state.queueIndex = Math.max(0, L.data().queue.indexOf(L.data().current));
        audio.addEventListener('playing', () => { state.status = 'playing'; state.error = ''; acquire(); changed(); });
        audio.addEventListener('waiting', () => { if (!audio.paused) { state.status = 'buffering'; changed(); } });
        audio.addEventListener('error', () => {
            if (['playing', 'buffering'].includes(state.status)) { state.status = 'error'; state.error = '音频连接已中断，请重试或切换线路'; release(); changed(); }
        });
        audio.addEventListener('pause', () => { if (state.status === 'playing' || state.status === 'buffering') state.status = 'paused'; ownMedia(); changed(); });
        audio.addEventListener('timeupdate', () => {
            L.data().position = audio.currentTime || 0;
            if (Date.now() - checkpoint > 10000) { checkpoint = Date.now(); store(); ownMedia(); }
            if (state.timer && Date.now() >= state.timer) { state.timer = 0; pause(); }
            window.dispatchEvent(new CustomEvent('ovo-music-progress'));
        });
        audio.addEventListener('ended', () => { if (state.endAfterSong) { state.endAfterSong = false; pause(); } else next(false); });
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') store(); else { if (state.timer && Date.now() >= state.timer) { state.timer = 0; pause(); } ownMedia(); } });
        window.addEventListener('pagehide', store);
        document.addEventListener('ttsStateChange', e => interrupt('tts', !!e.detail?.isPlaying && !e.detail?.isPaused));
        document.addEventListener('ovo-call-audio', e => interrupt('call', !!e.detail?.active));
    }
    function loadAudio(url, position, token, signal) {
        return new Promise((resolve, reject) => {
            const cleanup = () => { clearTimeout(timer); audio.removeEventListener('loadedmetadata', metadata); audio.removeEventListener('playing', playing); audio.removeEventListener('error', failed); signal.removeEventListener('abort', aborted); };
            const playing = () => { cleanup(); resolve(); };
            const failed = () => { cleanup(); reject(new Error('音频不可用或格式不受支持')); };
            const aborted = () => { cleanup(); reject(new DOMException('已取消', 'AbortError')); };
            const metadata = () => { if (token === generation && position > 0) try { audio.currentTime = Math.min(position, Number.isFinite(audio.duration) ? Math.max(0, audio.duration - 0.1) : position); } catch (_) {} };
            const timer = setTimeout(() => { cleanup(); reject(new Error('音频加载超时')); }, 18000);
            audio.addEventListener('loadedmetadata', metadata); audio.addEventListener('playing', playing); audio.addEventListener('error', failed); signal.addEventListener('abort', aborted, { once: true });
            audio.src = url; audio.load();
            const promise = audio.play();
            promise?.catch(e => { cleanup(); reject(e); });
        });
    }
    async function lyrics(t) {
        lyricController?.abort(); const request = lyricController = new AbortController();
        state.lyric = []; state.translation = []; state.lyricText = ''; changed();
        try {
            const result = t.platform === 'local' ? { lyric: t.lyric || '' } : await P.run('lrc', t.lyricId || t.id, t.platform, { provider: t.provider, signal: request.signal });
            if (request.signal.aborted || current()?.key !== t.key) return;
            state.lyricText = C.text(result.lyric, 150000); state.lyric = C.lrc(state.lyricText); state.translation = C.lrc(result.translation);
        } catch (_) { /* Lyrics never block audio playback. */ }
        if (!request.signal.aborted) changed();
    }
    async function play(key, options = {}) {
        init(); const t = L.find(key); if (!t) return;
        if (current()?.key !== key) options = { ...options, resume: false };
        controller?.abort(); controller = new AbortController(); const signal = controller.signal, token = ++generation;
        if (options.user !== false) { pendingResume = false; history = options.history || (current() && current().key !== key ? [...history.slice(-100), current().key] : history); }
        audio.pause(); audio.removeAttribute('src'); audio.load();
        loadedKey = '';
        if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = ''; }
        L.data().current = t.key; if (!options.resume) L.data().position = 0;
        if (options.queue) L.data().queue = options.queue.filter(k => L.find(k)).slice(0, 5000);
        if (!L.data().queue.includes(key)) L.data().queue.push(key);
        state.queueIndex = options.index ?? L.data().queue.indexOf(key);
        state.status = 'loading'; state.error = ''; changed(); store(); void lyrics(t);
        if (focus.size) { state.status = 'paused'; pendingResume = true; changed(); return; }
        const failures = [];
        let routes;
        try { routes = t.platform === 'local' ? [null] : P.candidates(t.platform, 'url', options.provider || db.musicSettings.provider); }
        catch (e) { state.status = 'error'; state.error = e.message; changed(); return; }
        for (const p of routes) {
            try {
                let result;
                if (!p) {
                    const asset = await dexieDB.musicAssets.get(t.assetId);
                    if (!asset?.data) throw new Error('本地音频未找到，请重新导入对应音频文件');
                    const blob = await (await fetch(asset.data)).blob();
                    if (signal.aborted) return;
                    objectUrl = URL.createObjectURL(blob); result = { url: objectUrl, provider: 'local', quality: '' };
                } else result = await P.run('url', t.id, t.platform, { provider: p.id, only: true, signal });
                if (signal.aborted || token !== generation) return;
                state.route = result.provider; state.quality = result.quality; state.trial = result.trial; state.status = 'loading'; acquire();
                await loadAudio(result.url, options.resume ? L.data().position : 0, token, signal);
                if (signal.aborted || token !== generation) return;
                loadedKey = t.key;
                L.data().recent = [key, ...L.data().recent.filter(k => k !== key)].slice(0, 200); store(); changed(); return;
            } catch (e) {
                if (signal.aborted || token !== generation) return;
                if (e.name === 'NotAllowedError') { state.status = 'paused'; state.error = '浏览器需要你再点击一次播放'; changed(); return; }
                failures.push(`${p?.name || '本地歌曲'}：${e.message}`); audio.pause();
            }
        }
        state.status = 'error'; state.error = failures.join('；').slice(0, 450); release(); changed();
    }
    function pause(manual = true) {
        if (!audio) return;
        if (manual) pendingResume = false;
        controller?.abort(); generation++; audio.pause(); state.status = current() ? 'paused' : 'idle'; L.data().position = audio.currentTime || L.data().position; store(); ownMedia(); changed();
    }
    async function resume() {
        if (!current()) return;
        if (focus.size) { state.error = '请先结束语音或通话'; changed(); return; }
        if (state.status === 'loading') return;
        if (loadedKey === current().key && audio?.src && audio.readyState > 0) {
            try { pendingResume = false; acquire(); await audio.play(); return; } catch (e) { if (e.name === 'NotAllowedError') { state.error = '请再次点击播放'; changed(); return; } }
        }
        await play(current().key, { resume: true });
    }
    function next(manual = true) {
        const d = L.data(); if (!d.queue.length) { pause(); return; }
        let index = state.queueIndex + 1;
        if (!manual && d.mode === 'one') index = state.queueIndex;
        else if (d.mode === 'shuffle' && d.queue.length > 1) { do { index = Math.floor(Math.random() * d.queue.length); } while (index === state.queueIndex); }
        if (index >= d.queue.length) { if (!manual && d.mode === 'order') { pause(); return; } index = 0; }
        void play(d.queue[index], { index });
    }
    function previous() { const previous = history.pop(); if (previous && L.find(previous)) void play(previous, { history }); else { const d = L.data(); const index = Math.max(0, state.queueIndex - 1); if (d.queue[index]) void play(d.queue[index], { index }); } }
    function seek(position) { if (!audio?.src) return; const duration = audio.duration; if (Number.isFinite(duration)) audio.currentTime = Math.max(0, Math.min(duration, Number(position) || 0)); }
    function volume(value) { init(); audio.volume = Math.max(0, Math.min(1, Number(value) || 0)); L.data().volume = audio.volume; store(); }
    function interrupt(reason, active) {
        if (reason === 'tts' && active && db.musicSettings?.pauseOnVoice === false) return;
        if (active) { if (focus.has(reason)) return; focus.add(reason); if (['playing', 'buffering', 'loading'].includes(state.status)) { pendingResume = true; pause(false); } }
        else { focus.delete(reason); if (!focus.size && pendingResume) { pendingResume = false; void resume(); } }
    }
    function syncLibrary() {
        if (!audio || !loadedKey || loadedKey === L.data().current) return;
        controller?.abort(); generation++; pendingResume = false; loadedKey = '';
        audio.pause(); audio.removeAttribute('src'); audio.load();
        if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = ''; }
        state.status = current() ? 'paused' : 'idle'; state.error = ''; state.queueIndex = Math.max(0, L.data().queue.indexOf(L.data().current)); changed();
    }
    window.MusicPlayer = { init, state, current, play, pause, resume, next, previous, seek, volume, lyrics, interrupt, holdsMedia, ownMedia, changed, syncLibrary, get audio() { return audio; } };
})();
