// Adds one person to a TestFlight group and sends the invite email.
// Uses the App Store Connect team key already stored with the Expo project.
// The key never leaves this process and is never printed.
import { createSign } from 'node:crypto';

const APP_ID = '6770382811';
const PROJECT = '@dehubapp/dehubmobile';
const BUNDLE = 'io.dehub.mobile';

const email = (process.env.TESTER_EMAIL ?? '').trim().toLowerCase();
const firstName = (process.env.TESTER_FIRST_NAME ?? '').trim();
const lastName = (process.env.TESTER_LAST_NAME ?? '').trim();
const groupName = (process.env.TESTER_GROUP ?? 'Dev testers').trim();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Give a real email address');
if (!process.env.EXPO_TOKEN) throw new Error('EXPO_TOKEN is missing');

async function expo(query, variables) {
  const res = await fetch('https://api.expo.dev/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.EXPO_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors || !json.data) throw new Error(`Expo lookup failed (HTTP ${res.status})`);
  return json.data;
}

async function loadKey() {
  const meta = await expo(`query($p: String!) { app { byFullName(fullName: $p) { iosAppCredentials {
    appleAppIdentifier { bundleIdentifier }
    appStoreConnectApiKeyForSubmissions { id }
  } } } }`, { p: PROJECT });
  const ids = new Set((meta.app?.byFullName?.iosAppCredentials ?? [])
    .filter(r => r.appleAppIdentifier?.bundleIdentifier === BUNDLE)
    .map(r => r.appStoreConnectApiKeyForSubmissions?.id).filter(Boolean));
  if (ids.size !== 1) throw new Error('Could not find exactly one App Store Connect key on the Expo project');
  const data = await expo(`query($id: ID!) { appStoreConnectApiKey { byId(id: $id) {
    issuerIdentifier keyIdentifier keyP8 } } }`, { id: [...ids][0] });
  const key = data.appStoreConnectApiKey?.byId;
  if (!key?.keyP8 || !key.issuerIdentifier || !key.keyIdentifier) throw new Error('App Store Connect key is incomplete');
  return key;
}

function token(key) {
  const b64 = v => Buffer.from(JSON.stringify(v)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'ES256', kid: key.keyIdentifier, typ: 'JWT' })}.${b64({ iss: key.issuerIdentifier, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' })}`;
  const sig = createSign('SHA256').update(body).sign({ key: key.keyP8, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${body}.${sig}`;
}

const key = await loadKey();
const jwt = token(key);

async function asc(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  return { status: res.status, json };
}

function fail(step, r) {
  const detail = (r.json.errors ?? []).map(e => `${e.code}: ${e.detail ?? e.title}`).join('; ');
  throw new Error(`${step} failed (HTTP ${r.status}) ${detail}`);
}

const groupsRes = await asc('GET', `/v1/apps/${APP_ID}/betaGroups?limit=50&fields[betaGroups]=name,isInternalGroup,publicLinkEnabled`);
if (groupsRes.status !== 200) fail('Listing TestFlight groups', groupsRes);
const groups = groupsRes.json.data ?? [];
console.log('TestFlight groups:', groups.map(g => `${g.attributes.name}${g.attributes.isInternalGroup ? ' (internal)' : ''}`).join(', '));
const group = groups.find(g => g.attributes.name.toLowerCase() === groupName.toLowerCase());
if (!group) throw new Error(`No TestFlight group named "${groupName}"`);

const attributes = { email, ...(firstName ? { firstName } : {}), ...(lastName ? { lastName } : {}) };
const created = await asc('POST', '/v1/betaTesters', {
  data: { type: 'betaTesters', attributes, relationships: { betaGroups: { data: [{ type: 'betaGroups', id: group.id }] } } },
});

if (created.status === 201) {
  console.log(`Added ${email} to "${group.attributes.name}". Apple sends the invite email.`);
} else if (created.status === 409) {
  // Already a tester somewhere on the team: add to the group and resend the invite.
  const found = await asc('GET', `/v1/betaTesters?filter[email]=${encodeURIComponent(email)}&filter[apps]=${APP_ID}&limit=5`);
  let tester = found.json.data?.[0];
  if (!tester) {
    const any = await asc('GET', `/v1/betaTesters?filter[email]=${encodeURIComponent(email)}&limit=5`);
    tester = any.json.data?.[0];
  }
  if (!tester) fail('Adding tester', created);
  const link = await asc('POST', `/v1/betaGroups/${group.id}/relationships/betaTesters`, { data: [{ type: 'betaTesters', id: tester.id }] });
  if (![200, 204].includes(link.status)) fail('Adding tester to group', link);
  const invite = await asc('POST', '/v1/betaTesterInvitations', {
    data: { type: 'betaTesterInvitations', relationships: {
      app: { data: { type: 'apps', id: APP_ID } }, betaTester: { data: { type: 'betaTesters', id: tester.id } } } },
  });
  if (invite.status !== 201) console.log(`Invite resend answered HTTP ${invite.status} (tester is in the group either way)`);
  console.log(`${email} was already a tester; now in "${group.attributes.name}" and invite resent.`);
} else {
  fail('Adding tester', created);
}

const builds = await asc('GET', `/v1/betaGroups/${group.id}/builds?limit=5&fields[builds]=version,processingState,uploadedDate&sort=-uploadedDate`);
if (builds.status === 200) {
  console.log('Builds in this group (newest first):', (builds.json.data ?? []).map(b => b.attributes.version).join(', ') || 'none');
}
