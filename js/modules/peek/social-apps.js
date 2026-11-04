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
            
            imgContainer.innerHTML = `<div style="padding: 20px; text-align: left; color: #555; font-size: 16px; line-height: 1.6; height: 100%; overflow-y: auto;">${peekBilingualText(photo.imageDescription, photo.imageDescription)}</div>`;
            descriptionEl.innerHTML = `批注：${peekBilingualText(photo.description)}`;
            
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
                        ${peekBilingualText(post.content || '', (post.content || '').replace(/\n/g, '<br>'))}
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
                <p>${peekBilingualText(bio, bio.replace(/\n/g, '<br>'))}</p>
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
                <div class="unlock-comment-content">${c.author === nickname ? peekBilingualText(c.content || '', (c.content || '').replace(/\n/g, '<br>')) : peekEscapeHtml(c.content || '').replace(/\n/g, '<br>')}</div>
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
                <div class="unlock-post-card-content">${peekBilingualText(post.content || '', (post.content || '').replace(/\n/g, '<br>'))}</div>
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
                    <div class="detail-section-content">${peekBilingualText(thought.characterSelfDescription || '')}</div>
                </div>
                
                <div class="detail-section">
                    <div class="detail-section-title">想对你说</div>
                    <div class="detail-section-content">${peekBilingualText(thought.whatToSay || '')}</div>
                </div>
                
                ${thought.whatToDo ? `
                <div class="detail-section">
                    <div class="detail-section-title">想和你做</div>
                    <div class="detail-section-content">${peekBilingualText(thought.whatToDo)}</div>
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
    window.PeekHistoryUI?.mountContact(conversation);
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
            const wrapper = document.createElement('div');
            wrapper.className = `message-wrapper ${isSentByChar ? 'sent' : 'received'}`;

            const bubbleRow = document.createElement('div');
            bubbleRow.className = 'message-bubble-row';

            const bubble = document.createElement('div');
            bubble.className = `message-bubble ${isSentByChar ? 'sent' : 'received'}`;
            bubble.innerHTML = peekConversationMessageHtml(msg, char);
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
    const target = currentPeekConversation;
    const messages = [{ sender: 'char', content: text, isImpersonated: true }];
    try {
        if (window.PeekMemory) {
            if (!await window.PeekMemory.editConversation(char, target, messages)) return;
        } else {
            target.history = [...(target.history || []), ...messages];
            await saveData();
        }
        if (currentChatId === char.id && currentPeekConversation === target) {
            if (input && input.value === text) input.value = '';
            renderPeekConversation(target);
        }
        showToast('已发送');
    } catch (error) { showApiError(error); }
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
    apiConfig = typeof getApiConfigForFeature === 'function' ? getApiConfigForFeature('peek', apiConfig, char) : apiConfig;
    const { url, key, model } = apiConfig;
    if (typeof isApiConfigReady === 'function' ? !isApiConfigReady(apiConfig) : (!url || !key || !model)) {
        showToast('请先在设置中配置 API');
        return;
    }
    const targetConversation = currentPeekConversation;
    const clearRevision = getPeekClearRevision(char.id, 'messages');
    const npcName = targetConversation.partnerName;
    const npcPersona = (targetConversation.partnerPersona || '') + (targetConversation.supplementPersona ? '\n补充：' + targetConversation.supplementPersona : '') || '与角色认识的普通人';
    const charName = char.realName;
    const relation = targetConversation.partnerRelation || '熟人';
    const suspicion = targetConversation.suspicionLevel != null ? targetConversation.suspicionLevel : 0;
    const history = targetConversation.history || [];
    const recentLines = history.slice(-16).map(m => {
        const who = m.sender === 'char' ? charName : npcName;
        const tag = m.isImpersonated ? ' [实际是别人冒充' + charName + '发的]' : '';
        return who + '：' + (m.content || '') + tag;
    }).join('\n');
    const format = getPeekResponseFormat(char);
    const responseGuide = format === 'json'
        ? '只输出一个 JSON 对象，不要其他文字。newSuspicion 使用 0 到 100 的数字，suggestFriend 使用布尔值。\n{"replies":["回复1","回复2"],"newSuspicion":25,"suspicionReason":"可选","suggestFriend":false}'
        : `只输出XML标签格式，不要其他文字：
<result>
  <replies>
    <reply>回复1</reply>
    <reply>回复2</reply>
  </replies>
  <newSuspicion>数字0-100</newSuspicion>
  <suspicionReason>可选</suspicionReason>
  <suggestFriend>false或true</suggestFriend>
</result>`;

    const systemPrompt = `你是「${npcName}」，正在和「${charName}」聊天。你的人设：${npcPersona}。你和${charName}是${relation}关系。

以下近期对话中，有些消息可能不是${charName}本人发的，而是TA的恋人在偷偷用TA手机和你聊。当前你对「对方是不是本人」的怀疑度：${suspicion}/100（0=完全没察觉，100=基本确定不是本人）。

近期对话：
---
${recentLines}
---

请根据人设和怀疑度，生成你的回复。可以自然聊天，也可以若有所察地试探。若对话氛围合适且尚未是好友，可表达想加对方为好友的意愿，并设置 "suggestFriend": true。
${responseGuide}`;

    showToast('正在生成回复…');
    try {
        const endpoint = (url.endsWith('/') ? url.slice(0, -1) : url) + '/v1/chat/completions';
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
        const requestBody = { model: model, messages: [{ role: 'user', content: systemPrompt }], temperature: 0.8 };
        const contentStr = await fetchAiResponse(apiConfig, requestBody, headers, endpoint, false, { allowRoleFallback: false });
        if (getPeekClearRevision(char.id, 'messages') !== clearRevision || !char.peekData?.messages?.conversations?.includes(targetConversation)) return;
        const data = parsePeekResponse(contentStr, format);
        const replies = Array.isArray(data.replies) ? data.replies : (data.reply ? [data.reply] : []);
        if (replies.some(reply => typeof reply === 'object')) {
            throw new Error('AI 返回的回复格式不正确，请手动重新生成。');
        }
        const newSuspicion = typeof data.newSuspicion === 'number' ? Math.max(0, Math.min(100, data.newSuspicion)) : suspicion;
        if (replies.length > 0) {
            const messages = replies.map(t => ({ sender: 'partner', content: String(t).trim() }));
            if (window.PeekMemory) {
                if (!await window.PeekMemory.editConversation(char, targetConversation, messages, newSuspicion)) return;
            } else {
                targetConversation.history = [...(targetConversation.history || []), ...messages];
                targetConversation.suspicionLevel = newSuspicion;
                await saveData();
            }
            if (currentChatId === char.id && currentPeekConversation === targetConversation) renderPeekConversation(targetConversation);
            showToast('对方已回复');
        } else {
            showToast('未生成到回复，请重试');
        }
        if (data.suggestFriend === true && !targetConversation.isFriend) {
            if (currentChatId === char.id && currentPeekConversation === targetConversation) peekShowFriendRequestModal(targetConversation);
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
    apiConfig = typeof getApiConfigForFeature === 'function' ? getApiConfigForFeature('peek', apiConfig, char) : apiConfig;
    if (typeof isApiConfigReady === 'function' ? !isApiConfigReady(apiConfig) : (!apiConfig || !apiConfig.url || !apiConfig.key || !apiConfig.model)) {
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
    const format = getPeekResponseFormat(char);
    const responseGuide = format === 'json'
        ? '只返回一个 JSON 对象：{"supplement":"条目1：xxx\\n条目2：xxx"}。没有新信息时返回 {"supplement":""}。'
        : '只返回 XML 标签格式：\n<result>\n  <supplement>条目1：xxx\n条目2：xxx</supplement>\n</result>\n或 <result><supplement></supplement></result>。';
    const systemPrompt = '你是一个人设补充助手。请根据「最近对话」**只提取【该 NPC 在对话中透露的、关于自己的信息】**，整理成简短的人设条目。\n\n要求：只输出「关于这个 NPC 我们新知道了什么」，例如：提到喜好、经历、习惯、身份等，按「条目：内容」格式补充。不要总结对话过程。若没有新信息则返回空。\n\n' + responseGuide + '\n\n已有基础人设（节选）:\n' + basePersona + '\n\n已补充人设（节选）:\n' + existingSupplement + '\n\n最近对话:\n' + convText;
    showToast('正在提取人设…');
    try {
        const url = apiConfig.url.endsWith('/') ? apiConfig.url.slice(0, -1) : apiConfig.url;
        const endpoint = url + '/v1/chat/completions';
        const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiConfig.key };
        const requestBody = { model: apiConfig.model, messages: [{ role: 'user', content: systemPrompt }], temperature: 0.3 };
        const contentStr = await fetchAiResponse(apiConfig, requestBody, headers, endpoint, false, { allowRoleFallback: false });
        const json = parsePeekResponse(contentStr, format);
        if (json.supplement && typeof json.supplement === 'object') {
            throw new Error('AI 返回的人设格式不正确，请手动重新生成。');
        }
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
