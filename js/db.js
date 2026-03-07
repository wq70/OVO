// --- 数据库与全局状态 (js/db.js) ---

// 常量定义
const BLOCKED_API_DOMAINS = [
    'api522.pro',
    'api521.pro',
    'api520.pro'
];

const colorThemes = {
    'white_pink': {
        name: '白/粉',
        received: {bg: 'rgba(255,255,255,0.9)', text: '#6D6D6D'},
        sent: {bg: 'rgba(255,204,204,0.9)', text: '#A56767'}
    },
    'white_blue': {
        name: '白/蓝',
        received: {bg: 'rgba(255,255,255,0.9)', text: '#6D6D6D'},
        sent: {bg: 'rgba(173,216,230,0.9)', text: '#4A6F8A'}
    },
    'white_yellow': {
        name: '白/黄',
        received: {bg: 'rgba(255,255,255,0.9)', text: '#6D6D6D'},
        sent: {bg: 'rgba(249,237,105,0.9)', text: '#8B7E4B'}
    },
    'white_green': {
        name: '白/绿',
        received: {bg: 'rgba(255,255,255,0.9)', text: '#6D6D6D'},
        sent: {bg: 'rgba(188,238,188,0.9)', text: '#4F784F'}
    },
    'white_purple': {
        name: '白/紫',
        received: {bg: 'rgba(255,255,255,0.9)', text: '#6D6D6D'},
        sent: {bg: 'rgba(185,190,240,0.9)', text: '#6C5B7B'}
    },
    'black_red': {
        name: '黑/红',
        received: {bg: 'rgba(30,30,30,0.85)', text: '#E0E0E0'},
        sent: {bg: 'rgb(226,62,87,0.9)', text: '#fff'}
    },
    'black_green': {
        name: '黑/绿',
        received: {bg: 'rgba(30,30,30,0.85)', text: '#E0E0E0'},
        sent: {bg: 'rgba(119,221,119,0.9)', text: '#2E5C2E'}
    },
    'black_white': {
        name: '黑/白',
        received: {bg: 'rgba(30,30,30,0.85)', text: '#E0E0E0'},
        sent: {bg: 'rgba(245,245,245,0.9)', text: '#333'}
    },
    'white_black': {
        name: '白/黑',
        received: {bg: 'rgba(255,255,255,0.9)', text: '#6D6D6D'},
        sent: {bg: 'rgba(50,50,50,0.85)', text: '#F5F5F5'}
    },
    'yellow_purple': {
        name: '黄/紫',
        received: {bg: 'rgba(255,250,205,0.9)', text: '#8B7E4B'},
        sent: {bg: 'rgba(185,190,240,0.9)', text: '#6C5B7B'}
    },
    'pink_blue': {
        name: '粉/蓝',
        received: {bg: 'rgba(255,231,240,0.9)', text: '#7C6770'},
        sent: {bg: 'rgba(173,216,230,0.9)', text: '#4A6F8A'}
    },
};

const defaultWidgetSettings = {
    centralCircleImage: 'https://i.postimg.cc/mD83gR29/avatar-1.jpg',
    topLeft: { emoji: '🎧', text: '𝑀𝑒𝑚𝑜𝑟𝑖𝑒𝑠✞' },
    topRight: { emoji: '🐈‍⬛', text: '𐙚 ♰.𝐾𝑖𝑡𝑡𝑒𝑛.♰' },
    bottomLeft: { emoji: '💿', text: '᪗₊𝔹𝕒𝕓𝕖𝕚𝕤₊' },
    bottomRight: { emoji: '🥛', text: '.☘︎ ˖+×+.' }
};

const defaultIcons = {
    'chat-list-screen': {name: '404', url: 'https://i.postimg.cc/VvQB8dQT/chan-143.png'},
    'api-settings-screen': {name: 'api', url: 'https://i.postimg.cc/50FqT8GL/chan-125.png'},
    'wallpaper-screen': {name: '壁纸', url: 'https://i.postimg.cc/3wqFttL3/chan-90.png'},
    'world-book-screen': {name: '世界书', url: 'https://i.postimg.cc/prCWkrKT/chan-74.png'},
    'customize-screen': {name: '自定义', url: 'https://i.postimg.cc/vZVdC7gt/chan-133.png'},
    'font-settings-screen': {name: '字体', url: 'https://i.postimg.cc/FzVtC0x4/chan-21.png'},
    'tutorial-screen': {name: '教程', url: 'https://i.postimg.cc/6QgNzCFf/chan-118.png'},
    'day-mode-btn': {name: '白昼模式', url: 'https://i.postimg.cc/Jz0tYqnT/chan-145.png'},
    'night-mode-btn': {name: '夜间模式', url: 'https://i.postimg.cc/htYvkdQK/chan-146.png'},
    'forum-screen': {name: '论坛', url: 'https://i.postimg.cc/fyPVBZf1/1758451183605.png'},
    'music-screen': {name: '音乐', url: 'https://i.postimg.cc/ydd65txK/1758451018266.png'},
    'diary-screen': {name: '日记本', url: 'https://i.postimg.cc/bJBLzmFH/chan-70.png'},
    'piggy-bank-screen': {name: '存钱罐', url: 'https://i.postimg.cc/3RmWRRtS/chan-18.png'},
    'pomodoro-screen': {name: '番茄钟', url: 'https://i.postimg.cc/PrYGRDPF/chan-76.png'},
    'storage-analysis-screen': {name: '存储分析', url: 'https://i.postimg.cc/J0F3Lt0T/chan-107.png'},
    'appearance-settings-screen': {name: '外观设置', url: 'https://i.postimg.cc/KcgT1wzQ/DF424409FC54EDFF74D78ECB1311E1D7.png'},
    'theater-screen': {name: '小剧场', url: 'https://i.postimg.cc/t4gXjG8P/7632D362A35EC703E7A81F6FF0F8AE34.png'}
};

const peekScreenApps = {
    'messages': { name: '消息', url: 'https://i.postimg.cc/Kvs4tDh5/export202509181826424260.png' },
    'memos': { name: '备忘录', url: 'https://i.postimg.cc/JzD0xH1C/export202509181829064550.png' },
    'cart': { name: '购物车', url: 'https://i.postimg.cc/pLwT6VTh/export202509181830143960.png' },
    'transfer': { name: '中转站', url: 'https://i.postimg.cc/63wQBHCB/export202509181831140230.png' },
    'browser': { name: '浏览器', url: 'https://i.postimg.cc/SKcsF02Z/export202509181830445980.png' },
    'drafts': { name: '草稿箱', url: 'https://i.postimg.cc/ZKqC9D2R/export202509181827225860.png' },
    'album': { name: '相册', url: 'https://i.postimg.cc/qBcdpqNc/export202509221549335970.png' },
    'steps': { name: '步数', url: 'https://i.postimg.cc/5NndFrq6/export202509181824532800.png' },
    'unlock': { name: 'unlock！', url: 'https://i.postimg.cc/28zNyYWs/export202509221542593320.png' },
    'wallet': { name: '钱包', url: 'https://i.postimg.cc/NjRxBZXV/20260228-062729.webp' },
    'timeThoughts': { name: '时光想说', url: 'https://i.postimg.cc/FRpWm8MK/20260228-062619.webp' }
};

const DEFAULT_COT_PRESETS = [
    {
        id: 'default',
        name: '默认思维链',
        items: [
            {
                id: 'cot_item_1',
                name: '引子',
                content: '[System Directive]:\n你必须严格遵守 [incipere] 协议。在回复前，请先进入 <thinking> 标签进行深度推演。\n请按以下步骤查阅 System Prompt 中的模块并思考：',
                enabled: true
            },
            {
                id: 'cot_item_2',
                name: '准备动脑了吗？',
                content: '---\n## 【前置规则】\n### **必须**读取所有<logic_rules>和<output_formats>：了解**所有**需要遵守的规则，然后进行以下步骤精简准确的思考',
                enabled: true
            },
            {
                id: 'cot_item_3',
                name: '给我读设定！',
                content: '---\n## 【行为校准】\n基于<char_settings>和<角色活人运转>构建角色人格\n### Phase1: person\n1. **自我意识校验 (Ref: <char_settings>和<角色活人运转>)**\n   - 是否塑造鲜活真实人格？\n   - 你（角色）是否具有自己的聊天习惯/风格？\n   - 你想如何回应我？',
                enabled: true
            },
            {
                id: 'cot_item_4',
                name: '当个人吧。',
                content: '### Phase2: Verisimilitude\n2.**真实聊天**\n   - 是否根据以下两点要求采用了真人聊天思路？\n    - 正常人的注意力是有限的，不会每句话都非得逐句回复。\n    - 不对已有信息进行重复反问。\n    - 断点处理：若与上一条消息间隔较久，默认双方只是自然忙碌后重新拿起手机或默认期间以其他方式保持联系，自然接续话题。',
                enabled: true
            },
            {
                id: 'cot_item_5',
                name: '有特殊格式吗？',
                content: '### Phase3: chat role\n3. **逻辑检索 (Ref: <logic_rules>)**\n   - 当前是否为双语对话情境？若无，跳过此条\n   - 是否需要输出状态栏？若无相关要求，则跳过此条',
                enabled: true
            },
            {
                id: 'cot_item_6',
                name: '最后确认一下。',
                content: '## 【最后确认】\n\n4. 整合<Chatting Guidelines>，是否合理自然回复且不偏离人设？回顾<output_formats>，输出消息格式是否正确？',
                enabled: true
            },
            {
                id: 'cot_item_7',
                name: '尾声',
                content: '每轮输出前，必须先严格按照<thinking>…</thinking>内的步骤进行逐条思考，无需重复其中的条目，但思考内容需精简准确、清晰、可执行，不得跳步骤。\n<thinking>中的所有分析必须在输出中完全落实，不得偏离、删减或弱化。\n\n格式：\n<thinking>\n...思考过程...\n</thinking>',
                enabled: true
            }
        ]
    }
];

const globalSettingKeys = [
    'apiSettings', 'summaryApiSettings', 'backgroundApiSettings', 'supplementPersonaApiSettings', 'wallpaper', 'homeScreenMode', 'fontUrl', 'localFontName', 'customIcons', 'customAppNames', 'namePresets',
    'apiPresets', 'summaryApiPresets', 'backgroundApiPresets', 'supplementPersonaApiPresets', 'bubbleCssPresets', 'myPersonaPresets', 'globalCss',
    'globalCssPresets', 'fontPresets', 'homeSignature', 'forumPosts', 'forumBindings', 'forumUserProfile', 'forumSettings', 'forumApiSettings', 'forumMessages', 'forumStrangerProfiles', 'forumFriendRequests', 'forumPendingRequestFromUser', 'pomodoroTasks', 'pomodoroSettings', 'insWidgetSettings', 'homeWidgetSettings',
    'chatFolders', 'fontSizeScale', 'activePersonaId', 'moreProfileCardBg', 'statusBarPresets', 'regexFilterPresets', 'themeSettings', 'themePresets', 'savedKeyboardHeight',
    'globalSendSound', 'globalReceiveSound', 'globalIncomingCallSound', 'multiMsgSoundEnabled', 'soundPresets', 'galleryPresets', 'iconPresets', 'homeWidgetPresets', 'widgetWallpaperPresets', 'voicePresets',
    'cotSettings', 'cotPresets', 'hasSeenVideoCallDisclaimer', 'hasSeenVideoCallAvatarHint',
    'favorites', 'piggyBank',
    'theaterScenarios', 'theaterPromptPresets',
    'theaterHtmlScenarios', 'theaterHtmlPromptPresets', 'theaterMode',
    'theaterApiSettings',
    'novelAiSettings'
];
if (typeof window !== 'undefined') window.globalSettingKeysForBackup = globalSettingKeys;

const appVersion = "3.7";
const updateLog = [
    {
        version: "3.7",
        date: "2026-03-07",
        notes: [
            "3.7重大更新：",
            "1.小剧场新增角色主动生成！新增导出功能，并且再度进行优化，感谢豹豹老师！",
            "2.感谢理芽给UWU接入了生图和视频生图！特别伟大！感谢感谢！现在UWU可以生图啦！！配上1900老师的视频UI特别特别美妙！！",
            "3.新增本地上传字体",
            "4.新增状态栏可以多选删除（不删除也会自动屏蔽的）",
            "5.TOKEN分布更加详细！",
            "6.删掉音乐自动检测有效的BUG，修复来电提示音的BUG",
            "7.新增论坛可以创建用户小号，角色不会知道，但是！如果和大号太像了，会掉马！",
            "8.新增论坛可以私信评论区的人，可以回复评论区的人"
        ]
    },
    {
        version: "3.5",
        date: "2026-03-05",
        notes: [
            "3.5微量更新：",
            "1.修复了群聊记忆互通的BUG（豹豹老师修）",
            "2.加了小剧场分类导入导出和预设保存可选择同步保存人设世界书等等（豹豹老师加）",
            "3.修复TTS开关问题，修复TTS国际版问题",
            "4.删掉了自动揭露",
            "5.新增了真实摄像头，视频通话可以看到真实的你的样子（没有人许愿这个，但是！我想做就做了！）"
        ]
    },
    {
        version: "3.4",
        date: "2026-03-04",
        notes: [
            "3.4微量更新：（临时起意想要更新，所以没有什么）",
            "感谢豹豹老师再再再再次优化小剧场，现在小剧场可以HTML和独立API了！包括群聊问题、转账问题也感谢豹豹老师修复了！",
            "————",
            "1.稍微优化了一点点音乐界面吧，然后可以在线搜索听着玩，单独一个APP是准备后面和角色一起听分开，想做个听歌匹配陌生人",
            "2.新增图标名字自定义，导出屏幕自定义的时候也可以导出偷看里面的APP了",
            "3.修复冗余数据清除错误问题，修复记忆存档删除后，导入备份再次出现的问题",
            "4.新增正则功能，主要是用来过滤八股的",
            "5.新增删除消息的同时删除对应的状态栏和思维链",
            "6.修复超过1000条的回顶全部点不动的BUG",
            "7.新增时间戳样式，新增输入框增高开关",
            "8.优化了一点点日记保存按钮样式，更加明显方便点击"
        ]
    },
    {
        version: "3.2",
        date: "2026-03-02",
        notes: [
            "感谢豹豹老师再次优化小剧场",
            "1.修复论坛私聊串来串去的问题",
            "2.修复论坛角色伪装失败！这次绝对很成功！修复角色头像明显、角色不适用填写好的昵称",
            "3.互通了论坛大小号的记忆。修复论坛刷新不适用专属论坛API的BUG",
            "4.修复用户商城赠送也会被算进钱包的BUG",
            "5.修复记忆转跳弄错CHAR的问题",
            "6.新增语音语速设置",
            "7.新增偷看部分APP可以自定义生成条数",
            "其他更新在做了在做了"
        ]
    },
    {
        version: "3.1",
        date: "2026-03-01",
        notes: [
            "**着重感谢：豹豹女神再次优化小剧场和冰镇草莓老师提供的全屏思路**",
            "————",
            "1.新增暂停调用按钮",
            "2.新增聊天背景重置，全局导出美化新增APP图标，我昨天脑子糊涂了忘记了",
            "3.修复接入语音后，文字消息输出太快了，就导致一句话没读完就读下一句的BUG",
            "4.新增搜索出来的聊天记录可以回顶了，然后聊天设置里面也新增了回底回顶。",
            "5.修复TTS把用户声音和角色声音同步了，并且新增可以配置用户的声音",
            "6.修复TTS无法暂停的BUG，新增退出聊天页面即可暂停，并且二次点击也可以暂停",
            "7.新增直接拍照。",
            "8.新增清理本地图片，新增相册一键清空",
            "9.新增论坛功能，新增角色小号，喜欢玩私信的小心了，角色可能会用小号接近你。",
            "10.新增功能，角色可以自主更换导入的CSS主题",
            "11.新增功能，查手机会被角色知晓（需要先设置里面打开）",
            "12.改掉了双语模式还读翻译的BUG",
            "一些功能没做，一个是因为我一个人测试不过来，直接放上来又太冒险，所以还在酝酿中。",
            "还有一些新APP在慢慢磨前端网页，所以也还在酝酿"
        ]
    },
    {
        version: "2.28",
        date: "2026-02-28",
        notes: [
            "首先前排感谢两位女神！",
            "感谢豹豹/放假老师提供的功能，以下是豹豹/放假老师提供的更新日志：",
            "① 生成后的小剧场内容现已支持分类保存、收藏和编辑，并可分享给任意 char。",
            "②支持将角色所在群聊的记忆与私聊进行互通，并可自定义聊天条数及总结范围。",
            "群聊总结数量默认为 0：表示 char 会选择记忆该群聊的全部收藏总结。",
            "若修改为 1：表示 char 仅选择记忆最近 1 条群聊中的收藏总结（数字可按需调整）。",
            "‼️ 当 char 在多个群聊内时，如需为角色选择不同的群聊记忆，需要先在私聊界面开启“所在群聊记忆互通”按钮，并获取一次回复后，才可以进行群聊的选择。",
            "🆕群聊中的角色现已支持选择记忆私聊内容，记忆方式与角色记忆群聊内容的方式一致，实现双向记忆互通。",
            "————",
            "其次感谢1900老师提供的偷看手机的同比例图标素材！我抠图水平太烂了！",
            "————",
            "以下是所有更新内容：",
            "1.修复在没有开启TTS的情况下一直提示TTS未开启，新增可以清除选择过的内置音色",
            "2.修改了一下论坛私信逻辑，之前是只有用户发的贴子，现在用户在论坛里面评论也会引起某些NPC注意来私信你",
            "3.新增论坛私信逻辑，可以在论坛里面添加私信的人为好友，并且在聊天中一步步补齐这个私信NPC的人设！为了省API可以在API设置里配专门的补齐人设的副API！也可以手动补齐！",
            "4.新增可以分享论坛评论了。",
            "5.修复全局世界书没有自动关联的BUG，新增世界书分类可以删除、条目可以选择是否启用",
            "6.新增小组将和壁纸的自定义区域，可以导入导出方案。",
            "7.新增发送定位，角色也可以发送",
            "8.修复音乐播放和消息提示音冲突的问题。",
            "9.新增来电提示音，需自己上传音频",
            "10.修复存钱罐存了退回转账的BUG",
            "11.新增小剧场，感谢豹豹女神",
            "12.新增群聊私聊互通，再次感谢豹豹女神。",
            "13.商城和存钱罐同步。现在给角色代付，自己要买东西，角色给自己代付都会同步到对应的钱包。",
            "14.修复TTS粤语映射错误的BUG",
            "15.新增导入角色卡有开场白，左右滑动可以切换。",
            "16.新增世界书可以导入DOCX、TXT、JSON格式。",
            "17.新增表情包智能匹配。",
            "18.修复论坛专属API保存失效的BUG",
            "一些小的改动就不说了"
        ]
    },
    {
        version: "1.8",
        date: "2026-02-23",
        notes: [
            "UwU小章鱼0223改版 对应版本1.8",
            "源代码来源：EE、1900、莫由（论坛功能by莫由），发布前已告知1900",
            "————",
            "主要改动内容（其实也没有改动什么）：",
            "1.新增导入DOCX、TXT、ZIP角色，新增各种地方可以导入DOCX、TXT，表情包DOCX和TXT解析的比较宽泛，目前资源区的应该都能导入（？）",
            "2.新增语音TTS",
            "3.新增自动总结，TOKEN分布",
            "4.新增记忆库存档",
            "5.调整了一下搜索界面的CSS样式。",
            "6.新增收藏功能，可以写下自己收藏时候的感想，角色也可以自主收藏你的。需要自主开启",
            "7.新增查手机小号的帖子可以点进去看评论",
            "8.修改了当前的论坛逻辑。新增私信功能（可以私信别人或者收到别人私信）、评论、点赞、收藏、自己发帖。可以自定义配置论坛的API",
            "9.新增两个副API用于总结、后台活动",
            "10.新增全局世界书",
            "11.新增查手机的时光想说，大概是抒情风，就是遇到各种不同年纪的USER的时候CHAR怎么想的",
            "12.新增查手机的角色钱包。有两种UI界面，点击右上角太阳可以切换。",
            "13.新增主角自己的钱包。",
            "然后导出应该已经同步了，就这样。",
            "本来还想做小游戏的，燃尽了，下次吧",
            "还做了一些其他的调整，具体小优化比较细，我不写出来了。"
        ]
    },
    {
        version: "1.8.5",
        date: "2026-02-18",
        notes: [
            "聊天功能新增：视频通话/语音通话，用户打电话入口在功能面板里，char主动打电话需在聊天设置里打开开关",
            "思维链页面新增：通话专属cot设置，可开可不开，已内置默认思维链，支持自定义",
            "**操作指南：所有人！去dc小手机主频道看使用教程视频！**",
            "—————————————",
            "通话结束后自动总结，仅总结内容进入上下文。",
            "如总结失败，可以在通话记录里找到那次记录，点开，重新总结。如果频繁失败，可以复制通话记录里的全部内容找其他ai给你总结。",
            "如何查看总结内容？：进入调试模式，点击那个“视频通话结束”的系统消息，可以看到总结内容",
        ]
    },
    {
        version: "1.8.4",
        date: "2026-02-14",
        notes: [
            "新增卡COT思维链，原理同酒馆，部分预设条目改自吱吱的过境预设，卡cot方法原理来自KKM的预设教程，非常感谢！",
            "思维链目前应该仅对**Open AI**的**Gemini**模型生效，其他模型暂未测试。",
            "位置：404-Menu界面，默认为关闭状态，按需开启，内置默认思维链，支持自定义思维链，支持自定义思维链导入导出。",
            "思维链功能可能会影响AI的回复风格，但开启后在回复条数的自然程度和各特殊消息的使用上有明显进步，请根据实际情况选择开启。",
        ]
    },
    {
        version: "1.8.3",
        date: "2026-01-27",
        notes: [
            "1.日记功能升级！新增摘要总结风格，支持自定义风格。",
            "现在生成日记会自动带入聊天室背景，无需重复绑定。",
            "优化了日记生成的提示词，摘要风格更客观、时间线更清晰。",
            "智能迁移：旧版日记关联已自动优化，去除了重复的背景设定。",
            "合并精简：新增多选日记进行合并，将多篇日记整合成一篇连贯、精简的“回忆录”，自动梳理时间线。",
            "参考过往：生成新日记时，可选择**参考已收藏的日记**。AI 会读取您收藏的重点回忆，确保新内容的连贯性，避免重复记录。",
            "—————————————",
            "2. 全新商城系统",
            "自定义分类：支持自定义分类名称和提示词。商城首页点击右上角 “＋”",
            "自选开关：如果不喜欢商城干扰聊天，可以在设置中关闭此功能。（仅关闭char不主动给你买东西和代付，你仍然可以单方面使用商城）",
            "—————————————",
            "3. 偷看界面 x 商城联动",
            "在偷看模式下，进入 “购物车”应用，点击底部的“结算”按钮，可以直接帮Ta买单。在偷看界面结算后，系统会自动跳转回聊天界面，并发送一条 “我为Ta清空了购物车” 的订单消息。",
            "4. 全局css救援",
            "任何界面里快速点5下，呼出救援面板一键清空全局css框内容"
        ]
    },
    {
        version: "1.8.2",
        date: "2025-01-24",
        notes: [
            "修了一点bug，提示音现在正常可以使用了",
            "解除了自定义css区域的限制，现在可以用全局变量之类的了，但是仍旧只生效于聊天室内！",
            "过往的美化有少量类名前面没加#chat-room-screen的可能有偏移！比如顶栏底栏的一些小地方，给美化老师们跪下了TT",
            "修了一些bug，做了提示音，【开始生成】是点让ai回复的那个按钮触发的音效，收到回复是发消息给你触发的音效",
            "做了朋友的一个纯点菜功能，选定指定片段截图，但是有bug截取不到气泡啥的只有纯文字和背景",
            "那个测试直播间别点，纯样板间很丑陋！太丑了做不下去了嗯！",
            "—————————分割线————————",
            "刚接触章鱼机的有使用相关问题先看主屏幕→教程→更新日志，全都翻一遍！",
            "其次再看聊天列表底部导航栏→通话图标，点击之后有详细的新版本更新说明，全都翻一遍！",
            "如果出现报错日志，自己看不懂就复制日志内容发给ai问",
            "还有问题就去尾巴镇→ee小手机区→标注搜索：小章鱼UwU问题自助",
            "关于状态栏是肯定要和ai肘击的，很难一步到位，状态栏不是必需品，会影响ai的回复质量",
            "以上这些能囊括90%的解决方法，尽量不要就基础问题消耗无偿答疑老师们的热情，亲亲你们！",
        ]
    },
    {
        version: "1.8.0",
        date: "2025-01-15",
        notes: [
            "先别点【我知道了】，看完看完看完",
            "本次更新的群成员私聊和Ta相册皆为【测试中】功能，不知道效果如何，均做了可选开关，不开也不影响正常玩",
            "🔍 搜索页: 快速查找聊天记录，支持关键词高亮。",
            "🖼️ TA 相册: 在聊天设置管理角色的专属相册，在聊天设置里开启此开关后，聊天时角色可直接发送你已经上传的图片（最好使用url）。",
            "📢 群公告: 群聊设置中新增公告功能，重要信息置顶显示。",
            "🤫 群内私聊: 群聊中支持成员间发起私聊，双击群聊标题可查看，八卦吐槽更方便。",
            "📝 群聊总结: 智能总结群聊记录，自动关联当前群聊世界书，内置提示词。",
            "📒 token：角色资料卡处（联系人界面点击角色头像），粗略统计角色当前聊天室的token，并不完全准确仅作参考！",
            "—————————分割线————————",
            "刚接触章鱼机的有使用相关问题先看主屏幕→教程→更新日志，全都翻一遍！",
            "其次再看聊天列表底部导航栏→通话图标，点击之后有详细的新版本更新说明，全都翻一遍！",
            "如果出现报错日志，自己看不懂就复制日志内容发给ai问",
            "还有问题就去尾巴镇→ee小手机区→标注搜索：小章鱼UwU问题自助",
            "关于状态栏是肯定要和ai肘击的，很难一步到位，状态栏不是必需品，会影响ai的回复质量",
            "以上这些能囊括90%的解决方法，尽量不要就基础问题消耗无偿答疑老师们的热情，亲亲你们！",
        ]
    },
    {
        version: "1.7.2",
        date: "2025-01-15",
        notes: [
            "先别点【我知道了】，看完看完看完",
            "刚接触章鱼机的有使用相关问题先看主屏幕→教程→更新日志，全都翻一遍！",
            "其次再看聊天列表底部导航栏→通话图标，点击之后有详细的新版本更新说明，全都翻一遍！",
            "如果出现报错日志，自己看不懂就复制日志内容发给ai问",
            "还有问题就去尾巴镇→ee小手机区→标注搜索：小章鱼UwU问题自助",
            "关于状态栏是肯定要和ai肘击的，很难一步到位，状态栏不是必需品，会影响ai的回复质量",
            "以上这些能囊括90%的解决方法，尽量不要就基础问题消耗无偿答疑老师们的热情，亲亲你们！",
        ]
    },
    {
        version: "1.6.0",
        date: "2025-01-04",
        notes: [
            "本次更新：更迭了表情包的机制，过往的机制因比较占token弃用，所以以前聊天记录的不再渲染。",
            "批量导入表情包时使用英文/中文的冒号都可以。",
            "现在的表情包如何使用？批量导入时填写分组名称，一定要填！未分类的表情包不能被char使用（包括你以前的表情包都属于未分类）；然后在侧边栏给char选择他可以使用的表情包分组即可。",
            "以前的表情包统一归类到未分类里，想给char使用时一定要多选时→转移分组→自己分一下类。",
            "偷看手机的数据现在不会退出即清空了，想生成下一次之前点击右上角的删除一键清空即可。",
            "有任何报错请首先在dc小手机区标注内搜索uwu，有自助答疑清单，不要就基础问题消耗无偿答疑老师们的热情，亲亲你们！",
            "过往更新说明 及 功能使用说明 重复观看指路→主屏幕的教程app→更新说明！新手宝宝一定要看哦。",
        ]
    },
    {
        version: "1.5.0",
        date: "2025-12-17",
        notes: [
            "本次更新：应该大大降低了日记生成出错的概率，感谢匿名小宝自发修改测试并提供的修复代码！",
            "匿名小宝捎来讯息：感谢所有一直为爱发电、无私分享代码的开发小手机的老师们！",
            "在此私心也想对所有为爱发电做UwU美化以及答疑解惑的老师们表示感谢！鞠躬——！",
        ]
    },
    {
version: "1.4.0",
date: "2025-12-12",
notes: [
    "本次更新：GitHub云端备份功能上线！指路→主屏幕的【教程】app→划到页面最底部即可看到。（UI从其他地方搬的，懒得做美化了！将就用吧对不起！）",
    "主要功能：一键上传/恢复最新备份。配置好后，备份数据直接存到你自己的GitHub私人仓库里，恢复即从你的仓库中自动选取时间戳最新的备份文件导入恢复。",
    "配置太难不会弄？别慌！点击配置栏旁边的【蓝色小问号图标】，里面内置了手把手的保姆级教程。不要被英文吓到，跟着步骤点几下，配置一次，终身受益。",
    "测试中功能，不一定有用：配置完成后，可根据自身需要开启【自动备份开关】！设置好频率（比如每24小时），以后只要你打开这个网页，它就会在后台悄悄帮你把存档上传到云端，再也不用担心忘记备份了。",
    "特别提醒：为了你的数据安全，在GitHub账户中获取的 Token (以 ghp_ 开头的那一串) 和仓库名称请务必自己保存好，不要发给别人哦！",
    "过往更新说明重复观看指路→主屏幕的教程app→更新说明！",
    ]
    },
    {
        version: "1.3.0",
        date: "2025-11-11",
        notes: [
            "务必仔细观看！重复观看指路→主屏幕的教程app→更新说明！",
            "新增：双语模式，位于聊天界面的侧边栏内，当char为外国人而你想要更沉浸式的对话时，可按需开启，开启后会将“外文中文）”的消息识别成双语消息气泡，注意！中文翻译必须在括号内，点击气泡后展开翻译。",
            "新增：流式传输开关，位于api设置界面，开跟不开不知道有什么区别，总之做了嗯嗯。没改之前默认是流式传输，如果非流出不来就开流式，流式出不来就关流式，都出不来我也没招了！",
            "补充教学：发现有些宝宝还有地方不太清楚怎么使用，补充一下",
            "2. 回忆日记：生成日记后，需点亮该篇日记右上角的☆按钮收藏，收藏后该篇日记才会作为char的回忆加入聊天上下文中",
            "3. 日记使用拓展方法：日记内容可编辑，当日记篇数过多/char被日记内的主观形容影响性格较大时，可以将你需要保留的日记内容复制给某个ai（豆包、deepseek、哈吉米都行）进行大总结，指令参考：以全客观的、不参杂任何主观情绪，以第三人称视角按照时间顺序总结发生过的事件和关键语句。然后将返回的总结塞进日记收藏加入上下文即可。",
        ]
    },
    {
        version: "1.2.0",
        date: "2025-10-15",
        notes: [
            "新增：世界书批量删除功能，长按条目即可进入多选删除模式，支持分类全选。",
        ]
    },
    {
        version: "1.1.0",
        date: "2025-10-13",
        notes: [
            "新增：番茄钟，可以创建专注任务并绑定char和自己的人设预设（仅可从预设中选择），在列表中左滑删除任务。专注期间想摸鱼了可以戳一戳头像，ta会对你做出回复。每个专注界面的设置键可以自定义鼓励频率和限制自己戳一戳的次数，超过次数则ta不会再理你，请补药偷懒，努力专注吧！",
            "新增：两个桌面小组件，现所有小组件都可以通过点击来自定义图片和文字",
        ]
    },
    // ... 其他更新日志可以在 tutorial.js 中处理，这里保留最新的即可，或者全部保留
];

// 全局变量
var db = {
    characters: [],
    groups: [],
    apiSettings: {},
    summaryApiSettings: {},
    backgroundApiSettings: {},
    supplementPersonaApiSettings: {},
    wallpaper: 'https://i.postimg.cc/W4Z9R9x4/ins-1.jpg',
    myStickers: [],
    homeScreenMode: 'night',
    worldBooks: [],
    fontUrl: '',
    localFontName: '',
    customIcons: {},
    customAppNames: {},
    apiPresets: [],
    summaryApiPresets: [],
    backgroundApiPresets: [],
    supplementPersonaApiPresets: [],
    bubbleCssPresets: [],
    myPersonaPresets: [],
    fontPresets: [],
    forumPosts: [],
    globalCss: '',
    globalCssPresets: [],
    homeSignature: '编辑个性签名...',
    forumBindings: {
        worldBookIds: [],
        charIds: [],
        userPersonaIds: []
    },
    pomodoroTasks: [],
    pomodoroSettings: {
        boundCharId: null,
        userPersona: '',
        focusBackground: '',
        taskCardBackground: '',
        encouragementMinutes: 25,
        pokeLimit: 5,
        globalWorldBookIds: []
    },
    insWidgetSettings: {
        avatar1: 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg',
        bubble1: 'love u.',
        avatar2: 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg',
        bubble2: 'miss u.'
    },
    chatFolders: [],
    fontSizeScale: 1.0,
    savedKeyboardHeight: null,
    activePersonaId: null,
    moreProfileCardBg: 'https://i.postimg.cc/XvFDdTKY/Smart-Select-20251013-023208.jpg',
    statusBarPresets: [],
    regexFilterPresets: [],
    themeSettings: {
        global: {
            iconColor: '#000000',
            textColor: '#2a3032',
            titleColor: '#000000',
            backgroundColor: '#ffffff'
        },
        wallpapers: {
            contacts: '',
            chats: '',
            more: ''
        },
        bottomNav: {
            iconColor: '#999999',
            activeIconColor: '#2a3032',
            items: [
                { defaultIcon: '', activeIcon: '' },
                { defaultIcon: '', activeIcon: '' },
                { defaultIcon: '', activeIcon: '' },
                { defaultIcon: '', activeIcon: '' }
            ]
        },
        chatScreen: {
            bottomBarColor: '#ffffff',
            iconColor: '#000000',
            folderPillColor: '#ffffff'
        }
    },
    themePresets: [],
    globalSendSound: '',
    globalReceiveSound: '',
    globalIncomingCallSound: '',
    multiMsgSoundEnabled: false,
    soundPresets: [],
    galleryPresets: [],
    iconPresets: [],
    cotSettings: {
        enabled: false,
        activePresetId: 'default'
    },
    cotPresets: JSON.parse(JSON.stringify(DEFAULT_COT_PRESETS)),
    archives: [],
    favorites: []  // 消息收藏：{ id, messageId, chatId, chatType, chatName, content, timestamp, favoriteTime, note, sender }
};

var currentChatId = null;
var currentChatType = null;
var isGenerating = false;
var currentReplyAbortController = null; // 用于「暂停调用」中止当前 AI 请求（单聊/群聊共用）
var longPressTimer = null;
var isInMultiSelectMode = false;
var editingMessageId = null;
var currentPage = 1;
var currentTransferMessageId = null;
var currentEditingWorldBookId = null;
var currentStickerActionTarget = null;
var currentJournalDetailId = null;
var currentQuoteInfo = null;
var isDebugMode = false;
var currentFolderId = 'all';
var currentFolderActionTarget = null;
var currentGroupAction = {type: null, recipients: []};
var isRawEditMode = false;
var currentPomodoroTask = null;
var pomodoroInterval = null;
var pomodoroRemainingSeconds = 0;
var pomodoroCurrentSessionSeconds = 0;
var isPomodoroPaused = true;
var pomodoroPokeCount = 0;
var pomodoroIsInterrupted = false;
var currentPomodoroSettingsContext = null;
var pomodoroSessionHistory = [];
var isStickerManageMode = false;
var selectedStickerIds = new Set();
var isWorldBookMultiSelectMode = false;
var selectedWorldBookIds = new Set();
var generatingPeekApps = new Set();
var selectedMessageIds = new Set();
var currentStickerCategory = 'recent';
const MESSAGES_PER_PAGE = 50;


// Dexie 数据库初始化
var dexieDB; // 声明全局变量，但不初始化

function initDatabase() {
    dexieDB = new Dexie('章鱼喷墨机DB_ee');
    dexieDB.version(1).stores({
        storage: 'key, value'
    });
    dexieDB.version(2).stores({
        characters: '&id',
        groups: '&id',
        worldBooks: '&id',
        myStickers: '&id',
        globalSettings: 'key'
    }).upgrade(async tx => {
        console.log("Upgrading database to version 2...");
        const oldData = await tx.table('storage').get('章鱼喷墨机');
        if (oldData && oldData.value) {
            console.log("Old data found, starting migration.");
            const data = JSON.parse(oldData.value);
            if (data.characters) await tx.table('characters').bulkPut(data.characters);
            if (data.groups) await tx.table('groups').bulkPut(data.groups);
            if (data.worldBooks) await tx.table('worldBooks').bulkPut(data.worldBooks);
            if (data.myStickers) await tx.table('myStickers').bulkPut(data.myStickers);
            
            const settingsToMigrate = {
                apiSettings: data.apiSettings || {},
                summaryApiSettings: data.summaryApiSettings || {},
                backgroundApiSettings: data.backgroundApiSettings || {},
                wallpaper: data.wallpaper || 'https://i.postimg.cc/W4Z9R9x4/ins-1.jpg',
                homeScreenMode: data.homeScreenMode || 'night',
                fontUrl: data.fontUrl || '',
                localFontName: data.localFontName || '',
                customIcons: data.customIcons || {},
                apiPresets: data.apiPresets || [],
                summaryApiPresets: data.summaryApiPresets || [],
                backgroundApiPresets: data.backgroundApiPresets || [],
                bubbleCssPresets: data.bubbleCssPresets || [],
                myPersonaPresets: data.myPersonaPresets || [],
                globalCss: data.globalCss || '',
                globalCssPresets: data.globalCssPresets || [],
                homeSignature: data.homeSignature || '编辑个性签名...',
                forumPosts: data.forumPosts || [],
                forumBindings: data.forumBindings || { worldBookIds: [], charIds: [], userPersonaIds: [] },
                pomodoroTasks: data.pomodoroTasks || [],
                pomodoroSettings: data.pomodoroSettings || { boundCharId: null, userPersona: '', focusBackground: '', taskCardBackground: '', encouragementMinutes: 25, pokeLimit: 5, globalWorldBookIds: [] },
                insWidgetSettings: data.insWidgetSettings || { avatar1: 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg', bubble1: 'love u.', avatar2: 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg', bubble2: 'miss u.' },
                homeWidgetSettings: data.homeWidgetSettings || defaultWidgetSettings,
            moreProfileCardBg: data.moreProfileCardBg || 'https://i.postimg.cc/XvFDdTKY/Smart-Select-20251013-023208.jpg',
            cotSettings: data.cotSettings || { enabled: false, activePresetId: 'default' },
            cotPresets: data.cotPresets || JSON.parse(JSON.stringify(DEFAULT_COT_PRESETS))
            };

            const settingsPromises = Object.entries(settingsToMigrate).map(([key, value]) =>
                tx.table('globalSettings').put({ key, value })
            );
            await Promise.all(settingsPromises);
            
            await tx.table('storage').delete('章鱼喷墨机');
            console.log("Migration complete. Old data removed.");
        } else {
            console.log("No old data found to migrate.");
        }
    });
    dexieDB.version(3).stores({
        characters: '&id',
        groups: '&id',
        worldBooks: '&id',
        myStickers: '&id',
        globalSettings: 'key',
        archives: '&id,characterId,timestamp'
    });
}

// 数据保存与加载
const saveData = async () => {
    await dexieDB.transaction('rw', dexieDB.tables, async () => {
        await dexieDB.characters.bulkPut(db.characters);
        await dexieDB.groups.bulkPut(db.groups);
        await dexieDB.worldBooks.bulkPut(db.worldBooks);
        await dexieDB.myStickers.bulkPut(db.myStickers);
        if (dexieDB.archives) await dexieDB.archives.bulkPut(db.archives || []);

        const settingsPromises = globalSettingKeys.map(key => {
            if (db[key] !== undefined) {
                return dexieDB.globalSettings.put({ key: key, value: db[key] });
            }
            return null;
        }).filter(p => p);
        await Promise.all(settingsPromises);
    });
};

const loadData = async () => {
    const tables = [
        dexieDB.characters.toArray(),
        dexieDB.groups.toArray(),
        dexieDB.worldBooks.toArray(),
        dexieDB.myStickers.toArray(),
        dexieDB.globalSettings.toArray()
    ];
    if (dexieDB.archives) tables.push(dexieDB.archives.toArray());
    const results = await Promise.all(tables);
    const characters = results[0];
    const groups = results[1];
    const worldBooks = results[2];
    const myStickers = results[3];
    const settingsArray = results[4];
    const archives = results[5];

    db.characters = characters;
    db.groups = groups;
    db.worldBooks = worldBooks;
    db.myStickers = myStickers;
    db.archives = archives || [];

    const settings = settingsArray.reduce((acc, { key, value }) => {
        acc[key] = value;
        return acc;
    }, {});

    globalSettingKeys.forEach(key => {
        const defaultValue = {
            apiSettings: {},
            summaryApiSettings: {},
            backgroundApiSettings: {},
            supplementPersonaApiSettings: {},
            wallpaper: 'https://i.postimg.cc/W4Z9R9x4/ins-1.jpg',
            homeScreenMode: 'night',
            fontUrl: '',
            localFontName: '',
            customIcons: {},
            customAppNames: {},
            apiPresets: [],
            summaryApiPresets: [],
            backgroundApiPresets: [],
            supplementPersonaApiPresets: [],
            bubbleCssPresets: [],
            myPersonaPresets: [],
            fontPresets: [],
            globalCss: '',
            globalCssPresets: [],
            homeSignature: '编辑个性签名...',
            forumPosts: [],
            forumBindings: { worldBookIds: [], charIds: [], userPersonaIds: [] },
            forumUserProfile: { username: '', avatar: 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg', bio: '', joinDate: 0 },
            forumSettings: { postsPerGeneration: 8, commentsPerPost: { min: 4, max: 8 }, generateDetailedStranger: false },
            forumApiSettings: { useForumApi: false, url: '', key: '', model: '', temperature: 0.9 },
            forumMessages: [],
            forumStrangerProfiles: {},
            forumFriendRequests: [],
            forumPendingRequestFromUser: {},
            pomodoroTasks: [],
            pomodoroSettings: { boundCharId: null, userPersona: '', focusBackground: '', taskCardBackground: '', encouragementMinutes: 25, pokeLimit: 5, globalWorldBookIds: [] },
            insWidgetSettings: { avatar1: 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg', bubble1: 'love u.', avatar2: 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg', bubble2: 'miss u.' },
            homeWidgetSettings: defaultWidgetSettings,
            activePersonaId: null,
            moreProfileCardBg: 'https://i.postimg.cc/XvFDdTKY/Smart-Select-20251013-023208.jpg',
            globalSendSound: '',
            globalReceiveSound: '',
            globalIncomingCallSound: '',
            multiMsgSoundEnabled: false,
            soundPresets: [],
            galleryPresets: [],
            iconPresets: [],
            homeWidgetPresets: [],
            widgetWallpaperPresets: [],
            cotSettings: { enabled: false, activePresetId: 'default' },
            cotPresets: JSON.parse(JSON.stringify(DEFAULT_COT_PRESETS)),
            hasSeenVideoCallDisclaimer: false,
            hasSeenVideoCallAvatarHint: false,
            favorites: [],
            piggyBank: { balance: 520, transactions: [] },
            theaterScenarios: [],
            theaterPromptPresets: [],
            theaterHtmlScenarios: [],
            theaterHtmlPromptPresets: [],
            theaterMode: 'text',
            theaterApiSettings: { useTheaterApi: false, url: '', key: '', model: '' }
        };
        db[key] = settings[key] !== undefined ? settings[key] : (defaultValue[key] !== undefined ? JSON.parse(JSON.stringify(defaultValue[key])) : undefined);
    });

    if (!db.piggyBank) db.piggyBank = { balance: 520, transactions: [] };
    if (typeof db.piggyBank.balance !== 'number') db.piggyBank.balance = 520;
    if (!Array.isArray(db.piggyBank.transactions)) db.piggyBank.transactions = [];
    if (!db.forumStrangerProfiles || typeof db.forumStrangerProfiles !== 'object') db.forumStrangerProfiles = {};
    if (!Array.isArray(db.forumFriendRequests)) db.forumFriendRequests = [];
    if (!db.forumPendingRequestFromUser || typeof db.forumPendingRequestFromUser !== 'object') db.forumPendingRequestFromUser = {};
    if (db.forumSettings && db.forumSettings.generateDetailedStranger === undefined) db.forumSettings.generateDetailedStranger = false;
    if (db.forumSettings && db.forumSettings.enableCharAltDm === undefined) db.forumSettings.enableCharAltDm = false;
    if (db.forumSettings && !Array.isArray(db.forumSettings.charAltCharIds)) db.forumSettings.charAltCharIds = [];
    if (db.forumSettings && db.forumSettings.charAltProbability === undefined) db.forumSettings.charAltProbability = 25;
    if (db.forumSettings && (db.forumSettings.charAltNames === undefined || typeof db.forumSettings.charAltNames !== 'object')) db.forumSettings.charAltNames = {};

    // Data integrity checks
    db.characters.forEach(c => {
        if (!c.peekData) c.peekData = {}; 
        if (c.isPinned === undefined) c.isPinned = false;
        if (c.status === undefined) c.status = '在线';
        if (!c.worldBookIds) c.worldBookIds = [];
        if (c.customBubbleCss === undefined) c.customBubbleCss = '';
        if (c.useCustomBubbleCss === undefined) c.useCustomBubbleCss = false;
        if (c.allowCharSwitchBubbleCss === undefined) c.allowCharSwitchBubbleCss = false;
        if (!Array.isArray(c.bubbleCssThemeBindings)) c.bubbleCssThemeBindings = [];
        if (c.currentBubbleCssPresetName === undefined) c.currentBubbleCssPresetName = '';
        if (c.themeJustChangedByUser === undefined) c.themeJustChangedByUser = '';
        if (c.showTimestamp === undefined) c.showTimestamp = false;
        if (c.timestampPosition === undefined) c.timestampPosition = 'below_avatar';
        if (!c.statusPanel) {
            c.statusPanel = {
                enabled: false,
                promptSuffix: '',
                regexPattern: '',
                replacePattern: '',
                historyLimit: 3,
                currentStatusRaw: '',
                currentStatusHtml: '',
                history: []
            };
        }
        if (!c.regexFilter) {
            c.regexFilter = {
                enabled: false,
                rules: []
            };
        }
        if (!c.autoReply) {
            c.autoReply = {
                enabled: false,
                interval: 60,
                lastTriggerTime: 0
            };
        }
        if (!c.gallery) c.gallery = [];
        if (c.useRealGallery === undefined) c.useRealGallery = false;
        if (!c.callHistory) c.callHistory = [];
    });
    db.groups.forEach(g => {
        if (g.isPinned === undefined) g.isPinned = false;
        if (!g.worldBookIds) g.worldBookIds = [];
        if (g.customBubbleCss === undefined) g.customBubbleCss = '';
        if (g.useCustomBubbleCss === undefined) g.useCustomBubbleCss = false;
        if (g.showTimestamp === undefined) g.showTimestamp = false;
        if (g.timestampPosition === undefined) g.timestampPosition = 'below_avatar';
        if (!g.callHistory) g.callHistory = [];
    });
    
    // Handle old localStorage data if it exists
    const oldLocalStorageData = localStorage.getItem('gemini-chat-app-db');
    if(oldLocalStorageData) {
        console.log("Found old localStorage data, migrating...");
        const data = JSON.parse(oldLocalStorageData);
        await dexieDB.transaction('rw', dexieDB.tables, async () => {
            if (data.characters) await dexieDB.characters.bulkPut(data.characters);
            if (data.groups) await dexieDB.groups.bulkPut(data.groups);
        });
        localStorage.removeItem('gemini-chat-app-db');
        await loadData();
    }
};

// 存储分析工具
const dataStorage = {
    getStorageInfo: async function() {
        const stringify = (obj) => {
            try {
                return JSON.stringify(obj).length;
            } catch (e) {
                console.warn("Could not stringify object for size calculation:", obj, e);
                return 0;
            }
        };

        let categorizedSizes = {
            messages: 0,
            charactersAndGroups: 0,
            worldAndForum: 0,
            personalization: 0,
            apiAndCore: 0,
            other: 0
        };

        if (!db || !db.characters) {
            await loadData();
        }

        // 1. Messages (History)
        (db.characters || []).forEach(char => {
            categorizedSizes.messages += stringify(char.history);
        });
        (db.groups || []).forEach(group => {
            categorizedSizes.messages += stringify(group.history);
        });

        // 2. Characters and Groups (metadata)
        (db.characters || []).forEach(char => {
            const charWithoutHistory = { ...char, history: undefined };
            categorizedSizes.charactersAndGroups += stringify(charWithoutHistory);
        });
        (db.groups || []).forEach(group => {
            const groupWithoutHistory = { ...group, history: undefined };
            categorizedSizes.charactersAndGroups += stringify(groupWithoutHistory);
        });

        // 3. World and Forum
        categorizedSizes.worldAndForum += stringify(db.worldBooks);
        categorizedSizes.worldAndForum += stringify(db.forumPosts);
        categorizedSizes.worldAndForum += stringify(db.forumBindings);

        // 4. Personalization
        categorizedSizes.personalization += stringify(db.myStickers);
        categorizedSizes.personalization += stringify(db.wallpaper);
        categorizedSizes.personalization += stringify(db.homeScreenMode);
        categorizedSizes.personalization += stringify(db.fontUrl);
        categorizedSizes.personalization += stringify(db.localFontName);
        categorizedSizes.personalization += stringify(db.customIcons);
        categorizedSizes.personalization += stringify(db.bubbleCssPresets);
        categorizedSizes.personalization += stringify(db.myPersonaPresets);
        categorizedSizes.personalization += stringify(db.globalCss);
        categorizedSizes.personalization += stringify(db.globalCssPresets);
        categorizedSizes.personalization += stringify(db.homeSignature);
        categorizedSizes.personalization += stringify(db.pomodoroTasks);
        categorizedSizes.personalization += stringify(db.pomodoroSettings);
        categorizedSizes.personalization += stringify(db.insWidgetSettings);
        categorizedSizes.personalization += stringify(db.homeWidgetSettings);
        categorizedSizes.personalization += stringify(db.moreProfileCardBg);
        categorizedSizes.personalization += stringify(db.soundPresets);
        categorizedSizes.personalization += stringify(db.iconPresets);

        // 5. API and Core
        categorizedSizes.apiAndCore += stringify(db.apiSettings);
        categorizedSizes.apiAndCore += stringify(db.apiPresets);
        categorizedSizes.apiAndCore += stringify(db.cotSettings);
        categorizedSizes.apiAndCore += stringify(db.cotPresets);

        const totalSize = Object.values(categorizedSizes).reduce((sum, size) => sum + size, 0);

        return {
            totalSize,
            categorizedSizes
        };
    }
};
