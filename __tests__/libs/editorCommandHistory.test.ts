import { act, cleanup, renderHook } from "@testing-library/react-native";
import { useProjectHistory } from "../../libs/editor/useProjectHistory";
import { projectReviewSnapshotKey } from "../../libs/editor/cloudProjectReview";
import { applyOps } from "../../libs/editor/agent";
import { getTransform } from "../../libs/editor/project";
import type { ProjectSnapshot, MediaClip, ClipTransform } from "../../libs/editor/types";
jest.mock("react-native-css-interop", () => ({ createInteropElement: require("react").createElement }));
afterEach(cleanup);
const fixture = (): ProjectSnapshot => ({ id: "command-project", title: "Commands", updatedAt: 1,
  settings: { width: 1920, height: 1080, fps: 30, aspectPreset: "16:9", background: "#000000" },
  tracks: [{ id: "v", kind: "video", name: "Video", muted: false, hidden: false }],
  clips: ["a", "b"].map((id, index) => ({ id, kind: "video" as const, trackId: "v", mediaId: "source", start: index * 5, trimIn: 0, duration: 5, sourceDuration: 20, transform: { x: 0.5, y: 0.5, scale: 1, opacity: 1, rotation: 0 } })) });
const patch = (snapshot: ProjectSnapshot, id: string, change: Partial<MediaClip> | Partial<ClipTransform>): ProjectSnapshot => ({ ...snapshot, clips: snapshot.clips.map(clip => clip.id === id ? { ...clip, ...("opacity" in change || "rotation" in change ? { transform: { ...getTransform(clip), ...change as Partial<ClipTransform> } } : change) } as MediaClip : clip) });

describe("native command ownership in the actual history hook", () => {
  it("waits for a live gesture and keeps the final independent position with Undo", async () => {
    const { result } = renderHook(() => useProjectHistory(fixture())); let command!: NonNullable<ReturnType<typeof result.current.beginCommand>>;
    act(() => { command = result.current.beginCommand(projectReviewSnapshotKey(fixture()))!; command.capture(() => result.current.commit(patch(result.current.latest()!, "a", { opacity: 0.5 }))); });
    act(() => result.current.live(patch(result.current.latest()!, "b", { rotation: 10 })));
    let resumed = false;
    const completion = command.ready().then(() => { resumed = true; command.capture(() => result.current.commit(patch(result.current.latest()!, "a", { rotation: 20 }))); });
    await act(async () => { await Promise.resolve(); }); expect(resumed).toBe(false);
    await act(async () => { result.current.settle(); await completion; command.release(); });
    act(() => result.current.undo()); expect(getTransform(result.current.latest()!.clips[0])).toMatchObject({ opacity: 1, rotation: 0 }); expect(getTransform(result.current.latest()!.clips[1]).rotation).toBe(10);
    act(() => result.current.undo()); expect(getTransform(result.current.latest()!.clips[1]).rotation).toBe(0);
  });
  it("releases a pending gesture wait when the editor unmounts", async () => {
    const { result, unmount } = renderHook(() => useProjectHistory(fixture())); let command!: NonNullable<ReturnType<typeof result.current.beginCommand>>;
    act(() => { command = result.current.beginCommand(projectReviewSnapshotKey(fixture()))!; result.current.live(patch(result.current.latest()!, "b", { rotation: 10 })); });
    const completion = command.ready().then(() => true, () => false); unmount(); expect(await completion).toBe(false); command.release();
  });
  it("excludes receiving before the command has written any result", () => {
    const { result } = renderHook(() => useProjectHistory(fixture())); let command!: NonNullable<ReturnType<typeof result.current.beginCommand>>;
    act(() => { command = result.current.beginCommand(projectReviewSnapshotKey(fixture()))!; });
    expect(() => result.current.receive(fixture(), projectReviewSnapshotKey(fixture()))).toThrow("project changed");
    act(() => command.release()); expect(result.current.isEditing()).toBe(false); expect(result.current.canUndo).toBe(false);
  });
  it("groups captured command writes without taking an independent edit with Undo", () => {
    const { result } = renderHook(() => useProjectHistory(fixture())); let command!: NonNullable<ReturnType<typeof result.current.beginCommand>>;
    act(() => { command = result.current.beginCommand(projectReviewSnapshotKey(fixture()))!; command.capture(() => result.current.commit(patch(result.current.latest()!, "a", { opacity: 0.5 }))); });
    act(() => result.current.commit(patch(result.current.latest()!, "b", { opacity: 0.7 })));
    act(() => { command.capture(() => result.current.commit(patch(result.current.latest()!, "a", { rotation: 15 }))); command.release(); result.current.undo(); });
    expect(getTransform(result.current.latest()!.clips[0])).toMatchObject({ opacity: 1, rotation: 0 }); expect(getTransform(result.current.latest()!.clips[1]).opacity).toBe(0.7);
    act(() => result.current.undo()); expect(getTransform(result.current.latest()!.clips[1]).opacity).toBe(1);
    act(() => { result.current.redo(); result.current.redo(); }); expect(getTransform(result.current.latest()!.clips[0])).toMatchObject({ opacity: 0.5, rotation: 15 });
  });
  it("preserves a newer independent value on the same field", () => {
    const { result } = renderHook(() => useProjectHistory(fixture())); let command!: NonNullable<ReturnType<typeof result.current.beginCommand>>;
    act(() => { command = result.current.beginCommand(projectReviewSnapshotKey(fixture()))!; command.capture(() => result.current.commit(patch(result.current.latest()!, "a", { opacity: 0.5 }))); });
    act(() => result.current.commit(patch(result.current.latest()!, "a", { opacity: 0.7 })));
    act(() => { command.capture(() => result.current.commit(patch(result.current.latest()!, "a", { rotation: 15 }))); command.release(); result.current.undo(); });
    expect(getTransform(result.current.latest()!.clips[0])).toMatchObject({ opacity: 0.7, rotation: 0 }); act(() => result.current.undo()); expect(getTransform(result.current.latest()!.clips[0]).opacity).toBe(1);
  });
  it("merges an actual delayed command result onto compatible local edits", async () => {
    const base = fixture(), { result } = renderHook(() => useProjectHistory(base)); let command!: NonNullable<ReturnType<typeof result.current.beginCommand>>;
    act(() => { command = result.current.beginCommand(projectReviewSnapshotKey(base))!; });
    let finish!: (media: { id: string; kind: "video"; duration: number }) => void;
    const importing = jest.fn(() => new Promise<{ id: string; kind: "video"; duration: number }>(resolve => { finish = resolve; }));
    const execution = applyOps(base, [{ op: "effects", id: "a", brightness: 1.2 }, { op: "add_stock", kind: "video", query: "ocean" }], { importStock: importing });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); }); expect(importing).toHaveBeenCalled();
    act(() => result.current.commit(patch(result.current.latest()!, "b", { duration: 3 })));
    await act(async () => { finish({ id: "stock", kind: "video", duration: 5 }); const completed = await execution; expect(command.commit(base, completed.project)).toBe(true); command.release(); });
    act(() => result.current.undo()); expect((result.current.latest()!.clips[0] as MediaClip).effects).toBeUndefined(); expect(result.current.latest()!.clips[1].duration).toBe(3); expect(result.current.latest()!.clips).toHaveLength(2);
    act(() => result.current.undo()); expect(result.current.latest()!.clips[1].duration).toBe(5); expect(result.current.isEditing()).toBe(false);
  });
  it("keeps the local draft and history when a completed command overlaps it", async () => {
    const base = fixture(), { result } = renderHook(() => useProjectHistory(base)); let command!: NonNullable<ReturnType<typeof result.current.beginCommand>>;
    act(() => { command = result.current.beginCommand(projectReviewSnapshotKey(base))!; result.current.commit(patch(base, "a", { effects: { brightness: 1.6 } })); });
    const completed = await applyOps(base, [{ op: "effects", id: "a", brightness: 1.2 }]); const local = result.current.latest();
    act(() => { expect(command.commit(base, completed.project)).toBe(false); command.release(); }); expect(result.current.latest()).toBe(local);
    act(() => result.current.undo()); expect((result.current.latest()!.clips[0] as MediaClip).effects).toBeUndefined(); expect(result.current.canUndo).toBe(false);
  });
  it("rejects a stale rendered baseline", () => {
    const { result } = renderHook(() => useProjectHistory(fixture())); act(() => result.current.commit(patch(result.current.latest()!, "b", { duration: 3 })));
    expect(result.current.beginCommand(projectReviewSnapshotKey(fixture()))).toBeNull(); expect(result.current.isEditing()).toBe(false);
  });
  it("rejects a same-ID expired completion without closing a new command", () => {
    const { result } = renderHook(() => useProjectHistory(fixture())); let old!: NonNullable<ReturnType<typeof result.current.beginCommand>>, fresh!: typeof old;
    act(() => { old = result.current.beginCommand(projectReviewSnapshotKey(fixture()))!; result.current.reset(fixture()); fresh = result.current.beginCommand(projectReviewSnapshotKey(fixture()))!; old.release(); });
    expect(old.commit(fixture(), patch(fixture(), "a", { opacity: 0.5 }))).toBe(false); expect(fresh.isCurrent()).toBe(true); expect(result.current.isEditing()).toBe(true); act(() => fresh.release());
  });
  it("invalidates an unmounted command and stale opening callback", () => {
    const { result, unmount } = renderHook(() => useProjectHistory(fixture())); const open = result.current.beginCommand; let command!: NonNullable<ReturnType<typeof open>>;
    act(() => { command = open(projectReviewSnapshotKey(fixture()))!; }); unmount(); expect(command.isCurrent()).toBe(false); expect(open(projectReviewSnapshotKey(fixture()))).toBeNull(); command.release();
  });
  it("retains Redo after a command with an unchanged result", () => {
    const base = fixture(), { result } = renderHook(() => useProjectHistory(base)); act(() => { result.current.commit(patch(base, "b", { duration: 3 })); result.current.undo(); });
    act(() => { const command = result.current.beginCommand(projectReviewSnapshotKey(result.current.latest()!))!; expect(command.commit(base, base)).toBe(true); command.release(); });
    expect(result.current.canRedo).toBe(true); expect(result.current.canUndo).toBe(false); act(() => result.current.redo()); expect(result.current.latest()!.clips[1].duration).toBe(3);
  });
  it("retains Redo when an unchanged placement rewrites field order", () => {
    const base = fixture(), { result } = renderHook(() => useProjectHistory(base));
    act(() => { result.current.commit(patch(base, "b", { duration: 3 })); result.current.undo(); });
    const unchanged = patch(base, "a", { opacity: 1 });
    expect(Object.keys(unchanged.clips[0].transform!)).not.toEqual(Object.keys(base.clips[0].transform!));
    act(() => {
      const command = result.current.beginCommand(projectReviewSnapshotKey(result.current.latest()!))!;
      command.capture(() => result.current.commit(unchanged)); command.release();
    });
    expect(result.current.canRedo).toBe(true); expect(result.current.canUndo).toBe(false);
    act(() => result.current.redo()); expect(result.current.latest()!.clips[1].duration).toBe(3);
  });
  it("cannot revive a pending command by undoing and redoing its captured work", () => {
    const { result } = renderHook(() => useProjectHistory(fixture())); let command!: NonNullable<ReturnType<typeof result.current.beginCommand>>;
    act(() => { command = result.current.beginCommand(projectReviewSnapshotKey(fixture()))!; command.capture(() => result.current.commit(patch(result.current.latest()!, "a", { opacity: 0.5 }))); result.current.undo(); result.current.redo(); });
    expect(command.isCurrent()).toBe(false); expect(command.commit(fixture(), patch(fixture(), "a", { rotation: 30 }))).toBe(false); act(() => command.release()); expect(getTransform(result.current.latest()!.clips[0]).rotation).toBe(0);
  });
});
