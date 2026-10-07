import { audioGainAt } from "../../libs/editor/audioEnvelope";
import { EDITOR_CANVAS_HTML } from "../../libs/editor/canvasHtml";
import type { MediaClip } from "../../libs/editor/types";

describe("native preview audio matches the exported envelope", () => {
  it("matches both fades, silence and muted layers", () => {
    const from = EDITOR_CANVAS_HTML.indexOf("function audioGainAt(");
    const to = EDITOR_CANVAS_HTML.indexOf("function syncMedia(", from);
    const nativeGain = new Function(EDITOR_CANVAS_HTML.slice(from, to) + ";return audioGainAt;")() as typeof audioGainAt;
    const clip: MediaClip = { id: "a", trackId: "a", kind: "audio", mediaId: "m", start: 2, duration: 10, trimIn: 0, audio: { volume: 0.8, fadeIn: 2, fadeOut: 4 } };
    for (const audio of [undefined, { volume: 0 }, { volume: 1, fadeIn: 20, fadeOut: 20 }, clip.audio]) {
      for (const time of [1, 2, 3, 4, 8, 10, 11, 12]) expect(nativeGain({ ...clip, audio }, time)).toBe(audioGainAt({ ...clip, audio }, time));
    }
  });
});
