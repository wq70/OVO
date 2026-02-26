// --- 角色导入与创建模块 ---

let pendingImportData = null;

function setupAddCharModal() {
    document.getElementById('add-char-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newChar = {
            peekData: {},
            id: `char_${Date.now()}`,
            realName: document.getElementById('char-real-name').value,
            remarkName: document.getElementById('char-remark-name').value,
            persona: document.getElementById('char-persona-input').value || '',
            avatar: 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg',
            myName: document.getElementById('my-name-for-char').value || 'user',
            myPersona: '',
            myAvatar: 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg',
            theme: 'white_pink',
            maxMemory: 100,
            chatBg: '',
            history: [],
            isPinned: false,
            status: '在线',
            worldBookIds: [],
            useCustomBubbleCss: false,
            customBubbleCss: '',
            bilingualBubbleStyle: 'under',
            unreadCount: 0,
            memoryJournals: [],
            journalWorldBookIds: [],
            peekScreenSettings: { wallpaper: '', customIcons: {}, unlockAvatar: '' },
            lastUserMessageTimestamp: null,
            statusPanel: {
                enabled: false,
                promptSuffix: '',
                regexPattern: '',
                replacePattern: '',
                historyLimit: 3,
                currentStatusRaw: '',
                currentStatusHtml: '',
                history: []
            },
            autoReply: {
                enabled: false,
                interval: 60,
                lastTriggerTime: 0
            }
        };
        db.characters.push(newChar);
        await saveData();
        renderChatList();
        document.getElementById('add-char-modal').classList.remove('visible');
        // 重置表单并清除导入提示
        document.getElementById('add-char-form').reset();
        const personaInput = document.getElementById('char-persona-input');
        if (personaInput) personaInput.value = '';
        const hint = document.getElementById('char-persona-import-hint');
        if (hint) hint.style.display = 'none';
        // 隐藏角色描述区块，恢复手动创建原始状态
        const personaGroup = document.getElementById('char-persona-group');
        if (personaGroup) personaGroup.style.display = 'none';
        showToast(`角色“${newChar.remarkName}”创建成功！`);
        promptForBackupIfNeeded('new_char');
        // 批量导入：继续处理队列中剩余文件
        checkAndContinueDocImportQueue();
    });
}

async function handleCharacterImport(file) {
    if (!file) return;
    showToast('正在解析角色卡...');
    try {
        let result;
        if (file.name.endsWith('.png')) {
            result = await parseCharPng(file);
        } else if (file.name.endsWith('.json')) {
            result = await parseCharJson(file);
        } else {
            throw new Error('不支持的文件格式。请选择 .png 或 .json 文件。');
        }

        if (result) {
            showImportConfirmModal(result.data, result.avatar);
        }
    } catch (error) {
        console.error('角色卡导入失败:', error);
        showToast(`导入失败: ${error.message}`);
    }
}

function parseCharPng(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = (e) => {
            try {
                const buffer = e.target.result;
                const view = new DataView(buffer);
                const signature = [137, 80, 78, 71, 13, 10, 26, 10];
                for (let i = 0; i < signature.length; i++) {
                    if (view.getUint8(i) !== signature[i]) {
                        return reject(new Error('文件不是一个有效的PNG。'));
                    }
                }

                let offset = 8;
                let charaData = null;

                while (offset < view.byteLength) {
                    const length = view.getUint32(offset);
                    const type = String.fromCharCode(view.getUint8(offset + 4), view.getUint8(offset + 5), view.getUint8(offset + 6), view.getUint8(offset + 7));

                    if (type === 'tEXt') {
                        const textChunk = new Uint8Array(buffer, offset + 8, length);
                        let separatorIndex = -1;
                        for (let i = 0; i < textChunk.length; i++) {
                            if (textChunk[i] === 0) {
                                separatorIndex = i;
                                break;
                            }
                        }

                        if (separatorIndex !== -1) {
                            const keyword = new TextDecoder('utf-8').decode(textChunk.slice(0, separatorIndex));
                            if (keyword === 'chara') {
                                const base64Data = new TextDecoder('utf-8').decode(textChunk.slice(separatorIndex + 1));
                                try {
                                    const decodedString = atob(base64Data);
                                    const bytes = new Uint8Array(decodedString.length);
                                    for (let i = 0; i < decodedString.length; i++) {
                                        bytes[i] = decodedString.charCodeAt(i);
                                    }
                                    const utf8Decoder = new TextDecoder('utf-8');
                                    charaData = JSON.parse(utf8Decoder.decode(bytes));
                                    break;
                                } catch (decodeError) {
                                    return reject(new Error(`解析角色数据失败: ${decodeError.message}`));
                                }
                            }
                        }
                    }
                    offset += 12 + length;
                }

                if (charaData) {
                    const imageReader = new FileReader();
                    imageReader.readAsDataURL(file);
                    imageReader.onload = (imgEvent) => {
                        resolve({ data: charaData, avatar: imgEvent.target.result });
                    };
                    imageReader.onerror = () => {
                        resolve({ data: charaData, avatar: 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg' });
                    };
                } else {
                    reject(new Error('在PNG中未找到有效的角色数据 (tEXt chunk not found or invalid)。'));
                }
            } catch (error) {
                reject(new Error(`解析PNG失败: ${error.message}`));
            }
        };
        reader.onerror = () => reject(new Error('读取PNG文件失败。'));
    });
}

function parseCharJson(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsText(file, 'UTF-8');
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                resolve({ data: data, avatar: 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg' });
            } catch (error) {
                reject(new Error(`解析JSON失败: ${error.message}`));
            }
        };
        reader.onerror = () => reject(new Error('读取JSON文件失败。'));
    });
}

async function createCharacterFromData(data, avatar) {
    const charData = data.data || data;

    if (!charData || !charData.name) {
        throw new Error('角色卡数据无效，缺少角色名称。');
    }

    const newChar = {
        peekData: {},
        id: `char_${Date.now()}`,
        realName: charData.name || '未命名',
        remarkName: charData.name || '未命名',
        persona: charData.description || charData.persona || '',
        avatar: avatar || 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg',
        myName: 'user',
        myPersona: '',
        myAvatar: 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg',
        theme: 'white_pink',
        maxMemory: 100,
        chatBg: '',
        history: [],
        isPinned: false,
        status: '在线',
        worldBookIds: [],
        useCustomBubbleCss: false,
        customBubbleCss: '',
        bilingualBubbleStyle: 'under',
        unreadCount: 0,
        memoryJournals: [],
        journalWorldBookIds: [],
        peekScreenSettings: { wallpaper: '', customIcons: {}, unlockAvatar: '' },
        lastUserMessageTimestamp: null,
        statusPanel: {
            enabled: false,
            promptSuffix: '',
            regexPattern: '',
            replacePattern: '',
            historyLimit: 3,
            currentStatusRaw: '',
            currentStatusHtml: '',
            history: []
        },
        autoReply: {
            enabled: false,
            interval: 60,
            lastTriggerTime: 0
        }
    };

    const importedWorldBookIds = [];

    if (charData.character_book && Array.isArray(charData.character_book.entries)) {
        const categoryName = data.name || charData.name;
        charData.character_book.entries.forEach(entry => {
            const name = entry.comment;
            const content = entry.content;
            if (name && content) {
                // 策略：内容相同则复用，内容不同则重命名导入
                const exactMatch = db.worldBooks.find(wb => wb.name.toLowerCase() === name.toLowerCase() && wb.content === content);
                if (exactMatch) {
                    if (!importedWorldBookIds.includes(exactMatch.id)) importedWorldBookIds.push(exactMatch.id);
                } else {
                    // 检查是否已经导入过重命名版本
                    const renamedName = `${name} (${categoryName})`;
                    const renamedMatch = db.worldBooks.find(wb => wb.name.toLowerCase() === renamedName.toLowerCase() && wb.content === content);

                    if (renamedMatch) {
                        if (!importedWorldBookIds.includes(renamedMatch.id)) importedWorldBookIds.push(renamedMatch.id);
                    } else {
                        // 需要新建
                        let newBookName = name;
                        const nameConflict = db.worldBooks.find(wb => wb.name.toLowerCase() === name.toLowerCase());
                        if (nameConflict) {
                            newBookName = renamedName;
                            // 二次冲突检查
                            if (db.worldBooks.some(wb => wb.name.toLowerCase() === newBookName.toLowerCase())) {
                                newBookName = `${newBookName}_${Math.random().toString(36).substr(2, 4)}`;
                            }
                        }

                        const newBook = {
                            id: `wb_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                            name: newBookName,
                            content: content,
                            position: 'after',
                            category: categoryName
                        };
                        db.worldBooks.push(newBook);
                        importedWorldBookIds.push(newBook.id);
                    }
                }
            }
        });
    }
    else {
        const worldInfo = charData.world_info || charData.wi || '';
        if (worldInfo && typeof worldInfo === 'string' && worldInfo.trim() !== '') {
            const entries = worldInfo.split(/\n\s*\n/).filter(entry => entry.trim() !== '');
            entries.forEach(entryText => {
                const lines = entryText.trim().split('\n');
                if (lines.length > 0) {
                    const name = lines[0].trim();
                    const content = lines.slice(1).join('\n').trim();
                    if (name && content) {
                        const categoryName = '导入的角色设定';
                        // 策略：内容相同则复用，内容不同则重命名导入
                        const exactMatch = db.worldBooks.find(wb => wb.name.toLowerCase() === name.toLowerCase() && wb.content === content);
                        if (exactMatch) {
                            if (!importedWorldBookIds.includes(exactMatch.id)) importedWorldBookIds.push(exactMatch.id);
                        } else {
                            // 检查是否已经导入过重命名版本
                            const renamedName = `${name} (${charData.name || '未命名'})`;
                            const renamedMatch = db.worldBooks.find(wb => wb.name.toLowerCase() === renamedName.toLowerCase() && wb.content === content);

                            if (renamedMatch) {
                                if (!importedWorldBookIds.includes(renamedMatch.id)) importedWorldBookIds.push(renamedMatch.id);
                            } else {
                                // 需要新建
                                let newBookName = name;
                                const nameConflict = db.worldBooks.find(wb => wb.name.toLowerCase() === name.toLowerCase());
                                if (nameConflict) {
                                    newBookName = renamedName;
                                    // 二次冲突检查
                                    if (db.worldBooks.some(wb => wb.name.toLowerCase() === newBookName.toLowerCase())) {
                                        newBookName = `${newBookName}_${Math.random().toString(36).substr(2, 4)}`;
                                    }
                                }

                                const newBook = {
                                    id: `wb_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                                    name: newBookName,
                                    content: content,
                                    position: 'after',
                                    category: categoryName
                                };
                                db.worldBooks.push(newBook);
                                importedWorldBookIds.push(newBook.id);
                            }
                        }
                    }
                }
            });
        }
    }

    if (importedWorldBookIds.length > 0) {
        newChar.worldBookIds = importedWorldBookIds;
        setTimeout(() => {
            showToast(`同时导入了 ${importedWorldBookIds.length} 条世界书设定。`);
        }, 1600);
    }

    db.characters.push(newChar);
    await saveData();
    renderChatList();
    showToast(`角色“${newChar.remarkName}”导入成功！`);
}

function setupImportConfirmModal() {
    const modal = document.getElementById('import-confirm-modal');
    const form = document.getElementById('import-confirm-form');
    const cancelBtn = document.getElementById('cancel-import-btn');
    const nameInput = document.getElementById('import-char-name');

    if (!modal || !form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!pendingImportData) return;

        const newName = nameInput.value.trim();
        if (!newName) return showToast('请输入角色真名');

        // 更新名字
        if (pendingImportData.data.data) {
            // 适配 V2 格式 (data.data.name)
            pendingImportData.data.data.name = newName;
        } else {
            // 适配 V1 格式 (data.name)
            pendingImportData.data.name = newName;
        }

        try {
            await createCharacterFromData(pendingImportData.data, pendingImportData.avatar);
            modal.classList.remove('visible');
            pendingImportData = null;
        } catch (error) {
            console.error(error);
            showToast('创建角色失败: ' + error.message);
        }
    });

    cancelBtn.addEventListener('click', () => {
        modal.classList.remove('visible');
        pendingImportData = null;
    });
}

function showImportConfirmModal(data, avatar) {
    const modal = document.getElementById('import-confirm-modal');
    const nameInput = document.getElementById('import-char-name');

    if (!modal) return;

    pendingImportData = { data, avatar };

    // 获取原始名字
    let originalName = '';
    if (data.data && data.data.name) {
        originalName = data.data.name;
    } else if (data.name) {
        originalName = data.name;
    }

    nameInput.value = originalName;
    modal.classList.add('visible');
}

// ============================================================
// 文档导入功能模块 (TXT / DOCX / ZIP)
// ============================================================

// 全局状态：待处理的文档导入队列
let docImportQueue = [];      // [{name, content}, ...]
let docImportCurrentIndex = 0;

/**
 * 打开创建方式选择 Action Sheet
 */
function openCreateCharMethodSheet() {
    const sheet = document.getElementById('create-char-method-sheet');
    if (sheet) sheet.classList.add('visible');
}

/**
 * 设置创建方式 Action Sheet 的事件绑定
 */
function setupCreateCharMethodSheet() {
    const sheet = document.getElementById('create-char-method-sheet');
    if (!sheet) return;

    // 手动创建：打开原有 modal
    document.getElementById('method-manual-btn').addEventListener('click', () => {
        sheet.classList.remove('visible');
        const addCharModal = document.getElementById('add-char-modal');
        const addCharForm = document.getElementById('add-char-form');
        // 清空任何之前的导入内容
        const personaInput = document.getElementById('char-persona-input');
        const hint = document.getElementById('char-persona-import-hint');
        if (personaInput) personaInput.value = '';
        if (hint) hint.style.display = 'none';
        // 手动创建时隐藏角色描述区块，且不启用弹窗滚动条
        const personaGroup = document.getElementById('char-persona-group');
        if (personaGroup) personaGroup.style.display = 'none';
        if (addCharModal) addCharModal.classList.remove('import-mode');
        if (addCharForm) addCharForm.reset();
        if (addCharModal) addCharModal.classList.add('visible');
    });

    // 导入文档
    document.getElementById('method-import-doc-btn').addEventListener('click', () => {
        sheet.classList.remove('visible');
        openDocImportSelectModal();
    });

    // 取消
    document.getElementById('method-cancel-btn').addEventListener('click', () => {
        sheet.classList.remove('visible');
    });

    // 点击遮罩关闭
    sheet.addEventListener('click', (e) => {
        if (e.target === sheet) sheet.classList.remove('visible');
    });
}

/**
 * 打开文件选择模态框
 */
function openDocImportSelectModal() {
    const modal = document.getElementById('doc-import-select-modal');
    const fileList = document.getElementById('doc-import-file-list');
    const startBtn = document.getElementById('doc-import-start-btn');
    const fileInput = document.getElementById('doc-import-file-input');
    if (!modal) return;

    // 重置状态
    fileList.innerHTML = '';
    startBtn.disabled = true;
    fileInput.value = '';
    modal.classList.add('visible');
}

/**
 * 设置文档选择模态框交互
 */
function setupDocImportSelectModal() {
    const modal = document.getElementById('doc-import-select-modal');
    if (!modal) return;

    const fileInput = document.getElementById('doc-import-file-input');
    const dropZone = document.getElementById('doc-import-drop-zone');
    const fileList = document.getElementById('doc-import-file-list');
    const startBtn = document.getElementById('doc-import-start-btn');
    const cancelBtn = document.getElementById('doc-import-cancel-btn');
    const closeBtn = document.getElementById('doc-import-close-btn');

    let selectedFiles = [];

    function renderFileList() {
        fileList.innerHTML = '';
        if (selectedFiles.length === 0) {
            startBtn.disabled = true;
            return;
        }
        startBtn.disabled = false;
        selectedFiles.forEach((file, idx) => {
            const ext = file.name.split('.').pop().toLowerCase();
            const icon = ext === 'zip' ? '🗜️' : ext === 'docx' ? '📝' : '📄';
            const item = document.createElement('div');
            item.style.cssText = 'display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:8px; background:#f8f8f8; margin-bottom:6px;';
            item.innerHTML = `
                <span style="font-size:18px;">${icon}</span>
                <span style="flex:1; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${file.name}</span>
                <button data-idx="${idx}" style="background:none; border:none; color:#ff4d4f; cursor:pointer; font-size:16px; padding:2px 6px;">×</button>
            `;
            item.querySelector('button').addEventListener('click', () => {
                selectedFiles.splice(idx, 1);
                renderFileList();
            });
            fileList.appendChild(item);
        });
    }

    function handleFiles(files) {
        const validExts = ['txt', 'docx', 'zip'];
        const newFiles = Array.from(files).filter(f => {
            const ext = f.name.split('.').pop().toLowerCase();
            return validExts.includes(ext);
        });
        if (newFiles.length < Array.from(files).length) {
            showToast('部分文件格式不支持，已自动过滤（仅支持 TXT/DOCX/ZIP）');
        }
        selectedFiles = [...selectedFiles, ...newFiles];
        // 去重（按文件名）
        const seen = new Set();
        selectedFiles = selectedFiles.filter(f => {
            if (seen.has(f.name)) return false;
            seen.add(f.name);
            return true;
        });
        renderFileList();
    }

    // 点击 drop zone 触发选文件
    dropZone.addEventListener('click', () => fileInput.click());

    // 文件 input 变化
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
        e.target.value = '';
    });

    // 拖拽入
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#4a90e2';
        dropZone.style.background = '#f0f7ff';
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = '#ddd';
        dropZone.style.background = '';
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#ddd';
        dropZone.style.background = '';
        handleFiles(e.dataTransfer.files);
    });

    // 取消/关闭
    [cancelBtn, closeBtn].forEach(btn => {
        btn.addEventListener('click', () => {
            modal.classList.remove('visible');
            selectedFiles = [];
        });
    });

    // 点击遮罩关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('visible');
            selectedFiles = [];
        }
    });

    // 开始解析
    startBtn.addEventListener('click', async () => {
        if (selectedFiles.length === 0) return;
        modal.classList.remove('visible');
        startBtn.disabled = true;

        showToast('正在解析文档，请稍候...');
        const queue = [];

        for (const file of selectedFiles) {
            const ext = file.name.split('.').pop().toLowerCase();
            try {
                if (ext === 'txt') {
                    const content = await readFileAsText(file);
                    if (content.trim()) queue.push({ name: file.name, content: content.trim() });
                } else if (ext === 'docx') {
                    const content = await parseDocxFile(file);
                    if (content.trim()) queue.push({ name: file.name, content: content.trim() });
                } else if (ext === 'zip') {
                    const extracted = await parseZipFile(file);
                    queue.push(...extracted);
                }
            } catch (err) {
                console.error(`解析文件 ${file.name} 失败:`, err);
                showToast(`⚠️ 解析 ${file.name} 失败: ${err.message}`);
            }
        }

        selectedFiles = [];

        if (queue.length === 0) {
            showToast('没有从文档中解析出有效内容');
            return;
        }

        // 开始弹窗预览队列
        docImportQueue = queue;
        docImportCurrentIndex = 0;
        showDocPreviewModal();
    });
}

/**
 * 读取文件为文本（UTF-8）
 */
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsText(file, 'UTF-8');
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('读取文件失败'));
    });
}

/**
 * 用 mammoth.js 解析 DOCX 文件，返回纯文本
 */
async function parseDocxFile(file) {
    if (typeof mammoth === 'undefined') {
        throw new Error('mammoth.js 未加载，无法解析 DOCX 文件');
    }
    const arrayBuffer = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('读取DOCX失败'));
    });
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value || '';
}

/**
 * 用 JSZip 解析 ZIP 文件，提取其中 TXT 和 DOCX 文件
 */
async function parseZipFile(file) {
    if (typeof JSZip === 'undefined') {
        throw new Error('JSZip 未加载，无法解析 ZIP 文件');
    }
    const arrayBuffer = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('读取ZIP失败'));
    });

    const zip = await JSZip.loadAsync(arrayBuffer);
    const results = [];

    for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir) continue;
        const fname = relativePath.split('/').pop();
        const ext = fname.split('.').pop().toLowerCase();

        if (ext === 'txt') {
            try {
                const content = await zipEntry.async('string');
                if (content.trim()) results.push({ name: fname, content: content.trim() });
            } catch (e) { console.warn('ZIP内TXT解析失败:', fname, e); }
        } else if (ext === 'docx') {
            try {
                const ab = await zipEntry.async('arraybuffer');
                if (typeof mammoth !== 'undefined') {
                    const r = await mammoth.extractRawText({ arrayBuffer: ab });
                    if (r.value && r.value.trim()) results.push({ name: fname, content: r.value.trim() });
                }
            } catch (e) { console.warn('ZIP内DOCX解析失败:', fname, e); }
        }
        // 其他格式跳过
    }

    return results;
}

/**
 * 显示文档预览弹窗（逐个预览）
 */
function showDocPreviewModal() {
    const modal = document.getElementById('doc-preview-modal');
    if (!modal || docImportQueue.length === 0) return;

    if (docImportCurrentIndex >= docImportQueue.length) {
        // 全部处理完
        modal.classList.remove('visible');
        docImportQueue = [];
        return;
    }

    const item = docImportQueue[docImportCurrentIndex];
    document.getElementById('doc-preview-filename').textContent = item.name;
    document.getElementById('doc-preview-progress').textContent = `第 ${docImportCurrentIndex + 1} / ${docImportQueue.length} 个`;
    document.getElementById('doc-preview-content').value = item.content;

    modal.classList.add('visible');
}

/**
 * 设置文档预览弹窗的按钮逻辑
 */
function setupDocPreviewModal() {
    const modal = document.getElementById('doc-preview-modal');
    if (!modal) return;

    // 确定：将内容填入 add-char-modal 的描述框，然后打开手动创建
    document.getElementById('doc-preview-confirm-btn').addEventListener('click', () => {
        const content = document.getElementById('doc-preview-content').value;
        modal.classList.remove('visible');

        // 填入 add-char-modal 中的 persona 字段
        const personaInput = document.getElementById('char-persona-input');
        const hint = document.getElementById('char-persona-import-hint');
        const addCharForm = document.getElementById('add-char-form');
        const addCharModal = document.getElementById('add-char-modal');

        if (personaInput) personaInput.value = content;
        // 显示角色描述区块（文档导入时才展示），并启用弹窗滚动条
        const personaGroup = document.getElementById('char-persona-group');
        if (personaGroup) personaGroup.style.display = 'block';
        if (hint) hint.style.display = 'block';
        if (addCharModal) addCharModal.classList.add('import-mode');
        if (addCharForm) {
            // 只重置姓名类字段，不重置persona
            const realName = document.getElementById('char-real-name');
            const remarkName = document.getElementById('char-remark-name');
            const myName = document.getElementById('my-name-for-char');
            if (realName) realName.value = '';
            if (remarkName) remarkName.value = '';
            if (myName) myName.value = '';
        }
        if (addCharModal) addCharModal.classList.add('visible');
        // 不推进队列，等用户创建完再看是否有更多
        // 用户创建完后如果还有队列?
        // 简化处理：确定后直接进入创建，剩余队列丢弃（符合批量预览逻辑：用户一次看一个）
        // 若要继续下一个，可在创建完成后手动触发
        docImportCurrentIndex++;
        // 如果还有剩余，等当前modal关闭后再决定
        // 这里在创建完成后才调用 showDocPreviewModal
    });

    // 跳过：不导入当前文件，看下一个
    document.getElementById('doc-preview-skip-btn').addEventListener('click', () => {
        docImportCurrentIndex++;
        if (docImportCurrentIndex >= docImportQueue.length) {
            modal.classList.remove('visible');
            docImportQueue = [];
            showToast('已跳过所有文件');
        } else {
            showDocPreviewModal();
        }
    });

    // 取消全部
    document.getElementById('doc-preview-cancel-btn').addEventListener('click', () => {
        modal.classList.remove('visible');
        docImportQueue = [];
        docImportCurrentIndex = 0;
        showToast('已取消导入');
    });
}

/**
 * 钩入 add-char-modal 的关闭逻辑：创建完成后如果还有队列则继续
 * 在 add-char-form submit 完成后调用
 */
function checkAndContinueDocImportQueue() {
    if (docImportQueue.length > 0 && docImportCurrentIndex < docImportQueue.length) {
        setTimeout(() => showDocPreviewModal(), 300);
    }
}
