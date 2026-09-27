import { Dimensions } from 'react-native';
import { initialWindowMetrics, type Metrics } from 'react-native-safe-area-context';

// The root must mount BootGate before the first native insets event: BootGate
// releases the splash and reports stalled launches. SafeAreaProvider otherwise
// renders no children while waiting. Live measurements replace this seed.
export const initialSafeAreaMetrics: Metrics = initialWindowMetrics ?? {
  frame: { x: 0, y: 0, width: Dimensions.get('window').width, height: Dimensions.get('window').height },
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
};
