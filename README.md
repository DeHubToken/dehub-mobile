# DeHub Mobile

[![CI](https://github.com/An0nym0usAng3l/dehub-mobile/actions/workflows/ci.yml/badge.svg)](https://github.com/An0nym0usAng3l/dehub-mobile/actions/workflows/ci.yml)

> Decentralized social media app — stream, post, tip, and trade on-chain.

| Stack | Version |
|-------|---------|
| React Native | 0.81.4 |
| Expo SDK | 54 |
| React | 19.1.0 |
| TypeScript | 5.x |
| Node | 20+ |

## Prerequisites

- **Node.js 20+** and **npm**
- **Xcode 16+** (iOS) or **Android Studio** (Android)
- **EAS CLI** — `npm i -g eas-cli` (>= 16.19.0)
- **CocoaPods** — `gem install cocoapods` (iOS only)

## Getting Started

```bash
# 1. Clone the repo
git clone <repo-url> && cd dhb-mobile

# 2. Install dependencies
npm install --legacy-peer-deps

# 3. Create environment file
cp .env.example .env
# Fill in the required values (see Environment Variables below)

# 4. Install iOS pods
cd ios && pod install && cd ..

# 5. Start the dev server
npm start
```

### Run on Device / Simulator

```bash
# iOS
npm run ios

# Android
npm run android
```

## Environment Variables

Create a `.env` file in the project root. Required variables:

| Variable | Description |
|----------|-------------|
| `API_URL` | Backend API base URL |
| `APP_ENV` | `development` / `staging` / `production` |
| `CDN_BASE_URL` | CDN for media assets |
| `WEBSOCKET_URL` | WebSocket server URL |
| `REOWN_PROJECT_ID` | Reown (WalletConnect) project ID |
| `WEB3AUTH_CLIENT_ID` | Web3Auth client ID |
| `INFURA_KEY` | Infura RPC key |
| `ALCHEMY_API_KEY` | Alchemy RPC key |
| `LIVEPEER_API_KEY` | Livepeer streaming API key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe payments key |
| `TENOR_API_KEY` | Tenor GIF API key |
| `PIMLICO_API_KEY` | Pimlico bundler key |
| `SUPABASE_EDGE_BASE_URL` | Supabase edge functions URL |
| `APP_ORIGIN` | Deep link origin (`dehub.io`) |
| `LEGACY_APP_ORIGIN` | Legacy deep link origin |
| `AUTH_PROVIDER` | Auth provider identifier |
| `DEBUG` | Enable debug logging |

## Project Structure

```
├── assets/            # Images, icons, animations (Rive, Lottie)
├── components/        # UI components organized by feature
│   ├── ui/            # Shared primitives (Icon, Button, Glass, etc.)
│   ├── Feed/          # Feed cards, grid, viewers
│   ├── Chat/          # Chat components
│   ├── DM/            # Direct messaging
│   ├── Profile/       # User profile
│   └── ...
├── config/            # App configuration, ABIs, constants
├── context/           # React contexts (Auth, DM, WebSocket)
├── hooks/             # Custom hooks
├── libs/              # Utility functions, API client, auth helpers
├── navigation/        # React Navigation stacks & tabs
├── screens/           # Screen components
├── services/          # API service layer (auth, feed, nft, dpay, etc.)
├── store/             # State management (Valtio)
├── theme/             # Theming & colors
├── __tests__/         # Test suites
│   ├── libs/          # Utility tests
│   ├── services/      # Service layer tests
│   └── hooks/         # Hook tests
├── __mocks__/         # Jest mock infrastructure
└── .github/workflows/ # CI pipeline
```

## Testing

```bash
npm test               # Run all tests
npm run test:watch     # Watch mode
npm run test:coverage  # With coverage report
npm run test:ci        # CI mode (coverage + junit)
```

**321 tests** across 17 suites covering libs, services, and hooks.

See [docs/testing.md](docs/testing.md) for the full testing guide — writing tests, adding mocks, and coverage thresholds.

## CI Pipeline

GitHub Actions runs automatically on push/PR to `main` and `develop`:

| Job | What it does |
|-----|-------------|
| **Lint & Typecheck** | `tsc --noEmit` |
| **Test** | Jest with coverage, uploads report artifact |
| **Publish Results** | Enforces coverage thresholds |

## EAS Builds

```bash
# Development build (dev client)
eas build --profile development --platform ios

# Preview (internal distribution)
eas build --profile preview --platform all

# Production
eas build --profile production --platform all

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

## Tech Stack

- **Navigation** — React Navigation 7 (native stack + bottom tabs)
- **Styling** — NativeWind 4 (Tailwind via `className`)
- **State** — Valtio (proxy-based reactive state)
- **Icons** — lucide-react-native via `<Icon>` wrapper
- **Animations** — Reanimated 3 + Gesture Handler
- **Streaming** — Livepeer
- **Web3** — ethers.js 5, Reown AppKit, Web3Auth
- **Payments** — Stripe, DPay (on-chain)
- **Real-time** — Socket.IO (chat, DMs, live)
- **Media** — expo-camera, expo-av, expo-image-picker

## Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start Expo dev server |
| `npm run ios` | Run on iOS simulator |
| `npm run android` | Run on Android emulator |
| `npm test` | Run test suite |
| `npm run test:coverage` | Run tests with coverage |
| `npm run typecheck` | TypeScript type check |

## Patches

Native dependency patches live in `patches/` and are applied automatically via `patch-package` on `postinstall`. See [patches/README.md](patches/README.md) for details.

## License

Proprietary — All rights reserved.
