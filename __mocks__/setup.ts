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

jest.mock('expo-clipboard', () => ({
  setString: jest.fn(),
  getStringAsync: jest.fn().mockResolvedValue(''),
  setStringAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('expo-constants', () => ({
  expoConfig: { version: '1.0.0-test' },
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
