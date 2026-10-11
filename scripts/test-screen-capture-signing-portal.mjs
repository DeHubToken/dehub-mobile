import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectSigningPortal, verifyManagedProfileOwnership, TEAM, PROJECT, GROUP, BUNDLES } from './inspect-screen-capture-signing-portal.mjs';

const secret = 'PRIVATE_KEY_SENTINEL';
const jwt = 'JWT_SENTINEL';
const metadata = { id: 'stored-key', keyIdentifier: 'existing-key', issuerIdentifier: 'issuer', appleTeam: { appleTeamIdentifier: TEAM } };
function fixture({ project = PROJECT, keyMetadata = metadata, fullKey = null, groupError = null, missingBundle = null, storedProfiles = [], verifyManagedProfile } = {}) {
  const calls = [];
  const graphql = async (query, variables) => {
    calls.push({ query, variables });
    if (variables.ascApiKeyId) return { appStoreConnectApiKey: { byId: fullKey ?? { ...metadata, keyP8: secret } } };
    return { app: { byFullName: { id: project, iosAppCredentials: [{ appleAppIdentifier: { bundleIdentifier: BUNDLES[0] }, appStoreConnectApiKeyForSubmissions: keyMetadata, iosAppBuildCredentialsList: storedProfiles }] } } };
  };
  const apple = {
    Token: { sign: async () => jwt }, CapabilityType: { APP_GROUP: 'APP_GROUPS' }, ProfileType: { IOS_APP_STORE: 'IOS_APP_STORE' },
    BundleId: { findAsync: async (_context, { identifier }) => {
      if (identifier === missingBundle) return null;
      return {
        getBundleIdCapabilitiesAsync: async () => [{ isType: type => type === 'APP_GROUPS', attributes: { enabled: true } }],
        getProfilesAsync: async () => [{ attributes: { profileType: 'IOS_APP_STORE', profileState: 'ACTIVE', profileContent: secret } }],
      };
    } },
    AppGroup: { getAsync: async () => {
      if (groupError) throw groupError;
      return [{ attributes: { identifier: GROUP } }];
    } },
  };
  return { graphql, apple, calls, ...(verifyManagedProfile ? { verifyManagedProfile } : {}) };
}

test('reads all three portal targets without reporting credentials or claiming release readiness', async () => {
  const input = fixture();
  const report = await inspectSigningPortal(input);
  assert.equal(report.portalBundleLookupSucceeded, true);
  assert.equal(report.recordingGroupRegistered, true);
  assert.deepEqual(report.profiles.map(profile => profile.bundleIdentifier), BUNDLES);
  assert.equal(report.readOnly, true);
  assert.equal(report.credentialMutationRequested, false);
  assert.equal(report.buildDispatched, false);
  assert.equal(report.releaseReady, false);
  assert.equal(JSON.stringify(report).includes(secret), false);
  assert.equal(JSON.stringify(report).includes(jwt), false);
});

test('refuses a different project before retrieving a private key', async () => {
  const input = fixture({ project: 'other-project' });
  const report = await inspectSigningPortal(input);
  assert.deepEqual(report.findings, ['wrong_expo_project']);
  assert.equal(input.calls.length, 1);
});

test('refuses another team or an unassigned team without profile ownership proof before retrieving a key', async () => {
  for (const team of ['OTHER_TEAM', undefined]) {
    const input = fixture({ keyMetadata: { ...metadata, appleTeam: team ? { appleTeamIdentifier: team } : null } });
    const report = await inspectSigningPortal(input);
    assert.deepEqual(report.findings, ['managed_key_team_not_confirmed']);
    assert.equal(input.calls.length, 1);
  }
});

test('uses an unassigned project key only after checking the current managed main profile', async () => {
  let verified = false;
  const input = fixture({
    keyMetadata: { ...metadata, appleTeam: null },
    storedProfiles: [{ iosDistributionType: 'APP_STORE', provisioningProfile: { provisioningProfile: 'current-profile' } }],
    verifyManagedProfile: encoded => { assert.equal(encoded, 'current-profile'); verified = true; return true; },
  });
  input.apple.Token.sign = async () => { assert.equal(verified, true); return jwt; };
  const report = await inspectSigningPortal(input);
  assert.equal(report.managedKeyTeamMetadata, 'unassigned');
  assert.equal(report.managedProfileOwnershipVerified, true);
  assert.equal(report.portalBundleLookupSucceeded, true);
  assert.equal(report.releaseReady, false);
});

test('invalid profile ownership cannot authorize an unassigned key', async () => {
  const input = fixture({
    keyMetadata: { ...metadata, appleTeam: null },
    storedProfiles: [{ iosDistributionType: 'APP_STORE', provisioningProfile: { provisioningProfile: 'other-profile' } }],
    verifyManagedProfile: () => false,
  });
  const report = await inspectSigningPortal(input);
  assert.equal(report.managedProfileOwnershipVerified, false);
  assert.equal(input.calls.length, 1);
});

test('a key that cannot read the existing main bundle does not enumerate extension identifiers', async () => {
  const input = fixture({ missingBundle: BUNDLES[0] });
  const report = await inspectSigningPortal(input);
  assert.deepEqual(report.findings, ['main_bundle_not_accessible_to_project_key']);
  assert.equal(report.portalBundleLookupSucceeded, false);
  assert.deepEqual(report.profiles, []);
});

test('rejects malformed profile payloads without accepting their claimed team', () => {
  for (const value of ['', 'not base64', Buffer.from('<plist>J8BTYL3PDK</plist>').toString('base64')]) {
    assert.equal(verifyManagedProfileOwnership(value), false);
  }
});

test('verifies CMS signature, main app identity, App Store distribution and expiration', () => {
  const dir = mkdtempSync(join(tmpdir(), 'recording-profile-test-'));
  const key = join(dir, 'fixture.key'), certificate = join(dir, 'fixture.crt');
  try {
    const generated = spawnSync('openssl', ['req', '-new', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', certificate, '-subj', '/CN=Profile fixture', '-days', '1'], { encoding: 'utf8' });
    assert.equal(generated.status, 0);
    const profile = options => {
      const serialized = spawnSync('python3', ['-c', `import json,plistlib,sys
from datetime import datetime,timedelta
data=json.load(sys.stdin)
profile={'TeamIdentifier':[data['team']], 'Entitlements':{'application-identifier':data['team']+'.'+data['bundle']}, 'ExpirationDate':datetime.now()+timedelta(days=data['days'])}
if data['development']: profile['ProvisionedDevices']=['test-device']
sys.stdout.buffer.write(plistlib.dumps(profile))`], { input: JSON.stringify({ team: TEAM, bundle: BUNDLES[0], days: 1, development: false, ...options }) });
      assert.equal(serialized.status, 0);
      const signed = spawnSync('openssl', ['cms', '-sign', '-binary', '-nodetach', '-signer', certificate, '-inkey', key, '-outform', 'DER'], { input: serialized.stdout });
      assert.equal(signed.status, 0);
      return signed.stdout.toString('base64');
    };
    assert.equal(verifyManagedProfileOwnership(profile({})), true);
    assert.equal(verifyManagedProfileOwnership(profile({ team: 'OTHER_TEAM' })), false);
    assert.equal(verifyManagedProfileOwnership(profile({ bundle: BUNDLES[1] })), false);
    assert.equal(verifyManagedProfileOwnership(profile({ days: -1 })), false);
    assert.equal(verifyManagedProfileOwnership(profile({ development: true })), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('refuses a replaced key instead of signing with it', async () => {
  const input = fixture({ fullKey: { ...metadata, id: 'different-key', keyP8: secret } });
  input.apple.Token.sign = async () => assert.fail('must not sign');
  const report = await inspectSigningPortal(input);
  assert.deepEqual(report.findings, ['managed_key_does_not_match_metadata']);
  assert.equal(JSON.stringify(report).includes(secret), false);
});

test('does not retrieve absent or individual submission keys', async () => {
  for (const keyMetadata of [null, { ...metadata, issuerIdentifier: null }]) {
    const input = fixture({ keyMetadata });
    const report = await inspectSigningPortal(input);
    assert.equal(input.calls.length, 1);
    assert.equal(report.managedTeamKeyAvailable, false);
    assert.equal(report.findings.length, 1);
  }
});

test('records a missing extension and redacts portal errors', async () => {
  const error = new Error(secret + jwt);
  error.response = { status: 403, data: secret };
  const report = await inspectSigningPortal(fixture({ missingBundle: BUNDLES[1], groupError: error }));
  assert.equal(report.profiles[1].registered, false);
  assert.equal(report.recordingGroupLookupSucceeded, false);
  assert.deepEqual(report.findings, ['recording_group_lookup_failed_http_403']);
  assert.equal(JSON.stringify(report).includes(secret), false);
  assert.equal(JSON.stringify(report).includes(jwt), false);
});
