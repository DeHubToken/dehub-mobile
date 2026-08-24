import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockStore = SecureStore as jest.Mocked<typeof SecureStore> & {
  __store: Record<string, string>;
  __clear: () => void;
};

jest.mock('../../config/queryClient', () => ({
  queryClient: { clear: jest.fn() },
}));

import { getProfileAllowance, MAX_PROFILES_CEILING } from "../../libs/profileLimits";
import {
  PROFILES_STORAGE_KEY,
  adoptCurrentProfile,
  stageIncomingIdentity,
  listProfiles,
  getProfile,
  currentProfileId,
  removeProfile,
  snapshotCurrentSession,
  beginProfileSwitch,
  completeProfileSwitch,
  abortProfileSwitch,
  mergeTokensIntoStoredProfile,
} from '../../libs/profiles';
import {
  setAuthToken,
  setRefreshToken,
  setTokenExpiresAt,
  setAuthMethod,
  setStoredSupabaseUserId,
} from '../../libs/auth.utils';

const ADDR_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ADDR_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

async function seedAccountA(): Promise<void> {
  await setAuthToken('tok-a');
  await setRefreshToken('rtok-a');
  await setTokenExpiresAt(Date.now() + 900_000);
  await setAuthMethod('local', ADDR_A);
  await SecureStore.setItemAsync(
    'auth_user',
    JSON.stringify({ displayName: 'Alice', username: 'alice', address: ADDR_A })
  );
  await setStoredSupabaseUserId('uid-a');
}

async function seedAccountB(): Promise<void> {
  // Session teardown only — the profiles registry must survive it, exactly as
  // a real switch never clears @dehub_profiles_v1.
  const keys = await AsyncStorage.getAllKeys();
  const doomed = keys.filter((k) => k !== PROFILES_STORAGE_KEY && !k.startsWith('@local_wallet'));
  if (doomed.length) await AsyncStorage.multiRemove(doomed);
  mockStore.__clear();
  await setAuthToken('tok-b');
  await setRefreshToken('rtok-b');
  await setTokenExpiresAt(Date.now() + 900_000);
  await setAuthMethod('local', ADDR_B);
  await SecureStore.setItemAsync('auth_user', JSON.stringify({ address: ADDR_B }));
}

describe('libs/profiles', () => {
  beforeEach(async () => {
    mockStore.__clear();
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Un-stage any switch the test left behind.
    await abortProfileSwitch(null);
  });

  describe('snapshotCurrentSession', () => {
    it('records an explicitly adopted account with its session keys', async () => {
      await seedAccountA();
      await adoptCurrentProfile();

      const profiles = await listProfiles();
      expect(profiles).toHaveLength(1);
      expect(profiles[0].id).toBe('uid-a');
      expect(profiles[0].address.toLowerCase()).toBe(ADDR_A.toLowerCase());
      expect(profiles[0].name).toBe('Alice');
      expect(profiles[0].username).toBe('alice');
      expect(profiles[0].session?.tokens['auth_token']).toBe('tok-a');
    });

    it('never adds an uninvited account — tracking refreshes, adoption creates', async () => {
      await seedAccountA();
      await snapshotCurrentSession();
      expect(await listProfiles()).toHaveLength(0);

      await setAuthToken('tok-a-rotated');
      await snapshotCurrentSession();
      expect(await listProfiles()).toHaveLength(0);

      // The moment the user says "save this one", it lands — and later
      // tracking keeps its session fresh.
      await adoptCurrentProfile();
      await setAuthToken('tok-a-rotated-again');
      await snapshotCurrentSession();
      const profiles = await listProfiles();
      expect(profiles).toHaveLength(1);
      expect(profiles[0].session?.tokens['auth_token']).toBe('tok-a-rotated-again');
    });

    it('keys wallet-only accounts by address when there is no Supabase uid', async () => {
      await seedAccountB();
      await adoptCurrentProfile();

      expect(await currentProfileId()).toBe(`addr:${ADDR_B.toLowerCase()}`);
      expect((await getProfile(`addr:${ADDR_B.toLowerCase()}`))?.session?.tokens['auth_token']).toBe(
        'tok-b'
      );
    });

    it('ignores a half-established flow with no token', async () => {
      await setAuthMethod('local', ADDR_A);
      await adoptCurrentProfile();
      expect(await listProfiles()).toHaveLength(0);
    });
  });

  describe('switching', () => {
    it('restores the target account and leaves the registry intact', async () => {
      await seedAccountA();
      await adoptCurrentProfile();
      await seedAccountB();
      await adoptCurrentProfile();
      expect(await listProfiles()).toHaveLength(2);

      const plan = await beginProfileSwitch('uid-a');
      expect(plan).not.toBeNull();
      expect(plan!.id).toBe('uid-a');
      expect(plan!.address.toLowerCase()).toBe(ADDR_A.toLowerCase());

      // Target's session keys are on disk…
      expect(await SecureStore.getItemAsync('auth_token')).toBe('tok-a');
      expect(await SecureStore.getItemAsync('auth_supabase_uid')).toBe('uid-a');
      expect(await SecureStore.getItemAsync('auth_method_address')).toBe(ADDR_A);
      // …and the outgoing account's user blob did not survive the swap.
      expect(await SecureStore.getItemAsync('auth_user')).toContain('Alice');

      await completeProfileSwitch('uid-a');
      // Registry still holds both accounts after landing on A.
      expect(await listProfiles()).toHaveLength(2);
    });

    it('returns null for an unknown or session-less profile without touching disk', async () => {
      await seedAccountB();
      await adoptCurrentProfile();

      expect(await beginProfileSwitch('uid-a')).toBeNull();
      expect(await SecureStore.getItemAsync('auth_token')).toBe('tok-b');
    });

    it('abort puts the previous account back on disk', async () => {
      await seedAccountA();
      await adoptCurrentProfile();
      await seedAccountB();
      await adoptCurrentProfile();

      const prevId = await currentProfileId();
      expect(prevId).toBe(`addr:${ADDR_B.toLowerCase()}`);

      await beginProfileSwitch('uid-a');
      expect(await SecureStore.getItemAsync('auth_token')).toBe('tok-a');
      await abortProfileSwitch(prevId!);
      expect(await SecureStore.getItemAsync('auth_token')).toBe('tok-b');
      expect(await SecureStore.getItemAsync('auth_method_address')).toBe(ADDR_B);
    });
  });

  describe('mergeTokensIntoStoredProfile', () => {
    it('files a late rotation into the old stash without touching live keys', async () => {
      await seedAccountA();
      await adoptCurrentProfile();
      await seedAccountB(); // B takes over the live keys

      await mergeTokensIntoStoredProfile(
        { address: ADDR_A, uid: 'uid-a' },
        { auth_refresh_token: 'rt-A-LATE' }
      );

      expect(await SecureStore.getItemAsync('auth_refresh_token')).toBe('rtok-b');
      const a = (await getProfile('uid-a'))!;
      expect(a.session!.tokens['auth_refresh_token']).toBe('rt-A-LATE');
    });
  });

  describe('removal', () => {
    it('forgets one profile and keeps the rest', async () => {
      await seedAccountA();
      await adoptCurrentProfile();
      await seedAccountB();
      await adoptCurrentProfile();

      await removeProfile('uid-a');
      const profiles = await listProfiles();
      expect(profiles).toHaveLength(1);
      expect(profiles[0].id).toBe(`addr:${ADDR_B.toLowerCase()}`);
    });
  });
});

describe("device profile limit", () => {
  // Mobile used to keep a flat 8 and, past that, SILENTLY delete the
  // least-recently-active saved profile — taking its stored session with it.
  // On an app where a lost wallet is a lost account, that is data loss, not a
  // cache eviction. Web prices the same list 2..15 by badge tier and refuses
  // to add rather than making room; these pin the app to that.
  it("gives a device with no badge two slots", () => {
    expect(getProfileAllowance([]).maxProfiles).toBe(2);
    expect(getProfileAllowance([{ badgeBalance: 0 }]).maxProfiles).toBe(2);
    expect(getProfileAllowance([{ badgeBalance: 9999 }]).isBaseline).toBe(true);
  });

  it("adds a slot per badge tier", () => {
    expect(getProfileAllowance([{ badgeBalance: 10_000 }]).maxProfiles).toBe(3); // Crab
    expect(getProfileAllowance([{ badgeBalance: 50_000_000 }]).maxProfiles).toBe(15); // Meglodon
  });

  it("prices the device off the BEST tier saved, not the newest", () => {
    // Switching to a fresh alt must not drop the limit below what is already
    // saved — that would read as the app losing accounts.
    const holders = [{ badgeBalance: 50_000_000 }, { badgeBalance: 0 }];
    expect(getProfileAllowance(holders).maxProfiles).toBe(15);
  });

  it("names the tier that would lift the limit", () => {
    const allowance = getProfileAllowance([{ badgeBalance: 10_000 }]);
    expect(allowance.tierName).toBe("Crab");
    expect(allowance.nextTierName).toBe("Lobster");
    expect(allowance.nextTierProfiles).toBe(4);
  });

  it("has no next tier at the top", () => {
    expect(getProfileAllowance([{ badgeBalance: 50_000_000 }]).nextTierName).toBeNull();
  });

  it("honours the username overrides web applies", () => {
    expect(getProfileAllowance([{ username: "maldoteth" }]).maxProfiles).toBe(15);
    expect(getProfileAllowance([{ username: "@mal" }]).tierName).toBe("Meglodon");
  });

  it("never exceeds the storage ceiling", () => {
    expect(getProfileAllowance([{ badgeBalance: 50_000_000 }]).maxProfiles).toBeLessThanOrEqual(
      MAX_PROFILES_CEILING,
    );
  });
});
