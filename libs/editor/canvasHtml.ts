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
 * Messages in (JSON):  render {snapshot, time, fontCss} · media {id, src} · export {reqId, format, quality}
 *                      stats {reqId, mediaId}
 * Messages out (JSON): ready · frame {layers, missing} · exported {reqId, dataUrl} · exportFailed {reqId, error}
 *                      stats {reqId, mean, std, sat} (Auto enhance; null fields when the picture is missing)
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
    if (clip.kind !== "image") return null; // video arrives with the video editor
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

  // ── frame loop ──
  function render() {
    if (!state) return;
    var snap = state.snapshot;
    var W = snap.settings.width, H = snap.settings.height, t = state.time;
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    ctx.fillStyle = snap.settings.background;
    ctx.fillRect(0, 0, W, H);
    var hidden = new Set(snap.tracks.filter(function (tr) { return tr.hidden; }).map(function (tr) { return tr.id; }));
    var order = new Map(snap.tracks.map(function (tr, i) { return [tr.id, i]; }));
    var z = function (id) { return order.has(id) ? order.get(id) : -1; };
    var visible = snap.clips.filter(function (c) {
      return isVisualClip(c) && !c.hidden && !hidden.has(c.trackId) && t >= c.start && t <= c.start + c.duration;
    }).sort(function (a, b) { return z(a.trackId) - z(b.trackId); });
    var layers = [];
    var missing = [];
    visible.forEach(function (clip) {
      ctx.save();
      ctx.globalAlpha = 1;
      drawClip(ctx, W, H, clip, t);
      ctx.restore();
      var box = clipBox(ctx, clip, W, H);
      if (box) layers.push({ id: clip.id, cx: box.cx, cy: box.cy, w: box.w, h: box.h, rotation: box.rotation });
      else if (clip.mediaId && !images.has(clip.mediaId)) missing.push(clip.mediaId);
    });
    var frame = JSON.stringify({ type: "frame", layers: layers, missing: missing });
    if (frame !== lastFrame) { lastFrame = frame; post(JSON.parse(frame)); }
  }
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; render(); });
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
      state = m;
      addFontCss(m.fontCss);
      ensureFonts(m.snapshot);
      schedule();
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
