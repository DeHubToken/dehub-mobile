import React, { memo, useEffect, useState } from "react";
import { View, Text, Image, TouchableOpacity, ActivityIndicator, Dimensions } from "react-native";
import Icon from "../ui/Icon";
import { getNFT } from "../../services/nft.service";
import { getAvatarUrl } from "../../libs/misc";
import { truncateAddress } from "../../libs/strings.util";
import { nftToReplyPost, resolveReplyPostThumbnail } from "../../libs/replyPostDisplay";

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

// The bubble caps at 75% of the row (MessageBubble's MAX_IMAGE_WIDTH uses the
// same base). Keep the card + its mx-2 margins (16) inside that cap, or the
// bubble's overflow-hidden clips the card's right edge on narrow screens.
const CARD_WIDTH = Math.min(240, Math.round(Dimensions.get("window").width * 0.75) - 40);

/** True when the fetch came back without anything worth showing on the card. */
const isSparse = (meta: PostMeta, tokenId: string): boolean =>
  !meta.thumbnail && meta.title === `Post #${tokenId}`;

const resolveMeta = (raw: any, tokenId: string): PostMeta => {
  const r = raw?.result || raw || {};
  // Per-postType URL rules (imageUrls array for feed-images, thumbnail_url for
  // video/shorts, …) — same resolution the web's QuotedPostEmbed uses, so the
  // card shows the post image for every post type, not just video thumbnails.
  const tid = Number(tokenId) || 0;
  const thumbnail = resolveReplyPostThumbnail(nftToReplyPost(r, tid), tid) ?? null;
  const creator =
    r.minterUser?.displayName ||
    r.minterUser?.username ||
    r.minterDisplayName ||
    r.minterUsername ||
    (r.minter ? truncateAddress(r.minter, 4, 4) : "");
  const rawAvatar = r.minterUser?.avatarImageUrl || r.minterAvatarUrl || "";
  // Feed posts often have a blank-ish name (" ") — trim before falling back,
  // and use the description like the web card does before the generic label.
  const title =
    (r.name || "").trim() ||
    (r.title || "").trim() ||
    (r.description || "").trim().slice(0, 120) ||
    `Post #${tokenId}`;
  return {
    title,
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
      // Opening a conversation mounts every visible preview at once, so these
      // fetches go out in a burst; a single one losing out (timeout, throttle,
      // a response that came back without the post body) used to leave that
      // message on the bare "Post #<id>" chip permanently. Give it one more
      // try, and only cache a card that actually has something on it.
      let resolved: PostMeta | null = null;
      for (let attempt = 0; attempt < 2 && !cancelled; attempt++) {
        try {
          resolved = resolveMeta(await getNFT(tokenId), tokenId);
          if (!isSparse(resolved, tokenId)) break;
        } catch {
          resolved = null;
        }
        if (attempt === 0 && !cancelled) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }
      if (cancelled) return;
      if (resolved && !isSparse(resolved, tokenId)) metaCache.set(tokenId, resolved);
      setMeta(resolved);
      setLoading(false);
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
    // Spacing lives on this wrapper as padding (not card margins) — the bubble
    // auto-sizes to its children, and padding is always counted in that width,
    // so the card gets equal breathing room on all four sides.
    <View className="px-2 pt-2 pb-0.5">
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      className={`rounded-xl overflow-hidden border ${border}`}
      style={{ width: CARD_WIDTH }}
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
    </View>
  );
};

export default memo(SharedPostPreviewComponent);
