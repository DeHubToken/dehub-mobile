const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { patchedPackagePaths } = require('../metro/dedupe-identical-packages');

function inspect(root) {
  const files = [];
  function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, item.name);
      if (item.isDirectory()) walk(absolute);
      else files.push(absolute);
    }
  }
  walk(root);
  const maps = files.filter(file => file.endsWith('.map'));
  assert(maps.length > 0, 'Release source maps are required');
  const sources = new Set();
  for (const file of maps) {
    const map = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const source of map.sources || []) sources.add(source.replace(/\\/g, '/'));
  }
  const bundles = files.filter(file => /\/static\/js\/android\//.test(file.replace(/\\/g, '/')) && /\.(?:js|hbc)$/.test(file));
  assert(bundles.length > 0, 'Android release bundle is required');
  return { sources, bytes: bundles.reduce((sum, file) => sum + fs.statSync(file).size, 0) };
}

const [offDir, onDir] = process.argv.slice(2);
assert(offDir && onDir, 'Disabled and enabled export directories are required');
const off = inspect(offDir);
const on = inspect(onDir);
let checked = 0;
for (const folder of patchedPackagePaths(path.join(__dirname, '../patches'))) {
  const needle = folder + '/';
  const original = [...off.sources].filter(source => source.includes(needle)).sort();
  const enabled = [...on.sources].filter(source => source.includes(needle)).sort();
  assert.deepEqual(enabled, original, 'Patched module coverage changed for ' + folder);
  if (original.length > 0) checked++;
  if (/react-native-(reanimated|worklets)$/.test(folder)) {
    assert(original.length > 0, 'Animation repair modules must be present: ' + folder);
  }
}
assert(checked > 0, 'No bundled patched modules were compared');
assert(on.bytes < off.bytes, 'Duplicate-library mapping should reduce this release bundle');
console.log(JSON.stringify({ disabledBytes: off.bytes, enabledBytes: on.bytes, savedBytes: off.bytes - on.bytes, disabledModules: off.sources.size, enabledModules: on.sources.size, unchangedPatchedPackages: checked }, null, 2));
