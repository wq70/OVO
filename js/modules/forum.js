// --- 论坛功能 (js/modules/forum.js) ---

// ===== 小号管理系统 =====
var forumEditingAltId = null; // 当前正在编辑的小号ID，null表示新建

function forumGetActiveAccount() {
    var activeId = db.forumActiveAccountId || 'main';
    if (activeId === 'main') {
        forumInitUserProfile();
        return { id: 'main', username: db.forumUserProfile.username, avatar: db.forumUserProfile.avatar, bio: db.forumUserProfile.bio, isAlt: false };
    }
    var alts = db.forumAltAccounts || [];
    var alt = alts.find(function(a) { return a.id === activeId; });
    if (!alt) {
        db.forumActiveAccountId = 'main';
        saveData();
        forumInitUserProfile();
        return { id: 'main', username: db.forumUserProfile.username, avatar: db.forumUserProfile.avatar, bio: db.forumUserProfile.bio, isAlt: false };
    }
    return { id: alt.id, username: alt.username, avatar: alt.avatar, bio: alt.bio, isAlt: true };
}

function forumSwitchAccount(accountId) {
    db.forumActiveAccountId = accountId;
    saveData();
    forumRenderAltAccountsList();
    var acc = forumGetActiveAccount();
    showToast('已切换为: ' + acc.username);
}

function forumCreateAltAccount(data) {
    if (!db.forumAltAccounts) db.forumAltAccounts = [];
    var newAlt = {
        id: 'alt_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
        username: data.username || '小号' + Math.floor(1000 + Math.random() * 9000),
        avatar: data.avatar || 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg',
        bio: data.bio || '',
        createdAt: Date.now()
    };
    db.forumAltAccounts.push(newAlt);
    saveData();
    return newAlt;
}

function forumUpdateAltAccount(altId, data) {
    var alts = db.forumAltAccounts || [];
    var alt = alts.find(function(a) { return a.id === altId; });
    if (!alt) return;
    if (data.username) alt.username = data.username;
    if (data.avatar) alt.avatar = data.avatar;
    if (data.bio !== undefined) alt.bio = data.bio;
    saveData();
}

function forumDeleteAltAccount(altId) {
    if (!db.forumAltAccounts) return;
    db.forumAltAccounts = db.forumAltAccounts.filter(function(a) { return a.id !== altId; });
    if (db.forumActiveAccountId === altId) {
        db.forumActiveAccountId = 'main';
    }
    saveData();
}

function forumRenderAltAccountsList() {
    var listEl = document.getElementById('forum-alt-accounts-list');
    var displayEl = document.getElementById('forum-active-identity-display');
    if (!listEl) return;

    // 渲染当前身份
    var active = forumGetActiveAccount();
    if (displayEl) {
        displayEl.innerHTML = '<img class="forum-alt-identity-avatar" src="' + (active.avatar || 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg') + '">'
            + '<div class="forum-alt-identity-info"><div class="forum-alt-identity-name">' + (active.username || '未设置') + (active.isAlt ? ' <span style="font-size:11px;color:#999;">(小号)</span>' : ' <span style="font-size:11px;color:#999;">(大号)</span>') + '</div>'
            + '<div class="forum-alt-identity-bio">' + (active.bio || '暂无简介') + '</div></div>'
            + '<span class="forum-alt-identity-badge">使用中</span>';
    }

    // 渲染小号列表
    var alts = db.forumAltAccounts || [];
    if (alts.length === 0) {
        listEl.innerHTML = '<div class="forum-alt-empty-hint">还没有小号，点击右上角「新建小号」创建一个吧</div>';
        // 渲染大号切换卡片（如果当前不是大号）
        if (active.isAlt) {
            forumInitUserProfile();
            var mainP = db.forumUserProfile;
            listEl.innerHTML = '<div class="forum-alt-identity-card" data-alt-id="main">'
                + '<img class="forum-alt-identity-avatar" src="' + (mainP.avatar || 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg') + '">'
                + '<div class="forum-alt-identity-info"><div class="forum-alt-identity-name">' + (mainP.username || '大号') + ' <span style="font-size:11px;color:#999;">(大号)</span></div>'
                + '<div class="forum-alt-identity-bio">' + (mainP.bio || '暂无简介') + '</div></div>'
                + '<button class="btn btn-small btn-primary" style="padding:4px 12px;font-size:12px;" onclick="forumSwitchAccount(\'main\')">切换</button></div>'
                + '<div class="forum-alt-empty-hint">还没有小号，点击右上角「新建小号」创建一个吧</div>';
        }
        return;
    }

    var html = '';
    // 如果当前是小号，显示大号切换入口
    if (active.isAlt) {
        forumInitUserProfile();
        var mainProfile = db.forumUserProfile;
        html += '<div class="forum-alt-identity-card" data-alt-id="main">'
            + '<img class="forum-alt-identity-avatar" src="' + (mainProfile.avatar || 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg') + '">'
            + '<div class="forum-alt-identity-info"><div class="forum-alt-identity-name">' + (mainProfile.username || '大号') + ' <span style="font-size:11px;color:#999;">(大号)</span></div>'
            + '<div class="forum-alt-identity-bio">' + (mainProfile.bio || '暂无简介') + '</div></div>'
            + '<button class="btn btn-small btn-primary" style="padding:4px 12px;font-size:12px;" onclick="forumSwitchAccount(\'main\')">切换</button></div>';
    }

    alts.forEach(function(alt) {
        var isActive = (db.forumActiveAccountId === alt.id);
        html += '<div class="forum-alt-identity-card' + (isActive ? ' forum-alt-identity-active' : '') + '" data-alt-id="' + alt.id + '">'
            + '<img class="forum-alt-identity-avatar" src="' + (alt.avatar || 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg') + '">'
            + '<div class="forum-alt-identity-info"><div class="forum-alt-identity-name">' + (alt.username || '小号') + '</div>'
            + '<div class="forum-alt-identity-bio">' + (alt.bio || '暂无简介') + '</div></div>'
            + '<div class="forum-alt-identity-actions">'
            + (isActive ? '<span class="forum-alt-identity-badge">使用中</span>' : '<button onclick="forumSwitchAccount(\'' + alt.id + '\')">切换</button>')
            + '<button onclick="forumOpenAltEditModal(\'' + alt.id + '\')">编辑</button>'
            + '<button class="alt-delete-btn" onclick="event.stopPropagation();forumConfirmDeleteAlt(\'' + alt.id + '\')">删除</button>'
            + '</div></div>';
    });
    listEl.innerHTML = html;
}

function forumOpenAltEditModal(altId) {
    var modal = document.getElementById('forum-alt-edit-modal');
    var titleEl = document.getElementById('forum-alt-edit-modal-title');
    var avatarEl = document.getElementById('forum-alt-edit-avatar');
    var usernameEl = document.getElementById('forum-alt-edit-username');
    var bioEl = document.getElementById('forum-alt-edit-bio');
    if (!modal) return;

    if (altId) {
        forumEditingAltId = altId;
        var alt = (db.forumAltAccounts || []).find(function(a) { return a.id === altId; });
        if (!alt) return;
        titleEl.textContent = '编辑小号';
        avatarEl.src = alt.avatar || 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg';
        usernameEl.value = alt.username || '';
        bioEl.value = alt.bio || '';
    } else {
        forumEditingAltId = null;
        titleEl.textContent = '新建小号';
        avatarEl.src = 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg';
        usernameEl.value = '';
        bioEl.value = '';
    }
    modal.classList.add('visible');
}

function forumCloseAltEditModal() {
    var modal = document.getElementById('forum-alt-edit-modal');
    if (modal) modal.classList.remove('visible');
    forumEditingAltId = null;
}

function forumSaveAltFromModal() {
    var usernameEl = document.getElementById('forum-alt-edit-username');
    var bioEl = document.getElementById('forum-alt-edit-bio');
    var avatarEl = document.getElementById('forum-alt-edit-avatar');
    var username = (usernameEl && usernameEl.value || '').trim();
    if (!username) { showToast('昵称不能为空'); return; }
    var avatar = avatarEl ? avatarEl.src : '';
    var bio = (bioEl && bioEl.value || '').trim();

    if (forumEditingAltId) {
        forumUpdateAltAccount(forumEditingAltId, { username: username, avatar: avatar, bio: bio });
        showToast('小号已更新');
    } else {
        forumCreateAltAccount({ username: username, avatar: avatar, bio: bio });
        showToast('小号创建成功');
    }
    forumCloseAltEditModal();
    forumRenderAltAccountsList();
}

function forumConfirmDeleteAlt(altId) {
    var alt = (db.forumAltAccounts || []).find(function(a) { return a.id === altId; });
    if (!alt) return;
    if (confirm('确定删除小号「' + alt.username + '」吗？')) {
        forumDeleteAltAccount(altId);
        forumRenderAltAccountsList();
        showToast('小号已删除');
    }
}

function forumSetupAltAccountEvents() {
    var createBtn = document.getElementById('forum-create-alt-btn');
    if (createBtn) createBtn.addEventListener('click', function() { forumOpenAltEditModal(null); });

    var saveBtn = document.getElementById('forum-alt-edit-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', forumSaveAltFromModal);

    var cancelBtn = document.getElementById('forum-alt-edit-cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', forumCloseAltEditModal);

    var modal = document.getElementById('forum-alt-edit-modal');
    if (modal) modal.addEventListener('click', function(e) { if (e.target === modal) forumCloseAltEditModal(); });

    var avatarImg = document.getElementById('forum-alt-edit-avatar');
    var avatarUpload = document.getElementById('forum-alt-avatar-upload');
    if (avatarImg) avatarImg.addEventListener('click', function() { if (avatarUpload) avatarUpload.click(); });
    if (avatarUpload) avatarUpload.addEventListener('change', function(e) {
        var f = e.target.files && e.target.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function() { if (avatarImg) avatarImg.src = reader.result; };
        reader.readAsDataURL(f);
        e.target.value = '';
    });

    var gotoBtn = document.getElementById('forum-goto-alt-accounts-btn');
    if (gotoBtn) gotoBtn.addEventListener('click', function() { switchScreen('forum-alt-accounts-screen'); forumRenderAltAccountsList(); });
}
// ===== 小号管理系统 END =====

function setupForumBindingFeature() {
    const forumLinkBtn = document.getElementById('forum-link-btn');
    const modal = document.getElementById('forum-binding-modal');
    const tabs = modal.querySelectorAll('.tab-btn');
    const contentPanes = modal.querySelectorAll('.forum-binding-content');
    const confirmBtn = document.getElementById('confirm-forum-binding-btn');

    forumLinkBtn.addEventListener('click', () => {
        openForumBindingModal();
    });

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contentPanes.forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            const targetId = tab.dataset.target;
            document.getElementById(targetId).classList.add('active');
        });
    });

    confirmBtn.addEventListener('click', async () => {
        const worldBookList = document.getElementById('forum-worldbook-list');
        const charList = document.getElementById('forum-char-list');
        const userList = document.getElementById('forum-user-list');

        const selectedWorldBookIds = Array.from(worldBookList.querySelectorAll('.item-checkbox:checked')).map(input => input.value);
        const selectedCharIds = Array.from(charList.querySelectorAll('input:checked')).map(input => input.value);
        const selectedUserPersonaIds = Array.from(userList.querySelectorAll('input:checked')).map(input => input.value);

        db.forumBindings = {
            worldBookIds: selectedWorldBookIds,
            charIds: selectedCharIds,
            userPersonaIds: selectedUserPersonaIds,
        };

        await saveData();
        showToast('论坛绑定已更新');
        modal.classList.remove('visible');
    });

    function openForumBindingModal() {
        const worldBookList = document.getElementById('forum-worldbook-list');
        const charList = document.getElementById('forum-char-list');
        const userList = document.getElementById('forum-user-list');

        worldBookList.innerHTML = '';
        charList.innerHTML = '';
        userList.innerHTML = '';

        const currentBindings = db.forumBindings || { worldBookIds: [], charIds: [], userPersonaIds: [] };

        renderCategorizedWorldBookList(worldBookList, db.worldBooks, currentBindings.worldBookIds, 'wb-bind');

        if (db.characters.length > 0) {
            db.characters.forEach(char => {
                const isChecked = currentBindings.charIds.includes(char.id);
                const li = document.createElement('li');
                li.className = 'binding-list-item';
                li.innerHTML = `
                    <input type="checkbox" id="char-bind-${char.id}" value="${char.id}" ${isChecked ? 'checked' : ''}>
                    <label for="char-bind-${char.id}">${char.remarkName}</label>
                `;
                charList.appendChild(li);
            });
        } else {
            charList.innerHTML = '<li>暂无Char设定</li>';
        }

        if (db.myPersonaPresets.length > 0) {
            db.myPersonaPresets.forEach(preset => {
                const isChecked = currentBindings.userPersonaIds.includes(preset.name);
                const li = document.createElement('li');
                li.className = 'binding-list-item';
                li.innerHTML = `
                    <input type="checkbox" id="user-bind-${preset.name.replace(/\s/g, '_')}" value="${preset.name}" ${isChecked ? 'checked' : ''}>
                    <label for="user-bind-${preset.name.replace(/\s/g, '_')}">${preset.name}</label>
                `;
                userList.appendChild(li);
            });
        } else {
            userList.innerHTML = '<li>暂无User人设</li>';
        }
        
        modal.classList.add('visible');
    }
}

function getPostDisplayTime(post) {
    if (post.timestamp) return new Date(post.timestamp).toLocaleString();
    const parts = post.id.split('_');
    if (parts[1]) return new Date(parts[1] * 1).toLocaleString();
    return '';
}

function renderPostDetail(post) {
    const detailScreen = document.getElementById('forum-post-detail-screen');
    if (!detailScreen || !post) return;

    const defaultAvatarUrl = 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg';
    const npcColors = ["#FFB6C1", "#87CEFA", "#98FB98", "#F0E68C", "#DDA0DD", "#FFDAB9", "#B0E0E6"];
    const getRandomColor = () => npcColors[Math.floor(Math.random() * npcColors.length)];

    let commentsHtml = '';
    if (post.comments && post.comments.length > 0) {
        post.comments.forEach((comment, index) => {
            const firstChar = (comment.username || '').charAt(0).toUpperCase() || '?';
            const isUserComment = comment.authorId === 'user' || (comment.authorId && comment.authorId.startsWith('alt_'));
            // 只有用户发的帖子里，用户在自己帖子下的回复才显示楼主
            const isAuthor = (post.authorId === 'user' || (post.authorId && post.authorId.startsWith('alt_'))) && (comment.authorId === post.authorId);
            const activeAcc = forumGetActiveAccount();
            const userAvatarUrl = comment.avatar || (activeAcc.avatar) || defaultAvatarUrl;
            const avatarHtml = isUserComment
                ? `<img src="${userAvatarUrl}" class="comment-author-avatar" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0;">`
                : `<div class="comment-author-avatar" style="background-color: ${getRandomColor()}">${firstChar}</div>`;
            
            const authorBadge = isAuthor ? '<span class="author-badge">楼主</span>' : '';
            const isNpcComment = comment.authorId === 'npc';
            const dmBtnHtml = isNpcComment ? `<button type="button" class="btn btn-primary btn-small comment-dm-btn" data-comment-index="${index}" style="padding:3px 10px;font-size:12px;border-radius:16px;flex-shrink:0;">发私信</button>` : '';
            
            const replyToHtml = comment.replyTo ? `<div class="comment-reply-ref">回复 <span class="comment-reply-ref-name">@${comment.replyTo.username || ''}</span></div>` : '';
            
            commentsHtml += `
            <li class="comment-item" data-comment-index="${index}">
                ${avatarHtml}
                <div class="comment-body">
                    <div class="comment-author-name">${comment.username || ''}${authorBadge}${dmBtnHtml}</div>
                    ${replyToHtml}
                    <div class="comment-content">${(comment.content || '').replace(/\n/g, '<br>')}</div>
                    <div class="comment-timestamp">${comment.timestamp || ''}</div>
                </div>
            </li>
            `;
        });
    }

    const likeCount = post.likeCount != null ? post.likeCount : 0;
    const isLiked = !!post.isLiked;
    const isFavorited = !!post.isFavorited;
    const commentCount = post.comments ? post.comments.length : 0;
    const isOwnPost = post.authorId === 'user' || (post.authorId && post.authorId.startsWith('alt_'));

    const authorAvatarHtml = isOwnPost
        ? `<img src="${forumGetActiveAccount().avatar || defaultAvatarUrl}" class="author-avatar author-avatar-img" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0;">`
        : (() => { const authorFirstChar = (post.username || '').charAt(0).toUpperCase() || '?'; return `<div class="author-avatar" style="background-color:${getRandomColor()};color:#fff;">${authorFirstChar}</div>`; })();

    detailScreen.innerHTML = `
    <header class="app-header">
        <button class="back-btn" data-target="forum-screen">&#8249;</button>
        <div class="title-container">
            <h1 class="title">帖子详情</h1>
        </div>
        <button class="action-btn" id="header-share-btn" title="分享">
            <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M18,16.08C17.24,16.08 16.56,16.38 16.04,16.85L8.91,12.7C8.96,12.47 9,12.24 9,12C9,11.76 8.96,11.53 8.91,11.3L16.04,7.15C16.56,7.62 17.24,7.92 18,7.92C19.66,7.92 21,6.58 21,5C21,3.42 19.66,2 18,2C16.34,2 15,3.42 15,5C15,5.24 15.04,5.47 15.09,5.7L7.96,9.85C7.44,9.38 6.76,9.08 6,9.08C4.34,9.08 3,10.42 3,12C3,13.58 4.34,14.92 6,14.92C6.76,14.92 7.44,14.62 7.96,14.15L15.09,18.3C15.04,18.53 15,18.76 15,19C15,20.58 16.34,22 18,22C19.66,22 21,20.58 21,19C21,17.42 19.66,16.08 18,16.08Z"></path></svg>
        </button>
    </header>
    <main class="content">
        <div class="post-detail-container">
            <div class="post-detail-main">
                <div class="post-author-info">
                    ${authorAvatarHtml}
                    <div class="author-details" style="display:flex;flex-direction:column;gap:2px;">
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                            <span class="author-name">${post.username || ''}</span>
                            ${!isOwnPost && post.username ? '<button type="button" class="btn btn-primary btn-small" id="forum-dm-author-btn" style="padding:4px 12px;font-size:13px;border-radius:16px;flex-shrink:0;">发私信</button>' : ''}
                        </div>
                        <span class="post-meta-data">${getPostDisplayTime(post)}</span>
                    </div>
                </div>
                <h2 class="post-detail-title">${post.title || ''}</h2>
                <div class="post-detail-content-body">${(post.content || '').replace(/\n/g, '<br>')}</div>
                <div class="post-detail-actions">
                    <div class="action-item" id="like-post-btn" data-post-id="${post.id}" data-liked="${isLiked}" role="button" tabindex="0" style="cursor:pointer;border:none;background:none;padding:0;display:inline-flex;align-items:center;gap:4px;">
                        <svg viewBox="0 0 24 24" fill="${isLiked ? '#ff4757' : 'none'}" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                        <span id="like-count">${likeCount}</span>
                    </div>
                    <div class="action-item">
                        <svg viewBox="0 0 24 24"><path d="M20,8H4V6H20V8M18,10H6V12H18V10M16,14H8V16H16V14M22,4V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V4A2,2 0 0,1 4,2H20A2,2 0 0,1 22,4Z" /></svg>
                        <span id="comment-count">${commentCount}</span>
                    </div>
                    <div class="action-item" id="favorite-post-btn" data-post-id="${post.id}" data-favorited="${isFavorited}" role="button" tabindex="0" style="cursor:pointer;">
                        <svg viewBox="0 0 24 24" fill="${isFavorited ? '#ffd700' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                        <span>收藏</span>
                    </div>
                    ${isOwnPost ? `<button type="button" class="action-item" id="delete-post-btn" data-post-id="${post.id}" style="color:#ff4757;border:none;background:none;"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg><span>删除</span></button>` : ''}
                </div>
            </div>
        </div>

        <div class="comments-section">
            <div class="comments-header">全部评论 (${commentCount})</div>
            <ul class="comment-list">
                ${commentsHtml}
            </ul>
        </div>

        <div class="comment-input-wrapper" style="position:sticky;bottom:0;background:var(--panel-bg,#fff);border-top:1px solid #e0e0e0;padding:0;display:flex;flex-direction:column;">
            <div id="forum-reply-bar" class="forum-reply-bar" style="display:none;">
                <span class="forum-reply-bar-text">回复 <span id="forum-reply-bar-name"></span></span>
                <button type="button" id="forum-reply-bar-close" class="forum-reply-bar-close">&times;</button>
            </div>
            <div style="display:flex;gap:10px;align-items:center;padding:10px 15px;">
            <input type="text" id="forum-comment-input" placeholder="写下你的评论..." autocomplete="off" style="flex:1;padding:10px 15px;border:1px solid #e0e0e0;border-radius:20px;outline:none;">
            <button type="button" id="ai-reply-comment-btn" class="icon-btn ai-reply-btn" title="AI回复" style="width:40px;height:40px;">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    <path d="M8 10h.01M12 10h.01M16 10h.01"></path>
                </svg>
            </button>
            <button type="button" id="send-forum-comment-btn" class="icon-btn" style="background:var(--primary-color);color:#fff;border:none;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;box-shadow:none;">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </button>
            </div>
        </div>
    </main>`;

    const shareBtn = detailScreen.querySelector('#header-share-btn');
    if (shareBtn) shareBtn.addEventListener('click', () => openSharePostModal(post.id));

    const likeBtn = detailScreen.querySelector('#like-post-btn');
    if (likeBtn) {
        likeBtn.addEventListener('click', () => forumTogglePostLike(post.id));
        likeBtn.addEventListener('keypress', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); forumTogglePostLike(post.id); } });
    }
    
    const favoriteBtn = detailScreen.querySelector('#favorite-post-btn');
    if (favoriteBtn) {
        favoriteBtn.addEventListener('click', () => forumTogglePostFavorite(post.id));
        favoriteBtn.addEventListener('keypress', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); forumTogglePostFavorite(post.id); } });
    }

    const deleteBtn = detailScreen.querySelector('#delete-post-btn');
    if (deleteBtn) deleteBtn.addEventListener('click', () => forumDeletePost(post.id));

    const sendCommentBtn = detailScreen.querySelector('#send-forum-comment-btn');
    const commentInput = detailScreen.querySelector('#forum-comment-input');
    const aiReplyCommentBtn = detailScreen.querySelector('#ai-reply-comment-btn');
    
    if (sendCommentBtn && commentInput) {
        const sendComment = () => {
            const content = commentInput.value.trim();
            if (content) forumPublishComment(post.id, content);
        };
        sendCommentBtn.addEventListener('click', sendComment);
        commentInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendComment(); });
    }
    
    if (aiReplyCommentBtn) {
        aiReplyCommentBtn.addEventListener('click', () => forumGenerateAICommentReplies(post.id));
    }

    const dmAuthorBtn = detailScreen.querySelector('#forum-dm-author-btn');
    if (dmAuthorBtn && post.username && post.authorId !== 'user') {
        dmAuthorBtn.addEventListener('click', () => {
            const userId = 'npc_' + post.username;
            forumOpenDMConversation(userId, post.username);
        });
    }

    // 评论者私信按钮
    detailScreen.querySelectorAll('.comment-dm-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.commentIndex, 10);
            const comment = post.comments && post.comments[idx];
            if (!comment || !comment.username) return;
            const userId = 'npc_' + comment.username;
            forumOpenDMConversation(userId, comment.username, { postTitle: post.title, commentContent: comment.content });
        });
    });

    // 回复栏关闭按钮
    const replyBarClose = detailScreen.querySelector('#forum-reply-bar-close');
    if (replyBarClose) {
        replyBarClose.addEventListener('click', () => {
            forumReplyTarget = null;
            const bar = detailScreen.querySelector('#forum-reply-bar');
            if (bar) bar.style.display = 'none';
            const input = detailScreen.querySelector('#forum-comment-input');
            if (input) input.placeholder = '写下你的评论...';
        });
    }

    // 恢复回复状态
    if (forumReplyTarget) {
        const bar = detailScreen.querySelector('#forum-reply-bar');
        const nameSpan = detailScreen.querySelector('#forum-reply-bar-name');
        if (bar && nameSpan) {
            bar.style.display = 'flex';
            nameSpan.textContent = '@' + forumReplyTarget.username;
            const input = detailScreen.querySelector('#forum-comment-input');
            if (input) input.placeholder = '回复 @' + forumReplyTarget.username + '...';
        }
    }

    const commentList = detailScreen.querySelector('.comment-list');
    if (commentList) {
        commentList.addEventListener('contextmenu', function(e) {
            const li = e.target.closest('.comment-item');
            if (!li || li.dataset.commentIndex === undefined) return;
            e.preventDefault();
            forumHandleCommentLongPress(post.id, parseInt(li.dataset.commentIndex, 10), e.clientX, e.clientY);
        });
        commentList.addEventListener('touchstart', function(e) {
            const li = e.target.closest('.comment-item');
            if (!li || li.dataset.commentIndex === undefined) return;
            forumCommentLongPressTimer = setTimeout(function() {
                const t = e.touches[0];
                forumHandleCommentLongPress(post.id, parseInt(li.dataset.commentIndex, 10), t.clientX, t.clientY);
            }, 400);
        });
        commentList.addEventListener('touchend', function() { clearTimeout(forumCommentLongPressTimer); });
        commentList.addEventListener('touchmove', function() { clearTimeout(forumCommentLongPressTimer); });
    }
}

function forumHandleCommentLongPress(postId, commentIndex, x, y) {
    const post = db.forumPosts.find(p => p.id === postId);
    const comment = post && post.comments && post.comments[commentIndex];
    const menuItems = [
        { label: '回复', action: function() {
            if (!comment) return;
            forumReplyTarget = { commentId: comment.id, username: comment.username, content: comment.content };
            const bar = document.getElementById('forum-reply-bar');
            const nameSpan = document.getElementById('forum-reply-bar-name');
            if (bar && nameSpan) {
                bar.style.display = 'flex';
                nameSpan.textContent = '@' + comment.username;
            }
            const input = document.getElementById('forum-comment-input');
            if (input) { input.placeholder = '回复 @' + comment.username + '...'; input.focus(); }
        }},
        { label: '分享评论', action: function() { openShareCommentModal(postId, commentIndex); } }
    ];
    if (typeof triggerHapticFeedback === 'function') triggerHapticFeedback('medium');
    createContextMenu(menuItems, x, y);
}

function setupForumFeature() {
    forumInitUserProfile();
    forumAddHeaderButtonsAndFAB();
    forumBindNewEvents();
    forumSetupAltAccountEvents();

    const refreshBtn = document.getElementById('forum-refresh-btn');
    const postsContainer = document.getElementById('forum-posts-container');
    const forumScreen = document.getElementById('forum-screen');
    const detailScreen = document.getElementById('forum-post-detail-screen');

    refreshBtn.addEventListener('click', () => {
        handleForumRefresh();
    });

    if (postsContainer) {
        postsContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.forum-post-card[data-id]');
            if (card) {
                if (forumPostDeleteMode) {
                    var id = card.dataset.id;
                    if (forumSelectedPostIds.has(id)) forumSelectedPostIds.delete(id);
                    else forumSelectedPostIds.add(id);
                    renderForumPosts(db.forumPosts, forumGetActiveFilter());
                    return;
                }
                const postId = card.dataset.id;
                const post = db.forumPosts.find(p => p.id === postId);
                if (post) {
                    renderPostDetail(post);
                    switchScreen('forum-post-detail-screen');
                }
            }
        });
    }

    if (detailScreen) {
        detailScreen.addEventListener('click', e => {
            if (e.target.closest('#header-share-btn')) {
                // share logic is bound inside renderPostDetail
            }
        });
    }

    const observer = new MutationObserver((mutations) => {
        for (let mutation of mutations) {
            if (mutation.attributeName === 'class') {
                const isActive = forumScreen.classList.contains('active');
                if (isActive) {
                    if (db.forumPosts && db.forumPosts.length > 0) {
                        renderForumPosts(db.forumPosts);
                    } else {
                        postsContainer.innerHTML = '<p class="placeholder-text" style="margin-top: 50px;">这里空空也...<br>点击右上角刷新按钮加载帖子吧！</p>';
                    }
                    forumUpdateDMUnreadBadge();
                }
            }
        }
    });

    if (forumScreen) {
        observer.observe(forumScreen, { attributes: true });
    }
}

function setupShareModal() {
    const modal = document.getElementById('share-post-modal');
    const confirmBtn = document.getElementById('confirm-share-btn');
    const charList = document.getElementById('share-char-list');

    confirmBtn.addEventListener('click', async () => {
        const checkedInputs = Array.from(charList.querySelectorAll('input:checked'));

        if (checkedInputs.length === 0) {
            showToast('请至少选择一个分享对象。');
            return;
        }

        const selectedChars = checkedInputs.filter(input => input.dataset.shareTarget === 'character').map(input => input.value);
        const selectedGroups = checkedInputs.filter(input => input.dataset.shareTarget === 'group').map(input => input.value);

        const shareType = modal.dataset.shareType || 'post';
        let messageContent = '';

        if (shareType === 'comment') {
            const postId = modal.dataset.postId;
            const commentIndex = parseInt(modal.dataset.commentIndex, 10);
            if (postId === undefined || isNaN(commentIndex)) {
                showToast('无法获取评论信息，分享失败。');
                return;
            }
            const post = db.forumPosts.find(p => p.id === postId);
            if (!post || !post.comments || !post.comments[commentIndex]) {
                showToast('找不到该评论，分享失败。');
                return;
            }
            const comment = post.comments[commentIndex];
            const postContent = (post.content || post.summary || '').replace(/\n/g, ' ');
            messageContent = `[论坛分享-评论]\n帖子标题：${post.title || ''}\n帖子内容：${postContent}\n评论（来自 ${comment.username || '匿名'}）：${comment.content || ''}`;
        } else {
            const postTitle = modal.dataset.postTitle;
            const postSummary = modal.dataset.postSummary;

            if (!postTitle || !postSummary) {
                showToast('无法获取帖子信息，分享失败。');
                return;
            }
            messageContent = `[论坛分享]标题：${postTitle}\n摘要：${postSummary}`;
        }

        // 分享给单人角色
        selectedChars.forEach(charId => {
            const character = db.characters.find(c => c.id === charId);
            if (character) {
                const message = {
                    id: `msg_${Date.now()}_${Math.random()}`,
                    role: 'user',
                    content: messageContent,
                    parts: [{ type: 'text', text: messageContent }],
                    timestamp: Date.now()
                };
                character.history.push(message);
            }
        });

        // 分享给群聊
        selectedGroups.forEach(groupId => {
            const group = db.groups.find(g => g.id === groupId);
            if (group) {
                const message = {
                    id: `msg_${Date.now()}_${Math.random()}`,
                    role: 'user',
                    content: messageContent,
                    parts: [{ type: 'text', text: messageContent }],
                    timestamp: Date.now()
                };
                group.history.push(message);
            }
        });

        await saveData();
        renderChatList();
        modal.classList.remove('visible');
        const totalCount = selectedChars.length + selectedGroups.length;
        showToast(`成功分享给 ${totalCount} 位联系人！`);
    });
}

function openSharePostModal(postId) {
    const post = db.forumPosts.find(p => p.id === postId);
    if (!post) {
        showToast('找不到该帖子信息。');
        return;
    }

    const modal = document.getElementById('share-post-modal');
    const charList = document.getElementById('share-char-list');
    const detailsElement = modal.querySelector('details');
    const titleEl = document.getElementById('share-modal-title');

    modal.dataset.shareType = 'post';
    modal.dataset.postTitle = post.title;
    modal.dataset.postSummary = post.summary;
    delete modal.dataset.postId;
    delete modal.dataset.commentIndex;
    if (titleEl) titleEl.textContent = '是否将帖子分享给他人？';

    charList.innerHTML = '';

    // 渲染单人角色
    if (db.characters.length > 0) {
        db.characters.forEach(char => {
            const li = document.createElement('li');
            li.className = 'binding-list-item';
            li.innerHTML = `
                <input type="checkbox" id="share-to-${char.id}" value="${char.id}" data-share-target="character">
                <label for="share-to-${char.id}" style="display: flex; align-items: center; gap: 10px;">
                    <img src="${char.avatar}" alt="${char.remarkName}" style="width: 32px; height: 32px; border-radius: 50%;">
                    ${char.remarkName}
                </label>
            `;
            charList.appendChild(li);
        });
    }

    // 渲染群聊
    if (db.groups && db.groups.length > 0) {
        db.groups.forEach(group => {
            const li = document.createElement('li');
            li.className = 'binding-list-item';
            li.innerHTML = `
                <input type="checkbox" id="share-to-${group.id}" value="${group.id}" data-share-target="group">
                <label for="share-to-${group.id}" style="display: flex; align-items: center; gap: 10px;">
                    <img src="${group.avatar}" alt="${group.name}" style="width: 32px; height: 32px; border-radius: 50%;">
                    ${group.name}
                    <span style="font-size: 12px; color: #999;">[群聊]</span>
                </label>
            `;
            charList.appendChild(li);
        });
    }

    if (db.characters.length === 0 && (!db.groups || db.groups.length === 0)) {
        charList.innerHTML = '<li style="color: #888;">暂无可以分享的对象。</li>';
    }

    if (detailsElement) detailsElement.open = false;

    modal.classList.add('visible');
}

function openShareCommentModal(postId, commentIndex) {
    const post = db.forumPosts.find(p => p.id === postId);
    if (!post || !post.comments || !post.comments[commentIndex]) {
        showToast('找不到该评论信息。');
        return;
    }

    const modal = document.getElementById('share-post-modal');
    const charList = document.getElementById('share-char-list');
    const detailsElement = modal.querySelector('details');
    const titleEl = document.getElementById('share-modal-title');

    modal.dataset.shareType = 'comment';
    modal.dataset.postId = postId;
    modal.dataset.commentIndex = String(commentIndex);
    delete modal.dataset.postTitle;
    delete modal.dataset.postSummary;
    if (titleEl) titleEl.textContent = '是否将这条评论分享给他人？';

    charList.innerHTML = '';

    // 渲染单人角色
    if (db.characters.length > 0) {
        db.characters.forEach(char => {
            const li = document.createElement('li');
            li.className = 'binding-list-item';
            li.innerHTML = `
                <input type="checkbox" id="share-to-${char.id}" value="${char.id}" data-share-target="character">
                <label for="share-to-${char.id}" style="display: flex; align-items: center; gap: 10px;">
                    <img src="${char.avatar}" alt="${char.remarkName}" style="width: 32px; height: 32px; border-radius: 50%;">
                    ${char.remarkName}
                </label>
            `;
            charList.appendChild(li);
        });
    }

    // 渲染群聊
    if (db.groups && db.groups.length > 0) {
        db.groups.forEach(group => {
            const li = document.createElement('li');
            li.className = 'binding-list-item';
            li.innerHTML = `
                <input type="checkbox" id="share-to-${group.id}" value="${group.id}" data-share-target="group">
                <label for="share-to-${group.id}" style="display: flex; align-items: center; gap: 10px;">
                    <img src="${group.avatar}" alt="${group.name}" style="width: 32px; height: 32px; border-radius: 50%;">
                    ${group.name}
                    <span style="font-size: 12px; color: #999;">[群聊]</span>
                </label>
            `;
            charList.appendChild(li);
        });
    }

    if (db.characters.length === 0 && (!db.groups || db.groups.length === 0)) {
        charList.innerHTML = '<li style="color: #888;">暂无可以分享的对象。</li>';
    }

    if (detailsElement) detailsElement.open = false;

    modal.classList.add('visible');
}

function getForumGenerationContext() {
    let context = "以下是论坛社区的背景设定和主要角色信息：\n\n";
    const bindings = db.forumBindings || { worldBookIds: [], charIds: [], userPersonaIds: [] };

    if (bindings.worldBookIds && bindings.worldBookIds.length > 0) {
        context += "===== 世界观设定 =====\n";
        bindings.worldBookIds.forEach(id => {
            const book = db.worldBooks.find(wb => wb.id === id);
            if (book && !book.disabled) {
                context += `设定名: ${book.name}\n内容: ${book.content}\n\n`;
            }
        });
    }

    if (bindings.charIds && bindings.charIds.length > 0) {
        context += "===== 主要角色人设 =====\n";
        bindings.charIds.forEach(id => {
            const char = db.characters.find(c => c.id === id);
            if (char) {
                context += `角色名: ${char.realName} (昵称: ${char.remarkName})\n人设: ${char.persona}\n\n`;
            }
        });
    }

    // 小号模式下不注入用户人设，保护隐私
    const activeAccount = forumGetActiveAccount();
    if (!activeAccount.isAlt && bindings.userPersonaIds && bindings.userPersonaIds.length > 0) {
        context += "=====  (你) 的人设 =====\n";
        bindings.userPersonaIds.forEach(presetName => {
            const preset = db.myPersonaPresets.find(p => p.name === presetName);
            if (preset) {
                context += `人设名: ${preset.name}\n人设描述: ${preset.persona}\n\n`;
            }
        });
    }

    if (context.length < 50) { 
        return "没有提供任何特定的背景设定，请自由发挥，创作一些通用的、有趣有网感的论坛帖子。禁止以user或者char的视角制作帖子，发帖人只能是NPC";
    }

    return context;
}

async function handleForumRefresh() {
    const forumApiSettings = db.forumApiSettings || {};
    const apiSettings = forumApiSettings.useForumApi && forumApiSettings.url && forumApiSettings.key && forumApiSettings.model
        ? forumApiSettings
        : db.apiSettings;
    let { url, key, model } = apiSettings;
    if (!url || !key || !model) {
        showToast('请先在API设置中配置好接口信息');
        switchScreen('api-settings-screen');
        return;
    }

    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }

    const refreshBtn = document.getElementById('forum-refresh-btn');
    const postsContainer = document.getElementById('forum-posts-container');
    const searchInput = document.getElementById('forum-search-input');

    refreshBtn.disabled = true;
    const spinner = `<div class="spinner" style="display: block; margin: 0 auto; border-top-color: var(--primary-color);"></div>`;
    postsContainer.innerHTML = `<p class="placeholder-text" style="margin-top: 50px;">正在生成论坛内容，请稍候...<br>${spinner}</p>`;

    try {
        const context = getForumGenerationContext();
        const keywords = searchInput.value.trim();

        let systemPrompt = `你是一位专业的论坛内容生成专家，专门为指定世界观生成论坛帖子。
背景信息如下：
${context}

你的任务是读取背景世界观生成${(db.forumSettings && db.forumSettings.postsPerGeneration) || 8}篇风格各异、内容有趣的论坛帖子，每条帖子下面生成${(db.forumSettings && db.forumSettings.commentsPerPost && db.forumSettings.commentsPerPost.min) || 4}到${(db.forumSettings && db.forumSettings.commentsPerPost && db.forumSettings.commentsPerPost.max) || 8}条评论，每个帖子评论数量应该不一样，注意区分真实姓名和网名，注意user隐私，你的角色是“世界构建者”和“社区模拟器”，你需要分析char设定和user人设所处世界的世界观而不是“角色扮演者”，发帖人应该是该角色所处世界观下的其他NPC，发帖人不能是user。ABSOLUTELY DO NOT。若角色为普通人或需保密等神秘身份就禁止提及角色真实姓名，可以用代称或者暗号，只有当user或者char是公众人物名气大时才可以提及真实姓名。char的备注或者昵称是仅供user使用的，NPC不知道也禁止提及char的备注。若user和char不在一个地区就禁止有NPC目睹二人同框。

请严格按照下面的XML标签格式返回，不要包含任何多余的解释和注释。禁止以user的视角进行创作。

返回格式示例:
<posts>
  <post>
    <title>一个引人注目的帖子标题</title>
    <summary>对帖子内容的客观的重点摘要，大约100字左右，DO NOT use first-person “我”</summary>
    <content>帖子的详细内容，150~300字。\n可以使用换行符来分段落，注意排版。</content>
    <comments>
      <comment>
        <username>路人（随机姓名）</username>
        <content>这是第一条评论的内容，表达一个观点。</content>
        <timestamp>5分钟前</timestamp>
      </comment>
      <comment>
        <username>（随机姓名）</username>
        <content>这是第二条评论，可能反驳楼主或楼上的观点。</content>
        <timestamp>3分钟前</timestamp>
      </comment>
    </comments>
  </post>
</posts>
`;

        if (keywords) {
            systemPrompt += `\n\n重要指令：本次生成的所有帖子标题必须和以下关键词相关：【${keywords}】，同时也需要和之前绑定的设定相关。禁止相似帖子过多，不要特地把关键词标注出来。`;
        }

        const temperature = apiSettings.temperature !== undefined ? apiSettings.temperature : 0.8;

        const requestBody = {
            model: apiSettings.model,
            messages: [{ role: "user", content: systemPrompt }],
            temperature: temperature
        };

        const endpoint = `${url}/v1/chat/completions`;
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };

        const contentStr = await fetchAiResponse(apiSettings, requestBody, headers, endpoint);

        const posts = [];
        const postRegex = /<post>([\s\S]*?)<\/post>/g;
        let postMatch;
        while ((postMatch = postRegex.exec(contentStr)) !== null) {
            const postContent = postMatch[1];
            const titleMatch = postContent.match(/<title>([\s\S]*?)<\/title>/);
            const summaryMatch = postContent.match(/<summary>([\s\S]*?)<\/summary>/);
            const contentMatch = postContent.match(/<content>([\s\S]*?)<\/content>/);
            
            const comments = [];
            const commentsBlockMatch = postContent.match(/<comments>([\s\S]*?)<\/comments>/);
            if (commentsBlockMatch) {
                const commentRegex = /<comment>([\s\S]*?)<\/comment>/g;
                let commentMatch;
                while ((commentMatch = commentRegex.exec(commentsBlockMatch[1])) !== null) {
                    const cContent = commentMatch[1];
                    const uMatch = cContent.match(/<username>([\s\S]*?)<\/username>/);
                    const textMatch = cContent.match(/<content>([\s\S]*?)<\/content>/);
                    const timeMatch = cContent.match(/<timestamp>([\s\S]*?)<\/timestamp>/);
                    if (uMatch && textMatch) {
                        comments.push({
                            username: uMatch[1].trim(),
                            content: textMatch[1].trim(),
                            timestamp: timeMatch ? timeMatch[1].trim() : '刚刚'
                        });
                    }
                }
            }
            
            if (titleMatch && contentMatch) {
                posts.push({
                    title: titleMatch[1].trim(),
                    summary: summaryMatch ? summaryMatch[1].trim() : '',
                    content: contentMatch[1].trim(),
                    comments: comments
                });
            }
        }

        if (posts.length > 0) {
            const enhancedPosts = posts.map(post => ({
              ...post,
              id: `post_${Date.now()}_${Math.random()}`,
              authorId: 'npc',
              username: `楼主${Math.floor(100 + Math.random() * 900)}`,
              likeCount: Math.floor(Math.random() * 200),
              shareCount: Math.floor(Math.random() * 50),
              isLiked: false,
              comments: (post.comments || []).map(c => ({ ...c, authorId: 'npc' }))
            }));

            const userPosts = (db.forumPosts || []).filter(p => p.authorId === 'user' || (p.authorId && p.authorId.startsWith('alt_')));
            db.forumPosts = userPosts.concat(enhancedPosts);
            await saveData();
            renderForumPosts(db.forumPosts);

        } else {
            throw new Error("AI返回的数据格式不正确");
        }

    } catch (error) {
        showApiError(error);
        postsContainer.innerHTML = `<p class="placeholder-text" style="margin-top: 50px;">生成失败了，请检查API设置或网络后重试。</p>`;
    } finally {
        refreshBtn.disabled = false;
    }
}

function renderForumPosts(posts, filter = 'all') {
    const postsContainer = document.getElementById('forum-posts-container');
    postsContainer.innerHTML = ''; 

    if (!posts || posts.length === 0) {
        postsContainer.innerHTML = '<p class="placeholder-text" style="margin-top: 50px;">AI还没生成任何帖子，请点击刷新按钮。';
        return;
    }
    
    let filteredPosts = posts;
    
    if (filter === 'liked') {
        filteredPosts = posts.filter(p => p.isLiked);
    } else if (filter === 'favorited') {
        filteredPosts = posts.filter(p => p.isFavorited);
    }
    
    if (filteredPosts.length === 0) {
        const filterText = filter === 'liked' ? '点赞' : filter === 'favorited' ? '收藏' : '';
        postsContainer.innerHTML = `<p class="placeholder-text" style="margin-top: 50px;">暂无${filterText}的帖子</p>`;
        return;
    }

    filteredPosts.forEach(post => {
        const card = document.createElement('div');
        card.className = 'forum-post-card';
        if (forumPostDeleteMode) {
            card.classList.add('forum-post-delete-mode');
            if (forumSelectedPostIds.has(post.id)) card.classList.add('forum-post-selected');
        }
        card.dataset.id = post.id;

        let checkboxHtml = '';
        if (forumPostDeleteMode) {
            checkboxHtml = '<div class="forum-post-select-checkbox"></div>';
        }

        const titleEl = document.createElement('h3');
        titleEl.className = 'post-title';
        titleEl.textContent = post.title || '无标题';

        const summaryEl = document.createElement('p');
        summaryEl.className = 'post-summary';
        summaryEl.textContent = post.summary || '无摘要';

        if (forumPostDeleteMode) {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'display:flex;align-items:flex-start;gap:12px;width:100%;';
            const cbDiv = document.createElement('div');
            cbDiv.className = 'forum-post-select-checkbox';
            const textDiv = document.createElement('div');
            textDiv.style.cssText = 'flex:1;min-width:0;';
            textDiv.appendChild(titleEl);
            textDiv.appendChild(summaryEl);
            wrapper.appendChild(cbDiv);
            wrapper.appendChild(textDiv);
            card.appendChild(wrapper);
        } else {
            card.appendChild(titleEl);
            card.appendChild(summaryEl);
        }

        postsContainer.appendChild(card);
    });
}

function forumInitUserProfile() {
    if (!db.forumUserProfile || typeof db.forumUserProfile !== 'object') {
        db.forumUserProfile = { username: '', avatar: 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg', bio: '', joinDate: Date.now() };
        saveData();
    }
    if (!db.forumUserProfile.username && db.forumUserProfile.joinDate) {
        db.forumUserProfile.username = '用户' + Math.floor(1000 + Math.random() * 9000);
        saveData();
    }
}

function forumAddHeaderButtonsAndFAB() {
    const actionBtnGroup = document.querySelector('#forum-screen .action-btn-group');
    if (!actionBtnGroup) return;

    if (!document.getElementById('forum-post-delete-btn')) {
        const delBtn = document.createElement('button');
        delBtn.className = 'action-btn';
        delBtn.id = 'forum-post-delete-btn';
        delBtn.title = '删除帖子';
        delBtn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
        actionBtnGroup.appendChild(delBtn);
    }

    if (!document.getElementById('forum-dm-btn')) {
        const dmBtn = document.createElement('button');
        dmBtn.className = 'action-btn';
        dmBtn.id = 'forum-dm-btn';
        dmBtn.title = '私信';
        dmBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
        actionBtnGroup.appendChild(dmBtn);
    }

    if (!document.getElementById('forum-settings-btn')) {
        const settingsBtn = document.createElement('button');
        settingsBtn.className = 'action-btn';
        settingsBtn.id = 'forum-settings-btn';
        settingsBtn.title = '设置';
        settingsBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';
        actionBtnGroup.appendChild(settingsBtn);
    }

    const forumScreen = document.getElementById('forum-screen');
    if (forumScreen && !document.getElementById('create-post-fab')) {
        const fab = document.createElement('button');
        fab.className = 'forum-fab';
        fab.id = 'create-post-fab';
        fab.title = '发布新帖';
        fab.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
        forumScreen.appendChild(fab);
    }

    if (!document.getElementById('forum-fab-style')) {
        const style = document.createElement('style');
        style.id = 'forum-fab-style';
        style.textContent = '.forum-fab{position:fixed;bottom:80px;right:20px;width:56px;height:56px;border-radius:50%;background:var(--primary-color);color:#fff;border:none;box-shadow:0 4px 12px rgba(0,0,0,0.15);display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:100;}.forum-fab:active{transform:scale(0.95);}';
        document.head.appendChild(style);
    }
}

function forumTogglePostLike(postId) {
    const post = db.forumPosts.find(p => p.id === postId);
    if (!post) return;
    post.isLiked = !post.isLiked;
    post.likeCount = (post.likeCount || 0) + (post.isLiked ? 1 : -1);
    saveData();
    const likeBtn = document.getElementById('like-post-btn');
    const likeCountEl = document.getElementById('like-count');
    if (likeBtn) {
        likeBtn.dataset.liked = post.isLiked;
        const svg = likeBtn.querySelector('svg');
        if (svg) svg.setAttribute('fill', post.isLiked ? '#ff4757' : 'none');
    }
    if (likeCountEl) likeCountEl.textContent = post.likeCount;
}

function forumTogglePostFavorite(postId) {
    const post = db.forumPosts.find(p => p.id === postId);
    if (!post) return;
    post.isFavorited = !post.isFavorited;
    saveData();
    const favoriteBtn = document.getElementById('favorite-post-btn');
    if (favoriteBtn) {
        favoriteBtn.dataset.favorited = post.isFavorited;
        const svg = favoriteBtn.querySelector('svg');
        if (svg) svg.setAttribute('fill', post.isFavorited ? '#ffd700' : 'none');
    }
    showToast(post.isFavorited ? '已收藏' : '已取消收藏');
}

function forumPublishComment(postId, content) {
    const post = db.forumPosts.find(p => p.id === postId);
    if (!post) return;
    const activeAccount = forumGetActiveAccount();
    const defaultAvatarUrl = 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg';
    const newComment = { id: 'comment_' + Date.now() + '_' + Math.random(), authorId: activeAccount.isAlt ? activeAccount.id : 'user', username: activeAccount.username || '用户', avatar: activeAccount.avatar || defaultAvatarUrl, content: content, timestamp: new Date().toLocaleString() };
    if (forumReplyTarget) {
        newComment.replyTo = { commentId: forumReplyTarget.commentId, username: forumReplyTarget.username };
        forumReplyTarget = null;
    }
    if (!post.comments) post.comments = [];
    post.comments.push(newComment);
    saveData();
    renderPostDetail(post);
    const input = document.getElementById('forum-comment-input');
    if (input) input.value = '';
    showToast('评论成功');
}

async function forumPublishPost() {
    const titleInput = document.getElementById('forum-post-title-input');
    const contentInput = document.getElementById('forum-post-content-input');
    const title = titleInput && titleInput.value.trim();
    const content = contentInput && contentInput.value.trim();
    if (!title || !content) { showToast('标题和内容不能为空'); return; }
    
    const activeAccount = forumGetActiveAccount();
    const newPost = { 
        id: 'post_' + Date.now() + '_' + Math.random(), 
        authorId: activeAccount.isAlt ? activeAccount.id : 'user', 
        username: activeAccount.username || '用户', 
        title: title, 
        content: content, 
        summary: content.length > 100 ? content.substring(0, 100) + '...' : content, 
        timestamp: Date.now(), 
        likeCount: 0, 
        isLiked: false, 
        comments: [] 
    };
    
    if (!db.forumPosts) db.forumPosts = [];
    db.forumPosts.unshift(newPost);
    await saveData();
    
    renderForumPosts(db.forumPosts);
    document.getElementById('create-forum-post-modal').classList.remove('visible');
    showToast('发布成功');
    
    if (titleInput) titleInput.value = '';
    if (contentInput) contentInput.value = '';
    
    const autoReplyCount = (db.forumSettings && db.forumSettings.autoReplyCount) || 0;
    if (autoReplyCount > 0) {
        forumGenerateAutoReplies(newPost.id, autoReplyCount);
    }
}

async function forumGenerateAutoReplies(postId, replyCount) {
    const post = db.forumPosts.find(p => p.id === postId);
    if (!post) return;
    
    const forumApiSettings = db.forumApiSettings || {};
    let apiSettings = forumApiSettings.useForumApi ? forumApiSettings : db.apiSettings;
    
    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) {
        showToast('未配置API，无法自动生成评论');
        return;
    }
    
    showToast('正在生成AI评论...');
    
    try {
        const context = getForumGenerationContext();
        
        const systemPrompt = `你是一位论坛内容生成专家。
背景信息：
${context}

用户刚发布了一篇新帖：
标题: ${post.title}
内容: ${post.content}
作者: ${post.username}

请生成${replyCount}条来自不同NPC的评论。评论要有不同的观点和风格，有的支持，有的质疑，有的提供新的视角。评论者都是论坛中的NPC用户，要根据背景设定来回复。

返回XML标签格式:
<comments>
  <comment>
    <username>评论者昵称</username>
    <content>评论内容</content>
    <timestamp>刚刚</timestamp>
  </comment>
</comments>
`;
        
        let url = apiSettings.url;
        if (url.endsWith('/')) url = url.slice(0, -1);
        
        const temperature = apiSettings.temperature !== undefined ? apiSettings.temperature : 0.9;
        
        const requestBody = {
            model: apiSettings.model,
            messages: [{ role: "user", content: systemPrompt }],
            temperature: temperature
        };
        
        const endpoint = `${url}/v1/chat/completions`;
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiSettings.key}` };
        
        const contentStr = await fetchAiResponse(apiSettings, requestBody, headers, endpoint);
        
        const comments = [];
        const commentRegex = /<comment>([\s\S]*?)<\/comment>/g;
        let commentMatch;
        while ((commentMatch = commentRegex.exec(contentStr)) !== null) {
            const cContent = commentMatch[1];
            const uMatch = cContent.match(/<username>([\s\S]*?)<\/username>/);
            const textMatch = cContent.match(/<content>([\s\S]*?)<\/content>/);
            const timeMatch = cContent.match(/<timestamp>([\s\S]*?)<\/timestamp>/);
            if (uMatch && textMatch) {
                comments.push({
                    username: uMatch[1].trim(),
                    content: textMatch[1].trim(),
                    timestamp: timeMatch ? timeMatch[1].trim() : '刚刚'
                });
            }
        }
        
        if (comments.length > 0) {
            if (!post.comments) post.comments = [];
            
            comments.forEach(comment => {
                const newComment = {
                    id: 'comment_' + Date.now() + '_' + Math.random(),
                    authorId: 'npc',
                    username: comment.username || '路人' + Math.floor(100 + Math.random() * 900),
                    content: comment.content || '',
                    timestamp: comment.timestamp || '刚刚'
                };
                post.comments.push(newComment);
            });
            
            await saveData();
            renderForumPosts(db.forumPosts);
            showToast(`成功生成${jsonData.comments.length}条AI评论`);
        }
        
    } catch (error) {
        console.error('自动回复生成失败:', error);
        showToast('自动生成评论失败');
    }
}

function forumDeletePost(postId) {
    if (!confirm('确定要删除这篇帖子吗？')) return;
    const index = db.forumPosts.findIndex(p => p.id === postId);
    if (index === -1) return;
    const post = db.forumPosts[index];
    if (post.authorId !== 'user' && !(post.authorId && post.authorId.startsWith('alt_'))) { showToast('只能删除自己的帖子'); return; }
    db.forumPosts.splice(index, 1);
    saveData();
    switchScreen('forum-screen');
    renderForumPosts(db.forumPosts);
    showToast('帖子已删除');
}

function forumTogglePostDeleteMode() {
    if (forumPostDeleteMode) return;
    forumPostDeleteMode = true;
    forumSelectedPostIds.clear();
    var toolbar = document.getElementById('forum-post-delete-toolbar');
    if (toolbar) toolbar.style.display = 'flex';
    var deleteBtn = document.getElementById('forum-post-delete-btn');
    if (deleteBtn) deleteBtn.style.display = 'none';
    renderForumPosts(db.forumPosts, forumGetActiveFilter());
}

function forumPostSelectAll() {
    var posts = db.forumPosts || [];
    forumSelectedPostIds.clear();
    posts.forEach(function(p) { forumSelectedPostIds.add(p.id); });
    renderForumPosts(db.forumPosts, forumGetActiveFilter());
}

function forumPostDeleteSelected() {
    if (forumSelectedPostIds.size === 0) { showToast('请先选择要删除的帖子'); return; }
    if (!confirm('确定要删除选中的 ' + forumSelectedPostIds.size + ' 个帖子吗？')) return;
    db.forumPosts = (db.forumPosts || []).filter(function(p) { return !forumSelectedPostIds.has(p.id); });
    saveData();
    forumSelectedPostIds.clear();
    forumPostDeleteMode = false;
    var toolbar = document.getElementById('forum-post-delete-toolbar');
    if (toolbar) toolbar.style.display = 'none';
    var deleteBtn = document.getElementById('forum-post-delete-btn');
    if (deleteBtn) deleteBtn.style.display = '';
    renderForumPosts(db.forumPosts, forumGetActiveFilter());
    showToast('已删除选中帖子');
}

function forumPostCancelDeleteMode() {
    forumPostDeleteMode = false;
    forumSelectedPostIds.clear();
    var toolbar = document.getElementById('forum-post-delete-toolbar');
    if (toolbar) toolbar.style.display = 'none';
    var deleteBtn = document.getElementById('forum-post-delete-btn');
    if (deleteBtn) deleteBtn.style.display = '';
    renderForumPosts(db.forumPosts, forumGetActiveFilter());
}

function forumGetActiveFilter() {
    var activeTab = document.querySelector('.forum-filter-tab.active');
    return activeTab ? (activeTab.dataset.filter || 'all') : 'all';
}

function forumLoadSettings() {
    const s = db.forumSettings || { postsPerGeneration: 8, commentsPerPost: { min: 4, max: 8 }, autoReplyCount: 3, detailReplyCount: 2 };
    const postsInput = document.getElementById('forum-posts-count-input');
    const minInput = document.getElementById('forum-comments-min-input');
    const maxInput = document.getElementById('forum-comments-max-input');
    const autoReplyInput = document.getElementById('forum-auto-reply-count-input');
    const detailReplyInput = document.getElementById('forum-detail-reply-count-input');
    const dmCountInput = document.getElementById('forum-dm-count-input');
    
    if (postsInput) postsInput.value = s.postsPerGeneration || 8;
    if (minInput) minInput.value = (s.commentsPerPost && s.commentsPerPost.min) != null ? s.commentsPerPost.min : 4;
    if (maxInput) maxInput.value = (s.commentsPerPost && s.commentsPerPost.max) != null ? s.commentsPerPost.max : 8;
    if (autoReplyInput) autoReplyInput.value = s.autoReplyCount != null ? s.autoReplyCount : 3;
    if (detailReplyInput) detailReplyInput.value = s.detailReplyCount != null ? s.detailReplyCount : 2;
    if (dmCountInput) dmCountInput.value = Math.max(1, Math.min(20, (s.dmPerGeneration != null ? parseInt(s.dmPerGeneration, 10) : 4)));
    
    const apiSettings = db.forumApiSettings || { useForumApi: false, url: '', key: '', model: '', temperature: 0.9 };
    const useApiToggle = document.getElementById('forum-use-api-toggle');
    const apiUrlInput = document.getElementById('forum-api-url-input');
    const apiKeyInput = document.getElementById('forum-api-key-input');
    const apiModelSelect = document.getElementById('forum-api-model-select');
    const apiConfigSection = document.getElementById('forum-api-config-section');
    
    if (useApiToggle) {
        useApiToggle.checked = apiSettings.useForumApi || false;
        useApiToggle.addEventListener('change', function() {
            if (apiConfigSection) apiConfigSection.style.display = this.checked ? 'block' : 'none';
        });
        if (apiConfigSection) apiConfigSection.style.display = useApiToggle.checked ? 'block' : 'none';
    }
    
    if (apiUrlInput) apiUrlInput.value = apiSettings.url || '';
    if (apiKeyInput) apiKeyInput.value = apiSettings.key || '';
    if (apiModelSelect && apiSettings.model) {
        apiModelSelect.innerHTML = `<option value="${apiSettings.model}">${apiSettings.model}</option>`;
    }
    
    const tempSlider = document.getElementById('forum-temperature-slider');
    const tempValue = document.getElementById('forum-temperature-value');
    if (tempSlider && tempValue) {
        const savedTemp = apiSettings.temperature !== undefined ? apiSettings.temperature : 0.9;
        tempSlider.value = savedTemp;
        tempValue.textContent = savedTemp;
        
        tempSlider.addEventListener('input', (e) => {
            tempValue.textContent = e.target.value;
        });
    }
    
    const fetchModelsBtn = document.getElementById('forum-fetch-models-btn');
    if (fetchModelsBtn) {
        fetchModelsBtn.addEventListener('click', forumFetchModels);
    }

    // 角色小号私信设置
    const charAltEnable = document.getElementById('forum-char-alt-enable');
    const charAltOptions = document.getElementById('forum-char-alt-options');
    const charAltProbSlider = document.getElementById('forum-char-alt-prob-slider');
    const charAltProbValue = document.getElementById('forum-char-alt-prob-value');
    const charAltList = document.getElementById('forum-char-alt-list');
    if (charAltEnable && charAltOptions) {
        const altSettings = db.forumSettings && db.forumSettings.enableCharAltDm;
        charAltEnable.checked = !!altSettings;
        charAltOptions.style.display = charAltEnable.checked ? 'block' : 'none';
        charAltEnable.addEventListener('change', function() {
            charAltOptions.style.display = this.checked ? 'block' : 'none';
        });
    }
    if (charAltProbSlider && charAltProbValue) {
        const p = (db.forumSettings && db.forumSettings.charAltProbability) != null ? db.forumSettings.charAltProbability : 25;
        charAltProbSlider.value = Math.max(0, Math.min(100, p));
        charAltProbValue.textContent = charAltProbSlider.value + '%';
        charAltProbSlider.addEventListener('input', function() {
            charAltProbValue.textContent = this.value + '%';
        });
    }
    if (charAltList) {
        const mainChars = (db.characters || []).filter(function(c) { return c.source !== 'forum'; });
        const selectedIds = (db.forumSettings && db.forumSettings.charAltCharIds) || [];
        const altNames = (db.forumSettings && db.forumSettings.charAltNames) || {};
        charAltList.innerHTML = '';
        mainChars.forEach(function(c) {
            const li = document.createElement('li');
            li.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f0f0f0;';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.id = 'forum-char-alt-cb-' + c.id;
            cb.value = c.id;
            cb.checked = selectedIds.indexOf(c.id) !== -1;
            const label = document.createElement('label');
            label.htmlFor = cb.id;
            label.textContent = (c.remarkName || c.realName || c.id) + ' ';
            label.style.flex = '0 0 auto';
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = '小号昵称（选填）';
            input.dataset.charId = c.id;
            input.value = altNames[c.id] || '';
            input.style.cssText = 'flex:1;min-width:0;padding:4px 8px;border:1px solid #e0e0e0;border-radius:6px;font-size:13px;';
            li.appendChild(cb);
            li.appendChild(label);
            li.appendChild(input);
            charAltList.appendChild(li);
        });
        if (mainChars.length === 0) {
            charAltList.innerHTML = '<li style="padding:8px;color:#999;">暂无主角色（仅非论坛来源角色可设小号）</li>';
        }
    }
}

function forumSaveSettings() {
    const postsInput = document.getElementById('forum-posts-count-input');
    const minInput = document.getElementById('forum-comments-min-input');
    const maxInput = document.getElementById('forum-comments-max-input');
    const autoReplyInput = document.getElementById('forum-auto-reply-count-input');
    const detailReplyInput = document.getElementById('forum-detail-reply-count-input');
    
    const postsCount = parseInt(postsInput && postsInput.value, 10) || 8;
    const commentsMin = parseInt(minInput && minInput.value, 10) || 4;
    const commentsMax = parseInt(maxInput && maxInput.value, 10) || 8;
    const autoReplyCount = parseInt(autoReplyInput && autoReplyInput.value, 10) || 3;
    const detailReplyCount = parseInt(detailReplyInput && detailReplyInput.value, 10) || 2;
    
    if (commentsMin > commentsMax) { showToast('最小评论数不能大于最大评论数'); return; }
    
    const dmCountInput = document.getElementById('forum-dm-count-input');
    const dmPerGeneration = (dmCountInput && dmCountInput.value != null) ? Math.max(1, Math.min(20, parseInt(dmCountInput.value, 10))) : 4;
    
    db.forumSettings = db.forumSettings || {};
    db.forumSettings.postsPerGeneration = postsCount;
    db.forumSettings.commentsPerPost = { min: commentsMin, max: commentsMax };
    db.forumSettings.autoReplyCount = autoReplyCount;
    db.forumSettings.detailReplyCount = detailReplyCount;
    db.forumSettings.dmPerGeneration = dmPerGeneration;

    const charAltEnable = document.getElementById('forum-char-alt-enable');
    const charAltProbSlider = document.getElementById('forum-char-alt-prob-slider');
    const charAltList = document.getElementById('forum-char-alt-list');
    db.forumSettings.enableCharAltDm = !!(charAltEnable && charAltEnable.checked);
    db.forumSettings.charAltProbability = (charAltProbSlider && charAltProbSlider.value != null) ? Math.max(0, Math.min(100, parseInt(charAltProbSlider.value, 10))) : 25;
    db.forumSettings.charAltCharIds = [];
    db.forumSettings.charAltNames = {};
    if (charAltList) {
        charAltList.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
            if (cb.checked && cb.value) db.forumSettings.charAltCharIds.push(cb.value);
        });
        charAltList.querySelectorAll('input[type="text"][data-char-id]').forEach(function(inp) {
            var cid = inp.dataset.charId;
            if (cid && (inp.value || '').trim()) db.forumSettings.charAltNames[cid] = inp.value.trim();
        });
    }
    
    const useApiToggle = document.getElementById('forum-use-api-toggle');
    const apiUrlInput = document.getElementById('forum-api-url-input');
    const apiKeyInput = document.getElementById('forum-api-key-input');
    const apiModelSelect = document.getElementById('forum-api-model-select');
    const tempSlider = document.getElementById('forum-temperature-slider');
    
    db.forumApiSettings = {
        useForumApi: useApiToggle ? useApiToggle.checked : false,
        url: (apiUrlInput && apiUrlInput.value.trim()) || '',
        key: (apiKeyInput && apiKeyInput.value.trim()) || '',
        model: (apiModelSelect && apiModelSelect.value.trim()) || '',
        temperature: tempSlider ? parseFloat(tempSlider.value) : 0.9
    };
    
    saveData();
    showToast('设置已保存');
}

function forumGetUserStats() {
    const posts = db.forumPosts || [];
    let postCount = 0, commentCount = 0, likeCount = 0;
    const isOwnId = function(id) { return id === 'user' || (id && id.startsWith('alt_')); };
    posts.forEach(p => {
        if (isOwnId(p.authorId)) postCount++;
        (p.comments || []).forEach(c => { if (isOwnId(c.authorId)) commentCount++; });
        if (isOwnId(p.authorId)) likeCount += p.likeCount || 0;
    });
    return { posts: postCount, comments: commentCount, likes: likeCount };
}

async function forumFetchModels() {
    const apiUrlInput = document.getElementById('forum-api-url-input');
    const apiKeyInput = document.getElementById('forum-api-key-input');
    const modelSelect = document.getElementById('forum-api-model-select');
    const fetchBtn = document.getElementById('forum-fetch-models-btn');
    
    let apiUrl = apiUrlInput ? apiUrlInput.value.trim() : '';
    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
    
    if (!apiUrl || !apiKey) {
        showToast('请先填写API地址和密钥！');
        return;
    }
    
    if (apiUrl.endsWith('/')) apiUrl = apiUrl.slice(0, -1);
    
    const endpoint = `${apiUrl}/v1/models`;
    
    if (fetchBtn) {
        fetchBtn.classList.add('loading');
        fetchBtn.disabled = true;
    }
    
    try {
        const headers = { Authorization: `Bearer ${apiKey}` };
        const response = await fetch(endpoint, { method: 'GET', headers });
        
        if (!response.ok) {
            const error = new Error(`网络响应错误: ${response.status}`);
            error.response = response;
            throw error;
        }
        
        const data = await response.json();
        let models = [];
        
        if (data.data) {
            models = data.data.map(e => e.id);
        }
        
        const currentVal = modelSelect ? modelSelect.value : '';
        
        if (modelSelect) {
            modelSelect.innerHTML = '';
            if (models.length > 0) {
                models.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m;
                    opt.textContent = m;
                    modelSelect.appendChild(opt);
                });
                
                if (models.includes(currentVal)) {
                    modelSelect.value = currentVal;
                } else if (db.forumApiSettings && db.forumApiSettings.model && models.includes(db.forumApiSettings.model)) {
                    modelSelect.value = db.forumApiSettings.model;
                }
                
                showToast(`成功拉取 ${models.length} 个模型`);
            } else {
                modelSelect.innerHTML = '<option value="">未找到可用模型</option>';
                showToast('未找到可用模型');
            }
        }
        
    } catch (error) {
        console.error('拉取模型失败:', error);
        showToast('拉取模型失败: ' + (error.message || '未知错误'));
        if (modelSelect) {
            modelSelect.innerHTML = '<option value="">拉取失败</option>';
        }
    } finally {
        if (fetchBtn) {
            fetchBtn.classList.remove('loading');
            fetchBtn.disabled = false;
        }
    }
}

function forumLoadProfile() {
    forumInitUserProfile();
    const p = db.forumUserProfile;
    const nameEl = document.getElementById('forum-user-name-display');
    const avatarEl = document.getElementById('forum-user-avatar-display');
    const usernameInput = document.getElementById('forum-username-input');
    const bioInput = document.getElementById('forum-bio-input');
    if (nameEl) nameEl.textContent = p.username || '未设置昵称';
    if (avatarEl) avatarEl.src = p.avatar || 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg';
    if (usernameInput) usernameInput.value = p.username || '';
    if (bioInput) bioInput.value = p.bio || '';
    const stats = forumGetUserStats();
    const postsCountEl = document.getElementById('user-posts-count');
    const commentsCountEl = document.getElementById('user-comments-count');
    const likesCountEl = document.getElementById('user-likes-count');
    if (postsCountEl) postsCountEl.textContent = stats.posts;
    if (commentsCountEl) commentsCountEl.textContent = stats.comments;
    if (likesCountEl) likesCountEl.textContent = stats.likes;
}

function forumSaveProfile() {
    const usernameInput = document.getElementById('forum-username-input');
    const bioInput = document.getElementById('forum-bio-input');
    const username = usernameInput && usernameInput.value.trim();
    if (!username) { showToast('昵称不能为空'); return; }
    forumInitUserProfile();
    db.forumUserProfile.username = username;
    db.forumUserProfile.bio = (bioInput && bioInput.value) || '';
    saveData();
    showToast('资料已保存');
}

function forumBindNewEvents() {
    document.getElementById('create-post-fab') && document.getElementById('create-post-fab').addEventListener('click', () => { document.getElementById('create-forum-post-modal').classList.add('visible'); });
    document.getElementById('create-forum-post-form') && document.getElementById('create-forum-post-form').addEventListener('submit', function(e) { e.preventDefault(); forumPublishPost(); });
    document.getElementById('cancel-forum-post-btn') && document.getElementById('cancel-forum-post-btn').addEventListener('click', () => { document.getElementById('create-forum-post-modal').classList.remove('visible'); });

    document.getElementById('forum-settings-btn') && document.getElementById('forum-settings-btn').addEventListener('click', () => { switchScreen('forum-settings-screen'); forumLoadSettings(); });
    document.getElementById('save-forum-settings-btn') && document.getElementById('save-forum-settings-btn').addEventListener('click', forumSaveSettings);
    document.getElementById('forum-goto-profile-btn') && document.getElementById('forum-goto-profile-btn').addEventListener('click', () => { switchScreen('forum-profile-screen'); forumLoadProfile(); });

    document.getElementById('forum-dm-btn') && document.getElementById('forum-dm-btn').addEventListener('click', () => { switchScreen('forum-dm-list-screen'); forumRenderDMList(); });

    document.getElementById('forum-post-delete-btn') && document.getElementById('forum-post-delete-btn').addEventListener('click', forumTogglePostDeleteMode);
    document.getElementById('forum-post-select-all-btn') && document.getElementById('forum-post-select-all-btn').addEventListener('click', forumPostSelectAll);
    document.getElementById('forum-post-delete-selected-btn') && document.getElementById('forum-post-delete-selected-btn').addEventListener('click', forumPostDeleteSelected);
    document.getElementById('forum-post-cancel-delete-btn') && document.getElementById('forum-post-cancel-delete-btn').addEventListener('click', forumPostCancelDeleteMode);

    document.getElementById('save-forum-profile-btn') && document.getElementById('save-forum-profile-btn').addEventListener('click', () => { forumSaveProfile(); switchScreen('forum-screen'); });
    document.getElementById('forum-profile-screen') && document.getElementById('forum-profile-screen').addEventListener('click', function(e) {
        if (e.target.id === 'forum-user-avatar-display' || e.target.closest('#forum-user-avatar-display')) document.getElementById('forum-avatar-upload').click();
    });
    document.getElementById('forum-avatar-upload') && document.getElementById('forum-avatar-upload').addEventListener('change', function(e) {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = function() { forumInitUserProfile(); db.forumUserProfile.avatar = reader.result; saveData(); const el = document.getElementById('forum-user-avatar-display'); if (el) el.src = reader.result; };
        reader.readAsDataURL(f);
        e.target.value = '';
    });

    const dmList = document.getElementById('forum-dm-list-container');
    if (dmList) dmList.addEventListener('click', function(e) {
        const item = e.target.closest('.forum-dm-item[data-user-id]');
        if (!item) return;
        if (forumDMListDeleteMode) {
            var id = item.dataset.userId;
            if (forumDMSelectedUserIds.has(id)) forumDMSelectedUserIds.delete(id);
            else forumDMSelectedUserIds.add(id);
            forumRenderDMList();
        } else {
            forumOpenDMConversation(item.dataset.userId, item.dataset.userName || '');
        }
    });
    document.getElementById('forum-dm-list-settings-btn') && document.getElementById('forum-dm-list-settings-btn').addEventListener('click', forumOpenDMSettingsModal);
    document.getElementById('forum-dm-list-refresh-btn') && document.getElementById('forum-dm-list-refresh-btn').addEventListener('click', forumGenerateStrangerDMs);
    document.getElementById('forum-dm-list-delete-btn') && document.getElementById('forum-dm-list-delete-btn').addEventListener('click', forumToggleDMListDeleteMode);
    document.getElementById('forum-dm-select-all-btn') && document.getElementById('forum-dm-select-all-btn').addEventListener('click', forumDMSelectAll);
    document.getElementById('forum-dm-delete-selected-btn') && document.getElementById('forum-dm-delete-selected-btn').addEventListener('click', forumDMDeleteSelected);
    document.getElementById('forum-dm-cancel-delete-btn') && document.getElementById('forum-dm-cancel-delete-btn').addEventListener('click', forumDMCancelDeleteMode);

    document.getElementById('send-forum-dm-btn') && document.getElementById('send-forum-dm-btn').addEventListener('click', forumSendDM);
    document.getElementById('forum-dm-input') && document.getElementById('forum-dm-input').addEventListener('keypress', function(e) { if (e.key === 'Enter') forumSendDM(); });
    document.getElementById('ai-reply-dm-btn') && document.getElementById('ai-reply-dm-btn').addEventListener('click', forumGenerateAIDMReply);
    document.getElementById('forum-dm-add-friend-btn') && document.getElementById('forum-dm-add-friend-btn').addEventListener('click', forumDMRequestAddFriend);
    document.getElementById('forum-friend-request-accept-btn') && document.getElementById('forum-friend-request-accept-btn').addEventListener('click', forumAcceptFriendRequest);
    document.getElementById('forum-friend-request-reject-btn') && document.getElementById('forum-friend-request-reject-btn').addEventListener('click', forumRejectFriendRequest);
    document.getElementById('forum-dm-settings-close-btn') && document.getElementById('forum-dm-settings-close-btn').addEventListener('click', forumCloseDMSettingsModal);
    const forumDmSettingsModal = document.getElementById('forum-dm-settings-modal');
    if (forumDmSettingsModal) forumDmSettingsModal.addEventListener('click', function(e) { if (e.target === forumDmSettingsModal) forumCloseDMSettingsModal(); });
    // 从私信对话页返回列表时刷新列表与未读角标，避免红点不消失
    var dmConversationBackBtn = document.querySelector('#forum-dm-conversation-screen .back-btn[data-target="forum-dm-list-screen"]');
    if (dmConversationBackBtn) dmConversationBackBtn.addEventListener('click', function() { forumRenderDMList(); forumUpdateDMUnreadBadge(); });
    
    setupForumDMMessageAreaLongPress();
    setupForumDMEditModal();
    
    const filterTabs = document.querySelectorAll('.forum-filter-tab');
    filterTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            filterTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            const filter = this.dataset.filter;
            renderForumPosts(db.forumPosts, filter);
        });
    });
}

function forumGetDMUserList() {
    const users = new Map();
    (db.forumMessages || []).forEach(m => {
        const other = m.fromUserId === 'user' ? m.toUserId : m.fromUserId;
        if (other && other !== 'user') {
            var profile = getForumStrangerProfile(other);
            var displayName = (profile && profile.name) ? profile.name : other.replace(/^npc_/, '');
            users.set(other, { id: other, name: displayName });
        }
    });
    return Array.from(users.values());
}

function forumToggleDMListDeleteMode() {
    if (forumDMListDeleteMode) return;
    forumDMListDeleteMode = true;
    forumDMSelectedUserIds.clear();
    var toolbar = document.getElementById('forum-dm-delete-toolbar');
    if (toolbar) toolbar.style.display = 'flex';
    var deleteBtn = document.getElementById('forum-dm-list-delete-btn');
    if (deleteBtn) deleteBtn.style.display = 'none';
    forumRenderDMList();
}

function forumDMSelectAll() {
    var users = forumGetDMUserList();
    forumDMSelectedUserIds.clear();
    users.forEach(function(u) { forumDMSelectedUserIds.add(u.id); });
    forumRenderDMList();
}

function forumDMDeleteSelected() {
    if (forumDMSelectedUserIds.size === 0) { showToast('请先选择要删除的对话'); return; }
    if (!confirm('确定要删除选中的 ' + forumDMSelectedUserIds.size + ' 个对话吗？该对话下的所有私信将被删除。')) return;
    if (!db.forumMessages) db.forumMessages = [];
    db.forumMessages = db.forumMessages.filter(function(m) {
        var other = m.fromUserId === 'user' ? m.toUserId : m.fromUserId;
        return !forumDMSelectedUserIds.has(other);
    });
    saveData();
    forumDMSelectedUserIds.clear();
    forumDMListDeleteMode = false;
    var toolbar = document.getElementById('forum-dm-delete-toolbar');
    if (toolbar) toolbar.style.display = 'none';
    var deleteBtn = document.getElementById('forum-dm-list-delete-btn');
    if (deleteBtn) deleteBtn.style.display = '';
    forumRenderDMList();
    showToast('已删除选中对话');
}

function forumDMCancelDeleteMode() {
    forumDMListDeleteMode = false;
    forumDMSelectedUserIds.clear();
    var toolbar = document.getElementById('forum-dm-delete-toolbar');
    if (toolbar) toolbar.style.display = 'none';
    var deleteBtn = document.getElementById('forum-dm-list-delete-btn');
    if (deleteBtn) deleteBtn.style.display = '';
    forumRenderDMList();
}

function forumRenderDMList() {
    const list = document.getElementById('forum-dm-list-container');
    if (!list) return;
    const users = forumGetDMUserList();
    list.innerHTML = '';
    if (users.length === 0) { list.innerHTML = '<li class="placeholder-text" style="padding:20px;">暂无私信对话</li>'; return; }
    
    const defaultAvatarUrl = 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg';
    const npcColors = ["#FFB6C1", "#87CEFA", "#98FB98", "#F0E68C", "#DDA0DD", "#FFDAB9", "#B0E0E6"];
    const getRandomColor = () => npcColors[Math.floor(Math.random() * npcColors.length)];
    
    users.forEach(u => {
        const conv = (db.forumMessages || []).filter(m => (m.fromUserId === 'user' && m.toUserId === u.id) || (m.fromUserId === u.id && m.toUserId === 'user'));
        const last = conv[conv.length - 1];
        const unread = (db.forumMessages || []).filter(m => m.toUserId === 'user' && m.fromUserId === u.id && !m.isRead).length;
        
        const firstChar = (u.name || '').charAt(0).toUpperCase() || '?';
        const avatarColor = getRandomColor();
        
        const li = document.createElement('li');
        li.className = 'forum-dm-item';
        if (forumDMListDeleteMode) {
            li.classList.add('dm-delete-mode');
            if (forumDMSelectedUserIds.has(u.id)) li.classList.add('dm-selected');
        }
        li.dataset.userId = u.id;
        li.dataset.userName = u.name;
        
        const checkboxHtml = forumDMListDeleteMode ? '<div class="dm-select-checkbox"></div>' : '';
        li.innerHTML = checkboxHtml + `
            <div class="dm-avatar" style="width:48px;height:48px;border-radius:50%;background:${avatarColor};color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:600;flex-shrink:0;">${firstChar}</div>
            <div class="dm-info">
                <div class="dm-name">${u.name || u.id}</div>
                <div class="dm-last-message">${last ? (last.fromUserId === 'user' ? '我: ' : '') + (last.content || '').substring(0, 30) : '暂无消息'}</div>
            </div>
            ${unread > 0 ? `<span class="dm-unread-badge">${unread}</span>` : ''}
        `;
        
        list.appendChild(li);
    });
}

var forumCurrentDMUserId = null;
var forumDMLongPressTimer = null;
var forumCommentLongPressTimer = null;
var forumReplyTarget = null; // { commentId, username, content } 当前回复目标
var editingForumDMId = null;
var forumDMListDeleteMode = false;
var forumDMSelectedUserIds = new Set();
var forumPendingFriendRequest = null;
var forumPostDeleteMode = false;
var forumSelectedPostIds = new Set();

var FORUM_DEFAULT_AVATAR = 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg';

function forumHasPendingFriendRequestFromUser(npcUserId) {
    if (!db.forumPendingRequestFromUser || typeof db.forumPendingRequestFromUser !== 'object') return false;
    return !!db.forumPendingRequestFromUser[npcUserId];
}
function forumSetPendingFriendRequestFromUser(npcUserId, value) {
    if (!db.forumPendingRequestFromUser || typeof db.forumPendingRequestFromUser !== 'object') db.forumPendingRequestFromUser = {};
    if (value) db.forumPendingRequestFromUser[npcUserId] = true; else delete db.forumPendingRequestFromUser[npcUserId];
    saveData();
}

function getForumStrangerProfile(userId) {
    if (!db.forumStrangerProfiles) return null;
    return db.forumStrangerProfiles[userId] || null;
}

function forumIsFriend(userId) {
    return (db.characters || []).some(function(c) { return c.source === 'forum' && c.forumUserId === userId; });
}

function forumOpenDMConversation(userId, userName, commentContext) {
    forumCurrentDMUserId = userId;
    forumMarkDMRead(userId);
    forumUpdateDMUnreadBadge();
    document.getElementById('forum-dm-conversation-title').textContent = userName || userId || '私信';
    
    // 如果从评论进入且没有历史消息，注入评论上下文作为第一条系统消息
    if (commentContext && commentContext.commentContent) {
        const existingMsgs = (db.forumMessages || []).filter(m => (m.fromUserId === 'user' && m.toUserId === userId) || (m.fromUserId === userId && m.toUserId === 'user'));
        if (existingMsgs.length === 0) {
            if (!db.forumMessages) db.forumMessages = [];
            db.forumMessages.push({
                id: 'dm_ctx_' + Date.now(),
                fromUserId: 'user',
                toUserId: userId,
                content: '（来自帖子「' + (commentContext.postTitle || '') + '」你的评论：' + commentContext.commentContent + '）',
                timestamp: Date.now(),
                isRead: true,
                isCommentContext: true
            });
            saveData();
        }
    }
    
    forumRenderDMConversation(userId);
    var addFriendBtn = document.getElementById('forum-dm-add-friend-btn');
    if (addFriendBtn) {
        var profile = getForumStrangerProfile(userId);
        var isFriend = forumIsFriend(userId);
        addFriendBtn.style.display = (profile && !isFriend) ? '' : 'none';
    }
    switchScreen('forum-dm-conversation-screen');
}

function forumOpenDMSettingsModal() {
    if (!db.forumSettings) db.forumSettings = {};
    var cb = document.getElementById('forum-dm-generate-detailed-stranger');
    if (cb) cb.checked = !!db.forumSettings.generateDetailedStranger;
    var modal = document.getElementById('forum-dm-settings-modal');
    if (modal) modal.classList.add('visible');
}

function forumCloseDMSettingsModal() {
    var cb = document.getElementById('forum-dm-generate-detailed-stranger');
    if (cb && db.forumSettings) {
        db.forumSettings.generateDetailedStranger = !!cb.checked;
        saveData();
    }
    var modal = document.getElementById('forum-dm-settings-modal');
    if (modal) modal.classList.remove('visible');
}

function forumAddForumNPCAsCharacter(profile, userId) {
    if (!db.characters) db.characters = [];
    forumInitUserProfile();
    var fp = db.forumUserProfile;
    var name = profile.name || userId.replace(/^npc_/, '');
    var charId = 'forum_friend_' + userId + '_' + Date.now();
    var newChar = {
        id: charId,
        realName: name,
        remarkName: name,
        avatar: (profile.avatar && profile.avatar.trim()) ? profile.avatar : FORUM_DEFAULT_AVATAR,
        persona: profile.basicPersona || '',
        source: 'forum',
        forumUserId: userId,
        history: [],
        supplementPersonaEnabled: false,
        supplementPersonaAiEnabled: false,
        supplementPersonaText: '',
        myName: fp.username || fp.myName || '用户',
        myAvatar: (fp.avatar && fp.avatar.trim()) ? fp.avatar : FORUM_DEFAULT_AVATAR,
        myPersona: fp.bio || fp.myPersona || ''
    };
    if (profile.linkedCharId) newChar.linkedCharId = profile.linkedCharId;
    db.characters.push(newChar);
    saveData();
    if (typeof renderChatList === 'function') renderChatList();
    if (typeof renderContactList === 'function') renderContactList();
    return newChar;
}

function forumShowFriendRequestModal(request) {
    forumPendingFriendRequest = request;
    document.getElementById('forum-friend-request-avatar').src = (request.fromAvatar && request.fromAvatar.trim()) ? request.fromAvatar : FORUM_DEFAULT_AVATAR;
    document.getElementById('forum-friend-request-name').textContent = request.fromName || request.fromUserId.replace(/^npc_/, '');
    document.getElementById('forum-friend-request-modal').classList.add('visible');
}

function forumAcceptFriendRequest() {
    if (!forumPendingFriendRequest) return;
    var profile = getForumStrangerProfile(forumPendingFriendRequest.fromUserId);
    if (!profile) profile = { name: forumPendingFriendRequest.fromName || forumPendingFriendRequest.fromUserId.replace(/^npc_/, ''), avatar: forumPendingFriendRequest.fromAvatar, basicPersona: '' };
    forumAddForumNPCAsCharacter(profile, forumPendingFriendRequest.fromUserId);
    document.getElementById('forum-friend-request-modal').classList.remove('visible');
    forumPendingFriendRequest = null;
    showToast('已添加为好友');
}

function forumRejectFriendRequest() {
    document.getElementById('forum-friend-request-modal').classList.remove('visible');
    forumPendingFriendRequest = null;
}

function forumDMRequestAddFriend() {
    if (!forumCurrentDMUserId) return;
    var profile = getForumStrangerProfile(forumCurrentDMUserId);
    if (!profile) { showToast('该陌生人暂无详细人设'); return; }
    if (forumIsFriend(forumCurrentDMUserId)) { showToast('已经是好友了'); return; }
    if (forumHasPendingFriendRequestFromUser(forumCurrentDMUserId)) { showToast('已发送过好友申请，等待对方回复'); return; }
    forumSetPendingFriendRequestFromUser(forumCurrentDMUserId, true);
    showToast('已发送好友申请，等待对方回复');
}

function forumMarkDMRead(userId) {
    if (!db.forumMessages) return;
    db.forumMessages.forEach(m => { if (m.toUserId === 'user' && m.fromUserId === userId) m.isRead = true; });
    saveData();
}

function forumRenderDMConversation(userId) {
    const area = document.getElementById('forum-dm-message-area');
    if (!area) return;
    
    const messages = (db.forumMessages || []).filter(m => (m.fromUserId === 'user' && m.toUserId === userId) || (m.fromUserId === userId && m.toUserId === 'user')).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    
    area.innerHTML = '';
    
    forumInitUserProfile();
    const activeAccount = forumGetActiveAccount();
    const userAvatar = (activeAccount.avatar && activeAccount.avatar.trim()) ? activeAccount.avatar : FORUM_DEFAULT_AVATAR;
    
    const npcColors = ["#FFB6C1", "#87CEFA", "#98FB98", "#F0E68C", "#DDA0DD", "#FFDAB9", "#B0E0E6"];
    const getStableColor = (id) => {
        var h = 0;
        for (var i = 0; i < (id || '').length; i++) h = (h * 31 + (id.charCodeAt(i) || 0)) >>> 0;
        return npcColors[h % npcColors.length];
    };
    const npcName = userId.replace(/^npc_/, '');
    const npcProfile = getForumStrangerProfile(userId);
    const npcDisplayName = (npcProfile && npcProfile.name) ? npcProfile.name : npcName;
    const npcFirstChar = (npcDisplayName || '').charAt(0).toUpperCase() || '?';
    const npcColor = getStableColor(userId);
    
    messages.forEach(m => {
        if (m.isCommentContext) return; // 系统上下文消息不显示
        const isUser = m.fromUserId === 'user';
        const div = document.createElement('div');
        div.className = isUser ? 'dm-message dm-message-user' : 'dm-message dm-message-npc';
        div.dataset.id = m.id || '';
        
        const avatarHtml = isUser 
            ? `<img src="${userAvatar}" class="dm-message-avatar" alt="我" />`
            : `<div class="dm-message-avatar" style="width:40px;height:40px;min-width:40px;border-radius:50%;background:${npcColor};color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:600;">${npcFirstChar}</div>`;
        
        const bubble = document.createElement('div');
        bubble.className = 'dm-message-bubble';
        bubble.textContent = m.content || '';
        
        if (isUser) {
            div.innerHTML = avatarHtml;
            div.appendChild(bubble);
        } else {
            div.innerHTML = avatarHtml;
            div.appendChild(bubble);
        }
        
        area.appendChild(div);
    });
    
    area.scrollTop = area.scrollHeight;
}

function setupForumDMMessageAreaLongPress() {
    const area = document.getElementById('forum-dm-message-area');
    if (!area) return;
    area.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        const msgEl = e.target.closest('.dm-message');
        if (!msgEl || !msgEl.dataset.id) return;
        forumDMHandleLongPress(msgEl, e.clientX, e.clientY);
    });
    area.addEventListener('touchstart', function(e) {
        const msgEl = e.target.closest('.dm-message');
        if (!msgEl || !msgEl.dataset.id) return;
        forumDMLongPressTimer = setTimeout(function() {
            const t = e.touches[0];
            forumDMHandleLongPress(msgEl, t.clientX, t.clientY);
        }, 400);
    });
    area.addEventListener('touchend', function() { clearTimeout(forumDMLongPressTimer); });
    area.addEventListener('touchmove', function() { clearTimeout(forumDMLongPressTimer); });
}

function forumDMHandleLongPress(domMessage, x, y) {
    const msgId = domMessage.dataset.id;
    const menuItems = [
        { label: '编辑', action: function() { openForumDMEditModal(msgId); } },
        { label: '删除', action: function() { deleteForumDMMessage(msgId); }, danger: true }
    ];
    if (typeof triggerHapticFeedback === 'function') triggerHapticFeedback('medium');
    createContextMenu(menuItems, x, y);
}

function openForumDMEditModal(msgId) {
    if (!db.forumMessages) return;
    const msg = db.forumMessages.find(function(m) { return m.id === msgId; });
    if (!msg) return;
    editingForumDMId = msgId;
    const ta = document.getElementById('forum-dm-edit-textarea');
    const modal = document.getElementById('forum-dm-edit-modal');
    if (ta) ta.value = msg.content || '';
    if (modal) modal.classList.add('visible');
    if (ta) ta.focus();
}

function setupForumDMEditModal() {
    var form = document.getElementById('forum-dm-edit-form');
    var cancelBtn = document.getElementById('forum-dm-edit-cancel-btn');
    var deleteBtn = document.getElementById('forum-dm-edit-delete-btn');
    if (form) form.addEventListener('submit', function(e) { e.preventDefault(); saveForumDMEdit(); });
    if (cancelBtn) cancelBtn.addEventListener('click', function() {
        document.getElementById('forum-dm-edit-modal').classList.remove('visible');
        editingForumDMId = null;
    });
    if (deleteBtn) deleteBtn.addEventListener('click', function() {
        if (confirm('确定要删除这条私信吗？')) deleteForumDMMessage(editingForumDMId);
    });
}

function saveForumDMEdit() {
    if (!editingForumDMId) return;
    var content = (document.getElementById('forum-dm-edit-textarea') && document.getElementById('forum-dm-edit-textarea').value || '').trim();
    var msg = db.forumMessages && db.forumMessages.find(function(m) { return m.id === editingForumDMId; });
    if (msg) {
        msg.content = content;
        saveData();
        if (forumCurrentDMUserId) forumRenderDMConversation(forumCurrentDMUserId);
        document.getElementById('forum-dm-edit-modal').classList.remove('visible');
        showToast('私信已更新');
    }
    editingForumDMId = null;
}

function deleteForumDMMessage(msgId) {
    if (!msgId || !db.forumMessages) return;
    db.forumMessages = db.forumMessages.filter(function(m) { return m.id !== msgId; });
    saveData();
    if (forumCurrentDMUserId) forumRenderDMConversation(forumCurrentDMUserId);
    var modal = document.getElementById('forum-dm-edit-modal');
    if (modal) modal.classList.remove('visible');
    editingForumDMId = null;
    showToast('私信已删除');
}

function forumSendDM() {
    if (!forumCurrentDMUserId) return;
    const input = document.getElementById('forum-dm-input');
    const content = (input && input.value || '').trim();
    if (!content) return;
    if (!db.forumMessages) db.forumMessages = [];
    db.forumMessages.push({ id: 'dm_' + Date.now(), fromUserId: 'user', toUserId: forumCurrentDMUserId, content: content, timestamp: Date.now(), isRead: false });
    saveData();
    if (input) input.value = '';
    forumRenderDMConversation(forumCurrentDMUserId);
}

function forumUpdateDMUnreadBadge() {
    const btn = document.getElementById('forum-dm-btn');
    if (!btn) return;
    const n = (db.forumMessages || []).filter(m => m.toUserId === 'user' && !m.isRead).length;
    let badge = btn.querySelector('.forum-dm-badge');
    if (n > 0) {
        if (!badge) { badge = document.createElement('span'); badge.className = 'forum-dm-badge'; badge.style.cssText = 'position:absolute;top:-4px;right:-4px;background:#ff4757;color:#fff;font-size:10px;padding:2px 5px;border-radius:10px;'; btn.style.position = 'relative'; btn.appendChild(badge); }
        badge.textContent = n > 99 ? '99+' : n;
    } else if (badge) badge.remove();
}

async function forumGenerateStrangerDMs() {
    const forumApiSettings = db.forumApiSettings || {};
    var apiSettings = forumApiSettings.useForumApi ? forumApiSettings : db.apiSettings;
    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) {
        showToast('请先配置API设置');
        return;
    }
    var refreshBtn = document.getElementById('forum-dm-list-refresh-btn');
    if (refreshBtn) refreshBtn.disabled = true;
    showToast('正在生成陌生人私信...');
    try {
        forumInitUserProfile();
        var activeAccount = forumGetActiveAccount();
        var worldContext = getForumGenerationContext();
        var userPosts = (db.forumPosts || []).filter(function(p) { return p.authorId === 'user' || (p.authorId && p.authorId.startsWith('alt_')); });
        var userPostsText = '';
        if (userPosts.length === 0) {
            userPostsText = '用户暂无发帖记录。';
        } else {
            userPosts.slice(0, 5).forEach(function(p, i) {
                userPostsText += '【帖子' + (i + 1) + '】\n标题: ' + (p.title || '') + '\n内容: ' + (p.content || '') + '\n\n';
            });
        }
        // 收集用户在其他帖子下的评论/回复（被这些发言吸引的人也可能来私信）
        var userCommentsList = [];
        (db.forumPosts || []).forEach(function(p) {
            if (!p.comments) return;
            p.comments.forEach(function(c) {
            if ((c.authorId === 'user' || (c.authorId && c.authorId.startsWith('alt_'))) && (c.content || '').trim()) {
                    userCommentsList.push({ postTitle: p.title || '(无标题)', postContent: (p.content || '').slice(0, 80), comment: (c.content || '').trim() });
                }
            });
        });
        var userCommentsText = '';
        if (userCommentsList.length === 0) {
            userCommentsText = '用户暂无在其他帖子下的评论或回复。';
        } else {
            userCommentsList.slice(0, 10).forEach(function(item, i) {
                userCommentsText += '【评论' + (i + 1) + '】在帖子《' + item.postTitle + '》下的回复：' + item.comment + '\n\n';
            });
        }
        var strangerCount = (db.forumSettings && db.forumSettings.dmPerGeneration != null) ? Math.max(1, Math.min(20, parseInt(db.forumSettings.dmPerGeneration, 10))) : 4;
        var generateDetailed = !!(db.forumSettings && db.forumSettings.generateDetailedStranger);
        var enableCharAlt = !!(db.forumSettings && db.forumSettings.enableCharAltDm);
        var charAltIds = (db.forumSettings && db.forumSettings.charAltCharIds) || [];
        var charAltNames = (db.forumSettings && db.forumSettings.charAltNames) || {};
        var charAltProb = (db.forumSettings && db.forumSettings.charAltProbability) != null ? Math.max(0, Math.min(100, db.forumSettings.charAltProbability)) : 25;
        var altCount = 0;
        if (enableCharAlt && charAltIds.length > 0) {
            altCount = Math.min(charAltIds.length, Math.max(0, Math.floor(strangerCount * charAltProb / 100)));
        }
        var normalCount = strangerCount - altCount;

        var jsonData = { dms: [] };
        if (normalCount > 0) {
            var systemPrompt;
            if (generateDetailed) {
                systemPrompt = '你是一位论坛私信模拟专家。根据以下背景信息，模拟「若干陌生人向用户发送私信」的场景，并为每个陌生人生成一份可聊天的基础人设。\n\n===== 世界观与设定 =====\n' + worldContext + '\n\n===== 用户（收件人）信息 =====\n昵称: ' + (activeAccount.username || '用户') + '\n简介: ' + (activeAccount.bio || '无') + '\n\n===== 用户发过的帖子 =====\n' + userPostsText + '\n===== 用户在其他帖子下的评论/回复 =====\n' + userCommentsText + '\n请生成 ' + normalCount + ' 条陌生人私信，且为每个陌生人生成基础人设。要求：\n1. 每条私信来自不同的NPC，senderName 为符合世界观的论坛昵称。\n2. 私信内容自然口语化，1～2 句话即可。\n3. 每个 NPC 的 basicPersona 必须包含：性别、性格（如开朗/冷淡/傲娇等）、大致家世或身份（如学生/上班族/家境等）、年龄或年龄段、与世界观的关系等，便于日后加好友聊天，不要纯人机感。用一两段话描述即可。\n4. 不要以用户视角创作，不要出现 char 的备注名等仅用户可见信息。\n\n请严格按以下 XML 标签格式返回，不要包含其它说明或 markdown：\n<dms>\n  <dm>\n    <senderName>NPC昵称</senderName>\n    <content>该陌生人发给用户的一条私信内容</content>\n    <basicPersona>性别、性格、家世/身份、年龄等基础人设描述，一两段话</basicPersona>\n  </dm>\n</dms>';
            } else {
                systemPrompt = '你是一位论坛私信模拟专家。根据以下背景信息，模拟「若干陌生人向用户发送私信」的场景。\n\n===== 世界观与设定 =====\n' + worldContext + '\n\n===== 用户（收件人）信息 =====\n昵称: ' + (activeAccount.username || '用户') + '\n简介: ' + (activeAccount.bio || '无') + '\n\n===== 用户发过的帖子 =====\n' + userPostsText + '\n===== 用户在其他帖子下的评论/回复 =====\n' + userCommentsText + '\n请生成 ' + normalCount + ' 条陌生人私信。要求：\n1. 每条私信来自不同的NPC（陌生人），senderName 为符合世界观的论坛昵称。\n2. 若用户发过帖或发过评论：私信内容可以是看到用户某篇帖子后的搭讪、提问、共鸣，也可以是看到用户在某条帖子下的回复/评论后被吸引来打招呼，语气自然、口语化。\n3. 若用户从未发帖也从未评论：私信可以是简单打招呼、自我介绍、或与世界观/社区氛围相关的一句闲聊。\n4. 每条私信 1～2 句话即可，像真实论坛私信。\n5. 不要以用户视角创作，不要出现 char 的备注名等仅用户可见信息。\n\n请严格按以下 XML 标签格式返回，不要包含其它说明或 markdown：\n<dms>\n  <dm>\n    <senderName>NPC昵称</senderName>\n    <content>该陌生人发给用户的一条私信内容</content>\n  </dm>\n</dms>';
            }
            var url = apiSettings.url;
            if (url.endsWith('/')) url = url.slice(0, -1);
            var temperature = apiSettings.temperature !== undefined ? apiSettings.temperature : 0.9;
            var requestBody = { model: apiSettings.model, messages: [{ role: 'user', content: systemPrompt }], temperature: temperature };
            var endpoint = url + '/v1/chat/completions';
            var headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiSettings.key };
            var contentStr = await fetchAiResponse(apiSettings, requestBody, headers, endpoint);
            
            var dmRegex = /<dm>([\s\S]*?)<\/dm>/g;
            var dmMatch;
            while ((dmMatch = dmRegex.exec(contentStr)) !== null) {
                var dmContent = dmMatch[1];
                var sMatch = dmContent.match(/<senderName>([\s\S]*?)<\/senderName>/);
                var cMatch = dmContent.match(/<content>([\s\S]*?)<\/content>/);
                var pMatch = dmContent.match(/<basicPersona>([\s\S]*?)<\/basicPersona>/);
                if (sMatch && cMatch) {
                    jsonData.dms.push({
                        senderName: sMatch[1].trim(),
                        content: cMatch[1].trim(),
                        basicPersona: pMatch ? pMatch[1].trim() : ''
                    });
                }
            }
            if (jsonData.dms.length === 0) throw new Error('AI返回的数据格式不正确');
        }

        if (jsonData.dms.length > 0 || altCount > 0) {
            if (!db.forumMessages) db.forumMessages = [];
            if (!db.forumStrangerProfiles) db.forumStrangerProfiles = {};
            var baseTime = Date.now();
            var offset = 0;
            jsonData.dms.forEach(function(dm, i) {
                var senderName = (dm.senderName || ('路人' + (i + 1))).trim().replace(/\s+/g, '_');
                if (!senderName) senderName = '路人' + (i + 1);
                var fromUserId = senderName.indexOf('npc_') === 0 ? senderName : 'npc_' + senderName;
                db.forumMessages.push({
                    id: 'dm_' + baseTime + '_' + i + '_' + Math.random(),
                    fromUserId: fromUserId,
                    toUserId: 'user',
                    content: (dm.content || '').trim() || '你好',
                    timestamp: baseTime + i,
                    isRead: false
                });
                if (generateDetailed && dm.basicPersona) {
                    db.forumStrangerProfiles[fromUserId] = {
                        name: senderName,
                        basicPersona: (dm.basicPersona || '').trim() || ('论坛用户，昵称：' + senderName),
                        avatar: (dm.avatar && dm.avatar.trim()) ? dm.avatar : FORUM_DEFAULT_AVATAR
                    };
                }
                offset = i + 1;
            });
            var altTemplates = ['你好呀，看到你的动态了～', '嗨，来打个招呼', '你好～', '看到你发的了，忍不住来聊两句'];
            var altNicknames = [];
            if (altCount > 0) {
                var fallbackAltNames = ['清风明月', '夜雨声烦', '星河', '柠檬不萌', '夏日微风', '云深不知处', '落叶知秋', '晨曦', '暗香', '浮生若梦', '陌上花开', '北城以念', '南巷清风', '西楼月', '东篱把酒'];
                try {
                    var url = apiSettings.url;
                    if (url.endsWith('/')) url = url.slice(0, -1);
                    var altPrompt = '你是一位论坛/社区模拟专家。根据以下世界观，生成 ' + altCount + ' 个「看起来像真实论坛用户」的论坛昵称。要求：\n1. 每个昵称 2～8 个字符，像普通人会起的网名（可文艺、可随意、可带符号感），符合该世界观的氛围。\n2. 不要出现「小号」「马甲」等字样，不要像内部 ID。\n3. ' + altCount + ' 个昵称彼此不重复。\n\n===== 世界观与设定 =====\n' + worldContext + '\n\n请严格按以下 XML 标签格式返回，不要包含其它说明或 markdown：\n<nicknames>\n  <nickname>昵称1</nickname>\n  <nickname>昵称2</nickname>\n</nicknames>';
                    var altRequestBody = { model: apiSettings.model, messages: [{ role: 'user', content: altPrompt }], temperature: 0.8 };
                    var altEndpoint = url + '/v1/chat/completions';
                    var altHeaders = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiSettings.key };
                    var altContentStr = await fetchAiResponse(apiSettings, altRequestBody, altHeaders, altEndpoint);
                    
                    var nickRegex = /<nickname>([\s\S]*?)<\/nickname>/g;
                    var nickMatch;
                    while ((nickMatch = nickRegex.exec(altContentStr)) !== null) {
                        var n = nickMatch[1].trim();
                        if (n) altNicknames.push(n.replace(/\s+/g, '_').slice(0, 20));
                    }
                    altNicknames = altNicknames.slice(0, altCount);
                } catch (e) { console.warn('生成角色小号昵称失败，使用备用昵称', e); }
                while (altNicknames.length < altCount) {
                    altNicknames.push(fallbackAltNames[(altNicknames.length + altCount) % fallbackAltNames.length] + (altNicknames.length > 0 ? '_' + altNicknames.length : ''));
                }
            }
            for (var a = 0; a < altCount; a++) {
                var charId = charAltIds[a % charAltIds.length];
                var mainChar = db.characters && db.characters.find(function(c) { return c.id === charId; });
                if (!mainChar) continue;
                var customName = (charAltNames[charId] || '').trim();
                var altDisplayName = customName ? customName.replace(/\s+/g, '_').slice(0, 20) : ((altNicknames[a] || fallbackAltNames[a % fallbackAltNames.length]).trim().replace(/\s+/g, '_') || ('路人' + (offset + a + 1)));
                var fromUserId = 'npc_alt_' + charId + '_' + baseTime + '_' + a;
                db.forumMessages.push({
                    id: 'dm_' + baseTime + '_alt_' + a + '_' + Math.random(),
                    fromUserId: fromUserId,
                    toUserId: 'user',
                    content: altTemplates[a % altTemplates.length],
                    timestamp: baseTime + offset + a,
                    isRead: false
                });
                db.forumStrangerProfiles[fromUserId] = {
                    name: altDisplayName,
                    basicPersona: (mainChar.persona || '').trim() || ('论坛用户，昵称：' + altDisplayName),
                    avatar: FORUM_DEFAULT_AVATAR,
                    linkedCharId: charId
                };
            }
            await saveData();
            forumRenderDMList();
            forumUpdateDMUnreadBadge();
            var total = jsonData.dms.length + altCount;
            showToast('已生成 ' + total + ' 条陌生人私信' + (altCount > 0 ? '（含 ' + altCount + ' 条角色小号）' : ''));
        } else {
            throw new Error('AI返回的数据格式不正确');
        }
    } catch (error) {
        console.error('生成陌生人私信失败:', error);
        showApiError(error);
    } finally {
        if (refreshBtn) refreshBtn.disabled = false;
    }
}

async function forumGenerateAIDMReply() {
    if (!forumCurrentDMUserId) {
        showToast('请先选择私信对象');
        return;
    }
    const targetUserId = forumCurrentDMUserId;
    
    const forumApiSettings = db.forumApiSettings || {};
    let apiSettings = forumApiSettings.useForumApi ? forumApiSettings : db.apiSettings;
    
    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) {
        showToast('请先配置API设置');
        return;
    }
    
    const aiReplyBtn = document.getElementById('ai-reply-dm-btn');
    
    if (aiReplyBtn) aiReplyBtn.disabled = true;
    showToast('AI正在生成回复...');
    
    try {
        const npcName = targetUserId.replace(/^npc_/, '');
        const npcPosts = (db.forumPosts || []).filter(p => p.username === npcName);
        const npcProfile = getForumStrangerProfile(targetUserId);
        
        const worldContext = getForumGenerationContext();
        
        let npcContext = `这是一个名叫"${npcName}"的论坛用户。`;
        if (npcProfile && npcProfile.basicPersona) {
            npcContext += `\n\n基础人设:\n${npcProfile.basicPersona}`;
        }
        if (npcPosts.length > 0) {
            npcContext += `\n\n以下是Ta发过的帖子:\n`;
            npcPosts.slice(0, 3).forEach(post => {
                npcContext += `标题: ${post.title}\n内容: ${post.content}\n\n`;
            });
        }
        
        // 注入该NPC在论坛中的评论上下文
        const npcComments = [];
        (db.forumPosts || []).forEach(p => {
            if (p.comments) {
                p.comments.forEach(c => {
                    if (c.username === npcName && c.authorId === 'npc') {
                        npcComments.push({ postTitle: p.title, content: c.content });
                    }
                });
            }
        });
        if (npcComments.length > 0) {
            npcContext += `\n\n以下是Ta在论坛中发过的评论:\n`;
            npcComments.slice(0, 5).forEach(c => {
                npcContext += `在帖子「${c.postTitle}」下评论: ${c.content}\n`;
            });
        }
        
        forumInitUserProfile();
        const activeAccount = forumGetActiveAccount();
        const userContext = activeAccount.isAlt
            ? `用户资料:\n昵称: ${activeAccount.username}\n简介: ${activeAccount.bio || '无'}\n（注意：这是一个你不认识的用户，你对Ta一无所知）`
            : `用户资料:\n昵称: ${activeAccount.username}\n简介: ${activeAccount.bio || '无'}`;
        
        const conversation = (db.forumMessages || [])
            .filter(m => (m.fromUserId === 'user' && m.toUserId === targetUserId) || 
                         (m.fromUserId === targetUserId && m.toUserId === 'user'))
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
            .slice(-10);
        
        let conversationText = '对话历史:\n';
        if (conversation.length > 0) {
            conversation.forEach(m => {
                const sender = m.fromUserId === 'user' ? activeAccount.username : npcName;
                conversationText += `${sender}: ${m.content}\n`;
            });
        } else {
            conversationText += '(这是第一次对话)\n';
        }
        
        const replyCount = (db.forumSettings && db.forumSettings.detailReplyCount) || 2;
        
        const systemPrompt = `你正在扮演论坛用户"${npcName}"，根据以下信息生成${replyCount}条连续的私信回复。

===== 世界观背景 =====
${worldContext}

===== 角色信息 =====
${npcContext}

===== 用户信息 =====
${userContext}

===== 对话历史 =====
${conversationText}

===== 好友状态（重要） =====
当前是否已是好友：${forumIsFriend(targetUserId) ? '是' : '否'}。
用户是否已点击「添加好友」并发送了好友申请（等待你同意）：${forumHasPendingFriendRequestFromUser(targetUserId) ? '是' : '否'}。
- 若用户**已发送**好友申请：请在本轮回复中表示同意加好友（如「好呀」「通过啦」等），系统会在本轮后自动加为好友。
- 若用户**尚未发送**好友申请（只是聊天里说想加好友）：请勿说「通过了」「已同意」等，应说「好呀，你点一下右上角添加好友吧」或「好呀，你加我还是我加你？」引导用户去点按钮发送申请。

请以"${npcName}"的口吻和风格，根据世界观设定、Ta发过的帖子内容和人设，生成${replyCount}条自然、符合角色性格的私信回复。回复应该简短自然，就像真实的私信对话一样，可以分多条发送，每条独立表达一个想法或情绪。

【关于加好友的极度慎重规则】
是否提出加好友，必须**极其慎重地根据你的人设性格以及当前聊天的深度来决定**：
1. 若你的性格偏内向、谨慎、高冷、防备心重，或者目前只是初次搭讪、聊得还不深（低于10个回合），**绝对不要**轻易提出加好友。
2. 若你是伪装身份的“角色小号”，更应注重伪装和试探，把加好友当作一个比较重大的决定，不要因过于主动而暴露破绽。
3. 只有当你的性格极度开朗自来熟，或者双方已经聊得非常投机、有明确继续深入交往的必要时，才能在回复中自然地表达加好友意愿（例如："我们要不要加个好友？"），并在JSON中设置 "suggestFriend": true；否则，请务必设置 "suggestFriend": false。

返回XML标签格式:
<result>
  <replies>
    <reply>第一条回复内容</reply>
    <reply>第二条回复内容</reply>
  </replies>
  <suggestFriend>false</suggestFriend>
</result>
`;
        
        let url = apiSettings.url;
        if (url.endsWith('/')) url = url.slice(0, -1);
        
        const temperature = apiSettings.temperature !== undefined ? apiSettings.temperature : 0.9;
        
        const requestBody = {
            model: apiSettings.model,
            messages: [{ role: "user", content: systemPrompt }],
            temperature: temperature
        };
        
        const endpoint = `${url}/v1/chat/completions`;
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiSettings.key}` };
        
        const contentStr = await fetchAiResponse(apiSettings, requestBody, headers, endpoint);
        
        const replies = [];
        const replyRegex = /<reply>([\s\S]*?)<\/reply>/g;
        let replyMatch;
        while ((replyMatch = replyRegex.exec(contentStr)) !== null) {
            if (replyMatch[1].trim()) replies.push(replyMatch[1].trim());
        }
        
        const suggestFriendMatch = contentStr.match(/<suggestFriend>([\s\S]*?)<\/suggestFriend>/i);
        const suggestFriend = suggestFriendMatch ? suggestFriendMatch[1].trim().toLowerCase() === 'true' : false;
        
        if (replies.length > 0) {
            if (!db.forumMessages) db.forumMessages = [];
            
            replies.forEach((replyContent, index) => {
                const newMessage = {
                    id: 'dm_' + Date.now() + '_' + Math.random(),
                    fromUserId: targetUserId,
                    toUserId: 'user',
                    content: (replyContent && replyContent.trim) ? replyContent.trim() : String(replyContent),
                    timestamp: Date.now() + index,
                    isRead: true
                };
                db.forumMessages.push(newMessage);
            });
            
            await saveData();
            if (forumCurrentDMUserId === targetUserId) forumRenderDMConversation(targetUserId);
            showToast(`${npcName}发来了${replies.length}条消息`);
            
            if (forumHasPendingFriendRequestFromUser(targetUserId)) {
                const profile = getForumStrangerProfile(targetUserId) || { name: npcName, avatar: '', basicPersona: '' };
                forumAddForumNPCAsCharacter(profile, targetUserId);
                forumSetPendingFriendRequestFromUser(targetUserId, false);
                showToast('已加为好友');
                var addFriendBtn = document.getElementById('forum-dm-add-friend-btn');
                if (addFriendBtn) { addFriendBtn.style.display = 'none'; }
            } else if (suggestFriend && !forumIsFriend(targetUserId)) {
                const profile = getForumStrangerProfile(targetUserId) || {};
                forumShowFriendRequestModal({
                    fromUserId: targetUserId,
                    fromName: profile.name || npcName,
                    fromAvatar: (profile.avatar && profile.avatar.trim()) ? profile.avatar : FORUM_DEFAULT_AVATAR
                });
            }
        } else {
            throw new Error('AI返回的数据格式不正确');
        }
        
    } catch (error) {
        console.error('AI回复生成失败:', error);
        showApiError(error);
    } finally {
        if (aiReplyBtn) aiReplyBtn.disabled = false;
    }
}

async function forumGenerateAICommentReplies(postId) {
    const post = db.forumPosts.find(p => p.id === postId);
    if (!post) return;
    
    const forumApiSettings = db.forumApiSettings || {};
    let apiSettings = forumApiSettings.useForumApi ? forumApiSettings : db.apiSettings;
    
    if (!apiSettings.url || !apiSettings.key || !apiSettings.model) {
        showToast('请先配置API设置');
        return;
    }
    
    const aiReplyBtn = document.getElementById('ai-reply-comment-btn');
    if (aiReplyBtn) aiReplyBtn.disabled = true;
    showToast('AI正在生成评论...');
    
    try {
        const replyCount = (db.forumSettings && db.forumSettings.detailReplyCount) || 2;
        const context = getForumGenerationContext();
        
        let existingComments = '';
        let repliedNpcNames = [];
        if (post.comments && post.comments.length > 0) {
            existingComments = '现有评论:\n';
            post.comments.forEach(c => {
                const replyPrefix = c.replyTo ? `（回复 @${c.replyTo.username}）` : '';
                existingComments += `${c.username}${replyPrefix}: ${c.content}\n`;
                // 收集被用户回复过的NPC
                if (c.replyTo && (c.authorId === 'user' || (c.authorId && c.authorId.startsWith('alt_')))) {
                    if (!repliedNpcNames.includes(c.replyTo.username)) {
                        repliedNpcNames.push(c.replyTo.username);
                    }
                }
            });
        }
        
        let repliedNpcHint = '';
        if (repliedNpcNames.length > 0) {
            repliedNpcHint = `\n重要提示：用户回复了以下NPC的评论，这些NPC大概率会继续参与讨论，请确保至少有${Math.min(repliedNpcNames.length, replyCount)}个出现在新评论中：${repliedNpcNames.join('、')}。他们可以回应用户的回复，继续互动。\n`;
        }
        
        const systemPrompt = `你是一位论坛内容生成专家。
背景信息：
${context}

帖子信息：
标题: ${post.title}
内容: ${post.content}
作者: ${post.username}

${existingComments}
${repliedNpcHint}
请生成${replyCount}条不同视角的评论。每条评论要有独特的观点，可以互相回复或讨论。评论者都是NPC，要根据背景设定来回复。

返回XML标签格式:
<comments>
  <comment>
    <username>评论者昵称</username>
    <content>评论内容</content>
    <timestamp>刚刚</timestamp>
  </comment>
</comments>
`;
        
        let url = apiSettings.url;
        if (url.endsWith('/')) url = url.slice(0, -1);
        
        const temperature = apiSettings.temperature !== undefined ? apiSettings.temperature : 0.9;
        
        const requestBody = {
            model: apiSettings.model,
            messages: [{ role: "user", content: systemPrompt }],
            temperature: temperature
        };
        
        const endpoint = `${url}/v1/chat/completions`;
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiSettings.key}` };
        
        const contentStr = await fetchAiResponse(apiSettings, requestBody, headers, endpoint);
        
        const comments = [];
        const commentRegex = /<comment>([\s\S]*?)<\/comment>/g;
        let commentMatch;
        while ((commentMatch = commentRegex.exec(contentStr)) !== null) {
            const cContent = commentMatch[1];
            const uMatch = cContent.match(/<username>([\s\S]*?)<\/username>/);
            const textMatch = cContent.match(/<content>([\s\S]*?)<\/content>/);
            const timeMatch = cContent.match(/<timestamp>([\s\S]*?)<\/timestamp>/);
            if (uMatch && textMatch) {
                comments.push({
                    username: uMatch[1].trim(),
                    content: textMatch[1].trim(),
                    timestamp: timeMatch ? timeMatch[1].trim() : '刚刚'
                });
            }
        }
        
        if (comments.length > 0) {
            if (!post.comments) post.comments = [];
            
            comments.forEach(comment => {
                const newComment = {
                    id: 'comment_' + Date.now() + '_' + Math.random(),
                    authorId: 'npc',
                    username: comment.username || '路人' + Math.floor(100 + Math.random() * 900),
                    content: comment.content || '',
                    timestamp: comment.timestamp || '刚刚'
                };
                post.comments.push(newComment);
            });
            
            await saveData();
            renderPostDetail(post);
            showToast(`成功生成${comments.length}条AI评论`);
        }
        
    } catch (error) {
        console.error('AI评论生成失败:', error);
        showApiError(error);
    } finally {
        if (aiReplyBtn) aiReplyBtn.disabled = false;
    }
}

async function forumSupplementPersonaFromChat(chatId, character) {
    if (!character || (character.source !== 'forum' && character.source !== 'peek') || !character.supplementPersonaAiEnabled) return;
    var apiSettings = (db.supplementPersonaApiSettings && db.supplementPersonaApiSettings.url && db.supplementPersonaApiSettings.key && db.supplementPersonaApiSettings.model)
        ? db.supplementPersonaApiSettings
        : db.apiSettings;
    if (!apiSettings || !apiSettings.url || !apiSettings.key || !apiSettings.model) return;
    var history = character.history || [];
    var recent = history.slice(-8);
    if (recent.length === 0) return;
    var convText = recent.map(function(m) {
        var who = m.role === 'user' ? (character.myName || '用户') : character.realName;
        var content = (m.content || '').trim();
        if (m.parts && m.parts.length) content = m.parts.map(function(p) { return p.text || ''; }).join('').trim() || content;
        return who + ': ' + content;
    }).join('\n');
    var basePersona = (character.persona || '').slice(0, 500);
    var existingSupplement = (character.supplementPersonaText || '').slice(0, 800);
    var systemPrompt = '你是一个人设补充助手。请根据「最近对话」**只提取【该角色（NPC）在对话中向用户透露的、关于自己的信息】**，整理成简短的人设条目，用于补充该角色的人设档案。\n\n要求：\n- 只输出「关于这个角色我们新知道了什么」，例如：角色在对话里告诉用户「我叫小明」→ 补充「姓名：小明」；若提到喜好、经历、习惯、身份等，也按「条目：内容」格式补充。\n- 不要总结对话过程，不要写「用户说了…角色回答了…」，只写该角色的人设信息。\n- 若本轮对话中角色没有透露任何关于自己的新信息，则返回空。\n\n只返回 XML 标签格式：<supplement>姓名：xxx\n喜好：xxx\n...</supplement> 或 <supplement></supplement>。\n\n已有基础人设（节选）:\n' + basePersona + '\n\n已补齐人设（节选）:\n' + existingSupplement + '\n\n最近对话:\n' + convText;
    try {
        var url = apiSettings.url;
        if (url.endsWith('/')) url = url.slice(0, -1);
        var requestBody = { model: apiSettings.model, messages: [{ role: 'user', content: systemPrompt }], temperature: 0.3 };
        var contentStr = await fetchAiResponse(apiSettings, requestBody, { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiSettings.key }, url + '/v1/chat/completions');
        
        var suppMatch = contentStr.match(/<supplement>([\s\S]*?)<\/supplement>/);
        var supplement = suppMatch ? suppMatch[1].trim() : '';
        if (supplement) {
            character.supplementPersonaText = ((character.supplementPersonaText || '').trim() ? (character.supplementPersonaText || '').trim() + '\n\n' : '') + supplement;
            saveData();
        }
    } catch (e) { console.error('AI补齐人设提取失败', e); }
}
if (typeof window !== 'undefined') window.forumSupplementPersonaFromChat = forumSupplementPersonaFromChat;
