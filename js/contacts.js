// --- 联系人界面逻辑 (js/contacts.js) ---

let currentPersonaIndex = 0;
let currentEditingBindingCharId = null;

// 联系人屏幕初始化
function setupContactsScreen() {
    renderMyProfile();
    renderContactList();

    // 绑定我的名片点击事件 -> 跳转到新的“我的档案”页面
    const myProfileSection = document.getElementById('my-profile-section');
    if (myProfileSection) {
        myProfileSection.addEventListener('click', () => {
            setupMyProfileScreen(); 
            switchScreen('my-profile-screen');
        });
    }

    // 点击遮罩关闭 Profile Card
    const profileCardModal = document.getElementById('profile-card-modal');
    if (profileCardModal) {
        profileCardModal.addEventListener('click', (e) => {
            if (e.target === profileCardModal) {
                profileCardModal.classList.remove('visible');
            }
        });
    }

    // 资料卡中的“发消息”按钮
    const pcMessageBtn = document.getElementById('pc-message-btn');
    if (pcMessageBtn) {
        pcMessageBtn.addEventListener('click', () => {
            const charId = pcMessageBtn.dataset.charId;
            if (charId) {
                document.getElementById('profile-card-modal').classList.remove('visible');
                currentChatId = charId;
                currentChatType = 'private';
                const char = db.characters.find(c => c.id === charId);
                if (char) {
                    updateCustomBubbleStyle(currentChatId, char.customBubbleCss, char.useCustomBubbleCss);
                }
                openChatRoom(currentChatId, currentChatType);
            }
        });
    }
    
    // 初始化资料卡设置按钮
    const pcSettingsBtn = document.getElementById('pc-settings-btn');
    if (pcSettingsBtn) {
        pcSettingsBtn.addEventListener('click', () => {
            const charId = document.getElementById('pc-message-btn').dataset.charId;
            if (charId) {
                document.getElementById('profile-card-modal').classList.remove('visible');
                currentChatId = charId;
                currentChatType = 'private';
                loadSettingsToSidebar();
                switchScreen('chat-settings-screen');
            }
        });
    }

    // 点击 Token 数字打开 Token 分布弹窗
    const pcStatTokenClick = document.getElementById('pc-stat-token-click');
    if (pcStatTokenClick) {
        pcStatTokenClick.addEventListener('click', () => {
            const charId = document.getElementById('pc-message-btn').dataset.charId;
            if (charId && typeof getChatTokenBreakdown === 'function') {
                openTokenDistributionModal(charId);
            }
        });
    }

    // Token 分布弹窗关闭
    const tokenDistCloseBtn = document.getElementById('token-distribution-close-btn');
    const tokenDistModal = document.getElementById('token-distribution-modal');
    if (tokenDistCloseBtn) tokenDistCloseBtn.addEventListener('click', () => { if (tokenDistModal) tokenDistModal.classList.remove('visible'); });
    if (tokenDistModal) {
        tokenDistModal.addEventListener('click', (e) => {
            if (e.target === tokenDistModal) tokenDistModal.classList.remove('visible');
        });
    }

    // --- My Profile Screen Listeners ---
    const mpSaveBtn = document.getElementById('mp-save-btn');
    if (mpSaveBtn) mpSaveBtn.addEventListener('click', saveCurrentPersona);

    const mpAddBindingBtn = document.getElementById('mp-add-binding-btn');
    if (mpAddBindingBtn) mpAddBindingBtn.addEventListener('click', openCharSelectModal);

    const mpDeletePersonaBtn = document.getElementById('mp-delete-persona-btn');
    if (mpDeletePersonaBtn) mpDeletePersonaBtn.addEventListener('click', deleteCurrentPersona);

    const mpSetActiveBtn = document.getElementById('mp-set-active-btn');
    if (mpSetActiveBtn) mpSetActiveBtn.addEventListener('click', setAsActivePersona);

    // Carousel Avatar Upload
    const mpAvatarUpload = document.getElementById('mp-carousel-avatar-upload');
    if (mpAvatarUpload) {
        mpAvatarUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    const compressedUrl = await compressImage(file, {quality: 0.8, maxWidth: 300, maxHeight: 300});
                    // 更新当前显示的人设头像
                    if (db.myPersonaPresets && db.myPersonaPresets[currentPersonaIndex]) {
                        db.myPersonaPresets[currentPersonaIndex].avatar = compressedUrl;
                        // 重新渲染当前 active 的图片
                        // 找到当前居中的 img
                        const activeImg = document.querySelector('.mp-carousel-item.active img');
                        if (activeImg) activeImg.src = compressedUrl;
                        updateBgBlur(compressedUrl);
                    }
                } catch (err) {
                    showToast('头像处理失败');
                }
            }
        });
    }

    // Exclusive Panel Buttons
    document.getElementById('mp-panel-close-btn')?.addEventListener('click', closeExclusivePanel);
    document.getElementById('mp-exclusive-sheet')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('mp-exclusive-sheet')) closeExclusivePanel();
    });
    
    document.getElementById('mp-panel-confirm-btn')?.addEventListener('click', confirmExclusiveSetting);
    document.getElementById('mp-panel-unbind-btn')?.addEventListener('click', unbindCharacter);

    // Char Select Modal Buttons
    document.getElementById('mp-char-select-cancel')?.addEventListener('click', () => {
        document.getElementById('mp-char-select-modal').classList.remove('visible');
    });
    document.getElementById('mp-char-select-confirm')?.addEventListener('click', confirmCharSelection);
    
    // 监听输入框变化，实时更新内存数据 (name, persona)
    document.getElementById('mp-name-input')?.addEventListener('input', (e) => {
        if (db.myPersonaPresets[currentPersonaIndex]) {
            db.myPersonaPresets[currentPersonaIndex].name = e.target.value;
        }
    });
    document.getElementById('mp-persona-input')?.addEventListener('input', (e) => {
        if (db.myPersonaPresets[currentPersonaIndex]) {
            db.myPersonaPresets[currentPersonaIndex].persona = e.target.value;
        }
    });
}

// 渲染联系人页面的“我的名片”
function renderMyProfile() {
    let myName = 'User Name';
    let myStatus = '';
    let myAvatar = 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg';

    let activePersona = null;
    if (db.activePersonaId) {
        activePersona = db.myPersonaPresets.find(p => p.id === db.activePersonaId);
    }
    
    // 如果没有指定的 activePersona，回退到第一个
    if (!activePersona && db.myPersonaPresets && db.myPersonaPresets.length > 0) {
        activePersona = db.myPersonaPresets[0];
    }

    if (activePersona) {
        myName = activePersona.name || 'User';
        myStatus = activePersona.persona || '';
        myAvatar = activePersona.avatar || myAvatar;
    } else if (db.characters && db.characters.length > 0) {
        const firstChar = db.characters[0];
        myName = firstChar.myName || 'User Name';
        myStatus = firstChar.myPersona ? firstChar.myPersona.substring(0, 30) : ''; 
        myAvatar = firstChar.myAvatar || 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg';
    }

    const avatarEl = document.getElementById('contacts-my-avatar');
    const nameEl = document.getElementById('contacts-my-name');
    const statusEl = document.getElementById('contacts-my-status');

    if (avatarEl) avatarEl.src = myAvatar;
    if (nameEl) nameEl.textContent = myName;
    if (statusEl) {
        statusEl.textContent = ''; // 清空内容
        statusEl.style.display = 'none'; // 隐藏元素
    }
}

// 渲染联系人列表
function renderContactList() {
    const listContainer = document.getElementById('contacts-list');
    const countEl = document.getElementById('friends-count');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    
    const allContacts = db.characters || [];
    
    if (countEl) countEl.textContent = allContacts.length;

    // 按名称排序
    const sortedContacts = [...allContacts].sort((a, b) => {
        return (a.remarkName || a.realName).localeCompare(b.remarkName || b.realName);
    });

    sortedContacts.forEach(char => {
        const li = document.createElement('li');
        li.className = 'profile-item';
        
        const statusText = char.status || (char.persona ? char.persona.substring(0, 20) + '...' : '');

        li.innerHTML = `
            <img src="${char.avatar}" alt="${char.remarkName}" class="profile-avatar squircle">
            <div class="profile-info">
                <div class="profile-name">${char.remarkName}</div>
                <div class="profile-status">${statusText}</div>
            </div>
        `;
        
        li.addEventListener('click', () => {
            openProfileCard(char.id);
        });

        listContainer.appendChild(li);
    });
}

// 打开角色资料卡
function openProfileCard(charId) {
    const char = db.characters.find(c => c.id === charId);
    if (!char) return;

    document.getElementById('pc-avatar').src = char.avatar;
    document.getElementById('pc-name').textContent = char.realName || char.remarkName;
    document.getElementById('pc-remark').textContent = `@${char.remarkName}`;
    
    const msgCount = char.history ? char.history.length : 0;
    document.getElementById('pc-stat-msg-count').textContent = msgCount;

    let tokenCount = 0;
    if (typeof estimateChatTokens === 'function') {
        tokenCount = estimateChatTokens(char.id, 'private');
    }
    const memoryEl = document.getElementById('pc-stat-memory');
    if (memoryEl) memoryEl.textContent = tokenCount;

    let lastChat = '-';
    if (char.history && char.history.length > 0) {
        const lastMsg = char.history[char.history.length - 1];
        if (lastMsg.timestamp) {
            const date = new Date(lastMsg.timestamp);
            const now = new Date();
            if (date.toDateString() === now.toDateString()) {
                lastChat = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
            } else {
                lastChat = `${date.getMonth() + 1}/${date.getDate()}`;
            }
        }
    }
    document.getElementById('pc-stat-last-chat').textContent = lastChat;

    const personaText = char.persona || '暂无人设描述...';
    document.getElementById('pc-persona-text').textContent = personaText;

    const messageBtn = document.getElementById('pc-message-btn');
    messageBtn.dataset.charId = charId;

    document.getElementById('profile-card-modal').classList.add('visible');
}

// 打开 Token 分布弹窗（饼图 + 可点击详情 + 汇总）
function openTokenDistributionModal(charId) {
    const data = typeof getChatTokenBreakdown === 'function' ? getChatTokenBreakdown(charId, 'private') : null;
    const modal = document.getElementById('token-distribution-modal');
    const chartContainer = document.getElementById('token-chart-container');
    const totalEl = document.getElementById('token-distribution-total');
    const listEl = document.getElementById('token-details-list');
    const descEl = document.getElementById('token-detail-desc');
    if (!modal || !chartContainer || !totalEl || !listEl) return;

    if (!data || data.total === 0) {
        totalEl.textContent = '0';
        listEl.innerHTML = '<div style="text-align:center;color:#999;padding:16px;">暂无 Token 数据</div>';
        if (descEl) descEl.textContent = '';
        if (typeof echarts !== 'undefined' && window.__tokenDistChart) {
            window.__tokenDistChart.dispose();
            window.__tokenDistChart = null;
        }
        modal.classList.add('visible');
        return;
    }

    totalEl.textContent = data.total;
    const colorPalette = ['#ff80ab', '#90caf9', '#a5d6a7', '#fff59d', '#b39ddb', '#ffcc80'];
    const chartData = data.details.map((d, i) => ({ name: d.name, value: d.value, itemStyle: { color: colorPalette[i % colorPalette.length] } }));

    if (typeof echarts !== 'undefined') {
        if (window.__tokenDistChart) window.__tokenDistChart.dispose();
        window.__tokenDistChart = null;
        modal.classList.add('visible');
        setTimeout(function () {
            if (!chartContainer || !modal.classList.contains('visible')) return;
            window.__tokenDistChart = echarts.init(chartContainer);
            window.__tokenDistChart.setOption({
                color: colorPalette,
                tooltip: { trigger: 'item', formatter: '{b}: {c} Token ({d}%)' },
                legend: { show: false },
                series: [{
                    name: 'Token 分布',
                    type: 'pie',
                    center: ['50%', '50%'],
                    radius: ['45%', '70%'],
                    avoidLabelOverlap: false,
                    label: { show: false },
                    emphasis: { label: { show: true, fontSize: '16', fontWeight: 'bold' } },
                    labelLine: { show: false },
                    data: chartData
                }]
            });
            window.__tokenDistChart.resize();
        }, 50);
    } else {
        modal.classList.add('visible');
    }

    listEl.innerHTML = '';
    const total = data.total;
    data.details.forEach((item, index) => {
        const color = colorPalette[index % colorPalette.length];
        const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0;
        const div = document.createElement('div');
        div.className = 'token-detail-item';
        div.innerHTML = `
            <span class="token-detail-color" style="background:${color}"></span>
            <div class="token-detail-info">
                <span class="token-detail-name">${item.name}</span>
                <span class="token-detail-value">${item.value} Token</span>
            </div>
            <span class="token-detail-percent">${pct}%</span>
        `;
        div.dataset.desc = item.desc || '';
        div.addEventListener('click', function () {
            listEl.querySelectorAll('.token-detail-item').forEach(el => el.classList.remove('active'));
            this.classList.add('active');
            if (descEl) descEl.textContent = this.dataset.desc || '';
        });
        listEl.appendChild(div);
    });
    if (descEl) descEl.textContent = '';
    modal.classList.add('visible');
}

// --- NEW My Profile Logic (Cover Flow) ---

function setupMyProfileScreen() {
    // 1. 数据检查与初始化
    if (!db.myPersonaPresets) {
        db.myPersonaPresets = [];
    }

    // 如果完全没有预设，尝试从第一个角色创建一个默认的
    if (db.myPersonaPresets.length === 0) {
        if (db.characters && db.characters.length > 0) {
            const c = db.characters[0];
            db.myPersonaPresets.push({
                id: generateUUID(),
                name: c.myName || 'User',
                avatar: c.myAvatar || 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg',
                persona: c.myPersona || '',
                bindings: {} // 初始为空，保存时才会建立连接
            });
        } else {
            // 完全新号
            db.myPersonaPresets.push({
                id: generateUUID(),
                name: 'User',
                avatar: 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg',
                persona: '',
                bindings: {}
            });
        }
    }

    // 2. 补全字段 (针对老数据)
    db.myPersonaPresets.forEach(p => {
        if (!p.id) p.id = generateUUID();
        if (!p.bindings) p.bindings = {};
    });

    currentPersonaIndex = 0; // 重置到第一个
    renderPersonaCarousel();
    
    // 初始化时更新一下视觉效果 (需要等待DOM渲染)
    setTimeout(() => {
        updateCarouselVisuals();
        updatePersonaInfoArea(0);
    }, 50);
}

function renderPersonaCarousel() {
    const carousel = document.getElementById('mp-carousel');
    const indicators = document.getElementById('mp-carousel-indicators');
    carousel.innerHTML = '';
    indicators.innerHTML = '';

    // 计算 padding 以保证居中
    // 假设 Item Width = 100, 实际间距 = 60 (100 - 40)
    // 但 CSS 中设置了 scroll-snap-align: center，所以只要 padding 足够大即可
    const containerWidth = carousel.clientWidth || window.innerWidth;
    const itemWidth = 100; // CSS 固定
    const padding = (containerWidth - itemWidth) / 2;
    carousel.style.paddingLeft = `${padding}px`;
    carousel.style.paddingRight = `${padding}px`;

    // 渲染人设卡片
    db.myPersonaPresets.forEach((p, index) => {
        const item = document.createElement('div');
        item.className = 'mp-carousel-item';
        
        const img = document.createElement('img');
        img.src = p.avatar || 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg';
        img.className = 'mp-avatar-card';
        img.onclick = () => {
            if (item.classList.contains('active')) {
                document.getElementById('mp-carousel-avatar-upload').click();
            } else {
                item.scrollIntoView({ behavior: 'smooth', inline: 'center' });
            }
        };

        item.appendChild(img);
        carousel.appendChild(item);

        // Indicator
        const dot = document.createElement('div');
        dot.className = 'mp-indicator';
        indicators.appendChild(dot);
    });

    // 添加“新建”卡片
    const addItem = document.createElement('div');
    addItem.className = 'mp-carousel-item';
    addItem.innerHTML = `<div class="mp-add-card">+</div>`;
    addItem.onclick = createNewPersona;
    carousel.appendChild(addItem);

    // 监听滚动实现 Cover Flow 效果
    let isScrolling = false;
    
    const onScroll = () => {
        if (!isScrolling) {
            requestAnimationFrame(() => {
                updateCarouselVisuals();
                isScrolling = false;
            });
            isScrolling = true;
        }
    };
    
    carousel.removeEventListener('scroll', carousel._scrollHandler); // 移除旧监听器如果存在
    carousel._scrollHandler = onScroll;
    carousel.addEventListener('scroll', onScroll);
}

function updateCarouselVisuals() {
    const carousel = document.getElementById('mp-carousel');
    const items = Array.from(carousel.querySelectorAll('.mp-carousel-item'));
    const dots = document.querySelectorAll('.mp-indicator');
    
    const containerCenter = carousel.scrollLeft + carousel.clientWidth / 2;
    
    let minDistance = Infinity;
    let newActiveIndex = -1;

    items.forEach((item, index) => {
        const itemCenter = item.offsetLeft + item.offsetWidth / 2;
        const distance = Math.abs(containerCenter - itemCenter);
        
        // 动态样式计算 (Cover Flow)
        // 距离越远：Scale 越小 (0.8 -> 1.1)，Blur 越大 (2 -> 0)，Z-Index 越小
        
        // 归一化距离：相对于 itemWidth (约60-100)
        // 范围控制在 300px 内变化
        const range = 200; 
        let progress = Math.min(distance / range, 1); // 0 (center) -> 1 (far)
        
        const scale = 1.1 - (progress * 0.3); // 1.1 -> 0.8
        const blur = progress * 3; // 0 -> 3px
        const opacity = 1 - (progress * 0.4); // 1 -> 0.6
        const zIndex = 100 - Math.floor(progress * 100);
        
        item.style.transform = `scale(${scale})`;
        item.style.filter = `blur(${blur}px)`;
        item.style.opacity = opacity;
        item.style.zIndex = zIndex;

        // 找最近的 item 作为 active
        if (distance < minDistance) {
            minDistance = distance;
            newActiveIndex = index;
        }
    });

    // 只有当完全停下或者距离足够近时才切换数据上下文
    // 但为了响应性，这里实时高亮 index
    // 注意：最后一张是“新建按钮”，不算有效人设索引
    
    if (newActiveIndex !== -1) {
        items.forEach(it => it.classList.remove('active'));
        items[newActiveIndex].classList.add('active');
        
        // 更新 Indicator (注意 items 长度比 dots 多 1)
        dots.forEach((dot, idx) => {
            if (idx === newActiveIndex) dot.classList.add('active');
            else dot.classList.remove('active');
        });

        // 如果索引变了，且是有效人设索引，更新下方信息
        if (newActiveIndex !== currentPersonaIndex && newActiveIndex < db.myPersonaPresets.length) {
            currentPersonaIndex = newActiveIndex;
            updatePersonaInfoArea(currentPersonaIndex);
        }
    }
}

function updatePersonaInfoArea(index) {
    const p = db.myPersonaPresets[index];
    if (!p) return;

    // 更新 Input 值 (避免触发 input 事件导致循环更新，直接设 value)
    const nameInput = document.getElementById('mp-name-input');
    const personaInput = document.getElementById('mp-persona-input');
    if (nameInput.value !== p.name) nameInput.value = p.name || '';
    if (personaInput.value !== p.persona) personaInput.value = p.persona || '';
    
    updateBgBlur(p.avatar);
    renderBindingTags(p);

    // Update "Set as Active" button state
    const setActiveBtn = document.getElementById('mp-set-active-btn');
    if (setActiveBtn) {
        // 判断当前是否是“激活”状态
        // 1. db.activePersonaId 匹配
        // 2. 或者 db.activePersonaId 为空且 index 为 0 (默认第一个)
        const isDefaultActive = !db.activePersonaId && index === 0;
        const isExplicitActive = db.activePersonaId === p.id;
        
        if (isDefaultActive || isExplicitActive) {
            setActiveBtn.classList.add('active');
            setActiveBtn.title = '当前展示中';
        } else {
            setActiveBtn.classList.remove('active');
            setActiveBtn.title = '设为展示名片';
        }
    }
}

function setAsActivePersona() {
    const p = db.myPersonaPresets[currentPersonaIndex];
    if (!p) return;
    
    // Check if already active
    if (db.activePersonaId === p.id) return;
    if (!db.activePersonaId && currentPersonaIndex === 0) return;

    db.activePersonaId = p.id;
    saveData();
    renderMyProfile(); // 刷新联系人界面
    
    // 更新按钮状态
    updatePersonaInfoArea(currentPersonaIndex);
    
    showToast('已设为当前展示名片');
}

function updateBgBlur(url) {
    const bg = document.getElementById('mp-bg-blur');
    if (bg) {
        bg.style.backgroundImage = `url(${url})`;
    }
}

function renderBindingTags(preset) {
    const container = document.getElementById('mp-tags-container');
    const addBtn = document.getElementById('mp-add-binding-btn');
    container.innerHTML = ''; 
    
    if (preset.bindings) {
        Object.keys(preset.bindings).forEach(charId => {
            const char = db.characters.find(c => c.id === charId);
            if (!char) return; 

            const binding = preset.bindings[charId];
            const hasExtra = binding.extraPersona && binding.extraPersona.trim().length > 0;
            
            const tag = document.createElement('div');
            tag.className = `mp-tag ${hasExtra ? 'has-extra' : ''}`;
            tag.innerHTML = `
                <img src="${char.avatar}" class="mp-tag-avatar">
                <span>${char.remarkName}</span>
            `;
            tag.onclick = () => openExclusivePanel(charId);
            
            container.appendChild(tag);
        });
    }
    
    container.appendChild(addBtn);
}

function createNewPersona() {
    const newPersona = {
        id: generateUUID(),
        name: '新身份',
        avatar: 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg', 
        persona: '',
        bindings: {}
    };
    db.myPersonaPresets.push(newPersona);
    renderPersonaCarousel();
    
    setTimeout(() => {
        const carousel = document.getElementById('mp-carousel');
        const items = document.querySelectorAll('.mp-carousel-item');
        if (items.length >= 2) {
            items[items.length - 2].scrollIntoView({ behavior: 'smooth', inline: 'center' });
        }
    }, 100);
}

function deleteCurrentPersona() {
    if (db.myPersonaPresets.length <= 1) {
        showToast('至少保留一个档案');
        return;
    }
    
    if (confirm('确定删除当前人设档案吗？')) {
        db.myPersonaPresets.splice(currentPersonaIndex, 1);
        saveData();
        
        currentPersonaIndex = Math.max(0, currentPersonaIndex - 1);
        renderPersonaCarousel();
        
        setTimeout(() => {
            const carousel = document.getElementById('mp-carousel');
            const items = carousel.querySelectorAll('.mp-carousel-item');
            if (items[currentPersonaIndex]) {
               items[currentPersonaIndex].scrollIntoView({ inline: 'center' });
            }
        }, 50);
        
        showToast('已删除');
    }
}

// --- Tag & Binding Logic ---

function openExclusivePanel(charId) {
    currentEditingBindingCharId = charId;
    const p = db.myPersonaPresets[currentPersonaIndex];
    const binding = p.bindings[charId];
    const char = db.characters.find(c => c.id === charId);
    
    if (!binding || !char) return;

    document.getElementById('mp-panel-char-avatar').src = char.avatar;
    document.getElementById('mp-panel-char-name').textContent = char.remarkName;
    
    document.getElementById('mp-panel-input').value = binding.extraPersona || '';
    document.getElementById('mp-panel-override-check').checked = binding.override || false;

    document.getElementById('mp-exclusive-sheet').classList.add('visible');
}

function closeExclusivePanel() {
    document.getElementById('mp-exclusive-sheet').classList.remove('visible');
    currentEditingBindingCharId = null;
}

function confirmExclusiveSetting() {
    if (!currentEditingBindingCharId) return;
    
    const extra = document.getElementById('mp-panel-input').value;
    const override = document.getElementById('mp-panel-override-check').checked;
    
    const p = db.myPersonaPresets[currentPersonaIndex];
    if (p.bindings[currentEditingBindingCharId]) {
        p.bindings[currentEditingBindingCharId].extraPersona = extra;
        p.bindings[currentEditingBindingCharId].override = override;
    }
    
    renderBindingTags(p);
    closeExclusivePanel();
}

function unbindCharacter() {
    if (!currentEditingBindingCharId) return;
    
    if (confirm('确定解除绑定？')) {
        const p = db.myPersonaPresets[currentPersonaIndex];
        delete p.bindings[currentEditingBindingCharId];
        renderBindingTags(p);
        closeExclusivePanel();
    }
}

// --- Char Selection Modal ---

function openCharSelectModal() {
    const list = document.getElementById('mp-char-select-list');
    list.innerHTML = '';
    
    const p = db.myPersonaPresets[currentPersonaIndex];
    const existingIds = Object.keys(p.bindings || {});
    
    const availableChars = db.characters.filter(c => !existingIds.includes(c.id));
    
    if (availableChars.length === 0) {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:#999;">所有角色都已绑定</div>';
    } else {
        availableChars.forEach(char => {
            const item = document.createElement('div');
            item.className = 'mp-select-item';
            item.innerHTML = `
                <input type="checkbox" class="mp-select-checkbox" value="${char.id}">
                <img src="${char.avatar}" class="mp-select-avatar">
                <span class="mp-select-name">${char.remarkName}</span>
            `;
            item.onclick = (e) => {
                if (e.target.tagName !== 'INPUT') {
                    const cb = item.querySelector('input');
                    cb.checked = !cb.checked;
                }
            };
            list.appendChild(item);
        });
    }
    
    document.getElementById('mp-char-select-modal').classList.add('visible');
}

function confirmCharSelection() {
    const checkboxes = document.querySelectorAll('#mp-char-select-list input:checked');
    const p = db.myPersonaPresets[currentPersonaIndex];
    if (!p.bindings) p.bindings = {};
    
    checkboxes.forEach(cb => {
        const charId = cb.value;
        p.bindings[charId] = {
            extraPersona: '',
            override: false
        };
    });
    
    renderBindingTags(p);
    document.getElementById('mp-char-select-modal').classList.remove('visible');
}

// --- Save & Sync Logic ---

async function saveCurrentPersona() {
    const p = db.myPersonaPresets[currentPersonaIndex];
    if (!p) return;

    p.name = document.getElementById('mp-name-input').value;
    p.persona = document.getElementById('mp-persona-input').value;

    let syncCount = 0;
    if (p.bindings) {
        Object.keys(p.bindings).forEach(charId => {
            const char = db.characters.find(c => c.id === charId);
            if (char) {
                const binding = p.bindings[charId];
                
                char.myName = p.name;
                char.myAvatar = p.avatar;
                
                let finalPersona = '';
                if (binding.override) {
                    finalPersona = binding.extraPersona || '';
                } else {
                    const base = p.persona || '';
                    const extra = binding.extraPersona || '';
                    finalPersona = base + (base && extra ? '\n' : '') + extra;
                }
                char.myPersona = finalPersona;
                
                syncCount++;
            }
        });
    }

    await saveData();
    renderMyProfile(); 
    showToast(`已保存并同步到 ${syncCount} 个角色`);
}
