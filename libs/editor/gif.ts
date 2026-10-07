import { GIF_RUNTIME } from "./gifRuntime";

export const GIF_CONTENT_LIMIT = 60;
export interface GifPlan { width: number; height: number; fps: number; frames: number; duration: number }
export interface GifSession {
  ready: Promise<void>;
  frame: (rgba: Uint8ClampedArray, delay: number) => Promise<void>;
  finish: () => Promise<ArrayBuffer>;
  close: () => void;
}
const runtime = new Function(GIF_RUNTIME + "; return { gifPlan, gifFrameDelay, gifWorkerSession };")() as {
  gifPlan: (width: number, height: number, scale: number, duration: number, fps: number) => GifPlan;
  gifFrameDelay: (frame: number, plan: GifPlan) => number;
  gifWorkerSession: (width: number, height: number, source: string) => GifSession;
};
export const gifPlan = runtime.gifPlan;
export const gifFrameDelay = runtime.gifFrameDelay;
export const gifWorkerSession = runtime.gifWorkerSession;
