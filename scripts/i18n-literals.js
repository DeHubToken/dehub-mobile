#!/usr/bin/env node
/**
 * Finds user-facing text that was typed straight into a component instead of
 * going through t().
 *
 * i18n-coverage.js catches a key that reaches no locale. It cannot catch this:
 * a string that was never keyed at all is invisible to it, renders English in
 * all 110 languages, and merges green. That is how ~600 of them accumulated —
 * not through screens anyone skipped, but one row at a time, each added to a
 * file that was already translated.
 *
 *   node scripts/i18n-literals.js            # summary
 *   node scripts/i18n-literals.js --list     # every literal, with line numbers
 *   node scripts/i18n-literals.js --file X   # just that file
 *
 * Exits 1 when a file carries more literals than i18n/literal-baseline.json
 * allows. The baseline is the backlog being worked through; a file that is not
 * in it must have none, so a new hardcoded string cannot merge.
 *
 *   node scripts/i18n-literals.js --baseline  # rewrite the baseline to today
 *
 * Only ever shrink the baseline. Raising an entry hides exactly the fault this
 * script exists to catch — lower it in the same PR that removes the literals.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BASELINE = path.join(ROOT, "i18n", "literal-baseline.json");

// Props whose value a person reads or hears. Anything not listed here is
// assumed to be plumbing — `name` on an icon, `testID`, `source`, a variant.
// Keep the list narrow: a false positive here costs someone a red build on a
// change that was fine.
const TEXT_PROPS = [
  "placeholder",
  "accessibilityLabel",
  "accessibilityHint",
  "title",
  "subtitle",
  "label",
  "sublabel",
  "confirmText",
  "cancelText",
  "emptyText",
  "helperText",
  "caption",
  "heading",
  "description",
];

const TOAST_FNS = ["toastError", "toastSuccess", "toastInfo", "toastWithAction"];

const SKIP = /node_modules|__tests__|\.test\.|[\/\\]scripts[\/\\]|[\/\\]i18n[\/\\]/;

/**
 * Blank out comments and import lines while keeping every byte offset, so the
 * line numbers in the report still point at the real source. Prose inside a
 * docblock is not shipped text and must not be reported.
 */
function mask(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\r\n]/g, " "));
  out = out.replace(/^([ \t]*)\/\/.*$/gm, (m) => m.replace(/[^\r\n]/g, " "));
  out = out.replace(/^import .*$/gm, (m) => m.replace(/[^\r\n]/g, " "));
  return out;
}

/** Text a person would read: starts with a letter, has a lowercase run or a space. */
function looksLikeProse(s) {
  const t = s.trim();
  if (t.length < 4) return false;
  if (!/^[A-Z]/.test(t)) return false; // sentences and labels start capitalised
  if (!/[a-z ]/.test(t)) return false; // ALLCAPSIDENTIFIER, not prose
  if (/^https?:|^[A-Z][a-z]+\.[a-z]/.test(t)) return false; // URL, Foo.bar
  return true;
}

function lineOf(src, index) {
  return src.slice(0, index).split(/\r?\n/).length;
}

function scanFile(file) {
  const src = fs.readFileSync(file, "utf8");
  const m = mask(src);
  const hits = [];
  const add = (index, text, kind) =>
    hits.push({ line: lineOf(src, index), text: text.trim(), kind });

  // 1. Text sitting between two tags: >Save changes<
  for (const hit of m.matchAll(/>\s*([^<>{}\n][^<>{}]*)\s*</g)) {
    if (looksLikeProse(hit[1])) add(hit.index, hit[1], "jsx");
  }

  // 2. A read-aloud prop given a bare string: accessibilityLabel="Send message"
  const propRe = new RegExp(`\\b(${TEXT_PROPS.join("|")})=\\{?"([^"]+)"\\}?`, "g");
  for (const hit of m.matchAll(propRe)) {
    if (looksLikeProse(hit[2])) add(hit.index, `${hit[1]}="${hit[2]}"`, "prop");
  }

  // 3. A toast built from a literal rather than a key.
  const toastRe = new RegExp(`\\b(${TOAST_FNS.join("|")})\\(\\s*"([^"]+)"`, "g");
  for (const hit of m.matchAll(toastRe)) {
    if (looksLikeProse(hit[2])) add(hit.index, `${hit[1]}("${hit[2]}")`, "toast");
  }

  return hits;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (SKIP.test(p) || entry.name === ".git") continue;
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const args = process.argv.slice(2);
const only = args.includes("--file") ? args[args.indexOf("--file") + 1] : null;
const files = walk(ROOT).filter((f) => !only || f.includes(only));

const found = {};
for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, "/");
  const hits = scanFile(f);
  if (hits.length) found[rel] = hits;
}

const total = Object.values(found).reduce((n, h) => n + h.length, 0);

if (args.includes("--baseline")) {
  const counts = {};
  for (const rel of Object.keys(found).sort()) counts[rel] = found[rel].length;
  fs.writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + "\n");
  console.log(`baseline written: ${Object.keys(counts).length} files, ${total} literals`);
  process.exit(0);
}

if (args.includes("--list")) {
  for (const rel of Object.keys(found).sort()) {
    console.log(`\n${rel}`);
    for (const h of found[rel]) console.log(`  ${String(h.line).padStart(5)}  ${h.text}`);
  }
}

const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")) : {};

const regressions = [];
const improvements = [];
for (const rel of Object.keys(found)) {
  const allowed = baseline[rel] ?? 0;
  if (found[rel].length > allowed) regressions.push({ rel, now: found[rel].length, allowed });
}
for (const rel of Object.keys(baseline)) {
  const now = found[rel] ? found[rel].length : 0;
  if (now < baseline[rel]) improvements.push({ rel, now, was: baseline[rel] });
}

console.log(
  `${total} hardcoded literal(s) in ${Object.keys(found).length} file(s); ` +
    `baseline allows ${Object.values(baseline).reduce((a, b) => a + b, 0)}`,
);

if (improvements.length) {
  console.log(`\n${improvements.length} file(s) improved — lower these in i18n/literal-baseline.json:`);
  for (const i of improvements) console.log(`  ${i.rel}: ${i.was} -> ${i.now}`);
}

if (regressions.length) {
  console.log(`\nNew hardcoded text — route it through t() with a key in all 110 locales:`);
  for (const r of regressions) {
    console.log(`\n  ${r.rel} (${r.now}, baseline allows ${r.allowed})`);
    for (const h of found[r.rel]) console.log(`    ${String(h.line).padStart(5)}  ${h.text}`);
  }
  console.log(
    `\nIf a match is genuinely not user-facing, the prop does not belong in\n` +
      `TEXT_PROPS in scripts/i18n-literals.js — fix it there, not in the baseline.`,
  );
  process.exit(1);
}

console.log("\nno new hardcoded text");
