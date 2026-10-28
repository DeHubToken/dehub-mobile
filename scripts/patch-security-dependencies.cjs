// Backports for packages whose supported major versions have no patched release.
// See dependency-security.md. Unexpected versions/source layouts fail installation.
const fs = require('node:fs');
const path = require('node:path');

function packages(root = path.resolve('node_modules')) {
  const found = [];
  const seen = new Set();
  function visitPackage(dir) {
    let real;
    try { real = fs.realpathSync(dir); } catch { return; }
    if (seen.has(real)) return;
    seen.add(real);
    const manifest = path.join(real, 'package.json');
    if (fs.existsSync(manifest)) {
      const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      found.push({ dir: real, ...pkg });
    }
    visitModules(path.join(real, 'node_modules'));
  }
  function visitModules(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.pnpm') {
        for (const dep of fs.readdirSync(path.join(dir, '.pnpm'))) {
          visitModules(path.join(dir, '.pnpm', dep, 'node_modules'));
        }
      } else if (entry.name.startsWith('@')) {
        const scope = path.join(dir, entry.name);
        for (const dep of fs.readdirSync(scope)) visitPackage(path.join(scope, dep));
      } else if (!entry.name.startsWith('.')) visitPackage(path.join(dir, entry.name));
    }
  }
  visitModules(root);
  return found;
}

function edit(dir, file, transform) {
  const target = path.join(dir, file);
  const old = fs.readFileSync(target, 'utf8');
  const next = transform(old);
  if (typeof next !== 'string') throw new Error('Invalid patch: ' + target);
  if (old !== next) fs.writeFileSync(target, next);
}
function replace(source, old, next, count = 1) {
  if (source.includes(next)) return source;
  if (source.split(old).length - 1 !== count) throw new Error('Security patch source mismatch: ' + old.slice(0, 90));
  return source.split(old).join(next);
}
function version(pkg, expected) {
  if (pkg.version !== expected) throw new Error('Review security patch for ' + pkg.name + '@' + pkg.version);
}
function patch(pkg) {
  const dir = pkg.dir;
  switch (pkg.name) {
    case 'deepmerge':
      version(pkg, '4.3.1');
      for (const file of ['index.js', 'dist/cjs.js', 'dist/umd.js']) {
        edit(dir, file, s => {
          if (s.includes('/* safe own property */')) return s;
          let count = 0;
          const next = s.replace(/destination\[key\] = ([^\n;]+);?/g, (_, value) => {
            count++;
            return 'Object.defineProperty(destination, key, { value: ' + value + ', enumerable: true, configurable: true, writable: true }); /* safe own property */';
          });
          if (count !== 3) throw new Error('Unexpected deepmerge assignments: ' + file);
          return next;
        });
      }
      return true;
    case 'elliptic':
      version(pkg, '6.6.1');
      edit(dir, 'lib/elliptic/ec/index.js', s => replace(s,
        'k = this._truncateToN(k, true);',
        'k = this._truncateToN(k, true, options.k ? undefined : bytes * 8);'));
      return true;
    case 'decode-uri-component':
      version(pkg, '0.2.2');
      fs.copyFileSync(path.join(__dirname, 'security/decode-uri-component.cjs'), path.join(dir, 'index.js'));
      return true;
    case 'bigint-buffer':
      version(pkg, '1.1.5');
      edit(dir, 'dist/node.js', s => replace(s,
        "converter = require('bindings')('bigint_buffer');",
        'converter = undefined; // Use the upstream pure-JavaScript fallback; never load the unsafe native addon.'));
      return true;
    case 'stream-json':
      version(pkg, '1.9.1');
      edit(dir, 'Assembler.js', s => replace(s,
        'this.current[this.key] = value;',
        'Object.defineProperty(this.current, this.key, { value, enumerable: true, configurable: true, writable: true });', 2));
      edit(dir, 'Assembler.js', s => replace(s,
        'this.stack.push(this.current, this.key);',
        "if (this.stack.length >= 256) throw new Error('JSON nesting exceeds 128 levels');\n      this.stack.push(this.current, this.key);"));
      edit(dir, 'Parser.js', s => replace(s,
        'this._stack.push(this._parent);',
        "if (this._stack.length >= 128) return callback(new Error('JSON nesting exceeds 128 levels'));\n              this._stack.push(this._parent);", 2));
      edit(dir, 'filters/FilterBase.js', s => replace(s,
        '    // update the last stack key',
        "    if (this._stack.length >= 128 && (chunk.name === 'startObject' || chunk.name === 'startArray')) return callback(new Error('JSON nesting exceeds 128 levels'));\n    // update the last stack key"));
      return true;
    case 'zod':
      if (pkg.version.startsWith('4.')) return false; // Fixed by the >=4.6.7 override.
      version(pkg, '3.25.76');
      for (const file of ['v3/types.cjs', 'v3/types.js']) {
        edit(dir, file, s => {
          for (const field of ['maxLength', 'maxSize']) {
            const old = 'message: def.' + field + '.message,\n                });\n                status.dirty();';
            s = replace(s, old, old + '\n                return { status: "aborted" };');
          }
          const old = 'message: def.exactLength.message,\n                });\n                status.dirty();';
          return replace(s, old, old + '\n                if (tooBig) return { status: "aborted" };');
        });
      }
      // Zod 3.25 also exports an early v4 implementation. Backport the same
      // leading upper-bound gate there, preserving overwrite/check ordering.
      for (const file of ['v4/core/schemas.cjs', 'v4/core/schemas.js']) {
        edit(dir, file, s => {
          if (s.includes('function securitySizeGate(')) return s;
          const gate = [
            'function securitySizeGate(inst, def, payload, size) {',
            '  for (const check of def.checks || []) {',
            '    const d = check._zod.def;',
            "    if (d.check === 'overwrite') break;",
            "    const maximum = d.check === 'max_length' || d.check === 'max_size' ? d.maximum :",
            "      d.check === 'length_equals' ? d.length : d.check === 'size_equals' ? d.size : undefined;",
            '    if (maximum !== undefined && size > maximum) {',
            '      check._zod.check(payload);',
            '      for (const issue of payload.issues) issue.continue = false;',
            '      return true;',
            '    }',
            '  }',
            '  return false;',
            '}',
            '',
          ].join('\n');
          s = replace(s, '        payload.value = Array(input.length);',
            '        if (securitySizeGate(inst, def, payload, input.length)) return payload;\n        payload.value = Array(input.length);');
          for (const type of ['Map', 'Set']) {
            const old = '        const proms = [];\n        payload.value = new ' + type + '();';
            s = replace(s, old, '        if (securitySizeGate(inst, def, payload, input.size)) return payload;\n' + old);
          }
          return s + '\n' + gate;
        });
      }
      return true;
    case '@nestjs/core':
      if (!pkg.version.startsWith('10.')) return false;
      edit(dir, 'router/sse-stream.js', s => {
        s = replace(s, '${message.type}', "${String(message.type).replace(/[\\r\\n]/g, '')}");
        return replace(s, '${message.id}', "${String(message.id).replace(/[\\r\\n]/g, '')}");
      });
      return true;
    default: return false;
  }
}
if (require.main === module) {
  let count = 0;
  for (const pkg of packages()) if (patch(pkg)) count++;
  console.log('Verified security backports in ' + count + ' installed packages.');
}
module.exports = { packages, patch };
