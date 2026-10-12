import { validVisualBatch, type VisualBatch } from "./visualHighlightContract";

/** Individual samples stay local once their complete, timestamped sheets exist. */
export function visualBatchForTransport(batch: VisualBatch): VisualBatch {
  if (!validVisualBatch(batch)) throw new Error("visual_frames_invalid");
  if (batch.contactSheets) return batch;
  const contactSheets = batch.frames.flatMap(frame => frame.contactSheet ? [frame.contactSheet] : []);
  if (!contactSheets.length) return batch;
  const packed: VisualBatch = { ...batch, frames: batch.frames.map(({ windowId, at }) => ({ windowId, at, dataUrl: "" })), contactSheets };
  if (!validVisualBatch(packed)) throw new Error("visual_frames_invalid");
  return packed;
}
