import { reframeKeys, subjectCentres } from "../../libs/editor/reframe";

const frame = (width: number, height: number, blobX: number) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, v = Math.abs(x - blobX) < 4 && Math.abs(y - height / 2) < 6 ? 250 : 40;
    data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
  }
  return { data, width, height };
};

describe("auto reframe", () => {
  it("follows a moving subject", () => {
    const centres = subjectCentres([frame(96, 54, 20), frame(96, 54, 24), frame(96, 54, 70), frame(96, 54, 74)]);
    expect(centres[1]).toBeLessThan(0.4);
    expect(centres[3]).toBeGreaterThan(0.6);
  });
  it("pans within the picture and holds small moves", () => {
    const overflow = (16 / 9) / (9 / 16);
    const keys = reframeKeys([{ t: 0, centre: 0.1 }, { t: 0.5, centre: 0.1 }, { t: 1, centre: 0.12 }, { t: 3, centre: 0.9 }, { t: 3.5, centre: 0.9 }, { t: 4, centre: 0.9 }], overflow);
    const limit = (overflow - 1) / 2;
    expect(keys[0].v).toBeLessThanOrEqual(0.5 + limit);
    expect(keys[0].v).toBeGreaterThan(0.5);
    expect(keys[keys.length - 1].v).toBeLessThan(0.5);
    expect(keys.every(k => Math.abs(k.v - 0.5) <= limit + 1e-9)).toBe(true);
  });
  it("does nothing when the video already fits", () => {
    expect(reframeKeys([{ t: 0, centre: 0.2 }], 1)).toEqual([]);
  });
});
