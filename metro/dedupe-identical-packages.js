/**
 * Bundle one copy of each identical library.
 *
 * npm nests a second, third or twenty-second copy of a package whenever the
 * top-level slot is taken by a different version, and Metro bundles every copy
 * it is pointed at. The wallet stack made that expensive: 22 copies of
 * @solana/errors 6.10.0, six of @noble/curves 2.2.0 and so on — about 4.6 MB of
 * the 33.6 MB release bundle was byte-identical code shipped more than once.
 *
 * This maps every such copy onto one canonical copy at bundle time. Two copies
 * are merged only when they are the same name and version AND every dependency
 * they would load resolves, recursively, to the same thing — exactly the case
 * where npm could have hoisted them itself. It is limited to stateless crypto
 * and codec libraries; patched folders are never merged, and the whole thing
 * switches off with DEHUB_METRO_DEDUPE=0 or if the lockfile cannot be read.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_ALLOW = [
  /^@noble\//,
  /^@scure\//,
  /^@solana\/(?!web3\.js$)/,
  /^viem$/,
  /^ox$/,
  /^abitype$/,
];

const NM = 'node_modules/';

/** "node_modules/a/node_modules/@s/b" -> "@s/b" */
function nameOf(pkgPath) {
  return pkgPath.slice(pkgPath.lastIndexOf(NM) + NM.length);
}

/** Node resolution of `dep` from the package installed at `fromPath`, over lockfile paths. */
function resolveIn(packages, fromPath, dep) {
  let dir = fromPath;
  for (;;) {
    const candidate = (dir ? `${dir}/` : '') + NM + dep;
    if (packages[candidate]) return candidate;
    if (!dir) return null;
    const cut = dir.lastIndexOf(`/${NM}`);
    dir = cut < 0 ? '' : dir.slice(0, cut);
  }
}

/**
 * pkgPath -> canonicalPath for every installed copy that can be swapped for an
 * identical one. Pure: takes the lockfile's `packages` map.
 */
function buildDedupeMap(packages, { allow = DEFAULT_ALLOW, patched = new Set() } = {}) {
  const identity = new Map();
  const visiting = new Set();

  const identityOf = (pkgPath) => {
    if (identity.has(pkgPath)) return identity.get(pkgPath);
    const meta = packages[pkgPath];
    // patch-package edits one installed folder, so a patched folder is not the
    // same code as another folder of that version. Its path is part of its
    // identity: it never merges, and nothing that loads it merges with
    // something that loads a different folder.
    const own = `${nameOf(pkgPath)}@${meta && meta.version}${patched.has(pkgPath) ? `#${pkgPath}` : ''}`;
    if (visiting.has(pkgPath)) return own; // cycle: the name@version is all there is to compare
    visiting.add(pkgPath);
    const deps = Object.keys({
      ...(meta && meta.dependencies),
      ...(meta && meta.optionalDependencies),
      ...(meta && meta.peerDependencies),
    }).sort();
    const resolved = deps.map((d) => {
      const at = resolveIn(packages, pkgPath, d);
      return `${d}=${at ? identityOf(at) : '-'}`;
    });
    visiting.delete(pkgPath);
    const id = `${own}{${resolved.join(',')}}`;
    identity.set(pkgPath, id);
    return id;
  };

  const groups = new Map();
  for (const pkgPath of Object.keys(packages)) {
    if (!pkgPath.startsWith(NM) && !pkgPath.includes(`/${NM}`)) continue;
    const meta = packages[pkgPath];
    if (!meta || meta.link || meta.hasInstallScript) continue;
    const name = nameOf(pkgPath);
    if (patched.has(pkgPath) || !allow.some((re) => re.test(name))) continue;
    const id = identityOf(pkgPath);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(pkgPath);
  }

  const map = new Map();
  for (const copies of groups.values()) {
    if (copies.length < 2) continue;
    // Shallowest copy, then alphabetical: the same answer on every machine.
    copies.sort((a, b) => a.split(NM).length - b.split(NM).length || (a < b ? -1 : a > b ? 1 : 0));
    const [canonical, ...rest] = copies;
    for (const copy of rest) map.set(copy, canonical);
  }
  return map;
}

/**
 * The installed folders patch-package edits, as lockfile paths. A patch file
 * names its folder: "@scope+name+1.2.3.patch" is node_modules/@scope/name, and
 * "parent++@scope+name+1.2.3.patch" is the copy nested under parent.
 */
function patchedPackagePaths(patchesDir) {
  const paths = new Set();
  let files = [];
  try {
    files = fs.readdirSync(patchesDir);
  } catch {
    return paths;
  }
  for (const file of files) {
    if (!file.endsWith('.patch')) continue;
    const segments = file.replace(/\.patch$/, '').split('++');
    const last = segments.pop().split('+');
    last.pop(); // version
    const names = [...segments.map((seg) => seg.split('+').join('/')), last.join('/')];
    paths.add(names.map((name) => NM + name).join('/'));
  }
  return paths;
}

/**
 * A function for Metro's resolveRequest chain: give it a resolution, get back
 * the same file in the canonical copy when there is one.
 */
function createDedupe(projectRoot) {
  if (process.env.DEHUB_METRO_DEDUPE === '0') return (resolution) => resolution;
  let map;
  try {
    const lock = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package-lock.json'), 'utf8'));
    map = buildDedupeMap(lock.packages || {}, { patched: patchedPackagePaths(path.join(projectRoot, 'patches')) });
  } catch {
    return (resolution) => resolution;
  }
  if (map.size === 0) return (resolution) => resolution;

  const root = projectRoot.replace(/\\/g, '/').replace(/\/$/, '') + '/';
  const pkgRoot = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)(\/.*)$/;
  // The lockfile is the plan; the disk is what gets bundled. A local install
  // that has drifted from the lockfile must not swap in a different version.
  const versions = new Map();
  const installedVersion = (pkgPath) => {
    if (!versions.has(pkgPath)) {
      let version = null;
      try {
        version = JSON.parse(fs.readFileSync(path.join(projectRoot, pkgPath, 'package.json'), 'utf8')).version;
      } catch {}
      versions.set(pkgPath, version);
    }
    return versions.get(pkgPath);
  };
  return (resolution) => {
    if (!resolution || resolution.type !== 'sourceFile') return resolution;
    const abs = resolution.filePath.replace(/\\/g, '/');
    if (!abs.startsWith(root)) return resolution;
    const m = abs.slice(root.length).match(pkgRoot);
    if (!m) return resolution;
    const canonical = map.get(m[1]);
    if (!canonical) return resolution;
    const version = installedVersion(m[1]);
    if (!version || version !== installedVersion(canonical)) return resolution;
    const filePath = path.join(projectRoot, canonical + m[2]);
    return fs.existsSync(filePath) ? { ...resolution, filePath } : resolution;
  };
}

module.exports = { buildDedupeMap, patchedPackagePaths, createDedupe, resolveIn };
