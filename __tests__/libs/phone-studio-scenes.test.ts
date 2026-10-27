import {
  CARD_BACKGROUND,
  cardForScene,
  cardKey,
  formatCountdown,
  layoutCard,
  parseBackground,
  parseImageSource,
  pixelRect,
  placeSource,
  SCENES,
  SOURCE_POSITIONS,
  SOURCE_SIZES,
} from "../../libs/phone-studio/scenes";

const copy = { title: "Starting soon", subtitle: "The stream starts in" };

describe("scenes", () => {
  it("only Be right back mutes the mic", () => {
    expect(Object.values(SCENES).filter((s) => s.muteMic).map((s) => s.id)).toEqual(["brb"]);
  });

  it("gives a live scene no card", () => {
    expect(cardForScene("chatting", { title: "Just chatting" })).toBeNull();
  });

  it("counts Starting soon down from when the scene went up", () => {
    const card = cardForScene("starting", copy, { countdownMinutes: 5, startedAt: 1_000 });
    expect(card).toEqual({ title: "Starting soon", subtitle: "The stream starts in", background: CARD_BACKGROUND, countdownTo: 301_000 });
  });

  it("drops the countdown at zero minutes, and never counts down on other cards", () => {
    expect(cardForScene("starting", copy, { countdownMinutes: 0 })?.countdownTo).toBeNull();
    expect(cardForScene("brb", { title: "Be right back" }, { countdownMinutes: 5 })?.countdownTo).toBeNull();
  });
});

describe("formatCountdown", () => {
  it("reads m:ss and stops at 0:00", () => {
    expect(formatCountdown(65_000, 0)).toBe("1:05");
    expect(formatCountdown(600_000, 0)).toBe("10:00");
    expect(formatCountdown(1_000, 999)).toBe("0:01");
    expect(formatCountdown(0, 5_000)).toBe("0:00");
  });
});

describe("layoutCard", () => {
  it("centres a lone title", () => {
    const layout = layoutCard({ title: "Stream ending", background: "#000" }, 720, 1280, 0);
    expect(layout.lines).toHaveLength(1);
    expect(layout.lines[0].y).toBe(640);
    expect(layout.lines[0].size).toBe(Math.round(720 * 0.11));
    expect(layout.maxWidth).toBeCloseTo(648);
  });

  it("puts the subtitle and then the countdown under a lifted title", () => {
    const layout = layoutCard({ title: "Starting soon", subtitle: "Soon", background: "#000", countdownTo: 90_000 }, 720, 1280, 0);
    const [title, sub, count] = layout.lines;
    expect(title.y).toBeLessThan(640);
    expect(sub.text).toBe("Soon");
    expect(count.text).toBe("1:30");
    expect(sub.y).toBeGreaterThan(640);
    expect(count.y).toBeGreaterThan(sub.y);
    // The countdown is read from across the room: bigger than the subtitle.
    expect(count.size).toBeGreaterThan(sub.size);
  });

  it("scales with the shorter side, so landscape and portrait match", () => {
    const a = layoutCard({ title: "x", background: "#000" }, 720, 1280, 0);
    const b = layoutCard({ title: "x", background: "#000" }, 1280, 720, 0);
    expect(a.lines[0].size).toBe(b.lines[0].size);
  });
});

describe("cardKey", () => {
  it("changes when the countdown ticks and not otherwise", () => {
    const card = { title: "t", background: "#000", countdownTo: 10_000 };
    expect(cardKey(card, 0)).toBe(cardKey(card, 200));
    expect(cardKey(card, 0)).not.toBe(cardKey(card, 1_000));
    expect(cardKey(null, 0)).toBe("");
  });
});

describe("placeSource", () => {
  const within = (r: { x: number; y: number; w: number; h: number }) =>
    r.x >= 0 && r.y >= 0 && r.x + r.w <= 1 + 1e-9 && r.y + r.h <= 1 + 1e-9;

  it("keeps every corner and size inside the frame", () => {
    for (const p of SOURCE_POSITIONS) {
      for (const s of SOURCE_SIZES) {
        for (const aspect of [0.2, 1, 3]) {
          expect(within(placeSource(p, s, aspect))).toBe(true);
          expect(within(placeSource(p, s, aspect, 16 / 9))).toBe(true);
        }
      }
    }
  });

  it("keeps the image's own aspect on the frame", () => {
    const frameAspect = 9 / 16;
    const r = placeSource("top-left", "medium", 2, frameAspect);
    expect((r.w * frameAspect) / r.h).toBeCloseTo(2);
  });

  it("sits square in its corner: equal pixel margins on both axes", () => {
    const r = placeSource("bottom-right", "small", 1, 9 / 16);
    const px = pixelRect(r, 720, 1280);
    expect(720 - (px.x + px.w)).toBeCloseTo(1280 - (px.y + px.h), -1);
  });

  it("caps a very tall image at large size", () => {
    const r = placeSource("center", "large", 0.1, 9 / 16);
    expect(r.h).toBeLessThanOrEqual(0.9);
    expect(within(r)).toBe(true);
  });
});

describe("pixelRect", () => {
  it("clamps inside the frame", () => {
    expect(pixelRect({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 }, 100, 200)).toEqual({ x: 50, y: 100, w: 50, h: 100 });
    expect(pixelRect({ x: -1, y: 0, w: 2, h: 0.1 }, 100, 200)).toEqual({ x: 0, y: 0, w: 100, h: 20 });
  });
});

describe("saved settings", () => {
  it("falls back to off when a picture background has no picture", () => {
    expect(parseBackground({ mode: "image" }).mode).toBe("none");
    expect(parseBackground({ mode: "image", imageUri: "file:///a.jpg" }).mode).toBe("image");
  });

  it("rejects a malformed colour and an unknown mode", () => {
    const parsed = parseBackground({ mode: "sparkles", color: "red" });
    expect(parsed.mode).toBe("none");
    expect(parsed.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("reads an image source, repairing what it can", () => {
    expect(parseImageSource(null)).toBeNull();
    expect(parseImageSource({ uri: "" })).toBeNull();
    expect(parseImageSource({ uri: "file:///logo.png", aspect: -1, position: "middle", size: "huge" })).toEqual({
      uri: "file:///logo.png",
      aspect: 1,
      position: "top-right",
      size: "small",
      visible: true,
    });
  });
});
