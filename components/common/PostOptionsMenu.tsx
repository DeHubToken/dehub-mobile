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
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import GlassModal from "../ui/GlassModal";
import ConfirmModal from "./ConfirmModal";
import ConfirmBlockModal from "./ConfirmBlockModal";
import EditPostModal from "./EditPostModal";
import ReportModal from "./ReportModal";
import CreatePollSheet from "../DM/CreatePollSheet";
import {
  editPost,
  togglePostVisibility,
  deletePost,
} from "../../services/nft.service";
import { followUser, unfollowUser } from "../../services/user.service";
import { blockUser, unblockUser } from "../../services/block.service";
import { useUser, useAuthActions } from "../../context/AuthContext";
import { toastSuccess, toastError } from "../../libs";
import { WEBSITE_LINK } from "../../config";
import { markPostDeleted } from "../../libs/deleted-posts-store";

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
  /** Current state of the creator's comments toggle for this post. */
  currentCommentsDisabled?: boolean;
  /** Called after a successful follow/unfollow to update parent state */
  onFollowChange?: (following: boolean, pending?: boolean) => void;
  /** Called after visibility toggle to update parent state */
  onVisibilityChange?: (isHidden: boolean) => void;
  /** Called after edit success to update parent state */
  onEditSuccess?: (data: { name?: string; description?: string; category?: string[] }) => void;
  /** Called after delete success */
  onDeleteSuccess?: () => void;
  /** Called when user taps Send to DM */
  onSendToDm?: () => void;
  /** Called when user taps Translate Post */
  onTranslatePress?: () => void;
  /** Called when user taps Translate Image (image posts only) */
  onTranslateImagePress?: () => void;
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
  currentCommentsDisabled,
  onFollowChange,
  onVisibilityChange,
  onEditSuccess,
  onDeleteSuccess,
  onSendToDm,
  onTranslatePress,
  onTranslateImagePress,
  isBlocked: isBlockedProp = false,
  onBlockChange,  hideReportContent = false,  hideEdit = false,}) => {
  const user = useUser();
  const { requireAuth } = useAuthActions();
  const { t } = useTranslation();

  // Sub-modal states
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showReportContent, setShowReportContent] = useState(false);
  const [showReportUser, setShowReportUser] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showPoll, setShowPoll] = useState(false);

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
              ? t("postOptions.followRequestCancelled")
              : t("postOptions.unfollowedUser", { name: creatorDisplayName })
          );
        } else {
          const res = await followUser(viewer, target);
          if (res.status === "pending") {
            onFollowChange?.(false, true);
            toastSuccess(t("postOptions.followRequestSent"));
          } else {
            onFollowChange?.(true, false);
            toastSuccess(t("postOptions.nowFollowing", { name: creatorDisplayName }));
          }
        }
      } catch (e) {
        console.error("[PostOptionsMenu] follow toggle error", e);
        toastError(t("postOptions.followUpdateFailed"));
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
      toastSuccess(isHidden ? t("postOptions.postNowVisible") : t("postOptions.postHiddenFromFeeds"));
    } catch (e) {
      console.error("[PostOptionsMenu] visibility toggle error", e);
      toastError(t("postOptions.postVisibilityFailed"));
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
      await markPostDeleted(tokenId);
      toastSuccess(t("postOptions.postDeleted"));
      setShowDeleteConfirm(false);
      onDeleteSuccess?.();
      onClose();
    } catch (e) {
      console.error("[PostOptionsMenu] delete error", e);
      toastError(t("postOptions.postDeleteFailed"));
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
        toastSuccess(t("postOptions.unblockedUser", { name: creatorDisplayName }));
      } else {
        await blockUser(creatorIdentifier);
        onBlockChange?.(true);
        toastSuccess(t("postOptions.blockedUser", { name: creatorDisplayName }));
      }
    } catch (e) {
      console.error("[PostOptionsMenu] block toggle error", e);
      toastError(isBlockedProp ? t("postOptions.unblockFailed") : t("postOptions.blockFailed"));
    } finally {
      setBlockLoading(false);
      setShowBlockConfirm(false);
    }
  }, [creatorIdentifier, creatorDisplayName, isBlockedProp, onBlockChange]);

  const handleOpenDelete = useCallback(() => {
    onClose();
    setTimeout(() => setShowDeleteConfirm(true), 200);
  }, [onClose]);

  const handleOpenPoll = useCallback(() => {
    onClose();
    setTimeout(() => setShowPoll(true), 200);
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

  const followLabel = isFollowRequestPending
    ? t("postOptions.cancelRequest")
    : isFollowing
    ? t("postOptions.unfollow", { name: creatorDisplayName })
    : t("postOptions.follow", { name: creatorDisplayName });

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
            label={t("postOptions.share")}
            sublabel={t("postOptions.shareDesc")}
            onPress={handleShare}
          />

          {/* Send to DM */}
          {!!onSendToDm && (
            <OptionRow
              icon="send-outline"
              label="Send to DM"
              sublabel="Share this post in a conversation"
              onPress={() => { onClose(); setTimeout(() => onSendToDm(), 300); }}
            />
          )}

          {/* Translate text */}
          {!!onTranslatePress && (
            <OptionRow
              icon="globe-outline"
              label={t("postOptions.translatePost")}
              sublabel={t("postOptions.translateDesc")}
              onPress={() => { onTranslatePress(); onClose(); }}
            />
          )}

          {/* Translate image (image posts only) */}
          {!!onTranslateImagePress && (
            <OptionRow
              icon="image-outline"
              label={t("postOptions.translateImage")}
              sublabel={t("postOptions.translateImageDesc")}
              onPress={() => { onClose(); setTimeout(() => onTranslateImagePress(), 300); }}
            />
          )}

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
                  label={t("postOptions.editPost")}
                  sublabel={t("postOptions.editPostDesc")}
                  onPress={handleOpenEdit}
                />
              )}
              {/* Create Poll disabled — polls can't be added to a post after creation (matches web)
              {!hideEdit && (
                <OptionRow
                  icon="bar-chart-outline"
                  label={t("postOptions.createPoll")}
                  sublabel={t("postOptions.createPollDesc")}
                  onPress={handleOpenPoll}
                />
              )} */}
              <OptionRow
                icon={isHidden ? "eye-outline" : "eye-off-outline"}
                label={isHidden ? t("postOptions.showPost") : t("postOptions.hidePost")}
                sublabel={
                  isHidden
                    ? t("postOptions.showPostDesc")
                    : t("postOptions.hidePostDesc")
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
                  label={t("postOptions.reportVideo")}
                  sublabel={t("postOptions.reportVideoDesc")}
                  color="#FBBF24"
                  onPress={handleOpenReportContent}
                />
              )}
              <OptionRow
                icon="person-remove-outline"
                label={t("postOptions.reportUser")}
                sublabel={t("postOptions.reportUserDesc", { name: creatorDisplayName })}
                color="#F97316"
                onPress={handleOpenReportUser}
              />

              {/* Separator */}
              <View className="mx-5 my-1 h-px bg-white/10" />

              <OptionRow
                icon={isBlockedProp ? "lock-open-outline" : "ban-outline"}
                label={isBlockedProp ? t("postOptions.unblockUser", { name: creatorDisplayName }) : t("postOptions.blockUser", { name: creatorDisplayName })}
                sublabel={isBlockedProp ? t("postOptions.unblockDesc") : t("postOptions.blockDesc")}
                color="#EF4444"
                onPress={handleOpenBlock}
              />
            </>
          )}

          {/* Delete — owner only */}
          {isOwner && (
            <OptionRow
              icon="trash-outline"
              label={t("postOptions.deletePost")}
              sublabel={t("postOptions.deletePostDesc")}
              color="#EF4444"
              onPress={handleOpenDelete}
            />
          )}
        </View>
      </GlassModal>

      {/* Delete confirmation */}
      <ConfirmModal
        visible={showDeleteConfirm}
        title={t("postOptions.deleteConfirmTitle")}
        description={t("postOptions.deleteConfirmDesc")}
        confirmText={t("common.delete")}
        cancelText={t("common.cancel")}
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
        initialCommentsDisabled={currentCommentsDisabled}
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

      {/* Create poll sheet */}
      <CreatePollSheet
        visible={showPoll}
        onClose={() => setShowPoll(false)}
        tokenId={tokenId != null ? Number(tokenId) : 0}
        onCreated={() => setShowPoll(false)}
      />
    </>
  );
};

const PostOptionsMenu = memo(PostOptionsMenuComponent);
export default PostOptionsMenu;
