/**
 * WorkScreen
 * ==========
 * Native port of the web WorkPage (/work). Same tabs, filters, sort options,
 * empty-state logic and the "recently completed" fallback.
 */
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ScrollView,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Icon, { type IconName } from "../components/ui/Icon";
import { theme } from "../theme";
import { useAuthState } from "../context/AuthContext";
import { ScreenNames } from "../navigation/ScreenNames";
import {
  useBrowseJobs,
  useRecentCompletedJobs,
  WORK_TYPE_LABEL,
  type WorkJob,
  type WorkJobType,
  type WorkCurrency,
} from "../hooks/useWork";

type SortKey = "newest" | "highest_pay" | "ending_soon";

const TABS: Array<{ id: WorkJobType | "all"; label: string; icon: IconName }> = [
  { id: "all", label: "All", icon: "Briefcase" },
  { id: "shill", label: "Social Media", icon: "MessageSquare" },
  { id: "clipping", label: "Clipping", icon: "Scissors" },
  { id: "contract", label: "Contracts", icon: "Briefcase" },
];

const CURRENCIES: Array<{ id: WorkCurrency | "all"; label: string }> = [
  { id: "all", label: "All currencies" },
  { id: "DHB", label: "DHB" },
  { id: "USDC", label: "USDC" },
];

const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: "newest", label: "Newest" },
  { id: "highest_pay", label: "Highest pay" },
  { id: "ending_soon", label: "Ending soon" },
];

const num = (n: number, max = 2) =>
  (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: max });

export const JobCard: React.FC<{ job: WorkJob; onPress: () => void }> = ({ job, onPress }) => {
  const isBoosted = !!job.boost_expires_at && new Date(job.boost_expires_at) > new Date();

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardTop}>
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Icon name="Briefcase" size={11} color="#D4D4D8" />
            <Text style={styles.badgeText}>{WORK_TYPE_LABEL[job.job_type]}</Text>
          </View>
          {!!job.platform && (
            <View style={styles.badgeDim}>
              <Text style={styles.badgeDimText}>{job.platform.toUpperCase()}</Text>
            </View>
          )}
          {isBoosted && (
            <View style={styles.badgeBoost}>
              <Text style={styles.badgeBoostText}>Boosted</Text>
            </View>
          )}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.budget}>
            {num(job.total_budget)} {job.currency}
          </Text>
          {job.job_type !== "contract" && (
            <Text style={styles.perUnit}>
              {job.price_per_unit} {job.currency}/
              {job.job_type === "clipping" ? "1k views" : "task"}
            </Text>
          )}
        </View>
      </View>

      <Text style={styles.cardTitle} numberOfLines={1}>
        {job.title}
      </Text>
      <Text style={styles.cardDesc} numberOfLines={2}>
        {job.description}
      </Text>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Icon name="Users" size={12} color="#71717A" />
          <Text style={styles.metaText}>{job.application_count} apps</Text>
        </View>
        <View style={styles.metaItem}>
          <Icon name="Eye" size={12} color="#71717A" />
          <Text style={styles.metaText}>{job.submission_count} subs</Text>
        </View>
        <View style={styles.metaItem}>
          <Icon name="Coins" size={12} color="#71717A" />
          <Text style={styles.metaText}>
            {job.units_approved}/{job.max_units}
          </Text>
        </View>
        {!!job.deadline && (
          <View style={[styles.metaItem, { marginLeft: "auto" }]}>
            <Icon name="Clock" size={12} color="#71717A" />
            <Text style={styles.metaText}>{new Date(job.deadline).toLocaleDateString()}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
};

export default function WorkScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { isSignedIn, needsUsername } = useAuthState();
  const isAuthed = isSignedIn && !needsUsername;

  const [tab, setTab] = useState<WorkJobType | "all">("all");
  const [currency, setCurrency] = useState<WorkCurrency | "all">("all");
  const [sort, setSort] = useState<SortKey>("newest");
  // Not debounced — web's WorkPage passes `search` straight to the query and
  // relies on keepPreviousData to avoid a skeleton flash. Same here.
  const [search, setSearch] = useState("");

  const {
    data: jobs = [],
    isLoading,
    refetch,
    isRefetching,
  } = useBrowseJobs({
    job_type: tab,
    currency,
    sort,
    search: search.trim() || undefined,
  });

  // Same empty-state logic as web: distinguish "filtered to nothing" from
  // "board is genuinely empty", and fall back to completed bounties for the
  // latter so the page still shows what a bounty looks like.
  const hasFilters = tab !== "all" || currency !== "all" || search.trim().length > 0;
  const showCompletedFallback = !isLoading && jobs.length === 0 && !hasFilters;
  const { data: completedJobs = [] } = useRecentCompletedJobs(showCompletedFallback);

  const clearFilters = useCallback(() => {
    setTab("all");
    setCurrency("all");
    setSearch("");
  }, []);

  const openJob = useCallback(
    (job: WorkJob) => navigation.navigate(ScreenNames.WorkJobDetail, { jobId: job.id, job }),
    [navigation],
  );

  // Web lets anyone open the post form and gates on submit — match that rather
  // than blocking at the button, so the form is browsable signed-out.
  const goPost = useCallback(
    () => navigation.navigate(ScreenNames.WorkPost),
    [navigation],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Icon name="ArrowLeft" size={22} color="#FFFFFF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Bounties</Text>
          <Text style={styles.subtitle}>Post a bounty or hunt one down. Paid in DHB or USDC.</Text>
        </View>
        <Pressable onPress={goPost} hitSlop={10} style={styles.addBtn}>
          <Icon name="Plus" size={20} color="#000000" />
        </Pressable>
      </View>

      {/* Type tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              style={[styles.tabChip, active && styles.tabChipActive]}
            >
              <Icon name={t.icon} size={13} color={active ? "#FFFFFF" : "#A1A1AA"} />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.searchWrap}>
        <Icon name="Search" size={15} color="#71717A" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search bounties…"
          placeholderTextColor="#52525B"
          style={styles.searchInput}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <Icon name="X" size={15} color="#71717A" />
          </Pressable>
        )}
      </View>

      {/* Currency + sort */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {CURRENCIES.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => setCurrency(c.id)}
            style={[styles.chip, currency === c.id && styles.chipActive]}
          >
            <Text style={[styles.chipText, currency === c.id && styles.chipTextActive]}>
              {c.label}
            </Text>
          </Pressable>
        ))}
        <View style={styles.chipDivider} />
        {SORTS.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => setSort(s.id)}
            style={[styles.chip, sort === s.id && styles.chipActive]}
          >
            <Text style={[styles.chipText, sort === s.id && styles.chipTextActive]}>{s.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(j) => j.id}
          renderItem={({ item }) => <JobCard job={item} onPress={() => openJob(item)} />}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: insets.bottom + 24,
            paddingTop: 2,
            gap: 12,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={theme.colors.accentForeground}
            />
          }
          ListEmptyComponent={
            <View>
              <View style={styles.emptyBlock}>
                <Icon name="Briefcase" size={40} color="#3F3F46" />
                <Text style={styles.emptyText}>
                  {hasFilters
                    ? "No open bounties match these filters."
                    : "No open bounties right now. Be the first to post one."}
                </Text>
                <View style={styles.emptyActions}>
                  <Pressable onPress={goPost} style={styles.primaryBtn}>
                    <Icon name="Plus" size={15} color="#000000" />
                    <Text style={styles.primaryBtnText}>Post a Bounty</Text>
                  </Pressable>
                  {hasFilters && (
                    <Pressable onPress={clearFilters} style={styles.secondaryBtn}>
                      <Text style={styles.secondaryBtnText}>Clear filters</Text>
                    </Pressable>
                  )}
                </View>
              </View>

              {showCompletedFallback && completedJobs.length > 0 && (
                <View style={{ gap: 12 }}>
                  <Text style={styles.sectionHeading}>Recently completed</Text>
                  {completedJobs.map((j) => (
                    <JobCard key={j.id} job={j} onPress={() => openJob(j)} />
                  ))}
                </View>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { color: "#FFFFFF", fontSize: 21, fontWeight: "700" },
  subtitle: { color: "#71717A", fontSize: 12, marginTop: 1 },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  chipRow: { gap: 8, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center" },
  tabChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  tabChipActive: { backgroundColor: "rgba(255,255,255,0.15)" },
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

  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipActive: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
  chipText: { color: "#A1A1AA", fontSize: 12.5, fontWeight: "600" },
  chipTextActive: { color: "#000000" },
  chipDivider: {
    width: 1,
    height: 18,
    backgroundColor: "rgba(255,255,255,0.14)",
    marginHorizontal: 2,
  },

  card: {
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 14,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginBottom: 10 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, flex: 1 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  badgeText: { color: "#D4D4D8", fontSize: 10.5, fontWeight: "600" },
  badgeDim: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  badgeDimText: { color: "#A1A1AA", fontSize: 10.5, fontWeight: "600" },
  badgeBoost: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
    backgroundColor: "rgba(251,191,36,0.20)",
  },
  badgeBoostText: { color: "#FDE68A", fontSize: 10.5, fontWeight: "600" },

  budget: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  perUnit: { color: "#71717A", fontSize: 10.5, marginTop: 2 },

  cardTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  cardDesc: { color: "#A1A1AA", fontSize: 12.5, lineHeight: 18, marginTop: 4, marginBottom: 12 },

  metaRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { color: "#71717A", fontSize: 11 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 64 },
  emptyBlock: { alignItems: "center", paddingVertical: 48 },
  emptyText: {
    color: "#71717A",
    fontSize: 13,
    marginTop: 12,
    marginBottom: 16,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  emptyActions: { flexDirection: "row", gap: 10 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  primaryBtnText: { color: "#000000", fontSize: 13.5, fontWeight: "700" },
  secondaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  secondaryBtnText: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "600" },

  sectionHeading: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "700",
    paddingHorizontal: 2,
    marginBottom: 2,
  },
});
