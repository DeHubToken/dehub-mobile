import React, { createContext, useContext } from "react";
import { useSharedValue, type SharedValue } from "react-native-reanimated";

/**
 * Shared value driving bottom tab bar visibility.
 * Range: 0 (fully visible) to -headerHeight (fully hidden).
 * Mirrors the header's translateY from useCollapsibleHeader.
 */
const TabBarHideContext = createContext<SharedValue<number> | null>(null);

export const TabBarHideProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const headerTranslateY = useSharedValue(0);
  return (
    <TabBarHideContext.Provider value={headerTranslateY}>
      {children}
    </TabBarHideContext.Provider>
  );
};

export const useTabBarHide = (): SharedValue<number> | null => useContext(TabBarHideContext);
