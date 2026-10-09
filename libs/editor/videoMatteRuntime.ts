import { VIDEO_FRAME_RUNTIME } from "./videoFrame";
export const VIDEO_MATTE_WORKER = String.raw`
var library = null, model = null, processor = null;
var MODEL = "studioludens/birefnet-lite-512", REVISION = "4a3c40c36c94093cc1e724d9ea428b8fa4b57dc7";
function float16(value) {
  var exponent = (value >> 10) & 31, fraction = value & 1023;
  return (value & 32768 ? -1 : 1) * (exponent === 0 ? Math.pow(2, -14) * fraction / 1024 : exponent === 31 ? (fraction ? NaN : Infinity) : Math.pow(2, exponent - 15) * (1 + fraction / 1024));
}
self.onmessage = async function (event) {
  var d = event.data || {}, input = null, outputs = null;
  try {
    if (!library) {
      library = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js");
      library.env.allowLocalModels = false;
      library.env.backends.onnx.wasm.numThreads = 1;
    }
    if (!model) {
      var files = {};
      var progress = function (p) {
        if (p.status !== "progress" || !p.file || !p.total) return;
        files[p.file] = { loaded: p.loaded || 0, total: p.total };
        var loaded = 0, total = 0;
        Object.keys(files).forEach(function (k) { loaded += files[k].loaded; total += files[k].total; });
        self.postMessage({ id: d.id, type: "progress", fraction: loaded / Math.max(1, total) });
      };
      var loaded = await Promise.all([
        library.AutoModel.from_pretrained(MODEL, { revision: REVISION, device: d.mode, dtype: d.mode === "webgpu" ? "fp16" : "fp32", progress_callback: progress }),
        library.AutoProcessor.from_pretrained(MODEL, { revision: REVISION })
      ]);
      model = loaded[0]; processor = loaded[1];
    }
    self.postMessage({ id: d.id, type: "running" });
    var image = await library.RawImage.fromBlob(d.blob);
    input = await processor(image);
    outputs = await model({ input_image: input.pixel_values });
    var logits = outputs.logits || outputs.output_image;
    if (!logits || logits.dims[logits.dims.length - 1] !== 512 || logits.data.length !== 512 * 512 || (logits.type !== "float32" && logits.type !== "float16")) throw new Error("Unexpected background mask");
    var pixels = new Uint8ClampedArray(512 * 512 * 4);
    for (var i = 0; i < logits.data.length; i++) {
      var v = logits.type === "float16" ? float16(logits.data[i]) : logits.data[i];
      if (Number.isNaN(v)) throw new Error("Invalid background mask");
      pixels[i * 4] = 255; pixels[i * 4 + 1] = 255; pixels[i * 4 + 2] = 255;
      pixels[i * 4 + 3] = Math.round(255 / (1 + Math.exp(-v)));
    }
    self.postMessage({ id: d.id, type: "done", pixels: pixels }, [pixels.buffer]);
  } catch (e) { self.postMessage({ id: d.id, type: "error", error: String(e && e.message || e) }); }
  finally {
    if (input && input.pixel_values && input.pixel_values.dispose) input.pixel_values.dispose();
    if (outputs) Object.keys(outputs).forEach(function (key) { if (outputs[key] && outputs[key].dispose) outputs[key].dispose(); });
  }
};
`;
export const VIDEO_MATTE_CORE = String.raw`
function videoMattePlan(clip, width, height, sourceDuration, fps) {
  var speed = clip.speed == null ? 1 : clip.speed;
  var start = clip.trimIn, end = start + clip.duration * speed;
  if (clip.kind !== "video" || !Number.isFinite(speed) || speed <= 0 || !Number.isFinite(start) || start < 0 || !Number.isFinite(end) || end <= start || !Number.isFinite(sourceDuration) || end > sourceDuration + 0.002 || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || !Number.isFinite(fps) || fps < 1 || fps > 120) throw new Error("Invalid video range for background removal");
  var frames = Math.ceil((end - start) * fps - 1e-8);
  if (frames < 1) throw new Error("Video range is too short for background removal");
  if (end - start > 600 + 1e-8 || frames > 72000) throw new Error("Trim this clip to 600 source seconds before removing its background");
  var count = Math.min(600, frames);
  var scale = Math.min(1, 512 / Math.max(width, height));
  var w = Math.max(1, Math.floor(width * scale)), h = Math.max(1, Math.floor(height * scale));
  var columns = Math.min(count, Math.max(1, Math.ceil(Math.sqrt(count * h / w))));
  var rows = Math.ceil(count / columns);
  var shrink = Math.min(1, 4096 / (w * columns), 4096 / (h * rows), Math.sqrt(16777216 / (w * h * columns * rows)));
  w = Math.max(1, Math.floor(w * shrink)); h = Math.max(1, Math.floor(h * shrink));
  return { sourceMediaId: clip.mediaId, start: start, end: end, fps: fps, frames: frames, width: w, height: h, columns: columns, atlasWidth: w * columns, atlasHeight: h * rows, model: "birefnet-lite-512:4a3c40c" };
}
function videoMattePagePlan(plan, pageIndex) {
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex * 600 >= plan.frames) throw new Error("Invalid background page");
  var firstFrame = pageIndex * 600, frames = Math.min(600, plan.frames - firstFrame), columns = Math.min(plan.columns, frames);
  return { firstFrame: firstFrame, frames: frames, columns: columns, atlasWidth: columns * plan.width, atlasHeight: Math.ceil(frames / columns) * plan.height };
}
function validVideoMatte(clip) {
  var m = clip.videoMatte;
  if (!m || m.sourceMediaId !== clip.mediaId || typeof m.mediaId !== "string" || !m.mediaId.length || !Number.isFinite(m.start) || m.start < 0 || !Number.isFinite(m.end) || m.end <= m.start || m.end - m.start > 600 + 1e-8 || !Number.isFinite(m.fps) || m.fps < 1 || m.fps > 120 || !Number.isInteger(m.frames) || m.frames < 1 || m.frames > 72000 || m.frames !== Math.ceil((m.end - m.start) * m.fps - 1e-8) || !Number.isInteger(m.width) || m.width < 1 || m.width > 512 || !Number.isInteger(m.height) || m.height < 1 || m.height > 512 || !Number.isInteger(m.columns) || m.columns < 1 || m.columns > Math.min(m.frames, 600)) return false;
  if (m.pages === undefined) return m.frames <= 600 && m.atlasWidth === m.width * m.columns && m.atlasHeight === m.height * Math.ceil(m.frames / m.columns) && m.atlasWidth <= 4096 && m.atlasHeight <= 4096 && m.atlasWidth * m.atlasHeight <= 16777216;
  if (!Array.isArray(m.pages) || m.pages.length !== Math.ceil(m.frames / 600) || m.pages.length > 120) return false;
  var seen = new Set();
  for (var i = 0; i < m.pages.length; i++) {
    var page = m.pages[i], expected = videoMattePagePlan(m, i);
    if (!page || typeof page.mediaId !== "string" || !page.mediaId.length || seen.has(page.mediaId) || page.firstFrame !== expected.firstFrame || page.frames !== expected.frames || page.columns !== expected.columns || page.atlasWidth !== expected.atlasWidth || page.atlasHeight !== expected.atlasHeight || page.atlasWidth > 4096 || page.atlasHeight > 4096 || page.atlasWidth * page.atlasHeight > 16777216) return false;
    seen.add(page.mediaId);
  }
  return m.mediaId === m.pages[0].mediaId && m.atlasWidth === m.pages[0].atlasWidth && m.atlasHeight === m.pages[0].atlasHeight;
}
function videoMatteFrame(clip, sourceTime) {
  if (!validVideoMatte(clip) || !Number.isFinite(sourceTime)) return null;
  var m = clip.videoMatte;
  if (sourceTime < m.start - 1e-6 || sourceTime >= m.end + 1e-6) return null;
  var index = Math.min(m.frames - 1, Math.max(0, Math.floor((sourceTime - m.start) * m.fps + 1e-7)));
  var pageIndex = Math.floor(index / 600), page = m.pages ? m.pages[pageIndex] : m;
  var localIndex = m.pages ? index - m.pages[pageIndex].firstFrame : index;
  return { x: (localIndex % page.columns) * m.width, y: Math.floor(localIndex / page.columns) * m.height, width: m.width, height: m.height, index: index, mediaId: page.mediaId, atlasWidth: page.atlasWidth, atlasHeight: page.atlasHeight, pageIndex: pageIndex };
}
function videoMatteMediaIds(matte) {
  if (!matte) return [];
  var ids = [matte.mediaId];
  if (Array.isArray(matte.pages)) for (var page of matte.pages) if (page && typeof page.mediaId === "string") ids.push(page.mediaId);
  return Array.from(new Set(ids.filter(function(id) { return typeof id === "string" && id.length > 0; })));
}
function assertVideoMattes(clips, available) {
  for (var clip of clips) {
    if (clip.kind !== "video" || !clip.videoMatte) continue;
    var m = clip.videoMatte, end = clip.trimIn + clip.duration * (clip.speed == null ? 1 : clip.speed);
    if (!validVideoMatte(clip) || clip.trimIn < m.start - 1e-6 || end > m.end + 1e-6) throw new Error("Background-removal frames are missing for this range. Restore the background or remove it again before exporting.");
    var pages = m.pages || [m];
    for (var page of pages) if (!available(page.mediaId, page.atlasWidth, page.atlasHeight)) throw new Error("Background-removal frames are missing for this range. Restore the background or remove it again before exporting.");
  }
}
`;
export const VIDEO_MATTE_RUNTIME = VIDEO_FRAME_RUNTIME + "\n" + VIDEO_MATTE_CORE + "\nvar videoMatteWorkerSource = " + JSON.stringify(VIDEO_MATTE_WORKER) + ";\n" + String.raw`
async function createVideoMatte(sourceUrl, clip, fps, onProgress, signal, storePage) {
  var video = document.createElement("video"), atlas = document.createElement("canvas"), capture = document.createElement("canvas"), mask = document.createElement("canvas");
  var worker = null, workerUrl = null, mode = typeof navigator !== "undefined" && navigator.gpu ? "webgpu" : "wasm", sequence = 0;
  function cancelled() { if (signal && signal.aborted) throw new DOMException("Background removal cancelled", "AbortError"); }
  function waitEvent(target, eventName, begin, timeout) {
    return new Promise(function (resolve, reject) {
      function finish(error) { clearTimeout(timer); target.removeEventListener(eventName, ready); target.removeEventListener("error", failed); if (signal) signal.removeEventListener("abort", aborted); error ? reject(error) : resolve(); }
      function ready() { finish(); }
      function failed() { finish(new Error("Video frame could not be decoded")); }
      function aborted() { finish(new DOMException("Background removal cancelled", "AbortError")); }
      var timer = setTimeout(function () { finish(new Error("Video frame timed out")); }, timeout);
      target.addEventListener(eventName, ready); target.addEventListener("error", failed);
      if (signal) signal.addEventListener("abort", aborted, { once: true });
      if (signal && signal.aborted) { aborted(); return; }
      try { begin(); } catch (e) { finish(e); }
    });
  }
  function freshWorker() {
    if (worker) worker.terminate();
    if (workerUrl) URL.revokeObjectURL(workerUrl);
    workerUrl = URL.createObjectURL(new Blob([videoMatteWorkerSource], { type: "text/javascript" }));
    worker = new Worker(workerUrl, { type: "module" });
  }
  async function infer(blob, completed, total) {
    if (!worker) freshWorker();
    var id = ++sequence;
    return new Promise(function (resolve, reject) {
      var timer;
      function finish(error, pixels) { clearTimeout(timer); worker.removeEventListener("message", message); worker.removeEventListener("error", failed); if (signal) signal.removeEventListener("abort", aborted); error ? reject(error) : resolve(pixels); }
      function deadline() { clearTimeout(timer); timer = setTimeout(function () { finish(new Error("Background removal stopped responding")); }, 180000); }
      function message(event) {
        var d = event.data || {}; if (d.id !== id) return;
        deadline();
        if (d.type === "progress") onProgress({ stage: "download", fraction: d.fraction, completed: completed, total: total });
        else if (d.type === "running") onProgress({ stage: "frames", fraction: completed / total, completed: completed, total: total });
        else if (d.type === "done") finish(null, d.pixels);
        else if (d.type === "error") finish(new Error(d.error));
      }
      function failed(event) { finish(new Error(event.message || "Background-removal worker failed")); }
      function aborted() { finish(new DOMException("Background removal cancelled", "AbortError")); }
      worker.addEventListener("message", message); worker.addEventListener("error", failed);
      if (signal) signal.addEventListener("abort", aborted, { once: true });
      deadline();
      if (signal && signal.aborted) { aborted(); return; }
      try { worker.postMessage({ id: id, blob: blob, mode: mode }); } catch (e) { finish(e); }
    });
  }
  try {
    cancelled(); video.muted = true; video.playsInline = true; video.preload = "auto";
    if (sourceUrl.indexOf("blob:") !== 0) video.crossOrigin = "anonymous";
    await waitEvent(video, "loadeddata", function () { video.src = sourceUrl; video.load(); }, 30000);
    var sourceDuration = Number.isFinite(video.duration) ? video.duration : clip.sourceDuration;
    var plan = videoMattePlan(clip, video.videoWidth, video.videoHeight, sourceDuration, fps);
    if (plan.frames > 600 && !storePage) throw new Error("Long background removal requires page storage");
    var pages = [], pageIndex = 0, page = videoMattePagePlan(plan, 0);
    atlas.width = page.atlasWidth; atlas.height = page.atlasHeight;
    var a = atlas.getContext("2d"), c = capture.getContext("2d"), m = mask.getContext("2d");
    if (!a || !c || !m) throw new Error("Background removal requires a canvas");
    var scale = Math.min(1, 512 / Math.max(video.videoWidth, video.videoHeight));
    capture.width = Math.max(1, Math.round(video.videoWidth * scale)); capture.height = Math.max(1, Math.round(video.videoHeight * scale));
    mask.width = 512; mask.height = 512;
    for (var index = 0; index < plan.frames; index++) {
      cancelled();
      var time = Math.min(sourceDuration - 0.001, plan.start + index / plan.fps);
      await waitForVideoFrame(video, time, { signal: signal });
      c.drawImage(video, 0, 0, capture.width, capture.height);
      var blob = await new Promise(function (resolve, reject) { capture.toBlob(function (b) { b ? resolve(b) : reject(new Error("Video frame could not be read")); }, "image/png"); });
      var pixels;
      try { pixels = await infer(blob, index, plan.frames); }
      catch (e) {
        cancelled();
        if (mode !== "webgpu") throw e;
        mode = "wasm"; freshWorker(); onProgress({ stage: "fallback", fraction: index / plan.frames, completed: index, total: plan.frames });
        pixels = await infer(blob, index, plan.frames);
      }
      cancelled();
      if (!(pixels instanceof Uint8ClampedArray) || pixels.length !== 512 * 512 * 4) throw new Error("Background-removal frame is incomplete");
      m.putImageData(new ImageData(pixels, 512, 512), 0, 0);
      var localIndex = index - page.firstFrame;
      a.drawImage(mask, 0, 0, 512, 512, (localIndex % page.columns) * plan.width, Math.floor(localIndex / page.columns) * plan.height, plan.width, plan.height);
      onProgress({ stage: "frames", fraction: (index + 1) / plan.frames, completed: index + 1, total: plan.frames });
      if (localIndex + 1 === page.frames) {
        cancelled();
        var png = await new Promise(function (resolve, reject) { atlas.toBlob(function (b) { b ? resolve(b) : reject(new Error("Background frames could not be saved")); }, "image/png"); });
        if (png.size > 16 * 1024 * 1024) throw new Error("Background frames are too large; trim this clip first");
        var dataUrl = await new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve(reader.result); }; reader.onerror = function () { reject(new Error("Background frames could not be saved")); }; reader.readAsDataURL(png); });
        cancelled();
        if (!storePage) return { plan: plan, dataUrl: dataUrl };
        var mediaId = await storePage(Object.assign({}, page, { dataUrl: dataUrl }), plan, pageIndex);
        cancelled();
        if (typeof mediaId !== "string" || !mediaId.length || mediaId.length > 256 || pages.some(function(p) { return p.mediaId === mediaId; })) throw new Error("Background page could not be stored");
        pages.push(Object.assign({}, page, { mediaId: mediaId }));
        dataUrl = null; png = null;
        pageIndex++;
        if (index + 1 < plan.frames) {
          page = videoMattePagePlan(plan, pageIndex);
          atlas.width = page.atlasWidth; atlas.height = page.atlasHeight;
        }
      }
    }
    cancelled(); return { plan: plan, matte: Object.assign({}, plan, { mediaId: pages[0].mediaId, pages: pages }) };
  } finally {
    if (worker) worker.terminate(); if (workerUrl) URL.revokeObjectURL(workerUrl);
    video.pause(); video.removeAttribute("src"); video.load(); atlas.width = 1; atlas.height = 1; capture.width = 1; capture.height = 1; mask.width = 1; mask.height = 1;
  }
}
`;
