const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

// Metro runs transforms in Jest workers. An env-inlining plugin must not
// turn that worker ID into a release app selecting mock shared values.
process.env.NODE_ENV = 'production';
process.env.BABEL_ENV = 'production';
process.env.JEST_WORKER_ID = '1';

const root = path.resolve(__dirname, '..');
const detectors = [
  'react-native-reanimated/src/common/constants/platform.ts',
  'react-native-reanimated/lib/module/common/constants/platform.js',
  'react-native-worklets/src/platformChecker.ts',
  'react-native-worklets/lib/module/platformChecker.js',
];

function bundled(source, filename, platform) {
  return babel.transformSync(source, {
    filename,
    configFile: path.join(root, 'babel.config.js'),
    babelrc: false,
    caller: { name: 'metro', platform, isDev: false, isServer: false, bundler: 'metro', engine: 'hermes' },
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
}

function run(code, platform, jestRuntime = false) {
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    process: { env: { NODE_ENV: 'production' } },
    ...(jestRuntime ? { jest: {} } : {}),
    require(name) {
      if (name.startsWith('@babel/runtime/helpers/')) return require(name);
      if (/^react-native-web\/dist\/(cjs\/)?exports\/Platform$/.test(name)) {
        return { OS: platform };
      }
      assert.equal(name, 'react-native');
      return { Platform: { OS: platform } };
    },
  });
  return module.exports;
}

for (const detector of detectors) {
  const filename = path.join(root, 'node_modules', detector);
  const source = fs.readFileSync(filename, 'utf8');
  const legacy = source.replace(
    "typeof globalThis.jest !== 'undefined' || process.env.NODE_ENV === 'test'",
    '!!process.env.JEST_WORKER_ID',
  );
  assert.notEqual(legacy, source, `${detector}: missing release-runtime fix`);
  for (const platform of ['android', 'ios']) {
    // The negative control reproduces the bundled build-78 bug.
    const broken = run(bundled(legacy, filename, platform), platform);
    assert.equal(broken.IS_JEST, true, `${detector}: negative control did not reproduce`);
    assert.equal(broken.SHOULD_BE_USE_WEB, true);
    const code = bundled(source, filename, platform);
    const release = run(code, platform);
    assert.equal(release.IS_JEST, false, `${detector}: release selected Jest`);
    assert.equal(release.SHOULD_BE_USE_WEB, false, `${detector}: release selected mock shared values`);
    assert.equal(run(code, platform, true).IS_JEST, true, `${detector}: actual Jest detection lost`);
  }
  const web = run(bundled(source, filename, 'web'), 'web');
  assert.equal(web.IS_JEST, false);
  assert.equal(web.SHOULD_BE_USE_WEB, true);
}
console.log('Release animation runtime checks passed for Android, iOS and web.');
