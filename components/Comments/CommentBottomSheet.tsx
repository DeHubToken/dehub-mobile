import React, { memo, useCallback, useEffect, useState } from "react";
import { View, Text, Modal, Pressable, Dimensions, StyleSheet, Keyboard, BackHandler } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../ui/Icon";
import CommentSection from "./CommentSection";
import RepostTab from "./RepostTab";
import QuoteTab from "./QuoteTab";
import type { PostCreator } from "../../libs/impersonation";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_FRACTION = 0.82;

// No likes tab: who reacted is the author's to see, and it lives behind the ⓘ
// in the reaction tray (ReactionInfoSheet) rather than in this public sheet.
type SheetTab = "comments" | "quotes" | "reposts";

const TAB_CONFIG: { key: SheetTab; icon: React.ComponentProps<typeof Icon>["name"]; label: string }[] = [
  { key: "comments", icon: "MessageSquare", label: "Comments" },
  { key: "quotes", icon: "Quote", label: "Quotes" },
  { key: "reposts", icon: "Repeat2", label: "Reposts" },
];

interface CommentBottomSheetProps {
  /** Render within a shorts split view instead of covering the player. */
  inlineHeight?: number;
  bottomOffset?: number;
  visible: boolean;
  onClose: () => void;
  tokenId: number | string;
  highlightCommentId?: number | string;
  contentType?: "video" | "feed";
  /** Creator turned replies off — swaps the composer for a notice. */
  commentsDisabled?: boolean;
  /** The post creator, for the Creator / Not-the-creator chips on comments. */
  postCreator?: PostCreator | null;
}

const CommentBottomSheetComponent: React.FC<CommentBottomSheetProps> = ({
  visible,
  onClose,
  tokenId,
  highlightCommentId,
  contentType = "video",
  commentsDisabled = false,
  postCreator,
  inlineHeight,
  bottomOffset = 0,
}) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const inline = inlineHeight !== undefined;
  const SHEET_HEIGHT = inlineHeight ?? SCREEN_HEIGHT * SHEET_FRACTION;
  const translateY = useSharedValue(SHEET_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const [isFullyClosed, setIsFullyClosed] = useState(!visible);
  const [activeTab, setActiveTab] = useState<SheetTab>("comments");
  /** Something unsent in the composer — CommentSection tells us. */
  const [hasUnsent, setHasUnsent] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (visible) {
      setActiveTab("comments");
      setConfirming(false);
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      setIsFullyClosed(false);
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

  const gesture = Gesture.Pan()
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
        {!inline && <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }, backdropStyle]}
        >
          <Pressable style={{ flex: 1 }} onPress={requestClose} />
        </Animated.View>}

        <Animated.View
          style={[
            glassStyles.sheet,
            { height: SHEET_HEIGHT, paddingBottom: inline ? 0 : insets.bottom },
            sheetStyle,
          ]}
        >
          {/* Opaque by design: the sheet opens over playing video, and a
              translucent body let the frame bleed through every row of text.
              The blur/frost layers died with the translucency. */}
          <View style={[StyleSheet.absoluteFill, glassStyles.overlay]} />

          <GestureDetector gesture={gesture}>
            <Animated.View style={{ height: inline ? 44 : 24, alignItems: "center", justifyContent: "center" }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" }} />
            </Animated.View>
          </GestureDetector>

          <View style={glassStyles.tabBar}>
            {TAB_CONFIG.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={[glassStyles.tab, isActive && glassStyles.tabActive]}
                  hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                  accessibilityRole="tab"
                  accessibilityLabel={tab.label}
                  accessibilityState={{ selected: isActive }}
                >
                  <Icon
                    name={tab.icon}
                    size={18}
                    color={isActive ? "#F9FBFF" : "#6F7174"}
                    strokeWidth={isActive ? 2.2 : 1.8}
                  />
                </Pressable>
              );
            })}


            {inline && (
              <Pressable onPress={requestClose} accessibilityRole="button" accessibilityLabel="Close comments" style={{ marginLeft: "auto", padding: 8 }}>
                <Icon name="ChevronDown" size={22} color="#F9FBFF" />
              </Pressable>
            )}
          </View>

          {activeTab === "comments" && (
            <CommentSection
              tokenId={tokenId}
              onClose={requestClose}
              highlightCommentId={highlightCommentId}
              contentType={contentType}
              commentsDisabled={commentsDisabled}
              postCreator={postCreator}
              onDirtyChange={onDirtyChange}
              keyboardHandled={inline}
            />
          )}

          {activeTab === "quotes" && (
            <QuoteTab tokenId={tokenId} />
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
    return <View style={{ position: "absolute", left: 0, right: 0, bottom: bottomOffset, height: SHEET_HEIGHT, overflow: "hidden" }}>{content}</View>;
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
    backgroundColor: "#0C0C0E",
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
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
    width: 40,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  tabActive: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
});

export const CommentBottomSheet = memo(CommentBottomSheetComponent);
export default CommentBottomSheet;
