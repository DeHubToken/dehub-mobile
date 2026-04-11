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
} from "react-native";
import Icon from "../ui/Icon";
import CommentItem from "./CommentItem";
import CommentContextMenu from "./CommentContextMenu";
import type { CommentLayout } from "./CommentContextMenu";
import CommentMediaPreview from "./CommentMediaPreview";
import type { MediaAttachment } from "./CommentMediaPreview";
import { useVoiceRecorder, VoiceNoteRecordingOverlay } from "./VoiceNoteRecorder";
import type { VoiceNoteResult } from "./VoiceNoteRecorder";
import GifPicker from "../DM/GifPicker";
import Avatar from "../common/Avatar";
import MentionSuggestions from "../common/MentionSuggestions";
import { useUser, useAuthActions } from "../../context/AuthContext";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import {
  getCommentsForToken,
  postComment,
  likeComment,
  editComment,
  deleteComment,
  postImageComment,
  postGifComment,
  postAudioComment,
  Comment,
} from "../../services/nft.service";
import { getAvatarUrl, toastError } from "../../libs";
import { openCroppedImagePicker, getFileName, guessMime } from "../../libs/assets.util";
import useKeyboard from "../../hooks/useKeyboard";
import { useMentions } from "../../hooks/useMentions";

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
  const user = useUser();
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
  const mentions = useMentions(inputText, setInputText);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [editingComment, setEditingComment] = useState<Comment | null>(null);
  const [posting, setPosting] = useState(false);

  // Context menu state (WhatsApp/IG-style long-press)
  const [contextComment, setContextComment] = useState<Comment | null>(null);
  const [contextLayout, setContextLayout] = useState<CommentLayout | null>(null);
  const [contextMeta, setContextMeta] = useState<{ liked: boolean; isOwnComment: boolean; isReply: boolean } | null>(null);

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
      const replyToId = replyingTo?.id;

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
        isReply: !!replyingTo,
        // Optimistic media fields
        imageUrl: mediaAttachment.type === "image" ? mediaAttachment.uri : undefined,
        gifUrl: mediaAttachment.type === "gif" ? mediaAttachment.url : undefined,
        audioUrl: mediaAttachment.type === "audio" ? mediaAttachment.uri : undefined,
        audioDuration: mediaAttachment.type === "audio" ? Math.round(mediaAttachment.durationMs / 1000) : undefined,
      };

      // Insert optimistically
      if (replyingTo) {
        setFlatComments((prev) => {
          const parentIndex = prev.findIndex((c) => c.id === replyingTo.id);
          if (parentIndex === -1) return [...prev, optimistic];
          let insertIndex = parentIndex + 1;
          while (insertIndex < prev.length && prev[insertIndex].isReply) insertIndex++;
          const newList = [...prev];
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

        // Reconcile temp ID
        if (newId != null) {
          setFlatComments((prev) =>
            prev.map((c) => (c.id === tempId ? { ...c, id: newId! } : c))
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
  const listBottomPadding = 88 + inputLift;

  return (
    <View style={{ flex: 1 }}>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#3B82F6" />
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
            <View className="flex-1 items-center justify-center py-16">
              <Text style={{ color: "#8B8D90", fontSize: 14 }}>
                No replies yet. Be the first!
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
          backgroundColor: "rgba(30,30,30,0.8)",
          marginBottom: inputLift,
          paddingBottom: 8,
        }}
      >
        {(replyingTo || editingComment) && !recorder.isRecording && (
          <View className="flex-row items-center px-4 py-2" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
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
          <View className="flex-row items-end px-3 py-2" style={{ gap: 8 }}>
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "flex-end",
                backgroundColor: "rgba(255,255,255,0.06)",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
                paddingHorizontal: 12,
                paddingVertical: 8,
                minHeight: 44,
              }}
            >
              <TextInput
                ref={inputRef}
                value={inputText}
                onChangeText={mentions.handleChangeText}
                onSelectionChange={mentions.handleSelectionChange}
                placeholder={editingComment ? "Edit your comment..." : replyingTo ? "Write a reply..." : "Add a reply..."}
                placeholderTextColor="#6F7174"
                style={{ flex: 1, color: "#F9FBFF", fontSize: 14, maxHeight: 80, paddingVertical: 0 }}
                maxLength={500}
                multiline
              />
            </View>

            {inputText.trim() || editingComment ? (
              <Pressable
                onPress={handlePost}
                disabled={posting || !inputText.trim()}
                style={{
                  backgroundColor: inputText.trim() ? "#F9FBFF" : "rgba(255,255,255,0.1)",
                  borderRadius: 10,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                }}
              >
                {posting ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Text style={{ color: inputText.trim() ? "#010305" : "#6F7174", fontSize: 14, fontWeight: "600" }}>Post</Text>
                )}
              </Pressable>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Pressable
                  onPress={handlePickImage}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ padding: 8, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 10 }}
                >
                  <Icon name="ImagePlus" size={20} color="#8B8D90" />
                </Pressable>
                <Pressable
                  onPress={handleOpenGifPicker}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ padding: 8, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 10 }}
                >
                  <Text style={{ color: "#8B8D90", fontSize: 12, fontWeight: "700" }}>GIF</Text>
                </Pressable>
                <Pressable
                  onPress={handleStartRecording}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ padding: 8, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 10 }}
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
