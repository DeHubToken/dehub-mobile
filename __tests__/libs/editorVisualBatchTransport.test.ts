import { visualBatchForTransport } from "../../libs/editor/visualBatchTransport";
import { validVisualBatch, visualSampleTimes, type VisualBatch } from "../../libs/editor/visualHighlightContract";
import { JPEG } from "../../libs/editor/visualHighlightFixture";

const windows = Array.from({ length: 10 }, (_, id) => ({ id, start: id * 6, end: (id + 1) * 6 }));
const raw = (): VisualBatch => ({ optIn: true, duration: 60, seconds: 15, focus: "red scenes", windows,
  frames: windows.flatMap(window => visualSampleTimes(window).map(at => ({ windowId: window.id, at, dataUrl: JPEG }))) });
const sampled = () => {
  const batch = raw();
  for (let index = 0; index < batch.frames.length; index += 20) batch.frames[index].contactSheet = { startIndex: index, endIndex: Math.min(index + 20, batch.frames.length), dataUrl: JPEG };
  return batch;
};

describe("complete visual contact-sheet transport", () => {
  it("retains all sixty timestamps with three images and keeps original samples unchanged", () => {
    const batch = sampled(), before = JSON.stringify(batch), packed = visualBatchForTransport(batch);
    expect(packed.contactSheets).toHaveLength(3);
    expect(packed.frames).toEqual(batch.frames.map(({ windowId, at }) => ({ windowId, at, dataUrl: "" })));
    expect(packed.contactSheets!.map(sheet => [sheet.startIndex, sheet.endIndex])).toEqual([[0,20],[20,40],[40,60]]);
    expect(validVisualBatch(packed)).toBe(true);
    expect(JSON.stringify(batch)).toBe(before);
  });
  it("refuses gaps, duplicate coverage, reordered sheets, URLs and invented sample positions", () => {
    const packed = visualBatchForTransport(sampled());
    expect(validVisualBatch({ ...packed, contactSheets: packed.contactSheets!.slice(1) })).toBe(false);
    expect(validVisualBatch({ ...packed, contactSheets: [...packed.contactSheets!].reverse() })).toBe(false);
    expect(validVisualBatch({ ...packed, contactSheets: packed.contactSheets!.map(sheet => ({ ...sheet, endIndex: sheet.endIndex - 1 })) })).toBe(false);
    expect(validVisualBatch({ ...packed, contactSheets: packed.contactSheets!.map(sheet => ({ ...sheet, dataUrl: "https://internal/private" })) })).toBe(false);
    expect(validVisualBatch({ ...packed, frames: packed.frames.map(frame => ({ ...frame, at: frame.at + 1 })) })).toBe(false);
    expect(validVisualBatch({ ...packed, optIn: false })).toBe(false);
  });
  it("retains legacy requests and rejects partial packed output", () => {
    const legacy = raw(); expect(visualBatchForTransport(legacy)).toBe(legacy);
    const partial = sampled(); delete partial.frames[20].contactSheet;
    expect(() => visualBatchForTransport(partial)).toThrow("visual_frames_invalid");
  });
});
