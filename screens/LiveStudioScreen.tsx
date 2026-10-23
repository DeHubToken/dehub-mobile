/**
 * Live Studio on a phone: where a creator builds the overlay every viewer sees
 * over their streams. The twin of dehubweb's /live-studio — the same widgets,
 * settings, test alerts and OBS link — laid out as one scrolling column.
 *
 * Edits are a local draft until Save. Test alerts go through the stream API
 * into the creator's private control room and play on the preview here; they
 * never reach a stream's viewers.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, Switch, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, type RouteProp } from "@react-navigation/native";
import type { AppStackParamList } from "../navigation/types";
import type { ScreenNames } from "../navigation/ScreenNames";
import { useUser } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ScreenHeader from "../components/ScreenHeader";
import Icon from "../components/ui/Icon";
import { DeHubLoader } from "../components/DeHubLoader";
import { SettingsOptionModal } from "../components/Settings/SettingsPrimitives";
import { StudioStage } from "../components/LiveStudio/StudioStage";
import { WidgetSettingsForm } from "../components/LiveStudio/WidgetSettingsForm";
import { OverlayEventContext, createOverlayEventBus } from "../components/LiveOverlay/overlayEvents";
import { createRuleBus, RuleAudio, RuleBusContext } from "../components/LiveOverlay/ruleBus";
import { RulesEditor } from "../components/LiveStudio/RulesEditor";
import { PollEditor } from "../components/LiveStudio/PollEditor";
import { RecapSection } from "../components/LiveStudio/RecapSection";
import { QuickControls } from "../components/LiveStudio/QuickControls";
import { SubathonEditor } from "../components/LiveStudio/SubathonEditor";
import { PointsSection } from "../components/LiveStudio/PointsSection";
import { OverlayCreatorContext, SubathonContext } from "../components/LiveOverlay/subathon";
import { PollContext } from "../components/LiveOverlay/poll";
import { samplePoll, type LivePoll } from "../libs/live-overlay/polls";
import { ModerationEditor } from "../components/LiveStudio/ModerationEditor";
import { useOverlayControlRoom } from "../hooks/useOverlayControlRoom";
import { copyToClipboard, toastError, toastSuccess } from "../libs";
import { OVERLAY_LINK_BASE } from "../config/links";
import { MAX_WIDGETS, OVERLAY_KINDS, isKnownKind, newWidget, type OverlayKind } from "../libs/live-overlay/registry";
import type { OverlayRect, OverlayWidget } from "../libs/live-overlay/types";
import {
  getMyOverlay,
  getMyPoll,
  getMySubathon,
  type MySubathon,
  rotateOverlayToken,
  saveMyOverlay,
  sendOverlayTest,
  type CreatorOverlay,
  type OverlayTestKind,
} from "../services/live.service";

const MY_OVERLAY_KEY = ["my-overlay"] as const;
const TESTS: OverlayTestKind[] = ["tip", "follow", "subscribe", "share", "join"];
const PREVIEW_STATS = { totalTips: 0, followers: 0 };

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View className="rounded-xl bg-theme-neutrals-800 border border-theme-neutrals-700 p-4 gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-white text-[15px] font-semibold">{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export default function LiveStudioScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // The broadcaster sends a creator here with `recap` when they end a stream.
  const route = useRoute<RouteProp<AppStackParamList, ScreenNames.LiveStudio>>();
  const justEnded = route.params?.recap ?? null;
  const user = useUser();
  const myAddress = (user as any)?.address || (user as any)?.walletAddress || null;
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery<CreatorOverlay>({
    queryKey: MY_OVERLAY_KEY,
    queryFn: getMyOverlay,
    staleTime: 15_000,
    // Keeps "OBS connected" honest while the screen is open.
    refetchInterval: 30_000,
  });

  const [widgets, setWidgets] = useState<OverlayWidget[]>([]);
  const [renderIn, setRenderIn] = useState<"app" | "video">("app");
  const [dirty, setDirty] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [portrait, setPortrait] = useState(true);
  const [adding, setAdding] = useState(false);
  const loadedVersion = useRef<number | null>(null);

  // Take the saved overlay as the draft — once, and again whenever a newer
  // version arrives while there is nothing unsaved to lose.
  useEffect(() => {
    if (!data) return;
    if (loadedVersion.current === data.version) return;
    if (dirty && loadedVersion.current !== null) return;
    loadedVersion.current = data.version;
    setWidgets(data.widgets);
    setRenderIn(data.renderIn);
  }, [data, dirty]);

  const edit = (next: OverlayWidget[]) => {
    setWidgets(next);
    setDirty(true);
  };
  const update = (id: string, change: Partial<OverlayWidget>) => edit(widgets.map((w) => (w.id === id ? { ...w, ...change } : w)));
  const move = (id: string, rect: OverlayRect) => update(id, portrait ? { portrait: rect } : { landscape: rect });
  const selected = widgets.find((w) => w.id === selectedId) ?? null;

  const add = (kind: OverlayKind) => {
    setAdding(false);
    if (widgets.length >= MAX_WIDGETS) {
      toastError(t("liveStudio.limit"));
      return;
    }
    const widget = newWidget(kind, widgets);
    edit([...widgets, widget]);
    setSelectedId(widget.id);
  };

  const remove = (id: string) => {
    edit(widgets.filter((w) => w.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const save = useMutation({
    mutationFn: () => saveMyOverlay({ renderIn, widgets }),
    onSuccess: (saved) => {
      loadedVersion.current = saved.version;
      queryClient.setQueryData(MY_OVERLAY_KEY, saved);
      setDirty(false);
      toastSuccess(t("liveStudio.saved"));
    },
    onError: () => toastError(t("liveStudio.saveFailed")),
  });

  const rotate = useMutation({
    mutationFn: rotateOverlayToken,
    onSuccess: (next) => {
      queryClient.setQueryData<CreatorOverlay>(MY_OVERLAY_KEY, (prev) => (prev ? { ...prev, token: next.token, obsConnected: false } : next));
      toastSuccess(t("liveStudio.obs.rotated"));
    },
    onError: () => toastError(t("liveStudio.obs.rotateFailed")),
  });

  const test = useMutation({
    mutationFn: (kind: OverlayTestKind) =>
      sendOverlayTest(kind, kind === "tip" ? { amount: 250_000, message: t("liveStudio.testMessage") } : {}),
    onError: () => toastError(t("liveStudio.testFailed")),
  });

  // The creator's live poll. The preview shows it, or a stand-in so the poll
  // widget can be placed offline.
  const [poll, setPoll] = useState<LivePoll | null>(null);
  const pollRef = useRef<LivePoll | null>(null);
  pollRef.current = poll;
  useEffect(() => {
    let cancelled = false;
    getMyPoll()
      .then((p) => {
        if (!cancelled) setPoll(p);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  // The creator's subathon, kept current by the control room. The preview runs
  // a stand-in countdown so the timer can be placed offline.
  const [subathon, setSubathon] = useState<MySubathon | null>(null);
  useEffect(() => {
    let cancelled = false;
    getMySubathon()
      .then((s) => {
        if (!cancelled) setSubathon(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const previewSubathon = useMemo(
    () =>
      subathon?.running && subathon.endsAt
        ? { running: true, endsAt: subathon.endsAt, lastAdd: null }
        : { running: true, endsAt: new Date(Date.now() + 3_600_000).toISOString(), lastAdd: null },
    [subathon],
  );

  const previewPoll = useMemo(
    () =>
      poll ??
      samplePoll(t("liveStudio.polls.questionPlaceholder"), [
        t("liveStudio.polls.sample.a"),
        t("liveStudio.polls.sample.b"),
        t("liveStudio.polls.sample.c"),
      ]),
    [poll, t],
  );

  const bus = useMemo(() => createOverlayEventBus(), []);
  const ruleBus = useMemo(() => createRuleBus(), []);
  useOverlayControlRoom(
    data?.token,
    (events) => events.forEach((event) => bus.publish(event)),
    (fired) => ruleBus.publish(fired),
    // The socket also carries any stream the app is watching: only our poll counts.
    (incoming) => {
      if (pollRef.current?.id === incoming.id) setPoll(incoming);
      else
        getMyPoll()
          .then(setPoll)
          .catch(() => undefined);
    },
    (update) => setSubathon((prev) => (prev ? { ...prev, running: update.running, endsAt: update.endsAt } : prev)),
  );

  if (isLoading) {
    return (
      <View className="flex-1 bg-theme-neutrals-900">
        <ScreenHeader title={t("liveStudio.title")} canGoBack />
        <View className="flex-1 items-center justify-center">
          <DeHubLoader size={48} />
        </View>
      </View>
    );
  }
  if (isError || !data) {
    return (
      <View className="flex-1 bg-theme-neutrals-900">
        <ScreenHeader title={t("liveStudio.title")} canGoBack />
        <Text className="text-theme-neutrals-400 text-sm p-4">{t("liveStudio.loadFailed")}</Text>
      </View>
    );
  }

  const link = `${OVERLAY_LINK_BASE}${data.token}`;

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title={t("liveStudio.title")} subtitle={t("liveStudio.subtitle")} canGoBack />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 96 }} keyboardShouldPersistTaps="handled">
        <Text className="text-theme-neutrals-400 text-sm">{t("liveStudio.intro")}</Text>

        {justEnded ? (
          <Section title={t("liveRecap.justEnded")}>
            <RecapSection address={myAddress} streamId={justEnded} />
          </Section>
        ) : null}

        <Section title={t("liveStudio.controls.title")}>
          <QuickControls overlay={data} queryKey={MY_OVERLAY_KEY} />
        </Section>

        <Section
          title={t("liveStudio.preview")}
          right={
            <View className="flex-row rounded-lg border border-theme-neutrals-700 p-0.5">
              {[true, false].map((p) => (
                <TouchableOpacity
                  key={String(p)}
                  onPress={() => setPortrait(p)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: portrait === p }}
                  className={`rounded-md px-2.5 py-1 ${portrait === p ? "bg-white" : ""}`}
                >
                  <Text className={`text-xs font-medium ${portrait === p ? "text-[#09090B]" : "text-theme-neutrals-400"}`}>
                    {p ? t("liveStudio.portrait") : t("liveStudio.landscape")}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          }
        >
          <OverlayEventContext.Provider value={bus}>
            <RuleBusContext.Provider value={ruleBus}>
              <RuleAudio playLive={false} />
              <PollContext.Provider value={{ poll: previewPoll, myVote: null, interactive: false }}>
              <SubathonContext.Provider value={previewSubathon}>
              <OverlayCreatorContext.Provider value={myAddress ?? ""}>
                <StudioStage
                  widgets={widgets}
                  portrait={portrait}
                  selectedId={selectedId}
                  stats={PREVIEW_STATS}
                  onSelect={setSelectedId}
                  onMove={move}
                />
              </OverlayCreatorContext.Provider>
              </SubathonContext.Provider>
              </PollContext.Provider>
            </RuleBusContext.Provider>
          </OverlayEventContext.Provider>
          <Text className="text-theme-neutrals-500 text-xs">{t("liveStudio.layoutHintPhone")}</Text>
        </Section>

        <Section title={t("liveStudio.test")}>
          <Text className="text-theme-neutrals-500 text-xs">{t("liveStudio.testHint")}</Text>
          <View className="flex-row flex-wrap gap-2">
            {TESTS.map((kind) => (
              <TouchableOpacity
                key={kind}
                disabled={test.isPending}
                onPress={() => test.mutate(kind)}
                className={`px-3 py-2 rounded-xl border border-theme-neutrals-700 ${test.isPending ? "opacity-40" : ""}`}
              >
                <Text className="text-white text-xs font-medium">{t(`liveStudio.tests.${kind}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>

        <Section
          title={t("liveStudio.widgets")}
          right={
            <TouchableOpacity onPress={() => setAdding(true)} className="flex-row items-center px-3 py-1.5 rounded-xl bg-theme-neutrals-700/60">
              <Icon name="Plus" size={13} color="#fff" />
              <Text className="text-white text-xs font-medium ml-1">{t("liveStudio.addWidget")}</Text>
            </TouchableOpacity>
          }
        >
          {widgets.length === 0 ? (
            <Text className="text-theme-neutrals-500 text-sm">{t("liveStudio.empty")}</Text>
          ) : (
            widgets.map((w) => (
              <View key={w.id} className={`flex-row items-center gap-3 rounded-lg px-2 py-1.5 ${w.id === selectedId ? "bg-theme-neutrals-700/60" : ""}`}>
                <TouchableOpacity className="flex-1" onPress={() => setSelectedId(w.id)}>
                  <Text className="text-white text-sm" numberOfLines={1}>
                    {isKnownKind(w.kind) ? t(`liveStudio.kinds.${w.kind}`) : w.kind}
                  </Text>
                </TouchableOpacity>
                <Switch value={w.enabled} onValueChange={(v) => update(w.id, { enabled: v })} accessibilityLabel={t("liveStudio.visible")} />
                <TouchableOpacity onPress={() => remove(w.id)} accessibilityLabel={t("liveStudio.remove")} className="p-1">
                  <Icon name="Trash2" size={16} color="#a1a1aa" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </Section>

        <Section title={selected ? t(`liveStudio.kinds.${selected.kind}`) : t("liveStudio.settings")}>
          {selected ? (
            <WidgetSettingsForm
              widget={selected}
              portrait={portrait}
              onSettings={(settings) => update(selected.id, { settings })}
              onRect={(rect) => move(selected.id, rect)}
            />
          ) : (
            <Text className="text-theme-neutrals-500 text-sm">{t("liveStudio.selectHint")}</Text>
          )}
        </Section>

        {!justEnded ? (
          <Section title={t("liveRecap.lastStream")}>
            <RecapSection address={myAddress} />
          </Section>
        ) : null}

        <Section title={t("liveStudio.polls.title")}>
          <PollEditor poll={poll} onPoll={setPoll} />
        </Section>

        <Section title={t("liveStudio.subathon.title")}>
          <SubathonEditor subathon={subathon} onChange={setSubathon} />
        </Section>

        <Section title={t("liveStudio.points.title")}>
          <PointsSection address={myAddress} />
        </Section>

        <Section title={t("liveStudio.rules.title")}>
          <RulesEditor hasAlertWidget={widgets.some((w) => w.kind === "rule_alert" && w.enabled)} />
        </Section>

        <Section title={t("liveStudio.moderation.title")}>
          <ModerationEditor />
        </Section>

        <Section
          title={t("liveStudio.obs.title")}
          right={
            <View className={`flex-row items-center px-2 py-0.5 rounded-full ${data.obsConnected ? "bg-emerald-500/15" : "bg-theme-neutrals-700"}`}>
              <View className={`w-1.5 h-1.5 rounded-full mr-1.5 ${data.obsConnected ? "bg-emerald-400" : "bg-theme-neutrals-500"}`} />
              <Text className={`text-[11px] font-medium ${data.obsConnected ? "text-emerald-300" : "text-theme-neutrals-400"}`}>
                {data.obsConnected ? t("liveStudio.obs.connected") : t("liveStudio.obs.notConnected")}
              </Text>
            </View>
          }
        >
          <Text className="text-white text-sm font-medium">{t("liveStudio.obs.showIn")}</Text>
          {(["app", "video"] as const).map((option) => (
            <TouchableOpacity
              key={option}
              onPress={() => {
                setRenderIn(option);
                setDirty(true);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: renderIn === option }}
              className={`rounded-xl border px-3 py-2.5 ${renderIn === option ? "border-white bg-theme-neutrals-700/60" : "border-theme-neutrals-700"}`}
            >
              <Text className="text-white text-sm font-medium">
                {option === "app" ? t("liveStudio.obs.inApp") : t("liveStudio.obs.inVideo")}
              </Text>
              <Text className="text-theme-neutrals-400 text-xs mt-0.5">
                {option === "app" ? t("liveStudio.obs.inAppHint") : t("liveStudio.obs.inVideoHint")}
              </Text>
            </TouchableOpacity>
          ))}
          {renderIn === "app" && data.obsConnected ? (
            <View className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 gap-2">
              <Text className="text-amber-200 text-xs">{t("liveStudio.obs.warnDoubles")}</Text>
              <TouchableOpacity
                onPress={() => {
                  setRenderIn("video");
                  setDirty(true);
                }}
                className="self-start px-3 py-1.5 rounded-xl border border-amber-500/40"
              >
                <Text className="text-amber-100 text-xs font-medium">{t("liveStudio.obs.switchToVideo")}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {renderIn === "video" && !data.obsConnected ? (
            <Text className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-amber-200 text-xs">
              {t("liveStudio.obs.warnNoObs")}
            </Text>
          ) : null}

          <Text className="text-white text-sm font-medium">{t("liveStudio.obs.link")}</Text>
          <TouchableOpacity
            onPress={() => {
              copyToClipboard(link);
              toastSuccess(t("liveStudio.obs.copied"));
            }}
            className="flex-row items-center rounded-xl border border-theme-neutrals-700 bg-theme-neutrals-900 px-3 h-10"
          >
            <Text className="flex-1 text-white text-xs" numberOfLines={1} style={{ fontFamily: "monospace" }}>
              {link}
            </Text>
            <Icon name="Copy" size={14} color="#fff" />
          </TouchableOpacity>
          <Text className="text-theme-neutrals-400 text-xs">{t("liveStudio.obs.step1")}</Text>
          <Text className="text-theme-neutrals-400 text-xs">{t("liveStudio.obs.step2")}</Text>
          <Text className="text-theme-neutrals-400 text-xs">{t("liveStudio.obs.step3")}</Text>
          <TouchableOpacity
            disabled={rotate.isPending}
            onPress={() =>
              Alert.alert(t("liveStudio.obs.rotate"), t("liveStudio.obs.rotateConfirm"), [
                { text: t("common.cancel"), style: "cancel" },
                { text: t("liveStudio.obs.rotate"), style: "destructive", onPress: () => rotate.mutate() },
              ])
            }
            className={`self-start flex-row items-center px-4 py-2.5 rounded-xl bg-theme-neutrals-700/60 ${rotate.isPending ? "opacity-40" : ""}`}
          >
            <Icon name="RefreshCw" size={13} color="#fff" />
            <Text className="text-white text-sm font-medium ml-1.5">{t("liveStudio.obs.rotate")}</Text>
          </TouchableOpacity>
        </Section>
      </ScrollView>

      <View
        pointerEvents="box-none"
        style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + 12 }}
        className="flex-row justify-end"
      >
        <View className="flex-row items-center gap-3 rounded-xl border border-theme-neutrals-700 bg-theme-neutrals-900 px-3 py-2">
          {dirty ? <Text className="text-theme-neutrals-400 text-xs">{t("liveStudio.unsaved")}</Text> : null}
          <TouchableOpacity
            disabled={!dirty || save.isPending}
            onPress={() => save.mutate()}
            className={`px-4 py-2 rounded-lg bg-white ${!dirty || save.isPending ? "opacity-40" : ""}`}
          >
            <Text className="text-[#09090B] text-sm font-medium">{save.isPending ? t("liveStudio.saving") : t("liveStudio.save")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <SettingsOptionModal
        visible={adding}
        onClose={() => setAdding(false)}
        title={t("liveStudio.addWidget")}
        value=""
        options={OVERLAY_KINDS.map((kind) => ({
          value: kind,
          label: t(`liveStudio.kinds.${kind}`),
          description: t(`liveStudio.hints.${kind}`),
        }))}
        onSelect={(value) => add(value as OverlayKind)}
      />
    </View>
  );
}
