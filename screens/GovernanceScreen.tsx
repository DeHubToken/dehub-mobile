/**
 * GovernanceScreen
 * ================
 * Native port of the web GovernancePage (/governance). A token-holder proposal
 * board with Active / Passed / Rejected tabs and for/against vote visualisation.
 * Read-only for now — weighted voting and proposal submission need the DHB
 * balance/badge + contract layer (deferred, matching the web3 bucket).
 */
import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Icon from "../components/ui/Icon";
import Avatar from "../components/common/Avatar";
import { theme } from "../theme";
import { getAvatarUrl } from "../libs/misc";
import { formatCompactNumber } from "../libs";
import { getProposals, type GovernanceProposal, type GovernanceTab } from "../services/governance.service";

const TABS: { key: GovernanceTab; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "passed", label: "Passed" },
  { key: "rejected", label: "Rejected" },
];

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

const ProposalCard: React.FC<{ proposal: GovernanceProposal }> = ({ proposal }) => {
  const forW = proposal.like_count || 0;
  const againstW = proposal.dislike_count || 0;
  const total = forW + againstW;
  const forPct = total > 0 ? Math.round((forW / total) * 100) : 0;
  const againstPct = total > 0 ? 100 - forPct : 0;
  const username = proposal.author_username || `${proposal.author_wallet_address.slice(0, 6)}…${proposal.author_wallet_address.slice(-4)}`;

  return (
    <View style={styles.card}>
      <View style={styles.authorRow}>
        <Avatar uri={getAvatarUrl(proposal.author_avatar)} size={28} name={username} />
        <Text style={styles.authorName} numberOfLines={1}>@{username}</Text>
        <Text style={styles.time}>{timeAgo(proposal.created_at)}</Text>
      </View>

      <Text style={styles.cardTitle}>{proposal.title}</Text>
      {!!proposal.description && (
        <Text style={styles.cardDesc} numberOfLines={4}>{proposal.description}</Text>
      )}

      {/* For / against bar */}
      <View style={styles.barTrack}>
        <View style={[styles.barFor, { flex: total > 0 ? forW : 1 }]} />
        <View style={[styles.barAgainst, { flex: total > 0 ? againstW : 1 }]} />
      </View>
      <View style={styles.pctRow}>
        <Text style={styles.forText}>{forPct}% For</Text>
        <Text style={styles.againstText}>{againstPct}% Against</Text>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Icon name="ThumbsUp" size={13} color="#34D399" />
          <Text style={styles.metaText}>{formatCompactNumber(forW)}</Text>
        </View>
        <View style={styles.metaItem}>
          <Icon name="ThumbsDown" size={13} color="#F87171" />
          <Text style={styles.metaText}>{formatCompactNumber(againstW)}</Text>
        </View>
        <View style={styles.metaItem}>
          <Icon name="MessageCircle" size={13} color="#71717A" />
          <Text style={styles.metaText}>{formatCompactNumber(proposal.comment_count || 0)}</Text>
        </View>
      </View>
    </View>
  );
};

export default function GovernanceScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [tab, setTab] = useState<GovernanceTab>("active");

  const { data: proposals = [], isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["governance-proposals", tab],
    queryFn: () => getProposals(tab),
  });

  const keyExtractor = useCallback((p: GovernanceProposal) => p.id, []);
  const renderItem = useCallback(
    ({ item }: { item: GovernanceProposal }) => <ProposalCard proposal={item} />,
    [],
  );

  const emptyLabel = useMemo(() => {
    if (tab === "passed") return "No passed proposals yet";
    if (tab === "rejected") return "No rejected proposals yet";
    return "No active proposals right now";
  }, [tab]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Icon name="ArrowLeft" size={22} color="#FFFFFF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Governance</Text>
          <Text style={styles.subtitle}>Vote on proposals that shape the platform</Text>
        </View>
        <Icon name="ShieldCheck" size={22} color={theme.colors.accent} />
      </View>

      <View style={styles.filterRow}>
        {TABS.map((tb) => {
          const active = tab === tb.key;
          return (
            <Pressable key={tb.key} onPress={() => setTab(tb.key)} style={[styles.filterChip, active && styles.filterChipActive]}>
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{tb.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#FFFFFF" /></View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Couldn't load proposals</Text>
          <Pressable onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={proposals}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 24, paddingTop: 4, gap: 12 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.colors.accentForeground} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Icon name="ShieldCheck" size={44} color="#3F3F46" />
              <Text style={styles.emptyText}>{emptyLabel}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 12 },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { color: "#FFFFFF", fontSize: 21, fontWeight: "700" },
  subtitle: { color: "#71717A", fontSize: 12, marginTop: 1 },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingBottom: 10 },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  filterChipActive: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
  filterText: { color: "#A1A1AA", fontSize: 13, fontWeight: "600" },
  filterTextActive: { color: "#000000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 64 },
  emptyText: { color: "#71717A", fontSize: 13, marginTop: 12 },
  retryBtn: { marginTop: 14, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 12, backgroundColor: "#27272A" },
  retryText: { color: "#FAFAFA", fontSize: 13, fontWeight: "600" },
  card: {
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    padding: 14,
    gap: 8,
  },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  authorName: { flex: 1, color: "#D4D4D8", fontSize: 13, fontWeight: "600" },
  time: { color: "#71717A", fontSize: 11 },
  cardTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", lineHeight: 20 },
  cardDesc: { color: "#A1A1AA", fontSize: 13, lineHeight: 19 },
  barTrack: {
    flexDirection: "row",
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
    marginTop: 4,
  },
  barFor: { backgroundColor: "#34D399" },
  barAgainst: { backgroundColor: "#F87171" },
  pctRow: { flexDirection: "row", justifyContent: "space-between" },
  forText: { color: "#34D399", fontSize: 12, fontWeight: "600" },
  againstText: { color: "#F87171", fontSize: 12, fontWeight: "600" },
  metaRow: { flexDirection: "row", gap: 16, marginTop: 2 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { color: "#A1A1AA", fontSize: 12 },
});
