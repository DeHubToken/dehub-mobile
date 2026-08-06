// Must be the very first import — installs polyfills (Buffer, TextEncoder,
// native crypto) that @web3auth/react-native-sdk needs (used only for the
// one-time legacy-account recovery flow, see libs/legacy-web3auth.ts).
import "@web3auth/react-native-sdk/setup";
import "react-native-gesture-handler";
import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import "@ethersproject/shims";
import "@walletconnect/react-native-compat";
// import "react-native-reanimated";
import "react-native-gesture-handler";
import "react-native-worklets";

import "./globals";
import "./i18n";

// Initializes the "Connect Wallet" (Reown/WalletConnect) sign-in option —
// side-effect import, must run once at startup before any screen renders.
import "./config/reown.config";

// Silence noisy deprecation warning from transitive deps in dev
//   LogBox.ignoreLogs(["SafeAreaView has been deprecated", "Failed to obtain view for PanGestureHandler"]);
// LogBox.ignoreLogs(["Failed to obtain view for PanGestureHandler"]);

import { registerRootComponent } from "expo";

import App from "./App";

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
