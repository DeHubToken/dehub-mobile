import { measuredTextLayout, type MeasuredTextStyle } from "../../libs/editor/textLayout";
import { TEXT_LAYOUT_RUNTIME } from "../../libs/editor/textLayoutRuntime";
import { subtitleLayers, exportSubtitles, parseSubtitles } from "../../libs/editor/subtitles";
import { EDITOR_CANVAS_HTML } from "../../libs/editor/canvasHtml";
import { captionLayers } from "../../libs/editor/captionLayout";

const nativeLayout = new Function(TEXT_LAYOUT_RUNTIME + "; return measuredTextLayout;")() as typeof measuredTextLayout;
const measure = (line: string, size: number, spacing: number) => Array.from(line).length * (size * 0.56 + spacing);
const paragraph = "My first tip is to back up your videos before editing. Keep one copy on a separate drive so a mistake cannot destroy your originals.";
const style = (patch: Partial<MeasuredTextStyle> = {}): MeasuredTextStyle => ({ text: paragraph, fontSize: 64, x: 0.5, y: 0.84, align: "centre", maxWidth: 0.9, maxHeight: 0.28, stroke: { width: 8 }, ...patch });

describe("measured caption layout", () => {
  it("fits the full paragraph in landscape, square and portrait without changing the source", () => {
    const source = style();
    for (const [W, H] of [[640, 360], [1080, 1080], [360, 640], [2160, 3840]]) {
      const result = measuredTextLayout(source, W, H, measure);
      expect(result.lines.length).toBeGreaterThan(1);
      expect(result.lines.join(" ")).toBe(paragraph);
      expect(result.maxW + result.pad * 2).toBeLessThanOrEqual(W * 0.9 + 0.02);
      expect(result.lines.length * result.lh + result.pad * 2).toBeLessThanOrEqual(H * 0.28 + 0.02);
      expect(result.size).toBeLessThanOrEqual(64 / 1080 * H);
      expect(nativeLayout(source, W, H, measure)).toEqual(result);
    }
    expect(source.text).toBe(paragraph);
  });

  it("retains explicit line breaks, empty lines, long tokens and graphemes", () => {
    const text = "Heading\n\n" + "資料".repeat(45) + "👨‍👩‍👧‍👦".repeat(6);
    const result = measuredTextLayout(style({ text }), 360, 640, measure);
    expect(result.lines[0]).toBe("Heading");
    expect(result.lines[1]).toBe("");
    expect(result.lines.slice(2).join("")).toBe(text.slice("Heading\n\n".length));
    expect(result.lines.some(line => line.startsWith("\u200d") || line.endsWith("\u200d"))).toBe(false);
    expect(result.maxW + result.pad * 2).toBeLessThanOrEqual(324.02);
    expect(nativeLayout(style({ text }), 360, 640, measure)).toEqual(result);
  });

  it("includes background, spacing and outline in the fitted bounds near page edges", () => {
    const source = style({ x: 0.1, y: 0.94, align: "left", uppercase: true, letterSpacing: 10, background: { padding: 30 }, stroke: { width: 60 } });
    const result = measuredTextLayout(source, 360, 640, measure);
    expect(result.lines.join(" ")).toBe(paragraph.toUpperCase());
    expect(result.maxW + result.pad * 2).toBeLessThanOrEqual(360 * 0.88 + 0.02);
    expect(result.lines.length * result.lh + result.pad * 2).toBeLessThanOrEqual(640 * 0.1 + 0.02);
    expect(result.spacing).toBeCloseTo(10 / 1080 * 640 * result.scale);
    expect(nativeLayout(source, 360, 640, measure)).toEqual(result);
  });

  it("keeps earlier text layers at their manual line breaks and requested font size", () => {
    const source = style({ maxWidth: undefined, maxHeight: undefined, text: paragraph + "\nSecond line" });
    const result = measuredTextLayout(source, 360, 640, measure);
    expect(result.lines).toEqual([paragraph, "Second line"]);
    expect(result.size).toBeCloseTo(64 / 1080 * 640);
    expect(result.scale).toBe(1);
  });

  it("does not alter SRT/VTT text, cue times or speech timing when captions gain wrapping bounds", () => {
    let id = 0;
    const imported = subtitleLayers([{ start: 1.125, end: 8.25, text: paragraph }], () => String(++id));
    expect(imported.clips[0]).toMatchObject({ maxWidth: 0.9, maxHeight: 0.28 });
    for (const format of ["srt", "vtt"] as const) {
      expect(parseSubtitles(exportSubtitles(imported.clips, format))).toEqual([{ start: 1.125, end: 8.25, text: paragraph }]);
    }
    const automatic = captionLayers({ id: "v", trackId: "v", kind: "video", mediaId: "m", trimIn: 0, start: 4, duration: 8, speed: 2 }, [{ text: "Keep this.", start: 1, end: 3 }], () => String(++id));
    expect(automatic.clips[0]).toMatchObject({ start: 4.5, maxWidth: 0.9, maxHeight: 0.28 });
    expect(automatic.clips[0].duration).toBeCloseTo(1.15);
  });
});

it("embeds the measured caption layout in a valid native canvas program", () => {
  expect(EDITOR_CANVAS_HTML).not.toContain("__TEXT_LAYOUT_RUNTIME__");
  expect(EDITOR_CANVAS_HTML).toContain(TEXT_LAYOUT_RUNTIME);
  const script = EDITOR_CANVAS_HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  expect(() => new Function(script!)).not.toThrow();
});
