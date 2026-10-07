/** Shared by browser and native WebView; analysis never uploads video. */
export const SHOT_RUNTIME = String.raw`
function shotFeature(rgba) {
  var pixels = new Uint8Array(rgba.length / 4 * 3), histogram = new Float32Array(48);
  var n = pixels.length / 3;
  for (var i = 0, j = 0; i < rgba.length; i += 4) {
    for (var channel = 0; channel < 3; channel++) {
      var value = rgba[i + channel]; pixels[j++] = value;
      histogram[channel * 16 + (value >> 4)] += 1 / n;
    }
  }
  return { pixels: pixels, histogram: histogram };
}
function shotDistance(a, b) {
  var pixel = 0, histogram = 0;
  for (var i = 0; i < a.pixels.length; i++) pixel += Math.abs(a.pixels[i] - b.pixels[i]);
  for (var j = 0; j < 48; j++) histogram += Math.abs(a.histogram[j] - b.histogram[j]);
  return { pixel: pixel / (a.pixels.length * 255), histogram: histogram / 6 };
}
function shotCandidates(samples, duration) {
  var changes = samples.map(function (sample, i) { return i ? shotDistance(samples[i - 1].feature, sample.feature) : { pixel: 0, histogram: 0 }; });
  var cuts = [];
  for (var i = 1; i + 1 < samples.length; i++) {
    var change = changes[i];
    if (change.pixel < 0.16 || change.histogram < 0.20) continue;
    var before = changes[i - 1], after = changes[i + 1];
    if (change.pixel < Math.max(before.pixel, after.pixel) * 1.6 || change.histogram < Math.max(before.histogram, after.histogram) * 1.3) continue;
    // A flash returning to the previous picture is not a new scene.
    var persisted = shotDistance(samples[i - 1].feature, samples[i + 1].feature);
    if (persisted.pixel < change.pixel * 0.65 || persisted.histogram < change.histogram * 0.65) continue;
    var time = samples[i].time;
    if (time < 0.4 || duration - time < 0.4 || (cuts.length && time - cuts[cuts.length - 1].hi < 0.4)) continue;
    cuts.push({ lo: samples[i - 1].time, hi: time, before: samples[i - 1].feature, after: samples[i].feature });
    if (cuts.length > 99) throw new Error("too many scene changes");
  }
  return cuts;
}
async function scanVideoShots(src, clip, signal, progress) {
  var speed = clip.speed == null ? 1 : clip.speed, offset = clip.trimIn, duration = clip.duration;
  if (clip.kind !== "video" || clip.locked || clip.hidden || !Number.isFinite(speed) || speed < 0.25 || speed > 4 || !Number.isFinite(offset) || offset < 0 || !Number.isFinite(duration) || duration < 0.8 || duration > 600) throw new Error("video range");
  var video = document.createElement("video"), surface = document.createElement("canvas");
  video.muted = true; video.playsInline = true; video.preload = "auto";
  surface.width = 32; surface.height = 18;
  var context = surface.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("canvas unavailable");
  function check() { if (signal.aborted) throw new Error("cancelled"); }
  function wait(event, action, ready) {
    return new Promise(function (resolve, reject) {
      function done(error) { clearTimeout(timer); video.removeEventListener(event, success); video.removeEventListener("error", failure); signal.removeEventListener("abort", cancel); error ? reject(error) : resolve(); }
      function success() { done(); } function failure() { done(new Error("video decode failed")); } function cancel() { done(new Error("cancelled")); }
      var timer = setTimeout(function () { done(new Error("video decode timed out")); }, 10000);
      video.addEventListener(event, success, { once: true }); video.addEventListener("error", failure, { once: true }); signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) { cancel(); return; }
      try { action(); if (ready && ready()) success(); } catch (error) { done(error); }
    });
  }
  async function frame(time) {
    check(); var target = offset + time * speed;
    if (Math.abs(video.currentTime - target) > 0.0001 || video.readyState < 2) await wait("seeked", function () { video.currentTime = target; }, function () { return !video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - target) < 0.0001; });
    check(); context.drawImage(video, 0, 0, 32, 18);
    return shotFeature(context.getImageData(0, 0, 32, 18).data);
  }
  try {
    await wait("loadeddata", function () { video.src = src; video.load(); }, function () { return video.readyState >= 2; });
    check();
    if (!Number.isFinite(video.duration) || offset + duration * speed > video.duration + 0.05) throw new Error("video source range");
    var samples = [], count = Math.ceil(duration * 4);
    for (var i = 0; i <= count; i++) {
      var time = Math.min(i / 4, duration - 0.01);
      samples.push({ time: time, feature: await frame(time) });
      if (progress) progress((i + 1) / (count + 1) * 0.8);
    }
    var candidates = shotCandidates(samples, duration), times = [];
    for (var j = 0; j < candidates.length; j++) {
      var candidate = candidates[j], lo = candidate.lo, hi = candidate.hi;
      // Resolve the sampled interval to within one sixteenth of a second.
      for (var step = 0; step < 4; step++) {
        var middle = (lo + hi) / 2, feature = await frame(middle);
        var oldDistance = shotDistance(candidate.before, feature), newDistance = shotDistance(candidate.after, feature);
        if (oldDistance.pixel + oldDistance.histogram > newDistance.pixel + newDistance.histogram) hi = middle; else lo = middle;
      }
      var at = Math.round(hi * 1000) / 1000;
      if (at >= 0.2 && duration - at >= 0.2 && (!times.length || at - times[times.length - 1] >= 0.2)) times.push(at);
      if (progress) progress(0.8 + (j + 1) / candidates.length * 0.2);
    }
    check(); if (progress) progress(1);
    return { times: times, sampled: samples.length, precision: 0.016 };
  } finally { video.pause(); video.removeAttribute("src"); video.load(); surface.width = surface.height = 0; }
}
`;
