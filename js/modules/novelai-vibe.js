(function () {
    'use strict';

    const SINGLE_IDENTIFIER = 'novelai-vibe-transfer';
    const BUNDLE_IDENTIFIER = 'novelai-vibe-transfer-bundle';
    const MAX_VIBES = 16;
    const MODEL_KEYS = {
        'nai-diffusion-4-curated-preview': 'v4curated',
        'nai-diffusion-4-full': 'v4full',
        'nai-diffusion-4-5-curated': 'v4-5curated',
        'nai-diffusion-4-5-full': 'v4-5full'
    };

    function modelFamily(model) {
        const value = String(model || '');
        if (/nai-diffusion-5/i.test(value)) return 'v5';
        if (/nai-diffusion-4/i.test(value)) return 'v4';
        if (/nai-diffusion-(?:furry-)?3/i.test(value)) return 'v3';
        return 'unknown';
    }

    function supportsVibe(model) {
        return ['v3', 'v4'].includes(modelFamily(model));
    }

    function uid(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }

    function clamp(value, min, max, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
    }

    function dataUrlBody(value) {
        return String(value || '').replace(/^data:[^,]+,/, '');
    }

    function bytesToBase64(bytes) {
        let binary = '';
        const chunk = 0x8000;
        for (let offset = 0; offset < bytes.length; offset += chunk) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
        }
        return btoa(binary);
    }

    function arrayBufferToBase64(buffer) {
        return bytesToBase64(new Uint8Array(buffer));
    }

    async function sha256(value) {
        const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }

    async function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
            reader.readAsDataURL(file);
        });
    }

    function state() {
        if (!db.novelAiVibeSettings || typeof db.novelAiVibeSettings !== 'object') {
            db.novelAiVibeSettings = { enabled: false, activeGroupId: '', normalizeStrength: true };
        }
        return db.novelAiVibeSettings;
    }

    function preciseState() {
        if (!db.novelAiPreciseReferenceSettings || typeof db.novelAiPreciseReferenceSettings !== 'object') {
            db.novelAiPreciseReferenceSettings = { enabled: false, items: [] };
        }
        return db.novelAiPreciseReferenceSettings;
    }

    async function groups() {
        return dexieDB?.naiVibeGroups ? dexieDB.naiVibeGroups.orderBy('updatedAt').reverse().toArray() : [];
    }

    async function group(id) {
        return id && dexieDB?.naiVibeGroups ? dexieDB.naiVibeGroups.get(id) : null;
    }

    async function asset(id) {
        return id && dexieDB?.naiVibeAssets ? dexieDB.naiVibeAssets.get(id) : null;
    }

    async function encodingFor(assetId, model, informationExtracted) {
        if (!dexieDB?.naiVibeEncodings) return null;
        const all = await dexieDB.naiVibeEncodings.where('assetId').equals(assetId).toArray();
        const key = MODEL_KEYS[model] || 'custom';
        return all.find(item => item.model === model && Math.abs(item.informationExtracted - informationExtracted) < 0.0001)
            || all.find(item => item.modelKey === key && Math.abs(item.informationExtracted - informationExtracted) < 0.0001)
            || null;
    }

    function buildAuth(settings, url) {
        if (window.NovelAiCompat) return { headers: window.NovelAiCompat.headers(settings, 'application/binary'), url };
        const token = String(settings.token || '').trim().replace(/[\r\n]/g, '');
        const mode = settings.authMode || 'bearer';
        const headers = { 'Content-Type': 'application/json' };
        if (mode === 'bearer' && token) headers.Authorization = `Bearer ${token}`;
        if (mode === 'header' && token) headers[settings.authHeaderName || 'Authorization'] = token;
        if (settings.extraHeaders && typeof settings.extraHeaders === 'object') Object.assign(headers, settings.extraHeaders);
        if (mode === 'query' && token) {
            const join = url.includes('?') ? '&' : '?';
            url += `${join}${encodeURIComponent(settings.authQueryName || 'key')}=${encodeURIComponent(token)}`;
        }
        return { headers, url };
    }

    function encodeEndpoint(settings) {
        if (!settings.customUrlEnabled || !String(settings.customUrl || '').trim()) return 'https://image.novelai.net/ai/encode-vibe';
        const configured = String(settings.customUrl).trim();
        if (/\/ai\/encode-vibe(?:\?|$)/.test(configured)) return configured;
        const path = settings.encodeVibePath || '/ai/encode-vibe';
        if (/^https?:\/\//i.test(path)) return path;
        if ((settings.endpointMode || 'auto') === 'full') {
            try { return new URL(path, configured).toString(); }
            catch (_) { return configured.replace(/\/ai\/generate-image(?:-stream)?(?:\?.*)?$/, path); }
        }
        return configured.replace(/\/$/, '') + path;
    }

    async function encodeAsset(assetRecord, model, informationExtracted, signal) {
        if (modelFamily(model) !== 'v4') throw new Error('当前模型不需要或不支持 V4 VIBE 编码');
        const settings = db.novelAiSettings || {};
        if (!settings.token && (settings.authMode || 'bearer') !== 'none') throw new Error('请先配置 NovelAI Token');
        let endpoint = encodeEndpoint(settings);
        const auth = buildAuth(settings, window.NovelAiCompat ? window.NovelAiCompat.endpoint(settings, 'encode') : endpoint);
        endpoint = auth.url;
        const response = await fetch(endpoint, {
            method: 'POST', headers: auth.headers, signal,
            body: JSON.stringify({ image: dataUrlBody(assetRecord.image), model, information_extracted: informationExtracted })
        });
        if (!response.ok) {
            if (typeof _imageReadError === 'function') throw await _imageReadError(response, 'NovelAI VIBE 编码');
            throw new Error(`NovelAI VIBE 编码失败 (${response.status})`);
        }
        const value = arrayBufferToBase64(await response.arrayBuffer());
        const record = {
            id: `${assetRecord.id}|${model}|${informationExtracted}`,
            assetId: assetRecord.id,
            model,
            modelKey: MODEL_KEYS[model] || 'custom',
            informationExtracted,
            encoding: value,
            createdAt: Date.now()
        };
        await dexieDB.naiVibeEncodings.put(record);
        return record;
    }

    async function importNativeVibe(file) {
        if (file.type === 'image/png' || /\.png$/i.test(file.name)) return importPngVibes(file);
        let parsed;
        try { parsed = JSON.parse(await file.text()); }
        catch (_) { throw new Error('文件不是有效的 NovelAI VIBE JSON 文件'); }
        const vibes = parsed?.identifier === BUNDLE_IDENTIFIER && Array.isArray(parsed.vibes)
            ? parsed.vibes
            : (parsed?.identifier === SINGLE_IDENTIFIER ? [parsed] : null);
        if (!vibes) throw new Error('无法识别 .naiv4vibe / .naiv4vibebundle 标识');
        const created = [];
        for (const native of vibes.slice(0, MAX_VIBES)) {
            if (!native?.id || !native?.encodings || typeof native.encodings !== 'object') continue;
            const id = `vibe_${native.id}`;
            await dexieDB.naiVibeAssets.put({
                id, sourceHash: native.id, name: native.name || file.name,
                image: native.image ? `data:image/png;base64,${dataUrlBody(native.image)}` : '',
                thumbnail: native.thumbnail || '', createdAt: native.createdAt || Date.now(),
                nativeType: native.type || (native.image ? 'image' : 'encoding')
            });
            for (const [modelKey, collection] of Object.entries(native.encodings)) {
                for (const entry of Object.values(collection || {})) {
                    if (!entry?.encoding) continue;
                    const informationExtracted = clamp(entry.params?.information_extracted, 0, 1, native.importInfo?.information_extracted ?? 1);
                    await dexieDB.naiVibeEncodings.put({
                        id: `${id}|${modelKey}|${informationExtracted}|${uid('enc')}`,
                        assetId: id, model: native.importInfo?.model || '', modelKey,
                        informationExtracted, encoding: dataUrlBody(entry.encoding), createdAt: Date.now()
                    });
                }
            }
            created.push({
                assetId: id, name: native.name || file.name, enabled: true,
                strength: clamp(native.importInfo?.strength, 0, 1, 0.6),
                informationExtracted: clamp(native.importInfo?.information_extracted, 0, 1, 1)
            });
        }
        if (!created.length) throw new Error('文件中没有有效的 VIBE 编码');
        return created;
    }

    async function pngTextChunks(buffer) {
        const bytes = new Uint8Array(buffer);
        if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
            throw new Error('文件不是有效的 PNG');
        }
        const view = new DataView(buffer);
        const decoder = new TextDecoder('utf-8');
        const result = {};
        const put = (key, value) => {
            if (!key || !value) return;
            result[key] ||= [];
            result[key].push(value);
        };
        const inflate = async compressed => {
            if (typeof DecompressionStream === 'undefined') return '';
            const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate'));
            const output = new Uint8Array(await new Response(stream).arrayBuffer());
            if (output.length > 2 * 1024 * 1024) throw new Error('PNG 压缩元数据超过 2MB 安全限制');
            return decoder.decode(output);
        };
        for (let offset = 8; offset + 12 <= bytes.length;) {
            const length = view.getUint32(offset, false);
            const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
            const start = offset + 8;
            const end = start + length;
            if (end + 4 > bytes.length) break;
            const body = bytes.subarray(start, end);
            if (type === 'tEXt') {
                const zero = body.indexOf(0);
                if (zero > 0) put(decoder.decode(body.subarray(0, zero)), decoder.decode(body.subarray(zero + 1)));
            } else if (type === 'zTXt') {
                const zero = body.indexOf(0);
                if (zero > 0 && body[zero + 1] === 0) put(decoder.decode(body.subarray(0, zero)), await inflate(body.subarray(zero + 2)));
            } else if (type === 'iTXt') {
                const zero = body.indexOf(0);
                if (zero > 0) {
                    const compressed = body[zero + 1] === 1;
                    let cursor = zero + 3;
                    for (let skipped = 0; skipped < 2; skipped++) cursor = body.indexOf(0, cursor) + 1;
                    const value = compressed ? await inflate(body.subarray(cursor)) : decoder.decode(body.subarray(cursor));
                    put(decoder.decode(body.subarray(0, zero)), value);
                }
            }
            offset = end + 4;
        }
        return result;
    }

    function parseMaybeJson(value) {
        if (!value) return null;
        try { return JSON.parse(value); } catch (_) {}
        try { return JSON.parse(atob(dataUrlBody(value))); } catch (_) {}
        return null;
    }

    function chunkValues(chunks, key) {
        const match = Object.keys(chunks).find(candidate => candidate.toLowerCase() === key.toLowerCase());
        return match ? chunks[match] : [];
    }

    async function importPngVibes(file) {
        const chunks = await pngTextChunks(await file.arrayBuffer());
        const documentCandidates = [...chunkValues(chunks, 'naidata'), ...chunkValues(chunks, 'naiv4vibe')];
        const direct = documentCandidates.map(parseMaybeJson).find(Boolean);
        if (direct?.identifier === SINGLE_IDENTIFIER || direct?.identifier === BUNDLE_IDENTIFIER) {
            const facade = new File([JSON.stringify(direct)], `${file.name}.naiv4vibe`, { type: 'application/json' });
            return importNativeVibe(facade);
        }
        const comment = chunkValues(chunks, 'Comment').map(parseMaybeJson).find(Boolean);
        const references = comment?.reference_image_multiple || comment?.parameters?.reference_image_multiple || [];
        const strengths = comment?.reference_strength_multiple || comment?.parameters?.reference_strength_multiple || [];
        const information = comment?.reference_information_extracted_multiple || comment?.parameters?.reference_information_extracted_multiple || [];
        const model = comment?.model || comment?.model_name || comment?.parameters?.model || db.novelAiSettings?.model || '';
        const rawEncodingChunks = chunkValues(chunks, 'NovelAI_Vibe_Encoding_Base64')
            .map(value => dataUrlBody(value).replace(/\s/g, ''))
            .filter(value => value && !parseMaybeJson(value));
        const recoveredReferences = Array.isArray(references) && references.length ? references : rawEncodingChunks;
        if (!recoveredReferences.length) throw new Error('PNG 中没有可识别的 NovelAI VIBE 元数据');
        const modelKey = MODEL_KEYS[model] || 'custom';
        const created = [];
        for (let index = 0; index < Math.min(recoveredReferences.length, MAX_VIBES); index++) {
            const encoded = dataUrlBody(recoveredReferences[index]);
            const sourceHash = await sha256(encoded);
            const id = `vibe_png_${sourceHash}`;
            const info = clamp(information[index], 0, 1, 1);
            await dexieDB.naiVibeAssets.put({ id, sourceHash, name: `${file.name} #${index + 1}`, image: '', thumbnail: '', createdAt: Date.now(), nativeType: 'encoding' });
            await dexieDB.naiVibeEncodings.put({ id: `${id}|${modelKey}|${info}`, assetId: id, model, modelKey, informationExtracted: info, encoding: encoded, createdAt: Date.now() });
            created.push({ assetId: id, name: `${file.name} #${index + 1}`, enabled: true, strength: clamp(strengths[index], 0, 1, 0.6), informationExtracted: info });
        }
        return created;
    }

    async function addImageFiles(files) {
        const result = [];
        for (const file of [...files].slice(0, MAX_VIBES)) {
            if (!String(file.type || '').startsWith('image/')) continue;
            const image = await fileToDataUrl(file);
            const sourceHash = await sha256(dataUrlBody(image));
            const id = `vibe_${sourceHash}`;
            await dexieDB.naiVibeAssets.put({ id, sourceHash, name: file.name, image, thumbnail: image, createdAt: Date.now(), nativeType: 'image' });
            result.push({ assetId: id, name: file.name, enabled: true, strength: 0.6, informationExtracted: 1 });
        }
        return result;
    }

    async function exportRecord(item, options = {}) {
        const source = await asset(item.assetId);
        if (!source) throw new Error(`VIBE 素材已丢失：${item.name || item.assetId}`);
        const all = await dexieDB.naiVibeEncodings.where('assetId').equals(item.assetId).toArray();
        const encodings = {};
        for (const record of all) {
            const key = record.modelKey || MODEL_KEYS[record.model] || 'custom';
            encodings[key] ||= {};
            // NovelAI 当前 .naiv4vibe 结构按固定编码参数键索引；实际 IE 仍保存在 params 中。
            const hash = await sha256('information_extracted:1');
            encodings[key][hash] = { encoding: record.encoding, params: { information_extracted: record.informationExtracted } };
        }
        return {
            identifier: SINGLE_IDENTIFIER, version: 1,
            type: options.encodingsOnly ? 'encoding' : (source.nativeType || 'image'),
            ...(options.encodingsOnly || !source.image ? {} : { image: dataUrlBody(source.image) }),
            id: source.sourceHash || source.id.replace(/^vibe_/, ''), encodings,
            name: item.name || source.name || 'VIBE',
            ...(options.encodingsOnly || !source.thumbnail ? {} : { thumbnail: source.thumbnail }),
            createdAt: source.createdAt || Date.now(),
            importInfo: {
                model: options.model || db.novelAiSettings?.model || '',
                information_extracted: item.informationExtracted,
                strength: item.strength
            }
        };
    }

    async function downloadJson(data, filename) {
        return OvoFileDownload.save(new Blob([JSON.stringify(data)], { type: 'application/json' }), filename);
    }

    async function resolveForGeneration(model, generationSettings = {}, signal) {
        const settings = generationSettings._referenceSnapshot?.vibe || state();
        if (!settings.enabled || !settings.activeGroupId) return { images: [], information: [], strengths: [], groupName: '' };
        if (!supportsVibe(model)) throw new Error('当前 NovelAI 模型不支持 VIBE。V5 暂不支持，请切换到 V4/V4.5 或 V3，或关闭 VIBE。');
        const current = await group(settings.activeGroupId);
        const items = (current?.items || []).filter(item => item.enabled !== false).slice(0, MAX_VIBES);
        if (!items.length) return { images: [], information: [], strengths: [], groupName: current?.name || '' };
        const images = [];
        const information = [];
        let strengths = [];
        for (const item of items) {
            const source = await asset(item.assetId);
            if (!source) throw new Error(`VIBE 素材已丢失：${item.name || item.assetId}`);
            const info = clamp(item.informationExtracted, 0, 1, 1);
            if (modelFamily(model) === 'v4') {
                const encoded = await encodingFor(item.assetId, model, info);
                if (!encoded) throw new Error(`“${item.name || source.name}”尚未针对当前模型/信息提取值编码，请先点击“编码缺失项”。`);
                images.push(encoded.encoding);
            } else {
                if (!source.image) throw new Error(`“${item.name || source.name}”只包含 V4 编码，无法用于 V3；请导入包含原图的 VIBE。`);
                images.push(await window.NovelAiCompat.fitImage(source.image, 448, 448, 'black', signal));
            }
            information.push(info);
            strengths.push(clamp(item.strength, 0, 1, 0.6));
        }
        const total = strengths.reduce((sum, value) => sum + value, 0);
        if (settings.normalizeStrength !== false && total > 1) strengths = strengths.map(value => value / total);
        return { images, information, strengths, groupName: current?.name || '', normalized: total > 1 && settings.normalizeStrength !== false };
    }

    async function resolvePreciseReferences(model, generationSettings = {}, signal) {
        const settings = generationSettings._referenceSnapshot?.precise || preciseState();
        const items = (settings.items || []).filter(item => item.enabled !== false);
        if (!settings.enabled || !items.length) return { images: [], strengths: [], fidelity: [], descriptions: [] };
        const vibeSettings = generationSettings._referenceSnapshot?.vibe || state();
        if (vibeSettings.enabled && vibeSettings.activeGroupId) throw new Error('Precise Reference 与 VIBE 不能同时启用，请关闭其中一项。');
        if (!/nai-diffusion-4-5-(?:full|curated)/.test(String(model || ''))) throw new Error('Precise Reference 仅支持 NovelAI V4.5 Full / Curated。');
        const result = { images: [], strengths: [], fidelity: [], descriptions: [] };
        for (const item of items) {
            const source = await asset(item.assetId);
            if (!source?.image) throw new Error(`Precise Reference 素材已丢失：${item.name || item.assetId}`);
            result.images.push(await window.NovelAiCompat.fitImage(source.image, undefined, undefined, 'black', signal));
            result.strengths.push(clamp(item.strength, 0, 1, 1));
            result.fidelity.push(clamp(item.fidelity, 0, 1, 1));
            result.descriptions.push(item.mode === 'character' ? 'character' : (item.mode === 'style' ? 'style' : 'character&style'));
        }
        return result;
    }

    async function setupPreciseUI() {
        const root = document.getElementById('novelai-precise-panel');
        if (!root || root.dataset.ready) return;
        root.dataset.ready = '1';
        const enabled = document.getElementById('novelai-precise-enabled');
        const list = document.getElementById('novelai-precise-list');
        const status = document.getElementById('novelai-precise-status');
        const settings = preciseState();
        enabled.checked = !!settings.enabled;
        const save = async () => saveGlobalSettings(['novelAiPreciseReferenceSettings', 'novelAiVibeSettings']);
        const refreshStatus = () => {
            const model = document.getElementById('novelai-api-model')?.value || document.getElementById('novelai-model')?.value || db.novelAiSettings?.model || '';
            const supported = /nai-diffusion-4-5-(?:full|curated)/.test(model);
            status.textContent = supported ? '当前模型可用；与 VIBE 互斥' : '当前模型不支持，仅 V4.5 Full / Curated 可用';
            status.style.color = supported ? '#888' : '#c65d5d';
        };
        const render = async () => {
            list.innerHTML = '';
            if (!settings.items.length) {
                list.innerHTML = '<p style="margin:8px 0;color:#999;font-size:12px;text-align:center;">暂无 Precise Reference</p>';
                return;
            }
            for (const [index, item] of settings.items.entries()) {
                const source = await asset(item.assetId);
                const row = document.createElement('div'); row.style.cssText = 'display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 0;border-top:1px solid #f0f0f0;';
                const thumb = document.createElement('img'); thumb.src = source?.thumbnail || source?.image || ''; thumb.alt = ''; thumb.style.cssText = 'width:42px;height:42px;object-fit:cover;border-radius:7px;background:#eee;';
                const body = document.createElement('div'); body.style.cssText = 'min-width:0;display:flex;flex-direction:column;gap:5px;font-size:11px;';
                const title = document.createElement('div'); title.textContent = item.name || source?.name || `参考 ${index + 1}`; title.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;';
                const mode = document.createElement('select'); mode.style.cssText = 'width:100%;min-width:0;border:1px solid #eee;border-radius:6px;padding:4px;background:transparent;font-size:11px;';
                [['character&style', '角色和风格'], ['character', '仅角色'], ['style', '仅风格']].forEach(([value, label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; mode.appendChild(option); });
                mode.value = item.mode || 'character&style'; mode.onchange = async () => { item.mode = mode.value; await save(); };
                const sliders = document.createElement('div'); sliders.style.cssText = 'display:grid;grid-template-columns:auto minmax(45px,1fr) 28px;gap:4px;align-items:center;color:#888;';
                const addSlider = (label, key) => { const l = document.createElement('span'); l.textContent = label; const input = document.createElement('input'); input.type = 'range'; input.min = '0'; input.max = '1'; input.step = '.05'; input.value = item[key] ?? 1; input.style.cssText = 'width:100%;min-width:0;accent-color:var(--primary-color);'; const out = document.createElement('span'); out.textContent = Number(input.value).toFixed(2); input.oninput = () => { item[key] = Number(input.value); out.textContent = Number(input.value).toFixed(2); }; input.onchange = save; sliders.append(l, input, out); };
                addSlider('强度', 'strength'); addSlider('保真', 'fidelity'); body.append(title, mode, sliders);
                const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn btn-small'; remove.textContent = '移除'; remove.style.cssText = 'padding:5px 7px;font-size:11px;'; remove.onclick = async () => { settings.items.splice(index, 1); await save(); await render(); };
                row.append(thumb, body, remove); list.appendChild(row);
            }
        };
        enabled.onchange = async () => {
            settings.enabled = enabled.checked;
            if (enabled.checked && state().enabled) {
                state().enabled = false;
                const vibeToggle = document.getElementById('novelai-vibe-enabled'); if (vibeToggle) vibeToggle.checked = false;
                showToast('已关闭 VIBE：Precise Reference 与 VIBE 不能同时使用');
            }
            await save();
        };
        document.getElementById('novelai-api-model')?.addEventListener('change', refreshStatus);
        document.getElementById('novelai-model')?.addEventListener('change', refreshStatus);
        document.getElementById('novelai-precise-add')?.addEventListener('click', () => {
            const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp'; input.multiple = true; input.style.display = 'none';
            input.onchange = async () => { try { const added = await addImageFiles(input.files); settings.items.push(...added.map(item => ({ ...item, mode: 'character&style', fidelity: 1, strength: 1 }))); await save(); await render(); } catch (error) { showToast(`添加失败：${error.message}`); } finally { input.remove(); } };
            document.body.appendChild(input); input.click();
        });
        document.getElementById('novelai-precise-clear')?.addEventListener('click', async () => { settings.items = []; await save(); await render(); showToast('Precise Reference 已清空'); });
        refreshStatus(); await render();
    }

    async function setupCharacterPromptUI() {
        const root = document.getElementById('novelai-character-panel');
        if (!root || root.dataset.ready) return;
        root.dataset.ready = '1';
        const list = document.getElementById('novelai-character-list');
        const coords = document.getElementById('novelai-character-use-coords');
        const order = document.getElementById('novelai-character-use-order');
        const status = document.getElementById('novelai-character-status');
        db.novelAiSettings ||= {};
        db.novelAiSettings.characterPrompts = Array.isArray(db.novelAiSettings.characterPrompts) ? db.novelAiSettings.characterPrompts : [];
        coords.checked = !!db.novelAiSettings.characterUseCoords;
        order.checked = db.novelAiSettings.characterUseOrder !== false;
        const currentModel = () => document.getElementById('novelai-api-model')?.value || document.getElementById('novelai-model')?.value || db.novelAiSettings.model || '';
        const limit = () => modelFamily(currentModel()) === 'v5' ? 22 : 6;
        const save = async () => {
            db.novelAiSettings.characterUseCoords = coords.checked;
            db.novelAiSettings.characterUseOrder = order.checked;
            if (typeof saveGlobalSettings === 'function') await saveGlobalSettings(['novelAiSettings']);
        };
        const render = () => {
            list.innerHTML = '';
            const family = modelFamily(currentModel());
            status.textContent = family === 'v3' ? '当前 V3 不支持多角色提示。' : `当前模型最多 ${limit()} 个角色；位置坐标范围 0–1。`;
            status.style.color = family === 'v3' ? '#c65d5d' : '#999';
            for (const [index, item] of db.novelAiSettings.characterPrompts.entries()) {
                const card = document.createElement('div'); card.style.cssText = 'padding:8px 0;border-top:1px solid #f0f0f0;';
                const head = document.createElement('div'); head.style.cssText = 'display:flex;align-items:center;gap:6px;';
                const title = document.createElement('span'); title.textContent = `角色 ${index + 1}`; title.style.cssText = 'font-size:11px;color:#777;flex:1;';
                const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn btn-small'; remove.textContent = '移除'; remove.style.cssText = 'padding:4px 7px;font-size:10px;';
                remove.onclick = async () => { db.novelAiSettings.characterPrompts.splice(index, 1); await save(); render(); };
                head.append(title, remove);
                const positive = document.createElement('textarea'); positive.rows = 2; positive.placeholder = '角色正面提示词'; positive.value = item.prompt || ''; positive.style.cssText = 'width:100%;box-sizing:border-box;margin-top:5px;padding:7px;border:1px solid #e5e5e5;border-radius:7px;resize:vertical;font-size:12px;';
                const negative = document.createElement('textarea'); negative.rows = 1; negative.placeholder = '角色负面提示词（可选）'; negative.value = item.uc || ''; negative.style.cssText = positive.style.cssText;
                const positions = document.createElement('div'); positions.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:5px;font-size:11px;color:#888;';
                const makePosition = (label, axis, fallback) => { const wrap = document.createElement('label'); wrap.style.cssText = 'display:flex;align-items:center;gap:4px;min-width:0;'; wrap.append(document.createTextNode(label)); const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.max = '1'; input.step = '.05'; input.value = clamp(item.center?.[axis], 0, 1, fallback); input.style.cssText = 'width:58px;max-width:100%;padding:4px;border:1px solid #eee;border-radius:6px;background:transparent;'; input.onchange = async () => { item.center ||= {}; item.center[axis] = clamp(input.value, 0, 1, fallback); input.value = item.center[axis]; await save(); }; wrap.append(input); positions.append(wrap); };
                makePosition('X', 'x', 0.5); makePosition('Y', 'y', 0.5);
                positive.onchange = async () => { item.prompt = positive.value.trim(); await save(); };
                negative.onchange = async () => { item.uc = negative.value.trim(); await save(); };
                card.append(head, positive, negative, positions); list.appendChild(card);
            }
        };
        coords.onchange = save; order.onchange = save;
        document.getElementById('novelai-character-add')?.addEventListener('click', async () => {
            if (modelFamily(currentModel()) === 'v3') return showToast('V3 不支持多角色提示');
            if (db.novelAiSettings.characterPrompts.length >= limit()) return showToast(`当前模型最多 ${limit()} 个角色提示`);
            db.novelAiSettings.characterPrompts.push({ prompt: '', uc: '', center: { x: 0.5, y: 0.5 } });
            await save(); render();
        });
        document.getElementById('novelai-api-model')?.addEventListener('change', render);
        document.getElementById('novelai-model')?.addEventListener('change', render);
        document.addEventListener('novelai-character-settings-changed', render);
        render();
    }

    async function setupUI() {
        const root = document.getElementById('novelai-vibe-panel');
        if (!root || root.dataset.ready) return;
        root.dataset.ready = '1';
        const enabled = document.getElementById('novelai-vibe-enabled');
        const select = document.getElementById('novelai-vibe-group');
        const name = document.getElementById('novelai-vibe-group-name');
        const list = document.getElementById('novelai-vibe-list');
        const normalize = document.getElementById('novelai-vibe-normalize');
        const status = document.getElementById('novelai-vibe-model-status');
        let draftItems = [];

        const currentModel = () => document.getElementById('novelai-api-model')?.value || document.getElementById('novelai-model')?.value || db.novelAiSettings?.model || 'nai-diffusion-4-5-full';
        const refreshStatus = () => {
            const model = currentModel();
            const family = modelFamily(model);
            status.textContent = family === 'v5' ? '当前 V5 暂不支持 VIBE' : (family === 'v4' ? 'V4/V4.5 使用模型专属编码' : (family === 'v3' ? 'V3 直接使用参考图' : '当前模型兼容性未知'));
            status.style.color = family === 'v5' ? '#c65d5d' : '#888';
        };
        const renderGroups = async () => {
            const all = await groups();
            select.innerHTML = '<option value="">不使用 VIBE 组</option>';
            all.forEach(item => {
                const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; select.appendChild(option);
            });
            select.value = state().activeGroupId || '';
        };
        const renderItems = async () => {
            list.innerHTML = '';
            if (!draftItems.length) {
                list.innerHTML = '<p style="margin:8px 0;color:#999;font-size:12px;text-align:center;">暂无参考图或导入的 VIBE</p>';
                return;
            }
            for (const [index, item] of draftItems.entries()) {
                const source = await asset(item.assetId);
                const row = document.createElement('div');
                row.style.cssText = 'display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 0;border-top:1px solid #f0f0f0;';
                const thumb = document.createElement('img');
                thumb.src = source?.thumbnail || source?.image || ''; thumb.alt = ''; thumb.style.cssText = 'width:42px;height:42px;object-fit:cover;border-radius:7px;background:#eee;';
                const controls = document.createElement('div'); controls.style.cssText = 'min-width:0;';
                const title = document.createElement('input'); title.value = item.name || source?.name || `VIBE ${index + 1}`; title.title = 'VIBE 名称'; title.style.cssText = 'width:100%;min-width:0;font-size:12px;border:none;background:transparent;padding:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                title.addEventListener('change', () => { item.name = title.value.trim() || source?.name || `VIBE ${index + 1}`; });
                const model = currentModel();
                const ready = modelFamily(model) === 'v4' ? await encodingFor(item.assetId, model, item.informationExtracted) : null;
                const encodingState = document.createElement('div');
                encodingState.textContent = modelFamily(model) === 'v4' ? (ready ? '当前模型：已编码' : '当前模型：待编码') : (modelFamily(model) === 'v3' ? 'V3：直接使用原图' : '当前模型不支持 VIBE');
                encodingState.style.cssText = `font-size:10px;margin-top:2px;color:${ready || modelFamily(model) === 'v3' ? '#72906f' : '#b77a66'};`;
                const sliders = document.createElement('div'); sliders.style.cssText = 'display:grid;grid-template-columns:auto minmax(60px,1fr) 32px;gap:5px;align-items:center;font-size:11px;color:#888;margin-top:4px;';
                const makeSlider = (label, key, value) => {
                    const labelEl = document.createElement('span'); labelEl.textContent = label;
                    const input = document.createElement('input'); input.type = 'range'; input.min = '0'; input.max = '1'; input.step = '0.05'; input.value = String(value); input.style.cssText = 'width:100%;min-width:0;accent-color:var(--primary-color);';
                    const output = document.createElement('span'); output.textContent = Number(value).toFixed(2);
                    input.addEventListener('input', () => { item[key] = Number(input.value); output.textContent = Number(input.value).toFixed(2); if (key === 'informationExtracted' && modelFamily(currentModel()) === 'v4') { encodingState.textContent = '参数已变更：待编码'; encodingState.style.color = '#b77a66'; } });
                    sliders.append(labelEl, input, output);
                };
                makeSlider('强度', 'strength', item.strength); makeSlider('提取', 'informationExtracted', item.informationExtracted);
                controls.append(title, encodingState, sliders);
                const actions = document.createElement('div'); actions.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
                const exportOne = document.createElement('button'); exportOne.type = 'button'; exportOne.className = 'btn btn-small'; exportOne.textContent = '导出'; exportOne.style.cssText = 'padding:4px 6px;font-size:10px;';
                exportOne.addEventListener('click', async () => { try { await downloadJson(await exportRecord(item), `${item.name || 'VIBE'}.naiv4vibe`); } catch (error) { showToast(`导出失败：${error.message}`); } });
                const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn btn-small'; remove.textContent = '移除'; remove.style.cssText = 'padding:4px 6px;font-size:10px;';
                remove.addEventListener('click', async () => { draftItems.splice(index, 1); await renderItems(); });
                actions.append(exportOne, remove); row.append(thumb, controls, actions); list.appendChild(row);
            }
        };
        const load = async () => {
            const selected = await group(select.value);
            name.value = selected?.name || '';
            draftItems = JSON.parse(JSON.stringify(selected?.items || []));
            await renderItems();
        };
        const persistState = async () => {
            state().enabled = !!enabled.checked; state().activeGroupId = select.value; state().normalizeStrength = !!normalize.checked;
            if (typeof saveGlobalSettings === 'function') await saveGlobalSettings(['novelAiVibeSettings']);
        };

        enabled.checked = !!state().enabled; normalize.checked = state().normalizeStrength !== false;
        await renderGroups(); await load(); refreshStatus();
        document.getElementById('novelai-api-model')?.addEventListener('change', async () => { refreshStatus(); await renderItems(); });
        document.getElementById('novelai-model')?.addEventListener('change', async () => { refreshStatus(); await renderItems(); });
        enabled.addEventListener('change', async () => {
            if (enabled.checked && preciseState().enabled) {
                preciseState().enabled = false;
                const preciseToggle = document.getElementById('novelai-precise-enabled'); if (preciseToggle) preciseToggle.checked = false;
                showToast('已关闭 Precise Reference：VIBE 与 Precise Reference 不能同时使用');
                await saveGlobalSettings(['novelAiPreciseReferenceSettings']);
            }
            await persistState();
        });
        normalize.addEventListener('change', persistState);
        select.addEventListener('change', async () => { await persistState(); await load(); });
        document.getElementById('novelai-vibe-new')?.addEventListener('click', async () => { select.value = ''; name.value = ''; draftItems = []; await persistState(); await renderItems(); name.focus(); });
        document.getElementById('novelai-vibe-save')?.addEventListener('click', async () => {
            const label = name.value.trim(); if (!label) return showToast('请填写 VIBE 组名称');
            if (draftItems.length > MAX_VIBES) return showToast(`每组最多 ${MAX_VIBES} 个 VIBE`);
            const id = select.value || uid('vibe_group');
            await dexieDB.naiVibeGroups.put({ id, name: label, items: draftItems, createdAt: (await group(id))?.createdAt || Date.now(), updatedAt: Date.now() });
            state().activeGroupId = id; state().enabled = true; enabled.checked = true;
            if (preciseState().enabled) {
                preciseState().enabled = false;
                const preciseToggle = document.getElementById('novelai-precise-enabled'); if (preciseToggle) preciseToggle.checked = false;
            }
            await saveGlobalSettings(['novelAiVibeSettings', 'novelAiPreciseReferenceSettings']); await renderGroups(); select.value = id; showToast('VIBE 组已保存并启用');
        });
        document.getElementById('novelai-vibe-delete')?.addEventListener('click', async () => {
            if (!select.value) return showToast('请先选择 VIBE 组');
            const decision = typeof showAppConfirmDialog === 'function' ? await showAppConfirmDialog({ title: '删除 VIBE 组', message: `确定删除“${name.value || '当前 VIBE 组'}”吗？素材库不会被删除。`, confirmText: '删除', cancelText: '取消', dismissText: '' }) : 'cancel';
            if (decision !== 'confirm') return;
            await dexieDB.naiVibeGroups.delete(select.value); state().activeGroupId = ''; state().enabled = false; enabled.checked = false;
            await saveGlobalSettings(['novelAiVibeSettings']); await renderGroups(); await load(); showToast('VIBE 组已删除');
        });
        document.getElementById('novelai-vibe-add-images')?.addEventListener('click', () => {
            const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp'; input.multiple = true; input.style.display = 'none';
            input.onchange = async () => { try { const room = MAX_VIBES - draftItems.length; if (room <= 0) return showToast(`每组最多 ${MAX_VIBES} 个 VIBE`); draftItems.push(...await addImageFiles([...input.files].slice(0, room))); await renderItems(); } catch (error) { showToast(`添加失败：${error.message}`); } finally { input.remove(); } };
            document.body.appendChild(input); input.click();
        });
        document.getElementById('novelai-vibe-import')?.addEventListener('click', () => {
            const input = document.createElement('input'); input.type = 'file'; input.accept = '.naiv4vibe,.naiv4vibebundle,.png,application/json,image/png'; input.multiple = true; input.style.display = 'none';
            input.onchange = async () => { try { for (const file of input.files) { const room = MAX_VIBES - draftItems.length; if (room <= 0) break; draftItems.push(...(await importNativeVibe(file)).slice(0, room)); } await renderItems(); showToast('NovelAI VIBE 已导入，请保存组'); } catch (error) { showToast(`导入失败：${error.message}`); } finally { input.remove(); } };
            document.body.appendChild(input); input.click();
        });
        document.getElementById('novelai-vibe-encode')?.addEventListener('click', async event => {
            const button = event.currentTarget; const model = currentModel();
            if (modelFamily(model) !== 'v4') return showToast(modelFamily(model) === 'v3' ? 'V3 直接使用原图，无需编码' : '当前模型不支持 VIBE 编码');
            button.disabled = true; const old = button.textContent; button.textContent = '编码中…';
            try {
                let count = 0;
                for (const item of draftItems.filter(item => item.enabled !== false)) {
                    const info = clamp(item.informationExtracted, 0, 1, 1);
                    if (await encodingFor(item.assetId, model, info)) continue;
                    const source = await asset(item.assetId); if (!source?.image) throw new Error(`“${item.name}”没有原图，无法重新编码`);
                    await encodeAsset(source, model, info); count++;
                }
                await renderItems();
                showToast(count ? `已完成 ${count} 个 VIBE 编码` : '当前模型和提取值的编码已齐全');
            } catch (error) { showToast(`编码失败：${error.message}`); } finally { button.disabled = false; button.textContent = old; }
        });
        document.getElementById('novelai-vibe-export')?.addEventListener('click', async () => {
            if (!draftItems.length) return showToast('当前组没有可导出的 VIBE');
            try {
                const vibes = []; for (const item of draftItems) vibes.push(await exportRecord(item));
                await downloadJson({ identifier: BUNDLE_IDENTIFIER, version: 1, vibes }, `${name.value.trim() || 'OVO_VIBE组'}.naiv4vibeBundle`);
            } catch (error) { showToast(`导出失败：${error.message}`); }
        });
        document.getElementById('novelai-vibe-export-encodings')?.addEventListener('click', async () => {
            if (!draftItems.length) return showToast('当前组没有可导出的 VIBE');
            try {
                const vibes = []; for (const item of draftItems) vibes.push(await exportRecord(item, { encodingsOnly: true, model: currentModel() }));
                await downloadJson({ identifier: BUNDLE_IDENTIFIER, version: 1, vibes }, `${name.value.trim() || 'OVO_VIBE组'}_仅编码.naiv4vibeBundle`);
            } catch (error) { showToast(`导出失败：${error.message}`); }
        });
        await setupPreciseUI();
        await setupCharacterPromptUI();
    }

    window.NovelAiVibe = {
        SINGLE_IDENTIFIER, BUNDLE_IDENTIFIER, MAX_VIBES, MODEL_KEYS,
        modelFamily, supportsVibe, resolveForGeneration, resolvePreciseReferences, setupUI,
        _test: { clamp, dataUrlBody, pngTextChunks, chunkValues }
    };
})();
