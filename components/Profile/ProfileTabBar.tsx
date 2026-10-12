import React, { memo, useEffect, useRef, useState } from "react";
import { I18nManager, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Icon, { type IconName } from "../ui/Icon";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import NavPillSurface from "../ui/NavPillSurface";
import { PINNED_PROFILE_TABS_HEIGHT, PROFILE_TABS_TOP_GAP } from "./useProfileCollapse";
import { formatCompactNumber } from "../../libs/numbers.util";
import { useAppTheme } from "../../context/ThemeContext";
import { minimalTab, minimalTabActive, minimalTabStrip } from "../../theme/minimal";

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
  pinned?: boolean;
  embedded?: boolean;
}

const TAB_HEIGHT = PINNED_PROFILE_TABS_HEIGHT - 4;
const TAB_WIDTH = 56;

function ProfileTabBarInner<Key extends string>({ items, activeKey, onChange, pinned = false, embedded = false }: ProfileTabBarProps<Key>) {
  const { isMinimal, colors, skin } = useAppTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [railWidth, setRailWidth] = useState(0);
  const [offset, setOffset] = useState(0);
  const contentWidth = items.length * TAB_WIDTH;
  const maxOffset = Math.max(0, contentWidth - railWidth);
  const startHidden = offset > 1;
  const endHidden = maxOffset - offset > 1;
  const edgeColor = String(skin?.barFill.backgroundColor ?? colors.background);

  useEffect(() => {
    if (!railWidth) return;
    const index = Math.max(0, items.findIndex(item => item.key === activeKey));
    const left = index * TAB_WIDTH;
    const right = left + TAB_WIDTH;
    const next = left < offset ? left : right > offset + railWidth ? right - railWidth : offset;
    if (next !== offset) scrollRef.current?.scrollTo({ x: next, animated: false });
    // Re-seat the selection when the row changes width or tab, without
    // pulling it back while the user browses the rail.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, railWidth, items]);

  return (
    <View style={[styles.outerWrap, isMinimal && styles.minimalOuterWrap, pinned && styles.pinnedOuterWrap, embedded && styles.embeddedOuterWrap]}>
      <View style={[styles.container, isMinimal && styles.minimalContainer, embedded && styles.embeddedContainer]}>
        {!embedded && <NavPillSurface borderRadius={12} />}
        <ScrollView
          ref={scrollRef}
          horizontal
          bounces={false}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          onLayout={event => setRailWidth(event.nativeEvent.layout.width)}
          onScroll={event => setOffset(Math.max(0, Math.min(maxOffset, Math.abs(event.nativeEvent.contentOffset.x))))}
          scrollEventThrottle={32}
        >
          {items.map(item => {
            const focused = item.key === activeKey;
            const iconColor = skin ? focused ? skin.barIconActive : skin.barIcon : colors.foreground;
            return (
              <TouchableOpacity
                key={item.key}
                accessibilityRole="tab"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: focused }}
                onPress={() => onChange(item.key)}
                activeOpacity={0.72}
                style={[styles.tab, focused && styles.tabActive, isMinimal && minimalTab, isMinimal && focused && minimalTabActive]}
              >
                {focused && !isMinimal && <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.2)', 'rgba(255,255,255,0.05)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.indicator} />}
                <Icon name={item.icon} size={18} color={iconColor} strokeWidth={2} />
                <Text numberOfLines={1} style={[styles.count, { color: iconColor }]}>{typeof item.count === "number" ? formatCompactNumber(item.count) : ""}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {(I18nManager.isRTL ? endHidden : startHidden) && <View pointerEvents="none" style={[styles.edge, styles.startEdge]}>
          <BlurView intensity={8} tint="default" style={[styles.edgeBlur, { left: 0 }]} />
          <LinearGradient colors={[edgeColor, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        </View>}
        {(I18nManager.isRTL ? startHidden : endHidden) && <View pointerEvents="none" style={[styles.edge, styles.endEdge]}>
          <BlurView intensity={8} tint="default" style={[styles.edgeBlur, { right: 0 }]} />
          <LinearGradient colors={['transparent', edgeColor]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        </View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrap: { width: "100%", paddingHorizontal: 8, paddingTop: PROFILE_TABS_TOP_GAP, paddingBottom: 16 },
  pinnedOuterWrap: { paddingTop: 0, paddingBottom: 4 },
  embeddedOuterWrap: { flex: 1, width: undefined, minWidth: 0, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  container: { width: "100%", minHeight: TAB_HEIGHT, borderRadius: 12, overflow: 'hidden' },
  embeddedContainer: { backgroundColor: 'transparent' },
  row: { flexDirection: 'row', alignItems: 'center' },
  tab: { width: TAB_WIDTH, height: TAB_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  tabActive: { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  indicator: { ...StyleSheet.absoluteFillObject, borderRadius: 11 },
  count: { textAlign: 'center', fontSize: 10, lineHeight: 12, marginTop: 1, fontWeight: '500' },
  edge: { position: 'absolute', top: 0, bottom: 0, width: 24 },
  startEdge: { left: 0 },
  endEdge: { right: 0 },
  edgeBlur: { position: 'absolute', top: 0, bottom: 0, width: 6, opacity: 0.4 },
  minimalOuterWrap: { paddingHorizontal: 0 },
  minimalContainer: { ...minimalTabStrip, paddingVertical: 0, alignItems: 'flex-end' },
});

export default memo(ProfileTabBarInner) as typeof ProfileTabBarInner;
