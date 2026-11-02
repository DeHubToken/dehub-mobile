import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../context/ThemeContext";
import { usePagerGestureRef } from "../../context/PagerGestureContext";
import { measureImageAspect } from "../common/SmartImage";
import AltTextBadge from "./AltTextBadge";

/**
 * Comic posts as foil collector cards, the same cards as dehub.io.
 *
 * The feed shows the top card with the next two fanned behind it: drag
 * sideways and the card leans and the holo shine moves; let go past the edge
 * and the next card is dealt; tap opens the post. The post page adds the hand
 * of every page under the card, a tap flips the card to its caption and alt
 * text, and "Read all pages" lists the pages in order.
 */

type Foil = [string, string, string, string];
/** Light, accent, deep, and the card face. The foil follows the theme. */
const FOILS: Record<string, Foil> = {
  horror: ["#ffd0d4", "#ff6874", "#a92c3a", "#150c0f"],
  hazy: ["#f1dcff", "#c08bff", "#6d3fb4", "#150f20"],
  cosmic: ["#dfe3ff", "#8f9bff", "#3f47b4", "#0f1120"],
  osaka: ["#ffd6ea", "#ff6fb5", "#a3306b", "#180d16"],
  jungle: ["#eef3cf", "#b9d38a", "#5f7a33", "#19140d"],
  war: ["#d4fffd", "#4fe3e0", "#1d7f7d", "#08130f"],
  hacker: ["#d6ffe4", "#39ff88", "#138a43", "#03100a"],
  island: ["#e0f4ff", "#7dd3fc", "#2a7fb0", "#0e1828"],
  winter: ["#f2fbff", "#bae6fd", "#6aa6c9", "#101823"],
  lavalamp: ["#ffe6cc", "#fdba74", "#b5622a", "#1a0d08"],
};
const GOLD: Foil = ["#f7e7b4", "#c9a24e", "#a9822f", "#15101a"];
const INK = "#f3ebe4";
const SERIF = Platform.select({ ios: "Georgia", default: "serif" });
const MONO = Platform.select({ ios: "Menlo", default: "monospace" });
const HOLO = ["#ff6ec4", "#ffd36e", "#7af0c6", "#6ea8ff", "#c58bff", "#ff6ec4", "#ffd36e", "#7af0c6"] as const;
const SPRING = { stiffness: 160, damping: 14, mass: 1 };
const MAX_TILT = 14;

const pad2 = (n: number) => String(n).padStart(2, "0");

function ComicDeck({ images, captions, descriptions, title, width, onOpen, full = false }: {
  images: string[];
  captions?: string[];
  descriptions?: string[];
  title?: string;
  /** The space the deck has. */
  width: number;
  /** Feed: a tap opens the post. Leave out on the post page, where a tap flips. */
  onOpen?: () => void;
  full?: boolean;
}) {
  const { t } = useTranslation();
  const { theme } = useAppTheme();
  const foil = FOILS[theme] ?? GOLD;
  const pagerRef = usePagerGestureRef();
  const total = images.length;
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reading, setReading] = useState(false);
  const [ratio, setRatio] = useState(0.75);

  // The art box takes the cover's shape, kept between tall and wide.
  useEffect(() => {
    let live = true;
    if (images[0]) measureImageAspect(images[0]).then(r => { if (live && r) setRatio(Math.max(0.62, Math.min(1.5, r))); });
    return () => { live = false; };
  }, [images]);

  const cardW = Math.round(Math.min(ratio > 1 ? width * 0.88 : width * 0.78, ratio > 1 ? 420 : 340));
  const artW = cardW - 12 - 16;
  const artH = Math.round(artW / ratio);

  const rx = useSharedValue(0);
  const ry = useSharedValue(0);
  const dx = useSharedValue(0);
  const flip = useSharedValue(0);

  useEffect(() => { flip.value = withSpring(flipped ? 180 : 0, SPRING); }, [flipped, flip]);

  const go = useCallback((step: number) => {
    setFlipped(false);
    setIndex(i => Math.max(0, Math.min(total - 1, i + step)));
  }, [total]);
  const tap = useCallback(() => {
    if (onOpen) onOpen();
    else setFlipped(f => !f);
  }, [onOpen]);

  const cardH = artH + 92;
  const gesture = useMemo(() => {
    let pan = Gesture.Pan()
      .activeOffsetX([-10, 10])
      .failOffsetY([-12, 12])
      .onUpdate(e => {
        const atEdge = (e.translationX > 0 && index === 0) || (e.translationX < 0 && index === total - 1);
        dx.value = atEdge ? e.translationX / 4 : e.translationX;
        ry.value = Math.max(-MAX_TILT, Math.min(MAX_TILT, e.translationX / 8));
        rx.value = Math.max(-MAX_TILT, Math.min(MAX_TILT, -((e.y / cardH) - 0.5) * 2 * MAX_TILT));
      })
      .onEnd(e => {
        if (e.translationX < -60 && index < total - 1) { runOnJS(go)(1); dx.value = 40; }
        else if (e.translationX > 60 && index > 0) { runOnJS(go)(-1); dx.value = -40; }
        dx.value = withSpring(0, SPRING);
        rx.value = withSpring(0, SPRING);
        ry.value = withSpring(0, SPRING);
      });
    if (pagerRef) pan = pan.blocksExternalGesture(pagerRef);
    const press = Gesture.Tap().maxDuration(450).onEnd((_e, ok) => { if (ok) runOnJS(tap)(); });
    return Gesture.Race(pan, press);
  }, [index, total, cardH, go, tap, pagerRef, dx, rx, ry]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dx.value },
      { rotateZ: `${dx.value / 30}deg` },
    ],
  }));
  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 900 },
      { rotateX: `${rx.value}deg` },
      { rotateY: `${ry.value + flip.value}deg` },
    ],
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 900 },
      { rotateX: `${rx.value}deg` },
      { rotateY: `${ry.value + flip.value + 180}deg` },
    ],
  }));
  const holoStyle = useAnimatedStyle(() => ({
    opacity: 0.12 + Math.min(0.4, (Math.abs(rx.value) + Math.abs(ry.value)) / 40),
    transform: [{ translateX: interpolate(ry.value, [-MAX_TILT, MAX_TILT], [-cardW * 0.6, cardW * 0.6]) }],
  }));
  const floorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dx.value + ry.value * 1.2 }, { scaleX: 1 - Math.abs(ry.value) / 90 }],
  }));

  const caption = captions?.[index]?.trim() || "";
  const alt = descriptions?.[index]?.trim() || "";
  const pageLabel = `${pad2(index + 1)} / ${pad2(total)}`;
  const name = title?.trim() || t("comic.title", { defaultValue: "Comic" });
  const behind = [index + 1, index + 2].filter(i => i < total);

  if (reading) {
    return (
      <View style={{ paddingHorizontal: 4, paddingBottom: 8 }}>
        <View style={styles.readHead}>
          <Text style={styles.readTitle} numberOfLines={1}>{name}</Text>
          <Pressable onPress={() => setReading(false)} style={styles.pill} accessibilityRole="button">
            <Text style={styles.pillText}>{t("comic.cards", { defaultValue: "Back to cards" })}</Text>
          </Pressable>
        </View>
        {images.map((uri, i) => (
          <View key={`${uri}-${i}`} style={{ marginBottom: 18 }}>
            <ReadPage uri={uri} width={width - 8} alt={descriptions?.[i]} />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Text style={styles.readNum}>{pad2(i + 1)}</Text>
              {captions?.[i]?.trim() ? <Text style={styles.readCap}>{captions[i]}</Text> : null}
            </View>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={{ alignItems: "center", paddingTop: 44, paddingBottom: full ? 12 : 20 }}>
      <View style={styles.chip} pointerEvents="none">
        <Text style={styles.chipText}>✦ {t("comic.chip", { defaultValue: "Comic · {{count}} pages", count: total })}</Text>
      </View>

      <View style={{ width: cardW, height: cardH }}>
        {behind.map((i, n) => (
          <LinearGradient
            key={i}
            colors={[foil[0], foil[1], foil[0], foil[2]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, styles.side, {
              zIndex: -1 - n,
              transform: [{ translateX: (n + 1) * 14 }, { translateY: (n + 1) * 6 }, { rotate: `${(n + 1) * 4}deg` }, { scale: 1 - (n + 1) * 0.04 }],
            }]}
          >
            <View style={[styles.ghostFace, { backgroundColor: foil[3] }]}>
              <Image source={{ uri: images[i] }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={images[i]} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${0.35 + n * 0.15})` }]} />
            </View>
          </LinearGradient>
        ))}

        <Animated.View style={[styles.floor, { width: cardW * 0.84, left: cardW * 0.08, top: cardH - 10 }, floorStyle]} />

        <GestureDetector gesture={gesture}>
          <Animated.View
            style={[StyleSheet.absoluteFill, cardStyle]}
            accessible
            accessibilityRole="button"
            accessibilityLabel={onOpen
              ? t("comic.open", { defaultValue: "Open comic, page {{page}} of {{total}}", page: index + 1, total })
              : t("comic.flip", { defaultValue: "Page {{page}} of {{total}}. Tap to flip", page: index + 1, total })}
            accessibilityActions={[{ name: "increment" }, { name: "decrement" }, { name: "activate" }]}
            onAccessibilityAction={e => {
              if (e.nativeEvent.actionName === "increment") go(1);
              else if (e.nativeEvent.actionName === "decrement") go(-1);
              else tap();
            }}
          >
            {/* Front */}
            <Animated.View style={[StyleSheet.absoluteFill, styles.side, frontStyle]}>
              <LinearGradient colors={[foil[0], foil[1], foil[0], foil[2], foil[0]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <View style={[styles.face, { backgroundColor: foil[3] }]}>
                <View style={styles.top}>
                  <Text style={styles.title} numberOfLines={1}>{name}</Text>
                  <Text style={styles.num}>{pageLabel}</Text>
                </View>
                <View style={[styles.art, { height: artH }]}>
                  <Image
                    source={{ uri: images[index] }}
                    style={StyleSheet.absoluteFill}
                    contentFit="contain"
                    transition={120}
                    recyclingKey={images[index]}
                    accessibilityLabel={alt || undefined}
                  />
                  {alt ? <View style={styles.altSpot} pointerEvents="box-none"><AltTextBadge text={alt} /></View> : null}
                </View>
                <Text style={styles.cap} numberOfLines={3}>{caption}</Text>
              </View>
              <Animated.View pointerEvents="none" style={[styles.holoWrap, holoStyle]}>
                <LinearGradient colors={HOLO} start={{ x: 0, y: 0.2 }} end={{ x: 1, y: 0.8 }} style={StyleSheet.absoluteFill} />
              </Animated.View>
              <LinearGradient
                pointerEvents="none"
                colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0)", "rgba(255,255,255,0)"]}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>

            {/* Back */}
            <Animated.View style={[StyleSheet.absoluteFill, styles.side, styles.back, { backgroundColor: foil[3], borderColor: foil[1] }, backStyle]}>
              <Text style={[styles.lab, { color: foil[1] }]}>{t("comic.page", { defaultValue: "Page {{page}}", page: index + 1 })}</Text>
              <Text style={styles.backTitle}>{caption || name}</Text>
              {alt ? (
                <>
                  <Text style={[styles.lab, { color: foil[1] }]}>{t("comic.alt", { defaultValue: "Alt text" })}</Text>
                  <Text style={styles.backAlt}>{alt}</Text>
                </>
              ) : null}
              <View style={styles.backFoot}>
                <Text style={styles.footText} numberOfLines={1}>{title}</Text>
                <Text style={styles.footText}>{pageLabel}</Text>
              </View>
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>

      {/* The next page, warmed so the deal is instant. */}
      {index + 1 < total ? <Image source={{ uri: images[index + 1] }} style={styles.warm} /> : null}

      {full && total > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 24, maxWidth: width }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, alignItems: "flex-end" }}
        >
          {images.map((uri, i) => (
            <Pressable
              key={`${uri}-${i}`}
              onPress={() => go(i - index)}
              accessibilityRole="button"
              accessibilityState={{ selected: i === index }}
              accessibilityLabel={t("comic.goto", { defaultValue: "Page {{page}}", page: i + 1 })}
              style={[styles.mini, {
                marginLeft: i === 0 ? 0 : total > 8 ? -8 : 4,
                zIndex: i === index ? total : i,
                transform: [{ translateY: i === index ? -10 : 0 }, { rotate: `${(i - (total - 1) / 2) * Math.min(4, 40 / total)}deg` }],
                borderColor: i === index ? "#fff" : foil[1],
              }]}
            >
              <Image source={{ uri }} style={styles.miniImg} contentFit="cover" />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {full ? (
        <Pressable onPress={() => setReading(true)} style={[styles.pill, { marginTop: 12 }]} accessibilityRole="button">
          <Text style={styles.pillText}>{t("comic.readAll", { defaultValue: "Read all pages" })}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ReadPage({ uri, width, alt }: { uri: string; width: number; alt?: string }) {
  const [ratio, setRatio] = useState<number>();
  useEffect(() => {
    let live = true;
    measureImageAspect(uri).then(r => { if (live && r) setRatio(r); });
    return () => { live = false; };
  }, [uri]);
  return (
    <Image
      source={{ uri }}
      style={{ width, height: width / (ratio ?? 1), borderRadius: 8, backgroundColor: "rgba(0,0,0,0.4)" }}
      contentFit="contain"
      accessibilityLabel={alt || undefined}
    />
  );
}

const styles = StyleSheet.create({
  side: { borderRadius: 14, overflow: "hidden", backfaceVisibility: "hidden" },
  face: { position: "absolute", top: 6, left: 6, right: 6, bottom: 6, borderRadius: 9, overflow: "hidden" },
  ghostFace: { position: "absolute", top: 6, left: 6, right: 6, bottom: 6, borderRadius: 9, overflow: "hidden" },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 6 },
  title: { flex: 1, color: INK, fontFamily: SERIF, fontStyle: "italic", fontWeight: "600", fontSize: 14 },
  num: { color: INK, fontFamily: MONO, fontSize: 10, letterSpacing: 0.4 },
  art: { marginHorizontal: 8, borderRadius: 4, overflow: "hidden", backgroundColor: "#0b0b0e", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.18)" },
  altSpot: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 },
  cap: { color: INK, fontFamily: SERIF, fontStyle: "italic", fontSize: 13.5, lineHeight: 18, paddingHorizontal: 11, paddingTop: 8, paddingBottom: 10, minHeight: 50 },
  holoWrap: { position: "absolute", top: 0, bottom: 0, left: "-100%", width: "300%" },
  floor: { position: "absolute", height: 26, borderRadius: 30, backgroundColor: "rgba(0,0,0,0.45)" },
  back: { borderWidth: 6, padding: 16, gap: 10 },
  lab: { fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.6, textTransform: "uppercase" },
  backTitle: { color: INK, fontFamily: SERIF, fontStyle: "italic", fontWeight: "600", fontSize: 20, lineHeight: 25 },
  backAlt: { color: "rgba(255,255,255,0.72)", fontSize: 13, lineHeight: 19 },
  backFoot: { marginTop: "auto", flexDirection: "row", justifyContent: "space-between", gap: 8 },
  footText: { color: "rgba(255,255,255,0.5)", fontFamily: MONO, fontSize: 10 },
  chip: { position: "absolute", top: 8, left: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(10,6,8,0.62)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  chipText: { color: "#fff", fontSize: 11, fontWeight: "500" },
  warm: { width: 1, height: 1, opacity: 0, position: "absolute" },
  mini: { width: 34, height: 48, padding: 2, borderRadius: 6, borderWidth: 2, backgroundColor: "#111" },
  miniImg: { flex: 1, borderRadius: 3 },
  pill: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  pillText: { color: "#fff", fontSize: 12, fontWeight: "500" },
  readHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingVertical: 8 },
  readTitle: { flex: 1, color: "#fff", fontWeight: "600", fontSize: 15 },
  readNum: { color: "rgba(255,255,255,0.5)", fontFamily: MONO, fontSize: 11, paddingTop: 2 },
  readCap: { flex: 1, color: "#fff", fontFamily: SERIF, fontStyle: "italic", fontSize: 14, lineHeight: 20 },
});

export default memo(ComicDeck);
