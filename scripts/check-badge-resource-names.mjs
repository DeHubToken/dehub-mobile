import { existsSync, readdirSync } from 'node:fs';

const directory = existsSync('assets/badges/hover')
  ? 'assets/badges/hover'
  : 'src/assets/badges/hover';
const names = new Map();
for (const file of readdirSync(directory)) {
  if (!/\.(png|webp)$/i.test(file)) continue;
  // Android drawable names discard the extension and punctuation.
  const name = file.replace(/\.(png|webp)$/i, '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  const previous = names.get(name);
  if (previous) throw new Error(
    `Badge assets ${previous} and ${file} share Android resource name ${name}`,
  );
  names.set(name, file);
}
console.log(`Badge assets: ${names.size} distinct Android resource names`);
