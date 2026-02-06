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
import { getNFT, type Comment, likeComment, type LikeCommentResult } from "../services/nft.service";
import { followUser, unfollowUser } from "../services/user.service";
import HomeFeedCard from "../components/Home/HomeFeedCard";
import { CommentItem } from "../components/Comments";
import CommentInput, { type CommentInputRef } from "../components/Feed/CommentInput";
import CommentsSkeleton from "../components/Feed/CommentsSkeleton";
import HomeFeedCardSkeleton from "../components/Home/HomeFeedCardSkeleton";
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
  const [highlightedCommentId, setHighlightedCommentId] = useState<number | null>(null);
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [isFollowRequestPending, setIsFollowRequestPending] = useState<boolean>(false);
  const [followLoading, setFollowLoading] = useState<boolean>(false);

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
      
      setPrivateError(false);
      
      // Set the feed item
      setItem(payload as UnifiedFeedItem);
      
      // Set isFollowing from response
      setIsFollowing(!!(payload as any).isFollowing);
      setIsFollowRequestPending(!!(payload as any).isFollowRequestPending);
      
      // Extract comments from the response
      const rawComments: Comment[] = Array.isArray((payload as any)?.comments) ? (payload as any).comments : [];
      
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
      
      const flat: Comment[] = [];
      topLevel.forEach((c) => {
        flat.push(c);
        // Add replies after parent
        if (Array.isArray(c?.replyIds)) {
          c.replyIds.forEach((rid) => {
            const reply = byId.get(Number(rid));
            if (reply) {
              flat.push({ ...reply, parentId: c.id });
            }
          });
        }
      });
      
      setComments(flat);
      
      // Check if first comment should be highlighted (shared comment link)
      if (commentIdParam && flat.length > 0) {
        const firstComment = flat[0];
        if (firstComment && !firstComment.notFound && String(firstComment.id) === String(commentIdParam)) {
          setHighlightedCommentId(Number(firstComment.id));
          // Clear highlight after animation completes (about 2.5 seconds)
          setTimeout(() => setHighlightedCommentId(null), 3000);
        }
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
      const isHighlighted = highlightedCommentId === c.id;
      
      return (
        <View className={`px-8${isReply ? " mx-4" : ""}`}>
          <CommentItem
            comment={c}
            isReply={isReply}
            onUserPress={handleUserPress}
            onReply={handleReplyPress}
            onLike={handleLikeComment}
            tokenId={tokenId}
            contentType="feed"
            highlighted={isHighlighted}
          />
        </View>
      );
    },
    [handleReplyPress, handleUserPress, handleLikeComment, tokenId, highlightedCommentId]
  );

  const handleSend = useCallback((text: string) => {
    if (!text || tokenId == null) return;
    requireAuth?.(async () => {
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
        const { postComment } = await import("../services/nft.service");
        const payload = { 
          streamTokenId: tokenId, 
          content: text, 
          commentId: replyTarget?.id 
        };
        const res = await postComment(payload);
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
  }, [requireAuth, tokenId, replyTo, user]);

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
        <View className="px-8 pt-3">
          <HomeFeedCardSkeleton />
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
      />
      <View
        className="border-t border-theme-neutrals-800"
        style={inputLift ? { marginBottom: inputLift } : undefined}
      >
        <CommentInput
          ref={inputRef}
          onSend={handleSend}
          placeholder={replyTo ? "Write a reply..." : "Add a comment..."}
          autoFocus={false}
          replyToLabel={replyTo?.user?.displayName || replyTo?.user?.username}
          onCancelReply={() => setReplyTo(null)}
          userAvatarUrl={userAvatarUrl}
        />
      </View>
    </View>
  );
}
