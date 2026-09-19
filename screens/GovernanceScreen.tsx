/**
 * GovernanceScreen
 * ================
 * Native port of the web GovernancePage (/governance). A token-holder proposal
 * board with Active / Passed / Rejected tabs and for/against vote visualisation.
 * Read-only for now — weighted voting and proposal submission need the DHB
 * balance/badge + contract layer (deferred, matching the web3 bucket).
 */
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, StyleSheet, Pressable, FlatList, TextInput, ActivityIndicator, Alert } from "react-native";
import { DeHubRefreshControl, DeHubRefreshMark } from "../components/Feed/DeHubRefreshControl";
import { DeHubLoader } from "../components/DeHubLoader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useNavigation, useRoute } from "@react-navigation/native";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import Avatar from "../components/common/Avatar";
import { theme } from "../theme";
import { getAvatarUrl } from "../libs/misc";
import { formatCompactNumber } from "../libs";
import { getProposals, type GovernanceProposal, type GovernanceTab } from "../services/governance.service";
import { getProposal } from "../services/governance.service";
import { useAuthState, useUser } from "../context/AuthContext";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import { useDeleteGovernanceComment, useGovernanceComments, useSubmitGovernanceComment } from "../hooks/useGovernanceComments";
import { ScreenNames } from "../navigation/ScreenNames";

const TABS: { key: GovernanceTab; labelKey: string }[] = [
  { key: "active", labelKey: "governance.active" },
  { key: "passed", labelKey: "governance.passed" },
  { key: "rejected", labelKey: "governance.rejected" },
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

const ProposalCard: React.FC<{ proposal: GovernanceProposal; onPress: () => void }> = ({ proposal, onPress }) => {
  const forW = proposal.like_count || 0;
  const againstW = proposal.dislike_count || 0;
  const total = forW + againstW;
  const forPct = total > 0 ? Math.round((forW / total) * 100) : 0;
  const againstPct = total > 0 ? 100 - forPct : 0;
  const username = proposal.author_username || `${proposal.author_wallet_address.slice(0, 6)}…${proposal.author_wallet_address.slice(-4)}`;

  return (
    <Pressable style={styles.card} onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open proposal ${proposal.title}`}>
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
          <Icon name="ThumbsUp" size={13} color="#F4F4F5" />
          <Text style={styles.metaText}>{formatCompactNumber(forW)}</Text>
        </View>
        <View style={styles.metaItem}>
          <Icon name="ThumbsDown" size={13} color="#F4F4F5" />
          <Text style={styles.metaText}>{formatCompactNumber(againstW)}</Text>
        </View>
        <View style={styles.metaItem}>
          <Icon name="MessageCircle" size={13} color="#808089" />
          <Text style={styles.metaText}>{formatCompactNumber(proposal.comment_count || 0)}</Text>
        </View>
      </View>
    </Pressable>
  );
};

const ProposalDiscussion: React.FC<{ proposal: GovernanceProposal; onClose: () => void }> = ({ proposal, onClose }) => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { isSignedIn } = useAuthState();
  const user = useUser() as any;
  const { showUserProfile } = useUserProfileSheet();
  const { data: comments = [], isLoading } = useGovernanceComments(proposal.id);
  const submitComment = useSubmitGovernanceComment();
  const deleteComment = useDeleteGovernanceComment();
  const [draft, setDraft] = useState("");
  const wallet = (user?.walletAddress || user?.address || "").toLowerCase();

  const submit = useCallback(() => {
    const content = draft.trim();
    if (!content || submitComment.isPending) return;
    if (!isSignedIn) {
      navigation.navigate(ScreenNames.SignIn);
      return;
    }
    submitComment.mutate({ proposalId: proposal.id, content }, { onSuccess: () => setDraft("") });
  }, [draft, isSignedIn, navigation, proposal.id, submitComment]);

  const confirmDelete = useCallback((commentId: string) => {
    Alert.alert("Delete comment?", "This cannot be undone.", [
      { text: t("common.cancel", "Cancel"), style: "cancel" },
      { text: t("common.delete", "Delete"), style: "destructive", onPress: () => deleteComment.mutate({ commentId, proposalId: proposal.id }) },
    ]);
  }, [deleteComment, proposal.id, t]);

  return (
    <FlatList
      data={comments}
      keyExtractor={(comment) => comment.id}
      contentContainerStyle={styles.detailContent}
      ListHeaderComponent={
        <>
          <Pressable onPress={onClose} style={styles.backButton} accessibilityRole="button">
            <Icon name="ArrowLeft" size={16} color="#D4D4D8" />
            <Text style={styles.backText}>{t("governance.title")}</Text>
          </Pressable>
          <ProposalCard proposal={proposal} onPress={() => undefined} />
          <Text style={styles.discussionTitle}>{t("governance.comments", "Discussion")}</Text>
          {isLoading ? <ActivityIndicator color="#808089" style={{ paddingVertical: 16 }} /> : null}
          {!isLoading && comments.length === 0 ? <Text style={styles.emptyDiscussion}>{t("governance.noCommentsYet", "No comments yet. Start the discussion.")}</Text> : null}
        </>
      }
      renderItem={({ item: comment }) => {
        const own = wallet && wallet === comment.wallet_address.toLowerCase();
        const name = comment.username ? `@${comment.username}` : `${comment.wallet_address.slice(0, 6)}…${comment.wallet_address.slice(-4)}`;
        return (
          <View style={styles.commentRow}>
            <Pressable onPress={() => showUserProfile(comment.wallet_address)}>
              <Avatar uri={getAvatarUrl(comment.avatar)} size={26} name={comment.username || comment.wallet_address} />
            </Pressable>
            <View style={styles.commentCopy}>
              <View style={styles.commentMeta}>
                <Text style={styles.commentName}>{name}</Text>
                <Text style={styles.commentTime}>{timeAgo(comment.created_at)}</Text>
                {own ? <Pressable onPress={() => confirmDelete(comment.id)} style={{ marginLeft: "auto" }} hitSlop={10}><Icon name="Trash2" size={13} color="#808089" /></Pressable> : null}
              </View>
              <Text style={styles.commentBody}>{comment.content}</Text>
            </View>
          </View>
        );
      }}
      ListFooterComponent={
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={(value) => setDraft(value.slice(0, 500))}
            placeholder={t("governance.addComment", "Add a comment")}
            placeholderTextColor="#71717A"
            style={styles.composerInput}
            multiline
          />
          <Pressable onPress={submit} disabled={!draft.trim() || submitComment.isPending} style={[styles.sendButton, (!draft.trim() || submitComment.isPending) && styles.sendButtonDisabled]}>
            {submitComment.isPending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Icon name="Send" size={15} color="#FFFFFF" />}
          </Pressable>
        </View>
      }
    />
  );
};

export default function GovernanceScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const [tab, setTab] = useState<GovernanceTab>("active");
  const [selectedProposal, setSelectedProposal] = useState<GovernanceProposal | null>(null);
  const focusedProposalId: string | undefined = route.params?.proposalId;

  const { data: proposals = [], isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["governance-proposals", tab],
    queryFn: () => getProposals(tab),
  });

  const focusedProposalQuery = useQuery({
    queryKey: ["governance-proposal", focusedProposalId],
    queryFn: () => getProposal(focusedProposalId!),
    enabled: !!focusedProposalId,
  });

  const proposalForDiscussion = selectedProposal ?? focusedProposalQuery.data;

  const keyExtractor = useCallback((p: GovernanceProposal) => p.id, []);
  const renderItem = useCallback(
    ({ item }: { item: GovernanceProposal }) => <ProposalCard proposal={item} onPress={() => setSelectedProposal(item)} />,
    [],
  );

  const emptyLabel = useMemo(() => {
    if (tab === "passed") return t("governance.noPassedYet");
    if (tab === "rejected") return t("governance.noRejectedYet");
    return t("governance.noActiveNow");
  }, [tab, t]);

  if (proposalForDiscussion) {
    return (
      <View style={styles.root}>
        <ProposalDiscussion
          proposal={proposalForDiscussion}
          onClose={() => {
            setSelectedProposal(null);
            if (focusedProposalId) navigation.setParams({ proposalId: undefined });
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={t("governance.title")}
        subtitle={t("governance.subtitle")}
        rightContent={<Icon name="ShieldCheck" size={22} color={theme.colors.accent} />}
      />

      <View style={styles.filterRow}>
        {TABS.map((tb) => {
          const active = tab === tb.key;
          return (
            <Pressable key={tb.key} onPress={() => setTab(tb.key)} style={[styles.filterChip, active && styles.filterChipActive]}>
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{t(tb.labelKey)}</Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.center}><DeHubLoader size={56} /></View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{t("governance.loadFailed")}</Text>
          <Pressable onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t("common.retry")}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={proposals}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 24, paddingTop: 4, gap: 12 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<DeHubRefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.colors.accent} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Icon name="ShieldCheck" size={44} color="#3F3F46" />
              <Text style={styles.emptyText}>{emptyLabel}</Text>
            </View>
          }
        />
      )}
      <DeHubRefreshMark refreshing={isRefetching} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingBottom: 10 },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  filterChipActive: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
  filterText: { color: "#A1A1AA", fontSize: 13, fontWeight: "600" },
  filterTextActive: { color: "#000000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 64 },
  emptyText: { color: "#808089", fontSize: 13, marginTop: 12 },
  retryBtn: {
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  retryText: { color: "#FAFAFA", fontSize: 13, fontWeight: "600" },
  detailContent: { padding: 12, paddingBottom: 36, gap: 12 },
  backButton: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 4 },
  backText: { color: "#D4D4D8", fontSize: 13, fontWeight: "600" },
  discussionTitle: { color: "#F4F4F5", fontSize: 15, fontWeight: "700", marginTop: 6 },
  emptyDiscussion: { color: "#808089", textAlign: "center", fontSize: 13, paddingVertical: 18 },
  commentRow: { flexDirection: "row", gap: 9, paddingVertical: 8 },
  commentCopy: { flex: 1, minWidth: 0 },
  commentMeta: { flexDirection: "row", alignItems: "center", gap: 7 },
  commentName: { color: "#D4D4D8", fontSize: 12, fontWeight: "600", flexShrink: 1 },
  commentTime: { color: "#71717A", fontSize: 11 },
  commentBody: { color: "#D4D4D8", fontSize: 13, lineHeight: 19, marginTop: 3 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", paddingTop: 12, marginTop: 8 },
  composerInput: { flex: 1, minHeight: 38, maxHeight: 112, color: "#FFFFFF", fontSize: 13, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)" },
  sendButton: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#52525B" },
  sendButtonDisabled: { opacity: 0.35 },
  card: {
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    padding: 14,
    gap: 8,
  },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  authorName: { flex: 1, color: "#D4D4D8", fontSize: 13, fontWeight: "600" },
  time: { color: "#A1A1AA", fontSize: 12 },
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
  barFor: { backgroundColor: "#F4F4F5" },
  barAgainst: { backgroundColor: "#808089" },
  pctRow: { flexDirection: "row", justifyContent: "space-between" },
  forText: { color: "#F4F4F5", fontSize: 12, fontWeight: "600" },
  againstText: { color: "#8B8D90", fontSize: 12, fontWeight: "600" },
  metaRow: { flexDirection: "row", gap: 16, marginTop: 2 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { color: "#A1A1AA", fontSize: 12 },
});
