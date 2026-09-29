/**
 * WorkHistoryScreen
 * =================
 * Native port of the web WorkHistoryPage (/work/history): every bounty this
 * wallet posted or worked on, with the escrow and payout transactions.
 *
 * Only the visible tab's query runs, and the status list differs per tab — a
 * bounty you worked can never be a draft — exactly as on web.
 */
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ScrollView, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import LoadErrorState from "../components/ui/LoadErrorState";
import { DeHubLoader } from "../components/DeHubLoader";
import { DeHubRefreshControl } from "../components/Feed/DeHubRefreshControl";
import { useAuthState } from "../context/AuthContext";
import { theme } from "../theme";
import { appLocale } from "../libs/date.util";
import { openInApp } from "../libs/links.utils";
import { ScreenNames } from "../navigation/ScreenNames";
import {
  useMyPostedJobs,
  useMyWorkSubmissions,
  isWorkContractDeployed,
  workExplorerTxUrl,
  type WorkJob,
  type WorkJobStatus,
  type WorkSubmission,
} from "../hooks/useWork";

type Tab = "posted" | "worked";
type StatusFilter = WorkJobStatus | "all";

const STATUS_OPTIONS: Record<Tab, StatusFilter[]> = {
  posted: ["all", "draft", "open", "in_progress", "completed", "disputed", "cancelled", "expired"],
  worked: ["all", "open", "in_progress", "completed", "disputed", "cancelled", "expired"],
};

/** Matches web's status pill colours. */
const statusStyle = (s: string) => {
  if (s === "open") return { bg: "rgba(16,185,129,0.20)", fg: "#6EE7B7" };
  if (s === "disputed") return { bg: "rgba(239,68,68,0.20)", fg: "#FCA5A5" };
  if (s === "completed") return { bg: "rgba(59,130,246,0.20)", fg: "#BFDBFE" };
  return { bg: "rgba(255,255,255,0.10)", fg: "#A1A1AA" };
};

const num = (n: number) =>
  (Number(n) || 0).toLocaleString(appLocale(), { maximumFractionDigits: 4 });

const TxLink: React.FC<{ label: string; txHash: string }> = ({ label, txHash }) => (
  <Pressable style={styles.txRow} onPress={() => openInApp(workExplorerTxUrl(txHash))} hitSlop={6}>
    <Icon name="ExternalLink" size={11} color="#808089" />
    <Text style={styles.txText}>
      {label}: {txHash.slice(0, 6)}…{txHash.slice(-4)}
    </Text>
  </Pressable>
);

const Pill: React.FC<{ label: string; bg: string; fg: string }> = ({ label, bg, fg }) => (
  <View style={[styles.pill, { backgroundColor: bg }]}>
    <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
  </View>
);

export default function WorkHistoryScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { isSignedIn } = useAuthState();

  const [tab, setTab] = useState<Tab>("posted");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const postedQuery = useMyPostedJobs(tab === "posted");
  const workedQuery = useMyWorkSubmissions(tab === "worked");
  const posted = postedQuery.data ?? [];
  const submissions = workedQuery.data ?? [];
  const active = tab === "posted" ? postedQuery : workedQuery;

  const q = search.trim().toLowerCase();
  const filteredPosted = useMemo(
    () =>
      posted.filter(
        (j) => (status === "all" || j.status === status) && (!q || j.title.toLowerCase().includes(q)),
      ),
    [posted, status, q],
  );
  const filteredSubmissions = useMemo(
    () =>
      submissions.filter(
        (s) =>
          (status === "all" || s.job?.status === status) &&
          (!q || !!s.job?.title.toLowerCase().includes(q)),
      ),
    [submissions, status, q],
  );

  const switchTab = (next: Tab) => {
    setTab(next);
    if (!STATUS_OPTIONS[next].includes(status)) setStatus("all");
  };

  const statusLabel = (s: string) => t(`work.status.${s}`, { defaultValue: s.replace(/_/g, " ") });
  const openJob = (job: WorkJob) =>
    navigation.navigate(ScreenNames.WorkJobDetail, { jobId: job.id, job });

  const hasFilters = status !== "all" || !!q;
  const rows: Array<WorkJob | (WorkSubmission & { job: WorkJob | null })> =
    tab === "posted" ? filteredPosted : filteredSubmissions;

  const renderPosted = (job: WorkJob) => {
    const st = statusStyle(job.status);
    return (
      <Pressable style={styles.card} onPress={() => openJob(job)}>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {job.title}
          </Text>
          <Pill label={statusLabel(job.status)} bg={st.bg} fg={st.fg} />
        </View>
        <Text style={styles.meta}>
          {num(job.total_budget)} {job.currency} · {new Date(job.created_at).toLocaleDateString(appLocale())}
        </Text>
        {job.fund_tx_hash ? (
          <TxLink label={t("work.escrowTx")} txHash={job.fund_tx_hash} />
        ) : isWorkContractDeployed() ? (
          <Text style={styles.dimNote}>{t("work.notEscrowedOnChain")}</Text>
        ) : null}
      </Pressable>
    );
  };

  const renderSubmission = (s: WorkSubmission & { job: WorkJob | null }) => {
    const job = s.job;
    // Approved is not paid — a payout is real only once it has a tx hash.
    const paid = !!s.payout_tx_hash || s.approval_status === "paid";
    const awaitingPayment = s.approval_status === "approved" && !s.payout_tx_hash;
    const due = Number(s.payout_amount) || 0;
    const subStyle = paid
      ? { bg: "rgba(16,185,129,0.20)", fg: "#6EE7B7" }
      : awaitingPayment
        ? { bg: "rgba(251,191,36,0.20)", fg: "#FDE68A" }
        : s.approval_status === "rejected"
          ? { bg: "rgba(239,68,68,0.20)", fg: "#FCA5A5" }
          : { bg: "rgba(255,255,255,0.10)", fg: "#A1A1AA" };
    const jobSt = job ? statusStyle(job.status) : null;
    return (
      <Pressable style={styles.card} onPress={job ? () => openJob(job) : undefined} disabled={!job}>
        <View style={styles.cardTop}>
          <Text style={[styles.cardTitle, !job && { color: "#A1A1AA" }]} numberOfLines={1}>
            {job ? job.title : t("work.untitledBounty")}
          </Text>
          <View style={styles.pillRow}>
            {job && jobSt && <Pill label={statusLabel(job.status)} bg={jobSt.bg} fg={jobSt.fg} />}
            <Pill
              label={
                paid
                  ? statusLabel("paid")
                  : awaitingPayment
                    ? t("work.status.awaitingPayment")
                    : statusLabel(s.approval_status)
              }
              bg={subStyle.bg}
              fg={subStyle.fg}
            />
          </View>
        </View>
        <Text style={styles.meta}>
          {new Date(s.created_at).toLocaleDateString(appLocale())}
          {(paid || awaitingPayment) && due > 0 && job ? ` · ${num(due)} ${job.currency}` : ""}
        </Text>
        {s.payout_tx_hash ? (
          <TxLink label={t("work.payoutTx")} txHash={s.payout_tx_hash} />
        ) : awaitingPayment ? (
          <Text style={[styles.dimNote, { color: "rgba(253,230,138,0.7)" }]}>
            {t("work.acceptedNotSent")}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  const empty = (
    <View style={styles.emptyBlock}>
      <Icon name="Briefcase" size={40} color="#3F3F46" />
      <Text style={styles.emptyText}>
        {hasFilters
          ? t("work.emptyFilteredHistory")
          : tab === "posted"
            ? t("work.emptyPosted")
            : t("work.emptyWorked")}
      </Text>
      {hasFilters ? (
        <Pressable
          onPress={() => {
            setStatus("all");
            setSearch("");
          }}
          style={styles.secondaryBtn}
        >
          <Text style={styles.secondaryBtnText}>{t("work.clearFilters")}</Text>
        </Pressable>
      ) : tab === "posted" ? (
        <Pressable onPress={() => navigation.navigate(ScreenNames.WorkPost)} style={styles.primaryBtn}>
          <Icon name="Plus" size={15} color="#000000" />
          <Text style={styles.primaryBtnText}>{t("work.postBounty")}</Text>
        </Pressable>
      ) : (
        <Pressable onPress={() => navigation.navigate(ScreenNames.Work)} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>{t("work.browseBounties")}</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      <ScreenHeader title={t("work.myBounties")} subtitle={t("work.historySubtitle")} />

      {!isSignedIn ? (
        <View style={styles.emptyBlock}>
          <Icon name="Lock" size={40} color="#3F3F46" />
          <Text style={styles.connectTitle}>{t("work.connectTitle")}</Text>
          <Text style={styles.emptyText}>{t("work.connectBody")}</Text>
          <Pressable onPress={() => navigation.navigate(ScreenNames.SignIn)} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>{t("work.connectCta")}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.tabRow}>
            {(["posted", "worked"] as const).map((id) => (
              <Pressable
                key={id}
                onPress={() => switchTab(id)}
                style={[styles.tabChip, tab === id && styles.tabChipActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === id }}
              >
                <Text style={[styles.tabText, tab === id && styles.tabTextActive]}>
                  {id === "posted" ? t("work.tabPosted") : t("work.tabWorked")}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.searchWrap}>
            <Icon name="Search" size={15} color="#808089" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t("work.searchByTitle")}
              placeholderTextColor="#8B8D90"
              style={styles.searchInput}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <Pressable
                onPress={() => setSearch("")}
                hitSlop={14}
                accessibilityRole="button"
                accessibilityLabel={t("sidebar.clearSearch")}
              >
                <Icon name="X" size={15} color="#808089" />
              </Pressable>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.strip}
            contentContainerStyle={styles.chipRow}
          >
            {STATUS_OPTIONS[tab].map((s) => (
              <Pressable
                key={s}
                onPress={() => setStatus(s)}
                style={[styles.chip, status === s && styles.chipActive]}
              >
                <Text style={[styles.chipText, status === s && styles.chipTextActive]}>
                  {s === "all" ? t("work.allStatuses") : statusLabel(s)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {active.isLoading ? (
            <View style={styles.center}>
              <DeHubLoader size={56} />
            </View>
          ) : active.isError ? (
            <LoadErrorState message={t("work.historyLoadFailed")} onRetry={() => active.refetch()} />
          ) : (
            <FlatList
              data={rows as any[]}
              keyExtractor={(r) => r.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) =>
                tab === "posted" ? renderPosted(item as WorkJob) : renderSubmission(item as any)
              }
              ListEmptyComponent={empty}
              contentContainerStyle={{
                paddingHorizontal: 12,
                paddingTop: 2,
                paddingBottom: insets.bottom + 24,
                gap: 10,
              }}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <DeHubRefreshControl
                  refreshing={active.isRefetching}
                  onRefresh={active.refetch}
                  tintColor={theme.colors.accent}
                />
              }
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },

  tabRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8 },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabChipActive: { backgroundColor: "rgba(255,255,255,0.15)", borderColor: "rgba(255,255,255,0.20)" },
  tabText: { color: "#A1A1AA", fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: "#FFFFFF" },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 14, padding: 0 },

  strip: { flexGrow: 0 },
  chipRow: { gap: 8, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center" },
  chip: {
    paddingHorizontal: 12,
    // A fixed height, not vertical padding: text-only chips in a centred
    // horizontal ScrollView were measured into the strip's leftover height on
    // Android and rendered with their labels cut through the middle.
    height: 32,
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipActive: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
  chipText: { color: "#A1A1AA", fontSize: 13, lineHeight: 18, fontWeight: "600" },
  chipTextActive: { color: "#000000" },

  card: {
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 14,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  cardTitle: { flex: 1, color: "#FFFFFF", fontSize: 14.5, fontWeight: "600" },
  pillRow: { flexDirection: "row", gap: 5, flexShrink: 0 },
  pill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7 },
  pillText: { fontSize: 11.5, fontWeight: "600" },
  meta: { color: "#808089", fontSize: 12, marginTop: 4 },
  dimNote: { color: "#52525B", fontSize: 11.5, marginTop: 8 },
  txRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  txText: { color: "#808089", fontSize: 11.5 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 64 },
  emptyBlock: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 20 },
  connectTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", marginTop: 12 },
  emptyText: {
    color: "#A1A1AA",
    fontSize: 13,
    marginTop: 12,
    marginBottom: 16,
    textAlign: "center",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  primaryBtnText: { color: "#000000", fontSize: 14, fontWeight: "700" },
  secondaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  secondaryBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
});
