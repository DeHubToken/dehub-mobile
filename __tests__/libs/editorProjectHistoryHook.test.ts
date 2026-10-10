import { act, cleanup, renderHook } from "@testing-library/react-native";
import { useProjectHistory } from "../../libs/editor/useProjectHistory";
import { projectReviewSnapshotKey } from "../../libs/editor/cloudProjectReview";
import type { ProjectSnapshot } from "../../libs/editor/types";
import { projectTask } from "../../libs/editor/projectTask";
jest.mock("react-native-css-interop",()=>({createInteropElement:require("react").createElement}));
afterEach(cleanup);
const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value));
const fixture=():ProjectSnapshot=>({id:"device-project",title:"Film",updatedAt:1,settings:{width:1920,height:1080,fps:30,aspectPreset:"16:9",background:"#000000"},
  tracks:[{id:"v",kind:"video",name:"Video",muted:false,hidden:false}],clips:[{id:"a",kind:"video",trackId:"v",mediaId:"device-video",start:0,trimIn:0,duration:10,sourceDuration:20},
  {id:"b",kind:"video",trackId:"v",mediaId:"device-video",start:10,trimIn:0,duration:5,sourceDuration:20}]});

describe("native processing ownership in the real history hook", () => {
  it("holds receiving throughout a deferred result without batching other commands", async () => {
    const {result}=renderHook(()=>useProjectHistory(fixture()));
    let finish!:()=>void, task!:NonNullable<ReturnType<typeof projectTask>>;
    act(()=>{task=projectTask(result.current.holdEdits())!;});
    const processing=new Promise<void>(resolve=>{finish=resolve;}).then(()=>{
      try { if (task.isCurrent()) {const next=clone(result.current.latest()!);next.clips[0].duration=8;result.current.commit(next);} }
      finally {task.release();}
    });
    expect(()=>result.current.receive(fixture(),projectReviewSnapshotKey(fixture()))).toThrow("project changed");
    const local=fixture();local.title="Local title";act(()=>result.current.commit(local));
    await act(async()=>{finish();await processing;});
    act(()=>result.current.undo());expect(result.current.latest()!.title).toBe("Local title");expect(result.current.latest()!.clips[0].duration).toBe(10);
    act(()=>result.current.undo());expect(result.current.latest()!.title).toBe("Film");expect(result.current.canUndo).toBe(false);expect(result.current.isEditing()).toBe(false);
  });
  it("rejects processing acquired from a stale rendered baseline",()=>{
    const {result}=renderHook(()=>useProjectHistory(fixture()));const next=fixture();next.title="New title";act(()=>result.current.commit(next));
    expect(projectTask(result.current.holdEdits(projectReviewSnapshotKey(fixture())))).toBeNull();expect(result.current.isEditing()).toBe(false);
  });
  it("invalidates an old result after a same-ID reset while retaining a new task",()=>{
    const {result}=renderHook(()=>useProjectHistory(fixture()));let old!:NonNullable<ReturnType<typeof projectTask>>,fresh!:typeof old;
    act(()=>{old=projectTask(result.current.holdEdits())!;result.current.reset(fixture());fresh=projectTask(result.current.holdEdits())!;old.release();});
    expect(old.isCurrent()).toBe(false);expect(fresh.isCurrent()).toBe(true);expect(result.current.isEditing()).toBe(true);
    act(()=>fresh.release());expect(result.current.isEditing()).toBe(false);expect(result.current.canUndo).toBe(false);
  });
  it("invalidates processing and rejects stale acquisition when the workspace unmounts",()=>{
    const {result,unmount}=renderHook(()=>useProjectHistory(fixture()));let task!:NonNullable<ReturnType<typeof projectTask>>;
    act(()=>{task=projectTask(result.current.holdEdits())!;});unmount();
    expect(task.isCurrent()).toBe(false);expect(result.current.holdEdits()).toBeNull();task.release();expect(result.current.canUndo).toBe(false);
  });
  it("releases failure without settling another task or clearing Redo",()=>{
    const {result}=renderHook(()=>useProjectHistory(fixture()));const next=fixture();next.title="Local title";let failed!:NonNullable<ReturnType<typeof projectTask>>,other!:typeof failed;
    act(()=>{result.current.commit(next);result.current.undo();failed=projectTask(result.current.holdEdits())!;other=projectTask(result.current.holdEdits())!;failed.release();failed.release();});
    expect(other.isCurrent()).toBe(true);expect(result.current.canRedo).toBe(true);act(()=>{other.release();result.current.redo();});expect(result.current.latest()!.title).toBe("Local title");
  });
});
describe("native shared timeline history adapter",()=>{
  it("keeps local Undo and Redo while received edits remain in each state",()=>{
    const {result}=renderHook(()=>useProjectHistory(fixture()));let first=fixture();first.title="Local title";
    act(()=>result.current.commit(first));let second=clone(first);second.title="Next local title";act(()=>result.current.commit(second));act(()=>result.current.undo());
    const before=result.current.latest()!,incoming=clone(before);incoming.clips[1].duration=4;
    act(()=>result.current.receive(incoming,projectReviewSnapshotKey(before)));expect(result.current.canUndo).toBe(true);expect(result.current.canRedo).toBe(true);
    act(()=>result.current.redo());expect(result.current.latest()?.title).toBe("Next local title");expect(result.current.latest()?.clips[1].duration).toBe(4);
    act(()=>result.current.undo());act(()=>result.current.undo());expect(result.current.latest()?.title).toBe("Film");expect(result.current.latest()?.clips[1].duration).toBe(4);
  });
  it("updates latest immediately within the same event for commit, Undo, Redo and reset",()=>{
    const {result}=renderHook(()=>useProjectHistory(fixture()));const next=fixture();next.title="Changed";
    act(()=>{result.current.commit(next);expect(result.current.latest()?.title).toBe("Changed");result.current.undo();expect(result.current.latest()?.title).toBe("Film");result.current.redo();expect(result.current.latest()?.title).toBe("Changed");result.current.reset(fixture());expect(result.current.latest()?.title).toBe("Film");});
  });
  it("refuses to change the timeline while a canvas gesture is still unsettled",()=>{
    const {result}=renderHook(()=>useProjectHistory(fixture()));const next=fixture();next.clips[0].start=1;act(()=>result.current.live(next));
    expect(()=>result.current.receive(next,projectReviewSnapshotKey(next))).toThrow("project changed");act(()=>result.current.settle());
    act(()=>{expect(()=>result.current.receive(next,projectReviewSnapshotKey(next))).not.toThrow();});
  });
  it("rejects a stale capture before replacing the current project or history",()=>{
    const {result}=renderHook(()=>useProjectHistory(fixture()));const old=fixture(),next=fixture();next.title="New local edit";act(()=>result.current.commit(next));
    expect(()=>result.current.receive(old,projectReviewSnapshotKey(old))).toThrow("project changed");expect(result.current.latest()?.title).toBe("New local edit");expect(result.current.canUndo).toBe(true);
  });
  it("keeps received deletions removed after local Undo",()=>{
    const {result}=renderHook(()=>useProjectHistory(fixture()));const local=fixture();local.clips[0].start=1;act(()=>result.current.commit(local));const incoming=clone(local);incoming.clips.pop();
    act(()=>result.current.receive(incoming,projectReviewSnapshotKey(local)));act(()=>result.current.undo());expect(result.current.latest()?.clips.map(clip=>clip.id)).toEqual(["a"]);
  });
  it("does not retain a gesture base or old history after a project reset",()=>{
    const {result}=renderHook(()=>useProjectHistory(fixture()));act(()=>result.current.live(fixture()));const next=fixture();next.id="other-project";act(()=>result.current.reset(next));
    act(()=>result.current.receive(next,projectReviewSnapshotKey(next)));expect(result.current.latest()?.id).toBe("other-project");expect(result.current.canUndo).toBe(false);expect(result.current.canRedo).toBe(false);
  });
});


describe("scoped gesture readiness in the native history hook", () => {
  it("blocks receiving before the first frame without creating an Undo step", () => {
    const {result} = renderHook(() => useProjectHistory(fixture())); let lease!: NonNullable<ReturnType<typeof result.current.holdEdits>>;
    act(() => {lease=result.current.holdEdits(projectReviewSnapshotKey(fixture()))!;}); expect(result.current.isEditing()).toBe(true);
    expect(() => result.current.receive(fixture(), projectReviewSnapshotKey(fixture()))).toThrow("project changed"); expect(result.current.canUndo).toBe(false);
    act(() => {result.current.settle(); lease.release();}); expect(result.current.isEditing()).toBe(false);
    act(() => {expect(() => result.current.receive(fixture(), projectReviewSnapshotKey(fixture()))).not.toThrow();});
  });
  it("keeps ownership until all overlapping gesture holds are released", () => {
    const {result} = renderHook(() => useProjectHistory(fixture())); let first!: NonNullable<ReturnType<typeof result.current.holdEdits>>, second!: typeof first;
    act(() => {first=result.current.holdEdits()!; second=result.current.holdEdits()!; first.release(); first.release();}); expect(second.isCurrent()).toBe(true);
    expect(() => result.current.receive(fixture(), projectReviewSnapshotKey(fixture()))).toThrow("project changed");
    act(() => second.release()); expect(result.current.isEditing()).toBe(false);
  });
  it("does not acquire ownership for a stale rendered baseline", () => {
    const {result} = renderHook(() => useProjectHistory(fixture())); const changed = fixture(); changed.title="New title"; act(() => result.current.commit(changed));
    expect(result.current.holdEdits(projectReviewSnapshotKey(fixture()))).toBeNull(); expect(result.current.isEditing()).toBe(false);
  });
  it("keeps a real drag as one Undo step with received fields preserved", () => {
    const {result} = renderHook(() => useProjectHistory(fixture())); let lease!: NonNullable<ReturnType<typeof result.current.holdEdits>>;
    const first=fixture(),second=fixture(); first.clips[0].start=1; second.clips[0].start=2;
    act(() => {lease=result.current.holdEdits()!; result.current.live(first); result.current.live(second); result.current.settle(); lease.release();});
    expect(result.current.canUndo).toBe(true); const before=result.current.latest()!,incoming=clone(before); incoming.clips[1].duration=4;
    act(() => result.current.receive(incoming, projectReviewSnapshotKey(before))); act(() => result.current.undo());
    expect(result.current.latest()?.clips[0].start).toBe(0); expect(result.current.latest()?.clips[1].duration).toBe(4); expect(result.current.canUndo).toBe(false);
  });
  it("settles a return-to-origin drag without losing Redo or leaving receiving blocked", () => {
    const {result} = renderHook(() => useProjectHistory(fixture())); const local=fixture(); local.title="Local title"; act(() => {result.current.commit(local); result.current.undo();});
    let lease!: NonNullable<ReturnType<typeof result.current.holdEdits>>; const moved=fixture(); moved.clips[0].start=1;
    act(() => {lease=result.current.holdEdits()!; result.current.live(moved); result.current.live(fixture()); result.current.settle(); lease.release();});
    expect(result.current.canUndo).toBe(false); expect(result.current.canRedo).toBe(true); expect(result.current.isEditing()).toBe(false);
    act(() => result.current.receive(fixture(), projectReviewSnapshotKey(fixture()))); act(() => result.current.redo()); expect(result.current.latest()?.title).toBe("Local title");
  });
  it("keeps a cancelled partial drag undoable after releasing its ownership", () => {
    const {result} = renderHook(() => useProjectHistory(fixture())); let lease!: NonNullable<ReturnType<typeof result.current.holdEdits>>; const moved=fixture(); moved.clips[0].start=1;
    act(() => {lease=result.current.holdEdits()!; result.current.live(moved); result.current.settle(); lease.release();}); expect(result.current.isEditing()).toBe(false);
    act(() => result.current.undo()); expect(result.current.latest()?.clips[0].start).toBe(0);
  });
  it("invalidates old same-project ownership without releasing a newer gesture after reset", () => {
    const {result} = renderHook(() => useProjectHistory(fixture())); let old!: NonNullable<ReturnType<typeof result.current.holdEdits>>, fresh!: typeof old;
    act(() => {old=result.current.holdEdits()!; result.current.reset(fixture()); fresh=result.current.holdEdits()!; old.release();});
    expect(old.isCurrent()).toBe(false); expect(fresh.isCurrent()).toBe(true); expect(result.current.isEditing()).toBe(true);
    act(() => fresh.release()); expect(result.current.canUndo).toBe(false); expect(result.current.isEditing()).toBe(false);
  });
  it("ignores a stale frame from another project after reset", () => {
    const {result} = renderHook(() => useProjectHistory(fixture())); const other=fixture(); other.id="other-project"; const oldFrame=fixture(); oldFrame.clips[0].start=9;
    act(() => {result.current.reset(other); result.current.live(oldFrame);}); expect(result.current.latest()?.id).toBe("other-project"); expect(result.current.latest()?.clips[0].start).toBe(0); expect(result.current.isEditing()).toBe(false);
  });
});

it("keeps the original drag Undo when measured source facts replace the current frame", () => {
  const {result}=renderHook(() => useProjectHistory(fixture())); const moved=fixture(); moved.clips[0].start=2;
  let lease!: NonNullable<ReturnType<typeof result.current.holdEdits>>;
  act(() => {lease=result.current.holdEdits()!; result.current.live(moved);});
  const measured=clone(result.current.latest()!); (measured.clips[0] as import("../../libs/editor/types").MediaClip).sourceDuration=30;
  act(() => {result.current.replace(measured); result.current.settle(); lease.release();});
  act(() => result.current.undo()); expect(result.current.latest()?.clips[0].start).toBe(0);
  expect((result.current.latest()?.clips[0] as import("../../libs/editor/types").MediaClip).sourceDuration).toBe(30);
});
