jest.mock("../../libs/live-ingest", () => ({ hlsUrlFor: (r: any) => r.hls || null, liveThumbnailFor: () => null }));
jest.mock("../../libs/misc", () => ({ buildCdnPath: (p: string) => p, getAvatarUrl: (p: string) => p }));
jest.mock("../../libs/live-status", () => ({ isStreamLive: (r: any) => r.status === "LIVE" }));

import { interleaveLive, isVerticalFeedLive, toLiveSlide } from "../../libs/live-shorts";

const live = (id: string) => toLiveSlide({ _id: id, status: "LIVE", hls: "https://x/" + id, account: { username: id } });

describe("lives in Shorts", () => {
  it("only offers open, safe streams that are on air", () => {
    expect(isVerticalFeedLive({ status: "LIVE", hls: "u" })).toBe(true);
    expect(isVerticalFeedLive({ status: "OFFLINE", hls: "u" })).toBe(false);
    expect(isVerticalFeedLive({ status: "LIVE", hls: "u", plans: ["p"] })).toBe(false);
    expect(isVerticalFeedLive({ status: "LIVE", hls: "u", streamInfo: { isPayPerView: true } })).toBe(false);
    expect(isVerticalFeedLive({ status: "LIVE", hls: "u", contentRating: "mature" })).toBe(false);
    expect(isVerticalFeedLive({ status: "LIVE" })).toBe(false);
  });

  it("never moves the short the viewer opened on", () => {
    const shorts = Array.from({ length: 14 }, (_, i) => i);
    const out = interleaveLive(shorts, [live("a"), live("b"), live("c")], 2);
    expect(out.slice(0, 3)).toEqual([0, 1, 2]);
    expect(out.filter((x: any) => x?.__liveSlide).length).toBe(2);
    expect((out[8] as any).id).toBe("live-a");
    expect(interleaveLive(shorts, [], 0)).toBe(shorts);
  });
});
