import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

// Skia is only in the newer binaries, but updates reach every install on the
// same runtimeVersion. Reaching `@shopify/react-native-skia` from a plain
// import is a fatal error on the older ones the first time that code runs
// (2026-09-30: the audio styles and Theme Color took 20 phones down). So walk
// the app's static imports from the entry point and require that Skia is only
// ever reached through `optionalSkia(() => require(...))` in libs/skia.
const root = resolve(__dirname, '../..');
const SKIA = '@shopify/react-native-skia';
const EXTS = ['.ts', '.tsx', '.js', '.jsx'];

function resolveLocal(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const candidate of [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => resolve(base, 'index' + e))]) {
    if (EXTS.some((e) => candidate.endsWith(e)) && existsSync(candidate)) return candidate;
  }
  return null;
}

/** Whether `index` sits inside the argument list of an `optionalSkia(` call. */
function insideOptionalSkia(source: string, index: number): boolean {
  const call = source.lastIndexOf('optionalSkia(', index);
  if (call < 0) return false;
  let depth = 0;
  for (let i = call + 'optionalSkia'.length; i < index; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')') depth--;
  }
  return depth > 0;
}

/** Value (non-type) module specifiers a file loads eagerly. */
function eagerSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const statement = /^\s*(import|export)\s+([^'";]*?)\s*from\s*['"]([^'"]+)['"]/gm;
  for (const m of source.matchAll(statement)) {
    const clause = m[2].trim();
    if (/^type\s/.test(clause)) continue;
    if (m[1] === 'export' && !/^(\*|\{)/.test(clause)) continue;
    const named = clause.match(/^\{([^}]*)\}$/);
    if (named && named[1].split(',').every((s) => !s.trim() || /^type\s/.test(s.trim()))) continue;
    specs.push(m[3]);
  }
  for (const m of source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) specs.push(m[1]);
  for (const m of source.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (!insideOptionalSkia(source, m.index ?? 0)) specs.push(m[1]);
  }
  return specs;
}

function skiaPath(): string[] | null {
  const entry = resolve(root, 'index.ts');
  const parent = new Map<string, string | null>([[entry, null]]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift()!;
    const source = readFileSync(file, 'utf8');
    for (const spec of eagerSpecifiers(source)) {
      if (spec === SKIA || spec.startsWith(SKIA + '/')) {
        const chain = [SKIA];
        for (let at: string | null = file; at; at = parent.get(at) ?? null) chain.unshift(relative(root, at));
        return chain;
      }
      if (!spec.startsWith('.')) continue;
      const next = resolveLocal(file, spec);
      if (next && !parent.has(next)) {
        parent.set(next, file);
        queue.push(next);
      }
    }
  }
  return null;
}

describe('Skia stays optional', () => {
  it('is never reached from the entry point by a plain import or require', () => {
    expect(skiaPath()).toBeNull();
  });

  it('still finds a plain import when there is one', () => {
    expect(eagerSpecifiers(`import { Canvas } from "${SKIA}";`)).toEqual([SKIA]);
    expect(eagerSpecifiers(`import type { SkPicture } from "${SKIA}";`)).toEqual([]);
    expect(eagerSpecifiers(`import { type SkPicture } from "${SKIA}";`)).toEqual([]);
    expect(eagerSpecifiers(`const s = require("${SKIA}");`)).toEqual([SKIA]);
    expect(eagerSpecifiers(`const s = optionalSkia(() => {\n  return require("${SKIA}");\n});`)).toEqual([]);
  });
});
