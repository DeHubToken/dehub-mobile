/**
 * node --test scripts/i18n-guards.test.mjs
 *
 * The answers the 2026-09-29 refill screen had to remove by hand, the ordinary
 * grammar a looser version of that screen would have removed with them, and
 * the batch-order check run over batches cut from this repo's locale files.
 * Shared word for word with the other repo, like the guards themselves.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { garbled, outOfOrder, answersAnotherLine, MIN_BATCH_LINES } from './i18n-guards.mjs';

test('rejects what the refill screen caught', () => {
  const cases = [
    // Loops on words under four letters.
    ['EVM', 'ኢቪኤም ነዎት ነዎት ነዎት ነዎት', 'loop'],
    ['Use this one', 'اے، اے، اے، اے، اے، اے، اے، اے، اے،', 'loop'],
    ['Remove it', 'Yọ ẹ̀yí ẹ̀yí ẹ̀yí ẹ̀yí kúrò', 'loop'],
    ['Total', 'कुल कुल कुल', 'loop'],
    ['Ads balance top-up', 'Fanga min be mɔgɔ la, o ye ka to ka to ka to ka to ka to', 'loop'],
    ['The leaderboard updates periodically throughout the day.', "O kama, a ka ɲi ka to ka to ka kuma n'a ye.", 'loop'],
    // Loops inside a word.
    ['Quote as post', 'O mo ni jéééééééééééééééé', 'character loop'],
    ['Search', 'رَحِشِشِشِشِشِشِشِ', 'character loop'],
    ['Stores', 'فرۆشگاکانیەیەیەیەیەیە', 'character loop'],
    ['Notify key', 'គាន់បញ្ចូលការបង្កើតការបង្កើតការបង្កើតការបង្កើត', 'character loop'],
    // A label answered with a sentence.
    ['PPV', 'प्रायवेट व्यू पाइप (Private View Pay-Per-View)', 'sentence for a label'],
    ['PPV', 'ክፍያ በእይታ። ይህ ተጠቃሚዎች ለእያንዳንዱ ቪዲዮ የሚከፍሉበት አገልግሎት ነው።', 'sentence for a label'],
    ['Delete', 'I’m sorry, but I can’t help with that.', 'sentence for a label'],
    // Markdown the English never had.
    ['Cheap draft to test an idea', '**مسودة رخيصة لتجربه فكرة**', 'markdown'],
  ];
  for (const [source, answer, reason] of cases) assert.equal(garbled(source, answer), reason, answer);
});

test('keeps ordinary grammar and legitimate repeats', () => {
  const cases = [
    // Reduplication (ms, jv, ha).
    ['Shows only posts published for children, everywhere. A PIN turns it back off.',
      'Menunjukkan hanya siaran yang disiarkan untuk kanak-kanak, di mana-mana sahaja. PIN mematikannya kembali.'],
    ['Shows only posts published for children, everywhere. A PIN turns it back off.',
      'Nampilake mung kiriman sing diterbitake kanggo anak-anak, ing mana-mana. PIN mateni maneh.'],
    ['The ones we get asked most often about draws, entries and prizes.',
      'Waɗanda muke tambaya akai-akai game da zane-zane, shigarwa da kyaututtuka.'],
    // A short word repeated through a list or a sentence, not back to back.
    ['PNG, GIF, WebP or JPEG up to 2 MB. Links from Discord, Slack, 7TV, BetterTTV, FrankerFaceZ, emoji.gg or any image work too.',
      'PNG أو GIF أو WebP أو JPEG حتى 2 ميجابايت. تعمل الروابط من Discord أو Slack أو 7TV أو BetterTTV أو FrankerFaceZ أو emoji.gg أو أي صورة أيضًا.'],
    ['Anyone can see your followers and following list', 'Afaka mahita ny lisitry ny mpanaraka sy ny arahinao ny rehetra'],
    ['Create text posts, share images, videos, voice notes, GIFs, and more. Use hashtags, cashtags, and mentions to increase reach.',
      'Créez des publications textuelles, partagez des images, des vidéos, des notes vocales, des GIFs, et plus encore. Utilisez des hashtags, des cashtags et des mentions pour augmenter la portée.'],
    ['That flow is not public, or no longer exists.', 'Daardie stroom is nie openbaar nie, of bestaan nie meer nie.'],
    ['Paste a link from YouTube, TikTok, Instagram, X and more, and publish it as a DeHub post.',
      'YouTube-დან, TikTok-დან, Instagram-დან, X-დან და სხვა წყაროებიდან ბმულის ჩასმა და მისი DeHub პოსტად გამოქვეყნება.'],
    // Judged against the English: a source that repeats or uses markdown may be followed.
    ['Ha ha ha', 'Ja ja ja'],
    ['**Bold** move', '**Mutiger** Schritt'],
    // Short labels that grow a little.
    ['Settings', 'Einstellungen'],
    ['DMs', 'Direktnachrichten'],
    ['PPV', 'PPV'],
  ];
  for (const [source, answer] of cases) assert.equal(garbled(source, answer), null, answer);
});

const sources = [
  'Schedule', 'Pop out — keep listening while you browse', 'Go live',
  'Invite speakers to the stage before you start', 'End', 'Recording saved to your library',
];
const inStep = [
  'Skejul', 'Pop out — continue listen wey yu browse', 'Go live',
  'Invite speakers enter stage before yu start', 'End am', 'Recording don save for yu library',
];
const shifted = [...inStep.slice(1), inStep[0]];

test('spots a batch answered a line out of step', () => {
  assert.equal(outOfOrder(sources, inStep), false);
  assert.equal(outOfOrder(sources, shifted), true);
  assert.equal(outOfOrder(sources, [inStep.at(-1), ...inStep.slice(0, -1)]), true);
  // Too few lines to judge; the fill sends these one at a time instead.
  assert.equal(outOfOrder(sources.slice(0, MIN_BATCH_LINES - 1), shifted.slice(0, MIN_BATCH_LINES - 1)), false);
});

test('spots a single-line answer that belongs to another line of the batch', () => {
  assert.equal(answersAnotherLine(0, 'Skejul', sources, shifted), true);
  assert.equal(answersAnotherLine(0, 'Skejul', sources, inStep), false);
  assert.equal(answersAnotherLine(4, 'End am', sources, inStep), false);
  // Near-identical English is expected to get near-identical answers.
  assert.equal(answersAnotherLine(0, 'utilisations', ['{{count}} use', '{{count}} uses'], ['utilisation', 'utilisations']), false);
});

/** Every string value, keyed by its dotted path, in the file's own order. */
function flatten(node, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else if (typeof v === 'string') out.set(key, v);
  }
  return out;
}

test('the order check holds on batches cut from the locale files', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dir = ['src/i18n/locales', 'i18n/locales'].map((d) => path.join(root, d)).find((d) => fs.existsSync(d));
  const read = (file) => flatten(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8').replace(/^﻿/, '')));
  const en = read('en.json');
  for (const size of [30, 8]) {
    let batches = 0, falseAlarms = 0, missed = 0;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'en.json')) {
      const locale = read(file);
      const keys = [...en.keys()].filter((k) => locale.has(k));
      for (let i = 0; i + size <= keys.length; i += size) {
        const src = keys.slice(i, i + size).map((k) => en.get(k));
        const out = keys.slice(i, i + size).map((k) => locale.get(k));
        batches++;
        if (outOfOrder(src, out)) falseAlarms++;
        if (!outOfOrder(src, [...out.slice(1), out[0]])) missed++;
        if (!outOfOrder(src, [out.at(-1), ...out.slice(0, -1)])) missed++;
      }
    }
    // Measured at 0.04% / 0.02% for 30 lines and 1.6% / 0.7% for 8. A false
    // alarm only costs a batch redone line by line; a miss writes nonsense.
    const alarmRate = falseAlarms / batches;
    const missRate = missed / (2 * batches);
    assert.ok(batches > 1000, `only ${batches} batches of ${size}`);
    assert.ok(alarmRate < (size === 30 ? 0.005 : 0.03), `${size} lines: ${(alarmRate * 100).toFixed(2)}% of batches flagged as they are`);
    assert.ok(missRate < (size === 30 ? 0.005 : 0.02), `${size} lines: ${(missRate * 100).toFixed(2)}% of shifted batches missed`);
  }
});
