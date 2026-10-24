import { Platform } from 'react-native';
import { setNavigationBarDarkIcons } from '../../modules/system-bars';

const mockSetIcons = jest.fn(async (_darkIcons: boolean) => true);
let mockNative: { setNavigationBarDarkIcons?: typeof mockSetIcons } | null;
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: () => mockNative }));

beforeEach(() => {
  (Platform as { OS: string }).OS = 'android';
  mockNative = { setNavigationBarDarkIcons: mockSetIcons };
  mockSetIcons.mockClear();
});

it('applies dark icons for light pages and restores light icons for dark pages', async () => {
  expect(await setNavigationBarDarkIcons(true)).toBe(true);
  expect(await setNavigationBarDarkIcons(false)).toBe(true);
  expect(mockSetIcons.mock.calls.map(call => call[0])).toEqual([true, false]);
});

it('keeps older APKs working when the optional native module is absent', async () => {
  mockNative = null;
  expect(await setNavigationBarDarkIcons(true)).toBe(false);
  mockNative = {};
  expect(await setNavigationBarDarkIcons(true)).toBe(false);
});

it('ignores other platforms and handles an unavailable activity', async () => {
  (Platform as { OS: string }).OS = 'ios';
  expect(await setNavigationBarDarkIcons(true)).toBe(false);
  expect(mockSetIcons).not.toHaveBeenCalled();
  (Platform as { OS: string }).OS = 'android';
  mockSetIcons.mockRejectedValueOnce(new Error('Activity unavailable'));
  expect(await setNavigationBarDarkIcons(true)).toBe(false);
});
