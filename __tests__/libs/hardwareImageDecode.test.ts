const mockSet = jest.fn();
let mockNative: any = { setHardwareBitmapsEnabled: mockSet };
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: () => mockNative }));
jest.mock('../../libs/device', () => ({ getDeviceId: async () => 'device-abc' }));

import { applyHardwareImageDecode, rolloutBucket, HARDWARE_IMAGE_ROLLOUT_PERCENT } from '../../libs/hardwareImageDecode';

beforeEach(() => { mockSet.mockClear(); mockNative = { setHardwareBitmapsEnabled: mockSet }; });

it('ships switched off', () => {
  expect(HARDWARE_IMAGE_ROLLOUT_PERCENT).toBe(0);
});

it('does nothing at 0%', async () => {
  expect(await applyHardwareImageDecode(0)).toBe(false);
  expect(mockSet).not.toHaveBeenCalled();
});

it('turns on for everyone at 100%', async () => {
  expect(await applyHardwareImageDecode(100)).toBe(true);
  expect(mockSet).toHaveBeenCalledWith(true);
});

it('follows the stable per-install bucket in between', async () => {
  const bucket = rolloutBucket('device-abc');
  expect(bucket).toBe(rolloutBucket('device-abc'));
  expect(await applyHardwareImageDecode(bucket + 1)).toBe(true);
  expect(await applyHardwareImageDecode(bucket)).toBe(false);
  expect(mockSet).toHaveBeenLastCalledWith(false);
});

it('is a no-op on installs built before the native switch existed', async () => {
  mockNative = {};
  expect(await applyHardwareImageDecode(100)).toBe(false);
  mockNative = null;
  expect(await applyHardwareImageDecode(100)).toBe(false);
});
