import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

export function audioRuntime(source) {
  const text = source.match(/export const AUDIO_TOOLS_RUNTIME = String.raw`([\s\S]*?)`;/)?.[1];
  assert.ok(text, 'Sound processing runtime is present');
  return new Function(text + ';return {processAudioSamples,audioLevels,audioWav};')();
}
export function audioQuality(runtime) {
  const results = {};
  const projection = (signal, reference, start, end) => {
    let cross = 0, power = 0, error = 0;
    for (let i = start; i < end; i++) { cross += signal[i] * reference[i]; power += reference[i] ** 2; error += (signal[i] - reference[i]) ** 2; }
    return { gain: cross / Math.max(1e-30, power), snr: 10 * Math.log10(Math.max(1e-30, power) / Math.max(1e-30, error)) };
  };
  const rms = (samples, start = 0, end = samples.length) => {
    let power = 0; for (let i = start; i < end; i++) power += samples[i] ** 2;
    return Math.sqrt(power / Math.max(1, end - start));
  };
  for (const rate of [8000, 16000, 44100, 48000]) {
    let seed = 7, previous = 0;
    const length = rate * 2, clean = new Float32Array(length), noisy = new Float32Array(length), speech = new Float32Array(length), colored = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      clean[i] = 0.14 * Math.sin(2 * Math.PI * 220 * t) + 0.07 * Math.sin(2 * Math.PI * 440 * t) + 0.035 * Math.sin(2 * Math.PI * 660 * t);
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      const noise = seed / 2147483648 * 0.04;
      previous = 0.7 * previous + noise;
      noisy[i] = clean[i] + noise;
      speech[i] = t > 0.45 && t < 1.55 ? clean[i] : 0;
      colored[i] = speech[i] + previous;
    }
    const stationary = runtime.processAudioSamples([noisy], rate, 'denoise').channels[0];
    const pure = runtime.processAudioSamples([clean], rate, 'denoise').channels[0];
    const pause = runtime.processAudioSamples([colored], rate, 'denoise').channels[0];
    const start = Math.floor(rate * 0.15), end = Math.floor(rate * 1.85);
    const input = projection(noisy, clean, start, end), sustained = projection(stationary, clean, start, end);
    const quietStart = Math.floor(rate * 0.1), quietEnd = Math.floor(rate * 0.35);
    const voiced = projection(pause, speech, Math.floor(rate * 0.6), Math.floor(rate * 1.4));
    const pureQuality = projection(pure, clean, start, end);
    const stereo = runtime.processAudioSamples([noisy, noisy.map(x => -x * 0.25)], rate, 'denoise').channels;
    const voice = runtime.processAudioSamples([noisy.map(x => x * 4), noisy.map(x => -x)], rate, 'voice').channels;
    let stereoError = 0, voiceError = 0;
    for (let i = 0; i < length; i++) {
      stereoError = Math.max(stereoError, Math.abs(stereo[1][i] + stereo[0][i] * 0.25));
      voiceError = Math.max(voiceError, Math.abs(voice[1][i] + voice[0][i] * 0.25));
    }
    results[rate] = {
      sustainedGain: sustained.gain, sustainedSnrDb: sustained.snr, inputSnrDb: input.snr,
      snrImprovementDb: sustained.snr - input.snr, cleanGain: pureQuality.gain, cleanSnrDb: pureQuality.snr,
      pauseNoiseReductionDb: 20 * Math.log10(rms(colored, quietStart, quietEnd) / Math.max(1e-30, rms(pause, quietStart, quietEnd))),
      voicedGain: voiced.gain, voicedSnrDb: voiced.snr, stereoRatioError: stereoError, voiceStereoRatioError: voiceError,
      finite: stationary.every(Number.isFinite) && pause.every(Number.isFinite) && voice.every(c => c.every(Number.isFinite)),
      exactLength: stationary.length === length && stereo.every(c => c.length === length),
    };
  }
  const short = Float32Array.from({length: 127}, (_, i) => i === 0 || i === 126 ? 0.25 : Math.sin(i) * 0.05);
  const shortOutput = runtime.processAudioSamples([short], 16000, 'denoise').channels[0];
  results.shortSoundUnchanged = shortOutput.every((value, i) => value === short[i]);
  const silent = runtime.processAudioSamples([new Float32Array(2400)], 16000, 'voice');
  results.silenceUnchanged = silent.after.peak === 0 && silent.gain === 1;
  return results;
}
export function assertAudioQuality(metrics) {
  for (const rate of [8000, 16000, 44100, 48000]) {
    const value = metrics[rate];
    assert.ok(value.sustainedGain > 0.9, `${rate} Hz: sustained voice remains at least 90%`);
    assert.ok(value.cleanGain > 0.95, `${rate} Hz: clean harmonics remain at least 95%`);
    assert.ok(value.cleanSnrDb > 22, `${rate} Hz: clean voice distortion stays bounded`);
    assert.ok(value.snrImprovementDb > 1, `${rate} Hz: noisy continuous voice SNR improves`);
    assert.ok(value.pauseNoiseReductionDb > 3, `${rate} Hz: noise in pauses drops over 3 dB`);
    assert.ok(value.voicedGain > 0.9, `${rate} Hz: paused speech preserves voiced passages`);
    assert.ok(value.stereoRatioError < 0.00001, `${rate} Hz: denoise preserves stereo balance and phase`);
    assert.ok(value.voiceStereoRatioError < 0.00001, `${rate} Hz: voice compression preserves stereo balance and phase`);
    assert.ok(value.finite && value.exactLength, `${rate} Hz: finite samples and exact source duration`);
  }
  assert.ok(metrics.shortSoundUnchanged, 'Short sounds preserve both endpoints');
  assert.ok(metrics.silenceUnchanged, 'Silence stays silent');
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/audio-quality.mjs')) {
  const [sourcePath, baseRef, destination = 'audio-quality-results.json'] = process.argv.slice(2);
  const current = audioQuality(audioRuntime(readFileSync(sourcePath, 'utf8')));
  const before = baseRef ? audioQuality(audioRuntime(execFileSync('git', ['show', `${baseRef}:${sourcePath}`], {encoding: 'utf8'}))) : null;
  const proof = {sourcePath, baseRef, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), current, before};
  writeFileSync(destination, JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof));
  assertAudioQuality(current);
}
