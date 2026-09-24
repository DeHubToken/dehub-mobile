import React, { memo, useMemo } from "react";
import {
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Icon, { type IconName } from "../ui/Icon";
import { formatCompactNumber } from "../../libs/numbers.util";
import { useAppTheme } from "../../context/ThemeContext";
import {
  MINIMAL_TAB_TEXT,
  MINIMAL_TAB_TEXT_ACTIVE,
  minimalTab,
  minimalTabActive,
  minimalTabStrip,
} from "../../theme/minimal";

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

const TAB_HEIGHT = 52;

function ProfileTabBarInner<Key extends string>({
  items,
  activeKey,
  onChange,
}: ProfileTabBarProps<Key>) {
  const { isMinimal } = useAppTheme();
  const activeIndex = Math.max(0, items.findIndex((item) => item.key === activeKey));

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
    <View style={[styles.outerWrap, isMinimal && styles.minimalOuterWrap]}>
      {/* Plain flex row, no ScrollView: the web profile page gives every tab
          flex-1 so the whole set spreads evenly across the pill. A horizontal
          ScrollView here refused to stretch its content container to the full
          width, which left all tabs bunched at the left edge. */}
      {/* Minimal: an edge-to-edge file-tab strip. One baseline across the
          width; the active tab is outlined on three sides and dropped 1pt so
          its black fill breaks the line. flex-end seats tabs on the baseline. */}
      <View style={[styles.container, isMinimal && styles.minimalContainer]}>
        {items.map((item) => {
          const focused = item.key === activeKey;
          return (
            <TouchableOpacity
              key={item.key}
              {...(focused ? panResponder.panHandlers : {})}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: focused }}
              onPress={() => onChange(item.key)}
              activeOpacity={0.72}
              style={[
                styles.tab,
                focused && styles.tabActive,
                isMinimal && minimalTab,
                isMinimal && focused && minimalTabActive,
              ]}
            >
              <Icon
                name={item.icon}
                size={18}
                color={
                  focused
                    ? isMinimal ? MINIMAL_TAB_TEXT_ACTIVE : "#FFFFFF"
                    : isMinimal ? MINIMAL_TAB_TEXT : "#808089"
                }
                strokeWidth={2}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.count,
                  isMinimal && styles.minimalCount,
                  focused && styles.countActive,
                ]}
              >
                {typeof item.count === "number"
                  ? formatCompactNumber(item.count)
                  : ""}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrap: {
    width: "100%",
    paddingHorizontal: 8,
    // Keep the profile bento, tab bar, and content controls on the same
    // 16pt vertical rhythm. These are visible gaps, not internal pill inset.
    paddingTop: 16,
    paddingBottom: 16,
  },
  container: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    minHeight: TAB_HEIGHT,
    borderRadius: 12,
    backgroundColor: "#18181B",
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  tab: {
    flex: 1,
    height: TAB_HEIGHT - 4,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  count: {
    textAlign: "center",
    color: "#808089",
    fontSize: 10,
    lineHeight: 12,
    marginTop: 1,
    fontWeight: "500",
  },
  countActive: {
    color: "#FFFFFF",
  },
  minimalOuterWrap: {
    paddingHorizontal: 0,
  },
  minimalContainer: {
    ...minimalTabStrip,
    paddingVertical: 0,
    alignItems: "flex-end",
  },
  minimalCount: {
    color: MINIMAL_TAB_TEXT,
  },
});

export default memo(ProfileTabBarInner) as typeof ProfileTabBarInner;
