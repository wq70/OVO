// --- 存储分析 (js/modules/storage.js) ---

// 控制台日志缓冲，供存储分析页控制台查看
(function initStorageConsoleBuffer() {
    window.__storageConsoleLogs = window.__storageConsoleLogs || [];
    var maxLogs = 500;
    var maxLogLength = 2000;
    function pushLog(type, args, source) {
        var msg = Array.prototype.map.call(args, function (x) {
            if (x === null) return 'null';
            if (x === undefined) return 'undefined';
            if (x instanceof Error) return (x.stack || x.message || String(x)).slice(0, maxLogLength);
            if (typeof x === 'object') try {
                var seen = new WeakSet();
                return JSON.stringify(x, function (_, value) {
                    if (value && typeof value === 'object') {
                        if (seen.has(value)) return '[Circular]';
                        seen.add(value);
                    }
                    return typeof value === 'string' && value.length > maxLogLength
                        ? value.slice(0, maxLogLength) + '…' : value;
                }).slice(0, maxLogLength);
            } catch (e) { return String(x); }
            return String(x).slice(0, maxLogLength);
        }).join(' ').slice(0, maxLogLength);
        var details = Array.prototype.map.call(args, function (value) {
            if (value instanceof Error) return value.stack || value.message;
            if (!value || typeof value !== 'object') return '';
            try {
                var seen = new WeakSet();
                return JSON.stringify(value, function (_, child) {
                    if (child && typeof child === 'object') {
                        if (seen.has(child)) return '[Circular]';
                        seen.add(child);
                    }
                    return child;
                }, 2).slice(0, 4000);
            } catch (error) { return String(value); }
        }).filter(Boolean).join('\n').slice(0, 4000);
        window.__storageConsoleLogs.push({ type: type, text: msg, details: details, source: source || '', time: new Date().toLocaleTimeString('zh-CN', { hour12: false }) });
        if (window.__storageConsoleLogs.length > maxLogs) window.__storageConsoleLogs.shift();
        if (typeof window.__storageConsoleOnLog === 'function') window.__storageConsoleOnLog();
    }
    ['log', 'info', 'debug', 'warn', 'error'].forEach(function (type) {
        var original = console[type];
        console[type] = function () {
            var source = (new Error().stack || '').split('\n')[2] || '';
            pushLog(type, arguments, source.trim());
            original.apply(console, arguments);
        };
    });
    window.addEventListener('error', function (event) {
        if (event.target !== window) return;
        pushLog('error', [event.error || event.message], [event.filename, event.lineno, event.colno].filter(Boolean).join(':'));
    });
    window.addEventListener('unhandledrejection', function (event) {
        pushLog('error', ['未处理的 Promise 拒绝:', event.reason]);
    });
    window.__storageConsoleAddLog = pushLog;
})();

// 与存储分析的内容占用口径一致，按字段估算，不复制大段消息文本。
function estimateLegacyStorageValue(root) {
    const stack = [root];
    const seen = new Set();
    let size = 0;
    while (stack.length) {
        const value = stack.pop();
        if (value == null) size += 4;
        else if (typeof value === 'string') size += value.length + 2;
        else if (typeof value === 'number' || typeof value === 'boolean') size += String(value).length;
        else if (typeof value === 'object') {
            if (seen.has(value)) continue;
            seen.add(value);
            size += 2;
            if (Array.isArray(value)) {
                size += Math.max(0, value.length - 1);
                for (const item of value) stack.push(item);
            } else {
                const entries = Object.entries(value);
                size += Math.max(0, entries.length - 1);
                for (const [key, item] of entries) {
                    size += key.length + 3;
                    stack.push(item);
                }
            }
        }
    }
    return size;
}

async function analyzeLegacyChatStorage(collections, onProgress) {
    const fieldLabels = {
        content: '消息正文', parts: '消息附加内容', stickerData: '表情包数据',
        _regenVersions: '重说旧版本', _imageVersions: '生图旧版本',
        novelAiImageUrl: '生图图片', imageGenerationMeta: '生图原图与信息', other: '其他字段'
    };
    const fields = Object.fromEntries(Object.keys(fieldLabels).map(key => [key, 0]));
    const otherFields = Object.create(null);
    const partTypes = { text: 0, image: 0, sticker: 0, other: 0 };
    const largestChats = [];
    const largestMessages = [];
    const chats = collections.flatMap(([items, type]) => (items || []).map(chat => ({ chat, type })));
    const report = { chats: chats.length, messages: 0, size: 0, cleanableCopies: 0,
        cleanableSize: 0, retainedCopies: 0, retainedSize: 0, fields, otherFields, partTypes, largestChats, largestMessages };
    const keepLargest = (list, item) => {
        list.push(item);
        list.sort((a, b) => b.size - a.size);
        if (list.length > 5) list.pop();
    };
    let scanned = 0;
    for (const { chat, type } of chats) {
        let chatSize = 0;
        const chatFields = Object.fromEntries(Object.keys(fieldLabels).map(key => [key, 0]));
        const history = Array.isArray(chat?.history) ? chat.history : [];
        for (let index = 0; index < history.length; index++) {
            const message = history[index];
            if (!message || typeof message !== 'object') continue;
            let messageSize = 2;
            let biggestField = 'other';
            let biggestSize = 0;
            for (const [key, value] of Object.entries(message)) {
                const field = Object.hasOwn(fieldLabels, key) ? key : 'other';
                const size = key.length + 3 + estimateLegacyStorageValue(value);
                fields[field] += size;
                chatFields[field] += size;
                if (field === 'other') otherFields[key] = (otherFields[key] || 0) + size;
                if (key === 'parts' && Array.isArray(value)) {
                    for (const part of value) {
                        const type = part?.type === 'text' || part?.type === 'image' || part?.type === 'sticker' ? part.type : 'other';
                        partTypes[type] += estimateLegacyStorageValue(part);
                    }
                }
                messageSize += size;
                if (size > biggestSize) { biggestSize = size; biggestField = field === 'other' ? key : field; }
            }
            chatSize += messageSize;
            report.messages++;
            keepLargest(largestMessages, { name: chat.remarkName || chat.realName || chat.name || '未命名会话',
                index: index + 1, size: messageSize, field: fieldLabels[biggestField] || biggestField });

            const parts = Array.isArray(message.parts) ? message.parts : [];
            const imagePart = parts.find(part => part?.type === 'image' && typeof part.data === 'string');
            if (imagePart && typeof message.content === 'string'
                && message.content.startsWith('data:image/') && message.content === imagePart.data) {
                report.cleanableCopies++;
                report.cleanableSize += message.content.length;
            }
            if (message.imageGenerationMeta?.originalImageUrl
                && message.imageGenerationMeta.originalImageUrl === message.novelAiImageUrl) {
                report.cleanableCopies++;
                report.cleanableSize += message.imageGenerationMeta.originalImageUrl.length;
            }
            for (const version of (Array.isArray(message._imageVersions) ? message._imageVersions : [])) {
                if (version?.metadata?.originalImageUrl && version.metadata.originalImageUrl === version.imageUrl) {
                    report.cleanableCopies++;
                    report.cleanableSize += version.metadata.originalImageUrl.length;
                }
            }
            if (typeof message.content === 'string' && parts.some(part => part?.type === 'text' && part.text === message.content)) {
                report.retainedCopies++;
                report.retainedSize += message.content.length;
            }
            if (typeof message.stickerData === 'string' && parts.some(part => part?.type === 'sticker' && part.data === message.stickerData)) {
                report.retainedCopies++;
                report.retainedSize += message.stickerData.length;
            }
            scanned++;
            if (scanned % 200 === 0) {
                onProgress?.(scanned, chats.length);
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        report.size += chatSize;
        if (history.length) {
            const mainField = Object.entries(chatFields).sort((a, b) => b[1] - a[1])[0]?.[0] || 'other';
            keepLargest(largestChats, { name: chat.remarkName || chat.realName || chat.name || '未命名会话',
                type, messages: history.length, size: chatSize, field: fieldLabels[mainField] });
        }
    }
    return report;
}

function setupStorageAnalysisScreen() {
    window.setupStatusStorageScreen?.();
    const saveStatus = document.getElementById('storage-save-status');
    const saveError = saveStatus?.querySelector('p');
    const saveRetry = document.getElementById('storage-save-retry');
    const updateSaveStatus = () => { if (saveError) saveError.hidden = !window.StorageSaveHealth?.hasFailures(); };
    window.addEventListener('ovo-storage-save-health', updateSaveStatus);
    updateSaveStatus();
    saveRetry?.addEventListener('click', async () => {
        saveRetry.disabled = true;
        try {
            if (await saveData() === true) showToast('当前数据已保存到本机。');
        } finally {
            saveRetry.disabled = false;
            updateSaveStatus();
        }
    });
    const screen = document.getElementById('storage-analysis-screen');
    const chartContainer = document.getElementById('storage-chart-container');
    const detailsList = document.getElementById('storage-details-list');
    const chatModal = document.getElementById('storage-chat-modal');
    const chatList = document.getElementById('storage-chat-list');
    const chatSearch = document.getElementById('storage-chat-search');
    const chatType = document.getElementById('storage-chat-type');
    const chatSort = document.getElementById('storage-chat-sort');
    let chatDetails = [];
    let chatAnalysisReady = false;
    let myChart = null;

    const colorPalette = ['#ff80ab', '#90caf9', '#a5d6a7', '#fff59d', '#b39ddb', '#ffcc80'];

    const categoryNames = {
        messages: '聊天记录',
        charactersAndGroups: '角色与群组',
        worldAndForum: '世界书与论坛',
        personalization: '个性化设置',
        apiAndCore: '核心与API',
        other: '其他数据'
    };

    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    function renderStorageChart(info, colors) {
        if (!myChart) {
            myChart = echarts.init(chartContainer);
        }

        const chartData = Object.entries(info.categorizedSizes)
            .map(([key, value]) => ({
                name: categoryNames[key] || key,
                value: value
            }))
            .filter(item => item.value > 0);

        const option = {
            color: colors,
            tooltip: {
                trigger: 'item',
                formatter: '{a} <br/>{b}: {c} ({d}%)'
            },
            legend: {
                show: false 
            },
            series: [
                {
                    name: '存储占比',
                    type: 'pie',
                    radius: ['50%', '70%'],
                    avoidLabelOverlap: false,
                    label: {
                        show: false,
                        position: 'center'
                    },
                    emphasis: {
                        label: {
                            show: true,
                            fontSize: '20',
                            fontWeight: 'bold'
                        }
                    },
                    labelLine: {
                        show: false
                    },
                    data: chartData
                }
            ]
        };
        myChart.setOption(option);
    }

    function renderStorageDetails(info, colors) {
        detailsList.innerHTML = '';
        const totalSize = info.totalSize;

        const totalSizeEl = document.getElementById('storage-total-size');
        if (totalSizeEl) {
            totalSizeEl.textContent = formatBytes(totalSize);
        }

        const sortedData = Object.entries(info.categorizedSizes)
            .map(([key, value]) => ({
                key: key,
                name: categoryNames[key] || key,
                value: value
            }))
            .sort((a, b) => b.value - a.value);

        sortedData.forEach((item, index) => {
            if (item.value <= 0) return; 
            const percentage = totalSize > 0 ? ((item.value / totalSize) * 100).toFixed(2) : 0;
            const color = colors[index % colors.length];

            const detailItem = document.createElement('div');
            detailItem.className = 'storage-detail-item';
            detailItem.innerHTML = `
                <div class="storage-color-indicator" style="background-color: ${color};"></div>
                <div class="storage-detail-info">
                    <span class="storage-detail-name">${item.name}</span>
                    <span class="storage-detail-size">${formatBytes(item.value)}</span>
                </div>
                <span class="storage-detail-percentage">${percentage}%</span>
            `;
            detailsList.appendChild(detailItem);
        });
        chatDetails = (info.chatDetails || []).filter(item => item.messages > 0);
        chatAnalysisReady = true;
        const chatSummary = `${chatDetails.length} 个会话 · 约 ${formatBytes(chatDetails.reduce((sum, item) => sum + item.size, 0))}`;
        document.getElementById('storage-chat-summary-text').textContent = chatSummary;
        document.getElementById('storage-chat-modal-summary').textContent = chatSummary;
        renderChatList();
    }

    function renderChatList() {
        if (!chatList) return;
        chatList.replaceChildren();
        const query = (chatSearch?.value || '').trim().toLocaleLowerCase();
        const type = chatType?.value || 'all';
        const sort = chatSort?.value || 'size';
        const visible = chatDetails.filter(item => (type === 'all' || item.type === type)
            && (!query || item.name.toLocaleLowerCase().includes(query)));
        visible.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'zh-CN')
            : sort === 'messages' ? b.messages - a.messages || b.size - a.size
            : b.size - a.size || b.messages - a.messages);
        if (!visible.length) {
            const empty = document.createElement('p');
            empty.className = 'storage-chat-empty';
            empty.textContent = !chatAnalysisReady ? '正在分析会话占用...' : chatDetails.length ? '没有符合条件的会话' : '暂无会话占用';
            chatList.appendChild(empty);
            return;
        }
        visible.forEach(item => {
                const row = document.createElement('button');
                row.type = 'button';
                row.className = 'storage-chat-item';
                const top = document.createElement('div');
                top.className = 'storage-chat-item-top';
                const name = document.createElement('span');
                name.className = 'storage-chat-item-name';
                name.textContent = item.name;
                const size = document.createElement('strong');
                size.className = 'storage-chat-item-size';
                size.textContent = formatBytes(item.size);
                top.append(name, size);
                const meta = document.createElement('span');
                meta.className = 'storage-chat-item-meta';
                meta.textContent = `${item.messages} 条消息 · 图片约 ${formatBytes(item.imageSize)}`;
                row.append(top, meta);
                if (item.largestImages?.length) {
                    const hint = document.createElement('span');
                    hint.className = 'storage-chat-item-hint';
                    hint.textContent = '查看占用较大的图片 ›';
                    const largest = document.createElement('span');
                    largest.className = 'storage-chat-item-largest';
                    largest.hidden = true;
                    largest.textContent = item.largestImages.map(image =>
                        `第 ${image.index} 条 · ${formatBytes(image.size)}`).join('\n');
                    row.append(hint, largest);
                    row.addEventListener('click', () => {
                        largest.hidden = !largest.hidden;
                        hint.textContent = largest.hidden ? '查看占用较大的图片 ›' : '收起较大图片 ⌃';
                    });
                }
                chatList.appendChild(row);
        });
    }

    const auditModal = document.getElementById('storage-audit-modal');
    const auditOpen = document.getElementById('storage-audit-open');
    const auditClose = document.getElementById('storage-audit-close');
    const auditStatus = document.getElementById('storage-audit-status');
    const auditResults = document.getElementById('storage-audit-results');
    const auditClean = document.getElementById('storage-audit-clean');
    let auditReport = null;
    let auditRunning = false;

    function renderAuditReport(report) {
        auditResults.replaceChildren();
        const summary = document.createElement('p');
        summary.className = 'storage-audit-summary';
        summary.textContent = `已检测 ${report.chats} 个会话、${report.messages} 条消息；历史消息约 ${formatBytes(report.size)}。`;
        auditResults.appendChild(summary);

        const addSection = (title, rows) => {
            const heading = document.createElement('h4');
            heading.textContent = title;
            auditResults.appendChild(heading);
            rows.forEach(([label, value]) => {
                const row = document.createElement('div');
                row.className = 'storage-audit-row';
                const name = document.createElement('span');
                name.textContent = label;
                const amount = document.createElement('strong');
                amount.textContent = value;
                row.append(name, amount);
                auditResults.appendChild(row);
            });
        };
        addSection('占用来源', [
            ['消息正文', report.fields.content], ['消息附加内容', report.fields.parts],
            ['表情包数据', report.fields.stickerData], ['重说旧版本', report.fields._regenVersions],
            ['生图旧版本', report.fields._imageVersions], ['生图图片与原图', report.fields.novelAiImageUrl + report.fields.imageGenerationMeta],
            ['其他字段', report.fields.other]
        ].filter(([, size]) => size > 0).sort((a, b) => b[1] - a[1]).map(([label, size]) => [label, formatBytes(size)]));
        if (report.fields.parts) addSection('消息附加内容细分', [
            ['文字', report.partTypes.text], ['图片', report.partTypes.image],
            ['表情包', report.partTypes.sticker], ['其他', report.partTypes.other]
        ].filter(([, size]) => size > 0).sort((a, b) => b[1] - a[1]).map(([label, size]) => [label, formatBytes(size)]));
        const otherFields = Object.entries(report.otherFields).sort((a, b) => b[1] - a[1]).slice(0, 5);
        if (otherFields.length) addSection('其他字段中占用较多的', otherFields.map(([name, size]) => [name, formatBytes(size)]));
        addSection('占用最多的会话', report.largestChats.map(item =>
            [`${item.name}（${item.type === 'group' ? '群聊' : '角色'}，${item.messages} 条） · 主要：${item.field}`, formatBytes(item.size)]));
        addSection('占用最多的消息', report.largestMessages.map(item =>
            [`${item.name} · 第 ${item.index} 条 · ${item.field}`, formatBytes(item.size)]));

        const note = document.createElement('p');
        note.className = 'storage-audit-note';
        note.textContent = report.cleanableCopies
            ? `发现 ${report.cleanableCopies} 处完全相同的图片副本，预计可清理约 ${formatBytes(report.cleanableSize)}。`
            : '没有发现当前规则可安全清理的图片副本。';
        auditResults.appendChild(note);
        if (report.retainedCopies) {
            const retained = document.createElement('p');
            retained.className = 'storage-audit-note';
            retained.textContent = `另有 ${report.retainedCopies} 处正文或表情包在不同字段中重复（约 ${formatBytes(report.retainedSize)}）；当前显示或发送逻辑仍使用这些字段，本次不会删除。`;
            auditResults.appendChild(retained);
        }
        auditClean.hidden = !report.cleanableCopies;
    }

    async function runStorageAudit() {
        if (auditRunning) return;
        auditRunning = true;
        auditClean.hidden = true;
        auditResults.replaceChildren();
        auditStatus.textContent = '正在扫描旧聊天数据…';
        try {
            auditReport = await analyzeLegacyChatStorage(
                [[db.characters || [], 'private'], [db.groups || [], 'group']],
                count => { auditStatus.textContent = `正在扫描…已检查 ${count} 条消息`; }
            );
            renderAuditReport(auditReport);
            auditStatus.textContent = '检测完成。占用为估算值，不代表浏览器实际磁盘用量。';
        } catch (error) {
            auditReport = null;
            auditStatus.textContent = '检测失败：' + (error?.message || '未知错误');
            console.error('旧数据检测失败:', error);
        } finally {
            auditRunning = false;
        }
    }
    auditOpen?.addEventListener('click', () => {
        auditModal?.classList.add('visible');
        auditClose?.focus();
        void runStorageAudit();
    });
    function closeAuditModal() {
        auditModal?.classList.remove('visible');
        auditOpen?.focus();
    }
    auditClose?.addEventListener('click', closeAuditModal);
    auditModal?.addEventListener('click', event => { if (event.target === auditModal) closeAuditModal(); });
    auditClean?.addEventListener('click', async () => {
        if (!auditReport?.cleanableCopies || auditRunning) return;
        const confirmed = await showAppConfirmDialog({
            title: '清理重复图片副本',
            message: `将重新核对并清理 ${auditReport.cleanableCopies} 处完全相同的图片副本。聊天文字、重说版本和表情包不会删除。确定继续吗？`,
            confirmText: '确认清理', cancelText: '取消', dismissText: ''
        });
        if (confirmed !== 'confirm') { auditClean.focus(); return; }
        auditRunning = true;
        auditOpen.disabled = true;
        auditClean.disabled = true;
        auditStatus.textContent = '正在清理并逐个保存会话…';
        try {
            const result = await compactLegacyChatMedia();
            auditStatus.textContent = `已整理 ${result.chats} 个会话，移除约 ${formatBytes(result.duplicateCharacters)} 重复图片内容。`;
            auditReport = await analyzeLegacyChatStorage([[db.characters || [], 'private'], [db.groups || [], 'group']]);
            renderAuditReport(auditReport);
        } catch (error) {
            auditStatus.textContent = '清理未完成：' + (error?.message || '未知错误');
            console.error('旧数据清理失败:', error);
        } finally {
            auditRunning = false;
            auditOpen.disabled = false;
            auditClean.disabled = false;
            if (auditModal?.classList.contains('visible')) auditClose?.focus();
        }
    });

    document.getElementById('storage-chat-open')?.addEventListener('click', () => {
        chatModal?.classList.add('visible');
        chatSearch?.focus();
    });
    function closeChatModal() {
        chatModal?.classList.remove('visible');
        document.getElementById('storage-chat-open')?.focus();
    }
    document.getElementById('storage-chat-close')?.addEventListener('click', closeChatModal);
    chatModal?.addEventListener('click', event => { if (event.target === chatModal) closeChatModal(); });
    [chatSearch, chatType, chatSort].forEach(control => control?.addEventListener(control === chatSearch ? 'input' : 'change', renderChatList));
    document.addEventListener('keydown', event => {
        if (auditModal?.classList.contains('visible')
            && document.getElementById('app-confirm-dialog')?.classList.contains('visible')) return;
        const activeModal = [document.getElementById('storage-console-modal'), chatModal, auditModal]
            .find(modal => modal?.classList.contains('visible'));
        if (!activeModal) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            if (activeModal === chatModal) closeChatModal();
            else if (activeModal === auditModal) closeAuditModal();
            else document.getElementById('storage-console-close')?.click();
        } else if (event.key === 'Tab') {
            const focusable = [...activeModal.querySelectorAll('button, input, select')].filter(el => !el.disabled);
            const first = focusable[0], last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
    });

    function renderCompactionResult(result) {
        const status = document.getElementById('storage-compaction-result');
        if (!status || !result) return;
        status.hidden = false;
        status.textContent = result.chats
            ? `已整理 ${result.chats} 个会话，移除约 ${formatBytes(result.duplicateCharacters)} 重复图片内容`
            : '已检查聊天图片，没有重复副本';
    }
    renderCompactionResult(window.__chatMediaCompactionResult);
    window.addEventListener('ovo-chat-media-compacted', async event => {
        renderCompactionResult(event.detail);
        if (screen.classList.contains('active')) {
            const storageInfo = await dataStorage.getStorageInfo();
            renderStorageChart(storageInfo, colorPalette);
            renderStorageDetails(storageInfo, colorPalette);
        }
    });

    const observer = new MutationObserver(async (mutations) => {
        if (screen.classList.contains('active')) {
            window.__storageConsoleOnLog?.();
            showToast('正在分析存储空间...');
            const storageInfo = await dataStorage.getStorageInfo();
            if (storageInfo) {
                renderStorageChart(storageInfo, colorPalette);
                renderStorageDetails(storageInfo, colorPalette);
                updatePersistenceStatus();
            } else {
                showToast('分析失败');
            }
        }
    });

    observer.observe(screen, { attributes: true, attributeFilter: ['class'] });

    const compressAllBtn = document.getElementById('compress-all-images-btn');
    if (compressAllBtn) {
        compressAllBtn.addEventListener('click', async () => {
            const confirmed = await showAppConfirmDialog({
                title: '压缩所有聊天图片',
                message: '此操作将遍历所有角色和群组的聊天记录，压缩其中包含的图片（包括你发送的图片和AI生成的图片）。压缩可以节省大量空间，但会稍微降低图片画质。这可能需要一些时间，确定要继续吗？',
                confirmText: '开始压缩',
                cancelText: '取消'
            });

            if (confirmed !== 'confirm') return;

            showToast('开始压缩图片，请耐心等待...');
            compressAllBtn.disabled = true;
            compressAllBtn.textContent = '压缩中...';
            
            let compressedCount = 0;
            let totalSavedBytes = 0;

            const compressHistoryImages = async (history) => {
                if (!history || !Array.isArray(history)) return false;
                let historyChanged = false;
                for (const msg of history) {
                    if (!msg) continue;
                    let changed = false;
                    const replacements = new Map();

                    const compressIfBase64 = async (url) => {
                        if (replacements.has(url)) {
                            const compressed = replacements.get(url);
                            totalSavedBytes += Math.max(0, url.length - compressed.length);
                            return compressed;
                        }
                        if (url && url.startsWith('data:image/')) {
                            try {
                                const originalSize = Math.round((url.length * 3) / 4);
                                // 跳过小于 100KB 的图片，避免不必要的性能消耗和画质损失
                                if (originalSize < 100 * 1024) return url;

                                const res = await fetch(url);
                                const blob = await res.blob();
                                // 使用 utils.js 中的 compressImage，默认按 512x512 0.8质量压缩
                                const compressedDataUrl = await compressImage(blob, { quality: 0.8, maxWidth: 512, maxHeight: 512 });
                                
                                const newSize = Math.round((compressedDataUrl.length * 3) / 4);
                                if (newSize < originalSize) {
                                    totalSavedBytes += Math.max(0, url.length - compressedDataUrl.length);
                                    compressedCount++;
                                    replacements.set(url, compressedDataUrl);
                                    return compressedDataUrl;
                                }
                            } catch (e) {
                                console.warn('Failed to compress an image:', e);
                            }
                        }
                        return url;
                    };

                    if (msg.novelAiImageUrl) {
                        const newUrl = await compressIfBase64(msg.novelAiImageUrl);
                        if (newUrl !== msg.novelAiImageUrl) {
                            msg.novelAiImageUrl = newUrl;
                            changed = true;
                        }
                    }
                    if (msg.imageGenerationMeta?.originalImageUrl && msg.imageGenerationMeta.provider !== 'novelai') {
                        const newUrl = await compressIfBase64(msg.imageGenerationMeta.originalImageUrl);
                        if (newUrl !== msg.imageGenerationMeta.originalImageUrl) {
                            msg.imageGenerationMeta.originalImageUrl = newUrl;
                            changed = true;
                        }
                    }

                    if (msg._imageVersions && Array.isArray(msg._imageVersions)) {
                        for (let i = 0; i < msg._imageVersions.length; i++) {
                            if (!msg._imageVersions[i]) continue;
                            if (msg._imageVersions[i].imageUrl) {
                                const newUrl = await compressIfBase64(msg._imageVersions[i].imageUrl);
                                if (newUrl !== msg._imageVersions[i].imageUrl) {
                                    msg._imageVersions[i].imageUrl = newUrl;
                                    changed = true;
                                }
                            }
                            const metadata = msg._imageVersions[i].metadata;
                            if (metadata?.originalImageUrl && metadata.provider !== 'novelai') {
                                const newUrl = await compressIfBase64(metadata.originalImageUrl);
                                if (newUrl !== metadata.originalImageUrl) {
                                    metadata.originalImageUrl = newUrl;
                                    changed = true;
                                }
                            }
                        }
                    }
                    if (Array.isArray(msg.parts)) {
                        for (const part of msg.parts) {
                            if (!part || part.type !== 'image' || !part.data) continue;
                            const newUrl = await compressIfBase64(part.data);
                            if (newUrl !== part.data) {
                                part.data = newUrl;
                                changed = true;
                            }
                        }
                    }

                    if (msg.content && typeof msg.content === 'string' && msg.content.includes('data:image/')) {
                        const regex = /(data:image\/[^;"']+(?:;[^;"']+)*;base64,[A-Za-z0-9+/=]+)/g;
                        let match;
                        let newContent = msg.content;
                        const promises = [];
                        
                        while ((match = regex.exec(msg.content)) !== null) {
                            const originalDataUrl = match[1];
                            promises.push((async () => {
                                const newUrl = await compressIfBase64(originalDataUrl);
                                if (newUrl !== originalDataUrl) {
                                    newContent = newContent.replace(originalDataUrl, newUrl);
                                    changed = true;
                                }
                            })());
                        }
                        
                        if (promises.length > 0) {
                            await Promise.all(promises);
                            if (changed) {
                                msg.content = newContent;
                            }
                        }
                    }
                    if (changed) historyChanged = true;
                }
                return historyChanged;
            };

            try {
                if (typeof db !== 'undefined') {
                    if (db.characters) {
                        for (const char of db.characters) {
                            await window.editChatMedia(char, 'private', draft => compressHistoryImages(draft.history));
                        }
                    }
                    
                    if (db.groups) {
                        for (const group of db.groups) {
                            await window.editChatMedia(group, 'group', draft => compressHistoryImages(draft.history));
                        }
                    }
                }
                
                if (typeof dataStorage !== 'undefined') {
                    const storageInfo = await dataStorage.getStorageInfo();
                    if (storageInfo) {
                        renderStorageChart(storageInfo, colorPalette);
                        renderStorageDetails(storageInfo, colorPalette);
                        updatePersistenceStatus();
                    }
                }

                showToast(`压缩完成！共压缩 ${compressedCount} 张图片，节省了 ${formatBytes(totalSavedBytes)} 空间。`);
            } catch (err) {
                console.error('批量压缩图片时出错:', err);
                if (err.name !== 'StorageWriteError') showToast('图片压缩未完成：' + (err.message || '未知错误'));
            } finally {
                compressAllBtn.disabled = false;
                compressAllBtn.textContent = '一键压缩聊天图片';
            }
        });
    }

    // 存储页控制台：运行日志与 JavaScript 命令
    (function setupStorageConsoleWidget() {
        var widget = document.getElementById('storage-console-widget');
        var bar = document.getElementById('storage-console-bar');
        var modal = document.getElementById('storage-console-modal');
        var panel = document.getElementById('storage-console-panel');
        var listEl = document.getElementById('storage-console-list');
        var searchEl = document.getElementById('storage-console-search');
        var commandForm = document.getElementById('storage-console-command-form');
        var commandInput = document.getElementById('storage-console-command');
        var pauseBtn = document.getElementById('storage-console-pause');
        var followBtn = document.getElementById('storage-console-follow');
        var clearBtn = document.getElementById('storage-console-clear-btn');
        var exportBtn = document.getElementById('storage-console-export-btn');
        var countLog = document.getElementById('storage-console-count-log');
        var countWarn = document.getElementById('storage-console-count-warn');
        var countError = document.getElementById('storage-console-count-error');
        var filterLabel = document.querySelector('.storage-console-filter-label');
        
        var zoomInBtn = document.getElementById('storage-console-zoom-in');
        var zoomOutBtn = document.getElementById('storage-console-zoom-out');
        var zoomResetBtn = document.getElementById('storage-console-zoom-reset');
        
        var currentFilter = 'all'; // 'all' | 'log' | 'info' | 'debug' | 'warn' | 'error'
        var currentFontSize = 12; // default font size
        var paused = false;
        var following = true;
        var commandHistory = [];
        var historyIndex = 0;
        var expandedEntries = new WeakSet();

        if (!widget || !bar || !modal || !panel || !listEl) return;

        function updateFontSize() {
            listEl.style.fontSize = currentFontSize + 'px';
        }

        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', function() {
                if (currentFontSize < 32) {
                    currentFontSize += 2;
                    updateFontSize();
                }
            });
        }

        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', function() {
                if (currentFontSize > 8) {
                    currentFontSize -= 2;
                    updateFontSize();
                }
            });
        }

        if (zoomResetBtn) {
            zoomResetBtn.addEventListener('click', function() {
                currentFontSize = 12;
                updateFontSize();
            });
        }


        function getFilteredLogs(logs) {
            var query = (searchEl?.value || '').trim().toLocaleLowerCase();
            return logs.filter(function (entry) {
                return (currentFilter === 'all' || entry.type === currentFilter)
                    && (!query || (entry.text + ' ' + entry.source).toLocaleLowerCase().includes(query));
            });
        }

        function renderConsole() {
            var logs = window.__storageConsoleLogs || [];
            var logCount = 0, warnCount = 0, errorCount = 0;
            logs.forEach(function (e) {
                if (e.type === 'log' || e.type === 'info' || e.type === 'debug') logCount++;
                else if (e.type === 'warn') warnCount++;
                else if (e.type === 'error') errorCount++;
            });
            if (countLog) countLog.textContent = logCount;
            if (countWarn) countWarn.textContent = warnCount;
            if (countError) countError.textContent = errorCount;
            if (!modal.classList.contains('visible')) return;

            var filtered = getFilteredLogs(logs);
            var wasAtBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 32;
            var oldScrollTop = listEl.scrollTop;
            listEl.replaceChildren();
            filtered.forEach(function (entry) {
                var div = document.createElement('div');
                div.className = 'storage-console-log-item type-' + entry.type;
                var time = document.createElement('span');
                time.className = 'storage-console-time';
                time.textContent = entry.time;
                var level = document.createElement('span');
                level.className = 'storage-console-level';
                level.textContent = entry.type.toUpperCase();
                var message = document.createElement('span');
                message.className = 'storage-console-message';
                message.textContent = entry.text;
                div.append(time, level, message);
                if (entry.source || entry.details || entry.text.includes('\n')) {
                    var details = document.createElement('details');
                    details.open = expandedEntries.has(entry);
                    details.addEventListener('toggle', function () {
                        if (details.open) expandedEntries.add(entry);
                        else expandedEntries.delete(entry);
                    });
                    var summary = document.createElement('summary');
                    summary.textContent = entry.source || '查看详情';
                    var pre = document.createElement('pre');
                    pre.textContent = entry.details || entry.text;
                    details.append(summary, pre);
                    div.appendChild(details);
                }
                var copy = document.createElement('button');
                copy.type = 'button';
                copy.className = 'storage-console-copy';
                copy.textContent = '复制';
                copy.setAttribute('aria-label', '复制这条日志');
                copy.addEventListener('click', function () {
                    var value = '[' + entry.time + '] [' + entry.type.toUpperCase() + '] ' + entry.text;
                    function fallbackCopy() {
                        var field = document.createElement('textarea');
                        field.value = value;
                        field.style.position = 'fixed';
                        field.style.opacity = '0';
                        document.body.appendChild(field);
                        field.select();
                        var copied = false;
                        try { copied = document.execCommand('copy'); } catch (error) { /* 浏览器不支持复制 */ }
                        field.remove();
                        showToast(copied ? '已复制日志' : '复制失败');
                    }
                    if (navigator.clipboard?.writeText) {
                        navigator.clipboard.writeText(value).then(function () { showToast('已复制日志'); })
                            .catch(fallbackCopy);
                    } else {
                        fallbackCopy();
                    }
                });
                div.appendChild(copy);
                listEl.appendChild(div);
            });
            if (modal.classList.contains('visible')) listEl.scrollTop = following && wasAtBottom ? listEl.scrollHeight : oldScrollTop;

            var labelMap = { all: '全部', log: '日志', info: '信息', debug: '调试', warn: '警告', error: '报错' };
            if (filterLabel) filterLabel.textContent = (labelMap[currentFilter] || '全部') + ' · ' + filtered.length + ' 条';
        }

        bar.addEventListener('click', function () {
            modal.classList.add('visible');
            renderConsole();
            listEl.scrollTop = listEl.scrollHeight;
            commandInput?.focus();
        });

        function closeConsole() {
            modal.classList.remove('visible');
            bar.focus();
        }
        document.getElementById('storage-console-close')?.addEventListener('click', closeConsole);
        modal.addEventListener('click', function (event) { if (event.target === modal) closeConsole(); });
        searchEl?.addEventListener('input', renderConsole);
        pauseBtn?.addEventListener('click', function () {
            paused = !paused;
            pauseBtn.textContent = paused ? '继续' : '暂停';
            pauseBtn.setAttribute('aria-pressed', String(paused));
            if (!paused) renderConsole();
        });
        followBtn?.addEventListener('click', function () {
            following = !following;
            followBtn.textContent = following ? '跟随' : '不跟随';
            followBtn.setAttribute('aria-pressed', String(following));
            if (following) listEl.scrollTop = listEl.scrollHeight;
        });

        panel.querySelectorAll('.storage-console-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                var filter = tab.getAttribute('data-filter') || 'all';
                currentFilter = filter;
                panel.querySelectorAll('.storage-console-tab').forEach(function (t) { t.classList.remove('active'); });
                tab.classList.add('active');
                renderConsole();
            });
        });

        var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        commandForm?.addEventListener('submit', async function (event) {
            event.preventDefault();
            var code = commandInput.value.trim();
            if (!code) return;
            commandHistory.push(code);
            historyIndex = commandHistory.length;
            commandInput.value = '';
            window.__storageConsoleAddLog('log', ['› ' + code]);
            try {
                var result;
                try {
                    result = (0, eval)(code);
                } catch (error) {
                    if (!(error instanceof SyntaxError) || !/\bawait\b/.test(code)) throw error;
                    try { result = new AsyncFunction('return (' + code + ')')(); }
                    catch (expressionError) {
                        if (!(expressionError instanceof SyntaxError)) throw expressionError;
                        result = new AsyncFunction(code)();
                    }
                }
                result = await result;
                window.__storageConsoleAddLog('log', [result]);
            } catch (error) {
                window.__storageConsoleAddLog('error', [error]);
            }
        });
        commandInput?.addEventListener('keydown', function (event) {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            if (!commandHistory.length) return;
            event.preventDefault();
            historyIndex = Math.max(0, Math.min(commandHistory.length, historyIndex + (event.key === 'ArrowUp' ? -1 : 1)));
            commandInput.value = commandHistory[historyIndex] || '';
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                window.__storageConsoleLogs = [];
                renderConsole();
            });
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', async function () {
                var logs = window.__storageConsoleLogs || [];
                if (logs.length === 0) {
                    showToast('暂无日志可导出');
                    return;
                }
                var logText = logs.map(function(e) {
                    return '[' + e.time + '] [' + e.type.toUpperCase() + '] ' + e.text + (e.source ? ' (' + e.source + ')' : '');
                }).join('\n');
                
                var blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
                await OvoFileDownload.save(blob, 'console_logs_' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt');

            });
        }

        var renderQueued = false;
        window.__storageConsoleOnLog = function () {
            if (!screen.classList.contains('active') || paused) return;
            if (renderQueued) return;
            renderQueued = true;
            requestAnimationFrame(function () {
                renderQueued = false;
                renderConsole();
            });
        };

        renderConsole();
    })();

    async function updatePersistenceStatus() {
        if (navigator.storage && navigator.storage.persisted) {
            const isPersisted = await navigator.storage.persisted();
            let statusContainer = document.getElementById('storage-persistence-status');
            
            if (!statusContainer) {
                statusContainer = document.createElement('div');
                statusContainer.id = 'storage-persistence-status';
                statusContainer.style.cssText = "padding: 12px; background: #ffffff; border-radius: 12px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #edf0f3; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);";
                chartContainer.parentNode.insertBefore(statusContainer, chartContainer);
            }
            
            statusContainer.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <div style="font-weight: 600; font-size: 15px; color: #333;">持久化存储保护</div>
                    <div style="font-size: 12px; color: ${isPersisted ? '#4caf50' : '#ff9800'}; display: flex; align-items: center; gap: 4px;">
                        ${isPersisted ? 
                            '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg> 已开启 (数据受保护)' : 
                            '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg> 未开启 (容易被清理)'}
                    </div>
                </div>
                ${!isPersisted ? '<button id="manual-persist-btn" class="btn btn-small btn-primary" style="padding: 6px 12px; font-size: 13px;">立即开启</button>' : ''}
            `;

            const btn = document.getElementById('manual-persist-btn');
            if (btn) {
                btn.onclick = async () => {
                    const persisted = await navigator.storage.persist();
                    if (persisted) {
                        showToast("已成功开启持久化存储！");
                        updatePersistenceStatus();
                    } else {
                        showToast("开启失败，可能是浏览器策略限制。");
                    }
                };
            }
        }
        
        // 追加配额进度条
        if (navigator.storage && navigator.storage.estimate) {
            try {
                const { usage, quota } = await navigator.storage.estimate();
                const usedMB = (usage / 1024 / 1024).toFixed(1);
                const totalMB = (quota / 1024 / 1024).toFixed(0);
                const pct = Math.min(100, (usage / quota) * 100);
                const color = pct > 90 ? '#f44336' : pct > 70 ? '#ff9800' : '#4caf50';

                // 移除旧的进度条节点，避免重复渲染
                const oldQuotaDiv = document.getElementById('storage-quota-status');
                if (oldQuotaDiv) oldQuotaDiv.remove();

                const quotaDiv = document.createElement('div');
                quotaDiv.id = 'storage-quota-status';
                quotaDiv.style.cssText = "padding: 12px; background: #ffffff; border-radius: 12px; margin-bottom: 14px; border: 1px solid #edf0f3; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);";
                quotaDiv.innerHTML = `
                    <div style="font-weight:600;font-size:15px;color:#333;margin-bottom:8px;">存储空间用量</div>
                    <div style="background:#eee;border-radius:4px;height:8px;overflow:hidden;margin-bottom:6px;">
                        <div style="width:${pct.toFixed(1)}%;background:${color};height:100%;border-radius:4px;transition:width .3s;"></div>
                    </div>
                    <div style="font-size:12px;color:${color};">已使用 ${usedMB} MB / 约 ${totalMB} MB（${pct.toFixed(1)}%）</div>
                    ${pct > 90 ? '<div style="font-size:12px;color:#f44336;margin-top:4px;">⚠️ 空间即将耗尽，请导出备份并清理数据！</div>' : ''}
                `;
                
                const statusContainer = document.getElementById('storage-persistence-status');
                if (statusContainer && statusContainer.parentNode) {
                    statusContainer.parentNode.insertBefore(quotaDiv, statusContainer.nextSibling);
                } else if (chartContainer && chartContainer.parentNode) {
                    chartContainer.parentNode.insertBefore(quotaDiv, chartContainer);
                }
            } catch (e) {
                console.error("Failed to estimate storage:", e);
            }
        }
    }
}

// --- 持久化存储逻辑 ---
async function checkAndRequestPersistence() {
    if (navigator.storage && navigator.storage.persist) {
        const isPersisted = await navigator.storage.persisted();
        if (isPersisted) {
            console.log("Storage is already persisted.");
            return;
        }

        // 检查是否已经提示过
        const hasPrompted = localStorage.getItem('storage_persist_prompted');
        if (hasPrompted) return;

        // 显示弹窗
        showPersistencePrompt();
    }
}

function showPersistencePrompt() {
    // 避免重复弹窗
    if (document.getElementById('persistence-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'persistence-modal';
    modal.className = 'modal-overlay visible';
    modal.style.zIndex = '10000';
    modal.innerHTML = `
        <div class="modal-window" style="max-width: 320px;">
            <h3 style="margin-bottom: 10px;">🛡️ 防止数据丢失</h3>
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px; font-size: 14px;">
                为了避免聊天记录被浏览器自动清理，建议开启<strong>持久化存储</strong>保护。<br>
                <span style="font-size: 12px; color: #999; display: block; margin-top: 8px;">(开启后，浏览器将不会在空间不足时自动删除你的数据)</span>
            </p>
            <div style="display: flex; gap: 10px;">
                <button id="persist-allow-btn" class="btn btn-primary" style="flex: 1;">开启保护</button>
                <button id="persist-later-btn" class="btn btn-neutral" style="flex: 1;">稍后</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('persist-allow-btn').onclick = async () => {
        const persisted = await navigator.storage.persist();
        if (persisted) {
            showToast("已成功开启持久化存储！");
        } else {
            showToast("开启失败，可能是浏览器策略限制。");
        }
        localStorage.setItem('storage_persist_prompted', 'true');
        modal.remove();
    };

    document.getElementById('persist-later-btn').onclick = () => {
        localStorage.setItem('storage_persist_prompted', 'true'); // 标记为已提示，避免每次刷新都弹
        modal.remove();
    };
}

// 导出函数供 main.js 使用
window.checkAndRequestPersistence = checkAndRequestPersistence;
window.setupStorageAnalysisScreen = setupStorageAnalysisScreen; // 确保原函数也被导出（虽然它已经是全局的）
