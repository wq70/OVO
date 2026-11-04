var forumPostDeleteTarget = 'own';

function forumPostMatchesDeleteMode(post) {
    return forumPostDeleteTarget === 'others'
        ? forumIsOtherPersonPost(post) && forumCanViewPost(post)
        : forumAccountOwnsAuthor(post.authorId);
}

function forumDeletePost(postId, deleteOtherPerson) {
    if (!confirm('确定要删除这篇帖子吗？')) return;
    const index = db.forumPosts.findIndex(p => p.id === postId);
    if (index === -1) return;
    const post = db.forumPosts[index];
    if (deleteOtherPerson) {
        if (!forumIsOtherPersonPost(post) || !forumCanViewPost(post)) { showToast('只能删除其他人发布的可见帖子'); return; }
    } else if (!forumAccountOwnsAuthor(post.authorId)) { showToast('只能删除当前身份发布的帖子'); return; }
    forumRecordEvent('post_deleted', { postId: post.id, title: post.title || '' });
    db.forumPosts.splice(index, 1);
    saveData();
    switchScreen('forum-screen');
    renderForumPosts(db.forumPosts);
    showToast('帖子已删除');
}

function forumTogglePostDeleteMode(target) {
    if (forumPostDeleteMode) return;
    forumPostDeleteTarget = target === 'others' ? 'others' : 'own';
    forumPostDeleteMode = true;
    forumSelectedPostIds.clear();
    var toolbar = document.getElementById('forum-post-delete-toolbar');
    if (toolbar) toolbar.style.display = 'flex';
    var deleteBtn = document.getElementById('forum-post-delete-btn');
    if (deleteBtn) deleteBtn.style.display = 'none';
    renderForumPosts(db.forumPosts, forumGetActiveFilter());
}

function forumPostSelectAll() {
    forumSelectedPostIds.clear();
    document.querySelectorAll('#forum-posts-container .forum-post-card[data-id]').forEach(function(card) { forumSelectedPostIds.add(card.dataset.id); });
    renderForumPosts(db.forumPosts, forumGetActiveFilter());
}

function forumPostDeleteSelected() {
    if (forumSelectedPostIds.size === 0) { showToast('请先选择要删除的帖子'); return; }
    if (!confirm('确定要删除选中的 ' + forumSelectedPostIds.size + ' 个帖子吗？')) return;
    db.forumPosts = (db.forumPosts || []).filter(function(p) { return !forumSelectedPostIds.has(p.id) || !forumPostMatchesDeleteMode(p); });
    saveData();
    forumSelectedPostIds.clear();
    forumPostDeleteMode = false;
    forumPostDeleteTarget = 'own';
    var toolbar = document.getElementById('forum-post-delete-toolbar');
    if (toolbar) toolbar.style.display = 'none';
    var deleteBtn = document.getElementById('forum-post-delete-btn');
    if (deleteBtn) deleteBtn.style.display = '';
    renderForumPosts(db.forumPosts, forumGetActiveFilter());
    showToast('已删除选中帖子');
}

function forumPostCancelDeleteMode() {
    forumPostDeleteMode = false;
    forumPostDeleteTarget = 'own';
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
    forumEnsureData();
    const s = db.forumSettings || { postsPerGeneration: 8, commentsPerPost: { min: 4, max: 8 }, autoReplyCount: 3, detailReplyCount: 2 };
    const publicPrompt = document.getElementById('forum-public-custom-prompt');
    const privatePrompt = document.getElementById('forum-private-custom-prompt');
    if (publicPrompt) publicPrompt.value = typeof s.publicCustomPrompt === 'string' ? s.publicCustomPrompt : '';
    if (privatePrompt) privatePrompt.value = typeof s.privateCustomPrompt === 'string' ? s.privateCustomPrompt : '';
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
    const autoAdvanceFrequency = document.getElementById('forum-proactive-intensity');
    const autoAdvanceFrequencyLabel = document.getElementById('forum-proactive-intensity-value');
    if (autoAdvanceFrequency) {
        autoAdvanceFrequency.value = s.proactiveIntensity ?? 50;
        autoAdvanceFrequency.oninput = function() {
            const value = Number(autoAdvanceFrequency.value);
            const label = value < 34 ? '较慢' : value > 66 ? '较快' : '适中';
            if (autoAdvanceFrequencyLabel) autoAdvanceFrequencyLabel.textContent = label;
            autoAdvanceFrequency.setAttribute('aria-valuetext', label);
        };
        autoAdvanceFrequency.oninput();
    }
    var continuityToggle = document.getElementById('forum-continuity-toggle');
    var knowledgeToggle = document.getElementById('forum-knowledge-toggle');
    var quietToggle = document.getElementById('forum-quiet-hours-toggle');
    var autoAdvanceToggle = document.getElementById('forum-auto-advance-toggle');
    var quietRow = document.getElementById('forum-quiet-hours-row');
    if (continuityToggle) continuityToggle.checked = s.enableCommunityContinuity !== false;
    if (knowledgeToggle) knowledgeToggle.checked = s.enableKnowledgeBoundaries !== false;
    if (autoAdvanceToggle) autoAdvanceToggle.checked = !!s.autoAdvanceOnOpen;
    if (quietToggle) {
        quietToggle.checked = !!s.quietHoursEnabled;
        quietToggle.onchange = function() { if (quietRow) quietRow.style.display = quietToggle.checked ? 'flex' : 'none'; };
    }
    if (quietRow) quietRow.style.display = quietToggle && quietToggle.checked ? 'flex' : 'none';
    var quietStart = document.getElementById('forum-quiet-hours-start');
    var quietEnd = document.getElementById('forum-quiet-hours-end');
    if (quietStart) quietStart.value = s.quietHoursStart || '23:00';
    if (quietEnd) quietEnd.value = s.quietHoursEnd || '08:00';
    
    const apiSettings = db.forumApiSettings || { useForumApi: false, url: '', key: '', model: '', temperature: 0.9 };
    const useApiToggle = document.getElementById('forum-use-api-toggle');
    const apiUrlInput = document.getElementById('forum-api-url-input');
    const apiKeyInput = document.getElementById('forum-api-key-input');
    const apiModelSelect = document.getElementById('forum-api-model-select');
    const apiConfigSection = document.getElementById('forum-api-config-section');
    
    if (useApiToggle) {
        useApiToggle.checked = apiSettings.useForumApi || false;
        useApiToggle.onchange = function() {
            if (apiConfigSection) apiConfigSection.style.display = this.checked ? 'block' : 'none';
        };
        if (apiConfigSection) apiConfigSection.style.display = useApiToggle.checked ? 'block' : 'none';
    }
    
    if (apiUrlInput) apiUrlInput.value = apiSettings.url || '';
    if (apiKeyInput) apiKeyInput.value = apiSettings.key || '';
    if (apiModelSelect && apiSettings.model) {
        apiModelSelect.innerHTML = '';
        const option = document.createElement('option');
        option.value = apiSettings.model;
        option.textContent = apiSettings.model;
        apiModelSelect.appendChild(option);
    }
    
    const tempSlider = document.getElementById('forum-temperature-slider');
    const tempValue = document.getElementById('forum-temperature-value');
    if (tempSlider && tempValue) {
        const savedTemp = apiSettings.temperature !== undefined ? apiSettings.temperature : 0.9;
        tempSlider.value = savedTemp;
        tempValue.textContent = savedTemp;
        
        tempSlider.oninput = (e) => {
            tempValue.textContent = e.target.value;
        };
    }
    
    const fetchModelsBtn = document.getElementById('forum-fetch-models-btn');
    if (fetchModelsBtn) {
        fetchModelsBtn.onclick = forumFetchModels;
    }

    // 角色小号私信设置
    const classicCharAltPrompt = document.getElementById('forum-char-alt-classic-prompt');
    if (classicCharAltPrompt) classicCharAltPrompt.checked = s.classicCharAltDmPrompt === true;
    const charAltEnable = document.getElementById('forum-char-alt-enable');
    const charAltOptions = document.getElementById('forum-char-alt-options');
    const charAltProbSlider = document.getElementById('forum-char-alt-prob-slider');
    const charAltProbValue = document.getElementById('forum-char-alt-prob-value');
    const charAltList = document.getElementById('forum-char-alt-list');
    if (charAltEnable && charAltOptions) {
        const altSettings = db.forumSettings && db.forumSettings.enableCharAltDm;
        charAltEnable.checked = !!altSettings;
        charAltOptions.style.display = charAltEnable.checked ? 'block' : 'none';
        charAltEnable.onchange = function() {
            charAltOptions.style.display = this.checked ? 'block' : 'none';
        };
    }
    if (charAltProbSlider && charAltProbValue) {
        const p = (db.forumSettings && db.forumSettings.charAltProbability) != null ? db.forumSettings.charAltProbability : 25;
        charAltProbSlider.value = Math.max(0, Math.min(100, p));
        charAltProbValue.textContent = charAltProbSlider.value + '%';
        charAltProbSlider.oninput = function() {
            charAltProbValue.textContent = this.value + '%';
        };
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
    const publicPrompt = document.getElementById('forum-public-custom-prompt');
    const privatePrompt = document.getElementById('forum-private-custom-prompt');
    if (publicPrompt) db.forumSettings.publicCustomPrompt = publicPrompt.value.trim();
    if (privatePrompt) db.forumSettings.privateCustomPrompt = privatePrompt.value.trim();
    db.forumSettings.postsPerGeneration = postsCount;
    db.forumSettings.commentsPerPost = { min: commentsMin, max: commentsMax };
    db.forumSettings.autoReplyCount = autoReplyCount;
    db.forumSettings.detailReplyCount = detailReplyCount;
    db.forumSettings.dmPerGeneration = dmPerGeneration;
    const autoAdvanceFrequency = document.getElementById('forum-proactive-intensity');
    if (autoAdvanceFrequency) db.forumSettings.proactiveIntensity = Number(autoAdvanceFrequency.value);
    var continuityToggle = document.getElementById('forum-continuity-toggle');
    var knowledgeToggle = document.getElementById('forum-knowledge-toggle');
    var quietToggle = document.getElementById('forum-quiet-hours-toggle');
    var autoAdvanceToggle = document.getElementById('forum-auto-advance-toggle');
    db.forumSettings.enableCommunityContinuity = !continuityToggle || continuityToggle.checked;
    db.forumSettings.enableKnowledgeBoundaries = !knowledgeToggle || knowledgeToggle.checked;
    db.forumSettings.quietHoursEnabled = !!(quietToggle && quietToggle.checked);
    db.forumSettings.autoAdvanceOnOpen = !!(autoAdvanceToggle && autoAdvanceToggle.checked);
    db.forumSettings.quietHoursStart = (document.getElementById('forum-quiet-hours-start') || {}).value || '23:00';
    db.forumSettings.quietHoursEnd = (document.getElementById('forum-quiet-hours-end') || {}).value || '08:00';

    const charAltEnable = document.getElementById('forum-char-alt-enable');
    const charAltProbSlider = document.getElementById('forum-char-alt-prob-slider');
    const charAltList = document.getElementById('forum-char-alt-list');
    const classicCharAltPrompt = document.getElementById('forum-char-alt-classic-prompt');
    if (classicCharAltPrompt) db.forumSettings.classicCharAltDmPrompt = classicCharAltPrompt.checked;
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
    const isOwnId = function(id) { return id === 'user' || id === 'main' || (id && id.startsWith('alt_')); };
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
    if (forumCurrentAccountId() === 'main') forumUpdateIdentityChip();
    showToast('资料已保存');
}

function forumBindNewEvents() {
    document.getElementById('create-post-fab') && document.getElementById('create-post-fab').addEventListener('click', () => { document.getElementById('create-forum-post-modal').classList.add('visible'); });
    document.getElementById('create-forum-post-form') && document.getElementById('create-forum-post-form').addEventListener('submit', function(e) { e.preventDefault(); forumPublishPost(); });
    const forumPostTypeInput = document.getElementById('forum-post-type-input');
    if (forumPostTypeInput) forumPostTypeInput.onchange = function() {
        const group = document.getElementById('forum-poll-options-group');
        if (group) group.style.display = forumPostTypeInput.value === 'poll' ? 'block' : 'none';
    };
    document.getElementById('forum-save-draft-btn') && document.getElementById('forum-save-draft-btn').addEventListener('click', forumSaveComposerDraft);
    document.getElementById('forum-open-drafts-btn') && document.getElementById('forum-open-drafts-btn').addEventListener('click', forumRenderDrafts);
    document.getElementById('cancel-forum-post-btn') && document.getElementById('cancel-forum-post-btn').addEventListener('click', () => { document.getElementById('create-forum-post-modal').classList.remove('visible'); });

    // 更多功能居中弹窗逻辑
    function forumEnsureMoreModal() {
        let modal = document.getElementById('forum-more-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'forum-more-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-window forum-more-modal-window">
                    <div class="forum-more-modal-header">
                        <h3 class="forum-more-modal-title">论坛功能</h3>
                        <button type="button" class="forum-more-modal-close" id="forum-more-modal-close" aria-label="关闭">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                    <div class="forum-more-modal-list">
                        <button type="button" class="forum-more-modal-item" id="forum-more-notice-btn">
                            <div class="forum-more-modal-icon">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path>
                                    <path d="M10 21h4"></path>
                                </svg>
                            </div>
                            <div class="forum-more-modal-text">
                                <span class="forum-more-item-name">与我相关</span>
                                <span class="forum-more-item-desc">查看提及、互动与提醒</span>
                            </div>
                            <span class="forum-more-item-badge" id="forum-more-notice-badge" style="display:none;">0</span>
                        </button>
                        <button type="button" class="forum-more-modal-item" id="forum-more-manage-btn">
                            <div class="forum-more-modal-icon">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    <line x1="10" y1="11" x2="10" y2="17"></line>
                                    <line x1="14" y1="11" x2="14" y2="17"></line>
                                </svg>
                            </div>
                            <div class="forum-more-modal-text">
                                <span class="forum-more-item-name">管理清理</span>
                                <span class="forum-more-item-desc">批量删除我的发布内容</span>
                            </div>
                        </button>
                        <button type="button" class="forum-more-modal-item" id="forum-more-delete-others-btn">
                            <div class="forum-more-modal-icon">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    <line x1="10" y1="11" x2="10" y2="17"></line>
                                    <line x1="14" y1="11" x2="14" y2="17"></line>
                                </svg>
                            </div>
                            <div class="forum-more-modal-text">
                                <span class="forum-more-item-name">删除他人帖子</span>
                                <span class="forum-more-item-desc">多选或全选清理他人帖子</span>
                            </div>
                        </button>
                        <button type="button" class="forum-more-modal-item" id="forum-more-settings-btn">
                            <div class="forum-more-modal-icon">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="3"></circle>
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                                </svg>
                            </div>
                            <div class="forum-more-modal-text">
                                <span class="forum-more-item-name">论坛设置</span>
                                <span class="forum-more-item-desc">调整 API、剧情与社区模式</span>
                            </div>
                        </button>
                        <button type="button" class="forum-more-modal-item" id="forum-more-account-btn">
                            <div class="forum-more-modal-icon">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="12" cy="7" r="4"></circle>
                                </svg>
                            </div>
                            <div class="forum-more-modal-text">
                                <span class="forum-more-item-name">身份管理</span>
                                <span class="forum-more-item-desc">切换或管理小号与资料</span>
                            </div>
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('visible');
            });
            const closeBtn = modal.querySelector('#forum-more-modal-close');
            if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('visible'));

            const noticeBtn = modal.querySelector('#forum-more-notice-btn');
            if (noticeBtn) noticeBtn.addEventListener('click', () => {
                modal.classList.remove('visible');
                forumRenderNotifications();
            });

            const manageBtn = modal.querySelector('#forum-more-manage-btn');
            if (manageBtn) manageBtn.addEventListener('click', () => {
                modal.classList.remove('visible');
                forumTogglePostDeleteMode();
            });

            const deleteOthersBtn = modal.querySelector('#forum-more-delete-others-btn');
            if (deleteOthersBtn) deleteOthersBtn.addEventListener('click', () => {
                modal.classList.remove('visible');
                forumTogglePostDeleteMode('others');
            });

            const settingsBtn = modal.querySelector('#forum-more-settings-btn');
            if (settingsBtn) settingsBtn.addEventListener('click', () => {
                modal.classList.remove('visible');
                switchScreen('forum-settings-screen');
                forumLoadSettings();
            });

            const accountBtn = modal.querySelector('#forum-more-account-btn');
            if (accountBtn) accountBtn.addEventListener('click', () => {
                modal.classList.remove('visible');
                switchScreen('forum-alt-accounts-screen');
                forumRenderAltAccountsList();
            });
        }
        return modal;
    }

    const moreBtn = document.getElementById('forum-more-btn');
    if (moreBtn) {
        moreBtn.addEventListener('click', () => {
            const modal = forumEnsureMoreModal();
            forumUpdateMoreNoticeBadge();
            modal.classList.add('visible');
        });
    }

    document.getElementById('forum-settings-btn') && document.getElementById('forum-settings-btn').addEventListener('click', () => { switchScreen('forum-settings-screen'); forumLoadSettings(); });
    document.getElementById('forum-notifications-btn') && document.getElementById('forum-notifications-btn').addEventListener('click', forumRenderNotifications);
    document.getElementById('forum-local-search-btn') && document.getElementById('forum-local-search-btn').addEventListener('click', function() {
        var input = document.getElementById('forum-search-input');
        var query = input ? input.value : '';
        var results = forumRunLocalSearch(query);
        renderForumPosts(results, 'all');
        showToast(query.trim() ? '找到 ' + results.length + ' 篇已有帖子' : '已显示全部帖子');
    });
    document.getElementById('forum-search-input') && document.getElementById('forum-search-input').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); document.getElementById('forum-local-search-btn').click(); }
    });
    document.getElementById('forum-current-identity-chip') && document.getElementById('forum-current-identity-chip').addEventListener('click', function() { switchScreen('forum-alt-accounts-screen'); forumRenderAltAccountsList(); });
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
