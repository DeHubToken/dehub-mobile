import React, { memo, useEffect, useRef, useState } from "react";
import { I18nManager, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Icon, { type IconName } from "../ui/Icon";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import NavPillSurface from "../ui/NavPillSurface";
import { PINNED_PROFILE_TABS_HEIGHT, PROFILE_TABS_TOP_GAP } from "./useProfileCollapse";
import { formatCompactNumber } from "../../libs/numbers.util";
import { useAppTheme } from "../../context/ThemeContext";
import { minimalTab, minimalTabActive, minimalTabStrip } from "../../theme/minimal";
import { resolveEdgeFadeMask } from "../../libs/edgeFadeMask";

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
  const compact = pinned || embedded;
  const scrollRef = useRef<ScrollView>(null);
  const [railWidth, setRailWidth] = useState(0);
  const [offset, setOffset] = useState(0);
  const contentWidth = items.length * TAB_WIDTH;
  const maxOffset = Math.max(0, contentWidth - railWidth);
  const startHidden = compact && offset > 1;
  const endHidden = compact && maxOffset - offset > 1;
  const mask = resolveEdgeFadeMask({
    start: I18nManager.isRTL ? endHidden : startHidden,
    end: I18nManager.isRTL ? startHidden : endHidden,
  }, railWidth);

  useEffect(() => {
    if (!compact || !railWidth) return;
    const index = Math.max(0, items.findIndex(item => item.key === activeKey));
    const left = index * TAB_WIDTH;
    const right = left + TAB_WIDTH;
    const next = left < offset ? left : right > offset + railWidth ? right - railWidth : offset;
    if (next !== offset) scrollRef.current?.scrollTo({ x: next, animated: false });
    // Re-seat the selection when the row changes width or tab, without
    // pulling it back while the user browses the rail.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, railWidth, items, compact]);

  const tabButtons = items.map(item => {
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
        style={[styles.tab, !compact && styles.expandedTab, !isMinimal && !skin && !focused && styles.tabIdle, isMinimal && minimalTab, isMinimal && focused && minimalTabActive]}
      >
        {/* "Beam": a short glowing line under the selected tab, in the tab's
            own ink, instead of a box behind it. Minimal keeps its folder tab. */}
        {focused && !isMinimal && <View pointerEvents="none" style={[styles.beam, { backgroundColor: iconColor, shadowColor: iconColor }]} />}
        <Icon name={item.icon} size={18} color={iconColor} strokeWidth={2} />
        <Text numberOfLines={1} style={[styles.count, { color: iconColor }]}>{typeof item.count === "number" ? formatCompactNumber(item.count) : ""}</Text>
      </TouchableOpacity>
    );
  });

  return (
    <View style={[styles.outerWrap, isMinimal && styles.minimalOuterWrap, pinned && styles.pinnedOuterWrap, embedded && styles.embeddedOuterWrap]}>
      <View style={[styles.container, isMinimal && styles.minimalContainer, embedded && styles.embeddedContainer]}>
        {!embedded && <NavPillSurface borderRadius={12} />}
        {compact ? <MaskedView
          style={styles.railMask}
          androidRenderingMode="software"
          maskElement={
            <LinearGradient
              colors={(mask?.colors ?? ['#000', '#000']) as [string, string, ...string[]]}
              locations={(mask?.locations ?? [0, 1]) as [number, number, ...number[]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          }
        >
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
            {tabButtons}
          </ScrollView>
        </MaskedView> : <View style={[styles.row, styles.expandedRow]}>{tabButtons}</View>}
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
  railMask: { width: '100%', height: TAB_HEIGHT },
  row: { flexDirection: 'row', alignItems: 'center' },
  expandedRow: { width: '100%' },
  tab: { width: TAB_WIDTH, height: TAB_HEIGHT, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  expandedTab: { flex: 1, width: undefined },
  tabIdle: { opacity: 0.5 },
  beam: { position: 'absolute', bottom: 2, left: '30%', right: '30%', height: 3, borderRadius: 3, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  count: { textAlign: 'center', fontSize: 10, lineHeight: 12, marginTop: 1, fontWeight: '500' },
  minimalOuterWrap: { paddingHorizontal: 0 },
  minimalContainer: { ...minimalTabStrip, paddingVertical: 0, alignItems: 'flex-end' },
});

export default memo(ProfileTabBarInner) as typeof ProfileTabBarInner;
