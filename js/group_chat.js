// --- 群聊系统逻辑 (js/group_chat.js) ---

let gossipUnreadMap = {};

function setupGroupChatSystem() {
    const createGroupForm = document.getElementById('create-group-form');
    const groupSettingsForm = document.getElementById('group-settings-form');
    const createGroupModal = document.getElementById('create-group-modal');
    const memberSelectionList = document.getElementById('member-selection-list');
    const groupNameInput = document.getElementById('group-name-input');
    const groupMembersListContainer = document.getElementById('group-members-list-container');
    const addMemberActionSheet = document.getElementById('add-member-actionsheet');
    const editGroupMemberModal = document.getElementById('edit-group-member-modal');
    const editGroupMemberForm = document.getElementById('edit-group-member-form');
    const inviteExistingMemberBtn = document.getElementById('invite-existing-member-btn');
    const createNewMemberBtn = document.getElementById('create-new-member-btn');
    const inviteMemberModal = document.getElementById('invite-member-modal');
    const inviteMemberSelectionList = document.getElementById('invite-member-selection-list');
    const confirmInviteBtn = document.getElementById('confirm-invite-btn');
    const createMemberForGroupModal = document.getElementById('create-member-for-group-modal');
    const createMemberForGroupForm = document.getElementById('create-member-for-group-form');
    const groupRecipientSelectionModal = document.getElementById('group-recipient-selection-modal');
    const groupRecipientSelectionList = document.getElementById('group-recipient-selection-list');
    const confirmGroupRecipientBtn = document.getElementById('confirm-group-recipient-btn');
    const linkGroupWorldBookBtn = document.getElementById('link-group-world-book-btn');
    const worldBookSelectionModal = document.getElementById('world-book-selection-modal');
    const worldBookSelectionList = document.getElementById('world-book-selection-list');
    const peekBtn = document.getElementById('peek-btn');

    if (peekBtn) {
        peekBtn.addEventListener('click', () => {
            if (currentChatType !== 'group') return;
            const overlay = document.getElementById('private-chat-overlay');
            overlay.classList.add('visible');
            renderPrivateChatMonitor();
            // 打开时清除全局未读状态
            peekBtn.classList.remove('has-unread');
            document.getElementById('gossip-badge').style.display = 'none';
            // 清空未读计数数据
            gossipUnreadMap = {};
        });
    }

    if (createGroupForm) {
        createGroupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const selectedMemberIds = Array.from(memberSelectionList.querySelectorAll('input:checked')).map(input => input.value);
            const groupName = groupNameInput.value.trim();
            // if (selectedMemberIds.length < 1) return showToast('请至少选择一个群成员。'); // 允许创建空群
            if (!groupName) return showToast('请输入群聊名称。');
            const firstChar = db.characters.length > 0 ? db.characters[0] : null;
            const newGroup = {
                id: `group_${Date.now()}`,
                name: groupName,
                avatar: 'https://i.postimg.cc/fTLCngk1/image.jpg',
                me: {
                    nickname: (firstChar && firstChar.myName) ? firstChar.myName : 'user',
                    persona: firstChar ? firstChar.myPersona : '',
                    avatar: firstChar ? firstChar.myAvatar : 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg'
                },
                members: selectedMemberIds.map(charId => {
                    const char = db.characters.find(c => c.id === charId);
                    return {
                        id: `member_${char.id}`,
                        originalCharId: char.id,
                        realName: char.realName,
                        groupNickname: char.remarkName,
                        persona: char.persona,
                        avatar: char.avatar
                    };
                }),
                theme: 'white_pink',
                maxMemory: 100,
                chatBg: '',
                history: [],
                isPinned: false,
                unreadCount: 0,
                useCustomBubbleCss: false,
                customBubbleCss: '',
                worldBookIds: [],
                allowGossip: false,
                privateSessions: {},
                // 群聊 <- 私聊：是否允许群聊中的角色读取其私聊记忆（默认关闭）
                syncPrivateMemory: false,
                privateMemoryHistoryCount: 20,
                privateMemorySummaryCount: 0
            };
            db.groups.push(newGroup);
            await saveData();
            renderChatList();
            createGroupModal.classList.remove('visible');
            showToast(`群聊“${groupName}”创建成功！`);
        });
    }

    if (groupSettingsForm) {
        groupSettingsForm.addEventListener('submit', e => {
            e.preventDefault();
            saveGroupSettingsFromSidebar();
        });
    }

    // --- 自动保存逻辑 (Group Chat) ---
    const groupAutoSaveInputs = [
        'setting-group-name', 'setting-group-my-nickname', 'setting-group-my-persona',
        'setting-group-max-memory', 'setting-group-auto-journal-interval', 'setting-group-custom-bubble-css', 'setting-group-notice',
        'setting-group-private-memory-history-count', 'setting-group-private-memory-summary-count'
    ];
    groupAutoSaveInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('blur', () => saveGroupSettingsFromSidebar(false));
    });

    const groupAutoSaveChanges = [
        'setting-group-theme-color', 'setting-group-use-custom-css', 'setting-group-show-timestamp',
        'setting-group-show-notice', 'setting-group-allow-gossip', 'setting-group-avatar-radius',
        'setting-group-bilingual-mode', 'setting-group-bilingual-style', 'setting-group-auto-journal-enabled',
        'setting-group-timestamp-format'
    ];
    groupAutoSaveChanges.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => saveGroupSettingsFromSidebar(false));
    });

    // 群聊角色私聊记忆互通（群聊 <- 私聊）
    const syncPrivateMemorySwitch = document.getElementById('setting-group-sync-private-memory');
    if (syncPrivateMemorySwitch) {
        syncPrivateMemorySwitch.addEventListener('change', (e) => {
            const historyContainer = document.getElementById('setting-group-private-memory-history-container');
            const summaryContainer = document.getElementById('setting-group-private-memory-summary-container');
            if (historyContainer) historyContainer.style.display = e.target.checked ? 'flex' : 'none';
            if (summaryContainer) summaryContainer.style.display = e.target.checked ? 'flex' : 'none';
            saveGroupSettingsFromSidebar(false);
        });
    }

    const showGroupNoticeCheckbox = document.getElementById('setting-group-show-notice');
    const groupNoticeTextarea = document.getElementById('setting-group-notice');
    if (showGroupNoticeCheckbox && groupNoticeTextarea) {
        showGroupNoticeCheckbox.addEventListener('change', (e) => {
            groupNoticeTextarea.disabled = !e.target.checked;
        });
    }

    const useGroupCustomCssCheckbox = document.getElementById('setting-group-use-custom-css'),
        groupCustomCssTextarea = document.getElementById('setting-group-custom-bubble-css'),
        resetGroupCustomCssBtn = document.getElementById('reset-group-custom-bubble-css-btn'),
        groupPreviewBox = document.getElementById('group-bubble-css-preview');
        
    if (useGroupCustomCssCheckbox) {
        useGroupCustomCssCheckbox.addEventListener('change', (e) => {
            groupCustomCssTextarea.disabled = !e.target.checked;
            const group = db.groups.find(g => g.id === currentChatId);
            if (group) {
                const theme = colorThemes[group.theme || 'white_pink'];
                updateBubbleCssPreview(groupPreviewBox, groupCustomCssTextarea.value, !e.target.checked, theme);
            }
        });
    }
    if (groupCustomCssTextarea) {
        groupCustomCssTextarea.addEventListener('input', (e) => {
            const group = db.groups.find(g => g.id === currentChatId);
            if (group && useGroupCustomCssCheckbox.checked) {
                const theme = colorThemes[group.theme || 'white_pink'];
                updateBubbleCssPreview(groupPreviewBox, e.target.value, false, theme);
            }
        });
    }
    if (resetGroupCustomCssBtn) {
        resetGroupCustomCssBtn.addEventListener('click', () => {
            const group = db.groups.find(g => g.id === currentChatId);
            if (group) {
                groupCustomCssTextarea.value = '';
                useGroupCustomCssCheckbox.checked = false;
                groupCustomCssTextarea.disabled = true;
                const theme = colorThemes[group.theme || 'white_pink'];
                updateBubbleCssPreview(groupPreviewBox, '', true, theme);
                showToast('样式已重置为默认');
            }
        });
    }

    const groupAvatarUpload = document.getElementById('setting-group-avatar-upload');
    if (groupAvatarUpload) {
        groupAvatarUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    const compressedUrl = await compressImage(file, {quality: 0.8, maxWidth: 400, maxHeight: 400});
                    const group = db.groups.find(g => g.id === currentChatId);
                    if (group) {
                        group.avatar = compressedUrl;
                        document.getElementById('setting-group-avatar-preview').src = compressedUrl;
                        saveGroupSettingsFromSidebar(false);
                    }
                } catch (error) {
                    showToast('群头像压缩失败，请重试');
                }
            }
        });
    }

    const groupChatBgUpload = document.getElementById('setting-group-chat-bg-upload');
    if (groupChatBgUpload) {
        groupChatBgUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    const compressedUrl = await compressImage(file, {
                        quality: 0.85,
                        maxWidth: 1080,
                        maxHeight: 1920
                    });
                    const group = db.groups.find(g => g.id === currentChatId);
                    if (group) {
                        group.chatBg = compressedUrl;
                        chatRoomScreen.style.backgroundImage = `url(${compressedUrl})`;
                        await saveData();
                        showToast('聊天背景已更换');
                    }
                } catch (error) {
                    showToast('群聊背景压缩失败，请重试');
                }
            }
        });
    }

    const clearGroupHistoryBtn = document.getElementById('clear-group-chat-history-btn');
    if (clearGroupHistoryBtn) {
        clearGroupHistoryBtn.addEventListener('click', async () => {
            const group = db.groups.find(g => g.id === currentChatId);
            if (!group) return;
            if (confirm(`你确定要清空群聊“${group.name}”的所有聊天记录吗？这个操作是不可恢复的！`)) {
                group.history = [];
                await saveData();
                renderMessages(false, true);
                renderChatList();
                showToast('聊天记录已清空');
            }
        });
    }

    if (groupMembersListContainer) {
        groupMembersListContainer.addEventListener('click', e => {
            const memberDiv = e.target.closest('.group-member');
            const addBtn = e.target.closest('.add-member-btn');
            if (memberDiv) {
                openGroupMemberEditModal(memberDiv.dataset.id);
            } else if (addBtn) {
                addMemberActionSheet.classList.add('visible');
            }
        });
    }

    const editMemberAvatarPreview = document.getElementById('edit-member-avatar-preview');
    if (editMemberAvatarPreview) {
        editMemberAvatarPreview.addEventListener('click', () => {
            document.getElementById('edit-member-avatar-upload').click();
        });
    }
    
    const editMemberAvatarUpload = document.getElementById('edit-member-avatar-upload');
    if (editMemberAvatarUpload) {
        editMemberAvatarUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    const compressedUrl = await compressImage(file, {quality: 0.8, maxWidth: 400, maxHeight: 400});
                    document.getElementById('edit-member-avatar-preview').src = compressedUrl;
                } catch (error) {
                    showToast('成员头像压缩失败，请重试');
                }
            }
        });
    }

    if (editGroupMemberForm) {
        editGroupMemberForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const memberId = document.getElementById('editing-member-id').value;
            const group = db.groups.find(g => g.id === currentChatId);
            const member = group.members.find(m => m.id === memberId);
            if (member) {
                member.avatar = document.getElementById('edit-member-avatar-preview').src;
                member.groupNickname = document.getElementById('edit-member-group-nickname').value;
                member.realName = document.getElementById('edit-member-real-name').value;
                member.persona = document.getElementById('edit-member-persona').value;
                await saveData();
                renderGroupMembersInSettings(group);
                document.querySelectorAll(`.message-wrapper[data-sender-id="${member.id}"] .group-nickname`).forEach(el => {
                    el.textContent = member.groupNickname;
                });
                showToast('成员信息已更新');
            }
            editGroupMemberModal.classList.remove('visible');
        });
    }

    if (inviteExistingMemberBtn) {
        inviteExistingMemberBtn.addEventListener('click', () => {
            renderInviteSelectionList();
            inviteMemberModal.classList.add('visible');
            addMemberActionSheet.classList.remove('visible');
        });
    }
    if (createNewMemberBtn) {
        createNewMemberBtn.addEventListener('click', () => {
            createMemberForGroupForm.reset();
            document.getElementById('create-group-member-avatar-preview').src = 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg';
            createMemberForGroupModal.classList.add('visible');
            addMemberActionSheet.classList.remove('visible');
        });
    }
    
    const createGroupMemberAvatarPreview = document.getElementById('create-group-member-avatar-preview');
    if (createGroupMemberAvatarPreview) {
        createGroupMemberAvatarPreview.addEventListener('click', () => {
            document.getElementById('create-group-member-avatar-upload').click();
        });
    }
    
    const createGroupMemberAvatarUpload = document.getElementById('create-group-member-avatar-upload');
    if (createGroupMemberAvatarUpload) {
        createGroupMemberAvatarUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    const compressedUrl = await compressImage(file, {quality: 0.8, maxWidth: 400, maxHeight: 400});
                    document.getElementById('create-group-member-avatar-preview').src = compressedUrl;
                } catch (error) {
                    showToast('新成员头像压缩失败，请重试');
                }
            }
        });
    }

    if (confirmInviteBtn) {
        confirmInviteBtn.addEventListener('click', async () => {
            const group = db.groups.find(g => g.id === currentChatId);
            if (!group) return;
            const selectedCharIds = Array.from(inviteMemberSelectionList.querySelectorAll('input:checked')).map(input => input.value);
            selectedCharIds.forEach(charId => {
                const char = db.characters.find(c => c.id === charId);
                if (char) {
                    const newMember = {
                        id: `member_${char.id}`,
                        originalCharId: char.id,
                        realName: char.realName,
                        groupNickname: char.remarkName,
                        persona: char.persona,
                        avatar: char.avatar
                    };
                    group.members.push(newMember);
                    sendInviteNotification(group, newMember.realName);
                }
            });
            if (selectedCharIds.length > 0) {
                await saveData();
                renderGroupMembersInSettings(group);
                renderMessages(false, true);
                showToast('已邀请新成员');
            }
            inviteMemberModal.classList.remove('visible');
        });
    }

    if (createMemberForGroupForm) {
        createMemberForGroupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const group = db.groups.find(g => g.id === currentChatId);
            if (!group) return;
            const newMember = {
                id: `member_group_only_${Date.now()}`,
                originalCharId: null,
                realName: document.getElementById('create-group-member-realname').value,
                groupNickname: document.getElementById('create-group-member-nickname').value,
                persona: document.getElementById('create-group-member-persona').value,
                avatar: document.getElementById('create-group-member-avatar-preview').src,
            };
            group.members.push(newMember);
            sendInviteNotification(group, newMember.realName);
            await saveData();
            renderGroupMembersInSettings(group);
            renderMessages(false, true);
            showToast(`新成员 ${newMember.groupNickname} 已加入`);
            createMemberForGroupModal.classList.remove('visible');
        });
    }

    const settingGroupMyAvatarUpload = document.getElementById('setting-group-my-avatar-upload');
    if (settingGroupMyAvatarUpload) {
        settingGroupMyAvatarUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    const compressedUrl = await compressImage(file, {quality: 0.8, maxWidth: 400, maxHeight: 400});
                    document.getElementById('setting-group-my-avatar-preview').src = compressedUrl;
                    saveGroupSettingsFromSidebar(false);
                } catch (error) {
                    showToast('头像压缩失败')
                }
            }
        });
    }

    if (confirmGroupRecipientBtn) {
        confirmGroupRecipientBtn.addEventListener('click', () => {
            const selectedRecipientIds = Array.from(groupRecipientSelectionList.querySelectorAll('input:checked')).map(input => input.value);
            if (selectedRecipientIds.length === 0) {
                return showToast('请至少选择一个收件人。');
            }
            currentGroupAction.recipients = selectedRecipientIds;
            groupRecipientSelectionModal.classList.remove('visible');

            if (currentGroupAction.type === 'transfer') {
                document.getElementById('send-transfer-form').reset();
                document.getElementById('send-transfer-modal').classList.add('visible');
            } else if (currentGroupAction.type === 'gift') {
                document.getElementById('send-gift-form').reset();
                document.getElementById('send-gift-modal').classList.add('visible');
            }
        });
    }

    if (linkGroupWorldBookBtn) {
        linkGroupWorldBookBtn.addEventListener('click', () => {
            const group = db.groups.find(g => g.id === currentChatId);
            if (!group) return;
            const globalIds = (db.worldBooks || []).filter(wb => wb.isGlobal && !wb.disabled).map(wb => wb.id);
            const displayIds = [...new Set([...(group.worldBookIds || []), ...globalIds])];
            renderCategorizedWorldBookList(worldBookSelectionList, db.worldBooks, displayIds, 'wb-select-group');
            worldBookSelectionModal.classList.add('visible');
        });
    }

    setupGossipUI();
    setupPrivateChatEditModal();
    setupGossipInput();
}

// --- Gossip Mode UI Logic ---
let activePrivateSessionId = null; // Now stores "NameA_NameB"

// 迁移旧的 privateSessions 数据到 history
window.migratePrivateSessionsToHistory = function(group) {
    if (!group.privateSessions) return;
    
    let hasChanges = false;
    Object.values(group.privateSessions).forEach(session => {
        if (session.history && session.history.length > 0) {
            session.history.forEach(msg => {
                // 检查是否已存在（通过 id）
                const exists = group.history.some(hMsg => hMsg.id === msg.id);
                if (!exists) {
                    // 转换格式
                    let newMsg = { ...msg };
                    if (msg.isEndCommand) {
                        // 已经是 [Private-End: ...] 格式，保持原样
                    } else {
                        // 需要包装成 [Private: ...]
                        const receiver = session.memberNames.find(n => n !== msg.sender);
                        if (receiver) {
                            newMsg.content = `[Private: ${msg.sender} -> ${receiver}: ${msg.content}]`;
                            newMsg.parts = [{type: 'text', text: newMsg.content}];
                        }
                    }
                    // 确保 role 正确
                    if (!newMsg.role) newMsg.role = 'assistant'; 
                    
                    group.history.push(newMsg);
                    hasChanges = true;
                }
            });
        }
    });
    
    if (hasChanges) {
        group.history.sort((a, b) => a.timestamp - b.timestamp);
    }
    
    // 迁移完成后删除旧字段
    delete group.privateSessions;
    // 注意：调用此函数后，调用者应负责执行 saveData()
};

function setupGossipUI() {
    const titleEl = document.getElementById('chat-room-title');
    const overlay = document.getElementById('private-chat-overlay');
    const closeBtn = document.getElementById('private-window-close');
    const maxBtn = document.getElementById('private-window-maximize');
    const minBtn = document.getElementById('private-window-minimize');
    const browserWindow = document.querySelector('.browser-window');

    if (titleEl) {
        titleEl.addEventListener('dblclick', () => {
            if (currentChatType !== 'group') return;
            const group = db.groups.find(g => g.id === currentChatId);
            if (!group || !group.allowGossip) return;
            
            overlay.classList.toggle('visible');
            if (overlay.classList.contains('visible')) {
                renderPrivateChatMonitor();
            }
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            overlay.classList.remove('visible');
        });
    }

    if (maxBtn) {
        maxBtn.addEventListener('click', () => {
            browserWindow.classList.toggle('fullscreen');
        });
    }
    
    if (minBtn) {
        minBtn.addEventListener('click', () => {
            overlay.classList.remove('visible');
        });
    }

    // Tab switching delegation
    const tabsContainer = document.getElementById('private-chat-tabs');
    if (tabsContainer) {
        tabsContainer.addEventListener('click', (e) => {
            const tab = e.target.closest('.tab-open');
            const closeIcon = e.target.closest('.close-tab');
            
            if (closeIcon && tab) {
                e.stopPropagation();
                const sessionId = tab.dataset.id;
                closePrivateSession(sessionId);
            } else if (tab) {
                activePrivateSessionId = tab.dataset.id;
                renderPrivateChatMonitor();
            }
        });
    }
}

function renderPrivateChatMonitor() {
    const group = db.groups.find(g => g.id === currentChatId);
    if (!group) return;

    // 动态解析私聊会话
    const sessions = {}; // key: "NameA_NameB" (sorted)
    
    const privateRegex = /^\[Private: (.*?) -> (.*?): ([\s\S]+?)\]$/;
    const privateEndRegex = /^\[Private-End: (.*?) -> (.*?)\]$/;

    group.history.forEach(msg => {
        let sender, receiver, content, isEnd = false;
        
        const match = msg.content.match(privateRegex);
        const endMatch = msg.content.match(privateEndRegex);
        
        if (match) {
            sender = match[1];
            receiver = match[2];
            content = match[3];
        } else if (endMatch) {
            sender = endMatch[1];
            receiver = endMatch[2];
            isEnd = true;
        } else {
            return;
        }
        
        const members = [sender, receiver].sort();
        const key = members.join('_');
        
        if (!sessions[key]) {
            sessions[key] = {
                id: key,
                memberNames: members,
                history: [],
                status: 'active',
                lastTime: 0
            };
        }
        
        sessions[key].history.push({
            ...msg,
            displayContent: content, // 提取纯内容用于显示
            isEnd: isEnd
        });
        sessions[key].lastTime = msg.timestamp;
        
        if (isEnd) {
            sessions[key].status = 'ended';
        } else {
            sessions[key].status = 'active'; // 如果有新消息，重新激活
        }
    });

    const sessionList = Object.values(sessions).sort((a, b) => b.lastTime - a.lastTime);

    const tabsContainer = document.getElementById('private-chat-tabs');
    const contentContainer = document.getElementById('private-chat-content');
    const addressBar = document.getElementById('private-chat-title');
    const inputArea = document.getElementById('private-chat-input-area');

    // Auto-select first if none selected or selected is closed
    if (!activePrivateSessionId && sessionList.length > 0) {
        activePrivateSessionId = sessionList[0].id;
    } else if (activePrivateSessionId && !sessions[activePrivateSessionId]) {
        activePrivateSessionId = sessionList.length > 0 ? sessionList[0].id : null;
    }

    // Render Tabs
    tabsContainer.innerHTML = sessionList.map(s => {
        const isEnded = s.status === 'ended';
        return `
        <div class="tab-open ${s.id === activePrivateSessionId ? 'active' : ''}" data-id="${s.id}" style="${isEnded ? 'opacity: 0.7;' : ''}">
            <div class="rounded-l"><div class="mask-round"></div></div>
            <span>${isEnded ? '🔒 ' : ''}${s.memberNames.join(' & ')}</span>
            <div class="close-tab">✕</div>
            <div class="rounded-r"><div class="mask-round"></div></div>
        </div>
    `}).join('');

    // Render Content
    if (activePrivateSessionId && sessions[activePrivateSessionId]) {
        const session = sessions[activePrivateSessionId];
        addressBar.textContent = `Private Chat: ${session.memberNames.join(' & ')} ${session.status === 'ended' ? '(已结束)' : ''}`;
        
        // 检查是否包含“我”
        const myName = group.me.nickname;
        const isMyChat = session.memberNames.includes(myName);
        
        if (isMyChat && session.status !== 'ended') {
            if (inputArea) inputArea.classList.add('visible');
        } else {
            if (inputArea) inputArea.classList.remove('visible');
        }

        contentContainer.innerHTML = session.history.map((msg, index) => {
            if (msg.isEnd) {
                return `<div class="private-msg system"><div class="private-msg-bubble system">-- 会话结束 --</div></div>`;
            }

            // 解析发送者
            const privateMatch = msg.content.match(privateRegex);
            const sender = privateMatch ? privateMatch[1] : 'Unknown';
            
            // 如果是“我”发送的，显示在右侧；否则显示在左侧
            // 注意：对于 AI 之间的私聊，仍然保持原来的左右分布逻辑（基于 memberNames[0]）
            let alignClass = 'left';
            if (sender === myName) {
                alignClass = 'right';
            } else if (!isMyChat) {
                // AI 之间的私聊，第一个成员在左，第二个在右
                alignClass = (sender === session.memberNames[0]) ? 'left' : 'right';
            } else {
                // 与我私聊的 AI，显示在左侧
                alignClass = 'left';
            }
            
            return `
                <div class="private-msg ${alignClass}" ondblclick="window.openPrivateMsgEdit('${msg.id}')">
                    <div class="private-msg-sender">${sender}</div>
                    <div class="private-msg-bubble">${msg.displayContent}</div>
                </div>
            `;
        }).join('');
        
        // Scroll to bottom
        contentContainer.scrollTop = contentContainer.scrollHeight;
    } else {
        addressBar.textContent = 'Private Chat Monitor';
        contentContainer.innerHTML = '<div class="empty-state">暂无活跃的私聊会话</div>';
        if (inputArea) inputArea.classList.remove('visible');
    }
}

function closePrivateSession(sessionId) {
    if (!confirm('确定要结束这个私聊话题吗？')) return;

    const group = db.groups.find(g => g.id === currentChatId);
    if (!group) return;
    
    // sessionId is "NameA_NameB"
    const members = sessionId.split('_');
    if (members.length !== 2) return;
    
    const [sender, receiver] = members;
    
    // 添加结束消息
    const endContent = `[Private-End: ${sender} -> ${receiver}]`;
    const endMsg = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: endContent,
        parts: [{type: 'text', text: endContent}],
        timestamp: Date.now()
    };
    
    group.history.push(endMsg);
    saveData();
    renderPrivateChatMonitor();
}

function setupGossipInput() {
    const input = document.getElementById('private-chat-input');
    if (!input) return;

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const content = input.value.trim();
            if (content) {
                sendGossipMessage(content);
                input.value = '';
            }
        }
    });
}

function sendGossipMessage(content) {
    const group = db.groups.find(g => g.id === currentChatId);
    if (!group || !activePrivateSessionId) return;

    const sessionMembers = activePrivateSessionId.split('_');
    const myName = group.me.nickname;
    
    // 确定接收者
    const targetName = sessionMembers.find(n => n !== myName);
    if (!targetName) return; // 异常情况

    const fullContent = `[Private: ${myName} -> ${targetName}: ${content}]`;
    
    const message = {
        id: `msg_${Date.now()}`,
        role: 'user', // 标记为用户发送
        content: fullContent,
        parts: [{type: 'text', text: fullContent}],
        timestamp: Date.now()
    };

    group.history.push(message);
    saveData();
    renderPrivateChatMonitor();
    
    // 注意：此处不自动触发 getAiReply，等待用户在主界面操作
}

// --- Private Chat Editing Logic ---
let editingPrivateMsgId = null;

function setupPrivateChatEditModal() {
    if (document.getElementById('private-msg-edit-modal')) return;

    const modalHTML = `
    <div id="private-msg-edit-modal" class="modal-overlay">
        <div class="modal-window">
            <h3>编辑私聊消息</h3>
            <form id="private-msg-edit-form">
                <div class="form-group">
                    <textarea id="private-msg-edit-textarea" rows="6" style="width:100%; resize:vertical; padding:10px; border-radius:8px; border:1px solid #ddd;"></textarea>
                </div>
                <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:15px;">
                    <button type="button" class="btn btn-neutral btn-small" id="private-msg-cancel-btn">取消</button>
                    <button type="button" class="btn btn-danger btn-small" id="private-msg-delete-btn">删除</button>
                    <button type="submit" class="btn btn-primary btn-small">保存</button>
                </div>
            </form>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    document.getElementById('private-msg-edit-form').addEventListener('submit', (e) => {
        e.preventDefault();
        savePrivateMsgEdit();
    });

    document.getElementById('private-msg-cancel-btn').addEventListener('click', () => {
        document.getElementById('private-msg-edit-modal').classList.remove('visible');
        editingPrivateMsgId = null;
    });

    document.getElementById('private-msg-delete-btn').addEventListener('click', () => {
        if (confirm('确定要删除这条私聊消息吗？')) {
            deletePrivateMsg();
        }
    });
}

window.openPrivateMsgEdit = function(msgId) {
    const group = db.groups.find(g => g.id === currentChatId);
    if (!group) return;
    
    const msg = group.history.find(m => m.id === msgId);
    if (!msg) return;

    editingPrivateMsgId = msgId;

    // 提取纯内容用于编辑
    const privateRegex = /^\[Private: (.*?) -> (.*?): ([\s\S]+?)\]$/;
    const match = msg.content.match(privateRegex);
    const displayContent = match ? match[3] : msg.content;

    document.getElementById('private-msg-edit-textarea').value = displayContent;
    document.getElementById('private-msg-edit-modal').classList.add('visible');
    document.getElementById('private-msg-edit-textarea').focus();
};

window.savePrivateMsgEdit = function() {
    if (!editingPrivateMsgId) return;
    
    const newContent = document.getElementById('private-msg-edit-textarea').value;
    const group = db.groups.find(g => g.id === currentChatId);
    
    if (group) {
        const msg = group.history.find(m => m.id === editingPrivateMsgId);
        if (msg) {
            // 重新包装
            const privateRegex = /^\[Private: (.*?) -> (.*?): ([\s\S]+?)\]$/;
            const match = msg.content.match(privateRegex);
            if (match) {
                const sender = match[1];
                const receiver = match[2];
                msg.content = `[Private: ${sender} -> ${receiver}: ${newContent}]`;
                msg.parts = [{type: 'text', text: msg.content}];
                
                saveData();
                renderPrivateChatMonitor();
                document.getElementById('private-msg-edit-modal').classList.remove('visible');
                showToast('私聊消息已更新');
            }
        }
    }
    
    editingPrivateMsgId = null;
};

window.deletePrivateMsg = function() {
    if (!editingPrivateMsgId) return;
    
    const group = db.groups.find(g => g.id === currentChatId);
    
    if (group) {
        group.history = group.history.filter(m => m.id !== editingPrivateMsgId);
        saveData();
        renderPrivateChatMonitor();
        document.getElementById('private-msg-edit-modal').classList.remove('visible');
        showToast('私聊消息已删除');
    }
    
    editingPrivateMsgId = null;
};

// 处理来自 AI 的私聊消息
function handleGossipMessage(group, content) {
    const privateRegex = /^\[Private: (.*?) -> (.*?): ([\s\S]+?)\]$/;
    const privateEndRegex = /^\[Private-End: (.*?) -> (.*?)\]$/;

    const privateMatch = content.match(privateRegex);
    const endMatch = content.match(privateEndRegex);

    if (privateMatch) {
        const sender = privateMatch[1];
        const receiver = privateMatch[2];
        const members = [sender, receiver].sort();
        const sessionId = members.join('_');
        
        const overlay = document.getElementById('private-chat-overlay');
        const isOverlayVisible = overlay.classList.contains('visible');

        // 如果窗口未打开，或者打开了但不是当前会话 -> 增加未读
        if (!isOverlayVisible || activePrivateSessionId !== sessionId) {
            gossipUnreadMap[sessionId] = (gossipUnreadMap[sessionId] || 0) + 1;
            
            // 更新全局入口按钮状态
            const btn = document.getElementById('peek-btn');
            const badge = document.getElementById('gossip-badge');
            if (btn && badge) {
                btn.classList.add('has-unread');
                badge.style.display = 'block';
            }
        }

        // UI Update if monitor is open
        if (isOverlayVisible) {
            renderPrivateChatMonitor();
        }
        return false; // 不拦截，让它进入 history
    }
    
    if (endMatch) {
        if (document.getElementById('private-chat-overlay').classList.contains('visible')) {
            renderPrivateChatMonitor();
        }
        return false; // 不拦截
    }

    return false;
}

function renderMemberSelectionList() {
    const memberSelectionList = document.getElementById('member-selection-list');
    if (!memberSelectionList) return;
    memberSelectionList.innerHTML = '';
    if (db.characters.length === 0) {
        memberSelectionList.innerHTML = '<li style="color:#aaa; text-align:center; padding: 10px 0;">没有可选择的人设。</li>';
        return;
    }
    db.characters.forEach(char => {
        const li = document.createElement('li');
        li.className = 'member-selection-item';
        li.innerHTML = `<input type="checkbox" id="select-${char.id}" value="${char.id}"><img src="${char.avatar}" alt="${char.remarkName}"><label for="select-${char.id}">${char.remarkName}</label>`;
        memberSelectionList.appendChild(li);
    });
}

function loadGroupSettingsToSidebar() {
    const group = db.groups.find(g => g.id === currentChatId);
    if (!group) return;
    const themeSelect = document.getElementById('setting-group-theme-color');
    if (themeSelect.options.length === 0) {
        Object.keys(colorThemes).forEach(key => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = colorThemes[key].name;
            themeSelect.appendChild(option);
        });
    }
    document.getElementById('setting-group-avatar-preview').src = group.avatar;
    document.getElementById('setting-group-name').value = group.name;
    document.getElementById('setting-group-my-avatar-preview').src = group.me.avatar;
    document.getElementById('setting-group-my-nickname').value = group.me.nickname;
    document.getElementById('setting-group-my-persona').value = group.me.persona;
    themeSelect.value = group.theme || 'white_pink';
    document.getElementById('setting-group-max-memory').value = group.maxMemory;

    // --- 群聊 <- 私聊：群成员私聊记忆互通 ---
    const syncPrivateMemoryEl = document.getElementById('setting-group-sync-private-memory');
    const privateHistoryContainer = document.getElementById('setting-group-private-memory-history-container');
    const privateSummaryContainer = document.getElementById('setting-group-private-memory-summary-container');
    const privateHistoryInput = document.getElementById('setting-group-private-memory-history-count');
    const privateSummaryInput = document.getElementById('setting-group-private-memory-summary-count');

    if (privateHistoryInput) privateHistoryInput.value = (group.privateMemoryHistoryCount !== undefined) ? group.privateMemoryHistoryCount : 20;
    if (privateSummaryInput) privateSummaryInput.value = (group.privateMemorySummaryCount !== undefined) ? group.privateMemorySummaryCount : 0;

    if (syncPrivateMemoryEl) {
        syncPrivateMemoryEl.checked = group.syncPrivateMemory || false;
        if (privateHistoryContainer) privateHistoryContainer.style.display = syncPrivateMemoryEl.checked ? 'flex' : 'none';
        if (privateSummaryContainer) privateSummaryContainer.style.display = syncPrivateMemoryEl.checked ? 'flex' : 'none';

        // 防止重复绑定：clone 一次
        const parent = syncPrivateMemoryEl.parentNode;
        const clone = syncPrivateMemoryEl.cloneNode(true);
        parent.replaceChild(clone, syncPrivateMemoryEl);
        clone.checked = group.syncPrivateMemory || false;
        clone.addEventListener('change', (e) => {
            if (privateHistoryContainer) privateHistoryContainer.style.display = e.target.checked ? 'flex' : 'none';
            if (privateSummaryContainer) privateSummaryContainer.style.display = e.target.checked ? 'flex' : 'none';
            saveGroupSettingsFromSidebar(false);
        });
    } else {
        if (privateHistoryContainer) privateHistoryContainer.style.display = 'none';
        if (privateSummaryContainer) privateSummaryContainer.style.display = 'none';
    }

    const autoJournalIntervalContainer = document.getElementById('setting-group-auto-journal-interval-container');
    const autoJournalIntervalInput = document.getElementById('setting-group-auto-journal-interval');
    let autoJournalSwitch = document.getElementById('setting-group-auto-journal-enabled');
    if (autoJournalSwitch) {
        autoJournalSwitch.checked = group.autoJournalEnabled || false;
        const parent = autoJournalSwitch.parentNode;
        const clone = autoJournalSwitch.cloneNode(true);
        parent.replaceChild(clone, autoJournalSwitch);
        autoJournalSwitch = clone;
        if (autoJournalIntervalContainer) {
            autoJournalIntervalContainer.style.display = group.autoJournalEnabled ? 'flex' : 'none';
            autoJournalSwitch.addEventListener('change', (e) => {
                autoJournalIntervalContainer.style.display = e.target.checked ? 'flex' : 'none';
                saveGroupSettingsFromSidebar(false);
            });
        }
    }
    if (autoJournalIntervalInput) autoJournalIntervalInput.value = group.autoJournalInterval || 100;

    document.getElementById('setting-group-title-layout').value = group.titleLayout || 'left';
    document.getElementById('setting-group-show-timestamp').checked = group.showTimestamp || false;
    document.getElementById('setting-group-timestamp-style').value = group.timestampStyle || 'bubble';
    document.getElementById('setting-group-timestamp-format').value = group.timestampFormat || 'hm';
    document.getElementById('setting-group-allow-gossip').checked = group.allowGossip || false;

    const bilingualModeCheckbox = document.getElementById('setting-group-bilingual-mode');
    const bilingualStyleSelect = document.getElementById('setting-group-bilingual-style');
    const bilingualStyleContainer = document.getElementById('setting-group-bilingual-style-container');
    
    if (bilingualModeCheckbox && bilingualStyleSelect) {
        bilingualModeCheckbox.checked = group.bilingualModeEnabled || false;
        bilingualStyleSelect.value = group.bilingualBubbleStyle || 'under';
        
        if (bilingualStyleContainer) {
            bilingualStyleContainer.style.display = group.bilingualModeEnabled ? 'flex' : 'none';
        }
        
        // 移除旧的监听器以防重复绑定 (虽然 loadGroupSettingsToSidebar 通常每次打开都会调用，但最好保持干净)
        const newCheckbox = bilingualModeCheckbox.cloneNode(true);
        bilingualModeCheckbox.parentNode.replaceChild(newCheckbox, bilingualModeCheckbox);
        
        newCheckbox.addEventListener('change', (e) => {
            if (bilingualStyleContainer) {
                bilingualStyleContainer.style.display = e.target.checked ? 'flex' : 'none';
            }
            saveGroupSettingsFromSidebar(false);
        });
    }

    const avatarRadius = group.avatarRadius !== undefined ? group.avatarRadius : 50;
    document.getElementById('setting-group-avatar-radius').value = avatarRadius;
    document.getElementById('setting-group-avatar-radius-value').textContent = `${avatarRadius}%`;
    
    const radiusSlider = document.getElementById('setting-group-avatar-radius');
    const radiusValue = document.getElementById('setting-group-avatar-radius-value');
    radiusSlider.oninput = () => {
        radiusValue.textContent = `${radiusSlider.value}%`;
    };

    // --- 群公告设置 ---
    const showNoticeCheckbox = document.getElementById('setting-group-show-notice');
    const noticeTextarea = document.getElementById('setting-group-notice');
    if (showNoticeCheckbox && noticeTextarea) {
        showNoticeCheckbox.checked = group.showNotice || false;
        noticeTextarea.value = group.notice || '';
        noticeTextarea.disabled = !group.showNotice;
    }

    renderGroupMembersInSettings(group);

    // --- 渲染群聊表情包分组 ---
    const stickerGroupsContainer = document.getElementById('setting-group-sticker-groups-container');
    if (stickerGroupsContainer) {
        stickerGroupsContainer.innerHTML = '';
        const allGroups = [...new Set(db.myStickers.map(s => s.group || '未分类'))].filter(g => g);
        const groupStickerGroups = (group.stickerGroups || '').split(/[,，]/).map(s => s.trim());

        if (allGroups.length === 0) {
            stickerGroupsContainer.innerHTML = '<span style="color:#999; font-size:12px;">暂无表情包分组，请先在表情包管理中添加。</span>';
        } else {
            allGroups.forEach(g => {
                const tag = document.createElement('div');
                tag.className = 'sticker-group-tag';
                if (groupStickerGroups.includes(g)) {
                    tag.classList.add('selected');
                }
                tag.textContent = g;
                tag.dataset.group = g;
                
                tag.addEventListener('click', () => {
                    tag.classList.toggle('selected');
                });
                
                stickerGroupsContainer.appendChild(tag);
            });
        }
    }

    const useGroupCustomCssCheckbox = document.getElementById('setting-group-use-custom-css'),
        groupCustomCssTextarea = document.getElementById('setting-group-custom-bubble-css'),
        groupPreviewBox = document.getElementById('group-bubble-css-preview');
    useGroupCustomCssCheckbox.checked = group.useCustomBubbleCss || false;
    groupCustomCssTextarea.value = group.customBubbleCss || '';
    groupCustomCssTextarea.disabled = !useGroupCustomCssCheckbox.checked;
    const theme = colorThemes[group.theme || 'white_pink'];
    updateBubbleCssPreview(groupPreviewBox, group.customBubbleCss, !group.useCustomBubbleCss, theme);
    populateBubblePresetSelect('group-bubble-preset-select');

    // 触发群设置引导 (连续引导)
    if (window.GuideSystem) {
        window.GuideSystem.check('guide_group_notice', () => {
            // 当群公告引导结束后，触发私聊引导
            window.GuideSystem.check('guide_group_gossip');
        });
    }
}

function renderGroupMembersInSettings(group) {
    const groupMembersListContainer = document.getElementById('group-members-list-container');
    if (!groupMembersListContainer) return;
    groupMembersListContainer.innerHTML = '';
    group.members.forEach(member => {
        const memberDiv = document.createElement('div');
        memberDiv.className = 'group-member';
        memberDiv.dataset.id = member.id;
        memberDiv.innerHTML = `<img src="${member.avatar}" alt="${member.groupNickname}"><span>${member.groupNickname}</span>`;
        groupMembersListContainer.appendChild(memberDiv);
    });
    const addBtn = document.createElement('div');
    addBtn.className = 'add-member-btn';
    addBtn.innerHTML = `<div class="add-icon">+</div><span>添加</span>`;
    groupMembersListContainer.appendChild(addBtn);
}

function renderGroupRecipientSelectionList(actionText) {
    const group = db.groups.find(g => g.id === currentChatId);
    if (!group) return;
    const groupRecipientSelectionTitle = document.getElementById('group-recipient-selection-title');
    const groupRecipientSelectionList = document.getElementById('group-recipient-selection-list');
    
    groupRecipientSelectionTitle.textContent = actionText;
    groupRecipientSelectionList.innerHTML = '';
    group.members.forEach(member => {
        const li = document.createElement('li');
        li.className = 'group-recipient-select-item';
        li.innerHTML = `
                <input type="checkbox" id="recipient-select-${member.id}" value="${member.id}">
                <label for="recipient-select-${member.id}">
                    <img src="${member.avatar}" alt="${member.groupNickname}">
                    <span>${member.groupNickname}</span>
                </label>`;
        groupRecipientSelectionList.appendChild(li);
    });
}

async function saveGroupSettingsFromSidebar(showToastFlag = true) {
    const group = db.groups.find(g => g.id === currentChatId);
    if (!group) return;
    const oldName = group.name;
    const newName = document.getElementById('setting-group-name').value;
    if (oldName !== newName) {
        group.name = newName;
        sendRenameNotification(group, newName);
    }
    group.avatar = document.getElementById('setting-group-avatar-preview').src;
    group.me.avatar = document.getElementById('setting-group-my-avatar-preview').src;
    group.me.nickname = document.getElementById('setting-group-my-nickname').value;
    group.me.persona = document.getElementById('setting-group-my-persona').value;

    const selectedGroups = Array.from(document.querySelectorAll('#setting-group-sticker-groups-container .sticker-group-tag.selected'))
        .map(tag => tag.dataset.group)
        .join(',');
    group.stickerGroups = selectedGroups;

    group.theme = document.getElementById('setting-group-theme-color').value;
    group.maxMemory = document.getElementById('setting-group-max-memory').value;

    // --- 群聊 <- 私聊：群成员私聊记忆互通 ---
    const syncPrivateMemoryEl = document.getElementById('setting-group-sync-private-memory');
    group.syncPrivateMemory = syncPrivateMemoryEl ? !!syncPrivateMemoryEl.checked : false;
    const privateHistoryEl = document.getElementById('setting-group-private-memory-history-count');
    const privateHistoryCountInput = parseInt(privateHistoryEl ? privateHistoryEl.value : '', 10);
    group.privateMemoryHistoryCount = (isNaN(privateHistoryCountInput) || privateHistoryCountInput < 0) ? 20 : privateHistoryCountInput;
    const privateSummaryEl = document.getElementById('setting-group-private-memory-summary-count');
    const privateSummaryCountInput = parseInt(privateSummaryEl ? privateSummaryEl.value : '', 10);
    group.privateMemorySummaryCount = (isNaN(privateSummaryCountInput) || privateSummaryCountInput < 0) ? 0 : privateSummaryCountInput;

    group.autoJournalEnabled = document.getElementById('setting-group-auto-journal-enabled').checked;
    const autoJournalIntervalInput = parseInt(document.getElementById('setting-group-auto-journal-interval').value, 10);
    group.autoJournalInterval = (isNaN(autoJournalIntervalInput) || autoJournalIntervalInput < 10) ? 100 : autoJournalIntervalInput;
    group.useCustomBubbleCss = document.getElementById('setting-group-use-custom-css').checked;
    group.customBubbleCss = document.getElementById('setting-group-custom-bubble-css').value;
    
    group.titleLayout = document.getElementById('setting-group-title-layout').value;
    const header = document.getElementById('chat-room-header-default');
    if (group.titleLayout === 'center') {
        header.classList.add('title-centered');
    } else {
        header.classList.remove('title-centered');
    }

    group.avatarRadius = parseInt(document.getElementById('setting-group-avatar-radius').value, 10);

    group.showTimestamp = document.getElementById('setting-group-show-timestamp').checked;
    group.timestampStyle = document.getElementById('setting-group-timestamp-style').value;
    group.timestampFormat = document.getElementById('setting-group-timestamp-format').value;
    
    const oldAllowGossip = group.allowGossip || false;
    const newAllowGossip = document.getElementById('setting-group-allow-gossip').checked;
    
    if (oldAllowGossip !== newAllowGossip) {
        group.allowGossip = newAllowGossip;
        const sysContent = newAllowGossip 
            ? `[system: 本群允许“群成员私聊”。（本条不可见，无需做出回应，请自然地继续群内聊天）]`
            : `[system: 本群已关闭“群成员私聊”。请停止所有私聊，禁止再发送任何私聊格式的消息。（本条不可见，无需做出回应，请自然地继续群内聊天）]`;
            
        const sysMsg = {
            id: `msg_${Date.now()}`,
            role: 'system', // 使用 system role
            content: sysContent,
            parts: [{type: 'text', text: sysContent}],
            timestamp: Date.now()
        };
        group.history.push(sysMsg);
    } else {
        group.allowGossip = newAllowGossip;
    }
    
    group.bilingualModeEnabled = document.getElementById('setting-group-bilingual-mode').checked;
    group.bilingualBubbleStyle = document.getElementById('setting-group-bilingual-style').value;

    // --- 保存群公告 ---
    group.showNotice = document.getElementById('setting-group-show-notice').checked;
    group.notice = document.getElementById('setting-group-notice').value;
    
    const chatScreen = document.getElementById('chat-room-screen');
    if (group.showTimestamp) {
        chatScreen.classList.add('show-timestamp');
    } else {
        chatScreen.classList.remove('show-timestamp');
    }
    chatScreen.classList.remove('timestamp-side');

    chatScreen.classList.remove('timestamp-style-bubble', 'timestamp-style-avatar');
    chatScreen.classList.add(`timestamp-style-${group.timestampStyle || 'bubble'}`);

    // updateCustomBubbleStyle(currentChatId, group.customBubbleCss, group.useCustomBubbleCss); // 移除实时应用以防污染设置页
    await saveData();
    if (showToastFlag) showToast('群聊设置已保存！');
    chatRoomTitle.textContent = group.name;
    renderChatList();
    renderMessages(false, true);
}

function openGroupMemberEditModal(memberId) {
    const group = db.groups.find(g => g.id === currentChatId);
    const member = group.members.find(m => m.id === memberId);
    if (!member) return;
    document.getElementById('edit-group-member-title').textContent = `编辑 ${member.groupNickname}`;
    document.getElementById('editing-member-id').value = member.id;
    document.getElementById('edit-member-avatar-preview').src = member.avatar;
    document.getElementById('edit-member-group-nickname').value = member.groupNickname;
    document.getElementById('edit-member-real-name').value = member.realName;
    document.getElementById('edit-member-persona').value = member.persona;
    document.getElementById('edit-group-member-modal').classList.add('visible');
}

function renderInviteSelectionList() {
    const inviteMemberSelectionList = document.getElementById('invite-member-selection-list');
    const confirmInviteBtn = document.getElementById('confirm-invite-btn');
    if (!inviteMemberSelectionList) return;
    inviteMemberSelectionList.innerHTML = '';
    const group = db.groups.find(g => g.id === currentChatId);
    if (!group) return;
    const currentMemberCharIds = new Set(group.members.map(m => m.originalCharId));
    const availableChars = db.characters.filter(c => !currentMemberCharIds.has(c.id));
    if (availableChars.length === 0) {
        inviteMemberSelectionList.innerHTML = '<li style="color:#aaa; text-align:center; padding: 10px 0;">没有可邀请的新成员了。</li>';
        confirmInviteBtn.disabled = true;
        return;
    }
    confirmInviteBtn.disabled = false;
    availableChars.forEach(char => {
        const li = document.createElement('li');
        li.className = 'invite-member-select-item';
        li.innerHTML = `<input type="checkbox" id="invite-select-${char.id}" value="${char.id}"><label for="invite-select-${char.id}"><img src="${char.avatar}" alt="${char.remarkName}"><span>${char.remarkName}</span></label>`;
        inviteMemberSelectionList.appendChild(li);
    });
}

function sendInviteNotification(group, newMemberRealName) {
    const messageContent = `[${group.me.nickname}邀请${newMemberRealName}加入了群聊]`;
    const message = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content: messageContent,
        parts: [{type: 'text', text: messageContent}],
        timestamp: Date.now(),
        senderId: 'user_me'
    };
    group.history.push(message);
}

function sendRenameNotification(group, newName) {
    const myName = group.me.nickname;
    const messageContent = `[${myName}修改群名为：${newName}]`;
    const message = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content: messageContent,
        parts: [{type: 'text', text: messageContent}],
        timestamp: Date.now()
    };
    group.history.push(message);
}

function generateGroupSystemPrompt(group) {
    // 收集关联的 + 全局的世界书（去重）
    let isOfflineNode = false;
    if (group.activeNodeId && group.nodes) {
        const activeNode = group.nodes.find(n => n.id === group.activeNodeId);
        if (activeNode) {
            let baseMode = (activeNode.customConfig && activeNode.customConfig.baseMode) ? activeNode.customConfig.baseMode : 
                           (activeNode.type === 'offline' || (activeNode.type === 'spinoff' && activeNode.spinoffMode === 'offline') ? 'offline' : 'online');
            if (baseMode === 'offline') {
                isOfflineNode = true;
            }
        }
    }
    let associatedIds = group.worldBookIds || [];
    if (isOfflineNode) {
        associatedIds = (group.offlineWorldBookIds && group.offlineWorldBookIds.length > 0) ? group.offlineWorldBookIds : (group.worldBookIds || []);
    }
    const globalBooks = db.worldBooks.filter(wb => wb.isGlobal && !wb.disabled);
    const globalIds = globalBooks.map(wb => wb.id);
    const allBookIds = [...new Set([...associatedIds, ...globalIds])];
    
    const worldBooksBefore = allBookIds.map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'before')).filter(wb => wb && !wb.disabled).map(wb => wb.content).join('\n');
    const worldBooksMiddle = allBookIds.map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'middle')).filter(wb => wb && !wb.disabled).map(wb => wb.content).join('\n');
    const worldBooksAfter = allBookIds.map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'after')).filter(wb => wb && !wb.disabled).map(wb => wb.content).join('\n');

    let prompt = `你正在一个名为“404”的线上聊天软件中，在一个名为“${group.name}”的群聊里进行角色扮演。请严格遵守以下所有规则：\n\n`;

    if (worldBooksBefore) {
        prompt += `${worldBooksBefore}\n\n`;
    }
    if (worldBooksMiddle) {
        prompt += `${worldBooksMiddle}\n\n`;
    }

    const favoritedJournals = (group.memoryJournals || [])
        .filter(j => j.isFavorited)
        .map(j => `标题：${j.title}\n内容：${j.content}`)
        .join('\n\n---\n\n');

    if (favoritedJournals) {
        prompt += `【群聊重要回忆/总结】\n这是你需要记住的群聊往事背景：\n${favoritedJournals}\n\n`;
    }

    // --- 群聊 <- 私聊：让群成员读取各自私聊记忆（可选）---
    if (group.syncPrivateMemory) {
        const rawHistoryCount = parseInt(group.privateMemoryHistoryCount, 10);
        const rawSummaryCount = parseInt(group.privateMemorySummaryCount, 10);
        const perMemberHistoryCount = isNaN(rawHistoryCount) ? 20 : Math.max(0, Math.min(rawHistoryCount, 200));
        const perMemberSummaryCount = isNaN(rawSummaryCount) ? 0 : Math.max(0, Math.min(rawSummaryCount, 50));

        const formatMsgContent = (m) => {
            if (m && Array.isArray(m.parts) && m.parts.length > 0) {
                return m.parts.map(p => p.text || '[图片]').join('');
            }
            return (m && m.content) ? m.content : '';
        };

        let privateMemoryContext = '';

        group.members.forEach(member => {
            const char = db.characters.find(c => c.id === member.originalCharId);
            if (!char) return;

            // 私聊总结（收藏的记忆/日记）
            let memberSummaryText = '';
            // 0 表示读取全部收藏总结，> 0 表示只读取最近的N条
            let fav = (char.memoryJournals || []).filter(j => j.isFavorited);
            if (perMemberSummaryCount > 0 && fav.length > perMemberSummaryCount) {
                // 如果设置了数量限制且总数超过限制，则只取最近的N条
                fav = fav
                    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
                    .slice(0, perMemberSummaryCount);
            }
            if (fav.length > 0) {
                memberSummaryText = fav
                    .map(j => `标题：${j.title}\n内容：${j.content}`)
                    .join('\n\n---\n\n');
            }

            // 私聊最近记录
            let memberHistoryText = '';
            if (perMemberHistoryCount > 0 && Array.isArray(char.history) && char.history.length > 0) {
                let recent = char.history.slice(-perMemberHistoryCount);

                // 过滤掉不应进入上下文的消息
                if (typeof filterHistoryForAI === 'function') {
                    recent = filterHistoryForAI(char, recent);
                }
                recent = recent
                    .filter(m => !m.isContextDisabled)
                    .filter(m => m.role === 'user' || m.role === 'assistant');

                if (recent.length > 0) {
                    memberHistoryText = recent.map(m => {
                        const content = formatMsgContent(m);
                        const sender = (m.role === 'user')
                            ? ((group.me && group.me.nickname) ? group.me.nickname : '我')
                            : (member.realName || member.groupNickname || '成员');
                        return `${sender}: ${content}`;
                    }).join('\n');
                }
            }

            if (memberSummaryText || memberHistoryText) {
                privateMemoryContext += `\n【${member.realName} 的私聊记忆（仅${member.realName}可见）】\n`;
                if (memberSummaryText) {
                    privateMemoryContext += `私聊总结（收藏）：\n${memberSummaryText}\n`;
                }
                if (memberHistoryText) {
                    privateMemoryContext += `私聊最近记录：\n${memberHistoryText}\n`;
                }
            }
        });

        if (privateMemoryContext) {
            prompt += `【群聊角色私聊记忆（重要规则）】\n`;
            prompt += `- 以下“私聊记忆”是每个成员与用户之间在群聊之外的私聊背景。\n`;
            prompt += `- 你在扮演群聊时，**只有对应成员本人**可以使用自己的私聊记忆来理解用户、调整语气与关系推进；其他成员**不得**引用或暗示这些私聊细节（除非这些细节曾在群里公开提到）。\n`;
            prompt += `${privateMemoryContext}\n\n`;
        }
    }

    prompt += `1. **核心任务**: 你需要同时扮演这个群聊中的 **所有** AI 成员。我会作为唯一的人类用户（“我”，昵称：${group.me.nickname}）与你们互动。\n\n`;
    prompt += `2. **群聊成员列表**: 以下是你要扮演的所有角色以及我的信息：\n`;
    prompt += `   - **我 (用户)**: \n     - 群内昵称: ${group.me.nickname}\n     - 我的人设: ${group.me.persona || '无特定人设'}\n`;
    group.members.forEach(member => {
        prompt += `   - **角色: ${member.realName} (AI)**\n`;
        prompt += `     - 群内昵称: ${member.groupNickname}\n`;
        prompt += `     - 人设: ${member.persona || '无特定人设'}\n`;
    });

    // --- 插入群公告 ---
    if (group.showNotice && group.notice && group.notice.trim()) {
        prompt += `\n【当前群公告/剧情背景】\n${group.notice}\n(系统提示：这是当前群聊的重要置顶信息，所有成员都已知晓，请根据此背景进行互动。)\n`;
    }

    if (worldBooksAfter) {
        prompt += `\n${worldBooksAfter}\n\n`;
    } else {
        prompt += `\n`;
    }

    prompt += `3. **我的消息格式解析**: 我（用户）的消息有多种格式，你需要理解其含义并让群成员做出相应反应：\n`;
    prompt += `   - \`[${group.me.nickname}的消息：...]\`: 我的普通聊天消息。\n`;
    prompt += `   - \`[${group.me.nickname} 向 {某个成员真名} 转账：...]\`: 我给某个特定成员转账了。\n`;
    prompt += `   - \`[${group.me.nickname} 向 {某个成员真名} 送来了礼物：...]\`: 我给某个特定成员送了礼物。\n`;
    prompt += `   - \`[${group.me.nickname}的表情包：...]\`, \`[${group.me.nickname}的语音：...]\`, \`[${group.me.nickname}发来的照片/视频：...]\`: 我发送了特殊类型的消息，群成员可以对此发表评论。\n`;
    prompt += `   - \`[system: ...]\`, \`[...邀请...加入了群聊]\`, \`[...修改群名为...]\`: 系统通知或事件，群成员应据此作出反应，例如欢迎新人、讨论新群名等。\n\n`;

    // --- 表情包逻辑 ---
    const groups = (group.stickerGroups || '').split(/[,，]/).map(s => s.trim()).filter(s => s && s !== '未分类');
    let stickerInstruction = '';
    let canUseStickers = false;
    if (groups.length > 0) {
        const availableStickers = db.myStickers.filter(s => groups.includes(s.group));
        if (availableStickers.length > 0) {
            const stickerNames = availableStickers.map(s => s.name).join(', ');
            stickerInstruction = `   - **可用表情包**: 你们可以使用以下表情包来表达情绪：[${stickerNames}]。\n`;
            canUseStickers = true;
        }
    }
    prompt += stickerInstruction;

    let outputFormats = `
- **普通消息**: \`[{成员真名}的消息：{消息内容}]\``;

    if (canUseStickers) {
        outputFormats += `\n- **表情包**: \`[{成员真名}发送的表情包：{表情包名称}]\`。例如：\`[{成员真名}发送的表情包：开心]\`。`;
    }

    outputFormats += `
- **语音**: \`[{成员真名}的语音：{语音转述的文字}]\`
- **照片/视频**: \`[{成员真名}发来的照片/视频：{内容描述}]\`
- **转账**: \`[{发起者真名} 向 {接收者真名} 转账：{金额}元；备注：{备注}]\``;

    if (group.allowGossip) {
        outputFormats += `
- **私聊消息**: \`[Private: {发起者真名} -> {接收者真名}: {内容}]\`
- **结束私聊**: \`[Private-End: {发起者真名} -> {接收者真名}]\``;
    }
   
   const allWorldBookContent = worldBooksBefore + '\n' + worldBooksAfter;
   if (allWorldBookContent.includes('<orange>')) {
       outputFormats += `\n   - **HTML消息**: \`<orange char="{成员真名}">{HTML内容}</orange>\`。这是一种特殊的、用于展示丰富样式的小卡片消息，你可以用它来创造更有趣的互动。注意要用成员的 **真名** 填充 \`char\` 属性。`;
   }
   
    prompt += `4. **你的输出格式 (极其重要)**: 你生成的每一条消息都 **必须** 严格遵循以下格式之一。每条消息占一行。请用成员的 **真名** 填充格式中的 \`{成员真名}\`。\n${outputFormats}\n\n`;
    
    if (group.bilingualModeEnabled) {
        prompt += `✨双语模式特别指令✨：当群成员的母语为中文以外的语言时，其消息回复**必须**严格遵循双语模式下的普通消息格式：\`[{成员真名}的消息：{外语原文}「中文翻译」]\`。例如: \`[Alice的消息：Of course, I'd love to.「当然，我很乐意。」]\`。中文翻译文本视为系统自翻译，不视为角色的原话。当角色想要说中文时，请使用标准格式：\`[{成员真名}的消息：{中文消息内容}]\`。这条规则的优先级非常高，请务必遵守。\n\n`;
    }

    prompt += `   - **重要**: 群聊不支持AI成员接收礼物的特殊指令（即你不能发送[已接收礼物]指令，但可以用语言表达感谢），也不支持更新状态。你只需要通过普通消息来回应我发送的礼物即可。\n`;
    prompt += `   - ✨**极其重要**✨: 当我（${group.me.nickname}）向群内某个成员转账时，**被转账的成员必须**对此做出回应。该成员有两个选择，且必须严格遵循以下格式之一（这条指令消息本身不会显示给用户，但会触发转账状态的变化）。该成员可以在发送这条指令后，再附带一条普通的聊天消息来表达想法：\n`;
    prompt += `     a) 接收转账: \`[{被转账成员真名}接收${group.me.nickname}的转账]\`\n`;
    prompt += `     b) 退回转账: \`[{被转账成员真名}退回${group.me.nickname}的转账]\`\n\n`;

    prompt += `5. **模拟群聊氛围**: 为了让群聊看起来真实、活跃且混乱，你的每一次回复都必须遵循以下随机性要求：\n`;
    const numMembers = group.members.length;
    const minMessages = numMembers * 2;
    const maxMessages = numMembers * 4;
    prompt += `   - **消息数量**: 你的回复需要包含 **${minMessages}到${maxMessages}条** 消息 (即平均每个成员回复2-4条)。确保有足够多的互动。\n`;
    prompt += `   - **发言者与顺序随机**: 随机选择群成员发言，顺序也必须是随机的，不要按固定顺序轮流。\n`;
    prompt += `   - **内容多样性**: 你的回复应以普通文本消息为主，但可以 **偶尔、选择性地** 让某个成员发送一条特殊消息（表情包、语音、照片/视频），以增加真实感。不要滥用特殊消息。\n`;
    prompt += `   - **对话连贯性**: 尽管发言是随机的，但对话内容应整体围绕我和其他成员的发言展开，保持一定的逻辑连贯性。\n\n`;

    prompt += `6. **行为准则**:\n`;
    prompt += `   - **对公开事件的反应 (重要)**: 当我（用户）向群内 **某一个** 成员转账或送礼时，这是一个 **全群可见** 的事件。除了当事成员可以表示感谢外，**其他未参与的AI成员也应该注意到**，并根据各自的人设做出反应。例如，他们可能会表示羡慕、祝贺、好奇、开玩笑或者起哄。这会让群聊的氛围更真实、更热闹。\n`;
    
    if (group.allowGossip) {
        prompt += `   - **群内私聊会话模式**: 这是一个特殊的剧情机制。群成员之间可以发起“私聊”，这些内容**对其他群成员不可见**，也不应该干扰主群聊的时间线。
     - **格式**: 
       - 发起/回复: \`[Private: {发起者真名} -> {接收者真名}: {内容}]\`
       - 结束话题: \`[Private-End: {发起者真名} -> {接收者真名}]\`
     - **规则**: 
       1. 私聊是平行发生的，不占用主群聊回合。私聊对象可以是群内其他AI成员，也可以是用户（我）。
       2. **适度原则**：同个私聊话题不应无限期进行。**建议在 6到15个回合 后自然结束话题**。不要让私聊变得过于冗长。
       3. **内容建议**：私聊非常适合用来吐槽主群聊中正在发生的事情，或者讨论不想让其他人知道的秘密。
       4. **结束条件**：当话题聊完，或者主群聊发生了更重要的事情导致私聊无法继续时，请务必发送 \`Private-End\` 结束私聊。\n`;
    }

    prompt += `   - 严格扮演每个角色的人设，不同角色之间应有明显的性格和语气差异。\n`;
    prompt += `   - 你的回复中只能包含第4点列出的合法格式的消息。绝对不能包含任何其他内容，如 \`[场景描述]\`, \`(心理活动)\`, \`*动作*\` 或任何格式之外的解释性文字。\n`;
    prompt += `   - 保持对话的持续性，不要主动结束对话。\n\n`;
    prompt += `现在，请根据以上设定，开始扮演群聊中的所有角色。`;
    if (group.me && group.me.nickname) {
        prompt = prompt.replace(/\{\{user\}\}/gi, group.me.nickname);
    }

    return prompt;
}

function injectGossipContext(chat, historySlice) {
    if (!chat.allowGossip || !chat.privateSessions) return historySlice;

    const startTime = historySlice.length > 0 ? historySlice[0].timestamp : 0;
    const privateMessages = [];

    Object.values(chat.privateSessions).forEach(session => {
        if (session.history && session.history.length > 0) {
            session.history.forEach(pMsg => {
                if (pMsg.timestamp >= startTime) {
                    if (pMsg.isEndCommand) {
                        // 结束指令直接注入
                        privateMessages.push({
                            role: 'assistant',
                            content: pMsg.content,
                            timestamp: pMsg.timestamp,
                            isPrivateContext: true
                        });
                    } else {
                        // 普通私聊消息需要包装
                        const receiver = session.memberNames.find(n => n !== pMsg.sender);
                        if (receiver) {
                            privateMessages.push({
                                role: 'assistant',
                                content: `[Private: ${pMsg.sender} -> ${receiver}: ${pMsg.content}]`,
                                timestamp: pMsg.timestamp,
                                isPrivateContext: true
                            });
                        }
                    }
                }
            });
        }
    });

    if (privateMessages.length > 0) {
        const newHistory = historySlice.concat(privateMessages);
        newHistory.sort((a, b) => a.timestamp - b.timestamp);
        return newHistory;
    }

    return historySlice;
}
