import React, { useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  type DimensionValue,
} from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Icon from "../ui/Icon";
import ReplyOrb from "./ReplyOrb";
import type { SmartReplySuggestion } from "../../services/ai.service";
import type { SmartReplyStatus } from "../../hooks/useSmartReplies";

const TRAY_BG = "#010305";
const BUTTON_BG = "rgba(255,255,255,0.025)";
const BUTTON_BORDER = "rgba(255,255,255,0.18)";
const BUTTON_BORDER_EMPTY = "rgba(255,255,255,0.09)";
const SKELETON = "rgba(255,255,255,0.08)";
const ORB_CUTOUT_SIZE = 58;

/** RN has no `animate-pulse`, so the loading blocks get their own driver. */
const PulseBlock: React.FC<{ width: DimensionValue; height: number; radius?: number }> = ({
  width,
  height,
  radius = 4,
}) => {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(p);
  }, [p]);
  const style = useAnimatedStyle(() => ({ opacity: 0.45 + p.value * 0.55 }));
  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: SKELETON },
        style,
      ]}
    />
  );
};

interface SmartReplyTrayProps {
  status: SmartReplyStatus;
  suggestions: SmartReplySuggestion[];
  error: string | null;
  /** Tap the orb — first draft, then redraft. */
  onGenerate: () => void;
  /** Card tapped: the text goes into the composer, unsent. */
  onPick: (text: string) => void;
  onDismiss: () => void;
}

/**
 * Two drafted replies over the composer, with the orb straddling their bottom
 * edge. The same stack as the phone reference, flipped above the input
 * because the on-screen keyboard is the OS's space, not ours.
 *
 * Mirrors dehubweb's src/components/app/chat/SmartReplyTray.tsx.
 */
const SmartReplyTrayComponent: React.FC<SmartReplyTrayProps> = ({
  status,
  suggestions,
  error,
  onGenerate,
  onPick,
  onDismiss,
}) => {
  const busy = status === "loading";
  const cards: (SmartReplySuggestion | null)[] =
    busy || suggestions.length === 0 ? [null, null] : suggestions.slice(0, 2);

  return (
    <View className="px-3 pt-2 pb-5 border-b border-theme-neutrals-800/50">
      <View className="flex-row items-center justify-between px-1 pb-2">
        <Text className="text-[11px] font-medium text-theme-neutrals-400">
          Suggested replies
        </Text>
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Hide suggested replies"
        >
          <Icon name="X" size={14} color="#8B8D90" />
        </TouchableOpacity>
      </View>

      {status === "error" || status === "empty" ? (
        <View
          className="min-h-[88px] items-center justify-center px-5 border rounded-[14px]"
          style={{ backgroundColor: BUTTON_BG, borderColor: BUTTON_BORDER_EMPTY }}
        >
          <Text className="text-xs text-theme-neutrals-500 text-center">
            {status === "empty"
              ? "Nothing to reply to yet. You sent the last message."
              : error || "Could not draft replies"}
          </Text>
        </View>
      ) : (
        <View style={{ flexDirection: "row", minHeight: 96 }}>
          {cards.map((s, i) => (
            <Pressable
              key={s ? `${s.label}-${i}` : `skeleton-${i}`}
              disabled={!s}
              onPress={() => s && onPick(s.text)}
              accessibilityRole="button"
              accessibilityLabel={s ? `${s.label}: ${s.text}` : "Drafting a reply"}
              accessibilityState={{ disabled: !s }}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 96,
                marginLeft: i === 1 ? -1 : 0,
                borderWidth: 1,
                borderTopLeftRadius: i === 0 ? 14 : 0,
                borderBottomLeftRadius: i === 0 ? 14 : 0,
                borderTopRightRadius: i === 1 ? 14 : 0,
                borderBottomRightRadius: i === 1 ? 14 : 0,
                paddingHorizontal: 12,
                paddingVertical: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? "rgba(255,255,255,0.07)" : BUTTON_BG,
                borderColor: s ? BUTTON_BORDER : BUTTON_BORDER_EMPTY,
                opacity: pressed ? 0.92 : 1,
                transform: [{ scale: pressed ? 0.985 : 1 }],
              })}
            >
              {s ? (
                <View className="items-center">
                  <Text className="text-[10px] font-medium text-theme-neutrals-400 mb-1.5">
                    {s.label}
                  </Text>
                  <Text
                    className="text-[13px] leading-[18px] text-theme-neutrals-100 text-center"
                    numberOfLines={3}
                  >
                    {s.text}
                  </Text>
                </View>
              ) : (
                <View style={{ width: "78%", alignItems: "center", gap: 7 }}>
                  <PulseBlock width="42%" height={8} />
                  <PulseBlock width="100%" height={10} />
                  <PulseBlock width="72%" height={10} />
                </View>
              )}
            </Pressable>
          ))}
        </View>
      )}

      {/* The background disc erases the shared button border behind the orb,
          leaving the circular cutout visible at the centre seam. */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: "50%",
          bottom: -9,
          width: ORB_CUTOUT_SIZE,
          height: ORB_CUTOUT_SIZE,
          marginLeft: -ORB_CUTOUT_SIZE / 2,
          borderRadius: ORB_CUTOUT_SIZE / 2,
          borderWidth: 1,
          borderColor: BUTTON_BORDER,
          backgroundColor: TRAY_BG,
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10,
          elevation: 10,
        }}
      >
        <TouchableOpacity
          onPress={onGenerate}
          disabled={busy}
          activeOpacity={0.7}
          hitSlop={10}
          style={{ width: 52, height: 52, alignItems: "center", justifyContent: "center" }}
          accessibilityRole="button"
          accessibilityLabel={busy ? "Drafting replies" : "Draft new replies"}
          accessibilityState={{ disabled: busy }}
        >
          <ReplyOrb state={busy ? "thinking" : "idle"} size={44} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default React.memo(SmartReplyTrayComponent);
