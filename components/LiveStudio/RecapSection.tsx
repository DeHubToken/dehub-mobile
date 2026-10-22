/**
 * Live Studio's stream recap on a phone. The twin of dehubweb's RecapPanel:
 * what happened on the creator's last stream, or the one they just ended when
 * the broadcaster sends them here with `recap`.
 *
 * Every figure is a trusted one from the stream API: gifts only once the chain
 * paid them, followers who followed during the broadcast.
 */
import React from "react";
import { ActivityIndicator, Share, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import Avatar from "../common/Avatar";
import Icon from "../ui/Icon";
import { getAvatarUrl } from "../../libs/misc";
import { formatStreamDuration, getLastEndedStreamId, getStreamRecap, type StreamRecap } from "../../services/live.service";

interface Props {
  address: string | null | undefined;
  /** A stream to recap instead, e.g. the one just ended. */
  streamId?: string | null;
}

const whole = (n: number) => Math.round(n).toLocaleString();

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="rounded-xl bg-theme-neutrals-800 px-3 py-2.5" style={{ width: "48%" }}>
      <Text className="text-white text-lg font-semibold">{value}</Text>
      <Text className="text-theme-neutrals-400 text-xs">{label}</Text>
    </View>
  );
}

export function RecapSection({ address, streamId }: Props) {
  const { t } = useTranslation();
  const target = useQuery({
    queryKey: ["stream-recap-target", address, streamId ?? null],
    queryFn: async () => streamId || (await getLastEndedStreamId(address || "")),
    enabled: !!(streamId || address),
    staleTime: 60_000,
  });
  const id = target.data ?? null;
  const recap = useQuery<StreamRecap>({
    queryKey: ["stream-recap", id],
    queryFn: () => getStreamRecap(id!),
    enabled: !!id,
    staleTime: 30_000,
    // Just ended: gifts can still be confirming for a minute or two.
    refetchInterval: (q) => (q.state.data && !q.state.data.endedAt ? 30_000 : false),
  });

  if (target.isLoading || recap.isLoading) return <ActivityIndicator color="#a1a1aa" />;
  if (!id) return <Text className="text-theme-neutrals-500 text-sm">{t("liveRecap.none")}</Text>;
  const r = recap.data;
  if (recap.isError || !r) return <Text className="text-theme-neutrals-400 text-sm">{t("liveRecap.loadFailed")}</Text>;

  const share = () => {
    const url = r.tokenId != null ? `https://dehub.io/app/post/${r.tokenId}` : "https://dehub.io";
    const text = t("liveRecap.shareText", {
      title: r.title || t("liveRecap.untitled"),
      duration: formatStreamDuration(r.durationSec),
      peak: whole(r.peakViewers),
      followers: whole(r.newFollowers),
    });
    Share.share({ message: `${text} ${url}`, url }).catch(() => undefined);
  };

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text className="text-white text-sm font-medium" numberOfLines={1}>
            {r.title || t("liveRecap.untitled")}
          </Text>
          {r.startedAt ? (
            <Text className="text-theme-neutrals-500 text-xs">
              {new Date(r.startedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={share}
          accessibilityRole="button"
          className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg border border-theme-neutrals-600"
        >
          <Icon name="Share2" size={14} color="#ffffff" />
          <Text className="text-white text-xs font-medium">{t("liveRecap.share")}</Text>
        </TouchableOpacity>
      </View>

      <View className="flex-row flex-wrap justify-between" style={{ rowGap: 8 }}>
        <Stat label={t("liveRecap.duration")} value={formatStreamDuration(r.durationSec)} />
        <Stat label={t("liveRecap.peakViewers")} value={whole(r.peakViewers)} />
        <Stat label={t("liveRecap.gifts", { count: r.tips.count })} value={`${whole(r.tips.total)} DHB`} />
        <Stat label={t("liveRecap.newFollowers")} value={whole(r.newFollowers)} />
        <Stat label={t("liveRecap.chatMessages")} value={whole(r.chat.messages)} />
        <Stat label={t("liveRecap.chatters")} value={whole(r.chat.chatters)} />
        <Stat label={t("liveRecap.reactions")} value={whole(r.reactions)} />
        {r.shares != null ? <Stat label={t("liveRecap.shares")} value={whole(r.shares)} /> : null}
      </View>

      {r.topTippers.length ? (
        <View className="gap-2">
          <Text className="text-theme-neutrals-400 text-xs font-semibold uppercase">{t("liveRecap.topSupporters")}</Text>
          {r.topTippers.map((p, i) => (
            <View key={p.address} className="flex-row items-center gap-3">
              <Text className="text-theme-neutrals-500 text-sm w-4 text-center">{i + 1}</Text>
              <Avatar uri={getAvatarUrl(p.avatarImageUrl, 28)} size={28} name={p.displayName || p.username} />
              <Text className="text-white text-sm flex-1" numberOfLines={1}>
                {p.displayName || p.username || `${p.address.slice(0, 6)}…`}
              </Text>
              <Text className="text-theme-neutrals-300 text-sm">{whole(p.total)} DHB</Text>
            </View>
          ))}
        </View>
      ) : null}

      {r.polls.length ? (
        <View className="gap-2">
          <Text className="text-theme-neutrals-400 text-xs font-semibold uppercase">{t("liveRecap.polls")}</Text>
          {r.polls.map((p, i) => {
            const top = Math.max(0, ...p.options.map((o) => o.votes));
            const winner = top > 0 ? p.options.find((o) => o.votes === top)?.text : undefined;
            return (
              <View key={i}>
                <Text className="text-white text-sm">{p.question}</Text>
                <Text className="text-theme-neutrals-400 text-xs">
                  {p.options.map((o) => `${o.text} ${o.votes}`).join(" · ")}
                  {winner ? ` — ${t("liveRecap.pollWinner", { option: winner })}` : ""}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
      {!r.endedAt ? <Text className="text-theme-neutrals-500 text-xs">{t("liveRecap.stillCounting")}</Text> : null}
    </View>
  );
}
