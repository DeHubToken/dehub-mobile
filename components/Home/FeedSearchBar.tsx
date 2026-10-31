import { useTranslation as _useCopy } from 'react-i18next';
import React, { memo, useEffect, useRef } from "react";
import { View, Pressable, StyleSheet, TextInput } from "react-native";
import Reanimated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Icon, { type IconName } from "../ui/Icon";
import GlassIndicator, { GLASS_SHADOW } from "../ui/GlassIndicator";
import type { FeedSearchTab } from "../../libs/feed-search";
import { useAppPrefs } from "../../hooks/useAppPrefs";

/**
 * What the feed pill turns into when the lit tab is tapped again, as on web:
 *
 *   [feed icon] [filters] [search box ...........] [x]
 *
 * It melts out of the tapped tab: a clip that starts at that tab's box and
 * opens to the full pill while the tab row fades. The feed icon is the lit tab
 * that opened the search, so tapping it again closes the search (a toggle).
 * Holding it moves the search to the next feed (the pill clips anything hung
 * below it, so no menu); the filters button is the pill's own filter toggle.
 */

const ICONS: Record<FeedSearchTab, IconName> = { home: "House", shorts: "Shorts", images: "Image", videos: "Video", music: "Mic" };
const ORDER: FeedSearchTab[] = ["home", "shorts", "images", "videos", "music"];
const MELT = { duration: 340, easing: Easing.bezier(0.16, 1, 0.3, 1) };
const UNMELT = { duration: 220, easing: Easing.bezier(0.4, 0, 1, 1) };

interface FeedSearchBarProps {
  tab: FeedSearchTab;
  query: string;
  onChangeQuery: (q: string) => void;
  onClose: () => void;
  onPickFeed: (tab: FeedSearchTab) => void;
  onFilterPress: () => void;
  filterActive: boolean;
  /** Pill width, and the tapped tab's box in it: where the melt starts. */
  width: number;
  fromX: number;
  fromWidth: number;
  /** A canvas theme's icon colours. */
  tint?: { on: string; off: string };
  /** A canvas theme's active-tab look, used for the feed icon's bubble. */
  activeStyle?: object;
}

const FeedSearchBar: React.FC<FeedSearchBarProps> = ({
  tab, query, onChangeQuery, onClose, onPickFeed, onFilterPress, filterActive, width, fromX, fromWidth, tint, activeStyle,
}) => {
  const { t: _copy } = _useCopy();
  const { shorts: shortsEnabled } = useAppPrefs();
  const order = shortsEnabled ? ORDER : ORDER.filter((t) => t !== "shorts");
  const inputRef = useRef<TextInput>(null);
  const open = useSharedValue(0);
  const on = tint?.on ?? "#FFFFFF";
  const off = tint?.off ?? "#808089";

  useEffect(() => {
    open.value = withTiming(1, MELT);
    const id = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, [open]);

  const close = () => {
    inputRef.current?.blur();
    open.value = withTiming(0, UNMELT, (done) => { if (done) runOnJS(onClose)(); });
  };

  // The clip slides and widens from the tab to the pill; the content inside is
  // counter-shifted so it stays put and is revealed rather than squeezed.
  const clipStyle = useAnimatedStyle(() => {
    const left = fromX * (1 - open.value);
    return { left, width: fromWidth + (width - fromWidth) * open.value };
  });
  const innerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -fromX * (1 - open.value) }] }));

  const placeholder = {
    home: _copy("copy.57e2faa5ec63", { defaultValue: "Search DeHub" }),
    shorts: _copy("copy.e8756c6865a5", { defaultValue: "Search shorts" }),
    images: _copy("copy.9e13d826baaf", { defaultValue: "Search images" }),
    videos: _copy("copy.c7661da99c41", { defaultValue: "Search videos" }),
    music: _copy("copy.cbf6f228327c", { defaultValue: "Search music" }),
  }[tab];

  const bubble = (
    activeStyle
      ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, activeStyle]} />
      : <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 10 }, GLASS_SHADOW]}><GlassIndicator borderRadius={10} /></View>
  );

  return (
    <Reanimated.View style={[styles.clip, clipStyle]}>
      <Reanimated.View style={[styles.row, { width }, innerStyle]}>
        <Pressable
          onPress={close}
          onLongPress={() => onPickFeed(order[(order.indexOf(tab) + 1) % order.length])}
          delayLongPress={400}
          style={styles.slot}
          accessibilityRole="button"
          accessibilityLabel={_copy("copy.55656b5e434f", { defaultValue: "Close search" })}
        >
          {bubble}
          <Icon name={ICONS[tab]} size={16} color={on} strokeWidth={2} />
        </Pressable>
        <Pressable
          onPress={onFilterPress}
          style={styles.slot}
          accessibilityRole="button"
          accessibilityLabel={_copy("copy.57702fa51a5e", { defaultValue: "Feed filters" })}
          accessibilityState={{ expanded: filterActive }}
        >
          {filterActive ? bubble : null}
          <Icon name="Settings2" size={16 * 1.18} color={filterActive ? on : off} strokeWidth={filterActive ? 2 : 1.8} />
        </Pressable>
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={onChangeQuery}
          placeholder={placeholder}
          placeholderTextColor={off}
          accessibilityLabel={placeholder}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          onSubmitEditing={() => inputRef.current?.blur()}
          style={[styles.input, { color: on }]}
        />
        <Pressable
          onPress={close}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel={_copy("copy.55656b5e434f", { defaultValue: "Close search" })}
          hitSlop={6}
        >
          <Icon name="X" size={16} color={off} strokeWidth={1.8} />
        </Pressable>
      </Reanimated.View>
    </Reanimated.View>
  );
};

const styles = StyleSheet.create({
  clip: { position: "absolute", top: 0, bottom: 0, overflow: "hidden", borderRadius: 12 },
  row: { flexDirection: "row", alignItems: "center", height: "100%", paddingHorizontal: 4, gap: 4 },
  slot: { width: 40, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  input: { flex: 1, minWidth: 0, height: 36, fontSize: 15, paddingHorizontal: 6, paddingVertical: 0 },
  close: { width: 34, height: 30, alignItems: "center", justifyContent: "center" },
});

export default memo(FeedSearchBar);
