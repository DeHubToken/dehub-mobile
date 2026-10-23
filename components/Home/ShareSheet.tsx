/**
 * ShareSheet - Liquid glass bottom sheet bundling all share actions.
 *
 * Mirrors the web ActionBar's Share drawer: a single Share button opens this
 * sheet, which consolidates Send-in-DM, Repost/Undo, Quote, Copy Link and
 * Share-as-Image (replacing the old inline repost button + RepostPopover).
 */
import React, { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import type { IconName } from "../ui/Icon";
import { copyToClipboard } from "../../libs/clipboard.utils";
import { toastSuccess } from "../../libs/toast";
import { postEmbedCode } from "../../libs/embed-code";

interface ShareRowProps {
  /** An Icon, or `glyph` for a mark the bundled set has no icon for. */
  icon?: IconName;
  glyph?: string;
  label: string;
  color?: string;
  loading?: boolean;
  onPress: () => void;
}

const ShareRow: React.FC<ShareRowProps> = memo(
  ({ icon, glyph, label, color = "#E5E7EB", loading, onPress }) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.7}
      className="mx-3 flex-row items-center rounded-xl px-3 py-3.5 active:bg-white/10"
    >
      <View className="w-5 h-5 items-center justify-center mr-3">
        {loading ? (
          <ActivityIndicator size="small" color={color} />
        ) : icon ? (
          <Icon name={icon} size={20} color={color} strokeWidth={1.9} />
        ) : (
          <Text style={{ color, fontSize: 13, fontWeight: "800" }}>{glyph}</Text>
        )}
      </View>
      <Text style={{ color }} className="text-[15px] font-medium">
        {label}
      </Text>
    </TouchableOpacity>
  )
);

interface ShareSheetProps {
  visible: boolean;
  onClose: () => void;
  isReposted: boolean;
  onRepost: () => void;
  onUndoRepost: () => void;
  onQuote: () => void;
  /** False when the author lets nobody else quote this post: the row is left out. */
  canQuote?: boolean;
  /** False for a followers-only or direct post: Repost gives way to a line saying why. */
  canRepost?: boolean;
  onCopyLink: () => void;
  /** Send in a message — only shown when a DM share is possible. */
  onSendToDm?: () => void;
  /** Share as image — only shown when supported for this post. */
  onShareAsImage?: () => void | Promise<void>;
  /** The post to offer embed code for; omit to leave the row out. */
  embedTokenId?: string | number;
}

const ShareSheetComponent: React.FC<ShareSheetProps> = ({
  visible,
  onClose,
  isReposted,
  onRepost,
  onUndoRepost,
  onQuote,
  canQuote = true,
  canRepost = true,
  onCopyLink,
  onSendToDm,
  onShareAsImage,
  embedTokenId,
}) => {
  const { t } = useTranslation();
  const [sharingImage, setSharingImage] = useState(false);

  const handleShareAsImage = async () => {
    if (!onShareAsImage || sharingImage) return;
    setSharingImage(true);
    onClose();
    // Wait for the sheet to close before capturing the card.
    await new Promise((r) => setTimeout(r, 350));
    try {
      await onShareAsImage();
    } finally {
      setSharingImage(false);
    }
  };

  return (
    <GlassModal
      visible={visible}
      onClose={onClose}
      presentation="bottom"
      scrollable
      maxHeight="70%"
      blurIntensity={50}
    >
      {/* Grab handle */}
      <View className="items-center pt-3 pb-1">
        <View className="w-10 h-1 rounded-full bg-white/20" />
      </View>

      <Text className="text-white/90 font-semibold text-base px-5 pt-2 pb-1">
        {t("postOptions.share")}
      </Text>

      <View className="pb-6 pt-1">
        {isReposted ? (
          <ShareRow
            icon="Repeat2"
            label={t("feedCard.undoRepost")}
            color="#F4F4F5"
            onPress={() => {
              onUndoRepost();
              onClose();
            }}
          />
        ) : !canRepost ? (
          <Text className="text-theme-neutrals-400 text-sm px-5 py-3">{t("postVisibility.noRepost")}</Text>
        ) : (
          <ShareRow
            icon="Repeat2"
            label={t("feedCard.repost")}
            onPress={() => {
              onRepost();
              onClose();
            }}
          />
        )}

        {canQuote && (
        <ShareRow
          icon="Quote"
          label={t("transcript.quote")}
          onPress={() => {
            onClose();
            setTimeout(() => onQuote(), 300);
          }}
        />
        )}

        {!!onShareAsImage && (
          <ShareRow
            icon="ImageDown"
            label={sharingImage ? t("feedCard.capturing") : t("feedCard.shareAsImage")}
            loading={sharingImage}
            onPress={handleShareAsImage}
          />
        )}
        {!!onSendToDm && (
          <ShareRow
            icon="Send"
            label={t("feedCard.sendInMessage")}
            onPress={() => {
              onClose();
              setTimeout(() => onSendToDm(), 300);
            }}
          />
        )}

        <ShareRow
          icon="Link"
          label={t("postOptions.copyLink")}
          onPress={() => {
            onCopyLink();
            onClose();
          }}
        />

        {embedTokenId != null && (
          <ShareRow
            glyph="</>"
            label={t("postOptions.copyEmbedCode")}
            onPress={() => {
              copyToClipboard(postEmbedCode(embedTokenId));
              toastSuccess(t("postOptions.embedCodeCopied"));
              onClose();
            }}
          />
        )}

      </View>
    </GlassModal>
  );
};

const ShareSheet = memo(ShareSheetComponent);
export default ShareSheet;
