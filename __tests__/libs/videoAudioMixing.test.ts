import { shareAudioWhenSilent } from "../../libs/videoAudioMixing";

describe("shareAudioWhenSilent", () => {
  it("lets a player mix while silent instead of iOS's doNotMix default", () => {
    const player: any = { audioMixingMode: "doNotMix" };
    shareAudioWhenSilent(player);
    expect(player.audioMixingMode).toBe("auto");
  });

  it("ignores a missing or released player", () => {
    expect(() => shareAudioWhenSilent(null)).not.toThrow();
    const released: any = {};
    Object.defineProperty(released, "audioMixingMode", { set() { throw new Error("released"); } });
    expect(() => shareAudioWhenSilent(released)).not.toThrow();
  });
});
