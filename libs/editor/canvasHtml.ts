/**
 * The page the editor canvas runs in.
 *
 * The design is drawn by a browser canvas inside a WebView, with the same 2D
 * canvas calls the web editor makes in dehubweb src/lib/editor/render.ts and
 * animationPresets.ts. The drawing code below is a line-for-line port of those
 * two files; keep it that way. Any change to how the web draws a clip has to
 * be made here as well, or a design will look different in the two apps.
 *
 * Why a WebView and not a native canvas: installed apps take JS updates over
 * the air but cannot gain a native module that way, and a new native drawing
 * library would crash every binary already in circulation. The WebView is
 * already in the app, and on Android it is the same Chromium canvas the web
 * editor draws with, so the pixels match.
 *
 * Messages in (JSON):  render {snapshot, time, fontCss} · seek {time} · play {time} · pause
 *                      media {id, src} (pictures) · mediaBegin {id, kind, mime} · mediaChunk {id, b64} · mediaEnd {id}
 *                      export {reqId, format, quality} · exportVideo {reqId, width, height, bitrate} · videoAck {reqId} · exportAbort
 *                      stats {reqId, mediaId} · cutout {reqId, mediaId}
 * Messages out (JSON): ready · frame {layers, missing} · exported {reqId, dataUrl} · exportFailed {reqId, error}
 *                      time {time} (while playing) · ended {time} · mediaAck {id} · mediaReady {id, duration, width, height}
 *                      videoProgress {reqId, progress} · videoChunk {reqId, b64, last, ext, done, total} · videoFailed {reqId, error}
 *                      stats {reqId, mean, std, sat} (Auto enhance; null fields when the picture is missing)
 *                      cutoutProgress {reqId, loaded, total} · cutout {reqId, dataUrl, width, height} · cutoutFailed {reqId, error}
 *
 * Written as plain ES2017 inside String.raw: no backticks and no "${" below.
 */
export const EDITOR_CANVAS_HTML = String.raw`<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap">
<style>
html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent;}
canvas{display:block;width:100%;height:100%;}
</style>
</head><body>
<canvas id="c" width="1080" height="1080"></canvas>
<script>
(function () {
  "use strict";
  var canvas = document.getElementById("c");
  var ctx = canvas.getContext("2d");
  var images = new Map();
  var state = null;
  var queued = false;
  var lastFrame = "";

  function post(msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }

  var SUPPORTS_FILTER = (function () {
    try {
      var c = document.createElement("canvas").getContext("2d");
      c.filter = "blur(1px)";
      return c.filter === "blur(1px)";
    } catch (e) { return false; }
  })();

  // ── animationPresets.ts ──
  var IDENTITY = { alpha: 1, scale: 1, dx: 0, dy: 0, blurPx: 0 };
  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }
  function assign(a, b) { var o = {}; var k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }
  function stateFor(kind, p, direction) {
    var t = direction === "in" ? easeOut(p) : easeOut(1 - p);
    var inv = 1 - t;
    switch (kind) {
      case "fade": return assign(IDENTITY, { alpha: t });
      case "slide-up": return assign(IDENTITY, { alpha: t, dy: inv * 0.15 });
      case "slide-down": return assign(IDENTITY, { alpha: t, dy: -inv * 0.15 });
      case "slide-left": return assign(IDENTITY, { alpha: t, dx: inv * 0.15 });
      case "slide-right": return assign(IDENTITY, { alpha: t, dx: -inv * 0.15 });
      case "zoom-in": return assign(IDENTITY, { alpha: t, scale: 0.6 + t * 0.4 });
      case "zoom-out": return assign(IDENTITY, { alpha: t, scale: 1 + inv * 0.4 });
      case "pop": return assign(IDENTITY, { alpha: t, scale: 0.4 + t * (1.05 - 0.4) - (t > 0.85 ? (t - 0.85) * 0.33 : 0) });
      case "rise": return assign(IDENTITY, { alpha: t, dy: inv * 0.06, scale: 0.95 + t * 0.05 });
      case "blur": return assign(IDENTITY, { alpha: t, blurPx: inv * 12 });
    }
    return assign(IDENTITY, {});
  }
  function merge(a, b) {
    return { alpha: a.alpha * b.alpha, scale: a.scale * b.scale, dx: a.dx + b.dx, dy: a.dy + b.dy, blurPx: Math.max(a.blurPx, b.blurPx) };
  }
  function computeClipAnimation(clip, t) {
    var local = t - clip.start;
    var remaining = clip.start + clip.duration - t;
    var s = assign(IDENTITY, {});
    var inA = clip.animateIn;
    if (inA && inA.duration > 0 && local < inA.duration) {
      s = merge(s, stateFor(inA.kind, Math.max(0, Math.min(1, local / inA.duration)), "in"));
    }
    var outA = clip.animateOut;
    if (outA && outA.duration > 0 && remaining < outA.duration) {
      s = merge(s, stateFor(outA.kind, Math.max(0, Math.min(1, 1 - remaining / outA.duration)), "out"));
    }
    return s;
  }

  // ── render.ts ──
  var DEFAULT_TRANSFORM = { x: 0.5, y: 0.5, scale: 1, rotation: 0 };

  function getTransform(clip) {
    var t = assign(DEFAULT_TRANSFORM, clip.transform || {});
    if (clip.kind === "text") { t.x = clip.x; t.y = clip.y; t.scale = 1; }
    return t;
  }
  function isVisualClip(clip) { return clip.kind === "video" || clip.kind === "image" || clip.kind === "text" || clip.kind === "shape"; }
  function mediaSource(clip) {
    if (clip.kind === "video") {
      var v = videos.get(clip.mediaId);
      return v && v.videoWidth ? { el: v, w: v.videoWidth, h: v.videoHeight } : null;
    }
    if (clip.kind !== "image") return null;
    var img = images.get(clip.mediaId);
    return img && img.naturalWidth ? { el: img, w: img.naturalWidth, h: img.naturalHeight } : null;
  }
  function cropOf(clip) {
    var c = clip.crop;
    function cl(v) { return Math.max(0, Math.min(0.9, v == null ? 0 : v)); }
    var left = cl(c && c.left), top = cl(c && c.top);
    var right = Math.min(cl(c && c.right), 0.95 - left);
    var bottom = Math.min(cl(c && c.bottom), 0.95 - top);
    return { left: left, top: top, right: right, bottom: bottom };
  }
  function fontFor(text, size) { return (text.italic ? "italic " : "") + text.fontWeight + " " + size + "px " + text.fontFamily; }
  function textLines(text) { var raw = text.uppercase ? text.text.toUpperCase() : text.text; return raw.split(/\n/); }
  function setLetterSpacing(c, px) { c.letterSpacing = px + "px"; }
  function layoutText(c, text, H) {
    var size = (text.fontSize / 1080) * H;
    var lh = size * (text.lineHeight == null ? 1.2 : text.lineHeight);
    c.save();
    c.font = fontFor(text, size);
    setLetterSpacing(c, ((text.letterSpacing || 0) / 1080) * H);
    var lines = textLines(text);
    var widths = lines.map(function (ln) { return c.measureText(ln).width; });
    c.restore();
    var pad = text.background ? (text.background.padding / 1080) * H : size * 0.2;
    return { size: size, lh: lh, lines: lines, widths: widths, maxW: Math.max.apply(null, widths.concat([1])), pad: pad };
  }
  function clipBox(c, clip, W, H) {
    var tr = getTransform(clip);
    if (clip.kind === "text") {
      var l = layoutText(c, clip, H);
      var w = l.maxW + l.pad * 2;
      var h = l.lines.length * l.lh + l.pad * 2;
      var ax = clip.x * W;
      var cx = clip.align === "centre" ? ax : clip.align === "left" ? ax + l.maxW / 2 : ax - l.maxW / 2;
      return { cx: cx, cy: clip.y * H, w: w, h: h, rotation: tr.rotation };
    }
    if (clip.kind === "shape") {
      return { cx: tr.x * W, cy: tr.y * H, w: Math.max(1, clip.w * W * tr.scale), h: Math.max(1, clip.h * H * tr.scale), rotation: tr.rotation };
    }
    var m = mediaSource(clip);
    if (!m || !m.w || !m.h) return null;
    var cr = cropOf(clip);
    var sw = m.w * (1 - cr.left - cr.right);
    var sh = m.h * (1 - cr.top - cr.bottom);
    var fit = clip.fit === "cover" ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
    return { cx: tr.x * W, cy: tr.y * H, w: sw * fit * tr.scale, h: sh * fit * tr.scale, rotation: tr.rotation };
  }
  function effectsList(clip) {
    var e = (clip.kind === "video" || clip.kind === "image") ? clip.effects : null;
    var out = [];
    if (!e) return out;
    if (e.brightness !== undefined && e.brightness !== 1) out.push(["brightness", e.brightness]);
    if (e.contrast !== undefined && e.contrast !== 1) out.push(["contrast", e.contrast]);
    if (e.saturation !== undefined && e.saturation !== 1) out.push(["saturate", e.saturation]);
    if (e.grayscale !== undefined && e.grayscale > 0) out.push(["grayscale", e.grayscale]);
    if (e.sepia !== undefined && e.sepia > 0) out.push(["sepia", e.sepia]);
    if (e.hueRotate !== undefined && e.hueRotate !== 0) out.push(["hue-rotate", e.hueRotate]);
    if (e.invert !== undefined && e.invert > 0) out.push(["invert", e.invert]);
    return out;
  }
  function cssFilterFor(clip, extraBlur) {
    var parts = effectsList(clip).map(function (f) { return f[0] + "(" + f[1] + (f[0] === "hue-rotate" ? "deg" : "") + ")"; });
    var e = (clip.kind === "video" || clip.kind === "image") ? clip.effects : null;
    var totalBlur = ((e && e.blur) || 0) + extraBlur;
    if (totalBlur > 0) parts.push("blur(" + totalBlur + "px)");
    return parts.length ? parts.join(" ") : "none";
  }
  function hexToRgba(hex, alpha) {
    var h = hex.replace("#", "");
    var full = h.length === 3 ? h.split("").map(function (c) { return c + c; }).join("") : (h + "000000").slice(0, Math.max(6, h.length));
    var n = parseInt(full.slice(0, 6), 16);
    return "rgba(" + ((n >> 16) & 255) + ", " + ((n >> 8) & 255) + ", " + (n & 255) + ", " + alpha + ")";
  }
  function applyShadow(c, clip, H) {
    var s = clip.shadow;
    if (!s || s.opacity <= 0) return;
    var k = H / 1080;
    c.shadowColor = hexToRgba(s.color, s.opacity);
    c.shadowBlur = s.blur * k;
    c.shadowOffsetX = s.offsetX * k;
    c.shadowOffsetY = s.offsetY * k;
  }
  function clearShadow(c) { c.shadowColor = "transparent"; c.shadowBlur = 0; c.shadowOffsetX = 0; c.shadowOffsetY = 0; }
  function roundRectPath(c, x, y, w, h, r) {
    var rr = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  function drawClip(c, W, H, clip, t) {
    if (!isVisualClip(clip) || clip.hidden) return;
    var box = clipBox(c, clip, W, H);
    if (!box) return;
    var tr = getTransform(clip);
    var anim = computeClipAnimation(clip, t);
    var baseAlpha = c.globalAlpha;
    c.save();
    c.translate(W / 2 + anim.dx * W, H / 2 + anim.dy * H);
    if (anim.scale !== 1) c.scale(anim.scale, anim.scale);
    c.translate(-W / 2, -H / 2);
    c.translate(box.cx, box.cy);
    if (tr.rotation) c.rotate((tr.rotation * Math.PI) / 180);
    if (tr.flipH || tr.flipV) c.scale(tr.flipH ? -1 : 1, tr.flipV ? -1 : 1);
    // Text no longer fades in by default (web render.ts): a fade is an explicit animation.
    c.globalAlpha = baseAlpha * anim.alpha * (tr.opacity == null ? 1 : tr.opacity);
    var filter = cssFilterFor(clip, anim.blurPx);
    if (SUPPORTS_FILTER) c.filter = filter;
    if (clip.blend && clip.blend !== "normal") c.globalCompositeOperation = clip.blend;
    if (clip.kind === "text") drawText(c, clip, box, H);
    else if (clip.kind === "shape") drawShape(c, clip, box, H);
    else drawMedia(c, clip, box, H);
    c.restore();
  }

  function drawMedia(c, clip, box, H) {
    var m = mediaSource(clip);
    if (!m) return;
    var cr = cropOf(clip);
    var sx = m.w * cr.left, sy = m.h * cr.top;
    var sw = m.w * (1 - cr.left - cr.right), sh = m.h * (1 - cr.top - cr.bottom);
    var el = m.el;
    if (!SUPPORTS_FILTER && effectsList(clip).length) {
      // Engines without ctx.filter get the same colour maths done by hand.
      el = filteredCrop(clip, m, sx, sy, sw, sh);
      sx = 0; sy = 0; sw = el.width; sh = el.height;
    }
    if (needsGrade(clip.effects)) {
      var graded = grade(el, sx, sy, sw, sh, Math.abs(box.w), Math.abs(box.h), clip.effects);
      if (graded) { el = graded.el; sx = 0; sy = 0; sw = graded.w; sh = graded.h; }
    }
    var x = -box.w / 2, y = -box.h / 2;
    var r = ((clip.radius || 0) / 1080) * H;
    if (r > 0) {
      if (clip.shadow && clip.shadow.opacity > 0) {
        c.save();
        applyShadow(c, clip, H);
        c.fillStyle = "#000";
        roundRectPath(c, x, y, box.w, box.h, r);
        c.fill();
        c.restore();
      }
      c.save();
      roundRectPath(c, x, y, box.w, box.h, r);
      c.clip();
      c.drawImage(el, sx, sy, sw, sh, x, y, box.w, box.h);
      c.restore();
    } else {
      applyShadow(c, clip, H);
      c.drawImage(el, sx, sy, sw, sh, x, y, box.w, box.h);
      clearShadow(c);
    }
  }

  // ── colour grading: warmth, tint, vignette (web render.ts grade) ──
  var scratch = null;
  function needsGrade(e) { return !!e && (!!e.warmth || !!e.tint || !!e.vignette); }
  function grade(el, sx, sy, sw, sh, w, h, e) {
    var k = Math.min(1, 1600 / Math.max(w, h));
    var cw = Math.max(1, Math.round(w * k));
    var ch = Math.max(1, Math.round(h * k));
    if (!scratch) scratch = document.createElement("canvas");
    if (scratch.width !== cw) scratch.width = cw;
    if (scratch.height !== ch) scratch.height = ch;
    var g = scratch.getContext("2d");
    if (!g) return null;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    if (SUPPORTS_FILTER) g.filter = "none";
    g.globalCompositeOperation = "copy";
    g.drawImage(el, sx, sy, sw, sh, 0, 0, cw, ch);
    function fillBlend(colour, alpha, mode) {
      g.globalCompositeOperation = mode;
      g.globalAlpha = alpha;
      g.fillStyle = colour;
      g.fillRect(0, 0, cw, ch);
    }
    var warmth = Math.max(-1, Math.min(1, e.warmth || 0));
    if (warmth) fillBlend(warmth > 0 ? "#ff9a2e" : "#2e7bff", Math.abs(warmth) * 0.35, "soft-light");
    var tint = Math.max(-1, Math.min(1, e.tint || 0));
    if (tint) fillBlend(tint > 0 ? "#ff3ec8" : "#3eff6a", Math.abs(tint) * 0.3, "soft-light");
    var vignette = Math.max(0, Math.min(1, e.vignette || 0));
    if (vignette) {
      var grad = g.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.25, cw / 2, ch / 2, Math.hypot(cw, ch) / 2);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0," + (0.85 * vignette) + ")");
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 1;
      g.fillStyle = grad;
      g.fillRect(0, 0, cw, ch);
    }
    // Put the source's own transparency back, so a cut-out never tints what is under it.
    g.globalCompositeOperation = "destination-in";
    g.globalAlpha = 1;
    g.drawImage(el, sx, sy, sw, sh, 0, 0, cw, ch);
    g.globalCompositeOperation = "source-over";
    return { el: scratch, w: cw, h: ch };
  }

  // ── shapes (web render.ts shapePath / drawShape) ──
  function shapePath(c, shape, w, h, radius, points) {
    var hw = w / 2, hh = h / 2, i, a, x, y;
    c.beginPath();
    switch (shape) {
      case "path": {
        // Midpoint quadratic smoothing through the stroke's samples.
        var p = points || [];
        if (!p.length) return;
        var X = function (n) { return p[n][0] * w; };
        var Y = function (n) { return p[n][1] * h; };
        c.moveTo(X(0), Y(0));
        if (p.length === 1) { c.lineTo(X(0) + 0.01, Y(0)); return; }
        for (i = 1; i < p.length - 1; i++) c.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 1)) / 2, (Y(i) + Y(i + 1)) / 2);
        c.lineTo(X(p.length - 1), Y(p.length - 1));
        return;
      }
      case "rect": roundRectPath(c, -hw, -hh, w, h, radius); return;
      case "ellipse": c.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2); break;
      case "triangle": c.moveTo(0, -hh); c.lineTo(hw, hh); c.lineTo(-hw, hh); break;
      case "hexagon":
        for (i = 0; i < 6; i++) { a = (Math.PI / 3) * i; x = Math.cos(a) * hw; y = Math.sin(a) * hh; if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); }
        break;
      case "star":
        for (i = 0; i < 10; i++) {
          a = -Math.PI / 2 + (Math.PI / 5) * i;
          var r = i % 2 === 0 ? 1 : 0.42;
          x = Math.cos(a) * hw * r; y = Math.sin(a) * hh * r;
          if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        break;
      case "heart":
        c.moveTo(0, hh);
        c.bezierCurveTo(-hw * 1.1, hh * 0.1, -hw * 0.9, -hh * 1.1, 0, -hh * 0.45);
        c.bezierCurveTo(hw * 0.9, -hh * 1.1, hw * 1.1, hh * 0.1, 0, hh);
        break;
      case "line": c.moveTo(-hw, 0); c.lineTo(hw, 0); return;
      case "arrow": {
        var head = Math.min(w * 0.3, Math.max(h * 1.5, 12));
        c.moveTo(-hw, 0); c.lineTo(hw, 0);
        c.moveTo(hw - head, -head * 0.6); c.lineTo(hw, 0); c.lineTo(hw - head, head * 0.6);
        return;
      }
    }
    c.closePath();
  }
  function drawShape(c, clip, box, H) {
    var k = H / 1080;
    var open = clip.shape === "line" || clip.shape === "arrow" || clip.shape === "path";
    shapePath(c, clip.shape, box.w, box.h, (clip.radius || 0) * k, clip.points);
    applyShadow(c, clip, H);
    if (!open && clip.fill) { c.fillStyle = clip.fill; c.fill(); clearShadow(c); }
    var stroke = clip.stroke || (open ? { color: clip.fill || "#ffffff", width: 8 } : null);
    if (stroke && stroke.width > 0) {
      c.lineWidth = stroke.width * k;
      c.strokeStyle = stroke.color;
      c.lineJoin = "round";
      c.lineCap = "round";
      c.stroke();
    }
    clearShadow(c);
  }

  function drawText(c, text, box, H) {
    var l = layoutText(c, text, H);
    c.font = fontFor(text, l.size);
    setLetterSpacing(c, ((text.letterSpacing || 0) / 1080) * H);
    c.textBaseline = "middle";
    c.textAlign = text.align === "centre" ? "center" : text.align;
    var ax = text.align === "centre" ? 0 : text.align === "left" ? -l.maxW / 2 : l.maxW / 2;
    var startY = -((l.lines.length - 1) * l.lh) / 2;
    if (text.background && text.background.opacity > 0) {
      var radius = Math.max(0, (text.background.radius / 1080) * H);
      var a = c.globalAlpha;
      c.globalAlpha = a * text.background.opacity;
      c.fillStyle = text.background.color;
      applyShadow(c, text, H);
      roundRectPath(c, -box.w / 2, -box.h / 2, box.w, box.h, radius);
      c.fill();
      clearShadow(c);
      c.globalAlpha = a;
    } else {
      applyShadow(c, text, H);
    }
    if (text.stroke && text.stroke.width > 0) {
      c.lineWidth = (text.stroke.width / 1080) * H;
      c.strokeStyle = text.stroke.color;
      c.lineJoin = "round";
      l.lines.forEach(function (ln, i) { c.strokeText(ln, ax, startY + i * l.lh); });
      clearShadow(c);
    }
    c.fillStyle = text.color;
    l.lines.forEach(function (ln, i) { c.fillText(ln, ax, startY + i * l.lh); });
    clearShadow(c);
    if (text.underline) {
      var thick = Math.max(1, l.size * 0.06);
      l.lines.forEach(function (_, i) {
        var w = l.widths[i];
        var left = text.align === "centre" ? ax - w / 2 : text.align === "left" ? ax : ax - w;
        c.fillRect(left, startY + i * l.lh + l.size * 0.45, w, thick);
      });
    }
  }

  // ── colour maths for engines without ctx.filter (CSS Filter Effects spec) ──
  var filterCache = new Map();
  function matrixFor(name, v) {
    var a;
    if (name === "saturate") {
      return [0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v, 0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v, 0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v];
    }
    if (name === "grayscale") {
      a = 1 - Math.min(1, v);
      return [0.2126 + 0.7874 * a, 0.7152 - 0.7152 * a, 0.0722 - 0.0722 * a, 0.2126 - 0.2126 * a, 0.7152 + 0.2848 * a, 0.0722 - 0.0722 * a, 0.2126 - 0.2126 * a, 0.7152 - 0.7152 * a, 0.0722 + 0.9278 * a];
    }
    if (name === "sepia") {
      a = 1 - Math.min(1, v);
      return [0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a, 0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a, 0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a];
    }
    if (name === "hue-rotate") {
      var r = (v * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r);
      return [0.213 + cs * 0.787 - sn * 0.213, 0.715 - cs * 0.715 - sn * 0.715, 0.072 - cs * 0.072 + sn * 0.928,
              0.213 - cs * 0.213 + sn * 0.143, 0.715 + cs * 0.285 + sn * 0.140, 0.072 - cs * 0.072 - sn * 0.283,
              0.213 - cs * 0.213 - sn * 0.787, 0.715 - cs * 0.715 + sn * 0.715, 0.072 + cs * 0.928 + sn * 0.072];
    }
    return null;
  }
  function filteredCrop(clip, m, sx, sy, sw, sh) {
    var list = effectsList(clip);
    var key = clip.mediaId + "|" + [sx, sy, sw, sh].join(",") + "|" + JSON.stringify(list);
    var hit = filterCache.get(key);
    if (hit) return hit;
    var k = Math.min(1, 1600 / Math.max(sw, sh));
    var tmp = document.createElement("canvas");
    tmp.width = Math.max(1, Math.round(sw * k));
    tmp.height = Math.max(1, Math.round(sh * k));
    var tc = tmp.getContext("2d");
    tc.drawImage(m.el, sx, sy, sw, sh, 0, 0, tmp.width, tmp.height);
    var data = tc.getImageData(0, 0, tmp.width, tmp.height);
    var px = data.data;
    for (var i = 0; i < px.length; i += 4) {
      var R = px[i] / 255, G = px[i + 1] / 255, B = px[i + 2] / 255;
      for (var j = 0; j < list.length; j++) {
        var name = list[j][0], v = list[j][1];
        if (name === "brightness") { R *= v; G *= v; B *= v; }
        else if (name === "contrast") { var o = 0.5 - 0.5 * v; R = R * v + o; G = G * v + o; B = B * v + o; }
        else if (name === "invert") { R = v + R * (1 - 2 * v); G = v + G * (1 - 2 * v); B = v + B * (1 - 2 * v); }
        else {
          var mx = matrixFor(name, v);
          var r2 = mx[0] * R + mx[1] * G + mx[2] * B;
          var g2 = mx[3] * R + mx[4] * G + mx[5] * B;
          var b2 = mx[6] * R + mx[7] * G + mx[8] * B;
          R = r2; G = g2; B = b2;
        }
        R = R < 0 ? 0 : R > 1 ? 1 : R; G = G < 0 ? 0 : G > 1 ? 1 : G; B = B < 0 ? 0 : B > 1 ? 1 : B;
      }
      px[i] = R * 255; px[i + 1] = G * 255; px[i + 2] = B * 255;
    }
    tc.putImageData(data, 0, 0);
    if (filterCache.size > 24) filterCache.clear();
    filterCache.set(key, tmp);
    return tmp;
  }

  // ── fonts: stylesheets chosen app-side (libs/editor/fonts.ts), as the web picks them ──
  var fontLinks = new Set();
  function addFontCss(hrefs) {
    (hrefs || []).forEach(function (href) {
      if (fontLinks.has(href)) return;
      fontLinks.add(href);
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    });
  }
  var requestedFaces = new Set();
  function ensureFonts(snapshot) {
    if (!document.fonts || !document.fonts.load) return;
    snapshot.clips.forEach(function (c) {
      if (c.kind !== "text") return;
      var face = (c.italic ? "italic " : "") + c.fontWeight + " 48px " + c.fontFamily;
      if (requestedFaces.has(face)) return;
      requestedFaces.add(face);
      // Redraw once the face arrives; text measured with a fallback font is the wrong size.
      document.fonts.load(face).then(schedule, function () {});
    });
  }

  // ── video and audio (web Compositor.tsx and exporter.ts) ──
  // Videos and sounds arrive in chunks (mediaBegin / mediaChunk / mediaEnd)
  // and play from blob URLs: same-origin, so the canvas stays exportable.
  var videos = new Map();
  var audios = new Map();
  var blobs = new Map();
  var incoming = new Map();
  var holder = document.createElement("div");
  holder.style.cssText = "position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none;";
  document.body.appendChild(holder);

  function b64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function finishMedia(id) {
    var inc = incoming.get(id);
    if (!inc) return;
    incoming.delete(id);
    var blob = new Blob(inc.parts, { type: inc.mime });
    blobs.set(id, blob);
    var url = URL.createObjectURL(blob);
    if (inc.kind === "video") {
      var v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.setAttribute("playsinline", "");
      v.setAttribute("webkit-playsinline", "");
      v.preload = "auto";
      v.onloadeddata = function () {
        post({ type: "mediaReady", id: id, duration: v.duration, width: v.videoWidth, height: v.videoHeight });
        schedule();
      };
      v.onseeked = function () { if (!playing) schedule(); };
      v.onerror = function () { post({ type: "mediaFailed", id: id }); };
      v.src = url;
      holder.appendChild(v);
      videos.set(id, v);
    } else {
      var a = new Audio();
      a.preload = "auto";
      a.onloadedmetadata = function () { post({ type: "mediaReady", id: id, duration: a.duration }); };
      a.onerror = function () { post({ type: "mediaFailed", id: id }); };
      a.src = url;
      audios.set(id, a);
    }
  }

  function timelineEnd(clips) {
    return clips.reduce(function (m, c) { return Math.max(m, c.start + c.duration); }, 0);
  }
  function speedOf(c) { return c.speed && c.speed > 0 ? c.speed : 1; }
  function trackOf(snap, id) {
    for (var i = 0; i < snap.tracks.length; i++) if (snap.tracks[i].id === id) return snap.tracks[i];
    return null;
  }

  // ── transitions.ts ──
  function findAdjacentPrev(clip, all) {
    for (var i = 0; i < all.length; i++) {
      var c = all[i];
      if (c.id === clip.id || c.trackId !== clip.trackId) continue;
      if (Math.abs(c.start + c.duration - clip.start) < 0.001) return c;
    }
    return null;
  }
  function outgoingOps(tr, p, W) {
    p = Math.max(0, Math.min(1, p));
    switch (tr.kind) {
      case "fade": return { alpha: 1 - p, translateX: 0 };
      case "slide-left": return { alpha: 1, translateX: -p * W };
      case "slide-right": return { alpha: 1, translateX: p * W };
      case "wipe-left": return { alpha: 1, translateX: 0, clipRect: { x: 0, w: W * (1 - p) } };
      case "wipe-right": return { alpha: 1, translateX: 0, clipRect: { x: W * p, w: W * (1 - p) } };
    }
    return { alpha: 1, translateX: 0 };
  }
  function incomingOps(tr, p, W) {
    p = Math.max(0, Math.min(1, p));
    switch (tr.kind) {
      case "fade": return { alpha: p, translateX: 0 };
      case "slide-left": return { alpha: 1, translateX: (1 - p) * W };
      case "slide-right": return { alpha: 1, translateX: -(1 - p) * W };
      case "wipe-left": return { alpha: 1, translateX: 0, clipRect: { x: W * (1 - p), w: W * p } };
      case "wipe-right": return { alpha: 1, translateX: 0, clipRect: { x: 0, w: W * p } };
    }
    return { alpha: 1, translateX: 0 };
  }
  // A still design is looked at on a frame, so its last frame still counts
  // (end inclusive); a video's clips hand over at their ends (end exclusive).
  function computeRenderOps(snap, t, W, endInclusive) {
    var ops = [];
    var visual = snap.clips.filter(function (c) {
      var tr = trackOf(snap, c.trackId);
      return !!tr && !tr.hidden && tr.kind !== "audio" && isVisualClip(c) && !c.hidden;
    });
    visual.forEach(function (C) {
      var end = C.start + C.duration;
      var active = t >= C.start && (t < end || (endInclusive && t === end));
      var tr = C.transitionOut;
      var d = tr ? tr.duration || 0 : 0;
      var outStart = end - d;
      if (active && tr && d > 0 && t >= outStart && t < end) {
        ops.push(assign({ clip: C }, outgoingOps(tr, (t - outStart) / d, W)));
      } else if (active) {
        ops.push({ clip: C, alpha: 1, translateX: 0 });
      }
      var prev = findAdjacentPrev(C, visual);
      if (prev && prev.transitionOut && prev.transitionOut.duration > 0) {
        var dd = prev.transitionOut.duration;
        var winStart = C.start - dd;
        if (t >= winStart && t < C.start) {
          var op = assign({ clip: C }, incomingOps(prev.transitionOut, (t - winStart) / dd, W));
          if (C.kind === "video") op.localTimeOverride = (t - winStart) + C.trimIn;
          ops.push(op);
        }
      }
    });
    var z = new Map(snap.tracks.map(function (tr, i) { return [tr.id, i]; }));
    return ops.sort(function (a, b) { return z.get(a.clip.trackId) - z.get(b.clip.trackId); });
  }
  function localTimeOf(op, t) {
    var c = op.clip;
    return op.localTimeOverride !== undefined ? op.localTimeOverride : c.trimIn + (t - c.start) * speedOf(c);
  }
  function drawOps(c, W, H, ops, t) {
    ops.forEach(function (op) {
      c.save();
      if (op.translateX) c.translate(op.translateX, 0);
      if (op.clipRect) { c.beginPath(); c.rect(op.clipRect.x, 0, op.clipRect.w, H); c.clip(); }
      c.globalAlpha = op.alpha;
      drawClip(c, W, H, op.clip, t);
      c.restore();
    });
  }

  // Keep every video and sound at the right spot for time t (web Compositor).
  // silent: the sound comes from elsewhere (the realtime export's mix).
  function syncMedia(snap, t, isPlaying, ops, silent) {
    var liveV = new Set();
    var liveA = new Set();
    ops.forEach(function (op) {
      if (op.clip.kind !== "video") return;
      var v = videos.get(op.clip.mediaId);
      if (!v) return;
      liveV.add(op.clip.mediaId);
      var localT = localTimeOf(op, t);
      var tr = trackOf(snap, op.clip.trackId);
      var vol = op.clip.audio && op.clip.audio.volume != null ? op.clip.audio.volume : 1;
      v.muted = silent || !isPlaying || (tr && tr.muted) || vol <= 0;
      try { v.volume = Math.max(0, Math.min(1, vol)); } catch (e) {}
      if (isPlaying) {
        var sp = speedOf(op.clip);
        if (v.playbackRate !== sp) v.playbackRate = sp;
        if (Math.abs(v.currentTime - localT) > 0.25) v.currentTime = localT;
        if (v.paused) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
      } else {
        if (!v.paused) v.pause();
        if (Math.abs(v.currentTime - localT) > 0.03) v.currentTime = localT;
      }
    });
    snap.clips.forEach(function (c) {
      if (c.kind !== "audio" || !(t >= c.start && t < c.start + c.duration)) return;
      var a = audios.get(c.mediaId);
      if (!a) return;
      liveA.add(c.mediaId);
      var tr = trackOf(snap, c.trackId);
      a.muted = silent || (tr && (tr.muted || tr.hidden));
      try { a.volume = Math.max(0, Math.min(1, c.audio && c.audio.volume != null ? c.audio.volume : 1)); } catch (e) {}
      var localT = c.trimIn + (t - c.start) * speedOf(c);
      if (isPlaying) {
        if (a.playbackRate !== speedOf(c)) a.playbackRate = speedOf(c);
        if (Math.abs(a.currentTime - localT) > 0.25) a.currentTime = localT;
        if (a.paused) { var pr = a.play(); if (pr && pr.catch) pr.catch(function () {}); }
      } else {
        if (!a.paused) a.pause();
      }
    });
    videos.forEach(function (v, id) { if (!liveV.has(id) && !v.paused) v.pause(); });
    audios.forEach(function (a, id) { if (!liveA.has(id) && !a.paused) a.pause(); });
  }
  function pauseAll() {
    videos.forEach(function (v) { if (!v.paused) v.pause(); });
    audios.forEach(function (a) { if (!a.paused) a.pause(); });
  }

  // ── playback clock ──
  var playing = false;
  var playStart = null;
  var lastTimePost = 0;
  var lastLayersPost = 0;
  var exporting = false;
  var exportAborted = false;
  function currentTime() {
    if (playing && playStart) return playStart.time + (performance.now() - playStart.wall) / 1000;
    return state ? state.time : 0;
  }
  function stopPlaying() {
    if (!playing) return;
    var t = currentTime();
    playing = false;
    playStart = null;
    if (state) state.time = t;
    pauseAll();
  }

  // ── export: exporter.ts ──
  function seekVideo(v, t) {
    return new Promise(function (resolve) {
      var target = Math.max(0, Math.min(isFinite(v.duration) ? v.duration - 0.001 : t, t));
      if (Math.abs(v.currentTime - target) < 0.0005 && v.readyState >= 2) { resolve(); return; }
      var done = false;
      var finish = function () { if (done) return; done = true; v.removeEventListener("seeked", finish); resolve(); };
      v.addEventListener("seeked", finish);
      setTimeout(finish, 3000);
      try { v.currentTime = target; } catch (e) { finish(); }
    });
  }
  function decodeAudio(buf) {
    return new Promise(function (resolve) {
      try {
        var ctx0 = new OfflineAudioContext(2, 1, 48000);
        var p = ctx0.decodeAudioData(buf, resolve, function () { resolve(null); });
        if (p && p.catch) p.catch(function () { resolve(null); });
      } catch (e) { resolve(null); }
    });
  }
  function mixAudio(snap, duration) {
    var clips = snap.clips.filter(function (c) {
      if (c.kind !== "audio" && c.kind !== "video") return false;
      var tr = trackOf(snap, c.trackId);
      return blobs.has(c.mediaId) && !(tr && (tr.muted || tr.hidden)) && !(c.kind === "video" && c.hidden);
    });
    if (!clips.length || duration <= 0) return Promise.resolve(null);
    var ids = [];
    clips.forEach(function (c) { if (ids.indexOf(c.mediaId) < 0) ids.push(c.mediaId); });
    var buffers = new Map();
    return Promise.all(ids.map(function (id) {
      return blobs.get(id).arrayBuffer().then(decodeAudio).then(function (b) { if (b) buffers.set(id, b); });
    })).then(function () {
      var rate = 48000;
      var octx = new OfflineAudioContext(2, Math.ceil(duration * rate), rate);
      var any = false;
      clips.forEach(function (c) {
        var buf = buffers.get(c.mediaId);
        if (!buf) return;
        var sp = speedOf(c);
        var src = octx.createBufferSource();
        src.buffer = buf;
        if (sp !== 1) src.playbackRate.value = sp;
        var gain = octx.createGain();
        var vol = c.audio && c.audio.volume != null ? c.audio.volume : 1;
        var fIn = Math.max(0, Math.min(c.duration, (c.audio && c.audio.fadeIn) || 0));
        var fOut = Math.max(0, Math.min(c.duration - fIn, (c.audio && c.audio.fadeOut) || 0));
        var when = c.start;
        var consumed = Math.min(c.duration * sp, Math.max(0, buf.duration - c.trimIn));
        var dur = consumed / sp;
        if (dur <= 0) return;
        gain.gain.setValueAtTime(fIn > 0 ? 0 : vol, when);
        if (fIn > 0) gain.gain.linearRampToValueAtTime(vol, when + fIn);
        if (fOut > 0) {
          gain.gain.setValueAtTime(vol, when + Math.max(fIn, dur - fOut));
          gain.gain.linearRampToValueAtTime(0, when + dur);
        }
        src.connect(gain);
        gain.connect(octx.destination);
        src.start(when, c.trimIn, consumed);
        any = true;
      });
      return any ? octx.startRendering() : null;
    });
  }
  function pickAvcLevel(w, h, fps) {
    var mbs = Math.ceil(w / 16) * Math.ceil(h / 16);
    var perSec = mbs * Math.max(1, fps);
    var levels = [["1F", 3600, 108000], ["20", 5120, 216000], ["28", 8192, 245760], ["29", 8192, 522240], ["2A", 8704, 522240], ["32", 22080, 589824], ["33", 36864, 983040], ["34", 36864, 2073600]];
    for (var i = 0; i < levels.length; i++) if (mbs <= levels[i][1] && perSec <= levels[i][2]) return levels[i][0];
    return "34";
  }
  function pickVideoConfig(w, h, fps, bitrate) {
    var lvl = pickAvcLevel(w, h, fps);
    var candidates = ["avc1.42E0" + lvl, "avc1.4D40" + lvl, "avc1.6400" + lvl];
    var i = 0;
    function next() {
      if (i >= candidates.length) return Promise.resolve(null);
      var cfg = { codec: candidates[i++], width: w, height: h, bitrate: bitrate, framerate: fps, avc: { format: "avc" } };
      return VideoEncoder.isConfigSupported(cfg).then(function (r) { return r && r.supported ? cfg : next(); }, next);
    }
    return next();
  }
  function audioSupported() {
    if (typeof AudioEncoder !== "function") return Promise.resolve(false);
    return AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2, bitrate: 160000 })
      .then(function (r) { return !!(r && r.supported); }, function () { return false; });
  }
  var MUXER_URL = "https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/+esm";

  function encodeWithCodecs(snap, W, H, fps, bitrate, duration, mixed, vcfg, progress) {
    return import(MUXER_URL).then(function (M) {
      var target = new M.ArrayBufferTarget();
      var opts = { target: target, video: { codec: "avc", width: W, height: H, frameRate: fps }, fastStart: "in-memory", firstTimestampBehavior: "offset" };
      if (mixed) opts.audio = { codec: "aac", numberOfChannels: 2, sampleRate: mixed.sampleRate };
      var muxer = new M.Muxer(opts);
      var failure = null;
      var venc = new VideoEncoder({
        output: function (chunk, meta) { muxer.addVideoChunk(chunk, meta); },
        error: function (e) { failure = e; },
      });
      venc.configure(vcfg);
      var cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      var g = cv.getContext("2d");
      var total = Math.max(1, Math.ceil(duration * fps));
      var f = 0;
      function step() {
        if (failure) return Promise.reject(failure);
        if (exportAborted) return Promise.reject(new Error("aborted"));
        if (f >= total) return Promise.resolve();
        var t = f / fps;
        var ops = computeRenderOps(snap, t, W, false);
        var seeks = ops.filter(function (op) { return op.clip.kind === "video" && videos.has(op.clip.mediaId); })
          .map(function (op) { return seekVideo(videos.get(op.clip.mediaId), localTimeOf(op, t)); });
        return Promise.all(seeks).then(function () {
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.globalAlpha = 1;
          g.fillStyle = snap.settings.background;
          g.fillRect(0, 0, W, H);
          drawOps(g, W, H, ops, t);
          var frame = new VideoFrame(cv, { timestamp: Math.round(t * 1e6), duration: Math.round(1e6 / fps) });
          venc.encode(frame, { keyFrame: f % Math.max(1, Math.round(fps * 2)) === 0 });
          frame.close();
          f++;
          if (f % 3 === 0) progress(0.05 + (f / total) * (mixed ? 0.8 : 0.9));
          if (venc.encodeQueueSize > 6) return new Promise(function (r) { setTimeout(r, 10); }).then(step);
          return step();
        });
      }
      return step().then(function () { return venc.flush(); }).then(function () {
        venc.close();
        if (!mixed) return;
        progress(0.9);
        var aenc = new AudioEncoder({
          output: function (chunk, meta) { muxer.addAudioChunk(chunk, meta); },
          error: function (e) { failure = e; },
        });
        aenc.configure({ codec: "mp4a.40.2", sampleRate: mixed.sampleRate, numberOfChannels: 2, bitrate: 160000 });
        var L = mixed.getChannelData(0);
        var R = mixed.getChannelData(Math.min(1, mixed.numberOfChannels - 1));
        var CH = 1024;
        for (var i = 0; i < mixed.length; i += CH) {
          var n = Math.min(CH, mixed.length - i);
          var data = new Float32Array(n * 2);
          for (var j = 0; j < n; j++) { data[j * 2] = L[i + j]; data[j * 2 + 1] = R[i + j]; }
          var ad = new AudioData({ format: "f32", sampleRate: mixed.sampleRate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / mixed.sampleRate) * 1e6), data: data });
          aenc.encode(ad);
          ad.close();
        }
        return aenc.flush().then(function () { aenc.close(); });
      }).then(function () {
        if (failure) throw failure;
        muxer.finalize();
        return { blob: new Blob([target.buffer], { type: "video/mp4" }), ext: "mp4" };
      });
    });
  }

  // Phones without WebCodecs audio (iOS before 26): play the timeline in real
  // time into a MediaRecorder, with the same audio mix.
  function recordRealtime(snap, W, H, fps, bitrate, duration, mixed, progress) {
    return new Promise(function (resolve, reject) {
      if (typeof MediaRecorder !== "function") { reject(new Error("unsupported")); return; }
      var types = ["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp8,opus", "video/webm"];
      var mime = null;
      for (var i = 0; i < types.length; i++) if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(types[i])) { mime = types[i]; break; }
      if (!mime) { reject(new Error("unsupported")); return; }
      var cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      var g = cv.getContext("2d");
      var stream = cv.captureStream(fps);
      var ac = null, src = null;
      if (mixed) {
        ac = new AudioContext({ sampleRate: mixed.sampleRate });
        var dest = ac.createMediaStreamDestination();
        src = ac.createBufferSource();
        src.buffer = mixed;
        src.connect(dest);
        dest.stream.getAudioTracks().forEach(function (tr) { stream.addTrack(tr); });
      }
      var parts = [];
      var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
      rec.ondataavailable = function (e) { if (e.data && e.data.size) parts.push(e.data); };
      rec.onerror = function (e) { reject(e.error || new Error("recorder")); };
      rec.onstop = function () {
        pauseAll();
        if (ac) ac.close();
        var type = mime.split(";")[0];
        resolve({ blob: new Blob(parts, { type: type }), ext: type === "video/mp4" ? "mp4" : "webm" });
      };
      var begin = function () {
        rec.start(1000);
        if (src) src.start();
        var wall0 = performance.now();
        var tick = function () {
          var t = (performance.now() - wall0) / 1000;
          if (t >= duration || exportAborted) { rec.stop(); return; }
          var ops = computeRenderOps(snap, t, W, false);
          syncMedia(snap, t, true, ops, true);
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.globalAlpha = 1;
          g.fillStyle = snap.settings.background;
          g.fillRect(0, 0, W, H);
          drawOps(g, W, H, ops, t);
          progress(0.05 + (t / duration) * 0.9);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      };
      // Start with every video parked on its first frame.
      var ops0 = computeRenderOps(snap, 0, W, false);
      Promise.all(ops0.filter(function (op) { return op.clip.kind === "video" && videos.has(op.clip.mediaId); })
        .map(function (op) { return seekVideo(videos.get(op.clip.mediaId), localTimeOf(op, 0)); }))
        .then(function () { return ac ? ac.resume() : null; })
        .then(begin, begin);
    });
  }

  // The finished file goes back in chunks; the app acks each one.
  var outgoing = new Map();
  function sendNextChunk(reqId) {
    var o = outgoing.get(reqId);
    if (!o) return;
    var size = 768 * 1024;
    var end = Math.min(o.blob.size, o.offset + size);
    var reader = new FileReader();
    reader.onload = function () {
      var s = String(reader.result);
      var last = end >= o.blob.size;
      post({ type: "videoChunk", reqId: reqId, b64: s.slice(s.indexOf(",") + 1), last: last, ext: o.ext, done: end, total: o.blob.size });
      o.offset = end;
      if (last) outgoing.delete(reqId);
    };
    reader.onerror = function () { outgoing.delete(reqId); post({ type: "videoFailed", reqId: reqId, error: "read" }); };
    reader.readAsDataURL(o.blob.slice(o.offset, end));
  }

  function exportVideo(m) {
    if (!state || exporting) { post({ type: "videoFailed", reqId: m.reqId, error: "busy" }); return; }
    stopPlaying();
    exporting = true;
    exportAborted = false;
    var snap = state.snapshot;
    var fps = snap.settings.fps || 30;
    var W = Math.max(2, Math.round(m.width) & ~1);
    var H = Math.max(2, Math.round(m.height) & ~1);
    var duration = timelineEnd(snap.clips);
    var lastP = -1;
    var progress = function (p) {
      var r = Math.round(p * 100);
      if (r !== lastP) { lastP = r; post({ type: "videoProgress", reqId: m.reqId, progress: p }); }
    };
    progress(0);
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    Promise.race([ready, new Promise(function (r) { setTimeout(r, 3000); })])
      .then(function () { return mixAudio(snap, duration); })
      .then(function (mixed) {
        progress(0.04);
        var canCodecs = typeof VideoEncoder === "function" && typeof VideoFrame === "function";
        return (canCodecs ? pickVideoConfig(W, H, fps, m.bitrate) : Promise.resolve(null)).then(function (vcfg) {
          return (mixed ? audioSupported() : Promise.resolve(true)).then(function (audioOk) {
            if (vcfg && audioOk) return encodeWithCodecs(snap, W, H, fps, m.bitrate, duration, mixed, vcfg, progress);
            return recordRealtime(snap, W, H, fps, m.bitrate, duration, mixed, progress);
          });
        });
      })
      .then(function (out) {
        exporting = false;
        schedule();
        outgoing.set(m.reqId, { blob: out.blob, ext: out.ext, offset: 0 });
        sendNextChunk(m.reqId);
      })
      .catch(function (e) {
        exporting = false;
        schedule();
        post({ type: "videoFailed", reqId: m.reqId, error: String((e && e.message) || e) });
      });
  }

  // ── frame loop ──
  function render() {
    if (!state || exporting) return;
    var snap = state.snapshot;
    var W = snap.settings.width, H = snap.settings.height;
    var t = currentTime();
    var end = timelineEnd(snap.clips);
    var now = performance.now();
    if (playing && t >= end) {
      t = end;
      stopPlaying();
      state.time = t;
      post({ type: "ended", time: t });
    }
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = snap.settings.background;
    ctx.fillRect(0, 0, W, H);
    var ops = computeRenderOps(snap, t, W, !playing);
    syncMedia(snap, t, playing, ops, false);
    drawOps(ctx, W, H, ops, t);
    if (playing && now - lastTimePost > 100) { lastTimePost = now; post({ type: "time", time: t }); }
    // Boxes for hit testing; a few times a second is plenty while playing.
    if (!playing || now - lastLayersPost > 150) {
      lastLayersPost = now;
      var layers = [];
      var missing = [];
      ops.forEach(function (op) {
        var box = clipBox(ctx, op.clip, W, H);
        if (box) layers.push({ id: op.clip.id, cx: box.cx + (op.translateX || 0), cy: box.cy, w: box.w, h: box.h, rotation: box.rotation });
        else if (op.clip.mediaId && !images.has(op.clip.mediaId) && !videos.has(op.clip.mediaId)) missing.push(op.clip.mediaId);
      });
      var frame = JSON.stringify({ type: "frame", layers: layers, missing: missing });
      if (frame !== lastFrame) { lastFrame = frame; post(JSON.parse(frame)); }
    }
    if (playing) requestAnimationFrame(render);
  }
  function schedule() {
    // While playing, the frame loop is already running.
    if (queued || playing) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; render(); });
  }

  // ── background removal ──
  // Same model and library as the web's lite mode (dehubweb
  // public/editor/bg-remove-worker.js): MODNet, 6.6 MB uint8, on WASM, via
  // transformers.js from a pinned jsdelivr URL. On the phone, nothing is
  // uploaded and nothing is billed. It runs in a worker so the canvas keeps
  // drawing, and the model is downloaded once and then comes from the
  // WebView's cache.
  function cutoutWorkerMain() {
    var LIB_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js";
    var pipePromise = null;
    self.onmessage = function (event) {
      var d = event.data || {};
      var id = d.id;
      var files = {};
      import(LIB_URL).then(function (T) {
        T.env.allowLocalModels = false;
        if (!pipePromise) {
          pipePromise = T.pipeline("background-removal", "Xenova/modnet", {
            device: "wasm",
            dtype: "uint8",
            progress_callback: function (p) {
              if (!p || p.status !== "progress" || !p.file || !p.total) return;
              files[p.file] = { loaded: p.loaded || 0, total: p.total };
              var loaded = 0, total = 0;
              Object.keys(files).forEach(function (k) { loaded += files[k].loaded; total += files[k].total; });
              self.postMessage({ id: id, type: "progress", loaded: loaded, total: total });
            }
          });
          pipePromise.catch(function () { pipePromise = null; });
        }
        return Promise.all([T.RawImage.fromBlob(d.blob), pipePromise]);
      }).then(function (r) {
        self.postMessage({ id: id, type: "running" });
        return r[1](r[0]);
      }).then(function (out) {
        var result = Array.isArray(out) ? out[0] : out;
        return result.toBlob("image/png");
      }).then(function (png) {
        self.postMessage({ id: id, type: "done", blob: png });
      }).catch(function (e) {
        self.postMessage({ id: id, type: "error", message: String((e && e.message) || e) });
      });
    };
  }
  var cutoutWorker = null;
  function getCutoutWorker() {
    if (cutoutWorker) return cutoutWorker;
    var src = "(" + cutoutWorkerMain.toString() + ")();";
    var url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    cutoutWorker = new Worker(url, { type: "module" });
    cutoutWorker.onmessage = function (ev) {
      var d = ev.data || {};
      if (d.type === "progress") post({ type: "cutoutProgress", reqId: d.id, loaded: d.loaded, total: d.total });
      else if (d.type === "running") post({ type: "cutoutProgress", reqId: d.id, loaded: 1, total: 1 });
      else if (d.type === "error") post({ type: "cutoutFailed", reqId: d.id, error: d.message });
      else if (d.type === "done") {
        var img = new Image();
        var blobUrl = URL.createObjectURL(d.blob);
        img.onload = function () {
          var reader = new FileReader();
          reader.onload = function () {
            post({ type: "cutout", reqId: d.id, dataUrl: reader.result, width: img.naturalWidth, height: img.naturalHeight });
            URL.revokeObjectURL(blobUrl);
          };
          reader.onerror = function () { post({ type: "cutoutFailed", reqId: d.id, error: "read" }); };
          reader.readAsDataURL(d.blob);
        };
        img.onerror = function () { post({ type: "cutoutFailed", reqId: d.id, error: "decode" }); };
        img.src = blobUrl;
      }
    };
    cutoutWorker.onerror = function (e) {
      // A worker that failed to start is useless; the next request makes a new one.
      cutoutWorker = null;
      post({ type: "cutoutFailed", reqId: null, error: String((e && e.message) || "worker") });
    };
    return cutoutWorker;
  }
  function cutout(m) {
    var src = images.get(m.mediaId);
    if (!src) { post({ type: "cutoutFailed", reqId: m.reqId, error: "missing" }); return; }
    var c = document.createElement("canvas");
    c.width = src.naturalWidth || src.width;
    c.height = src.naturalHeight || src.height;
    c.getContext("2d").drawImage(src, 0, 0);
    c.toBlob(function (blob) {
      if (!blob) { post({ type: "cutoutFailed", reqId: m.reqId, error: "encode" }); return; }
      try { getCutoutWorker().postMessage({ id: m.reqId, blob: blob }); }
      catch (e) { post({ type: "cutoutFailed", reqId: m.reqId, error: String((e && e.message) || e) }); }
    }, "image/png");
  }

  var lastEvent = null;
  function onMessage(ev) {
    // Android dispatches on document, which bubbles to window: handle it once.
    if (ev === lastEvent) return;
    lastEvent = ev;
    var m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (!m || !m.type) return;
    if (m.type === "render") {
      // While playing, the page's clock owns the time.
      if (playing && state) m.time = state.time;
      state = m;
      addFontCss(m.fontCss);
      ensureFonts(m.snapshot);
      schedule();
    } else if (m.type === "seek") {
      if (state && !playing) { state.time = m.time; schedule(); }
    } else if (m.type === "play") {
      if (!state || exporting) return;
      var wasPlaying = playing;
      playing = true;
      playStart = { wall: performance.now(), time: m.time };
      state.time = m.time;
      if (!wasPlaying) requestAnimationFrame(render);
    } else if (m.type === "pause") {
      var at = currentTime();
      stopPlaying();
      post({ type: "time", time: at });
      schedule();
    } else if (m.type === "mediaBegin") {
      incoming.set(m.id, { parts: [], mime: m.mime, kind: m.kind });
      post({ type: "mediaAck", id: m.id });
    } else if (m.type === "mediaChunk") {
      var inc = incoming.get(m.id);
      if (!inc) return;
      inc.parts.push(b64ToBytes(m.b64));
      post({ type: "mediaAck", id: m.id });
    } else if (m.type === "mediaEnd") {
      finishMedia(m.id);
    } else if (m.type === "exportVideo") {
      exportVideo(m);
    } else if (m.type === "exportAbort") {
      exportAborted = true;
      exporting = false;
      outgoing.clear();
      schedule();
    } else if (m.type === "videoAck") {
      sendNextChunk(m.reqId);
    } else if (m.type === "media") {
      var img = new Image();
      img.onload = function () { images.set(m.id, img); filterCache.clear(); schedule(); };
      img.onerror = function () { post({ type: "mediaFailed", id: m.id }); };
      img.src = m.src;
    } else if (m.type === "stats") {
      // Picture statistics for Auto enhance, from a 64x64 sample (web autoEnhance.ts).
      var src = images.get(m.mediaId);
      var none = { type: "stats", reqId: m.reqId, mean: null, std: null, sat: null };
      if (!src) { post(none); return; }
      var S = 64;
      var sc = document.createElement("canvas");
      sc.width = S; sc.height = S;
      var sg = sc.getContext("2d");
      sg.drawImage(src, 0, 0, S, S);
      var px = sg.getImageData(0, 0, S, S).data;
      var sum = 0, sumSq = 0, sat = 0, n = 0;
      for (var q = 0; q < px.length; q += 4) {
        if (px[q + 3] < 16) continue; // skip transparent cut-out areas
        var R = px[q] / 255, G = px[q + 1] / 255, B = px[q + 2] / 255;
        var L = 0.2126 * R + 0.7152 * G + 0.0722 * B;
        var mx = Math.max(R, G, B), mn = Math.min(R, G, B);
        sum += L; sumSq += L * L; sat += mx === 0 ? 0 : (mx - mn) / mx; n++;
      }
      if (!n) { post(none); return; }
      var mean = sum / n;
      post({ type: "stats", reqId: m.reqId, mean: mean, std: Math.sqrt(Math.max(0, sumSq / n - mean * mean)), sat: sat / n });
    } else if (m.type === "cutout") {
      cutout(m);
    } else if (m.type === "export") {
      var done = function () {
        try {
          render();
          var url = canvas.toDataURL(m.format === "png" ? "image/png" : "image/jpeg", m.quality || 0.92);
          post({ type: "exported", reqId: m.reqId, dataUrl: url });
        } catch (e) {
          post({ type: "exportFailed", reqId: m.reqId, error: String((e && e.message) || e) });
        }
      };
      // Wait for web fonts, but never forever: offline, the fallback font still exports.
      var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
      Promise.race([ready, new Promise(function (r) { setTimeout(r, 3000); })]).then(done, done);
    }
  }
  document.addEventListener("message", onMessage);
  window.addEventListener("message", onMessage);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule, function () {});
  post({ type: "ready" });
})();
</script>
</body></html>`;
