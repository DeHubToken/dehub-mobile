import { EDITOR_CANVAS_HTML } from "../../libs/editor/canvasHtml";

function bridge() {
  const program = /<script>([\s\S]*)<\/script>/.exec(EDITOR_CANVAS_HTML)![1];
  const start = program.indexOf("  var videoMatteJob = null;"), end = program.indexOf('  window.addEventListener("pagehide", function() { cancelVideoMatte(); });', start);
  const ackStart = program.indexOf('    } else if (m.type === "videoMattePageSaved") {') + '    } else if (m.type === "videoMattePageSaved") {'.length;
  const ackEnd = program.indexOf('    } else if (m.type === "videoMatteCancel") {', ackStart);
  expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start); expect(ackEnd).toBeGreaterThan(ackStart);
  const messages: { type: string; reqId: string; pageIndex?: number; result?: unknown }[] = [];
  const create = async (_url: string, _clip: unknown, _fps: number, _progress: unknown, _signal: AbortSignal, save: (page: unknown, plan: unknown, index: number) => Promise<string>) => {
    const id = await save({ dataUrl: "data:image/png;base64,AAAA" }, { frames: 601 }, 0);
    return { savedId: id };
  };
  const runtime = new Function("post", "videos", "createVideoMatte", program.slice(start, end) + "function ack(m) {" + program.slice(ackStart, ackEnd) + "} return { processVideoMatte, cancelVideoMatte, ack }; ")((m: typeof messages[number]) => messages.push(m), new Map([["source", { src: "blob:source" }]]), create) as {
    processVideoMatte(m: { reqId: string; clip: { mediaId: string }; fps: number; paged: boolean }): void;
    cancelVideoMatte(id: string): void;
    ack(m: { reqId: string; pageIndex: number; mediaId: string }): void;
  };
  return { runtime, messages };
}

async function flush() { for (let i = 0; i < 6; i++) await Promise.resolve(); }

it("waits for the matching native storage acknowledgement and ignores stale jobs", async () => {
  const { runtime, messages } = bridge();
  runtime.processVideoMatte({ reqId: "current", clip: { mediaId: "source" }, fps: 30, paged: true });
  expect(messages).toEqual([expect.objectContaining({ type: "videoMattePage", reqId: "current", pageIndex: 0 })]);
  runtime.ack({ reqId: "old", pageIndex: 0, mediaId: "stale" });
  runtime.ack({ reqId: "current", pageIndex: 1, mediaId: "wrong-page" });
  await flush(); expect(messages).toHaveLength(1);
  runtime.ack({ reqId: "current", pageIndex: 0, mediaId: "stored" });
  await flush(); expect(messages.at(-1)).toMatchObject({ type: "videoMatteDone", result: { savedId: "stored" } });
});

it("cancels an unacknowledged page and does not report a stale successful result", async () => {
  const { runtime, messages } = bridge();
  runtime.processVideoMatte({ reqId: "cancelled", clip: { mediaId: "source" }, fps: 30, paged: true });
  runtime.cancelVideoMatte("cancelled");
  runtime.ack({ reqId: "cancelled", pageIndex: 0, mediaId: "late" });
  await flush(); expect(messages.map(m => m.type)).toEqual(["videoMattePage"]);
  runtime.processVideoMatte({ reqId: "next", clip: { mediaId: "source" }, fps: 30, paged: true });
  runtime.ack({ reqId: "next", pageIndex: 0, mediaId: "next-stored" });
  await flush(); expect(messages.at(-1)).toMatchObject({ type: "videoMatteDone", reqId: "next" });
});
