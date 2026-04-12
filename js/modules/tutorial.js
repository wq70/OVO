// --- 教程与备份功能 (js/modules/tutorial.js) ---

function setupTutorialApp() {
    const tutorialContentArea = document.getElementById('tutorial-content-area');
    tutorialContentArea.addEventListener('click', (e) => {
        const header = e.target.closest('.tutorial-header') || 
                       e.target.closest('.tutorial-modern-header') || 
                       e.target.closest('.tutorial-rabbit-card-title');
        if (header) {
            header.parentElement.classList.toggle('open');
        }
    });
}

function renderUpdateLog(container) {
    const tutorialContent = container || document.getElementById('tutorial-content-area');
    if (!tutorialContent) return;
    const mode = typeof getAppearanceMode === 'function' ? getAppearanceMode() : 'classic';

    if (mode === 'rabbit') {
        const btn = document.createElement('button');
        btn.className = 'tutorial-rabbit-update-btn';
        btn.innerHTML = '查看更新日志';
        
        let notesHtml = '';
        updateLog.forEach((log, index) => {
            notesHtml += `
                <div style="margin-bottom: 15px; ${index < updateLog.length - 1 ? 'padding-bottom: 10px; border-bottom: 1px dashed #f5f0f1;' : ''}">
                    <h4 style="font-size: 15px; color: #555; margin: 0 0 5px 0;">版本 ${log.version} (${log.date})</h4>
                    <ul style="padding-left: 20px; margin: 0; list-style-type: '· ';">
                        ${log.notes.map(note => `<li style="margin-bottom: 5px; color: #666;">${note}</li>`).join('')}
                    </ul>
                </div>
            `;
        });

        const modal = document.createElement('div');
        modal.className = 'rabbit-update-modal';
        modal.innerHTML = `
            <div class="rabbit-update-content">
                <span class="rabbit-update-close-x">&times;</span>
                <h3 style="text-align:center; color:#555; margin-top:0;">更新日志</h3>
                ${notesHtml}
                <button class="rabbit-update-close">关闭</button>
            </div>
        `;
        document.body.appendChild(modal);

        btn.onclick = () => modal.classList.add('show');
        modal.querySelector('.rabbit-update-close').onclick = () => modal.classList.remove('show');
        modal.querySelector('.rabbit-update-close-x').onclick = () => modal.classList.remove('show');
        
        tutorialContent.appendChild(btn);
        return;
    }

    const isModern = mode === 'modern';
    const updateSection = document.createElement('div');
    updateSection.className = isModern ? 'tutorial-modern-item' : 'tutorial-item'; 

    let notesHtml = '';
    updateLog.forEach((log, index) => {
        notesHtml += `
            <div style="margin-bottom: 15px; ${index < updateLog.length - 1 ? 'padding-bottom: 10px; border-bottom: 1px solid #f0f0f0;' : ''}">
                <h4 style="font-size: 15px; color: #333; margin: 0 0 5px 0;">版本 ${log.version} (${log.date})</h4>
                <ul style="padding-left: 20px; margin: 0; list-style-type: '› ';">
                    ${log.notes.map(note => `<li style="margin-bottom: 5px; color: #666;">${note}</li>`).join('')}
                </ul>
            </div>
        `;
    });

    updateSection.innerHTML = `
        <div class="${isModern ? 'tutorial-modern-header' : 'tutorial-header'}">更新日志</div>
        <div class="${isModern ? 'tutorial-modern-content' : 'tutorial-content'}">
            <div class="${isModern ? 'tutorial-modern-content-inner' : ''}" style="${isModern ? '' : 'padding-top: 15px;'}">
                ${notesHtml}
            </div>
        </div>
    `;
    
    tutorialContent.appendChild(updateSection);
}

function showUpdateModal() {
    const modal = document.getElementById('update-log-modal');
    const contentEl = document.getElementById('update-log-modal-content');
    const closeBtn = document.getElementById('close-update-log-modal');

    const latestLog = updateLog[0];
    if (!latestLog) return;

    // 优化内容渲染
    let notesHtml = '<div style="text-align: left; max-height: 60vh; overflow-y: auto; padding-right: 5px;">';
    latestLog.notes.forEach(note => {
        // 处理加粗标记 **text** -> <b>text</b>
        let formattedNote = note.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

        if (note.includes('————')) {
            // 分割线
            notesHtml += '<hr style="margin: 15px 0; border: 0; border-top: 1px dashed #ccc;">';
        } else if (/^\d+\./.test(note)) {
            // 标题行 (例如 "1.日记功能升级！")
            notesHtml += `<h4 style="margin: 15px 0 8px; color: #333; font-size: 15px; font-weight: 600;">${formattedNote}</h4>`;
        } else {
            // 普通内容行
            notesHtml += `<div style="margin-bottom: 6px; color: #555; font-size: 13px; line-height: 1.5; padding-left: 12px; position: relative;">
                <span style="position: absolute; left: 0; top: 0; color: #999;">•</span>${formattedNote}
            </div>`;
        }
    });
    notesHtml += '</div>';

    contentEl.innerHTML = `
        <h3 style="margin-top: 0; margin-bottom: 15px; text-align: center;">版本 ${latestLog.version} (${latestLog.date})</h3>
        ${notesHtml}
        <p style="font-size: 12px; color: #888; text-align: center; margin-top: 15px; border-top: 1px solid #eee; padding-top: 10px;">过往更新说明可在“教程”应用内查看。</p>
    `;

    modal.classList.add('visible');

    // 强制阅读倒计时
    const originalText = "我知道了";
    let timeLeft = 10;
    closeBtn.disabled = true;
    closeBtn.textContent = `请阅读 (${timeLeft}s)`;
    closeBtn.style.opacity = '0.6';
    closeBtn.style.cursor = 'not-allowed';

    const timer = setInterval(() => {
        timeLeft--;
        if (timeLeft > 0) {
            closeBtn.textContent = `请阅读 (${timeLeft}s)`;
        } else {
            clearInterval(timer);
            closeBtn.disabled = false;
            closeBtn.textContent = originalText;
            closeBtn.style.opacity = '1';
            closeBtn.style.cursor = 'pointer';
        }
    }, 1000);

    closeBtn.onclick = () => {
        modal.classList.remove('visible');
        localStorage.setItem('lastSeenVersion', appVersion);
    };
}

function checkForUpdates() {
    const lastSeenVersion = localStorage.getItem('lastSeenVersion');
    if (lastSeenVersion !== appVersion) {
        // 仅当当前版本为 1.8.0 时，才执行引导重置
        if (appVersion === '1.8.0') {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('guide_')) {
                    localStorage.removeItem(key);
                }
            });
        }

        setTimeout(showUpdateModal, 500);
    }
}

// --- Guide System (分步引导) ---
const GuideSystem = {
    check: function(guideId, nextCallback) {
        // 检查是否已显示过
        if (localStorage.getItem(guideId) === 'true') return;

        // 根据 ID 定义引导内容
        let config = null;
        switch (guideId) {
            case 'guide_search_entry':
                config = {
                    target: '.search-bar-decoration',
                    text: '新增搜索功能！支持按角色、群聊筛选，快速查找历史记录。',
                    position: 'bottom'
                };
                break;
            case 'guide_char_gallery':
                config = {
                    target: '#char-gallery-manage-btn',
                    text: '新增 TA 相册！在这里管理角色的专属照片，在聊天设置里开启此开关后，聊天时角色可直接发送上传的图片。',
                    position: 'top'
                };
                break;
            case 'guide_group_summary':
                config = {
                    target: '#memory-journal-btn',
                    text: '群聊记录太多？点击这里一键生成智能总结，自动关联当前群聊世界书，内置提示词。',
                    position: 'top'
                };
                break;
            case 'guide_group_notice':
                config = {
                    target: '#setting-group-notice',
                    text: '新增群公告！设置剧情背景或重要通知，让所有成员知晓。',
                    position: 'bottom',
                    parent: '.kkt-item' // 高亮父容器
                };
                break;
            case 'guide_group_gossip':
                config = {
                    target: '#setting-group-allow-gossip',
                    text: '开启群内私聊！双击群聊标题可查看，群成员之间可以悄悄互动，八卦吐槽更真实。',
                    position: 'bottom',
                    parent: '.kkt-item'
                };
                break;
            case 'guide_token_distribution':
                config = {
                    target: '#pc-stat-token-click',
                    text: '点击这里可查看 Token 分布，了解当前对话的 token 使用情况！',
                    position: 'top'
                };
                break;
        }

        if (config) {
            // 稍微延迟以确保 DOM 渲染完成
            setTimeout(() => {
                const targetEl = document.querySelector(config.target);
                if (targetEl && targetEl.offsetParent !== null) { // 确保元素可见
                    this.show(targetEl, config, guideId, nextCallback);
                }
            }, 500);
        }
    },

    show: function(targetEl, config, guideId, nextCallback) {
        // 1. 先滚动到可见区域
        const highlightEl = config.parent ? targetEl.closest(config.parent) : targetEl;
        
        // 特殊处理 Swiper 容器内的元素，避免触发页面整体水平滚动
        const swiperWrapper = highlightEl.closest('.function-swiper-wrapper');
        if (swiperWrapper) {
            const slide = highlightEl.closest('.function-slide');
            if (slide) {
                // 滚动到对应的 slide，使用 inline: 'start' 确保对齐且不溢出
                slide.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
            } else {
                highlightEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            }
        } else {
            highlightEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // 强制重置页面水平滚动，防止露出侧边栏
        const resetScroll = () => {
            document.documentElement.scrollLeft = 0;
            document.body.scrollLeft = 0;
        };
        // 在滚动开始和结束时多次尝试重置
        setTimeout(resetScroll, 50);
        setTimeout(resetScroll, 200);
        setTimeout(resetScroll, 600);

        // 2. 延迟显示引导（等待滚动完成）
        setTimeout(() => {
            // 再次重置滚动位置，确保万无一失
            resetScroll();

            // 移除现有的引导
            this.cleanup();

            // 创建遮罩
            const overlay = document.createElement('div');
            overlay.className = 'guide-overlay visible';
            document.body.appendChild(overlay);

            // 重新计算高亮位置（滚动后）
            const rect = highlightEl.getBoundingClientRect();
            
            // 创建高亮框
            const highlightBox = document.createElement('div');
            highlightBox.className = 'guide-highlight-box';
            // 强制使用 fixed 定位，避免滚动容器导致的坐标偏移问题
            highlightBox.style.position = 'fixed';
            highlightBox.style.top = `${rect.top}px`;
            highlightBox.style.left = `${rect.left}px`;
            highlightBox.style.width = `${rect.width}px`;
            highlightBox.style.height = `${rect.height}px`;
            document.body.appendChild(highlightBox);

            // 创建提示气泡
            const tooltip = document.createElement('div');
            tooltip.className = `guide-tooltip ${config.position || 'bottom'} visible`;
            // 气泡也使用 fixed 定位
            tooltip.style.position = 'fixed';
            
            tooltip.innerHTML = `
                <div class="guide-content">${config.text}</div>
                <div class="guide-footer">
                    <button class="guide-btn guide-btn-primary">我知道了</button>
                </div>
            `;
            document.body.appendChild(tooltip);

            // 计算气泡位置 (需要先添加到 DOM 获取尺寸)
            const tooltipRect = tooltip.getBoundingClientRect();
            const tooltipWidth = tooltipRect.width;
            const screenWidth = window.innerWidth;
            const margin = 10; // 屏幕边缘间距

            let tooltipTop, tooltipLeft;
            
            // 初始水平居中对齐目标
            let idealLeft = rect.left + rect.width / 2 - tooltipWidth / 2;

            // 边界检测与调整
            if (idealLeft < margin) {
                tooltipLeft = margin;
            } else if (idealLeft + tooltipWidth > screenWidth - margin) {
                tooltipLeft = screenWidth - tooltipWidth - margin;
            } else {
                tooltipLeft = idealLeft;
            }

            // 计算箭头偏移量 (相对于 tooltip 左边缘)
            const targetCenterX = rect.left + rect.width / 2;
            let arrowRelX = targetCenterX - tooltipLeft;
            
            // 限制箭头在 tooltip 内部 (留出圆角空间)
            const arrowMargin = 20;
            if (arrowRelX < arrowMargin) arrowRelX = arrowMargin;
            if (arrowRelX > tooltipWidth - arrowMargin) arrowRelX = tooltipWidth - arrowMargin;

            // 设置箭头位置变量
            tooltip.style.setProperty('--arrow-left', `${arrowRelX}px`);

            // 垂直位置
            if (config.position === 'top') {
                tooltipTop = rect.top - 10; 
                tooltip.style.transform = 'translateY(-100%) translateY(-10px)';
            } else {
                tooltipTop = rect.bottom + 10;
                tooltip.style.transform = 'translateY(10px)';
            }
            
            tooltip.style.top = `${tooltipTop}px`;
            tooltip.style.left = `${tooltipLeft}px`;

            // 绑定事件
            const closeGuide = () => {
                this.cleanup();
                localStorage.setItem(guideId, 'true');
                if (nextCallback) nextCallback();
            };

            overlay.addEventListener('click', closeGuide);
            tooltip.querySelector('.guide-btn-primary').addEventListener('click', closeGuide);
        }, 500); // 等待 500ms 确保滚动完成
    },

    cleanup: function() {
        const overlay = document.querySelector('.guide-overlay');
        const highlight = document.querySelector('.guide-highlight-box');
        const tooltip = document.querySelector('.guide-tooltip');
        if (overlay) overlay.remove();
        if (highlight) highlight.remove();
        if (tooltip) tooltip.remove();
    }
};
window.GuideSystem = GuideSystem;

let loadingBtn = false

function customConfirm(message, title = '确认') {
    return new Promise((resolve) => {
        const modalId = 'custom-confirm-modal';
        let modal = document.getElementById(modalId);
        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'modal-overlay';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
            modal.style.zIndex = '100000';
            modal.innerHTML = `
                <div class="modal-window custom-confirm-window" style="max-width: 320px; width: 90%; padding: 20px;">
                    <h3 id="custom-confirm-title" style="margin-top:0; margin-bottom: 12px; font-size: 1.1rem; color: #333; text-align: center;"></h3>
                    <p id="custom-confirm-message" style="font-size: 0.95rem; color: #555; margin-bottom: 20px; line-height: 1.5; text-align: center; white-space: pre-wrap; max-height: 50vh; overflow-y: auto; text-align: left;"></p>
                    <div style="display: flex; gap: 10px;">
                        <button type="button" id="custom-confirm-ok-btn" class="btn btn-primary" style="flex:1; background: var(--primary-color, #ff6b81); border: none;">确定</button>
                        <button type="button" id="custom-confirm-cancel-btn" class="btn btn-neutral" style="flex:1;">取消</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        
        document.getElementById('custom-confirm-title').textContent = title;
        document.getElementById('custom-confirm-message').textContent = message;
        modal.style.display = 'flex';
        
        const okBtn = document.getElementById('custom-confirm-ok-btn');
        const cancelBtn = document.getElementById('custom-confirm-cancel-btn');
        
        const cleanup = () => {
            modal.style.display = 'none';
            okBtn.onclick = null;
            cancelBtn.onclick = null;
        };
        
        okBtn.onclick = () => { cleanup(); resolve(true); };
        cancelBtn.onclick = () => { cleanup(); resolve(false); };
    });
}

function customAlert(message, title = '提示') {
    return new Promise((resolve) => {
        const modalId = 'custom-alert-modal';
        let modal = document.getElementById(modalId);
        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'modal-overlay';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
            modal.style.zIndex = '100000';
            modal.innerHTML = `
                <div class="modal-window custom-alert-window" style="max-width: 320px; width: 90%; padding: 20px;">
                    <h3 id="custom-alert-title" style="margin-top:0; margin-bottom: 12px; font-size: 1.1rem; color: #333; text-align: center;"></h3>
                    <p id="custom-alert-message" style="font-size: 0.95rem; color: #555; margin-bottom: 20px; line-height: 1.5; text-align: center; white-space: pre-wrap; max-height: 50vh; overflow-y: auto; text-align: left;"></p>
                    <div style="display: flex; justify-content: center;">
                        <button type="button" id="custom-alert-ok-btn" class="btn btn-primary" style="min-width: 120px; background: var(--primary-color, #ff6b81); border: none;">我知道了</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        
        document.getElementById('custom-alert-title').textContent = title;
        document.getElementById('custom-alert-message').textContent = message;
        modal.style.display = 'flex';
        
        const okBtn = document.getElementById('custom-alert-ok-btn');
        
        const cleanup = () => {
            modal.style.display = 'none';
            okBtn.onclick = null;
        };
        
        okBtn.onclick = () => { cleanup(); resolve(); };
    });
}

function renderTutorialContent() {
    const tutorialContentArea = document.getElementById('tutorial-content-area');
    const mode = typeof getAppearanceMode === 'function' ? getAppearanceMode() : 'classic';
    const isModern = mode === 'modern';
    const isRabbit = mode === 'rabbit';
    
    // 应用自定义 CSS
    if (typeof applyCustomTutorialCss === 'function') applyCustomTutorialCss();
    
    tutorialContentArea.innerHTML = '';
    
    // 清理可能遗留的旧 class
    tutorialContentArea.classList.remove('tutorial-modern-layout', 'tutorial-rabbit-layout');
    
    if (isModern) {
        tutorialContentArea.classList.add('tutorial-modern-layout');
    } else if (isRabbit) {
        tutorialContentArea.classList.add('tutorial-rabbit-layout');
    }

    let modernGroups = {};
    if (isModern) {
        const createGroup = (title) => {
            const group = document.createElement('div');
            group.className = 'tutorial-modern-group';
            if (title) {
                const titleEl = document.createElement('div');
                titleEl.className = 'tutorial-modern-group-title';
                titleEl.textContent = title;
                group.appendChild(titleEl);
            }
            const list = document.createElement('div');
            list.className = 'tutorial-modern-list';
            group.appendChild(list);
            tutorialContentArea.appendChild(group);
            return list;
        };
        modernGroups.docs = createGroup('使用说明');
        modernGroups.data = createGroup('数据管理');
        modernGroups.clean = createGroup('数据清理');
        modernGroups.github = createGroup('云端备份');
    }

    const docsContainer = isModern ? modernGroups.docs : tutorialContentArea;

    const tutorials = [
        {title: '写在前面', imageUrls: ['https://i.postimg.cc/3RJfvgzq/xie-zai-qian-mian(1).jpg']},
        {
            title: '软件介绍',
            imageUrls: ['https://i.postimg.cc/VvsJRh6q/IMG-20250713-162647.jpg', 'https://i.postimg.cc/8P5FfxxD/IMG-20250713-162702.jpg', 'https://i.postimg.cc/3r94R3Sn/IMG-20250713-162712.jpg']
        },
        {
            title: '404',
            imageUrls: ['https://i.postimg.cc/x8scFPJW/IMG-20250713-162756.jpg', 'https://i.postimg.cc/pX6mfqtj/IMG-20250713-162809.jpg', 'https://i.postimg.cc/YScjV00q/IMG-20250713-162819.jpg', 'https://i.postimg.cc/13VfJw9j/IMG-20250713-162828.jpg']
        },
        {title: '404-群聊', imageUrls: ['https://i.postimg.cc/X7LSmRTJ/404.jpg']}
    ];

    renderUpdateLog(docsContainer);

    tutorials.forEach(tutorial => {
        const item = document.createElement('div');
        const imagesHtml = tutorial.imageUrls.map(url => `<img src="${url}" alt="${tutorial.title}教程图片">`).join('');
        
        if (isRabbit) {
            item.className = 'tutorial-rabbit-card';
            item.innerHTML = `
                <div class="tutorial-rabbit-card-title">${tutorial.title}</div>
                <div class="tutorial-rabbit-content">
                    <div class="tutorial-rabbit-content-inner">${imagesHtml}</div>
                </div>
            `;
        } else {
            item.className = isModern ? 'tutorial-modern-item' : 'tutorial-item';
            item.innerHTML = `<div class="${isModern ? 'tutorial-modern-header' : 'tutorial-header'}">${tutorial.title}</div><div class="${isModern ? 'tutorial-modern-content' : 'tutorial-content'}"><div class="${isModern ? 'tutorial-modern-content-inner' : ''}">${imagesHtml}</div></div>`;
        }
        docsContainer.appendChild(item);
    });

    const createActionItem = (tag, text, classicClass, isDanger = false) => {
        const el = document.createElement(tag);
        if (isModern) {
            el.className = 'tutorial-modern-action' + (isDanger ? ' danger' : '');
            el.innerHTML = `<span>${text}</span><span class="arrow">›</span>`;
        } else if (isRabbit) {
            el.className = 'tutorial-rabbit-action' + (isDanger ? ' danger' : ' neutral');
            el.textContent = text;
        } else {
            el.className = classicClass;
            el.textContent = text;
            el.style.marginTop = '10px';
            el.style.display = 'block';
        }
        return el;
    };

    const backupDataBtn = createActionItem('button', '备份数据', 'btn btn-primary');
    backupDataBtn.disabled = loadingBtn;

    backupDataBtn.addEventListener('click', async () => {
        if(loadingBtn){
            return
        }
        loadingBtn = true
        try {
            showToast('正在准备导出数据...');

            const fullBackupData = await createFullBackupData();

            const jsonString = JSON.stringify(fullBackupData);
            const dataBlob = new Blob([jsonString]);

            const compressionStream = new CompressionStream('gzip');
            const compressedStream = dataBlob.stream().pipeThrough(compressionStream);
            const compressedBlob = await new Response(compressedStream, { headers: { 'Content-Type': 'application/octet-stream' } }).blob();

            const url = URL.createObjectURL(compressedBlob);
            const a = document.createElement('a');
            const now = new Date();
            const date = now.toISOString().slice(0, 10);
            const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
            a.href = url;
            a.download = `章鱼喷墨_备份数据_${date}_${time}.ee`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            loadingBtn = false
            showToast('聊天记录导出成功');
        }catch (e){
            loadingBtn = false
            showToast(`导出失败, 发生错误: ${e.message}`);
            console.error('导出错误详情:', e);
        }
    });

    // 分类导出：可选数据表多选导出
    const PARTIAL_EXPORT_OPTIONS = [
        { key: 'characters', label: '角色（单聊）' },
        { key: 'groups', label: '群聊' },
        { key: 'worldBooks', label: '世界书' },
        { key: 'myStickers', label: '我的表情' },
        { key: 'theaterData', label: '小剧场（剧情、预设、API设置）' },
        { key: 'globalSettings', label: '全局设置（API、壁纸、主题等）' }
    ];
    const partialExportModalId = 'partial-export-modal';
    const partialExportModal = document.createElement('div');
    partialExportModal.id = partialExportModalId;
    partialExportModal.className = 'modal-overlay';
    partialExportModal.style.display = 'none';
    partialExportModal.style.alignItems = 'center';
    partialExportModal.style.justifyContent = 'center';
    partialExportModal.innerHTML = `
        <div class="modal-window" style="max-width: 320px;">
            <h3 style="margin-top:0;">分类导出数据</h3>
            <p style="font-size: 0.89rem; color: #666; margin-bottom: 12px;">选择要导出的数据表（可多选），仅导出选中部分。</p>
            <div id="partial-export-checkboxes" style="margin-bottom: 12px;"></div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <button type="button" id="partial-export-select-all" class="btn btn-neutral" style="flex:1;">全选</button>
                <button type="button" id="partial-export-select-none" class="btn btn-neutral" style="flex:1;">取消全选</button>
            </div>
            <div style="display: flex; gap: 8px;">
                <button type="button" id="partial-export-do-btn" class="btn btn-primary" style="flex:1;">导出选中</button>
                <button type="button" id="partial-export-cancel-btn" class="btn btn-neutral" style="flex:1;">取消</button>
            </div>
        </div>
    `;
    if (!document.getElementById(partialExportModalId)) document.body.appendChild(partialExportModal);

    const partialExportBtn = createActionItem('button', '分类导出数据', 'btn btn-primary');
    partialExportBtn.disabled = loadingBtn;
    partialExportBtn.addEventListener('click', () => {
        const container = document.getElementById('partial-export-checkboxes');
        container.innerHTML = '';
        PARTIAL_EXPORT_OPTIONS.forEach(opt => {
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.marginBottom = '8px';
            label.style.cursor = 'pointer';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.dataset.key = opt.key;
            cb.checked = true;
            label.appendChild(cb);
            label.appendChild(document.createTextNode(' ' + opt.label));
            container.appendChild(label);
        });
        document.getElementById(partialExportModalId).style.display = 'flex';
    });

    document.getElementById('partial-export-select-all').addEventListener('click', () => {
        document.querySelectorAll('#partial-export-checkboxes input[type="checkbox"]').forEach(cb => cb.checked = true);
    });
    document.getElementById('partial-export-select-none').addEventListener('click', () => {
        document.querySelectorAll('#partial-export-checkboxes input[type="checkbox"]').forEach(cb => cb.checked = false);
    });
    document.getElementById('partial-export-cancel-btn').addEventListener('click', () => {
        document.getElementById(partialExportModalId).style.display = 'none';
    });
    document.getElementById('partial-export-do-btn').addEventListener('click', async () => {
        const selected = [];
        document.querySelectorAll('#partial-export-checkboxes input[type="checkbox"]:checked').forEach(cb => selected.push(cb.dataset.key));
        if (selected.length === 0) {
            showToast('请至少选择一项数据');
            return;
        }
        document.getElementById(partialExportModalId).style.display = 'none';
        if (loadingBtn) return;
        loadingBtn = true;
        try {
            showToast('正在准备分类导出...');
            const partialData = await createPartialBackupData(selected);
            const jsonString = JSON.stringify(partialData);
            const dataBlob = new Blob([jsonString]);

            const compressionStream = new CompressionStream('gzip');
            const compressedStream = dataBlob.stream().pipeThrough(compressionStream);
            const compressedBlob = await new Response(compressedStream, { headers: { 'Content-Type': 'application/octet-stream' } }).blob();

            const url = URL.createObjectURL(compressedBlob);
            const a = document.createElement('a');
            const now = new Date();
            const date = now.toISOString().slice(0, 10);
            const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
            a.href = url;
            a.download = `章鱼喷墨_分类导出_${date}_${time}.ee`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            loadingBtn = false;
            showToast('分类导出成功');
        } catch (e) {
            loadingBtn = false;
            showToast(`分类导出失败: ${e.message}`);
            console.error('分类导出错误:', e);
        }
    });

    // 高级清理：按 APP 多选清除
    const ADVANCED_CLEAN_OPTIONS = [
        { key: 'worldBooks', label: '世界书（全部世界书）' },
        { key: 'chat', label: '聊天（角色、群聊及所有聊天记录）' },
        { key: 'myStickers', label: '表情包' },
        { key: 'favorites', label: '收藏' },
        { key: 'forum', label: '论坛' },
        { key: 'theater', label: '小剧场' }
    ];
    const advancedCleanModalId = 'advanced-clean-modal';
    const advancedCleanModal = document.createElement('div');
    advancedCleanModal.id = advancedCleanModalId;
    advancedCleanModal.className = 'modal-overlay';
    advancedCleanModal.style.display = 'none';
    advancedCleanModal.style.alignItems = 'center';
    advancedCleanModal.style.justifyContent = 'center';
    advancedCleanModal.innerHTML = `
        <div class="modal-window" style="max-width: 320px;">
            <h3 style="margin-top:0;">高级清理</h3>
            <p style="font-size: 0.89rem; color: #666; margin-bottom: 12px;">选择要清空的 APP 数据（可多选），将清除该分类下的全部内容。操作不可恢复，请谨慎选择。</p>
            <div id="advanced-clean-checkboxes" style="margin-bottom: 12px;"></div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <button type="button" id="advanced-clean-select-all" class="btn btn-neutral" style="flex:1;">全选</button>
                <button type="button" id="advanced-clean-select-none" class="btn btn-neutral" style="flex:1;">取消全选</button>
            </div>
            <div style="display: flex; gap: 8px;">
                <button type="button" id="advanced-clean-do-btn" class="btn btn-danger" style="flex:1;">执行清理</button>
                <button type="button" id="advanced-clean-cancel-btn" class="btn btn-neutral" style="flex:1;">取消</button>
            </div>
        </div>
    `;
    if (!document.getElementById(advancedCleanModalId)) document.body.appendChild(advancedCleanModal);

    const advancedCleanBtn = createActionItem('button', '高级清理', 'btn btn-neutral');
    advancedCleanBtn.disabled = loadingBtn;

    advancedCleanBtn.addEventListener('click', () => {
        const container = document.getElementById('advanced-clean-checkboxes');
        container.innerHTML = '';
        ADVANCED_CLEAN_OPTIONS.forEach(opt => {
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.marginBottom = '8px';
            label.style.cursor = 'pointer';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.dataset.key = opt.key;
            cb.checked = false;
            label.appendChild(cb);
            label.appendChild(document.createTextNode(' ' + opt.label));
            container.appendChild(label);
        });
        document.getElementById(advancedCleanModalId).style.display = 'flex';
    });

    document.getElementById('advanced-clean-select-all').addEventListener('click', () => {
        document.querySelectorAll('#advanced-clean-checkboxes input[type="checkbox"]').forEach(cb => cb.checked = true);
    });
    document.getElementById('advanced-clean-select-none').addEventListener('click', () => {
        document.querySelectorAll('#advanced-clean-checkboxes input[type="checkbox"]').forEach(cb => cb.checked = false);
    });
    document.getElementById('advanced-clean-cancel-btn').addEventListener('click', () => {
        document.getElementById(advancedCleanModalId).style.display = 'none';
    });
    document.getElementById('advanced-clean-do-btn').addEventListener('click', async () => {
        const selected = [];
        document.querySelectorAll('#advanced-clean-checkboxes input[type="checkbox"]:checked').forEach(cb => selected.push(cb.dataset.key));
        if (selected.length === 0) {
            showToast('请至少选择一项要清理的数据');
            return;
        }
        const labels = selected.map(k => ADVANCED_CLEAN_OPTIONS.find(o => o.key === k).label).join('、');
        const confirmed = await customConfirm('即将清空以下数据：\n\n' + labels + '\n\n此操作不可恢复，确定继续？', '高级清理确认');
        if (!confirmed) return;

        document.getElementById(advancedCleanModalId).style.display = 'none';
        if (loadingBtn) return;
        loadingBtn = true;
        advancedCleanBtn.disabled = true;

        try {
            showToast('正在执行高级清理...');
            const report = [];

            if (selected.includes('worldBooks')) {
                const n = (db.worldBooks && db.worldBooks.length) || 0;
                db.worldBooks = [];
                if (n > 0) report.push(`世界书：已清空 ${n} 条`);
            }
            if (selected.includes('chat')) {
                const charN = (db.characters && db.characters.length) || 0;
                const groupN = (db.groups && db.groups.length) || 0;
                db.characters = [];
                db.groups = [];
                if (db.chatFolders) db.chatFolders = [];
                await dexieDB.characters.clear();
                await dexieDB.groups.clear();
                if (charN > 0 || groupN > 0) report.push(`聊天：已清空 ${charN} 个角色、${groupN} 个群聊及全部聊天记录`);
            }
            if (selected.includes('myStickers')) {
                const n = (db.myStickers && db.myStickers.length) || 0;
                db.myStickers = [];
                if (n > 0) report.push(`表情包：已清空 ${n} 个`);
            }
            if (selected.includes('favorites')) {
                const n = (db.favorites && db.favorites.length) || 0;
                db.favorites = [];
                if (n > 0) report.push(`收藏：已清空 ${n} 条`);
            }
            if (selected.includes('forum')) {
                db.forumPosts = [];
                db.forumMessages = [];
                db.forumBindings = { worldBookIds: [], charIds: [], userPersonaIds: [] };
                db.forumUserProfile = { username: '', avatar: 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg', bio: '', joinDate: 0 };
                db.forumSettings = db.forumSettings || {};
                db.forumStrangerProfiles = {};
                db.forumFriendRequests = [];
                db.forumPendingRequestFromUser = {};
                report.push('论坛：已清空帖子、消息及绑定等');
            }
            if (selected.includes('theater')) {
                const scenarioN = (db.theaterScenarios && db.theaterScenarios.length) || 0;
                const htmlScenarioN = (db.theaterHtmlScenarios && db.theaterHtmlScenarios.length) || 0;
                db.theaterScenarios = [];
                db.theaterHtmlScenarios = [];
                db.theaterPromptPresets = db.theaterPromptPresets || [];
                db.theaterHtmlPromptPresets = db.theaterHtmlPromptPresets || [];
                const presetN = db.theaterPromptPresets.length;
                const htmlPresetN = db.theaterHtmlPromptPresets.length;
                db.theaterPromptPresets = [];
                db.theaterHtmlPromptPresets = [];
                const totalScenarios = scenarioN + htmlScenarioN;
                const totalPresets = presetN + htmlPresetN;
                if (totalScenarios > 0 || totalPresets > 0) report.push(`小剧场：已清空 ${totalScenarios} 个剧本、${totalPresets} 个预设`);
            }

            await saveData(db);
            const summary = report.length ? report.join('\n') : '已清理所选数据';
            showToast('高级清理完成');
            await customAlert('高级清理完成！\n\n' + summary, '清理完成');
            setTimeout(() => window.location.reload(), 500);
        } catch (e) {
            console.error('高级清理失败:', e);
            showToast('高级清理失败: ' + e.message);
            await customAlert('清理过程中发生错误：\n' + e.message, '清理失败');
        } finally {
            loadingBtn = false;
            advancedCleanBtn.disabled = false;
        }
    });

    // 角色高级清理：按角色/群聊多选 + 按数据项多选，只清空选中对象的选中数据
    const CHAR_CLEAN_DATA_OPTIONS = [
        { key: 'history', label: '聊天记录' },
        { key: 'statusPanel', label: '状态面板数据' },
        { key: 'gallery', label: '相册' },
        { key: 'callHistory', label: '通话记录' },
        { key: 'peekData', label: '窥屏数据' },
        { key: 'userAvatarLibrary', label: '用户头像库' },
        { key: 'charAvatarLibrary', label: '角色头像库' },
        { key: 'worldBookIds', label: '绑定世界书' },
        { key: 'piggyBank', label: '钱包转账/亲属卡记录' }
    ];
    const charCleanModalId = 'char-advanced-clean-modal';
    const charCleanModal = document.createElement('div');
    charCleanModal.id = charCleanModalId;
    charCleanModal.className = 'modal-overlay';
    charCleanModal.style.display = 'none';
    charCleanModal.style.alignItems = 'center';
    charCleanModal.style.justifyContent = 'center';
    charCleanModal.innerHTML = `
        <div class="modal-window char-advanced-clean-window" style="max-width: 420px; max-height: 88vh; display: flex; flex-direction: column; padding: 20px;">
            <h3 style="margin:0 0 8px; font-size:1.15rem; color:#333; text-align:center;">角色高级清理</h3>
            <p style="font-size: 0.88rem; color: #777; margin: 0 0 16px; line-height: 1.5; text-align:center;">选择要清理的角色/群聊，再选择要清空的数据项。<br>仅清空选中对象的数据，不删除对象本身。</p>
            <div style="flex:1; min-height:0; overflow-y: auto; margin-bottom: 16px; padding-right:4px;">
                <div class="char-clean-section-head">
                    <span class="char-clean-section-title">选择角色/群聊</span>
                    <span class="char-clean-head-actions">
                        <button type="button" id="char-clean-entity-select-all" class="btn btn-neutral char-clean-head-btn">全选</button>
                        <button type="button" id="char-clean-entity-select-none" class="btn btn-neutral char-clean-head-btn">取消全选</button>
                    </span>
                </div>
                <div id="char-clean-entity-list" class="char-clean-entity-list"></div>
                <div class="char-clean-section-head" style="margin-top:20px;">
                    <span class="char-clean-section-title">选择要清理的数据项</span>
                    <span class="char-clean-head-actions">
                        <button type="button" id="char-clean-options-select-all" class="btn btn-neutral char-clean-head-btn">全选</button>
                        <button type="button" id="char-clean-options-select-none" class="btn btn-neutral char-clean-head-btn">取消全选</button>
                    </span>
                </div>
                <div id="char-clean-options-list" class="char-clean-options-list"></div>
            </div>
            <div style="display: flex; gap: 12px; flex-shrink: 0; padding-top: 12px; border-top: 1px solid #f0f0f0;">
                <button type="button" id="char-clean-do-btn" class="btn btn-danger" style="flex:1; padding: 10px; border-radius: 10px; font-weight: 500;">执行清理</button>
                <button type="button" id="char-clean-cancel-btn" class="btn btn-neutral" style="flex:1; padding: 10px; border-radius: 10px; font-weight: 500;">取消</button>
            </div>
        </div>
    `;
    if (!document.getElementById(charCleanModalId)) document.body.appendChild(charCleanModal);

    const charCleanBtn = createActionItem('button', '角色高级清理', 'btn btn-neutral');
    charCleanBtn.disabled = loadingBtn;

    function renderCharCleanEntityList() {
        const container = document.getElementById('char-clean-entity-list');
        if (!container) return;
        container.innerHTML = '';
        const chars = db.characters || [];
        const groups = db.groups || [];
        if (chars.length === 0 && groups.length === 0) {
            container.innerHTML = '<div style="color:#999; font-size:0.89rem;">暂无角色或群聊</div>';
            return;
        }
        chars.forEach(c => {
            const label = document.createElement('label');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.dataset.type = 'char';
            cb.dataset.id = c.id;
            label.appendChild(cb);
            if (c.avatar) {
                const img = document.createElement('img');
                img.src = c.avatar;
                img.alt = '';
                img.className = 'char-clean-avatar';
                label.appendChild(img);
            } else {
                const placeholder = document.createElement('span');
                placeholder.className = 'char-clean-avatar';
                placeholder.style.cssText = 'background:#e0e0e0; display:block; flex-shrink:0;';
                label.appendChild(placeholder);
            }
            const span = document.createElement('span');
            span.className = 'char-clean-name';
            span.textContent = (c.remarkName || c.realName || '未命名角色').trim() || c.id;
            label.appendChild(span);
            container.appendChild(label);
        });
        groups.forEach(g => {
            const label = document.createElement('label');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.dataset.type = 'group';
            cb.dataset.id = g.id;
            label.appendChild(cb);
            if (g.avatar) {
                const img = document.createElement('img');
                img.src = g.avatar;
                img.alt = '';
                img.className = 'char-clean-avatar';
                label.appendChild(img);
            } else {
                const placeholder = document.createElement('span');
                placeholder.className = 'char-clean-avatar';
                placeholder.style.cssText = 'background:#e0e0e0; display:block; flex-shrink:0;';
                label.appendChild(placeholder);
            }
            const span = document.createElement('span');
            span.className = 'char-clean-name';
            span.textContent = '[群] ' + ((g.name || '未命名群聊').trim() || g.id);
            label.appendChild(span);
            container.appendChild(label);
        });
    }

    charCleanBtn.addEventListener('click', () => {
        renderCharCleanEntityList();
        const optContainer = document.getElementById('char-clean-options-list');
        optContainer.innerHTML = '';
        CHAR_CLEAN_DATA_OPTIONS.forEach(opt => {
            const label = document.createElement('label');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.dataset.key = opt.key;
            cb.checked = opt.key === 'history';
            label.appendChild(cb);
            label.appendChild(document.createTextNode(opt.label));
            optContainer.appendChild(label);
        });
        document.getElementById(charCleanModalId).style.display = 'flex';
    });

    document.getElementById('char-clean-entity-select-all').addEventListener('click', () => {
        document.querySelectorAll('#char-clean-entity-list input[type="checkbox"]').forEach(cb => cb.checked = true);
    });
    document.getElementById('char-clean-entity-select-none').addEventListener('click', () => {
        document.querySelectorAll('#char-clean-entity-list input[type="checkbox"]').forEach(cb => cb.checked = false);
    });
    document.getElementById('char-clean-options-select-all').addEventListener('click', () => {
        document.querySelectorAll('#char-clean-options-list input[type="checkbox"]').forEach(cb => cb.checked = true);
    });
    document.getElementById('char-clean-options-select-none').addEventListener('click', () => {
        document.querySelectorAll('#char-clean-options-list input[type="checkbox"]').forEach(cb => cb.checked = false);
    });
    document.getElementById('char-clean-cancel-btn').addEventListener('click', () => {
        document.getElementById(charCleanModalId).style.display = 'none';
    });
    document.getElementById('char-clean-do-btn').addEventListener('click', async () => {
        const selectedEntities = [];
        document.querySelectorAll('#char-clean-entity-list input[type="checkbox"]:checked').forEach(cb => {
            selectedEntities.push({ type: cb.dataset.type, id: cb.dataset.id });
        });
        const selectedKeys = [];
        document.querySelectorAll('#char-clean-options-list input[type="checkbox"]:checked').forEach(cb => selectedKeys.push(cb.dataset.key));
        if (selectedEntities.length === 0) {
            showToast('请至少选择一个角色或群聊');
            return;
        }
        if (selectedKeys.length === 0) {
            showToast('请至少选择一项要清理的数据');
            return;
        }
        const keyLabels = selectedKeys.map(k => CHAR_CLEAN_DATA_OPTIONS.find(o => o.key === k).label).join('、');
        const confirmed = await customConfirm(`将对 ${selectedEntities.length} 个对象清理以下数据：\n\n${keyLabels}\n\n此操作不可恢复，确定继续？`, '确认清理');
        if (!confirmed) return;

        document.getElementById(charCleanModalId).style.display = 'none';
        if (loadingBtn) return;
        loadingBtn = true;
        charCleanBtn.disabled = true;

        try {
            showToast('正在执行角色高级清理...');
            const report = [];
            for (const { type, id } of selectedEntities) {
                if (type === 'char') {
                    const char = (db.characters || []).find(c => c.id === id);
                    if (!char) continue;
                    const name = char.remarkName || char.realName || '未命名角色';
                    let cleared = [];
                    if (selectedKeys.includes('history') && Array.isArray(char.history)) {
                        char.history = [];
                        cleared.push('聊天记录');
                    }
                    if (selectedKeys.includes('statusPanel') && char.statusPanel) {
                        char.statusPanel.history = [];
                        char.statusPanel.currentStatusRaw = '';
                        char.statusPanel.currentStatusHtml = '';
                        cleared.push('状态面板');
                    }
                    if (selectedKeys.includes('gallery') && Array.isArray(char.gallery)) {
                        char.gallery = [];
                        cleared.push('相册');
                    }
                    if (selectedKeys.includes('callHistory') && Array.isArray(char.callHistory)) {
                        char.callHistory = [];
                        cleared.push('通话记录');
                    }
                    if (selectedKeys.includes('peekData') && char.peekData && typeof char.peekData === 'object') {
                        char.peekData = {};
                        cleared.push('窥屏数据');
                    }
                    if (selectedKeys.includes('userAvatarLibrary') && Array.isArray(char.userAvatarLibrary)) {
                        char.userAvatarLibrary = [];
                        cleared.push('用户头像库');
                    }
                    if (selectedKeys.includes('charAvatarLibrary') && Array.isArray(char.charAvatarLibrary)) {
                        char.charAvatarLibrary = [];
                        cleared.push('角色头像库');
                    }
                    if (selectedKeys.includes('worldBookIds') && Array.isArray(char.worldBookIds)) {
                        char.worldBookIds = [];
                        cleared.push('绑定世界书');
                    }
                    if (selectedKeys.includes('piggyBank') && db.piggyBank) {
                        let piggyCleared = false;
                        // 清理该角色与用户的存钱罐交易（根据 charName 匹配，如果有的话，目前 transactions 里的 charName 是角色名）
                        // 为精准匹配，最好能查找到相关的交易。这里根据 charName (如果记录了的话) 或者是 source
                        const nameToMatch = char.realName || char.remarkName || '';
                        if (nameToMatch && db.piggyBank.transactions) {
                            const beforeLen = db.piggyBank.transactions.length;
                            const toRemove = db.piggyBank.transactions.filter(t => t.charName === nameToMatch);
                            if (toRemove.length > 0) {
                                // 不退还金额，因为是强制清理，直接删记录
                                db.piggyBank.transactions = db.piggyBank.transactions.filter(t => t.charName !== nameToMatch);
                                piggyCleared = true;
                            }
                        }
                        // 清理亲属卡
                        if (db.piggyBank.familyCards) {
                            const beforeLen = db.piggyBank.familyCards.length;
                            db.piggyBank.familyCards = db.piggyBank.familyCards.filter(c => c.targetCharId !== id);
                            if (beforeLen !== db.piggyBank.familyCards.length) piggyCleared = true;
                        }
                        if (db.piggyBank.receivedFamilyCards) {
                            const beforeLen = db.piggyBank.receivedFamilyCards.length;
                            db.piggyBank.receivedFamilyCards = db.piggyBank.receivedFamilyCards.filter(c => c.fromCharId !== id);
                            if (beforeLen !== db.piggyBank.receivedFamilyCards.length) piggyCleared = true;
                        }
                        if (piggyCleared) cleared.push('钱包转账/亲属卡记录');
                    }
                    if (cleared.length) report.push(`${name}：${cleared.join('、')}`);
                } else if (type === 'group') {
                    const group = (db.groups || []).find(g => g.id === id);
                    if (!group) continue;
                    const name = group.name || '未命名群聊';
                    let cleared = [];
                    if (selectedKeys.includes('history') && Array.isArray(group.history)) {
                        group.history = [];
                        cleared.push('聊天记录');
                    }
                    if (selectedKeys.includes('callHistory') && Array.isArray(group.callHistory)) {
                        group.callHistory = [];
                        cleared.push('通话记录');
                    }
                    if (selectedKeys.includes('worldBookIds') && Array.isArray(group.worldBookIds)) {
                        group.worldBookIds = [];
                        cleared.push('绑定世界书');
                    }
                    // 群聊目前不支持存钱罐亲属卡，但如果将来有相关交易记录，也可以清理
                    if (selectedKeys.includes('piggyBank') && db.piggyBank) {
                        let piggyCleared = false;
                        const nameToMatch = group.name || '';
                        if (nameToMatch && db.piggyBank.transactions) {
                            const toRemove = db.piggyBank.transactions.filter(t => t.charName === nameToMatch);
                            if (toRemove.length > 0) {
                                db.piggyBank.transactions = db.piggyBank.transactions.filter(t => t.charName !== nameToMatch);
                                piggyCleared = true;
                            }
                        }
                        if (piggyCleared) cleared.push('钱包转账记录');
                    }
                    if (cleared.length) report.push(`[群] ${name}：${cleared.join('、')}`);
                }
            }
            await saveData(db);
            showToast('角色高级清理完成');
            if (report.length > 0) {
                await customAlert('角色高级清理完成！\n\n' + report.slice(0, 15).join('\n') + (report.length > 15 ? '\n… 等 ' + report.length + ' 项' : ''), '清理完成');
            } else {
                await customAlert('角色高级清理完成（所选对象中无匹配数据）', '清理完成');
            }
            if (typeof window.refreshChatList === 'function') window.refreshChatList();
            setTimeout(() => window.location.reload(), 500);
        } catch (e) {
            console.error('角色高级清理失败:', e);
            showToast('角色高级清理失败: ' + e.message);
            await customAlert('清理过程中发生错误：\n' + e.message, '清理失败');
        } finally {
            loadingBtn = false;
            charCleanBtn.disabled = false;
        }
    });

    // 清理本地图片：对话中发送的 base64/data URL 图片（不含头像、相册）
    const isLocalImageData = (s) => typeof s === 'string' && (s.startsWith('data:image/') || (s.length > 200 && /^[A-Za-z0-9+/=]+$/.test(s)));
    const dataUrlToBytes = (s) => {
        if (!s || typeof s !== 'string') return 0;
        if (s.startsWith('data:')) {
            const base64 = s.indexOf('base64,') >= 0 ? s.split('base64,')[1] : '';
            return base64 ? Math.ceil((base64.length * 3) / 4) : 0;
        }
        return Math.ceil((s.length * 3) / 4);
    };
    const getMessageLocalImageBytes = (msg) => {
        let bytes = 0;
        if (msg.content && isLocalImageData(msg.content)) bytes += dataUrlToBytes(msg.content);
        if (msg.parts && Array.isArray(msg.parts)) {
            msg.parts.forEach(p => { if (p.type === 'image' && p.data && isLocalImageData(p.data)) bytes += dataUrlToBytes(p.data); });
        }
        return bytes;
    };
    const getLocalImageStats = () => {
        const list = [];
        (db.characters || []).forEach(char => {
            let bytes = 0;
            (char.history || []).forEach(msg => { bytes += getMessageLocalImageBytes(msg); });
            if (bytes > 0) list.push({ id: char.id, type: 'private', name: (char.remarkName || char.realName || '未命名角色'), bytes });
        });
        (db.groups || []).forEach(group => {
            let bytes = 0;
            (group.history || []).forEach(msg => { bytes += getMessageLocalImageBytes(msg); });
            if (bytes > 0) list.push({ id: group.id, type: 'group', name: group.name || '未命名群聊', bytes });
        });
        return list;
    };
    const clearLocalImagesInHistory = (history) => {
        if (!history || !Array.isArray(history)) return;
        history.forEach(msg => {
            if (msg.content && isLocalImageData(msg.content)) msg.content = '';
            if (msg.parts && Array.isArray(msg.parts)) {
                msg.parts = msg.parts.filter(p => p.type !== 'image' || !p.data || !isLocalImageData(p.data));
                if (msg.parts.length === 0 && msg.content === undefined) msg.content = '';
            }
        });
    };
    const formatBytes = (b) => b >= 1048576 ? (b / 1048576).toFixed(2) + ' MB' : (b >= 1024 ? (b / 1024).toFixed(2) + ' KB' : b + ' B');

    const cleanLocalImagesModalId = 'clean-local-images-modal';
    const cleanLocalImagesModal = document.createElement('div');
    cleanLocalImagesModal.id = cleanLocalImagesModalId;
    cleanLocalImagesModal.className = 'modal-overlay';
    cleanLocalImagesModal.style.display = 'none';
    cleanLocalImagesModal.style.alignItems = 'center';
    cleanLocalImagesModal.style.justifyContent = 'center';
    cleanLocalImagesModal.innerHTML = `
        <div class="modal-window" style="max-width: 360px;">
            <h3 style="margin-top:0;">清理本地图片</h3>
            <p style="font-size: 0.89rem; color: #666; margin-bottom: 12px;">仅清理对话中发送的本地图片（base64），不影响头像与相册。选中会话后执行，该会话中的本地图片将被清空，占用变为空。</p>
            <div id="clean-local-images-list" style="margin-bottom: 12px; max-height: 240px; overflow-y: auto;"></div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <button type="button" id="clean-local-images-select-all" class="btn btn-neutral" style="flex:1;">全选</button>
                <button type="button" id="clean-local-images-select-none" class="btn btn-neutral" style="flex:1;">取消全选</button>
            </div>
            <div style="display: flex; gap: 8px;">
                <button type="button" id="clean-local-images-do-btn" class="btn btn-danger" style="flex:1;">执行清理</button>
                <button type="button" id="clean-local-images-cancel-btn" class="btn btn-neutral" style="flex:1;">取消</button>
            </div>
        </div>
    `;
    if (!document.getElementById(cleanLocalImagesModalId)) {
        document.body.appendChild(cleanLocalImagesModal);
        const modalEl = document.getElementById(cleanLocalImagesModalId);
        modalEl.addEventListener('click', (e) => {
            const id = e.target.id;
            if (id === 'clean-local-images-cancel-btn') {
                modalEl.style.display = 'none';
                return;
            }
            if (id === 'clean-local-images-select-all') {
                document.querySelectorAll('#clean-local-images-list input[type="checkbox"]').forEach(cb => cb.checked = true);
                return;
            }
            if (id === 'clean-local-images-select-none') {
                document.querySelectorAll('#clean-local-images-list input[type="checkbox"]').forEach(cb => cb.checked = false);
                return;
            }
            if (id === 'clean-local-images-do-btn') {
                const selected = [];
                document.querySelectorAll('#clean-local-images-list input[type="checkbox"]:checked').forEach(cb => {
                    selected.push({ id: cb.dataset.chatId, type: cb.dataset.chatType });
                });
                if (selected.length === 0) {
                    showToast('请至少选择一个角色或群聊');
                    return;
                }
                customConfirm(`即将清理 ${selected.length} 个会话中的本地图片，图片将被清空。确定继续？`, '清理图片').then(confirmed => {
                    if (!confirmed) return;

                    modalEl.style.display = 'none';
                    if (loadingBtn) return;
                    loadingBtn = true;
                    const openBtn = document.getElementById('clean-local-images-open-btn');
                    if (openBtn) openBtn.disabled = true;

                    (async () => {
                        try {
                            showToast('正在清理本地图片...');
                            selected.forEach(({ id, type }) => {
                                if (type === 'private') {
                                    const char = db.characters.find(c => c.id === id);
                                    if (char && char.history) clearLocalImagesInHistory(char.history);
                                } else {
                                    const group = db.groups.find(g => g.id === id);
                                    if (group && group.history) clearLocalImagesInHistory(group.history);
                                }
                            });
                            await saveData(db);
                            showToast('清理完成');
                            await customAlert('清理完成！所选会话中的本地图片已清空，占用已为空。', '清理完成');
                            setTimeout(() => window.location.reload(), 500);
                        } catch (err) {
                            console.error('清理本地图片失败:', err);
                            showToast('清理失败: ' + err.message);
                            await customAlert('清理过程中发生错误：\n' + err.message, '清理失败');
                        } finally {
                            loadingBtn = false;
                            if (openBtn) openBtn.disabled = false;
                        }
                    })();
                });
            }
        });
    }

    const cleanLocalImagesBtn = createActionItem('button', '清理本地图片', 'btn btn-neutral');
    cleanLocalImagesBtn.id = 'clean-local-images-open-btn';
    cleanLocalImagesBtn.disabled = loadingBtn;

    cleanLocalImagesBtn.addEventListener('click', () => {
        const list = getLocalImageStats();
        const container = document.getElementById('clean-local-images-list');
        container.innerHTML = '';
        if (list.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#999; padding:16px;">当前没有角色或群聊含有对话中的本地图片。</p>';
            document.getElementById('clean-local-images-do-btn').disabled = true;
        } else {
            document.getElementById('clean-local-images-do-btn').disabled = false;
            list.forEach(item => {
                const label = document.createElement('label');
                label.style.display = 'flex';
                label.style.alignItems = 'center';
                label.style.marginBottom = '8px';
                label.style.cursor = 'pointer';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.dataset.chatId = item.id;
                cb.dataset.chatType = item.type;
                cb.checked = false;
                label.appendChild(cb);
                const tag = item.type === 'group' ? '群聊' : '角色';
                label.appendChild(document.createTextNode(` ${item.name}（${tag}） ${formatBytes(item.bytes)}`));
                container.appendChild(label);
            });
        }
        const modalEl = document.getElementById(cleanLocalImagesModalId);
        if (modalEl) modalEl.style.display = 'flex';
    });

    const importDataBtn = createActionItem('label', '导入数据', 'btn btn-neutral');
    importDataBtn.setAttribute('for', 'import-data-input');
    // For label, we can't easily disable click via disabled attr if it has 'for', but we preserve logic
    importDataBtn.disabled = loadingBtn;
    document.querySelector('#import-data-input').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const confirmed = await customConfirm('此操作将覆盖当前所有聊天记录和设置。此操作不可撤销。确定要继续吗？', '确认导入');
        if(confirmed){
            try {
                showToast('正在导入数据，请稍候...');

                const decompressionStream = new DecompressionStream('gzip');
                const decompressedStream = file.stream().pipeThrough(decompressionStream);
                const jsonString = await new Response(decompressedStream).text();

                let data = JSON.parse(jsonString);

                const importResult = await importBackupData(data);

                if (importResult.success) {
                    showToast(`数据导入成功！${importResult.message} 应用即将刷新。`);
                    setTimeout(() => {
                        window.location.reload();
                    }, 1500);
                } else {
                    showToast(`导入失败: ${importResult.error}`);
                }
            } catch (error) {
                console.error("导入失败:", error);
                showToast(`解压或解析文件时发生错误: ${error.message}`);
            } finally {
                event.target.value = null;
            }
        }else {
            event.target.value = null;
        }

    })

    const cleanRedundantDataBtn = createActionItem('button', '清除冗余/无用数据', 'btn btn-neutral');
    cleanRedundantDataBtn.disabled = loadingBtn;

    cleanRedundantDataBtn.addEventListener('click', async () => {
        if (loadingBtn) return;

        const msg = '此操作将清除以下无用数据：\n\n' +
            '• 无聊天记录的角色\n' +
            '• 无聊天记录的群聊\n' +
            '• 未被任何角色/群聊使用的世界书\n' +
            '• 无效的表情包（无链接等）\n\n' +
            '⚠️ 不会影响有聊天记录的角色和正在使用的数据。\n\n确定继续吗？';

        const confirmed = await customConfirm(msg, '清除无用数据');
        if (!confirmed) return;

        loadingBtn = true;
        cleanRedundantDataBtn.disabled = true;

        try {
            showToast('正在扫描冗余数据...');

            let cleanCount = 0;
            const report = [];

            // 先收集世界书引用（在删除角色/群聊之前），避免误删被引用的世界书
            const usedWorldBookIds = new Set();
            if (db.characters && Array.isArray(db.characters)) {
                db.characters.forEach(char => {
                    if (char.worldBookIds && Array.isArray(char.worldBookIds)) {
                        char.worldBookIds.forEach(id => usedWorldBookIds.add(id));
                    }
                });
            }
            if (db.groups && Array.isArray(db.groups)) {
                db.groups.forEach(group => {
                    if (group.worldBookIds && Array.isArray(group.worldBookIds)) {
                        group.worldBookIds.forEach(id => usedWorldBookIds.add(id));
                    }
                });
            }

            // 清理完全没有聊天记录的角色（保留有greeting等至少1条消息的角色）
            if (db.characters && Array.isArray(db.characters)) {
                const beforeCount = db.characters.length;
                db.characters = db.characters.filter(char => {
                    if (!char.history || char.history.length === 0) return false;
                    return true;
                });
                const removed = beforeCount - db.characters.length;
                if (removed > 0) {
                    report.push(`清理了 ${removed} 个无聊天记录的角色`);
                    cleanCount += removed;
                }
            }

            if (db.groups && Array.isArray(db.groups)) {
                const beforeCount = db.groups.length;
                db.groups = db.groups.filter(group => {
                    if (!group.history || group.history.length === 0) return false;
                    return true;
                });
                const removed = beforeCount - db.groups.length;
                if (removed > 0) {
                    report.push(`清理了 ${removed} 个无聊天记录的群聊`);
                    cleanCount += removed;
                }
            }

            // 使用之前收集的引用来清理世界书
            if (db.worldBooks && Array.isArray(db.worldBooks)) {
                const beforeCount = db.worldBooks.length;
                db.worldBooks = db.worldBooks.filter(wb => usedWorldBookIds.has(wb.id));
                const removed = beforeCount - db.worldBooks.length;
                if (removed > 0) {
                    report.push(`清理了 ${removed} 个未使用的世界书`);
                    cleanCount += removed;
                }
            }

            // 表情包：只清理真正无效的（无data字段或data为空）
            if (db.myStickers && Array.isArray(db.myStickers)) {
                const beforeCount = db.myStickers.length;
                db.myStickers = db.myStickers.filter(sticker => {
                    if (!sticker) return false;
                    const hasData = sticker.data && String(sticker.data).trim() !== '';
                    const hasUrl = sticker.url && String(sticker.url).trim() !== '';
                    return hasData || hasUrl;
                });
                const removed = beforeCount - db.myStickers.length;
                if (removed > 0) {
                    report.push(`清理了 ${removed} 个无效的表情包`);
                    cleanCount += removed;
                }
            }

            if (cleanCount > 0) {
                showToast('正在保存清理结果...');
                await saveData(db);
                const summary = report.join('\n');
                showToast(`清理完成！共清理 ${cleanCount} 项冗余数据`);
                await customAlert(`清理完成！\n\n${summary}\n\n共清理了 ${cleanCount} 项冗余数据。`, '清理完成');
                setTimeout(() => window.location.reload(), 500);
            } else {
                showToast('没有发现需要清理的冗余数据');
                await customAlert('检查完成！\n\n未发现需要清理的冗余数据，您的数据很健康。', '清理完成');
            }
        } catch (e) {
            console.error('清理失败:', e);
            showToast('清理失败: ' + e.message);
            await customAlert('清理过程中发生错误：\n' + e.message, '清理失败');
        } finally {
            loadingBtn = false;
            cleanRedundantDataBtn.disabled = false;
        }
    });

    const clearDataBtn = createActionItem('button', '清除所有数据', 'btn btn-danger', true);
    clearDataBtn.disabled = loadingBtn;

    clearDataBtn.addEventListener('click', async () => {
        const msg = '确定要清除本项目的所有本地数据吗？\n\n将清除：聊天记录、角色、设置等（仅限本小手机项目）。\n不会影响浏览器中其他网站的数据。\n\n此操作不可恢复，请确认已备份重要数据。';
        let confirmed = await customConfirm(msg, '清除所有数据');
        if (!confirmed) return;
        confirmed = await customConfirm('再次确认：即将清除本项目全部数据并刷新页面，确定继续？', '严重警告');
        if (!confirmed) return;

        try {
            // 仅清除本项目的 localStorage 键（不影响其他网站）
            const projectLocalStorageKeys = [
                'lastSeenVersion',
                'gh_config',
                'storage_persist_prompted',
                'imgbb_api_key',
                'gemini-chat-app-db'
            ];
            const keysToRemove = [...projectLocalStorageKeys];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('guide_')) keysToRemove.push(key);
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));

            // 删除本项目的 IndexedDB（章鱼喷墨机DB_ee），不影响其他网站
            const dbName = '章鱼喷墨机DB_ee';
            const req = indexedDB.deleteDatabase(dbName);
            req.onsuccess = () => {
                showToast('已清除本项目数据，即将刷新…');
                setTimeout(() => window.location.reload(), 800);
            };
            req.onerror = () => {
                showToast('清除数据库时出错，请重试或手动清除');
            };
            req.onblocked = () => {
                showToast('请关闭其他标签页中打开的同一页面后重试');
            };
        } catch (e) {
            console.error(e);
            showToast('清除失败: ' + e.message);
        }
    });

    tutorialContentArea.appendChild(backupDataBtn);
    tutorialContentArea.appendChild(partialExportBtn);
    tutorialContentArea.appendChild(importDataBtn);

    const importPartialDataBtn = createActionItem('label', '分类导入', 'btn btn-neutral');
    importPartialDataBtn.setAttribute('for', 'import-partial-data-input');
    importPartialDataBtn.disabled = loadingBtn;
    const partialInput = document.getElementById('import-partial-data-input');
    if (partialInput) {
        partialInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file) return;
            if (loadingBtn) return;
            try {
                const decompressionStream = new DecompressionStream('gzip');
                const decompressedStream = file.stream().pipeThrough(decompressionStream);
                const jsonString = await new Response(decompressedStream).text();
                const data = JSON.parse(jsonString);
                if (!data._exportTables || !Array.isArray(data._exportTables)) {
                    showToast('请选择由「分类导出」生成的文件（.ee）');
                    event.target.value = null;
                    return;
                }
                const confirmed = await customConfirm('将把该文件中选中的分类数据合并到当前数据中（同名会覆盖）。是否继续？', '分类导入');
                if (!confirmed) {
                    event.target.value = null;
                    return;
                }
                showToast('正在分类导入...');
                const result = await importPartialBackupData(data);
                if (result.success) {
                    showToast(result.message + ' 应用即将刷新。');
                    setTimeout(() => window.location.reload(), 1500);
                } else {
                    showToast('分类导入失败: ' + result.error);
                }
            } catch (error) {
                console.error('分类导入失败:', error);
                showToast('解压或解析失败: ' + (error.message || String(error)));
            }
            event.target.value = null;
        });
    }
    if (isModern) {
        modernGroups.data.appendChild(backupDataBtn);
        modernGroups.data.appendChild(partialExportBtn);
        modernGroups.data.appendChild(importDataBtn);
        modernGroups.data.appendChild(importPartialDataBtn);

        modernGroups.clean.appendChild(advancedCleanBtn);
        modernGroups.clean.appendChild(charCleanBtn);
        modernGroups.clean.appendChild(cleanLocalImagesBtn);
        modernGroups.clean.appendChild(cleanRedundantDataBtn);
        modernGroups.clean.appendChild(clearDataBtn);
    } else {
        tutorialContentArea.appendChild(backupDataBtn);
        tutorialContentArea.appendChild(partialExportBtn);
        tutorialContentArea.appendChild(importDataBtn);
        tutorialContentArea.appendChild(importPartialDataBtn);
        tutorialContentArea.appendChild(advancedCleanBtn);
        tutorialContentArea.appendChild(charCleanBtn);
        tutorialContentArea.appendChild(cleanLocalImagesBtn);
        tutorialContentArea.appendChild(cleanRedundantDataBtn);
        tutorialContentArea.appendChild(clearDataBtn);
    }

    // 反馈许愿 (Between Us) - 放在云端备份下面
    const feedbackSection = document.createElement('div');
    feedbackSection.style.cursor = 'pointer';
    const iconMessage = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
    
    // 点击时弹窗提示
    feedbackSection.addEventListener('click', (e) => {
        e.preventDefault();
        showWishClosedModal();
    });

    if (isModern) {
        feedbackSection.className = 'tutorial-modern-link-card';
        feedbackSection.innerHTML = `
            <div class="tutorial-modern-link-card-inner">
                <div class="tutorial-modern-link-icon">${iconMessage}</div>
                <div class="tutorial-modern-link-text">
                    <div class="tutorial-modern-link-title">匿名许愿</div>
                    <div class="tutorial-modern-link-desc">匿名投喂 BUG / 想法 / 愿望，完全保密</div>
                </div>
                <span class="arrow">›</span>
            </div>
            <div class="tutorial-modern-link-note">
                <span style="color:#c7c7cc;">ℹ</span> 该网站为匿名单向通道：提交后如显示错误属于网站问题，实际已成功提交。作者的回复你不会看到，请放心留言。
            </div>
        `;
    } else if (isRabbit) {
        feedbackSection.className = 'tutorial-rabbit-link-card';
        feedbackSection.innerHTML = `
            <div class="tutorial-rabbit-card">
                <div class="tutorial-rabbit-link-card-inner">
                    <div class="tutorial-rabbit-link-icon">${iconMessage}</div>
                    <div class="tutorial-rabbit-link-text">
                        <div class="tutorial-rabbit-link-title">匿名许愿</div>
                        <div class="tutorial-rabbit-link-desc">匿名投喂 BUG / 想法 / 愿望，完全保密</div>
                    </div>
                    <svg style="width:8px; height:8px; flex-shrink:0;" viewBox="0 0 8 8"><path d="M1 1l3 3-3 3" fill="none" stroke="#ccc" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>
                <div class="tutorial-rabbit-link-note">
                    <span style="color:#ddd;">ℹ</span> 该网站为匿名单向通道：提交后如显示错误属于网站问题，实际已成功提交。作者的回复你不会看到，请放心留言。
                </div>
            </div>
        `;
    } else {
        feedbackSection.style.cssText = 'display:block; text-decoration:none; color:inherit; margin-top:12px;';
        feedbackSection.innerHTML = `
            <div class="btn-white" style="display:block; cursor:pointer; background:#fff; border:1px solid #e0e0e0; border-radius:8px; padding:12px;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="width:40px; height:40px; border-radius:8px; background:#f5f5f5; display:flex; align-items:center; justify-content:center; flex-shrink:0; color:#666;">
                        ${iconMessage}
                    </div>
                    <div style="flex:1; min-width:0;">
                        <div style="color:#333; font-weight:500; font-size:0.89rem; margin-bottom:2px;">匿名许愿</div>
                        <div style="font-size:0.81rem; color:#888;">匿名投喂 BUG / 想法 / 愿望，完全保密</div>
                    </div>
                    <svg style="width:14px; height:14px; color:#999; flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
                <div style="padding:8px 0 0; font-size:0.75rem; color:#aaa; line-height:1.5;">
                    <span style="color:#ccc;">ℹ</span> 该网站为匿名单向通道：提交后如显示错误属于网站问题，实际已成功提交。作者的回复你不会看到，请放心留言。
                </div>
            </div>
        `;
    }

    // 公开许愿 - 链接到金山文档
    const publicWishSection = document.createElement('div');
    publicWishSection.style.cursor = 'pointer';
    const iconStar = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
    
    // 点击时弹窗提示
    publicWishSection.addEventListener('click', (e) => {
        e.preventDefault();
        showWishClosedModal();
    });

    if (isModern) {
        publicWishSection.className = 'tutorial-modern-link-card';
        publicWishSection.innerHTML = `
            <div class="tutorial-modern-link-card-inner">
                <div class="tutorial-modern-link-icon">${iconStar}</div>
                <div class="tutorial-modern-link-text">
                    <div class="tutorial-modern-link-title">公开许愿</div>
                    <div class="tutorial-modern-link-desc">在文档中公开写下你的愿望，大家都能看到</div>
                </div>
                <span class="arrow">›</span>
            </div>
        `;
    } else if (isRabbit) {
        publicWishSection.className = 'tutorial-rabbit-link-card';
        publicWishSection.innerHTML = `
            <div class="tutorial-rabbit-card">
                <div class="tutorial-rabbit-link-card-inner">
                    <div class="tutorial-rabbit-link-icon">${iconStar}</div>
                    <div class="tutorial-rabbit-link-text">
                        <div class="tutorial-rabbit-link-title">公开许愿</div>
                        <div class="tutorial-rabbit-link-desc">在文档中公开写下你的愿望，大家都能看到</div>
                    </div>
                    <svg style="width:8px; height:8px; flex-shrink:0;" viewBox="0 0 8 8"><path d="M1 1l3 3-3 3" fill="none" stroke="#ccc" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>
            </div>
        `;
    } else {
        publicWishSection.style.cssText = 'display:block; text-decoration:none; color:inherit; margin-top:12px;';
        publicWishSection.innerHTML = `
            <div class="btn-white" style="display:block; cursor:pointer; background:#fff; border:1px solid #e0e0e0; border-radius:8px; padding:12px;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="width:40px; height:40px; border-radius:8px; background:#f5f5f5; display:flex; align-items:center; justify-content:center; flex-shrink:0; color:#666;">
                        ${iconStar}
                    </div>
                    <div style="flex:1; min-width:0;">
                        <div style="color:#333; font-weight:500; font-size:0.89rem; margin-bottom:2px;">公开许愿</div>
                        <div style="font-size:0.81rem; color:#888;">在文档中公开写下你的愿望，大家都能看到</div>
                    </div>
                    <svg style="width:14px; height:14px; color:#999; flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
            </div>
        `;
    }

    // GitHub Backup UI
    const githubSection = document.createElement('div');
    const iconEyeOpen = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    const iconEyeClosed = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

    githubSection.innerHTML = `
        ${isModern ? '' : (isRabbit ? '<div style="font-size:16px; font-weight:500; color:#555; margin:20px 0 12px; text-align:center; letter-spacing:1px;">云端备份 (GitHub)</div>' : '<div style="font-size:0.89rem; color:#999; margin:20px 0 8px;">云端备份 (GitHub)</div>')}
        <div class="${isModern ? 'tutorial-modern-gh-card' : (isRabbit ? 'tutorial-rabbit-card' : 'btn-white')}" style="${isModern || isRabbit ? '' : 'display:block; cursor:default; background:#fff; border:1px solid #e0e0e0; border-radius:8px; padding:12px;'}">
            <div id="gh-collapse-header" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; padding:${isRabbit ? '16px 20px' : '0 0 5px 0'};">
                <div style="display:flex; align-items:center;">
                    <span style="color:${isRabbit ? '#444' : '#333'}; font-weight:500;">${isModern ? '配置参数' : (isRabbit ? '配置参数' : '🔧 配置参数')}</span>
                    <div id="gh-help-btn" style="margin-left:8px; display:flex; align-items:center; padding:2px; cursor:pointer;">
                        <svg style="width:16px; height:16px; color:${isRabbit ? '#ccc' : '#1890ff'};" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    </div>
                </div>
                <svg class="toggle-icon" style="width:14px; height:14px; color:#999; transition:transform 0.3s;" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></polyline></svg>
            </div>

            <div id="gh-config-area" style="display:none; padding:${isRabbit ? '0 20px 20px' : '10px 0 0 0'}; border-top:${isRabbit ? '1px solid #fcfafb' : '1px dashed #eee'};">
                <div style="margin-bottom:10px; margin-top:${isRabbit ? '16px' : '0'};">
                    <div style="font-size:0.81rem; color:#666; margin-bottom:5px;">GitHub Token</div>
                    <div style="position:relative;">
                        <input type="password" id="gh-token-input" placeholder="ghp_xxxx..." style="width:100%; border:1px solid #eee; padding:8px; padding-right:35px; border-radius:4px; font-size:0.89rem;">
                        <div id="gh-eye-btn" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); color:#999; cursor:pointer; display:flex;">
                            ${iconEyeClosed}
                        </div>
                    </div>
                </div>
                <div style="margin-bottom:10px;">
                    <div style="font-size:0.81rem; color:#666; margin-bottom:5px;">仓库路径 (用户名/仓库名)</div>
                    <input type="text" id="gh-repo-input" placeholder="username/repo" style="width:100%; border:1px solid #eee; padding:8px; border-radius:4px; font-size:0.89rem;">
                </div>
                <div style="margin-bottom:10px;">
                    <div style="font-size:0.81rem; color:#666; margin-bottom:5px;">备份文件名 (可选，填则覆盖)</div>
                    <input type="text" id="gh-filename-input" placeholder="例如: my_backup.ee" style="width:100%; border:1px solid #eee; padding:8px; border-radius:4px; font-size:0.89rem;">
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding:0 ${isRabbit ? '20px' : '0'}; border-top:1px solid #f5f5f5; padding-top:10px;">
                <span>自动备份开关</span>
                <label class="switch" style="position:relative; display:inline-block; width:40px; height:24px;">
                    <input type="checkbox" id="gh-auto-switch" style="opacity:0; width:0; height:0;">
                    <span style="position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background-color:#ccc; transition:.4s; border-radius:24px;" id="gh-switch-slider"></span>
                    <style>
                        #gh-auto-switch:checked + #gh-switch-slider { background-color: ${isModern ? '#34c759' : (isRabbit ? '#e8dfe1' : '#333')}; }
                        #gh-switch-slider:before { position:absolute; content:""; height:16px; width:16px; left:4px; bottom:4px; background-color:white; transition:.4s; border-radius:50%; }
                        #gh-auto-switch:checked + #gh-switch-slider:before { transform: translateX(16px); }
                    </style>
                </label>
            </div>

            <div id="gh-interval-setting" style="display:none; justify-content:space-between; align-items:center; margin-top:10px; padding:0 ${isRabbit ? '20px' : '0'};">
                <span style="font-size:0.89rem; color:#666;">备份频率</span>
                <select id="gh-interval-select" style="border:1px solid #eee; padding:5px; border-radius:4px; font-size:0.89rem; background:#fff;">
                    <option value="24">每 24 小时</option>
                    <option value="36">每 36 小时</option>
                    <option value="48">每 48 小时</option>
                </select>
            </div>

            <div style="margin-top:15px; padding:0 ${isRabbit ? '20px' : '0'}; display:flex; gap:10px;">
                <div id="gh-backup-btn" class="gh-btn" style="flex:1; background:${isModern ? '#000' : (isRabbit ? '#f5f0f1' : '#333')}; color:${isRabbit ? '#555' : '#fff'}; text-align:center; padding:8px; border-radius:4px; font-size:0.89rem; cursor:pointer;">立即备份</div>
                <div id="gh-restore-btn" class="gh-btn" style="flex:1; background:${isRabbit ? '#fff' : '#1890ff'}; color:${isRabbit ? '#555' : '#fff'}; border:${isRabbit ? '1px solid #f0eaeb' : 'none'}; text-align:center; padding:8px; border-radius:4px; font-size:0.89rem; cursor:pointer;">恢复最新</div>
                <div id="gh-check-btn" class="gh-btn" style="flex:1; background:${isRabbit ? '#fdfbfb' : '#f5f5f5'}; color:#666; border:${isRabbit ? '1px solid #f0eaeb' : 'none'}; text-align:center; padding:8px; border-radius:4px; font-size:0.89rem; cursor:pointer;">检查状态</div>
            </div>
            
            <div id="gh-status-msg" style="margin-top:10px; padding:0 ${isRabbit ? '20px' : '0'} 16px; font-size:0.74rem; color:#999;"></div>
        </div>
    `;
    
    // 触感反馈开关
    const hapticSection = document.createElement('div');
    
    if (isRabbit) {
        hapticSection.innerHTML = `
            <div style="font-size:16px; font-weight:500; color:#555; margin:20px 0 12px; text-align:center; letter-spacing:1px;">移动端触感</div>
            <div class="tutorial-rabbit-card">
                <div style="padding:16px 20px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="flex:1;">
                        <div style="color:#444; font-weight:500; font-size:15px; margin-bottom:4px;">触感反馈</div>
                        <div style="font-size:13px; color:#aaa;">开启后，点击、长按等操作会有震动反馈</div>
                    </div>
                    <label class="haptic-switch" style="position:relative; display:inline-block; width:44px; height:26px; margin-left:16px;">
                        <input type="checkbox" id="haptic-feedback-switch" style="opacity:0; width:0; height:0;">
                        <span style="position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background-color:#e8e8e8; transition:.3s; border-radius:26px;" id="haptic-switch-slider"></span>
                        <style>
                            #haptic-feedback-switch:checked + #haptic-switch-slider { background-color: #e8dfe1; }
                            #haptic-switch-slider:before { position:absolute; content:""; height:20px; width:20px; left:3px; bottom:3px; background-color:white; transition:.3s; border-radius:50%; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                            #haptic-feedback-switch:checked + #haptic-switch-slider:before { transform: translateX(18px); }
                        </style>
                    </label>
                </div>
            </div>
        `;
    } else if (isModern) {
        hapticSection.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:14px 16px; background:#fff; border-bottom:1px solid #e5e5ea;">
                <div style="flex:1;">
                    <div style="color:#000; font-size:16px; margin-bottom:2px;">触感反馈</div>
                    <div style="font-size:13px; color:#8e8e93;">开启后，点击、长按等操作会有震动反馈</div>
                </div>
                <label class="haptic-switch" style="position:relative; display:inline-block; width:40px; height:24px; margin-left:12px;">
                    <input type="checkbox" id="haptic-feedback-switch" style="opacity:0; width:0; height:0;">
                    <span style="position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background-color:#ccc; transition:.4s; border-radius:24px;" id="haptic-switch-slider"></span>
                    <style>
                        #haptic-feedback-switch:checked + #haptic-switch-slider { background-color: #34c759; }
                        #haptic-switch-slider:before { position:absolute; content:""; height:16px; width:16px; left:4px; bottom:4px; background-color:white; transition:.4s; border-radius:50%; }
                        #haptic-feedback-switch:checked + #haptic-switch-slider:before { transform: translateX(16px); }
                    </style>
                </label>
            </div>
        `;
    } else {
        hapticSection.innerHTML = `
            <div style="margin-top:12px; display:block; background:#fff; border:1px solid #e0e0e0; border-radius:8px; padding:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="flex:1;">
                        <div style="color:#333; font-weight:500; font-size:0.89rem; margin-bottom:3px;">触感反馈</div>
                        <div style="font-size:0.81rem; color:#888;">开启后，点击、长按等操作会有震动反馈</div>
                    </div>
                    <label class="haptic-switch" style="position:relative; display:inline-block; width:40px; height:24px; margin-left:12px;">
                        <input type="checkbox" id="haptic-feedback-switch" style="opacity:0; width:0; height:0;">
                        <span style="position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background-color:#ccc; transition:.4s; border-radius:24px;" id="haptic-switch-slider"></span>
                        <style>
                            #haptic-feedback-switch:checked + #haptic-switch-slider { background-color: #333; }
                            #haptic-switch-slider:before { position:absolute; content:""; height:16px; width:16px; left:4px; bottom:4px; background-color:white; transition:.4s; border-radius:50%; }
                            #haptic-feedback-switch:checked + #haptic-switch-slider:before { transform: translateX(16px); }
                        </style>
                    </label>
                </div>
            </div>
        `;
    }
    
    if (isModern) {
        modernGroups.github.appendChild(githubSection);
        modernGroups.github.appendChild(hapticSection);
        modernGroups.github.appendChild(feedbackSection);
        modernGroups.github.appendChild(publicWishSection);
    } else {
        tutorialContentArea.appendChild(githubSection);
        tutorialContentArea.appendChild(hapticSection);
        tutorialContentArea.appendChild(feedbackSection);
        tutorialContentArea.appendChild(publicWishSection);
    }

    const existingOverlay = document.getElementById('gh-help-overlay');
    if (existingOverlay) existingOverlay.remove();

    const helpOverlay = document.createElement('div');
    helpOverlay.id = 'gh-help-overlay';
    helpOverlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999; display: none; align-items: center; justify-content: center;';
    
    helpOverlay.onclick = function(e) { 
        if(e.target === this) this.style.display = 'none'; 
    };
    
    helpOverlay.innerHTML = `
        <div class="modal-window" style="width: 85%; max-height: 80vh; overflow-y: auto; background: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 5px 20px rgba(0,0,0,0.2);">
            <h3 style="margin-top:0; margin-bottom:15px; text-align:center; font-size:1.1rem; color: var(--primary-color);">GitHub 配置指南</h3>
            
            <h4 style="margin:10px 0 5px; color:#333;">1. 获取 Token</h4>
            <ol style="padding-left:20px; font-size:0.89rem; color:#555; line-height:1.6;">
                <li>登录 GitHub，点击头像 → <strong>Settings</strong></li>
                <li>左侧菜单到底 → <strong>Developer settings</strong></li>
                <li><strong>Personal access tokens</strong> → <strong>Tokens (classic)</strong></li>
                <li>Generate new token (classic)</li>
                <li>Expiration 选 <strong>No expiration</strong></li>
                <li><strong style="color:#d32f2f;">Scopes 必须勾选 repo (包含所有子项)</strong></li>
                <li>点击 Generate，复制 ghp_ 开头的字符。<br><strong style="color:#d32f2f;">一定要现在复制并保存好！一旦刷新页面，你就再也看不到它了。</strong></li>
            </ol>

            <h4 style="margin:15px 0 5px; color:#333;">2. 创建仓库</h4>
            <ol style="padding-left:20px; font-size:0.89rem; color:#555; line-height:1.6;">
                <li>右上角 + 号 → <strong>New repository</strong></li>
                <li>Repository name 填个名字</li>
                <li>建议选 <strong>Private</strong> (私有)</li>
                <li>点击 Create repository</li>
            </ol>

            <h4 style="margin:15px 0 5px; color:#333;">3. 填写示例</h4>
            <ul style="padding-left:20px; font-size:0.89rem; color:#555; line-height:1.6;">
                <li>Token: <code>ghp_xxxxxxxxxxxx...</code></li>
                <li>仓库路径: <code>用户名/仓库名</code></li>
            </ul>

            <div style="margin-top:20px; text-align: center;">
                <button class="btn btn-primary" onclick="document.getElementById('gh-help-overlay').style.display='none'">我学会了</button>
            </div>
        </div>
    `;
    document.body.appendChild(helpOverlay);

    document.getElementById('gh-collapse-header').addEventListener('click', function() {
        const area = document.getElementById('gh-config-area');
        const icon = this.querySelector('.toggle-icon');
        if (area.style.display === 'none') {
            area.style.display = 'block';
            icon.style.transform = 'rotate(180deg)';
        } else {
            area.style.display = 'none';
            icon.style.transform = 'rotate(0deg)';
        }
    });

    document.getElementById('gh-help-btn').addEventListener('click', function(e) {
        e.stopPropagation(); 
        document.getElementById('gh-help-overlay').style.display = 'flex';
    });

    document.getElementById('gh-eye-btn').addEventListener('click', function() {
        const input = document.getElementById('gh-token-input');
        if (input.type === 'password') {
            input.type = 'text';
            this.innerHTML = iconEyeOpen;
        } else {
            input.type = 'password';
            this.innerHTML = iconEyeClosed;
        }
    });

    const saveHandler = () => { if(window.GitHubMgr) window.GitHubMgr.saveConfig(); };
    document.getElementById('gh-token-input').addEventListener('change', saveHandler);
    document.getElementById('gh-repo-input').addEventListener('change', saveHandler);
    document.getElementById('gh-filename-input').addEventListener('change', saveHandler);
    document.getElementById('gh-auto-switch').addEventListener('change', saveHandler);
    document.getElementById('gh-interval-select').addEventListener('change', saveHandler);

    document.getElementById('gh-backup-btn').addEventListener('click', () => window.GitHubMgr.testUpload());
    document.getElementById('gh-restore-btn').addEventListener('click', () => window.GitHubMgr.restoreLatest());
    document.getElementById('gh-check-btn').addEventListener('click', () => window.GitHubMgr.checkStatus());

    // 触感反馈开关事件监听
    const hapticSwitch = document.getElementById('haptic-feedback-switch');
    if (hapticSwitch) {
        // 初始化开关状态
        hapticSwitch.checked = db.hapticEnabled !== false; // 默认开启
        
        hapticSwitch.addEventListener('change', (e) => {
            db.hapticEnabled = e.target.checked;
            saveData();
            
            // 触发一次触感反馈让用户感受效果
            if (e.target.checked && typeof triggerHapticFeedback === 'function') {
                triggerHapticFeedback('medium');
            }
            
            showToast(e.target.checked ? '触感反馈已开启' : '触感反馈已关闭');
        });
    }

    if(window.GitHubMgr) {
        window.GitHubMgr.init();
    }
}

// 创建完整的备份数据（确保主题预设、屏幕预设等 globalSettingKeys 全部导出）
async function createFullBackupData() {
    const backupData = JSON.parse(JSON.stringify(db));
    const keys = window.globalSettingKeysForBackup || [];
    keys.forEach(k => {
        if (db[k] !== undefined && backupData[k] === undefined) {
            try { backupData[k] = JSON.parse(JSON.stringify(db[k])); } catch (e) { backupData[k] = db[k]; }
        }
    });
    backupData._exportVersion = '3.0';
    backupData._exportTimestamp = Date.now();
    return backupData;
}

// 小剧场相关的所有 db 键（用于分类导出/导入）
const THEATER_DB_KEYS = [
    'theaterScenarios', 'theaterPromptPresets',
    'theaterHtmlScenarios', 'theaterHtmlPromptPresets',
    'theaterMode', 'theaterApiSettings', 'theaterFontSize', 'theaterFontPreset'
];

// 分类导出：只包含选中的表
async function createPartialBackupData(selectedKeys) {
    const keys = window.globalSettingKeysForBackup || [];
    const result = { _exportVersion: '3.0_partial', _exportTimestamp: Date.now(), _exportTables: selectedKeys };
    for (const key of selectedKeys) {
        if (key === 'globalSettings') {
            result.globalSettings = {};
            keys.forEach(k => { result.globalSettings[k] = db[k] !== undefined ? JSON.parse(JSON.stringify(db[k])) : undefined; });
        } else if (key === 'theaterData') {
            result.theaterData = {};
            THEATER_DB_KEYS.forEach(k => { result.theaterData[k] = db[k] !== undefined ? JSON.parse(JSON.stringify(db[k])) : undefined; });
        } else if (db[key] !== undefined) {
            result[key] = JSON.parse(JSON.stringify(db[key]));
        }
    }
    return result;
}

// 分类导入：只合并文件里包含的表，不覆盖其他数据
async function importPartialBackupData(data) {
    const startTime = Date.now();
    const tables = data._exportTables || [];
    if (tables.length === 0) return { success: false, error: '文件中没有可导入的分类' };
    try {
        const keys = window.globalSettingKeysForBackup || [];
        for (const key of tables) {
            if (key === 'globalSettings' && data.globalSettings) {
                Object.keys(data.globalSettings).forEach(k => { db[k] = data.globalSettings[k]; });
            } else if (key === 'theaterData' && data.theaterData) {
                Object.keys(data.theaterData).forEach(k => { db[k] = data.theaterData[k]; });
            } else if (data[key] !== undefined) {
                db[key] = data[key];
            }
        }
        showToast('正在写入...');
        await saveData(db);
        const duration = Date.now() - startTime;
        return { success: true, message: `分类导入完成 (耗时${duration}ms)` };
    } catch (error) {
        console.error('分类导入失败:', error);
        return { success: false, error: error.message };
    }
}

// 导入备份数据
async function importBackupData(data) {
    const startTime = Date.now();
    try {
        const clearTasks = [
            dexieDB.characters.clear(),
            dexieDB.groups.clear(),
            dexieDB.worldBooks.clear(),
            dexieDB.myStickers.clear(),
            dexieDB.globalSettings.clear()
        ];
        if (dexieDB.archives) clearTasks.push(dexieDB.archives.clear());
        await Promise.all(clearTasks);
        showToast('正在清空旧数据...');

        let convertedData = data;

        if (data._exportVersion !== '3.0') {
            showToast('检测到旧版备份文件，正在转换格式...');
            
            const reassembleHistory = (chat, backupData) => {
                if (!chat.history || !Array.isArray(chat.history) || chat.history.length === 0) {
                    return [];
                }
                if (typeof chat.history[0] === 'object' && chat.history[0] !== null) {
                    return chat.history;
                }
                if (backupData.__chunks__ && typeof chat.history[0] === 'string') {
                    let fullHistory = [];
                    chat.history.forEach(key => {
                        if (backupData.__chunks__[key]) {
                            try {
                                const chunk = JSON.parse(backupData.__chunks__[key]);
                                fullHistory = fullHistory.concat(chunk);
                            } catch (e) {
                                console.error(`Failed to parse history chunk ${key}`, e);
                            }
                        }
                    });
                    return fullHistory;
                }
                return []; 
            };

            const newData = { ...data };

            if (newData.characters) {
                newData.characters = newData.characters.map(char => ({
                    ...char,
                    history: reassembleHistory(char, data)
                }));
            }
            if (newData.groups) {
                newData.groups = newData.groups.map(group => ({
                    ...group,
                    history: reassembleHistory(group, data)
                }));
            }
            
            convertedData = newData;
        }

        // 从备份恢复所有键（不限于当前 db 的键），避免漏掉主题预设、屏幕预设等
        const metaKeys = ['_exportVersion', '_exportTimestamp', '_exportTables'];
        Object.keys(convertedData).forEach(key => {
            if (metaKeys.includes(key)) return;
            if (convertedData[key] !== undefined) {
                db[key] = convertedData[key];
            }
        });

        // 补全角色/群聊缺失字段（如主题等），避免旧版备份或残缺数据导致预设丢失
        (db.characters || []).forEach(c => {
            if (c.theme === undefined || c.theme === null || c.theme === '') c.theme = 'white_pink';
        });
        (db.groups || []).forEach(g => {
            if (g.theme === undefined || g.theme === null || g.theme === '') g.theme = 'white_pink';
        });

        if (!db.pomodoroTasks) db.pomodoroTasks = [];
        if (!db.pomodoroSettings) db.pomodoroSettings = { boundCharId: null, userPersona: '', focusBackground: '', taskCardBackground: '', encouragementMinutes: 25, pokeLimit: 5, globalWorldBookIds: [] };
        if (!db.insWidgetSettings) db.insWidgetSettings = { avatar1: 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg', bubble1: 'love u.', avatar2: 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg', bubble2: 'miss u.' };
        if (!db.homeWidgetSettings) db.homeWidgetSettings = JSON.parse(JSON.stringify(defaultWidgetSettings));
        if (!Array.isArray(db.themePresets)) db.themePresets = [];
        if (!db.themeSettings || typeof db.themeSettings !== 'object') db.themeSettings = { global: {}, wallpapers: {}, bottomNav: {}, chatScreen: {} };
        if (!Array.isArray(db.iconPresets)) db.iconPresets = [];
        if (!Array.isArray(db.homeWidgetPresets)) db.homeWidgetPresets = [];
        if (!Array.isArray(db.widgetWallpaperPresets)) db.widgetWallpaperPresets = [];

        showToast('正在写入新数据...');
        await saveData(db);

        const duration = Date.now() - startTime;
        const message = `导入完成 (耗时${duration}ms)`;
        
        return { success: true, message: message };

    } catch (error) {
        console.error('导入数据失败:', error);
        return {
            success: false,
            error: error.message,
            duration: Date.now() - startTime
        };
    }
}

// GitHub Manager
const GitHubMgr = {
    config: { token: '', repo: '', auto: false, interval: 48, lastTime: 0, fileName: '' },
    
    init: () => {
        const confStr = localStorage.getItem('gh_config');
        if(confStr) GitHubMgr.config = JSON.parse(confStr);
        
        const tokenInput = document.getElementById('gh-token-input');
        const repoInput = document.getElementById('gh-repo-input');
        const fileNameInput = document.getElementById('gh-filename-input');
        const autoSwitch = document.getElementById('gh-auto-switch');
        
        if(tokenInput) tokenInput.value = GitHubMgr.config.token || '';
        if(repoInput) repoInput.value = GitHubMgr.config.repo || '';
        if(fileNameInput) fileNameInput.value = GitHubMgr.config.fileName || '';
        
        if(autoSwitch) {
            autoSwitch.checked = GitHubMgr.config.auto || false;
            document.getElementById('gh-interval-setting').style.display = autoSwitch.checked ? 'flex' : 'none';
        }
        if(document.getElementById('gh-interval-select')) {
            document.getElementById('gh-interval-select').value = GitHubMgr.config.interval || 48;
        }
        
        if(GitHubMgr.config.auto) GitHubMgr.checkAndBackup();
        GitHubMgr.updateStatusText();
    },
    
    saveConfig: () => {
        let token = document.getElementById('gh-token-input').value.trim();
        // 自动清理 Token：移除前缀和空格
        token = token.replace(/^(Bearer|token)\s+/i, '').replace(/\s+/g, '');

        const repo = document.getElementById('gh-repo-input').value.trim();
        const fileName = document.getElementById('gh-filename-input').value.trim();
        const auto = document.getElementById('gh-auto-switch').checked;
        const interval = parseInt(document.getElementById('gh-interval-select').value);
        
        GitHubMgr.config.token = token;
        GitHubMgr.config.repo = repo;
        GitHubMgr.config.fileName = fileName;
        GitHubMgr.config.auto = auto;
        GitHubMgr.config.interval = interval;
        
        document.getElementById('gh-interval-setting').style.display = auto ? 'flex' : 'none';
        
        localStorage.setItem('gh_config', JSON.stringify(GitHubMgr.config));
        GitHubMgr.updateStatusText();
        
        if(auto) GitHubMgr.checkAndBackup();
    },
    
    updateStatusText: () => {
        const el = document.getElementById('gh-status-msg');
        if(!el) return;
        if(!GitHubMgr.config.lastTime) el.innerText = '从未备份过';
        else {
            const date = new Date(GitHubMgr.config.lastTime);
            const nextTime = new Date(GitHubMgr.config.lastTime + (GitHubMgr.config.interval || 48) * 3600000);
            el.innerText = `上次: ${date.toLocaleString()} (下次约: ${nextTime.toLocaleString()})`;
        }
    },
    
    checkAndBackup: async () => {
        if(!GitHubMgr.config.token || !GitHubMgr.config.repo || !GitHubMgr.config.auto) return;
        const now = Date.now();
        const interval = GitHubMgr.config.interval || 48;
        const hours = (now - (GitHubMgr.config.lastTime || 0)) / (1000 * 60 * 60);
        
        if(hours >= interval) {
            console.log(`距离上次备份已过 ${hours.toFixed(1)} 小时，触发自动备份...`);
            
            const toast = document.createElement('div');
            toast.style.cssText = 'position:fixed; top:10px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.7); color:#fff; padding:8px 15px; border-radius:20px; font-size:12px; z-index:9999; pointer-events:none; transition:opacity 0.5s;';
            toast.innerText = '正在后台准备自动备份...';
            document.body.appendChild(toast);
            
            try {
                await GitHubMgr.performUpload((msg) => { toast.innerText = '自动备份: ' + msg; });
                toast.innerText = '自动备份成功！';
                setTimeout(() => toast.remove(), 3000);
            } catch(e) {
                console.error('自动备份失败', e);
                toast.innerText = '自动备份失败: ' + e.message;
                setTimeout(() => toast.remove(), 5000);
            }
        }
    },
    
    testUpload: async () => {
        GitHubMgr.saveConfig(); // 强制保存当前输入框的值
        if(!GitHubMgr.config.token || !GitHubMgr.config.repo) return alert('请先填写 Token 和 仓库路径');
        showToast('开始备份...');
        const btn = event.target;
        const originalText = btn.innerText;
        btn.innerText = '备份中...';
        btn.style.pointerEvents = 'none';
        
        try {
            await GitHubMgr.performUpload((msg) => { showToast(msg); });
            showToast('上传成功！');
        } catch(e) {
            showToast('上传失败: ' + e.message);
        } finally {
            btn.innerText = originalText;
            btn.style.pointerEvents = 'auto';
        }
    },
    
    // 单文件上传上限（base64 字符数），超过则走分片。约 35MB base64 对应解码后约 26MB，低于 GitHub 100MB 限制
    _SINGLE_FILE_MAX_B64: 35 * 1024 * 1024,
    // 每片 base64 长度（字符数），分片时使用
    _CHUNK_B64_SIZE: 35 * 1024 * 1024,
    _CHUNKS_DIR: 'backup_chunks',

    _uploadOneFile: async (repoPath, base64ContentForApi, message, existingSha) => {
        const url = `https://api.github.com/repos/${GitHubMgr.config.repo}/contents/${encodeURIComponent(repoPath)}`;
        const body = { message: message || 'Backup', content: base64ContentForApi };
        if (existingSha) body.sha = existingSha;
        const res = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GitHubMgr.config.token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const errJson = await res.json();
            throw new Error(errJson.message || 'GitHub API Error');
        }
        return res;
    },

    performUpload: async (onProgress) => {
        // 1. 预检权限
        onProgress('正在检查权限...');
        const checkUrl = `https://api.github.com/repos/${GitHubMgr.config.repo}`;
        const checkRes = await fetch(checkUrl, {
            headers: { 'Authorization': `token ${GitHubMgr.config.token}` }
        });
        
        if (!checkRes.ok) {
             if (checkRes.status === 401) throw new Error('Token 无效或过期 (401)');
             if (checkRes.status === 404) throw new Error('仓库不存在或 Token 无权访问 (404)');
             throw new Error(`权限检查失败: ${checkRes.status}`);
        }
        
        const repoInfo = await checkRes.json();
        // 检查 push 权限
        if (repoInfo.permissions && repoInfo.permissions.push === false) {
            throw new Error('Token 缺少写入权限 (push)，请重新生成 Token 并勾选 repo 权限');
        }

        onProgress('正在打包数据...');
        const backupData = await createFullBackupData();
        const jsonString = JSON.stringify(backupData);
        
        onProgress('正在压缩...');
        const dataBlob = new Blob([jsonString]);
        const compressionStream = new CompressionStream('gzip');
        const compressedStream = dataBlob.stream().pipeThrough(compressionStream);
        const compressedBlob = await new Response(compressedStream, { headers: { 'Content-Type': 'application/octet-stream' } }).blob();
        
        onProgress('正在编码...');
        const base64Content = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const res = reader.result;
                let base64 = res.split(',')[1]; 
                // 移除可能存在的换行符，防止上传失败
                base64 = base64.replace(/\s/g, '');
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(compressedBlob);
        });

        const useChunked = base64Content.length > GitHubMgr._SINGLE_FILE_MAX_B64;
        const token = GitHubMgr.config.token;
        const repo = GitHubMgr.config.repo;

        if (!useChunked) {
            // 小文件：单文件上传（兼容原有逻辑）
            onProgress('正在上传至 GitHub...');
            let path = '';
            let sha = null;
            const customName = GitHubMgr.config.fileName;
            
            if (customName && customName.trim()) {
                path = customName.trim();
                if (!path.endsWith('.ee')) path += '.ee';
                try {
                    const checkUrl = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`;
                    const checkRes = await fetch(checkUrl, {
                        headers: { 'Authorization': `token ${token}` }
                    });
                    if (checkRes.ok) {
                        const fileData = await checkRes.json();
                        sha = fileData.sha;
                    }
                } catch(e) {
                    console.log('File does not exist or error checking:', e);
                }
            } else {
                const dateStr = new Date().toISOString().slice(0, 10);
                path = `AutoBackup_${dateStr}_${Date.now()}.ee`;
            }
            await GitHubMgr._uploadOneFile(path, base64Content, 'Auto backup', sha);
        } else {
            // 大文件：分片上传
            const backupId = Date.now();
            const chunkSize = GitHubMgr._CHUNK_B64_SIZE;
            const totalChunks = Math.ceil(base64Content.length / chunkSize);
            const chunkPaths = [];
            const dir = GitHubMgr._CHUNKS_DIR;

            for (let i = 0; i < totalChunks; i++) {
                const start = i * chunkSize;
                const end = Math.min(start + chunkSize, base64Content.length);
                const chunk = base64Content.slice(start, end);
                const chunkPath = `${dir}/BackupChunk_${backupId}_part${i}.ee.chunk`;
                chunkPaths.push(`BackupChunk_${backupId}_part${i}.ee.chunk`);

                onProgress(`正在上传分片 ${i + 1}/${totalChunks}...`);
                const contentForApi = btoa(chunk);
                await GitHubMgr._uploadOneFile(chunkPath, contentForApi, `Backup chunk ${i + 1}/${totalChunks}`);
            }

            const manifest = {
                backupId,
                totalChunks,
                chunkPaths,
                timestamp: backupId
            };
            const manifestPath = `${dir}/BackupChunk_${backupId}_manifest.json`;
            onProgress('正在上传清单...');
            await GitHubMgr._uploadOneFile(
                manifestPath,
                btoa(JSON.stringify(manifest)),
                'Backup manifest'
            );
        }

        GitHubMgr.config.lastTime = Date.now();
        localStorage.setItem('gh_config', JSON.stringify(GitHubMgr.config));
        GitHubMgr.updateStatusText();
    },
    
    checkStatus: async () => {
        if(!GitHubMgr.config.token || !GitHubMgr.config.repo) return showToast('未配置');
        const url = `https://api.github.com/repos/${GitHubMgr.config.repo}`;
        try {
            const res = await fetch(url, { headers: { 'Authorization': `token ${GitHubMgr.config.token}` } });
            if(res.ok) {
                const data = await res.json();
                alert(`连接成功！\n仓库: ${data.full_name}\n私有: ${data.private}\n说明: 配置有效`);
            } else {
                alert('连接失败，请检查 Token 或 仓库路径');
            }
        } catch(e) { alert('网络错误: ' + e.message); }
    },
    
    restoreLatest: async () => {
        if(!GitHubMgr.config.token || !GitHubMgr.config.repo) return alert('请先在配置中填写 Token 和 仓库路径');
        if(!confirm('⚠️ 警告：这将下载最新的自动备份并覆盖当前所有数据！\n此操作不可撤销！\n\n确定要继续吗？')) return;

        showToast('正在连接 GitHub...');
        const btn = event.target;
        const originalText = btn.innerText;
        btn.innerText = '恢复中...';
        btn.style.pointerEvents = 'none';

        const token = GitHubMgr.config.token;
        const repo = GitHubMgr.config.repo;
        const baseUrl = `https://api.github.com/repos/${repo}/contents`;
        const auth = { 'Authorization': `token ${token}` };

        try {
            const customName = GitHubMgr.config.fileName;
            let restoreChunked = false;
            let targetSingle = null;
            let targetManifest = null;

            if (customName && customName.trim()) {
                let path = customName.trim();
                if (!path.endsWith('.ee')) path += '.ee';
                targetSingle = { name: path };
            } else {
                const rootRes = await fetch(`${baseUrl}/`, { headers: auth });
                if (!rootRes.ok) {
                    if (rootRes.status === 404) throw new Error('仓库不存在或路径错误');
                    if (rootRes.status === 401) throw new Error('Token 无效或无权限');
                    throw new Error('获取列表失败: ' + rootRes.status);
                }
                const rootFiles = await rootRes.json();
                const singleBackups = rootFiles.filter(f => f.name.startsWith('AutoBackup_') && f.name.endsWith('.ee'));
                singleBackups.sort((a, b) => {
                    const getTs = (name) => {
                        const match = name.match(/_(\d+)\.ee$/);
                        return match ? parseInt(match[1]) : 0;
                    };
                    return getTs(b.name) - getTs(a.name);
                });
                if (singleBackups.length > 0) targetSingle = { name: singleBackups[0].name, ts: singleBackups[0].name.match(/_(\d+)\.ee$/)?.[1] || 0 };

                const chunksDirRes = await fetch(`${baseUrl}/${encodeURIComponent(GitHubMgr._CHUNKS_DIR)}`, { headers: auth });
                if (chunksDirRes.ok) {
                    const chunkFiles = await chunksDirRes.json();
                    const manifests = chunkFiles.filter(f => f.name.endsWith('_manifest.json') && f.name.startsWith('BackupChunk_'));
                    if (manifests.length > 0) {
                        manifests.sort((a, b) => {
                            const getId = (name) => {
                                const m = name.match(/BackupChunk_(\d+)_manifest/);
                                return m ? parseInt(m[1]) : 0;
                            };
                            return getId(b.name) - getId(a.name);
                        });
                        targetManifest = { name: manifests[0].name };
                    }
                }

                if (targetSingle && targetManifest) {
                    const singleTs = parseInt(targetSingle.ts, 10) || 0;
                    const chunkId = parseInt(targetManifest.name.match(/BackupChunk_(\d+)_manifest/)?.[1], 10) || 0;
                    restoreChunked = chunkId > singleTs;
                } else if (targetManifest) {
                    restoreChunked = true;
                }
            }

            let data;
            if (restoreChunked && targetManifest) {
                showToast('正在下载分片清单...');
                const manifestPath = `${GitHubMgr._CHUNKS_DIR}/${targetManifest.name}`;
                const manifestRes = await fetch(`${baseUrl}/${encodeURIComponent(manifestPath)}`, {
                    headers: { ...auth, 'Accept': 'application/vnd.github.v3.raw' }
                });
                if (!manifestRes.ok) throw new Error('下载清单失败: ' + manifestRes.status);
                const manifestText = await manifestRes.text();
                const manifest = JSON.parse(manifestText);

                let fullBase64 = '';
                for (let i = 0; i < manifest.totalChunks; i++) {
                    showToast(`正在下载分片 ${i + 1}/${manifest.totalChunks}...`);
                    const chunkFileName = manifest.chunkPaths[i];
                    const chunkPath = `${GitHubMgr._CHUNKS_DIR}/${chunkFileName}`;
                    const chunkRes = await fetch(`${baseUrl}/${encodeURIComponent(chunkPath)}`, {
                        headers: { ...auth, 'Accept': 'application/vnd.github.v3.raw' }
                    });
                    if (!chunkRes.ok) throw new Error('下载分片失败: ' + chunkRes.status);
                    fullBase64 += await chunkRes.text();
                }

                showToast('正在解码并解压...');
                const binStr = atob(fullBase64);
                const bytes = new Uint8Array(binStr.length);
                for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
                const blob = new Blob([bytes], { type: 'application/octet-stream' });

                const decompressionStream = new DecompressionStream('gzip');
                const decompressedStream = blob.stream().pipeThrough(decompressionStream);
                const jsonString = await new Response(decompressedStream).text();
                data = JSON.parse(jsonString);
            } else {
                if (!targetSingle) throw new Error('未找到可恢复的备份文件');
                showToast('正在下载: ' + targetSingle.name);
                const dlRes = await fetch(`${baseUrl}/${encodeURIComponent(targetSingle.name)}`, {
                    headers: { ...auth, 'Accept': 'application/vnd.github.v3.raw' }
                });
                if (!dlRes.ok) throw new Error('下载文件失败: ' + dlRes.status);
                showToast('下载完成，正在解压...');
                const blob = await dlRes.blob();
                const decompressionStream = new DecompressionStream('gzip');
                const decompressedStream = blob.stream().pipeThrough(decompressionStream);
                const jsonString = await new Response(decompressedStream).text();
                data = JSON.parse(jsonString);
            }

            showToast('解压完成，开始导入...');
            const importResult = await importBackupData(data);

            if (importResult.success) {
                showToast(`恢复成功！${importResult.message} 应用即将刷新。`);
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            } else {
                throw new Error(importResult.error);
            }

        } catch(e) {
            console.error(e);
            alert('恢复失败: ' + e.message);
            btn.innerText = originalText;
            btn.style.pointerEvents = 'auto';
        }
    }
};
window.GitHubMgr = GitHubMgr;

// 显示许愿功能关闭提示弹窗
function showWishClosedModal() {
    const oldModal = document.getElementById('wish-closed-modal-overlay');
    if (oldModal) oldModal.remove();

    const modalHtml = `
    <div id="wish-closed-modal-overlay" class="modal-overlay visible" style="z-index: 9999; align-items: center; justify-content: center; display: flex;">
        <div class="modal-window" style="max-width: 90%; width: 320px; padding: 0; overflow: hidden; display: flex; flex-direction: column; border-radius: 16px; background: #fff; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
            <div style="padding: 30px 20px 20px; text-align: center; flex-shrink: 0;">
                <div style="font-size: 48px; margin-bottom: 15px;">💤</div>
                <div style="font-size: 18px; font-weight: 600; color: #333; margin-bottom: 8px;">功能暂时关闭</div>
                <div style="font-size: 14px; color: #888; line-height: 1.5;">该功能暂时不可用</div>
            </div>
            <div style="padding: 15px 20px 20px; border-top: none; text-align: center; background: #fff; flex-shrink: 0;">
                <button class="btn btn-primary" style="width: 100%; border-radius: 12px; font-weight: 600; font-size: 16px; padding: 12px;" onclick="document.getElementById('wish-closed-modal-overlay').remove()">知道了</button>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}
