import { cropPayload, cropRatioValue, dragCropRect, fitCropRect, isFullCrop } from './video-crop';
import { videoEditsPayload } from './post-video-edits';

describe('video crop', () => {
  it('fits a shape into the frame', () => {
    expect(fitCropRect(1, 16 / 9)).toEqual({ x: (1 - 9 / 16) / 2, y: 0, w: 9 / 16, h: 1 });
    expect(fitCropRect(16 / 9, 9 / 16).w).toBe(1);
    expect(fitCropRect(null, 1)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(cropRatioValue('original', 1.5)).toBe(1.5);
    expect(cropRatioValue('free', 1.5)).toBeNull();
  });

  it('keeps the shape while dragging a corner', () => {
    const r = dragCropRect(fitCropRect(1, 16 / 9), 'br', -0.1, 0, 1, 16 / 9)!;
    expect((r.w * 16) / 9 / r.h).toBeCloseTo(1);
    const moved = dragCropRect({ x: 0.2, y: 0, w: 0.5, h: 1 }, 'move', 0.9, 0, null, 1)!;
    expect(moved.x).toBeCloseTo(0.5);
  });

  it('sends only a real crop', () => {
    expect(isFullCrop({ x: 0, y: 0, w: 1, h: 1 })).toBe(true);
    expect(cropPayload({ x: 0, y: 0, w: 1, h: 1 })).toBeUndefined();
    expect(videoEditsPayload({ crop: { x: 0.25, y: 0, w: 0.5, h: 1 } })).toEqual({ crop: { x: 0.25, y: 0, w: 0.5, h: 1 } });
  });
});
