import { stepTimelineFrame } from "../../libs/editor/frameStep";

describe("timeline frame stepping", () => {
  for (const fps of [1, 24, 25, 29.97, 30, 60, 120]) {
    it(`advances and reverses exactly one frame at ${fps} fps`, () => {
      expect(stepTimelineFrame(15 / fps, 1, fps, 60)).toBeCloseTo(16 / fps, 12);
      expect(stepTimelineFrame(15 / fps, -1, fps, 60)).toBeCloseTo(14 / fps, 12);
    });
    it(`uses adjacent boundaries from a scrubbed time at ${fps} fps`, () => {
      expect(stepTimelineFrame(15.4 / fps, 1, fps, 60)).toBeCloseTo(16 / fps, 12);
      expect(stepTimelineFrame(15.4 / fps, -1, fps, 60)).toBeCloseTo(15 / fps, 12);
    });
  }
  it("does not create a phantom frame at a rounded source endpoint", () => {
    expect(stepTimelineFrame(20.066667, -1, 30, 20.066667)).toBeCloseTo(601 / 30, 12);
    expect(stepTimelineFrame(1.033333, 1, 30, 10)).toBeCloseTo(32 / 30, 12);
  });
  it("reaches a partial final frame and goes back to the prior boundary", () => {
    expect(stepTimelineFrame(20, 1, 30, 20.02)).toBe(20.02);
    expect(stepTimelineFrame(20.02, -1, 30, 20.02)).toBe(20);
  });
  it("clamps the start, end, empty timeline and out-of-range playhead", () => {
    expect(stepTimelineFrame(0, -1, 30, 10)).toBe(0);
    expect(stepTimelineFrame(10, 1, 30, 10)).toBe(10);
    expect(stepTimelineFrame(0, 1, 30, 0)).toBe(0);
    expect(stepTimelineFrame(-2, 1, 30, 10)).toBe(1 / 30);
    expect(stepTimelineFrame(12, -1, 30, 10)).toBeCloseTo(299 / 30, 12);
  });
  it("rejects unusable timing inputs", () => {
    for (const fps of [0, 121, NaN, Infinity]) expect(() => stepTimelineFrame(0, 1, fps, 10)).toThrow(RangeError);
    expect(() => stepTimelineFrame(NaN, 1, 30, 10)).toThrow(RangeError);
    expect(() => stepTimelineFrame(0, 1, 30, -1)).toThrow(RangeError);
  });
});
