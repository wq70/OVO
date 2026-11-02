function renderTutorialContent() {
    const tutorialContentArea = document.getElementById('tutorial-content-area');
    const mode = typeof getAppearanceMode === 'function' ? getAppearanceMode() : 'classic';
    const isModern = mode === 'modern';
    const isRabbit = mode === 'rabbit';
    
    // 应用自定义 CSS
    if (typeof applyCustomTutorialCss === 'function') applyCustomTutorialCss();
    
    tutorialContentArea.innerHTML = '';
    
    // 清理可能遗留的旧 class
    tutorialContentArea.classList.remove('tutorial-modern-layout', 'tutorial-rabbit-layout');
    
    if (isModern) {
        tutorialContentArea.classList.add('tutorial-modern-layout');
    } else if (isRabbit) {
        tutorialContentArea.classList.add('tutorial-rabbit-layout');
    }

    let modernGroups = {};
    if (isModern) {
        const createGroup = (title) => {
            const group = document.createElement('div');
            group.className = 'tutorial-modern-group';
            if (title) {
                const titleEl = document.createElement('div');
                titleEl.className = 'tutorial-modern-group-title';
                titleEl.textContent = title;
                group.appendChild(titleEl);
            }
            const list = document.createElement('div');
            list.className = 'tutorial-modern-list';
            group.appendChild(list);
            tutorialContentArea.appendChild(group);
            return list;
        };
        modernGroups.docs = createGroup('使用说明');
        modernGroups.data = createGroup('数据管理');
        modernGroups.clean = createGroup('数据清理');
        modernGroups.github = createGroup('云端备份');
    }

    const docsContainer = isModern ? modernGroups.docs : tutorialContentArea;

    const tutorials = [
        {title: '写在前面', imageUrls: ['https://i.postimg.cc/3RJfvgzq/xie-zai-qian-mian(1).jpg']},
        {
            title: '软件介绍',
            imageUrls: ['https://i.postimg.cc/VvsJRh6q/IMG-20250713-162647.jpg', 'https://i.postimg.cc/8P5FfxxD/IMG-20250713-162702.jpg', 'https://i.postimg.cc/3r94R3Sn/IMG-20250713-162712.jpg']
        },
        {
            title: '404',
            imageUrls: ['https://i.postimg.cc/x8scFPJW/IMG-20250713-162756.jpg', 'https://i.postimg.cc/pX6mfqtj/IMG-20250713-162809.jpg', 'https://i.postimg.cc/YScjV00q/IMG-20250713-162819.jpg', 'https://i.postimg.cc/13VfJw9j/IMG-20250713-162828.jpg']
        },
        {title: '404-群聊', imageUrls: ['https://i.postimg.cc/X7LSmRTJ/404.jpg']}
    ];

    renderUpdateLog(docsContainer);

    tutorials.forEach(tutorial => {
        const item = document.createElement('div');
        const imagesHtml = tutorial.imageUrls.map(url => `<img src="${url}" alt="${tutorial.title}教程图片">`).join('');
        
        if (isRabbit) {
            item.className = 'tutorial-rabbit-card';
            item.innerHTML = `
                <div class="tutorial-rabbit-card-title">${tutorial.title}</div>
                <div class="tutorial-rabbit-content">
                    <div class="tutorial-rabbit-content-inner">${imagesHtml}</div>
                </div>
            `;
        } else {
            item.className = isModern ? 'tutorial-modern-item' : 'tutorial-item';
            item.innerHTML = `<div class="${isModern ? 'tutorial-modern-header' : 'tutorial-header'}">${tutorial.title}</div><div class="${isModern ? 'tutorial-modern-content' : 'tutorial-content'}"><div class="${isModern ? 'tutorial-modern-content-inner' : ''}">${imagesHtml}</div></div>`;
        }
        docsContainer.appendChild(item);
    });

    const createActionItem = (tag, text, classicClass, isDanger = false) => {
        const el = document.createElement(tag);
        if (isModern) {
            el.className = 'tutorial-modern-action' + (isDanger ? ' danger' : '');
            el.innerHTML = `<span>${text}</span><span class="arrow">›</span>`;
        } else if (isRabbit) {
            el.className = 'tutorial-rabbit-action' + (isDanger ? ' danger' : ' neutral');
            el.textContent = text;
        } else {
            el.className = classicClass;
            el.textContent = text;
            el.style.marginTop = '10px';
            el.style.display = 'block';
        }
        return el;
    };

    const setActionItemText = (element, text) => {
        const label = isModern ? element.querySelector('span') : null;
        if (label) label.textContent = text;
        else element.textContent = text;
    };

    const backupDataBtn = createActionItem('button', '备份数据', 'btn btn-primary');
    backupDataBtn.disabled = loadingBtn;
    let activeBackupController = null;

    backupDataBtn.addEventListener('click', async () => {
        if(loadingBtn){
            if (activeBackupController) {
                activeBackupController.abort();
                setActionItemText(backupDataBtn, '正在取消…');
            }
            return
        }
        loadingBtn = true
        activeBackupController = new AbortController();
        backupDataBtn.disabled = false;
        setActionItemText(backupDataBtn, '取消备份');
        try {
            showToast('正在准备导出数据...');
            await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
            const compressedBlob = await createCompressedBackupBlob({
                signal: activeBackupController.signal
            });

            const now = new Date();
            const date = now.toISOString().slice(0, 10);
            const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
            await OvoFileDownload.save(compressedBlob, `章鱼喷墨_备份数据_${date}_${time}.ee`);

        }catch (e){
            if (e && e.name === 'AbortError') showToast('已取消备份');
            else {
                showToast(`导出失败, 发生错误: ${e.message}`);
                console.error('导出错误详情:', e);
            }
        } finally {
            loadingBtn = false;
            activeBackupController = null;
            backupDataBtn.disabled = false;
            setActionItemText(backupDataBtn, '备份数据');
        }
    });

    // 分类导出：可选数据表多选导出
    const PARTIAL_EXPORT_OPTIONS = [
        { key: 'characters', label: '角色（单聊）' },
        { key: 'groups', label: '群聊' },
        { key: 'worldBooks', label: '世界书' },
        { key: 'myStickers', label: '我的表情' },
        { key: 'theaterData', label: '小剧场（剧情、预设、API设置）' },
        { key: 'globalSettings', label: '全局设置（API、壁纸、主题等）' }
    ];
    const partialExportModalId = 'partial-export-modal';
    const partialExportModal = document.createElement('div');
    partialExportModal.id = partialExportModalId;
    partialExportModal.className = 'modal-overlay';
    partialExportModal.style.display = 'none';
    partialExportModal.style.alignItems = 'center';
    partialExportModal.style.justifyContent = 'center';
    partialExportModal.innerHTML = `
        <div class="modal-window" style="max-width: 320px;">
            <h3 style="margin-top:0;">分类导出数据</h3>
            <p style="font-size: 0.89rem; color: #666; margin-bottom: 12px;">选择要导出的数据表（可多选），仅导出选中部分。</p>
            <div id="partial-export-checkboxes" style="margin-bottom: 12px;"></div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <button type="button" id="partial-export-select-all" class="btn btn-neutral" style="flex:1;">全选</button>
                <button type="button" id="partial-export-select-none" class="btn btn-neutral" style="flex:1;">取消全选</button>
            </div>
            <div style="display: flex; gap: 8px;">
                <button type="button" id="partial-export-do-btn" class="btn btn-primary" style="flex:1;">导出选中</button>
                <button type="button" id="partial-export-cancel-btn" class="btn btn-neutral" style="flex:1;">取消</button>
            </div>
        </div>
    `;
    if (!document.getElementById(partialExportModalId)) document.body.appendChild(partialExportModal);

    const partialExportBtn = createActionItem('button', '分类导出数据', 'btn btn-primary');
    partialExportBtn.disabled = loadingBtn;
    partialExportBtn.addEventListener('click', () => {
        const container = document.getElementById('partial-export-checkboxes');
        container.innerHTML = '';
        PARTIAL_EXPORT_OPTIONS.forEach(opt => {
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.marginBottom = '8px';
            label.style.cursor = 'pointer';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.dataset.key = opt.key;
            cb.checked = true;
            label.appendChild(cb);
            label.appendChild(document.createTextNode(' ' + opt.label));
            container.appendChild(label);
        });
        document.getElementById(partialExportModalId).style.display = 'flex';
    });

    document.getElementById('partial-export-select-all').addEventListener('click', () => {
        document.querySelectorAll('#partial-export-checkboxes input[type="checkbox"]').forEach(cb => cb.checked = true);
    });
    document.getElementById('partial-export-select-none').addEventListener('click', () => {
        document.querySelectorAll('#partial-export-checkboxes input[type="checkbox"]').forEach(cb => cb.checked = false);
    });
    document.getElementById('partial-export-cancel-btn').addEventListener('click', () => {
        document.getElementById(partialExportModalId).style.display = 'none';
    });
    document.getElementById('partial-export-do-btn').addEventListener('click', async () => {
        const selected = [];
        document.querySelectorAll('#partial-export-checkboxes input[type="checkbox"]:checked').forEach(cb => selected.push(cb.dataset.key));
        if (selected.length === 0) {
            showToast('请至少选择一项数据');
            return;
        }
        document.getElementById(partialExportModalId).style.display = 'none';
        if (loadingBtn) return;
        loadingBtn = true;
        const exportButton = document.getElementById('partial-export-do-btn');
        const originalText = exportButton ? exportButton.textContent : '';
        if (exportButton) {
            exportButton.disabled = true;
            exportButton.textContent = '导出中…';
        }
        try {
            showToast('正在准备分类导出...');
            await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
            const compressedBlob = await createCompressedBackupBlob({ selectedKeys: selected });

            const now = new Date();
            const date = now.toISOString().slice(0, 10);
            const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
            await OvoFileDownload.save(compressedBlob, `章鱼喷墨_分类导出_${date}_${time}.ee`);

        } catch (e) {
            showToast(`分类导出失败: ${e.message}`);
            console.error('分类导出错误:', e);
        } finally {
            loadingBtn = false;
            if (exportButton) {
                exportButton.disabled = false;
                exportButton.textContent = originalText;
            }
        }
    });

    // 高级清理：按 APP 多选清除
    const ADVANCED_CLEAN_OPTIONS = [
        { key: 'worldBooks', label: '世界书（全部世界书）' },
        { key: 'chat', label: '聊天（角色、群聊及所有聊天记录）' },
        { key: 'myStickers', label: '表情包' },
        { key: 'favorites', label: '收藏' },
        { key: 'forum', label: '论坛' },
        { key: 'theater', label: '小剧场' }
    ];
    const advancedCleanModalId = 'advanced-clean-modal';
    const advancedCleanModal = document.createElement('div');
    advancedCleanModal.id = advancedCleanModalId;
    advancedCleanModal.className = 'modal-overlay';
    advancedCleanModal.style.display = 'none';
    advancedCleanModal.style.alignItems = 'center';
    advancedCleanModal.style.justifyContent = 'center';
    advancedCleanModal.innerHTML = `
        <div class="modal-window" style="max-width: 320px;">
            <h3 style="margin-top:0;">高级清理</h3>
            <p style="font-size: 0.89rem; color: #666; margin-bottom: 12px;">选择要清空的 APP 数据（可多选），将清除该分类下的全部内容。操作不可恢复，请谨慎选择。</p>
            <div id="advanced-clean-checkboxes" style="margin-bottom: 12px;"></div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <button type="button" id="advanced-clean-select-all" class="btn btn-neutral" style="flex:1;">全选</button>
                <button type="button" id="advanced-clean-select-none" class="btn btn-neutral" style="flex:1;">取消全选</button>
            </div>
            <div style="display: flex; gap: 8px;">
                <button type="button" id="advanced-clean-do-btn" class="btn btn-danger" style="flex:1;">执行清理</button>
                <button type="button" id="advanced-clean-cancel-btn" class="btn btn-neutral" style="flex:1;">取消</button>
            </div>
        </div>
    `;
    if (!document.getElementById(advancedCleanModalId)) document.body.appendChild(advancedCleanModal);

    const advancedCleanBtn = createActionItem('button', '高级清理', 'btn btn-neutral');
    advancedCleanBtn.disabled = loadingBtn;

    advancedCleanBtn.addEventListener('click', () => {
        const container = document.getElementById('advanced-clean-checkboxes');
        container.innerHTML = '';
        ADVANCED_CLEAN_OPTIONS.forEach(opt => {
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.marginBottom = '8px';
            label.style.cursor = 'pointer';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.dataset.key = opt.key;
            cb.checked = false;
            label.appendChild(cb);
            label.appendChild(document.createTextNode(' ' + opt.label));
            container.appendChild(label);
        });
        document.getElementById(advancedCleanModalId).style.display = 'flex';
    });

    document.getElementById('advanced-clean-select-all').addEventListener('click', () => {
        document.querySelectorAll('#advanced-clean-checkboxes input[type="checkbox"]').forEach(cb => cb.checked = true);
    });
    document.getElementById('advanced-clean-select-none').addEventListener('click', () => {
        document.querySelectorAll('#advanced-clean-checkboxes input[type="checkbox"]').forEach(cb => cb.checked = false);
    });
    document.getElementById('advanced-clean-cancel-btn').addEventListener('click', () => {
        document.getElementById(advancedCleanModalId).style.display = 'none';
    });
    document.getElementById('advanced-clean-do-btn').addEventListener('click', async () => {
        const selected = [];
        document.querySelectorAll('#advanced-clean-checkboxes input[type="checkbox"]:checked').forEach(cb => selected.push(cb.dataset.key));
        if (selected.length === 0) {
            showToast('请至少选择一项要清理的数据');
            return;
        }
        const labels = selected.map(k => ADVANCED_CLEAN_OPTIONS.find(o => o.key === k).label).join('、');
        const confirmed = await customConfirm('即将清空以下数据：\n\n' + labels + '\n\n此操作不可恢复，确定继续？', '高级清理确认');
        if (!confirmed) return;

        document.getElementById(advancedCleanModalId).style.display = 'none';
        if (loadingBtn) return;
        loadingBtn = true;
        advancedCleanBtn.disabled = true;

        try {
            showToast('正在执行高级清理...');
            const report = [];

            if (selected.includes('worldBooks')) {
                const n = (db.worldBooks && db.worldBooks.length) || 0;
                db.worldBooks = [];
                if (n > 0) report.push(`世界书：已清空 ${n} 条`);
            }
            if (selected.includes('chat')) {
                const charN = (db.characters && db.characters.length) || 0;
                const groupN = (db.groups && db.groups.length) || 0;
                db.characters = [];
                db.groups = [];
                if (db.chatFolders) db.chatFolders = [];
                await dexieDB.characters.clear();
                await dexieDB.groups.clear();
                if (charN > 0 || groupN > 0) report.push(`聊天：已清空 ${charN} 个角色、${groupN} 个群聊及全部聊天记录`);
            }
            if (selected.includes('myStickers')) {
                const n = (db.myStickers && db.myStickers.length) || 0;
                db.myStickers = [];
                if (n > 0) report.push(`表情包：已清空 ${n} 个`);
            }
            if (selected.includes('favorites')) {
                const n = (db.favorites && db.favorites.length) || 0;
                db.favorites = [];
                if (n > 0) report.push(`收藏：已清空 ${n} 条`);
            }
            if (selected.includes('forum')) {
                db.forumPosts = [];
                db.forumMessages = [];
                db.forumBindings = { worldBookIds: [], charIds: [], userPersonaIds: [] };
                db.forumUserProfile = { username: '', avatar: 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg', bio: '', joinDate: 0 };
                db.forumSettings = db.forumSettings || {};
                db.forumStrangerProfiles = {};
                db.forumAccountStates = {};
                db.forumRelationships = {};
                db.forumKnowledge = [];
                db.forumSocialEdges = [];
                db.forumStoryThreads = [];
                db.forumEvents = [];
                db.forumNotifications = [];
                db.forumDrafts = [];
                db.forumFriendRequests = [];
                db.forumPendingRequestFromUser = {};
                report.push('论坛：已清空帖子、消息及绑定等');
            }
            if (selected.includes('theater')) {
                const scenarioN = (db.theaterScenarios && db.theaterScenarios.length) || 0;
                const htmlScenarioN = (db.theaterHtmlScenarios && db.theaterHtmlScenarios.length) || 0;
                db.theaterScenarios = [];
                db.theaterHtmlScenarios = [];
                db.theaterPromptPresets = db.theaterPromptPresets || [];
                db.theaterHtmlPromptPresets = db.theaterHtmlPromptPresets || [];
                const presetN = db.theaterPromptPresets.length;
                const htmlPresetN = db.theaterHtmlPromptPresets.length;
                db.theaterPromptPresets = [];
                db.theaterHtmlPromptPresets = [];
                const totalScenarios = scenarioN + htmlScenarioN;
                const totalPresets = presetN + htmlPresetN;
                if (totalScenarios > 0 || totalPresets > 0) report.push(`小剧场：已清空 ${totalScenarios} 个剧本、${totalPresets} 个预设`);
            }

            await saveData(db);
            const summary = report.length ? report.join('\n') : '已清理所选数据';
            showToast('高级清理完成');
            await customAlert('高级清理完成！\n\n' + summary, '清理完成');
            setTimeout(() => window.location.reload(), 500);
        } catch (e) {
            console.error('高级清理失败:', e);
            showToast('高级清理失败: ' + e.message);
            await customAlert('清理过程中发生错误：\n' + e.message, '清理失败');
        } finally {
            loadingBtn = false;
            advancedCleanBtn.disabled = false;
        }
    });

    // 角色高级清理：按角色/群聊多选 + 按数据项多选，只清空选中对象的选中数据
    const CHAR_CLEAN_DATA_OPTIONS = [
        { key: 'history', label: '聊天记录' },
        { key: 'statusPanel', label: '状态面板数据' },
        { key: 'gallery', label: '相册' },
        { key: 'callHistory', label: '通话记录' },
        { key: 'peekData', label: '窥屏数据' },
        { key: 'userAvatarLibrary', label: '用户头像库' },
        { key: 'charAvatarLibrary', label: '角色头像库' },
        { key: 'worldBookIds', label: '绑定世界书' },
        { key: 'piggyBank', label: '钱包转账/亲属卡记录' }
    ];
    const charCleanModalId = 'char-advanced-clean-modal';
    const charCleanModal = document.createElement('div');
    charCleanModal.id = charCleanModalId;
    charCleanModal.className = 'modal-overlay';
    charCleanModal.style.display = 'none';
    charCleanModal.style.alignItems = 'center';
    charCleanModal.style.justifyContent = 'center';
    charCleanModal.innerHTML = `
        <div class="modal-window char-advanced-clean-window" style="max-width: 420px; max-height: 88vh; display: flex; flex-direction: column; padding: 20px;">
            <h3 style="margin:0 0 8px; font-size:1.15rem; color:#333; text-align:center;">角色高级清理</h3>
            <p style="font-size: 0.88rem; color: #777; margin: 0 0 16px; line-height: 1.5; text-align:center;">选择要清理的角色/群聊，再选择要清空的数据项。<br>仅清空选中对象的数据，不删除对象本身。</p>
            <div style="flex:1; min-height:0; overflow-y: auto; margin-bottom: 16px; padding-right:4px;">
                <div class="char-clean-section-head">
                    <span class="char-clean-section-title">选择角色/群聊</span>
                    <span class="char-clean-head-actions">
                        <button type="button" id="char-clean-entity-select-all" class="btn btn-neutral char-clean-head-btn">全选</button>
                        <button type="button" id="char-clean-entity-select-none" class="btn btn-neutral char-clean-head-btn">取消全选</button>
                    </span>
                </div>
                <div id="char-clean-entity-list" class="char-clean-entity-list"></div>
                <div class="char-clean-section-head" style="margin-top:20px;">
                    <span class="char-clean-section-title">选择要清理的数据项</span>
                    <span class="char-clean-head-actions">
                        <button type="button" id="char-clean-options-select-all" class="btn btn-neutral char-clean-head-btn">全选</button>
                        <button type="button" id="char-clean-options-select-none" class="btn btn-neutral char-clean-head-btn">取消全选</button>
                    </span>
                </div>
                <div id="char-clean-options-list" class="char-clean-options-list"></div>
            </div>
            <div style="display: flex; gap: 12px; flex-shrink: 0; padding-top: 12px; border-top: 1px solid #f0f0f0;">
                <button type="button" id="char-clean-do-btn" class="btn btn-danger" style="flex:1; padding: 10px; border-radius: 10px; font-weight: 500;">执行清理</button>
                <button type="button" id="char-clean-cancel-btn" class="btn btn-neutral" style="flex:1; padding: 10px; border-radius: 10px; font-weight: 500;">取消</button>
            </div>
        </div>
    `;
    if (!document.getElementById(charCleanModalId)) document.body.appendChild(charCleanModal);

    const charCleanBtn = createActionItem('button', '角色高级清理', 'btn btn-neutral');
    charCleanBtn.disabled = loadingBtn;

    function renderCharCleanEntityList() {
        const container = document.getElementById('char-clean-entity-list');
        if (!container) return;
        container.innerHTML = '';
        const chars = db.characters || [];
        const groups = db.groups || [];
        if (chars.length === 0 && groups.length === 0) {
            container.innerHTML = '<div style="color:#999; font-size:0.89rem;">暂无角色或群聊</div>';
            return;
        }
        chars.forEach(c => {
            const label = document.createElement('label');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.dataset.type = 'char';
            cb.dataset.id = c.id;
            label.appendChild(cb);
            if (c.avatar) {
                const img = document.createElement('img');
                img.src = c.avatar;
                img.alt = '';
                img.className = 'char-clean-avatar';
                label.appendChild(img);
            } else {
                const placeholder = document.createElement('span');
                placeholder.className = 'char-clean-avatar';
                placeholder.style.cssText = 'background:#e0e0e0; display:block; flex-shrink:0;';
                label.appendChild(placeholder);
            }
            const span = document.createElement('span');
            span.className = 'char-clean-name';
            span.textContent = (c.remarkName || c.realName || '未命名角色').trim() || c.id;
            label.appendChild(span);
            container.appendChild(label);
        });
        groups.forEach(g => {
            const label = document.createElement('label');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.dataset.type = 'group';
            cb.dataset.id = g.id;
            label.appendChild(cb);
            if (g.avatar) {
                const img = document.createElement('img');
                img.src = g.avatar;
                img.alt = '';
                img.className = 'char-clean-avatar';
                label.appendChild(img);
            } else {
                const placeholder = document.createElement('span');
                placeholder.className = 'char-clean-avatar';
                placeholder.style.cssText = 'background:#e0e0e0; display:block; flex-shrink:0;';
                label.appendChild(placeholder);
            }
            const span = document.createElement('span');
            span.className = 'char-clean-name';
            span.textContent = '[群] ' + ((g.name || '未命名群聊').trim() || g.id);
            label.appendChild(span);
            container.appendChild(label);
        });
    }

    charCleanBtn.addEventListener('click', () => {
        renderCharCleanEntityList();
        const optContainer = document.getElementById('char-clean-options-list');
        optContainer.innerHTML = '';
        CHAR_CLEAN_DATA_OPTIONS.forEach(opt => {
            const label = document.createElement('label');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.dataset.key = opt.key;
            cb.checked = opt.key === 'history';
            label.appendChild(cb);
            label.appendChild(document.createTextNode(opt.label));
            optContainer.appendChild(label);
        });
        document.getElementById(charCleanModalId).style.display = 'flex';
    });

    document.getElementById('char-clean-entity-select-all').addEventListener('click', () => {
        document.querySelectorAll('#char-clean-entity-list input[type="checkbox"]').forEach(cb => cb.checked = true);
    });
    document.getElementById('char-clean-entity-select-none').addEventListener('click', () => {
        document.querySelectorAll('#char-clean-entity-list input[type="checkbox"]').forEach(cb => cb.checked = false);
    });
    document.getElementById('char-clean-options-select-all').addEventListener('click', () => {
        document.querySelectorAll('#char-clean-options-list input[type="checkbox"]').forEach(cb => cb.checked = true);
    });
    document.getElementById('char-clean-options-select-none').addEventListener('click', () => {
        document.querySelectorAll('#char-clean-options-list input[type="checkbox"]').forEach(cb => cb.checked = false);
    });
    document.getElementById('char-clean-cancel-btn').addEventListener('click', () => {
        document.getElementById(charCleanModalId).style.display = 'none';
    });
    document.getElementById('char-clean-do-btn').addEventListener('click', async () => {
        const selectedEntities = [];
        document.querySelectorAll('#char-clean-entity-list input[type="checkbox"]:checked').forEach(cb => {
            selectedEntities.push({ type: cb.dataset.type, id: cb.dataset.id });
        });
        const selectedKeys = [];
        document.querySelectorAll('#char-clean-options-list input[type="checkbox"]:checked').forEach(cb => selectedKeys.push(cb.dataset.key));
        if (selectedEntities.length === 0) {
            showToast('请至少选择一个角色或群聊');
            return;
        }
        if (selectedKeys.length === 0) {
            showToast('请至少选择一项要清理的数据');
            return;
        }
        const keyLabels = selectedKeys.map(k => CHAR_CLEAN_DATA_OPTIONS.find(o => o.key === k).label).join('、');
        const confirmed = await customConfirm(`将对 ${selectedEntities.length} 个对象清理以下数据：\n\n${keyLabels}\n\n此操作不可恢复，确定继续？`, '确认清理');
        if (!confirmed) return;

        document.getElementById(charCleanModalId).style.display = 'none';
        if (loadingBtn) return;
        loadingBtn = true;
        charCleanBtn.disabled = true;

        try {
            showToast('正在执行角色高级清理...');
            const reportMap = new Map();
            for (const { type, id } of selectedEntities) {
                if (type === 'char') {
                    const char = (db.characters || []).find(c => c.id === id);
                    if (!char) continue;
                    const name = char.remarkName || char.realName || '未命名角色';
                    let cleared = [];
                    if (selectedKeys.includes('history') && Array.isArray(char.history)) {
                        char.history = [];
                        cleared.push('聊天记录');
                    }
                    if (selectedKeys.includes('statusPanel') && char.statusPanel) {
                        char.statusPanel.history = [];
                        char.statusPanel.currentStatusRaw = '';
                        char.statusPanel.currentStatusHtml = '';
                        char.status = '在线';
                        cleared.push('状态面板');
                    }
                    if (selectedKeys.includes('gallery') && Array.isArray(char.gallery)) {
                        char.gallery = [];
                        cleared.push('相册');
                    }
                    if (selectedKeys.includes('callHistory') && Array.isArray(char.callHistory)) {
                        char.callHistory = [];
                        cleared.push('通话记录');
                    }
                    if (selectedKeys.includes('peekData') && char.peekData && typeof char.peekData === 'object') {
                        char.peekData = {};
                        cleared.push('窥屏数据');
                    }
                    if (selectedKeys.includes('userAvatarLibrary') && Array.isArray(char.userAvatarLibrary)) {
                        char.userAvatarLibrary = [];
                        cleared.push('用户头像库');
                    }
                    if (selectedKeys.includes('charAvatarLibrary') && Array.isArray(char.charAvatarLibrary)) {
                        char.charAvatarLibrary = [];
                        cleared.push('角色头像库');
                    }
                    if (selectedKeys.includes('worldBookIds') && Array.isArray(char.worldBookIds)) {
                        char.worldBookIds = [];
                        cleared.push('绑定世界书');
                    }
                    if (selectedKeys.includes('piggyBank') && db.piggyBank) {
                        let piggyCleared = false;
                        // 清理该角色与用户的存钱罐交易（根据 charName 匹配，如果有的话，目前 transactions 里的 charName 是角色名）
                        // 为精准匹配，最好能查找到相关的交易。这里根据 charName (如果记录了的话) 或者是 source
                        const nameToMatch = char.realName || char.remarkName || '';
                        if (nameToMatch && db.piggyBank.transactions) {
                            const beforeLen = db.piggyBank.transactions.length;
                            const toRemove = db.piggyBank.transactions.filter(t => t.charName === nameToMatch);
                            if (toRemove.length > 0) {
                                // 不退还金额，因为是强制清理，直接删记录
                                db.piggyBank.transactions = db.piggyBank.transactions.filter(t => t.charName !== nameToMatch);
                                piggyCleared = true;
                            }
                        }
                        // 清理亲属卡
                        if (db.piggyBank.familyCards) {
                            const beforeLen = db.piggyBank.familyCards.length;
                            db.piggyBank.familyCards = db.piggyBank.familyCards.filter(c => c.targetCharId !== id);
                            if (beforeLen !== db.piggyBank.familyCards.length) piggyCleared = true;
                        }
                        if (db.piggyBank.receivedFamilyCards) {
                            const beforeLen = db.piggyBank.receivedFamilyCards.length;
                            db.piggyBank.receivedFamilyCards = db.piggyBank.receivedFamilyCards.filter(c => c.fromCharId !== id);
                            if (beforeLen !== db.piggyBank.receivedFamilyCards.length) piggyCleared = true;
                        }
                        if (piggyCleared) cleared.push('钱包转账/亲属卡记录');
                    }
                    if (cleared.length) {
                        const key = cleared.join('、');
                        if (!reportMap.has(key)) reportMap.set(key, []);
                        reportMap.get(key).push(name);
                    }
                } else if (type === 'group') {
                    const group = (db.groups || []).find(g => g.id === id);
                    if (!group) continue;
                    const name = group.name || '未命名群聊';
                    let cleared = [];
                    if (selectedKeys.includes('history') && Array.isArray(group.history)) {
                        group.history = [];
                        cleared.push('聊天记录');
                    }
                    if (selectedKeys.includes('callHistory') && Array.isArray(group.callHistory)) {
                        group.callHistory = [];
                        cleared.push('通话记录');
                    }
                    if (selectedKeys.includes('worldBookIds') && Array.isArray(group.worldBookIds)) {
                        group.worldBookIds = [];
                        cleared.push('绑定世界书');
                    }
                    // 群聊目前不支持存钱罐亲属卡，但如果将来有相关交易记录，也可以清理
                    if (selectedKeys.includes('piggyBank') && db.piggyBank) {
                        let piggyCleared = false;
                        const nameToMatch = group.name || '';
                        if (nameToMatch && db.piggyBank.transactions) {
                            const toRemove = db.piggyBank.transactions.filter(t => t.charName === nameToMatch);
                            if (toRemove.length > 0) {
                                db.piggyBank.transactions = db.piggyBank.transactions.filter(t => t.charName !== nameToMatch);
                                piggyCleared = true;
                            }
                        }
                        if (piggyCleared) cleared.push('钱包转账记录');
                    }
                    if (cleared.length) {
                        const key = cleared.join('、');
                        if (!reportMap.has(key)) reportMap.set(key, []);
                        reportMap.get(key).push(`[群] ${name}`);
                    }
                }
            }
            await saveData(db);
            showToast('角色高级清理完成');
            
            if (reportMap.size > 0) {
                const reportLines = [];
                for (const [clearedItems, names] of reportMap.entries()) {
                    let namesStr = names.slice(0, 3).join('、');
                    if (names.length > 3) {
                        namesStr += ` 等 ${names.length} 个对象`;
                    }
                    reportLines.push(`【${namesStr}】\n${clearedItems}`);
                }
                
                await customAlert('角色高级清理完成！\n\n' + reportLines.slice(0, 5).join('\n\n') + (reportLines.length > 5 ? '\n\n… 等其他清理项' : ''), '清理完成');
            } else {
                await customAlert('角色高级清理完成（所选对象中无匹配数据）', '清理完成');
            }
            if (typeof window.refreshChatList === 'function') window.refreshChatList();
            setTimeout(() => window.location.reload(), 500);
        } catch (e) {
            console.error('角色高级清理失败:', e);
            showToast('角色高级清理失败: ' + e.message);
            await customAlert('清理过程中发生错误：\n' + e.message, '清理失败');
        } finally {
            loadingBtn = false;
            charCleanBtn.disabled = false;
        }
    });

    // 清理本地图片：对话中发送的 base64/data URL 图片（不含头像、相册）
    const isLocalImageData = (s) => typeof s === 'string' && (s.startsWith('data:image/') || (s.length > 200 && /^[A-Za-z0-9+/=]+$/.test(s)));
    const dataUrlToBytes = (s) => {
        if (!s || typeof s !== 'string') return 0;
        if (s.startsWith('data:')) {
            const base64 = s.indexOf('base64,') >= 0 ? s.split('base64,')[1] : '';
            return base64 ? Math.ceil((base64.length * 3) / 4) : 0;
        }
        return Math.ceil((s.length * 3) / 4);
    };
    const getMessageLocalImageBytes = (msg) => {
        let bytes = 0;
        if (msg.content && isLocalImageData(msg.content)) bytes += dataUrlToBytes(msg.content);
        if (msg.parts && Array.isArray(msg.parts)) {
            msg.parts.forEach(p => { if (p.type === 'image' && p.data && isLocalImageData(p.data)) bytes += dataUrlToBytes(p.data); });
        }
        return bytes;
    };
    const getLocalImageStats = () => {
        const list = [];
        (db.characters || []).forEach(char => {
            let bytes = 0;
            (char.history || []).forEach(msg => { bytes += getMessageLocalImageBytes(msg); });
            if (bytes > 0) list.push({ id: char.id, type: 'private', name: (char.remarkName || char.realName || '未命名角色'), bytes });
        });
        (db.groups || []).forEach(group => {
            let bytes = 0;
            (group.history || []).forEach(msg => { bytes += getMessageLocalImageBytes(msg); });
            if (bytes > 0) list.push({ id: group.id, type: 'group', name: group.name || '未命名群聊', bytes });
        });
        return list;
    };
    const clearLocalImagesInHistory = (history) => {
        if (!history || !Array.isArray(history)) return;
        history.forEach(msg => {
            if (msg.content && isLocalImageData(msg.content)) msg.content = '';
            if (msg.parts && Array.isArray(msg.parts)) {
                msg.parts = msg.parts.filter(p => p.type !== 'image' || !p.data || !isLocalImageData(p.data));
                if (msg.parts.length === 0 && msg.content === undefined) msg.content = '';
            }
        });
    };
    const formatBytes = (b) => b >= 1048576 ? (b / 1048576).toFixed(2) + ' MB' : (b >= 1024 ? (b / 1024).toFixed(2) + ' KB' : b + ' B');

    const cleanLocalImagesModalId = 'clean-local-images-modal';
    const cleanLocalImagesModal = document.createElement('div');
    cleanLocalImagesModal.id = cleanLocalImagesModalId;
    cleanLocalImagesModal.className = 'modal-overlay';
    cleanLocalImagesModal.style.display = 'none';
    cleanLocalImagesModal.style.alignItems = 'center';
    cleanLocalImagesModal.style.justifyContent = 'center';
    cleanLocalImagesModal.innerHTML = `
        <div class="modal-window" style="max-width: 360px;">
            <h3 style="margin-top:0;">清理本地图片</h3>
            <p style="font-size: 0.89rem; color: #666; margin-bottom: 12px;">仅清理对话中发送的本地图片（base64），不影响头像与相册。选中会话后执行，该会话中的本地图片将被清空，占用变为空。</p>
            <div id="clean-local-images-list" style="margin-bottom: 12px; max-height: 240px; overflow-y: auto;"></div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <button type="button" id="clean-local-images-select-all" class="btn btn-neutral" style="flex:1;">全选</button>
                <button type="button" id="clean-local-images-select-none" class="btn btn-neutral" style="flex:1;">取消全选</button>
            </div>
            <div style="display: flex; gap: 8px;">
                <button type="button" id="clean-local-images-do-btn" class="btn btn-danger" style="flex:1;">执行清理</button>
                <button type="button" id="clean-local-images-cancel-btn" class="btn btn-neutral" style="flex:1;">取消</button>
            </div>
        </div>
    `;
    if (!document.getElementById(cleanLocalImagesModalId)) {
        document.body.appendChild(cleanLocalImagesModal);
        const modalEl = document.getElementById(cleanLocalImagesModalId);
        modalEl.addEventListener('click', (e) => {
            const id = e.target.id;
            if (id === 'clean-local-images-cancel-btn') {
                modalEl.style.display = 'none';
                return;
            }
            if (id === 'clean-local-images-select-all') {
                document.querySelectorAll('#clean-local-images-list input[type="checkbox"]').forEach(cb => cb.checked = true);
                return;
            }
            if (id === 'clean-local-images-select-none') {
                document.querySelectorAll('#clean-local-images-list input[type="checkbox"]').forEach(cb => cb.checked = false);
                return;
            }
            if (id === 'clean-local-images-do-btn') {
                const selected = [];
                document.querySelectorAll('#clean-local-images-list input[type="checkbox"]:checked').forEach(cb => {
                    selected.push({ id: cb.dataset.chatId, type: cb.dataset.chatType });
                });
                if (selected.length === 0) {
                    showToast('请至少选择一个角色或群聊');
                    return;
                }
                customConfirm(`即将清理 ${selected.length} 个会话中的本地图片，图片将被清空。确定继续？`, '清理图片').then(confirmed => {
                    if (!confirmed) return;

                    modalEl.style.display = 'none';
                    if (loadingBtn) return;
                    loadingBtn = true;
                    const openBtn = document.getElementById('clean-local-images-open-btn');
                    if (openBtn) openBtn.disabled = true;

                    (async () => {
                        try {
                            showToast('正在清理本地图片...');
                            selected.forEach(({ id, type }) => {
                                if (type === 'private') {
                                    const char = db.characters.find(c => c.id === id);
                                    if (char && char.history) clearLocalImagesInHistory(char.history);
                                } else {
                                    const group = db.groups.find(g => g.id === id);
                                    if (group && group.history) clearLocalImagesInHistory(group.history);
                                }
                            });
                            await saveData(db);
                            showToast('清理完成');
                            await customAlert('清理完成！所选会话中的本地图片已清空，占用已为空。', '清理完成');
                            setTimeout(() => window.location.reload(), 500);
                        } catch (err) {
                            console.error('清理本地图片失败:', err);
                            showToast('清理失败: ' + err.message);
                            await customAlert('清理过程中发生错误：\n' + err.message, '清理失败');
                        } finally {
                            loadingBtn = false;
                            if (openBtn) openBtn.disabled = false;
                        }
                    })();
                });
            }
        });
    }

    const cleanLocalImagesBtn = createActionItem('button', '清理本地图片', 'btn btn-neutral');
    cleanLocalImagesBtn.id = 'clean-local-images-open-btn';
    cleanLocalImagesBtn.disabled = loadingBtn;

    cleanLocalImagesBtn.addEventListener('click', () => {
        const list = getLocalImageStats();
        const container = document.getElementById('clean-local-images-list');
        container.innerHTML = '';
        if (list.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#999; padding:16px;">当前没有角色或群聊含有对话中的本地图片。</p>';
            document.getElementById('clean-local-images-do-btn').disabled = true;
        } else {
            document.getElementById('clean-local-images-do-btn').disabled = false;
            list.forEach(item => {
                const label = document.createElement('label');
                label.style.display = 'flex';
                label.style.alignItems = 'center';
                label.style.marginBottom = '8px';
                label.style.cursor = 'pointer';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.dataset.chatId = item.id;
                cb.dataset.chatType = item.type;
                cb.checked = false;
                label.appendChild(cb);
                const tag = item.type === 'group' ? '群聊' : '角色';
                label.appendChild(document.createTextNode(` ${item.name}（${tag}） ${formatBytes(item.bytes)}`));
                container.appendChild(label);
            });
        }
        const modalEl = document.getElementById(cleanLocalImagesModalId);
        if (modalEl) modalEl.style.display = 'flex';
    });

    const importDataBtn = createActionItem('label', '导入数据', 'btn btn-neutral');
    importDataBtn.setAttribute('for', 'import-data-input');
    // For label, we can't easily disable click via disabled attr if it has 'for', but we preserve logic
    importDataBtn.disabled = loadingBtn;
    document.querySelector('#import-data-input').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const confirmed = await customConfirm('此操作将覆盖当前所有聊天记录和设置。此操作不可撤销。确定要继续吗？', '确认导入');
        if(confirmed){
            try {
                showToast('正在导入数据，请稍候...');
                const archiveInfo = await inspectBackupArchive(file);
                let importResult;
                if (archiveInfo.stream) {
                    importResult = await importStreamBackupData(file, {
                        onProgress: message => showToast(message)
                    });
                } else {
                    const decompressionStream = new DecompressionStream('gzip');
                    const decompressedStream = file.stream().pipeThrough(decompressionStream);
                    const jsonString = await new Response(decompressedStream).text();
                    const data = JSON.parse(jsonString);
                    importResult = await importBackupData(data);
                }

                if (importResult.success) {
                    showToast(`数据导入成功！${importResult.message} 应用即将刷新。`);
                    setTimeout(() => {
                        window.location.reload();
                    }, 1500);
                } else {
                    showToast(`导入失败: ${importResult.error}`);
                }
            } catch (error) {
                console.error("导入失败:", error);
                showToast(`解压或解析文件时发生错误: ${error.message}`);
            } finally {
                event.target.value = null;
            }
        }else {
            event.target.value = null;
        }

    })

    const cleanRedundantDataBtn = createActionItem('button', '清除冗余/无用数据', 'btn btn-neutral');
    cleanRedundantDataBtn.disabled = loadingBtn;

    cleanRedundantDataBtn.addEventListener('click', async () => {
        if (loadingBtn) return;

        const msg = '此操作将清除以下无用数据：\n\n' +
            '• 无聊天记录的角色\n' +
            '• 无聊天记录的群聊\n' +
            '• 未被任何角色/群聊使用的世界书\n' +
            '• 无效的表情包（无链接等）\n\n' +
            '⚠️ 不会影响有聊天记录的角色和正在使用的数据。\n\n确定继续吗？';

        const confirmed = await customConfirm(msg, '清除无用数据');
        if (!confirmed) return;

        loadingBtn = true;
        cleanRedundantDataBtn.disabled = true;

        try {
            showToast('正在扫描冗余数据...');

            let cleanCount = 0;
            const report = [];

            // 先收集世界书引用（在删除角色/群聊之前），避免误删被引用的世界书
            const usedWorldBookIds = new Set();
            if (db.characters && Array.isArray(db.characters)) {
                db.characters.forEach(char => {
                    if (char.worldBookIds && Array.isArray(char.worldBookIds)) {
                        char.worldBookIds.forEach(id => usedWorldBookIds.add(id));
                    }
                });
            }
            if (db.groups && Array.isArray(db.groups)) {
                db.groups.forEach(group => {
                    if (group.worldBookIds && Array.isArray(group.worldBookIds)) {
                        group.worldBookIds.forEach(id => usedWorldBookIds.add(id));
                    }
                });
            }

            // 清理完全没有聊天记录的角色（保留有greeting等至少1条消息的角色）
            if (db.characters && Array.isArray(db.characters)) {
                const beforeCount = db.characters.length;
                db.characters = db.characters.filter(char => {
                    if (!char.history || char.history.length === 0) return false;
                    return true;
                });
                const removed = beforeCount - db.characters.length;
                if (removed > 0) {
                    report.push(`清理了 ${removed} 个无聊天记录的角色`);
                    cleanCount += removed;
                }
            }

            if (db.groups && Array.isArray(db.groups)) {
                const beforeCount = db.groups.length;
                db.groups = db.groups.filter(group => {
                    if (!group.history || group.history.length === 0) return false;
                    return true;
                });
                const removed = beforeCount - db.groups.length;
                if (removed > 0) {
                    report.push(`清理了 ${removed} 个无聊天记录的群聊`);
                    cleanCount += removed;
                }
            }

            // 使用之前收集的引用来清理世界书
            if (db.worldBooks && Array.isArray(db.worldBooks)) {
                const beforeCount = db.worldBooks.length;
                db.worldBooks = db.worldBooks.filter(wb => usedWorldBookIds.has(wb.id));
                const removed = beforeCount - db.worldBooks.length;
                if (removed > 0) {
                    report.push(`清理了 ${removed} 个未使用的世界书`);
                    cleanCount += removed;
                }
            }

            // 表情包：只清理真正无效的（无data字段或data为空）
            if (db.myStickers && Array.isArray(db.myStickers)) {
                const beforeCount = db.myStickers.length;
                db.myStickers = db.myStickers.filter(sticker => {
                    if (!sticker) return false;
                    const hasData = sticker.data && String(sticker.data).trim() !== '';
                    const hasUrl = sticker.url && String(sticker.url).trim() !== '';
                    return hasData || hasUrl;
                });
                const removed = beforeCount - db.myStickers.length;
                if (removed > 0) {
                    report.push(`清理了 ${removed} 个无效的表情包`);
                    cleanCount += removed;
                }
            }

            if (cleanCount > 0) {
                showToast('正在保存清理结果...');
                await saveData(db);
                const summary = report.join('\n');
                showToast(`清理完成！共清理 ${cleanCount} 项冗余数据`);
                await customAlert(`清理完成！\n\n${summary}\n\n共清理了 ${cleanCount} 项冗余数据。`, '清理完成');
                setTimeout(() => window.location.reload(), 500);
            } else {
                showToast('没有发现需要清理的冗余数据');
                await customAlert('检查完成！\n\n未发现需要清理的冗余数据，您的数据很健康。', '清理完成');
            }
        } catch (e) {
            console.error('清理失败:', e);
            showToast('清理失败: ' + e.message);
            await customAlert('清理过程中发生错误：\n' + e.message, '清理失败');
        } finally {
            loadingBtn = false;
            cleanRedundantDataBtn.disabled = false;
        }
    });

    const clearDataBtn = createActionItem('button', '清除所有数据', 'btn btn-danger', true);
    clearDataBtn.disabled = loadingBtn;

    clearDataBtn.addEventListener('click', async () => {
        const msg = '确定要清除本项目的所有本地数据吗？\n\n将清除：聊天记录、角色、设置等（仅限本小手机项目）。\n不会影响浏览器中其他网站的数据。\n\n此操作不可恢复，请确认已备份重要数据。';
        let confirmed = await customConfirm(msg, '清除所有数据');
        if (!confirmed) return;
        confirmed = await customConfirm('再次确认：即将清除本项目全部数据并刷新页面，确定继续？', '严重警告');
        if (!confirmed) return;

        try {
            // 仅清除本项目的 localStorage 键（不影响其他网站）
            const projectLocalStorageKeys = [
                'lastSeenVersion',
                'lastSeenUpdateLogRevision',
                'gh_config',
                'storage_persist_prompted',
                'imgbb_api_key',
                'gemini-chat-app-db'
            ];
            const keysToRemove = [...projectLocalStorageKeys];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('guide_')) keysToRemove.push(key);
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));

            // 删除本项目的 IndexedDB（章鱼喷墨机DB_ee），不影响其他网站
            const dbName = '章鱼喷墨机DB_ee';
            const req = indexedDB.deleteDatabase(dbName);
            req.onsuccess = () => {
                showToast('已清除本项目数据，即将刷新…');
                setTimeout(() => window.location.reload(), 800);
            };
            req.onerror = () => {
                showToast('清除数据库时出错，请重试或手动清除');
            };
            req.onblocked = () => {
                showToast('请关闭其他标签页中打开的同一页面后重试');
            };
        } catch (e) {
            console.error(e);
            showToast('清除失败: ' + e.message);
        }
    });

    tutorialContentArea.appendChild(backupDataBtn);
    tutorialContentArea.appendChild(partialExportBtn);
    tutorialContentArea.appendChild(importDataBtn);

    const importPartialDataBtn = createActionItem('label', '分类导入', 'btn btn-neutral');
    importPartialDataBtn.setAttribute('for', 'import-partial-data-input');
    importPartialDataBtn.disabled = loadingBtn;
    const partialInput = document.getElementById('import-partial-data-input');
    if (partialInput) {
        partialInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file) return;
            if (loadingBtn) return;
            try {
                const archiveInfo = await inspectBackupArchive(file);
                let legacyData = null;
                const exportTables = archiveInfo.stream
                    ? archiveInfo.header.exportTables
                    : await (async () => {
                        const decompressionStream = new DecompressionStream('gzip');
                        const decompressedStream = file.stream().pipeThrough(decompressionStream);
                        const jsonString = await new Response(decompressedStream).text();
                        legacyData = JSON.parse(jsonString);
                        return legacyData._exportTables;
                    })();
                if (!exportTables || !Array.isArray(exportTables)) {
                    showToast('请选择由「分类导出」生成的文件（.ee）');
                    event.target.value = null;
                    return;
                }
                const confirmed = await customConfirm('将把该文件中选中的分类数据合并到当前数据中（同名会覆盖）。是否继续？', '分类导入');
                if (!confirmed) {
                    event.target.value = null;
                    return;
                }
                showToast('正在分类导入...');
                const result = archiveInfo.stream
                    ? await importStreamBackupData(file, {
                        requirePartial: true,
                        onProgress: message => showToast(message)
                    })
                    : await importPartialBackupData(legacyData);
                if (result.success) {
                    showToast(result.message + ' 应用即将刷新。');
                    setTimeout(() => window.location.reload(), 1500);
                } else {
                    showToast('分类导入失败: ' + result.error);
                }
            } catch (error) {
                console.error('分类导入失败:', error);
                showToast('解压或解析失败: ' + (error.message || String(error)));
            }
            event.target.value = null;
        });
    }
    if (isModern) {
        modernGroups.data.appendChild(backupDataBtn);
        modernGroups.data.appendChild(partialExportBtn);
        modernGroups.data.appendChild(importDataBtn);
        modernGroups.data.appendChild(importPartialDataBtn);

        modernGroups.clean.appendChild(advancedCleanBtn);
        modernGroups.clean.appendChild(charCleanBtn);
        modernGroups.clean.appendChild(cleanLocalImagesBtn);
        modernGroups.clean.appendChild(cleanRedundantDataBtn);
        modernGroups.clean.appendChild(clearDataBtn);
    } else {
        tutorialContentArea.appendChild(backupDataBtn);
        tutorialContentArea.appendChild(partialExportBtn);
        tutorialContentArea.appendChild(importDataBtn);
        tutorialContentArea.appendChild(importPartialDataBtn);
        tutorialContentArea.appendChild(advancedCleanBtn);
        tutorialContentArea.appendChild(charCleanBtn);
        tutorialContentArea.appendChild(cleanLocalImagesBtn);
        tutorialContentArea.appendChild(cleanRedundantDataBtn);
        tutorialContentArea.appendChild(clearDataBtn);
    }

    // GitHub Backup UI
    const githubSection = document.createElement('div');
    const iconEyeOpen = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    const iconEyeClosed = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

    githubSection.innerHTML = `
        ${isModern ? '' : (isRabbit ? '<div style="font-size:16px; font-weight:500; color:#555; margin:20px 0 12px; text-align:center; letter-spacing:1px;">云端备份 (GitHub)</div>' : '<div style="font-size:0.89rem; color:#999; margin:20px 0 8px;">云端备份 (GitHub)</div>')}
        <div class="${isModern ? 'tutorial-modern-gh-card' : (isRabbit ? 'tutorial-rabbit-card' : 'btn-white')}" style="${isModern || isRabbit ? '' : 'display:block; cursor:default; background:#fff; border:1px solid #e0e0e0; border-radius:8px; padding:12px;'}">
            <div id="gh-collapse-header" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; padding:${isRabbit ? '16px 20px' : '0 0 5px 0'};">
                <div style="display:flex; align-items:center;">
                    <span style="color:${isRabbit ? '#444' : '#333'}; font-weight:500;">${isModern ? '配置参数' : (isRabbit ? '配置参数' : '🔧 配置参数')}</span>
                    <div id="gh-help-btn" style="margin-left:8px; display:flex; align-items:center; padding:2px; cursor:pointer;">
                        <svg style="width:16px; height:16px; color:${isRabbit ? '#ccc' : '#1890ff'};" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    </div>
                </div>
                <svg class="toggle-icon" style="width:14px; height:14px; color:#999; transition:transform 0.3s;" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></polyline></svg>
            </div>

            <div id="gh-config-area" style="display:none; padding:${isRabbit ? '0 20px 20px' : '10px 0 0 0'}; border-top:${isRabbit ? '1px solid #fcfafb' : '1px dashed #eee'};">
                <div style="margin-bottom:10px; margin-top:${isRabbit ? '16px' : '0'};">
                    <div style="font-size:0.81rem; color:#666; margin-bottom:5px;">GitHub Token</div>
                    <div style="position:relative;">
                        <input type="password" id="gh-token-input" placeholder="ghp_xxxx..." style="width:100%; border:1px solid #eee; padding:8px; padding-right:35px; border-radius:4px; font-size:0.89rem;">
                        <div id="gh-eye-btn" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); color:#999; cursor:pointer; display:flex;">
                            ${iconEyeClosed}
                        </div>
                    </div>
                </div>
                <div style="margin-bottom:10px;">
                    <div style="font-size:0.81rem; color:#666; margin-bottom:5px;">仓库路径 (用户名/仓库名)</div>
                    <input type="text" id="gh-repo-input" placeholder="username/repo" style="width:100%; border:1px solid #eee; padding:8px; border-radius:4px; font-size:0.89rem;">
                </div>
                <div style="margin-bottom:10px;">
                    <div style="font-size:0.81rem; color:#666; margin-bottom:5px;">备份文件名 (可选，填则覆盖)</div>
                    <input type="text" id="gh-filename-input" placeholder="例如: my_backup.ee" style="width:100%; border:1px solid #eee; padding:8px; border-radius:4px; font-size:0.89rem;">
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding:0 ${isRabbit ? '20px' : '0'}; border-top:1px solid #f5f5f5; padding-top:10px;">
                <span>自动备份开关</span>
                <label class="switch" style="position:relative; display:inline-block; width:40px; height:24px;">
                    <input type="checkbox" id="gh-auto-switch" style="opacity:0; width:0; height:0;">
                    <span style="position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background-color:#ccc; transition:.4s; border-radius:24px;" id="gh-switch-slider"></span>
                    <style>
                        #gh-auto-switch:checked + #gh-switch-slider { background-color: ${isModern ? '#34c759' : (isRabbit ? '#e8dfe1' : '#333')}; }
                        #gh-switch-slider:before { position:absolute; content:""; height:16px; width:16px; left:4px; bottom:4px; background-color:white; transition:.4s; border-radius:50%; }
                        #gh-auto-switch:checked + #gh-switch-slider:before { transform: translateX(16px); }
                    </style>
                </label>
            </div>

            <div id="gh-interval-setting" style="display:none; justify-content:space-between; align-items:center; margin-top:10px; padding:0 ${isRabbit ? '20px' : '0'};">
                <span style="font-size:0.89rem; color:#666;">备份频率</span>
                <select id="gh-interval-select" style="border:1px solid #eee; padding:5px; border-radius:4px; font-size:0.89rem; background:#fff;">
                    <option value="24">每 24 小时</option>
                    <option value="36">每 36 小时</option>
                    <option value="48">每 48 小时</option>
                </select>
            </div>

            <div style="margin-top:15px; padding:0 ${isRabbit ? '20px' : '0'}; display:flex; gap:10px;">
                <div id="gh-backup-btn" class="gh-btn" style="flex:1; background:${isModern ? '#000' : (isRabbit ? '#f5f0f1' : '#333')}; color:${isRabbit ? '#555' : '#fff'}; text-align:center; padding:8px; border-radius:4px; font-size:0.89rem; cursor:pointer;">立即备份</div>
                <div id="gh-restore-btn" class="gh-btn" style="flex:1; background:${isRabbit ? '#fff' : '#1890ff'}; color:${isRabbit ? '#555' : '#fff'}; border:${isRabbit ? '1px solid #f0eaeb' : 'none'}; text-align:center; padding:8px; border-radius:4px; font-size:0.89rem; cursor:pointer;">恢复最新</div>
                <div id="gh-check-btn" class="gh-btn" style="flex:1; background:${isRabbit ? '#fdfbfb' : '#f5f5f5'}; color:#666; border:${isRabbit ? '1px solid #f0eaeb' : 'none'}; text-align:center; padding:8px; border-radius:4px; font-size:0.89rem; cursor:pointer;">检查状态</div>
            </div>
            
            <div id="gh-status-msg" style="margin-top:10px; padding:0 ${isRabbit ? '20px' : '0'} 16px; font-size:0.74rem; color:#999;"></div>
        </div>
    `;

    // 文件更新入口紧接仓库备份，三套外观复用现有次要操作样式。
    const fileUpdateSection = document.createElement('div');
    fileUpdateSection.className = 'ovo-file-update';
    const fileUpdateButton = createActionItem('button', '拉取最新文件', 'btn btn-neutral');
    fileUpdateButton.id = 'ovo-file-update-btn';
    fileUpdateButton.type = 'button';
    fileUpdateButton.setAttribute('aria-describedby', 'ovo-file-update-status');
    fileUpdateButton.addEventListener('click', () => window.OVOFileUpdate.run());
    const fileUpdateStatus = document.createElement('div');
    fileUpdateStatus.id = 'ovo-file-update-status';
    fileUpdateStatus.className = 'ovo-file-update-status';
    fileUpdateStatus.setAttribute('role', 'status');
    fileUpdateStatus.setAttribute('aria-live', 'polite');
    fileUpdateSection.append(fileUpdateButton, fileUpdateStatus);

    // 全局消息弹窗开关
    const bgToastSection = document.createElement('div');
    if (isRabbit) {
        bgToastSection.innerHTML = `
            <div class="tutorial-rabbit-card">
                <div style="padding:16px 20px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="flex:1;">
                        <div style="color:#444; font-weight:500; font-size:15px; margin-bottom:4px;">全局消息弹窗通知</div>
                        <div style="font-size:13px; color:#aaa;">开启后，允许接收消息的弹窗通知</div>
                    </div>
                    <label class="kkt-switch" style="margin-left:16px;">
                        <input type="checkbox" id="setting-bg-toast-enabled" ${db.globalToastEnabled !== false ? 'checked' : ''}>
                        <span class="kkt-slider"></span>
                    </label>
                </div>
            </div>
        `;
    } else if (isModern) {
        bgToastSection.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:14px 16px; background:#fff; border-bottom:1px solid #e5e5ea;">
                <div style="flex:1;">
                    <div style="color:#000; font-size:16px; margin-bottom:2px;">全局消息弹窗通知</div>
                    <div style="font-size:13px; color:#8e8e93;">开启后，允许接收消息的弹窗通知</div>
                </div>
                <label class="kkt-switch" style="margin-left:12px;">
                    <input type="checkbox" id="setting-bg-toast-enabled" ${db.globalToastEnabled !== false ? 'checked' : ''}>
                    <span class="kkt-slider"></span>
                </label>
            </div>
        `;
    } else {
        bgToastSection.innerHTML = `
            <div style="margin-top:12px; display:block; background:#fff; border:1px solid #e0e0e0; border-radius:8px; padding:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="flex:1;">
                        <div style="color:#333; font-weight:500; font-size:0.89rem; margin-bottom:3px;">全局消息弹窗通知</div>
                        <div style="font-size:0.81rem; color:#888;">开启后，允许接收消息的弹窗通知</div>
                    </div>
                    <label class="kkt-switch" style="margin-left:12px;">
                        <input type="checkbox" id="setting-bg-toast-enabled" ${db.globalToastEnabled !== false ? 'checked' : ''}>
                        <span class="kkt-slider"></span>
                    </label>
                </div>
            </div>
        `;
    }
    
    // 触感反馈开关
    const hapticSection = document.createElement('div');
    
    if (isRabbit) {
        hapticSection.innerHTML = `
            <div style="font-size:16px; font-weight:500; color:#555; margin:20px 0 12px; text-align:center; letter-spacing:1px;">移动端触感</div>
            <div class="tutorial-rabbit-card">
                <div style="padding:16px 20px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="flex:1;">
                        <div style="color:#444; font-weight:500; font-size:15px; margin-bottom:4px;">触感反馈</div>
                        <div style="font-size:13px; color:#aaa;">开启后，点击、长按等操作会有震动反馈</div>
                    </div>
                    <label class="haptic-switch" style="position:relative; display:inline-block; width:44px; height:26px; margin-left:16px;">
                        <input type="checkbox" id="haptic-feedback-switch" style="opacity:0; width:0; height:0;">
                        <span style="position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background-color:#e8e8e8; transition:.3s; border-radius:26px;" id="haptic-switch-slider"></span>
                        <style>
                            #haptic-feedback-switch:checked + #haptic-switch-slider { background-color: #e8dfe1; }
                            #haptic-switch-slider:before { position:absolute; content:""; height:20px; width:20px; left:3px; bottom:3px; background-color:white; transition:.3s; border-radius:50%; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                            #haptic-feedback-switch:checked + #haptic-switch-slider:before { transform: translateX(18px); }
                        </style>
                    </label>
                </div>
            </div>
        `;
    } else if (isModern) {
        hapticSection.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:14px 16px; background:#fff; border-bottom:1px solid #e5e5ea;">
                <div style="flex:1;">
                    <div style="color:#000; font-size:16px; margin-bottom:2px;">触感反馈</div>
                    <div style="font-size:13px; color:#8e8e93;">开启后，点击、长按等操作会有震动反馈</div>
                </div>
                <label class="haptic-switch" style="position:relative; display:inline-block; width:40px; height:24px; margin-left:12px;">
                    <input type="checkbox" id="haptic-feedback-switch" style="opacity:0; width:0; height:0;">
                    <span style="position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background-color:#ccc; transition:.4s; border-radius:24px;" id="haptic-switch-slider"></span>
                    <style>
                        #haptic-feedback-switch:checked + #haptic-switch-slider { background-color: #34c759; }
                        #haptic-switch-slider:before { position:absolute; content:""; height:16px; width:16px; left:4px; bottom:4px; background-color:white; transition:.4s; border-radius:50%; }
                        #haptic-feedback-switch:checked + #haptic-switch-slider:before { transform: translateX(16px); }
                    </style>
                </label>
            </div>
        `;
    } else {
        hapticSection.innerHTML = `
            <div style="margin-top:12px; display:block; background:#fff; border:1px solid #e0e0e0; border-radius:8px; padding:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="flex:1;">
                        <div style="color:#333; font-weight:500; font-size:0.89rem; margin-bottom:3px;">触感反馈</div>
                        <div style="font-size:0.81rem; color:#888;">开启后，点击、长按等操作会有震动反馈</div>
                    </div>
                    <label class="haptic-switch" style="position:relative; display:inline-block; width:40px; height:24px; margin-left:12px;">
                        <input type="checkbox" id="haptic-feedback-switch" style="opacity:0; width:0; height:0;">
                        <span style="position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background-color:#ccc; transition:.4s; border-radius:24px;" id="haptic-switch-slider"></span>
                        <style>
                            #haptic-feedback-switch:checked + #haptic-switch-slider { background-color: #333; }
                            #haptic-switch-slider:before { position:absolute; content:""; height:16px; width:16px; left:4px; bottom:4px; background-color:white; transition:.4s; border-radius:50%; }
                            #haptic-feedback-switch:checked + #haptic-switch-slider:before { transform: translateX(16px); }
                        </style>
                    </label>
                </div>
            </div>
        `;
    }
    
    const feedbackSection = document.createElement('div');
    feedbackSection.className = `sakura-feedback-entries uwu-feedback-entries ${isRabbit ? 'is-rabbit' : isModern ? 'is-modern' : 'is-classic'}`;
    feedbackSection.innerHTML = `
        <div class="sakura-feedback-entries-title">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            <span>心之信箱 · 许愿与反馈</span>
        </div>
        <button type="button" class="sakura-feedback-entry uwu-feedback-entry" data-sakura-feedback-mode="private" data-uwu-feedback-mode="private">
            <span><strong>私密信件</strong><small>仅你与作者可见，支持往来回信交流</small></span>
            <span class="sakura-entry-badge uwu-feedback-entry-badge" aria-hidden="true">›</span>
        </button>
        <button type="button" class="sakura-feedback-entry uwu-feedback-entry" data-sakura-feedback-mode="public" data-uwu-feedback-mode="public">
            <span><strong>公开信件</strong><small>审核通过后公开展出，支持往来回信交流</small></span>
            <span class="sakura-entry-badge uwu-feedback-entry-badge" aria-hidden="true">›</span>
        </button>`;
    feedbackSection.querySelectorAll('[data-sakura-feedback-mode], [data-uwu-feedback-mode]').forEach(button => {
        button.addEventListener('click', () => (window.SakuraFeedback || window.UWUFeedback)?.open(button.dataset.sakuraFeedbackMode || button.dataset.uwuFeedbackMode));
    });

    if (isModern) {
        modernGroups.github.appendChild(githubSection);
        modernGroups.github.appendChild(fileUpdateSection);
        modernGroups.github.appendChild(bgToastSection);
        modernGroups.github.appendChild(hapticSection);
        modernGroups.github.appendChild(feedbackSection);
    } else {
        tutorialContentArea.appendChild(githubSection);
        tutorialContentArea.appendChild(fileUpdateSection);
        tutorialContentArea.appendChild(bgToastSection);
        tutorialContentArea.appendChild(hapticSection);
        tutorialContentArea.appendChild(feedbackSection);
    }
    window.UWUFeedback?.refreshIndicators();
    window.OVOFileUpdate.renderState();

    const existingOverlay = document.getElementById('gh-help-overlay');
    if (existingOverlay) existingOverlay.remove();

    const helpOverlay = document.createElement('div');
    helpOverlay.id = 'gh-help-overlay';
    helpOverlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999; display: none; align-items: center; justify-content: center;';
    
    helpOverlay.onclick = function(e) { 
        if(e.target === this) this.style.display = 'none'; 
    };
    
    helpOverlay.innerHTML = `
        <div class="modal-window" style="width: 85%; max-height: 80vh; overflow-y: auto; background: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 5px 20px rgba(0,0,0,0.2);">
            <h3 style="margin-top:0; margin-bottom:15px; text-align:center; font-size:1.1rem; color: var(--primary-color);">GitHub 配置指南</h3>
            
            <h4 style="margin:10px 0 5px; color:#333;">1. 获取 Token</h4>
            <ol style="padding-left:20px; font-size:0.89rem; color:#555; line-height:1.6;">
                <li>登录 GitHub，点击头像 → <strong>Settings</strong></li>
                <li>左侧菜单到底 → <strong>Developer settings</strong></li>
                <li><strong>Personal access tokens</strong> → <strong>Tokens (classic)</strong></li>
                <li>Generate new token (classic)</li>
                <li>Expiration 选 <strong>No expiration</strong></li>
                <li><strong style="color:#d32f2f;">Scopes 必须勾选 repo (包含所有子项)</strong></li>
                <li>点击 Generate，复制 ghp_ 开头的字符。<br><strong style="color:#d32f2f;">一定要现在复制并保存好！一旦刷新页面，你就再也看不到它了。</strong></li>
            </ol>

            <h4 style="margin:15px 0 5px; color:#333;">2. 创建仓库</h4>
            <ol style="padding-left:20px; font-size:0.89rem; color:#555; line-height:1.6;">
                <li>右上角 + 号 → <strong>New repository</strong></li>
                <li>Repository name 填个名字</li>
                <li>建议选 <strong>Private</strong> (私有)</li>
                <li>点击 Create repository</li>
            </ol>

            <h4 style="margin:15px 0 5px; color:#333;">3. 填写示例</h4>
            <ul style="padding-left:20px; font-size:0.89rem; color:#555; line-height:1.6;">
                <li>Token: <code>ghp_xxxxxxxxxxxx...</code></li>
                <li>仓库路径: <code>用户名/仓库名</code></li>
            </ul>

            <div style="margin-top:20px; text-align: center;">
                <button class="btn btn-primary" onclick="document.getElementById('gh-help-overlay').style.display='none'">我学会了</button>
            </div>
        </div>
    `;
    document.body.appendChild(helpOverlay);

    document.getElementById('gh-collapse-header').addEventListener('click', function() {
        const area = document.getElementById('gh-config-area');
        const icon = this.querySelector('.toggle-icon');
        if (area.style.display === 'none') {
            area.style.display = 'block';
            icon.style.transform = 'rotate(180deg)';
        } else {
            area.style.display = 'none';
            icon.style.transform = 'rotate(0deg)';
        }
    });

    document.getElementById('gh-help-btn').addEventListener('click', function(e) {
        e.stopPropagation(); 
        document.getElementById('gh-help-overlay').style.display = 'flex';
    });

    document.getElementById('gh-eye-btn').addEventListener('click', function() {
        const input = document.getElementById('gh-token-input');
        if (input.type === 'password') {
            input.type = 'text';
            this.innerHTML = iconEyeOpen;
        } else {
            input.type = 'password';
            this.innerHTML = iconEyeClosed;
        }
    });

    const saveHandler = () => { if(window.GitHubMgr) window.GitHubMgr.saveConfig(); };
    document.getElementById('gh-token-input').addEventListener('change', saveHandler);
    document.getElementById('gh-repo-input').addEventListener('change', saveHandler);
    document.getElementById('gh-filename-input').addEventListener('change', saveHandler);
    document.getElementById('gh-auto-switch').addEventListener('change', saveHandler);
    document.getElementById('gh-interval-select').addEventListener('change', saveHandler);

    document.getElementById('gh-backup-btn').addEventListener('click', () => window.GitHubMgr.testUpload());
    document.getElementById('gh-restore-btn').addEventListener('click', () => window.GitHubMgr.restoreLatest());
    document.getElementById('gh-check-btn').addEventListener('click', () => window.GitHubMgr.checkStatus());

    // 触感反馈开关事件监听
    const hapticSwitch = document.getElementById('haptic-feedback-switch');
    if (hapticSwitch) {
        // 初始化开关状态
        hapticSwitch.checked = db.hapticEnabled !== false; // 默认开启
        
        hapticSwitch.addEventListener('change', (e) => {
            db.hapticEnabled = e.target.checked;
            saveData();
            
            // 触发一次触感反馈让用户感受效果
            if (e.target.checked && typeof triggerHapticFeedback === 'function') {
                triggerHapticFeedback('medium');
            }
            
            showToast(e.target.checked ? '触感反馈已开启' : '触感反馈已关闭');
        });
    }

    if(window.GitHubMgr) {
        window.GitHubMgr.init();
    }
}

// 创建完整的备份数据（确保主题预设、屏幕预设等 globalSettingKeys 全部导出）
