(function () {
    function estimateTokens(text) {
        const value = String(text || '');
        const chinese = (value.match(/[\u4e00-\u9fa5]/g) || []).length;
        return Math.ceil(chinese * 1.2 + (value.length - chinese) * 0.4);
    }

    // Keep tools in the viewport and preserve the background's focus and scroll.
    // A nested variable picker only disables the editor beneath it.
    function createPromptDialog(screen, id, title, subtitle, onClose = () => {}) {
        const modal = document.createElement('div');
        modal.id = id;
        modal.className = 'modal-overlay moments-prompt-modal prompt-studio-modal';
        modal.innerHTML = `
            <section class="moments-prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="${id}-title" tabindex="-1">
                <header class="moments-prompt-dialog-head">
                    <div><span></span><h2 id="${id}-title"></h2></div>
                    <button type="button" class="moments-prompt-dialog-close" aria-label="关闭${title}">×</button>
                </header>
                <div class="moments-prompt-dialog-body"></div>
            </section>`;
        const dialog = modal.querySelector('[role="dialog"]');
        const heading = modal.querySelector('h2');
        heading.textContent = title;
        modal.querySelector('header span').textContent = subtitle;
        const body = modal.querySelector('.moments-prompt-dialog-body');
        screen.append(modal);
        let opened = false;
        let inertNodes = [];
        let returnFocus = null;
        function syncViewport() {
            const viewport = window.visualViewport;
            if (!viewport) return;
            modal.style.top = `${viewport.offsetTop}px`;
            modal.style.height = `${viewport.height}px`;
        }
        function close(restoreFocus = true) {
            if (!opened) return;
            opened = false;
            modal.classList.remove('visible');
            inertNodes.forEach(node => { node.inert = false; });
            inertNodes = [];
            window.visualViewport?.removeEventListener('resize', syncViewport);
            window.visualViewport?.removeEventListener('scroll', syncViewport);
            onClose();
            if (restoreFocus && returnFocus?.isConnected && !returnFocus.closest('[inert]')) returnFocus.focus({ preventScroll: true });
        }
        function open(trigger = document.activeElement) {
            if (opened) return;
            opened = true;
            returnFocus = trigger;
            modal.inert = false;
            inertNodes = [...screen.children].filter(node => node !== modal && !node.inert);
            inertNodes.forEach(node => { node.inert = true; });
            modal.style.zIndex = String(10000 + screen.querySelectorAll('.modal-overlay.visible').length);
            modal.classList.add('visible');
            syncViewport();
            window.visualViewport?.addEventListener('resize', syncViewport);
            window.visualViewport?.addEventListener('scroll', syncViewport);
            dialog.focus({ preventScroll: true });
        }
        modal.querySelector('header button').addEventListener('click', () => close());
        modal.addEventListener('click', event => { if (event.target === modal) close(); });
        modal.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
            if (event.key !== 'Tab') return;
            const controls = [...dialog.querySelectorAll('button, input, select, textarea')].filter(node => !node.disabled && node.getClientRects().length);
            const first = controls[0], last = controls.at(-1);
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first?.focus(); }
        });
        new MutationObserver(() => { if (opened && !modal.classList.contains('visible')) close(); })
            .observe(modal, { attributes: true, attributeFilter: ['class'] });
        return { modal, dialog, body, heading, open, close, isOpen: () => opened };
    }

    function movePromptDrawer(screen, panel, closeButton, title, subtitle) {
        const overlay = createPromptDialog(screen, `${panel.id}-modal`, title, subtitle, () => { panel.hidden = true; });
        const head = panel.querySelector('.prompt-studio-drawer-head');
        const note = head.querySelector('p');
        if (note) panel.prepend(note);
        head.hidden = true;
        closeButton.className = 'moments-prompt-dialog-close';
        overlay.modal.querySelector('header button').replaceWith(closeButton);
        overlay.body.append(panel);
        closeButton.addEventListener('click', () => overlay.close());
        return { ...overlay, open(trigger) { panel.hidden = false; overlay.open(trigger); } };
    }

    function setupPromptStudioEditor() {
        const studio = window.PromptStudio;
        const room = db.magicRoom || (db.magicRoom = {});
        const root = document.getElementById('magic-room-prompt-editor');
        if (!studio || !root) return null;
        if (root.dataset.promptStudioReady === 'true') return window.PromptStudioUI || null;
        root.dataset.promptStudioReady = 'true';

        const itemPanel = document.getElementById('prompt-studio-items-panel');
        const sourcePanel = document.getElementById('prompt-studio-source-panel');
        const itemList = document.getElementById('prompt-studio-item-list');
        const status = document.getElementById('prompt-studio-status');
        const sourceTextarea = document.getElementById('magic-room-custom-prompt');
        const variablesDrawer = document.getElementById('prompt-studio-variables');
        const variableList = document.getElementById('prompt-studio-variable-list');
        const previewPanel = document.getElementById('prompt-studio-preview-panel');
        const previewCharacter = document.getElementById('prompt-studio-preview-character');
        const previewContent = document.getElementById('prompt-studio-preview-content');
        const previewMeta = document.getElementById('prompt-studio-preview-meta');
        const previewWarnings = document.getElementById('prompt-studio-preview-warnings');
        const modeButtons = [...root.querySelectorAll('[data-prompt-mode]')];

        let mode = room.promptEditMode || (Array.isArray(room.customPromptItems) && room.customPromptItems.length ? 'items' : (room.customPromptTemplate ? 'source' : 'items'));
        let items = studio.normalizeItems(room.customPromptItems);
        if (!items.length) items = studio.createDefaultItems();
        else if (!items.some(entry => entry.id === 'context.moments' || entry.content.includes('{{动态能力与已看内容}}'))) items.push(studio.createDefaultItems().find(entry => entry.id === 'context.moments'));
        let activeTextarea = null;
        let editing = null;
        let insertAfterId = '';
        let dirty = false;
        const openGroups = new Set();
        const screen = document.getElementById('magic-room-screen');
        const variablesDialog = movePromptDrawer(screen, variablesDrawer, document.getElementById('prompt-studio-close-variables'), '变量库', '系统提示词');
        const previewDialog = movePromptDrawer(screen, previewPanel, document.getElementById('prompt-studio-close-preview'), '最终提示词预览', '系统提示词');
        const editorDialog = createPromptDialog(screen, 'prompt-studio-editor-modal', '编辑条目', '系统提示词', () => {
            variablesDialog.close(false);
            editing = null;
            activeTextarea = null;
            editorDialog.body.replaceChildren();
        });
        const footer = document.createElement('footer');
        footer.className = 'moments-prompt-dialog-footer';
        footer.innerHTML = '<p>完成后加入编排，点击「保存设置」生效。</p><div><button type="button" class="btn btn-secondary" data-editor-cancel>取消</button><button type="button" class="btn btn-primary" data-editor-done>完成</button></div>';
        editorDialog.dialog.append(footer);
        footer.querySelector('[data-editor-cancel]').addEventListener('click', () => editorDialog.close());
        footer.querySelector('[data-editor-done]').addEventListener('click', commitEditor);

        function markDirty(message = '有未保存的修改') {
            dirty = true;
            status.textContent = message;
        }

        function setMode(nextMode, mark = true) {
            mode = nextMode === 'source' ? 'source' : 'items';
            modeButtons.forEach(button => {
                const selected = button.dataset.promptMode === mode;
                button.classList.toggle('active', selected);
                button.setAttribute('aria-selected', String(selected));
            });
            itemPanel.hidden = mode !== 'items';
            sourcePanel.hidden = mode !== 'source';
            editorDialog.close();
            variablesDialog.close();
            previewDialog.close();
            if (mark) markDirty(mode === 'items' ? '已切换为条目编辑，保存后生效' : '已切换为完整源码，保存后生效');
        }

        function categoryOptions(selected) {
            const fragment = document.createDocumentFragment();
            Object.entries(studio.CATEGORY_LABELS).forEach(([value, label]) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;
                option.selected = value === selected;
                fragment.appendChild(option);
            });
            return fragment;
        }

        function conditionOptions(selected) {
            const conditions = [
                ['always', '始终生效'], ['characterTime', '已开启角色年龄或时区'], ['onlineRole', '开启纯线上角色'],
                ['weather', '有天气信息'], ['activeNode', '存在当前节点'], ['worldBefore', '世界书·前不为空'],
                ['worldMiddle', '世界书·中不为空'], ['worldAfter', '世界书·后不为空'], ['userContext', '用户设定不为空'],
                ['relationshipContext', '存在关系/手机功能上下文'], ['enhancementContext', '存在提醒/头像/活人运转'],
                ['memory', '共同回忆不为空'], ['statusPanel', '已开启状态栏'], ['bilingual', '已开启双语模式'],
                ['autoFavorite', '已开启角色自主收藏'], ['userFavorites', '角色可感知用户收藏'],
                ['moments', '已开启动态能力']
            ];
            const fragment = document.createDocumentFragment();
            conditions.forEach(([value, label]) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;
                option.selected = value === selected;
                fragment.appendChild(option);
            });
            return fragment;
        }

        function createButton(text, className, onClick) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = className;
            button.textContent = text;
            button.addEventListener('click', onClick);
            return button;
        }

        async function confirmAction(message, title) {
            if (typeof customConfirm === 'function') return customConfirm(message, title);
            return false;
        }

        function renderItems() {
            itemList.replaceChildren();
            let group = null;
            let groupCategory = null;
            let groupSize = 0;
            let groupEnabled = 0;
            // Fold consecutive runs only: visual order and cross-category moves
            // must continue to match the exact order used by the prompt compiler.
            items.forEach((entry, index) => {
                if (!group || groupCategory !== entry.category) {
                    groupCategory = entry.category;
                    groupSize = 0;
                    groupEnabled = 0;
                    group = document.createElement('details');
                    group.className = 'prompt-studio-category-group';
                    group.dataset.groupId = entry.id;
                    const summary = document.createElement('summary');
                    const label = document.createElement('span');
                    label.className = 'prompt-studio-category-name';
                    label.textContent = studio.CATEGORY_LABELS[entry.category] || '自定义';
                    const count = document.createElement('span');
                    count.className = 'prompt-studio-category-count';
                    const chevron = document.createElement('span');
                    chevron.className = 'prompt-studio-category-chevron';
                    chevron.setAttribute('aria-hidden', 'true');
                    summary.append(label, count, chevron);
                    group.appendChild(summary);
                    group.open = openGroups.has(entry.id);
                    const currentGroup = group;
                    currentGroup.addEventListener('toggle', () => {
                        // Ignore toggle events queued for a group removed by a render.
                        if (!itemList.contains(currentGroup)) return;
                        if (currentGroup.open) openGroups.add(currentGroup.dataset.groupId);
                        else openGroups.delete(currentGroup.dataset.groupId);
                    });
                    itemList.appendChild(group);
                }
                const card = document.createElement('div');
                card.className = 'prompt-studio-item';
                card.dataset.itemId = entry.id;

                const head = document.createElement('div');
                head.className = 'prompt-studio-item-head';
                const order = document.createElement('div');
                order.className = 'prompt-studio-order';
                const up = createButton('↑', '', () => moveItem(index, -1));
                const down = createButton('↓', '', () => moveItem(index, 1));
                up.setAttribute('aria-label', `上移条目：${entry.name}`);
                down.setAttribute('aria-label', `下移条目：${entry.name}`);
                up.disabled = index === 0;
                down.disabled = index === items.length - 1;
                order.append(up, down);

                const summary = document.createElement('div');
                summary.className = 'prompt-studio-item-summary';
                const name = document.createElement('div');
                name.className = 'prompt-studio-item-name';
                name.textContent = `${String(index + 1).padStart(2, '0')} · ${entry.name}`;
                const meta = document.createElement('div');
                meta.className = 'prompt-studio-item-meta';
                const category = document.createElement('span');
                category.textContent = studio.CATEGORY_LABELS[entry.category] || '自定义';
                const token = document.createElement('span');
                token.textContent = `约 ${estimateTokens(entry.content)} Token`;
                const condition = document.createElement('span');
                condition.textContent = entry.condition === 'always' ? '始终' : '条件生效';
                meta.append(category, token, condition);
                summary.append(name, meta);

                const toggleLabel = document.createElement('label');
                toggleLabel.className = 'kkt-switch prompt-studio-item-toggle';
                const toggle = document.createElement('input');
                toggle.type = 'checkbox';
                toggle.setAttribute('aria-label', `启用条目：${entry.name}`);
                toggle.checked = entry.enabled;
                const slider = document.createElement('span');
                slider.className = 'kkt-slider';
                toggle.addEventListener('change', () => {
                    entry.enabled = toggle.checked;
                    markDirty();
                    renderItems();
                });
                toggleLabel.append(toggle, slider);
                const edit = createButton('编辑', 'btn btn-small btn-secondary prompt-studio-edit-btn', () => openEditor(entry, edit));
                edit.setAttribute('aria-label', `编辑条目：${entry.name}`);
                edit.setAttribute('aria-haspopup', 'dialog');
                head.append(order, summary, toggleLabel, edit);
                card.appendChild(head);

                group.appendChild(card);
                groupSize += 1;
                if (entry.enabled) groupEnabled += 1;
                group.querySelector('.prompt-studio-category-count').textContent = `${groupSize} 条 · 已启用 ${groupEnabled}`;
            });
            const enabledCount = items.filter(entry => entry.enabled).length;
            if (!dirty) status.textContent = `${items.length} 个条目，已启用 ${enabledCount} 个`;
        }

        function openEditor(entry, trigger) {
            if (editing) return;
            editing = studio.clone(entry);
            insertAfterId = '';
            editorDialog.heading.textContent = items.some(item => item.id === entry.id) ? '编辑条目' : '新增条目';
            renderEditor();
            editorDialog.open(trigger);
        }

        function commitEditor() {
            if (!editing) return;
            if (!editing.name.trim()) {
                showToast('请填写条目名称');
                editorDialog.body.querySelector('input').focus();
                return;
            }
            const entry = studio.clone(editing);
            entry.name = entry.name.trim();
            const index = items.findIndex(item => item.id === entry.id);
            if (index >= 0) items[index] = entry;
            else {
                const sourceIndex = items.findIndex(item => item.id === insertAfterId);
                items.splice(sourceIndex >= 0 ? sourceIndex + 1 : items.length, 0, entry);
            }
            editorDialog.close(false);
            markDirty();
            renderItems();
            const card = [...itemList.querySelectorAll('[data-item-id]')].find(node => node.dataset.itemId === entry.id);
            const group = card.closest('details');
            group.open = true;
            openGroups.add(group.dataset.groupId);
            card.scrollIntoView({ block: 'nearest' });
            card.querySelector('.prompt-studio-edit-btn').focus({ preventScroll: true });
        }

        function renderEditor() {
            const entry = editing;
            const editor = document.createElement('div');
            editor.className = 'prompt-studio-dialog-fields';
            function field(title, control, suffix) {
                const wrapper = createField(title);
                control.id = `prompt-studio-edit-${suffix}`;
                control.setAttribute('aria-label', title);
                wrapper.firstElementChild.htmlFor = control.id;
                wrapper.append(control);
                return wrapper;
            }
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = entry.name;
            nameInput.addEventListener('input', () => { entry.name = nameInput.value; });
            const nameField = field('条目名称', nameInput, 'name');
            nameField.classList.add('prompt-studio-dialog-name');

            const categorySelect = document.createElement('select');
            categorySelect.append(categoryOptions(entry.category));
            categorySelect.addEventListener('change', () => { entry.category = categorySelect.value; });
            const conditionSelect = document.createElement('select');
            conditionSelect.append(conditionOptions(entry.condition));
            conditionSelect.addEventListener('change', () => { entry.condition = conditionSelect.value; });

            const textarea = document.createElement('textarea');
            textarea.value = entry.content;
            textarea.placeholder = '在这里编写提示词，可插入变量…';
            textarea.spellcheck = false;
            activeTextarea = textarea;
            const contentField = field('提示词内容', textarea, 'content');
            contentField.classList.add('prompt-studio-dialog-content');
            const toolbar = document.createElement('div');
            toolbar.className = 'prompt-studio-content-toolbar';
            toolbar.append(contentField.firstElementChild, createButton('插入变量', 'btn btn-small btn-secondary', () => {
                activeTextarea = textarea;
                variablesDrawer.querySelector('p').textContent = '点击变量可插入当前条目的光标位置，关闭后继续编辑。';
                variablesDialog.open();
            }));
            contentField.prepend(toolbar);
            const count = document.createElement('div');
            count.className = 'prompt-studio-dialog-token-count';
            const updateCount = () => { count.textContent = `约 ${estimateTokens(entry.content)} Token`; };
            updateCount();
            textarea.addEventListener('input', () => { entry.content = textarea.value; updateCount(); });
            contentField.append(count);

            const actions = document.createElement('div');
            actions.className = 'prompt-studio-editor-actions';
            const defaultEntry = studio.createDefaultItems().find(item => item.id === entry.id);
            if (defaultEntry) actions.append(createButton('恢复本条默认', 'btn btn-small btn-secondary', async () => {
                if (!await confirmAction(`确定恢复“${entry.name}”的默认内容和条件吗？`, '恢复条目') || editing !== entry) return;
                editing = studio.clone(defaultEntry);
                renderEditor();
            }));
            actions.append(createButton('复制条目', 'btn btn-small btn-secondary', () => {
                if (items.some(item => item.id === entry.id)) insertAfterId = entry.id;
                editing = { ...studio.clone(entry), id: studio.uid('prompt-item'), name: `${entry.name} 副本`, protected: false };
                editorDialog.heading.textContent = '新增条目';
                renderEditor();
                editorDialog.body.scrollTop = 0;
                editorDialog.dialog.focus({ preventScroll: true });
            }));
            if (!entry.protected && items.some(item => item.id === entry.id)) actions.append(createButton('删除', 'btn btn-small btn-danger', async () => {
                if (!await confirmAction(`确定删除条目“${entry.name}”吗？`, '删除条目') || editing !== entry) return;
                items = items.filter(item => item.id !== entry.id);
                editorDialog.close(false);
                markDirty();
                renderItems();
                document.getElementById('prompt-studio-add-item').focus({ preventScroll: true });
            }));
            editor.append(nameField, field('条目分类', categorySelect, 'category'), field('生效条件', conditionSelect, 'condition'), contentField, actions);
            editorDialog.body.replaceChildren(editor);
        }

        function createField(labelText) {
            const field = document.createElement('div');
            field.className = 'prompt-studio-field';
            const label = document.createElement('label');
            label.textContent = labelText;
            field.appendChild(label);
            return field;
        }

        function moveItem(index, delta) {
            const target = index + delta;
            if (target < 0 || target >= items.length) return;
            [items[index], items[target]] = [items[target], items[index]];
            markDirty();
            renderItems();
        }

        function renderVariables() {
            variableList.replaceChildren();
            studio.VARIABLE_CATALOG.forEach(([, title, variables]) => {
                const group = document.createElement('div');
                group.className = 'prompt-studio-variable-group';
                const heading = document.createElement('div');
                heading.className = 'prompt-studio-variable-title';
                heading.textContent = title;
                const buttons = document.createElement('div');
                buttons.className = 'prompt-studio-variable-buttons';
                variables.forEach(([key, label]) => {
                    const button = createButton(`${label} ${key}`, 'prompt-studio-variable-btn', async () => {
                        if (activeTextarea && document.body.contains(activeTextarea)) { insertVariable(key); return; }
                        try {
                            await navigator.clipboard.writeText(key);
                            showToast('已复制变量');
                        } catch {
                            showToast('复制失败，请在编辑条目中使用「插入变量」');
                        }
                    });
                    button.title = key;
                    buttons.appendChild(button);
                });
                group.append(heading, buttons);
                variableList.appendChild(group);
            });
        }

        function insertVariable(key) {
            if (!activeTextarea || !document.body.contains(activeTextarea)) {
                showToast('请在编辑条目中点击「插入变量」，再选择变量');
                return;
            }
            const start = activeTextarea.selectionStart ?? activeTextarea.value.length;
            const end = activeTextarea.selectionEnd ?? start;
            activeTextarea.setRangeText(key, start, end, 'end');
            activeTextarea.dispatchEvent(new Event('input', { bubbles: true }));
            activeTextarea.focus();
        }

        function populatePreviewCharacters() {
            const previous = previewCharacter.value;
            previewCharacter.replaceChildren();
            const characters = (db.characters || []).filter(character => character && character.id);
            characters.forEach(character => {
                const option = document.createElement('option');
                option.value = character.id;
                option.textContent = character.remarkName || character.realName || '未命名角色';
                previewCharacter.appendChild(option);
            });
            if (characters.some(character => character.id === previous)) previewCharacter.value = previous;
        }

        function renderPreview() {
            const character = (db.characters || []).find(entry => entry.id === previewCharacter.value);
            if (!character) {
                previewContent.textContent = '当前没有可用的私聊角色。';
                previewMeta.textContent = '无法解析动态变量';
                previewWarnings.textContent = '';
                return;
            }
            const result = studio.compileItems(character, items, { preview: true });
            previewContent.textContent = result.prompt || '（最终提示词为空）';
            previewMeta.textContent = `${result.details.filter(entry => entry.text).length} 个条目实际注入 · 约 ${estimateTokens(result.prompt)} Token`;
            previewWarnings.textContent = result.unresolved.length ? `未识别变量：${result.unresolved.map(key => `{{${key}}}`).join('、')}` : '';
        }

        modeButtons.forEach(button => button.addEventListener('click', () => setMode(button.dataset.promptMode)));
        document.getElementById('prompt-studio-add-item').addEventListener('click', () => {
            if (editing) return;
            const entry = { id: studio.uid('prompt-item'), name: '新条目', category: 'custom', content: '', condition: 'always', enabled: true, protected: false };
            openEditor(entry, document.getElementById('prompt-studio-add-item'));
        });
        document.getElementById('prompt-studio-open-variables').addEventListener('click', () => {
            activeTextarea = null;
            variablesDrawer.querySelector('p').textContent = '点击变量可复制；编辑条目时，可用「插入变量」直接插入正文。';
            variablesDialog.open();
        });
        document.getElementById('prompt-studio-preview').addEventListener('click', () => {
            populatePreviewCharacters();
            renderPreview();
            previewDialog.open();
        });
        previewCharacter.addEventListener('change', renderPreview);
        document.getElementById('prompt-studio-reset-items').addEventListener('click', async () => {
            if (!await confirmAction('确定恢复全部默认条目吗？当前条目修改会被替换。', '恢复默认条目')) return;
            items = studio.createDefaultItems();
            editorDialog.close();
            markDirty();
            renderItems();
        });
        sourceTextarea.addEventListener('input', () => markDirty());

        const api = {
            getDraft() {
                return { mode, items: studio.clone(items), template: sourceTextarea.value };
            },
            loadPreset(preset) {
                if (!preset) return;
                mode = preset.mode || (Array.isArray(preset.items) && preset.items.length ? 'items' : 'source');
                if (Array.isArray(preset.items) && preset.items.length) {
                    items = studio.normalizeItems(studio.clone(preset.items));
                    if (!items.some(entry => entry.id === 'context.moments' || entry.content.includes('{{动态能力与已看内容}}'))) items.push(studio.createDefaultItems().find(entry => entry.id === 'context.moments'));
                }
                sourceTextarea.value = preset.template || '';
                editorDialog.close();
                dirty = true;
                setMode(mode, false);
                status.textContent = `已加载预设“${preset.name}”，保存后应用`;
                renderItems();
            },
            saveToDb() {
                room.promptEditMode = mode;
                room.customPromptItems = studio.clone(items);
                dirty = false;
                renderItems();
            },
            isDirty() { return dirty; }
        };
        window.PromptStudioUI = api;
        renderVariables();
        setMode(mode, false);
        renderItems();
        return api;
    }

    function setupMomentsPromptEditor() {
        const moments = window.Moments;
        const root = document.getElementById('magic-room-moments-prompts');
        if (!root || !moments?.getPromptItems) return null;
        if (root.dataset.editorReady) return window.MomentsPromptUI;
        root.dataset.editorReady = 'true';
        const list = document.getElementById('moments-prompt-item-list');
        const status = document.getElementById('moments-prompt-status');
        const preview = document.getElementById('moments-prompt-preview-panel');
        const previewCharacter = document.getElementById('moments-prompt-preview-character');
        const previewContent = document.getElementById('moments-prompt-preview-content');
        const definitions = new Map(moments.promptDefinitions.map(definition => [definition[0], definition]));
        let items = moments.getPromptItems();
        let dirty = false;
        const clone = value => JSON.parse(JSON.stringify(value));
        const confirmAction = message => typeof customConfirm === 'function' ? customConfirm(message, '动态提示词') : Promise.resolve(false);
        const screen = document.getElementById('magic-room-screen');
        const previewDialog = movePromptDrawer(screen, preview, document.getElementById('moments-prompt-close-preview'), '私聊注入预览', '动态能力');
        const modal = document.createElement('div');
        modal.id = 'moments-prompt-modal';
        modal.className = 'modal-overlay moments-prompt-modal';
        modal.innerHTML = `
            <section class="moments-prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="moments-prompt-dialog-title" aria-describedby="moments-prompt-dialog-note" tabindex="-1">
                <header class="moments-prompt-dialog-head">
                    <div><span>动态能力</span><h2 id="moments-prompt-dialog-title">编辑条目</h2></div>
                    <button type="button" class="moments-prompt-dialog-close" aria-label="关闭条目编辑">×</button>
                </header>
                <div class="moments-prompt-dialog-body"></div>
                <footer class="moments-prompt-dialog-footer">
                    <p id="moments-prompt-dialog-note">完成后返回列表，点击「保存设置」生效。</p>
                    <div>
                        <button type="button" class="btn btn-secondary" data-editor-cancel>取消</button>
                        <button type="button" class="btn btn-primary" data-editor-done>完成</button>
                    </div>
                </footer>
            </section>`;
        screen.append(modal);
        const dialog = modal.querySelector('[role="dialog"]');
        const dialogBody = modal.querySelector('.moments-prompt-dialog-body');
        let editing = null;
        let insertAfterId = '';
        let returnFocusId = '';
        let inertNodes = [];

        function syncViewport() {
            const viewport = window.visualViewport;
            if (!viewport) return;
            modal.style.top = `${viewport.offsetTop}px`;
            modal.style.height = `${viewport.height}px`;
        }
        function closeEditor() {
            if (!editing) return;
            editing = null;
            modal.classList.remove('visible');
            inertNodes.forEach(node => { node.inert = false; });
            inertNodes = [];
            window.visualViewport?.removeEventListener('resize', syncViewport);
            window.visualViewport?.removeEventListener('scroll', syncViewport);
            dialogBody.replaceChildren();
            const card = [...list.querySelectorAll('[data-moments-item-id]')].find(node => node.dataset.momentsItemId === returnFocusId);
            if (card) card.closest('details').open = true;
            (card?.querySelector('.prompt-studio-edit-btn') || document.getElementById('moments-prompt-add-item')).focus({ preventScroll: true });
        }
        function commitEditor() {
            if (!editing) return;
            const entry = clone(editing);
            const index = items.findIndex(item => item.id === entry.id);
            if (index < 0) {
                const sourceIndex = items.findIndex(item => item.id === insertAfterId);
                items.splice(sourceIndex >= 0 ? sourceIndex + 1 : items.length, 0, entry);
            }
            else items[index] = entry;
            returnFocusId = entry.id;
            markDirty();
            render();
            return entry;
        }
        function openEditor(entry) {
            returnFocusId = entry.id;
            editing = clone(entry);
            insertAfterId = '';
            renderEditor();
            if (!modal.classList.contains('visible')) {
                inertNodes = [...screen.children].filter(node => node !== modal && !node.inert);
                inertNodes.forEach(node => { node.inert = true; });
                modal.classList.add('visible');
                syncViewport();
                window.visualViewport?.addEventListener('resize', syncViewport);
                window.visualViewport?.addEventListener('scroll', syncViewport);
            }
            // Focus the dialog without raising the phone keyboard on every open.
            dialog.focus({ preventScroll: true });
        }
        modal.querySelector('[data-editor-cancel]').addEventListener('click', closeEditor);
        modal.querySelector('.moments-prompt-dialog-close').addEventListener('click', closeEditor);
        modal.querySelector('[data-editor-done]').addEventListener('click', () => { commitEditor(); closeEditor(); });
        modal.addEventListener('click', event => { if (event.target === modal) closeEditor(); });
        modal.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeEditor(); }
            if (event.key !== 'Tab') return;
            const controls = [...dialog.querySelectorAll('button, input, select, textarea')].filter(node => !node.disabled);
            const first = controls[0], last = controls.at(-1);
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
                event.preventDefault(); last.focus();
            } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
                event.preventDefault(); first.focus();
            }
        });
        // Screen navigation also closes global overlays. Release the background
        // and discard the unconfirmed editor buffer when that happens.
        new MutationObserver(() => {
            if (editing && !modal.classList.contains('visible')) closeEditor();
        }).observe(modal, { attributes: true, attributeFilter: ['class'] });
        function button(text, action, label) {
            const node = document.createElement('button');
            node.type = 'button';
            node.className = 'btn btn-small btn-secondary';
            node.textContent = text;
            if (label) node.setAttribute('aria-label', label);
            node.addEventListener('click', action);
            return node;
        }
        function markDirty() {
            dirty = true;
            updateStatus();
            preview.hidden = true;
        }
        function updateStatus() {
            status.textContent = `${items.length} 个条目，已启用 ${items.filter(entry => entry.enabled).length} 个${dirty ? ' · 有未保存的修改' : ''}`;
        }
        function field(title, input) {
            const wrapper = document.createElement('label');
            wrapper.className = 'prompt-studio-field';
            const label = document.createElement('span');
            label.className = 'moments-prompt-field-label';
            label.textContent = title;
            input.setAttribute('aria-label', title);
            wrapper.append(label, input);
            return wrapper;
        }
        function renderEditor() {
            const entry = editing;
            const scrollTop = dialogBody.scrollTop;
            const editor = document.createElement('div');
            editor.className = 'moments-prompt-dialog-fields';
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = entry.name;
            nameInput.addEventListener('input', () => { entry.name = nameInput.value; });
            const conditionSelect = document.createElement('select');
            moments.promptDefinitions.forEach(([key, title]) => {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = title;
                option.selected = key === entry.key;
                conditionSelect.append(option);
            });
            conditionSelect.addEventListener('change', () => {
                entry.key = conditionSelect.value;
                renderEditor();
                dialogBody.querySelector('select').focus({ preventScroll: true });
            });
            const hint = document.createElement('p');
            hint.className = 'moments-prompt-condition-hint';
            hint.textContent = definitions.get(entry.key)[3];
            const textarea = document.createElement('textarea');
            textarea.value = entry.content;
            textarea.dataset.momentsPrompt = entry.key;
            textarea.spellcheck = false;
            const contentField = field('提示词内容', textarea);
            contentField.classList.add('moments-prompt-content-field');
            const tokenCount = document.createElement('span');
            tokenCount.className = 'moments-prompt-token-count';
            tokenCount.textContent = `约 ${estimateTokens(entry.content)} Token`;
            contentField.firstChild.append(tokenCount);
            textarea.addEventListener('input', () => {
                entry.content = textarea.value;
                tokenCount.textContent = `约 ${estimateTokens(entry.content)} Token`;
            });
            const actions = document.createElement('div');
            actions.className = 'prompt-studio-editor-actions';
            const variables = entry.key === 'contacts' ? ['人脉列表'] : ['seen', 'unseen'].includes(entry.key) ? ['动态列表'] : [];
            variables.forEach(variable => actions.append(button(`插入 {{${variable}}}`, () => {
                textarea.setRangeText(`{{${variable}}}`, textarea.selectionStart, textarea.selectionEnd, 'end');
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                textarea.focus();
            })));
            actions.append(button('恢复本条默认', async () => {
                if (!await confirmAction(`确定恢复“${entry.name}”的默认内容吗？`) || editing?.id !== entry.id) return;
                entry.content = moments.promptDefaults[entry.key];
                renderEditor();
            }));
            actions.append(button('复制条目', () => {
                if (items.some(item => item.id === entry.id)) insertAfterId = entry.id;
                editing = { ...clone(entry), id: window.PromptStudio.uid('moments-item'), name: `${entry.name} 副本` };
                renderEditor();
                dialogBody.scrollTop = 0;
                dialog.focus({ preventScroll: true });
            }));
            const remove = button('删除', async () => {
                if (!await confirmAction(`确定删除条目“${entry.name}”吗？`) || editing?.id !== entry.id) return;
                const index = items.findIndex(item => item.id === entry.id);
                if (index >= 0) { items.splice(index, 1); markDirty(); render(); }
                closeEditor();
            });
            remove.classList.add('btn-danger');
            actions.append(remove);
            editor.append(field('条目名称', nameInput), field('生效场景', conditionSelect), hint, contentField, actions);
            dialogBody.replaceChildren(editor);
            dialogBody.scrollTop = scrollTop;
        }
        function render() {
            const openGroups = new Set([...list.querySelectorAll('details[open]')].map(group => group.dataset.groupId));
            list.replaceChildren();
            let group, groupCategory, count, size, enabled;
            items.forEach((entry, index) => {
                const [, ruleName, category, condition] = definitions.get(entry.key);
                if (!group || groupCategory !== category) {
                    groupCategory = category;
                    size = enabled = 0;
                    group = document.createElement('details');
                    group.className = 'prompt-studio-category-group';
                    group.dataset.groupId = entry.id;
                    group.open = openGroups.has(entry.id);
                    const summary = document.createElement('summary');
                    const name = document.createElement('span');
                    name.className = 'prompt-studio-category-name';
                    name.textContent = category;
                    count = document.createElement('span');
                    count.className = 'prompt-studio-category-count';
                    const chevron = document.createElement('span');
                    chevron.className = 'prompt-studio-category-chevron';
                    chevron.setAttribute('aria-hidden', 'true');
                    summary.append(name, count, chevron);
                    group.append(summary);
                    list.append(group);
                }
                const card = document.createElement('div');
                card.className = 'prompt-studio-item';
                card.dataset.momentsItemId = entry.id;
                const head = document.createElement('div');
                head.className = 'prompt-studio-item-head';
                const order = document.createElement('div');
                order.className = 'prompt-studio-order';
                [-1, 1].forEach(delta => {
                    const move = button(delta < 0 ? '↑' : '↓', () => {
                        [items[index], items[index + delta]] = [items[index + delta], items[index]];
                        markDirty(); render();
                    }, `${delta < 0 ? '上移' : '下移'}条目：${entry.name}`);
                    move.disabled = index + delta < 0 || index + delta >= items.length;
                    order.append(move);
                });
                const summary = document.createElement('div');
                summary.className = 'prompt-studio-item-summary';
                const name = document.createElement('div');
                name.className = 'prompt-studio-item-name';
                name.textContent = `${String(index + 1).padStart(2, '0')} · ${entry.name}`;
                const meta = document.createElement('div');
                meta.className = 'prompt-studio-item-meta';
                const rule = document.createElement('span');
                rule.textContent = ruleName;
                rule.title = condition;
                const tokens = document.createElement('span');
                tokens.textContent = `约 ${estimateTokens(entry.content)} Token`;
                meta.append(rule, tokens);
                summary.append(name, meta);
                const toggleLabel = document.createElement('label');
                toggleLabel.className = 'kkt-switch prompt-studio-item-toggle';
                const toggle = document.createElement('input');
                toggle.type = 'checkbox';
                toggle.checked = entry.enabled;
                toggle.setAttribute('aria-label', `启用条目：${entry.name}`);
                toggle.addEventListener('change', () => { entry.enabled = toggle.checked; markDirty(); render(); });
                const slider = document.createElement('span');
                slider.className = 'kkt-slider';
                toggleLabel.append(toggle, slider);
                const edit = button('编辑', () => openEditor(entry), `编辑条目：${entry.name}`);
                edit.classList.add('prompt-studio-edit-btn');
                edit.setAttribute('aria-haspopup', 'dialog');
                head.append(order, summary, toggleLabel, edit);
                card.append(head);
                group.append(card);
                size++; if (entry.enabled) enabled++;
                count.textContent = `${size} 条 · 已启用 ${enabled}`;
            });
            if (!items.length) {
                const empty = document.createElement('p');
                empty.className = 'magic-room-field-hint';
                empty.textContent = '暂无条目，可以添加条目或恢复默认条目。';
                list.append(empty);
            }
            updateStatus();
        }
        document.getElementById('moments-prompt-add-item').addEventListener('click', () => {
            if (editing) return;
            const entry = { id: window.PromptStudio.uid('moments-item'), key: 'post', name: '新条目', content: '', enabled: true };
            openEditor(entry);
        });
        document.getElementById('moments-prompt-reset-items').addEventListener('click', async () => {
            if (!await confirmAction('确定恢复全部动态默认条目吗？当前条目修改会被替换。')) return;
            items = moments.createPromptItems({}); markDirty(); render();
        });
        function renderPreview() {
            previewContent.textContent = moments.promptForCharacter(previewCharacter.value, false, items) || '当前角色没有可注入的动态上下文。';
        }
        document.getElementById('moments-prompt-preview').addEventListener('click', () => {
            const previous = previewCharacter.value;
            previewCharacter.replaceChildren();
            (db.characters || []).filter(character => character?.id).forEach(character => {
                const option = document.createElement('option');
                option.value = character.id; option.textContent = character.remarkName || character.realName || '未命名角色';
                previewCharacter.append(option);
            });
            if ([...previewCharacter.options].some(option => option.value === previous)) previewCharacter.value = previous;
            renderPreview();
            previewDialog.open();
        });
        previewCharacter.addEventListener('change', renderPreview);
        const api = {
            getDraft: () => clone(items),
            saveToDb() {
                const room = db.magicRoom || (db.magicRoom = {});
                room.momentsPromptItems = clone(items);
                // Keep legacy exports/readers usable; the item list is authoritative.
                room.momentsPrompts = Object.fromEntries(moments.promptDefinitions.map(([key]) => [key, moments.compilePromptRules({ [key]: {} }, items)]));
                dirty = false; updateStatus();
            },
            isDirty: () => dirty
        };
        window.MomentsPromptUI = api;
        render();
        return api;
    }

    window.setupMomentsPromptEditor = setupMomentsPromptEditor;
    window.setupPromptStudioEditor = setupPromptStudioEditor;
})();
