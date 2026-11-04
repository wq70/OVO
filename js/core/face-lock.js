// 每个角色聊天独立保存角色和用户的人物参考，按出镜标记选用。
(function () {
    'use strict';
    const clone = value => JSON.parse(JSON.stringify(value || {}));
    const el = id => document.getElementById(id);
    const settingKeys = { gpt: 'gptImageSettings', novelai: 'novelAiSettings', google: 'googleImageSettings', stability: 'stabilityImageSettings' };
    const referenceCache = new Map();
    const drafts = new Map();

    function provider() {
        const active = db.activeImageProvider;
        return settingKeys[active] && db[settingKeys[active]]?.enabled ? active
            : Object.keys(settingKeys).find(key => db[settingKeys[key]]?.enabled) || '';
    }

    function supported(engine, settings = {}) {
        if (engine === 'novelai') return /^nai-diffusion-4-5-(?:full|curated)$/.test(settings.model || 'nai-diffusion-4-curated-preview');
        if (engine === 'gpt') return /^gpt-image-/.test(settings.model || 'dall-e-3');
        if (engine === 'google') return /gemini.*image/i.test(settings.model || 'gemini-3.1-flash-image');
        return false;
    }

    function supportsTwoReferences(engine, settings) {
        return supported(engine, settings) && (engine === 'gpt'
            || (engine === 'google' && !/flash-lite/i.test(settings.model || '')));
    }

    function parsePrompt(value, includeUser = true) {
        const text = String(value || '');
        const markerPattern = /\bovo_subject_(?:self|user|both|other)\b/gi;
        const markers = (text.match(markerPattern) || []).map(marker => marker.toLowerCase());
        const first = markers[0];
        // 有冲突或缺少主体标记时不猜人物，历史消息保持普通生图行为。
        const subject = first && markers.every(marker => marker === first) ? first.slice('ovo_subject_'.length) : 'other';
        return {
            subject: !includeUser && (subject === 'user' || subject === 'both') ? 'other' : subject,
            markers,
            prompt: text.replace(markerPattern, '').replace(/[,，]\s*[,，]/g, ', ').replace(/^[,，\s]+|[,，\s]+$/g, '').trim()
        };
    }

    function subjectInstruction(includeUser = false) {
        const prefix = '人物参考内部标记：按实际出镜者判断，在 {{英文生图提示词}} 末尾只加一个标记。';
        const rules = includeUser
            ? '你是 CHAR，与你私聊的用户是 USER。CHAR 和 USER 都出镜时用 ovo_subject_both；CHAR 出镜但 USER 没出镜时用 ovo_subject_self；USER 出镜但 CHAR 没出镜时用 ovo_subject_user；两人都没出镜时用 ovo_subject_other。其他人是否同框不影响选择。合照的英文提示词须描述每位人物的位置或动作，并用 CHAR 和 USER 标明对应人物。'
            : '发送者本人单独出镜时用 ovo_subject_self；风景、食物、宠物、其他人物、多人合照均用 ovo_subject_other。';
        return prefix + rules + '标记只写在双花括号内，中文描述不出现标记。';
    }

    function messageCharacter(chat, chatType, message) {
        if (!message || message.role === 'user') return null;
        if (chatType === 'private') return chat;
        const member = chat?.members?.find(item => item.id === message.senderId);
        return (db.characters || []).find(item => item.id === member?.originalCharId) || null;
    }

    function enabledReferences(character, subject) {
        const references = [];
        if ((subject === 'self' || subject === 'both') && character?.imageFaceLock?.enabled) {
            references.push({ subject: 'self', referenceImage: character.imageFaceLock.referenceImage || '' });
        }
        if ((subject === 'user' || subject === 'both') && character?.userImageFaceLock?.enabled) {
            references.push({ subject: 'user', referenceImage: character.userImageFaceLock.referenceImage || '' });
        }
        return references;
    }

    function capture(character, subject, engine = provider()) {
        const settings = clone(db[settingKeys[engine]]);
        settings._hasCharacterContext = true;
        settings._character = character ? { id: character.id, gptArtistPrompt: character.gptArtistPrompt || '', gptImageSizeOverride: character.gptImageSizeOverride || '' } : null;
        const references = enabledReferences(character, subject);
        if (references.length) settings._faceLock = { characterId: character.id, references };
        if (engine === 'novelai') {
            settings._referenceSnapshot = { vibe: clone(db.novelAiVibeSettings), precise: clone(db.novelAiPreciseReferenceSettings) };
        }
        return { provider: engine, settings };
    }

    async function normalizeImage(source, signal) {
        if (!source) throw new Error('人物参考图为空，请在角色设置中上传图片');
        let blob;
        if (source instanceof Blob) blob = source;
        else {
            if (!/^(?:https?:\/\/|data:image\/)/i.test(String(source))) throw new Error('人物参考图片格式无效，请重新上传');
            const response = await fetch(source, { signal });
            if (!response.ok) throw new Error('无法读取人物参考图，请改为上传图片');
            blob = await response.blob();
        }
        if (!/^image\/(?:png|jpeg|webp|gif)$/i.test(blob.type)) throw new Error('请选择 PNG、JPG、WebP 或 GIF 图片');
        // GIF 取首帧；统一为 JPEG，避免各接口格式差异和透明背景影响。
        if (blob.type === 'image/gif') blob = new Blob([blob], { type: 'image/png' });
        return compressImage(blob, { quality: 0.95, maxWidth: 1536, maxHeight: 1536 });
    }

    async function resolveReference(reference, signal) {
        const source = reference.referenceImage;
        if (!source) throw new Error('人物参考图已丢失，请在角色设置中重新上传');
        let dataUrl = source;
        if (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(dataUrl)) {
            dataUrl = referenceCache.get(source);
            if (!dataUrl) {
                dataUrl = await normalizeImage(source, signal);
                if (referenceCache.size >= 4) referenceCache.delete(referenceCache.keys().next().value);
                referenceCache.set(source, dataUrl);
            }
        }
        const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/);
        if (!match) throw new Error('人物参考图无效，请重新上传');
        return { dataUrl, mimeType: match[1], data: match[2], subject: reference.subject };
    }

    async function reference(settings, engine, signal) {
        const lock = settings._faceLock;
        if (!lock) return null;
        if (!supported(engine, settings)) throw new Error('当前生图模型不支持锁脸，请选择支持人物参考的模型，或关闭对应的生图锁脸');
        if (lock.references.length > 1 && !supportsTwoReferences(engine, settings)) {
            throw new Error('当前模型无法在合照中分别锁定 CHAR 和 USER，请切换到支持多张人物参考的 GPT Image 或 Gemini 图片模型，或只开启一方的锁脸');
        }
        const images = await Promise.all(lock.references.map(item => resolveReference(item, signal)));
        const metadata = { characterId: lock.characterId };
        if (images.length > 1) metadata.subject = 'both';
        else if (images[0].subject === 'user') metadata.subject = 'user';
        return { images, metadata };
    }

    function renderDraft(draft) {
        const control = draft.control;
        control('enabled').checked = draft.enabled;
        control('reference').hidden = !draft.enabled;
        const image = control('preview');
        image.hidden = !draft.referenceImage;
        if (draft.referenceImage) image.src = draft.referenceImage;
        else image.removeAttribute('src');
        control('empty').hidden = !!draft.referenceImage;
        control('change').textContent = draft.referenceImage ? '更换' : '上传参考图';
        control('change').disabled = draft.busy;
        control('enabled').disabled = draft.busy;
        const engine = provider();
        const settings = { ...db[settingKeys[engine]] };
        if (engine === 'novelai' && el('novelai-model')?.value) settings.model = el('novelai-model').value;
        control('status').textContent = draft.busy ? '正在处理参考图片…'
            : !engine ? '请先在 API 设置中启用生图服务。'
            : !supported(engine, settings) ? '当前模型不支持锁脸，请在 API 设置中选择支持人物参考的模型。'
            : engine === 'novelai' ? 'NovelAI 每张图只能锁定一方。锁脸时暂停使用全局参考与 VIBE，人物参考可能额外计费。'
            : !supportsTwoReferences(engine, settings) ? '当前模型每张图只能锁定一方。'
            : '当前模型可使用人物参考；第三方接口需支持图片输入，参考图片可能额外计费。';
    }

    async function setReference(source, target) {
        if (target.busy) return;
        target.busy = true;
        renderDraft(target);
        try {
            const image = await normalizeImage(source);
            if (drafts.get(target.key) !== target) return;
            target.referenceImage = image;
            showToast('参考图已选定，保存设置后生效');
        } catch (error) {
            if (drafts.get(target.key) === target) showToast(error.message || '无法读取参考图，请重新上传');
        } finally {
            target.busy = false;
            if (drafts.get(target.key) === target) renderDraft(target);
        }
    }

    function loadDraft(character, key, prefix, getAvatar) {
        const control = suffix => el(prefix + suffix);
        const toggle = control('enabled');
        if (!toggle) return;
        const lock = character[key];
        const draft = { key, control, characterId: character.id, enabled: !!lock?.enabled, referenceImage: lock?.referenceImage || '', busy: false };
        drafts.set(key, draft);
        toggle.onchange = async () => {
            draft.enabled = toggle.checked;
            renderDraft(draft);
            if (draft.enabled && !draft.referenceImage) {
                const avatar = getAvatar();
                if (avatar) await setReference(avatar, draft);
            }
        };
        const file = control('file');
        const menu = control('source');
        // 保留文件选择器打开时的草稿，切换聊天后丢弃旧文件选择。
        const openFile = () => {
            file.faceLockDraft = draft;
            file.click();
        };
        control('change').onclick = () => {
            if (draft.busy) return;
            if (!draft.referenceImage) openFile();
            else { menu.value = ''; window.openCenteredSelect(menu); }
        };
        menu.onchange = () => {
            if (menu.value === 'upload') openFile();
            if (menu.value === 'avatar') {
                const avatar = getAvatar();
                if (avatar) setReference(avatar, draft);
                else showToast('当前没有头像，请上传参考图');
            }
            menu.value = '';
        };
        file.onchange = () => {
            if (file.files?.[0] && file.faceLockDraft === draft) setReference(file.files[0], draft);
            file.value = '';
            file.faceLockDraft = null;
        };
        renderDraft(draft);
    }

    function loadSettings(character) {
        drafts.clear();
        loadDraft(character, 'imageFaceLock', 'setting-face-lock-',
            () => el('setting-char-avatar-preview')?.getAttribute('src') || character.avatar);
        loadDraft(character, 'userImageFaceLock', 'setting-user-face-lock-',
            () => el('setting-my-avatar-preview')?.getAttribute('src') || character.myAvatar);
        const modelSelect = el('novelai-model');
        if (modelSelect && !modelSelect.dataset.faceLockBound) {
            modelSelect.dataset.faceLockBound = 'true';
            modelSelect.addEventListener('change', () => drafts.forEach(renderDraft));
        }
    }

    function saveSettings(character) {
        const currentDrafts = [...drafts.values()].filter(draft => draft.characterId === character.id);
        for (const draft of currentDrafts) {
            const label = draft.key === 'userImageFaceLock' ? 'USER' : '角色';
            if (draft.busy) throw new Error(label + '参考图还在处理，请稍后保存');
            if (draft.enabled && !draft.referenceImage) throw new Error('请先上传' + label + '参考图，或关闭对应的生图锁脸');
        }
        for (const { key, enabled, referenceImage } of currentDrafts) {
            if (enabled || referenceImage || character[key]) character[key] = { enabled, referenceImage };
        }
    }

    window.OvoFaceLock = { provider, supported, parsePrompt, subjectInstruction, messageCharacter, enabledReferences, capture, reference, loadSettings, saveSettings };
})();
