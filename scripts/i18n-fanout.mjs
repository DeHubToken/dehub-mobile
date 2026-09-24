#!/usr/bin/env node
/**
 * Fills the keys a locale is missing from en.json, using the deployed
 * translate-text edge function.
 *
 * Ported from dehubweb/scripts/i18n-fanout.mjs, which it mirrors guard for
 * guard. Two differences: files are written back in their own key order and
 * line endings (the mobile locales are CRLF and round-trip exactly through
 * JSON.stringify), so a run diffs as +N lines per file rather than a re-sort;
 * and --only takes an explicit key list for strings added outside a namespace.
 *
 *   node scripts/i18n-fanout.mjs --check                 # report only, no writes, no network
 *   node scripts/i18n-fanout.mjs --locale de             # fill one locale
 *   node scripts/i18n-fanout.mjs --locales de,fr,pt      # fill several
 *   node scripts/i18n-fanout.mjs --all --limit 8         # the 8 furthest-behind locales
 *   node scripts/i18n-fanout.mjs --locale de --keys 200  # cap the work in one run
 *   node scripts/i18n-fanout.mjs --all --prefix calls.   # one namespace, every locale
 *   node scripts/i18n-fanout.mjs --all --only a.b,c.d    # exactly these keys
 *
 * Why this exists: extracting a page into `t()` calls makes it translatable, it
 * does not make it translated. A key that reaches only en.json renders English
 * in the other 109 languages, and scripts/i18n-coverage.mjs cannot fail the
 * build for it as long as one locale carries the key. This script closes that
 * gap in bulk.
 *
 * Three rules it will not break:
 *
 *   1. An existing translation is never overwritten. Only missing keys are sent.
 *   2. A string whose placeholders do not survive the round trip is DROPPED, not
 *      written. Machine translation reorders and mangles `{{count}}`, `{amount}`
 *      and `<b>` — observed live, e.g. "{{count}} day" coming back as
 *      "{\n{count}} Tag". A missing key falls back to English and looks fine; a
 *      corrupted placeholder renders literal braces at the user, or breaks
 *      <Trans>. English is the better failure.
 *   3. The file is rewritten from a parsed object, so a malformed response can
 *      never produce malformed JSON.
 *
 * Placeholders are swapped for @@n@@ sentinels before sending, because the
 * translator handles those far better than raw braces or tags — but sentinels
 * are corrupted too sometimes ("@ @ 0 @ @"), which is what rule 2 catches.
 */
import fs from 'node:fs';
import path from 'node:path';

const LOCALES_DIR = 'i18n/locales';
const FN_URL = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/translate-text';

/** Batching. Larger batches are cheaper but lose more work when one line drifts. */
const BATCH_LINES = 30;
const PAUSE_MS = 350;
const MAX_RETRIES = 3;

/** Anything i18next or <Trans> reads back out of the string. */
const PLACEHOLDER = /\{\{[^}]+\}\}|\{[a-zA-Z0-9_]+\}|<\/?[a-zA-Z][a-zA-Z0-9]*>/g;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};

const CHECK_ONLY = flag('check');
const KEY_BUDGET = Number(value('keys') || Infinity);
/**
 * `--prefix creatorFlow.` restricts the run to keys under one namespace, so a
 * feature branch can fill its own strings in every locale without touching
 * the wider backlog (and without a 2,000-key run per locale to get there).
 */
const KEY_PREFIX = value('prefix') || '';
/** --only a.b,c.d restricts the run to exactly these keys. */
const ONLY_KEYS = value('only') ? new Set(value('only').split(',').map((k) => k.trim()).filter(Boolean)) : null;

/** The publishable key the browser bundle already ships — not a secret. */
function anonKey() {
  if (process.env.SUPABASE_PUBLISHABLE_KEY) return process.env.SUPABASE_PUBLISHABLE_KEY;
  // The mobile key lives in the untracked .env; fall back to it.
  const env = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
  const found = env.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*["']?(ey[A-Za-z0-9._-]{40,})/);
  if (!found) throw new Error('Set SUPABASE_PUBLISHABLE_KEY (the public anon key) or add it to .env');
  return found[1];
}

/* ---------- flatten / rebuild ---------- */

function flatten(node, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out.set(key, v);
  }
  return out;
}

function setDeep(root, dottedKey, val) {
  const parts = dottedKey.split('.');
  let node = root;
  for (const part of parts.slice(0, -1)) {
    if (!node[part] || typeof node[part] !== 'object') node[part] = {};
    node = node[part];
  }
  node[parts.at(-1)] = val;
}

/**
 * Rebuild the locale in en.json's key order, so a filled file diffs against
 * English cleanly instead of listing new keys wherever they happened to land.
 */
function reorderLike(template, filled) {
  if (Array.isArray(template) || typeof template !== 'object' || template === null) return filled;
  const out = {};
  for (const k of Object.keys(template)) {
    if (!(k in filled)) continue;
    out[k] = reorderLike(template[k], filled[k]);
  }
  for (const k of Object.keys(filled)) if (!(k in out)) out[k] = filled[k];
  return out;
}

/* ---------- placeholder protection ---------- */

function protect(text) {
  const found = [];
  const masked = text.replace(PLACEHOLDER, (m) => {
    found.push(m);
    return `@@${found.length - 1}@@`;
  });
  return { masked, found };
}

/**
 * One space is the only whitespace the translator inserts inside a sentinel,
 * and never a newline — batches are split on those before we get here.
 */
const GAP = '[ \t\u00a0]?';

/** How many @ signs a mangled sentinel is allowed on each side. */
function sentinelPattern(index, run) {
  return `(?:@${GAP}){1,${run}}${index}(?:${GAP}@){1,${run}}`;
}

/**
 * Put the placeholders back.
 *
 * The translator does not hand the sentinels back intact. Measured against the
 * live edge function, `@@0@@ joined "@@1@@"` comes back as `@0@ ... "@1@@"` (bn),
 * `@0@@ ... "@1@@"` (tg) and `@ @ 1 @ @` (sr): it inserts spaces AND drops one of
 * the four @ signs, the second being much the more common and the one the old
 * pattern did not cover. A dropped @ left the sentinel in the string, so
 * placeholdersMatch failed and the key stayed English in every locale whose
 * translator did that — two-placeholder strings almost never survived.
 *
 * So try the sentinel forms in order of how much they assume, and take the
 * first result that lands back on the @ count the English had:
 *
 *   1. intact `@@n@@` first, then a run of at most two @ per side. Matching the
 *      intact form first stops a looser pattern eating a good sentinel, which
 *      matters for strings like "@{{name}} is sharing" (masked `@@@0@@`).
 *   2. the same with a run of three, for `@1 @ @@`.
 *   3. runs of three then four WITHOUT the intact form, so a stray @ sitting
 *      against a good sentinel (`@ @@1@@`) is absorbed rather than left behind.
 *
 * The @ count is what keeps step 3 honest: it can swallow an @ that belongs to
 * the text, and a variant that does is rejected in favour of the tightest pass.
 * Anything still unresolved falls through to looksUnfinished/placeholdersMatch
 * and is dropped, exactly as before — English beats literal braces.
 */
function restoreAt(masked, found, run, exactFirst) {
  let out = masked;
  for (let i = 0; i < found.length; i++) {
    const forms = exactFirst ? [`@@${i}@@`, sentinelPattern(i, run)] : [sentinelPattern(i, run)];
    for (const pattern of forms) {
      const next = out.replace(new RegExp(pattern, 'g'), () => found[i]);
      if (next !== out) {
        out = next;
        break;
      }
    }
  }
  return out;
}

/** Every @ in the string. A correct restore lands back on the English count. */
const atCount = (text) => (text.match(/@/g) || []).length;

function restore(masked, found, source) {
  const target = atCount(source);
  let tightest = null;
  for (const [run, exactFirst] of [[2, true], [3, true], [3, false], [4, false]]) {
    const out = restoreAt(masked, found, run, exactFirst);
    if (tightest === null) tightest = out;
    if (atCount(out) === target) return out;
  }
  return tightest;
}

/** The check rule 2 turns on: same placeholders, same number of them. */
function placeholdersMatch(source, candidate) {
  const a = (source.match(PLACEHOLDER) || []).slice().sort();
  const b = (candidate.match(PLACEHOLDER) || []).slice().sort();
  if (a.length !== b.length) return false;
  return a.every((x, i) => x === b[i]);
}

function looksUnfinished(candidate, source) {
  if (candidate.trim() === '' || candidate.includes('@@') || /@\s@/.test(candidate)) return true;
  // A leftover @ the English never had is sentinel debris the restore could
  // not place — the string reads as corrupted whatever else survived.
  return atCount(candidate) > atCount(source);
}

/**
 * A sentence of English function words. Used to tell "the translator handed the
 * source straight back" from "this string is the same in both languages" —
 * "Visa, Mastercard, Apple Pay" and "$42,000 market cap" are legitimately
 * unchanged, "Introducing DeHub Premium" is a silent failure.
 *
 * Writing the English back into a locale file is worse than leaving the key
 * out: the value renders identically either way, but a written key counts as
 * translated in the coverage report, so nobody ever finds it again. dehub-mobile
 * is full of exactly this — 187 English sentences sitting in de.json.
 */
const ENGLISH_FUNCTION_WORDS =
  /\b(the|a|an|is|are|was|be|to|for|your|you|and|or|not|no|with|of|in|on|at|can|will|please|cannot|this|that|from|have|has|it|we|our|out|up|off|back|when|what|how|all|more|new|now)\b/i;

/**
 * Locales written in a script other than Latin. For these there is a far
 * stronger test than word-counting: a Russian string containing no Cyrillic at
 * all was not translated, whatever it says. Word heuristics miss short ones
 * like "Introducing DeHub Premium" and "Comment cannot be empty"; this does not.
 */
const SCRIPT_OF = {
  ru: /[Ѐ-ӿ]/, uk: /[Ѐ-ӿ]/, be: /[Ѐ-ӿ]/, bg: /[Ѐ-ӿ]/,
  sr: /[Ѐ-ӿ]/, mk: /[Ѐ-ӿ]/, kk: /[Ѐ-ӿ]/, mn: /[Ѐ-ӿ]/,
  ja: /[぀-ヿ一-鿿]/, zh: /[一-鿿]/, zh_tw: /[一-鿿]/,
  yue: /[一-鿿]/, wuu: /[一-鿿]/, cjy: /[一-鿿]/, mnp: /[一-鿿]/,
  ko: /[가-힯]/, th: /[฀-๿]/, lo: /[຀-໿]/, my: /[က-႟]/,
  km: /[ក-៿]/, si: /[඀-෿]/, ka: /[Ⴀ-ჿ]/, am: /[ሀ-፿]/,
  ti: /[ሀ-፿]/, he: /[֐-׿]/, el: /[Ͱ-Ͽ]/, bo: /[ༀ-࿿]/,
  hi: /[ऀ-ॿ]/, mr: /[ऀ-ॿ]/, ne: /[ऀ-ॿ]/, bho: /[ऀ-ॿ]/,
  hne: /[ऀ-ॿ]/, mag: /[ऀ-ॿ]/, dcc: /[؀-ۿऀ-ॿ]/,
  bn: /[ঀ-৿]/, ctg: /[ঀ-৿]/, syl: /[ঀ-৿]/, rkt: /[ঀ-৿]/,
  as: /[ঀ-৿]/, pa: /[਀-੿]/, gu: /[઀-૿]/, ta: /[஀-௿]/,
  te: /[ఀ-౿]/, kn: /[ಀ-೿]/, ml: /[ഀ-ൿ]/,
  ar: /[؀-ۿ]/, fa: /[؀-ۿ]/, ur: /[؀-ۿ]/, ps: /[؀-ۿ]/,
  skr: /[؀-ۿ]/, pbt: /[؀-ۿ]/, sd: /[؀-ۿ]/, ku: /[؀-ۿ]/,
  acm: /[؀-ۿ]/, acw: /[؀-ۿ]/, aec: /[؀-ۿ]/, ajp: /[؀-ۿ]/,
  ayn: /[؀-ۿ]/, apd: /[؀-ۿ]/, arz: /[؀-ۿ]/, ary: /[؀-ۿ]/,
};

/**
 * Numbers, punctuation and brand names are the same in every language, so a
 * string with no letters of its own to translate is not evidence of anything.
 */
function hasTranslatableWords(source) {
  return source.trim().split(/\s+/).filter((w) => /[a-zA-Z]{3}/.test(w)).length >= 3;
}

/**
 * The part of a string a translator is actually asked to change. Placeholders
 * come back unchanged in every language, so they are noise in this comparison
 * — and on a string that is mostly placeholders they are most of the bytes.
 */
function proseOf(text) {
  return text.replace(PLACEHOLDER, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Unicode blocks, for the wrong-script guard below.
 *
 * Only the blocks that actually appear among the bundled locales, plus the
 * ones the translator reaches for when it goes wrong (CJK, Kana, Hangul).
 */
const SCRIPT_BLOCKS = [
  ['Latin', /[A-Za-z]/], ['Cyrillic', /[Ѐ-ӿ]/], ['Greek', /[Ͱ-Ͽ]/],
  ['Armenian', /[԰-֏]/], ['Hebrew', /[֐-׿]/],
  ['Arabic', /[؀-ۿݐ-ݿ]/], ['Ethiopic', /[ሀ-፿]/],
  ['Devanagari', /[ऀ-ॿ]/], ['Bengali', /[ঀ-৿]/],
  ['Gurmukhi', /[਀-੿]/], ['Gujarati', /[઀-૿]/],
  ['Oriya', /[଀-୿]/], ['Tamil', /[஀-௿]/],
  ['Telugu', /[ఀ-౿]/], ['Kannada', /[ಀ-೿]/],
  ['Malayalam', /[ഀ-ൿ]/], ['Sinhala', /[඀-෿]/],
  ['Thai', /[฀-๿]/], ['Lao', /[຀-໿]/], ['Tibetan', /[ༀ-࿿]/],
  ['Myanmar', /[က-႟]/], ['Khmer', /[ក-៿]/], ['Georgian', /[Ⴀ-ჿ]/],
  ['Hangul', /[가-힯ᄀ-ᇿ]/], ['CJK', /[一-鿿㐀-䶿]/],
  ['Kana', /[぀-ヿ]/],
];

const scriptsIn = text => new Set(SCRIPT_BLOCKS.filter(([, re]) => re.test(text)).map(([n]) => n));

/**
 * Which scripts this locale legitimately writes in, learnt from the 2000+
 * values it already carries rather than from a hand-kept table.
 *
 * A block present in under 1% of existing values is a stray brand name, not
 * part of the language — `DeHub` and `DHB` put Latin in every bundle, and
 * counting that as native would make the guard useless for the Latin case.
 * Cached because it walks the whole locale.
 */
const nativeScriptCache = new Map();
function nativeScripts(locale, raw) {
  if (nativeScriptCache.has(locale)) return nativeScriptCache.get(locale);
  const values = [...flatten(raw).values()].filter(v => typeof v === 'string');
  const counts = new Map();
  for (const v of values) for (const b of scriptsIn(v)) counts.set(b, (counts.get(b) || 0) + 1);
  // Too small a corpus to learn from — fall back to allowing everything
  // rather than dropping every value in a nearly-empty bundle.
  const native = values.length < 200
    ? null
    : new Set([...counts].filter(([, n]) => n / values.length >= 0.01).map(([b]) => b));
  nativeScriptCache.set(locale, native);
  return native;
}

/**
 * True when the translation came back written in an alphabet this locale does
 * not use.
 *
 * The placeholder and English-verbatim guards do not look at the script, and
 * the translator gets it wrong often enough to matter: measured on one 41-key
 * batch across 110 locales, 8.5% of values in the affected bundles came back
 * contaminated against a 0.15% baseline in the same files. Two shapes, both
 * of which render as visible nonsense:
 *
 *   - the whole value in another language's script — `Փոխակերպիչ` (Armenian)
 *     returned for `am` (Amharic), which is a plain locale-code mix-up;
 *   - a correct sentence with a foreign fragment spliced in — `ቪዲዮ 导入`,
 *     `Վիդեո导入ել`, `ວາງリンク໋`, `Fi 링크 lati YouTube`.
 *
 * Dropping these leaves the key in English, which is the same trade the other
 * guards make and is unambiguously better than shipping the above.
 */
function wrongScript(candidate, locale, raw) {
  const native = nativeScripts(locale, raw);
  if (!native) return false;
  return [...scriptsIn(candidate)].some(block => !native.has(block));
}

function isUntranslatedProse(source, candidate, locale) {
  const script = SCRIPT_OF[locale];
  // A script check needs no word threshold: two Latin words in a Cyrillic
  // locale are as untranslated as ten. Only the word rule below needs the
  // cushion, because there "unchanged" is weak evidence on its own.
  if (script) return /[a-zA-Z]{3}/.test(source) && !script.test(candidate);
  // Compare the prose rather than the whole string, and ignore case. The
  // translator hands "{{names}} and {{count}} other" back as "... Other" often
  // enough that a strict === let the English straight into the file.
  if (proseOf(candidate).toLowerCase() !== proseOf(source).toLowerCase()) return false;
  return hasTranslatableWords(source) && ENGLISH_FUNCTION_WORDS.test(source);
}

/* ---------- network ---------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function translateBatch(lines, targetLang, key) {
  const body = JSON.stringify({ text: lines.join('\n'), targetLang, sourceLang: 'en' });
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
        body,
      });
      if (res.status === 429) { await sleep(2000 * attempt); continue; }
      if (!res.ok) { await sleep(600 * attempt); continue; }
      const json = await res.json();
      const text = json?.translatedText;
      if (typeof text !== 'string') return null;
      const out = text.split('\n');
      // A batch that came back a different shape is unusable as a whole; the
      // caller retries it one line at a time rather than guessing an alignment.
      return out.length === lines.length ? out : null;
    } catch {
      await sleep(600 * attempt);
    }
  }
  return null;
}

/* ---------- main ---------- */

const en = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en.json'), 'utf8'));
const enFlat = flatten(en);

const allLocales = fs
  .readdirSync(LOCALES_DIR)
  .filter((f) => f.endsWith('.json') && f !== 'en.json')
  .map((f) => f.replace(/\.json$/, ''));

function missingFor(locale) {
  const raw = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${locale}.json`), 'utf8'));
  const flat = flatten(raw);
  const missing = [];
  for (const [k, v] of enFlat) {
    if (typeof v !== 'string') continue;
    if (KEY_PREFIX && !k.startsWith(KEY_PREFIX)) continue;
    if (ONLY_KEYS && !ONLY_KEYS.has(k)) continue;
    const have = flat.get(k);
    if (typeof have !== 'string' || have.trim() === '') missing.push(k);
  }
  return { raw, missing };
}

let targets;
if (value('locale')) targets = [value('locale')];
else if (value('locales')) targets = value('locales').split(',').map((s) => s.trim()).filter(Boolean);
else targets = allLocales;

if (flag('all') || CHECK_ONLY) {
  targets = targets
    .map((l) => ({ l, n: missingFor(l).missing.length }))
    .sort((a, b) => b.n - a.n)
    .map((x) => x.l);
}
const limit = Number(value('limit') || 0);
if (limit > 0) targets = targets.slice(0, limit);

const translatableTotal = [...enFlat.values()].filter((v) => typeof v === 'string').length;

if (CHECK_ONLY) {
  console.log(`en.json translatable strings: ${translatableTotal}\n`);
  let worst = 0;
  for (const locale of targets) {
    const { missing } = missingFor(locale);
    const pct = (((translatableTotal - missing.length) / translatableTotal) * 100).toFixed(1);
    if (missing.length > worst) worst = missing.length;
    console.log(`${locale.padEnd(7)} ${String(translatableTotal - missing.length).padStart(5)}/${translatableTotal}  ${pct.padStart(5)}%  missing ${missing.length}`);
  }
  console.log(`\nlargest gap: ${worst} keys`);
  process.exit(0);
}

/**
 * Write a locale back in its own key order and line endings. The mobile
 * locales round-trip exactly through JSON.stringify, so every existing line
 * stays byte-identical and new keys land at the end of their object.
 */
function writeLocale(locale, raw) {
  const file = path.join(LOCALES_DIR, `${locale}.json`);
  const nl = fs.readFileSync(file, 'utf8').includes('\r\n') ? '\r\n' : '\n';
  fs.writeFileSync(file, JSON.stringify(raw, null, 2).split('\n').join(nl) + nl);
}

/**
 * Strip keys whose value is the English source verbatim. Rendering does not
 * change — the key falls back to en.json either way — but the coverage report
 * stops counting them as translated, which is the whole point.
 */
if (flag('prune')) {
  for (const locale of targets) {
    const raw = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${locale}.json`), 'utf8'));
    const flat = flatten(raw);
    let pruned = 0;
    for (const [k, v] of flat) {
      if (typeof v !== 'string') continue;
      const source = enFlat.get(k);
      if (typeof source === 'string' && isUntranslatedProse(source, v, locale)) {
        const parts = k.split('.');
        let node = raw;
        for (const p of parts.slice(0, -1)) node = node?.[p];
        if (node) { delete node[parts.at(-1)]; pruned++; }
      }
    }
    if (pruned) {
      writeLocale(locale, raw);
    }
    console.log(`${locale}: pruned ${pruned} English-verbatim value(s)`);
  }
  process.exit(0);
}

const key = anonKey();

for (const locale of targets) {
  const { raw, missing } = missingFor(locale);
  if (missing.length === 0) { console.log(`${locale}: already complete`); continue; }

  const todo = missing.slice(0, KEY_BUDGET);
  console.log(`${locale}: ${missing.length} missing, translating ${todo.length}`);

  let written = 0;
  let dropped = 0;

  for (let i = 0; i < todo.length; i += BATCH_LINES) {
    const keys = todo.slice(i, i + BATCH_LINES);
    const sources = keys.map((k) => enFlat.get(k));
    const prepared = sources.map(protect);

    let out = await translateBatch(prepared.map((p) => p.masked), locale, key);

    // A drifted batch is retried per line so one bad string cannot cost 29 good ones.
    if (!out) {
      out = [];
      for (const p of prepared) {
        const single = await translateBatch([p.masked], locale, key);
        out.push(single ? single[0] : null);
        await sleep(PAUSE_MS);
      }
    }

    keys.forEach((k, j) => {
      const candidate = out[j] == null ? null : restore(out[j].trim(), prepared[j].found, sources[j]);
      if (
        candidate == null ||
        looksUnfinished(candidate, sources[j]) ||
        isUntranslatedProse(sources[j], candidate, locale) ||
        !placeholdersMatch(sources[j], candidate) ||
        wrongScript(candidate, locale, raw)
      ) {
        dropped++;
        return;
      }
      setDeep(raw, k, candidate);
      written++;
    });

    await sleep(PAUSE_MS);
    process.stdout.write(`  ${Math.min(i + BATCH_LINES, todo.length)}/${todo.length}\r`);
  }

  writeLocale(locale, raw);
  console.log(`\n${locale}: wrote ${written}, dropped ${dropped} (left in English on purpose)`);
}
