/**
 * Reaction Picker
 * ===============
 * The reaction drawer that opens when you hold a thumb on a post, short or
 * comment.
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
 */

import React, { memo, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
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
import {
  NEGATIVE_REACTION_LIST,
  POSITIVE_REACTION_LIST,
  type PostReaction,
} from "../../libs/reactions";
import { ReactionEmoji } from "./ReactionEmoji";

const SHEET_BG = "#0A0A0B";
const BORDER = "#FFFFFF1A";
const SELECTED_BG = "#FFFFFF14";

/** Tiles per row — four keeps each one a comfortable thumb target. */
const COLUMNS = 4;
const SHEET_PADDING = 16;
const TILE_GAP = 8;

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
  /**
   * Which thumb this drawer hangs off. The positive one wears the faces that
   * count as a like; the negative one wears the downvote — see the note on
   * POSITIVE_REACTION_LIST for why they are not one set.
   */
  polarity?: "positive" | "negative";
}

const ReactionPickerComponent: React.FC<ReactionPickerProps> = ({
  open,
  current,
  onSelect,
  onClose,
  onShowInfo,
  polarity = "positive",
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const reactions = polarity === "negative" ? NEGATIVE_REACTION_LIST : POSITIVE_REACTION_LIST;

  // Stay mounted through the closing slide, then drop the Modal.
  const [mounted, setMounted] = useState(open);
  const translateY = useSharedValue(screenHeight);
  const backdrop = useSharedValue(0);

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
        (done) => { if (done) runOnJS(setMounted)(false); },
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

  const sheetWidth = Math.min(screenWidth, 520);
  const tile = Math.floor(
    (sheetWidth - SHEET_PADDING * 2 - TILE_GAP * (COLUMNS - 1)) / COLUMNS,
  );

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
            { width: sheetWidth, paddingBottom: insets.bottom + SHEET_PADDING },
            sheetStyle,
          ]}
        >
          <GestureDetector gesture={pan}>
            <View style={styles.grabberZone}>
              <View style={styles.grabber} />
              <Text style={styles.title}>{t("reactionInfo.title")}</Text>
            </View>
          </GestureDetector>

          <View style={styles.grid}>
            {reactions.map((reaction) => {
              const selected = current === reaction.key;
              return (
                <Pressable
                  key={reaction.key}
                  accessibilityRole="menuitem"
                  accessibilityLabel={reaction.label}
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(reaction.key)}
                  style={({ pressed }) => [
                    styles.tile,
                    { width: tile, height: tile },
                    selected && styles.tileSelected,
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <ReactionEmoji
                    reaction={reaction.key}
                    animate={selected}
                    size={44}
                    textStyle={{ fontSize: 36, lineHeight: 44 }}
                  />
                </Pressable>
              );
            })}
          </View>

          {/* Author-only breakdown of who reacted what. */}
          {onShowInfo && (
            <Pressable
              accessibilityRole="menuitem"
              onPress={onShowInfo}
              style={({ pressed }) => [styles.infoRow, pressed && { opacity: 0.6 }]}
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
  sheet: {
    position: "absolute",
    bottom: 0,
    alignSelf: "center",
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: BORDER,
    paddingHorizontal: SHEET_PADDING,
  },
  grabberZone: { alignItems: "center", paddingTop: 10, paddingBottom: 14 },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#FFFFFF33", marginBottom: 12 },
  title: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: TILE_GAP },
  tile: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "#FFFFFF08",
    borderWidth: 1,
    borderColor: "transparent",
  },
  tileSelected: { backgroundColor: SELECTED_BG, borderColor: "#FFFFFF40" },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  infoText: { color: "#C9CACC", fontSize: 14, fontWeight: "500" },
});

const ReactionPicker = memo(ReactionPickerComponent);
export default ReactionPicker;
