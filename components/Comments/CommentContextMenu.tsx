/**
 * CommentContextMenu - the hold menu for a comment or a reply.
 *
 * The held row stays where it is (no copy of it is drawn), the rest of the
 * thread dims, the list slides up so the row clears a glass sheet, and the
 * sheet carries the reactions and the actions. Same sheet as live chat
 * (HoldSheet); mirrors dehubweb ChatHoldSheet on comments.
 */
import React, { memo, useCallback } from "react";
import { shareWithRef } from "../../libs/shareRef";
import { useTranslation } from "react-i18next";
import { copyToClipboard } from "../../libs/clipboard.utils";
import type { Comment } from "../../services/nft.service";
import { WEBSITE_LINK } from "../../config";
import type { TranslateToggle } from "../ui/TranslateButton";
import HoldSheet, { type HoldReactionChip, type HoldTile } from "../ui/HoldSheet";
import { reactionMeta, type PostReaction } from "../../libs/reactions";

export interface CommentLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What a held CommentItem hands its host along with the comment and its layout. */
export interface CommentHoldExtra {
  liked: boolean;
  disliked: boolean;
  isOwnComment: boolean;
  isReply: boolean;
  translate?: TranslateToggle;
  myReaction?: PostReaction | null;
  react?: (reaction: PostReaction) => void;
}

interface CommentContextMenuProps {
  visible: boolean;
  comment: Comment | null;
  layout: CommentLayout | null;
  isReply?: boolean;
  isOwnComment: boolean;
  onClose: () => void;
  onReply?: () => void;
  onShare?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /**
   * Report this comment to moderation, or undefined when the viewer is signed
   * out. Never shown on the viewer's own comment — the server refuses a
   * self-report, so the row would only ever fail.
   */
  onReport?: () => void;
  /**
   * Spend a Comment Anchor on this comment, or undefined when it cannot be.
   *
   * Undefined for a comment that is not yours, on a thread that IS yours, or
   * for an account that has not reached Piranha — the same three refusals the
   * server applies, resolved once by the caller rather than by every row.
   */
  onAnchor?: () => void;
  /**
   * Pin this comment to the top of the thread, or undefined when this viewer
   * cannot. Set only for the POST's creator and only on a top-level comment —
   * the other side of the anchor above: free, permanent, one per post, and the
   * thread owner's rather than the comment author's.
   */
  onPin?: () => void;
  onLike?: () => void;
  liked?: boolean;
  onDislike?: () => void;
  disliked?: boolean;
  /** Own comments swap the Like row for a who-liked row — the server refuses
   *  self-likes, and the author is the only one allowed to see the list. */
  onShowLikers?: () => void;
  tokenId?: number | string;
  /** Whether current user can delete (own comment or video owner) */
  canDelete?: boolean;
  /** Translate / Show original — set only when the comment is in another language. */
  translate?: TranslateToggle;
  /** The viewer's reaction on this comment, drawn as the selected chip. */
  myReaction?: PostReaction | null;
  /**
   * Cast a reaction through the held row's own path (so the row updates in
   * place). Set by CommentItem; without it the sheet falls back to the
   * plain Like / Dislike tiles.
   */
  react?: (reaction: PostReaction) => void;
  /** How far the host should slide its list up so the row clears the sheet. */
  onLift?: (px: number) => void;
  /** Window y the lifted row must stay below (top of the comments sheet). */
  liftTop?: number;
}


/** Returns true if the comment has any media attachment */
const isMediaComment = (c: Comment | null): boolean =>
  !!(c?.imageUrl || c?.gifUrl || c?.audioUrl);

/** The quick row, as on web: the faces people use most, 👎 last. */
const QUICK_REACTIONS: PostReaction[] = ["like", "love", "hot", "lol", "hundred", "sad", "dislike"];

const CommentContextMenuComponent: React.FC<CommentContextMenuProps> = ({
  visible,
  comment,
  layout,
  isOwnComment,
  onClose,
  onReply,
  onEdit,
  onDelete,
  onReport,
  onAnchor,
  onPin,
  onLike,
  liked,
  onDislike,
  disliked,
  onShowLikers,
  tokenId,
  canDelete,
  translate,
  myReaction,
  react,
  onLift,
  liftTop,
}) => {
  const { t } = useTranslation();

  /** Close first, then act, so a keyboard or a second sheet opens on a settled screen. */
  const run = useCallback((fn?: () => void, delay = 150) => {
    onClose();
    if (fn) setTimeout(fn, delay);
  }, [onClose]);

  const handleShare = useCallback(async () => {
    onClose();
    try {
      let shareUrl = WEBSITE_LINK;
      if (tokenId && comment) {
        shareUrl = `${WEBSITE_LINK}/app/post/${tokenId}?c=${comment.id}`;
      }
      await shareWithRef({ message: t("comments.shareMessage", { url: shareUrl }), url: shareUrl }, undefined, "comment");
    } catch (e) {
      console.error("Share error:", e);
    }
  }, [onClose, tokenId, comment, t]);

  if (!comment) return <HoldSheet visible={false} layout={null} onClose={onClose} reactions={null} tiles={[]} onLift={onLift} />;

  // Reactions: somebody else's comment only (the server refuses a self-like).
  const current = myReaction ?? (liked ? "like" : disliked ? "dislike" : null);
  const reactions: HoldReactionChip[] | null = react && !isOwnComment
    ? QUICK_REACTIONS.map((key) => ({ key, emoji: reactionMeta(key).emoji, selected: current === key }))
    : null;

  const tiles: HoldTile[] = [];
  if (onReply) tiles.push({ key: "reply", icon: "Reply", label: t("communities.reply"), prime: true, onPress: () => run(onReply) });
  if (comment.content) tiles.push({ key: "copy", icon: "Copy", label: t("common.copy"), onPress: () => { copyToClipboard(comment.content); onClose(); } });
  tiles.push({ key: "share", icon: "Share2", label: t("postOptions.share"), onPress: () => { void handleShare(); } });
  if (translate) tiles.push({
    key: "translate",
    icon: translate.isTranslated ? "RotateCcw" : "Languages",
    label: translate.isTranslated ? t("common.showOriginal") : t("common.translate"),
    onPress: () => { onClose(); translate.toggle(); },
  });
  // No reaction row (no react path): keep the plain pair.
  if (!reactions && !isOwnComment) {
    if (onLike) tiles.push({ key: "like", icon: "ThumbsUp", label: liked ? t("comments.unlike") : t("reactionInfo.labels.like"), onPress: () => run(onLike, 100) });
    if (onDislike) tiles.push({ key: "dislike", icon: "ThumbsDown", label: disliked ? t("comments.removeDislike") : t("comments.dislike"), onPress: () => run(onDislike, 100) });
  }
  // Own comment: liking would 400 server-side, so the author gets the
  // who-liked list. Un-liking a historical self-like stays possible.
  if (isOwnComment && liked && onLike) tiles.push({ key: "unlike", icon: "ThumbsUp", label: t("comments.unlike"), onPress: () => run(onLike, 100) });
  if (isOwnComment && onShowLikers) tiles.push({ key: "likers", icon: "Users", label: t("comments.whoLiked"), onPress: () => run(onShowLikers, 100) });
  // Comment Anchor: the author's paid hold at the top of somebody else's thread.
  if (isOwnComment && onAnchor) tiles.push({ key: "anchor", icon: "Anchor", label: t("comments.anchorToTop"), onPress: () => run(onAnchor) });
  // The thread owner's free pin, whoever wrote the comment.
  if (onPin) tiles.push({
    key: "pin",
    icon: comment.isPinned ? "PinOff" : "Pin",
    label: comment.isPinned ? t("communities.unpin") : t("communities.pin"),
    onPress: () => run(onPin),
  });
  // Report: somebody else's comment only, the server refuses a self-report.
  if (!isOwnComment && onReport) tiles.push({ key: "report", icon: "Flag", label: t("postOptions.report"), onPress: () => run(onReport) });
  if (isOwnComment && onEdit && !isMediaComment(comment)) tiles.push({ key: "edit", icon: "Pencil", label: t("common.edit"), onPress: () => run(onEdit) });
  if (canDelete && onDelete) tiles.push({ key: "delete", icon: "Trash2", label: t("common.delete"), destructive: true, onPress: () => run(onDelete, 100) });

  return (
    <HoldSheet
      visible={visible}
      layout={layout}
      onClose={onClose}
      reactions={reactions}
      onReaction={(key) => run(() => react?.(key as PostReaction), 100)}
      tiles={tiles}
      onLift={onLift}
      liftTop={liftTop}
    />
  );
};

export const CommentContextMenu = memo(CommentContextMenuComponent);
export default CommentContextMenu;
