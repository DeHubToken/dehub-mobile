
import { exportSubtitles, parseSubtitles, subtitleClips, subtitleLayers } from "../../libs/editor/subtitles";
describe("subtitle files", () => {
  it("imports multiline SRT and keeps Unicode and millisecond timing", () => {
    const cues = parseSubtitles("\uFEFF1\r\n00:00:01,125 --> 00:00:02,875\r\nHello\r\n世界\r\n\r\n2\r\n00:00:04,000 --> 00:00:05,000\r\nGoodbye");
    expect(cues[0]).toEqual({ start: 1.125, end: 2.875, text: "Hello\n世界" });
    let n = 0; const layers = subtitleLayers(cues, () => String(n++), 2);
    expect(layers.clips[0]).toMatchObject({ start: 3.125, duration: 1.75 });
    expect(parseSubtitles(exportSubtitles(layers.clips, "srt"))[0].start).toBe(3.125);
  });
  it("reads VTT cue ids and settings, ignores notes and rejects invalid times", () => {
    expect(parseSubtitles("WEBVTT\n\nNOTE ignored\n00:00.000 --> 00:01.000\nNot speech\n\ncue-one\n00:01.200 --> 00:03.400 align:start\n<b>Hi</b> &amp; welcome\n\n00:99.000 --> 01:00.000\nBad" )).toEqual([{ start: 1.2, end: 3.4, text: "Hi & welcome" }]);
  });
  it("exports only caption tracks and escapes VTT text", () => {
    const layers = subtitleLayers([{ start: 0, end: 1, text: "A < B & C" }], () => Math.random().toString());
    const title = { ...layers.clips[0], id: "title", trackId: "title-track", text: "Title" };
    expect(subtitleClips([...layers.clips, title], layers.track ? [layers.track] : [])).toHaveLength(1);
    expect(subtitleClips(layers.clips, [{ ...layers.track, hidden: true }])).toHaveLength(0);
    expect(parseSubtitles(exportSubtitles(layers.clips, "srt"))[0].text).toBe("A < B & C");
    const exported = exportSubtitles(layers.clips, "vtt");
    expect(exported).toContain("A &lt; B &amp; C");
    expect(parseSubtitles(exported)[0].text).toBe("A < B & C");
  });
});
