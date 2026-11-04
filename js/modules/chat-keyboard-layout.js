// Opt-in chat layout only. Never alter the user's CSS or store viewport measurements.
(() => {
    const className = 'chat-keyboard-adjusting';
    const properties = ['--chat-keyboard-height', '--chat-keyboard-top', '--chat-keyboard-gap'];
    const number = (value, fallback, max) => Number.isFinite(Number(value))
        ? Math.max(0, Math.min(max, Math.round(Number(value)))) : fallback;
    function settings() {
        const value = db.chatKeyboardSettings || {};
        return {
            enabled: value.enabled === true,
            automatic: value.automatic !== false,
            extraOffset: number(value.extraOffset ?? 0, 0, 160),
            manualHeight: number(value.manualHeight ?? 300, 300, 500),
        };
    }

    let phone, room, input, viewport, frame = 0, initialized = false;
    let fullHeight = 0, width = 0, keyboardOpen = false, shiftedTop = 0;
    function reset() {
        phone?.classList.remove(className);
        properties.forEach(name => phone?.style.removeProperty(name));
        shiftedTop = 0;
        keyboardOpen = false;
    }
    function sync() {
        frame = 0;
        const height = viewport?.height || window.innerHeight;
        const currentWidth = window.innerWidth;
        const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight, height);
        if (Math.abs(width - currentWidth) > 1) {
            width = currentWidth;
            fullHeight = layoutHeight;
            keyboardOpen = false;
        }
        fullHeight = Math.max(fullHeight, layoutHeight);
        const focused = document.activeElement === input;
        const config = settings();
        const shrunken = fullHeight - height > Math.min(120, fullHeight * 0.2);
        if (!config.enabled || !room?.classList.contains('active') || document.hidden
            || Math.abs((viewport?.scale || 1) - 1) > 0.05) {
            reset();
            return;
        }
        const active = config.automatic
            ? shrunken && (focused || keyboardOpen)
            : focused || (keyboardOpen && shrunken);
        if (!active) { reset(); return; }

        const area = document.getElementById('message-area');
        const atBottom = area && area.scrollHeight - area.clientHeight - area.scrollTop < 32;
        const header = room.querySelector('.app-header:not([style*="display: none"])');
        const wrapper = room.querySelector('.chat-input-wrapper');
        const minimum = (header?.offsetHeight || 64) + (wrapper?.offsetHeight || 56);
        const targetHeight = config.automatic ? height
            : Math.min(fullHeight, Math.max(minimum, fullHeight - config.manualHeight));
        const gap = config.automatic ? Math.min(config.extraOffset, Math.max(0, targetHeight - minimum)) : 0;
        // offsetTop handles browsers that pan their visible viewport when the keyboard opens.
        const originalTop = phone.getBoundingClientRect().top - shiftedTop;
        const top = Math.max(0, (viewport?.offsetTop || 0) - originalTop);
        phone.style.setProperty(properties[0], `${Math.max(1, targetHeight)}px`);
        phone.style.setProperty(properties[1], `${top}px`);
        phone.style.setProperty(properties[2], `${gap}px`);
        phone.classList.add(className);
        shiftedTop = top;
        keyboardOpen = true;
        if (atBottom) area.scrollTop = area.scrollHeight;
    }
    function schedule() {
        if (!frame) frame = requestAnimationFrame(sync);
    }
    function init() {
        if (initialized) return;
        phone = document.querySelector('.phone-screen');
        room = document.getElementById('chat-room-screen');
        input = document.getElementById('message-input');
        if (!phone || !room || !input) return;
        initialized = true;
        viewport = window.visualViewport;
        width = window.innerWidth;
        fullHeight = Math.max(window.innerHeight, document.documentElement.clientHeight, viewport?.height || 0);
        viewport?.addEventListener('resize', schedule);
        viewport?.addEventListener('scroll', schedule);
        window.addEventListener('resize', schedule);
        window.addEventListener('pageshow', schedule);
        document.addEventListener('visibilitychange', schedule);
        input.addEventListener('focus', schedule);
        input.addEventListener('blur', schedule);
        new MutationObserver(schedule).observe(room, { attributes: true, attributeFilter: ['class'] });
        schedule();
    }

    function settingsHtml() {
        return `<section class="cust-card" id="chat-keyboard-settings">
            <div class="cust-card-header">
                <div><h3 class="cust-card-title">聊天输入框避让</h3>
                <p class="cust-card-subtitle">全局生效，默认关闭。开启后仅在聊天打字时调整布局，关闭后恢复原有布局与美化。</p></div>
                <label class="kkt-switch"><input type="checkbox" id="chat-keyboard-enabled" aria-label="聊天输入框避让"><span class="kkt-slider"></span></label>
            </div>
            <div id="chat-keyboard-options" hidden>
                <div class="cust-field-item-row"><label for="chat-keyboard-automatic">自动避开键盘</label>
                    <label class="kkt-switch"><input type="checkbox" id="chat-keyboard-automatic"><span class="kkt-slider"></span></label></div>
                <div id="chat-keyboard-auto-options" class="cust-field-item">
                    <label for="chat-keyboard-extra">额外上移距离：<output id="chat-keyboard-extra-value">0</output> px</label>
                    <input type="range" id="chat-keyboard-extra" min="0" max="160" step="1">
                </div>
                <div id="chat-keyboard-manual-options" class="cust-field-item" hidden>
                    <label for="chat-keyboard-manual">手动上移距离：<output id="chat-keyboard-manual-value">300</output> px</label>
                    <input type="range" id="chat-keyboard-manual" min="0" max="500" step="1">
                </div>
                <p class="cust-card-subtitle">自动模式下可微调输入框与键盘的间距；若仍被遮挡，关闭自动避让，手动设置上移距离。设置后回到聊天试打，不改变系统键盘的位置。</p>
            </div>
            <p id="chat-keyboard-save-status" role="status" class="cust-card-subtitle"></p>
        </section>`;
    }
    let saving = false;
    function renderSettings() {
        const card = document.getElementById('chat-keyboard-settings');
        if (!card) return;
        const config = settings();
        card.querySelector('#chat-keyboard-enabled').checked = config.enabled;
        card.querySelector('#chat-keyboard-automatic').checked = config.automatic;
        card.querySelector('#chat-keyboard-options').hidden = !config.enabled;
        card.querySelector('#chat-keyboard-auto-options').hidden = !config.automatic;
        card.querySelector('#chat-keyboard-manual-options').hidden = config.automatic;
        for (const [id, value] of [['extra', config.extraOffset], ['manual', config.manualHeight]]) {
            card.querySelector(`#chat-keyboard-${id}`).value = value;
            card.querySelector(`#chat-keyboard-${id}-value`).textContent = value;
        }
        card.querySelectorAll('input').forEach(control => { control.disabled = saving; });
    }
    function bindSettings() {
        const card = document.getElementById('chat-keyboard-settings');
        if (!card || card.dataset.bound) return;
        card.dataset.bound = 'true';
        renderSettings();
        card.addEventListener('input', event => {
            const id = event.target.id;
            if (id === 'chat-keyboard-extra' || id === 'chat-keyboard-manual') {
                card.querySelector(`#${id}-value`).textContent = event.target.value;
            }
        });
        card.addEventListener('change', async event => {
            if (saving) return;
            const control = event.target;
            const fields = {
                'chat-keyboard-enabled': 'enabled', 'chat-keyboard-automatic': 'automatic',
                'chat-keyboard-extra': 'extraOffset', 'chat-keyboard-manual': 'manualHeight',
            };
            const field = fields[control.id];
            if (!field) return;
            const previous = db.chatKeyboardSettings;
            db.chatKeyboardSettings = { ...settings(), [field]: control.type === 'checkbox' ? control.checked : Number(control.value) };
            db.chatKeyboardSettings = settings();
            saving = true;
            renderSettings();
            schedule();
            let saved = false;
            try { saved = await saveGlobalSettings(['chatKeyboardSettings']); }
            catch (error) { console.warn('Chat keyboard settings save failed:', error); }
            if (!saved) db.chatKeyboardSettings = previous;
            saving = false;
            renderSettings();
            schedule();
            const status = document.getElementById('chat-keyboard-save-status');
            if (status) status.textContent = saved ? '已保存' : '保存失败，已恢复之前的设置，请重试。';
        });
    }
    window.ChatKeyboardLayout = { init, settingsHtml, bindSettings };
})();
