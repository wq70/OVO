// --- 音乐播放器（后台保活）---
// 支持本地上传、URL、循环播放、歌词显示；进入界面可恢复上次音频并自动播放

(function () {
    const STORAGE_KEY_URL = 'music_player_url';
    const STORAGE_KEY_LRC = 'music_player_lrc';
    const STORAGE_KEY_TITLE = 'music_player_title';

    let audio = null;
    let inited = false;
    let currentSrc = null;
    let currentObjectUrl = null;
    let lyricsData = [];
    let lyricsVisible = false;
    let editLrcMode = false;
    let userHasInteracted = false;

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
            audio.loop = true;
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
        if (!getAudio().loop) getAudio().play();
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
    }

    function updateLyricsHighlight(currentTime) {
        const list = document.querySelector('.music-lyrics-list');
        if (!list || !lyricsData.length) return;
        const items = list.querySelectorAll('li');
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
        if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function setSource(src, title) {
        revokeObjectUrl();
        currentObjectUrl = null;
        currentSrc = src;
        const el = getAudio();
        el.src = src;
        const name = title || '当前音频';
        getEl('music-title').textContent = name;
        getEl('music-meta').textContent = '循环播放 · 保活';
        const coverImg = getEl('music-cover-img');
        const placeholder = getEl('music-cover-placeholder');
        if (coverImg && placeholder) {
            coverImg.style.display = 'none';
            placeholder.style.display = 'flex';
        }
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
        el.loop = !!getEl('music-loop-check').checked;
        userHasInteracted = true;
        el.play().catch(() => {});
    }

    function playFromUserGesture() {
        userHasInteracted = true;
        const el = getAudio();
        if (!el.src) return;
        el.loop = !!getEl('music-loop-check').checked;
        el.play().catch(() => {});
    }

    function toggleLyricsVisible() {
        lyricsVisible = !lyricsVisible;
        const wrap = getEl('music-lyrics-wrap');
        if (wrap) wrap.classList.toggle('visible', lyricsVisible);
    }

    function renderLyricsList() {
        const inner = getEl('music-lyrics-inner');
        if (!inner) return;
        const empty = getEl('music-lyrics-empty');
        const edit = getEl('music-lyrics-edit');
        if (editLrcMode) {
            empty.style.display = 'none';
            edit.style.display = 'block';
            const list = inner.querySelector('.music-lyrics-list');
            if (list) list.remove();
            const actions = inner.querySelector('.music-lyrics-edit-actions');
            if (actions) actions.remove();
            return;
        }
        edit.style.display = 'none';
        let list = inner.querySelector('.music-lyrics-list');
        if (lyricsData.length === 0) {
            if (list) list.remove();
            if (empty) empty.style.display = 'block';
            return;
        }
        if (empty) empty.style.display = 'none';
        if (!list) {
            list = document.createElement('ul');
            list.className = 'music-lyrics-list';
            inner.appendChild(list);
        }
        list.innerHTML = lyricsData.map(l => `<li data-time="${l.time}">${escapeHtml(l.text)}</li>`).join('');
    }

    function escapeHtml(s) {
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    function saveLrcToStorage() {
        try {
            const raw = getEl('music-lyrics-edit').value.trim();
            localStorage.setItem(STORAGE_KEY_LRC, raw);
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
        const lyricsToggle = getEl('music-lyrics-toggle');
        const lyricsWrap = getEl('music-lyrics-wrap');
        const coverWrap = getEl('music-cover-wrap');
        const sourceSheet = getEl('music-source-sheet');
        const sheetLocal = getEl('music-sheet-local');
        const sheetUrl = getEl('music-sheet-url');
        const sheetCancel = getEl('music-sheet-cancel');
        const btnLocal = getEl('music-btn-local');
        const btnUrl = getEl('music-btn-url');

        if (!playBtn || !getAudio()) return;

        function closeSourceSheet() {
            if (sourceSheet) sourceSheet.classList.remove('visible');
        }
        function openSourceSheet() {
            if (sourceSheet) sourceSheet.classList.add('visible');
        }
        function showUrlRow() {
            if (urlRow) urlRow.classList.add('visible');
            if (urlInput) urlInput.focus();
        }

        // 封面点击 -> 选择来源弹层
        if (coverWrap) {
            coverWrap.addEventListener('click', function () {
                openSourceSheet();
            });
        }
        if (sourceSheet) {
            sourceSheet.addEventListener('click', function (e) {
                if (e.target === sourceSheet) closeSourceSheet();
            });
        }
        if (sheetLocal) {
            sheetLocal.addEventListener('click', function () {
                closeSourceSheet();
                if (fileInput) fileInput.click();
            });
        }
        if (sheetUrl) {
            sheetUrl.addEventListener('click', function () {
                closeSourceSheet();
                showUrlRow();
            });
        }
        if (sheetCancel) sheetCancel.addEventListener('click', closeSourceSheet);

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
            setSource(savedUrl, savedTitle || '已保存的音频');
        }

        // 恢复歌词
        const savedLrc = loadLrcFromStorage();
        if (savedLrc) {
            lyricsData = parseLrc(savedLrc);
            const editEl = getEl('music-lyrics-edit');
            if (editEl) editEl.value = savedLrc;
        }
        renderLyricsList();

        // 本地上传
        if (fileInput) {
            fileInput.addEventListener('change', function () {
                const file = this.files && this.files[0];
                if (!file) return;
                revokeObjectUrl();
                currentObjectUrl = URL.createObjectURL(file);
                setSource(currentObjectUrl, file.name);
                getAudio().loop = !!loopCheck.checked;
                playFromUserGesture();
                this.value = '';
            });
        }

        // URL 使用
        if (urlApplyBtn && urlInput) {
            urlApplyBtn.addEventListener('click', function () {
                const url = urlInput.value.trim();
                if (!url) return;
                if (!url.startsWith('http')) {
                    if (typeof showToast === 'function') showToast('请输入有效的 http/https 链接');
                    return;
                }
                try {
                    localStorage.setItem(STORAGE_KEY_URL, url);
                    localStorage.setItem(STORAGE_KEY_TITLE, 'URL 音频');
                } catch (_) {}
                setSource(url, 'URL 音频');
                getAudio().loop = !!loopCheck.checked;
                playFromUserGesture();
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
            el.loop = !!loopCheck.checked;
            if (el.paused) el.play(); else el.pause();
        });

        loopCheck.addEventListener('change', function () {
            getAudio().loop = !!this.checked;
        });

        // 歌词区域点击切换显示
        if (lyricsToggle) lyricsToggle.addEventListener('click', toggleLyricsVisible);
        if (lyricsWrap) lyricsWrap.addEventListener('click', function (e) {
            if (e.target.closest('.music-lyrics-edit') || e.target.closest('.music-lyrics-edit-actions')) return;
            toggleLyricsVisible();
        });

        // 歌词编辑
        const inner = getEl('music-lyrics-inner');
        const editLink = getEl('music-lyrics-edit-link');
        const editEl = getEl('music-lyrics-edit');
        let editActions = inner && inner.querySelector('.music-lyrics-edit-actions');
        if (inner && !editActions) {
            editActions = document.createElement('div');
            editActions.className = 'music-lyrics-edit-actions';
            editActions.innerHTML = '<button type="button" class="music-lyrics-save-btn">保存歌词</button><button type="button" class="music-lyrics-cancel-btn">取消</button>';
            inner.appendChild(editActions);
        }
        const saveBtn = editActions && editActions.querySelector('.music-lyrics-save-btn');
        const cancelBtn = editActions && editActions.querySelector('.music-lyrics-cancel-btn');
        const showEditMode = function () {
            editLrcMode = true;
            if (editEl) editEl.style.display = 'block';
            if (saveBtn) saveBtn.style.display = 'inline-block';
            if (cancelBtn) cancelBtn.style.display = 'inline-block';
            const empty = getEl('music-lyrics-empty');
            const list = inner && inner.querySelector('.music-lyrics-list');
            if (empty) empty.style.display = 'none';
            if (list) list.style.display = 'none';
            renderLyricsList();
        };
        const hideEditMode = function () {
            editLrcMode = false;
            if (editEl) editEl.style.display = 'none';
            if (saveBtn) saveBtn.style.display = 'none';
            if (cancelBtn) cancelBtn.style.display = 'none';
            const list = inner && inner.querySelector('.music-lyrics-list');
            if (list) list.style.display = '';
            renderLyricsList();
        };
        if (editLink) editLink.addEventListener('click', showEditMode);
        const emptyEl = getEl('music-lyrics-empty');
        if (emptyEl) emptyEl.addEventListener('click', showEditMode);
        if (saveBtn) {
            saveBtn.style.display = 'none';
            saveBtn.addEventListener('click', function () {
                const raw = editEl ? editEl.value.trim() : '';
                lyricsData = parseLrc(raw);
                saveLrcToStorage();
                hideEditMode();
            });
        }
        if (cancelBtn) {
            cancelBtn.style.display = 'none';
            cancelBtn.addEventListener('click', hideEditMode);
        }

        renderLyricsList();
    }

    function onShowMusicScreen() {
        tryAutoPlay();
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
})();
