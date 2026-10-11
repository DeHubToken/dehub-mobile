import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { adoptProfiles, validateProfileIds, verifyProfile } from './adopt-screen-capture-profiles.mjs';
import { BUNDLES, PROJECT, TEAM } from './inspect-screen-capture-signing-portal.mjs';

const ids = ['B8Z6S6X232', 'BKLUV7Q8Y4', '3MV2M8C58Z'];
function setup() {
  const cert = { id: 'existing-cert', developerPortalIdentifier: 'existing-portal-cert', appleTeam: { id: 'existing-team', appleTeamIdentifier: TEAM } };
  const key = { id: 'existing-key', issuerIdentifier: 'existing-issuer', keyIdentifier: 'existing-key-id' };
  const main = { id: 'main-credentials', appleAppIdentifier: { id: 'main-id', bundleIdentifier: BUNDLES[0] }, appStoreConnectApiKeyForSubmissions: key, iosAppBuildCredentialsList: [{ id: 'main-build', iosDistributionType: 'APP_STORE', distributionCertificate: cert, provisioningProfile: { id: 'main-profile', provisioningProfile: 'old-main', developerPortalIdentifier: ids[0] } }] };
  const app = { id: PROJECT, ownerAccount: { id: 'existing-account', name: 'dehubapp' }, iosAppCredentials: [main] };
  const identifiers = [{ id: 'main-id', bundleIdentifier: BUNDLES[0] }];
  const profiles = new Map(), calls = [], saved = [];
  const report = { credentialMutationRequested: false, allProfilesValidated: false, managedProfilesVerified: false, profiles: [], buildDispatched: false, newKeyCreated: false, newCertificateCreated: false };
  const portal = ids.map((id, index) => ({ id, attributes: { profileState: 'ACTIVE', profileType: 'IOS_APP_STORE', profileContent: `new-${index}` }, getBundleIdAsync: async () => ({ attributes: { identifier: BUNDLES[index], seedId: TEAM } }), getCertificatesAsync: async () => [{ id: cert.developerPortalIdentifier }] }));
  const apple = { Token: { sign: async () => 'existing-key-token' }, Profile: { infoAsync: async (_context, options) => portal[ids.indexOf(options.id)] } };
  const verify = encoded => ({ valid: Boolean(encoded), certificateSha256: 'existing-certificate-hash', profileSha256: createHash('sha256').update(encoded ?? '').digest('hex') });
  const graphql = async (query, variables) => {
    calls.push({ query, variables });
    if (query.startsWith('query RecordingProfileAdoption(')) return { app: { byFullName: app } };
    if (query.startsWith('query RecordingProfileAdoptionKey(')) return { appStoreConnectApiKey: { byId: { ...key, keyP8: 'private-key-fixture' } } };
    if (query.startsWith('query RecordingProfileIdentifier(')) return { account: { byName: { id: app.ownerAccount.id, appleAppIdentifiers: identifiers.filter(item => item.bundleIdentifier === variables.bundleIdentifier) } } };
    assert.ok(query.startsWith('mutation '), 'Unexpected query');
    saved.push({ query, variables });
    if (query.includes('RecordingProfileIdentifierCreate(')) {
      const created = { id: `identifier-${identifiers.length}`, bundleIdentifier: variables.input.bundleIdentifier };
      identifiers.push(created); return { appleAppIdentifier: { createAppleAppIdentifier: created } };
    }
    if (query.includes('RecordingTargetCredentialsCreate(')) {
      const credential = { id: `credential-${app.iosAppCredentials.length}`, appleAppIdentifier: identifiers.find(item => item.id === variables.identifierId), iosAppBuildCredentialsList: [] };
      app.iosAppCredentials.push(credential); return { iosAppCredentials: { createIosAppCredentials: { id: credential.id } } };
    }
    if (query.includes('RecordingManagedProfileUpdate(') || query.includes('RecordingManagedProfileCreate(')) {
      const id = variables.id ?? `profile-${profiles.size}`;
      const profile = { id, developerPortalIdentifier: variables.input.developerPortalIdentifier, provisioningProfile: variables.input.appleProvisioningProfile };
      profiles.set(id, profile);
      return { appleProvisioningProfile: { [variables.id ? 'updateAppleProvisioningProfile' : 'createAppleProvisioningProfile']: { id } } };
    }
    if (query.includes('RecordingBuildProfileSet(')) {
      const build = app.iosAppCredentials.flatMap(record => record.iosAppBuildCredentialsList).find(record => record.id === variables.id);
      build.provisioningProfile = profiles.get(variables.profileId);
      return { iosAppBuildCredentials: { setProvisioningProfile: { id: variables.id } } };
    }
    if (query.includes('RecordingBuildCredentialsCreate(')) {
      const credential = app.iosAppCredentials.find(item => item.id === variables.credentialsId);
      const build = { id: `build-${credential.id}`, iosDistributionType: 'APP_STORE', distributionCertificate: cert, provisioningProfile: profiles.get(variables.input.provisioningProfileId) };
      credential.iosAppBuildCredentialsList.push(build); return { iosAppBuildCredentials: { createIosAppBuildCredentials: { id: build.id } } };
    }
    throw new Error('Unexpected mutation');
  };
  return { app, main, cert, key, portal, report, calls, saved, apple, graphql, verify, ids };
}
test('inspect validates all profiles without writing credentials, creating keys or starting a build', async () => {
  const fixture = setup(); await adoptProfiles(fixture);
  assert.equal(fixture.report.allProfilesValidated, true); assert.equal(fixture.saved.length, 0);
  assert.equal(fixture.report.credentialMutationRequested, false); assert.equal(fixture.report.buildDispatched, false);
  assert.ok(!JSON.stringify(fixture.report).includes('private-key-fixture'));
  assert.ok(!JSON.stringify(fixture.report).includes('new-0'));
});
test('adopt reuses the existing certificate, updates the main profile and creates only required extension mappings', async () => {
  const fixture = setup(); await adoptProfiles({ ...fixture, mode: 'adopt' });
  assert.equal(fixture.report.managedProfilesVerified, true); assert.ok(fixture.report.profiles.every(profile => profile.updated));
  const buildWrites = fixture.saved.filter(call => call.query.includes('RecordingBuildCredentialsCreate('));
  assert.equal(buildWrites.length, 2); assert.ok(buildWrites.every(call => call.variables.input.distributionCertificateId === fixture.cert.id));
  assert.ok(fixture.saved.every(call => !/create.*Certificate|create.*ApiKey|setDistributionCertificate/.test(call.query)));
  assert.equal(fixture.report.buildDispatched, false);
});
test('repeating adoption uses existing identifiers, credentials and profiles', async () => {
  const fixture = setup(); await adoptProfiles({ ...fixture, mode: 'adopt' }); fixture.saved.length = 0;
  await adoptProfiles({ ...fixture, mode: 'adopt' });
  assert.ok(fixture.saved.every(call => /RecordingManagedProfileUpdate|RecordingBuildProfileSet/.test(call.query)));
  assert.equal(fixture.app.iosAppCredentials.length, 3);
});
test('validates profile IDs and mode before accessing managed credentials', async () => {
  for (const value of [[], [ids[0], ids[0], ids[2]], [ids[0], '../wrong-id', ids[2]]]) assert.throws(() => validateProfileIds(value));
  const fixture = setup(); await assert.rejects(adoptProfiles({ ...fixture, mode: 'build' }), /invalid_mode/); assert.equal(fixture.calls.length, 0);
});
test('rejects a different project before private key lookup or mutation', async () => {
  const fixture = setup(); fixture.app.id = 'different-project';
  await assert.rejects(adoptProfiles({ ...fixture, mode: 'adopt' }), /wrong_expo_project/); assert.equal(fixture.calls.length, 1); assert.equal(fixture.saved.length, 0);
});
test('rejects an existing target bound to a different distribution certificate', async () => {
  const fixture = setup(); fixture.app.iosAppCredentials.push({ id: 'other-target', appleAppIdentifier: { id: 'other-id', bundleIdentifier: BUNDLES[1] }, iosAppBuildCredentialsList: [{ iosDistributionType: 'APP_STORE', distributionCertificate: { id: 'different-cert' } }] });
  await assert.rejects(adoptProfiles({ ...fixture, mode: 'adopt' }), /existing_target_certificate_mismatch/); assert.equal(fixture.saved.length, 0);
});
test('rejects a different managed signing team before using its private key', async () => {
  const fixture = setup(); fixture.cert.appleTeam.appleTeamIdentifier = 'OTHERTEAM';
  await assert.rejects(adoptProfiles({ ...fixture, mode: 'adopt' }), /managed_certificate_or_profile_missing/); assert.equal(fixture.calls.length, 1);
});
test('validates the last target before making any write', async () => {
  const fixture = setup(); fixture.portal[2].attributes.profileState = 'INVALID';
  await assert.rejects(adoptProfiles({ ...fixture, mode: 'adopt' }), /portal_profile_invalid/); assert.equal(fixture.saved.length, 0);
});
test('rejects a portal profile for another bundle before writes', async () => {
  const fixture = setup(); fixture.portal[2].getBundleIdAsync = async () => ({ attributes: { identifier: 'xyz.other.app', seedId: TEAM } });
  await assert.rejects(adoptProfiles({ ...fixture, mode: 'adopt' }), /portal_profile_bundle_mismatch/); assert.equal(fixture.saved.length, 0);
});
test('rejects a portal profile with a different existing certificate', async () => {
  const fixture = setup(); fixture.portal[1].getCertificatesAsync = async () => [{ id: 'different-cert' }];
  await assert.rejects(adoptProfiles({ ...fixture, mode: 'adopt' }), /portal_certificate_mismatch/); assert.equal(fixture.saved.length, 0);
});
test('rejects signed content that fails group or certificate validation before writes', async () => {
  const fixture = setup(); fixture.verify = (encoded, _bundle, requireGroup) => ({ valid: !(encoded === 'new-2' && requireGroup), certificateSha256: 'existing-certificate-hash' });
  await assert.rejects(adoptProfiles({ ...fixture, mode: 'adopt' }), /signed_profile_or_certificate_mismatch/); assert.equal(fixture.saved.length, 0);
});
test('rejects tampered managed readback even when the writes returned success', async () => {
  const fixture = setup(); let count = 0;
  const transport = async (query, variables) => { const result = await fixture.graphql(query, variables); if (query.startsWith('query RecordingProfileAdoption(') && ++count === 2) fixture.app.iosAppCredentials[2].iosAppBuildCredentialsList[0].provisioningProfile.provisioningProfile = 'tampered'; return result; };
  await assert.rejects(adoptProfiles({ ...fixture, graphql: transport, mode: 'adopt' }), /managed_profile_readback_mismatch/); assert.equal(fixture.report.managedProfilesVerified, false);
});
test('verifies real CMS signatures, the required group, expiry and modified signed bytes', () => {
  const folder = mkdtempSync(join(tmpdir(), 'recording-profile-fixture-'));
  function run(command, args, input) { const result = spawnSync(command, args, { input, encoding: 'utf8', timeout: 20_000 }); assert.equal(result.status, 0, result.stderr); return result.stdout; }
  try {
    run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', join(folder, 'key.pem'), '-out', join(folder, 'cert.pem'), '-sha256', '-days', '1', '-nodes', '-subj', '/CN=Recording Profile Fixture']);
    for (const [label, groups, expired] of [['valid', true, false], ['missing-group', false, false], ['expired', true, true]]) {
      const python = `import plistlib,json,sys,subprocess\nfrom datetime import datetime,timedelta\nr=json.load(sys.stdin)\nc=subprocess.run(['openssl','x509','-in',r['cert'],'-outform','DER'],capture_output=True,check=True).stdout\np={'TeamIdentifier':['${TEAM}'],'Entitlements':{'application-identifier':'${TEAM}.${BUNDLES[0]}','get-task-allow':False},'ExpirationDate':datetime.utcnow()+timedelta(days=-1 if r['expired'] else 1),'DeveloperCertificates':[c]}\nif r['groups']: p['Entitlements']['com.apple.security.application-groups']=['group.io.dehub.mobile.screen-capture']\nopen(r['out'],'wb').write(plistlib.dumps(p))`;
      run('python3', ['-c', python], JSON.stringify({ cert: join(folder, 'cert.pem'), out: join(folder, 'profile.plist'), groups, expired }));
      run('openssl', ['cms', '-sign', '-binary', '-in', join(folder, 'profile.plist'), '-signer', join(folder, 'cert.pem'), '-inkey', join(folder, 'key.pem'), '-outform', 'DER', '-out', join(folder, 'signed.der'), '-nodetach']);
      const encoded = readFileSync(join(folder, 'signed.der')).toString('base64');
      assert.equal(verifyProfile(encoded, BUNDLES[0], true).valid, label === 'valid');
      if (label === 'valid') {
        assert.equal(verifyProfile(encoded, BUNDLES[1], true).valid, false);
        const bytes = Buffer.from(encoded, 'base64'); const textAt = bytes.indexOf(Buffer.from('io.dehub.mobile')); assert.ok(textAt > 0); bytes[textAt] ^= 1;
        assert.equal(verifyProfile(bytes.toString('base64'), BUNDLES[0], true).valid, false);
      }
    }
    assert.equal(verifyProfile('not-base64', BUNDLES[0], true).valid, false);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
