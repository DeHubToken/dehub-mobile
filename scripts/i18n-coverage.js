#!/usr/bin/env node
/**
 * Reports how much of i18n/locales/en.json each locale actually carries.
 *
 * A key added to en.json and nowhere else renders in English for every other
 * language — fallbackLng hides it, so nothing fails and nobody notices. Run
 * this after touching en.json:
 *
 *   node scripts/i18n-coverage.js            # summary
 *   node scripts/i18n-coverage.js --missing  # list the English-only keys
 *   node scripts/i18n-coverage.js --locale fr
 *
 * Exits 1 when a key in en.json reaches no locale at all, unless that key is
 * already listed in i18n/orphan-baseline.json. The baseline is the backlog we
 * are working through; a key that is not in it is a feature that shipped
 * English-only, and CI fails so it cannot merge that way.
 *
 *   node scripts/i18n-coverage.js --baseline  # rewrite the baseline to today
 *
 * Only ever shrink the baseline. Adding to it hides exactly the fault this
 * script exists to catch.
 *
 * `--copies` additionally counts values that are byte-identical to English.
 * Those are not missing keys, so nothing flags them, but they are what a
 * reader of that language actually sees.
 *
 * It also catches the case this script could not see at all: a t() call whose
 * key is in NO locale file, English included, because the English text was
 * passed as the call's own fallback. Those render English everywhere exactly
 * like an orphan, but never appear in en.json, so nothing above compares them
 * against anything. They have their own backlog file for the same reason.
 *
 *   node scripts/i18n-coverage.js --fallbacks  # list them all
 */
const fs = require('fs');
const path = require('path');

const LOCALES = path.join(__dirname, '..', 'i18n', 'locales');
const REPO = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '__tests__', '__mocks__', 'android', 'ios', 'locales', '.git', 'scripts']);

const flatten = (obj, prefix = '', out = {}) => {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, full, out);
    else out[full] = value;
  }
  return out;
};

const en = flatten(JSON.parse(fs.readFileSync(path.join(LOCALES, 'en.json'), 'utf8')));
const enKeys = Object.keys(en);
const codes = fs.readdirSync(LOCALES).filter((f) => f.endsWith('.json') && f !== 'en.json').map((f) => f.slice(0, -5));

const missingIn = new Map();
const rows = codes.map((code) => {
  const locale = flatten(JSON.parse(fs.readFileSync(path.join(LOCALES, `${code}.json`), 'utf8')));
  const missing = enKeys.filter((k) => typeof locale[k] !== 'string' || !locale[k].trim());
  const copies = enKeys.filter((k) => typeof locale[k] === 'string' && locale[k] === en[k] && String(en[k]).length > 3);
  for (const key of missing) missingIn.set(key, (missingIn.get(key) ?? 0) + 1);
  return { code, missing, copies, pct: +(100 * (enKeys.length - missing.length) / enKeys.length).toFixed(1) };
});

/**
 * Keys that are called with a fallback and defined nowhere.
 *
 * `t('settings.profiles', 'Profiles')` renders "Profiles" in every language,
 * because i18next returns the fallback when the key is missing — and it is
 * missing from en.json too, so the coverage pass above never sees it. To a
 * reader of any other language this is indistinguishable from an orphan; the
 * only difference is that nothing was flagging it.
 *
 * Template-literal keys are deliberately not matched: they are assembled at
 * runtime and cannot be checked statically.
 */
const scanFallbackOnlyKeys = () => {
  const found = new Map();
  const CALL = /(?<![A-Za-z0-9_$.])t\(\s*['"]([A-Za-z0-9_.\-]+)['"]\s*,/g;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(entry.name)) continue;
      const source = fs.readFileSync(full, 'utf8');
      let match;
      while ((match = CALL.exec(source))) {
        const key = match[1];
        if (key in en) continue;
        const rel = path.relative(REPO, full).replace(/\\/g, '/');
        if (!found.has(key)) found.set(key, new Set());
        found.get(key).add(rel);
      }
    }
  };
  walk(REPO);
  return found;
};

const fallbackOnly = scanFallbackOnlyKeys();

const args = process.argv.slice(2);
const one = args.includes('--locale') ? args[args.indexOf('--locale') + 1] : null;

if (one) {
  const row = rows.find((r) => r.code === one);
  if (!row) { console.error(`no locale "${one}"`); process.exit(1); }
  console.log(`${one}: ${row.pct}% (${row.missing.length} missing, ${row.copies.length} identical to English)`);
  row.missing.forEach((k) => console.log(`  ${k}  ${JSON.stringify(en[k])}`));
  process.exit(0);
}

const orphans = [...missingIn.entries()].filter(([, n]) => n === codes.length).map(([k]) => k);

console.log(`en.json: ${enKeys.length} keys across ${codes.length} locales`);
console.log(`complete locales: ${rows.filter((r) => !r.missing.length).length}/${codes.length}`);
const worst = rows.slice().sort((a, b) => a.pct - b.pct).slice(0, 10);
if (worst[0] && worst[0].missing.length) {
  console.log('lowest coverage:');
  worst.forEach((r) => console.log(`  ${r.code.padEnd(5)} ${String(r.pct).padStart(5)}%  ${r.missing.length} missing`));
}

if (args.includes('--copies')) {
  console.log('\nmost English text left in place:');
  rows.slice().sort((a, b) => b.copies.length - a.copies.length).slice(0, 15)
    .forEach((r) => console.log(`  ${r.code.padEnd(5)} ${String(r.copies.length).padStart(5)} of ${enKeys.length}`));
}


const BASELINE = path.join(__dirname, '..', 'i18n', 'orphan-baseline.json');
const FALLBACK_BASELINE = path.join(__dirname, '..', 'i18n', 'fallback-baseline.json');

const fallbackKeys = [...fallbackOnly.keys()].sort();

if (args.includes('--fallbacks')) {
  console.log(`\n${fallbackKeys.length} key(s) defined nowhere, rendering their fallback in every language:`);
  fallbackKeys.forEach((k) => console.log(`  ${k}  ${[...fallbackOnly.get(k)].join(', ')}`));
  process.exit(0);
}

if (args.includes('--baseline')) {
  fs.writeFileSync(BASELINE, `${JSON.stringify(orphans.slice().sort(), null, 2)}\n`);
  fs.writeFileSync(FALLBACK_BASELINE, `${JSON.stringify(fallbackKeys, null, 2)}\n`);
  console.log(`\nbaseline rewritten: ${orphans.length} orphan(s), ${fallbackKeys.length} fallback-only key(s)`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE) ? new Set(JSON.parse(fs.readFileSync(BASELINE, 'utf8'))) : new Set();
const unbaselined = orphans.filter((k) => !baseline.has(k));
const cleared = [...baseline].filter((k) => !orphans.includes(k));

if (orphans.length) {
  console.log(`\n${orphans.length} key(s) exist only in English — every other language falls back:`);
  const show = args.includes('--missing') ? orphans : orphans.slice(0, 20);
  show.forEach((k) => console.log(`  ${k}  ${JSON.stringify(en[k])}`));
  if (show.length < orphans.length) console.log(`  … ${orphans.length - show.length} more (--missing to list all)`);
}

if (cleared.length) {
  console.log(`\n${cleared.length} baselined key(s) are now translated — run --baseline to shrink the baseline.`);
}

const fallbackBaseline = fs.existsSync(FALLBACK_BASELINE)
  ? new Set(JSON.parse(fs.readFileSync(FALLBACK_BASELINE, 'utf8')))
  : new Set();
const newFallbacks = fallbackKeys.filter((k) => !fallbackBaseline.has(k));
const clearedFallbacks = [...fallbackBaseline].filter((k) => !fallbackOnly.has(k));

if (fallbackKeys.length) {
  console.log(`\n${fallbackKeys.length} key(s) are defined in no locale file and render their fallback everywhere (${clearedFallbacks.length} cleared since the baseline)`);
}

if (unbaselined.length) {
  console.log(`\n${unbaselined.length} key(s) shipped English-only and are not in the baseline:`);
  unbaselined.forEach((k) => console.log(`  ${k}  ${JSON.stringify(en[k])}`));
  console.log('\nTranslate them into the locale files. The baseline is the backlog being worked through, not somewhere to add to.');
  process.exit(1);
}

if (newFallbacks.length) {
  console.log(`\n${newFallbacks.length} new t() key(s) have no entry in en.json, so the English text is the call's fallback:`);
  newFallbacks.forEach((k) => console.log(`  ${k}  ${[...fallbackOnly.get(k)].join(', ')}`));
  console.log('\nAdd them to i18n/locales/en.json and translate them. A fallback string reads');
  console.log('as English to all 110 other languages, and nothing else in this script can see it.');
  process.exit(1);
}

if (orphans.length) {
  console.log(`\nall ${orphans.length} English-only key(s) are in the baseline backlog`);
  process.exit(0);
}

console.log('\nno English-only keys');
