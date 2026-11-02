(function () {
    'use strict';
    function setup() {
        const root = document.getElementById('novelai-studio');
        if (!root || root.dataset.ready) return;
        root.dataset.ready = '1';
        const el = id => document.getElementById(`nai-studio-${id}`);
        const canvas = el('canvas'), ctx = canvas.getContext('2d');
        const mask = document.createElement('canvas'), maskCtx = mask.getContext('2d');
        let source = null, sourceData = '', controller = null, drawing = false, maskDirty = false, undo = [], previous = null, countBeforeSingle = null;
        let works = Array.isArray(db.novelAiStudioWorks) ? db.novelAiStudioWorks : [];
        const status = message => { el('status').textContent = message; };
        const save = async () => {
            // Explicit storage errors must leave generated files available for download.
            db.novelAiStudioWorks = works;
            await dexieDB.globalSettings.put({ key: 'novelAiStudioWorks', value: works });
        };
        const repaint = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (!source) return;
            ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
            if (el('action').value === 'infill') {
                ctx.save(); ctx.globalAlpha = 0.45; ctx.drawImage(mask, 0, 0); ctx.restore();
            }
        };
        async function setSource(data) {
            const image = new Image(); image.src = data; await image.decode();
            if (controller) throw new Error('生成期间不能更换原图');
            source = image; sourceData = data;
            const ratio = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
            canvas.width = mask.width = Math.round(image.naturalWidth * ratio);
            canvas.height = mask.height = Math.round(image.naturalHeight * ratio);
            maskCtx.clearRect(0, 0, mask.width, mask.height); undo = []; maskDirty = false;
            repaint(); status(`已选择原图：${image.naturalWidth} × ${image.naturalHeight}`);
        }
        const point = e => { const box = canvas.getBoundingClientRect(); return { x: (e.clientX - box.left) * canvas.width / box.width, y: (e.clientY - box.top) * canvas.height / box.height }; };
        const stroke = (from, to) => {
            maskCtx.strokeStyle = 'white'; maskCtx.lineWidth = Number(el('brush').value) * canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
            maskCtx.lineCap = 'round'; maskCtx.lineJoin = 'round';
            maskCtx.beginPath(); maskCtx.moveTo(from.x, from.y); maskCtx.lineTo(to.x + 0.01, to.y + 0.01); maskCtx.stroke(); maskDirty = true; repaint();
        };
        canvas.addEventListener('pointerdown', e => {
            if (!source || controller || el('action').value !== 'infill') return;
            e.preventDefault(); canvas.setPointerCapture(e.pointerId); drawing = true;
            undo.push({ data: maskCtx.getImageData(0, 0, mask.width, mask.height), dirty: maskDirty });
            if (undo.length > 8 || undo.reduce((bytes, entry) => bytes + entry.data.data.byteLength, 0) > 32 * 1024 * 1024) undo.shift();
            previous = point(e); stroke(previous, previous);
        });
        canvas.addEventListener('pointermove', e => { if (drawing) { e.preventDefault(); const next = point(e); stroke(previous, next); previous = next; } });
        const stopDrawing = () => { drawing = false; previous = null; };
        canvas.addEventListener('pointerup', stopDrawing); canvas.addEventListener('pointercancel', stopDrawing);
        el('clear-mask').onclick = () => { maskCtx.clearRect(0, 0, mask.width, mask.height); maskDirty = false; undo = []; repaint(); };
        el('undo-mask').onclick = () => { const last = undo.pop(); if (last) { maskCtx.putImageData(last.data, 0, 0); maskDirty = last.dirty; repaint(); } };
        el('upload').onclick = () => el('file').click();
        el('file').onchange = async () => {
            const file = el('file').files[0]; if (!file) return;
            try {
                const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
                await setSource(data);
            } catch (error) { status(`读取原图失败：${error.message || '图片格式不支持'}`); }
            finally { el('file').value = ''; }
        };
        el('clear-source').onclick = () => { source = null; sourceData = ''; maskDirty = false; undo = []; repaint(); status('原图已清除'); };
        const changeMode = () => {
            const action = el('action').value;
            el('source').hidden = ['generate', 'comic'].includes(action);
            el('mask-tools').hidden = action !== 'infill';
            el('change').hidden = action === 'upscale';
            el('enhance').hidden = action !== 'enhance';
            const single = ['upscale', 'enhance'].includes(action);
            if (single) { countBeforeSingle ??= el('count').value; el('count').value = '1'; }
            else if (countBeforeSingle !== null) { el('count').value = countBeforeSingle; countBeforeSingle = null; }
            el('count').disabled = single;
            el('run').textContent = action === 'upscale' ? '放大原图' : action === 'enhance' ? '增强原图' : '生成作品';
            canvas.style.touchAction = action === 'infill' ? 'none' : 'auto';
            el('mode-tip').textContent = action === 'comic' ? '描述分镜数量、阅读顺序、每格动作和台词。V5 的漫画效果更强；Heavy / Furry Focus 中的部分负面词可能抑制分镜，画中文字时也请检查质量预设中的 no text。可手动关闭质量增强或调整负面设置。' : action === 'infill' ? '白色涂抹区域重绘。V5 Curated 当前请明确切换 V4.5 Curated；不会自动更换模型。' : action === 'upscale' ? '使用官方独立放大器；中转需支持 /ai/upscale。放大不使用画面描述。' : action === 'enhance' ? '增强会重新生成细节，并可能改变画面；Max 仅 V5 可用。' : '作品保留原图。固定 Seed 连续生成可能重复，可留空 Seed 使用随机种子。';
            repaint();
        };
        el('action').onchange = changeMode; changeMode();
        const download = work => OvoFileDownload.saveImage(work.imageUrl, `NovelAI_${work.createdAt}_${work.index || 0}.png`);
        const render = () => {
            const gallery = el('gallery'); gallery.replaceChildren();
            for (const work of works) {
                const card = document.createElement('div'); card.className = 'nai-studio-work';
                const image = document.createElement('img'); image.src = work.imageUrl; image.alt = `${work.model} 作品`; image.loading = 'lazy';
                image.onclick = () => window.openImageViewer?.(work.imageUrl);
                const text = document.createElement('p'); text.className = 'api-field-tip'; text.textContent = `${work.model} · ${work.size || ''} · Seed ${work.seed ?? '未知'}`;
                const buttons = document.createElement('div'); buttons.className = 'api-button-grid';
                for (const [label, handler] of [
                    ['下载', () => download(work)],
                    ['作为原图', async () => { await setSource(work.imageUrl); el('action').value = 'img2img'; changeMode(); el('source').scrollIntoView({ block: 'nearest' }); }],
                    ['参数', () => { el('request').textContent = JSON.stringify(work.requestSnapshot || {}, null, 2); el('request').parentElement.open = true; }],
                    ['删除', async () => { if (await showAppConfirmDialog({ title: '删除作品', message: '只删除本机这张作品，已下载文件不受影响。' }) !== 'confirm') return; works = works.filter(item => item !== work); render(); await save(); }]
                ]) { const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-small'; button.textContent = label; button.disabled = !!controller; button.onclick = async () => { try { await handler(); } catch (error) { status(`操作失败：${error.message}`); } }; buttons.append(button); }
                card.append(image, text, buttons); gallery.append(card);
            }
        };
        el('clear-gallery').onclick = async () => {
            if (!works.length || await showAppConfirmDialog({ title: '清空作品', message: '将清空本机 NovelAI 创作工具的作品；聊天图片和参考素材不受影响。' }) !== 'confirm') return;
            works = []; render(); try { await save(); status('本机作品已清空'); } catch (error) { status(`保存失败：${error.message}`); }
        };
        el('cancel').onclick = () => controller?.abort();
        el('run').onclick = async () => {
            if (controller) return;
            let timeout;
            try {
                const settings = window.readNovelAiPanelSettings();
                const action = el('action').value;
                let prompt = el('prompt').value.trim();
                const text = el('text').value.trim();
                if (text && /\bText\s*:/i.test(prompt)) throw new Error('画面描述中已有 Text:，请只在一个位置填写画中文字');
                if (text) {
                    const max = /nai-diffusion-5-full/.test(settings.model) ? 750 : /nai-diffusion-5/.test(settings.model) ? 374 : 118;
                    if ([...text].length > max) throw new Error(`当前模型画中文字最多 ${max} 个字符，请缩短后重试`);
                    prompt += ` Text: ${text}`;
                }
                if (action !== 'upscale' && !prompt.trim()) throw new Error('请填写画面描述');
                if (!['generate', 'comic'].includes(action) && !sourceData) throw new Error('请先选择原图');
                if (action === 'infill' && !maskDirty) throw new Error('请先涂抹需要重绘的区域');
                controller = new AbortController();
                const timeoutSeconds = Number(db.imageGenTimeout) || 0;
                if (timeoutSeconds > 0) timeout = setTimeout(() => controller.abort('timeout'), timeoutSeconds * 1000);
                el('run').disabled = true; el('cancel').disabled = false;
                root.querySelectorAll('input, textarea, select, button').forEach(node => { if (node !== el('cancel')) { node.dataset.naiWasDisabled = node.disabled ? '1' : '0'; node.disabled = true; } });
                status('正在生成，请稍候；可取消等待。');
                let resolution = settings.resolution;
                let maxEnhance = false;
                if (action === 'enhance') {
                    const scale = el('enhance-scale').value;
                    maxEnhance = scale === 'max';
                    const factor = maxEnhance ? 1 : Number(scale);
                    const w = Math.max(64, Math.round(source.naturalWidth * factor / 64) * 64), h = Math.max(64, Math.round(source.naturalHeight * factor / 64) * 64);
                    if (w * h > 4194304) throw new Error('增强尺寸超过 4194304 像素，请降低倍率或缩小原图');
                    resolution = `${w}x${h}`;
                }
                const result = action === 'upscale' ? await window.NovelAiCompat.upscale(sourceData, settings, controller.signal) : await generateNovelAiImage(prompt, {
                    ...settings, resolution, action: action === 'enhance' ? 'img2img' : action === 'comic' ? 'generate' : action,
                    nSamples: action === 'enhance' ? 1 : Number(el('count').value), initImage: sourceData, mask: maskDirty ? mask.toDataURL('image/png') : '',
                    strength: Number(el('strength').value), noise: Number(el('noise').value), enhanceMax: maxEnhance,
                    onProgress: progress => status(`正在生成第 ${progress.index + 1} 张${progress.step != null ? `，采样 ${progress.step}` : ''}…`)
                }, controller.signal);
                const newWorks = await Promise.all((result.images || [result]).map(async (image, index) => {
                    let size = result.size;
                    try { const original = new Image(); original.src = image.imageUrl || result.imageUrl; await original.decode(); size = `${original.naturalWidth}x${original.naturalHeight}`; } catch (_) { /* Keep provider size when an external image cannot be decoded. */ }
                    return ({
                    imageUrl: image.imageUrl || result.imageUrl, index, seed: image.seed ?? (index === 0 ? result.seed : null),
                    model: result.model, size, createdAt: Date.now(), requestSnapshot: result.requestSnapshot
                }); }));
                works = newWorks.concat(works);
                el('request').textContent = JSON.stringify(result.requestSnapshot || {}, null, 2);
                render();
                try { await save(); status(`完成 ${newWorks.length} 张，已保存到本机。${newWorks.some(work => /^https?:\/\//.test(work.imageUrl)) ? '部分原图仅保留远程链接，请及时下载，链接可能失效。' : ''}`); }
                catch (error) { status(`生成完成，但本机保存失败：${error.message}。请先下载作品，刷新会丢失本次结果。`); }
            } catch (error) { status(error.name === 'AbortError' ? (controller?.signal.reason === 'timeout' ? '等待超时；服务端可能已生成，请确认后再重试。' : '已取消等待；服务端可能仍在处理。') : `操作失败：${error.message}`); }
            finally {
                clearTimeout(timeout); controller = null;
                root.querySelectorAll('[data-nai-was-disabled]').forEach(node => { node.disabled = node.dataset.naiWasDisabled === '1'; delete node.dataset.naiWasDisabled; });
                el('run').disabled = false; el('cancel').disabled = true; changeMode(); render();
            }
        };
        render();
    }
    window.NovelAiStudio = { setup };
})();
