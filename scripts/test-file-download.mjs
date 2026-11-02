import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { File } from 'node:buffer';

const source = fs.readFileSync(new URL('../js/core/file-download.js', import.meta.url), 'utf8');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV3sAAAAASUVORK5CYII=', 'base64');
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(standalone = false) {
    const files = new Map(), timers = [], downloads = [], toasts = [];
    let document, sequence = 0;
    class Element {
        constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.isConnected = false; }
        setAttribute(key, value) { this[key] = value; }
        appendChild(child) { child.parent = this; child.isConnected = true; this.children.push(child); return child; }
        append(...children) { children.forEach(child => this.appendChild(child)); }
        remove() { this.isConnected = false; if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
        focus() { document.activeElement = this; }
        click() {
            if (this.tag === 'a' && this.download) downloads.push({ blob: files.get(this.href), filename: this.download, attached: this.isConnected });
            return this.onclick?.();
        }
    }
    document = { body: new Element('body'), activeElement: null, createElement: tag => new Element(tag) };
    const context = vm.createContext({
        window: {}, document, navigator: { standalone, userAgent: standalone ? 'iPhone' : 'Android', userActivation: { isActive: true } },
        Blob, File, Response, TextDecoder, Uint8Array, fetch,
        URL: { createObjectURL(blob) { const url = `blob:test-${++sequence}`; files.set(url, blob); return url; }, revokeObjectURL(url) { files.delete(url); } },
        setTimeout: (action, delay) => { timers.push({ action, delay }); },
        showToast: message => toasts.push(message), console: { error() {} }
    });
    vm.runInContext(source, context);
    const find = (tag, text) => {
        const visit = node => node.tag === tag && node.textContent === text ? node : node.children.map(visit).find(Boolean);
        return visit(document.body);
    };
    return { context, api: context.OvoFileDownload, document, files, timers, downloads, toasts, find };
}

// Desktop and Android keep normal downloads, byte content, names and custom suffixes.
{
    const h = fixture();
    let shared = false;
    h.context.navigator.share = async () => { shared = true; };
    for (const name of ['中文😀.json', '备份.ee', '编码.naiv4vibeBundle', '恢复.json.gz', '剧情.html']) {
        const blob = new Blob(['原始内容😀'], { type: 'application/octet-stream' });
        assert.equal(await h.api.save(blob, name), true);
        assert.equal(h.downloads.at(-1).filename, name);
        assert.equal(await h.downloads.at(-1).blob.text(), '原始内容😀');
        assert.equal(h.downloads.at(-1).attached, true);
    }
    assert.equal(shared, false);
    assert.equal(h.files.size, 5, 'URLs must remain alive after starting downloads');
    assert.ok(h.timers.every(timer => timer.delay === 60000));
    h.timers.forEach(timer => timer.action());
    assert.equal(h.files.size, 0);
    assert.equal(h.document.body.children.length, 0);
    assert.ok(h.toasts.every(message => !/已保存成功|导出成功|已下载/.test(message)));
}

// iOS home-screen share starts in the tap, preserves bytes, and does not also download.
{
    const h = fixture(true);
    let shared;
    h.context.navigator.canShare = data => data.files[0].name.endsWith('.ee');
    h.context.navigator.share = async data => { shared = data.files[0]; };
    const pending = h.api.save(new Blob(['compressed-bytes']), '备份.ee');
    assert.ok(shared, 'do not defer a usable user activation');
    assert.equal(await pending, true);
    assert.equal(await shared.text(), 'compressed-bytes');
    assert.equal(h.downloads.length, 0);
}

// Cancelling native saving must never fall through to a download or success toast.
{
    const h = fixture(true);
    h.context.navigator.canShare = () => true;
    h.context.navigator.share = async () => { throw Object.assign(new Error('cancel'), { name: 'AbortError' }); };
    assert.equal(await h.api.save(new Blob(['{}']), '预设.json'), false);
    assert.equal(h.downloads.length, 0);
    assert.deepEqual(h.toasts, ['已取消保存']);
    assert.equal(h.document.body.children.length, 0);
}

// A prepared, slow export waits for a fresh tap; no missing-gesture auto-share.
{
    const h = fixture(true);
    let count = 0;
    h.context.navigator.userActivation.isActive = false;
    h.context.navigator.canShare = () => true;
    h.context.navigator.share = async () => { count++; };
    const pending = h.api.save(new Blob(['{}'], { type: 'application/json' }), '预设.json');
    assert.equal(count, 0);
    assert.ok(h.find('button', '保存到文件'));
    await h.find('button', '保存到文件').click();
    assert.equal(await pending, true);
    assert.equal(count, 1);
}

// Unsupported native file sharing retains standard download and optional preview.
{
    const h = fixture(true);
    h.context.navigator.canShare = () => false;
    h.context.navigator.share = async () => assert.fail('unsupported files must not be shared');
    const pending = h.api.save(new Blob(['archive'], { type: 'application/octet-stream' }), '备份.ee');
    assert.equal(h.find('button', '保存到文件'), undefined);
    assert.equal(h.find('a', '打开文件').rel, 'noopener');
    h.find('button', '直接下载').click();
    assert.equal(h.downloads[0].filename, '备份.ee');
    h.find('button', '完成').click();
    assert.equal(await pending, true);
    h.timers.forEach(timer => timer.action());
    assert.equal(h.files.size, 0);
}

// Older WebViews with unusable File constructors still offer normal downloading.
{
    const h = fixture(true);
    h.context.File = function () { throw new Error('File is not constructable'); };
    h.context.navigator.canShare = () => true;
    h.context.navigator.share = async () => assert.fail('unavailable File must not be shared');
    const pending = h.api.save(new Blob(['{}']), '预设.json');
    h.find('button', '直接下载').click();
    h.find('button', '完成').click();
    assert.equal(await pending, true);
    assert.equal(h.downloads[0].filename, '预设.json');
}

// HTML exports remain HTML downloads but are never previewed with app-origin scripts.
{
    const h = fixture(true);
    const pending = h.api.save(new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), '剧情.html');
    assert.equal(h.find('a', '打开文件'), undefined);
    h.find('button', '取消').click();
    assert.equal(await pending, false);
    assert.equal(h.downloads.length, 0);
}

// Share permission/OS failure offers a retry instead of throwing or reporting success.
{
    const h = fixture(true);
    h.context.navigator.canShare = () => true;
    h.context.navigator.share = async () => { throw Object.assign(new Error('blocked'), { name: 'NotAllowedError' }); };
    const pending = h.api.save(new Blob(['{}']), '预设.json');
    await tick();
    assert.ok(h.find('button', '保存到文件'));
    assert.equal(h.downloads.length, 0);
    h.find('button', '取消').click();
    assert.equal(await pending, false);
}

// Reject server errors and disguised HTML/JSON, including HTTP 200 error payloads.
{
    const h = fixture();
    for (const kind of ['image', 'audio']) {
        h.context.fetch = async () => new Response('missing', { status: 404 });
        await assert.rejects(h.api.readMedia('https://invalid.test/file', kind), /HTTP 404/);
        h.context.fetch = async () => new Response('<!doctype html><html>error</html>', { headers: { 'content-type': `${kind}/png` } });
        await assert.rejects(h.api.readMedia('https://invalid.test/file', kind), /错误页面/);
        h.context.fetch = async () => new Response('{"error":"expired"}', { headers: { 'content-type': `${kind}/mpeg` } });
        await assert.rejects(h.api.readMedia('https://invalid.test/file', kind), /错误页面/);
    }
    h.context.fetch = async () => new Response(png, { headers: { 'content-type': 'application/octet-stream' } });
    assert.equal((await h.api.readMedia('https://valid.test/image', 'image')).type, 'image/png');
}

// Regression: an expired/unreadable original must not break the displayed local image.
{
    const h = fixture();
    const local = `data:image/png;base64,${png.toString('base64')}`;
    h.context.fetch = async url => url === local ? new Response(png, { headers: { 'content-type': 'image/png' } }) : new Response('expired', { status: 403 });
    assert.equal(await h.api.saveImage('https://expired.test/image', '图片.png', [local]), true);
    assert.deepEqual(Buffer.from(await h.downloads[0].blob.arrayBuffer()), png);
    assert.equal(h.downloads[0].filename, '图片.png');
    assert.equal(await h.api.saveImage('https://expired.test/image', '失败.png'), false);
    assert.equal(h.downloads.length, 1, 'failed originals must not produce fake image files');
}

console.log('File download tests passed: unchanged files, URL lifetime, iOS saving/retry/cancel, media errors and image fallback.');
