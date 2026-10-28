const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Readable, Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { pathToFileURL } = require('node:url');
const { packages } = require('./patch-security-dependencies.cjs');

for (const pkg of packages()) {
  const label = pkg.name + '@' + pkg.version + ' ' + pkg.dir;
  const from = relative => require(path.join(pkg.dir, relative));
  if (pkg.name === 'deepmerge') test(label + ' preserves safe own properties', () => {
    const merge = from('dist/cjs.js');
    for (const input of [
      JSON.parse('{"__proto__":{"admin":true}}'),
      { nested: JSON.parse('{"__proto__":{"admin":true}}') },
    ]) {
      const output = merge(input, {});
      assert.equal(Object.getPrototypeOf(output), Object.prototype);
      assert.equal(output.admin, undefined);
      if (output.nested) assert.equal(Object.getPrototypeOf(output.nested), Object.prototype);
    }
    assert.deepEqual(merge({ a: [1], nested: { x: 1 } }, { a: [2], nested: { y: 2 } }),
      { a: [1, 2], nested: { x: 1, y: 2 } });
  });
  if (pkg.name === 'elliptic') test(label + ' preserves full RFC6979 nonce width', () => {
    const { ec: EC } = from('lib/elliptic.js');
    const ec = new EC('p521');
    for (const vector of require('./security/elliptic-p521-vectors.json')) {
      const digest = createHash('sha512').update(Buffer.from(vector.msg, 'hex')).digest();
      const signature = ec.sign(digest, vector.privateKey, 'hex');
      assert.equal(signature.toDER('hex'), vector.sig, 'P-521 vector ' + vector.tcId);
    }
    const secp = new EC('secp256k1');
    const digest = Buffer.alloc(32, 7);
    const key = secp.keyFromPrivate('01');
    assert.equal(secp.verify(digest, secp.sign(digest, key), key), true);
  });
  if (pkg.name === 'decode-uri-component') test(label + ' decodes without exponential fallback', () => {
    const decode = from('index.js');
    assert.equal(decode('%C3%A5%20x'), 'å x');
    assert.equal(decode('%41%FF%42'), 'A%FFB');
    assert.equal(decode('%FF'.repeat(10_000)), '%FF'.repeat(10_000));
  });
  if (pkg.name === 'bigint-buffer') test(label + ' uses safe JavaScript for wide buffers', () => {
    const convert = from('dist/node.js');
    const input = Buffer.alloc(256); input[0] = 1;
    assert.equal(convert.toBigIntLE(input), 1n);
    assert.equal(convert.toBigIntBE(Buffer.from([1, 0])), 256n);
    assert.equal(convert.toBufferLE(513n, 2).toString('hex'), '0102');
    assert.equal(convert.toBufferBE(513n, 2).toString('hex'), '0201');
  });
  if (pkg.name === 'stream-json') {
    test(label + ' cannot poison parsed object prototypes', () => {
      const Assembler = from('Assembler.js');
      for (const options of [undefined, { reviver: (_, value) => value }]) {
        const assembler = new Assembler(options);
        assembler.startObject();
        assembler.keyValue('__proto__');
        assembler._saveValue({ admin: true });
        assembler.endObject();
        assert.equal(Object.getPrototypeOf(assembler.current), Object.prototype);
        assert.equal(assembler.current.admin, undefined);
        assert.equal(Object.hasOwn(assembler.current, '__proto__'), true);
      }
    });
    test(label + ' bounds parser depth', async () => {
      const Parser = from('Parser.js');
      await assert.rejects(pipeline(
        Readable.from(['['.repeat(130) + '0' + ']'.repeat(130)]),
        new Parser(),
        new Writable({ objectMode: true, write(_value, _encoding, done) { done(); } }),
      ), /nesting exceeds/);
    });
  }
  if (pkg.name === 'zod' && pkg.version.startsWith('3.')) {
    for (const entry of ['v3/index.cjs', 'v4/index.cjs', 'v3/index.js', 'v4/index.js']) {
      test(label + ' rejects oversized collections before parsing elements: ' + entry, async () => {
        const { z } = entry.endsWith('.js') ? await import(pathToFileURL(path.join(pkg.dir, entry)).href) : from(entry);
        let parsed = 0;
        const element = z.string().refine(() => { parsed++; return true; });
        for (const schema of [z.array(element).max(1), z.array(element).length(1)]) {
          const result = await schema.safeParseAsync(['a', 'b']);
          assert.equal(result.success, false);
          assert.equal(parsed, 0);
          assert.equal(result.error.issues[0].code, 'too_big');
        }
        const result = z.set(element).max(1).safeParse(new Set(['a', 'b']));
        assert.equal(result.success, false);
        assert.equal(parsed, 0);
        assert.equal(z.array(z.string()).max(2).safeParse(['a', 'b']).success, true);
      });
    }
  }
  if (pkg.name === '@nestjs/core' && pkg.version.startsWith('10.')) test(label + ' neutralizes SSE field separators', () => {
    const { SseStream } = from('router/sse-stream.js');
    const stream = new SseStream();
    stream._transform({ type: 'update\r\nid: injected', id: '1\nevent: injected', data: 'safe' }, 'utf8', () => {});
    const output = stream.read().toString();
    assert.equal(output.includes('\nid: injected'), false);
    assert.equal(output.includes('\nevent: injected'), false);
    const plain = new SseStream();
    plain._transform({ data: 'safe' }, 'utf8', () => {});
    assert.equal(plain.read().toString().includes('undefined'), false);
  });
}
