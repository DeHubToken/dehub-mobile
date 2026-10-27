import React, { useCallback, useMemo, useState } from "react";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ScreenHeader from "../components/ScreenHeader";
import ScheduleSheet, { type ScheduleKind } from "../components/Upload/ScheduleSheet";
import Icon from "../components/ui/Icon";
import { PageEmpty, PageSection, PageTabs, useKitColors } from "../components/page/PageKit";
import { useUser } from "../context/AuthContext";
import { appLocale } from "../libs/date.util";
import { countdownParts, useMinuteTick } from "../libs/countdown";
import { getImageUrl } from "../libs/misc";
import { withWalletHeader } from "../libs/supabase-wallet-client";
import { toastError, toastSuccess } from "../libs/toast";
import { getUserScheduledLives } from "../services/live.service";
import { deletePost } from "../services/nft.service";
import { getMyScheduledPosts, moveScheduledLive, moveScheduledPost } from "../services/scheduled.service";
import { supabase } from "../services/supabase";

interface PlannedItem {
  key: string;
  kind: ScheduleKind;
  title: string;
  at: Date;
  image?: string | null;
  tokenId?: number | null;
  streamId?: string;
  spaceId?: string;
}

type Filter = "all" | ScheduleKind;

const KIND_ICON: Record<ScheduleKind, string> = { post: "FileText", live: "Radio", stage: "Mic" };

/**
 * Everything you have scheduled, in one list: posts, Lives and Stages, soonest
 * first and grouped by day. Same page as dehubweb /app/planned.
 */
export default function PlannedScreen() {
  const { t } = useTranslation();
  const c = useKitColors();
  const user = useUser() as { walletAddress?: string; address?: string } | null;
  const wallet = (user?.walletAddress || user?.address || "").toLowerCase();
  const queryClient = useQueryClient();
  const now = useMinuteTick();
  const locale = appLocale();
  const [filter, setFilter] = useState<Filter>("all");
  const [moving, setMoving] = useState<PlannedItem | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const posts = useQuery({ queryKey: ["planned-posts", wallet], queryFn: getMyScheduledPosts, enabled: !!wallet, staleTime: 15_000 });
  const lives = useQuery({ queryKey: ["planned-lives", wallet], queryFn: () => getUserScheduledLives(wallet), enabled: !!wallet, staleTime: 15_000 });
  const stages = useQuery({
    queryKey: ["planned-stages", wallet],
    enabled: !!wallet,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audio_spaces")
        .select("id,title,scheduled_at,cover_image_url,host_wallet_address")
        .eq("status", "scheduled")
        .ilike("host_wallet_address", wallet)
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return (data || []) as { id: string; title: string; scheduled_at: string; cover_image_url?: string | null }[];
    },
  });

  const items = useMemo<PlannedItem[]>(() => {
    const list: PlannedItem[] = [];
    for (const p of posts.data || []) {
      const img = p.imageUrls?.[0] || p.imageUrl;
      list.push({
        key: `post-${p.tokenId}`,
        kind: "post",
        title: p.name || p.description || t("planned.untitledPost", { defaultValue: "Post" }),
        at: new Date(p.scheduledAt),
        image: img ? getImageUrl(img, 120) : null,
        tokenId: p.tokenId,
      });
    }
    for (const l of lives.data || []) {
      if (!l.scheduleAt) continue;
      list.push({
        key: `live-${l.streamId}`,
        kind: "live",
        title: l.name || t("planned.untitledLive", { defaultValue: "Live" }),
        at: new Date(l.scheduleAt),
        image: l.thumbnailUrl ? getImageUrl(l.thumbnailUrl, 120) : null,
        tokenId: l.tokenId,
        streamId: l.streamId,
      });
    }
    for (const s of stages.data || []) {
      list.push({ key: `stage-${s.id}`, kind: "stage", title: s.title, at: new Date(s.scheduled_at), image: s.cover_image_url, spaceId: s.id });
    }
    return list.filter((i) => !Number.isNaN(i.at.getTime())).sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [posts.data, lives.data, stages.data, t]);

  const shown = filter === "all" ? items : items.filter((i) => i.kind === filter);
  const days = useMemo(() => {
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    const groups: { label: string; items: PlannedItem[] }[] = [];
    for (const item of shown) {
      const label = same(item.at, today)
        ? t("whenSheet.today", { defaultValue: "Today" })
        : same(item.at, tomorrow)
          ? t("whenSheet.tomorrow", { defaultValue: "Tomorrow" })
          : item.at.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "short" });
      const last = groups[groups.length - 1];
      if (last?.label === label) last.items.push(item);
      else groups.push({ label, items: [item] });
    }
    return groups;
  }, [shown, t, locale]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["planned-posts"] });
    void queryClient.invalidateQueries({ queryKey: ["planned-lives"] });
    void queryClient.invalidateQueries({ queryKey: ["planned-stages"] });
  }, [queryClient]);

  const run = async (item: PlannedItem, job: () => Promise<unknown>, done?: string) => {
    if (busy) return;
    setBusy(item.key);
    try {
      await job();
      if (done) toastSuccess(done);
      refresh();
    } catch (err: any) {
      toastError(err?.message || t("planned.moveFailed", { defaultValue: "Could not move it. Try again." }));
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  const move = (item: PlannedItem, at: Date) =>
    run(
      item,
      async () => {
        if (item.kind === "post" && item.tokenId != null) await moveScheduledPost(item.tokenId, at);
        else if (item.kind === "live" && item.streamId) await moveScheduledLive(item.streamId, at);
        else if (item.kind === "stage" && item.spaceId) {
          const { error } = await withWalletHeader(
            supabase.from("audio_spaces").update({ scheduled_at: at.toISOString() }).eq("id", item.spaceId).eq("status", "scheduled"),
            wallet,
          );
          if (error) throw error;
        }
      },
      t("planned.moved", {
        defaultValue: "Moved to {{when}}",
        when: at.toLocaleString(locale, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
      }),
    );

  const cancel = (item: PlannedItem) => {
    if (confirming !== item.key) {
      setConfirming(item.key);
      return;
    }
    if (item.kind === "stage" && item.spaceId) {
      void run(item, async () => {
        const { error } = await withWalletHeader(supabase.from("audio_spaces").delete().eq("id", item.spaceId!).eq("status", "scheduled"), wallet);
        if (error) throw error;
      }, t("planned.cancelled", { defaultValue: "Cancelled" }));
    } else if (item.tokenId != null) {
      void run(item, () => deletePost(item.tokenId!), t("planned.cancelled", { defaultValue: "Cancelled" }));
    }
  };

  const loading = !!wallet && (posts.isLoading || lives.isLoading || stages.isLoading);
  const chip = (active = false) => [styles.chip, { backgroundColor: active ? c.activeBg : c.chipBg, borderWidth: c.isMinimal && !active ? 1 : 0, borderColor: c.hairline }];

  return (
    <View className="flex-1 bg-theme-neutrals-1000">
      <ScreenHeader
        title={t("planned.title", { defaultValue: "Planned" })}
        subtitle={t("planned.subtitle", { defaultValue: "Posts, Lives and Stages you have scheduled" })}
        icon="events"
        tabs={
          <PageTabs
            value={filter}
            onChange={setFilter}
            tabs={[
              { id: "all", label: t("planned.all", { defaultValue: "All" }) },
              { id: "post", label: t("planned.posts", { defaultValue: "Posts" }) },
              { id: "live", label: t("planned.lives", { defaultValue: "Lives" }) },
              { id: "stage", label: t("planned.stages", { defaultValue: "Stages" }) },
            ]}
          />
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 120, gap: 12 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor="#FFFFFF" />}
      >
        {!wallet ? (
          <PageEmpty icon="events" title={t("planned.signIn", { defaultValue: "Sign in to see what you have planned" })} />
        ) : loading ? (
          <PageEmpty icon="events" title={t("planned.loading", { defaultValue: "Loading…" })} />
        ) : !days.length ? (
          <PageEmpty
            icon="events"
            title={t("planned.emptyTitle", { defaultValue: "Nothing planned yet" })}
            body={t("planned.emptyBody", { defaultValue: 'Pick "When?" while making a post, Live or Stage and it shows up here.' })}
          />
        ) : (
          days.map((day) => (
            <PageSection key={day.label} eyebrow={day.label} flush>
              {day.items.map((item) => {
                const countdown = countdownParts(item.at, now);
                const kindLabel =
                  item.kind === "post"
                    ? t("planned.post", { defaultValue: "Post" })
                    : item.kind === "live"
                      ? t("planned.live", { defaultValue: "Live" })
                      : t("planned.stage", { defaultValue: "Stage" });
                const time = item.at.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
                const isBusy = busy === item.key;
                return (
                  <View key={item.key} style={styles.row}>
                    <View style={[styles.thumb, { backgroundColor: c.chipBg }]}>
                      {item.image ? (
                        <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      ) : (
                        <Icon name={KIND_ICON[item.kind] as any} size={20} color="rgba(255,255,255,0.6)" />
                      )}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={styles.title}>{item.title}</Text>
                      <Text numberOfLines={1} style={styles.meta}>
                        {kindLabel} · {time}
                        {countdown ? ` · ${t("whenSheet.startsIn", { defaultValue: "Starts in {{time}}", time: countdown })}` : ""}
                      </Text>
                      <View style={styles.actions}>
                        <Pressable disabled={isBusy} onPress={() => setMoving(item)}>
                          <View style={chip()}><Text style={[styles.chipText, { color: c.chipInk }]}>{t("planned.move", { defaultValue: "Move" })}</Text></View>
                        </Pressable>
                        {item.kind === "post" ? (
                          <Pressable
                            disabled={isBusy}
                            onPress={() => void run(item, () => moveScheduledPost(item.tokenId!, "now"), t("planned.postingNow", { defaultValue: "Posting in under a minute" }))}
                          >
                            <View style={chip()}><Text style={[styles.chipText, { color: c.chipInk }]}>{t("planned.postNow", { defaultValue: "Post now" })}</Text></View>
                          </Pressable>
                        ) : null}
                        <Pressable disabled={isBusy} onPress={() => cancel(item)}>
                          <View style={chip(confirming === item.key)}>
                            <Text style={[styles.chipText, { color: confirming === item.key ? c.activeInk : c.chipInk }]}>
                              {confirming === item.key
                                ? t("planned.confirmCancel", { defaultValue: "Tap again to cancel" })
                                : t("planned.cancel", { defaultValue: "Cancel" })}
                            </Text>
                          </View>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })}
            </PageSection>
          ))
        )}
      </ScrollView>

      <ScheduleSheet
        visible={!!moving}
        onClose={() => setMoving(null)}
        scheduledDate={moving?.at ?? null}
        kind={moving?.kind ?? "post"}
        minimumMinutes={moving?.kind === "live" ? 30 : 0}
        moving
        onSchedule={(date) => {
          const item = moving;
          setMoving(null);
          if (item && date) void move(item, date);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  thumb: { width: 48, height: 48, borderRadius: 10, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  title: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  meta: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip: { height: 32, borderRadius: 10, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  chipText: { fontSize: 12, fontWeight: "600" },
});
