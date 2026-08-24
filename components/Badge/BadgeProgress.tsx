/**
 * BadgeProgress — where a holder sits on the badge ladder, and what the next
 * rung costs.
 *
 * The badge next to a name is nine points wide and says nothing about how it
 * was earned or how close the next one is. This is the other half: the tier you
 * hold, a bar filling toward the one above it, and the whole thirteen-rung
 * ladder with the ones you have lit and the ones you have not dimmed.
 *
 * Requirements come from `badgeThresholds()`, so every number is what that tier
 * costs *today* — the ladder is pegged in dollars and moves with the token
 * price. A holder standing on a grandfathered tier is told so, because the bar
 * would otherwise read as if they were below the rung they are visibly on.
 *
 * Mirror of dehubweb's `components/app/BadgeProgress.tsx`.
 */

import React, { useMemo } from "react";
import { View, Text, Image, ScrollView } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";
import {
  badgeImage,
  badgeThresholds,
  getBadgeStanding,
  type BadgeLock,
} from "../../libs/misc";
import { useBadgeLadderPrice, useBadgeScale } from "../../hooks/useBadgeScale";

export interface BadgeProgressProps {
  /** DHB counted toward the ladder. */
  balance?: number | string | null;
  /** The holder's grandfathered tier, when the payload carries one. */
  lock?: BadgeLock | null;
  /** Drop the ladder strip, for tight columns. */
  compact?: boolean;
}

/** Compact DHB, in the shape the wallet screens use. */
function formatDhb(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "")}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.round(value));
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "$0";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  if (value >= 1) return `$${Math.round(value)}`;
  return `$${value.toFixed(2)}`;
}

export function BadgeProgress({ balance, lock, compact = false }: BadgeProgressProps) {
  const scale = useBadgeScale();
  const price = useBadgeLadderPrice();

  const ladder = useMemo(() => badgeThresholds(scale), [scale]);
  const standing = useMemo(
    () => getBadgeStanding(balance, { scale, lock }),
    [balance, scale, lock],
  );

  const percent = Math.round(standing.progress * 100);

  // Width as a percentage string, driven once on mount and whenever the tier
  // moves. `withTiming` lives in the worklet, never in the style literal —
  // a bare withTiming in a style resolves to NaN and the view disappears.
  const fill = useSharedValue(0);
  const glow = useSharedValue(0.45);

  React.useEffect(() => {
    fill.value = withTiming(Math.max(percent, standing.progress > 0 ? 2 : 0), {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });
  }, [percent, standing.progress, fill]);

  React.useEffect(() => {
    glow.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.45, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [glow]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value}%` }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  return (
    <View className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 overflow-hidden">
      <View className="flex-row items-center gap-3">
        <View className="w-14 h-14 items-center justify-center">
          {/* Plain style, not className: NativeWind does not interop
              Animated.View, and a className here silently renders nothing. */}
          <Animated.View
            style={[
              glowStyle,
              {
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                borderRadius: 28,
                backgroundColor: "rgba(255,255,255,0.10)",
              },
            ]}
          />
          <View className="w-14 h-14 rounded-full border border-white/15 bg-white/[0.04] items-center justify-center">
            {standing.image ? (
              <Image
                source={standing.image}
                style={{ width: 30, height: 30 }}
                resizeMode="contain"
              />
            ) : (
              <Text className="text-[9px] uppercase tracking-wider text-white/30">
                None
              </Text>
            )}
          </View>
        </View>

        <View className="flex-1 min-w-0">
          <Text numberOfLines={1} className="text-base font-semibold text-white">
            {standing.tier ?? "No badge yet"}
          </Text>
          <Text numberOfLines={1} className="text-xs text-white/50">
            {formatDhb(standing.balance)} DHB
            {price ? `  ·  ${formatUsd(standing.balance * price)}` : ""}
          </Text>
        </View>

        <View className="items-end">
          {standing.nextTier ? (
            <>
              <Text className="text-[10px] uppercase tracking-wider text-white/30">
                Next
              </Text>
              <Text numberOfLines={1} className="text-sm font-medium text-white/80">
                {standing.nextTier}
              </Text>
            </>
          ) : (
            <Text className="text-[10px] uppercase tracking-wider text-white/40">
              Top tier
            </Text>
          )}
        </View>
      </View>

      {/* The bar fills across the current tier, not across the whole ladder —
          crawling 2% of the way to Meglodon is not progress anyone can feel. */}
      <View className="mt-4 h-2.5 rounded-full bg-white/[0.06] border border-white/10 overflow-hidden">
        <Animated.View
          style={[
            fillStyle,
            {
              height: "100%",
              borderRadius: 999,
              backgroundColor: "#FFFFFF",
              shadowColor: "#FFFFFF",
              shadowOpacity: 0.6,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 0 },
              elevation: 6,
            },
          ]}
        />
      </View>

      <View className="mt-2 flex-row items-center justify-between">
        <Text className="text-[11px] text-white/40">{percent}%</Text>
        <Text numberOfLines={1} className="text-[11px] text-white/60 flex-1 text-right ml-2">
          {standing.nextTier
            ? `${formatDhb(standing.remaining)} DHB to ${standing.nextTier}`
            : "Every tier unlocked"}
        </Text>
      </View>

      {!compact && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-4"
          contentContainerStyle={{ gap: 2, paddingRight: 4 }}
        >
          {ladder.map((rung, i) => {
            const earned = i <= standing.index;
            const current = i === standing.index;
            return (
              <View
                key={rung.name}
                className={`w-8 h-8 rounded-lg items-center justify-center ${
                  current
                    ? "bg-white/[0.12] border border-white/50"
                    : earned
                      ? "bg-white/[0.07]"
                      : "bg-white/[0.02]"
                }`}
              >
                <Image
                  source={badgeImage(rung.name)}
                  style={{ width: 18, height: 18, opacity: earned ? 1 : 0.25 }}
                  resizeMode="contain"
                />
              </View>
            );
          })}
        </ScrollView>
      )}

      <Text className="mt-3 text-[10px] leading-4 text-white/35">
        Tiers are priced in dollars, so the DHB each one costs moves with the
        token.
        {standing.nextTier
          ? ` ${standing.nextTier} is ${formatDhb(standing.nextThreshold ?? 0)} DHB at today's price.`
          : " Meglodon is about $50,000 of DHB at any price."}
      </Text>

      {standing.grandfathered && lock ? (
        <Text className="mt-1.5 text-[10px] leading-4 text-white/50">
          {standing.tier} is locked in. You keep it while you hold at least{" "}
          {formatDhb(lock.requirement)} DHB — what it cost when you earned it —
          whatever the ladder does after.
        </Text>
      ) : null}
    </View>
  );
}

export default BadgeProgress;
