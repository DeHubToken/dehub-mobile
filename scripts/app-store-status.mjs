// Prints where the iOS app stands with Apple: App Store versions, review
// submissions and TestFlight beta review for the newest builds. Read only.
// Uses the App Store Connect team key stored with the Expo project; the key
// never leaves this process and is never printed.
import { createSign } from 'node:crypto';
import { appendFileSync } from 'node:fs';

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
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    headers: { authorization: `Bearer ${jwt}` },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (res.status !== 200) {
    const detail = (json.errors ?? []).map(e => `${e.code}: ${e.detail ?? e.title}`).join('; ');
    return { error: `HTTP ${res.status} ${detail}`, data: [], included: [] };
  }
  return { data: json.data ?? [], included: json.included ?? [] };
}

const lines = [];
const say = (s = '') => { lines.push(s); console.log(s); };

say('## App Store versions (newest first)');
const versions = await get(`/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&limit=5&include=build`);
if (versions.error) say(`- could not read: ${versions.error}`);
for (const v of versions.data) {
  const a = v.attributes;
  const buildId = v.relationships?.build?.data?.id;
  const build = versions.included.find(i => i.type === 'builds' && i.id === buildId);
  say(`- ${a.versionString} (build ${build?.attributes?.version ?? '?'}): ${a.appVersionState ?? a.appStoreState} [appStoreState ${a.appStoreState}], release ${a.releaseType ?? '?'}, created ${a.createdDate?.slice(0, 16) ?? '?'}`);
}

say('');
say('## Review submissions (newest first)');
const subs = await get(`/v1/apps/${APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=5`);
if (subs.error) say(`- could not read: ${subs.error}`);
for (const s of subs.data) say(`- ${s.attributes.state}, submitted ${s.attributes.submittedDate?.slice(0, 16) ?? 'not yet'}`);

say('');
say('## TestFlight builds (newest first)');
const builds = await get(`/v1/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=4&include=betaAppReviewSubmission,preReleaseVersion,buildBetaDetail`);
if (builds.error) say(`- could not read: ${builds.error}`);
const inc = (type, rel) => builds.included.find(i => i.type === type && i.id === rel?.data?.id);
for (const b of builds.data) {
  const pre = inc('preReleaseVersions', b.relationships?.preReleaseVersion);
  const review = inc('betaAppReviewSubmissions', b.relationships?.betaAppReviewSubmission);
  const detail = inc('buildBetaDetails', b.relationships?.buildBetaDetail);
  say(`- ${pre?.attributes?.version ?? '?'} (${b.attributes.version}): processing ${b.attributes.processingState}${b.attributes.expired ? ', EXPIRED' : ''}, beta review ${review?.attributes?.betaReviewState ?? 'not submitted'}, internal ${detail?.attributes?.internalBuildState ?? '?'}, external ${detail?.attributes?.externalBuildState ?? '?'}, uploaded ${b.attributes.uploadedDate?.slice(0, 16) ?? '?'}`);
}

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
