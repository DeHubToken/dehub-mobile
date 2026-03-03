import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator, Keyboard, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRoute, useNavigation } from "@react-navigation/native";
import ScreenHeader from "../components/ScreenHeader";
import { getNFT, type Comment, likeComment, type LikeCommentResult, postComment, editComment, deleteComment, postImageComment, postGifComment, postAudioComment } from "../services/nft.service";
import { followUser, unfollowUser } from "../services/user.service";
import HomeFeedCard from "../components/Home/HomeFeedCard";
import { CommentItem } from "../components/Comments";
import CommentContextMenu from "../components/Comments/CommentContextMenu";
import type { CommentLayout } from "../components/Comments/CommentContextMenu";
import CommentMediaPreview from "../components/Comments/CommentMediaPreview";
import type { MediaAttachment } from "../components/Comments/CommentMediaPreview";
import { useVoiceRecorder, VoiceNoteRecordingOverlay } from "../components/Comments/VoiceNoteRecorder";
import type { VoiceNoteResult } from "../components/Comments/VoiceNoteRecorder";
import GifPicker from "../components/DM/GifPicker";
import Avatar from "../components/common/Avatar";
import MentionSuggestions from "../components/common/MentionSuggestions";
import CommentsSkeleton from "../components/Feed/CommentsSkeleton";
import { useAuth } from "../context/AuthContext";
import useKeyboard from "../hooks/useKeyboard";
import { useMentions } from "../hooks/useMentions";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import type { UnifiedFeedItem } from "../services/feed.unified.service";
import { getAvatarUrl, toastError } from "../libs";
import { openCroppedImagePicker, getFileName, guessMime } from "../libs/assets.util";
import { theme } from "../theme";
import { formatCompactNumber } from "../libs/numbers.util";
import { ScreenNames } from "../navigation/ScreenNames";

export default function FeedDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  
  // Get params - tokenId and optional commentId for highlighting
  const tokenId: number | string | undefined = route?.params?.tokenId ?? route?.params?.id ?? route?.params?.postId;
  const commentIdParam: number | string | undefined = route?.params?.commentId ?? route?.params?.c;
  
  const { user, requireAuth } = useAuth();
  const address = useMemo(() => user?.walletAddress || user?.address || undefined, [user?.walletAddress, user?.address]);

  const [loading, setLoading] = useState(true);
  const [privateError, setPrivateError] = useState(false);
  const [item, setItem] = useState<UnifiedFeedItem | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [editingComment, setEditingComment] = useState<Comment | null>(null);
  const [inputText, setInputText] = useState("");
  const mentions = useMentions(inputText, setInputText);
  const [posting, setPosting] = useState(false);
  const [highlightedCommentId, setHighlightedCommentId] = useState<number | null>(null);

  // Media attachment state
  const [mediaAttachment, setMediaAttachment] = useState<MediaAttachment | null>(null);
  const [mediaPosting, setMediaPosting] = useState(false);
  const [gifPickerVisible, setGifPickerVisible] = useState(false);
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [isFollowRequestPending, setIsFollowRequestPending] = useState<boolean>(false);
  const [followLoading, setFollowLoading] = useState<boolean>(false);

  // Context menu state
  const [contextComment, setContextComment] = useState<Comment | null>(null);
  const [contextLayout, setContextLayout] = useState<CommentLayout | null>(null);
  const [contextMeta, setContextMeta] = useState<{ liked: boolean; isOwnComment: boolean; isReply: boolean } | null>(null);

  const inputRef = useRef<TextInput>(null);
  const { height: kbHeight, isVisible: kbVisible } = useKeyboard();
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

  const handleRemoveMedia = useCallback(() => {
    setMediaAttachment(null);
  }, []);

  const inputLift = useMemo(() => {
    return kbVisible ? kbHeight : 0;
  }, [kbHeight, kbVisible]);

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
      
      // Set isFollowing from response
      setIsFollowing(!!(payload as any).isFollowing);
      setIsFollowRequestPending(!!(payload as any).isFollowRequestPending);
      
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
      
      // Build reply mapping - find which comments are replies
      const replyIdSet = new Set<number>();
      rawComments.forEach((c) => {
        if (Array.isArray(c?.replyIds)) {
          c.replyIds.forEach((id) => replyIdSet.add(Number(id)));
        }
      });
      
      // Separate top-level and replies, flatten with replies under their parents
      const byId = new Map<number, Comment>();
      rawComments.forEach((c) => byId.set(Number(c?.id), c));
      const topLevel = rawComments.filter((c) => !replyIdSet.has(Number(c?.id)));
      
      // Determine if highlighted comment is a reply so we can expand its parent
      const highlightId = commentIdParam ? Number(commentIdParam) : undefined;
      const highlightIsReply = highlightId != null && replyIdSet.has(highlightId);
      // Find parent of highlighted reply
      let highlightParentId: number | undefined;
      if (highlightIsReply) {
        for (const c of rawComments) {
          if (Array.isArray(c?.replyIds) && c.replyIds.map(Number).includes(highlightId!)) {
            highlightParentId = Number(c.id);
            break;
          }
        }
      }
      
      // Helper: emit a parent with its replies (highlighted reply first if applicable)
      const emitted = new Set<number>();
      const emitParentWithReplies = (c: Comment, flat: Comment[]) => {
        const cId = Number(c?.id);
        if (emitted.has(cId)) return;
        emitted.add(cId);
        flat.push(c);
        if (Array.isArray(c?.replyIds)) {
          // If this parent owns the highlighted reply, emit that reply first
          const replyNums = c.replyIds.map(Number);
          if (highlightId != null && replyNums.includes(highlightId)) {
            const hReply = byId.get(highlightId);
            if (hReply && !emitted.has(highlightId)) {
              emitted.add(highlightId);
              flat.push({ ...hReply, parentId: c.id });
            }
          }
          // Then remaining replies in original order
          for (const rid of c.replyIds) {
            const rId = Number(rid);
            if (emitted.has(rId)) continue;
            const reply = byId.get(rId);
            if (reply) {
              emitted.add(rId);
              flat.push({ ...reply, parentId: c.id });
            }
          }
        }
      };
      
      const flat: Comment[] = [];
      
      // If highlighted comment is a reply, emit its parent + replies first
      if (highlightIsReply && highlightParentId != null) {
        const parent = byId.get(highlightParentId);
        if (parent) emitParentWithReplies(parent, flat);
      }
      
      // Emit remaining top-level comments
      topLevel.forEach((c) => emitParentWithReplies(c, flat));
      
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
    setReplyTo(cm);
    setEditingComment(null);
    setInputText("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleLikeComment = useCallback(async (commentId: number): Promise<LikeCommentResult | void> => {
    if (!address) return;
    try {
      const result = await likeComment({ commentId });
      return result;
    } catch (e) {
      console.error("[FeedDetailScreen] likeComment error", e);
    }
  }, [address]);


  const handleCommentLongPress = useCallback(
    (comment: Comment, layout: CommentLayout, extra: { liked: boolean; isOwnComment: boolean; isReply: boolean }) => {
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

  const handleContextDelete = useCallback(async () => {
    if (!contextComment) return;
    const commentId = contextComment.id;
    const wasReply = contextMeta?.isReply;
    // Optimistic removal
    setComments((prev) => {
      if (wasReply) {
        return prev.filter((c) => c.id !== commentId);
      }
      // Top-level: remove comment and all its replies (consecutive replies after it)
      const idx = prev.findIndex((c) => c.id === commentId);
      if (idx === -1) return prev;
      let endIdx = idx + 1;
      while (endIdx < prev.length && prev[endIdx].parentId != null) endIdx++;
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
  }, [contextComment, contextMeta, fetchData]);

  // Get creator address from item
  const creatorAddress = useMemo(() => {
    if (!item) return "";
    const minterUser = item.minterUser;
    return minterUser?.address || item.minter || item.owner || "";
  }, [item]);

  // Check if current user is the owner (don't show follow button for own posts)
  const isOwner = useMemo(() => {
    if (!address || !creatorAddress) return false;
    return address.toLowerCase() === creatorAddress.toLowerCase();
  }, [address, creatorAddress]);

  // Handle follow/unfollow
  const handleFollowPress = useCallback(() => {
    if (!address || !creatorAddress || isOwner) return;
    
    // If pending, cancel the request
    if (isFollowRequestPending) {
      requireAuth?.(async () => {
        setFollowLoading(true);
        setIsFollowRequestPending(false);
        try {
          await unfollowUser(address.toLowerCase(), creatorAddress.toLowerCase());
        } catch (e) {
          setIsFollowRequestPending(true);
          toastError("Failed to cancel request");
          console.error("[FeedDetailScreen] cancel request error", e);
        } finally {
          setFollowLoading(false);
        }
      });
      return;
    }

    requireAuth?.(async () => {
      // Optimistic update
      const wasFollowing = isFollowing;
      setIsFollowing(!wasFollowing);
      setFollowLoading(true);
      
      try {
        if (wasFollowing) {
          await unfollowUser(address.toLowerCase(), creatorAddress.toLowerCase());
        } else {
          const res = await followUser(address.toLowerCase(), creatorAddress.toLowerCase());
          // If private account → pending request
          if (res.status === 'pending') {
            setIsFollowing(false);
            setIsFollowRequestPending(true);
          }
        }
      } catch (e) {
        // Revert on error
        setIsFollowing(wasFollowing);
        toastError(wasFollowing ? "Failed to unfollow" : "Failed to follow");
        console.error("[FeedDetailScreen] follow error", e);
      } finally {
        setFollowLoading(false);
      }
    });
  }, [address, creatorAddress, isOwner, isFollowing, isFollowRequestPending, requireAuth]);

  const renderCommentItem = useCallback(
    ({ item: c }: { item: Comment }) => {
      const isReply = !!c.parentId;
      const isHighlighted = highlightedCommentId != null && String(c.id) === String(highlightedCommentId);
      
      return (
        <View className={`px-8${isReply ? " mx-4" : ""}`}>
          <CommentItem
            comment={c}
            isReply={isReply}
            onUserPress={handleUserPress}
            onReply={handleReplyPress}
            onLike={handleLikeComment}
            onLongPress={handleCommentLongPress}
            tokenId={tokenId}
            contentType="feed"
            highlighted={isHighlighted}
          />
        </View>
      );
    },
    [handleReplyPress, handleUserPress, handleLikeComment, handleCommentLongPress, tokenId, highlightedCommentId]
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
      setComments((prev) => {
        if (replyTo?.id) {
          const idx = prev.findIndex((c) => c.id === replyTo.id);
          if (idx >= 0) {
            const next = [...prev];
            next.splice(idx + 1, 0, optimistic);
            return next;
          }
        }
        return [optimistic, ...prev];
      });

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
  }, [mediaAttachment, mediaPosting, requireAuth, tokenId, replyTo, user]);

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
        
        setComments((prev) => {
          if (replyTo?.id) {
            const idx = prev.findIndex((c) => c.id === replyTo.id);
            if (idx >= 0) {
              const next = [...prev];
              next.splice(idx + 1, 0, tempComment);
              return next;
            }
          }
          return [tempComment, ...prev];
        });
        
        const replyTarget = replyTo;
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
            if (!replyTarget) {
              setItem((prev) => prev ? { 
                ...prev, 
                commentCount: Math.max(0, (prev.commentCount ?? 0) + 1) 
              } : prev);
            }
          }
        } catch (e) {
          setComments((prev) => prev.filter((c) => c.id !== tempId));
          console.error("[FeedDetailScreen] postComment error", e);
        }
      } finally {
        setPosting(false);
      }
    });
  }, [inputText, posting, requireAuth, tokenId, replyTo, editingComment, user, fetchData]);

  const renderHeader = useCallback(() => (
    <View>
      <ScreenHeader title="Post" />
      {item ? (
        <View className="px-8">
          <HomeFeedCard 
            item={item} 
            fullContent 
            disablePress
            onCommentPress={focusCommentInput}
            showFollowButton={!isOwner}
            isFollowing={isFollowing}
            isFollowRequestPending={isFollowRequestPending}
            followLoading={followLoading}
            onFollowPress={handleFollowPress}
          />
        </View>
      ) : loading ? (
        <View className="px-8 pt-4">
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
        <View className="flex-row items-center px-8 pt-3 pb-1 gap-4">
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
      <View className="px-8 pt-2 pb-1">
        <Text className="text-theme-neutrals-400 text-xs font-medium">
          {comments.length > 0 ? `${comments.length} Comment${comments.length !== 1 ? "s" : ""}` : "Comments"}
        </Text>
      </View>
    </View>
  ), [item, loading, privateError, navigation, comments.length, focusCommentInput, isOwner, isFollowing, isFollowRequestPending, followLoading, handleFollowPress]);

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <FlatList
        data={comments}
        keyExtractor={(c) => String(c.id)}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={!loading ? (
          <View className="px-8 py-6">
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
      />
      <View
        className="absolute left-0 right-0 bottom-0 border-t border-theme-neutrals-800 bg-theme-neutrals-900"
        style={{ marginBottom: inputLift, paddingBottom: 8 }}
      >
        {/* Replying / Editing indicator */}
        {(replyTo || editingComment) && !recorder.isRecording && (
          <View className="flex-row items-center px-4 py-2 bg-theme-neutrals-800/50">
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
          <View className="flex-row items-center px-4 py-2">
            <Avatar
              uri={userAvatar && userAvatar !== "default-avatar" ? userAvatar : undefined}
              size={32}
            />
            <TextInput
              ref={inputRef}
              value={inputText}
              onChangeText={mentions.handleChangeText}
              onSelectionChange={mentions.handleSelectionChange}
              placeholder={editingComment ? "Edit your comment..." : replyTo ? "Write a reply..." : "Add a comment..."}
              placeholderTextColor={theme.colors.mutedForeground}
              className="flex-1 mx-3 text-sm text-theme-neutrals-100"
              style={{ maxHeight: 80 }}
              multiline
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />

            {inputText.trim() || editingComment ? (
              <TouchableOpacity
                onPress={handleSend}
                disabled={posting || !inputText.trim()}
                activeOpacity={0.7}
                className="p-2"
              >
                {posting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <View
                    className={`w-9 h-9 rounded-full items-center justify-center ${inputText.trim() ? "bg-white" : "bg-theme-neutrals-700"}`}
                  >
                    <Ionicons
                      name="send"
                      size={16}
                      color={inputText.trim() ? "#000" : theme.colors.mutedForeground}
                    />
                  </View>
                )}
              </TouchableOpacity>
            ) : (
              <View className="flex-row items-center gap-1">
                <TouchableOpacity onPress={handlePickImage} activeOpacity={0.7} className="p-2">
                  <Ionicons name="image-outline" size={22} color={theme.colors.mutedForeground} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleOpenGifPicker} activeOpacity={0.7} className="p-2">
                  <Text className="text-xs font-bold text-theme-neutrals-400 px-0.5">GIF</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    Keyboard.dismiss();
                    recorder.startRecording();
                  }}
                  activeOpacity={0.7}
                  className="p-2"
                >
                  <Ionicons name="mic-outline" size={22} color={theme.colors.mutedForeground} />
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

      {/* WhatsApp/IG-style context menu */}
      <CommentContextMenu
        visible={contextComment !== null}
        comment={contextComment}
        layout={contextLayout}
        isReply={contextMeta?.isReply}
        isOwnComment={contextMeta?.isOwnComment ?? false}
        liked={contextMeta?.liked}
        canDelete={contextMeta?.isOwnComment}
        onClose={closeContextMenu}
        onReply={contextMeta?.isReply ? undefined : handleContextReply}
        onEdit={contextMeta?.isOwnComment ? handleContextEdit : undefined}
        onDelete={contextMeta?.isOwnComment ? handleContextDelete : undefined}
        tokenId={tokenId}
      />
    </View>
  );
}
