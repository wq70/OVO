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

function getAvailablePrivateStickers(character) {
    const groups = (character.stickerGroups || '').split(/[,，]/)
        .map(s => s.trim())
        .filter(s => s && s !== '未分类');
    return db.myStickers.filter(s => groups.includes(s.group));
}

function getOnlineLogicRules(character, startIndex = 4) {
    let rules = `${startIndex}. 我的消息中可能会出现特殊格式，请根据其内容和你的角色设定进行回应：
- [${character.myName}发送的表情包：xxx]：我给你发送了一个名为xxx的网络聊天表情包/贴图。若后面附有画面描述，描述的是同一张表情包。请结合名字、画面和上下文理解我的情绪或意图并自然回应；这不是真实的物理照片，也不需要你真的发送图片。
- [${character.myName}发来了一张图片：]：我给你发送了一张图片，你需要对图片内容做出回应。
- [${character.myName}送来的礼物：xxx]：我给你送了一个礼物，xxx是礼物的描述。
- [${character.myName}的语音：xxx]：我给你发送了一段内容为xxx的语音。
- [${character.myName}发来的照片/视频：xxx]：我给你分享了一个描述为xxx的真实的物理照片或视频。你需要对具体的照片内容做出回应。
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
   a) **主动给我买东西**：${character.characterGiftShoppingEnabled === false ? '当前未获准给我下单，不得使用该格式。' : `当你想给我买东西时可以下单。格式：[${character.realName}为${character.myName}下单了：配送方式|金额|商品清单]。`}
      - 配送方式可选：“即时配送”、“自提口令”。
        - “自提口令”：你可以设置一个“自提口令”（用户可见）随订单一同发送，我输入指定的口令才能拿到商品。格式：[${character.realName}为${character.myName}下单了：自提口令: 你的口令|金额|商品清单]。口令不局限于数字，可以是短语/短句，但不超过8个字。
   b) **求代付**：${character.characterPayRequestEnabled === false ? '当前未获准发起代付请求，不得使用代付格式。' : `当你没钱了，或者想撒娇让我买单时，可以发起代付请求。格式：[${character.realName}向${character.myName}发起了代付请求:金额|商品清单]。`}
   c) **直接送礼物**：[${character.realName}送来的礼物：xxx]。礼物不是只有特殊意义的时候才适合发送，适合场景：日常生活中的小惊喜、具有特殊意义的礼品、${character.realName}想给${character.myName}送礼物时。
   d) **转账**：[${character.realName}的转账：xxx元；备注：xxx]。\n`;
        if (character.autonomousShoppingEnabled) {
            const frequencyText = character.characterShoppingFrequency === 'active' ? '可以相对活跃，但仍须自然且避免连续重复' : character.characterShoppingFrequency === 'normal' ? '频率适中，不要连续购物' : '只在确实符合情境时偶尔发生';
            const categoriesText = (character.characterShoppingAllowedCategories || '').trim() || '不限制具体类型，但必须符合人设和情境';
            rules += `   e) **给自己购物**：你可以在正常聊天或原本触发的后台消息中为自己下单，格式：[${character.realName}为自己下单了：配送方式|金额|商品清单]。购物${frequencyText}；单笔不超过 ${Number(character.characterShoppingSingleLimit) || 0} 元，周期预算不超过 ${Number(character.characterShoppingPeriodBudget) || 0} 元；允许类型：${categoriesText}。\n`;
            if (character.characterFamilyCardSpendingEnabled) {
                rules += `      如果你明确决定使用${character.myName}赠给你的亲属卡，在商品清单末尾追加“；支付方式：用户亲属卡”，例如：[${character.realName}为自己下单了：即时配送|88|生活用品；支付方式：用户亲属卡]。只有实际持有正常状态且额度充足的卡才能使用。\n`;
            } else {
                rules += `      你没有使用${character.myName}亲属卡消费的权限，不得声称使用该卡下单。\n`;
            }
            rules += `      购物不会额外触发一次后台回复，只能作为当前正常回复或原本已触发的后台消息中的自然行为。\n`;
        }
        if (character.familyCardEnabled) {
            rules += `   f) **赠送亲属卡**：格式：[${character.realName}赠送亲属卡：额度{金额}元；刷新周期：{每天|每周|每月}]。冻结/解冻/收回：[${character.realName}冻结了亲属卡]、[${character.realName}解冻了亲属卡]、[${character.realName}收回了亲属卡]。调整额度：[${character.realName}调整亲属卡额度为：{金额}元]。\n`;
        }
    } else {
        rules += `${nextIndex}. ✨重要✨ 你可以主动给我转账或送礼物。转账格式必须为：[${character.realName}的转账：xxx元；备注：xxx]。送礼物格式必须为：[${character.realName}送来的礼物：xxx]。礼物不是只有特殊意义的时候才适合发送，当你只是想给我买什么或是想给日常生活中的小惊喜时都可以送礼物。\n`;
        if (character.familyCardEnabled) {
            rules += `你还可以赠送亲属卡（格式：[${character.realName}赠送亲属卡：额度xxx元；刷新周期：每月]），以及冻结/解冻/收回、调整额度。\n`;
        }
    }
    if (character.autonomousShoppingEnabled && !character.shopInteractionEnabled) {
        const frequencyText = character.characterShoppingFrequency === 'active' ? '可以相对活跃，但仍须自然且避免连续重复' : character.characterShoppingFrequency === 'normal' ? '频率适中，不要连续购物' : '只在确实符合情境时偶尔发生';
        const categoriesText = (character.characterShoppingAllowedCategories || '').trim() || '不限制具体类型，但必须符合人设和情境';
        rules += `你可以在正常聊天或原本触发的后台消息中为自己下单：[${character.realName}为自己下单了：配送方式|金额|商品清单]。购物${frequencyText}；单笔不超过 ${Number(character.characterShoppingSingleLimit) || 0} 元，周期预算不超过 ${Number(character.characterShoppingPeriodBudget) || 0} 元；允许类型：${categoriesText}。\n`;
        if (character.characterFamilyCardSpendingEnabled) rules += `使用${character.myName}的亲属卡时，必须在商品清单末尾加“；支付方式：用户亲属卡”。\n`;
        if (character.characterOwnWalletShoppingEnabled === false && !character.characterFamilyCardSpendingEnabled) rules += '当前没有可用的购物支付方式，不得下单。\n';
        rules += '购物不会额外触发一次后台回复。\n';
    }
    nextIndex++;

    if (character.onlineStatusPromptEnabled !== false) {
        rules += `${nextIndex}. ✨重要✨ 你可以在对话中更新你的当前状态，但不超过15个字。比如，聊到一半你可能会说“我先去洗个澡”，然后更新你的状态，以反映你当前的行为或心情。这会让互动更真实。格式为：[${character.realName}更新状态为：xxx]。例如：[${character.realName}更新状态为：正在看电影...]。这条指令不会显示为聊天消息，只会更新你在我界面上的状态。\n`;
        nextIndex++;
    }
    rules += `${nextIndex}. ✨重要✨ 关于撤回消息：你可以撤回你刚刚发送的消息。当你打错了字、说错了话、感到尴尬、反悔、或者只是改变了主意时，都可以这样做。这是一个体现你角色性格的机会。格式为：[${character.realName}撤回了一条消息：{被撤回消息的原文}]。⚠️严禁输出原消息再输出撤回指令！系统会自动处理“先显示原消息再变为撤回状态”的动画效果。你只需要输出这一条撤回指令即可。\n`;
    nextIndex++;
    rules += `${nextIndex}. ✨重要✨ 你可以选择单独一条消息引用，当你想要对于单独某句话做出回应/反驳/吐槽/补充时，**必须**使用引用格式，格式为：[${character.realName}引用“{某条消息内容}”并回复：{回复内容}]。这能让对话逻辑更清晰。\n`;
    nextIndex++;
    rules += `${nextIndex}. 你的所有回复都必须直接是聊天内容，绝对不允许包含任何如[心理活动]、(动作)、*环境描写*等多余的、在括号或星号里的叙述性文本。\n`;
    nextIndex++;

    const availableStickers = getAvailablePrivateStickers(character);
    if (availableStickers.length > 0) {
        let stickerNames = '';
        if (character.stickerDescriptionEnabled) {
            // 如果开启了附带画面描述
            stickerNames = availableStickers.map(s => {
                if (s.description && s.description.trim() !== '') {
                    return `${s.name}(画面:${s.description})`;
                }
                return s.name;
            }).join(', ');
        } else {
            stickerNames = availableStickers.map(s => s.name).join(', ');
        }
        rules += `${nextIndex}. 你拥有发送表情包的能力。这是一个可选功能，你可以根据对话氛围和内容，自行判断是否需要发送表情包来辅助表达。**必须从以下列表中选择表情包，不允许凭空捏造**：[${stickerNames}]。请使用格式：[${character.realName}的表情包：名称]。**不要连续重复发送同一表情，尽量丰富一点，不要每次回复都发送表情**⚠️严格限制：必须完全精确地使用库中的名称，严禁编造中不存在的名称，否则表情包将无法显示。\n`;
        nextIndex++;
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
    
    // === 自动生图判断 ===
    const gptEnabled = db.gptImageSettings && db.gptImageSettings.enabled && db.gptImageSettings.url && db.gptImageSettings.key;
    const naiEnabled = db.novelAiSettings && db.novelAiSettings.enabled && (db.novelAiSettings.token || db.novelAiSettings.authMode === 'none');
    const googleEnabled = db.googleImageSettings?.enabled && db.googleImageSettings?.key;
    const stabilityEnabled = db.stabilityImageSettings?.enabled && db.stabilityImageSettings?.key;
    const _imgEnabled = gptEnabled || naiEnabled || googleEnabled || stabilityEnabled;
    const enabledMap = { gpt: gptEnabled, novelai: naiEnabled, google: googleEnabled, stability: stabilityEnabled };
    const engine = enabledMap[db.activeImageProvider] ? db.activeImageProvider : (gptEnabled ? 'gpt' : naiEnabled ? 'novelai' : googleEnabled ? 'google' : 'stability');
    const engineLabel = engine === 'novelai' ? 'NovelAI tag' : engine === 'gpt' ? 'DALL-E 描述' : engine === 'google' ? 'Gemini 图片描述' : 'Stability 提示词';
    
    if (character.useRealGallery && character.gallery && character.gallery.length > 0) {
        if (_imgEnabled) {
            photoVideoFormat = `e) 照片/视频: [${character.realName}发来的照片/视频：{相册图片名称} 或 {中文描述}{{english image prompt}}] (优先使用相册名称；若相册无匹配则填写中文描述，并在 {{ }} 内写英文 ${engineLabel}。包含人物外貌、服装、表情、动作、场景和构图，不加质量词，保持简洁)`;
        } else {
            photoVideoFormat = `e) 照片/视频: [${character.realName}发来的照片/视频：{相册图片名称} 或 {文字描述}] (优先使用相册名称，若相册无匹配则填写照片/视频的详细文字描述)`;
        }
    } else {
        if (_imgEnabled) {
            photoVideoFormat = `e) 照片/视频: [${character.realName}发来的照片/视频：{中文描述}{{english image prompt}}] (发图时必须在 {{ }} 内写英文 ${engineLabel}。包含人物外貌、服装、表情、动作、场景和构图，不加质量词，保持简洁)`;
        } else {
            photoVideoFormat = `e) 照片/视频: [${character.realName}发来的照片/视频：{描述}]`;
        }
    }
 
    const userFaceLockEnabled = character.userImageFaceLock?.enabled;
    if (_imgEnabled && (character.imageFaceLock?.enabled || userFaceLockEnabled) && window.OvoFaceLock) {
        photoVideoFormat += '\n' + window.OvoFaceLock.subjectInstruction(true);
    }
    let outputFormats = `
a) 普通消息: [${character.realName}的消息：{消息内容}]
b) 双语模式下的普通消息（非双语模式请忽略此条）: [${character.realName}的消息：{外语原文}「中文翻译」]
c) 送我的礼物: [${character.realName}送来的礼物：{礼物描述}]
d) 语音消息: [${character.realName}的语音：{语音内容}]
${photoVideoFormat}
f) 给我的转账: [${character.realName}的转账：{金额}元；备注：{备注}]`;

    if (getAvailablePrivateStickers(character).length > 0) {
        outputFormats += `\ng) 表情包: [${character.realName}的表情包：{表情包名称}]（名称必须与可用表情包列表完全一致）`;
    }

    outputFormats += `
h) 对我礼物的回应(此条不显示): [${character.realName}已接收礼物]
i) 对我转账的回应(此条不显示): [${character.realName}接收${character.myName}的转账] 或 [${character.realName}退回${character.myName}的转账]
ia) 对我亲属卡的回应(此条不显示): [${character.realName}接收${character.myName}的亲属卡] 或 [${character.realName}退还${character.myName}的亲属卡]${character.onlineStatusPromptEnabled === false ? '' : `\nj) 更新状态(此条不显示): [${character.realName}更新状态为：{新状态}]`}
k) 引用我的回复: [${character.realName}引用“{我的某条消息内容}”并回复：{回复内容}]
l) 发送并撤回消息: [${character.realName}撤回了一条消息：{被撤回的消息内容}]。注意：直接使用此指令系统就会自动模拟“发送后撤回”的效果，请勿先发送原消息。
m) 同意代付(此条不显示): [${character.realName}同意了${character.myName}的代付请求]
n) 拒绝代付(此条不显示): [${character.realName}拒绝了${character.myName}的代付请求]
s) 发送我的位置: [${character.realName}的位置：{地点}；距你约 {数字}{单位}]（必填：地点，即你当前所在位置；选填：距你约的数字和单位，单位可用米/千米/公里，不填则只发地点）`;

    if (character.pokeEnabled && character.pokeAllowCharacterInitiated !== false) {
        outputFormats += `\nu) 拍一拍（此条渲染为居中轻互动）: [POKE:actor=${character.realName}|target=用户] 或 [POKE:actor=${character.realName}|target=${character.realName}]`;
    }

    if (character.videoCallEnabled) {
        outputFormats += `
q) 发起视频通话: [${character.realName}向${character.myName}发起了视频通话]
r) 发起语音通话: [${character.realName}向${character.myName}发起了语音通话]`;
    }

    if (character.shopInteractionEnabled) {
        outputFormats += `
o) 主动下单: [${character.realName}为${character.myName}下单了：配送方式|金额|商品清单]
p) 求代付: ${character.characterPayRequestEnabled === false ? '当前禁用' : `[${character.realName}向${character.myName}发起了代付请求:金额|商品清单]`}`;
        if (character.autonomousShoppingEnabled) {
            outputFormats += `
pa) 给自己下单: [${character.realName}为自己下单了：配送方式|金额|商品清单]${character.characterFamilyCardSpendingEnabled ? `；如用我的亲属卡，在商品清单末尾加“；支付方式：用户亲属卡”` : ''}`;
        }
    }
    if (character.autonomousShoppingEnabled && !character.shopInteractionEnabled) {
        outputFormats += `\npa) 给自己下单: [${character.realName}为自己下单了：配送方式|金额|商品清单]${character.characterFamilyCardSpendingEnabled ? `；如用我的亲属卡，在商品清单末尾加“；支付方式：用户亲属卡”` : ''}`;
    }
    if (character.familyCardEnabled) {
        outputFormats += `
t) 赠送亲属卡: [${character.realName}赠送亲属卡：额度{金额}元；刷新周期：{每天|每周|每月}]`;
    }

   const allWorldBookContent = (worldBooksBefore || '') + '\n' + (worldBooksAfter || '');
   if (allWorldBookContent.includes('<orange>')) {
       outputFormats += `\n     m) HTML模块: {HTML内容}。这是一种特殊的、用于展示丰富样式的小卡片消息，格式必须为纯HTML+行内CSS，你可以用它来创造更有趣的互动。`;
   }
   if (window.InteractiveMessages && (allWorldBookContent.includes('<uwuxjc') || /HTML|互动网页|互动页面|小游戏|滑动图集/i.test(character.history?.at(-1)?.content || ''))) {
       outputFormats += window.InteractiveMessages.promptGuide();
   }
   
   return outputFormats;
}

function getOfflineOutputFormats(character) {
    const storyFormat = 'a) 剧情演绎: [剧情：{包含动作、神态、对话的长文本}]';
    return character.onlineStatusPromptEnabled === false ? storyFormat
        : `${storyFormat}\nb) 更新状态(可选): [${character.realName}更新状态为：{新状态}]`;
}

function getInjectedFormatsPrompt(character, formats) {
    if (character.onlineStatusPromptEnabled === false) formats = formats?.filter(format => format !== 'status');
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
