/**
 * Requests board comments
 * =======================
 * The thread under a request card, drawn by the post thread's own row
 * (components/Comments/CommentItem): same avatar, badge, reaction tray, media,
 * link cards, long-press menu and likers sheet. Replies thread one visible
 * level deep with the same line through the avatars. The composer takes what
 * a post comment takes: text with @mentions, a photo, video or audio file, a
 * GIF, an emoji or a voice note.
 *
 * Data lives in Supabase (hooks/useFeatureRequestThread), shared with web.
 */
import React, { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import Icon from "../ui/Icon";
import CommentItem from "../Comments/CommentItem";
import CommentMediaPreview, { type MediaAttachment } from "../Comments/CommentMediaPreview";
import CommentContextMenu from "../Comments/CommentContextMenu";
import type { CommentLayout } from "../Comments/CommentContextMenu";
import CommentLikersSheet from "../Comments/CommentLikersSheet";
import { CommentLoadError } from "../Comments/CommentLoadError";
import { useCommentAttachPicker } from "../Comments/useCommentAttachPicker";
import { useVoiceRecorder, VoiceNoteRecordingOverlay, type VoiceNoteResult } from "../Comments/VoiceNoteRecorder";
import { COMPOSER, composerStyles } from "../Comments/composerLayout";
import GifPicker from "../DM/GifPicker";
import EmojiSheet from "../Upload/EmojiSheet";
import MentionSuggestions from "../common/MentionSuggestions";
import type { TranslateToggle } from "../ui/TranslateButton";
import { useMentions } from "../../hooks/useMentions";
import { useGrowingTextInput } from "../../hooks/useGrowingTextInput";
import { useSurfaceDraft } from "../../hooks/useSurfaceDraft";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import {
  featureLikersLoader,
  useFeatureRequestThread,
  useFeatureThreadActions,
} from "../../hooks/useFeatureRequestThread";
import type { Comment } from "../../services/nft.service";
import type { PostReaction } from "../../libs/reactions";
import { ScreenNames } from "../../navigation/ScreenNames";

/** Replies shown under a comment before "Show N more". */
const VISIBLE_REPLIES = 1;

interface Props {
  featureId: string;
  featureTitle: string;
  authorAddress: string;
  isAuthed: boolean;
  /** A comment a notification pointed at — ringed and its thread opened. */
  highlightCommentId?: string | null;
}

const RequestComments: React.FC<Props> = ({ featureId, featureTitle, authorAddress, isAuthed, highlightCommentId }) => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { showUserProfile } = useUserProfileSheet();
  const { data, isLoading, isError, isFetching, refetch } = useFeatureRequestThread(featureId);
  const { submit, edit, remove, react } = useFeatureThreadActions(featureId, { title: featureTitle, authorAddress });

  const [text, setText] = useSurfaceDraft(`request-comments:${featureId}:text`, "");
  const mentions = useMentions(text, (value) => setText(value.slice(0, 500)));
  const growing = useGrowingTextInput(text, 22, 140);
  const inputRef = useRef<TextInput>(null);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [editing, setEditing] = useState<Comment | null>(null);
  const [media, setMedia] = useState<MediaAttachment | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [gifOpen, setGifOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [likersFor, setLikersFor] = useState<number | null>(null);
  const [context, setContext] = useState<{
    comment: Comment;
    layout: CommentLayout;
    extra: { liked: boolean; disliked: boolean; isOwnComment: boolean; isReply: boolean; translate?: TranslateToggle };
  } | null>(null);

  const rows = data?.rows;
  const rowFor = useCallback((comment: Comment) => rows?.get(Number(comment.id)) ?? null, [rows]);
  const highlightNumber = useMemo(() => {
    if (!highlightCommentId || !rows) return null;
    for (const [num, row] of rows) if (row.id === highlightCommentId) return num;
    return null;
  }, [highlightCommentId, rows]);

  const requireAuth = useCallback((run: () => void) => {
    if (!isAuthed) { navigation.navigate(ScreenNames.SignIn); return; }
    run();
  }, [isAuthed, navigation]);

  const postCreator = useMemo(() => ({ address: authorAddress }), [authorAddress]);

  // ── Row actions ───────────────────────────────────────────────────────────

  const handleReply = useCallback((comment: Comment) => requireAuth(() => {
    setReplyTo(comment);
    setEditing(null);
    const name = comment.user?.username;
    if (name) setText((current) => (current.length ? current : `@${name} `));
    inputRef.current?.focus();
  }), [requireAuth, setText]);

  const handleReact = useCallback(async (commentId: number, reaction: PostReaction) => {
    if (!isAuthed) { navigation.navigate(ScreenNames.SignIn); throw new Error("signed out"); }
    const row = rows?.get(commentId);
    if (!row) return;
    const current = [...(data?.threads ?? [])]
      .flatMap((thread) => [thread.comment, ...thread.replies])
      .find((comment) => comment.id === commentId)?.myReaction ?? null;
    await react(row, reaction, current);
  }, [isAuthed, navigation, rows, data, react]);

  const handleStartEdit = useCallback((comment: Comment) => {
    setEditing(comment);
    setReplyTo(null);
    setMedia(null);
    setText(comment.content || "");
    inputRef.current?.focus();
  }, [setText]);

  const handleDelete = useCallback((comment: Comment) => {
    const row = rowFor(comment);
    if (!row) return;
    Alert.alert(t("features.deleteCommentTitle"), t("features.deleteCommentDescription"), [
      { text: t("common.cancel", "Cancel"), style: "cancel" },
      { text: t("common.delete", "Delete"), style: "destructive", onPress: () => remove.mutate(row) },
    ]);
  }, [rowFor, remove, t]);

  const handleUserPress = useCallback((userId: string) => showUserProfile?.(userId), [showUserProfile]);

  const cancelReplyOrEdit = useCallback(() => {
    if (editing) { setText.clear(); setText(""); }
    setEditing(null);
    setReplyTo(null);
  }, [editing, setText]);

  // ── Composer ──────────────────────────────────────────────────────────────

  const { openAttachPicker, attachSheet } = useCommentAttachPicker(
    useCallback((picked: MediaAttachment) => setMedia(picked), []),
  );
  const recorder = useVoiceRecorder({
    onRecordingComplete: useCallback((result: VoiceNoteResult) => {
      setMedia({ type: "audio", uri: result.uri, durationMs: result.durationMs });
    }, []),
    onCancel: useCallback(() => {}, []),
  });

  const send = useCallback(() => requireAuth(() => {
    const content = text.trim();
    if (submit.isPending || edit.isPending) return;
    if (editing) {
      const row = rowFor(editing);
      if (!row || !content) return;
      edit.mutate({ row, content }, {
        onSuccess: () => { setEditing(null); setText.complete(text, ""); Keyboard.dismiss(); },
      });
      return;
    }
    if (!content && !media) return;
    const parent = replyTo ? rowFor(replyTo) : null;
    submit.mutate({ content, parent, media }, {
      onSuccess: () => {
        if (replyTo) {
          const root = replyTo.parentId ?? replyTo.id;
          setExpanded((prev) => new Set(prev).add(Number(root)));
        }
        setText.complete(text, "");
        mentions.reset();
        setReplyTo(null);
        setMedia(null);
      },
    });
  }), [requireAuth, text, submit, edit, editing, rowFor, setText, media, replyTo, mentions]);

  const busy = submit.isPending || edit.isPending;
  const canSend = !busy && (!!text.trim() || (!!media && !editing));

  // ── Render ────────────────────────────────────────────────────────────────

  const renderRow = (comment: Comment, opts: { isReply?: boolean; lineAbove?: boolean; lineBelow?: boolean; toggleRoot?: number; hidden?: number }) => (
    <View key={comment.id} style={styles.rowWrap}>
      {opts.lineAbove && <View style={styles.lineAbove} pointerEvents="none" />}
      {opts.lineBelow && <View style={styles.lineBelow} pointerEvents="none" />}
      <CommentItem
        comment={comment}
        isReply={opts.isReply}
        postCreator={postCreator}
        onReply={handleReply}
        onReact={handleReact}
        onShowLikers={setLikersFor}
        onUserPress={handleUserPress}
        onEdit={handleStartEdit}
        onDelete={handleDelete}
        onLongPress={(target, layout, extra) => setContext({ comment: target, layout, extra })}
        tokenId={`request:${featureId}`}
        contentType="feed"
        highlighted={highlightNumber === comment.id}
        repliesExpanded={opts.toggleRoot != null && expanded.has(opts.toggleRoot)}
        onToggleReplies={opts.toggleRoot != null ? () => {
          const root = opts.toggleRoot!;
          setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(root)) next.delete(root); else next.add(root);
            return next;
          });
        } : undefined}
        hiddenReplyCount={opts.hidden ?? 0}
      />
    </View>
  );

  const threads = data?.threads ?? [];

  return (
    <View style={styles.wrap}>
      {isError && <CommentLoadError isFetching={isFetching} onRetry={() => { void refetch(); }} />}
      {isLoading ? (
        <ActivityIndicator color="#808089" style={{ paddingVertical: 12 }} />
      ) : threads.length === 0 ? (
        !isError && <Text style={styles.empty}>{t("features.noComments")}</Text>
      ) : (
        threads.map((thread) => {
          const rootId = thread.comment.id;
          const open = expanded.has(rootId) || (highlightNumber != null && thread.replies.some((r) => r.id === highlightNumber));
          const shown = open ? thread.replies : thread.replies.slice(0, VISIBLE_REPLIES);
          const hidden = thread.replies.length - shown.length;
          return (
            <View key={rootId}>
              {renderRow(thread.comment, {
                lineBelow: shown.length > 0,
                toggleRoot: thread.replies.length > VISIBLE_REPLIES ? rootId : undefined,
                hidden,
              })}
              {shown.map((reply, i) =>
                renderRow(reply, { isReply: true, lineAbove: true, lineBelow: i < shown.length - 1 }),
              )}
            </View>
          );
        })
      )}

      {(replyTo || editing) && (
        <View style={styles.banner}>
          <Text style={styles.bannerText} numberOfLines={1}>
            {editing
              ? t("comments.editing", { defaultValue: "Editing comment" })
              : t("features.replyingTo", { name: `@${replyTo?.user?.username || replyTo?.address?.slice(0, 8)}` })}
          </Text>
          <Pressable onPress={cancelReplyOrEdit} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("common.cancel")}>
            <Icon name="X" size={14} color="#808089" />
          </Pressable>
        </View>
      )}

      <MentionSuggestions
        visible={mentions.showSuggestions}
        suggestions={mentions.suggestions}
        onSelect={mentions.selectMention}
        loading={mentions.loading}
      />

      {!isAuthed ? (
        <Pressable onPress={() => navigation.navigate(ScreenNames.SignIn)} style={styles.signIn}>
          <Text style={styles.signInText}>{t("features.signInToComment")}</Text>
        </Pressable>
      ) : recorder.isRecording ? (
        <VoiceNoteRecordingOverlay recorder={recorder} />
      ) : media ? (
        <CommentMediaPreview media={media} onRemove={() => setMedia(null)} onSend={send} sending={submit.isPending} />
      ) : (
        <View style={styles.composer}>
          {!editing && (
            <>
              <Pressable
                onPress={() => requireAuth(openAttachPicker)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t("comments.attachMedia", { defaultValue: "Attach a photo, video or audio" })}
                style={composerStyles.iconControl}
              >
                <Icon name="Paperclip" size={20} color="#8B8D90" />
              </Pressable>
              <Pressable
                onPress={() => requireAuth(() => { Keyboard.dismiss(); setGifOpen(true); })}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t("comments.addGif")}
                style={composerStyles.iconControl}
              >
                <Text style={styles.gifGlyph}>GIF</Text>
              </Pressable>
            </>
          )}
          <View style={styles.inputBox}>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={mentions.handleChangeText}
              onSelectionChange={mentions.handleSelectionChange}
              onContentSizeChange={growing.onContentSizeChange}
              scrollEnabled={growing.scrollEnabled}
              placeholder={editing ? t("comments.editPlaceholder") : replyTo ? t("features.writeReply") : t("features.addComment")}
              placeholderTextColor="#6F7174"
              style={[styles.input, { height: growing.height }]}
              maxLength={500}
              multiline
            />
            <Pressable
              onPress={() => { Keyboard.dismiss(); setEmojiOpen(true); }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("comments.addEmoji")}
            >
              <Text style={{ fontSize: 18 }}>🙂</Text>
            </Pressable>
          </View>
          {!text.trim() && !editing ? (
            <Pressable
              onPress={() => requireAuth(() => { Keyboard.dismiss(); void recorder.startRecording(); })}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("comments.recordVoice")}
              style={composerStyles.iconControl}
            >
              <Icon name="Mic" size={20} color="#8B8D90" />
            </Pressable>
          ) : (
            <Pressable
              onPress={send}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel={t("comments.postComment")}
              style={[styles.sendBtn, { backgroundColor: canSend ? "#F9FBFF" : "rgba(255,255,255,0.1)" }]}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#010305" />
              ) : (
                <Icon name={editing ? "Check" : "Send"} size={18} color={canSend ? "#010305" : "#6F7174"} />
              )}
            </Pressable>
          )}
        </View>
      )}

      {attachSheet}
      <GifPicker
        visible={gifOpen}
        onClose={() => setGifOpen(false)}
        onPick={(url) => { setGifOpen(false); setMedia({ type: "gif", url }); }}
      />
      <EmojiSheet
        visible={emojiOpen}
        onClose={() => setEmojiOpen(false)}
        onSelect={(emoji: string) => setText((current) => (current + emoji).slice(0, 500))}
      />
      <CommentContextMenu
        visible={context !== null}
        comment={context?.comment ?? null}
        layout={context?.layout ?? null}
        isReply={context?.extra.isReply}
        isOwnComment={context?.extra.isOwnComment ?? false}
        liked={context?.extra.liked}
        disliked={context?.extra.disliked}
        canDelete={context?.extra.isOwnComment}
        onClose={() => setContext(null)}
        onReply={() => { if (context) handleReply(context.comment); setContext(null); }}
        onEdit={context?.extra.isOwnComment ? () => { if (context) handleStartEdit(context.comment); setContext(null); } : undefined}
        onDelete={context?.extra.isOwnComment ? () => { if (context) handleDelete(context.comment); setContext(null); } : undefined}
        onLike={() => {
          if (context) void handleReact(Number(context.comment.id), "like").catch(() => {});
          setContext(null);
        }}
        onDislike={() => {
          if (context) void handleReact(Number(context.comment.id), "dislike").catch(() => {});
          setContext(null);
        }}
        onShowLikers={context ? () => { setLikersFor(Number(context.comment.id)); setContext(null); } : undefined}
        tokenId={`request:${featureId}`}
        translate={context?.extra.translate}
      />
      <CommentLikersSheet
        visible={likersFor != null}
        onClose={() => setLikersFor(null)}
        commentId={likersFor}
        loadPage={rows ? featureLikersLoader(rows) : undefined}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.06)", paddingTop: 4 },
  empty: { color: "#808089", fontSize: 12, textAlign: "center", paddingVertical: 8 },
  rowWrap: { position: "relative" },
  lineAbove: { position: "absolute", left: 16, top: 0, height: 26, width: 1, backgroundColor: "rgba(255,255,255,0.2)" },
  lineBelow: { position: "absolute", left: 16, top: 26, bottom: 0, width: 1, backgroundColor: "rgba(255,255,255,0.2)" },
  banner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6, gap: 8 },
  bannerText: { color: "#A1A1AA", fontSize: 12, flex: 1 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: COMPOSER.gap / 2, paddingTop: 6 },
  inputBox: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: COMPOSER.radius,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: COMPOSER.control,
  },
  input: { flex: 1, color: "#F9FBFF", fontSize: 14, maxHeight: 140, paddingVertical: 0, textAlignVertical: "center" },
  gifGlyph: { color: "#8B8D90", fontSize: 12, fontWeight: "700" },
  sendBtn: { width: COMPOSER.control, height: COMPOSER.control, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  signIn: { marginTop: 6, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)" },
  signInText: { color: "#A1A1AA", fontSize: 12 },
});

export default RequestComments;
