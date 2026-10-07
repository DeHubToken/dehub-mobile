/** Shared worker rhythm analysis; keep both editor copies identical. */
export const BEAT_RUNTIME = String.raw`
function detectMusicBeats(channels, rate, progress) {
  if (!channels.length || channels.length > 2 || !Number.isFinite(rate) || rate < 8000 || rate > 48000 || !channels[0].length || channels[0].length > rate * 600 || channels.some(function (c) { return c.length !== channels[0].length; })) throw new Error("beat audio");
  var hop = Math.max(1, Math.round(rate * 0.01)), window = hop * 2;
  var frames = Math.ceil(channels[0].length / hop), energy = new Float32Array(frames), flux = new Float32Array(frames);
  var previous = 0, maximum = 0;
  for (var f = 0; f < frames; f++) {
    var sum = 0, count = 0;
    for (var c = 0; c < channels.length; c++) for (var i = f * hop; i < Math.min(channels[c].length, f * hop + window); i++) {
      var value = Number.isFinite(channels[c][i]) ? channels[c][i] : 0;
      sum += value * value; count++;
    }
    energy[f] = Math.sqrt(sum / Math.max(1, count));
    flux[f] = Math.max(0, energy[f] - previous); previous = energy[f]; maximum = Math.max(maximum, flux[f]);
    if (f % 200 === 0 && progress) progress(f / frames * 0.65);
  }
  if (maximum < 0.0001) return { times: [], bpm: 0, confidence: 0 };
  var candidates = [];
  for (var p = 2; p < frames - 2; p++) {
    if (flux[p] <= maximum * 0.04 || flux[p] < flux[p-1] || flux[p] <= flux[p+1] || flux[p] < flux[p-2] || flux[p] < flux[p+2]) continue;
    var local = Array.from(flux.slice(Math.max(0, p-60), Math.min(frames, p+61))).sort(function (a,b) { return a-b; });
    var median = local[Math.floor(local.length / 2)], deviations = local.map(function (v) { return Math.abs(v-median); }).sort(function(a,b){return a-b;});
    if (flux[p] <= median + Math.max(maximum * 0.04, deviations[Math.floor(deviations.length / 2)] * 3)) continue;
    var time = p * hop / rate;
    var last = candidates[candidates.length - 1];
    if (last && time - last.time < 0.22) { if (flux[p] > last.strength) candidates[candidates.length - 1] = { time: time, strength: flux[p] }; }
    else candidates.push({ time: time, strength: flux[p] });
  }
  if (progress) progress(0.9);
  if (candidates.length < 4) return { times: [], bpm: 0, confidence: 0 };
  var intervals = [];
  for (var n = 1; n < candidates.length; n++) {
    var delta = candidates[n].time - candidates[n-1].time;
    if (delta >= 0.25 && delta <= 1.2) intervals.push(delta);
  }
  if (intervals.length < 3) return { times: [], bpm: 0, confidence: 0 };
  intervals.sort(function(a,b){return a-b;});
  var period = intervals[Math.floor(intervals.length / 2)];
  var regularIntervals = intervals.filter(function(v){return Math.abs(v-period) <= Math.max(0.04, period*0.12);});
  var regular = regularIntervals.length;
  var confidence = regular / Math.max(1, candidates.length-1);
  if (confidence < 0.35) return { times: [], bpm: 0, confidence: confidence };
  if (progress) progress(1);
  return { times: candidates.map(function(v){return v.time;}), bpm: Math.round(60 / (regularIntervals.reduce(function(sum,v){return sum+v;},0) / regular)), confidence: confidence };
}
`;
