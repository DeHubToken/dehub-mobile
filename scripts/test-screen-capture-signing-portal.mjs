import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectSigningPortal, TEAM, PROJECT, GROUP, BUNDLES } from './inspect-screen-capture-signing-portal.mjs';

const secret = 'PRIVATE_KEY_SENTINEL';
const jwt = 'JWT_SENTINEL';
const metadata = { id: 'stored-key', keyIdentifier: 'existing-key', issuerIdentifier: 'issuer', appleTeam: { appleTeamIdentifier: TEAM } };
function fixture({ project = PROJECT, keyMetadata = metadata, fullKey = null, groupError = null, missingBundle = null } = {}) {
  const calls = [];
  const graphql = async (query, variables) => {
    calls.push({ query, variables });
    if (variables.ascApiKeyId) return { appStoreConnectApiKey: { byId: fullKey ?? { ...metadata, keyP8: secret } } };
    return { app: { byFullName: { id: project, iosAppCredentials: [{ appleAppIdentifier: { bundleIdentifier: BUNDLES[0] }, appStoreConnectApiKeyForSubmissions: keyMetadata }] } } };
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
  return { graphql, apple, calls };
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

test('refuses a key from another or unconfirmed team before retrieving it', async () => {
  for (const team of ['OTHER_TEAM', undefined]) {
    const input = fixture({ keyMetadata: { ...metadata, appleTeam: team ? { appleTeamIdentifier: team } : null } });
    const report = await inspectSigningPortal(input);
    assert.deepEqual(report.findings, ['managed_key_team_not_confirmed']);
    assert.equal(input.calls.length, 1);
  }
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
