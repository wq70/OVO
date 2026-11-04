// A real, bundled video supports Safari PiP as well as Chromium's media PiP.
(() => {
    const video = document.getElementById('uwu-pip-video');
    const button = document.getElementById('uwu-pip-toggle');
    const status = document.getElementById('uwu-pip-status');
    if (!video || !button || !status) return;

    let busy = false;
    let waitingForFullscreenExit = false;
    const isAndroid = /Android/i.test(navigator.userAgent);
    // The bundled AAC track contains silence. Keep it eligible for Android's
    // native media controls without requiring audible playback or a microphone.
    const media = window.UwuPictureInPictureMedia;
    if (!media) {
        status.textContent = '内置动效加载失败，请刷新页面后重试。';
        button.disabled = true;
        return;
    }
    video.poster = media.poster;
    video.src = media.src;
    delete window.UwuPictureInPictureMedia;

    function isOpen() {
        return document.pictureInPictureElement === video
            || video.webkitPresentationMode === 'picture-in-picture';
    }

    function update(message) {
        const open = isOpen();
        button.setAttribute('aria-pressed', String(open));
        button.querySelector('span').textContent = open ? '关闭小窗' : waitingForFullscreenExit ? '停止播放' : '开启小窗';
        if (message) status.textContent = message;
    }

    function finish() {
        waitingForFullscreenExit = false;
        video.pause();
        update('小窗已关闭，点击可再次开启。');
    }

    video.addEventListener('enterpictureinpicture', () => update('小窗已开启，可以切换到其他应用。'));
    video.addEventListener('leavepictureinpicture', finish);
    video.addEventListener('webkitpresentationmodechanged', () => {
        if (isOpen()) update('小窗已开启，可以切换到其他应用。');
        else if (video.webkitPresentationMode === 'inline') finish();
    });
    document.addEventListener('fullscreenchange', () => {
        if (waitingForFullscreenExit && !document.fullscreenElement && !document.hidden) {
            update('已退出全屏，可通过“停止播放”关闭动效。');
        }
    });
    video.addEventListener('pause', () => {
        if (isOpen()) update('小窗播放已暂停，可在小窗中继续播放。');
    });
    video.addEventListener('playing', () => {
        if (isOpen()) update('小窗已开启，可以切换到其他应用。');
    });
    video.addEventListener('error', () => {
        video.pause();
        update('内置动效加载失败，请刷新页面后重试。');
    });

    button.addEventListener('click', async () => {
        if (busy) return;
        busy = true;
        button.disabled = true;
        try {
            if (waitingForFullscreenExit) {
                if (document.fullscreenElement === video) await document.exitFullscreen();
                finish();
                return;
            }
            if (document.pictureInPictureElement === video) {
                await document.exitPictureInPicture();
                finish();
                return;
            }
            if (video.webkitPresentationMode === 'picture-in-picture') {
                video.webkitSetPresentationMode('inline');
                finish();
                return;
            }
            const standard = document.pictureInPictureEnabled && typeof video.requestPictureInPicture === 'function';
            const safari = typeof video.webkitSetPresentationMode === 'function'
                && typeof video.webkitSupportsPresentationMode === 'function';
            const fullscreen = isAndroid && (typeof video.requestFullscreen === 'function' || typeof video.webkitEnterFullscreen === 'function');
            if (!standard && !safari && !fullscreen) {
                update('当前浏览器暂不支持系统小窗，请使用 Safari 或支持画中画的 Android 浏览器。');
                return;
            }
            update('正在打开小窗…');
            await video.play();
            if (standard) {
                await video.requestPictureInPicture();
                update('小窗已开启，可以切换到其他应用。');
            } else if (safari) {
                if (!video.webkitSupportsPresentationMode('picture-in-picture')) {
                    throw new DOMException('Picture-in-Picture is unavailable', 'NotSupportedError');
                }
                video.webkitSetPresentationMode('picture-in-picture');
            } else {
                // Android browsers without the web PiP API expose PiP through
                // the native fullscreen player when the user goes Home.
                waitingForFullscreenExit = true;
                if (typeof video.requestFullscreen === 'function') await video.requestFullscreen();
                else video.webkitEnterFullscreen();
                update('视频已全屏，返回桌面即可尝试进入系统小窗。请允许浏览器使用画中画。');
            }
        } catch (error) {
            if (!isOpen()) video.pause();
            waitingForFullscreenExit = false;
            if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
                update('浏览器未允许打开小窗，请检查画中画权限后再次点击。');
            } else if (video.readyState === 0) {
                update('动效正在加载，请稍后再次点击开启。');
            } else {
                update('小窗未能开启，请再次点击，或使用支持画中画的浏览器。');
            }
        } finally {
            busy = false;
            button.disabled = false;
        }
    });
})();
