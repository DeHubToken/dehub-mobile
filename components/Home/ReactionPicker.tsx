/**
 * Reaction Picker
 * ===============
 * The reaction drawer that opens when you hold the thumbs-up on a post, short
 * or comment. It carries EVERY reaction — the positive faces, a thin divider,
 * then 👎 last — each with its running total under it. There is no separate
 * thumbs-down button; this tray is where a downvote is cast.
 *
 * WHY IT IS A DRAWER
 * It used to be a tray hung off the thumb as an absolutely-positioned view.
 * An absolute child is laid out inside its parent's width, and the parent here
 * is a single ~40pt button, so on Android the tray was squeezed down to less
 * than one emoji and the rest scrolled out of sight. A bottom drawer in a Modal
 * is sized by the screen, not by whatever button opened it, so every reaction
 * is on screen at full size wherever the host sits.
 *
 * The long press opens it and a separate tap picks, so the Modal taking the
 * touch responder away from the pressed thumb costs nothing.
 *
 * The host still owns `open`. `onClose` is how the backdrop, the back button
 * and a downward swipe hand that back.
 *
 * THE KEYBOARD
 * A Modal is its own Android window. When it closes, the screen underneath
 * gets window focus back, and Android re-attaches the keyboard to whatever
 * text box there still holds focus (a comment box whose keyboard was hidden
 * with the back button keeps focus). So picking 👎 popped the keyboard up and
 * the screen jumped to make room for it. Opening the tray now blurs that box,
 * and for a moment after it closes any keyboard that shows up is sent away.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "../../context/AuthContext";
import { markReactionTipSeen } from "../../libs/reaction-tip";
import { useTranslation } from "react-i18next";
import { Keyboard, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../ui/Icon";
import IosGlassPill from "../ui/IosGlassPill";
import SheetGlass, { useDrawerGlass } from "../ui/SheetGlass";
import { useDrawerBlurSource } from "../ui/FrostedBackdrop";
import { SHEET_GLASS_BORDER } from "../../theme/sheetGlass";
import { useAppTheme } from "../../context/ThemeContext";
import { formatCompactNumber } from "../../libs/numbers.util";
import {
  TRAY_REACTION_LIST,
  type PostReaction,
  type ReactionCounts,
} from "../../libs/reactions";
import { ReactionEmoji } from "./ReactionEmoji";

/** Wash over the iOS blur — dark enough that the white counts stay legible. */
const IOS_GLASS_TINT = "rgba(8,8,10,0.55)";
const SELECTED_BG = "#FFFFFF14";
const DIVIDER = "#FFFFFF2E";

/** How long after the tray closes a keyboard that appears is treated as stray. */
const STRAY_KEYBOARD_MS = 700;
// How long iOS needs to finish taking a Modal down before it will present another.
const IOS_MODAL_HANDOFF_MS = 120;

/** Badge-style corners: the card at 12, each reaction tile at 10. */
const SHEET_RADIUS = 12;
const TILE_RADIUS = 10;

/** Tiles per row — five puts the nine faces and 👎 on two even rows. */
const COLUMNS = 5;
const SHEET_PADDING = 12;
const SHEET_MARGIN = 12;
const TILE_GAP = 8;
// The sheet's 1px left and right borders sit inside its width.
const SHEET_BORDER_X = 2;

interface ReactionPickerProps {
  open: boolean;
  /** The reaction the viewer currently holds, highlighted in the drawer. */
  current: PostReaction | null;
  onSelect: (reaction: PostReaction) => void;
  /** Backdrop, back button or swipe-down. Hosts without it close on select only. */
  onClose?: () => void;
  /** Kept for host compatibility — the drawer spans the screen either way. */
  align?: "left" | "right";
  /**
   * Opens the who-reacted-what breakdown. Passed only on your own posts — that
   * list belongs to the author, and the API refuses it to everyone else.
   */
  onShowInfo?: () => void;
  /** Per-reaction totals, drawn under each emoji. Missing keys read as 0. */
  counts?: ReactionCounts | null;
  /**
   * Limit the tray to these reactions (still in tray order). Hosts whose API
   * only knows the plain pair pass `["like", "dislike"]`.
   */
  only?: readonly PostReaction[];
}

/**
 * Every feed card carries one of these, closed. The sheet's hooks (shared
 * values, animated styles, a pan gesture, inset and window subscriptions) cost
 * each card four Reanimated mappers on the UI thread even with nothing on
 * screen, so they exist only from the long-press until the sheet has slid away.
 */
const ReactionPickerComponent: React.FC<ReactionPickerProps> = (props) => {
  const [alive, setAlive] = useState(props.open);
  if (props.open && !alive) setAlive(true);
  const handleClosed = useCallback(() => setAlive(false), []);
  return alive ? <ReactionSheet {...props} onClosed={handleClosed} /> : null;
};

const ReactionSheet: React.FC<ReactionPickerProps & { onClosed: () => void }> = ({
  open,
  current,
  onSelect,
  onClose,
  onShowInfo,
  counts,
  only,
  onClosed,
}) => {
  const { t } = useTranslation();
  const user = useUser();
  const walletAddress = user?.walletAddress || user?.address;
  useEffect(() => {
    if (open) markReactionTipSeen(walletAddress);
  }, [open, walletAddress]);
  const { colors } = useAppTheme();
  const drawerGlass = useDrawerGlass();
  const drawerSource = useDrawerBlurSource();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const reactions = only ? TRAY_REACTION_LIST.filter((r) => only.includes(r.key)) : TRAY_REACTION_LIST;
  /** Where the divider goes: before the first negative, never at the start. */
  const firstNegative = reactions.findIndex((r) => !r.positive);

  // Stay mounted through the closing slide, then drop the Modal.
  const [mounted, setMounted] = useState(open);
  // "See who reacted" opens its own Modal. iOS cannot present a Modal while
  // this one is still up or sliding away: the new one never shows and the
  // closing tray's backdrop keeps every touch, so the screen froze. The info
  // sheet opens only once this Modal is gone.
  const pendingInfo = useRef<(() => void) | null>(null);
  const finishClose = useCallback(() => {
    setMounted(false);
    onClosed();
    const show = pendingInfo.current;
    pendingInfo.current = null;
    if (show) setTimeout(show, Platform.OS === "ios" ? IOS_MODAL_HANDOFF_MS : 0);
  }, [onClosed]);
  const translateY = useSharedValue(screenHeight);
  const backdrop = useSharedValue(0);

  // Nothing should be typing while the tray is up; see THE KEYBOARD above.
  useEffect(() => {
    if (!open) return;
    // Blurs the focused box, not just the keys, so nothing is left to refocus.
    Keyboard.dismiss();
    if (Platform.OS !== "android") return;
    return () => {
      const sub = Keyboard.addListener("keyboardDidShow", () => Keyboard.dismiss());
      setTimeout(() => sub.remove(), STRAY_KEYBOARD_MS);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      translateY.value = screenHeight;
      translateY.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
      backdrop.value = withTiming(1, { duration: 220 });
    } else if (mounted) {
      backdrop.value = withTiming(0, { duration: 160 });
      translateY.value = withTiming(
        screenHeight,
        { duration: 200, easing: Easing.in(Easing.cubic) },
        (done) => { if (done) runOnJS(finishClose)(); },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const requestClose = useCallback(() => { onClose?.(); }, [onClose]);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 80 || e.velocityY > 800) {
        runOnJS(requestClose)();
      } else {
        translateY.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  if (!mounted) return null;

  const sheetWidth = Math.min(screenWidth - SHEET_MARGIN * 2, 520);
  const tile = Math.floor(
    (sheetWidth - SHEET_BORDER_X - SHEET_PADDING * 2 - TILE_GAP * (COLUMNS - 1)) / COLUMNS,
  );
  // iOS gets the shared glass; Android has no safe backdrop blur and keeps a
  // solid theme surface so nothing behind the tray reads through the counts.
  const glass = Platform.OS === "ios";
  // Android blurs the feed behind it, as the comment drawer does, whenever a
  // feed is there to sample; elsewhere it keeps the solid surface.
  const androidGlass = !glass && drawerGlass && !!drawerSource;
  const surface = glass || androidGlass
    ? { backgroundColor: "transparent", borderColor: "transparent" }
    : { backgroundColor: colors.card, borderColor: colors.border };

  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={requestClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={requestClose}
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
          />
        </Animated.View>

        <Animated.View
          accessibilityRole="menu"
          accessibilityLabel={t("reactionInfo.title")}
          style={[
            styles.sheet,
            surface,
            { width: sheetWidth, bottom: insets.bottom + SHEET_MARGIN },
            sheetStyle,
          ]}
        >
          {glass && <IosGlassPill tint={IOS_GLASS_TINT} borderRadius={SHEET_RADIUS} />}
          {androidGlass && (
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.androidGlass]}>
              <SheetGlass />
            </View>
          )}
          <GestureDetector gesture={pan}>
            <View style={styles.grabberZone}>
              <View style={styles.grabber} />
              <Text style={[styles.title, { color: colors.foreground }]}>{t("reactionInfo.title")}</Text>
            </View>
          </GestureDetector>

          <View style={styles.grid}>
            {reactions.map((reaction, index) => {
              const selected = current === reaction.key;
              const count = Math.max(0, counts?.[reaction.key] ?? 0);
              return (
                <Pressable
                  key={reaction.key}
                  accessibilityRole="menuitem"
                  accessibilityLabel={`${t(`reactionInfo.labels.${reaction.key}`, { defaultValue: reaction.label })}, ${count}`}
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(reaction.key)}
                  style={({ pressed }) => [
                    styles.tile,
                    { width: tile, height: tile + 6 },
                    selected && styles.tileSelected,
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  {/* The thin line between the faces and the downvote. It sits
                      in the gap before 👎, so the grid keeps its columns. */}
                  {index === firstNegative && index > 0 && (
                    <View pointerEvents="none" style={styles.divider} />
                  )}
                  <ReactionEmoji
                    reaction={reaction.key}
                    animate={selected}
                    size={34}
                    textStyle={{ fontSize: 28, lineHeight: 34 }}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.count,
                      { color: count > 0 ? colors.foreground : colors.mutedForeground },
                      count === 0 && styles.countZero,
                    ]}
                  >
                    {formatCompactNumber(count)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Author-only breakdown of who reacted what. */}
          {onShowInfo && (
            <Pressable
              accessibilityRole="menuitem"
              onPress={() => {
                pendingInfo.current = onShowInfo ?? null;
                requestClose();
              }}
              style={({ pressed }) => [styles.infoRow, { borderColor: colors.border }, pressed && { opacity: 0.6 }]}
            >
              <Icon name="Info" size={18} color="#8B8D90" strokeWidth={1.9} />
              <Text style={styles.infoText}>{t("feedCard.seeWhoReacted")}</Text>
            </Pressable>
          )}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { backgroundColor: "#000000A6" },
  androidGlass: { borderRadius: SHEET_RADIUS, overflow: "hidden", borderWidth: 1, borderColor: SHEET_GLASS_BORDER },
  sheet: {
    position: "absolute",
    alignSelf: "center",
    borderRadius: SHEET_RADIUS,
    borderWidth: 1,
    paddingHorizontal: SHEET_PADDING,
    paddingBottom: SHEET_PADDING,
  },
  grabberZone: { alignItems: "center", paddingTop: 8, paddingBottom: 10 },
  grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#FFFFFF33", marginBottom: 10 },
  title: { fontSize: 14, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: TILE_GAP },
  tile: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: TILE_RADIUS,
    backgroundColor: "#FFFFFF08",
    borderWidth: 1,
    borderColor: "transparent",
  },
  tileSelected: { backgroundColor: SELECTED_BG, borderColor: "#FFFFFF40" },
  divider: {
    position: "absolute",
    left: -(TILE_GAP / 2) - 1,
    top: 10,
    bottom: 10,
    width: StyleSheet.hairlineWidth * 2,
    backgroundColor: DIVIDER,
  },
  count: { fontSize: 11, lineHeight: 13, fontWeight: "600", fontVariant: ["tabular-nums"] },
  countZero: { opacity: 0.45, fontWeight: "500" },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: TILE_RADIUS,
    borderWidth: 1,
  },
  infoText: { color: "#C9CACC", fontSize: 14, fontWeight: "500" },
});

const ReactionPicker = memo(ReactionPickerComponent);
export default ReactionPicker;
