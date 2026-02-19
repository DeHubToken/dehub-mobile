/**
 * CommentBottomSheet - Modal bottom sheet for comments
 * 
 * Wraps CommentSection in a bottom sheet modal that slides up from the bottom.
 * The sheet stays fixed while the input inside CommentSection handles keyboard.
 */
import React, { memo, useCallback, useEffect, useState } from "react";
import { View, Modal, Pressable, Dimensions } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import CommentSection from "./CommentSection";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.75;

interface CommentBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  tokenId: number | string;
  highlightCommentId?: number | string;
  contentType?: "video" | "feed";
}

const CommentBottomSheetComponent: React.FC<CommentBottomSheetProps> = ({
  visible,
  onClose,
  tokenId,
  highlightCommentId,
  contentType = "video",
}) => {
  const translateY = useSharedValue(SHEET_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  // Track if sheet is fully closed with React state (avoids reading .value during render)
  const [isFullyClosed, setIsFullyClosed] = useState(!visible);

  useEffect(() => {
    if (visible) {
      setIsFullyClosed(false);
      // Use gentler spring with higher damping to prevent over-bouncing
      translateY.value = withSpring(0, {
        damping: 50,
        stiffness: 400,
        mass: 1,
        overshootClamping: true,
      });
      backdropOpacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withTiming(SHEET_HEIGHT, {
        duration: 250,
        easing: Easing.out(Easing.ease),
      }, () => {
        runOnJS(setIsFullyClosed)(true);
      });
      backdropOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible, translateY, backdropOpacity]);

  const closeSheet = useCallback(() => {
    translateY.value = withTiming(SHEET_HEIGHT, {
      duration: 250,
      easing: Easing.out(Easing.ease),
    }, () => {
      runOnJS(onClose)();
    });
    backdropOpacity.value = withTiming(0, { duration: 200 });
  }, [translateY, backdropOpacity, onClose]);

  // Gesture handler for swipe down to close
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
        translateY.value = withSpring(0, {
          damping: 25,
          stiffness: 300,
        });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  // Use React state instead of reading .value during render
  if (!visible && isFullyClosed) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeSheet}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* Backdrop */}
        <Animated.View
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
            },
            backdropStyle,
          ]}
        >
          <Pressable style={{ flex: 1 }} onPress={closeSheet} />
        </Animated.View>

        {/* Sheet */}
        <Animated.View
          style={[
            {
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: SHEET_HEIGHT,
              backgroundColor: "#121212",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              overflow: "hidden",
            },
            sheetStyle,
          ]}
        >
          {/* Handle - only this area responds to swipe-to-close */}
          <GestureDetector gesture={gesture}>
            <Animated.View className="items-center py-2">
              <View className="w-10 h-1 rounded-full bg-theme-neutrals-600" />
            </Animated.View>
          </GestureDetector>

          {/* Content */}
          <CommentSection
            tokenId={tokenId}
            onClose={closeSheet}
            highlightCommentId={highlightCommentId}
            contentType={contentType}
          />
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};

export const CommentBottomSheet = memo(CommentBottomSheetComponent);
export default CommentBottomSheet;
