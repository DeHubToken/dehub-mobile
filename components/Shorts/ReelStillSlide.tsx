/**
 * ReelStillSlide
 * ==============
 * A post that is not a video or a photo, as one full-screen slide of the
 * profile reel (libs/profileReel): a text post is a poster of its own words on
 * the creator's post background, a comic is its collector-card deck, an article
 * shows its cover and opening lines, and a paid post shows a lock that opens
 * the post page to unlock it.
 *
 * The viewer's own chrome (back, like, comments, share, creator row) sits on
 * top, so the content keeps clear of the bottom and right edges.
 */
import React, { memo, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import type { ReelStill } from "../../libs/profileReel";
import { postBgById } from "../../libs/postBackgrounds";
import { POST_BG_INK, PostBgLayer } from "../Profile/PostBackground";
import ComicDeck from "../Home/ComicDeck";
import { Ionicons } from "@expo/vector-icons";

/** Words only: links shortened, markdown marks dropped, line breaks kept. */
function readable(text: string): string {
  return text
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/(www\.)?/g, "")
    .replace(/\b([a-z0-9-]+(\.[a-z0-9-]+)+\/\S{18,})/gi, (link: string) => `${link.slice(0, 26)}…`)
    .replace(/[*_`~>#]+/g, "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Short posts read big, long ones settle to a reading size. */
function posterSize(length: number): { fontSize: number; lineHeight: number } {
  if (length <= 40) return { fontSize: 34, lineHeight: 40 };
  if (length <= 90) return { fontSize: 28, lineHeight: 33 };
  if (length <= 180) return { fontSize: 23, lineHeight: 29 };
  if (length <= 360) return { fontSize: 19, lineHeight: 26 };
  return { fontSize: 17, lineHeight: 24.5 };
}

interface Props {
  still: ReelStill;
  width: number;
  height: number;
  isActive: boolean;
  /** The creator's profile post background (libs/postBackgrounds). */
  bgId?: string | null;
  onOpenPost: () => void;
}

function TextPoster({ still, height, isActive, bgId, onOpenPost }: Props) {
  const { t } = useTranslation();
  const words = useMemo(() => readable(still.text || ""), [still.text]);
  const bg = postBgById(bgId);
  const ink = bg ? POST_BG_INK[bg.tone] : POST_BG_INK.dark;
  const size = posterSize(words.length);
  // The words get the middle of the screen; the chrome owns the edges.
  const maxTextHeight = Math.max(160, height - 340);
  const [overflows, setOverflows] = useState(false);
  const onTextLayout = (e: LayoutChangeEvent) => {
    setOverflows(e.nativeEvent.layout.height >= maxTextHeight - 1);
  };
  return (
    <View style={StyleSheet.absoluteFill} className={bg ? "dark-surface" : undefined}>
      {bg ? (
        <PostBgLayer bg={bg} active={isActive} />
      ) : (
        <LinearGradient colors={["#2a2152", "#0d0d14", "#0f2a38"]} locations={[0, 0.55, 1]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
      )}
      <View style={styles.posterBody}>
        <Text style={[styles.quote, { color: ink.ink }]}>“</Text>
        <View style={{ maxHeight: maxTextHeight, overflow: "hidden" }} onLayout={onTextLayout}>
          <Text style={[styles.words, size, { color: ink.ink }]}>{words}</Text>
        </View>
        {overflows && (
          <LinearGradient pointerEvents="none" colors={["transparent", bg ? "transparent" : "rgba(13,13,20,0.9)"]} style={styles.fade} />
        )}
        <Pressable onPress={onOpenPost} style={[styles.pill, { backgroundColor: overflows ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.1)" }]} accessibilityRole="button">
          <Text style={[styles.pillText, { color: ink.ink }]}>{overflows ? t("reel.readAll", "Read all") : t("reel.openPost", "Open post")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ArticleSlide({ still, width, onOpenPost }: Props) {
  const { t } = useTranslation();
  return (
    <View style={[StyleSheet.absoluteFill, styles.article]}>
      {still.cover ? <Image source={{ uri: still.cover }} style={{ width: width - 48 - 52, aspectRatio: 16 / 9, borderRadius: 16, marginBottom: 20 }} contentFit="cover" /> : null}
      <Text style={styles.kicker}>{t("profile.articleShort", "Article")}</Text>
      <Text style={styles.articleTitle}>{readable(still.title || "")}</Text>
      <Text numberOfLines={4} style={styles.articleText}>{readable(still.text || "")}</Text>
      <Pressable onPress={onOpenPost} style={styles.solidPill} accessibilityRole="button">
        <Text style={styles.solidPillText}>{t("reel.readArticle", "Read article")}</Text>
      </Pressable>
    </View>
  );
}

function LockedSlide({ still, onOpenPost }: Props) {
  const { t } = useTranslation();
  return (
    <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: "#0a0a0d" }]}>
      {still.cover ? <Image source={{ uri: still.cover }} style={[StyleSheet.absoluteFill, { opacity: 0.6 }]} blurRadius={40} contentFit="cover" /> : null}
      <View style={styles.lockBadge}><Ionicons name="lock-closed" size={24} color="#fff" /></View>
      <Text style={styles.lockText}>{t("profile.lockedPost", "Locked post")}</Text>
      <Pressable onPress={onOpenPost} style={[styles.solidPill, { alignSelf: "center" }]} accessibilityRole="button">
        <Text style={styles.solidPillText}>{t("reel.openToUnlock", "Open to unlock")}</Text>
      </Pressable>
    </View>
  );
}

function ReelStillSlide(props: Props) {
  const { still, width, isActive } = props;
  if (still.kind === "text") return <TextPoster {...props} />;
  if (still.kind === "article") return <ArticleSlide {...props} />;
  if (still.kind === "locked") return <LockedSlide {...props} />;
  const images = still.images || [];
  return (
    <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: "#000", paddingBottom: 110, paddingRight: 40 }]}>
      <ComicDeck images={images} captions={still.captions} descriptions={still.alts} border={still.border} width={Math.min(420, width - 72)} active={isActive} />
    </View>
  );
}

export default memo(ReelStillSlide);

const styles = StyleSheet.create({
  posterBody: { flex: 1, justifyContent: "center", paddingLeft: 28, paddingRight: 76, paddingTop: 96, paddingBottom: 150 },
  quote: { fontSize: 64, lineHeight: 52, opacity: 0.4, fontFamily: "serif", marginBottom: 2 },
  words: { fontWeight: "600", letterSpacing: -0.2 },
  fade: { height: 56, marginTop: -56 },
  pill: { alignSelf: "flex-start", marginTop: 16, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  pillText: { fontSize: 14, fontWeight: "600" },
  article: { backgroundColor: "#0a0a0d", justifyContent: "center", paddingLeft: 24, paddingRight: 76, paddingTop: 90, paddingBottom: 150 },
  kicker: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: "600", letterSpacing: 1.6, textTransform: "uppercase", marginBottom: 8 },
  articleTitle: { color: "#fff", fontSize: 24, lineHeight: 29, fontWeight: "700" },
  articleText: { color: "rgba(255,255,255,0.75)", fontSize: 15, lineHeight: 22, marginTop: 12 },
  solidPill: { alignSelf: "flex-start", marginTop: 20, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: "#fff" },
  solidPillText: { color: "#000", fontSize: 14, fontWeight: "600" },
  center: { alignItems: "center", justifyContent: "center" },
  lockBadge: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  lockText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
