/**
 * ShareSheet - Liquid glass bottom sheet bundling all share actions.
 *
 * Mirrors the web ActionBar's Share drawer: a single Share button opens this
 * sheet, which consolidates Send-in-DM, Repost/Undo, Quote, Copy Link and
 * Share-as-Image (replacing the old inline repost button + RepostPopover).
 */
import React, { memo, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import type { IconName } from "../ui/Icon";

interface ShareRowProps {
  icon: IconName;
  label: string;
  color?: string;
  loading?: boolean;
  onPress: () => void;
}

const ShareRow: React.FC<ShareRowProps> = memo(
  ({ icon, label, color = "#E5E7EB", loading, onPress }) => (
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
          <Icon name={icon} size={18} color={color} strokeWidth={1.9} />
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
  onCopyLink: () => void;
  /** Send in a message — only shown when a DM share is possible. */
  onSendToDm?: () => void;
  /** Share as image — only shown when supported for this post. */
  onShareAsImage?: () => void | Promise<void>;
}

const ShareSheetComponent: React.FC<ShareSheetProps> = ({
  visible,
  onClose,
  isReposted,
  onRepost,
  onUndoRepost,
  onQuote,
  onCopyLink,
  onSendToDm,
  onShareAsImage,
}) => {
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
      maxHeight="70%"
      blurIntensity={50}
    >
      {/* Grab handle */}
      <View className="items-center pt-3 pb-1">
        <View className="w-10 h-1 rounded-full bg-white/20" />
      </View>

      <Text className="text-white/90 font-semibold text-base px-5 pt-2 pb-1">
        Share
      </Text>

      <View className="pb-6 pt-1">
        {!!onSendToDm && (
          <ShareRow
            icon="Send"
            label="Send in a message"
            onPress={() => {
              onClose();
              setTimeout(() => onSendToDm(), 300);
            }}
          />
        )}

        {isReposted ? (
          <ShareRow
            icon="Repeat2"
            label="Undo Repost"
            color="#F4F4F5"
            onPress={() => {
              onUndoRepost();
              onClose();
            }}
          />
        ) : (
          <ShareRow
            icon="Repeat2"
            label="Repost"
            onPress={() => {
              onRepost();
              onClose();
            }}
          />
        )}

        <ShareRow
          icon="Quote"
          label="Quote"
          onPress={() => {
            onClose();
            setTimeout(() => onQuote(), 300);
          }}
        />

        <ShareRow
          icon="Link"
          label="Copy Link"
          onPress={() => {
            onCopyLink();
            onClose();
          }}
        />

        {!!onShareAsImage && (
          <ShareRow
            icon="ImageDown"
            label={sharingImage ? "Capturing…" : "Share as Image"}
            loading={sharingImage}
            onPress={handleShareAsImage}
          />
        )}
      </View>
    </GlassModal>
  );
};

const ShareSheet = memo(ShareSheetComponent);
export default ShareSheet;
