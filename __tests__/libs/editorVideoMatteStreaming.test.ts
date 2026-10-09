import { VIDEO_MATTE_RUNTIME } from "../../libs/editor/videoMatteRuntime";
import type { MediaClip } from "../../libs/editor/types";
import type { VideoMattePageSink, VideoMattePageOutput, VideoMatteResult } from "../../libs/editor/videoMatte";

it("stores each completed mask page before decoding the next and keeps source-frame order", async () => {
  const seen: number[] = [], allocations: number[] = [], draws: { x:number;y:number;w:number;h:number }[] = [];
  let stopped = false, first!: ()=>void, saved!: ()=>void;
  const atPage=new Promise<void>(resolve=>{first=resolve;}), continuePage=new Promise<void>(resolve=>{saved=resolve;});
  const pixels=new Uint8ClampedArray(512*512*4);
  class WorkerStub {
    messages=new Set<(event:{data:unknown})=>void>();
    addEventListener(type:string,cb:(event:{data:unknown})=>void){if(type==="message")this.messages.add(cb);}
    removeEventListener(type:string,cb:(event:{data:unknown})=>void){if(type==="message")this.messages.delete(cb);}
    postMessage(data:{id:number}){queueMicrotask(()=>this.messages.forEach(cb=>cb({data:{id:data.id,type:"done",pixels}})));}
    terminate(){stopped=true;}
  }
  class Reader { result="data:image/png;base64,AAAA"; onload?:()=>void; readAsDataURL(){queueMicrotask(()=>this.onload?.());} }
  const callbacks=new Map<string,Set<()=>void>>();
  const video={duration:100,videoWidth:1920,videoHeight:1080,currentTime:0,readyState:4,src:"",pause(){},removeAttribute(){},load(){queueMicrotask(()=>callbacks.get("loadeddata")?.forEach(cb=>cb()));},addEventListener(t:string,cb:()=>void){if(!callbacks.has(t))callbacks.set(t,new Set());callbacks.get(t)!.add(cb);},removeEventListener(t:string,cb:()=>void){callbacks.get(t)?.delete(cb);}};
  const canvases:{width:number;height:number}[]=[];
  const documentStub={createElement(tag:string){if(tag==="video")return video;const canvas={width:0,height:0,getContext(){return {drawImage(...args:unknown[]){if(args.length===9)draws.push({x:args[5] as number,y:args[6] as number,w:args[7] as number,h:args[8] as number});},putImageData(){}};},toBlob(cb:(blob:{size:number})=>void){allocations.push(this.width*this.height*4);cb({size:128});}};canvases.push(canvas);return canvas;}};
  const run=new Function("document","Worker","URL","ImageData","FileReader","navigator","seen",VIDEO_MATTE_RUNTIME+`; function waitForVideoFrame(video,time){seen.push(time);video.currentTime=time;return Promise.resolve();} return createVideoMatte;`)(documentStub,WorkerStub,{createObjectURL:()=>"blob:worker",revokeObjectURL(){}},class {constructor(..._args:unknown[]){}},Reader,{},seen) as (url:string,clip:MediaClip,fps:number,progress:(p:unknown)=>void,signal:AbortSignal|undefined,sink:VideoMattePageSink)=>Promise<VideoMatteResult>;
  const pages:VideoMattePageOutput[]=[], source:MediaClip={id:"v",trackId:"t",kind:"video",mediaId:"source",start:10,trimIn:3,duration:601/30,speed:1};
  const pending=run("blob:source",source,30,()=>{},undefined,async page=>{pages.push(page);if(pages.length===1){first();await continuePage;}return `mask-${pages.length}`;});
  await Promise.race([atPage,pending]);expect(seen).toHaveLength(600);expect(pages).toHaveLength(1);saved();
  const result=await pending;expect(seen).toHaveLength(601);expect(seen[0]).toBe(3);expect(seen[600]).toBe(23);
  expect(pages.map(p=>[p.firstFrame,p.frames])).toEqual([[0,600],[600,1]]);
  expect(result.matte?.pages?.map(p=>p.mediaId)).toEqual(["mask-1","mask-2"]);
  expect(allocations.every(bytes=>bytes<=64*1024*1024)).toBe(true);expect(draws.at(-1)).toMatchObject({x:0,y:0});
  expect(stopped).toBe(true);expect(canvases.every(c=>c.width===1&&c.height===1)).toBe(true);
});
