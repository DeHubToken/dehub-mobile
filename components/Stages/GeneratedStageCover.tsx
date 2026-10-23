import { translateCopy as _translateCopy } from '../../i18n/copy';
/**
 * GeneratedStageCover — the poster a stage gets when the host set no cover
 * ========================================================================
 * Port of web's component of the same name. The art comes from
 * libs/stage-cover (a hash of the stage id), so a stage shows the same poster
 * here as on dehub.io.
 *
 * Drawn with react-native-svg (already in the binary) and plain Text, so it
 * ships over the air. The art is a picture and stays dark in every theme:
 * `dark-surface` keeps System Light from re-inking its text.
 *
 * Text sizes are fractions of the measured width, so a narrow card and a full
 * page show the same composition at different scales.
 *
 * @module components/Stages/GeneratedStageCover
 */

import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from "react-native-svg";
import {
  STAGE_COVER_H,
  STAGE_COVER_W,
  buildStageCover,
  stageCoverArc,
  stageCoverTitleScale,
  type StageCoverSource,
} from "../../libs/stage-cover";
import { appLocale } from "../../libs/date.util";
import { useTranslation } from "react-i18next";

export interface GeneratedStageCoverProps {
  stage: StageCoverSource;
  style?: StyleProp<ViewStyle>;
}

let idCounter = 0;

const GeneratedStageCover: React.FC<GeneratedStageCoverProps> = ({ stage, style }) => {
  const { t } = useTranslation();
  const [uid] = useState(() => `gsc${++idCounter}`);
  const [width, setWidth] = useState(0);
  const m = useMemo(
    () => buildStageCover(stage, appLocale()),
    // Only the fields the poster reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stage.id, stage.title, stage.host_username, stage.host_wallet_address, stage.scheduled_at, stage.started_at, stage.created_at],
  );
  const p = m.palette;
  const barW = STAGE_COVER_W / m.bars.length;
  const accent = m.rings[m.accentRing];
  const compact = width > 0 && width <= 300;
  const fs = (fraction: number, min = 0) => Math.max(min, width * fraction);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  };

  return (
    <View
      className="dark-surface"
      style={[styles.frame, style]}
      onLayout={onLayout}
      accessible={!!m.title}
      accessibilityRole="image"
      accessibilityLabel={m.title ? _translateCopy("copy.99ca327a47b5", { defaultValue: "Cover graphic for {{value1}}", value1: m.title }) : undefined}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${STAGE_COVER_W} ${STAGE_COVER_H}`}
        preserveAspectRatio="xMidYMid slice"
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <RadialGradient id={`ga${uid}`} cx={m.cx} cy={m.cy} r={760} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={p.a} stopOpacity={0.75} />
            <Stop offset="0.55" stopColor={p.a} stopOpacity={0.18} />
            <Stop offset="1" stopColor={p.a} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`gb${uid}`} cx={STAGE_COVER_W - m.cx} cy={STAGE_COVER_H * 1.05} r={820} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={p.b} stopOpacity={0.6} />
            <Stop offset="1" stopColor={p.b} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id={`gs${uid}`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#000" stopOpacity={0.62} />
            <Stop offset="0.6" stopColor="#000" stopOpacity={0.12} />
            <Stop offset="1" stopColor="#000" stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id={`gw${uid}`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={p.b} />
            <Stop offset="1" stopColor={p.a} />
          </LinearGradient>
        </Defs>

        <Rect width={STAGE_COVER_W} height={STAGE_COVER_H} fill="#08080c" />
        <Rect width={STAGE_COVER_W} height={STAGE_COVER_H} fill={`url(#gb${uid})`} />
        <Rect width={STAGE_COVER_W} height={STAGE_COVER_H} fill={`url(#ga${uid})`} />

        {m.rings.map((ring, i) => (
          <Circle key={i} cx={m.cx} cy={m.cy} r={ring.r} fill="none" stroke="#fff" strokeOpacity={ring.opacity} strokeWidth={2} />
        ))}
        {!!accent && (
          <Path
            d={stageCoverArc(m.cx, m.cy, accent.r, m.accentStart, 70)}
            fill="none"
            stroke={p.ink}
            strokeWidth={6}
            strokeLinecap="round"
          />
        )}

        <Circle cx={m.cx} cy={m.cy} r={118} fill="#000" fillOpacity={0.45} stroke="#fff" strokeOpacity={0.35} strokeWidth={2} />
        {m.day ? (
          <>
            <SvgText x={m.cx} y={m.cy + 22} textAnchor="middle" fill="#fff" fontSize={104} fontWeight="800" letterSpacing={-4}>
              {m.day}
            </SvgText>
            <SvgText x={m.cx} y={m.cy + 66} textAnchor="middle" fill={p.ink} fontSize={30} fontWeight="700" letterSpacing={6}>
              {m.month}
            </SvgText>
          </>
        ) : (
          <Circle cx={m.cx} cy={m.cy} r={22} fill={p.ink} />
        )}

        <Rect width={STAGE_COVER_W} height={STAGE_COVER_H} fill={`url(#gs${uid})`} />

        <G fill={`url(#gw${uid})`} fillOpacity={0.7}>
          {m.bars.map((h, i) => {
            const bh = 18 + h * 92;
            return (
              <Rect key={i} x={i * barW + barW * 0.22} y={STAGE_COVER_H - bh} width={barW * 0.56} height={bh} rx={barW * 0.28} />
            );
          })}
        </G>
      </Svg>

      {width > 0 && (
        <View
          pointerEvents="none"
          style={[styles.column, { paddingTop: width * 0.055, paddingLeft: width * 0.055, paddingBottom: width * 0.1 }]}
        >
          {!compact && (
            <View style={[styles.brandRow, { gap: width * 0.009 }]}>
              <View style={{ width: width * 0.012, height: width * 0.012, borderRadius: width, backgroundColor: p.ink }} />
              <Text style={[styles.brand, { fontSize: fs(0.018), color: p.ink }]} numberOfLines={1}>
                {`DEHUB ${t("nav.stages").toUpperCase()}`}
              </Text>
            </View>
          )}
          <View style={styles.middle}>
            {!!m.title && (
              <Text
                style={[styles.title, { fontSize: fs(stageCoverTitleScale(m.title)), lineHeight: fs(stageCoverTitleScale(m.title)) * 1.08 }]}
                numberOfLines={3}
              >
                {m.title}
              </Text>
            )}
            {!compact && !!m.when && (
              <Text style={[styles.when, { fontSize: fs(0.024, 8), marginTop: width * 0.016 }]} numberOfLines={1}>
                {m.when}
              </Text>
            )}
          </View>
          {!!m.host && (
            <Text style={[styles.host, { fontSize: fs(0.023, 7) }]} numberOfLines={1}>
              {m.host}
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    aspectRatio: 16 / 9,
    overflow: "hidden",
    backgroundColor: "#08080c",
  },
  column: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: "56%",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  brand: {
    fontWeight: "700",
    letterSpacing: 2,
  },
  middle: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    color: "#ffffff",
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  when: {
    color: "rgba(255,255,255,0.8)",
    fontWeight: "500",
  },
  host: {
    color: "rgba(255,255,255,0.9)",
    fontWeight: "600",
  },
});

export default React.memo(GeneratedStageCover);
