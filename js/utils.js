// --- 工具函数库 (js/utils.js) ---

// 电池状态更新
async function updateBatteryStatus() {
    if ('getBattery' in navigator) {
        try {
            const battery = await navigator.getBattery();
            const batteryLevelText = document.getElementById('battery-level');
            const batteryFillRect = document.getElementById('battery-fill-rect');

            const updateDisplay = () => {
                if (!batteryLevelText || !batteryFillRect) return;
                const level = Math.floor(battery.level * 100);
                batteryLevelText.textContent = `${level}%`;
                batteryFillRect.setAttribute('width', 18 * battery.level);
                let fillColor = "#666"; 
                if (battery.charging) {
                    fillColor = "#4CAF50"; 
                } else if (level <= 20) {
                    fillColor = "#f44336"; 
                }
                batteryFillRect.setAttribute('fill', fillColor);
            };

            updateDisplay();
            battery.addEventListener('levelchange', updateDisplay);
            battery.addEventListener('chargingchange', updateDisplay);

        } catch (error) {
            console.error('无法获取电池信息:', error);
            const batteryWidget = document.querySelector('.widget-battery');
            if (batteryWidget) batteryWidget.style.display = 'none';
        }
    } else {
        const batteryWidget = document.querySelector('.widget-battery');
        if (batteryWidget) batteryWidget.style.display = 'none';
    }
}

// 随机获取 API Key
function getRandomValue(str) {
    if (str && str.includes(',')) {
        const arr = str.split(',').map(item => item.trim());
        const randomIndex = Math.floor(Math.random() * arr.length);
        return arr[randomIndex];
    }
    return str;
}

// 图片压缩工具
async function compressImage(file, options = {}) {
    const { quality = 0.8, maxWidth = 800, maxHeight = 800 } = options;

    if (file.type === 'image/gif') {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onerror = reject;
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onerror = reject;
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round(height * (maxWidth / width));
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round(width * (maxHeight / height));
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');

                if (file.type === 'image/png') {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, width, height);
                }

                ctx.drawImage(img, 0, 0, width, height);
                const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(compressedDataUrl);
            };
        };
    });
}

// 数字补零
const pad = (num) => num.toString().padStart(2, '0');

// UUID 生成器
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Toast 通知系统
let notificationQueue = [];
let isToastVisible = false;

function processToastQueue() {
    if (isToastVisible || notificationQueue.length === 0) {
        return;
    }

    isToastVisible = true;
    const notification = notificationQueue.shift();

    const toastElement = document.getElementById('toast-notification');
    const avatarEl = toastElement.querySelector('.toast-avatar');
    const nameEl = toastElement.querySelector('.toast-name');
    const messageEl = toastElement.querySelector('.toast-message');

    const isRichNotification = typeof notification === 'object' && notification !== null && notification.name;

    if (isRichNotification) {
        toastElement.classList.remove('simple');
        avatarEl.style.display = 'block';
        nameEl.style.display = 'block';
        messageEl.style.textAlign = 'left';
        avatarEl.src = notification.avatar || 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg';
        nameEl.textContent = notification.name;
        messageEl.textContent = notification.message;
    } else {
        toastElement.classList.add('simple');
        avatarEl.style.display = 'none';
        nameEl.style.display = 'none';
        messageEl.style.textAlign = 'center';
        messageEl.textContent = notification;
    }

    toastElement.classList.add('show');

    setTimeout(() => {
        toastElement.classList.remove('show');
        setTimeout(() => {
            isToastVisible = false;
            processToastQueue();
        }, 500);
    }, 3000);
}

const showToast = (notification) => {
    notificationQueue.push(notification);
    processToastQueue();
};

// 触感反馈工具
function triggerHapticFeedback(type = 'light') {
    if (!navigator.vibrate) return;

    try {
        switch (type) {
            case 'light':
                navigator.vibrate(5); // 极轻微震动
                break;
            case 'medium':
                navigator.vibrate(15); // 中等震动
                break;
            case 'heavy':
                navigator.vibrate(30); // 重度震动
                break;
            case 'success':
                navigator.vibrate([10, 30, 10]); // 成功震动模式
                break;
            case 'error':
                navigator.vibrate([50, 30, 50, 30, 50]); // 错误震动模式
                break;
            case 'selection':
                navigator.vibrate(10); // 选择震动
                break;
            default:
                navigator.vibrate(5);
        }
    } catch (e) {
        // 忽略不支持或被禁用的情况
    }
}

// 错误处理翻译
function getFriendlyErrorMessage(error) {
    if (error.name === 'AbortError') return '请求超时了，请检查您的网络或稍后再试。';
    if (error instanceof SyntaxError) return '服务器返回的数据格式不对，建议您重试一次。';
    
    if (error.response) {
        const status = error.response.status;
        switch (status) {
            case 400: return '请求参数有误 (400)，通常是模型版本不对或发送内容过长。';
            case 401: return 'API密钥无效 (401)，请检查API设置中的Key是否正确。';
            case 403: return '访问被拒绝 (403)，可能是密钥权限不足或账号被封禁。';
            case 404: return 'API地址错误 (404)，找不到请求的接口，请检查Base URL。';
            case 429: return '请求太频繁啦 (429)，触发了速率限制，请稍等一会再试。';
            case 500: return '服务器内部错误 (500)，服务商那边出问题了。';
            case 502: return '网关错误 (502)，服务商网络异常。';
            case 503: return '服务暂时不可用 (503)，服务器可能正在维护或过载。';
            case 504: return '网关超时 (504)，服务器响应太慢了，请检查网络。';
            default: return `服务器返回了一个错误 (状态码: ${status})，请稍后再试。`;
        }
    }

    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        return '无法连接到服务器，请检查您的网络连接或API地址是否正确。';
    }

    return `发生了一个未知错误：${error.message}`;
}

// 显示错误弹窗
function showErrorModal(friendlyMessage, fullError) {
    const oldModal = document.getElementById('error-modal-overlay');
    if (oldModal) oldModal.remove();

    let logContent = `Error: ${fullError.name}: ${fullError.message}\n`;
    if (fullError.stack) logContent += `\nStack:\n${fullError.stack}\n`;
    if (fullError.response) {
        logContent += `\nResponse Status: ${fullError.response.status}\n`;
    }

    const modalHtml = `
    <div id="error-modal-overlay" class="modal-overlay visible" style="z-index: 9999; align-items: center; justify-content: center; display: flex;">
        <div class="modal-window" style="max-width: 90%; width: 380px; padding: 0; overflow: hidden; display: flex; flex-direction: column; max-height: 85vh; border-radius: 16px; background: #fff; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
            <div style="padding: 25px 20px 15px; text-align: center; flex-shrink: 0;">
                <div style="width: 56px; height: 56px; background: #ffebee; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px;">
                    <svg style="width: 32px; height: 32px; color: #d32f2f;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </div>
                <h3 style="margin: 0; color: #333; font-size: 18px; font-weight: 700;">出错了</h3>
                <p style="margin: 10px 0 0; color: #666; font-size: 15px; line-height: 1.5;">${friendlyMessage}</p>
            </div>
            <div style="flex-grow: 1; overflow-y: auto; padding: 0 20px 10px;">
                <div class="collapsible-section" style="border: 1px solid #eee; background: #f9f9f9; margin: 0; border-radius: 8px;">
                    <div class="collapsible-header" style="padding: 12px; background: #f5f5f5; border-bottom: 1px solid #eee;" onclick="this.parentElement.classList.toggle('open')">
                        <span style="font-size: 13px; color: #666; font-weight: 600; display: flex; align-items: center; gap: 5px;">
                            <svg style="width: 14px; height: 14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            查看详细日志
                        </span>
                        <span class="collapsible-arrow" style="color: #999;">▼</span>
                    </div>
                    <div class="collapsible-content" style="padding: 0 12px;">
                        <pre id="error-log-content" style="font-family: 'Menlo', 'Monaco', 'Courier New', monospace; font-size: 11px; color: #444; white-space: pre-wrap; word-break: break-all; margin: 10px 0; background: #fff; padding: 10px; border: 1px solid #eee; border-radius: 4px; max-height: 200px; overflow-y: auto; line-height: 1.4;">${logContent}</pre>
                        <button id="copy-error-btn" class="btn btn-small btn-neutral" style="margin-bottom: 10px; font-size: 12px; padding: 6px 12px; width: 100%; display: flex; justify-content: center; background: #eee; color: #555; border: none;">
                            <svg style="width: 14px; height: 14px; margin-right: 5px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            复制完整日志
                        </button>
                    </div>
                </div>
            </div>
            <div style="padding: 15px 20px 20px; border-top: none; text-align: center; background: #fff; flex-shrink: 0;">
                <button class="btn btn-primary" style="width: 100%; border-radius: 12px; font-weight: 600; font-size: 16px; padding: 12px;" onclick="document.getElementById('error-modal-overlay').remove()">知道了</button>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('copy-error-btn').addEventListener('click', function() {
        navigator.clipboard.writeText(logContent).then(() => {
            this.innerHTML = `<svg style="width: 14px; height: 14px; margin-right: 5px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"></path></svg>已复制`;
            this.style.background = '#e8f5e9';
            this.style.color = '#2e7d32';
            setTimeout(() => {
                this.innerHTML = `<svg style="width: 14px; height: 14px; margin-right: 5px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>复制完整日志`;
                this.style.background = '#eee';
                this.style.color = '#555';
            }, 2000);
        });
    });
}

function showApiError(error) {
    console.error("API Error Detected:", error);
    const friendlyMessage = getFriendlyErrorMessage(error);
    showErrorModal(friendlyMessage, error);
}

// 格式化时间分割线
function formatTimeDivider(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    
    const isSameYear = date.getFullYear() === now.getFullYear();
    
    const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    
    if (isToday) {
        return timeStr;
    } else if (isYesterday) {
        return `昨天 ${timeStr}`;
    } else if (isSameYear) {
        return `${date.getMonth() + 1}月${date.getDate()}日 ${timeStr}`;
    } else {
        return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${timeStr}`;
    }
}

// 格式化时间戳 YYYY-MM-DD HH:MM:SS
function getFormattedTimestamp(date) {
    const Y = date.getFullYear();
    const M = String(date.getMonth() + 1).padStart(2, '0');
    const D = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

// 格式化时间差
function formatTimeGap(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}天${hours % 24}小时`;
    if (hours > 0) return `${hours}小时${minutes % 60}分钟`;
    if (minutes > 0) return `${minutes}分钟`;
    return `${seconds}秒`;
}

function calculateVoiceDuration(text) {
    return Math.max(1, Math.min(60, Math.ceil(text.length / 3.5)));
}

// 模板处理函数：替换头像、名字等变量
function processTemplate(html, char) {
    if (!html || !char) return html;
    let processed = html;
    
    // 获取当前上下文中的头像和名字
    // 注意：currentChatType 和 db 是全局变量，确保在此处可用
    const isPrivate = (typeof currentChatType !== 'undefined' && currentChatType === 'private');
    
    let userAvatar, charAvatar, userName, charName, charRemark;

    if (isPrivate) {
        userAvatar = char.myAvatar || 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg';
        charAvatar = char.avatar || 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg';
        userName = char.myName || 'User';
        charName = char.name || 'Character';
        charRemark = char.remarkName || charName;
    } else {
        // 群聊逻辑
        userAvatar = (char.me && char.me.avatar) ? char.me.avatar : 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg';
        charAvatar = char.avatar || 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg'; // 群头像
        userName = (char.me && char.me.nickname) ? char.me.nickname : 'User';
        charName = char.name || 'Group';
        charRemark = charName;
    }

    // 简单变量替换
    processed = processed.replace(/{{user_avatar}}/g, userAvatar);
    processed = processed.replace(/{{char_avatar}}/g, charAvatar);
    processed = processed.replace(/{{user_name}}/g, userName);
    processed = processed.replace(/{{char_name}}/g, charName);
    processed = processed.replace(/{{char_remark}}/g, charRemark);
    processed = processed.replace(/{{user_remark}}/g, userName); // user_remark 等同于 user_name

    // 标签替换 (支持可选的 style 和 class 属性)
    // <user-avatar class="..." style="..."> -> <img src="..." class="uwu-user-avatar ..." style="...">
    processed = processed.replace(/<user-avatar([^>]*)>\s*(?:<\/user-avatar>)?/gi, (match, attrs) => {
        return `<img src="${userAvatar}" class="uwu-user-avatar" ${attrs}>`;
    });

    processed = processed.replace(/<char-avatar([^>]*)>\s*(?:<\/char-avatar>)?/gi, (match, attrs) => {
        return `<img src="${charAvatar}" class="uwu-char-avatar" ${attrs}>`;
    });

    return processed;
}

// 解析混合内容 (文本+HTML)
function getMixedContent(responseData) {
    const results = [];
    let i = 0;

    while (i < responseData.length) {
        const nextTagStart = responseData.indexOf('<', i);
        const nextBracketStart = responseData.indexOf('[', i);

        let firstSpecialIndex = -1;
        if (nextTagStart !== -1 && nextBracketStart !== -1) {
            firstSpecialIndex = Math.min(nextTagStart, nextBracketStart);
        } else {
            firstSpecialIndex = Math.max(nextTagStart, nextBracketStart);
        }

        if (firstSpecialIndex === -1) {
            const text = responseData.substring(i).trim();
            if (text) results.push({ type: 'text', content: `[unknown的消息：${text}]` });
            break;
        }

        if (firstSpecialIndex > i) {
            const text = responseData.substring(i, firstSpecialIndex).trim();
            if (text) results.push({ type: 'text', content: `[unknown的消息：${text}]` });
        }

        i = firstSpecialIndex;

        if (responseData[i] === '<') {
            const tagMatch = responseData.substring(i).match(/^<([a-zA-Z0-9]+)/);
            if (tagMatch) {
                const tagName = tagMatch[1];
                let openCount = 0;
                let searchIndex = i;
                let blockEnd = -1;

                while (searchIndex < responseData.length) {
                    const openTagPos = responseData.indexOf('<' + tagName, searchIndex);
                    const closeTagPos = responseData.indexOf('</' + tagName, searchIndex);

                    if (openTagPos !== -1 && (closeTagPos === -1 || openTagPos < closeTagPos)) {
                        openCount++;
                        searchIndex = openTagPos + 1;
                    } else if (closeTagPos !== -1) {
                        openCount--;
                        searchIndex = closeTagPos + 1;
                        if (openCount === 0) {
                            blockEnd = closeTagPos + `</${tagName}>`.length;
                            break;
                        }
                    } else {
                        break; 
                    }
                }

                if (blockEnd !== -1) {
                    const htmlBlock = responseData.substring(i, blockEnd);
                    const charMatch = htmlBlock.match(/<[a-z][a-z0-9]*\s+char="([^"]*)"/i);
                    const char = charMatch ? charMatch[1] : null;
                    results.push({ type: 'html', char: char, content: htmlBlock });
                    i = blockEnd;
                    continue;
                }
            }
        }
        
        if (responseData[i] === '[') {
            const endBracket = responseData.indexOf(']', i);
            if (endBracket !== -1) {
                const text = responseData.substring(i, endBracket + 1);
                results.push({ type: 'text', content: text });
                i = endBracket + 1;
                continue;
            }
        }

        const nextSpecial1 = responseData.indexOf('<', i + 1);
        const nextSpecial2 = responseData.indexOf('[', i + 1);
        let endOfText = -1;
        if (nextSpecial1 !== -1 && nextSpecial2 !== -1) {
            endOfText = Math.min(nextSpecial1, nextSpecial2);
        } else {
            endOfText = Math.max(nextSpecial1, nextSpecial2);
        }
        if (endOfText === -1) {
            endOfText = responseData.length;
        }
        const text = responseData.substring(i, endOfText).trim();
        if (text) results.push({ type: 'text', content: `[unknown的消息：${text}]` });
        i = endOfText;
    }
    return results;
}

// 过滤聊天记录用于 AI 上下文 (包含状态栏剔除和双语格式化)
function filterHistoryForAI(chat, historySlice, ignoreContextDisabled = false) {
    // 1. 基础过滤：深度克隆并过滤掉被屏蔽上下文的消息
    let filteredHistory = JSON.parse(JSON.stringify(historySlice || chat.history));
    if (!ignoreContextDisabled) {
        filteredHistory = filteredHistory.filter(m => !m.isContextDisabled);
    }

    // 【三重保险】强制清洗所有消息内容中的 <thinking> 标签块
    // 防止思维链内容意外混入普通消息中
    filteredHistory.forEach(msg => {
        if (msg.content && typeof msg.content === 'string') {
            msg.content = msg.content.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
        }
        if (msg.parts && Array.isArray(msg.parts)) {
            msg.parts.forEach(p => {
                if (p.type === 'text' && p.text) {
                    p.text = p.text.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
                }
            });
        }
    });

    // 2. 双语模式格式标准化
    if (chat.bilingualModeEnabled) {
        filteredHistory.forEach(msg => {
            if (msg.role === 'assistant') {
                if (msg.content) {
                    msg.content = msg.content.replace(/[\s\n]*[\(（]([^\)）]+)[\)）]([\s\n]*\])$/, '「$1」$2');
                    msg.content = msg.content.replace(/[\s\n]*[\(（]([^\)）]+)[\)）]$/, '「$1」');
                }
                if (msg.parts && Array.isArray(msg.parts)) {
                    msg.parts.forEach(p => {
                        if (p.type === 'text' && p.text) {
                            p.text = p.text.replace(/[\s\n]*[\(（]([^\)）]+)[\)）]([\s\n]*\])$/, '「$1」$2');
                            p.text = p.text.replace(/[\s\n]*[\(（]([^\)）]+)[\)）]$/, '「$1」');
                        }
                    });
                }
            }
        });
    }

    // 3. 状态栏移除逻辑
    if (chat.statusPanel && chat.statusPanel.enabled && chat.statusPanel.regexPattern) {
        const currentRegexStr = chat.statusPanel.regexPattern;
        const limit = chat.statusPanel.historyLimit !== undefined ? chat.statusPanel.historyLimit : 3;
        const validityDepth = 50;
        let statusCount = 0;
        const totalSliceLength = filteredHistory.length;

        let currentRegexParsed = currentRegexStr;
        const regexMatch = currentRegexStr.match(/^\/(.*?)\/([a-z]*)$/);
        if (regexMatch) {
            currentRegexParsed = regexMatch[1];
        }

        // 3.1 预处理
        filteredHistory = filteredHistory.filter((msg, index) => {
            if (msg.isStatusUpdate) {
                const depth = totalSliceLength - 1 - index;
                if (depth >= validityDepth) return false;
                if (!msg.statusSnapshot) return false;
                if (msg.statusSnapshot.regex !== currentRegexParsed) return false;
                return true;
            }
            return true;
        });

        // 3.2 遍历处理
        for (let i = filteredHistory.length - 1; i >= 0; i--) {
            const msg = filteredHistory[i];
            const currentDepth = filteredHistory.length - 1 - i;
            
            if (msg.isStatusUpdate) {
                if (statusCount < limit) {
                    statusCount++;
                } else {
                    msg.content = '';
                    msg.parts = [];
                }
                continue;
            }

            let pattern = chat.statusPanel.regexPattern;
            let flags = 'gs';
            const matchParts = pattern.match(/^\/(.*?)\/([a-z]*)$/);
            if (matchParts) {
                pattern = matchParts[1];
                flags = matchParts[2] || 'gs';
                if (!flags.includes('g')) flags += 'g';
                if (!flags.includes('s')) flags += 's';
            }
            let regex;
            try {
                regex = new RegExp(pattern, flags);
            } catch (e) {
                console.error("Invalid regex in status panel settings:", e);
                continue;
            }

            if (msg.role === 'assistant') {
                const originalContent = msg.content || '';
                const newContent = originalContent.replace(regex, '').trim();
                const contentHasMatch = (newContent !== originalContent);

                let partsHasMatch = false;
                let newParts = undefined;
                
                if (msg.parts && Array.isArray(msg.parts)) {
                    newParts = msg.parts.map(p => {
                        if (p.type === 'text') {
                            try {
                                const partRegex = new RegExp(pattern, flags);
                                const newText = p.text.replace(partRegex, '').trim();
                                if (newText !== p.text) partsHasMatch = true;
                                return { ...p, text: newText };
                            } catch (e) {
                                return p;
                            }
                        }
                        return p;
                    }).filter(p => {
                        if (p.type === 'text') return p.text !== '';
                        return true;
                    });
                }

                if (contentHasMatch || partsHasMatch) {
                    if (currentDepth < validityDepth && statusCount < limit) {
                        statusCount++;
                    } else {
                        if (contentHasMatch) msg.content = newContent;
                        if (partsHasMatch && newParts) msg.parts = newParts;
                        if (!msg.content && (!msg.parts || msg.parts.length === 0)) {
                            msg.content = '';
                        }
                    }
                }
            }
        }

        // 3.3 最终过滤
        filteredHistory = filteredHistory.filter(msg => {
            const hasContent = msg.content && msg.content.trim() !== '';
            const hasParts = msg.parts && msg.parts.length > 0;
            return hasContent || hasParts;
        });
    }

    return filteredHistory;
}

// 通用 AI 响应获取函数 (支持流式和非流式自动切换)
async function fetchAiResponse(settings, requestBody, headers, endpoint, forceStream = false) {
    const { provider } = settings;
    const streamEnabled = forceStream || settings.streamEnabled;

    // 1. 针对流式传输调整 Request Body 和 Endpoint
    if (streamEnabled) {
        if (provider === 'gemini') {
            if (endpoint.includes(':generateContent')) {
                endpoint = endpoint.replace(':generateContent', ':streamGenerateContent');
            }
        } else {
            requestBody.stream = true;
        }
    }

    // 2. 发送请求
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`API Error: ${response.status} ${errorText}`);
        error.response = response;
        throw error;
    }

    // 3. 处理响应
    // 优先检查响应头是否指示流式，或者我们是否显式请求了流式
    const contentType = response.headers.get('content-type') || '';
    const isStreamResponse = streamEnabled || contentType.includes('text/event-stream');

    if (isStreamResponse) {
        return await readStreamResponse(response, provider);
    } else {
        // 普通 JSON 响应 (带容错处理)
        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            // JSON 解析失败。检查是否是 SSE 格式的文本 (针对未设置 header 的流式响应)
            if (text.includes('data: ')) {
                console.warn("Received SSE response without header, parsing as text...");
                let fallbackContent = "";
                const lines = text.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                        try {
                            const json = JSON.parse(line.substring(6));
                            fallbackContent += json.choices[0].delta?.content || "";
                        } catch (e2) {}
                    }
                }
                if (fallbackContent) return fallbackContent;
            }
            throw new Error(`Failed to parse JSON response: ${text.substring(0, 100)}...`);
        }

        if (provider === 'gemini') {
            return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        } else {
            return data.choices[0].message.content;
        }
    }
}

async function readStreamResponse(response, provider) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = "";
    let accumulatedChunk = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulatedChunk += decoder.decode(value, { stream: true });

        if (provider !== 'gemini') {
            // OpenAI / Standard SSE logic
            const parts = accumulatedChunk.split("\n\n");
            accumulatedChunk = parts.pop();
            for (const part of parts) {
                if (part.startsWith("data: ")) {
                    const data = part.substring(6);
                    if (data.trim() !== "[DONE]") {
                        try {
                            const json = JSON.parse(data);
                            fullResponse += json.choices[0].delta?.content || "";
                        } catch (e) {}
                    }
                }
            }
        }
    }

    // Handle remaining chunk for OpenAI
    if (provider !== 'gemini' && accumulatedChunk && accumulatedChunk.trim().length > 0) {
         if (accumulatedChunk.startsWith("data: ")) {
             const data = accumulatedChunk.substring(6);
             if (data.trim() !== "[DONE]") {
                 try {
                     const json = JSON.parse(data);
                     fullResponse += json.choices[0].delta?.content || "";
                 } catch (e) {}
             }
         }
    }

    // Gemini logic (accumulate all and parse at the end)
    if (provider === 'gemini') {
        try {
            // 尝试解析为 JSON 数组
            const parsedStream = JSON.parse(accumulatedChunk);
            if (Array.isArray(parsedStream)) {
                fullResponse = parsedStream.map(item => item.candidates?.[0]?.content?.parts?.[0]?.text || "").join('');
            }
        } catch (e) {
            console.error("Gemini stream parsing failed", e);
        }
    }

    return fullResponse;
}

// --- 图片查看器 ---
function openImageViewer(src) {
    const modal = document.getElementById('full-image-modal');
    const img = document.getElementById('full-image-view');
    const closeBtn = document.getElementById('close-full-image-btn');
    
    if (!modal || !img) return;
    
    img.src = src;
    modal.classList.add('visible');
    
    // 简单的关闭逻辑
    const closeModal = () => {
        modal.classList.remove('visible');
        setTimeout(() => { img.src = ''; }, 300); // 动画结束后清空
    };
    
    if (closeBtn) closeBtn.onclick = closeModal;
    modal.onclick = (e) => {
        if (e.target === modal || e.target.closest('.modal-window')) {
            // 点击图片本身不关闭，点击背景关闭
            if (e.target !== img) {
                closeModal();
            }
        }
    };
}

// 暴露给全局
window.openImageViewer = openImageViewer;
window.getRandomValue = getRandomValue;
window.pad = pad;
window.formatTimeGap = formatTimeGap;
window.filterHistoryForAI = filterHistoryForAI;
window.showToast = showToast;
window.playSound = (typeof playSound !== 'undefined') ? playSound : null; // 防止循环依赖
