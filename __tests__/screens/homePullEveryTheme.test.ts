import { readFileSync } from 'fs';
import { join } from 'path';

// The pill glow needs the home pull gesture on every theme. useCinematicPhone
// is Immersive-only, so gating the gesture on it hid the glow everywhere else.
it('enables the home pull on phones in every theme', () => {
  const source = readFileSync(join(__dirname, '../../screens/HomeScreen.tsx'), 'utf8');
  const call = source.match(/useHomePullRefresh\(([^;]*)\);/)?.[1] ?? '';
  expect(call).toMatch(/\bphone\b/);
  expect(call).not.toMatch(/cinematicPhone|\bisland\b/);
});
