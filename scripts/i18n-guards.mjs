/**
 * Answer checks for the translation fill (scripts/i18n-fanout.mjs), shared
 * word for word between dehubweb and dehub-mobile. Change one, change both.
 *
 * The fill's own guards catch broken placeholders, English echoes, the wrong
 * alphabet and loops on words of four letters or more. A scoped refill on
 * 2026-09-29 still accepted answers none of them look at, and those had to be
 * screened out by hand: loops on short words and inside words, one-word labels
 * answered with a sentence, markdown the English never had, and one batch that
 * came back a line out of step. These are that screen, tuned against the ~1.6M
 * values already in both repos' locale files before the thresholds were set.
 */

/* ---------- one answer ---------- */

// Malay, Indonesian, Javanese and Hausa double a word for plurals and more
// ("anak-anak", "kira-kira", "daban-daban"). Counted once, so a pair is not a repeat.
const DOUBLED = /(?<![-\p{L}\p{M}\p{N}])([\p{L}\p{M}\p{N}]+)-\1(?![-\p{L}\p{M}\p{N}])/gu;
const wordsOf = (text) => text.toLowerCase().replace(DOUBLED, '$1').match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
const hasLetter = (text) => /\p{L}/u.test(text);

/** Most times one word appears in any 8-word window, at any length. */
function mostInWindow(words) {
  const counts = new Map();
  let most = 0;
  words.forEach((word, i) => {
    const leaving = words[i - 8];
    if (leaving !== undefined && hasLetter(leaving)) counts.set(leaving, counts.get(leaving) - 1);
    if (!hasLetter(word)) return;
    const n = (counts.get(word) ?? 0) + 1;
    counts.set(word, n);
    if (n > most) most = n;
  });
  return most;
}

/** Most back-to-back copies of a run of one to four words, counted up to 3. */
function mostBackToBack(words) {
  let most = 1;
  for (let size = 1; size <= 4; size++) {
    for (let i = 0; i + 2 * size <= words.length; i++) {
      const unit = words.slice(i, i + size).join(' ');
      if (!hasLetter(unit)) continue;
      let copies = 1;
      while (copies < 3 && i + (copies + 1) * size <= words.length
        && words.slice(i + copies * size, i + (copies + 1) * size).join(' ') === unit) copies++;
      if (copies > most) most = copies;
      if (most === 3) return most;
    }
  }
  return most;
}

/**
 * A loop on short words: "EVM" → "… ነዎት ነዎት ነዎት …", "Use this one" →
 * "اے، اے، اے، اے…", "Total" → "कुल कुल कुल". The fill's loop guard skips
 * words under four letters, and these are all shorter.
 *
 * Counting a word 4+ times in 8 on its own flags ordinary grammar in about as
 * many existing values as it flags loops: Malagasy "ny", Maori "te", French
 * "des", "or" between every item of a list in Arabic, a case ending after each
 * brand name in Georgian. A loop sits back to back instead, so a line is
 * dropped when a run of one to four words repeats three times in a row, or a
 * word comes 4+ times in 8 and something is doubled back to back as well
 * ("ka to ka to ka"). That fires on 0.04% of the values already in the locale
 * files; about one in sixteen of those is real grammar (Albanian "të të",
 * Danish "DM'er er") and stays English.
 */
function loopsOnShortWords(src, out) {
  const outRun = mostBackToBack(out);
  const srcRun = mostBackToBack(src);
  if (outRun >= 3 && srcRun < 3) return true;
  return mostInWindow(out) >= 4 && mostInWindow(src) < 3 && outRun >= 2 && srcRun < 2;
}

/**
 * A loop inside a word, which no word count sees: "jééééééé", "رَحِشِشِشِشِشِ",
 * "یەیەیەیە", and in scripts written without spaces a syllable or two on repeat
 * ("ការបង្កើតការបង្កើតការបង្កើតការបង្កើត"). One to three letters six times over,
 * or four to ten letters four times over. Existing values: 0.02%, all garbage
 * bar a laughing "هههههه".
 */
const CHARACTER_LOOP = /((?:\p{L}\p{M}*){1,3})\1{5,}|((?:\p{L}\p{M}*){4,10})\2{3,}/u;

/**
 * A label of three words or fewer answered with a sentence: "PPV" →
 * "प्रायवेट व्यू पाइप (Private View Pay-Per-View)", "Delete" → "I’m sorry, but
 * I can’t help with that.", "Text" → "Δεν υπάρχει κείμενο για μετάφραση.".
 * More than six times the length and over 24 characters. Existing values:
 * 0.02%, about one in seven a spelled-out acronym ("FAQ" as "Često postavljana
 * pitanja"), which stays English — the price of catching the rest.
 */
function blownUp(src, source, answer) {
  const answerLength = [...answer].length;
  return src.length <= 3 && answerLength > 6 * [...source].length && answerLength > 24;
}

/**
 * Why an answer should not be written, or null when none of these apply.
 * Judged against the English, so a source that repeats, runs on or uses
 * markdown itself is allowed an answer that does the same.
 */
export function garbled(source, answer) {
  const src = wordsOf(source);
  const out = wordsOf(answer);
  if (loopsOnShortWords(src, out)) return 'loop';
  if (CHARACTER_LOOP.test(answer) && !CHARACTER_LOOP.test(source)) return 'character loop';
  if (blownUp(src, source, answer)) return 'sentence for a label';
  // i18next prints ** as written. Seen added by the AI tier in sa, yo, dyu,
  // tk, id and ms, and already sitting in thousands of existing web values.
  if (answer.includes('**') && !source.includes('**')) return 'markdown';
  return null;
}

/* ---------- a whole batch ---------- */

/** Placeholders, raw or masked as @@n@@ sentinels (whole or mangled). */
const MARKUP = /@+\s?\d+\s?@+|\{\{[^}]+\}\}|\{[a-zA-Z0-9_]+\}|<\/?[a-zA-Z][a-zA-Z0-9]*>/g;
const proseLength = (text) => [...text.replace(MARKUP, ' ').replace(/\s+/g, ' ').trim()].length;

function correlation(xs, ys) {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

/**
 * Fewer lines than this are sent one at a time. The order check below needs a
 * few lines to go on, and a batch this small saves next to nothing.
 */
export const MIN_BATCH_LINES = 5;

/**
 * True when a batch's answers are not in the order of its lines.
 *
 * A batch that comes back with the right number of lines passes every
 * per-line guard even when each answer belongs to the line next to it — the
 * whole wes batch did exactly that ("Schedule" → "Pop out — continue listen
 * wey yu browse"). Answer lengths track source lengths in every language, so
 * compare them in step and one line either way: in step should correlate
 * best. Simulated on 30-line batches cut from the existing locale files, this
 * flags 0.04% of batches as they are and 99.98% shifted by one line; at 8
 * lines, 1.6% and 99.3%. A flagged batch is simply redone line by line.
 */
export function outOfOrder(sources, answers) {
  if (sources.length < MIN_BATCH_LINES) return false;
  const src = sources.map((s) => Math.log1p(proseLength(s)));
  const out = answers.map((a) => Math.log1p(proseLength(a ?? '')));
  const inStep = correlation(src, out);
  const behind = correlation(src.slice(1), out.slice(0, -1));
  const ahead = correlation(src.slice(0, -1), out.slice(1));
  return inStep < 0.3 || Math.max(behind, ahead) > inStep + 0.1;
}

/** Character pairs, for comparing two answers in any script. */
function pairs(text) {
  const chars = [...text.toLowerCase().replace(MARKUP, '').replace(/[^\p{L}\p{M}\p{N}]+/gu, '')];
  const out = new Map();
  if (chars.length === 1) out.set(chars[0], 1);
  for (let i = 0; i + 1 < chars.length; i++) {
    const pair = chars[i] + chars[i + 1];
    out.set(pair, (out.get(pair) ?? 0) + 1);
  }
  return out;
}

function similarity(a, b) {
  const pa = pairs(a);
  const pb = pairs(b);
  let shared = 0, total = 0;
  for (const [pair, n] of pa) { shared += Math.min(n, pb.get(pair) ?? 0); total += n; }
  for (const n of pb.values()) total += n;
  return total ? (2 * shared) / total : 0;
}

/**
 * True when line `j`, translated on its own, matches the batch's answer for a
 * different line — the batch was answered out of order. Near-identical only,
 * and never between two lines whose English is itself near-identical
 * ("{{count}} use" / "{{count}} uses").
 */
export function answersAnotherLine(j, alone, sources, answers) {
  if (!alone) return false;
  const own = similarity(alone, answers[j] ?? '');
  return answers.some((answer, k) => {
    if (k === j || !answer || similarity(sources[j], sources[k]) >= 0.8) return false;
    const match = similarity(alone, answer);
    return match >= 0.9 && match > own;
  });
}
