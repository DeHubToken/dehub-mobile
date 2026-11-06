import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Modal, Pressable, useWindowDimensions } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../context/ThemeContext";
import MessageSurface from "../DM/MessageSurface";
import Icon, { type IconName } from "./Icon";

/**
 * The hold menu for a chat line or a comment: the held row stays where it is,
 * unframed (nothing is redrawn), everything above and below it dims, the list slides up
 * so the row clears a glass bottom sheet, and the sheet carries the reactions
 * and the actions. The old menus drew a second card of the row over the real
 * one, which on Android (no blur) read as the message twice.
 * Used by live chat and comments. Mirrors dehubweb ChatHoldSheet.
 */

export interface HoldLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HoldTile {
  key: string;
  icon: IconName;
  label: string;
  onPress: () => void;
  /** The one filled tile (Reply). */
  prime?: boolean;
  destructive?: boolean;
  /** A wide pill on the row under the tiles (Pin, Ban, Delete), not a tile. */
  secondary?: boolean;
}

export interface HoldReactionChip {
  key: string;
  emoji: string;
  selected?: boolean;
}

interface HoldSheetProps {
  visible: boolean;
  layout: HoldLayout | null;
  onClose: () => void;
  /** Reaction row; null hides it (own comment, signed out). */
  reactions: HoldReactionChip[] | null;
  onReaction?: (key: string) => void;
  /** The "+" at the end of the row, for a full picker. Omit to hide it. */
  onMore?: () => void;
  tiles: HoldTile[];
  /** How far the host should slide its list up so the row clears the sheet (0 to settle back). */
  onLift?: (px: number) => void;
  /** Window y the lifted row must stay below (top of a half-height sheet). Defaults to under the top bar. */
  liftTop?: number;
  /** Draw the held row in a glowing card (live chat). Comments keep it bare. */
  frame?: boolean;
}

const GAP = 12;
/**
 * One timing for the list slide and the dim/frame over it, so the frame never
 * snaps to the lifted row while the list is still sliding underneath.
 */
export const HOLD_LIFT_TIMING = { duration: 260, easing: Easing.out(Easing.cubic) };
export const HOLD_SETTLE_TIMING = { duration: 200, easing: Easing.out(Easing.cubic) };
const SIDE = 8;
const rgba = (c: readonly number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/**
 * For a host list: wrap it in an Animated.View with `style` and `ref`, call
 * `measure()` when a row is held, and pass `onLift` and `top` (as liftTop) to
 * the sheet.
 */
export function useHoldLift() {
  const lift = useSharedValue(0);
  const ref = useRef<View>(null);
  const [top, setTop] = useState<number | undefined>(undefined);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -lift.value }] }));
  const onLift = useCallback((px: number) => {
    lift.value = withTiming(px, px ? HOLD_LIFT_TIMING : HOLD_SETTLE_TIMING);
  }, [lift]);
  const measure = useCallback(() => {
    ref.current?.measureInWindow((_x, y) => setTop(y));
  }, []);
  return { style, onLift, ref, top, measure };
}

export default function HoldSheet({ visible, layout, onClose, reactions, onReaction, onMore, tiles, onLift, liftTop, frame }: HoldSheetProps) {
  // A row that could not be measured comes in as an empty box: treat it as unknown.
  if (layout && !(layout.height > 0)) layout = null;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  // Colours are written for dark, like the rest of the app: under System
  // Light the JSX tone pass turns them into their daylight versions.
  const { skin, accent, isLight } = useAppTheme();
  const ink = [244, 244, 245];
  const inkColor = rgba(ink, 1);
  const chipFill = rgba(ink, 0.1);
  // Reply is the one filled tile: the theme colour on canvas themes, white on
  // System and ink on System Light, as on web. That tile opts out of the
  // theme passes (dark-surface), so its daylight colours are written here.
  const primeFill = skin ? rgba(accent, 1) : isLight ? "#0b0b0d" : "#ffffff";
  const primeInk = skin
    ? (accent[0] * 0.299 + accent[1] * 0.587 + accent[2] * 0.114 > 150 ? "#000000" : "#ffffff")
    : isLight ? "#ffffff" : "#000000";

  const [sheetH, setSheetH] = useState(0);
  // Where the sheet really sits, from its own layout: the window height can
  // leave out the gesture bar on edge-to-edge Android, which put the sheet's
  // top lower than the maths thought and let it cover the held line.
  const [sheetY, setSheetY] = useState(0);

  // How far the list slides up so the held row clears the sheet, never past the top bar.
  const lift = useMemo(() => {
    if (!visible || !layout || !sheetH || !onLift) return 0;
    const sheetTop = sheetY > 0 ? sheetY : SCREEN_HEIGHT - insets.bottom - SIDE - sheetH;
    const overlap = layout.y + layout.height - (sheetTop - GAP);
    if (overlap <= 0) return 0;
    const headroom = layout.y - Math.max(insets.top + 56, (liftTop ?? 0) + GAP);
    return Math.max(0, Math.min(overlap, headroom));
  }, [visible, layout, sheetH, sheetY, onLift, liftTop, SCREEN_HEIGHT, insets.bottom, insets.top]);

  // The dim and the frame ride the same slide as the host's list.
  const overlayLift = useSharedValue(0);
  const overlayStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -overlayLift.value }] }));
  useEffect(() => {
    const px = visible ? lift : 0;
    onLift?.(px);
    overlayLift.value = withTiming(px, px ? HOLD_LIFT_TIMING : HOLD_SETTLE_TIMING);
  }, [visible, lift, onLift, overlayLift]);
  // A host that unmounts the sheet instead of hiding it still settles back.
  const liftRef = useRef(onLift);
  liftRef.current = onLift;
  useEffect(() => () => liftRef.current?.(0), []);
  useEffect(() => {
    if (!visible) { setSheetH(0); setSheetY(0); }
  }, [visible]);

  if (!visible) return null;

  const mainTiles = tiles.filter((tile) => !tile.secondary);
  const sideTiles = tiles.filter((tile) => tile.secondary);
  const cols = Math.min(Math.max(mainTiles.length, 1), 4);
  const dim = "rgba(0,0,0,0.55)";
  // Drawn at the row's resting place; overlayStyle slides it with the list.
  const rowTop = layout ? layout.y : 0;
  const rowH = layout?.height ?? 0;

  return (
    <Modal transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      {/* Dim everything but the held row: one wash above it, one below. */}
      <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel={t("common.close")}>
        {layout ? (
          <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }, overlayStyle]}>
            {/* The washes run past the screen edges so the slide never opens a gap. */}
            <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)}
              style={{ position: "absolute", left: 0, right: 0, top: -SCREEN_HEIGHT, height: Math.max(0, rowTop) + SCREEN_HEIGHT, backgroundColor: dim }} />
            <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)}
              style={{ position: "absolute", left: 0, right: 0, top: rowTop + rowH, height: SCREEN_HEIGHT * 2, backgroundColor: dim }} />
            {/* The held line glows in place: a soft card around the real row. */}
            {frame ? (
              <Animated.View
                entering={FadeIn.duration(160)}
                exiting={FadeOut.duration(140)}
                style={{
                  position: "absolute", left: SIDE, right: SIDE, top: rowTop - 2, height: rowH + 4,
                  borderRadius: 18, borderWidth: 1, borderColor: rgba(ink, 0.16),
                  backgroundColor: rgba(ink, 0.06),
                  shadowColor: "#ffffff", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
                }}
              />
            ) : null}
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} style={{ flex: 1, backgroundColor: dim }} />
        )}
      </Pressable>

      <Animated.View
        entering={SlideInDown.duration(260).easing(Easing.out(Easing.cubic))}
        exiting={SlideOutDown.duration(200).easing(Easing.in(Easing.cubic))}
        onLayout={(e) => { setSheetH(e.nativeEvent.layout.height); setSheetY(e.nativeEvent.layout.y); }}
        style={{ position: "absolute", left: SIDE, right: SIDE, bottom: insets.bottom + SIDE }}
      >
        <Pressable>
          <View style={{ borderRadius: 28, overflow: "hidden", borderWidth: 1, borderColor: rgba(ink, 0.12), paddingHorizontal: 14, paddingTop: 10, paddingBottom: 16 }}>
            <MessageSurface radius={28} />
            <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: rgba(ink, 0.3), marginBottom: 12 }} />

            {reactions && onReaction && (
              <View style={{ flexDirection: "row", justifyContent: "space-between", paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: rgba(ink, 0.1) }}>
                {reactions.map((r) => (
                  <TouchableOpacity
                    key={r.key}
                    onPress={() => onReaction(r.key)}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityState={{ selected: !!r.selected }}
                    style={{
                      width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
                      backgroundColor: r.selected ? "rgba(56,189,248,0.25)" : chipFill,
                      borderWidth: r.selected ? 1.5 : 0, borderColor: "rgba(56,189,248,0.6)",
                    }}
                  >
                    <Text style={{ fontSize: 24 }}>{r.emoji}</Text>
                  </TouchableOpacity>
                ))}
                {onMore && (
                  <TouchableOpacity
                    onPress={onMore}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityLabel={t("emojiPicker.moreReactions")}
                    style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: chipFill }}
                  >
                    <Icon name="Plus" size={20} color={inkColor} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {mainTiles.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4, paddingTop: reactions && onReaction ? 10 : 0 }}>
                {mainTiles.map((tile) => {
                  const fg = tile.prime ? primeInk : tile.destructive ? "#f87171" : inkColor;
                  return (
                    <View key={tile.key} style={{ width: `${100 / cols}%`, padding: 4 }}>
                      <TouchableOpacity
                        // The filled Reply tile keeps its own fill and label
                        // (the theme pass would repaint a white fill as a
                        // neutral control).
                        className={tile.prime ? "dark-surface" : undefined}
                        onPress={tile.onPress}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={tile.label}
                        style={{
                          borderRadius: 16, paddingTop: 12, paddingBottom: 10, paddingHorizontal: 4,
                          alignItems: "center", gap: 6,
                          backgroundColor: tile.prime ? primeFill : chipFill,
                        }}
                      >
                        <Icon name={tile.icon} size={20} color={fg} />
                        <Text numberOfLines={1} style={{ color: fg, fontSize: 12, fontWeight: "700" }}>{tile.label}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Pin, Ban, Delete: wide pills under the tiles, as in the picked design. */}
            {sideTiles.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4, paddingTop: 4 }}>
                {sideTiles.map((tile) => {
                  const fg = tile.destructive ? "#f87171" : inkColor;
                  return (
                    <View key={tile.key} style={{ width: sideTiles.length === 1 ? "100%" : "50%", padding: 4 }}>
                      <TouchableOpacity
                        onPress={tile.onPress}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={tile.label}
                        style={{ height: 44, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: chipFill }}
                      >
                        <Icon name={tile.icon} size={17} color={fg} />
                        <Text numberOfLines={1} style={{ color: fg, fontSize: 13, fontWeight: "600" }}>{tile.label}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}
