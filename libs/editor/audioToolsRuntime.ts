import { BEAT_RUNTIME } from "./beatRuntime";
/** The same sound processing runs in browser and phone workers. Keep both copies identical. */
export const AUDIO_TOOLS_RUNTIME = String.raw`
var AUDIO_TOOL_LIMIT = 600;
function audioToolRange(clip, sourceDuration) {
  var speed = clip.speed == null ? 1 : clip.speed;
  if (!Number.isFinite(speed) || speed < 0.25 || speed > 4 || !Number.isFinite(clip.duration) || clip.duration <= 0 || clip.duration > AUDIO_TOOL_LIMIT || !Number.isFinite(clip.trimIn) || clip.trimIn < 0 || clip.trimIn >= sourceDuration) throw new Error("range");
  return { speed: speed, duration: clip.duration, offset: clip.trimIn, sourceSeconds: Math.min(clip.duration * speed, sourceDuration - clip.trimIn) };
}
function audioLevels(channels) {
  var sum = 0, peak = 0, count = 0;
  for (var c = 0; c < channels.length; c++) for (var i = 0; i < channels[c].length; i++) {
    var x = Number.isFinite(channels[c][i]) ? channels[c][i] : 0;
    sum += x * x; peak = Math.max(peak, Math.abs(x)); count++;
  }
  return { rms: Math.sqrt(sum / Math.max(1, count)), peak: peak };
}
function audioFft(real, imag, inverse) {
  var n = real.length;
  for (var i = 1, j = 0; i < n; i++) {
    var bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { var r = real[i]; real[i] = real[j]; real[j] = r; r = imag[i]; imag[i] = imag[j]; imag[j] = r; }
  }
  for (var len = 2; len <= n; len <<= 1) {
    var angle = (inverse ? 2 : -2) * Math.PI / len, wr = Math.cos(angle), wi = Math.sin(angle);
    for (var start = 0; start < n; start += len) {
      var ur = 1, ui = 0;
      for (var k = 0; k < len / 2; k++) {
        var a = start + k, b = a + len / 2;
        var vr = real[b] * ur - imag[b] * ui, vi = real[b] * ui + imag[b] * ur;
        real[b] = real[a] - vr; imag[b] = imag[a] - vi; real[a] += vr; imag[a] += vi;
        var next = ur * wr - ui * wi; ui = ur * wi + ui * wr; ur = next;
      }
    }
  }
  if (inverse) for (var q = 0; q < n; q++) { real[q] /= n; imag[q] /= n; }
}
function reduceAudioNoise(input, rate, progress) {
  var N = 1024, hop = N / 2, bins = N / 2 + 1;
  var window = new Float32Array(N), real = new Float64Array(N), imag = new Float64Array(N);
  var output = new Float32Array(input.length), weight = new Float32Array(input.length);
  for (var i = 0; i < N; i++) window[i] = Math.sin(Math.PI * (i + 0.5) / N);
  function spectrum(offset) {
    for (var j = 0; j < N; j++) { real[j] = (input[offset + j] || 0) * window[j]; imag[j] = 0; }
    audioFft(real, imag, false);
  }
  var frames = Math.max(1, Math.ceil(input.length / hop));
  var samples = Math.min(48, frames), history = [];
  for (var s = 0; s < samples; s++) {
    spectrum(Math.round(s * Math.max(0, input.length - N) / Math.max(1, samples - 1)));
    var powers = new Float64Array(bins);
    for (var b = 0; b < bins; b++) powers[b] = real[b] * real[b] + imag[b] * imag[b];
    history.push(powers);
  }
  var floor = new Float64Array(bins), smooth = new Float64Array(bins); smooth.fill(1);
  for (var f = 0; f < bins; f++) {
    var values = history.map(function (p) { return p[f]; }).sort(function (a, b) { return a - b; });
    floor[f] = values[Math.floor((values.length - 1) * 0.15)];
  }
  // Overlap-add includes padded leading frames, preserving both ends of a short sound.
  for (var offset = -hop, frame = 0; offset < input.length; offset += hop, frame++) {
    spectrum(offset);
    for (var bin = 0; bin < bins; bin++) {
      var power = real[bin] * real[bin] + imag[bin] * imag[bin];
      var gain = Math.sqrt(Math.max(0.025, 1 - 0.9 * floor[bin] / Math.max(1e-12, power)));
      // Keep the very lowest frequencies quiet; use the sampled spectrum elsewhere.
      if (bin * rate / N < 65) gain *= 0.35;
      smooth[bin] = gain < smooth[bin] ? gain * 0.65 + smooth[bin] * 0.35 : gain * 0.2 + smooth[bin] * 0.8;
      real[bin] *= smooth[bin]; imag[bin] *= smooth[bin];
      if (bin > 0 && bin < N / 2) { real[N - bin] *= smooth[bin]; imag[N - bin] *= smooth[bin]; }
    }
    audioFft(real, imag, true);
    for (var w = 0; w < N; w++) {
      var index = offset + w;
      if (index >= 0 && index < input.length) { output[index] += real[w] * window[w]; weight[index] += window[w] * window[w]; }
    }
    if (frame % 32 === 0 && progress) progress(Math.min(1, frame / frames));
  }
  for (var z = 0; z < output.length; z++) output[z] /= Math.max(0.00001, weight[z]);
  return output;
}
function processAudioSamples(channels, rate, mode, progress) {
  if (["normalize", "denoise", "voice"].indexOf(mode) < 0 || !channels.length || channels.length > 2 || !Number.isFinite(rate) || rate < 8000 || rate > 48000 || !channels[0].length || channels[0].length > rate * AUDIO_TOOL_LIMIT || channels.some(function (c) { return c.length !== channels[0].length; })) throw new Error("audio");
  var before = audioLevels(channels), output = channels.map(function (channel, c) {
    var clean = channel.map(function (v) { return Number.isFinite(v) ? v : 0; });
    if (mode !== "normalize") clean = reduceAudioNoise(clean, rate, function (p) { if (progress) progress((c + p) / channels.length * 0.85); });
    if (mode === "voice") {
      var alpha = Math.exp(-2 * Math.PI * 90 / rate), previous = 0, filtered = 0;
      for (var i = 0; i < clean.length; i++) {
        var x = clean[i]; filtered = alpha * (filtered + x - previous); previous = x;
        var amplitude = Math.abs(filtered), threshold = 0.28;
        clean[i] = amplitude > threshold ? Math.sign(filtered) * (threshold + (amplitude - threshold) / 3) : filtered;
      }
    }
    return clean;
  });
  var levels = audioLevels(output), gain = 1;
  if (mode !== "denoise" && levels.rms > 0.00001) gain = Math.min(6, Math.pow(10, -16 / 20) / levels.rms, 0.95 / Math.max(0.00001, levels.peak));
  if (gain !== 1) for (var c = 0; c < output.length; c++) for (var i = 0; i < output[c].length; i++) output[c][i] *= gain;
  if (progress) progress(1);
  return { channels: output, before: before, after: audioLevels(output), gain: gain };
}
function audioWav(channels, rate) {
  var count = channels.length, frames = channels[0].length;
  var bytes = new ArrayBuffer(44 + frames * count * 2), view = new DataView(bytes);
  function text(at, value) { for (var i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); }
  text(0, "RIFF"); view.setUint32(4, bytes.byteLength - 8, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, count, true); view.setUint32(24, rate, true);
  view.setUint32(28, rate * count * 2, true); view.setUint16(32, count * 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, frames * count * 2, true);
  for (var frame = 0; frame < frames; frame++) for (var channel = 0; channel < count; channel++) {
    var sample = Math.max(-1, Math.min(1, channels[channel][frame]));
    view.setInt16(44 + (frame * count + channel) * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}
`;

export const AUDIO_TOOLS_WORKER = AUDIO_TOOLS_RUNTIME + BEAT_RUNTIME + String.raw`
self.onmessage = function (event) {
  var data = event.data;
  try {
    if (data.mode === "beats") {
      var beats = detectMusicBeats(data.channels, data.rate, function(fraction) { self.postMessage({ type: "progress", fraction: fraction }); });
      self.postMessage({ type: "beats", times: beats.times, bpm: beats.bpm, confidence: beats.confidence });
      return;
    }
    var result = processAudioSamples(data.channels, data.rate, data.mode, function (fraction) { self.postMessage({ type: "progress", fraction: fraction }); });
    var wav = audioWav(result.channels, data.rate);
    self.postMessage({ type: "done", wav: wav, before: result.before, after: result.after, gain: result.gain }, [wav]);
  } catch (error) { self.postMessage({ type: "error", message: String(error.message || error) }); }
};
`;
