import fs from 'node:fs';
import path from 'node:path';

const directory = fs.existsSync('src/i18n/locales') ? 'src/i18n/locales' : 'i18n/locales';
const flatten = (value, prefix = '', out = {}) => {
  for (const [key, item] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (typeof item === 'string') out[name] = item;
    else if (item && typeof item === 'object') flatten(item, name, out);
  }
  return out;
};
const read = lang => flatten(JSON.parse(fs.readFileSync(path.join(directory, `${lang}.json`), 'utf8')));
const placeholders = text => (text.match(/\{\{[^}]+\}\}|\{[a-zA-Z_]\w*\}/g) || []).sort().join('|');
const english = read('en');
let errors = 0;
for (const lang of ['ar', 'es', 'fr', 'nl', 'tr']) {
  const locale = read(lang);
  const missing = Object.keys(english).filter(key => typeof locale[key] !== 'string' || !locale[key].trim());
  const mismatched = Object.keys(english).filter(key => locale[key] && placeholders(english[key]) !== placeholders(locale[key]));
  console.log(`${lang}: ${Object.keys(english).length - missing.length}/${Object.keys(english).length} strings; ${mismatched.length} interpolation errors`);
  for (const key of missing) console.error(`${lang}: missing ${key}`);
  for (const key of mismatched) console.error(`${lang}: invalid placeholders ${key}`);
  errors += missing.length + mismatched.length;
}
if (errors) process.exitCode = 1;
