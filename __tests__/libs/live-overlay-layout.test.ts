import { containedPicture, drawOrder, isPortraitPicture, placeWidget, rectFor } from "../../libs/live-overlay/layout";
import type { OverlayWidget } from "../../libs/live-overlay/types";

/**
 * A widget is placed against the picture, not the player. A landscape stream on
 * a portrait phone is a band with black above and below, and a goal bar laid
 * out at the top of the frame belongs at the top of the band. The same cases as
 * dehubweb's layout test, so the two apps cannot place a widget differently.
 */

const widget = (over: Partial<OverlayWidget> = {}): OverlayWidget => ({
  id: "w",
  kind: "goal_bar",
  enabled: true,
  z: 0,
  landscape: { x: 0.1, y: 0, w: 0.8, h: 0.1 },
  portrait: { x: 0, y: 0.8, w: 1, h: 0.1 },
  settings: {},
  ...over,
});

describe("containedPicture", () => {
  it("letterboxes a 16:9 stream on a portrait phone", () => {
    expect(containedPicture(360, 640, 1920, 1080)).toEqual({ left: 0, top: 218.75, width: 360, height: 202.5 });
  });

  it("pillarboxes a 9:16 stream in a landscape player", () => {
    expect(containedPicture(1280, 720, 1080, 1920)).toEqual({ left: 437.5, top: 0, width: 405, height: 720 });
  });

  it("uses the whole box before the first frame tells it the size", () => {
    expect(containedPicture(400, 300, 0, 0)).toEqual({ left: 0, top: 0, width: 400, height: 300 });
  });

  it("draws nothing into a box with no size", () => {
    expect(containedPicture(0, 300, 1920, 1080)).toEqual({ left: 0, top: 0, width: 0, height: 0 });
  });
});

describe("placing a widget", () => {
  it("puts a top-of-frame widget at the top of the picture, not the screen", () => {
    const box = placeWidget(widget().landscape, containedPicture(360, 640, 1920, 1080));
    expect(box.left).toBeCloseTo(36);
    expect(box.top).toBeCloseTo(218.75);
    expect(box.width).toBeCloseTo(288);
    expect(box.height).toBeCloseTo(20.25);
  });

  it("uses the portrait layout for a portrait picture", () => {
    expect(isPortraitPicture(1080, 1920)).toBe(true);
    expect(rectFor(widget(), true)).toEqual({ x: 0, y: 0.8, w: 1, h: 0.1 });
    expect(isPortraitPicture(1080, 1080)).toBe(false);
  });

  it("stacks by z and keeps ties in the order they were placed", () => {
    const order = drawOrder([
      widget({ id: "a", z: 2 }),
      widget({ id: "b", z: 0 }),
      widget({ id: "c", z: 2 }),
      widget({ id: "d", z: 1 }),
    ]).map((w) => w.id);
    expect(order).toEqual(["b", "d", "a", "c"]);
  });
});
