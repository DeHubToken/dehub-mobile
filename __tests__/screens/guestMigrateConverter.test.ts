import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readSource = (path: string) =>
  readFileSync(resolve(__dirname, '../..', path), 'utf8');

describe('Migrate and Converter for signed-out users', () => {
  const migrate = readSource('screens/MigrateScreen.tsx');
  const converter = readSource('screens/ConverterScreen.tsx');

  it('lets guests stay on Migrate and sign in from its own button', () => {
    expect(migrate).not.toContain('useGateToHome');
    expect(migrate).toContain("t('migrate.signInToShow')");
    expect(migrate).toContain('if (!isSignedIn) { navigation.navigate(ScreenNames.SignIn); return; }');
  });

  it('returns to the existing Home from Migrate instead of pushing a second one', () => {
    expect(migrate).toContain(
      'navigation.navigate(ScreenNames.Root, { screen: ScreenNames.Home }, { pop: true })',
    );
    expect(migrate).not.toMatch(/navigation\.navigate\(ScreenNames\.Root\)/);
  });

  it('shows guests the Converter header and a sign-in prompt instead of bouncing them', () => {
    expect(converter).not.toContain('useGateToHome');
    expect(converter).toContain("import { SignInPrompt } from '../components/auth/SignInGate';");

    const guard = converter.indexOf('if (!(isSignedIn && !needsUsername)) {');
    expect(guard).toBeGreaterThan(-1);
    const guestView = converter.slice(guard, converter.indexOf('\n  }', guard));
    expect(guestView).toContain("<ScreenHeader title={t('converter.title')} />");
    expect(guestView).toContain('<SignInPrompt />');
  });

  it('decides the guest view only after every Converter hook has run', () => {
    const body = converter.slice(converter.indexOf('export default function ConverterScreen'));
    const guard = body.indexOf('if (!(isSignedIn && !needsUsername)) {');
    const hookCalls = [...body.matchAll(/\buse[A-Z]\w*\(/g)].map(m => m.index ?? 0);
    expect(hookCalls.length).toBeGreaterThan(0);
    expect(Math.max(...hookCalls)).toBeLessThan(guard);
  });
});
