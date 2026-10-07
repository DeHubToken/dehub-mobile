export const CAPTIONS_WORKER = String.raw`/*
 * Speech to text for auto captions, entirely on the user's device.
 *
 * Whisper base (MIT) with word timestamps, via transformers.js (Apache-2.0)
 * loaded from a pinned jsdelivr URL. q8 on WASM: measured on a laptop CPU at
 * ~6s to load, then ~1.4s per second of speech, with an exact JFK transcript.
 * Multilingual; the spoken language is detected. Nothing is uploaded.
 *
 * The audio arrives as 16 kHz mono and is fed in 30 s windows so the page can
 * show progress on long clips.
 *
 * In:  { id, audio: Float32Array }
 * Out: { id, type: 'progress', loaded, total }        model download
 *      { id, type: 'transcribing', done, total }      seconds of audio
 *      { id, type: 'done', words: [{ text, start, end }] }
 *      { id, type: 'error', message }
 */
const LIB_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js';
const MODEL = 'onnx-community/whisper-base_timestamped';
const RATE = 16000;
const WINDOW_S = 30;

let asrPromise = null;

function getAsr(onProgress) {
  if (asrPromise) return asrPromise;
  const files = {};
  const progress_callback = (p) => {
    if (p && p.status === 'progress' && p.file && p.total) {
      files[p.file] = { loaded: p.loaded || 0, total: p.total };
      let loaded = 0;
      let total = 0;
      for (const f of Object.values(files)) {
        loaded += f.loaded;
        total += f.total;
      }
      onProgress(loaded, total);
    }
  };
  asrPromise = import(LIB_URL).then((T) => {
    T.env.allowLocalModels = false;
    return T.pipeline('automatic-speech-recognition', MODEL, { device: 'wasm', dtype: 'q8', progress_callback });
  });
  asrPromise.catch(() => {
    asrPromise = null;
  });
  return asrPromise;
}

self.onmessage = async (event) => {
  const { id, audio } = event.data || {};
  try {
    const asr = await getAsr((loaded, total) => self.postMessage({ id, type: 'progress', loaded, total }));
    const total = audio.length / RATE;
    const words = [];
    for (let off = 0; off < audio.length; off += WINDOW_S * RATE) {
      const slice = audio.subarray(off, Math.min(audio.length, off + WINDOW_S * RATE));
      const base = off / RATE;
      self.postMessage({ id, type: 'transcribing', done: base, total });
      const out = await asr(slice, { return_timestamps: 'word' });
      for (const c of out.chunks || []) {
        const text = String(c.text || '').trim();
        const [s, e] = c.timestamp || [];
        if (!text || typeof s !== 'number') continue;
        words.push({ text, start: base + s, end: base + (typeof e === 'number' ? e : s + 0.3) });
      }
    }
    self.postMessage({ id, type: 'done', words });
  } catch (e) {
    self.postMessage({ id, type: 'error', message: String((e && e.message) || e) });
  }
};
`;
