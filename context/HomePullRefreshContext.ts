import { createContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';

export interface HomePullMotion {
  distance: SharedValue<number>;
  pulling: SharedValue<boolean>;
  flow: SharedValue<number>;
}

export const HomePullRefreshContext = createContext<{
  enabled: boolean;
  register: (refresh: () => void) => () => void;
} | null>(null);
