import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import "@ethersproject/shims";
import "@walletconnect/react-native-compat";
import "react-native-reanimated";
import { Buffer } from "buffer";
// import { config } from "dotenv";

// config();

global.Buffer = Buffer;

import { registerRootComponent } from "expo";
import App from "./App";
import { initAppKit, projectId, metadata, chains, config } from "./config";
import {
  createAppKit,
  defaultConfig,
} from "@reown/appkit-ethers5-react-native";

// Initialize AppKit
initAppKit();
// createAppKit({
//   projectId,
//   metadata,
//   chains,
//   config,
//   enableAnalytics: true,
//   features: {
//     analytics: true,
//     toast: true,
//   },
// });

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
