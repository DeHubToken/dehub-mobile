import React, { useCallback, memo } from "react";
import { View } from "react-native";
import { TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import SmartImage from "./common/SmartImage";
import { ScreenNames } from "../navigation/ScreenNames";

/**
 * Height of the mark bar in points. Web's mobile chrome is a fixed 44px bar
 * (`h-11`) carrying the dehub mark, sitting above whatever the page's own
 * title bar is; this is the same bar for the app.
 */
export const APP_TOP_BAR_HEIGHT = 44;

/**
 * The dehub mark, centred at the top of the screen.
 *
 * Web renders this on every /app route (MobileHeader, mounted from
 * AppSidebar), so the mark is a constant — it does not belong to the feed.
 * The app used to show it on Home and Profile only, which is why every other
 * screen read as a different product. This component is that constant bar; it
 * is stacked above ScreenHeader and above the tab screens that draw their own
 * title row (Messages, Assistant).
 *
 * Deliberately mark-only: web's side slots (drawer trigger, bell) depend on
 * DrawerContext, which exists only inside BottomTabNavigator — a stack screen
 * rendering them would throw. Every screen that has those controls already
 * draws them in its own header row underneath.
 */
const AppTopBar: React.FC<{ onPress?: () => void }> = ({ onPress }) => {
  const navigation = useNavigation<any>();

  const handlePress = useCallback(() => {
    if (onPress) {
      onPress();
      return;
    }
    navigation.navigate(ScreenNames.Root, { screen: ScreenNames.Home });
  }, [navigation, onPress]);

  return (
    <View
      className="flex-row items-center justify-center bg-theme-neutrals-900"
      style={{ height: APP_TOP_BAR_HEIGHT }}
    >
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="DeHub"
        accessibilityHint="Goes to the home feed"
        hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
      >
        <SmartImage
          source={require("../assets/web-icons/dehub-logo-compact.png")}
          style={{ width: 33, height: 28 }}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={150}
        />
      </TouchableOpacity>
    </View>
  );
};

export default memo(AppTopBar);
