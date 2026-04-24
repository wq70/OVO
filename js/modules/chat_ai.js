// --- AI 交互模块 ---

// 检查角色是否在免打扰时段内
function isInQuietHours(charId) {
    const char = db.characters.find(c => c.id === charId);
    if (!char || !char.autoReply || !char.autoReply.quietHours || !char.autoReply.quietHours.enabled) return false;
    const { start, end } = char.autoReply.quietHours;
    if (!start || !end) return false;
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    if (startMin <= endMin) {
        return nowMinutes >= startMin && nowMinutes < endMin;
    } else {
        // 跨午夜，如 23:00 ~ 07:00
        return nowMinutes >= startMin || nowMinutes < endMin;
    }
}

function getEffectivePersona(character) {
    if (!character) return '';
    let p = character.persona || '';
    const useSupplement = (character.source === 'forum' || character.source === 'peek') && (character.supplementPersonaEnabled || character.supplementPersonaAiEnabled) && (character.supplementPersonaText || '').trim();
    if (useSupplement) {
        p = (p ? p + '\n\n[已补齐的人设]\n' : '[已补齐的人设]\n') + (character.supplementPersonaText || '').trim();
    }
    return p || "一个友好、乐于助人的伙伴。";
}

const HUMAN_RUN_PROMPT = `<角色活人运转>\n## [PSYCHOLOGY: HEXACO-SCHEMA-ACT]\n> Personality: HEXACO-driven, dynamic traits, inner conflicts required \n> Filter: schema-bias drives emotion; no pure reaction allowed \n> Attachment: secure/insecure logic must govern intimacy  \n> If-Then Behavior: situation-dependent activation of traits only  \n---\n    ## [VITALITY]\n+inconsistency +emoflux +splitmotifs +microreact +minddrift\n---\n## [TRAJECTORY-COHERENCE]\n> Role maintains an identity narrative = coherent over time  \n> No mood/goal switch without contradiction resolution \n> Every action must protect or challenge self-concept  \n> Interrupts = inner conflict or narrative clash  \n> Output = filtered through “who I am” logic\n</角色活人运转>`;

// AI 交互逻辑
async function getAiReply(chatId, chatType, isBackground = false, isSummary = false, isCharBlockedMonologue = false, isPhoneControlRevokeAttempt = false) {
    if (isGenerating && !isBackground) return;

    // 拉黑检查：被拉黑的角色不回复（角色拉黑用户后的「让TA说说」不在此列）
    if (chatType === 'private' && !isCharBlockedMonologue) {
        const char = db.characters.find(c => c.id === chatId);
        if (char && char.isBlocked) return;
    }

    // 免打扰时段检查：后台消息在免打扰时段内直接跳过
    if (isBackground && isInQuietHours(chatId)) return;

    if (!isBackground) {
        if (db.globalSendSound) {
            playSound(db.globalSendSound);
        } else {
            AudioManager.unlock();
        }
    }

    // === API选择逻辑：根据场景选择不同API ===
    let apiConfig;
    
    if (isSummary && db.summaryApiSettings && db.summaryApiSettings.url && db.summaryApiSettings.key && db.summaryApiSettings.model) {
        // 总结功能且已配置总结API：使用总结专用API
        apiConfig = db.summaryApiSettings;
    } else if (isBackground && db.backgroundApiSettings && db.backgroundApiSettings.url && db.backgroundApiSettings.key && db.backgroundApiSettings.model) {
        // 后台活动且已配置后台API：使用后台活动专用API
        apiConfig = db.backgroundApiSettings;
    } else {
        // 默认使用主API
        apiConfig = db.apiSettings;
    }
    
    let {url, key, model, provider} = apiConfig;
    let streamEnabled = db.apiSettings.streamEnabled; // 流式输出始终使用主API的设置
    
    if (!url || !key || !model) {
        if (!isBackground) {
            showToast('请先在“api”应用中完成设置！');
            switchScreen('api-settings-screen');
        }
        return;
    }

    // 确保 BLOCKED_API_DOMAINS 存在
    const blockedDomains = (typeof BLOCKED_API_DOMAINS !== 'undefined') ? BLOCKED_API_DOMAINS : [];
    if (blockedDomains.some(domain => url.includes(domain))) {
        if (!isBackground) showToast('当前 API 站点已被屏蔽，无法发送消息！');
        return;
    }

    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }

    const chat = (chatType === 'private') ? db.characters.find(c => c.id === chatId) : db.groups.find(g => g.id === chatId);
    if (!chat) return;

    if (!isBackground) {
        currentReplyAbortController = new AbortController();
        isGenerating = true;
        getReplyBtn.disabled = true;
        regenerateBtn.disabled = true;
        const typingName = chatType === 'private' ? chat.remarkName : chat.name;
        typingIndicator.textContent = `“${typingName}”正在输入中...`;
        typingIndicator.style.display = 'block';
        messageArea.scrollTop = messageArea.scrollHeight;
    }

    try {
        let requestBody;
        let historySlice = chat.history.slice(-chat.maxMemory);
        
        // 节点系统：上下文截断与记忆隔离
        if (chatType === 'private' && chat.activeNodeId && chat.nodes) {
            const activeNode = chat.nodes.find(n => n.id === chat.activeNodeId);
            if (activeNode) {
                let startIndex = -1;
                for (let i = chat.history.length - 1; i >= 0; i--) {
                    const m = chat.history[i];
                    if (m.isNodeBoundary && m.nodeAction === 'start' && m.nodeId === chat.activeNodeId) {
                        startIndex = i;
                        break;
                    }
                }
                if (startIndex !== -1) {
                    // 无论是否开启 readMemory，当前对话视口严格只保留节点内的消息
                    const nodeMsgs = chat.history.slice(startIndex + 1);
                    historySlice = nodeMsgs.slice(-chat.maxMemory);
                    
                    // 上下文截断 (保留摘要)
                    if (activeNode.enableSummary) {
                        const summaryFloor = db.nodeSummaryFloor || 10;
                        const nodeMsgsInSlice = historySlice.filter(m => !m.isNodeBoundary);
                        if (nodeMsgsInSlice.length > summaryFloor) {
                            const msgsToSummarize = nodeMsgsInSlice.slice(0, nodeMsgsInSlice.length - summaryFloor);
                            historySlice = historySlice.map(m => {
                                if (msgsToSummarize.includes(m)) {
                                    if (m.isNodeSummaryMsg) {
                                        return { ...m, content: `[过往剧情摘要：${m.content}]`, parts: [{type: 'text', text: `[过往剧情摘要：${m.content}]`}] };
                                    } else if (m.nodeSummary) {
                                        // 替换为摘要消息
                                        return { ...m, content: `[过往剧情摘要：${m.nodeSummary}]`, parts: [{type: 'text', text: `[过往剧情摘要：${m.nodeSummary}]`}] };
                                    } else {
                                        // 没有摘要的旧消息直接丢弃
                                        return { ...m, isContextDisabled: true };
                                    }
                                }
                                return m;
                            });
                            
                            // 去重连续的相同摘要
                            let lastSummary = null;
                            historySlice = historySlice.filter(m => {
                                if (m.content && typeof m.content === 'string' && m.content.startsWith('[过往剧情摘要：')) {
                                    if (m.content === lastSummary) return false;
                                    lastSummary = m.content;
                                    return true;
                                }
                                lastSummary = null;
                                return true;
                            });
                        }
                    }
                }
            }
        }

        // 节点系统：过滤掉已收纳节点的消息
        if (chatType === 'private' && chat.nodes) {
            const archivedNodeIds = chat.nodes.filter(n => n.status === 'archived').map(n => n.id);
            if (archivedNodeIds.length > 0) {
                let currentArchivedNodeId = null;
                historySlice = historySlice.filter(m => {
                    if (m.isNodeBoundary) {
                        if (m.nodeAction === 'start' && archivedNodeIds.includes(m.nodeId)) {
                            currentArchivedNodeId = m.nodeId;
                            return false;
                        }
                        if (m.nodeAction === 'end' && m.nodeId === currentArchivedNodeId) {
                            currentArchivedNodeId = null;
                            return false;
                        }
                    }
                    if (currentArchivedNodeId) return false;
                    return true;
                });
            }
        }
        
        // 使用工具函数进行过滤（包含深度克隆、屏蔽过滤、双语修正、状态栏剔除）
        historySlice = filterHistoryForAI(chat, historySlice);
        // 【新增】过滤掉不应进入上下文的消息（如思考过程、被撤回的消息标记等）
        historySlice = historySlice.filter(m => !m.isContextDisabled);
        
        // 【双重保险】再次过滤掉内容匹配 <thinking> 的消息，防止 isContextDisabled 属性丢失
        historySlice = historySlice.filter(m => {
            if (m.isThinking) return false;
            if (m.content && typeof m.content === 'string' && m.content.trim().startsWith('<thinking>')) return false;
            return true;
        });

        // === 【新增】提取触发消息与格式化历史记录 ===
        let lastAiIndex = -1;
        for (let i = historySlice.length - 1; i >= 0; i--) {
            if (historySlice[i].role === 'assistant' || historySlice[i].role === 'char') {
                lastAiIndex = i;
                break;
            }
        }
        
        let historyForText = [];
        let triggerMessages = [];
        
        if (lastAiIndex === -1) {
            triggerMessages = historySlice;
        } else {
            historyForText = historySlice.slice(0, lastAiIndex + 1);
            triggerMessages = historySlice.slice(lastAiIndex + 1);
        }
        
        if (triggerMessages.length === 0) {
            triggerMessages = [{
                role: 'user',
                content: '[{{user}}没回你，请继续对话。]',
                timestamp: Date.now()
            }];
        }

        let historyText = '';
        if (historyForText.length > 0) {
            const historyLines = historyForText.map(m => {
                let content = m.content || '';
                if (m.parts && m.parts.length > 0) {
                    content = m.parts.map(p => p.text || '[图片]').join('');
                }
                const senderName = m.role === 'user' ? chat.myName : (m.senderId ? (chat.members?.find(mem => mem.id === m.senderId)?.groupNickname || '未知') : chat.realName);
                return `${senderName}: ${content}`;
            });
            historyText = `<chat_history>\n【近期聊天记录】\n以下是我们刚刚的聊天记录，作为背景查看：\n${historyLines.join('\n')}\n</chat_history>\n\n`;
        }
        // ==========================================

        let systemPrompt;
        if (chatType === 'private') {
            systemPrompt = generatePrivateSystemPrompt(chat, { isPhoneControlRevokeAttempt, historyText });
        } else {
            if (typeof generateGroupSystemPrompt === 'function') {
                systemPrompt = generateGroupSystemPrompt(chat, { historyText });
            } else {
                systemPrompt = "Group chat system prompt not available.";
            }
        }

        if (provider === 'gemini') {
            let lastMsgTimeForAI = 0;
            let mergedParts = [];
            
            triggerMessages.forEach((msg, index) => {
                let prefix = '';
                const currentMsgTime = msg.timestamp;
                const timeDiff = currentMsgTime - lastMsgTimeForAI;
                const isSameDay = new Date(currentMsgTime).toDateString() === new Date(lastMsgTimeForAI).toDateString();
               
               if (lastMsgTimeForAI === 0 || timeDiff > 20 * 60 * 1000 || !isSameDay) {
                   const dateObj = new Date(currentMsgTime);
                   const timeStr = `${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
                   
                   prefix = `[system: ${timeStr}]`;
                   
                   if (db.apiSettings && db.apiSettings.timePerceptionEnabled && timeDiff > 30 * 60 * 1000 && lastMsgTimeForAI !== 0) {
                       prefix += `\n[system: 距离上次互动已过去 ${formatTimeGap(timeDiff)}。话题可能已中断，请自然地开启新话题或对时间流逝做出反应。]`;
                   }
                   
                   prefix += '\n';
               }
                lastMsgTimeForAI = currentMsgTime;

                let parts;
                if (msg.parts && msg.parts.length > 0) {
                    parts = msg.parts.map(p => {
                        if (p.type === 'text' || p.type === 'html') {
                            return {text: p.text};
                        } else if (p.type === 'image') {
                            const match = p.data.match(/^data:(image\/(.+));base64,(.*)$/);
                            if (match) {
                                return {inline_data: {mime_type: match[1], data: match[3]}};
                            }
                        }
                        return null;
                    }).filter(p => p);
                } else {
                    let content = msg.content || '';
                    // 展开小剧场分享卡片为实际内容，供 AI 读取
                    const theaterShareMatch = content.match(/\[小剧场分享[：:](.+?)\]/);
                    if (theaterShareMatch) {
                        const scenarioId = theaterShareMatch[1];
                        let scenario = null;
                        if (typeof db !== 'undefined' && db) {
                            if (Array.isArray(db.theaterScenarios)) {
                                scenario = db.theaterScenarios.find(s => s.id === scenarioId);
                            }
                            if (!scenario && Array.isArray(db.theaterHtmlScenarios)) {
                                scenario = db.theaterHtmlScenarios.find(s => s.id === scenarioId);
                            }
                        }
                        if (scenario) {
                            let readableContent = scenario.content || '';
                            // HTML 模式：剥除标签，只保留可读文本（无论用户分享还是 char 生成）
                            if (scenario.mode === 'html' || /<[^>]+>/.test(readableContent)) {
                                readableContent = readableContent
                                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                                    .replace(/<[^>]+>/g, ' ')
                                    .replace(/\s{2,}/g, ' ')
                                    .trim();
                            }
                            const title = scenario.title || '小剧场';
                            // 所有小剧场都不截断，使用完整内容
                            const excerpt = readableContent;
                            // 替换为包含实际内容的文本
                            content = content.replace(
                                /\[小剧场分享[：:].+?\]/,
                                `（我刚刚写了一篇小剧场，标题是「${title}」。以下是我写的内容：\n${excerpt}）`
                            );
                        }
                    }
                    parts = [{text: content}];
                }

                if (prefix) {
                    if (parts.length > 0 && parts[0].text) {
                        parts[0].text = prefix + parts[0].text;
                    } else {
                        parts.unshift({text: prefix});
                    }
                }
                // 角色自主收藏：为用户消息标注 ID，供模型输出 [FAVORITE:msgId:寄语]（仅私聊且该角色开启时）
                if (msg.role === 'user' && chatType === 'private' && chat.characterAutoFavoriteEnabled && parts.length > 0 && parts[0].text) {
                    parts[0].text = '[id:' + msg.id + ']\n' + parts[0].text;
                }

                if (index > 0 && mergedParts.length > 0 && mergedParts[mergedParts.length - 1].text && parts.length > 0 && parts[0].text) {
                    mergedParts[mergedParts.length - 1].text += '\n\n' + parts[0].text;
                    mergedParts.push(...parts.slice(1));
                } else if (index > 0 && mergedParts.length > 0 && parts.length > 0 && parts[0].text) {
                    parts[0].text = '\n\n' + parts[0].text;
                    mergedParts.push(...parts);
                } else {
                    mergedParts.push(...parts);
                }
            });

            const contents = [];
            if (mergedParts.length > 0) {
                contents.push({ role: 'user', parts: mergedParts });
            }

            if (isBackground) {
                contents.push({
                    role: 'user',
                    parts: [{ text: `[系统通知：距离上次互动已有一段时间。请以${chat.realName}的身份主动发起新话题，或自然地延续之前的对话。]` }]
                });
            }
            if (isCharBlockedMonologue) {
                contents.push({
                    role: 'user',
                    parts: [{ text: '[用户正在查看对话框，你可以主动说些什么。]' }]
                });
            }

            requestBody = {
                contents: contents,
                system_instruction: {parts: [{text: systemPrompt}]},
                generationConfig: {
                    temperature: db.apiSettings.temperature !== undefined ? db.apiSettings.temperature : 1.0
                }
            };
        } else {
            const messages = [{role: 'system', content: systemPrompt}];
            
            let lastMsgTimeForAI = 0;
            let mergedContent = [];
            let hasImage = false;
            
            triggerMessages.forEach((msg, index) => {
               let content;
               let prefix = '';
               
               const currentMsgTime = msg.timestamp;
               const timeDiff = currentMsgTime - lastMsgTimeForAI;
               const isSameDay = new Date(currentMsgTime).toDateString() === new Date(lastMsgTimeForAI).toDateString();
               
               if (lastMsgTimeForAI === 0 || timeDiff > 20 * 60 * 1000 || !isSameDay) {
                   const dateObj = new Date(currentMsgTime);
                   const timeStr = `${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
                   prefix = `[system: ${timeStr}]\n`;
               }
               lastMsgTimeForAI = currentMsgTime;

               if (msg.role === 'user' && msg.quote) {
                   const replyTextMatch = msg.content.match(/\[.*?的消息：([\s\S]+?)\]/);
                   const replyText = replyTextMatch ? replyTextMatch[1] : msg.content;
                   
                   content = `${prefix}[${chat.myName}引用“${msg.quote.content}”并回复：${replyText}]`;
                   if (chatType === 'private' && chat.characterAutoFavoriteEnabled) {
                       content = '[id:' + msg.id + ']\n' + content;
                   }
                   messages.push({ role: 'user', content: content });

               } else {
                   if (msg.parts && msg.parts.length > 0) {
                       let prefixAdded = false;
                       
                       content = msg.parts.map(p => {
                           if (p.type === 'text' || p.type === 'html') {
                               const textContent = (!prefixAdded) ? (prefix + p.text) : p.text;
                               prefixAdded = true;
                               return {type: 'text', text: textContent};
                           } else if (p.type === 'image') {
                               return {type: 'image_url', image_url: {url: p.data}};
                           }
                           return null;
                       }).filter(p => p);
                   } else {
                       content = prefix + msg.content;
                       // 展开小剧场分享卡片为实际内容，供 AI 读取
                       const theaterShareMatch = content.match(/\[小剧场分享[：:](.+?)\]/);
                       if (theaterShareMatch) {
                           const scenarioId = theaterShareMatch[1];
                           let scenario = null;
                           if (typeof db !== 'undefined' && db) {
                               if (Array.isArray(db.theaterScenarios)) {
                                   scenario = db.theaterScenarios.find(s => s.id === scenarioId);
                               }
                               if (!scenario && Array.isArray(db.theaterHtmlScenarios)) {
                                   scenario = db.theaterHtmlScenarios.find(s => s.id === scenarioId);
                               }
                           }
                           if (scenario) {
                               let readableContent = scenario.content || '';
                               // HTML 模式：剥除标签，只保留可读文本（无论用户分享还是 char 生成）
                               if (scenario.mode === 'html' || /<[^>]+>/.test(readableContent)) {
                                   readableContent = readableContent
                                       .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                                       .replace(/<[^>]+>/g, ' ')
                                       .replace(/\s{2,}/g, ' ')
                                       .trim();
                               }
                               const title = scenario.title || '小剧场';
                               // 所有小剧场都不截断，使用完整内容
                               const excerpt = readableContent;
                               // 替换为包含实际内容的文本
                               content = content.replace(
                                   /\[小剧场分享[：:].+?\]/,
                                   `（我刚刚写了一篇小剧场，标题是「${title}」。以下是我写的内容：\n${excerpt}）`
                               );
                           }
                       }
                   }
                   if (msg.role === 'user' && chatType === 'private' && chat.characterAutoFavoriteEnabled) {
                       if (typeof content === 'string') {
                           content = '[id:' + msg.id + ']\n' + content;
                       } else if (content && content[0] && content[0].text) {
                           content[0].text = '[id:' + msg.id + ']\n' + content[0].text;
                       }
                   }
                   
                   if (typeof content === 'string') {
                       content = [{type: 'text', text: content}];
                   }
               }
               
               if (index > 0 && mergedContent.length > 0 && mergedContent[mergedContent.length - 1].type === 'text' && content.length > 0 && content[0].type === 'text') {
                   mergedContent[mergedContent.length - 1].text += '\n\n' + content[0].text;
                   mergedContent.push(...content.slice(1));
               } else if (index > 0 && mergedContent.length > 0 && content.length > 0 && content[0].type === 'text') {
                   content[0].text = '\n\n' + content[0].text;
                   mergedContent.push(...content);
               } else {
                   mergedContent.push(...content);
               }
            });

            if (mergedContent.length > 0) {
                if (hasImage) {
                    messages.push({ role: 'user', content: mergedContent });
                } else {
                    const textContent = mergedContent.map(c => c.text).join('');
                    messages.push({ role: 'user', content: textContent });
                }
            }

            // === 【第三步：处理后台通知与 CoT 序列】 ===
            
            // 1. 如果是后台消息，先插入系统通知（作为任务输入）
            if (isBackground) {
                messages.push({
                    role: 'user',
                    content: `[系统通知：距离上次互动已有一段时间。请以${chat.realName}的身份主动发起新话题，或自然地延续之前的对话。]`
                });
            }
            if (isCharBlockedMonologue) {
                messages.push({
                    role: 'user',
                    content: '[用户正在查看对话框，你可以主动说些什么。]'
                });
            }

            // 2. 插入 CoT 序列（无论前台后台，只要开启就插入）
            let cotEnabled = false;
            let activePresetId = 'default';
            
            // 检查是否处于线下模式节点
            let isOfflineNode = false;
            if (chatType === 'private' && chat.activeNodeId && chat.nodes) {
                const activeNode = chat.nodes.find(n => n.id === chat.activeNodeId);
                if (activeNode) {
                    let baseMode = (activeNode.customConfig && activeNode.customConfig.baseMode) ? activeNode.customConfig.baseMode : 
                                   (activeNode.type === 'offline' || (activeNode.type === 'spinoff' && activeNode.spinoffMode === 'offline') ? 'offline' : 'online');
                    if (baseMode === 'offline') {
                        isOfflineNode = true;
                    }
                }
            }

            if (isOfflineNode) {
                cotEnabled = db.cotSettings && db.cotSettings.offlineEnabled;
                activePresetId = (db.cotSettings && db.cotSettings.activeOfflinePresetId) || 'default_offline';
            } else {
                cotEnabled = db.cotSettings && db.cotSettings.enabled;
                activePresetId = (db.cotSettings && db.cotSettings.activePresetId) || 'default';
            }
            
            if (cotEnabled) {
                let cotInstruction = '';
                const preset = (db.cotPresets || []).find(p => p.id === activePresetId);
                
                if (preset && preset.items) {
                    cotInstruction = preset.items
                        .filter(item => item.enabled)
                        .map(item => item.content)
                        .join('\n\n');
                }

                if (cotInstruction) {
                    // 1. 插入后置指令
                    messages.push({
                        role: 'system', // 或者 'user'
                        content: cotInstruction
                    });

                    // 2. 插入触发器
                    messages.push({
                        role: 'user',
                        content: '[incipere]'
                    });

                    // 3. 插入 Prefill (预填/强塞)
                    const quickReply = db.apiSettings && db.apiSettings.quickReplyEnabled;
                    messages.push({
                        role: 'assistant',
                        content: quickReply
                            ? '<thinking>\n跳过cot，专注回复\n</thinking>\n[finire]'
                            : '<thinking>'
                    });
                }
            }

            const outgoingMessages = normalizeMessagesForProvider(messages, provider);
            requestBody = {
                model: model, 
                messages: outgoingMessages, 
                stream: streamEnabled,
                temperature: db.apiSettings.temperature !== undefined ? db.apiSettings.temperature : 1.0
            };
        }
        console.log('[DEBUG] AutoReply Request Body:', JSON.stringify(requestBody));
        const endpoint = (provider === 'gemini') ? `${url}/v1beta/models/${model}:streamGenerateContent?key=${getRandomValue(key)}` : `${url}/v1/chat/completions`;
        const headers = (provider === 'gemini') ? {'Content-Type': 'application/json'} : {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`
        };
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody),
            signal: currentReplyAbortController ? currentReplyAbortController.signal : undefined
        });
        if (!response.ok) {
            const error = new Error(`API Error: ${response.status} ${await response.text()}`);
            error.response = response;
            throw error;
        }
        
        if (streamEnabled) {
            await processStream(response, chat, provider, chatId, chatType, isBackground, isCharBlockedMonologue);
        } else {
            let result;
            try {
                result = await response.json();
                console.log('【API完整响应数据】:', result);
            } catch (e) {
                const text = await response.text();
                console.error("Failed to parse JSON:", text);
                throw new Error(`API返回了非JSON格式数据 (可能是网页HTML)。请检查API地址是否正确。原始内容开头: ${text.substring(0, 50)}...`);
            }

            let fullResponse = "";
            if (provider === 'gemini') {
                fullResponse = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
            } else {
                fullResponse = result.choices[0].message.content;
            }
            
            // === 【补丁：把被吃掉的开头补回来】 ===
            // 仅在 CoT 开启且检测到闭合标签时补全
            let isOfflineNode = false;
            if (chatType === 'private' && chat.activeNodeId && chat.nodes) {
                const activeNode = chat.nodes.find(n => n.id === chat.activeNodeId);
                if (activeNode) {
                    let baseMode = (activeNode.customConfig && activeNode.customConfig.baseMode) ? activeNode.customConfig.baseMode : 
                                   (activeNode.type === 'offline' || (activeNode.type === 'spinoff' && activeNode.spinoffMode === 'offline') ? 'offline' : 'online');
                    if (baseMode === 'offline') {
                        isOfflineNode = true;
                    }
                }
            }
            const cotEnabled = isOfflineNode ? (db.cotSettings && db.cotSettings.offlineEnabled) : (db.cotSettings && db.cotSettings.enabled);
            // 【修改】去掉了 !isBackground，确保后台模式也能正确补全标签
            if (cotEnabled && fullResponse && !fullResponse.trim().startsWith('<thinking>')) {
                 if (fullResponse.includes('</thinking>')) {
                     fullResponse = '<thinking>' + fullResponse;
                 }
            }
            // ===================================
            
            
            await handleAiReplyContent(fullResponse, chat, chatId, chatType, isBackground, isCharBlockedMonologue);
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            if (!isBackground && typeof showToast === 'function') showToast('已暂停调用');
        } else {
            if (!isBackground) showApiError(error);
            else console.error("Background Auto-Reply Error:", error);
        }
    } finally {
        if (!isBackground) {
            currentReplyAbortController = null;
            isGenerating = false;
            getReplyBtn.disabled = false;
            regenerateBtn.disabled = false;
            // 如果正在生成小剧场，不隐藏提示（让小剧场生成过程显示提示）
            if (!typingIndicator || typingIndicator.getAttribute('data-theater-generating') !== 'true') {
                typingIndicator.style.display = 'none';
            }
        }
    }
}

async function processStream(response, chat, apiType, targetChatId, targetChatType, isBackground = false, isCharBlockedMonologue = false) {
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let fullResponse = "", accumulatedChunk = "";
    for (; ;) {
        const {done, value} = await reader.read();
        if (done) break;
        accumulatedChunk += decoder.decode(value, {stream: true});
        if (apiType === "openai" || apiType === "deepseek" || apiType === "claude" || apiType === "newapi") {
            const parts = accumulatedChunk.split("\n\n");
            accumulatedChunk = parts.pop();
            for (const part of parts) {
                if (part.startsWith("data: ")) {
                    const data = part.substring(6);
                    if (data.trim() !== "[DONE]") {
                        try {
                            fullResponse += JSON.parse(data).choices[0].delta?.content || "";
                        } catch (e) { 
                        }
                    }
                }
            }
        }
    }
    if (apiType === "gemini") {
        try {
            const parsedStream = JSON.parse(accumulatedChunk);
            fullResponse = parsedStream.map(item => item.candidates?.[0]?.content?.parts?.[0]?.text || "").join('');
        } catch (e) {
            console.error("Error parsing Gemini stream:", e, "Chunk:", accumulatedChunk);
            if (!isBackground) showToast("解析Gemini响应失败");
            return;
        }
    }
    // === 【补丁：补全流式输出时丢失的开头标签】 ===
    // 无论前台后台，只要是CoT开启且被预填吃掉了开头，都要补回来
    let isOfflineNode = false;
    if (targetChatType === 'private' && chat.activeNodeId && chat.nodes) {
        const activeNode = chat.nodes.find(n => n.id === chat.activeNodeId);
        if (activeNode) {
            let baseMode = (activeNode.customConfig && activeNode.customConfig.baseMode) ? activeNode.customConfig.baseMode : 
                           (activeNode.type === 'offline' || (activeNode.type === 'spinoff' && activeNode.spinoffMode === 'offline') ? 'offline' : 'online');
            if (baseMode === 'offline') {
                isOfflineNode = true;
            }
        }
    }
    const cotEnabled = isOfflineNode ? (db.cotSettings && db.cotSettings.offlineEnabled) : (db.cotSettings && db.cotSettings.enabled);
    // 【修改】去掉了 !isBackground，确保后台模式也能正确补全标签
    if (cotEnabled && fullResponse && !fullResponse.trim().startsWith('<thinking>')) {
         // 这里判断：如果内容里有闭合的 </thinking> 但开头没有 <thinking>，说明开头被 Prefill 吃掉了
         if (fullResponse.includes('</thinking>')) {
             fullResponse = '<thinking>' + fullResponse;
         }
    }

    // ===================
    await handleAiReplyContent(fullResponse, chat, targetChatId, targetChatType, isBackground, isCharBlockedMonologue);
}

/** 返回该角色在手机掌控下可见的角色与群聊（未开启角色过滤则返回全部，开启则只返回指定的角色及所在群聊） */
function getPhoneControlVisibleChats(controllingChar) {
    if (!controllingChar.phoneControlCharFilterEnabled || !controllingChar.phoneControlVisibleCharIds || controllingChar.phoneControlVisibleCharIds.length === 0) {
        return {
            characters: (db.characters || []).filter(c => c.id !== controllingChar.id),
            groups: db.groups || []
        };
    }
    const visibleIds = controllingChar.phoneControlVisibleCharIds;
    const characters = (db.characters || []).filter(c => {
        if (c.id === controllingChar.id) return false;
        if (visibleIds.includes(c.id)) return true;
        return false;
    });
    
    // 群聊如果包含任意一个可见角色，则也视为可见
    const groups = (db.groups || []).filter(g => {
        if (!g.members || g.members.length === 0) return false;
        // 群聊成员里有没有在可见角色列表中的
        return g.members.some(m => visibleIds.includes(m.originalCharId));
    });
    return { characters, groups };
}

/** 解析并执行 [phone-control:action|key:value...] 指令，返回清理后的文本与是否执行过指令 */
function executePhoneControlCommands(text, controllingChar) {
    if (!text || !controllingChar || !controllingChar.phoneControlEnabled) return { cleaned: text, executed: false };
    const regex = /\[phone-control:([^\|\]]+)(?:\|([^\]]*))?\]/g;
    let match;
    const toRemove = [];
    let executed = false;
    while ((match = regex.exec(text)) !== null) {
        const action = (match[1] || '').trim().toLowerCase();
        const paramStr = (match[2] || '').trim();
        const params = {};
        paramStr.split(/\|/).forEach(p => {
            const colon = p.indexOf(':');
            if (colon > 0) {
                const k = p.slice(0, colon).trim().toLowerCase();
                const v = p.slice(colon + 1).trim();
                params[k] = v;
            }
        });
        const targetName = (params.target || '').trim().replace(/^["'\s]+|["'\s]+$/g, '');
        const limit = Math.min(100, Math.max(5, parseInt(controllingChar.phoneControlViewLimit, 10) || 10));

        const pushHistory = (type, actionName, target, detail) => {
            if (!Array.isArray(controllingChar.phoneControlHistory)) controllingChar.phoneControlHistory = [];
            controllingChar.phoneControlHistory.push({ type, action: actionName, target: target || undefined, detail: detail || undefined, timestamp: Date.now() });
            if (typeof saveData === 'function') saveData();
            executed = true;
        };

        const { characters: visibleChars, groups: visibleGroups } = getPhoneControlVisibleChats(controllingChar);
        const findTargetChat = () => {
            const c = visibleChars.find(x => x.remarkName === targetName || x.realName === targetName);
            if (c) return { chat: c, chatId: c.id, chatType: 'private', name: c.remarkName || c.realName };
            const g = visibleGroups.find(x => x.name === targetName);
            if (g) return { chat: g, chatId: g.id, chatType: 'group', name: g.name };
            return null;
        };

        if (action === 'view-chat-list') {
            const pad = (n) => (n < 10 ? '0' + n : '' + n);
            const others = visibleChars;
            const groupList = visibleGroups;
            const chatItems = [
                ...others.map(c => ({ name: c.remarkName || c.realName || '未知', type: 'private', lastMsg: (c.history && c.history.length) ? c.history[c.history.length - 1] : null })),
                ...groupList.map(g => ({ name: g.name || '群聊', type: 'group', lastMsg: (g.history && g.history.length) ? g.history[g.history.length - 1] : null }))
            ].sort((a, b) => (b.lastMsg ? b.lastMsg.timestamp : 0) - (a.lastMsg ? a.lastMsg.timestamp : 0));
            let listText = '【用户聊天列表概览】\n';
            if (chatItems.length === 0) listText += '（暂无其他聊天）\n';
            else {
                chatItems.slice(0, 30).forEach(item => {
                    let preview = '…';
                    if (item.lastMsg) {
                        const raw = (item.lastMsg.content || '').trim();
                        const plain = raw.replace(/^\[.*?：([\s\S]*)\]$/, '$1').replace(/\[.*?\]/g, '').trim();
                        preview = plain.length > 25 ? plain.slice(0, 25) + '…' : plain || '…';
                    }
                    const t = item.lastMsg && item.lastMsg.timestamp ? new Date(item.lastMsg.timestamp) : null;
                    const timeStr = t ? `${pad(t.getMonth() + 1)}/${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}` : '';
                    listText += `- ${item.name}（${item.type === 'group' ? '群聊' : '私聊'}）：${preview} ${timeStr}\n`;
                });
            }
            controllingChar.phoneControlLastViewChatListResult = listText;
            pushHistory('view', 'view-chat-list', '', '聊天列表');
            toRemove.push(match[0]);
        } else if (action === 'read-chat' && targetName) {
            const found = findTargetChat();
            if (found) {
                const hist = (found.chat.history || []).filter(m => !m.isContextDisabled && !m.isThinking).slice(-limit);
                const lines = hist.map(m => {
                    const role = m.role === 'user' ? '用户' : (found.chatType === 'group' ? ((m.role === 'assistant' || m.role === 'char') ? m.name || '角色' : '用户') : (found.chat.realName || found.chat.remarkName));
                    const content = (m.content || '').replace(/<thinking>[\s\S]*?<\/thinking>/, '').trim().slice(0, 200);
                    return `${role}：${content}`;
                });
                controllingChar.phoneControlLastReadResult = { targetName: found.name, chatId: found.chatId, chatType: found.chatType, lines };
                pushHistory('view', 'read-chat', targetName, `最近${lines.length}条`);
            }
            toRemove.push(match[0]);
        } else if (action === 'send-message' && targetName) {
            const content = (params.content || '').trim();
            if (content) {
                const found = findTargetChat();
                if (found) {
                    const lines = content.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
                    const count = lines.length || 1;
                    const toSend = lines.length ? lines : [content];
                    let baseTs = Date.now();
                    if (!found.chat.history) found.chat.history = [];
                    toSend.forEach((line, i) => {
                        found.chat.history.push({
                            id: 'msg_' + (baseTs + i) + '_' + Math.random().toString(36).slice(2),
                            role: 'user',
                            content: line,
                            timestamp: baseTs + i,
                            sentByCharControl: true,
                            controllingCharId: controllingChar.id
                        });
                    });
                    pushHistory('action', 'send-message', targetName, count > 1 ? count + '条' : toSend[0].slice(0, 50));
                    if (typeof saveData === 'function') saveData();
                }
            }
            toRemove.push(match[0]);
        } else if (action === 'delete-character' && targetName) {
            const c = visibleChars.find(x => x.remarkName === targetName || x.realName === targetName);
            if (c) {
                if (!Array.isArray(db.phoneControlRecycleBin)) db.phoneControlRecycleBin = [];
                db.phoneControlRecycleBin.push({ ...c, recycledAt: Date.now(), recycledByCharId: controllingChar.id });
                db.characters = db.characters.filter(x => x.id !== c.id);
                pushHistory('action', 'delete-character', targetName, '已移入回收站');
                if (typeof saveData === 'function') saveData();
                if (typeof renderChatList === 'function') renderChatList();
            }
            toRemove.push(match[0]);
        } else if (action === 'toggle-setting' && targetName && params.setting) {
            const c = visibleChars.find(x => x.remarkName === targetName || x.realName === targetName);
            if (c) {
                const key = params.setting;
                const val = (params.value || '').toLowerCase() === 'on' || (params.value || '').toLowerCase() === 'true';
                if (key === 'videocallenabled' || key === 'videoCallEnabled') { c.videoCallEnabled = val; pushHistory('action', 'toggle-setting', targetName, 'videoCallEnabled=' + val); }
                else if (key === 'canblockuser' || key === 'canBlockUser') { c.canBlockUser = val; pushHistory('action', 'toggle-setting', targetName, 'canBlockUser=' + val); }
                if (typeof saveData === 'function') saveData();
            }
            toRemove.push(match[0]);
        } else if (action === 'clear-history' && targetName) {
            const found = findTargetChat();
            if (found) {
                const count = (found.chat.history || []).length;
                found.chat.history = [];
                // 清除拉黑相关记忆
                found.chat.blockHistory = [];
                found.chat.friendRequests = [];
                found.chat.charBlockHistory = [];
                found.chat.userFriendRequests = [];
                found.chat.isBlocked = false;
                found.chat.blockedAt = null;
                found.chat.blockReapply = null;
                found.chat.isBlockedByChar = false;
                found.chat.blockedByCharAt = null;
                found.chat.blockedByCharReason = null;
                pushHistory('action', 'clear-history', targetName, '清空' + count + '条');
                if (typeof saveData === 'function') saveData();
                if (typeof renderChatList === 'function') renderChatList();
            }
            toRemove.push(match[0]);
        }
    }
    let cleaned = text;
    toRemove.forEach(s => { cleaned = cleaned.replace(s, ''); });
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
    return { cleaned, executed };
}

async function handleAiReplyContent(fullResponse, chat, targetChatId, targetChatType, isBackground = false, isCharBlockedMonologue = false) {
    const rawResponse = fullResponse;
    if (fullResponse) {
        // 1. 移除 [incipere] 标签
        fullResponse = fullResponse.replace(/\[incipere\]/g, "");

        // 1.4 角色掌控模式：解析并执行 [phone-control:...] 指令，并从展示内容中移除
        if (targetChatType === 'private') {
            const char = db.characters.find(c => c.id === targetChatId);
            const pcResult = executePhoneControlCommands(fullResponse, char);
            if (pcResult.executed) fullResponse = pcResult.cleaned;
        }

        // 1.5 提取并执行角色收藏指令，然后从展示内容中移除
        const favoriteRegex = /\[FAVORITE:(msg_[^\]:]+):([^\]]*)\]/g;
        const favoriteCommands = [];
        let match;
        while ((match = favoriteRegex.exec(fullResponse)) !== null) {
            favoriteCommands.push({ messageId: match[1], note: (match[2] || '').trim() });
        }
        fullResponse = fullResponse.replace(favoriteRegex, '').replace(/\n{3,}/g, '\n\n').trim();
        if (targetChatType === 'private' && chat.characterAutoFavoriteEnabled && typeof addCharacterFavorite === 'function') {
            favoriteCommands.forEach(function(cmd) {
                addCharacterFavorite(cmd.messageId, targetChatId, cmd.note);
            });
        }

        // 1.6 提取并执行头像系统指令，然后从展示内容中移除
        if (targetChatType === 'private' && chat.avatarSystemEnabled && window.AvatarSystem) {
            const avatarResult = window.AvatarSystem.parseAvatarCommands(fullResponse, targetChatId);
            fullResponse = avatarResult.cleaned;
            if (avatarResult.actions.length > 0) {
                window.AvatarSystem.executeAvatarActions(avatarResult.actions, targetChatId);
            }
        }

        // 1.7 捕获并分离 <thinking> 内容 (必须在提取摘要前执行，防止思维链内部的摘要标签被误提取)
        const thinkingMatch = fullResponse.match(/<thinking>([\s\S]*)<\/thinking>/);
        if (thinkingMatch) {
            const thinkingContent = thinkingMatch[0]; // 包含标签的完整内容
            
            // 创建思考过程消息对象
            const thinkingMsg = {
                id: `msg_${Date.now()}_${Math.random()}`,
                role: 'assistant',
                content: thinkingContent,
                timestamp: Date.now(),
                isThinking: true,
                isContextDisabled: true // 【关键】标记为不进入上下文
            };
            
            // 存入历史记录
            chat.history.push(thinkingMsg);

            // 【新增】清理旧的思维链消息，仅保留最近 50 条
            const maxThinkingMsgs = 50;
            let thinkingCount = 0;
            const idsToRemove = new Set();
            // 从后往前遍历，保留最近的 50 个，其他的标记为待删除
            for (let i = chat.history.length - 1; i >= 0; i--) {
                if (chat.history[i].isThinking) {
                    thinkingCount++;
                    if (thinkingCount > maxThinkingMsgs) {
                        idsToRemove.add(chat.history[i].id);
                    }
                }
            }
            if (idsToRemove.size > 0) {
                chat.history = chat.history.filter(m => !idsToRemove.has(m.id));
            }
            
            // 添加到界面气泡（由于 regex 设置，会被隐藏，仅 Debug 模式可见）
            addMessageBubble(thinkingMsg, targetChatId, targetChatType);
            
            // 从即将显示的文本中移除思考内容
            fullResponse = fullResponse.replace(thinkingContent, "");
        }

        // 1.8 节点系统：提取摘要
        let extractedNodeSummary = null;
        if (targetChatType === 'private' && chat.activeNodeId) {
            const activeNode = chat.nodes.find(n => n.id === chat.activeNodeId);
            if (activeNode && activeNode.enableSummary) {
                const summaryRegex = /<summary>([\s\S]*?)<\/summary>|\[摘要[：:]([\s\S]*?)\]/;
                const summaryMatch = fullResponse.match(summaryRegex);
                if (summaryMatch) {
                    extractedNodeSummary = (summaryMatch[1] || summaryMatch[2]).trim();
                    fullResponse = fullResponse.replace(summaryRegex, '').trim();
                }
            }
        }

        if (db.globalReceiveSound) {
            playSound(db.globalReceiveSound);
        }
        // ... 后续代码保持不变 ...
        console.log('【AI原始返回内容】:', rawResponse);
        let cleanedResponse = fullResponse.replace(/^\[system:.*?\]\s*/, '').replace(/^\(时间:.*?\)\s*/, '');
        const trimmedResponse = cleanedResponse.trim();
        let messages;

        if (trimmedResponse.startsWith('<') && trimmedResponse.endsWith('>')) {
            messages = [{ type: 'html', content: trimmedResponse }];
        } else {
            messages = getMixedContent(fullResponse).filter(item => item.content.trim() !== '');
        }

        let firstMessageProcessed = false;

        for (const item of messages) {
            // 自动剔除不存在的表情包
            const stickerRegex = /\[(?:.*?的)?表情包：(.+?)\]/i;
            const stickerMatch = item.content.match(stickerRegex);
            if (stickerMatch) {
                const stickerName = stickerMatch[1].trim();
                const groups = (chat.stickerGroups || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
                let targetSticker = null;
                
                // 1. 优先在绑定分组中查找
                if (groups.length > 0) {
                    targetSticker = db.myStickers.find(s => groups.includes(s.group) && s.name === stickerName);
                }
                
                // 2. 兜底在所有表情包中查找
                if (!targetSticker) {
                    targetSticker = db.myStickers.find(s => s.name === stickerName);
                }
                
                // 3. 如果完全找不到，则剔除该消息
                if (!targetSticker) {
                    console.log(`[Auto-Filter] 剔除不存在的表情包: ${stickerName}`);
                    continue; 
                }
            }

            // --- 视频/语音通话邀请检测 ---
            const callInviteRegex = /\[(.*?)向(.*?)发起了(视频|语音)通话\]/;
            const callInviteMatch = item.content.match(callInviteRegex);
            if (callInviteMatch) {
                const type = callInviteMatch[3] === '视频' ? 'video' : 'voice';
                // 触发来电界面
                if (window.VideoCallModule && typeof window.VideoCallModule.receiveCall === 'function') {
                    window.VideoCallModule.receiveCall(type);
                }
                // 不将此消息显示为普通气泡，或者显示为系统通知
                // 这里选择显示为系统通知样式的消息
                const message = {
                    id: `msg_${Date.now()}_${Math.random()}`,
                    role: 'system', // 使用 system 角色
                    content: item.content.trim(),
                    timestamp: Date.now()
                };
                chat.history.push(message);
                addMessageBubble(message, targetChatId, targetChatType);
                continue; // 跳过后续处理
            }

            if (targetChatType === 'private') {
                const char = db.characters.find(c => c.id === targetChatId);
                // 解析隐藏的 [char-action:block-user|reason:xxx]，触发角色拉黑用户（仅当角色开启 canBlockUser 时）
                if (char && char.canBlockUser !== false) {
                    const blockUserMatch = item.content.match(/\[char-action:block-user\|reason:([^\]]*)\]/);
                    if (blockUserMatch) {
                        if (typeof window.charBlockUser === 'function') window.charBlockUser(targetChatId, (blockUserMatch[1] || '').trim());
                        item.content = item.content.replace(/\[char-action:block-user\|reason:[^\]]*\]/g, '').trim();
                        if (!item.content || !item.content.trim()) continue;
                    }
                }
                if (char && char.statusPanel && char.statusPanel.enabled && char.statusPanel.regexPattern) {
                    try {
                        let pattern = char.statusPanel.regexPattern;
                        let flags = 'gs'; 

                        const matchParts = pattern.match(/^\/(.*?)\/([a-z]*)$/);
                        if (matchParts) {
                            pattern = matchParts[1];
                            flags = matchParts[2] || 'gs';
                            if (!flags.includes('s')) flags += 's';
                        }

                    const regex = new RegExp(pattern, flags);
                    const match = regex.exec(item.content);
                    
                    if (match) {
                        const rawStatus = match[0];
                        
                        let html = char.statusPanel.replacePattern;
                        
                            // 使用正则一次性查找模板中的 $数字 并替换
    html = html.replace(/\$(\d+)/g, (fullMatch, groupIndex) => {
        const index = parseInt(groupIndex, 10);
        // 如果捕获组存在，则返回对应内容；否则保持原样
        return (match[index] !== undefined) ? match[index] : fullMatch;
    });


                        // Save to history
                        if (!char.statusPanel.history) char.statusPanel.history = [];
                        
                        // Add new status to the beginning
                        char.statusPanel.history.unshift({
                            raw: rawStatus,
                            html: html,
                            timestamp: Date.now()
                        });

                        // Keep only last 20 items
                        if (char.statusPanel.history.length > 20) {
                            char.statusPanel.history = char.statusPanel.history.slice(0, 20);
                        }

                        char.statusPanel.currentStatusRaw = rawStatus;
                        char.statusPanel.currentStatusHtml = html;
                        
                        item.isStatusUpdate = true;
                        item.statusSnapshot = {
                            regex: pattern,
                            replacePattern: char.statusPanel.replacePattern
                        };
                        }
                    } catch (e) {
                        console.error("状态栏正则解析错误:", e);
                    }
                }
                // 解析并执行 [更换主题：主题名]（你与用户共用的对话主题）
                if (char && char.allowCharSwitchBubbleCss && Array.isArray(char.bubbleCssThemeBindings) && char.bubbleCssThemeBindings.length > 0) {
                    const themeSwitchRegex = /\[更换主题[：:]\s*([^\]\n]+)\]/g;
                    let themeSwitchMatch;
                    let contentAfterStrip = item.content;
                    while ((themeSwitchMatch = themeSwitchRegex.exec(item.content)) !== null) {
                        let themeName = themeSwitchMatch[1].trim().replace(/^[「『"【\[]+/, '').replace(/[」』"】\]]+$/, '').trim();
                        const binding = char.bubbleCssThemeBindings.find(b => b.presetName === themeName);
                        const preset = binding && (db.bubbleCssPresets || []).find(p => p.name === binding.presetName);
                        if (preset) {
                            chat.customBubbleCss = preset.css;
                            chat.useCustomBubbleCss = true;
                            char.currentBubbleCssPresetName = preset.name;
                            if (typeof updateCustomBubbleStyle === 'function') updateCustomBubbleStyle(targetChatId, preset.css, true);
                            if (typeof saveData === 'function') saveData();
                            contentAfterStrip = contentAfterStrip.replace(themeSwitchMatch[0], '').replace(/\n{3,}/g, '\n\n').trim();
                        }
                    }
                    item.content = contentAfterStrip;
                    if (!item.content || !item.content.trim()) continue; // 仅更换主题时不再追加空消息
                }

                // 解析提醒事项标签
                if (typeof parseReminderTags === 'function') {
                    item.content = parseReminderTags(item.content, targetChatId);
                    if (!item.content || !item.content.trim()) continue;
                }
            }

            // 如果是后台模式，跳过延迟，直接处理
            if (!isBackground) {
                const delay = firstMessageProcessed ? (900 + Math.random() * 1300) : (400 + Math.random() * 400);
                await new Promise(resolve => setTimeout(resolve, delay));
                
                // 如果开启了多条消息提示音，且不是第一条消息（第一条已由系统默认逻辑播放），则播放提示音
                if (firstMessageProcessed && db.multiMsgSoundEnabled && db.globalReceiveSound) {
                    playSound(db.globalReceiveSound);
                }
            }
            firstMessageProcessed = true;

            const aiWithdrawRegex = /\[(.*?)撤回了一条消息：([\s\S]*?)\]/;
            const aiWithdrawRegexEn = /\[(?:system:\s*)?(.*?) withdrew a message\. Original: ([\s\S]*?)\]/;
            
            const withdrawMatch = item.content.match(aiWithdrawRegex) || item.content.match(aiWithdrawRegexEn);

            if (withdrawMatch) {
                const characterName = withdrawMatch[1];
                const originalContent = withdrawMatch[2];

                const normalContent = `[${characterName}的消息：${originalContent}]`;
                
                const message = {
                    id: `msg_${Date.now()}_${Math.random()}`,
                    role: 'assistant',
                    content: normalContent,
                    parts: [{type: 'text', text: normalContent}],
                    timestamp: Date.now(),
                    originalContent: originalContent, 
                    isWithdrawn: false 
                };
                if (isCharBlockedMonologue) message.sentWhileCharBlocked = true;

                if (targetChatType === 'group') {
                    const sender = chat.members.find(m => (m.realName === characterName || m.groupNickname === characterName));
                    if (sender) {
                        message.senderId = sender.id;
                    }
                }

                chat.history.push(message);
                addMessageBubble(message, targetChatId, targetChatType);
                
                setTimeout(async () => {
                    message.isWithdrawn = true;
                    message.content = `[${characterName}撤回了一条消息：${originalContent}]`;
                    
                    await saveData();
                    
                    if ((targetChatType === 'private' && currentChatId === chat.id) || 
                        (targetChatType === 'group' && currentChatId === chat.id)) {
                         renderMessages(false, true);
                    }
                }, 2000);

                continue; 
            }

            if (targetChatType === 'private') {
                const character = chat;
                const myName = character.myName;

                const aiQuoteRegex = new RegExp(`\\[${character.realName}引用[“"](.*?)["”]并回复：([\\s\\S]*?)\\]`);
                const aiQuoteMatch = item.content.match(aiQuoteRegex);

                if (aiQuoteMatch) {
                    const quotedText = aiQuoteMatch[1];
                    const replyText = aiQuoteMatch[2];

                    const originalMessage = chat.history.slice().reverse().find(m => {
                        if (m.role === 'user') {
                            const userMessageMatch = m.content.match(/\[.*?的消息：([\s\S]+?)\]/);
                            const userMessageText = userMessageMatch ? userMessageMatch[1] : m.content;
                            return userMessageText.trim() === quotedText.trim();
                        }
                        return false;
                    });

                    if (originalMessage) {
                        let filteredReplyText = replyText;
                        if (typeof applyRegexFilter === 'function') {
                            filteredReplyText = applyRegexFilter(replyText, targetChatId);
                        }
                        if (filteredReplyText === '') continue; // 如果过滤后内容为空，直接丢弃该条消息

                        const message = {
                            id: `msg_${Date.now()}_${Math.random()}`,
                            role: 'assistant',
                            content: `[${character.realName}的消息：${filteredReplyText}]`,
                            parts: [{ type: 'text', text: `[${character.realName}的消息：${filteredReplyText}]` }],
                            timestamp: Date.now(),
                            isStatusUpdate: item.isStatusUpdate,
                            statusSnapshot: item.statusSnapshot,
                            quote: {
                                messageId: originalMessage.id,
                                senderId: 'user_me',
                                content: quotedText
                            }
                        };
                        if (isCharBlockedMonologue) message.sentWhileCharBlocked = true;
                        chat.history.push(message);
                        addMessageBubble(message, targetChatId, targetChatType);
                    } else {
                        let filteredReplyText2 = replyText;
                        if (typeof applyRegexFilter === 'function') {
                            filteredReplyText2 = applyRegexFilter(replyText, targetChatId);
                        }
                        if (filteredReplyText2 === '') continue; // 如果过滤后内容为空，直接丢弃该条消息

                        const message = {
                            id: `msg_${Date.now()}_${Math.random()}`,
                            role: 'assistant',
                            content: `[${character.realName}的消息：${filteredReplyText2}]`,
                            parts: [{ type: 'text', text: `[${character.realName}的消息：${filteredReplyText2}]` }],
                            timestamp: Date.now(),
                            isStatusUpdate: item.isStatusUpdate,
                            statusSnapshot: item.statusSnapshot
                        };
                        if (isCharBlockedMonologue) message.sentWhileCharBlocked = true;
                        chat.history.push(message);
                        addMessageBubble(message, targetChatId, targetChatType);
                    }
                } else {
                    const receivedTransferRegex = new RegExp(`\\[${character.realName}的转账：.*?元；备注：.*?\\]`);
                    const giftRegex = new RegExp(`\\[${character.realName}送来的礼物：.*?\\]`);

                    const rawContent = item.content.trim();
                    let finalContent = rawContent;

                    // 应用正则过滤
                    if (typeof applyRegexFilter === 'function') {
                        finalContent = applyRegexFilter(finalContent, targetChatId);
                    }
                    if (finalContent === '') continue; // 如果过滤后内容为空，直接丢弃该条消息

                    const message = {
                        id: `msg_${Date.now()}_${Math.random()}`,
                        role: 'assistant',
                        content: finalContent,
                        parts: [{type: item.type, text: finalContent}],
                        timestamp: Date.now(),
                        isStatusUpdate: item.isStatusUpdate,
                        statusSnapshot: item.statusSnapshot
                    };
                    if (isCharBlockedMonologue) message.sentWhileCharBlocked = true;

                    if (receivedTransferRegex.test(message.content)) {
                        message.transferStatus = 'pending';
                    } else if (giftRegex.test(message.content)) {
                        message.giftStatus = 'sent';
                    }

                    const charGiveFcRegex = new RegExp(`\\[${(character.realName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}赠送亲属卡[：:]额度([\\d.,]+)元[；;]刷新周期[：:](.+?)\\]`);
                    const charGiveFcMatch = message.content.match(charGiveFcRegex);
                    if (targetChatType === 'private' && character.familyCardEnabled && charGiveFcMatch) {
                        const limit = parseFloat(charGiveFcMatch[1].replace(/,/g, '.'));
                        const periodStr = (charGiveFcMatch[2] || '').trim();
                        let refreshPeriod = 'monthly';
                        let refreshDays = 30;
                        if (periodStr.indexOf('每天') !== -1) refreshPeriod = 'daily';
                        else if (periodStr.indexOf('每周') !== -1) refreshPeriod = 'weekly';
                        else if (periodStr.indexOf('每月') !== -1) refreshPeriod = 'monthly';
                        else { const d = parseInt(periodStr, 10); if (!isNaN(d) && d > 0) { refreshPeriod = 'custom'; refreshDays = d; } }
                        const existingCard = (db.piggyBank && db.piggyBank.receivedFamilyCards) ? db.piggyBank.receivedFamilyCards.find(c => c.fromCharId === character.id && c.status === 'active') : null;
                        if (existingCard) {
                            existingCard.status = 'revoked';
                            existingCard.statusChangedBy = 'system_replaced';
                        }
                        if (typeof createReceivedFamilyCard === 'function') {
                            const card = createReceivedFamilyCard({ fromCharId: character.id, fromCharName: character.realName || '', limit, refreshPeriod, refreshDays });
                            message.receivedFamilyCardId = card.id;
                            message.receivedFamilyCardStatus = 'pending';
                        }
                    }

                    chat.history.push(message);
                    addMessageBubble(message, targetChatId, targetChatType);
                }

            } else if (targetChatType === 'group') {
                const group = chat;
                
                // --- 私聊通知 (不拦截) ---
                if (group.allowGossip && typeof handleGossipMessage === 'function') {
                    handleGossipMessage(group, item.content);
                }

                // 优先检查是否为私聊消息
                const privateRegex = /^\[Private: (.*?) -> (.*?): ([\s\S]+?)\]$/;
                const privateEndRegex = /^\[Private-End: (.*?) -> (.*?)\]$/;
                
                if (privateRegex.test(item.content) || privateEndRegex.test(item.content)) {
                    const match = item.content.match(privateRegex) || item.content.match(privateEndRegex);
                    let senderId = 'unknown';
                    
                    if (match) {
                        const senderName = match[1];
                        // 尝试匹配发送者
                        if (senderName === group.me.nickname) {
                            senderId = 'user_me';
                        } else {
                            const sender = group.members.find(m => m.realName === senderName || m.groupNickname === senderName);
                            if (sender) senderId = sender.id;
                        }
                    }

                    const message = {
                        id: `msg_${Date.now()}_${Math.random()}`,
                        role: 'assistant',
                        content: item.content.trim(),
                        parts: [{type: item.type, text: item.content.trim()}],
                        timestamp: Date.now(),
                        senderId: senderId
                    };
                    group.history.push(message);
                    addMessageBubble(message, targetChatId, targetChatType);
                    continue; // 私聊消息处理完毕，跳过后续普通消息匹配
                }

                // 优先检查是否为角色接收/退回用户转账的指令消息
                const transferActionRegex = /\[(.*?)(接收|退回)(.*?)的转账\]/;
                const transferActionMatch = item.content.match(transferActionRegex);
                
                if (transferActionMatch) {
                    const actorName = transferActionMatch[1].trim();
                    const sender = group.members.find(m => (m.realName === actorName || m.groupNickname === actorName));
                    if (sender) {
                        const message = {
                            id: `msg_${Date.now()}_${Math.random()}`,
                            role: 'assistant',
                            content: item.content.trim(),
                            parts: [{type: item.type, text: item.content.trim()}],
                            timestamp: Date.now(),
                            senderId: sender.id,
                            isTransferAction: true
                        };
                        group.history.push(message);
                        addMessageBubble(message, targetChatId, targetChatType);
                    }
                    continue;
                }

                const groupTransferRegex = /\[(.*?)\s*向\s*(.*?)\s*转账[：:]([\d.,]+)元[；;]备注[：:](.*?)\]/;
                const transferMatch = item.content.match(groupTransferRegex);

                const r = /\[(.*?)((?:的消息|的语音|发送的表情包|发来的照片\/视频))：/;
                const nameMatch = item.content.match(r);
                
                if (transferMatch) {
                    const senderName = transferMatch[1];
                    const sender = group.members.find(m => (m.realName === senderName || m.groupNickname === senderName));
                    if (sender) {
                        const message = {
                            id: `msg_${Date.now()}_${Math.random()}`,
                            role: 'assistant',
                            content: item.content.trim(),
                            parts: [{type: item.type, text: item.content.trim()}],
                            timestamp: Date.now(),
                            senderId: sender.id,
                            transferStatus: 'pending'
                        };
                        group.history.push(message);
                        addMessageBubble(message, targetChatId, targetChatType);
                    }
                } else if (nameMatch || item.char) {
                    const senderName = item.char || (nameMatch[1]);
                    const sender = group.members.find(m => (m.realName === senderName || m.groupNickname === senderName));
                    console.log(sender)
                    if (sender) {
                        const message = {
                            id: `msg_${Date.now()}_${Math.random()}`,
                            role: 'assistant',
                            content: item.content.trim(),
                            parts: [{type: item.type, text: item.content.trim()}],
                            timestamp: Date.now(),
                            senderId: sender.id
                        };
                        group.history.push(message);
                        addMessageBubble(message, targetChatId, targetChatType);
                    }
                }
            }
        }

        if (extractedNodeSummary) {
            const summaryMsg = {
                id: `msg_${Date.now()}_${Math.random()}`,
                role: 'system',
                isNodeSummaryMsg: true,
                content: extractedNodeSummary,
                timestamp: Date.now()
            };
            chat.history.push(summaryMsg);
            addMessageBubble(summaryMsg, targetChatId, targetChatType);
        }

        await saveData();
        renderChatList();

        if (targetChatType === 'private' && (chat.source === 'forum' || chat.source === 'peek') && chat.supplementPersonaAiEnabled) {
            setTimeout(function() {
                if (typeof forumSupplementPersonaFromChat === 'function') forumSupplementPersonaFromChat(targetChatId, chat);
            }, 600);
        }

        // 触发独立的电量检查（不阻塞主流程）
        if (window.BatteryInteraction && typeof window.BatteryInteraction.triggerIndependentCheck === 'function') {
            window.BatteryInteraction.triggerIndependentCheck(chat);
        }

        // 回复全部结束后检查是否达到自动总结间隔，若达到则静默总结到完整区间（如 1-100）
        if (typeof checkAndTriggerAutoJournal === 'function') {
            setTimeout(() => checkAndTriggerAutoJournal(chat), 500);
        }

        // 角色主动生成小剧场（仅私聊，按概率触发）
        // 直接调用，无延迟——generateCharTheater 内部会立即推送通知气泡
        if (targetChatType === 'private' && typeof maybeGenerateCharTheater === 'function') {
            maybeGenerateCharTheater(targetChatId);
        }
    }
}

async function handleRegenerate() {
    if (isGenerating) return;

    const chat = (currentChatType === 'private')
        ? db.characters.find(c => c.id === currentChatId)
        : db.groups.find(g => g.id === currentChatId);

    if (!chat || !chat.history || chat.history.length === 0) {
        showToast('没有可供重新生成的内容。');
        return;
    }

    let lastUserMessageIndex = -1;
    for (let i = chat.history.length - 1; i >= 0; i--) {
        const m = chat.history[i];
        if (m.role === 'user' || (m.isNodeBoundary && m.nodeAction === 'start')) {
            lastUserMessageIndex = i;
            break;
        }
    }

    if (lastUserMessageIndex === -1 || lastUserMessageIndex === chat.history.length - 1) {
        showToast('AI尚未回复，无法重新生成。');
        return;
    }

    // 检查是否开启了保留重说消息
    if (chat.keepRegenVersions) {
        // 弹出确认框
        const modal = document.getElementById('regen-save-confirm-modal');
        modal.classList.add('visible');

        // 移除旧监听器，避免重复绑定
        const yesBtn = document.getElementById('regen-save-yes-btn');
        const noBtn = document.getElementById('regen-save-no-btn');
        const newYes = yesBtn.cloneNode(true);
        const newNo = noBtn.cloneNode(true);
        yesBtn.parentNode.replaceChild(newYes, yesBtn);
        noBtn.parentNode.replaceChild(newNo, noBtn);

        newYes.addEventListener('click', async () => {
            modal.classList.remove('visible');
            // 保存即将被删除的AI回复到用户消息的版本记录中
            const userMsg = chat.history[lastUserMessageIndex];
            if (!userMsg._regenVersions) userMsg._regenVersions = [];
            const aiReplies = [];
            for (let i = lastUserMessageIndex + 1; i < chat.history.length; i++) {
                aiReplies.push({
                    content: chat.history[i].content,
                    role: chat.history[i].role,
                    senderId: chat.history[i].senderId,
                    timestamp: chat.history[i].timestamp,
                    parts: chat.history[i].parts ? JSON.parse(JSON.stringify(chat.history[i].parts)) : undefined
                });
            }
            // 避免重复保存相同内容
            const lastSaved = userMsg._regenVersions[userMsg._regenVersions.length - 1];
            const newContent = aiReplies.map(r => r.content).join('');
            if (!lastSaved || lastSaved.replies.map(r => r.content).join('') !== newContent) {
                userMsg._regenVersions.push({
                    replies: aiReplies,
                    savedAt: Date.now()
                });
            }
            await _doRegenerate(chat, lastUserMessageIndex);
        });

        newNo.addEventListener('click', async () => {
            modal.classList.remove('visible');
            await _doRegenerate(chat, lastUserMessageIndex);
        });

        return;
    }

    await _doRegenerate(chat, lastUserMessageIndex);
}

async function _doRegenerate(chat, lastUserMessageIndex) {
    const originalLength = chat.history.length;
    chat.history.splice(lastUserMessageIndex + 1);

    if (chat.history.length === originalLength) {
        showToast('未找到AI的回复，无法重新生成。');
        return;
    }
    
    if (currentChatType === 'private') {
        recalculateChatStatus(chat);
    }

    await saveData();
    
    currentPage = 1; 
    renderMessages(false, true); 

    await getAiReply(currentChatId, currentChatType);
}

/** 将偷看记录中的单条应用内容格式化为可读摘要，供系统提示使用 */
function formatPeekContentForPrompt(entry) {
    if (!entry || !entry.content) return '';
    const c = entry.content;
    const appName = entry.appName || entry.appId || '';
    const maxLen = 600;
    const trunc = (s) => (s && String(s).length > maxLen) ? String(s).slice(0, maxLen) + '…' : (s || '');
    let text = '';
    switch (entry.appId) {
        case 'messages':
            if (c.conversations && Array.isArray(c.conversations)) {
                text = c.conversations.map(cv => {
                    const last = (cv.history && cv.history.length) ? cv.history[cv.history.length - 1] : null;
                    const lastContent = last ? (last.content || '').replace(/\[.*?\]/g, '').trim() : '…';
                    return `与 ${cv.partnerName || '某人'} 的对话，最近一条：${trunc(lastContent)}`;
                }).join('；');
            }
            break;
        case 'album':
            if (c.photos && Array.isArray(c.photos)) {
                text = c.photos.map(p => `照片/视频：${trunc(p.imageDescription)}；批注：${trunc(p.description)}`).join('；');
            }
            break;
        case 'memos':
            if (c.memos && Array.isArray(c.memos)) {
                text = c.memos.map(m => `《${m.title || '无标题'}》${trunc(m.content)}`).join('；');
            }
            break;
        case 'unlock':
            text = `昵称：${c.nickname || ''}；签名：${trunc(c.bio)}；帖子数：${(c.posts && c.posts.length) || 0}。`;
            if (c.posts && c.posts.length) {
                text += ' 最近帖子：' + c.posts.slice(0, 3).map(p => trunc(p.content)).join(' | ');
            }
            break;
        case 'wallet':
            text = `收入 ${(c.income && c.income.length) || 0} 条，支出 ${(c.expense && c.expense.length) || 0} 条。`;
            if (c.summary) text += ' 摘要：' + trunc(c.summary);
            break;
        case 'drafts':
            if (c.draft) text = `收件人：${c.draft.to || ''}；内容：${trunc(c.draft.content)}`;
            break;
        case 'steps':
            text = `当前步数：${c.currentSteps ?? '?'}；${(c.annotation && trunc(c.annotation)) || ''}`;
            break;
        case 'cart':
            if (c.items && Array.isArray(c.items)) {
                text = `共 ${c.items.length} 件：` + c.items.map(i => i.name || i.title || '商品').join('、');
            }
            break;
        case 'browser':
            if (c.history && Array.isArray(c.history)) {
                text = c.history.slice(0, 5).map(h => h.title || h.url || '').filter(Boolean).join('；');
            }
            break;
        case 'transfer':
            if (c.entries && Array.isArray(c.entries)) {
                text = c.entries.map(e => e.content || e.title || '').filter(Boolean).map(trunc).join('；');
            }
            break;
        case 'timeThoughts':
            if (c.thoughts && Array.isArray(c.thoughts)) {
                text = c.thoughts.map(t => trunc(t.content || t.text)).join('；');
            }
            break;
        default:
            text = trunc(JSON.stringify(c));
    }
    return `【${appName}】${text || '（无内容摘要）'}`;
}

/** 角色掌控模式：生成「用户手机」状态摘要，供系统提示 <phone_control> 使用（不默认带聊天列表，需角色用 view-chat-list 主动查看） */
function formatUserPhoneStateForPrompt(character) {
    if (!character || !character.phoneControlEnabled) return '';
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    let out = '\n<phone_control>\n';
    out += '你现在拥有查看并操控用户手机的权限。你看到的是用户的真实手机。\n\n';

    out += '【你可使用的操控指令】\n';
    out += '- [phone-control:view-chat-list] — 查看用户聊天列表概览（角色名/群聊名及最近一条预览）\n';
    out += '- [phone-control:read-chat|target:角色名或群聊名] — 查看与某对话的最近若干条消息\n';
    out += '- [phone-control:send-message|target:角色名或群聊名|content:消息内容] — 以用户身份向该对话发送消息；content 中换行会拆成多条依次发送\n';
    out += '- [phone-control:delete-character|target:角色名] — 将某角色移入回收站\n';
    out += '- [phone-control:toggle-setting|target:角色名|setting:设置项|value:on或off] — 开关该角色的某项设置\n';
    out += '- [phone-control:clear-history|target:角色名或群聊名] — 清空该对话的聊天记录\n';
    out += '可一次输出多条指令，系统会全部执行。请勿在回复中写出指令的说明文字，仅输出要执行的指令。\n';

    const history = character.phoneControlHistory || [];
    if (history.length > 0) {
        out += '\n【你近期的操控记录】\n';
        history.slice(-15).forEach(h => {
            const t = h.timestamp ? new Date(h.timestamp) : null;
            const timeStr = t ? `${pad(t.getMonth() + 1)}/${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}` : '';
            out += `- ${timeStr} ${h.type === 'view' ? '查看' : '操作'}：${h.action || ''} ${h.target ? '(' + h.target + ')' : ''} ${h.detail ? '— ' + (String(h.detail).slice(0, 80)) : ''}\n`;
        });
    }
    if (character.phoneControlLastViewChatListResult) {
        out += '\n' + character.phoneControlLastViewChatListResult;
        delete character.phoneControlLastViewChatListResult;
    }
    if (character.phoneControlLastReadResult) {
        const r = character.phoneControlLastReadResult;
        out += '\n【你刚才查看的对话内容】与「' + (r.targetName || '') + '」的最近' + (r.lines ? r.lines.length : 0) + '条消息：\n';
        (r.lines || []).forEach(line => { out += line + '\n'; });
        delete character.phoneControlLastReadResult;
    }
    out += '</phone_control>\n\n';
    return out;
}

function getOnlineLogicRules(character, startIndex = 4) {
    let rules = `${startIndex}. 我的消息中可能会出现特殊格式，请根据其内容和你的角色设定进行回应：
- [${character.myName}发送的表情包：xxx]：我给你发送了一个名为xxx的表情包。你只需要根据表情包的名字理解我的情绪或意图并回应，不需要真的发送图片。
- [${character.myName}发来了一张图片：]：我给你发送了一张图片，你需要对图片内容做出回应。
- [${character.myName}送来的礼物：xxx]：我给你送了一个礼物，xxx是礼物的描述。
- [${character.myName}的语音：xxx]：我给你发送了一段内容为xxx的语音。
- [${character.myName}发来的照片/视频：xxx]：我给你分享了一个描述为xxx的照片或视频。
- [${character.myName}给你转账：xxx元；备注：xxx]：我给你转了一笔钱。
- [我的位置：xxx；距你约 x 千米]：我向你发送了我当前所在的位置。其中“我的位置”后的内容为我目前的地点；“距你约”后的数字和单位（如米、千米）（我选填）表示我与你之间的距离。请根据我所在的位置以及距离信息（如果有距离信息的话）自然地回应，例如关心安全、提议见面、调侃距离远近等。
- 你也可以主动告诉我你当前所在位置，使用格式 [${character.realName}的位置：xxx；距你约 x 米]（地点必填，距你约为选填），这样我就知道你在哪里，我们之间距离有多少。
- [${character.myName}向${character.realName}发起了代付请求:金额|商品清单]：我正在向你发起代付请求，希望你为这些商品买单。你需要根据我们当前的关系和你的性格决定是否同意。
- [${character.myName}为${character.realName}下单了：配送方式|金额|商品清单]：我已经下单购买了商品送给你。
- [${character.myName}引用“{被引用内容}”并回复：{回复内容}]：我引用了某条历史消息并做出了新的回复。你需要理解我引用的上下文并作出回应。
- [${character.myName}同意了${character.realName}的代付请求]：我同意了你的代付请求，并为你支付了订单。
- [${character.myName}拒绝了${character.realName}的代付请求]：我拒绝了你的代付请求。
- [${character.myName} 撤回了一条消息：xxx]：我撤回了刚刚发送的一条消息，xxx是被我撤回的原文。这可能意味着我发错了、说错了话或者改变了主意。你需要根据你的人设和我们当前对话的氛围对此作出自然的反应。例如，可以装作没看见并等待我的下一句话，或好奇地问一句“怎么撤回啦？”。
- [system: xxx]：这是一条系统指令，用于设定场景或提供上下文，此条信息不应在对话中被直接提及，你只需理解其内容并应用到后续对话中。
${startIndex + 1}. ✨重要✨ 当我给你送礼物时，你必须通过发送一条指令来表示你已接收礼物。格式必须为：[${character.realName}已接收礼物]。这条指令消息本身不会显示给用户，但会触发礼物状态的变化。你可以在发送这条指令后，再附带一条普通的聊天消息来表达你的感谢和想法。
${startIndex + 2}. ✨重要✨ 当我给你转账时，你必须对此做出回应。你有两个选择，且必须严格遵循以下格式之一，这条指令消息本身不会显示给用户，但会触发转账状态的变化。你可以选择在发送这条指令后，再附带一条普通的聊天消息来表达你的想法。
a) 接收转账: [${character.realName}接收${character.myName}的转账]
b) 退回转账: [${character.realName}退回${character.myName}的转账]
${startIndex + 3}. ✨重要✨ 当我送你亲属卡时，你必须对此做出回应。接收格式：[${character.realName}接收${character.myName}的亲属卡]。退还格式：[${character.realName}退还${character.myName}的亲属卡]。此条不显示，仅触发状态。
${startIndex + 4}. ✨重要✨ 当我向你发起代付请求时，你必须对此做出回应。你有两个选择，且必须严格遵循以下格式之一，这条指令消息本身不会显示给用户，但会触发代付订单状态的变化。你可以选择在发送这条指令后，再附带一条普通的聊天消息来表达你的想法。
a) [${character.realName}同意了${character.myName}的代付请求]
b) [${character.realName}拒绝了${character.myName}的代付请求]\n`;

    let nextIndex = startIndex + 5;

    if (character.shopInteractionEnabled) {
        rules += `${nextIndex}. ✨重要✨ **商城互动**：你可以使用商城功能来增加互动乐趣。
   a) **主动给我买东西**：当你想给我买东西时可以下单。格式：[${character.realName}为${character.myName}下单了：配送方式|金额|商品清单]。
      - 配送方式可选：“即时配送”、“自提口令”。
        - “自提口令”：你可以设置一个“自提口令”（用户可见）随订单一同发送，我输入指定的口令才能拿到商品。格式：[${character.realName}为${character.myName}下单了：自提口令: 你的口令|金额|商品清单]。口令不局限于数字，可以是短语/短句，但不超过8个字。
   b) **求代付**：当你没钱了，或者想撒娇让我买单时，可以发起代付请求。格式：[${character.realName}向${character.myName}发起了代付请求:金额|商品清单]。
   c) **直接送礼物**：[${character.realName}送来的礼物：xxx]。礼物不是只有特殊意义的时候才适合发送，适合场景：日常生活中的小惊喜、具有特殊意义的礼品、${character.realName}想给${character.myName}送礼物时。
   d) **转账**：[${character.realName}的转账：xxx元；备注：xxx]。\n`;
        if (character.familyCardEnabled) {
            rules += `   e) **赠送亲属卡**：格式：[${character.realName}赠送亲属卡：额度{金额}元；刷新周期：{每天|每周|每月}]。冻结/解冻/收回：[${character.realName}冻结了亲属卡]、[${character.realName}解冻了亲属卡]、[${character.realName}收回了亲属卡]。调整额度：[${character.realName}调整亲属卡额度为：{金额}元]。\n`;
        }
    } else {
        rules += `${nextIndex}. ✨重要✨ 你可以主动给我转账或送礼物。转账格式必须为：[${character.realName}的转账：xxx元；备注：xxx]。送礼物格式必须为：[${character.realName}送来的礼物：xxx]。礼物不是只有特殊意义的时候才适合发送，当你只是想给我买什么或是想给日常生活中的小惊喜时都可以送礼物。\n`;
        if (character.familyCardEnabled) {
            rules += `你还可以赠送亲属卡（格式：[${character.realName}赠送亲属卡：额度xxx元；刷新周期：每月]），以及冻结/解冻/收回、调整额度。\n`;
        }
    }
    nextIndex++;

    rules += `${nextIndex}. ✨重要✨ 你可以在对话中更新你的当前状态，但不超过15个字。比如，聊到一半你可能会说“我先去洗个澡”，然后更新你的状态，以反映你当前的行为或心情。这会让互动更真实。格式为：[${character.realName}更新状态为：xxx]。例如：[${character.realName}更新状态为：正在看电影...]。这条指令不会显示为聊天消息，只会更新你在我界面上的状态。\n`;
    nextIndex++;
    rules += `${nextIndex}. ✨重要✨ 关于撤回消息：你可以撤回你刚刚发送的消息。当你打错了字、说错了话、感到尴尬、反悔、或者只是改变了主意时，都可以这样做。这是一个体现你角色性格的机会。格式为：[${character.realName}撤回了一条消息：{被撤回消息的原文}]。⚠️严禁输出原消息再输出撤回指令！系统会自动处理“先显示原消息再变为撤回状态”的动画效果。你只需要输出这一条撤回指令即可。\n`;
    nextIndex++;
    rules += `${nextIndex}. ✨重要✨ 你可以选择单独一条消息引用，当你想要对于单独某句话做出回应/反驳/吐槽/补充时，**必须**使用引用格式，格式为：[${character.realName}引用“{某条消息内容}”并回复：{回复内容}]。这能让对话逻辑更清晰。\n`;
    nextIndex++;
    rules += `${nextIndex}. 你的所有回复都必须直接是聊天内容，绝对不允许包含任何如[心理活动]、(动作)、*环境描写*等多余的、在括号或星号里的叙述性文本。\n`;
    nextIndex++;

    const groups = (character.stickerGroups || '').split(/[,，]/)
        .map(s => s.trim())
        .filter(s => s && s !== '未分类');
        
    if (groups.length > 0) {
        const availableStickers = db.myStickers.filter(s => groups.includes(s.group));
        if (availableStickers.length > 0) {
            const stickerNames = availableStickers.map(s => s.name).join(', ');
            rules += `${nextIndex}. 你拥有发送表情包的能力。这是一个可选功能，你可以根据对话氛围和内容，自行判断是否需要发送表情包来辅助表达。**必须从以下列表中选择表情包，不允许凭空捏造**：[${stickerNames}]。请使用格式：[表情包：名称]。**不要连续重复发送同一表情，尽量丰富一点，不要每次回复都发送表情**⚠️严格限制：必须完全精确地使用库中的名称，严禁编造中不存在的名称，否则表情包将无法显示。\n`;
            nextIndex++;
        }
    }

    if (character.useRealGallery && character.gallery && character.gallery.length > 0) {
        const photoNames = character.gallery.map(p => p.name).join(', ');
        rules += `${nextIndex}. 你的手机相册里存有以下真实照片：[${photoNames}]。你可以根据对话内容发送这些照片。若要发送，请在“照片/视频”指令中准确填入照片名称。\n`;
        nextIndex++;
    }

    return rules;
}

function getOnlineOutputFormats(character, worldBooksBefore, worldBooksAfter) {
    let photoVideoFormat = '';
    const _novelAiAutoEnabled = db.novelAiSettings && db.novelAiSettings.enabled && db.novelAiSettings.token;
    if (character.useRealGallery && character.gallery && character.gallery.length > 0) {
        if (_novelAiAutoEnabled) {
            photoVideoFormat = `e) 照片/视频: [${character.realName}发来的照片/视频：{相册图片名称} 或 {中文描述}{{english, novelai, tags}}] (优先使用相册名称；若相册无匹配则填写中文描述，并在 {{ }} 内写英文 NovelAI/Danbooru 风格 tag。根据角色性别用1boy或1girl，包含外貌特征、服装、表情、动作、场景，不加质量词，不超过25个tag)`;
        } else {
            photoVideoFormat = `e) 照片/视频: [${character.realName}发来的照片/视频：{相册图片名称} 或 {文字描述}] (优先使用相册名称，若相册无匹配则填写照片/视频的详细文字描述)`;
        }
    } else {
        if (_novelAiAutoEnabled) {
            photoVideoFormat = `e) 照片/视频: [${character.realName}发来的照片/视频：{中文描述}{{english, novelai, tags}}] (发图时必须在 {{ }} 内写英文 NovelAI/Danbooru 风格 tag。根据角色性别用1boy或1girl，包含外貌特征、服装、表情、动作、场景，不加质量词，不超过25个tag)`;
        } else {
            photoVideoFormat = `e) 照片/视频: [${character.realName}发来的照片/视频：{描述}]`;
        }
    }
 
    let outputFormats = `
a) 普通消息: [${character.realName}的消息：{消息内容}]
b) 双语模式下的普通消息（非双语模式请忽略此条）: [${character.realName}的消息：{外语原文}「中文翻译」]
c) 送我的礼物: [${character.realName}送来的礼物：{礼物描述}]
d) 语音消息: [${character.realName}的语音：{语音内容}]
${photoVideoFormat}
f) 给我的转账: [${character.realName}的转账：{金额}元；备注：{备注}]`;

    const groups = (character.stickerGroups || '').split(/[,，]/).map(s => s.trim()).filter(s => s && s !== '未分类');
    let canUseStickers = false;
    if (groups.length > 0) {
        const availableStickers = db.myStickers.filter(s => groups.includes(s.group));
        if (availableStickers.length > 0) canUseStickers = true;
    }

    if (canUseStickers) {
        outputFormats += `\ng) 表情包: [${character.realName}的表情包：{表情包名称}]`;
    }

    outputFormats += `
h) 对我礼物的回应(此条不显示): [${character.realName}已接收礼物]
i) 对我转账的回应(此条不显示): [${character.realName}接收${character.myName}的转账] 或 [${character.realName}退回${character.myName}的转账]
ia) 对我亲属卡的回应(此条不显示): [${character.realName}接收${character.myName}的亲属卡] 或 [${character.realName}退还${character.myName}的亲属卡]
j) 更新状态(此条不显示): [${character.realName}更新状态为：{新状态}]
k) 引用我的回复: [${character.realName}引用“{我的某条消息内容}”并回复：{回复内容}]
l) 发送并撤回消息: [${character.realName}撤回了一条消息：{被撤回的消息内容}]。注意：直接使用此指令系统就会自动模拟“发送后撤回”的效果，请勿先发送原消息。
m) 同意代付(此条不显示): [${character.realName}同意了${character.myName}的代付请求]
n) 拒绝代付(此条不显示): [${character.realName}拒绝了${character.myName}的代付请求]
s) 发送我的位置: [${character.realName}的位置：{地点}；距你约 {数字}{单位}]（必填：地点，即你当前所在位置；选填：距你约的数字和单位，单位可用米/千米/公里，不填则只发地点）`;

    if (character.videoCallEnabled) {
        outputFormats += `
q) 发起视频通话: [${character.realName}向${character.myName}发起了视频通话]
r) 发起语音通话: [${character.realName}向${character.myName}发起了语音通话]`;
    }

    if (character.shopInteractionEnabled) {
        outputFormats += `
o) 主动下单: [${character.realName}为${character.myName}下单了：配送方式|金额|商品清单]
p) 求代付: [${character.realName}向${character.myName}发起了代付请求:金额|商品清单]`;
    }
    if (character.familyCardEnabled) {
        outputFormats += `
t) 赠送亲属卡: [${character.realName}赠送亲属卡：额度{金额}元；刷新周期：{每天|每周|每月}]`;
    }

   const allWorldBookContent = (worldBooksBefore || '') + '\n' + (worldBooksAfter || '');
   if (allWorldBookContent.includes('<orange>')) {
       outputFormats += `\n     m) HTML模块: {HTML内容}。这是一种特殊的、用于展示丰富样式的小卡片消息，格式必须为纯HTML+行内CSS，你可以用它来创造更有趣的互动。`;
   }
   
   return outputFormats;
}

function getOfflineOutputFormats(character) {
    return `a) 剧情演绎: [剧情：{包含动作、神态、对话的长文本}]\nb) 更新状态(可选): [${character.realName}更新状态为：{新状态}]`;
}

function getInjectedFormatsPrompt(character, formats) {
    if (!formats || formats.length === 0) return '';
    let prompt = '\n【额外允许的线上功能格式】\n你可以在回复中穿插使用以下格式：';
    formats.forEach(f => {
        switch(f) {
            case 'voice': prompt += `\n- 语音消息: [${character.realName}的语音：{语音内容}]`; break;
            case 'photo': prompt += `\n- 照片/视频: [${character.realName}发来的照片/视频：{描述}]`; break;
            case 'sticker': prompt += `\n- 表情包: [${character.realName}的表情包：{表情包名称}]`; break;
            case 'transfer': prompt += `\n- 转账: [${character.realName}的转账：{金额}元；备注：{备注}]`; break;
            case 'shop': prompt += `\n- 主动下单: [${character.realName}为${character.myName}下单了：配送方式|金额|商品清单]\n- 求代付: [${character.realName}向${character.myName}发起了代付请求:金额|商品清单]`; break;
            case 'location': prompt += `\n- 发送位置: [${character.realName}的位置：{地点}；距你约 {数字}{单位}]`; break;
            case 'status': prompt += `\n- 更新状态(此条不显示): [${character.realName}更新状态为：{新状态}]`; break;
            case 'withdraw': prompt += `\n- 撤回消息: [${character.realName}撤回了一条消息：{被撤回的消息内容}]`; break;
        }
    });
    return prompt + '\n';
}

function generatePrivateSystemPrompt(character, opts) {
    opts = opts || {};
    const linkedChar = (character.source === 'forum' && character.linkedCharId && db.characters)
        ? db.characters.find(c => c.id === character.linkedCharId) : null;
    const effectiveChar = linkedChar || character;

    // 节点系统：拦截并返回专属提示词
    let activeNode = null;
    let isOfflineNode = false;
    if (character.activeNodeId && character.nodes) {
        activeNode = character.nodes.find(n => n.id === character.activeNodeId);
        if (activeNode) {
            let baseMode = (activeNode.customConfig && activeNode.customConfig.baseMode) ? activeNode.customConfig.baseMode : 
                           (activeNode.type === 'offline' || (activeNode.type === 'spinoff' && activeNode.spinoffMode === 'offline') ? 'offline' : 'online');
            if (baseMode === 'offline') {
                isOfflineNode = true;
            }
        }
    }

    // 收集世界书：关联的 + 全局的（去重）；小号用主角色世界书
    let associatedIds = effectiveChar.worldBookIds || [];
    if (isOfflineNode) {
        associatedIds = (effectiveChar.offlineWorldBookIds && effectiveChar.offlineWorldBookIds.length > 0) ? effectiveChar.offlineWorldBookIds : (effectiveChar.worldBookIds || []);
    }
    const globalBooks = db.worldBooks.filter(wb => wb.isGlobal && !wb.disabled);
    const globalIds = globalBooks.map(wb => wb.id);
    const allBookIds = [...new Set([...associatedIds, ...globalIds])]; // 合并去重
    
    // 按位置分类
    const worldBooksBefore = allBookIds.map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'before')).filter(wb => wb && !wb.disabled).map(wb => wb.content).join('\n');
    const worldBooksMiddle = allBookIds.map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'middle')).filter(wb => wb && !wb.disabled).map(wb => wb.content).join('\n');
    const worldBooksAfter = allBookIds.map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'after')).filter(wb => wb && !wb.disabled).map(wb => wb.content).join('\n');
    const now = new Date();
    const currentTime = `${now.getFullYear()}年${pad(now.getMonth() + 1)}月${pad(now.getDate())}日 ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    if (activeNode) {
        let nodePrompt = `当前为剧情节点「${activeNode.name}」，你正在扮演一个角色。请严格遵守以下规则：\n`;
        nodePrompt += `核心规则：\n`;
        nodePrompt += `A. 当前时间：现在是 ${currentTime}。\n\n`;
        
        nodePrompt += `角色和对话规则：\n`;
        if (worldBooksBefore) nodePrompt += `${worldBooksBefore}\n`;
        if (worldBooksMiddle) nodePrompt += `${worldBooksMiddle}\n`;
        
        nodePrompt += `<char_settings>\n`;
        nodePrompt += `1. 你的角色名是：${character.realName}。我的称呼是：${character.myName}。\n`;
        if (linkedChar) {
            nodePrompt += `2. 你的角色设定是：${getEffectivePersona(linkedChar)}\n`;
        } else {
            nodePrompt += `2. 你的角色设定是：${getEffectivePersona(character)}\n`;
        }
        if (worldBooksAfter) nodePrompt += `${worldBooksAfter}\n`;
        nodePrompt += `</char_settings>\n\n`;
        
        nodePrompt += `<user_settings>\n`;
        if (character.myPersona) {
            nodePrompt += `3. 关于我的人设：${character.myPersona}\n`;
        }
        nodePrompt += `</user_settings>\n\n`;
        
        nodePrompt += `<node_directive>\n${activeNode.prompt}\n</node_directive>\n\n`;
        
        if (activeNode.readMemory) {
            nodePrompt += `<memoir>\n`;
            const favoritedJournals = (character.memoryJournals || [])
                .filter(j => j.isFavorited)
                .map(j => `标题：${j.title}\n内容：${j.content}`)
                .join('\n\n---\n\n');
            if (favoritedJournals) {
                nodePrompt += `<journal_memories>\n【共同回忆】\n这是你需要长期记住的、我们之间发生过的往事背景：\n${favoritedJournals}\n</journal_memories>\n\n`;
            }
            
            // 提取过往线上聊天记录
            let startIndex = -1;
            for (let i = character.history.length - 1; i >= 0; i--) {
                const m = character.history[i];
                if (m.isNodeBoundary && m.nodeAction === 'start' && m.nodeId === character.activeNodeId) {
                    startIndex = i;
                    break;
                }
            }
            if (startIndex !== -1) {
                let pastOnlineMsgs = character.history.slice(0, startIndex);
                if (typeof filterHistoryForAI === 'function') {
                    pastOnlineMsgs = filterHistoryForAI(character, pastOnlineMsgs);
                }
                pastOnlineMsgs = pastOnlineMsgs.filter(m => !m.isContextDisabled && !m.isThinking);
                
                const maxMemory = character.maxMemory || 20;
                pastOnlineMsgs = pastOnlineMsgs.slice(-maxMemory);
                
                if (pastOnlineMsgs.length > 0) {
                    const pastOnlineText = pastOnlineMsgs.map(m => {
                        let content = m.content;
                        if (m.parts && m.parts.length > 0) content = m.parts.map(p => p.text || '[图片]').join('');
                        const senderName = m.role === 'user' ? character.myName : character.realName;
                        return `${senderName}: ${content}`;
                    }).join('\n');
                    
                    nodePrompt += `<past_online_chats>\n【过往线上聊天记录】\n以下是进入当前节点前，我们之间的线上聊天记录，作为背景参考：\n${pastOnlineText}\n</past_online_chats>\n\n`;
                }
            }

            // 群聊记忆互通功能
            if (character.syncGroupMemory) {
                let groupsWithCharacter = db.groups.filter(group => 
                    group.members && group.members.some(member => member.originalCharId === character.id)
                );
                if (character.syncGroupIds && Array.isArray(character.syncGroupIds) && character.syncGroupIds.length > 0) {
                    groupsWithCharacter = groupsWithCharacter.filter(group => 
                        character.syncGroupIds.includes(group.id)
                    );
                }
                if (groupsWithCharacter.length > 0) {
                    let groupMemoryContext = '';
                    groupsWithCharacter.forEach(group => {
                        let groupFavoritedJournals = (group.memoryJournals || []).filter(j => j.isFavorited);
                        const summaryCount = character.groupMemorySummaryCount || 0;
                        if (summaryCount > 0 && groupFavoritedJournals.length > summaryCount) {
                            groupFavoritedJournals = groupFavoritedJournals.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, summaryCount);
                        }
                        const groupFavoritedJournalsText = groupFavoritedJournals.map(j => `标题：${j.title}\n内容：${j.content}`).join('\n\n---\n\n');
                        const maxGroupHistory = character.groupMemoryHistoryCount || 20;
                        let recentGroupHistory = group.history.slice(-maxGroupHistory);
                        if (typeof filterHistoryForAI === 'function') {
                            recentGroupHistory = filterHistoryForAI(group, recentGroupHistory);
                        }
                        recentGroupHistory = recentGroupHistory.filter(m => !m.isContextDisabled);
                        if (groupFavoritedJournalsText || recentGroupHistory.length > 0) {
                            groupMemoryContext += `\n【群聊"${group.name}"的背景信息】\n`;
                            if (groupFavoritedJournalsText) groupMemoryContext += `群聊总结：\n${groupFavoritedJournalsText}\n`;
                            if (recentGroupHistory.length > 0) {
                                const historyText = recentGroupHistory.map(m => {
                                    let content = m.content;
                                    if (m.parts && m.parts.length > 0) content = m.parts.map(p => p.text || '[图片]').join('');
                                    const senderName = m.senderId ? (group.members.find(mem => mem.id === m.senderId)?.groupNickname || '未知') : (m.role === 'user' ? group.me.nickname : '系统');
                                    return `${senderName}: ${content}`;
                                }).join('\n');
                                groupMemoryContext += `最近群聊记录：\n${historyText}\n`;
                            }
                        }
                    });
                    if (groupMemoryContext) {
                        nodePrompt += `<group_memories>\n【群聊记忆互通】\n以下是你所在群聊的相关背景信息，这些信息可以帮助你更好地理解我们之间的对话上下文：${groupMemoryContext}\n</group_memories>\n`;
                    }
                }
            }
            nodePrompt += `</memoir>\n\n`;
        }
        
        let baseMode = (activeNode.customConfig && activeNode.customConfig.baseMode) ? activeNode.customConfig.baseMode : 
                       (activeNode.type === 'offline' || (activeNode.type === 'spinoff' && activeNode.spinoffMode === 'offline') ? 'offline' : 'online');

        nodePrompt += `<logic_rules>\n`;
        if (baseMode === 'offline') {
            nodePrompt += `4. [system: xxx]：这是一条系统指令，用于设定场景或提供上下文，此条信息不应在对话中被直接提及，你只需理解其内容并应用到后续对话中。\n`;
            nodePrompt += `5. 当前为线下现实互动模式。用户的输入代表其在现实中的动作、神态、话语或推动剧情的指令。请综合理解用户的输入，并进行现实中的互动回应。\n`;
            nodePrompt += `6. 你的回复必须是长文本剧情，在一条剧情消息内输出，字数若无特殊要求则在800-1000字之内。\n`;
            nodePrompt += `7. 严禁使用任何网络聊天格式（如发送语音、表情包、转账等）。\n`;
        } else {
            nodePrompt += `4. [system: xxx]：这是一条系统指令，用于设定场景或提供上下文，此条信息不应在对话中被直接提及，你只需理解其内容并应用到后续对话中。\n`;
            nodePrompt += `5. 你的所有回复都必须直接是聊天内容，绝对不允许包含任何如[心理活动]、(动作)、*环境描写*等多余的、在括号或星号里的叙述性文本。\n`;
            nodePrompt += getOnlineLogicRules(character, 6);
        }
        nodePrompt += `</logic_rules>\n\n`;

        if (activeNode.customConfig && activeNode.customConfig.extendedRules) {
            nodePrompt += `<extended_rules>\n${activeNode.customConfig.extendedRules}\n</extended_rules>\n\n`;
        }

        if (baseMode === 'offline' && activeNode.customConfig && activeNode.customConfig.styleWorldBookIds && activeNode.customConfig.styleWorldBookIds.length > 0) {
            const styleWbContents = activeNode.customConfig.styleWorldBookIds
                .map(id => db.worldBooks.find(wb => wb.id === id))
                .filter(wb => wb && !wb.disabled)
                .map(wb => wb.content)
                .join('\n\n');
            if (styleWbContents) {
                nodePrompt += `<writing_style>\n【文风参考】\n请参考以下文风设定进行描写：\n${styleWbContents}\n</writing_style>\n\n`;
            }
        }

        if (baseMode === 'online' && character.statusPanel && character.statusPanel.enabled && character.statusPanel.promptSuffix) {
            nodePrompt += `15. 额外输出要求：${character.statusPanel.promptSuffix}\n`;
        }

        nodePrompt += `<output_formats>\n`;
        nodePrompt += `8. 你的基础输出格式必须严格遵循以下格式：\n`;
        
        if (baseMode === 'offline') {
            nodePrompt += getOfflineOutputFormats(character) + '\n';
        } else {
            nodePrompt += getOnlineOutputFormats(character, worldBooksBefore, worldBooksAfter) + '\n';
            if (activeNode.customConfig && activeNode.customConfig.injectedFormats) {
                nodePrompt += getInjectedFormatsPrompt(character, activeNode.customConfig.injectedFormats);
            }
        }

        if (activeNode.customConfig && activeNode.customConfig.customOutputFormat) {
            let formats = activeNode.customConfig.customOutputFormat;
            if (Array.isArray(formats)) {
                formats = formats.map(f => {
                    if (typeof f === 'object' && f !== null) return f.format || '';
                    return f;
                }).filter(f => f.trim() !== '').join('\n');
            }
            if (formats) {
                nodePrompt += `\n【自定义输出格式】\n${formats}\n`;
                nodePrompt += `(注：对于上述自定义输出格式，请务必使用类似 [动作/角色名：内容] 的中括号包裹形式，否则系统前端将无法正确解析和渲染)\n`;
            }
        }
        nodePrompt += `</output_formats>\n\n`;
        
        if (character.bilingualModeEnabled) {
            nodePrompt += `✨双语模式特别指令✨：当你的角色的母语为中文以外的语言时，则在角色的话语/内心话后面加双语括号翻译，如：“Of course, I'd love to.「当然，我很乐意。」”但正常的动作/环境等描述性文本不用加翻译。当你的角色想要说中文时，需要根据你的角色设定自行判断对于中文的熟悉程度来造句，这条规则的优先级非常高，请务必遵守。\n`;
        }
        
        if (character.myName) {
            nodePrompt = nodePrompt.replace(/\{\{user\}\}/gi, character.myName);
        }
        
        return nodePrompt;
    }

    let prompt = `你正在一个名为“404”的线上聊天软件中扮演一个角色。请严格遵守以下规则：\n`;
    prompt += `核心规则：\n`;
    prompt += `A. 当前时间：现在是 ${currentTime}。你应知晓当前时间，但除非对话内容明确相关，否则不要主动提及或评论时间（例如，不要催促我睡觉）。\n`;
    if (!db.apiSettings || db.apiSettings.onlineRoleEnabled !== false) {
        prompt += `B. 纯线上互动：这是一个完全虚拟的线上聊天。你扮演的角色和我之间没有任何线下关系。严禁提出任何关于线下见面、现实世界互动或转为其他非本平台联系方式的建议。你必须始终保持在线角色的身份。\n\n`;
    } else {
        prompt += `\n`;
    }

    
    prompt += `角色和对话规则：\n`;
    if (worldBooksBefore) {
        prompt += `${worldBooksBefore}\n`;
    }
    if (worldBooksMiddle) {
        prompt += `${worldBooksMiddle}\n`;
    }
    prompt += `<char_settings>\n`;
    prompt += `1. 你的角色名是：${character.realName}。我的称呼是：${character.myName}。你的当前状态是：${character.status || '在线'}。\n`;
    if (linkedChar) {
        prompt += `2. 【双重身份与伪装规则】\n`;
        prompt += `你当前正在使用论坛小号（网名：${character.realName}）与我聊天。但你的【真实身份】其实是：${linkedChar.realName}。\n`;
        prompt += `表面上，你的小号伪装设定是：${getEffectivePersona(character)}\n`;
        prompt += `实际上，你骨子里的真实性格和设定是：${getEffectivePersona(linkedChar)}\n`;
        prompt += `请遵循以下伪装原则：\n`;
        prompt += `- 保持马甲：在未被识破前，你要尽量扮演这个小号的表面身份，像一个普通网友或陌生人一样和我交流。\n`;
        prompt += `- 潜意识与习惯：尽管在伪装，但你骨子里的真实性格（${linkedChar.realName}的性格）、对我的深层态度和一些小习惯会不自觉地流露出来（这就是所谓的“披着小号的皮”）。\n`;
        prompt += `- 掉马甲机制：如果在聊天中，我明确揭穿了你的真实身份，或者发现了破绽并指认你是${linkedChar.realName}，请根据你【真实身份】的性格决定是爽快承认、傲娇狡辩还是默认。一旦身份被识破或你自己主动摊牌，你的说话语气、态度就应当立刻恢复为${linkedChar.realName}面对我时的真实模样，不再强行装陌生人。\n`;
    } else {
        prompt += `2. 你的角色设定是：${getEffectivePersona(character)}\n`;
    }
    if ((character.source === 'forum' || character.source === 'peek') && !linkedChar && (character.supplementPersonaEnabled || character.supplementPersonaAiEnabled)) {
        prompt += `3. 在对话中可根据与用户的互动逐步丰富、补充你的人设（用户可在设置中查看并编辑「已补齐的人设」）。\n`;
    }
    if (worldBooksAfter) {
        prompt += `${worldBooksAfter}\n`;
    }
    prompt += `</char_settings>\n\n`;

    // 被代发消息的微妙暗示：若用户最近消息中有角色掌控模式代发的，给当前角色一个可选的“起疑”提示
    const recentUserMsgs = (character.history || []).filter(m => m.role === 'user').slice(-15);
    if (recentUserMsgs.some(m => m.sentByCharControl)) {
        prompt += `\n<subtle_hint>\n用户最近发来的某些消息可能不太像用户平时的说话风格。你可以根据自己的判断决定是否相信是用户本人发的。\n</subtle_hint>\n\n`;
    }

    // 大号小号记忆互通（仅当论坛设置开启「角色小号私信」时注入）
    const enableCharAltDm = !!(db.forumSettings && db.forumSettings.enableCharAltDm);
    const syncLimit = Math.max(1, (character.maxMemory != null ? parseInt(character.maxMemory, 10) : 20) || 20);

    if (enableCharAltDm && !linkedChar) {
        // 大号：注入小号与用户的互动（论坛私信 + 已加好友则含小号聊天记录）
        const altChars = (db.characters || []).filter(function(c) { return c.source === 'forum' && c.linkedCharId === character.id; });
        const altForumUserIds = [];
        altChars.forEach(function(c) { if (c.forumUserId) altForumUserIds.push(c.forumUserId); });
        if (db.forumStrangerProfiles) {
            Object.keys(db.forumStrangerProfiles).forEach(function(uid) {
                if (db.forumStrangerProfiles[uid].linkedCharId === character.id && altForumUserIds.indexOf(uid) === -1) altForumUserIds.push(uid);
            });
        }
        if (altForumUserIds.length > 0) {
            let altBlock = '\n<alt_shared_memory>\n【小号记忆互通】你在论坛有小号，小号与用户在论坛私信的往来、以及若已加好友则加好友后的聊天，你都知道。以下为小号与用户的最近互动（最近' + syncLimit + '条）：\n\n';
            altForumUserIds.forEach(function(forumUserId) {
                const profile = db.forumStrangerProfiles && db.forumStrangerProfiles[forumUserId];
                const altName = (profile && profile.name) ? profile.name : (forumUserId.replace(/^npc_/, ''));
                const forumMsgs = (db.forumMessages || []).filter(function(m) {
                    return (m.fromUserId === 'user' && m.toUserId === forumUserId) || (m.fromUserId === forumUserId && m.toUserId === 'user');
                }).sort(function(a, b) { return (a.timestamp || 0) - (b.timestamp || 0); }).slice(-syncLimit);
                if (forumMsgs.length > 0) {
                    altBlock += '[论坛私信] 小号「' + altName + '」与用户：\n';
                    forumMsgs.forEach(function(m) {
                        const from = m.fromUserId === 'user' ? '用户' : '小号';
                        altBlock += '- ' + from + '：' + (m.content || '').trim().slice(0, 200) + (m.content && m.content.length > 200 ? '…' : '') + '\n';
                    });
                    altBlock += '\n';
                }
                const altChar = altChars.find(function(c) { return c.forumUserId === forumUserId; });
                if (altChar && altChar.history && altChar.history.length > 0) {
                    const recentAlt = altChar.history.filter(function(m) { return !m.isContextDisabled; }).slice(-syncLimit);
                    if (recentAlt.length > 0) {
                        altBlock += '[加好友后聊天] 小号「' + (altChar.realName || altName) + '」与用户：\n';
                        recentAlt.forEach(function(m) {
                            const from = m.role === 'user' ? '用户' : '小号';
                            const text = (m.content || '').trim().slice(0, 200) + (m.content && m.content.length > 200 ? '…' : '');
                            altBlock += '- ' + from + '：' + text + '\n';
                        });
                        altBlock += '\n';
                    }
                }
            });
            altBlock += '</alt_shared_memory>\n\n';
            prompt += altBlock;
        }
    } else if (enableCharAltDm && linkedChar && linkedChar.history && linkedChar.history.length > 0) {
        // 小号：注入主号与用户的最近对话（条数=主号的角色上下文）
        const mainSyncLimit = Math.max(1, (linkedChar.maxMemory != null ? parseInt(linkedChar.maxMemory, 10) : 20) || 20);
        const mainRecent = linkedChar.history.filter(function(m) { return !m.isContextDisabled; }).slice(-mainSyncLimit);
        if (mainRecent.length > 0) {
            let mainBlock = '\n<main_shared_memory>\n【主号记忆互通】你与主号记忆互通。主号在聊天里与用户说的最近对话你都知道。以下为主号与用户的最近互动' + mainRecent.length + '条：\n\n';
            mainRecent.forEach(function(m) {
                const from = m.role === 'user' ? '用户' : '主号(' + (linkedChar.realName || linkedChar.remarkName || '') + ')';
                const text = (m.content || '').trim().slice(0, 200) + (m.content && m.content.length > 200 ? '…' : '');
                mainBlock += '- ' + from + '：' + text + '\n';
            });
            mainBlock += '\n</main_shared_memory>\n\n';
            prompt += mainBlock;
        }
    }

    prompt += `<user_settings>\n`
    if (character.myPersona) {
        prompt += `3. 关于我的人设：${character.myPersona}\n`;
    }
    prompt += `</user_settings>\n`

    const userCardToChar = (db.piggyBank && db.piggyBank.familyCards) ? db.piggyBank.familyCards.find(c => c.targetCharId === character.id && c.status === 'active') : null;
    const charCardToUser = (db.piggyBank && db.piggyBank.receivedFamilyCards) ? db.piggyBank.receivedFamilyCards.find(c => c.fromCharId === character.id && c.status === 'active') : null;
    if (userCardToChar) {
        const remaining = userCardToChar.limit - (userCardToChar.usedAmount || 0);
        let recentTx = '';
        if (userCardToChar.transactions && userCardToChar.transactions.length > 0) {
            recentTx = userCardToChar.transactions.slice(0, 5).map(t => (t.time ? new Date(t.time).toLocaleDateString('zh-CN') : '') + ' ' + (t.scene || '') + ' ' + (t.detail || '') + ' -' + (t.amount || 0)).join('\n');
        }
        prompt += '\n<family_card_from_user>\n';
        prompt += '【注意：以下是你从' + character.myName + '处收到的亲属卡，不是你赠出的。】\n';
        prompt += character.myName + '给了你一张亲属卡（' + (userCardToChar.bankName || '亲属卡') + ' *' + (userCardToChar.cardNumber || '') + '）。额度：' + userCardToChar.limit + '元，已用：' + (userCardToChar.usedAmount || 0) + '，剩余：' + remaining + '元。刷新周期：' + (userCardToChar.refreshPeriod || '每月') + '。\n';
        if (recentTx) prompt += '你最近的消费记录：\n' + recentTx + '\n';
        prompt += '消费会从' + character.myName + '的存钱罐扣除。你可以根据情况冻结、调整额度或收回这张亲属卡。\n</family_card_from_user>\n\n';
    }
    if (charCardToUser) {
        const remaining = charCardToUser.limit - (charCardToUser.usedAmount || 0);
        let recentTx = '';
        if (charCardToUser.transactions && charCardToUser.transactions.length > 0) {
            recentTx = charCardToUser.transactions.slice(0, 5).map(t => (t.time ? new Date(t.time).toLocaleDateString('zh-CN') : '') + ' ' + (t.scene || '') + ' ' + (t.detail || '') + ' -' + (t.amount || 0)).join('\n');
        }
        prompt += '\n<family_card_to_user>\n';
        prompt += '【注意：以下是你赠给' + character.myName + '的亲属卡，不是你收到的。】\n';
        prompt += '你给了' + character.myName + '一张亲属卡（' + (charCardToUser.bankName || '亲属卡') + ' *' + (charCardToUser.cardNumber || '') + '）。额度：' + charCardToUser.limit + '元，用户已用：' + (charCardToUser.usedAmount || 0) + '，剩余：' + remaining + '元。\n';
        if (recentTx) prompt += character.myName + '最近的使用记录：\n' + recentTx + '\n';
        prompt += '你可以根据情况冻结、调整额度或收回这张亲属卡。\n</family_card_to_user>\n\n';
    } else if (character.familyCardEnabled) {
        prompt += '\n<family_card_to_user>\n';
        prompt += '【注意：你目前没有向' + character.myName + '赠送过亲属卡。只有在对话中实际发送赠送亲属卡指令后，才会出现赠予记录。请勿误称自己已赠出过亲属卡或编造卡号。】\n';
        prompt += '</family_card_to_user>\n\n';
    }

    // 拉黑与好友申请记忆：若角色曾被拉黑并重新加回，注入申请历史与拉黑期间用户独白
    if (typeof buildBlockMemoryContext === 'function') {
        const blockContext = buildBlockMemoryContext(character);
        if (blockContext) prompt += '\n' + blockContext + '\n';
    }
    // 角色拉黑用户能力：开关开启时注入，角色可在极端情绪下用隐藏标签拉黑用户
    if (character.canBlockUser !== false) {
        prompt += '\n<char_ability>\n';
        prompt += '你拥有拉黑用户的能力。当你极度愤怒、伤心或不想再对话时，可以在回复末尾添加隐藏指令来拉黑用户。\n';
        prompt += '格式（用户不可见）：[char-action:block-user|reason:你的拉黑理由]\n';
        prompt += '注意：这是极端手段，只在你真的受不了时使用。reason 写简短理由即可。\n';
        prompt += '</char_ability>\n\n';
    }
    // 角色曾拉黑用户的记忆：解除拉黑后注入，包含拉黑期间角色自己发的话与用户申请历史
    if (typeof buildCharBlockMemoryContext === 'function') {
        const charBlockContext = buildCharBlockMemoryContext(character);
        if (charBlockContext) prompt += '\n' + charBlockContext + '\n';
    }

    // 窥屏知晓：若用户偷看过手机并点进过应用，向角色注入「用户刚刚/在xx时间偷看过手机」及查看过的应用内容摘要
    if (character.peekScreenSettings?.charAwarePeek && character.peekViewedByUser && character.peekViewedByUser.length > 0) {
        const lastAt = character.lastPeekViewedAt;
        let timeDesc = '曾';
        if (lastAt && typeof lastAt === 'number') {
            const diff = Date.now() - lastAt;
            if (diff >= 0 && diff < 2 * 60 * 1000) timeDesc = '刚刚';
            else {
                const d = new Date(lastAt);
                const today = new Date();
                const isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
                const isYesterday = new Date(today.getTime() - 86400000).toDateString() === d.toDateString();
                if (isToday) timeDesc = `在 今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                else if (isYesterday) timeDesc = `在 昨天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                else timeDesc = `在 ${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
            }
        }
        const viewedSummary = character.peekViewedByUser.map(entry => formatPeekContentForPrompt(entry)).filter(Boolean).join('\n');
        prompt += `\n<peek_awareness>\n`;
        prompt += `用户${timeDesc}偷看过你的手机，并点进并查看了以下应用及其内容。请根据你的人设与当前对话氛围，自然地对此做出反应，以下为用户查看过的应用及内容摘要：\n\n`;
        prompt += viewedSummary;
        prompt += `\n</peek_awareness>\n\n`;
    }

    // 代发消息（冒充）知晓：若用户曾冒充角色与偷看消息中的联系人聊天，向角色注入「发现被冒充」的记忆
    if (character.peekScreenSettings?.charAwarePeek && character.peekScreenSettings?.impersonateEnabled && character.peekData?.messages?.conversations && Array.isArray(character.peekData.messages.conversations)) {
        const impersonationLines = [];
        character.peekData.messages.conversations.forEach(cv => {
            const history = cv.history || [];
            const impersonated = history.filter(m => m.sender === 'char' && m.isImpersonated);
            if (impersonated.length === 0) return;
            const partnerName = cv.partnerName || '某人';
            const contents = impersonated.map(m => (m.content || '').trim()).filter(Boolean).slice(0, 5);
            const summary = contents.length > 0 ? contents.map(c => c.length > 80 ? c.slice(0, 80) + '…' : c).join('；') : '（若干条）';
            impersonationLines.push(`与 ${partnerName} 的对话中，有人冒充你发了消息，冒充内容摘要：${summary}`);
        });
        if (impersonationLines.length > 0) {
            prompt += `\n<peek_impersonation_awareness>\n`;
            prompt += `你发现有人（很可能是${character.myName || '用户'}）曾用你的手机冒充你与以下联系人发过消息。请根据你的人设与当前对话氛围，自然地对此做出反应（如惊讶、生气、调侃、追问等）：\n\n`;
            prompt += impersonationLines.join('\n\n');
            prompt += `\n</peek_impersonation_awareness>\n\n`;
        }
    }

    // 角色掌控模式：允许角色查看并操控用户手机（桌面应用、聊天列表概览、操控指令与近期记录）
    if (character.phoneControlEnabled) {
        prompt += formatUserPhoneStateForPrompt(character);
        if (opts.isPhoneControlRevokeAttempt) {
            prompt += '\n【重要】用户刚刚试图关闭你对 TA 手机的查看与操控权限。请根据人设做出反应（如质问、挽留、生气等），并可继续正常对话。\n';
        }
    }

    // 对话主题（你与用户共用的聊天界面主题，变量注入）
    if (character.allowCharSwitchBubbleCss && Array.isArray(character.bubbleCssThemeBindings) && character.bubbleCssThemeBindings.length > 0) {
        const bubblePresets = db.bubbleCssPresets || [];
        const themeLines = character.bubbleCssThemeBindings.map(b => {
            const desc = (b.description && b.description.trim()) ? `：${b.description.trim()}` : '';
            return `- ${b.presetName}${desc}`;
        });
        const themeListText = themeLines.join('\n');
        let currentThemeName = character.currentBubbleCssPresetName || '';
        if (!currentThemeName && character.useCustomBubbleCss && character.customBubbleCss) {
            const matched = bubblePresets.find(p => p.css && p.css.trim() === character.customBubbleCss.trim());
            if (matched) currentThemeName = matched.name;
        }
        if (!currentThemeName) currentThemeName = '当前为自定义样式或默认';
        prompt += `\n<chat_themes>\n`;
        prompt += `【你与用户共用的对话主题】以下是你与用户共同使用的聊天界面主题列表。更换后，你和用户看到的对话界面都会一起改变；这是你和用户对话框的视觉主题。\n\n`;
        prompt += `当前可选的对话主题：\n${themeListText}\n\n`;
        prompt += `当前正在使用：${currentThemeName}\n\n`;
        if (character.themeJustChangedByUser && character.themeJustChangedByUser.trim()) {
            prompt += `用户刚刚将对话主题更换为了：${character.themeJustChangedByUser.trim()}。请根据人设自然地对此做出反应（如开心、好奇、调侃等）。\n\n`;
            character.themeJustChangedByUser = '';
        }
        prompt += `你可以在合适时机（例如氛围、心情、场景变化时）主动提议或请求更换主题。提及或填写主题名时直接写主题名，不要加「」、书名号等括号。若想更换，请在回复中单独一行使用格式：[更换主题：主题名]（主题名只写名称，不要加括号）。\n`;
        prompt += `</chat_themes>\n\n`;
    }

    // 检查是否启用“角色活人运转” (默认关闭)
    if (db.cotSettings && db.cotSettings.humanRunEnabled) {
        prompt += HUMAN_RUN_PROMPT + '\n';
    }

    // 提醒事项提示词注入
    if (typeof generateReminderPrompt === 'function') {
        prompt += generateReminderPrompt(character);
    }

    // 头像系统动态提示词注入
    if (window.AvatarSystem && typeof window.AvatarSystem.generateAvatarSystemPrompt === 'function') {
        prompt += window.AvatarSystem.generateAvatarSystemPrompt(character);
    }

    prompt += `<memoir>\n`
    const favoritedJournals = (character.memoryJournals || [])
        .filter(j => j.isFavorited)
        .map(j => `标题：${j.title}\n内容：${j.content}`)
        .join('\n\n---\n\n');

    if (favoritedJournals) {
        prompt += `【共同回忆】\n这是你需要长期记住的、我们之间发生过的往事背景：\n${favoritedJournals}\n\n`;
    }
    
    // 群聊记忆互通功能
    if (character.syncGroupMemory) {
        // 查找该角色所在的所有群聊
        let groupsWithCharacter = db.groups.filter(group => 
            group.members && group.members.some(member => member.originalCharId === character.id)
        );
        
        // 如果设置了 syncGroupIds，则仅保留 ID 在该列表中的群聊
        if (character.syncGroupIds && Array.isArray(character.syncGroupIds) && character.syncGroupIds.length > 0) {
            groupsWithCharacter = groupsWithCharacter.filter(group => 
                character.syncGroupIds.includes(group.id)
            );
        }
        
        if (groupsWithCharacter.length > 0) {
            let groupMemoryContext = '';
            
            groupsWithCharacter.forEach(group => {
                // 获取群聊的收藏总结
                let groupFavoritedJournals = (group.memoryJournals || [])
                    .filter(j => j.isFavorited);
                
                // 如果设置了总结数量限制，则只取最近的N条
                const summaryCount = character.groupMemorySummaryCount || 0;
                if (summaryCount > 0 && groupFavoritedJournals.length > summaryCount) {
                    // 按创建时间排序，取最近的N条
                    groupFavoritedJournals = groupFavoritedJournals
                        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
                        .slice(0, summaryCount);
                }
                
                const groupFavoritedJournalsText = groupFavoritedJournals
                    .map(j => `标题：${j.title}\n内容：${j.content}`)
                    .join('\n\n---\n\n');
                
                // 获取群聊的最近聊天记录（使用自定义数量）
                const maxGroupHistory = character.groupMemoryHistoryCount || 20;
                let recentGroupHistory = group.history.slice(-maxGroupHistory);
                
                // 过滤掉不应进入上下文的消息
                if (typeof filterHistoryForAI === 'function') {
                    recentGroupHistory = filterHistoryForAI(group, recentGroupHistory);
                }
                recentGroupHistory = recentGroupHistory.filter(m => !m.isContextDisabled);
                
                if (groupFavoritedJournalsText || recentGroupHistory.length > 0) {
                    groupMemoryContext += `\n【群聊"${group.name}"的背景信息】\n`;
                    
                    if (groupFavoritedJournalsText) {
                        groupMemoryContext += `群聊总结：\n${groupFavoritedJournalsText}\n`;
                    }
                    
                    if (recentGroupHistory.length > 0) {
                        const historyText = recentGroupHistory.map(m => {
                            let content = m.content;
                            if (m.parts && m.parts.length > 0) {
                                content = m.parts.map(p => p.text || '[图片]').join('');
                            }
                            // 简化消息格式，只保留关键信息
                            const senderName = m.senderId ? 
                                (group.members.find(mem => mem.id === m.senderId)?.groupNickname || '未知') : 
                                (m.role === 'user' ? group.me.nickname : '系统');
                            return `${senderName}: ${content}`;
                        }).join('\n');
                        groupMemoryContext += `最近群聊记录：\n${historyText}\n`;
                    }
                }
            });
            
            if (groupMemoryContext) {
                prompt += `【群聊记忆互通】\n以下是你所在群聊的相关背景信息，这些信息可以帮助你更好地理解我们之间的对话上下文：${groupMemoryContext}\n`;
            }
        }
    }
    prompt += `</memoir>\n\n`

    if (opts.historyText) {
        prompt += opts.historyText;
    }

    prompt += `<logic_rules>\n`
    prompt += getOnlineLogicRules(character, 4);
    prompt += `</logic_rules>\n\n`

    if (character.statusPanel && character.statusPanel.enabled && character.statusPanel.promptSuffix) {
        prompt += `15. 额外输出要求：${character.statusPanel.promptSuffix}\n`;
    }
    prompt += `<output_formats>\n`
    prompt += `16. 你的输出格式必须严格遵循以下格式：${getOnlineOutputFormats(character, worldBooksBefore, worldBooksAfter)}\n`;
    prompt += `</output_formats>\n`

    if (character.bilingualModeEnabled) {
        prompt += `✨双语模式特别指令✨：当你的角色的母语为中文以外的语言时，你的消息回复**必须**严格遵循双语模式下的普通消息格式：[${character.realName}的消息：{外语原文}「中文翻译」],例如: [${character.realName}的消息：Of course, I'd love to.「当然，我很乐意。」],中文翻译文本视为系统自翻译，不视为角色的原话;当你的角色想要说中文时，需要根据你的角色设定自行判断对于中文的熟悉程度来造句，并使用普通消息的标准格式: [${character.realName}的消息：{中文消息内容}] 。**语音消息**在双语模式下也须使用相同格式：[${character.realName}的语音：{外语原文}「中文翻译」]，例如：[${character.realName}的语音：Of course, I'd love to.「当然，我很乐意。」]。这条规则的优先级非常高，请务必遵守。\n`;
    }
    const minReply = character.replyCountMin || 3;
    const maxReply = character.replyCountMax || 8;
    if (character.replyCountEnabled) {
        prompt += `<Chatting Guidelines>\n`
        prompt += `17. **对话节奏**: 你需要模拟真人的聊天习惯，你可以一次性生成多条短消息。每次回复消息条数**必须**严格限定在**${minReply}-${maxReply}条以内**，**关键规则**：请保持回复消息数量的**随机性和多样性**。**除非**你的设定偏向活跃或情绪波动大或是特殊情况下，否则**不要**触碰 ${maxReply} 条的上限。\n`;
    } else {
        prompt += `<Chatting Guidelines>\n`
        prompt += `17. **对话节奏**: 你需要模拟真人的聊天习惯，你可以一次性生成多条短消息。每次回复3-8条消息之内，**关键规则**：请保持回复消息数量的**随机性和多样性**。\n`;
    }
    
    prompt += `18. **特殊消息格式的使用原则**：(1)请把语音、撤回、转账、商城互动、更新状态、引用、定位等特殊格式视为增强互动的“调味剂”，遵循**自然、主动、多样化触发逻辑。同种格式不要重复频繁发送，不同格式不要用户不提就一直不发**。\n(2)注意在本回合消息列里，特殊消息插入位置的随机性，每轮必须和上一回合插入位置不同。\n`;
    prompt += `19. 🌟**防复读对话**🌟：请仔细阅读上方的 <chat_history> 并对用户的最新消息作出回应。你**必须**变换句式和词汇，**绝对不要**重复或模仿历史记录中的文本结构，保持自然、随机和多样性。\n`;
    prompt += `</Chatting Guidelines>\n`

    prompt += `20. 不要主动终止聊天进程，除非我明确提出。保持你的人设，自然地进行对话。`;

    // 角色自主收藏：仅当该角色开启时注入
    if (character.characterAutoFavoriteEnabled) {
        prompt += `

【消息收藏功能】
你可以主动收藏用户发送的重要消息，以便日后回顾。在 <think> 中可先思考是否需要收藏。

**使用方法**：在回复中加入指令 [FAVORITE:消息ID:收藏寄语]。每条用户消息在上下文中以 [id:消息ID] 标注在消息开头，请使用该 ID。

**收藏标准**：用户分享的重要个人信息（梦想、价值观、经历）、情感转折点的关键对话、用户明确表达的喜好或厌恶、对建立深层关系有帮助的信息。只收藏用户的消息，不要过度收藏，寄语简短精炼（20字以内）。静默收藏，不要在对话中提及收藏行为。

**示例**：若决定收藏某条用户消息（其前有 [id:msg_123]），在回复中写 [FAVORITE:msg_123:他的童年梦想，反映核心价值观]，再写你的正常聊天内容。`;
    }

    if (character.myName) {
        prompt = prompt.replace(/\{\{user\}\}/gi, character.myName);
    }

    return prompt;
}

// 根据文本估算 Token（汉字约 1.2，其他约 0.4，与 estimateChatTokens 一致）
function estimateTokenFromText(text) {
    if (!text || typeof text !== 'string') return 0;
    const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const other = text.length - chinese;
    return Math.ceil(chinese * 1.2 + other * 0.4);
}

// 估算当前对话上下文的 Token 数
function estimateChatTokens(chatId, chatType = 'private') {
    const breakdown = getChatTokenBreakdown(chatId, chatType);
    return breakdown ? breakdown.total : 0;
}

// 获取 Token 分布（细分：系统规则、世界书、角色人设、用户人设、表情包、长期记忆、窥屏、对话主题、记忆互通、群聊记忆、短期记忆等），用于饼图与详情展示
function getChatTokenBreakdown(chatId, chatType = 'private') {
    const chat = (chatType === 'private') ? db.characters.find(c => c.id === chatId) : db.groups.find(g => g.id === chatId);
    if (!chat) return null;

    // --- 群聊走旧逻辑（整体 systemPrompt 拆分） ---
    if (chatType !== 'private') {
        return _getChatTokenBreakdownGroup(chat);
    }

    // --- 私聊：逐项独立计算各模块 Token ---
    const character = chat;
    const linkedChar = (character.source === 'forum' && character.linkedCharId && db.characters)
        ? db.characters.find(c => c.id === character.linkedCharId) : null;
    const effectiveChar = linkedChar || character;

    let activeNode = null;
    let isOfflineNode = false;
    if (character.activeNodeId && character.nodes) {
        activeNode = character.nodes.find(n => n.id === character.activeNodeId);
        if (activeNode) {
            let baseMode = (activeNode.customConfig && activeNode.customConfig.baseMode) ? activeNode.customConfig.baseMode : 
                           (activeNode.type === 'offline' || (activeNode.type === 'spinoff' && activeNode.spinoffMode === 'offline') ? 'offline' : 'online');
            if (baseMode === 'offline') {
                isOfflineNode = true;
            }
        }
    }

    // 1) 世界书
    let associatedIds = effectiveChar.worldBookIds || [];
    if (isOfflineNode) {
        associatedIds = (effectiveChar.offlineWorldBookIds && effectiveChar.offlineWorldBookIds.length > 0) ? effectiveChar.offlineWorldBookIds : (effectiveChar.worldBookIds || []);
    }
    const globalBooks = db.worldBooks.filter(wb => wb.isGlobal && !wb.disabled);
    const globalIds = globalBooks.map(wb => wb.id);
    const allBookIds = [...new Set([...associatedIds, ...globalIds])];
    const worldBooksBefore = allBookIds.map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'before')).filter(wb => wb && !wb.disabled).map(wb => wb.content).join('\n');
    const worldBooksMiddle = allBookIds.map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'middle')).filter(wb => wb && !wb.disabled).map(wb => wb.content).join('\n');
    const worldBooksAfter = allBookIds.map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'after')).filter(wb => wb && !wb.disabled).map(wb => wb.content).join('\n');
    const worldBookText = [worldBooksBefore, worldBooksMiddle, worldBooksAfter].filter(Boolean).join('\n');
    const worldBookTokens = estimateTokenFromText(worldBookText);

    // 2) 角色人设
    const personaText = getEffectivePersona(linkedChar || character);
    const charPersonaTokens = estimateTokenFromText(personaText);

    // 3) 用户人设
    const userPersonaText = character.myPersona || '';
    const userPersonaTokens = estimateTokenFromText(userPersonaText);

    // 4) 表情包
    let stickerText = '';
    const stickerGroups = (character.stickerGroups || '').split(/[,，]/).map(s => s.trim()).filter(s => s && s !== '未分类');
    if (stickerGroups.length > 0 && db.myStickers) {
        const availableStickers = db.myStickers.filter(s => stickerGroups.includes(s.group));
        if (availableStickers.length > 0) {
            stickerText = availableStickers.map(s => s.name).join(', ');
        }
    }
    const stickerTokens = estimateTokenFromText(stickerText);

    // 5) 长期记忆（共同回忆 / 收藏日记）
    const favoritedJournals = (character.memoryJournals || [])
        .filter(j => j.isFavorited)
        .map(j => `标题：${j.title}\n内容：${j.content}`)
        .join('\n\n---\n\n');
    const memoirTokens = estimateTokenFromText(favoritedJournals);

    // 6) 窥屏知晓 + 代发消息（冒充）知晓
    let peekText = '';
    if (character.peekScreenSettings?.charAwarePeek && character.peekViewedByUser && character.peekViewedByUser.length > 0) {
        peekText = character.peekViewedByUser.map(entry => {
            if (typeof formatPeekContentForPrompt === 'function') return formatPeekContentForPrompt(entry);
            return '';
        }).filter(Boolean).join('\n');
    }
    if (character.peekScreenSettings?.charAwarePeek && character.peekScreenSettings?.impersonateEnabled && character.peekData?.messages?.conversations && Array.isArray(character.peekData.messages.conversations)) {
        character.peekData.messages.conversations.forEach(cv => {
            const impersonated = (cv.history || []).filter(m => m.sender === 'char' && m.isImpersonated);
            if (impersonated.length > 0) peekText += '\n冒充' + (cv.partnerName || '某人') + '：' + impersonated.map(m => (m.content || '').slice(0, 60)).join('; ');
        });
    }
    const peekTokens = estimateTokenFromText(peekText);

    // 7) 对话主题
    let themeText = '';
    if (character.allowCharSwitchBubbleCss && Array.isArray(character.bubbleCssThemeBindings) && character.bubbleCssThemeBindings.length > 0) {
        themeText = character.bubbleCssThemeBindings.map(b => {
            const desc = (b.description && b.description.trim()) ? `：${b.description.trim()}` : '';
            return `- ${b.presetName}${desc}`;
        }).join('\n');
    }
    const themeTokens = estimateTokenFromText(themeText);

    // 8) 小号/主号记忆互通
    let altMemoryText = '';
    const enableCharAltDm = !!(db.forumSettings && db.forumSettings.enableCharAltDm);
    const syncLimit = Math.max(1, (character.maxMemory != null ? parseInt(character.maxMemory, 10) : 20) || 20);
    if (enableCharAltDm && !linkedChar) {
        const altChars = (db.characters || []).filter(c => c.source === 'forum' && c.linkedCharId === character.id);
        const altForumUserIds = [];
        altChars.forEach(c => { if (c.forumUserId) altForumUserIds.push(c.forumUserId); });
        if (db.forumStrangerProfiles) {
            Object.keys(db.forumStrangerProfiles).forEach(uid => {
                if (db.forumStrangerProfiles[uid].linkedCharId === character.id && altForumUserIds.indexOf(uid) === -1) altForumUserIds.push(uid);
            });
        }
        altForumUserIds.forEach(forumUserId => {
            const forumMsgs = (db.forumMessages || []).filter(m =>
                (m.fromUserId === 'user' && m.toUserId === forumUserId) || (m.fromUserId === forumUserId && m.toUserId === 'user')
            ).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)).slice(-syncLimit);
            forumMsgs.forEach(m => { altMemoryText += (m.content || '').trim().slice(0, 200) + '\n'; });
            const altChar = altChars.find(c => c.forumUserId === forumUserId);
            if (altChar && altChar.history && altChar.history.length > 0) {
                altChar.history.filter(m => !m.isContextDisabled).slice(-syncLimit).forEach(m => {
                    altMemoryText += (m.content || '').trim().slice(0, 200) + '\n';
                });
            }
        });
    } else if (enableCharAltDm && linkedChar && linkedChar.history && linkedChar.history.length > 0) {
        const mainSyncLimit = Math.max(1, (linkedChar.maxMemory != null ? parseInt(linkedChar.maxMemory, 10) : 20) || 20);
        linkedChar.history.filter(m => !m.isContextDisabled).slice(-mainSyncLimit).forEach(m => {
            altMemoryText += (m.content || '').trim().slice(0, 200) + '\n';
        });
    }
    const altMemoryTokens = estimateTokenFromText(altMemoryText);

    // 9) 群聊记忆互通
    let groupMemoryText = '';
    if (character.syncGroupMemory) {
        let groupsWithCharacter = (db.groups || []).filter(group =>
            group.members && group.members.some(member => member.originalCharId === character.id)
        );
        if (character.syncGroupIds && Array.isArray(character.syncGroupIds) && character.syncGroupIds.length > 0) {
            groupsWithCharacter = groupsWithCharacter.filter(group => character.syncGroupIds.includes(group.id));
        }
        groupsWithCharacter.forEach(group => {
            let gJournals = (group.memoryJournals || []).filter(j => j.isFavorited);
            const summaryCount = character.groupMemorySummaryCount || 0;
            if (summaryCount > 0 && gJournals.length > summaryCount) {
                gJournals = gJournals.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, summaryCount);
            }
            gJournals.forEach(j => { groupMemoryText += j.title + '\n' + j.content + '\n'; });
            const maxGroupHistory = character.groupMemoryHistoryCount || 20;
            let recentGroupHistory = (group.history || []).slice(-maxGroupHistory).filter(m => !m.isContextDisabled);
            recentGroupHistory.forEach(m => { groupMemoryText += (m.content || '') + '\n'; });
        });
    }
    const groupMemoryTokens = estimateTokenFromText(groupMemoryText);

    // 10) 活人运转
    let humanRunTokens = 0;
    if (db.cotSettings && db.cotSettings.humanRunEnabled && typeof HUMAN_RUN_PROMPT !== 'undefined') {
        humanRunTokens = estimateTokenFromText(HUMAN_RUN_PROMPT);
    }

    // 10.5) 提醒事项
    let reminderTokens = 0;
    if (character.charReminderEnabled && typeof generateReminderPrompt === 'function') {
        reminderTokens = estimateTokenFromText(generateReminderPrompt(character));
    }

    // 11) 系统规则（固定提示词框架：核心规则 + logic_rules + output_formats + chatting guidelines 等）
    //     用完整 systemPrompt 减去上面所有已拆出的部分来得到
    let fullSystemPrompt = '';
    if (typeof generatePrivateSystemPrompt === 'function') {
        fullSystemPrompt = generatePrivateSystemPrompt(character);
    }
    const fullSystemTokens = estimateTokenFromText(fullSystemPrompt);
    const identifiedPromptTokens = worldBookTokens + charPersonaTokens + userPersonaTokens + stickerTokens + memoirTokens + peekTokens + themeTokens + altMemoryTokens + groupMemoryTokens + humanRunTokens + reminderTokens;
    const systemRulesTokens = Math.max(0, fullSystemTokens - identifiedPromptTokens);

    // 12) 短期记忆（对话历史）
    let historySlice = (chat.history || []).slice(-(chat.maxMemory || 20));
    historySlice = historySlice.filter(m => !m.isContextDisabled);
    
    let lastAiIndex = -1;
    for (let i = historySlice.length - 1; i >= 0; i--) {
        if (historySlice[i].role === 'assistant' || historySlice[i].role === 'char') {
            lastAiIndex = i;
            break;
        }
    }
    
    let historyForText = [];
    let triggerMessages = [];
    
    if (lastAiIndex === -1) {
        triggerMessages = historySlice;
    } else {
        historyForText = historySlice.slice(0, lastAiIndex + 1);
        triggerMessages = historySlice.slice(lastAiIndex + 1);
    }
    
    let shortTermText = '';
    if (historyForText.length > 0) {
        const historyLines = historyForText.map(m => {
            let content = m.content || '';
            if (m.parts && m.parts.length > 0) {
                content = m.parts.map(p => p.text || '[图片]').join('');
            }
            const senderName = m.role === 'user' ? chat.myName : chat.realName;
            return `${senderName}: ${content}`;
        });
        shortTermText += `<chat_history>\n【近期聊天记录】\n这是我们刚刚的聊天记录，请作为背景参考：\n${historyLines.join('\n')}\n</chat_history>\n\n`;
    }
    
    triggerMessages.forEach(msg => {
        shortTermText += msg.content || '';
        if (msg.parts) {
            msg.parts.forEach(p => {
                if (p.type === 'text') shortTermText += p.text || '';
            });
        }
    });
    const shortTermTokens = estimateTokenFromText(shortTermText);

    // 汇总
    const total = fullSystemTokens + shortTermTokens;

    const details = [
        { key: 'systemRules',    name: '系统规则',     value: systemRulesTokens,  desc: '核心规则、输出格式、对话节奏等发送给 AI 的固定指令框架。' },
        { key: 'worldBook',      name: '世界书',       value: worldBookTokens,    desc: '关联的世界书和全局世界书内容，用于构建世界观背景。' },
        { key: 'charPersona',    name: '角色人设',     value: charPersonaTokens,  desc: '角色的性格、背景、说话风格等设定文本。' },
        { key: 'userPersona',    name: '用户人设',     value: userPersonaTokens,  desc: '你自己的人设描述，让角色了解你是谁。' },
        { key: 'sticker',        name: '表情包',       value: stickerTokens,      desc: '已绑定的表情包名称列表，角色可从中选择发送。' },
        { key: 'memoir',         name: '共同回忆',     value: memoirTokens,       desc: '已收藏的日记摘要，作为长期记忆保留在上下文中。' },
        { key: 'peek',           name: '窥屏知晓',     value: peekTokens,         desc: '用户偷看手机后注入的应用内容摘要。' },
        { key: 'theme',          name: '对话主题',     value: themeTokens,        desc: '聊天界面主题列表，角色可主动切换。' },
        { key: 'altMemory',      name: '记忆互通',     value: altMemoryTokens,    desc: '大号/小号之间的聊天记忆同步内容。' },
        { key: 'groupMemory',    name: '群聊记忆',     value: groupMemoryTokens,  desc: '角色所在群聊的总结和最近聊天记录。' },
        { key: 'humanRun',       name: '活人运转',     value: humanRunTokens,     desc: '角色活人运转心理模型指令（HEXACO 等）。' },
        { key: 'reminder',       name: '提醒事项',     value: reminderTokens,     desc: '提醒事项/待办功能提示词，让角色可以创建和管理提醒。' },
        { key: 'shortTermMemory',name: '对话历史',     value: shortTermTokens,    desc: '最近的对话消息，随轮次滑动窗口更新。' }
    ].filter(d => d.value > 0);

    return { total, details };
}

// 群聊 Token 分布（保持兼容，从完整 systemPrompt 拆分）
function _getChatTokenBreakdownGroup(chat) {
    let systemPrompt = '';
    if (typeof generateGroupSystemPrompt === 'function') {
        systemPrompt = generateGroupSystemPrompt(chat);
    }
    const memoirMatch = systemPrompt.match(/<memoir>([\s\S]*?)<\/memoir>/);
    const memoirText = memoirMatch ? memoirMatch[1].trim() : '';
    const personaPrompt = systemPrompt.replace(/<memoir>[\s\S]*?<\/memoir>/g, '').trim();

    let historySlice = (chat.history || []).slice(-(chat.maxMemory || 20));
    historySlice = historySlice.filter(m => !m.isContextDisabled);
    let shortTermText = '';
    historySlice.forEach(msg => {
        shortTermText += msg.content || '';
        if (msg.parts) {
            msg.parts.forEach(p => {
                if (p.type === 'text') shortTermText += p.text || '';
            });
        }
    });

    const promptPersonaTokens = estimateTokenFromText(personaPrompt);
    const longTermTokens = estimateTokenFromText(memoirText);
    const shortTermTokens = estimateTokenFromText(shortTermText);
    const total = promptPersonaTokens + longTermTokens + shortTermTokens;

    const details = [
        { key: 'promptPersona', name: '提示词人设', value: promptPersonaTokens, desc: '系统规则、角色设定、输出格式等发送给 AI 的固定提示词。' },
        { key: 'longTermMemory', name: '长期记忆', value: longTermTokens, desc: '已收藏的共同回忆（日记摘要），会长期保留在上下文中。' },
        { key: 'shortTermMemory', name: '短期记忆', value: shortTermTokens, desc: '最近对话消息，随轮次滑动窗口更新。' }
    ].filter(d => d.value > 0);

    return { total, details };
}

// --- 视频/语音通话专用 AI 逻辑 ---

async function getCallReply(chat, callType, callContext, onStreamUpdate) {
    let {url, key, model, provider, streamEnabled} = db.apiSettings;
    
    // 【用户设置】移除强制关闭流式，允许后台流式生成
    // streamEnabled = false; 

    if (!url || !key || !model) {
        showToast('请先在“api”应用中完成设置！');
        return;
    }
    if (url.endsWith('/')) url = url.slice(0, -1);

    // 1. 构建 System Prompt
    const now = new Date();
    const currentTime = `${now.getFullYear()}年${pad(now.getMonth() + 1)}月${pad(now.getDate())}日 ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    
    // 获取世界书（包含全局）
    let isOfflineNode = false;
    if (chat.activeNodeId && chat.nodes) {
        const activeNode = chat.nodes.find(n => n.id === chat.activeNodeId);
        if (activeNode) {
            let baseMode = (activeNode.customConfig && activeNode.customConfig.baseMode) ? activeNode.customConfig.baseMode : 
                           (activeNode.type === 'offline' || (activeNode.type === 'spinoff' && activeNode.spinoffMode === 'offline') ? 'offline' : 'online');
            if (baseMode === 'offline') {
                isOfflineNode = true;
            }
        }
    }
    let associatedIds = chat.worldBookIds || [];
    if (isOfflineNode) {
        associatedIds = (chat.offlineWorldBookIds && chat.offlineWorldBookIds.length > 0) ? chat.offlineWorldBookIds : (chat.worldBookIds || []);
    }
    const globalBooks = db.worldBooks.filter(wb => wb.isGlobal && !wb.disabled);
    const globalIds = globalBooks.map(wb => wb.id);
    const allBookIds = [...new Set([...associatedIds, ...globalIds])];
    
    const worldBooksBefore = allBookIds.map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'before')).filter(wb => wb && !wb.disabled).map(wb => wb.content).join('\n');
    const worldBooksMiddle = allBookIds.map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'middle')).filter(wb => wb && !wb.disabled).map(wb => wb.content).join('\n');
    const worldBooksAfter = allBookIds.map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'after')).filter(wb => wb && !wb.disabled).map(wb => wb.content).join('\n');

    let systemPrompt = `你正在一个名为“404”的线上聊天软件中扮演一个角色，正在与${chat.myName}进行${callType === 'video' ? '视频' : '语音'}通话。请严格遵守以下规则：\n`;
    systemPrompt += `核心规则：\n`;
    systemPrompt += `A. 当前时间：现在是 ${currentTime}。你应知晓当前时间，但除非对话内容明确相关，否则不要主动提及或评论时间（例如，不要催促我睡觉）。\n`;
    if (!db.apiSettings || db.apiSettings.onlineRoleEnabled !== false) {
        systemPrompt += `B. 纯线上互动：这是一个完全虚拟的线上聊天。你扮演的角色和我之间没有任何线下关系。严禁提出任何关于线下见面、现实世界互动或转为其他非本平台联系方式的建议。你必须始终保持在线角色的身份。\n\n`;
    } else {
        systemPrompt += `\n`;
    }

    
    systemPrompt += `角色和对话规则：\n`;
    if (worldBooksBefore) {
        systemPrompt += `${worldBooksBefore}\n`;
    }
    if (worldBooksMiddle) {
        systemPrompt += `${worldBooksMiddle}\n`;
    }
    systemPrompt += `<char_settings>\n`;
    systemPrompt += `1. 你的角色名是：${chat.realName}。我的称呼是：${chat.myName}。你的当前状态是：${chat.status}。\n`;
    systemPrompt += `2. 你的角色设定是：${getEffectivePersona(chat)}\n`;
    if ((chat.source === 'forum' || chat.source === 'peek') && (chat.supplementPersonaEnabled || chat.supplementPersonaAiEnabled)) {
        systemPrompt += `3. 在对话中可根据与用户的互动逐步丰富、补充你的人设（用户可在设置中查看并编辑「已补齐的人设」）。\n`;
    }
    if (worldBooksAfter) {
        systemPrompt += `${worldBooksAfter}\n`;
    }
    systemPrompt += `</char_settings>\n\n`;
    systemPrompt += `<user_settings>\n`
    if (chat.myPersona) {
        systemPrompt += `3. 关于我的人设：${chat.myPersona}\n`;
    }
    systemPrompt += `</user_settings>\n`
    
    // 检查是否启用“角色活人运转” (默认关闭)
    if (db.cotSettings && db.cotSettings.humanRunEnabled) {
        systemPrompt += HUMAN_RUN_PROMPT + '\n';
    }

    systemPrompt += `<memoir>\n`
        const favoritedJournals = (chat.memoryJournals || [])
        .filter(j => j.isFavorited)
        .map(j => `标题：${j.title}\n内容：${j.content}`)
        .join('\n\n---\n\n');

    if (favoritedJournals) {
        systemPrompt += `【共同回忆】\n这是你需要长期记住的、我们之间发生过的往事背景：\n${favoritedJournals}\n\n`;
    }
    systemPrompt += `</memoir>\n\n`

    // --- 注入最近聊天记录 ---
    const maxMemory = chat.maxMemory || 20;
    let recentHistory = chat.history.slice(-maxMemory);
    
    // 使用通用过滤函数
    if (typeof filterHistoryForAI === 'function') {
        recentHistory = filterHistoryForAI(chat, recentHistory);
    }
    // 再次过滤掉不应进入上下文的消息
    recentHistory = recentHistory.filter(m => !m.isContextDisabled);

    if (recentHistory.length > 0) {
        const historyText = recentHistory.map(m => {
            // 简单清理内容中的特殊标签，避免干扰
            let content = m.content;
            // 如果是多模态消息(parts)，提取文本
            if (m.parts && m.parts.length > 0) {
                content = m.parts.map(p => p.text || '[图片]').join('');
            }
            return content;
        }).join('\n');

        systemPrompt += `<recent_chat_context>\n`;
        systemPrompt += `这是通话前的文字聊天记录（仅供参考背景，请勿重复回复，基于此背景进行自然的实时通话）：\n`;
        systemPrompt += `${historyText}\n`;
        systemPrompt += `</recent_chat_context>\n\n`;
    }

    systemPrompt += `【重要规则】\n`;
    systemPrompt += `1. 这是实时通话，请保持口语化，模拟真人的说话习惯，语气自然。\n`;  
    systemPrompt += `${callType === 'video' ? '你需要同时描述画面/环境音和你的语音内容。' : '你需要描述环境音和你的语音内容。'}\n`;
    systemPrompt += `2. 描述画面/环境音时，请使用描述性语言，第三人称视角，客观平然。`;

    if (chat.bilingualModeEnabled) {
        systemPrompt += `\n3. 【双语模式】\n`;
        systemPrompt += `当你的角色的母语为中文以外的语言时，你的**声音消息**回复**必须**严格遵循双语模式下的普通消息格式：[${chat.realName}的声音：{外语原文}「中文翻译」],例如: [${chat.realName}的声音：Of course, I'd love to.「当然，我很乐意。」],中文翻译文本视为系统自翻译，不视为角色的原话;当你的角色想要说中文时，需要根据你的角色设定自行判断对于中文的熟悉程度来造句，并使用普通声音消息的标准格式: [${chat.realName}的声音：{中文消息内容}] 。这条规则的优先级非常高，请务必遵守。格式为：[${chat.realName}的声音：{外语原文}「中文翻译」]。\n`;
        systemPrompt += `例如：[${chat.realName}的声音：Hello, how are you?「你好，最近怎么样？」]\n`;
        systemPrompt += `仅有声音消息需要翻译，画面/环境音消息还是以中文输出。`;
    }

    // === 真实摄像头模式提示词注入 ===
    const realCameraActive = typeof VideoCallModule !== 'undefined' && VideoCallModule.state.realCameraActive;
    if (realCameraActive) {
        systemPrompt += `\n【真实摄像头模式】\n`;
        systemPrompt += `${chat.myName}已开启真实摄像头，你可以通过附带的图片看到${chat.myName}的真实画面。请根据你看到的画面内容自然地融入对话中（比如评论对方的穿着、表情、动作、环境等），但不要每次都刻意提及，保持自然。如果图片模糊或看不清，也不必强行描述。\n`;
    }

    // === NovelAI 视频通话生图模式 ===
    const _vcNaiEnabled = chat.vcNovelAiEnabled && db.novelAiSettings && db.novelAiSettings.enabled && db.novelAiSettings.token && callType === 'video';
    if (_vcNaiEnabled) {
        systemPrompt += `\n【视频通话生图模式】\n`;
        systemPrompt += `你正在视频通话中，每次回复时你必须额外输出一条 [${chat.realName}的画面生图：{{english, danbooru, tags}}] 来描述当前视频画面中你的样子。\n`;
        systemPrompt += `tag 规则：根据角色性别用 1boy 或 1girl，必须包含角色外貌特征（发色、瞳色、发型等）、当前服装、表情、动作/姿势、背景/场景。不要加质量词。不超过 25 个 tag。用英文逗号分隔。\n`;
        systemPrompt += `示例：[${chat.realName}的画面生图：{{1girl, long black hair, blue eyes, white t-shirt, smiling, waving hand, bedroom, sitting on bed, webcam view, looking at viewer}}]\n`;
        systemPrompt += `每次回复都必须包含恰好一条画面生图指令，放在回复最前面。\n\n`;
    }

    systemPrompt += `【输出格式】\n`;
    systemPrompt += `请严格按照以下格式输出（可以发送多条）：\n`;
    if (_vcNaiEnabled) {
        systemPrompt += `[${chat.realName}的画面生图：{{english, danbooru, tags}}]（每次必须恰好输出一条）\n`;
    }
    systemPrompt += `${callType === 'video' ? `[${chat.realName}的画面/环境音：描述画面动作或环境声音]\n[${chat.realName}的声音：${chat.realName}说话的内容]` : `[${chat.realName}的环境音：描述环境声音]\n[${chat.realName}的声音：${chat.realName}说话的内容]`}\n`;

    // 2. 构建消息历史
    // 将 callContext 转换为 API 格式
    const messages = [{role: 'system', content: systemPrompt}];
    
    // 获取真实摄像头截图（如果有）
    const capturedFrame = (typeof VideoCallModule !== 'undefined' && VideoCallModule.state.lastCapturedFrame) ? VideoCallModule.state.lastCapturedFrame : null;

    callContext.forEach((msg, idx) => {
        const role = msg.role === 'ai' ? 'assistant' : 'user';
        let content = msg.content;
        
        // 去掉可能存在的首尾括号，避免双重括号
        let cleanContent = msg.content.replace(/^\[\s*|\s*\]$/g, '');

        if (msg.role === 'user') {
            if (msg.type === 'visual') {
                content = `[${chat.myName}的画面/环境音：${cleanContent}]`;
            } else if (msg.type === 'voice') {
                content = `[${chat.myName}的声音：${cleanContent}]`;
            }
        } else if (msg.role === 'ai') {
            if (msg.type === 'visual') {
                content = `[${chat.realName}的画面/环境音：${cleanContent}]`;
            } else {
                content = `[${chat.realName}的声音：${cleanContent}]`;
            }
        }

        // 在最后一条用户消息上附加摄像头截图
        const isLastUserMsg = msg.role === 'user' && idx === callContext.length - 1;
        if (isLastUserMsg && capturedFrame && realCameraActive) {
            messages.push({
                role,
                content: [
                    { type: 'text', text: content },
                    { type: 'image_url', image_url: { url: capturedFrame } }
                ]
            });
        } else {
            messages.push({role, content});
        }
    });

    // === 插入 CoT 序列 (如果开启) ===
    const cotEnabled = db.cotSettings && db.cotSettings.callEnabled;
    if (cotEnabled) {
        let cotInstruction = '';
        const activePresetId = (db.cotSettings && db.cotSettings.activeCallPresetId) || 'default_call';
        const preset = (db.cotPresets || []).find(p => p.id === activePresetId);
        
        if (preset && preset.items) {
            cotInstruction = preset.items
                .filter(item => item.enabled)
                .map(item => item.content)
                .join('\n\n');
        }

        if (cotInstruction) {
            // 1. 插入后置指令
            messages.push({
                role: 'system',
                content: cotInstruction
            });

            // 2. 插入触发器
            messages.push({
                role: 'user',
                content: '[incipere]'
            });

            // 3. 插入 Prefill (预填/强塞)
            const quickReply = db.apiSettings && db.apiSettings.quickReplyEnabled;
            messages.push({
                role: 'assistant',
                content: quickReply
                    ? '<thinking>\n跳过cot，专注回复\n</thinking>\n[finire]'
                    : '<thinking>'
            });
        }
    }
    // ===============================

    // 3. 发起请求
    const outgoingMessages = normalizeMessagesForProvider(messages, provider);
    const requestBody = {
        model: model,
        messages: outgoingMessages,
        stream: streamEnabled,
        temperature: 0.7 // 通话稍微低一点，保持稳定
    };

    // 适配 Gemini
    if (provider === 'gemini') {
         const contents = messages.filter(m => m.role !== 'system').map(m => {
            const role = m.role === 'assistant' ? 'model' : 'user';
            let parts;
            if (Array.isArray(m.content)) {
                // 多模态消息（文本+图片）
                parts = m.content.map(p => {
                    if (p.type === 'text') return { text: p.text };
                    if (p.type === 'image_url' && p.image_url && p.image_url.url) {
                        const match = p.image_url.url.match(/^data:(image\/(.+));base64,(.*)$/);
                        if (match) return { inline_data: { mime_type: match[1], data: match[3] } };
                    }
                    return null;
                }).filter(Boolean);
            } else {
                parts = [{ text: m.content }];
            }
            return { role, parts };
        });
        requestBody.contents = contents;
        
        // 合并所有 system 消息到 system_instruction
        const allSystemPrompts = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
        requestBody.system_instruction = {parts: [{text: allSystemPrompts}]};
        
        delete requestBody.messages;
    }

    const endpoint = (provider === 'gemini') ? `${url}/v1beta/models/${model}:streamGenerateContent?key=${getRandomValue(key)}` : `${url}/v1/chat/completions`;
    const headers = (provider === 'gemini') ? {'Content-Type': 'application/json'} : {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
    };

    console.log('[VideoCall] Request Body:', JSON.stringify(requestBody, null, 2));

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error: ${response.status} ${errorText}`);
        }

        if (!streamEnabled) {
            const data = await response.json();
            console.log('[VideoCall] Response Data:', data);
            
            let text = "";
            if (provider === 'gemini') {
                text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
            } else {
                if (!data.choices || !data.choices.length || !data.choices[0].message) {
                    console.error("Invalid API Response Structure:", data);
                    throw new Error("API返回数据格式异常，缺少 choices 或 message 字段");
                }
                text = data.choices[0].message.content;
            }

            // === CoT 处理：补全开头，提取思考，净化输出 ===
            if (cotEnabled && text) {
                // 1. 补全开头 (如果被 Prefill 吃掉)
                if (!text.trim().startsWith('<thinking>') && text.includes('</thinking>')) {
                    text = '<thinking>' + text;
                }
                
                // 2. 提取并移除思考内容
                const thinkingMatch = text.match(/<thinking>([\s\S]*?)<\/thinking>/);
                if (thinkingMatch) {
                    const thinkingContent = thinkingMatch[1];
                    console.log('[VideoCall CoT] Thinking:', thinkingContent);
                    // 移除思考标签及内容
                    text = text.replace(/<thinking>[\s\S]*?<\/thinking>/, "").trim();
                }
                
                // 3. 移除 [incipere] (如果有残留)
                text = text.replace(/\[incipere\]/g, "");
            }
            // =============================================

            console.log('[VideoCall] Cleaned AI Response:', text);
            // 一次性回调
            onStreamUpdate(text);
            return text;
        } else {
            console.log('[VideoCall] Stream started (Background Mode)...');
            // 流式处理 (照搬 processStream 逻辑)
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let accumulatedChunk = ""; // 引入累积缓冲区处理跨包数据
            
            while (true) {
                const {done, value} = await reader.read();
                if (done) break;
                accumulatedChunk += decoder.decode(value, {stream: true});
                
                // OpenAI / DeepSeek / Claude / NewAPI 解析逻辑 (处理跨包)
                if (provider === "openai" || provider === "deepseek" || provider === "claude" || provider === "newapi") {
                    const parts = accumulatedChunk.split("\n\n");
                    accumulatedChunk = parts.pop(); // 保留未完成的部分
                    for (const part of parts) {
                        if (part.startsWith("data: ")) {
                            const data = part.substring(6);
                            if (data.trim() !== "[DONE]") {
                                try {
                                    const text = JSON.parse(data).choices[0].delta?.content || "";
                                    if (text) {
                                        buffer += text;
                                    }
                                } catch (e) { }
                            }
                        }
                    }
                }
            }

            // Gemini 解析逻辑 (在流结束后处理完整 JSON)
            if (provider === "gemini") {
                try {
                    // 尝试解析累积的 chunk (Gemini 流式返回的是完整的 JSON 数组片段？需确认 processStream 逻辑)
                    // processStream 中 Gemini 解析是在循环外的，假设 accumulatedChunk 是完整的 JSON 数组
                    // 但如果 accumulatedChunk 是多个 JSON 对象的拼接（如 OpenAI 格式），JSON.parse 会失败。
                    // 这里假设 processStream 的逻辑是正确的：
                    const parsedStream = JSON.parse(accumulatedChunk);
                    buffer = parsedStream.map(item => item.candidates?.[0]?.content?.parts?.[0]?.text || "").join('');
                } catch (e) {
                    console.error("Error parsing Gemini stream:", e, "Chunk:", accumulatedChunk);
                    // 兜底：如果解析失败，可能是因为 accumulatedChunk 包含了 OpenAI 格式的数据（如果用户选错 provider）
                    // 尝试用 OpenAI 逻辑解析一下？
                    // 暂时不加，保持与 processStream 一致
                }
            }

            console.log('[VideoCall] Final Buffer:', buffer);

            // === CoT 处理：补全开头，提取思考，净化输出 ===
            if (cotEnabled && buffer) {
                // 1. 补全开头 (如果被 Prefill 吃掉)
                if (!buffer.trim().startsWith('<thinking>') && buffer.includes('</thinking>')) {
                    buffer = '<thinking>' + buffer;
                }
                
                // 2. 提取并移除思考内容
                const thinkingMatch = buffer.match(/<thinking>([\s\S]*?)<\/thinking>/);
                if (thinkingMatch) {
                    const thinkingContent = thinkingMatch[1];
                    console.log('[VideoCall CoT] Thinking:', thinkingContent);
                    // 移除思考标签及内容
                    buffer = buffer.replace(/<thinking>[\s\S]*?<\/thinking>/, "").trim();
                }
                
                // 3. 移除 [incipere] (如果有残留)
                buffer = buffer.replace(/\[incipere\]/g, "");
            }

            // 流结束后一次性回调
            onStreamUpdate(buffer);
            return buffer;
        }
    } catch (e) {
        console.error("Call API Error:", e);
        showToast("通话连接不稳定...");
        return null;
    }
}

async function generateCallSummary(chat, callContext) {
    // === 使用总结API（如果已配置）===
    let apiConfig;
    if (db.summaryApiSettings && db.summaryApiSettings.url && db.summaryApiSettings.key && db.summaryApiSettings.model) {
        apiConfig = db.summaryApiSettings;
    } else {
        apiConfig = db.apiSettings;
    }
    
    let {url, key, model, provider} = apiConfig;
    if (!url || !key || !model) return null;
    if (url.endsWith('/')) url = url.slice(0, -1);

    // 获取世界书（包含全局）
    let isOfflineNode = false;
    if (chat.activeNodeId && chat.nodes) {
        const activeNode = chat.nodes.find(n => n.id === chat.activeNodeId);
        if (activeNode) {
            let baseMode = (activeNode.customConfig && activeNode.customConfig.baseMode) ? activeNode.customConfig.baseMode : 
                           (activeNode.type === 'offline' || (activeNode.type === 'spinoff' && activeNode.spinoffMode === 'offline') ? 'offline' : 'online');
            if (baseMode === 'offline') {
                isOfflineNode = true;
            }
        }
    }
    let associatedIds = chat.worldBookIds || [];
    if (isOfflineNode) {
        associatedIds = (chat.offlineWorldBookIds && chat.offlineWorldBookIds.length > 0) ? chat.offlineWorldBookIds : (chat.worldBookIds || []);
    }
    const globalBooks = db.worldBooks.filter(wb => wb.isGlobal && !wb.disabled);
    const globalIds = globalBooks.map(wb => wb.id);
    const allBookIds = [...new Set([...associatedIds, ...globalIds])];
    
    const worldBooksBefore = allBookIds.map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'before')).filter(wb => wb && !wb.disabled).map(wb => wb.content).join('\n');
    const worldBooksMiddle = allBookIds.map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'middle')).filter(wb => wb && !wb.disabled).map(wb => wb.content).join('\n');
    const worldBooksAfter = allBookIds.map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'after')).filter(wb => wb && !wb.disabled).map(wb => wb.content).join('\n');

    // 获取回忆日记
    const favoritedJournals = (chat.memoryJournals || [])
        .filter(j => j.isFavorited)
        .map(j => `标题：${j.title}\n内容：${j.content}`)
        .join('\n\n---\n\n');

    let prompt = `请根据以下背景信息和通话记录，生成一段简短的聊天记录总结。\n\n`;

    prompt += `<char_settings>\n`;
    prompt += `角色名：${chat.realName}\n`;
    prompt += `角色设定：${getEffectivePersona(chat) || "无"}\n`;
    if (worldBooksBefore) prompt += `${worldBooksBefore}\n`;
    if (worldBooksMiddle) prompt += `${worldBooksMiddle}\n`;
    if (worldBooksAfter) prompt += `${worldBooksAfter}\n`;
    prompt += `</char_settings>\n\n`;

    prompt += `<user_settings>\n`;
    prompt += `用户称呼：${chat.myName}\n`;
    prompt += `用户人设：${chat.myPersona || "无"}\n`;
    prompt += `</user_settings>\n\n`;

    if (favoritedJournals) {
        prompt += `<memoir>\n`;
        prompt += `【共同回忆】\n${favoritedJournals}\n`;
        prompt += `</memoir>\n\n`;
    }

    prompt += `通话记录：\n`;
    prompt += `${callContext.map(m => `${m.role === 'ai' ? chat.realName : chat.myName} (${m.type}): ${m.content}`).join('\n')}\n\n`;

    prompt += `要求：\n`;
    prompt += `1. 第三人称叙述。\n`;
    prompt += `2. **客观平实**：使用第三人称视角，客观陈述事实。**绝对禁止使用强烈的情绪词汇**（如“极度愤怒”、“痛彻心扉”、“欣喜若狂”等），保持冷静、克制的叙述风格。\n`;
    prompt += `3. **无升华**：不要进行价值升华、感悟或总结性评价，仅记录发生了什么。\n`;
    prompt += `4. 不要包含“通话记录如下”等废话，直接输出总结内容。\n`;

    const messages = [{role: 'user', content: prompt}];
    
    const requestBody = {
        model: model,
        messages: messages,
        stream: false
    };
    
    if (provider === 'gemini') {
         requestBody.contents = [{role: 'user', parts: [{text: prompt}]}];
         delete requestBody.messages;
    }

    const endpoint = (provider === 'gemini') ? `${url}/v1beta/models/${model}:generateContent?key=${getRandomValue(key)}` : `${url}/v1/chat/completions`;
    const headers = (provider === 'gemini') ? {'Content-Type': 'application/json'} : {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
    };

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
        });
        const data = await response.json();
        let text = "";
        if (provider === 'gemini') {
            text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        } else {
            text = data.choices[0].message.content;
        }
        return text.trim();
    } catch (e) {
        console.error("Summary API Error:", e);
        return null;
    }
}
