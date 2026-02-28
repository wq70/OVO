/**
 * 存钱罐（用户钱包）模块
 * - 默认余额 520 元，可存入、修改余额
 * - 转账支出从余额扣减，收款/退回记入收入
 */

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
}

if (typeof window !== 'undefined') {
    window.getPiggyBalance = getPiggyBalance;
    window.addPiggyTransaction = addPiggyTransaction;
    window.deletePiggyTransactions = deletePiggyTransactions;
    window.renderPiggyBankScreen = renderPiggyBankScreen;
}
