import { renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigationPersistence } from '../../hooks/useNavigationPersistence';

jest.mock('../../libs/logger', () => ({ createLogger: () => ({ error: jest.fn() }) }));

describe('cold launch navigation', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([true, false])('ignores a saved Prompt stack when authenticated=%s', async (authenticated) => {
    await AsyncStorage.setItem('@dhb_navigation_state', JSON.stringify({
      version: 1, timestamp: Date.now(), state: { index: 0, routes: [{ name: 'Prompt' }] },
    }));
    const { result } = renderHook(() => useNavigationPersistence(authenticated));
    expect(result.current.isReady).toBe(true);
    expect(result.current.initialState).toBeUndefined();
    await waitFor(() => expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@dhb_navigation_state'));
    expect(await AsyncStorage.getItem('@dhb_navigation_state')).toBeNull();
  });

  it('does not save a new stack or block startup when storage fails', async () => {
    jest.mocked(AsyncStorage.removeItem).mockRejectedValueOnce(new Error('storage unavailable'));
    const { result } = renderHook(() => useNavigationPersistence(true));
    result.current.onStateChange({ routes: [{ name: 'Prompt' }], index: 0 } as any);
    expect(result.current.isReady).toBe(true);
    expect(result.current.initialState).toBeUndefined();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    await waitFor(() => expect(AsyncStorage.removeItem).toHaveBeenCalled());
  });
});
