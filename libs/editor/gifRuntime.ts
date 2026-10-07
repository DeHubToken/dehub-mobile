/** Keep this runtime identical in web and mobile; it also runs inside a worker. */
export const GIF_RUNTIME = String.raw`
function gifPlan(width, height, scale, duration, fps) {
  if (![width, height, scale, duration, fps].every(Number.isFinite) || width < 1 || height < 1 || scale <= 0 || duration <= 0 || duration > 62.21 || fps <= 0) throw new Error("GIF range");
  var k = Math.min(scale, 640 / Math.max(width, height));
  var rate = Math.min(15, fps);
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)), fps: rate, frames: Math.ceil(duration * rate), duration: duration };
}
function gifFrameDelay(frame, plan) {
  var from = Math.round(frame / plan.fps * 100);
  var to = Math.round(Math.min(plan.duration, (frame + 1) / plan.fps) * 100);
  return Math.max(1, to - from);
}
function createGifEncoder(width, height, limit) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 640 || height > 640) throw new Error("GIF dimensions");
  var parts = [], size = 0, finished = false, frames = 0;
  limit = limit == null ? 100 * 1024 * 1024 : limit;
  function append(bytes) {
    if (size + bytes.length > limit) throw new Error("GIF file too large");
    parts.push(bytes); size += bytes.length;
  }
  function word(out, n) { out.push(n & 255, (n >> 8) & 255); }
  var header = Array.from("GIF89a", function (s) { return s.charCodeAt(0); });
  word(header, width); word(header, height); header.push(247, 255, 0);
  var palette = [];
  for (var r = 0; r < 6; r++) for (var g = 0; g < 6; g++) for (var b = 0; b < 6; b++) palette.push(r * 51, g * 51, b * 51);
  for (var gray = 0; gray < 39; gray++) { var v = Math.round(gray * 255 / 38); palette.push(v, v, v); }
  palette.push(0, 0, 0);
  append(new Uint8Array(header.concat(palette, [33, 255, 11], Array.from("NETSCAPE2.0", function (s) { return s.charCodeAt(0); }), [3, 1, 0, 0, 0])));
  var bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function indexed(rgba) {
    if (rgba.length !== width * height * 4) throw new Error("GIF pixels");
    var out = new Uint8Array(width * height);
    for (var i = 0; i < out.length; i++) {
      var j = i * 4;
      if (rgba[j + 3] < 128) { out[i] = 255; continue; }
      var r = rgba[j], g = rgba[j + 1], b = rgba[j + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) < 20) {
        out[i] = 216 + Math.round((r + g + b) / 3 * 38 / 255);
      } else {
        var d = (bayer[((Math.floor(i / width) & 3) * 4) + ((i % width) & 3)] - 7.5) * 2;
        var qr = Math.max(0, Math.min(5, Math.round((r + d) / 51)));
        var qg = Math.max(0, Math.min(5, Math.round((g + d) / 51)));
        var qb = Math.max(0, Math.min(5, Math.round((b + d) / 51)));
        out[i] = qr * 36 + qg * 6 + qb;
      }
    }
    return out;
  }
  // Clear before the dictionary needs ten-bit codes. This bounds the table,
  // compresses repeated colours and keeps the code stream at nine bits.
  function compress(pixels) {
    var bytes = [], bits = 0, count = 0, table = new Map(), next = 258;
    function emit(code) {
      bits |= code << count; count += 9;
      while (count >= 8) { bytes.push(bits & 255); bits >>>= 8; count -= 8; }
    }
    emit(256);
    var prefix = pixels[0];
    for (var i = 1; i < pixels.length; i++) {
      var value = pixels[i], key = prefix * 256 + value, found = table.get(key);
      if (found != null) { prefix = found; continue; }
      emit(prefix);
      if (next < 511) table.set(key, next++);
      else { emit(256); table.clear(); next = 258; }
      prefix = value;
    }
    emit(prefix);
    // The decoder adds one final entry when it reads the last prefix.
    if (next >= 511) emit(256);
    emit(257);
    if (count) bytes.push(bits & 255);
    var out = [8];
    for (var offset = 0; offset < bytes.length; offset += 255) {
      var n = Math.min(255, bytes.length - offset); out.push(n);
      for (var j = 0; j < n; j++) out.push(bytes[offset + j]);
    }
    out.push(0); return new Uint8Array(out);
  }
  return {
    frame: function (rgba, delay) {
      if (finished || !Number.isInteger(delay) || delay < 1 || delay > 65535) throw new Error("GIF frame");
      var pixels = indexed(rgba);
      var descriptor = [33, 249, 4, 9]; word(descriptor, delay); descriptor.push(255, 0, 44, 0, 0, 0, 0);
      word(descriptor, width); word(descriptor, height); descriptor.push(0);
      append(new Uint8Array(descriptor)); append(compress(pixels)); frames++;
    },
    finish: function () {
      if (finished || !frames) throw new Error("GIF empty or finished");
      append(new Uint8Array([59])); finished = true;
      var result = new Uint8Array(size), offset = 0;
      parts.forEach(function (part) { result.set(part, offset); offset += part.length; });
      parts = []; return result.buffer;
    }
  };
}
function gifWorkerSession(width, height, source) {
  var url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  var worker;
  try { worker = new Worker(url); } finally { URL.revokeObjectURL(url); }
  var pending = null, closed = false;
  function fail(error) { if (pending) { clearTimeout(pending.timer); pending.reject(error); pending = null; } }
  worker.onmessage = function (e) {
    if (!pending) return;
    var p = pending; pending = null; clearTimeout(p.timer);
    if (e.data.type === "error") p.reject(new Error(e.data.error)); else p.resolve(e.data.buffer);
  };
  worker.onerror = function () { fail(new Error("GIF worker failed")); };
  function request(message, transfer) {
    if (closed || pending) return Promise.reject(new Error("GIF cancelled or busy"));
    return new Promise(function (resolve, reject) {
      pending = { resolve: resolve, reject: reject, timer: setTimeout(function () { fail(new Error("GIF encoding timed out")); }, 30000) };
      try { worker.postMessage(message, transfer || []); } catch (error) { fail(error); }
    });
  }
  return {
    ready: request({ type: "init", width: width, height: height }),
    frame: function (rgba, delay) { return request({ type: "frame", buffer: rgba.buffer, delay: delay }, [rgba.buffer]); },
    finish: function () { return request({ type: "finish" }); },
    close: function () { closed = true; worker.terminate(); fail(new Error("GIF cancelled")); }
  };
}
`;

export const GIF_WORKER = GIF_RUNTIME + String.raw`
var encoder = null;
self.onmessage = function (event) {
  try {
    var m = event.data;
    if (m.type === "init") encoder = createGifEncoder(m.width, m.height);
    else if (!encoder) throw new Error("GIF not initialized");
    else if (m.type === "frame") encoder.frame(new Uint8ClampedArray(m.buffer), m.delay);
    else if (m.type === "finish") { var buffer = encoder.finish(); encoder = null; self.postMessage({ type: "done", buffer: buffer }, [buffer]); return; }
    else throw new Error("GIF request");
    self.postMessage({ type: "ready" });
  } catch (error) { self.postMessage({ type: "error", error: String(error && error.message || error) }); }
};
`;
