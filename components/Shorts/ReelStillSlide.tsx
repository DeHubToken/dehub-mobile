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
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import type { ReelStill } from "../../libs/profileReel";
import { postBgById } from "../../libs/postBackgrounds";
import { POST_BG_INK, PostBgLayer } from "../Profile/PostBackground";
import ComicDeck from "../Home/ComicDeck";
import { Ionicons } from "@expo/vector-icons";
import { CHROME_RADIUS, CHROME_SIZE, ChromeFill, EDGE, TEXT_SHADOW } from "../common/ViewerChrome";

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

function TextPoster({ still, height, isActive, bgId }: Props) {
  const { t } = useTranslation();
  const words = useMemo(() => readable(still.text || ""), [still.text]);
  const bg = postBgById(bgId);
  const ink = bg ? POST_BG_INK[bg.tone] : POST_BG_INK.dark;
  const size = posterSize(words.length);
  // The words get the middle of the screen; the chrome owns the edges.
  const maxTextHeight = Math.max(160, height - 330);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const onTextLayout = (e: LayoutChangeEvent) => {
    if (!expanded) setOverflows(e.nativeEvent.layout.height > maxTextHeight + 12);
  };
  const body = (
    <Text onLayout={onTextLayout} style={[styles.words, size, { color: ink.ink }]}>{words}</Text>
  );
  return (
    <View style={StyleSheet.absoluteFill} className={bg ? "dark-surface" : undefined}>
      {bg ? (
        <PostBgLayer bg={bg} active={isActive} />
      ) : (
        <LinearGradient colors={["#2a2152", "#0d0d14", "#0f2a38"]} locations={[0, 0.55, 1]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
      )}
      <View style={styles.posterBody}>
        <Text style={[styles.quote, { color: ink.ink }]}>“</Text>
        {/* A long post opens in place the way a short's caption does: "more"
            under it, then the words scroll and "less" closes them. */}
        {expanded ? (
          <ScrollView style={{ maxHeight: maxTextHeight }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {body}
          </ScrollView>
        ) : (
          <View style={{ maxHeight: maxTextHeight, overflow: "hidden" }}>{body}</View>
        )}
        {overflows && !expanded && (
          <LinearGradient pointerEvents="none" colors={["transparent", bg ? "transparent" : "rgba(13,13,20,0.9)"]} style={styles.fade} />
        )}
        {overflows && (
          <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={10} style={styles.more} accessibilityRole="button">
            <Text style={[styles.moreText, { color: ink.ink }]}>
              {expanded ? t("copy.4fdd3b6201a2", { defaultValue: "less" }) : t("copy.187897ce0afc", { defaultValue: "more" })}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** A labelled button in the shorts top-row glass. */
function ChromePill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={styles.chromePill} className="dark-surface" accessibilityRole="button">
      <ChromeFill top radius={CHROME_RADIUS} />
      <Text style={styles.chromePillText}>{label}</Text>
    </Pressable>
  );
}

function ArticleSlide({ still, width, onOpenPost }: Props) {
  const { t } = useTranslation();
  return (
    <View style={[StyleSheet.absoluteFill, styles.article]}>
      {still.cover ? <Image source={{ uri: still.cover }} style={{ width: width - EDGE * 2, aspectRatio: 16 / 9, borderRadius: 16, marginBottom: 20 }} contentFit="cover" /> : null}
      <Text style={styles.kicker}>{t("profile.articleShort", "Article")}</Text>
      <Text style={styles.articleTitle}>{readable(still.title || "")}</Text>
      <Text numberOfLines={4} style={styles.articleText}>{readable(still.text || "")}</Text>
      <View style={{ marginTop: 20, alignSelf: "flex-start" }}>
        <ChromePill label={t("reel.readArticle", "Read article")} onPress={onOpenPost} />
      </View>
    </View>
  );
}

function LockedSlide({ still, onOpenPost }: Props) {
  const { t } = useTranslation();
  return (
    <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: "#0a0a0d" }]}>
      {still.cover ? <Image source={{ uri: still.cover }} style={[StyleSheet.absoluteFill, { opacity: 0.6 }]} blurRadius={40} contentFit="cover" /> : null}
      <View style={styles.lockBadge} className="dark-surface"><ChromeFill top radius={16} /><Ionicons name="lock-closed" size={24} color="#fff" /></View>
      <Text style={styles.lockText}>{t("profile.lockedPost", "Locked post")}</Text>
      <View style={{ marginTop: 16 }}>
        <ChromePill label={t("reel.openToUnlock", "Open to unlock")} onPress={onOpenPost} />
      </View>
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
    <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: "#000", paddingBottom: 150, paddingTop: 84 }]}>
      <ComicDeck images={images} captions={still.captions} descriptions={still.alts} border={still.border} width={Math.min(420, width - EDGE * 2)} active={isActive} />
    </View>
  );
}

export default memo(ReelStillSlide);

const styles = StyleSheet.create({
  // The shorts frame: EDGE sides like the caption, clear of the top row and of
  // the creator row + action row at the foot.
  posterBody: { flex: 1, justifyContent: "center", paddingHorizontal: EDGE, paddingTop: 84, paddingBottom: 170 },
  quote: { fontSize: 64, lineHeight: 52, opacity: 0.4, fontFamily: "serif", marginBottom: 2 },
  words: { fontWeight: "600", letterSpacing: -0.2 },
  fade: { height: 56, marginTop: -56 },
  // The caption's "more": 12pt at 60%, 4pt under the words.
  more: { alignSelf: "flex-start", marginTop: 4 },
  moreText: { fontSize: 12, opacity: 0.6, ...TEXT_SHADOW },
  chromePill: { height: CHROME_SIZE, borderRadius: CHROME_RADIUS, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", alignSelf: "flex-start", overflow: "hidden" },
  chromePillText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  article: { backgroundColor: "#0a0a0d", justifyContent: "center", paddingHorizontal: EDGE, paddingTop: 84, paddingBottom: 170 },
  kicker: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: "600", letterSpacing: 1.6, textTransform: "uppercase", marginBottom: 8 },
  articleTitle: { color: "#fff", fontSize: 24, lineHeight: 29, fontWeight: "700" },
  articleText: { color: "rgba(255,255,255,0.75)", fontSize: 15, lineHeight: 22, marginTop: 12 },
  center: { alignItems: "center", justifyContent: "center" },
  lockBadge: { width: 56, height: 56, borderRadius: 16, overflow: "hidden", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  lockText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
