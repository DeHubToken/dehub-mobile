import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEAM = 'J8BTYL3PDK';
export const GROUP = 'group.io.dehub.mobile.screen-capture';
export const PROJECT = '734211bf-5261-4dce-9e61-2bfc51c339b9';
export const BUNDLES = ['io.dehub.mobile', 'io.dehub.mobile.screen-capture-setup', 'io.dehub.mobile.screen-capture-upload'];

const metadataQuery = `query RecordingSigningKeyMetadata($projectFullName: String!) {
  app { byFullName(fullName: $projectFullName) {
    id
    iosAppCredentials {
      appleAppIdentifier { bundleIdentifier }
      appStoreConnectApiKeyForSubmissions {
        id issuerIdentifier keyIdentifier
        appleTeam { appleTeamIdentifier }
      }
    }
  } }
}`;
const keyQuery = `query ExistingRecordingSigningKey($ascApiKeyId: ID!) {
  appStoreConnectApiKey { byId(id: $ascApiKeyId) {
    id issuerIdentifier keyIdentifier keyP8
  } }
}`;
const inventoryFailures = new Set([
  'wrong_expo_project', 'managed_submission_key_missing_or_ambiguous',
  'managed_key_team_not_confirmed', 'managed_key_is_not_a_team_key',
  'managed_key_metadata_incomplete', 'managed_key_does_not_match_metadata',
  'managed_credentials_lookup_failed', 'wrong_local_project', 'signing_tools_missing',
]);

function issue(code) {
  const error = new Error(code);
  error.inventoryCode = code;
  return error;
}

function safeFailure(error, fallback) {
  if (inventoryFailures.has(error.inventoryCode)) return error.inventoryCode;
  const status = error.status ?? error.response?.status;
  return Number.isInteger(status) && status >= 400 && status <= 599 ? `${fallback}_http_${status}` : fallback;
}

export async function inspectSigningPortal({ graphql, apple, source = null }) {
  const report = {
    checkedAt: new Date().toISOString(), source, readOnly: true,
    credentialMutationRequested: false, buildDispatched: false,
    managedTeamKeyAvailable: false, portalBundleLookupSucceeded: false,
    recordingGroupLookupSucceeded: false, recordingGroupRegistered: null,
    releaseReady: false, profiles: [], findings: [],
  };
  try {
    const app = (await graphql(metadataQuery, { projectFullName: '@dehubapp/dehubmobile' })).app?.byFullName;
    if (app?.id !== PROJECT) throw issue('wrong_expo_project');
    const records = (app.iosAppCredentials ?? []).filter(record => record.appleAppIdentifier?.bundleIdentifier === BUNDLES[0]);
    const keys = new Map(records.filter(record => record.appStoreConnectApiKeyForSubmissions).map(record => {
      const key = record.appStoreConnectApiKeyForSubmissions;
      return [key.id, key];
    }));
    if (keys.size !== 1) throw issue('managed_submission_key_missing_or_ambiguous');
    const metadata = [...keys.values()][0];
    if (!metadata.id || !metadata.keyIdentifier) throw issue('managed_key_metadata_incomplete');
    if (metadata.appleTeam?.appleTeamIdentifier !== TEAM) throw issue('managed_key_team_not_confirmed');
    if (!metadata.issuerIdentifier) throw issue('managed_key_is_not_a_team_key');
    const key = (await graphql(keyQuery, { ascApiKeyId: metadata.id })).appStoreConnectApiKey?.byId;
    if (!key?.keyP8 || key.id !== metadata.id || key.keyIdentifier !== metadata.keyIdentifier || key.issuerIdentifier !== metadata.issuerIdentifier) {
      throw issue('managed_key_does_not_match_metadata');
    }
    const token = await apple.Token.sign({ key: key.keyP8, issuerId: key.issuerIdentifier, keyId: key.keyIdentifier, duration: 300 });
    const context = { token, teamId: TEAM };
    report.managedTeamKeyAvailable = true;
    for (const bundleIdentifier of BUNDLES) {
      const bundle = await apple.BundleId.findAsync(context, { identifier: bundleIdentifier });
      if (!bundle) {
        report.profiles.push({ bundleIdentifier, registered: false, recordingGroupCapabilityEnabled: false, activeAppStoreProfiles: 0 });
        continue;
      }
      const capabilities = await bundle.getBundleIdCapabilitiesAsync();
      const enabled = capabilities.some(capability => capability.isType(apple.CapabilityType.APP_GROUP) && capability.attributes.enabled !== false);
      const profiles = await bundle.getProfilesAsync({ query: { filter: { profileType: apple.ProfileType.IOS_APP_STORE } } });
      report.profiles.push({
        bundleIdentifier, registered: true, recordingGroupCapabilityEnabled: enabled,
        activeAppStoreProfiles: profiles.filter(profile => profile.attributes.profileType === apple.ProfileType.IOS_APP_STORE && profile.attributes.profileState === 'ACTIVE').length,
      });
    }
    report.portalBundleLookupSucceeded = true;
    try {
      const groups = await apple.AppGroup.getAsync(context, { query: { filter: { identifier: GROUP } } });
      report.recordingGroupRegistered = groups.some(group => group.attributes.identifier === GROUP);
      report.recordingGroupLookupSucceeded = true;
    } catch (error) {
      report.findings.push(safeFailure(error, 'recording_group_lookup_failed'));
    }
  } catch (error) {
    report.findings.push(safeFailure(error, 'signing_portal_lookup_failed'));
  }
  return report;
}

function graphql(query, variables) {
  const transport = fileURLToPath(new URL('./lookup-screen-capture-profiles.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [transport], {
    input: JSON.stringify({ query, variables }), encoding: 'utf8', timeout: 40_000, maxBuffer: 2_000_000,
  });
  if (result.status !== 0 || result.error) throw issue('managed_credentials_lookup_failed');
  return JSON.parse(result.stdout);
}

async function main() {
  let report;
  try {
    const config = JSON.parse(readFileSync('app.json', 'utf8')).expo;
    if (config.owner !== 'dehubapp' || config.slug !== 'dehubmobile' || config.extra?.eas?.projectId !== PROJECT) throw issue('wrong_local_project');
    const tools = process.env.RECORDING_SIGNING_TOOLS;
    if (!tools) throw issue('signing_tools_missing');
    const require = createRequire(import.meta.url);
    const apple = require(resolve(tools, 'node_modules/@expo/apple-utils'));
    report = await inspectSigningPortal({ graphql, apple, source: process.env.GITHUB_SHA ?? null });
  } catch (error) {
    report = { source: process.env.GITHUB_SHA ?? null, readOnly: true, credentialMutationRequested: false, buildDispatched: false, releaseReady: false, findings: [safeFailure(error, 'signing_inventory_failed')] };
  }
  writeFileSync('ios-signing-portal-inventory.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
  if (!report.portalBundleLookupSucceeded || !report.recordingGroupLookupSucceeded) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
