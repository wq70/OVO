document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initConverter();
    initBubbleMaker();
});

// --- Tab 切换逻辑 ---
function initTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // 移除所有 active
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            // 激活当前
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        });
    });
}

// --- 旧版转换器逻辑 ---
function initConverter() {
    const convertBtn = document.getElementById('conv-action-btn');
    const copyBtn = document.getElementById('conv-copy-btn');
    
    if (convertBtn) {
        convertBtn.addEventListener('click', function() {
            let output = document.getElementById('conv-input-css').value;

            // 0. 清理过时的复杂样式
            output = output.replace(/([^{}]*#sticker-bar[^{}]*)\{[^}]*\}/gi, '/* [已删除过时的 sticker-bar 样式] */');
            output = output.replace(/([^{}]*\.message-input-area[^{}]*)\{([^}]*padding-left:\s*50px[^}]*)\}/gi, '/* [已删除过时的 input-area 样式] */');

            // 1. 顶栏图标: img -> svg
            output = output.replace(/(\.back-btn|#peek-btn)(\s+|>)?img/g, '$1$2svg');

            // 2. 发送按钮 -> 表情包按钮
            output = output.replace(/#send-message-btn(\s+|>)?svg/g, '#sticker-toggle-btn$1img');
            output = output.replace(/#send-message-btn/g, '#sticker-toggle-btn');
            output = output.replace(/\.send-btn(\s+|>)?svg/g, '#sticker-toggle-btn$1img');
            
            // 5. 布局修正 (Title)
            const titleSelectors = [
                '.title-container',
                '.app-header .title',
                '#chat-room-header-default .title-container',
                '.app-header .title-container'
            ];

            output = output.replace(/([^{}]*)\{([^}]*)\}/g, (match, selector, content) => {
                if (titleSelectors.some(s => selector.replace(/\s+/g, ' ').includes(s))) {
                    const newContent = content.replace(/(?<!-)(\b(?:position|left|top|right|bottom|transform|margin-left|text-align|float)\s*:[^;]+;?)/gi, '/* $1 (已自动注释: 新版默认居中) */');
                    return `${selector}{${newContent}}`;
                }
                return match;
            });

            // 6. 自动补全 display: none
            let extraCSS = [];
            if (/\.back-btn\s*\{[^}]*background-image:/i.test(output) && !/\.back-btn\s+svg\s*\{[^}]*display:\s*none/i.test(output)) {
                extraCSS.push('.back-btn svg { display: none !important; }');
            }
            if (/#sticker-toggle-btn\s*\{[^}]*background-image:/i.test(output) && !/#sticker-toggle-btn\s+img\s*\{[^}]*display:\s*none/i.test(output)) {
                extraCSS.push('#sticker-toggle-btn img { display: none !important; }');
            }
            if (/#peek-btn\s*\{[^}]*background-image:/i.test(output) && !/#peek-btn\s+svg\s*\{[^}]*display:\s*none/i.test(output)) {
                extraCSS.push('#peek-btn svg { display: none !important; }');
            }
            if (/#chat-settings-btn\s*\{[^}]*background-image:/i.test(output) && !/#chat-settings-btn\s+svg\s*\{[^}]*display:\s*none/i.test(output)) {
                extraCSS.push('#chat-settings-btn svg { display: none !important; }');
            }

            if (extraCSS.length > 0) {
                output += '\n\n/* --- 自动补充的隐藏代码 --- */\n' + extraCSS.join('\n');
            }

            output = output.replace(/\n\s*\n\s*\n/g, '\n\n');
            document.getElementById('conv-output-css').value = output;
        });
    }

    if (copyBtn) {
        copyBtn.addEventListener('click', function() {
            copyToClipboard(document.getElementById('conv-output-css'), this);
        });
    }
}

// --- 气泡制作器逻辑 ---
function initBubbleMaker() {
    // 参数 Tab 切换逻辑
    const paramTabs = document.querySelectorAll('.param-tab-btn');
    const paramContents = document.querySelectorAll('.param-tab-content');

    paramTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            paramTabs.forEach(t => t.classList.remove('active'));
            paramContents.forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');

            // 安全区可视化逻辑
            const previewContainer = document.getElementById('preview-chat-container');
            if (targetId === 'pt-spacing') {
                previewContainer.classList.add('show-safe-area');
            } else {
                previewContainer.classList.remove('show-safe-area');
            }
        });
    });

    // 默认配置模板
    const defaultConfig = {
        imgUrl: '',
        naturalWidth: 0,
        naturalHeight: 0,
        slice: { top: 0, right: 0, bottom: 0, left: 0 },
        borderWidth: 20,
        lockRatio: false, // 新增：锁定原始比例
        imageOutset: { top: 0, right: 0, bottom: 0, left: 0 },
        textInset: 0,
        textColor: '#000000',
        padding: { top: 10, right: 10, bottom: 10, left: 10 },
        marginTop: 0 // 仅连发有效
    };

    // 全局状态：存储配置
    const configs = {
        sent: {
            normal: JSON.parse(JSON.stringify(defaultConfig)),
            first: JSON.parse(JSON.stringify(defaultConfig)),
            consecutive: JSON.parse(JSON.stringify(defaultConfig))
        },
        received: {
            normal: JSON.parse(JSON.stringify(defaultConfig)),
            first: JSON.parse(JSON.stringify(defaultConfig)),
            consecutive: JSON.parse(JSON.stringify(defaultConfig))
        }
    };

    let currentSide = 'sent'; // 'sent' | 'received'
    let currentType = 'normal'; // 'normal' | 'first' | 'consecutive'
    
    // 缓存最近一次手动调整的参数，用于跨配置继承
    let lastActiveParams = null;

    // DOM 元素
    const fileInput = document.getElementById('bubble-file-input');
    const dropZone = document.getElementById('upload-drop-zone');
    const urlInput = document.getElementById('bubble-url-input');
    const loadUrlBtn = document.getElementById('bubble-load-url-btn');
    const resetBtn = document.getElementById('bubble-reset-btn');
    const editorWorkspace = document.getElementById('editor-workspace');
    const sliceImg = document.getElementById('slice-img');
    const currentConfigName = document.getElementById('current-config-name');
    const marginControlSection = document.getElementById('margin-control-section');
    
    const colorInput = document.getElementById('input-text-color');
    const colorHexInput = document.getElementById('input-text-color-hex');

    // ImgBB 元素
    const imgbbUploadBtn = document.getElementById('imgbb-upload-btn');
    const imgbbSettingBtn = document.getElementById('imgbb-setting-btn');

    // 切换按钮
    const sideBtns = document.querySelectorAll('.toggle-btn[data-side]');
    const typeBtns = document.querySelectorAll('.toggle-btn[data-type]');

    // 控制器 DOM
    const inputs = {
        sliceTop: document.getElementById('input-slice-top'),
        sliceBottom: document.getElementById('input-slice-bottom'),
        sliceLeft: document.getElementById('input-slice-left'),
        sliceRight: document.getElementById('input-slice-right'),
        borderWidth: document.getElementById('input-border-width'),
        lockRatio: document.getElementById('input-lock-ratio'), // 新增
        
        outsetTop: document.getElementById('input-outset-top'),
        outsetBottom: document.getElementById('input-outset-bottom'),
        outsetLeft: document.getElementById('input-outset-left'),
        outsetRight: document.getElementById('input-outset-right'),
        
        textInset: document.getElementById('input-text-inset'),
        marginTop: document.getElementById('input-margin-top'),
        padTop: document.getElementById('input-pad-top'),
        padBottom: document.getElementById('input-pad-bottom'),
        padLeft: document.getElementById('input-pad-left'),
        padRight: document.getElementById('input-pad-right')
    };

    const autoOutsetBtn = document.getElementById('btn-auto-outset');

    // 显示数值的 DOM
    const displays = {
        sliceTop: document.getElementById('val-slice-top'),
        sliceBottom: document.getElementById('val-slice-bottom'),
        sliceLeft: document.getElementById('val-slice-left'),
        sliceRight: document.getElementById('val-slice-right'),
        borderWidth: document.getElementById('val-border-width'),
        
        outsetTop: document.getElementById('val-outset-top'),
        outsetBottom: document.getElementById('val-outset-bottom'),
        outsetLeft: document.getElementById('val-outset-left'),
        outsetRight: document.getElementById('val-outset-right'),
        
        textInset: document.getElementById('val-text-inset'),
        marginTop: document.getElementById('val-margin-top'),
        padTop: document.getElementById('val-pad-top'),
        padBottom: document.getElementById('val-pad-bottom'),
        padLeft: document.getElementById('val-pad-left'),
        padRight: document.getElementById('val-pad-right')
    };

    // 切割线 DOM
    const lines = {
        top: document.getElementById('slice-line-top'),
        bottom: document.getElementById('slice-line-bottom'),
        left: document.getElementById('slice-line-left'),
        right: document.getElementById('slice-line-right')
    };

    const cssOutput = document.getElementById('export-css');
    const copyCssBtn = document.getElementById('copy-css-btn');
    const previewChatContainer = document.getElementById('preview-chat-container');
    const previewStyle = document.getElementById('preview-style');

    // --- 切换逻辑 ---
    function switchConfig(side, type) {
        if (side) currentSide = side;
        if (type) currentType = type;

        // 更新按钮状态
        sideBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.side === currentSide));
        typeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.type === currentType));

        // 更新提示文字
        const sideText = currentSide === 'sent' ? '我方' : 'AI方';
        let typeText = '正常';
        if (currentType === 'first') typeText = '首发';
        if (currentType === 'consecutive') typeText = '连发';
        
        currentConfigName.textContent = `${sideText}-${typeText}`;

        // 显示/隐藏连发间距控制
        marginControlSection.style.display = currentType === 'consecutive' ? 'block' : 'none';

        // 加载配置到界面
        loadConfigToUI();
    }

    function loadConfigToUI() {
        const config = configs[currentSide][currentType];
        
        // 加载图片
        if (config.imgUrl) {
            sliceImg.src = config.imgUrl;
            editorWorkspace.style.display = 'flex';
            // 更新滑块最大值
            updateSliderMax(config.naturalWidth, config.naturalHeight);
        } else {
            sliceImg.src = ''; 
        }

        // 加载数值到滑块
        inputs.sliceTop.value = config.slice.top;
        inputs.sliceBottom.value = config.slice.bottom;
        inputs.sliceLeft.value = config.slice.left;
        inputs.sliceRight.value = config.slice.right;
        
        inputs.borderWidth.value = config.borderWidth;
        inputs.lockRatio.checked = config.lockRatio || false; // 新增
        
        // 加载 Outset
        const outset = config.imageOutset || { top: 0, right: 0, bottom: 0, left: 0 };
        inputs.outsetTop.value = outset.top;
        inputs.outsetBottom.value = outset.bottom;
        inputs.outsetLeft.value = outset.left;
        inputs.outsetRight.value = outset.right;
        
        inputs.textInset.value = config.textInset;
        inputs.marginTop.value = config.marginTop;
        
        // 加载颜色
        const color = config.textColor || '#000000';
        colorInput.value = color;
        colorHexInput.value = color;

        inputs.padTop.value = config.padding.top;
        inputs.padBottom.value = config.padding.bottom;
        inputs.padLeft.value = config.padding.left;
        inputs.padRight.value = config.padding.right;

        updateDisplays();
        updateLines();
        updatePreview(); // 重新生成预览和CSS
    }

    function updateSliderMax(w, h) {
        if (!w || !h) return;
        inputs.sliceTop.max = h;
        inputs.sliceBottom.max = h;
        inputs.sliceLeft.max = w;
        inputs.sliceRight.max = w;
    }

    // 绑定切换事件
    sideBtns.forEach(btn => btn.addEventListener('click', () => switchConfig(btn.dataset.side, null)));
    typeBtns.forEach(btn => btn.addEventListener('click', () => switchConfig(null, btn.dataset.type)));

    // 自动外推按钮逻辑
    if (autoOutsetBtn) {
        autoOutsetBtn.addEventListener('click', () => {
            const config = configs[currentSide][currentType];
            const layoutWidth = parseInt(inputs.borderWidth.value);
            
            let imgTop, imgRight, imgBottom, imgLeft;
            
            if (config.lockRatio) {
                imgTop = config.slice.top;
                imgRight = config.slice.right;
                imgBottom = config.slice.bottom;
                imgLeft = config.slice.left;
            } else {
                imgTop = imgRight = imgBottom = imgLeft = layoutWidth;
            }
            
            // 计算 Outset = max(0, imgDim - layoutDim)
            inputs.outsetTop.value = Math.max(0, imgTop - layoutWidth);
            inputs.outsetRight.value = Math.max(0, imgRight - layoutWidth);
            inputs.outsetBottom.value = Math.max(0, imgBottom - layoutWidth);
            inputs.outsetLeft.value = Math.max(0, imgLeft - layoutWidth);
            
            updateStateFromInputs();
        });
    }

    // --- 图片加载 ---
    function loadImage(src) {
        const img = new Image();
        img.onload = () => {
            const config = configs[currentSide][currentType];
            config.imgUrl = src;
            config.naturalWidth = img.naturalWidth;
            config.naturalHeight = img.naturalHeight;
            
            // 智能应用参数：如果有缓存参数则继承，否则使用默认
            applySmartDefaults(config);
            
            loadConfigToUI();
        };
        img.onerror = () => {
            alert('图片加载失败，请检查 URL 或文件是否有效。');
        };
        img.src = src;
    }

    function applySmartDefaults(config) {
        // 如果有最近使用的参数，尝试继承
        if (lastActiveParams) {
            // 继承数值参数
            config.borderWidth = lastActiveParams.borderWidth;
            config.lockRatio = lastActiveParams.lockRatio || false; // 新增
            config.imageOutset = { ...lastActiveParams.imageOutset };
            config.textInset = lastActiveParams.textInset;
            config.marginTop = lastActiveParams.marginTop;
            config.textColor = lastActiveParams.textColor;
            config.padding = { ...lastActiveParams.padding };
            
            // 智能继承 Slice (防越界)
            const w = config.naturalWidth;
            const h = config.naturalHeight;
            
            // 辅助函数：确保值在合理范围内，否则重置为 1/3
            const safeVal = (val, max) => (val < max ? val : Math.floor(max / 3));
            
            config.slice.top = safeVal(lastActiveParams.slice.top, h);
            config.slice.bottom = safeVal(lastActiveParams.slice.bottom, h);
            config.slice.left = safeVal(lastActiveParams.slice.left, w);
            config.slice.right = safeVal(lastActiveParams.slice.right, w);
            
        } else {
            // 没有缓存，使用默认初始化
            resetCurrentConfigDefaults(config);
        }
    }

    function resetCurrentConfigDefaults(config) {
        const w = config.naturalWidth || 100;
        const h = config.naturalHeight || 100;
        config.slice.top = Math.floor(h / 3);
        config.slice.bottom = Math.floor(h / 3);
        config.slice.left = Math.floor(w / 3);
        config.slice.right = Math.floor(w / 3);
        config.borderWidth = 20;
        config.lockRatio = false; // 新增
        config.imageOutset = { top: 0, right: 0, bottom: 0, left: 0 };
        config.textInset = 0;
        config.padding = { top: 10, right: 10, bottom: 10, left: 10 };
        config.marginTop = 0;
        config.textColor = '#000000';
    }

    // 颜色同步逻辑
    colorInput.addEventListener('input', (e) => {
        colorHexInput.value = e.target.value;
        updateStateFromInputs();
    });
    colorHexInput.addEventListener('input', (e) => {
        const val = e.target.value;
        if (/^#[0-9A-F]{6}$/i.test(val)) {
            colorInput.value = val;
            updateStateFromInputs();
        }
    });

    // 事件监听：上传
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (evt) => loadImage(evt.target.result);
            reader.readAsDataURL(e.target.files[0]);
        }
    });
    loadUrlBtn.addEventListener('click', () => {
        if (urlInput.value.trim()) loadImage(urlInput.value.trim());
    });

    // 重置按钮逻辑
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (!confirm('确定要重置当前配置吗？图片和参数将丢失。')) return;
            
            const config = configs[currentSide][currentType];
            config.imgUrl = '';
            config.naturalWidth = 0;
            config.naturalHeight = 0;
            
            resetCurrentConfigDefaults(config);
            
            // 清空输入框
            fileInput.value = '';
            urlInput.value = '';
            
            // 隐藏编辑器
            editorWorkspace.style.display = 'none';
            sliceImg.src = '';
            
            // 更新 UI
            loadConfigToUI();
        });
    }

    // --- 交互更新 ---
    function updateStateFromInputs() {
        const config = configs[currentSide][currentType];
        
        config.slice.top = parseInt(inputs.sliceTop.value);
        config.slice.bottom = parseInt(inputs.sliceBottom.value);
        config.slice.left = parseInt(inputs.sliceLeft.value);
        config.slice.right = parseInt(inputs.sliceRight.value);
        
        config.borderWidth = parseInt(inputs.borderWidth.value);
        config.lockRatio = inputs.lockRatio.checked; // 新增
        
        // 更新 Outset 对象
        if (!config.imageOutset) config.imageOutset = { top: 0, right: 0, bottom: 0, left: 0 };
        config.imageOutset.top = parseInt(inputs.outsetTop.value);
        config.imageOutset.bottom = parseInt(inputs.outsetBottom.value);
        config.imageOutset.left = parseInt(inputs.outsetLeft.value);
        config.imageOutset.right = parseInt(inputs.outsetRight.value);
        
        config.textInset = parseInt(inputs.textInset.value);
        config.marginTop = parseInt(inputs.marginTop.value);
        config.textColor = colorHexInput.value;
        
        config.padding.top = parseInt(inputs.padTop.value);
        config.padding.bottom = parseInt(inputs.padBottom.value);
        config.padding.left = parseInt(inputs.padLeft.value);
        config.padding.right = parseInt(inputs.padRight.value);

        // 实时缓存当前参数，供下次继承使用
        lastActiveParams = {
            slice: { ...config.slice },
            borderWidth: config.borderWidth,
            lockRatio: config.lockRatio, // 新增
            imageOutset: { ...config.imageOutset },
            textInset: config.textInset,
            marginTop: config.marginTop,
            textColor: config.textColor,
            padding: { ...config.padding }
        };

        updateDisplays();
        updateLines();
        updatePreview();
    }

    function updateDisplays() {
        const config = configs[currentSide][currentType];
        displays.sliceTop.textContent = config.slice.top;
        displays.sliceBottom.textContent = config.slice.bottom;
        displays.sliceLeft.textContent = config.slice.left;
        displays.sliceRight.textContent = config.slice.right;
        
        displays.borderWidth.textContent = config.borderWidth + 'px';
        
        const outset = config.imageOutset || { top: 0, right: 0, bottom: 0, left: 0 };
        displays.outsetTop.textContent = outset.top;
        displays.outsetBottom.textContent = outset.bottom;
        displays.outsetLeft.textContent = outset.left;
        displays.outsetRight.textContent = outset.right;
        
        displays.textInset.textContent = config.textInset + 'px';
        displays.marginTop.textContent = config.marginTop + 'px';
        
        displays.padTop.textContent = config.padding.top;
        displays.padBottom.textContent = config.padding.bottom;
        displays.padLeft.textContent = config.padding.left;
        displays.padRight.textContent = config.padding.right;
    }

    function updateLines() {
        const config = configs[currentSide][currentType];
        if (!config.naturalWidth) return;

        const topPct = (config.slice.top / config.naturalHeight) * 100;
        const bottomPct = (config.slice.bottom / config.naturalHeight) * 100;
        const leftPct = (config.slice.left / config.naturalWidth) * 100;
        const rightPct = (config.slice.right / config.naturalWidth) * 100;

        lines.top.style.top = topPct + '%';
        lines.bottom.style.bottom = bottomPct + '%';
        lines.left.style.left = leftPct + '%';
        lines.right.style.right = rightPct + '%';
    }

    // --- 核心：生成 CSS 和 预览 ---
    function updatePreview() {
        // 1. 生成 CSS 字符串
        let css = '';
        let previewCss = ''; // 用于预览区的 CSS (类名不同)

        // 辅助函数：生成单个气泡的样式块
        const generateBlock = (selector, config, isPreview = false) => {
            if (!config.imgUrl) return '';
            const actualBorderWidth = Math.max(0, config.borderWidth - config.textInset);
            // 已解除 Base64 限制，允许直接导出
            const imgSource = config.imgUrl;
            
            const outset = config.imageOutset || { top: 0, right: 0, bottom: 0, left: 0 };
            
            // 锁定比例逻辑
            let borderImageWidthValue;
            if (config.lockRatio) {
                // 使用 Slice 的值作为显示宽度，保证 1:1 比例
                borderImageWidthValue = `${config.slice.top}px ${config.slice.right}px ${config.slice.bottom}px ${config.slice.left}px`;
            } else {
                // 使用统一的 Border Width
                borderImageWidthValue = `${config.borderWidth}px`;
            }
            
            let block = `${selector} {\n`;
            block += `    border-image-source: url('${imgSource}');\n`;
            block += `    border-image-slice: ${config.slice.top} ${config.slice.right} ${config.slice.bottom} ${config.slice.left} fill;\n`;
            block += `    border-image-width: ${borderImageWidthValue};\n`; // 使用计算后的值
            block += `    border-image-outset: ${outset.top}px ${outset.right}px ${outset.bottom}px ${outset.left}px;\n`;
            block += `    border-image-repeat: stretch;\n`;
            block += `    border-style: solid;\n`;
            block += `    border-width: ${actualBorderWidth}px;\n`;
            block += `    padding: ${config.padding.top}px ${config.padding.right}px ${config.padding.bottom}px ${config.padding.left}px !important;\n`;
            block += `    color: ${config.textColor} !important;\n`;
            block += `    background: none !important;\n`;
            block += `    border-radius: 0 !important;\n`;
            block += `    box-shadow: none !important;\n`;
            block += `    backdrop-filter: none !important;\n`;
            block += `}\n`;
            return block;
        };

        // 生成 Sent (我方)
        const sentNormal = configs.sent.normal;
        const sentFirst = configs.sent.first;
        const sentConsecutive = configs.sent.consecutive;

        if (sentNormal.imgUrl || sentFirst.imgUrl) {
            css += `/* --- 我方 (Sent) --- */\n`;
            
            // 基础样式：优先使用 First，如果没有则使用 Normal
            const baseConfig = sentFirst.imgUrl ? sentFirst : sentNormal;
            css += generateBlock('.message-bubble.sent', baseConfig);
            previewCss += generateBlock('.preview-bubble.sent', baseConfig, true);

            // 连发样式
            if (sentConsecutive.imgUrl) {
                css += generateBlock('.message-wrapper.sent + .message-wrapper.sent .message-bubble.sent', sentConsecutive);
                previewCss += generateBlock('.preview-wrapper.sent + .preview-wrapper.sent .preview-bubble.sent', sentConsecutive, true);
                
                if (sentConsecutive.marginTop !== 0) {
                    css += `.message-wrapper.sent + .message-wrapper.sent { margin-top: ${sentConsecutive.marginTop}px; }\n`;
                    previewCss += `.preview-wrapper.sent + .preview-wrapper.sent { margin-top: ${sentConsecutive.marginTop}px; }\n`;
                }
                css += `.message-wrapper.sent + .message-wrapper.sent .message-avatar { visibility: hidden; height: 0; margin: 0; }\n`;
            }
        }

        // 生成 Received (AI方)
        const receivedNormal = configs.received.normal;
        const receivedFirst = configs.received.first;
        const receivedConsecutive = configs.received.consecutive;

        if (receivedNormal.imgUrl || receivedFirst.imgUrl) {
            css += `\n/* --- AI方 (Received) --- */\n`;
            
            const baseConfig = receivedFirst.imgUrl ? receivedFirst : receivedNormal;
            css += generateBlock('.message-bubble.received', baseConfig);
            previewCss += generateBlock('.preview-bubble.received', baseConfig, true);

            if (receivedConsecutive.imgUrl) {
                css += generateBlock('.message-wrapper.received + .message-wrapper.received .message-bubble.received', receivedConsecutive);
                previewCss += generateBlock('.preview-wrapper.received + .preview-wrapper.received .preview-bubble.received', receivedConsecutive, true);
                
                if (receivedConsecutive.marginTop !== 0) {
                    css += `.message-wrapper.received + .message-wrapper.received { margin-top: ${receivedConsecutive.marginTop}px; }\n`;
                    previewCss += `.preview-wrapper.received + .preview-wrapper.received { margin-top: ${receivedConsecutive.marginTop}px; }\n`;
                }
                css += `.message-wrapper.received + .message-wrapper.received .message-avatar { visibility: hidden; height: 0; margin: 0; }\n`;
            }
        }

        // 2. 更新导出区域
        cssOutput.value = css || '/* 请先上传图片并调整参数 */';

        // 3. 更新预览样式
        previewStyle.textContent = previewCss;

        // 4. 更新预览 HTML 结构
        renderPreviewHtml();
    }

    function renderPreviewHtml() {
        const side = currentSide; // 'sent' or 'received'
        const alignClass = side;
        
        let html = '';
        
        // 如果是 Normal 模式，展示 3 个相同的气泡
        if (currentType === 'normal') {
             html += `
            <div class="preview-wrapper ${alignClass}">
                <div class="preview-bubble ${alignClass}"><div class="preview-content">正常气泡 1</div></div>
            </div>
            <div class="preview-wrapper ${alignClass}">
                <div class="preview-bubble ${alignClass}"><div class="preview-content">正常气泡 2</div></div>
            </div>
            <div class="preview-wrapper ${alignClass}">
                <div class="preview-bubble ${alignClass}"><div class="preview-content">正常气泡 3 (多行文本测试)</div></div>
            </div>`;
        } else {
            // 如果是 First/Consecutive 模式，展示组合效果
            html += `
            <div class="preview-wrapper ${alignClass}">
                <div class="preview-bubble ${alignClass}"><div class="preview-content">首发消息</div></div>
            </div>`;

            if (configs[side].consecutive.imgUrl) {
                html += `
                <div class="preview-wrapper ${alignClass}">
                    <div class="preview-bubble ${alignClass}"><div class="preview-content">连发消息 (紧凑)</div></div>
                </div>
                <div class="preview-wrapper ${alignClass}">
                    <div class="preview-bubble ${alignClass}"><div class="preview-content">这是一条<br>多行文本的<br>连发消息测试</div></div>
                </div>`;
            } else {
                 html += `
                <div class="preview-wrapper ${alignClass}">
                    <div class="preview-bubble ${alignClass}"><div class="preview-content">第二条消息 (未配置连发)</div></div>
                </div>`;
            }
        }

        previewChatContainer.innerHTML = html;
    }

    // 绑定所有 Input 事件
    Object.values(inputs).forEach(input => {
        input.addEventListener('input', updateStateFromInputs);
    });
    // 绑定 Checkbox 事件
    inputs.lockRatio.addEventListener('change', updateStateFromInputs);

    // 背景切换
    document.querySelectorAll('.bg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.bg-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('preview-stage').style.background = btn.getAttribute('data-bg');
        });
    });

    // 复制 CSS
    copyCssBtn.addEventListener('click', () => {
        copyToClipboard(cssOutput, copyCssBtn);
    });

    // --- 切割线拖动逻辑 ---
    function initSliceDragger() {
        const img = document.getElementById('slice-img');
        let activeLine = null;
        
        const lines = {
            top: document.getElementById('slice-line-top'),
            bottom: document.getElementById('slice-line-bottom'),
            left: document.getElementById('slice-line-left'),
            right: document.getElementById('slice-line-right')
        };

        // 绑定开始事件
        Object.entries(lines).forEach(([key, line]) => {
            line.addEventListener('mousedown', (e) => startDrag(e, key));
            line.addEventListener('touchstart', (e) => startDrag(e, key), { passive: false });
        });

        function startDrag(e, key) {
            e.preventDefault();
            activeLine = key;
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('touchmove', onDrag, { passive: false });
            document.addEventListener('mouseup', stopDrag);
            document.addEventListener('touchend', stopDrag);
            lines[key].classList.add('dragging');
        }

        function onDrag(e) {
            if (!activeLine) return;
            e.preventDefault();
            
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            
            const rect = img.getBoundingClientRect();
            const config = configs[currentSide][currentType];
            
            if (!config.naturalWidth) return;

            const scaleX = config.naturalWidth / rect.width;
            const scaleY = config.naturalHeight / rect.height;
            
            // 计算相对于图片的坐标
            let x = (clientX - rect.left) * scaleX;
            let y = (clientY - rect.top) * scaleY;
            
            // 限制范围
            x = Math.max(0, Math.min(x, config.naturalWidth));
            y = Math.max(0, Math.min(y, config.naturalHeight));
            
            // 更新值
            if (activeLine === 'top') {
                inputs.sliceTop.value = Math.round(y);
            } else if (activeLine === 'bottom') {
                inputs.sliceBottom.value = Math.round(config.naturalHeight - y);
            } else if (activeLine === 'left') {
                inputs.sliceLeft.value = Math.round(x);
            } else if (activeLine === 'right') {
                inputs.sliceRight.value = Math.round(config.naturalWidth - x);
            }
            
            updateStateFromInputs();
        }

        function stopDrag() {
            if (activeLine) {
                lines[activeLine].classList.remove('dragging');
                activeLine = null;
            }
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('touchmove', onDrag);
            document.removeEventListener('mouseup', stopDrag);
            document.removeEventListener('touchend', stopDrag);
        }
    }
    initSliceDragger();

    // --- ImgBB 上传逻辑 ---
    if (imgbbUploadBtn && imgbbSettingBtn) {
        let apiKey = localStorage.getItem('imgbb_api_key') || '';

        imgbbSettingBtn.addEventListener('click', () => {
            const newKey = prompt('请输入您的 ImgBB API Key (可在 https://api.imgbb.com/ 申请):', apiKey);
            if (newKey !== null) {
                apiKey = newKey.trim();
                localStorage.setItem('imgbb_api_key', apiKey);
                alert('API Key 已保存！');
            }
        });

        imgbbUploadBtn.addEventListener('click', async () => {
            if (!fileInput.files || !fileInput.files[0]) {
                alert('请先选择一张图片！');
                return;
            }
            
            if (!apiKey) {
                const newKey = prompt('请先设置 ImgBB API Key (可在 https://api.imgbb.com/ 申请):');
                if (newKey) {
                    apiKey = newKey.trim();
                    localStorage.setItem('imgbb_api_key', apiKey);
                } else {
                    return;
                }
            }

            const originalText = imgbbUploadBtn.innerText;
            imgbbUploadBtn.innerText = '⏳ 上传中...';
            imgbbUploadBtn.disabled = true;

            try {
                const formData = new FormData();
                formData.append('image', fileInput.files[0]);
                
                const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
                    method: 'POST',
                    body: formData
                });
                
                const data = await response.json();
                
                if (data.success) {
                    const url = data.data.url;
                    const config = configs[currentSide][currentType];
                    config.imgUrl = url;
                    
                    // 更新 UI (此时已经是 URL 了)
                    loadConfigToUI();
                    
                    alert('✅ 上传成功！图片链接已自动填入。');
                } else {
                    throw new Error(data.error ? data.error.message : '上传失败');
                }
            } catch (error) {
                alert('❌ 上传出错: ' + error.message);
            } finally {
                imgbbUploadBtn.innerText = originalText;
                imgbbUploadBtn.disabled = false;
            }
        });
    }
    
    // 初始化加载
    loadConfigToUI();
}

// --- 通用工具 ---
function copyToClipboard(textarea, btn) {
    textarea.select();
    document.execCommand('copy');
    const originalText = btn.innerText;
    btn.innerText = '✅ 已复制！';
    btn.classList.add('success');
    setTimeout(() => {
        btn.innerText = originalText;
        btn.classList.remove('success');
    }, 2000);
}
