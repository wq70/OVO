function renderPeekScreen() {
    const peekScreen = document.getElementById('peek-screen');
    const contentArea = peekScreen.querySelector('main.content');

    contentArea.innerHTML = `
        <div class="time-widget">
            <div class="time" id="peek-time-display"></div>
            <div class="date" id="peek-date-display"></div>
        </div>
        <div class="app-grid"></div>
    `;

    const character = db.characters.find(c => c.id === currentChatId);
    const peekSettings = character?.peekScreenSettings || { wallpaper: '', customIcons: {} };

    const wallpaper = peekSettings.wallpaper;
    if (wallpaper) {
        peekScreen.style.backgroundImage = `url(${wallpaper})`;
    } else {
        peekScreen.style.backgroundImage = `url(${db.wallpaper})`; 
    }
    peekScreen.style.backgroundSize = 'cover';
    peekScreen.style.backgroundPosition = 'center';

    const appGrid = contentArea.querySelector('.app-grid');
    Object.keys(peekScreenApps).forEach(id => {
        const iconData = peekScreenApps[id];
        const iconEl = document.createElement('a');
        iconEl.href = '#';
        iconEl.className = 'app-icon';
        iconEl.dataset.peekAppId = id;
        const customIconUrl = peekSettings.customIcons?.[id];
        const iconUrl = customIconUrl || iconData.url;
        iconEl.innerHTML = `
            <img src="${iconUrl}" alt="${iconData.name}" class="icon-img">
            <span class="app-name">${iconData.name}</span>
        `;
        iconEl.addEventListener('click', (e) => {
            e.preventDefault();
            generateAndRenderPeekContent(id);
        });
        appGrid.appendChild(iconEl);
    });

    updateClock();
    window.PeekHistoryUI?.mountHome();
}

function renderPeekChatList(conversations = []) {
    window.PeekHistoryUI?.mountList();
    const container = document.getElementById('peek-chat-list-container');
    const character = db.characters.find(item => item.id === currentChatId);
    container.innerHTML = '';

    if (!conversations || conversations.length === 0) {
        return;
    }

    conversations.forEach((convo) => {
        const history = convo.history || [];
        const lastMessage = history.length > 0 ? history[history.length - 1] : null;
        const lastMessageText = lastMessage ? (lastMessage.content || '').replace(/\[.*?的消息：([\s\S]+)\]/, '$1') : '...';
        
        const li = document.createElement('li');
        li.className = 'list-item chat-item';
        li.dataset.name = convo.partnerName;
        li.dataset.partnerId = convo.partnerId || '';

        const avatarUrl = 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg';

        li.innerHTML = `
            <img src="${avatarUrl}" alt="${peekEscapeHtml(convo.partnerName)}" class="chat-avatar">
            <div class="item-details">
                <div class="item-details-row"><div class="item-name">${peekEscapeHtml(convo.partnerName)}</div></div>
                <div class="item-preview-wrapper">
                    <div class="item-preview">${peekConversationMessageHtml(lastMessage, character, lastMessageText)}</div>
                </div>
            </div>`;
        container.appendChild(li);
    });
}

function renderMemosList(memos) {
    const screen = document.getElementById('peek-memos-screen');
    let listHtml = '';
    if (!memos || memos.length === 0) {
        listHtml = '<p class="placeholder-text">正在生成备忘录...</p>';
    } else {
        memos.forEach(memo => {
            const firstLine = memo.content.split('\n')[0];
            listHtml += `
                <li class="memo-item" data-id="${memo.id}">
                    <h3 class="memo-item-title">${memo.title}</h3>
                    <p class="memo-item-preview">${firstLine}</p>
                </li>
            `;
        });
    }

    screen.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="peek-screen">‹</button>
            <div class="title-container"><h1 class="title">备忘录</h1></div>
            <button class="action-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path></svg></button>
        </header>
        <main class="content"><ul id="peek-memos-list">${listHtml}</ul></main>
    `;

    screen.querySelector('.action-btn').addEventListener('click', () => {
        generateAndRenderPeekContent('memos', { forceRefresh: true });
    });

    screen.querySelectorAll('.memo-item').forEach(item => {
        item.addEventListener('click', () => {
            const memo = memos.find(m => m.id === item.dataset.id); 
    
            if (memo) {
                renderMemoDetail(memo);
                switchScreen('peek-memo-detail-screen');
            }
        });
    });
}

function renderMemoDetail(memo) {
    const screen = document.getElementById('peek-memo-detail-screen');
    if (!memo) return;
    const contentHtml = peekBilingualText(memo.content, memo.content.replace(/\n/g, '<br>'));
    screen.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="peek-memos-screen">‹</button>
            <div class="title-container"><h1 class="title">${memo.title}</h1></div>
            <button class="action-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path></svg></button>
        </header>
        <div class="peek-memo-title-translation">${peekBilingualText(memo.title, '')}</div>
        <main class="content" style="padding: 20px; line-height: 1.6;">${contentHtml}</main>
    `;
}

function renderPeekCart(items) {
    const screen = document.getElementById('peek-cart-screen');
    let itemsHtml = '';
    let totalPrice = 0;

    if (!items || items.length === 0) {
        itemsHtml = '<p class="placeholder-text">正在生成购物车内容...</p>';
    } else {
        items.forEach(item => {
            itemsHtml += `
                <li class="cart-item" data-id="${item.id}">
                    <img src="https://i.postimg.cc/wMbSMvR9/export202509181930036600.png" class="cart-item-image" alt="${item.title}">
                    <div class="cart-item-details">
                        <h3 class="cart-item-title">${peekBilingualText(item.title, item.title)}</h3>
                        <p class="cart-item-spec">规格：${peekBilingualText(item.spec, item.spec)}</p>
                        <p class="cart-item-price">¥${item.price}</p>
                    </div>
                </li>
            `;
            totalPrice += parseFloat(item.price);
        });
    }

    screen.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="peek-screen">‹</button>
            <div class="title-container"><h1 class="title">购物车</h1></div>
            <button class="action-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path></svg></button>
        </header>
        <main class="content"><ul class="cart-item-list">${itemsHtml}</ul></main>
        <footer class="cart-footer">
            <div class="cart-total-price">
                <span class="label">合计：</span>¥${totalPrice.toFixed(2)}
            </div>
            <button class="checkout-btn">结算</button>
        </footer>
    `;
    
    screen.querySelector('.action-btn').addEventListener('click', () => {
        generateAndRenderPeekContent('cart', { forceRefresh: true });
    });
    screen.querySelector('.checkout-btn').addEventListener('click', async () => {
        const char = db.characters.find(c => c.id === currentChatId);
        if (!char) return;

        const cartItems = char.peekData?.cart?.items;
        if (!cartItems || cartItems.length === 0) {
            showToast('购物车是空的');
            return;
        }

        let totalPrice = 0;
        const itemsStrList = [];

        cartItems.forEach(item => {
            totalPrice += parseFloat(item.price);
            itemsStrList.push(`${item.title} x1`);
        });

        const itemsStr = itemsStrList.join(', ');
        const myName = char.myName;
        const realName = char.realName;

        // 清空购物车
        char.peekData.cart.items = [];
        await saveData();
        
        renderPeekCart([]);

        // 跳转回聊天界面
        switchScreen('chat-room-screen');

        // 发送消息
        const input = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-message-btn');

        if (input && sendBtn) {
            // 1. 发送系统提示
            input.value = `[system-display:${myName}帮${realName}清空了ta的购物车]`;
            sendBtn.click();

            // 2. 延迟发送订单消息
            setTimeout(() => {
                input.value = `[${myName}为${realName}下单了：即时送达|${totalPrice.toFixed(2)}|${itemsStr}]`;
                sendBtn.click();
            }, 300);
        }
    });
}

function renderPeekWallet(data) {
    const screen = document.getElementById('peek-wallet-screen');
    if (!screen) return;

    const char = db.characters.find(c => c.id === currentChatId);
    const walletTheme = (char?.peekScreenSettings?.walletTheme === 'default') ? 'default' : 'ins';

    const ledger = char?.walletLedger && typeof char.walletLedger === 'object' ? char.walletLedger : { balance: null, transactions: [] };
    const realTransactions = Array.isArray(ledger.transactions) ? ledger.transactions : [];
    const hasRealWalletData = realTransactions.length > 0 || typeof ledger.balance === 'number';
    const hasWalletData = !!data || hasRealWalletData;
    const summary = data?.summary || {};
    const generatedIncome = Array.isArray(data?.income) ? data.income : [];
    const generatedExpense = Array.isArray(data?.expense) ? data.expense : [];
    const formatLedgerItem = item => ({
        amount: item.amount,
        remark: item.remark || (item.source === 'family_card' ? '亲属卡支出' : '钱包交易'),
        time: item.time ? new Date(item.time).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '',
        source: '真实流水',
        eventId: item.eventId || item.id
    });
    const realIncome = realTransactions.filter(item => item.type === 'income').map(formatLedgerItem);
    const realExpense = realTransactions.filter(item => item.type === 'expense').map(formatLedgerItem);
    const mergeWalletItems = (realItems, generatedItems) => {
        const result = [...realItems];
        generatedItems.forEach(item => {
            const amount = Number(item?.amount);
            const remark = String(item?.remark || '').trim();
            const duplicate = result.some(existing => Number(existing.amount) === amount && String(existing.remark || '').trim() === remark);
            if (!duplicate) result.push(item);
        });
        return result;
    };
    const income = mergeWalletItems(realIncome, generatedIncome);
    const expense = mergeWalletItems(realExpense, generatedExpense);

    const balanceStr = typeof ledger.balance === 'number' ? ledger.balance.toFixed(2) : (summary.balance != null ? String(summary.balance) : '—');
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const realMonthIncome = realTransactions.filter(item => item.type === 'income' && Number(item.time || 0) >= monthStart.getTime()).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const realMonthExpense = realTransactions.filter(item => item.type === 'expense' && Number(item.time || 0) >= monthStart.getTime()).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const monthIncomeStr = summary.monthIncome != null ? String(summary.monthIncome) : (realTransactions.length ? realMonthIncome.toFixed(2) : '—');
    const monthExpenseStr = summary.monthExpense != null ? String(summary.monthExpense) : (realTransactions.length ? realMonthExpense.toFixed(2) : '—');

    let listHtml = '';
    if (!hasWalletData) {
        listHtml = '<p class="placeholder-text">正在生成账单...</p>';
    } else {
        const renderList = (items, type) => {
            if (!items || items.length === 0) {
                return '<p class="wallet-empty-hint">暂无记录</p>';
            }
            return '<ul class="wallet-list">' + items.map(item => {
                const amt = item.amount != null ? item.amount : '';
                const remark = peekBilingualText(item.remark != null ? item.remark : '');
                const time = peekEscapeHtml(item.time != null ? item.time : '');
                return `<li class="wallet-list-item">
                    <div class="left">
                        <div class="remark">${remark || '—'}</div>
                        <div class="meta">${time}</div>
                    </div>
                    <span class="amount ${type}">${type === 'income' ? '+' : '-'}¥${amt}</span>
                </li>`;
            }).join('') + '</ul>';
        };
        const familyCard = (db.piggyBank && db.piggyBank.familyCards) ? db.piggyBank.familyCards.find(c => c.targetCharId === currentChatId && c.status === 'active') : null;
        const fcTx = familyCard && familyCard.transactions ? familyCard.transactions : [];
        const fcListHtml = fcTx.length === 0 ? '<p class="wallet-empty-hint">暂无消费记录</p>' : '<ul class="wallet-list">' + fcTx.map(t => {
            const amt = t.amount != null ? t.amount : '';
            const remark = peekEscapeHtml((t.scene || '') + (t.detail ? ' ' + t.detail : ''));
            const time = t.time ? new Date(t.time).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
            return `<li class="wallet-list-item"><div class="left"><div class="remark">${remark || '—'}</div><div class="meta">${time}</div></div><span class="amount expense">-¥${amt}</span></li>`;
        }).join('') + '</ul>';
        listHtml = `
            <div class="wallet-tabs">
                <button type="button" class="wallet-tab active" data-wallet-tab="income">收入</button>
                <button type="button" class="wallet-tab" data-wallet-tab="expense">支出</button>
                <button type="button" class="wallet-tab" data-wallet-tab="familycard">亲属卡</button>
            </div>
            <div class="wallet-tab-panel" data-panel="income">${renderList(income, 'income')}</div>
            <div class="wallet-tab-panel" data-panel="expense" style="display:none;">${renderList(expense, 'expense')}</div>
            <div class="wallet-tab-panel" data-panel="familycard" style="display:none;">${familyCard ? ('<p class="wallet-summary-label" style="margin-bottom:8px;">' + peekEscapeHtml(familyCard.bankName || '亲属卡') + ' 剩余 ' + Math.max(0, familyCard.limit - (familyCard.usedAmount || 0)) + '</p>' + fcListHtml) : '<p class="wallet-empty-hint">暂无亲属卡</p>'}</div>
        `;
    }

    screen.setAttribute('data-wallet-theme', walletTheme);
    const sunSvg = `<svg class="wallet-header-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;
    const refreshSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path></svg>`;
    screen.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="peek-screen">‹</button>
            <div class="title-container"><h1 class="title">钱包</h1></div>
            <div class="action-btn-group">
                <button class="action-btn" id="peek-wallet-theme-btn" title="切换账单样式">${sunSvg}</button>
                <button class="action-btn" id="peek-wallet-refresh-btn" title="刷新">${refreshSvg}</button>
            </div>
        </header>
        <main class="content wallet-content">
            <div class="wallet-summary-cards">
                <div class="wallet-summary-card balance">
                    <div class="wallet-summary-label">当前余额</div>
                    <div class="wallet-summary-value">${hasWalletData ? peekEscapeHtml(balanceStr) : '—'}</div>
                </div>
                <div class="wallet-summary-card">
                    <div class="wallet-summary-label">本月收入</div>
                    <div class="wallet-summary-value income">${hasWalletData ? peekEscapeHtml(monthIncomeStr) : '—'}</div>
                </div>
                <div class="wallet-summary-card">
                    <div class="wallet-summary-label">本月支出</div>
                    <div class="wallet-summary-value expense">${hasWalletData ? peekEscapeHtml(monthExpenseStr) : '—'}</div>
                </div>
            </div>
            ${listHtml}
        </main>
    `;

    const refreshBtn = document.getElementById('peek-wallet-refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => generateAndRenderPeekContent('wallet', { forceRefresh: true }));
    }

    const themeBtn = document.getElementById('peek-wallet-theme-btn');
    if (themeBtn) {
        themeBtn.addEventListener('click', async () => {
            const c = db.characters.find(c => c.id === currentChatId);
            if (!c) return;
            if (!c.peekScreenSettings) c.peekScreenSettings = {};
            const next = (c.peekScreenSettings.walletTheme === 'ins') ? 'default' : 'ins';
            c.peekScreenSettings.walletTheme = next;
            await saveData();
            screen.setAttribute('data-wallet-theme', next);
            showToast(next === 'ins' ? '已切换为简约风格' : '已切换为经典风格');
        });
    }

    screen.querySelectorAll('.wallet-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            screen.querySelectorAll('.wallet-tab').forEach(t => t.classList.remove('active'));
            screen.querySelectorAll('.wallet-tab-panel').forEach(p => p.style.display = 'none');
            tab.classList.add('active');
            const panel = screen.querySelector('.wallet-tab-panel[data-panel="' + tab.dataset.walletTab + '"]');
            if (panel) panel.style.display = 'block';
        });
    });
}

function renderPeekTransferStation(entries) {
    const screen = document.getElementById('peek-transfer-station-screen');
    let messagesHtml = '';

    if (!entries || entries.length === 0) {
        messagesHtml = '<p class="placeholder-text">正在生成中转站内容...</p>';
    } else {
        entries.forEach(entry => {
            messagesHtml += `
                <div class="message-wrapper sent">
                    <div class="message-bubble-row">
                        <div class="message-bubble sent" style="background-color: #98E165; color: #000;">${peekBilingualText(entry, entry)}</div>
                    </div>
                </div>
            `;
        });
    }

    screen.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="peek-screen">‹</button>
            <div class="title-container">
                <h1 class="title">文件传输助手</h1>
            </div>
            <button class="action-btn">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path></svg>
            </button>
        </header>
        <main class="content">
            <div class="message-area" style="padding: 10px;">
                ${messagesHtml}
            </div>
            <div class="transfer-station-input-area">
                <div class="fake-input"></div>
                <button class="plus-btn"></button>
            </div>
        </main>
    `;
    
    screen.querySelector('.action-btn').addEventListener('click', () => {
        generateAndRenderPeekContent('transfer', { forceRefresh: true });
    });

    const messageArea = screen.querySelector('.message-area');
    if (messageArea) {
        messageArea.scrollTop = messageArea.scrollHeight;
    }
}

function renderPeekBrowser(historyItems) {
    const screen = document.getElementById('peek-browser-screen');
    let itemsHtml = '';
    if (!historyItems || historyItems.length === 0) {
        itemsHtml = '<p class="placeholder-text">正在生成浏览记录...</p>';
    } else {
        historyItems.forEach((item, index) => {
            const hasDetail = item.detail ? ' has-detail' : '';
            itemsHtml += `
                <li class="browser-history-item${hasDetail}" data-index="${index}">
                    <h3 class="history-item-title">${peekEscapeHtml(item.title)}</h3>
                    <p class="history-item-url">${peekEscapeHtml(item.url)}</p>
                    <div class="history-item-annotation">${peekBilingualText(item.annotation)}</div>
                </li>
            `;
        });
    }

    screen.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="peek-screen">‹</button>
            <div class="title-container"><h1 class="title">浏览器</h1></div>
            <button class="action-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path></svg></button>
        </header>
        <main class="content"><ul class="browser-history-list">${itemsHtml}</ul></main>
    `;
    screen.querySelector('.action-btn').addEventListener('click', () => {
        generateAndRenderPeekContent('browser', { forceRefresh: true });
    });

    if (historyItems && historyItems.length > 0) {
        screen.querySelectorAll('.browser-history-item.has-detail').forEach(el => {
            el.style.cursor = 'pointer';
            el.addEventListener('click', () => {
                const idx = parseInt(el.dataset.index, 10);
                const item = historyItems[idx];
                if (item && item.detail) {
                    renderBrowserDetail(item);
                    switchScreen('peek-browser-detail-screen');
                }
            });
        });
    }
}

function renderBrowserDetail(item) {
    const screen = document.getElementById('peek-browser-detail-screen');
    if (!screen) return;
    screen.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="peek-browser-screen">‹</button>
            <div class="title-container"><h1 class="title">${peekEscapeHtml(item.title)}</h1></div>
        </header>
        <main class="content browser-detail-content">
            <p class="browser-detail-url">${peekEscapeHtml(item.url)}</p>
            <div class="browser-detail-body">${item.detail}</div>
            <div class="browser-detail-annotation">${peekBilingualText(item.annotation)}</div>
        </main>
    `;
}

function renderPeekDrafts(draft) {
    const screen = document.getElementById('peek-drafts-screen');
    let draftTo = '...';
    let draftContent = '<p class="placeholder-text">正在生成草稿...</p>';

    if (draft) {
        draftTo = draft.to;
        const draftHtml = draft.content;
        const draftPlainText = new DOMParser().parseFromString(draft.content, 'text/html').body.textContent || '';
        draftContent = peekBilingualText(draftPlainText, draftHtml);
    }
    
    screen.innerHTML = `
        <header class="app-header">
            <button class="back-btn" data-target="peek-screen">‹</button>
            <div class="title-container"><h1 class="title">草稿箱</h1></div>
            <button class="action-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path></svg></button>
        </header>
        <main class="content">
            <div class="draft-paper">
                <div class="draft-to">To: ${draftTo}</div>
                <div class="draft-content">${draftContent}</div>
            </div>
        </main>
    `;
    screen.querySelector('.action-btn').addEventListener('click', () => {
        generateAndRenderPeekContent('drafts', { forceRefresh: true });
    });
}

function renderPeekSteps(data) {
    const screen = document.getElementById('peek-steps-screen');
    const char = db.characters.find(c => c.id === currentChatId);
    if (!char) return; 

    const avatarEl = screen.querySelector('#steps-char-avatar');
    const nameEl = screen.querySelector('#steps-char-name');
    const currentStepsEl = screen.querySelector('#steps-current-count');
    const goalStepsEl = screen.querySelector('.steps-label');
    const progressRingEl = screen.querySelector('#steps-progress-ring');
    const trackListEl = screen.querySelector('#activity-track-list');
    const annotationEl = screen.querySelector('#steps-annotation-content');

    avatarEl.src = char.avatar;
    nameEl.textContent = char.realName;
    goalStepsEl.textContent = '/ 6000 步';

    if (!data) {
        currentStepsEl.textContent = '----';
        trackListEl.innerHTML = '<li class="activity-track-item">正在生成活动轨迹...</li>';
        annotationEl.textContent = '正在生成角色批注...';
        progressRingEl.style.setProperty('--steps-percentage', 0);
        return;
    }

    currentStepsEl.textContent = data.currentSteps;
    
    const percentage = (data.currentSteps / 6000) * 100;
    progressRingEl.style.setProperty('--steps-percentage', percentage);

    trackListEl.innerHTML = data.trajectory.map(item => `<li class="activity-track-item">${peekBilingualText(item)}</li>`).join('');
    annotationEl.innerHTML = peekBilingualText(data.annotation);
}

function extractTransfersFromHistory(history, realName, myName) {
    const privateReceivedTransferRegex = /\[.*?的转账[：:]([\d.,]+)元[；;]备注[：:](.*?)\]/;
    const privateSentTransferRegex = /\[.*?给你转账[：:]([\d.,]+)元[；;]备注[：:](.*?)\]/;
    const income = [];
    const expense = [];
    const arr = history || [];
    for (let i = 0; i < arr.length; i++) {
        const m = arr[i];
        const content = m.content || '';
        const time = m.timestamp ? new Date(m.timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        let match = content.match(privateReceivedTransferRegex);
        if (match && (m.role === 'assistant' || m.role === 'char')) {
            expense.push({ amount: match[1], remark: (match[2] || '').trim(), time, source: '聊天记录' });
        }
        match = content.match(privateSentTransferRegex);
        if (match && m.role === 'user') {
            income.push({ amount: match[1], remark: (match[2] || '').trim(), time, source: '聊天记录' });
        }
        // 用户商城购买送给角色的订单不计入角色钱包收支（钱是用户出的，角色只收到礼物）
        if (realName && myName) {
            // 角色同意用户的代付请求 → 角色支出
            if (m.role === 'assistant' && content.includes('同意了') && content.includes('的代付请求')) {
                const agreedMatch = content.match(new RegExp(`\\[([^\\]]+?)同意了([^\\]]+?)的代付请求\\]`));
                if (agreedMatch && agreedMatch[1].trim() === realName && agreedMatch[2].trim() === myName) {
                    for (let j = i - 1; j >= 0; j--) {
                        const prev = arr[j];
                        if (prev.role === 'user' && prev.content && prev.content.includes('发起了代付请求')) {
                            const amtMatch = prev.content.match(/发起了代付请求[：:]([\d.]+)\|/);
                            if (amtMatch) {
                                expense.push({ amount: amtMatch[1], remark: '代付给用户', time, source: '聊天记录' });
                            }
                            break;
                        }
                    }
                }
            }
            // 用户同意角色的代付请求 → 角色收入
            if (m.role === 'user' && content.includes('同意了') && content.includes('的代付请求')) {
                const agreedMatch = content.match(new RegExp(`\\[([^\\]]+?)同意了([^\\]]+?)的代付请求\\]`));
                if (agreedMatch && agreedMatch[1].trim() === myName && agreedMatch[2].trim() === realName) {
                    for (let j = i - 1; j >= 0; j--) {
                        const prev = arr[j];
                        if (prev.role === 'assistant' && prev.content && prev.content.includes('发起了代付请求')) {
                            const amtMatch = prev.content.match(/发起了代付请求[：:]([\d.]+)\|/);
                            if (amtMatch) {
                                income.push({ amount: amtMatch[1], remark: '用户代付', time, source: '聊天记录' });
                            }
                            break;
                        }
                    }
                }
            }
        }
    }
    return { income, expense };
}
