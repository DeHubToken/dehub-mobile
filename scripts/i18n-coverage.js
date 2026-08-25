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
 */
const fs = require('fs');
const path = require('path');

const LOCALES = path.join(__dirname, '..', 'i18n', 'locales');

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

if (args.includes('--baseline')) {
  fs.writeFileSync(BASELINE, `${JSON.stringify(orphans.slice().sort(), null, 2)}\n`);
  console.log(`\nbaseline rewritten: ${orphans.length} key(s)`);
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

if (unbaselined.length) {
  console.log(`\n${unbaselined.length} key(s) shipped English-only and are not in the baseline:`);
  unbaselined.forEach((k) => console.log(`  ${k}  ${JSON.stringify(en[k])}`));
  console.log('\nTranslate them into the locale files. The baseline is the backlog being worked through, not somewhere to add to.');
  process.exit(1);
}

if (orphans.length) {
  console.log(`\nall ${orphans.length} English-only key(s) are in the baseline backlog`);
  process.exit(0);
}

console.log('\nno English-only keys');
