/**
 * FeedDetailScreen - Full feed post detail with comments
 * 
 * Shows a full-length feed card (no truncation) with a comments section below.
 * Supports shared comment highlighting via commentId param.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRoute, useNavigation } from "@react-navigation/native";
import ScreenHeader from "../components/ScreenHeader";
import { getNFT, type Comment, likeComment, type LikeCommentResult, postComment, editComment, deleteComment } from "../services/nft.service";
import { followUser, unfollowUser } from "../services/user.service";
import HomeFeedCard from "../components/Home/HomeFeedCard";
import { CommentItem } from "../components/Comments";
import CommentContextMenu from "../components/Comments/CommentContextMenu";
import type { CommentLayout } from "../components/Comments/CommentContextMenu";
import CommentInput, { type CommentInputRef } from "../components/Feed/CommentInput";
import CommentsSkeleton from "../components/Feed/CommentsSkeleton";
import { useAuth } from "../context/AuthContext";
import useKeyboard from "../hooks/useKeyboard";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import type { UnifiedFeedItem } from "../services/feed.unified.service";
import { getAvatarUrl, toastError } from "../libs";

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
  const [highlightedCommentId, setHighlightedCommentId] = useState<number | null>(null);
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [isFollowRequestPending, setIsFollowRequestPending] = useState<boolean>(false);
  const [followLoading, setFollowLoading] = useState<boolean>(false);

  // Context menu state
  const [contextComment, setContextComment] = useState<Comment | null>(null);
  const [contextLayout, setContextLayout] = useState<CommentLayout | null>(null);
  const [contextMeta, setContextMeta] = useState<{ liked: boolean; isOwnComment: boolean; isReply: boolean } | null>(null);

  const inputRef = useRef<CommentInputRef>(null);
  const { height: kbHeight, isVisible: kbVisible } = useKeyboard();
  const { showUserProfile } = useUserProfileSheet();

  // User avatar for comment input
  const userAvatarUrl = useMemo(() => 
    user?.avatarImageUrl || user?.avatarUrl || "",
    [user?.avatarImageUrl, user?.avatarUrl]
  );

  // Focus the comment input
  const focusCommentInput = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
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
      
      // Extract comments from the response
      const rawCommentsRaw: Comment[] = Array.isArray((payload as any)?.comments) ? (payload as any).comments : [];
      
      // Deduplicate raw comments by id FIRST — the API may return the highlighted
      // comment twice: once unpopulated (user is a plain ObjectId string) at position 0,
      // then again populated (user is an object) in its normal position.
      // Keep the version with a richer user object.
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

  // ── Context menu handlers ────────────────────────────────────────────────

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
    inputRef.current?.setText(contextComment.content || "");
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

  const handleSend = useCallback((text: string) => {
    if (!text || tokenId == null) return;
    requireAuth?.(async () => {
      // Handle edit mode
      if (editingComment) {
        const commentId = editingComment.id;
        // Optimistic update
        setComments((prev) =>
          prev.map((c) => (c.id === commentId ? { ...c, content: text } : c))
        );
        setEditingComment(null);
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
      
      // Optimistic insert: after parent if reply, else prepend
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
      
      try {
        const res = await postComment({
          streamTokenId: tokenId,
          content: text,
          commentId: replyTarget?.id,
        });
        const newId = res?.result?.id ?? (res as any)?.id ?? undefined;
        
        if (newId != null) {
          setComments((prev) => prev.map((c) => (c.id === tempId ? { ...c, id: newId } : c)));
          // Bump count for top-level only
          if (!replyTarget) {
            setItem((prev) => prev ? { 
              ...prev, 
              commentCount: Math.max(0, (prev.commentCount ?? 0) + 1) 
            } : prev);
          }
        }
      } catch (e) {
        // Revert
        setComments((prev) => prev.filter((c) => c.id !== tempId));
        console.error("[FeedDetailScreen] postComment error", e);
      }
    });
  }, [requireAuth, tokenId, replyTo, editingComment, user, fetchData]);

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
            onCategorySelect={(cat) => {
              navigation.goBack();
            }}
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
        className="border-t border-theme-neutrals-800"
        style={inputLift ? { marginBottom: inputLift } : undefined}
      >
        <CommentInput
          ref={inputRef}
          onSend={handleSend}
          placeholder={editingComment ? "Edit your comment..." : replyTo ? "Write a reply..." : "Add a comment..."}
          autoFocus={false}
          replyToLabel={replyTo?.user?.displayName || replyTo?.user?.username}
          onCancelReply={() => setReplyTo(null)}
          editingLabel={editingComment ? "Editing comment" : undefined}
          onCancelEdit={() => { setEditingComment(null); inputRef.current?.clear(); }}
          userAvatarUrl={userAvatarUrl}
        />
      </View>

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
