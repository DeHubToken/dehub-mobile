import { endingBytes, readEndingBoundary, stampEnding } from "../../libs/editor/endingFile";
import { ENDING_FILE_RUNTIME } from "../../libs/editor/endingFileRuntime";
import { downloadProject } from "../../libs/editor/downloadProject";
import { endingPixelsMatch } from "../../libs/editor/endingVisual";
import { ENDING_VISUAL_RUNTIME } from "../../libs/editor/endingVisualRuntime";
const runtime = new Function(ENDING_FILE_RUNTIME + ";return {endingBytes,readEndingBoundary};")() as { endingBytes: typeof endingBytes; readEndingBoundary: typeof readEndingBoundary };
describe("download ending boundaries", () => {
  for (const format of ["mp4", "webm"] as const) it("roundtrips " + format + " and matches the native runtime", async () => {
    const bytes = endingBytes(10, format);
    expect(Array.from(bytes)).toEqual(Array.from(runtime.endingBytes(10, format)));
    expect(readEndingBoundary(bytes, 12.202)).toBe(10);
    expect(runtime.readEndingBoundary(bytes, 12.202)).toBe(10);
    const offset = new Uint8Array(100); offset.set(bytes, 100 - bytes.length);
    expect(readEndingBoundary(offset.subarray(3), 12.202)).toBe(10);
    const out = stampEnding(new Blob([new Uint8Array([1,2,3])], {type:"video/" + format}),10,format);
    expect(out.size).toBe(3 + bytes.length); expect(out.type).toBe("video/" + format);
  });
  it("rejects truncation, damaged tags, stale durations and invalid boundaries", () => {
    const bytes = endingBytes(10,"mp4");
    expect(readEndingBoundary(bytes.slice(0,-1),12.2)).toBeNull();
    expect(readEndingBoundary(bytes,15)).toBeNull();
    expect(readEndingBoundary(bytes,NaN)).toBeNull();
    for(const index of [4,8,24,44]) { const bad=bytes.slice();bad[index]^=1; expect(readEndingBoundary(bad,12.2)).toBeNull(); }
    const invalid=bytes.slice();new DataView(invalid.buffer).setFloat64(36,NaN);expect(readEndingBoundary(invalid,12.2)).toBeNull();
    expect(() => endingBytes(0,"mp4")).toThrow();
  });
  it("preserves the full source and sound, or replaces exactly the previous ending", () => {
    const source={duration:12.2,width:1080,height:1920};
    const project=downloadProject("s",source,"Creator",10);
    expect(project.clips[0]).toMatchObject({start:0,trimIn:0,duration:10,sourceDuration:12.2,speed:1,kind:"video"});
    expect(project.tracks[0]).toMatchObject({muted:false,hidden:false});
    expect(project.settings).toMatchObject({width:1080,height:1920,aspectPreset:"custom"});
    expect(downloadProject("s",{duration:45,width:1920,height:1080}).clips[0].duration).toBe(45);
    expect(() => downloadProject("s",source,"Creator",13)).toThrow();
    expect(() => downloadProject("s",{duration:Infinity,width:1080,height:1920})).toThrow();
    expect(() => downloadProject("s",{duration:3,width:0,height:0})).toThrow();
  });
  it("does not mistake a black frame or a coloured shot for the icon ending", () => {
    const width=100,height=100;
    const blank=new Uint8ClampedArray(width*height*4);
    const icon=blank.slice();
    for(let y=38;y<55;y++)for(let x=44;x<56;x++){ const p=(y*width+x)*4;icon[p]=icon[p+1]=icon[p+2]=255; }
    const port = new Function(ENDING_VISUAL_RUNTIME + ";return endingPixelsMatch;")() as typeof endingPixelsMatch;
    expect(endingPixelsMatch(icon,icon,width,height)).toBe(true);
    expect(port(icon,icon,width,height)).toBe(true);
    expect(endingPixelsMatch(blank,icon,width,height)).toBe(false);
    const colour=new Uint8ClampedArray(width*height*4).fill(220);
    expect(endingPixelsMatch(colour,icon,width,height)).toBe(false);
  });
});
