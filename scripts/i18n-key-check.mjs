#!/usr/bin/env node
/**
 * Fails when a translation key used in code would render wrong on screen.
 * Shared word for word between dehubweb and dehub-mobile. Change one, change both.
 *
 *  - t('a.b') where English has a.b as a group of keys, not text. i18next then
 *    shows "key 'a.b (en)' returned an object instead of string." (the
 *    community Chat tab, 2026-10-23, after communities.chat became the group
 *    of chat strings).
 *  - t('a.b') with no English and no inline default. The app shows the raw
 *    key; the web shows the last word of the key ("Title", "None").
 *  - t(`a.b.${x}`) where English has no a.b group at all.
 *  - A language whose value is a group where English has text, or the other
 *    way round. Text there hides the whole group, so it renders in English.
 *  - A translation whose {{placeholders}} are not the ones English has, or
 *    whose braces don't pair up, so the screen shows "{{puna}}" or "5}".
 *
 * Usage: node scripts/i18n-key-check.mjs [--json]
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const WEB = existsSync(join(ROOT, 'src/i18n/locales/en.json'));
const LOCALES = WEB ? 'src/i18n/locales' : 'i18n/locales';
const I18N = WEB ? 'src/i18n' : 'i18n';
const SOURCES = WEB ? ['src'] : readdirSync(ROOT).filter((name) => !['android', 'ios', 'node_modules', 'scripts', 'docs', 'assets', 'tests', '__tests__', '__mocks__', 'patches', 'emit', 'metro', 'babel'].includes(name));

const SKIP_DIRS = new Set(['node_modules', 'locales', '__tests__', 'test', 'tests', '__mocks__', 'dist', 'build']);
const CODE = /\.(tsx?|jsx?|mjs)$/;

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const get = (obj, key) => key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), obj);
const placeholders = (text) => new Set([...text.matchAll(/\{\{\s*([^}\s,]+)[^}]*\}\}/g)].map((m) => m[1]));

function walk(path, out = []) {
  if (!existsSync(path)) return out;
  if (!statSync(path).isDirectory()) {
    if (CODE.test(path) && !/\.(test|spec)\.[jt]sx?$/.test(path) && !path.endsWith('.d.ts')) out.push(path);
    return out;
  }
  for (const name of readdirSync(path)) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
    walk(join(path, name), out);
  }
  return out;
}

/** Load `export const NAME = {...}` from a plain-data module. */
const loadConst = (file) => new Function(readFileSync(file, 'utf8')
  .replace(/^export const \w+\s*(?::[^=]+)?=\s*/m, 'return ')
  .replace(/\}\s*as const;?\s*$/, '}'))();

const en = readJson(join(ROOT, LOCALES, 'en.json'));
// Copy registered at runtime with addResourceBundle rather than kept in the
// locale files (the Motion Library ships its own small bundle).
const MOTION = join(ROOT, I18N, 'motionLibraryCopy.ts');
if (existsSync(MOTION)) en.motionLibrary = { ...loadConst(MOTION).en, ...en.motionLibrary };

// Web docs pages read their own bundles (src/i18n/<lang>.ts) through
// useLanguage(), whose t() shows the raw key when English has no text for it.
const DOCS_EN = join(ROOT, 'src/i18n/en.ts');
const docsEn = existsSync(DOCS_EN) ? loadConst(DOCS_EN) : null;
const usesDocsT = (text) => docsEn && /\{[^}]*\bt\b[^}]*\}\s*=\s*useLanguage\(\)/.test(text);

/** True when the key (or a plural/context form of it) resolves to text. */
function resolvesToText(dict, key) {
  const value = get(dict, key);
  if (typeof value === 'string') return true;
  const cut = key.lastIndexOf('.');
  const parent = cut < 0 ? dict : get(dict, key.slice(0, cut));
  const leaf = key.slice(cut + 1);
  if (!parent || typeof parent !== 'object') return false;
  return Object.keys(parent).some((k) => k.startsWith(`${leaf}_`) && typeof parent[k] === 'string');
}

// t('key'), i18n.t("key"), i18nKey="key". Literal keys, then template keys.
const CALL = /(?<![\w$.])(?:i18n(?:ext)?\.t|t)\(\s*(['"`])([A-Za-z0-9_.-]+)\1\s*([,)])/g;
const PROP = /i18nKey=\{?\s*(['"`])([A-Za-z0-9_.-]+)\1/g;
// t(cond ? 'a.b' : 'c.d'): both branches.
const BRANCH = /(?<![\w$.])(?:i18n(?:ext)?\.t|t)\(\s*[^'"`(),;]+\?\s*(['"])([A-Za-z0-9_.-]+)\1\s*:\s*(['"])([A-Za-z0-9_.-]+)\3\s*\)/g;
const TEMPLATE = /(?<![\w$.])(?:i18n(?:ext)?\.t|t)\(\s*`([A-Za-z0-9_.-]+)\$\{/g;

const problems = [];
const seen = new Set();
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

for (const file of SOURCES.flatMap((dir) => walk(join(ROOT, dir)))) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);
  const docs = usesDocsT(text);
  const dict = docs ? docsEn : en;
  const detail = docs ? 'docs copy in src/i18n/en.ts' : undefined;

  for (const re of [CALL, PROP]) {
    re.lastIndex = 0;
    for (let m; (m = re.exec(text)); ) {
      const key = m[2];
      if (key.startsWith('.') || key.endsWith('.')) continue;
      if (!key.includes('.') && get(dict, key) === undefined) continue; // t('x') on a helper that is not i18n
      seen.add(key);
      const value = get(dict, key);
      if (docs ? typeof value === 'string' || Array.isArray(value) : resolvesToText(dict, key)) continue;
      const tail = text.slice(m.index, m.index + 600);
      if (value && typeof value === 'object') {
        if (!docs && /returnObjects/.test(tail.split('\n').slice(0, 6).join('\n'))) continue;
        problems.push({ kind: 'object', key, at: `${rel}:${lineOf(text, m.index)}`, detail });
        continue;
      }
      // An inline English default renders fine; flag only bare keys.
      const rest = tail.slice(m[0].length - 1);
      if (!docs && m[3] === ',' && /^\s*,\s*(['"`]|\{[^}]*defaultValue)/.test(rest)) continue;
      problems.push({ kind: 'missing', key, at: `${rel}:${lineOf(text, m.index)}`, detail });
    }
  }

  BRANCH.lastIndex = 0;
  for (let m; (m = BRANCH.exec(text)); ) {
    for (const key of [m[2], m[4]]) {
      if (!key.includes('.')) continue;
      seen.add(key);
      if (docs ? typeof get(dict, key) === 'string' : resolvesToText(dict, key)) continue;
      const value = get(dict, key);
      problems.push({ kind: value && typeof value === 'object' ? 'object' : 'missing', key, at: `${rel}:${lineOf(text, m.index)}`, detail });
    }
  }

  TEMPLATE.lastIndex = 0;
  for (let m; (m = TEMPLATE.exec(text)); ) {
    const prefix = m[1];
    // An inline English default covers every value of ${…}.
    const call = text.slice(m.index, m.index + 300);
    if (/^[^`]*`[^`]*`\s*,\s*(?!\{)/.test(call) || /^[^;]*?defaultValue/.test(call)) continue;
    const group = prefix.includes('.') ? prefix.slice(0, prefix.lastIndexOf('.')) : '';
    if (!group) continue;
    const node = get(dict, group);
    const leaf = prefix.slice(prefix.lastIndexOf('.') + 1);
    const fits = node && typeof node === 'object' && (!leaf || Object.keys(node).some((k) => k.startsWith(leaf)));
    if (!fits) problems.push({ kind: 'missing', key: `${prefix}…`, at: `${rel}:${lineOf(text, m.index)}`, detail: detail ?? `no English under ${group}` });
  }
}

// Every language against English: same shape, same placeholders.
function compare(lang, enNode, node, path) {
  if (node === undefined || node === null || enNode === undefined) return;
  const enIsText = typeof enNode === 'string';
  if (enIsText !== (typeof node === 'string')) {
    problems.push({ kind: 'shape', key: path, at: `${LOCALES}/${lang}.json` });
    return;
  }
  if (enIsText) {
    const want = placeholders(enNode);
    const have = placeholders(node);
    const extra = [...have].filter((p) => !want.has(p));
    // "One stream" may spell out the 1, so a singular form can drop {{count}}.
    const dropped = [...want].filter((p) => !have.has(p) && !(p === 'count' && /_(zero|one|two)$/.test(path)));
    const at = `${LOCALES}/${lang}.json`;
    if (extra.length) problems.push({ kind: 'placeholder', key: path, at, detail: `{{${extra.join('}}, {{')}}} is not in English` });
    else if (dropped.length) problems.push({ kind: 'placeholder', key: path, at, detail: `drops {{${dropped.join('}}, {{')}}}` });
    else if (/\{\{\{|\}\}\}/.test(node) && !/\{\{\{|\}\}\}/.test(enNode)) problems.push({ kind: 'placeholder', key: path, at, detail: 'stray brace' });
    return;
  }
  for (const k of Object.keys(node)) {
    const enChild = enNode[k] ?? enNode[k.replace(/_(zero|one|two|few|many|other)$/, '_other')];
    compare(lang, enChild, node[k], path ? `${path}.${k}` : k);
  }
}
const english = readJson(join(ROOT, LOCALES, 'en.json'));
for (const name of readdirSync(join(ROOT, LOCALES))) {
  if (!name.endsWith('.json') || name === 'en.json') continue;
  compare(name.replace(/\.json$/, ''), english, readJson(join(ROOT, LOCALES, name)), '');
}

const order = ['object', 'missing', 'shape', 'placeholder'];
problems.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.key.localeCompare(b.key));
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(problems, null, 2));
} else {
  const label = { object: 'is a group, not text', missing: 'has no English', shape: 'is shaped differently from English', placeholder: 'has a broken placeholder' };
  for (const p of problems) console.log(`${p.at}  ${p.key}  ${label[p.kind]}${p.detail ? ` (${p.detail})` : ''}`);
  console.log(`\n${seen.size} keys used in code checked against ${LOCALES}; ${problems.length} problem(s).`);
}
process.exitCode = problems.length ? 1 : 0;
