/**
 * CommentMediaPreview — Shows a preview of the selected media (image/GIF/voice note)
 * above the comment input bar before sending.
 *
 * - Image: compact thumbnail with overlay X (matches chat screen style)
 * - GIF: compact thumbnail with overlay X (matches chat screen style)
 * - Voice note: VoiceNotePlayer waveform with remove (trash) and send buttons
 */
import React, { memo, useCallback } from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import VoiceNotePlayer from "./VoiceNotePlayer";

export type MediaAttachment =
  | { type: "image"; uri: string }
  | { type: "gif"; url: string }
  | { type: "audio"; uri: string; durationMs: number };

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
  const handleRemove = useCallback(() => onRemove(), [onRemove]);
  const handleSend = useCallback(() => onSend(), [onSend]);

  if (media.type === "audio") {
    return (
      <View className="flex-row items-center px-4 py-2 bg-theme-neutrals-800/80">
        {/* Remove */}
        <TouchableOpacity onPress={handleRemove} activeOpacity={0.7} className="mr-2">
          <Ionicons name="trash-outline" size={20} color="#f87171" />
        </TouchableOpacity>

        {/* Waveform preview */}
        <View className="flex-1">
          <VoiceNotePlayer
            audioUrl={media.uri}
            duration={media.durationMs / 1000}
            compact
          />
        </View>

        {/* Send — white/black */}
        <TouchableOpacity
          onPress={handleSend}
          activeOpacity={0.7}
          disabled={sending}
          className="ml-2 w-9 h-9 rounded-full bg-white items-center justify-center"
        >
          <Ionicons name="send" size={16} color="#000" />
        </TouchableOpacity>
      </View>
    );
  }

  // Image or GIF preview — chat-screen style (compact thumbnail with overlay X)
  const uri = media.type === "image" ? media.uri : media.url;

  return (
    <View className="px-4 py-2 bg-theme-neutrals-800/80 flex-row items-center">
      {/* Thumbnail with overlay close button */}
      <View className="w-16 h-16 rounded-lg overflow-hidden bg-theme-neutrals-700 relative mr-3">
        <Image
          source={{ uri }}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
        />
        <TouchableOpacity
          onPress={handleRemove}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Remove media"
          className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-black/60 items-center justify-center"
        >
          <Ionicons name="close" size={14} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View className="flex-1" />

      {/* Send — white/black */}
      <TouchableOpacity
        onPress={handleSend}
        activeOpacity={0.7}
        disabled={sending}
        className="w-9 h-9 rounded-full bg-white items-center justify-center"
      >
        {sending ? (
          <Text className="text-black text-[10px] font-semibold">...</Text>
        ) : (
          <Ionicons name="send" size={16} color="#000" />
        )}
      </TouchableOpacity>
    </View>
  );
};

export const CommentMediaPreview = memo(CommentMediaPreviewComponent);
export default CommentMediaPreview;
