// --- 音乐播放器（后台保活）---
// 支持本地上传、URL、循环播放、歌词显示、播放列表与歌单分类；进入界面可恢复上次音频并自动播放

(function () {
    const STORAGE_KEY_URL = 'music_player_url';
    const STORAGE_KEY_LRC = 'music_player_lrc';
    const STORAGE_KEY_TITLE = 'music_player_title';
    const STORAGE_KEY_THEME = 'music_player_theme';
    const STORAGE_KEY_PLAYLIST = 'music_player_playlist';
    const STORAGE_KEY_CATEGORIES = 'music_player_categories';

    let audio = null;
    let inited = false;
    let currentSrc = null;
    let currentObjectUrl = null;
    let lyricsData = [];
    let userHasInteracted = false;
    /** @type {string|null} 当前正在播放的歌曲 id */
    let currentPlayingSongId = null;
    /** @type {string} 当前播放所在分类，用于上一首/下一首 */
    let currentPlayingCategoryId = 'default';
    /** @type {'single'|'order'|'shuffle'} 播放模式：单曲循环/顺序播放/随机播放 */
    let playMode = 'single';
    const STORAGE_KEY_PLAY_MODE = 'music_player_play_mode';

    function loadPlaylistSongs() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_PLAYLIST);
            return raw ? JSON.parse(raw) : [];
        } catch (_) { return []; }
    }
    function savePlaylistSongs(songs) {
        try { localStorage.setItem(STORAGE_KEY_PLAYLIST, JSON.stringify(songs)); } catch (_) {}
    }
    function loadCategories() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_CATEGORIES);
            const list = raw ? JSON.parse(raw) : [];
            if (list.length === 0) return [{ id: 'default', name: '默认' }];
            return list;
        } catch (_) { return [{ id: 'default', name: '默认' }]; }
    }
    function saveCategories(cats) {
        try { localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(cats)); } catch (_) {}
    }
    function getSongsInCategory(songs, categoryId) {
        return songs.filter(s => s.categoryId === categoryId);
    }

    // ---------- 在线搜索（Meting / Vkeys API） ----------
    function extractSearchArtist(song) {
        if (song.ar && Array.isArray(song.ar) && song.ar.length > 0) return song.ar.map(a => a.name).filter(Boolean).join(', ');
        if (song.artists && Array.isArray(song.artists) && song.artists.length > 0) return song.artists.map(a => a.name || a).filter(Boolean).join(', ');
        if (Array.isArray(song.artist) && song.artist.length > 0) return song.artist.map(a => (typeof a === 'object' ? a.name : a)).filter(Boolean).join(', ');
        if (song.singer || song.artist || song.artistName || song.author || song.auther || song.singerName) {
            const v = song.singer || song.artist || song.artistName || song.author || song.auther || song.singerName;
            const s = String(v).trim();
            if (s && s !== 'null' && s !== 'undefined' && s !== 'None') return s;
        }
        return '未知歌手';
    }
    function extractSearchAlbum(song) {
        if (song.al && typeof song.al === 'object' && song.al.name) return String(song.al.name).trim();
        if (song.album && typeof song.album === 'object' && song.album.name) return String(song.album.name).trim();
        if (typeof song.album === 'string' && song.album.trim()) return song.album.trim();
        if (song.albumName || song.albumTitle || song.disc || song.albumname) {
            const v = song.albumName || song.albumTitle || song.disc || song.albumname;
            const s = String(v).trim();
            if (s && s !== 'null' && s !== 'undefined' && s !== 'None' && s !== '未知' && s !== 'unknown') return s;
        }
        return '未知专辑';
    }
    async function fetchLrcFromMeting(baseUrl, platform, songId) {
        try {
            const url = baseUrl + '?server=' + platform + '&type=lyric&id=' + encodeURIComponent(songId);
            const res = await fetch(url);
            if (!res.ok) return '';
            const data = await res.json();
            if (data && data.lyric) return data.lyric;
            if (data && data.lrc) return data.lrc;
            return '';
        } catch (_) { return ''; }
    }

    async function fetchLrcFromVkeys(platform, songId) {
        try {
            const url = 'https://api.vkeys.cn/v2/music/' + platform + '/lyric?id=' + encodeURIComponent(songId);
            const res = await fetch(url);
            if (!res.ok) return '';
            const data = await res.json();
            if (data && data.code === 200 && data.data) {
                if (data.data.lyric) return data.data.lyric;
                if (data.data.lrc) return data.data.lrc;
            }
            return '';
        } catch (_) { return ''; }
    }

    async function searchMetingCore(baseUrl, keyword) {
        const platforms = ['netease', 'tencent', 'kugou', 'kuwo'];
        const all = [];
        const names = { netease: '网易云', tencent: 'QQ音乐', kugou: '酷狗', kuwo: '酷我' };
        for (const platform of platforms) {
            try {
                const url = baseUrl + '?server=' + platform + '&type=search&id=' + encodeURIComponent(keyword.replace(/\s/g, ''));
                const res = await fetch(url);
                if (!res.ok) continue;
                const data = await res.json();
                if (!Array.isArray(data) || data.length === 0) continue;
                for (const song of data.slice(0, 5)) {
                    if (song.url) {
                        all.push({
                            name: song.name || song.title || '未知歌曲',
                            artist: extractSearchArtist(song),
                            album: extractSearchAlbum(song),
                            cover: song.pic || song.cover || '',
                            playUrl: song.url,
                            songId: song.id || '',
                            source: platform,
                            platform: names[platform] || platform
                        });
                    }
                }
            } catch (_) {}
        }
        return all;
    }
    async function searchVkeysCore(baseUrl, keyword) {
        const platforms = [{ name: 'netease', label: '网易云' }, { name: 'tencent', label: 'QQ音乐' }];
        const all = [];
        for (const p of platforms) {
            try {
                const url = baseUrl + '/' + p.name + '?word=' + encodeURIComponent(keyword.replace(/\s/g, ''));
                const res = await fetch(url);
                if (!res.ok) continue;
                const data = await res.json();
                if (data.code !== 200 || !Array.isArray(data.data) || data.data.length === 0) continue;
                for (const song of data.data.slice(0, 6)) {
                    try {
                        const uRes = await fetch(baseUrl + '/' + p.name + '?id=' + song.id);
                        const uData = await uRes.json();
                        if (uData.code === 200 && uData.data && uData.data.url) {
                            all.push({
                                name: song.name || song.song || song.title || '未知歌曲',
                                artist: extractSearchArtist(song),
                                album: extractSearchAlbum(song),
                                cover: (song.al && song.al.picUrl) || song.pic || song.cover || '',
                                playUrl: uData.data.url,
                                songId: String(song.id),
                                source: p.name,
                                platform: p.label
                            });
                        }
                    } catch (_) {}
                }
            } catch (_) {}
        }
        return all;
    }

    function getEl(id) {
        return document.getElementById(id);
    }

    function parseLrc(lrcText) {
        if (!lrcText || !lrcText.trim()) return [];
        const lines = lrcText.trim().split(/\r?\n/);
        const result = [];
        const timeRegex = /\[(\d+):(\d+)\.(\d+)\]|\[(\d+):(\d+):(\d+)\.(\d+)\]/;
        for (const line of lines) {
            const m = line.match(timeRegex);
            if (!m) continue;
            let seconds;
            if (m[4] !== undefined) {
                seconds = parseInt(m[4], 10) * 3600 + parseInt(m[5], 10) * 60 + parseInt(m[6], 10) + parseInt(m[7], 10) / 100;
            } else {
                seconds = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + parseInt(m[3], 10) / 100;
            }
            const text = line.replace(timeRegex, '').trim();
            result.push({ time: seconds, text: text || '…' });
        }
        result.sort((a, b) => a.time - b.time);
        return result;
    }

    function formatTime(sec) {
        if (!isFinite(sec) || sec < 0) return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function getAudio() {
        if (!audio) {
            audio = document.createElement('audio');
            audio.loop = false;
            audio.addEventListener('timeupdate', onTimeUpdate);
            audio.addEventListener('loadedmetadata', onLoadedMetadata);
            audio.addEventListener('ended', onEnded);
            audio.addEventListener('play', () => updatePlayPauseUI(true));
            audio.addEventListener('pause', () => updatePlayPauseUI(false));
        }
        return audio;
    }

    function onLoadedMetadata() {
        const el = getAudio();
        getEl('music-time-total').textContent = formatTime(el.duration);
        getEl('music-progress').max = el.duration || 100;
    }

    function onEnded() {
        if (playMode === 'single') {
            getAudio().currentTime = 0;
            getAudio().play().catch(function () {});
        } else if (playMode === 'order') {
            // playNextSong is defined inside initMusicPlayer, called via window
            if (typeof window._musicPlayNext === 'function') window._musicPlayNext();
        } else if (playMode === 'shuffle') {
            if (typeof window._musicPlayRandom === 'function') window._musicPlayRandom();
        }
    }

    function getPlayModeLabel() {
        if (playMode === 'single') return '单曲循环';
        if (playMode === 'order') return '顺序播放';
        if (playMode === 'shuffle') return '随机播放';
        return '单曲循环';
    }

    function onTimeUpdate() {
        const el = getAudio();
        const t = el.currentTime;
        const d = el.duration;
        getEl('music-time-current').textContent = formatTime(t);
        const progress = getEl('music-progress');
        if (isFinite(d) && d > 0) progress.value = t;
        updateLyricsHighlight(t);
    }

    function updatePlayPauseUI(playing) {
        const playBtn = getEl('music-btn-play');
        const iconPlay = playBtn && playBtn.querySelector('.icon-play');
        const iconPause = playBtn && playBtn.querySelector('.icon-pause');
        if (iconPlay) iconPlay.style.display = playing ? 'none' : 'block';
        if (iconPause) iconPause.style.display = playing ? 'block' : 'none';
        const screen = getEl('music-screen');
        if (screen) screen.classList.toggle('is-playing', playing);
    }

    function updateLyricsHighlight(currentTime) {
        const vinylList = document.getElementById('music-lyrics-view-list');
        if (vinylList && lyricsData.length) {
            const items = vinylList.querySelectorAll('li');
            let activeIndex = -1;
            for (let i = lyricsData.length - 1; i >= 0; i--) {
                if (currentTime >= lyricsData[i].time) {
                    activeIndex = i;
                    break;
                }
            }
            items.forEach((el, i) => {
                el.classList.toggle('active', i === activeIndex);
            });
            const active = items[activeIndex];
            if (active) active.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }

    /**
     * @param {string} src - 音频地址
     * @param {string} [title] - 标题
     * @param {{ id?: string, lrc?: string, cover?: string }} [opts] - 来自播放列表时的 id/lrc/cover
     */
    function setSource(src, title, opts) {
        revokeObjectUrl();
        currentObjectUrl = null;
        currentSrc = src;
        currentPlayingSongId = (opts && opts.id) || null;
        const el = getAudio();
        el.src = src;
        const name = title || '当前音频';
        getEl('music-title').textContent = name;
        const headerTitle = getEl('music-header-title');
        if (headerTitle) headerTitle.textContent = name;
        getEl('music-meta').textContent = getPlayModeLabel() + ' · 保活';
        const coverImg = getEl('music-cover-img');
        const placeholder = getEl('music-cover-placeholder');
        if (coverImg && placeholder) {
            if (opts && opts.cover) {
                coverImg.src = opts.cover;
                coverImg.style.display = '';
                placeholder.style.display = 'none';
            } else {
                coverImg.style.display = 'none';
                placeholder.style.display = 'flex';
            }
        }
        if (opts && opts.lrc) {
            lyricsData = parseLrc(opts.lrc);
            saveLrcToStorage();
            renderVinylLyrics();
        } else {
            lyricsData = [];
            saveLrcToStorage();
            renderVinylLyrics();
        }
    }

    /** 添加一首歌到播放列表并返回带 id 的项 */
    function addSongToPlaylist(src, title, categoryId, lrc, cover) {
        const songs = loadPlaylistSongs();
        const id = 'pl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        const item = { id, src, title: title || '未命名', categoryId: categoryId || 'default', lrc: lrc || '', cover: cover || '' };
        songs.push(item);
        savePlaylistSongs(songs);
        return item;
    }

    /** 将多首歌曲移动到某分类 */
    function moveSongsToCategory(songIds, targetCategoryId) {
        const songs = loadPlaylistSongs();
        songIds.forEach(sid => {
            const s = songs.find(x => x.id === sid);
            if (s) s.categoryId = targetCategoryId;
        });
        savePlaylistSongs(songs);
    }

    function revokeObjectUrl() {
        if (currentObjectUrl) {
            try { URL.revokeObjectURL(currentObjectUrl); } catch (_) {}
            currentObjectUrl = null;
        }
    }

    function tryAutoPlay() {
        const el = getAudio();
        if (!el.src) return;
        userHasInteracted = true;
        el.play().catch(() => {});
    }

    function playFromUserGesture() {
        userHasInteracted = true;
        const el = getAudio();
        if (!el.src) return;
        el.play().catch(() => {});
    }


    function renderVinylLyrics() {
        const listEl = document.getElementById('music-lyrics-view-list');
        const emptyEl = document.getElementById('music-lyrics-view-empty');
        if (!listEl || !emptyEl) return;
        if (lyricsData.length === 0) {
            listEl.style.display = 'none';
            emptyEl.style.display = 'block';
        } else {
            emptyEl.style.display = 'none';
            listEl.style.display = '';
            listEl.innerHTML = lyricsData.map(l => `<li data-time="${l.time}">${escapeHtml(l.text)}</li>`).join('');
        }
    }

    function escapeHtml(s) {
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    function saveLrcToStorage() {
        try {
            // 从 lyricsData 重建 LRC 文本保存
            if (lyricsData.length > 0) {
                const lrcText = lyricsData.map(l => {
                    const m = Math.floor(l.time / 60);
                    const s = (l.time % 60).toFixed(2);
                    return '[' + m + ':' + (s < 10 ? '0' : '') + s + ']' + l.text;
                }).join('\n');
                localStorage.setItem(STORAGE_KEY_LRC, lrcText);
            } else {
                localStorage.setItem(STORAGE_KEY_LRC, '');
            }
        } catch (_) {}
    }

    function loadLrcFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_LRC) || '';
            return raw;
        } catch (_) {
            return '';
        }
    }

    function initMusicPlayer() {
        if (inited) return;
        inited = true;

        const fileInput = getEl('music-file-input');
        const urlInput = getEl('music-url-input');
        const urlApplyBtn = getEl('music-url-apply-btn');
        const urlRow = getEl('music-url-row');
        const progress = getEl('music-progress');
        const playBtn = getEl('music-btn-play');
        const loopCheck = getEl('music-loop-check');
        const coverWrap = getEl('music-cover-wrap');
        const sourceSheet = getEl('music-source-sheet');
        const sheetUpload = getEl('music-sheet-upload');
        const sheetSearch = getEl('music-sheet-search');
        const sheetCancel = getEl('music-sheet-cancel');
        const btnLocal = getEl('music-btn-local');
        const btnUrl = getEl('music-btn-url');
        const headerUploadBtn = getEl('music-header-upload-btn');
        const searchPanel = getEl('music-search-panel');
        const searchBackdrop = getEl('music-search-backdrop');
        const searchBack = getEl('music-search-back');
        const searchInput = getEl('music-search-input');
        const searchApi = getEl('music-search-api');
        const searchBtn = getEl('music-search-btn');
        const searchLoading = getEl('music-search-loading');
        const searchResultsEl = getEl('music-search-results');
        const searchMultiselectBtn = getEl('music-search-multiselect-btn');
        const searchResultToolbar = getEl('music-search-result-toolbar');
        const searchBatchAddBtn = getEl('music-search-batch-add-btn');
        const searchCancelSelectBtn = getEl('music-search-cancel-select');
        const vinylWrap = getEl('music-vinyl-wrap');
        const lyricsView = getEl('music-lyrics-view');
        const cleanModal = getEl('music-clean-modal');
        const cleanModalBody = getEl('music-clean-modal-body');
        const cleanModalClose = getEl('music-clean-modal-close');
        const cleanCloseBtn = getEl('music-clean-close-btn');

        if (!playBtn || !getAudio()) return;

        var searchResultList = [];
        var searchMultiselectMode = false;
        var searchSelectedIndices = [];

        function closeSourceSheet() {
            if (sourceSheet) sourceSheet.classList.remove('visible');
        }
        function openSourceSheet() {
            if (sourceSheet) {
                sourceSheet.classList.add('visible');
                sourceSheet.classList.toggle('music-sheet-theme-light', getMusicTheme() === 'light');
            }
        }
        function showUrlRow() {
            if (urlRow) urlRow.classList.add('visible');
            if (urlInput) urlInput.focus();
        }

        // 胶片点击 -> 整个胶片消失，变成歌词列表
        let showingLyrics = false;
        const tonearmEl = document.querySelector('.music-tonearm');
        function switchToLyrics() {
            if (!getAudio().src && !currentSrc) {
                openSourceSheet();
                return;
            }
            showingLyrics = true;
            if (vinylWrap) vinylWrap.style.display = 'none';
            if (tonearmEl) tonearmEl.style.display = 'none';
            if (lyricsView) lyricsView.style.display = '';
        }
        function switchToVinyl() {
            showingLyrics = false;
            if (vinylWrap) vinylWrap.style.display = '';
            if (tonearmEl) tonearmEl.style.display = '';
            if (lyricsView) lyricsView.style.display = 'none';
        }
        if (coverWrap) {
            coverWrap.addEventListener('click', function (e) {
                if (!getAudio().src && !currentSrc) {
                    openSourceSheet();
                    return;
                }
                switchToLyrics();
            });
        }
        if (lyricsView) {
            lyricsView.addEventListener('click', function () {
                switchToVinyl();
            });
        }

        // header上传按钮 -> 选择来源弹层
        if (headerUploadBtn) {
            headerUploadBtn.addEventListener('click', function () {
                openSourceSheet();
            });
        }
        if (sourceSheet) {
            sourceSheet.addEventListener('click', function (e) {
                if (e.target === sourceSheet) closeSourceSheet();
            });
        }
        if (sheetUpload) {
            sheetUpload.addEventListener('click', function () {
                closeSourceSheet();
                openMusicUploadModal('local');
            });
        }
        if (sheetSearch) {
            sheetSearch.addEventListener('click', function () {
                closeSourceSheet();
                openMusicSearchPanel();
            });
        }
        // 导入歌词按钮
        var sheetImportLyrics = getEl('music-sheet-import-lyrics');
        if (sheetImportLyrics) {
            sheetImportLyrics.addEventListener('click', function () {
                closeSourceSheet();
                openLyricsImportModal();
            });
        }
        if (sheetCancel) sheetCancel.addEventListener('click', closeSourceSheet);

        // ========== 批量上传弹窗逻辑 ==========
        var uploadLocalFiles = [];
        var uploadLocalLyrics = [];
        var uploadUrlLyrics = [];

        function openMusicUploadModal(tab) {
            var modal = getEl('music-upload-modal');
            if (!modal) return;
            modal.style.display = 'flex';
            modal.classList.toggle('music-modal-light', getMusicTheme() === 'light');
            // 重置
            uploadLocalFiles = [];
            uploadLocalLyrics = [];
            uploadUrlLyrics = [];
            var localFilesInput = getEl('music-upload-local-files');
            var localLyricsInput = getEl('music-upload-local-lyrics');
            var urlLyricsInput = getEl('music-upload-url-lyrics');
            var urlTextarea = getEl('music-upload-url-list');
            if (localFilesInput) localFilesInput.value = '';
            if (localLyricsInput) localLyricsInput.value = '';
            if (urlLyricsInput) urlLyricsInput.value = '';
            if (urlTextarea) urlTextarea.value = '';
            var localPreview = getEl('music-upload-local-preview');
            var urlPreview = getEl('music-upload-url-preview');
            if (localPreview) localPreview.innerHTML = '';
            if (urlPreview) urlPreview.innerHTML = '';
            // 切换tab
            switchUploadTab(tab || 'local');
        }

        function closeMusicUploadModal() {
            var modal = getEl('music-upload-modal');
            if (modal) modal.style.display = 'none';
        }

        function switchUploadTab(tab) {
            var tabs = document.querySelectorAll('.music-upload-tab');
            tabs.forEach(function (t) {
                t.classList.toggle('active', t.getAttribute('data-tab') === tab);
            });
            var localTab = getEl('music-upload-local-tab');
            var urlTab = getEl('music-upload-url-tab');
            if (localTab) localTab.style.display = tab === 'local' ? '' : 'none';
            if (urlTab) urlTab.style.display = tab === 'url' ? '' : 'none';
        }

        // Tab切换
        document.querySelectorAll('.music-upload-tab').forEach(function (btn) {
            btn.addEventListener('click', function () {
                switchUploadTab(this.getAttribute('data-tab'));
            });
        });

        // 本地文件选择
        var localFilesInput = getEl('music-upload-local-files');
        if (localFilesInput) {
            localFilesInput.addEventListener('change', function () {
                uploadLocalFiles = Array.from(this.files || []);
                renderLocalUploadPreview();
            });
        }

        // 本地歌词选择
        var localLyricsInput = getEl('music-upload-local-lyrics');
        if (localLyricsInput) {
            localLyricsInput.addEventListener('change', function () {
                uploadLocalLyrics = Array.from(this.files || []);
                renderLocalUploadPreview();
            });
        }

        function getFileBaseName(name) {
            return (name || '').replace(/\.[^.]+$/, '').trim().toLowerCase();
        }

        function renderLocalUploadPreview() {
            var container = getEl('music-upload-local-preview');
            if (!container) return;
            if (uploadLocalFiles.length === 0) { container.innerHTML = ''; return; }
            var lrcNames = uploadLocalLyrics.map(function (f) { return getFileBaseName(f.name); });
            container.innerHTML = uploadLocalFiles.map(function (f) {
                var base = getFileBaseName(f.name);
                var matched = lrcNames.indexOf(base) >= 0;
                var tag = matched ? '<span class="upload-item-lrc">歌词已匹配</span>' : '<span class="upload-item-nolrc">无歌词</span>';
                return '<div class="music-upload-preview-item"><span class="upload-item-name">' + escapeHtml(f.name) + '</span>' + tag + '</div>';
            }).join('');
        }

        // URL歌词选择
        var urlLyricsInput = getEl('music-upload-url-lyrics');
        if (urlLyricsInput) {
            urlLyricsInput.addEventListener('change', function () {
                uploadUrlLyrics = Array.from(this.files || []);
            });
        }

        // 取消
        var uploadCancelBtn = getEl('music-upload-cancel-btn');
        if (uploadCancelBtn) uploadCancelBtn.addEventListener('click', closeMusicUploadModal);
        var uploadCloseBtn = getEl('music-upload-close-btn');
        if (uploadCloseBtn) uploadCloseBtn.addEventListener('click', closeMusicUploadModal);
        // 点击遮罩关闭
        var uploadModal = getEl('music-upload-modal');
        if (uploadModal) {
            uploadModal.addEventListener('click', function (e) {
                if (e.target === uploadModal) closeMusicUploadModal();
            });
        }

        // 确认添加
        var uploadConfirmBtn = getEl('music-upload-confirm-btn');
        if (uploadConfirmBtn) {
            uploadConfirmBtn.addEventListener('click', async function () {
                var activeTab = document.querySelector('.music-upload-tab.active');
                var tab = activeTab ? activeTab.getAttribute('data-tab') : 'local';

                if (tab === 'local') {
                    await handleLocalBatchUpload();
                } else {
                    await handleUrlBatchUpload();
                }
            });
        }

        async function readFileAsText(file) {
            return new Promise(function (resolve) {
                var reader = new FileReader();
                reader.onload = function () { resolve(reader.result || ''); };
                reader.onerror = function () { resolve(''); };
                reader.readAsText(file);
            });
        }

        async function handleLocalBatchUpload() {
            if (uploadLocalFiles.length === 0) {
                if (typeof showToast === 'function') showToast('请先选择音频文件');
                return;
            }
            // 读取所有歌词文件
            var lrcMap = {};
            for (var i = 0; i < uploadLocalLyrics.length; i++) {
                var lf = uploadLocalLyrics[i];
                var baseName = getFileBaseName(lf.name);
                lrcMap[baseName] = await readFileAsText(lf);
            }
            var count = 0;
            var lrcCount = 0;
            for (var j = 0; j < uploadLocalFiles.length; j++) {
                var af = uploadLocalFiles[j];
                var objUrl = URL.createObjectURL(af);
                var base = getFileBaseName(af.name);
                var lrc = lrcMap[base] || '';
                var item = addSongToPlaylist(objUrl, af.name, 'default', lrc, '');
                count++;
                if (lrc) lrcCount++;
                // 如果是第一首，自动播放
                if (j === 0) {
                    currentPlayingSongId = item.id;
                    currentPlayingCategoryId = 'default';
                    setSource(objUrl, af.name, { id: item.id, lrc: lrc });
                    playFromUserGesture();
                }
            }
            updatePrevNextState();
            if (typeof renderMusicQueuePanel === 'function') renderMusicQueuePanel();
            closeMusicUploadModal();
            if (typeof showToast === 'function') showToast('已添加 ' + count + ' 首（' + lrcCount + ' 首有歌词）');
        }

        async function handleUrlBatchUpload() {
            var textarea = getEl('music-upload-url-list');
            var text = textarea ? textarea.value.trim() : '';
            if (!text) {
                if (typeof showToast === 'function') showToast('请输入至少一个 URL');
                return;
            }
            var urls = text.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(function (s) { return s && s.startsWith('http'); });
            if (urls.length === 0) {
                if (typeof showToast === 'function') showToast('未检测到有效的 http/https 链接');
                return;
            }
            // 读取歌词
            var lrcList = [];
            for (var i = 0; i < uploadUrlLyrics.length; i++) {
                lrcList.push(await readFileAsText(uploadUrlLyrics[i]));
            }
            var count = 0;
            var lrcCount = 0;
            for (var j = 0; j < urls.length; j++) {
                var url = urls[j];
                var lrc = lrcList[j] || '';
                var title = 'URL 音频 ' + (j + 1);
                try {
                    localStorage.setItem(STORAGE_KEY_URL, url);
                    localStorage.setItem(STORAGE_KEY_TITLE, title);
                } catch (_) {}
                var item = addSongToPlaylist(url, title, 'default', lrc, '');
                count++;
                if (lrc) lrcCount++;
                if (j === 0) {
                    currentPlayingSongId = item.id;
                    currentPlayingCategoryId = 'default';
                    setSource(url, title, { id: item.id, lrc: lrc });
                    playFromUserGesture();
                }
            }
            updatePrevNextState();
            if (typeof renderMusicQueuePanel === 'function') renderMusicQueuePanel();
            closeMusicUploadModal();
            var msg = '已添加 ' + count + ' 首（' + lrcCount + ' 首有歌词）';
            if (typeof showToast === 'function') showToast(msg);
        }

        // ========== 歌词导入弹窗逻辑 ==========
        var lyricsImportFiles = [];
        var lyricsImportBindings = {}; // { fileIndex: songId }

        function openLyricsImportModal() {
            var modal = getEl('music-lyrics-import-modal');
            if (!modal) return;
            modal.style.display = 'flex';
            modal.classList.toggle('music-modal-light', getMusicTheme() === 'light');
            lyricsImportFiles = [];
            lyricsImportBindings = {};
            var filesInput = getEl('music-lyrics-import-files');
            if (filesInput) filesInput.value = '';
            var list = getEl('music-lyrics-import-list');
            if (list) list.innerHTML = '';
        }

        function closeLyricsImportModal() {
            var modal = getEl('music-lyrics-import-modal');
            if (modal) modal.style.display = 'none';
        }

        var lyricsImportFilesInput = getEl('music-lyrics-import-files');
        if (lyricsImportFilesInput) {
            lyricsImportFilesInput.addEventListener('change', function () {
                lyricsImportFiles = Array.from(this.files || []);
                renderLyricsImportList();
            });
        }

        function renderLyricsImportList() {
            var container = getEl('music-lyrics-import-list');
            if (!container) return;
            if (lyricsImportFiles.length === 0) { container.innerHTML = ''; return; }
            var songs = loadPlaylistSongs();
            container.innerHTML = lyricsImportFiles.map(function (f, idx) {
                var baseName = getFileBaseName(f.name);
                // 尝试自动匹配
                var autoMatch = '';
                for (var s = 0; s < songs.length; s++) {
                    if (getFileBaseName(songs[s].title).indexOf(baseName) >= 0 || baseName.indexOf(getFileBaseName(songs[s].title)) >= 0) {
                        autoMatch = songs[s].id;
                        break;
                    }
                }
                lyricsImportBindings[idx] = autoMatch;
                var options = '<option value="">— 选择要绑定的歌曲 —</option>';
                songs.forEach(function (s) {
                    var sel = s.id === autoMatch ? ' selected' : '';
                    options += '<option value="' + escapeHtml(s.id) + '"' + sel + '>' + escapeHtml(s.title) + '</option>';
                });
                return '<div class="lyrics-import-item"><div class="lyrics-import-item-name">' + escapeHtml(f.name) + (autoMatch ? ' <span class="lyrics-import-matched">已匹配</span>' : '') + '</div><select class="lyrics-import-select" data-idx="' + idx + '">' + options + '</select></div>';
            }).join('');
            container.querySelectorAll('.lyrics-import-select').forEach(function (sel) {
                sel.addEventListener('change', function () {
                    var idx = parseInt(this.getAttribute('data-idx'), 10);
                    lyricsImportBindings[idx] = this.value;
                });
            });
        }

        var lyricsImportCancelBtn = getEl('music-lyrics-import-cancel');
        if (lyricsImportCancelBtn) lyricsImportCancelBtn.addEventListener('click', closeLyricsImportModal);
        var lyricsImportCloseBtn = getEl('music-lyrics-import-close-btn');
        if (lyricsImportCloseBtn) lyricsImportCloseBtn.addEventListener('click', closeLyricsImportModal);
        // 点击遮罩关闭
        var lyricsModal = getEl('music-lyrics-import-modal');
        if (lyricsModal) {
            lyricsModal.addEventListener('click', function (e) {
                if (e.target === lyricsModal) closeLyricsImportModal();
            });
        }

        var lyricsImportConfirmBtn = getEl('music-lyrics-import-confirm');
        if (lyricsImportConfirmBtn) {
            lyricsImportConfirmBtn.addEventListener('click', async function () {
                if (lyricsImportFiles.length === 0) {
                    if (typeof showToast === 'function') showToast('请先选择歌词文件');
                    return;
                }
                var songs = loadPlaylistSongs();
                var boundCount = 0;
                for (var i = 0; i < lyricsImportFiles.length; i++) {
                    var songId = lyricsImportBindings[i];
                    if (!songId) continue;
                    var lrcText = await readFileAsText(lyricsImportFiles[i]);
                    if (!lrcText) continue;
                    var song = songs.find(function (s) { return s.id === songId; });
                    if (song) {
                        song.lrc = lrcText;
                        boundCount++;
                        // 如果是当前播放的歌曲，实时更新歌词
                        if (songId === currentPlayingSongId) {
                            lyricsData = parseLrc(lrcText);
                            saveLrcToStorage();
                            renderVinylLyrics();
                        }
                    }
                }
                savePlaylistSongs(songs);
                closeLyricsImportModal();
                if (typeof showToast === 'function') showToast('已绑定 ' + boundCount + ' 首歌词');
            });
        }

        function openMusicSearchPanel() {
            if (searchPanel) {
                searchPanel.classList.add('visible');
                searchPanel.classList.toggle('music-search-panel-light', getMusicTheme() === 'light');
                searchPanel.setAttribute('aria-hidden', 'false');
            }
            if (searchBackdrop) {
                searchBackdrop.classList.add('visible');
                searchBackdrop.setAttribute('aria-hidden', 'false');
            }
            if (searchInput) { searchInput.value = ''; searchInput.focus(); }
            if (searchResultsEl) searchResultsEl.innerHTML = '';
            if (searchLoading) searchLoading.style.display = 'none';
            searchResultList = [];
            searchMultiselectMode = false;
            searchSelectedIndices = [];
            if (searchMultiselectBtn) searchMultiselectBtn.style.display = 'none';
            if (searchResultToolbar) searchResultToolbar.style.display = 'none';
        }
        function closeMusicSearchPanel() {
            if (searchPanel) { searchPanel.classList.remove('visible'); searchPanel.setAttribute('aria-hidden', 'true'); }
            if (searchBackdrop) { searchBackdrop.classList.remove('visible'); searchBackdrop.setAttribute('aria-hidden', 'true'); }
        }
        function renderSearchResults(list) {
            if (!searchResultsEl) return;
            var withCb = searchMultiselectMode;
            searchResultsEl.innerHTML = list.map(function (item, i) {
                var title = escapeHtml(item.name) + ' - ' + escapeHtml(item.artist);
                var cb = withCb ? '<input type="checkbox" class="music-search-result-item-cb" data-index="' + i + '">' : '';
                var lrcTag = item._hasLrc === true ? '<span class="music-search-result-lrc-tag">词</span>' : (item._hasLrc === false ? '<span class="music-search-result-nolrc-tag">无词</span>' : '');
                return '<li class="music-search-result-item" data-index="' + i + '">' + cb + '<span class="music-search-result-title">' + title + '</span>' + lrcTag + '<span class="music-search-result-platform">' + escapeHtml(item.platform) + '</span></li>';
            }).join('');
            var listArr = list;
            searchResultsEl.querySelectorAll('.music-search-result-item').forEach(function (li) {
                var idx = parseInt(li.getAttribute('data-index'), 10);
                var cb = li.querySelector('.music-search-result-item-cb');
                if (cb) {
                    cb.checked = searchSelectedIndices.indexOf(idx) >= 0;
                    cb.addEventListener('click', function (e) { e.stopPropagation(); });
                    li.addEventListener('click', function (e) {
                        if (e.target === cb) return;
                        var i = searchSelectedIndices.indexOf(idx);
                        if (i >= 0) searchSelectedIndices.splice(i, 1); else searchSelectedIndices.push(idx);
                        cb.checked = searchSelectedIndices.indexOf(idx) >= 0;
                    });
                } else {
                    li.addEventListener('click', async function () {
                        var it = listArr[idx];
                        if (!it || !it.playUrl) return;
                        li.style.opacity = '0.5';
                        li.style.pointerEvents = 'none';
                        // 获取歌词
                        var lrc = '';
                        var api = searchApi ? searchApi.value : 'meting1';
                        var sid = it.songId || '';
                        if (sid) {
                            try {
                                if (api === 'meting1') lrc = await fetchLrcFromMeting('https://api.i-meto.com/meting/api', it.source, sid);
                                else if (api === 'meting2') lrc = await fetchLrcFromMeting('https://meting.qjqq.cn/api.php', it.source, sid);
                                else if (api === 'meting3') lrc = await fetchLrcFromVkeys(it.source, sid);
                            } catch (_) {}
                            // 如果当前API拿不到，尝试其他API
                            if (!lrc) {
                                try { lrc = await fetchLrcFromMeting('https://api.i-meto.com/meting/api', it.source, sid); } catch (_) {}
                            }
                            if (!lrc) {
                                try { lrc = await fetchLrcFromMeting('https://meting.qjqq.cn/api.php', it.source, sid); } catch (_) {}
                            }
                            if (!lrc) {
                                try { lrc = await fetchLrcFromVkeys(it.source, sid); } catch (_) {}
                            }
                        }
                        var title = it.name + ' - ' + it.artist;
                        var added = addSongToPlaylist(it.playUrl, title, 'default', lrc, it.cover || '');
                        currentPlayingSongId = added.id;
                        currentPlayingCategoryId = 'default';
                        setSource(it.playUrl, title, { id: added.id, lrc: lrc, cover: it.cover || '' });
                        updatePrevNextState();
                        playFromUserGesture();
                        if (typeof renderMusicQueuePanel === 'function') renderMusicQueuePanel();
                        closeMusicSearchPanel();
                        if (lrc) {
                            if (typeof showToast === 'function') showToast('已添加，歌词已同步');
                        } else {
                            if (typeof showToast === 'function') showToast('已添加，暂无歌词');
                        }
                    });
                }
            });
        }
        function checkUrlOk(url, timeoutMs) {
            if (!url || url.indexOf('blob:') === 0) return Promise.resolve(true);
            var ctrl = new AbortController();
            var t = setTimeout(function () { ctrl.abort(); }, timeoutMs || 6000);
            return fetch(url, { method: 'HEAD', signal: ctrl.signal }).then(function (r) { clearTimeout(t); return r.ok || r.status === 200; }).catch(function () { clearTimeout(t); return false; });
        }
        async function checkLyricsForResults(list, api) {
            for (var i = 0; i < list.length; i++) {
                var it = list[i];
                if (!it.songId) { it._hasLrc = false; continue; }
                try {
                    var lrc = '';
                    if (api === 'meting1') lrc = await fetchLrcFromMeting('https://api.i-meto.com/meting/api', it.source, it.songId);
                    else if (api === 'meting2') lrc = await fetchLrcFromMeting('https://meting.qjqq.cn/api.php', it.source, it.songId);
                    else if (api === 'meting3') lrc = await fetchLrcFromVkeys(it.source, it.songId);
                    if (!lrc) { try { lrc = await fetchLrcFromMeting('https://api.i-meto.com/meting/api', it.source, it.songId); } catch (_) {} }
                    it._hasLrc = !!lrc;
                } catch (_) { it._hasLrc = false; }
                // 每检测完一首就刷新一次列表
                renderSearchResults(list);
            }
        }
        async function runMusicSearch() {
            var keyword = searchInput && searchInput.value.trim();
            if (!keyword) {
                if (typeof showToast === 'function') showToast('请输入歌曲名或歌手名');
                return;
            }
            if (searchLoading) searchLoading.style.display = 'block';
            if (searchResultsEl) searchResultsEl.innerHTML = '';
            if (searchMultiselectBtn) searchMultiselectBtn.style.display = 'none';
            if (searchResultToolbar) searchResultToolbar.style.display = 'none';
            searchMultiselectMode = false;
            searchSelectedIndices = [];
            var api = searchApi ? searchApi.value : 'meting1';
            try {
                var list = [];
                if (api === 'meting1') list = await searchMetingCore('https://api.i-meto.com/meting/api', keyword);
                else if (api === 'meting2') list = await searchMetingCore('https://meting.qjqq.cn/api.php', keyword);
                else if (api === 'meting3') list = await searchVkeysCore('https://api.vkeys.cn/v2/music', keyword);
                if (searchLoading) searchLoading.style.display = 'none';
                if (!searchResultsEl) return;
                if (list.length === 0) {
                    searchResultsEl.innerHTML = '<li class="music-search-no-result">未找到相关歌曲，可换关键词或切换 API 重试</li>';
                    return;
                }
                searchResultList = list;
                if (searchMultiselectBtn) searchMultiselectBtn.style.display = '';
                renderSearchResults(list);
                // 异步检测歌词可用性并更新标识
                checkLyricsForResults(list, api);
            } catch (err) {
                console.error('在线搜索失败:', err);
                if (searchLoading) searchLoading.style.display = 'none';
                if (searchResultsEl) searchResultsEl.innerHTML = '<li class="music-search-no-result">搜索失败，请检查网络或稍后重试</li>';
            }
        }
        if (searchMultiselectBtn) {
            searchMultiselectBtn.addEventListener('click', function () {
                searchMultiselectMode = true;
                searchSelectedIndices = [];
                if (searchResultToolbar) searchResultToolbar.style.display = 'flex';
                renderSearchResults(searchResultList);
            });
        }
        if (searchCancelSelectBtn) {
            searchCancelSelectBtn.addEventListener('click', function () {
                searchMultiselectMode = false;
                searchSelectedIndices = [];
                if (searchResultToolbar) searchResultToolbar.style.display = 'none';
                renderSearchResults(searchResultList);
            });
        }
        if (searchBatchAddBtn) {
            searchBatchAddBtn.addEventListener('click', async function () {
                if (searchSelectedIndices.length === 0) {
                    if (typeof showToast === 'function') showToast('请先勾选要添加的歌曲');
                    return;
                }
                var successCount = 0;
                var lrcCount = 0;
                var listArr = searchResultList;
                var api = searchApi ? searchApi.value : 'meting1';
                for (var i = 0; i < searchSelectedIndices.length; i++) {
                    var idx = searchSelectedIndices[i];
                    var it = listArr[idx];
                    if (!it || !it.playUrl) continue;
                    // 获取歌词
                    var lrc = '';
                    var sid = it.songId || '';
                    if (sid) {
                        try {
                            if (api === 'meting1') lrc = await fetchLrcFromMeting('https://api.i-meto.com/meting/api', it.source, sid);
                            else if (api === 'meting2') lrc = await fetchLrcFromMeting('https://meting.qjqq.cn/api.php', it.source, sid);
                            else if (api === 'meting3') lrc = await fetchLrcFromVkeys(it.source, sid);
                        } catch (_) {}
                        if (!lrc) { try { lrc = await fetchLrcFromMeting('https://api.i-meto.com/meting/api', it.source, sid); } catch (_) {} }
                        if (!lrc) { try { lrc = await fetchLrcFromMeting('https://meting.qjqq.cn/api.php', it.source, sid); } catch (_) {} }
                    }
                    var title = it.name + ' - ' + it.artist;
                    addSongToPlaylist(it.playUrl, title, 'default', lrc, it.cover || '');
                    successCount++;
                    if (lrc) lrcCount++;
                }
                if (typeof renderMusicQueuePanel === 'function') renderMusicQueuePanel();
                updatePrevNextState();
                var msg = '成功添加 ' + successCount + ' 首（' + lrcCount + ' 首有歌词）';
                if (typeof showToast === 'function') showToast(msg); else alert(msg);
            });
        }
        if (searchBack) searchBack.addEventListener('click', closeMusicSearchPanel);
        if (searchBackdrop) searchBackdrop.addEventListener('click', closeMusicSearchPanel);
        if (searchBtn) searchBtn.addEventListener('click', runMusicSearch);
        if (searchInput) searchInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') runMusicSearch(); });

        // 本地上传 / URL 按钮
        if (btnLocal && fileInput) {
            btnLocal.addEventListener('click', function () { fileInput.click(); });
        }
        if (btnUrl) {
            btnUrl.addEventListener('click', function () {
                if (urlRow) urlRow.classList.toggle('visible');
                if (urlRow && urlRow.classList.contains('visible') && urlInput) urlInput.focus();
            });
        }

        // 恢复上次 URL
        const savedUrl = (function () {
            try { return localStorage.getItem(STORAGE_KEY_URL) || ''; } catch (_) { return ''; }
        })();
        const savedTitle = (function () {
            try { return localStorage.getItem(STORAGE_KEY_TITLE) || ''; } catch (_) { return ''; }
        })();
        if (savedUrl && savedUrl.startsWith('http')) {
            if (urlInput) urlInput.value = savedUrl;
            const songs = loadPlaylistSongs();
            const existing = songs.find(s => s.src === savedUrl);
            if (existing) {
                currentPlayingSongId = existing.id;
                currentPlayingCategoryId = existing.categoryId || 'default';
                setSource(savedUrl, savedTitle || '已保存的音频', { id: existing.id, lrc: existing.lrc, cover: existing.cover });
            } else {
                const item = addSongToPlaylist(savedUrl, savedTitle || '已保存的音频', 'default');
                currentPlayingSongId = item.id;
                currentPlayingCategoryId = 'default';
                setSource(savedUrl, savedTitle || '已保存的音频', { id: item.id });
            }
            updatePrevNextState();
        }

        // 恢复歌词
        const savedLrc = loadLrcFromStorage();
        if (savedLrc) {
            lyricsData = parseLrc(savedLrc);
        }
        renderVinylLyrics();

        // 本地上传（加入默认歌单，本地 blob 仅当前会话有效）
        if (fileInput) {
            fileInput.addEventListener('change', function () {
                const file = this.files && this.files[0];
                if (!file) return;
                revokeObjectUrl();
                currentObjectUrl = URL.createObjectURL(file);
                const item = addSongToPlaylist(currentObjectUrl, file.name, 'default');
                currentPlayingSongId = item.id;
                currentPlayingCategoryId = 'default';
                setSource(currentObjectUrl, file.name, { id: item.id });
                playFromUserGesture();
                this.value = '';
                updatePrevNextState();
                if (typeof renderMusicQueuePanel === 'function') renderMusicQueuePanel();
            });
        }

        // URL 使用（加入默认歌单）
        if (urlApplyBtn && urlInput) {
            urlApplyBtn.addEventListener('click', async function () {
                const url = urlInput.value.trim();
                if (!url) return;
                if (!url.startsWith('http')) {
                    if (typeof showToast === 'function') showToast('请输入有效的 http/https 链接');
                    return;
                }
                // 直接添加，不检测有效性
                try {
                    localStorage.setItem(STORAGE_KEY_URL, url);
                    localStorage.setItem(STORAGE_KEY_TITLE, 'URL 音频');
                } catch (_) {}
                const item = addSongToPlaylist(url, 'URL 音频', 'default');
                currentPlayingSongId = item.id;
                currentPlayingCategoryId = 'default';
                setSource(url, 'URL 音频', { id: item.id });
                playFromUserGesture();
                updatePrevNextState();
                if (typeof renderMusicQueuePanel === 'function') renderMusicQueuePanel();
            });
        }

        // 进度条
        if (progress) {
            progress.addEventListener('input', function () {
                const el = getAudio();
                if (el.src) el.currentTime = parseFloat(this.value) || 0;
            });
        }

        // 播放/暂停
        playBtn.addEventListener('click', function () {
            const el = getAudio();
            if (!el.src) return;
            userHasInteracted = true;
            if (el.paused) el.play(); else el.pause();
        });

        // 播放模式：恢复上次保存的模式
        try { playMode = localStorage.getItem(STORAGE_KEY_PLAY_MODE) || 'single'; } catch (_) { playMode = 'single'; }
        if (!['single', 'order', 'shuffle'].includes(playMode)) playMode = 'single';

        function updatePlayModeUI() {
            const btnLoopEl = getEl('music-btn-loop');
            if (!btnLoopEl) return;
            var iconSingle = btnLoopEl.querySelector('.loop-icon-single');
            var iconOrder = btnLoopEl.querySelector('.loop-icon-order');
            var iconShuffle = btnLoopEl.querySelector('.loop-icon-shuffle');
            if (iconSingle) iconSingle.style.display = playMode === 'single' ? '' : 'none';
            if (iconOrder) iconOrder.style.display = playMode === 'order' ? '' : 'none';
            if (iconShuffle) iconShuffle.style.display = playMode === 'shuffle' ? '' : 'none';
            btnLoopEl.classList.toggle('is-active', true);
            var labels = { single: '单曲循环', order: '顺序播放', shuffle: '随机播放' };
            btnLoopEl.title = labels[playMode] || '单曲循环';
            var metaEl = getEl('music-meta');
            if (metaEl) metaEl.textContent = getPlayModeLabel() + ' · 保活';
        }

        function cyclePlayMode() {
            if (playMode === 'single') playMode = 'order';
            else if (playMode === 'order') playMode = 'shuffle';
            else playMode = 'single';
            try { localStorage.setItem(STORAGE_KEY_PLAY_MODE, playMode); } catch (_) {}
            updatePlayModeUI();
            if (typeof showToast === 'function') showToast(getPlayModeLabel());
        }

        const btnLoop = getEl('music-btn-loop');
        if (btnLoop) btnLoop.addEventListener('click', cyclePlayMode);
        updatePlayModeUI();

        function updatePrevNextState() {
            const songs = loadPlaylistSongs();
            const list = getSongsInCategory(songs, currentPlayingCategoryId);
            const idx = list.findIndex(s => s.id === currentPlayingSongId);
            const btnPrev = getEl('music-btn-prev');
            const btnNext = getEl('music-btn-next');
            if (btnPrev) btnPrev.disabled = idx <= 0;
            if (btnNext) btnNext.disabled = idx < 0 || idx >= list.length - 1;
        }

        function playNextSongAuto() {
            var songs = loadPlaylistSongs();
            var list = getSongsInCategory(songs, currentPlayingCategoryId);
            var idx = list.findIndex(function (s) { return s.id === currentPlayingSongId; });
            if (idx >= 0 && idx < list.length - 1) {
                var next = list[idx + 1];
                currentPlayingSongId = next.id;
                setSource(next.src, next.title, { id: next.id, lrc: next.lrc, cover: next.cover });
                updatePrevNextState();
                getAudio().play().catch(function () {});
            } else if (list.length > 0) {
                var first = list[0];
                currentPlayingSongId = first.id;
                setSource(first.src, first.title, { id: first.id, lrc: first.lrc, cover: first.cover });
                updatePrevNextState();
                getAudio().play().catch(function () {});
            }
        }

        function playRandomSongAuto() {
            var songs = loadPlaylistSongs();
            var list = getSongsInCategory(songs, currentPlayingCategoryId);
            if (list.length <= 1) {
                getAudio().currentTime = 0;
                getAudio().play().catch(function () {});
                return;
            }
            var idx;
            do {
                idx = Math.floor(Math.random() * list.length);
            } while (list[idx].id === currentPlayingSongId && list.length > 1);
            var song = list[idx];
            currentPlayingSongId = song.id;
            setSource(song.src, song.title, { id: song.id, lrc: song.lrc, cover: song.cover });
            updatePrevNextState();
            getAudio().play().catch(function () {});
        }

        window._musicPlayNext = playNextSongAuto;
        window._musicPlayRandom = playRandomSongAuto;

        function playSongAt(categoryId, indexInCategory) {
            const songs = loadPlaylistSongs();
            const list = getSongsInCategory(songs, categoryId);
            const song = list[indexInCategory];
            if (!song) return;
            currentPlayingSongId = song.id;
            currentPlayingCategoryId = categoryId;
            setSource(song.src, song.title, { id: song.id, lrc: song.lrc, cover: song.cover });
            updatePrevNextState();
            playFromUserGesture();
        }

        const btnPrev = getEl('music-btn-prev');
        const btnNext = getEl('music-btn-next');
        if (btnPrev) {
            btnPrev.addEventListener('click', function () {
                const songs = loadPlaylistSongs();
                const list = getSongsInCategory(songs, currentPlayingCategoryId);
                const idx = list.findIndex(s => s.id === currentPlayingSongId);
                if (idx > 0) playSongAt(currentPlayingCategoryId, idx - 1);
            });
        }
        if (btnNext) {
            btnNext.addEventListener('click', function () {
                const songs = loadPlaylistSongs();
                const list = getSongsInCategory(songs, currentPlayingCategoryId);
                const idx = list.findIndex(s => s.id === currentPlayingSongId);
                if (idx >= 0 && idx < list.length - 1) playSongAt(currentPlayingCategoryId, idx + 1);
            });
        }
        updatePrevNextState();

        // ---------- 播放列表面板（歌单分类 + 多选移动） ----------
        let currentViewCategoryId = 'default';
        let queueMultiselectMode = false;
        let queueSelectedIds = [];

        const queuePanel = getEl('music-queue-panel');
        const queueBackdrop = getEl('music-queue-backdrop');
        const queueClose = getEl('music-queue-close');
        const queueTabsEl = getEl('music-queue-tabs');
        const queueListEl = getEl('music-queue-list');
        const queueEmptyEl = getEl('music-queue-empty');
        const queueAddCatBtn = getEl('music-queue-add-cat');
        const queueMultiselectBtn = getEl('music-queue-multiselect-btn');
        const queueMoveBtn = getEl('music-queue-move-btn');
        const queueDeleteBtn = getEl('music-queue-delete-btn');
        const queueCancelSelectBtn = getEl('music-queue-cancel-select');
        const queueCleanBtn = getEl('music-queue-clean-btn');
        const moveSheet = getEl('music-move-sheet');
        const moveCategoryList = getEl('music-move-category-list');
        const moveCancelBtn = getEl('music-move-cancel');
        const addCatModal = getEl('music-add-category-modal');
        const newCatNameInput = getEl('music-new-category-name');
        const addCatConfirmBtn = getEl('music-add-category-confirm');
        const addCatCancelBtn = getEl('music-add-category-cancel');

        function openQueuePanel() {
            if (queuePanel) queuePanel.classList.add('visible');
            if (queueBackdrop) queueBackdrop.classList.add('visible');
            if (queuePanel) queuePanel.setAttribute('aria-hidden', 'false');
            if (queueBackdrop) queueBackdrop.setAttribute('aria-hidden', 'false');
            queueMultiselectMode = false;
            queueSelectedIds = [];
            if (queueMoveBtn) queueMoveBtn.style.display = 'none';
            if (queueDeleteBtn) queueDeleteBtn.style.display = 'none';
            if (queueCancelSelectBtn) queueCancelSelectBtn.style.display = 'none';
            renderMusicQueuePanel();
        }
        async function runQueueCleanup() {
            if (!queueCleanBtn) return;
            queueCleanBtn.disabled = true;
            if (typeof showToast === 'function') showToast('正在检测…');
            var songs = loadPlaylistSongs();
            var list = getSongsInCategory(songs, currentViewCategoryId);
            var toRemove = [];
            for (var i = 0; i < list.length; i++) {
                var s = list[i];
                if (s.src.indexOf('http') !== 0) continue;
                var ok = await checkUrlOk(s.src, 5000);
                if (!ok) toRemove.push(s);
            }
            queueCleanBtn.disabled = false;
            if (toRemove.length === 0) {
                if (typeof showToast === 'function') showToast('当前歌单无无效歌曲');
                return;
            }
            // 显示清理弹窗
            if (cleanModal && cleanModalBody) {
                var html = '<p>检测到 ' + toRemove.length + ' 首无效歌曲：</p>';
                html += '<ul class="music-clean-modal-list">';
                toRemove.forEach(function (s) {
                    var safeAttr = (s.title + '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
                    html += '<li><span>' + escapeHtml(s.title) + '</span><a href="#" class="music-queue-removed-search-link" data-title="' + safeAttr + '">去搜索</a></li>';
                });
                html += '</ul>';
                cleanModalBody.innerHTML = html;
                cleanModal.classList.toggle('music-clean-modal-light', getMusicTheme() === 'light');
                cleanModal.classList.add('visible');
                // 绑定搜索链接
                cleanModalBody.querySelectorAll('.music-queue-removed-search-link').forEach(function (a) {
                    a.addEventListener('click', function (e) {
                        e.preventDefault();
                        var title = a.getAttribute('data-title') || '';
                        closeCleanModal();
                        closeQueuePanel();
                        openMusicSearchPanel();
                        if (searchInput) searchInput.value = title;
                        if (searchInput) searchInput.focus();
                    });
                });
                // 执行删除
                var removedIds = toRemove.map(function (s) { return s.id; });
                if (currentPlayingSongId && removedIds.indexOf(currentPlayingSongId) >= 0) {
                    currentPlayingSongId = null;
                    var el = getAudio();
                    if (el) el.src = '';
                }
                var newSongs = songs.filter(function (s) { return removedIds.indexOf(s.id) < 0; });
                savePlaylistSongs(newSongs);
                updatePrevNextState();
                renderMusicQueuePanel();
            }
        }
        function closeCleanModal() {
            if (cleanModal) cleanModal.classList.remove('visible');
        }
        if (cleanModalClose) cleanModalClose.addEventListener('click', closeCleanModal);
        if (cleanCloseBtn) cleanCloseBtn.addEventListener('click', closeCleanModal);
        if (cleanModal) {
            cleanModal.addEventListener('click', function (e) {
                if (e.target === cleanModal) closeCleanModal();
            });
        }
        if (queueCleanBtn) queueCleanBtn.addEventListener('click', runQueueCleanup);

        function closeQueuePanel() {
            if (queuePanel) queuePanel.classList.remove('visible');
            if (queueBackdrop) queueBackdrop.classList.remove('visible');
            if (queuePanel) queuePanel.setAttribute('aria-hidden', 'true');
            if (queueBackdrop) queueBackdrop.setAttribute('aria-hidden', 'true');
        }

        function renderMusicQueuePanel() {
            const categories = loadCategories();
            const songs = loadPlaylistSongs();

            if (queueTabsEl) {
                queueTabsEl.innerHTML = categories.map(cat => {
                    const active = cat.id === currentViewCategoryId ? ' music-queue-tab-active' : '';
                    return '<button type="button" class="music-queue-tab' + active + '" data-category-id="' + escapeHtml(cat.id) + '">' + escapeHtml(cat.name) + '</button>';
                }).join('');
                queueTabsEl.querySelectorAll('.music-queue-tab').forEach(btn => {
                    btn.addEventListener('click', function () {
                        currentViewCategoryId = this.getAttribute('data-category-id') || 'default';
                        renderMusicQueuePanel();
                    });
                });
            }

            const list = getSongsInCategory(songs, currentViewCategoryId);
            if (queueListEl) {
                queueListEl.innerHTML = list.map(song => {
                    const isCurrent = song.id === currentPlayingSongId;
                    const checked = queueSelectedIds.indexOf(song.id) >= 0 ? ' checked' : '';
                    const currentClass = isCurrent ? ' music-queue-item-current' : '';
                    const cb = queueMultiselectMode ? '<input type="checkbox" class="music-queue-item-cb" data-id="' + escapeHtml(song.id) + '"' + checked + '>' : '';
                    return '<li class="music-queue-item' + currentClass + '" data-id="' + escapeHtml(song.id) + '">' + cb + '<span class="music-queue-item-title">' + escapeHtml(song.title) + '</span></li>';
                }).join('');
                queueListEl.querySelectorAll('.music-queue-item').forEach(li => {
                    const id = li.getAttribute('data-id');
                    const checkbox = li.querySelector('.music-queue-item-cb');
                    if (checkbox) {
                        checkbox.addEventListener('change', function () {
                            if (this.checked) queueSelectedIds.push(id); else queueSelectedIds = queueSelectedIds.filter(x => x !== id);
                            var hasSelection = queueSelectedIds.length > 0;
                            if (queueMoveBtn) queueMoveBtn.style.display = hasSelection ? '' : 'none';
                            if (queueDeleteBtn) queueDeleteBtn.style.display = hasSelection ? '' : 'none';
                        });
                    }
                    li.addEventListener('click', function (e) {
                        if (e.target.classList.contains('music-queue-item-cb')) return;
                        if (queueMultiselectMode) {
                            if (checkbox) { checkbox.checked = !checkbox.checked; checkbox.dispatchEvent(new Event('change')); }
                        } else {
                            const s = list.find(x => x.id === id);
                            if (s) {
                                const idx = list.indexOf(s);
                                playSongAt(currentViewCategoryId, idx);
                                closeQueuePanel();
                            }
                        }
                    });
                });
            }
            if (queueEmptyEl) queueEmptyEl.style.display = list.length === 0 ? 'block' : 'none';
        }

        if (getEl('music-btn-queue')) {
            getEl('music-btn-queue').addEventListener('click', openQueuePanel);
        }
        if (queueClose) queueClose.addEventListener('click', closeQueuePanel);
        if (queueBackdrop) queueBackdrop.addEventListener('click', closeQueuePanel);

        if (queueAddCatBtn) {
            queueAddCatBtn.addEventListener('click', function () {
                if (addCatModal) addCatModal.style.display = 'flex';
                if (newCatNameInput) { newCatNameInput.value = ''; newCatNameInput.focus(); }
            });
        }
        if (addCatConfirmBtn && newCatNameInput) {
            addCatConfirmBtn.addEventListener('click', function () {
                const name = newCatNameInput.value.trim();
                if (!name) return;
                const cats = loadCategories();
                const id = 'cat_' + Date.now();
                cats.push({ id, name });
                saveCategories(cats);
                if (addCatModal) addCatModal.style.display = 'none';
                currentViewCategoryId = id;
                renderMusicQueuePanel();
            });
        }
        if (addCatCancelBtn) {
            addCatCancelBtn.addEventListener('click', function () {
                if (addCatModal) addCatModal.style.display = 'none';
            });
        }

        if (queueMultiselectBtn) {
            queueMultiselectBtn.addEventListener('click', function () {
                queueMultiselectMode = !queueMultiselectMode;
                queueSelectedIds = [];
                if (queueMoveBtn) queueMoveBtn.style.display = 'none';
                if (queueDeleteBtn) queueDeleteBtn.style.display = 'none';
                if (queueCancelSelectBtn) queueCancelSelectBtn.style.display = queueMultiselectMode ? '' : 'none';
                queueMultiselectBtn.textContent = queueMultiselectMode ? '取消多选' : '多选';
                renderMusicQueuePanel();
            });
        }
        if (queueCancelSelectBtn) {
            queueCancelSelectBtn.addEventListener('click', function () {
                queueMultiselectMode = false;
                queueSelectedIds = [];
                if (queueMoveBtn) queueMoveBtn.style.display = 'none';
                if (queueDeleteBtn) queueDeleteBtn.style.display = 'none';
                queueCancelSelectBtn.style.display = 'none';
                if (queueMultiselectBtn) queueMultiselectBtn.textContent = '多选';
                renderMusicQueuePanel();
            });
        }
        if (queueMoveBtn) {
            queueMoveBtn.addEventListener('click', function () {
                if (queueSelectedIds.length === 0) return;
                const cats = loadCategories();
                if (moveCategoryList) {
                    moveCategoryList.innerHTML = cats.map(cat => {
                        return '<button type="button" class="action-sheet-button music-move-cat-btn" data-cat-id="' + escapeHtml(cat.id) + '">' + escapeHtml(cat.name) + '</button>';
                    }).join('');
                    moveCategoryList.querySelectorAll('.music-move-cat-btn').forEach(btn => {
                        btn.addEventListener('click', function () {
                            const targetId = this.getAttribute('data-cat-id');
                            moveSongsToCategory(queueSelectedIds, targetId);
                            if (moveSheet) moveSheet.style.display = 'none';
                            queueMultiselectMode = false;
                            queueSelectedIds = [];
                            if (queueMoveBtn) queueMoveBtn.style.display = 'none';
                            if (queueDeleteBtn) queueDeleteBtn.style.display = 'none';
                            if (queueCancelSelectBtn) queueCancelSelectBtn.style.display = 'none';
                            if (queueMultiselectBtn) queueMultiselectBtn.textContent = '多选';
                            renderMusicQueuePanel();
                        });
                    });
                }
                if (moveSheet) moveSheet.style.display = 'flex';
            });
        }
        if (moveCancelBtn) {
            moveCancelBtn.addEventListener('click', function () {
                if (moveSheet) moveSheet.style.display = 'none';
            });
        }

        // 多选删除
        if (queueDeleteBtn) {
            queueDeleteBtn.addEventListener('click', function () {
                if (queueSelectedIds.length === 0) return;
                var songs = loadPlaylistSongs();
                // 如果当前播放的歌曲在删除列表中，停止播放
                if (currentPlayingSongId && queueSelectedIds.indexOf(currentPlayingSongId) >= 0) {
                    currentPlayingSongId = null;
                    var el = getAudio();
                    if (el) { el.pause(); el.src = ''; }
                    getEl('music-title').textContent = '未选择音频';
                    var headerTitle = getEl('music-header-title');
                    if (headerTitle) headerTitle.textContent = '未选择音频';
                }
                var newSongs = songs.filter(function (s) { return queueSelectedIds.indexOf(s.id) < 0; });
                savePlaylistSongs(newSongs);
                var count = queueSelectedIds.length;
                queueMultiselectMode = false;
                queueSelectedIds = [];
                if (queueMoveBtn) queueMoveBtn.style.display = 'none';
                if (queueDeleteBtn) queueDeleteBtn.style.display = 'none';
                if (queueCancelSelectBtn) queueCancelSelectBtn.style.display = 'none';
                if (queueMultiselectBtn) queueMultiselectBtn.textContent = '多选';
                updatePrevNextState();
                renderMusicQueuePanel();
                if (typeof showToast === 'function') showToast('已删除 ' + count + ' 首歌曲');
            });
        }

        window.renderMusicQueuePanel = renderMusicQueuePanel;

        function getMusicTheme() {
            try { return localStorage.getItem(STORAGE_KEY_THEME) || 'dark'; } catch (_) { return 'dark'; }
        }
        function setMusicTheme(theme) {
            try { localStorage.setItem(STORAGE_KEY_THEME, theme); } catch (_) {}
            applyMusicTheme(theme);
        }
        function applyMusicTheme(theme) {
            const screen = getEl('music-screen');
            if (!screen) return;
            screen.classList.toggle('music-theme-light', theme === 'light');
            const sheet = getEl('music-source-sheet');
            if (sheet) sheet.classList.toggle('music-sheet-theme-light', theme === 'light');
            const qPanel = getEl('music-queue-panel');
            if (qPanel) qPanel.classList.toggle('music-queue-panel-light', theme === 'light');
            const sPanel = getEl('music-search-panel');
            if (sPanel) sPanel.classList.toggle('music-search-panel-light', theme === 'light');
            const bgPanel = getEl('music-bg-panel');
            if (bgPanel) bgPanel.classList.toggle('music-bg-panel-light', theme === 'light');
            const upModal = getEl('music-upload-modal');
            if (upModal) upModal.classList.toggle('music-modal-light', theme === 'light');
            const lrcModal = getEl('music-lyrics-import-modal');
            if (lrcModal) lrcModal.classList.toggle('music-modal-light', theme === 'light');
            const btn = getEl('music-theme-toggle');
            if (!btn) return;
            const sun = btn.querySelector('.music-theme-icon-sun');
            const moon = btn.querySelector('.music-theme-icon-moon');
            if (sun) sun.style.display = theme === 'light' ? 'block' : 'none';
            if (moon) moon.style.display = theme === 'light' ? 'none' : 'block';
        }
        applyMusicTheme(getMusicTheme());
        const themeToggle = getEl('music-theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', function () {
                setMusicTheme(getMusicTheme() === 'dark' ? 'light' : 'dark');
            });
        }

        // ---------- 音乐播放器自定义背景 ----------
        const STORAGE_KEY_BG = 'music_player_bg';
        const STORAGE_KEY_BG_COVER = 'music_player_bg_cover_vinyl';
        const bgLayer = getEl('music-bg-layer');
        const bgPanel = getEl('music-bg-panel');
        const bgBackdrop = getEl('music-bg-backdrop');
        const bgPanelBack = getEl('music-bg-panel-back');
        const bgPreview = getEl('music-bg-preview');
        const bgPreviewText = getEl('music-bg-preview-text');
        const bgLocalBtn = getEl('music-bg-local-btn');
        const bgUrlBtn = getEl('music-bg-url-btn');
        const bgResetBtn = getEl('music-bg-reset-btn');
        const bgUrlRow = getEl('music-bg-url-row');
        const bgUrlInput = getEl('music-bg-url-input');
        const bgUrlApply = getEl('music-bg-url-apply');
        const bgFileInput = getEl('music-bg-file-input');
        const bgCoverVinylCheck = getEl('music-bg-cover-vinyl');
        const bgSettingsBtn = getEl('music-bg-settings-btn');

        function loadMusicBg() {
            try { return localStorage.getItem(STORAGE_KEY_BG) || ''; } catch (_) { return ''; }
        }
        function saveMusicBg(url) {
            try { localStorage.setItem(STORAGE_KEY_BG, url || ''); } catch (_) {}
        }
        function loadBgCoverVinyl() {
            try { return localStorage.getItem(STORAGE_KEY_BG_COVER) === 'true'; } catch (_) { return false; }
        }
        function saveBgCoverVinyl(val) {
            try { localStorage.setItem(STORAGE_KEY_BG_COVER, val ? 'true' : 'false'); } catch (_) {}
        }

        function applyMusicBg() {
            var url = loadMusicBg();
            var coverVinyl = loadBgCoverVinyl();
            var screen = getEl('music-screen');
            if (bgLayer) {
                if (url) {
                    bgLayer.style.backgroundImage = 'url(' + url + ')';
                    bgLayer.classList.add('active');
                    if (screen) screen.classList.add('has-music-bg');
                } else {
                    bgLayer.style.backgroundImage = '';
                    bgLayer.classList.remove('active');
                    if (screen) screen.classList.remove('has-music-bg');
                }
            }
            if (screen) screen.classList.toggle('music-bg-cover-vinyl', !!(url && coverVinyl));
            if (bgCoverVinylCheck) bgCoverVinylCheck.checked = coverVinyl;
            if (bgPreview) {
                if (url) {
                    bgPreview.style.backgroundImage = 'url(' + url + ')';
                    if (bgPreviewText) bgPreviewText.style.display = 'none';
                } else {
                    bgPreview.style.backgroundImage = '';
                    if (bgPreviewText) bgPreviewText.style.display = '';
                }
            }
        }

        function openBgPanel() {
            if (bgPanel) {
                bgPanel.classList.add('visible');
                bgPanel.classList.toggle('music-bg-panel-light', getMusicTheme() === 'light');
                bgPanel.setAttribute('aria-hidden', 'false');
            }
            if (bgBackdrop) {
                bgBackdrop.classList.add('visible');
                bgBackdrop.setAttribute('aria-hidden', 'false');
            }
            if (bgUrlRow) bgUrlRow.classList.remove('visible');
            applyMusicBg();
        }
        function closeBgPanel() {
            if (bgPanel) { bgPanel.classList.remove('visible'); bgPanel.setAttribute('aria-hidden', 'true'); }
            if (bgBackdrop) { bgBackdrop.classList.remove('visible'); bgBackdrop.setAttribute('aria-hidden', 'true'); }
        }

        if (bgSettingsBtn) bgSettingsBtn.addEventListener('click', openBgPanel);
        if (bgPanelBack) bgPanelBack.addEventListener('click', closeBgPanel);
        if (bgBackdrop) bgBackdrop.addEventListener('click', closeBgPanel);

        if (bgLocalBtn && bgFileInput) {
            bgLocalBtn.addEventListener('click', function () { bgFileInput.click(); });
            bgFileInput.addEventListener('change', async function () {
                var file = this.files && this.files[0];
                if (!file) return;
                try {
                    var dataUrl = await compressImage(file, { quality: 0.85, maxWidth: 1080, maxHeight: 1920 });
                    saveMusicBg(dataUrl);
                    applyMusicBg();
                    if (typeof showToast === 'function') showToast('背景已更新');
                } catch (_) {
                    if (typeof showToast === 'function') showToast('图片压缩失败');
                }
                this.value = '';
            });
        }

        if (bgUrlBtn) {
            bgUrlBtn.addEventListener('click', function () {
                if (bgUrlRow) bgUrlRow.classList.toggle('visible');
                if (bgUrlRow && bgUrlRow.classList.contains('visible') && bgUrlInput) bgUrlInput.focus();
            });
        }

        if (bgUrlApply && bgUrlInput) {
            bgUrlApply.addEventListener('click', function () {
                var url = bgUrlInput.value.trim();
                if (!url) return;
                if (!url.startsWith('http')) {
                    if (typeof showToast === 'function') showToast('请输入有效的 http/https 链接');
                    return;
                }
                saveMusicBg(url);
                applyMusicBg();
                if (bgUrlRow) bgUrlRow.classList.remove('visible');
                if (typeof showToast === 'function') showToast('背景已更新');
            });
        }

        if (bgResetBtn) {
            bgResetBtn.addEventListener('click', function () {
                saveMusicBg('');
                saveBgCoverVinyl(false);
                applyMusicBg();
                if (typeof showToast === 'function') showToast('已恢复默认背景');
            });
        }

        if (bgCoverVinylCheck) {
            bgCoverVinylCheck.addEventListener('change', function () {
                saveBgCoverVinyl(this.checked);
                applyMusicBg();
            });
        }

        applyMusicBg();

        // 暴露给壁纸APP同步调用
        window.applyMusicBgFromWallpaper = applyMusicBg;

        renderVinylLyrics();
    }

    function onShowMusicScreen() {
        tryAutoPlay();
        updatePlayPauseUI(!getAudio().paused);
    }

    function resumeMusicIfPaused() {
        const el = getAudio();
        if (el.src && el.paused) {
            el.play().catch(function () {});
        }
    }

    window.initMusicPlayer = initMusicPlayer;
    window.onShowMusicScreen = onShowMusicScreen;
    window.resumeMusicPlayback = resumeMusicIfPaused;

    // 页面加载完成后自动初始化并尝试播放保活音频（移动端一进应用即可保活，无需先点进音乐页）
    function startKeepAliveOnLoad() {
        initMusicPlayer();
        onShowMusicScreen();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startKeepAliveOnLoad);
    } else {
        setTimeout(startKeepAliveOnLoad, 0);
    }
})();
