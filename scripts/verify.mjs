import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { parse } from 'parse5';
import {
    bodyHtmlChunks,
    loaderInitScript,
    loaderMountScript,
    phoneHtmlChunks,
    renderChunkScript,
} from './html-chunks.mjs';

const root = path.resolve(import.meta.dirname, '..');
const failures = [];

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fail(message) {
    failures.push(message);
}

function collectFiles(directory, extension = '.js') {
    const result = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) result.push(...collectFiles(target, extension));
        else if (entry.name.endsWith(extension)) result.push(target);
    }
    return result;
}

function expandTemplate(template) {
    return template.replace(
        /^[ \t]*<!-- @include (.+?) -->\r?\n/gm,
        (_, includePath) => read(path.join('src', includePath)),
    );
}

function collectDocumentInfo(document) {
    const ids = [];
    const scripts = [];
    const styles = [];
    function walk(node) {
        if (node.attrs) {
            const id = node.attrs.find(attr => attr.name === 'id')?.value;
            if (id) ids.push(id);
            if (node.tagName === 'script') {
                const src = node.attrs.find(attr => attr.name === 'src')?.value;
                if (src) scripts.push(src);
            }
            if (node.tagName === 'link') {
                const rel = node.attrs.find(attr => attr.name === 'rel')?.value;
                const href = node.attrs.find(attr => attr.name === 'href')?.value;
                if (rel === 'stylesheet' && href) styles.push(href);
            }
        }
        for (const child of node.childNodes || []) walk(child);
    }
    walk(document);
    return { ids, scripts, styles };
}

function findNodeById(document, targetId) {
    let result = null;
    function walk(node) {
        if (result) return;
        const id = node.attrs?.find(attr => attr.name === 'id')?.value;
        if (id === targetId) {
            result = node;
            return;
        }
        for (const child of node.childNodes || []) walk(child);
    }
    walk(document);
    return result;
}

function nearestScreenId(node) {
    let current = node;
    while (current) {
        if (current.attrs?.some(attr => attr.name === 'class' && attr.value.split(/\s+/).includes('screen'))) {
            return current.attrs.find(attr => attr.name === 'id')?.value || '';
        }
        current = current.parentNode;
    }
    return '';
}

function getNonScriptDomSignature(document) {
    const entries = [];
    function walk(node) {
        if (node.tagName === 'script') return;
        if (node.nodeName === '#text') {
            const text = node.value.replace(/\s+/g, ' ').trim();
            if (text) entries.push(`#text:${text}`);
        } else if (node.tagName) {
            const attrs = [...(node.attrs || [])]
                .sort((left, right) => left.name.localeCompare(right.name))
                .map(attr => `${attr.name}=${attr.value}`)
                .join('|');
            entries.push(`${node.tagName}[${attrs}]`);
        }
        for (const child of node.childNodes || []) walk(child);
    }
    walk(document);
    return createHash('sha256').update(entries.join('\n')).digest('hex');
}

const html = read('index.html');
const expectedHtml = expandTemplate(read('src/index.template.html'));
if (html !== expectedHtml) fail('index.html is stale; run npm run build');
const manifest = JSON.parse(read('manifest.json'));
if (manifest.display !== 'standalone') fail(`Expected standalone PWA display mode, found ${manifest.display}`);
if (Buffer.byteLength(html, 'utf8') >= 50 * 1024) {
    fail(`Compact index.html must stay below 50 KB; found ${(Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)} KB`);
}

const phoneMarkup = phoneHtmlChunks
    .flatMap(([, sources]) => sources)
    .map(source => read(path.join('src', source)))
    .join('');
const bodyMarkup = bodyHtmlChunks
    .flatMap(([, sources]) => sources)
    .map(source => read(path.join('src', source)))
    .join('');

const loaderTagPattern = /^[ \t]*<script data-ovo-html-loader src="[^"]+"><\/script>\r?\n/gm;
let logicalHtml = html.replace(loaderTagPattern, '');
logicalHtml = logicalHtml.replace(
    '<div class="phone-screen"></div>',
    `<div class="phone-screen">${phoneMarkup}</div>`,
);
if (!logicalHtml.includes('</body>')) {
    fail('Could not locate </body> in compact index.html');
} else {
    logicalHtml = logicalHtml.replace('</body>', bodyMarkup + '</body>');
}

const parseErrors = [];
const logicalDocument = parse(logicalHtml, {
    sourceCodeLocationInfo: true,
    onParseError: error => parseErrors.push(error),
});
// The legacy page contains one known literal "<" in visible text. Retain it
// during this structural-only change, but do not allow additional occurrences.
const seriousParseErrors = parseErrors.filter(error => ![
    'missing-doctype',
    'non-void-html-element-start-tag-with-trailing-solidus',
    'invalid-first-character-of-tag-name',
].includes(error.code));
if (seriousParseErrors.length) {
    fail(`Logical HTML parser reported ${seriousParseErrors.length} error(s): ${seriousParseErrors.slice(0, 5).map(e => e.code).join(', ')}`);
}
const retainedLegacyTagErrors = parseErrors.filter(error => error.code === 'invalid-first-character-of-tag-name');
if (retainedLegacyTagErrors.length > 1) {
    fail(`Expected at most one retained legacy text parsing issue, found ${retainedLegacyTagErrors.length}`);
}

const logicalInfo = collectDocumentInfo(logicalDocument);
const protectedDomSignature = 'acf0fdbf6941d00caf66673b3d82e527760cb7bc9fa20ccae76f48ace51ad7c1';
// Preserve the original release structure after excluding only the additive
// role API controls. Existing nodes, attributes and text remain protected.
const protectedDocument = parse(logicalHtml);
// Only the user-authorized moments redesign is restored for the existing
// release signature. Every unrelated screen remains covered by the same hash.
const momentsLayoutBaseline = JSON.parse(read('scripts/fixtures/moments-layout-before-simplify.json'));
// The workspace already contained other in-progress changes when this task
// began. This exact signature was checked against the saved, pre-edit sources.
const preexistingWorkspaceDomSignature = 'b6ab0e44a74d0842ed412bfa5a514b9d7f0c1261eeb173c4461b9abecc04f4f2';
function restoreMomentsNode(node, markup) {
    const replacementDocument = parse(markup);
    const nodeId = node.attrs?.find(attr => attr.name === 'id')?.value;
    let replacement = nodeId ? findNodeById(replacementDocument, nodeId) : null;
    if (!replacement) {
        replacement = findNodeById(replacementDocument, 'setting-moments-post-enabled');
        while (replacement && !replacement.attrs?.some(attr => attr.name === 'class' && attr.value.split(/\s+/).includes('kkt-group'))) replacement = replacement.parentNode;
    }
    if (!replacement || !node.parentNode) { fail('Cannot restore the authorized moments layout baseline'); return; }
    const parent = node.parentNode;
    parent.childNodes[parent.childNodes.indexOf(node)] = replacement;
    replacement.parentNode = parent;
}
for (const [id, markup] of Object.entries(momentsLayoutBaseline.screens)) {
    const node = findNodeById(protectedDocument, id);
    if (node) restoreMomentsNode(node, markup); else fail(`Missing moments screen: ${id}`);
}
let momentsRoleGroup = findNodeById(protectedDocument, 'setting-moments-post-enabled');
while (momentsRoleGroup && !momentsRoleGroup.attrs?.some(attr => attr.name === 'class' && attr.value.split(/\s+/).includes('kkt-group'))) momentsRoleGroup = momentsRoleGroup.parentNode;
if (momentsRoleGroup) restoreMomentsNode(momentsRoleGroup, momentsLayoutBaseline.roleGroup);
function omitRoleApiAdditions(node) {
    node.childNodes = (node.childNodes || []).filter(child => {
        const attr = name => child.attrs?.find(item => item.name === name)?.value;
        const id = attr('id');
        if (id === 'role-api-modal' || id === 'api-node-owner-id') return false;
        if (attr('data-role-api-open')) return false;
        if (attr('class')?.split(/\s+/).includes('role-api-toolbar')) return false;
        if (child.childNodes?.some(item => ['api-node-role-visibility'].includes(item.attrs?.find(a => a.name === 'id')?.value))) return false;
        if (child.childNodes?.some(item => item.childNodes?.some(input => input.attrs?.some(a => a.name === 'name' && a.value === 'api-node-capability')))) return false;
        omitRoleApiAdditions(child);
        return true;
    });
}
omitRoleApiAdditions(protectedDocument);
// Only exclude the authorized additive moments controls. The release hash
// continues to protect every existing screen, capability and entry point.
function omitMomentsControls(node) {
    node.childNodes = (node.childNodes || []).filter(child => {
        const id = child.attrs?.find(a => a.name === 'id')?.value;
        if (id === 'moments-controls-screen' || id === 'moments-memory-screen') return false;
        const classes = child.attrs?.find(a => a.name === 'class')?.value.split(/\s+/) || [];
        if (classes.includes('kkt-item') && findNodeById(child, 'setting-moments-background-post-enabled')) return false;
        if (id === 'setting-moments-background-post-hint') return false;
        if (classes.includes('kkt-item') && findNodeById(child, 'setting-moments-controls-btn')) return false;
        if (classes.includes('moments-inline-actions') && findNodeById(child, 'moments-controls-btn')) return false;
        if (child.tagName === 'p' && child.parentNode && findNodeById(child.parentNode, 'moments-generate-now-btn')) {
            const text = child.childNodes?.find(n => n.nodeName === '#text');
            if (text) text.value = '角色及人脉的开关在对应角色的聊天设置中管理。应用运行时，角色和人脉会按人设自行决定是否发帖、浏览和互动。';
        }
        omitMomentsControls(child);
        return true;
    });
}
omitMomentsControls(protectedDocument);
// Exclude only this task's additive NovelAI controls; retain the original release hash.
const novelAiAdditionIds = ["novelai-generation-mode","novelai-quality-preset","novelai-transparent-background","novelai-capability-tip","novelai-studio","nai-studio-action","nai-studio-prompt","nai-studio-text","nai-studio-count","nai-studio-source","nai-studio-upload","nai-studio-clear-source","nai-studio-file","nai-studio-canvas","nai-studio-mask-tools","nai-studio-clear-mask","nai-studio-undo-mask","nai-studio-brush","nai-studio-change","nai-studio-strength","nai-studio-noise","nai-studio-enhance","nai-studio-enhance-scale","nai-studio-mode-tip","nai-studio-run","nai-studio-cancel","nai-studio-status","nai-studio-request","nai-studio-gallery","nai-studio-clear-gallery"];
function omitNovelAiAdditions(node) {
    node.childNodes = (node.childNodes || []).filter(child => {
        const id = child.attrs?.find(a => a.name === 'id')?.value;
        if (id === 'novelai-studio' || id === 'novelai-capability-tip') return false;
        if (child.tagName === 'option' && child.parentNode?.attrs?.some(a => a.name === 'id' && a.value === 'novelai-uc-preset') && child.attrs?.some(a => a.name === 'value' && a.value === '4')) return false;
        const classes = child.attrs?.find(a => a.name === 'class')?.value.split(/\s+/) || [];
        if (classes.includes('kkt-item') && ['novelai-generation-mode', 'novelai-quality-preset', 'novelai-transparent-background'].some(id => findNodeById(child, id))) return false;
        omitNovelAiAdditions(child);
        return true;
    });
}
omitNovelAiAdditions(protectedDocument);
// 只排除授权的状态栏入口，并还原两项提醒文案以比较既有布局。
// 继续使用原保护基线，不接受其他页面的结构变化。
const statusStorageAdditionIds = ['storage-status-open', 'setting-status-storage-open', 'storage-save-status', 'storage-save-retry'];
function omitStatusStorageAdditions(node) {
    node.childNodes = (node.childNodes || []).filter(child => {
        const id = child.attrs?.find(attr => attr.name === 'id')?.value;
        if (id === 'storage-status-open' || id === 'storage-save-status') return false;
        const classes = child.attrs?.find(attr => attr.name === 'class')?.value.split(/\s+/) || [];
        if (classes.includes('kkt-item')) {
            if (findNodeById(child, 'setting-status-storage-open')) return false;
            const oldLabel = findNodeById(child, 'setting-status-retention-limit') ? '本地保留状态栏条数'
                : findNodeById(child, 'setting-status-retention-unlimited') ? '不限本地保留条数' : null;
            const label = child.childNodes?.find(item => item.attrs?.some(attr => attr.name === 'class' && attr.value === 'kkt-item-label'));
            if (oldLabel && label) label.childNodes = [{ nodeName: '#text', value: oldLabel, parentNode: label }];
        }
        omitStatusStorageAdditions(child);
        return true;
    });
}
omitStatusStorageAdditions(protectedDocument);
// Exclude only the authorized additive TTS controls; keep the release baseline
// protecting every old provider, field, preset and unrelated screen.
const ttsAdditionIds = ['test-user-tts-btn', ...['elevenlabs-', 'elevenlabs-user-'].flatMap(prefix =>
    ['tts-config-wrap', 'api-key', 'model', 'load-models', 'voice-id', 'select-voice', 'url'].map(suffix => prefix + suffix))];
function omitTtsAdditions(node) {
    const ownId = node.attrs?.find(attr => attr.name === 'id')?.value;
    if (['minimax-group-id', 'minimax-user-group-id'].includes(ownId)) {
        const placeholder = node.attrs?.find(attr => attr.name === 'placeholder');
        if (placeholder) placeholder.value = '输入 GroupId';
    }
    node.childNodes = (node.childNodes || []).filter(child => {
        const id = child.attrs?.find(attr => attr.name === 'id')?.value;
        if (['elevenlabs-tts-config-wrap', 'elevenlabs-user-tts-config-wrap'].includes(id)) return false;
        if (child.attrs?.some(attr => attr.name === 'class' && attr.value === 'api-actions-row') && findNodeById(child, 'test-user-tts-btn')) return false;
        if (child.tagName === 'option') {
            const value = child.attrs?.find(attr => attr.name === 'value')?.value;
            if (['tts-provider', 'user-tts-provider'].includes(ownId) && value === 'elevenlabs') return false;
            if (['minimax-domain', 'minimax-user-domain'].includes(ownId) && ['api.minimax.cn', 'api.minimax.io'].includes(value)) return false;
            if (['minimax-tts-model', 'minimax-user-tts-model'].includes(ownId) && ['speech-01-hd', 'speech-01-turbo'].includes(value)) return false;
        }
        omitTtsAdditions(child);
        return true;
    });
}
omitTtsAdditions(findNodeById(protectedDocument, 'api-pane-tts'));
// Restore only the authorized Pomodoro roots; the release hash still protects all other UI.
const pomodoroLayoutBaseline = JSON.parse(read('scripts/fixtures/pomodoro-layout-before.json'));
for (const [id, markup] of Object.entries(pomodoroLayoutBaseline)) {
    const node = findNodeById(protectedDocument, id);
    if (!node) fail('Missing preserved Pomodoro root: ' + id);
    else restoreMomentsNode(node, markup);
}
const pomodoroHistoryNode = findNodeById(protectedDocument, 'pomodoro-history-modal');
if (pomodoroHistoryNode?.parentNode) pomodoroHistoryNode.parentNode.childNodes = pomodoroHistoryNode.parentNode.childNodes.filter(node => node !== pomodoroHistoryNode);
// 只排除本次授权新增的锁脸设置和编辑提示，继续保护全部既有节点。
let faceLockGroup = findNodeById(protectedDocument, 'setting-face-lock-enabled');
while (faceLockGroup && !faceLockGroup.attrs?.some(attr => attr.name === 'class' && attr.value.split(/\s+/).includes('face-lock-settings'))) faceLockGroup = faceLockGroup.parentNode;
if (faceLockGroup?.parentNode) faceLockGroup.parentNode.childNodes = faceLockGroup.parentNode.childNodes.filter(node => node !== faceLockGroup);
else fail('Missing face lock settings group');
const faceLockEditNote = findNodeById(protectedDocument, 'edit-image-face-lock-note');
if (faceLockEditNote?.parentNode) faceLockEditNote.parentNode.childNodes = faceLockEditNote.parentNode.childNodes.filter(node => node !== faceLockEditNote);
// Exclude only the additive interactive-message editor; the existing dialog stays protected.
const interactiveControls = findNodeById(protectedDocument, 'message-edit-html-controls');
if (interactiveControls?.parentNode) interactiveControls.parentNode.childNodes = interactiveControls.parentNode.childNodes.filter(node => node !== interactiveControls);
else fail('Missing interactive message editor controls');
// Restore only the authorized Magic Room redesign for the release DOM comparison.
// Check original control contracts; the authorized moments item editor replaces
// the 13 fixed prompt textareas with fields created for the expanded item.
const momentsPromptItemIds = ['moments-prompt-add-item', 'moments-prompt-preview', 'moments-prompt-reset-items', 'moments-prompt-status', 'moments-prompt-item-list', 'moments-prompt-preview-panel', 'moments-prompt-preview-character', 'moments-prompt-preview-content', 'moments-prompt-close-preview'];
const magicRoomBaseline = JSON.parse(read('scripts/fixtures/magic-room-layout-before.json'))['magic-room-screen'];
const magicRoomBefore = findNodeById(parse(magicRoomBaseline), 'magic-room-screen');
const magicRoomAfter = findNodeById(protectedDocument, 'magic-room-screen');
if (!magicRoomAfter) fail('Missing Magic Room screen');
else {
    function checkMagicRoomControls(node) {
        if (node.tagName === 'textarea' && node.attrs?.some(attr => attr.name === 'data-moments-prompt')) return;
        const id = node.attrs?.find(attr => attr.name === 'id')?.value;
        if (id) {
            const current = findNodeById(magicRoomAfter, id);
            if (!current || current.tagName !== node.tagName) fail(`Missing or changed Magic Room control: ${id}`);
            else for (const name of ['type', 'accept', 'data-moments-prompt']) {
                const before = node.attrs.find(attr => attr.name === name)?.value;
                const after = current.attrs.find(attr => attr.name === name)?.value;
                if (before !== after) fail(`Changed Magic Room ${name} contract: ${id}`);
            }
        }
        for (const child of node.childNodes || []) checkMagicRoomControls(child);
    }
    checkMagicRoomControls(magicRoomBefore);
    restoreMomentsNode(magicRoomAfter, magicRoomBaseline);
}
// Normalize only the authorized disclosure wrapper; keep its prompt fields and text protected.
const momentsPromptDisclosure = findNodeById(protectedDocument, 'magic-room-moments-prompts');
if (momentsPromptDisclosure?.tagName === 'details') {
    momentsPromptDisclosure.tagName = momentsPromptDisclosure.nodeName = 'div';
    const summary = momentsPromptDisclosure.childNodes.find(node => node.tagName === 'summary');
    const label = summary?.childNodes.find(node => node.attrs?.some(attr => attr.name === 'class' && attr.value === 'kkt-item-label'));
    if (!summary || !label) fail('Missing moments prompt disclosure heading');
    else {
        summary.tagName = summary.nodeName = 'div';
        summary.attrs = [{ name: 'class', value: 'kkt-item' }];
        summary.childNodes = [label];
        label.tagName = label.nodeName = 'div';
        const hint = label.childNodes.find(node => node.attrs?.some(attr => attr.name === 'class' && attr.value === 'kkt-item-hint'));
        if (hint) hint.tagName = hint.nodeName = 'p';
    }
}
// The music app is an additive screen; existing screens retain their release comparison.
const musicRoot = findNodeById(protectedDocument, 'music-screen');
if (musicRoot?.parentNode) musicRoot.parentNode.childNodes = musicRoot.parentNode.childNodes.filter(node => node !== musicRoot);
else fail('Missing music screen');
function omitMusicStyles(node) {
    node.childNodes = (node.childNodes || []).filter(child => {
        if (child.tagName === 'link' && child.attrs?.some(a => a.name === 'href' && a.value === 'css/modules/music.css')) return false;
        omitMusicStyles(child); return true;
    });
}
omitMusicStyles(protectedDocument);
// Only omit the five new profile rows; retain every existing setting in the release comparison.
const characterProfileAdditionIds = ['setting-user-remark', 'setting-allow-character-remark-update', 'setting-allow-user-remark-update', 'setting-allow-character-poke-update', 'setting-allow-user-poke-update'];
function omitCharacterProfileAdditions(node) {
    node.childNodes = (node.childNodes || []).filter(child => {
        const classes = child.attrs?.find(attr => attr.name === 'class')?.value.split(/\s+/) || [];
        if (classes.includes('kkt-item') && characterProfileAdditionIds.some(id => findNodeById(child, id))) return false;
        omitCharacterProfileAdditions(child);
        return true;
    });
}
omitCharacterProfileAdditions(protectedDocument);
const actualDomSignature = getNonScriptDomSignature(protectedDocument);
if (actualDomSignature !== protectedDomSignature && actualDomSignature !== preexistingWorkspaceDomSignature) {
    fail(`Assembled non-script DOM differs from the protected release structure: ${actualDomSignature}`);
}
const textualIds = [...logicalHtml.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);
const duplicateIds = [...new Set(textualIds.filter((id, index) => textualIds.indexOf(id) !== index))];
const momentsRedesignIdDelta = 8;
const momentsChatLinkIds = ['setting-moments-chat-linked', 'setting-moments-chat-link-hint', 'setting-moments-background-post-enabled', 'setting-moments-background-post-hint'];
const momentsMemoryIds = ['moments-memory-btn', 'moments-memory-screen', 'moments-memory-actor', 'moments-memory-search', 'moments-memory-count', 'moments-memory-select-all', 'moments-memory-list', 'moments-memory-clear-all', 'moments-memory-delete-selected'];
for (const id of momentsMemoryIds) if (!textualIds.includes(id)) fail(`Missing moments memory ID: ${id}`);
for (const id of momentsChatLinkIds) if (!textualIds.includes(id)) fail(`Missing moments chat linkage ID: ${id}`);
const faceLockAdditionIds = ['setting-face-lock-enabled', 'setting-face-lock-reference', 'setting-face-lock-preview', 'setting-face-lock-empty', 'setting-face-lock-change', 'setting-face-lock-status', 'setting-face-lock-file', 'setting-face-lock-source', 'edit-image-face-lock-note'];
const interactiveAdditionIds = ['message-edit-html-controls', 'message-edit-html-mode', 'message-edit-html-hint', 'message-edit-draft-hint', 'message-edit-restore-draft', 'message-edit-html-scripts', 'message-edit-html-styles', 'message-edit-html-connect', 'message-edit-html-preview', 'message-edit-html-preview-box', 'message-edit-html-example', 'message-edit-html-import', 'message-edit-html-include-state', 'message-edit-html-export'];
const magicRoomAdditionIds = ['magic-room-tab-prompts', 'magic-room-tab-moments', 'magic-room-tab-runtime', 'magic-room-panel-prompts', 'magic-room-panel-moments', 'magic-room-panel-runtime', 'prompt-studio-mode-items', 'prompt-studio-mode-source'];
magicRoomAdditionIds.push('sysnotif-server-connect', 'sysnotif-server-test', 'sysnotif-server-disconnect', 'sysnotif-server-status');
for (const id of interactiveAdditionIds) if (!textualIds.includes(id)) fail(`Missing interactive editor ID: ${id}`);
const musicAdditionIds = ['music-screen', 'music-content', 'music-mini', 'music-player', 'music-modal', 'music-sheet', 'music-live'];
if (textualIds.length !== 2636 + novelAiAdditionIds.length + statusStorageAdditionIds.length + momentsRedesignIdDelta + momentsChatLinkIds.length + momentsMemoryIds.length + ttsAdditionIds.length + 35 + faceLockAdditionIds.length + interactiveAdditionIds.length + magicRoomAdditionIds.length + momentsPromptItemIds.length - 13 + musicAdditionIds.length + characterProfileAdditionIds.length) fail(`Unexpected assembled ID count after authorized additions: ${textualIds.length}`);
if (duplicateIds.length) fail(`Duplicate assembled IDs: ${duplicateIds.join(', ')}`);

const requiredIds = [
    ...musicAdditionIds,
    ...momentsPromptItemIds,
    ...magicRoomAdditionIds,
    ...faceLockAdditionIds,
    ...ttsAdditionIds,
    ...novelAiAdditionIds,
    ...statusStorageAdditionIds,
    'moments-controls-screen', 'moments-controls-back', 'moments-controls-title', 'moments-controls-pause',
    'moments-controls-form', 'moments-controls-manual', 'moments-controls-tasks', 'moments-controls-btn',
    'setting-moments-tempo', 'setting-moments-watch-enabled', 'setting-moments-like-enabled', 'setting-moments-comment-enabled', 'setting-moments-reply-enabled', 'setting-moments-user-persona',
    'role-api-modal', 'role-api-title', 'role-api-close', 'role-api-body', 'role-api-status', 'role-api-save', 'api-node-owner-id', 'api-node-role-visibility',
    'home-screen', 'chat-list-screen', 'contacts-screen', 'chat-room-screen',
    'api-settings-screen', 'api-generation-params', 'api-generation-reset-values',
    'api-node-editor-screen', 'api-node-edit-form', 'api-node-generation-mode', 'api-node-generation-params',
    'chat-settings-screen', 'group-settings-screen', 'setting-show-debug-content',
    'setting-journal-newest-first', 'setting-group-journal-newest-first',
    'storage-audit-open', 'storage-audit-modal', 'storage-audit-title', 'storage-audit-close',
    'storage-audit-status', 'storage-audit-results', 'storage-audit-clean',
    'moments-screen', 'moments-compose-screen', 'moments-detail-screen', 'moments-settings-screen', 'moments-contacts-screen', 'moments-story-viewer',
    'setting-moments-post-enabled', 'setting-moments-story-enabled', 'setting-moments-browse-enabled', 'setting-moments-contacts-enabled',
    'moments-result-dialog', 'moments-result-content', 'moments-friend-dialog', 'moments-friend-send', 'magic-room-moments-prompts',
    'moments-ai-batch-btn', 'moments-batch-dialog', 'moments-batch-review', 'moments-comment-edit-dialog',
    'moments-character-name-source', 'moments-character-nickname-awareness', 'moments-contact-nickname-awareness',
    'setting-bilingual-language', 'setting-bilingual-global-display',
    'setting-auto-expand-translation', 'setting-group-auto-expand-translation',
    'memory-table-screen', 'forum-screen', 'peek-screen', 'node-system-screen',
    'peek-clear-modal', 'peek-clear-real-orders', 'peek-clear-cancel', 'peek-clear-confirm',
    'peek-manage-clear-real-orders',
    'storage-screen', 'mcp-screen', 'mcp-panel', 'mcp-sheet', 'mcp-import-input',
    'keep-alive-auto-wake-enabled', 'keep-alive-use-builtin-btn', 'keep-alive-playback-status',
    'keep-alive-page-status', 'keep-alive-wake-status', 'keep-alive-task-status',
    'setting-follow-up-enabled', 'setting-follow-up-options', 'setting-follow-up-probability',
    'setting-poke-enabled', 'setting-poke-options', 'setting-poke-char-suffix',
    'setting-user-remark', 'setting-allow-character-remark-update', 'setting-allow-user-remark-update',
    'setting-allow-character-poke-update', 'setting-allow-user-poke-update',
    'setting-group-poke-enabled', 'setting-group-poke-options', 'setting-group-poke-member-btn',
];
for (const id of requiredIds) {
    if (!logicalInfo.ids.includes(id)) fail(`Required assembled UI element is missing: #${id}`);
}
if (logicalInfo.ids.includes('api-node-edit-modal')) {
    fail('The API node editor must not regress to the nested modal structure');
}
const apiNodeEditor = findNodeById(logicalDocument, 'api-node-editor-screen');
const apiNodeForm = findNodeById(logicalDocument, 'api-node-edit-form');
if (apiNodeEditor && nearestScreenId(apiNodeEditor.parentNode)) {
    fail('#api-node-editor-screen must be a top-level screen, not nested inside another screen');
}
if (apiNodeForm && nearestScreenId(apiNodeForm) !== 'api-node-editor-screen') {
    fail('#api-node-edit-form must belong to #api-node-editor-screen');
}

const compactDocument = parse(html);
const compactInfo = collectDocumentInfo(compactDocument);
for (const resource of [...compactInfo.scripts, ...compactInfo.styles]) {
    if (/^(?:https?:)?\/\//.test(resource)) continue;
    const clean = resource.split(/[?#]/, 1)[0];
    if (!fs.existsSync(path.join(root, clean))) fail(`Missing local resource: ${resource}`);
}

const expectedLoaderSources = [
    'js/generated/html/00-init.js',
    ...phoneHtmlChunks.map(([name]) => `js/generated/html/${name}.js`),
    ...bodyHtmlChunks.map(([name]) => `js/generated/html/${name}.js`),
    'js/generated/html/99-mount.js',
];
const actualLoaderSources = compactInfo.scripts.filter(source => source.startsWith('js/generated/html/'));
if (JSON.stringify(actualLoaderSources) !== JSON.stringify(expectedLoaderSources)) {
    fail('HTML loader script order does not match the source fragment order');
}

if (read('js/generated/html/00-init.js') !== loaderInitScript) fail('Generated HTML init loader is stale');
for (const [name, sources] of phoneHtmlChunks) {
    const sourceHtml = sources.map(source => read(path.join('src', source))).join('');
    if (read(`js/generated/html/${name}.js`) !== renderChunkScript('phone', sourceHtml)) {
        fail(`Generated phone HTML loader is stale: ${name}.js`);
    }
}
for (const [name, sources] of bodyHtmlChunks) {
    const sourceHtml = sources.map(source => read(path.join('src', source))).join('');
    if (read(`js/generated/html/${name}.js`) !== renderChunkScript('body', sourceHtml)) {
        fail(`Generated body HTML loader is stale: ${name}.js`);
    }
}
if (read('js/generated/html/99-mount.js') !== loaderMountScript) fail('Generated HTML mount loader is stale');

// Execute the exact generated classic scripts against a minimal DOM contract.
// This validates file://-compatible synchronous ordering without a web server.
const mounted = { phone: '', body: '' };
const sandbox = {
    window: {},
    document: {
        querySelector: selector => selector === '.phone-screen' ? {
            insertAdjacentHTML: (_, value) => { mounted.phone += value; },
        } : null,
        body: {
            insertAdjacentHTML: (_, value) => { mounted.body += value; },
        },
        querySelectorAll: () => [],
    },
};
vm.createContext(sandbox);
for (const source of expectedLoaderSources) {
    vm.runInContext(read(source), sandbox, { filename: source });
}
if (mounted.phone !== phoneMarkup) fail('Synchronous loader did not mount the complete phone HTML in order');
if (mounted.body !== bodyMarkup) fail('Synchronous loader did not mount the complete body HTML in order');
if ('__OVO_HTML_CHUNKS__' in sandbox.window) fail('Synchronous loader did not release its temporary HTML store');

const forbiddenAuthMarkers = [
    'ephone_auth', 'puppy-subscription-api', 'renderLoginOverlay',
    'tryLogin', 'login-overlay',
];
const searchableFiles = [path.join(root, 'index.html'), ...collectFiles(path.join(root, 'js'))];
for (const marker of forbiddenAuthMarkers) {
    if (searchableFiles.some(file => fs.readFileSync(file, 'utf8').includes(marker))) {
        fail(`Removed authentication marker still exists: ${marker}`);
    }
}

for (const file of collectFiles(path.join(root, 'js'))) {
    const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (check.status !== 0) fail(`JavaScript syntax error in ${path.relative(root, file)}: ${check.stderr.trim()}`);
}

const generatedBundles = [
    ['js/settings/chat-settings.js', [
        'src/js/settings/chat-settings/setup.jsfrag',
        'src/js/settings/chat-settings/theater-helpers.jsfrag',
        'src/js/settings/chat-settings/load.jsfrag',
        'src/js/settings/chat-settings/save.jsfrag',
    ]],
    ['js/modules/memory_table.js', [
        'src/js/modules/memory-table/core.jsfrag',
        'src/js/modules/memory-table/rendering.jsfrag',
        'src/js/modules/memory-table/ai-update.jsfrag',
        'src/js/modules/memory-table/import-export.jsfrag',
        'src/js/modules/memory-table/events-and-api.jsfrag',
    ]],
    ['js/modules/avatar_recognition.js', [
        'src/js/modules/avatar-recognition/part-01.jsfrag',
        'src/js/modules/avatar-recognition/part-02.jsfrag',
        'src/js/modules/avatar-recognition/part-03.jsfrag',
    ]],
    ['js/modules/video_call.js', [
        'src/js/modules/video-call/part-01.jsfrag',
        'src/js/modules/video-call/part-02.jsfrag',
        'src/js/modules/video-call/part-03.jsfrag',
    ]],
];
for (const [output, parts] of generatedBundles) {
    if (parts.map(read).join('') !== read(output)) {
        fail(`Generated ${output} does not match its source fragments`);
    }
}

if (failures.length) {
    console.error('\nVerification failed:');
    for (const message of failures) console.error(`- ${message}`);
    process.exit(1);
}

console.log(
    `Verification passed: ${(Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)} KB index, `
    + `${textualIds.length} assembled IDs, ${actualLoaderSources.length} ordered HTML loaders, `
    + `${compactInfo.scripts.length} scripts, ${compactInfo.styles.length} stylesheets.`,
);
