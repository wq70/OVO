/**
 * js/modules/keep_alive.js
 * 后台保活模块：支持代码级(WakeLock)和音频单曲循环播放保活
 */

window.KeepAliveModule = {
    audioElement: null,
    wakeLock: null,
    isPlaying: false,

    init() {
        this.initAudioElement();
        this.bindEvents();
        this.restoreSettings();
    },

    initAudioElement() {
        if (!this.audioElement) {
            this.audioElement = new Audio();
            this.audioElement.loop = true; // 强制单曲循环，确保不中断
            
            // 解决 iOS 和部分 Android 上的静音策略问题：设置 playsinline 和自动处理交互
            this.audioElement.setAttribute('playsinline', 'true');

            this.audioElement.addEventListener('play', () => {
                this.isPlaying = true;
                this.updateUIStatus();
            });

            this.audioElement.addEventListener('pause', () => {
                this.isPlaying = false;
                this.updateUIStatus();
            });

            this.audioElement.addEventListener('error', (e) => {
                console.error("保活音频播放错误", e);
                this.isPlaying = false;
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
        const audioSwitch = document.getElementById('keep-alive-audio-enabled');
        const openAudioBtn = document.getElementById('open-keep-alive-audio-btn');

        if (codeSwitch) {
            codeSwitch.addEventListener('change', async (e) => {
                db.keepAliveCodeEnabled = e.target.checked;
                await saveData();
                this.applyWakeLock();
            });
        }

        if (audioSwitch) {
            audioSwitch.addEventListener('change', async (e) => {
                db.keepAliveAudioEnabled = e.target.checked;
                await saveData();
                this.applyAudio();
            });
        }

        if (openAudioBtn) {
            openAudioBtn.addEventListener('click', () => {
                document.getElementById('keep-alive-audio-modal').classList.add('visible');
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
                    db.keepAliveAudioSrc = url;
                    db.keepAliveAudioName = url.split('/').pop() || 'URL 音频';
                    await saveData();
                    this.loadAudioSource();
                    if (db.keepAliveAudioEnabled) {
                        this.playAudio();
                    }
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
                    db.keepAliveAudioSrc = ev.target.result; // Base64
                    db.keepAliveAudioName = file.name;
                    await saveData();
                    this.loadAudioSource();
                    if (db.keepAliveAudioEnabled) {
                        this.playAudio();
                    }
                    if (typeof showToast === 'function') showToast('本地保活音频已应用');
                };
                reader.readAsDataURL(file);
            });
        }

        const statusIndicator = document.getElementById('keep-alive-status-indicator');
        if (statusIndicator) {
            statusIndicator.addEventListener('click', () => {
                if (!db.keepAliveAudioSrc) {
                    if (typeof showToast === 'function') showToast('请先上传音频或填写URL');
                    return;
                }
                
                if (this.isPlaying) {
                    this.pauseAudio();
                    // 同步关闭主开关
                    if (audioSwitch) audioSwitch.checked = false;
                    db.keepAliveAudioEnabled = false;
                    saveData();
                } else {
                    this.playAudio();
                    // 同步开启主开关
                    if (audioSwitch) audioSwitch.checked = true;
                    db.keepAliveAudioEnabled = true;
                    saveData();
                }
            });
        }

        // 监听页面可见性，处理 WakeLock 重置
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.applyWakeLock();
            }
        });
    },

    restoreSettings() {
        const codeSwitch = document.getElementById('keep-alive-code-enabled');
        const audioSwitch = document.getElementById('keep-alive-audio-enabled');

        if (codeSwitch) codeSwitch.checked = !!db.keepAliveCodeEnabled;
        if (audioSwitch) audioSwitch.checked = !!db.keepAliveAudioEnabled;

        this.applyWakeLock();
        this.loadAudioSource();

        // 移动端浏览器通常需要用户手势才能开始播放音频
        // 这里如果是开启状态，我们在第一次用户点击页面任意地方时触发播放
        if (db.keepAliveAudioEnabled && db.keepAliveAudioSrc) {
            const initialPlayHandler = () => {
                this.playAudio();
                document.removeEventListener('click', initialPlayHandler);
                document.removeEventListener('touchstart', initialPlayHandler);
            };
            document.addEventListener('click', initialPlayHandler);
            document.addEventListener('touchstart', initialPlayHandler);
        }
    },

    loadAudioSource() {
        if (db.keepAliveAudioSrc) {
            this.audioElement.src = db.keepAliveAudioSrc;
            const nameEl = document.getElementById('keep-alive-current-name');
            if (nameEl) {
                nameEl.textContent = db.keepAliveAudioName || '自定义音频';
            }
        }
    },

    updateUIStatus() {
        const indicator = document.getElementById('keep-alive-status-indicator');
        const playIcon = document.getElementById('keep-alive-icon-play');
        const pauseIcon = document.getElementById('keep-alive-icon-pause');

        if (this.isPlaying) {
            if (indicator) indicator.classList.add('keep-alive-playing');
            if (playIcon) playIcon.style.display = 'none';
            if (pauseIcon) pauseIcon.style.display = 'block';
        } else {
            if (indicator) indicator.classList.remove('keep-alive-playing');
            if (playIcon) playIcon.style.display = 'block';
            if (pauseIcon) pauseIcon.style.display = 'none';
        }
    },

    async playAudio() {
        if (!this.audioElement.src) return;
        try {
            await this.audioElement.play();
        } catch (e) {
            console.error('音频播放被浏览器拦截:', e);
            if (typeof showToast === 'function') showToast('浏览器拦截了自动播放，请手动点击播放按钮');
            this.isPlaying = false;
            this.updateUIStatus();
        }
    },

    pauseAudio() {
        this.audioElement.pause();
    },

    async applyWakeLock() {
        if (!db.keepAliveCodeEnabled) {
            if (this.wakeLock !== null) {
                try {
                    await this.wakeLock.release();
                    this.wakeLock = null;
                } catch (e) {
                    console.error("释放 WakeLock 失败:", e);
                }
            }
            return;
        }

        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
                // 注：对于 system wakeLock, Chrome (Android) 需要 origin trial 或者 extension 权限，通常 screen 足矣
                // this.wakeLock = await navigator.wakeLock.request('system'); 
                console.log('WakeLock (screen) 已激活');
            } catch (err) {
                console.error(`请求 WakeLock 失败: ${err.name}, ${err.message}`);
            }
        }
    },

    applyAudio() {
        if (db.keepAliveAudioEnabled) {
            if (!db.keepAliveAudioSrc) {
                if (typeof showToast === 'function') showToast('请先配置音频才能开启');
                const switchEl = document.getElementById('keep-alive-audio-enabled');
                if (switchEl) switchEl.checked = false;
                db.keepAliveAudioEnabled = false;
                saveData();
                return;
            }
            this.playAudio();
        } else {
            this.pauseAudio();
        }
    }
};
