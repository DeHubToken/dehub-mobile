/**
 * Boost Sheet
 * ===========
 * Spending one of a badge holder's SuperPowers on a post. Opened from the post
 * options menu, which is where it will actually get used — nobody navigates to
 * a screen to boost something; they finish a post and want it seen.
 *
 * Mirror of web's `BoostModal`. Three decisions worth keeping:
 *
 * **It offers a choice.** The first cut inferred one power from the post's age,
 * which was right while Boost and Second Wind were the only two — they split
 * one job by age. Four of the six built have nothing to do with age, so
 * inferring silently hides most of what a holder has paid for. The age rule
 * survives where it belongs: Boost and Second Wind stay mutually exclusive and
 * only the one that suits the post is listed.
 *
 * **The server is the authority on what is spendable.** `status.powers` says
 * what is unlocked and what is built; nothing here keeps its own table. The
 * client draws a badge from a live read that deliberately over-reports, so a
 * local answer would offer powers the server refuses.
 *
 * **The copy never promises the top spot outright.** The slot rotates, weighted
 * by tier — what is bought is a window plus a share of voice inside it.
 */
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Image, TextInput, ScrollView } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import { ScreenNames } from "../../navigation/ScreenNames";
import { getBadgeUrl } from "../../libs";
import { getNFT } from "../../services/nft.service";
import { useBookBoost, useSuperpowerLadder, useSuperpowers } from "../../hooks/useSuperpowers";
import { spendablePowers, type SuperPowerKey } from "../../services/superpower.service";
import { toastError, toastSuccess } from "../../libs";

export interface BoostSheetProps {
  visible: boolean;
  onClose: () => void;
  tokenId: number | string | undefined;
  postTitle?: string;
  /**
   * Whether the viewer wrote this post.
   *
   * Decides which HALF of the ladder is spendable on it: a gift only lands on
   * somebody else's post, everything else only on your own. Left undefined by
   * a caller that does not know, in which case nothing is hidden and the
   * server's refusal is still the authority.
   */
  isOwnPost?: boolean;
}

/** Lucide keys — the shared `Icon` component is lucide, not Ionicons. */
const ICONS: Partial<Record<SuperPowerKey, string>> = {
  boost: "Rocket",
  second_wind: "History",
  timeline_bomber: "Radio",
  signal_flare: "Siren",
  flak_jacket: "Shield",
  precision_strike: "Crosshair",
  harpoon: "Target",
  deep_current: "Gift",
};

export default function BoostSheet({
  visible,
  onClose,
  tokenId,
  postTitle,
  isOwnPost,
}: BoostSheetProps) {
  const navigation = useNavigation<any>();
  const { data: status, isLoading, isError } = useSuperpowers();
  const { data: ladder } = useSuperpowerLadder();
  const bookBoost = useBookBoost();

  const [chosen, setChosen] = useState<SuperPowerKey | null>(null);
  const [targetAccount, setTargetAccount] = useState("");
  const [targetTiers, setTargetTiers] = useState<string[]>([]);

  // The post's real timestamp, fetched rather than taken from the card a caller
  // happens to hold. Feed rows carry a display string in some places, and
  // getting the age wrong means offering the wrong half of the Boost/Second
  // Wind pair. One cached request when the sheet opens is the cheaper mistake.
  const { data: postInfo } = useQuery({
    queryKey: ["boosted-post", String(tokenId ?? "")],
    queryFn: () => getNFT(tokenId!),
    enabled: visible && tokenId != null,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const powers = useMemo(
    () => spendablePowers(status, (postInfo as any)?.result?.createdAt, isOwnPost),
    [status, postInfo, isOwnPost],
  );

  // Default to the first one they can actually spend, so the common case is
  // one tap. Resets between openings.
  useEffect(() => {
    if (!visible) {
      setChosen(null);
      setTargetAccount("");
      setTargetTiers([]);
      return;
    }
    if (chosen) return;
    setChosen(powers.find(p => p.enabled)?.key ?? powers[0]?.key ?? null);
  }, [visible, powers, chosen]);

  const active = powers.find(p => p.key === chosen);
  const numericTokenId = Number(tokenId);

  const targetingSatisfied =
    active?.targeting === "account"
      ? targetAccount.trim().length > 0
      : active?.targeting === "tiers"
        ? targetTiers.length > 0
        : true;

  const canBook =
    !!status && !!active?.enabled && targetingSatisfied && Number.isFinite(numericTokenId);

  const badgeUrl = status?.tier ? getBadgeUrl(status.badgeBalance) : null;
  const tierNames = (ladder?.tiers ?? []).map(r => r.name).filter(Boolean) as string[];

  const refillsOn = status?.cycleEndsAt
    ? new Date(status.cycleEndsAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })
    : null;

  const handleBoost = () => {
    if (!canBook || !chosen) return;
    bookBoost.mutate(
      {
        tokenId: numericTokenId,
        power: chosen,
        targetAccount: active?.targeting === "account" ? targetAccount.trim() : undefined,
        targetTiers: active?.targeting === "tiers" ? targetTiers : undefined,
      },
      {
        onSuccess: booking => {
          toastSuccess(`${active?.label} running for ${booking.minutes} minutes`);
          onClose();
        },
        // The server writes these sentences for a person to read — "That
        // account is private and cannot be targeted", "You have used all 2 of
        // your boosts this cycle". Show its words rather than a generic failure.
        onError: (error: any) => toastError(error?.message || "Could not boost that post"),
      },
    );
  };

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom">
      <View className="px-5 pb-8 pt-4">
        <View className="mb-4 flex-row items-center gap-2">
          <Icon name="Rocket" size={20} color="#fff" />
          <Text className="text-lg font-semibold text-white">SuperPowers</Text>
        </View>

        {isLoading ? (
          <View className="py-10">
            <ActivityIndicator color="#fff" />
          </View>
        ) : isError ? (
          // A failed request is not the same as no badge. Telling a Meglodon to
          // go and stake because the API blipped is worse than saying nothing.
          <View className="items-center gap-3 py-8">
            <Text className="text-center text-sm text-white">
              Could not load your SuperPowers just now. Try again in a moment.
            </Text>
          </View>
        ) : !status?.tier ? (
          // No badge at all. Not an error — an invitation, with the one thing
          // they can do about it.
          <View className="items-center gap-4 py-4">
            <Icon name="Lock" size={28} color="#71717A" />
            <Text className="text-center text-sm text-white">
              SuperPowers need a staking badge. Stake DHB to unlock them.
            </Text>
            <Pressable
              onPress={() => {
                onClose();
                navigation.navigate(ScreenNames.Dpay, { initialTab: "stake" });
              }}
              className="rounded-xl border border-white/20 px-5 py-3"
            >
              <Text className="text-sm text-white">Stake DHB</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView className="max-h-[70%]" contentContainerClassName="gap-4">
            {!!postTitle && (
              <Text numberOfLines={2} className="text-xs text-zinc-400">
                {postTitle}
              </Text>
            )}

            <View className="flex-row items-center gap-3 rounded-2xl bg-white/5 p-4">
              {!!badgeUrl && (
                <Image source={badgeUrl} style={{ width: 36, height: 36 }} resizeMode="contain" />
              )}
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-medium text-white">{status.tier}</Text>
                {/* Two numbers when there are two pots. A Signal Flare comes
                    out of a second allowance the same size as the boost one,
                    so one figure covering both tells an Octopus who has spent
                    their boosts that they have no flares either. */}
                <Text className="text-xs text-zinc-400">
                  {status.boostsLeft} of {status.boostsPerCycle} boosts left
                  {status.signalsLeft !== undefined
                    ? ` · ${status.signalsLeft} flares`
                    : ""}
                  {refillsOn ? ` · refills ${refillsOn}` : ""}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-lg font-semibold text-white">{status.minutesPerBoost}</Text>
                <Text className="text-[10px] uppercase tracking-wider text-zinc-500">minutes</Text>
              </View>
            </View>

            {/* The chooser. Locked rungs are shown rather than hidden — seeing
                what the next tier buys is the reason to climb to it. */}
            <View className="gap-1.5">
              {powers.map(power => {
                const isChosen = power.key === chosen;
                return (
                  <Pressable
                    key={power.key}
                    onPress={() => power.enabled && setChosen(power.key)}
                    disabled={!power.enabled}
                    className={`flex-row items-start gap-3 rounded-xl border p-3 ${
                      isChosen ? "border-white/30 bg-white/10" : "border-white/10 bg-white/[0.02]"
                    } ${power.enabled ? "" : "opacity-50"}`}
                  >
                    <Icon name={(ICONS[power.key] ?? "Rocket") as any} size={16} color="#D4D4D8" />
                    <View className="min-w-0 flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-sm text-white">{power.label}</Text>
                        {isChosen && power.enabled && (
                          <Icon name="Check" size={13} color="#F4F4F5" />
                        )}
                      </View>
                      <Text className="text-xs text-zinc-500">
                        {power.blockedReason || power.summary}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {active?.targeting === "account" && (
              <View className="gap-1.5">
                <Text className="text-xs text-zinc-400">Whose followers should see it?</Text>
                <TextInput
                  value={targetAccount}
                  onChangeText={setTargetAccount}
                  placeholder="Username or wallet address"
                  placeholderTextColor="#52525B"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
                />
              </View>
            )}

            {active?.targeting === "tiers" && (
              <View className="gap-1.5">
                <Text className="text-xs text-zinc-400">Which badge tiers should see it?</Text>
                <View className="flex-row flex-wrap gap-1.5">
                  {tierNames.map(name => {
                    const picked = targetTiers.includes(name);
                    return (
                      <Pressable
                        key={name}
                        onPress={() =>
                          setTargetTiers(prev =>
                            prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name],
                          )
                        }
                        className={`rounded-full border px-3 py-1 ${
                          picked ? "border-white/40 bg-white/15" : "border-white/10"
                        }`}
                      >
                        <Text className={`text-xs ${picked ? "text-white" : "text-zinc-400"}`}>
                          {name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* The honest sentence. The slot rotates and a higher tier is dealt
                more often, so what is bought is a window plus a share of voice
                — never sole possession of the top of the feed. */}
            <Text className="text-xs text-zinc-500">
              The boost slot rotates. When several boosts are running, viewers are dealt one
              weighted by badge tier — a higher tier is shown more often, and everybody gets the
              window they were granted.
            </Text>

            <Pressable
              onPress={handleBoost}
              disabled={!canBook || bookBoost.isPending}
              className={`items-center rounded-xl bg-white px-5 py-4 ${
                !canBook || bookBoost.isPending ? "opacity-40" : ""
              }`}
            >
              {bookBoost.isPending ? (
                <ActivityIndicator color="#09090B" />
              ) : (
                <Text className="text-sm font-semibold text-[#09090B]">
                  {/* The reason THIS power cannot be spent, rather than a flat
                      "no boosts left" that is wrong for a Signal Flare. */}
                  {!active?.enabled && active?.blockedReason
                    ? active.blockedReason
                    : `${active?.label ?? "Spend"} for ${status.minutesPerBoost} minutes`}
                </Text>
              )}
            </Pressable>
          </ScrollView>
        )}
      </View>
    </GlassModal>
  );
}
