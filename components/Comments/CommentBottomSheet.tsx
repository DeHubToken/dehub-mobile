import { useSheetClosed } from '../../hooks/useSheetClosed';
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Modal, Pressable, useWindowDimensions, StyleSheet, Keyboard, BackHandler, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
  Easing,
  type SharedValue,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../ui/Icon";
import CommentSection from "./CommentSection";
import RepostTab from "./RepostTab";
import QuoteTab from "./QuoteTab";
import useKeyboard from "../../hooks/useKeyboard";
import type { PostCreator } from "../../libs/impersonation";
import { useAppTheme } from "../../context/ThemeContext";
import { useUserProfilePresentation } from "../../context/UserProfileSheetContext";
import {
  MINIMAL_HAIRLINE,
  MINIMAL_TAB_TEXT,
  MINIMAL_TAB_TEXT_ACTIVE,
  minimalTab,
  minimalTabActive,
  minimalTabStrip,
} from "../../theme/minimal";
import { SHEET_GLASS_FILL, SHEET_GLASS_BORDER } from "../../theme/sheetGlass";
import { SheetGlassFill } from "../ui/SheetGlass";
import SheetBackdrop, { useSheetBackdrop } from "../ui/SheetBackdrop";

const SHEET_FRACTION = 0.82;

// Use the same list boundary as React Native's Modal. The inline Shorts
// sheet is inside a vertical pager: without resetting its list context RN
// replaces each nested vertical list's ScrollView with a non-scrolling View.
const ListContextResetter = require('@react-native/virtualized-lists').default
  .VirtualizedListContextResetter as React.ComponentType<{ children: React.ReactNode }>;

// No likes tab: who reacted is the author's to see, and it lives behind the ⓘ
// in the reaction tray (ReactionInfoSheet) rather than in this public sheet.
type SheetTab = "comments" | "quotes" | "reposts";

// Keys, not words: the tabs are icon-only, so this is the only thing a screen
// reader has to announce, and it announced English in every language.
const TAB_CONFIG: { key: SheetTab; icon: React.ComponentProps<typeof Icon>["name"]; labelKey: string }[] = [
  { key: "comments", icon: "MessageSquare", labelKey: "postInfo.comments" },
  { key: "quotes", icon: "Quote", labelKey: "screens.quotesTab" },
  { key: "reposts", icon: "Repeat2", labelKey: "screens.repostsTab" },
];

interface CommentBottomSheetProps {
  /** Render within a shorts split view instead of covering the player. */
  inlineHeight?: number;
  bottomOffset?: number;
  /** The sheet's slide offset (0 = fully open, the sheet height = gone). Pass
   *  one in to move something else in lockstep with the sheet, e.g. the shorts
   *  player resizing as the split opens, closes and follows a drag. */
  slideOffset?: SharedValue<number>;
  visible: boolean;
  onClose: () => void;
  tokenId: number | string;
  highlightCommentId?: number | string;
  contentType?: "video" | "feed";
  /** Creator turned replies off — swaps the composer for a notice. */
  commentsDisabled?: boolean;
  /** Who may reply, when replies are on; said above the composer. */
  replyPolicy?: "public" | "followers" | "following" | "mentioned";
  /** The post is published for children — see CommentSection. */
  forKids?: boolean;
  /** The post creator, for the Creator / Not-the-creator chips on comments. */
  postCreator?: PostCreator | null;
}

/**
 * A name, mention or liker tapped in the sheet opens a profile. On Android the
 * profile is drawn in the app window, under this sheet's native Modal, so the
 * sheet (and the keyboard, when mid-reply) stayed on top of it. Calls
 * onProfileOpen when a profile opens, or changes, after the sheet came up.
 * Mounted only while the sheet is open, so closed sheets on every feed card
 * don't re-render with the profile state.
 */
function ProfileOpenWatcher({ onProfileOpen }: { onProfileOpen: () => void }) {
  const { profileVisible, profileIdentifier } = useUserProfilePresentation();
  const shown = profileVisible ? profileIdentifier : null;
  const atOpen = useRef(shown);
  useEffect(() => {
    if (shown && shown !== atOpen.current) onProfileOpen();
    atOpen.current = shown;
  }, [shown, onProfileOpen]);
  return null;
}

const CommentBottomSheetComponent: React.FC<CommentBottomSheetProps> = ({
  visible,
  onClose,
  tokenId,
  highlightCommentId,
  contentType = "video",
  commentsDisabled = false,
  replyPolicy,
  forKids = false,
  postCreator,
  inlineHeight,
  bottomOffset = 0,
  slideOffset,
}) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { isMinimal, theme, skin } = useAppTheme();
  const inline = inlineHeight !== undefined;
  const { height: screenHeight } = useWindowDimensions();
  const SHEET_HEIGHT = inlineHeight ?? screenHeight * SHEET_FRACTION;
  const ownTranslateY = useSharedValue(SHEET_HEIGHT);
  const translateY = slideOffset ?? ownTranslateY;
  const backdropOpacity = useSharedValue(0);
  const [isFullyClosed, setIsFullyClosed] = useSheetClosed(visible);
  // The inline Shorts sheet has no backdrop: it sits inside the feed.
  const backdrop = useSheetBackdrop(!inline);
  const [activeTab, setActiveTab] = useState<SheetTab>("comments");
  /** Something unsent in the composer — CommentSection tells us. */
  const [hasUnsent, setHasUnsent] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // CommentSection lifts the composer by the keyboard height; at 82% of the
  // screen that left only ~100dp of comments above it on a small phone, so the
  // modal sheet grows to the full height below the status bar while typing.
  const { isVisible: kbVisible } = useKeyboard();
  const expandForKeyboard = !inline && kbVisible;

  useEffect(() => {
    if (visible) {
      setActiveTab("comments");
      setConfirming(false);
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      setIsFullyClosed(false);
      // A shared offset can start parked further down than this sheet is tall;
      // begin the slide from the sheet's own bottom edge, not off past it.
      if (translateY.value > SHEET_HEIGHT) translateY.value = SHEET_HEIGHT;
      translateY.value = withTiming(0, {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      });
      backdropOpacity.value = withTiming(1, { duration: 250 });
    } else {
      translateY.value = withTiming(SHEET_HEIGHT, {
        duration: 220,
        easing: Easing.in(Easing.cubic),
      }, (finished) => {
        if (finished) runOnJS(setIsFullyClosed)(true);
      });
      backdropOpacity.value = withTiming(0, { duration: 180 });
    }
  }, [visible, translateY, backdropOpacity, SHEET_HEIGHT]);

  const finishClose = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const closeSheet = useCallback(() => {
    translateY.value = withTiming(SHEET_HEIGHT, {
      duration: 220,
      easing: Easing.in(Easing.cubic),
    }, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
    backdropOpacity.value = withTiming(0, { duration: 180 });
  }, [translateY, backdropOpacity, finishClose, SHEET_HEIGHT]);

  /**
   * Nothing closes this sheet out from under someone mid-sentence.
   *
   * The backdrop, the swipe down and the Android back button all come through
   * here, and while there is unsent text they raise a confirmation instead of
   * closing. The text itself is safe either way — it is in the draft store
   * before this runs (libs/comment-draft-cache) — but an unexpected dismiss
   * still reads as "it deleted what I wrote".
   */
  const requestClose = useCallback(() => {
    if (!hasUnsent) {
      closeSheet();
      return;
    }
    // Let the keyboard go first, or the confirmation lands under it.
    Keyboard.dismiss();
    setConfirming(true);
  }, [hasUnsent, closeSheet]);

  useEffect(() => {
    if (!inline || !visible) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      requestClose();
      return true;
    });
    return () => subscription.remove();
  }, [inline, visible, requestClose]);

  /** A swipe past the threshold: either it closes, or it springs back and asks. */
  const handleSwipeEnd = useCallback(() => {
    if (!hasUnsent) {
      closeSheet();
      return;
    }
    translateY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
    Keyboard.dismiss();
    setConfirming(true);
  }, [hasUnsent, closeSheet, translateY]);

  const onDirtyChange = useCallback((dirty: boolean) => setHasUnsent(dirty), []);

  // No discard prompt here: the tap was the person's own, and an unsent reply
  // is already in the draft store, so it is back when they reopen the sheet.
  const stepAsideForProfile = useCallback(() => {
    Keyboard.dismiss();
    setConfirming(false);
    if (!inline) closeSheet();
  }, [inline, closeSheet]);

  // Only a clear downward drag takes over, so taps on the tab row it now
  // covers still switch tabs.
  const gesture = Gesture.Pan()
    .activeOffsetY(10)
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > 100 || e.velocityY > 500) {
        runOnJS(handleSwipeEnd)();
      } else {
        translateY.value = withTiming(0, {
          duration: 200,
          easing: Easing.out(Easing.cubic),
        });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!visible && isFullyClosed) return null;

  const content = (
      <GestureHandlerRootView style={{ flex: 1 }}>
        {visible && Platform.OS === "android" && <ProfileOpenWatcher onProfileOpen={stepAsideForProfile} />}
        {/* The page behind is blurred, fading in and out with the sheet. */}
        {!inline && <Animated.View
          style={[StyleSheet.absoluteFill, backdropStyle]}
        >
          <SheetBackdrop backdrop={backdrop} />
          <Pressable style={{ flex: 1 }} onPress={requestClose} />
        </Animated.View>}

        <Animated.View
          style={[
            glassStyles.sheet,
            expandForKeyboard
              ? { top: insets.top, paddingBottom: insets.bottom }
              : { height: SHEET_HEIGHT, paddingBottom: inline ? 0 : insets.bottom },
            sheetStyle,
          ]}
        >
          {/* Liquid glass: the feed behind is blurred, never shown sharp, so
              playing video can't bleed through the rows of text. The inline
              Shorts sheet sits inside the feed it would sample, so it keeps
              the near-solid wash. */}
          <SheetGlassFill blur={!inline} backdropBlurred={backdrop.blurred} style={[StyleSheet.absoluteFill, glassStyles.overlay, isMinimal && glassStyles.minimalOverlay, theme === 'glass' && { backgroundColor: skin?.page || '#102d32', borderColor: 'rgba(220,255,255,.18)' }]} />

          {/* The handle and the tab row both start the swipe down — the 24dp
              handle alone was too thin a target. */}
          <GestureDetector gesture={gesture}>
            <Animated.View>
              <Animated.View style={{ height: inline ? 44 : 24, alignItems: "center", justifyContent: "center" }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" }} />
              </Animated.View>

              {/* Minimal turns this into a file-tab strip: one baseline across the
                  sheet, the active tab outlined on three sides and breaking it. */}
              <View style={[glassStyles.tabBar, isMinimal && glassStyles.minimalTabBar]}>
                {TAB_CONFIG.map((tab) => {
                  const isActive = activeTab === tab.key;
                  return (
                    <Pressable
                      key={tab.key}
                      onPress={() => setActiveTab(tab.key)}
                      style={[
                        glassStyles.tab,
                        isActive && glassStyles.tabActive,
                        isMinimal && (isActive ? minimalTabActive : minimalTab),
                      ]}
                      hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                      accessibilityRole="tab"
                      accessibilityLabel={t(tab.labelKey)}
                      accessibilityState={{ selected: isActive }}
                    >
                      <Icon
                        name={tab.icon}
                        size={18}
                        color={
                          isMinimal
                            ? isActive ? MINIMAL_TAB_TEXT_ACTIVE : MINIMAL_TAB_TEXT
                            : isActive ? "#F9FBFF" : "#6F7174"
                        }
                        strokeWidth={isActive ? 2.2 : 1.8}
                      />
                    </Pressable>
                  );
                })}


                {inline && (
                  <Pressable onPress={requestClose} accessibilityRole="button" accessibilityLabel={t("comments.closeComments")} style={{ marginLeft: "auto", padding: 8 }}>
                    <Icon name="ChevronDown" size={22} color="#F9FBFF" />
                  </Pressable>
                )}
              </View>
            </Animated.View>
          </GestureDetector>

          {activeTab === "comments" && (
            <CommentSection
              tokenId={tokenId}
              onClose={requestClose}
              highlightCommentId={highlightCommentId}
              contentType={contentType}
              commentsDisabled={commentsDisabled}
              replyPolicy={replyPolicy}
              forKids={forKids}
              postCreator={postCreator}
              onDirtyChange={onDirtyChange}
              keyboardHandled={inline}
            />
          )}

          {activeTab === "quotes" && (
            <QuoteTab tokenId={tokenId} nested={inline} />
          )}

          {activeTab === "reposts" && (
            <RepostTab tokenId={tokenId} />
          )}

          {confirming && (
            <View style={discardStyles.scrim}>
              <View style={discardStyles.card}>
                <Text style={discardStyles.title}>{t("comments.discardTitle")}</Text>
                <Text style={discardStyles.body}>{t("comments.discardBody")}</Text>
                <View style={discardStyles.row}>
                  <Pressable
                    style={[discardStyles.button, discardStyles.primary]}
                    onPress={() => setConfirming(false)}
                    accessibilityRole="button"
                  >
                    <Text style={discardStyles.primaryLabel}>{t("comments.keepWriting")}</Text>
                  </Pressable>
                  <Pressable
                    style={[discardStyles.button, discardStyles.secondary]}
                    onPress={() => {
                      setConfirming(false);
                      closeSheet();
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={discardStyles.secondaryLabel}>{t("comments.closeAnyway")}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </Animated.View>
      </GestureHandlerRootView>
  );

  if (inline) {
    return <View style={{ position: "absolute", left: 0, right: 0, bottom: bottomOffset, height: SHEET_HEIGHT, overflow: "hidden" }}>
      <ListContextResetter>{content}</ListContextResetter>
    </View>;
  }
  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={requestClose}>
      {content}
    </Modal>
  );
};

/** The "you're mid-sentence" confirmation, drawn over the sheet's own body. */
const discardStyles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  card: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#141416",
    padding: 16,
  },
  title: { color: "#F9FBFF", fontSize: 15, fontWeight: "600", textAlign: "center" },
  body: { color: "#9CA0A6", fontSize: 13, lineHeight: 18, textAlign: "center", marginTop: 6 },
  row: { flexDirection: "row", gap: 8, marginTop: 16 },
  button: { flex: 1, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  primary: { backgroundColor: "#F9FBFF" },
  primaryLabel: { color: "#010305", fontSize: 14, fontWeight: "600" },
  secondary: { borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.18)" },
  secondaryLabel: { color: "#C9CCD1", fontSize: 14, fontWeight: "500" },
});

const glassStyles = StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  overlay: {
    backgroundColor: SHEET_GLASS_FILL,
    borderTopWidth: 1,
    borderColor: SHEET_GLASS_BORDER,
  },
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  tab: {
    width: 44,
    minHeight: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  tabActive: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  // Minimal: pure black body, a single hairline along the top edge.
  minimalOverlay: {
    backgroundColor: "#000",
    borderTopWidth: 1,
    borderColor: MINIMAL_HAIRLINE,
  },
  // No bottom padding and bottom-aligned (the inline close chevron is taller
  // than a tab), so the active tab's -1 margin lands on the baseline.
  minimalTabBar: {
    ...minimalTabStrip,
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingBottom: 0,
  },
});

export const CommentBottomSheet = memo(CommentBottomSheetComponent);
export default CommentBottomSheet;
