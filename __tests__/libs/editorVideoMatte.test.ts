import { EDITOR_CANVAS_HTML } from "../../libs/editor/canvasHtml";
import { mediaIds, newProject, parseProject, updateClip } from "../../libs/editor/project";
import { videoMatteCommand, assertVideoMattes, validVideoMatte, videoMatteFrame, videoMattePlan, videoMattePagePlan, videoMatteMediaIds, validVideoMattePageOutput } from "../../libs/editor/videoMatte";
import { VIDEO_MATTE_CORE, VIDEO_MATTE_RUNTIME, VIDEO_MATTE_WORKER } from "../../libs/editor/videoMatteRuntime";
import type { MediaClip } from "../../libs/editor/types";
const clip = (patch: Partial<MediaClip> = {}): MediaClip => ({ id: "v", trackId: "t", kind: "video", mediaId: "source", start: 7, trimIn: 4, duration: 2, speed: 2, ...patch });
const runtime = new Function(VIDEO_MATTE_CORE + ";return {videoMattePlan,videoMatteFrame,validVideoMatte,assertVideoMattes};")() as { videoMattePlan: typeof videoMattePlan; videoMatteFrame: typeof videoMatteFrame; validVideoMatte: typeof validVideoMatte; assertVideoMattes: typeof assertVideoMattes };
describe("source-timed video masks", () => {
  it("bounds decoded memory and canvas dimensions for portrait, square, landscape and high frame rates", () => {
    for (const [w,h] of [[1920,1080],[1080,1920],[1080,1080],[7680,2160]]) for (const fps of [24,30,60,120]) {
      const c=clip({speed:1,duration:600/fps}); const plan=videoMattePlan(c,w,h,100,fps);
      expect(plan.frames).toBe(600); expect(plan.atlasWidth).toBeLessThanOrEqual(4096); expect(plan.atlasHeight).toBeLessThanOrEqual(4096);
      expect(plan.atlasWidth*plan.atlasHeight*4).toBeLessThanOrEqual(64*1024*1024);
      expect(runtime.videoMattePlan(c,w,h,100,fps)).toEqual(plan);
      expect(validVideoMatte({...c,videoMatte:{...plan,mediaId:"mask"}})).toBe(true);
    }
  });
  it("uses the source clock after trim, speed, timeline move and split", () => {
    const c=clip(), matte={...videoMattePlan(c,1920,1080,40,30),mediaId:"mask"};
    const changed={...c,start:20,trimIn:5,duration:1,videoMatte:matte};
    expect(videoMatteFrame(changed,5)?.index).toBe(30);
    expect(videoMatteFrame(changed,6)?.index).toBe(60);
    expect(videoMatteFrame(changed,7.999)?.index).toBe(119);
    for(const time of [4,5,6,7.999]) expect(runtime.videoMatteFrame(changed,time)).toEqual(videoMatteFrame(changed,time));
    expect(videoMatteFrame(changed,3.9)).toBeNull(); expect(videoMatteFrame(changed,8.1)).toBeNull();
    expect(()=>assertVideoMattes([changed],()=>true)).not.toThrow();
    expect(()=>assertVideoMattes([{...changed,duration:2}],()=>true)).toThrow("Restore the background");
  });
  it("refuses missing masks, replaced footage, invalid metadata and oversized source ranges", () => {
    const c=clip(), matte={...videoMattePlan(c,640,360,40,30),mediaId:"mask"};
    for(const value of [{...matte,sourceMediaId:"other"},{...matte,frames:999},{...matte,width:NaN},{...matte,columns:0},{...matte,atlasWidth:999999}]) {
      const invalid={...c,videoMatte:value};expect(validVideoMatte(invalid)).toBe(false);expect(runtime.validVideoMatte(invalid)).toBe(false);expect(()=>assertVideoMattes([invalid],()=>true)).toThrow();
    }
    expect(()=>assertVideoMattes([{...c,videoMatte:matte}],()=>false)).toThrow("missing");
    expect(()=>videoMattePlan(clip({duration:601,speed:1}),640,360,700,30)).toThrow("Trim");
    expect(()=>videoMattePlan(clip({trimIn:39}),640,360,40,30)).toThrow("Invalid");
    expect(()=>videoMattePlan(clip({speed:NaN}),640,360,40,30)).toThrow("Invalid");
  });
  it("compiles the complete decoder and general-subject worker without a fallback to portrait segmentation", () => {
    expect(()=>new Function(VIDEO_MATTE_RUNTIME)).not.toThrow();expect(()=>new Function(VIDEO_MATTE_WORKER)).not.toThrow();
    expect(VIDEO_MATTE_WORKER).toContain('studioludens/birefnet-lite-512');expect(VIDEO_MATTE_WORKER).not.toContain('modnet');
  });
});

it("keeps masks in the saved project media set, and discards them when footage is replaced", () => {
  const c=clip(), matte={...videoMattePlan(c,640,360,40,30),mediaId:"mask"};
  const project={...newProject("16:9","mask"),clips:[{...c,videoMatte:matte}]};
  expect(mediaIds(project)).toEqual(["source","mask"]);
  expect(mediaIds(parseProject(JSON.stringify(project))!)).toEqual(["source","mask"]);
  expect(updateClip(project,c.id,{mediaId:"new"}).clips[0]).toMatchObject({mediaId:"new",videoMatte:null});
  const program=/<script>([\s\S]*)<\/script>/.exec(EDITOR_CANVAS_HTML)![1];
  expect(()=>new Function(program)).not.toThrow();
});

it("handles exact video cut-out requests without choosing ambiguous or locked layers", () => {
  const scene={selected:["v"],layers:[{id:"v",kind:"video"},{id:"image",kind:"image"}]};
  for(const prompt of ["remove the background", "Please remove background from this video.", "remove the video background"])
    expect(videoMatteCommand(prompt,scene)).toEqual({op:"remove_background",id:"v"});
  expect(videoMatteCommand("remove background",{...scene,selected:[]})).toBeNull();
  expect(videoMatteCommand("remove background from the video",{...scene,selected:[]})).toEqual({op:"remove_background",id:"v"});
  expect(videoMatteCommand("remove background and add captions",scene)).toBeNull();
  expect(videoMatteCommand("remove background",{selected:["v"],layers:[{id:"v",kind:"video",locked:true}]})).toBeNull();
});


it("keeps full-rate detail across source-clock page boundaries and rejects incomplete pages", () => {
  const c=clip({duration:41,speed:1}), plan=videoMattePlan(c,1920,1080,100,30);
  const short=videoMattePlan({...c,duration:20},1920,1080,100,30);
  expect([plan.width,plan.height,plan.fps]).toEqual([short.width,short.height,30]);
  const pages=Array.from({length:Math.ceil(plan.frames/600)},(_,i)=>({...videoMattePagePlan(plan,i),mediaId:`page-${i}`}));
  const m={...plan,mediaId:pages[0].mediaId,pages}, masked={...c,videoMatte:m};
  expect(validVideoMatte(masked)).toBe(true);
  expect(videoMatteMediaIds(m)).toEqual(["page-0","page-1","page-2"]);
  for(const index of [0,599,600,601,1199,1200,1229]) {
    const at=plan.start+index/30, frame=videoMatteFrame(masked,at)!;
    expect(frame.index).toBe(index);expect(frame.mediaId).toBe(`page-${Math.floor(index/600)}`);
    expect(frame.x+frame.width).toBeLessThanOrEqual(frame.atlasWidth);expect(frame.y+frame.height).toBeLessThanOrEqual(frame.atlasHeight);
    expect(runtime.videoMatteFrame(masked,at)).toEqual(frame);
  }
  expect(()=>assertVideoMattes([masked],id=>id!=="page-1")).toThrow("missing");
  for(const bad of [pages.slice(0,2),[pages[0],{...pages[1],firstFrame:599},pages[2]],[pages[0],{...pages[1],mediaId:pages[0].mediaId},pages[2]]]) {
    const invalid={...c,videoMatte:{...m,pages:bad}};
    expect(validVideoMatte(invalid)).toBe(false);expect(runtime.validVideoMatte(invalid)).toBe(false);
  }
  expect(validVideoMattePageOutput(c,plan,{...pages[1],dataUrl:"data:image/png;base64,AAAA"},1)).toBe(true);
  expect(validVideoMattePageOutput(c,plan,{...pages[1],atlasWidth:999999,dataUrl:"data:image/png;base64,AAAA"},1)).toBe(false);
});
