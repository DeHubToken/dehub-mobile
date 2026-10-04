import { createContext, type MutableRefObject } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import type { GestureType } from 'react-native-gesture-handler';

export interface HomePullMotion {
  distance: SharedValue<number>;
  pulling: SharedValue<boolean>;
  flow: SharedValue<number>;
}

export const HomePullRefreshContext = createContext<{
  enabled: boolean;
  register: (refresh: () => void) => () => void;
  gestureRef?: MutableRefObject<GestureType | undefined>;
} | null>(null);
