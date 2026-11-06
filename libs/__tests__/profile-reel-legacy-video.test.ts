import { isReelSlide, isReelVideo, reelStillOf } from "../profileReel";

// The first videos (2023) carry no postType and the old streams/video route.
const legacyVideo = {
  tokenId: 2,
  postType: null,
  name: "DeHub Adası ",
  description: "",
  videoUrl: "streams/video/2",
  videoExt: "mp4",
  imageUrl: "nfts/images/2.jpeg",
  transcodingStatus: "done",
  streamInfo: { isLockContent: false },
  plansDetails: [],
};

describe("profile reel: legacy videos", () => {
  it("counts a typeless row with a video file as a video", () => {
    expect(isReelVideo(legacyVideo)).toBe(true);
    expect(isReelSlide(legacyVideo)).toBe(true);
  });

  it("plays it instead of drawing its title as a text slide", () => {
    expect(reelStillOf(legacyVideo)).toBeNull();
  });

  it("still draws a typeless row without a video as text", () => {
    expect(reelStillOf({ postType: null, description: "hello" })).toEqual({ kind: "text", text: "hello" });
  });
});
