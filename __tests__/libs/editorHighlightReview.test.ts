import { highlightSelectionCommand, reviewHighlights } from "../../libs/editor/highlightReview";
const ranges = [
  { start: 1.88, end: 4.18, text: "Always back up your work.", score: 0.9 },
  { start: 9.88, end: 13.18, text: "Test that you can restore it.", score: 0.95 },
  { start: 17, end: 19, text: "Keep a second backup elsewhere.", score: 0.8 },
];
const noRequest = async () => { throw new Error("unexpected request"); };

describe("highlight review", () => {
  it("keeps numbered moments, removes from the current selection and restores all locally", async () => {
    expect(await reviewHighlights(ranges, [0, 1, 2], "keep 1 and 3", noRequest)).toEqual([0, 2]);
    expect(await reviewHighlights(ranges, [0, 2], "remove last", noRequest)).toEqual([0]);
    expect(await reviewHighlights(ranges, [], "restore all", noRequest)).toEqual([0, 1, 2]);
    expect(await reviewHighlights(ranges, [0], "drop all", noRequest)).toEqual([]);
    expect(highlightSelectionCommand("retire le moment 2", 3, [0, 1])).toEqual([0]);
    expect(highlightSelectionCommand("retire moment 2", 3, [0, 1])).toEqual([0]);
    expect(highlightSelectionCommand("keep backups, not restores", 3, [0, 1])).toBeNull();
    await expect(reviewHighlights(ranges, [0], "keep 9", noRequest)).rejects.toThrow("highlight_review_invalid");
  });

  it("ranks only existing evidence suggestions and returns complete checked selection", async () => {
    const before = JSON.stringify(ranges);
    const result = await reviewHighlights(ranges, [1], "Keep only the backup tips", async (messages, raw) => {
      expect(messages[0].content).toContain("COMPLETE final selection");
      expect(messages[0].content).toContain("Keep only the backup tips");
      const scene = raw as { capabilities: string[]; selected: string[]; layers: { id: string; evidence: string }[] };
      expect(scene.capabilities).toEqual(["select"]);
      expect(scene.selected).toEqual(["highlight-2"]);
      expect(scene.layers.map(layer => layer.evidence)).toEqual(ranges.map(range => range.text));
      return { ops: [{ op: "select", id: "highlight-3" }, { op: "select", id: "highlight-1" }, { op: "select", id: "highlight-1" }] };
    });
    expect(result).toEqual([0, 2]); expect(JSON.stringify(ranges)).toBe(before);
    expect(await reviewHighlights(ranges, [0, 1], "Only weather", async () => ({ ops: [] }))).toEqual([]);
  });

  it("rejects fabricated ids, destructive operations and malformed results without a partial selection", async () => {
    for (const op of [{ op: "select", id: "source-video" }, { op: "trim", id: "highlight-1", offset: 0, duration: 1 }, null]) {
      await expect(reviewHighlights(ranges, [0, 1], "Only backups", async () => ({ ops: [{ op: "select", id: "highlight-1" }, op] as never }))).rejects.toThrow("highlight_review_invalid");
    }
    await expect(reviewHighlights(ranges, [0], "Only backups", async () => ({ ops: null as never }))).rejects.toThrow("highlight_review_invalid");
  });

  it("cancels before or after the response and refuses oversized or invalid review scenes", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(reviewHighlights(ranges, [0], "select all", noRequest, controller.signal)).rejects.toThrow("cancelled");
    const during = new AbortController();
    await expect(reviewHighlights(ranges, [0], "Only backups", async () => { during.abort(); return { ops: [] }; }, during.signal)).rejects.toThrow("cancelled");
    await expect(reviewHighlights([{ ...ranges[0], text: "x".repeat(13000) }], [0], "Only backups", noRequest)).rejects.toThrow("highlight_limit");
    await expect(reviewHighlights(ranges, [3], "select all", noRequest)).rejects.toThrow("highlight_review_invalid");
    await expect(reviewHighlights(ranges, [0], "x".repeat(801), noRequest)).rejects.toThrow("highlight_review_invalid");
  });
});
