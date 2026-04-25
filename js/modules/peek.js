// --- 偷看手机功能 (js/modules/peek.js) ---

function parseXmlToJson(xmlString) {
    const match = xmlString.match(/<result>([\s\S]*?)<\/result>/i);
    const xmlContent = match ? match[0] : xmlString;

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
    
    const parseError = xmlDoc.getElementsByTagName("parsererror");
    if (parseError.length > 0) {
        throw new Error("XML 解析错误: " + parseError[0].textContent);
    }

    function parseNode(node) {
        if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
            let text = node.textContent.trim();
            if (text === 'true') return true;
            if (text === 'false') return false;
            if (!isNaN(text) && text !== '') return Number(text);
            return text;
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
            const children = Array.from(node.childNodes).filter(n => n.nodeType === Node.ELEMENT_NODE || ((n.nodeType === Node.TEXT_NODE || n.nodeType === Node.CDATA_SECTION_NODE) && n.textContent.trim() !== ''));
            
            if (children.length === 0) return "";
            
            if (children.length === 1 && (children[0].nodeType === Node.TEXT_NODE || children[0].nodeType === Node.CDATA_SECTION_NODE)) {
                return parseNode(children[0]);
            }

            const obj = {};
            const isArrayMap = {};

            children.forEach(child => {
                if (child.nodeType === Node.ELEMENT_NODE) {
                    const name = child.nodeName;
                    if (obj[name] !== undefined) {
                        if (!isArrayMap[name]) {
                            obj[name] = [obj[name]];
                            isArrayMap[name] = true;
                        }
                        obj[name].push(parseNode(child));
                    } else {
                        obj[name] = parseNode(child);
                    }
                }
            });

            for (const key in obj) {
                if (typeof obj[key] === 'object' && !Array.isArray(obj[key]) && obj[key] !== null) {
                    const subKeys = Object.keys(obj[key]);
                    if (subKeys.length === 1) {
                        const subKey = subKeys[0];
                        const listKeys = ['item', 'entry', 'photo', 'memo', 'thought', 'post', 'conversation', 'reply', 'message', 'comment'];
                        if (key.endsWith('s') || listKeys.includes(subKey) || key === 'history' || key === 'trajectory') {
                            if (Array.isArray(obj[key][subKey])) {
                                obj[key] = obj[key][subKey];
                            } else {
                                obj[key] = [obj[key][subKey]];
                            }
                        }
                    }
                }
            }
            return obj;
        }
        return null;
    }

    const result = parseNode(xmlDoc.documentElement);
    return xmlDoc.documentElement.nodeName === 'result' ? result : { [xmlDoc.documentElement.nodeName]: result };
}

/** 当前打开的偷看对话（代发消息时用于发送/API回复） */
let currentPeekConversation = null;
/** NPC 主动发来的好友申请（弹窗用） */
let peekPendingFriendRequestConversation = null;

function normalizePeekConversation(conv, index) {
    if (!conv) return;
    if (!conv.partnerId) conv.partnerId = 'peek_npc_' + Date.now() + '_' + (index != null ? index : Math.random().toString(36).slice(2, 10));
    if (typeof conv.suspicionLevel !== 'number') conv.suspicionLevel = 0;
    if (typeof conv.isFriend !== 'boolean') conv.isFriend = false;
    if (typeof conv.friendRequestPending !== 'boolean') conv.friendRequestPending = false;
    if (conv.supplementPersona == null) conv.supplementPersona = '';
    if (conv.partnerPersona == null) conv.partnerPersona = '';
    if (conv.partnerRelation == null) conv.partnerRelation = '熟人';
    if (!Array.isArray(conv.history)) conv.history = [];
}

function peekEscapeHtml(str) {
    if (str == null) return '';
    const s = String(str);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setupPeekFeature() {
    const peekBtn = document.getElementById('peek-btn');
    const peekConfirmModal = document.getElementById('peek-confirm-modal');
    const peekConfirmYes = document.getElementById('peek-confirm-yes');
    const peekConfirmNo = document.getElementById('peek-confirm-no');
    const peekSettingsBtn = document.getElementById('peek-settings-btn');
    const peekWallpaperModal = document.getElementById('peek-wallpaper-modal');
    const peekWallpaperUpload = document.getElementById('peek-wallpaper-upload');

    document.getElementById('clear-peek-data-btn')?.addEventListener('click', async () => {
        if (confirm('确定要清空该角色的所有偷看数据吗？清空后下次进入各应用将重新生成。')) {
            const char = db.characters.find(c => c.id === currentChatId);
            if (char) {
                char.peekData = {};
                char.peekViewedByUser = [];
                char.lastPeekViewedAt = undefined;
                await saveData();   
                showToast('偷看数据已清空');
            }
        }
    });

    peekBtn?.addEventListener('click', () => {
        if (currentChatType !== 'private') return;
        peekConfirmModal.classList.add('visible');
    });

    peekConfirmNo?.addEventListener('click', () => {
        peekConfirmModal.classList.remove('visible');
    });

    peekConfirmYes?.addEventListener('click', () => {
        peekConfirmModal.classList.remove('visible');
        renderPeekScreen(); 
        switchScreen('peek-screen');
    });

    peekSettingsBtn?.addEventListener('click', () => {
        renderPeekSettings();
        peekWallpaperModal.classList.add('visible');
    });

    peekWallpaperUpload?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                const compressedUrl = await compressImage(file, { quality: 0.85, maxWidth: 1080, maxHeight: 1920 });
                document.getElementById('peek-wallpaper-url-input').value = compressedUrl;
                showToast('图片已压缩并填入URL输入框');
            } catch (error) {
                showToast('壁纸压缩失败，请重试');
            }
        }
    });

    // 应用图标：本地上传（事件委托，因图标设置为动态渲染）
    document.addEventListener('change', async (e) => {
        if (e.target.classList.contains('peek-icon-file-upload')) {
            const file = e.target.files[0];
            const appId = e.target.dataset.appId;
            if (file && appId) {
                try {
                    const compressedUrl = await compressImage(file, { quality: 0.85, maxWidth: 512, maxHeight: 512 });
                    const urlInput = document.querySelector(`#peek-app-icons-settings input.peek-icon-url-input[data-app-id="${appId}"]`);
                    if (urlInput) urlInput.value = compressedUrl;
                    showToast('图标已压缩并填入输入框');
                } catch (err) {
                    showToast('图标压缩失败，请重试');
                }
            }
            e.target.value = '';
        }
    });

    // 应用图标：重置为默认
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('peek-icon-reset-btn')) {
            const appId = e.target.dataset.appId;
            const urlInput = document.querySelector(`#peek-app-icons-settings input.peek-icon-url-input[data-app-id="${appId}"]`);
            if (urlInput) {
                urlInput.value = '';
                showToast('已重置为默认图标');
            }
        }
        // 微博小号头像：重置为默认
        if (e.target.classList.contains('peek-unlock-avatar-reset-btn')) {
            const urlInput = document.getElementById('peek-unlock-avatar-url');
            if (urlInput) {
                urlInput.value = '';
                showToast('已重置为默认头像');
            }
        }
    });

    // 微博小号头像：本地上传
    document.addEventListener('change', async (e) => {
        if (e.target.classList.contains('peek-unlock-avatar-file-upload')) {
            const file = e.target.files[0];
            if (file) {
                try {
                    const compressedUrl = await compressImage(file, { quality: 0.85, maxWidth: 512, maxHeight: 512 });
                    const urlInput = document.getElementById('peek-unlock-avatar-url');
                    if (urlInput) {
                        urlInput.value = compressedUrl;
                        showToast('头像已压缩并填入输入框');
                    }
                } catch (err) {
                    showToast('头像压缩失败，请重试');
                }
            }
            e.target.value = '';
        }
    });

    document.getElementById('save-peek-settings-btn')?.addEventListener('click', async () => {
        const character = db.characters.find(c => c.id === currentChatId);
        if (!character) {
            showToast('错误：未找到当前角色');
            return;
        }

        if (!character.peekScreenSettings) {
            character.peekScreenSettings = { wallpaper: '', customIcons: {}, unlockAvatar: '', unlockCommentsEnabled: false, charAwarePeek: false, impersonateEnabled: false, refreshCounts: {}, browserDetailEnabled: false, browserDetailWords: { min: 200, max: 500 } };
        }

        character.peekScreenSettings.wallpaper = document.getElementById('peek-wallpaper-url-input').value.trim();

        const iconInputs = document.querySelectorAll('#peek-app-icons-settings input[type="url"]');
        iconInputs.forEach(input => {
            const appId = input.dataset.appId;
            const newUrl = input.value.trim();
            if (newUrl) {
                if (!character.peekScreenSettings.customIcons) {
                    character.peekScreenSettings.customIcons = {};
                }
                character.peekScreenSettings.customIcons[appId] = newUrl;
            } else {
                if (character.peekScreenSettings.customIcons) {
                    delete character.peekScreenSettings.customIcons[appId];
                }
            }
        });
        
        character.peekScreenSettings.unlockAvatar = document.getElementById('peek-unlock-avatar-url').value.trim();
        character.peekScreenSettings.unlockCommentsEnabled = document.getElementById('peek-unlock-comments-enabled').checked;
        const charAwarePeekEl = document.getElementById('peek-char-aware-peek-enabled');
        character.peekScreenSettings.charAwarePeek = charAwarePeekEl ? charAwarePeekEl.checked : false;
        const impersonateEl = document.getElementById('peek-impersonate-enabled');
        character.peekScreenSettings.impersonateEnabled = impersonateEl ? impersonateEl.checked : false;

        // 刷新条数：聊天、时光想说、备忘录
        if (!character.peekScreenSettings.refreshCounts) character.peekScreenSettings.refreshCounts = {};
        const parseNum = (id, defaultVal) => {
            const v = parseInt(document.getElementById(id)?.value, 10);
            return Number.isFinite(v) ? v : defaultVal;
        };
        character.peekScreenSettings.refreshCounts.messages = { min: parseNum('peek-refresh-min-messages', 3), max: parseNum('peek-refresh-max-messages', 5) };
        character.peekScreenSettings.refreshCounts.timeThoughts = { min: parseNum('peek-refresh-min-timeThoughts', 3), max: parseNum('peek-refresh-max-timeThoughts', 5) };
        character.peekScreenSettings.refreshCounts.memos = { min: parseNum('peek-refresh-min-memos', 3), max: parseNum('peek-refresh-max-memos', 4) };

        // 浏览器详情开关与字数
        const bdCheckbox = document.getElementById('peek-browser-detail-enabled');
        character.peekScreenSettings.browserDetailEnabled = bdCheckbox ? bdCheckbox.checked : false;
        if (!character.peekScreenSettings.browserDetailWords) {
            character.peekScreenSettings.browserDetailWords = { min: 200, max: 500 };
        }
        character.peekScreenSettings.browserDetailWords.min = parseNum('peek-browser-detail-min-words', 200);
        character.peekScreenSettings.browserDetailWords.max = parseNum('peek-browser-detail-max-words', 500);

        await saveData();
        renderPeekScreen(); 
        showToast('已保存！');
        peekWallpaperModal.classList.remove('visible');
    });

    peekWallpaperModal.addEventListener('click', (e) => {
        const header = e.target.closest('.collapsible-header');
        if (header) {
            header.parentElement.classList.toggle('open');
        }
    });

    const peekMessagesScreen = document.getElementById('peek-messages-screen');
    peekMessagesScreen.addEventListener('click', (e) => {
        const chatItem = e.target.closest('.chat-item');
        if (chatItem) {
            const partnerName = chatItem.dataset.name;
            const char = db.characters.find(c => c.id === currentChatId);
            const cachedData = char ? char.peekData.messages : null;
            if (cachedData && cachedData.conversations) {
                const conversation = cachedData.conversations.find(c => c.partnerName === partnerName);
                if (conversation) {
                    const idx = cachedData.conversations.indexOf(conversation);
                    normalizePeekConversation(conversation, idx);
                    currentPeekConversation = conversation;
                    renderPeekConversation(conversation);
                    switchScreen('peek-conversation-screen');
                } else {
                    showToast('找不到对话记录');
                }
            }
        } else if (e.target.closest('.action-btn')) {
            generateAndRenderPeekContent('messages', { forceRefresh: true });
        }
    });

    const peekConversationScreen = document.getElementById('peek-conversation-screen');
    peekConversationScreen.addEventListener('click', (e) => {
        if (e.target.closest('.action-btn') && !e.target.closest('#peek-impersonate-bar')) {
            generateAndRenderPeekContent('messages', { forceRefresh: true });
        }
    });

    document.getElementById('peek-impersonate-send-btn')?.addEventListener('click', sendPeekImpersonateMessage);
    document.getElementById('peek-impersonate-api-btn')?.addEventListener('click', requestPeekNPCReply);
    document.getElementById('peek-impersonate-friend-btn')?.addEventListener('click', peekAddNPCAsFriend);
    document.getElementById('peek-impersonate-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendPeekImpersonateMessage();
        }
    });
    document.getElementById('peek-friend-request-accept-btn')?.addEventListener('click', peekAcceptFriendRequest);
    document.getElementById('peek-friend-request-reject-btn')?.addEventListener('click', peekRejectFriendRequest);
    document.getElementById('peek-edit-persona-save-btn')?.addEventListener('click', savePeekEditPersona);
    document.getElementById('peek-edit-persona-cancel-btn')?.addEventListener('click', () => document.getElementById('peek-edit-persona-modal')?.classList.remove('visible'));

    const refreshAlbumBtn = document.getElementById('refresh-album-btn');
    if(refreshAlbumBtn) {
        refreshAlbumBtn.addEventListener('click', () => generateAndRenderPeekContent('album', { forceRefresh: true }));
    }

    const photoModal = document.getElementById('peek-photo-modal');
    if(photoModal) {
        photoModal.addEventListener('click', (e) => {
            if (e.target === photoModal) {
                photoModal.classList.remove('visible');
            }
        });
    }

    document.getElementById('refresh-all-peek-apps-btn')?.addEventListener('click', () => refreshAllPeekApps());

    document.getElementById('manage-peek-data-btn')?.addEventListener('click', () => {
        renderPeekDataManagement();
        document.getElementById('peek-data-management-modal').classList.add('visible');
    });

    document.getElementById('close-peek-data-management-btn')?.addEventListener('click', () => {
        document.getElementById('peek-data-management-modal').classList.remove('visible');
    });

    document.getElementById('delete-selected-peek-data-btn')?.addEventListener('click', deleteSelectedPeekData);
    document.getElementById('delete-all-peek-data-btn')?.addEventListener('click', deleteAllPeekData);
}

async function refreshAllPeekApps() {
    const char = db.characters.find(c => c.id === currentChatId);
    if (!char) {
        showToast('错误：未找到当前角色');
        return;
    }

    const allAppIds = Object.keys(peekScreenApps);
    const confirmMessage = `确定要刷新所有应用吗？\n\n这将消耗 ${allAppIds.length} 次 API 调用，请留意您的 API 额度。\n刷新过程可能需要 1～2 分钟，请耐心等待。`;

    if (!confirm(confirmMessage)) {
        return;
    }

    showToast('开始批量刷新…');

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < allAppIds.length; i++) {
        const appId = allAppIds[i];
        const appName = peekScreenApps[appId].name;

        showToast(`正在刷新 ${appName}… (${i + 1}/${allAppIds.length})`);

        try {
            await generateAndRenderPeekContent(appId, { forceRefresh: true });
            successCount++;
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
            console.error(`刷新 ${appName} 失败:`, error);
            failCount++;
        }
    }

    if (failCount === 0) {
        showToast(`✓ 全部刷新完成！已更新 ${successCount} 个应用`);
    } else {
        showToast(`刷新完成！成功: ${successCount}，失败: ${failCount}`);
    }

    renderPeekScreen();
}

function renderPeekDataManagement() {
    const char = db.characters.find(c => c.id === currentChatId);
    const peekDataList = document.getElementById('peek-data-list');
    if (!peekDataList) return;

    if (!char || !char.peekData || Object.keys(char.peekData).length === 0) {
        peekDataList.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">暂无已刷新的数据</p>';
        return;
    }

    let html = `
        <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="select-all-peek-data" style="width: auto;">
                <span style="font-weight: bold;">全选</span>
            </label>
        </div>
    `;

    Object.keys(char.peekData).forEach(appId => {
        const appName = (peekScreenApps[appId] && peekScreenApps[appId].name) ? peekScreenApps[appId].name : appId;
        html += `
            <label class="peek-data-item" style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: 4px;">
                <input type="checkbox" class="peek-data-checkbox" data-app-id="${peekEscapeHtml(appId)}" style="width: auto;">
                <span>${peekEscapeHtml(appName)} <span style="color: #999; font-size: 12px;">(已有数据)</span></span>
            </label>
        `;
    });

    peekDataList.innerHTML = html;

    const selectAll = document.getElementById('select-all-peek-data');
    if (selectAll) {
        selectAll.addEventListener('change', (e) => {
            const checkboxes = peekDataList.querySelectorAll('.peek-data-checkbox');
            checkboxes.forEach(cb => { cb.checked = e.target.checked; });
        });
    }

    peekDataList.querySelectorAll('.peek-data-item').forEach(label => {
        label.addEventListener('mouseenter', () => { label.style.backgroundColor = '#f0f0f0'; });
        label.addEventListener('mouseleave', () => { label.style.backgroundColor = 'transparent'; });
    });
}

async function deleteSelectedPeekData() {
    const char = db.characters.find(c => c.id === currentChatId);
    if (!char || !char.peekData) return;

    const selectedCheckboxes = document.querySelectorAll('.peek-data-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        showToast('请至少选择一个应用');
        return;
    }

    const appNames = Array.from(selectedCheckboxes).map(cb => {
        const appId = cb.dataset.appId;
        return (peekScreenApps[appId] && peekScreenApps[appId].name) ? peekScreenApps[appId].name : appId;
    }).join('、');

    if (!confirm('确定要删除以下应用的数据吗？\n\n' + appNames + '\n\n删除后下次点击将重新生成。')) {
        return;
    }

    selectedCheckboxes.forEach(cb => {
        const appId = cb.dataset.appId;
        delete char.peekData[appId];
        if (char.peekViewedByUser && char.peekViewedByUser.length > 0) {
            char.peekViewedByUser = char.peekViewedByUser.filter(e => e.appId !== appId);
        }
    });

    await saveData();
    showToast('已删除 ' + selectedCheckboxes.length + ' 个应用的数据');

    renderPeekDataManagement();

    if (!char.peekData || Object.keys(char.peekData).length === 0) {
        document.getElementById('peek-data-management-modal').classList.remove('visible');
    }
}

async function deleteAllPeekData() {
    const char = db.characters.find(c => c.id === currentChatId);
    if (!char || !char.peekData || Object.keys(char.peekData).length === 0) {
        showToast('没有可删除的数据');
        return;
    }

    const appCount = Object.keys(char.peekData).length;

    if (!confirm('确定要删除所有 ' + appCount + ' 个应用的偷看数据吗？\n\n删除后下次点击应用时将重新生成。')) {
        return;
    }

    char.peekData = {};
    char.peekViewedByUser = [];
    char.lastPeekViewedAt = undefined;
    await saveData();
    showToast('已清空所有偷看数据');

    document.getElementById('peek-data-management-modal').classList.remove('visible');
}

function renderPeekSettings() {
    const character = db.characters.find(c => c.id === currentChatId);
    const peekSettings = character?.peekScreenSettings || { wallpaper: '', customIcons: {}, unlockAvatar: '', unlockCommentsEnabled: false, charAwarePeek: false, impersonateEnabled: false, refreshCounts: {} };

    // 1. 设置壁纸输入框
    const wallpaperInput = document.getElementById('peek-wallpaper-url-input');
    if (wallpaperInput) {
        wallpaperInput.value = peekSettings.wallpaper || '';
    }

    // 2. 设置解锁头像输入框
    const unlockAvatarInput = document.getElementById('peek-unlock-avatar-url');
    if (unlockAvatarInput) {
        unlockAvatarInput.value = peekSettings.unlockAvatar || '';
    }

    const unlockCommentsCheckbox = document.getElementById('peek-unlock-comments-enabled');
    if (unlockCommentsCheckbox) {
        unlockCommentsCheckbox.checked = !!peekSettings.unlockCommentsEnabled;
    }

    const charAwarePeekCheckbox = document.getElementById('peek-char-aware-peek-enabled');
    if (charAwarePeekCheckbox) {
        charAwarePeekCheckbox.checked = !!peekSettings.charAwarePeek;
    }
    const impersonateCheckbox = document.getElementById('peek-impersonate-enabled');
    if (impersonateCheckbox) {
        impersonateCheckbox.checked = !!peekSettings.impersonateEnabled;
    }

    // 3. 生成应用图标设置（支持 URL、本地上传、重置）
    const container = document.getElementById('peek-app-icons-settings');
    if (container) {
        container.innerHTML = '';
        Object.keys(peekScreenApps).forEach(appId => {
            const appData = peekScreenApps[appId];
            const currentIcon = peekSettings.customIcons?.[appId] || '';
            const safeValue = peekEscapeHtml(currentIcon);

            const div = document.createElement('div');
            div.className = 'form-group';
            div.innerHTML = `
                <label>${peekEscapeHtml(appData.name)} 图标</label>
                <input type="url" data-app-id="${appId}" class="peek-icon-url-input" value="${safeValue}" placeholder="粘贴图片URL">
                <p style="text-align:center; color:#888; margin: -10px 0 10px;">或</p>
                <input type="file" id="peek-icon-upload-${appId}" class="peek-icon-file-upload" accept="image/*" style="display:none;" data-app-id="${appId}">
                <label for="peek-icon-upload-${appId}" class="btn btn-secondary" style="width:100%; margin-bottom: 10px;">从本地上传</label>
                <button type="button" class="btn btn-neutral peek-icon-reset-btn" data-app-id="${appId}" style="width:100%;">重置为默认图标</button>
            `;
            container.appendChild(div);
        });
    }

    // 4. 刷新条数：聊天、时光想说、备忘录
    const defaults = { messages: { min: 3, max: 5 }, timeThoughts: { min: 3, max: 5 }, memos: { min: 3, max: 4 } };
    const rc = peekSettings.refreshCounts || {};
    ['messages', 'timeThoughts', 'memos'].forEach(appType => {
        const d = defaults[appType];
        const c = rc[appType] || d;
        const minEl = document.getElementById(`peek-refresh-min-${appType}`);
        const maxEl = document.getElementById(`peek-refresh-max-${appType}`);
        if (minEl) minEl.value = Number.isFinite(c.min) ? c.min : d.min;
        if (maxEl) maxEl.value = Number.isFinite(c.max) ? c.max : d.max;
    });

    // 浏览器详情开关与字数
    const browserDetailCheckbox = document.getElementById('peek-browser-detail-enabled');
    if (browserDetailCheckbox) browserDetailCheckbox.checked = !!peekSettings.browserDetailEnabled;
    const bWords = peekSettings.browserDetailWords || { min: 200, max: 500 };
    const minWordsEl = document.getElementById('peek-browser-detail-min-words');
    const maxWordsEl = document.getElementById('peek-browser-detail-max-words');
    if (minWordsEl) minWordsEl.value = Number.isFinite(bWords.min) ? bWords.min : 200;
    if (maxWordsEl) maxWordsEl.value = Number.isFinite(bWords.max) ? bWords.max : 500;
}

/** 当角色开启「知晓用户窥屏」时，记录用户刚查看的应用及内容，并更新 lastPeekViewedAt */
function recordPeekViewedByUser(char, appType) {
    if (!char || !char.peekScreenSettings?.charAwarePeek) return;
    const content = char.peekData?.[appType];
    if (!content) return;
    const appName = (peekScreenApps[appType] && peekScreenApps[appType].name) ? peekScreenApps[appType].name : appType;
    if (!char.peekViewedByUser) char.peekViewedByUser = [];
    const idx = char.peekViewedByUser.findIndex(e => e.appId === appType);
    const entry = { appId: appType, appName, content: JSON.parse(JSON.stringify(content)) };
    if (idx >= 0) char.peekViewedByUser[idx] = entry;
    else char.peekViewedByUser.push(entry);
    char.lastPeekViewedAt = Date.now();
}

function renderPeekAlbum(photos) {
    const screen = document.getElementById('peek-album-screen');
    const grid = screen.querySelector('.album-grid');
    grid.innerHTML = ''; 

    if (!photos || photos.length === 0) {
        grid.innerHTML = '<p class="placeholder-text">正在生成相册内容...</p>';
        return;
    }

    photos.forEach(photo => {
        const photoEl = document.createElement('div');
        photoEl.className = 'album-photo';
        photoEl.dataset.imageDescription = photo.imageDescription;
        photoEl.dataset.description = photo.description;

        const img = document.createElement('img');
        img.src = 'https://i.postimg.cc/1tH6ds9g/1752301200490.jpg'; 
        img.alt = "相册照片";
        photoEl.appendChild(img);

        if (photo.type === 'video') {
            const videoIndicator = document.createElement('div');
            videoIndicator.className = 'video-indicator';
            videoIndicator.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>`;
            photoEl.appendChild(videoIndicator);
        }
        
        photoEl.addEventListener('click', () => {
            const modal = document.getElementById('peek-photo-modal');
            const imgContainer = document.getElementById('peek-photo-image-container');
            const descriptionEl = document.getElementById('peek-photo-description');
            
            imgContainer.innerHTML = `<div style="padding: 20px; text-align: left; color: #555; font-size: 16px; line-height: 1.6; height: 100%; overflow-y: auto;">${photo.imageDescription}</div>`;
            descriptionEl.textContent = `批注：${photo.description}`;
            
            modal.classList.add('visible');
        });

        grid.appendChild(photoEl);
    });
}

function renderPeekUnlock(data) {
    const screen = document.getElementById('peek-unlock-screen');
    if (!screen) return;

    if (!data) {
        screen.innerHTML = `
            <header class="app-header">
                <button class="back-btn" data-target="peek-screen">‹</button>
                <div class="title-container"><h1 class="title">...</h1></div>
                <button class="action-btn">···</button>
            </header>
            <main class="content"><p class="placeholder-text">正在生成小号内容...</p></main>
        `;
        return;
    }

    const { nickname, handle, bio, posts } = data;
    const character = db.characters.find(c => c.id === currentChatId);
    const peekSettings = character?.peekScreenSettings || { unlockAvatar: '' };
    const fixedAvatar = peekSettings.unlockAvatar || 'https://i.postimg.cc/SNwL1XwR/chan-11.png';

    const randomFollowers = (Math.random() * 5 + 1).toFixed(1) + 'k';
    const randomFollowing = Math.floor(Math.random() * 500) + 50;

    let postsHtml = '';
    if (posts && posts.length > 0) {
        posts.forEach((post, index) => {
            const commentCount = (post.comments && post.comments.length) ? post.comments.length : Math.floor(Math.random() * 100);
            const randomLikes = Math.floor(Math.random() * 500);
            const hasComments = post.comments && post.comments.length > 0;
            postsHtml += `
                <div class="unlock-post-card" data-post-index="${index}" ${hasComments ? 'data-has-comments="true"' : ''}>
                    <div class="unlock-post-card-header">
                        <img src="${fixedAvatar}" alt="Profile Avatar">
                        <div class="unlock-post-card-author-info">
                            <span class="username">${nickname}</span>
                            <span class="timestamp">${post.timestamp || ''}</span>
                        </div>
                    </div>
                    <div class="unlock-post-card-content">
                        ${(post.content || '').replace(/\n/g, '<br>')}
                    </div>
                    <div class="unlock-post-card-actions">
                        <div class="action"><svg viewBox="0 0 24 24"><path d="M18,16.08C17.24,16.08 16.56,16.38 16.04,16.85L8.91,12.7C8.96,12.47 9,12.24 9,12C9,11.76 8.96,11.53 8.91,11.3L16.04,7.15C16.56,7.62 17.24,7.92 18,7.92C19.66,7.92 21,6.58 21,5C21,3.42 19.66,2 18,2C16.34,2 15,3.42 15,5C15,5.24 15.04,5.47 15.09,5.7L7.96,9.85C7.44,9.38 6.76,9.08 6,9.08C4.34,9.08 3,10.42 3,12C3,13.58 4.34,14.92 6,14.92C6.76,14.92 7.44,14.62 7.96,14.15L15.09,18.3C15.04,18.53 15,18.76 15,19C15,20.58 16.34,22 18,22C19.66,22 21,20.58 21,19C21,17.42 19.66,16.08 18,16.08Z"></path></svg> <span>分享</span></div>
                        <div class="action"><svg viewBox="0 0 24 24"><path d="M20,2H4C2.9,0,2,0.9,2,2v18l4-4h14c1.1,0,2-0.9,2-2V4C22,2.9,21.1,2,20,2z M18,14H6v-2h12V14z M18,11H6V9h12V11z M18,8H6V6h12V8z"></path></svg> <span>${commentCount}</span></div>
                        <div class="action"><svg viewBox="0 0 24 24"><path d="M12,21.35L10.55,20.03C5.4,15.36,2,12.27,2,8.5C2,5.42,4.42,3,7.5,3c1.74,0,3.41,0.81,4.5,2.09C13.09,3.81,14.76,3,16.5,3C19.58,3,22,5.42,22,8.5c0,3.78-3.4,6.86-8.55,11.54L12,21.35z"></path></svg> <span>${randomLikes}</span></div>
                    </div>
                </div>
            `;
        });
    }

    screen.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="peek-screen">‹</button>
            <div class="title-container">
                <h1 class="title">${nickname}</h1>
            </div>
            <button class="action-btn" id="refresh-unlock-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path></svg></button>
        </header>
        <main class="content">
            <div class="unlock-profile-header">
                <img src="${fixedAvatar}" alt="Profile Avatar" class="unlock-profile-avatar">
                <div class="unlock-profile-info">
                    <h2 class="unlock-profile-username">${nickname}</h2>
                    <p class="unlock-profile-handle">${handle}</p>
                </div>
            </div>
            <div class="unlock-profile-bio">
                <p>${bio.replace(/\n/g, '<br>')}</p>
            </div>
            <div class="unlock-profile-stats">
                <div class="unlock-profile-stat">
                    <span class="count">${posts.length}</span>
                    <span class="label">帖子</span>
                </div>
                <div class="unlock-profile-stat">
                    <span class="count">${randomFollowers}</span>
                    <span class="label">粉丝</span>
                </div>
                <div class="unlock-profile-stat">
                    <span class="count">${randomFollowing}</span>
                    <span class="label">关注</span>
                </div>
            </div>
            <div class="unlock-post-feed">
                ${postsHtml}
            </div>
        </main>
    `;

    screen.querySelector('#refresh-unlock-btn').addEventListener('click', () => {
        generateAndRenderPeekContent('unlock', { forceRefresh: true });
    });

    // 有评论的帖子可点击进入详情
    screen.querySelectorAll('.unlock-post-card[data-has-comments="true"]').forEach(card => {
        const index = parseInt(card.dataset.postIndex, 10);
        const post = posts[index];
        if (post && post.comments && post.comments.length > 0) {
            card.style.cursor = 'pointer';
            card.addEventListener('click', () => {
                renderPeekUnlockPostDetail(post, data);
                switchScreen('peek-unlock-post-detail-screen');
            });
        }
    });
}

function renderPeekUnlockPostDetail(post, unlockData) {
    const screen = document.getElementById('peek-unlock-post-detail-screen');
    if (!screen) return;
    const character = db.characters.find(c => c.id === currentChatId);
    const peekSettings = character?.peekScreenSettings || { unlockAvatar: '' };
    const fixedAvatar = peekSettings.unlockAvatar || 'https://i.postimg.cc/SNwL1XwR/chan-11.png';
    const nickname = unlockData?.nickname || character?.realName || '';

    let commentsHtml = '';
    const comments = post.comments && post.comments.length ? post.comments : [];
    comments.forEach(c => {
        const isReply = !!(c.replyTo && c.replyTo.trim());
        const replyToName = isReply ? peekEscapeHtml(String(c.replyTo).trim()) : '';
        const itemClass = isReply ? 'unlock-comment-item unlock-comment-item-reply' : 'unlock-comment-item';
        const replyLabel = isReply ? `<div class="unlock-comment-reply-to">回复 @${replyToName}</div>` : '';
        commentsHtml += `
            <div class="${itemClass}">
                <div class="unlock-comment-author">${peekEscapeHtml(c.author || '')}</div>
                ${replyLabel}
                <div class="unlock-comment-content">${(c.content || '').replace(/\n/g, '<br>')}</div>
                <div class="unlock-comment-time">${peekEscapeHtml(c.timestamp || '')}</div>
            </div>`;
    });

    screen.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="peek-unlock-screen">‹</button>
            <div class="title-container"><h1 class="title">帖子</h1></div>
            <div class="action-btn-group"></div>
        </header>
        <main class="content" style="padding: 12px;">
            <div class="unlock-post-card" style="margin-bottom: 16px;">
                <div class="unlock-post-card-header">
                    <img src="${fixedAvatar}" alt="Avatar">
                    <div class="unlock-post-card-author-info">
                        <span class="username">${peekEscapeHtml(nickname)}</span>
                        <span class="timestamp">${peekEscapeHtml(post.timestamp || '')}</span>
                    </div>
                </div>
                <div class="unlock-post-card-content">${(post.content || '').replace(/\n/g, '<br>')}</div>
            </div>
            <div class="unlock-comments-section">
                <h4 style="margin: 0 0 12px 0; font-size: 14px; color: #666;">评论 (${comments.length})</h4>
                <div class="unlock-comments-list">${commentsHtml || '<p class="placeholder-text">暂无评论</p>'}</div>
            </div>
        </main>
    `;
}

function renderPeekTimeThoughts(data) {
    const screen = document.getElementById('peek-time-thoughts-screen');
    if (!screen) return;

    if (!data || !data.thoughts || data.thoughts.length === 0) {
        screen.innerHTML = `
            <header class="app-header">
                <button class="back-btn" data-target="peek-screen">‹</button>
                <div class="title-container"><h1 class="title">时光想说</h1></div>
                <button class="action-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                        <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path>
                    </svg>
                </button>
            </header>
            <main class="content">
                <div class="time-thoughts-container">
                    <p class="placeholder-text-thoughts">正在生成时光想说...</p>
                </div>
            </main>
        `;
        return;
    }

    let notesHtml = '';
    data.thoughts.forEach((thought, index) => {
        const previewText = thought.characterSelfDescription?.substring(0, 80) || '';
        notesHtml += `
            <div class="time-thought-note" data-index="${index}">
                <div class="time-thought-note-inner">
                    <span class="note-age-tag">${peekEscapeHtml(thought.userAge || '')}</span>
                    <div class="note-title">${peekEscapeHtml(thought.title || '如果遇见那时的你')}</div>
                    <div class="note-preview">${peekEscapeHtml(previewText)}${previewText.length >= 80 ? '...' : ''}</div>
                    <span class="note-emotion-tag">${peekEscapeHtml(thought.emotion || '')}</span>
                </div>
            </div>
        `;
    });

    screen.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="peek-screen">‹</button>
            <div class="title-container"><h1 class="title">时光想说</h1></div>
            <button class="action-btn" id="refresh-time-thoughts-btn">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path>
                </svg>
            </button>
        </header>
        <main class="content">
            <div class="time-thoughts-container">
                <div class="time-thoughts-wall">${notesHtml}</div>
            </div>
        </main>
    `;

    document.getElementById('refresh-time-thoughts-btn')?.addEventListener('click', () => {
        generateAndRenderPeekContent('timeThoughts', { forceRefresh: true });
    });

    document.querySelectorAll('.time-thought-note').forEach(note => {
        note.addEventListener('click', () => {
            const index = parseInt(note.dataset.index);
            const thought = data.thoughts[index];
            if (thought) {
                showTimeThoughtDetail(thought);
            }
        });
    });
}

function showTimeThoughtDetail(thought) {
    let existingModal = document.getElementById('time-thought-detail-modal');
    if (!existingModal) {
        existingModal = document.createElement('div');
        existingModal.id = 'time-thought-detail-modal';
        existingModal.className = 'time-thought-detail-modal';
        document.body.appendChild(existingModal);
    }

    existingModal.innerHTML = `
        <div class="detail-modal-content">
            <div class="detail-modal-header">
                <h3 class="detail-modal-title">${peekEscapeHtml(thought.title || '时光想说')}</h3>
                <button class="detail-modal-close">×</button>
            </div>
            <div class="detail-modal-body">
                <div class="detail-age-info">
                    <div class="detail-age-badge">${peekEscapeHtml(thought.userAge || '')}</div>
                    ${thought.characterAge ? `<div class="detail-age-badge">${peekEscapeHtml(thought.characterAge)}</div>` : ''}
                    <div class="detail-age-badge">${peekEscapeHtml(thought.emotion || '')}</div>
                </div>
                
                <div class="detail-section">
                    <div class="detail-section-title">那时的我</div>
                    <div class="detail-section-content">${peekEscapeHtml(thought.characterSelfDescription || '').replace(/\n/g, '<br>')}</div>
                </div>
                
                <div class="detail-section">
                    <div class="detail-section-title">想对你说</div>
                    <div class="detail-section-content">${peekEscapeHtml(thought.whatToSay || '').replace(/\n/g, '<br>')}</div>
                </div>
                
                ${thought.whatToDo ? `
                <div class="detail-section">
                    <div class="detail-section-title">想和你做</div>
                    <div class="detail-section-content">${peekEscapeHtml(thought.whatToDo).replace(/\n/g, '<br>')}</div>
                </div>
                ` : ''}
            </div>
        </div>
    `;

    existingModal.classList.add('visible');

    const closeBtn = existingModal.querySelector('.detail-modal-close');
    const closeModal = () => existingModal.classList.remove('visible');
    
    closeBtn.addEventListener('click', closeModal);
    existingModal.addEventListener('click', (e) => {
        if (e.target === existingModal) closeModal();
    });
}

function renderPeekConversation(conversation) {
    const titleEl = document.getElementById('peek-conversation-title');
    const messageAreaEl = document.getElementById('peek-message-area');
    const impersonateBar = document.getElementById('peek-impersonate-bar');
    const char = db.characters.find(c => c.id === currentChatId);
    const impersonateEnabled = char?.peekScreenSettings?.impersonateEnabled && conversation;

    const partnerName = conversation?.partnerName || '...';
    const history = conversation?.history || [];

    titleEl.textContent = partnerName;
    messageAreaEl.innerHTML = '';

    if (!history || history.length === 0) {
        messageAreaEl.innerHTML = '<p class="placeholder-text">正在生成对话...</p>';
    } else {
        history.forEach(msg => {
            const isSentByChar = msg.sender === 'char';
            const isImpersonated = !!msg.isImpersonated;
            const wrapper = document.createElement('div');
            wrapper.className = `message-wrapper ${isSentByChar ? 'sent' : 'received'}`;

            const bubbleRow = document.createElement('div');
            bubbleRow.className = 'message-bubble-row';

            const bubble = document.createElement('div');
            bubble.className = `message-bubble ${isSentByChar ? 'sent' : 'received'}`;
            bubble.textContent = msg.content;
            // isImpersonated 仅保留在数据中，界面不显示任何标注，以假乱真

            if (isSentByChar) {
                bubbleRow.appendChild(bubble);
            } else {
                const avatar = document.createElement('img');
                avatar.className = 'message-avatar';
                avatar.src = 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg';
                bubbleRow.appendChild(avatar);
                bubbleRow.appendChild(bubble);
            }

            wrapper.appendChild(bubbleRow);
            messageAreaEl.appendChild(wrapper);
        });
        messageAreaEl.scrollTop = messageAreaEl.scrollHeight;
    }

    if (impersonateBar) {
        impersonateBar.style.display = impersonateEnabled ? 'block' : 'none';
    }
    const friendBtn = document.getElementById('peek-impersonate-friend-btn');
    if (friendBtn) {
        const isFriend = conversation?.isFriend === true;
        friendBtn.textContent = isFriend ? '已是好友' : '添加好友';
        friendBtn.disabled = isFriend;
    }
}

async function sendPeekImpersonateMessage() {
    const input = document.getElementById('peek-impersonate-input');
    const text = (input && input.value || '').trim();
    if (!text) {
        showToast('请输入消息内容');
        return;
    }
    if (!currentPeekConversation) {
        showToast('当前对话已关闭');
        return;
    }
    const char = db.characters.find(c => c.id === currentChatId);
    if (!char || !char.peekData?.messages?.conversations) {
        showToast('数据异常');
        return;
    }
    currentPeekConversation.history = currentPeekConversation.history || [];
    currentPeekConversation.history.push({ sender: 'char', content: text, isImpersonated: true });
    if (input) input.value = '';
    await saveData();
    renderPeekConversation(currentPeekConversation);
    showToast('已发送');
}

async function requestPeekNPCReply() {
    if (!currentPeekConversation) {
        showToast('请先打开一个对话');
        return;
    }
    const char = db.characters.find(c => c.id === currentChatId);
    if (!char) return;
    let apiConfig = db.apiSettings;
    if (db.peekApiSettings && db.peekApiSettings.url && db.peekApiSettings.key && db.peekApiSettings.model) {
        apiConfig = db.peekApiSettings;
    }
    const { url, key, model } = apiConfig;
    if (!url || !key || !model) {
        showToast('请先在设置中配置 API');
        return;
    }
    const npcName = currentPeekConversation.partnerName;
    const npcPersona = (currentPeekConversation.partnerPersona || '') + (currentPeekConversation.supplementPersona ? '\n补充：' + currentPeekConversation.supplementPersona : '') || '与角色认识的普通人';
    const charName = char.realName;
    const relation = currentPeekConversation.partnerRelation || '熟人';
    const suspicion = currentPeekConversation.suspicionLevel != null ? currentPeekConversation.suspicionLevel : 0;
    const history = currentPeekConversation.history || [];
    const recentLines = history.slice(-16).map(m => {
        const who = m.sender === 'char' ? charName : npcName;
        const tag = m.isImpersonated ? ' [实际是别人冒充' + charName + '发的]' : '';
        return who + '：' + (m.content || '') + tag;
    }).join('\n');

    const systemPrompt = `你是「${npcName}」，正在和「${charName}」聊天。你的人设：${npcPersona}。你和${charName}是${relation}关系。

以下近期对话中，有些消息可能不是${charName}本人发的，而是TA的恋人在偷偷用TA手机和你聊。当前你对「对方是不是本人」的怀疑度：${suspicion}/100（0=完全没察觉，100=基本确定不是本人）。

近期对话：
---
${recentLines}
---

请根据人设和怀疑度，生成你的回复。可以自然聊天，也可以若有所察地试探。若对话氛围合适且尚未是好友，可表达想加对方为好友的意愿，并设置 "suggestFriend": true。
只输出XML标签格式，不要其他文字：
<result>
  <replies>
    <reply>回复1</reply>
    <reply>回复2</reply>
  </replies>
  <newSuspicion>数字0-100</newSuspicion>
  <suspicionReason>可选</suspicionReason>
  <suggestFriend>false或true</suggestFriend>
</result>`;

    showToast('正在生成回复…');
    try {
        const endpoint = (url.endsWith('/') ? url.slice(0, -1) : url) + '/v1/chat/completions';
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
        const requestBody = { model: model, messages: [{ role: 'user', content: systemPrompt }], temperature: 0.8 };
        const contentStr = await fetchAiResponse(apiConfig, requestBody, headers, endpoint);
        const data = parseXmlToJson(contentStr);
        const replies = Array.isArray(data.replies) ? data.replies : (data.reply ? [data.reply] : []);
        const newSuspicion = typeof data.newSuspicion === 'number' ? Math.max(0, Math.min(100, data.newSuspicion)) : suspicion;
        if (replies.length > 0) {
            currentPeekConversation.history = currentPeekConversation.history || [];
            replies.forEach(t => currentPeekConversation.history.push({ sender: 'partner', content: String(t).trim() }));
            currentPeekConversation.suspicionLevel = newSuspicion;
            await saveData();
            renderPeekConversation(currentPeekConversation);
            showToast('对方已回复');
        } else {
            showToast('未生成到回复，请重试');
        }
        if (data.suggestFriend === true && !currentPeekConversation.isFriend) {
            peekShowFriendRequestModal(currentPeekConversation);
        }
    } catch (err) {
        console.error(err);
        showApiError(err);
    }
}

async function peekAddNPCAsFriend() {
    if (!currentPeekConversation) return;
    if (currentPeekConversation.isFriend) {
        showToast('已经是好友了');
        return;
    }
    const char = db.characters.find(c => c.id === currentChatId);
    if (!char) return;
    if (!db.characters.some(c => c.source === 'peek' && c.peekPartnerId === currentPeekConversation.partnerId)) {
        const newChar = {
            id: 'peek_friend_' + (currentPeekConversation.partnerId || Date.now()) + '_' + Date.now(),
            name: currentPeekConversation.partnerName,
            realName: currentPeekConversation.partnerName,
            avatar: 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg',
            persona: currentPeekConversation.partnerPersona || '',
            source: 'peek',
            peekPartnerId: currentPeekConversation.partnerId,
            peekOwnerCharId: char.id,
            history: [],
            myName: char.myName || '用户',
            myPersona: char.myPersona || '',
            supplementPersonaEnabled: false,
            supplementPersonaAiEnabled: false,
            supplementPersonaText: (currentPeekConversation.supplementPersona || '').trim()
        };
        db.characters.push(newChar);
        currentPeekConversation.isFriend = true;
        await saveData();
        renderPeekConversation(currentPeekConversation);
        showToast('已添加为好友，可在联系人中与TA聊天');
    } else {
        currentPeekConversation.isFriend = true;
        await saveData();
        renderPeekConversation(currentPeekConversation);
        showToast('已是好友');
    }
}

function peekShowFriendRequestModal(conversation) {
    if (!conversation) return;
    peekPendingFriendRequestConversation = conversation;
    const nameEl = document.getElementById('peek-friend-request-name');
    const avatarEl = document.getElementById('peek-friend-request-avatar');
    if (nameEl) nameEl.textContent = conversation.partnerName || '对方';
    if (avatarEl) avatarEl.src = 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg';
    document.getElementById('peek-friend-request-modal')?.classList.add('visible');
}

async function peekAcceptFriendRequest() {
    if (!peekPendingFriendRequestConversation) return;
    currentPeekConversation = peekPendingFriendRequestConversation;
    const conv = peekPendingFriendRequestConversation;
    peekPendingFriendRequestConversation = null;
    document.getElementById('peek-friend-request-modal')?.classList.remove('visible');
    await peekAddNPCAsFriend();
    if (currentPeekConversation === conv) renderPeekConversation(currentPeekConversation);
}

function peekRejectFriendRequest() {
    peekPendingFriendRequestConversation = null;
    document.getElementById('peek-friend-request-modal')?.classList.remove('visible');
}

async function peekSupplementPersonaFromConversation() {
    if (!currentPeekConversation) {
        showToast('请先打开一个对话');
        return;
    }
    const char = db.characters.find(c => c.id === currentChatId);
    if (!char) return;
    let apiConfig = db.apiSettings;
    if (db.peekApiSettings && db.peekApiSettings.url && db.peekApiSettings.key && db.peekApiSettings.model) apiConfig = db.peekApiSettings;
    if (!apiConfig || !apiConfig.url || !apiConfig.key || !apiConfig.model) {
        showToast('请先配置 API');
        return;
    }
    const npcName = currentPeekConversation.partnerName || '对方';
    const history = currentPeekConversation.history || [];
    const recent = history.slice(-12);
    if (recent.length === 0) {
        showToast('暂无对话内容可提取');
        return;
    }
    const convText = recent.map(m => {
        const who = m.sender === 'char' ? (char.realName || '角色') : npcName;
        return who + '：' + (m.content || '').trim();
    }).join('\n');
    const basePersona = (currentPeekConversation.partnerPersona || '').slice(0, 500);
    const existingSupplement = (currentPeekConversation.supplementPersona || '').slice(0, 800);
    const systemPrompt = '你是一个人设补充助手。请根据「最近对话」**只提取【该 NPC 在对话中透露的、关于自己的信息】**，整理成简短的人设条目。\n\n要求：只输出「关于这个 NPC 我们新知道了什么」，例如：提到喜好、经历、习惯、身份等，按「条目：内容」格式补充。不要总结对话过程。若没有新信息则返回空。\n\n只返回 XML 标签格式：\n<result>\n  <supplement>条目1：xxx\n条目2：xxx</supplement>\n</result>\n或 <result><supplement></supplement></result>。\n\n已有基础人设（节选）:\n' + basePersona + '\n\n已补充人设（节选）:\n' + existingSupplement + '\n\n最近对话:\n' + convText;
    showToast('正在提取人设…');
    try {
        const url = apiConfig.url.endsWith('/') ? apiConfig.url.slice(0, -1) : apiConfig.url;
        const endpoint = url + '/v1/chat/completions';
        const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiConfig.key };
        const requestBody = { model: apiConfig.model, messages: [{ role: 'user', content: systemPrompt }], temperature: 0.3 };
        const contentStr = await fetchAiResponse(apiConfig, requestBody, headers, endpoint);
        const json = parseXmlToJson(contentStr);
        const supplement = (json && json.supplement && String(json.supplement).trim()) ? String(json.supplement).trim() : '';
        if (supplement) {
            currentPeekConversation.supplementPersona = ((currentPeekConversation.supplementPersona || '').trim() ? (currentPeekConversation.supplementPersona || '').trim() + '\n\n' : '') + supplement;
            await saveData();
            renderPeekConversation(currentPeekConversation);
            showToast('已补充人设');
        } else {
            showToast('未提取到新的人设信息');
        }
    } catch (err) {
        console.error(err);
        showApiError(err);
    }
}

function openPeekEditPersonaModal() {
    if (!currentPeekConversation) return;
    const ta = document.getElementById('peek-edit-persona-textarea');
    if (ta) ta.value = currentPeekConversation.supplementPersona || '';
    document.getElementById('peek-edit-persona-modal')?.classList.add('visible');
}

function savePeekEditPersona() {
    if (!currentPeekConversation) return;
    const ta = document.getElementById('peek-edit-persona-textarea');
    if (ta) currentPeekConversation.supplementPersona = (ta.value || '').trim();
    saveData();
    document.getElementById('peek-edit-persona-modal')?.classList.remove('visible');
    renderPeekConversation(currentPeekConversation);
    showToast('已保存');
}

function renderPeekScreen() {
    const peekScreen = document.getElementById('peek-screen');
    const contentArea = peekScreen.querySelector('main.content');

    contentArea.innerHTML = `
        <div class="time-widget">
            <div class="time" id="peek-time-display"></div>
            <div class="date" id="peek-date-display"></div>
        </div>
        <div class="app-grid"></div>
    `;

    const character = db.characters.find(c => c.id === currentChatId);
    const peekSettings = character?.peekScreenSettings || { wallpaper: '', customIcons: {} };

    const wallpaper = peekSettings.wallpaper;
    if (wallpaper) {
        peekScreen.style.backgroundImage = `url(${wallpaper})`;
    } else {
        peekScreen.style.backgroundImage = `url(${db.wallpaper})`; 
    }
    peekScreen.style.backgroundSize = 'cover';
    peekScreen.style.backgroundPosition = 'center';

    const appGrid = contentArea.querySelector('.app-grid');
    Object.keys(peekScreenApps).forEach(id => {
        const iconData = peekScreenApps[id];
        const iconEl = document.createElement('a');
        iconEl.href = '#';
        iconEl.className = 'app-icon';
        iconEl.dataset.peekAppId = id;
        const customIconUrl = peekSettings.customIcons?.[id];
        const iconUrl = customIconUrl || iconData.url;
        iconEl.innerHTML = `
            <img src="${iconUrl}" alt="${iconData.name}" class="icon-img">
            <span class="app-name">${iconData.name}</span>
        `;
        iconEl.addEventListener('click', (e) => {
            e.preventDefault();
            generateAndRenderPeekContent(id);
        });
        appGrid.appendChild(iconEl);
    });

    updateClock();
}

function renderPeekChatList(conversations = []) {
    const container = document.getElementById('peek-chat-list-container');
    container.innerHTML = '';

    if (!conversations || conversations.length === 0) {
        return;
    }

    conversations.forEach((convo) => {
        const history = convo.history || [];
        const lastMessage = history.length > 0 ? history[history.length - 1] : null;
        const lastMessageText = lastMessage ? (lastMessage.content || '').replace(/\[.*?的消息：([\s\S]+)\]/, '$1') : '...';
        
        const li = document.createElement('li');
        li.className = 'list-item chat-item';
        li.dataset.name = convo.partnerName;

        const avatarUrl = 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg';

        li.innerHTML = `
            <img src="${avatarUrl}" alt="${convo.partnerName}" class="chat-avatar">
            <div class="item-details">
                <div class="item-details-row"><div class="item-name">${convo.partnerName}</div></div>
                <div class="item-preview-wrapper">
                    <div class="item-preview">${lastMessageText}</div>
                </div>
            </div>`;
        container.appendChild(li);
    });
}

function renderMemosList(memos) {
    const screen = document.getElementById('peek-memos-screen');
    let listHtml = '';
    if (!memos || memos.length === 0) {
        listHtml = '<p class="placeholder-text">正在生成备忘录...</p>';
    } else {
        memos.forEach(memo => {
            const firstLine = memo.content.split('\n')[0];
            listHtml += `
                <li class="memo-item" data-id="${memo.id}">
                    <h3 class="memo-item-title">${memo.title}</h3>
                    <p class="memo-item-preview">${firstLine}</p>
                </li>
            `;
        });
    }

    screen.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="peek-screen">‹</button>
            <div class="title-container"><h1 class="title">备忘录</h1></div>
            <button class="action-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path></svg></button>
        </header>
        <main class="content"><ul id="peek-memos-list">${listHtml}</ul></main>
    `;

    screen.querySelector('.action-btn').addEventListener('click', () => {
        generateAndRenderPeekContent('memos', { forceRefresh: true });
    });

    screen.querySelectorAll('.memo-item').forEach(item => {
        item.addEventListener('click', () => {
            const memo = memos.find(m => m.id === item.dataset.id); 
    
            if (memo) {
                renderMemoDetail(memo);
                switchScreen('peek-memo-detail-screen');
            }
        });
    });
}

function renderMemoDetail(memo) {
    const screen = document.getElementById('peek-memo-detail-screen');
    if (!memo) return;
    const contentHtml = memo.content.replace(/\n/g, '<br>');
    screen.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="peek-memos-screen">‹</button>
            <div class="title-container"><h1 class="title">${memo.title}</h1></div>
            <button class="action-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path></svg></button>
        </header>
        <main class="content" style="padding: 20px; line-height: 1.6;">${contentHtml}</main>
    `;
}

function renderPeekCart(items) {
    const screen = document.getElementById('peek-cart-screen');
    let itemsHtml = '';
    let totalPrice = 0;

    if (!items || items.length === 0) {
        itemsHtml = '<p class="placeholder-text">正在生成购物车内容...</p>';
    } else {
        items.forEach(item => {
            itemsHtml += `
                <li class="cart-item" data-id="${item.id}">
                    <img src="https://i.postimg.cc/wMbSMvR9/export202509181930036600.png" class="cart-item-image" alt="${item.title}">
                    <div class="cart-item-details">
                        <h3 class="cart-item-title">${item.title}</h3>
                        <p class="cart-item-spec">规格：${item.spec}</p>
                        <p class="cart-item-price">¥${item.price}</p>
                    </div>
                </li>
            `;
            totalPrice += parseFloat(item.price);
        });
    }

    screen.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="peek-screen">‹</button>
            <div class="title-container"><h1 class="title">购物车</h1></div>
            <button class="action-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path></svg></button>
        </header>
        <main class="content"><ul class="cart-item-list">${itemsHtml}</ul></main>
        <footer class="cart-footer">
            <div class="cart-total-price">
                <span class="label">合计：</span>¥${totalPrice.toFixed(2)}
            </div>
            <button class="checkout-btn">结算</button>
        </footer>
    `;
    
    screen.querySelector('.action-btn').addEventListener('click', () => {
        generateAndRenderPeekContent('cart', { forceRefresh: true });
    });
    screen.querySelector('.checkout-btn').addEventListener('click', async () => {
        const char = db.characters.find(c => c.id === currentChatId);
        if (!char) return;

        const cartItems = char.peekData?.cart?.items;
        if (!cartItems || cartItems.length === 0) {
            showToast('购物车是空的');
            return;
        }

        let totalPrice = 0;
        const itemsStrList = [];

        cartItems.forEach(item => {
            totalPrice += parseFloat(item.price);
            itemsStrList.push(`${item.title} x1`);
        });

        const itemsStr = itemsStrList.join(', ');
        const myName = char.myName;
        const realName = char.realName;

        // 清空购物车
        char.peekData.cart.items = [];
        await saveData();
        
        renderPeekCart([]);

        // 跳转回聊天界面
        switchScreen('chat-room-screen');

        // 发送消息
        const input = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-message-btn');

        if (input && sendBtn) {
            // 1. 发送系统提示
            input.value = `[system-display:${myName}帮${realName}清空了ta的购物车]`;
            sendBtn.click();

            // 2. 延迟发送订单消息
            setTimeout(() => {
                input.value = `[${myName}为${realName}下单了：即时送达|${totalPrice.toFixed(2)}|${itemsStr}]`;
                sendBtn.click();
            }, 300);
        }
    });
}

function renderPeekWallet(data) {
    const screen = document.getElementById('peek-wallet-screen');
    if (!screen) return;

    const char = db.characters.find(c => c.id === currentChatId);
    const walletTheme = (char?.peekScreenSettings?.walletTheme === 'default') ? 'default' : 'ins';

    const summary = data?.summary || {};
    const income = data?.income || [];
    const expense = data?.expense || [];

    const balanceStr = summary.balance != null ? String(summary.balance) : '—';
    const monthIncomeStr = summary.monthIncome != null ? String(summary.monthIncome) : '—';
    const monthExpenseStr = summary.monthExpense != null ? String(summary.monthExpense) : '—';

    let listHtml = '';
    if (!data) {
        listHtml = '<p class="placeholder-text">正在生成账单...</p>';
    } else {
        const renderList = (items, type) => {
            if (!items || items.length === 0) {
                return '<p class="wallet-empty-hint">暂无记录</p>';
            }
            return '<ul class="wallet-list">' + items.map(item => {
                const amt = item.amount != null ? item.amount : '';
                const remark = peekEscapeHtml(item.remark != null ? item.remark : '');
                const time = peekEscapeHtml(item.time != null ? item.time : '');
                return `<li class="wallet-list-item">
                    <div class="left">
                        <div class="remark">${remark || '—'}</div>
                        <div class="meta">${time}</div>
                    </div>
                    <span class="amount ${type}">${type === 'income' ? '+' : '-'}¥${amt}</span>
                </li>`;
            }).join('') + '</ul>';
        };
        const familyCard = (db.piggyBank && db.piggyBank.familyCards) ? db.piggyBank.familyCards.find(c => c.targetCharId === currentChatId && c.status === 'active') : null;
        const fcTx = familyCard && familyCard.transactions ? familyCard.transactions : [];
        const fcListHtml = fcTx.length === 0 ? '<p class="wallet-empty-hint">暂无消费记录</p>' : '<ul class="wallet-list">' + fcTx.map(t => {
            const amt = t.amount != null ? t.amount : '';
            const remark = peekEscapeHtml((t.scene || '') + (t.detail ? ' ' + t.detail : ''));
            const time = t.time ? new Date(t.time).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
            return `<li class="wallet-list-item"><div class="left"><div class="remark">${remark || '—'}</div><div class="meta">${time}</div></div><span class="amount expense">-¥${amt}</span></li>`;
        }).join('') + '</ul>';
        listHtml = `
            <div class="wallet-tabs">
                <button type="button" class="wallet-tab active" data-wallet-tab="income">收入</button>
                <button type="button" class="wallet-tab" data-wallet-tab="expense">支出</button>
                <button type="button" class="wallet-tab" data-wallet-tab="familycard">亲属卡</button>
            </div>
            <div class="wallet-tab-panel" data-panel="income">${renderList(income, 'income')}</div>
            <div class="wallet-tab-panel" data-panel="expense" style="display:none;">${renderList(expense, 'expense')}</div>
            <div class="wallet-tab-panel" data-panel="familycard" style="display:none;">${familyCard ? ('<p class="wallet-summary-label" style="margin-bottom:8px;">' + peekEscapeHtml(familyCard.bankName || '亲属卡') + ' 剩余 ' + Math.max(0, familyCard.limit - (familyCard.usedAmount || 0)) + '</p>' + fcListHtml) : '<p class="wallet-empty-hint">暂无亲属卡</p>'}</div>
        `;
    }

    screen.setAttribute('data-wallet-theme', walletTheme);
    const sunSvg = `<svg class="wallet-header-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;
    const refreshSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path></svg>`;
    screen.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="peek-screen">‹</button>
            <div class="title-container"><h1 class="title">钱包</h1></div>
            <div class="action-btn-group">
                <button class="action-btn" id="peek-wallet-theme-btn" title="切换账单样式">${sunSvg}</button>
                <button class="action-btn" id="peek-wallet-refresh-btn" title="刷新">${refreshSvg}</button>
            </div>
        </header>
        <main class="content wallet-content">
            <div class="wallet-summary-cards">
                <div class="wallet-summary-card balance">
                    <div class="wallet-summary-label">当前余额</div>
                    <div class="wallet-summary-value">${data ? peekEscapeHtml(balanceStr) : '—'}</div>
                </div>
                <div class="wallet-summary-card">
                    <div class="wallet-summary-label">本月收入</div>
                    <div class="wallet-summary-value income">${data ? peekEscapeHtml(monthIncomeStr) : '—'}</div>
                </div>
                <div class="wallet-summary-card">
                    <div class="wallet-summary-label">本月支出</div>
                    <div class="wallet-summary-value expense">${data ? peekEscapeHtml(monthExpenseStr) : '—'}</div>
                </div>
            </div>
            ${listHtml}
        </main>
    `;

    const refreshBtn = document.getElementById('peek-wallet-refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => generateAndRenderPeekContent('wallet', { forceRefresh: true }));
    }

    const themeBtn = document.getElementById('peek-wallet-theme-btn');
    if (themeBtn) {
        themeBtn.addEventListener('click', async () => {
            const c = db.characters.find(c => c.id === currentChatId);
            if (!c) return;
            if (!c.peekScreenSettings) c.peekScreenSettings = {};
            const next = (c.peekScreenSettings.walletTheme === 'ins') ? 'default' : 'ins';
            c.peekScreenSettings.walletTheme = next;
            await saveData();
            screen.setAttribute('data-wallet-theme', next);
            showToast(next === 'ins' ? '已切换为简约风格' : '已切换为经典风格');
        });
    }

    screen.querySelectorAll('.wallet-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            screen.querySelectorAll('.wallet-tab').forEach(t => t.classList.remove('active'));
            screen.querySelectorAll('.wallet-tab-panel').forEach(p => p.style.display = 'none');
            tab.classList.add('active');
            const panel = screen.querySelector('.wallet-tab-panel[data-panel="' + tab.dataset.walletTab + '"]');
            if (panel) panel.style.display = 'block';
        });
    });
}

function renderPeekTransferStation(entries) {
    const screen = document.getElementById('peek-transfer-station-screen');
    let messagesHtml = '';

    if (!entries || entries.length === 0) {
        messagesHtml = '<p class="placeholder-text">正在生成中转站内容...</p>';
    } else {
        entries.forEach(entry => {
            messagesHtml += `
                <div class="message-wrapper sent">
                    <div class="message-bubble-row">
                        <div class="message-bubble sent" style="background-color: #98E165; color: #000;">${entry}</div>
                    </div>
                </div>
            `;
        });
    }

    screen.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="peek-screen">‹</button>
            <div class="title-container">
                <h1 class="title">文件传输助手</h1>
            </div>
            <button class="action-btn">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path></svg>
            </button>
        </header>
        <main class="content">
            <div class="message-area" style="padding: 10px;">
                ${messagesHtml}
            </div>
            <div class="transfer-station-input-area">
                <div class="fake-input"></div>
                <button class="plus-btn"></button>
            </div>
        </main>
    `;
    
    screen.querySelector('.action-btn').addEventListener('click', () => {
        generateAndRenderPeekContent('transfer', { forceRefresh: true });
    });

    const messageArea = screen.querySelector('.message-area');
    if (messageArea) {
        messageArea.scrollTop = messageArea.scrollHeight;
    }
}

function renderPeekBrowser(historyItems) {
    const screen = document.getElementById('peek-browser-screen');
    let itemsHtml = '';
    if (!historyItems || historyItems.length === 0) {
        itemsHtml = '<p class="placeholder-text">正在生成浏览记录...</p>';
    } else {
        historyItems.forEach((item, index) => {
            const hasDetail = item.detail ? ' has-detail' : '';
            itemsHtml += `
                <li class="browser-history-item${hasDetail}" data-index="${index}">
                    <h3 class="history-item-title">${peekEscapeHtml(item.title)}</h3>
                    <p class="history-item-url">${peekEscapeHtml(item.url)}</p>
                    <div class="history-item-annotation">${peekEscapeHtml(item.annotation)}</div>
                </li>
            `;
        });
    }

    screen.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="peek-screen">‹</button>
            <div class="title-container"><h1 class="title">浏览器</h1></div>
            <button class="action-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path></svg></button>
        </header>
        <main class="content"><ul class="browser-history-list">${itemsHtml}</ul></main>
    `;
    screen.querySelector('.action-btn').addEventListener('click', () => {
        generateAndRenderPeekContent('browser', { forceRefresh: true });
    });

    if (historyItems && historyItems.length > 0) {
        screen.querySelectorAll('.browser-history-item.has-detail').forEach(el => {
            el.style.cursor = 'pointer';
            el.addEventListener('click', () => {
                const idx = parseInt(el.dataset.index, 10);
                const item = historyItems[idx];
                if (item && item.detail) {
                    renderBrowserDetail(item);
                    switchScreen('peek-browser-detail-screen');
                }
            });
        });
    }
}

function renderBrowserDetail(item) {
    const screen = document.getElementById('peek-browser-detail-screen');
    if (!screen) return;
    screen.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="peek-browser-screen">‹</button>
            <div class="title-container"><h1 class="title">${peekEscapeHtml(item.title)}</h1></div>
        </header>
        <main class="content browser-detail-content">
            <p class="browser-detail-url">${peekEscapeHtml(item.url)}</p>
            <div class="browser-detail-body">${item.detail}</div>
            <div class="browser-detail-annotation">${peekEscapeHtml(item.annotation)}</div>
        </main>
    `;
}

function renderPeekDrafts(draft) {
    const screen = document.getElementById('peek-drafts-screen');
    let draftTo = '...';
    let draftContent = '<p class="placeholder-text">正在生成草稿...</p>';

    if (draft) {
        draftTo = draft.to;
        draftContent = draft.content;
    }
    
    screen.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="peek-screen">‹</button>
            <div class="title-container"><h1 class="title">草稿箱</h1></div>
            <button class="action-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path></svg></button>
        </header>
        <main class="content">
            <div class="draft-paper">
                <div class="draft-to">To: ${draftTo}</div>
                <div class="draft-content">${draftContent}</div>
            </div>
        </main>
    `;
    screen.querySelector('.action-btn').addEventListener('click', () => {
        generateAndRenderPeekContent('drafts', { forceRefresh: true });
    });
}

function renderPeekSteps(data) {
    const screen = document.getElementById('peek-steps-screen');
    const char = db.characters.find(c => c.id === currentChatId);
    if (!char) return; 

    const avatarEl = screen.querySelector('#steps-char-avatar');
    const nameEl = screen.querySelector('#steps-char-name');
    const currentStepsEl = screen.querySelector('#steps-current-count');
    const goalStepsEl = screen.querySelector('.steps-label');
    const progressRingEl = screen.querySelector('#steps-progress-ring');
    const trackListEl = screen.querySelector('#activity-track-list');
    const annotationEl = screen.querySelector('#steps-annotation-content');

    avatarEl.src = char.avatar;
    nameEl.textContent = char.realName;
    goalStepsEl.textContent = '/ 6000 步';

    if (!data) {
        currentStepsEl.textContent = '----';
        trackListEl.innerHTML = '<li class="activity-track-item">正在生成活动轨迹...</li>';
        annotationEl.textContent = '正在生成角色批注...';
        progressRingEl.style.setProperty('--steps-percentage', 0);
        return;
    }

    currentStepsEl.textContent = data.currentSteps;
    
    const percentage = (data.currentSteps / 6000) * 100;
    progressRingEl.style.setProperty('--steps-percentage', percentage);

    trackListEl.innerHTML = data.trajectory.map(item => `<li class="activity-track-item">${item}</li>`).join('');
    annotationEl.textContent = data.annotation;
}

function extractTransfersFromHistory(history, realName, myName) {
    const privateReceivedTransferRegex = /\[.*?的转账[：:]([\d.,]+)元[；;]备注[：:](.*?)\]/;
    const privateSentTransferRegex = /\[.*?给你转账[：:]([\d.,]+)元[；;]备注[：:](.*?)\]/;
    const income = [];
    const expense = [];
    const arr = history || [];
    for (let i = 0; i < arr.length; i++) {
        const m = arr[i];
        const content = m.content || '';
        const time = m.timestamp ? new Date(m.timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        let match = content.match(privateReceivedTransferRegex);
        if (match && (m.role === 'assistant' || m.role === 'char')) {
            expense.push({ amount: match[1], remark: (match[2] || '').trim(), time, source: '聊天记录' });
        }
        match = content.match(privateSentTransferRegex);
        if (match && m.role === 'user') {
            income.push({ amount: match[1], remark: (match[2] || '').trim(), time, source: '聊天记录' });
        }
        // 用户商城购买送给角色的订单不计入角色钱包收支（钱是用户出的，角色只收到礼物）
        if (realName && myName) {
            // 角色同意用户的代付请求 → 角色支出
            if (m.role === 'assistant' && content.includes('同意了') && content.includes('的代付请求')) {
                const agreedMatch = content.match(new RegExp(`\\[([^\\]]+?)同意了([^\\]]+?)的代付请求\\]`));
                if (agreedMatch && agreedMatch[1].trim() === realName && agreedMatch[2].trim() === myName) {
                    for (let j = i - 1; j >= 0; j--) {
                        const prev = arr[j];
                        if (prev.role === 'user' && prev.content && prev.content.includes('发起了代付请求')) {
                            const amtMatch = prev.content.match(/发起了代付请求[：:]([\d.]+)\|/);
                            if (amtMatch) {
                                expense.push({ amount: amtMatch[1], remark: '代付给用户', time, source: '聊天记录' });
                            }
                            break;
                        }
                    }
                }
            }
            // 用户同意角色的代付请求 → 角色收入
            if (m.role === 'user' && content.includes('同意了') && content.includes('的代付请求')) {
                const agreedMatch = content.match(new RegExp(`\\[([^\\]]+?)同意了([^\\]]+?)的代付请求\\]`));
                if (agreedMatch && agreedMatch[1].trim() === myName && agreedMatch[2].trim() === realName) {
                    for (let j = i - 1; j >= 0; j--) {
                        const prev = arr[j];
                        if (prev.role === 'assistant' && prev.content && prev.content.includes('发起了代付请求')) {
                            const amtMatch = prev.content.match(/发起了代付请求[：:]([\d.]+)\|/);
                            if (amtMatch) {
                                income.push({ amount: amtMatch[1], remark: '用户代付', time, source: '聊天记录' });
                            }
                            break;
                        }
                    }
                }
            }
        }
    }
    return { income, expense };
}

function generatePeekContentPrompt(char, appType, mainChatContext) {
    const appNameMapping = {
        messages: "消息应用（模拟与他人的对话）",
        memos: "备忘录应用",
        cart: "电商平台的购物车",
        transfer: "文件传输助手（用于记录临时想法、链接等）",
        browser: "浏览器历史记录",
        drafts: "邮件或消息的草稿箱"
    };
    const appName = appNameMapping[appType] || appType;

    let prompt = `你正在模拟一个名为 ${char.realName} 的角色的手机内部信息。`;
    prompt += `该角色的核心人设是：${char.persona}。\n`;

    // 收集关联的 + 全局的世界书（去重）
    let isOfflineNode = false;
    if (char.activeNodeId && char.nodes) {
        const activeNode = char.nodes.find(n => n.id === char.activeNodeId);
        if (activeNode) {
            let baseMode = (activeNode.customConfig && activeNode.customConfig.baseMode) ? activeNode.customConfig.baseMode : 
                           (activeNode.type === 'offline' || (activeNode.type === 'spinoff' && activeNode.spinoffMode === 'offline') ? 'offline' : 'online');
            if (baseMode === 'offline') {
                isOfflineNode = true;
            }
        }
    }
    let associatedIds = char.worldBookIds || [];
    if (isOfflineNode) {
        associatedIds = (char.offlineWorldBookIds && char.offlineWorldBookIds.length > 0) ? char.offlineWorldBookIds : (char.worldBookIds || []);
    }
    const globalBooks = db.worldBooks.filter(wb => wb.isGlobal && !wb.disabled);
    const globalIds = globalBooks.map(wb => wb.id);
    const allBookIds = [...new Set([...associatedIds, ...globalIds])];
    const associatedWorldBooks = allBookIds.map(id => db.worldBooks.find(wb => wb.id === id)).filter(wb => wb && !wb.disabled);
    if (associatedWorldBooks.length > 0) {
        const worldBookContext = associatedWorldBooks.map(wb => `设定名: ${wb.name}\n内容: ${wb.content}`).join('\n\n');
        prompt += `\n为了更好地理解背景，请参考以下世界观设定：\n---\n${worldBookContext}\n---\n`;
    }
    if (char.myPersona) {
        prompt += `\n作为参考，我（用户）的人设是：${char.myPersona}\n`;
    }

    prompt += `最近，我（称呼为 ${char.myName}）和 ${char.realName} 的对话如下（这是你们关系和当前状态的核心参考）：\n---\n${mainChatContext}\n---\n`;
    prompt += `现在，我正在偷看Ta手机上的“${appName}”。请你基于Ta的人设和我们最近的聊天内容，生成符合该应用场景的、高度相关且富有沉浸感的内容。\n`;
    prompt += `你的输出必须是 XML 标签格式，且只包含 XML 内容，不要有任何额外的解释或标记。根据应用类型，XML 结构如下：\n`;

    const defaultRefreshCounts = { messages: { min: 3, max: 5 }, timeThoughts: { min: 3, max: 5 }, memos: { min: 3, max: 4 } };
    const getRefreshRange = (type) => {
        const d = defaultRefreshCounts[type];
        const c = char.peekScreenSettings?.refreshCounts?.[type] || d;
        return { min: Number.isFinite(c.min) ? c.min : d.min, max: Number.isFinite(c.max) ? c.max : d.max };
    };

    switch (appType) {
        case 'messages': {
            const { min: msgMin, max: msgMax } = getRefreshRange('messages');
            const impersonateEnabled = char.peekScreenSettings?.impersonateEnabled;
            if (impersonateEnabled) {
                prompt += `
            <result>
              <conversations>
                <conversation>
                  <partnerName>与Ta对话的人的称呼（如：小明、闺蜜阿琳）</partnerName>
                  <partnerPersona>此人的基础人设，30-80字：性格、身份、与${char.realName}的关系等</partnerPersona>
                  <partnerRelation>与${char.realName}的关系（如：同事、同学、闺蜜、前任、网友等）</partnerRelation>
                  <history>
                    <message>
                      <sender>char</sender>
                      <content>${char.realName}发送的消息内容</content>
                    </message>
                    <message>
                      <sender>partner</sender>
                      <content>对方发送的消息内容</content>
                    </message>
                  </history>
                </conversation>
              </conversations>
            </result>
            请为 ${char.realName} 编造${msgMin}-${msgMax}个最近的对话。每个对话必须包含 partnerName、partnerPersona、partnerRelation 和 history。对话内容需要强烈反映Ta的人设以及和我的聊天上下文。`;
            } else {
                prompt += `
            <result>
              <conversations>
                <conversation>
                  <partnerName>与Ta对话的人的称呼</partnerName>
                  <history>
                    <message>
                      <sender>char</sender>
                      <content>${char.realName}发送的消息内容</content>
                    </message>
                    <message>
                      <sender>partner</sender>
                      <content>对方发送的消息内容</content>
                    </message>
                  </history>
                </conversation>
              </conversations>
            </result>
           请为 ${char.realName} 编造${msgMin}-${msgMax}个最近的对话。对话内容需要强烈反映Ta的人设以及和我的聊天上下文。`;
            }
            break;
        }
        case 'steps':
            prompt += `
            <result>
              <currentSteps>8102</currentSteps>
              <trajectory>
                <entry>08:30 AM - 公司楼下咖啡馆</entry>
                <entry>10:00 AM - 宠物用品店</entry>
                <entry>12:00 PM - 附近日料店</entry>
                <entry>03:00 PM - 回家路上的甜品店</entry>
                <entry>04:00 PM - 楼下的便利店</entry>
                <entry>06:30 PM - 健身房</entry>
              </trajectory>
              <annotation>角色对自己今天运动情况的批注</annotation>
            </result>
            请为 ${char.realName} 生成今天的步数信息。你只需要生成Ta的当前步数(currentSteps)，Ta的6条运动轨迹(trajectory)（禁止照搬示例）以及批注(annotation)。内容需要与Ta的人设和我们的聊天上下文高度相关。`;
            break;
        case 'album':
            prompt += `
            <result>
              <photos>
                <photo>
                  <type>photo</type>
                  <imageDescription>对一张照片的详细文字描述，例如：一张傍晚在海边的自拍，背景是橙色的晚霞和归来的渔船。</imageDescription>
                  <description>角色对这张照片的一句话批注，例如：那天的风很舒服。</description>
                </photo>
                <photo>
                  <type>video</type>
                  <imageDescription>对一段视频的详细文字描述，例如：一段在猫咖撸猫的视频，视频里有一只橘猫在打哈欠。</imageDescription>
                  <description>角色对这段视频的一句话批注，例如：下次还来这里！</description>
                </photo>
              </photos>
            </result>
            请为 ${char.realName} 的相册生成5-8个条目（照片或视频）。内容需要与Ta的人设和我们的聊天上下文高度相关。'imageDescription' 是对这张照片/视频的详细文字描述，它将代替真实的图片展示给用户。'description' 是 ${char.realName} 自己对这张照片/视频的一句话批注，会显示在描述下方。`;
            break;
        case 'memos': {
            const { min: memoMin, max: memoMax } = getRefreshRange('memos');
            prompt += `
            <result>
              <memos>
                <memo>
                  <id>memo_1</id>
                  <title>备忘录标题</title>
                  <content>备忘录内容，可以包含换行符</content>
                </memo>
              </memos>
            </result>
            请生成${memoMin}-${memoMax}条备忘录，内容要与Ta的人设和我们的聊天上下文相关。`;
            break;
        }
        case 'cart':
            prompt += `
            <result>
              <items>
                <item>
                  <id>cart_1</id>
                  <title>商品标题</title>
                  <spec>商品规格</spec>
                  <price>25.00</price>
                </item>
              </items>
            </result>
            请生成3-4件商品，这些商品应该反映Ta的兴趣、需求或我们最近聊到的话题。`;
            break;
        case 'browser': {
            const browserDetailEnabled = char.peekScreenSettings?.browserDetailEnabled || false;
            const bWords = char.peekScreenSettings?.browserDetailWords || { min: 200, max: 500 };
            const wordMin = bWords.min || 200;
            const wordMax = bWords.max || 500;
            prompt += `
            <result>
              <history>
                <item>
                  <title>网页标题</title>
                  <url>example.com/path</url>
                  <annotation>角色对于这条浏览记录的想法或批注</annotation>${browserDetailEnabled ? `\n                  <detail><![CDATA[帖子/网页正文详情，${wordMin}-${wordMax}字]]></detail>` : ''}
                </item>
              </history>
            </result>
            请生成3-5条浏览记录。记录本身要符合Ta的人设和我们的聊天上下文，'annotation'字段则要站在角色自己的视角，记录Ta对这条浏览记录的想法或批注。${browserDetailEnabled ? `每条记录必须包含'detail'字段，是该网页/帖子的正文详情内容，每条详情${wordMin}到${wordMax}字，可使用HTML标签排版，并用 <![CDATA[ ]]> 包裹。` : ''}`;
            break;
        }
        case 'drafts':
            prompt += `
            <result>
              <draft>
                <to>${char.myName}</to>
                <content><![CDATA[一封写给我但未发送的草稿内容，可以使用HTML的<span class='strikethrough'></span>标签来表示划掉的文字。]]></content>
              </draft>
            </result>
            请生成一份Ta写给我但犹豫未决、未发送的草稿。内容要深刻、细腻，反映Ta的内心挣扎和与我的关系。草稿内容请用 <![CDATA[ ]]> 包裹。`;
            break;
       case 'transfer':
           prompt += `
           <result>
             <entries>
               <entry>要记得买牛奶。</entry>
               <entry>https://example.com/interesting-article</entry>
               <entry>刚刚那个想法不错，可以深入一下...</entry>
             </entries>
           </result>
           请为 ${char.realName} 生成4-7条Ta发送给自己的、简短零碎的消息。这些内容应该像是Ta的临时备忘、灵感闪现或随手保存的链接，要与Ta的人设和我们的聊天上下文相关，但比“备忘录”应用的内容更随意、更口语化。`;
           break;
        case 'timeThoughts': {
           const { min: thMin, max: thMax } = getRefreshRange('timeThoughts');
           const userPersonality = char.myPersona || '用户的性格和背景信息';
           const charPersonality = char.persona || '角色的性格';
           const diaryContext = char.diary && char.diary.length > 0 
               ? char.diary.slice(-5).map(d => d.content).join('\n') 
               : '';
           
           prompt += `

## 角色信息
- 角色：${char.realName}
- 角色设定：${charPersonality}

## 用户信息
- 用户名：${char.myName}
- 用户设定：${userPersonality}

## 你们的关系
- 最近对话内容：
${mainChatContext}

${diaryContext ? `- 长期记忆（日记总结）：\n${diaryContext}` : ''}

---

任务：想象如果你们在童年时期就认识，会是怎样的场景。请基于角色和用户的真实背景，生成${thMin}-${thMax}个不同年龄段的"时光想说"。

对于每个年龄段：
1. 选择一个具体年龄（如5岁、8岁、12岁等）- 根据人设灵活选择，不要固定
2. 描述那个年龄段的你（角色自己）是什么样的
3. 想象遇见那个年龄段的${char.myName}会怎样
4. 想对小时候的${char.myName}说什么
5. 想和小时候的${char.myName}做什么

要求：
- 基于角色的真实性格和成长背景
- 参考用户的童年背景信息
- 情感真挚，体现角色对用户的感情
- 可以有：羡慕、心疼、保护欲、想陪伴、想分享等
- 语气要自然，像是角色的真心话

返回 XML 标签格式：
<result>
  <thoughts>
    <thought>
      <userAge>5岁的你</userAge>
      <characterAge>6岁的我</characterAge>
      <title>如果遇见5岁的你</title>
      <characterSelfDescription>那时候的我...[详细描述角色自己那个年龄段的状态、性格、处境等，100-150字]</characterSelfDescription>
      <whatToSay>想对你说...[角色想对小时候用户说的话，50-100字]</whatToSay>
      <whatToDo>想和你...[想陪小时候用户做的事，50-80字]</whatToDo>
      <emotion>温柔</emotion>
    </thought>
  </thoughts>
</result>`;
           break;
       }
        case 'wallet': {
            let isOfflineNode = false;
            if (char.activeNodeId && char.nodes) {
                const activeNode = char.nodes.find(n => n.id === char.activeNodeId);
                if (activeNode) {
                    let baseMode = (activeNode.customConfig && activeNode.customConfig.baseMode) ? activeNode.customConfig.baseMode : 
                                   (activeNode.type === 'offline' || (activeNode.type === 'spinoff' && activeNode.spinoffMode === 'offline') ? 'offline' : 'online');
                    if (baseMode === 'offline') {
                        isOfflineNode = true;
                    }
                }
            }
            let associatedIds = char.worldBookIds || [];
            if (isOfflineNode) {
                associatedIds = (char.offlineWorldBookIds && char.offlineWorldBookIds.length > 0) ? char.offlineWorldBookIds : (char.worldBookIds || []);
            }
            const globalBooks = db.worldBooks.filter(wb => wb.isGlobal && !wb.disabled);
            const globalIds = globalBooks.map(wb => wb.id);
            const allBookIds = [...new Set([...associatedIds, ...globalIds])];
            const worldBooks = allBookIds.map(id => db.worldBooks.find(wb => wb.id === id)).filter(wb => wb && !wb.disabled);
            const worldBookText = worldBooks.length
                ? worldBooks.map(wb => `【${wb.name}】\n${wb.content}`).join('\n\n')
                : '无';
            const favoritedJournals = (char.memoryJournals || [])
                .filter(j => j.isFavorited)
                .map(j => `${j.title}\n${j.content}`)
                .join('\n\n---\n\n');
            const memoirText = favoritedJournals || '无';
            const realTransfers = extractTransfersFromHistory(char.history, char.realName, char.myName);
            let transferContext = '';
            if (realTransfers.income.length || realTransfers.expense.length) {
                transferContext = '【角色收到的转账/商城收入】\n';
                realTransfers.income.forEach(t => {
                    transferContext += `- ${t.amount}元，备注：${t.remark}${t.time ? '，时间：' + t.time : ''}\n`;
                });
                transferContext += '\n【角色发出的转账/商城代付等支出】\n';
                realTransfers.expense.forEach(t => {
                    transferContext += `- ${t.amount}元，备注：${t.remark}${t.time ? '，时间：' + t.time : ''}\n`;
                });
            } else {
                transferContext = '（暂无从聊天/记忆中解析到的转账或商城收支）';
            }
            prompt += `你正在模拟角色「${char.realName}」的钱包账单。请根据以下信息生成一份合理、有沉浸感的账单。

【角色人设】\n${(char.persona || '无').slice(0, 800)}\n
【用户人设】\n${(char.myPersona || '无').slice(0, 400)}\n
【世界书/背景】\n${worldBookText.slice(0, 1500)}\n
【长期记忆】\n${memoirText.slice(0, 1500)}\n
【近期对话】\n${mainChatContext}\n
【必须纳入账单的真实转账与商城/代付收支】\n${transferContext}\n

要求：1）上方真实转账与商城/代付收支必须全部出现在 income 或 expense 中，且 amount、remark 一致；2）可再根据人设与记忆补充其他收支项（如工资、购物、红包等）；3）只输出 XML 标签格式，不要 markdown 或解释。格式如下，每条记录含 amount、remark、time、source（填"聊天记录"或"人设生成"）：
<result>
  <summary>
    <balance>当前余额说明或数字</balance>
    <monthIncome>本月收入合计</monthIncome>
    <monthExpense>本月支出合计</monthExpense>
  </summary>
  <income>
    <item>
      <amount>...</amount>
      <remark>...</remark>
      <time>...</time>
      <source>...</source>
    </item>
  </income>
  <expense>
    <item>
      <amount>...</amount>
      <remark>...</remark>
      <time>...</time>
      <source>...</source>
    </item>
  </expense>
</result>`;
            break;
        }
        default:
            prompt += `<result><error>Unknown app type</error></result>`;
            break;
        case 'unlock': {
            const unlockCommentsEnabled = !!char.peekScreenSettings?.unlockCommentsEnabled;
            if (unlockCommentsEnabled) {
                prompt += `
            <result>
              <nickname>角色的微博昵称</nickname>
              <handle>@角色的微博ID</handle>
              <bio>角色的个性签名，可以包含换行符</bio>
              <posts>
                <post>
                  <id>post_1</id>
                  <timestamp>2小时前</timestamp>
                  <content>第一条微博正文内容，140字以内。</content>
                  <comments>
                    <comment>
                      <author>评论者昵称</author>
                      <content>评论内容</content>
                      <timestamp>1小时前</timestamp>
                    </comment>
                    <comment>
                      <author>角色昵称（与上方nickname一致）</author>
                      <content>角色本人回复上一条的内容</content>
                      <timestamp>50分钟前</timestamp>
                      <replyTo>评论者昵称</replyTo>
                    </comment>
                    <comment>
                      <author>路人或陌生人</author>
                      <content>可有1条陌生网友/路人评论</content>
                      <timestamp>30分钟前</timestamp>
                    </comment>
                  </comments>
                </post>
              </posts>
            </result>
            请为 ${char.realName} 生成一个符合其人设的微博小号。你需要生成：1）昵称、ID、个性签名；2）3-4条最近的微博。每条微博需要包含：微博正文（生活化、碎片化，符合小号的私密风格），以及3-5条评论。评论者构成：大部分（2-3条）是Ta的朋友、同事或熟人；可以有1-2条来自陌生网友/路人/粉丝的评论（语气更客气或疏远）。当角色本人（author 填与 nickname 相同的昵称）回复某条评论时，必须加上 "replyTo" 标签，这样界面会显示为「回复 @xxx」的引用样式。评论时间戳晚于帖子发布时间。所有内容与Ta的人设和我们的聊天上下文高度相关。`;
            } else {
                prompt += `
            <result>
              <nickname>角色的微博昵称</nickname>
              <handle>@角色的微博ID</handle>
              <bio>角色的个性签名，可以包含换行符</bio>
              <posts>
                <post>
                  <timestamp>2小时前</timestamp>
                  <content>第一条微博正文内容，140字以内。</content>
                </post>
                <post>
                  <timestamp>昨天</timestamp>
                  <content>第二条微博正文内容。</content>
                </post>
                <post>
                  <timestamp>3天前</timestamp>
                  <content>第三条微博正文内容。</content>
                </post>
              </posts>
            </result>
            请为 ${char.realName} 生成一个符合其人设的微博小号。你需要生成昵称、ID、个性签名，以及3-4条最近的微博。微博内容要生活化、碎片化，符合小号的风格，并与Ta的人设和我们的聊天上下文高度相关。`;
            }
            break;
        }
    }
    return prompt;
}

async function generateAndRenderPeekContent(appType, options = {}) {
    const { forceRefresh = false } = options;

    if (generatingPeekApps.has(appType)) {
        showToast('该应用内容正在生成中，请稍候...');
        return;
    }

    const char = db.characters.find(c => c.id === currentChatId);
    if (!char) return showToast('无法找到当前角色');
    
    if (!char.peekData) char.peekData = {};

    if (!forceRefresh && char.peekData[appType]) {
        const cachedData = char.peekData[appType];
        switch (appType) {
            case 'messages':
                renderPeekChatList(cachedData.conversations);
                switchScreen('peek-messages-screen');
                break;
            case 'album':
                renderPeekAlbum(cachedData.photos);
                switchScreen('peek-album-screen');
                break;
            case 'memos':
                renderMemosList(cachedData.memos);
                switchScreen('peek-memos-screen');
                break;
           case 'transfer':
               renderPeekTransferStation(cachedData.entries);
               switchScreen('peek-transfer-station-screen');
               break;
            case 'cart':
                renderPeekCart(cachedData.items);
                switchScreen('peek-cart-screen');
                break;
            case 'browser':
                renderPeekBrowser(cachedData.history);
                switchScreen('peek-browser-screen');
                break;
            case 'drafts':
                renderPeekDrafts(cachedData.draft);
                switchScreen('peek-drafts-screen');
                break;
           case 'steps':
              renderPeekSteps(cachedData);
              switchScreen('peek-steps-screen');
              break;
           case 'timeThoughts':
               renderPeekTimeThoughts(cachedData);
               switchScreen('peek-time-thoughts-screen');
               break;
           case 'unlock':
               renderPeekUnlock(cachedData);
               switchScreen('peek-unlock-screen');
               break;
           case 'wallet':
               renderPeekWallet(cachedData);
               switchScreen('peek-wallet-screen');
               break;
       }
       recordPeekViewedByUser(char, appType);
       await saveData();
       return;
    }

    let apiConfig = db.apiSettings;
    if (db.peekApiSettings && db.peekApiSettings.url && db.peekApiSettings.key && db.peekApiSettings.model) {
        apiConfig = db.peekApiSettings;
    }
    let { url, key, model, provider } = apiConfig;
    if (!url || !key || !model) {
        showToast('请先在“api”应用中完成设置！');
        return switchScreen('api-settings-screen');
    }

    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }

    generatingPeekApps.add(appType); 
    let targetContainer;

    switch (appType) {
        case 'messages':
            switchScreen('peek-messages-screen');
            targetContainer = document.getElementById('peek-chat-list-container');
            targetContainer.innerHTML = '<p class="placeholder-text">正在生成对话列表...</p>';
            break;
        case 'album':
            switchScreen('peek-album-screen');
            renderPeekAlbum([]); 
            break;
        case 'memos':
            switchScreen('peek-memos-screen');
            renderMemosList([]); 
            break;
       case 'transfer':
           switchScreen('peek-transfer-station-screen');
           renderPeekTransferStation([]);
           break;
        case 'cart':
            switchScreen('peek-cart-screen');
            renderPeekCart([]);
            break;
        case 'browser':
            switchScreen('peek-browser-screen');
            renderPeekBrowser([]);
            break;
        case 'drafts':
            switchScreen('peek-drafts-screen');
            renderPeekDrafts(null);
            break;
        case 'steps':
            switchScreen('peek-steps-screen');
            renderPeekSteps(null); 
            break;
       case 'timeThoughts':
           switchScreen('peek-time-thoughts-screen');
           renderPeekTimeThoughts(null);
           break;
       case 'unlock':
           switchScreen('peek-unlock-screen');
           renderPeekUnlock(null);
           break;
       case 'wallet':
           switchScreen('peek-wallet-screen');
           renderPeekWallet(null);
           break;
       default:
           showToast('无法打开');
           generatingPeekApps.delete(appType); 
           return;
   }

    try {
        let historySlice = char.history.slice(-10);
        historySlice = filterHistoryForAI(char, historySlice);
        const mainChatContext = historySlice.map(m => m.content).join('\n');

        const systemPrompt = generatePeekContentPrompt(char, appType, mainChatContext);
        
        const requestBody = {
            model: model,
            messages: [{ role: 'user', content: systemPrompt }],
            temperature: 0.8,
            top_p: 0.9,
        };

        const endpoint = `${url}/v1/chat/completions`;
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };

        const contentStr = await fetchAiResponse(apiConfig, requestBody, headers, endpoint);
        
        const generatedData = parseXmlToJson(contentStr);

        let isValid = false;
        switch (appType) {
            case 'messages': isValid = generatedData && Array.isArray(generatedData.conversations); break;
            case 'memos': isValid = generatedData && Array.isArray(generatedData.memos); break;
            case 'album': isValid = generatedData && Array.isArray(generatedData.photos); break;
            case 'cart': isValid = generatedData && Array.isArray(generatedData.items); break;
            case 'transfer': isValid = generatedData && Array.isArray(generatedData.entries); break;
            case 'browser': isValid = generatedData && Array.isArray(generatedData.history); break;
            case 'drafts': isValid = generatedData && generatedData.draft; break;
            case 'steps': isValid = generatedData && generatedData.currentSteps !== undefined; break;
            case 'timeThoughts': isValid = generatedData && Array.isArray(generatedData.thoughts); break;
            case 'unlock': isValid = generatedData && generatedData.nickname && Array.isArray(generatedData.posts); break;
            case 'wallet': isValid = generatedData && Array.isArray(generatedData.income) && Array.isArray(generatedData.expense) && generatedData.summary; break;
            default: isValid = false;
        }

        if (!isValid) {
            throw new Error("AI返回的数据格式不符合应用要求。");
        }

        if (appType === 'messages' && Array.isArray(generatedData.conversations)) {
            generatedData.conversations.forEach((conv, idx) => {
                if (!conv.partnerId) conv.partnerId = 'peek_npc_' + Date.now() + '_' + idx;
                if (typeof conv.suspicionLevel !== 'number') conv.suspicionLevel = 0;
                if (typeof conv.isFriend !== 'boolean') conv.isFriend = false;
                if (typeof conv.friendRequestPending !== 'boolean') conv.friendRequestPending = false;
                if (!conv.supplementPersona) conv.supplementPersona = '';
                if (!conv.partnerPersona) conv.partnerPersona = '';
                if (!conv.partnerRelation) conv.partnerRelation = '熟人';
                conv.history = conv.history || [];
            });
        }

        char.peekData[appType] = generatedData;
        recordPeekViewedByUser(char, appType);
        await saveData(); 

        if (appType === 'messages') {
            renderPeekChatList(generatedData.conversations);
        } else if (appType === 'memos') {
            renderMemosList(generatedData.memos);
        } else if (appType === 'album') {
            renderPeekAlbum(generatedData.photos);
        } else if (appType === 'transfer') {
           renderPeekTransferStation(generatedData.entries);
        } else if (appType === 'cart') {
            renderPeekCart(generatedData.items);
        } else if (appType === 'browser') {
            renderPeekBrowser(generatedData.history);
        } else if (appType === 'drafts') {
            renderPeekDrafts(generatedData.draft);
        } else if (appType === 'steps') {
            renderPeekSteps(generatedData);
        } else if (appType === 'timeThoughts') {
            renderPeekTimeThoughts(generatedData);
        } else if (appType === 'unlock') {
            renderPeekUnlock(generatedData);
        } else if (appType === 'wallet') {
            renderPeekWallet(generatedData);
        }

    } catch (error) {
        showApiError(error);
        const errorMessage = "内容生成失败，请刷新重试。";
        if (appType === 'album') {
            document.querySelector('#peek-album-screen .album-grid').innerHTML = `<p class="placeholder-text">${errorMessage}</p>`;
        } else if (appType === 'unlock') {
            document.getElementById('peek-unlock-screen').innerHTML = `<header class="app-header"><button class="back-btn" data-target="peek-screen">‹</button><div class="title-container"><h1 class="title">错误</h1></div><button class="action-btn">···</button></header><main class="content"><p class="placeholder-text">${errorMessage}</p></main>`;
        } else if (appType === 'wallet') {
            const sw = document.getElementById('peek-wallet-screen');
            if (sw) sw.innerHTML = `<header class="app-header"><button class="back-btn" data-target="peek-screen">‹</button><div class="title-container"><h1 class="title">钱包</h1></div><button class="action-btn">···</button></header><main class="content wallet-content"><p class="placeholder-text">${errorMessage}</p></main>`;
        } else if (targetContainer) {
            targetContainer.innerHTML = `<p class="placeholder-text">${errorMessage}</p>`;
        }
    } finally {
        generatingPeekApps.delete(appType); 
    }
}
