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
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../context/ThemeContext";
import MessageSurface from "../DM/MessageSurface";
import Icon, { type IconName } from "./Icon";

/**
 * The hold menu for a chat line or a comment: the held row stays where it is
 * (nothing is redrawn), everything above and below it dims, the list slides up
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
}

const GAP = 12;
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
    lift.value = withTiming(px, { duration: px ? 260 : 200 });
  }, [lift]);
  const measure = useCallback(() => {
    ref.current?.measureInWindow((_x, y) => setTop(y));
  }, []);
  return { style, onLift, ref, top, measure };
}

export default function HoldSheet({ visible, layout, onClose, reactions, onReaction, onMore, tiles, onLift, liftTop }: HoldSheetProps) {
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

  // How far the list slides up so the held row clears the sheet, never past the top bar.
  const lift = useMemo(() => {
    if (!visible || !layout || !sheetH || !onLift) return 0;
    const sheetTop = SCREEN_HEIGHT - insets.bottom - SIDE - sheetH;
    const overlap = layout.y + layout.height - (sheetTop - GAP);
    if (overlap <= 0) return 0;
    const headroom = layout.y - Math.max(insets.top + 56, (liftTop ?? 0) + GAP);
    return Math.max(0, Math.min(overlap, headroom));
  }, [visible, layout, sheetH, onLift, liftTop, SCREEN_HEIGHT, insets.bottom, insets.top]);

  useEffect(() => {
    onLift?.(visible ? lift : 0);
  }, [visible, lift, onLift]);
  // A host that unmounts the sheet instead of hiding it still settles back.
  const liftRef = useRef(onLift);
  liftRef.current = onLift;
  useEffect(() => () => liftRef.current?.(0), []);
  useEffect(() => {
    if (!visible) setSheetH(0);
  }, [visible]);

  if (!visible) return null;

  const cols = Math.min(Math.max(tiles.length, 1), 4);
  const dim = "rgba(0,0,0,0.55)";
  const rowTop = layout ? layout.y - lift : 0;
  const rowH = layout?.height ?? 0;

  return (
    <Modal transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      {/* Dim everything but the held row: one wash above it, one below. */}
      <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel={t("common.close")}>
        {layout ? (
          <>
            <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}
              style={{ position: "absolute", left: 0, right: 0, top: 0, height: Math.max(0, rowTop), backgroundColor: dim }} />
            <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}
              style={{ position: "absolute", left: 0, right: 0, top: rowTop + rowH, bottom: 0, backgroundColor: dim }} />
          </>
        ) : (
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={{ flex: 1, backgroundColor: dim }} />
        )}
      </Pressable>

      {/* Soft glow on the real row, where it sits. Nothing is redrawn. */}
      {layout && (
        <Animated.View
          pointerEvents="none"
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(120)}
          style={{
            position: "absolute",
            left: 6,
            right: 6,
            top: rowTop,
            height: rowH,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: rgba(ink, 0.18),
            backgroundColor: rgba(ink, 0.06),
          }}
        />
      )}

      <Animated.View
        entering={SlideInDown.duration(240)}
        exiting={SlideOutDown.duration(180)}
        onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}
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

            {tiles.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4, paddingTop: reactions && onReaction ? 10 : 0 }}>
                {tiles.map((tile) => {
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
          </View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}
