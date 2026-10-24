import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const contract = JSON.parse(fs.readFileSync(new URL('../ops/production-routing.json', import.meta.url), 'utf8'));

export function checkAnswers(a, aaaa, expected = contract.ipv4) {
  if (a.Status !== 0 || ![0, 3].includes(aaaa.Status)) throw new Error('DNS lookup failed');
  const addresses = (a.Answer ?? []).filter(answer => answer.type === 1).map(answer => answer.data);
  if (!addresses.length || addresses.some(address => address !== expected)) {
    throw new Error(`Public DNS must resolve directly to ${expected}; got ${addresses.join(', ') || 'no A record'}. Do not enable the apex proxy.`);
  }
  if ((aaaa.Answer ?? []).some(answer => answer.type === 28)) {
    throw new Error('Unexpected apex IPv6 route; validate it on the affected network before changing the routing contract.');
  }
}

export function checkWorkerConfig(source) {
  const config = JSON.parse(source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''));
  for (const route of config.routes ?? []) {
    const pattern = typeof route === 'string' ? route : route.pattern;
    const host = pattern.replace(/^https?:\/\//, '').split('/')[0];
    if (host === contract.hostname || host === `*.${contract.hostname}`) {
      throw new Error('The public apex must not be attached to a Worker route or custom domain. Deploy through origin.dehub.io.');
    }
  }
  if (!(config.routes ?? []).some(route => route.pattern === contract.workerOrigin && route.custom_domain === true)) {
    throw new Error('The stable Worker origin must remain declared as a custom domain.');
  }
}

async function json(url, init = {}) {
  const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${new URL(url).hostname}: HTTP ${response.status}`);
  return response.json();
}

export async function main() {
  const config = new URL('../wrangler.jsonc', import.meta.url);
  if (fs.existsSync(config)) checkWorkerConfig(fs.readFileSync(config, 'utf8'));
  if (process.argv.includes('--config-only')) return;
  // Release checks only: no timer and no probes on a user's device.
  for (const endpoint of ['https://cloudflare-dns.com/dns-query', 'https://dns.google/resolve']) {
    const lookup = type => json(`${endpoint}?name=${contract.hostname}&type=${type}`, { headers: { accept: 'application/dns-json' } });
    const [a, aaaa] = await Promise.all([lookup('A'), lookup('AAAA')]);
    checkAnswers(a, aaaa);
    console.log(`${new URL(endpoint).hostname}: direct DNS verified`);
  }
  const version = await json(`https://${contract.hostname}/version.json`);
  if (!/^[a-f0-9]{8,40}$/.test(version.id ?? '')) throw new Error('Production version response is invalid');
  const health = await json(`https://${contract.hostname}/_api/api/health`);
  if (health.status !== 'ok') throw new Error('Production API health failed');
  console.log(`Production HTTPS and API verified (${version.id}). Phone verification is still required after routing changes.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
