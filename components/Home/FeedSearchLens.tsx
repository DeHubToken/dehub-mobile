import { useTranslation as _useCopy } from 'react-i18next';
import React, { memo, useEffect, useRef, useState } from "react";
import { Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import Reanimated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { BlurView } from "expo-blur";
import Icon, { type IconName } from "../ui/Icon";
import { androidFrostSupported, useFrostedSource } from "../ui/FrostedBackdrop";
import { useAppPrefs } from "../../hooks/useAppPrefs";
import type { FeedSearchTab } from "../../libs/feed-search";
import { SNAP_SPRING } from "../../theme/motion";

/**
 * The feed search on the colour themes (everything but System and Minimal),
 * as on web's FeedSearchLens. The lit tab's glass drops out of the pill and
 * lands as a round search lens above the keyboard, with the feed blurred
 * behind it. Once there are words it floats up and docks under the pill, and
 * the results grid shows below it.
 *
 *   [feed icon] [filters] [search box .........] [↑]
 *                      in Images · Drag up to close
 *
 * Closing: the ↑ button, dragging the lens up, tapping the blur, or tapping
 * the lit tab again. The feed icon opens a row of the other feeds.
 */

const ICONS: Record<FeedSearchTab, IconName> = { home: "House", shorts: "Shorts", images: "Image", videos: "Video", music: "Mic" };
const LABELS: Record<FeedSearchTab, string> = { home: "Home", shorts: "Shorts", images: "Images", videos: "Videos", music: "Music" };
const ORDER: FeedSearchTab[] = ["home", "shorts", "images", "videos", "music"];
export const LENS_HEIGHT = 52;
/** Room the results keep free under the docked lens and its caption. */
export const LENS_DOCK_SPACE = LENS_HEIGHT + 34;
const DROP = { damping: 15, stiffness: 170, mass: 0.9 };
const DRAG_CLOSE = 70;
/** A quick flick up closes too, even when it travels less than DRAG_CLOSE. */
const FLICK_CLOSE = 700;

interface FeedSearchLensProps {
  tab: FeedSearchTab;
  query: string;
  onChangeQuery: (q: string) => void;
  onClose: () => void;
  onPickFeed: (tab: FeedSearchTab) => void;
  onFilterPress: () => void;
  filterActive: boolean;
  /** Bottom of the feed pill (screen y): where the lens docks. */
  dockY: number;
  /** The lit tab's centre (screen coords): where the lens drops from. */
  fromX: number;
  fromY: number;
  /** The theme's colour, for the rim glow. */
  accent: string;
}

const FeedSearchLens: React.FC<FeedSearchLensProps> = ({
  tab, query, onChangeQuery, onClose, onPickFeed, onFilterPress, filterActive, dockY, fromX, fromY, accent,
}) => {
  const { t: _copy } = _useCopy();
  const { shorts: shortsEnabled } = useAppPrefs();
  const { width, height } = useWindowDimensions();
  const inputRef = useRef<TextInput>(null);
  const [keyboard, setKeyboard] = useState(0);
  const [picking, setPicking] = useState(false);
  const docked = query.trim().length > 0;
  const blurSource = useFrostedSource();

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (e) => setKeyboard(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboard(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Resting spot: just above the keyboard, never above the pill.
  const restY = Math.max(dockY + 24, Math.min(height - keyboard - LENS_HEIGHT - 64, height * 0.45));
  const targetY = docked ? dockY + 10 : restY;

  const open = useSharedValue(0);
  const top = useSharedValue(fromY - LENS_HEIGHT / 2);
  const drag = useSharedValue(0);
  const closing = useRef(false);

  useEffect(() => {
    open.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.back(1.6)) });
    const id = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!closing.current) top.value = withSpring(targetY, DROP);
  }, [targetY, top]);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    setPicking(false);
    inputRef.current?.blur();
    top.value = top.value + drag.value;
    drag.value = 0;
    top.value = withTiming(fromY - LENS_HEIGHT / 2, { duration: 230, easing: Easing.in(Easing.quad) });
    open.value = withTiming(0, { duration: 230, easing: Easing.in(Easing.quad) }, (done) => { if (done) runOnJS(onClose)(); });
  };

  // Drag up closes from anywhere: the whole lens (its text box and buttons
  // too, not just the thin rim between them) and the blurred feed behind it.
  // Before, the pan only won when the finger landed on the rim's few spare
  // pixels, so dragging the bar itself did nothing.
  const dragUp = () =>
    Gesture.Pan()
      .activeOffsetY([-10, 10])
      .failOffsetX([-24, 24])
      .shouldCancelWhenOutside(false)
      .onUpdate((e) => { drag.value = Math.min(0, e.translationY); })
      .onEnd((e) => {
        if (e.translationY < -DRAG_CLOSE || (e.translationY < -16 && e.velocityY < -FLICK_CLOSE)) {
          runOnJS(close)();
        } else {
          drag.value = withSpring(0, SNAP_SPRING);
        }
      });
  const lensPan = dragUp();
  const blurPan = dragUp();

  const lensStyle = useAnimatedStyle(() => ({
    top: top.value + drag.value,
    opacity: Math.min(1, open.value * 1.6),
    transform: [
      { translateX: (fromX - width / 2) * (1 - open.value) },
      { scale: 0.18 + 0.82 * open.value },
    ],
  }));
  const blurStyle = useAnimatedStyle(() => ({ opacity: open.value }));

  const placeholder = {
    home: _copy("copy.57e2faa5ec63", { defaultValue: "Search DeHub" }),
    shorts: _copy("copy.e8756c6865a5", { defaultValue: "Search shorts" }),
    images: _copy("copy.9e13d826baaf", { defaultValue: "Search images" }),
    videos: _copy("copy.c7661da99c41", { defaultValue: "Search videos" }),
    music: _copy("copy.cbf6f228327c", { defaultValue: "Search music" }),
  }[tab];

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {!docked ? (
        <GestureDetector gesture={blurPan}>
        <Reanimated.View style={[StyleSheet.absoluteFill, { top: dockY }, blurStyle]}>
          {Platform.OS === "ios" || (androidFrostSupported && blurSource) ? (
            <BlurView
              blurTarget={Platform.OS === "android" ? blurSource : undefined}
              blurMethod="dimezisBlurViewSdk31Plus"
              intensity={40}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: Platform.OS === "ios" || blurSource ? "rgba(0,0,0,0.28)" : "rgba(0,0,0,0.62)" }]}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel={_copy("copy.55656b5e434f", { defaultValue: "Close search" })}
          />
        </Reanimated.View>
        </GestureDetector>
      ) : null}

      <Reanimated.View style={[styles.lensHost, lensStyle]} pointerEvents="box-none">
        <GestureDetector gesture={lensPan}>
          <View
            style={[
              styles.rim,
              { borderColor: accent, shadowColor: accent },
            ]}
          >
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.halo, { borderColor: accent }]} />
            <Pressable
              onPress={() => setPicking((v) => !v)}
              style={styles.round}
              accessibilityRole="button"
              accessibilityLabel={_copy("copy.1aa9d734f2ee", { defaultValue: "Choose what to search" })}
              accessibilityState={{ expanded: picking }}
            >
              <Icon name={ICONS[tab]} size={16} color="#FFFFFF" strokeWidth={2} />
            </Pressable>
            <Pressable
              onPress={onFilterPress}
              style={[styles.slot, filterActive ? styles.round : null]}
              accessibilityRole="button"
              accessibilityLabel={_copy("copy.57702fa51a5e", { defaultValue: "Feed filters" })}
              accessibilityState={{ expanded: filterActive }}
            >
              <Icon name="Settings2" size={16 * 1.18} color={filterActive ? "#FFFFFF" : "#A1A1AA"} strokeWidth={filterActive ? 2 : 1.8} />
            </Pressable>
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={onChangeQuery}
              placeholder={placeholder}
              placeholderTextColor="#A1A1AA"
              accessibilityLabel={placeholder}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              onSubmitEditing={() => inputRef.current?.blur()}
              style={styles.input}
            />
            <Pressable
              onPress={close}
              style={styles.slot}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={_copy("copy.55656b5e434f", { defaultValue: "Close search" })}
            >
              <Icon name="ArrowUp" size={18} color="#D4D4D8" strokeWidth={1.9} />
            </Pressable>
          </View>
        </GestureDetector>
        <Text style={styles.caption} pointerEvents="none">
          {_copy("copy.1d7234ff1b79", { defaultValue: "in {{feed}}", feed: LABELS[tab] })}
          {" · "}
          {_copy("copy.e122e5c2b563", { defaultValue: "Drag up to close" })}
        </Text>
        {picking ? (
          <View style={styles.picker}>
            {ORDER.filter((v) => v !== "shorts" || shortsEnabled).map((v) => (
              <Pressable
                key={v}
                onPress={() => { setPicking(false); onPickFeed(v); }}
                style={[styles.pick, v === tab ? styles.round : null]}
                accessibilityRole="button"
                accessibilityLabel={LABELS[v]}
                accessibilityState={{ selected: v === tab }}
              >
                <Icon name={ICONS[v]} size={16} color={v === tab ? "#FFFFFF" : "#A1A1AA"} strokeWidth={2} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </Reanimated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  lensHost: { position: "absolute", left: 16, right: 16, alignItems: "center" },
  rim: {
    width: "100%",
    maxWidth: 560,
    height: LENS_HEIGHT,
    borderRadius: LENS_HEIGHT / 2,
    borderWidth: 1.5,
    backgroundColor: "rgba(14,14,18,0.86)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    gap: 4,
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  halo: { margin: -5, borderRadius: LENS_HEIGHT / 2 + 5, borderWidth: 4, opacity: 0.16 },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.32)",
  },
  slot: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, minWidth: 0, height: 40, fontSize: 15, color: "#FFFFFF", paddingHorizontal: 6, paddingVertical: 0 },
  caption: { marginTop: 6, fontSize: 11, color: "#A1A1AA", textAlign: "center" },
  picker: {
    marginTop: 6,
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderRadius: 24,
    backgroundColor: "rgba(24,24,27,0.95)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
  },
  pick: { width: 44, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});

export default memo(FeedSearchLens);
