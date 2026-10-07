/** Shared piecewise audio gain, including partial fades carried across cuts. */
export const AUDIO_ENVELOPE_RUNTIME = String.raw`
function audioEnvelopePoints(clip) {
  var audio = clip.audio || {}, points = audio.envelope;
  if (Array.isArray(points) && points.length >= 2 && points.length <= 16 && points.every(function (p, i) { return p && Number.isFinite(p.time) && Number.isFinite(p.gain) && p.gain >= 0 && p.gain <= 1 && (!i || p.time > points[i - 1].time); })) return points;
  var fadeIn = Math.max(0, Math.min(clip.duration, audio.fadeIn || 0));
  var fadeOut = Math.max(0, Math.min(clip.duration - fadeIn, audio.fadeOut || 0));
  var times = [0, clip.duration];
  if (fadeIn > 0 && fadeIn < clip.duration) times.push(fadeIn);
  if (fadeOut > 0 && clip.duration - fadeOut > 0) times.push(clip.duration - fadeOut);
  times.sort(function (a, b) { return a - b; });
  return times.filter(function (t, i) { return !i || t !== times[i - 1]; }).map(function (t) { return { time: t, gain: Math.max(0, Math.min(1, fadeIn > 0 ? t / fadeIn : 1, fadeOut > 0 ? (clip.duration - t) / fadeOut : 1)) }; });
}
function audioEnvelopeGain(points, time) {
  if (time <= points[0].time) return points[0].gain;
  for (var i = 1; i < points.length; i++) {
    if (time <= points[i].time) {
      var a = points[i - 1], b = points[i];
      return a.gain + (b.gain - a.gain) * (time - a.time) / (b.time - a.time);
    }
  }
  return points[points.length - 1].gain;
}
function audioGainAt(clip, time) {
  var local = time - clip.start;
  if (local < 0 || local >= clip.duration) return 0;
  return Math.max(0, (clip.audio && clip.audio.volume != null ? clip.audio.volume : 1) * audioEnvelopeGain(audioEnvelopePoints(clip), local));
}
function sliceClipAudio(clip, offset, duration) {
  if (!clip.audio) return undefined;
  var audio = Object.assign({}, clip.audio);
  if (!audio.envelope && !audio.fadeIn && !audio.fadeOut) return audio;
  // Keep inactive curve points too: extending a trimmed edge restores its original fade.
  var points = audioEnvelopePoints(clip).map(function (p) { return { time: p.time - offset, gain: p.gain }; });
  var fadeIn = 0, fadeOut = 0;
  for (var i = 1; i < points.length; i++) {
    var a = points[i - 1], b = points[i];
    var seconds = Math.max(0, Math.min(duration, b.time) - Math.max(0, a.time));
    if (b.gain > a.gain) fadeIn += seconds;
    else if (b.gain < a.gain) fadeOut += seconds;
  }
  audio.fadeIn = fadeIn;
  audio.fadeOut = fadeOut;
  audio.envelope = points;
  return audio;
}
function scaleClipAudio(clip, ratio) {
  if (!clip.audio) return undefined;
  var audio = Object.assign({}, clip.audio);
  audio.fadeIn = (audio.fadeIn || 0) * ratio;
  audio.fadeOut = (audio.fadeOut || 0) * ratio;
  if (audio.envelope) audio.envelope = audioEnvelopePoints(clip).map(function (p) { return { time: p.time * ratio, gain: p.gain }; });
  return audio;
}
`;
