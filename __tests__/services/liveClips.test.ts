jest.mock("../../services/supabase", () => ({ supabase: {} }));
jest.mock("../../libs/auth.utils", () => ({ getAuthToken: async () => null }));
jest.mock("../../services/nft.service", () => ({ minNft: jest.fn() }));
jest.mock("expo-file-system/legacy", () => ({}));

import { clampRange, liveClipCaption, liveClipLink } from "../../services/live-clips.service";

describe("live clips", () => {
  it("keeps a clip 3-60s inside the window", () => {
    expect(clampRange(10, 11, 0, 60, "end")).toEqual([8, 11]);
    expect(clampRange(0, 90, 0, 120, "start")).toEqual([0, 60]);
    expect(clampRange(-5, 30, 0, 60, "start")).toEqual([0, 30]);
  });

  it("credits the streamer and the clipper like web", () => {
    const clip: any = { shortId: 42, kind: "viewer", streamerUsername: "mal", clipperUsername: "erica", clipperAddress: "0xb", streamerAddress: "0xa" };
    expect(liveClipLink(clip)).toBe("https://dehub.io/clip/42");
    expect(liveClipCaption(clip)).toBe("Clipped from @mal's live by @erica\nhttps://dehub.io/clip/42");
    expect(liveClipCaption({ ...clip, clipperAddress: "0xa" })).toBe("Clipped from @mal's live\nhttps://dehub.io/clip/42");
  });
});
