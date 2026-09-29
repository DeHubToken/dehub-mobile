import { compareVersions, updateMode } from '../../libs/app-version';

describe('app version policy', () => {
  it('compares dotted versions numerically', () => {
    expect(compareVersions('1.17.7', '1.18.0')).toBe(-1);
    expect(compareVersions('1.18.10', '1.18.9')).toBe(1);
    expect(compareVersions('1.18', '1.18.0')).toBe(0);
  });

  it('asks old builds to update and leaves current ones alone', () => {
    const policy = { min_version: null, recommended_version: '1.18.0' };
    expect(updateMode('1.17.7', policy)).toBe('recommended');
    expect(updateMode('1.18.0', policy)).toBeNull();
  });

  it('requires the update below the minimum', () => {
    expect(updateMode('1.17.0', { min_version: '1.18.0', recommended_version: '1.19.0' })).toBe('required');
    expect(updateMode('1.18.2', { min_version: '1.18.0', recommended_version: '1.19.0' })).toBe('recommended');
  });
});
