"""Validate signed release profiles without retaining their contents."""
from datetime import datetime, timezone
import base64
import hashlib
import json
import plistlib
import subprocess
import sys

TEAM = 'J8BTYL3PDK'
GROUP = 'group.io.dehub.mobile.screen-capture'
BUNDLES = ('io.dehub.mobile', 'io.dehub.mobile.screen-capture-setup', 'io.dehub.mobile.screen-capture-upload')

def inspect(encoded, bundle, require_group):
    if bundle not in BUNDLES or not isinstance(encoded, str) or len(encoded) > 500_000:
        raise ValueError('invalid_profile_input')
    signed = base64.b64decode(encoded, validate=True)
    result = subprocess.run(['openssl', 'cms', '-verify', '-inform', 'DER', '-noverify'], input=signed, capture_output=True, timeout=15)
    if result.returncode:
        raise ValueError('invalid_profile_signature')
    profile = plistlib.loads(result.stdout)
    entitlements = profile.get('Entitlements', {})
    expires = profile.get('ExpirationDate')
    certificates = profile.get('DeveloperCertificates', [])
    if profile.get('TeamIdentifier') != [TEAM] or entitlements.get('application-identifier') != TEAM + '.' + bundle:
        raise ValueError('profile_owner_mismatch')
    if entitlements.get('get-task-allow') or profile.get('ProvisionedDevices') or profile.get('ProvisionsAllDevices'):
        raise ValueError('not_app_store_profile')
    if not isinstance(expires, datetime) or expires.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
        raise ValueError('profile_expired')
    if require_group and GROUP not in entitlements.get('com.apple.security.application-groups', []):
        raise ValueError('recording_group_missing')
    if len(certificates) != 1 or not isinstance(certificates[0], bytes):
        raise ValueError('profile_certificate_missing_or_ambiguous')
    return {'valid': True, 'certificateSha256': hashlib.sha256(certificates[0]).hexdigest(), 'profileSha256': hashlib.sha256(signed).hexdigest()}

def main():
    try:
        request = json.load(sys.stdin)
        print(json.dumps(inspect(request['encoded'], request['bundle'], request.get('requireGroup', True))))
    except Exception:
        print(json.dumps({'valid': False}))
        raise SystemExit(1) from None

if __name__ == '__main__':
    main()
