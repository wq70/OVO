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
            if (typeof saveCharacter === 'function') saveCharacter(controllingChar.id);
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
                    if (typeof saveCharacter === 'function') saveCharacter(controllingChar.id);
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
                if (typeof saveCharacter === 'function') saveCharacter(controllingChar.id);
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
                if (typeof saveCharacter === 'function') saveCharacter(controllingChar.id);
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
                if (typeof saveCharacter === 'function') saveCharacter(controllingChar.id);
                if (typeof saveCharacter === 'function' && found.chatType === 'private') saveCharacter(found.chatId);
                if (typeof saveGroup === 'function' && found.chatType === 'group') saveGroup(found.chatId);
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

function extractThinkingBlocks(response) {
    const blocks = [];
    const content = String(response || '').replace(/<(thinking|think)>([\s\S]*?)<\/\1>/gi, (_, tag, body) => {
        blocks.push(body);
        return '';
    });
    if (/^\s*<(?:thinking|think)>/i.test(content)) {
        console.warn('[CoT] 思考标签未闭合，无法安全分离思考与回复');
    }
    return {
        content,
        thinking: blocks.length ? `<thinking>${blocks.join('\n\n')}</thinking>` : ''
    };
}

async function handleAiReplyContent(fullResponse, chat, targetChatId, targetChatType, isBackground = false, isCharBlockedMonologue = false, replyOptions = {}) {
    const originalResponse = fullResponse;
    const protectedPages = fullResponse && window.InteractiveMessages?.protectResponse(fullResponse);
    if (protectedPages) fullResponse = protectedPages.text;
    const forcedMember = targetChatType === 'group' && replyOptions.memberId ? chat.members.find(member => member.id === replyOptions.memberId) : null;
    if (replyOptions.memberId && !forcedMember) throw new Error('发言成员已不存在');
    if (replyOptions.shouldStop?.()) return;
    if (forcedMember) fullResponse = window.MemberApiRuntime.guardCommands(fullResponse, forcedMember);
    const findReplyMember = name => forcedMember
        ? [forcedMember.realName, forcedMember.groupNickname].includes(name) ? forcedMember : null
        : chat.members.find(member => member.realName === name || member.groupNickname === name);
    const rawResponse = originalResponse;
    const saveReplyTargetChat = async () => {
        if (targetChatType === 'group' && typeof saveGroup === 'function') return saveGroup(targetChatId);
        if (targetChatType === 'private' && typeof saveCharacter === 'function') return saveCharacter(targetChatId);
        if (typeof saveCurrentChat === 'function' && currentChatId === targetChatId && currentChatType === targetChatType) return saveCurrentChat();
    };
    if (fullResponse) {
        if (chat._cotTagStart && chat._cotTagEnd && chat._cotTagStart !== '<thinking>') {
            fullResponse = fullResponse.split(chat._cotTagStart).join('<thinking>').split(chat._cotTagEnd).join('</thinking>');
        }
        // 1. 移除 [incipere] 标签
        fullResponse = fullResponse.replace(/\[incipere\]/g, "");

        // 1.4 角色掌控模式：解析并执行 [phone-control:...] 指令，并从展示内容中移除
        if (targetChatType === 'private') {
            const char = db.characters.find(c => c.id === targetChatId);
            const pcResult = executePhoneControlCommands(fullResponse, char);
            if (pcResult.executed) fullResponse = pcResult.cleaned;
            
            if (fullResponse.includes('[同意关闭]')) {
                fullResponse = fullResponse.replace(/\[同意关闭\]/g, '').replace(/\n{3,}/g, '\n\n').trim();
                if (char && char.phoneControlEnabled) {
                    char.phoneControlEnabled = false;
                    if (typeof showToast === 'function') showToast('TA已同意，权限已关闭');
                    if (typeof loadSettingsToSidebar === 'function') setTimeout(loadSettingsToSidebar, 100);
                }
            } else if (fullResponse.includes('[拒绝关闭]')) {
                fullResponse = fullResponse.replace(/\[拒绝关闭\]/g, '').replace(/\n{3,}/g, '\n\n').trim();
                if (typeof showToast === 'function') showToast('TA拒绝了关闭权限的请求');
            }
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
                await window.AvatarSystem.executeAvatarActions(avatarResult.actions, targetChatId);
            }
        }

        // 1.7 捕获并分离 <thinking>/<think> 内容，先于摘要提取处理
        const extractedThinking = extractThinkingBlocks(fullResponse);
        if (extractedThinking.thinking) {
            const thinkingContent = extractedThinking.thinking;
            if (chat._cotDisplayMode !== 'hidden') {
            // 创建思考过程消息对象
            const thinkingMsg = {
                id: `msg_${Date.now()}_${Math.random()}`,
                role: 'assistant',
                content: thinkingContent,
                timestamp: Date.now(),
                isThinking: true,
                isContextDisabled: true, // 【关键】标记为不进入上下文
                thinkingDisplay: chat._cotDisplayMode || ''
            };
            if (forcedMember) thinkingMsg.senderId = forcedMember.id;
            
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
            }
            // 从即将显示的文本中移除思考内容
            fullResponse = extractedThinking.content;
        }

        // 在思考与互动页面分离后执行资料修改，且先于拍一拍应用新的后缀。
        if (window.CharacterProfile) {
            const profileResult = await window.CharacterProfile.consumeAiCommands(fullResponse, chat, targetChatType, replyOptions.shouldStop);
            fullResponse = profileResult.cleaned;
            if (!profileResult.ok) return false;
            profileResult.messages.forEach(message => addMessageBubble(message, targetChatId, targetChatType));
        }

        // 1.75 在思考内容移除后再提取拍一拍，避免误执行思维链中的示例。
        if (window.PokeSystem) {
            const pokeResult = window.PokeSystem.consumeAiCommands(fullResponse, chat, targetChatType);
            fullResponse = pokeResult.cleaned;
            pokeResult.messages.forEach(message => {
                addMessageBubble(message, targetChatId, targetChatType);
                window.PokeSystem.playFeedback(message, chat);
            });
        }

        if (targetChatType === 'private' && window.Moments && typeof window.Moments.consumeAiCommands === 'function') {
            const momentsResult = await window.Moments.consumeAiCommands(fullResponse, chat, isBackground);
            fullResponse = momentsResult.cleaned;
            if (momentsResult.errors.length) fullResponse += `\n[系统提示：动态操作未完成：${momentsResult.errors.join('；')}]`;
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
        if (protectedPages) fullResponse = protectedPages.restore(fullResponse);
        console.log('【AI原始返回内容】:', rawResponse);
        let cleanedResponse = fullResponse.replace(/^\[system:.*?\]\s*/, '').replace(/^\(时间:.*?\)\s*/, '');
        const trimmedResponse = cleanedResponse.trim();
        let messages;

        if (window.InteractiveMessages?.extract(trimmedResponse)) {
            messages = [{ type: 'html', content: trimmedResponse, char: trimmedResponse.match(/^<uwuxjc\s+char=["']([^"']*)["']/i)?.[1] || null }];
        } else if (trimmedResponse.startsWith('<uwuxjc>') && trimmedResponse.endsWith('</uwuxjc>')) {
            messages = [{ type: 'html', content: trimmedResponse }];
        } else {
            messages = getMixedContent(fullResponse).filter(item => item.content.trim() !== '');
        }

        let firstMessageProcessed = false;

        for (const item of messages) {
            if (replyOptions.shouldStop?.()) break;
            if (forcedMember) {
                if (!window.MemberApiRuntime.allowedItem(item, forcedMember, chat)) continue;
                item.content = item.content.replace(/^\[unknown的消息[：:]/, `[${forcedMember.realName}的消息：`);
                if (item.type !== 'html' && !item.char && !/^\[/.test(item.content.trim())) item.content = `[${forcedMember.realName}的消息：${item.content}]`;
                if (item.type === 'html') item.char = forcedMember.realName;
            }
            if (item.type === 'html' && window.InteractiveMessages?.extract(item.content)) {
                const sender = targetChatType === 'group' ? findReplyMember(item.char || '') : null;
                if (targetChatType === 'group' && !sender) continue;
                const message = {
                    id: `msg_${Date.now()}_${Math.random()}`, role: 'assistant',
                    content: item.content.trim(), parts: [{ type: 'html', text: item.content.trim() }],
                    timestamp: Date.now(), ...(sender ? { senderId: sender.id } : {})
                };
                try { window.InteractiveMessages.apply(message, item.content); }
                catch (error) { showToast(error.message); continue; }
                if (isCharBlockedMonologue) message.sentWhileCharBlocked = true;
                chat.history.push(message);
                addMessageBubble(message, targetChatId, targetChatType);
                firstMessageProcessed = true;
                continue;
            }
            // 自动剔除不存在的表情包
            const stickerRegex = /\[(?:.*?的)?表情包[：:](.+?)\]/i;
            const stickerMatch = item.content.match(stickerRegex);
            if (stickerMatch) {
                let stickerName = stickerMatch[1].trim();
                // 剔除AI可能带上的 (画面:xxx) 的后缀
                const descIndex = stickerName.indexOf('(画面:');
                if (descIndex !== -1) {
                    stickerName = stickerName.substring(0, descIndex).trim();
                }
                // 兼容部分 AI 可能生成全角括号的情况 （画面：xxx）
                const descIndexFull = stickerName.indexOf('（画面:');
                if (descIndexFull !== -1) {
                    stickerName = stickerName.substring(0, descIndexFull).trim();
                }
                const descIndexFull2 = stickerName.indexOf('（画面：');
                if (descIndexFull2 !== -1) {
                    stickerName = stickerName.substring(0, descIndexFull2).trim();
                }
                const descIndexFull3 = stickerName.indexOf('(画面：');
                if (descIndexFull3 !== -1) {
                    stickerName = stickerName.substring(0, descIndexFull3).trim();
                }

                let targetSticker = null;
                if (targetChatType === 'private') {
                    targetSticker = getAvailablePrivateStickers(chat).find(s => s.name === stickerName);
                } else {
                    const groups = (chat.stickerGroups || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
                    if (groups.length > 0) {
                        targetSticker = db.myStickers.find(s => groups.includes(s.group) && s.name === stickerName);
                    }
                    // 群聊保留原有的全库兜底。
                    if (!targetSticker) targetSticker = db.myStickers.find(s => s.name === stickerName);
                }
                
                // 3. 如果完全找不到，则剔除该消息
                if (!targetSticker) {
                    console.log(`[Auto-Filter] 剔除不存在的表情包: ${stickerName}`);
                    continue; 
                }
                if (targetChatType === 'private') item.stickerData = targetSticker.data;
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
                if (char && char.characterPayRequestEnabled === false && /\[.*?向.*?发起了代付请求[：:]/.test(item.content)) {
                    console.warn('[WalletSystem] 已拦截角色设置禁止的代付请求');
                    continue;
                }
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

                        const storedLimit = char.statusPanel.historyRetentionLimit;
                        const retentionLimit = Number.isSafeInteger(storedLimit) && storedLimit >= 0 ? storedLimit : 20;
                        // 数量阈值仅提醒；旧状态由用户在整理页手动勾选清理。
                        if (retentionLimit > 0 && char.statusPanel.history.length === retentionLimit + 1) {
                            showToast('状态栏历史已超过参考数量，可在存储分析中手动整理');
                        }

                        char.statusPanel.currentStatusRaw = rawStatus;
                        char.statusPanel.currentStatusHtml = html;
                        
                        item.isStatusUpdate = true;
                        item.statusSnapshot = window.StatusStorage ? window.StatusStorage.makeSnapshot(char, pattern) : {
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
                            await saveReplyTargetChat();
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
                if (replyOptions.shouldStop?.()) break;
                
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
                    const sender = findReplyMember(characterName);
                    if (sender) {
                        message.senderId = sender.id;
                    }
                }

                chat.history.push(message);
                addMessageBubble(message, targetChatId, targetChatType);
                
                setTimeout(async () => {
                    message.isWithdrawn = true;
                    message.content = `[${characterName}撤回了一条消息：${originalContent}]`;
                    
                    await saveReplyTargetChat();
                    
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
                    if (item.stickerData) {
                        const finalStickerMatch = finalContent.match(stickerRegex);
                        if (finalStickerMatch) {
                            const finalStickerName = finalStickerMatch[1].trim();
                            const finalSticker = getAvailablePrivateStickers(chat).find(s => s.name === finalStickerName);
                            if (!finalSticker) continue;
                            message.stickerData = finalSticker.data;
                        }
                    }
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
                        if (typeof createReceivedFamilyCard === 'function') {
                            const card = createReceivedFamilyCard({ fromCharId: character.id, fromCharName: character.realName || '', limit, refreshPeriod, refreshDays, status: 'pending' });
                            message.receivedFamilyCardId = card.id;
                            message.receivedFamilyCardStatus = 'pending';
                        }
                    }

                    if (window.WalletSystem && typeof window.WalletSystem.executeCharacterPurchase === 'function') {
                        const purchaseResult = await window.WalletSystem.executeCharacterPurchase(character, message);
                        if (purchaseResult && !purchaseResult.ok) {
                            message.shopPaymentStatus = 'failed';
                            message.shopPaymentError = purchaseResult.reason || '订单未完成';
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
                            const sender = findReplyMember(senderName);
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
                    const sender = findReplyMember(actorName);
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
                    const sender = findReplyMember(senderName);
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
                    const sender = findReplyMember(senderName);
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

        if (await saveReplyTargetChat() === false) return false;
        if (window.WalletSystem && typeof window.WalletSystem.persist === 'function') {
            await window.WalletSystem.persist([targetChatId]);
        }
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
        if (!replyOptions.suppressAutoTasks && typeof checkAndTriggerAutoJournal === 'function') {
            setTimeout(() => checkAndTriggerAutoJournal(chat), 500);
        }
        if (!replyOptions.suppressAutoTasks && typeof checkAndTriggerAutoTableUpdate === 'function') {
            setTimeout(() => checkAndTriggerAutoTableUpdate(chat), 650);
        }
        if (!replyOptions.suppressAutoTasks && typeof checkAndTriggerVectorMemory === 'function') {
            setTimeout(() => checkAndTriggerVectorMemory(chat), 800);
        }

        // 角色主动生成小剧场（仅私聊，按概率触发）
        // 直接调用，无延迟——generateCharTheater 内部会立即推送通知气泡
        if (targetChatType === 'private' && replyOptions.backgroundReason !== 'followUp' && typeof maybeGenerateCharTheater === 'function') {
            maybeGenerateCharTheater(targetChatId);
        }
    }
}

async function handleRegenerate() {
    if (isGenerating) return;

    const chat = (currentChatType === 'private')
        ? db.characters.find(c => c.id === currentChatId)
        : db.groups.find(g => g.id === currentChatId);
    if (currentChatType === 'group' && window.MemberApiRuntime?.isIndependent(chat)) return window.MemberApiRuntime.regenerate(chat);

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
                    parts: chat.history[i].parts ? JSON.parse(JSON.stringify(chat.history[i].parts)) : undefined,
                    interactive: chat.history[i].interactive ? JSON.parse(JSON.stringify(chat.history[i].interactive)) : undefined
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

    await saveCurrentChat();
    
    currentPage = 1; 
    renderMessages(false, true); 

    await getAiReply(currentChatId, currentChatType);
}

/** 将偷看记录中的单条应用内容格式化为可读摘要，供系统提示使用 */
