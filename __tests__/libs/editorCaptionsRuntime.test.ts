import { CAPTIONS_WORKER } from "../../libs/editor/captionsWorker";
import { EDITOR_CANVAS_HTML } from "../../libs/editor/canvasHtml";

it("embeds the speech worker as data and emits a valid canvas program", () => {
  expect(CAPTIONS_WORKER).toContain("return_timestamps: 'word'");
  expect(EDITOR_CANVAS_HTML).not.toContain("__CAPTIONS_WORKER_SOURCE__");
  const script = EDITOR_CANVAS_HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  expect(script).toBeTruthy();
  expect(() => new Function(script!)).not.toThrow();
});
