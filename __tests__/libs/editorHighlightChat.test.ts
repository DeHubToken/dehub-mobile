const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAsICAoIBwsKCQoNDAsNERwSEQ8PESIZGhQcKSQrKigkJyctMkA3LTA9MCcnOEw5PUNFSElIKzZPVU5GVEBHSEX/2wBDAQwNDREPESESEiFFLicuRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUX/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDMooorjPmD/9k=";
import { HighlightChatSession, highlightChatRequest, highlightVisualScope, type HighlightChatRuntime, type HighlightChatState } from "../../libs/editor/highlightChat";
import { visualSampleTimes, validVisualBatch, type VisualWindow, type VisualFrame } from "../../libs/editor/visualHighlightContract";
import { highlightProject, type HighlightRange } from "../../libs/editor/highlights";
import type { CaptionWord } from "../../libs/editor/captionLayout";
import type { MediaClip, ProjectSnapshot } from "../../libs/editor/types";

const clip: MediaClip = { id: "video", kind: "video", mediaId: "source", trackId: "v", start: 7, duration: 30, trimIn: 0 };
const words: CaptionWord[] = [{ text: "Always back up.", start: 2, end: 4 }, { text: "Verify restores.", start: 10, end: 13 }];
const project = (): ProjectSnapshot => ({ id: "original", title: "Source", clips: [clip], tracks: [{ id: "v", kind: "video", name: "Video", hidden: false, muted: false }], settings: { width: 640, height: 360, fps: 30, aspectPreset: "16:9", background: "#000" }, updatedAt: 1 });
const request = { seconds: 30, focus: "", useCaptions: false };
const trims = [{ op: "trim", id: "video", offset: 2, duration: 2, score: 0.9, focusMatch: true }, { op: "trim", id: "video", offset: 10, duration: 3, score: 0.95, focusMatch: true }];
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
function setup(overrides: Partial<HighlightChatRuntime> = {}) {
  let current: ProjectSnapshot | null = project(), transcriptions = 0, plans = 0, creates = 0;
  const states: HighlightChatState[] = [];
  const session = new HighlightChatSession({
    current: () => current,
    transcribe: async () => { transcriptions++; return words; },
    plan: async () => { plans++; return { ops: trims }; },
    create: async (original, clipId, ranges) => { creates++; let n = 0; current = highlightProject(original, clipId, ranges, { id: "copy", title: "Highlights" }, () => `copy-${++n}`); return true; },
    ...overrides,
  }, state => states.push(state));
  return { session, states, current: () => current, change: (next: ProjectSnapshot | null) => { current = next; }, counts: () => ({ transcriptions, plans, creates }) };
}

describe("highlight chat requests", () => {
  it("recognizes direct English and French requests and preserves explicit criteria", () => {
    for (const prompt of ["Find highlights", "Can you find the best moments?", "Please show the best parts", "Could you please extract the strongest moments", "Give me highlights", "I want the best bits", "Create a 15-second highlights edit", "Trouve les meilleurs moments", "Montre les temps forts", "Peux-tu trouver les meilleurs moments", "Je veux les meilleurs passages"]) {
      expect(highlightChatRequest(prompt)).not.toBeNull();
    }
    expect(highlightChatRequest("Find 15 second highlights about backups, not restoring using current captions")).toEqual({ seconds: 15, focus: "backups, not restoring", useCaptions: true });
    expect(highlightChatRequest("Trouve les meilleurs moments sur les sauvegardes avec les sous-titres actuels")).toEqual({ seconds: 30, focus: "les sauvegardes", useCaptions: true });
    expect(highlightChatRequest("Find the funniest highlights")).toMatchObject({ focus: "funniest" });
    expect(highlightChatRequest("Find highlights about " + "x".repeat(500))?.focus).toHaveLength(240);
    expect(highlightChatRequest("Find 45 second highlights")?.seconds).toBe(45);
  });
  it("leaves ordinary timeline edits, title text and unrelated conversation alone", () => {
    for (const prompt of ["Add text saying best moments", "Highlight this title in white", "Remove the background", "Split the video into 10 one second clips", "Find stock clips of backup drives", "Keep moment 2", "Where are my highlights?"]) expect(highlightChatRequest(prompt)).toBeNull();
  });
});

describe("highlight chat session", () => {
  it("finds real transcript suggestions, previews with timeline offset, and leaves the source untouched", async () => {
    const h = setup(), original = h.current();
    expect(await h.session.start(request, [])).toEqual({ status: "found", count: 2, total: 2 });
    expect(h.session.state.chosen).toEqual([0, 1]);
    expect(h.session.preview(0)?.start).toBeCloseTo(8.88); expect(h.session.preview(0)?.end).toBeCloseTo(11.18);
    expect(h.current()).toBe(original); expect(h.counts()).toEqual({ transcriptions: 1, plans: 1, creates: 0 });
    expect(h.session.state.busy).toBe(false); expect(h.session.state.progress).toBeNull();
  });
  it("requires an unambiguous unlocked, visible video without making requests for invalid inputs", async () => {
    for (const change of [
      (p: ProjectSnapshot) => ({ ...p, clips: [] }),
      (p: ProjectSnapshot) => ({ ...p, clips: [{ ...clip, locked: true }] }),
      (p: ProjectSnapshot) => ({ ...p, clips: [{ ...clip, hidden: true }] }),
      (p: ProjectSnapshot) => ({ ...p, tracks: p.tracks.map(track => ({ ...track, hidden: true })) }),
      (p: ProjectSnapshot) => ({ ...p, clips: [clip, { ...clip, id: "other" }] }),
    ]) {
      const h = setup(); h.change(change(project()));
      expect(await h.session.start(request, [])).toEqual({ status: "error", error: "selectVideo" });
      expect(h.counts()).toEqual({ transcriptions: 0, plans: 0, creates: 0 });
    }
    const h = setup(); h.change({ ...project(), clips: [clip, { ...clip, id: "other" }] });
    expect((await h.session.start(request, ["video"])).status).toBe("found");
    expect(await h.session.start(request, ["video", "other"])).toEqual({ status: "error", error: "selectVideo" });
  });
  it("reuses captions only when requested and rejects missing captions or unsupported bounds", async () => {
    const h = setup();
    expect(await h.session.start({ ...request, useCaptions: true }, [])).toEqual({ status: "error", error: "captionsMissing" });
    expect(await h.session.start({ ...request, seconds: 45 }, [])).toEqual({ status: "error", error: "limit" });
    h.change({ ...project(), clips: [{ ...clip, duration: 601 }] });
    expect(await h.session.start(request, [])).toEqual({ status: "error", error: "limit" });
    expect(h.counts()).toEqual({ transcriptions: 0, plans: 0, creates: 0 });
    h.change({ ...project(), tracks: [...project().tracks, { id: "captions", kind: "text", role: "captions", name: "Captions", hidden: false, muted: false }], clips: [clip, ...words.map((word, i) => ({ id: `caption-${i}`, kind: "text" as const, trackId: "captions", start: clip.start + word.start, duration: word.end - word.start, trimIn: 0, text: word.text, x: 0.5, y: 0.8, color: "#fff", fontFamily: "sans-serif", fontSize: 20, fontWeight: 500, align: "centre" as const }))] });
    expect((await h.session.start({ ...request, useCaptions: true }, [])).status).toBe("found");
    expect(h.counts().transcriptions).toBe(0); expect(h.counts().plans).toBe(1);
  });
  it("reviews numbered moments locally, supports Undo selection, and saves only the chosen moments as a separate design", async () => {
    const h = setup(), original = h.current();
    await h.session.start(request, []);
    expect(await h.session.review("remove moment 2")).toEqual({ status: "reviewed", count: 1, total: 2 });
    expect(h.session.state.chosen).toEqual([0]); expect(h.counts().plans).toBe(1);
    expect((await h.session.review("Undo selection")).status).toBe("reviewed"); expect(h.session.state.chosen).toEqual([0, 1]);
    h.session.toggle(0); expect(h.session.state.chosen).toEqual([1]);
    expect(await h.session.create()).toEqual({ status: "created", count: 1, total: 1 });
    expect(h.current()?.id).toBe("copy"); expect(h.current()?.clips).toHaveLength(1);
    expect(original?.clips).toHaveLength(1); expect(original?.clips[0]).toBe(clip);
    expect(h.session.reviewing).toBe(false); expect(h.session.state.clipId).toBeNull();
  });
  it("rejects destructive topic-review output without applying a partial selection", async () => {
    let review = false;
    const h = setup({ plan: async () => review ? { ops: [{ op: "delete", id: "video" }] } : { ops: trims } });
    await h.session.start(request, []); review = true;
    expect(await h.session.review("Keep only backup advice")).toEqual({ status: "error", error: "failed" });
    expect(h.session.state.chosen).toEqual([0, 1]); expect(h.counts().creates).toBe(0);
  });
  it("does not fabricate suggestions for empty speech, empty rankings or failed decoding", async () => {
    const empty = setup({ transcribe: async () => [] });
    expect(await empty.session.start(request, [])).toEqual({ status: "found", count: 0, total: 0 }); expect(empty.counts().plans).toBe(0);
    const unranked = setup({ plan: async () => ({ ops: [] }) });
    expect(await unranked.session.start(request, [])).toEqual({ status: "found", count: 0, total: 0 });
    const failed = setup({ transcribe: async () => { throw new Error("decode failed"); } });
    expect(await failed.session.start(request, [])).toEqual({ status: "error", error: "failed" }); expect(failed.session.state.busy).toBe(false);
  });
  it("cancels a pending decode and ignores its late answer after a new session has succeeded", async () => {
    const late = deferred<CaptionWord[]>(); let calls = 0;
    const h = setup({ transcribe: async (_clip, _progress, signal) => { calls++; if (calls === 1) { expect(signal.aborted).toBe(false); return late.promise; } return words; } });
    const first = h.session.start(request, []); expect(h.session.state.busy).toBe(true);
    expect(await h.session.start(request, [])).toEqual({ status: "cancelled" });
    h.session.cancel(); expect(h.session.state.busy).toBe(false);
    expect((await h.session.start(request, [])).status).toBe("found");
    late.resolve(words); expect(await first).toEqual({ status: "cancelled" });
    expect(h.session.state.ranges).toHaveLength(2); expect(h.counts().plans).toBe(1);
  });
  it("refuses stale decode/ranking results and refuses creation after the source changes", async () => {
    const decoded = deferred<CaptionWord[]>(), decoding = setup({ transcribe: () => decoded.promise });
    const decode = decoding.session.start(request, []);
    decoding.change({ ...decoding.current()!, id: "another-project" }); decoded.resolve(words);
    expect(await decode).toEqual({ status: "error", error: "changed" }); expect(decoding.counts().plans).toBe(0);
    const late = deferred<{ ops: typeof trims }>();
    const h = setup({ plan: () => late.promise });
    const pending = h.session.start(request, []); await Promise.resolve();
    h.change({ ...h.current()!, title: "Changed while ranking" }); late.resolve({ ops: trims });
    expect(await pending).toEqual({ status: "error", error: "changed" }); expect(h.session.state.ranges).toBeNull();
    const fresh = setup(); await fresh.session.start(request, []);
    fresh.change({ ...fresh.current()!, clips: [{ ...clip, trimIn: 4 }] });
    expect(await fresh.session.create()).toEqual({ status: "error", error: "changed" }); expect(fresh.counts().creates).toBe(0);
    expect(fresh.session.preview(0)).toBeNull(); fresh.session.toggle(0); expect(fresh.session.state.chosen).toEqual([0, 1]);
  });
  it("cancels topic review and creation without resurrecting reset suggestions", async () => {
    const late = deferred<{ ops: { op: string; id: string }[] }>(); let ranking = true;
    const h = setup({ plan: async () => ranking ? { ops: trims } : late.promise });
    await h.session.start(request, []); ranking = false;
    const pending = h.session.review("Only backups"); h.session.reset();
    late.resolve({ ops: [{ op: "select", id: "highlight-1" }] });
    expect(await pending).toEqual({ status: "cancelled" }); expect(h.session.state.clipId).toBeNull();
    const saved = deferred<boolean>(); let signal: AbortSignal | null = null;
    const create = setup({ create: async (_original, _id, _ranges, abort) => { signal = abort; return saved.promise; } });
    await create.session.start(request, []);
    const creating = create.session.create(); create.session.reset();
    expect(signal!.aborted).toBe(true); saved.resolve(false);
    expect(await creating).toEqual({ status: "cancelled" }); expect(create.session.state.clipId).toBeNull();
  });
});

const visualFrames = (windows: VisualWindow[]): VisualFrame[] => windows.flatMap(window => visualSampleTimes(window).map(at => ({ windowId: window.id, at, dataUrl: JPEG })));
const visualRanges: HighlightRange[] = [{ start: 0, end: 6, score: 0.9, text: "The cover starts lifting" }, { start: 6, end: 12, score: 0.98, text: "The red block is revealed" }];

describe("opt-in visual highlight chat", () => {
  it("keeps ordinary requests on speech and never samples frames without opt-in", async () => {
    let visualCalls = 0;
    const h = setup({ visual: { sample: async () => { visualCalls++; return []; }, analyse: async () => { visualCalls++; return []; } } });
    expect((await h.session.start(request, [])).status).toBe("found");
    expect(visualCalls).toBe(0); expect(h.counts()).toEqual({ transcriptions: 1, plans: 1, creates: 0 });
  });
  it("ranks real frame windows for silent footage without speech or caption requests", async () => {
    let samples = 0, analyses = 0;
    const h = setup({ visual: {
      sample: async (source, windows) => { samples++; expect(source).toBe(clip); return visualFrames(windows); },
      analyse: async batch => {
        analyses++; expect(validVisualBatch(batch)).toBe(true); expect(batch.optIn).toBe(true);
        expect(batch.focus).toBe("The red block reveal"); expect(batch.seconds).toBe(15);
        expect(Object.keys(batch).sort()).toEqual(["duration", "focus", "frames", "optIn", "seconds", "windows"].sort());
        return visualRanges;
      },
    } });
    const original = h.current();
    expect(await h.session.start({ ...request, useVisual: true, visualScope: highlightVisualScope(project(), []), useCaptions: true, seconds: 15, focus: "The red block reveal" }, [])).toEqual({ status: "found", count: 2, total: 2 });
    expect(samples).toBe(1); expect(analyses).toBe(1); expect(h.counts()).toEqual({ transcriptions: 0, plans: 0, creates: 0 });
    expect(h.session.preview(1)).toEqual({ start: 13, end: 19 }); expect(h.current()).toBe(original);
    expect(await h.session.review("Remove moment 1")).toEqual({ status: "reviewed", count: 1, total: 2 });
    expect(await h.session.create()).toEqual({ status: "created", count: 1, total: 1 });
    expect(h.current()?.id).toBe("copy"); expect(original?.id).toBe("original"); expect(original?.clips[0]).toBe(clip);
  });
  it("refuses unavailable visual analysis without falling back to transcription", async () => {
    const h = setup();
    expect(await h.session.start({ ...request, useVisual: true, visualScope: highlightVisualScope(project(), []) }, [])).toEqual({ status: "error", error: "failed" });
    expect(h.counts()).toEqual({ transcriptions: 0, plans: 0, creates: 0 });
  });
  it("refuses source changes between frame sampling and the provider request", async () => {
    let providerCalls = 0;
    const h = setup({ visual: {
      sample: async (_source, windows) => { h.change({ ...project(), title: "Changed during sampling" }); return visualFrames(windows); },
      analyse: async () => { providerCalls++; return visualRanges; },
    } });
    expect(await h.session.start({ ...request, useVisual: true, visualScope: highlightVisualScope(project(), []) }, [])).toEqual({ status: "error", error: "changed" });
    expect(providerCalls).toBe(0); expect(h.session.state.ranges).toBeNull(); expect(h.counts().transcriptions).toBe(0);
  });
  it("ignores a late provider response after cancellation and keeps retries explicit", async () => {
    const late = deferred<HighlightRange[]>(); let calls = 0; let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const h = setup({ visual: { sample: async (_source, windows) => visualFrames(windows), analyse: async () => { calls++; started(); return late.promise; } } });
    const pending = h.session.start({ ...request, useVisual: true, visualScope: highlightVisualScope(project(), []) }, []); await ready;
    h.session.cancel(); late.resolve(visualRanges);
    expect(await pending).toEqual({ status: "cancelled" }); expect(calls).toBe(1); expect(h.session.state.ranges).toBeNull(); expect(h.session.state.busy).toBe(false);
  });
  it("does not retry a provider error or substitute a speech-only result", async () => {
    let calls = 0;
    const h = setup({ visual: { sample: async (_source, windows) => visualFrames(windows), analyse: async () => { calls++; throw new Error("payment_required"); } } });
    expect(await h.session.start({ ...request, useVisual: true, visualScope: highlightVisualScope(project(), []) }, [])).toEqual({ status: "error", error: "failed" });
    expect(calls).toBe(1); expect(h.counts()).toEqual({ transcriptions: 0, plans: 0, creates: 0 }); expect(h.session.state.ranges).toBeNull();
  });
  it("rejects unsupported visual duration and ambiguous selections before sampling", async () => {
    let calls = 0;
    const h = setup({ visual: { sample: async () => { calls++; return []; }, analyse: async () => { calls++; return []; } } });
    h.change({ ...project(), clips: [clip, { ...clip, id: "second" }] });
    expect(await h.session.start({ ...request, useVisual: true, visualScope: highlightVisualScope(project(), []) }, [])).toEqual({ status: "error", error: "selectVideo" });
    h.change({ ...project(), clips: [{ ...clip, duration: 800, speed: 0.5 }] });
    expect(await h.session.start({ ...request, useVisual: true, visualScope: highlightVisualScope(project(), []) }, [])).toEqual({ status: "error", error: "limit" });
    expect(calls).toBe(0); expect(h.counts()).toEqual({ transcriptions: 0, plans: 0, creates: 0 });
  });
});

it("requires visual consent for the current project, selection and source assets", async () => {
  let calls = 0;
  const h = setup({ visual: { sample: async () => { calls++; return []; }, analyse: async () => { calls++; return []; } } });
  expect(await h.session.start({ ...request, useVisual: true }, [])).toEqual({ status: "error", error: "changed" });
  const consent = highlightVisualScope(project(), []);
  h.change({ ...project(), clips: [{ ...clip, mediaId: "replacement" }] });
  expect(await h.session.start({ ...request, useVisual: true, visualScope: consent }, [])).toEqual({ status: "error", error: "changed" });
  h.change(project());
  expect(await h.session.start({ ...request, useVisual: true, visualScope: consent }, ["video"])).toEqual({ status: "error", error: "changed" });
  expect(calls).toBe(0); expect(h.counts().transcriptions).toBe(0);
});
