import React, { memo, useEffect, useMemo, useRef } from "react";
import {
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Icon, { type IconName } from "../ui/Icon";
import GlassIndicator, { GLASS_SHADOW } from "../ui/GlassIndicator";
import { formatCompactNumber } from "../../libs/numbers.util";

export interface ProfileTabItem<Key extends string = string> {
  key: Key;
  label: string;
  icon: IconName;
  count?: number;
}

interface ProfileTabBarProps<Key extends string = string> {
  items: ProfileTabItem<Key>[];
  activeKey: Key;
  onChange: (key: Key) => void;
}

const TAB_WIDTH = 56;
const TAB_HEIGHT = 52;
const TRANSITION = {
  duration: 260,
  easing: Easing.bezier(0.16, 1, 0.3, 1),
};

function ProfileTabBarInner<Key extends string>({
  items,
  activeKey,
  onChange,
}: ProfileTabBarProps<Key>) {
  const scrollRef = useRef<ScrollView>(null);
  const activeIndex = Math.max(0, items.findIndex((item) => item.key === activeKey));
  const indicatorX = useSharedValue(activeIndex * TAB_WIDTH);

  useEffect(() => {
    indicatorX.value = withTiming(activeIndex * TAB_WIDTH, TRANSITION);
    scrollRef.current?.scrollTo({
      x: Math.max(0, activeIndex * TAB_WIDTH - TAB_WIDTH * 2),
      animated: true,
    });
  }, [activeIndex, indicatorX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderRelease: (_event, gesture) => {
          const isFlick = Math.abs(gesture.vx) > 0.35 || Math.abs(gesture.dx) > 28;
          if (!isFlick) return;
          const nextIndex = Math.max(
            0,
            Math.min(items.length - 1, activeIndex + (gesture.dx > 0 ? 1 : -1)),
          );
          const next = items[nextIndex];
          if (next && next.key !== activeKey) onChange(next.key);
        },
      }),
    [activeIndex, activeKey, items, onChange],
  );

  return (
    <View style={styles.outerWrap}>
      <View style={styles.container}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <Animated.View
            pointerEvents="none"
            style={[styles.indicator, indicatorStyle, GLASS_SHADOW]}
          >
            <GlassIndicator borderRadius={12} />
          </Animated.View>
          {items.map((item) => {
            const focused = item.key === activeKey;
            return (
              <Pressable
                key={item.key}
                {...(focused ? panResponder.panHandlers : {})}
                accessibilityRole="tab"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: focused }}
                onPress={() => onChange(item.key)}
                style={({ pressed }) => [
                  styles.tab,
                  pressed && styles.tabPressed,
                ]}
              >
                <Icon
                  name={item.icon}
                  size={18}
                  color={focused ? "#FFFFFF" : "#71717A"}
                  strokeWidth={2}
                />
                <Text
                  numberOfLines={1}
                  style={[styles.count, focused && styles.countActive]}
                >
                  {typeof item.count === "number"
                    ? formatCompactNumber(item.count)
                    : ""}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrap: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
  },
  container: {
    minHeight: TAB_HEIGHT,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#1D1F21",
  },
  content: {
    position: "relative",
    minWidth: "100%",
  },
  indicator: {
    position: "absolute",
    left: 0,
    top: 0,
    width: TAB_WIDTH,
    height: TAB_HEIGHT,
    borderRadius: 12,
    overflow: "hidden",
  },
  tab: {
    width: TAB_WIDTH,
    height: TAB_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  tabPressed: {
    opacity: 0.72,
  },
  count: {
    color: "#A1A1AA",
    fontSize: 12,
    lineHeight: 14,
    marginTop: 1,
    fontWeight: "500",
  },
  countActive: {
    color: "#FFFFFF",
  },
});

export default memo(ProfileTabBarInner) as typeof ProfileTabBarInner;
