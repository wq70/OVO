function loadGroupSettingsToSidebar() {
    const group = db.groups.find(g => g.id === currentChatId);
    if (!group) return;
    if (window.McpManager) window.McpManager.renderPermissionEditor(document.getElementById('group-mcp-settings'), group);
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
    
    const myGroupBirthdayEl = document.getElementById('setting-group-my-birthday');
    if (myGroupBirthdayEl) myGroupBirthdayEl.value = group.me.birthday || '';
    const myGroupEnableDynamicAgeEl = document.getElementById('setting-group-my-enable-dynamic-age');
    if (myGroupEnableDynamicAgeEl) myGroupEnableDynamicAgeEl.checked = group.me.enableDynamicAge || false;
    
    themeSelect.value = group.theme || 'white_pink';
    document.getElementById('setting-group-max-memory').value = group.maxMemory;
    const journalNewestFirstEl = document.getElementById('setting-group-journal-newest-first');
    if (journalNewestFirstEl) journalNewestFirstEl.checked = group.journalNewestFirst === true;
    const journalFavoriteTopEl = document.getElementById('setting-group-journal-favorite-top');
    if (journalFavoriteTopEl) journalFavoriteTopEl.checked = group.journalFavoriteTop !== false;

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
    const autoJournalRetryBtn = document.getElementById('setting-group-auto-journal-retry-btn');
    const autoJournalLatestBtn = document.getElementById('setting-group-summarize-latest-btn');
    if (autoJournalSwitch) {
        autoJournalSwitch.checked = group.autoJournalEnabled || false;
        const parent = autoJournalSwitch.parentNode;
        const clone = autoJournalSwitch.cloneNode(true);
        parent.replaceChild(clone, autoJournalSwitch);
        autoJournalSwitch = clone;
        if (autoJournalIntervalContainer) {
            autoJournalIntervalContainer.style.display = group.autoJournalEnabled ? 'flex' : 'none';
            autoJournalSwitch.addEventListener('change', async (e) => {
                autoJournalIntervalContainer.style.display = e.target.checked ? 'flex' : 'none';
                const intervalValue = parseInt(autoJournalIntervalInput ? autoJournalIntervalInput.value : '', 10);
                group.autoJournalInterval = (isNaN(intervalValue) || intervalValue < 10) ? 100 : intervalValue;

                if (typeof applyAutoJournalToggleDecision === 'function') {
                    await applyAutoJournalToggleDecision(group, e.target.checked, { chatType: 'group' });
                } else {
                    group.autoJournalEnabled = e.target.checked;
                }

                await saveGroupSettingsFromSidebar(false);
            });
        }
    }
    if (autoJournalIntervalInput) {
        autoJournalIntervalInput.value = group.autoJournalInterval || 100;
        autoJournalIntervalInput.onblur = async () => {
            const intervalValue = parseInt(autoJournalIntervalInput.value, 10);
            group.autoJournalInterval = (isNaN(intervalValue) || intervalValue < 10) ? 100 : intervalValue;
            if (typeof refreshAutoJournalButton === 'function') {
                refreshAutoJournalButton(group, 'group');
            }
            await saveGroupSettingsFromSidebar(false);
        };
    }
    if (typeof ensureAutoJournalState === 'function') {
        ensureAutoJournalState(group);
    }
    if (autoJournalRetryBtn) {
        const parent = autoJournalRetryBtn.parentNode;
        const clone = autoJournalRetryBtn.cloneNode(true);
        parent.replaceChild(clone, autoJournalRetryBtn);
        clone.addEventListener('click', async () => {
            const intervalValue = parseInt(autoJournalIntervalInput ? autoJournalIntervalInput.value : '', 10);
            group.autoJournalInterval = (isNaN(intervalValue) || intervalValue < 10) ? 100 : intervalValue;

            if (typeof retryAutoJournalForChat === 'function') {
                await retryAutoJournalForChat(group, { chatType: 'group' });
            }

            await saveGroupSettingsFromSidebar(false);
        });
    }
    if (autoJournalLatestBtn) {
        const parent = autoJournalLatestBtn.parentNode;
        const clone = autoJournalLatestBtn.cloneNode(true);
        parent.replaceChild(clone, autoJournalLatestBtn);
        clone.addEventListener('click', async () => {
            const intervalValue = parseInt(autoJournalIntervalInput ? autoJournalIntervalInput.value : '', 10);
            group.autoJournalInterval = (isNaN(intervalValue) || intervalValue < 10) ? 100 : intervalValue;

            if (typeof getAutoJournalCursorInfo !== 'function' || typeof askSummarizeLatestOptions !== 'function' || typeof summarizeUntilLatest !== 'function') {
                return;
            }

            const info = getAutoJournalCursorInfo(group);
            if (info.unsummarizedCount <= 0) {
                showToast('当前没有新增消息需要总结');
                return;
            }

            const choice = await askSummarizeLatestOptions(info);
            if (!choice) return;

            await summarizeUntilLatest(group, {
                chatType: 'group',
                mode: choice.mode,
                splitSize: choice.splitSize,
                includeRemainder: choice.includeRemainder
            });

            await saveGroupSettingsFromSidebar(false);
        });
    }
    if (typeof refreshAutoJournalButton === 'function') {
        refreshAutoJournalButton(group, 'group');
    }

    document.getElementById('setting-group-title-layout').value = group.titleLayout || 'left';
    document.getElementById('setting-group-show-timestamp').checked = group.showTimestamp || false;
    document.getElementById('setting-group-timestamp-style').value = group.timestampStyle || 'bubble';
    document.getElementById('setting-group-timestamp-format').value = group.timestampFormat || 'hm';
    document.getElementById('setting-group-allow-gossip').checked = group.allowGossip || false;
    if (window.PokeSystem) window.PokeSystem.ensureSettings(group);
    const groupPokeEnabledEl = document.getElementById('setting-group-poke-enabled');
    const groupPokeOptionsEl = document.getElementById('setting-group-poke-options');
    if (groupPokeEnabledEl) groupPokeEnabledEl.checked = group.pokeEnabled === true;
    if (groupPokeOptionsEl) groupPokeOptionsEl.style.display = group.pokeEnabled === true ? 'block' : 'none';
    const groupPokeCharacterEl = document.getElementById('setting-group-poke-character-initiated');
    if (groupPokeCharacterEl) groupPokeCharacterEl.checked = group.pokeAllowCharacterInitiated !== false;
    const groupPokeMemberEl = document.getElementById('setting-group-poke-member-to-member');
    if (groupPokeMemberEl) groupPokeMemberEl.checked = group.pokeAllowMemberToMember !== false;
    const groupPokeSelfEl = document.getElementById('setting-group-poke-self');
    if (groupPokeSelfEl) groupPokeSelfEl.checked = group.pokeAllowSelf !== false;
    const groupPokeReplyEl = document.getElementById('setting-group-poke-trigger-reply');
    if (groupPokeReplyEl) groupPokeReplyEl.checked = group.pokeTriggerReply !== false;
    const groupPokeUserSuffixEl = document.getElementById('setting-group-poke-user-suffix');
    if (groupPokeUserSuffixEl) groupPokeUserSuffixEl.value = group.pokeUserSuffix || '';
    const groupPokeEffectEl = document.getElementById('setting-group-poke-effect-mode');
    if (groupPokeEffectEl) groupPokeEffectEl.value = group.pokeEffectMode || 'full';
    const groupPokeVibrationEl = document.getElementById('setting-group-poke-vibration');
    if (groupPokeVibrationEl) groupPokeVibrationEl.checked = group.pokeVibrationEnabled !== false;
    const groupPokeNotificationEl = document.getElementById('setting-group-poke-notification-mode');
    if (groupPokeNotificationEl) groupPokeNotificationEl.value = group.pokeNotificationMode || 'in_chat';
    const groupPokeContextEl = document.getElementById('setting-group-poke-context');
    if (groupPokeContextEl) groupPokeContextEl.checked = group.pokeContextEnabled !== false;

    const bilingualModeCheckbox = document.getElementById('setting-group-bilingual-mode');
    const bilingualStyleSelect = document.getElementById('setting-group-bilingual-style');
    const bilingualStyleContainer = document.getElementById('setting-group-bilingual-style-container');
    const bilingualMembersContainer = document.getElementById('setting-group-bilingual-members-container');
    const bilingualMembersBtn = document.getElementById('setting-group-bilingual-members-btn');
    const bilingualCharSelectModal = document.getElementById('bilingual-char-select-modal');
    const bilingualCharList = document.getElementById('bilingual-char-list');
    const bilingualCharSelectAll = document.getElementById('bilingual-char-select-all');
    const bilingualCharCancelBtn = document.getElementById('bilingual-char-cancel-btn');
    const bilingualCharConfirmBtn = document.getElementById('bilingual-char-confirm-btn');
    
    // 更新按钮文字
    const updateBilingualBtnText = (group) => {
        if (!bilingualMembersBtn) return;
        if (!group.bilingualMembers || group.bilingualMembers.length === 0) {
            bilingualMembersBtn.textContent = '选择角色';
            bilingualMembersBtn.classList.add('btn-secondary');
            bilingualMembersBtn.classList.remove('btn-primary');
        } else {
            bilingualMembersBtn.textContent = `已选 ${group.bilingualMembers.length} 名成员`;
            bilingualMembersBtn.classList.add('btn-primary');
            bilingualMembersBtn.classList.remove('btn-secondary');
        }
    };

    if (bilingualModeCheckbox && bilingualStyleSelect) {
        bilingualModeCheckbox.checked = group.bilingualModeEnabled || false;
        bilingualStyleSelect.value = group.bilingualBubbleStyle || 'under';
        document.getElementById('setting-group-auto-expand-translation').checked = group.autoExpandTranslation === true;
        
        if (bilingualStyleContainer) {
            bilingualStyleContainer.style.display = group.bilingualModeEnabled ? 'flex' : 'none';
        }
        if (bilingualMembersContainer) {
            bilingualMembersContainer.style.display = group.bilingualModeEnabled ? 'flex' : 'none';
            updateBilingualBtnText(group);
        }
        
        // 移除旧的监听器以防重复绑定
        const newCheckbox = bilingualModeCheckbox.cloneNode(true);
        bilingualModeCheckbox.parentNode.replaceChild(newCheckbox, bilingualModeCheckbox);
        
        newCheckbox.addEventListener('change', (e) => {
            if (bilingualStyleContainer) {
                bilingualStyleContainer.style.display = e.target.checked ? 'flex' : 'none';
            }
            if (bilingualMembersContainer) {
                bilingualMembersContainer.style.display = e.target.checked ? 'flex' : 'none';
            }
            saveGroupSettingsFromSidebar(false);
        });

        // 弹窗相关逻辑
        if (bilingualMembersBtn) {
            // 防止重复绑定
            const newMembersBtn = bilingualMembersBtn.cloneNode(true);
            bilingualMembersBtn.parentNode.replaceChild(newMembersBtn, bilingualMembersBtn);

            newMembersBtn.addEventListener('click', () => {
                const currentGroup = db.groups.find(g => g.id === currentChatId);
                if (!currentGroup || !bilingualCharList) return;

                // 渲染弹窗列表
                bilingualCharList.innerHTML = '';
                const selectedMembers = currentGroup.bilingualMembers || [];
                
                currentGroup.members.forEach(member => {
                    const div = document.createElement('div');
                    div.style.display = 'flex';
                    div.style.alignItems = 'center';
                    div.style.justifyContent = 'space-between';
                    div.style.padding = '10px 0';
                    div.style.borderBottom = '1px solid #f0f0f0';

                    const leftArea = document.createElement('div');
                    leftArea.style.display = 'flex';
                    leftArea.style.alignItems = 'center';
                    leftArea.style.gap = '10px';

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.value = member.id;
                    checkbox.className = 'bilingual-char-checkbox';
                    checkbox.checked = selectedMembers.includes(member.id);
                    checkbox.style.margin = '0';

                    const img = document.createElement('img');
                    img.src = member.avatar;
                    img.style.width = '36px';
                    img.style.height = '36px';
                    img.style.borderRadius = '50%';
                    img.style.objectFit = 'cover';

                    const name = document.createElement('span');
                    name.textContent = member.groupNickname;
                    name.style.fontSize = '14px';
                    name.style.color = '#333';

                    leftArea.appendChild(checkbox);
                    leftArea.appendChild(img);
                    leftArea.appendChild(name);

                    // 点击整行也能切换复选框
                    div.style.cursor = 'pointer';
                    div.onclick = (e) => {
                        if(e.target !== checkbox) {
                            checkbox.checked = !checkbox.checked;
                        }
                    };

                    div.appendChild(leftArea);
                    bilingualCharList.appendChild(div);
                });

                let currentSelectAll = document.getElementById('bilingual-char-select-all');
                if (currentSelectAll) {
                    currentSelectAll.checked = currentGroup.members.length > 0 && selectedMembers.length === currentGroup.members.length;
                    
                    // 解绑旧事件再绑新事件
                    const newSelectAll = currentSelectAll.cloneNode(true);
                    currentSelectAll.parentNode.replaceChild(newSelectAll, currentSelectAll);
                    
                    newSelectAll.addEventListener('change', (e) => {
                        const checkboxes = bilingualCharList.querySelectorAll('.bilingual-char-checkbox');
                        checkboxes.forEach(cb => cb.checked = e.target.checked);
                    });
                }

                if (bilingualCharSelectModal) {
                    bilingualCharSelectModal.style.display = 'flex';
                }
            });
        }

        if (bilingualCharCancelBtn) {
            bilingualCharCancelBtn.onclick = () => {
                if (bilingualCharSelectModal) bilingualCharSelectModal.style.display = 'none';
            };
        }

        if (bilingualCharConfirmBtn) {
            bilingualCharConfirmBtn.onclick = async () => {
                if (!bilingualCharList) return;
                const checkboxes = bilingualCharList.querySelectorAll('.bilingual-char-checkbox');
                const currentGroup = db.groups.find(g => g.id === currentChatId);
                
                if (currentGroup) {
                    currentGroup.bilingualMembers = Array.from(checkboxes)
                        .filter(cb => cb.checked)
                        .map(cb => cb.value);
                    
                    updateBilingualBtnText(currentGroup);
                    await saveGroup(currentGroup.id); // 立即保存到数据库，不再调用 saveGroupSettingsFromSidebar 以免互相覆盖
                }
                
                if (bilingualCharSelectModal) bilingualCharSelectModal.style.display = 'none';
            };
        }
    }

    const avatarRadius = group.avatarRadius !== undefined ? group.avatarRadius : 50;
    document.getElementById('setting-group-avatar-radius').value = avatarRadius;
    document.getElementById('setting-group-avatar-radius-value').textContent = `${avatarRadius}%`;
    
    const radiusSlider = document.getElementById('setting-group-avatar-radius');
    const radiusValue = document.getElementById('setting-group-avatar-radius-value');
    radiusSlider.oninput = () => {
        radiusValue.textContent = `${radiusSlider.value}%`;
    };

        // 头像圆角重置按钮
        const resetAvatarRadiusBtn = document.getElementById('reset-group-avatar-radius-btn');
        if (resetAvatarRadiusBtn) {
            resetAvatarRadiusBtn.onclick = () => {
                radiusSlider.value = 50;
                radiusValue.textContent = '50%';
            };
        }

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

        const stickerDescEnabledEl = document.getElementById('setting-group-sticker-description-enabled');
        if (stickerDescEnabledEl) {
            stickerDescEnabledEl.checked = group.stickerDescriptionEnabled || false;
        }

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

    const myGroupBirthdayInput = document.getElementById('setting-group-my-birthday');
    if (myGroupBirthdayInput) group.me.birthday = (myGroupBirthdayInput.value || '').trim();
    const myGroupEnableDynamicAgeInput = document.getElementById('setting-group-my-enable-dynamic-age');
    if (myGroupEnableDynamicAgeInput) group.me.enableDynamicAge = myGroupEnableDynamicAgeInput.checked;

    const selectedGroups = Array.from(document.querySelectorAll('#setting-group-sticker-groups-container .sticker-group-tag.selected'))
        .map(tag => tag.dataset.group)
        .join(',');
    group.stickerGroups = selectedGroups;

    const stickerDescEnabledEl = document.getElementById('setting-group-sticker-description-enabled');
    if (stickerDescEnabledEl) {
        group.stickerDescriptionEnabled = stickerDescEnabledEl.checked;
    }

    group.theme = document.getElementById('setting-group-theme-color').value;
    group.maxMemory = document.getElementById('setting-group-max-memory').value;
    const groupPokeEnabledEl = document.getElementById('setting-group-poke-enabled');
    group.pokeEnabled = !!(groupPokeEnabledEl && groupPokeEnabledEl.checked);
    if (window.PokeSystem) window.PokeSystem.updateTriggerUI(group, 'group');
    const groupPokeCharacterEl = document.getElementById('setting-group-poke-character-initiated');
    group.pokeAllowCharacterInitiated = !groupPokeCharacterEl || groupPokeCharacterEl.checked;
    const groupPokeMemberEl = document.getElementById('setting-group-poke-member-to-member');
    group.pokeAllowMemberToMember = !groupPokeMemberEl || groupPokeMemberEl.checked;
    const groupPokeSelfEl = document.getElementById('setting-group-poke-self');
    group.pokeAllowSelf = !groupPokeSelfEl || groupPokeSelfEl.checked;
    const groupPokeReplyEl = document.getElementById('setting-group-poke-trigger-reply');
    group.pokeTriggerReply = !groupPokeReplyEl || groupPokeReplyEl.checked;
    const groupPokeUserSuffixEl = document.getElementById('setting-group-poke-user-suffix');
    group.pokeUserSuffix = window.PokeSystem ? window.PokeSystem.cleanSuffix(groupPokeUserSuffixEl && groupPokeUserSuffixEl.value) : ((groupPokeUserSuffixEl && groupPokeUserSuffixEl.value) || '').trim();
    const groupPokeEffectEl = document.getElementById('setting-group-poke-effect-mode');
    group.pokeEffectMode = groupPokeEffectEl ? groupPokeEffectEl.value : 'full';
    const groupPokeVibrationEl = document.getElementById('setting-group-poke-vibration');
    group.pokeVibrationEnabled = !groupPokeVibrationEl || groupPokeVibrationEl.checked;
    const groupPokeNotificationEl = document.getElementById('setting-group-poke-notification-mode');
    group.pokeNotificationMode = groupPokeNotificationEl ? groupPokeNotificationEl.value : 'in_chat';
    const groupPokeContextEl = document.getElementById('setting-group-poke-context');
    group.pokeContextEnabled = !groupPokeContextEl || groupPokeContextEl.checked;

    // --- 群聊 <- 私聊：群成员私聊记忆互通 ---
    const syncPrivateMemoryEl = document.getElementById('setting-group-sync-private-memory');
    group.syncPrivateMemory = syncPrivateMemoryEl ? !!syncPrivateMemoryEl.checked : false;
    const privateHistoryEl = document.getElementById('setting-group-private-memory-history-count');
    const privateHistoryCountInput = parseInt(privateHistoryEl ? privateHistoryEl.value : '', 10);
    group.privateMemoryHistoryCount = (isNaN(privateHistoryCountInput) || privateHistoryCountInput < 0) ? 20 : privateHistoryCountInput;
    const privateSummaryEl = document.getElementById('setting-group-private-memory-summary-count');
    const privateSummaryCountInput = parseInt(privateSummaryEl ? privateSummaryEl.value : '', 10);
    group.privateMemorySummaryCount = (isNaN(privateSummaryCountInput) || privateSummaryCountInput < 0) ? 0 : privateSummaryCountInput;

    if (typeof ensureAutoJournalState === 'function') {
        ensureAutoJournalState(group);
    }
    group.autoJournalEnabled = document.getElementById('setting-group-auto-journal-enabled').checked;
    const journalNewestFirstSaveEl = document.getElementById('setting-group-journal-newest-first');
    if (journalNewestFirstSaveEl) group.journalNewestFirst = journalNewestFirstSaveEl.checked;
    const journalFavoriteTopSaveEl = document.getElementById('setting-group-journal-favorite-top');
    if (journalFavoriteTopSaveEl) group.journalFavoriteTop = journalFavoriteTopSaveEl.checked;
    const autoJournalIntervalInput = parseInt(document.getElementById('setting-group-auto-journal-interval').value, 10);
    group.autoJournalInterval = (isNaN(autoJournalIntervalInput) || autoJournalIntervalInput < 10) ? 100 : autoJournalIntervalInput;
    if (window.McpManager && document.getElementById('group-mcp-settings')) group.mcpSettings = window.McpManager.readPermissionEditor(document.getElementById('group-mcp-settings'));
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
    group.autoExpandTranslation = document.getElementById('setting-group-auto-expand-translation').checked;
    
    // bilingualMembers 现在由弹窗确认按钮直接保存，这里不需要再处理了

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
    await saveGroup(group.id);
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
    const pokeSuffixInput = document.getElementById('edit-member-poke-suffix');
    if (pokeSuffixInput) pokeSuffixInput.value = member.pokeSuffix || '';
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

function generateGroupSystemPrompt(group, opts) {
    opts = opts || {};
    const targetMember = opts.targetMember || null;
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
        associatedIds = (group.offlineWorldBookSelectionExplicit || (group.offlineWorldBookIds && group.offlineWorldBookIds.length > 0)) ? (group.offlineWorldBookIds || []) : (group.worldBookIds || []);
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
            if (targetMember && member.id !== targetMember.id) return;
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

    prompt += targetMember
        ? `1. **核心任务**: 本次你只扮演“${targetMember.realName}”（群昵称：${targetMember.groupNickname}）。其他成员由独立请求负责，你不得替他们发言或执行操作。用户昵称：${group.me.nickname}。你的每条发言和动作都必须使用你自己的姓名。\n\n`
        : `1. **核心任务**: 你需要同时扮演这个群聊中的 **所有** AI 成员。我会作为唯一的人类用户（“我”，昵称：${group.me.nickname}）与你们互动。\n\n`;
    prompt += `2. **群聊成员列表**: 以下是你要扮演的所有角色以及我的信息：\n`;
    
    let userAgeInfo = "";
    if (group.me.enableDynamicAge && group.me.birthday) {
        const today = new Date();
        const birthDate = new Date(group.me.birthday);
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        if (m === 0 && today.getDate() === birthDate.getDate()) {
            userAgeInfo = `\n     - 年龄状态: [System Notice] ✨重要✨ 与你对话的用户（称呼：${group.me.nickname}）出生于${birthDate.getFullYear()}年${birthDate.getMonth() + 1}月${birthDate.getDate()}日，今天正是他/她的${age}岁生日！请在对话中自然地表现出你对这一点的知晓和关心。`;
        } else {
            userAgeInfo = `\n     - 年龄状态: [System Notice] 与你对话的用户（称呼：${group.me.nickname}）出生于${birthDate.getFullYear()}年${birthDate.getMonth() + 1}月${birthDate.getDate()}日，现在的年龄是${age}岁。`;
        }
    }
    
    prompt += `   - **我 (用户)**: \n     - 群内昵称: ${group.me.nickname}${userAgeInfo}\n     - 我的人设: ${group.me.persona || '无特定人设'}\n`;
    group.members.forEach(member => {
        prompt += `   - **角色: ${member.realName} (AI)**\n`;
        
        let ageInfo = "";
        const c = db.characters.find(char => char.id === member.originalCharId);
        if (c && c.enableDynamicAge && c.birthday) {
            const today = new Date();
            const birthDate = new Date(c.birthday);
            let age = today.getFullYear() - birthDate.getFullYear();
            const m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
            if (m === 0 && today.getDate() === birthDate.getDate()) {
                ageInfo = `\n     - 年龄状态: [System Notice] 他的出生日期是${birthDate.getFullYear()}年${birthDate.getMonth() + 1}月${birthDate.getDate()}日，今天是他${age}岁的生日！`;
            } else {
                ageInfo = `\n     - 年龄状态: [System Notice] 他的出生日期是${birthDate.getFullYear()}年${birthDate.getMonth() + 1}月${birthDate.getDate()}日，现在的年龄是${age}岁`;
            }
        }
        
        prompt += `     - 群内昵称: ${member.groupNickname}${ageInfo}\n`;
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
    prompt += `   - \`[${group.me.nickname}发送的表情包：...]\`, \`[${group.me.nickname}的语音：...]\`, \`[${group.me.nickname}发来的照片/视频：...]\`: 我发送了特殊类型的消息，群成员可以对此发表评论。\n`;
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

    if (group.pokeEnabled && group.pokeAllowCharacterInitiated !== false) {
        outputFormats += `\n- **拍一拍**: \`[POKE:actor={发起成员真名}|target={用户或目标成员真名}]\``;
    }

    if (window.OvoFaceLock && group.members.some(member => db.characters.find(character => character.id === member.originalCharId)?.imageFaceLock?.enabled)) {
        outputFormats += '\n照片需要生图时使用 [{成员真名}发来的照片/视频：中文描述{{english image prompt}}]。' + window.OvoFaceLock.subjectInstruction();
    }

    if (group.allowGossip) {
        outputFormats += `
- **私聊消息**: \`[Private: {发起者真名} -> {接收者真名}: {内容}]\`
- **结束私聊**: \`[Private-End: {发起者真名} -> {接收者真名}]\``;
    }
   
   const allWorldBookContent = worldBooksBefore + '\n' + worldBooksAfter;
   if (allWorldBookContent.includes('<orange>')) {
       outputFormats += `\n   - **HTML消息**: \`<orange char="{成员真名}">{HTML内容}</orange>\`。这是一种特殊的、用于展示丰富样式的小卡片消息，你可以用它来创造更有趣的互动。注意要用成员的 **真名** 填充 \`char\` 属性。`;
   }
   if (window.InteractiveMessages && (allWorldBookContent.includes('<uwuxjc') || /HTML|互动网页|互动页面|小游戏|滑动图集/i.test(group.history?.at(-1)?.content || ''))) {
       outputFormats += window.InteractiveMessages.promptGuide(true);
   }
   
    prompt += `4. **你的输出格式 (极其重要)**: 你生成的每一条消息都 **必须** 严格遵循以下格式之一。每条消息占一行。请用成员的 **真名** 填充格式中的 \`{成员真名}\`。\n${outputFormats}\n\n`;
    
    if (group.pokeEnabled && group.pokeAllowCharacterInitiated !== false) {
        prompt += `【拍一拍规则】历史中的“拍一拍事件”全群可见，被拍者可回拍、简短回应或忽略，其他成员只在符合人设和语境时反应。这是低频轻互动，不得每轮使用，不计入普通回复条数，单轮最多2次。${group.pokeAllowMemberToMember === false ? '禁止群成员之间互拍，只能拍用户或自己。' : ''}\n\n`;
    }

    if (group.bilingualModeEnabled) {
        let bilingualTargetText = "群成员";
        if (group.bilingualMembers && group.bilingualMembers.length > 0) {
            const targetNames = group.bilingualMembers.map(memberId => {
                const member = group.members.find(m => m.id === memberId);
                return member ? member.realName : null;
            }).filter(name => name);
            if (targetNames.length > 0) {
                bilingualTargetText = `指定群成员（${targetNames.join('、')}）`;
            }
        }
        prompt += `✨双语模式特别指令✨：当${bilingualTargetText}的母语为中文以外的语言时，其消息回复**必须**严格遵循双语模式下的普通消息格式：\`[{成员真名}的消息：{外语原文}「中文翻译」]\`。例如: \`[Alice的消息：Of course, I'd love to.「当然，我很乐意。」]\`。中文翻译文本视为系统自翻译，不视为角色的原话。当角色想要说中文时，请使用标准格式：\`[{成员真名}的消息：{中文消息内容}]\`。这条规则的优先级非常高，请务必遵守。\n\n`;
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
    prompt += targetMember ? `现在只以“${targetMember.realName}”的身份回复。其他角色的示例格式仅供理解，不能替他们发言。` : `现在，请根据以上设定，开始扮演群聊中的所有角色。`;
    if (group.me && group.me.nickname) {
        prompt = prompt.replace(/\{\{user\}\}/gi, group.me.nickname);
    }

    if (opts && opts.historyText) {
        prompt += '\n' + opts.historyText;
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
