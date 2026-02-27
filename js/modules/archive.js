// --- 记忆存档库模块 ---
// 保存/读取/删除当前角色的聊天设置、长期记忆与聊天记录快照

var currentArchiveCharacterId = null;
var archiveMultiSelectMode = false;
var selectedArchiveIds = new Set();

function getArchivesForCharacter(characterId) {
    if (!db.archives) return [];
    return db.archives.filter(a => a.characterId === characterId).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

async function createArchive(characterId, archiveName) {
    const character = db.characters.find(c => c.id === characterId);
    if (!character) {
        showToast('角色不存在');
        return;
    }
    const name = (archiveName || '').trim() || `存档_${new Date().toLocaleString('zh-CN')}`;
    const archive = {
        id: `archive_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: name,
        timestamp: Date.now(),
        characterId: characterId,
        snapshot: JSON.parse(JSON.stringify(character))
    };
    if (!db.archives) db.archives = [];
    db.archives.push(archive);
    await saveData();
    showToast('存档保存成功！');
    renderArchiveList();
}

async function loadArchive(archiveId) {
    const archive = db.archives.find(a => a.id === archiveId);
    if (!archive) {
        showToast('存档不存在');
        return;
    }
    const characterIndex = db.characters.findIndex(c => c.id === archive.characterId);
    if (characterIndex === -1) {
        showToast('原角色已被删除，无法读取');
        return;
    }
    const restoredChar = JSON.parse(JSON.stringify(archive.snapshot));
    restoredChar.id = archive.characterId;
    db.characters[characterIndex] = restoredChar;
    await saveData();
    if (currentChatId === archive.characterId && typeof renderMessages === 'function') {
        renderMessages();
    }
    if (typeof renderChatList === 'function') renderChatList();
    showToast('存档已读取，当前状态已覆盖');
    switchScreen('chat-settings-screen');
}

async function deleteArchives(archiveIds) {
    if (!archiveIds || archiveIds.length === 0) return;
    db.archives = db.archives.filter(a => !archiveIds.includes(a.id));
    await saveData();
    selectedArchiveIds.clear();
    archiveMultiSelectMode = false;
    renderArchiveList();
    updateArchiveMultiSelectUI();
    showToast(`已删除 ${archiveIds.length} 个存档`);
}

function renameArchive(archiveId, newName) {
    const archive = db.archives.find(a => a.id === archiveId);
    if (!archive) return;
    const trimmed = (newName || '').trim();
    if (!trimmed) return;
    archive.name = trimmed;
    saveData();
    renderArchiveList();
}

function renderArchiveList() {
    const container = document.getElementById('archive-list-container');
    const placeholder = document.getElementById('no-archives-placeholder');
    const multiBar = document.getElementById('archive-multi-select-bar');
    if (!container) return;
    const list = getArchivesForCharacter(currentArchiveCharacterId || currentChatId);
    if (list.length === 0) {
        container.innerHTML = '';
        if (placeholder) placeholder.style.display = 'block';
        if (multiBar) multiBar.classList.remove('visible');
        return;
    }
    if (placeholder) placeholder.style.display = 'none';
    container.innerHTML = list.map(arch => {
        const timeStr = arch.timestamp ? new Date(arch.timestamp).toLocaleString('zh-CN') : '';
        const msgCount = (arch.snapshot && arch.snapshot.history) ? arch.snapshot.history.length : 0;
        const isSelected = selectedArchiveIds.has(arch.id);
        const itemClass = archiveMultiSelectMode ? 'archive-item selectable' : 'archive-item';
        const checkClass = isSelected ? 'archive-checkbox checked' : 'archive-checkbox';
        return `
            <li class="${itemClass}" data-archive-id="${arch.id}">
                ${archiveMultiSelectMode ? `<span class="${checkClass}" data-archive-id="${arch.id}"></span>` : ''}
                <div class="archive-item-main">
                    <div class="archive-item-header">
                        <span class="archive-name">${escapeHtml(arch.name)}</span>
                    </div>
                    <div class="archive-timestamp">${timeStr}</div>
                    <div class="archive-stats">聊天记录 ${msgCount} 条</div>
                    ${!archiveMultiSelectMode ? `
                    <div class="archive-actions">
                        <button type="button" class="archive-btn archive-btn-load" data-action="load" data-archive-id="${arch.id}">读取</button>
                        <button type="button" class="archive-btn archive-btn-rename" data-action="rename" data-archive-id="${arch.id}">重命名</button>
                        <button type="button" class="archive-btn archive-btn-delete" data-action="delete" data-archive-id="${arch.id}">删除</button>
                    </div>
                    ` : ''}
                </div>
            </li>
        `;
    }).join('');
    if (list.length > 0 && archiveMultiSelectMode && multiBar) multiBar.classList.add('visible');
    bindArchiveListEvents();
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function bindArchiveListEvents() {
    const container = document.getElementById('archive-list-container');
    if (!container) return;
    container.querySelectorAll('.archive-item').forEach(el => {
        const archiveId = el.getAttribute('data-archive-id');
        if (archiveMultiSelectMode) {
            el.addEventListener('click', (e) => {
                const item = e.target.closest('.archive-item');
                const id = item ? item.getAttribute('data-archive-id') : archiveId;
                if (id) toggleArchiveSelection(id);
            });
        } else {
            container.querySelectorAll(`[data-action="load"][data-archive-id="${archiveId}"]`).forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!confirm('读取此存档将完全覆盖当前的聊天记录与设置，是否继续？')) return;
                    loadArchive(archiveId);
                });
            });
            container.querySelectorAll(`[data-action="rename"][data-archive-id="${archiveId}"]`).forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const arch = db.archives.find(a => a.id === archiveId);
                    const newName = prompt('输入新名称：', arch ? arch.name : '');
                    if (newName !== null) renameArchive(archiveId, newName);
                });
            });
            container.querySelectorAll(`[data-action="delete"][data-archive-id="${archiveId}"]`).forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!confirm('确定删除该存档？')) return;
                    deleteArchives([archiveId]);
                });
            });
        }
    });
}

function toggleArchiveSelection(archiveId) {
    if (selectedArchiveIds.has(archiveId)) {
        selectedArchiveIds.delete(archiveId);
    } else {
        selectedArchiveIds.add(archiveId);
    }
    updateArchiveSelectionUI();
}

function updateArchiveSelectionUI() {
    document.querySelectorAll('.archive-item .archive-checkbox').forEach(cb => {
        const id = cb.getAttribute('data-archive-id');
        cb.classList.toggle('checked', selectedArchiveIds.has(id));
    });
    const bar = document.getElementById('archive-multi-select-bar');
    const countEl = document.getElementById('archive-selected-count');
    if (countEl) countEl.textContent = selectedArchiveIds.size;
    if (bar) {
        const deleteBtn = bar.querySelector('#archive-multi-delete-btn');
        if (deleteBtn) deleteBtn.disabled = selectedArchiveIds.size === 0;
    }
}

function updateArchiveMultiSelectUI() {
    const btn = document.getElementById('archive-multi-select-btn');
    const bar = document.getElementById('archive-multi-select-bar');
    if (btn) btn.textContent = archiveMultiSelectMode ? '取消' : '多选';
    if (bar) bar.classList.toggle('visible', archiveMultiSelectMode && getArchivesForCharacter(currentArchiveCharacterId || currentChatId).length > 0);
}

function setupArchiveApp() {
    const openBtn = document.getElementById('open-archive-library-btn');
    if (openBtn) {
        openBtn.addEventListener('click', () => {
            currentArchiveCharacterId = currentChatId;
            if (!currentArchiveCharacterId) {
                showToast('请先进入一个角色的聊天');
                return;
            }
            selectedArchiveIds.clear();
            archiveMultiSelectMode = false;
            renderArchiveList();
            updateArchiveMultiSelectUI();
            document.getElementById('no-archives-placeholder').style.display = (getArchivesForCharacter(currentArchiveCharacterId).length === 0) ? 'block' : 'none';
            switchScreen('archive-screen');
        });
    }

    const backBtn = document.querySelector('#archive-screen .back-btn');
    if (backBtn) {
        backBtn.setAttribute('data-target', 'chat-settings-screen');
    }

    const createBtn = document.getElementById('create-archive-btn');
    const createModal = document.getElementById('create-archive-modal');
    const createForm = document.getElementById('create-archive-form');
    const nameInput = document.getElementById('archive-name-input');
    const msgCountEl = document.getElementById('current-message-count');

    if (createBtn && createModal) {
        createBtn.addEventListener('click', () => {
            const cid = currentArchiveCharacterId || currentChatId;
            if (!cid) {
                showToast('请先进入一个角色的聊天');
                return;
            }
            const char = db.characters.find(c => c.id === cid);
            if (msgCountEl && char) msgCountEl.textContent = (char.history && char.history.length) || 0;
            if (nameInput) nameInput.value = '';
            createModal.classList.add('visible');
        });
    }

    if (createForm) {
        createForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const cid = currentArchiveCharacterId || currentChatId;
            const name = nameInput ? nameInput.value.trim() : '';
            createModal.classList.remove('visible');
            await createArchive(cid, name || undefined);
        });
    }

    const cancelArchiveBtn = document.getElementById('cancel-archive-btn');
    if (cancelArchiveBtn && createModal) {
        cancelArchiveBtn.addEventListener('click', () => createModal.classList.remove('visible'));
    }

    const multiSelectBtn = document.getElementById('archive-multi-select-btn');
    if (multiSelectBtn) {
        multiSelectBtn.addEventListener('click', () => {
            archiveMultiSelectMode = !archiveMultiSelectMode;
            if (!archiveMultiSelectMode) selectedArchiveIds.clear();
            renderArchiveList();
            updateArchiveMultiSelectUI();
        });
    }

    const multiDeleteBtn = document.getElementById('archive-multi-delete-btn');
    if (multiDeleteBtn) {
        multiDeleteBtn.addEventListener('click', () => {
            if (selectedArchiveIds.size === 0) return;
            if (!confirm(`确定删除选中的 ${selectedArchiveIds.size} 个存档？`)) return;
            deleteArchives(Array.from(selectedArchiveIds));
        });
    }

    const cancelMultiBtn = document.getElementById('archive-cancel-multi-btn');
    if (cancelMultiBtn) {
        cancelMultiBtn.addEventListener('click', () => {
            archiveMultiSelectMode = false;
            selectedArchiveIds.clear();
            renderArchiveList();
            updateArchiveMultiSelectUI();
        });
    }
}
