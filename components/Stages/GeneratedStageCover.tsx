import { translateCopy as _translateCopy } from '../../i18n/copy';
/**
 * GeneratedStageCover — the poster a stage gets when the host set no cover
 * ========================================================================
 * Port of web's component of the same name. The art comes from
 * libs/stage-cover (a hash of the stage id), so a stage shows the same poster
 * here as on dehub.io: "Chrome Mic", a DeHub banner with a smoky brand-kit
 * backdrop, the title in chrome with //STATUS above it, and the 3D chrome mic.
 *
 * The pictures are bundled JS assets (assets/stage-cover) and the chrome is
 * MaskedView + expo-linear-gradient, all already in the binary, so it ships
 * over the air. Sizes are fractions of the measured width (`u` = 1cqw on
 * web). The art is a picture and stays dark in every theme: `dark-surface`
 * keeps System Light from re-inking its text.
 *
 * Under 300pt wide the corner tag, the host line and the dehub.io box drop
 * out, which would otherwise be too small to read.
 *
 * @module components/Stages/GeneratedStageCover
 */

import React, { useMemo, useState } from "react";
import { Image as RNImage, Platform, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { buildStageCover, stageCoverTitleScale, type StageCoverSource } from "../../libs/stage-cover";
import { appLocale } from "../../libs/date.util";
import { GRAIN } from "../../theme/skins";
import { useTranslation } from "react-i18next";

export interface GeneratedStageCoverProps {
  stage: StageCoverSource;
  style?: StyleProp<ViewStyle>;
}

const BASE = "#050506";
const MONO = Platform.select({ ios: "Menlo", default: "monospace" });
const EXO = "Exo_700Bold";
const EXO_MEDIUM = "Exo_500Medium";
const CHROME = ["#ffffff", "#ececef", "#8e8e97"] as const;

/** libs/stage-cover's STAGE_COVER_BACKGROUNDS, bundled. */
const BACKGROUNDS: Record<string, number> = {
  "bg-04": require("../../assets/stage-cover/bg-04.jpg"),
  "bg-07": require("../../assets/stage-cover/bg-07.jpg"),
  "bg-10": require("../../assets/stage-cover/bg-10.jpg"),
  "bg-11": require("../../assets/stage-cover/bg-11.jpg"),
  "bg-13": require("../../assets/stage-cover/bg-13.jpg"),
  "bg-14": require("../../assets/stage-cover/bg-14.jpg"),
  "bg-16": require("../../assets/stage-cover/bg-16.jpg"),
  "bg-20": require("../../assets/stage-cover/bg-20.jpg"),
  "bg-23": require("../../assets/stage-cover/bg-23.jpg"),
  "bg-26": require("../../assets/stage-cover/bg-26.jpg"),
  "bg-37": require("../../assets/stage-cover/bg-37.jpg"),
  "bg-42": require("../../assets/stage-cover/bg-42.jpg"),
};
const MIC = require("../../assets/stage-cover/mic-480.webp");
const MIC_RATIO = 720 / 590;
const WORDMARK = require("../../assets/stage-cover/wordmark-black-web.webp");
const WORDMARK_RATIO = 1752 / 417;

/** A thin four-point twinkle, like the ones on the banners. */
function Sparkle({ x, y, size }: { x: number; y: number; size: number }) {
  const line = ["rgba(255,255,255,0)", "rgba(255,255,255,0.9)", "rgba(255,255,255,0)"] as const;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size }}>
      <LinearGradient colors={line} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: "absolute", left: 0, right: 0, top: size / 2 - 0.5, height: 1 }} />
      <LinearGradient colors={line} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ position: "absolute", top: 0, bottom: 0, left: size / 2 - 0.5, width: 1 }} />
    </View>
  );
}

const GeneratedStageCover: React.FC<GeneratedStageCoverProps> = ({ stage, style }) => {
  const { t } = useTranslation();
  const [width, setWidth] = useState(0);
  const m = useMemo(
    () => buildStageCover(stage, t, appLocale()),
    // Only the fields the poster reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stage.id, stage.title, stage.host_username, stage.host_wallet_address, stage.scheduled_at, stage.started_at, stage.created_at, stage.ended_at, stage.status, t],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  };

  const W = width;
  const H = (W * 9) / 16;
  const u = W / 100; // 1cqw on web
  const compact = W > 0 && W <= 300;
  const titleSize = W * stageCoverTitleScale(m.title);
  const title = m.title.toUpperCase();
  const titleStyle = [styles.title, { fontSize: titleSize, lineHeight: titleSize * 1.02 }];
  const micW = 33 * u;
  const micH = micW * MIC_RATIO;
  const wordH = 2.2 * u;

  return (
    <View
      className="dark-surface"
      style={[styles.frame, style]}
      onLayout={onLayout}
      accessible={!!m.title}
      accessibilityRole="image"
      accessibilityLabel={m.title ? _translateCopy("copy.99ca327a47b5", { defaultValue: "Cover graphic for {{value1}}", value1: m.title }) : undefined}
    >
      {W > 0 && (
        <>
          <Image source={BACKGROUNDS[m.background]} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(5,5,6,0.8)", "rgba(5,5,6,0.45)", "rgba(5,5,6,0.3)"]}
            locations={[0, 0.6, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <RNImage source={GRAIN} resizeMode="repeat" style={[StyleSheet.absoluteFill, { opacity: 0.08 }]} />
          <View pointerEvents="none" style={[styles.frameLine, { left: 1.4 * u, top: 1.4 * u, right: 1.4 * u, bottom: 1.4 * u, borderRadius: 2 * u }]} />

          <Image
            source={MIC}
            contentFit="contain"
            style={{
              position: "absolute",
              right: 4 * u,
              top: H / 2 - micH * 0.46,
              width: micW,
              height: micH,
              transform: [{ rotate: `${m.tilt}deg` }, ...(m.flip ? [{ scaleX: -1 }] : [])],
            }}
          />
          {m.sparkles.map((sp, i) => (
            <Sparkle key={i} x={sp.x * W} y={sp.y * H} size={Math.max(6, sp.size * u)} />
          ))}

          <View pointerEvents="none" style={[styles.pill, { left: 4.4 * u, top: 4.2 * u, paddingHorizontal: 1.4 * u, paddingVertical: 0.9 * u, borderRadius: 0.9 * u }]}>
            <Image source={WORDMARK} contentFit="contain" style={{ height: wordH, width: wordH * WORDMARK_RATIO }} />
          </View>
          {!compact && (
            <View pointerEvents="none" style={[styles.bracket, { right: 4.4 * u, top: 4.2 * u, paddingHorizontal: 1.3 * u, paddingVertical: 0.6 * u }]}>
              <View style={[styles.corner, { left: 0, top: 0, width: u, height: u, borderLeftWidth: 1, borderTopWidth: 1 }]} />
              <View style={[styles.corner, { right: 0, bottom: 0, width: u, height: u, borderRightWidth: 1, borderBottomWidth: 1 }]} />
              <Text style={[styles.mono, { fontSize: 1.5 * u, color: "rgba(255,255,255,0.82)" }]}>{`// type = "${t("stageCover.stage")}"`}</Text>
            </View>
          )}

          <View pointerEvents="none" style={[styles.copy, { left: 4.4 * u, width: 56 * u, gap: 1.6 * u }]}>
            <View style={styles.statusRow}>
              {m.status === "live" && (
                <View style={{ width: 1.1 * u, height: 1.1 * u, borderRadius: u, marginRight: 0.9 * u, backgroundColor: "#ef4444" }} />
              )}
              <Text style={[styles.status, { fontSize: 2.1 * u }]} numberOfLines={1}>{m.statusTag}</Text>
            </View>
            {!!title && Platform.OS === "web" ? (
              // No MaskedView on web (the screenshot preview); flat chrome.
              <Text style={[titleStyle, { color: "#ececf0" }]} numberOfLines={3}>{title}</Text>
            ) : !!title && (
              <View>
                <Text style={[titleStyle, { opacity: 0 }]} numberOfLines={3}>{title}</Text>
                <MaskedView style={StyleSheet.absoluteFill} maskElement={<Text style={titleStyle} numberOfLines={3}>{title}</Text>}>
                  <LinearGradient colors={CHROME} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
                </MaskedView>
              </View>
            )}
            {!compact && !!(m.host || m.detail) && (
              <Text style={[styles.mono, { fontSize: 1.5 * u, color: "rgba(255,255,255,0.6)" }]} numberOfLines={1}>
                {!!m.host && <>host = <Text style={{ color: "#ffffff" }}>{m.host}</Text></>}
                {m.host && m.detail ? " · " : ""}
                {m.detail}
              </Text>
            )}
          </View>

          {!compact && (
            <View pointerEvents="none" style={[styles.site, { left: 4.4 * u, bottom: 4.2 * u, paddingHorizontal: 1.4 * u, paddingVertical: 0.6 * u, borderRadius: 0.5 * u }]}>
              <Text style={[styles.mono, { fontSize: 1.5 * u, color: "rgba(255,255,255,0.85)" }]}>{"// dehub.io/stages"}</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    aspectRatio: 16 / 9,
    overflow: "hidden",
    backgroundColor: BASE,
  },
  frameLine: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  pill: {
    position: "absolute",
    backgroundColor: "#f4f4f5",
  },
  bracket: {
    position: "absolute",
  },
  corner: {
    position: "absolute",
    borderColor: "rgba(255,255,255,0.55)",
  },
  mono: {
    fontFamily: MONO,
  },
  copy: {
    position: "absolute",
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  status: {
    color: "rgba(255,255,255,0.92)",
    fontFamily: EXO_MEDIUM,
    fontWeight: "500",
  },
  title: {
    color: "#000000",
    fontFamily: EXO,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  site: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
});

export default React.memo(GeneratedStageCover);
