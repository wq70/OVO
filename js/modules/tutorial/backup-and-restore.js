async function createFullBackupData() {
    const backupData = JSON.parse(JSON.stringify(db));
    const keys = window.globalSettingKeysForBackup || [];
    if (dexieDB?.musicAssets) backupData.musicAssets = await dexieDB.musicAssets.toArray();
    keys.forEach(k => {
        if (db[k] !== undefined && backupData[k] === undefined) {
            try { backupData[k] = JSON.parse(JSON.stringify(db[k])); } catch (e) { backupData[k] = db[k]; }
        }
    });
    if (dexieDB?.naiVibeAssets) {
        backupData.naiVibeAssets = await dexieDB.naiVibeAssets.toArray();
        backupData.naiVibeEncodings = await dexieDB.naiVibeEncodings.toArray();
        backupData.naiVibeGroups = await dexieDB.naiVibeGroups.toArray();
    }
    backupData._exportVersion = '3.0';
    backupData._exportTimestamp = Date.now();
    return backupData;
}

// 小剧场相关的所有 db 键（用于分类导出/导入）
const THEATER_DB_KEYS = [
    'theaterScenarios', 'theaterPromptPresets',
    'theaterHtmlScenarios', 'theaterHtmlPromptPresets',
    'theaterMode', 'theaterApiSettings', 'theaterFontSize', 'theaterFontPreset'
];

// 分类导出：只包含选中的表
async function createPartialBackupData(selectedKeys) {
    const keys = window.globalSettingKeysForBackup || [];
    const result = { _exportVersion: '3.0_partial', _exportTimestamp: Date.now(), _exportTables: selectedKeys };
    for (const key of selectedKeys) {
        if (key === 'globalSettings') {
            result.globalSettings = {};
            if (dexieDB?.musicAssets) result.globalSettings.musicAssets = await dexieDB.musicAssets.toArray();
            keys.forEach(k => { result.globalSettings[k] = db[k] !== undefined ? JSON.parse(JSON.stringify(db[k])) : undefined; });
            if (dexieDB?.naiVibeAssets) {
                result.globalSettings.naiVibeAssets = await dexieDB.naiVibeAssets.toArray();
                result.globalSettings.naiVibeEncodings = await dexieDB.naiVibeEncodings.toArray();
                result.globalSettings.naiVibeGroups = await dexieDB.naiVibeGroups.toArray();
            }
        } else if (key === 'theaterData') {
            result.theaterData = {};
            THEATER_DB_KEYS.forEach(k => { result.theaterData[k] = db[k] !== undefined ? JSON.parse(JSON.stringify(db[k])) : undefined; });
        } else if (db[key] !== undefined) {
            result[key] = JSON.parse(JSON.stringify(db[key]));
        }
    }
    return result;
}

// 大数据备份采用逐记录 NDJSON + gzip。旧 .ee 仍由原导入逻辑读取。
// 记录保持足够小，避免同时创建完整 db 副本、完整 JSON 字符串和压缩输入。
const OVO_STREAM_BACKUP_FORMAT = 'ovo-stream-backup';
const OVO_STREAM_BACKUP_FORMAT_REVISION = 1;
const OVO_STREAM_HISTORY_BATCH_BYTES = 512 * 1024;
const OVO_STREAM_HISTORY_BATCH_COUNT = 50;

function getBackupDataKeys(selectedKeys) {
    const allGlobalKeys = window.globalSettingKeysForBackup || [];
    const keys = new Set();

    if (!Array.isArray(selectedKeys)) {
        Object.keys(db || {}).forEach(key => keys.add(key));
        allGlobalKeys.forEach(key => {
            if (db[key] !== undefined) keys.add(key);
        });
        ['naiVibeAssets', 'naiVibeEncodings', 'naiVibeGroups', 'musicAssets'].forEach(key => keys.add(key));
    } else {
        selectedKeys.forEach(key => {
            if (key === 'globalSettings') {
                allGlobalKeys.forEach(settingKey => {
                    if (db[settingKey] !== undefined) keys.add(settingKey);
                });
                ['naiVibeAssets', 'naiVibeEncodings', 'naiVibeGroups', 'musicAssets'].forEach(vibeKey => keys.add(vibeKey));
            } else if (key === 'theaterData') {
                THEATER_DB_KEYS.forEach(theaterKey => {
                    if (db[theaterKey] !== undefined) keys.add(theaterKey);
                });
            } else if (db[key] !== undefined) {
                keys.add(key);
            }
        });
    }

    return Array.from(keys).filter(key => !key.startsWith('_export'));
}

function estimateBackupValueBytes(value, limit = OVO_STREAM_HISTORY_BATCH_BYTES) {
    if (value == null) return 4;
    if (typeof value === 'string') return Math.min(limit, value.length * 2 + 2);
    if (typeof value !== 'object') return 16;

    let total = 2;
    const stack = [value];
    const seen = new Set();
    while (stack.length && total < limit) {
        const current = stack.pop();
        if (!current || typeof current !== 'object' || seen.has(current)) continue;
        seen.add(current);
        const values = Array.isArray(current) ? current : Object.values(current);
        for (const item of values) {
            if (typeof item === 'string') total += item.length * 2 + 2;
            else if (item && typeof item === 'object') stack.push(item);
            else total += 16;
            if (total >= limit) break;
        }
    }
    return Math.min(total, limit);
}

async function* createBackupRecordStream(options = {}) {
    const selectedKeys = Array.isArray(options.selectedKeys) ? options.selectedKeys : null;
    const dataKeys = getBackupDataKeys(selectedKeys);
    let recordCount = 0;
    let processedItems = 0;
    let processedMessages = 0;

    const makeRecord = (record) => {
        recordCount++;
        return record;
    };

    yield makeRecord({
        type: 'header',
        format: OVO_STREAM_BACKUP_FORMAT,
        formatRevision: OVO_STREAM_BACKUP_FORMAT_REVISION,
        exportVersion: selectedKeys ? '3.0_partial' : '3.0',
        exportTimestamp: Date.now(),
        partial: !!selectedKeys,
        exportTables: selectedKeys || null,
        dataKeys
    });

    for (const key of dataKeys) {
        const value = /^(?:naiVibe(?:Assets|Encodings|Groups)|musicAssets)$/.test(key) && dexieDB?.[key]
            ? await dexieDB[key].toArray()
            : db[key];
        if (value === undefined) continue;

        if ((key === 'characters' || key === 'groups') && Array.isArray(value)) {
            yield makeRecord({ type: 'array-start', key });
            for (let chatIndex = 0; chatIndex < value.length; chatIndex++) {
                const chat = value[chatIndex];
                const metadata = {};
                Object.keys(chat || {}).forEach(property => {
                    if (property !== 'history') metadata[property] = chat[property];
                });
                yield makeRecord({ type: 'chat-start', key, chatIndex, value: metadata });

                const history = Array.isArray(chat && chat.history) ? chat.history : [];
                let batch = [];
                let batchBytes = 0;
                for (let messageIndex = 0; messageIndex < history.length; messageIndex++) {
                    const message = history[messageIndex];
                    const estimatedBytes = estimateBackupValueBytes(message);
                    if (batch.length && (batch.length >= OVO_STREAM_HISTORY_BATCH_COUNT || batchBytes + estimatedBytes > OVO_STREAM_HISTORY_BATCH_BYTES)) {
                        yield makeRecord({ type: 'chat-history', key, chatIndex, value: batch });
                        processedMessages += batch.length;
                        batch = [];
                        batchBytes = 0;
                    }
                    batch.push(message);
                    batchBytes += estimatedBytes;
                }
                if (batch.length) {
                    yield makeRecord({ type: 'chat-history', key, chatIndex, value: batch });
                    processedMessages += batch.length;
                }
                yield makeRecord({ type: 'chat-end', key, chatIndex });
                processedItems++;
                if (typeof options.onProgress === 'function') {
                    options.onProgress({ key, processedItems, processedMessages, recordCount });
                }
                await yieldBackupTask();
            }
            yield makeRecord({ type: 'array-end', key });
        } else if (Array.isArray(value)) {
            yield makeRecord({ type: 'array-start', key });
            for (let index = 0; index < value.length; index++) {
                yield makeRecord({ type: 'array-item', key, index, value: value[index] });
                processedItems++;
                if (processedItems % 25 === 0) {
                    if (typeof options.onProgress === 'function') {
                        options.onProgress({ key, processedItems, processedMessages, recordCount });
                    }
                    await yieldBackupTask();
                }
            }
            yield makeRecord({ type: 'array-end', key });
        } else if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
            yield makeRecord({ type: 'object-start', key });
            let propertyIndex = 0;
            for (const [property, propertyValue] of Object.entries(value)) {
                yield makeRecord({ type: 'object-entry', key, property, value: propertyValue });
                propertyIndex++;
                processedItems++;
                if (propertyIndex % 25 === 0) await yieldBackupTask();
            }
            yield makeRecord({ type: 'object-end', key });
        } else {
            yield makeRecord({ type: 'value', key, value });
            processedItems++;
        }
    }

    yield {
        type: 'footer',
        recordCount,
        processedItems,
        processedMessages,
        completed: true
    };
}

function yieldBackupTask() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function createBackupCompressionWorker() {
    if (typeof Worker === 'undefined' || typeof CompressionStream === 'undefined') return null;
    const source = `
        let writer = null;
        let readerTask = null;
        let chunks = [];
        const encoder = new TextEncoder();
        self.onmessage = async (event) => {
            const message = event.data || {};
            try {
                if (message.type === 'start') {
                    const compression = new CompressionStream('gzip');
                    writer = compression.writable.getWriter();
                    chunks = [];
                    readerTask = (async () => {
                        const reader = compression.readable.getReader();
                        while (true) {
                            const result = await reader.read();
                            if (result.done) break;
                            chunks.push(result.value);
                        }
                    })();
                    self.postMessage({ type: 'ready' });
                } else if (message.type === 'record') {
                    await writer.write(encoder.encode(JSON.stringify(message.record) + '\\n'));
                    self.postMessage({ type: 'ack' });
                } else if (message.type === 'finish') {
                    await writer.close();
                    await readerTask;
                    const blob = new Blob(chunks, { type: 'application/octet-stream' });
                    chunks = [];
                    self.postMessage({ type: 'done', blob });
                } else if (message.type === 'abort') {
                    if (writer) await writer.abort(new Error('Backup cancelled'));
                    chunks = [];
                    self.close();
                }
            } catch (error) {
                self.postMessage({ type: 'error', message: error && error.message ? error.message : String(error) });
            }
        };
    `;
    const workerUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
        const worker = new Worker(workerUrl);
        worker.__ovoWorkerUrl = workerUrl;
        return worker;
    } catch (error) {
        URL.revokeObjectURL(workerUrl);
        console.warn('备份 Worker 不可用，使用分块主线程兼容模式:', error);
        return null;
    }
}

function waitForBackupWorker(worker, expectedType, signal) {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            worker.removeEventListener('message', onMessage);
            worker.removeEventListener('error', onError);
            if (signal) signal.removeEventListener('abort', onAbort);
        };
        const onMessage = event => {
            const message = event.data || {};
            if (message.type === 'error') {
                cleanup();
                reject(new Error(message.message || '备份后台任务失败'));
            } else if (message.type === expectedType) {
                cleanup();
                resolve(message);
            }
        };
        const onError = event => {
            cleanup();
            reject(event.error || new Error(event.message || '备份后台任务失败'));
        };
        const onAbort = () => {
            cleanup();
            reject(new DOMException('Backup cancelled', 'AbortError'));
        };
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        if (signal) {
            if (signal.aborted) return onAbort();
            signal.addEventListener('abort', onAbort, { once: true });
        }
    });
}

async function compressBackupRecordsOnMainThread(recordStream, signal) {
    const encoder = new TextEncoder();
    const iterator = recordStream[Symbol.asyncIterator]();
    const readable = new ReadableStream({
        async pull(controller) {
            if (signal && signal.aborted) {
                controller.error(new DOMException('Backup cancelled', 'AbortError'));
                return;
            }
            const result = await iterator.next();
            if (result.done) controller.close();
            else controller.enqueue(encoder.encode(JSON.stringify(result.value) + '\n'));
        },
        async cancel() {
            if (iterator.return) await iterator.return();
        }
    });
    return new Response(readable.pipeThrough(new CompressionStream('gzip'))).blob();
}

async function createCompressedBackupBlob(options = {}) {
    const signal = options.signal;
    const worker = createBackupCompressionWorker();
    if (!worker) return compressBackupRecordsOnMainThread(createBackupRecordStream(options), signal);

    try {
        worker.postMessage({ type: 'start' });
        await waitForBackupWorker(worker, 'ready', signal);
        for await (const record of createBackupRecordStream(options)) {
            if (signal && signal.aborted) throw new DOMException('Backup cancelled', 'AbortError');
            worker.postMessage({ type: 'record', record });
            await waitForBackupWorker(worker, 'ack', signal);
        }
        worker.postMessage({ type: 'finish' });
        const result = await waitForBackupWorker(worker, 'done', signal);
        return result.blob;
    } catch (error) {
        if (error && error.name === 'AbortError') throw error;
        console.warn('备份 Worker 执行失败，使用分块主线程兼容模式:', error);
        return compressBackupRecordsOnMainThread(createBackupRecordStream(options), signal);
    } finally {
        worker.terminate();
        if (worker.__ovoWorkerUrl) URL.revokeObjectURL(worker.__ovoWorkerUrl);
    }
}

async function* readGzipBackupLines(file) {
    const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const result = await reader.read();
        if (result.done) break;
        buffer += decoder.decode(result.value, { stream: true });
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            if (line.trim()) yield line;
        }
    }
    buffer += decoder.decode();
    if (buffer.trim()) yield buffer;
}

async function inspectBackupArchive(file) {
    try {
        const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let prefix = '';
        while (prefix.length < 65536) {
            const result = await reader.read();
            if (result.done) break;
            prefix += decoder.decode(result.value, { stream: true });
            const newlineIndex = prefix.indexOf('\n');
            if (newlineIndex !== -1) {
                const firstRecord = JSON.parse(prefix.slice(0, newlineIndex));
                await reader.cancel();
                if (firstRecord && firstRecord.type === 'header' && firstRecord.format === OVO_STREAM_BACKUP_FORMAT) {
                    return { stream: true, header: firstRecord };
                }
                return { stream: false, header: null };
            }
        }
        await reader.cancel();
        // 旧格式是单个完整 JSON，通常没有换行；无需在探测阶段把它完整读入内存。
        return { stream: false, header: null };
    } catch (error) {
        if (error instanceof SyntaxError) return { stream: false, header: null };
        throw error;
    }
}

async function validateStreamBackup(file, onProgress) {
    let header = null;
    let footer = null;
    let parsedRecordCount = 0;
    let uncompressedBytes = 0;
    for await (const line of readGzipBackupLines(file)) {
        uncompressedBytes += line.length * 2 + 2;
        const record = JSON.parse(line);
        if (!header) {
            if (record.type !== 'header' || record.format !== OVO_STREAM_BACKUP_FORMAT) {
                throw new Error('不是有效的大数据备份文件');
            }
            header = record;
        } else if (record.type === 'footer') {
            footer = record;
        } else {
            parsedRecordCount++;
            if (parsedRecordCount % 200 === 0 && typeof onProgress === 'function') {
                onProgress(`正在校验备份... ${parsedRecordCount} 条`);
                await yieldBackupTask();
            }
        }
    }
    if (!footer || !footer.completed) throw new Error('备份文件不完整，缺少完成标记');
    if (footer.recordCount !== parsedRecordCount + 1) throw new Error('备份文件记录数量校验失败');
    return { header, footer, uncompressedBytes };
}

async function ensureImportStorageCapacity(validation, isPartial) {
    if (isPartial || !navigator.storage || !navigator.storage.estimate) return;
    try {
        const estimate = await navigator.storage.estimate();
        if (!Number.isFinite(estimate.quota) || !Number.isFinite(estimate.usage)) return;
        const available = estimate.quota - estimate.usage;
        const required = Math.ceil(validation.uncompressedBytes * 1.15);
        if (available < required) {
            throw new Error(`存储空间不足：安全导入约需 ${formatBytes(required)} 可用空间，当前约剩余 ${formatBytes(Math.max(0, available))}`);
        }
    } catch (error) {
        if (error && error.message && error.message.startsWith('存储空间不足')) throw error;
    }
}

function getDexieTableForBackupKey(key, staging = false) {
    if (!dexieDB) return null;
    if (key === 'musicAssets' && dexieDB.musicAssets) return staging ? dexieDB.importMusicAssets : dexieDB.musicAssets;
    if (key === 'characters') return staging ? dexieDB.importCharacters : dexieDB.characters;
    if (key === 'groups') return staging ? dexieDB.importGroups : dexieDB.groups;
    if (key === 'worldBooks') return staging ? dexieDB.importWorldBooks : dexieDB.worldBooks;
    if (key === 'myStickers') return staging ? dexieDB.importMyStickers : dexieDB.myStickers;
    if (key === 'archives' && dexieDB.archives) return staging ? dexieDB.importArchives : dexieDB.archives;
    if (key === 'naiVibeAssets' && dexieDB.naiVibeAssets) return staging ? dexieDB.importNaiVibeAssets : dexieDB.naiVibeAssets;
    if (key === 'naiVibeEncodings' && dexieDB.naiVibeEncodings) return staging ? dexieDB.importNaiVibeEncodings : dexieDB.naiVibeEncodings;
    if (key === 'naiVibeGroups' && dexieDB.naiVibeGroups) return staging ? dexieDB.importNaiVibeGroups : dexieDB.naiVibeGroups;
    return null;
}

function getImportStagingTables() {
    return [
        dexieDB.importCharacters,
        dexieDB.importGroups,
        dexieDB.importWorldBooks,
        dexieDB.importMyStickers,
        dexieDB.importArchives,
        dexieDB.importGlobalSettings,
        dexieDB.importNaiVibeAssets,
        dexieDB.importNaiVibeEncodings,
        dexieDB.importNaiVibeGroups,
        dexieDB.importMusicAssets
    ].filter(Boolean);
}

async function clearImportStaging() {
    await Promise.all(getImportStagingTables().map(table => table.clear()));
}

async function copyDexieTableRecords(source, target) {
    await source.toCollection().each(record => {
        return target.put(record);
    });
}

async function commitImportStaging(isPartial) {
    const coreTables = [
        dexieDB.characters,
        dexieDB.groups,
        dexieDB.worldBooks,
        dexieDB.myStickers,
        dexieDB.globalSettings,
        dexieDB.archives,
        dexieDB.naiVibeAssets,
        dexieDB.naiVibeEncodings,
        dexieDB.naiVibeGroups,
        dexieDB.musicAssets
    ].filter(Boolean);
    const stagingTables = getImportStagingTables();
    await dexieDB.transaction('rw', [...coreTables, ...stagingTables], async () => {
        if (!isPartial) await Promise.all(coreTables.map(table => table.clear()));
        await copyDexieTableRecords(dexieDB.importCharacters, dexieDB.characters);
        await copyDexieTableRecords(dexieDB.importGroups, dexieDB.groups);
        await copyDexieTableRecords(dexieDB.importWorldBooks, dexieDB.worldBooks);
        await copyDexieTableRecords(dexieDB.importMyStickers, dexieDB.myStickers);
        if (dexieDB.archives && dexieDB.importArchives) {
            await copyDexieTableRecords(dexieDB.importArchives, dexieDB.archives);
        }
        await copyDexieTableRecords(dexieDB.importNaiVibeAssets, dexieDB.naiVibeAssets);
        await copyDexieTableRecords(dexieDB.importNaiVibeEncodings, dexieDB.naiVibeEncodings);
        await copyDexieTableRecords(dexieDB.importNaiVibeGroups, dexieDB.naiVibeGroups);
        if (dexieDB.musicAssets && dexieDB.importMusicAssets) await copyDexieTableRecords(dexieDB.importMusicAssets, dexieDB.musicAssets);
        await copyDexieTableRecords(dexieDB.importGlobalSettings, dexieDB.globalSettings);
        await Promise.all(stagingTables.map(table => table.clear()));
    });
}

async function importStreamBackupData(file, options = {}) {
    const startTime = Date.now();
    const validation = await validateStreamBackup(file, options.onProgress);
    const isPartial = !!validation.header.partial;
    if (options.requirePartial && !isPartial) {
        return { success: false, error: '请选择由「分类导出」生成的文件（.ee）' };
    }
    if (!options.requirePartial && isPartial) {
        return { success: false, error: '这是分类导出文件，请使用「分类导入」' };
    }
    await ensureImportStorageCapacity(validation, isPartial);

    try {
        if (typeof options.onProgress === 'function') options.onProgress('正在准备安全写入...');
        await clearImportStaging();

        let currentChat = null;
        let currentChatKey = null;
        const pendingCollections = new Map();
        const tableBuffers = new Map();
        let importedRecords = 0;

        const saveSetting = async (key, value) => {
            await dexieDB.importGlobalSettings.put({ key, value });
        };

        const flushTableBuffer = async (key) => {
            const buffer = tableBuffers.get(key);
            if (!buffer || !buffer.length) return;
            const table = getDexieTableForBackupKey(key, true);
            if (!table) return;
            await table.bulkPut(buffer);
            buffer.length = 0;
        };

        for await (const line of readGzipBackupLines(file)) {
            const record = JSON.parse(line);
            if (record.type === 'header' || record.type === 'footer') continue;

            if (record.type === 'chat-start') {
                currentChatKey = record.key;
                currentChat = record.value || {};
                currentChat.history = [];
            } else if (record.type === 'chat-history') {
                if (!currentChat || currentChatKey !== record.key) throw new Error('聊天记录分块顺序异常');
                currentChat.history.push(...(record.value || []));
            } else if (record.type === 'chat-end') {
                if (!currentChat || currentChatKey !== record.key) throw new Error('聊天记录结束标记异常');
                if (!currentChat.theme) currentChat.theme = 'white_pink';
                const table = getDexieTableForBackupKey(currentChatKey, true);
                if (!table) throw new Error(`找不到数据表: ${currentChatKey}`);
                await table.put(currentChat);
                currentChat = null;
                currentChatKey = null;
            } else if (record.type === 'array-start') {
                if (!getDexieTableForBackupKey(record.key, true)) pendingCollections.set(record.key, []);
            } else if (record.type === 'array-item') {
                const table = getDexieTableForBackupKey(record.key, true);
                if (table) {
                    if (!tableBuffers.has(record.key)) tableBuffers.set(record.key, []);
                    const buffer = tableBuffers.get(record.key);
                    buffer.push(record.value);
                    if (buffer.length >= 50) await flushTableBuffer(record.key);
                } else {
                    if (!pendingCollections.has(record.key)) pendingCollections.set(record.key, []);
                    pendingCollections.get(record.key).push(record.value);
                }
            } else if (record.type === 'array-end') {
                await flushTableBuffer(record.key);
                if (pendingCollections.has(record.key)) {
                    await saveSetting(record.key, pendingCollections.get(record.key));
                    pendingCollections.delete(record.key);
                }
            } else if (record.type === 'object-start') {
                pendingCollections.set(record.key, {});
            } else if (record.type === 'object-entry') {
                if (!pendingCollections.has(record.key)) pendingCollections.set(record.key, {});
                pendingCollections.get(record.key)[record.property] = record.value;
            } else if (record.type === 'object-end') {
                await saveSetting(record.key, pendingCollections.get(record.key) || {});
                pendingCollections.delete(record.key);
            } else if (record.type === 'value') {
                await saveSetting(record.key, record.value);
            }

            importedRecords++;
            if (importedRecords % 100 === 0) {
                if (typeof options.onProgress === 'function') options.onProgress(`正在写入... ${importedRecords} 条`);
                await yieldBackupTask();
            }
        }

        if (currentChat) throw new Error('聊天记录未完整写入');
        for (const key of tableBuffers.keys()) await flushTableBuffer(key);
        if (!isPartial) {
            // 正式提交前释放旧的大数组；事务失败时会从正式库重新加载。
            db.characters = [];
            db.groups = [];
            db.worldBooks = [];
            db.myStickers = [];
            db.archives = [];
        }
        if (typeof options.onProgress === 'function') options.onProgress('正在提交已校验的数据...');
        await commitImportStaging(isPartial);
        return {
            success: true,
            message: `${isPartial ? '分类导入' : '导入'}完成 (耗时${Date.now() - startTime}ms)`,
            header: validation.header
        };
    } catch (error) {
        console.error('流式导入失败:', error);
        try {
            await clearImportStaging();
            if (!isPartial && typeof loadData === 'function') await loadData();
        } catch (restoreError) {
            console.error('恢复当前数据视图失败:', restoreError);
        }
        return { success: false, error: error.message, duration: Date.now() - startTime };
    }
}

window.createCompressedBackupBlob = createCompressedBackupBlob;
window.inspectBackupArchive = inspectBackupArchive;
window.importStreamBackupData = importStreamBackupData;

async function stageBackupObject(data, isPartial) {
    await clearImportStaging();
    const tableKeys = new Set(['characters', 'groups', 'worldBooks', 'myStickers', 'archives', 'naiVibeAssets', 'naiVibeEncodings', 'naiVibeGroups', 'musicAssets']);
    try {
        for (const [key, value] of Object.entries(data)) {
            if (key.startsWith('_export') || key === '__chunks__' || value === undefined) continue;
            if (tableKeys.has(key)) {
                if (!Array.isArray(value)) continue;
                const table = getDexieTableForBackupKey(key, true);
                if (!table) continue;
                for (let index = 0; index < value.length; index += 25) {
                    const batch = value.slice(index, index + 25);
                    if (key === 'characters' || key === 'groups') {
                        batch.forEach(chat => {
                            if (!chat.theme) chat.theme = 'white_pink';
                        });
                    }
                    await table.bulkPut(batch);
                    await yieldBackupTask();
                }
            } else {
                await dexieDB.importGlobalSettings.put({ key, value });
            }
        }
        if (!isPartial) {
            db.characters = [];
            db.groups = [];
            db.worldBooks = [];
            db.myStickers = [];
            db.archives = [];
        }
        await commitImportStaging(isPartial);
    } catch (error) {
        await clearImportStaging();
        if (!isPartial && typeof loadData === 'function') await loadData();
        throw error;
    }
}

// 分类导入：只合并文件里包含的表，不覆盖其他数据
async function importPartialBackupData(data) {
    const startTime = Date.now();
    const tables = data._exportTables || [];
    if (tables.length === 0) return { success: false, error: '文件中没有可导入的分类' };
    try {
        const partialData = {};
        for (const key of tables) {
            if (key === 'globalSettings' && data.globalSettings) {
                Object.assign(partialData, data.globalSettings);
            } else if (key === 'theaterData' && data.theaterData) {
                Object.assign(partialData, data.theaterData);
            } else if (data[key] !== undefined) {
                partialData[key] = data[key];
            }
        }
        showToast('正在写入...');
        await stageBackupObject(partialData, true);
        const duration = Date.now() - startTime;
        return { success: true, message: `分类导入完成 (耗时${duration}ms)` };
    } catch (error) {
        console.error('分类导入失败:', error);
        return { success: false, error: error.message };
    }
}

// 导入备份数据
async function importBackupData(data) {
    const startTime = Date.now();
    try {
        let convertedData = data;

        if (data._exportVersion !== '3.0') {
            showToast('检测到旧版备份文件，正在转换格式...');
            
            const reassembleHistory = (chat, backupData) => {
                if (!chat.history || !Array.isArray(chat.history) || chat.history.length === 0) {
                    return [];
                }
                if (typeof chat.history[0] === 'object' && chat.history[0] !== null) {
                    return chat.history;
                }
                if (backupData.__chunks__ && typeof chat.history[0] === 'string') {
                    let fullHistory = [];
                    chat.history.forEach(key => {
                        if (backupData.__chunks__[key]) {
                            try {
                                const chunk = JSON.parse(backupData.__chunks__[key]);
                                fullHistory = fullHistory.concat(chunk);
                            } catch (e) {
                                console.error(`Failed to parse history chunk ${key}`, e);
                            }
                        }
                    });
                    return fullHistory;
                }
                return []; 
            };

            const newData = { ...data };

            if (newData.characters) {
                newData.characters = newData.characters.map(char => ({
                    ...char,
                    history: reassembleHistory(char, data)
                }));
            }
            if (newData.groups) {
                newData.groups = newData.groups.map(group => ({
                    ...group,
                    history: reassembleHistory(group, data)
                }));
            }
            
            convertedData = newData;
        }

        // 从备份恢复所有键（不限于当前 db 的键），避免漏掉主题预设、屏幕预设等。
        // 使用独立对象补全缺省值，不在文件校验和暂存成功前覆盖当前内存数据。
        const metaKeys = ['_exportVersion', '_exportTimestamp', '_exportTables'];
        const restoredData = {};
        Object.keys(convertedData).forEach(key => {
            if (metaKeys.includes(key)) return;
            if (convertedData[key] !== undefined) {
                restoredData[key] = convertedData[key];
            }
        });

        // 补全角色/群聊缺失字段（如主题等），避免旧版备份或残缺数据导致预设丢失
        (restoredData.characters || []).forEach(c => {
            if (c.theme === undefined || c.theme === null || c.theme === '') c.theme = 'white_pink';
        });
        (restoredData.groups || []).forEach(g => {
            if (g.theme === undefined || g.theme === null || g.theme === '') g.theme = 'white_pink';
        });

        if (!Array.isArray(restoredData.pomodoroRecords)) restoredData.pomodoroRecords = [];
        if (!restoredData.pomodoroActiveSession) restoredData.pomodoroActiveSession = null;
        if (!restoredData.pomodoroTasks) restoredData.pomodoroTasks = [];
        if (!restoredData.pomodoroSettings) restoredData.pomodoroSettings = { boundCharId: null, userPersona: '', focusBackground: '', taskCardBackground: '', encouragementMinutes: 25, pokeLimit: 5, globalWorldBookIds: [] };
        if (!restoredData.insWidgetSettings) restoredData.insWidgetSettings = { avatar1: 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg', bubble1: 'love u.', avatar2: 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg', bubble2: 'miss u.' };
        if (!restoredData.homeWidgetSettings) restoredData.homeWidgetSettings = JSON.parse(JSON.stringify(defaultWidgetSettings));
        if (!Array.isArray(restoredData.themePresets)) restoredData.themePresets = [];
        if (!restoredData.themeSettings || typeof restoredData.themeSettings !== 'object') restoredData.themeSettings = { global: {}, wallpapers: {}, bottomNav: {}, chatScreen: {} };
        if (!Array.isArray(restoredData.iconPresets)) restoredData.iconPresets = [];
        if (!Array.isArray(restoredData.homeWidgetPresets)) restoredData.homeWidgetPresets = [];
        if (!Array.isArray(restoredData.widgetWallpaperPresets)) restoredData.widgetWallpaperPresets = [];

        showToast('正在写入新数据...');
        await stageBackupObject(restoredData, false);

        const duration = Date.now() - startTime;
        const message = `导入完成 (耗时${duration}ms)`;
        
        return { success: true, message: message };

    } catch (error) {
        console.error('导入数据失败:', error);
        return {
            success: false,
            error: error.message,
            duration: Date.now() - startTime
        };
    }
}

// GitHub Manager
