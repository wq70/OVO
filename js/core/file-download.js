// File delivery only: exporters keep their existing data, formats and filenames.
var OvoFileDownload = (() => {
    const notify = message => { if (typeof showToast === 'function') showToast(message); };
    const releaseLater = cleanup => setTimeout(cleanup, 60000);

    function appleStandalone() {
        if (typeof navigator === 'undefined') return false;
        if (navigator.standalone === true) return true;
        const apple = /iPad|iPhone|iPod/.test(navigator.userAgent || '')
            || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        return apple && typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
    }

    function download(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.hidden = true;
        document.body.appendChild(link);
        try { link.click(); }
        finally { releaseLater(() => { link.remove(); URL.revokeObjectURL(url); }); }
        notify('已发起下载，请在下载列表或“文件”中查看');
        return true;
    }

    // A slow export may outlive the original tap. This tap is made after preparation.
    function savePanel(blob, filename, file) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#0008;display:flex;align-items:center;justify-content:center;padding:20px';
            const panel = document.createElement('div');
            panel.style.cssText = 'background:var(--bg-color,#fff);color:var(--text-color,#222);padding:22px;border-radius:16px;width:100%;max-width:360px;box-sizing:border-box';
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-modal', 'true');
            panel.setAttribute('aria-label', '保存文件');
            const title = document.createElement('h3');
            title.textContent = '文件已准备好';
            const message = document.createElement('p');
            message.style.cssText = 'overflow-wrap:anywhere;font-size:14px;line-height:1.6';
            message.textContent = filename;
            panel.append(title, message);
            overlay.appendChild(panel);
            const previousFocus = document.activeElement;
            let previewUrl, requested = false;
            const close = result => {
                overlay.remove();
                if (previewUrl) releaseLater(() => URL.revokeObjectURL(previewUrl));
                if (previousFocus?.isConnected) previousFocus.focus?.();
                resolve(result);
            };
            const button = (label, action) => {
                const element = document.createElement('button');
                element.type = 'button';
                element.className = 'btn btn-secondary';
                element.style.cssText = 'display:block;width:100%;margin-top:10px';
                element.textContent = label;
                element.onclick = action;
                panel.appendChild(element);
                return element;
            };
            let shareButton;
            if (file) shareButton = button('保存到文件', async () => {
                shareButton.disabled = true;
                try {
                    await navigator.share({ files: [file] });
                    notify('文件已交给系统，请确认保存位置');
                    close(true);
                } catch (error) {
                    message.textContent = error.name === 'AbortError'
                        ? '已取消保存，可以重试或选择直接下载。'
                        : '系统保存未完成，可以重试或选择直接下载。';
                } finally { shareButton.disabled = false; }
            });
            const direct = button('直接下载', () => {
                try {
                    requested = download(blob, filename);
                    message.textContent = canPreview
                        ? '已发起下载。如未取得文件，可点“打开文件”，再使用系统分享菜单保存。'
                        : '已发起下载，请检查系统下载列表，确认文件已保存后再关闭。';
                    finish.textContent = '完成';
                } catch (error) { message.textContent = `下载未完成：${error.message}`; }
            });
            const preview = document.createElement('a');
            preview.textContent = '打开文件';
            preview.target = '_blank';
            preview.rel = 'noopener';
            preview.style.cssText = 'display:block;text-align:center;margin-top:14px';
            const canPreview = !/^(?:text\/html|image\/svg\+xml|(?:text|application)\/javascript)/i.test(blob.type);
            if (canPreview) {
                previewUrl = URL.createObjectURL(blob);
                preview.href = previewUrl;
                panel.appendChild(preview);
            }
            const finish = button('取消', () => close(requested));
            document.body.appendChild(overlay);
            (shareButton || direct).focus();
        });
    }

    async function save(blob, filename) {
        try {
            if (!(blob instanceof Blob)) throw new Error('没有可保存的文件');
            filename = String(filename || 'download').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_');
            if (!appleStandalone()) return download(blob, filename);
            let file;
            if (typeof File === 'function' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
                try {
                    const candidate = new File([blob], filename, { type: blob.type.split(';')[0] || 'application/octet-stream' });
                    if (navigator.canShare({ files: [candidate] })) file = candidate;
                } catch (_) { /* Keep standard download available. */ }
            }
            if (file && navigator.userActivation?.isActive !== false) {
                try {
                    await navigator.share({ files: [file] });
                    notify('文件已交给系统，请确认保存位置');
                    return true;
                } catch (error) {
                    if (error.name === 'AbortError') { notify('已取消保存'); return false; }
                }
            }
            return await savePanel(blob, filename, file);
        } catch (error) {
            console.error('[FileDownload]', error);
            notify(`文件保存未完成：${error.message}`);
            return false;
        }
    }

    async function readMedia(source, kind) {
        const response = await fetch(source);
        if (!response.ok) throw new Error(`读取文件失败（HTTP ${response.status}）`);
        let blob = await response.blob();
        if (!blob.size) throw new Error('文件内容为空');
        const bytes = new Uint8Array(await blob.slice(0, 512).arrayBuffer());
        const text = new TextDecoder().decode(bytes).trimStart();
        if (/^(?:<!doctype\s+html|<html\b|<head\b|<body\b|\{|\[)/i.test(text)) {
            throw new Error('地址返回了错误页面或数据，不是媒体文件');
        }
        const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
        let detected = '';
        if (kind === 'image') {
            if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') detected = 'image/png';
            else if (bytes[0] === 0xff && bytes[1] === 0xd8) detected = 'image/jpeg';
            else if (ascii(0, 3) === 'GIF') detected = 'image/gif';
            else if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') detected = 'image/webp';
            else if (ascii(0, 2) === 'BM') detected = 'image/bmp';
            else if (ascii(4, 8) === 'ftyp' && /avif|avis/.test(ascii(8, 32))) detected = 'image/avif';
            else if (ascii(4, 8) === 'ftyp' && /heic|heix|hevc|mif1/.test(ascii(8, 32))) detected = 'image/heic';
            else if (ascii(0, 4) === 'II*\x00' || ascii(0, 4) === 'MM\x00*') detected = 'image/tiff';
            else if (/^(?:<\?xml[^>]*>\s*)?<svg\b/i.test(text)) detected = 'image/svg+xml';
        } else {
            if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') detected = 'audio/wav';
            else if (ascii(0, 4) === 'OggS') detected = 'audio/ogg';
            else if (bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) detected = 'audio/aac';
            else if (ascii(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) detected = 'audio/mpeg';
            else if (ascii(0, 4) === 'fLaC') detected = 'audio/flac';
            else if (ascii(4, 8) === 'ftyp') detected = 'audio/mp4';
        }
        if (!detected && !blob.type.startsWith(`${kind}/`)) throw new Error('返回的文件类型不正确');
        if (detected && detected !== blob.type) blob = blob.slice(0, blob.size, detected);
        return blob;
    }

    async function saveImage(source, filename, fallbacks = []) {
        let lastError;
        for (const candidate of [...new Set([source, ...fallbacks].filter(Boolean))]) {
            try {
                const blob = await readMedia(candidate, 'image');
                const extension = ({ 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' })[blob.type]
                    || blob.type.split('/')[1]?.split(';')[0] || 'png';
                const base = filename.replace(/\.(?:png|jpe?g|webp|gif|avif|bmp|svg|heic|heif|tiff?)$/i, '');
                return await save(blob, `${base}.${extension}`);
            } catch (error) { lastError = error; }
        }
        console.error('[FileDownload] image', lastError);
        notify('图片下载未完成，原图可能已失效或不允许读取；可长按当前图片保存');
        return false;
    }

    return { save, saveImage, readMedia };
})();
window.OvoFileDownload = OvoFileDownload;
