import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react-native";
import { useProjectHistory } from "../../libs/editor/useProjectHistory";
import { projectReviewSnapshotKey } from "../../libs/editor/cloudProjectReview";
import type { ProjectSnapshot } from "../../libs/editor/types";
import { EditorRange } from "../../components/editor/EditorRange";
import { EditorControlGestureContext } from "../../components/editor/EditorControlGesture";
jest.mock("react-native-css-interop",()=>({createInteropElement:require("react").createElement}));
jest.mock("react-native-css-interop/jsx-runtime",()=>jest.requireActual("react/jsx-runtime"));
jest.mock("@react-native-community/slider",()=>{
  return function SliderBridge(props:unknown){return require("react").createElement(require("react-native").View,{...(props as object),testID:"control-slider"});};
});
const fixture=():ProjectSnapshot=>({id:"device-project",title:"Film",updatedAt:1,settings:{width:1920,height:1080,fps:30,aspectPreset:"16:9",background:"#000000"},
  tracks:[{id:"v",kind:"video",name:"Video",muted:false,hidden:false}],clips:[{id:"a",kind:"video",trackId:"v",mediaId:"device-video",start:0,trimIn:0,duration:10,sourceDuration:20},
  {id:"b",kind:"video",trackId:"v",mediaId:"device-video",start:10,trimIn:0,duration:5,sourceDuration:20}]});

afterEach(cleanup);
let history!:ReturnType<typeof useProjectHistory>;
function Harness({visible=true}:{visible?:boolean}){
  const h=useProjectHistory(fixture());history=h;
  return <EditorControlGestureContext.Provider value={{scope:h.project!.id,begin:()=>h.holdEdits(projectReviewSnapshotKey(h.project!))}}>
    {visible && <EditorRange label="Duration" value={h.project!.clips[0].duration} min={1} max={20} step={1}
      onLive={duration=>{const next=JSON.parse(JSON.stringify(h.latest())) as ProjectSnapshot;next.clips[0].duration=duration;h.live(next);}} onDone={h.settle}/>}
  </EditorControlGestureContext.Provider>;
}
describe("real native range and history adapter",()=>{
  it("rejects a start from an older rendered baseline",()=>{
    const view=render(<Harness/>);const slider=view.getByTestId("control-slider");const start=slider.props.onSlidingStart,change=slider.props.onValueChange;
    const next=fixture();next.title="New title";
    act(()=>{history.commit(next);start(10);change(2);});
    expect(history.latest()!.title).toBe("New title");expect(history.latest()!.clips[0].duration).toBe(10);expect(history.isEditing()).toBe(false);
  });
  it("holds receiving at sliding start before the first value",()=>{
    const view=render(<Harness/>);fireEvent(view.getByTestId("control-slider"),"slidingStart",10);
    expect(history.isEditing()).toBe(true);expect(history.canUndo).toBe(false);
    expect(()=>history.receive(fixture(),projectReviewSnapshotKey(fixture()))).toThrow("project changed");
    fireEvent(view.getByTestId("control-slider"),"slidingComplete",10);expect(history.isEditing()).toBe(false);expect(history.canUndo).toBe(false);
  });
  it("keeps many values and the completed final value as one Undo",()=>{
    const view=render(<Harness/>);const slider=view.getByTestId("control-slider");fireEvent(slider,"slidingStart",10);fireEvent(slider,"valueChange",9);fireEvent(slider,"valueChange",8);fireEvent(slider,"slidingComplete",7);
    expect(history.latest()!.clips[0].duration).toBe(7);expect(history.isEditing()).toBe(false);expect(history.canUndo).toBe(true);
    act(()=>history.undo());expect(history.latest()!.clips[0].duration).toBe(10);expect(history.canUndo).toBe(false);
  });
  it("preserves Redo after a return to the original value",()=>{
    const view=render(<Harness/>);const next=fixture();next.title="Local title";act(()=>{history.commit(next);history.undo();});
    const slider=view.getByTestId("control-slider");fireEvent(slider,"slidingStart",10);fireEvent(slider,"valueChange",8);fireEvent(slider,"slidingComplete",10);
    expect(history.canUndo).toBe(false);expect(history.canRedo).toBe(true);expect(history.isEditing()).toBe(false);act(()=>history.redo());expect(history.latest()!.title).toBe("Local title");
  });
  it("settles a cancelled partial adjustment",()=>{
    const view=render(<Harness/>);const slider=view.getByTestId("control-slider");fireEvent(slider,"slidingStart",10);fireEvent(slider,"valueChange",8);fireEvent(slider,"touchCancel");
    expect(history.isEditing()).toBe(false);expect(history.canUndo).toBe(true);act(()=>history.undo());expect(history.latest()!.clips[0].duration).toBe(10);
  });
  it("settles and releases when the actual range is removed",()=>{
    const view=render(<Harness/>);const slider=view.getByTestId("control-slider");fireEvent(slider,"slidingStart",10);fireEvent(slider,"valueChange",8);view.rerender(<Harness visible={false}/>);
    expect(history.isEditing()).toBe(false);expect(history.canUndo).toBe(true);act(()=>history.undo());expect(history.latest()!.clips[0].duration).toBe(10);
  });
  it("ignores stale native value and completion callbacks after reset",()=>{
    const view=render(<Harness/>);const slider=view.getByTestId("control-slider");fireEvent(slider,"slidingStart",10);
    const oldChange=slider.props.onValueChange,oldComplete=slider.props.onSlidingComplete;let fresh!:NonNullable<ReturnType<typeof history.holdEdits>>;
    act(()=>{history.reset(fixture());fresh=history.holdEdits()!;oldChange(2);oldComplete(2);});
    expect(history.latest()!.clips[0].duration).toBe(10);expect(history.canUndo).toBe(false);expect(fresh.isCurrent()).toBe(true);act(()=>fresh.release());
  });
  it("preserves a received independent edit through adjustment Undo",()=>{
    const view=render(<Harness/>);const slider=view.getByTestId("control-slider");fireEvent(slider,"slidingStart",10);fireEvent(slider,"slidingComplete",8);
    const before=history.latest()!,incoming=JSON.parse(JSON.stringify(before)) as ProjectSnapshot;incoming.clips[1].duration=4;
    act(()=>{history.receive(incoming,projectReviewSnapshotKey(before));history.undo();});expect(history.latest()!.clips[0].duration).toBe(10);expect(history.latest()!.clips[1].duration).toBe(4);
  });
});
