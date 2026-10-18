function updateCharDisplay() {
    const charDisplay = document.getElementById('theater-char-display');
    const charOptions = document.getElementById('theater-char-options');
    if (!charDisplay || !charOptions) return;

    const selectedOptions = charOptions.querySelectorAll('.theater-multiselect-option.selected');
    const placeholder = charDisplay.querySelector('.theater-multiselect-placeholder');
    
    if (selectedOptions.length === 0) {
        placeholder.textContent = '请选择角色（可选）';
        charDisplay.classList.remove('has-selection');
    } else {
        const names = Array.from(selectedOptions).map(opt => {
            const label = opt.querySelector('.theater-multiselect-label');
            return label ? label.textContent : '';
        }).filter(Boolean);
        const displayText = names.length > 2 
            ? `已选 ${selectedOptions.length} 项：${names.slice(0, 2).join('、')}...`
            : `已选 ${selectedOptions.length} 项：${names.join('、')}`;
        placeholder.textContent = displayText;
        charDisplay.classList.add('has-selection');
    }
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

    // 填充角色多选下拉
    const charOptions = document.getElementById('theater-char-options');
    const charDisplay = document.getElementById('theater-char-display');
    if (charOptions && charDisplay) {
        charOptions.innerHTML = '';
        if (db.characters && db.characters.length > 0) {
            db.characters.forEach(char => {
                const option = document.createElement('div');
                option.className = 'theater-multiselect-option';
                option.dataset.id = char.id;
                option.innerHTML = `
                    <div class="theater-multiselect-checkbox">✓</div>
                    <div class="theater-multiselect-label">${DOMPurify.sanitize(char.remarkName || char.realName || '未命名角色')}</div>
                `;
                option.addEventListener('click', () => {
                    option.classList.toggle('selected');
                    updateCharDisplay();
                });
                charOptions.appendChild(option);
            });
        } else {
            charOptions.innerHTML = '<div style="padding: 12px; font-size: 13px; color: #999;">暂无角色，请先在角色模块中创建。</div>';
        }
        // 初始化显示
        updateCharDisplay();
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
                { key: 'supplementPersonaApiPresets', label: '补齐人设API' },
                { key: 'peekApiPresets', label: '偷看手机API' }
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
    const charOptions = document.getElementById('theater-char-options');
    const personaSelect = document.getElementById('theater-persona-select');
    const promptInput = document.getElementById('theater-custom-prompt');
    const categoryInput = document.getElementById('theater-category-input');
    const generateBtn = document.getElementById('theater-generate-btn');

    if (!promptInput || !generateBtn) return;

    const customPrompt = promptInput.value.trim();
    const category = (categoryInput && categoryInput.value.trim()) || '未分类';
    
    // 获取选中的多个角色ID
    let charIds = [];
    if (charOptions) {
        const selectedOptions = charOptions.querySelectorAll('.theater-multiselect-option.selected');
        charIds = Array.from(selectedOptions).map(opt => opt.dataset.id).filter(Boolean);
    }
    
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
        if (charIds.length > 0) {
            const chars = charIds.map(id => db.characters.find(c => c.id === id)).filter(Boolean);
            if (chars.length > 0) {
                const charInfoText = chars.map(char => 
                    `角色名：${char.realName || char.remarkName || '未命名角色'}\n角色人设：${char.persona || '未设定'}`
                ).join('\n\n');
                finalPrompt = `【角色信息】\n${charInfoText}\n\n【用户提示】\n${customPrompt}`;
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
        // 如果选择了多个角色，读取所有选中角色的聊天记录和日记总结
        const contextToggle = document.getElementById('theater-context-toggle');
        const contextEnabled = contextToggle && contextToggle.getAttribute('aria-checked') === 'true';
        if (contextEnabled && charIds.length > 0) {
            const chatHistoryCountInput = document.getElementById('theater-chat-history-count');
            const journalCountInput = document.getElementById('theater-journal-count');
            const chatHistoryCount = Math.max(0, Math.min(parseInt(chatHistoryCountInput?.value) || 0, 200));
            const journalCount = Math.max(0, Math.min(parseInt(journalCountInput?.value) || 0, 50));

            const userName = personaId
                ? (db.myPersonaPresets.find(p => (p.id || p.name) === personaId)?.name || '用户')
                : '用户';

            // 收集所有角色的聊天记录
            const allHistoryTexts = [];
            let totalHistoryCount = 0;

            // 收集所有角色的日记总结
            const allJournalTexts = [];
            let totalJournalCount = 0;

            // 遍历所有选中的角色
            charIds.forEach(charId => {
                const char = db.characters.find(c => c.id === charId);
                if (!char) return;

                const charName = char.realName || char.remarkName || '角色';

                // 读取该角色的聊天记录
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
                        allHistoryTexts.push(`【${charName}的聊天记录（共${recent.length}条）】\n${historyText}`);
                        totalHistoryCount += recent.length;
                    }
                }

                // 读取该角色的日记总结
                if (journalCount > 0 && Array.isArray(char.memoryJournals) && char.memoryJournals.length > 0) {
                    let journals = char.memoryJournals
                        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
                        .slice(0, journalCount);

                    if (journals.length > 0) {
                        const journalText = journals
                            .map(j => `标题：${j.title || '无标题'}\n内容：${j.content || ''}`)
                            .join('\n\n---\n\n');
                        allJournalTexts.push(`【${charName}的日记总结（共${journals.length}条）】\n${journalText}`);
                        totalJournalCount += journals.length;
                    }
                }
            });

            // 将所有角色的聊天记录合并到提示词中
            if (allHistoryTexts.length > 0) {
                const combinedHistoryText = allHistoryTexts.join('\n\n---\n\n');
                finalPrompt += `\n\n【用户与所有角色的最近聊天记录（共${totalHistoryCount}条）】\n${combinedHistoryText}`;
            }

            // 将所有角色的日记总结合并到提示词中
            if (allJournalTexts.length > 0) {
                const combinedJournalText = allJournalTexts.join('\n\n---\n\n');
                finalPrompt += `\n\n【用户与所有角色的日记总结（共${totalJournalCount}条）】\n${combinedJournalText}`;
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

            // 处理角色名占位符替换（如果有多个角色，使用第一个角色的名字）
            if (charIds.length > 0) {
                const char = db.characters.find(c => c.id === charIds[0]);
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
            
            // 替换{{char_name}}为实际的角色名称（如果有多个角色，使用第一个角色的名字）
            if (charIds.length > 0) {
                const char = db.characters.find(c => c.id === charIds[0]);
                const charName = char?.realName || char?.remarkName;
                if (charName) {
                    processedContent = processedContent.replace(/\{\{char_name\}\}/g, charName);
                }
            }

            // 默认标题为"剧情"，用户可以后续编辑
            // charId 支持向后兼容：单个角色保存为字符串，多个角色保存为数组
            let savedCharId = null;
            if (charIds.length === 1) {
                savedCharId = charIds[0]; // 单个角色保存为字符串（向后兼容）
            } else if (charIds.length > 1) {
                savedCharId = charIds; // 多个角色保存为数组
            }
            
            const scenario = {
                id: Date.now().toString(),
                title: isHtmlMode ? 'HTML 剧情' : '剧情',
                content: processedContent,
                category: category,
                charId: savedCharId,
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

// 导出小剧场
async function exportTheaterScenario() {
    if (!currentTheaterScenarioId) return;
    
    const scenario = getTheaterScenarios().find(s => s.id === currentTheaterScenarioId);
    if (!scenario) {
        showToast('找不到该剧情');
        return;
    }
    
    // 判断是HTML模式还是纯文字模式
    const isHtmlMode = scenario.mode === 'html' || /<[^>]+>/.test(scenario.content);
    
    let content = scenario.content || '';
    let filename = (scenario.title || '剧情') + (isHtmlMode ? '.html' : '.txt');
    let mimeType = isHtmlMode ? 'text/html' : 'text/plain';
    
    if (isHtmlMode) {
        // HTML模式：直接导出原始HTML内容
        // 如果内容不包含完整的HTML文档结构，则包装成完整HTML文档
        if (!content.includes('<!DOCTYPE') && !content.includes('<html')) {
            content = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${scenario.title || 'HTML 剧情'}</title>
</head>
<body>
${content}
</body>
</html>`;
        }
    } else {
        // 纯文字模式：保留原始内容（可能包含Markdown格式）
        // 如果内容中意外包含HTML标签，则移除（正常情况下纯文字模式不应该有HTML）
        if (/<[^>]+>/.test(content)) {
            content = content
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // 移除style标签
                .replace(/<[^>]+>/g, ' ') // 移除所有HTML标签
                .replace(/\s{2,}/g, ' ') // 合并多个空格
                .replace(/\n\s*\n/g, '\n\n') // 合并多个空行
                .trim();
        }
        
        // 添加标题和元信息
        let exportText = `${scenario.title || '剧情'}\n`;
        exportText += `${'='.repeat(50)}\n\n`;
        
        // 添加分类信息
        if (scenario.category && scenario.category !== '未分类') {
            exportText += `分类：${scenario.category}\n`;
        }
        
        // 添加角色信息
        if (scenario.charId) {
            const charIds = Array.isArray(scenario.charId) ? scenario.charId : [scenario.charId];
            const chars = charIds.map(id => db.characters.find(c => c.id === id)).filter(Boolean);
            if (chars.length > 0) {
                const charNames = chars.map(char => char.realName || char.remarkName || '未知角色');
                exportText += `角色：${charNames.join('、')}\n`;
            }
        }
        
        // 添加人设信息
        if (scenario.personaId) {
            const persona = db.myPersonaPresets.find(p => (p.id || p.name) === scenario.personaId);
            if (persona && persona.name) {
                exportText += `人设：${persona.name}\n`;
            }
        }
        
        // 添加创建时间
        const date = new Date(scenario.createdAt || scenario.timestamp || Date.now());
        const dateStr = date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        exportText += `创建时间：${dateStr}\n`;
        exportText += `\n${'='.repeat(50)}\n\n`;
        
        // 添加正文内容
        exportText += content;
        
        content = exportText;
    }
    
    // 创建Blob并下载
    const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
    await OvoFileDownload.save(blob, filename);

    
}

// 显示分享选择模态框
