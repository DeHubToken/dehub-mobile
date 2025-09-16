import 'react-native-gesture-handler';
import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import "@ethersproject/shims";
import "@walletconnect/react-native-compat";
import "react-native-reanimated";
import "react-native-worklets";

import "./globals";

// import "./config/reown.config";

import { registerRootComponent } from "expo";
import App from "./App";

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
// setTimeout(() => {
//   registerRootComponent(App);
// }, 100)