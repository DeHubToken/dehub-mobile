import React, { useEffect } from "react";
import { View, Text, TouchableOpacity, type DimensionValue } from "react-native";
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

const CARD_BG = "rgba(255,255,255,0.045)";
const CARD_BG_EMPTY = "rgba(255,255,255,0.03)";
const CARD_BORDER = "rgba(255,255,255,0.10)";
const CARD_BORDER_EMPTY = "rgba(255,255,255,0.07)";
const CHIP_BG = "rgba(255,255,255,0.10)";
const CHIP_BORDER = "rgba(255,255,255,0.15)";
const SKELETON = "rgba(255,255,255,0.07)";

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
 * edge — the same stack as the phone reference, flipped above the input
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
    /* border-b, not border-t: the composer root already draws the line above
       this tray, and the divider belongs under the orb the way the composer's
       own top border sits under it on web. */
    <View className="px-3 pt-2 pb-2 border-b border-theme-neutrals-800/50">
      <View className="flex-row items-center justify-between px-0.5 pb-1.5">
        <Text className="text-[10px] tracking-[1.2px] text-theme-neutrals-500">
          SUGGESTED REPLIES
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
        <View className="min-h-[56px] items-center justify-center px-4">
          <Text className="text-xs text-theme-neutrals-500 text-center">
            {status === "empty"
              ? "Nothing to reply to yet — you sent the last message."
              : error || "Could not draft replies"}
          </Text>
        </View>
      ) : (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {cards.map((s, i) => (
            <TouchableOpacity
              key={s ? `${s.label}-${i}` : `skeleton-${i}`}
              disabled={!s}
              activeOpacity={0.7}
              onPress={() => s && onPick(s.text)}
              accessibilityRole="button"
              accessibilityLabel={s ? `${s.label}: ${s.text}` : "Drafting a reply"}
              accessibilityState={{ disabled: !s }}
              style={{
                flex: 1,
                minHeight: 92,
                borderRadius: 16,
                borderWidth: 1,
                padding: 10,
                justifyContent: "space-between",
                backgroundColor: s ? CARD_BG : CARD_BG_EMPTY,
                borderColor: s ? CARD_BORDER : CARD_BORDER_EMPTY,
              }}
            >
              {s ? (
                <>
                  <View
                    style={{
                      alignSelf: "flex-start",
                      borderRadius: 999,
                      borderWidth: 1,
                      backgroundColor: CHIP_BG,
                      borderColor: CHIP_BORDER,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                    }}
                  >
                    <Text className="text-[10px] leading-4 text-theme-neutrals-300">
                      {s.label}
                    </Text>
                  </View>
                  <Text className="text-[13px] leading-[18px] text-white mt-2" numberOfLines={3}>
                    {s.text}
                  </Text>
                </>
              ) : (
                <>
                  <PulseBlock width={80} height={16} radius={999} />
                  <View style={{ marginTop: 8, gap: 6 }}>
                    <PulseBlock width="100%" height={10} />
                    <PulseBlock width="66%" height={10} />
                  </View>
                </>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Orb hangs off the bottom edge of the card row, centred on the seam. */}
      <View style={{ alignItems: "center", marginTop: -16, zIndex: 10, elevation: 10 }}>
        <TouchableOpacity
          onPress={onGenerate}
          disabled={busy}
          activeOpacity={0.7}
          hitSlop={10}
          style={{ padding: 4 }}
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
