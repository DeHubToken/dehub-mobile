/**
 * The square-thumbnail tile both fraction grids are built from — a market
 * listing and a held position are the same shape with different lines under
 * the picture, so they share the frame, the "n / 1000" chip and the fallback.
 *
 * The title and thumbnail come off the listing's snapshot (or the position's),
 * never a per-card fetch: a grid of sixty is one query.
 */
import React, { memo, useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import Icon from "../ui/Icon";
import { TOTAL_FRACTIONS } from "../../hooks/useFractionMarket";
import { getNFT } from "../../services/nft.service";
import { fractionImageFor, firstFeedImage } from "../../libs/fractionThumb";

const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

/**
 * Older listings of multi-image posts were saved without a picture, posts can
 * be deleted, and text and audio posts never had one. When the snapshot is
 * missing or fails to load, ask the post itself once (cached for an hour).
 */
function useFractionPostPreview(tokenId: string, postType: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["fraction-post-preview", tokenId],
    enabled,
    staleTime: 60 * 60_000,
    retry: false,
    queryFn: async () => {
      try {
        const post: any = (await getNFT(tokenId, { allowAnonymous: true })).result;
        return {
          imageUrl: fractionImageFor(post, 200) || firstFeedImage(tokenId, postType),
          title: String(post?.name || "").trim() || null,
          text: String(post?.description || "").trim() || null,
          postType: (post?.postType as string) || null,
        };
      } catch {
        return { imageUrl: firstFeedImage(tokenId, postType), title: null, text: null, postType: null };
      }
    },
  });
}

interface Props {
  tokenId: string;
  title: string | null;
  imageUrl: string | null;
  postType?: string | null;
  /** The number on the chip: fractions available, or held. */
  units: number;
  showYours?: boolean;
  onPress: () => void;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

const FractionTile: React.FC<Props> = ({
  tokenId,
  title,
  imageUrl,
  postType,
  units,
  showYours,
  onPress,
  children,
  footer,
}) => {
  const { t } = useTranslation();
  const [failed, setFailed] = useState<string | null>(null);
  const needsPost = !imageUrl || failed === imageUrl;
  const { data: post } = useFractionPostPreview(tokenId, postType, needsPost);
  const fallback = post?.imageUrl && failed !== post.imageUrl ? post.imageUrl : null;
  const src = needsPost ? fallback : imageUrl;
  const heading = (title || "").trim() || post?.title || "";
  const body = post?.text || "";
  const isAudio = /audio/.test(postType || post?.postType || "");
  const name = heading || t("fractions.postNumber", { id: tokenId });
  return (
    <View style={styles.card}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={name}>
        <View style={styles.thumb}>
          {src ? (
            <Image
              source={{ uri: src }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={150}
              onError={() => setFailed(src)}
            />
          ) : (
            // Text card: poems and other picture-less posts read as themselves.
            <View style={styles.textCard}>
              {isAudio && <Icon name="Music" size={22} color="rgba(255,255,255,0.3)" />}
              {!!heading && (
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {heading}
                </Text>
              )}
              {!!body && (
                <Text style={styles.cardBody} numberOfLines={4}>
                  {body}
                </Text>
              )}
              {!heading && !body && <Text style={styles.cardBody}>#{tokenId}</Text>}
            </View>
          )}
          <View style={[styles.chip, styles.chipLeft]}>
            <Text style={styles.chipText}>
              {units} / {TOTAL_FRACTIONS}
            </Text>
          </View>
          {showYours && (
            <View style={[styles.chip, styles.chipRight, styles.chipYours]}>
              <Text style={[styles.chipText, styles.chipYoursText]}>{t("fractions.yours")}</Text>
            </View>
          )}
        </View>
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {name}
          </Text>
          {children}
        </View>
      </Pressable>
      {footer}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  thumb: {
    aspectRatio: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  textCard: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 12,
    paddingTop: 34,
    paddingBottom: 10,
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  cardTitle: { fontFamily: SERIF, color: "rgba(255,255,255,0.92)", fontSize: 14, lineHeight: 19, fontWeight: "700" },
  cardBody: { fontFamily: SERIF, color: "rgba(255,255,255,0.55)", fontSize: 10.5, lineHeight: 15 },
  chip: {
    position: "absolute",
    top: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  chipLeft: { left: 8 },
  chipRight: { right: 8 },
  chipYours: { backgroundColor: "rgba(255,255,255,0.9)" },
  chipText: { color: "rgba(255,255,255,0.9)", fontSize: 10, fontWeight: "700", flexShrink: 0 },
  chipYoursText: { color: "#09090B" },
  body: { padding: 10, gap: 3 },
  title: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
});

export default memo(FractionTile);
