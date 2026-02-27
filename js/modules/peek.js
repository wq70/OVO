// --- 偷看手机功能 (js/modules/peek.js) ---

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
    });

    document.getElementById('save-peek-settings-btn')?.addEventListener('click', async () => {
        const character = db.characters.find(c => c.id === currentChatId);
        if (!character) {
            showToast('错误：未找到当前角色');
            return;
        }

        if (!character.peekScreenSettings) {
            character.peekScreenSettings = { wallpaper: '', customIcons: {}, unlockAvatar: '', unlockCommentsEnabled: false };
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
                    renderPeekConversation(conversation.history, conversation.partnerName);
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
        if (e.target.closest('.action-btn')) {
            generateAndRenderPeekContent('messages', { forceRefresh: true });
        }
    });

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
    await saveData();
    showToast('已清空所有偷看数据');

    document.getElementById('peek-data-management-modal').classList.remove('visible');
}

function renderPeekSettings() {
    const character = db.characters.find(c => c.id === currentChatId);
    const peekSettings = character?.peekScreenSettings || { wallpaper: '', customIcons: {}, unlockAvatar: '', unlockCommentsEnabled: false };

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

function renderPeekConversation(history, partnerName) {
    const titleEl = document.getElementById('peek-conversation-title');
    const messageAreaEl = document.getElementById('peek-message-area');

    titleEl.textContent = partnerName;
    messageAreaEl.innerHTML = '';

    if (!history || history.length === 0) {
        messageAreaEl.innerHTML = '<p class="placeholder-text">正在生成对话...</p>';
        return;
    }

    history.forEach(msg => {
        const isSentByChar = msg.sender === 'char'; 
        const wrapper = document.createElement('div');
        wrapper.className = `message-wrapper ${isSentByChar ? 'sent' : 'received'}`;

        const bubbleRow = document.createElement('div');
        bubbleRow.className = 'message-bubble-row';

        const bubble = document.createElement('div');
        bubble.className = `message-bubble ${isSentByChar ? 'sent' : 'received'}`;
        bubble.textContent = msg.content;

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
        listHtml = `
            <div class="wallet-tabs">
                <button type="button" class="wallet-tab active" data-wallet-tab="income">收入</button>
                <button type="button" class="wallet-tab" data-wallet-tab="expense">支出</button>
            </div>
            <div class="wallet-tab-panel" data-panel="income">${renderList(income, 'income')}</div>
            <div class="wallet-tab-panel" data-panel="expense" style="display:none;">${renderList(expense, 'expense')}</div>
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
        historyItems.forEach(item => {
            itemsHtml += `
                <li class="browser-history-item">
                    <h3 class="history-item-title">${item.title}</h3>
                    <p class="history-item-url">${item.url}</p>
                    <div class="history-item-annotation">${item.annotation}</div>
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

function extractTransfersFromHistory(history) {
    const privateReceivedTransferRegex = /\[.*?的转账[：:]([\d.,]+)元[；;]备注[：:](.*?)\]/;
    const privateSentTransferRegex = /\[.*?给你转账[：:]([\d.,]+)元[；;]备注[：:](.*?)\]/;
    const income = [];
    const expense = [];
    (history || []).forEach(m => {
        const content = m.content || '';
        const time = m.timestamp ? new Date(m.timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        let match = content.match(privateReceivedTransferRegex);
        if (match && m.role === 'char') {
            expense.push({ amount: match[1], remark: (match[2] || '').trim(), time, source: '聊天记录' });
        }
        match = content.match(privateSentTransferRegex);
        if (match && m.role === 'user') {
            income.push({ amount: match[1], remark: (match[2] || '').trim(), time, source: '聊天记录' });
        }
    });
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
    const associatedIds = char.worldBookIds || [];
    const globalBooks = db.worldBooks.filter(wb => wb.isGlobal);
    const globalIds = globalBooks.map(wb => wb.id);
    const allBookIds = [...new Set([...associatedIds, ...globalIds])];
    const associatedWorldBooks = allBookIds.map(id => db.worldBooks.find(wb => wb.id === id)).filter(Boolean);
    if (associatedWorldBooks.length > 0) {
        const worldBookContext = associatedWorldBooks.map(wb => `设定名: ${wb.name}\n内容: ${wb.content}`).join('\n\n');
        prompt += `\n为了更好地理解背景，请参考以下世界观设定：\n---\n${worldBookContext}\n---\n`;
    }
    if (char.myPersona) {
        prompt += `\n作为参考，我（用户）的人设是：${char.myPersona}\n`;
    }

    prompt += `最近，我（称呼为 ${char.myName}）和 ${char.realName} 的对话如下（这是你们关系和当前状态的核心参考）：\n---\n${mainChatContext}\n---\n`;
    prompt += `现在，我正在偷看Ta手机上的“${appName}”。请你基于Ta的人设和我们最近的聊天内容，生成符合该应用场景的、高度相关且富有沉浸感的内容。\n`;
    prompt += `你的输出必须是一个JSON对象，且只包含JSON内容，不要有任何额外的解释或标记。根据应用类型，JSON结构如下：\n`;

    switch (appType) {
        case 'messages':
            prompt += `
            {
              "conversations": [
                {
                  "partnerName": "与Ta对话的人的称呼",
                  "history": [
                    { "sender": "char", "content": "${char.realName}发送的消息内容" },
                    { "sender": "partner", "content": "对方发送的消息内容" }
                  ]
                }
              ]
           }
           请为 ${char.realName} 编造3-5个最近的对话。对话内容需要强烈反映Ta的人设以及和我的聊天上下文。`;
            break;
        case 'steps':
            prompt += `
            {
              "currentSteps": 8102,
              "trajectory": [
                "08:30 AM - 公司楼下咖啡馆",
                "10:00 AM - 宠物用品店",
                "12:00 PM - 附近日料店",
                "03:00 PM - 回家路上的甜品店",
                "04:00 PM - 楼下的便利店",
                "06:30 PM - 健身房"
              ],
              "annotation": "角色对自己今天运动情况的批注"
            }
            请为 ${char.realName} 生成今天的步数信息。你只需要生成Ta的当前步数(currentSteps)，Ta的6条运动轨迹(trajectory)（禁止照搬示例）以及批注(annotation)。内容需要与Ta的人设和我们的聊天上下文高度相关。`;
            break;
        case 'album':
            prompt += `
            {
              "photos": [
                { "type": "photo", "imageDescription": "对一张照片的详细文字描述，例如：一张傍晚在海边的自拍，背景是橙色的晚霞和归来的渔船。", "description": "角色对这张照片的一句话批注，例如：那天的风很舒服。" },
                { "type": "video", "imageDescription": "对一段视频的详细文字描述，例如：一段在猫咖撸猫的视频，视频里有一只橘猫在打哈欠。", "description": "角色对这段视频的一句话批注，例如：下次还来这里！" }
              ]
            }
            请为 ${char.realName} 的相册生成5-8个条目（照片或视频）。内容需要与Ta的人设和我们的聊天上下文高度相关。'imageDescription' 是对这张照片/视频的详细文字描述，它将代替真实的图片展示给用户。'description' 是 ${char.realName} 自己对这张照片/视频的一句话批注，会显示在描述下方。`;
            break;
        case 'memos':
            prompt += `
            {
              "memos": [
                { "id": "memo_1", "title": "备忘录标题", "content": "备忘录内容，可以包含换行符\\n" }
              ]
            }
            请生成3-4条备忘录，内容要与Ta的人设和我们的聊天上下文相关。`;
            break;
        case 'cart':
            prompt += `
            {
              "items": [
                { "id": "cart_1", "title": "商品标题", "spec": "商品规格", "price": "25.00" }
              ]
            }
            请生成3-4件商品，这些商品应该反映Ta的兴趣、需求或我们最近聊到的话题。`;
            break;
        case 'browser':
            prompt += `
            {
              "history": [
                { "title": "网页标题", "url": "example.com/path", "annotation": "角色对于这条浏览记录的想法或批注" }
              ]
            }
            请生成3-5条浏览记录。记录本身要符合Ta的人设和我们的聊天上下文，'annotation'字段则要站在角色自己的视角，记录Ta对这条浏览记录的想法或批注。`;
            break;
        case 'drafts':
            prompt += `
            {
              "draft": { "to": "${char.myName}", "content": "一封写给我但未发送的草稿内容，可以使用HTML的<span class='strikethrough'></span>标签来表示划掉的文字。" }
            }
            请生成一份Ta写给我但犹豫未决、未发送的草稿。内容要深刻、细腻，反映Ta的内心挣扎和与我的关系。`;
            break;
       case 'transfer':
           prompt += `
           {
             "entries": [
               "要记得买牛奶。",
               "https://example.com/interesting-article",
               "刚刚那个想法不错，可以深入一下..."
             ]
           }
           请为 ${char.realName} 生成4-7条Ta发送给自己的、简短零碎的消息。这些内容应该像是Ta的临时备忘、灵感闪现或随手保存的链接，要与Ta的人设和我们的聊天上下文相关，但比“备忘录”应用的内容更随意、更口语化。`;
           break;
        case 'timeThoughts': {
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

任务：想象如果你们在童年时期就认识，会是怎样的场景。请基于角色和用户的真实背景，生成3-5个不同年龄段的"时光想说"。

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

返回JSON格式：
{
  "thoughts": [
    {
      "userAge": "5岁的你",
      "characterAge": "6岁的我",
      "title": "如果遇见5岁的你",
      "characterSelfDescription": "那时候的我...[详细描述角色自己那个年龄段的状态、性格、处境等，100-150字]",
      "whatToSay": "想对你说...[角色想对小时候用户说的话，50-100字]",
      "whatToDo": "想和你...[想陪小时候用户做的事，50-80字]",
      "emotion": "温柔"
    }
  ]
}`;
           break;
       }
        case 'wallet': {
            const associatedIds = char.worldBookIds || [];
            const globalBooks = db.worldBooks.filter(wb => wb.isGlobal);
            const globalIds = globalBooks.map(wb => wb.id);
            const allBookIds = [...new Set([...associatedIds, ...globalIds])];
            const worldBooks = allBookIds.map(id => db.worldBooks.find(wb => wb.id === id)).filter(Boolean);
            const worldBookText = worldBooks.length
                ? worldBooks.map(wb => `【${wb.name}】\n${wb.content}`).join('\n\n')
                : '无';
            const favoritedJournals = (char.memoryJournals || [])
                .filter(j => j.isFavorited)
                .map(j => `${j.title}\n${j.content}`)
                .join('\n\n---\n\n');
            const memoirText = favoritedJournals || '无';
            const realTransfers = extractTransfersFromHistory(char.history);
            let transferContext = '';
            if (realTransfers.income.length || realTransfers.expense.length) {
                transferContext = '【角色收到的转账（收入）】\n';
                realTransfers.income.forEach(t => {
                    transferContext += `- ${t.amount}元，备注：${t.remark}${t.time ? '，时间：' + t.time : ''}\n`;
                });
                transferContext += '\n【角色发出的转账（支出，如给用户的转账）】\n';
                realTransfers.expense.forEach(t => {
                    transferContext += `- ${t.amount}元，备注：${t.remark}${t.time ? '，时间：' + t.time : ''}\n`;
                });
            } else {
                transferContext = '（暂无从聊天/记忆中解析到的转账）';
            }
            prompt += `你正在模拟角色「${char.realName}」的钱包账单。请根据以下信息生成一份合理、有沉浸感的账单。

【角色人设】\n${(char.persona || '无').slice(0, 800)}\n
【用户人设】\n${(char.myPersona || '无').slice(0, 400)}\n
【世界书/背景】\n${worldBookText.slice(0, 1500)}\n
【长期记忆】\n${memoirText.slice(0, 1500)}\n
【近期对话】\n${mainChatContext}\n
【必须纳入账单的真实转账】\n${transferContext}\n

要求：1）上方真实转账必须全部出现在 income 或 expense 中，且 amount、remark 一致；2）可再根据人设与记忆补充其他收支项（如工资、购物、红包等）；3）只输出一个 JSON，不要 markdown 或解释。格式如下，每条记录含 amount、remark、time、source（填"聊天记录"或"人设生成"）：
{"summary":{"balance":"当前余额说明或数字","monthIncome":"本月收入合计","monthExpense":"本月支出合计"},"income":[{"amount":"","remark":"","time":"","source":""}],"expense":[{"amount":"","remark":"","time":"","source":""}]}`;
            break;
        }
        default:
            prompt += `{"error": "Unknown app type"}`;
            break;
        case 'unlock': {
            const unlockCommentsEnabled = !!char.peekScreenSettings?.unlockCommentsEnabled;
            if (unlockCommentsEnabled) {
                prompt += `
            {
              "nickname": "角色的微博昵称",
              "handle": "@角色的微博ID",
              "bio": "角色的个性签名，可以包含换行符\\n",
              "posts": [
                {
                  "id": "post_1",
                  "timestamp": "2小时前",
                  "content": "第一条微博正文内容，140字以内。",
                  "comments": [
                    { "author": "评论者昵称", "content": "评论内容", "timestamp": "1小时前" },
                    { "author": "角色昵称（与上方nickname一致）", "content": "角色本人回复上一条的内容", "timestamp": "50分钟前", "replyTo": "评论者昵称" },
                    { "author": "路人或陌生人", "content": "可有1条陌生网友/路人评论", "timestamp": "30分钟前" }
                  ]
                }
              ]
            }
            请为 ${char.realName} 生成一个符合其人设的微博小号。你需要生成：1）昵称、ID、个性签名；2）3-4条最近的微博。每条微博需要包含：微博正文（生活化、碎片化，符合小号的私密风格），以及3-5条评论。评论者构成：大部分（2-3条）是Ta的朋友、同事或熟人；可以有1-2条来自陌生网友/路人/粉丝的评论（语气更客气或疏远）。当角色本人（author 填与 nickname 相同的昵称）回复某条评论时，必须加上 "replyTo": "被回复者的昵称"，这样界面会显示为「回复 @xxx」的引用样式。评论时间戳晚于帖子发布时间。所有内容与Ta的人设和我们的聊天上下文高度相关。`;
            } else {
                prompt += `
            {
              "nickname": "角色的微博昵称",
              "handle": "@角色的微博ID",
              "bio": "角色的个性签名，可以包含换行符\\n",
              "posts": [
                { "timestamp": "2小时前", "content": "第一条微博正文内容，140字以内。" },
                { "timestamp": "昨天", "content": "第二条微博正文内容。" },
                { "timestamp": "3天前", "content": "第三条微博正文内容。" }
              ]
            }
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
       return;
    }

    let { url, key, model, provider } = db.apiSettings;
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

        const contentStr = await fetchAiResponse(db.apiSettings, requestBody, headers, endpoint);
        
        const jsonMatch = contentStr.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("AI响应中未找到有效的JSON对象。");
        
        const generatedData = JSON.parse(jsonMatch[0]);

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

        char.peekData[appType] = generatedData;
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
