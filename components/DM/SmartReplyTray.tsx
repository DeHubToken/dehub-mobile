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

/** The composer's own background. The socket is filled with it, which is how
 *  the hole in the middle of the rail is punched — there is no CSS mask here. */
const TRAY_BG = "#010305";
const CARD_BG = "rgba(255,255,255,0.045)";
const CARD_BG_PRESSED = "rgba(255,255,255,0.10)";
const CARD_BG_EMPTY = "rgba(255,255,255,0.03)";
const CARD_BORDER = "rgba(255,255,255,0.10)";
const CARD_BORDER_EMPTY = "rgba(255,255,255,0.07)";
const SKELETON = "rgba(255,255,255,0.07)";

/**
 * Three sizes, shared with dehubweb's SmartReplyRail.tsx: the orb, the socket
 * it sits in, and the radius of the hole that socket punches at the centre of
 * the rail. Sizing any of them by hand is how the orb ends up off its seat.
 */
const ORB = 44;
const SOCKET = 48;
const NOTCH = SOCKET / 2;
const CARD_MIN_HEIGHT = 108;
/** Padding on the edge each card turns to the orb. Must clear the hole. */
const CARD_PAD_INNER = NOTCH + 4;

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
  /** Label for the x - the composer owns the copy, because it owns the `t`. */
  dismissLabel?: string;
}

/**
 * Two drafted replies side by side, with the orb seated in a circular socket
 * at the centre of the rail. The stack sits above the input because the
 * on-screen keyboard is the OS's space, not ours.
 *
 * Mirrors dehubweb's src/components/app/chat/SmartReplyRail.tsx — same socket,
 * same notch, same card rhythm, same copy. Change one, change the other.
 *
 * The orb is centred by a full-size absolute box with `alignItems` and
 * `justifyContent` both `center`, never by `left: "50%"` plus a negative
 * margin: a percentage offset on an absolute child resolves against a
 * different box depending on the Yoga version underneath, which put the orb
 * off-centre by exactly the tray's padding on some builds and not others.
 */
const SmartReplyTrayComponent: React.FC<SmartReplyTrayProps> = ({
  status,
  suggestions,
  error,
  onGenerate,
  onPick,
  onDismiss,
  dismissLabel,
}) => {
  // 'idle' is unresolved, not empty: the call is on its way, so it reads as
  // loading rather than as a tray with nothing in it.
  const busy = status === "loading" || status === "idle";

  // A failed draft keeps the tray — muted, one line of copy, orb live to press
  // again. A dead band and a working one must never be confusable.
  const notice =
    status === "empty"
      ? "Nothing to draft from yet — send a message to get started."
      : status === "error"
        ? error || "Could not draft replies"
        : null;

  // Always exactly two slots. The drafter can come back with one usable
  // suggestion, and a lone card in a two-slot rail leaves the socket over its
  // outer edge — which is what "the orb isn't centred" looks like.
  const slots: (SmartReplySuggestion | null)[] =
    status === "ready" ? [suggestions[0] ?? null, suggestions[1] ?? null] : [null, null];

  const rimColor = notice || busy ? CARD_BORDER_EMPTY : CARD_BORDER;

  // Its border and fill ARE the socket — one element, so the ring cannot drift
  // off the orb, and the opaque disc erases the card edges and the seam it
  // covers, the way web's mask does.
  const orbButton = (
    <TouchableOpacity
      onPress={onGenerate}
      disabled={busy}
      activeOpacity={0.7}
      hitSlop={8}
      style={{
        width: SOCKET,
        height: SOCKET,
        borderRadius: SOCKET / 2,
        borderWidth: 1,
        borderColor: rimColor,
        backgroundColor: TRAY_BG,
        alignItems: "center",
        justifyContent: "center",
      }}
      accessibilityRole="button"
      accessibilityLabel={busy ? "Drafting replies" : "Draft new replies"}
      accessibilityState={{ disabled: busy }}
    >
      <ReplyOrb state={busy ? "thinking" : "idle"} size={ORB} />
    </TouchableOpacity>
  );

  return (
    <View className="px-3 pt-2 pb-3 border-b border-theme-neutrals-800/50">
      <View style={{ position: "relative" }}>
        {notice ? (
          // No socket to sit in, so the orb goes under the line instead of
          // punching a hole through the middle of it.
          <View style={{ alignItems: "center", paddingVertical: 8, gap: 12 }}>
            <Text className="text-xs leading-[18px] text-theme-neutrals-500 text-center px-8">
              {notice}
            </Text>
            {orbButton}
          </View>
        ) : (
          <>
            <View style={{ flexDirection: "row" }}>
              {slots.map((s, i) => (
                <Pressable
                  key={s ? `${s.label}-${i}` : `slot-${i}`}
                  disabled={!s}
                  onPress={() => s && onPick(s.text)}
                  accessibilityRole="button"
                  accessibilityLabel={s ? `${s.label}: ${s.text}` : "Drafting a reply"}
                  accessibilityState={{ disabled: !s }}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: CARD_MIN_HEIGHT,
                    justifyContent: "center",
                    marginLeft: i === 1 ? -1 : 0,
                    borderWidth: 1,
                    borderTopLeftRadius: i === 0 ? 16 : 0,
                    borderBottomLeftRadius: i === 0 ? 16 : 0,
                    borderTopRightRadius: i === 1 ? 16 : 0,
                    borderBottomRightRadius: i === 1 ? 16 : 0,
                    paddingVertical: 12,
                    // The socket sits on the seam, so the inner edge of each
                    // card has to stand clear of it. The right card also
                    // reserves the dismiss control's corner.
                    paddingLeft: i === 0 ? 12 : CARD_PAD_INNER,
                    paddingRight: i === 0 ? CARD_PAD_INNER : 32,
                    backgroundColor: !s
                      ? CARD_BG_EMPTY
                      : pressed
                        ? CARD_BG_PRESSED
                        : CARD_BG,
                    borderColor: s ? CARD_BORDER : CARD_BORDER_EMPTY,
                  })}
                >
                  {s ? (
                    <>
                      <Text
                        className="text-[9px] uppercase leading-4 text-theme-neutrals-500"
                        style={{ letterSpacing: 0.9 }}
                      >
                        {s.label}
                      </Text>
                      <Text
                        className="mt-1.5 text-[13px] leading-[18px] text-white"
                        numberOfLines={3}
                      >
                        {s.text}
                      </Text>
                    </>
                  ) : (
                    <View style={{ width: "100%", gap: 8 }}>
                      <PulseBlock width={56} height={8} radius={999} />
                      <PulseBlock width="100%" height={10} />
                      <PulseBlock width="66%" height={10} />
                    </View>
                  )}
                </Pressable>
              ))}
            </View>

            {/* Centred on both axes by one full-size absolute box — the same
                point the hole is centred on, and no percentage offset anywhere
                in the path, on either platform. */}
            <View
              pointerEvents="box-none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {orbButton}
            </View>
          </>
        )}

        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={10}
          style={{ position: "absolute", right: 2, top: 2, padding: 6 }}
          accessibilityRole="button"
          accessibilityLabel={dismissLabel ?? "Turn off suggested replies"}
        >
          <Icon name="X" size={14} color="#6F7174" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default React.memo(SmartReplyTrayComponent);
