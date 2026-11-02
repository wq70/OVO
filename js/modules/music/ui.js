(function () {
    'use strict';
    const C = window.OVOMusicCore, L = window.MusicLibrary, P = window.MusicProviders, player = window.MusicPlayer, e = C.escape;
    const platforms = { netease: '网易云', tencent: 'QQ 音乐', kuwo: '酷我', kugou: '酷狗', qishui: '汽水音乐', joox: 'JOOX', bilibili: '哔哩哔哩', local: '本地' };
    const paths = {
        home: '<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3z"/>', search: '<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>', library: '<path d="M4 3v18M9 3v18m5-17 6 16M14 4l3-1 6 16-3 1z"/>', back: '<path d="m15 5-7 7 7 7"/>', down: '<path d="m5 9 7 7 7-7"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>', more: '<circle cx="4" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="20" cy="12" r="1"/>', play: '<path d="m8 4 13 8-13 8z" fill="currentColor" stroke="none"/>', pause: '<path d="M7 4h4v16H7zm7 0h4v16h-4z" fill="currentColor" stroke="none"/>', next: '<path d="m4 5 11 7-11 7zM19 5v14"/>', previous: '<path d="m20 5-11 7 11 7zM5 5v14"/>', heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>', check: '<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>', plus: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/>', add: '<path d="M12 4v16M4 12h16"/>', settings: '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3" fill="var(--music-bg)"/><circle cx="16" cy="17" r="3" fill="var(--music-bg)"/>', history: '<path d="M3 5v5h5M3 10a9 9 0 1 1 1 7M12 7v5l3 2"/>', queue: '<path d="M3 5h18M3 11h11M3 17h8m8-7v10m-3-3 3 3 3-3"/>', shuffle: '<path d="m3 5 14 14h4m-4-4 4 4-4 3M3 19l5-5m5-5 4-4h4m-4-3 4 3-4 4"/>', repeat: '<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/>', together: '<path d="M3 14v-3a9 9 0 0 1 18 0v3M3 12h4v8H3zm14 0h4v8h-4z"/>', share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 11 6-4M9 13l6 4"/>', folder: '<path d="M3 6h7l2 3h9v12H3z"/>', download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>', upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4"/>', link: '<path d="m10 13 4-4m-6 6-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 2 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>', moon: '<path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z"/>', music: '<path d="M9 18V5l12-2v13M9 5l12-2"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>', volume: '<path d="M3 9h4l5-5v16l-5-5H3zm13-2a7 7 0 0 1 0 10m3-13a11 11 0 0 1 0 16"/>', timer: '<circle cx="12" cy="14" r="8"/><path d="M9 2h6m-3 0v4m0 3v5l3 2"/>', chat: '<path d="M21 11a9 9 0 0 1-9 9H4l-2 2 1-8a9 9 0 1 1 18-3Z"/>', edit: '<path d="m14 4 6 6M3 21l5-1L22 6l-5-5L3 15z"/>', up: '<path d="m5 15 7-7 7 7"/>', trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>', expand: '<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"/>'
    };
    const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.music}</svg>`;
    const ib = (name, action, label, attrs = '') => `<button type="button" class="sp-icon" data-music-action="${action}" aria-label="${e(label)}" ${attrs}>${icon(name)}</button>`;
    const fallback = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#747b73"/><path d="M130 190V85l80-15v100M130 100l80-15" fill="none" stroke="#eee" stroke-width="12"/><circle cx="110" cy="192" r="23" fill="#eee"/><circle cx="190" cy="173" r="23" fill="#eee"/></svg>');
    const img = (url, cls = '', alt = '') => `<img src="${e(C.mediaUrl(url) || fallback)}" class="${cls}" alt="${e(alt)}" loading="lazy" draggable="false">`;
    const format = value => { const seconds = Math.max(0, Math.floor(value || 0)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
    let root, initialized = false, popular = [], homeLoading = false, homeError = '', searchController, searchToken = 0, importPlan = null, importOnline = null, sheetReturn = null, floating, lastFocus;
    const ui = { page: 'home', list: 'recent', query: '', results: [], pageNumber: 1, more: false, searchLoading: false, searchError: '', filter: 'all', player: false, lyrics: false, translating: true, follow: true, together: null, playlistFirst: '' };
    const $ = s => root.querySelector(s);
    const toast = message => { window.showToast?.(message); if ($('#music-live')) $('#music-live').textContent = message; };
    const tracks = keys => keys.map(L.find).filter(Boolean);
    function avatar(character) { return character?.avatar ? img(character.avatar, 'music-avatar', character.realName || character.name) : `<span class="sp-avatar">${e((character?.realName || character?.name || '我').slice(0, 1))}</span>`; }
    function titleBar(title, buttons = '') { return `<header class="sp-header">${ib('back', 'exit', '返回桌面')}<h1>${e(title)}</h1><div class="sp-header-actions">${buttons}</div></header>`; }
    function coverCard(t) { return `<button type="button" class="sp-album" data-music-key="${e(t.key)}">${img(t.cover, '', t.name)}<strong>${e(t.name)}</strong><small>${e(t.artist)}</small></button>`; }
    function row(t, options = {}) {
        return `<div class="sp-track ${player.current()?.key === t.key ? 'current' : ''}">${img(t.cover)}<button type="button" class="sp-track-name" data-music-key="${e(t.key)}"><strong>${e(t.name)}</strong><small>${e(t.artist)}${t.album ? ' · ' + e(t.album) : ''}${t.platform === 'local' ? ' · 本地' : ''}</small></button>${options.queue ? `${ib('up', 'queue-up', '上移', `data-index="${options.index}"`)}${ib('close', 'queue-remove', '移出队列', `data-index="${options.index}"`)}` : ib('more', 'song-menu', '歌曲操作', `data-key="${e(t.key)}"`)}</div>`;
    }
    const empty = (message, action = '', label = '') => `<div class="music-empty">${icon('music')}<p>${e(message)}</p>${action ? `<button type="button" class="sp-primary" data-music-action="${action}">${e(label)}</button>` : ''}</div>`;
    function listInfo() {
        const d = L.data(), p = d.playlists.find(p => p.id === ui.list);
        return p || { id: ui.list, name: ({ liked: '已点赞的歌曲', recent: '最近播放', local: '本地歌曲', popular: '热播歌曲' })[ui.list] || '音乐', keys: ui.list === 'liked' ? d.liked : ui.list === 'local' ? d.tracks.filter(t => t.platform === 'local').map(t => t.key) : ui.list === 'popular' ? popular.map(t => t.key) : d.recent };
    }
    function renderHome() {
        const d = L.data(), recent = tracks(d.recent), picks = recent.length ? recent : popular;
        const shortcuts = d.playlists.slice(0, 5).map(p => ({ name: p.name, cover: p.cover || L.find(p.keys[0])?.cover, id: p.id }));
        for (const t of picks) if (shortcuts.length < 5) shortcuts.push({ name: t.name, cover: t.cover, key: t.key });
        const hour = new Date().getHours(), greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
        return titleBar(greeting, `${ib('history', 'recent', '最近播放')}${ib(db.musicSettings.theme === 'light' ? 'moon' : 'sun', 'theme', '切换日夜外观')}${ib('settings', 'settings', '音乐设置')}`)
            + `<div class="sp-pills"><button type="button" class="sp-pill ${ui.filter === 'all' ? 'active' : ''}" data-home-filter="all">全部</button><button type="button" class="sp-pill ${ui.filter === 'music' ? 'active' : ''}" data-home-filter="music">音乐</button><button type="button" class="sp-pill ${ui.filter === 'playlists' ? 'active' : ''}" data-home-filter="playlists">歌单</button></div>`
            + `<div class="sp-quick-grid"><button type="button" class="sp-quick" data-music-list="liked"><span class="sp-liked-art">${icon('heart')}</span><strong>已点赞的歌曲</strong></button>${shortcuts.map(s => `<button type="button" class="sp-quick" ${s.key ? `data-music-key="${e(s.key)}"` : `data-music-list="${e(s.id)}"`}>${img(s.cover)}<strong>${e(s.name)}</strong></button>`).join('')}</div>`
            + (ui.filter !== 'playlists' ? `${recent.length ? `<h2 class="sp-section-title">继续收听</h2><div class="sp-shelf">${recent.slice(0, 12).map(coverCard).join('')}</div>` : ''}<h2 class="sp-section-title">热播歌曲</h2>${homeLoading ? '<div class="music-loading" role="status">正在加载歌曲…</div>' : popular.length ? `<div class="sp-shelf">${popular.slice(0, 15).map(coverCard).join('')}</div>` : empty(homeError || '从搜索或导入开始，找到想听的音乐', homeError ? 'reload-home' : 'search', homeError ? '重新加载' : '搜索音乐')}` : '')
            + `<h2 class="sp-section-title">我的歌单</h2>${d.playlists.length ? `<div class="sp-shelf">${d.playlists.map(p => `<button type="button" class="sp-album" data-music-list="${e(p.id)}">${img(p.cover || L.find(p.keys[0])?.cover, '', p.name)}<strong>${e(p.name)}</strong><small>${p.keys.length} 首歌曲</small></button>`).join('')}</div>` : empty('把喜欢的歌放进自己的歌单', 'create', '创建歌单')}`;
    }
    function searchResults() {
        return (ui.searchError ? `<div class="music-error" role="alert">${e(ui.searchError)}<button type="button" class="sp-outline" data-music-action="search-submit">重试</button></div>` : '')
            + (ui.results.length ? `<div class="music-result-heading"><span>歌曲 · ${ui.results.length}</span><button type="button" data-music-action="play-search">播放全部</button></div>${ui.results.map(t => row(t)).join('')}` : ui.searchLoading ? '' : empty(ui.query ? '没有找到相关歌曲' : '输入歌名、歌手或专辑，开始搜索'))
            + (ui.searchLoading ? '<div class="music-loading" role="status">正在搜索…</div>' : ui.more ? '<button type="button" class="sp-outline music-load-more" data-music-action="search-more">加载更多</button>' : '');
    }
    function renderSearch() {
        const sources = P.get(db.musicSettings.provider).sources || ['netease'];
        return titleBar('搜索', ib('settings', 'settings', '音乐服务设置')) + `<form id="music-search-form" class="sp-search"><label class="sp-searchbox">${icon('search')}<input id="music-query" type="search" value="${e(ui.query)}" placeholder="想播放什么？" aria-label="搜索歌曲、歌手或专辑" autocomplete="off"><button type="submit" class="music-search-submit">搜索</button></label><div class="sp-search-source"><label for="music-source">搜索曲库</label><select id="music-source" class="sp-source">${sources.map(s => `<option value="${s}" ${db.musicSettings.source === s ? 'selected' : ''}>${platforms[s] || s}</option>`).join('')}</select></div></form><div id="music-search-results" aria-live="polite">${searchResults()}</div>`;
    }
    function renderLibrary() {
        const d = L.data();
        return titleBar('音乐库', `${ib('search', 'library-search', '搜索音乐库')}${ib('add', 'create', '创建歌单')}`)
            + `<div class="sp-pills"><button type="button" class="sp-pill active" data-music-action="library">歌单</button><button type="button" class="sp-pill" data-music-list="local">本地歌曲</button><button type="button" class="sp-pill" data-music-action="transfer">导入与导出</button></div><div class="sp-library-sort"><span>${d.playlists.length} 个歌单</span><button type="button" data-music-action="transfer">${icon('download')}导入</button></div><button type="button" class="sp-library-row" data-music-list="liked"><span class="sp-liked-art">${icon('heart')}</span><span><strong>已点赞的歌曲</strong><small>歌单 · ${d.liked.length} 首歌曲</small></span></button><button type="button" class="sp-library-row" data-music-list="recent"><span class="sp-liked-art music-recent-art">${icon('history')}</span><span><strong>最近播放</strong><small>${d.recent.length} 首歌曲</small></span></button>`
            + d.playlists.map(p => `<button type="button" class="sp-library-row" data-music-list="${e(p.id)}">${img(p.cover || L.find(p.keys[0])?.cover)}<span><strong>${e(p.name)}</strong><small>歌单 · ${p.keys.length} 首歌曲</small></span></button>`).join('')
            + `<button type="button" class="sp-library-row" data-music-list="local"><span class="sp-liked-art music-local-art">${icon('folder')}</span><span><strong>本地歌曲</strong><small>${d.tracks.filter(t => t.platform === 'local').length} 首歌曲</small></span></button>`;
    }
    function renderPlaylist() {
        const p = listInfo(), items = tracks(p.keys);
        return `<div class="sp-playlist-top">${ib('back', 'library', '返回音乐库')}${ui.list === 'liked' ? `<div class="sp-playlist-cover sp-liked-art">${icon('heart')}</div>` : img(p.cover || items[0]?.cover, 'sp-playlist-cover')}<h1>${e(p.name)}</h1>${p.description ? `<p class="sp-muted">${e(p.description)}</p>` : ''}<p class="sp-muted">${items.length} 首歌曲</p><div class="sp-playlist-controls">${ib('add', ui.list === 'local' ? 'local-import' : 'add-songs', '添加歌曲')}${ib('download', 'export-list', '导出歌单')}${ib('more', 'playlist-menu', '歌单选项')}<button type="button" class="sp-play" data-music-action="play-list" aria-label="播放全部">${icon('play')}</button></div></div><div class="music-list-filter"><input class="sp-field" id="music-list-query" type="search" aria-label="搜索此歌单" placeholder="在歌单中搜索"></div><div id="music-list-tracks">${items.length ? items.map(t => row(t)).join('') : empty('歌单里还没有歌曲', ui.list === 'local' ? 'local-import' : 'search', ui.list === 'local' ? '导入本地歌曲' : '去搜索')}</div>`;
    }
    function render() {
        if (!root) return;
        root.dataset.theme = db.musicSettings.theme;
        $('#music-content').innerHTML = ({ home: renderHome, search: renderSearch, library: renderLibrary, playlist: renderPlaylist })[ui.page]();
        root.querySelectorAll('[data-music-page]').forEach(b => { const active = b.dataset.musicPage === ui.page || ui.page === 'playlist' && b.dataset.musicPage === 'library'; if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
        mini(); renderPlayer();
    }
    const statusText = () => ({ idle: '', loading: '正在获取播放地址…', buffering: '缓冲中…', playing: '', paused: '已暂停', error: '播放失败' })[player.state.status];
    function mini() {
        const t = player.current(), busy = ['loading', 'buffering'].includes(player.state.status), playing = ['playing', 'buffering'].includes(player.state.status);
        $('#music-mini').hidden = !t;
        if (t) $('#music-mini').innerHTML = `<button type="button" class="sp-mini-song" data-music-action="player" aria-label="展开播放器">${img(t.cover)}<span><strong>${e(t.name)}</strong><small>${e(ui.together ? '和' + (character()?.realName || character()?.name || '角色') + '一起听' : statusText() || t.artist)}</small></span></button>${ib('together', 'together', '邀请角色一起听')}${ib(playing ? 'pause' : 'play', 'play', playing ? '暂停' : '播放')}${busy ? '<span class="music-spinner" aria-label="加载中"></span>' : ''}<div class="sp-mini-progress"><span id="music-mini-progress"></span></div>`;
        if (floating) {
            floating.dataset.theme = db.musicSettings.theme; floating.hidden = !t || root.classList.contains('active') || !['playing', 'paused', 'buffering', 'loading'].includes(player.state.status);
            if (t) floating.innerHTML = `<button type="button" data-music-action="return" aria-label="返回音乐">${img(t.cover)}<span>${e(t.name)}</span></button><button type="button" data-music-action="play" aria-label="${playing ? '暂停' : '播放'}">${icon(playing ? 'pause' : 'play')}</button><button type="button" data-music-action="hide-float" aria-label="收起音乐控制">${icon('close')}</button>`;
        }
        progress();
    }
    function renderPlayer() {
        const t = player.current(), el = $('#music-player'); el.hidden = !ui.player || !t;
        $('#music-content').inert = !!ui.player; root.querySelector('.sp-dock').inert = !!ui.player;
        if (!t || !ui.player) return;
        const playing = ['playing', 'buffering'].includes(player.state.status), modes = { order: '顺序播放', loop: '列表循环', one: '单曲循环', shuffle: '随机播放' };
        const lyrics = player.state.lyric;
        el.innerHTML = `<div class="sp-player-top">${ib('down', 'close-player', '收起播放器')}<div><p>${ui.together ? '一起听' : '正在播放'}</p><strong>${e(platforms[t.platform] || '音乐')} · ${e(P.get(player.state.route || t.provider).name)}</strong></div>${ib('more', 'song-menu', '歌曲操作', `data-key="${e(t.key)}"`)}</div>`
            + (ui.lyrics ? `<div class="music-lyrics-tools"><button type="button" data-music-action="translation">${ui.translating ? '隐藏翻译' : '显示翻译'}</button><button type="button" data-music-action="lyric-sync">回到当前歌词</button><label>偏移 <input id="music-lyric-offset" type="number" step="0.5" min="-30" max="30" value="${player.state.lyricOffset}" aria-label="歌词偏移秒数"> 秒</label></div><div class="music-lyrics" id="music-lyrics" aria-label="歌词">${lyrics.length ? lyrics.map((line, i) => `<button type="button" data-lyric-index="${i}">${e(line.text)}${ui.translating ? `<small>${e(player.state.translation.find(t => Math.abs(t.time - line.time) < 0.3)?.text || '')}</small>` : ''}</button>`).join('') : `<p>${e(player.state.lyricText || '暂未获取到歌词')}</p>`}</div>` : img(t.cover, 'sp-player-art', t.name))
            + `<div class="sp-song-title"><div><h1>${e(t.name)}</h1><p>${e(t.artist)}</p></div>${ib(L.data().liked.includes(t.key) ? 'check' : 'plus', 'like-current', '收藏这首歌')}</div><div class="music-play-status" aria-live="polite">${e(player.state.error || statusText())}${player.state.status === 'error' ? '<button type="button" data-music-action="play">重试</button><button type="button" data-music-action="routes">切换线路</button>' : ''}${player.state.trial ? ' · 当前返回试听音源' : ''}</div><input id="music-seek" class="sp-progress" type="range" min="0" max="${player.audio?.duration || t.duration || 1}" value="${L.data().position}" aria-label="播放进度"><div class="sp-times"><span id="music-time">${format(L.data().position)}</span><span id="music-duration">${format(Number.isFinite(player.audio?.duration) ? player.audio.duration : t.duration)}</span></div><div class="sp-player-controls">${ib('shuffle', 'shuffle', modes[L.data().mode])}${ib('previous', 'previous', '上一首')}<button type="button" class="sp-play" data-music-action="play" aria-label="${playing ? '暂停' : '播放'}">${icon(playing ? 'pause' : 'play')}</button>${ib('next', 'next', '下一首')}${ib('repeat', 'mode', modes[L.data().mode])}</div><div class="sp-player-tools">${ib('together', 'together', '邀请角色一起听')}<label class="music-volume">${icon('volume')}<input id="music-volume" type="range" min="0" max="1" step="0.05" value="${L.data().volume}" aria-label="音量"></label><div>${ib('timer', 'timer', '定时停止')}${ib('queue', 'queue', '播放队列')}</div></div><div class="sp-lyrics-card"><button type="button" data-music-action="lyrics"><span>${ui.lyrics ? '返回封面' : '歌词'}</span>${icon('expand')}</button></div>`;
        progress();
    }
    function progress() {
        const t = player.current(); if (!t || !root) return;
        const position = player.audio?.currentTime || L.data().position || 0, duration = Number.isFinite(player.audio?.duration) ? player.audio.duration : t.duration;
        if ($('#music-mini-progress')) $('#music-mini-progress').style.width = `${duration ? Math.min(100, position / duration * 100) : 0}%`;
        if ($('#music-seek') && document.activeElement !== $('#music-seek')) { $('#music-seek').max = duration || 1; $('#music-seek').value = position; }
        if ($('#music-time')) $('#music-time').textContent = format(position);
        if ($('#music-duration')) $('#music-duration').textContent = format(duration);
        if (ui.lyrics) {
            let index = -1; for (let i = 0; i < player.state.lyric.length; i++) if (player.state.lyric[i].time <= position + player.state.lyricOffset) index = i; else break;
            const container = $('#music-lyrics');
            if (container && container.dataset.index !== String(index)) {
                container.dataset.index = index;
                container.querySelectorAll('[data-lyric-index]').forEach((b, i) => b.classList.toggle('current', i === index));
                const line = container.querySelector(`[data-lyric-index="${index}"]`);
                if (line && ui.follow) container.scrollTo({ top: line.offsetTop - container.offsetTop - container.clientHeight / 2 + line.clientHeight / 2, behavior: 'smooth' });
            }
        }
    }
    function close() { $('#music-modal').hidden = true; $('#music-sheet').replaceChildren(); sheetReturn = null; lastFocus?.focus?.(); }
    function modal(title, body) {
        if ($('#music-modal').hidden) lastFocus = document.activeElement;
        $('#music-sheet').innerHTML = `<div class="sp-handle"></div><div class="sp-sheet-heading"><h2>${e(title)}</h2>${ib('close', 'close', '关闭')}</div>${body}`;
        $('#music-modal').hidden = false; $('#music-sheet').querySelector('button,input,select')?.focus();
    }
    function nav(page, list) { ui.page = page; if (list) ui.list = list; ui.player = false; close(); render(); $('#music-content').scrollTop = 0; }
    async function loadHome() {
        if (homeLoading) return;
        homeLoading = true; homeError = ''; if (ui.page === 'home') render();
        try {
            const result = await P.run('playlist', '3778678', 'netease'); popular = L.remember(result.tracks.slice(0, 60));
        } catch (error) { homeError = error.message; }
        finally { homeLoading = false; if (ui.page === 'home') render(); }
    }
    async function search(more = false) {
        ui.query = ($('#music-query')?.value || ui.query).trim(); if (!ui.query) { ui.results = []; ui.searchError = ''; render(); return; }
        searchController?.abort(); searchController = new AbortController(); const signal = searchController.signal, token = ++searchToken;
        if (!more) { ui.pageNumber = 1; ui.results = []; }
        ui.searchLoading = true; ui.searchError = ''; $('#music-search-results').innerHTML = searchResults();
        try {
            const result = await P.run('search', ui.query, db.musicSettings.source, { signal, page: ui.pageNumber });
            if (signal.aborted || token !== searchToken) return;
            const map = new Map(ui.results.map(t => [t.key, t])); L.remember(result.tracks).forEach(t => map.set(t.key, t)); ui.results = [...map.values()]; ui.more = result.tracks.length >= 30;
        } catch (error) { if (!signal.aborted) { ui.searchError = error.message; if (more) ui.pageNumber--; } }
        finally { if (token === searchToken) { ui.searchLoading = false; if ($('#music-search-results')) $('#music-search-results').innerHTML = searchResults(); } }
    }
    function character() { return db.characters?.find(c => c.id === ui.together?.id); }
    function together() {
        const c = character();
        if (!c) {
            ui.together = null;
            modal('邀请角色一起听', `<p class="sp-muted">选择一位角色，分享正在播放的音乐。</p>${(db.characters || []).map(c => `<button type="button" class="sp-person music-person-button" data-invite="${e(c.id)}">${avatar(c)}<span><strong>${e(c.realName || c.name)}</strong><small>开始一起听</small></span></button>`).join('') || empty('先在联系人中添加一个角色')}`);
        } else {
            const t = player.current(), session = ui.together;
            modal('和' + (c.realName || c.name) + '一起听', `<div class="sp-together-pair"><span class="sp-avatar music-me-avatar">我</span>${icon('together')}${avatar(c)}</div><p class="sp-muted music-center">本次一起听 ${format((Date.now() - session.startedAt) / 1000)}</p>${t ? `<div class="sp-person">${img(t.cover)}<span><strong>${e(t.name)}</strong><small>${e(t.artist)}</small></span>` : empty('选择一首歌，开始收听')}<div class="music-conversations">${session.messages.map(m => `<div class="sp-conversation ${m.role === 'user' ? 'music-user-message' : ''}">${e(m.content)}</div>`).join('')}</div><form id="music-together-form"><input id="music-together-question" class="sp-field" maxlength="1000" placeholder="和角色聊聊这首歌" aria-label="一起听聊天内容"><button type="submit" class="sp-primary" ${session.busy ? 'disabled' : ''}>${session.busy ? '正在回复…' : '发送'}</button></form><button type="button" class="sp-option" data-music-action="share-chat">${icon('share')}<span>分享到角色聊天</span></button><button type="button" class="sp-option" data-music-action="end-together">${icon('close')}<span>结束一起听</span></button>`);
        }
    }
    // Music conversations use the existing role configuration and stay in their own session.
    async function replyTogether() {
        const c = character(), session = ui.together, question = $('#music-together-question')?.value.trim();
        if (!c || !session || session.busy || !question) return;
        const config = getApiConfigForFeature('chat', db.apiSettings, { character: c });
        if (!isApiConfigReady(config)) throw new Error('请先配置这个角色使用的聊天 API');
        session.messages.push({ role: 'user', content: question }); session.busy = true; session.controller = new AbortController();
        const t = player.current(), prompt = `你是${c.realName || c.name}，正在与用户一起听音乐。角色设定：${C.text(c.persona, 7000)}\n用户设定：${C.text(c.myPersona, 2000)}\n当前歌曲：${t ? t.name + '，歌手：' + t.artist : '尚未播放'}。${t && player.state.lyricText ? '提供的歌词片段：' + C.text(player.state.lyricText, 2000) : ''}\n只根据提供的信息自然交流，不假称已经分析了实际音频。直接回复对话正文。`;
        together();
        try {
            const body = { model: config.model, messages: [{ role: 'system', content: prompt }, ...session.messages.slice(-12)], temperature: 0.7 };
            const result = await fetchAiResponse(config, body, getApiConfigHeaders(config), getApiConfigEndpoint(config), false, { signal: session.controller.signal });
            if (ui.together !== session || session.controller.signal.aborted) return;
            const content = String(result || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
            if (!content) throw new Error('角色没有返回对话内容');
            session.messages.push({ role: 'assistant', content: content.slice(0, 10000) }); session.messages = session.messages.slice(-30);
        } finally { session.busy = false; if (ui.together === session && !$('#music-modal').hidden) together(); }
    }
    function option(iconName, title, action, attrs = '') { return `<button type="button" class="sp-option" data-music-action="${action}" ${attrs}>${icon(iconName)}<span>${e(title)}</span></button>`; }
    function settings() {
        const s = db.musicSettings, provider = P.get(s.provider);
        modal('音乐设置', `<div class="music-theme-switch"><button type="button" class="sp-pill ${s.theme === 'light' ? 'active' : ''}" data-theme-choice="light">${icon('sun')}日间</button><button type="button" class="sp-pill ${s.theme === 'dark' ? 'active' : ''}" data-theme-choice="dark">${icon('moon')}夜间</button></div><label class="music-form-label" for="music-provider">音乐服务</label><select id="music-provider" class="sp-field">${P.all().map(p => `<option value="${e(p.id)}" ${p.id === s.provider ? 'selected' : ''}>${e(p.name)}</option>`).join('')}</select><p class="sp-muted">${e(provider.url)}</p>${provider.key ? `<label class="music-form-label" for="music-key">API Key</label><input id="music-key" class="sp-field" type="password" autocomplete="off" value="${e(db.musicSecrets?.[provider.id] || '')}" placeholder="填写这个服务的 Key"><button type="button" class="sp-outline" data-music-action="save-key">保存 Key</button>` : ''}<label class="music-form-label" for="music-quality">优先音质</label><select class="sp-field" id="music-quality"><option value="128" ${s.quality === 128 ? 'selected' : ''}>标准 · 128 kbps</option><option value="320" ${s.quality === 320 ? 'selected' : ''}>高品质 · 320 kbps</option><option value="999" ${s.quality >= 740 ? 'selected' : ''}>无损 · 可用时</option></select><label class="sp-option"><span>播放失败时尝试备用服务</span><input id="music-fallback" class="sp-radio" type="checkbox" ${s.fallback ? 'checked' : ''}></label><label class="sp-option"><span>语音播放时暂停音乐</span><input id="music-voice" class="sp-radio" type="checkbox" ${s.pauseOnVoice ? 'checked' : ''}></label>${option('add', '添加兼容音乐服务', 'custom-provider')}${option('download', '导入与导出', 'transfer')}`);
    }
    function transfer() {
        modal('导入与导出', option('link', '导入在线歌曲／歌单', 'import-link') + option('folder', '导入本地歌曲、歌词与封面', 'local-import') + option('download', '导入音乐资料', 'import-data') + option('upload', '导出音乐资料', 'export-all'));
    }
    async function pick(accept, multiple = false) {
        return new Promise(resolve => {
            const input = document.createElement('input'); input.type = 'file'; input.accept = accept; input.multiple = multiple; input.hidden = true; document.body.append(input);
            const done = value => { input.remove(); resolve(value); };
            input.addEventListener('change', () => done([...input.files]), { once: true }); input.addEventListener('cancel', () => done([]), { once: true }); input.click();
        });
    }
    function exportDialog(playlist) {
        sheetReturn = playlist;
        modal('导出音乐资料', `<p class="sp-muted">${playlist ? '保存这个歌单中的歌曲资料。' : '保存歌单、收藏和歌曲资料。'}</p><label class="sp-option"><span>同时打包本地音频</span><input id="music-export-audio" class="sp-radio" type="checkbox"></label><button type="button" class="sp-primary music-full-button" data-music-action="export-confirm" ${playlist ? `data-playlist="${e(playlist)}"` : ''}>导出</button>`);
    }
    function playlistEditor(id = '') {
        const p = L.data().playlists.find(p => p.id === id);
        modal(p ? '编辑歌单' : '创建歌单', `<form id="music-playlist-form" data-id="${e(id)}"><label class="music-form-label" for="music-playlist-name">歌单名称</label><input id="music-playlist-name" class="sp-field" maxlength="100" value="${e(p?.name || '')}" placeholder="我的歌单" required><label class="music-form-label" for="music-playlist-description">简介</label><textarea id="music-playlist-description" class="sp-field" maxlength="1000">${e(p?.description || '')}</textarea><label class="music-form-label" for="music-playlist-cover">封面链接</label><input id="music-playlist-cover" class="sp-field" type="url" placeholder="https://" value="${e(p?.cover || '')}"><button type="submit" class="sp-primary music-full-button">保存歌单</button></form>`);
    }
    function songMenu(key) {
        const t = L.find(key); if (!t) return;
        const attrs = `data-key="${e(key)}"`;
        modal(t.name, `<p class="sp-muted">${e(t.artist)}${t.album ? ' · ' + e(t.album) : ''}</p>` + option('heart', L.data().liked.includes(key) ? '取消喜欢' : '添加到已点赞的歌曲', 'like', attrs) + option('add', '加入歌单', 'add-to-playlist', attrs) + option('queue', '下一首播放', 'play-next', attrs) + option('together', '邀请角色一起听', 'together') + option('share', '分享到角色聊天', 'share-chat', attrs)
            + (L.data().playlists.some(p => p.id === ui.list) ? option('close', '从这个歌单移除', 'remove-from-list', attrs) : '') + (t.platform === 'local' ? option('trash', '删除本地歌曲', 'delete-local', attrs) : option('settings', '切换播放线路', 'routes', attrs)));
    }
    async function confirm(message, title = '音乐') { return typeof customConfirm === 'function' ? customConfirm(message, title) : window.confirm(message); }
    const actions = {
        exit: () => { ui.player = false; close(); switchScreen('home-screen'); },
        return: () => switchScreen('music-screen'),
        'hide-float': () => { floating.hidden = true; },
        home: () => nav('home'), search: () => nav('search'), library: () => nav('library'), recent: () => nav('playlist', 'recent'),
        'library-search': () => modal('搜索音乐库', `<input class="sp-field" id="music-library-query" type="search" placeholder="搜索歌曲、歌手或专辑" aria-label="搜索音乐库"><div id="music-library-results">${empty('输入关键词，搜索已保存的歌曲')}</div>`),
        theme: async () => { db.musicSettings.theme = db.musicSettings.theme === 'light' ? 'dark' : 'light'; render(); await L.save(['musicSettings']); },
        player: () => { ui.player = true; ui.lyrics = false; renderPlayer(); },
        'close-player': () => { ui.player = false; renderPlayer(); },
        play: () => { if (['playing', 'buffering', 'loading'].includes(player.state.status)) player.pause(); else if (player.current()) void player.resume(); else toast('先选择一首歌曲'); },
        next: () => player.next(true), previous: player.previous,
        shuffle: async () => { L.data().mode = L.data().mode === 'shuffle' ? 'order' : 'shuffle'; await L.save(); renderPlayer(); toast(L.data().mode === 'shuffle' ? '随机播放' : '顺序播放'); },
        mode: async () => { const modes = ['order', 'loop', 'one', 'shuffle']; L.data().mode = modes[(modes.indexOf(L.data().mode) + 1) % modes.length]; await L.save(); renderPlayer(); toast(({ order: '顺序播放', loop: '列表循环', one: '单曲循环', shuffle: '随机播放' })[L.data().mode]); },
        lyrics: () => { ui.lyrics = !ui.lyrics; ui.follow = true; renderPlayer(); },
        translation: () => { ui.translating = !ui.translating; renderPlayer(); },
        'lyric-sync': () => { ui.follow = true; if ($('#music-lyrics')) delete $('#music-lyrics').dataset.index; progress(); },
        close, settings, transfer, together,
        'end-together': () => { ui.together?.controller?.abort(); ui.together = null; close(); mini(); renderPlayer(); toast('已结束一起听'); },
        'share-chat': async el => {
            const t = L.find(el.dataset.key) || player.current(); if (!t) throw new Error('请先选择一首歌曲');
            const c = character(); if (!c) { together(); return; }
            const content = `[一起听音乐] ${t.name} — ${t.artist}${t.album ? '，专辑：' + t.album : ''}`;
            const message = { id: 'music-' + L.uid(), role: 'user', content, parts: [{ type: 'text', text: content }], timestamp: Date.now() };
            c.history ||= []; c.history.push(message);
            if (!await saveCharacter(c.id)) { const i = c.history.indexOf(message); if (i >= 0) c.history.splice(i, 1); throw new Error('分享到聊天时保存失败'); }
            toast('已分享到角色聊天'); if (typeof renderChatList === 'function') renderChatList();
        },
        'reload-home': () => loadHome(),
        'search-submit': () => search(), 'search-more': () => { ui.pageNumber++; return search(true); },
        'play-search': () => { if (ui.results[0]) { ui.player = true; void player.play(ui.results[0].key, { queue: ui.results.map(t => t.key) }); renderPlayer(); } },
        'play-list': () => { const p = listInfo(); if (p.keys[0]) { ui.player = true; void player.play(p.keys[0], { queue: p.keys }); renderPlayer(); } else toast('歌单里还没有歌曲'); },
        'song-menu': el => songMenu(el.dataset.key || player.current()?.key),
        like: async el => { await L.like(el.dataset.key); close(); render(); },
        'like-current': async () => { if (player.current()) { await L.like(player.current().key); renderPlayer(); } },
        'add-to-playlist': el => { const key = el.dataset.key; modal('加入歌单', L.data().playlists.map(p => option('add', p.name, 'add-confirm', `data-id="${e(p.id)}" data-key="${e(key)}"`)).join('') + option('add', '创建歌单', 'create')); },
        'add-confirm': async el => { await L.add(el.dataset.id, [el.dataset.key]); close(); render(); toast('已加入歌单'); },
        'play-next': async el => { const d = L.data(); d.queue.splice(player.current() ? player.state.queueIndex + 1 : 0, 0, el.dataset.key); await L.save(); close(); toast('已加入下一首播放'); },
        'remove-from-list': async el => { const p = L.data().playlists.find(p => p.id === ui.list); if (p) { p.keys = p.keys.filter(k => k !== el.dataset.key); await L.save(); close(); render(); } },
        'delete-local': async el => {
            const t = L.find(el.dataset.key); if (!t || !await confirm(`删除本地歌曲「${t.name}」及保存的音频？`, '删除本地歌曲')) return;
            if (player.current()?.key === t.key) { player.pause(); L.data().current = ''; ui.player = false; }
            await dexieDB.musicAssets.delete(t.assetId); db.musicLibrary = C.library({ ...L.data(), tracks: L.data().tracks.filter(x => x.key !== t.key) }); await L.save(); close(); render();
        },
        'add-songs': () => nav('search'), create: () => playlistEditor(),
        'playlist-menu': () => { const p = L.data().playlists.find(p => p.id === ui.list); modal('歌单选项', (p ? option('edit', '编辑歌单', 'edit-list') + option('queue', '调整歌曲顺序', 'sort-list') + option('trash', '删除歌单', 'delete-list') : '') + option('upload', '导出歌单', 'export-list')); },
        'edit-list': () => playlistEditor(ui.list),
        'sort-list': () => { const p = listInfo(); modal('调整歌曲顺序', tracks(p.keys).map((t, i) => `<div class="sp-track"><span class="sp-track-name">${e(t.name)}</span>${ib('up', 'list-up', '上移歌曲', `data-index="${i}"`)}</div>`).join('')); },
        'list-up': async el => { const p = L.data().playlists.find(p => p.id === ui.list), i = Number(el.dataset.index); if (p && i > 0 && i < p.keys.length) { [p.keys[i - 1], p.keys[i]] = [p.keys[i], p.keys[i - 1]]; await L.save(); actions['sort-list'](); } },
        'delete-list': async () => { const p = listInfo(); if (await confirm(`删除歌单「${p.name}」？歌曲文件和收藏会保留。`, '删除歌单')) { L.data().playlists = L.data().playlists.filter(x => x.id !== p.id); await L.save(); nav('library'); } },
        queue: () => modal('播放队列', `<div class="music-result-heading"><span>${L.data().queue.length} 首歌曲</span><button type="button" data-music-action="clear-queue">清除待播</button></div>${L.data().queue.map((k, i) => L.find(k) ? row(L.find(k), { queue: true, index: i }) : '').join('')}`),
        'queue-up': async el => { const d = L.data(), i = Number(el.dataset.index); if (i > 0 && i < d.queue.length) { [d.queue[i - 1], d.queue[i]] = [d.queue[i], d.queue[i - 1]]; if (player.state.queueIndex === i) player.state.queueIndex--; else if (player.state.queueIndex === i - 1) player.state.queueIndex++; await L.save(); actions.queue(); } },
        'queue-remove': async el => { const i = Number(el.dataset.index); if (i >= 0 && i < L.data().queue.length) { L.data().queue.splice(i, 1); if (i <= player.state.queueIndex) player.state.queueIndex = Math.max(-1, player.state.queueIndex - 1); await L.save(); actions.queue(); } },
        'clear-queue': async () => { L.data().queue = player.current() ? [player.current().key] : []; player.state.queueIndex = 0; await L.save(); actions.queue(); },
        routes: el => {
            const t = L.find(el.dataset.key) || player.current(); if (!t) return;
            modal('播放线路', P.all().filter(p => p.sources.includes(t.platform)).map(p => option('music', p.name, 'use-route', `data-key="${e(t.key)}" data-provider="${e(p.id)}"`)).join(''));
        },
        'use-route': el => { close(); ui.player = true; return player.play(el.dataset.key, { provider: el.dataset.provider, resume: true }); },
        timer: () => modal('定时停止', [15, 30, 60].map(n => `<button type="button" class="sp-option" data-music-timer="${n}">${n} 分钟</button>`).join('') + option('timer', '当前歌曲结束后', 'timer-end') + option('close', '取消定时', 'timer-cancel')),
        'timer-end': () => { player.state.timer = 0; player.state.endAfterSong = true; close(); toast('将在当前歌曲结束后停止'); },
        'timer-cancel': () => { player.state.timer = 0; player.state.endAfterSong = false; close(); toast('已取消定时停止'); },
        'local-import': async () => { const files = await pick('audio/*,.mp3,.m4a,.flac,.ogg,.wav,.aac,.opus,.lrc,image/png,image/jpeg,image/webp', true); if (!files.length) return; modal('正在导入', '<p class="sp-muted" role="status">正在保存音频与歌词…</p>'); const count = await L.importFiles(files); nav('playlist', 'local'); toast(`已导入或更新 ${count} 首歌曲`); },
        'import-link': () => modal('导入在线歌曲／歌单', `<form id="music-link-form"><label class="music-form-label" for="music-import-url">链接或 ID</label><input class="sp-field" id="music-import-url" placeholder="粘贴歌曲／歌单链接，或填写 ID" required><label class="music-form-label" for="music-import-kind">内容类型</label><select id="music-import-kind" class="sp-field"><option value="playlist">歌单</option><option value="song">单曲</option></select><label class="music-form-label" for="music-import-source">来源平台</label><select id="music-import-source" class="sp-field">${['netease', 'tencent', 'kugou', 'kuwo'].map(p => `<option value="${p}">${platforms[p]}</option>`).join('')}</select><button type="submit" class="sp-primary music-full-button">预览</button></form>`),
        'import-online-confirm': async () => { if (!importOnline) return; const item = importOnline; L.remember(item.tracks); const p = await L.create(item.name || '导入的歌单', item.tracks.map(t => t.key)); importOnline = null; nav('playlist', p.id); toast('已导入歌单'); },
        'import-data': async () => {
            const [file] = await pick('.json,application/json'); if (!file) return;
            if (file.size > 125000000) throw new Error('音乐资料文件不能超过 125MB');
            importPlan = L.previewImport(JSON.parse(await file.text()));
            modal('导入预览', `<p class="sp-muted">新增 ${importPlan.added} 首歌曲，合并 ${importPlan.duplicates} 首已有歌曲，${importPlan.playlists} 个歌单。<br>包含 ${importPlan.assets.length} 个本地音频文件。</p><button type="button" class="sp-primary music-full-button" data-music-action="import-data-confirm">合并到音乐库</button>`);
        },
        'import-data-confirm': async () => { if (!importPlan) return; await L.commitImport(importPlan); importPlan = null; nav('library'); toast('音乐资料已导入'); },
        'export-all': () => exportDialog(),
        'export-list': () => { if (L.data().playlists.some(p => p.id === ui.list)) exportDialog(ui.list); else exportDialog(); },
        'export-confirm': async el => {
            const pack = await L.exportData({ audio: !!$('#music-export-audio')?.checked, playlist: el.dataset.playlist });
            await OvoFileDownload.save(new Blob([JSON.stringify(pack)], { type: 'application/json' }), `OVO-music-${new Date().toISOString().slice(0, 10)}.json`); close();
        },
        'save-key': async () => { db.musicSecrets[db.musicSettings.provider] = $('#music-key').value.trim(); await L.save(['musicSecrets']); toast('音乐服务 Key 已保存'); },
        'custom-provider': () => modal('添加兼容音乐服务', `<form id="music-custom-form"><label class="music-form-label">名称<input id="music-custom-name" class="sp-field" required maxlength="60"></label><label class="music-form-label">接口地址<input id="music-custom-url" class="sp-field" type="url" placeholder="https://" required></label><label class="music-form-label">兼容协议<select class="sp-field" id="music-custom-protocol"><option value="meting">Meting</option><option value="netease">网易云增强接口</option><option value="gd">GD Studio</option><option value="openmusic">OpenMusic</option></select></label><label class="music-form-label">曲库<select class="sp-field" id="music-custom-source"><option value="netease">网易云</option><option value="tencent">QQ 音乐</option><option value="kuwo">酷我</option><option value="kugou">酷狗</option></select></label><button type="submit" class="sp-primary music-full-button">保存服务</button></form>`)
    };
    function handleError(error) { if (error?.name !== 'AbortError') { console.error('[Music]', error); toast(error?.message || '音乐操作失败，请重试'); } }
    async function submit(event) {
        const form = event.target; if (!root.contains(form)) return; event.preventDefault();
        if (form.id === 'music-search-form') return search();
        if (form.id === 'music-together-form') return replyTogether();
        if (form.id === 'music-playlist-form') {
            const name = $('#music-playlist-name').value.trim(); if (!name) throw new Error('请填写歌单名称');
            const p = L.data().playlists.find(p => p.id === form.dataset.id) || await L.create(name);
            p.name = C.text(name, 100); p.description = $('#music-playlist-description').value.slice(0, 1000); p.cover = C.mediaUrl($('#music-playlist-cover').value); await L.save(); nav('playlist', p.id);
        }
        if (form.id === 'music-link-form') {
            const link = C.parseLink($('#music-import-url').value, $('#music-import-source').value, $('#music-import-kind').value);
            modal('正在读取', '<p class="sp-muted" role="status">正在读取歌曲资料…</p>');
            const result = await P.run(link.kind, link.id, link.platform);
            importOnline = result;
            modal(result.name || '导入预览', `<p class="sp-muted">共 ${result.tracks.length} 首歌曲</p>${result.tracks.slice(0, 8).map(t => `<div class="sp-person">${img(t.cover)}<span><strong>${e(t.name)}</strong><small>${e(t.artist)}</small></span></div>`).join('')}<button type="button" class="sp-primary music-full-button" data-music-action="import-online-confirm">导入为我的歌单</button>`);
        }
        if (form.id === 'music-custom-form') {
            const url = C.mediaUrl($('#music-custom-url').value, 'audio'); if (!url) throw new Error('请填写有效的 HTTP／HTTPS 接口地址');
            const p = { id: 'custom-' + L.uid(), name: $('#music-custom-name').value.trim().slice(0, 60), url, protocol: $('#music-custom-protocol').value, sources: [$('#music-custom-source').value] };
            db.musicSettings.custom.push(p); db.musicSettings.provider = p.id; db.musicSettings.source = p.sources[0]; await L.save(['musicSettings']); settings();
        }
    }
    function click(event) {
        const b = event.target.closest('button'); if (!b || !(root.contains(b) || floating?.contains(b))) return;
        if (b.dataset.musicPage) { nav(b.dataset.musicPage); return; }
        if (b.dataset.musicList) { nav('playlist', b.dataset.musicList); return; }
        if (b.dataset.musicKey) {
            const keys = ui.page === 'search' ? ui.results.map(t => t.key) : ui.page === 'playlist' ? listInfo().keys : ui.page === 'home' ? [...new Set([...L.data().recent, ...popular.map(t => t.key)])] : [b.dataset.musicKey];
            close(); ui.player = true; ui.lyrics = false; void player.play(b.dataset.musicKey, { queue: keys }).catch(handleError); renderPlayer(); return;
        }
        if (b.dataset.homeFilter) { ui.filter = b.dataset.homeFilter; render(); return; }
        if (b.dataset.themeChoice) { db.musicSettings.theme = b.dataset.themeChoice; render(); settings(); void L.save(['musicSettings']).catch(handleError); return; }
        if (b.dataset.invite) { ui.together?.controller?.abort(); ui.together = { id: b.dataset.invite, startedAt: Date.now(), messages: [], busy: false }; mini(); renderPlayer(); together(); return; }
        if (b.dataset.lyricIndex !== undefined) { ui.follow = true; player.seek(Math.max(0, player.state.lyric[Number(b.dataset.lyricIndex)]?.time - player.state.lyricOffset)); return; }
        if (b.dataset.musicTimer) {
            const deadline = Date.now() + Number(b.dataset.musicTimer) * 60000; player.state.timer = deadline; player.state.endAfterSong = false;
            setTimeout(() => { if (player.state.timer === deadline) { player.state.timer = 0; player.pause(); } }, Number(b.dataset.musicTimer) * 60000); close(); toast(`将在 ${b.dataset.musicTimer} 分钟后停止播放`); return;
        }
        if (actions[b.dataset.musicAction]) Promise.resolve().then(() => actions[b.dataset.musicAction](b)).catch(handleError);
    }
    async function init() {
        if (initialized) return; root = document.getElementById('music-screen'); if (!root) return;
        initialized = true; L.init(); player.init();
        root.querySelectorAll('[data-music-icon]').forEach(el => { el.innerHTML = icon(el.dataset.musicIcon); });
        floating = document.createElement('div'); floating.id = 'music-floating-player'; floating.className = 'music-floating-player'; floating.hidden = true; floating.setAttribute('aria-label', '音乐播放控制'); document.body.append(floating); floating.addEventListener('click', click);
        root.addEventListener('click', click); root.addEventListener('submit', event => { void submit(event).catch(handleError); });
        root.addEventListener('error', event => { if (event.target.tagName === 'IMG' && event.target.getAttribute('src') !== fallback) event.target.src = fallback; }, true);
        root.addEventListener('input', event => {
            const el = event.target;
            if (el.id === 'music-query') ui.query = el.value;
            if (el.id === 'music-seek') player.seek(el.value);
            if (el.id === 'music-volume') player.volume(el.value);
            if (el.id === 'music-list-query') { const q = el.value.toLowerCase(); $('#music-list-tracks').innerHTML = tracks(listInfo().keys).filter(t => (t.name + t.artist + t.album).toLowerCase().includes(q)).map(t => row(t)).join('') || empty('没有找到相关歌曲'); }
            if (el.id === 'music-library-query') { const q = el.value.trim().toLowerCase(); $('#music-library-results').innerHTML = q ? L.data().tracks.filter(t => (t.name + t.artist + t.album).toLowerCase().includes(q)).slice(0, 100).map(t => row(t)).join('') || empty('没有找到相关歌曲') : empty('输入关键词，搜索已保存的歌曲'); }
        });
        root.addEventListener('change', event => {
            const el = event.target, s = db.musicSettings;
            if (el.id === 'music-provider') { s.provider = el.value; const p = P.get(s.provider); if (!p.sources.includes(s.source)) s.source = p.sources[0]; settings(); if (ui.page === 'search') render(); }
            if (el.id === 'music-source') { s.source = el.value; searchController?.abort(); ui.results = []; ui.searchError = ''; ui.more = false; if ($('#music-search-results')) $('#music-search-results').innerHTML = searchResults(); }
            if (el.id === 'music-quality') s.quality = Number(el.value);
            if (el.id === 'music-fallback') s.fallback = el.checked;
            if (el.id === 'music-voice') { s.pauseOnVoice = el.checked; if (!el.checked) player.interrupt('tts', false); }
            if (el.id === 'music-lyric-offset') { player.state.lyricOffset = Math.max(-30, Math.min(30, Number(el.value) || 0)); s.lyricOffset = player.state.lyricOffset; }
            if (el.id.startsWith('music-') && !['music-key', 'music-query', 'music-library-query', 'music-list-query'].includes(el.id)) void L.save(['musicSettings']).catch(handleError);
        });
        root.addEventListener('wheel', event => { if (event.target.closest('#music-lyrics')) ui.follow = false; }, { passive: true });
        root.addEventListener('touchstart', event => { if (event.target.closest('#music-lyrics')) ui.follow = false; }, { passive: true });
        root.addEventListener('keydown', event => {
            if (event.key === 'Escape') { if (!$('#music-modal').hidden) close(); else { ui.player = false; renderPlayer(); } }
            if (event.key === 'Tab' && !$('#music-modal').hidden) {
                const nodes = [...$('#music-sheet').querySelectorAll('button,input,select,textarea')].filter(el => !el.disabled && !el.hidden);
                const first = nodes[0], last = nodes.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
        });
        window.addEventListener('ovo-music-change', () => { mini(); renderPlayer(); if (ui.page === 'playlist' && root.classList.contains('active') && !ui.player && $('#music-list-tracks')) { const q = $('#music-list-query')?.value || ''; $('#music-list-tracks').innerHTML = tracks(listInfo().keys).filter(t => (t.name + t.artist + t.album).toLowerCase().includes(q.toLowerCase())).map(t => row(t)).join(''); } });
        window.addEventListener('ovo-music-progress', progress);
        player.state.lyricOffset = Number(db.musicSettings.lyricOffset) || 0;
        render();
    }
    function onScreen(id) {
        if (!initialized) return;
        if (id === 'music-screen') { L.init(); player.syncLibrary(); render(); if (!popular.length && !homeLoading) void loadHome(); }
        else { ui.player = false; close(); mini(); }
    }
    window.MusicApp = { init, onScreen, render, ui, icon, search, loadHome };
})();
