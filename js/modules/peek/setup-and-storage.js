// --- 偷看手机功能 (js/modules/peek.js) ---

function getPeekResponseFormat(character) {
    return character?.peekScreenSettings?.responseFormat === 'json' ? 'json' : 'xml';
}

function parsePeekResponse(content, format) {
    if (format !== 'json') return parseXmlToJson(content);
    if (typeof content !== 'string' || !content.trim()) {
        throw new Error('AI 没有返回可解析的正文，请手动刷新。');
    }

    const source = content.trim();
    const fenced = source.match(/^\s*```json[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```[ \t]*$/im);
    // 旧版也允许 JSON 对象前后带少量说明文字。
    const jsonText = fenced?.[1] ?? (/^[\[<]/.test(source) ? source : source.match(/\{[\s\S]*\}/)?.[0]);
    try {
        const parsed = JSON.parse(jsonText);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
        // 用统一的错误提示，避免把角色正文写到报错里。
    }
    throw new Error('JSON 解析错误：AI 返回的内容不是有效的 JSON 对象，请手动刷新。');
}

function parseXmlToJson(xmlString) {
    if (typeof xmlString !== 'string' || !xmlString.trim()) {
        throw new Error('AI 没有返回可解析的正文，请手动刷新。');
    }

    const source = xmlString.trim();
    const fenced = source.match(/^```(?:xml)?[ \t]*\r?\n([\s\S]*?)\r?\n?```$/i);
    let xmlContent = fenced ? fenced[1] : source;
    let resultStart = -1;
    let resultDepth = 0;
    // CDATA、注释和处理指令里的标签只是内容，不能作为结果的边界。
    const resultTags = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<result\s*>|<\/result\s*>/gi;
    for (const tag of xmlContent.matchAll(resultTags)) {
        if (/^<result/i.test(tag[0])) {
            if (resultDepth++ === 0) resultStart = tag.index;
        } else if (/^<\/result/i.test(tag[0]) && resultDepth > 0 && --resultDepth === 0) {
            xmlContent = xmlContent.slice(resultStart, tag.index + tag[0].length);
            break;
        }
    }
    if (resultDepth > 0) throw new Error('XML 解析错误：AI 返回的 XML 内容不完整，请手动刷新。');

    const parser = new DOMParser();
    let xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
    if (xmlDoc.getElementsByTagName('parsererror').length) {
        // 仅转义文本节点中裸露的 &，保留标签、实体及 CDATA 原文。
        const fixed = xmlContent.replace(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(?:[^<>"']|"[^"]*"|'[^']*')*>|[^<]+/g, part =>
            part.startsWith('<') ? part : part.replace(/&(?!(?:#\d+|#x[\da-fA-F]+|[\w:.-]+);)/g, '&amp;'));
        if (fixed !== xmlContent) xmlDoc = parser.parseFromString(fixed, 'text/xml');
        if (resultStart === -1 && xmlDoc.getElementsByTagName('parsererror').length) {
            // 接受省略外层 <result> 的完整 XML 字段。根节点间的说明文字仍视为格式错误。
            const wrapped = parser.parseFromString(`<result>${fixed}</result>`, 'text/xml');
            if (!wrapped.getElementsByTagName('parsererror').length && wrapped.documentElement.children.length > 1 &&
                Array.from(wrapped.documentElement.childNodes).every(node => node.nodeType === Node.ELEMENT_NODE ||
                    node.nodeType === Node.COMMENT_NODE || (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()))) {
                xmlDoc = wrapped;
            }
        }
        if (xmlDoc.getElementsByTagName('parsererror').length) {
            throw new Error('XML 解析错误：AI 返回的内容无法解析为有效 XML，请手动刷新。');
        }
    }

    function parseNode(node) {
        if (!node.children.length) {
            const text = node.textContent.trim();
            if (text === 'true') return true;
            if (text === 'false') return false;
            if (!isNaN(text) && text !== '') return Number(text);
            return text;
        }

        const obj = {};
        const repeated = new Set();
        for (const child of node.children) {
            const name = child.nodeName;
            if (name === '__proto__') continue;
            const value = parseNode(child);
            if (repeated.has(name)) obj[name].push(value);
            else if (Object.hasOwn(obj, name)) {
                obj[name] = [obj[name], value];
                repeated.add(name);
            } else obj[name] = value;
        }

        const listKeys = ['item', 'entry', 'photo', 'memo', 'thought', 'post', 'conversation', 'reply', 'message', 'comment'];
        for (const [key, value] of Object.entries(obj)) {
            if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
            const subKeys = Object.keys(value);
            if (subKeys.length !== 1) continue;
            const subKey = subKeys[0];
            if (key.endsWith('s') || listKeys.includes(subKey) || key === 'history' || key === 'trajectory') {
                obj[key] = Array.isArray(value[subKey]) ? value[subKey] : [value[subKey]];
            }
        }
        return obj;
    }

    const result = parseNode(xmlDoc.documentElement);
    return xmlDoc.documentElement.nodeName.toLowerCase() === 'result' ? result : { [xmlDoc.documentElement.nodeName]: result };
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

    document.getElementById('clear-peek-data-btn')?.addEventListener('click', () => {
        const ordersOption = document.getElementById('peek-clear-real-orders');
        if (ordersOption) ordersOption.checked = true;
        document.getElementById('peek-clear-modal')?.classList.add('visible');
    });
    document.getElementById('peek-clear-cancel')?.addEventListener('click', () => {
        document.getElementById('peek-clear-modal')?.classList.remove('visible');
    });
    document.getElementById('peek-clear-confirm')?.addEventListener('click', async () => {
        const char = db.characters.find(c => c.id === currentChatId);
        if (!char) return;
        const clearOrders = !!document.getElementById('peek-clear-real-orders')?.checked;
        const result = await clearPeekStoredData(char, null, clearOrders);
        if (!result) return;
        document.getElementById('peek-clear-modal')?.classList.remove('visible');
        showToast(clearOrders ? '查手机数据和角色真实订单已清空' : '查手机生成内容已清空');
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

    const contextSettings = document.getElementById('peek-chat-context-settings');
    contextSettings.addEventListener('change', e => {
        const selectAll = contextSettings.querySelector('.peek-context-all input');
        if (e.target === selectAll) {
            contextSettings.querySelectorAll('.peek-context-apps input').forEach(input => {
                input.checked = selectAll.checked;
            });
        }
        updatePeekContextSelection(contextSettings);
    });

    document.getElementById('save-peek-settings-btn')?.addEventListener('click', async e => {
        const character = db.characters.find(c => c.id === currentChatId);
        if (!character) {
            showToast('错误：未找到当前角色');
            return;
        }

        const contextInput = contextSettings.querySelector('input[type="number"]');
        const contextLimit = contextInput.valueAsNumber;
        if (!Number.isSafeInteger(contextLimit) || contextLimit < 1) {
            showToast('聊天记录条数请输入大于 0 的整数');
            contextSettings.open = true;
            contextInput.focus();
            return;
        }
        const contextApps = Array.from(contextSettings.querySelectorAll('.peek-context-apps input:checked'), input => input.value);

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

        const settings = character.peekScreenSettings;
        const previousContext = settings.chatContext;
        const previousFormat = settings.responseFormat;
        const saveButton = e.currentTarget;
        saveButton.disabled = true;
        settings.chatContext = { limit: contextLimit, apps: contextApps };
        settings.responseFormat = document.getElementById('peek-response-format').value === 'json' ? 'json' : 'xml';
        try {
            if (await saveData() === false) {
                if (previousContext === undefined) delete settings.chatContext;
                else settings.chatContext = previousContext;
                if (previousFormat === undefined) delete settings.responseFormat;
                else settings.responseFormat = previousFormat;
                return;
            }
        } finally {
            saveButton.disabled = false;
        }
        renderPeekScreen(); 
        showToast('已保存！');
        peekWallpaperModal.classList.remove('visible');
    });

    peekWallpaperModal.addEventListener('click', (e) => {
        const header = e.target.closest('.collapsible-header:not(summary)');
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
                const conversation = cachedData.conversations.find(c => chatItem.dataset.partnerId ? c.partnerId === chatItem.dataset.partnerId : c.partnerName === partnerName);
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
        const ordersOption = document.getElementById('peek-manage-clear-real-orders');
        if (ordersOption) ordersOption.checked = true;
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
    const failedApps = [];
    const refreshButton = document.getElementById('refresh-all-peek-apps-btn');
    if (refreshButton) refreshButton.disabled = true;

    try {
        for (let i = 0; i < allAppIds.length; i++) {
            const appId = allAppIds[i];
            const appName = peekScreenApps[appId].name;

            showToast(`正在刷新 ${appName}… (${i + 1}/${allAppIds.length})`);

            try {
                const updated = await generateAndRenderPeekContent(appId, {
                    forceRefresh: true, background: true, characterId: char.id
                });
                if (updated) successCount++;
                else failedApps.push(appName);
            } catch (error) {
                console.error(`刷新 ${appName} 失败:`, error);
                failedApps.push(appName);
            }
            if (i < allAppIds.length - 1) await new Promise(resolve => setTimeout(resolve, 500));
        }
    } finally {
        if (refreshButton) refreshButton.disabled = false;
    }

    if (failedApps.length === 0) {
        showToast(`✓ 全部刷新完成！已更新 ${successCount} 个应用`);
    } else {
        showToast(`刷新完成，成功 ${successCount} 个，失败 ${failedApps.length} 个（${failedApps.join('、')}）。`);
    }

    if (currentChatId === char.id) renderPeekScreen();
}

function getPeekRealOrderIds(char) {
    const ids = new Set();
    (db.piggyBank?.orders || []).forEach(order => {
        if (order.buyerType === 'character' && order.buyerId === char.id && order.id) ids.add(order.id);
    });
    (char.walletLedger?.transactions || []).forEach(item => {
        if (item.source === 'shop' && item.eventId) ids.add(item.eventId);
    });
    (db.piggyBank?.familyCards || []).forEach(card => {
        if (card.targetCharId !== char.id) return;
        (card.transactions || []).forEach(item => {
            if (typeof item.eventId === 'string' && item.eventId.startsWith('order_')) ids.add(item.eventId);
        });
    });
    return ids;
}

function peekBilingualText(text, originalHtml) {
    const character = (db.characters || []).find(item => item.id === currentChatId);
    return character && typeof BilingualContent !== 'undefined' ? BilingualContent.html(text, character, 'peek', 'peek', originalHtml == null ? {} : { originalHtml }) : originalHtml ?? peekEscapeHtml(text).replace(/\n/g, '<br>');
}

function peekConversationMessageHtml(message, character, text = message?.content) {
    const originalHtml = peekEscapeHtml(text).replace(/\n/g, '<br>');
    if (!message || message.isImpersonated || typeof BilingualContent === 'undefined') return originalHtml;
    const peekSpeaker = message.sender === 'char' ? 'char' : 'partner';
    return BilingualContent.html(text, character, 'peek', 'peek', { originalHtml, peekSpeaker });
}

function hasPeekRealOrders(char) {
    return getPeekRealOrderIds(char).size > 0
        || (char.walletLedger?.transactions || []).some(item => item.source === 'shop');
}

const peekClearRevisions = new Map();
function getPeekClearRevision(charId, appId) {
    return peekClearRevisions.get(`${charId}:${appId}`) || 0;
}

let peekClearInProgress = false;
async function clearPeekStoredData(char, appIds, clearOrders) {
    return window.PeekMemory
        ? window.PeekMemory.serialize(char, () => clearPeekStoredDataImpl(char, appIds, clearOrders))
        : clearPeekStoredDataImpl(char, appIds, clearOrders);
}

async function clearPeekStoredDataImpl(char, appIds, clearOrders) {
    if (peekClearInProgress) return false;
    peekClearInProgress = true;
    const previous = {
        peekData: char.peekData,
        peekViewedByUser: char.peekViewedByUser,
        lastPeekViewedAt: char.lastPeekViewedAt,
        walletLedger: char.walletLedger ? JSON.parse(JSON.stringify(char.walletLedger)) : char.walletLedger,
        piggyBank: clearOrders && db.piggyBank ? JSON.parse(JSON.stringify(db.piggyBank)) : db.piggyBank
    };
    const markedMessages = [];
    const undoMemory = window.PeekMemory?.clearFields(char, appIds);
    try {
        (appIds === null ? Object.keys(peekScreenApps) : appIds).forEach(appId => {
            const key = `${char.id}:${appId}`;
            peekClearRevisions.set(key, getPeekClearRevision(char.id, appId) + 1);
        });
        if (appIds === null) {
            char.peekData = {};
            char.peekViewedByUser = [];
            char.lastPeekViewedAt = undefined;
        } else {
            char.peekData = { ...(char.peekData || {}) };
            appIds.forEach(appId => { delete char.peekData[appId]; });
            char.peekViewedByUser = (char.peekViewedByUser || []).filter(entry => !appIds.includes(entry.appId));
        }

        if (clearOrders) {
            const orderIds = getPeekRealOrderIds(char);
            if (Array.isArray(db.piggyBank?.orders)) {
                db.piggyBank.orders = db.piggyBank.orders.filter(order => !(order.buyerType === 'character' && order.buyerId === char.id));
            }
            if (Array.isArray(char.walletLedger?.transactions)) {
                char.walletLedger.transactions = char.walletLedger.transactions.filter(item => item.source !== 'shop' && !orderIds.has(item.eventId));
            }
            (db.piggyBank?.familyCards || []).forEach(card => {
                if (card.targetCharId === char.id && Array.isArray(card.transactions)) {
                    card.transactions = card.transactions.filter(item => !orderIds.has(item.eventId));
                }
            });
            (char.history || []).forEach(message => {
                if (message.shopOrderId && !message.peekWalletOrderCleared) {
                    message.peekWalletOrderCleared = true;
                    markedMessages.push(message);
                }
            });
        }

        const saved = clearOrders ? await persistWalletState([char.id]) : await saveCharacter(char.id);
        if (!saved) throw new Error('数据保存失败');
        return true;
    } catch (error) {
        undoMemory?.();
        char.peekData = previous.peekData;
        char.peekViewedByUser = previous.peekViewedByUser;
        char.lastPeekViewedAt = previous.lastPeekViewedAt;
        char.walletLedger = previous.walletLedger;
        if (clearOrders) db.piggyBank = previous.piggyBank;
        markedMessages.forEach(message => { delete message.peekWalletOrderCleared; });
        showToast('清空失败，请重试');
        console.error('[Peek] 清空数据失败:', error);
        return false;
    } finally {
        peekClearInProgress = false;
    }
}

function renderPeekDataManagement() {
    const char = db.characters.find(c => c.id === currentChatId);
    const peekDataList = document.getElementById('peek-data-list');
    if (!peekDataList) return;

    if (!char) return;
    const appIds = Object.keys(char.peekData || {});
    if (!appIds.includes('wallet') && hasPeekRealOrders(char)) appIds.push('wallet');
    if (appIds.length === 0) {
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

    appIds.forEach(appId => {
        const appName = (peekScreenApps[appId] && peekScreenApps[appId].name) ? peekScreenApps[appId].name : appId;
        const status = char.peekData?.[appId] ? '已有数据' : '仅有真实订单';
        html += `
            <label class="peek-data-item" style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: 4px;">
                <input type="checkbox" class="peek-data-checkbox" data-app-id="${peekEscapeHtml(appId)}" style="width: auto;">
                <span>${peekEscapeHtml(appName)} <span style="color: #999; font-size: 12px;">(${status})</span></span>
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
    if (!char) return;

    const selectedCheckboxes = document.querySelectorAll('.peek-data-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        showToast('请至少选择一个应用');
        return;
    }

    const appNames = Array.from(selectedCheckboxes).map(cb => {
        const appId = cb.dataset.appId;
        return (peekScreenApps[appId] && peekScreenApps[appId].name) ? peekScreenApps[appId].name : appId;
    }).join('、');
    const appIds = Array.from(selectedCheckboxes, cb => cb.dataset.appId);
    const clearOrders = appIds.includes('wallet') && !!document.getElementById('peek-manage-clear-real-orders')?.checked;

    if (!confirm('确定要删除以下应用的数据吗？\n\n' + appNames
        + (clearOrders ? '\n同时清除该角色的真实商城订单；已消费金额不会退回。' : '')
        + '\n\n删除后下次点击将重新生成。')) {
        return;
    }

    if (!await clearPeekStoredData(char, appIds, clearOrders)) return;
    showToast(clearOrders ? '已删除选中数据和角色真实订单' : '已删除 ' + selectedCheckboxes.length + ' 个应用的数据');

    renderPeekDataManagement();

    if (Object.keys(char.peekData || {}).length === 0 && !hasPeekRealOrders(char)) {
        document.getElementById('peek-data-management-modal').classList.remove('visible');
    }
}

async function deleteAllPeekData() {
    const char = db.characters.find(c => c.id === currentChatId);
    const clearOrders = !!document.getElementById('peek-manage-clear-real-orders')?.checked;
    if (!char || (Object.keys(char.peekData || {}).length === 0 && !(clearOrders && hasPeekRealOrders(char)))) {
        showToast('没有可删除的数据');
        return;
    }

    const appCount = Object.keys(char.peekData || {}).length;

    if (!confirm('确定要删除所有 ' + appCount + ' 个应用的偷看数据吗？'
        + (clearOrders ? '\n同时清除该角色的真实商城订单；已消费金额不会退回。' : '')
        + '\n\n删除后下次点击应用时将重新生成。')) {
        return;
    }

    if (!await clearPeekStoredData(char, null, clearOrders)) return;
    showToast(clearOrders ? '已清空偷看数据和角色真实订单' : '已清空所有偷看数据');

    document.getElementById('peek-data-management-modal').classList.remove('visible');
}

function updatePeekContextSelection(settings) {
    const total = settings.querySelectorAll('.peek-context-apps input').length;
    const selected = settings.querySelectorAll('.peek-context-apps input:checked').length;
    const selectAll = settings.querySelector('.peek-context-all input');
    selectAll.checked = total > 0 && selected === total;
    selectAll.indeterminate = selected > 0 && selected < total;
    settings.querySelector('.peek-context-count').textContent = `已选 ${selected}/${total}`;
}

function renderPeekSettings() {
    const character = db.characters.find(c => c.id === currentChatId);
    const peekSettings = character?.peekScreenSettings || { wallpaper: '', customIcons: {}, unlockAvatar: '', unlockCommentsEnabled: false, charAwarePeek: false, impersonateEnabled: false, refreshCounts: {} };
    document.getElementById('peek-response-format').value = getPeekResponseFormat(character);

    const contextSettings = document.getElementById('peek-chat-context-settings');
    const { limit, apps } = peekSettings.chatContext || {};
    contextSettings.querySelector('input[type="number"]').value = Number.isSafeInteger(limit) && limit > 0 ? limit : 10;
    const selectedApps = Array.isArray(apps) ? apps : ['messages'];
    contextSettings.querySelector('.peek-context-apps').innerHTML = Object.entries(peekScreenApps).map(([id, app]) =>
        `<label class="peek-context-app"><input type="checkbox" value="${id}"${selectedApps.includes(id) ? ' checked' : ''}><span>${peekEscapeHtml(app.name)}</span></label>`
    ).join('');
    updatePeekContextSelection(contextSettings);

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
    const previous = char.peekViewedByUser[idx];
    const previousTime = char.lastPeekViewedAt;
    const entry = { appId: appType, appName, content: JSON.parse(JSON.stringify(content)) };
    if (idx >= 0) char.peekViewedByUser[idx] = entry;
    else char.peekViewedByUser.push(entry);
    const viewedAt = Date.now();
    char.lastPeekViewedAt = viewedAt;
    return () => {
        const index = char.peekViewedByUser?.indexOf(entry) ?? -1;
        if (index < 0) return;
        if (previous) char.peekViewedByUser[index] = previous;
        else char.peekViewedByUser.splice(index, 1);
        if (char.lastPeekViewedAt === viewedAt) char.lastPeekViewedAt = previousTime;
    };
}

