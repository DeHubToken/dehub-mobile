import { fitCaptionTrack, textFitEnabled, textFitPatch, textWrapEnabled, textWrapPatch } from "../../libs/editor/textFit";
import { measuredTextLayout } from "../../libs/editor/textLayout";
import { subtitleLayers, exportSubtitles } from "../../libs/editor/subtitles";
import { makeCloudProjectDocument, parseCloudProjectDocument } from "../../libs/editor/cloudProjectFormat";
import { DEFAULT_SETTINGS, type ProjectSnapshot, type TextClip } from "../../libs/editor/types";

const paragraph = "Keep a copy of the original footage before you edit, then check every caption in both phone and landscape layouts.";
const measure = (line: string, size: number, spacing: number) => Array.from(line).length * (size * 0.56 + spacing);
const projectId = "11111111-1111-4111-8111-111111111111", wallet = "0x" + "a".repeat(40);

function legacyProject(): ProjectSnapshot {
  let id = 0;
  const captions = subtitleLayers([{ start: 1.125, end: 8.25, text: paragraph }, { start: 9, end: 12, text: "Second cue." }], () => String(++id));
  const clips = captions.clips.map(clip => ({ ...clip, maxWidth: undefined, maxHeight: undefined }));
  return { id: projectId, title: "Existing captions", updatedAt: 1, settings: { ...DEFAULT_SETTINGS }, tracks: [captions.track, { id: "title", kind: "text", name: "Title", muted: false, hidden: false }],
    clips: [...clips, { ...clips[0], id: "title", trackId: "title", text: "A separate heading" }] };
}

describe("editable text fitting", () => {
  it("fits an existing manual text layer on phone and landscape without changing its wording, time or requested font", () => {
    const original = legacyProject().clips[0] as TextClip;
    const fitted = { ...original, ...textFitPatch(original, true) };
    expect(textWrapEnabled(fitted)).toBe(true);
    expect(textFitEnabled(fitted)).toBe(true);
    for (const [width, height] of [[360, 640], [640, 360]]) {
      const layout = measuredTextLayout(fitted, width, height, measure);
      expect(layout.lines.join(" ")).toBe(paragraph);
      expect(layout.maxW + layout.pad * 2).toBeLessThanOrEqual(width * 0.9 + 0.02);
      expect(layout.lines.length * layout.lh + layout.pad * 2).toBeLessThanOrEqual(height * 0.3 + 0.02);
    }
    expect(fitted).toMatchObject({ text: original.text, start: original.start, duration: original.duration, fontSize: original.fontSize });
    expect(original.maxWidth).toBeUndefined();
  });

  it("returns to manual lines after disabling wrap, including after cloud serialization and reopen", () => {
    const original = legacyProject(), clip = original.clips[0] as TextClip;
    const wrapped = { ...clip, ...textFitPatch(clip, true) };
    const manual = { ...wrapped, ...textWrapPatch(wrapped, false) };
    const snapshot = { ...original, clips: [manual, ...original.clips.slice(1)] };
    const document = makeCloudProjectDocument(snapshot, projectId, wallet, new Map());
    const restored = parseCloudProjectDocument(JSON.parse(JSON.stringify(document)), wallet).snapshot.clips[0] as TextClip;
    expect(textWrapEnabled(restored)).toBe(false);
    expect(textFitEnabled(restored)).toBe(false);
    expect(restored.maxHeight).toBeUndefined();
    const layout = measuredTextLayout(restored, 360, 640, measure);
    expect(layout.lines).toEqual([paragraph]);
    expect(layout.size).toBeCloseTo(clip.fontSize / 1080 * 640);
    expect(layout.scale).toBe(1);
  });

  it("fits only the selected caption track and keeps subtitle exports, styles, positions and unrelated layers intact", () => {
    const original = legacyProject(), trackId = original.tracks[0].id;
    const beforeSrt = exportSubtitles(original.clips.filter((clip): clip is TextClip => clip.kind === "text" && clip.trackId === trackId), "srt");
    const fitted = fitCaptionTrack(original, trackId);
    expect(fitted).not.toBe(original);
    expect(fitted.clips[2]).toBe(original.clips[2]);
    fitted.clips.slice(0, 2).forEach((clip, index) => {
      expect(clip).toEqual({ ...original.clips[index], maxWidth: 0.9, maxHeight: 0.28 });
    });
    expect(exportSubtitles(fitted.clips.filter((clip): clip is TextClip => clip.kind === "text" && clip.trackId === trackId), "srt")).toBe(beforeSrt);
    expect(fitCaptionTrack(fitted, trackId)).toBe(fitted);
    expect(fitCaptionTrack(original, "title")).toBe(original);
    expect(fitCaptionTrack(original, "missing")).toBe(original);
  });

  it("retains chosen width and height when enabling fitting and clears only height when shrinking is disabled", () => {
    const clip = { ...(legacyProject().clips[0] as TextClip), maxWidth: 0.65, maxHeight: 0.22 };
    expect(textWrapPatch(clip, true)).toEqual({ maxWidth: 0.65 });
    expect(textFitPatch(clip, true)).toEqual({ maxWidth: 0.65, maxHeight: 0.22 });
    const wrappingOnly = { ...clip, ...textFitPatch(clip, false) };
    expect(textWrapEnabled(wrappingOnly)).toBe(true);
    expect(textFitEnabled(wrappingOnly)).toBe(false);
    expect(wrappingOnly.maxWidth).toBe(0.65);
  });
});
