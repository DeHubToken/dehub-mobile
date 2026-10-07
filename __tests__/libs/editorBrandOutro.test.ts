import { BRAND_OUTRO_DURATION, drawBrandOutro, outroSoundSample, outroUsername } from "../../libs/editor/brandOutro";
import { BRAND_OUTRO_RUNTIME } from "../../libs/editor/brandOutroRuntime";

function drawingContext() {
  const calls: unknown[][] = [];
  let alpha = 1;
  const ctx = {
    save: () => {}, restore: () => {}, setTransform: () => {},
    translate: (...args: number[]) => calls.push(["translate", ...args]),
    scale: (...args: number[]) => calls.push(["scale", ...args]), rotate: () => {},
    beginPath: () => {}, rect: () => {}, clip: () => {},
    fillRect: (...args: number[]) => calls.push(["rect", ...args]),
    drawImage: (...args: unknown[]) => calls.push(["image", ...args]),
    fillText: (...args: unknown[]) => calls.push(["text", ...args, alpha]),
    measureText: (text: string) => ({ width: text.length * 20 }),
    get globalAlpha() { return alpha; }, set globalAlpha(value: number) { alpha = value; },
    fillStyle: "", textAlign: "", textBaseline: "", font: "",
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe("branded video ending", () => {
  it("shows the creator profile URL without inventing an identity for signed-out exports", () => {
    expect(outroUsername(" @@mal\u202e\u200b ")).toBe("mal");
    expect(outroUsername(null)).toBe("");
    expect(Array.from(outroUsername("🙂".repeat(50)))).toHaveLength(40);
    const { ctx, calls } = drawingContext();
    drawBrandOutro(ctx, 1080, 1920, 1.6, "mal", {} as CanvasImageSource);
    expect(calls).toContainEqual(["text", "dehub.io/mal", 540, expect.any(Number), 1]);
    drawBrandOutro(ctx, 1920, 1080, 1.6, "", {} as CanvasImageSource);
    expect(calls).toContainEqual(["text", "dehub.io", 960, expect.any(Number), 1]);
  });

  it("keeps the small icon and credit centred in portrait, square and landscape output", () => {
    for (const [w, h] of [[1080, 1920], [1080, 1080], [1920, 1080]]) {
      const { ctx, calls } = drawingContext();
      drawBrandOutro(ctx, w, h, 1.8, "username".repeat(5), {} as CanvasImageSource);
      const images = calls.filter(c => c[0] === "image");
      expect(images).toHaveLength(1);
      const image = images[0];
      expect(image[4]).toBeCloseTo(Math.min(w, h) * 0.13);
      expect((image[5] as number) / (image[4] as number)).toBeCloseTo(1184 / 908);
      const position = calls.find(c => c[0] === "translate")!;
      expect(position[1]).toBe(w / 2);
      const text = calls.find(c => c[0] === "text")!;
      expect(text[2]).toBe(w / 2);
      const size = Number(ctx.font.split(" ")[1].replace("px", ""));
      const top = (position[2] as number) - (image[5] as number) / 2;
      const bottom = (text[3] as number) + size / 2;
      expect((top + bottom) / 2).toBeCloseTo(h / 2);
      expect(top).toBeGreaterThan(h * 0.3);
      expect(bottom).toBeLessThan(h * 0.7);
      expect(calls.filter(c => c[0] === "rect")).toEqual([["rect", 0, 0, w, h]]);
    }
  });

  it("deforms through a spin and reveals the credit after the icon settles", () => {
    const early = drawingContext(), settled = drawingContext();
    const logo = {} as CanvasImageSource;
    drawBrandOutro(early.ctx, 960, 540, 0.4, "mal", logo);
    drawBrandOutro(settled.ctx, 960, 540, 1.5, "mal", logo);
    const strips = early.calls.filter(c => c[0] === "image");
    expect(strips).toHaveLength(32);
    expect(new Set(strips.map(c => c[8])).size).toBeGreaterThan(1);
    expect(early.calls.find(c => c[0] === "text")![4]).toBe(0);
    expect(settled.calls.filter(c => c[0] === "image")).toHaveLength(1);
    expect(settled.calls.find(c => c[0] === "text")![4]).toBe(1);
  });

  it("produces an audible bounded original sound and finishes in silence", () => {
    const samples = Array.from({ length: Math.ceil(BRAND_OUTRO_DURATION * 48000) }, (_, i) => outroSoundSample(i / 48000));
    expect(samples.every(Number.isFinite)).toBe(true);
    expect(samples.slice(0, 5000).every(s => s === 0)).toBe(true);
    const peak = samples.reduce((p, s) => Math.max(p, Math.abs(s)), 0);
    expect(peak).toBeGreaterThan(0.05);
    expect(peak).toBeLessThan(0.4);
    expect(samples.slice(-20000).every(s => s === 0)).toBe(true);
  });
});

it("uses identical motion and sound in the native canvas", () => {
  const runtime = new Function(BRAND_OUTRO_RUNTIME + "; return { drawBrandOutro, outroSoundSample };")() as { drawBrandOutro: typeof drawBrandOutro; outroSoundSample: typeof outroSoundSample };
  const logo = {} as CanvasImageSource;
  for (const time of [0, 0.3, 0.65, 1.06, 1.4, 2.1]) {
    const expected = drawingContext(), native = drawingContext();
    drawBrandOutro(expected.ctx, 1080, 1920, time, "mal", logo);
    runtime.drawBrandOutro(native.ctx, 1080, 1920, time, "mal", logo);
    expect(native.calls).toEqual(expected.calls);
  }
  for (let i = 0; i < 2200; i++) expect(runtime.outroSoundSample(i / 1000)).toBe(outroSoundSample(i / 1000));
});
