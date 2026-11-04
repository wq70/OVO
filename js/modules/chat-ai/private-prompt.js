function generatePrivateSystemPrompt(character, opts) {
    const base = generatePrivateSystemPromptBase(character, opts);
    const profile = window.CharacterProfile?.prompt(character);
    const contactMemory = window.PeekMemory?.prompt(character);
    return [base, profile && !base.includes(profile) ? profile : '',
        contactMemory && !base.includes('<peek_contact_memory>') ? contactMemory : ''].filter(Boolean).join('\n\n');
}

function generatePrivateSystemPromptBase(character, opts) {
    const includeMomentsActivity = window.Moments?.isChatLinked?.(character.id) !== false;
    const includeOnlineStatus = character.onlineStatusPromptEnabled !== false;
    opts = opts || {};
    if (window.PromptStudio && typeof window.PromptStudio.compile === 'function') {
        const studioResult = window.PromptStudio.compile(character, opts);
        if (studioResult && studioResult.prompt) {
            return studioResult.prompt;
        }
    }
    const linkedChar = (character.source === 'forum' && character.linkedCharId && db.characters)
        ? db.characters.find(c => c.id === character.linkedCharId) : null;
    const effectiveChar = linkedChar || character;

    let { before: worldBooksBefore, middle: worldBooksMiddle, after: worldBooksAfter } = getActiveWorldBooksContents(character);
    
    const now = new Date();
    let currentTime = `${now.getFullYear()}年${pad(now.getMonth() + 1)}月${pad(now.getDate())}日 ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    if (character.enableDynamicTimezone && character.charTimezone) {
        const tzTime = getLocalTimeInTimezone(character.charTimezone);
        if (tzTime) currentTime = tzTime;
    }

    // 检查角色是否有专属的自定义提示词，或者全局是否开启了自定义提示词
    let useCustomPrompt = false;
    let template = '';
    const customPromptReference = character.customPromptPresetId || character.customPromptPreset;
    if (customPromptReference && db.magicRoom && db.magicRoom.presets) {
        const preset = db.magicRoom.presets.find(p => p.id === customPromptReference || p.name === customPromptReference);
        if (preset) {
            useCustomPrompt = true;
            template = preset.template;
        }
    }
    
    if (!useCustomPrompt && db.magicRoom && db.magicRoom.customPromptEnabled && db.magicRoom.customPromptTemplate) {
        useCustomPrompt = true;
        template = db.magicRoom.customPromptTemplate;
    }

    // 处理用户自定义的底层系统提示词模板
    if (useCustomPrompt && template) {
        const momentsInTemplate = template.includes('{{动态能力与已看内容}}');
        
        // 构建共同回忆字符串
        let commonMemories = '';
        if (character.memoryMode === 'table' && typeof getMemoryTableContextBlock === 'function') {
            commonMemories = getMemoryTableContextBlock(character) || '';
        } else if (character.memoryMode === 'vector' && typeof getVectorMemoryContextBlock === 'function') {
            commonMemories = getVectorMemoryContextBlock(character) || '';
        } else {
            let favoritedJournals = (character.memoryJournals || [])
                .filter(j => j.isFavorited)
                .map(j => `标题：${j.title}\n内容：${j.content}`)
                .join('\n\n---\n\n');
            if (favoritedJournals) {
                commonMemories = `【共同回忆】\n这是你需要长期记住的、我们之间发生过的往事背景：\n${favoritedJournals}`;
            }
        }
        
        // 构建群聊记忆互通字符串
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
                    commonMemories += `\n【群聊记忆互通】\n以下是你所在群聊的相关背景信息，这些信息可以帮助你更好地理解我们之间的对话上下文：${groupMemoryContext}`;
                }
            }
        }

        // 构建在线逻辑规则
        let onlineLogicRules = getOnlineLogicRules(character, 4);

        // 构建输出格式
        let outputFormats = getOnlineOutputFormats(character, worldBooksBefore, worldBooksAfter);

        // 替换变量
        if (window.PromptStudio && typeof window.PromptStudio.buildVariables === 'function') {
            const studioVariables = window.PromptStudio.buildVariables(character, opts);
            template = window.PromptStudio.renderTemplate(template, studioVariables, new Set());
        }
        template = template.replace(/\{\{当前时间\}\}/g, currentTime);
        template = template.replace(/\{\{世界书_前\}\}/g, worldBooksBefore || '');
        template = template.replace(/\{\{世界书_中\}\}/g, worldBooksMiddle || '');
        template = template.replace(/\{\{世界书_后\}\}/g, worldBooksAfter || '');
        template = template.replace(/\{\{角色名\}\}/g, character.realName || '');
        template = template.replace(/\{\{用户称呼\}\}/g, character.myName || '');
        if (!includeOnlineStatus) {
            template = template.replace(/你的当前状态是[：:]\s*\{\{\s*角色状态\s*\}\}[。.]?/g, '');
        }
        template = template.replace(/\{\{\s*角色状态\s*\}\}/g, includeOnlineStatus ? character.status || '在线' : '');
        template = template.replace(/\{\{角色人设\}\}/g, getEffectivePersona(character) || '');
        template = template.replace(/\{\{用户人设\}\}/g, character.myPersona || '');
        template = template.replace(/\{\{共同回忆\}\}/g, commonMemories || '');
        template = template.replace(/\{\{在线逻辑规则\}\}/g, onlineLogicRules || '');
        template = template.replace(/\{\{输出格式\}\}/g, outputFormats || '');
        template = template.replace(/\{\{天气信息\}\}/g, opts.weatherText || '');

        if (character.pokeEnabled && character.pokeAllowCharacterInitiated !== false) {
            template += `\n【拍一拍】当历史中出现“拍一拍事件”时，请结合关系和当前语境自然反应，可回拍、简短回应或不说话。拍一拍是低频轻互动，不得每轮使用，不计入普通回复条数，单轮最多2次。\n`;
        }

        if (opts.weatherText && !template.includes('<environment>')) {
             template += opts.weatherText;
        }

        // 补充必要的结尾和选项（如双语、自知等）
        if (character.bilingualModeEnabled) {
            template += `\n✨双语模式特别指令✨：当你的角色的母语为中文以外的语言时（优先使用${character.bilingualLanguage || '符合人设的外语'}），你的消息回复**必须**严格遵循双语模式下的普通消息格式：[${character.realName}的消息：{外语原文}「中文翻译」],例如: [${character.realName}的消息：Of course, I'd love to.「当然，我很乐意。」],中文翻译文本视为系统自翻译，不视为角色的原话;当你的角色想要说中文时，需要根据你的角色设定自行判断对于中文的熟悉程度来造句，并使用普通消息的标准格式: [${character.realName}的消息：{中文消息内容}] 。**语音消息**在双语模式下也须使用相同格式：[${character.realName}的语音：{外语原文}「中文翻译」]，例如：[${character.realName}的语音：Of course, I'd love to.「当然，我很乐意。」]。这条规则的优先级非常高，请务必遵守。\n`;
        }
        
        if (character.replyCountEnabled) {
            const minReply = character.replyCountMin || 3;
            const maxReply = character.replyCountMax || 8;
            template += `\n<Chatting Guidelines>\n17. **对话节奏**: 你需要模拟真人的聊天习惯，你可以一次性生成多条短消息。每次回复消息条数**必须**严格限定在**${minReply}-${maxReply}条以内**，**关键规则**：请保持回复消息数量的**随机性和多样性**。**除非**你的设定偏向活跃或情绪波动大或是特殊情况下，否则**不要**触碰 ${maxReply} 条的上限。\n`;
        } else {
            template += `\n<Chatting Guidelines>\n17. **对话节奏**: 你需要模拟真人的聊天习惯，你可以一次性生成多条短消息。每次回复3-8条消息之内，**关键规则**：请保持回复消息数量的**随机性和多样性**。\n`;
        }
        template += `18. **特殊消息格式的使用原则**：(1)请把语音、撤回、转账、商城互动、${includeOnlineStatus ? '更新状态、' : ''}引用、定位等特殊格式视为增强互动的“调味剂”，遵循**自然、主动、多样化触发逻辑。同种格式不要重复频繁发送，不同格式不要用户不提就一直不发**。\n(2)注意在本回合消息列里，特殊消息插入位置的随机性，每轮必须和上一回合插入位置不同。\n`;
        template += `19. 🌟**防复读对话**🌟：在本轮回复中，你**必须**区别于过往聊天记录而去变换句式和词汇，**绝对不要**重复或模仿历史记录中的文本结构，保持自然、随机和多样性。\n`;
        template += `</Chatting Guidelines>\n`;
        template += `20. 不要主动终止聊天进程，除非我明确提出。保持你的人设，自然地进行对话。`;

        if (character.characterAutoFavoriteEnabled) {
            template += `\n\n【消息收藏功能】\n你可以主动收藏用户发送的重要消息，以便日后回顾。在 <think> 中可先思考是否需要收藏。\n\n**使用方法**：在回复中加入指令 [FAVORITE:消息ID:收藏寄语]。每条用户消息在上下文中以 [id:消息ID] 标注在消息开头，请使用该 ID。\n\n**收藏标准**：用户分享的重要个人信息（梦想、价值观、经历）、情感转折点的关键对话、用户明确表达的喜好或厌恶、对建立深层关系有帮助的信息。只收藏用户的消息，不要过度收藏，寄语简短精炼（20字以内）。静默收藏，不要在对话中提及收藏行为。\n\n**示例**：若决定收藏某条用户消息（其前有 [id:msg_123]），在回复中写 [FAVORITE:msg_123:他的童年梦想，反映核心价值观]，再写你的正常聊天内容。`;
        }

        if (character.charAwareUserFavorites) {
            const allFavs = db.favorites || [];
            let userFavs = allFavs.filter(f => f.favoriteBy === 'user');
            if (character.awareFavoriteScope !== 'all') {
                userFavs = userFavs.filter(f => f.chatId === character.id && f.chatType === 'private');
            }
            if (userFavs.length > 0) {
                let favText = '';
                userFavs.forEach(f => {
                    favText += `- 内容：${f.content || ''}`;
                    if (f.note) {
                        favText += ` （用户寄语：${f.note}）`;
                    }
                    favText += `\n`;
                });
                template += `\n\n【用户收藏的内容】\n这是用户在${character.awareFavoriteScope === 'all' ? '所有对话' : '与你的对话'}中主动收藏的消息内容，你可以借此了解用户的喜好和内心想法：\n${favText}`;
            }
        }

        if (opts && opts.historyText) {
            template += '\n' + opts.historyText;
        }

        if (!momentsInTemplate && window.Moments) template += window.Moments.promptForCharacter(character.id, !!opts.isBackground);
        return template;
    }

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
        if (character.myEnableDynamicAge && character.myBirthday) {
            const today = new Date();
            const birthDate = new Date(character.myBirthday);
            let age = today.getFullYear() - birthDate.getFullYear();
            const m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
            if (m === 0 && today.getDate() === birthDate.getDate()) {
                nodePrompt += `[System Notice] ✨重要✨ 与你对话的用户（称呼：${character.myName}）出生于${birthDate.getFullYear()}年${birthDate.getMonth() + 1}月${birthDate.getDate()}日，今天正是他/她的${age}岁生日！请在对话中自然地表现出你对这一点的知晓和关心。\n`;
            } else {
                nodePrompt += `[System Notice] 与你对话的用户（称呼：${character.myName}）出生于${birthDate.getFullYear()}年${birthDate.getMonth() + 1}月${birthDate.getDate()}日，现在的年龄是${age}岁。\n`;
            }
        }
        if (character.myEnableDynamicTimezone && character.myTimezone) {
            const timeStr = getLocalTimeInTimezone(character.myTimezone);
            if (timeStr) {
                nodePrompt += `[System Notice] 与你对话的用户（称呼：${character.myName}）当前所在的当地时间是：${timeStr} (${character.myTimezone})。\n`;
            }
        }
        nodePrompt += `</user_settings>\n\n`;
        
        nodePrompt += `<node_directive>\n${activeNode.prompt}\n</node_directive>\n\n`;
        
        if (activeNode.readMemory) {
            nodePrompt += `<memoir>\n`;
            const tableMemoryText = character.memoryMode === 'table' && typeof getMemoryTableContextBlock === 'function'
                ? getMemoryTableContextBlock(character)
                : (character.memoryMode === 'vector' && typeof getVectorMemoryContextBlock === 'function'
                    ? getVectorMemoryContextBlock(character)
                    : '');
            if (tableMemoryText) {
                nodePrompt += `${tableMemoryText}\n`;
            } else {
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

        if (character.statusPanel && character.statusPanel.enabled && character.statusPanel.promptSuffix) {
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

        if (activeNode.enableSummary) {
            nodePrompt += `\n【重要：剧情摘要】\n由于对话轮次较长可能导致记忆遗忘，你必须在每条回复的最后单独一行附带一段对当前剧情进展、最新地点环境、人物状态等关键信息的简要总结，格式严格为：<summary>当前地点是xxx，刚刚发生了xxx，双方状态是xxx</summary>。这段摘要将作为剧情推进的长期记忆锚点，绝对不能遗漏。\n`;
        }

        nodePrompt += `</output_formats>\n\n`;
        
        if (character.bilingualModeEnabled) {
            nodePrompt += `✨双语模式特别指令✨：当你的角色的母语为中文以外的语言时（优先使用${character.bilingualLanguage || '符合人设的外语'}），则在角色的话语/内心话后面加双语括号翻译，如：“Of course, I'd love to.「当然，我很乐意。」”但正常的动作/环境等描述性文本不用加翻译。当你的角色想要说中文时，需要根据你的角色设定自行判断对于中文的熟悉程度来造句，这条规则的优先级非常高，请务必遵守。\n`;
        }
        
        if (character.myName) {
            nodePrompt = nodePrompt.replace(/\{\{user\}\}/gi, character.myName);
        }
        
        if (opts && opts.historyText) {
            nodePrompt += '\n' + opts.historyText;
        }

        if (window.Moments) nodePrompt += window.Moments.promptForCharacter(character.id, !!opts.isBackground);
        return nodePrompt;
    }

    let prompt = `你正在一个名为“404”的线上聊天软件中扮演一个角色。请严格遵守以下规则：\n`;
    prompt += `核心规则：\n`;
    prompt += `A. 当前时间：现在是 ${currentTime}。你应知晓当前时间，但除非对话内容明确相关，否则不要主动提及或评论时间（例如，不要催促我睡觉）。\n`;
    
    if (character.enableDynamicAge && character.birthday) {
        const today = new Date();
        const birthDate = new Date(character.birthday);
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        if (m === 0 && today.getDate() === birthDate.getDate()) {
            prompt += `[System Notice] 你的出生日期是${birthDate.getFullYear()}年${birthDate.getMonth() + 1}月${birthDate.getDate()}日，今天是你${age}岁的生日，请在对话中自然地表现出这一点。\n`;
        } else {
            prompt += `[System Notice] 你的出生日期是${birthDate.getFullYear()}年${birthDate.getMonth() + 1}月${birthDate.getDate()}日，你现在的年龄是${age}岁。\n`;
        }
    }
    if (character.enableDynamicTimezone && character.charTimezone) {
        const timeStr = getLocalTimeInTimezone(character.charTimezone);
        if (timeStr) {
            prompt += `[System Notice] 你当前所在的当地时间是：${timeStr} (${character.charTimezone})。\n`;
        }
    }
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
    const statusPrompt = includeOnlineStatus ? `你的当前状态是：${character.status || '在线'}。` : '';
    prompt += `1. 你的角色名是：${character.realName}。我的称呼是：${character.myName}。${statusPrompt}\n`;
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
            let altBlock = '\n<alt_shared_memory>\n【小号记忆互通】你知道自己论坛小号发生的互动，但必须区分对方使用的论坛账号。除非已有掉马证据，不得把陌生小号直接认定为用户本人。以下为小号最近互动（最近' + syncLimit + '条）：\n\n';
            altForumUserIds.forEach(function(forumUserId) {
                const profile = db.forumStrangerProfiles && db.forumStrangerProfiles[forumUserId];
                const altName = (profile && profile.name) ? profile.name : (forumUserId.replace(/^npc_/, ''));
                const forumMsgs = (db.forumMessages || []).filter(function(m) {
                    return (m.fromUserId === 'user' && m.toUserId === forumUserId) || (m.fromUserId === forumUserId && m.toUserId === 'user');
                }).sort(function(a, b) { return (a.timestamp || 0) - (b.timestamp || 0); }).slice(-syncLimit);
                if (forumMsgs.length > 0) {
                    altBlock += '[论坛私信] 角色小号「' + altName + '」：\n';
                    forumMsgs.forEach(function(m) {
                        const accountId = m.accountId || 'main';
                        const account = typeof forumGetAccountById === 'function' ? forumGetAccountById(accountId) : null;
                        const accountLabel = account ? '论坛账号「' + (account.username || accountId) + '」' : '论坛账号「' + accountId + '」';
                        const from = m.fromUserId === 'user' ? accountLabel : '角色小号';
                        altBlock += '- ' + from + '：' + (m.content || '').trim().slice(0, 200) + (m.content && m.content.length > 200 ? '…' : '') + '\n';
                    });
                    altBlock += '\n';
                }
                const altChar = altChars.find(function(c) { return c.forumUserId === forumUserId; });
                if (altChar && altChar.history && altChar.history.length > 0) {
                    const recentAlt = altChar.history.filter(function(m) { return !m.isContextDisabled && (includeMomentsActivity || !m.isMomentsActivity); }).slice(-syncLimit);
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
        const mainRecent = linkedChar.history.filter(function(m) { return !m.isContextDisabled && (includeMomentsActivity || !m.isMomentsActivity); }).slice(-mainSyncLimit);
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
    if (character.myEnableDynamicAge && character.myBirthday) {
        const today = new Date();
        const birthDate = new Date(character.myBirthday);
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        if (m === 0 && today.getDate() === birthDate.getDate()) {
            prompt += `[System Notice] ✨重要✨ 与你对话的用户（称呼：${character.myName}）出生于${birthDate.getFullYear()}年${birthDate.getMonth() + 1}月${birthDate.getDate()}日，今天正是他/她的${age}岁生日！请在对话中自然地表现出你对这一点的知晓和关心。\n`;
        } else {
            prompt += `[System Notice] 与你对话的用户（称呼：${character.myName}）出生于${birthDate.getFullYear()}年${birthDate.getMonth() + 1}月${birthDate.getDate()}日，现在的年龄是${age}岁。\n`;
        }
    }
    if (character.myEnableDynamicTimezone && character.myTimezone) {
        const timeStr = getLocalTimeInTimezone(character.myTimezone);
        if (timeStr) {
            prompt += `[System Notice] 与你对话的用户（称呼：${character.myName}）当前所在的当地时间是：${timeStr} (${character.myTimezone})。\n`;
        }
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
        prompt += character.characterFamilyCardSpendingEnabled
            ? '这张卡的主人允许你主动使用，消费会从' + character.myName + '的存钱罐扣除。冻结、调额和收回由卡主人决定。\n</family_card_from_user>\n\n'
            : '你当前没有主动使用这张卡的权限，不得用它下单。冻结、调额和收回由卡主人决定。\n</family_card_from_user>\n\n';
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

    if (character.walletLedger && Array.isArray(character.walletLedger.transactions) && character.walletLedger.transactions.length) {
        const walletLines = character.walletLedger.transactions.slice(0, 8).map(item => {
            const sign = item.type === 'income' ? '+' : '-';
            return `${item.time ? new Date(item.time).toLocaleDateString('zh-CN') : ''} ${item.remark || '钱包交易'} ${sign}${item.amount || 0}元`;
        }).join('\n');
        prompt += '\n<character_wallet>\n';
        if (typeof character.walletLedger.balance === 'number') prompt += `你的当前钱包余额：${character.walletLedger.balance.toFixed(2)}元。\n`;
        prompt += `你的近期真实钱包流水：\n${walletLines}\n不要篡改这些已发生的交易。\n</character_wallet>\n\n`;
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

    const contactMemory = window.PeekMemory?.prompt(character);
    if (contactMemory) prompt += '\n' + contactMemory + '\n';

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
            prompt += '\n【重要指令】用户正在尝试关闭你对TA手机的查看与操控权限！你必须在回复中做出明确选择：\n' +
                      '如果同意关闭，必须包含标签 [同意关闭] ；如果拒绝关闭，必须包含标签 [拒绝关闭] （二者必选其一）。\n' +
                      '同时，无论同意还是拒绝，你都必须在给用户的回复中，根据你的人设表达出明确的态度和理由（如质问、生气、挽留、或爽快答应等），不可无视该请求继续闲聊。\n';
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
            if (!opts.preview) character.themeJustChangedByUser = '';
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
    const tableMemoryText = character.memoryMode === 'table' && typeof getMemoryTableContextBlock === 'function'
        ? getMemoryTableContextBlock(character)
        : (character.memoryMode === 'vector' && typeof getVectorMemoryContextBlock === 'function'
            ? getVectorMemoryContextBlock(character)
            : '');
    if (tableMemoryText) {
        prompt += `${tableMemoryText}\n`;
    } else {
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
    }
    prompt += `</memoir>\n\n`

    prompt += `<logic_rules>\n`
    prompt += getOnlineLogicRules(character, 4);
    prompt += `</logic_rules>\n\n`

    if (character.statusPanel && character.statusPanel.enabled && character.statusPanel.promptSuffix) {
        prompt += `15. 额外输出要求：${character.statusPanel.promptSuffix}\n`;
    }
    prompt += `<output_formats>\n`
    prompt += `16. 你的输出格式必须严格遵循以下格式：${getOnlineOutputFormats(character, worldBooksBefore, worldBooksAfter)}\n`;
    prompt += `</output_formats>\n`

    if (character.pokeEnabled && character.pokeAllowCharacterInitiated !== false) {
        prompt += `【拍一拍】你可以偶尔使用 [POKE:actor=${character.realName}|target=用户] 主动拍用户，也可用 [POKE:actor=${character.realName}|target=${character.realName}] 拍自己。当历史中出现“拍一拍事件”时，请结合关系和当前语境自然反应，可以回拍、简短回应或不说话。拍一拍是低频轻互动，不得每轮使用，不计入普通回复条数，单轮最多使用2次。\n`;
    }

    if (character.bilingualModeEnabled) {
        prompt += `✨双语模式特别指令✨：当你的角色的母语为中文以外的语言时（优先使用${character.bilingualLanguage || '符合人设的外语'}），你的消息回复**必须**严格遵循双语模式下的普通消息格式：[${character.realName}的消息：{外语原文}「中文翻译」],例如: [${character.realName}的消息：Of course, I'd love to.「当然，我很乐意。」],中文翻译文本视为系统自翻译，不视为角色的原话;当你的角色想要说中文时，需要根据你的角色设定自行判断对于中文的熟悉程度来造句，并使用普通消息的标准格式: [${character.realName}的消息：{中文消息内容}] 。**语音消息**在双语模式下也须使用相同格式：[${character.realName}的语音：{外语原文}「中文翻译」]，例如：[${character.realName}的语音：Of course, I'd love to.「当然，我很乐意。」]。这条规则的优先级非常高，请务必遵守。\n`;
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
    
    prompt += `18. **特殊消息格式的使用原则**：(1)请把语音、撤回、转账、商城互动、${includeOnlineStatus ? '更新状态、' : ''}引用、定位等特殊格式视为增强互动的“调味剂”，遵循**自然、主动、多样化触发逻辑。同种格式不要重复频繁发送，不同格式不要用户不提就一直不发**。\n(2)注意在本回合消息列里，特殊消息插入位置的随机性，每轮必须和上一回合插入位置不同。\n`;
    prompt += `19. 🌟**防复读对话**🌟：在本轮回复中，你**必须**区别于过往聊天记录而去变换句式和词汇，**绝对不要**重复或模仿历史记录中的文本结构，保持自然、随机和多样性。\n`;
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

    if (character.charAwareUserFavorites) {
        const allFavs = db.favorites || [];
        let userFavs = allFavs.filter(f => f.favoriteBy === 'user');
        
        if (character.awareFavoriteScope === 'all') {
            // 包含所有的收藏
        } else {
            // 仅当前角色
            userFavs = userFavs.filter(f => f.chatId === character.id && f.chatType === 'private');
        }
        
        if (userFavs.length > 0) {
            let favText = '';
            userFavs.forEach(f => {
                favText += `- 内容：${f.content || ''}`;
                if (f.note) {
                    favText += ` （用户寄语：${f.note}）`;
                }
                favText += `\n`;
            });
            prompt += `\n\n【用户收藏的内容】\n这是用户在${character.awareFavoriteScope === 'all' ? '所有对话' : '与你的对话'}中主动收藏的消息内容，你可以借此了解用户的喜好和内心想法：\n${favText}`;
        }
    }

    if (character.myName) {
        prompt = prompt.replace(/\{\{user\}\}/gi, character.myName);
    }

    if (opts && opts.weatherText) {
        prompt += '\n' + opts.weatherText;
    }

    if (opts && opts.historyText) {
        prompt += '\n' + opts.historyText;
    }

    if (window.Moments) prompt += window.Moments.promptForCharacter(character.id, !!opts.isBackground);
    return prompt;
}

// 根据文本估算 Token（汉字约 1.2，其他约 0.4，与 estimateChatTokens 一致）
