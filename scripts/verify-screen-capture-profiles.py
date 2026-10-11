"""Read managed profiles without changing credentials or starting a build."""
from datetime import datetime, timezone
from pathlib import Path
import base64
import json
import os
import plistlib
import re
import subprocess

TEAM = 'J8BTYL3PDK'
GROUP = 'group.io.dehub.mobile.screen-capture'
BUNDLES = ('io.dehub.mobile', 'io.dehub.mobile.screen-capture-setup', 'io.dehub.mobile.screen-capture-upload')

def profile_findings(profile, bundle, now=None):
    now = now or datetime.now(timezone.utc)
    entitlements = profile.get('Entitlements', {})
    findings = []
    if profile.get('TeamIdentifier') != [TEAM]:
        findings.append('wrong_apple_team')
    if entitlements.get('application-identifier') != TEAM + '.' + bundle:
        findings.append('wrong_bundle_identifier')
    if GROUP not in entitlements.get('com.apple.security.application-groups', []):
        findings.append('recording_app_group_missing')
    if entitlements.get('get-task-allow') or profile.get('ProvisionedDevices') or profile.get('ProvisionsAllDevices'):
        findings.append('not_app_store_distribution')
    expiration = profile.get('ExpirationDate')
    if not isinstance(expiration, datetime) or expiration.replace(tzinfo=timezone.utc) <= now:
        findings.append('profile_expired_or_missing_expiration')
    return findings

def graphql(query, variables):
    token = os.environ.get('EXPO_TOKEN')
    if not token:
        raise RuntimeError('EXPO_TOKEN is required for the managed profile lookup')
    transport = Path(__file__).with_name('lookup-screen-capture-profiles.mjs')
    result = subprocess.run(['node', str(transport)], input=json.dumps({'query': query, 'variables': variables}), capture_output=True, text=True, timeout=40, check=False)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or 'Managed profile lookup failed; no credential response is logged')
    return json.loads(result.stdout)

def main():
    config = json.loads(Path('app.json').read_text())['expo']
    full_name = '@' + config['owner'] + '/' + config['slug']
    query = '''query RecordingSigningProfiles($projectFullName: String!) {
      app { byFullName(fullName: $projectFullName) {
        id
        iosAppCredentials {
          appleAppIdentifier { bundleIdentifier }
          iosAppBuildCredentialsList {
            iosDistributionType
            provisioningProfile { provisioningProfile }
          }
        }
      } }
    }'''
    try:
        app = graphql(query, {'projectFullName': full_name})['app']['byFullName']
        if not app or app['id'] != config['extra']['eas']['projectId']:
            raise RuntimeError('Managed profile lookup returned a different project')
        credentials = app['iosAppCredentials']
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        status = re.search(r'HTTP (\d{3})', str(error))
        failure = 'http_' + status[1] if status else 'lookup_timeout' if isinstance(error, subprocess.TimeoutExpired) else 'lookup_failed'
        report = {'checkedAt': datetime.now(timezone.utc).isoformat(), 'source': os.environ.get('GITHUB_SHA'), 'readOnly': True, 'buildDispatched': False, 'profiles': [], 'lookupSucceeded': False, 'lookupFailure': failure}
        Path('ios-signing-preflight.json').write_text(json.dumps(report, indent=2) + '\n')
        raise SystemExit('Managed profile lookup failed. No profile readiness or signing change is claimed.') from None
    results = []
    for bundle in BUNDLES:
        records = [record for app in credentials if (app.get('appleAppIdentifier') or {}).get('bundleIdentifier') == bundle for record in app['iosAppBuildCredentialsList'] if record['iosDistributionType'] == 'APP_STORE' and record.get('provisioningProfile')]
        findings = []
        if len(records) != 1:
            findings.append('managed_app_store_profile_missing_or_ambiguous')
        else:
            encoded = records[0]['provisioningProfile']['provisioningProfile']
            try:
                signed = base64.b64decode(encoded, validate=True)
                parsed = subprocess.run(['openssl', 'cms', '-verify', '-inform', 'DER', '-noverify'], input=signed, capture_output=True, check=False)
                if parsed.returncode:
                    raise ValueError('Invalid profile signature')
                findings = profile_findings(plistlib.loads(parsed.stdout), bundle)
            except (ValueError, plistlib.InvalidFileException):
                findings = ['managed_profile_could_not_be_decoded']
        results.append({'bundleIdentifier': bundle, 'valid': not findings, 'findings': findings})
    report = {'checkedAt': datetime.now(timezone.utc).isoformat(), 'source': os.environ.get('GITHUB_SHA'), 'readOnly': True, 'buildDispatched': False, 'lookupSucceeded': True, 'profiles': results}
    Path('ios-signing-preflight.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))
    if any(not result['valid'] for result in results):
        raise SystemExit('Recording signing profiles are incomplete. Repair these profiles before another signed build.')

if __name__ == '__main__':
    main()
