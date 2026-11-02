// --- 消息版本管理模块 (js/modules/msg_version.js) ---
// 重说时保存的AI回复版本存储在用户消息的 _regenVersions 数组中
// 每个版本: { replies: [{content, role, senderId, timestamp, parts}], savedAt }

const MsgVersion = {
    init() {
        this.bindEvents();
    },

    bindEvents() {
        const entryBtn = document.getElementById('msg-version-btn');
        if (entryBtn) {
            entryBtn.addEventListener('click', () => {
                this.openVersionModal();
                if (typeof showPanel === 'function') showPanel('none');
            });
        }

        const closeBtn = document.getElementById('msg-version-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.getElementById('msg-version-modal').classList.remove('visible');
            });
        }

        const modal = document.getElementById('msg-version-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('visible');
            });
        }

        const detailBackBtn = document.getElementById('msg-version-detail-back-btn');
        if (detailBackBtn) {
            detailBackBtn.addEventListener('click', () => {
                document.getElementById('msg-version-detail-modal').classList.remove('visible');
                document.getElementById('msg-version-modal').classList.add('visible');
                this.renderVersionList();
            });
        }

        const detailModal = document.getElementById('msg-version-detail-modal');
        if (detailModal) {
            detailModal.addEventListener('click', (e) => {
                if (e.target === detailModal) detailModal.classList.remove('visible');
            });
        }

        const regenCancelBtn = document.getElementById('regen-save-cancel-btn');
        if (regenCancelBtn) {
            regenCancelBtn.addEventListener('click', () => {
                document.getElementById('regen-save-confirm-modal').classList.remove('visible');
            });
        }
        const regenModal = document.getElementById('regen-save-confirm-modal');
        if (regenModal) {
            regenModal.addEventListener('click', (e) => {
                if (e.target === regenModal) regenModal.classList.remove('visible');
            });
        }
    },

    _getChat() {
        return (currentChatType === 'private')
            ? db.characters.find(c => c.id === currentChatId)
            : db.groups.find(g => g.id === currentChatId);
    },

    /** 获取有重说版本的用户消息列表 */
    getMessagesWithVersions() {
        const chat = this._getChat();
        if (!chat || !chat.history) return [];
        return chat.history.filter(m => m._regenVersions && m._regenVersions.length > 0);
    },

    /** 恢复某个版本：删除当前AI回复，插入旧版本的回复 */
    async restoreVersion(userMsgId, versionIndex) {
        const chat = this._getChat();
        if (!chat) return;
        const userMsgIdx = chat.history.findIndex(m => m.id === userMsgId);
        if (userMsgIdx === -1) return;
        const userMsg = chat.history[userMsgIdx];
        if (!userMsg._regenVersions || !userMsg._regenVersions[versionIndex]) return;

        const version = userMsg._regenVersions[versionIndex];

        // 找到当前AI回复的范围（从用户消息之后到下一个用户消息之前）
        let endIdx = chat.history.length;
        for (let i = userMsgIdx + 1; i < chat.history.length; i++) {
            if (chat.history[i].role === 'user' || (chat.history[i].isNodeBoundary && chat.history[i].nodeAction === 'start')) {
                endIdx = i;
                break;
            }
        }

        // 保存当前AI回复为新版本（如果和已有版本不同）
        const currentReplies = [];
        for (let i = userMsgIdx + 1; i < endIdx; i++) {
            currentReplies.push({
                content: chat.history[i].content,
                role: chat.history[i].role,
                senderId: chat.history[i].senderId,
                timestamp: chat.history[i].timestamp,
                parts: chat.history[i].parts ? JSON.parse(JSON.stringify(chat.history[i].parts)) : undefined,
                interactive: chat.history[i].interactive ? JSON.parse(JSON.stringify(chat.history[i].interactive)) : undefined
            });
        }
        if (currentReplies.length > 0) {
            const currentContent = currentReplies.map(r => r.content).join('');
            const alreadySaved = userMsg._regenVersions.some(v => v.replies.map(r => r.content).join('') === currentContent);
            if (!alreadySaved) {
                userMsg._regenVersions.push({
                    replies: currentReplies,
                    savedAt: Date.now()
                });
            }
        }

        // 删除当前AI回复
        chat.history.splice(userMsgIdx + 1, endIdx - userMsgIdx - 1);

        // 插入旧版本的回复
        const newMsgs = version.replies.map(r => ({
            id: generateUUID(),
            content: r.content,
            role: r.role,
            senderId: r.senderId,
            timestamp: r.timestamp,
            parts: r.parts ? JSON.parse(JSON.stringify(r.parts)) : undefined,
            interactive: r.interactive ? JSON.parse(JSON.stringify(r.interactive)) : undefined
        }));
        chat.history.splice(userMsgIdx + 1, 0, ...newMsgs);

        if (currentChatType === 'private' && typeof recalculateChatStatus === 'function') {
            recalculateChatStatus(chat);
        }

        await saveData();
        if (typeof renderMessages === 'function') {
            currentPage = 1;
            renderMessages(false, true);
        }
    },

    /** 删除某个版本 */
    async deleteVersion(userMsgId, versionIndex) {
        const chat = this._getChat();
        if (!chat) return;
        const msg = chat.history.find(m => m.id === userMsgId);
        if (!msg || !msg._regenVersions) return;
        msg._regenVersions.splice(versionIndex, 1);
        if (msg._regenVersions.length === 0) delete msg._regenVersions;
        await saveData();
    },

    openVersionModal() {
        this.renderVersionList();
        document.getElementById('msg-version-modal').classList.add('visible');
    },

    renderVersionList() {
        const container = document.getElementById('msg-version-list');
        const messages = this.getMessagesWithVersions();

        if (messages.length === 0) {
            container.innerHTML = '<div class="msg-version-empty">暂无保存的消息版本<br><span style="font-size:12px;color:#bbb;">开启「保留重说消息」后，重说时可保存旧版本</span></div>';
            return;
        }

        const chat = this._getChat();
        container.innerHTML = '';

        messages.forEach(msg => {
            const card = document.createElement('div');
            card.className = 'msg-version-card';

            let senderName = '';
            if (msg.role === 'user') {
                senderName = (currentChatType === 'private') ? (chat.myName || '我') : '我';
            }

            const preview = (msg.content || '').replace(/\[.*?\]/g, '').trim().substring(0, 50);
            const time = new Date(msg.timestamp);
            const timeStr = `${time.getMonth()+1}/${time.getDate()} ${String(time.getHours()).padStart(2,'0')}:${String(time.getMinutes()).padStart(2,'0')}`;

            card.innerHTML = `
                <div class="msg-version-card-header">
                    <span class="msg-version-card-role">${senderName || '我'} · ${timeStr}</span>
                    <span class="msg-version-card-count">${msg._regenVersions.length} 个旧版本</span>
                </div>
                <div class="msg-version-card-preview">${this._escapeHtml(preview || '[消息]')}…</div>
            `;

            card.addEventListener('click', () => {
                document.getElementById('msg-version-modal').classList.remove('visible');
                this.openDetailModal(msg.id);
            });

            container.appendChild(card);
        });
    },

    openDetailModal(userMsgId) {
        const chat = this._getChat();
        if (!chat) return;
        const msg = chat.history.find(m => m.id === userMsgId);
        if (!msg || !msg._regenVersions) return;

        // 获取角色名
        let charName = '';
        if (currentChatType === 'private') {
            charName = chat.remarkName || '角色';
        } else {
            charName = 'AI';
        }

        document.getElementById('msg-version-detail-title').textContent = `重说版本记录`;
        const container = document.getElementById('msg-version-detail-list');
        container.innerHTML = '';

        // 显示用户消息作为上下文
        const userPreview = (msg.content || '').replace(/\[.*?\]/g, '').trim();
        const ctxDiv = document.createElement('div');
        ctxDiv.style.cssText = 'background:#f0f4ff;border-radius:10px;padding:10px 12px;margin-bottom:14px;font-size:12px;color:#666;';
        ctxDiv.innerHTML = `<span style="color:var(--primary-color);font-weight:600;">我的消息：</span>${this._escapeHtml(userPreview.substring(0, 80))}`;
        container.appendChild(ctxDiv);

        // 当前AI回复
        const userMsgIdx = chat.history.findIndex(m => m.id === userMsgId);
        let endIdx = chat.history.length;
        for (let i = userMsgIdx + 1; i < chat.history.length; i++) {
            if (chat.history[i].role === 'user' || (chat.history[i].isNodeBoundary && chat.history[i].nodeAction === 'start')) {
                endIdx = i;
                break;
            }
        }
        const currentReplies = chat.history.slice(userMsgIdx + 1, endIdx);
        if (currentReplies.length > 0) {
            const currentItem = document.createElement('div');
            currentItem.className = 'msg-version-item active';
            const currentText = currentReplies.map(r => (r.content || '').replace(/\[.*?\]/g, '').trim()).join('\n');
            currentItem.innerHTML = `
                <div class="msg-version-item-header">
                    <span class="msg-version-item-label">当前回复 <span class="msg-version-active-badge">使用中</span></span>
                </div>
                <div class="msg-version-item-content">${this._escapeHtml(currentText)}</div>
            `;
            container.appendChild(currentItem);
        }

        // 历史版本（倒序，最新在前）
        const sorted = msg._regenVersions.map((v, i) => ({ ...v, _index: i })).reverse();

        sorted.forEach(ver => {
            const item = document.createElement('div');
            item.className = 'msg-version-item';
            const verText = ver.replies.map(r => (r.content || '').replace(/\[.*?\]/g, '').trim()).join('\n');
            const timeStr = this._formatTime(ver.savedAt);

            item.innerHTML = `
                <div class="msg-version-item-header">
                    <span class="msg-version-item-label">旧版本 ${ver._index + 1}</span>
                    <span class="msg-version-item-time">保存于 ${timeStr}</span>
                </div>
                <div class="msg-version-item-content">${this._escapeHtml(verText)}</div>
                <div class="msg-version-item-actions">
                    <button class="btn btn-small btn-danger msg-ver-delete-btn">删除</button>
                    <button class="btn btn-small btn-primary msg-ver-switch-btn">恢复此版本</button>
                </div>
            `;

            item.querySelector('.msg-ver-switch-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.restoreVersion(userMsgId, ver._index);
                document.getElementById('msg-version-detail-modal').classList.remove('visible');
                showToast('已恢复到选定版本');
            });

            item.querySelector('.msg-ver-delete-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm('确定删除此版本？')) {
                    await this.deleteVersion(userMsgId, ver._index);
                    this.openDetailModal(userMsgId);
                    showToast('版本已删除');
                }
            });

            container.appendChild(item);
        });

        document.getElementById('msg-version-detail-modal').classList.add('visible');
    },

    _formatTime(ts) {
        const d = new Date(ts);
        return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    },

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};

window.MsgVersion = MsgVersion;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => MsgVersion.init());
} else {
    MsgVersion.init();
}
