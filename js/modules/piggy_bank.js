/**
 * 存钱罐（用户钱包）模块
 * - 默认余额 520 元，可存入、修改余额
 * - 转账支出从余额扣减，收款/退回记入收入
 * - 亲属卡：用户/角色互赠，额度上限，消费从存钱罐扣
 */

const FAMILY_CARD_COLORS = ['#1a1a2e', '#16213e', '#0f3460', '#2d132c', '#1b262c', '#2c3e50'];

function getPeriodMs(period, customDays) {
    const day = 24 * 60 * 60 * 1000;
    if (period === 'daily') return day;
    if (period === 'weekly') return 7 * day;
    if (period === 'monthly') return 30 * day;
    if (period === 'custom' && customDays > 0) return customDays * day;
    return 30 * day;
}

function refreshFamilyCardLimits() {
    if (!db.piggyBank) return;
    const now = Date.now();
    (db.piggyBank.familyCards || []).forEach(card => {
        if (card.status !== 'active') return;
        const periodMs = getPeriodMs(card.refreshPeriod, card.refreshDays || 30);
        if (card.nextRefreshTime && now >= card.nextRefreshTime) {
            card.usedAmount = 0;
            card.lastRefreshTime = now;
            card.nextRefreshTime = now + periodMs;
        }
    });
    (db.piggyBank.receivedFamilyCards || []).forEach(card => {
        if (card.status !== 'active') return;
        const periodMs = getPeriodMs(card.refreshPeriod, card.refreshDays || 30);
        if (card.nextRefreshTime && now >= card.nextRefreshTime) {
            card.usedAmount = 0;
            card.lastRefreshTime = now;
            card.nextRefreshTime = now + periodMs;
        }
    });
}

function getFamilyCardById(cardId, isReceived) {
    if (!db.piggyBank) return null;
    if (isReceived) return (db.piggyBank.receivedFamilyCards || []).find(c => c.id === cardId);
    return (db.piggyBank.familyCards || []).find(c => c.id === cardId);
}

function createFamilyCard(opts) {
    if (!db.piggyBank) db.piggyBank = { balance: 520, transactions: [], familyCards: [], receivedFamilyCards: [] };
    if (!Array.isArray(db.piggyBank.familyCards)) db.piggyBank.familyCards = [];
    const id = 'fc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const periodMs = getPeriodMs(opts.refreshPeriod || 'monthly', opts.refreshDays || 30);
    const now = Date.now();
    const card = {
        id,
        bankName: String(opts.bankName || '').trim() || '亲属卡',
        cardNumber: String(Math.floor(1000 + Math.random() * 9000)),
        cardHolder: opts.cardHolder || '',
        cardColor: opts.cardColor || FAMILY_CARD_COLORS[Math.floor(Math.random() * FAMILY_CARD_COLORS.length)],
        cardCover: String(opts.cardCover || '').trim() || '',
        targetCharId: opts.targetCharId || '',
        targetCharName: opts.targetCharName || '',
        limit: Math.max(1, Number(opts.limit) || 5000),
        usedAmount: 0,
        refreshPeriod: opts.refreshPeriod || 'monthly',
        refreshDays: opts.refreshDays || 30,
        lastRefreshTime: now,
        nextRefreshTime: now + periodMs,
        status: 'active',
        statusChangedBy: '',
        notifyOnCharge: false,
        createdTime: now,
        transactions: []
    };
    db.piggyBank.familyCards.push(card);
    return card;
}

function createReceivedFamilyCard(opts) {
    if (!db.piggyBank) db.piggyBank = { balance: 520, transactions: [], familyCards: [], receivedFamilyCards: [] };
    if (!Array.isArray(db.piggyBank.receivedFamilyCards)) db.piggyBank.receivedFamilyCards = [];
    const id = 'rfc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const periodMs = getPeriodMs(opts.refreshPeriod || 'monthly', opts.refreshDays || 30);
    const now = Date.now();
    const card = {
        id,
        bankName: String(opts.bankName || '').trim() || '亲属卡',
        cardNumber: String(Math.floor(1000 + Math.random() * 9000)),
        cardHolder: opts.fromCharName || '',
        cardColor: opts.cardColor || FAMILY_CARD_COLORS[Math.floor(Math.random() * FAMILY_CARD_COLORS.length)],
        cardCover: String(opts.cardCover || '').trim() || '',
        fromCharId: opts.fromCharId || '',
        fromCharName: opts.fromCharName || '',
        limit: Math.max(1, Number(opts.limit) || 5000),
        usedAmount: 0,
        refreshPeriod: opts.refreshPeriod || 'monthly',
        refreshDays: opts.refreshDays || 30,
        lastRefreshTime: now,
        nextRefreshTime: now + periodMs,
        status: 'active',
        statusChangedBy: '',
        receivedTime: now,
        transactions: []
    };
    db.piggyBank.receivedFamilyCards.push(card);
    return card;
}

function getPiggyBalance() {
    if (!db.piggyBank || typeof db.piggyBank.balance !== 'number') return 520;
    return db.piggyBank.balance;
}

function setPiggyBalance(value) {
    if (!db.piggyBank) db.piggyBank = { balance: 520, transactions: [] };
    db.piggyBank.balance = Math.max(0, Number(value));
}

/**
 * 按 id 删除多条收支记录，并反向调整余额
 * @param {string[]} ids - 要删除的记录 id 数组
 * @returns {number} 实际删除条数
 */
function deletePiggyTransactions(ids) {
    if (!db.piggyBank || !Array.isArray(db.piggyBank.transactions)) return 0;
    const idSet = new Set(ids);
    const toRemove = db.piggyBank.transactions.filter(t => idSet.has(t.id));
    toRemove.forEach(t => {
        if (t.type === 'income') db.piggyBank.balance -= t.amount;
        else db.piggyBank.balance += t.amount;
    });
    db.piggyBank.transactions = db.piggyBank.transactions.filter(t => !idSet.has(t.id));
    db.piggyBank.balance = Math.max(0, db.piggyBank.balance);
    return toRemove.length;
}

/**
 * 添加一条收支记录并更新余额
 * @param {Object} opts - { type: 'income'|'expense', amount: number, remark: string, source?: string, charName?: string }
 */
function addPiggyTransaction(opts) {
    if (!db.piggyBank) db.piggyBank = { balance: 520, transactions: [] };
    if (!Array.isArray(db.piggyBank.transactions)) db.piggyBank.transactions = [];
    const amount = Math.max(0, Number(opts.amount)) || 0;
    if (amount <= 0) return;
    const record = {
        id: 'pb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        type: opts.type === 'expense' ? 'expense' : 'income',
        amount,
        remark: String(opts.remark || '').trim() || (opts.type === 'income' ? '收入' : '支出'),
        time: Date.now(),
        source: opts.source || '用户',
        charName: opts.charName || ''
    };
    db.piggyBank.transactions.unshift(record);
    if (record.type === 'income') db.piggyBank.balance += amount;
    else db.piggyBank.balance -= amount;
    db.piggyBank.balance = Math.max(0, db.piggyBank.balance);
}

function renderPiggyBankScreen() {
    refreshFamilyCardLimits();
    const balanceEl = document.getElementById('piggy-bank-balance-display');
    const listEl = document.getElementById('piggy-bank-transaction-list');
    const emptyEl = document.getElementById('piggy-bank-empty-hint');
    const screen = document.getElementById('piggy-bank-screen');
    if (!balanceEl || !listEl) return;

    const balance = getPiggyBalance();
    balanceEl.textContent = (balance % 1 === 0 ? balance : balance.toFixed(2)).toString();

    const isDeleteMode = screen && screen.classList.contains('piggy-bank-delete-mode');
    const filter = (document.querySelector('.piggy-tab.active') || {}).dataset?.piggyTab || 'all';
    let transactions = (db.piggyBank && db.piggyBank.transactions) ? [...db.piggyBank.transactions] : [];
    if (filter === 'income') transactions = transactions.filter(t => t.type === 'income');
    else if (filter === 'expense') transactions = transactions.filter(t => t.type === 'expense');

    listEl.innerHTML = '';
    if (transactions.length === 0) {
        emptyEl.style.display = 'block';
        return;
    }
    emptyEl.style.display = 'none';
    transactions.forEach(t => {
        const li = document.createElement('li');
        li.className = 'piggy-bank-list-item';
        li.dataset.id = t.id;
        const timeStr = t.time ? new Date(t.time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
        const remark = (t.remark || (t.type === 'income' ? '收入' : '支出')) + (t.charName ? ` · ${t.charName}` : '');
        const checkboxHtml = isDeleteMode
            ? `<label class="piggy-item-checkbox-wrap"><input type="checkbox" class="piggy-item-checkbox" data-id="${t.id}"></label>`
            : '';
        li.innerHTML = `
            ${checkboxHtml}
            <div class="piggy-item-left">
                <div class="piggy-item-remark">${escapeHtml(remark)}</div>
                <div class="piggy-item-meta">${escapeHtml(timeStr)} ${t.source ? ' · ' + escapeHtml(t.source) : ''}</div>
            </div>
            <span class="piggy-item-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${formatMoney(t.amount)}</span>
        `;
        listEl.appendChild(li);
    });
    renderFamilyCardList();
}

function renderFamilyCardList() {
    const container = document.getElementById('family-card-list-container');
    if (!container) return;
    const sent = (db.piggyBank && db.piggyBank.familyCards) ? db.piggyBank.familyCards : [];
    const received = (db.piggyBank && db.piggyBank.receivedFamilyCards) ? db.piggyBank.receivedFamilyCards : [];
    const all = sent.map(c => ({ ...c, isReceived: false })).concat(received.map(c => ({ ...c, isReceived: true })));
    container.innerHTML = '';
    all.forEach(card => {
        const remaining = Math.max(0, card.limit - (card.usedAmount || 0));
        const statusClass = card.status === 'frozen' ? 'frozen' : card.status === 'revoked' ? 'revoked' : '';
        const statusText = card.status === 'frozen' ? '已冻结' : card.status === 'revoked' ? '已收回' : '';
        const typeText = card.isReceived ? ('来自 ' + (card.fromCharName || '')) : ('赠予 ' + (card.targetCharName || ''));
        const mini = document.createElement('div');
        mini.className = 'family-card-mini' + (statusClass ? ' ' + statusClass : '');
        mini.dataset.cardId = card.id;
        mini.dataset.received = card.isReceived ? '1' : '0';
        const hasCover = (card.cardCover || '').trim().length > 0;
        mini.innerHTML = `
            <div class="mini-card-face${hasCover ? ' has-cover' : ''}" style="${getCardFaceStyle(card)}">
                <div class="mini-card-bank">${escapeHtml(card.bankName || '亲属卡')}</div>
                <div class="mini-card-type">${escapeHtml(typeText)}</div>
                <div class="mini-card-number">**** ${escapeHtml(card.cardNumber)}</div>
                <div class="mini-card-balance">剩余 ${formatMoney(remaining)}</div>
                ${statusText ? '<div class="mini-card-status-badge ' + statusClass + '">' + escapeHtml(statusText) + '</div>' : ''}
            </div>`;
        mini.addEventListener('click', () => openFamilyCardDetail(card.id, !!card.isReceived));
        container.appendChild(mini);
    });
}

function openFamilyCardDetail(cardId, isReceived) {
    const card = getFamilyCardById(cardId, isReceived);
    if (!card) return;
    const remaining = Math.max(0, card.limit - (card.usedAmount || 0));
    const periodText = card.refreshPeriod === 'daily' ? '每天' : card.refreshPeriod === 'weekly' ? '每周' : card.refreshPeriod === 'monthly' ? '每月' : (card.refreshDays || 30) + '天';
    const nextRefresh = card.nextRefreshTime ? new Date(card.nextRefreshTime).toLocaleDateString('zh-CN') : '-';
    const statusText = card.status === 'active' ? '正常' : card.status === 'frozen' ? '已冻结' : '已收回';
    const content = document.getElementById('family-card-detail-content');
    if (!content) return;
    const hasCover = (card.cardCover || '').trim().length > 0;
    content.innerHTML = `
        <div class="family-card-detail-face${hasCover ? ' has-cover' : ''}" style="${getCardFaceStyle(card)}">
            <div class="family-card-detail-bank">${escapeHtml(card.bankName || '亲属卡')}</div>
            <div class="family-card-detail-limit">${formatMoney(remaining)} / ${formatMoney(card.limit)}</div>
            <div class="family-card-detail-number">**** **** **** ${escapeHtml(card.cardNumber)}</div>
            <div class="family-card-detail-holder">持卡人：${escapeHtml(isReceived ? (card.fromCharName || '') : (card.targetCharName || ''))}</div>
        </div>
        <div class="family-card-detail-info">
            <p>刷新周期：${escapeHtml(periodText)}</p>
            <p>下次刷新：${escapeHtml(nextRefresh)}</p>
            <p>状态：${escapeHtml(statusText)}</p>
        </div>
        ${!isReceived && card.status === 'active' ? `
        <div class="family-card-detail-actions">
            <button type="button" class="btn btn-neutral btn-small" id="fc-detail-adjust-btn">调整额度</button>
            <button type="button" class="btn btn-neutral btn-small" id="fc-detail-freeze-btn">冻结</button>
            <button type="button" class="btn btn-danger btn-small" id="fc-detail-revoke-btn">收回</button>
        </div>
        <div class="form-group" style="margin-top:12px;">
            <label class="kkt-switch"><input type="checkbox" id="fc-detail-notify"> <span class="kkt-slider"></span></label>
            <span>扣费通知</span>
        </div>
        ` : ''}
        ${isReceived && card.status === 'active' ? `
        <div class="form-group" style="margin-top:12px;">
            <label class="kkt-switch"><input type="checkbox" id="fc-detail-notify" disabled> <span class="kkt-slider"></span></label>
            <span>扣费通知（由发卡方设置）</span>
        </div>
        ` : ''}
        <div class="family-card-detail-transactions">
            <h4>消费记录</h4>
            <ul class="piggy-bank-list" id="fc-detail-transaction-list"></ul>
            <p class="piggy-bank-empty" id="fc-detail-empty" style="display:none;">暂无记录</p>
        </div>`;
    const txList = content.querySelector('#fc-detail-transaction-list');
    const emptyEl = content.querySelector('#fc-detail-empty');
    const txs = (card.transactions || []).slice(0, 50);
    if (txList) {
        txList.innerHTML = '';
        if (txs.length === 0) {
            if (emptyEl) emptyEl.style.display = 'block';
        } else {
            if (emptyEl) emptyEl.style.display = 'none';
            txs.forEach(t => {
                const li = document.createElement('li');
                li.className = 'piggy-bank-list-item';
                const timeStr = t.time ? new Date(t.time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
                li.innerHTML = `
                    <div class="piggy-item-left">
                        <div class="piggy-item-remark">${escapeHtml(t.scene || '')} ${escapeHtml(t.detail || '')}</div>
                        <div class="piggy-item-meta">${escapeHtml(timeStr)}</div>
                    </div>
                    <span class="piggy-item-amount expense">-${formatMoney(t.amount)}</span>`;
                txList.appendChild(li);
            });
        }
    }
    const notifyCb = content.querySelector('#fc-detail-notify');
    if (notifyCb && !card.isReceived) notifyCb.checked = !!card.notifyOnCharge;
    content.querySelector('#fc-detail-adjust-btn') && content.querySelector('#fc-detail-adjust-btn').addEventListener('click', () => {
        const val = prompt('输入新额度（元）', String(card.limit));
        if (val === null) return;
        const n = parseInt(val, 10);
        if (isNaN(n) || n < 0) { showToast('请输入有效金额'); return; }
        card.limit = n;
        card.statusChangedBy = 'user';
        if (typeof saveData === 'function') saveData();
        showToast('额度已调整');
        openFamilyCardDetail(cardId, isReceived);
    });
    content.querySelector('#fc-detail-freeze-btn') && content.querySelector('#fc-detail-freeze-btn').addEventListener('click', () => {
        card.status = 'frozen';
        card.statusChangedBy = 'user';
        if (typeof saveData === 'function') saveData();
        showToast('已冻结');
        openFamilyCardDetail(cardId, isReceived);
    });
    content.querySelector('#fc-detail-revoke-btn') && content.querySelector('#fc-detail-revoke-btn').addEventListener('click', () => {
        if (!confirm('确定收回这张亲属卡？')) return;
        card.status = 'revoked';
        card.statusChangedBy = 'user';
        if (typeof saveData === 'function') saveData();
        showToast('已收回');
        switchScreen('piggy-bank-screen');
        if (typeof renderPiggyBankScreen === 'function') renderPiggyBankScreen();
    });
    if (notifyCb && !card.isReceived) notifyCb.addEventListener('change', () => { card.notifyOnCharge = notifyCb.checked; if (typeof saveData === 'function') saveData(); });
    switchScreen('family-card-detail-screen');
}

function formatMoney(n) {
    const num = Number(n);
    if (num % 1 === 0) return num.toString();
    return num.toFixed(2);
}

function escapeHtml(s) {
    if (!s) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

/** 生成卡面样式：有封面用背景图，否则用背景色。封面 URL 需转义后放入 style */
function getCardFaceStyle(card) {
    const color = escapeHtml(card.cardColor || '#1a1a2e');
    const cover = (card.cardCover || '').trim();
    if (!cover) return 'background-color:' + color;
    const safe = cover.replace(/\\/g, '\\\\').replace(/'/g, "\\27");
    return 'background-image:url(\'' + safe + '\');background-size:cover;background-position:center;background-color:' + color;
}

function setupPiggyBankApp() {
    const screen = document.getElementById('piggy-bank-screen');
    const addBtn = document.getElementById('piggy-bank-add-btn');
    const editBtn = document.getElementById('piggy-bank-edit-btn');
    const modal = document.getElementById('piggy-bank-balance-modal');
    const form = document.getElementById('piggy-bank-balance-form');
    const modalTitle = document.getElementById('piggy-bank-modal-title');
    const amountInput = document.getElementById('piggy-bank-amount-input');
    const remarkInput = document.getElementById('piggy-bank-remark-input');
    const remarkGroup = document.getElementById('piggy-bank-remark-group');
    const cancelBtn = document.getElementById('piggy-bank-modal-cancel');
    const submitBtn = document.getElementById('piggy-bank-modal-submit');

    let balanceModalMode = 'add'; // 'add' | 'set'

    function openModal(mode) {
        balanceModalMode = mode;
        modalTitle.textContent = mode === 'set' ? '修改余额' : '存入';
        remarkGroup.style.display = mode === 'set' ? 'none' : 'block';
        amountInput.value = '';
        remarkInput.value = '';
        if (modal) modal.classList.add('visible');
    }

    function closeModal() {
        if (modal) modal.classList.remove('visible');
    }

    addBtn && addBtn.addEventListener('click', () => openModal('add'));
    editBtn && editBtn.addEventListener('click', () => openModal('set'));
    cancelBtn && cancelBtn.addEventListener('click', closeModal);

    form && form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const raw = amountInput.value.trim().replace(',', '.');
        const amount = parseFloat(raw);
        if (isNaN(amount) || amount < 0) {
            showToast('请输入有效金额');
            return;
        }
        if (balanceModalMode === 'set') {
            setPiggyBalance(amount);
            showToast('余额已修改');
        } else {
            if (amount === 0) {
                showToast('请输入大于 0 的金额');
                return;
            }
            addPiggyTransaction({ type: 'income', amount, remark: remarkInput.value.trim() || '存入', source: '用户' });
            showToast('存入成功');
        }
        closeModal();
        await saveData();
        renderPiggyBankScreen();
    });

    document.querySelectorAll('.piggy-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.piggy-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderPiggyBankScreen();
        });
    });

    const deleteBtn = document.getElementById('piggy-bank-delete-btn');
    const deleteToolbar = document.getElementById('piggy-bank-delete-toolbar');
    const selectAllBtn = document.getElementById('piggy-bank-select-all-btn');
    const deleteSelectedBtn = document.getElementById('piggy-bank-delete-selected-btn');
    const deleteCancelBtn = document.getElementById('piggy-bank-delete-cancel-btn');

    function exitDeleteMode() {
        if (screen) screen.classList.remove('piggy-bank-delete-mode');
        if (deleteToolbar) deleteToolbar.style.display = 'none';
        renderPiggyBankScreen();
    }

    deleteBtn && deleteBtn.addEventListener('click', () => {
        if (!screen) return;
        const isDeleteMode = screen.classList.contains('piggy-bank-delete-mode');
        if (isDeleteMode) {
            exitDeleteMode();
            return;
        }
        screen.classList.add('piggy-bank-delete-mode');
        if (deleteToolbar) deleteToolbar.style.display = 'flex';
        renderPiggyBankScreen();
    });

    selectAllBtn && selectAllBtn.addEventListener('click', () => {
        const list = document.getElementById('piggy-bank-transaction-list');
        if (!list) return;
        const checkboxes = list.querySelectorAll('.piggy-item-checkbox');
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        checkboxes.forEach(cb => { cb.checked = !allChecked; });
        selectAllBtn.textContent = allChecked ? '全选' : '取消全选';
    });

    deleteSelectedBtn && deleteSelectedBtn.addEventListener('click', async () => {
        const list = document.getElementById('piggy-bank-transaction-list');
        if (!list) return;
        const checked = list.querySelectorAll('.piggy-item-checkbox:checked');
        const ids = Array.from(checked).map(cb => cb.dataset.id).filter(Boolean);
        if (ids.length === 0) {
            if (typeof showToast === 'function') showToast('请先勾选要删除的记录');
            return;
        }
        if (!confirm(`确定删除选中的 ${ids.length} 条账单记录吗？`)) return;
        const count = deletePiggyTransactions(ids);
        if (typeof showToast === 'function') showToast(count ? `已删除 ${count} 条记录` : '删除失败');
        await saveData();
        exitDeleteMode();
    });

    deleteCancelBtn && deleteCancelBtn.addEventListener('click', exitDeleteMode);

    if (screen) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(m => {
                if (m.attributeName === 'class' && screen.classList.contains('active')) renderPiggyBankScreen();
            });
        });
        observer.observe(screen, { attributes: true });
    }

    const familyCardCreateBtn = document.getElementById('family-card-create-btn');
    const familyCardCreateModal = document.getElementById('family-card-create-modal');
    const familyCardCreateForm = document.getElementById('family-card-create-form');
    const familyCardRefreshSelect = document.getElementById('family-card-refresh');
    const familyCardRefreshDaysWrap = document.getElementById('family-card-refresh-days-wrap');
    const familyCardCreateCancel = document.getElementById('family-card-create-cancel');
    const familyCardSendCharModal = document.getElementById('family-card-send-char-modal');
    const familyCardSendCharList = document.getElementById('family-card-send-char-list');
    const familyCardSendSkipBtn = document.getElementById('family-card-send-skip-btn');
    const familyCardDetailBack = document.getElementById('family-card-detail-back');

    familyCardRefreshSelect && familyCardRefreshSelect.addEventListener('change', () => {
        if (familyCardRefreshDaysWrap) familyCardRefreshDaysWrap.style.display = familyCardRefreshSelect.value === 'custom' ? 'block' : 'none';
    });

    familyCardCreateCancel && familyCardCreateCancel.addEventListener('click', () => { if (familyCardCreateModal) familyCardCreateModal.classList.remove('visible'); });

    familyCardCreateForm && familyCardCreateForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const bankName = document.getElementById('family-card-bank-name').value.trim();
        const limitInput = document.getElementById('family-card-limit').value;
        const limit = parseInt(limitInput, 10);
        const refresh = document.getElementById('family-card-refresh').value;
        const refreshDays = parseInt(document.getElementById('family-card-refresh-days').value, 10) || 30;
        const coverData = document.getElementById('family-card-cover-data');
        const coverUrl = document.getElementById('family-card-cover-url');
        const cardCover = (coverData && coverData.value.trim()) || (coverUrl && coverUrl.value.trim()) || '';
        if (!bankName) { showToast('请输入银行名称'); return; }
        if (isNaN(limit) || limit < 1) { showToast('请输入有效额度'); return; }
        const myName = (db.characters && db.characters.length && db.characters[0].myName) ? db.characters[0].myName : '用户';
        const card = createFamilyCard({
            bankName,
            limit,
            refreshPeriod: refresh,
            refreshDays: refresh === 'custom' ? refreshDays : 30,
            cardHolder: myName,
            cardCover: cardCover
        });
        if (familyCardCreateModal) familyCardCreateModal.classList.remove('visible');
        if (typeof saveData === 'function') saveData();
        renderFamilyCardList();
        let pendingCardForSend = card;
        familyCardSendCharList.innerHTML = '';
        (db.characters || []).forEach(char => {
            const alreadyHas = (db.piggyBank.familyCards || []).some(c => c.targetCharId === char.id && c.status === 'active');
            if (alreadyHas) return;
            const li = document.createElement('li');
            li.className = 'family-card-char-item';
            li.innerHTML = '<span class="family-card-char-name">' + escapeHtml(char.remarkName || char.realName || '') + '</span>';
            li.addEventListener('click', () => {
                if (!pendingCardForSend) return;
                const targetChar = db.characters.find(c => c.id === char.id);
                if (!targetChar) return;
                pendingCardForSend.targetCharId = targetChar.id;
                pendingCardForSend.targetCharName = targetChar.realName || targetChar.remarkName || '';
                if (typeof saveData === 'function') saveData();
                const periodText = pendingCardForSend.refreshPeriod === 'daily' ? '每天' : pendingCardForSend.refreshPeriod === 'weekly' ? '每周' : pendingCardForSend.refreshPeriod === 'monthly' ? '每月' : (pendingCardForSend.refreshDays || 30) + '天';
                const content = `[${targetChar.myName || myName}赠送${pendingCardForSend.targetCharName}亲属卡：额度${pendingCardForSend.limit}元；刷新周期：${periodText}]`;
                const message = {
                    id: 'msg_' + Date.now(),
                    role: 'user',
                    content: content,
                    parts: [{ type: 'text', text: content }],
                    timestamp: Date.now(),
                    familyCardId: pendingCardForSend.id,
                    familyCardStatus: 'pending'
                };
                targetChar.history.push(message);
                if (typeof addMessageBubble === 'function') addMessageBubble(message, targetChar.id, 'private');
                if (typeof renderChatList === 'function') renderChatList();
                if (familyCardSendCharModal) familyCardSendCharModal.classList.remove('visible');
                switchScreen('chat-room-screen');
                currentChatId = targetChar.id;
                currentChatType = 'private';
                if (typeof switchScreen === 'function') switchScreen('chat-room-screen');
                if (typeof renderChatRoom === 'function') renderChatRoom();
                pendingCardForSend = null;
                showToast('已发送到对话');
            });
            familyCardSendCharList.appendChild(li);
        });
        if (familyCardSendCharList.children.length === 0) {
            familyCardSendCharList.innerHTML = '<li class="family-card-char-item disabled">暂无可发送的角色（或该角色已有亲属卡）</li>';
        }
        if (familyCardSendCharModal) familyCardSendCharModal.classList.add('visible');
    });

    familyCardSendSkipBtn && familyCardSendSkipBtn.addEventListener('click', () => {
        if (familyCardSendCharModal) familyCardSendCharModal.classList.remove('visible');
        renderFamilyCardList();
    });

    // 亲属卡列表/详情返回与聊天设置一致：使用 data-target + 全局 back-btn 委托，不再在此绑定

    const familyCardEntryRow = document.getElementById('family-card-entry-row');
    familyCardEntryRow && familyCardEntryRow.addEventListener('click', () => {
        switchScreen('family-card-list-screen');
        renderFamilyCardList();
    });

    const familyCardCreateBtnInList = document.getElementById('family-card-create-btn-in-list');
    familyCardCreateBtnInList && familyCardCreateBtnInList.addEventListener('click', () => {
        if (familyCardCreateForm) familyCardCreateForm.reset();
        if (familyCardRefreshDaysWrap) familyCardRefreshDaysWrap.style.display = 'none';
        const coverData = document.getElementById('family-card-cover-data');
        const coverUrl = document.getElementById('family-card-cover-url');
        const coverFile = document.getElementById('family-card-cover-file');
        const previewWrap = document.getElementById('family-card-cover-preview-wrap');
        const previewImg = document.getElementById('family-card-cover-preview');
        if (coverData) coverData.value = '';
        if (coverUrl) coverUrl.value = '';
        if (coverFile) coverFile.value = '';
        if (previewWrap) previewWrap.style.display = 'none';
        if (previewImg) previewImg.src = '';
        if (familyCardCreateModal) familyCardCreateModal.classList.add('visible');
    });

    (function initFamilyCardCoverInputs() {
        const MAX_COVER_SIZE = 2 * 1024 * 1024;
        const coverUrl = document.getElementById('family-card-cover-url');
        const coverFile = document.getElementById('family-card-cover-file');
        const coverData = document.getElementById('family-card-cover-data');
        const previewWrap = document.getElementById('family-card-cover-preview-wrap');
        const previewImg = document.getElementById('family-card-cover-preview');
        const clearBtn = document.getElementById('family-card-cover-clear');

        function showPreview(src) {
            if (!previewWrap || !previewImg) return;
            if (src) {
                previewImg.src = src;
                previewImg.onerror = () => { previewWrap.style.display = 'none'; };
                previewWrap.style.display = 'block';
            } else {
                previewImg.src = '';
                previewWrap.style.display = 'none';
            }
        }

        if (coverUrl) {
            coverUrl.addEventListener('input', function () {
                const v = this.value.trim();
                if (coverData) coverData.value = '';
                showPreview(v || null);
            });
        }
        if (coverFile) {
            coverFile.addEventListener('change', function () {
                const file = this.files && this.files[0];
                if (!file || !file.type.startsWith('image/')) {
                    if (coverData) coverData.value = '';
                    showPreview(coverUrl && coverUrl.value.trim() || null);
                    return;
                }
                if (file.size > MAX_COVER_SIZE) {
                    showToast('图片建议不超过 2MB');
                    this.value = '';
                    return;
                }
                const reader = new FileReader();
                reader.onload = function () {
                    const dataUrl = reader.result;
                    if (coverData) coverData.value = dataUrl;
                    if (coverUrl) coverUrl.value = '';
                    showPreview(dataUrl);
                };
                reader.readAsDataURL(file);
            });
        }
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                if (coverData) coverData.value = '';
                if (coverUrl) coverUrl.value = '';
                if (coverFile) coverFile.value = '';
                showPreview(null);
            });
        }
    })();
}

if (typeof window !== 'undefined') {
    window.getPiggyBalance = getPiggyBalance;
    window.addPiggyTransaction = addPiggyTransaction;
    window.deletePiggyTransactions = deletePiggyTransactions;
    window.renderPiggyBankScreen = renderPiggyBankScreen;
    window.renderFamilyCardList = renderFamilyCardList;
    window.createReceivedFamilyCard = createReceivedFamilyCard;
    window.refreshFamilyCardLimits = refreshFamilyCardLimits;
    window.getFamilyCardById = getFamilyCardById;
}
