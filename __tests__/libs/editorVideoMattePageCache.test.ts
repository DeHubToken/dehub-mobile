import { createVideoMattePageCache, VIDEO_MATTE_PAGE_CACHE_RUNTIME, type VideoMatteFrame } from "../../libs/editor/videoMattePageCache";

const frame = (id: string): VideoMatteFrame => ({mediaId:id,atlasWidth:10,atlasHeight:10,x:0,y:0,width:1,height:1,index:0,pageIndex:0});
for (const [label, create] of [["typed",createVideoMattePageCache],["canvas",new Function(VIDEO_MATTE_PAGE_CACHE_RUNTIME+";return createVideoMattePageCache;")() as typeof createVideoMattePageCache]] as const) {
  describe(`${label} page decode cache`, () => {
    it("serializes rapid seeks and releases a stale page before decoding the latest", async () => {
      const images=new Map<string,{naturalWidth:number;naturalHeight:number}>(), loads:string[]=[], released:unknown[]=[];
      let finish!: (image:{naturalWidth:number;naturalHeight:number})=>void;
      const cache=create(images,f=>{loads.push(f.mediaId);return f.mediaId==="old" ? new Promise(resolve=>{finish=resolve;}) : Promise.resolve({naturalWidth:10,naturalHeight:10});},image=>released.push(image));
      const first=cache.select([frame("old")]);const next=cache.select([frame("middle")]);const last=cache.select([frame("new")]);
      expect(loads).toEqual(["old"]);finish({naturalWidth:10,naturalHeight:10});await Promise.all([first,next,last]);
      expect(loads).toEqual(["old","new"]);expect([...images.keys()]).toEqual(["new"]);expect(released).toHaveLength(1);
      await cache.select([frame("end")]);expect([...images.keys()]).toEqual(["end"]);cache.dispose();expect(images.size).toBe(0);expect(released).toHaveLength(3);
    });
    it("retries a missing reopened source only after its availability changes", async () => {
      const images = new Map<string, { naturalWidth: number; naturalHeight: number }>();
      let available = false, calls = 0;
      const cache = create(images, async () => { calls++; if (!available) throw new Error("Background page is missing"); return { naturalWidth: 10, naturalHeight: 10 }; }, () => {});
      await expect(cache.select([frame("restored")])).rejects.toThrow("missing");
      available = true;
      await expect(cache.select([frame("restored")])).rejects.toThrow("missing");
      expect(calls).toBe(1);
      cache.refreshSources(); expect(calls).toBe(1);
      await cache.select([frame("restored")]);
      expect(calls).toBe(2); expect(images.has("restored")).toBe(true);
      await cache.select([frame("restored")]); expect(calls).toBe(2); cache.dispose();
    });
    it("discards old pixels when sources change during a decode", async () => {
      const images = new Map<string, { naturalWidth: number; naturalHeight: number; source: string }>(), released: string[] = [];
      let finish!: (image: { naturalWidth: number; naturalHeight: number; source: string }) => void;
      let calls = 0;
      const cache = create(images, () => ++calls === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ naturalWidth: 10, naturalHeight: 10, source: "current" }), image => released.push(image.source));
      const pending = cache.select([frame("same-id")]); cache.refreshSources();
      finish({ naturalWidth: 10, naturalHeight: 10, source: "old" }); await pending;
      expect(calls).toBe(2); expect(released).toEqual(["old"]); expect(images.get("same-id")?.source).toBe("current");
      cache.refreshSources(); expect(images.size).toBe(0); expect(released).toEqual(["old", "current"]);
      expect(calls).toBe(2); cache.dispose();
    });
    it("ignores an old source error after availability changes", async () => {
      const images = new Map<string, { naturalWidth: number; naturalHeight: number }>();
      let fail!: (reason: Error) => void, calls = 0;
      const cache = create(images, () => ++calls === 1 ? new Promise((_resolve, reject) => { fail = reject; }) : Promise.resolve({ naturalWidth: 10, naturalHeight: 10 }), () => {});
      const pending = cache.select([frame("same-id")]); cache.refreshSources(); fail(new Error("old missing source"));
      await pending; expect(calls).toBe(2); expect(images.has("same-id")).toBe(true);
      cache.dispose(); cache.refreshSources(); await expect(cache.select([frame("same-id")])).rejects.toThrow("closed"); expect(calls).toBe(2);
    });
    it("handles a selection while an empty drain is finishing", async () => {
      const images=new Map<string,{naturalWidth:number;naturalHeight:number}>();
      const cache=create(images,async()=>({naturalWidth:10,naturalHeight:10}),()=>{});
      const empty=cache.select([]), selected=cache.select([frame("next")]);await Promise.all([empty,selected]);expect(images.has("next")).toBe(true);cache.dispose();
    });
    it("rejects corrupt image dimensions and does not keep retrying the same failed page", async () => {
      let count=0;const images=new Map<string,{naturalWidth:number;naturalHeight:number}>(), released:unknown[]=[];
      const cache=create(images,async()=>{count++;return {naturalWidth:9,naturalHeight:10};},image=>released.push(image));
      await expect(cache.select([frame("bad")])).rejects.toThrow("dimensions");await expect(cache.select([frame("bad")])).rejects.toThrow("dimensions");
      expect(count).toBe(1);expect(images.size).toBe(0);expect(released).toHaveLength(1);cache.dispose();
    });
    it("releases a page that arrives after the canvas closes", async () => {
      let finish!: (image:{naturalWidth:number;naturalHeight:number})=>void;const images=new Map<string,{naturalWidth:number;naturalHeight:number}>(), released:unknown[]=[];
      const cache=create(images,()=>new Promise(resolve=>{finish=resolve;}),image=>released.push(image));
      const pending=cache.select([frame("late")]);cache.dispose();finish({naturalWidth:10,naturalHeight:10});await pending;
      expect(images.size).toBe(0);expect(released).toHaveLength(1);
    });
  });
}
