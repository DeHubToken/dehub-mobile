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

describe("videoEffectChain with the phone studio", () => {
  const on = { supported: true, background: true, overlay: true };

  it("orders look, background, then cards and overlay", () => {
    expect(videoEffectChain("warm", "android", on)).toEqual(["warm", "dhb-background", "dhb-studio"]);
    expect(videoEffectChain("warm", "ios", on)).toEqual(["warm", "dhb-background", "dhb-studio"]);
  });

  it("runs the studio without a look", () => {
    expect(videoEffectChain("none", "android", { supported: true, overlay: true })).toEqual(["dhb-studio"]);
    expect(videoEffectChain("none", "ios", { supported: true, background: true })).toEqual(["dhb-background"]);
  });

  it("leaves out each studio step that is off", () => {
    expect(videoEffectChain("mono", "android", { supported: true, background: false, overlay: false })).toEqual(["mono"]);
    expect(videoEffectChain("mono", "android", { supported: true, overlay: true })).toEqual(["mono", "dhb-studio"]);
  });

  it("never names a studio processor to a binary without one", () => {
    expect(videoEffectChain("mono", "android", { ...on, supported: false })).toEqual(["mono"]);
    expect(videoEffectChain("none", "android", { ...on, supported: false })).toBeNull();
    expect(videoEffectChain("none", "ios", { ...on, supported: false })).toEqual([]);
  });

  it("still never hands Android an empty array with everything off", () => {
    for (const { id } of VIDEO_LOOKS) {
      for (const background of [false, true]) {
        for (const overlay of [false, true]) {
          const chain = videoEffectChain(id, "android", { supported: true, background, overlay });
          expect(chain === null || chain.length > 0).toBe(true);
        }
      }
    }
  });
});
