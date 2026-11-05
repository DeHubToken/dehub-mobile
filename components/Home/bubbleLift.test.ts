import { ESCAPE_AT, ESCAPE_PERIOD, NOTE_LIFETIME, NOTE_POP_TIME, escapePose, floatingNote, knobCutoff, notePop, popShape, tubeNote } from './bubbleLift';

describe('Bubble lift motion', () => {
  it('moves every note up and right between off-tube respawns, with varied sizes', () => {
    const sizes = new Set<number>();
    for (let i = 0; i < 32; i++) {
      const a = tubeNote(i, 1, 220, 8), b = tubeNote(i, 1.001, 220, 8);
      expect(b.x).toBeGreaterThan(a.x);
      expect(b.y).toBeLessThan(a.y);
      sizes.add(a.size);
    }
    expect(sizes.size).toBeGreaterThan(20);
  });
  it('hands the tiny note off beyond the knob once per cycle', () => {
    for (const radius of [6, 7.5, 10, 15]) {
      expect(escapePose(ESCAPE_AT - .01, 100, radius, 8).ready).toBe(false);
      const end = escapePose(ESCAPE_AT, 100, radius, 8);
      expect(end.ready).toBe(true);
      expect(end.x).toBe(100 + radius + 12);
      expect(escapePose(ESCAPE_PERIOD + ESCAPE_AT, 100, radius, 8).cycle).toBe(1);
    }
  });
  it('uses the circular left edge of the knob as the cutoff', () => {
    expect(knobCutoff(100, 10, 6)).toBe('M0 -6H92A10 10 0 0 0 92 6H0Z');
  });
  it('keeps escaped notes in the viewport indefinitely, including after resize', () => {
    for (const [width, height] of [[320, 640], [1440, 900], [640, 320]]) {
      for (let age = 0; age <= 36000; age += 19) {
        const p = floatingNote(age, .63, 180, 430, width, height);
        expect(p.x).toBeGreaterThanOrEqual(12); expect(p.x).toBeLessThanOrEqual(width - 12);
        expect(p.y).toBeGreaterThanOrEqual(12); expect(p.y).toBeLessThanOrEqual(height - 12);
        expect(p.opacity).toBeGreaterThan(0);
      }
    }
  });
  it('pops each escaped bubble after its lifetime', () => {
    expect(notePop(NOTE_LIFETIME - 1)).toBe(0);
    expect(notePop(NOTE_LIFETIME + NOTE_POP_TIME / 2)).toBeCloseTo(.5);
    expect(notePop(NOTE_LIFETIME + NOTE_POP_TIME + .01)).toBe(1);
    const start = popShape(0, .4), end = popShape(1, .4);
    expect(end.ring).toBeGreaterThan(start.ring);
    expect(end.ringAlpha).toBe(0);
    expect(end.glyphAlpha).toBe(0);
    expect(start.drops).toHaveLength(6);
  });
});
