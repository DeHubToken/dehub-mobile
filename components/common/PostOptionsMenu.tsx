/**
 * PostOptionsMenu - Liquid glass action sheet for post/video options
 *
 * Shows contextual actions:
 * - Everyone: Follow/Unfollow, Report
 * - Owner only: Edit, Hide/Show, Delete
 *
 * Uses GlassModal for the blurred glass aesthetic.
 */
import React, { memo, useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import GlassModal from "../ui/GlassModal";
import ConfirmModal from "./ConfirmModal";
import ConfirmBlockModal from "./ConfirmBlockModal";
import EditPostModal from "./EditPostModal";
import ReportModal from "./ReportModal";
import {
  editPost,
  togglePostVisibility,
  deletePost,
} from "../../services/nft.service";
import { followUser, unfollowUser } from "../../services/user.service";
import { blockUser, unblockUser } from "../../services/block.service";
import { useAuth, useAuthActions } from "../../context/AuthContext";
import { toastSuccess, toastError } from "../../libs";
import { WEBSITE_LINK } from "../../config";

export interface PostOptionsMenuProps {
  visible: boolean;
  onClose: () => void;
  /** Token ID of the post */
  tokenId: number | string | undefined;
  /** Whether the current viewer owns this post */
  isOwner: boolean;
  /** Whether the post is currently hidden */
  isHidden: boolean;
  /** Creator's display name */
  creatorDisplayName: string;
  /** Creator's username or address for follow actions */
  creatorIdentifier: string;
  /** Whether the viewer already follows the creator */
  isFollowing: boolean;
  /** Whether a follow request is pending */
  isFollowRequestPending?: boolean;
  /** Current title (for edit) */
  currentTitle?: string;
  /** Current description (for edit) */
  currentDescription?: string;
  /** Current categories (for edit) */
  currentCategories?: string[];
  /** Called after a successful follow/unfollow to update parent state */
  onFollowChange?: (following: boolean, pending?: boolean) => void;
  /** Called after visibility toggle to update parent state */
  onVisibilityChange?: (isHidden: boolean) => void;
  /** Called after edit success to update parent state */
  onEditSuccess?: (data: { name?: string; description?: string; category?: string[] }) => void;
  /** Called after delete success */
  onDeleteSuccess?: () => void;
  /** Whether the viewer has blocked the creator */
  isBlocked?: boolean;
  /** Called after block/unblock to update parent state */
  onBlockChange?: (blocked: boolean) => void;
  /** Hide the report content option (e.g., for livestreams) */
  hideReportContent?: boolean;
  /** Hide the edit option (e.g., for livestreams) */
  hideEdit?: boolean;
}

interface OptionRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel?: string;
  color?: string;
  loading?: boolean;
  onPress: () => void;
}

const OptionRow: React.FC<OptionRowProps> = memo(
  ({ icon, label, sublabel, color = "#E5E7EB", loading, onPress }) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.7}
      className="flex-row items-center px-5 py-3.5"
    >
      <View className="w-10 h-10 rounded-full bg-white/10 items-center justify-center mr-3">
        {loading ? (
          <ActivityIndicator size="small" color={color} />
        ) : (
          <Ionicons name={icon} size={18} color={color} />
        )}
      </View>
      <View className="flex-1">
        <Text style={{ color }} className="text-[15px] font-medium">
          {label}
        </Text>
        {sublabel ? (
          <Text className="text-theme-neutrals-500 text-xs mt-0.5">{sublabel}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  )
);

const PostOptionsMenuComponent: React.FC<PostOptionsMenuProps> = ({
  visible,
  onClose,
  tokenId,
  isOwner,
  isHidden,
  creatorDisplayName,
  creatorIdentifier,
  isFollowing,
  isFollowRequestPending = false,
  currentTitle,
  currentDescription,
  currentCategories,
  onFollowChange,
  onVisibilityChange,
  onEditSuccess,
  onDeleteSuccess,
  isBlocked: isBlockedProp = false,
  onBlockChange,  hideReportContent = false,  hideEdit = false,}) => {
  const { user } = useAuth();
  const { requireAuth } = useAuthActions();

  // Sub-modal states
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showReportContent, setShowReportContent] = useState(false);
  const [showReportUser, setShowReportUser] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);

  // Loading states
  const [followLoading, setFollowLoading] = useState(false);
  const [visibilityLoading, setVisibilityLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);

  const handleFollowToggle = useCallback(() => {
    requireAuth?.(async () => {
      const viewer = (user?.walletAddress || user?.address || "").toLowerCase();
      const target = (creatorIdentifier || "").toLowerCase();
      if (!viewer || !target) return;

      setFollowLoading(true);
      try {
        if (isFollowing || isFollowRequestPending) {
          await unfollowUser(viewer, target);
          onFollowChange?.(false, false);
          toastSuccess(
            isFollowRequestPending
              ? "Follow request cancelled"
              : `Unfollowed ${creatorDisplayName}`
          );
        } else {
          const res = await followUser(viewer, target);
          if (res.status === "pending") {
            onFollowChange?.(false, true);
            toastSuccess("Follow request sent");
          } else {
            onFollowChange?.(true, false);
            toastSuccess(`Following ${creatorDisplayName}`);
          }
        }
      } catch (e) {
        console.error("[PostOptionsMenu] follow toggle error", e);
        toastError("Failed to update follow status");
      } finally {
        setFollowLoading(false);
        onClose();
      }
    });
  }, [
    user,
    creatorIdentifier,
    creatorDisplayName,
    isFollowing,
    isFollowRequestPending,
    requireAuth,
    onFollowChange,
    onClose,
  ]);

  const handleVisibilityToggle = useCallback(async () => {
    if (tokenId == null) return;
    setVisibilityLoading(true);
    try {
      await togglePostVisibility(tokenId, !isHidden);
      onVisibilityChange?.(!isHidden);
      toastSuccess(isHidden ? "Post is now visible" : "Post hidden from feeds");
    } catch (e) {
      console.error("[PostOptionsMenu] visibility toggle error", e);
      toastError("Failed to update visibility");
    } finally {
      setVisibilityLoading(false);
      onClose();
    }
  }, [tokenId, isHidden, onVisibilityChange, onClose]);

  const handleDeleteConfirm = useCallback(async () => {
    if (tokenId == null) return;
    setDeleteLoading(true);
    try {
      await deletePost(tokenId);
      toastSuccess("Post deleted");
      setShowDeleteConfirm(false);
      onDeleteSuccess?.();
      onClose();
    } catch (e) {
      console.error("[PostOptionsMenu] delete error", e);
      toastError("Failed to delete post");
    } finally {
      setDeleteLoading(false);
    }
  }, [tokenId, onDeleteSuccess, onClose]);

  const handleOpenEdit = useCallback(() => {
    onClose();
    // Small delay so the menu modal closes before edit opens
    setTimeout(() => setShowEdit(true), 200);
  }, [onClose]);

  const handleEditDone = useCallback(
    (data: { name?: string; description?: string; category?: string[] }) => {
      setShowEdit(false);
      onEditSuccess?.(data);
    },
    [onEditSuccess]
  );

  const handleOpenReportContent = useCallback(() => {
    requireAuth?.(() => {
      onClose();
      setTimeout(() => setShowReportContent(true), 200);
    });
  }, [onClose, requireAuth]);

  const handleOpenReportUser = useCallback(() => {
    requireAuth?.(() => {
      onClose();
      setTimeout(() => setShowReportUser(true), 200);
    });
  }, [onClose, requireAuth]);

  const handleOpenBlock = useCallback(() => {
    requireAuth?.(() => {
      onClose();
      setTimeout(() => setShowBlockConfirm(true), 200);
    });
  }, [onClose, requireAuth]);

  const handleConfirmBlock = useCallback(async () => {
    if (!creatorIdentifier) return;
    setBlockLoading(true);
    try {
      if (isBlockedProp) {
        await unblockUser(creatorIdentifier);
        onBlockChange?.(false);
        toastSuccess(`Unblocked ${creatorDisplayName}`);
      } else {
        await blockUser(creatorIdentifier);
        onBlockChange?.(true);
        toastSuccess(`Blocked ${creatorDisplayName}`);
      }
    } catch (e) {
      console.error("[PostOptionsMenu] block toggle error", e);
      toastError(isBlockedProp ? "Failed to unblock user" : "Failed to block user");
    } finally {
      setBlockLoading(false);
      setShowBlockConfirm(false);
    }
  }, [creatorIdentifier, creatorDisplayName, isBlockedProp, onBlockChange]);

  const handleOpenDelete = useCallback(() => {
    onClose();
    setTimeout(() => setShowDeleteConfirm(true), 200);
  }, [onClose]);

  const handleShare = useCallback(async () => {
    if (tokenId == null) return;
    const url = `${WEBSITE_LINK || ""}/app/post/${tokenId}`;
    try {
      await Share.share({
        message: `Check out this post ${url}`,
        url,
      });
    } catch {}
    onClose();
  }, [tokenId, onClose]);

  // Determine follow label
  const followLabel = isFollowRequestPending
    ? "Cancel Request"
    : isFollowing
    ? `Unfollow ${creatorDisplayName}`
    : `Follow ${creatorDisplayName}`;

  const followIcon: keyof typeof Ionicons.glyphMap = isFollowRequestPending
    ? "close-circle-outline"
    : isFollowing
    ? "person-remove-outline"
    : "person-add-outline";

  return (
    <>
      {/* Main options sheet */}
      <GlassModal
        visible={visible}
        onClose={onClose}
        presentation="bottom"
        maxHeight="70%"
        blurIntensity={50}
      >
        {/* Grab handle */}
        <View className="items-center pt-3 pb-1">
          <View className="w-10 h-1 rounded-full bg-white/20" />
        </View>

        {/* Options list */}
        <View className="pb-6">
          {/* Share */}
          <OptionRow
            icon="share-outline"
            label="Share"
            sublabel="Share this post"
            onPress={handleShare}
          />

          {/* Follow / Unfollow — only for non-owners */}
          {!isOwner && (
            <OptionRow
              icon={followIcon}
              label={followLabel}
              loading={followLoading}
              onPress={handleFollowToggle}
            />
          )}

          {/* Owner-only actions */}
          {isOwner && (
            <>
              {!hideEdit && (
                <OptionRow
                  icon="create-outline"
                  label="Edit Post"
                  sublabel="Change title, description, or categories"
                  onPress={handleOpenEdit}
                />
              )}
              <OptionRow
                icon={isHidden ? "eye-outline" : "eye-off-outline"}
                label={isHidden ? "Show Post" : "Hide Post"}
                sublabel={
                  isHidden
                    ? "Make this post visible in feeds again"
                    : "Hide this post from public feeds"
                }
                loading={visibilityLoading}
                onPress={handleVisibilityToggle}
              />
            </>
          )}

          {/* Separator */}
          <View className="mx-5 my-1 h-px bg-white/10" />

          {/* Report — for non-owners */}
          {!isOwner && (
            <>
              {!hideReportContent && (
                <OptionRow
                  icon="flag-outline"
                  label="Report Video"
                  sublabel="Report this content"
                  color="#FBBF24"
                  onPress={handleOpenReportContent}
                />
              )}
              <OptionRow
                icon="person-remove-outline"
                label="Report User"
                sublabel={`Report ${creatorDisplayName}`}
                color="#F97316"
                onPress={handleOpenReportUser}
              />

              {/* Separator */}
              <View className="mx-5 my-1 h-px bg-white/10" />

              <OptionRow
                icon={isBlockedProp ? "lock-open-outline" : "ban-outline"}
                label={isBlockedProp ? `Unblock ${creatorDisplayName}` : `Block ${creatorDisplayName}`}
                sublabel={isBlockedProp ? "Allow this user to appear in your feeds" : "Hide their content and restrict interactions"}
                color="#EF4444"
                onPress={handleOpenBlock}
              />
            </>
          )}

          {/* Delete — owner only */}
          {isOwner && (
            <OptionRow
              icon="trash-outline"
              label="Delete Post"
              sublabel="Permanently remove from feeds"
              color="#EF4444"
              onPress={handleOpenDelete}
            />
          )}
        </View>
      </GlassModal>

      {/* Delete confirmation */}
      <ConfirmModal
        visible={showDeleteConfirm}
        title="Delete this post?"
        description="This action cannot be undone. The post will be permanently removed from all feeds."
        confirmText="Delete"
        cancelText="Cancel"
        confirmKind="danger"
        loading={deleteLoading}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Edit modal */}
      <EditPostModal
        visible={showEdit}
        onClose={() => setShowEdit(false)}
        tokenId={tokenId}
        initialTitle={currentTitle}
        initialDescription={currentDescription}
        initialCategories={currentCategories}
        onSuccess={handleEditDone}
      />

      {/* Report content modal */}
      <ReportModal
        visible={showReportContent}
        onClose={() => setShowReportContent(false)}
        type="content"
        tokenId={tokenId}
      />

      {/* Report user modal */}
      <ReportModal
        visible={showReportUser}
        onClose={() => setShowReportUser(false)}
        type="user"
        userId={creatorIdentifier}
        userName={creatorDisplayName}
      />

      {/* Block/Unblock confirmation */}
      <ConfirmBlockModal
        visible={showBlockConfirm}
        mode={isBlockedProp ? "unblock" : "block"}
        targetLabel={creatorDisplayName}
        onConfirm={handleConfirmBlock}
        onCancel={() => setShowBlockConfirm(false)}
        loading={blockLoading}
      />
    </>
  );
};

const PostOptionsMenu = memo(PostOptionsMenuComponent);
export default PostOptionsMenu;
