/** This decoder is local. Only its small sampled JPEGs leave the device after opt-in. */
export const VISUAL_FRAME_RUNTIME = String.raw`
async function sampleVisualFrames(src, clip, windows, signal, progress) {
  var speed = clip.speed == null ? 1 : clip.speed;
  if ((clip.kind !== 'video' && clip.kind !== 'image') || clip.locked || clip.hidden || !Number.isFinite(speed) || speed < 0.25 || speed > 4 || !Number.isFinite(clip.trimIn) || clip.trimIn < 0 || !Number.isFinite(clip.duration) || clip.duration < 1 || clip.duration > 600 || clip.duration * speed > 600 || !Array.isArray(windows) || !windows.length || windows.length > 10) throw new Error('highlight_limit');
  var video = document.createElement('video'), surface = document.createElement('canvas');
  var image = clip.kind === 'image' ? new Image() : null;
  video.muted = true; video.playsInline = true; video.preload = 'auto';
  var context = surface.getContext('2d'); if (!context) throw new Error('canvas unavailable');
  var frames = [];
  try {
    if (image) {
      await new Promise(function(resolve, reject) {
        var settled = false;
        function finish(error) { if (settled) return; settled = true; image.onload = image.onerror = null; signal.removeEventListener('abort', cancel); if (error) reject(error); else resolve(); }
        function cancel() { finish(new Error('cancelled')); }
        image.onload = function() { finish(); }; image.onerror = function() { finish(new Error('image unavailable')); };
        signal.addEventListener('abort', cancel, { once: true });
        if (signal.aborted) { cancel(); return; }
        image.src = src;
      });
    } else { video.src = src; video.load(); }
    for (var index = 0; index < windows.length; index++) {
      var window = windows[index];
      if (!Number.isInteger(window.id) || window.id < 0 || window.id >= 100 || !Number.isFinite(window.start) || !Number.isFinite(window.end) || window.start < 0 || window.end > clip.duration + 0.001 || window.end - window.start < 0.5 || window.end - window.start > 6.001) throw new Error('highlight_limit');
      for (var i = 0; i < 6; i++) {
        if (signal.aborted) throw new Error('cancelled');
        var at = Math.round((window.start + (i + 0.5) / 6 * (window.end - window.start)) * 1000) / 1000;
        if (!image) await waitForVideoFrame(video, clip.trimIn + at * speed, { signal: signal, forCanvasRead: true });
        if (!image && (!Number.isFinite(video.duration) || clip.trimIn + clip.duration * speed > video.duration + 0.05)) throw new Error('video source range');
        var width = image ? image.naturalWidth : video.videoWidth, height = image ? image.naturalHeight : video.videoHeight;
        if (!width || !height) throw new Error('visual source dimensions');
        var scale = Math.min(1, 320 / Math.max(width, height));
        surface.width = Math.max(1, Math.round(width * scale)); surface.height = Math.max(1, Math.round(height * scale));
        context.drawImage(image || video, 0, 0, surface.width, surface.height);
        var dataUrl = surface.toDataURL('image/jpeg', 0.65);
        if (dataUrl.length > 40000) dataUrl = surface.toDataURL('image/jpeg', 0.4);
        if (dataUrl.length > 40000 || dataUrl.indexOf('data:image/jpeg;base64,') !== 0) throw new Error('visual_frames_invalid');
        frames.push({ windowId: window.id, at: at, dataUrl: dataUrl });
        if (progress) progress((index * 6 + i + 1) / (windows.length * 6));
      }
    }
    if (signal.aborted) throw new Error('cancelled');
    return frames;
  } finally { if (image) { image.onload = image.onerror = null; image.removeAttribute('src'); } video.pause(); video.removeAttribute('src'); video.load(); surface.width = surface.height = 0; }
}
`;
