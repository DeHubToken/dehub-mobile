import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, type LayoutChangeEvent } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { haptic } from "../../libs/haptics";

export interface SwipeAction {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Solid colour for the panel behind the row. */
  color: string;
  onPress: () => void;
  /**
   * The action a long swipe runs on its own — delete, in practice. The row
   * slides out and folds away before `onPress` fires, so the list can drop it
   * without the rest jumping. Put it last: it is the one that stretches to
   * follow the finger.
   */
  destructive?: boolean;
}

interface SwipeableRowProps {
  actions: SwipeAction[];
  /** Row surface; transparent theme fills are safe because actions sit beside it. */
  backgroundClassName?: string;
  enabled?: boolean;
  children: React.ReactNode;
}

const ACTION_WIDTH = 78;
/** Past this share of the row's width, letting go runs the destructive action. */
const FULL_SWIPE_RATIO = 0.55;
/** Finger speed (pt/s) that decides open or closed regardless of distance. */
const FLING_VELOCITY = 500;
const SPRING = { damping: 26, stiffness: 320, mass: 0.9 };
const SLIDE_MS = 200;
const COLLAPSE_MS = 180;

/*
 * Only one row stays open at a time, the way every native list behaves. Without
 * this a swipe leaves a trail of half-open rows behind it and the list stops
 * reading as a list.
 */
let closeOpenRow: (() => void) | null = null;

/**
 * Swipe a list row left to reveal its actions, as in Mail and Messages; swipe
 * it most of the way across to run the destructive one outright. The row keeps
 * whatever press behaviour it already had — this only wraps it.
 *
 * Built on a pan gesture rather than ReanimatedSwipeable so the finger is
 * tracked one-to-one (that component's friction made the row lag the thumb),
 * and so a long swipe can carry the row off the screen instead of snapping it
 * back to the open position first.
 */
const SwipeableRow: React.FC<SwipeableRowProps> = ({
  actions,
  backgroundClassName = "bg-theme-neutrals-900",
  enabled = true,
  children,
}) => {
  const { t } = useTranslation();
  const translateX = useSharedValue(0);
  const start = useSharedValue(0);
  const rowWidth = useSharedValue(0);
  const rowHeight = useSharedValue(-1);
  const armed = useSharedValue(false);
  const [open, setOpen] = useState(false);
  const mounted = useRef(true);
  /** The row's natural height, for the fold to animate down from. */
  const naturalHeight = useRef(0);

  const total = actions.length * ACTION_WIDTH;
  const last = actions[actions.length - 1];
  const stretches = !!last?.destructive;

  const close = useCallback(() => {
    translateX.value = withSpring(0, SPRING);
    setOpen(false);
    if (closeOpenRow === close) closeOpenRow = null;
  }, [translateX]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (closeOpenRow === close) closeOpenRow = null;
    };
  }, [close]);

  const markOpen = useCallback(() => {
    if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
    closeOpenRow = close;
    setOpen(true);
  }, [close]);

  const markClosed = useCallback(() => {
    setOpen(false);
    if (closeOpenRow === close) closeOpenRow = null;
  }, [close]);

  const closeOthers = useCallback(() => {
    if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
  }, [close]);

  /**
   * Slide the row the rest of the way out, fold its height to nothing, then
   * hand over. The caller is expected to drop the row from its list at that
   * point; if it does not (the action was refused, say), the row comes back.
   */
  const dismissThen = useCallback(
    (run: () => void) => {
      if (closeOpenRow === close) closeOpenRow = null;
      // Pin the real height first; animating from "auto" has nothing to fold.
      rowHeight.value = naturalHeight.current;
      const finish = () => {
        run();
        setTimeout(() => {
          if (!mounted.current) return;
          rowHeight.value = -1;
          translateX.value = 0;
          setOpen(false);
        }, 400);
      };
      translateX.value = withTiming(-rowWidth.value, { duration: SLIDE_MS }, (slid) => {
        if (!slid) return;
        rowHeight.value = withTiming(0, { duration: COLLAPSE_MS }, (folded) => {
          if (folded) runOnJS(finish)();
        });
      });
    },
    [close, rowHeight, rowWidth, translateX],
  );

  const fullSwipe = useCallback(() => {
    if (last?.destructive) dismissThen(last.onPress);
  }, [dismissThen, last]);

  const pan = Gesture.Pan()
    .enabled(enabled && actions.length > 0)
    // Horizontal intent only; a vertical move hands the touch to the list.
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onBegin(() => {
      start.value = translateX.value;
    })
    .onStart(() => {
      runOnJS(closeOthers)();
    })
    .onUpdate((e) => {
      let x = Math.min(0, start.value + e.translationX);
      if (-x > total) {
        // The destructive action follows the finger all the way; anything
        // else resists past its panel instead of revealing empty space.
        x = stretches ? Math.max(x, -rowWidth.value) : -(total + (-x - total) * 0.25);
      }
      translateX.value = x;

      const past = stretches && -x > rowWidth.value * FULL_SWIPE_RATIO;
      if (past !== armed.value) {
        armed.value = past;
        if (past) runOnJS(haptic.select)();
      }
    })
    .onEnd((e) => {
      if (armed.value) {
        armed.value = false;
        runOnJS(fullSwipe)();
        return;
      }
      const shouldOpen =
        e.velocityX < -FLING_VELOCITY || (e.velocityX <= FLING_VELOCITY && -translateX.value > total / 2);
      translateX.value = withSpring(shouldOpen ? -total : 0, SPRING);
      runOnJS(shouldOpen ? markOpen : markClosed)();
    });

  const rowStyle = useAnimatedStyle(() => ({
    height: rowHeight.value < 0 ? undefined : rowHeight.value,
    opacity: rowHeight.value < 0 ? 1 : Math.min(1, rowHeight.value / 24),
  }));

  const contentStyle = useAnimatedStyle(() => ({
    width: rowWidth.value > 0 ? rowWidth.value + Math.max(total, -translateX.value) : undefined,
    transform: [{ translateX: translateX.value }],
  }));

  const foregroundStyle = useAnimatedStyle(() => ({
    width: rowWidth.value > 0 ? rowWidth.value : undefined,
  }));

  // Grows past its resting width as the row is dragged further, so the last
  // action fills everything the finger has uncovered.
  const actionsStyle = useAnimatedStyle(() => ({
    left: rowWidth.value,
    width: Math.max(total, -translateX.value),
  }));

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      rowWidth.value = e.nativeEvent.layout.width;
      // Only while unpinned: mid-fold the layout reports the shrinking height.
      if (rowHeight.value < 0) naturalHeight.current = e.nativeEvent.layout.height;
    },
    [rowHeight, rowWidth],
  );

  if (!enabled || actions.length === 0) return <>{children}</>;

  return (
    <Animated.View style={[{ overflow: "hidden" }, rowStyle]} onLayout={onLayout}>
      <GestureDetector gesture={pan}>
        <Animated.View style={contentStyle}>
          <Animated.View className={backgroundClassName} style={foregroundStyle}>
            {children}
            {/* A tap on an open row closes it instead of opening the thread. */}
            {open && (
              <Pressable
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel={t("common.close")}
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
              />
            )}
          </Animated.View>
          {/* The track contains both the foreground and actions so Android
              reports the revealed buttons' full accessibility bounds. */}
          <Animated.View
            pointerEvents={open ? "auto" : "none"}
            accessibilityElementsHidden={!open}
            importantForAccessibility={open ? "auto" : "no-hide-descendants"}
            style={[
              { position: "absolute", top: 0, bottom: 0, flexDirection: "row" },
              actionsStyle,
            ]}
          >
            {actions.map((action, i) => {
              const isLast = i === actions.length - 1;
              return (
                <Pressable
                  key={action.key}
                  onPress={() => {
                    if (action.destructive) {
                      dismissThen(action.onPress);
                      return;
                    }
                    close();
                    action.onPress();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  style={({ pressed }) => ({
                    width: isLast && stretches ? undefined : ACTION_WIDTH,
                    flex: isLast && stretches ? 1 : undefined,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: action.color,
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <Ionicons name={action.icon} size={21} color="#FFFFFF" />
                  <Text
                    numberOfLines={1}
                    style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "600", marginTop: 4, paddingHorizontal: 4 }}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              );
            })}
          </Animated.View>

        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
};

export default SwipeableRow;
