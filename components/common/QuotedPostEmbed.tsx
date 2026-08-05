import React, { memo, useCallback, useMemo } from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { getAvatarUrl, getImageUrl, getImageUrlApiSimple, getAudioUrl } from "../../libs/misc";
import { truncate } from "../../libs/strings.util";
import Avatar from "./Avatar";
import AudioPostPlayer from "../Home/AudioPostPlayer";

interface QuotedPostEmbedProps {
  /** Full quoted post object from the API (may be null/undefined if unavailable) */
  quotedPost?: any;
  /** Token ID of the quoted post (fallback when quotedPost is null) */
  quotedTokenId?: number | string | null;
}

const QuotedPostEmbed: React.FC<QuotedPostEmbedProps> = memo(
  ({ quotedPost, quotedTokenId }) => {
    const navigation = useNavigation<any>();
    const { hideUserProfile } = useUserProfileSheet();

    const isAvailable = !!quotedPost && !(quotedPost as any).unavailable;

    const handlePress = useCallback(() => {
      const targetTokenId = quotedPost?.tokenId ?? quotedPost?.id ?? quotedTokenId;
      if (!targetTokenId) return;

      hideUserProfile();
      navigation.navigate(ScreenNames.PostResolver, { tokenId: String(targetTokenId) });
    }, [navigation, quotedPost, quotedTokenId, hideUserProfile]);

    if (!isAvailable) {
      return (
        <View className="mt-3 rounded-xl border border-theme-neutrals-800 bg-theme-neutrals-800/30 p-3">
          <View className="flex-row items-center gap-2">
            <Ionicons name="alert-circle-outline" size={16} color="#6F7174" />
            <Text className="text-theme-neutrals-500 text-sm">
              This post is unavailable
            </Text>
          </View>
        </View>
      );
    }

    const minterUser = quotedPost.minterUser;
    const displayName =
      minterUser?.displayName ||
      minterUser?.username ||
      quotedPost.minterDisplayName ||
      quotedPost.minterUsername ||
      truncate(quotedPost.minter || "", 10, "..");
    const username =
      minterUser?.username || quotedPost.minterUsername;
    const avatarUrl = getAvatarUrl(
      minterUser?.avatarImageUrl || quotedPost.minterAvatarUrl || ""
    );
    const text = quotedPost.description || quotedPost.name || quotedPost.title || "";
    const truncatedText = text.length > 140 ? text.slice(0, 140) + "…" : text;

    // Thumbnail for image/video posts
    const thumbnailUrl = useMemo(() => {
      // Audio posts don't use a thumbnail — they render the AudioPostPlayer
      if (quotedPost.postType === "feed-audio") return "";
      // feed-images: imageUrls are relative API paths, need getImageUrlApiSimple
      if (quotedPost.postType === "feed-images") {
        const urls = Array.isArray(quotedPost.imageUrls) ? quotedPost.imageUrls : [];
        if (urls.length > 0) return getImageUrlApiSimple(urls[0]);
      }
      if (quotedPost.postType === "video") {
        return getImageUrl(quotedPost.thumbnailUrl || quotedPost.imageUrl || "");
      }
      // Fallback for any other type
      const imageUrls = Array.isArray(quotedPost.imageUrls)
        ? quotedPost.imageUrls
        : [];
      if (imageUrls.length > 0) {
        return getImageUrl(imageUrls[0]);
      }
      return getImageUrl(quotedPost.imageUrl || quotedPost.thumbnailUrl || "");
    }, [quotedPost]);

    const isAudioPost = quotedPost.postType === "feed-audio" && !!quotedPost.audioUrl;
    const hasThumbnail = !!thumbnailUrl;

    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        className="mt-3 rounded-xl border border-theme-neutrals-800 bg-theme-neutrals-800/20 overflow-hidden"
      >
        {/* Audio player for audio posts */}
        {isAudioPost && (
          <View className="px-3 pt-3">
            <AudioPostPlayer
              audioUrl={getAudioUrl(quotedPost.audioUrl)}
              duration={quotedPost.audioDuration || 0}
              tokenId={quotedPost.tokenId || quotedPost.id || quotedTokenId || 0}
              listens={quotedPost.listens}
              compact
            />
          </View>
        )}

        {/* Thumbnail */}
        {!isAudioPost && hasThumbnail && (
          <View className="w-full h-32 bg-theme-neutrals-800">
            <Image
              source={{ uri: thumbnailUrl }}
              className="w-full h-full"
              resizeMode="cover"
            />
            {quotedPost.postType === "video" && (
              <View className="absolute bottom-2 right-2 bg-black/60 rounded px-1.5 py-0.5">
                <Ionicons name="play" size={12} color="#fff" />
              </View>
            )}
          </View>
        )}

        {/* Content */}
        <View className="p-3">
          {/* Creator row */}
          <View className="flex-row items-center gap-2 mb-1.5">
            <Avatar uri={avatarUrl} size={18} name={displayName} />
            <Text className="text-white font-semibold text-xs" numberOfLines={1}>
              {displayName}
            </Text>
            {username && (
              <Text className="text-theme-neutrals-500 text-xs" numberOfLines={1}>
                @{username}
              </Text>
            )}
          </View>

          {/* Text excerpt */}
          {truncatedText.length > 0 && (
            <Text className="text-theme-neutrals-300 text-sm leading-5" numberOfLines={3}>
              {truncatedText}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }
);

QuotedPostEmbed.displayName = "QuotedPostEmbed";

export default QuotedPostEmbed;
