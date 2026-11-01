import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// patchUser must not hand out a new user object when nothing changed: every
// useUser() consumer re-renders on a new object.
it('patchUser returns early when the partial changes nothing', () => {
  const src = readFileSync(resolve(__dirname, '../../hooks/useAuthSession.ts'), 'utf8');
  const body = src.slice(src.indexOf('const patchUser = useCallback('), src.indexOf('const refreshUser = useCallback('));
  expect(body).toMatch(/Object\.is\(\(current as any\)\[key\], \(partial as any\)\[key\]\)/);
  expect(body.indexOf('if (!changed) return current;')).toBeLessThan(body.indexOf('setUser(merged)'));
});
