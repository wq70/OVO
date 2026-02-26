// js/modules/video_call.js

const CAMERA_ON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-camera-video" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M0 5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 1.983 1.738l3.11-1.382A1 1 0 0 1 16 4.269v7.462a1 1 0 0 1-1.406.913l-3.111-1.382A2 2 0 0 1 9.5 13H2a2 2 0 0 1-2-2V5zm11.5 5.175 3.5 1.556V4.269l-3.5 1.556v4.35zM2 4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h7.5a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H2z"/></svg>`;
const CAMERA_OFF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-camera-video-off" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M10.961 12.365a1.99 1.99 0 0 0 .522-1.103l3.11 1.382A1 1 0 0 0 16 11.731V4.269a1 1 0 0 0-1.406-.913l-3.111 1.382A2 2 0 0 0 9.5 3H4.272l.714 1H9.5a1 1 0 0 1 1 1v6a1 1 0 0 1-.144.518l.605.847zM1.428 4.18A.999.999 0 0 0 1 5v6a1 1 0 0 0 1 1h5.014l.714 1H2a2 2 0 0 1-2-2V5c0-.675.334-1.272.847-1.634l.58.814zM15 11.73l-3.5-1.555v-4.35L15 4.269v7.462zm-4.407 3.56-10-14 .814-.58 10 14-.814.58z"/></svg>`;

const VideoCallModule = {
    state: {
        isCallActive: false,
        callType: 'video', // 'video' or 'voice'
        timerInterval: null,
        seconds: 0,
        currentChat: null,
        currentCallContext: [], // 存储当前通话的消息记录
        startTime: 0,
        isAiSpeaking: false, // 防止用户连续输入
        isGenerating: false, // 标记是否正在请求AI生成
        initialAiResponse: null, // 存储开场白
        incomingChat: null, // 暂存来电对象
        isMinimized: false // 是否处于悬浮窗模式
    },

    init: function() {
        // 绑定悬浮窗点击恢复
        const floatWindow = document.getElementById('vc-floating-window');
        if (floatWindow) {
            floatWindow.addEventListener('click', (e) => {
                // 如果是拖拽结束的点击，不触发恢复
                if (floatWindow.dataset.isDragging === 'true') return;
                this.maximizeCall();
            });
            
            // 初始化拖拽
            this.initDraggable(floatWindow);
        }

        // 绑定弹窗关闭按钮
        const closeBtn = document.getElementById('vc-type-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideCallTypeModal());
        }

        // 绑定发起通话按钮
        const videoBtn = document.getElementById('vc-start-video-btn');
        if (videoBtn) {
            videoBtn.addEventListener('click', () => this.startCall('video'));
        }

        const voiceBtn = document.getElementById('vc-start-voice-btn');
        if (voiceBtn) {
            voiceBtn.addEventListener('click', () => this.startCall('voice'));
        }
        
        const historyBtn = document.getElementById('vc-history-btn');
        if (historyBtn) {
            historyBtn.addEventListener('click', () => {
                this.hideCallTypeModal();
                this.showHistoryModal();
            });
        }

        // 绑定挂断按钮
        const loadingHangupBtn = document.getElementById('vc-loading-hangup-btn');
        if (loadingHangupBtn) {
            loadingHangupBtn.addEventListener('click', () => this.endCall(true));
        }

        const callHangupBtn = document.getElementById('vc-call-hangup-btn');
        if (callHangupBtn) {
            callHangupBtn.addEventListener('click', () => this.endCall());
        }

        // 绑定摄像头开关 (模拟)
        const cameraBtn = document.getElementById('vc-camera-toggle-btn');
        if (cameraBtn) {
            cameraBtn.addEventListener('click', () => {
                const icon = cameraBtn.querySelector('.vc-c-icon-box');
                const isOff = icon.innerHTML.includes('bi-camera-video-off');
                
                if (isOff) {
                    icon.innerHTML = CAMERA_ON_SVG;
                    showToast('摄像头已开启');
                } else {
                    icon.innerHTML = CAMERA_OFF_SVG;
                    showToast('摄像头已关闭');
                }
            });
        }

        // 绑定说话按钮 -> 显示输入框
        const actionVoiceBtn = document.getElementById('vc-action-voice-btn');
        if (actionVoiceBtn) {
            actionVoiceBtn.addEventListener('click', () => {
                const overlay = document.getElementById('vc-input-overlay');
                const input = document.getElementById('vc-input-text');
                const chatArea = document.getElementById('vc-chat-container');
                
                overlay.style.display = 'flex';
                if (chatArea) {
                    // 稍微延迟滚动，等待 transition 开始
                    setTimeout(() => {
                        chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' });
                    }, 50);
                }
                input.focus();
            });
        }

        // 绑定输入框发送 (仅回车) 和 帮助按钮
        const helpBtn = document.getElementById('vc-input-help-btn');
        const inputText = document.getElementById('vc-input-text');
        
        // 独立绑定帮助按钮
        if (helpBtn) {
            helpBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showToast('括号()用来描述画面/环境音、点击头像触发回复');
            });
        }

        if (inputText) {
            const sendHandler = () => {
                const text = inputText.value.trim();
                if (text) {
                    this.sendUserAction(text);
                    inputText.value = '';
                    inputText.focus(); // 发送后保持聚焦
                }
            };

            // 绑定回车发送
            inputText.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') sendHandler();
            });
            
            // 点击遮罩层关闭
            document.getElementById('vc-input-overlay').addEventListener('click', (e) => {
                if (e.target.id === 'vc-input-overlay') {
                    e.target.style.display = 'none';
                }
            });
        }

        // 绑定历史记录弹窗关闭按钮
        const historyCloseBtn = document.getElementById('vc-history-close-btn');
        if (historyCloseBtn) {
            historyCloseBtn.addEventListener('click', () => {
                document.getElementById('vc-history-modal').classList.remove('visible');
                setTimeout(() => {
                    document.getElementById('vc-history-modal').style.display = 'none';
                }, 300);
            });
        }

        // 绑定头像点击触发回复
        const avatarBtn = document.getElementById('vc-call-avatar');
        if (avatarBtn) {
            avatarBtn.addEventListener('click', () => this.triggerAiReply());
        }

        // 绑定来电弹窗按钮
        const incomingAcceptBtn = document.getElementById('vc-incoming-accept-btn');
        if (incomingAcceptBtn) {
            incomingAcceptBtn.addEventListener('click', () => this.acceptCall());
        }

        const incomingRejectBtn = document.getElementById('vc-incoming-reject-btn');
        if (incomingRejectBtn) {
            incomingRejectBtn.addEventListener('click', () => this.rejectCall());
        }

    },

    // --- 悬浮窗逻辑 ---

    minimizeCall: function() {
        if (!this.state.isCallActive) return;
        
        this.state.isMinimized = true;
        
        // 隐藏全屏界面
        const callScene = document.getElementById('vc-scene-call');
        callScene.classList.add('vc-hidden');
        callScene.style.display = 'none';
        
        // 显示悬浮窗
        const floatWindow = document.getElementById('vc-floating-window');
        const floatAvatar = document.getElementById('vc-float-avatar');
        
        // 同步头像
        if (this.state.currentChat) {
            const avatarUrl = this.state.currentChat.avatar || 'https://i.postimg.cc/1zsGZ85M/Camera_1040g3k831o3b7f1bkq105oaltnigkev8gp3kia8.jpg';
            floatAvatar.style.backgroundImage = `url('${avatarUrl}')`;
        }
        
        floatWindow.style.display = 'block';
        
        // 恢复到底层页面 (如果需要的话，其实隐藏了全屏层自然就漏出底下的了)
    },

    maximizeCall: function() {
        if (!this.state.isCallActive) return;
        
        // 检查是否需要切换回聊天室
        if (this.state.currentChat && typeof currentChatId !== 'undefined') {
            if (currentChatId !== this.state.currentChat.id) {
                // 需要切换
                if (typeof openChatRoom === 'function') {
                    // 假设 currentChatType 可以从 currentChat 对象推断，或者在 startCall 时记录
                    // 这里简单尝试推断：如果有 members 则是群聊，否则是私聊
                    let type = 'private';
                    if (this.state.currentChat.members) type = 'group';
                    
                    openChatRoom(this.state.currentChat.id, type);
                }
            }
        }

        this.state.isMinimized = false;
        
        // 隐藏悬浮窗
        const floatWindow = document.getElementById('vc-floating-window');
        floatWindow.style.display = 'none';
        
        // 显示全屏界面
        const callScene = document.getElementById('vc-scene-call');
        callScene.style.display = 'flex';
        callScene.classList.remove('vc-hidden');
        callScene.style.opacity = 1;
    },

    initDraggable: function(el) {
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;
        let hasMoved = false;

        const onStart = (e) => {
            if (e.target.closest('.vc-minimize-btn')) return; // 忽略按钮点击
            
            isDragging = true;
            hasMoved = false;
            el.style.transition = 'none';
            
            const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
            const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
            
            startX = clientX;
            startY = clientY;
            
            const rect = el.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;
            
            // 转换为 fixed 定位的 left/top (移除 right/bottom 影响)
            el.style.right = 'auto';
            el.style.bottom = 'auto';
            el.style.left = initialLeft + 'px';
            el.style.top = initialTop + 'px';
        };

        const onMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            
            const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
            const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
            
            const dx = clientX - startX;
            const dy = clientY - startY;
            
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasMoved = true;
            
            el.style.left = (initialLeft + dx) + 'px';
            el.style.top = (initialTop + dy) + 'px';
        };

        const onEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            el.style.transition = 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
            
            // 标记是否发生了拖拽，用于区分点击事件
            el.dataset.isDragging = hasMoved ? 'true' : 'false';
            setTimeout(() => el.dataset.isDragging = 'false', 100);

            // 吸附边缘逻辑
            const rect = el.getBoundingClientRect();
            const winWidth = window.innerWidth;
            const winHeight = window.innerHeight;
            
            let targetLeft = rect.left;
            let targetTop = rect.top;
            
            // 左右吸附
            if (rect.left + rect.width / 2 < winWidth / 2) {
                targetLeft = 10; // 左边距
            } else {
                targetLeft = winWidth - rect.width - 10; // 右边距
            }
            
            // 上下限制
            if (targetTop < 60) targetTop = 60; // 避开顶栏
            if (targetTop > winHeight - rect.height - 80) targetTop = winHeight - rect.height - 80; // 避开底栏
            
            el.style.left = targetLeft + 'px';
            el.style.top = targetTop + 'px';
        };

        el.addEventListener('mousedown', onStart);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        
        el.addEventListener('touchstart', onStart, {passive: false});
        document.addEventListener('touchmove', onMove, {passive: false});
        document.addEventListener('touchend', onEnd);
    },

    showCallTypeModal: function() {
        if (!currentChatId) {
            showToast('请先进入一个聊天室');
            return;
        }
        
        // 动态构建极简菜单
        const modal = document.getElementById('vc-type-modal');
        const sheet = modal.querySelector('.vc-type-sheet');
        
        // 重写内容为极简风格
        sheet.innerHTML = `
            <div class="vc-type-group">
                <button class="vc-type-btn" id="vc-start-video-btn-new">视频通话</button>
                <button class="vc-type-btn" id="vc-start-voice-btn-new">语音通话</button>
                <button class="vc-type-btn" id="vc-history-btn-new">通话记录</button>
            </div>
            <button class="vc-type-cancel" id="vc-type-cancel-btn">取消</button>
        `;
        
        // 重新绑定事件
        document.getElementById('vc-start-video-btn-new').addEventListener('click', () => this.startCall('video'));
        document.getElementById('vc-start-voice-btn-new').addEventListener('click', () => this.startCall('voice'));
        document.getElementById('vc-history-btn-new').addEventListener('click', () => {
            this.hideCallTypeModal();
            this.showHistoryModal();
        });
        document.getElementById('vc-type-cancel-btn').addEventListener('click', () => this.hideCallTypeModal());

        modal.style.display = 'flex';
        modal.offsetHeight; 
        modal.classList.add('visible');
    },

    hideCallTypeModal: function() {
        const modal = document.getElementById('vc-type-modal');
        modal.classList.remove('visible');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    },

    // 接收来电
    receiveCall: function(type, chatId) {
        let chat;
        if (chatId) {
            chat = db.characters.find(c => c.id === chatId);
            if (!chat) {
                chat = db.groups.find(g => g.id === chatId);
            }
        }
        
        if (!chat && typeof currentChatId !== 'undefined' && currentChatId) {
            if (currentChatType === 'private') {
                chat = db.characters.find(c => c.id === currentChatId);
            } else if (currentChatType === 'group') {
                chat = db.groups.find(g => g.id === currentChatId);
            }
        }

        if (!chat) return;
        
        this.state.incomingChat = chat;
        this.state.callType = type;

        const avatarUrl = chat.avatar || 'https://i.postimg.cc/1zsGZ85M/Camera_1040g3k831o3b7f1bkq105oaltnigkev8gp3kia8.jpg';
        const name = chat.remarkName || chat.name;
        const typeText = type === 'video' ? '邀请你进行视频通话...' : '邀请你进行语音通话...';

        document.getElementById('vc-incoming-avatar').style.backgroundImage = `url('${avatarUrl}')`;
        document.getElementById('vc-incoming-name').textContent = name;
        document.getElementById('vc-incoming-type').textContent = typeText;

        const modal = document.getElementById('vc-incoming-modal');
        modal.style.display = 'flex';
        modal.offsetHeight;
        modal.classList.add('visible');

        if (typeof playSound === 'function' && db.globalReceiveSound) {
            playSound(db.globalReceiveSound);
        }
    },

    acceptCall: function() {
        const modal = document.getElementById('vc-incoming-modal');
        modal.classList.remove('visible');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);

        const chat = this.state.incomingChat || this.state.currentChat;
        if (!chat) return;

        this.startCall(this.state.callType, true, chat);
        
        if (typeof currentChatId === 'undefined' || currentChatId !== chat.id) {
            if (typeof loadChat === 'function') {
                loadChat(chat.id);
            }
        }
    },

    rejectCall: async function() {
        const modal = document.getElementById('vc-incoming-modal');
        modal.classList.remove('visible');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);

        const chat = this.state.incomingChat || this.state.currentChat;

        if (chat) {
            const myName = chat.myName || (chat.me ? chat.me.nickname : '我');
            const targetName = chat.realName || chat.name;
            const typeText = this.state.callType === 'video' ? '视频' : '语音';

            const msg = {
                id: `msg_${Date.now()}`,
                role: 'system',
                content: `[${myName}拒绝了${targetName}的${typeText}通话]`,
                timestamp: Date.now()
            };
            chat.history.push(msg);
            await saveData();
            
            if (typeof renderMessages === 'function' && typeof currentChatId !== 'undefined' && currentChatId === chat.id) {
                renderMessages(false, true);
            }
        }
        
        this.state.incomingChat = null;
    },

    startCall: async function(type, isIncoming = false, chatObject = null) {
        this.hideCallTypeModal();
        this.state.callType = type;
        this.state.isCallActive = true;
        this.state.seconds = 0;
        this.state.currentCallContext = [];
        this.state.startTime = Date.now();
        this.state.isAiSpeaking = false;
        this.state.initialAiResponse = null;

        let chat = chatObject;
        if (!chat) {
            if (currentChatType === 'private') {
                chat = db.characters.find(c => c.id === currentChatId);
            } else if (currentChatType === 'group') {
                chat = db.groups.find(g => g.id === currentChatId);
            }
        }

        if (!chat) {
            showToast('无法获取聊天对象信息');
            return;
        }
        this.state.currentChat = chat;

        if (!isIncoming) {
            const myName = chat.myName || (chat.me ? chat.me.nickname : '我');
            const targetName = chat.realName || chat.name; 
            const typeText = type === 'video' ? '视频' : '语音';
            const inviteMsg = {
                id: `msg_${Date.now()}_${Math.random()}`,
                role: 'user', 
                content: `[${myName}向${targetName}发起了${typeText}通话]`,
                timestamp: Date.now()
            };
            chat.history.push(inviteMsg);
            await saveData();
            if (typeof renderMessages === 'function') {
                renderMessages(false, true);
            }
        }

        const charAvatarUrl = chat.avatar || 'https://i.postimg.cc/1zsGZ85M/Camera_1040g3k831o3b7f1bkq105oaltnigkev8gp3kia8.jpg';
        
        // 动态获取用户头像 (优先使用当前聊天室的设置)
        let userAvatarUrl = 'https://i.postimg.cc/3wCK3KpF/Camera_1040g3k031ltndl58ku105pq1g7e7dme715cc1go.jpg';
        
        if (currentChatType === 'private') {
            if (chat.myAvatar) {
                userAvatarUrl = chat.myAvatar;
            }
        } else if (currentChatType === 'group') {
            if (chat.me && chat.me.avatar) {
                userAvatarUrl = chat.me.avatar;
            }
        }

        document.getElementById('vc-loading-char-avatar').style.backgroundImage = `url('${charAvatarUrl}')`;
        document.getElementById('vc-loading-user-avatar').style.backgroundImage = `url('${userAvatarUrl}')`;
        
        // 更新加载界面名称
        const loadingNameEl = document.getElementById('vc-loading-char-name');
        if (loadingNameEl) {
            loadingNameEl.textContent = currentChatType === 'private' ? chat.remarkName : chat.name;
        }

        document.getElementById('vc-call-avatar').style.backgroundImage = `url('${charAvatarUrl}')`;
        document.getElementById('vc-call-name').textContent = currentChatType === 'private' ? chat.remarkName : chat.name;

        // 插入缩小按钮 (如果不存在)
        const header = document.querySelector('.vc-call-header');
        if (header && !document.getElementById('vc-minimize-btn')) {
            const minBtn = document.createElement('button');
            minBtn.id = 'vc-minimize-btn';
            minBtn.className = 'vc-minimize-btn';
            minBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M20 3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 9h-6c-.55 0-1-.45-1-1V5h7v7z"/></svg>`; // 简单的画中画图标
            minBtn.addEventListener('click', () => this.minimizeCall());
            header.appendChild(minBtn);
        }

        const loadingScene = document.getElementById('vc-scene-loading');
        loadingScene.classList.remove('vc-hidden');
        loadingScene.style.display = 'flex';
        loadingScene.style.opacity = 1;

        const aiPromise = this.fetchInitialAiResponse(chat, type, isIncoming);
        await this.runConnectionSequence(aiPromise, isIncoming);
    },

    fetchInitialAiResponse: async function(chat, type, isIncoming) {
        if (typeof getCallReply !== 'function') return null;
        
        let content = '';
        if (isIncoming) {
            content = type === 'video' ? '(我接通了你的视频通话请求。)' : '(我接通了你的语音通话请求。)';
        } else {
            content = type === 'video' ? '(我向你发起了视频通话，通话已接通。)' : '(我向你发起了语音通话，通话已接通。)';
        }

        const tempContext = [{
            role: 'user',
            content: content
        }];
        
        try {
            const response = await getCallReply(chat, type, tempContext, () => {});
            return response;
        } catch (e) {
            console.error("获取AI开场白失败:", e);
            return null;
        }
    },

    runConnectionSequence: async function(aiPromise, isIncoming) {
        const mainText = document.getElementById('vc-status-main');
        const subText = document.getElementById('vc-status-sub');
        
        if (!isIncoming) {
            if (!this.state.isCallActive) return;
            mainText.textContent = "正在连线中...";
            subText.textContent = "HANDSHAKE_INIT";
            mainText.style.opacity = 1;
            await new Promise(r => setTimeout(r, 1500));

            if (!this.state.isCallActive) return;
            mainText.style.opacity = 0;
            await new Promise(r => setTimeout(r, 200));
            mainText.textContent = "对方已收到邀请";
            subText.textContent = "WAITING_RESPONSE";
            mainText.style.opacity = 1;
            await new Promise(r => setTimeout(r, 1500));
        } else {
            mainText.textContent = "正在接通...";
            subText.textContent = "CONNECTING...";
        }

        if (!this.state.isCallActive) return;
        mainText.style.opacity = 0;
        await new Promise(r => setTimeout(r, 200));
        mainText.textContent = "信号接通中...";
        subText.textContent = "SYNCING_PACKETS";
        mainText.style.opacity = 1;

        try {
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 300000));
            const aiResponse = await Promise.race([aiPromise, timeoutPromise]);
            this.state.initialAiResponse = aiResponse;
        } catch (e) {
            console.warn("AI开场白等待超时或失败，将使用默认开场白", e);
        }

        if (!this.state.isCallActive) return;
        mainText.style.opacity = 0;
        await new Promise(r => setTimeout(r, 200));
        mainText.textContent = "连接成功";
        subText.textContent = "LINK_ESTABLISHED";
        mainText.style.color = "#34c759";
        mainText.style.opacity = 1;
        
        setTimeout(() => this.transitionToCallScene(), 800);
    },

    transitionToCallScene: function() {
        if (!this.state.isCallActive) return;

        const loadingScene = document.getElementById('vc-scene-loading');
        const callScene = document.getElementById('vc-scene-call');

        // 1. 先显示通话界面 (位于 loading 界面之下)
        document.getElementById('vc-chat-container').innerHTML = '';
        callScene.style.display = 'flex';
        callScene.classList.remove('vc-hidden');
        callScene.style.opacity = 1;

        // 2. 淡出 loading 界面
        // 稍微延迟以确保 DOM 更新
        requestAnimationFrame(() => {
            loadingScene.style.opacity = 0;
            
            // 3. 动画结束后清理
            setTimeout(() => {
                loadingScene.classList.add('vc-hidden');
                loadingScene.style.display = 'none';
                
                this.startTimer();
                this.sendInitialMessage();
            }, 500); // CSS transition 是 0.3s，这里给 0.5s 缓冲
        });
    },

    startTimer: function() {
        const timerEl = document.getElementById('vc-call-timer');
        const floatTimerEl = document.getElementById('vc-float-timer');
        
        this.state.seconds = 0;
        const updateTime = () => {
            const h = Math.floor(this.state.seconds / 3600).toString().padStart(2, '0');
            const m = Math.floor((this.state.seconds % 3600) / 60).toString().padStart(2, '0');
            const s = (this.state.seconds % 60).toString().padStart(2, '0');
            const timeStr = `${h}:${m}:${s}`;
            
            if (timerEl) timerEl.textContent = timeStr;
            if (floatTimerEl) floatTimerEl.textContent = `${m}:${s}`; // 悬浮窗只显示分秒，节省空间
        };
        
        updateTime();
        
        this.state.timerInterval = setInterval(() => {
            this.state.seconds++;
            updateTime();
        }, 1000);
    },

    sendInitialMessage: function() {
        const chat = this.state.currentChat;
        const name = currentChatType === 'private' ? chat.remarkName : chat.name;
        
        if (this.state.initialAiResponse) {
            this.parseAndAddAiResponse(this.state.initialAiResponse);
        } else {
            if (this.state.callType === 'video') {
                setTimeout(() => {
                    this.addMessage('ai', 'visual', `[ 镜头微微晃动，${name} 似乎正在调整角度 ]`);
                }, 500);
                setTimeout(() => {
                    this.addMessage('ai', 'voice', `“……信号这下稳定了吗？让我看看你。”`);
                }, 1500);
            } else {
                setTimeout(() => {
                    this.addMessage('ai', 'voice', `“喂？听得到吗？”`);
                }, 1000);
            }
        }
    },

    parseAndAddAiResponse: function(fullText) {
        const regex = /\[(.*?)[：:]([\s\S]+?)\]/g;
        let match;
        let delay = 500;

        while ((match = regex.exec(fullText)) !== null) {
            const tag = match[1];
            let content = match[2];
            content = content.trim();
            
            let type = 'voice';
            if (tag.includes('画面') || tag.includes('环境') || tag.includes('动作')) {
                type = 'visual';
            }
            
            setTimeout(() => {
                this.addMessage('ai', type, content);
            }, delay);
            
            delay += 2000; 
        }
    },

    addMessage: function(who, type, content) {
        const container = document.getElementById('vc-chat-container');
        const msgDiv = document.createElement('div');
        msgDiv.className = `vc-msg-row ${who}`;
        
        // 存储索引以便后续操作
        const index = this.state.currentCallContext.length;
        msgDiv.dataset.index = index;

        if (type === 'visual') {
            msgDiv.innerHTML = `
                <div class="vc-deco-line"></div>
                <div class="vc-text-visual ${who}">${content}</div>
            `;
        } else {
            // --- 双语解析逻辑 ---
            let displayContent = content;
            let translation = null;
            
            // 尝试匹配双语格式：原文「译文」 或 原文(译文)
            // 优先匹配「」
            const bracketMatch = content.match(/^(.+?)「(.+?)」$/);
            if (bracketMatch) {
                displayContent = bracketMatch[1];
                translation = bracketMatch[2];
            } else {
                // 尝试匹配 () 或 （）
                const parenMatch = content.match(/^(.+?)[\(（](.+?)[\)）]$/);
                if (parenMatch) {
                    displayContent = parenMatch[1];
                    translation = parenMatch[2];
                }
            }

            if (translation) {
                msgDiv.innerHTML = `
                    <div class="vc-text-voice ${who}">
                        <span class="vc-voice-origin">${displayContent}</span>
                        <div class="vc-voice-trans">${translation}</div>
                    </div>
                `;
            } else {
                msgDiv.innerHTML = `
                    <div class="vc-text-voice ${who}">${content}</div>
                `;
            }
            
            // === TTS 点击播放功能 ===
            if (who === 'ai' && type !== 'visual') {
                const voiceElement = msgDiv.querySelector('.vc-text-voice');
                if (voiceElement) {
                    voiceElement.style.cursor = 'pointer';
                    voiceElement.dataset.ttsContent = content; // 存储原始内容
                    
                    // 添加点击事件
                    voiceElement.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        await this.handleTTSClick(content);
                    });
                    
                    // === 自动播放 TTS ===
                    // 在通话中自动播放 AI 的语音
                    if (this.state.isCallActive) {
                        // 使用 setTimeout 确保 DOM 更新完成后再播放
                        setTimeout(() => {
                            this.handleTTSClick(content).catch(err => {
                                console.error('[VideoCall] 自动播放 TTS 失败:', err);
                            });
                        }, 100);
                    }
                }
            }
        }
        
        // 绑定长按事件
        let pressTimer;
        const startPress = (e) => {
            // 忽略多点触控
            if (e.touches && e.touches.length > 1) return;
            
            pressTimer = setTimeout(() => {
                if (typeof navigator.vibrate === 'function') navigator.vibrate(50);
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                this.showContextMenu(clientX, clientY, index);
            }, 1000); // 1秒长按
        };

        const cancelPress = () => {
            if (pressTimer) clearTimeout(pressTimer);
        };

        msgDiv.addEventListener('mousedown', startPress);
        msgDiv.addEventListener('touchstart', startPress, { passive: true });
        
        msgDiv.addEventListener('mouseup', cancelPress);
        msgDiv.addEventListener('mouseleave', cancelPress);
        msgDiv.addEventListener('touchend', cancelPress);
        msgDiv.addEventListener('touchmove', cancelPress);

        container.appendChild(msgDiv);
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });

        this.state.currentCallContext.push({
            role: who,
            type: type,
            content: content,
            timestamp: Date.now()
        });
    },

    showContextMenu: function(x, y, messageIndex) {
        // 移除已存在的菜单
        const existingMenu = document.getElementById('vc-context-menu');
        if (existingMenu) existingMenu.remove();

        const menu = document.createElement('div');
        menu.id = 'vc-context-menu';
        menu.className = 'vc-context-menu';
        
        const regenerateBtn = document.createElement('div');
        regenerateBtn.className = 'vc-context-item';
        regenerateBtn.textContent = '重回';
        regenerateBtn.onclick = () => {
            this.handleRegenerate();
            menu.remove();
        };
        
        menu.appendChild(regenerateBtn);
        document.body.appendChild(menu);

        // 计算位置 (确保不溢出屏幕)
        const rect = menu.getBoundingClientRect();
        let top = y - rect.height - 10;
        let left = x - rect.width / 2;
        
        if (top < 10) top = y + 10;
        if (left < 10) left = 10;
        if (left + rect.width > window.innerWidth - 10) left = window.innerWidth - rect.width - 10;
        
        menu.style.top = top + 'px';
        menu.style.left = left + 'px';
        menu.classList.add('visible');

        // 点击外部关闭
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        // 延迟绑定以避免立即触发
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    },

    handleRegenerate: function() {
        if (this.state.isGenerating) {
            showToast("正在生成中，请稍候...");
            return;
        }

        // 1. 找到最后一条 User 消息的索引
        let lastUserIndex = -1;
        for (let i = this.state.currentCallContext.length - 1; i >= 0; i--) {
            if (this.state.currentCallContext[i].role === 'user') {
                lastUserIndex = i;
                break;
            }
        }

        // 如果没有 User 消息（例如刚开始），或者最后一条就是 User 消息（还没 AI 回复），
        // 这种情况下“重回”可能意味着重新触发 AI 对开场白的回复，或者对最后一条 User 消息的回复。
        // 逻辑：删除 lastUserIndex 之后的所有 AI 消息。
        
        // 如果 lastUserIndex 是 -1 (全是 AI 消息，比如开场白)，则删除所有 AI 消息并重新获取开场白？
        // 或者保留开场白？通常“重回”是针对交互。
        // 假设至少有一条 User 消息或者我们想重生成开场白。
        
        let startIndexToDelete = lastUserIndex + 1;
        
        // 如果最后一条就是 User 消息，说明没有 AI 回复可撤回，直接触发生成即可
        if (startIndexToDelete >= this.state.currentCallContext.length) {
            this.triggerAiReply();
            return;
        }

        // 2. 删除数据
        this.state.currentCallContext.splice(startIndexToDelete);

        // 3. 删除 DOM
        const container = document.getElementById('vc-chat-container');
        const msgs = container.querySelectorAll('.vc-msg-row');
        for (let i = startIndexToDelete; i < msgs.length; i++) {
            if (msgs[i]) msgs[i].remove();
        }

        // 4. 重新触发生成
        this.triggerAiReply();
    },

    triggerAiReply: async function() {
        // 1. 检查是否正在生成 (优先提示)
        if (this.state.isGenerating) {
            showToast("信号正在传输中...");
            return;
        }

        // 2. 检查是否正在说话
        if (this.state.isAiSpeaking) {
            showToast("对方正在说话...");
            return;
        }

        this.state.isGenerating = true;
        this.state.isAiSpeaking = true; // 同时也标记为 speaking 以防其他操作干扰
        
        const avatar = document.getElementById('vc-call-avatar');
        
        // 点击反馈动画
        avatar.style.transform = "scale(0.95)";
        setTimeout(() => avatar.style.transform = "scale(1)", 150);
        
        // 添加处理中状态样式 (视觉反馈)
        avatar.classList.add('processing');

        try {
            if (typeof getCallReply === 'function') {
                let fullText = "";
                await getCallReply(this.state.currentChat, this.state.callType, this.state.currentCallContext, (chunk) => {
                    fullText += chunk;
                });
                
                if (fullText) {
                    this.parseAndAddAiResponse(fullText);
                }
            }
        } catch (e) {
            console.error("AI Reply Error:", e);
            showToast("信号连接失败");
        } finally {
            // 移除处理中状态样式
            if (avatar) avatar.classList.remove('processing');
            this.state.isGenerating = false;
            this.state.isAiSpeaking = false; 
        }
    },

    sendUserAction: async function(text) {
        if (!text) return;

        const parts = text.split(/([（\(].*?[）\)])/g);

        for (const part of parts) {
            if (!part.trim()) continue;

            const visualMatch = part.match(/^[（\(](.*?)[）\)]$/);
            
            if (visualMatch) {
                this.addMessage('user', 'visual', visualMatch[1].trim());
            } else {
                this.addMessage('user', 'voice', part.trim());
            }
        }
        
        if (!db.hasSeenVideoCallAvatarHint) {
            showToast("点击对方头像可触发回复");
            db.hasSeenVideoCallAvatarHint = true;
            saveData();
        }
    },

    endCall: async function(isLoading = false) {
        this.state.isCallActive = false;
        this.state.isMinimized = false;
        
        if (this.state.timerInterval) {
            clearInterval(this.state.timerInterval);
            this.state.timerInterval = null;
        }

        const loadingScene = document.getElementById('vc-scene-loading');
        const callScene = document.getElementById('vc-scene-call');
        const floatWindow = document.getElementById('vc-floating-window');

        // 隐藏悬浮窗
        if (floatWindow) floatWindow.style.display = 'none';

        if (isLoading) {
            loadingScene.style.opacity = 0;
            setTimeout(() => {
                loadingScene.classList.add('vc-hidden');
                loadingScene.style.display = 'none';
            }, 500);
        } else {
            callScene.style.opacity = 0;
            setTimeout(() => {
                callScene.classList.add('vc-hidden');
                callScene.style.display = 'none';
                callScene.style.opacity = 1;
            }, 500);
        }
        
        document.getElementById('vc-status-main').style.color = "rgba(255,255,255,0.9)";

        if (this.state.currentCallContext.length > 0) {
            const startTimeDate = new Date(this.state.startTime);
            const dateStr = `${startTimeDate.getFullYear()}/${startTimeDate.getMonth()+1}/${startTimeDate.getDate()} ${startTimeDate.getHours().toString().padStart(2,'0')}:${startTimeDate.getMinutes().toString().padStart(2,'0')}`;
            const durationStr = this.formatDuration(this.state.seconds);

            const callRecord = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                startTime: this.state.startTime,
                duration: this.state.seconds,
                type: this.state.callType,
                context: [...this.state.currentCallContext],
                summary: ""
            };

            if (!this.state.currentChat.callHistory) {
                this.state.currentChat.callHistory = [];
            }
            this.state.currentChat.callHistory.push(callRecord);
            
            const summaryMsg = {
                id: `msg_${Date.now()}_${Math.random()}`,
                role: 'assistant',
                content: `[视频通话记录：${dateStr}；${durationStr}；]`, 
                timestamp: Date.now(),
                callRecordId: callRecord.id
            };
            this.state.currentChat.history.push(summaryMsg);

            await saveData();
            showToast('通话结束，正在生成总结...');
            
            if (typeof renderMessages === 'function' && currentChatId === this.state.currentChat.id) {
                renderMessages(false, true);
            }

            if (typeof generateCallSummary === 'function') {
                generateCallSummary(this.state.currentChat, this.state.currentCallContext).then(async (summary) => {
                    if (summary) {
                        callRecord.summary = summary;
                        summaryMsg.content = `[视频通话记录：${dateStr}；${durationStr}；${summary}]`;
                        
                        await saveData();
                        
                        if (typeof renderMessages === 'function' && currentChatId === this.state.currentChat.id) {
                            renderMessages(false, false);
                        }
                        showToast('通话总结已生成');
                    } else {
                        showToast('通话总结生成失败，可稍后重试');
                    }
                });
            }
        }
    },

    // --- 历史记录相关 (重构版 - iOS 风格 + 长按删除) ---

    showHistoryModal: function() {
        if (!currentChatId) return;
        
        let chat;
        if (currentChatType === 'private') {
            chat = db.characters.find(c => c.id === currentChatId);
        } else if (currentChatType === 'group') {
            chat = db.groups.find(g => g.id === currentChatId);
        }

        if (!chat) return;
        this.state.currentChat = chat;

        const modal = document.getElementById('vc-history-modal');
        const listContainer = document.getElementById('vc-history-list');
        listContainer.innerHTML = '';

        const history = chat.callHistory || [];

        if (history.length === 0) {
            listContainer.innerHTML = '<div class="vc-history-empty">暂无通话记录</div>';
        } else {
            const sortedHistory = [...history].sort((a, b) => b.startTime - a.startTime);
            
            sortedHistory.forEach((record, index) => {
                const date = new Date(record.startTime);
                const now = new Date();
                let dateStr;
                if (date.toDateString() === now.toDateString()) {
                    dateStr = `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
                } else {
                    dateStr = `${date.getMonth()+1}/${date.getDate()}`;
                }
                
                const durationStr = this.formatDuration(record.duration);
                const typeIcon = record.type === 'video' ? 
                    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M0 5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 1.983 1.738l3.11-1.382A1 1 0 0 1 16 4.269v7.462a1 1 0 0 1-1.406.913l-3.111-1.382A2 2 0 0 1 9.5 13H2a2 2 0 0 1-2-2V5z"/></svg>` : 
                    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M3.654 1.328a.678.678 0 0 0-1.015-.063L1.605 2.3c-.483.484-.661 1.169-.45 1.77a17.568 17.568 0 0 0 4.168 6.608 17.569 17.569 0 0 0 6.608 4.168c.601.211 1.286.033 1.77-.45l1.034-1.034a.678.678 0 0 0-.063-1.015l-2.307-1.794a.678.678 0 0 0-.58-.122l-2.19.547a1.745 1.745 0 0 1-1.657-.459L5.482 8.062a1.745 1.745 0 0 1-.46-1.657l.548-2.19a.678.678 0 0 0-.122-.58L3.654 1.328z"/></svg>`;
                
                const typeTitle = record.type === 'video' ? '视频通话' : '语音通话';
                const typeClass = record.type;

                // 创建容器
                const container = document.createElement('div');
                container.className = `vc-history-item-container ${typeClass}`;

                // 内容包裹层
                const contentWrapper = document.createElement('div');
                contentWrapper.className = 'vc-history-content-wrapper';

                // 头部 (点击区域)
                const header = document.createElement('div');
                header.className = 'vc-history-header';
                header.innerHTML = `
                    <div class="vc-history-icon">${typeIcon}</div>
                    <div class="vc-history-info">
                        <div class="vc-history-title">${typeTitle}</div>
                        <div class="vc-history-subtitle">${durationStr}</div>
                    </div>
                    <div class="vc-history-right">
                        <div class="vc-history-date">${dateStr}</div>
                        <div class="vc-history-info-icon">i</div>
                    </div>
                `;

                // 详情区域 (默认折叠)
                const detail = document.createElement('div');
                detail.className = 'vc-history-detail';
                
                // 预先生成详情内容
                const detailContent = document.createElement('div');
                detailContent.className = 'vc-detail-content';
                
                // 1. 总结
                const generateBtnId = `vc-gen-summary-${record.id}`;
                const summaryText = record.summary || '';
                const btnText = record.summary ? '重新总结' : '生成总结';
                
                detailContent.innerHTML += `
                    <div class="vc-detail-summary" id="vc-summary-container-${record.id}">
                        <div class="vc-summary-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <div class="vc-summary-label" style="margin-bottom: 0;">通话总结</div>
                            <button class="vc-type-btn small" id="${generateBtnId}" style="margin: 0; width: auto; padding: 4px 12px; font-size: 12px;">${btnText}</button>
                        </div>
                        <div class="vc-summary-text" style="${summaryText ? '' : 'display:none;'}">${summaryText}</div>
                    </div>
                `;
                
                // 绑定生成事件
                setTimeout(() => {
                    const genBtn = document.getElementById(generateBtnId);
                    if (genBtn) {
                        genBtn.addEventListener('click', async (e) => {
                            e.stopPropagation(); // 防止触发折叠
                            
                            if (genBtn.disabled) return;
                            genBtn.disabled = true;
                            const originalText = genBtn.textContent;
                            genBtn.textContent = "生成中...";
                            
                            try {
                                if (typeof generateCallSummary === 'function') {
                                    const summary = await generateCallSummary(this.state.currentChat, record.context);
                                    
                                    if (summary) {
                                        // 1. 更新数据
                                        record.summary = summary;
                                        
                                        // 2. 更新聊天记录中的消息
                                        const chat = this.state.currentChat;
                                        const summaryMsg = chat.history.find(m => m.callRecordId === record.id);
                                        if (summaryMsg) {
                                            const date = new Date(record.startTime);
                                            const dateStr = `${date.getFullYear()}/${date.getMonth()+1}/${date.getDate()} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
                                            const durationStr = this.formatDuration(record.duration);
                                            summaryMsg.content = `[视频通话记录：${dateStr}；${durationStr}；${summary}]`;
                                        }
                                        
                                        await saveData();
                                        
                                        // 3. 更新界面
                                        const container = document.getElementById(`vc-summary-container-${record.id}`);
                                        if (container) {
                                            const textEl = container.querySelector('.vc-summary-text');
                                            if (textEl) {
                                                textEl.textContent = summary;
                                                textEl.style.display = 'block';
                                            }
                                            
                                            // 更新按钮文本
                                            genBtn.textContent = "重新总结";
                                            
                                            // 重新计算高度
                                            const detail = container.closest('.vc-history-detail');
                                            if (detail && detail.style.height !== '0px') {
                                                detail.style.height = 'auto';
                                            }
                                        }
                                        
                                        showToast('通话总结已生成');
                                        
                                        // 4. 刷新聊天界面
                                        if (typeof renderMessages === 'function' && currentChatId === chat.id) {
                                            renderMessages(false, false);
                                        }
                                    } else {
                                        showToast('生成失败，请重试');
                                        genBtn.textContent = originalText;
                                    }
                                } else {
                                    showToast('生成功能不可用');
                                    genBtn.textContent = originalText;
                                }
                            } catch (err) {
                                console.error(err);
                                showToast('发生错误');
                                genBtn.textContent = originalText;
                            } finally {
                                genBtn.disabled = false;
                            }
                        });
                    }
                }, 0);

                // 2. 对话记录 (合并显示)
                let logHtml = '<div class="vc-detail-log">';
                if (record.context && record.context.length > 0) {
                    record.context.forEach(msg => {
                        const roleName = msg.role === 'ai' ? 'TA' : 'YOU';
                        const roleClass = msg.role;
                        
                        if (msg.type === 'visual') {
                            logHtml += `<span class="vc-log-line"><span class="vc-log-role ${roleClass}">${roleName}</span><span class="vc-log-visual">${msg.content}</span></span>`;
                        } else {
                            logHtml += `<span class="vc-log-line"><span class="vc-log-role ${roleClass}">${roleName}</span><span class="vc-log-text">${msg.content}</span></span>`;
                        }
                    });
                } else {
                    logHtml += '<span style="color:#999; font-style:italic;">无详细记录</span>';
                }
                logHtml += '</div>';
                
                detailContent.innerHTML += logHtml;
                detail.appendChild(detailContent);

                // 绑定点击事件 (展开/收起)
                header.addEventListener('click', () => {
                    const isExpanded = container.classList.contains('expanded');
                    if (isExpanded) {
                        // 收起
                        detail.style.height = detail.scrollHeight + 'px'; // 先设为具体高度
                        detail.offsetHeight; // 强制重绘
                        container.classList.remove('expanded');
                        detail.style.height = '0';
                        detail.style.overflow = 'hidden';
                    } else {
                        // 展开
                        container.classList.add('expanded');
                        detail.style.height = detailContent.scrollHeight + 'px';
                        
                        // 动画结束后设为 auto
                        const transitionEndHandler = () => {
                            if (container.classList.contains('expanded')) {
                                detail.style.height = 'auto';
                                detail.style.overflow = 'visible';
                            }
                            detail.removeEventListener('transitionend', transitionEndHandler);
                        };
                        detail.addEventListener('transitionend', transitionEndHandler);
                        // 兜底
                        setTimeout(() => {
                             if (container.classList.contains('expanded')) {
                                detail.style.height = 'auto';
                                detail.style.overflow = 'visible';
                            }
                        }, 350);
                    }
                });

                // 长按删除逻辑
                let pressTimer;
                const startPress = (e) => {
                    // 如果已展开，不触发长按（或者也可以触发，看需求，这里暂定不触发以免混淆）
                    // if (container.classList.contains('expanded')) return;
                    
                    pressTimer = setTimeout(() => {
                        if (typeof navigator.vibrate === 'function') navigator.vibrate(50);
                        this.showDeleteConfirm(record.id, container);
                    }, 600);
                };
                
                const cancelPress = () => {
                    if (pressTimer) clearTimeout(pressTimer);
                };

                header.addEventListener('touchstart', startPress, { passive: true });
                header.addEventListener('touchend', cancelPress);
                header.addEventListener('touchmove', cancelPress); // 滚动时取消长按

                contentWrapper.appendChild(header);
                contentWrapper.appendChild(detail);
                
                container.appendChild(contentWrapper);
                listContainer.appendChild(container);
            });
        }

        modal.style.display = 'flex';
        modal.offsetHeight;
        modal.classList.add('visible');
    },

    showDeleteConfirm: function(recordId, domElement) {
        // 复用 vc-type-modal 结构，但临时修改内容
        const modal = document.getElementById('vc-type-modal');
        const sheet = modal.querySelector('.vc-type-sheet');
        
        // 备份原始内容（虽然每次 showCallTypeModal 都会重写，但为了安全）
        // 这里直接重写即可，因为 showCallTypeModal 会再次重写
        
        sheet.innerHTML = `
            <div class="vc-type-group">
                <div class="vc-type-label" style="padding: 16px; text-align: center; font-size: 13px; color: #8e8e93; border-bottom: 1px solid rgba(0,0,0,0.1);">
                    确定要删除这条通话记录吗？
                </div>
                <button class="vc-type-btn" id="vc-confirm-delete-btn" style="color: #ff3b30; font-weight: 600;">删除记录</button>
            </div>
            <button class="vc-type-cancel" id="vc-cancel-delete-btn">取消</button>
        `;
        
        const deleteBtn = document.getElementById('vc-confirm-delete-btn');
        const cancelBtn = document.getElementById('vc-cancel-delete-btn');
        
        // 绑定事件
        const handleDelete = () => {
            this.deleteCallRecord(recordId, domElement);
            this.hideCallTypeModal(); // 关闭确认弹窗
        };
        
        const handleCancel = () => {
            this.hideCallTypeModal();
        };
        
        deleteBtn.onclick = handleDelete;
        cancelBtn.onclick = handleCancel;

        modal.style.display = 'flex';
        modal.offsetHeight; 
        modal.classList.add('visible');
    },

    deleteCallRecord: async function(recordId, domElement) {
        if (!this.state.currentChat) return;

        // 1. 从数据中移除
        const index = this.state.currentChat.callHistory.findIndex(r => r.id === recordId);
        if (index !== -1) {
            this.state.currentChat.callHistory.splice(index, 1);
            
            // 2. 尝试删除对应的聊天消息
            const msgIndex = this.state.currentChat.history.findIndex(m => m.callRecordId === recordId);
            if (msgIndex !== -1) {
                this.state.currentChat.history.splice(msgIndex, 1);
            }

            await saveData();
            
            // 3. 移除 DOM
            domElement.style.height = domElement.offsetHeight + 'px';
            domElement.style.transition = 'height 0.3s ease, opacity 0.3s ease';
            requestAnimationFrame(() => {
                domElement.style.height = '0';
                domElement.style.opacity = '0';
            });
            setTimeout(() => {
                domElement.remove();
                // 如果列表空了，显示提示
                const listContainer = document.getElementById('vc-history-list');
                if (listContainer.children.length === 0) {
                    listContainer.innerHTML = '<div class="vc-history-empty">暂无通话记录</div>';
                }
            }, 300);

            // 刷新聊天界面
            if (typeof renderMessages === 'function' && currentChatId === this.state.currentChat.id) {
                renderMessages(false, false);
            }
        }
    },

    formatDuration: function(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        if (m === 0) return `${s}秒`;
        return `${m}分${s}秒`;
    },

    // === TTS 功能 ===
    handleTTSClick: async function(content) {
        try {
            // 检查 TTS 服务是否加载
            if (typeof MinimaxTTSService === 'undefined') {
                console.error('[VideoCall] MinimaxTTSService 未加载');
                showToast('TTS 服务未加载');
                return;
            }

            // 检查 TTS 是否启用
            if (!MinimaxTTSService.isConfigured()) {
                showToast('TTS 未配置或未启用');
                return;
            }

            // 获取当前角色的 TTS 配置
            const chatId = this.state.currentChat?.id;
            if (!chatId) {
                showToast('无法获取角色配置');
                return;
            }

            // 检查 VoiceSelector 是否加载
            if (typeof VoiceSelector === 'undefined') {
                console.error('[VideoCall] VoiceSelector 未加载');
                showToast('音色选择器未加载');
                return;
            }

            const voiceConfig = VoiceSelector.getVoiceConfig(chatId);
            if (!voiceConfig || !voiceConfig.voiceId) {
                showToast('请先为角色设置语音音色');
                return;
            }

            // 显示播放提示
            showToast('🔊 正在播放...');

            // 合成并播放
            await MinimaxTTSService.synthesizeAndPlay(
                content,
                voiceConfig.voiceId,
                voiceConfig.language
            );

        } catch (err) {
            console.error('[VideoCall] TTS 播放失败:', err);
            
            // 根据错误类型显示不同提示
            if (err.message.includes('TTS 未配置')) {
                showToast('请先在 API 设置中配置 TTS');
            } else if (err.message.includes('API 请求失败')) {
                showToast('TTS 服务请求失败，请检查配置');
            } else if (err.message.includes('文本为空')) {
                showToast('无可播放的内容');
            } else {
                showToast('播放失败，请重试');
            }
        }
    }
};

// 导出全局变量
window.VideoCallModule = VideoCallModule;
