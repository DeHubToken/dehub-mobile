import React, { memo, useCallback, useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  Keyboard,
  Platform,
  RefreshControl,
} from "react-native";
import Icon from "../ui/Icon";
import { COMPOSER, composerStyles } from "./composerLayout";
import CommentItem from "./CommentItem";
import CommentContextMenu from "./CommentContextMenu";
import CommentLikersSheet from "./CommentLikersSheet";
import type { CommentLayout } from "./CommentContextMenu";
import CommentMediaPreview from "./CommentMediaPreview";
import type { MediaAttachment } from "./CommentMediaPreview";
import { useVoiceRecorder, VoiceNoteRecordingOverlay } from "./VoiceNoteRecorder";
import type { VoiceNoteResult } from "./VoiceNoteRecorder";
import GifPicker from "../DM/GifPicker";
import EmojiSheet from "../Upload/EmojiSheet";
import GlassTipSheet from "../Tip/GlassTipSheet";
import Avatar from "../common/Avatar";
import MentionSuggestions from "../common/MentionSuggestions";
import { useUser, useAuthActions } from "../../context/AuthContext";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import {
  getCommentsForToken,
  getCommentReplies,
  postComment,
  likeComment,
  dislikeComment,
  editComment,
  deleteComment,
  postImageComment,
  postGifComment,
  postAudioComment,
  recordCommentViews,
  Comment,
} from "../../services/nft.service";
import { getAvatarUrl, toastError, toastSuccess } from "../../libs";
import { openCroppedImagePicker, getFileName, guessMime } from "../../libs/assets.util";
import useKeyboard from "../../hooks/useKeyboard";
import { useMentions } from "../../hooks/useMentions";
import { useAssistantPendingReply } from "../../hooks/useAssistantPendingReply";
import { mentionsAssistant } from "../../libs/assistant";
import { useCommentTipTotals } from "../../hooks/useCommentTipTotals";
import { useBookBoost, useSuperpowers } from "../../hooks/useSuperpowers";
import { getNFT } from "../../services/nft.service";
import { useQuery } from "@tanstack/react-query";
import type { PostCreator } from "../../libs/impersonation";

// Extended comment type for flat list with reply info
interface FlatComment extends Comment {
  isReply?: boolean;
  /** Nesting depth: 0 = top-level, 1 = direct reply, 2 = reply-to-reply, etc. */
  depth: number;
  /** ID of the root top-level comment this reply belongs to (set for all replies) */
  rootParentId?: number;
}

interface CommentSectionProps {
  tokenId: number | string;
  onClose?: () => void;
  highlightCommentId?: number | string;
  contentType?: "video" | "feed";
  /** Creator turned replies off. Replaces the composer with a notice and leaves
   *  the list alone — disabling hides no history, the server simply refuses new
   *  comments (requestCommentFunc), so this is presentation not enforcement. */
  commentsDisabled?: boolean;
  /** The post creator, for the Creator / Not-the-creator chips on comments. */
  postCreator?: PostCreator | null;
}

const PAGE_SIZE = 50;

const CommentSectionComponent: React.FC<CommentSectionProps> = ({
  tokenId,
  onClose,
  highlightCommentId,
  contentType = "video",
  commentsDisabled = false,
  postCreator,
}) => {
  const user = useUser();
  const { requireAuth } = useAuthActions();
  const { showUserProfile } = useUserProfileSheet();
  const inputRef = useRef<TextInput>(null);
  const { height: kbHeight, isVisible: kbVisible } = useKeyboard();

  // State - flat list of comments with replies inline
  const [flatComments, setFlatComments] = useState<FlatComment[]>([]);
  const [expandedCommentIds, setExpandedCommentIds] = useState<Set<number>>(new Set());
  const [loadingRepliesMap, setLoadingRepliesMap] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [highlightedId, setHighlightedId] = useState<number | null>(
    highlightCommentId != null ? Number(highlightCommentId) : null
  );

  // Input state
  const [inputText, setInputText] = useState("");
  const mentions = useMentions(inputText, setInputText);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [editingComment, setEditingComment] = useState<Comment | null>(null);
  const [posting, setPosting] = useState(false);

  // Context menu state (WhatsApp/IG-style long-press)
  const [contextComment, setContextComment] = useState<Comment | null>(null);
  const [contextLayout, setContextLayout] = useState<CommentLayout | null>(null);
  const [contextMeta, setContextMeta] = useState<{ liked: boolean; disliked: boolean; isOwnComment: boolean; isReply: boolean } | null>(null);

  // Tip-a-comment state + per-comment totals from tip_records
  const [tipComment, setTipComment] = useState<Comment | null>(null);
  // Author-only who-liked list, opened from an own comment's like button.
  const [likersCommentId, setLikersCommentId] = useState<number | null>(null);
  const { totals: tipTotals, bump: bumpTipTotal } = useCommentTipTotals(
    flatComments.map((c) => c.id),
  );

  // Media attachment state
  const [mediaAttachment, setMediaAttachment] = useState<MediaAttachment | null>(null);
  const [mediaPosting, setMediaPosting] = useState(false);

  // Voice recording callbacks (defined before hook call)
  const handleVoiceRecordingComplete = useCallback((result: VoiceNoteResult) => {
    setMediaAttachment({ type: "audio", uri: result.uri, durationMs: result.durationMs });
    setInputText("");
  }, []);

  const handleVoiceRecordingCancel = useCallback(() => {
    // Hook manages isRecording state internally
  }, []);

  // Voice recorder hook
  const recorder = useVoiceRecorder({
    onRecordingComplete: handleVoiceRecordingComplete,
    onCancel: handleVoiceRecordingCancel,
  });

  // GIF picker state
  const [gifPickerVisible, setGifPickerVisible] = useState(false);
  // Emoji picker state
  const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);

  const userAddress = user?.address || user?.walletAddress || undefined;
  const userAvatar = getAvatarUrl(user?.avatarImageUrl || "");

  // Keyboard lift for input
  const inputLift = kbVisible ? kbHeight : 0;

  // Build flat list with replies inline after their parent using recursive depth tracking.
  // If highlightCommentId is a reply, its root ancestor chain is emitted first.
  const buildFlatComments = useCallback((rawComments: Comment[]): FlatComment[] => {
    const byId = new Map<number, Comment>();
    rawComments.forEach((c) => byId.set(Number(c.id), c));

    // Build child/parent maps. replyIds carries the server's sibling ordering so
    // it's read first; parentId then catches any reply its parent didn't list.
    // Both are ignored when the other end isn't in this page — an orphan is
    // emitted as a root below rather than vanishing from the thread.
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
      if (!Array.isArray(c.replyIds)) return;
      c.replyIds.forEach((rid) => {
        if (byId.has(Number(rid))) link(Number(rid), Number(c.id));
      });
    });
    rawComments.forEach((c) => {
      if (c.parentId != null) link(Number(c.id), Number(c.parentId));
    });

    const flat: FlatComment[] = [];
    const emitted = new Set<number>();

    const emitRecursive = (comment: Comment, depth: number, rootParentId: number) => {
      const cId = Number(comment.id);
      if (emitted.has(cId)) return;
      emitted.add(cId);
      flat.push({ ...comment, isReply: depth > 0, depth, rootParentId });

      const childIds = childrenOf.get(cId);
      if (childIds) {
        childIds.forEach((childId) => {
          const child = byId.get(childId);
          if (child) emitRecursive(child, depth + 1, rootParentId);
        });
      }
    };

    // If highlighted comment is a reply, emit its root ancestor first
    const hlId = highlightCommentId != null ? Number(highlightCommentId) : undefined;
    let highlightedRootId: number | undefined;
    if (hlId != null && parentOf.has(hlId)) {
      let current: number = hlId;
      const walked = new Set<number>([current]);
      while (parentOf.has(current)) {
        const next = parentOf.get(current)!;
        if (walked.has(next)) break; // malformed cycle
        walked.add(next);
        current = next;
      }
      highlightedRootId = current;
    }

    if (highlightedRootId != null) {
      const rootComment = byId.get(highlightedRootId);
      if (rootComment) emitRecursive(rootComment, 0, highlightedRootId);
    }

    // Emit remaining roots in original order
    rawComments.forEach((c) => {
      if (!parentOf.has(Number(c.id))) {
        emitRecursive(c, 0, Number(c.id));
      }
    });

    // Safety net: bad data forming a parent cycle would leave no member looking
    // like a root and drop the whole ring. Surface anything the walk never
    // reached as top-level rather than losing it.
    rawComments.forEach((c) => emitRecursive(c, 0, Number(c.id)));

    return flat;
  }, [highlightCommentId]);

  // Load comments
  const loadComments = useCallback(async (isRefresh = false) => {
    try {
      const res = await getCommentsForToken(tokenId, {
        page: 0,
        limit: PAGE_SIZE,
        address: userAddress,
        commentId: highlightCommentId,
      });

      const { items } = res.result;
      const flat = buildFlatComments(items);
      setFlatComments(flat);

      // Set highlight on initial load if commentId matches
      if (!isRefresh && highlightCommentId != null) {
        const hlId = Number(highlightCommentId);
        if (flat.some((c) => Number(c.id) === hlId)) {
          setHighlightedId(hlId);
          setTimeout(() => setHighlightedId(null), 4000);
        }
      }
    } catch (e) {
      console.error("Failed to load comments:", e);
      if (!isRefresh) toastError("Failed to load comments");
    }
  }, [tokenId, userAddress, highlightCommentId, buildFlatComments]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    loadComments().finally(() => setLoading(false));
  }, [loadComments]);

  // Tagging @assistant produces a real comment, but only once the model has
  // answered — several seconds after the post returns. This keeps a placeholder
  // in the thread and reloads until the reply lands.
  const { isWaiting: isAssistantReplying, arm: armAssistantReply } =
    useAssistantPendingReply(() => loadComments(true), flatComments);

  // Refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadComments(true);
    setRefreshing(false);
  }, [loadComments]);

  const handleToggleReplies = useCallback(async (commentId: number) => {
    const isExpanded = expandedCommentIds.has(commentId);
    
    if (isExpanded) {
      // Collapse replies: remove all descendants of this comment
      setExpandedCommentIds((prev) => {
        const next = new Set(prev);
        next.delete(commentId);
        return next;
      });

      setFlatComments((prev) => {
        const parentIdx = prev.findIndex((c) => Number(c.id) === commentId);
        if (parentIdx === -1) return prev;
        const parentDepth = prev[parentIdx].depth;
        
        // Find how many items to remove
        let removeCount = 0;
        for (let i = parentIdx + 1; i < prev.length; i++) {
          if (prev[i].depth > parentDepth) {
            removeCount++;
          } else {
            break;
          }
        }
        
        if (removeCount === 0) return prev;
        const nextList = [...prev];
        nextList.splice(parentIdx + 1, removeCount);
        return nextList;
      });
    } else {
      // Expand replies: fetch from server
      setLoadingRepliesMap((prev) => ({ ...prev, [commentId]: true }));
      try {
        const parentIdx = flatComments.findIndex((c) => Number(c.id) === commentId);
        if (parentIdx === -1) return;
        const parentComment = flatComments[parentIdx];
        const parentDepth = parentComment.depth ?? 0;
        const rootParentId = parentComment.rootParentId ?? Number(parentComment.id);

        const res = await getCommentReplies(commentId, { limit: 100 });
        const replies = res.result?.items || [];

        // The first page already inlines whatever replies came down with it, so
        // only splice in the ones that aren't on screen yet — otherwise expanding
        // shows every visible reply twice.
        const onScreen = new Set(flatComments.map((c) => Number(c.id)));
        const flatReplies: FlatComment[] = replies
          .filter((r) => !onScreen.has(Number(r.id)))
          .map((r) => ({
            ...r,
            isReply: true,
            depth: parentDepth + 1,
            rootParentId,
          }));

        setExpandedCommentIds((prev) => {
          const next = new Set(prev);
          next.add(commentId);
          return next;
        });

        setFlatComments((prev) => {
          const idx = prev.findIndex((c) => Number(c.id) === commentId);
          if (idx === -1) return prev;
          
          const nextList = [...prev];
          nextList.splice(idx + 1, 0, ...flatReplies);
          return nextList;
        });
      } catch (err) {
        console.warn("[CommentSection] Failed to load replies:", err);
        toastError("Failed to load replies");
      } finally {
        setLoadingRepliesMap((prev) => ({ ...prev, [commentId]: false }));
      }
    }
  }, [expandedCommentIds, flatComments]);

  // Like a comment - returns the result for optimistic sync
  const handleLikeComment = useCallback(async (commentId: number) => {
    if (!requireAuth) return;

    return await requireAuth(async () => {
      return await likeComment({ commentId });
    });
  }, [requireAuth]);

  // Dislike a comment - returns the result for optimistic sync
  const handleDislikeComment = useCallback(async (commentId: number) => {
    if (!requireAuth) return;

    return await requireAuth(async () => {
      return await dislikeComment({ commentId });
    });
  }, [requireAuth]);

  // Handle starting edit mode for a comment
  const handleStartEdit = useCallback((comment: Comment) => {
    setEditingComment(comment);
    setReplyingTo(null);
    setInputText(comment.content || "");
    inputRef.current?.focus();
  }, []);

  // Reply to any comment (top-level or nested reply)
  const handleReply = useCallback((comment: Comment) => {
    setReplyingTo(comment);
    setEditingComment(null);
    // Prefill @mention of the author being replied to
    const mentionName = comment.user?.username || comment.user?.displayName || "user";
    setInputText(`@${mentionName} `);
    inputRef.current?.focus();
  }, []);

  // Cancel reply or edit
  const cancelReplyOrEdit = useCallback(() => {
    setReplyingTo(null);
    setEditingComment(null);
    setInputText("");
    mentions.reset();
  }, [mentions]);


  // Pick image → open cropper → set preview
  const handlePickImage = useCallback(async () => {
    if (!requireAuth) return;
    await requireAuth(async () => {
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
          console.error("[CommentSection] image picker error", e);
          toastError("Failed to pick image");
        }
      }
    });
  }, [requireAuth]);

  // Open GIF picker
  const handleOpenGifPicker = useCallback(() => {
    if (!requireAuth) return;
    requireAuth(() => {
      Keyboard.dismiss();
      setGifPickerVisible(true);
    });
  }, [requireAuth]);

  // Open emoji picker
  const handleOpenEmojiPicker = useCallback(() => {
    Keyboard.dismiss();
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

  const handleStartRecording = useCallback(() => {
    Keyboard.dismiss();
    recorder.startRecording();
  }, [recorder]);

  // GIF selected from picker
  const handleGifPicked = useCallback((url: string) => {
    setGifPickerVisible(false);
    setMediaAttachment({ type: "gif", url });
    setInputText("");
    Keyboard.dismiss();
  }, []);

  const handleCloseGifPicker = useCallback(() => {
    setGifPickerVisible(false);
  }, []);

  // (Voice recording handlers moved above useVoiceRecorder hook call)

  // Remove media attachment
  const handleRemoveMedia = useCallback(() => {
    setMediaAttachment(null);
  }, []);

  // Send media comment
  const handleSendMedia = useCallback(async () => {
    if (!mediaAttachment || mediaPosting) return;
    if (!requireAuth) return;

    await requireAuth(async () => {
      setMediaPosting(true);
      const now = new Date().toISOString();
      const tempId = -Date.now();
      const replyToId = replyingTo ? Number(replyingTo.id) : undefined;
      const parentDepth = replyingTo ? ((replyingTo as FlatComment).depth ?? ((replyingTo as FlatComment).isReply ? 1 : 0)) : 0;
      const rootParentId = replyingTo
        ? ((replyingTo as FlatComment).rootParentId ?? Number(replyingTo.id))
        : undefined;
      const newDepth = replyingTo ? parentDepth + 1 : 0;

      // Build optimistic comment
      const optimistic: FlatComment = {
        id: tempId,
        content: "",
        createdAt: now,
        user: {
          username: user?.username,
          displayName: user?.displayName,
          avatarImageUrl: user?.avatarImageUrl,
          address: userAddress,
        },
        likeCount: 0,
        isLiked: false,
        replyIds: [],
        isReply: newDepth > 0,
        depth: newDepth,
        rootParentId,
        // Optimistic media fields
        imageUrl: mediaAttachment.type === "image" ? mediaAttachment.uri : undefined,
        gifUrl: mediaAttachment.type === "gif" ? mediaAttachment.url : undefined,
        audioUrl: mediaAttachment.type === "audio" ? mediaAttachment.uri : undefined,
        audioDuration: mediaAttachment.type === "audio" ? Math.round(mediaAttachment.durationMs / 1000) : undefined,
      };

      // Insert optimistically at the correct depth
      if (replyingTo) {
        const parentId = Number(replyingTo.id);
        setFlatComments((prev) => {
          const parentIndex = prev.findIndex((c) => Number(c.id) === parentId);
          if (parentIndex === -1) return [...prev, optimistic];
          // Insert after all existing descendants of parent
          let insertIndex = parentIndex + 1;
          while (insertIndex < prev.length && prev[insertIndex].depth > parentDepth) {
            insertIndex++;
          }
          const newList = [...prev];
          // Update parent replyIds so reply count increments immediately
          newList[parentIndex] = {
            ...newList[parentIndex],
            replyIds: [...(newList[parentIndex].replyIds ?? []), tempId],
          };
          newList.splice(insertIndex, 0, optimistic);
          return newList;
        });
      } else {
        setFlatComments((prev) => [optimistic, ...prev]);
      }

      const savedMedia = mediaAttachment;
      setMediaAttachment(null);
      setReplyingTo(null);

      try {
        let newId: number | undefined;

        if (savedMedia.type === "image") {
          const fileName = getFileName(savedMedia.uri, "comment_image.jpg");
          const mimeType = guessMime(savedMedia.uri, "image/jpeg");
          const res = await postImageComment({
            streamTokenId: tokenId,
            fileUri: savedMedia.uri,
            fileName,
            mimeType,
            commentId: replyToId,
          });
          newId = res?.commentId;
        } else if (savedMedia.type === "gif") {
          const res = await postGifComment({
            streamTokenId: tokenId,
            gifUrl: savedMedia.url,
            commentId: replyToId,
          });
          newId = res?.commentId;
        } else if (savedMedia.type === "audio") {
          const fileName = getFileName(savedMedia.uri, "voice_note.m4a");
          const mimeType = Platform.OS === "ios" ? "audio/m4a" : "audio/mp4";
          const res = await postAudioComment({
            streamTokenId: tokenId,
            fileUri: savedMedia.uri,
            fileName,
            mimeType,
            commentId: replyToId,
          });
          newId = res?.commentId;
        }

        // Reconcile temp ID with real ID
        if (newId != null) {
          setFlatComments((prev) =>
            prev.map((c) => {
              if (c.id === tempId) return { ...c, id: newId! };
              if (c.replyIds?.includes(tempId)) {
                return {
                  ...c,
                  replyIds: c.replyIds.map((rid) => (rid === tempId ? newId! : rid)),
                };
              }
              return c;
            })
          );
        }
      } catch (e) {
        console.error("[CommentSection] media post error", e);
        setFlatComments((prev) => prev.filter((c) => c.id !== tempId));
        toastError("Failed to send media comment");
      } finally {
        setMediaPosting(false);
      }
    });
  }, [mediaAttachment, mediaPosting, requireAuth, tokenId, replyingTo, user, userAddress]);

  // Post comment or save edit - with optimistic updates
  const handlePost = useCallback(async () => {
    if (!inputText.trim() || posting) return;
    if (!requireAuth) return;

    await requireAuth(async () => {
      setPosting(true);
      const text = inputText.trim();
      const now = new Date().toISOString();
      const tempId = -Date.now(); // Negative ID for optimistic item

      try {
        if (editingComment) {
          // Optimistic update for edit
          setFlatComments((prev) =>
            prev.map((c) =>
              c.id === editingComment.id ? { ...c, content: text } : c
            )
          );
          setEditingComment(null);
          setInputText("");
          mentions.reset();
          Keyboard.dismiss();

          // Save edit to server
          await editComment({ commentId: editingComment.id, content: text });
        } else {
          // Optimistic update for new comment/reply
          const parentDepth = replyingTo ? ((replyingTo as FlatComment).depth ?? ((replyingTo as FlatComment).isReply ? 1 : 0)) : 0;
          const rootParentId = replyingTo
            ? ((replyingTo as FlatComment).rootParentId ?? Number(replyingTo.id))
            : undefined;
          const newDepth = replyingTo ? parentDepth + 1 : 0;

          const optimisticComment: FlatComment = {
            id: tempId,
            content: text,
            createdAt: now,
            user: {
              username: user?.username,
              displayName: user?.displayName,
              avatarImageUrl: user?.avatarImageUrl,
              address: userAddress,
            },
            likeCount: 0,
            isLiked: false,
            replyIds: [],
            isReply: newDepth > 0,
            depth: newDepth,
            rootParentId,
          };

          if (replyingTo) {
            const parentId = Number(replyingTo.id);
            setFlatComments((prev) => {
              const parentIndex = prev.findIndex((c) => Number(c.id) === parentId);
              if (parentIndex === -1) return [...prev, optimisticComment];

              // Insert after all existing descendants of parent
              let insertIndex = parentIndex + 1;
              while (insertIndex < prev.length && prev[insertIndex].depth > parentDepth) {
                insertIndex++;
              }
              const newList = [...prev];
              // Update parent replyIds so reply count increments immediately
              newList[parentIndex] = {
                ...newList[parentIndex],
                replyIds: [...(newList[parentIndex].replyIds ?? []), tempId],
              };
              newList.splice(insertIndex, 0, optimisticComment);
              return newList;
            });
          } else {
            // Prepend new top-level comment
            setFlatComments((prev) => [optimisticComment, ...prev]);
          }

          const replyToId = replyingTo ? Number(replyingTo.id) : undefined;
          setReplyingTo(null);
          setInputText("");
          mentions.reset();
          Keyboard.dismiss();

          // Post to server
          const res = await postComment({
            streamTokenId: tokenId,
            content: text,
            commentId: replyToId,
          });

          // Reconcile temp ID with server ID
          const newId = res?.result?.id ?? res?.id;
          if (newId != null) {
            setFlatComments((prev) =>
              prev.map((c) => {
                if (c.id === tempId) return { ...c, id: newId };
                // Replace tempId in parent's replyIds with real ID
                if (c.replyIds?.includes(tempId)) {
                  return {
                    ...c,
                    replyIds: c.replyIds.map((rid) => (rid === tempId ? newId : rid)),
                  };
                }
                return c;
              })
            );
          }

          // The bot has to call the model before its comment exists, so the
          // thread needs to keep looking for it rather than assume it is there.
          if (mentionsAssistant(text)) armAssistantReply();
        }
      } catch (e) {
        console.error("Failed to post/edit comment:", e);
        
        if (editingComment) {
          // Revert edit - reload comments
          await loadComments(true);
        } else {
          // Revert optimistic comment
          setFlatComments((prev) => prev.filter((c) => c.id !== tempId));
        }
        
        // The server's own words when it has them: a refusal explains itself,
        // and a generic failure leaves the author guessing.
        const reason = e instanceof Error && e.message ? e.message : null;
        toastError(reason || (editingComment ? "Failed to edit comment" : "Failed to post comment"));
      } finally {
        setPosting(false);
      }
    });
  }, [inputText, posting, requireAuth, tokenId, replyingTo, editingComment, loadComments, user, userAddress, armAssistantReply]);

  // Handle user press
  const handleUserPress = useCallback((userId: string) => {
    showUserProfile(userId);
  }, [showUserProfile]);

  // Long-press → open context menu
  const handleCommentLongPress = useCallback(
    (comment: Comment, layout: CommentLayout, extra: { liked: boolean; disliked: boolean; isOwnComment: boolean; isReply: boolean }) => {
      setContextComment(comment);
      setContextLayout(layout);
      setContextMeta(extra);
    },
    []
  );

  /**
   * Comment Anchor — the Piranha rung.
   *
   * Three conditions, resolved once here rather than per row, and mirroring
   * the server's exactly: the account holds the power, the comment is theirs
   * (per row, below), and the THREAD belongs to somebody else. On your own
   * post a pin is already yours, free and permanent, so offering a paid
   * fifteen-minute version of it would be selling somebody something they own.
   *
   * The post is read through the same cached key BoostSheet uses, so opening
   * comments after opening the sheet costs nothing.
   */
  const { data: superpowerStatus } = useSuperpowers();
  const anchorComment = useBookBoost();

  const { data: threadPost } = useQuery({
    queryKey: ["boosted-post", String(tokenId ?? "")],
    queryFn: () => getNFT(tokenId),
    enabled: tokenId != null,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const threadAuthor = ((threadPost as any)?.result?.minter ?? "").toLowerCase();
  const canAnchor =
    !!userAddress &&
    !!threadAuthor &&
    threadAuthor !== userAddress.toLowerCase() &&
    !!superpowerStatus?.powers.some(p => p.key === "comment_anchor" && p.unlocked && p.available) &&
    (superpowerStatus?.boostsLeft ?? 0) > 0;

  const handleContextAnchor = useCallback(() => {
    const id = contextComment?.id;
    if (id == null) return;
    anchorComment.mutate(
      { tokenId: 0, power: "comment_anchor", commentId: String(id) },
      {
        onSuccess: booking =>
          toastSuccess(`Anchored to the top for ${booking.minutes} minutes`),
        // The server writes these sentences for a person to read.
        onError: (error: any) => toastError(error?.message || "Could not anchor that comment"),
      },
    );
  }, [contextComment, anchorComment]);

  const closeContextMenu = useCallback(() => {
    setContextComment(null);
    setContextLayout(null);
    setContextMeta(null);
  }, []);

  // Context menu action: reply
  const handleContextReply = useCallback(() => {
    if (contextComment) handleReply(contextComment);
  }, [contextComment, handleReply]);

  // Context menu action: edit
  const handleContextEdit = useCallback(() => {
    if (contextComment) handleStartEdit(contextComment);
  }, [contextComment, handleStartEdit]);

  // Context menu action: like
  const handleContextLike = useCallback(async () => {
    if (!contextComment) return;
    try {
      const result = await likeComment({ commentId: contextComment.id });
      // Optimistic update in flat list
      if (result && typeof result.liked === 'boolean') {
        setFlatComments((prev) =>
          prev.map((c) =>
            c.id === contextComment.id
              ? { ...c, isLiked: result.liked, likeCount: result.likes }
              : c
          )
        );
      }
    } catch (e) {
      console.error('Failed to like comment:', e);
    }
  }, [contextComment]);

  // Context menu action: dislike
  const handleContextDislike = useCallback(async () => {
    if (!contextComment) return;
    try {
      const result = await dislikeComment({ commentId: contextComment.id });
      if (result && typeof result.disliked === 'boolean') {
        setFlatComments((prev) =>
          prev.map((c) =>
            c.id === contextComment.id
              ? { ...c, isDisliked: result.disliked, dislikeCount: result.dislikes }
              : c
          )
        );
      }
    } catch (e) {
      console.error('Failed to dislike comment:', e);
    }
  }, [contextComment]);

  // Context menu action: delete
  const handleContextDelete = useCallback(async () => {
    if (!contextComment) return;
    const commentId = contextComment.id;
    // Optimistic removal: remove the comment and all its descendants (depth > comment's depth)
    setFlatComments((prev) => {
      const idx = prev.findIndex((c) => c.id === commentId);
      if (idx === -1) return prev;
      const deleteDepth = prev[idx].depth;
      let endIdx = idx + 1;
      while (endIdx < prev.length && prev[endIdx].depth > deleteDepth) endIdx++;
      const next = [...prev];
      next.splice(idx, endIdx - idx);
      return next;
    });
    try {
      await deleteComment({ commentId });
    } catch (e) {
      console.error('Failed to delete comment:', e);
      toastError('Failed to delete comment');
      // Revert by reloading
      await loadComments(true);
    }
  }, [contextComment, contextMeta, loadComments]);

  const renderComment = useCallback(({ item }: { item: FlatComment }) => {
    const isHighlighted = highlightedId != null && Number(item.id) === highlightedId;
    const indent = item.depth > 0 ? item.depth * 20 : 0;
    const itemNumId = Number(item.id);
    return (
      <View style={indent > 0 ? { paddingLeft: indent } : undefined}>
        <CommentItem
          comment={item}
          postCreator={postCreator}
          isReply={item.isReply}
          onReply={handleReply}
          onTip={setTipComment}
          tipTotal={tipTotals[itemNumId]}
          onLike={handleLikeComment}
          onDislike={handleDislikeComment}
          onShowLikers={setLikersCommentId}
          onUserPress={handleUserPress}
          onEdit={handleStartEdit}
          onLongPress={handleCommentLongPress}
          tokenId={tokenId}
          contentType={contentType}
          highlighted={isHighlighted}
          repliesExpanded={expandedCommentIds.has(itemNumId)}
          onToggleReplies={() => handleToggleReplies(itemNumId)}
          loadingReplies={!!loadingRepliesMap[itemNumId]}
        />
      </View>
    );
  }, [
    handleReply,
    tipTotals,
    handleLikeComment,
    handleDislikeComment,
    handleUserPress,
    handleStartEdit,
    handleCommentLongPress,
    tokenId,
    contentType,
    highlightedId,
    expandedCommentIds,
    handleToggleReplies,
    loadingRepliesMap,
    postCreator,
  ]);

  const keyExtractor = useCallback((item: FlatComment) => `comment-${item.id}`, []);

  // Comment view tracking — batch fire POST /api/comment_views when comments scroll into view
  const viewBatchRef = useRef<Set<number>>(new Set());
  // Comments already counted this mounting. Without it a comment takes a
  // fresh view every time it scrolls back into frame — the server increments
  // blindly, so the dedup has to live here.
  const viewSentRef = useRef<Set<number>>(new Set());
  const viewFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushCommentViews = useCallback(() => {
    if (!viewBatchRef.current.size) return;
    const ids = Array.from(viewBatchRef.current);
    viewBatchRef.current.clear();
    recordCommentViews(ids).catch(() => {});
  }, []);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50, minimumViewTime: 500 }).current;

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    for (const v of viewableItems) {
      const id = (v.item as FlatComment)?.id;
      const numericId = Number(id);
      if (id == null || !Number.isFinite(numericId)) continue;
      if (viewSentRef.current.has(numericId)) continue;
      viewSentRef.current.add(numericId);
      viewBatchRef.current.add(numericId);
    }
    if (viewFlushTimer.current) clearTimeout(viewFlushTimer.current);
    viewFlushTimer.current = setTimeout(flushCommentViews, 2000);
  }).current;

  useEffect(() => () => {
    if (viewFlushTimer.current) clearTimeout(viewFlushTimer.current);
    flushCommentViews();
  }, [flushCommentViews]);

  // Calculate bottom padding for list to account for input
  const listBottomPadding = 88 + inputLift;

  return (
    <View style={{ flex: 1 }}>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#F4F4F5" />
        </View>
      ) : (
        <FlatList
          data={flatComments}
          renderItem={renderComment}
          keyExtractor={keyExtractor}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: listBottomPadding }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#F4F4F5"
              progressBackgroundColor="#1a1a1a"
            />
          }
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          ListHeaderComponent={
            isAssistantReplying ? (
              <View className="flex-row items-center py-3">
                <ActivityIndicator size="small" color="#8B8D90" />
                <Text style={{ color: "#8B8D90", fontSize: 13, marginLeft: 8 }}>
                  DeHub Assistant is replying…
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-16">
              <Text style={{ color: "#8B8D90", fontSize: 14 }}>
                No comments yet. Be the first!
              </Text>
            </View>
          }
        />
      )}

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          borderTopWidth: 1,
          borderTopColor: "rgba(255,255,255,0.06)",
          // Opaque: the comment list scrolls underneath this bar, and the
          // translucent fill put scrolled text behind the input.
          backgroundColor: "#0C0C0E",
          marginBottom: inputLift,
        }}
      >
        {(replyingTo || editingComment) && !recorder.isRecording && (
          <View
            className="flex-row items-center py-2"
            style={{ backgroundColor: "rgba(255,255,255,0.04)", paddingHorizontal: COMPOSER.gutter }}
          >
            <Icon name="CornerDownLeft" size={14} color="#6F7174" />
            <Text style={{ flex: 1, fontSize: 12, color: "#A6A9AC", marginLeft: 6 }}>
              {editingComment ? "Editing comment" : `Replying to @${replyingTo?.user?.displayName || replyingTo?.user?.username || "user"}`}
            </Text>
            <Pressable onPress={cancelReplyOrEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="X" size={16} color="#6F7174" />
            </Pressable>
          </View>
        )}

        <MentionSuggestions
          visible={mentions.showSuggestions}
          suggestions={mentions.suggestions}
          onSelect={mentions.selectMention}
          loading={mentions.loading}
        />

        {commentsDisabled ? (
          <View
            className="flex-row items-center justify-center"
            style={{ gap: COMPOSER.gap, padding: COMPOSER.gutter, minHeight: COMPOSER.control + COMPOSER.gutter * 2 }}
          >
            <Icon name="MessageSquare" size={16} color="#6F7174" />
            <Text className="text-theme-neutrals-400 text-sm">
              Comments are turned off for this post
            </Text>
          </View>
        ) : recorder.isRecording ? (
          <VoiceNoteRecordingOverlay recorder={recorder} />
        ) : mediaAttachment ? (
          <CommentMediaPreview
            media={mediaAttachment}
            onRemove={handleRemoveMedia}
            onSend={handleSendMedia}
            sending={mediaPosting}
          />
        ) : (
          <View className="flex-row items-end" style={{ gap: COMPOSER.gap, padding: COMPOSER.gutter }}>
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                // `center`, not `flex-end`: a single line of 14px text is ~18 tall
                // inside a 40 box, and flex-end pinned it to the bottom edge. Once
                // the text wraps the input grows past the minimum and this is moot.
                alignItems: "center",
                backgroundColor: "rgba(255,255,255,0.06)",
                borderRadius: COMPOSER.radius,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
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
                placeholder={editingComment ? "Edit your comment..." : replyingTo ? "Write a reply..." : "Type here..."}
                placeholderTextColor="#6F7174"
                style={{
                  flex: 1,
                  color: "#F9FBFF",
                  fontSize: 14,
                  maxHeight: 80,
                  paddingVertical: 0,
                  // Android multiline inputs default to top-aligned text regardless
                  // of the parent's alignment.
                  textAlignVertical: "center",
                }}
                maxLength={500}
                multiline
              />
            </View>

            {inputText.trim() || editingComment ? (
              <Pressable
                onPress={handlePost}
                disabled={posting || !inputText.trim()}
                accessibilityRole="button"
                accessibilityLabel="Post comment"
                style={[
                  composerStyles.control,
                  { backgroundColor: inputText.trim() ? "#F9FBFF" : "rgba(255,255,255,0.1)" },
                ]}
              >
                {/* The spinner is sized to the label it replaces so the pill does not
                    resize mid-send. */}
                <View style={{ minWidth: 30, alignItems: "center" }}>
                  {posting ? (
                    <ActivityIndicator size="small" color="#010305" />
                  ) : (
                    <Text
                      style={{
                        color: inputText.trim() ? "#010305" : "#6F7174",
                        fontSize: 14,
                        fontWeight: "600",
                      }}
                    >
                      Post
                    </Text>
                  )}
                </View>
              </Pressable>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: COMPOSER.gap / 2 }}>
                <Pressable
                  onPress={handlePickImage}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Add image"
                  style={composerStyles.iconControl}
                >
                  <Icon name="ImagePlus" size={20} color="#8B8D90" />
                </Pressable>
                <Pressable
                  onPress={handleOpenGifPicker}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Add GIF"
                  style={composerStyles.iconControl}
                >
                  {/* A text glyph, not an icon — it only lines up with its neighbours
                      because the box is sized explicitly rather than by padding. */}
                  <Text style={{ color: "#8B8D90", fontSize: 12, fontWeight: "700" }}>GIF</Text>
                </Pressable>
                <Pressable
                  onPress={handleOpenEmojiPicker}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Add emoji"
                  style={composerStyles.iconControl}
                >
                  <Icon name="Smile" size={20} color="#8B8D90" />
                </Pressable>
                <Pressable
                  onPress={handleStartRecording}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Record voice note"
                  style={composerStyles.iconControl}
                >
                  <Icon name="Mic" size={20} color="#8B8D90" />
                </Pressable>
              </View>
            )}
          </View>
        )}
      </View>

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

      <CommentContextMenu
        visible={contextComment !== null}
        comment={contextComment}
        layout={contextLayout}
        isReply={contextMeta?.isReply}
        isOwnComment={contextMeta?.isOwnComment ?? false}
        liked={contextMeta?.liked}
        canDelete={contextMeta?.isOwnComment}
        onClose={closeContextMenu}
        onReply={handleContextReply}
        onEdit={contextMeta?.isOwnComment ? handleContextEdit : undefined}
        onDelete={contextMeta?.isOwnComment ? handleContextDelete : undefined}
        onAnchor={
          contextMeta?.isOwnComment && !contextMeta?.isReply && canAnchor
            ? handleContextAnchor
            : undefined
        }
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
};

export const CommentSection = memo(CommentSectionComponent);
export default CommentSection;
