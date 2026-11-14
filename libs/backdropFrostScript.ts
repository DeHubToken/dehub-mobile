/**
 * Runs inside the theme backdrop WebView. Every few seconds while the scene is
 * drawing, it copies the visible canvases into one tiny, blurred picture and
 * posts it to the app as a data URL. Feed cards paint that picture behind
 * themselves (components/theme/CardFrost), so they read as frosted glass over
 * the wallpaper without a live blur per card.
 *
 * The copy is taken inside the scene's own animation frame, straight after it
 * draws, because a WebGL canvas without preserveDrawingBuffer is blank once
 * the frame has been shown.
 */
export const FROST_SNAPSHOT_SCRIPT = `(function(){
  if (window.__dehubFrost) return;
  var W = 64, want = false, lastSent = '', stamp = 0;
  var post = function(data){ try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ frost: data })); } catch (e) {} };
  function grab(){
    try {
      var vw = window.innerWidth, vh = window.innerHeight;
      if (!vw || !vh) return;
      var H = Math.max(1, Math.round(W * vh / vw));
      var sharp = document.createElement('canvas'); sharp.width = W; sharp.height = H;
      var ctx = sharp.getContext('2d'); if (!ctx) return;
      ctx.fillStyle = getComputedStyle(document.body).backgroundColor || '#000';
      ctx.fillRect(0, 0, W, H);
      var list = document.querySelectorAll('canvas, video');
      for (var i = 0; i < list.length; i++) {
        var el = list[i], r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        var cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        ctx.globalAlpha = Math.max(0, Math.min(1, parseFloat(cs.opacity) || 1));
        ctx.drawImage(el, r.left * W / vw, r.top * H / vh, r.width * W / vw, r.height * H / vh);
      }
      ctx.globalAlpha = 1;
      // Blur in a second pass, drawn a little oversize so the edges blur into
      // the picture itself instead of fading to black.
      var out = document.createElement('canvas'); out.width = W; out.height = H;
      var octx = out.getContext('2d'); if (!octx) return;
      octx.drawImage(sharp, 0, 0);
      if ('filter' in octx) { octx.filter = 'blur(2px)'; octx.drawImage(sharp, -6, -6, W + 12, H + 12); }
      var data = out.toDataURL('image/jpeg', 0.82);
      if (data.length > 200 && data !== lastSent) { lastSent = data; post(data); }
    } catch (e) { /* a tainted canvas (cross-origin video) leaves cards on their plain tint */ }
  }
  var raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function(cb){
    return raf(function(t){ cb(t); if (want) { want = false; grab(); } });
  };
  window.__dehubFrost = { grab: function(){ want = true; } };
  // First copy soon after the scene's first frames, then a slow refresh while
  // it runs (a paused scene draws no frames, so nothing is copied then).
  setTimeout(function(){ want = true; }, 900);
  setInterval(function(){ want = true; }, 4000);
})();true;`;
