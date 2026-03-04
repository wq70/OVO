// --- 小剧场功能 (js/modules/theater.js) ---

let currentTheaterScenarioId = null;
/** 列表多选：是否处于多选模式、已选中的 scenario id 集合 */
let theaterMultiSelectMode = false;
let theaterSelectedIds = new Set();

/** 当前小剧场模式：'text'(纯文字，默认) | 'html' */
let theaterCurrentMode = 'text';

/** 用于把 HTML 安全地塞进 textarea / innerHTML（避免标签被当成 DOM 解析） */
function theaterEscapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** 获取当前模式的剧情列表 */
function getTheaterScenarios() {
    if (theaterCurrentMode === 'html') {
        if (!db.theaterHtmlScenarios) db.theaterHtmlScenarios = [];
        return db.theaterHtmlScenarios;
    }
    if (!db.theaterScenarios) db.theaterScenarios = [];
    return db.theaterScenarios;
}

/** 设置当前模式的剧情列表 */
function setTheaterScenarios(list) {
    if (theaterCurrentMode === 'html') {
        db.theaterHtmlScenarios = list;
    } else {
        db.theaterScenarios = list;
    }
}

/** 获取当前模式的提示词预设列表 */
function getTheaterPromptPresets() {
    if (theaterCurrentMode === 'html') {
        if (!db.theaterHtmlPromptPresets) db.theaterHtmlPromptPresets = [];
        return db.theaterHtmlPromptPresets;
    }
    if (!db.theaterPromptPresets) db.theaterPromptPresets = [];
    return db.theaterPromptPresets;
}

/** 设置当前模式的提示词预设列表 */
function setTheaterPromptPresets(list) {
    if (theaterCurrentMode === 'html') {
        db.theaterHtmlPromptPresets = list;
    } else {
        db.theaterPromptPresets = list;
    }
}

/**
 * 小剧场生成专用：兼容旧代码期望的 OpenAI ChatCompletions 返回结构。
 * 之前这里调用了未定义的 callChatCompletion，导致 “callChatCompletion is not defined”。
 * 这里复用 utils.js 的 fetchAiResponse() 发请求，然后包装成 {choices:[{message:{content}}]}。
 */
async function callChatCompletion(apiPayload, overrideSettings) {
    // 如果提供了独立API覆盖设置，则优先使用
    let settings;
    if (overrideSettings && overrideSettings.url && overrideSettings.key && overrideSettings.model) {
        settings = {
            url: overrideSettings.url,
            key: overrideSettings.key,
            model: overrideSettings.model,
            provider: 'newapi',  // 独立API默认使用 newapi 兼容模式
            temperature: (db.apiSettings && db.apiSettings.temperature !== undefined) ? db.apiSettings.temperature : 1.0
        };
    } else {
        settings = (typeof db !== 'undefined' && db && db.apiSettings) ? db.apiSettings : null;
        if (!settings) throw new Error('未找到 API 设置(db.apiSettings)');
    }

    let { url, key, model, provider } = settings;
    if (!model) model = apiPayload?.model;

    if (!url || !key || !model) {
        throw new Error('请先在"api"应用中完成设置（Base URL / Key / Model）');
    }

    const blockedDomains = (typeof BLOCKED_API_DOMAINS !== 'undefined') ? BLOCKED_API_DOMAINS : [];
    if (blockedDomains.some(domain => url.includes(domain))) {
        throw new Error('当前 API 站点已被屏蔽，无法发送请求');
    }

    if (url.endsWith('/')) url = url.slice(0, -1);

    const endpoint = (provider === 'gemini')
        ? `${url}/v1beta/models/${model}:generateContent?key=${getRandomValue(key)}`
        : `${url}/v1/chat/completions`;

    const headers = (provider === 'gemini')
        ? { 'Content-Type': 'application/json' }
        : { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };

    let requestBody;
    if (provider === 'gemini') {
        // Gemini：简单合并 system+user，避免引入额外 schema（system_instruction 等）复杂度
        const prompt = (apiPayload?.messages || [])
            .map(m => `${m.role}: ${m.content}`)
            .join('\n');
        requestBody = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
        };
    } else {
        requestBody = {
            model: model,
            messages: apiPayload?.messages || [],
            stream: false,
            temperature: settings.temperature !== undefined ? settings.temperature : 1.0
        };
    }

    if (typeof fetchAiResponse !== 'function') {
        throw new Error('缺少 fetchAiResponse()：请确认 utils.js 已被正确加载');
    }

    const content = await fetchAiResponse(settings, requestBody, headers, endpoint, false);
    return { choices: [{ message: { content: (content || '').toString() } }] };
}

/** 去掉 AI 开场白，只保留剧本正文 */
function stripTheaterIntro(text) {
    if (!text || typeof text !== 'string') return text;
    let s = text.trim();
    // 去掉开头的「好的，编剧。这是一段根据…」类开场白（含换行）
    const introRe = /^好的[，,]?\s*编剧[。.]?\s*[^\n]*?(根据你提供的提示词|根据提示词|根据设定)[^\n]*(短剧脚本|剧情脚本|脚本)[^\n]*[。.!\s]*\n?/i;
    s = s.replace(introRe, '');
    // 去掉仅由这类说明组成的首行
    const firstLineRe = /^[^\n]*(这是一段|下面是根据|以下是)[^\n]*(根据你提供的提示词|短剧脚本|剧情脚本)[^\n]*[。.!\s]*\n?/im;
    s = s.replace(firstLineRe, '');
    return s.trim();
}

/** 将剧本正文中的 Markdown 转为 HTML（**粗体**、*斜体*、换行），并做安全过滤 */
function renderTheaterMarkdown(text) {
    if (!text || typeof text !== 'string') return '';
    const escaped = String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    let html = escaped
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
    if (typeof DOMPurify !== 'undefined') {
        html = DOMPurify.sanitize(html, { ALLOWED_TAGS: ['strong', 'em', 'b', 'i', 'br'] });
    }
    return html;
}

// 渲染小剧场列表（同时处理纯文字和 HTML 模式）
function renderTheaterScenarios() {
    // 根据当前模式选择正确的 DOM 元素
    const isHtml = theaterCurrentMode === 'html';
    const scenariosList = document.getElementById(isHtml ? 'theater-html-scenarios-list' : 'theater-scenarios-list');
    const categoryFilter = document.getElementById(isHtml ? 'theater-html-category-filter' : 'theater-category-filter');
    if (!scenariosList) return;

    scenariosList.innerHTML = '';

    const allScenarios = getTheaterScenarios();
    if (!allScenarios || allScenarios.length === 0) {
        scenariosList.innerHTML = isHtml
            ? '<div class="theater-empty-state">还没有生成的 HTML 剧情，点击右上角"+"创建吧~</div>'
            : '<div class="theater-empty-state">还没有生成的剧情，点击右上角"+"创建吧~</div>';
        return;
    }

    // 获取所有分类
    const categories = [...new Set(allScenarios.map(s => s.category || '未分类'))];
    const currentSelectedCategory = categoryFilter ? categoryFilter.value : '';
    
    if (categoryFilter) {
        categoryFilter.innerHTML = '<option value="">全部分类</option>';
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            if (cat === currentSelectedCategory) {
                option.selected = true;
            }
            categoryFilter.appendChild(option);
        });
    }

    // 过滤场景
    const selectedCategory = categoryFilter ? categoryFilter.value : '';
    let filteredScenarios = allScenarios;
    if (selectedCategory) {
        filteredScenarios = allScenarios.filter(s => (s.category || '未分类') === selectedCategory);
    }

    if (filteredScenarios.length === 0) {
        scenariosList.innerHTML = '<div class="theater-empty-state">该分类下暂无剧情</div>';
        updateTheaterMultiSelectBar();
        return;
    }

    // 按收藏状态和创建时间排序（收藏的置顶）
    filteredScenarios.sort((a, b) => {
        const aFav = a.isFavorite ? 1 : 0;
        const bFav = b.isFavorite ? 1 : 0;
        if (aFav !== bFav) {
            return bFav - aFav; // 收藏的在前
        }
        return (b.createdAt || 0) - (a.createdAt || 0); // 同收藏状态下按时间倒序
    });

    const isMultiSelect = theaterMultiSelectMode;

    filteredScenarios.forEach(scenario => {
        const card = document.createElement('div');
        card.className = 'theater-scenario-card' + (isMultiSelect ? ' selectable' : '');
        card.dataset.id = scenario.id;

        const date = new Date(scenario.createdAt || scenario.timestamp || Date.now());
        const dateStr = date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });

        const charName = scenario.charId ? (db.characters.find(c => c.id === scenario.charId)?.realName || db.characters.find(c => c.id === scenario.charId)?.remarkName || '未知角色') : '未指定';
        const category = scenario.category || '未分类';
        const checked = theaterSelectedIds.has(scenario.id);

        // HTML 模式下：在卡片底部添加 iframe 缩略预览
        const htmlPreviewHtml = (isHtml && scenario.content)
            ? `<div class="theater-scenario-html-preview">
                    <iframe class="theater-scenario-preview-frame" data-scenario-id="${scenario.id}" sandbox="allow-forms" referrerpolicy="no-referrer" scrolling="no" tabindex="-1"></iframe>
               </div>`
            : '';

        const cardBody = `
            <div class="theater-scenario-header">
                <div class="theater-scenario-title">
                    ${scenario.isFavorite ? '<span class="theater-favorite-icon" style="color: #ffd700; margin-right: 5px;">★</span>' : ''}
                    ${DOMPurify.sanitize(scenario.title || '剧情')}
                </div>
                <div class="theater-scenario-badge">${DOMPurify.sanitize(category)}</div>
            </div>
            <div class="theater-scenario-meta">
                <span>角色：${DOMPurify.sanitize(charName)}</span>
                <span>${dateStr}</span>
            </div>
            ${isHtml ? htmlPreviewHtml : `<div class="theater-scenario-content">${DOMPurify.sanitize(scenario.content)}</div>`}
        `;

        if (isMultiSelect) {
            card.innerHTML = `
                <div class="theater-card-checkbox ${checked ? 'checked' : ''}" role="button" tabindex="0" aria-label="选择"></div>
                <div class="theater-card-content-wrap">${cardBody}</div>
            `;
        } else {
            card.innerHTML = cardBody;
        }

        card.addEventListener('click', (e) => {
            if (isMultiSelect) {
                e.preventDefault();
                e.stopPropagation();
                toggleTheaterSelection(scenario.id);
                return;
            }
            if (theaterCurrentMode === 'html') {
                showTheaterHtmlScenarioDetail(scenario);
            } else {
                showTheaterScenarioDetail(scenario);
            }
        });

        if (isMultiSelect) {
            const checkbox = card.querySelector('.theater-card-checkbox');
            if (checkbox) {
                checkbox.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleTheaterSelection(scenario.id);
                });
            }
        }

        scenariosList.appendChild(card);

        // HTML 模式：为预览 iframe 注入内容
        if (isHtml && scenario.content) {
            const previewFrame = card.querySelector('.theater-scenario-preview-frame');
            if (previewFrame) {
                const htmlContent = String(scenario.content || '');
                const hasBodyTag = /<body[\s>]/i.test(htmlContent);
                const wrapped = hasBodyTag
                    ? `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{pointer-events:none;overflow:hidden;}</style></head>${htmlContent}</html>`
                    : `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{pointer-events:none;overflow:hidden;}</style></head><body style="margin:0;padding:8px;box-sizing:border-box;">${htmlContent}</body></html>`;
                previewFrame.srcdoc = wrapped;
            }
        }
    });

    updateTheaterMultiSelectBar();
}

function updateTheaterMultiSelectBar() {
    const bar = document.getElementById('theater-multi-select-bar');
    const countEl = document.getElementById('theater-selected-count');
    const deleteBtn = document.getElementById('theater-delete-selected-btn');
    if (countEl) countEl.textContent = '已选 ' + theaterSelectedIds.size + ' 项';
    if (deleteBtn) deleteBtn.disabled = theaterSelectedIds.size === 0;
    if (bar) bar.classList.toggle('visible', theaterMultiSelectMode);
}

function toggleTheaterSelection(id) {
    if (theaterSelectedIds.has(id)) {
        theaterSelectedIds.delete(id);
    } else {
        theaterSelectedIds.add(id);
    }
    updateTheaterMultiSelectBar();
    // 只更新当前列表中的勾选状态，避免整表重绘
    const listId = theaterCurrentMode === 'html' ? 'theater-html-scenarios-list' : 'theater-scenarios-list';
    const card = document.querySelector(`#${listId} .theater-scenario-card[data-id="${id}"]`);
    const checkbox = card && card.querySelector('.theater-card-checkbox');
    if (checkbox) checkbox.classList.toggle('checked', theaterSelectedIds.has(id));
}

function exitTheaterMultiSelectMode() {
    theaterMultiSelectMode = false;
    theaterSelectedIds.clear();
    updateTheaterMultiSelectBar();
    renderTheaterScenarios();
}

function theaterSelectAll() {
    const filterId = theaterCurrentMode === 'html' ? 'theater-html-category-filter' : 'theater-category-filter';
    const categoryFilter = document.getElementById(filterId);
    const selectedCategory = categoryFilter ? categoryFilter.value : '';
    let list = getTheaterScenarios();
    if (selectedCategory) {
        list = list.filter(s => (s.category || '未分类') === selectedCategory);
    }
    list.forEach(s => { theaterSelectedIds.add(s.id); });
    updateTheaterMultiSelectBar();
    renderTheaterScenarios();
}

function theaterDeleteSelected() {
    if (theaterSelectedIds.size === 0) return;
    if (!confirm('确定删除选中的 ' + theaterSelectedIds.size + ' 个剧情吗？')) return;
    setTheaterScenarios(getTheaterScenarios().filter(s => !theaterSelectedIds.has(s.id)));
    saveData().then(() => {
        showToast('已删除选中剧情');
        exitTheaterMultiSelectMode();
    }).catch(() => showToast('删除失败'));
}

// 显示详情页
function showTheaterScenarioDetail(scenario) {
    currentTheaterScenarioId = scenario.id;
    const detailContent = document.getElementById('theater-detail-content');
    if (!detailContent) return;

    // 获取角色信息
    let charName = '未指定';
    let charPersona = '';
    if (scenario.charId) {
        const char = db.characters.find(c => c.id === scenario.charId);
        if (char) {
            charName = char.realName || char.remarkName || '未知角色';
            charPersona = char.persona || '';
        }
    }
    
    // 获取人设信息
    let personaName = '';
    let personaContent = '';
    if (scenario.personaId) {
        const persona = db.myPersonaPresets.find(p => (p.id || p.name) === scenario.personaId);
        if (persona) {
            personaName = persona.name || '';
            personaContent = persona.content || '';
        }
    }
    
    const category = scenario.category || '未分类';
    const date = new Date(scenario.createdAt || scenario.timestamp || Date.now());
    const dateStr = date.toLocaleString('zh-CN', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
    });

    const isEditing = scenario.isEditing || scenario.isEditingTitle || false;

    // 正文占位符替换：使用用户/角色名字替换 {{user}} / {{char}} 等
    let displayContent = scenario.content || '';
    if (!isEditing && typeof displayContent === 'string') {
        // 用户名优先使用人设名称，其次退回“我”
        const userName = personaName || '我';
        if (userName) {
            displayContent = displayContent
                // {{user}} / {{User}} / {{USER}} / {{user_name}}
                .replace(/\{\{\s*(user|User|USER|user_name)\s*\}\}/g, userName);
        }
        if (charName && charName !== '未指定') {
            displayContent = displayContent
                // {{char}} / {{Char}} / {{CHAR}} / {{char_name}}
                .replace(/\{\{\s*(char|Char|CHAR|char_name)\s*\}\}/g, charName);
        }
    }

    const contentDisplay = isEditing 
        ? `<textarea id="theater-edit-content" class="theater-edit-textarea">${DOMPurify.sanitize(scenario.content)}</textarea>`
        : `<div class="theater-detail-body">${renderTheaterMarkdown(displayContent)}</div>`;
    
    // 构建元信息显示
    let metaInfo = `<span class="theater-detail-badge">${DOMPurify.sanitize(category)}</span>`;
    if (charName !== '未指定') {
        metaInfo += `<span>角色：${DOMPurify.sanitize(charName)}</span>`;
    }
    if (personaName) {
        metaInfo += `<span>人设：${DOMPurify.sanitize(personaName)}</span>`;
    }
    metaInfo += `<span>${dateStr}</span>`;
    
    detailContent.innerHTML = `
        <div class="theater-detail-header">
            <h2 class="theater-detail-title" style="display: flex; align-items: center; flex-wrap: wrap; gap: 10px;">
                ${scenario.isFavorite ? '<span class="theater-favorite-icon" style="color: #ffd700; margin-right: 5px;">★</span>' : ''}
                ${scenario.isEditingTitle || (isEditing && !scenario.isEditing)
                    ? `<input type="text" id="theater-edit-title" class="theater-edit-title-input" value="${DOMPurify.sanitize(scenario.title || '剧情')}">`
                    : `<span class="theater-detail-title-text">${DOMPurify.sanitize(scenario.title || '剧情')}</span>${!isEditing ? '<button class="theater-edit-title-btn" id="theater-edit-title-btn">编辑标题</button>' : ''}`
                }
            </h2>
            <div class="theater-detail-meta">
                ${metaInfo}
            </div>
        </div>
        ${contentDisplay}
    `;
    
    // 更新按钮显示状态
    const favoriteBtn = document.getElementById('theater-favorite-btn');
    const saveEditBtn = document.getElementById('theater-save-edit-btn');
    const shareBtn = document.getElementById('theater-share-btn');
    const editCategoryBtn = document.getElementById('theater-edit-category-btn');
    const deleteBtn = document.getElementById('theater-delete-btn');
    
    if (favoriteBtn) {
        favoriteBtn.textContent = scenario.isFavorite ? '取消收藏' : '收藏';
    }
    if (saveEditBtn) {
        saveEditBtn.style.display = isEditing ? 'block' : 'none';
    }
    if (shareBtn) {
        shareBtn.style.display = isEditing ? 'none' : 'block';
    }
    if (editCategoryBtn) {
        editCategoryBtn.style.display = isEditing ? 'none' : 'block';
    }
    if (deleteBtn) {
        deleteBtn.style.display = isEditing ? 'none' : 'block';
    }
    
    // 保存编辑状态到scenario对象
    scenario.isEditing = isEditing;
    
    // 绑定编辑标题按钮
    const editTitleBtn = document.getElementById('theater-edit-title-btn');
    if (editTitleBtn && !isEditing) {
        editTitleBtn.addEventListener('click', () => {
            const scenario = getTheaterScenarios().find(s => s.id === currentTheaterScenarioId);
            if (scenario) {
                scenario.isEditingTitle = true;
                showTheaterScenarioDetail(scenario);
            }
        });
    }
    
    // 如果正在编辑标题，自动聚焦输入框
    if (scenario.isEditingTitle && document.getElementById('theater-edit-title')) {
        const titleInput = document.getElementById('theater-edit-title');
        setTimeout(() => {
            titleInput.focus();
            titleInput.select();
        }, 100);
        
        // 监听回车键保存，ESC键取消
        const handleKeyDown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveEditScenario();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                const scenario = getTheaterScenarios().find(s => s.id === currentTheaterScenarioId);
                if (scenario) {
                    scenario.isEditingTitle = false;
                    showTheaterScenarioDetail(scenario);
                }
            }
        };
        titleInput.addEventListener('keydown', handleKeyDown);
    }
    
    switchScreen('theater-detail-screen');
}

// 更新世界书显示
function updateWorldbookDisplay() {
    const worldbookDisplay = document.getElementById('theater-worldbook-display');
    const worldbookOptions = document.getElementById('theater-worldbook-options');
    if (!worldbookDisplay || !worldbookOptions) return;

    const selectedOptions = worldbookOptions.querySelectorAll('.theater-multiselect-option.selected');
    const placeholder = worldbookDisplay.querySelector('.theater-multiselect-placeholder');
    
    if (selectedOptions.length === 0) {
        placeholder.textContent = '请选择世界书（可选）';
        worldbookDisplay.classList.remove('has-selection');
    } else {
        const names = Array.from(selectedOptions).map(opt => {
            const label = opt.querySelector('.theater-multiselect-label');
            return label ? label.textContent : '';
        }).filter(Boolean);
        const displayText = names.length > 2 
            ? `已选 ${selectedOptions.length} 项：${names.slice(0, 2).join('、')}...`
            : `已选 ${selectedOptions.length} 项：${names.join('、')}`;
        placeholder.textContent = displayText;
        worldbookDisplay.classList.add('has-selection');
    }
}

// 填充创建表单的选择器
function populateTheaterForm() {
    const personaSelect = document.getElementById('theater-persona-select');
    const charSelect = document.getElementById('theater-char-select');
    const promptPresetSelect = document.getElementById('theater-prompt-preset-select');

    if (personaSelect) {
        personaSelect.innerHTML = '<option value="">请选择人设（可选）</option>';
        if (db.myPersonaPresets && db.myPersonaPresets.length > 0) {
            db.myPersonaPresets.forEach(preset => {
                const option = document.createElement('option');
                option.value = preset.id || preset.name;
                option.textContent = preset.name;
                personaSelect.appendChild(option);
            });
        }
    }

    if (charSelect) {
        charSelect.innerHTML = '<option value="">请选择角色（可选）</option>';
        if (db.characters && db.characters.length > 0) {
            db.characters.forEach(char => {
                const option = document.createElement('option');
                option.value = char.id;
                option.textContent = char.remarkName || char.realName || '未命名角色';
                charSelect.appendChild(option);
            });
        }
    }

    // 填充世界书多选下拉 - 按分类显示
    const worldbookOptions = document.getElementById('theater-worldbook-options');
    const worldbookDisplay = document.getElementById('theater-worldbook-display');
    if (worldbookOptions && worldbookDisplay) {
        worldbookOptions.innerHTML = '';
        if (db.worldBooks && db.worldBooks.length > 0) {
            // 按分类分组
            const groupedBooks = db.worldBooks.reduce((acc, book) => {
                const category = (book.category && book.category.trim()) || '未分类';
                if (!acc[category]) {
                    acc[category] = [];
                }
                acc[category].push(book);
                return acc;
            }, {});

            // 分类排序：优先显示「未分类」，其余按名称排序，保证“未分类”状态下的世界书始终可见
            const sortedCategories = Object.keys(groupedBooks).sort((a, b) => {
                if (a === '未分类') return -1;
                if (b === '未分类') return 1;
                return a.localeCompare(b, 'zh-Hans');
            });

            sortedCategories.forEach((category, index) => {
                // 每个分类一个可折叠分组容器
                const group = document.createElement('div');
                group.className = 'theater-multiselect-group';

                const header = document.createElement('div');
                header.className = 'theater-multiselect-group-header';
                header.innerHTML = `
                    <span class="theater-multiselect-group-title">${DOMPurify.sanitize(category)}</span>
                    <span class="theater-multiselect-group-arrow">⌃</span>
                `;

                const body = document.createElement('div');
                body.className = 'theater-multiselect-group-body';

                groupedBooks[category].forEach(book => {
                    const option = document.createElement('div');
                    option.className = 'theater-multiselect-option';
                    option.dataset.id = book.id;
                    option.innerHTML = `
                        <div class="theater-multiselect-checkbox">✓</div>
                        <div class="theater-multiselect-label">${DOMPurify.sanitize(book.name || book.title || '未命名世界书')}</div>
                    `;
                    option.addEventListener('click', () => {
                        option.classList.toggle('selected');
                        updateWorldbookDisplay();
                    });
                    body.appendChild(option);
                });

                // 默认：除「未分类」外的分类折叠，点击分类标题折叠/展开
                if (category !== '未分类') {
                    group.classList.add('collapsed');
                }
                header.addEventListener('click', (e) => {
                    e.stopPropagation();
                    group.classList.toggle('collapsed');
                });

                group.appendChild(header);
                group.appendChild(body);
                worldbookOptions.appendChild(group);
            });
        } else {
            worldbookOptions.innerHTML = '<div style="padding: 12px; font-size: 13px; color: #999;">暂无世界书，请先在世界书模块中创建。</div>';
        }

        // 初始化显示
        updateWorldbookDisplay();
    }

    // 填充提示词预设（使用模式隔离数据）
    if (promptPresetSelect) {
        promptPresetSelect.innerHTML = '<option value="">选择预设提示词</option>';
        const presets = getTheaterPromptPresets();
        if (presets && presets.length > 0) {
            presets.forEach(preset => {
                const option = document.createElement('option');
                option.value = preset.id || preset.name;
                option.textContent = preset.name;
                promptPresetSelect.appendChild(option);
            });
        }
    }

    // 初始化聊天记录 & 日记总结开关
    const contextToggle = document.getElementById('theater-context-toggle');
    const contextOptions = document.getElementById('theater-context-options');
    if (contextToggle && contextOptions) {
        // 绑定开关点击事件（仅在首次绑定）
        if (!contextToggle._theaterBound) {
            contextToggle._theaterBound = true;
            const toggleHandler = () => {
                const isOn = contextToggle.getAttribute('aria-checked') === 'true';
                const newState = !isOn;
                contextToggle.setAttribute('aria-checked', String(newState));
                contextOptions.style.display = newState ? '' : 'none';
            };
            contextToggle.addEventListener('click', toggleHandler);
            contextToggle.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleHandler();
                }
            });
        }
        // 每次打开创建页时重置为关闭
        contextToggle.setAttribute('aria-checked', 'false');
        contextOptions.style.display = 'none';
    }

    // 恢复独立API开关状态
    const apiToggle = document.getElementById('theater-api-toggle');
    const apiConfigDiv = document.getElementById('theater-api-config');
    if (apiToggle && apiConfigDiv) {
        const savedApi = db.theaterApiSettings || {};
        const isApiOn = savedApi.useTheaterApi || false;
        apiToggle.setAttribute('aria-checked', String(isApiOn));
        apiConfigDiv.style.display = isApiOn ? '' : 'none';
        // 恢复字段值
        const urlEl = document.getElementById('theater-api-url');
        const keyEl = document.getElementById('theater-api-key');
        const modelEl = document.getElementById('theater-api-model');
        if (urlEl && savedApi.url) urlEl.value = savedApi.url;
        if (keyEl && savedApi.key) keyEl.value = savedApi.key;
        if (modelEl && savedApi.model) {
            // 只在有值时重置，否则保留上次拉取的列表
            if (savedApi.model && !modelEl.querySelector(`option[value="${savedApi.model}"]`)) {
                modelEl.innerHTML = `<option value="${savedApi.model}">${savedApi.model}</option>`;
            }
            modelEl.value = savedApi.model;
        }
        // 刷新预设下拉
        const presetSel = document.getElementById('theater-api-preset-select');
        if (presetSel) {
            presetSel.innerHTML = '<option value="">— 选择预设配置 —</option>';
            const mainPresets = db.apiPresets || [];
            mainPresets.forEach(p => {
                const opt = document.createElement('option');
                opt.value = JSON.stringify(p.data);
                opt.textContent = p.name + '（主API预设）';
                presetSel.appendChild(opt);
            });
            const subKeys = [
                { key: 'summaryApiPresets', label: '总结API' },
                { key: 'backgroundApiPresets', label: '后台API' },
                { key: 'supplementPersonaApiPresets', label: '补齐人设API' }
            ];
            subKeys.forEach(({ key, label }) => {
                const presets = db[key] || [];
                presets.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = JSON.stringify(p.data);
                    opt.textContent = p.name + `（${label}预设）`;
                    presetSel.appendChild(opt);
                });
            });
        }
    }

    // 根据模式更新标题和占位文本
    const createTitle = document.getElementById('theater-create-title');
    const promptLabel = document.getElementById('theater-prompt-label');
    const promptInput = document.getElementById('theater-custom-prompt');
    if (theaterCurrentMode === 'html') {
        if (createTitle) createTitle.textContent = '创建 HTML 剧场';
        if (promptLabel) promptLabel.textContent = '剧情提示词（HTML 模式）';
        if (promptInput) promptInput.placeholder = '输入自定义剧情提示词（将生成 HTML 结构化输出）...';
    } else {
        if (createTitle) createTitle.textContent = '创建剧场';
        if (promptLabel) promptLabel.textContent = '剧情提示词';
        if (promptInput) promptInput.placeholder = '输入自定义剧情提示词...';
    }
}

// 生成剧情
async function generateTheaterScenario() {
    const charSelect = document.getElementById('theater-char-select');
    const personaSelect = document.getElementById('theater-persona-select');
    const promptInput = document.getElementById('theater-custom-prompt');
    const categoryInput = document.getElementById('theater-category-input');
    const generateBtn = document.getElementById('theater-generate-btn');

    if (!promptInput || !generateBtn) return;

    const customPrompt = promptInput.value.trim();
    const category = (categoryInput && categoryInput.value.trim()) || '未分类';
    const charId = charSelect ? charSelect.value : '';
    const personaId = personaSelect ? personaSelect.value : '';

    if (!customPrompt) {
        showToast('请先输入剧情提示词');
        return;
    }

    try {
        generateBtn.disabled = true;
        const originalText = generateBtn.textContent;
        generateBtn.textContent = '生成中...';

        const apiSettings = db.apiSettings || {};
        const model = apiSettings.model || 'gpt-4o-mini';

        // 根据当前模式选择不同的系统提示词
        const isHtmlMode = theaterCurrentMode === 'html';
        const systemPrompt = isHtmlMode
            ? `你精通HTML/CSS。请根据用户提供的提示词，结合可能的角色设定和世界观，以 HTML 格式输出。

【最高优先级规则 —— 必须包含完整 CSS】
你的输出第一行必须是 <style> 标签，里面包含本次所有 class / id 的完整 CSS 规则。
绝对禁止只输出 HTML 结构而省略 CSS！没有 CSS 的 HTML 等于白纸，用户什么都看不到。
如果用户提示词里附带了 CSS 模板/示例代码，你必须将该 CSS 原样保留在 <style> 中，不可删减、不可省略、不可拆分。

其他要求：
1. 输出纯 HTML+CSS，禁止使用 <script> 标签或任何 JavaScript。
2. 允许包含交互与动画效果，可用方案：
   - <details><summary>点击展开</summary><div>折叠内容</div></details>
   - <input type="checkbox" id="x"><label for="x">切换</label> 配合 :checked 选择器控制显示/隐藏/样式切换
   - <input type="radio" name="grp" id="r1"><label for="r1">选项</label> 配合 :checked 实现选项卡/分支选择
   - :hover 悬停动画、:target 锚点定位变化
   - CSS transition / animation / @keyframes 制作渐变、淡入淡出、滑动等动画
3. 用 <style> 标签在输出最开头集中书写 CSS，所有视觉效果（布局、颜色、字体、间距、动画、交互状态）全部写在这个 <style> 里。
4. 如果用户提示词中包含了"必须原样输出"的 HTML/CSS 模板代码，你必须逐字保留模板结构与 CSS（标签、属性、ID、class、顺序都不改），只替换占位符文本（如：[中文占位符]）。禁止省略 <style> 或任何关键节点。
5. 直接输出 HTML，不要输出开场白、说明文字或 markdown 代码块包裹（不要写 \`\`\`html ... \`\`\`）。`
            : `你是一名擅长写短篇小说的作家。请根据用户提供的提示词，结合可能的角色设定和世界观，生成一段完整而精彩的短篇小说。要求：
1. 剧情结构完整，有开端、发展和结尾。
2. 如果提示词中没有明确的世界观和设定，可以自行补充，但不要偏离提示词的核心需求。
3. 直接输出剧本正文，不要输出任何开场白或说明（例如不要输出「好的，作家。这是一段根据你提供的提示词和设定生成的短篇小说。」等句子）。`;

        let finalPrompt = customPrompt;

        // 如果选择了角色，注入角色信息
        if (charId) {
            const char = db.characters.find(c => c.id === charId);
            if (char) {
                finalPrompt = `【角色信息】\n角色名：${char.realName || char.remarkName || '未命名角色'}\n角色人设：${char.persona || '未设定'}\n\n【用户提示】\n${customPrompt}`;
            }
        }

        // 如果选择了人设预设，注入人设内容
        if (personaId) {
            const persona = db.myPersonaPresets.find(p => (p.id || p.name) === personaId);
            if (persona) {
                finalPrompt += `\n\n【用户人设】\n名称：${persona.name}\n人设内容：${persona.content}\n\n注意：在生成的小说中，如果提到用户角色，请使用"${persona.name}"作为用户的名字，或使用{{user_name}}占位符（后续会自动替换）。`;
            }
        }

        // 如果选择了世界书，注入世界书内容
        const worldbookOptions = document.getElementById('theater-worldbook-options');
        if (worldbookOptions && db.worldBooks && db.worldBooks.length > 0) {
            const selectedOptions = worldbookOptions.querySelectorAll('.theater-multiselect-option.selected');
            if (selectedOptions.length > 0) {
                const selectedIds = Array.from(selectedOptions).map(opt => opt.dataset.id);
                const selectedBooks = db.worldBooks.filter(wb => selectedIds.includes(wb.id) && !wb.disabled);
                if (selectedBooks.length > 0) {
                    const worldbookText = selectedBooks
                        .map(wb => `【${wb.name || wb.title || '未命名世界书'}】\n${wb.content || ''}`)
                        .join('\n\n');
                    finalPrompt += `\n\n【世界观设定参考】\n${worldbookText}`;
                }
            }
        }

        // 如果开启了聊天记录 & 日记总结读取，注入到提示词中
        const contextToggle = document.getElementById('theater-context-toggle');
        const contextEnabled = contextToggle && contextToggle.getAttribute('aria-checked') === 'true';
        if (contextEnabled && charId) {
            const char = db.characters.find(c => c.id === charId);
            if (char) {
                const chatHistoryCountInput = document.getElementById('theater-chat-history-count');
                const journalCountInput = document.getElementById('theater-journal-count');
                const chatHistoryCount = Math.max(0, Math.min(parseInt(chatHistoryCountInput?.value) || 0, 200));
                const journalCount = Math.max(0, Math.min(parseInt(journalCountInput?.value) || 0, 50));

                // 读取聊天记录
                if (chatHistoryCount > 0 && Array.isArray(char.history) && char.history.length > 0) {
                    let recent = char.history.slice(-chatHistoryCount);
                    // 过滤掉不应进入上下文的消息
                    if (typeof filterHistoryForAI === 'function') {
                        recent = filterHistoryForAI(char, recent);
                    }
                    recent = recent
                        .filter(m => !m.isContextDisabled)
                        .filter(m => m.role === 'user' || m.role === 'assistant');

                    if (recent.length > 0) {
                        const charName = char.realName || char.remarkName || '角色';
                        const userName = personaId
                            ? (db.myPersonaPresets.find(p => (p.id || p.name) === personaId)?.name || '用户')
                            : '用户';
                        const historyText = recent.map(m => {
                            let content = '';
                            if (m && Array.isArray(m.parts) && m.parts.length > 0) {
                                content = m.parts.map(p => p.text || '[图片]').join('');
                            } else {
                                content = (m && m.content) ? m.content : '';
                            }
                            const sender = m.role === 'user' ? userName : charName;
                            return `${sender}: ${content}`;
                        }).join('\n');
                        finalPrompt += `\n\n【用户与角色的最近聊天记录（共${recent.length}条）】\n${historyText}`;
                    }
                }

                // 读取日记总结
                if (journalCount > 0 && Array.isArray(char.memoryJournals) && char.memoryJournals.length > 0) {
                    let journals = char.memoryJournals
                        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
                        .slice(0, journalCount);

                    if (journals.length > 0) {
                        const journalText = journals
                            .map(j => `标题：${j.title || '无标题'}\n内容：${j.content || ''}`)
                            .join('\n\n---\n\n');
                        finalPrompt += `\n\n【用户与角色的日记总结（共${journals.length}条）】\n${journalText}`;
                    }
                }
            }
        }

        // 检查是否使用独立API
        const theaterApiToggleEl = document.getElementById('theater-api-toggle');
        const useTheaterApi = theaterApiToggleEl && theaterApiToggleEl.getAttribute('aria-checked') === 'true';
        let effectiveModel = model;
        let overrideSettings = null;

        if (useTheaterApi) {
            const tUrl = (document.getElementById('theater-api-url')?.value || '').trim();
            const tKey = (document.getElementById('theater-api-key')?.value || '').trim();
            const tModel = (document.getElementById('theater-api-model')?.value || '').trim();
            if (tUrl && tKey && tModel) {
                overrideSettings = { url: tUrl, key: tKey, model: tModel };
                effectiveModel = tModel;
            } else {
                // 也尝试从已保存的设置中读取
                const saved = db.theaterApiSettings || {};
                if (saved.useTheaterApi && saved.url && saved.key && saved.model) {
                    overrideSettings = { url: saved.url, key: saved.key, model: saved.model };
                    effectiveModel = saved.model;
                } else {
                    showToast('独立API配置不完整，将使用主API');
                }
            }
        }

        const apiPayload = {
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: finalPrompt }
            ],
            model: effectiveModel
        };

        const response = await callChatCompletion(apiPayload, overrideSettings);
        if (response && response.choices && response.choices[0] && response.choices[0].message) {
            const content = response.choices[0].message.content.trim();

            // 替换可能的占位符角色名
            let processedContent = content;

            // HTML 模式下去掉可能的 markdown 代码块包裹
            if (isHtmlMode) {
                processedContent = processedContent.replace(/^```(?:html)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');

                // 安全检查：如果 HTML 中有 class= 但缺少 <style>，尝试从用户提示词里提取 <style> 补上
                const hasClassOrId = /class\s*=\s*["']/i.test(processedContent);
                const hasStyleTag = /<style\b/i.test(processedContent);
                if (hasClassOrId && !hasStyleTag) {
                    // 从用户提示词里提取 <style>...</style> 块
                    const styleMatch = (customPrompt || '').match(/<style\b[^>]*>[\s\S]*?<\/style>/i);
                    if (styleMatch) {
                        processedContent = styleMatch[0] + '\n' + processedContent;
                        console.log('[HTML模式] AI 输出缺少 <style>，已从用户提示词自动补回');
                    } else {
                        console.warn('[HTML模式] AI 输出含 class 但缺少 <style>，用户提示词中也未找到可补充的 CSS');
                        showToast('⚠️ 生成的 HTML 缺少 CSS 样式，显示可能异常。建议在提示词中附上 CSS 或重新生成。');
                    }
                }
            }

            if (charId) {
                const char = db.characters.find(c => c.id === charId);
                const charName = char?.realName || char?.remarkName;
                if (charName) {
                    processedContent = processedContent.replace(/【角色名】|<角色名>|{{角色名}}|\[角色名\]/g, charName);
                }
            }
            // 去掉 AI 开场白，只保留剧本正文
            if (!isHtmlMode) {
                processedContent = stripTheaterIntro(processedContent);
            }

            // 统一变量占位符：
            // {{user}}/{{USER}}/{{User}} -> {{user_name}}
            // {{char}}/{{CHAR}}/{{Char}} -> {{char_name}}
            processedContent = processedContent
                .replace(/\{\{\s*(user|User|USER)\s*\}\}/g, '{{user_name}}')
                .replace(/\{\{\s*(char|Char|CHAR)\s*\}\}/g, '{{char_name}}');
            // 纯文字模式下额外替换裸 user/char 单词（HTML 模式可能破坏标签）
            if (!isHtmlMode) {
                processedContent = processedContent
                    .replace(/\b(user|User|USER)\b/g, '{{user_name}}')
                    .replace(/\b(char|Char|CHAR)\b/g, '{{char_name}}');
            }

            // 替换{{user_name}}为实际的人设名称
            if (personaId) {
                const persona = db.myPersonaPresets.find(p => (p.id || p.name) === personaId);
                if (persona && persona.name) {
                    // 将{{user_name}}替换为实际选择的人设名称
                    processedContent = processedContent.replace(/\{\{user_name\}\}/g, persona.name);
                }
            }
            
            // 替换{{char_name}}为实际的角色名称
            if (charId) {
                const char = db.characters.find(c => c.id === charId);
                const charName = char?.realName || char?.remarkName;
                if (charName) {
                    processedContent = processedContent.replace(/\{\{char_name\}\}/g, charName);
                }
            }

            // 默认标题为"剧情"，用户可以后续编辑
            const scenario = {
                id: Date.now().toString(),
                title: isHtmlMode ? 'HTML 剧情' : '剧情',
                content: processedContent,
                category: category,
                charId: (charId && charId.trim()) ? charId : null,
                personaId: (personaId && personaId.trim()) ? personaId : null,
                worldBookIds: [],
                customPrompt: customPrompt || null,
                createdAt: Date.now(),
                mode: theaterCurrentMode
            };

            const list = getTheaterScenarios();
            list.unshift(scenario);
            setTheaterScenarios(list);
            await saveData();
            
            showToast('剧情生成成功！');
            switchScreen('theater-screen');
            renderTheaterScenarios();
        } else {
            showToast('生成失败，请重试');
        }
    } catch (error) {
        console.error('生成剧情失败:', error);
        showToast('生成失败：' + (error.message || '未知错误'));
    } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = '生成剧情';
    }
}

// 显示分享选择模态框
function showShareTheaterModal() {
    if (!currentTheaterScenarioId) return;

    const scenario = getTheaterScenarios().find(s => s.id === currentTheaterScenarioId);
    if (!scenario) {
        showToast('找不到该剧情');
        return;
    }

    // 创建或获取模态框
    let modal = document.getElementById('theater-share-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'theater-share-modal';
        modal.className = 'theater-share-modal';
        modal.innerHTML = `
            <div class="theater-share-modal-content">
                <div class="theater-share-modal-header">
                    <h3>选择分享对象</h3>
                    <button class="theater-share-modal-close" id="theater-share-modal-close">×</button>
                </div>
                <div class="theater-share-modal-body">
                    <div class="theater-share-search">
                        <input type="text" id="theater-share-search-input" placeholder="搜索联系人..." class="theater-share-search-input">
                    </div>
                    <div class="theater-share-list" id="theater-share-list">
                        <!-- 联系人列表将在这里渲染 -->
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // 添加样式
        if (!document.getElementById('theater-share-modal-style')) {
            const style = document.createElement('style');
            style.id = 'theater-share-modal-style';
            style.textContent = `
                .theater-share-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    z-index: 10000;
                    display: none;
                    justify-content: center;
                    align-items: center;
                    backdrop-filter: blur(5px);
                }
                .theater-share-modal.visible {
                    display: flex;
                }
                .theater-share-modal-content {
                    background: #fff;
                    border-radius: 16px;
                    width: 90%;
                    max-width: 400px;
                    max-height: 80vh;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
                }
                .theater-share-modal-header {
                    padding: 20px;
                    border-bottom: 1px solid #f0f0f0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .theater-share-modal-header h3 {
                    margin: 0;
                    font-size: 18px;
                    font-weight: 600;
                    color: #333;
                }
                .theater-share-modal-close {
                    border: none;
                    background: transparent;
                    font-size: 20px;
                    cursor: pointer;
                    color: #999;
                }
                .theater-share-modal-body {
                    padding: 15px 20px 20px;
                }
                .theater-share-search-input {
                    width: 100%;
                    padding: 8px 10px;
                    border-radius: 8px;
                    border: 1px solid #eee;
                    font-size: 14px;
                    margin-bottom: 10px;
                }
                .theater-share-list {
                    max-height: 300px;
                    overflow-y: auto;
                }
                .theater-share-item {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 8px 0;
                    cursor: pointer;
                    border-bottom: 1px solid #f5f5f5;
                }
                .theater-share-item:last-child {
                    border-bottom: none;
                }
                .theater-share-avatar {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    object-fit: cover;
                }
                .theater-share-name {
                    font-size: 14px;
                    color: #333;
                }
                .theater-share-meta {
                    font-size: 12px;
                    color: #999;
                }
            `;
            document.head.appendChild(style);
        }
    }

    // 渲染联系人 / 群聊列表
    const list = document.getElementById('theater-share-list');
    const searchInput = document.getElementById('theater-share-search-input');
    const closeBtn = document.getElementById('theater-share-modal-close');

    if (!list || !searchInput || !closeBtn) return;

    const renderRecipients = (keyword = '') => {
        const normalizedKeyword = keyword.trim().toLowerCase();
        list.innerHTML = '';

        const contacts = db.characters || [];
        const groups = db.groups || [];

        const filteredContacts = normalizedKeyword
            ? contacts.filter(c => 
                (c.remarkName && c.remarkName.toLowerCase().includes(normalizedKeyword)) ||
                (c.realName && c.realName.toLowerCase().includes(normalizedKeyword))
            )
            : contacts;
        
        const filteredGroups = normalizedKeyword
            ? groups.filter(g => 
                (g.name && g.name.toLowerCase().includes(normalizedKeyword))
            )
            : groups;

        if (filteredContacts.length === 0 && filteredGroups.length === 0) {
            list.innerHTML = '<div style="padding: 10px; font-size: 13px; color: #999;">没有找到匹配的联系人或群聊</div>';
            return;
        }

        if (filteredContacts.length > 0) {
            const contactsTitle = document.createElement('div');
            contactsTitle.className = 'theater-share-section-title';
            contactsTitle.textContent = '联系人';
            list.appendChild(contactsTitle);
        }

        filteredContacts.forEach(char => {
            const item = document.createElement('div');
            item.className = 'theater-share-item';
            item.dataset.id = char.id;

            const rawStatus = char.status || (char.persona ? (char.persona.slice(0, 20) + (char.persona.length > 20 ? '...' : '')) : '');
            const statusText = rawStatus || '暂无状态';

            item.innerHTML = `
                <img src="${char.avatar || 'https://i.postimg.cc/HLXK1Z0L/chan-120.png'}" alt="${DOMPurify.sanitize(char.remarkName || char.realName || '角色')}" class="theater-share-avatar">
                <div class="theater-share-info">
                    <div class="theater-share-name">${DOMPurify.sanitize(char.remarkName || char.realName || '角色')}</div>
                    <div class="theater-share-meta">${DOMPurify.sanitize(statusText)}</div>
                </div>
            `;
            item.addEventListener('click', () => {
                shareTheaterToContact(char.id);
                modal.classList.remove('visible');
            });
            list.appendChild(item);
        });

        if (filteredGroups.length > 0) {
            const groupsTitle = document.createElement('div');
            groupsTitle.className = 'theater-share-section-title';
            groupsTitle.textContent = '群聊';
            list.appendChild(groupsTitle);
        }

        filteredGroups.forEach(group => {
            const item = document.createElement('div');
            item.className = 'theater-share-item';
            item.dataset.id = group.id;

            const memberCount = (group.members && group.members.length) ? group.members.length : 0;
            const metaText = `成员 ${memberCount} 人`;

            item.innerHTML = `
                <img src="${group.avatar || 'https://i.postimg.cc/fTLCngk1/image.jpg'}" alt="${DOMPurify.sanitize(group.name || '群聊')}" class="theater-share-avatar">
                <div class="theater-share-info">
                    <div class="theater-share-name">${DOMPurify.sanitize(group.name || '群聊')}</div>
                    <div class="theater-share-meta">${DOMPurify.sanitize(metaText)}</div>
                </div>
            `;
            item.addEventListener('click', () => {
                shareTheaterToGroup(group.id);
                modal.classList.remove('visible');
            });
            list.appendChild(item);
        });
    };

    renderRecipients();

    searchInput.oninput = (e) => {
        renderRecipients(e.target.value);
    };

    closeBtn.onclick = () => {
        modal.classList.remove('visible');
    };

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('visible');
        }
    });

    modal.classList.add('visible');
}

// 分享小剧场到指定联系人
async function shareTheaterToContact(charId) {
    if (!currentTheaterScenarioId) return;

    const scenario = getTheaterScenarios().find(s => s.id === currentTheaterScenarioId);
    if (!scenario) {
        showToast('找不到该剧情');
        return;
    }

    const char = db.characters.find(c => c.id === charId);
    if (!char) {
        showToast('找不到联系人');
        return;
    }

    // 这里采用特殊占位格式，由 chat_render.js 识别并渲染为“小卡片”：
    // 实际内容只是一条短指令，不直接塞入长剧情，避免刷屏。
    const shareText = `[小剧场分享:${scenario.id}]`;

    const shareMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: shareText,
        timestamp: Date.now()
    };

    if (!char.history) {
        char.history = [];
    }
    char.history.push(shareMessage);

    await saveData();
    showToast(`已分享给 ${char.remarkName || char.realName || '联系人'}`);
}

// 分享小剧场到指定群聊
async function shareTheaterToGroup(groupId) {
    if (!currentTheaterScenarioId) return;

    const scenario = getTheaterScenarios().find(s => s.id === currentTheaterScenarioId);
    if (!scenario) {
        showToast('找不到该剧情');
        return;
    }

    const group = (db.groups || []).find(g => g.id === groupId);
    if (!group) {
        showToast('找不到群聊');
        return;
    }

    const shareText = `[小剧场分享:${scenario.id}]`;
    const shareMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: shareText,
        timestamp: Date.now()
    };

    if (!group.history) {
        group.history = [];
    }
    group.history.push(shareMessage);

    await saveData();
    showToast(`已分享至群聊「${group.name || '群聊'}」`);
}

// 保存编辑后的剧情
async function saveEditScenario() {
    if (!currentTheaterScenarioId) return;

    const scenario = getTheaterScenarios().find(s => s.id === currentTheaterScenarioId);
    if (!scenario) return;

    const contentInput = document.getElementById('theater-edit-content');
    const titleInput = document.getElementById('theater-edit-title');
    if (!contentInput) return;

    const newContent = contentInput.value.trim();
    if (!newContent) {
        showToast('内容不能为空');
        return;
    }

    scenario.content = newContent;
    if (titleInput && titleInput.value.trim()) {
        scenario.title = titleInput.value.trim();
    }
    scenario.isEditing = false;
    scenario.isEditingTitle = false;

    await saveData();
    showToast('已保存修改');
    if (theaterCurrentMode === 'html') {
        showTheaterHtmlScenarioDetail(scenario);
    } else {
        showTheaterScenarioDetail(scenario);
    }
    renderTheaterScenarios();
}

// 删除剧情
async function deleteCurrentScenario() {
    if (!currentTheaterScenarioId) return;

    const scenarios = getTheaterScenarios();
    const index = scenarios.findIndex(s => s.id === currentTheaterScenarioId);
    if (index === -1) return;

    if (!confirm('确定要删除这条剧情吗？此操作不可撤销。')) return;

    scenarios.splice(index, 1);
    setTheaterScenarios(scenarios);
    await saveData();
    
    showToast('剧情已删除');
    switchScreen('theater-screen');
    renderTheaterScenarios();
    currentTheaterScenarioId = null;
}

// 收藏/取消收藏
async function toggleFavoriteScenario() {
    if (!currentTheaterScenarioId) return;

    const scenario = getTheaterScenarios().find(s => s.id === currentTheaterScenarioId);
    if (!scenario) return;

    scenario.isFavorite = !scenario.isFavorite;
    await saveData();

    showToast(scenario.isFavorite ? '已收藏' : '已取消收藏');
    if (theaterCurrentMode === 'html') {
        showTheaterHtmlScenarioDetail(scenario);
    } else {
        showTheaterScenarioDetail(scenario);
    }
    renderTheaterScenarios();
}

// 修改分类
async function editScenarioCategory() {
    if (!currentTheaterScenarioId) return;

    const scenario = getTheaterScenarios().find(s => s.id === currentTheaterScenarioId);
    if (!scenario) return;

    const newCategory = prompt('请输入新的分类名称：', scenario.category || '未分类');
    if (newCategory === null) return;

    const trimmed = newCategory.trim();
    scenario.category = trimmed || '未分类';

    await saveData();
    showToast('分类已更新');
    if (theaterCurrentMode === 'html') {
        showTheaterHtmlScenarioDetail(scenario);
    } else {
        showTheaterScenarioDetail(scenario);
    }
    renderTheaterScenarios();
}

// 保存提示词为预设（模式隔离）
async function saveTheaterPromptPreset() {
    const promptInput = document.getElementById('theater-custom-prompt');
    const presetSelect = document.getElementById('theater-prompt-preset-select');
    if (!promptInput || !presetSelect) return;

    const content = promptInput.value.trim();
    if (!content) {
        showToast('提示词内容不能为空');
        return;
    }

    const name = prompt('请输入预设名称：');
    if (!name) return;

    const presets = getTheaterPromptPresets();
    const id = Date.now().toString();
    presets.push({ id, name, content });
    setTheaterPromptPresets(presets);

    await saveData();
    showToast('已保存为提示词预设');
    populateTheaterForm();

    presetSelect.value = id;
}

// 应用提示词预设（模式隔离）
function applyTheaterPromptPreset() {
    const presetSelect = document.getElementById('theater-prompt-preset-select');
    const promptInput = document.getElementById('theater-custom-prompt');
    if (!presetSelect || !promptInput) return;

    const presetId = presetSelect.value;
    const presets = getTheaterPromptPresets();
    if (!presetId || !presets) return;

    const preset = presets.find(p => (p.id || p.name) === presetId);
    if (!preset) return;

    promptInput.value = preset.content || '';
}

// 管理提示词预设（支持单选/多选删除）
async function openTheaterPromptPresetManager() {
    // 创建或获取管理模态框
    let modal = document.getElementById('theater-preset-manager-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'theater-preset-manager-modal';
        modal.className = 'theater-preset-manager-modal';
        modal.innerHTML = `
            <div class="theater-preset-manager-dialog">
                <div class="theater-preset-manager-header">
                    <h3>管理提示词预设</h3>
                    <button class="theater-preset-manager-close" id="theater-preset-manager-close">×</button>
                </div>
                <div class="theater-preset-manager-body">
                    <div class="theater-preset-manager-toolbar">
                        <button id="theater-preset-select-all" class="theater-preset-toolbar-btn">全选/全不选</button>
                        <button id="theater-preset-delete-selected" class="theater-preset-toolbar-btn danger">删除选中</button>
                    </div>
                    <div id="theater-preset-manager-list" class="theater-preset-manager-list"></div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const listEl = modal.querySelector('#theater-preset-manager-list');
    const closeBtn = modal.querySelector('#theater-preset-manager-close');
    const selectAllBtn = modal.querySelector('#theater-preset-select-all');
    const deleteSelectedBtn = modal.querySelector('#theater-preset-delete-selected');
    if (!listEl || !closeBtn || !selectAllBtn || !deleteSelectedBtn) return;

    const renderList = () => {
        const presets = getTheaterPromptPresets();
        if (!presets.length) {
            listEl.innerHTML = '<div class="theater-preset-manager-empty">暂无提示词预设</div>';
            return;
        }

        listEl.innerHTML = '';
        presets.forEach(preset => {
            const item = document.createElement('div');
            item.className = 'theater-preset-manager-item';

            const previewContent = (preset.content || '').length > 40
                ? (preset.content || '').slice(0, 40) + '...'
                : (preset.content || '');

            item.innerHTML = `
                <label class="theater-preset-manager-checkbox-wrap">
                    <input type="checkbox" class="theater-preset-manager-checkbox" data-id="${preset.id}">
                    <span class="theater-preset-manager-checkbox-mark"></span>
                </label>
                <div class="theater-preset-manager-item-main">
                    <div class="theater-preset-manager-item-name">${DOMPurify.sanitize(preset.name || '')}</div>
                    <div class="theater-preset-manager-item-preview">${DOMPurify.sanitize(previewContent)}</div>
                </div>
                <button class="theater-preset-manager-delete-btn" data-id="${preset.id}">删除</button>
            `;
            listEl.appendChild(item);
        });

        // 绑定删除按钮事件
        const deleteButtons = listEl.querySelectorAll('.theater-preset-manager-delete-btn');
        deleteButtons.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                if (!id) return;
                if (!confirm('确定删除该预设吗？')) return;

                const presets = getTheaterPromptPresets();
                const index = presets.findIndex(p => p.id === id);
                if (index === -1) return;

                presets.splice(index, 1);
                setTheaterPromptPresets(presets);
                await saveData();
                showToast('已删除预设');
                populateTheaterForm();
                renderList();
            });
        });
    };

    renderList();

    // 关闭事件
    closeBtn.onclick = () => {
        modal.classList.remove('visible');
    };
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.classList.remove('visible');
        }
    };

    // 全选 / 全不选
    selectAllBtn.onclick = () => {
        const checkboxes = listEl.querySelectorAll('.theater-preset-manager-checkbox');
        if (!checkboxes.length) return;
        const hasUnchecked = Array.from(checkboxes).some(cb => !cb.checked);
        checkboxes.forEach(cb => {
            cb.checked = hasUnchecked;
        });
    };

    // 删除选中的预设（多选删除）
    deleteSelectedBtn.onclick = async () => {
        const checkboxes = Array.from(listEl.querySelectorAll('.theater-preset-manager-checkbox')).filter(cb => cb.checked);
        if (!checkboxes.length) {
            showToast('请先选择要删除的预设');
            return;
        }
        const ids = checkboxes.map(cb => cb.getAttribute('data-id')).filter(Boolean);
        if (!ids.length) return;
        if (!confirm(`确定删除选中的 ${ids.length} 个预设吗？`)) return;

        setTheaterPromptPresets(getTheaterPromptPresets().filter(p => !ids.includes(p.id)));
        await saveData();
        showToast('已删除选中预设');
        populateTheaterForm();
        renderList();
    };

    modal.classList.add('visible');
}

// ===================== 模式切换 =====================

/** 切换小剧场模式 */
function switchTheaterMode(mode) {
    if (mode === theaterCurrentMode) return;
    theaterCurrentMode = mode;

    // 持久化当前模式
    db.theaterMode = mode;
    saveData();

    // 更新开关 UI
    const modeSwitch = document.getElementById('theater-mode-switch');
    if (modeSwitch) {
        modeSwitch.setAttribute('data-mode', mode);
        modeSwitch.querySelectorAll('.theater-mode-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.mode === mode);
        });
    }

    // 切换两个独立的主内容区
    const textMain = document.getElementById('theater-text-main');
    const htmlMain = document.getElementById('theater-html-main');
    if (textMain) textMain.style.display = (mode === 'text') ? '' : 'none';
    if (htmlMain) htmlMain.style.display = (mode === 'html') ? '' : 'none';

    // 退出多选状态
    exitTheaterMultiSelectMode();

    // 重新渲染当前模式列表
    renderTheaterScenarios();

    // 系统提示
    showToast(mode === 'html' ? '已切换至 HTML 模式' : '已切换至纯文字模式');
}

// ===================== HTML 模式详情页 =====================

/** HTML 模式：显示详情页（独立 DOM） */
function showTheaterHtmlScenarioDetail(scenario) {
    currentTheaterScenarioId = scenario.id;
    const detailContent = document.getElementById('theater-html-detail-content');
    if (!detailContent) return;

    let charName = '未指定';
    let charPersona = '';
    if (scenario.charId) {
        const char = db.characters.find(c => c.id === scenario.charId);
        if (char) {
            charName = char.realName || char.remarkName || '未知角色';
            charPersona = char.persona || '';
        }
    }

    let personaName = '';
    let personaContent = '';
    if (scenario.personaId) {
        const persona = db.myPersonaPresets.find(p => (p.id || p.name) === scenario.personaId);
        if (persona) {
            personaName = persona.name || '';
            personaContent = persona.content || '';
        }
    }

    const category = scenario.category || '未分类';
    const date = new Date(scenario.createdAt || scenario.timestamp || Date.now());
    const dateStr = date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });

    const isEditing = scenario.isEditing || scenario.isEditingTitle || false;

    // HTML 模式：正文直接渲染 HTML（使用 DOMPurify 净化）
    let displayContent = scenario.content || '';
    if (!isEditing && typeof displayContent === 'string') {
        const userName = personaName || '我';
        if (userName) {
            displayContent = displayContent.replace(/\{\{\s*(user|User|USER|user_name)\s*\}\}/g, userName);
        }
        if (charName && charName !== '未指定') {
            displayContent = displayContent.replace(/\{\{\s*(char|Char|CHAR|char_name)\s*\}\}/g, charName);
        }
    }

    // HTML 模式渲染：使用 iframe(srcdoc) 隔离 CSS，避免被全局样式影响；同时保持纯 HTML+CSS 交互可用
    // 重要：不再使用 DOMPurify 对 iframe 内容做二次清洗！
    // 原因：DOMPurify 会删掉 <dl>/<dt>/<dd>/<nav> 等非白名单标签、@import、CSS 变量等，
    //       导致渲染全部崩坏。iframe sandbox="allow-forms" 已提供足够安全隔离：
    //       - 禁止 JavaScript 执行（无 allow-scripts）
    //       - 禁止访问父文档（无 allow-same-origin）
    //       - 仅允许表单元素交互（checkbox/radio 切换状态）
    let htmlForIframe = String(displayContent || '');

    const contentDisplay = isEditing
        // 注意：这里不能用 DOMPurify.sanitize()，否则会把 <style>/<input>/<label> 等交互结构“编辑时”清掉
        ? `<textarea id="theater-html-edit-content" class="theater-edit-textarea" style="min-height:300px;">${theaterEscapeHtml(scenario.content || '')}</textarea>`
        : `<div class="theater-html-detail-body">
                <iframe id="theater-html-render-frame" class="theater-html-render-frame" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer"></iframe>
           </div>`;

    let metaInfo = `<span class="theater-detail-badge" style="background: rgba(100,181,246,0.2); color: #1976d2;">HTML</span>`;
    metaInfo += `<span class="theater-detail-badge">${DOMPurify.sanitize(category)}</span>`;
    if (charName !== '未指定') {
        metaInfo += `<span>角色：${DOMPurify.sanitize(charName)}</span>`;
    }
    if (personaName) {
        metaInfo += `<span>人设：${DOMPurify.sanitize(personaName)}</span>`;
    }
    metaInfo += `<span>${dateStr}</span>`;

    detailContent.innerHTML = `
        <div class="theater-detail-header">
            <h2 class="theater-detail-title" style="display: flex; align-items: center; flex-wrap: wrap; gap: 10px;">
                ${scenario.isFavorite ? '<span class="theater-favorite-icon" style="color: #ffd700; margin-right: 5px;">★</span>' : ''}
                ${scenario.isEditingTitle || (isEditing && !scenario.isEditing)
                    ? `<input type="text" id="theater-html-edit-title" class="theater-edit-title-input" value="${DOMPurify.sanitize(scenario.title || 'HTML 剧情')}">`
                    : `<span class="theater-detail-title-text">${DOMPurify.sanitize(scenario.title || 'HTML 剧情')}</span>${!isEditing ? '<button class="theater-edit-title-btn" id="theater-html-edit-title-btn">编辑标题</button>' : ''}`
                }
            </h2>
            <div class="theater-detail-meta">
                ${metaInfo}
            </div>
        </div>
        ${contentDisplay}
    `;

    // 注入 iframe 内容（用完整 HTML 文档包装，保证 charset / 默认样式 / 解析行为一致）
    if (!isEditing) {
        const frame = document.getElementById('theater-html-render-frame');
        if (frame) {
            // 自动测高脚本：iframe 加载后把实际内容高度 postMessage 给父页面，父页面据此撑开 iframe
            const autoHeightScript = `<script>
(function(){
  function report(){
    var h = Math.max(document.body.scrollHeight, document.body.offsetHeight, document.documentElement.scrollHeight);
    parent.postMessage({type:'theater-iframe-height', height: h}, '*');
  }
  // 首次 + 图片/字体加载后再测一次
  window.addEventListener('load', function(){ setTimeout(report, 100); });
  document.addEventListener('DOMContentLoaded', report);
  // 持续观察 DOM 变化（如 details 展开）
  if(window.MutationObserver){
    new MutationObserver(function(){ setTimeout(report, 50); }).observe(document.documentElement, {childList:true, subtree:true, attributes:true});
  }
  // checkbox/radio 切换后也重新测高
  document.addEventListener('change', function(){ setTimeout(report, 50); });
})();
<\/script>`;

            // 检查内容中是否已包含 <body> 标签；如果已有则直接用，否则包一层
            const hasBodyTag = /<body[\s>]/i.test(htmlForIframe);
            const wrapped = hasBodyTag
                ? `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>${htmlForIframe}${autoHeightScript}</html>`
                : `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:12px;box-sizing:border-box;">
${htmlForIframe || ''}
${autoHeightScript}
</body>
</html>`;
            frame.srcdoc = wrapped;

            if (!htmlForIframe || !String(htmlForIframe).trim()) {
                showToast('HTML 内容为空：请确认输出包含完整 <style> 与结构');
            }
        }
    }

    // 更新按钮显示状态
    const favoriteBtn = document.getElementById('theater-html-favorite-btn');
    const saveEditBtn = document.getElementById('theater-html-save-edit-btn');
    const shareBtn = document.getElementById('theater-html-share-btn');
    const editCategoryBtn = document.getElementById('theater-html-edit-category-btn');
    const deleteBtn = document.getElementById('theater-html-delete-btn');

    if (favoriteBtn) favoriteBtn.textContent = scenario.isFavorite ? '取消收藏' : '收藏';
    if (saveEditBtn) saveEditBtn.style.display = isEditing ? 'block' : 'none';
    if (shareBtn) shareBtn.style.display = isEditing ? 'none' : 'block';
    if (editCategoryBtn) editCategoryBtn.style.display = isEditing ? 'none' : 'block';
    if (deleteBtn) deleteBtn.style.display = isEditing ? 'none' : 'block';

    scenario.isEditing = isEditing;

    // 绑定编辑标题按钮
    const editTitleBtn = document.getElementById('theater-html-edit-title-btn');
    if (editTitleBtn && !isEditing) {
        editTitleBtn.addEventListener('click', () => {
            const s = getTheaterScenarios().find(s => s.id === currentTheaterScenarioId);
            if (s) {
                s.isEditingTitle = true;
                showTheaterHtmlScenarioDetail(s);
            }
        });
    }

    if (scenario.isEditingTitle && document.getElementById('theater-html-edit-title')) {
        const titleInput = document.getElementById('theater-html-edit-title');
        setTimeout(() => {
            titleInput.focus();
            titleInput.select();
        }, 100);

        const handleKeyDown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveHtmlEditScenario();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                const s = getTheaterScenarios().find(s => s.id === currentTheaterScenarioId);
                if (s) {
                    s.isEditingTitle = false;
                    showTheaterHtmlScenarioDetail(s);
                }
            }
        };
        titleInput.addEventListener('keydown', handleKeyDown);
    }

    switchScreen('theater-html-detail-screen');
}

/** HTML 模式：保存编辑 */
async function saveHtmlEditScenario() {
    if (!currentTheaterScenarioId) return;
    const scenario = getTheaterScenarios().find(s => s.id === currentTheaterScenarioId);
    if (!scenario) return;

    const contentInput = document.getElementById('theater-html-edit-content');
    const titleInput = document.getElementById('theater-html-edit-title');
    if (!contentInput) return;

    const newContent = contentInput.value.trim();
    if (!newContent) {
        showToast('内容不能为空');
        return;
    }

    scenario.content = newContent;
    if (titleInput && titleInput.value.trim()) {
        scenario.title = titleInput.value.trim();
    }
    scenario.isEditing = false;
    scenario.isEditingTitle = false;

    await saveData();
    showToast('已保存修改');
    showTheaterHtmlScenarioDetail(scenario);
    renderTheaterScenarios();
}

// ===================== 初始化 =====================

// 初始化小剧场系统
let theaterSystemInitialized = false;
function setupTheaterSystem() {
    if (theaterSystemInitialized) return;
    theaterSystemInitialized = true;

    // 监听 iframe postMessage，自动调整 iframe 高度以完整显示 HTML 内容
    window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'theater-iframe-height' && typeof e.data.height === 'number') {
            const frame = document.getElementById('theater-html-render-frame');
            if (frame) {
                // 加一点余量避免出现滚动条
                frame.style.height = (e.data.height + 20) + 'px';
            }
        }
    });

    // 主页：创建按钮
    const createBtn = document.getElementById('theater-create-btn');
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            populateTheaterForm();
            switchScreen('theater-create-screen');
        });
    }

    // 创建页：生成按钮
    const generateBtn = document.getElementById('theater-generate-btn');
    if (generateBtn) {
        generateBtn.addEventListener('click', generateTheaterScenario);
    }

    // 创建页：提示词预设
    const promptPresetSelect = document.getElementById('theater-prompt-preset-select');
    if (promptPresetSelect) {
        promptPresetSelect.addEventListener('change', applyTheaterPromptPreset);
    }

    const savePromptBtn = document.getElementById('theater-save-prompt-btn');
    if (savePromptBtn) {
        savePromptBtn.addEventListener('click', (e) => {
            e.preventDefault();
            saveTheaterPromptPreset();
        });
    }

    const managePromptBtn = document.getElementById('theater-manage-prompt-btn');
    if (managePromptBtn) {
        managePromptBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openTheaterPromptPresetManager();
        });
    }

    // 创建页：世界书下拉
    const worldbookDisplay = document.getElementById('theater-worldbook-display');
    const worldbookDropdown = document.getElementById('theater-worldbook-dropdown');
    if (worldbookDisplay && worldbookDropdown) {
        worldbookDisplay.addEventListener('click', () => {
            worldbookDropdown.classList.toggle('open');
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.theater-multiselect-wrapper')) {
                worldbookDropdown.classList.remove('open');
            }
        });
    }

    // 详情页：右上角编辑按钮（与下方编辑按钮同一逻辑）
    const headerEditBtn = document.getElementById('theater-header-edit-btn');
    if (headerEditBtn) {
        headerEditBtn.addEventListener('click', () => {
            if (!currentTheaterScenarioId) return;
            const scenario = getTheaterScenarios().find(s => s.id === currentTheaterScenarioId);
            if (scenario) {
                scenario.isEditing = true;
                showTheaterScenarioDetail(scenario);
            }
        });
    }

    // 详情页：按钮绑定
    const favoriteBtn = document.getElementById('theater-favorite-btn');
    const saveEditBtn = document.getElementById('theater-save-edit-btn');
    const shareBtn = document.getElementById('theater-share-btn');
    const editCategoryBtn = document.getElementById('theater-edit-category-btn');
    const deleteBtn = document.getElementById('theater-delete-btn');

    if (favoriteBtn) {
        favoriteBtn.addEventListener('click', toggleFavoriteScenario);
    }
    if (saveEditBtn) {
        saveEditBtn.addEventListener('click', saveEditScenario);
    }
    if (shareBtn) {
        shareBtn.addEventListener('click', showShareTheaterModal);
    }
    if (editCategoryBtn) {
        editCategoryBtn.addEventListener('click', editScenarioCategory);
    }
    if (deleteBtn) {
        deleteBtn.addEventListener('click', deleteCurrentScenario);
    }

    // 列表页：多选删除
    const batchDeleteBtn = document.getElementById('theater-batch-delete-btn');
    if (batchDeleteBtn) {
        batchDeleteBtn.addEventListener('click', () => {
            const scenarios = getTheaterScenarios();
            if (!scenarios || scenarios.length === 0) {
                showToast('暂无剧情可删除');
                return;
            }
            theaterMultiSelectMode = true;
            theaterSelectedIds.clear();
            updateTheaterMultiSelectBar();
            renderTheaterScenarios();
        });
    }
    const selectAllBtn = document.getElementById('theater-select-all-btn');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', theaterSelectAll);
    }
    const deleteSelectedBtn = document.getElementById('theater-delete-selected-btn');
    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener('click', theaterDeleteSelected);
    }
    const cancelMultiBtn = document.getElementById('theater-cancel-multi-btn');
    if (cancelMultiBtn) {
        cancelMultiBtn.addEventListener('click', exitTheaterMultiSelectMode);
    }

    // 分类筛选器：监听change事件（纯文字模式）
    const categoryFilter = document.getElementById('theater-category-filter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', () => {
            renderTheaterScenarios();
        });
    }

    // 分类筛选器：监听change事件（HTML 模式）
    const htmlCategoryFilter = document.getElementById('theater-html-category-filter');
    if (htmlCategoryFilter) {
        htmlCategoryFilter.addEventListener('change', () => {
            renderTheaterScenarios();
        });
    }

    // ====== 模式切换开关 ======
    const modeSwitch = document.getElementById('theater-mode-switch');
    if (modeSwitch) {
        modeSwitch.querySelectorAll('.theater-mode-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const mode = opt.dataset.mode;
                if (mode) switchTheaterMode(mode);
            });
        });
    }

    // 恢复上次保存的模式
    if (db.theaterMode && (db.theaterMode === 'html' || db.theaterMode === 'text')) {
        theaterCurrentMode = db.theaterMode;
        // 同步 UI 但不触发 toast（初始化时静默恢复）
        if (modeSwitch) {
            modeSwitch.setAttribute('data-mode', theaterCurrentMode);
            modeSwitch.querySelectorAll('.theater-mode-option').forEach(opt => {
                opt.classList.toggle('active', opt.dataset.mode === theaterCurrentMode);
            });
        }
        const textMain = document.getElementById('theater-text-main');
        const htmlMain = document.getElementById('theater-html-main');
        if (textMain) textMain.style.display = (theaterCurrentMode === 'text') ? '' : 'none';
        if (htmlMain) htmlMain.style.display = (theaterCurrentMode === 'html') ? '' : 'none';
    }

    // ====== HTML 模式详情页按钮绑定 ======
    const htmlHeaderEditBtn = document.getElementById('theater-html-header-edit-btn');
    if (htmlHeaderEditBtn) {
        htmlHeaderEditBtn.addEventListener('click', () => {
            if (!currentTheaterScenarioId) return;
            const scenario = getTheaterScenarios().find(s => s.id === currentTheaterScenarioId);
            if (scenario) {
                scenario.isEditing = true;
                showTheaterHtmlScenarioDetail(scenario);
            }
        });
    }

    const htmlFavoriteBtn = document.getElementById('theater-html-favorite-btn');
    if (htmlFavoriteBtn) {
        htmlFavoriteBtn.addEventListener('click', toggleFavoriteScenario);
    }
    const htmlSaveEditBtn = document.getElementById('theater-html-save-edit-btn');
    if (htmlSaveEditBtn) {
        htmlSaveEditBtn.addEventListener('click', saveHtmlEditScenario);
    }
    const htmlShareBtn = document.getElementById('theater-html-share-btn');
    if (htmlShareBtn) {
        htmlShareBtn.addEventListener('click', showShareTheaterModal);
    }
    const htmlEditCategoryBtn = document.getElementById('theater-html-edit-category-btn');
    if (htmlEditCategoryBtn) {
        htmlEditCategoryBtn.addEventListener('click', editScenarioCategory);
    }
    const htmlDeleteBtn = document.getElementById('theater-html-delete-btn');
    if (htmlDeleteBtn) {
        htmlDeleteBtn.addEventListener('click', deleteCurrentScenario);
    }

    // ====== 独立API设置 ======
    const theaterApiToggle = document.getElementById('theater-api-toggle');
    const theaterApiConfig = document.getElementById('theater-api-config');
    if (theaterApiToggle && theaterApiConfig) {
        // 恢复已保存的状态
        const savedTheaterApi = db.theaterApiSettings || {};
        if (savedTheaterApi.useTheaterApi) {
            theaterApiToggle.setAttribute('aria-checked', 'true');
            theaterApiConfig.style.display = '';
        }

        if (!theaterApiToggle._theaterApiBound) {
            theaterApiToggle._theaterApiBound = true;
            const toggleHandler = () => {
                const isOn = theaterApiToggle.getAttribute('aria-checked') === 'true';
                const newState = !isOn;
                theaterApiToggle.setAttribute('aria-checked', String(newState));
                theaterApiConfig.style.display = newState ? '' : 'none';
            };
            theaterApiToggle.addEventListener('click', toggleHandler);
            theaterApiToggle.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleHandler(); }
            });
        }
    }

    // 填充 API 预设下拉（读取主 API 预设 + 各副 API 预设）
    const theaterApiPresetSelect = document.getElementById('theater-api-preset-select');
    if (theaterApiPresetSelect) {
        theaterApiPresetSelect.innerHTML = '<option value="">— 选择预设配置 —</option>';
        const mainPresets = db.apiPresets || [];
        mainPresets.forEach(p => {
            const opt = document.createElement('option');
            opt.value = JSON.stringify(p.data);
            opt.textContent = p.name + '（主API预设）';
            theaterApiPresetSelect.appendChild(opt);
        });

        // 也加入副API预设
        const subKeys = [
            { key: 'summaryApiPresets', label: '总结API' },
            { key: 'backgroundApiPresets', label: '后台API' },
            { key: 'supplementPersonaApiPresets', label: '补齐人设API' }
        ];
        subKeys.forEach(({ key, label }) => {
            const presets = db[key] || [];
            presets.forEach(p => {
                const opt = document.createElement('option');
                opt.value = JSON.stringify(p.data);
                opt.textContent = p.name + `（${label}预设）`;
                theaterApiPresetSelect.appendChild(opt);
            });
        });

        theaterApiPresetSelect.addEventListener('change', () => {
            if (!theaterApiPresetSelect.value) return;
            try {
                const data = JSON.parse(theaterApiPresetSelect.value);
                const urlEl = document.getElementById('theater-api-url');
                const keyEl = document.getElementById('theater-api-key');
                const modelEl = document.getElementById('theater-api-model');
                if (urlEl && data.apiUrl !== undefined) urlEl.value = data.apiUrl || data.url || '';
                if (urlEl && data.url !== undefined && !data.apiUrl) urlEl.value = data.url || '';
                if (keyEl && data.apiKey !== undefined) keyEl.value = data.apiKey || data.key || '';
                if (keyEl && data.key !== undefined && !data.apiKey) keyEl.value = data.key || '';
                if (modelEl && (data.model)) {
                    modelEl.innerHTML = `<option value="${data.model}">${data.model}</option>`;
                    modelEl.value = data.model;
                }
                showToast('已应用预设配置');
            } catch (err) {
                console.error('应用预设失败', err);
            }
        });
    }

    // 恢复已保存的独立API字段值
    const savedTheaterApiSettings = db.theaterApiSettings || {};
    if (savedTheaterApiSettings.url) {
        const urlEl = document.getElementById('theater-api-url');
        if (urlEl) urlEl.value = savedTheaterApiSettings.url;
    }
    if (savedTheaterApiSettings.key) {
        const keyEl = document.getElementById('theater-api-key');
        if (keyEl) keyEl.value = savedTheaterApiSettings.key;
    }
    if (savedTheaterApiSettings.model) {
        const modelEl = document.getElementById('theater-api-model');
        if (modelEl) {
            modelEl.innerHTML = `<option value="${savedTheaterApiSettings.model}">${savedTheaterApiSettings.model}</option>`;
            modelEl.value = savedTheaterApiSettings.model;
        }
    }

    // 拉取模型按钮
    const theaterApiFetchBtn = document.getElementById('theater-api-fetch-models-btn');
    if (theaterApiFetchBtn) {
        theaterApiFetchBtn.addEventListener('click', async () => {
            const urlEl = document.getElementById('theater-api-url');
            const keyEl = document.getElementById('theater-api-key');
            const modelEl = document.getElementById('theater-api-model');
            if (!urlEl || !keyEl || !modelEl) return;

            let apiUrl = urlEl.value.trim();
            const apiKey = keyEl.value.trim();
            if (!apiUrl || !apiKey) {
                showToast('请先填写API地址和密钥！');
                return;
            }

            const blockedDomains = (typeof BLOCKED_API_DOMAINS !== 'undefined') ? BLOCKED_API_DOMAINS : [];
            if (blockedDomains.some(domain => apiUrl.includes(domain))) {
                showToast('该API站点已被屏蔽，无法使用！');
                return;
            }

            if (apiUrl.endsWith('/')) apiUrl = apiUrl.slice(0, -1);
            const endpoint = `${apiUrl}/v1/models`;

            theaterApiFetchBtn.disabled = true;
            const origText = theaterApiFetchBtn.textContent;
            theaterApiFetchBtn.textContent = '拉取中...';

            try {
                const resp = await fetch(endpoint, {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const json = await resp.json();
                const models = (json.data || []).map(m => m.id).filter(Boolean).sort();
                if (models.length === 0) {
                    showToast('未找到可用模型');
                    return;
                }
                const currentVal = modelEl.value;
                modelEl.innerHTML = '';
                models.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m;
                    opt.textContent = m;
                    modelEl.appendChild(opt);
                });
                if (models.includes(currentVal)) {
                    modelEl.value = currentVal;
                }
                showToast(`成功拉取 ${models.length} 个模型`);
            } catch (err) {
                console.error('拉取模型失败', err);
                showToast('拉取模型失败：' + (err.message || '未知错误'));
            } finally {
                theaterApiFetchBtn.disabled = false;
                theaterApiFetchBtn.textContent = origText;
            }
        });
    }

    // 保存独立API设置
    const theaterApiSaveBtn = document.getElementById('theater-api-save-btn');
    if (theaterApiSaveBtn) {
        theaterApiSaveBtn.addEventListener('click', async () => {
            const toggle = document.getElementById('theater-api-toggle');
            const urlEl = document.getElementById('theater-api-url');
            const keyEl = document.getElementById('theater-api-key');
            const modelEl = document.getElementById('theater-api-model');
            db.theaterApiSettings = {
                useTheaterApi: toggle ? toggle.getAttribute('aria-checked') === 'true' : false,
                url: (urlEl && urlEl.value.trim()) || '',
                key: (keyEl && keyEl.value.trim()) || '',
                model: (modelEl && modelEl.value.trim()) || ''
            };
            await saveData();
            showToast('独立API设置已保存！');
        });
    }

    // 初次渲染列表
    renderTheaterScenarios();

    // 监听屏幕切换，更新列表
    document.addEventListener('click', (e) => {
        if (e.target.closest('[data-target="theater-screen"]')) {
            setTimeout(() => {
                renderTheaterScenarios();
            }, 100);
        }
    });
}

// 自动初始化（防止主入口未显式调用时小剧场无法使用）
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (typeof setupTheaterSystem === 'function') {
                setupTheaterSystem();
            }
        });
    } else {
        if (typeof setupTheaterSystem === 'function') {
            setupTheaterSystem();
        }
    }
}
