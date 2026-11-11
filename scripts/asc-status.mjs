// Read-only: prints the App Store review status for the iOS app.
// Uses the App Store Connect team key already stored with the Expo project.
// The key never leaves this process and is never printed.
import { createSign } from 'node:crypto';

const APP_ID = '6770382811';
const PROJECT = '@dehubapp/dehubmobile';
const BUNDLE = 'io.dehub.mobile';

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

const jwt = token(await loadKey());
async function get(path) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, { headers: { authorization: `Bearer ${jwt}` }, signal: AbortSignal.timeout(30_000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) { note(`ERROR ${path.split('?')[0]} HTTP ${res.status} ${json.errors?.[0]?.detail ?? ''}`); return []; }
  return json.data ?? [];
}
function note(line) { console.log(`::notice::${line.replace(/\n/g, ' ')}`); }

const app = (await get(`/v1/apps/${APP_ID}`));
note(`APP ${app.attributes?.name} (${app.attributes?.bundleId})`);
for (const v of await get(`/v1/apps/${APP_ID}/appStoreVersions?limit=5`)) {
  const a = v.attributes;
  note(`VERSION ${a.platform} ${a.versionString} state=${a.appStoreState} appVersionState=${a.appVersionState ?? ''} release=${a.releaseType} created=${a.createdDate}`);
}
for (const s of await get(`/v1/reviewSubmissions?filter[app]=${APP_ID}&limit=5`)) {
  const a = s.attributes;
  note(`SUBMISSION state=${a.state} platform=${a.platform} submitted=${a.submittedDate ?? '-'}`);
}
for (const b of await get(`/v1/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=5`)) {
  const a = b.attributes;
  note(`BUILD ${a.version} processing=${a.processingState} uploaded=${a.uploadedDate} expired=${a.expired}`);
}
for (const r of await get(`/v1/betaAppReviewSubmissions?filter[build]=${(await get(`/v1/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=1`))[0]?.id ?? ''}`)) {
  note(`BETA_REVIEW state=${r.attributes.betaReviewState} submitted=${r.attributes.submittedDate}`);
}
for (const i of await get(`/v1/apps/${APP_ID}/appInfos`).catch(() => [])) {
  note(`APPINFO state=${i.attributes.state ?? i.attributes.appStoreState}`);
}
