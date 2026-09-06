import {
  videoEffectChain,
  VIDEO_LOOKS,
} from "../../components/LiveProducer/videoLooks";

/**
 * The shape of "no look" is a per-platform contract with react-native-webrtc.
 * On Android an empty chain double-releases every captured frame and the
 * process dies on the first one; only a null removes the processor. iOS marks
 * the argument nonnull and forwards frames through an empty chain untouched.
 */
describe("videoEffectChain", () => {
  it("names the look on both platforms", () => {
    expect(videoEffectChain("mono", "android")).toEqual(["mono"]);
    expect(videoEffectChain("mono", "ios")).toEqual(["mono"]);
  });

  it("removes the processor outright on Android instead of installing an empty chain", () => {
    expect(videoEffectChain("none", "android")).toBeNull();
  });

  it("keeps the empty chain on iOS", () => {
    expect(videoEffectChain("none", "ios")).toEqual([]);
  });

  it("never hands Android an empty array for any listed look", () => {
    for (const { id } of VIDEO_LOOKS) {
      const chain = videoEffectChain(id, "android");
      expect(chain === null || chain.length === 1).toBe(true);
    }
  });
});
