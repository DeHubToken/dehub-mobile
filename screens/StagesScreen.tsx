/**
 * StagesScreen — the Stages hub
 * =============================
 * Discovery for live audio rooms, as a screen. The live room and the create
 * form stay modals (StagesModalsHost is mounted app-wide), so a stage keeps
 * running while you browse — the same split dehubweb has between /stages and
 * its persistent AudioSpacesModal.
 *
 * This replaces `StagesBrowseModal`, and the two things it replaces it for are
 * the two things that were wrong with it:
 *
 * 1. **Stages had no artwork.** Live and upcoming covers were cropped fills
 *    behind the card text under a black gradient, and ended stages showed no
 *    cover at all — so the recorded list, the part people actually browse, was
 *    an anonymous stack of one-line rows. Every card now leads with the whole
 *    16:9 graphic (StageCoverArt), including recorded ones.
 * 2. **The recordings could not be scrolled.** They sat at the bottom of one
 *    520pt-tall ScrollView inside a bottom sheet, under Live and Upcoming, so
 *    the archive was reachable only through a window a couple of rows high.
 *    Each tab is now its own FlatList filling the screen, with pull to refresh.
 *
 * Tabs mirror web: Live / Upcoming / Recorded, plus Hosting for people who
 * actually run rooms (see useMyStages — a fourth tab that is always empty costs
 * everyone else width on a strip that has to fit on a phone).
 *
 * @module screens/StagesScreen
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ScreenHeader from "../components/ScreenHeader";
import Icon, { type IconName } from "../components/ui/Icon";
import {
  LiveStageCard,
  RecordedStageCard,
  ScheduledStageCard,
} from "../components/Stages/StageCards";
import { StageTranscriptSheet } from "../components/Stages/StageTranscriptSheet";
import { useAuth } from "../context/AuthContext";
import { useStages } from "../context/StageContext";
import { myStagesKeys, useMyStages } from "../hooks/useMyStages";
import { sameWallet, type AudioSpace } from "../hooks/useStages";
import { getStagePlaybackState, stopStageRecording } from "../libs/stage-playback";
import { theme } from "../theme";

type StagesTab = "live" | "upcoming" | "recorded" | "hosting";

type TabDef = { key: StagesTab; icon: IconName; labelKey: string };

const TABS: TabDef[] = [
  { key: "live", icon: "Radio", labelKey: "stages.tabLive" },
  { key: "upcoming", icon: "CalendarDays", labelKey: "stages.tabUpcoming" },
  { key: "recorded", icon: "Clock", labelKey: "stages.tabRecorded" },
];

/**
 * Only rendered for people who actually run rooms — see useMyStages. A listener
 * has nothing to put in it, and a fourth tab that is always empty costs
 * everyone else width on a strip that has to fit on a phone.
 */
const HOSTING_TAB: TabDef = { key: "hosting", icon: "Mic", labelKey: "stages.tabHosting" };

/** How many recordings the Live tab offers when there is nothing live. */
const LIVE_TAB_PAST_PREVIEW = 6;

type Row =
  | { key: string; kind: "live"; space: AudioSpace; isCurrent: boolean; canEnd: boolean }
  | { key: string; kind: "scheduled"; space: AudioSpace; isMine: boolean }
  | { key: string; kind: "recorded"; space: AudioSpace; isMine: boolean }
  | { key: string; kind: "header"; label: string; actionLabel?: string; onAction?: () => void }
  | {
      key: string;
      kind: "empty";
      icon: IconName;
      title: string;
      hint: string;
      ctaLabel?: string;
      onCta?: () => void;
    };

export default function StagesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const {
    liveSpaces,
    pastSpaces,
    scheduledSpaces,
    currentSpace,
    isLoading,
    joinSpace,
    guestListenSpace,
    openModal,
    refreshSpaces,
    endSpace,
    endStageById,
    startScheduledSpace,
    cancelScheduledSpace,
    deleteEndedSpace,
  } = useStages();

  const { user } = useAuth();
  const userAddress = user?.walletAddress || user?.address || "";

  const { stages: myStages, isLoading: isLoadingMine, hasAny: isAStageHost } = useMyStages();

  const [activeTab, setActiveTab] = useState<StagesTab>("live");
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [transcriptSpace, setTranscriptSpace] = useState<AudioSpace | null>(null);

  const tabs = useMemo(() => (isAStageHost ? [...TABS, HOSTING_TAB] : TABS), [isAStageHost]);

  // Land on a tab that has something in it. Live wins when a room is running;
  // with nothing live, an announced stage is the next best thing to show —
  // "Live" showing its empty state while Upcoming holds a stage reads as the
  // whole feature being empty. Defers to the visitor the moment they pick a tab
  // themselves, including an empty one, which is a legitimate choice.
  const tabChosen = useRef(false);
  const chooseTab = useCallback((tab: StagesTab) => {
    tabChosen.current = true;
    setActiveTab(tab);
  }, []);
  useEffect(() => {
    if (tabChosen.current) return;
    if (liveSpaces.length > 0) setActiveTab("live");
    else if (scheduledSpaces.length > 0) setActiveTab("upcoming");
  }, [liveSpaces.length, scheduledSpaces.length]);

  // Signing out (or losing the last stage) takes the Hosting tab away with it;
  // standing on it at that moment would leave the screen blank.
  useEffect(() => {
    if (activeTab === "hosting" && !isAStageHost) setActiveTab("live");
  }, [activeTab, isAStageHost]);

  useFocusEffect(
    useCallback(() => {
      void refreshSpaces();
      // Leaving stops a recording that has not been popped out: its only
      // control goes with the screen, and audio nobody can reach is worse than
      // audio that stopped. Popping out is how you say you want to carry it.
      // Web's /stages does exactly this on a route change.
      return () => {
        const live = getStagePlaybackState();
        if (live.spaceId && !live.popout) stopStageRecording();
      };
    }, [refreshSpaces]),
  );

  const failed = useCallback(() => {
    Alert.alert(t("common.somethingWentWrong"), t("common.tryAgain"));
  }, [t]);

  const refreshMine = useCallback(() => {
    // The Hosting tab is its own query, so the context's refresh does not reach
    // it — without this a started stage sits there still labelled Scheduled.
    void queryClient.invalidateQueries({ queryKey: myStagesKeys.all });
  }, [queryClient]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshSpaces();
      refreshMine();
    } finally {
      setRefreshing(false);
    }
  }, [refreshMine, refreshSpaces]);

  const handleOpenLive = useCallback(
    (space: AudioSpace) => {
      // Being the host is not the same as being connected. Opening the live
      // view for a room this device has not joined showed an empty stage with
      // no audio and no way forward — a host coming back after a restart, or
      // one whose launch failed, goes through the same rejoin as anyone else.
      if (currentSpace?.id === space.id) {
        openModal("live");
        return;
      }
      setBusyId(space.id);
      void (async () => {
        try {
          // A signed-in wallet can hold a seat; anyone else still gets to
          // listen, exactly like a stage invite link. joinSpace refuses when
          // signed out and for a room that is no longer live, and it refuses
          // silently — so a card that cannot be opened is a stale list rather
          // than an error worth interrupting anyone with.
          if ((await joinSpace(space.id)) || (await guestListenSpace(space.id))) {
            openModal("live");
          } else {
            await refreshSpaces();
          }
        } finally {
          setBusyId(null);
        }
      })();
    },
    [currentSpace?.id, guestListenSpace, joinSpace, openModal, refreshSpaces],
  );

  const handleEndLive = useCallback(
    (space: AudioSpace) => {
      const done = (ok: boolean) => {
        if (!ok) failed();
        refreshMine();
      };
      // endSpace only fires for the room this device is standing in; from the
      // list — which is where a stranded stage is looked at — it did nothing.
      if (currentSpace?.id === space.id) void endSpace().then(() => done(true));
      else void endStageById(space.id).then(done);
    },
    [currentSpace?.id, endSpace, endStageById, failed, refreshMine],
  );

  const handleStartScheduled = useCallback(
    (space: AudioSpace) => {
      setBusyId(space.id);
      void startScheduledSpace(space.id)
        .then((ok) => {
          // Every failure path returned false with nothing said, so a stage
          // that would not start read as a dead button rather than a problem
          // worth retrying.
          if (ok) openModal("live");
          else failed();
        })
        .finally(() => {
          setBusyId(null);
          refreshMine();
        });
    },
    [failed, openModal, refreshMine, startScheduledSpace],
  );

  const handleCancelScheduled = useCallback(
    (space: AudioSpace) => {
      void cancelScheduledSpace(space.id)
        .then((ok) => {
          if (!ok) failed();
        })
        .finally(refreshMine);
    },
    [cancelScheduledSpace, failed, refreshMine],
  );

  const handleDeleteRecorded = useCallback(
    (space: AudioSpace) => {
      if (getStagePlaybackState().spaceId === space.id) stopStageRecording();
      void deleteEndedSpace(space)
        .then((ok) => {
          if (!ok) failed();
        })
        .finally(refreshMine);
    },
    [deleteEndedSpace, failed, refreshMine],
  );

  /**
   * A host looking at their own live room from outside it.
   *
   * That is either a room they wandered away from, or — the case this exists
   * for — one whose launch failed after the row went live, which can never be
   * joined and could otherwise never be ended either.
   */
  const canEndFromOutside = useCallback(
    (space: AudioSpace) =>
      sameWallet(space.host_wallet_address, userAddress) && currentSpace?.id !== space.id,
    [currentSpace?.id, userAddress],
  );

  const liveRow = useCallback(
    (space: AudioSpace, isCurrent: boolean): Row => ({
      key: `live-${space.id}`,
      kind: "live",
      space,
      isCurrent,
      canEnd: canEndFromOutside(space),
    }),
    [canEndFromOutside],
  );

  const recordedRow = useCallback(
    (space: AudioSpace): Row => ({
      key: `recorded-${space.id}`,
      kind: "recorded",
      space,
      isMine: sameWallet(space.host_wallet_address, userAddress),
    }),
    [userAddress],
  );

  const scheduledRow = useCallback(
    (space: AudioSpace): Row => ({
      key: `scheduled-${space.id}`,
      kind: "scheduled",
      space,
      isMine: sameWallet(space.host_wallet_address, userAddress),
    }),
    [userAddress],
  );

  const rows = useMemo<Row[]>(() => {
    if (activeTab === "upcoming") {
      if (scheduledSpaces.length === 0) {
        return [
          {
            key: "empty-upcoming",
            kind: "empty",
            icon: "CalendarDays",
            title: t("stages.nothingScheduled"),
            hint: t("stages.nothingScheduledHint"),
            ctaLabel: t("stages.scheduleAStage"),
            onCta: () => openModal("create"),
          },
        ];
      }
      return scheduledSpaces.map(scheduledRow);
    }

    if (activeTab === "recorded") {
      if (pastSpaces.length === 0) {
        return [
          {
            key: "empty-recorded",
            kind: "empty",
            icon: "Mic",
            title: t("stages.noRecordedStages"),
            hint: t("stages.noRecordedStagesHint"),
          },
        ];
      }
      return pastSpaces.map(recordedRow);
    }

    if (activeTab === "hosting") {
      const mine = {
        live: myStages.filter((s) => s.status === "live"),
        scheduled: myStages.filter((s) => s.status === "scheduled"),
        ended: myStages.filter((s) => s.status === "ended"),
      };
      const out: Row[] = [];
      if (mine.live.length) {
        out.push({ key: "h-live", kind: "header", label: t("stages.liveNow") });
        out.push(...mine.live.map((s) => liveRow(s, currentSpace?.id === s.id)));
      }
      if (mine.scheduled.length) {
        out.push({ key: "h-scheduled", kind: "header", label: t("stages.scheduled") });
        out.push(...mine.scheduled.map(scheduledRow));
      }
      if (mine.ended.length) {
        out.push({ key: "h-past", kind: "header", label: t("stages.past") });
        out.push(...mine.ended.map(recordedRow));
      }
      if (out.length === 0 && !isLoadingMine) {
        out.push({
          key: "empty-hosting",
          kind: "empty",
          icon: "Mic",
          title: t("stages.hostingEmptyTitle"),
          hint: t("stages.hostingEmptyHint"),
        });
      }
      return out;
    }

    // Live. A room this device is still connected to but which no longer shows
    // up in the list gets a card of its own, so there is always a way back in.
    const resume =
      currentSpace && !liveSpaces.some((s) => s.id === currentSpace.id) ? currentSpace : null;
    const out: Row[] = [];
    if (resume) out.push(liveRow(resume, true));
    out.push(...liveSpaces.map((s) => liveRow(s, currentSpace?.id === s.id)));
    if (out.length > 0) return out;

    // Nothing live is the common case, so don't dead-end here: offer the create
    // CTA and then fall back to recordings, which are always worth listening to.
    out.push({
      key: "empty-live",
      kind: "empty",
      icon: "Radio",
      title: t("stages.noLiveStages"),
      hint: t("stages.noLiveStagesHint"),
      ctaLabel: t("stages.startAStageButton"),
      onCta: () => openModal("create"),
    });
    if (pastSpaces.length > 0) {
      out.push({
        key: "h-recent",
        kind: "header",
        label: t("stages.pastStages"),
        actionLabel: t("stages.seeAll"),
        onAction: () => chooseTab("recorded"),
      });
      out.push(...pastSpaces.slice(0, LIVE_TAB_PAST_PREVIEW).map(recordedRow));
    }
    return out;
  }, [
    activeTab,
    chooseTab,
    currentSpace,
    isLoadingMine,
    liveRow,
    liveSpaces,
    myStages,
    openModal,
    pastSpaces,
    recordedRow,
    scheduledRow,
    scheduledSpaces,
    t,
  ]);

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      switch (item.kind) {
        case "live":
          return (
            <LiveStageCard
              space={item.space}
              isCurrent={item.isCurrent}
              isMine={sameWallet(item.space.host_wallet_address, userAddress)}
              isBusy={busyId === item.space.id}
              onOpen={() => handleOpenLive(item.space)}
              onEnd={item.canEnd ? () => handleEndLive(item.space) : undefined}
            />
          );
        case "scheduled":
          return (
            <ScheduledStageCard
              space={item.space}
              isMine={item.isMine}
              isBusy={busyId === item.space.id}
              onStart={() => handleStartScheduled(item.space)}
              onCancel={() => handleCancelScheduled(item.space)}
            />
          );
        case "recorded":
          return (
            <RecordedStageCard
              space={item.space}
              isMine={item.isMine}
              onOpenTranscript={() => setTranscriptSpace(item.space)}
              onDelete={() => handleDeleteRecorded(item.space)}
            />
          );
        case "header":
          return (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{item.label}</Text>
              {!!item.actionLabel && (
                <TouchableOpacity onPress={item.onAction} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.sectionAction}>{item.actionLabel}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        case "empty":
          return (
            <View style={styles.empty}>
              <Icon name={item.icon} size={40} color="#3F3F46" />
              <Text style={styles.emptyTitle}>{item.title}</Text>
              <Text style={styles.emptyHint}>{item.hint}</Text>
              {!!item.ctaLabel && (
                <TouchableOpacity onPress={item.onCta} style={styles.emptyCta} accessibilityRole="button">
                  <Icon name="Plus" size={15} color="#FFFFFF" />
                  <Text style={styles.emptyCtaText}>{item.ctaLabel}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        default:
          return null;
      }
    },
    [
      busyId,
      handleCancelScheduled,
      handleDeleteRecorded,
      handleEndLive,
      handleOpenLive,
      handleStartScheduled,
      userAddress,
    ],
  );

  const subtitle =
    liveSpaces.length > 0
      ? t("stages.liveCount", { count: liveSpaces.length })
      : scheduledSpaces.length > 0
        ? t("stages.upcomingCount", { count: scheduledSpaces.length })
        : undefined;

  // A spinner only while there is genuinely nothing to show yet. Keyed off the
  // lists rather than off `rows`, which always holds an empty-state card — the
  // first load would otherwise flash "No live stages right now" before the
  // stages arrived.
  const nothingLoadedYet =
    liveSpaces.length === 0 && scheduledSpaces.length === 0 && pastSpaces.length === 0;
  const showFirstLoad =
    activeTab === "hosting"
      ? isLoadingMine && myStages.length === 0
      : isLoading && nothingLoadedYet;

  return (
    <View style={styles.root}>
      <ScreenHeader
        // The nav label for this exact destination, already translated in every
        // locale — a second "Stages" key would be the same word twice.
        title={t("nav.stages")}
        subtitle={subtitle}
        rightContent={
          <TouchableOpacity
            onPress={() => openModal("create")}
            style={styles.createBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t("stages.startAStage")}
          >
            <Icon name="Plus" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />

      {/* Scrolls horizontally: four chips with translated labels do not fit
          across a phone in every language, and a clipped tab is an unreachable
          one. Web's strip scrolls for the same reason. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
        style={styles.tabScroller}
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => chooseTab(tab.key)}
              hitSlop={{ top: 8, bottom: 8 }}
              style={[styles.tabChip, active && styles.tabChipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Icon name={tab.icon} size={14} color={active ? "#000000" : "#A1A1AA"} />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t(tab.labelKey)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {showFirstLoad ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.key}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingTop: 4,
            paddingBottom: insets.bottom + 32,
            gap: 12,
          }}
          showsVerticalScrollIndicator={false}
          // Cards carry a cover image and a player each, so a long archive is
          // worth windowing rather than mounting whole. Clipping is explicitly
          // off: RN turns it ON for FlatList on Android when the prop is
          // omitted, and a clipped row here is a card whose cover and player
          // are detached from a list you are actively dragging.
          initialNumToRender={4}
          windowSize={7}
          removeClippedSubviews={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.accent}
            />
          }
        />
      )}

      <StageTranscriptSheet
        space={transcriptSpace}
        visible={!!transcriptSpace}
        onClose={() => setTranscriptSpace(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  createBtn: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  // The scroller must not stretch: without a fixed height it takes the whole
  // remaining column and the list underneath gets none of it.
  tabScroller: {
    flexGrow: 0,
    flexShrink: 0,
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  tabChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    // Chips are square-cornered app chrome, not pills — theme/radius.ts.
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tabChipActive: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
  tabText: { color: "#A1A1AA", fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: "#000000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    marginTop: 4,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  sectionAction: {
    color: "#A1A1AA",
    fontSize: 13,
    fontWeight: "600",
  },
  empty: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 24,
    borderRadius: theme.radius.xl,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 12,
    textAlign: "center",
  },
  emptyHint: {
    color: "#808089",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    textAlign: "center",
  },
  emptyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: theme.radius.lg,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  emptyCtaText: {
    color: "#FAFAFA",
    fontSize: 13,
    fontWeight: "600",
  },
});
