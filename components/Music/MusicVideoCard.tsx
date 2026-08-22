/**
 * MusicVideoCard — one poster in the Music Videos shelf
 * =====================================================
 * The carousel counterpart of web's `InlineVideoCard`, minus the hover-to-play
 * video: on a phone there is no hover, and half a dozen autoplaying videos in a
 * horizontal shelf is a battery bill, not a feature. Tapping opens the post,
 * where the real player lives.
 *
 * @module components/Music/MusicVideoCard
 */

import React, { useCallback } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";

import Icon from "../ui/Icon";
import Avatar from "../common/Avatar";
import { ScreenNames } from "../../navigation/ScreenNames";
import { getAvatarUrl, getImageUrl } from "../../libs/misc";
import { secondsToHMMSS } from "../../libs/date.util";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import type { GetNFTsResult } from "../../services/nft.service";

export const MUSIC_CARD_WIDTH = 240;

const MusicVideoCard: React.FC<{ nft: GetNFTsResult }> = ({ nft }) => {
  const navigation = useNavigation<any>();
  const { showUserProfile } = useUserProfileSheet();

  const tokenId = nft.tokenId ?? nft.id;
  const title = nft.name || (nft as any).title || "";
  const creator =
    (nft as any).minterDisplayName ||
    (nft as any).minterUsername ||
    (nft as any).mintername ||
    "Anonymous";
  const handle = (nft as any).minterUsername || (nft as any).mintername || (nft as any).minter;
  const rawThumb = (nft as any).thumbnail || nft.thumbnailUrl || nft.imageUrl || "";
  const thumb = getImageUrl(rawThumb, MUSIC_CARD_WIDTH);
  const rawAvatar = (nft as any).minterAvatarUrl || (nft as any).minterUser?.avatarImageUrl || "";
  const duration = secondsToHMMSS(nft.videoDuration);

  const openPost = useCallback(() => {
    if (tokenId == null) return;
    navigation.navigate(ScreenNames.FeedDetail, {
      tokenId: String(tokenId),
      postId: String(tokenId),
    });
  }, [navigation, tokenId]);

  const openCreator = useCallback(() => {
    if (handle) showUserProfile(String(handle));
  }, [handle, showUserProfile]);

  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={openPost} activeOpacity={0.85} style={styles.thumbWrap}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        ) : (
          <Icon name="Music" size={26} color="#52525B" />
        )}
        <View style={styles.playPill}>
          <Icon name="Play" size={16} color="#FFFFFF" fill="#FFFFFF" />
        </View>
        {!!duration && (
          <View style={styles.durationPill}>
            <Text style={styles.durationText}>{duration}</Text>
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.meta}>
        <TouchableOpacity onPress={openCreator} hitSlop={6} accessibilityRole="button">
          <Avatar uri={rawAvatar ? getAvatarUrl(rawAvatar, 32) : null} size={28} name={creator} />
        </TouchableOpacity>
        <View style={styles.metaText}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.creator} numberOfLines={1}>
            {creator}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: MUSIC_CARD_WIDTH,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 8,
  },
  thumbWrap: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#18181B",
    alignItems: "center",
    justifyContent: "center",
  },
  playPill: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  durationPill: {
    position: "absolute",
    right: 6,
    bottom: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  durationText: {
    color: "#FFFFFF",
    fontSize: 10,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  metaText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "500",
  },
  creator: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    marginTop: 1,
  },
});

export default React.memo(MusicVideoCard);
