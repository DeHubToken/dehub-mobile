jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-image-picker', () => ({ getMediaLibraryPermissionsAsync: jest.fn(), requestMediaLibraryPermissionsAsync: jest.fn() }));
jest.mock('expo-camera', () => ({ Camera: {} }));
jest.mock('expo-audio', () => ({ getRecordingPermissionsAsync: jest.fn(), requestRecordingPermissionsAsync: jest.fn() }));
jest.mock('expo-linking', () => ({}));
jest.mock('../../components/ui/PermissionModal', () => ({ PermissionModal: { showRationale: jest.fn(), showSettings: jest.fn() } }));
import * as ImagePicker from 'expo-image-picker';
import { PermissionModal } from '../../components/ui/PermissionModal';
import { runWithPermissions } from '../../libs/permissions.util';

beforeEach(() => {
  jest.clearAllMocks();
  (ImagePicker.getMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: true });
});
it('opens the iOS photo permission request directly and proceeds after approval', async () => {
  (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true, canAskAgain: true, status: 'granted' });
  const action = jest.fn();
  expect(await runWithPermissions(['photos'], action)).toBe(true);
  expect(PermissionModal.showRationale).not.toHaveBeenCalled();
  expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(action).toHaveBeenCalledTimes(1);
});
it('respects denial without another custom prompt or running the picker', async () => {
  (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: false, status: 'denied' });
  const action = jest.fn();
  expect(await runWithPermissions(['photos'], action)).toBe(false);
  expect(PermissionModal.showRationale).not.toHaveBeenCalled();
  expect(action).not.toHaveBeenCalled();
});
it('offers settings only after the system permission is permanently denied', async () => {
  (ImagePicker.getMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: false });
  await runWithPermissions(['photos'], jest.fn());
  expect(PermissionModal.showSettings).toHaveBeenCalledTimes(1);
  expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
});
