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
import type { ShopLink } from "../../services/nft.service";
import ReportModal from "./ReportModal";
import {
  editPost,
  togglePostVisibility,
  deletePost,
} from "../../services/nft.service";
import { followUser, unfollowUser } from "../../services/user.service";
import { blockUser, unblockUser } from "../../services/block.service";
import { muteUser } from "../../services/mute.service";
import { useUser, useAuthActions } from "../../context/AuthContext";
import { toastSuccess, toastError } from "../../libs";
import { WEBSITE_LINK } from "../../config";
import { markPostDeleted } from "../../libs/deleted-posts-store";
import { useMintExistingPost } from "../../hooks/useMintExistingPost";
import { defaultChainId } from "../../config/constants";

export interface PostOptionsMenuProps {
  visible: boolean;
  onClose: () => void;
  /** Token ID of the post */
  tokenId: number | string | undefined;
  /** Whether the current viewer owns this post */
  isOwner: boolean;
  /**
   * The post's mint status. 'signed' means it was published off-chain and can
   * still be minted; anything else (or absent) hides the Mint post row, so a
   * caller that does not know simply does not offer it.
   */
  postStatus?: string;
  /** Chain the post was created on — needed to mint one published off-chain. */
  postChainId?: number;
  /**
   * Whether this post has a video file that can be swapped. The creator only,
   * and only a post whose media is a video — the endpoint refuses anything
   * else, and offering the row would be a promise the server does not keep.
   */
  canReplaceVideo?: boolean;
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
  /** The Shop board already on the post, so the edit sheet opens on it. */
  currentShopLinks?: ShopLink[];
  /** Absent means safe — the API stores nothing for the default. */
  currentContentRating?: string;
  /** Called after a successful follow/unfollow to update parent state */
  onFollowChange?: (following: boolean, pending?: boolean) => void;
  /** Called after visibility toggle to update parent state */
  onVisibilityChange?: (isHidden: boolean) => void;
  /** Called after edit success to update parent state */
  onEditSuccess?: (data: { name?: string; description?: string; category?: string[]; commentsDisabled?: boolean; contentRating?: string; shopLinks?: ShopLink[] }) => void;
  /** Called after delete success */
  onDeleteSuccess?: () => void;
  /** Called when user taps Send to DM */
  onSendToDm?: () => void;
  /**
   * Called when the owner taps Boost.
   *
   * The sheet is owned by the CALLER, not by this menu. Every call site renders
   * this component as `{showOptionsMenu && <PostOptionsMenu …>}`, so `onClose()`
   * unmounts it — state set in the same handler goes with the fiber and nothing
   * opens. That is why `onSendToDm` is a callback too, and the Boost row was
   * dead until it became one.
   */
  onBoostPress?: () => void;
  /**
   * Deep Current — spending one of your own boosts on somebody ELSE's post.
   *
   * Its own prop rather than reusing `onBoostPress`, because the two land in
   * opposite halves of this menu and say opposite things. The caller passes it
   * only when the account actually holds the power: unlike Boost, this row
   * appears on other people's posts, which is every post in the feed, so
   * showing it to everybody is noise on every card rather than an invitation
   * on their own.
   */
  onGiftBoostPress?: () => void;
  /** Called when user taps Translate Post */
  onTranslatePress?: () => void;
  /** Called when user taps Translate Image (image posts only) */
  onTranslateImagePress?: () => void;
  /** Whether the viewer has blocked the creator */
  isBlocked?: boolean;
  /** Called after block/unblock to update parent state */
  onBlockChange?: (blocked: boolean) => void;
  /**
   * Called after a successful mute, so the caller can drop the post from its
   * list. There is no `isMuted` counterpart and no unmute here: a mute is
   * private and reversible from Settings, and fetching mute state per card
   * would cost a request per post to render one menu row.
   */
  onMuteChange?: (muted: boolean) => void;
  /** Whether the viewer has bookmarked this post. Only read when `onToggleSave` is set. */
  isSaved?: boolean;
  /**
   * Toggle the bookmark from inside this menu. Surfaces with no bookmark button
   * of their own pass this — the shorts viewer keeps it here, as web does —
   * while the feed card leaves it out and keeps bookmark on its action bar.
   */
  onToggleSave?: () => void;
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
  canReplaceVideo = false,
  postStatus,
  postChainId,
  isHidden,
  creatorDisplayName,
  creatorIdentifier,
  isFollowing,
  isFollowRequestPending = false,
  currentTitle,
  currentDescription,
  currentCategories,
  currentCommentsDisabled,
  currentShopLinks,
  currentContentRating,
  onFollowChange,
  onVisibilityChange,
  onEditSuccess,
  onDeleteSuccess,
  onSendToDm,
  onBoostPress,
  onGiftBoostPress,
  onTranslatePress,
  onTranslateImagePress,
  isBlocked: isBlockedProp = false,
  onBlockChange,
  onMuteChange,
  isSaved = false,
  onToggleSave,
  hideReportContent = false,  hideEdit = false,}) => {
  const user = useUser();
  const { requireAuth } = useAuthActions();
  const { t } = useTranslation();
  const { mint: mintExisting, isMinting } = useMintExistingPost();

  // Sub-modal states
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showReportContent, setShowReportContent] = useState(false);
  const [showReportUser, setShowReportUser] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);

  /**
   * The sheet hides itself for a sub-modal instead of calling onClose().
   *
   * Every call site renders this component as `{showOptionsMenu && <PostOptionsMenu …>}`,
   * so onClose() unmounts the whole subtree — and the sub-modals below live in
   * that subtree. Closing the sheet first and then opening Edit meant setting
   * state on a fiber that no longer existed, so Edit (and Delete, Report,
   * Block) simply never appeared. Only the sheets the CALLER owns — Boost,
   * Send to DM, Translate image — may close on the way out.
   */
  const [sheetHidden, setSheetHidden] = useState(false);

  /** Hide the sheet, then open the sub-modal once its dismiss animation is done. */
  const openSubModal = useCallback((open: () => void) => {
    setSheetHidden(true);
    setTimeout(open, 220);
  }, []);

  /** A sub-modal finished: unmount the menu for real. */
  const closeAll = useCallback(() => {
    setSheetHidden(false);
    onClose();
  }, [onClose]);

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
    openSubModal(() => setShowEdit(true));
  }, [openSubModal]);

  const handleEditDone = useCallback(
    (data: { name?: string; description?: string; category?: string[]; commentsDisabled?: boolean; contentRating?: string; shopLinks?: ShopLink[] }) => {
      setShowEdit(false);
      onEditSuccess?.(data);
    },
    [onEditSuccess]
  );

  const handleOpenReportContent = useCallback(() => {
    requireAuth?.(() => openSubModal(() => setShowReportContent(true)));
  }, [openSubModal, requireAuth]);

  const handleOpenReportUser = useCallback(() => {
    requireAuth?.(() => openSubModal(() => setShowReportUser(true)));
  }, [openSubModal, requireAuth]);

  const handleOpenBlock = useCallback(() => {
    requireAuth?.(() => openSubModal(() => setShowBlockConfirm(true)));
  }, [openSubModal, requireAuth]);

  /**
   * Muting takes no confirmation sheet, where blocking does.
   *
   * Blocking is bidirectional, cuts DMs and shows on their profile, so it is
   * worth stopping to ask. A mute is one-way, private and reversible — nothing
   * is severed and the other account never learns of it — so a confirmation
   * step would be friction protecting against nothing.
   */
  const handleMute = useCallback(() => {
    requireAuth?.(async () => {
      if (!creatorIdentifier) return;
      onClose();
      try {
        await muteUser(creatorIdentifier);
        onMuteChange?.(true);
        toastSuccess(t("postOptions.mutedUser", { name: creatorDisplayName }));
      } catch (e) {
        console.error("[PostOptionsMenu] mute error", e);
        toastError(t("postOptions.muteFailed"));
      }
    });
  }, [requireAuth, onClose, creatorIdentifier, creatorDisplayName, onMuteChange, t]);

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
      closeAll();
    }
  }, [creatorIdentifier, creatorDisplayName, isBlockedProp, onBlockChange, closeAll]);

  const handleOpenDelete = useCallback(() => {
    openSubModal(() => setShowDeleteConfirm(true));
  }, [openSubModal]);

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
        visible={visible && !sheetHidden}
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
          {/* Bookmark — first row, as in the web drawer. Only for hosts that
              don't carry a bookmark button of their own. */}
          {!!onToggleSave && (
            <OptionRow
              icon={isSaved ? "bookmark" : "bookmark-outline"}
              label={isSaved ? "Remove bookmark" : "Bookmark"}
              onPress={() => { onToggleSave(); onClose(); }}
            />
          )}

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
              {/* Boost. Offered to every owner rather than only to badge
                  holders: the sheet explains what a badge buys and links to
                  staking, which is worth more than hiding the row from the
                  people who have not staked yet. */}
              {!!onBoostPress && tokenId != null && (
                <OptionRow
                  icon="rocket-outline"
                  label="Boost post"
                  sublabel="Put it at the top of the home feed"
                  onPress={() => { onClose(); setTimeout(() => onBoostPress(), 300); }}
                />
              )}
              {/* Only for posts published off-chain — 'signed' is the status
                  the backend keeps them at for life. */}
              {postStatus === "signed" && tokenId != null && (
                <OptionRow
                  icon="diamond-outline"
                  label="Mint post"
                  sublabel="Publish this post on-chain"
                  loading={isMinting}
                  onPress={() => {
                    mintExisting(Number(tokenId), postChainId ?? defaultChainId).then(
                      (ok) => { if (ok) onClose(); },
                    );
                  }}
                />
              )}
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
              {!!onGiftBoostPress && tokenId != null && (
                <OptionRow
                  icon="gift-outline"
                  label="Gift a boost"
                  sublabel="Spend one of yours on this post"
                  onPress={() => { onClose(); setTimeout(() => onGiftBoostPress(), 300); }}
                />
              )}
              {!hideReportContent && (
                <OptionRow
                  icon="flag-outline"
                  label={t("postOptions.reportVideo")}
                  sublabel={t("postOptions.reportVideoDesc")}
                  color="#D4D4D8"
                  onPress={handleOpenReportContent}
                />
              )}
              <OptionRow
                icon="person-remove-outline"
                label={t("postOptions.reportUser")}
                sublabel={t("postOptions.reportUserDesc", { name: creatorDisplayName })}
                color="#D4D4D8"
                onPress={handleOpenReportUser}
              />

              {/* Separator */}
              <View className="mx-5 my-1 h-px bg-white/10" />

              {/* Mute above Block, and in the neutral colour rather than the
                  destructive red: it is the one most people actually want, and
                  it severs nothing. Only shown when not already blocked —
                  muting someone you have blocked would change nothing. */}
              {!isBlockedProp && (
                <OptionRow
                  icon="volume-mute-outline"
                  label={t("postOptions.muteUser", { name: creatorDisplayName })}
                  sublabel={t("postOptions.muteDesc")}
                  onPress={handleMute}
                />
              )}

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
        onCancel={() => { setShowDeleteConfirm(false); closeAll(); }}
      />

      {/* Edit modal */}
      <EditPostModal
        visible={showEdit}
        onClose={() => { setShowEdit(false); closeAll(); }}
        tokenId={tokenId}
        initialTitle={currentTitle}
        initialDescription={currentDescription}
        initialCategories={currentCategories}
        initialCommentsDisabled={currentCommentsDisabled}
        initialShopLinks={currentShopLinks}
        initialContentRating={currentContentRating}
        canReplaceVideo={canReplaceVideo}
        onSuccess={handleEditDone}
      />

      {/* Report content modal */}
      <ReportModal
        visible={showReportContent}
        onClose={() => { setShowReportContent(false); closeAll(); }}
        type="content"
        tokenId={tokenId}
      />

      {/* Report user modal */}
      <ReportModal
        visible={showReportUser}
        onClose={() => { setShowReportUser(false); closeAll(); }}
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
        onCancel={() => { setShowBlockConfirm(false); closeAll(); }}
        loading={blockLoading}
      />

    </>
  );
};

const PostOptionsMenu = memo(PostOptionsMenuComponent);
export default PostOptionsMenu;
