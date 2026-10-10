import { act, cleanup, renderHook } from "@testing-library/react-native";
import { useProjectHistory } from "../../libs/editor/useProjectHistory";
import { useEditorProjectDraft } from "../../libs/editor/useEditorProjectDraft";
import { projectReviewSnapshotKey } from "../../libs/editor/cloudProjectReview";
import type { ProjectSnapshot } from "../../libs/editor/types";
jest.mock("react-native-css-interop",()=>({createInteropElement:require("react").createElement}));
afterEach(cleanup);
const fixture=():ProjectSnapshot=>({id:"project",title:"Film",updatedAt:1,settings:{width:1920,height:1080,fps:30,aspectPreset:"16:9",background:"#000000"},
  tracks:[{id:"t",kind:"text",name:"Text",muted:false,hidden:false},{id:"v",kind:"video",name:"Video",muted:false,hidden:false}],
  clips:[{id:"title",kind:"text",trackId:"t",text:"Original",start:0,trimIn:0,duration:10,fontFamily:"Inter",fontSize:72,fontWeight:700,color:"#ffffff",align:"centre",x:.5,y:.5},
    {id:"video",kind:"video",trackId:"v",mediaId:"footage",start:0,trimIn:0,duration:10}]});
function editor(){return renderHook(()=>{const h=useProjectHistory(fixture());const drafts=useEditorProjectDraft({rendered:h.project,current:h.latest,holdEdits:h.holdEdits,commit:h.commit});return {h,drafts};});}

describe("native text drafts and the real history adapter",()=>{
  it("owns editing before the text modal receives its first input",()=>{
    const {result}=editor();act(()=>{expect(result.current.drafts.openText("title")).toBe(true);});
    expect(result.current.h.isEditing()).toBe(true);expect(result.current.h.canUndo).toBe(false);
    expect(()=>result.current.h.receive(fixture(),projectReviewSnapshotKey(fixture()))).toThrow("project changed");
    const frame=result.current.drafts.draft;act(()=>result.current.drafts.cancel(frame));expect(result.current.h.isEditing()).toBe(false);
  });
  it("applies wording to the latest document with one Undo and preserves independent changes",()=>{
    const {result}=editor();act(()=>{result.current.drafts.openText("title");});
    const currentFrame=result.current.drafts.draft,independent={...result.current.h.latest()!,clips:[result.current.h.latest()!.clips[0],{...result.current.h.latest()!.clips[1],duration:7}]};
    act(()=>result.current.h.commit(independent));
    act(()=>{expect(result.current.drafts.done(currentFrame,"Rewritten")).toBe(true);});
    expect(result.current.h.latest()!.clips[0]).toMatchObject({text:"Rewritten"});expect(result.current.h.latest()!.clips[1].duration).toBe(7);
    act(()=>result.current.h.undo());expect(result.current.h.latest()!.clips[0]).toMatchObject({text:"Original"});expect(result.current.h.latest()!.clips[1].duration).toBe(7);
    expect(result.current.h.canUndo).toBe(true);
  });
  it("rejects an old Done and Cancel after reset without closing a newer modal",()=>{
    const {result}=editor();act(()=>result.current.drafts.openText("title"));const old=result.current.drafts.draft;
    act(()=>{result.current.h.reset(fixture());result.current.drafts.openTitle();});const current=result.current.drafts.draft;
    act(()=>{expect(result.current.drafts.done(old,"Stale")).toBe(false);result.current.drafts.cancel(old);});
    expect(result.current.drafts.draft).toBe(current);expect(result.current.h.isEditing()).toBe(true);
    act(()=>{expect(result.current.drafts.done(current,"Renamed")).toBe(true);});expect(result.current.h.latest()!.title).toBe("Renamed");
  });
  it("rejects a modal opening from an older rendered document",()=>{
    const {result}=editor();const source=result.current.h.latest()!,next={...source,title:"Changed"};
    act(()=>{result.current.h.commit(next);expect(result.current.drafts.openText("title")).toBe(false);});
    expect(result.current.h.isEditing()).toBe(false);expect(result.current.drafts.draft).toBeNull();
  });
  it("opens a newly committed text layer before a render",()=>{
    const {result}=editor();act(()=>{
      const next=fixture();next.title="New layer";result.current.h.commit(next);
      expect(result.current.drafts.openText("title",result.current.h.latest())).toBe(true);
    });expect(result.current.h.isEditing()).toBe(true);
  });
  it("preserves Redo when an unchanged title is accepted",()=>{
    const {result}=editor();const next={...fixture(),title:"Changed"};act(()=>{result.current.h.commit(next);result.current.h.undo();result.current.drafts.openTitle();});
    const frame=result.current.drafts.draft;act(()=>{expect(result.current.drafts.done(frame,"Film")).toBe(true);});
    expect(result.current.h.canUndo).toBe(false);expect(result.current.h.canRedo).toBe(true);expect(result.current.h.isEditing()).toBe(false);
  });
  it("releases a removed workspace and rejects its stored opening callback",()=>{
    const {result,unmount}=editor();act(()=>result.current.drafts.openTitle());const frame=result.current.drafts.draft,open=result.current.drafts.openTitle;
    unmount();expect(frame!.task.isCurrent()).toBe(false);expect(open()).toBe(false);
  });
});
