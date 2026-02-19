/**
 * CommentSection - Instagram-style comment section
 * 
 * Displays comments with replies, like functionality, and input for new comments.
 * Supports pagination and reply functionality (can't reply to replies).
 * Replies are rendered inline with indentation like the Feed version.
 */
import React, { memo, useCallback, useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CommentItem from "./CommentItem";
import CommentContextMenu from "./CommentContextMenu";
import type { CommentLayout } from "./CommentContextMenu";
import Avatar from "../common/Avatar";
import { useAuth, useAuthActions } from "../../context/AuthContext";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import {
  getCommentsForToken,
  postComment,
  likeComment,
  editComment,
  deleteComment,
  Comment,
} from "../../services/nft.service";
import { getAvatarUrl, toastError } from "../../libs";
import { theme } from "../../theme";
import useKeyboard from "../../hooks/useKeyboard";

// Extended comment type for flat list with reply info
interface FlatComment extends Comment {
  isReply?: boolean;
}

interface CommentSectionProps {
  tokenId: number | string;
  onClose?: () => void;
  highlightCommentId?: number | string;
  contentType?: "video" | "feed";
}

const PAGE_SIZE = 50;

const CommentSectionComponent: React.FC<CommentSectionProps> = ({
  tokenId,
  onClose,
  highlightCommentId,
  contentType = "video",
}) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { requireAuth } = useAuthActions();
  const { showUserProfile } = useUserProfileSheet();
  const inputRef = useRef<TextInput>(null);
  const { height: kbHeight, isVisible: kbVisible } = useKeyboard();

  // State - flat list of comments with replies inline
  const [flatComments, setFlatComments] = useState<FlatComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [highlightedId, setHighlightedId] = useState<number | null>(
    highlightCommentId != null ? Number(highlightCommentId) : null
  );

  // Input state
  const [inputText, setInputText] = useState("");
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [editingComment, setEditingComment] = useState<Comment | null>(null);
  const [posting, setPosting] = useState(false);

  // Context menu state (WhatsApp/IG-style long-press)
  const [contextComment, setContextComment] = useState<Comment | null>(null);
  const [contextLayout, setContextLayout] = useState<CommentLayout | null>(null);
  const [contextMeta, setContextMeta] = useState<{ liked: boolean; isOwnComment: boolean; isReply: boolean } | null>(null);

  const userAddress = user?.address || user?.walletAddress || undefined;
  const userAvatar = getAvatarUrl(user?.avatarImageUrl || "");

  // Keyboard lift for input
  const inputLift = kbVisible ? kbHeight : 0;

  // Build flat list with replies inline after their parent
  // If highlightCommentId is a reply, its parent is moved to the top with the
  // highlighted reply as the first child.
  const buildFlatComments = useCallback((rawComments: Comment[]): FlatComment[] => {
    // Create a set of all reply IDs
    const replyIdSet = new Set<number>();
    rawComments.forEach((c) => {
      if (Array.isArray(c.replyIds)) {
        c.replyIds.forEach((id) => replyIdSet.add(Number(id)));
      }
    });

    // Map by ID for quick lookup
    const byId = new Map<number, Comment>();
    rawComments.forEach((c) => byId.set(Number(c.id), c));

    // Get top-level comments (not in any replyIds)
    const topLevel = rawComments.filter((c) => !replyIdSet.has(Number(c.id)));

    // Determine if highlighted comment is a reply
    const hlId = highlightCommentId != null ? Number(highlightCommentId) : undefined;
    const hlIsReply = hlId != null && replyIdSet.has(hlId);
    let hlParentId: number | undefined;
    if (hlIsReply) {
      for (const c of rawComments) {
        if (Array.isArray(c.replyIds) && c.replyIds.map(Number).includes(hlId!)) {
          hlParentId = Number(c.id);
          break;
        }
      }
    }

    // Helper: emit a parent with its replies (highlighted reply first if applicable)
    const emitted = new Set<number>();
    const emitParent = (c: Comment, flat: FlatComment[]) => {
      const cId = Number(c.id);
      if (emitted.has(cId)) return;
      emitted.add(cId);
      flat.push({ ...c, isReply: false });
      if (Array.isArray(c.replyIds)) {
        const replyNums = c.replyIds.map(Number);
        // Emit highlighted reply first
        if (hlId != null && replyNums.includes(hlId)) {
          const hReply = byId.get(hlId);
          if (hReply && !emitted.has(hlId)) {
            emitted.add(hlId);
            flat.push({ ...hReply, isReply: true });
          }
        }
        // Remaining replies in original order
        for (const rid of c.replyIds) {
          const rId = Number(rid);
          if (emitted.has(rId)) continue;
          const reply = byId.get(rId);
          if (reply) {
            emitted.add(rId);
            flat.push({ ...reply, isReply: true });
          }
        }
      }
    };

    const flat: FlatComment[] = [];

    // If highlighted comment is a reply, emit its parent first
    if (hlIsReply && hlParentId != null) {
      const parent = byId.get(hlParentId);
      if (parent) emitParent(parent, flat);
    }

    // Emit remaining top-level comments
    topLevel.forEach((c) => emitParent(c, flat));

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
      console.log("commentid", highlightCommentId,"Loaded comments:", items); // --- IGNORE ---
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

  // Refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadComments(true);
    setRefreshing(false);
  }, [loadComments]);

  // Like a comment - returns the result for optimistic sync
  const handleLikeComment = useCallback(async (commentId: number) => {
    if (!requireAuth) return;
    
    return await requireAuth(async () => {
      return await likeComment({ commentId });
    });
  }, [requireAuth]);

  // Handle starting edit mode for a comment
  const handleStartEdit = useCallback((comment: Comment) => {
    setEditingComment(comment);
    setReplyingTo(null);
    setInputText(comment.content || "");
    inputRef.current?.focus();
  }, []);

  // Reply to a comment (only top-level)
  const handleReply = useCallback((comment: Comment) => {
    setReplyingTo(comment);
    setEditingComment(null);
    setInputText("");
    inputRef.current?.focus();
  }, []);

  // Cancel reply or edit
  const cancelReplyOrEdit = useCallback(() => {
    setReplyingTo(null);
    setEditingComment(null);
    setInputText("");
  }, []);

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
          Keyboard.dismiss();

          // Save edit to server
          await editComment({ commentId: editingComment.id, content: text });
        } else {
          // Optimistic update for new comment/reply
          const optimisticComment: FlatComment = {
            id: tempId,
            content: text,
            updatedAt: now,
            createdAt: now,
            user: {
              username: user?.username,
              displayName: user?.displayName,
              avatarImageUrl: user?.avatarImageUrl,
              address: userAddress,
            },
            likes: 0,
            isLiked: false,
            replyIds: [],
            isReply: !!replyingTo,
          };

          if (replyingTo) {
            // Insert reply after parent and its existing replies
            setFlatComments((prev) => {
              const parentIndex = prev.findIndex((c) => c.id === replyingTo.id);
              if (parentIndex === -1) return [...prev, optimisticComment];
              
              // Find where to insert (after parent and all its existing replies)
              let insertIndex = parentIndex + 1;
              while (insertIndex < prev.length && prev[insertIndex].isReply) {
                insertIndex++;
              }
              
              const newList = [...prev];
              newList.splice(insertIndex, 0, optimisticComment);
              return newList;
            });
          } else {
            // Prepend new top-level comment
            setFlatComments((prev) => [optimisticComment, ...prev]);
          }

          const replyToId = replyingTo?.id;
          setReplyingTo(null);
          setInputText("");
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
              prev.map((c) => (c.id === tempId ? { ...c, id: newId } : c))
            );
          }
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
        
        toastError(editingComment ? "Failed to edit comment" : "Failed to post comment");
      } finally {
        setPosting(false);
      }
    });
  }, [inputText, posting, requireAuth, tokenId, replyingTo, editingComment, loadComments, user, userAddress]);

  // Handle user press
  const handleUserPress = useCallback((userId: string) => {
    showUserProfile(userId);
  }, [showUserProfile]);

  // Long-press → open context menu
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

  // Context menu action: delete
  const handleContextDelete = useCallback(async () => {
    if (!contextComment) return;
    const commentId = contextComment.id;
    const wasReply = contextMeta?.isReply;
    // Optimistic removal
    setFlatComments((prev) => {
      if (wasReply) {
        return prev.filter((c) => c.id !== commentId);
      }
      // Top-level: remove comment and all its replies
      const idx = prev.findIndex((c) => c.id === commentId);
      if (idx === -1) return prev;
      let endIdx = idx + 1;
      while (endIdx < prev.length && prev[endIdx].isReply) endIdx++;
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

  // Render a single comment (either top-level or reply)
  const renderComment = useCallback(({ item }: { item: FlatComment }) => {
    const isHighlighted = highlightedId != null && Number(item.id) === highlightedId;
    return (
      <View className={item.isReply ? "pl-6" : ""}>
        <CommentItem
          comment={item}
          isReply={item.isReply}
          onReply={item.isReply ? undefined : handleReply}
          onLike={handleLikeComment}
          onUserPress={handleUserPress}
          onEdit={handleStartEdit}
          onLongPress={handleCommentLongPress}
          tokenId={tokenId}
          contentType={contentType}
          highlighted={isHighlighted}
        />
      </View>
    );
  }, [handleReply, handleLikeComment, handleUserPress, handleStartEdit, handleCommentLongPress, tokenId, contentType, highlightedId]);

  const keyExtractor = useCallback((item: FlatComment) => `comment-${item.id}`, []);

  // Calculate bottom padding for list to account for input
  const listBottomPadding = 88 + inputLift + (insets.bottom || 0);

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-theme-neutrals-800">
        <View className="w-10" />
        <Text className="text-base font-semibold text-theme-neutrals-100">
          Comments
        </Text>
        <TouchableOpacity onPress={onClose} activeOpacity={0.7} className="w-10 items-end">
          <Ionicons name="close" size={24} color={theme.colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* Comments list */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={theme.colors.accent} />
        </View>
      ) : (
        <FlatList
          data={flatComments}
          renderItem={renderComment}
          keyExtractor={keyExtractor}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: listBottomPadding }}
          keyboardShouldPersistTaps="handled"
          refreshing={refreshing}
          onRefresh={handleRefresh}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-12">
              <Text className="text-theme-neutrals-500 text-sm">
                No comments yet. Be the first!
              </Text>
            </View>
          }
        />
      )}

      {/* Input section - lifts with keyboard */}
      <View
        className="absolute left-0 right-0 bottom-0 border-t border-theme-neutrals-800 bg-theme-neutrals-900"
        style={{ marginBottom: inputLift, paddingBottom: insets.bottom || 8 }}
      >
        {/* Replying to / Editing indicator */}
        {(replyingTo || editingComment) && (
          <View className="flex-row items-center px-4 py-2 bg-theme-neutrals-800/50">
            <Text className="flex-1 text-xs text-theme-neutrals-400">
              {editingComment ? (
                "Editing comment"
              ) : (
                <>
                  Replying to{" "}
                  <Text className="font-semibold">
                    {replyingTo?.user?.displayName || replyingTo?.user?.username || "user"}
                  </Text>
                </>
              )}
            </Text>
            <TouchableOpacity onPress={cancelReplyOrEdit} activeOpacity={0.7}>
              <Ionicons name="close" size={18} color={theme.colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        )}

        {/* Input row */}
        <View className="flex-row items-center px-4 py-2">
          <Avatar
            uri={userAvatar && userAvatar !== "default-avatar" ? userAvatar : undefined}
            size={32}
          />
          <TextInput
            ref={inputRef}
            value={inputText}
            onChangeText={setInputText}
            placeholder={editingComment ? "Edit your comment..." : replyingTo ? "Write a reply..." : "Add a comment..."}
            placeholderTextColor={theme.colors.mutedForeground}
            className="flex-1 mx-3 text-sm text-theme-neutrals-100"
            style={{ maxHeight: 80 }}
            multiline
            returnKeyType="send"
            onSubmitEditing={handlePost}
          />
          <TouchableOpacity
            onPress={handlePost}
            disabled={posting || !inputText.trim()}
            activeOpacity={0.7}
            className="p-2"
          >
            {posting ? (
              <ActivityIndicator size="small" color={theme.colors.accent} />
            ) : (
              <Ionicons
                name="send"
                size={24}
                color={inputText.trim() ? theme.colors.accent : theme.colors.mutedForeground}
              />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* WhatsApp/IG-style context menu overlay */}
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
        onLike={handleContextLike}
        tokenId={tokenId}
      />
    </View>
  );
};

export const CommentSection = memo(CommentSectionComponent);
export default CommentSection;
