# Testing Guide

## Quick Start

```bash
# Run all tests
npm test

# Run in watch mode (re-runs on file changes)
npm run test:watch

# Run with coverage report
npm run test:coverage

# Run in CI mode (coverage + junit output)
npm run test:ci
```

## Project Setup

| Tool | Purpose |
|------|---------|
| **Jest** | Test runner (react-native preset) |
| **ts-jest** | TypeScript transform |
| **@testing-library/react-native** | Hook & component testing |

Configuration lives in `jest.config.js`. Mock infrastructure is in `__mocks__/`.

## Directory Structure

```
__mocks__/
  @env.ts          # Environment variable stubs
  fileMock.js      # Static asset stub (images, fonts)
  styleMock.js     # CSS import stub
  setup.ts         # Global mocks (RN, Expo, NetInfo, etc.)

__tests__/
  libs/            # Pure utility function tests
  services/        # API service layer tests
  hooks/           # React hook tests
```

## Writing Tests

### Utility / Service Tests

Mock `apiClient` at the top of every service test file:

```ts
jest.mock('../../libs/api.client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockGet = apiClient.get as jest.Mock;
```

Then set return values per-test:

```ts
mockGet.mockResolvedValueOnce({ result: [{ id: 1 }] });
const res = await someServiceFn();
expect(res.result).toHaveLength(1);
```

### Hook Tests

Use `renderHook` from `@testing-library/react-native`:

```ts
import { renderHook, act } from '@testing-library/react-native';

const { result } = renderHook(() => useMyHook());

await act(async () => {
  result.current.doSomething();
});

expect(result.current.value).toBe(expected);
```

### Adding New Mocks

If your test imports a native module not yet mocked, add it to `__mocks__/setup.ts`:

```ts
jest.mock('some-native-module', () => ({
  someMethod: jest.fn(),
}));
```

### Naming Conventions

- **File**: `__tests__/<layer>/<module>.test.ts` matching the source path
- **Describe blocks**: `services/feed.service` or `hooks/useNetworkStatus`
- **Test names**: Start with a verb — "returns", "throws", "calls", "handles"

## CI Pipeline

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push/PR to `main` and `develop`:

| Job | What it does |
|-----|-------------|
| **lint-typecheck** | `tsc --noEmit` — catches type errors |
| **test** | `npm run test:ci` — runs all tests with coverage |
| **test-results** | Checks coverage against 60% thresholds |

Coverage reports are uploaded as artifacts and a summary is posted to the PR check.

### Coverage Thresholds

Set in `jest.config.js` under `coverageThreshold.global`. Start low and ratchet up as more tests are added:

| Metric | Current Minimum | Target |
|--------|----------------|--------|
| Branches | 10% | 60% |
| Functions | 10% | 60% |
| Lines | 10% | 60% |
| Statements | 10% | 60% |

Bump thresholds every sprint as new tests are added. Never lower them.

## Existing Test Coverage

| Layer | Files Tested |
|-------|-------------|
| **libs** | misc, numbers.util, date.util, audioFocus, feedVideoFocus, auth.utils, token-refresh, api.client |
| **services** | auth, feed, feed.unified, dpay, repost, user, nft |
| **hooks** | useNetworkStatus, useDebounceCallback |

## Troubleshooting

**"Cannot find module" errors** — Check `moduleNameMapper` in `jest.config.js`. All `@env` imports map to `__mocks__/@env.ts`.

**"ReferenceError: fetch is not defined"** — The `api.client` is mocked in service tests, so fetch is never actually called. If you need real fetch in integration tests, polyfill with `cross-fetch`.

**Timeout errors** — Default timeout is 10s (`testTimeout` in jest.config.js). Increase with `jest.setTimeout(30000)` in slow test files.

**expo-secure-store in tests** — Uses an in-memory store (see `__mocks__/setup.ts`). Call `require('expo-secure-store').__clear()` in `beforeEach` to reset between tests.
