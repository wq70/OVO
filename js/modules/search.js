// --- 搜索聊天记录模块 ---

const SearchSystem = {
    currentScope: 'all', // 'all' or chatId
    currentResults: [],
    searchTimer: null,
    
    // 初始化
    init() {
        // 绑定筛选器点击事件
        const scopeSelect = document.getElementById('search-scope-select');
        if (scopeSelect) {
            scopeSelect.addEventListener('click', () => this.openScopeModal());
        }

        // 绑定忽略状态栏开关事件
        const ignoreStatusSwitch = document.getElementById('search-ignore-status');
        if (ignoreStatusSwitch) {
            ignoreStatusSwitch.addEventListener('change', () => {
                const keyword = document.getElementById('search-history-input').value.trim();
                this.performSearch(keyword);
            });
        }

        // 绑定搜索输入事件
        const input = document.getElementById('search-history-input');
        if (input) {
            input.addEventListener('input', (e) => {
                // 防抖
                if (this.searchTimer) clearTimeout(this.searchTimer);
                this.searchTimer = setTimeout(() => {
                    this.performSearch(e.target.value.trim());
                }, 300);
            });
            
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.performSearch(e.target.value.trim());
                    input.blur();
                }
            });
        }

        // 绑定取消/返回按钮
        const cancelBtn = document.getElementById('search-cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.closeSearchScreen();
            });
        }
        
        // 模态框关闭事件
        const scopeModal = document.getElementById('search-scope-modal');
        if (scopeModal) {
            scopeModal.addEventListener('click', (e) => {
                if (e.target === scopeModal) {
                    scopeModal.classList.remove('visible');
                }
            });
        }
    },

    // 打开搜索界面
    open() {
        // 重置状态
        this.currentScope = 'all';
        this.updateScopeUI();
        document.getElementById('search-history-input').value = '';
        document.getElementById('search-results-container').innerHTML = `
            <div class="search-placeholder">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <p>输入关键词搜索聊天记录</p>
                <p style="font-size:12px; margin-top:5px;">支持搜索消息内容</p>
            </div>
        `;
        
        switchScreen('search-history-screen');
        setTimeout(() => {
            document.getElementById('search-history-input').focus();
        }, 100);
    },

    closeSearchScreen() {
        switchScreen('more-screen'); // 返回上一个屏幕
    },

    // 执行搜索
    performSearch(keyword) {
        const container = document.getElementById('search-results-container');
        if (!keyword) {
            container.innerHTML = '';
            return;
        }

        const ignoreStatus = document.getElementById('search-ignore-status')?.checked;
        const results = [];
        
        // 1. 确定搜索范围
        let targets = [];
        if (this.currentScope === 'all') {
            targets = [
                ...db.characters.map(c => ({...c, type: 'private'})),
                ...db.groups.map(g => ({...g, type: 'group'}))
            ];
        } else {
            const char = db.characters.find(c => c.id === this.currentScope);
            if (char) targets.push({...char, type: 'private'});
            else {
                const group = db.groups.find(g => g.id === this.currentScope);
                if (group) targets.push({...group, type: 'group'});
            }
        }

        // 2. 遍历搜索
        let totalCount = 0;
        
        targets.forEach(chat => {
            if (!chat.history || chat.history.length === 0) return;

            // 获取该聊天的清理正则（如果是私聊）
            let statusRegex = null;
            if (ignoreStatus && chat.type === 'private' && chat.statusPanel && chat.statusPanel.regexPattern) {
                try {
                    statusRegex = new RegExp(chat.statusPanel.regexPattern, 'g');
                } catch (e) {
                    console.error('Invalid status regex:', e);
                }
            }

            const matches = chat.history.filter(msg => {
                // 排除系统消息、撤回消息等（简单处理：只要 content 包含关键词且非空）
                if (!msg.content) return false;

                // 过滤特殊消息（互动、表情包、图片等）
                if (this.isSpecialMessage(msg.content, msg)) return false;
                
                // 如果开启忽略状态栏，且消息标记为状态更新，直接排除
                if (ignoreStatus && msg.isStatusUpdate) return false;

                let contentToSearch = msg.content;
                
                // 如果开启忽略状态栏，尝试清理内容
                if (ignoreStatus) {
                    let regexToUse = null;
                    // 优先使用消息快照中的正则
                    if (msg.statusSnapshot && msg.statusSnapshot.regex) {
                        try {
                            regexToUse = new RegExp(msg.statusSnapshot.regex, 'g');
                        } catch (e) {
                            console.error('Invalid snapshot regex:', e);
                        }
                    } else {
                        // 否则使用当前聊天的正则
                        regexToUse = statusRegex;
                    }

                    if (regexToUse) {
                        contentToSearch = contentToSearch.replace(regexToUse, '');
                    }
                }

                // 解析为纯文本进行搜索，避免匹配到发送者名字
                const textToSearch = this.parseMessageContent(contentToSearch, msg);
                return textToSearch.toLowerCase().includes(keyword.toLowerCase());
            }).map(msg => {
                // 在 map 阶段就处理好显示内容，避免重复计算正则
                let displayContent = msg.content;
                
                if (ignoreStatus) {
                    let regexToUse = null;
                    if (msg.statusSnapshot && msg.statusSnapshot.regex) {
                        try {
                            regexToUse = new RegExp(msg.statusSnapshot.regex, 'g');
                        } catch (e) {
                            console.error('Invalid snapshot regex:', e);
                        }
                    } else {
                        regexToUse = statusRegex;
                    }

                    if (regexToUse) {
                        displayContent = displayContent.replace(regexToUse, '');
                    }
                }
                
                // 解析为纯文本
                displayContent = this.parseMessageContent(displayContent, msg);

                return {
                    ...msg,
                    content: displayContent, // 使用处理后的内容用于展示
                    originalContent: msg.content, // 保留原始内容（可选）
                    chatId: chat.id,
                    chatType: chat.type,
                    chatName: chat.type === 'private' ? chat.remarkName : chat.name,
                    chatAvatar: chat.avatar
                };
            });

            if (matches.length > 0) {
                // 按时间倒序
                matches.sort((a, b) => b.timestamp - a.timestamp);
                
                results.push({
                    chatId: chat.id,
                    chatType: chat.type,
                    name: chat.type === 'private' ? chat.remarkName : chat.name,
                    avatar: chat.avatar,
                    myName: chat.myName, // 保存用户在该聊天中的名字
                    count: matches.length,
                    messages: matches
                });
                totalCount += matches.length;
            }
        });

        // 3. 渲染结果
        if (totalCount === 0) {
            container.innerHTML = `
                <div class="search-placeholder">
                    <p>未找到包含“${this.escapeHtml(keyword)}”的记录</p>
                </div>
            `;
            return;
        }

        this.currentResults = results;
        
        // 按匹配数量排序
        results.sort((a, b) => b.count - a.count);

        if (this.currentScope === 'all') {
            this.renderOverview(results, totalCount, keyword);
        } else {
            // 如果是单聊范围，直接展示详情列表
            this.renderDetail(results[0], keyword, true);
        }
    },

    // 渲染概览页 (按角色分组)
    renderOverview(results, totalCount, keyword) {
        const container = document.getElementById('search-results-container');
        container.innerHTML = '';

        // 统计头图
        const header = document.createElement('div');
        header.className = 'search-stat-header';
        header.innerHTML = `共找到 <strong>${totalCount}</strong> 条关于 “<strong>${this.escapeHtml(keyword)}</strong>” 的记录`;
        container.appendChild(header);

        // 列表
        const list = document.createElement('div');
        list.className = 'search-group-list';

        results.forEach(group => {
            const item = document.createElement('div');
            item.className = 'search-group-item';
            
            // 获取最新一条匹配消息作为预览
            const previewMsg = group.messages[0].content;
            
            item.innerHTML = `
                <img src="${group.avatar}" class="search-group-avatar" alt="avatar">
                <div class="search-group-info">
                    <div class="search-group-name">
                        <span>${this.escapeHtml(group.name)}</span>
                        <span class="search-group-count">${group.count}条</span>
                    </div>
                    <div class="search-group-preview">${this.escapeHtml(previewMsg)}</div>
                </div>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ccc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            `;

            item.addEventListener('click', () => {
                this.renderDetail(group, keyword);
            });

            list.appendChild(item);
        });

        container.appendChild(list);
    },

    // 渲染详情页 (消息列表)
    renderDetail(group, keyword, isDirectMode = false) {
        const container = document.getElementById('search-results-container');
        container.innerHTML = '';

        // 头部导航 (如果是从概览点进来的，需要返回按钮)
        if (!isDirectMode) {
            const header = document.createElement('div');
            header.className = 'search-detail-header';
            header.innerHTML = `
                <button class="search-back-btn">‹</button>
                <div class="search-detail-title">${this.escapeHtml(group.name)} (${group.count}条)</div>
            `;
            header.querySelector('.search-back-btn').addEventListener('click', () => {
                // 重新渲染概览
                const keyword = document.getElementById('search-history-input').value.trim();
                this.performSearch(keyword);
            });
            container.appendChild(header);
        } else {
             // 直达模式也显示个标题比较好
            const header = document.createElement('div');
            header.className = 'search-detail-header';
            header.innerHTML = `
                <div class="search-detail-title" style="margin-left:5px;">${this.escapeHtml(group.name)} (${group.count}条)</div>
            `;
            container.appendChild(header);
        }

        const list = document.createElement('div');
        list.className = 'search-result-list';

        group.messages.forEach(msg => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            
            const date = new Date(msg.timestamp);
            const timeStr = `${date.getFullYear()}/${pad(date.getMonth()+1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
            
            // 高亮关键词
            const highlightedContent = this.highlightKeyword(msg.content, keyword);

            // 获取显示名字
            let displayName = '';
            if (msg.role === 'user') {
                displayName = group.myName || '我';
            } else {
                if (group.chatType === 'private') {
                    displayName = group.name; 
                } else {
                    displayName = msg.senderId ? '成员' : '成员';
                }
            }

            item.innerHTML = `
                <div class="search-result-header">
                    <span class="search-result-name">${this.escapeHtml(displayName)}</span>
                    <span class="search-result-time">${timeStr}</span>
                </div>
                <div class="search-result-content">${highlightedContent}</div>
            `;
            
            list.appendChild(item);
        });

        container.appendChild(list);
    },

    // 关键词高亮处理
    highlightKeyword(content, keyword) {
        if (!keyword) return this.escapeHtml(content);
        const safeContent = this.escapeHtml(content);
        const safeKeyword = this.escapeHtml(keyword);
        const regex = new RegExp(`(${safeKeyword})`, 'gi');
        return safeContent.replace(regex, '<span class="keyword-highlight">$1</span>');
    },

    // 打开筛选范围模态框
    openScopeModal() {
        const modal = document.getElementById('search-scope-modal');
        const list = document.getElementById('search-scope-list');
        list.innerHTML = '';

        // 全部选项
        this.createScopeItem(list, 'all', '全部范围', '', this.currentScope === 'all');

        // 角色
        db.characters.forEach(c => {
            this.createScopeItem(list, c.id, c.remarkName, c.avatar, this.currentScope === c.id);
        });

        // 群组
        db.groups.forEach(g => {
            this.createScopeItem(list, g.id, g.name, g.avatar, this.currentScope === g.id);
        });

        modal.classList.add('visible');
    },

    createScopeItem(container, id, name, avatar, isSelected) {
        const item = document.createElement('div');
        item.className = `scope-item ${isSelected ? 'selected' : ''}`;
        
        let iconHtml = '';
        if (id === 'all') {
            iconHtml = `<div class="scope-avatar" style="background:#ddd; display:flex; align-items:center; justify-content:center; color:#fff;">ALL</div>`;
        } else {
            iconHtml = `<img src="${avatar}" class="scope-avatar" alt="avatar">`;
        }

        item.innerHTML = `
            ${iconHtml}
            <span style="flex:1;">${this.escapeHtml(name)}</span>
            ${isSelected ? '<span style="color:var(--primary-color);">✔</span>' : ''}
        `;

        item.addEventListener('click', () => {
            this.currentScope = id;
            this.updateScopeUI();
            document.getElementById('search-scope-modal').classList.remove('visible');
            
            // 如果已有关键词，立即刷新搜索
            const keyword = document.getElementById('search-history-input').value.trim();
            if (keyword) {
                this.performSearch(keyword);
            }
        });

        container.appendChild(item);
    },

    updateScopeUI() {
        const selectText = document.querySelector('#search-scope-select span');
        if (this.currentScope === 'all') {
            selectText.textContent = '搜索范围：全部';
        } else {
            const target = db.characters.find(c => c.id === this.currentScope) || db.groups.find(g => g.id === this.currentScope);
            if (target) {
                const name = target.remarkName || target.name;
                selectText.textContent = `搜索范围：${name}`;
            }
        }
    },

    isSpecialMessage(content, msg) {
        if (!content) return true;
        
        const urlRegex = /^(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|bmp|svg)|data:image\/[a-z]+;base64,)/i;
        const imageRecogRegex = /\[.*?发来了一张图片：\]/;
        const voiceRegex = /\[.*?的语音：.*?\]/;
        const photoVideoRegex = /\[.*?发来的照片\/视频：.*?\]/;
        const transferRegex = /\[.*?的转账：.*?元.*?\]|\[.*?给你转账：.*?元.*?\]|\[.*?向.*?转账：.*?元.*?\]/;
        const stickerRegex = /\[.*?的表情包：.*?\]|\[.*?发送的表情包：.*?\]/;
        const giftRegex = /\[.*?送来的礼物：.*?\]|\[.*?向.*?送来了礼物：.*?\]/;
        const forumShareRegex = /\[论坛分享\]标题：([\s\S]+?)\n摘要：([\s\S]+)/;
        const htmlRegex = /<[a-z][\s\S]*>/i;

        if (giftRegex.test(content)) return true;
        if (stickerRegex.test(content)) return true;
        if (voiceRegex.test(content)) return true;
        if (photoVideoRegex.test(content)) return true;
        if (transferRegex.test(content)) return true;
        if (imageRecogRegex.test(content) || (msg.parts && msg.parts.some(p => p.type === 'image'))) return true;
        if (forumShareRegex.test(content)) return true;
        if (msg.parts && msg.parts.some(p => p.type === 'html')) return true;
        if (htmlRegex.test(content)) return true;
        if (urlRegex.test(content)) return true;

        return false;
    },

    parseMessageContent(content, msg) {
        if (!content) return '';
        
        // 虽然 filter 阶段已经过滤了大部分特殊消息，
        // 但保留转换逻辑以防万一，或者处理残留的格式
        
        // 2. 普通文本处理
        let text = content.trim();
        const plainTextMatch = text.match(/^\[.*?：([\s\S]*)\]$/);
        if (plainTextMatch && plainTextMatch[1]) {
            text = plainTextMatch[1].trim();
        }
        text = text.replace(/\[发送时间:.*?\]$/, '').trim(); 
        
        return text;
    },

    escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")   // 修复：替换为 &amp;
            .replace(/</g, "&lt;")    // 修复：替换为 &lt;
            .replace(/>/g, "&gt;")    // 修复：替换为 &gt;
            .replace(/"/g, "&quot;")  // 修复：解决了你的红色报错
            .replace(/'/g, "&#039;");
    }
    
};

// 暴露给全局
window.SearchSystem = SearchSystem;
