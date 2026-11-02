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

// 获取指定时区的当前当地时间
function getLocalTimeInTimezone(timezone) {
    if (!timezone) return null;
    
    // 兼容旧的非标准预设格式
    const legacyTimezoneMap = {
        '北京/UTC+8': 'Asia/Shanghai',
        '东京/UTC+9': 'Asia/Tokyo',
        '首尔/UTC+9': 'Asia/Seoul',
        '伦敦/UTC+0': 'Europe/London',
        '纽约/UTC-5': 'America/New_York',
        '悉尼/UTC+10': 'Australia/Sydney',
        '巴黎/UTC+1': 'Europe/Paris'
    };
    
    if (legacyTimezoneMap[timezone]) {
        timezone = legacyTimezoneMap[timezone];
    }
    
    try {
        const options = {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        };
        const formatter = new Intl.DateTimeFormat('zh-CN', options);
        return formatter.format(new Date());
    } catch (e) {
        console.error("Invalid timezone:", timezone, e);
        return null;
    }
}

// PNG tEXt Chunk 编辑工具
function writeOvoPngMetadata(base64ImageOrUrl, jsonData) {
    return new Promise((resolve, reject) => {
        // 先确保图片是 PNG Base64 格式
        const img = new Image();
        img.crossOrigin = 'Anonymous'; // 尝试跨域加载

        img.onload = () => {
            try {
                // 将图片绘制到 Canvas 以转换为干净的 PNG Base64
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || 800;
                canvas.height = img.naturalHeight || 800;
                const ctx = canvas.getContext('2d');
                // 绘制背景为透明（如果原图有透明的话）或白色
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);

                const cleanPngBase64 = canvas.toDataURL('image/png');
                
                // 移除 base64 前缀
                const base64Data = cleanPngBase64.replace(/^data:image\/png;base64,/, '');
                const rawData = atob(base64Data);
                const uint8Array = new Uint8Array(rawData.length);
                for (let i = 0; i < rawData.length; i++) {
                    uint8Array[i] = rawData.charCodeAt(i);
                }

                // 检查 PNG 签名
                const signature = [137, 80, 78, 71, 13, 10, 26, 10];
                for (let i = 0; i < signature.length; i++) {
                    if (uint8Array[i] !== signature[i]) {
                        return reject(new Error('Invalid PNG signature after canvas conversion'));
                    }
                }

                // 编码 tEXt 块数据
                const keyword = 'ovo_chara';
                const textData = btoa(unescape(encodeURIComponent(JSON.stringify(jsonData)))); // Base64 编码的 JSON
                
                const keywordBytes = new TextEncoder().encode(keyword);
                const nullSeparator = new Uint8Array([0]);
                const textBytes = new TextEncoder().encode(textData);
                
                const chunkData = new Uint8Array(keywordBytes.length + 1 + textBytes.length);
                chunkData.set(keywordBytes, 0);
                chunkData.set(nullSeparator, keywordBytes.length);
                chunkData.set(textBytes, keywordBytes.length + 1);

                // 计算 CRC
                const crcTable = [];
                for (let i = 0; i < 256; i++) {
                    let c = i;
                    for (let j = 0; j < 8; j++) {
                        c = ((c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1));
                    }
                    crcTable[i] = c;
                }
                function crc32(data) {
                    let crc = 0xffffffff;
                    for (let i = 0; i < data.length; i++) {
                        crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
                    }
                    return crc ^ 0xffffffff;
                }

                const chunkType = new TextEncoder().encode('tEXt');
                const crcData = new Uint8Array(chunkType.length + chunkData.length);
                crcData.set(chunkType, 0);
                crcData.set(chunkData, chunkType.length);
                
                const crcValue = crc32(crcData);

                // 组装 Chunk
                const lengthBytes = new Uint8Array(4);
                new DataView(lengthBytes.buffer).setUint32(0, chunkData.length);
                
                const crcBytes = new Uint8Array(4);
                new DataView(crcBytes.buffer).setUint32(0, crcValue);

                const newChunk = new Uint8Array(lengthBytes.length + chunkType.length + chunkData.length + crcBytes.length);
                let offset = 0;
                newChunk.set(lengthBytes, offset); offset += lengthBytes.length;
                newChunk.set(chunkType, offset); offset += chunkType.length;
                newChunk.set(chunkData, offset); offset += chunkData.length;
                newChunk.set(crcBytes, offset);

                // 寻找 IHDR 块，在它之后插入我们的 tEXt 块
                let insertPos = 8;
                const view = new DataView(uint8Array.buffer);
                const length = view.getUint32(insertPos);
                insertPos += 8 + length + 4; // Skip IHDR

                const newUint8Array = new Uint8Array(uint8Array.length + newChunk.length);
                newUint8Array.set(uint8Array.slice(0, insertPos), 0);
                newUint8Array.set(newChunk, insertPos);
                newUint8Array.set(uint8Array.slice(insertPos), insertPos + newChunk.length);

                // 转换回 Base64 Data URL
                let binary = '';
                for (let i = 0; i < newUint8Array.length; i++) {
                    binary += String.fromCharCode(newUint8Array[i]);
                }
                resolve('data:image/png;base64,' + btoa(binary));

            } catch (error) {
                reject(error);
            }
        };
        img.onerror = () => reject(new Error('Failed to load image for PNG conversion'));
        img.src = base64ImageOrUrl;
    });
}

function readOvoPngMetadata(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = (e) => {
            try {
                const buffer = e.target.result;
                const view = new DataView(buffer);
                const signature = [137, 80, 78, 71, 13, 10, 26, 10];
                for (let i = 0; i < signature.length; i++) {
                    if (view.getUint8(i) !== signature[i]) {
                        return reject(new Error('文件不是一个有效的PNG。'));
                    }
                }

                let offset = 8;
                let charaData = null;

                while (offset < view.byteLength) {
                    const length = view.getUint32(offset);
                    const type = String.fromCharCode(view.getUint8(offset + 4), view.getUint8(offset + 5), view.getUint8(offset + 6), view.getUint8(offset + 7));

                    if (type === 'tEXt') {
                        const textChunk = new Uint8Array(buffer, offset + 8, length);
                        let separatorIndex = -1;
                        for (let i = 0; i < textChunk.length; i++) {
                            if (textChunk[i] === 0) {
                                separatorIndex = i;
                                break;
                            }
                        }

                        if (separatorIndex !== -1) {
                            const keyword = new TextDecoder('utf-8').decode(textChunk.slice(0, separatorIndex));
                            if (keyword === 'ovo_chara') {
                                const base64Data = new TextDecoder('utf-8').decode(textChunk.slice(separatorIndex + 1));
                                try {
                                    const decodedString = decodeURIComponent(escape(atob(base64Data)));
                                    charaData = JSON.parse(decodedString);
                                    break;
                                } catch (decodeError) {
                                    return reject(new Error(`解析专属角色数据失败: ${decodeError.message}`));
                                }
                            }
                        }
                    }
                    offset += 12 + length;
                }

                if (charaData) {
                    const imageReader = new FileReader();
                    imageReader.readAsDataURL(file);
                    imageReader.onload = (imgEvent) => {
                        resolve({ data: charaData, avatar: imgEvent.target.result });
                    };
                    imageReader.onerror = () => {
                        resolve({ data: charaData, avatar: 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg' });
                    };
                } else {
                    reject(new Error('在PNG中未找到专属角色数据 (tEXt chunk not found)。'));
                }
            } catch (error) {
                reject(new Error(`解析PNG失败: ${error.message}`));
            }
        };
        reader.onerror = () => reject(new Error('读取PNG文件失败。'));
    });
}

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
    const isMutedSimple = typeof notification === 'object' && notification !== null && notification.muted && notification.text != null;

    if (isRichNotification) {
        toastElement.classList.remove('simple', 'toast-muted');
        avatarEl.style.display = 'block';
        nameEl.style.display = 'block';
        messageEl.style.textAlign = 'left';
        avatarEl.src = notification.avatar || 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg';
        nameEl.textContent = notification.name;
        messageEl.textContent = notification.message;
    } else if (isMutedSimple) {
        toastElement.classList.add('simple', 'toast-muted');
        avatarEl.style.display = 'none';
        nameEl.style.display = 'none';
        messageEl.style.textAlign = 'center';
        messageEl.textContent = notification.text;
    } else {
        toastElement.classList.add('simple');
        toastElement.classList.remove('toast-muted');
        avatarEl.style.display = 'none';
        nameEl.style.display = 'none';
        messageEl.style.textAlign = 'center';
        messageEl.textContent = typeof notification === 'string' ? notification : (notification && notification.text) || '';
    }

    toastElement.classList.add('show');

    setTimeout(() => {
        toastElement.classList.remove('show', 'toast-muted');
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

function showAppConfirmDialog(options = {}) {
    const {
        title = '请确认',
        message = '',
        confirmText = '确定',
        cancelText = '取消',
        dismissText = '稍后再说',
        allowBackdropClose = true
    } = options;

    return new Promise((resolve) => {
        let overlay = document.getElementById('app-confirm-dialog');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'app-confirm-dialog';
            overlay.className = 'modal-overlay app-confirm-dialog';
            overlay.innerHTML = `
                <div class="modal-window app-confirm-dialog-window" role="dialog" aria-modal="true" aria-labelledby="app-confirm-dialog-title">
                    <h3 id="app-confirm-dialog-title" class="app-confirm-dialog-title"></h3>
                    <div class="app-confirm-dialog-message"></div>
                    <div class="app-confirm-dialog-actions">
                        <button type="button" class="app-confirm-dialog-btn secondary" data-action="dismiss"></button>
                        <button type="button" class="app-confirm-dialog-btn ghost" data-action="cancel"></button>
                        <button type="button" class="app-confirm-dialog-btn primary" data-action="confirm"></button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
        }

        const titleEl = overlay.querySelector('.app-confirm-dialog-title');
        const messageEl = overlay.querySelector('.app-confirm-dialog-message');
        const confirmBtn = overlay.querySelector('[data-action="confirm"]');
        const cancelBtn = overlay.querySelector('[data-action="cancel"]');
        const dismissBtn = overlay.querySelector('[data-action="dismiss"]');
        const dialogWindow = overlay.querySelector('.app-confirm-dialog-window');

        titleEl.textContent = title;
        messageEl.textContent = message;
        confirmBtn.textContent = confirmText;
        cancelBtn.textContent = cancelText;
        dismissBtn.textContent = dismissText;
        cancelBtn.style.display = cancelText ? '' : 'none';
        dismissBtn.style.display = dismissText ? '' : 'none';

        let settled = false;

        const cleanup = () => {
            overlay.classList.remove('visible');
            overlay.removeEventListener('click', handleOverlayClick);
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
            dismissBtn.removeEventListener('click', onDismiss);
            document.removeEventListener('keydown', handleKeydown, true);
        };

        const finish = (result) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(result);
        };

        const handleOverlayClick = (event) => {
            if (event.target === overlay && allowBackdropClose) {
                finish('dismiss');
            }
        };

        const handleKeydown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                finish(allowBackdropClose ? 'dismiss' : 'cancel');
            }
        };

        const onConfirm = () => finish('confirm');
        const onCancel = () => finish('cancel');
        const onDismiss = () => finish('dismiss');

        overlay.addEventListener('click', handleOverlayClick);
        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
        dismissBtn.addEventListener('click', onDismiss);
        document.addEventListener('keydown', handleKeydown, true);

        overlay.classList.add('visible');
        requestAnimationFrame(() => {
            (confirmBtn || dialogWindow).focus();
        });
    });
}

// 系统级通知（通过 Service Worker postMessage 触发，无需服务器，应用前/后台均有效）
async function showSystemNotification({ title, body, icon }) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (!navigator.serviceWorker) return;

    try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.active) {
            reg.active.postMessage({
                type: 'SHOW_NOTIFICATION',
                payload: { title, body: body || '', icon: icon || undefined, tag: 'ovo-message' }
            });
        }
    } catch (e) {
        console.warn('showSystemNotification error:', e);
    }
}
window.showSystemNotification = showSystemNotification;

// 触感反馈工具
function triggerHapticFeedback(type = 'light') {
    // 检查全局开关
    if (!db.hapticEnabled) return;
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
    <div id="error-modal-overlay" class="modal-overlay visible" style="z-index: 30000; align-items: center; justify-content: center; display: flex;">
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
            const interactiveBlock = window.InteractiveMessages?.readBlock(responseData, i);
            if (interactiveBlock) {
                results.push({ type: 'html', char: interactiveBlock.char, content: interactiveBlock.content });
                i = interactiveBlock.end;
                continue;
            }
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
            let endBracket = -1;
            let bracketCount = 0;
            for (let j = i; j < responseData.length; j++) {
                if (responseData[j] === '[') bracketCount++;
                else if (responseData[j] === ']') {
                    bracketCount--;
                    if (bracketCount === 0) {
                        endBracket = j;
                        break;
                    }
                }
            }

            if (endBracket !== -1) {
                let text = responseData.substring(i, endBracket + 1);
                
                // 兼容：过滤掉嵌套在消息中的表情包的 (画面:xxx) 后缀，避免后续渲染找不到匹配的表情包名称
                const stickerRegex = /(\[(?:.*?的)?表情包[：:])(.+?)(\])/g;
                text = text.replace(stickerRegex, (match, prefix, stickerName, suffix) => {
                    let cleanName = stickerName;
                    const suffixIndex1 = cleanName.indexOf('(画面:');
                    if (suffixIndex1 !== -1) cleanName = cleanName.substring(0, suffixIndex1).trim();
                    const suffixIndex2 = cleanName.indexOf('（画面:');
                    if (suffixIndex2 !== -1) cleanName = cleanName.substring(0, suffixIndex2).trim();
                    const suffixIndex3 = cleanName.indexOf('（画面：');
                    if (suffixIndex3 !== -1) cleanName = cleanName.substring(0, suffixIndex3).trim();
                    const suffixIndex4 = cleanName.indexOf('(画面：');
                    if (suffixIndex4 !== -1) cleanName = cleanName.substring(0, suffixIndex4).trim();
                    return prefix + cleanName + suffix;
                });

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
    // Only concise page summaries enter model context; executable source stays local.
    if (window.InteractiveMessages) historySlice = (historySlice || chat.history || []).map(message => {
        const summary = window.InteractiveMessages.contextText(message);
        return summary ? { ...message, content: summary, parts: [{ type: 'text', text: summary }], interactive: undefined } : message;
    });
    const includeMomentsActivity = window.Moments?.isChatLinked?.(chat.id) !== false;
    // 仅复制下方过滤逻辑会改动的消息及 part；图片数据字符串保持引用，避免每次请求复制整份 Base64。
    let filteredHistory = (historySlice || chat.history || []).filter(message => includeMomentsActivity || !message.isMomentsActivity).map(message => ({
        ...message,
        parts: Array.isArray(message.parts) ? message.parts.map(part => ({ ...part })) : message.parts
    }));
    if (!ignoreContextDisabled) {
        filteredHistory = filteredHistory.filter(m => !m.isContextDisabled);
    }

    // 头像操作消息：转换为 system 格式供 AI 理解
    filteredHistory.forEach(msg => {
        if (msg.isAvatarAction && msg.content) {
            const actionMatch = msg.content.match(/^\[avatar-action:([\s\S]+?)\]$/);
            if (actionMatch) {
                msg.content = `[system: 头像操作记录 - ${actionMatch[1]}]`;
            }
        }
    });

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

    // 4. 小剧场分享占位符展开为真实内容（仅供 AI 上下文使用）
    try {
        const theaterShareRegex = /^\[小剧场分享[：:](.+?)\]$/;
        if (typeof db !== 'undefined' && db) {
            filteredHistory.forEach(msg => {
                if (!msg || !msg.content || typeof msg.content !== 'string') return;
                const match = msg.content.match(theaterShareRegex);
                if (!match) return;
                const scenarioId = match[1];
                let scenario = null;
                if (Array.isArray(db.theaterScenarios)) {
                    scenario = db.theaterScenarios.find(s => s.id === scenarioId);
                }
                if (!scenario && Array.isArray(db.theaterHtmlScenarios)) {
                    scenario = db.theaterHtmlScenarios.find(s => s.id === scenarioId);
                }
                if (!scenario) return;

                let charName = '';
                if (scenario.charId && Array.isArray(db.characters)) {
                    const ch = db.characters.find(c => c.id === scenario.charId);
                    if (ch) charName = ch.remarkName || ch.realName || '';
                }

                const lines = [];
                lines.push('【小剧场分享】');
                lines.push(`标题：${scenario.title || '剧情'}`);
                lines.push(`分类：${scenario.category || '未分类'}`);
                if (charName) {
                    lines.push(`角色：${charName}`);
                }
                lines.push('');
                lines.push(scenario.content || '');

                msg.content = lines.join('\n');
            });
        }
    } catch (e) {
        console.error('展开小剧场分享内容到 AI 上下文时出错:', e);
    }

    return filteredHistory;
}

function aiMessageContentToText(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.map(part => {
            if (!part) return '';
            if (part.type === 'text' || part.type === 'html') return part.text || part.content || '';
            if (part.type === 'image_url' || part.type === 'image') return '[图片]';
            return '';
        }).filter(Boolean).join('\n');
    }
    if (content == null) return '';
    return String(content);
}

function wrapSystemMessageForCompat(content) {
    const text = aiMessageContentToText(content).trim();
    return text ? `[System Instruction]\n${text}` : '[System Instruction]';
}

function mergeAdjacentCompatMessages(messages) {
    const merged = [];
    messages.forEach(msg => {
        if (!msg) return;
        const prev = merged[merged.length - 1];
        const canMerge = prev &&
            prev.role === msg.role &&
            typeof prev.content === 'string' &&
            typeof msg.content === 'string';
        if (canMerge) {
            prev.content += `\n\n${msg.content}`;
        } else {
            merged.push({ ...msg });
        }
    });
    return merged;
}

function normalizeMessagesForProvider(messages, provider) {
    const list = Array.isArray(messages) ? messages : [];
    const mapped = list.map(msg => {
        if (!msg) return null;
        const originalRole = msg.role === 'char' ? 'assistant' : msg.role;
        let nextRole = originalRole;
        let nextContent = msg.content;

        if (provider === 'claude') {
            if (originalRole === 'assistant' || originalRole === 'user') {
                nextRole = originalRole;
            } else if (originalRole === 'system') {
                nextRole = 'user';
                nextContent = wrapSystemMessageForCompat(msg.content);
            } else {
                nextRole = 'user';
            }
        }

        return {
            ...msg,
            role: nextRole,
            content: nextContent
        };
    }).filter(Boolean);

    return provider === 'claude' ? mergeAdjacentCompatMessages(mapped) : mapped;
}

const API_NODE_FEATURES = Object.freeze({
    chat: '私聊回复', groupChat: '群聊回复', background: '后台主动消息', call: '通话回复',
    summary: '对话总结', journal: '日记', forum: '论坛', moments: '动态', theater: '小剧场', peek: '查手机',
    shop: '商店内容', pomodoro: '番茄钟互动', battery: '电量互动', imageChat: '聊天图片理解',
    stickerVision: '表情包理解', avatarVision: '头像理解', callVision: '通话画面理解',
    memorySummary: '记忆总结', webSearch: '联网搜索'
});

const API_GENERATION_PARAMETER_DEFINITIONS = Object.freeze({
    temperature: { label: '温度', apiName: 'Temperature', type: 'number', min: 0, max: 2, step: 0.1, defaultValue: 0.8, defaultEnabled: true, support: ['openai_chat', 'deepseek', 'anthropic', 'gemini', 'ollama', 'custom'] },
    topP: { label: '核采样范围', apiName: 'Top P', type: 'number', min: 0, max: 1, step: 0.05, defaultValue: 1, support: ['openai_chat', 'deepseek', 'anthropic', 'gemini', 'ollama', 'custom'] },
    topK: { label: '候选词数量', apiName: 'Top K', type: 'integer', min: 1, max: 500, step: 1, defaultValue: 40, support: ['anthropic', 'gemini', 'ollama', 'custom'] },
    minP: { label: '最低概率阈值', apiName: 'Min P', type: 'number', min: 0, max: 1, step: 0.01, defaultValue: 0, support: ['ollama', 'custom'] },
    maxOutputTokens: { label: '最大输出 Tokens', apiName: 'Max Tokens', type: 'integer', min: 1, max: 200000, step: 1, defaultValue: 4096, support: ['openai_chat', 'deepseek', 'anthropic', 'gemini', 'ollama', 'custom'] },
    frequencyPenalty: { label: '频率惩罚', apiName: 'Frequency Penalty', type: 'number', min: -2, max: 2, step: 0.1, defaultValue: 0, support: ['openai_chat', 'deepseek', 'gemini', 'custom'] },
    presencePenalty: { label: '存在惩罚', apiName: 'Presence Penalty', type: 'number', min: -2, max: 2, step: 0.1, defaultValue: 0, support: ['openai_chat', 'deepseek', 'gemini', 'custom'] },
    repetitionPenalty: { label: '重复惩罚', apiName: 'Repetition Penalty', type: 'number', min: 0, max: 2, step: 0.05, defaultValue: 1, support: ['ollama', 'custom'] },
    seed: { label: '随机种子', apiName: 'Seed', type: 'integer', min: 0, max: 2147483647, step: 1, defaultValue: 0, support: ['openai_chat', 'deepseek', 'gemini', 'ollama', 'custom'] },
    stopSequences: { label: '停止序列', apiName: 'Stop', type: 'text', defaultValue: '', support: ['openai_chat', 'deepseek', 'anthropic', 'gemini', 'ollama', 'custom'] },
    candidateCount: { label: '候选回复数量', apiName: 'Candidate Count', type: 'integer', min: 1, max: 8, step: 1, defaultValue: 1, support: ['openai_chat', 'deepseek', 'gemini', 'custom'] },
    responseFormat: { label: '输出格式', apiName: 'Response Format', type: 'select', defaultValue: 'text', options: [['text', '普通文本'], ['json_object', 'JSON 对象']], support: ['openai_chat', 'deepseek', 'gemini', 'custom'] }
});

function cloneApiGenerationValue(value) {
    return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

function createDefaultApiGenerationParams(nodeMode = false) {
    return Object.fromEntries(Object.entries(API_GENERATION_PARAMETER_DEFINITIONS).map(([key, def]) => [key, nodeMode
        ? { mode: 'inherit', value: cloneApiGenerationValue(def.defaultValue) }
        : { enabled: !!def.defaultEnabled, value: cloneApiGenerationValue(def.defaultValue) }
    ]));
}

function normalizeApiGenerationParams(params, nodeMode = false, legacyTemperature) {
    const defaults = createDefaultApiGenerationParams(nodeMode);
    const source = params && typeof params === 'object' ? params : {};
    Object.keys(defaults).forEach(key => {
        const entry = source[key];
        if (!entry || typeof entry !== 'object') return;
        if (nodeMode) defaults[key].mode = ['inherit', 'on', 'off'].includes(entry.mode) ? entry.mode : defaults[key].mode;
        else if (typeof entry.enabled === 'boolean') defaults[key].enabled = entry.enabled;
        if (entry.value !== undefined) defaults[key].value = cloneApiGenerationValue(entry.value);
    });
    if (!nodeMode && source.temperature === undefined && legacyTemperature !== undefined) {
        defaults.temperature = { enabled: true, value: Number(legacyTemperature) };
    }
    return defaults;
}

function resolveApiGenerationParams(globalParams, node, legacyTemperature) {
    const base = normalizeApiGenerationParams(globalParams, false, legacyTemperature);
    if (!node || node.generationParamMode === 'inherit' || !node.generationParamMode) return base;
    if (node.generationParamMode === 'provider') {
        Object.values(base).forEach(entry => { entry.enabled = false; });
        return base;
    }
    const overrides = normalizeApiGenerationParams(node.generationParams, true);
    Object.keys(base).forEach(key => {
        if (overrides[key].mode === 'on') base[key] = { enabled: true, value: cloneApiGenerationValue(overrides[key].value) };
        if (overrides[key].mode === 'off') base[key] = { enabled: false, value: cloneApiGenerationValue(overrides[key].value) };
    });
    return base;
}

function apiNodeProtocolToProvider(protocol) {
    if (protocol === 'anthropic') return 'claude';
    if (protocol === 'gemini') return 'gemini';
    if (protocol === 'deepseek') return 'deepseek';
    if (protocol === 'ollama') return 'ollama';
    return 'newapi';
}

function apiNodeToConfig(node) {
    if (!node) return null;
    const hasManagedGenerationParams = !!(
        (typeof db !== 'undefined' && db.apiSettings?.generationParams)
        || node.generationParamMode
        || node.generationParams
    );
    return {
        url: node.url || '', key: node.key || '', model: node.model || '',
        provider: apiNodeProtocolToProvider(node.protocol), apiProtocol: node.protocol || 'openai_chat',
        authMode: node.authMode || '', chatEndpoint: node.chatEndpoint || '', modelEndpoint: node.modelEndpoint || '',
        customHeaders: node.customHeaders || '', customBody: node.customBody || '', imageMode: node.imageMode || '',
        streamMode: node.streamMode || '', streamEnabled: typeof node.streamEnabled === 'boolean' ? node.streamEnabled : undefined,
        generationParams: hasManagedGenerationParams ? resolveApiGenerationParams(
            typeof db !== 'undefined' ? db.apiSettings?.generationParams : null,
            node,
            typeof db !== 'undefined' ? db.apiSettings?.temperature : undefined
        ) : null,
        sourceApiNodeId: node.id, sourceApiNodeName: node.name || '', _nodeId: node.id
    };
}

function applyApiNodeRouteParameterMode(config, route) {
    if (!config || !route) return config;
    if (route.parameterMode === 'global') config.generationParams = normalizeApiGenerationParams(db.apiSettings?.generationParams, false, db.apiSettings?.temperature);
    if (route.parameterMode === 'provider') config.generationParams = resolveApiGenerationParams(config.generationParams, { generationParamMode: 'provider' });
    return config;
}

function getApiConfigForFeature(feature, legacyConfig, ownerContext) {
    if (ownerContext && typeof window !== 'undefined' && window.RoleApiBindings) {
        const bound = window.RoleApiBindings.resolve(feature, legacyConfig, ownerContext);
        if (bound) return bound;
    }
    if (feature === 'followUp') feature = 'background';
    const nodes = (typeof db !== 'undefined' && Array.isArray(db.apiNodes))
        ? db.apiNodes.filter(node => node && !node.ownerCharacterId && node.enabled !== false && Array.isArray(node.features) && node.features.includes(feature))
        : [];
    if (nodes.length === 1) return applyApiNodeRouteParameterMode(apiNodeToConfig(nodes[0]), db.apiNodeRoutes?.[feature]);
    if (nodes.length > 1) {
        const route = db.apiNodeRoutes && db.apiNodeRoutes[feature];
        const selected = route && route.primaryNodeId && nodes.find(node => node.id === route.primaryNodeId);
        if (selected) {
            return applyApiNodeRouteParameterMode(apiNodeToConfig(selected), route);
        }
        // A conflict without an explicit user route must not silently pick a node.
        return legacyConfig || null;
    }
    return legacyConfig || null;
}

function getApiFallbackConfigsForFeature(feature, currentNodeId, currentConfig) {
    if (currentConfig?._roleBinding && typeof window !== 'undefined' && window.RoleApiBindings) {
        return window.RoleApiBindings.fallbackConfigs(feature, currentConfig) || [];
    }
    if (typeof db === 'undefined' || !Array.isArray(db.apiNodes)) return [];
    const route = db.apiNodeRoutes && db.apiNodeRoutes[feature];
    if (!route || route.failureMode !== 'automatic') return [];
    return db.apiNodes
        .filter(node => node && !node.ownerCharacterId && node.enabled !== false && node.id !== currentNodeId && Array.isArray(node.features) && node.features.includes(feature))
        .map(node => {
            return applyApiNodeRouteParameterMode(apiNodeToConfig(node), route);
        });
}

function isApiConfigReady(config) {
    if (!config || !config.url || !config.model) return false;
    return !!config.key || config.authMode === 'none' || config.authMode === 'custom';
}

// 通用 AI 响应获取函数 (支持流式和非流式自动切换)
