import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MAX_DISMISSED,
  addDismissedIds,
  clearDismissedIds,
  getDismissedIds,
  mergeDismissed,
} from '../../libs/notifications.dismissed';

const ADDRESS = '0xAbCdEf0000000000000000000000000000000001';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('mergeDismissed', () => {
  it('puts the newly cleared ids first', () => {
    expect(mergeDismissed(['a', 'b'], ['c'])).toEqual(['c', 'a', 'b']);
  });

  it('does not store an id twice', () => {
    expect(mergeDismissed(['a', 'b'], ['b'])).toEqual(['b', 'a']);
  });

  it('drops empty ids', () => {
    expect(mergeDismissed(['a'], ['', 'b'])).toEqual(['b', 'a']);
  });

  it('caps the list, keeping the newest', () => {
    const existing = Array.from({ length: 5 }, (_, i) => `old-${i}`);
    expect(mergeDismissed(existing, ['new'], 3)).toEqual(['new', 'old-0', 'old-1']);
  });

  it('defaults the cap to MAX_DISMISSED', () => {
    const existing = Array.from({ length: MAX_DISMISSED + 10 }, (_, i) => `old-${i}`);
    expect(mergeDismissed(existing, ['new'])).toHaveLength(MAX_DISMISSED);
  });
});

describe('storage', () => {
  it('returns nothing for a signed-out user', async () => {
    await expect(getDismissedIds(null)).resolves.toEqual([]);
    await expect(addDismissedIds(null, ['a'])).resolves.toEqual([]);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('round-trips ids for an address', async () => {
    await addDismissedIds(ADDRESS, ['n1']);
    await addDismissedIds(ADDRESS, ['n2']);
    await expect(getDismissedIds(ADDRESS)).resolves.toEqual(['n2', 'n1']);
  });

  it('keys by lowercased address, so casing cannot split the set', async () => {
    await addDismissedIds(ADDRESS, ['n1']);
    await expect(getDismissedIds(ADDRESS.toLowerCase())).resolves.toEqual(['n1']);
  });

  it('keeps accounts apart', async () => {
    await addDismissedIds(ADDRESS, ['n1']);
    await expect(getDismissedIds('0x00000000000000000000000000000000000000ff')).resolves.toEqual([]);
  });

  it('survives a corrupt entry', async () => {
    await AsyncStorage.setItem(`notif-dismissed:${ADDRESS.toLowerCase()}`, '{not json');
    await expect(getDismissedIds(ADDRESS)).resolves.toEqual([]);
  });

  it('ignores non-string entries', async () => {
    await AsyncStorage.setItem(`notif-dismissed:${ADDRESS.toLowerCase()}`, '["n1", 7, null]');
    await expect(getDismissedIds(ADDRESS)).resolves.toEqual(['n1']);
  });

  it('clears the set', async () => {
    await addDismissedIds(ADDRESS, ['n1']);
    await clearDismissedIds(ADDRESS);
    await expect(getDismissedIds(ADDRESS)).resolves.toEqual([]);
  });
});
