import { BRAND_OUTRO_DURATION, drawBrandOutro, outroSoundSample, outroUsername } from "../../libs/editor/brandOutro";
import { BRAND_OUTRO_RUNTIME } from "../../libs/editor/brandOutroRuntime";

function drawingContext() {
  const calls: unknown[][] = [];
  const ctx = {
    save: () => {}, restore: () => {}, setTransform: () => {}, translate: () => {}, scale: () => {},
    beginPath: () => {}, rect: () => {}, clip: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {}, rotate: () => {},
    fillRect: (...args: number[]) => calls.push(["rect", ...args]),
    drawImage: (...args: unknown[]) => calls.push(["image", ...args]),
    fillText: (...args: unknown[]) => calls.push(["text", ...args]),
    measureText: (text: string) => ({ width: text.length * 50 }),
    globalAlpha: 1, fillStyle: "", textAlign: "", textBaseline: "", font: "",
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe("branded video ending", () => {
  it("uses identical animation and sound inside the native canvas", () => {
    const runtime = new Function(BRAND_OUTRO_RUNTIME + "; return { drawBrandOutro, outroSoundSample };")() as { drawBrandOutro: typeof drawBrandOutro; outroSoundSample: typeof outroSoundSample };
    for (const time of [0, 0.3, 0.8, 1.6, 2.1]) {
      const expected = drawingContext();
      const native = drawingContext();
      const logo = {} as CanvasImageSource;
      const artwork = { logo, background: logo, globe: logo, star: logo };
      drawBrandOutro(expected.ctx, 1080, 1920, time, "mal", logo, artwork);
      runtime.drawBrandOutro(native.ctx, 1080, 1920, time, "mal", logo, artwork);
      expect(native.calls).toEqual(expected.calls);
    }
    for (let i = 0; i < 2200; i++) expect(runtime.outroSoundSample(i / 1000)).toBe(outroSoundSample(i / 1000));
  });
  it("shows the creator profile URL without inventing an identity for signed-out exports", () => {
    expect(outroUsername(" @@mal\u202e\u200b ")).toBe("mal");
    expect(outroUsername(null)).toBe("");
    expect(Array.from(outroUsername("🙂".repeat(50)))).toHaveLength(40);
    const { ctx, calls } = drawingContext();
    drawBrandOutro(ctx, 1080, 1920, 1, "mal", {} as CanvasImageSource);
    expect(calls).toContainEqual(["text", "dehub.io/mal", 540, expect.any(Number)]);
    drawBrandOutro(ctx, 1920, 1080, 1, "", {} as CanvasImageSource);
    expect(calls).toContainEqual(["text", "dehub.io", 960, expect.any(Number)]);
  });

  it("keeps the icon and profile URL inside portrait, square and landscape output", () => {
    for (const [w, h] of [[1080, 1920], [1080, 1080], [1920, 1080]]) {
      const { ctx, calls } = drawingContext();
      drawBrandOutro(ctx, w, h, 1, "username".repeat(5), {} as CanvasImageSource);
      const image = calls.find((c) => c[0] === "image")!;
      expect(image[4] as number).toBeLessThan(w);
      expect(image[5] as number).toBeLessThan(h);
      expect((image[5] as number) / (image[4] as number)).toBeCloseTo(1184 / 908);
      const text = calls.find((c) => c[0] === "text")!;
      expect(text[3] as number).toBeLessThan(h * 0.9);
    }
  });

  it("renders the chrome artwork and keeps the credit below the icon", () => {
    const { ctx, calls } = drawingContext();
    const logo = {} as CanvasImageSource;
    const background = {} as CanvasImageSource, globe = {} as CanvasImageSource, star = {} as CanvasImageSource;
    drawBrandOutro(ctx, 960, 540, 1.8, "mal", logo, { logo, background, globe, star });
    expect(calls.filter(c => c[0] === "image" && c[1] === background)).toHaveLength(1);
    expect(calls.filter(c => c[0] === "image" && c[1] === globe)).toHaveLength(1);
    expect(calls.filter(c => c[0] === "image" && c[1] === star)).toHaveLength(2);
    const text = calls.find(c => c[0] === "text")!;
    expect(text[1]).toBe("dehub.io/mal");
    expect(text[3] as number).toBeGreaterThan(540 * 0.417 + 540 * 0.273 * 1184 / 908 / 2);
  });

  it("produces an audible bounded original sound and finishes in silence", () => {
    const samples = Array.from({ length: Math.ceil(BRAND_OUTRO_DURATION * 48000) }, (_, i) => outroSoundSample(i / 48000));
    expect(samples.every(Number.isFinite)).toBe(true);
    expect(samples.slice(0, 5000).every((s) => s === 0)).toBe(true);
    const peak = samples.reduce((p, s) => Math.max(p, Math.abs(s)), 0);
    expect(peak).toBeGreaterThan(0.05);
    expect(peak).toBeLessThan(0.4);
    expect(samples.slice(-20000).every((s) => s === 0)).toBe(true);
  });
});
