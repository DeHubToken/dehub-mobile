import React, { memo, useEffect, useState } from "react";
import { View, Text, Image, TouchableOpacity, ActivityIndicator } from "react-native";
import Icon from "../ui/Icon";
import { getNFT } from "../../services/nft.service";
import { getImageUrl, getAvatarUrl } from "../../libs/misc";
import { truncateAddress } from "../../libs/strings.util";

/**
 * Rich preview card for a DeHub post link shared in a DM — mirrors the web
 * chat's link-preview card, but fetches the post's own metadata (title,
 * thumbnail, creator) via getNFT instead of an OG scraper. Tapping opens the
 * post. Falls back to a plain "View post" chip if the metadata can't load.
 */

interface PostMeta {
  title: string;
  thumbnail: string | null;
  creator: string;
  creatorAvatar: string | null;
}

// Module-level cache so the same shared post isn't re-fetched for every render
// or for repeated shares of the same link in a conversation.
const metaCache = new Map<string, PostMeta | null>();

const resolveMeta = (raw: any, tokenId: string): PostMeta => {
  const r = raw?.result || raw || {};
  const rawThumb = r.thumbnail || r.thumbnailUrl || r.imageUrl || "";
  const thumbnail = rawThumb ? getImageUrl(rawThumb, 640, 360) : null;
  const creator =
    r.minterUser?.displayName ||
    r.minterUser?.username ||
    r.minterDisplayName ||
    r.minterUsername ||
    (r.minter ? truncateAddress(r.minter, 4, 4) : "");
  const rawAvatar = r.minterUser?.avatarImageUrl || r.minterAvatarUrl || "";
  return {
    title: r.name || r.title || `Post #${tokenId}`,
    thumbnail,
    creator,
    creatorAvatar: rawAvatar ? getAvatarUrl(rawAvatar) : null,
  };
};

interface SharedPostPreviewProps {
  tokenId: string;
  isMine: boolean;
  /** Caption/title text that came alongside the link, if any. */
  fallbackTitle?: string;
  onPress: () => void;
  onLongPress?: () => void;
}

const SharedPostPreviewComponent: React.FC<SharedPostPreviewProps> = ({
  tokenId,
  isMine,
  fallbackTitle,
  onPress,
  onLongPress,
}) => {
  const [meta, setMeta] = useState<PostMeta | null>(() =>
    metaCache.has(tokenId) ? metaCache.get(tokenId)! : null,
  );
  const [loading, setLoading] = useState(!metaCache.has(tokenId));

  useEffect(() => {
    if (metaCache.has(tokenId)) {
      setMeta(metaCache.get(tokenId)!);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await getNFT(tokenId);
        const resolved = resolveMeta(res, tokenId);
        metaCache.set(tokenId, resolved);
        if (!cancelled) setMeta(resolved);
      } catch {
        metaCache.set(tokenId, null);
        if (!cancelled) setMeta(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenId]);

  const border = isMine ? "border-white/20 bg-white/10" : "border-theme-neutrals-700 bg-theme-neutrals-700/40";
  const titleColor = isMine ? "text-white" : "text-theme-neutrals-100";
  const subColor = isMine ? "text-white/60" : "text-theme-neutrals-400";
  const title = meta?.title || fallbackTitle;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      className={`mx-2 mt-2 mb-0.5 rounded-xl overflow-hidden border ${border}`}
      style={{ width: 240 }}
    >
      {loading ? (
        <View className="h-32 items-center justify-center bg-black/20">
          <ActivityIndicator size="small" color={isMine ? "#fff" : "#888"} />
        </View>
      ) : meta?.thumbnail ? (
        <Image
          source={{ uri: meta.thumbnail }}
          style={{ width: "100%", height: 132 }}
          resizeMode="cover"
        />
      ) : null}

      <View className="px-3 py-2">
        <View className="flex-row items-center gap-1 mb-0.5">
          <Icon name="Link" size={11} color={isMine ? "rgba(255,255,255,0.6)" : "#71717a"} />
          <Text className={`text-[10px] ${subColor}`}>DeHub post</Text>
        </View>
        {!!title && (
          <Text className={`text-[13px] font-semibold leading-4 ${titleColor}`} numberOfLines={2}>
            {title}
          </Text>
        )}
        {!!meta?.creator && (
          <View className="flex-row items-center gap-1.5 mt-1.5">
            {meta.creatorAvatar && meta.creatorAvatar !== "default-avatar" ? (
              <Image
                source={{ uri: meta.creatorAvatar }}
                style={{ width: 16, height: 16, borderRadius: 8 }}
              />
            ) : null}
            <Text className={`text-[11px] ${subColor}`} numberOfLines={1}>
              {meta.creator}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

export default memo(SharedPostPreviewComponent);
