/** @type {import('jest').Config} */
module.exports = {
  preset: 'react-native',
  // babel-jest for everything, matching what the react-native preset does.
  // This was ts-jest for .ts/.tsx with `diagnostics: false` — which paid a full
  // TypeScript compile per file and switched off the only thing ts-jest offers
  // over babel in exchange. Type checking already runs separately as
  // `tsc --noEmit` (npm run typecheck, and the CI lint-typecheck job).
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|expo-.*|@expo/.*|nativewind|lucide-react-native|sonner-native|@react-navigation|@react-native-community|@react-native-async-storage|valtio|socket\\.io-client)/)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@env$': '<rootDir>/__mocks__/@env.ts',
    '\\.(png|jpg|jpeg|gif|svg)$': '<rootDir>/__mocks__/fileMock.js',
    '\\.css$': '<rootDir>/__mocks__/styleMock.js',
  },
  setupFiles: ['<rootDir>/__mocks__/setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/', '/.expo/'],
  // Scoped to the directories the suite actually exercises. This previously
  // included `components/**` and `context/**` — ~380 files with no tests
  // pointing at them — so every coverage run instrumented the whole component
  // tree to compute a global percentage that only libs/services/hooks moved.
  // Widen this again when component tests land.
  collectCoverageFrom: [
    'libs/**/*.{ts,tsx}',
    'services/**/*.{ts,tsx}',
    'hooks/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/index.{ts,tsx}',
  ],
  // json-summary is what writes coverage/coverage-summary.json. Without it the
  // CI steps that read that file silently found nothing and passed. The rest
  // are jest's defaults, minus the ones nothing consumes.
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  // Left at 10 deliberately: narrowing collectCoverageFrom above raises the
  // real number, but nobody has measured it yet. Raise this to something honest
  // once a run reports the actual figure.
  coverageThreshold: {
    global: {
      branches: 10,
      functions: 10,
      lines: 10,
      statements: 10,
    },
  },
  testTimeout: 10000,
};
