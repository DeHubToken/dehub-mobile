import { nleExport, nleMediaNames } from "../../libs/editor/nleExport";
import type { ProjectSnapshot } from "../../libs/editor/types";

const project = (): ProjectSnapshot => ({
  id: "p", title: "Trip & friends", updatedAt: 0,
  settings: { width: 1080, height: 1920, fps: 30 } as ProjectSnapshot["settings"],
  tracks: [
    { id: "v1", kind: "video", name: "Video", muted: false, hidden: false },
    { id: "a1", kind: "audio", name: "Music", muted: true, hidden: false },
  ] as ProjectSnapshot["tracks"],
  clips: [
    { id: "c1", kind: "video", mediaId: "m1", trackId: "v1", start: 0, duration: 4, trimIn: 1, speed: 2 },
    { id: "c2", kind: "audio", mediaId: "m2", trackId: "a1", start: 0, duration: 6, trimIn: 0 },
    { id: "t1", kind: "text", trackId: "v1", start: 1, duration: 2, trimIn: 0, text: "Hello <world>" },
  ] as ProjectSnapshot["clips"],
});
const media = [
  { id: "m1", name: "beach.mp4", kind: "video" as const, duration: 20 },
  { id: "m2", name: "song.mp3", kind: "audio" as const, duration: 60 },
];

describe("nleExport", () => {
  it("names media uniquely and safely", () => {
    const names = nleMediaNames([{ id: "a", name: "clip.mp4", kind: "video" }, { id: "b", name: "clip.mp4", kind: "video" }, { id: "c", name: "a/b.mov", kind: "video" }]);
    expect(names).toEqual({ a: "clip.mp4", b: "clip (2).mp4", c: "a_b.mov" });
  });

  it("writes FCPXML with lanes, speed, mute and markers", () => {
    const { fcpxml } = nleExport(project(), media);
    expect(fcpxml).toContain('<fcpxml version="1.10">');
    expect(fcpxml).toContain('src="./media/beach.mp4"');
    expect(fcpxml).toMatch(/lane="1" offset="0\/3000s"/);
    expect(fcpxml).toMatch(/lane="-1"/);
    expect(fcpxml).toContain("<timeMap>");
    expect(fcpxml).toContain('amount="-96dB"');
    expect(fcpxml).toContain('value="Hello &lt;world&gt;"');
    expect(fcpxml).toContain('name="Trip &amp; friends"');
  });

  it("writes Premiere XML with in/out frames and time remap", () => {
    const { premiere } = nleExport(project(), media);
    expect(premiere).toContain('<xmeml version="4">');
    expect(premiere).toContain("<in>30</in><out>270</out>");
    expect(premiere).toContain("<value>200.00</value>");
    expect(premiere).toContain("<pathurl>media/song.mp3</pathurl>");
  });
});
