/**
 * Boost Sheet
 * ===========
 * Spending one of a badge holder's boosts on a post. Opened from the post
 * options menu, which is where it will actually get used — nobody navigates to
 * a screen to boost something; they finish a post and want it seen.
 *
 * Mirror of web's `BoostModal`. Two decisions worth keeping:
 *
 * **The power is chosen by the post's age, not by the holder.** Boost is for
 * anything under a week; Second Wind is for the archive and unlocks a rung
 * higher. Offering both as a choice would be a quiz about a rule the server is
 * going to enforce anyway, so the sheet reads the age, picks, and says which
 * one it picked.
 *
 * **The copy never promises the top spot outright.** The slot rotates, weighted
 * by tier, so what is being bought is a window in the slot plus a share of
 * voice inside it. That is the sentence that survives the day two whales boost
 * at once.
 */
import React, { useMemo } from "react";
import { View, Text, Pressable, ActivityIndicator, Image } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import { ScreenNames } from "../../navigation/ScreenNames";
import { getBadgeUrl } from "../../libs";
import { getNFT } from "../../services/nft.service";
import { useBookBoost, useSuperpowers } from "../../hooks/useSuperpowers";
import { powerForPostAge } from "../../services/superpower.service";
import { toastError, toastSuccess } from "../../libs";

export interface BoostSheetProps {
  visible: boolean;
  onClose: () => void;
  tokenId: number | string | undefined;
  postTitle?: string;
}

export default function BoostSheet({ visible, onClose, tokenId, postTitle }: BoostSheetProps) {
  const navigation = useNavigation<any>();
  const { data: status, isLoading, isError } = useSuperpowers();
  const bookBoost = useBookBoost();

  // The post's real timestamp, fetched rather than taken from the card a caller
  // happens to hold. Feed rows carry a display string in some places, and
  // getting the age wrong means offering the wrong power and eating a refusal.
  // One cached request when the sheet opens is the cheaper mistake.
  const { data: postInfo } = useQuery({
    queryKey: ["boosted-post", String(tokenId ?? "")],
    queryFn: () => getNFT(tokenId!),
    enabled: visible && tokenId != null,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const power = useMemo(
    () => powerForPostAge((postInfo as any)?.result?.createdAt),
    [postInfo],
  );
  const powerInfo = status?.powers.find(p => p.key === power);

  const numericTokenId = Number(tokenId);
  const canBook =
    !!status &&
    !!powerInfo?.unlocked &&
    !!powerInfo?.available &&
    status.boostsLeft > 0 &&
    Number.isFinite(numericTokenId);

  const badgeUrl = status?.tier ? getBadgeUrl(status.badgeBalance) : null;

  const refillsOn = status?.cycleEndsAt
    ? new Date(status.cycleEndsAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })
    : null;

  const handleBoost = () => {
    if (!canBook || !power) return;
    bookBoost.mutate(
      { tokenId: numericTokenId, power },
      {
        onSuccess: booking => {
          toastSuccess(`Boosted for ${booking.minutes} minutes`);
          onClose();
        },
        // The server writes these sentences for a person to read — "That post
        // is over a week old", "You have used all 2 of your boosts this cycle".
        // Show its words rather than a generic failure.
        onError: (error: any) => toastError(error?.message || "Could not boost that post"),
      },
    );
  };

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom">
      <View className="px-5 pb-8 pt-4">
        <View className="mb-4 flex-row items-center gap-2">
          <Icon name={power === "second_wind" ? "History" : "Rocket"} size={20} color="#fff" />
          <Text className="text-lg font-semibold text-white">
            {power === "second_wind" ? "Second Wind" : "Boost"}
          </Text>
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
          <View className="gap-4">
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
                <Text className="text-xs text-zinc-400">
                  {status.boostsLeft} of {status.boostsPerCycle} boosts left
                  {refillsOn ? ` · refills ${refillsOn}` : ""}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-lg font-semibold text-white">{status.minutesPerBoost}</Text>
                <Text className="text-[10px] uppercase tracking-wider text-zinc-500">minutes</Text>
              </View>
            </View>

            <Text className="text-[13px] text-zinc-400">
              {power === "second_wind"
                ? "This post is over a week old. Second Wind sends it back to the top of the feed."
                : "Puts this post in the slot at the top of the home feed for your window."}
            </Text>

            {/* The honest sentence. The slot rotates and a higher tier is dealt
                more often, so what is bought is a window plus a share of voice
                — never sole possession of the top of the feed. */}
            <Text className="text-xs text-zinc-500">
              The boost slot rotates. When several boosts are running, viewers are dealt one
              weighted by badge tier — a higher tier is shown more often, and everybody gets the
              window they were granted.
            </Text>

            {!!powerInfo && !powerInfo.unlocked && (
              <Text className="text-[13px] text-amber-400">
                {powerInfo.label} unlocks at {powerInfo.tier}
              </Text>
            )}

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
                  {status.boostsLeft < 1
                    ? "No boosts left this cycle"
                    : `Boost for ${status.minutesPerBoost} minutes`}
                </Text>
              )}
            </Pressable>
          </View>
        )}
      </View>
    </GlassModal>
  );
}
