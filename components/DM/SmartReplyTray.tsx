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
 *  the hole between the cards is punched — there is no CSS mask here. */
const TRAY_BG = "#010305";
const CARD_BG = "rgba(255,255,255,0.045)";
const CARD_BG_PRESSED = "rgba(255,255,255,0.10)";
const CARD_BG_EMPTY = "rgba(255,255,255,0.03)";
const CARD_BORDER = "rgba(255,255,255,0.10)";
const CARD_BORDER_EMPTY = "rgba(255,255,255,0.07)";
const SKELETON = "rgba(255,255,255,0.07)";

/**
 * Four numbers, shared with dehubweb's SmartReplyRail.tsx: the orb, the socket
 * it sits in, the radius of the bite that socket takes out of each card, and
 * the gap it sits in. Sizing any of them by hand is how the orb ends up off
 * its seat.
 */
const ORB = 44;
const SOCKET = 48;
const NOTCH = SOCKET / 2;
/** Space between the stacked cards. Wide enough that the socket bites less
 *  deeply than the cards' own padding, so no text is ever covered. */
const GAP = 28;
/** Cards are a FIXED height, not a minimum: the orb is placed off this number,
 *  and RN has no equal-rows grid to make "the centre of the gap" fall out of
 *  the layout the way `grid-rows-2` does on web. Text is capped at two lines
 *  to match. */
const CARD_H = 80;

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
 * Two drafted replies, one per line, with the orb centred in the gap between
 * them. The stack sits above the input because the on-screen keyboard is the
 * OS's space, not ours.
 *
 * Mirrors dehubweb's src/components/app/chat/SmartReplyRail.tsx — same socket,
 * same notch, same gap, same copy. Change one, change the other.
 *
 * The orb is centred by a full-width absolute row with `alignItems: "center"`
 * and a `top` computed from CARD_H, never by `left: "50%"` plus a negative
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
  // suggestion, and a single card would leave the orb centred on nothing.
  const slots: (SmartReplySuggestion | null)[] =
    status === "ready" ? [suggestions[0] ?? null, suggestions[1] ?? null] : [null, null];

  const rimColor = notice || busy ? CARD_BORDER_EMPTY : CARD_BORDER;

  // Its border and fill ARE the socket — one element, so the ring cannot drift
  // off the orb, and the opaque disc erases the card edges it overlaps the way
  // web's mask does.
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
          <View style={{ alignItems: "center", paddingVertical: 8, gap: 12 }}>
            <Text className="text-xs leading-[18px] text-theme-neutrals-500 text-center px-8">
              {notice}
            </Text>
            {orbButton}
          </View>
        ) : (
          <>
            <View>
              {slots.map((s, i) => (
                <Pressable
                  key={s ? `${s.label}-${i}` : `slot-${i}`}
                  disabled={!s}
                  onPress={() => s && onPick(s.text)}
                  accessibilityRole="button"
                  accessibilityLabel={s ? `${s.label}: ${s.text}` : "Drafting a reply"}
                  accessibilityState={{ disabled: !s }}
                  style={({ pressed }) => ({
                    height: CARD_H,
                    marginTop: i === 1 ? GAP : 0,
                    justifyContent: "center",
                    borderWidth: 1,
                    borderRadius: 16,
                    paddingVertical: 12,
                    paddingLeft: 16,
                    // Room for the dismiss control in the top-right corner.
                    paddingRight: i === 0 ? 36 : 16,
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
                        className="mt-1 text-[13px] leading-[18px] text-white"
                        numberOfLines={2}
                      >
                        {s.text}
                      </Text>
                    </>
                  ) : (
                    <View style={{ width: "100%", gap: 8 }}>
                      <PulseBlock width={64} height={8} radius={999} />
                      <PulseBlock width="100%" height={10} />
                      <PulseBlock width="50%" height={10} />
                    </View>
                  )}
                </Pressable>
              ))}
            </View>

            {/* Centred in the gap: the first card's height plus half the gap is
                the gap's midline, less half the orb. Both cards are a fixed
                height, so this cannot drift with the length of a suggestion. */}
            <View
              pointerEvents="box-none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: CARD_H + GAP / 2 - SOCKET / 2,
                alignItems: "center",
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
          accessibilityLabel="Hide suggested replies"
        >
          <Icon name="X" size={14} color="#6F7174" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default React.memo(SmartReplyTrayComponent);
