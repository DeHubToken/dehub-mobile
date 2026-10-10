import { rebaseProjectHistory, type ProjectHistory } from "../../libs/editor/projectHistory";
import type { MediaClip, ProjectSnapshot } from "../../libs/editor/types";
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function fixture(): ProjectSnapshot {
  return { id: "local-project", title: "Film", updatedAt: 1,
    settings: { width: 1920, height: 1080, fps: 30, aspectPreset: "16:9", background: "#000000" },
    tracks: [{ id: "video", kind: "video", name: "Video", muted: false, hidden: false }],
    clips: ["a", "b", "c"].map((id, i) => ({ id, kind: "video", mediaId: "device-source", trackId: "video", start: i * 5, trimIn: 0, duration: 5, sourceDuration: 20, transform: { x: .5, y: .5, scale: 1, rotation: 0 } })) };
}
function versions() { const current=fixture(); return { history:{current,past:[clone(current)],future:[clone(current)]} as ProjectHistory,incoming:clone(current) }; }

describe("received timeline changes in local Undo and Redo", () => {
  it("keeps an incoming edit to a different clip in every local history state", () => {
    const {history,incoming}=versions(); history.past[0].clips[0].start=0; history.current.clips[0].start=incoming.clips[0].start=1;
    history.future[0].clips[0].start=2; incoming.clips[1].duration=4;
    const result=rebaseProjectHistory(history,incoming);
    expect(result.past[0].clips[0].start).toBe(0);expect(result.future[0].clips[0].start).toBe(2);
    expect([result.current,...result.past,...result.future].map(state=>state.clips[1].duration)).toEqual([4,4,4]);
    expect(result.past).toHaveLength(1);expect(result.future).toHaveLength(1);
  });
  it("retains local transform history while protecting another transform property", () => {
    const {history,incoming}=versions(); history.past[0].clips[0].transform!.x=.2;history.future[0].clips[0].transform!.x=.8;
    incoming.clips[0].transform!.rotation=45;const result=rebaseProjectHistory(history,incoming);
    expect(result.past[0].clips[0].transform).toMatchObject({x:.2,rotation:45});
    expect(result.future[0].clips[0].transform).toMatchObject({x:.8,rotation:45});
  });
  it("protects an overlapping received field without clearing other local history", () => {
    const {history,incoming}=versions(); history.past[0].clips[0].duration=3;history.past[0].clips[0].start=1;
    incoming.clips[0].duration=4;const result=rebaseProjectHistory(history,incoming);
    expect(result.past[0].clips[0]).toMatchObject({duration:4,start:1});
    expect(result.protectedPaths).toContainEqual({path:["snapshot","clips","a","duration"],kind:"changed"});
  });
  it("keeps a remotely modified layer when Undo predates its creation", () => {
    const {history,incoming}=versions();history.past[0].clips.shift();incoming.clips[0].duration=4;
    const result=rebaseProjectHistory(history,incoming);expect(result.past[0].clips.find(clip=>clip.id==="a")?.duration).toBe(4);
    expect(result.protectedPaths).toContainEqual({path:["snapshot","clips","a"],kind:"removed"});
  });
  it("does not resurrect a received clip deletion through Undo or Redo", () => {
    const {history,incoming}=versions();history.past[0].clips[0].start=1;history.future[0].clips[0].duration=3;incoming.clips.shift();
    const result=rebaseProjectHistory(history,incoming);
    expect([result.current,...result.past,...result.future].every(state=>!state.clips.some(clip=>clip.id==="a"))).toBe(true);
  });
  it("keeps newly received tracks and clips across older Undo states", () => {
    const {history,incoming}=versions();incoming.tracks.push({id:"new-video",kind:"video",name:"New",muted:false,hidden:false});
    incoming.clips.push({...incoming.clips[0],id:"remote-added",trackId:"new-video",mediaId:"received-source"} as MediaClip);
    const result=rebaseProjectHistory(history,incoming);
    expect(result.past[0].tracks.some(track=>track.id==="new-video")).toBe(true);
    expect(result.future[0].clips.find(clip=>clip.id==="remote-added")).toMatchObject({mediaId:"received-source",trackId:"new-video"});
  });
  it("removes historical orphan layers when the collaborator deletes their track", () => {
    const {history,incoming}=versions();history.current.clips=[];incoming.clips=[];incoming.tracks=[];
    const result=rebaseProjectHistory(history,incoming);expect(result.past[0].clips).toEqual([]);expect(result.past[0].tracks).toEqual([]);
  });
  it("preserves locally added historical layers alongside an incoming track order", () => {
    const {history,incoming}=versions();history.current.tracks.push({id:"second",kind:"video",name:"Second",muted:false,hidden:false});
    incoming.tracks=clone(history.current.tracks).reverse();history.past[0].tracks.push({id:"old-extra",kind:"video",name:"Old",muted:false,hidden:false});
    const result=rebaseProjectHistory(history,incoming);expect(result.past[0].tracks.map(track=>track.id)).toEqual(["second","video","old-extra"]);
  });
  it("lets received title changes survive native title Undo states", () => {
    const {history,incoming}=versions();history.past[0].title="Earlier";incoming.title="Shared title";
    expect(rebaseProjectHistory(history,incoming).past[0].title).toBe("Shared title");
  });
  it("keeps received canvas changes with independent local canvas history", () => {
    const {history,incoming}=versions();history.past[0].settings.background="#ffffff";incoming.settings.fps=60;
    expect(rebaseProjectHistory(history,incoming).past[0].settings).toMatchObject({background:"#ffffff",fps:60});
  });
  it("leaves input snapshots and nested placement fields untouched", () => {
    const {history,incoming}=versions();incoming.clips[0].transform!.rotation=30;const before=clone({history,incoming});
    const result=rebaseProjectHistory(history,incoming);result.past[0].clips[0].transform!.x=.9;
    expect({history,incoming}).toEqual(before);
  });
  it("keeps older local duration Undo within a received playback speed", () => {
    const {history,incoming}=versions();history.current.clips[0].duration=incoming.clips[0].duration=3;
    history.past[0].clips[0].duration=12;(incoming.clips[0] as MediaClip).speed=2;
    const result=rebaseProjectHistory(history,incoming);
    expect(result.past[0].clips[0]).toMatchObject({duration:3,speed:2});
    expect(result.protectedPaths).toContainEqual({path:["snapshot","clips","a"],kind:"timing"});
  });
  it("rejects project changes before replacing any history state", () => {
    const {history,incoming}=versions();incoming.id="different";expect(()=>rebaseProjectHistory(history,incoming)).toThrow("Project changed");
    incoming.id=history.current.id;history.future[0].id="different";expect(()=>rebaseProjectHistory(history,incoming)).toThrow("Project changed");
  });
  it("rejects nonfinite values and invalid history references", () => {
    const {history,incoming}=versions();history.past[0].clips[0].duration=NaN;expect(()=>rebaseProjectHistory(history,incoming)).toThrow("Invalid project history value");
    history.past[0]=fixture();history.past[0].clips[0].trackId="missing";expect(()=>rebaseProjectHistory(history,incoming)).toThrow("Invalid project history references");
  });
});
