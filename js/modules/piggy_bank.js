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
    if (!balanceEl || !listEl) return;

    const balance = getPiggyBalance();
    balanceEl.textContent = (balance % 1 === 0 ? balance : balance.toFixed(2)).toString();

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
        const timeStr = t.time ? new Date(t.time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
        const remark = (t.remark || (t.type === 'income' ? '收入' : '支出')) + (t.charName ? ` · ${t.charName}` : '');
        li.innerHTML = `
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
    window.renderPiggyBankScreen = renderPiggyBankScreen;
}
