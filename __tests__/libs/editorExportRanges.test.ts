import { clipExportRanges, exportTimeRange, exportAudioSegment } from "../../libs/editor/exportRanges";
import type { MediaClip, ProjectSnapshot } from "../../libs/editor/types";

const clip: MediaClip = { id: "v", trackId: "visual", kind: "video", mediaId: "source", start: 7, duration: 4, trimIn: 2, speed: 2, audio: { volume: 0.8, fadeIn: 2, fadeOut: 1 } };
const project = { title: "Ten cuts", tracks: [{ id: "visual", kind: "video" }, { id: "hidden", kind: "video", hidden: true }], clips: Array.from({ length: 10 }, (_, i) => ({ ...clip, id: `v${i}`, start: i, duration: 1, trimIn: i })) } as ProjectSnapshot;

describe("individual clip downloads", () => {
  it("exports ten one-second content ranges in timeline order without changing the source project", () => {
    const before = JSON.stringify(project);
    const ranges = clipExportRanges({ ...project, clips: [...project.clips].reverse() });
    expect(ranges).toHaveLength(10);
    expect(ranges.map(r => [r.start, r.end])).toEqual(Array.from({ length: 10 }, (_, i) => [i, i + 1]));
    expect(new Set(ranges.map(r => r.name)).size).toBe(10);
    expect(ranges[9].name).toBe("Ten_cuts-clip-010");
    expect(JSON.stringify(project)).toBe(before);
    expect(clipExportRanges(project, ["v3"])).toEqual([{ clipId: "v3", start: 3, end: 4, name: "Ten_cuts-clip-001" }]);
    expect(clipExportRanges(project, [])).toEqual([]);
  });
  it("omits hidden video layers, sound layers and missing selections", () => {
    const clips = [...project.clips, { ...clip, id: "hidden", trackId: "hidden" }, { ...clip, id: "sound", kind: "audio" } as MediaClip, { ...clip, id: "off", hidden: true }];
    expect(clipExportRanges({ ...project, clips })).toHaveLength(10);
    expect(clipExportRanges(project, ["missing"])).toEqual([]);
  });
  it("validates an exact global range and refuses invalid bounds", () => {
    expect(exportTimeRange(10, { start: 3, end: 4 })).toEqual({ start: 3, end: 4, duration: 1 });
    expect(exportTimeRange(10)).toEqual({ start: 0, end: 10, duration: 10 });
    for (const range of [{ start: -1, end: 4 }, { start: 4, end: 4 }, { start: 4, end: 11 }, { start: NaN, end: 5 }]) expect(() => exportTimeRange(10, range)).toThrow();
  });
  it("keeps trimmed, speed-adjusted sound and partial fades aligned with the range", () => {
    const segment = exportAudioSegment(clip, 12, { start: 8.5, end: 10.5 })!;
    expect(segment).toMatchObject({ when: 0, offset: 5, sourceSeconds: 4, speed: 2 });
    expect(segment.envelope.map(e => e.time)).toEqual([0, 0.5, 1.5, 2]);
    [0.6, 0.8, 0.8, 0.4].forEach((gain, i) => expect(segment.envelope[i].gain).toBeCloseTo(gain));
    expect(exportAudioSegment(clip, 12, { start: 6, end: 8 })).toMatchObject({ when: 1, offset: 2, sourceSeconds: 2, envelope: [{ time: 1, gain: 0 }, { time: 2, gain: 0.4 }] });
    expect(exportAudioSegment(clip, 3, { start: 8.5, end: 10 })).toBeNull();
    expect(exportAudioSegment({ ...clip, audio: { volume: 0 } }, 12, { start: 7, end: 8 })?.envelope.every(k => k.gain === 0)).toBe(true);
  });
});

import { EDITOR_CANVAS_HTML } from "../../libs/editor/canvasHtml";
it("injects complete range and audio helpers in the native export page", () => {
  expect(EDITOR_CANVAS_HTML).not.toContain("__EXPORT_RANGES_RUNTIME__");
  const script = EDITOR_CANVAS_HTML.slice(EDITOR_CANVAS_HTML.indexOf("<script>") + 8, EDITOR_CANVAS_HTML.lastIndexOf("</script>"));
  expect(() => new Function(script)).not.toThrow();
});

it("keeps Unicode titles and distinct clip indices in archive names", () => {
  const ranges = clipExportRanges({ ...project, title: "🎬東京".repeat(100) });
  expect(new Set(ranges.map(range => range.name)).size).toBe(10);
  expect(ranges[9].name).toMatch(/-clip-010$/);
  expect(ranges.every(range => range.name.startsWith("🎬東京"))).toBe(true);
});
