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
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import { theme } from "../theme";
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

const TABS: Array<{ id: WorkJobType | "all"; icon: IconName }> = [
  { id: "all", icon: "Briefcase" },
  { id: "shill", icon: "MessageSquare" },
  { id: "clipping", icon: "Scissors" },
  { id: "contract", icon: "Briefcase" },
];

const CURRENCIES: Array<WorkCurrency | "all"> = ["all", "DHB", "USDC"];

const SORTS: SortKey[] = ["newest", "highest_pay", "ending_soon"];

const num = (n: number, max = 2) =>
  (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: max });

export const JobCard: React.FC<{ job: WorkJob; onPress: () => void }> = ({ job, onPress }) => {
  const { t } = useTranslation();
  const isBoosted = !!job.boost_expires_at && new Date(job.boost_expires_at) > new Date();

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardTop}>
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Icon name="Briefcase" size={11} color="#D4D4D8" />
            <Text style={styles.badgeText}>
              {t(`work.types.${job.job_type}`, { defaultValue: WORK_TYPE_LABEL[job.job_type] })}
            </Text>
          </View>
          {!!job.platform && (
            <View style={styles.badgeDim}>
              <Text style={styles.badgeDimText}>{job.platform.toUpperCase()}</Text>
            </View>
          )}
          {isBoosted && (
            <View style={styles.badgeBoost}>
              <Text style={styles.badgeBoostText}>{t("work.boosted")}</Text>
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
              {job.job_type === "clipping" ? t("work.thousandViews") : t("work.task")}
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
          <Icon name="Users" size={12} color="#808089" />
          <Text style={styles.metaText}>
            {t("work.applicationCount", { count: job.application_count })}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Icon name="Eye" size={12} color="#808089" />
          <Text style={styles.metaText}>
            {t("work.submissionCount", { count: job.submission_count })}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Icon name="Coins" size={12} color="#808089" />
          <Text style={styles.metaText}>
            {job.units_approved}/{job.max_units}
          </Text>
        </View>
        {!!job.deadline && (
          <View style={[styles.metaItem, { marginLeft: "auto" }]}>
            <Icon name="Clock" size={12} color="#808089" />
            <Text style={styles.metaText}>{new Date(job.deadline).toLocaleDateString()}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
};

export default function WorkScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

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
    <View style={styles.root}>
      <ScreenHeader
        title={t("work.title")}
        subtitle={t("work.subtitle")}
        rightContent={
          <Pressable
            onPress={goPost}
            hitSlop={10}
            style={styles.addBtn}
            accessibilityRole="button"
            accessibilityLabel={t("work.postBounty")}
          >
            <Icon name="Plus" size={20} color="#000000" />
          </Pressable>
        }
      />

      {/* Type tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {TABS.map((tabItem) => {
          const active = tab === tabItem.id;
          return (
            <Pressable
              key={tabItem.id}
              onPress={() => setTab(tabItem.id)}
              style={[styles.tabChip, active && styles.tabChipActive]}
            >
              <Icon name={tabItem.icon} size={13} color={active ? "#FFFFFF" : "#A1A1AA"} />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {t(`work.types.${tabItem.id}`)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.searchWrap}>
        <Icon name="Search" size={15} color="#808089" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t("work.searchPlaceholder")}
          placeholderTextColor="#8B8D90"
          style={styles.searchInput}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable
            onPress={() => setSearch("")}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Icon name="X" size={15} color="#808089" />
          </Pressable>
        )}
      </View>

      {/* Currency + sort */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {CURRENCIES.map((currencyKey) => (
          <Pressable
            key={currencyKey}
            onPress={() => setCurrency(currencyKey)}
            style={[styles.chip, currency === currencyKey && styles.chipActive]}
          >
            <Text style={[styles.chipText, currency === currencyKey && styles.chipTextActive]}>
              {currencyKey === "all" ? t("work.allCurrencies") : currencyKey}
            </Text>
          </Pressable>
        ))}
        <View style={styles.chipDivider} />
        {SORTS.map((sortKey) => (
          <Pressable
            key={sortKey}
            onPress={() => setSort(sortKey)}
            style={[styles.chip, sort === sortKey && styles.chipActive]}
          >
            <Text style={[styles.chipText, sort === sortKey && styles.chipTextActive]}>
              {t(`work.sorts.${sortKey}`)}
            </Text>
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
              tintColor={theme.colors.accent}
            />
          }
          ListEmptyComponent={
            <View>
              <View style={styles.emptyBlock}>
                <Icon name="Briefcase" size={40} color="#3F3F46" />
                <Text style={styles.emptyText}>
                  {hasFilters
                    ? t("work.noMatchingBounties")
                    : t("work.noOpenBounties")}
                </Text>
                <View style={styles.emptyActions}>
                  <Pressable onPress={goPost} style={styles.primaryBtn}>
                    <Icon name="Plus" size={15} color="#000000" />
                    <Text style={styles.primaryBtnText}>{t("work.postBounty")}</Text>
                  </Pressable>
                  {hasFilters && (
                    <Pressable onPress={clearFilters} style={styles.secondaryBtn}>
                      <Text style={styles.secondaryBtnText}>{t("work.clearFilters")}</Text>
                    </Pressable>
                  )}
                </View>
              </View>

              {showCompletedFallback && completedJobs.length > 0 && (
                <View style={{ gap: 12 }}>
                  <Text style={styles.sectionHeading}>{t("work.recentlyCompleted")}</Text>
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
  root: { flex: 1, backgroundColor: "#010305" },
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
  chipText: { color: "#A1A1AA", fontSize: 14, fontWeight: "600" },
  chipTextActive: { color: "#000000" },
  chipDivider: {
    width: 1,
    height: 18,
    backgroundColor: "rgba(255,255,255,0.14)",
    marginHorizontal: 2,
  },

  card: {
    borderRadius: 12,
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
  badgeText: { color: "#D4D4D8", fontSize: 12, fontWeight: "600" },
  badgeDim: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  badgeDimText: { color: "#A1A1AA", fontSize: 12, fontWeight: "600" },
  badgeBoost: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.20)",
  },
  badgeBoostText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },

  budget: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  perUnit: { color: "#A1A1AA", fontSize: 12, marginTop: 2 },

  cardTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  cardDesc: { color: "#A1A1AA", fontSize: 12.5, lineHeight: 18, marginTop: 4, marginBottom: 12 },

  metaRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { color: "#A1A1AA", fontSize: 12 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 64 },
  emptyBlock: { alignItems: "center", paddingVertical: 48 },
  emptyText: {
    color: "#A1A1AA",
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

  sectionHeading: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "700",
    paddingHorizontal: 2,
    marginBottom: 2,
  },
});
