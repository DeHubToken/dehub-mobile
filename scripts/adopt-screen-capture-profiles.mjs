import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEAM, BUNDLES, PROJECT } from './inspect-screen-capture-signing-portal.mjs';

const projectQuery = `query RecordingProfileAdoption($fullName: String!) {
  app { byFullName(fullName: $fullName) {
    id ownerAccount { id name }
    iosAppCredentials {
      id appleAppIdentifier { id bundleIdentifier }
      iosAppBuildCredentialsList {
        id iosDistributionType
        distributionCertificate { id developerPortalIdentifier appleTeam { id appleTeamIdentifier } }
        provisioningProfile { id developerPortalIdentifier provisioningProfile }
      }
      appStoreConnectApiKeyForSubmissions { id issuerIdentifier keyIdentifier appleTeam { appleTeamIdentifier } }
    }
  } }
}`;
const keyQuery = `query RecordingProfileAdoptionKey($id: ID!) {
  appStoreConnectApiKey { byId(id: $id) { id issuerIdentifier keyIdentifier keyP8 } }
}`;
const identifierQuery = `query RecordingProfileIdentifier($accountName: String!, $bundleIdentifier: String!) {
  account { byName(accountName: $accountName) { id appleAppIdentifiers(bundleIdentifier: $bundleIdentifier) { id bundleIdentifier } } }
}`;
const createIdentifier = `mutation RecordingProfileIdentifierCreate($input: AppleAppIdentifierInput!, $accountId: ID!) {
  appleAppIdentifier { createAppleAppIdentifier(appleAppIdentifierInput: $input, accountId: $accountId) { id bundleIdentifier } }
}`;
const createCredentials = `mutation RecordingTargetCredentialsCreate($input: IosAppCredentialsInput!, $appId: ID!, $identifierId: ID!) {
  iosAppCredentials { createIosAppCredentials(iosAppCredentialsInput: $input, appId: $appId, appleAppIdentifierId: $identifierId) { id } }
}`;
const createProfile = `mutation RecordingManagedProfileCreate($input: AppleProvisioningProfileInput!, $accountId: ID!, $identifierId: ID!) {
  appleProvisioningProfile { createAppleProvisioningProfile(appleProvisioningProfileInput: $input, accountId: $accountId, appleAppIdentifierId: $identifierId) { id } }
}`;
const updateProfile = `mutation RecordingManagedProfileUpdate($id: ID!, $input: AppleProvisioningProfileInput!) {
  appleProvisioningProfile { updateAppleProvisioningProfile(id: $id, appleProvisioningProfileInput: $input) { id } }
}`;
const createBuild = `mutation RecordingBuildCredentialsCreate($input: IosAppBuildCredentialsInput!, $credentialsId: ID!) {
  iosAppBuildCredentials { createIosAppBuildCredentials(iosAppBuildCredentialsInput: $input, iosAppCredentialsId: $credentialsId) { id } }
}`;
const setProfile = `mutation RecordingBuildProfileSet($id: ID!, $profileId: ID!) {
  iosAppBuildCredentials { setProvisioningProfile(id: $id, provisioningProfileId: $profileId) { id } }
}`;

function requireValue(condition, code) { if (!condition) { const error = new Error(code); error.adoptionCode = code; throw error; } }
export function validateProfileIds(ids) {
  requireValue(Array.isArray(ids) && ids.length === 3 && ids.every(id => typeof id === 'string' && /^[A-Z0-9]{10}$/.test(id)) && new Set(ids).size === 3, 'invalid_profile_ids');
}
export function verifyProfile(encoded, bundle, requireGroup = true) {
  const script = fileURLToPath(new URL('./validate-screen-capture-profile-adoption.py', import.meta.url));
  const result = spawnSync('python3', [script], { input: JSON.stringify({ encoded, bundle, requireGroup }), encoding: 'utf8', timeout: 20_000, maxBuffer: 2000 });
  if (result.status !== 0) return { valid: false };
  try { return JSON.parse(result.stdout); } catch { return { valid: false }; }
}
function metadata(app) {
  requireValue(app?.id === PROJECT && app.ownerAccount?.name === 'dehubapp' && app.ownerAccount.id, 'wrong_expo_project');
  const records = BUNDLES.map(bundle => (app.iosAppCredentials ?? []).filter(record => record.appleAppIdentifier?.bundleIdentifier === bundle));
  requireValue(records.every(items => items.length <= 1) && records[0].length === 1, 'managed_credentials_ambiguous');
  const targets = records.map(items => {
    const credential = items[0] ?? null;
    const builds = (credential?.iosAppBuildCredentialsList ?? []).filter(build => build.iosDistributionType === 'APP_STORE');
    requireValue(builds.length <= 1, 'managed_build_credentials_ambiguous');
    return { credential, build: builds[0] ?? null };
  });
  const main = targets[0];
  const cert = main.build?.distributionCertificate;
  const key = main.credential.appStoreConnectApiKeyForSubmissions;
  requireValue(cert?.id && cert.developerPortalIdentifier && cert.appleTeam?.id && cert.appleTeam.appleTeamIdentifier === TEAM && main.build?.provisioningProfile?.id && main.build.provisioningProfile.provisioningProfile, 'managed_certificate_or_profile_missing');
  requireValue(key?.id && key.issuerIdentifier && key.keyIdentifier && (!key.appleTeam?.appleTeamIdentifier || key.appleTeam.appleTeamIdentifier === TEAM), 'managed_submission_key_invalid');
  requireValue(targets.every(target => !target.build || target.build.distributionCertificate?.id === cert.id), 'existing_target_certificate_mismatch');
  return { app, targets, cert, key };
}

export async function adoptProfiles({ graphql, apple, ids, mode = 'inspect', verify = verifyProfile, report }) {
  validateProfileIds(ids);
  requireValue(mode === 'inspect' || mode === 'adopt', 'invalid_mode');
  const state = metadata((await graphql(projectQuery, { fullName: '@dehubapp/dehubmobile' })).app?.byFullName);
  const old = verify(state.targets[0].build.provisioningProfile.provisioningProfile, BUNDLES[0], false);
  requireValue(old?.valid && old.certificateSha256, 'managed_profile_ownership_unverified');
  const key = (await graphql(keyQuery, { id: state.key.id })).appStoreConnectApiKey?.byId;
  requireValue(key?.keyP8 && key.id === state.key.id && key.issuerIdentifier === state.key.issuerIdentifier && key.keyIdentifier === state.key.keyIdentifier, 'managed_submission_key_mismatch');
  const token = await apple.Token.sign({ key: key.keyP8, issuerId: key.issuerIdentifier, keyId: key.keyIdentifier, duration: 300 });
  const context = { token, teamId: TEAM };
  const plans = [];
  for (let index = 0; index < BUNDLES.length; index++) {
    const bundle = BUNDLES[index], id = ids[index];
    const profile = await apple.Profile.infoAsync(context, { id });
    requireValue(profile?.id === id && profile.attributes?.profileState === 'ACTIVE' && profile.attributes.profileType === 'IOS_APP_STORE', 'portal_profile_invalid');
    const identifier = await profile.getBundleIdAsync();
    const certs = await profile.getCertificatesAsync();
    requireValue(identifier?.attributes?.identifier === bundle && (!identifier.attributes.seedId || identifier.attributes.seedId === TEAM), 'portal_profile_bundle_mismatch');
    requireValue(certs.length === 1 && certs[0].id === state.cert.developerPortalIdentifier, 'portal_certificate_mismatch');
    const encoded = profile.attributes.profileContent;
    const checked = verify(encoded, bundle, true);
    requireValue(checked?.valid && checked.certificateSha256 === old.certificateSha256, 'signed_profile_or_certificate_mismatch');
    const account = (await graphql(identifierQuery, { accountName: 'dehubapp', bundleIdentifier: bundle })).account?.byName;
    requireValue(account?.id === state.app.ownerAccount.id && account.appleAppIdentifiers?.length <= 1, 'managed_identifier_ambiguous');
    const managedIdentifier = account.appleAppIdentifiers[0] ?? null;
    requireValue(!managedIdentifier || managedIdentifier.bundleIdentifier === bundle, 'managed_identifier_mismatch');
    requireValue(!state.targets[index].credential || state.targets[index].credential.appleAppIdentifier.id === managedIdentifier?.id, 'managed_identifier_mismatch');
    plans.push({ bundle, id, encoded, checked, managedIdentifier, ...state.targets[index] });
  }
  report.profiles = plans.map(plan => ({ bundleIdentifier: plan.bundle, portalProfileId: plan.id, signedProfileValid: true, existingCertificateMatched: true, profileSha256: plan.checked.profileSha256, updated: false }));
  report.allProfilesValidated = true;
  if (mode === 'inspect') return report;
  report.credentialMutationRequested = true;
  for (let index = 0; index < plans.length; index++) {
    const plan = plans[index];
    let identifierId = plan.managedIdentifier?.id;
    if (!identifierId) {
      const result = await graphql(createIdentifier, { input: { bundleIdentifier: plan.bundle, appleTeamId: state.cert.appleTeam.id, parentAppleAppId: state.targets[0].credential.appleAppIdentifier.id }, accountId: state.app.ownerAccount.id });
      const created = result.appleAppIdentifier?.createAppleAppIdentifier;
      requireValue(created?.id && created.bundleIdentifier === plan.bundle, 'managed_identifier_create_failed');
      identifierId = created.id;
    }
    let credentialsId = plan.credential?.id;
    if (!credentialsId) {
      const result = await graphql(createCredentials, { input: { appleTeamId: state.cert.appleTeam.id }, appId: PROJECT, identifierId });
      credentialsId = result.iosAppCredentials?.createIosAppCredentials?.id;
      requireValue(credentialsId, 'managed_credentials_create_failed');
    }
    const input = { appleProvisioningProfile: plan.encoded, developerPortalIdentifier: plan.id };
    let profileId = plan.build?.provisioningProfile?.id;
    if (profileId) {
      const result = await graphql(updateProfile, { id: profileId, input });
      requireValue(result.appleProvisioningProfile?.updateAppleProvisioningProfile?.id === profileId, 'managed_profile_update_failed');
    } else {
      const result = await graphql(createProfile, { input, accountId: state.app.ownerAccount.id, identifierId });
      profileId = result.appleProvisioningProfile?.createAppleProvisioningProfile?.id;
      requireValue(profileId, 'managed_profile_create_failed');
    }
    if (!plan.build) {
      const result = await graphql(createBuild, { input: { iosDistributionType: 'APP_STORE', distributionCertificateId: state.cert.id, provisioningProfileId: profileId }, credentialsId });
      requireValue(result.iosAppBuildCredentials?.createIosAppBuildCredentials?.id, 'managed_build_create_failed');
    } else {
      const result = await graphql(setProfile, { id: plan.build.id, profileId });
      requireValue(result.iosAppBuildCredentials?.setProvisioningProfile?.id === plan.build.id, 'managed_profile_link_failed');
    }
    report.profiles[index].updated = true;
  }
  const saved = metadata((await graphql(projectQuery, { fullName: '@dehubapp/dehubmobile' })).app?.byFullName);
  report.managedProfilesVerified = saved.targets.every((target, index) => {
    const profile = target.build?.provisioningProfile;
    if (target.build?.distributionCertificate?.id !== state.cert.id || profile?.developerPortalIdentifier !== plans[index].id) return false;
    const checked = verify(profile?.provisioningProfile, BUNDLES[index], true);
    return checked?.valid && checked.certificateSha256 === old.certificateSha256 && checked.profileSha256 === plans[index].checked.profileSha256;
  });
  requireValue(report.managedProfilesVerified, 'managed_profile_readback_mismatch');
  return report;
}

function graphql(query, variables) {
  const transport = fileURLToPath(new URL('./lookup-screen-capture-profiles.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [transport], { input: JSON.stringify({ query, variables }), encoding: 'utf8', timeout: 40_000, maxBuffer: 2_000_000 });
  requireValue(result.status === 0 && !result.error, 'managed_transport_failed');
  return JSON.parse(result.stdout);
}
async function main() {
  const report = { checkedAt: new Date().toISOString(), source: process.env.GITHUB_SHA ?? null, mode: process.env.RECORDING_PROFILE_MODE ?? 'inspect', allProfilesValidated: false, managedProfilesVerified: false, credentialMutationRequested: false, buildDispatched: false, newKeyCreated: false, newCertificateCreated: false, profiles: [], findings: [] };
  try {
    const config = JSON.parse(readFileSync('app.json', 'utf8')).expo;
    requireValue(config.owner === 'dehubapp' && config.slug === 'dehubmobile' && config.extra?.eas?.projectId === PROJECT, 'wrong_local_project');
    requireValue(process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' && process.env.GITHUB_REF === 'refs/heads/main' && process.env.RECORDING_SIGNING_TOOLS, 'not_main_dispatch');
    const require = createRequire(import.meta.url);
    const apple = require(resolve(process.env.RECORDING_SIGNING_TOOLS, 'node_modules/@expo/apple-utils'));
    await adoptProfiles({ graphql, apple, ids: [process.env.RECORDING_MAIN_PROFILE, process.env.RECORDING_SETUP_PROFILE, process.env.RECORDING_UPLOAD_PROFILE], mode: report.mode, report });
  } catch (error) {
    report.findings.push(error?.adoptionCode ?? 'profile_adoption_failed');
    process.exitCode = 1;
  }
  writeFileSync('ios-profile-adoption.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
