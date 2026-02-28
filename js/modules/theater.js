// --- 小剧场功能 (js/modules/theater.js) ---

let currentTheaterScenarioId = null;
/** 列表多选：是否处于多选模式、已选中的 scenario id 集合 */
let theaterMultiSelectMode = false;
let theaterSelectedIds = new Set();

/**
 * 小剧场生成专用：兼容旧代码期望的 OpenAI ChatCompletions 返回结构。
 * 之前这里调用了未定义的 callChatCompletion，导致 “callChatCompletion is not defined”。
 * 这里复用 utils.js 的 fetchAiResponse() 发请求，然后包装成 {choices:[{message:{content}}]}。
 */
async function callChatCompletion(apiPayload) {
    const settings = (typeof db !== 'undefined' && db && db.apiSettings) ? db.apiSettings : null;
    if (!settings) throw new Error('未找到 API 设置(db.apiSettings)');

    let { url, key, model, provider } = settings;
    if (!model) model = apiPayload?.model;

    if (!url || !key || !model) {
        throw new Error('请先在“api”应用中完成设置（Base URL / Key / Model）');
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

// 渲染小剧场列表
function renderTheaterScenarios() {
    const scenariosList = document.getElementById('theater-scenarios-list');
    const categoryFilter = document.getElementById('theater-category-filter');
    if (!scenariosList) return;

    scenariosList.innerHTML = '';

    if (!db.theaterScenarios || db.theaterScenarios.length === 0) {
        scenariosList.innerHTML = '<div class="theater-empty-state">还没有生成的剧情，点击右上角"+"创建吧~</div>';
        return;
    }

    // 获取所有分类
    const categories = [...new Set(db.theaterScenarios.map(s => s.category || '未分类'))];
    if (categoryFilter) {
        categoryFilter.innerHTML = '<option value="">全部分类</option>';
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            categoryFilter.appendChild(option);
        });
    }

    // 过滤场景
    const selectedCategory = categoryFilter ? categoryFilter.value : '';
    let filteredScenarios = db.theaterScenarios;
    if (selectedCategory) {
        filteredScenarios = db.theaterScenarios.filter(s => (s.category || '未分类') === selectedCategory);
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
            <div class="theater-scenario-content">${DOMPurify.sanitize(scenario.content)}</div>
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
            showTheaterScenarioDetail(scenario);
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
    const card = document.querySelector(`#theater-scenarios-list .theater-scenario-card[data-id="${id}"]`);
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
    const categoryFilter = document.getElementById('theater-category-filter');
    const selectedCategory = categoryFilter ? categoryFilter.value : '';
    let list = db.theaterScenarios || [];
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
    db.theaterScenarios = (db.theaterScenarios || []).filter(s => !theaterSelectedIds.has(s.id));
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
    const contentDisplay = isEditing 
        ? `<textarea id="theater-edit-content" class="theater-edit-textarea">${DOMPurify.sanitize(scenario.content)}</textarea>`
        : `<div class="theater-detail-body">${renderTheaterMarkdown(scenario.content)}</div>`;
    
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
                    : `<span class="theater-detail-title-text">${DOMPurify.sanitize(scenario.title || '剧情')}</span>${!isEditing ? '<button class="theater-edit-title-btn" id="theater-edit-title-btn" style="margin-left: 10px; padding: 4px 12px; font-size: 13px; background: rgba(255, 192, 203, 0.2); border: 1px solid rgba(255, 192, 203, 0.3); border-radius: 6px; cursor: pointer; color: #666; transition: all 0.2s;">编辑标题</button>' : ''}`
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
    const editBtn = document.getElementById('theater-edit-btn');
    const saveEditBtn = document.getElementById('theater-save-edit-btn');
    const shareBtn = document.getElementById('theater-share-btn');
    const editCategoryBtn = document.getElementById('theater-edit-category-btn');
    const deleteBtn = document.getElementById('theater-delete-btn');
    
    if (favoriteBtn) {
        favoriteBtn.textContent = scenario.isFavorite ? '取消收藏' : '收藏';
    }
    if (editBtn) {
        editBtn.style.display = isEditing ? 'none' : 'block';
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
            const scenario = db.theaterScenarios.find(s => s.id === currentTheaterScenarioId);
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
                const scenario = db.theaterScenarios.find(s => s.id === currentTheaterScenarioId);
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
                const category = book.category || '未分类';
                if (!acc[category]) {
                    acc[category] = [];
                }
                acc[category].push(book);
                return acc;
            }, {});

            Object.keys(groupedBooks).forEach(category => {
                const groupHeader = document.createElement('div');
                groupHeader.textContent = category;
                groupHeader.style.fontSize = '12px';
                groupHeader.style.fontWeight = '600';
                groupHeader.style.color = '#999';
                groupHeader.style.margin = '8px 4px 4px';
                worldbookOptions.appendChild(groupHeader);

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
                    worldbookOptions.appendChild(option);
                });
            });
        } else {
            worldbookOptions.innerHTML = '<div style="padding: 12px; font-size: 13px; color: #999;">暂无世界书，请先在世界书模块中创建。</div>';
        }

        // 初始化显示
        updateWorldbookDisplay();
    }

    // 填充提示词预设
    if (promptPresetSelect) {
        promptPresetSelect.innerHTML = '<option value="">选择预设提示词</option>';
        if (db.theaterPromptPresets && db.theaterPromptPresets.length > 0) {
            db.theaterPromptPresets.forEach(preset => {
                const option = document.createElement('option');
                option.value = preset.id || preset.name;
                option.textContent = preset.name;
                promptPresetSelect.appendChild(option);
            });
        }
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

        const systemPrompt = `你是一名擅长写短篇小剧场的编剧，风格贴合当代聊天软件的剧情互动。请根据用户提供的提示词，结合可能的角色设定和世界观，生成一段完整的、小而精彩的剧情脚本。要求：
1. 剧情结构完整，有开端、发展和结尾。
2. 台词自然贴近现代网络聊天语气，可以适当加入表情或拟声词，但不要过多。
3. 若有多个角色，请用“角色名：台词”的格式区分。
4. 如果提示词中没有明确的世界观和设定，可以根据常见二次元或日常向风格自行补充，但不要偏离提示词的核心需求。
5. 尽量控制在 400-800 字以内，避免过长。
6. 直接输出剧本正文，不要输出任何开场白或说明（例如不要输出「好的，编剧。这是一段根据你提供的提示词和设定生成的聊天软件风格短剧脚本。」等句子）。`;

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
                finalPrompt += `\n\n【附加人设】\n名称：${persona.name}\n内容：${persona.content}`;
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

        const apiPayload = {
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: finalPrompt }
            ],
            model
        };

        const response = await callChatCompletion(apiPayload);
        if (response && response.choices && response.choices[0] && response.choices[0].message) {
            const content = response.choices[0].message.content.trim();

            // 替换可能的占位符角色名
            let processedContent = content;
            if (charId) {
                const char = db.characters.find(c => c.id === charId);
                const charName = char?.realName || char?.remarkName;
                if (charName) {
                    processedContent = processedContent.replace(/【角色名】|<角色名>|{{角色名}}|\[角色名\]/g, charName);
                }
            }
            // 去掉 AI 开场白，只保留剧本正文
            processedContent = stripTheaterIntro(processedContent);

            // 默认标题为"剧情"，用户可以后续编辑
            const scenario = {
                id: Date.now().toString(),
                title: '剧情',
                content: processedContent,
                category: category,
                charId: (charId && charId.trim()) ? charId : null,
                personaId: (personaId && personaId.trim()) ? personaId : null,
                worldBookIds: [], // 在此版本中简化为不单独存 worldBookIds
                customPrompt: customPrompt || null,
                createdAt: Date.now()
            };

            if (!db.theaterScenarios) {
                db.theaterScenarios = [];
            }
            db.theaterScenarios.unshift(scenario);
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

    const scenario = db.theaterScenarios.find(s => s.id === currentTheaterScenarioId);
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

    // 渲染联系人列表
    const list = document.getElementById('theater-share-list');
    const searchInput = document.getElementById('theater-share-search-input');
    const closeBtn = document.getElementById('theater-share-modal-close');

    if (!list || !searchInput || !closeBtn) return;

    const renderContacts = (keyword = '') => {
        const normalizedKeyword = keyword.trim().toLowerCase();
        list.innerHTML = '';

        const contacts = db.characters || [];
        const filtered = normalizedKeyword
            ? contacts.filter(c => 
                (c.remarkName && c.remarkName.toLowerCase().includes(normalizedKeyword)) ||
                (c.realName && c.realName.toLowerCase().includes(normalizedKeyword))
            )
            : contacts;

        if (filtered.length === 0) {
            list.innerHTML = '<div style="padding: 10px; font-size: 13px; color: #999;">没有找到匹配的联系人</div>';
            return;
        }

        filtered.forEach(char => {
            const item = document.createElement('div');
            item.className = 'theater-share-item';
            item.dataset.id = char.id;
            item.innerHTML = `
                <img src="${char.avatar || 'https://i.postimg.cc/HLXK1Z0L/chan-120.png'}" alt="${DOMPurify.sanitize(char.remarkName || char.realName || '角色')}" class="theater-share-avatar">
                <div class="theater-share-info">
                    <div class="theater-share-name">${DOMPurify.sanitize(char.remarkName || char.realName || '角色')}</div>
                    <div class="theater-share-meta">${DOMPurify.sanitize(char.persona ? (char.persona.slice(0, 20) + (char.persona.length > 20 ? '...' : '')) : '未设定人设')}</div>
                </div>
            `;
            item.addEventListener('click', () => {
                shareTheaterToContact(char.id);
                modal.classList.remove('visible');
            });
            list.appendChild(item);
        });
    };

    renderContacts();

    searchInput.oninput = (e) => {
        renderContacts(e.target.value);
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

    const scenario = db.theaterScenarios.find(s => s.id === currentTheaterScenarioId);
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

// 保存编辑后的剧情
async function saveEditScenario() {
    if (!currentTheaterScenarioId) return;

    const scenario = db.theaterScenarios.find(s => s.id === currentTheaterScenarioId);
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
    showTheaterScenarioDetail(scenario);
    renderTheaterScenarios();
}

// 删除剧情
async function deleteCurrentScenario() {
    if (!currentTheaterScenarioId) return;

    const index = db.theaterScenarios.findIndex(s => s.id === currentTheaterScenarioId);
    if (index === -1) return;

    if (!confirm('确定要删除这条剧情吗？此操作不可撤销。')) return;

    db.theaterScenarios.splice(index, 1);
    await saveData();
    
    showToast('剧情已删除');
    switchScreen('theater-screen');
    renderTheaterScenarios();
    currentTheaterScenarioId = null;
}

// 收藏/取消收藏
async function toggleFavoriteScenario() {
    if (!currentTheaterScenarioId) return;

    const scenario = db.theaterScenarios.find(s => s.id === currentTheaterScenarioId);
    if (!scenario) return;

    scenario.isFavorite = !scenario.isFavorite;
    await saveData();

    showToast(scenario.isFavorite ? '已收藏' : '已取消收藏');
    showTheaterScenarioDetail(scenario);
    renderTheaterScenarios();
}

// 修改分类
async function editScenarioCategory() {
    if (!currentTheaterScenarioId) return;

    const scenario = db.theaterScenarios.find(s => s.id === currentTheaterScenarioId);
    if (!scenario) return;

    const newCategory = prompt('请输入新的分类名称：', scenario.category || '未分类');
    if (newCategory === null) return;

    const trimmed = newCategory.trim();
    scenario.category = trimmed || '未分类';

    await saveData();
    showToast('分类已更新');
    showTheaterScenarioDetail(scenario);
    renderTheaterScenarios();
}

// 保存提示词为预设
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

    if (!db.theaterPromptPresets) {
        db.theaterPromptPresets = [];
    }

    const id = Date.now().toString();
    db.theaterPromptPresets.push({
        id,
        name,
        content
    });

    await saveData();
    showToast('已保存为提示词预设');
    populateTheaterForm();

    presetSelect.value = id;
}

// 应用提示词预设
function applyTheaterPromptPreset() {
    const presetSelect = document.getElementById('theater-prompt-preset-select');
    const promptInput = document.getElementById('theater-custom-prompt');
    if (!presetSelect || !promptInput) return;

    const presetId = presetSelect.value;
    if (!presetId || !db.theaterPromptPresets) return;

    const preset = db.theaterPromptPresets.find(p => (p.id || p.name) === presetId);
    if (!preset) return;

    promptInput.value = preset.content || '';
}

// 初始化小剧场系统
let theaterSystemInitialized = false;
function setupTheaterSystem() {
    if (theaterSystemInitialized) return;
    theaterSystemInitialized = true;
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
            const scenario = db.theaterScenarios.find(s => s.id === currentTheaterScenarioId);
            if (scenario) {
                scenario.isEditing = true;
                showTheaterScenarioDetail(scenario);
            }
        });
    }

    // 详情页：按钮绑定
    const favoriteBtn = document.getElementById('theater-favorite-btn');
    const editBtn = document.getElementById('theater-edit-btn');
    const saveEditBtn = document.getElementById('theater-save-edit-btn');
    const shareBtn = document.getElementById('theater-share-btn');
    const editCategoryBtn = document.getElementById('theater-edit-category-btn');
    const deleteBtn = document.getElementById('theater-delete-btn');

    if (favoriteBtn) {
        favoriteBtn.addEventListener('click', toggleFavoriteScenario);
    }
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            if (!currentTheaterScenarioId) return;
            const scenario = db.theaterScenarios.find(s => s.id === currentTheaterScenarioId);
            if (scenario) {
                scenario.isEditing = true;
                showTheaterScenarioDetail(scenario);
            }
        });
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
            if (!db.theaterScenarios || db.theaterScenarios.length === 0) {
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
