/** Keep the export time and audio math identical in the browser and phone page. */
export const EXPORT_RANGES_RUNTIME = String.raw`
function exportTimeRange(fullDuration, range) {
  var start = range ? range.start : 0, end = range ? range.end : fullDuration;
  if (![fullDuration, start, end].every(Number.isFinite) || start < 0 || end <= start || end > fullDuration + 0.000001) throw new Error("Invalid export range");
  return { start: start, end: Math.min(end, fullDuration), duration: Math.min(end, fullDuration) - start };
}
function exportAudioSegment(clip, sourceDuration, range) {
  var speed = clip.speed == null ? 1 : clip.speed;
  if (![clip.start, clip.duration, clip.trimIn, sourceDuration, speed].every(Number.isFinite) || clip.duration <= 0 || clip.trimIn < 0 || sourceDuration <= 0 || speed <= 0) throw new Error("Invalid audio source range");
  var from = Math.max(clip.start, range.start);
  var end = clip.start + clip.duration;
  var until = Math.min(end, range.end, clip.start + Math.max(0, sourceDuration - clip.trimIn) / speed);
  if (until <= from) return null;
  var fadeIn = Math.max(0, Math.min(clip.duration, clip.audio && clip.audio.fadeIn || 0));
  var fadeOut = Math.max(0, Math.min(clip.duration - fadeIn, clip.audio && clip.audio.fadeOut || 0));
  var volume = Math.max(0, clip.audio && clip.audio.volume != null ? clip.audio.volume : 1);
  function gain(time) {
    var local = time - clip.start;
    return volume * Math.max(0, Math.min(1, fadeIn > 0 ? local / fadeIn : 1, fadeOut > 0 ? (end - time) / fadeOut : 1));
  }
  var times = [from, until];
  if (fadeIn > 0 && clip.start + fadeIn > from && clip.start + fadeIn < until) times.push(clip.start + fadeIn);
  if (fadeOut > 0 && end - fadeOut > from && end - fadeOut < until) times.push(end - fadeOut);
  times.sort(function (a, b) { return a - b; });
  return {
    when: from - range.start,
    offset: clip.trimIn + (from - clip.start) * speed,
    sourceSeconds: (until - from) * speed,
    speed: speed,
    envelope: times.filter(function (time, i) { return !i || time !== times[i - 1]; }).map(function (time) { return { time: time - range.start, gain: gain(time) }; })
  };
}
`;
