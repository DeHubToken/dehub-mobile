import React, { memo, useCallback, useEffect, useRef } from "react";
import { View, Pressable, StyleSheet, Platform } from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  Easing,
  interpolate,
  type SharedValue,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import Icon from "../components/ui/Icon";
import type { IconName } from "../components/ui/Icon";
import { ScreenNames } from "./ScreenNames";

const ANIM_STORAGE_KEY = "bottomNavCarouselSeen";

interface TabDef {
  name: string;
  icon: IconName;
  isCenter?: boolean;
}

const TABS: TabDef[] = [
  { name: ScreenNames.Home, icon: "House" },
  { name: ScreenNames.DM, icon: "MessageSquare" },
  { name: ScreenNames.UploadTab, icon: "Plus", isCenter: true },
  { name: ScreenNames.AIChat, icon: "Sparkles" },
  { name: ScreenNames.Explore, icon: "Search" },
];

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

const NavButton = memo<{
  icon: IconName;
  isActive: boolean;
  isCenter?: boolean;
  onPress: () => void;
  index: number;
  animProgress: SharedValue<number>;
}>(({ icon, isActive, isCenter, onPress, index, animProgress }) => {
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.88, { damping: 15, stiffness: 300 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => {
    const staggerDelay = index * 0.12;
    const itemProgress = interpolate(
      animProgress.value,
      [staggerDelay, staggerDelay + 0.6],
      [0, 1],
      "clamp",
    );
    return {
      transform: [
        { scale: scale.value * interpolate(itemProgress, [0, 1], [0.3, 1], "clamp") },
        { translateY: interpolate(itemProgress, [0, 0.6, 1], [20, -4, 0], "clamp") },
      ],
      opacity: interpolate(itemProgress, [0, 0.4, 1], [0, 0.8, 1], "clamp"),
    };
  });

  if (isCenter) {
    return (
      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.centerButton, animatedStyle]}
      >
        <View style={styles.centerIconWrap}>
          <View style={styles.centerGlass} />
          <Icon name={icon} size={22} color="#FFFFFF" strokeWidth={2} />
        </View>
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.tabButton, animatedStyle]}
    >
      <View style={isActive ? styles.activeGlow : undefined}>
        <Icon
          name={icon}
          size={22}
          color="#FFFFFF"
          strokeWidth={isActive ? 2.2 : 1.6}
        />
      </View>
    </AnimatedPressable>
  );
});

const FloatingBottomTabBar: React.FC<BottomTabBarProps> = ({ state, navigation }) => {
  const insets = useSafeAreaInsets();
  const animProgress = useSharedValue(1);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;
    animProgress.value = 0;
    animProgress.value = withDelay(
      100,
      withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) }),
    );
  }, [animProgress]);

  const handlePress = useCallback(
    (routeName: string) => {
      const event = navigation.emit({
        type: "tabPress",
        target: routeName,
        canPreventDefault: true,
      });

      if (!event.defaultPrevented) {
        const isFocused = state.routes[state.index]?.name === routeName;
        if (!isFocused) {
          navigation.navigate(routeName);
        }
      }
    },
    [navigation, state],
  );

  const bottomPadding = Math.max(insets.bottom, 8);

  return (
    <View style={[styles.outerWrap, { paddingBottom: bottomPadding }]} pointerEvents="box-none">
      <View style={styles.gradientOverlay} pointerEvents="none" />
      <View style={styles.navContainer}>
        <BlurView
          intensity={80}
          tint="dark"
          style={styles.blur}
          {...(Platform.OS === "android" ? { experimentalBlurMethod: "dimezisBlurView" } : {})}
        >
          <View style={styles.glassOverlay} />
          <View style={styles.specularHighlight} />
          <View style={styles.navRow}>
            {TABS.map((tab, index) => {
              const isActive = state.routes[state.index]?.name === tab.name;
              return (
                <NavButton
                  key={tab.name}
                  icon={tab.icon}
                  isActive={isActive}
                  isCenter={tab.isCenter}
                  onPress={() => handlePress(tab.name)}
                  index={index}
                  animProgress={animProgress}
                />
              );
            })}
          </View>
        </BlurView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  gradientOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
  },
  navContainer: {
    width: "72%",
    maxWidth: 340,
    borderRadius: 18,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  blur: {
    borderRadius: 18,
    overflow: "hidden",
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(24, 24, 27, 0.3)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  specularHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: 52,
  },
  centerButton: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  centerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  centerGlass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  activeGlow: {
    ...Platform.select({
      ios: {
        shadowColor: "#FFFFFF",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 12,
      },
      android: {},
    }),
  },
});

export default memo(FloatingBottomTabBar);
