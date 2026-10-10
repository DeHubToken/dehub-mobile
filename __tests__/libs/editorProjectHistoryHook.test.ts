import { act, cleanup, renderHook } from "@testing-library/react-native";
import { useProjectHistory } from "../../libs/editor/useProjectHistory";
import { projectReviewSnapshotKey } from "../../libs/editor/cloudProjectReview";
import type { ProjectSnapshot } from "../../libs/editor/types";
jest.mock("react-native-css-interop",()=>({createInteropElement:require("react").createElement}));
afterEach(cleanup);
const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value));
const fixture=():ProjectSnapshot=>({id:"device-project",title:"Film",updatedAt:1,settings:{width:1920,height:1080,fps:30,aspectPreset:"16:9",background:"#000000"},
  tracks:[{id:"v",kind:"video",name:"Video",muted:false,hidden:false}],clips:[{id:"a",kind:"video",trackId:"v",mediaId:"device-video",start:0,trimIn:0,duration:10,sourceDuration:20},
  {id:"b",kind:"video",trackId:"v",mediaId:"device-video",start:10,trimIn:0,duration:5,sourceDuration:20}]});
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
