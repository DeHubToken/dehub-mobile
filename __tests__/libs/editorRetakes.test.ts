import { findRetakes, removeRetakes } from "../../libs/editor/retakes";
import type { ProjectSnapshot } from "../../libs/editor/types";

const s = (start: number, end: number, text: string) => ({ start, end, text });

describe("findRetakes", () => {
  it("cuts restarted lines and keeps the last take", () => {
    const cuts = findRetakes([s(0, 2, "So today we're going to"), s(2.8, 5, "Today we're going to look at cameras."), s(5.5, 7, "They are great.")]);
    expect(cuts).toEqual([{ from: 0, to: 2.8, text: "So today we're going to" }]);
  });
  it("merges a run of retakes", () => {
    const cuts = findRetakes([s(0, 1, "The best part"), s(1.5, 2.5, "The best part is"), s(3, 5, "The best part is the price.")]);
    expect(cuts).toHaveLength(1);
    expect(cuts[0]).toMatchObject({ from: 0, to: 3 });
  });
  it("leaves different lines alone", () => {
    expect(findRetakes([s(0, 2, "I love this phone."), s(3, 5, "It has a great screen."), s(6, 8, "I love the price too.")])).toEqual([]);
  });
});

describe("removeRetakes", () => {
  it("cuts the video and keeps captions in sync", () => {
    const project: ProjectSnapshot = {
      id: "p", title: "", updatedAt: 0, settings: {} as ProjectSnapshot["settings"],
      tracks: [{ id: "v", kind: "video", name: "V", muted: false, hidden: false }, { id: "c", kind: "text", name: "C", role: "captions", muted: false, hidden: false }],
      clips: [
        { id: "clip", kind: "video", mediaId: "m", trackId: "v", start: 0, duration: 10, trimIn: 0 },
        { id: "w1", kind: "text", trackId: "c", start: 0.5, duration: 1, trimIn: 0, text: "old" },
        { id: "w2", kind: "text", trackId: "c", start: 4, duration: 1, trimIn: 0, text: "new" },
      ] as ProjectSnapshot["clips"],
    };
    const next = removeRetakes(project, "clip", [{ from: 0, to: 3, text: "old" }], () => "n")!;
    expect(next.clips.find(c => c.id === "w1")).toBeUndefined();
    expect(next.clips.find(c => c.id === "w2")!.start).toBe(1);
    const video = next.clips.filter(c => c.trackId === "v");
    expect(video).toHaveLength(1);
    expect(video[0]).toMatchObject({ start: 0, duration: 7, trimIn: 3 });
  });
});
