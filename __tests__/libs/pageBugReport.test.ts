jest.mock('expo-device', () => ({ brand: 'Google', manufacturer: 'Google', modelName: 'Pixel 9', modelId: null, osName: 'Android', osVersion: '16' }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '2.0.0' } } }));
jest.mock('expo-updates', () => ({ updateId: 'release-update' }));
import { bugScreenLabel, pageBugContext, describePageBug } from '../../libs/pageBugReport';

it('identifies a public post without copying private navigation data', () => {
  expect(bugScreenLabel({ name: 'PostInfo', params: { tokenId: '123', draft: 'private', token: 'secret' } })).toBe('PostInfo (tokenId=123)');
  expect(bugScreenLabel({ name: 'Chat', params: { username: 'private' } })).toBe('Chat');
  expect(bugScreenLabel()).toBe('App');
});
it('attaches model, OS and release to the user message', () => {
  const report = describePageBug('  No sound  ', pageBugContext('PostInfo (tokenId=123)'));
  expect(report).toContain('No sound\n\nScreen: PostInfo (tokenId=123)');
  expect(report).toContain('Model: Pixel 9'); expect(report).toContain('OS: Android 16');
  expect(report).toContain('App: 2.0.0'); expect(report).toContain('Update: release-update');
});
