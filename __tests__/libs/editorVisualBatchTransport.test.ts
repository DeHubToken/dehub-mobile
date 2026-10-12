import { visualBatchForTransport } from "../../libs/editor/visualBatchTransport";
import { validVisualBatch, visualSampleTimes, type VisualBatch } from "../../libs/editor/visualHighlightContract";
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAsICAoIBwsKCQoNDAsNERwSEQ8PESIZGhQcKSQrKigkJyctMkA3LTA9MCcnOEw5PUNFSElIKzZPVU5GVEBHSEX/2wBDAQwNDREPESESEiFFLicuRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUX/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDMooorjPmD/9k=";

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
