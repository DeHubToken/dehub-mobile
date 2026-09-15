import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) tsxFiles(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** Every `<SmartImage … />` in the app, with the file and line it sits on. */
function smartImageUsages() {
  const usages: { where: string; block: string }[] = [];
  for (const file of [...tsxFiles(join(root, 'components')), ...tsxFiles(join(root, 'screens'))]) {
    // Its own definition takes both props by design; the rule is about callers.
    if (file.endsWith(join('common', 'SmartImage.tsx'))) continue;
    const src = readFileSync(file, 'utf8');
    let i = 0;
    while ((i = src.indexOf('<SmartImage', i)) !== -1) {
      const end = src.indexOf('/>', i);
      const line = src.slice(0, i).split('\n').length;
      usages.push({
        where: `${file.slice(root.length + 1)}:${line}`,
        block: src.slice(i, end === -1 ? i + 400 : end),
      });
      i = end === -1 ? i + 1 : end;
    }
  }
  return usages;
}

/**
 * SmartImage renders expo-image, which NativeWind has no interop for: a
 * `className` on it is passed down as an unrecognised prop and dropped, so the
 * image ends up with no size and no position and never even requests its
 * source. It renders as nothing, on top of whatever the parent painted — which
 * is exactly how every live post's cover became an empty slab.
 */
describe('SmartImage call sites', () => {
  it('finds the call sites at all', () => {
    expect(smartImageUsages().length).toBeGreaterThan(10);
  });

  it('styles every image with style, never className', () => {
    const wrong = smartImageUsages().filter(
      u => !/\bstyle=/.test(u.block) || /\bclassName=/.test(u.block),
    );

    expect(wrong.map(u => u.where)).toEqual([]);
  });
});
