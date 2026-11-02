export const phoneHtmlChunks = [
    ['01-chat-core', ['html/screens/chat-core.html']],
    ['02-reminders-avatars-stickers', ['html/screens/reminders-avatars-stickers.html']],
    ['03-worldbook', ['html/screens/worldbook.html']],
    ['04-api-main', ['html/screens/api-settings/main-api.html']],
    ['05-api-secondary', ['html/screens/api-settings/secondary-apis.html']],
    ['06-api-specialized', ['html/screens/api-settings/specialized-apis.html']],
    ['07-api-images', ['html/screens/api-settings/image-apis.html']],
    ['08-api-tts', ['html/screens/api-settings/tts.html']],
    ['09-general-settings', ['html/screens/general-settings.html']],
    ['10-chat-dialogs', ['html/screens/chat-dialogs.html']],
    ['11-chat-settings-basics', ['html/screens/chat-settings/basics.html']],
    ['12-chat-settings-features', ['html/screens/chat-settings/features.html']],
    ['13-chat-settings-extensions', ['html/screens/chat-settings/extensions.html']],
    ['14-chat-settings-avatar', ['html/screens/chat-settings/avatar-system.html']],
    ['15-chat-settings-prompts-media-node', ['html/screens/chat-settings/prompts-media-node.html']],
    ['16-archive-theater', ['html/screens/archive-theater.html']],
    ['17-group-settings', ['html/screens/group-settings.html']],
    ['18-memory-favorites', ['html/screens/memory-favorites.html']],
    ['19-forum-social', ['html/screens/forum-social.html', 'html/screens/moments.html']],
    ['20-magic-storage-peek', ['html/screens/magic-storage-peek.html']],
    ['21-video-call', ['html/screens/video-call.html']],
    ['22-lifestyle', ['html/screens/lifestyle.html', 'html/screens/music.html']],
    ['23-node-system', ['html/screens/node-system.html']],
    ['24-mcp', ['html/screens/mcp.html']],
];

export const bodyHtmlChunks = [
    ['25-global-modals', ['html/modals/global-modals.html']],
];

export function renderChunkScript(bucket, html) {
    return `(function () {\n`
        + `    const chunks = window.__OVO_HTML_CHUNKS__;\n`
        + `    if (!chunks) throw new Error('OVO HTML loader was not initialized');\n`
        + `    chunks.${bucket}.push(${JSON.stringify(html)});\n`
        + `})();\n`;
}

export const loaderInitScript = `(function () {\n`
    + `    window.__OVO_HTML_CHUNKS__ = { phone: [], body: [] };\n`
    + `})();\n`;

export const loaderMountScript = `(function () {\n`
    + `    const chunks = window.__OVO_HTML_CHUNKS__;\n`
    + `    const phone = document.querySelector('.phone-screen');\n`
    + `    if (!chunks || !phone) throw new Error('OVO HTML mount point is missing');\n`
    + `    phone.insertAdjacentHTML('beforeend', chunks.phone.join(''));\n`
    + `    document.body.insertAdjacentHTML('beforeend', chunks.body.join(''));\n`
    + `    document.querySelectorAll('script[data-ovo-html-loader]').forEach(script => script.remove());\n`
    + `    delete window.__OVO_HTML_CHUNKS__;\n`
    + `})();\n`;
