import unittest
from datetime import datetime, timedelta, timezone
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

spec = spec_from_file_location('profiles', Path(__file__).with_name('verify-screen-capture-profiles.py'))
profiles = module_from_spec(spec)
spec.loader.exec_module(profiles)

class RecordingProfileTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 11, tzinfo=timezone.utc)
        self.bundle = profiles.BUNDLES[0]
        self.profile = {'TeamIdentifier': [profiles.TEAM], 'ExpirationDate': self.now + timedelta(days=1), 'Entitlements': {'application-identifier': profiles.TEAM + '.' + self.bundle, 'com.apple.security.application-groups': [profiles.GROUP], 'get-task-allow': False}}

    def test_valid_profiles_for_all_three_targets(self):
        for bundle in profiles.BUNDLES:
            self.profile['Entitlements']['application-identifier'] = profiles.TEAM + '.' + bundle
            self.assertEqual(profiles.profile_findings(self.profile, bundle, self.now), [])

    def test_rejects_original_missing_app_group(self):
        self.profile['Entitlements'].pop('com.apple.security.application-groups')
        self.assertEqual(profiles.profile_findings(self.profile, self.bundle, self.now), ['recording_app_group_missing'])

    def test_rejects_wrong_team_and_bundle(self):
        self.profile['TeamIdentifier'] = ['OTHER']
        self.profile['Entitlements']['application-identifier'] = profiles.TEAM + '.different'
        self.assertEqual(profiles.profile_findings(self.profile, self.bundle, self.now), ['wrong_apple_team', 'wrong_bundle_identifier'])

    def test_rejects_expired_or_development_profiles(self):
        self.profile['ExpirationDate'] = self.now - timedelta(seconds=1)
        self.profile['Entitlements']['get-task-allow'] = True
        self.assertEqual(profiles.profile_findings(self.profile, self.bundle, self.now), ['not_app_store_distribution', 'profile_expired_or_missing_expiration'])

if __name__ == '__main__':
    unittest.main()
