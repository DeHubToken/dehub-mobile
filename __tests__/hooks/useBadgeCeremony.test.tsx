import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, waitFor } from '@testing-library/react-native';
import { BADGE_ORDER } from '../../libs/misc';
import { useBadgeCeremony } from '../../hooks/useBadgeCeremony';

const [low, high] = [BADGE_ORDER[2], BADGE_ORDER[3]];
const key = (address: string) => `dehub.badgeCeremonySeen.${address}`;
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('useBadgeCeremony', () => {
  beforeEach(() => AsyncStorage.clear());

  it('marks the tier seen before the showcase opens', async () => {
    const { result } = renderHook(() => useBadgeCeremony({ enabled: true, address: '0xaaa', tier: high }));
    await waitFor(() => expect(result.current.ceremony?.to).toBe(high));
    expect(await AsyncStorage.getItem(key('0xaaa'))).toBe(high);
  });

  it('does not replay when the tier flips down and back up', async () => {
    await AsyncStorage.setItem(key('0xbbb'), high);
    const { result, rerender } = renderHook(
      ({ tier }: { tier: string }) => useBadgeCeremony({ enabled: true, address: '0xbbb', tier }),
      { initialProps: { tier: low } },
    );
    await flush();
    rerender({ tier: high });
    await flush();
    expect(result.current.ceremony).toBeNull();
    expect(await AsyncStorage.getItem(key('0xbbb'))).toBe(high);
  });

  it('plays a tier once per session even if storage is lost', async () => {
    const first = renderHook(() => useBadgeCeremony({ enabled: true, address: '0xccc', tier: high }));
    await waitFor(() => expect(first.result.current.ceremony?.to).toBe(high));
    first.unmount();
    await AsyncStorage.clear();
    const again = renderHook(() => useBadgeCeremony({ enabled: true, address: '0xccc', tier: high }));
    await flush();
    expect(again.result.current.ceremony).toBeNull();
  });
});
