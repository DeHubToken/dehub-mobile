import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Image } from "expo-image";
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useAppTheme } from "../../context/ThemeContext";
import { themeIconUrl } from "../../theme/icons";
import { FEED_PILL_RADIUS, FeedPillIndicator } from "../ui/FeedPillSurface";
import type { PageTab } from "./PageKit";

/** Home's indicator: 35pt tall, 95% of its tab. */
const INDICATOR_HEIGHT = 35;
const INDICATOR_SIDE_GAP = 0.025;
const ROW_HEIGHT = 38;
/** Home's tab slide (web: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)). */
const SLIDE = { duration: 400, easing: Easing.bezier(0.16, 1, 0.3, 1) } as const;

type Box = { x: number; w: number };

/**
 * A page's tabs inside its header pill, drawn like the home feed's tabs: plain
 * icons with the glass tile sliding under the lit one. Tabs that all have an
 * icon show the icon only (the name is still read out); others show their
 * name. When they do not fit they scroll sideways.
 */
export default function PillTabs<T extends string>({
  tabs,
  value,
  onChange,
  beforeTabs,
}: {
  tabs: PageTab<T>[];
  value: T;
  onChange: (id: T) => void;
  beforeTabs?: React.ReactNode;
}) {
  const { theme, skin } = useAppTheme();
  const on = skin ? skin.tabIconActive : "#FFFFFF";
  const off = skin ? skin.tabIcon : "#808089";
  const iconOnly = tabs.every((tab) => tab.icon != null);

  const boxes = useRef(new Map<string, Box>());
  const [ready, setReady] = useState(false);
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const placed = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const beforeWidth = useRef(0);

  const place = useCallback((animate: boolean) => {
    const box = boxes.current.get(value);
    if (!box) return;
    const nx = box.x + box.w * INDICATOR_SIDE_GAP;
    const nw = box.w * (1 - INDICATOR_SIDE_GAP * 2);
    if (animate && placed.current) {
      x.value = withTiming(nx, SLIDE);
      w.value = withTiming(nw, SLIDE);
    } else {
      x.value = nx;
      w.value = nw;
    }
    placed.current = true;
    setReady(true);
    scrollRef.current?.scrollTo({ x: Math.max(0, beforeWidth.current + box.x - 48), animated: animate });
  }, [value, x, w]);

  useEffect(() => { place(true); }, [place]);

  const onTabLayout = useCallback((id: string, e: LayoutChangeEvent) => {
    const { x: bx, width } = e.nativeEvent.layout;
    boxes.current.set(id, { x: bx, w: width });
    if (id === value) place(false);
  }, [value, place]);

  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], width: w.value }));

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
    >
      {beforeTabs ? (
        <View style={styles.before} onLayout={(e) => { beforeWidth.current = e.nativeEvent.layout.width; }}>
          {beforeTabs}
        </View>
      ) : null}
      <View style={styles.tabs}>
        {ready ? (
          <Reanimated.View pointerEvents="none" style={[styles.indicator, indicator]}>
            <FeedPillIndicator />
          </Reanimated.View>
        ) : null}
        {tabs.map((tab) => {
          const active = tab.id === value;
          const ink = active ? on : off;
          const uri = typeof tab.icon === "string" ? themeIconUrl(theme, tab.icon) : undefined;
          return (
            <Pressable
              key={tab.id}
              onPress={() => onChange(tab.id)}
              onLayout={(e) => onTabLayout(tab.id, e)}
              accessibilityRole="tab"
              accessibilityLabel={tab.label || undefined}
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.tab,
                iconOnly ? styles.iconTab : styles.textTab,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              {typeof tab.icon === "string" ? (
                uri ? <Image source={{ uri }} style={styles.art} contentFit="contain" cachePolicy="disk" /> : null
              ) : typeof tab.icon === "function" ? (
                tab.icon(ink)
              ) : (
                tab.icon ?? null
              )}
              {iconOnly ? null : (
                <Text numberOfLines={1} style={[styles.label, { color: ink, fontWeight: active ? "600" : "500" }]}>
                  {tab.label}
                </Text>
              )}
              {typeof tab.count === "number" && tab.count > 0 ? (
                <Text style={[styles.count, { color: ink }]}>{tab.count > 99 ? "99+" : tab.count}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, height: ROW_HEIGHT },
  row: { flexGrow: 1, alignItems: "center" },
  before: { flexDirection: "row", alignItems: "center", gap: 2, marginRight: 2 },
  tabs: { flexGrow: 1, flexDirection: "row", alignItems: "center", height: ROW_HEIGHT },
  indicator: {
    position: "absolute",
    left: 0,
    top: (ROW_HEIGHT - INDICATOR_HEIGHT) / 2,
    height: INDICATOR_HEIGHT,
    borderRadius: FEED_PILL_RADIUS,
  },
  tab: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: FEED_PILL_RADIUS,
  },
  iconTab: { flexGrow: 1, minWidth: 40, paddingHorizontal: 8 },
  textTab: { flexGrow: 1, paddingHorizontal: 12 },
  art: { width: 18, height: 18 },
  label: { fontSize: 13, letterSpacing: 0.1 },
  count: { fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
});
