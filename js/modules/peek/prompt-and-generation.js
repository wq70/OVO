function generatePeekContentPrompt(char, appType, mainChatContext, format = getPeekResponseFormat(char)) {
    const useJson = format === 'json';
    const example = xml => useJson ? JSON.stringify(parseXmlToJson(xml), null, 2) : xml;
    const appNameMapping = {
        messages: "消息应用（模拟与他人的对话）",
        memos: "备忘录应用",
        cart: "电商平台的购物车",
        transfer: "文件传输助手（用于记录临时想法、链接等）",
        browser: "浏览器历史记录",
        drafts: "邮件或消息的草稿箱"
    };
    const appName = appNameMapping[appType] || appType;

    let prompt = `你正在模拟一个名为 ${char.realName} 的角色的手机内部信息。`;
    prompt += `该角色的核心人设是：${char.persona}。\n`;

    // 收集关联的 + 全局的世界书（去重）
    let isOfflineNode = false;
    if (char.activeNodeId && char.nodes) {
        const activeNode = char.nodes.find(n => n.id === char.activeNodeId);
        if (activeNode) {
            let baseMode = (activeNode.customConfig && activeNode.customConfig.baseMode) ? activeNode.customConfig.baseMode : 
                           (activeNode.type === 'offline' || (activeNode.type === 'spinoff' && activeNode.spinoffMode === 'offline') ? 'offline' : 'online');
            if (baseMode === 'offline') {
                isOfflineNode = true;
            }
        }
    }
    let associatedIds = char.worldBookIds || [];
    if (isOfflineNode) {
        associatedIds = (char.offlineWorldBookIds && char.offlineWorldBookIds.length > 0) ? char.offlineWorldBookIds : (char.worldBookIds || []);
    }
    const globalBooks = db.worldBooks.filter(wb => wb.isGlobal && !wb.disabled);
    const globalIds = globalBooks.map(wb => wb.id);
    const allBookIds = [...new Set([...associatedIds, ...globalIds])];
    const associatedWorldBooks = allBookIds.map(id => db.worldBooks.find(wb => wb.id === id)).filter(wb => wb && !wb.disabled);
    if (associatedWorldBooks.length > 0) {
        const worldBookContext = associatedWorldBooks.map(wb => `设定名: ${wb.name}\n内容: ${wb.content}`).join('\n\n');
        prompt += `\n为了更好地理解背景，请参考以下世界观设定：\n---\n${worldBookContext}\n---\n`;
    }
    if (char.myPersona) {
        prompt += `\n作为参考，我（用户）的人设是：${char.myPersona}\n`;
    }

    prompt += `最近，我（称呼为 ${char.myName}）和 ${char.realName} 的对话如下（这是你们关系和当前状态的核心参考）：\n---\n${mainChatContext}\n---\n`;
    prompt += `现在，我正在偷看Ta手机上的“${appName}”。请你基于Ta的人设和我们最近的聊天内容，生成符合该应用场景的、高度相关且富有沉浸感的内容。\n`;
    prompt += useJson
        ? '你的输出必须是一个有效的 JSON 对象。只返回 JSON，使用双引号，不要添加解释、代码块或额外的外层字段。根据应用类型，JSON 结构如下：\n'
        : '你的输出必须是 XML 标签格式，且只包含 XML 内容，不要有任何额外的解释或标记。根据应用类型，XML 结构如下：\n';

    const defaultRefreshCounts = { messages: { min: 3, max: 5 }, timeThoughts: { min: 3, max: 5 }, memos: { min: 3, max: 4 } };
    const getRefreshRange = (type) => {
        const d = defaultRefreshCounts[type];
        const c = char.peekScreenSettings?.refreshCounts?.[type] || d;
        return { min: Number.isFinite(c.min) ? c.min : d.min, max: Number.isFinite(c.max) ? c.max : d.max };
    };

    switch (appType) {
        case 'messages': {
            const { min: msgMin, max: msgMax } = getRefreshRange('messages');
            const impersonateEnabled = char.peekScreenSettings?.impersonateEnabled;
            if (impersonateEnabled) {
                prompt += `
            ${example(`<result>
              <conversations>
                <conversation>
                  <partnerName>与Ta对话的人的称呼（如：小明、闺蜜阿琳）</partnerName>
                  <partnerPersona>此人的基础人设，30-80字：性格、身份、与${peekEscapeHtml(char.realName)}的关系等</partnerPersona>
                  <partnerRelation>与${peekEscapeHtml(char.realName)}的关系（如：同事、同学、闺蜜、前任、网友等）</partnerRelation>
                  <history>
                    <message>
                      <sender>char</sender>
                      <content>${peekEscapeHtml(char.realName)}发送的消息内容</content>
                    </message>
                    <message>
                      <sender>partner</sender>
                      <content>对方发送的消息内容</content>
                    </message>
                  </history>
                </conversation>
              </conversations>
            </result>`)}
            请为 ${char.realName} 编造${msgMin}-${msgMax}个最近的对话。每个对话必须包含 partnerName、partnerPersona、partnerRelation 和 history。对话内容需要强烈反映Ta的人设以及和我的聊天上下文。`;
            } else {
                prompt += `
            ${example(`<result>
              <conversations>
                <conversation>
                  <partnerName>与Ta对话的人的称呼</partnerName>
                  <history>
                    <message>
                      <sender>char</sender>
                      <content>${peekEscapeHtml(char.realName)}发送的消息内容</content>
                    </message>
                    <message>
                      <sender>partner</sender>
                      <content>对方发送的消息内容</content>
                    </message>
                  </history>
                </conversation>
              </conversations>
            </result>`)}
           请为 ${char.realName} 编造${msgMin}-${msgMax}个最近的对话。对话内容需要强烈反映Ta的人设以及和我的聊天上下文。`;
            }
            break;
        }
        case 'steps':
            prompt += `
            ${example(`<result>
              <currentSteps>8102</currentSteps>
              <trajectory>
                <entry>08:30 AM - 公司楼下咖啡馆</entry>
                <entry>10:00 AM - 宠物用品店</entry>
                <entry>12:00 PM - 附近日料店</entry>
                <entry>03:00 PM - 回家路上的甜品店</entry>
                <entry>04:00 PM - 楼下的便利店</entry>
                <entry>06:30 PM - 健身房</entry>
              </trajectory>
              <annotation>角色对自己今天运动情况的批注</annotation>
            </result>`)}
            请为 ${char.realName} 生成今天的步数信息。你只需要生成Ta的当前步数(currentSteps)，Ta的6条运动轨迹(trajectory)（禁止照搬示例）以及批注(annotation)。内容需要与Ta的人设和我们的聊天上下文高度相关。`;
            break;
        case 'album':
            prompt += `
            ${example(`<result>
              <photos>
                <photo>
                  <type>photo</type>
                  <imageDescription>对一张照片的详细文字描述，例如：一张傍晚在海边的自拍，背景是橙色的晚霞和归来的渔船。</imageDescription>
                  <description>角色对这张照片的一句话批注，例如：那天的风很舒服。</description>
                </photo>
                <photo>
                  <type>video</type>
                  <imageDescription>对一段视频的详细文字描述，例如：一段在猫咖撸猫的视频，视频里有一只橘猫在打哈欠。</imageDescription>
                  <description>角色对这段视频的一句话批注，例如：下次还来这里！</description>
                </photo>
              </photos>
            </result>`)}
            请为 ${char.realName} 的相册生成5-8个条目（照片或视频）。内容需要与Ta的人设和我们的聊天上下文高度相关。'imageDescription' 是对这张照片/视频的详细文字描述，它将代替真实的图片展示给用户。'description' 是 ${char.realName} 自己对这张照片/视频的一句话批注，会显示在描述下方。`;
            break;
        case 'memos': {
            const { min: memoMin, max: memoMax } = getRefreshRange('memos');
            prompt += `
            ${example(`<result>
              <memos>
                <memo>
                  <id>memo_1</id>
                  <title>备忘录标题</title>
                  <content>备忘录内容，可以包含换行符</content>
                </memo>
              </memos>
            </result>`)}
            请生成${memoMin}-${memoMax}条备忘录，内容要与Ta的人设和我们的聊天上下文相关。`;
            break;
        }
        case 'cart':
            prompt += `
            ${example(`<result>
              <items>
                <item>
                  <id>cart_1</id>
                  <title>商品标题</title>
                  <spec>商品规格</spec>
                  <price>25.00</price>
                </item>
              </items>
            </result>`)}
            请生成3-4件商品，这些商品应该反映Ta的兴趣、需求或我们最近聊到的话题。`;
            break;
        case 'browser': {
            const browserDetailEnabled = char.peekScreenSettings?.browserDetailEnabled || false;
            const bWords = char.peekScreenSettings?.browserDetailWords || { min: 200, max: 500 };
            const wordMin = bWords.min || 200;
            const wordMax = bWords.max || 500;
            prompt += `
            ${example(`<result>
              <history>
                <item>
                  <title>网页标题</title>
                  <url>example.com/path</url>
                  <annotation>角色对于这条浏览记录的想法或批注</annotation>${browserDetailEnabled ? `\n                  <detail><![CDATA[帖子/网页正文详情，${wordMin}-${wordMax}字]]></detail>` : ''}
                </item>
              </history>
            </result>`)}
            请生成3-5条浏览记录。记录本身要符合Ta的人设和我们的聊天上下文，'annotation'字段则要站在角色自己的视角，记录Ta对这条浏览记录的想法或批注。${browserDetailEnabled ? `每条记录必须包含'detail'字段，是该网页/帖子的正文详情内容，每条详情${wordMin}到${wordMax}字，可使用HTML标签排版${useJson ? '，写入 JSON 字符串。' : '，并用 <![CDATA[ ]]> 包裹。'}` : ''}`;
            break;
        }
        case 'drafts':
            prompt += `
            ${example(`<result>
              <draft>
                <to>${peekEscapeHtml(char.myName)}</to>
                <content><![CDATA[一封写给我但未发送的草稿内容，可以使用HTML的<span class='strikethrough'></span>标签来表示划掉的文字。]]></content>
              </draft>
            </result>`)}
            请生成一份Ta写给我但犹豫未决、未发送的草稿。内容要深刻、细腻，反映Ta的内心挣扎和与我的关系。${useJson ? '草稿内容写入 content 字符串。' : '草稿内容请用 <![CDATA[ ]]> 包裹。'}`;
            break;
       case 'transfer':
           prompt += `
           ${example(`<result>
             <entries>
               <entry>要记得买牛奶。</entry>
               <entry>https://example.com/interesting-article</entry>
               <entry>刚刚那个想法不错，可以深入一下...</entry>
             </entries>
           </result>`)}
           请为 ${char.realName} 生成4-7条Ta发送给自己的、简短零碎的消息。这些内容应该像是Ta的临时备忘、灵感闪现或随手保存的链接，要与Ta的人设和我们的聊天上下文相关，但比“备忘录”应用的内容更随意、更口语化。`;
           break;
        case 'timeThoughts': {
           const { min: thMin, max: thMax } = getRefreshRange('timeThoughts');
           const userPersonality = char.myPersona || '用户的性格和背景信息';
           const charPersonality = char.persona || '角色的性格';
           const diaryContext = char.diary && char.diary.length > 0 
               ? char.diary.slice(-5).map(d => d.content).join('\n') 
               : '';
           
           prompt += `

## 角色信息
- 角色：${char.realName}
- 角色设定：${charPersonality}

## 用户信息
- 用户名：${char.myName}
- 用户设定：${userPersonality}

## 你们的关系
- 最近对话内容：
${mainChatContext}

${diaryContext ? `- 长期记忆（日记总结）：\n${diaryContext}` : ''}

---

任务：想象如果你们在童年时期就认识，会是怎样的场景。请基于角色和用户的真实背景，生成${thMin}-${thMax}个不同年龄段的"时光想说"。

对于每个年龄段：
1. 选择一个具体年龄（如5岁、8岁、12岁等）- 根据人设灵活选择，不要固定
2. 描述那个年龄段的你（角色自己）是什么样的
3. 想象遇见那个年龄段的${char.myName}会怎样
4. 想对小时候的${char.myName}说什么
5. 想和小时候的${char.myName}做什么

要求：
- 基于角色的真实性格和成长背景
- 参考用户的童年背景信息
- 情感真挚，体现角色对用户的感情
- 可以有：羡慕、心疼、保护欲、想陪伴、想分享等
- 语气要自然，像是角色的真心话

${useJson ? '返回 JSON 对象：' : '返回 XML 标签格式：'}
${example(`<result>
  <thoughts>
    <thought>
      <userAge>5岁的你</userAge>
      <characterAge>6岁的我</characterAge>
      <title>如果遇见5岁的你</title>
      <characterSelfDescription>那时候的我...[详细描述角色自己那个年龄段的状态、性格、处境等，100-150字]</characterSelfDescription>
      <whatToSay>想对你说...[角色想对小时候用户说的话，50-100字]</whatToSay>
      <whatToDo>想和你...[想陪小时候用户做的事，50-80字]</whatToDo>
      <emotion>温柔</emotion>
    </thought>
  </thoughts>
</result>`)}`;
           break;
       }
        case 'wallet': {
            let isOfflineNode = false;
            if (char.activeNodeId && char.nodes) {
                const activeNode = char.nodes.find(n => n.id === char.activeNodeId);
                if (activeNode) {
                    let baseMode = (activeNode.customConfig && activeNode.customConfig.baseMode) ? activeNode.customConfig.baseMode : 
                                   (activeNode.type === 'offline' || (activeNode.type === 'spinoff' && activeNode.spinoffMode === 'offline') ? 'offline' : 'online');
                    if (baseMode === 'offline') {
                        isOfflineNode = true;
                    }
                }
            }
            let associatedIds = char.worldBookIds || [];
            if (isOfflineNode) {
                associatedIds = (char.offlineWorldBookIds && char.offlineWorldBookIds.length > 0) ? char.offlineWorldBookIds : (char.worldBookIds || []);
            }
            const globalBooks = db.worldBooks.filter(wb => wb.isGlobal && !wb.disabled);
            const globalIds = globalBooks.map(wb => wb.id);
            const allBookIds = [...new Set([...associatedIds, ...globalIds])];
            const worldBooks = allBookIds.map(id => db.worldBooks.find(wb => wb.id === id)).filter(wb => wb && !wb.disabled);
            const worldBookText = worldBooks.length
                ? worldBooks.map(wb => `【${wb.name}】\n${wb.content}`).join('\n\n')
                : '无';
            const favoritedJournals = (char.memoryJournals || [])
                .filter(j => j.isFavorited)
                .map(j => `${j.title}\n${j.content}`)
                .join('\n\n---\n\n');
            const memoirText = favoritedJournals || '无';
            const realTransfers = extractTransfersFromHistory(char.history, char.realName, char.myName);
            let transferContext = '';
            if (realTransfers.income.length || realTransfers.expense.length) {
                transferContext = '【角色收到的转账/商城收入】\n';
                realTransfers.income.forEach(t => {
                    transferContext += `- ${t.amount}元，备注：${t.remark}${t.time ? '，时间：' + t.time : ''}\n`;
                });
                transferContext += '\n【角色发出的转账/商城代付等支出】\n';
                realTransfers.expense.forEach(t => {
                    transferContext += `- ${t.amount}元，备注：${t.remark}${t.time ? '，时间：' + t.time : ''}\n`;
                });
            } else {
                transferContext = '（暂无从聊天/记忆中解析到的转账或商城收支）';
            }
            prompt += `你正在模拟角色「${char.realName}」的钱包账单。请根据以下信息生成一份合理、有沉浸感的账单。

【角色人设】\n${(char.persona || '无').slice(0, 800)}\n
【用户人设】\n${(char.myPersona || '无').slice(0, 400)}\n
【世界书/背景】\n${worldBookText.slice(0, 1500)}\n
【长期记忆】\n${memoirText.slice(0, 1500)}\n
【近期对话】\n${mainChatContext}\n
【必须纳入账单的真实转账与商城/代付收支】\n${transferContext}\n

要求：1）上方真实转账与商城/代付收支必须全部出现在 income 或 expense 中，且 amount、remark 一致；2）可再根据人设与记忆补充其他收支项（如工资、购物、红包等），但不要重建用户已清除的旧商城订单；3）只输出${useJson ? ' JSON 对象' : ' XML 标签格式'}，不要 markdown 或解释。格式如下，每条记录含 amount、remark、time、source（填"聊天记录"或"人设生成"）：
${example(`<result>
  <summary>
    <balance>当前余额说明或数字</balance>
    <monthIncome>本月收入合计</monthIncome>
    <monthExpense>本月支出合计</monthExpense>
  </summary>
  <income>
    <item>
      <amount>...</amount>
      <remark>...</remark>
      <time>...</time>
      <source>...</source>
    </item>
  </income>
  <expense>
    <item>
      <amount>...</amount>
      <remark>...</remark>
      <time>...</time>
      <source>...</source>
    </item>
  </expense>
</result>`)}`;
            break;
        }
        default:
            prompt += `${example(`<result><error>Unknown app type</error></result>`)}`;
            break;
        case 'unlock': {
            const unlockCommentsEnabled = !!char.peekScreenSettings?.unlockCommentsEnabled;
            if (unlockCommentsEnabled) {
                prompt += `
            ${example(`<result>
              <nickname>角色的微博昵称</nickname>
              <handle>@角色的微博ID</handle>
              <bio>角色的个性签名，可以包含换行符</bio>
              <posts>
                <post>
                  <id>post_1</id>
                  <timestamp>2小时前</timestamp>
                  <content>第一条微博正文内容，140字以内。</content>
                  <comments>
                    <comment>
                      <author>评论者昵称</author>
                      <content>评论内容</content>
                      <timestamp>1小时前</timestamp>
                    </comment>
                    <comment>
                      <author>角色昵称（与上方nickname一致）</author>
                      <content>角色本人回复上一条的内容</content>
                      <timestamp>50分钟前</timestamp>
                      <replyTo>评论者昵称</replyTo>
                    </comment>
                    <comment>
                      <author>路人或陌生人</author>
                      <content>可有1条陌生网友/路人评论</content>
                      <timestamp>30分钟前</timestamp>
                    </comment>
                  </comments>
                </post>
              </posts>
            </result>`)}
            请为 ${char.realName} 生成一个符合其人设的微博小号。你需要生成：1）昵称、ID、个性签名；2）3-4条最近的微博。每条微博需要包含：微博正文（生活化、碎片化，符合小号的私密风格），以及3-5条评论。评论者构成：大部分（2-3条）是Ta的朋友、同事或熟人；可以有1-2条来自陌生网友/路人/粉丝的评论（语气更客气或疏远）。当角色本人（author 填与 nickname 相同的昵称）回复某条评论时，必须加上 "replyTo" 标签，这样界面会显示为「回复 @xxx」的引用样式。评论时间戳晚于帖子发布时间。所有内容与Ta的人设和我们的聊天上下文高度相关。`;
            } else {
                prompt += `
            ${example(`<result>
              <nickname>角色的微博昵称</nickname>
              <handle>@角色的微博ID</handle>
              <bio>角色的个性签名，可以包含换行符</bio>
              <posts>
                <post>
                  <timestamp>2小时前</timestamp>
                  <content>第一条微博正文内容，140字以内。</content>
                </post>
                <post>
                  <timestamp>昨天</timestamp>
                  <content>第二条微博正文内容。</content>
                </post>
                <post>
                  <timestamp>3天前</timestamp>
                  <content>第三条微博正文内容。</content>
                </post>
              </posts>
            </result>`)}
            请为 ${char.realName} 生成一个符合其人设的微博小号。你需要生成昵称、ID、个性签名，以及3-4条最近的微博。微博内容要生活化、碎片化，符合小号的风格，并与Ta的人设和我们的聊天上下文高度相关。`;
            }
            break;
        }
    }
    const authored = {
        messages: '只有角色本人发送的消息', memos: '备忘录标题和正文', album: '角色对相册的批注',
        browser: '角色对浏览记录的批注', drafts: '角色未发送的草稿正文', transfer: '角色发给自己的文字',
        timeThoughts: '角色对童年的描述和想说的话', steps: '角色的运动批注', unlock: '角色小号简介、帖子与角色本人评论'
    };
    return prompt + (authored[appType] && typeof BilingualContent !== 'undefined' ? BilingualContent.prompt(char, 'peek', authored[appType]) : '');
}

const peekAppViews = {
    messages: ['peek-messages-screen', data => renderPeekChatList(data?.conversations)],
    album: ['peek-album-screen', data => renderPeekAlbum(data?.photos || [])],
    memos: ['peek-memos-screen', data => renderMemosList(data?.memos || [])],
    transfer: ['peek-transfer-station-screen', data => renderPeekTransferStation(data?.entries || [])],
    cart: ['peek-cart-screen', data => renderPeekCart(data?.items || [])],
    browser: ['peek-browser-screen', data => renderPeekBrowser(data?.history || [])],
    drafts: ['peek-drafts-screen', data => renderPeekDrafts(data?.draft)],
    steps: ['peek-steps-screen', data => renderPeekSteps(data)],
    timeThoughts: ['peek-time-thoughts-screen', data => renderPeekTimeThoughts(data)],
    unlock: ['peek-unlock-screen', data => renderPeekUnlock(data)],
    wallet: ['peek-wallet-screen', data => renderPeekWallet(data)]
};

async function generateAndRenderPeekContent(appType, options = {}) {
    const { forceRefresh = false, background = false, characterId = currentChatId } = options;
    if (generatingPeekApps.has(appType)) {
        if (!background) showToast('该应用内容正在生成中，请稍候...');
        return false;
    }

    const char = db.characters.find(c => c.id === characterId);
    if (!char || !Object.hasOwn(peekAppViews, appType)) {
        if (!background) showToast(char ? '无法打开' : '无法找到当前角色');
        return false;
    }

    const [screen, render] = peekAppViews[appType];
    const clearRevision = getPeekClearRevision(char.id, appType);
    const cachedData = char.peekData?.[appType];
    if (!forceRefresh && cachedData) {
        render(cachedData);
        switchScreen(screen);
        recordPeekViewedByUser(char, appType);
        await saveData();
        return false;
    }

    let apiConfig = db.apiSettings;
    if (db.peekApiSettings && db.peekApiSettings.url && db.peekApiSettings.key && db.peekApiSettings.model) {
        apiConfig = db.peekApiSettings;
    }
    apiConfig = typeof getApiConfigForFeature === 'function' ? getApiConfigForFeature('peek', apiConfig, char) : apiConfig;
    let { url, key, model } = apiConfig;
    if (typeof isApiConfigReady === 'function' ? !isApiConfigReady(apiConfig) : (!url || !key || !model)) {
        if (!background) {
            showToast('请先在“api”应用中完成设置！');
            switchScreen('api-settings-screen');
        }
        return false;
    }

    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }

    generatingPeekApps.add(appType);
    try {
        if (!background) {
            switchScreen(screen);
            render(cachedData);
            if (!cachedData && appType === 'messages') {
                document.getElementById('peek-chat-list-container').innerHTML = '<p class="placeholder-text">正在生成对话列表...</p>';
            }
        }

        const { limit, apps } = char.peekScreenSettings?.chatContext || {};
        const useCustomContext = Array.isArray(apps) && apps.includes(appType)
            && Number.isSafeInteger(limit) && limit > 0;
        const history = char.history || [];
        const contextMessages = filterHistoryForAI(char, useCustomContext ? history : history.slice(-10))
            .filter(m => appType !== 'wallet' || !m.peekWalletOrderCleared)
            .map(m => m.content);
        const mainChatContext = (useCustomContext
            ? contextMessages.filter(text => typeof text === 'string' && text.trim()).slice(-limit)
            : contextMessages).join('\n');

        const format = getPeekResponseFormat(char);
        const systemPrompt = generatePeekContentPrompt(char, appType, mainChatContext, format);
        
        const requestBody = {
            model: model,
            messages: [{ role: 'user', content: systemPrompt }],
            temperature: 0.8,
            top_p: 0.9,
        };

        const endpoint = `${url}/v1/chat/completions`;
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };

        const contentStr = await fetchAiResponse(apiConfig, requestBody, headers, endpoint, false, { allowRoleFallback: false });
        if (getPeekClearRevision(char.id, appType) !== clearRevision || !db.characters.includes(char)) return false;
        
        const generatedData = parsePeekResponse(contentStr, format);

        const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);
        const isRecordList = value => Array.isArray(value) && value.every(isRecord);
        let isValid = false;
        switch (appType) {
            case 'messages':
                isValid = isRecordList(generatedData?.conversations) && generatedData.conversations.every(conv =>
                    !conv.history || (isRecordList(conv.history) && conv.history.every(msg => typeof msg.content === 'string')));
                break;
            case 'memos': isValid = isRecordList(generatedData?.memos) && generatedData.memos.every(memo => typeof memo.content === 'string'); break;
            case 'album': isValid = isRecordList(generatedData?.photos); break;
            case 'cart': isValid = isRecordList(generatedData?.items); break;
            case 'transfer': isValid = Array.isArray(generatedData?.entries) && generatedData.entries.every(entry => typeof entry !== 'object'); break;
            case 'browser': isValid = isRecordList(generatedData?.history); break;
            case 'drafts': isValid = isRecord(generatedData?.draft) && typeof generatedData.draft.content === 'string'; break;
            case 'steps': isValid = Number.isFinite(generatedData?.currentSteps) && Array.isArray(generatedData.trajectory); break;
            case 'timeThoughts':
                isValid = isRecordList(generatedData?.thoughts) && generatedData.thoughts.every(thought =>
                    thought.characterSelfDescription == null || typeof thought.characterSelfDescription === 'string');
                break;
            case 'unlock':
                isValid = generatedData?.nickname && (!generatedData.bio || typeof generatedData.bio === 'string') &&
                    isRecordList(generatedData.posts) && generatedData.posts.every(post => !post.content || typeof post.content === 'string');
                break;
            case 'wallet': isValid = isRecordList(generatedData?.income) && isRecordList(generatedData?.expense) && isRecord(generatedData.summary); break;
            default: isValid = false;
        }

        if (!isValid) {
            throw new Error('AI 返回的数据缺少此应用所需的字段，或字段格式不正确。请手动刷新。');
        }

        if (appType === 'messages' && Array.isArray(generatedData.conversations)) {
            generatedData.conversations.forEach((conv, idx) => {
                if (!conv.partnerId) conv.partnerId = 'peek_npc_' + Date.now() + '_' + idx;
                if (typeof conv.suspicionLevel !== 'number') conv.suspicionLevel = 0;
                if (typeof conv.isFriend !== 'boolean') conv.isFriend = false;
                if (typeof conv.friendRequestPending !== 'boolean') conv.friendRequestPending = false;
                if (!conv.supplementPersona) conv.supplementPersona = '';
                if (!conv.partnerPersona) conv.partnerPersona = '';
                if (!conv.partnerRelation) conv.partnerRelation = '熟人';
                conv.history = conv.history || [];
            });
        }

        const persistGenerated = async () => {
            if (!char.peekData) char.peekData = {};
            const previousData = char.peekData[appType];
            char.peekData[appType] = generatedData;
            let saved = false;
            let undoViewed;
            try {
                if (!background) undoViewed = recordPeekViewedByUser(char, appType);
                saved = await saveCharacter(char.id);
            } finally {
                if (!saved) {
                    undoViewed?.();
                    if (char.peekData?.[appType] === generatedData) {
                        if (previousData === undefined) delete char.peekData[appType];
                        else char.peekData[appType] = previousData;
                    }
                }
            }
            if (!saved) throw new Error('偷看内容保存失败，请手动刷新。');
            return true;
        };
        const committed = window.PeekMemory
            ? await window.PeekMemory.commitGenerated(char, appType, generatedData, persistGenerated,
                () => getPeekClearRevision(char.id, appType) === clearRevision && db.characters.includes(char))
            : await persistGenerated();
        if (!committed) return false;
        if (getPeekClearRevision(char.id, appType) !== clearRevision) return false;
        if (!background && currentChatId === char.id) render(generatedData);
        return true;
    } catch (error) {
        if (background) {
            console.error('[Peek] 刷新失败:', appType, error);
        } else {
            showApiError(error);
            if (!cachedData && currentChatId === char.id) {
                const pending = document.getElementById(screen)?.querySelectorAll('.placeholder-text, .placeholder-text-thoughts, .activity-track-item, #steps-annotation-content') || [];
                for (const message of pending) {
                    if (message.textContent.startsWith('正在生成')) message.textContent = '内容生成失败，请手动刷新。';
                }
                if (pending[0] && ['steps', 'unlock', 'timeThoughts'].includes(appType)) {
                    const retryButton = document.createElement('button');
                    retryButton.type = 'button';
                    retryButton.className = 'btn btn-secondary';
                    retryButton.textContent = '手动刷新';
                    retryButton.addEventListener('click', () => generateAndRenderPeekContent(appType, { forceRefresh: true }));
                    pending[0].append(' ', retryButton);
                }
            }
        }
        return false;
    } finally {
        generatingPeekApps.delete(appType);
    }
}
