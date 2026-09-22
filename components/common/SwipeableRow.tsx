import React, { useCallback, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { Ionicons } from "@expo/vector-icons";

export interface SwipeAction {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Solid colour for the panel behind the row. */
  color: string;
  onPress: () => void;
}

interface SwipeableRowProps {
  actions: SwipeAction[];
  /**
   * The row content must be opaque or the action panel shows through it while
   * the row is at rest. Pass whatever the surrounding list sits on.
   */
  backgroundClassName?: string;
  enabled?: boolean;
  children: React.ReactNode;
}

const ACTION_WIDTH = 78;

/*
 * Only one row stays open at a time, the way every native list behaves. Without
 * this a swipe leaves a trail of half-open rows behind it and the list stops
 * reading as a list.
 */
let openRow: SwipeableMethods | null = null;

interface RightActionsProps {
  drag: SharedValue<number>;
  actions: SwipeAction[];
  close: () => void;
}

const RightActions: React.FC<RightActionsProps> = ({ drag, actions, close }) => {
  const total = actions.length * ACTION_WIDTH;

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value + total }],
  }));

  return (
    <Animated.View style={[{ flexDirection: "row", width: total }, style]}>
      {actions.map((action) => (
        <Pressable
          key={action.key}
          onPress={() => {
            close();
            action.onPress();
          }}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={({ pressed }) => ({
            width: ACTION_WIDTH,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: action.color,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Ionicons name={action.icon} size={21} color="#FFFFFF" />
          <Text
            numberOfLines={1}
            style={{
              color: "#FFFFFF",
              fontSize: 11,
              fontWeight: "600",
              marginTop: 4,
              paddingHorizontal: 4,
            }}
          >
            {action.label}
          </Text>
        </Pressable>
      ))}
    </Animated.View>
  );
};

/**
 * Swipe a list row left to reveal its actions, as in Mail and Messages. The row
 * keeps whatever press behaviour it already had — this only wraps it.
 */
const SwipeableRow: React.FC<SwipeableRowProps> = ({
  actions,
  backgroundClassName = "bg-theme-neutrals-900",
  enabled = true,
  children,
}) => {
  const ref = useRef<SwipeableMethods | null>(null);

  const close = useCallback(() => {
    ref.current?.close();
  }, []);

  const handleWillOpen = useCallback(() => {
    if (openRow && openRow !== ref.current) openRow.close();
    openRow = ref.current;
  }, []);

  const handleClose = useCallback(() => {
    if (openRow === ref.current) openRow = null;
  }, []);

  const renderRightActions = useCallback(
    (_progress: SharedValue<number>, drag: SharedValue<number>) => (
      <RightActions drag={drag} actions={actions} close={close} />
    ),
    [actions, close],
  );

  if (!enabled || actions.length === 0) return <>{children}</>;

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      enableTrackpadTwoFingerGesture
      onSwipeableWillOpen={handleWillOpen}
      onSwipeableClose={handleClose}
      renderRightActions={renderRightActions}
    >
      <View className={backgroundClassName}>{children}</View>
    </ReanimatedSwipeable>
  );
};

export default SwipeableRow;
