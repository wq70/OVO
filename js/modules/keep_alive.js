/**
 * js/modules/keep_alive.js
 * 后台保活模块：支持代码级(WakeLock)和音频单曲循环播放保活
 */

window.KeepAliveModule = {
    audioElement: null,
    wakeLock: null,
    isPlaying: false,
    playbackState: 'idle',
    initialPlayHandler: null,
    playOperation: 0,
    wakeLockRequest: null,
    activeTaskIds: new Set(),
    builtInAudioId: 'builtin:ovo-near-silent',
    builtInAudioUrl: '',
    lifecycleState: 'visible',

    init() {
        this.initAudioElement();
        this.bindEvents();
        this.restoreSettings();
        this.initLibrary();
        this.updateDiagnostics();
    },

    initLibrary() {
        if (!db.keepAliveAudioLibrary) {
            db.keepAliveAudioLibrary = [];
        }
    },

    initAudioElement() {
        if (!this.audioElement) {
            this.audioElement = new Audio();
            this.audioElement.loop = true; // 强制单曲循环，确保不中断
            this.audioElement.preload = 'auto';
            
            // 解决 iOS 和部分 Android 上的静音策略问题：设置 playsinline 和自动处理交互
            this.audioElement.setAttribute('playsinline', 'true');

            this.setupMediaSession();

            this.audioElement.addEventListener('play', () => {
                this.playbackState = 'loading';
                this.setMediaSessionPlaybackState('playing');
                this.updateUIStatus();
            });

            this.audioElement.addEventListener('playing', () => {
                this.isPlaying = true;
                this.playbackState = 'playing';
                this.updateUIStatus();
            });

            this.audioElement.addEventListener('pause', () => {
                this.isPlaying = false;
                this.playbackState = 'paused';
                this.setMediaSessionPlaybackState('paused');
                this.updateUIStatus();
            });

            ['waiting', 'stalled', 'suspend'].forEach(eventName => {
                this.audioElement.addEventListener(eventName, () => {
                    if (!this.audioElement.paused) this.playbackState = eventName;
                    this.updateUIStatus();
                });
            });

            this.audioElement.addEventListener('ended', () => {
                this.isPlaying = false;
                this.playbackState = 'ended';
                this.updateUIStatus();
            });

            this.audioElement.addEventListener('error', (e) => {
                console.error("保活音频播放错误", e);
                this.isPlaying = false;
                this.playbackState = 'error';
                this.updateUIStatus();
                if (typeof showToast === 'function') {
                    showToast('保活音频播放失败，请检查链接或文件');
                }
            });
        }
    },

    bindEvents() {
        // UI 绑定：魔法屋设置开关
        const codeSwitch = document.getElementById('keep-alive-code-enabled');
        const autoWakeSwitch = document.getElementById('keep-alive-auto-wake-enabled');
        const audioSwitch = document.getElementById('keep-alive-audio-enabled');
        const openAudioBtn = document.getElementById('open-keep-alive-audio-btn');

        if (codeSwitch) {
            codeSwitch.addEventListener('change', async (e) => {
                db.keepAliveCodeEnabled = e.target.checked;
                await this.persistWakeSettings();
                this.applyWakeLock();
            });
        }

        if (autoWakeSwitch) {
            autoWakeSwitch.addEventListener('change', async (e) => {
                db.keepAliveAutoWakeEnabled = e.target.checked;
                await this.persistWakeSettings();
                this.applyWakeLock();
            });
        }

        if (audioSwitch) {
            audioSwitch.addEventListener('change', async (e) => {
                db.keepAliveAudioEnabled = e.target.checked;
                this.clearInitialPlayHandler();
                // play/pause 必须直接发生在可信用户事件中，不能排在 IndexedDB await 之后。
                const playback = this.applyAudio({ userInitiated: true });
                await this.persistSettings();
                await playback;
            });
        }

        if (openAudioBtn) {
            openAudioBtn.addEventListener('click', () => {
                document.getElementById('keep-alive-audio-modal').classList.add('visible');
            });
        }


        const builtInAudioBtn = document.getElementById('keep-alive-use-builtin-btn');
        if (builtInAudioBtn) {
            builtInAudioBtn.addEventListener('click', async () => {
                this.clearInitialPlayHandler();
                db.keepAliveAudioSrc = this.builtInAudioId;
                db.keepAliveAudioName = '内置近静音音频';
                this.loadAudioSource();
                let playback;
                if (db.keepAliveAudioEnabled) playback = this.playAudio({ userInitiated: true });
                await this.persistSettings();
                if (playback) await playback;
                if (typeof showToast === 'function') {
                    showToast(db.keepAliveAudioEnabled ? '已切换为内置近静音音频' : '内置音频已就绪，点击播放按钮即可启用');
                }
            });
        }

        // 音频配置弹窗内事件
        const closeAudioBtn = document.getElementById('close-keep-alive-audio-btn');
        if (closeAudioBtn) {
            closeAudioBtn.addEventListener('click', () => {
                document.getElementById('keep-alive-audio-modal').classList.remove('visible');
            });
        }

        const urlInput = document.getElementById('keep-alive-url-input');
        const urlApplyBtn = document.getElementById('keep-alive-url-apply-btn');
        if (urlApplyBtn) {
            urlApplyBtn.addEventListener('click', async () => {
                const url = urlInput.value.trim();
                if (url) {
                    const name = url.split('/').pop() || 'URL 音频';
                    db.keepAliveAudioSrc = url;
                    db.keepAliveAudioName = name;
                    this.addToLibrary(name, url);
                    this.loadAudioSource();
                    let playback;
                    if (db.keepAliveAudioEnabled) {
                        playback = this.playAudio({ userInitiated: true });
                    }
                    await this.persistSettings();
                    if (playback) await playback;
                    urlInput.value = '';
                    if (typeof showToast === 'function') showToast('保活音频链接已应用');
                }
            });
        }

        const fileInput = document.getElementById('keep-alive-file-input');
        const localUploadBtn = document.getElementById('keep-alive-local-upload-btn');
        if (localUploadBtn && fileInput) {
            localUploadBtn.addEventListener('click', () => fileInput.click());
            
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                // 为了防止大文件拖垮 IndexedDB，如果有的话可以限制大小
                if (file.size > 20 * 1024 * 1024) {
                    if (typeof showToast === 'function') showToast('文件过大，请选择 20MB 以内的音频');
                    return;
                }

                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const base64Src = ev.target.result;
                    const name = file.name;
                    db.keepAliveAudioSrc = base64Src; // Base64
                    db.keepAliveAudioName = name;
                    this.addToLibrary(name, base64Src);
                    this.loadAudioSource();
                    let playback;
                    if (db.keepAliveAudioEnabled) {
                        playback = this.playAudio({ silentAutoplayFailure: true });
                    }
                    await this.persistSettings();
                    if (playback && !(await playback) && typeof showToast === 'function') {
                        showToast('音频已载入，请点击中间的播放按钮开始');
                    }
                    if (typeof showToast === 'function') showToast('本地保活音频已应用');
                };
                reader.readAsDataURL(file);
            });
        }

        const clearBtn = document.getElementById('keep-alive-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', async () => {
                this.pauseAudio();
                db.keepAliveAudioSrc = '';
                db.keepAliveAudioName = '';
                db.keepAliveAudioEnabled = false;
                if (audioSwitch) audioSwitch.checked = false;
                this.audioElement.src = '';
                const nameEl = document.getElementById('keep-alive-current-name');
                if (nameEl) nameEl.textContent = '未选择音频';
                clearBtn.style.display = 'none';
                this.updateUIStatus();
                await saveData();
                if (typeof showToast === 'function') showToast('当前保活音频已清除');
            });
        }

        // 音频库管理弹窗
        const openLibraryBtn = document.getElementById('open-keep-alive-library-btn');
        const libraryModal = document.getElementById('keep-alive-library-modal');
        const closeLibraryBtn = document.getElementById('close-keep-alive-library-btn');
        
        if (openLibraryBtn && libraryModal) {
            openLibraryBtn.addEventListener('click', () => {
                this.renderLibrary();
                libraryModal.classList.add('visible');
            });
        }
        if (closeLibraryBtn && libraryModal) {
            closeLibraryBtn.addEventListener('click', () => {
                libraryModal.classList.remove('visible');
            });
        }

        // 音频库全选和批量删除
        const selectAllCb = document.getElementById('keep-alive-lib-select-all');
        const delSelectedBtn = document.getElementById('keep-alive-lib-delete-selected-btn');
        if (selectAllCb) {
            selectAllCb.addEventListener('change', (e) => {
                const cbs = document.querySelectorAll('.keep-alive-lib-checkbox');
                cbs.forEach(cb => cb.checked = e.target.checked);
                if (delSelectedBtn) delSelectedBtn.disabled = !e.target.checked;
            });
        }
        if (delSelectedBtn) {
            delSelectedBtn.addEventListener('click', async () => {
                const cbs = document.querySelectorAll('.keep-alive-lib-checkbox:checked');
                if (cbs.length === 0) return;
                
                const confirmed = typeof customConfirm === 'function'
                    ? await customConfirm(`确定要删除选中的 ${cbs.length} 个音频吗？`, '删除音频')
                    : confirm(`确定要删除选中的 ${cbs.length} 个音频吗？`);
                if (!confirmed) return;

                const idsToRemove = Array.from(cbs).map(cb => cb.dataset.id);
                db.keepAliveAudioLibrary = db.keepAliveAudioLibrary.filter(item => !idsToRemove.includes(item.id));
                
                // 如果删除了当前正在播放的音频
                if (idsToRemove.includes(db.keepAliveAudioSrc) || idsToRemove.includes(this.currentLibraryId)) {
                     if (clearBtn) clearBtn.click();
                }
                
                await saveData();
                this.renderLibrary();
                if (selectAllCb) selectAllCb.checked = false;
                delSelectedBtn.disabled = true;
                if (typeof showToast === 'function') showToast('已删除选中音频');
            });
        }

        const statusIndicator = document.getElementById('keep-alive-status-indicator');
        if (statusIndicator) {
            statusIndicator.setAttribute('role', 'button');
            statusIndicator.setAttribute('tabindex', '0');
            statusIndicator.setAttribute('aria-label', '播放或暂停保活音频');
            const togglePlayback = async () => {
                this.clearInitialPlayHandler();
                if (!db.keepAliveAudioSrc) {
                    if (typeof showToast === 'function') showToast('请先上传音频或填写URL');
                    return;
                }
                
                if (!this.audioElement.paused && !this.audioElement.ended) {
                    this.pauseAudio();
                    // 同步关闭主开关
                    if (audioSwitch) audioSwitch.checked = false;
                    db.keepAliveAudioEnabled = false;
                    await this.persistSettings();
                } else {
                    // 同步开启主开关
                    if (audioSwitch) audioSwitch.checked = true;
                    db.keepAliveAudioEnabled = true;
                    const playback = this.playAudio({ userInitiated: true });
                    await this.persistSettings();
                    await playback;
                }
            };
            statusIndicator.addEventListener('click', togglePlayback);
            statusIndicator.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                void togglePlayback();
            });
        }

        // 监听页面可见性，处理 WakeLock 重置
        document.addEventListener('visibilitychange', () => {
            this.lifecycleState = document.visibilityState;
            if (document.visibilityState === 'visible') {
                this.applyWakeLock();
                if (db.keepAliveAudioEnabled && db.keepAliveAudioSrc && this.audioElement.paused) {
                    this.playbackState = 'blocked';
                    this.installInitialPlayHandler();
                    this.updateUIStatus();
                }
            }
            this.updateDiagnostics();
        });

        window.addEventListener('pagehide', () => {
            this.lifecycleState = 'pagehide';
            this.updateDiagnostics();
        });
        window.addEventListener('pageshow', event => {
            this.lifecycleState = event.persisted ? 'restored' : 'visible';
            this.updateDiagnostics();
            this.applyWakeLock();
        });
        document.addEventListener('freeze', () => {
            this.lifecycleState = 'frozen';
            this.updateDiagnostics();
        });
        document.addEventListener('resume', () => {
            this.lifecycleState = 'visible';
            this.updateDiagnostics();
            this.applyWakeLock();
        });
    },

    restoreSettings() {
        const codeSwitch = document.getElementById('keep-alive-code-enabled');
        const autoWakeSwitch = document.getElementById('keep-alive-auto-wake-enabled');
        const audioSwitch = document.getElementById('keep-alive-audio-enabled');

        if (codeSwitch) codeSwitch.checked = !!db.keepAliveCodeEnabled;
        if (db.keepAliveAutoWakeEnabled === undefined) db.keepAliveAutoWakeEnabled = true;
        if (autoWakeSwitch) autoWakeSwitch.checked = !!db.keepAliveAutoWakeEnabled;
        if (audioSwitch) audioSwitch.checked = !!db.keepAliveAudioEnabled;

        this.applyWakeLock();
        this.loadAudioSource();

        // 移动端浏览器通常需要用户手势才能开始播放音频
        // 这里如果是开启状态，我们在第一次用户点击页面任意地方时触发播放
        if (db.keepAliveAudioEnabled && db.keepAliveAudioSrc) {
            this.installInitialPlayHandler();
        }
    },

    createBuiltInAudioUrl() {
        if (this.builtInAudioUrl) return this.builtInAudioUrl;
        if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return '';

        // 生成带真实音频帧的近静音 WAV，避免依赖网络或把大段 Base64 存进 IndexedDB。
        const sampleRate = 8000;
        const durationSeconds = 6;
        const sampleCount = sampleRate * durationSeconds;
        const bytesPerSample = 2;
        const buffer = new ArrayBuffer(44 + sampleCount * bytesPerSample);
        const view = new DataView(buffer);
        const writeText = (offset, text) => {
            for (let index = 0; index < text.length; index++) view.setUint8(offset + index, text.charCodeAt(index));
        };
        writeText(0, 'RIFF');
        view.setUint32(4, 36 + sampleCount * bytesPerSample, true);
        writeText(8, 'WAVE');
        writeText(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * bytesPerSample, true);
        view.setUint16(32, bytesPerSample, true);
        view.setUint16(34, 16, true);
        writeText(36, 'data');
        view.setUint32(40, sampleCount * bytesPerSample, true);
        for (let index = 0; index < sampleCount; index++) {
            const sample = Math.round(Math.sin(2 * Math.PI * 220 * index / sampleRate) * 6);
            view.setInt16(44 + index * bytesPerSample, sample, true);
        }
        this.builtInAudioUrl = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
        return this.builtInAudioUrl;
    },

    resolveAudioSource(source) {
        return source === this.builtInAudioId ? this.createBuiltInAudioUrl() : source;
    },

    setupMediaSession() {
        if (window.MusicPlayer?.holdsMedia()) { window.MusicPlayer.ownMedia(); return; }
        if (!navigator.mediaSession) return;
        const setHandler = (action, handler) => {
            try { navigator.mediaSession.setActionHandler(action, handler); } catch (_) { /* unsupported action */ }
        };
        setHandler('play', () => {
            if (!db.keepAliveAudioEnabled || !db.keepAliveAudioSrc) return;
            void this.playAudio({ userInitiated: true, silentAutoplayFailure: true });
        });
        setHandler('pause', () => this.pauseAudio());
        setHandler('stop', () => {
            this.pauseAudio();
            db.keepAliveAudioEnabled = false;
            const audioSwitch = document.getElementById('keep-alive-audio-enabled');
            if (audioSwitch) audioSwitch.checked = false;
            void this.persistSettings();
        });
    },

    updateMediaSessionMetadata() {
        if (window.MusicPlayer?.holdsMedia()) return;
        if (!navigator.mediaSession || typeof MediaMetadata === 'undefined') return;
        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: db.keepAliveAudioName || '保活音频',
                artist: 'OVO 运行保障',
                album: '后台媒体模式'
            });
        } catch (_) { /* metadata is an optional enhancement */ }
    },

    setMediaSessionPlaybackState(state) {
        if (window.MusicPlayer?.holdsMedia()) return;
        if (!navigator.mediaSession) return;
        try { navigator.mediaSession.playbackState = state; } catch (_) { /* optional enhancement */ }
    },

    addToLibrary(name, src) {
        if (!db.keepAliveAudioLibrary) db.keepAliveAudioLibrary = [];
        const existingId = db.keepAliveAudioLibrary.findIndex(item => item.src === src);
        if (existingId !== -1) {
            this.currentLibraryId = db.keepAliveAudioLibrary[existingId].id;
            return; // 已经存在则不重复添加
        }
        
        const newItem = {
            id: 'ka_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            name: name,
            src: src,
            timestamp: Date.now()
        };
        db.keepAliveAudioLibrary.unshift(newItem); // 加到开头
        this.currentLibraryId = newItem.id;
    },

    renderLibrary() {
        const listContainer = document.getElementById('keep-alive-library-list');
        const toolbar = document.getElementById('keep-alive-lib-toolbar');
        const selectAllCb = document.getElementById('keep-alive-lib-select-all');
        const delSelectedBtn = document.getElementById('keep-alive-lib-delete-selected-btn');
        
        if (!listContainer) return;
        listContainer.innerHTML = '';
        
        if (selectAllCb) selectAllCb.checked = false;
        if (delSelectedBtn) delSelectedBtn.disabled = true;

        if (!db.keepAliveAudioLibrary || db.keepAliveAudioLibrary.length === 0) {
            listContainer.innerHTML = '<div style="padding:20px;text-align:center;color:#999;font-size:13px;">音频库空空如也</div>';
            if (toolbar) toolbar.style.display = 'none';
            return;
        }

        if (toolbar) toolbar.style.display = 'flex';

        db.keepAliveAudioLibrary.forEach(item => {
            const isCurrent = db.keepAliveAudioSrc === item.src;
            
            const div = document.createElement('div');
            div.style.cssText = `
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 10px;
                background: #fff;
                border-radius: 8px;
                border: 1px solid ${isCurrent ? 'var(--primary-color)' : '#eee'};
            `;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'keep-alive-lib-checkbox';
            checkbox.dataset.id = item.id;
            checkbox.style.margin = '0';
            checkbox.addEventListener('change', () => {
                const anyChecked = document.querySelector('.keep-alive-lib-checkbox:checked') !== null;
                if (delSelectedBtn) delSelectedBtn.disabled = !anyChecked;
                
                const allChecked = document.querySelectorAll('.keep-alive-lib-checkbox:not(:checked)').length === 0;
                if (selectAllCb) selectAllCb.checked = allChecked;
            });

            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = `flex: 1; min-width: 0; cursor: pointer;`;
            infoDiv.innerHTML = `
                <div style="font-size: 14px; color: #333; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${item.name}
                </div>
                <div style="font-size: 11px; color: #999; margin-top: 4px;">
                    ${new Date(item.timestamp).toLocaleString()} ${isCurrent ? '<span style="color:var(--primary-color);margin-left:5px;">(当前使用)</span>' : ''}
                </div>
            `;
            
            infoDiv.addEventListener('click', async () => {
                this.clearInitialPlayHandler();
                db.keepAliveAudioSrc = item.src;
                db.keepAliveAudioName = item.name;
                this.currentLibraryId = item.id;
                this.loadAudioSource();
                let playback;
                if (db.keepAliveAudioEnabled) {
                    playback = this.playAudio({ userInitiated: true });
                } else {
                    const audioSwitch = document.getElementById('keep-alive-audio-enabled');
                    if (audioSwitch) {
                        audioSwitch.checked = true;
                        db.keepAliveAudioEnabled = true;
                        playback = this.playAudio({ userInitiated: true });
                    }
                }
                await this.persistSettings();
                if (playback) await playback;
                this.renderLibrary(); // 刷新高亮状态
                if (typeof showToast === 'function') showToast('已切换保活音频');
            });

            div.appendChild(checkbox);
            div.appendChild(infoDiv);
            listContainer.appendChild(div);
        });
    },

    loadAudioSource() {
        const clearBtn = document.getElementById('keep-alive-clear-btn');
        if (db.keepAliveAudioSrc) {
            const resolvedSource = this.resolveAudioSource(db.keepAliveAudioSrc);
            if (!resolvedSource) {
                this.playbackState = 'error';
                this.updateUIStatus();
                return;
            }
            this.audioElement.src = resolvedSource;
            this.audioElement.load();
            const nameEl = document.getElementById('keep-alive-current-name');
            if (nameEl) {
                nameEl.textContent = db.keepAliveAudioName || '自定义音频';
            }
            if (clearBtn) clearBtn.style.display = 'flex';
            this.updateMediaSessionMetadata();
        } else {
            if (clearBtn) clearBtn.style.display = 'none';
            if (navigator.mediaSession && !window.MusicPlayer?.holdsMedia()) navigator.mediaSession.metadata = null;
        }
    },

    updateUIStatus() {
        const indicator = document.getElementById('keep-alive-status-indicator');
        const playIcon = document.getElementById('keep-alive-icon-play');
        const pauseIcon = document.getElementById('keep-alive-icon-pause');
        const stateText = document.getElementById('keep-alive-playback-status')
            || document.querySelector('#keep-alive-status-indicator + div + div');

        const activePlayback = !this.audioElement.paused && !this.audioElement.ended
            && ['loading', 'playing', 'waiting', 'stalled', 'suspend'].includes(this.playbackState);
        this.isPlaying = this.playbackState === 'playing' && activePlayback;
        if (activePlayback) {
            if (indicator) indicator.classList.add('keep-alive-playing');
            if (playIcon) playIcon.style.display = 'none';
            if (pauseIcon) pauseIcon.style.display = 'block';
        } else {
            if (indicator) indicator.classList.remove('keep-alive-playing');
            if (playIcon) playIcon.style.display = 'block';
            if (pauseIcon) pauseIcon.style.display = 'none';
        }
        const labels = {
            idle: '默认单曲循环播放',
            loading: '正在加载音频…',
            playing: '正在单曲循环播放',
            waiting: '音频正在缓冲…',
            stalled: '音频加载暂时停滞',
            suspend: '音频加载已暂停',
            paused: '已暂停，点击可继续播放',
            ended: '播放已结束，点击可重新播放',
            blocked: '等待手动点击播放',
            error: '播放失败，请检查音频'
        };
        const label = labels[this.playbackState] || labels.idle;
        if (stateText) stateText.textContent = label;
        if (indicator) indicator.setAttribute('aria-label', activePlayback ? `暂停保活音频，${label}` : `播放保活音频，${label}`);
        this.updateDiagnostics();
    },

    async playAudio(options = {}) {
        if (window.MusicPlayer?.holdsMedia()) return false;
        if (!this.audioElement.src) return;
        const operation = ++this.playOperation;
        try {
            await this.audioElement.play();
            if (operation === this.playOperation) {
                this.isPlaying = true;
                this.playbackState = 'playing';
                this.updateUIStatus();
            }
            this.clearInitialPlayHandler();
            return true;
        } catch (e) {
            console.error('保活音频播放失败:', e);
            this.isPlaying = false;
            if (operation === this.playOperation) {
                this.playbackState = e && e.name === 'NotAllowedError' ? 'blocked' : 'error';
                this.updateUIStatus();
            }
            if (!options.silentAutoplayFailure && typeof showToast === 'function') {
                if (e && e.name === 'NotAllowedError') {
                    showToast(options.userInitiated ? '浏览器仍未允许播放，请再次点击播放按钮' : '浏览器已阻止自动播放，请点击播放按钮');
                } else if (e && e.name === 'NotSupportedError') {
                    showToast('音频格式或链接不受支持，请更换音频');
                } else if (e && e.name === 'AbortError') {
                    // 换源、快速点击或暂停会中断旧 play()，不误报为自动播放限制。
                    console.info('保活音频播放请求已被新的操作中断');
                } else {
                    showToast('音频播放失败，请检查网络、链接或文件');
                }
            }
            return false;
        }
    },

    pauseAudio() {
        this.playOperation++;
        this.audioElement.pause();
        this.isPlaying = false;
        this.playbackState = 'paused';
        this.updateUIStatus();
    },

    clearInitialPlayHandler() {
        if (!this.initialPlayHandler) return;
        document.removeEventListener('click', this.initialPlayHandler);
        document.removeEventListener('touchend', this.initialPlayHandler);
        this.initialPlayHandler = null;
    },

    installInitialPlayHandler() {
        this.clearInitialPlayHandler();
        this.initialPlayHandler = async event => {
            if (!db.keepAliveAudioEnabled || !db.keepAliveAudioSrc) {
                this.clearInitialPlayHandler();
                return;
            }
            // 播放器自身和开关拥有各自的直接处理器，避免“点暂停后冒泡又播放”。
            if (event.target && event.target.closest && event.target.closest('#keep-alive-status-indicator, #keep-alive-audio-enabled')) return;
            const started = await this.playAudio({ userInitiated: true, silentAutoplayFailure: true });
            if (!started && typeof showToast === 'function') showToast('请点击保活音频的播放按钮开始');
        };
        document.addEventListener('click', this.initialPlayHandler);
        document.addEventListener('touchend', this.initialPlayHandler);
    },

    async persistSettings() {
        const keys = ['keepAliveAudioEnabled', 'keepAliveAudioSrc', 'keepAliveAudioName', 'keepAliveAudioLibrary'];
        if (typeof saveGlobalSettings === 'function') return saveGlobalSettings(keys);
        if (typeof saveData === 'function') return saveData();
    },

    async persistWakeSettings() {
        const keys = ['keepAliveCodeEnabled', 'keepAliveAutoWakeEnabled'];
        if (typeof saveGlobalSettings === 'function') return saveGlobalSettings(keys);
        if (typeof saveData === 'function') return saveData();
    },

    notifyTaskStart(taskId) {
        if (taskId) this.activeTaskIds.add(taskId);
        this.updateDiagnostics();
        if (db.keepAliveAutoWakeEnabled) void this.applyWakeLock();
    },

    notifyTaskEnd(taskId) {
        if (taskId) this.activeTaskIds.delete(taskId);
        this.updateDiagnostics();
        if (!db.keepAliveCodeEnabled) void this.applyWakeLock();
    },

    updateDiagnostics() {
        const pageStatus = document.getElementById('keep-alive-page-status');
        const wakeStatus = document.getElementById('keep-alive-wake-status');
        const taskStatus = document.getElementById('keep-alive-task-status');
        const pageLabels = {
            visible: '前台', hidden: '后台', frozen: '已冻结', pagehide: '正在离开', restored: '已恢复'
        };
        if (pageStatus) pageStatus.textContent = pageLabels[this.lifecycleState] || pageLabels[document.visibilityState] || '未知';
        if (taskStatus) {
            taskStatus.textContent = this.activeTaskIds.size > 0
                ? `${this.activeTaskIds.size} 个任务进行中`
                : '无进行中任务';
        }
        if (wakeStatus) {
            const shouldHold = !!db.keepAliveCodeEnabled
                || (!!db.keepAliveAutoWakeEnabled && this.activeTaskIds.size > 0);
            if (!('wakeLock' in navigator)) wakeStatus.textContent = '浏览器不支持';
            else if (this.wakeLock && !this.wakeLock.released) wakeStatus.textContent = '已启用';
            else if (this.wakeLockRequest) wakeStatus.textContent = '正在申请';
            else if (shouldHold && document.visibilityState !== 'visible') wakeStatus.textContent = '等待回到前台';
            else if (shouldHold) wakeStatus.textContent = '等待系统允许';
            else wakeStatus.textContent = '未启用';
        }
    },

    async applyWakeLock() {
        const shouldHold = !!db.keepAliveCodeEnabled
            || (!!db.keepAliveAutoWakeEnabled && this.activeTaskIds.size > 0);
        if (!shouldHold) {
            if (this.wakeLock !== null) {
                try {
                    const lock = this.wakeLock;
                    this.wakeLock = null;
                    await lock.release();
                } catch (e) {
                    console.error("释放 WakeLock 失败:", e);
                }
            }
            this.updateDiagnostics();
            return;
        }

        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
            try {
                if (this.wakeLock && !this.wakeLock.released) return;
                if (this.wakeLockRequest) return this.wakeLockRequest;
                this.wakeLockRequest = navigator.wakeLock.request('screen');
                const lock = await this.wakeLockRequest;
                this.wakeLockRequest = null;
                const stillNeeded = !!db.keepAliveCodeEnabled
                    || (!!db.keepAliveAutoWakeEnabled && this.activeTaskIds.size > 0);
                if (!stillNeeded || document.visibilityState !== 'visible') {
                    await lock.release();
                    this.updateDiagnostics();
                    return;
                }
                this.wakeLock = lock;
                lock.addEventListener('release', () => {
                    if (this.wakeLock === lock) this.wakeLock = null;
                    console.info('WakeLock (screen) 已由浏览器或系统释放');
                    this.updateDiagnostics();
                }, { once: true });
                console.log('WakeLock (screen) 已激活');
                this.updateDiagnostics();
            } catch (err) {
                this.wakeLockRequest = null;
                console.error(`请求 WakeLock 失败: ${err.name}, ${err.message}`);
                this.updateDiagnostics();
            }
        } else {
            this.updateDiagnostics();
        }
    },

    async applyAudio(options = {}) {
        if (db.keepAliveAudioEnabled) {
            if (!db.keepAliveAudioSrc) {
                if (typeof showToast === 'function') showToast('请先配置音频才能开启');
                const switchEl = document.getElementById('keep-alive-audio-enabled');
                if (switchEl) switchEl.checked = false;
                db.keepAliveAudioEnabled = false;
                await this.persistSettings();
                return;
            }
            return this.playAudio(options);
        } else {
            this.pauseAudio();
            return true;
        }
    }
};
