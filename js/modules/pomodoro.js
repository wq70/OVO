// --- 番茄钟功能 (js/modules/pomodoro.js) ---

// Clock state contains timestamps, never a count of interval callbacks.
const PomodoroClock = {
    create(task, now = Date.now(), round = 0) {
        return { id: `focus_${now}_${Math.random().toString(36).slice(2, 9)}`, task: JSON.parse(JSON.stringify(task)),
            phase: 'focus', status: 'running', elapsedMs: 0, startedAt: now, createdAt: now,
            round, pokeCount: 0, history: [], lastEncouragement: 0 };
    },
    elapsed(session, now = Date.now()) {
        let ms = Math.max(0, Number(session.elapsedMs) || 0);
        if (session.status === 'running') ms += Math.max(0, now - session.startedAt);
        const limit = this.limit(session);
        return limit ? Math.min(ms, limit) : ms;
    },
    limit(session) {
        if (session.phase === 'break') return session.breakMinutes * 60000;
        return session.task.mode === 'countdown' ? session.task.duration * 60000 : 0;
    },
    pause(session, now = Date.now()) {
        if (session.status !== 'running') return;
        session.elapsedMs = this.elapsed(session, now);
        session.startedAt = null;
        session.status = 'paused';
    },
    resume(session, now = Date.now()) {
        if (session.status !== 'paused') return;
        session.startedAt = now;
        session.status = 'running';
    },
    due(session, now = Date.now()) {
        return session.status === 'running' && this.limit(session) > 0 && this.elapsed(session, now) >= this.limit(session);
    },
    finish(session, now = Date.now(), automatic = false) {
        if (session.status === 'done' || session.phase !== 'focus') return null;
        const elapsedMs = this.elapsed(session, now);
        const endedAt = automatic && session.status === 'running'
            ? session.startedAt + Math.max(0, this.limit(session) - session.elapsedMs) : now;
        session.elapsedMs = elapsedMs;
        session.status = 'done';
        session.startedAt = null;
        session.round += 1;
        if (elapsedMs < 1000) return null;
        return { id: session.id, taskId: session.task.id, name: session.task.name, mode: session.task.mode,
            plannedMinutes: session.task.duration, seconds: Math.floor(elapsedMs / 1000),
            status: automatic || session.task.mode === 'stopwatch' ? 'completed' : 'early',
            createdAt: session.createdAt, endedAt, boundCharId: session.task.settings?.boundCharId || null,
            pokeCount: session.pokeCount, farewell: '' };
    },
    rest(session, minutes, now = Date.now()) {
        session.phase = 'break'; session.status = 'running'; session.elapsedMs = 0;
        session.startedAt = now; session.breakMinutes = minutes;
    },
    valid(session) {
        return !!(session && typeof session.id === 'string' && session.task && typeof session.task.name === 'string'
            && ['countdown', 'stopwatch'].includes(session.task.mode) && session.task.settings
            && ['focus', 'break'].includes(session.phase) && ['running', 'paused', 'done'].includes(session.status)
            && Number.isFinite(session.elapsedMs) && session.elapsedMs >= 0
            && Number.isFinite(session.createdAt) && Number.isInteger(session.round) && session.round >= 0
            && (session.status !== 'running' || Number.isFinite(session.startedAt))
            && (session.task.mode !== 'countdown' || Number.isFinite(session.task.duration) && session.task.duration > 0)
            && (session.phase !== 'break' || Number.isFinite(session.breakMinutes) && session.breakMinutes > 0));
    }
};
window.PomodoroClock = PomodoroClock;
let pomodoroSession = null;
let pomodoroController = null;
const pomodoroStyles = { quiet: '安静陪伴', caring: '温柔关怀', intimate: '亲密陪伴', coach: '专注督学', together: '并肩学习', custom: '自定义', legacy: '原有定时陪伴' };
function pomodoroStyle(settings) { return settings?.companionStyle || 'legacy'; }
function pomodoroFormat(seconds) {
    seconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(seconds / 60), rest = String(seconds % 60).padStart(2, '0');
    return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${rest}` : `${String(minutes).padStart(2, '0')}:${rest}`;
}
function pomodoroDuration(seconds) { return seconds >= 60 ? `${Math.floor(seconds / 60)} 分钟${seconds % 60 ? ` ${seconds % 60} 秒` : ''}` : `${seconds} 秒`; }

function renderPomodoroHome() {
    const today = new Date().toDateString();
    const records = db.pomodoroRecords || [];
    const seconds = records.filter(r => new Date(r.endedAt).toDateString() === today).reduce((sum, r) => sum + r.seconds, 0);
    const total = document.getElementById('pomodoro-today');
    if (total) total.textContent = `今日专注 ${pomodoroDuration(seconds)}`;
    const active = document.getElementById('pomodoro-active-session');
    if (active) {
        active.hidden = !pomodoroSession;
        const label = active.querySelector('span');
        if (pomodoroSession && label) label.textContent = `${pomodoroSession.task.name} · ${pomodoroSession.status === 'done' ? '查看本轮' : pomodoroSession.status === 'paused' ? '已暂停' : pomodoroSession.phase === 'break' ? '休息中' : '专注中'}`;
    }
    const select = document.getElementById('pomodoro-quick-char');
    if (select) {
        const selected = db.pomodoroSettings?.boundCharId || '';
        select.replaceChildren(new Option('不绑定角色', ''));
        db.characters.forEach(c => select.add(new Option(c.remarkName || c.realName, c.id)));
        select.value = selected;
    }
}

function renderPomodoroHistory() {
    const list = document.getElementById('pomodoro-history-list');
    const records = [...(db.pomodoroRecords || [])].sort((a, b) => b.endedAt - a.endedAt);
    list.replaceChildren();
    if (!records.length) { const empty = document.createElement('p'); empty.className = 'placeholder-text'; empty.textContent = '完成一轮后，专注记录会自动留在这里。'; list.appendChild(empty); }
    let lastDay = '';
    records.forEach(record => {
        const date = new Date(record.endedAt), day = date.toLocaleDateString();
        if (day !== lastDay) { const heading = document.createElement('h4'); heading.textContent = day; list.appendChild(heading); lastDay = day; }
        const row = document.createElement('div'); row.className = 'pomodoro-history-row';
        const title = document.createElement('strong'); title.textContent = record.name;
        const detail = document.createElement('p');
        const char = db.characters.find(c => c.id === record.boundCharId);
        detail.textContent = `${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${pomodoroDuration(record.seconds)} · ${record.status === 'early' ? '提前结束' : '完成'}${char ? ` · ${char.remarkName || char.realName}` : ''}`;
        row.append(title, detail);
        if (record.farewell) { const message = document.createElement('p'); message.textContent = record.farewell; row.appendChild(message); }
        list.appendChild(row);
    });
    const chart = document.getElementById('pomodoro-week-chart'); chart.replaceChildren();
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 6 + i); return d; });
    const sums = days.map(d => records.filter(r => new Date(r.endedAt).toDateString() === d.toDateString()).reduce((sum, r) => sum + r.seconds, 0));
    const maximum = Math.max(60, ...sums);
    days.forEach((day, i) => {
        const column = document.createElement('div'); column.className = 'pomodoro-chart-column';
        const value = document.createElement('small'); value.textContent = `${Math.floor(sums[i] / 60)}分`;
        const bar = document.createElement('span'); bar.className = 'pomodoro-chart-bar'; bar.style.height = `${Math.max(2, sums[i] / maximum * 48)}px`;
        const label = document.createElement('small'); label.textContent = `${day.getMonth() + 1}/${day.getDate()}`;
        column.append(value, bar, label); chart.appendChild(column);
    });
}

function renderPomodoroTasks() {
    const taskListContainer = document.getElementById('pomodoro-task-list');
    const placeholder = document.getElementById('pomodoro-no-tasks-placeholder');
    if (!taskListContainer || !placeholder) return;

    taskListContainer.innerHTML = ''; 

    if (!db.pomodoroTasks || db.pomodoroTasks.length === 0) {
        placeholder.style.display = 'block';
        taskListContainer.style.display = 'none';
        return;
    }

    placeholder.style.display = 'none';
    taskListContainer.style.display = 'flex';

    db.pomodoroTasks.forEach(task => {
        const wrapper = document.createElement('div');
        wrapper.className = 'task-card-wrapper';
        wrapper.dataset.id = task.id;

        const pomodorosText = task.mode === 'countdown' ? `倒计时模式` : '正计时模式';
        const durationText = task.mode === 'countdown' ? `${task.duration}分钟` : '';

        const backgroundUrl = task.settings?.taskCardBackground;
        let styleAttr = '';
        let textStyle = '';

        if (backgroundUrl) {
            styleAttr = `style="background-image: url(${backgroundUrl}); background-size: cover; background-position: center;"`;
            textStyle = `style="color: white; text-shadow: 0 1px 3px rgba(0,0,0,0.5);"`;
        }

        wrapper.innerHTML = `
            <div class="task-card" ${styleAttr}>
                <div class="task-card-info">
                    <h4 class="task-card-title" ${textStyle}>${DOMPurify.sanitize(task.name)}</h4>
                    <p class="task-card-details" ${textStyle}>${pomodorosText} ${durationText}</p>
                </div>
                <div class="pomodoro-task-actions"><button class="task-card-edit-btn pomodoro-text-btn">编辑</button><button class="task-card-start-btn">${pomodoroSession?.task.id === task.id && pomodoroSession.status !== 'done' ? '继续' : '开始'}</button></div>
            </div>
            <button class="task-card-delete-btn">删除</button>
        `;
        taskListContainer.appendChild(wrapper);
    });
}

function setupPomodoroApp() {
    const createTaskBtn = document.getElementById('pomodoro-create-task-btn');
    const createModal = document.getElementById('pomodoro-create-modal');
    const createForm = document.getElementById('pomodoro-create-form');
    const modeRadios = document.querySelectorAll('input[name="pomodoro-mode"]');
    const durationOptions = document.getElementById('pomodoro-duration-options');
    const durationPills = durationOptions.querySelectorAll('.duration-pill');
    const customDurationInput = document.getElementById('pomodoro-custom-duration-input');

    const focusScreen = document.getElementById('pomodoro-focus-screen');
    const focusTitleEl = focusScreen.querySelector('.focus-task-title');
    const focusTimerEl = focusScreen.querySelector('.focus-timer-display');
    const focusModeEl = focusScreen.querySelector('.focus-timer-mode');
    const startBtn = document.getElementById('pomodoro-start-btn');
    const pauseBtn = document.getElementById('pomodoro-pause-btn');
    const giveUpBtn = document.getElementById('pomodoro-giveup-btn');
    const focusAvatar = focusScreen.querySelector('.focus-avatar');
    const focusMessageBubble = focusScreen.querySelector('.focus-message-bubble');

    const byId = id => document.getElementById(id);
    const certModal = byId('pomodoro-certificate-modal');
    let lastRecord = null, completionBusy = false, replyVersion = 0, replyAbort = null, replyBusy = false, lastSaveFailed = false;
    let typingInterval = null, lastPokeAt = 0, audioContext = null;
    let editingTaskId = null, savingTask = false;

    async function persistSession() {
        if (pomodoroSession) {
            pomodoroSession.pokeCount = pomodoroPokeCount;
            pomodoroSession.history = pomodoroSessionHistory.slice(-8);
        }
        db.pomodoroActiveSession = pomodoroSession ? JSON.parse(JSON.stringify(pomodoroSession)) : null;
        return saveGlobalSettings(['pomodoroActiveSession', 'pomodoroRecords']);
    }
    function cancelReply() {
        replyVersion++; replyAbort?.abort(); replyAbort = null; replyBusy = false;
        clearInterval(typingInterval); typingInterval = null;
    }
    function neutralMessage(text) {
        clearInterval(typingInterval);
        focusMessageBubble.classList.add('visible');
        focusMessageBubble.querySelector('p').textContent = text;
    }
    function prepareSound() {
        if (currentPomodoroTask?.settings.endSound === false) return;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass && !audioContext) audioContext = new AudioContextClass();
            if (audioContext?.state === 'suspended') void audioContext.resume().catch(() => {});
        } catch (_) { /* Sound support never blocks the timer. */ }
    }
    function playEndSound() {
        if (currentPomodoroTask?.settings.endSound === false || audioContext?.state !== 'running') return;
        try {
            const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
            oscillator.connect(gain); gain.connect(audioContext.destination);
            oscillator.frequency.setValueAtTime(660, audioContext.currentTime);
            oscillator.frequency.setValueAtTime(880, audioContext.currentTime + 0.2);
            gain.gain.setValueAtTime(0.08, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.6);
            oscillator.start(); oscillator.stop(audioContext.currentTime + 0.6);
        } catch (_) { /* Optional sound. */ }
    }
    function updateTimerDisplay() {
        if (!pomodoroSession) return;
        const seconds = Math.floor(PomodoroClock.elapsed(pomodoroSession) / 1000);
        const limit = PomodoroClock.limit(pomodoroSession);
        pomodoroCurrentSessionSeconds = pomodoroSession.phase === 'focus' ? seconds : (lastRecord?.seconds || 0);
        pomodoroRemainingSeconds = limit ? Math.max(0, Math.ceil((limit - PomodoroClock.elapsed(pomodoroSession)) / 1000)) : seconds;
        focusTimerEl.textContent = pomodoroFormat(pomodoroRemainingSeconds);
        const isRest = pomodoroSession.phase === 'break';
        const done = pomodoroSession.status === 'done';
        isPomodoroPaused = pomodoroSession.status !== 'running';
        const state = done ? (isRest ? '休息结束' : '本轮完成') : isPomodoroPaused ? '已暂停' : isRest ? '休息中' : '专注中';
        focusScreen.querySelector('.app-header .title').textContent = state;
        focusModeEl.textContent = state + (isRest ? '' : currentPomodoroTask.mode === 'countdown' ? ' · 倒计时' : ' · 正计时');
        focusTitleEl.textContent = isRest ? '休息一下' : currentPomodoroTask.name;
        byId('pomodoro-total-focused-time').textContent = isRest ? '休息时间不计入专注' : '已专注 ' + pomodoroDuration(seconds);
        const progress = byId('pomodoro-progress');
        progress.hidden = !limit; progress.value = limit ? Math.min(1, PomodoroClock.elapsed(pomodoroSession) / limit) : 0;
        startBtn.style.display = isPomodoroPaused && !done ? 'inline-flex' : 'none';
        pauseBtn.style.display = !isPomodoroPaused ? 'inline-flex' : 'none';
        startBtn.title = '继续'; pauseBtn.title = '暂停';
        byId('pomodoro-finish-btn').hidden = done;
        byId('pomodoro-finish-btn').textContent = isRest ? '结束休息' : '结束并保存';
        byId('pomodoro-next-round-btn').hidden = !done;
        byId('pomodoro-rest-duration-group').hidden = !isRest || done;
        refreshCompanion();
    }
    function refreshCompanion() {
        const char = db.characters.find(c => c.id === currentPomodoroTask?.settings.boundCharId);
        focusAvatar.src = char?.avatar || 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg';
        focusAvatar.alt = char ? '戳一戳' + (char.remarkName || char.realName) : '未绑定陪伴角色';
        focusAvatar.setAttribute('aria-disabled', String(!char));
        byId('pomodoro-companion-label').textContent = char ? (char.remarkName || char.realName) + ' · ' + (pomodoroStyles[pomodoroStyle(currentPomodoroTask.settings)] || '安静陪伴') : '自由专注 · 可在设置中选择陪伴角色';
    }
    function stopTimer() {
        clearInterval(pomodoroInterval); pomodoroInterval = null;
    }
    function runTimer() {
        stopTimer(); pomodoroInterval = setInterval(tick, 1000);
    }
    function tick() {
        if (!pomodoroSession) return;
        updateTimerDisplay();
        if (PomodoroClock.due(pomodoroSession)) {
            if (pomodoroSession.phase === 'focus') void handlePomodoroCompletion(true);
            else finishRest(true);
            return;
        }
        if (pomodoroSession.phase !== 'focus' || pomodoroSession.status !== 'running' || document.visibilityState === 'hidden') return;
        const style = pomodoroStyle(currentPomodoroTask.settings);
        if (style === 'quiet' || style === 'custom') return;
        const minutes = style === 'legacy' ? Number(currentPomodoroTask.settings.encouragementMinutes) || 25 : style === 'intimate' ? 10 : 15;
        const boundary = Math.floor(pomodoroCurrentSessionSeconds / (minutes * 60));
        if (boundary > pomodoroSession.lastEncouragement) {
            pomodoroSession.lastEncouragement = boundary;
            if (!pomodoroIsInterrupted) void getPomodoroAiReply('encouragement');
        }
    }
    async function startTimer() {
        if (!pomodoroSession || pomodoroSession.status !== 'paused') return;
        prepareSound(); PomodoroClock.resume(pomodoroSession); pomodoroIsInterrupted = false;
        runTimer(); updateTimerDisplay(); void getPomodoroAiReply('resume'); await persistSession();
    }
    async function pauseTimer() {
        if (!pomodoroSession || pomodoroSession.status !== 'running') return;
        if (PomodoroClock.due(pomodoroSession)) { tick(); return; }
        PomodoroClock.pause(pomodoroSession); pomodoroIsInterrupted = true;
        stopTimer(); cancelReply(); updateTimerDisplay();
        if (pomodoroStyle(currentPomodoroTask.settings) !== 'legacy') void getPomodoroAiReply('pause');
        await persistSession();
    }
    async function beginTask(task, round = 0) {
        if (completionBusy) return;
        if (pomodoroSession && pomodoroSession.status !== 'done') {
            if (pomodoroSession.task.id === task.id) { openActiveSession(); return; }
            showToast('请先结束当前一轮，再开始其他任务'); openActiveSession(); return;
        }
        task = { ...task, settings: { ...(task.settings || db.pomodoroSettings) } };
        cancelReply(); stopTimer();
        pomodoroSession = PomodoroClock.create(task, Date.now(), round);
        currentPomodoroTask = pomodoroSession.task;
        pomodoroPokeCount = 0; pomodoroSessionHistory = []; pomodoroIsInterrupted = false; lastPokeAt = 0; lastRecord = null;
        focusMessageBubble.classList.remove('visible'); focusMessageBubble.querySelector('p').textContent = '';
        prepareSound(); applyPomodoroBackgrounds(); switchScreen('pomodoro-focus-screen');
        updateTimerDisplay(); runTimer(); renderPomodoroHome();
        if (pomodoroStyle(task.settings) !== 'legacy') void getPomodoroAiReply('start');
        await persistSession();
    }
    function openActiveSession() {
        if (!pomodoroSession) return;
        currentPomodoroTask = pomodoroSession.task;
        applyPomodoroBackgrounds(); switchScreen('pomodoro-focus-screen'); tick();
        if (pomodoroSession.status === 'done' && pomodoroSession.phase === 'focus') showCertificate();
    }
    function showCertificate() {
        if (!pomodoroSession || !lastRecord) return;
        byId('cert-task-name').textContent = lastRecord.name;
        byId('cert-duration').textContent = pomodoroDuration(lastRecord.seconds);
        byId('cert-poke-count').textContent = lastRecord.pokeCount;
        const companion = db.characters.find(c => c.id === lastRecord.boundCharId);
        byId('cert-companion').textContent = companion?.remarkName || companion?.realName || '自由专注';
        byId('cert-status').textContent = lastRecord.status === 'early' ? '提前结束 · 已保留投入时间' : '本轮完成';
        byId('pomodoro-cert-title').textContent = lastRecord.status === 'early' ? '已保存本轮专注' : '专注完成！';
        byId('pomodoro-cert-message').textContent = lastSaveFailed ? '保存未成功，请重试。当前记录保留在页面。' : lastRecord.farewell || '专注记录已自动保存。';
        byId('pomodoro-retry-save-btn').hidden = !lastSaveFailed;
        byId('forward-certificate-btn').hidden = !db.characters.some(c => c.id === lastRecord.boundCharId);
        byId('forward-certificate-btn').disabled = !!lastRecord.sharedMessageId;
        byId('forward-certificate-btn').textContent = lastRecord.sharedMessageId ? '已转发' : '转发到聊天框';
        byId('pomodoro-rest-btn').textContent = pomodoroSession.round % 4 === 0 ? '长休息 · 15分钟' : '休息 · 5分钟';
        certModal.classList.add('visible');
        if (!lastRecord.farewell && !replyBusy && pomodoroStyle(currentPomodoroTask.settings) !== 'legacy') void getPomodoroAiReply('complete');
    }
    async function handlePomodoroCompletion(automatic = false) {
        if (!pomodoroSession || completionBusy || pomodoroSession.status === 'done') return;
        completionBusy = true; cancelReply(); stopTimer();
        try {
            const record = PomodoroClock.finish(pomodoroSession, Date.now(), automatic);
            if (record && !db.pomodoroRecords.some(r => r.id === record.id)) db.pomodoroRecords.push(record);
            lastRecord = record || null;
            const saved = await persistSession();
            lastSaveFailed = !saved;
            updateTimerDisplay(); renderPomodoroHome();
            if (!record) { await closeSession(); return; }
            if (!saved) showToast('本轮保留在当前页面，保存失败，请重试');
            playEndSound();
            if (focusScreen.classList.contains('active')) showCertificate();
        } finally { completionBusy = false; }
    }
    async function closeSession() {
        if (lastSaveFailed && !await persistSession()) { showToast('保存未成功，请重试后再结束'); return; }
        lastSaveFailed = false;
        cancelReply(); stopTimer(); pomodoroSession = null; currentPomodoroTask = null;
        isPomodoroPaused = true; certModal.classList.remove('visible');
        await persistSession(); switchScreen('pomodoro-screen'); renderPomodoroHome(); renderPomodoroTasks();
    }
    async function nextRound() {
        if (!pomodoroSession || completionBusy || pomodoroSession.status !== 'done') return;
        if (lastSaveFailed && !await persistSession()) { showToast('请先保存本轮记录'); return; }
        lastSaveFailed = false;
        const task = pomodoroSession.task, round = pomodoroSession.round;
        pomodoroSession.status = 'done'; certModal.classList.remove('visible'); await beginTask(task, round);
    }
    function finishRest(automatic = false) {
        if (!pomodoroSession || pomodoroSession.phase !== 'break' || pomodoroSession.status === 'done') return;
        cancelReply(); PomodoroClock.pause(pomodoroSession); pomodoroSession.status = 'done'; stopTimer();
        updateTimerDisplay(); renderPomodoroHome(); void persistSession();
        neutralMessage('休息结束了，准备好后再开始下一轮。'); if (automatic) playEndSound();
        if (pomodoroStyle(currentPomodoroTask.settings) !== 'legacy') void getPomodoroAiReply('restEnd');
    }
    async function startRest() {
        if (!pomodoroSession || completionBusy || pomodoroSession.phase !== 'focus' || pomodoroSession.status !== 'done') return;
        if (lastSaveFailed && !await persistSession()) { showToast('请先保存本轮记录'); return; }
        lastSaveFailed = false;
        cancelReply(); prepareSound(); certModal.classList.remove('visible');
        const minutes = pomodoroSession.round % 4 === 0 ? 15 : 5;
        PomodoroClock.rest(pomodoroSession, minutes); byId('pomodoro-rest-duration').value = minutes;
        switchScreen('pomodoro-focus-screen'); runTimer(); updateTimerDisplay(); renderPomodoroHome();
        if (pomodoroStyle(currentPomodoroTask.settings) !== 'legacy') void getPomodoroAiReply('rest');
        await persistSession();
    }
    startBtn.addEventListener('click', startTimer);
    pauseBtn.addEventListener('click', pauseTimer);
    byId('pomodoro-finish-btn').addEventListener('click', async () => {
        if (completionBusy) return;
        if (pomodoroSession?.phase === 'break') { finishRest(); await nextRound(); }
        else if (currentPomodoroTask?.mode === 'stopwatch' || await customConfirm('结束本轮并保存已投入的时间？', '结束专注')) await handlePomodoroCompletion(false);
    });
    giveUpBtn.addEventListener('click', async () => {
        if (!pomodoroSession || completionBusy) return;
        if (await customConfirm('结束本次专注？已产生的专注时间会自动保存。', '结束本次')) {
            if (pomodoroSession.phase === 'focus' && pomodoroSession.status !== 'done') await handlePomodoroCompletion(false);
            await closeSession();
        }
    });
    byId('pomodoro-next-round-btn').addEventListener('click', nextRound);
    byId('pomodoro-again-btn').addEventListener('click', nextRound);
    byId('pomodoro-rest-btn').addEventListener('click', startRest);
    byId('pomodoro-retry-save-btn').addEventListener('click', async () => {
        lastSaveFailed = !await persistSession();
        showCertificate(); if (!lastSaveFailed) showToast('专注记录已保存');
    });
    byId('close-certificate-btn').addEventListener('click', closeSession);
    byId('pomodoro-continue-btn').addEventListener('click', openActiveSession);
    byId('pomodoro-rest-duration').addEventListener('change', async e => {
        if (!pomodoroSession || pomodoroSession.phase !== 'break' || pomodoroSession.status === 'done') return;
        const minutes = Number(e.target.value);
        if (!Number.isFinite(minutes) || minutes <= 0) return;
        pomodoroSession.breakMinutes = minutes; updateTimerDisplay(); tick(); await persistSession();
    });
    focusAvatar.addEventListener('click', () => {
        if (!pomodoroSession || pomodoroSession.phase !== 'focus' || pomodoroSession.status !== 'running' || replyBusy || !db.characters.some(c => c.id === currentPomodoroTask.settings.boundCharId)) return;
        const legacy = pomodoroStyle(currentPomodoroTask.settings) === 'legacy';
        if (!legacy && Date.now() - lastPokeAt < 10000) { showToast('稍等一下，先回到任务吧'); return; }
        lastPokeAt = Date.now();
        const pokeLimit = Number.isFinite(Number(currentPomodoroTask.settings.pokeLimit)) ? Math.max(0, Number(currentPomodoroTask.settings.pokeLimit)) : 5;
        if (legacy && pomodoroPokeCount >= pokeLimit) { neutralMessage('本轮互动次数已到上限，先专注，结束后再聊。'); return; }
        pomodoroPokeCount++; pomodoroIsInterrupted = true; void getPomodoroAiReply('poke'); void persistSession();
        const pokeSessionId = pomodoroSession.id;
        setTimeout(() => { if (pomodoroSession?.id === pokeSessionId && pomodoroSession.status === 'running') pomodoroIsInterrupted = false; }, 10000);
    });
    focusAvatar.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusAvatar.click(); } });
    byId('forward-certificate-btn').addEventListener('click', async e => {
        const record = lastRecord, chat = db.characters.find(c => c.id === record?.boundCharId);
        if (!record || !chat || record.sharedMessageId || e.currentTarget.disabled) return;
        const button = e.currentTarget; button.disabled = true;
        const messageContent = '[专注记录] 任务：' + record.name + '，时长：' + pomodoroDuration(record.seconds) + '，期间与 ' + chat.realName + ' 互动 ' + record.pokeCount + ' 次。';
        const id = 'msg_pomodoro_' + record.id;
        if (!chat.history.some(m => m.id === id)) chat.history.push({ id, role: 'user', content: messageContent, parts: [{ type: 'text', text: messageContent }], timestamp: Date.now(), senderId: 'user_me' });
        const saved = await saveCharacter(chat.id);
        if (!saved) { button.disabled = false; return; }
        record.sharedMessageId = id; await persistSession(); button.textContent = '已转发'; renderChatList(); showToast('已转发到聊天框');
    });
    byId('pomodoro-save-image-btn').addEventListener('click', async e => {
        if (!lastRecord || typeof html2canvas !== 'function') { showToast('图片组件暂不可用，请稍后再试'); return; }
        const button = e.currentTarget; button.disabled = true;
        try {
            const canvas = await html2canvas(byId('pomodoro-certificate-content'), { backgroundColor: '#fff8fa', scale: 2 });
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            if (!blob) throw new Error('图片生成失败');
            await OvoFileDownload.save(blob, '专注成果.png');
        } catch (_) { showToast('图片保存失败，请稍后重试'); }
        finally { button.disabled = false; }
    });
    byId('pomodoro-quick-form').addEventListener('submit', async e => {
        e.preventDefault();
        const value = byId('pomodoro-quick-duration').value;
        const duration = value === 'custom' ? Number(byId('pomodoro-quick-custom').value) : Number(value);
        if (value !== 'stopwatch' && (!Number.isFinite(duration) || duration <= 0)) { showToast('请输入有效分钟数'); return; }
        db.pomodoroSettings.boundCharId = byId('pomodoro-quick-char').value || null;
        const task = { id: 'quick_' + Date.now(), name: byId('pomodoro-quick-name').value.trim() || '自由专注', mode: value === 'stopwatch' ? 'stopwatch' : 'countdown', duration: value === 'stopwatch' ? 0 : duration,
            settings: { ...JSON.parse(JSON.stringify(db.pomodoroSettings)), companionStyle: db.pomodoroSettings.companionStyle || 'quiet' } };
        await beginTask(task); await saveGlobalSettings(['pomodoroSettings']);
    });
    byId('pomodoro-quick-duration').addEventListener('change', e => { byId('pomodoro-quick-custom').hidden = e.target.value !== 'custom'; });
    byId('pomodoro-history-btn').addEventListener('click', () => { renderPomodoroHistory(); byId('pomodoro-history-modal').classList.add('visible'); });
    byId('pomodoro-history-close').addEventListener('click', () => byId('pomodoro-history-modal').classList.remove('visible'));
    byId('pomodoro-history-modal').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('visible'); });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') tick();
        else { cancelReply(); void persistSession(); }
    });
    window.addEventListener('pageshow', tick);
    window.addEventListener('pagehide', () => { cancelReply(); void persistSession(); });
    pomodoroController = { cancelReply, refresh: () => { updateTimerDisplay(); renderPomodoroHome(); }, persist: persistSession,
        openSettings: () => { currentPomodoroSettingsContext = db.pomodoroSettings; loadSettingsToPomodoroSidebar(currentPomodoroSettingsContext); byId('pomodoro-settings-modal').classList.add('visible'); } };
    if (!Array.isArray(db.pomodoroRecords)) db.pomodoroRecords = [];
    if (PomodoroClock.valid(db.pomodoroActiveSession)) {
        pomodoroSession = JSON.parse(JSON.stringify(db.pomodoroActiveSession)); currentPomodoroTask = pomodoroSession.task;
        pomodoroPokeCount = pomodoroSession.pokeCount || 0; pomodoroSessionHistory = pomodoroSession.history || [];
        lastRecord = db.pomodoroRecords.find(r => r.id === pomodoroSession.id) || null;
        if (pomodoroSession.status === 'running') runTimer();
        tick();
    }
    renderPomodoroHome();

    function showPomodoroTypingIndicator(element) {
        element.innerHTML = '对方正在输入中<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>';
    }

    function showTypewriterMessage(element, text, onComplete) {
        clearInterval(typingInterval);
        const version = replyVersion;
        let i = 0;
        element.innerHTML = ''; 
        typingInterval = setInterval(() => {
            if (version !== replyVersion) { clearInterval(typingInterval); return; }
            if (i < text.length) {
                element.textContent += text.charAt(i);
                i++;
            } else {
                clearInterval(typingInterval);
                if (onComplete) onComplete();
            }
        }, 50);
    }

    async function getPomodoroAiReply(promptType) {
        const focusMessageBubble = document.querySelector('.focus-message-bubble');
        const messageP = focusMessageBubble.querySelector('p');
        if (!pomodoroSession || !currentPomodoroTask || document.visibilityState === 'hidden') return;
        if (replyBusy) {
            if (!['complete', 'rest', 'restEnd', 'start', 'pause'].includes(promptType)) return;
            cancelReply();
        }
        const sessionId = pomodoroSession.id, taskSnapshot = currentPomodoroTask;
        const settings = { ...taskSnapshot.settings };
        const version = ++replyVersion;
        const controller = new AbortController();
        replyAbort = controller;
        const allowed = () => version === replyVersion && pomodoroSession?.id === sessionId && currentPomodoroTask?.settings.boundCharId === settings.boundCharId;
        const style = pomodoroStyle(settings);
        const character = db.characters.find(c => c.id === settings.boundCharId);

        if (!character) {
            focusMessageBubble.classList.remove('visible');
            return;
        }

        const userPersonaPreset = (db.myPersonaPresets || []).find(p => p.name === settings.userPersona);
        const userPersona = userPersonaPreset ? userPersonaPreset.persona : '一个普通人';

        let prompt;
        const totalMinutes = Math.floor(pomodoroCurrentSessionSeconds / 60);
        const remainingMinutes = Math.round(pomodoroRemainingSeconds / 60);
        const taskName = currentPomodoroTask.name;

        switch (promptType) {
            case 'encouragement':
                if (currentPomodoroTask.mode === 'countdown') {
                    prompt = `你正在扮演[${character.realName}]。用户正在进行专注任务“${taskName}”，已连续专注了[${totalMinutes}]分钟，还剩下大约[${remainingMinutes}]分钟。请根据你的人设、任务内容和剩余时间，以鼓励用户为目的，给用户发送一条文字消息。`;
                } else { 
                    prompt = `你正在扮演[${character.realName}]。用户正在进行专注任务“${taskName}”，已经连续专注了[${totalMinutes}]分钟。请根据你的人设和任务内容，以鼓励用户为目的，给用户发送一条文字消息。`;
                }
                break;
            case 'poke':
                if (currentPomodoroTask.mode === 'countdown') {
                    prompt = `你正在扮演[${character.realName}]。用户在进行专注任务“${taskName}”时，专注了[${totalMinutes}]分钟（还剩下大约[${remainingMinutes}]分钟），忍不住第${pomodoroPokeCount}次戳了戳你的头像。请根据你的人设、任务内容和剩余时间，给用户回复一条文字消息。`;
                } else { 
                    prompt = `你正在扮演[${character.realName}]。用户在进行专注任务“${taskName}”时，已经连续专注了[${totalMinutes}]分钟，这时忍不住第${pomodoroPokeCount}次戳了戳你的头像。请根据你的人设和任务内容，给用户回复一条文字消息。`;
                }
                break;
            case 'resume':
                prompt = `你正在扮演[${character.realName}]。用户正在进行专注任务“${taskName}”，刚刚暂停了任务后又重新开始了。请根据你的人设，给用户回复一条文字消息。`;
                break;
        }

        const events = { start: '用户刚刚开始本轮专注，请简短陪伴并帮助进入状态。', pause: '用户暂停了本轮，温和接住中断，不评价失败。', rest: '本轮已结束，用户开始休息，提醒适当放松。', restEnd: '休息结束，用户尚未开始下一轮，不声称已经继续。', complete: '本轮计时结束，记录状态为' + (lastRecord?.status === 'early' ? '提前结束' : '完成') + '，实际计时' + pomodoroDuration(lastRecord?.seconds || 0) + '。承认已投入的时间，简短收尾；计时结束不代表任务已经做完。' };
        if (events[promptType]) prompt = '任务：' + taskName + '。' + events[promptType];
        if (style !== 'legacy') {
        prompt += '\n陪伴方式：' + (pomodoroStyles[style] || '安静陪伴') + '。陪伴偏好：' + (settings.companionPreference || '无额外要求') + '。';
        prompt += '\n请用符合人设和关系的一两句短回应，不强迫继续聊天、不羞辱用户。计时与暂停来自程序，不能据此断言用户实际一直认真学习。不要声称你真实完成了学习任务。';
        if (style === 'coach') prompt += '适当帮助回到目标，语气由人设决定。';
        if (style === 'together') prompt += '表达并肩投入的氛围，不编造自己的实际学习成果。';
        if (style === 'intimate') prompt += '亲近程度与称呼遵循已有角色关系。';
        if (style === 'custom') prompt += '以用户的陪伴偏好为准；未填写时按安静陪伴。';

        }
        if (pomodoroSessionHistory && pomodoroSessionHistory.length > 0) {
            const myName = character.myName || '我';
            const charName = character.realName || '角色';
            const historyContext = pomodoroSessionHistory.map(item => {
                if (item.type === 'user') {
                    return `[${myName}的消息：(执行操作: ${item.content})]`;
                } else {
                    return `[${charName}的消息：${item.content}]`;
                }
            }).join('\n');
            prompt += `\n\n【本次专注期间的简短互动历史】\n${historyContext}\n\n请基于以上历史，继续你的下一句回应。`;
        }

        focusMessageBubble.classList.add('visible');
        showPomodoroTypingIndicator(messageP);
        replyBusy = true;
        const timeout = setTimeout(() => controller.abort(), 25000);

        try {
            const pomodoroApiConfig = typeof getApiConfigForFeature === 'function' ? getApiConfigForFeature('pomodoro', db.apiSettings, character) : db.apiSettings;
            let { url, key, model } = pomodoroApiConfig;
            if (typeof isApiConfigReady === 'function' ? !isApiConfigReady(pomodoroApiConfig) : (!url || !key || !model)) {
                messageP.textContent = '尚未配置陪伴 API，计时与记录正常。';
                return;
            }

            if (url.endsWith('/')) {
                url = url.slice(0, -1);
            }

            // 收集全局世界书 + 真正的全局世界书（isGlobal）
            const configuredGlobalIds = db.pomodoroSettings?.globalWorldBookIds || [];
            const isGlobalBooks = db.worldBooks.filter(wb => wb.isGlobal && !wb.disabled);
            const isGlobalIds = isGlobalBooks.map(wb => wb.id);
            const allGlobalIds = [...new Set([...configuredGlobalIds, ...isGlobalIds])];
            
            const globalWorldBooksBefore = allGlobalIds
                .map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'before'))
                .filter(wb => wb && !wb.disabled)
                .map(wb => wb.content)
                .join('\n\n');
            const globalWorldBooksMiddle = allGlobalIds
                .map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'middle'))
                .filter(wb => wb && !wb.disabled)
                .map(wb => wb.content)
                .join('\n\n');
            const globalWorldBooksAfter = allGlobalIds
                .map(id => db.worldBooks.find(wb => wb.id === id && wb.position === 'after'))
                .filter(wb => wb && !wb.disabled)
                .map(wb => wb.content)
                .join('\n\n');

            let systemPromptContent = `你正在扮演角色。你的名字是${character.realName}。`;
            if (globalWorldBooksBefore) {
                systemPromptContent += `\n\n【全局世界观设定】\n${globalWorldBooksBefore}`;
            }
            if (globalWorldBooksMiddle) {
                systemPromptContent += `\n\n【全局世界观设定】\n${globalWorldBooksMiddle}`;
            }
            systemPromptContent += `\n\n【你的角色设定】\n人设: ${character.persona}`;
            if (globalWorldBooksAfter) {
                systemPromptContent += `\n\n【补充设定】\n${globalWorldBooksAfter}`;
            }
            systemPromptContent += `\n\n【我的角色设定】\n我的名字是${character.myName}，人设是：${userPersona}。`;
            systemPromptContent += BilingualContent.prompt(character, 'pomodoro', '鼓励与回复用户的话');

            const endpoint = `${url}/v1/chat/completions`;
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            };
            const requestBody = {
                model: model,
                messages: [
                    { role: 'system', content: systemPromptContent },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.8
            };

            const reply = await fetchAiResponse(pomodoroApiConfig, requestBody, headers, endpoint, false, { signal: controller.signal, isAllowed: allowed });
            if (!allowed()) return;
            if (!String(reply || '').trim()) throw new Error('Empty companion response');

            pomodoroSessionHistory.push({ type: 'user', content: promptType });
            pomodoroSessionHistory.push({ type: 'ai', content: reply });
            if (pomodoroSessionHistory.length > 8) {
                pomodoroSessionHistory.splice(0, 2);
            }

            if (promptType === 'complete' && lastRecord?.id === sessionId) {
                lastRecord.farewell = reply;
                if (!lastSaveFailed) byId('pomodoro-cert-message').textContent = reply;
            }
            void persistSession();
            showTypewriterMessage(messageP, reply, () => { if (allowed() && messageP.isConnected) messageP.innerHTML = BilingualContent.html(reply, character, 'pomodoro', 'pomodoro'); });

        } catch (error) {
            if (!allowed()) return;
            console.error('获取陪伴回应失败:', error);
            messageP.textContent = '陪伴回应暂未连接，计时与记录正常。';
        } finally {
            clearTimeout(timeout);
            if (allowed()) { replyBusy = false; replyAbort = null; }
        }
    }


    if (createTaskBtn) {
        createTaskBtn.addEventListener('click', () => {
            editingTaskId = null;
            createForm.reset();
            byId('pomodoro-create-title').textContent = '创建专注任务';
            byId('pomodoro-create-submit').textContent = '创建任务';
            loadCreateCharacters(db.pomodoroSettings.boundCharId);
            durationOptions.classList.add('visible');
            durationPills.forEach(p => p.classList.remove('active'));
            if (durationPills.length > 0) {
                durationPills[0].classList.add('active');
            }
            customDurationInput.style.display = 'none';
            document.getElementById('mode-countdown').checked = true;
            document.getElementById('mode-stopwatch').checked = false;

            createModal.classList.add('visible');
        });
    }

    modeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.value === 'countdown') {
                durationOptions.classList.add('visible');
            } else {
                durationOptions.classList.remove('visible');
            }
        });
    });

    durationPills.forEach(pill => {
        pill.addEventListener('click', () => {
            durationPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            if (pill.dataset.duration === 'custom') {
                customDurationInput.style.display = 'block';
                customDurationInput.focus();
            } else {
                customDurationInput.style.display = 'none';
            }
        });
    });

    if (createForm) {
        createForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (savingTask) return;
            const taskName = document.getElementById('pomodoro-task-name').value.trim();
            if (!taskName) {
                showToast('请输入任务名称');
                return;
            }

            const mode = document.querySelector('input[name="pomodoro-mode"]:checked').value;
            let duration = 0;

            if (mode === 'countdown') {
                const activePill = durationOptions.querySelector('.duration-pill.active');
                if (activePill.dataset.duration === 'custom') {
                    duration = parseInt(customDurationInput.value, 10);
                    if (isNaN(duration) || duration <= 0) {
                        showToast('请输入有效的自定义分钟数');
                        return;
                    }
                } else {
                    duration = parseInt(activePill.dataset.duration, 10);
                }
            }

            const existingTask = db.pomodoroTasks.find(t => t.id === editingTaskId);
            const newTask = {
                id: existingTask?.id || `pomodoro_${Date.now()}`,
                name: taskName,
                mode: mode,
                duration: duration,
                status: existingTask?.status || 'pending',
                settings: {
                    ...JSON.parse(JSON.stringify(existingTask?.settings || db.pomodoroSettings)),
                    boundCharId: byId('pomodoro-create-char').value || null,
                    companionStyle: existingTask ? pomodoroStyle(existingTask.settings) : db.pomodoroSettings.companionStyle || 'quiet',
                    focusBackground: existingTask?.settings?.focusBackground || '',
                    taskCardBackground: existingTask?.settings?.taskCardBackground || ''
                }
            };

            if (!db.pomodoroTasks) {
                db.pomodoroTasks = [];
            }
            if (pomodoroSession?.task.id === editingTaskId && pomodoroSession.status !== 'done') { showToast('请结束当前一轮后再编辑任务'); return; }
            savingTask = true; byId('pomodoro-create-submit').disabled = true;
            if (existingTask) Object.assign(existingTask, newTask); else db.pomodoroTasks.push(newTask);
            const saved = await saveGlobalSettings(['pomodoroTasks']);
            savingTask = false; byId('pomodoro-create-submit').disabled = false;
            if (!saved) return;

            showToast(existingTask ? '任务已更新' : `任务 "${taskName}" 已创建`);
            renderPomodoroTasks();

            createModal.classList.remove('visible');
        });
    }

    function loadCreateCharacters(selected) {
        const select = byId('pomodoro-create-char'); select.replaceChildren(new Option('不绑定角色', ''));
        db.characters.forEach(c => select.add(new Option(c.remarkName || c.realName, c.id)));
        select.value = selected || '';
    }
    byId('pomodoro-create-close').addEventListener('click', () => createModal.classList.remove('visible'));
    createModal.addEventListener('click', e => { if (e.target === createModal) createModal.classList.remove('visible'); });

    const screen = document.getElementById('pomodoro-screen');
    if (screen) {
        const observer = new MutationObserver(() => {
            if (screen.classList.contains('active')) {
                renderPomodoroHome();
                renderPomodoroTasks();
            }
        });
        observer.observe(screen, { attributes: true, attributeFilter: ['class'] });
    }

    const taskListContainer = document.getElementById('pomodoro-task-list');

    let touchStartX = 0;
    let touchCurrentX = 0;
    let swipedCardWrapper = null;
    let isDragging = false;
    const swipeThreshold = 50; 

    const handleSwipeStart = (x, target) => {
        touchStartX = x;
        touchCurrentX = x;
        isDragging = true;
        const targetWrapper = target.closest('.task-card-wrapper');
        if (swipedCardWrapper && swipedCardWrapper !== targetWrapper) {
            swipedCardWrapper.classList.remove('is-swiped');
            swipedCardWrapper = null;
        }
    };

    const handleSwipeMove = (x, target) => {
        if (!isDragging) return;
        const cardWrapper = target.closest('.task-card-wrapper');
        if (!cardWrapper) return;

        touchCurrentX = x;
        const deltaX = touchCurrentX - touchStartX;

        if (deltaX < 0) {
            const distance = Math.max(deltaX, -80);
            cardWrapper.querySelector('.task-card').style.transform = `translateX(${distance}px)`;
        }
    };

    const handleSwipeEnd = (target) => {
        if (!isDragging) return;
        isDragging = false;

        const cardWrapper = target.closest('.task-card-wrapper');
        if (!cardWrapper) return;

        const card = cardWrapper.querySelector('.task-card');
        const deltaX = touchCurrentX - touchStartX;

        card.style.transform = '';

        if (deltaX < -swipeThreshold) {
            cardWrapper.classList.add('is-swiped');
            swipedCardWrapper = cardWrapper;
        } else {
            cardWrapper.classList.remove('is-swiped');
            if (swipedCardWrapper === cardWrapper) {
                swipedCardWrapper = null;
            }
        }
        
        touchStartX = 0;
        touchCurrentX = 0;
    };

    taskListContainer.addEventListener('touchstart', (e) => {
        handleSwipeStart(e.touches[0].clientX, e.target);
    }, { passive: true });

    taskListContainer.addEventListener('touchmove', (e) => {
        handleSwipeMove(e.touches[0].clientX, e.target);
    }, { passive: true });

    taskListContainer.addEventListener('touchend', (e) => {
        handleSwipeEnd(e.target);
    });
    
    taskListContainer.addEventListener('mousedown', (e) => {
        if (e.target.closest('.task-card-start-btn') || e.target.closest('.task-card-delete-btn') || e.target.closest('.task-card-edit-btn')) return;
        handleSwipeStart(e.clientX, e.target);
    });

    taskListContainer.addEventListener('mousemove', (e) => {
        handleSwipeMove(e.clientX, e.target);
    });

    taskListContainer.addEventListener('mouseup', (e) => {
        handleSwipeEnd(e.target);
    });
    
    taskListContainer.addEventListener('mouseleave', (e) => {
        if (isDragging) {
            handleSwipeEnd(e.target);
        }
    });


    if (taskListContainer) {
        taskListContainer.addEventListener('click', async (e) => {
            const startBtn = e.target.closest('.task-card-start-btn');
            const deleteBtn = e.target.closest('.task-card-delete-btn');
            const editBtn = e.target.closest('.task-card-edit-btn');
            const cardWrapper = e.target.closest('.task-card-wrapper');

            if (editBtn && cardWrapper) {
                const task = db.pomodoroTasks.find(t => t.id === cardWrapper.dataset.id);
                if (!task) return;
                if (pomodoroSession?.task.id === task.id && pomodoroSession.status !== 'done') { showToast('请结束当前一轮后再编辑任务'); return; }
                createTaskBtn.click(); editingTaskId = task.id;
                byId('pomodoro-create-title').textContent = '编辑专注任务'; byId('pomodoro-create-submit').textContent = '保存任务';
                byId('pomodoro-task-name').value = task.name;
                document.querySelector('input[name="pomodoro-mode"][value="' + task.mode + '"]').checked = true;
                durationOptions.classList.toggle('visible', task.mode === 'countdown');
                const match = Array.from(durationPills).find(pill => Number(pill.dataset.duration) === task.duration);
                durationPills.forEach(pill => pill.classList.toggle('active', pill === (match || Array.from(durationPills).find(p => p.dataset.duration === 'custom'))));
                customDurationInput.style.display = match ? 'none' : 'block'; customDurationInput.value = task.duration;
                loadCreateCharacters(task.settings?.boundCharId);
            } else if (deleteBtn && cardWrapper) {
                const taskId = cardWrapper.dataset.id;
                if (pomodoroSession?.task.id === taskId && pomodoroSession.status !== 'done') { showToast('请结束当前一轮后再删除任务'); return; }
                if (await customConfirm('确定要删除这个任务吗？已保存的专注记录会保留。', '删除任务')) {
                    db.pomodoroTasks = db.pomodoroTasks.filter(t => t.id !== taskId);
                    await saveGlobalSettings(['pomodoroTasks']);
                    renderPomodoroTasks();
                    showToast('任务已删除');
                }
            } else if (startBtn && cardWrapper) {
                const taskId = cardWrapper.dataset.id;
                const task = db.pomodoroTasks.find(t => t.id === taskId);
                
                if (task) await beginTask(task);
            } else if (cardWrapper && !cardWrapper.classList.contains('is-swiped')) {
                if (swipedCardWrapper) {
                    swipedCardWrapper.classList.remove('is-swiped');
                    swipedCardWrapper = null;
                }
            }
        });
    }
}

function setupPomodoroSettings() {
    const settingsBtn = document.getElementById('pomodoro-focus-settings-btn');
    const settingsModal = document.getElementById('pomodoro-settings-modal');
    const closeSettingsBtn = document.getElementById('close-pomodoro-settings-btn');
    const settingsForm = document.getElementById('pomodoro-settings-form');
    const focusBgUpload = document.getElementById('pomodoro-focus-bg-upload');
    const taskCardBgUpload = document.getElementById('pomodoro-task-card-bg-upload');

    settingsBtn?.addEventListener('click', () => {
        if (currentPomodoroTask) {
            currentPomodoroSettingsContext = currentPomodoroTask.settings;
            loadSettingsToPomodoroSidebar(currentPomodoroSettingsContext);
            if (settingsModal) settingsModal.classList.add('visible');
        } else {
            showToast('没有正在进行的专注任务');
        }
    });

    closeSettingsBtn?.addEventListener('click', () => {
        if (settingsModal) settingsModal.classList.remove('visible');
    });

    // 点击遮罩层关闭
    settingsModal?.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.remove('visible');
        }
    });

    settingsForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (currentPomodoroSettingsContext) {
            const saved = await savePomodoroSettingsFromSidebar(currentPomodoroSettingsContext);
            if (!saved) return;
        }
        if (settingsModal) settingsModal.classList.remove('visible');
    });

    focusBgUpload?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file && currentPomodoroSettingsContext) {
            try {
                const compressedUrl = await compressImage(file, { quality: 0.85, maxWidth: 1080, maxHeight: 1920 });
                document.getElementById('pomodoro-focus-bg-url').value = compressedUrl;
                currentPomodoroSettingsContext.focusBackground = compressedUrl;
                applyPomodoroBackgrounds();
                showToast('专注背景已更新，请保存设置');
            } catch (error) {
                showToast('背景压缩失败');
            }
        }
    });

    taskCardBgUpload?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file && currentPomodoroSettingsContext) {
            try {
                const compressedUrl = await compressImage(file, { quality: 0.8, maxWidth: 800, maxHeight: 800 });
                currentPomodoroSettingsContext.taskCardBackground = compressedUrl;
                document.getElementById('pomodoro-task-card-bg-url').value = compressedUrl;
                showToast('卡片背景已更新，请保存设置');
            } catch (error) {
                showToast('背景压缩失败');
            }
        }
    });
}

function loadSettingsToPomodoroSidebar(settings) {
    const charSelect = document.getElementById('pomodoro-char-select');
    const userPersonaSelect = document.getElementById('pomodoro-user-persona-select');

    charSelect.innerHTML = '<option value="">不绑定</option>';
    db.characters.forEach(char => {
        const option = document.createElement('option');
        option.value = char.id;
        option.textContent = char.remarkName;
        if (settings.boundCharId === char.id) {
            option.selected = true;
        }
        charSelect.appendChild(option);
    });

    userPersonaSelect.innerHTML = '<option value="">默认</option>';
    (db.myPersonaPresets || []).forEach(preset => {
        const option = document.createElement('option');
        option.value = preset.name;
        option.textContent = preset.name;
        if (settings.userPersona === preset.name) {
            option.selected = true;
        }
        userPersonaSelect.appendChild(option);
    });

    document.getElementById('pomodoro-companion-style').value = settings.companionStyle || (settings === db.pomodoroSettings ? 'quiet' : 'legacy');
    document.getElementById('pomodoro-companion-preference').value = settings.companionPreference || '';
    document.getElementById('pomodoro-end-sound').value = settings.endSound === false ? 'off' : 'on';
    document.getElementById('pomodoro-encouragement-minutes').value = settings.encouragementMinutes ?? 25;
    document.getElementById('pomodoro-poke-limit').value = settings.pokeLimit ?? 5;
    document.getElementById('pomodoro-focus-bg-url').value = settings.focusBackground || '';
    document.getElementById('pomodoro-task-card-bg-url').value = settings.taskCardBackground || '';
}

async function savePomodoroSettingsFromSidebar(settings) {
    const oldCharId = settings.boundCharId;
    const oldStyle = settings.companionStyle, oldPreference = settings.companionPreference;
    const newCharId = document.getElementById('pomodoro-char-select').value;

    const encouragement = Number(document.getElementById('pomodoro-encouragement-minutes').value);
    const pokeLimit = Number(document.getElementById('pomodoro-poke-limit').value);
    if (!Number.isFinite(encouragement) || encouragement < 1 || !Number.isInteger(pokeLimit) || pokeLimit < 0) {
        showToast('鼓励间隔至少为1分钟，互动次数为非负整数'); return false;
    }
    pomodoroController?.cancelReply();
    settings.boundCharId = newCharId || null;
    settings.companionStyle = document.getElementById('pomodoro-companion-style').value;
    settings.companionPreference = document.getElementById('pomodoro-companion-preference').value.trim();
    settings.endSound = document.getElementById('pomodoro-end-sound').value !== 'off';
    settings.userPersona = document.getElementById('pomodoro-user-persona-select').value;
    settings.encouragementMinutes = encouragement;
    settings.pokeLimit = pokeLimit;
    settings.focusBackground = document.getElementById('pomodoro-focus-bg-url').value.trim();
    settings.taskCardBackground = document.getElementById('pomodoro-task-card-bg-url').value.trim();
    
    if (settings === currentPomodoroTask?.settings) {
        const sourceTask = db.pomodoroTasks.find(t => t.id === currentPomodoroTask.id);
        if (sourceTask) sourceTask.settings = JSON.parse(JSON.stringify(settings));
        await pomodoroController?.persist();
    }
    const saved = await saveGlobalSettings(['pomodoroSettings', 'pomodoroTasks']);
    if (!saved) return false;
    applyPomodoroBackgrounds();

    const focusAvatarEl = document.querySelector('#pomodoro-focus-screen .focus-avatar');
    if (settings.boundCharId) {
        const boundChar = db.characters.find(c => c.id === settings.boundCharId);
        if (boundChar && focusAvatarEl) {
            focusAvatarEl.src = boundChar.avatar;
        }
    } else if (focusAvatarEl) {
        focusAvatarEl.src = 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg'; 
    }

    if (oldCharId !== settings.boundCharId || oldStyle !== settings.companionStyle || oldPreference !== settings.companionPreference) {
        const focusMessageBubble = document.querySelector('#pomodoro-focus-screen .focus-message-bubble');
        if (focusMessageBubble) {
            focusMessageBubble.classList.remove('visible');
            focusMessageBubble.querySelector('p').textContent = '';
        }
    }

    showToast('专注设置已保存');
    pomodoroController?.refresh();
    return true;
}

function applyPomodoroBackgrounds() {
    const focusScreen = document.getElementById('pomodoro-focus-screen');
    
    if (currentPomodoroTask && currentPomodoroTask.settings.focusBackground) {
        focusScreen.style.backgroundImage = `linear-gradient(rgba(255,255,255,.72), rgba(255,255,255,.72)), url(${JSON.stringify(currentPomodoroTask.settings.focusBackground)})`;
        focusScreen.style.backgroundSize = 'cover';
        focusScreen.style.backgroundPosition = 'center';
    } else {
        focusScreen.style.backgroundImage = 'none';
    }
}

function setupPomodoroGlobalSettings() {
    const settingsBtn = document.getElementById('pomodoro-settings-btn');
    const actionSheet = document.getElementById('pomodoro-global-settings-actionsheet');
    const linkBtn = document.getElementById('link-global-pomodoro-world-book-btn');
    const closeSheetBtn = document.getElementById('close-pomodoro-global-settings-btn');
    const modal = document.getElementById('global-pomodoro-world-book-selection-modal');
    const selectionList = document.getElementById('global-pomodoro-world-book-selection-list');
    const saveBtn = document.getElementById('save-global-pomodoro-world-book-selection-btn');

    settingsBtn?.addEventListener('click', () => {
        actionSheet.classList.add('visible');
    });

    closeSheetBtn?.addEventListener('click', () => {
        actionSheet.classList.remove('visible');
    });

    actionSheet?.addEventListener('click', (e) => {
        if (e.target === actionSheet) {
            actionSheet.classList.remove('visible');
        }
    });

    document.getElementById('pomodoro-default-settings-btn')?.addEventListener('click', () => {
        actionSheet.classList.remove('visible'); pomodoroController?.openSettings();
    });

    linkBtn?.addEventListener('click', () => {
        actionSheet.classList.remove('visible');
        if (!db.pomodoroSettings) {
            db.pomodoroSettings = { globalWorldBookIds: [] };
        }
        const selectedIds = db.pomodoroSettings.globalWorldBookIds || [];
        renderCategorizedWorldBookList(selectionList, db.worldBooks, selectedIds, 'global-pomodoro-wb-select');
        modal.classList.add('visible');
    });

    saveBtn?.addEventListener('click', async () => {
        const selectedIds = Array.from(selectionList.querySelectorAll('.item-checkbox:checked')).map(input => input.value);
        if (!db.pomodoroSettings) {
            db.pomodoroSettings = {};
        }
        db.pomodoroSettings.globalWorldBookIds = selectedIds;
        await saveData();
        modal.classList.remove('visible');
        showToast('全局专注世界书已更新');
    });
}
