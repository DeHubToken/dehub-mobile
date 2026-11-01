/**
 * CommentMediaPreview — Shows a preview of the selected media (image/GIF/voice note)
 * above the comment input bar before sending.
 *
 * - Image: compact thumbnail with overlay X (matches chat screen style)
 * - GIF: compact thumbnail with overlay X (matches chat screen style)
 * - Voice note: VoiceNotePlayer waveform with remove (trash) and send buttons
 */
import React, { memo, useCallback } from "react";
import { View, TouchableOpacity, ActivityIndicator } from "react-native";
import SmartImage from "../common/SmartImage";
import Icon from "../ui/Icon";
import VoiceNotePlayer from "./VoiceNotePlayer";
import { useTranslation } from "react-i18next";

export type MediaAttachment =
  | { type: "image"; uri: string }
  | { type: "gif"; url: string }
  | { type: "audio"; uri: string; durationMs: number }
  /** A video clip picked with the paperclip. */
  | { type: "video"; uri: string; mimeType?: string; thumbnailUri?: string }
  /** An audio FILE picked with the paperclip (not a recorded voice note). */
  | { type: "audiofile"; uri: string; mimeType: string; name?: string };

interface CommentMediaPreviewProps {
  media: MediaAttachment;
  onRemove: () => void;
  onSend: () => void;
  sending?: boolean;
}

const CommentMediaPreviewComponent: React.FC<CommentMediaPreviewProps> = ({
  media,
  onRemove,
  onSend,
  sending = false,
}) => {
  const { t } = useTranslation();
  const handleRemove = useCallback(() => onRemove(), [onRemove]);
  const handleSend = useCallback(() => onSend(), [onSend]);

  if (media.type === "audio" || media.type === "audiofile") {
    return (
      <View className="flex-row items-center px-4 py-2 bg-theme-neutrals-800/80">
        <TouchableOpacity
          onPress={handleRemove}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t("comments.removeVoiceNote")}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="mr-2 w-[34px] h-[34px] rounded-[9px] border border-white/10 bg-white/10 items-center justify-center"
        >
          <Icon name="Trash2" size={16} color="#F4F4F5" />
        </TouchableOpacity>

        <View className="flex-1">
          <VoiceNotePlayer
            audioUrl={media.uri}
            duration={media.type === "audio" ? media.durationMs / 1000 : undefined}
            compact
          />
        </View>

        <TouchableOpacity
          onPress={handleSend}
          activeOpacity={0.7}
          disabled={sending}
          accessibilityRole="button"
          accessibilityLabel={t("tip.send")}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="ml-2 w-[34px] h-[34px] rounded-[9px] bg-white items-center justify-center"
        >
          <Icon name="Send" size={16} color="#000" />
        </TouchableOpacity>
      </View>
    );
  }

  // Image or GIF preview — chat-screen style (compact thumbnail with overlay X)
  const uri = media.type === "image" ? media.uri : media.type === "video" ? media.thumbnailUri || "" : media.url;

  return (
    <View className="px-4 py-2 bg-theme-neutrals-800/80 flex-row items-center">
      <View className="w-16 h-16 rounded-lg overflow-hidden bg-theme-neutrals-700 relative mr-3">
        <SmartImage
          source={{ uri }}
          recyclingKey={uri}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
        />
        {media.type === "video" && (
          <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
            <Icon name="CirclePlay" size={24} color="#FFFFFF" />
          </View>
        )}
        <TouchableOpacity
          onPress={handleRemove}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t("comments.removeMedia")}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="absolute -top-1 -right-1 w-6 h-6 rounded-lg dark-surface bg-black/60 items-center justify-center"
        >
          <Icon name="X" size={14} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View className="flex-1" />

      <TouchableOpacity
        onPress={handleSend}
        activeOpacity={0.7}
        disabled={sending}
        accessibilityRole="button"
        accessibilityLabel={t("tip.send")}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        className="w-9 h-9 rounded-xl bg-white items-center justify-center"
      >
        {sending ? (
          <ActivityIndicator size="small" color="#000" />
        ) : (
          <Icon name="Send" size={16} color="#000" />
        )}
      </TouchableOpacity>
    </View>
  );
};

export const CommentMediaPreview = memo(CommentMediaPreviewComponent);
export default CommentMediaPreview;
