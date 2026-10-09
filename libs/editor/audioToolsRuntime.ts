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
function reduceAudioNoise(channels, rate, progress, inspect) {
  var N = rate > 24000 ? 2048 : 1024, hop = N / 2, bins = N / 2 + 1, length = channels[0].length;
  if (length < N) return channels.map(function (channel) { return channel.slice(); });
  var window = new Float32Array(N), weight = new Float32Array(length);
  var real = channels.map(function () { return new Float64Array(N); });
  var imag = channels.map(function () { return new Float64Array(N); });
  var output = channels.map(function () { return new Float32Array(length); });
  for (var i = 0; i < N; i++) window[i] = Math.sin(Math.PI * (i + 0.5) / N);
  function spectrum(offset) {
    for (var c = 0; c < channels.length; c++) {
      for (var j = 0; j < N; j++) { real[c][j] = (channels[c][offset + j] || 0) * window[j]; imag[c][j] = 0; }
      audioFft(real[c], imag[c], false);
    }
  }
  var frames = Math.max(1, Math.ceil(length / hop)), samples = Math.min(192, frames), history = [];
  for (var s = 0; s < samples; s++) {
    spectrum(Math.round(s * (length - N) / Math.max(1, samples - 1)));
    var energy = 0, powers = channels.map(function (_, c) {
      var power = new Float64Array(bins);
      for (var b = 0; b < bins; b++) { power[b] = real[c][b] * real[c][b] + imag[c][b] * imag[c][b]; energy += power[b]; }
      return power;
    });
    history.push({ powers: powers, energy: energy });
  }
  // Digital padding is not a recording of the background noise.
  var ranked = history.filter(function (frame) { return frame.energy > 1e-20; }).sort(function (a, b) { return a.energy - b.energy; });
  if (ranked.length < 8) return channels.map(function (channel) { return channel.slice(); });
  var median = ranked[Math.floor(ranked.length / 2)].energy;
  // Use quiet passages when present; a continuous note must not become its own noise profile.
  var quiet = ranked.filter(function (frame) { return frame.energy < median * 0.25 && frame.energy <= ranked[0].energy * 1.8; }).slice(0, 12);
  if (inspect) inspect({ sampledFrames: samples, activeFrames: ranked.length, quietFrames: quiet.length, lowestToMedian: ranked[0].energy / Math.max(1e-30, median) });
  var profiles = channels.map(function (_, c) {
    var profile = new Float64Array(bins);
    for (var bin = 0; bin < bins; bin++) {
      if (quiet.length >= 3) {
        for (var q = 0; q < quiet.length; q++) profile[bin] += quiet[q].powers[c][bin] / quiet.length;
      } else {
        var values = ranked.map(function (frame) { return frame.powers[c][bin]; }).sort(function (a, b) { return a - b; });
        profile[bin] = values[Math.floor((values.length - 1) * 0.25)] / -Math.log(0.75);
      }
    }
    if (quiet.length < 3) {
      var capped = profile.slice();
      // Nearby spectral valleys bound noise beneath sustained speech harmonics.
      for (var f = 0; f < bins; f++) {
        var neighbors = [];
        for (var k = Math.max(0, f - 8); k <= Math.min(bins - 1, f + 8); k++) if (Math.abs(k - f) > 2) neighbors.push(profile[k]);
        neighbors.sort(function (a, b) { return a - b; });
        if (neighbors.length) capped[f] = Math.min(profile[f], neighbors[Math.floor((neighbors.length - 1) * 0.4)] * 1.4);
      }
      // Without a reliable quiet passage, favor preserving speech over aggressive subtraction.
      for (var f = 0; f < bins; f++) capped[f] *= 0.25;
      return capped;
    }
    return profile;
  });
  var smooth = new Float64Array(bins), gains = new Float64Array(bins); smooth.fill(1);
  // Link both channels without downmixing: opposite-phase stereo must remain audible.
  for (var offset = -hop, frame = 0; offset < length; offset += hop, frame++) {
    spectrum(offset);
    for (var bin = 0; bin < bins; bin++) {
      var gain = 0.2;
      for (var c = 0; c < channels.length; c++) {
        var power = real[c][bin] * real[c][bin] + imag[c][bin] * imag[c][bin];
        gain = Math.max(gain, Math.sqrt(Math.max(0.04, 1 - 1.1 * profiles[c][bin] / Math.max(1e-12, power))));
      }
      gains[bin] = gain;
    }
    for (var bin = 0; bin < bins; bin++) {
      var gain = gains[bin] * 0.6 + gains[Math.max(0, bin - 1)] * 0.2 + gains[Math.min(bins - 1, bin + 1)] * 0.2;
      smooth[bin] = gain < smooth[bin] ? gain * 0.65 + smooth[bin] * 0.35 : gain * 0.35 + smooth[bin] * 0.65;
      for (var c = 0; c < channels.length; c++) {
        real[c][bin] *= smooth[bin]; imag[c][bin] *= smooth[bin];
        if (bin > 0 && bin < N / 2) { real[c][N - bin] *= smooth[bin]; imag[c][N - bin] *= smooth[bin]; }
      }
    }
    for (var c = 0; c < channels.length; c++) audioFft(real[c], imag[c], true);
    for (var w = 0; w < N; w++) {
      var index = offset + w;
      if (index >= 0 && index < length) {
        for (var c = 0; c < channels.length; c++) output[c][index] += real[c][w] * window[w];
        weight[index] += window[w] * window[w];
      }
    }
    if (frame % 32 === 0 && progress) progress(Math.min(1, frame / frames));
  }
  for (var c = 0; c < channels.length; c++) for (var z = 0; z < length; z++) output[c][z] /= Math.max(0.00001, weight[z]);
  return output;
}
function processAudioSamples(channels, rate, mode, progress, inspect) {
  if (["normalize", "denoise", "voice"].indexOf(mode) < 0 || !channels.length || channels.length > 2 || !Number.isFinite(rate) || rate < 8000 || rate > 48000 || !channels[0].length || channels[0].length > rate * AUDIO_TOOL_LIMIT || channels.some(function (c) { return c.length !== channels[0].length; })) throw new Error("audio");
  var before = audioLevels(channels), output = channels.map(function (channel) { return channel.map(function (v) { return Number.isFinite(v) ? v : 0; }); });
  if (mode !== "normalize") output = reduceAudioNoise(output, rate, function (p) { if (progress) progress(p * 0.85); }, inspect);
  if (mode === "voice") {
    var alpha = Math.exp(-2 * Math.PI * 90 / rate);
    for (var c = 0; c < output.length; c++) {
      var previous = 0, filtered = 0;
      for (var i = 0; i < output[c].length; i++) {
        var x = output[c][i]; filtered = alpha * (filtered + x - previous); previous = x; output[c][i] = filtered;
      }
    }
    for (var i = 0; i < output[0].length; i++) {
      var amplitude = 0, threshold = 0.28;
      for (var c = 0; c < output.length; c++) amplitude = Math.max(amplitude, Math.abs(output[c][i]));
      if (amplitude > threshold) {
        var factor = (threshold + (amplitude - threshold) / 3) / amplitude;
        for (var c = 0; c < output.length; c++) output[c][i] *= factor;
      }
    }
  }
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
