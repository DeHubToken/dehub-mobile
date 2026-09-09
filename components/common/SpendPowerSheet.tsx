/**
 * Spend one SuperPower, from the SuperPowers screen
 * =================================================
 * Native port of web's `SpendPowerDrawer`. Every bento on the SuperPowers
 * screen that this account actually holds is a button, and this is what opens
 * behind it.
 *
 * The screen used to tick a power and then leave you to find the surface it is
 * spent from — a post's options sheet, a comment, a Stage. At Cobra that was
 * five ticks and one control; at Meglodon it is thirteen ticks and two, which
 * reads as eleven powers that do not work. They all work. What they need is a
 * target, and picking the target is the whole job of this sheet.
 *
 * **One box, two behaviours.** The post picker takes a search term *or* a
 * pasted link. Paste `https://dehub.io/app/post/2008`, the path, or the bare
 * number and it resolves that one post; type anything else and it searches.
 *
 * **Only offer what the server will accept.** Every refusal in the API's
 * `superpower.service.ts` runs before the allowance is taken, so a bad pick
 * costs nothing — but it still reads as broken, which is the thing being
 * fixed. Boost lists only posts under a week old and Second Wind only older
 * ones, Deep Current hides your own, Front Row lists only Stages you host that
 * have not ended. One rule stays with the server: Comment Anchor's "somebody
 * else's thread", because the comments endpoint does not return the post's
 * author and one request per row would spend the throttle budget on a list
 * that is mostly never picked.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Image,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import { useBookBoost, useSuperpowerLadder, useSuperpowers } from "../../hooks/useSuperpowers";
import {
  powerHome,
  waitForSignalFlareReceipt,
  type SuperPowerInfo,
} from "../../services/superpower.service";
import { ageSuits, postIdFromInput, FRONT_ROW_STATUSES } from "../../libs/spendPowerTarget";
import { getNFT, getNFTs, getCategoriesCached } from "../../services/nft.service";
import { getUserReplies } from "../../services/user.service";
import { supabase } from "../../services/supabase";
import { getImageUrl, toastError, toastPromise, toastSuccess } from "../../libs";

interface SpendPowerSheetProps {
  /** The power being spent. Null keeps the sheet closed. */
  power: SuperPowerInfo | null;
  address?: string | null;
  onClose: () => void;
}

export default function SpendPowerSheet({ power, address, onClose }: SpendPowerSheetProps) {
  const { t } = useTranslation();
  const { data: status } = useSuperpowers();
  const { data: ladder } = useSuperpowerLadder();
  const book = useBookBoost();

  const [query, setQuery] = useState("");
  const [pickedPost, setPickedPost] = useState<number | null>(null);
  const [pickedComment, setPickedComment] = useState<string | null>(null);
  const [pickedStage, setPickedStage] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [targetAccount, setTargetAccount] = useState("");
  const [targetTiers, setTargetTiers] = useState<string[]>([]);

  const visible = !!power;
  const home = power ? powerHome(power.key) : "post";
  const me = address?.toLowerCase();

  // Reset between openings. A sheet that remembers the post you picked for a
  // different power is one tap from spending on the wrong thing.
  useEffect(() => {
    if (visible) return;
    setQuery("");
    setPickedPost(null);
    setPickedComment(null);
    setPickedStage(null);
    setCategory("");
    setTargetAccount("");
    setTargetTiers([]);
  }, [visible]);

  const pastedId = postIdFromInput(query);
  const wantsPosts = visible && (home === "post" || home === "gift");

  const { data: pasted, isFetching: resolvingPaste } = useQuery({
    queryKey: ["spend-power-paste", pastedId],
    queryFn: () => getNFT(pastedId!),
    enabled: wantsPosts && pastedId !== null,
    retry: false,
    staleTime: 60_000,
  });

  const { data: found, isFetching: searching } = useQuery({
    queryKey: ["spend-power-search", home, me, query],
    queryFn: () =>
      getNFTs({
        minter: home === "gift" ? undefined : me,
        search: query.trim() || undefined,
        sortMode: "new",
        unit: 30,
        page: 0,
      }),
    enabled: wantsPosts && pastedId === null && (home !== "gift" || query.trim().length > 1),
    staleTime: 30_000,
  });

  const { data: replies, isFetching: loadingComments } = useQuery({
    queryKey: ["spend-power-comments", me],
    queryFn: () => getUserReplies({ address: me!, page: 1, limit: 30 }),
    enabled: visible && home === "comment" && !!me,
    staleTime: 30_000,
  });

  const { data: stages, isFetching: loadingStages } = useQuery({
    queryKey: ["spend-power-stages", me],
    queryFn: async () => {
      const { data } = await supabase
        .from("audio_spaces")
        .select("id, title, status")
        .ilike("host_wallet_address", me!)
        .in("status", FRONT_ROW_STATUSES)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
    enabled: visible && home === "stage" && !!me,
    staleTime: 30_000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["dehub-categories"],
    queryFn: () => getCategoriesCached(),
    enabled: visible && power?.key === "trend_jacker",
    staleTime: 60 * 60 * 1000,
  });

  const tierNames = ((ladder?.tiers ?? []) as any[])
    .map(row => row.name)
    .filter(Boolean) as string[];

  const posts = useMemo(() => {
    const rows: any[] =
      pastedId !== null
        ? (pasted as any)?.result
          ? [(pasted as any).result]
          : []
        : ((found as any)?.result ?? []);
    return rows.filter(row => {
      if (!ageSuits(power?.key, row?.createdAt)) return false;
      if (home !== "gift") return true;
      // A gift only lands on somebody else's post. An unknown author is left in
      // and refused by the server rather than hidden.
      const author = row?.minter ? String(row.minter).toLowerCase() : null;
      return !author || !me || author !== me;
    });
  }, [pastedId, pasted, found, power?.key, home, me]);

  const signals = power?.key === "signal_flare";
  const left = signals
    ? (status?.signalsLeft ?? status?.boostsLeft ?? 0)
    : (status?.boostsLeft ?? 0);

  const targetChosen =
    home === "page"
      ? power?.key !== "trend_jacker" || !!category
      : home === "comment"
        ? !!pickedComment
        : home === "stage"
          ? !!pickedStage
          : pickedPost !== null;

  const targetingChosen =
    power?.key === "precision_strike"
      ? targetAccount.trim().length > 0
      : power?.key === "harpoon"
        ? targetTiers.length > 0
        : true;

  const canSpend = !!power && left > 0 && targetChosen && targetingChosen && !book.isPending;

  const handleSpend = () => {
    if (!power || !canSpend) return;
    book.mutate(
      {
        tokenId: home === "post" || home === "gift" ? (pickedPost as number) : 0,
        power: power.key,
        category: power.key === "trend_jacker" ? category : undefined,
        commentId: home === "comment" ? (pickedComment as string) : undefined,
        stageId: home === "stage" ? (pickedStage as string) : undefined,
        targetAccount: power.key === "precision_strike" ? targetAccount.trim() : undefined,
        targetTiers: power.key === "harpoon" ? targetTiers : undefined,
      },
      {
        onSuccess: (booking: any) => {
          if (power.key === "signal_flare") {
            void toastPromise(waitForSignalFlareReceipt(booking.id), {
              loading: "Signal Flare sent. Counting notifications...",
              success: recipients =>
                recipients === null
                  ? "Signal Flare sent. The final count will appear in Past usage."
                  : `Signal Flare notified ${recipients} ${recipients === 1 ? "person" : "people"}`,
            });
          } else {
            toastSuccess(
              t("superpowers.spentFor", {
                power: power.label,
                minutes: booking?.minutes,
                defaultValue: `${power.label} running for ${booking?.minutes} minutes`,
              }),
            );
          }
          onClose();
        },
        // The server writes these sentences for a person to read — "Post in
        // that category first", "That post is over a week old". Show them.
        onError: (error: any) =>
          toastError(error?.message || t("superpowers.boostFailed", { defaultValue: "Could not spend that" })),
      },
    );
  };

  const loadingPosts = resolvingPaste || searching;

  const row = (picked: boolean) =>
    `flex-row items-center gap-3 rounded-2xl border p-3 ${
      picked ? "border-white/40 bg-white/10" : "border-white/10"
    }`;

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom">
      <View className="px-5 pb-8 pt-4">
        <View className="mb-3 flex-row items-center justify-between gap-3">
          <Text className="text-lg font-semibold text-white">{power?.label}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Icon name="X" size={18} color="#A1A1AA" />
          </Pressable>
        </View>

        <ScrollView className="max-h-[70%]" contentContainerClassName="gap-3">
          <Text className="text-[13px] leading-5 text-zinc-400">{power?.summary}</Text>

          {home === "page" && power?.key !== "trend_jacker" ? (
            <Text className="text-xs text-zinc-500">
              {t("superpowers.actsOnAccount", {
                defaultValue: "This one acts on your whole account — there is nothing to choose.",
              })}
            </Text>
          ) : null}

          {power?.key === "trend_jacker" ? (
            <View className="flex-row flex-wrap gap-2">
              {categories.map(name => {
                const picked = category === name;
                return (
                  <Pressable
                    key={name}
                    onPress={() => setCategory(picked ? "" : name)}
                    className={`rounded-full border px-3 py-1.5 ${
                      picked ? "border-white/40 bg-white/15" : "border-white/10"
                    }`}
                  >
                    <Text className={`text-xs ${picked ? "text-white" : "text-zinc-400"}`}>{name}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {home === "post" || home === "gift" ? (
            <>
              <View className="flex-row items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
                <Icon name="Search" size={16} color="#71717A" />
                <TextInput
                  value={query}
                  onChangeText={text => {
                    setQuery(text);
                    setPickedPost(null);
                  }}
                  placeholder={
                    home === "gift"
                      ? t("superpowers.findTheirPost", {
                          defaultValue: "Paste their post link, or search",
                        })
                      : t("superpowers.findMyPost", {
                          defaultValue: "Search your posts, or paste a link",
                        })
                  }
                  placeholderTextColor="#71717A"
                  autoCapitalize="none"
                  autoCorrect={false}
                  // 16px or iOS zooms the whole sheet on focus.
                  className="flex-1 py-3 text-[16px] text-white"
                />
              </View>

              {loadingPosts ? (
                <View className="py-6">
                  <ActivityIndicator color="#fff" />
                </View>
              ) : null}

              {!loadingPosts && posts.length === 0 ? (
                <Text className="py-4 text-xs text-zinc-500">
                  {home === "gift" && query.trim().length < 2
                    ? t("superpowers.searchToGift", {
                        defaultValue: "Search for a post, or paste a link to one.",
                      })
                    : power?.key === "boost"
                      ? t("superpowers.noRecentPosts", {
                          defaultValue:
                            "Nothing here from the last week. Anything older takes a Second Wind.",
                        })
                      : power?.key === "second_wind"
                        ? t("superpowers.noOlderPosts", {
                            defaultValue:
                              "Nothing here older than a week. Anything newer takes a Boost.",
                          })
                        : t("superpowers.noPostsFound", { defaultValue: "No posts found." })}
                </Text>
              ) : null}

              {posts.map((post: any) => {
                const id = Number(post.tokenId);
                const picked = pickedPost === id;
                const thumb = getImageUrl(post.imageUrl || post.thumbnailUrl || "", 96);
                const postText = String(post.description ?? "").trim();
                const postTitle = String(post.name ?? "").trim();
                const hasVideo = Boolean(
                  post.videoUrl || post.media_url || post.postType === "video" || post.media_type === "video",
                );
                return (
                  <Pressable
                    key={id}
                    onPress={() => setPickedPost(picked ? null : id)}
                    className={row(picked)}
                  >
                    {thumb ? (
                      <Image
                        source={{ uri: thumb }}
                        resizeMode="cover"
                        className="h-14 w-14 rounded-xl bg-white/5"
                      />
                    ) : (
                      <View className="h-14 w-14 items-center justify-center rounded-xl bg-white/[0.07]">
                        <Icon name={hasVideo ? "Play" : "SquarePen"} size={22} color="#A1A1AA" />
                      </View>
                    )}
                    <View className="min-w-0 flex-1">
                      <Text numberOfLines={2} className="text-sm leading-5 text-white">
                        {postText || postTitle || `Post #${id}`}
                      </Text>
                      {postText && postTitle && postText !== postTitle ? (
                        <Text numberOfLines={1} className="mt-0.5 text-[11px] text-zinc-400">
                          {postTitle}
                        </Text>
                      ) : null}
                      <Text className="mt-0.5 text-[11px] text-zinc-500">
                        {post.createdAt ? new Date(post.createdAt).toLocaleDateString() : `#${id}`}
                      </Text>
                    </View>
                    {picked ? <Icon name="Check" size={16} color="#4ADE80" /> : null}
                  </Pressable>
                );
              })}
            </>
          ) : null}

          {home === "comment" ? (
            <>
              <Text className="text-xs text-zinc-500">
                {t("superpowers.anchorNeedsTheirThread", {
                  defaultValue:
                    "An Anchor holds your comment at the top of somebody else's thread — on your own post a pin is already free.",
                })}
              </Text>
              {loadingComments ? (
                <View className="py-6">
                  <ActivityIndicator color="#fff" />
                </View>
              ) : null}
              {!loadingComments && ((replies as any)?.result?.items ?? []).length === 0 ? (
                <Text className="py-4 text-xs text-zinc-500">
                  {t("superpowers.noComments", { defaultValue: "You have not commented yet." })}
                </Text>
              ) : null}
              {(((replies as any)?.result?.items ?? []) as any[]).map(comment => {
                const id = String(comment.id);
                const picked = pickedComment === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => setPickedComment(picked ? null : id)}
                    className={row(picked)}
                  >
                    <View className="min-w-0 flex-1">
                      <Text numberOfLines={2} className="text-sm text-white">
                        {comment.content}
                      </Text>
                      <Text className="text-[11px] text-zinc-500">#{comment.tokenId}</Text>
                    </View>
                    {picked ? <Icon name="Check" size={16} color="#4ADE80" /> : null}
                  </Pressable>
                );
              })}
            </>
          ) : null}

          {home === "stage" ? (
            <>
              {loadingStages ? (
                <View className="py-6">
                  <ActivityIndicator color="#fff" />
                </View>
              ) : null}
              {!loadingStages && (stages ?? []).length === 0 ? (
                <Text className="py-4 text-xs text-zinc-500">
                  {t("superpowers.noStages", {
                    defaultValue: "No Stage of yours is live or scheduled right now.",
                  })}
                </Text>
              ) : null}
              {((stages ?? []) as any[]).map(stage => {
                const picked = pickedStage === stage.id;
                return (
                  <Pressable
                    key={stage.id}
                    onPress={() => setPickedStage(picked ? null : stage.id)}
                    className={row(picked)}
                  >
                    <View className="min-w-0 flex-1">
                      <Text numberOfLines={1} className="text-sm text-white">
                        {stage.title}
                      </Text>
                      <Text className="text-[11px] text-zinc-500">{stage.status}</Text>
                    </View>
                    {picked ? <Icon name="Check" size={16} color="#4ADE80" /> : null}
                  </Pressable>
                );
              })}
            </>
          ) : null}

          {power?.key === "precision_strike" ? (
            <View className="gap-1.5">
              <Text className="text-xs text-zinc-400">
                {t("superpowers.aimAtAccount", { defaultValue: "Whose followers should see it?" })}
              </Text>
              <TextInput
                value={targetAccount}
                onChangeText={setTargetAccount}
                placeholder={t("superpowers.aimPlaceholder", {
                  defaultValue: "Username or wallet address",
                })}
                placeholderTextColor="#71717A"
                autoCapitalize="none"
                autoCorrect={false}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-[16px] text-white"
              />
            </View>
          ) : null}

          {power?.key === "harpoon" ? (
            <View className="gap-1.5">
              <Text className="text-xs text-zinc-400">
                {t("superpowers.aimAtTiers", { defaultValue: "Which badge tiers should see it?" })}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {tierNames.map(name => {
                  const picked = targetTiers.includes(name);
                  return (
                    <Pressable
                      key={name}
                      onPress={() =>
                        setTargetTiers(prev =>
                          prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name],
                        )
                      }
                      className={`rounded-full border px-3 py-1.5 ${
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
          ) : null}
        </ScrollView>

        <Pressable
          onPress={handleSpend}
          disabled={!canSpend}
          className={`mt-4 items-center rounded-xl border border-white/20 py-3 ${
            canSpend ? "bg-white/10" : "opacity-50"
          }`}
        >
          {book.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-sm text-white">
              {left < 1
                ? // A Signal Flare comes out of a second pot the same size as the
                  // boost one, so "no boosts left" is the wrong sentence for it.
                  signals
                  ? t("superpowers.noFlaresLeft", {
                      defaultValue: "No Signal Flares left this cycle",
                    })
                  : t("superpowers.noBoostsLeft", { defaultValue: "No boosts left this cycle" })
                : t("superpowers.spendFor", {
                    power: power?.label ?? "",
                    minutes: status?.minutesPerBoost ?? 0,
                    defaultValue: `${power?.label ?? "Spend"} for ${status?.minutesPerBoost ?? 0} minutes`,
                  })}
            </Text>
          )}
        </Pressable>
      </View>
    </GlassModal>
  );
}
