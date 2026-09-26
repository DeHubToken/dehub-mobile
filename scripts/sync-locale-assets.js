#!/usr/bin/env node
/**
 * Mirrors every non-English i18n/locales/*.json into i18n/locale-assets/*.i18n
 * so Metro ships them as assets instead of compiling them into the JS bundle.
 *
 * Metro decides "asset or module" by file extension alone, and a .json is
 * always a module, so the locale files cannot stay .json and be assets. The
 * team keeps editing i18n/locales/*.json; this copy is what the bundler sees.
 * metro.config.js runs it on every start, so `expo start`, `expo export`,
 * `eas update` and the native release bundle all pick up the current files.
 * Edits made while Metro is running land on the next restart.
 *
 * Copies are minified (and so validated) and rewritten only when the source
 * is newer. i18n/locale-assets/ is gitignored.
 */
const fs = require('fs');
const path = require('path');

const ASSET_EXT = 'i18n';

function syncLocaleAssets(projectRoot = path.resolve(__dirname, '..')) {
  const src = path.join(projectRoot, 'i18n', 'locales');
  const out = path.join(projectRoot, 'i18n', 'locale-assets');
  fs.mkdirSync(out, { recursive: true });

  const codes = fs
    .readdirSync(src)
    .filter((f) => f.endsWith('.json') && f !== 'en.json')
    .map((f) => f.slice(0, -5));

  let written = 0;
  for (const code of codes) {
    const from = path.join(src, `${code}.json`);
    const to = path.join(out, `${code}.${ASSET_EXT}`);
    const dest = fs.existsSync(to) ? fs.statSync(to) : null;
    if (dest && dest.mtimeMs >= fs.statSync(from).mtimeMs) continue;
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(from, 'utf8').replace(/^﻿/, ''));
    } catch (err) {
      throw new Error(`[locale-assets] ${code}.json is not valid JSON: ${err.message}`);
    }
    fs.writeFileSync(to, JSON.stringify(parsed));
    written++;
  }

  const keep = new Set(codes.map((c) => `${c}.${ASSET_EXT}`));
  for (const f of fs.readdirSync(out)) {
    if (!keep.has(f)) fs.rmSync(path.join(out, f), { force: true });
  }

  return { codes, written };
}

module.exports = { syncLocaleAssets, ASSET_EXT };

if (require.main === module) {
  const { codes, written } = syncLocaleAssets();
  console.log(`locale assets: ${codes.length} locales, ${written} rewritten`);
}
