import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {audioRuntime} from './audio-quality.mjs';

const [sourcePath, baseRef] = process.argv.slice(2);
const current = audioRuntime(readFileSync(sourcePath, 'utf8'));
const before = audioRuntime(execFileSync('git', ['show', `${baseRef}:${sourcePath}`], {encoding:'utf8'}));
const manifest = JSON.parse(readFileSync('tests/editor/speech-reference-source.json', 'utf8'));
const folder = mkdtempSync(join(tmpdir(), 'editor-speech-'));
const rate = 16000, measurements = [];
function processed(runtime, input) {
  let noiseProfile = null;
  const channels = runtime.processAudioSamples([input], rate, 'denoise', null, value => { noiseProfile = value; }).channels;
  return {samples: channels[0], noiseProfile};
}
function quality(value, clean) {
  let signal = 0, error = 0, cross = 0;
  for (let i = 0; i < clean.length; i++) { signal += clean[i] ** 2; error += (value[i] - clean[i]) ** 2; cross += clean[i] * value[i]; }
  return {snrDb:10*Math.log10(signal/Math.max(1e-30,error)), gain:cross/signal};
}
for (const file of manifest.files) {
  const response = await fetch(file.url, {signal:AbortSignal.timeout(30000)});
  assert.ok(response.ok, `Speech example ${file.id} downloads`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length, file.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
  const input = join(folder, `${file.id}.flac`); writeFileSync(input, bytes);
  const decoded = execFileSync('ffmpeg', ['-v','error','-i',input,'-t','30','-ar',String(rate),'-ac','1','-f','f32le','pipe:1'], {maxBuffer:4000000});
  const clean = Float32Array.from({length:decoded.length/4}, (_, i) => decoded.readFloatLE(i*4));
  assert.ok(clean.length > rate && clean.every(Number.isFinite));
  const cleanResult = processed(current, clean), cleanQuality = quality(cleanResult.samples, clean);
  measurements.push({id:file.id, noise:'clean', seconds:clean.length/rate, noiseProfile:cleanResult.noiseProfile, current:cleanQuality, before:quality(before.processAudioSamples([clean], rate, 'denoise').channels[0],clean)});
  for (const kind of ['white', 'colored', 'hum']) {
    let seed = 7, previous = 0, energy = 0, cleanEnergy = 0;
    const noise = Float32Array.from({length:clean.length}, (_, i) => {
      seed = (Math.imul(seed,1664525)+1013904223)|0;
      const white = seed/2147483648;
      previous = 0.85*previous + white;
      const value = kind === 'colored' ? previous : kind === 'hum' ? Math.sin(2*Math.PI*120*i/rate)+white*0.1 : white;
      energy += value*value; cleanEnergy += clean[i]*clean[i]; return value;
    });
    const scale = Math.sqrt(cleanEnergy/energy/10);
    const noisy = clean.map((value,i) => value+noise[i]*scale);
    const result = processed(current, noisy), inputQuality = quality(noisy,clean), proposed = quality(result.samples,clean);
    const previousQuality = quality(before.processAudioSamples([noisy],rate,'denoise').channels[0],clean);
    measurements.push({id:file.id,noise:kind,seconds:clean.length/rate,noiseProfile:result.noiseProfile,input:inputQuality,current:proposed,before:previousQuality,improvementDb:proposed.snrDb-inputQuality.snrDb});
  }
}
const proof = {sourcePath,baseRef,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),fixtures:manifest,measurements,scope:'Four read-speech examples and three deterministic 10 dB noise profiles; a bounded quality benchmark, not a general speech-quality certification.'};
writeFileSync('speech-quality-results.json',JSON.stringify(proof,null,2)); console.log(JSON.stringify(proof));
for (const value of measurements) {
  assert.ok(value.current.gain > 0.85, `Speech ${value.id}/${value.noise}: voice level remains above 85%`);
  if (value.noise === 'clean') assert.ok(value.current.snrDb > 20, `Speech ${value.id}: clean detail stays intact`);
  else assert.ok(value.improvementDb > 1, `Speech ${value.id}/${value.noise}: noisy voice SNR improves over 1 dB`);
}
