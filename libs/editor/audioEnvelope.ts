import type { ClipAudio, MediaClip } from "./types";
import { AUDIO_ENVELOPE_RUNTIME } from "./audioEnvelopeRuntime";

export interface AudioEnvelopePoint { time: number; gain: number }
const runtime = new Function(AUDIO_ENVELOPE_RUNTIME + "; return { audioEnvelopePoints, audioEnvelopeGain, audioGainAt, sliceClipAudio, scaleClipAudio };")() as {
  audioEnvelopePoints: (clip: MediaClip) => AudioEnvelopePoint[];
  audioEnvelopeGain: (points: AudioEnvelopePoint[], time: number) => number;
  audioGainAt: (clip: MediaClip, time: number) => number;
  sliceClipAudio: (clip: MediaClip, offset: number, duration: number) => ClipAudio | undefined;
  scaleClipAudio: (clip: MediaClip, ratio: number) => ClipAudio | undefined;
};
export const { audioEnvelopePoints, audioEnvelopeGain, audioGainAt, sliceClipAudio, scaleClipAudio } = runtime;
