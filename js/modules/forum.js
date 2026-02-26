// --- 论坛功能 (js/modules/forum.js) ---

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

function renderPostDetail(post) {
    const detailScreen = document.getElementById('forum-post-detail-screen');
    if (!detailScreen || !post) return;

    const npcColors = ["#FFB6C1", "#87CEFA", "#98FB98", "#F0E68C", "#DDA0DD", "#FFDAB9", "#B0E0E6"];
    const getRandomColor = () => npcColors[Math.floor(Math.random() * npcColors.length)];

    let commentsHtml = '';
    if (post.comments && post.comments.length > 0) {
        post.comments.forEach(comment => {
            const firstChar = comment.username.charAt(0).toUpperCase();
            commentsHtml += `
            <li class="comment-item">
                <div class="comment-author-avatar" style="background-color: ${getRandomColor()}">${firstChar}</div>
                <div class="comment-body">
                    <div class="comment-author-name">${comment.username}</div>
                    <div class="comment-content">${comment.content.replace(/\n/g, '<br>')}</div>
                    <div class="comment-timestamp">${comment.timestamp}</div>
                </div>
            </li>
            `;
        });
    }

    const authorFirstChar = post.username.charAt(0).toUpperCase();
    detailScreen.innerHTML = `
    <header class="app-header">
        <button class="back-btn" data-target="forum-screen">‹</button>
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
                    <div class="author-avatar">${authorFirstChar}</div>
                    <div class="author-details">
                        <span class="author-name">${post.username}</span>
                        <span class="post-meta-data">${new Date(post.id.split('_')[1] * 1).toLocaleString()}</span>
                    </div>
                </div>
                <h2 class="post-detail-title">${post.title}</h2>
                <div class="post-detail-content-body">${post.content.replace(/\n/g, '<br>')}</div>
                <div class="post-detail-actions">
                    <div class="action-item">
                        <svg viewBox="0 0 24 24"><path d="M20,8H4V6H20V8M18,10H6V12H18V10M16,14H8V16H16V14M22,4V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V4A2,2 0 0,1 4,2H20A2,2 0 0,1 22,4Z" /></svg>
                        <span>${post.comments ? post.comments.length : 0}</span>
                    </div>
                    <div class="action-item">
                        <svg viewBox="0 0 24 24"><path d="M12.1,18.55L12,18.65L11.89,18.55C7.14,14.24 4,11.39 4,8.5C4,6.5 5.5,5 7.5,5C9.04,5 10.54,6 11.07,7.35H12.93C13.46,6 14.96,5 16.5,5C18.5,5 20,6.5 20,8.5C20,11.39 16.86,14.24 12.1,18.55M16.5,3C14.76,3 13.09,3.81 12,5.08C10.91,3.81 9.24,3 7.5,3C4.42,3 2,5.41 2,8.5C2,12.27 5.4,15.36 10.55,20.03L12,21.35L13.45,20.03C18.6,15.36 22,12.27 22,8.5C22,5.41 19.58,3 16.5,3Z" /></svg>
                        <span>${post.likeCount}</span>
                    </div>
                    <div class="action-item">
                        <svg viewBox="0 0 24 24"><path d="M13,9H18.5L13,3.5V9M6,2H14L20,8V20A2,2 0 0,1 18,22H6C4.89,22 4,21.1 4,20V4C4,2.89 4.89,2 6,2M15,18V16H6V18H15M18,14V12H6V14H18Z" /></svg>
                        <span>收藏</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="comments-section">
            <div class="comments-header">全部评论 (${post.comments ? post.comments.length : 0})</div>
            <ul class="comment-list">
                ${commentsHtml}
            </ul>
        </div>
    </main>`;

    const shareBtn = detailScreen.querySelector('#header-share-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            openSharePostModal(post.id);
        });
    }
}

function setupForumFeature() {
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
        const selectedCharIds = Array.from(charList.querySelectorAll('input:checked')).map(input => input.value);

        if (selectedCharIds.length === 0) {
            showToast('请至少选择一个分享对象。');
            return;
        }

        const postTitle = modal.dataset.postTitle;
        const postSummary = modal.dataset.postSummary;

        if (!postTitle || !postSummary) {
            showToast('无法获取帖子信息，分享失败。');
            return;
        }

        selectedCharIds.forEach(charId => {
            const character = db.characters.find(c => c.id === charId);
            if (character) {
                const messageContent = `[论坛分享]标题：${postTitle}\n摘要：${postSummary}`;

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

        await saveData();
        renderChatList(); 
        modal.classList.remove('visible');
        showToast(`成功分享给 ${selectedCharIds.length} 位联系人！`);
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

    modal.dataset.postTitle = post.title;
    modal.dataset.postSummary = post.summary;

    charList.innerHTML = ''; 

    if (db.characters.length > 0) {
        db.characters.forEach(char => {
            const li = document.createElement('li');
            li.className = 'binding-list-item';
            li.innerHTML = `
                <input type="checkbox" id="share-to-${char.id}" value="${char.id}">
                <label for="share-to-${char.id}" style="display: flex; align-items: center; gap: 10px;">
                    <img src="${char.avatar}" alt="${char.remarkName}" style="width: 32px; height: 32px; border-radius: 50%;">
                    ${char.remarkName}
                </label>
            `;
            charList.appendChild(li);
        });
    } else {
        charList.innerHTML = '<li style="color: #888;">暂无可以分享的角色。</li>';
    }

    if(detailsElement) detailsElement.open = false;

    modal.classList.add('visible');
}

function getForumGenerationContext() {
    let context = "以下是论坛社区的背景设定和主要角色信息：\n\n";
    const bindings = db.forumBindings || { worldBookIds: [], charIds: [], userPersonaIds: [] };

    if (bindings.worldBookIds && bindings.worldBookIds.length > 0) {
        context += "===== 世界观设定 =====\n";
        bindings.worldBookIds.forEach(id => {
            const book = db.worldBooks.find(wb => wb.id === id);
            if (book) {
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

    if (bindings.userPersonaIds && bindings.userPersonaIds.length > 0) {
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
    let { url, key, model } = db.apiSettings;
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

你的任务是读取背景世界观生成6到8篇风格各异、内容有趣的论坛帖子，每条帖子下面生成4~8条评论，每个帖子评论数量应该不一样，注意区分真实姓名和网名，注意user隐私，你的角色是“世界构建者”和“社区模拟器”，你需要分析char设定和user人设所处世界的世界观而不是“角色扮演者”，发帖人应该是该角色所处世界观下的其他NPC，发帖人不能是user。ABSOLUTELY DO NOT。若角色为普通人或需保密等神秘身份就禁止提及角色真实姓名，可以用代称或者暗号，只有当user或者char是公众人物名气大时才可以提及真实姓名。char的备注或者昵称是仅供user使用的，NPC不知道也禁止提及char的备注。若user和char不在一个地区就禁止有NPC目睹二人同框。

请严格按照下面的JSON格式返回，不要包含任何多余的解释和注释，仅返回JSON内容本身。禁止以user的视角进行创作。

返回格式示例:
{
"posts": [
{
  "title": "一个引人注目的帖子标题",
  "summary": "对帖子内容的客观的重点摘要，大约100字左右，DO NOT use first-person “我”",
  "content": "帖子的详细内容，150~300字。\\n可以使用换行符来分段落，注意排版。",
  "comments": [
    {
      "username": "路人（随机姓名）",
      "content": "这是第一条评论的内容，表达一个观点。",
      "timestamp": "5分钟前"
    },
    {
      "username": "（随机姓名）",
      "content": "这是第二条评论，可能反驳楼主或楼上的观点。",
      "timestamp": "3分钟前"
    }
  ]
}
]
}`;

        if (keywords) {
            systemPrompt += `\n\n重要指令：本次生成的所有帖子标题必须和以下关键词相关：【${keywords}】，同时也需要和之前绑定的设定相关。禁止相似帖子过多，不要特地把关键词标注出来。`;
        }

        const requestBody = {
            model: model,
            messages: [{ role: "user", content: systemPrompt }],
            temperature: 0.8,
            response_format: { type: "json_object" },
        };

        const endpoint = `${url}/v1/chat/completions`;
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };

        const contentStr = await fetchAiResponse(db.apiSettings, requestBody, headers, endpoint);

        const jsonData = JSON.parse(contentStr);
        if (jsonData && Array.isArray(jsonData.posts)) {
            const enhancedPosts = jsonData.posts.map(post => ({
              ...post,
              id: `post_${Date.now()}_${Math.random()}`,
              username: `楼主${Math.floor(100 + Math.random() * 900)}`, 
              likeCount: Math.floor(Math.random() * 200),
              shareCount: Math.floor(Math.random() * 50),
              comments: post.comments || []

            }));

            db.forumPosts = enhancedPosts;
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

function renderForumPosts(posts) {
    const postsContainer = document.getElementById('forum-posts-container');
    postsContainer.innerHTML = ''; 

    if (!posts || posts.length === 0) {
        postsContainer.innerHTML = '<p class="placeholder-text" style="margin-top: 50px;">AI还没生成任何帖子，请点击刷新按钮。';
        return;
    }

    posts.forEach(post => {
        const card = document.createElement('div');
        card.className = 'forum-post-card';
        card.dataset.id = post.id;

        const titleEl = document.createElement('h3');
        titleEl.className = 'post-title';
        titleEl.textContent = post.title || '无标题';

        const summaryEl = document.createElement('p');
        summaryEl.className = 'post-summary';
        summaryEl.textContent = post.summary || '无摘要';

        card.appendChild(titleEl);
        card.appendChild(summaryEl);

        postsContainer.appendChild(card);
    });
}
