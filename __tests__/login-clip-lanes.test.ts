import { loginClipLanes } from '../libs/login-clip-lanes';

describe('loginClipLanes', () => {
  it('keeps every clip exactly once across the two lanes', () => {
    const clips = ['a', 'b', 'c', 'd', 'e'];
    const lanes = loginClipLanes(clips, () => 0);
    expect([...lanes.first, ...lanes.second].sort()).toEqual(clips);
    expect(lanes.first).toHaveLength(3);
    expect(lanes.second).toHaveLength(2);
    expect(clips).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('changes the first visible clips when the shuffle changes', () => {
    const clips = ['a', 'b', 'c', 'd'];
    expect(loginClipLanes(clips, () => 0).first).not.toEqual(
      loginClipLanes(clips, () => 0.999).first,
    );
  });
  it('handles an empty catalogue', () => {
    expect(loginClipLanes([])).toEqual({ first: [], second: [] });
  });
  it('limits each visit to eight distinct clips from a larger catalogue', () => {
    const catalogue = Array.from({ length: 18 }, (_, i) => String(i));
    const lanes = loginClipLanes(catalogue, () => 0.25);
    const selected = [...lanes.first, ...lanes.second];
    expect(lanes.first).toHaveLength(4);
    expect(lanes.second).toHaveLength(4);
    expect(new Set(selected).size).toBe(8);
    expect(selected.every(clip => catalogue.includes(clip))).toBe(true);
  });
});

