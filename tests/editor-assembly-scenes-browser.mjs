import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const platform = process.env.EDITOR_PLATFORM;
assert(['web', 'mobile'].includes(platform));
assert(process.env.EDITOR_BROWSER_ROOT);
const dependencies = resolve(process.env.EDITOR_BROWSER_ROOT, 'node_modules');
const { chromium } = await import(pathToFileURL(resolve(dependencies, 'playwright/index.mjs')).href);
const { build } = await import(pathToFileURL(resolve(dependencies, 'esbuild/lib/main.js')).href);
const directory = resolve('assembly-scenes-browser-results');
await mkdir(directory, { recursive: true });
const videoFile = resolve(directory, 'source-colours.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=640x360:r=30:d=8', '-vf', "drawbox=color=0x00ff00:t=fill:enable='between(t,2,3.999)',drawbox=color=blue:t=fill:enable='between(t,4,5.999)',drawbox=color=yellow:t=fill:enable='gte(t,6)'", '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', videoFile]);
const videoBase64 = (await readFile(videoFile)).toString('base64');
const root = resolve(platform === 'web' ? 'src/lib/editor' : 'libs/editor');
const entry = `import {validVisualFrames} from ${JSON.stringify(resolve(root, 'visualHighlightContract.ts'))};
${platform === 'web'
    ? `import {processVisualFrames} from ${JSON.stringify(resolve(root, 'processVisualFrames.ts'))};window.editor={validVisualFrames,processVisualFrames};`
    : `import {EDITOR_CANVAS_HTML} from ${JSON.stringify(resolve(root, 'canvasHtml.ts'))};window.editor={validVisualFrames};window.canvasHTML=EDITOR_CANVAS_HTML;`}`;
const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'iife', platform: 'browser', nodePaths: [dependencies], write: false });
const server = createServer((request, response) => {
  if (request.url === '/editor.js') { response.setHeader('content-type', 'text/javascript'); response.end(bundle.outputFiles[0].text); }
  else { response.setHeader('content-type', 'text/html'); response.end('<!doctype html><meta charset="utf-8"><script src="/editor.js"></script>'); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(origin);
  if (platform === 'mobile') {
    const canvas = await page.evaluate(() => window.canvasHTML);
    assert(!canvas.includes('__VISUAL_FRAME_RUNTIME__'));
    await page.route(origin + '/native', route => route.fulfill({ contentType: 'text/html', body: canvas.replace('<script>', '<script src="/editor.js"></script><script>window.messages=[];window.ReactNativeWebView={postMessage(value){const message=JSON.parse(value);window.messages.push(message);window.dispatchEvent(new CustomEvent("native-reply",{detail:message}))}};') }));
    await page.goto(origin + '/native');
    await page.waitForFunction(() => window.messages.some(message => message.type === 'ready'));
  }
  const report = await page.evaluate(async ({ platform, videoBase64 }) => {
    const windows = [{ id: 0, start: 0, end: 1 }];
    const photo = { id: 'library-photo', mediaId: 'never-on-timeline-photo', kind: 'image', trackId: 'unused', start: 0, duration: 1, trimIn: 0, speed: 1 };
    const clip = { id: 'library-video', mediaId: 'never-on-timeline-video', kind: 'video', trackId: 'unused', start: 0, duration: 4, trimIn: 1, speed: 1.25, sourceDuration: 8 };
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 400;
    const context = canvas.getContext('2d'); context.fillStyle = '#aa33ee'; context.fillRect(0, 0, 800, 400);
    const imageBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const videoBlob = new Blob([Uint8Array.from(atob(videoBase64), value => value.charCodeAt(0))], { type: 'video/mp4' });
    let nextId = 0;
    const nativeReply = (reqId, types, action) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { window.removeEventListener('native-reply', receive); reject(new Error('native reply timeout')); }, 10000);
      function receive(event) { const message = event.detail; if (message.reqId !== reqId || !types.includes(message.type)) return; clearTimeout(timer); window.removeEventListener('native-reply', receive); resolve(message); }
      window.addEventListener('native-reply', receive); action();
    });
    const send = message => window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
    const transfer = async (blob, reqId) => {
      const begin = await nativeReply(reqId, ['visualSourceAck', 'visualFailed'], () => send({ type: 'visualSourceBegin', reqId, mime: blob.type }));
      if (begin.type === 'visualFailed') throw new Error(begin.error);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      for (let position = 0; position < bytes.length; position += 1024 * 1024) {
        let text = ''; for (const byte of bytes.subarray(position, position + 1024 * 1024)) text += String.fromCharCode(byte);
        const part = await nativeReply(reqId, ['visualSourceAck', 'visualFailed'], () => send({ type: 'visualSourceChunk', reqId, b64: btoa(text) }));
        if (part.type === 'visualFailed') throw new Error(part.error);
      }
    };
    const sample = async (blob, source, range) => {
      if (platform === 'web') return window.editor.processVisualFrames(blob, source, range, new AbortController().signal, () => {});
      const reqId = 'sample-' + ++nextId; await transfer(blob, reqId);
      const result = await nativeReply(reqId, ['visualReady', 'visualFailed'], () => send({ type: 'visualFrames', reqId, clip: source, windows: range }));
      if (result.type === 'visualFailed') throw new Error(result.error);
      return result.frames;
    };
    const pixels = async frames => Promise.all(frames.map(frame => new Promise((resolve, reject) => {
      const image = new Image(); image.onerror = reject; image.onload = () => {
        const surface = document.createElement('canvas'); surface.width = image.width; surface.height = image.height;
        const ctx = surface.getContext('2d'); ctx.drawImage(image, 0, 0);
        resolve({ at: frame.at, width: image.width, height: image.height, rgb: Array.from(ctx.getImageData(Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1).data).slice(0, 3), bytes: frame.dataUrl.length });
      }; image.src = frame.dataUrl;
    })));
    const still = await sample(imageBlob, photo, windows);
    if (!window.editor.validVisualFrames(still, windows)) throw new Error('invalid real still frames');
    const movingWindows = [{ id: 0, start: 0, end: 4 }];
    const moving = await sample(videoBlob, clip, movingWindows);
    if (!window.editor.validVisualFrames(moving, movingWindows)) throw new Error('invalid real video frames');
    let missingFailed = false;
    try { await sample(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), photo, windows); } catch (error) { missingFailed = String(error).includes('image unavailable'); }
    let cancelled = false, malformedRejected = true;
    if (platform === 'web') {
      const controller = new AbortController(); const pending = window.editor.processVisualFrames(imageBlob, photo, windows, controller.signal, () => {}); controller.abort();
      try { await pending; } catch (error) { cancelled = error.name === 'AbortError'; }
    } else {
      const reqId = 'cancel-photo'; await transfer(imageBlob, reqId);
      send({ type: 'visualFrames', reqId, clip: photo, windows }); send({ type: 'visualCancel', reqId });
      const badId = 'malformed-source';
      await nativeReply(badId, ['visualSourceAck'], () => send({ type: 'visualSourceBegin', reqId: badId, mime: 'image/png' }));
      const failure = await nativeReply(badId, ['visualFailed'], () => send({ type: 'visualSourceChunk', reqId: badId, b64: 'not-base64' }));
      malformedRejected = failure.type === 'visualFailed';
      await sample(imageBlob, photo, windows);
      cancelled = !window.messages.some(message => message.reqId === reqId && ['visualReady', 'visualFailed'].includes(message.type));
    }
    const afterRecovery = await sample(imageBlob, photo, windows);
    if (!window.editor.validVisualFrames(afterRecovery, windows)) throw new Error('recovery failed');
    const proof = document.createElement('div'); proof.style.cssText = 'position:fixed;inset:0;background:white;padding:20px;overflow:auto;z-index:999';
    for (const frame of [...still, ...moving]) { const image = new Image(); image.src = frame.dataUrl; image.style.cssText = 'width:180px;margin:8px'; proof.append(image); }
    document.body.append(proof);
    return { still: await pixels(still), moving: await pixels(moving), missingFailed, cancelled, malformedRejected, recovery: true, remainingDecoders: document.querySelectorAll('iframe').length, videoTrim: clip.trimIn, videoSpeed: clip.speed, providerUsed: false, physicalDeviceVerified: false };
  }, { platform, videoBase64 });
  assert.equal(report.still.length, 6); assert.equal(report.moving.length, 6);
  for (const frame of report.still) {
    assert.equal(frame.width, 320); assert.equal(frame.height, 160); assert(frame.bytes <= 40000);
    for (let channel = 0; channel < 3; channel++) assert(Math.abs(frame.rgb[channel] - [170, 51, 238][channel]) < 8, JSON.stringify(frame));
  }
  for (const frame of report.moving) {
    assert.equal(frame.width, 320); assert.equal(frame.height, 180); assert(frame.bytes <= 40000);
    const sourceTime = 1 + frame.at * 1.25;
    const expected = sourceTime < 2 ? [255, 0, 0] : sourceTime < 4 ? [0, 255, 0] : sourceTime < 6 ? [0, 0, 255] : [255, 255, 0];
    for (let channel = 0; channel < 3; channel++) assert(Math.abs(frame.rgb[channel] - expected[channel]) < 8, JSON.stringify({ ...frame, sourceTime, expected }));
  }
  assert(report.missingFailed); assert(report.cancelled); assert(report.malformedRejected); assert(report.recovery);
  assert.equal(report.remainingDecoders, 0); assert.deepEqual(errors, []);
  await page.screenshot({ path: resolve(directory, `${platform}-decoded-frames.png`) });
  report.platform = platform; report.browser = browser.version(); report.sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  await writeFile(resolve(directory, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ platform, sourceSha: report.sourceSha, stillFrames: 6, videoFrames: 6, missingFailed: true, cancelled: true, recovery: true, providerUsed: false }));
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
