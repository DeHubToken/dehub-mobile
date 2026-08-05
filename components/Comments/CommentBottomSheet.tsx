import React, { memo, useCallback, useEffect, useState } from "react";
import { View, Modal, Pressable, Dimensions, StyleSheet, Platform } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../ui/Icon";
import CommentSection from "./CommentSection";
import RepostTab from "./RepostTab";
import QuoteTab from "./QuoteTab";
import LikersTab from "./LikersTab";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_FRACTION = 0.82;

type SheetTab = "comments" | "quotes" | "reposts" | "likes";

const TAB_CONFIG: { key: SheetTab; icon: React.ComponentProps<typeof Icon>["name"]; label: string }[] = [
  { key: "comments", icon: "MessageSquare", label: "Comments" },
  { key: "quotes", icon: "Quote", label: "Quotes" },
  { key: "reposts", icon: "Repeat2", label: "Reposts" },
  { key: "likes", icon: "ThumbsUp", label: "Likes" },
];

interface CommentBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  tokenId: number | string;
  highlightCommentId?: number | string;
  contentType?: "video" | "feed";
  /** Creator turned replies off — swaps the composer for a notice. */
  commentsDisabled?: boolean;
}

const CommentBottomSheetComponent: React.FC<CommentBottomSheetProps> = ({
  visible,
  onClose,
  tokenId,
  highlightCommentId,
  contentType = "video",
  commentsDisabled = false,
}) => {
  const insets = useSafeAreaInsets();
  const SHEET_HEIGHT = SCREEN_HEIGHT * SHEET_FRACTION;
  const translateY = useSharedValue(SHEET_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const [isFullyClosed, setIsFullyClosed] = useState(!visible);
  const [activeTab, setActiveTab] = useState<SheetTab>("comments");

  useEffect(() => {
    if (visible) {
      setIsFullyClosed(false);
      setActiveTab("comments");
      translateY.value = withTiming(0, {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      });
      backdropOpacity.value = withTiming(1, { duration: 250 });
    } else {
      translateY.value = withTiming(SHEET_HEIGHT, {
        duration: 220,
        easing: Easing.in(Easing.cubic),
      }, () => {
        runOnJS(setIsFullyClosed)(true);
      });
      backdropOpacity.value = withTiming(0, { duration: 180 });
    }
  }, [visible, translateY, backdropOpacity, SHEET_HEIGHT]);

  const closeSheet = useCallback(() => {
    translateY.value = withTiming(SHEET_HEIGHT, {
      duration: 220,
      easing: Easing.in(Easing.cubic),
    }, () => {
      runOnJS(onClose)();
    });
    backdropOpacity.value = withTiming(0, { duration: 180 });
  }, [translateY, backdropOpacity, onClose, SHEET_HEIGHT]);

  const gesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > 100 || e.velocityY > 500) {
        runOnJS(closeSheet)();
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeSheet}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }, backdropStyle]}
        >
          <Pressable style={{ flex: 1 }} onPress={closeSheet} />
        </Animated.View>

        <Animated.View
          style={[
            glassStyles.sheet,
            { height: SHEET_HEIGHT, paddingBottom: insets.bottom },
            sheetStyle,
          ]}
        >
          <BlurView
            intensity={95}
            tint="dark"
            style={StyleSheet.absoluteFill}
            {...(Platform.OS === "android" ? { experimentalBlurMethod: "dimezisBlurView" } : {})}
          />
          <View style={[StyleSheet.absoluteFill, glassStyles.overlay]} />
          <View style={[StyleSheet.absoluteFill, glassStyles.frost]} />

          <GestureDetector gesture={gesture}>
            <Animated.View className="items-center py-2.5">
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


          </View>

          {activeTab === "comments" && (
            <CommentSection
              tokenId={tokenId}
              onClose={closeSheet}
              highlightCommentId={highlightCommentId}
              contentType={contentType}
              commentsDisabled={commentsDisabled}
            />
          )}

          {activeTab === "quotes" && (
            <QuoteTab tokenId={tokenId} />
          )}

          {activeTab === "reposts" && (
            <RepostTab tokenId={tokenId} />
          )}

          {activeTab === "likes" && (
            <LikersTab tokenId={tokenId} />
          )}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};

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
    backgroundColor: "rgba(12,12,14,0.72)",
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  frost: {
    backgroundColor: "rgba(255,255,255,0.06)",
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
