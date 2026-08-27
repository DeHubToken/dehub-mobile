import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator, Keyboard, Platform, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRoute, useNavigation } from "@react-navigation/native";
import ScreenHeader from "../components/ScreenHeader";
import { getNFT, type Comment, likeComment, type LikeCommentResult, dislikeComment, type DislikeCommentResult, postComment, editComment, deleteComment, postImageComment, postGifComment, postAudioComment, recordCommentViews } from "../services/nft.service";
import CommentLikersSheet from "../components/Comments/CommentLikersSheet";
import FeedCard from "../components/Home/FeedCard";
import { CommentItem } from "../components/Comments";
import CommentContextMenu from "../components/Comments/CommentContextMenu";
import type { CommentLayout } from "../components/Comments/CommentContextMenu";
import CommentMediaPreview from "../components/Comments/CommentMediaPreview";
import { COMPOSER, composerStyles } from "../components/Comments/composerLayout";
import type { MediaAttachment } from "../components/Comments/CommentMediaPreview";
import { useVoiceRecorder, VoiceNoteRecordingOverlay } from "../components/Comments/VoiceNoteRecorder";
import type { VoiceNoteResult } from "../components/Comments/VoiceNoteRecorder";
import GifPicker from "../components/DM/GifPicker";
import EmojiSheet from "../components/Upload/EmojiSheet";
import GlassTipSheet from "../components/Tip/GlassTipSheet";
import Avatar from "../components/common/Avatar";
import MentionSuggestions from "../components/common/MentionSuggestions";
import CommentsSkeleton from "../components/Feed/CommentsSkeleton";
import { useUser, useAuthActions } from "../context/AuthContext";
import { useKeyboardLift } from "../hooks/useKeyboardLayout";
import { useMentions } from "../hooks/useMentions";
import { useCommentTipTotals } from "../hooks/useCommentTipTotals";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import type { UnifiedFeedItem } from "../services/feed.unified.service";
import { getAvatarUrl, toastError } from "../libs";
import { openCroppedImagePicker, getFileName, guessMime } from "../libs/assets.util";
import { theme } from "../theme";
import { formatCompactNumber } from "../libs/numbers.util";
import { ScreenNames } from "../navigation/ScreenNames";

/** A comment plus how deep it sits in the thread (0 = top-level, 1 = direct reply, …). */
type ThreadedComment = Comment & { depth: number };

// Threading is unbounded — the server accepts a reply to a reply at any depth.
// Nesting is NOT drawn as indentation: every reply sits flush with its parent
// and the thread line through the avatars carries the relationship, so a deep
// chain costs no width.
/** How many replies a thread shows before it needs a tap to open up. */
const REPLIES_SHOWN_COLLAPSED = 1;

// Rows are px-8, the avatar is 32 wide and CommentItem pads it 10 from the top,
// so the line runs at x = 32 + 16 and the avatar's centre sits at y = 26.
const threadLineStyles = StyleSheet.create({
  above: { position: "absolute", left: 48, top: 0, height: 26, width: 1, backgroundColor: "rgba(255,255,255,0.2)" },
  below: { position: "absolute", left: 48, top: 26, bottom: 0, width: 1, backgroundColor: "rgba(255,255,255,0.2)" },
});

export default function FeedDetailScreen() {
  const { t } = useTranslation();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  
  // Get params - tokenId and optional commentId for highlighting
  const tokenId: number | string | undefined =
    route?.params?.tokenId ??
    route?.params?.id ??
    route?.params?.postId ??
    route?.params?.videoId ??
    route?.params?.nft?.tokenId ??
    route?.params?.nft?.id;
  const commentIdParam: number | string | undefined = route?.params?.commentId ?? route?.params?.c;
  
  const user = useUser();
  const { requireAuth } = useAuthActions();
  const address = useMemo(() => user?.walletAddress || user?.address || undefined, [user?.walletAddress, user?.address]);

  const [loading, setLoading] = useState(true);
  const [privateError, setPrivateError] = useState(false);
  const [item, setItem] = useState<UnifiedFeedItem | null>(null);
  const [comments, setComments] = useState<ThreadedComment[]>([]);
  const [replyTo, setReplyTo] = useState<ThreadedComment | null>(null);
  const [editingComment, setEditingComment] = useState<Comment | null>(null);
  const [inputText, setInputText] = useState("");
  const mentions = useMentions(inputText, setInputText);
  const [posting, setPosting] = useState(false);
  const [highlightedCommentId, setHighlightedCommentId] = useState<number | null>(null);
  /** Root comment ids whose full reply thread the reader has opened. */
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(() => new Set());

  // Media attachment state
  const [mediaAttachment, setMediaAttachment] = useState<MediaAttachment | null>(null);
  const [mediaPosting, setMediaPosting] = useState(false);
  const [gifPickerVisible, setGifPickerVisible] = useState(false);
  const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);

  // Context menu state
  const [contextComment, setContextComment] = useState<Comment | null>(null);
  const [contextLayout, setContextLayout] = useState<CommentLayout | null>(null);
  const [contextMeta, setContextMeta] = useState<{ liked: boolean; disliked?: boolean; isOwnComment: boolean; isReply: boolean } | null>(null);

  // Tip-a-comment state + per-comment totals from tip_records
  const [tipComment, setTipComment] = useState<Comment | null>(null);
  // Author-only who-liked list, opened from an own comment's like button.
  const [likersCommentId, setLikersCommentId] = useState<number | null>(null);
  const { totals: tipTotals, bump: bumpTipTotal } = useCommentTipTotals(
    comments.map((c) => c.id),
  );

  const inputRef = useRef<TextInput>(null);
  // Keyboard height minus the bottom inset the root SafeAreaView already spent
  // — see hooks/useKeyboardLayout.ts.
  const { lift: kbLift } = useKeyboardLift();
  const { showUserProfile } = useUserProfileSheet();

  // User avatar for comment input
  const userAvatarUrl = useMemo(() => 
    user?.avatarImageUrl || user?.avatarUrl || "",
    [user?.avatarImageUrl, user?.avatarUrl]
  );

  // User avatar for input
  const userAvatar = getAvatarUrl(userAvatarUrl);

  // Focus the comment input
  const focusCommentInput = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Voice recording callbacks
  const handleVoiceRecordingComplete = useCallback((result: VoiceNoteResult) => {
    setMediaAttachment({ type: "audio", uri: result.uri, durationMs: result.durationMs });
    setInputText("");
  }, []);

  const handleVoiceRecordingCancel = useCallback(() => {}, []);

  const recorder = useVoiceRecorder({
    onRecordingComplete: handleVoiceRecordingComplete,
    onCancel: handleVoiceRecordingCancel,
  });


  const handlePickImage = useCallback(async () => {
    if (!requireAuth) return;
    requireAuth(async () => {
      try {
        const uri = await openCroppedImagePicker({
          width: 800,
          height: 600,
          forceJpg: true,
          quality: 0.85,
        });
        if (uri) {
          setMediaAttachment({ type: "image", uri });
          setInputText("");
          Keyboard.dismiss();
        }
      } catch (e: any) {
        if (e?.code !== "E_PICKER_CANCELLED") {
          console.error("[FeedDetailScreen] image picker error", e);
          toastError("Failed to pick image");
        }
      }
    });
  }, [requireAuth]);

  const handleOpenGifPicker = useCallback(() => {
    if (!requireAuth) return;
    requireAuth(() => {
      setGifPickerVisible(true);
    });
  }, [requireAuth]);

  const handleGifPicked = useCallback((url: string) => {
    setGifPickerVisible(false);
    setMediaAttachment({ type: "gif", url });
    setInputText("");
    Keyboard.dismiss();
  }, []);

  const handleCloseGifPicker = useCallback(() => {
    setGifPickerVisible(false);
  }, []);

  const handleOpenEmojiPicker = useCallback(() => {
    setEmojiPickerVisible(true);
  }, []);

  // Emoji selected from picker — appended, not a replacement, so it plays
  // nicely alongside whatever the user has already typed.
  const handleEmojiSelected = useCallback((emoji: string) => {
    setInputText((prev) => prev + emoji);
  }, []);

  const handleCloseEmojiPicker = useCallback(() => {
    setEmojiPickerVisible(false);
  }, []);

  const handleRemoveMedia = useCallback(() => {
    setMediaAttachment(null);
  }, []);

  const inputLift = kbLift;

  const listBottomPadding = useMemo(() => {
    const base = 88;
    return base + inputLift;
  }, [inputLift]);

  // Fetch feed details and comments
  const fetchData = useCallback(async () => {
    if (tokenId == null) return;
    setLoading(true);
    try {
      const res = await getNFT(
        tokenId, 
        commentIdParam ? { commentId: commentIdParam } : undefined
      );
      const payload = res?.result || res || {};
      
      // console.log("[FeedDetailScreen] fetched data", payload.comments);
      setPrivateError(false);
      
      // Set the feed item
      setItem(payload as UnifiedFeedItem);
      
      // Extract comments — backend now populates a nested `user` object
      // matching the Comment interface (user.username, user.displayName, etc.)
      const rawCommentsRaw: Comment[] = Array.isArray((payload as any)?.comments) ? (payload as any).comments : [];
      
      // Deduplicate by id — the API may return the highlighted comment twice:
      // once unpopulated (user is a plain ObjectId string) at position 0, then
      // again populated in its normal position. Keep the richer version.
      const seenRaw = new Map<string, Comment>();
      for (const c of rawCommentsRaw) {
        const key = String(c?.id);
        const existing = seenRaw.get(key);
        if (!existing) {
          seenRaw.set(key, c);
        } else {
          // Prefer the version where user is a populated object
          const existingUserIsObject = existing.user && typeof existing.user === 'object' && !Array.isArray(existing.user);
          const newUserIsObject = c.user && typeof c.user === 'object' && !Array.isArray(c.user);
          if (!existingUserIsObject && newUserIsObject) {
            seenRaw.set(key, c);
          }
        }
      }
      const rawComments = Array.from(seenRaw.values());
      
      // Flatten into one depth-tagged list. Nesting is unbounded: a reply can
      // carry its own replies, so descendants are emitted recursively instead of
      // as a single tier under each root.
      const byId = new Map<number, Comment>();
      rawComments.forEach((c) => byId.set(Number(c?.id), c));

      // replyIds carries the server's sibling ordering, so read it first;
      // parentId then catches any reply whose parent didn't list it.
      const childrenOf = new Map<number, number[]>();
      const parentOf = new Map<number, number>();
      const link = (childId: number, parentId: number) => {
        if (childId === parentId || parentOf.has(childId) || !byId.has(parentId)) return;
        parentOf.set(childId, parentId);
        const kids = childrenOf.get(parentId);
        if (kids) kids.push(childId);
        else childrenOf.set(parentId, [childId]);
      };
      rawComments.forEach((c) => {
        if (!Array.isArray(c?.replyIds)) return;
        c.replyIds.forEach((rid) => {
          if (byId.has(Number(rid))) link(Number(rid), Number(c.id));
        });
      });
      rawComments.forEach((c) => {
        if (c?.parentId != null) link(Number(c.id), Number(c.parentId));
      });

      const highlightId = commentIdParam ? Number(commentIdParam) : undefined;

      const emitted = new Set<number>();
      const flat: ThreadedComment[] = [];
      const emit = (c: Comment, depth: number) => {
        const cId = Number(c?.id);
        if (emitted.has(cId)) return;
        emitted.add(cId);
        flat.push({ ...c, depth, parentId: parentOf.get(cId) ?? c?.parentId });
        const kids = childrenOf.get(cId);
        if (!kids) return;
        // Lead with the highlighted branch so a notification tap lands on it.
        const ordered =
          highlightId != null && kids.includes(highlightId)
            ? [highlightId, ...kids.filter((k) => k !== highlightId)]
            : kids;
        ordered.forEach((kid) => {
          const child = byId.get(kid);
          if (child) emit(child, depth + 1);
        });
      };

      // If the highlighted comment is nested, walk up to its root and emit that
      // whole thread first, however deep the target sits.
      if (highlightId != null && parentOf.has(highlightId)) {
        let rootId = highlightId;
        const walked = new Set<number>([rootId]);
        while (parentOf.has(rootId)) {
          const next = parentOf.get(rootId)!;
          if (walked.has(next)) break; // malformed cycle
          walked.add(next);
          rootId = next;
        }
        const root = byId.get(rootId);
        if (root) emit(root, 0);
      }

      // Then every remaining root, in the order the API returned them. A reply
      // whose parent fell outside this page counts as a root rather than being
      // dropped — otherwise it would disappear from the thread entirely.
      rawComments.forEach((c) => {
        if (!parentOf.has(Number(c?.id))) emit(c, 0);
      });

      // Safety net: bad data forming a parent cycle would leave no member
      // looking like a root and drop the whole ring. Surface anything the walk
      // never reached as top-level rather than losing it.
      rawComments.forEach((c) => emit(c, 0));

      setComments(flat);
      
      // Highlight the target comment (top-level or reply)
      if (highlightId != null && flat.some((c) => Number(c.id) === highlightId)) {
        setHighlightedCommentId(highlightId);
        setTimeout(() => setHighlightedCommentId(null), 4000);
      }
    } catch (e: any) {
      console.error("[FeedDetailScreen] fetchData error", e);
      const msg = e?.message || e?.toString() || '';
      if (msg.toLowerCase().includes('private account')) {
        setPrivateError(true);
      }
      setItem(null);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [tokenId, commentIdParam]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUserPress = useCallback(
    (identifier: string) => {
      showUserProfile(identifier, { initialHeightPct: 0.4, source: "comment" });
    },
    [showUserProfile]
  );

  const handleReplyPress = useCallback((cm: Comment) => {
    // Any comment is a valid target, replies included — depth rides along so the
    // optimistic row lands at the right tier.
    setReplyTo(cm as ThreadedComment);
    setEditingComment(null);
    setInputText("");
    // Open the thread you are replying into, so your own reply lands somewhere
    // visible and you can read what you are answering. The root of any reply is
    // the nearest depth-0 row above it.
    const idx = comments.findIndex((c) => String(c.id) === String(cm.id));
    for (let i = idx; i >= 0; i--) {
      if (comments[i].depth === 0) {
        const rootId = String(comments[i].id);
        setExpandedThreads((prev) => new Set(prev).add(rootId));
        break;
      }
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [comments]);

  /**
   * Place a freshly posted comment in the flat list. A reply goes directly under
   * its parent but *after* that parent's existing descendants, which is where the
   * server will put it once the thread refetches.
   */
  const insertThreaded = useCallback(
    (
      prev: ThreadedComment[],
      optimistic: Comment,
      parent: ThreadedComment | null,
    ): ThreadedComment[] => {
      if (!parent) return [{ ...optimistic, depth: 0 }, ...prev];
      const parentIdx = prev.findIndex((c) => c.id === parent.id);
      if (parentIdx === -1) return [...prev, { ...optimistic, depth: (parent.depth ?? 0) + 1 }];
      const parentDepth = prev[parentIdx].depth;
      let insertIdx = parentIdx + 1;
      while (insertIdx < prev.length && prev[insertIdx].depth > parentDepth) insertIdx++;
      const next = [...prev];
      next.splice(insertIdx, 0, { ...optimistic, depth: parentDepth + 1 });
      return next;
    },
    [],
  );

  const handleLikeComment = useCallback(async (commentId: number): Promise<LikeCommentResult | void> => {
    if (!address) return;
    try {
      const result = await likeComment({ commentId });
      return result;
    } catch (e) {
      console.error("[FeedDetailScreen] likeComment error", e);
    }
  }, [address]);

  const handleDislikeComment = useCallback(async (commentId: number): Promise<DislikeCommentResult | void> => {
    if (!address) return;
    try {
      const result = await dislikeComment({ commentId });
      return result;
    } catch (e) {
      console.error("[FeedDetailScreen] dislikeComment error", e);
    }
  }, [address]);

  const handleCommentLongPress = useCallback(
    (comment: Comment, layout: CommentLayout, extra: { liked: boolean; disliked?: boolean; isOwnComment: boolean; isReply: boolean }) => {
      setContextComment(comment);
      setContextLayout(layout);
      setContextMeta(extra);
    },
    []
  );

  const closeContextMenu = useCallback(() => {
    setContextComment(null);
    setContextLayout(null);
    setContextMeta(null);
  }, []);

  const handleContextReply = useCallback(() => {
    if (contextComment) handleReplyPress(contextComment);
  }, [contextComment, handleReplyPress]);

  const handleContextEdit = useCallback(() => {
    if (!contextComment) return;
    setEditingComment(contextComment);
    setReplyTo(null);
    setInputText(contextComment.content || "");
    inputRef.current?.focus();
  }, [contextComment]);

  const handleContextLike = useCallback(async () => {
    if (!contextComment || !address) return;
    try {
      const result = await likeComment({ commentId: contextComment.id });
      if (result && typeof result.liked === 'boolean') {
        setComments((prev) =>
          prev.map((c) =>
            c.id === contextComment.id
              ? { ...c, isLiked: result.liked, likeCount: result.likes }
              : c
          )
        );
      }
    } catch (e) {
      console.error('[FeedDetailScreen] contextLike error', e);
    }
  }, [contextComment, address]);

  const handleContextDislike = useCallback(async () => {
    if (!contextComment || !address) return;
    try {
      const result = await dislikeComment({ commentId: contextComment.id });
      if (result && typeof result.disliked === 'boolean') {
        setComments((prev) =>
          prev.map((c) =>
            c.id === contextComment.id
              ? { ...c, isDisliked: result.disliked, dislikeCount: result.dislikes }
              : c
          )
        );
      }
    } catch (e) {
      console.error('[FeedDetailScreen] contextDislike error', e);
    }
  }, [contextComment, address]);

  const handleContextDelete = useCallback(async () => {
    if (!contextComment) return;
    const commentId = contextComment.id;
    // Optimistic removal. The server deletes a comment's whole subtree, so drop
    // every following row that sits deeper than this one — its descendants,
    // at any depth.
    setComments((prev) => {
      const idx = prev.findIndex((c) => c.id === commentId);
      if (idx === -1) return prev;
      const depth = prev[idx].depth;
      let endIdx = idx + 1;
      while (endIdx < prev.length && prev[endIdx].depth > depth) endIdx++;
      const next = [...prev];
      next.splice(idx, endIdx - idx);
      return next;
    });
    // Decrement comment count
    setItem((prev) => prev ? { ...prev, commentCount: Math.max(0, (prev.commentCount ?? 0) - 1) } : prev);
    try {
      await deleteComment({ commentId });
    } catch (e) {
      console.error('[FeedDetailScreen] deleteComment error', e);
      toastError('Failed to delete comment');
      // Revert by reloading
      await fetchData();
    }
  }, [contextComment, fetchData]);

  // Comment views. This screen is the second of the two live mobile comment
  // surfaces and the one that never sent them — CommentSection has had the
  // same batch since the endpoint shipped, so a comment read here counted for
  // nothing while the identical comment read in the video sheet counted.
  //
  // Batched behind a 2s debounce and deduped for the life of the screen: the
  // server increments blindly, so without the sent Set a comment would take a
  // fresh view every time it scrolled back into frame.
  const viewBatchRef = useRef<Set<number>>(new Set());
  const viewSentRef = useRef<Set<number>>(new Set());
  const viewFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushCommentViews = useCallback(() => {
    if (!viewBatchRef.current.size) return;
    const ids = Array.from(viewBatchRef.current);
    viewBatchRef.current.clear();
    recordCommentViews(ids).catch(() => {});
  }, []);

  // Reached through a ref because the viewability callback below is frozen at
  // its first render and would otherwise call that render's flush forever.
  const flushCommentViewsRef = useRef(flushCommentViews);
  flushCommentViewsRef.current = flushCommentViews;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50, minimumViewTime: 500 }).current;

  // Frozen deliberately: FlatList treats a changed onViewableItemsChanged
  // identity as an error rather than as an update.
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    for (const v of viewableItems) {
      const id = Number((v.item as ThreadedComment)?.id);
      if (!Number.isFinite(id) || viewSentRef.current.has(id)) continue;
      viewSentRef.current.add(id);
      viewBatchRef.current.add(id);
    }
    if (!viewBatchRef.current.size) return;
    if (viewFlushTimer.current) clearTimeout(viewFlushTimer.current);
    viewFlushTimer.current = setTimeout(() => flushCommentViewsRef.current(), 2000);
  }).current;

  // Send whatever is still pending when the screen goes away, so the last
  // comments read before a back-press are not lost with the timer.
  useEffect(() => () => {
    if (viewFlushTimer.current) clearTimeout(viewFlushTimer.current);
    flushCommentViewsRef.current();
  }, []);

  /**
   * The rows the list actually shows, plus what each one draws.
   *
   * A thread opens with one reply and hides the rest behind a control on the
   * last reply shown, so a long back-and-forth cannot bury the next comment.
   * The list is already in reading order with roots at depth 0, so the root of
   * any reply is simply the last depth-0 row above it.
   */
  const { visibleComments, threadMeta } = useMemo(() => {
    const rootOf = new Map<string, string>();
    const totalPerRoot = new Map<string, number>();
    let currentRoot = "";

    comments.forEach((c) => {
      const id = String(c.id);
      if (c.depth === 0) {
        currentRoot = id;
        rootOf.set(id, id);
        return;
      }
      rootOf.set(id, currentRoot);
      totalPerRoot.set(currentRoot, (totalPerRoot.get(currentRoot) ?? 0) + 1);
    });

    const shownPerRoot = new Map<string, number>();
    const visible = comments.filter((c) => {
      if (c.depth === 0) return true;
      const root = rootOf.get(String(c.id)) ?? "";
      if (expandedThreads.has(root)) return true;
      // Arriving from a notification means the reply itself is the destination.
      if (highlightedCommentId != null && String(c.id) === String(highlightedCommentId)) return true;
      const shown = shownPerRoot.get(root) ?? 0;
      if (shown >= REPLIES_SHOWN_COLLAPSED) return false;
      shownPerRoot.set(root, shown + 1);
      return true;
    });

    type Meta = {
      lineAbove: boolean;
      lineBelow: boolean;
      toggleRootId?: string;
      toggleExpanded: boolean;
      hiddenCount: number;
    };
    const meta = new Map<string, Meta>();

    visible.forEach((c, i) => {
      const id = String(c.id);
      const root = rootOf.get(id) ?? id;
      const next = visible[i + 1];
      const nextIsSameThread = !!next && next.depth > 0 && (rootOf.get(String(next.id)) ?? "") === root;
      const total = totalPerRoot.get(root) ?? 0;
      const isExpanded = expandedThreads.has(root);
      const hidden = isExpanded ? 0 : Math.max(0, total - REPLIES_SHOWN_COLLAPSED);
      // The toggle belongs at the end of what is on screen, so it reads as the
      // continuation of the thread rather than as a note on its first line.
      const ownsToggle = !nextIsSameThread && total > 0 && (hidden > 0 || isExpanded);

      meta.set(id, {
        lineAbove: c.depth > 0,
        // A row that owns the toggle renders it in its own body, so the line
        // stops there rather than running past the row's bottom edge.
        lineBelow: nextIsSameThread || (c.depth === 0 && total > 0),
        toggleRootId: ownsToggle ? root : undefined,
        toggleExpanded: isExpanded,
        hiddenCount: hidden,
      });
    });

    return { visibleComments: visible, threadMeta: meta };
  }, [comments, expandedThreads, highlightedCommentId]);

  const handleToggleThread = useCallback((rootId: string) => {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  }, []);

  const renderCommentItem = useCallback(
    ({ item: c }: { item: ThreadedComment }) => {
      const isReply = c.depth > 0;
      const isHighlighted = highlightedCommentId != null && String(c.id) === String(highlightedCommentId);
      const meta = threadMeta.get(String(c.id));

      return (
        <View className="px-8" style={{ position: "relative" }}>
          {/* Thread line — see the note by threadLineStyles. Each segment runs
              to its own row's edge so neighbouring rows join into one line;
              kept inside those bounds because Android clips a child that hangs
              outside its parent. */}
          {meta?.lineAbove && <View style={threadLineStyles.above} pointerEvents="none" />}
          {meta?.lineBelow && <View style={threadLineStyles.below} pointerEvents="none" />}
          <CommentItem
            repliesExpanded={!!meta?.toggleExpanded}
            onToggleReplies={
              meta?.toggleRootId != null ? () => handleToggleThread(meta.toggleRootId!) : undefined
            }
            hiddenReplyCount={meta?.hiddenCount ?? 0}
            comment={c}
            isReply={isReply}
            onUserPress={handleUserPress}
            onReply={handleReplyPress}
            onTip={setTipComment}
            tipTotal={tipTotals[Number(c.id)]}
            onLike={handleLikeComment}
            onDislike={handleDislikeComment}
            onShowLikers={setLikersCommentId}
            onLongPress={handleCommentLongPress}
            tokenId={tokenId}
            contentType="feed"
            postCreator={{
              address: item?.minter || (item as any)?.minterUser?.address,
              displayName: (item as any)?.minterUser?.displayName || (item as any)?.minterDisplayName,
              username: (item as any)?.minterUser?.username || (item as any)?.minterUsername,
            }}
            highlighted={isHighlighted}
          />
        </View>
      );
    },
    [handleReplyPress, handleUserPress, tipTotals, handleLikeComment, handleDislikeComment, handleCommentLongPress, tokenId, highlightedCommentId, threadMeta, handleToggleThread]
  );

  // Send media comment
  const handleSendMedia = useCallback(async () => {
    if (!mediaAttachment || mediaPosting || tokenId == null) return;
    if (!requireAuth) return;

    await requireAuth(async () => {
      setMediaPosting(true);
      const now = new Date().toISOString();
      const tempId = -Date.now();
      const replyToId = replyTo?.id;
      const tId = tokenId!;

      const optimistic: Comment = {
        id: tempId,
        content: "",
        createdAt: now,
        user: {
          username: user?.username || "you",
          displayName: user?.displayName || user?.username || "You",
          avatarImageUrl: user?.avatarImageUrl || user?.avatarUrl || "",
          address: user?.address || user?.walletAddress || "",
        },
        likeCount: 0,
        isLiked: false,
        parentId: replyTo?.id,
        imageUrl: mediaAttachment.type === "image" ? mediaAttachment.uri : undefined,
        gifUrl: mediaAttachment.type === "gif" ? mediaAttachment.url : undefined,
        audioUrl: mediaAttachment.type === "audio" ? mediaAttachment.uri : undefined,
        audioDuration: mediaAttachment.type === "audio" ? Math.round(mediaAttachment.durationMs / 1000) : undefined,
      };

      // Optimistic insert
      const replyTarget = replyTo;
      setComments((prev) => insertThreaded(prev, optimistic, replyTarget));

      const savedMedia = mediaAttachment;
      setMediaAttachment(null);
      setReplyTo(null);

      try {
        let newId: number | undefined;
        if (savedMedia.type === "image") {
          const fileName = getFileName(savedMedia.uri, "comment_image.jpg");
          const mimeType = guessMime(savedMedia.uri, "image/jpeg");
          const res = await postImageComment({ streamTokenId: tId, fileUri: savedMedia.uri, fileName, mimeType, commentId: replyToId });
          newId = res?.commentId;
        } else if (savedMedia.type === "gif") {
          const res = await postGifComment({ streamTokenId: tId, gifUrl: savedMedia.url, commentId: replyToId });
          newId = res?.commentId;
        } else if (savedMedia.type === "audio") {
          const fileName = getFileName(savedMedia.uri, "voice_note.m4a");
          const mimeType = Platform.OS === "ios" ? "audio/m4a" : "audio/mp4";
          const res = await postAudioComment({ streamTokenId: tId, fileUri: savedMedia.uri, fileName, mimeType, commentId: replyToId });
          newId = res?.commentId;
        }
        if (newId != null) {
          setComments((prev) => prev.map((c) => (c.id === tempId ? { ...c, id: newId! } : c)));
        }
      } catch (e) {
        console.error("[FeedDetailScreen] media post error", e);
        setComments((prev) => prev.filter((c) => c.id !== tempId));
        toastError("Failed to send media comment");
      } finally {
        setMediaPosting(false);
      }
    });
  }, [mediaAttachment, mediaPosting, requireAuth, tokenId, replyTo, user, insertThreaded]);

  // Cancel reply or edit
  const cancelReplyOrEdit = useCallback(() => {
    setReplyTo(null);
    setEditingComment(null);
    setInputText("");
    mentions.reset();
  }, [mentions]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || posting || tokenId == null) return;
    requireAuth?.(async () => {
      setPosting(true);
      try {
        // Handle edit mode
        if (editingComment) {
          const commentId = editingComment.id;
          setComments((prev) =>
            prev.map((c) => (c.id === commentId ? { ...c, content: text } : c))
          );
          setEditingComment(null);
          setInputText("");
          mentions.reset();
          Keyboard.dismiss();
          try {
            await editComment({ commentId, content: text });
          } catch (e) {
            console.error('[FeedDetailScreen] editComment error', e);
            toastError('Failed to edit comment');
            await fetchData();
          }
          return;
        }

        const tempId = Date.now();
        const tempComment: Comment = {
          id: tempId,
          content: text,
          createdAt: new Date().toISOString(),
          likeCount: 0,
          isLiked: false,
          parentId: replyTo?.id,
          user: {
            username: user?.username || "you",
            displayName: user?.displayName || user?.username || "You",
            avatarImageUrl: user?.avatarImageUrl || user?.avatarUrl || "",
            address: user?.address || user?.walletAddress || "",
          },
        };
        
        const replyTarget = replyTo;
        setComments((prev) => insertThreaded(prev, tempComment, replyTarget));

        if (replyTarget) setReplyTo(null);
        setInputText("");
        mentions.reset();
        Keyboard.dismiss();
        
        try {
          const res = await postComment({
            streamTokenId: tokenId,
            content: text,
            commentId: replyTarget?.id,
          });
          const newId = res?.result?.id ?? (res as any)?.id ?? undefined;
          
          if (newId != null) {
            setComments((prev) => prev.map((c) => (c.id === tempId ? { ...c, id: newId } : c)));
            // The server bumps the post's comment count for replies too, so
            // count every post here — deleting already decrements either way.
            setItem((prev) => prev ? {
              ...prev,
              commentCount: Math.max(0, (prev.commentCount ?? 0) + 1)
            } : prev);
          }
        } catch (e) {
          setComments((prev) => prev.filter((c) => c.id !== tempId));
          console.error("[FeedDetailScreen] postComment error", e);
          // The comment vanished from the thread with nothing said at all
          // before this. A refusal from the server explains itself — comments
          // turned off, too long, a link that cannot be posted — so say it.
          toastError(e instanceof Error && e.message ? e.message : "Failed to post comment");
        }
      } finally {
        setPosting(false);
      }
    });
  }, [inputText, posting, requireAuth, tokenId, replyTo, editingComment, user, fetchData, insertThreaded]);

  const renderHeader = useCallback(() => (
    <View>
      <ScreenHeader title={t("screens.post")} />
      {item ? (
        <View className="px-4">
          <FeedCard 
            item={item} 
            fullContent 
            disablePress
            onCommentPress={focusCommentInput}
          />
        </View>
      ) : loading ? (
        <View className="px-4 pt-4">
          {/* Minimal inline skeleton — just header + content placeholder */}
          <View className="flex-row items-center">
            <View className="w-9 h-9 rounded-full bg-theme-neutrals-800" />
            <View className="ml-3 flex-1">
              <View className="w-24 h-3.5 bg-theme-neutrals-800 rounded" />
              <View className="w-16 h-2.5 bg-theme-neutrals-800 rounded mt-1.5" />
            </View>
          </View>
          <View className="mt-3 h-48 bg-theme-neutrals-800 rounded-xl" />
          <View className="mt-3 w-3/4 h-3.5 bg-theme-neutrals-800 rounded" />
          <View className="mt-2 w-1/2 h-3 bg-theme-neutrals-800 rounded" />
        </View>
      ) : privateError ? (
        <View className="items-center justify-center px-6 py-16">
          <View className="bg-theme-neutrals-800/50 rounded-full p-5 mb-5">
            <Ionicons name="lock-closed" size={40} color="#666" />
          </View>
          <Text className="text-white text-lg font-bold text-center mb-2">
            Private Content
          </Text>
          <Text className="text-gray-400 text-center text-sm leading-5">
            This content is from a private account. Follow the creator to view their posts.
          </Text>
        </View>
      ) : null}
      {/* Repost & Quote stats row */}
      {item && (
        <View className="flex-row items-center px-4 pt-3 pb-1 gap-4">
          <TouchableOpacity
            onPress={() =>
              navigation.navigate(ScreenNames.RepostQuoteList as never, {
                tokenId: item.tokenId ?? item.id,
                initialTab: "reposts",
                repostCount: item.reposts ?? 0,
                quoteCount: item.quotes ?? 0,
              } as never)
            }
            activeOpacity={0.7}
            className="flex-row items-center"
          >
            <Text className="text-white font-semibold text-sm">
              {formatCompactNumber(item.reposts ?? 0)}
            </Text>
            <Text className="text-theme-neutrals-400 text-sm ml-1">
              {(item.reposts ?? 0) === 1 ? "Repost" : "Reposts"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() =>
              navigation.navigate(ScreenNames.RepostQuoteList as never, {
                tokenId: item.tokenId ?? item.id,
                initialTab: "quotes",
                repostCount: item.reposts ?? 0,
                quoteCount: item.quotes ?? 0,
              } as never)
            }
            activeOpacity={0.7}
            className="flex-row items-center"
          >
            <Text className="text-white font-semibold text-sm">
              {formatCompactNumber(item.quotes ?? 0)}
            </Text>
            <Text className="text-theme-neutrals-400 text-sm ml-1">
              {(item.quotes ?? 0) === 1 ? "Quote" : "Quotes"}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      <View className="px-4 pt-2 pb-1">
        <Text className="text-theme-neutrals-400 text-xs font-medium">
          {comments.length > 0 ? `${comments.length} Comment${comments.length !== 1 ? "s" : ""}` : "Comments"}
        </Text>
      </View>
    </View>
  ), [item, loading, privateError, navigation, comments.length, focusCommentInput]);

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <FlatList
        data={visibleComments}
        keyExtractor={(c) => String(c.id)}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={!loading ? (
          <View className="px-4 py-6">
            <Text className="text-theme-neutrals-400 text-sm">No comments yet, add yours.</Text>
          </View>
        ) : (
          <View className="px-4 py-3">
            <CommentsSkeleton />
          </View>
        )}
        renderItem={renderCommentItem}
        contentContainerStyle={{ paddingHorizontal: 0, paddingBottom: listBottomPadding }}
        keyboardShouldPersistTaps="handled"
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
      />
      <View
        className="absolute left-0 right-0 bottom-0 border-t border-theme-neutrals-800 bg-theme-neutrals-900"
        style={{ marginBottom: inputLift }}
      >
        {/* Replying / Editing indicator */}
        {(replyTo || editingComment) && !recorder.isRecording && (
          <View
            className="flex-row items-center py-2 bg-theme-neutrals-800/50"
            style={{ paddingHorizontal: COMPOSER.gutter }}
          >
            <Text className="flex-1 text-xs text-theme-neutrals-400">
              {editingComment ? (
                "Editing comment"
              ) : (
                <>
                  Replying to{" "}
                  <Text className="font-semibold">
                    {replyTo?.user?.displayName || replyTo?.user?.username || "user"}
                  </Text>
                </>
              )}
            </Text>
            <TouchableOpacity onPress={cancelReplyOrEdit} activeOpacity={0.7}>
              <Ionicons name="close" size={18} color={theme.colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        )}

        {/* Mention suggestions */}
        <MentionSuggestions
          visible={mentions.showSuggestions}
          suggestions={mentions.suggestions}
          onSelect={mentions.selectMention}
          loading={mentions.loading}
        />

        {/* Voice recorder overlay */}
        {recorder.isRecording ? (
          <VoiceNoteRecordingOverlay recorder={recorder} />
        ) : mediaAttachment ? (
          <CommentMediaPreview
            media={mediaAttachment}
            onRemove={handleRemoveMedia}
            onSend={handleSendMedia}
            sending={mediaPosting}
          />
        ) : (
          /* Standard input row */
          <View
            className="flex-row items-end"
            style={{ gap: COMPOSER.gap, padding: COMPOSER.gutter }}
          >
            <Avatar
              uri={userAvatar && userAvatar !== "default-avatar" ? userAvatar : undefined}
              size={32}
              name={user?.displayName || user?.username}
              style={{ marginBottom: (COMPOSER.control - 32) / 2 }}
            />
            <View
              className="flex-1 flex-row bg-theme-neutrals-800/60 border border-theme-neutrals-700"
              style={{
                // `center`, not `flex-end`: one line of 14px text is ~18 tall in a
                // 40 box. Once the text wraps, the box grows and this is moot.
                alignItems: "center",
                borderRadius: COMPOSER.radius,
                paddingHorizontal: 12,
                paddingVertical: 8,
                minHeight: COMPOSER.control,
              }}
            >
              <TextInput
                ref={inputRef}
                value={inputText}
                onChangeText={mentions.handleChangeText}
                onSelectionChange={mentions.handleSelectionChange}
                placeholder={editingComment ? "Edit your comment..." : replyTo ? "Write a reply..." : "Add a comment..."}
                placeholderTextColor={theme.colors.mutedForeground}
                className="flex-1 text-sm text-theme-neutrals-100"
                style={{
                  // Seven lines of 14px text before it starts scrolling. The
                  // send control is a sibling, not an overlay, so the box is
                  // free to grow into the row.
                  maxHeight: 140,
                  paddingVertical: 0,
                  // Android multiline inputs top-align regardless of the parent.
                  textAlignVertical: "center",
                }}
                multiline
                // No returnKeyType="send"/onSubmitEditing here on purpose: on a
                // multiline field that turns the keyboard's return key into a
                // post button, so a reply cannot be written across two lines.
                // Send is the button beside the field, as on the other surface.
              />
            </View>

            {inputText.trim() || editingComment ? (
              <TouchableOpacity
                onPress={handleSend}
                disabled={posting || !inputText.trim()}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Post comment"
                style={[
                  composerStyles.iconControl,
                  { backgroundColor: inputText.trim() ? "#F9FBFF" : "rgba(255,255,255,0.1)" },
                ]}
              >
                {posting ? (
                  <ActivityIndicator size="small" color="#010305" />
                ) : (
                  <Ionicons
                    name="send"
                    size={18}
                    color={inputText.trim() ? "#010305" : theme.colors.mutedForeground}
                  />
                )}
              </TouchableOpacity>
            ) : (
              <View className="flex-row items-center" style={{ gap: COMPOSER.gap / 2 }}>
                <TouchableOpacity
                  onPress={handlePickImage}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Add image"
                  style={composerStyles.iconControl}
                >
                  <Ionicons name="image-outline" size={20} color={theme.colors.mutedForeground} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleOpenGifPicker}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Add GIF"
                  style={composerStyles.iconControl}
                >
                  {/* A text glyph, not an icon — it only lines up with its neighbours
                      because the box is sized explicitly rather than by padding. */}
                  <Text className="text-xs font-bold text-theme-neutrals-400">GIF</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleOpenEmojiPicker}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Add emoji"
                  style={composerStyles.iconControl}
                >
                  {/* A text glyph, not an icon — same reasoning as GIF above: a
                      thin line-art face reads smaller and washed-out next to a
                      solid rectangle and a solid capsule in identical boxes. */}
                  <Text style={{ fontSize: 18 }}>🙂</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    Keyboard.dismiss();
                    recorder.startRecording();
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Record voice note"
                  style={composerStyles.iconControl}
                >
                  <Ionicons name="mic-outline" size={20} color={theme.colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>

      {/* GIF picker modal */}
      <GifPicker
        visible={gifPickerVisible}
        onClose={handleCloseGifPicker}
        onPick={handleGifPicked}
      />

      <EmojiSheet
        visible={emojiPickerVisible}
        onClose={handleCloseEmojiPicker}
        onSelect={handleEmojiSelected}
      />

      {/* WhatsApp/IG-style context menu */}
      <CommentContextMenu
        visible={contextComment !== null}
        comment={contextComment}
        layout={contextLayout}
        isReply={contextMeta?.isReply}
        isOwnComment={contextMeta?.isOwnComment ?? false}
        liked={contextMeta?.liked}
        disliked={contextMeta?.disliked}
        canDelete={contextMeta?.isOwnComment}
        onClose={closeContextMenu}
        onReply={contextMeta?.isReply ? undefined : handleContextReply}
        onEdit={contextMeta?.isOwnComment ? handleContextEdit : undefined}
        onDelete={contextMeta?.isOwnComment ? handleContextDelete : undefined}
        onLike={handleContextLike}
        onDislike={handleContextDislike}
        onShowLikers={
          contextComment ? () => setLikersCommentId(Number(contextComment.id)) : undefined
        }
        tokenId={tokenId}
      />

      {/* Tip a comment's author. Always the EVM DHB flow — comment authors
          are tipped as people, whatever chain the post lives on. */}
      <GlassTipSheet
        visible={tipComment !== null}
        onClose={() => setTipComment(null)}
        toAddress={tipComment?.user?.address || tipComment?.address || ""}
        tokenId={Number(tokenId) || 0}
        recipientName={
          tipComment?.user?.displayName || tipComment?.user?.username
        }
        tipContext="user"
        commentId={tipComment ? Number(tipComment.id) : undefined}
        onSuccess={(amount) => {
          if (tipComment) bumpTipTotal(Number(tipComment.id), amount);
        }}
      />

      <CommentLikersSheet
        visible={likersCommentId !== null}
        onClose={() => setLikersCommentId(null)}
        commentId={likersCommentId}
      />
    </View>
  );
}
