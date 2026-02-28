/**
 * 电量交互模块
 * 负责监听设备电量状态，并在满足特定条件时（低电量且未充电）
 * 触发独立的“思考气泡”提醒，不干扰主对话流。
 */

const BatteryInteraction = {
    batteryManager: null,
    hasSentLowBatteryPrompt: false,
    threshold: 0.20, // 20% 电量阈值

    /**
     * 初始化电池监听
     */
    async init() {
        if ('getBattery' in navigator) {
            try {
                this.batteryManager = await navigator.getBattery();
                
                // 初始检查，如果电量充足或正在充电，确保重置状态
                this.checkResetCondition();

                // 监听事件
                this.batteryManager.addEventListener('levelchange', () => {
                    this.checkResetCondition();
                });
                
                this.batteryManager.addEventListener('chargingchange', () => {
                    this.checkResetCondition();
                });

                console.log('BatteryInteraction initialized');
            } catch (error) {
                console.warn('BatteryInteraction: Failed to get battery manager', error);
            }
        } else {
            console.warn('BatteryInteraction: Battery API not supported');
        }
    },

    /**
     * 检查是否需要重置“已发送提示”的状态
     * 当电量恢复到阈值以上，或者开始充电时，重置状态
     */
    checkResetCondition() {
        if (!this.batteryManager) return;

        const level = this.batteryManager.level;
        const isCharging = this.batteryManager.charging;

        // 如果正在充电 或者 电量高于阈值，则重置标记
        if (isCharging || level > this.threshold) {
            if (this.hasSentLowBatteryPrompt) {
                console.log('BatteryInteraction: Resetting prompt status (Charging or Level > 20%)');
                this.hasSentLowBatteryPrompt = false;
            }
        }
    },

    /**
     * 判断当前是否应该触发低电量提示
     * @returns {boolean}
     */
    shouldTriggerPrompt() {
        if (!this.batteryManager) return false;

        const level = this.batteryManager.level;
        const isCharging = this.batteryManager.charging;

        // 条件：电量 <= 阈值 且 未充电 且 尚未发送过提示
        if (level <= this.threshold && !isCharging && !this.hasSentLowBatteryPrompt) {
            return true;
        }

        return false;
    },

    /**
     * 标记提示已发送
     */
    markPromptAsSent() {
        this.hasSentLowBatteryPrompt = true;
        console.log('BatteryInteraction: Prompt marked as sent');
    },

    /**
     * 触发独立的电量检查和提醒
     * @param {Object} chat 当前聊天对象
     */
    async triggerIndependentCheck(chat) {
        if (!this.shouldTriggerPrompt()) return;

        // 标记为已发送，防止重复触发（即使 API 失败也不重试，避免骚扰）
        this.markPromptAsSent();

        console.log('BatteryInteraction: Triggering independent check...');

        try {
            // 1. 准备上下文
            
            // 获取世界书内容
            let worldBookContent = '';
            if (chat.worldBookIds && chat.worldBookIds.length > 0 && window.db && window.db.worldBooks) {
                worldBookContent = chat.worldBookIds
                    .map(id => window.db.worldBooks.find(wb => wb.id === id))
                    .filter(wb => wb && !wb.disabled)
                    .map(wb => wb.content)
                    .join('\n\n');
            }

            // 准备最近 30 条消息
            const recentHistory = chat.history.slice(-30).map(msg => {
                let content = msg.content;
                // 简化的内容清理
                content = content.replace(/\[.*?的消息：([\s\S]+?)\]/, '$1');
                return `${msg.role === 'user' ? 'User' : chat.realName}: ${content}`;
            }).join('\n');

            const levelPercent = Math.floor(this.batteryManager.level * 100);
            
            const systemPrompt = `
你正在扮演 ${chat.realName}。

【角色人设】
${chat.persona || '无'}

【用户人设】
${chat.myPersona || '无'}

【世界观/背景设定】
${worldBookContent || '无'}

【最近对话记录】
${recentHistory}

系统检测到用户设备电量仅剩 ${levelPercent}% 且未充电。
请以 ${chat.realName} 的口吻，生成一句简短的内心独白（不超过15字），表达对用户电量的关心或提醒充电。

请根据当前对话的氛围调整语气：
- 如果当前是严肃、悲伤或紧张的剧情，请用温柔、体贴或不破坏气氛的方式提醒（例如：“虽然现在很难过，但别让手机也没电了...”）。
- 如果是轻松、日常或闲聊氛围，可以用活泼或调侃的方式提醒。

只输出内容，不要包含任何格式标记。
`;

            // 2. 调用 API
            let {url, key, model, provider} = db.apiSettings;
            if (!url || !key || !model) return;

            if (url.endsWith('/')) url = url.slice(0, -1);

            let responseText = '';

            if (provider === 'gemini') {
                const endpoint = `${url}/v1beta/models/${model}:generateContent?key=${getRandomValue(key)}`;
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts: [{ text: systemPrompt }] }]
                    })
                });
                const data = await response.json();
                responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
            } else {
                const endpoint = `${url}/v1/chat/completions`;
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${key}`
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [{ role: 'user', content: systemPrompt }],
                        temperature: 0.7
                    })
                });
                const data = await response.json();
                responseText = data.choices[0].message.content;
            }

            // 3. 处理结果
            responseText = responseText.trim();
            console.log('BatteryInteraction: AI Response:', responseText);

            if (responseText) {
                // 显示思考气泡
                this.showBatteryThoughtBubble(responseText, chat.avatar);
            }

        } catch (error) {
            console.error('BatteryInteraction: API Error', error);
        }
    },

    /**
     * 显示浮动思考气泡
     * @param {string} text 提示文本
     * @param {string} avatarUrl 头像 URL
     */
    showBatteryThoughtBubble(text, avatarUrl) {
        // 移除旧的气泡（如果存在）
        const oldBubble = document.querySelector('.battery-thought-bubble-container');
        if (oldBubble) oldBubble.remove();

        // 创建容器
        const container = document.createElement('div');
        container.className = 'battery-thought-bubble-container';
        
        // HTML 结构
        container.innerHTML = `
            <div class="thought-bubble-wrapper">
                <div class="thought-avatar-wrapper">
                    <img src="${avatarUrl}" class="thought-avatar" alt="avatar">
                </div>
                <div class="thought-bubble">
                    <div class="thought-content">${text}</div>
                    <div class="thought-dots">
                        <span></span><span></span><span></span>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(container);

        // 播放音效（可选，轻微的提示音）
        // if (db.globalReceiveSound) playSound(db.globalReceiveSound);

        // 进场动画
        requestAnimationFrame(() => {
            container.classList.add('visible');
        });

        // 关闭逻辑
        const closeBubble = () => {
            container.classList.remove('visible');
            container.classList.add('hiding');
            setTimeout(() => {
                if (container.parentNode) container.parentNode.removeChild(container);
            }, 300); // 等待动画结束
        };

        // 点击气泡关闭
        container.addEventListener('click', (e) => {
            e.stopPropagation(); // 防止触发 document 的点击
            closeBubble();
        });

        // 点击外部关闭
        const docClickHandler = () => {
            closeBubble();
            document.removeEventListener('click', docClickHandler);
        };
        
        // 延迟绑定 document 点击，防止当前点击立即触发关闭
        setTimeout(() => {
            document.addEventListener('click', docClickHandler);
        }, 100);

        // 自动关闭 (10秒)
        setTimeout(() => {
            if (document.body.contains(container)) {
                closeBubble();
                document.removeEventListener('click', docClickHandler);
            }
        }, 10000);
    }
};

// 导出到全局对象
window.BatteryInteraction = BatteryInteraction;
