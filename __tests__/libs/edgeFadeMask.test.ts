import {
  FADE_WIDTH,
  resolveEdgeFadeMask,
  resolveEdgeFadeSides,
} from "../../libs/edgeFadeMask";

const ROW_WIDTH = 360;

describe("resolveEdgeFadeSides", () => {
  it("fades nothing when the row fits", () => {
    // The old painted strip sat on every row, so short rows (1d/1w/1m/1y,
    // PPV/Bounty/Gated) wore a black box over content that wasn't there.
    expect(
      resolveEdgeFadeSides({ layoutWidth: ROW_WIDTH, contentWidth: 200, offset: 0 }),
    ).toEqual({ start: false, end: false });
  });

  it("fades only the end while parked at the start", () => {
    expect(
      resolveEdgeFadeSides({ layoutWidth: ROW_WIDTH, contentWidth: 900, offset: 0 }),
    ).toEqual({ start: false, end: true });
  });

  it("fades both edges mid-scroll", () => {
    expect(
      resolveEdgeFadeSides({ layoutWidth: ROW_WIDTH, contentWidth: 900, offset: 200 }),
    ).toEqual({ start: true, end: true });
  });

  it("drops the end fade once the row is scrolled to its end", () => {
    expect(
      resolveEdgeFadeSides({ layoutWidth: ROW_WIDTH, contentWidth: 900, offset: 540 }),
    ).toEqual({ start: true, end: false });
  });

  it("ignores rubber-band overscroll past either end", () => {
    expect(
      resolveEdgeFadeSides({ layoutWidth: ROW_WIDTH, contentWidth: 900, offset: -60 }),
    ).toEqual({ start: false, end: true });
    expect(
      resolveEdgeFadeSides({ layoutWidth: ROW_WIDTH, contentWidth: 900, offset: 620 }),
    ).toEqual({ start: true, end: false });
  });
});

describe("resolveEdgeFadeMask", () => {
  it("returns no mask when neither edge overflows, leaving the row untouched", () => {
    expect(resolveEdgeFadeMask({ start: false, end: false }, ROW_WIDTH)).toBeNull();
  });

  it("returns no mask before the row has been measured", () => {
    expect(resolveEdgeFadeMask({ start: false, end: true }, 0)).toBeNull();
  });

  it("dissolves only the overflowing edge", () => {
    const mask = resolveEdgeFadeMask({ start: false, end: true }, ROW_WIDTH);
    expect(mask).toEqual({
      colors: ["#000000", "#000000", "transparent"],
      locations: [0, 1 - FADE_WIDTH / ROW_WIDTH, 1],
    });
  });

  it("dissolves both edges when the row is scrolled in the middle", () => {
    const fade = FADE_WIDTH / ROW_WIDTH;
    expect(resolveEdgeFadeMask({ start: true, end: true }, ROW_WIDTH)).toEqual({
      colors: ["transparent", "#000000", "#000000", "transparent"],
      locations: [0, fade, 1 - fade, 1],
    });
  });

  it("carries no colour of its own, so it works on any theme", () => {
    // Only alpha: opaque keeps the pills, transparent dissolves them. Nothing
    // here has to match the panel's background the way the old #000000 strip
    // did.
    const mask = resolveEdgeFadeMask({ start: true, end: true }, ROW_WIDTH)!;
    for (const color of mask.colors) {
      expect(["#000000", "transparent"]).toContain(color);
    }
  });

  it("keeps stop positions ordered on a narrow row", () => {
    const mask = resolveEdgeFadeMask({ start: true, end: true }, 40)!;
    const sorted = [...mask.locations].sort((a, b) => a - b);
    expect(mask.locations).toEqual(sorted);
    expect(mask.locations).toHaveLength(mask.colors.length);
  });
});
