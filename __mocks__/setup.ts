// Global test setup — mock native modules not available in Jest

jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (obj: any) => obj.ios ?? obj.default },
  Share: { share: jest.fn().mockResolvedValue({ action: 'sharedAction' }) },
  ToastAndroid: { show: jest.fn() },
  UIManager: { setLayoutAnimationEnabledExperimental: jest.fn() },
  Dimensions: {
    get: jest.fn().mockReturnValue({ width: 390, height: 844 }),
    addEventListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  NativeModules: {},
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  })),
  AppState: { currentState: 'active', addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  Alert: { alert: jest.fn() },
  Linking: { openURL: jest.fn(), addEventListener: jest.fn(() => ({ remove: jest.fn() })), getInitialURL: jest.fn().mockResolvedValue(null) },
  PixelRatio: { get: jest.fn().mockReturnValue(2), roundToNearestPixel: (v: number) => v },
  Appearance: { getColorScheme: jest.fn().mockReturnValue('dark') },
  Image: { getSize: jest.fn(), prefetch: jest.fn() },
}));

jest.mock('expo-secure-store', () => {
  const store: Record<string, string> = {};
  return {
    getItemAsync: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
      delete store[key];
      return Promise.resolve();
    }),
    __store: store,
    __clear: () => Object.keys(store).forEach((k) => delete store[k]),
  };
});

// AsyncStorage's real module reaches for NativeModules.RNCAsyncStorage, which
// the react-native mock above does not provide. libs/storage pulls it in for
// its one-time MMKV migration, so anything importing libs/* now needs this.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
      setItem: jest.fn((key: string, value: string) => {
        store[key] = value;
        return Promise.resolve();
      }),
      removeItem: jest.fn((key: string) => {
        delete store[key];
        return Promise.resolve();
      }),
      multiGet: jest.fn((keys: string[]) =>
        Promise.resolve(keys.map((k) => [k, store[k] ?? null])),
      ),
      multiSet: jest.fn((pairs: [string, string][]) => {
        pairs.forEach(([k, v]) => {
          store[k] = v;
        });
        return Promise.resolve();
      }),
      getAllKeys: jest.fn(() => Promise.resolve(Object.keys(store))),
      multiRemove: jest.fn((keys: string[]) => {
        keys.forEach((k) => delete store[k]);
        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        Object.keys(store).forEach((k) => delete store[k]);
        return Promise.resolve();
      }),
    },
  };
});

// MMKV is a JSI native module, so it cannot be constructed under Jest. An
// in-memory map with the same surface covers everything that reads it.
//
// Stores are shared per instance id, as the real thing is: two `new MMKV({ id:
// 'dehub' })` calls open the same file, so a mock that gave each instance its
// own map would let a test pass while the app it stands in for could not work.
// It matters as soon as a test re-imports a module that constructs its own
// handle — the writes went to a map nothing else could see.
jest.mock('react-native-mmkv', () => {
  const stores: Record<string, Record<string, string | number | boolean>> = {};

  class MMKV {
    private store: Record<string, string | number | boolean>;

    constructor(config?: { id?: string }) {
      const id = config?.id ?? 'mmkv.default';
      stores[id] = stores[id] ?? {};
      this.store = stores[id];
    }

    getString(key: string): string | undefined {
      const v = this.store[key];
      return typeof v === 'string' ? v : undefined;
    }
    getBoolean(key: string): boolean | undefined {
      const v = this.store[key];
      return typeof v === 'boolean' ? v : undefined;
    }
    getNumber(key: string): number | undefined {
      const v = this.store[key];
      return typeof v === 'number' ? v : undefined;
    }
    set(key: string, value: string | number | boolean): void {
      this.store[key] = value;
    }
    delete(key: string): void {
      delete this.store[key];
    }
    clearAll(): void {
      // Emptied in place, not rebound: the map is shared with every other
      // handle on this id, and reassigning would quietly detach this one.
      for (const key of Object.keys(this.store)) delete this.store[key];
    }
  }
  return { MMKV };
});

jest.mock('expo-clipboard', () => ({
  setString: jest.fn(),
  getStringAsync: jest.fn().mockResolvedValue(''),
  setStringAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('expo-constants', () => ({
  expoConfig: { version: '1.0.0-test' },
}));

// Read by libs/errorReporter for the device context on an error row.
jest.mock('expo-device', () => ({
  modelName: 'Test Device',
  osVersion: '14.0',
  totalMemory: 4 * 1024 * 1024 * 1024,
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

jest.mock('sonner-native', () => ({
  toast: { custom: jest.fn(), dismiss: jest.fn() },
}));

jest.mock('../libs/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('../libs/web3.auth.sign', () => ({
  getOrCreateAuthSignature: jest.fn().mockResolvedValue({
    signature: '0xmocksig',
    message: 'mock-message',
    nonce: 'mock-nonce',
  }),
  buildAuthRequestPayload: jest.fn().mockReturnValue({
    signature: '0xmocksig',
    message: 'mock-message',
    nonce: 'mock-nonce',
  }),
}));

jest.mock('../libs/device', () => ({
  getDeviceHeaders: jest.fn().mockResolvedValue({
    'X-Device-Id': 'test-device-id',
    'X-Device-Name': 'test-device',
  }),
}));

jest.mock('../components/ui/GlassToast', () => ({
  __esModule: true,
  default: 'GlassToast',
}));

jest.mock('../libs/toast', () => ({
  showToast: jest.fn(),
  showErrorToast: jest.fn(),
  showSuccessToast: jest.fn(),
  showInfoToast: jest.fn(),
  dismissToast: jest.fn(),
}));

jest.mock('react-native-css-interop', () => ({
  cssInterop: jest.fn((comp: any) => comp),
  remapProps: jest.fn((comp: any) => comp),
}));

// Silence console.error/warn in tests unless debugging
if (!process.env.DEBUG_TESTS) {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
}
