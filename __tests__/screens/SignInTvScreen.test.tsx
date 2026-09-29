import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity',
  ActivityIndicator: 'ActivityIndicator', ScrollView: 'ScrollView',
  Keyboard: { dismiss: jest.fn() },
  StyleSheet: { create: (s: unknown) => s, flatten: (s: unknown) => s },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../components/ScreenHeader', () => 'ScreenHeader');
jest.mock('../../components/ui/Icon', () => 'Icon');
jest.mock('../../components/ui/GlassIndicator', () => ({ __esModule: true, default: 'GlassIndicator', GLASS_SHADOW: {} }));
jest.mock('../../libs', () => ({ apiClient: { get: jest.fn(), post: jest.fn() }, toastError: jest.fn(), toastSuccess: jest.fn() }));
jest.mock('../../libs/logger', () => ({ createLogger: () => ({ warn: jest.fn() }) }));

const mockLookup = jest.fn();
jest.mock('../../services/tvPairing.service', () => ({
  ...jest.requireActual('../../services/tvPairing.service'),
  lookupPairing: (code: string) => mockLookup(code),
  resolvePairing: jest.fn(),
}));

import SignInTvScreen from '../../screens/SignInTvScreen';

beforeEach(() => mockLookup.mockReset());

// Offline, a good code used to read "no television is waiting on that code",
// and the only way to try again was to retype it.
it('offers a retry when the lookup fails, and names the device once it succeeds', async () => {
  mockLookup.mockResolvedValueOnce('error').mockResolvedValueOnce({ deviceName: 'Living room TV', expiresAt: '' });
  const view = render(<SignInTvScreen />);
  fireEvent.changeText(view.UNSAFE_getByType('TextInput' as any), 'ABCD1234');

  await waitFor(() => expect(view.getByText('common.retry')).toBeTruthy());
  expect(view.getByText('common.somethingWentWrong')).toBeTruthy();
  expect(view.queryByText('tv.pairNotFound')).toBeNull();

  await act(async () => { fireEvent.press(view.getByText('common.retry')); });
  await waitFor(() => expect(view.getByText('Living room TV')).toBeTruthy());
  expect(mockLookup).toHaveBeenCalledTimes(2);
  expect(mockLookup).toHaveBeenLastCalledWith('ABCD-1234');
});

it('still says not found for a wrong code, with no retry', async () => {
  mockLookup.mockResolvedValue(null);
  const view = render(<SignInTvScreen />);
  fireEvent.changeText(view.UNSAFE_getByType('TextInput' as any), 'ABCD1234');

  await waitFor(() => expect(view.getByText('tv.pairNotFound')).toBeTruthy());
  expect(view.queryByText('common.retry')).toBeNull();
});

it('clears the error as soon as the code is edited', async () => {
  mockLookup.mockResolvedValue('error');
  const view = render(<SignInTvScreen />);
  const input = view.UNSAFE_getByType('TextInput' as any);
  fireEvent.changeText(input, 'ABCD1234');
  await waitFor(() => expect(view.getByText('common.retry')).toBeTruthy());

  fireEvent.changeText(input, 'ABCD123');
  expect(view.queryByText('common.retry')).toBeNull();
  expect(view.queryByText('common.somethingWentWrong')).toBeNull();
});
