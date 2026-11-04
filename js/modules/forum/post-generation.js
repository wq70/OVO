function getForumGenerationContext({ forPrivateMessage = false, includeCommunityContext = true } = {}) {
    if (typeof forumEnsureData === 'function') forumEnsureData();
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

    if (!includeCommunityContext) return context;

    if (!forPrivateMessage && context.length < 50) {
        context += "没有提供任何特定的背景设定，请自由发挥，创作一些通用的、有趣有网感的论坛帖子。禁止以user或者char的视角制作帖子，发帖人只能是NPC。\n\n";
    }

    if (db.forumSettings && db.forumSettings.enableCommunityContinuity !== false) {
        const residents = Object.keys(db.forumStrangerProfiles || {}).map(id => db.forumStrangerProfiles[id]).filter(Boolean).sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0)).slice(0, 18);
        if (residents.length) {
            context += "===== 社区常驻居民（允许自然回归，但不要让所有人每次都出现） =====\n";
            residents.forEach(p => { context += `账号ID: ${p.id}\n昵称: ${p.name}\n公开形象: ${p.publicPersona || p.basicPersona || p.bio || '普通社区用户'}\n近期生活: ${p.currentLife || '未公开'}\n\n`; });
        }
        const activeAccountId = forumCurrentAccountId();
        const activeAuthorId = forumLegacyAuthorId(activeAccountId);
        const recentPosts = (db.forumPosts || []).filter(function(p) {
            const isAnyUserAccount = p.authorId === 'user' || p.authorId === 'main' || (p.authorId && String(p.authorId).startsWith('alt_'));
            const isPublic = !p.visibility || p.visibility === 'public';
            return isPublic && (!isAnyUserAccount || p.authorId === activeAuthorId || p.authorId === activeAccountId);
        }).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 12);
        if (recentPosts.length) {
            context += "===== 社区近期历史 =====\n";
            recentPosts.forEach(p => { context += `帖子ID: ${p.id}\n作者: ${p.username}\n标题: ${p.title}\n摘要: ${(p.summary || p.content || '').slice(0, 180)}\n\n`; });
        }
        const activeStories = (db.forumStoryThreads || []).filter(s => s.status === 'active').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 8);
        if (activeStories.length) {
            context += "===== 正在发展的社区事件 =====\n";
            activeStories.forEach(s => { context += `事件: ${s.title}\n参与账号: ${(s.participantIds || []).join('、') || '尚不明确'}\n关联帖子数: ${(s.postIds || []).length}\n\n`; });
        }
        const socialEdges = (db.forumSocialEdges || []).slice().sort((a, b) => (b.strength || 0) - (a.strength || 0)).slice(0, 8);
        if (socialEdges.length) {
            context += "===== 居民之间已形成的互动关系 =====\n";
            socialEdges.forEach(edge => { context += `${edge.fromNpcId} → ${edge.toNpcId}：${edge.kind || '互动'}\n`; });
            context += '\n';
        }
        const accountRelationships = Object.keys(db.forumRelationships || {}).map(k => db.forumRelationships[k]).filter(r => r && r.accountId === activeAccountId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 8);
        if (accountRelationships.length) {
            context += "===== 居民与当前论坛身份的关系记忆（只影响自然态度，不得强行恋爱） =====\n";
            accountRelationships.forEach(r => { context += `账号${r.npcId}：${forumRelationshipSummary(r)}\n`; });
            context += '\n';
        }
    }

    return context;
}

async function handleForumRefresh() {
    forumEnsureData();
    const generationJob = forumStartJob('forum-refresh');
    const forumApiSettings = db.forumApiSettings || {};
    let apiSettings = forumApiSettings.useForumApi && forumApiSettings.url && forumApiSettings.key && forumApiSettings.model
        ? forumApiSettings
        : db.apiSettings;
    apiSettings = typeof getApiConfigForFeature === 'function' ? getApiConfigForFeature('forum', apiSettings) : apiSettings;
    let { url, key, model } = apiSettings;
    if (typeof isApiConfigReady === 'function' ? !isApiConfigReady(apiSettings) : (!url || !key || !model)) {
        forumFinishJob(generationJob);
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

你的任务是读取背景世界观生成${(db.forumSettings && db.forumSettings.postsPerGeneration) || 8}篇风格各异、内容有趣的论坛帖子，每条帖子下面生成${(db.forumSettings && db.forumSettings.commentsPerPost && db.forumSettings.commentsPerPost.min) || 4}到${(db.forumSettings && db.forumSettings.commentsPerPost && db.forumSettings.commentsPerPost.max) || 8}条评论，每个帖子评论数量应该不一样。社区必须像真实群体：一部分内容延续已有居民或旧话题，一部分来自新居民；NPC之间可以有自己的生活、关系、争议、求助、投票、树洞、问答、活动或连续事件，不要让所有内容围绕用户。注意区分真实姓名和网名，注意user隐私，你的角色是“世界构建者”和“社区模拟器”，你需要分析char设定和user人设所处世界的世界观而不是“角色扮演者”，发帖人应该是该角色所处世界观下的其他NPC，发帖人不能是user。ABSOLUTELY DO NOT。若角色为普通人或需保密等神秘身份就禁止提及角色真实姓名，可以用代称或者暗号，只有当user或者char是公众人物名气大时才可以提及真实姓名。char的备注或者昵称是仅供user使用的，NPC不知道也禁止提及char的备注。若user和char不在一个地区就禁止有NPC目睹二人同框。

请严格按照下面的XML标签格式返回，不要包含任何多余的解释和注释。禁止以user的视角进行创作。

返回格式示例:
<posts>
  <post>
    <authorId>若使用常驻居民，填写背景中的账号ID；新居民留空</authorId>
    <username>符合世界观且像真实用户的稳定昵称</username>
    <title>一个引人注目的帖子标题</title>
    <summary>对帖子内容的客观的重点摘要，大约100字左右，DO NOT use first-person “我”</summary>
    <content>帖子的详细内容，150~300字。\n可以使用换行符来分段落，注意排版。</content>
    <comments>
      <comment>
        <commenterId>若使用常驻居民，填写其账号ID；新居民留空</commenterId>
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
            messages: [{ role: "user", content: systemPrompt + forumCustomPromptSection('publicCustomPrompt') }],
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
            const authorIdMatch = postContent.match(/<authorId>([\s\S]*?)<\/authorId>/);
            const usernameMatch = postContent.match(/<username>([\s\S]*?)<\/username>/);
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
                    const commenterIdMatch = cContent.match(/<commenterId>([\s\S]*?)<\/commenterId>/);
                    const uMatch = cContent.match(/<username>([\s\S]*?)<\/username>/);
                    const textMatch = cContent.match(/<content>([\s\S]*?)<\/content>/);
                    const timeMatch = cContent.match(/<timestamp>([\s\S]*?)<\/timestamp>/);
                    if (uMatch && textMatch) {
                        comments.push({
                            candidateNpcId: commenterIdMatch ? commenterIdMatch[1].trim() : '',
                            username: uMatch[1].trim(),
                            content: textMatch[1].trim(),
                            timestamp: timeMatch ? timeMatch[1].trim() : '刚刚'
                        });
                    }
                }
            }
            
            if (titleMatch && contentMatch) {
                posts.push({
                    candidateNpcId: authorIdMatch ? authorIdMatch[1].trim() : '',
                    username: usernameMatch ? usernameMatch[1].trim() : '',
                    title: titleMatch[1].trim(),
                    summary: summaryMatch ? summaryMatch[1].trim() : '',
                    content: contentMatch[1].trim(),
                    comments: comments
                });
            }
        }

        if (posts.length > 0) {
            if (!forumJobIsCurrent(generationJob)) throw new Error('本次刷新已因切换身份或新请求而取消');
            const enhancedPosts = posts.map((post, index) => {
                const username = post.username || `楼主${Math.floor(100 + Math.random() * 900)}`;
                const npcId = forumResolveNpcId(post.candidateNpcId, username, 'generated-post');
                const timestamp = Date.now() + index;
                const profile = db.forumStrangerProfiles[npcId] = forumNormalizeNpcProfile(Object.assign({}, db.forumStrangerProfiles[npcId], { name: username, lastActiveAt: timestamp }), npcId);
                const result = Object.assign({}, post, {
                    id: forumNewId('post'), authorId: npcId, npcId: npcId, username: username,
                    timestamp: timestamp, likeCount: Math.floor(Math.random() * 200),
                    shareCount: Math.floor(Math.random() * 50), isLiked: false,
                    comments: (post.comments || []).map((c, commentIndex) => {
                        const commentNpcId = forumResolveNpcId(c.candidateNpcId, c.username || ('路人' + (commentIndex + 1)), 'generated-comment');
                        return Object.assign({}, c, { id: forumNewId('comment'), authorId: commentNpcId, npcId: commentNpcId, timestampMs: timestamp + commentIndex + 1 });
                    })
                });
                profile.postIds.push(result.id);
                forumTrackStoryThread(result);
                forumRecordEvent('post_created', { postId: result.id, npcId: npcId }, generationJob.accountId);
                return result;
            });

            db.forumPosts = enhancedPosts.concat(db.forumPosts || []);
            await saveData();
            renderForumPosts(db.forumPosts);

        } else {
            throw new Error("AI返回的数据格式不正确");
        }

    } catch (error) {
        showApiError(error);
        postsContainer.innerHTML = `<p class="placeholder-text" style="margin-top: 50px;">生成失败了，请检查API设置或网络后重试。</p>`;
    } finally {
        forumFinishJob(generationJob);
        refreshBtn.disabled = false;
    }
}

function renderForumPosts(posts, filter = 'all') {
    forumEnsureData();
    const postsContainer = document.getElementById('forum-posts-container');
    postsContainer.innerHTML = ''; 

    if (!posts || posts.length === 0) {
        postsContainer.innerHTML = forumPostDeleteMode && forumPostDeleteTarget === 'others'
            ? '<p class="placeholder-text" style="margin-top: 50px;">当前没有可删除的他人帖子</p>'
            : '<p class="placeholder-text" style="margin-top: 50px;">AI还没生成任何帖子，请点击刷新按钮。';
        return;
    }
    
    let filteredPosts = posts.filter(function(p) { return forumCanViewPost(p); });
    
    if (filter === 'liked') {
        filteredPosts = filteredPosts.filter(p => forumGetReaction(p, 'like'));
    } else if (filter === 'favorited') {
        filteredPosts = filteredPosts.filter(p => forumGetReaction(p, 'favorite'));
    } else if (filter === 'following') {
        const followed = forumGetAccountState().followingIds;
        filteredPosts = filteredPosts.filter(p => followed.indexOf(p.authorId || p.npcId) >= 0);
    } else if (filter === 'mentions') {
        const name = forumGetActiveAccount().username || '';
        filteredPosts = filteredPosts.filter(p => ((p.title || '') + '\n' + (p.content || '') + '\n' + (p.comments || []).map(c => c.content || '').join('\n')).indexOf('@' + name) >= 0);
    } else if (filter === 'hot') {
        filteredPosts.sort((a, b) => ((b.likeCount || 0) + (b.comments || []).length * 3) - ((a.likeCount || 0) + (a.comments || []).length * 3));
    } else if (filter === 'latest') {
        filteredPosts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    } else if (filter === 'history') {
        const history = forumGetAccountState().historyPostIds;
        filteredPosts = filteredPosts.filter(p => history.indexOf(p.id) >= 0).sort((a, b) => history.indexOf(a.id) - history.indexOf(b.id));
    }
    if (forumPostDeleteMode) filteredPosts = filteredPosts.filter(forumPostMatchesDeleteMode);
    
    if (filteredPosts.length === 0) {
        const emptyText = { liked: '暂无点赞的帖子', favorited: '暂无收藏的帖子', following: '暂无关注对象发布的帖子', mentions: '暂无与你相关的帖子', history: '暂无浏览历史', hot: '暂无热门帖子', latest: '暂无最新帖子' };
        postsContainer.innerHTML = `<p class="placeholder-text" style="margin-top: 50px;">${forumPostDeleteMode ? (forumPostDeleteTarget === 'others' ? '当前没有可删除的他人帖子' : '当前身份没有可删除的帖子') : (emptyText[filter] || '暂无帖子')}</p>`;
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
        const typeLabels = { discussion: '讨论', record: '记录', question: '问答', poll: '投票', treehole: '树洞', event: '活动' };
        titleEl.textContent = (post.type && post.type !== 'discussion' ? '【' + (typeLabels[post.type] || post.type) + '】' : '') + (post.title || '无标题');

        const summaryEl = document.createElement('p');
        summaryEl.className = 'post-summary';
        summaryEl.textContent = post.summary || '无摘要';
        const metaEl = document.createElement('div');
        metaEl.className = 'forum-post-meta';
        metaEl.textContent = (post.username || '匿名') + ' · ' + forumFormatTime(post.timestamp) + ' · ' + (post.likeCount || 0) + '赞 · ' + ((post.comments || []).length) + '评';

        if (forumPostDeleteMode) {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'display:flex;align-items:flex-start;gap:12px;width:100%;';
            const cbDiv = document.createElement('div');
            cbDiv.className = 'forum-post-select-checkbox';
            const textDiv = document.createElement('div');
            textDiv.style.cssText = 'flex:1;min-width:0;';
            textDiv.appendChild(titleEl);
            textDiv.appendChild(summaryEl);
            textDiv.appendChild(metaEl);
            wrapper.appendChild(cbDiv);
            wrapper.appendChild(textDiv);
            card.appendChild(wrapper);
        } else {
            card.appendChild(titleEl);
            card.appendChild(summaryEl);
            card.appendChild(metaEl);
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
    // 渲染或美化论坛顶栏返回按钮
    const forumBackBtn = document.querySelector('#forum-screen .app-header .back-btn');
    if (forumBackBtn && !forumBackBtn.classList.contains('forum-styled-back')) {
        forumBackBtn.classList.add('forum-top-back-btn', 'forum-styled-back');
        forumBackBtn.title = '返回';
        forumBackBtn.setAttribute('aria-label', '返回');
        forumBackBtn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>';
    }

    const actionBtnGroup = document.querySelector('#forum-screen .action-btn-group');
    if (!actionBtnGroup) return;

    // 保留私信按钮
    if (!document.getElementById('forum-dm-btn')) {
        const dmBtn = document.createElement('button');
        dmBtn.className = 'action-btn';
        dmBtn.id = 'forum-dm-btn';
        dmBtn.title = '私信';
        dmBtn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
        actionBtnGroup.appendChild(dmBtn);
    }

    // 更多功能按钮（点击唤起居中弹窗）
    if (!document.getElementById('forum-more-btn')) {
        const moreBtn = document.createElement('button');
        moreBtn.className = 'action-btn';
        moreBtn.id = 'forum-more-btn';
        moreBtn.title = '更多功能';
        moreBtn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle><circle cx="5" cy="12" r="1.5"></circle></svg>';
        actionBtnGroup.appendChild(moreBtn);
    }

    // 保留隐藏的兼容元素或旧按钮，如果存在旧按钮则移除，避免重复展示
    const oldDel = document.getElementById('forum-post-delete-btn');
    if (oldDel) oldDel.remove();
    const oldSet = document.getElementById('forum-settings-btn');
    if (oldSet) oldSet.remove();
    const oldNotice = document.getElementById('forum-notifications-btn');
    if (oldNotice) oldNotice.remove();

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
    const isLiked = !forumGetReaction(post, 'like');
    forumSetReaction(post, 'like', isLiked);
    post.likeCount = Math.max(0, (post.likeCount || 0) + (isLiked ? 1 : -1));
    forumRecordEvent(isLiked ? 'post_liked' : 'post_unliked', { postId: postId, npcId: post.authorId });
    if (post.authorId && String(post.authorId).indexOf('npc') === 0) forumAdjustRelationship(post.authorId, { familiarity: isLiked ? 1 : 0 }, isLiked ? '用户点赞帖子' : '用户取消点赞');
    saveData();
    const likeBtn = document.getElementById('like-post-btn');
    const likeCountEl = document.getElementById('like-count');
    if (likeBtn) {
        likeBtn.dataset.liked = isLiked;
        const svg = likeBtn.querySelector('svg');
        if (svg) svg.setAttribute('fill', isLiked ? '#ff4757' : 'none');
    }
    if (likeCountEl) likeCountEl.textContent = post.likeCount;
}

function forumTogglePostFavorite(postId) {
    const post = db.forumPosts.find(p => p.id === postId);
    if (!post) return;
    const isFavorited = !forumGetReaction(post, 'favorite');
    forumSetReaction(post, 'favorite', isFavorited);
    saveData();
    const favoriteBtn = document.getElementById('favorite-post-btn');
    if (favoriteBtn) {
        favoriteBtn.dataset.favorited = isFavorited;
        const svg = favoriteBtn.querySelector('svg');
        if (svg) svg.setAttribute('fill', isFavorited ? '#ffd700' : 'none');
    }
    showToast(isFavorited ? '已收藏' : '已取消收藏');
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
    forumRecordEvent('comment_created', { postId: postId, commentId: newComment.id, replyTo: newComment.replyTo || null });
    if (post.authorId && String(post.authorId).indexOf('npc') === 0) forumAdjustRelationship(post.authorId, { familiarity: 2, curiosity: 1 }, '用户参与帖子讨论');
    forumEvaluateIdentityEvidence(forumCurrentAccountId());
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
    const type = (document.getElementById('forum-post-type-input') || {}).value || 'discussion';
    const visibility = (document.getElementById('forum-post-visibility-input') || {}).value || 'public';
    const anonymous = !!((document.getElementById('forum-post-anonymous-input') || {}).checked);
    const tags = String((document.getElementById('forum-post-tags-input') || {}).value || '').split(/[,，]/).map(v => v.trim()).filter(Boolean).slice(0, 8);
    const pollOptions = String((document.getElementById('forum-poll-options-input') || {}).value || '').split(/\r?\n/).map(v => v.trim()).filter(Boolean).slice(0, 12);
    if (type === 'poll' && pollOptions.length < 2) { showToast('投票帖至少需要两个选项'); return; }
    
    const activeAccount = forumGetActiveAccount();
    const newPost = { 
        id: 'post_' + Date.now() + '_' + Math.random(), 
        authorId: activeAccount.isAlt ? activeAccount.id : 'user', 
        username: anonymous ? '匿名用户' : (activeAccount.username || '用户'),
        isAnonymous: anonymous,
        type: type,
        visibility: visibility,
        tags: tags,
        poll: type === 'poll' ? { options: pollOptions.map(text => ({ id: forumNewId('poll'), text: text, votes: 0 })), votesByAccount: {} } : null,
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
    newPost.accountId = forumCurrentAccountId();
    forumRecordEvent('post_created', { postId: newPost.id, byUser: true }, forumCurrentAccountId());
    forumTrackStoryThread(newPost);
    forumEvaluateIdentityEvidence(forumCurrentAccountId());
    await saveData();
    
    renderForumPosts(db.forumPosts);
    document.getElementById('create-forum-post-modal').classList.remove('visible');
    showToast('发布成功');
    
    if (titleInput) titleInput.value = '';
    if (contentInput) contentInput.value = '';
    const tagsInput = document.getElementById('forum-post-tags-input'); if (tagsInput) tagsInput.value = '';
    const pollInput = document.getElementById('forum-poll-options-input'); if (pollInput) pollInput.value = '';
    const anonymousInput = document.getElementById('forum-post-anonymous-input'); if (anonymousInput) anonymousInput.checked = false;
    
    const autoReplyCount = (db.forumSettings && db.forumSettings.autoReplyCount) || 0;
    if (autoReplyCount > 0 && visibility !== 'private') {
        forumGenerateAutoReplies(newPost.id, autoReplyCount);
    }
}

async function forumGenerateAutoReplies(postId, replyCount) {
    const generationJob = forumStartJob('auto-comment:' + postId, postId);
    const post = db.forumPosts.find(p => p.id === postId);
    if (!post) { forumFinishJob(generationJob); return; }
    
    const forumApiSettings = db.forumApiSettings || {};
    let apiSettings = forumApiSettings.useForumApi ? forumApiSettings : db.apiSettings;
    apiSettings = typeof getApiConfigForFeature === 'function' ? getApiConfigForFeature('forum', apiSettings) : apiSettings;
    
    if (typeof isApiConfigReady === 'function' ? !isApiConfigReady(apiSettings) : (!apiSettings.url || !apiSettings.key || !apiSettings.model)) {
        forumFinishJob(generationJob);
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
    <commenterId>若使用背景信息中的常驻用户，填写其NPC账号ID；新评论者留空</commenterId>
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
            messages: [{ role: "user", content: systemPrompt + forumCustomPromptSection('publicCustomPrompt') }],
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
            const commenterIdMatch = cContent.match(/<commenterId>([\s\S]*?)<\/commenterId>/);
            const uMatch = cContent.match(/<username>([\s\S]*?)<\/username>/);
            const textMatch = cContent.match(/<content>([\s\S]*?)<\/content>/);
            const timeMatch = cContent.match(/<timestamp>([\s\S]*?)<\/timestamp>/);
            if (uMatch && textMatch) {
                comments.push({
                    candidateNpcId: commenterIdMatch ? commenterIdMatch[1].trim() : '',
                    username: uMatch[1].trim(),
                    content: textMatch[1].trim(),
                    timestamp: timeMatch ? timeMatch[1].trim() : '刚刚'
                });
            }
        }
        
        if (comments.length > 0) {
            if (!forumJobIsCurrent(generationJob) || !db.forumPosts.some(p => p.id === postId)) throw new Error('帖子已变化，本次评论未写入');
            if (!post.comments) post.comments = [];
            
            comments.forEach(comment => {
                const newComment = {
                    id: 'comment_' + Date.now() + '_' + Math.random(),
                    authorId: forumResolveNpcId(comment.candidateNpcId, comment.username || '路人', 'auto-comment'),
                    username: comment.username || '路人' + Math.floor(100 + Math.random() * 900),
                    content: comment.content || '',
                    timestamp: comment.timestamp || '刚刚',
                    timestampMs: Date.now()
                };
                newComment.npcId = newComment.authorId;
                post.comments.push(newComment);
                if (forumAccountOwnsAuthor(post.authorId, generationJob.accountId)) {
                    forumAddNotification(generationJob.accountId, 'comment_reply', (comment.username || '有人') + ' 评论了你的帖子', { postId: postId, commentId: newComment.id, npcId: newComment.authorId });
                }
            });
            
            await saveData();
            renderForumPosts(db.forumPosts);
            showToast(`成功生成${comments.length}条AI评论`);
        }
        
    } catch (error) {
        console.error('自动回复生成失败:', error);
        showToast('自动生成评论失败');
    } finally {
        forumFinishJob(generationJob);
    }
}
