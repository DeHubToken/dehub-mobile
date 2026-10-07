import { leaseMedia } from "../../libs/editor/mediaLeases";
describe("simultaneous media decoders", () => {
  it("seeks overlapping cuts independently and reuses only the needed extra decoder", () => {
    const source = { time: 0 }; const base = new Map([["m", source]]); const extra = new Map<string, typeof source>();
    let copies = 0; let released = 0;
    const create = () => { copies++; return { time: 0 }; }; const release = () => { released++; };
    const clips = [{ id: "out", mediaId: "m" }, { id: "in", mediaId: "m" }];
    const active = leaseMedia(clips, base, extra, create, release);
    active.get("out")!.time = 9.5; active.get("in")!.time = 2.5;
    expect(active.get("out")!.time).toBe(9.5);
    expect(active.get("in")!.time).toBe(2.5);
    leaseMedia(clips, base, extra, create, release);
    expect(copies).toBe(1);
    leaseMedia([clips[1]], base, extra, create, release);
    expect(extra.size).toBe(0); expect(released).toBe(1);
  });
  it("a hundred consecutive cuts need only the original decoder", () => {
    const source = {}; const base = new Map([["m", source]]); const extra = new Map();
    for (let i = 0; i < 100; i++) {
      expect(leaseMedia([{ id: String(i), mediaId: "m" }], base, extra, () => { throw new Error("unnecessary decoder"); }, () => {} ).get(String(i))).toBe(source);
    }
  });
});
