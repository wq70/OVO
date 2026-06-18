// --- 用户头像识别与头像库模块 ---
// 复用主API视觉能力，识别用户头像并缓存，角色可感知头像更换（系统级通知）

(function () {
    'use strict';

    function getAvatarRecognitionPrompt() {
        const level = (db && db.avatarRecognitionDetailLevel) !== undefined && db.avatarRecognitionDetailLevel !== null
            ? db.avatarRecognitionDetailLevel : 'detailed';
        const num = typeof level === 'number' ? level : (typeof level === 'string' ? parseInt(level, 10) : NaN);
        if (!isNaN(num) && num > 0) {
            return '请用约' + num + '字的中文描述这张头像的主要内容，只输出描述不要其他内容。';
        }
        if (level === 'brief') {
            return '请用10-20字简洁概括这张头像的主要内容，只输出描述不要其他内容。例如：黑猫、海边自拍、穿白裙的少女。';
        }
        if (level === 'standard') {
            return '请用30-50字描述这张头像的画面，包括主体、服装或配饰、背景、色调。只输出描述不要其他内容。例如：穿白裙的动漫少女，粉色蝴蝶结，背景是梦幻的粉色云朵。';
        }
        return '请详细描述这张头像画面的内容。包括：人物外貌与发型、服装与配饰、动作与表情、背景与氛围、整体色调等。用完整的中文描述，不要省略，不要只输出一个词或半句话。只输出描述文字，不要其他内容。';
    }

    async function callVisionAPI(imageUrl) {
        if (!db || !db.apiSettings) throw new Error('API未配置');
        let { url, key, model } = db.apiSettings;
        if (!url || !key || !model) throw new Error('请先在 API 应用中完成设置');
        if (url.endsWith('/')) url = url.slice(0, -1);

        const promptText = getAvatarRecognitionPrompt();
        const messages = [
            {
                role: 'user',
                content: [
                    { type: 'text', text: promptText },
                    { type: 'image_url', image_url: { url: imageUrl } }
                ]
            }
        ];

        const res = await fetch(`${url}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                temperature: 0.3
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error('识别失败: ' + (errText || res.status));
        }
        const data = await res.json();
        const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        return (text && text.trim()) ? text.trim() : '未命名头像';
    }

    function getChar(charOrCharId) {
        if (!charOrCharId) return null;
        if (typeof charOrCharId === 'object' && charOrCharId.id) return charOrCharId;
        return db.characters.find(c => c.id === charOrCharId) || null;
    }

    function ensureUserAvatarLibrary(charOrCharId) {
        const char = getChar(charOrCharId);
        if (!char) return [];
        if (!char.userAvatarLibrary || !Array.isArray(char.userAvatarLibrary)) {
            char.userAvatarLibrary = [];
        }
        return char.userAvatarLibrary;
    }

    function ensureCharAvatarLibrary(charOrCharId) {
        const char = getChar(charOrCharId);
        if (!char) return [];
        if (!char.charAvatarLibrary || !Array.isArray(char.charAvatarLibrary)) {
            char.charAvatarLibrary = [];
        }
        return char.charAvatarLibrary;
    }

    function ensureCoupleAvatarLibrary(charOrCharId) {
        const char = getChar(charOrCharId);
        if (!char) return [];
        if (!char.coupleAvatarLibrary || !Array.isArray(char.coupleAvatarLibrary)) {
            char.coupleAvatarLibrary = [];
        }
        return char.coupleAvatarLibrary;
    }

    /** 按百分比裁剪图片，坐标 0–100。返回 dataURL */
    function cropImageByPercent(imageUrl, x1Pct, y1Pct, x2Pct, y2Pct) {
        return new Promise(function (resolve, reject) {
            var img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function () {
                var w = img.width;
                var h = img.height;
                var x1 = Math.round(w * Math.max(0, Math.min(100, x1Pct)) / 100);
                var y1 = Math.round(h * Math.max(0, Math.min(100, y1Pct)) / 100);
                var x2 = Math.round(w * Math.max(0, Math.min(100, x2Pct)) / 100);
                var y2 = Math.round(h * Math.max(0, Math.min(100, y2Pct)) / 100);
                var sw = Math.max(1, x2 - x1);
                var sh = Math.max(1, y2 - y1);
                var canvas = document.createElement('canvas');
                canvas.width = sw;
                canvas.height = sh;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, x1, y1, sw, sh, 0, 0, sw, sh);
                try {
                    resolve(canvas.toDataURL('image/jpeg', 0.85));
                } catch (e) {
                    reject(e);
                }
            };
            img.onerror = function () { reject(new Error('图片加载失败')); };
            img.src = imageUrl;
        });
    }

    function showRecognitionModal(avatarUrl, recognizedText, charId) {
        return new Promise((resolve) => {
            const modal = document.getElementById('avatar-recognition-modal');
            const preview = document.getElementById('ar-preview-img');
            const nameInput = document.getElementById('ar-name-input');
            const descInput = document.getElementById('ar-description-input');
            const cancelBtn = document.getElementById('ar-cancel-btn');
            const confirmBtn = document.getElementById('ar-confirm-btn');

            if (!modal || !preview) {
                resolve(recognizedText || '新头像');
                return;
            }
            var hasNameInput = nameInput && nameInput.nodeName;
            var hasDescInput = descInput && descInput.nodeName;

            preview.src = avatarUrl;
            if (hasNameInput) nameInput.value = '';
            if (hasDescInput) descInput.value = recognizedText || '';
            if (hasNameInput) nameInput.disabled = false;
            if (hasDescInput) descInput.disabled = false;
            modal.classList.add('visible');

            const finish = (nameVal) => {
                modal.classList.remove('visible');
                if (cancelBtn) cancelBtn.onclick = null;
                if (confirmBtn) confirmBtn.onclick = null;
                resolve(nameVal || '新头像');
            };

            if (cancelBtn) cancelBtn.onclick = () => finish('新头像');
            if (confirmBtn) confirmBtn.onclick = () => {
                var nameVal = hasNameInput && nameInput.value && nameInput.value.trim() ? nameInput.value.trim() : null;
                if (!nameVal) {
                    if (typeof showToast === 'function') showToast('请填写名称（如：开心、生气）');
                    return;
                }
                var descVal = hasDescInput && descInput.value && descInput.value.trim() ? descInput.value.trim() : (recognizedText || '');
                const lib = ensureUserAvatarLibrary(charId);
                const existing = lib.find(a => a.url === avatarUrl);
                if (existing) {
                    existing.name = nameVal;
                    existing.description = descVal || existing.description;
                    existing.isEdited = true;
                } else {
                    lib.push({
                        id: 'avatar_' + Date.now(),
                        url: avatarUrl,
                        name: nameVal,
                        description: descVal || '',
                        recognizedAt: Date.now(),
                        usedCount: 1,
                        lastUsedAt: Date.now(),
                        isEdited: !!recognizedText && (nameVal !== recognizedText || descVal !== recognizedText)
                    });
                }
                if (typeof saveData === 'function') saveData();
                finish(nameVal);
            };
        });
    }

    async function getOrRecognizeAvatar(avatarUrl, charId) {
        const lib = ensureUserAvatarLibrary(charId);
        const cached = lib.find(a => a.url === avatarUrl);
        if (cached) return cached.name;

        let recognizedText = '未命名头像';
        try {
            recognizedText = await callVisionAPI(avatarUrl);
        } catch (e) {
            console.warn('Avatar recognition API error:', e);
            if (typeof showToast === 'function') showToast('识别失败，可手动输入描述');
        }
        return await showRecognitionModal(avatarUrl, recognizedText, charId);
    }

    function notifyUserAvatarChange(charId, oldDesc, newDesc) {
        const char = db.characters.find(c => c.id === charId);
        if (!char || !char.history) return;
        const msg = {
            id: 'msg_' + Date.now(),
            sender: 'system',
            content: '[avatar-action: 用户更换头像：从「' + (oldDesc || '旧头像') + '」换成「' + (newDesc || '新头像') + '」]',
            timestamp: Date.now(),
            isAvatarAction: true
        };
        char.history.push(msg);
    }

    async function recognizeAndNotifyUserAvatarChange(charId, oldAvatarUrl, newAvatarUrl) {
        const char = getChar(charId);
        if (!char || !char.charSenseAvatarChangeEnabled) return;

        const lib = ensureUserAvatarLibrary(char);
        let oldDesc = '旧头像';
        const oldInLib = lib.find(a => a.url === oldAvatarUrl);
        if (oldInLib) oldDesc = oldInLib.name;

        const newDesc = await getOrRecognizeAvatar(newAvatarUrl, charId);
        const newInLib = lib.find(a => a.url === newAvatarUrl);
        if (newInLib) {
            newInLib.usedCount = (newInLib.usedCount || 0) + 1;
            newInLib.lastUsedAt = Date.now();
        }

        notifyUserAvatarChange(charId, oldDesc, newDesc);

        if (char.charSenseCoupleAvatarEnabled && char.activeCoupleAvatarId) {
            var coupleLib = ensureCoupleAvatarLibrary(char);
            var activeCouple = coupleLib.find(function (c) { return c.id === char.activeCoupleAvatarId; });
            if (activeCouple && activeCouple.userAvatar && oldAvatarUrl === activeCouple.userAvatar.url) {
                var breakMsg = {
                    id: 'msg_' + Date.now() + '_break',
                    sender: 'system',
                    content: '[avatar-action: 用户在使用情头「' + (activeCouple.name || '未命名') + '」期间更换了头像，情头已被拆开]',
                    timestamp: Date.now(),
                    isAvatarAction: true
                };
                char.history.push(breakMsg);
                char.activeCoupleAvatarId = null;
            }
        }

        if (typeof saveData === 'function') await saveData();
    }

    function generateAvatarSystemPrompt(character) {
        if (!character || !character.avatarSystemEnabled) return '';
        var body = '';
        if (character.charSenseAvatarChangeEnabled) {
            const url = character.myAvatar;
            const lib = ensureUserAvatarLibrary(character);
            const current = lib.find(a => a.url === url);
            const currentDesc = current ? current.name : '用户头像';
            body += '【用户头像】当前: ' + currentDesc + '\n';
            const others = lib.filter(a => a.url !== url).sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0)).slice(0, 5);
            if (others.length) body += '用户历史头像(名称): ' + others.map(a => a.name).join('、') + '\n';
            body += '你能感知用户的头像变化。当用户换头像时，系统会通过隐藏消息通知你，格式为 [avatar-action: 用户更换头像：从「旧头像」换成「新头像」]。你可以在合适时机自然地提及这一变化。\n';
        }
        if (character.charCanSwitchAvatarEnabled) {
            const charLib = ensureCharAvatarLibrary(character);
            const curCharAvatar = character.avatar;
            const curCharItem = charLib.find(a => a.url === curCharAvatar);
            const curCharName = curCharItem ? curCharItem.name : '当前头像';
            body += '【你的头像库】当前使用: ' + curCharName + '\n';
            const charOthers = charLib.slice(0, 8).map(a => (a.description ? a.name + '（' + (a.description.length > 30 ? a.description.slice(0, 30) + '…' : a.description) + '）' : a.name));
            if (charOthers.length) body += '可选: ' + charOthers.join('、') + '\n';
            body += '你可以根据情绪或情境切换自己的头像，格式: [avatar-switch-self: 头像名称]\n';
            body += '你也可以帮用户更换头像，格式: [avatar-switch-user: 用户头像名称]。请区分：换自己的头像是 [avatar-switch-self]，帮用户换头像是 [avatar-switch-user]。\n';
        }
        if (character.charCollectImageAsAvatarEnabled) {
            body += '【收藏图片为头像】当用户发来一张图片时，你可以凭自己的喜好决定是否将这张图片收藏为你的头像。若你喜欢并想加入自己的头像库，请使用格式: [avatar-collect: 头像名称 | 头像描述]\n';
            body += '例如: [avatar-collect: 樱花树下 | 粉色樱花飘落的春日午后]\n';
            body += '只在你真正喜欢这张图片时才收藏，不必每张都收藏。收藏后会出现在你的头像库中，你可随时用 [avatar-switch-self: 头像名称] 切换使用。\n';
        }
        if (character.charCollectCoupleAvatarEnabled) {
            var coupleLib = ensureCoupleAvatarLibrary(character);
            body += '【情头库】情头是成对的头像，你和用户各用一张，让别人能看出你们是一对。\n';
            if (coupleLib.length) {
                body += '已收藏情头: ' + coupleLib.slice(0, 8).map(function (c) { return c.name + (c.description ? '（' + (c.description.length > 15 ? c.description.slice(0, 15) + '…' : c.description) + '）' : ''); }).join('、') + '\n';
            }
            body += '当用户发来图片时，你可判断是否适合作为情头收藏。请区分：用 [avatar-collect] 是收藏为你的个人头像；用下面指令是收藏为情头（成对）。\n';
            body += '1) 用户发来两张图（已裁好或单人图）：直接配对，【绝对不要使用裁剪指令】。格式: [couple-avatar-collect: 情头名称 | 描述 | user:1 char:2]\n';
            body += '   表示第1张给用户用、第2张给你用。收集后若想立即换上，请紧跟着写 [couple-avatar-apply: 情头名称]。\n';
            body += '2) 用户发来一张图且图中有两人：可裁剪为重叠式情头。格式: [couple-avatar-crop: 情头名称 | 描述 | mode:overlap | user:0,0,55,100 char:45,0,100,100]\n';
            body += '   坐标为占整图宽高的百分比：左,上,右,下(0-100)。用户那张以左半为主稍带一点右，你的那张以右半为主稍带一点左，这样能看出关联。使用 [couple-avatar-crop] 后系统会自动换上这对情头，无需再写 [couple-avatar-apply]。\n';
            body += '3) 用户发来一张图适合边角料情头（如一人抱玩偶）：用户用原图，你用局部。格式: [couple-avatar-crop: 情头名称 | 描述 | mode:corner | user:0,0,100,100 char:30,40,80,90]\n';
            body += '   user:0,0,100,100 表示用户用整图；char 的四个数为裁剪区域占整图宽高的百分比(左,上,右,下)。同上，裁剪后会自动换上。\n';
            body += '仅当使用 [couple-avatar-collect] 存了两张图时，若想换上需再写: [couple-avatar-apply: 情头名称]。\n';
        }
        if (character.charSenseCoupleAvatarEnabled) {
            var coupleLibSense = ensureCoupleAvatarLibrary(character);
            var activeId = character.activeCoupleAvatarId;
            var activeCouple = activeId ? coupleLibSense.find(function (c) { return c.id === activeId; }) : null;
            if (activeCouple) {
                body += '【当前情头状态】你和用户正在使用情头「' + (activeCouple.name || '未命名') + '」';
                if (activeCouple.description && activeCouple.description.trim()) {
                    body += '（' + activeCouple.description.trim() + '）';
                }
                body += '。\n';
                body += '若用户在使用情头期间换掉了头像，系统会通知你「用户在情头状态下更换了头像」，你可自然地对此做出反应（如问为什么拆情头、闹小脾气等）。\n';
                body += '你也可以主动取消情头状态（例如生气时拆掉情头），格式: [couple-avatar-remove]。取消后头像图片不变，只是不再处于「使用情头」状态；你仍可用 [avatar-switch-self] 等换头像。\n';
                body += '你也可以换成另一对情头，格式: [couple-avatar-apply: 情头名称]。\n';
            } else {
                body += '【当前情头状态】你和用户当前没有使用任何情头。\n';
            }
        }
        if (!body) return '';
        return '\n<avatar_system>\n' + body + '</avatar_system>\n';
    }

    let _avatarLibraryCurrentCharId = null;

    function renderLibraryList(char, listEl) {
        if (!char || !listEl) return;
        listEl.classList.remove('ar-delete-mode');
        const lib = ensureUserAvatarLibrary(char);
        listEl.innerHTML = '';
        lib.forEach((item, idx) => {
            const card = document.createElement('div');
            card.className = 'ar-library-card ar-library-row-clickable';
            card.dataset.idx = String(idx);
            const timeStr = item.recognizedAt ? new Date(item.recognizedAt).toLocaleDateString() : '';
            const safeUrl = (item.url || '').replace(/"/g, '&quot;');
            const safeName = (item.name || '未命名').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            card.innerHTML =
                '<label class="ar-library-check"><input type="checkbox" class="ar-library-cb" data-idx="' + idx + '"></label>' +
                '<div class="ar-library-card-wrap">' +
                '<img class="ar-library-thumb" src="' + safeUrl + '" alt="">' +
                '<div class="ar-library-info"><span class="ar-library-name-text">' + safeName + '</span><span class="ar-library-meta">' + (item.usedCount || 0) + '次 ' + timeStr + '</span></div>' +
                '</div>';
            listEl.appendChild(card);
            card.addEventListener('click', function (e) {
                if (e.target.closest('.ar-library-check')) return;
                openAvatarLibraryEditModal(char.id, idx);
            });
        });
    }

    function openAvatarLibraryEditModal(charId, itemIndex) {
        const modal = document.getElementById('avatar-library-edit-modal');
        const previewImg = document.getElementById('ar-edit-preview-img');
        const nameInput = document.getElementById('ar-edit-name-input');
        const descInput = document.getElementById('ar-edit-description-input');
        const metaEl = document.getElementById('ar-edit-meta');
        const applyBtn = document.getElementById('ar-edit-apply-btn');
        const saveBtn = document.getElementById('ar-edit-save-btn');
        const deleteBtn = document.getElementById('ar-edit-delete-btn');
        const closeBtn = document.getElementById('ar-edit-close-btn');
        if (!modal || !previewImg) return;
        const char = getChar(charId);
        if (!char) return;
        const lib = ensureUserAvatarLibrary(char);
        const item = lib[itemIndex];
        if (!item) return;

        previewImg.src = item.url || '';
        if (nameInput) nameInput.value = item.name || '';
        if (descInput) descInput.value = item.description || '';
        if (metaEl) {
            const timeStr = item.recognizedAt ? new Date(item.recognizedAt).toLocaleDateString() : '';
            metaEl.textContent = '使用 ' + (item.usedCount || 0) + ' 次 · ' + timeStr;
        }
        modal.classList.add('visible');

        const closeEditModal = () => modal.classList.remove('visible');

        if (applyBtn) applyBtn.onclick = () => {
            char.myAvatar = item.url;
            if (typeof saveData === 'function') saveData();
            if (typeof showToast === 'function') showToast('已应用为当前头像');
            const preview = document.getElementById('setting-my-avatar-preview');
            if (preview) preview.src = item.url;
            if (typeof renderMessages === 'function') renderMessages(false, true);
            closeEditModal();
        };
        if (saveBtn) saveBtn.onclick = () => {
            if (nameInput && nameInput.value && nameInput.value.trim()) item.name = nameInput.value.trim();
            if (descInput) item.description = (descInput.value && descInput.value.trim()) ? descInput.value.trim() : '';
            if (typeof saveData === 'function') saveData();
            if (typeof showToast === 'function') showToast('已保存');
            const listEl = document.getElementById('ar-library-list');
            if (listEl && _avatarLibraryCurrentCharId === charId) renderLibraryList(char, listEl);
            closeEditModal();
        };
        if (deleteBtn) deleteBtn.onclick = () => {
            lib.splice(itemIndex, 1);
            if (typeof saveData === 'function') saveData();
            if (typeof showToast === 'function') showToast('已删除');
            const listEl = document.getElementById('ar-library-list');
            if (listEl && _avatarLibraryCurrentCharId === charId) renderLibraryList(char, listEl);
            closeEditModal();
        };
        if (closeBtn) closeBtn.onclick = closeEditModal;
        modal.onclick = (e) => { if (e.target === modal) closeEditModal(); };
    }

    function openUserAvatarAddModal(charId, imageUrl) {
        const modal = document.getElementById('user-avatar-add-modal');
        const previewImg = document.getElementById('ar-user-add-preview-img');
        const useAiCheck = document.getElementById('ar-user-add-use-ai');
        const recognizeBtn = document.getElementById('ar-user-add-recognize-btn');
        const nameInput = document.getElementById('ar-user-add-name-input');
        const descInput = document.getElementById('ar-user-add-description-input');
        const cancelBtn = document.getElementById('ar-user-add-cancel-btn');
        const confirmBtn = document.getElementById('ar-user-add-confirm-btn');
        if (!modal || !previewImg) return;
        const char = getChar(charId);
        if (!char) return;

        previewImg.src = imageUrl || '';
        if (useAiCheck) useAiCheck.checked = false;
        if (nameInput) nameInput.value = '';
        if (descInput) descInput.value = '';
        modal.classList.add('visible');

        const finish = () => modal.classList.remove('visible');

        if (cancelBtn) cancelBtn.onclick = () => finish();

        const doAdd = (nameVal, descVal) => {
            const lib = ensureUserAvatarLibrary(char);
            lib.push({
                id: 'avatar_' + Date.now(),
                url: imageUrl,
                name: nameVal || '未命名头像',
                description: descVal || '',
                recognizedAt: Date.now(),
                usedCount: 0,
                lastUsedAt: Date.now(),
                isEdited: false
            });
            if (typeof saveData === 'function') saveData();
            const listEl = document.getElementById('ar-library-list');
            if (listEl && _avatarLibraryCurrentCharId === charId) renderLibraryList(char, listEl);
            if (typeof showToast === 'function') showToast('已添加到用户头像库');
            finish();
        };

        if (recognizeBtn) {
            recognizeBtn.onclick = () => {
                if (!imageUrl) return;
                recognizeBtn.disabled = true;
                if (typeof showToast === 'function') showToast('正在识别…');
                callVisionAPI(imageUrl).then((text) => {
                    if (descInput) descInput.value = text || '';
                    if (typeof showToast === 'function') showToast('已填入描述，可修改后填写名称并添加');
                }).catch((e) => {
                    console.warn('User avatar recognition failed', e);
                    if (typeof showToast === 'function') showToast('识别失败，请手动填写');
                }).finally(() => { recognizeBtn.disabled = false; });
            };
        }

        if (confirmBtn) {
            confirmBtn.onclick = () => {
                if (useAiCheck && useAiCheck.checked) {
                    callVisionAPI(imageUrl).then((recognizedText) => {
                        if (descInput) descInput.value = recognizedText || '';
                        if (typeof showToast === 'function') showToast('已识别，请填写名称后点击添加');
                    }).catch((e) => {
                        console.warn('User avatar recognition failed', e);
                        if (typeof showToast === 'function') showToast('识别失败，请手动填写名称');
                    });
                    return;
                }
                const nameVal = nameInput && nameInput.value && nameInput.value.trim() ? nameInput.value.trim() : null;
                if (!nameVal) {
                    if (typeof showToast === 'function') showToast('请填写头像名称（如：开心、生气）');
                    return;
                }
                const descVal = descInput && descInput.value && descInput.value.trim() ? descInput.value.trim() : '';
                doAdd(nameVal, descVal);
            };
        }
        modal.onclick = (e) => { if (e.target === modal) finish(); };
    }

    function openAvatarLibraryModal(charId) {
        const modal = document.getElementById('avatar-library-modal');
        const list = document.getElementById('ar-library-list');
        const batchDeleteBtn = document.getElementById('ar-library-batch-delete');
        const clearAllBtn = document.getElementById('ar-library-clear-all');
        const uploadLocalBtn = document.getElementById('ar-user-library-upload-local');
        const uploadUrlBtn = document.getElementById('ar-user-library-upload-url');
        const urlInput = document.getElementById('ar-user-library-url-input');
        if (!modal || !list) return;
        const char = getChar(charId);
        if (!char) {
            if (typeof showToast === 'function') showToast('请先选择角色');
            return;
        }

        _avatarLibraryCurrentCharId = charId;
        renderLibraryList(char, list);
        modal.classList.add('visible');

        if (uploadLocalBtn) {
            uploadLocalBtn.onclick = () => {
                const input = document.getElementById('ar-user-library-file-input');
                if (input) input.click();
            };
        }
        const fileInput = document.getElementById('ar-user-library-file-input');
        if (fileInput) {
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                if (typeof compressImage !== 'function') {
                    if (typeof showToast === 'function') showToast('请使用图片链接上传或检查环境');
                    return;
                }
                compressImage(file, { quality: 0.8, maxWidth: 400, maxHeight: 400 }).then((dataUrl) => {
                    openUserAvatarAddModal(charId, dataUrl);
                }).catch(() => {
                    if (typeof showToast === 'function') showToast('图片处理失败');
                });
                e.target.value = '';
            };
        }
        if (uploadUrlBtn && urlInput) {
            uploadUrlBtn.onclick = () => {
                const url = (urlInput.value || '').trim();
                if (!url) {
                    if (typeof showToast === 'function') showToast('请输入图片链接');
                    return;
                }
                urlInput.value = '';
                openUserAvatarAddModal(charId, url);
            };
        }

        batchDeleteBtn.onclick = () => {
            if (list.classList.contains('ar-delete-mode')) {
                const lib = ensureUserAvatarLibrary(char);
                const checked = list.querySelectorAll('.ar-library-cb:checked');
                if (!checked.length) {
                    if (typeof showToast === 'function') showToast('请先勾选要删除的项');
                    return;
                }
                const indices = Array.from(checked).map(cb => parseInt(cb.dataset.idx, 10)).sort((a, b) => b - a);
                indices.forEach(i => lib.splice(i, 1));
                if (typeof saveData === 'function') saveData();
                renderLibraryList(char, list);
                if (typeof showToast === 'function') showToast('已删除选中项');
                list.classList.remove('ar-delete-mode');
                batchDeleteBtn.textContent = '批量删除';
            } else {
                list.classList.add('ar-delete-mode');
                batchDeleteBtn.textContent = '删除选中';
            }
        };

        clearAllBtn.onclick = () => {
            if (!confirm('确定清除本角色全部头像缓存？清除后再次使用这些头像时会重新识别。')) return;
            char.userAvatarLibrary = [];
            if (typeof saveData === 'function') saveData();
            list.classList.remove('ar-delete-mode');
            batchDeleteBtn.textContent = '批量删除';
            renderLibraryList(char, list);
            modal.classList.remove('visible');
            if (typeof showToast === 'function') showToast('已清除全部缓存');
        };

        const closeBtn = modal.querySelector('.ar-library-close-btn') || modal.querySelector('.ar-library-close');
        if (closeBtn) closeBtn.addEventListener('click', () => {
            list.classList.remove('ar-delete-mode');
            if (batchDeleteBtn) batchDeleteBtn.textContent = '批量删除';
            modal.classList.remove('visible');
            _avatarLibraryCurrentCharId = null;
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                list.classList.remove('ar-delete-mode');
                if (batchDeleteBtn) batchDeleteBtn.textContent = '批量删除';
                modal.classList.remove('visible');
                _avatarLibraryCurrentCharId = null;
            }
        });
    }

    var avatarCommandRegex = /\[avatar-switch-self:\s*([^\]]+)\]/gi;
    var avatarUserCommandRegex = /\[avatar-switch-user:\s*([^\]]+)\]/gi;
    var avatarCollectRegex = /\[avatar-collect:\s*([^\|\]]+?)(?:\s*\|\s*([^\]]*))?\]/gi;
    var coupleCollectRegex = /\[couple-avatar-collect:\s*([^\|\]]+?)(?:\s*\|\s*([^\|\]]*?))?(?:\s*\|\s*user:(\d+)\s+char:(\d+))?\]/gi;
    var coupleCropRegex = /\[couple-avatar-crop:\s*([^\|\]]+?)(?:\s*\|\s*([^\|\]]*?))?(?:\s*\|\s*mode:(\w+))?(?:\s*\|\s*user:([\d,]+)\s+char:([\d,]+))?\]/gi;
    var coupleApplyRegex = /\[couple-avatar-apply:\s*([^\]]+)\]/gi;
    var coupleRemoveRegex = /\[couple-avatar-remove\]/gi;

    function parseAvatarCommands(text, charId) {
        var actions = [];
        var cleaned = text;
        var m;
        avatarCommandRegex.lastIndex = 0;
        while ((m = avatarCommandRegex.exec(text)) !== null) {
            actions.push({ type: 'switch-self', name: m[1].trim() });
        }
        avatarUserCommandRegex.lastIndex = 0;
        while ((m = avatarUserCommandRegex.exec(text)) !== null) {
            actions.push({ type: 'switch-user', name: m[1].trim() });
        }
        avatarCollectRegex.lastIndex = 0;
        while ((m = avatarCollectRegex.exec(text)) !== null) {
            actions.push({ type: 'collect-as-avatar', name: m[1].trim(), description: (m[2] || '').trim() });
        }
        coupleCollectRegex.lastIndex = 0;
        while ((m = coupleCollectRegex.exec(text)) !== null) {
            actions.push({
                type: 'couple-collect',
                name: m[1].trim(),
                description: (m[2] || '').trim(),
                userIndex: parseInt(m[3], 10) || 1,
                charIndex: parseInt(m[4], 10) || 2
            });
        }
        coupleCropRegex.lastIndex = 0;
        while ((m = coupleCropRegex.exec(text)) !== null) {
            var userCoords = (m[4] || '').split(',').map(function (n) { return parseInt(n, 10); });
            var charCoords = (m[5] || '').split(',').map(function (n) { return parseInt(n, 10); });
            if (userCoords.length >= 4 && charCoords.length >= 4) {
                actions.push({
                    type: 'couple-crop',
                    name: m[1].trim(),
                    description: (m[2] || '').trim(),
                    mode: (m[3] || 'overlap').toLowerCase(),
                    userRect: userCoords,
                    charRect: charCoords
                });
            }
        }
        coupleApplyRegex.lastIndex = 0;
        while ((m = coupleApplyRegex.exec(text)) !== null) {
            actions.push({ type: 'couple-apply', name: m[1].trim() });
        }
        coupleRemoveRegex.lastIndex = 0;
        while ((m = coupleRemoveRegex.exec(text)) !== null) {
            actions.push({ type: 'couple-remove' });
        }
        cleaned = cleaned.replace(avatarCommandRegex, '').replace(avatarUserCommandRegex, '').replace(avatarCollectRegex, '')
            .replace(coupleCollectRegex, '').replace(coupleCropRegex, '').replace(coupleApplyRegex, '').replace(coupleRemoveRegex, '').replace(/\n{2,}/g, '\n').trim();
        return { cleaned: cleaned, actions: actions };
    }

    function findAvatarByName(lib, name) {
        if (!lib || !name) return null;
        var n = name.toLowerCase().replace(/\s+/g, '');
        for (var i = 0; i < lib.length; i++) {
            var item = lib[i];
            var itemName = (item.name || '').toLowerCase().replace(/\s+/g, '');
            if (itemName === n || itemName.indexOf(n) !== -1 || n.indexOf(itemName) !== -1) return item;
        }
        return lib.find(function (a) { return (a.name || '').toLowerCase() === name.toLowerCase(); }) || null;
    }

    function findCoupleAvatarByName(lib, name) {
        if (!lib || !name) return null;
        var n = name.toLowerCase().replace(/\s+/g, '');
        for (var i = 0; i < lib.length; i++) {
            var item = lib[i];
            var itemName = (item.name || '').toLowerCase().replace(/\s+/g, '');
            if (itemName === n || itemName.indexOf(n) !== -1 || n.indexOf(itemName) !== -1) return item;
        }
        return lib.find(function (a) { return (a.name || '').toLowerCase() === name.toLowerCase(); }) || null;
    }

    /** 从最近最多 15 条消息中收集用户发的图片（遇助手消息即止，保证只取本轮对话的图） */
    function getLastUserMessageImageParts(char) {
        if (!char || !char.history) return [];
        var allImgParts = [];
        var start = Math.max(0, char.history.length - 15);
        for (var j = char.history.length - 1; j >= start; j--) {
            var msg = char.history[j];
            if (msg.role === 'assistant') break;
            if (msg.role === 'user' && msg.parts) {
                var imgs = msg.parts.filter(function (p) { return p.type === 'image' && p.data; });
                for (var i = 0; i < imgs.length; i++) allImgParts.unshift(imgs[i]);
            }
        }
        return allImgParts;
    }

    function executeAvatarActions(actions, charId) {
        var char = getChar(charId);
        if (!char || !actions.length) return;
        for (var i = 0; i < actions.length; i++) {
            var a = actions[i];
            if (a.type === 'switch-self') {
                var charLib = ensureCharAvatarLibrary(char);
                var item = findAvatarByName(charLib, a.name);
                if (item && item.url) {
                    char.avatar = item.url;
                    char.activeCoupleAvatarId = null;
                    item.usedCount = (item.usedCount || 0) + 1;
                    item.lastUsedAt = Date.now();
                    if (typeof saveData === 'function') saveData();
                    if (typeof showToast === 'function') showToast('已切换角色头像：' + (item.name || ''));
                }
            } else if (a.type === 'switch-user') {
                var userLib = ensureUserAvatarLibrary(char);
                var userItem = findAvatarByName(userLib, a.name);
                if (userItem && userItem.url) {
                    char.myAvatar = userItem.url;
                    char.activeCoupleAvatarId = null;
                    userItem.usedCount = (userItem.usedCount || 0) + 1;
                    userItem.lastUsedAt = Date.now();
                    if (typeof saveData === 'function') saveData();
                    var preview = document.getElementById('setting-my-avatar-preview');
                    if (preview) preview.src = userItem.url;
                    if (typeof renderMessages === 'function') renderMessages(false, true);
                    if (typeof showToast === 'function') showToast('已切换用户头像：' + (userItem.name || ''));
                }
            } else if (a.type === 'collect-as-avatar') {
                var lastImageMsg = null;
                for (var j = char.history.length - 1; j >= 0; j--) {
                    var msg = char.history[j];
                    if (msg.role === 'user' && msg.parts && msg.parts.some(function (p) { return p.type === 'image'; })) {
                        lastImageMsg = msg;
                        break;
                    }
                }
                if (lastImageMsg) {
                    var imgPart = lastImageMsg.parts.find(function (p) { return p.type === 'image'; });
                    if (imgPart && imgPart.data) {
                        var charLib = ensureCharAvatarLibrary(char);
                        var alreadyExists = charLib.some(function (av) { return av.url === imgPart.data; });
                        if (!alreadyExists) {
                            charLib.push({
                                id: 'char_avatar_' + Date.now(),
                                url: imgPart.data,
                                name: a.name || '未命名',
                                description: a.description || '',
                                recognizedAt: Date.now(),
                                usedCount: 0,
                                lastUsedAt: 0,
                                addedByChar: true
                            });
                            if (typeof saveData === 'function') saveData();
                            if (typeof showToast === 'function') showToast('角色收藏了一张图片作为头像：' + (a.name || ''));
                        }
                    }
                }
            } else if (a.type === 'couple-collect') {
                var imgParts = getLastUserMessageImageParts(char);
                var ui = (a.userIndex || 1) - 1;
                var ci = (a.charIndex || 2) - 1;
                if (imgParts.length >= 2 && imgParts[ui] && imgParts[ci]) {
                    var coupleLib = ensureCoupleAvatarLibrary(char);
                    coupleLib.push({
                        id: 'couple_avatar_' + Date.now(),
                        name: a.name || '情头',
                        description: a.description || '',
                        userAvatar: { url: imgParts[ui].data, description: '' },
                        charAvatar: { url: imgParts[ci].data, description: '' },
                        sourceType: 'dual_direct',
                        sourceImages: [imgParts[ui].data, imgParts[ci].data],
                        createdAt: Date.now(),
                        addedBy: 'character',
                        usedCount: 0
                    });
                    if (typeof saveData === 'function') saveData();
                    if (typeof showToast === 'function') showToast('已收藏为情头：' + (a.name || ''));
                } else if (typeof showToast === 'function') showToast('需要用户最近发送至少两张图片才能配对情头');
            } else if (a.type === 'couple-crop') {
                var singleParts = getLastUserMessageImageParts(char);
                if (singleParts.length < 1 || !singleParts[0].data) {
                    if (typeof showToast === 'function') showToast('需要用户最近发送一张图片才能裁剪情头');
                    continue;
                }
                var srcUrl = singleParts[0].data;
                var ur = a.userRect;
                var cr = a.charRect;
                cropImageByPercent(srcUrl, ur[0], ur[1], ur[2], ur[3]).then(function (userUrl) {
                    return cropImageByPercent(srcUrl, cr[0], cr[1], cr[2], cr[3]).then(function (charUrl) {
                        var coupleLib = ensureCoupleAvatarLibrary(char);
                        var entry = {
                            id: 'couple_avatar_' + Date.now(),
                            name: a.name || '情头',
                            description: a.description || '',
                            userAvatar: { url: userUrl, description: '' },
                            charAvatar: { url: charUrl, description: '' },
                            sourceType: 'single_crop',
                            sourceImages: [srcUrl],
                            createdAt: Date.now(),
                            addedBy: 'character',
                            usedCount: 1
                        };
                        coupleLib.push(entry);
                        char.myAvatar = userUrl;
                        char.avatar = charUrl;
                        char.activeCoupleAvatarId = entry.id;
                        if (typeof saveData === 'function') saveData();
                        var previewUser = document.getElementById('setting-my-avatar-preview');
                        if (previewUser) previewUser.src = userUrl;
                        var previewChar = document.getElementById('setting-char-avatar-preview');
                        if (previewChar) previewChar.src = charUrl;
                        if (typeof renderMessages === 'function') renderMessages(false, true);
                        if (typeof showToast === 'function') showToast('已裁剪并换上情头：' + (entry.name || ''));
                    });
                }).catch(function (e) {
                    console.warn('Couple avatar crop failed', e);
                    if (typeof showToast === 'function') showToast('裁剪失败，请检查图片');
                });
            } else if (a.type === 'couple-apply') {
                var coupleLib = ensureCoupleAvatarLibrary(char);
                var coupleItem = findCoupleAvatarByName(coupleLib, a.name);
                if (coupleItem && coupleItem.userAvatar && coupleItem.charAvatar) {
                    char.myAvatar = coupleItem.userAvatar.url;
                    char.avatar = coupleItem.charAvatar.url;
                    char.activeCoupleAvatarId = coupleItem.id;
                    coupleItem.usedCount = (coupleItem.usedCount || 0) + 1;
                    if (typeof saveData === 'function') saveData();
                    var previewUser = document.getElementById('setting-my-avatar-preview');
                    if (previewUser) previewUser.src = coupleItem.userAvatar.url;
                    var previewChar = document.getElementById('setting-char-avatar-preview');
                    if (previewChar) previewChar.src = coupleItem.charAvatar.url;
                    if (typeof renderMessages === 'function') renderMessages(false, true);
                    if (typeof showToast === 'function') showToast('已应用情头：' + (coupleItem.name || ''));
                }
            } else if (a.type === 'couple-remove') {
                var coupleLib = ensureCoupleAvatarLibrary(char);
                var activeId = char.activeCoupleAvatarId;
                var activeCouple = activeId ? coupleLib.find(function (c) { return c.id === activeId; }) : null;
                if (activeCouple) {
                    var coupleName = activeCouple.name || '未命名';
                    char.activeCoupleAvatarId = null;
                    if (char.history) {
                        var removeMsg = {
                            id: 'msg_' + Date.now() + '_couple_remove',
                            sender: 'system',
                            content: '[avatar-action: 角色取消了当前情头「' + coupleName + '」，不再处于情头状态]',
                            timestamp: Date.now(),
                            isAvatarAction: true
                        };
                        char.history.push(removeMsg);
                    }
                    if (typeof saveData === 'function') saveData();
                    if (typeof showToast === 'function') showToast('已取消情头状态：' + coupleName);
                }
            }
        }
    }

    var _charAvatarLibraryCurrentCharId = null;

    function renderCharLibraryList(char, listEl) {
        if (!char || !listEl) return;
        listEl.classList.remove('ar-delete-mode');
        var lib = ensureCharAvatarLibrary(char);
        listEl.innerHTML = '';
        lib.forEach(function (item, idx) {
            var card = document.createElement('div');
            card.className = 'ar-library-card ar-library-row-clickable ar-char-library-row';
            card.dataset.idx = String(idx);
            var timeStr = item.recognizedAt ? new Date(item.recognizedAt).toLocaleDateString() : '';
            var safeUrl = (item.url || '').replace(/"/g, '&quot;');
            var safeName = (item.name || '未命名').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            card.innerHTML =
                '<label class="ar-library-check"><input type="checkbox" class="ar-library-cb" data-idx="' + idx + '"></label>' +
                '<div class="ar-library-card-wrap">' +
                '<img class="ar-library-thumb" src="' + safeUrl + '" alt="">' +
                '<div class="ar-library-info"><span class="ar-library-name-text">' + safeName + '</span><span class="ar-library-meta">' + (item.usedCount || 0) + '次 ' + timeStr + '</span></div>' +
                '</div>';
            listEl.appendChild(card);
            card.addEventListener('click', function (e) {
                if (e.target.closest('.ar-library-check')) return;
                openCharAvatarLibraryEditModal(char.id, idx);
            });
        });
    }

    function openCharAvatarLibraryEditModal(charId, itemIndex) {
        var modal = document.getElementById('char-avatar-library-edit-modal');
        var previewImg = document.getElementById('ar-char-edit-preview-img');
        var nameInput = document.getElementById('ar-char-edit-name-input');
        var descInput = document.getElementById('ar-char-edit-description-input');
        var metaEl = document.getElementById('ar-char-edit-meta');
        var applyBtn = document.getElementById('ar-char-edit-apply-btn');
        var saveBtn = document.getElementById('ar-char-edit-save-btn');
        var deleteBtn = document.getElementById('ar-char-edit-delete-btn');
        var closeBtn = document.getElementById('ar-char-edit-close-btn');
        if (!modal || !previewImg) return;
        var char = getChar(charId);
        if (!char) return;
        var lib = ensureCharAvatarLibrary(char);
        var item = lib[itemIndex];
        if (!item) return;

        previewImg.src = item.url || '';
        if (nameInput) nameInput.value = item.name || '';
        if (descInput) descInput.value = item.description || '';
        if (metaEl) {
            var timeStr = item.recognizedAt ? new Date(item.recognizedAt).toLocaleDateString() : '';
            metaEl.textContent = '使用 ' + (item.usedCount || 0) + ' 次 · ' + timeStr;
        }
        modal.classList.add('visible');

        var closeEditModal = function () { modal.classList.remove('visible'); };

        if (applyBtn) applyBtn.onclick = function () {
            char.avatar = item.url;
            if (typeof saveData === 'function') saveData();
            if (typeof showToast === 'function') showToast('已应用为当前角色头像');
            var preview = document.getElementById('setting-char-avatar-preview');
            if (preview) preview.src = item.url;
            closeEditModal();
        };
        if (saveBtn) saveBtn.onclick = function () {
            if (nameInput && nameInput.value && nameInput.value.trim()) item.name = nameInput.value.trim();
            if (descInput) item.description = (descInput.value && descInput.value.trim()) ? descInput.value.trim() : '';
            if (typeof saveData === 'function') saveData();
            if (typeof showToast === 'function') showToast('已保存');
            var listEl = document.getElementById('ar-char-library-list');
            if (listEl && _charAvatarLibraryCurrentCharId === charId) renderCharLibraryList(char, listEl);
            closeEditModal();
        };
        if (deleteBtn) deleteBtn.onclick = function () {
            lib.splice(itemIndex, 1);
            if (typeof saveData === 'function') saveData();
            if (typeof showToast === 'function') showToast('已删除');
            var listEl = document.getElementById('ar-char-library-list');
            if (listEl && _charAvatarLibraryCurrentCharId === charId) renderCharLibraryList(char, listEl);
            closeEditModal();
        };
        if (closeBtn) closeBtn.onclick = closeEditModal;
        modal.onclick = function (e) { if (e.target === modal) closeEditModal(); };
    }

    function openCharAvatarAddModal(charId, imageUrl) {
        var modal = document.getElementById('char-avatar-add-modal');
        var previewImg = document.getElementById('ar-char-add-preview-img');
        var useAiCheck = document.getElementById('ar-char-add-use-ai');
        var nameInput = document.getElementById('ar-char-add-name-input');
        var descInput = document.getElementById('ar-char-add-description-input');
        var cancelBtn = document.getElementById('ar-char-add-cancel-btn');
        var confirmBtn = document.getElementById('ar-char-add-confirm-btn');
        if (!modal || !previewImg) return;
        var char = getChar(charId);
        if (!char) return;

        previewImg.src = imageUrl || '';
        if (useAiCheck) useAiCheck.checked = false;
        if (nameInput) nameInput.value = '';
        if (descInput) descInput.value = '';
        modal.classList.add('visible');

        var finish = function () { modal.classList.remove('visible'); };

        if (cancelBtn) cancelBtn.onclick = function () { finish(); };

        var doAdd = function (nameVal, descVal) {
            var lib = ensureCharAvatarLibrary(char);
            lib.push({
                id: 'char_avatar_' + Date.now(),
                url: imageUrl,
                name: nameVal || '未命名',
                description: descVal || '',
                recognizedAt: Date.now(),
                usedCount: 0,
                lastUsedAt: 0
            });
            if (typeof saveData === 'function') saveData();
            var listEl = document.getElementById('ar-char-library-list');
            if (listEl && _charAvatarLibraryCurrentCharId === charId) renderCharLibraryList(char, listEl);
            if (typeof showToast === 'function') showToast('已添加到角色头像库');
            finish();
        };

        if (confirmBtn) confirmBtn.onclick = function () {
            if (useAiCheck && useAiCheck.checked) {
                callVisionAPI(imageUrl).then(function (recognizedText) {
                    if (nameInput) nameInput.value = '';
                    if (descInput) descInput.value = recognizedText || '';
                    if (typeof showToast === 'function') showToast('已识别，请填写名称后点击添加');
                }).catch(function (e) {
                    console.warn('Char avatar recognition failed', e);
                    if (typeof showToast === 'function') showToast('识别失败，请手动填写名称');
                });
                return;
            }
            var nameVal = nameInput && nameInput.value && nameInput.value.trim() ? nameInput.value.trim() : null;
            if (!nameVal) {
                if (typeof showToast === 'function') showToast('请填写头像名称');
                return;
            }
            var descVal = descInput && descInput.value && descInput.value.trim() ? descInput.value.trim() : '';
            doAdd(nameVal, descVal);
        };
        modal.onclick = function (e) { if (e.target === modal) finish(); };
    }

    function openCharAvatarLibraryModal(charId) {
        var modal = document.getElementById('char-avatar-library-modal');
        var list = document.getElementById('ar-char-library-list');
        var batchDeleteBtn = document.getElementById('ar-char-library-batch-delete');
        var clearAllBtn = document.getElementById('ar-char-library-clear-all');
        var uploadLocalBtn = document.getElementById('ar-char-library-upload-local');
        var uploadUrlBtn = document.getElementById('ar-char-library-upload-url');
        var urlInput = document.getElementById('ar-char-library-url-input');
        if (!modal || !list) return;
        var char = getChar(charId);
        if (!char) {
            if (typeof showToast === 'function') showToast('请先选择角色');
            return;
        }

        _charAvatarLibraryCurrentCharId = charId;
        renderCharLibraryList(char, list);
        modal.classList.add('visible');

        if (batchDeleteBtn) batchDeleteBtn.onclick = function () {
            if (list.classList.contains('ar-delete-mode')) {
                var lib = ensureCharAvatarLibrary(char);
                var checked = list.querySelectorAll('.ar-library-cb:checked');
                if (!checked.length) {
                    if (typeof showToast === 'function') showToast('请先勾选要删除的项');
                    return;
                }
                var indices = Array.from(checked).map(function (cb) { return parseInt(cb.dataset.idx, 10); }).sort(function (a, b) { return b - a; });
                indices.forEach(function (i) { lib.splice(i, 1); });
                if (typeof saveData === 'function') saveData();
                renderCharLibraryList(char, list);
                if (typeof showToast === 'function') showToast('已删除选中项');
                list.classList.remove('ar-delete-mode');
                batchDeleteBtn.textContent = '批量删除';
            } else {
                list.classList.add('ar-delete-mode');
                batchDeleteBtn.textContent = '删除选中';
            }
        };

        if (clearAllBtn) clearAllBtn.onclick = function () {
            if (!confirm('确定清除本角色全部头像？')) return;
            char.charAvatarLibrary = [];
            if (typeof saveData === 'function') saveData();
            list.classList.remove('ar-delete-mode');
            if (batchDeleteBtn) batchDeleteBtn.textContent = '批量删除';
            renderCharLibraryList(char, list);
            modal.classList.remove('visible');
            if (typeof showToast === 'function') showToast('已清除');
        };

        if (uploadLocalBtn) {
            uploadLocalBtn.onclick = function () {
                var input = document.getElementById('ar-char-library-file-input');
                if (input) input.click();
            };
        }
        var fileInput = document.getElementById('ar-char-library-file-input');
        if (fileInput) {
            fileInput.onchange = function (e) {
                var file = e.target.files[0];
                if (!file) return;
                if (typeof compressImage !== 'function') {
                    if (typeof showToast === 'function') showToast('请使用图片链接上传或检查环境');
                    return;
                }
                compressImage(file, { quality: 0.8, maxWidth: 400, maxHeight: 400 }).then(function (dataUrl) {
                    openCharAvatarAddModal(charId, dataUrl);
                }).catch(function () {
                    if (typeof showToast === 'function') showToast('图片处理失败');
                });
                e.target.value = '';
            };
        }

        if (uploadUrlBtn && urlInput) {
            uploadUrlBtn.onclick = function () {
                var url = (urlInput.value || '').trim();
                if (!url) {
                    if (typeof showToast === 'function') showToast('请输入图片链接');
                    return;
                }
                urlInput.value = '';
                openCharAvatarAddModal(charId, url);
            };
        }

        var closeBtn = modal.querySelector('.ar-char-library-close-btn') || modal.querySelector('.ar-char-library-close');
        if (closeBtn) closeBtn.addEventListener('click', function () {
            list.classList.remove('ar-delete-mode');
            if (batchDeleteBtn) batchDeleteBtn.textContent = '批量删除';
            modal.classList.remove('visible');
            _charAvatarLibraryCurrentCharId = null;
        });
        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                list.classList.remove('ar-delete-mode');
                if (batchDeleteBtn) batchDeleteBtn.textContent = '批量删除';
                modal.classList.remove('visible');
                _charAvatarLibraryCurrentCharId = null;
            }
        });
    }

    var _coupleAvatarLibraryCurrentCharId = null;

    function renderCoupleLibraryList(char, listEl) {
        if (!char || !listEl) return;
        listEl.classList.remove('ar-delete-mode');
        var lib = ensureCoupleAvatarLibrary(char);
        listEl.innerHTML = '';
        lib.forEach(function (item, idx) {
            var card = document.createElement('div');
            card.className = 'ar-library-card ar-couple-library-card ar-library-row-clickable';
            card.dataset.idx = String(idx);
            var timeStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '';
            var userUrl = (item.userAvatar && item.userAvatar.url) ? item.userAvatar.url.replace(/"/g, '&quot;') : '';
            var charUrl = (item.charAvatar && item.charAvatar.url) ? item.charAvatar.url.replace(/"/g, '&quot;') : '';
            var safeName = (item.name || '未命名').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            card.innerHTML =
                '<label class="ar-library-check"><input type="checkbox" class="ar-library-cb" data-idx="' + idx + '"></label>' +
                '<div class="ar-couple-card-wrap">' +
                '<div class="ar-couple-pair">' +
                '<img class="ar-couple-thumb" src="' + userUrl + '" alt="用户">' +
                '<img class="ar-couple-thumb" src="' + charUrl + '" alt="角色">' +
                '</div>' +
                '<div class="ar-library-info"><span class="ar-library-name-text">' + safeName + '</span><span class="ar-library-meta">' + (item.usedCount || 0) + '次 ' + timeStr + '</span></div>' +
                '</div>';
            listEl.appendChild(card);
            card.addEventListener('click', function (e) {
                if (e.target.closest('.ar-library-check')) return;
                openCoupleAvatarEditModal(char.id, idx);
            });
        });
    }

    function openCoupleAvatarEditModal(charId, itemIndex) {
        var modal = document.getElementById('couple-avatar-edit-modal');
        var userImg = document.getElementById('couple-edit-user-img');
        var charImg = document.getElementById('couple-edit-char-img');
        var nameInput = document.getElementById('couple-edit-name-input');
        var descInput = document.getElementById('couple-edit-description-input');
        var applyBtn = document.getElementById('couple-edit-apply-btn');
        var saveBtn = document.getElementById('couple-edit-save-btn');
        var deleteBtn = document.getElementById('couple-edit-delete-btn');
        var closeBtn = document.getElementById('couple-edit-close-btn');
        if (!modal) return;
        var char = getChar(charId);
        if (!char) return;
        var lib = ensureCoupleAvatarLibrary(char);
        var item = lib[itemIndex];
        if (!item) return;

        if (userImg) userImg.src = (item.userAvatar && item.userAvatar.url) || '';
        if (charImg) charImg.src = (item.charAvatar && item.charAvatar.url) || '';
        if (nameInput) nameInput.value = item.name || '';
        if (descInput) descInput.value = item.description || '';
        modal.classList.add('visible');

        var closeEditModal = function () { modal.classList.remove('visible'); };

        if (applyBtn) applyBtn.onclick = function () {
            if (item.userAvatar && item.userAvatar.url) char.myAvatar = item.userAvatar.url;
            if (item.charAvatar && item.charAvatar.url) char.avatar = item.charAvatar.url;
            char.activeCoupleAvatarId = item.id || null;
            item.usedCount = (item.usedCount || 0) + 1;
            if (typeof saveData === 'function') saveData();
            var previewUser = document.getElementById('setting-my-avatar-preview');
            if (previewUser && item.userAvatar) previewUser.src = item.userAvatar.url;
            var previewChar = document.getElementById('setting-char-avatar-preview');
            if (previewChar && item.charAvatar) previewChar.src = item.charAvatar.url;
            if (typeof renderMessages === 'function') renderMessages(false, true);
            if (typeof showToast === 'function') showToast('已应用为当前情头');
            closeEditModal();
        };
        if (saveBtn) saveBtn.onclick = function () {
            if (nameInput && nameInput.value && nameInput.value.trim()) item.name = nameInput.value.trim();
            if (descInput) item.description = (descInput.value && descInput.value.trim()) ? descInput.value.trim() : '';
            if (typeof saveData === 'function') saveData();
            var listEl = document.getElementById('couple-avatar-library-list');
            if (listEl && _coupleAvatarLibraryCurrentCharId === charId) renderCoupleLibraryList(char, listEl);
            if (typeof showToast === 'function') showToast('已保存');
            closeEditModal();
        };
        if (deleteBtn) deleteBtn.onclick = function () {
            if (item.id === char.activeCoupleAvatarId) char.activeCoupleAvatarId = null;
            lib.splice(itemIndex, 1);
            if (typeof saveData === 'function') saveData();
            var listEl = document.getElementById('couple-avatar-library-list');
            if (listEl && _coupleAvatarLibraryCurrentCharId === charId) renderCoupleLibraryList(char, listEl);
            if (typeof showToast === 'function') showToast('已删除');
            closeEditModal();
        };
        if (closeBtn) closeBtn.onclick = closeEditModal;
        modal.onclick = function (e) { if (e.target === modal) closeEditModal(); };
    }

    function openCoupleAvatarAddModal(charId, userImageUrl) {
        var modal = document.getElementById('couple-avatar-add-modal');
        var userImg = document.getElementById('ar-couple-add-user-img');
        var charImg = document.getElementById('ar-couple-add-char-img');
        var charFileInput = document.getElementById('ar-couple-add-char-file');
        var charUrlInput = document.getElementById('ar-couple-add-char-url-input');
        var charUrlBtn = document.getElementById('ar-couple-add-char-url-btn');
        var useAiCheck = document.getElementById('ar-couple-add-use-ai');
        var recognizeBtn = document.getElementById('ar-couple-add-recognize-btn');
        var nameInput = document.getElementById('ar-couple-add-name-input');
        var descInput = document.getElementById('ar-couple-add-description-input');
        var cancelBtn = document.getElementById('ar-couple-add-cancel-btn');
        var confirmBtn = document.getElementById('ar-couple-add-confirm-btn');
        if (!modal || !userImg) return;
        var char = getChar(charId);
        if (!char) return;

        var charImageUrl = '';
        userImg.src = userImageUrl || '';
        charImg.src = '';
        charImg.style.border = '2px dashed #ccc';
        if (useAiCheck) useAiCheck.checked = false;
        if (nameInput) nameInput.value = '';
        if (descInput) descInput.value = '';
        if (charUrlInput) charUrlInput.value = '';
        modal.classList.add('visible');

        var finish = function () { modal.classList.remove('visible'); };

        // 点击角色头像区域选择本地文件
        if (charImg) charImg.onclick = function () {
            if (charFileInput) charFileInput.click();
        };
        if (charFileInput) {
            charFileInput.onchange = function (e) {
                var file = e.target.files[0];
                if (!file) return;
                if (typeof compressImage !== 'function') {
                    if (typeof showToast === 'function') showToast('图片处理不可用');
                    return;
                }
                compressImage(file, { quality: 0.8, maxWidth: 400, maxHeight: 400 }).then(function (dataUrl) {
                    charImageUrl = dataUrl;
                    charImg.src = dataUrl;
                    charImg.style.border = '1px solid rgba(0,0,0,0.08)';
                }).catch(function () {
                    if (typeof showToast === 'function') showToast('图片处理失败');
                });
                e.target.value = '';
            };
        }
        // 角色头像 URL 上传
        if (charUrlBtn && charUrlInput) {
            charUrlBtn.onclick = function () {
                var url = (charUrlInput.value || '').trim();
                if (!url) {
                    if (typeof showToast === 'function') showToast('请输入角色头像链接');
                    return;
                }
                charImageUrl = url;
                charImg.src = url;
                charImg.style.border = '1px solid rgba(0,0,0,0.08)';
                charUrlInput.value = '';
            };
        }

        // API 识别按钮
        if (recognizeBtn) {
            recognizeBtn.onclick = function () {
                var imgToRecognize = userImageUrl || charImageUrl;
                if (!imgToRecognize) {
                    if (typeof showToast === 'function') showToast('请先上传图片');
                    return;
                }
                recognizeBtn.disabled = true;
                if (typeof showToast === 'function') showToast('正在识别…');
                callVisionAPI(imgToRecognize).then(function (text) {
                    if (descInput) descInput.value = text || '';
                    if (typeof showToast === 'function') showToast('已填入描述，可修改后填写名称并添加');
                }).catch(function (e) {
                    console.warn('Couple avatar recognition failed', e);
                    if (typeof showToast === 'function') showToast('识别失败，请手动填写');
                }).finally(function () { recognizeBtn.disabled = false; });
            };
        }

        if (cancelBtn) cancelBtn.onclick = function () { finish(); };

        if (confirmBtn) confirmBtn.onclick = function () {
            if (useAiCheck && useAiCheck.checked) {
                var imgToRecognize = userImageUrl || charImageUrl;
                if (!imgToRecognize) {
                    if (typeof showToast === 'function') showToast('请先上传图片');
                    return;
                }
                callVisionAPI(imgToRecognize).then(function (recognizedText) {
                    if (descInput) descInput.value = recognizedText || '';
                    if (typeof showToast === 'function') showToast('已识别，请填写名称后点击添加');
                }).catch(function (e) {
                    console.warn('Couple avatar recognition failed', e);
                    if (typeof showToast === 'function') showToast('识别失败，请手动填写名称');
                });
                return;
            }
            var nameVal = nameInput && nameInput.value && nameInput.value.trim() ? nameInput.value.trim() : null;
            if (!nameVal) {
                if (typeof showToast === 'function') showToast('请填写情头名称');
                return;
            }
            if (!userImageUrl) {
                if (typeof showToast === 'function') showToast('缺少用户头像');
                return;
            }
            if (!charImageUrl) {
                if (typeof showToast === 'function') showToast('请选择角色头像（点击右侧图片区域或使用URL上传）');
                return;
            }
            var descVal = descInput && descInput.value && descInput.value.trim() ? descInput.value.trim() : '';
            var lib = ensureCoupleAvatarLibrary(char);
            lib.push({
                id: 'couple_' + Date.now(),
                name: nameVal,
                description: descVal,
                userAvatar: { url: userImageUrl },
                charAvatar: { url: charImageUrl },
                sourceType: 'manual',
                createdAt: Date.now(),
                usedCount: 0
            });
            if (typeof saveData === 'function') saveData();
            var listEl = document.getElementById('couple-avatar-library-list');
            if (listEl && _coupleAvatarLibraryCurrentCharId === charId) renderCoupleLibraryList(char, listEl);
            if (typeof showToast === 'function') showToast('已添加到情头库');
            finish();
        };
        modal.onclick = function (e) { if (e.target === modal) finish(); };
    }

    function openCoupleAvatarLibraryModal(charId) {
        var modal = document.getElementById('couple-avatar-library-modal');
        var list = document.getElementById('couple-avatar-library-list');
        var batchDeleteBtn = document.getElementById('couple-avatar-library-batch-delete');
        var clearAllBtn = document.getElementById('couple-avatar-library-clear-all');
        var uploadLocalBtn = document.getElementById('ar-couple-library-upload-local');
        var uploadUrlBtn = document.getElementById('ar-couple-library-upload-url');
        var urlInput = document.getElementById('ar-couple-library-url-input');
        if (!modal || !list) return;
        var char = getChar(charId);
        if (!char) {
            if (typeof showToast === 'function') showToast('请先选择角色');
            return;
        }
        _coupleAvatarLibraryCurrentCharId = charId;
        renderCoupleLibraryList(char, list);
        modal.classList.add('visible');

        // 本地上传（用户头像）
        if (uploadLocalBtn) {
            uploadLocalBtn.onclick = function () {
                var input = document.getElementById('ar-couple-library-file-input');
                if (input) input.click();
            };
        }
        var fileInput = document.getElementById('ar-couple-library-file-input');
        if (fileInput) {
            fileInput.onchange = function (e) {
                var file = e.target.files[0];
                if (!file) return;
                if (typeof compressImage !== 'function') {
                    if (typeof showToast === 'function') showToast('请使用图片链接上传或检查环境');
                    return;
                }
                compressImage(file, { quality: 0.8, maxWidth: 400, maxHeight: 400 }).then(function (dataUrl) {
                    openCoupleAvatarAddModal(charId, dataUrl);
                }).catch(function () {
                    if (typeof showToast === 'function') showToast('图片处理失败');
                });
                e.target.value = '';
            };
        }
        // URL 上传（用户头像）
        if (uploadUrlBtn && urlInput) {
            uploadUrlBtn.onclick = function () {
                var url = (urlInput.value || '').trim();
                if (!url) {
                    if (typeof showToast === 'function') showToast('请输入图片链接');
                    return;
                }
                urlInput.value = '';
                openCoupleAvatarAddModal(charId, url);
            };
        }

        if (batchDeleteBtn) batchDeleteBtn.onclick = function () {
            if (list.classList.contains('ar-delete-mode')) {
                var lib = ensureCoupleAvatarLibrary(char);
                var checked = list.querySelectorAll('.ar-library-cb:checked');
                if (!checked.length) {
                    if (typeof showToast === 'function') showToast('请先勾选要删除的项');
                    return;
                }
                var indices = Array.from(checked).map(function (cb) { return parseInt(cb.dataset.idx, 10); }).sort(function (a, b) { return b - a; });
                indices.forEach(function (i) { lib.splice(i, 1); });
                if (typeof saveData === 'function') saveData();
                renderCoupleLibraryList(char, list);
                if (typeof showToast === 'function') showToast('已删除选中项');
                list.classList.remove('ar-delete-mode');
                batchDeleteBtn.textContent = '批量删除';
            } else {
                list.classList.add('ar-delete-mode');
                batchDeleteBtn.textContent = '删除选中';
            }
        };
        if (clearAllBtn) clearAllBtn.onclick = function () {
            if (!confirm('确定清除本角色全部情头？')) return;
            char.coupleAvatarLibrary = [];
            if (typeof saveData === 'function') saveData();
            list.classList.remove('ar-delete-mode');
            if (batchDeleteBtn) batchDeleteBtn.textContent = '批量删除';
            renderCoupleLibraryList(char, list);
            modal.classList.remove('visible');
            if (typeof showToast === 'function') showToast('已清除');
        };
        var closeBtn = modal.querySelector('.couple-avatar-library-close-btn');
        if (closeBtn) closeBtn.onclick = function () {
            list.classList.remove('ar-delete-mode');
            if (batchDeleteBtn) batchDeleteBtn.textContent = '批量删除';
            modal.classList.remove('visible');
            _coupleAvatarLibraryCurrentCharId = null;
        };
        modal.onclick = function (e) {
            if (e.target === modal) {
                list.classList.remove('ar-delete-mode');
                if (batchDeleteBtn) batchDeleteBtn.textContent = '批量删除';
                modal.classList.remove('visible');
                _coupleAvatarLibraryCurrentCharId = null;
            }
        };
    }

    window.AvatarSystem = {
        getOrRecognizeAvatar: getOrRecognizeAvatar,
        recognizeAndNotifyUserAvatarChange: recognizeAndNotifyUserAvatarChange,
        notifyUserAvatarChange: notifyUserAvatarChange,
        generateAvatarSystemPrompt: generateAvatarSystemPrompt,
        openAvatarLibraryModal: openAvatarLibraryModal,
        openCharAvatarLibraryModal: openCharAvatarLibraryModal,
        openCoupleAvatarLibraryModal: openCoupleAvatarLibraryModal,
        ensureUserAvatarLibrary: ensureUserAvatarLibrary,
        ensureCharAvatarLibrary: ensureCharAvatarLibrary,
        ensureCoupleAvatarLibrary: ensureCoupleAvatarLibrary,
        parseAvatarCommands: parseAvatarCommands,
        executeAvatarActions: executeAvatarActions
    };
})();
