import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkAnswers, checkWorkerConfig, contract } from './production-routing.mjs';

const dns = (addresses, type = 1) => ({ Status: 0, Answer: addresses.map(data => ({ type, data })) });
test('accepts the direct gateway with no IPv6 record', () => {
  checkAnswers(dns([contract.ipv4]), dns([], 28));
  checkAnswers(dns([contract.ipv4]), { Status: 3 });
});
test('rejects the observed Cloudflare regression and mixed routes', () => {
  for (const addresses of [['188.114.96.5', '188.114.97.5'], [contract.ipv4, '188.114.96.5'], []]) {
    assert.throws(() => checkAnswers(dns(addresses), dns([])), /Public DNS/);
  }
});
test('rejects broken DNS and a competing IPv6 route', () => {
  assert.throws(() => checkAnswers({ Status: 2 }, dns([])), /lookup failed/);
  assert.throws(() => checkAnswers(dns([contract.ipv4]), dns(['2606:4700::1'], 28)), /IPv6/);
});
test('release config keeps only the upstream Worker binding', () => {
  const config = new URL('../wrangler.jsonc', import.meta.url);
  if (fs.existsSync(config)) checkWorkerConfig(fs.readFileSync(config, 'utf8'));
  const origin = { pattern: contract.workerOrigin, custom_domain: true };
  for (const route of [contract.hostname + '/*', { pattern: contract.hostname, custom_domain: true }, { pattern: '*.dehub.io/*' }]) {
    assert.throws(() => checkWorkerConfig(JSON.stringify({ routes: [origin, route] })), /public apex/);
  }
  assert.throws(() => checkWorkerConfig('{"routes":[]}'), /stable Worker origin/);
});
