/**
 * GovernanceProposalScreen
 * ========================
 * One proposal and the discussion under it — native twin of web's
 * /app/governance/:proposalId. The card reads as it does on the board; below
 * it, the threaded discussion is where follow-up questions get asked before
 * the vote. Replies sit one level deep under their root comment with a thread
 * line through the avatars, the same treatment web gives them.
 *
 * `commentId` is a notification's deep link to one comment: its thread is
 * opened, the row is lit, and the list scrolls to the discussion.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { TFunction } from "i18next";
import Icon from "../components/ui/Icon";
import ScreenHeader, { SCREEN_HEADER_HEIGHT } from "../components/ScreenHeader";
import Avatar from "../components/common/Avatar";
import { DeHubLoader } from "../components/DeHubLoader";
import { theme } from "../theme";
import { getAvatarUrl } from "../libs/misc";
import { formatCompactNumber } from "../libs";
import { useUser, useAuthState } from "../context/AuthContext";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import { useKeyboardOffset } from "../hooks/useKeyboardLayout";
import { ScreenNames } from "../navigation/ScreenNames";
import {
  useGovernanceProposal,
  useProposalDiscussion,
  useSubmitProposalComment,
  useDeleteProposalComment,
  type ProposalComment,
  type ProposalThread,
} from "../hooks/useGovernanceDiscussion";

const COMMENT_MAX = 500;
/** Replies shown before a thread collapses behind "Show N more replies". */
const VISIBLE_REPLIES = 1;

function timeAgo(iso: string, t: TFunction): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t("governance.justNow");
  const m = Math.floor(s / 60);
  if (m < 60) return t("governance.minutesAgo", { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("governance.hoursAgo", { count: h });
  const d = Math.floor(h / 24);
  if (d < 30) return t("governance.daysAgo", { count: d });
  return t("governance.monthsAgo", { count: Math.floor(d / 30) });
}

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// ── Comment row ─────────────────────────────────────────────────────────────

const CommentRow: React.FC<{
  comment: ProposalComment;
  isOwn: boolean;
  isProposalAuthor: boolean;
  highlighted: boolean;
  threadLineAbove?: boolean;
  threadLineBelow?: boolean;
  onReply: (comment: ProposalComment) => void;
  onDelete: (comment: ProposalComment) => void;
}> = ({ comment, isOwn, isProposalAuthor, highlighted, threadLineAbove, threadLineBelow, onReply, onDelete }) => {
  const { t } = useTranslation();
  const { showUserProfile } = useUserProfileSheet();
  const name = comment.username ? `@${comment.username}` : shortAddr(comment.wallet_address);

  return (
    <Pressable
      onPress={() => onReply(comment)}
      style={[styles.commentRow, highlighted && styles.commentRowHighlighted]}
      accessibilityRole="button"
      accessibilityLabel={t("governance.discussion.reply")}
    >
      {/* Thread line: replies share their parent's left edge, and the line
          through the avatars is what says they belong together. */}
      {threadLineAbove && <View style={styles.threadLineAbove} />}
      {threadLineBelow && <View style={styles.threadLineBelow} />}
      <Pressable
        onPress={() => showUserProfile?.(comment.username || comment.wallet_address)}
        style={{ flexShrink: 0 }}
      >
        <Avatar uri={getAvatarUrl(comment.avatar)} size={28} name={comment.username || comment.wallet_address} />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.commentHead}>
          <Text style={styles.commentAuthor} numberOfLines={1}>{name}</Text>
          {isProposalAuthor && (
            <View style={styles.authorChip}>
              <Text style={styles.authorChipText}>{t("governance.discussion.authorChip")}</Text>
            </View>
          )}
          <Text style={styles.commentTime}>{timeAgo(comment.created_at, t)}</Text>
          {!!comment.updated_at && <Text style={styles.commentEdited}>{t("governance.discussion.edited")}</Text>}
        </View>
        <Text style={styles.commentBody}>{comment.content}</Text>
        <View style={styles.commentActions}>
          <Pressable
            onPress={() => onReply(comment)}
            hitSlop={8}
            style={styles.commentAction}
            accessibilityRole="button"
            accessibilityLabel={t("governance.discussion.reply")}
          >
            <Icon name="MessageSquare" size={14} color="#D4D4D8" />
            <Text style={styles.commentActionText}>{t("governance.discussion.reply")}</Text>
          </Pressable>
          {isOwn && (
            <Pressable
              onPress={() => onDelete(comment)}
              hitSlop={8}
              style={styles.commentAction}
              accessibilityRole="button"
              accessibilityLabel={t("common.delete")}
            >
              <Icon name="Trash2" size={14} color="#808089" />
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
};

// ── Screen ──────────────────────────────────────────────────────────────────

export default function GovernanceProposalScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const proposalId: string | undefined = route.params?.proposalId;
  const focusedCommentId: string | undefined = route.params?.commentId;
  const keyboardOffset = useKeyboardOffset(SCREEN_HEADER_HEIGHT);

  const user = useUser() as any;
  const { isSignedIn, needsUsername } = useAuthState();
  const isAuthed = isSignedIn && !needsUsername;
  const myWallet: string = (user?.walletAddress || user?.address || "").toLowerCase();

  const { data: proposal, isLoading, isError, refetch } = useGovernanceProposal(proposalId);
  const { data: threads = [], isLoading: threadsLoading } = useProposalDiscussion(proposalId);
  const submitComment = useSubmitProposalComment();
  const deleteComment = useDeleteProposalComment();

  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ProposalComment | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const discussionY = useRef(0);
  const scrolledToFocus = useRef(false);

  // A thread holding the linked comment opens itself, or the row the
  // notification was about would sit behind "Show N more replies".
  useEffect(() => {
    if (!focusedCommentId || threads.length === 0) return;
    const owner = threads.find(
      (thread) => thread.comment.id === focusedCommentId || thread.replies.some((r) => r.id === focusedCommentId),
    );
    if (owner) setExpanded((prev) => new Set(prev).add(owner.comment.id));
    if (!scrolledToFocus.current && discussionY.current > 0) {
      scrolledToFocus.current = true;
      scrollRef.current?.scrollTo({ y: discussionY.current, animated: true });
    }
  }, [focusedCommentId, threads]);

  const handleReply = useCallback(
    (comment: ProposalComment) => {
      if (!isAuthed) {
        navigation.navigate(ScreenNames.SignIn);
        return;
      }
      setReplyTo(comment);
      // Every reply that threads on this platform carries the "@name " prefix,
      // so the ones that read like replies and the ones that are replies match.
      const prefix = comment.username ? `@${comment.username} ` : "";
      setDraft((current) => (current.startsWith(prefix) ? current : prefix + current));
      inputRef.current?.focus();
    },
    [isAuthed, navigation],
  );

  const confirmDelete = useCallback(
    (comment: ProposalComment) => {
      if (!proposalId) return;
      Alert.alert(t("governance.discussion.deleteTitle"), t("governance.discussion.deleteDescription"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => deleteComment.mutate({ commentId: comment.id, proposalId }),
        },
      ]);
    },
    [deleteComment, proposalId, t],
  );

  const send = useCallback(() => {
    const content = draft.trim();
    if (!content || submitComment.isPending || !proposalId) return;
    if (!isAuthed) {
      navigation.navigate(ScreenNames.SignIn);
      return;
    }
    const parent = replyTo;
    submitComment.mutate(
      { proposalId, content, parentId: parent?.id ?? null },
      {
        onSuccess: () => {
          if (parent) setExpanded((prev) => new Set(prev).add(parent.parent_id ?? parent.id));
          setDraft("");
          setReplyTo(null);
        },
      },
    );
  }, [draft, submitComment, proposalId, isAuthed, navigation, replyTo]);

  const totalComments = useMemo(
    () => threads.reduce((sum, thread) => sum + 1 + thread.replies.length, 0),
    [threads],
  );

  const renderThread = (thread: ProposalThread) => {
    const isExpanded = expanded.has(thread.comment.id);
    const shown = isExpanded ? thread.replies : thread.replies.slice(0, VISIBLE_REPLIES);
    const hidden = thread.replies.length - shown.length;
    const authorAddr = proposal?.author_wallet_address.toLowerCase() ?? "";
    const rowFor = (comment: ProposalComment, lines: { above?: boolean; below?: boolean }) => (
      <CommentRow
        key={comment.id}
        comment={comment}
        isOwn={!!myWallet && myWallet === comment.wallet_address.toLowerCase()}
        isProposalAuthor={comment.wallet_address.toLowerCase() === authorAddr}
        highlighted={comment.id === focusedCommentId}
        threadLineAbove={lines.above}
        threadLineBelow={lines.below}
        onReply={handleReply}
        onDelete={confirmDelete}
      />
    );
    return (
      <View key={thread.comment.id}>
        {rowFor(thread.comment, { below: shown.length > 0 })}
        {shown.map((reply, i) =>
          rowFor(reply, { above: true, below: i < shown.length - 1 || hidden > 0 }),
        )}
        {hidden > 0 && (
          <Pressable
            onPress={() => setExpanded((prev) => new Set(prev).add(thread.comment.id))}
            style={styles.showMore}
            accessibilityRole="button"
          >
            <View style={styles.showMoreElbowUp} />
            <View style={styles.showMoreElbow} />
            <Text style={styles.showMoreText}>
              {t("governance.discussion.showMoreReplies", { count: hidden })}
            </Text>
          </Pressable>
        )}
      </View>
    );
  };

  const forW = proposal?.like_count || 0;
  const againstW = proposal?.dislike_count || 0;
  const total = forW + againstW;
  const forPct = total > 0 ? Math.round((forW / total) * 100) : 0;
  const againstPct = total > 0 ? 100 - forPct : 0;
  const authorName = proposal
    ? proposal.author_username || shortAddr(proposal.author_wallet_address)
    : "";

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={t("governance.title")}
        rightContent={<Icon name="ShieldCheck" size={22} color={theme.colors.accent} />}
      />

      {isLoading ? (
        <View style={styles.center}><DeHubLoader size={56} /></View>
      ) : isError || !proposal ? (
        <View style={styles.center}>
          <Icon name="ShieldCheck" size={44} color="#3F3F46" />
          <Text style={styles.emptyText}>{t("governance.loadFailed")}</Text>
          <Pressable onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t("common.retry")}</Text>
          </Pressable>
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={keyboardOffset}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 24, paddingTop: 4, gap: 12 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Proposal card, as the board shows it, with the whole description. */}
            <View style={styles.card}>
              <View style={styles.authorRow}>
                <Avatar uri={getAvatarUrl(proposal.author_avatar)} size={28} name={authorName} />
                <Text style={styles.authorName} numberOfLines={1}>@{authorName}</Text>
                <Text style={styles.time}>{timeAgo(proposal.created_at, t)}</Text>
              </View>

              <Text style={styles.cardTitle}>{proposal.title}</Text>
              {!!proposal.description && <Text style={styles.cardDesc}>{proposal.description}</Text>}

              <View style={styles.barTrack}>
                <View style={[styles.barFor, { flex: total > 0 ? forW : 1 }]} />
                <View style={[styles.barAgainst, { flex: total > 0 ? againstW : 1 }]} />
              </View>
              <View style={styles.pctRow}>
                <Text style={styles.forText}>{forPct}% {t("governance.forLabel")}</Text>
                <Text style={styles.againstText}>{againstPct}% {t("governance.againstLabel")}</Text>
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
            </View>

            {/* Discussion */}
            <View style={styles.card} onLayout={(e) => { discussionY.current = e.nativeEvent.layout.y; }}>
              <Text style={styles.sectionTitle}>{t("governance.discussion.title")}</Text>
              <Text style={styles.sectionIntro}>{t("governance.discussion.intro")}</Text>

              {threadsLoading ? (
                <ActivityIndicator color="#808089" style={{ paddingVertical: 12 }} />
              ) : totalComments === 0 ? (
                <Text style={styles.noComments}>{t("governance.discussion.empty")}</Text>
              ) : (
                threads.map(renderThread)
              )}

              {replyTo && (
                <View style={styles.replyingBar}>
                  <Text style={styles.replyingText} numberOfLines={1}>
                    {t("governance.discussion.replyingTo", {
                      name: replyTo.username ? `@${replyTo.username}` : shortAddr(replyTo.wallet_address),
                    })}
                  </Text>
                  <Pressable
                    onPress={() => setReplyTo(null)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t("common.cancel")}
                  >
                    <Icon name="X" size={14} color="#808089" />
                  </Pressable>
                </View>
              )}

              {isAuthed ? (
                <View style={styles.composer}>
                  <TextInput
                    ref={inputRef}
                    value={draft}
                    onChangeText={(v) => setDraft(v.slice(0, COMMENT_MAX))}
                    placeholder={replyTo ? t("governance.discussion.writeReply") : t("governance.addComment")}
                    placeholderTextColor="#52525B"
                    style={styles.composerInput}
                    multiline
                  />
                  <Pressable
                    onPress={send}
                    disabled={!draft.trim() || submitComment.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={t("governance.addComment")}
                    style={[styles.sendBtn, (!draft.trim() || submitComment.isPending) && styles.sendBtnDisabled]}
                  >
                    {submitComment.isPending ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Icon name="Send" size={14} color="#FFFFFF" />
                    )}
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={() => navigation.navigate(ScreenNames.SignIn)} style={styles.signInBar}>
                  <Text style={styles.signInText}>{t("governance.discussion.signInToComment")}</Text>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const GLASS_BG = "rgba(255,255,255,0.10)";
const GLASS_BORDER = "rgba(255,255,255,0.30)";
const THREAD_LINE = "rgba(255,255,255,0.20)";
/** Avatar centre: 14pt card padding + half the 28pt avatar. */
const THREAD_X = 14 + 14;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
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
  cardTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", lineHeight: 21 },
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

  sectionTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  sectionIntro: { color: "#808089", fontSize: 12, lineHeight: 17, marginTop: -4 },
  noComments: { color: "#808089", fontSize: 12, textAlign: "center", paddingVertical: 8 },

  commentRow: { flexDirection: "row", gap: 10, paddingVertical: 6, marginHorizontal: -14, paddingHorizontal: 14, borderRadius: 8 },
  commentRowHighlighted: { backgroundColor: "rgba(255,255,255,0.06)" },
  threadLineAbove: { position: "absolute", left: THREAD_X, top: 0, height: 6 + 14, width: 1, backgroundColor: THREAD_LINE },
  threadLineBelow: { position: "absolute", left: THREAD_X, top: 6 + 14, bottom: 0, width: 1, backgroundColor: THREAD_LINE },
  commentHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  commentAuthor: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "600", flexShrink: 1 },
  authorChip: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    flexShrink: 0,
  },
  authorChipText: { color: "rgba(255,255,255,0.75)", fontSize: 9, fontWeight: "600" },
  commentTime: { color: "#808089", fontSize: 10, flexShrink: 0 },
  commentEdited: { color: "#52525B", fontSize: 10, flexShrink: 0 },
  commentBody: { color: "#D4D4D8", fontSize: 13, lineHeight: 18, marginTop: 2 },
  commentActions: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 6 },
  commentAction: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 20 },
  commentActionText: { color: "#D4D4D8", fontSize: 11, fontWeight: "500" },

  showMore: { flexDirection: "row", alignItems: "center", height: 30, paddingLeft: 38, marginBottom: 2 },
  showMoreElbowUp: { position: "absolute", left: THREAD_X - 14, top: 0, height: 15, width: 1, backgroundColor: THREAD_LINE },
  showMoreElbow: { position: "absolute", left: THREAD_X - 14, top: 15, width: 18, height: 1, backgroundColor: THREAD_LINE },
  showMoreText: { color: "#A1A1AA", fontSize: 12 },

  replyingBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 6 },
  replyingText: { color: "#A1A1AA", fontSize: 12, flex: 1 },

  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 4 },
  composerInput: {
    flex: 1,
    minHeight: 36,
    maxHeight: 110,
    color: "#FFFFFF",
    fontSize: 13,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },
  sendBtnDisabled: { opacity: 0.3 },
  signInBar: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    paddingVertical: 10,
    alignItems: "center",
  },
  signInText: { color: "#A1A1AA", fontSize: 12.5, fontWeight: "500" },
});
