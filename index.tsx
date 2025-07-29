import 'react-native-gesture-handler';
import 'react-native-reanimated';
import { registerRootComponent } from 'expo';
import App from './App';

// Polyfill for _toString if needed
// if (typeof global !== 'undefined' && !global._toString) {
//   global._toString = Object.prototype.toString;
// }

registerRootComponent(App);
