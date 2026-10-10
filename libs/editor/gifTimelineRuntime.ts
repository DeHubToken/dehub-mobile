/** Keep this timeline decoder identical in web and mobile. */
export const GIF_TIMELINE_RUNTIME = String.raw`
function createGifTimeline(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > 50 * 1024 * 1024) throw new Error("GIF file too large");
  var p = 0;
  function take(n) {
    if (p + n > bytes.length) throw new Error("Incomplete GIF");
    var out = bytes.subarray(p, p + n); p += n; return out;
  }
  function byte() { return take(1)[0]; }
  function word() { var b = take(2); return b[0] + b[1] * 256; }
  function text(n) { return String.fromCharCode.apply(null, take(n)); }
  function blocks() {
    var parts = [], size = 0, n;
    while ((n = byte())) { var part = take(n); parts.push(part); size += n; }
    var out = new Uint8Array(size), at = 0;
    parts.forEach(function(part) { out.set(part, at); at += part.length; });
    return out;
  }
  function lzw(data, minimum, count) {
    if (minimum < 2 || minimum > 8) throw new Error("Invalid GIF code size");
    var clear = 1 << minimum, end = clear + 1, next = end + 1, size = minimum + 1;
    var prefix = new Uint16Array(4096), suffix = new Uint8Array(4096), stack = new Uint8Array(4097);
    var out = new Uint8Array(count), at = 0, bit = 0, old = -1, first = 0, ended = false;
    while (bit + size <= data.length * 8) {
      var code = 0;
      for (var k = 0; k < size; k++, bit++) code |= ((data[bit >> 3] >> (bit & 7)) & 1) << k;
      if (code === clear) { next = end + 1; size = minimum + 1; old = -1; continue; }
      if (code === end) { ended = true; break; }
      var original = code, top = 0;
      if (code === next && old >= 0) { stack[top++] = first; code = old; }
      else if (code >= next) throw new Error("Invalid GIF dictionary");
      while (code >= clear) {
        if (code < end + 1 || code >= next || top >= 4096) throw new Error("Invalid GIF dictionary");
        stack[top++] = suffix[code]; code = prefix[code];
      }
      first = code; stack[top++] = first;
      if (at + top > count) throw new Error("Invalid GIF pixels");
      while (top) out[at++] = stack[--top];
      if (old >= 0 && next < 4096) {
        prefix[next] = old; suffix[next] = first; next++;
        if (next === (1 << size) && size < 12) size++;
      }
      old = original;
    }
    if (!ended || at !== count) throw new Error("Incomplete GIF pixels");
    return out;
  }
  var signature = text(6);
  if (signature !== "GIF87a" && signature !== "GIF89a") throw new Error("Invalid GIF header");
  var width = word(), height = word(), flags = byte(), background = byte(); byte();
  if (!width || !height || width * height > 4194304) throw new Error("GIF dimensions too large");
  var global = flags & 128 ? take(3 * (1 << ((flags & 7) + 1))).slice() : null;
  var frames = [], duration = 0, budget = 0, repeats = -1, control = null, finished = false;
  while (p < bytes.length) {
    var marker = byte();
    if (marker === 59) { finished = true; break; }
    if (marker === 33) {
      var label = byte();
      if (label === 249) {
        if (byte() !== 4) throw new Error("Invalid GIF control");
        var packed = byte(), delay = word(), transparent = byte();
        if (byte() !== 0) throw new Error("Invalid GIF control");
        control = { disposal: (packed >> 2) & 7, delay: delay < 2 ? 10 : delay, transparent: packed & 1 ? transparent : -1 };
      } else if (label === 255) {
        var application = text(byte()), extension = blocks();
        if ((application === "NETSCAPE2.0" || application === "ANIMEXTS1.0") && extension.length >= 3 && extension[0] === 1) repeats = extension[1] + extension[2] * 256;
      } else {
        blocks();
        if (label === 1) throw new Error("GIF text frames are unsupported");
      }
      continue;
    }
    if (marker !== 44) throw new Error("Invalid GIF block");
    var x = word(), y = word(), w = word(), h = word(), imageFlags = byte();
    if (!w || !h || x + w > width || y + h > height || frames.length >= 4096) throw new Error("Invalid GIF frame dimensions");
    var palette = imageFlags & 128 ? take(3 * (1 << ((imageFlags & 7) + 1))).slice() : global;
    if (!palette) throw new Error("Missing GIF palette");
    budget += w * h + palette.length;
    if (budget > 64 * 1024 * 1024) throw new Error("GIF animation too large");
    var minimum = byte(), pixels = lzw(blocks(), minimum, w * h);
    if (imageFlags & 64) {
      var rows = new Uint8Array(w * h), row = 0, starts = [0, 4, 2, 1], steps = [8, 8, 4, 2];
      for (var pass = 0; pass < 4; pass++) for (var line = starts[pass]; line < h; line += steps[pass]) { rows.set(pixels.subarray(row * w, (++row) * w), line * w); }
      pixels = rows;
    }
    var ctl = control || { disposal: 0, delay: 10, transparent: -1 };
    if (ctl.disposal > 3) throw new Error("Invalid GIF disposal");
    for (var i = 0; i < pixels.length; i++) if (pixels[i] !== ctl.transparent && pixels[i] * 3 + 2 >= palette.length) throw new Error("Invalid GIF colour");
    duration += ctl.delay;
    frames.push({ x: x, y: y, width: w, height: h, pixels: pixels, palette: palette, disposal: ctl.disposal, transparent: ctl.transparent, end: duration });
    control = null;
  }
  if (!finished || !frames.length) throw new Error("Incomplete GIF animation");
  var rgba = new Uint8ClampedArray(width * height * 4), current = -1, saved = null;
  function fill(frame, transparent) {
    var colour = global && background * 3 + 2 < global.length ? global.subarray(background * 3, background * 3 + 3) : null;
    for (var y = frame.y; y < frame.y + frame.height; y++) for (var x = frame.x; x < frame.x + frame.width; x++) {
      var at = (y * width + x) * 4;
      rgba[at] = transparent || !colour ? 0 : colour[0]; rgba[at + 1] = transparent || !colour ? 0 : colour[1]; rgba[at + 2] = transparent || !colour ? 0 : colour[2]; rgba[at + 3] = transparent || !colour ? 0 : 255;
    }
  }
  function indexAt(seconds) {
    var tick = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds * 100 + 1e-7)) : 0;
    if (repeats !== 0 && tick >= duration * (repeats < 0 ? 1 : repeats + 1)) return frames.length - 1;
    tick %= duration;
    var low = 0, high = frames.length - 1;
    while (low < high) { var mid = (low + high) >> 1; if (tick < frames[mid].end) high = mid; else low = mid + 1; }
    return low;
  }
  function frameAt(seconds) {
    var target = indexAt(seconds);
    if (target < current) { current = -1; saved = null; }
    if (current < 0) fill({ x: 0, y: 0, width: width, height: height }, frames[0].transparent >= 0);
    while (current < target) {
      if (current >= 0) {
        var previous = frames[current];
        if (previous.disposal === 2) fill(previous, previous.transparent >= 0);
        else if (previous.disposal === 3 && saved) rgba.set(saved);
      }
      var frame = frames[++current];
      saved = frame.disposal === 3 ? rgba.slice() : null;
      for (var row = 0; row < frame.height; row++) for (var col = 0; col < frame.width; col++) {
        var value = frame.pixels[row * frame.width + col];
        if (value === frame.transparent) continue;
        var at = ((row + frame.y) * width + col + frame.x) * 4, colour = value * 3;
        rgba[at] = frame.palette[colour]; rgba[at + 1] = frame.palette[colour + 1]; rgba[at + 2] = frame.palette[colour + 2]; rgba[at + 3] = 255;
      }
    }
    return rgba;
  }
  return { width: width, height: height, duration: duration / 100, frameCount: frames.length, repeats: repeats, indexAt: indexAt, frameAt: frameAt };
}
function createGifCanvas(bytes) {
  var timeline = createGifTimeline(bytes), canvas = document.createElement("canvas");
  canvas.width = timeline.width; canvas.height = timeline.height;
  var context = canvas.getContext("2d");
  if (!context) throw new Error("GIF canvas unavailable");
  var pixels = context.createImageData(timeline.width, timeline.height), last = -1;
  return { frame: function(seconds) {
    var index = timeline.indexAt(seconds);
    if (index !== last) { pixels.data.set(timeline.frameAt(seconds)); context.putImageData(pixels, 0, 0); last = index; }
    return canvas;
  } };
}
`;
