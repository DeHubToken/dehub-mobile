import { translateCopy as _translateCopy } from '../../i18n/copy';
/**
 * GeneratedStageCover — the poster a stage gets when the host set no cover
 * ========================================================================
 * Port of web's component of the same name. The art comes from
 * libs/stage-cover (a hash of the stage id), so a stage shows the same poster
 * here as on dehub.io: a ticket with a tear-off date stub, in DeHub's
 * monochrome poster style (grey light streaks, dot grid, // tags).
 *
 * The shapes are one react-native-svg drawing in pixels of the measured
 * width (already in the binary, so it ships over the air); the words are
 * plain Text laid over it. The art is a picture and stays dark in every
 * theme: `dark-surface` keeps System Light from re-inking its text.
 *
 * Under 300pt wide the corner tags, status line and barcode drop out, which
 * would otherwise be too small to read.
 *
 * @module components/Stages/GeneratedStageCover
 */

import React, { useMemo, useState } from "react";
import { Platform, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, Line, Path, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";
import { buildStageCover, stageCoverTitleScale, type StageCoverSource } from "../../libs/stage-cover";
import { appLocale } from "../../libs/date.util";

export interface GeneratedStageCoverProps {
  stage: StageCoverSource;
  style?: StyleProp<ViewStyle>;
}

const BASE = "#050506";
const PAPER = "#f4f4f5";
const INK = "#09090b";
const MONO = Platform.select({ ios: "Menlo", default: "monospace" });
const EXO = "Exo_700Bold";

let idCounter = 0;

/** The DeHub mark (assets/brand/bimi-logo.svg). */
function DehubMark({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <G fill="none" stroke={INK} strokeWidth={60} strokeLinecap="round">
        <Path d="M112 176v116c0 70 39 128 103 150" />
        <Path d="M400 176v116c0 70-39 128-103 150" />
        <Path d="M256 86v213" />
      </G>
    </Svg>
  );
}

const GeneratedStageCover: React.FC<GeneratedStageCoverProps> = ({ stage, style }) => {
  const [uid] = useState(() => `gsc${++idCounter}`);
  const [width, setWidth] = useState(0);
  const m = useMemo(
    () => buildStageCover(stage, appLocale()),
    // Only the fields the poster reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stage.id, stage.title, stage.host_username, stage.host_wallet_address, stage.scheduled_at, stage.started_at, stage.created_at, stage.ended_at, stage.status],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  };

  const W = width;
  const H = (W * 9) / 16;
  const u = W / 100; // 1cqw on web
  const compact = W > 0 && W <= 300;

  // Ticket box, matching web's insets.
  const tl = 4.2 * u;
  const tr = W - 4.2 * u;
  const tt = (compact ? 5 : 9.4) * u;
  const tb = H - (compact ? 5 : 8.6) * u;
  const stubW = 22 * u;
  const seam = tr - stubW;
  const rad = 1.8 * u;
  const notch = 1.6 * u;

  const barcode = useMemo(() => {
    const n = m.bars.length;
    const bw = 1000 / n;
    return m.bars
      .map((h, i) => {
        const bh = h * 100;
        return `M${(i * bw + bw * 0.22).toFixed(1)} ${(50 - bh / 2).toFixed(1)}h${(bw * 0.56).toFixed(1)}v${bh.toFixed(1)}h-${(bw * 0.56).toFixed(1)}z`;
      })
      .join("");
  }, [m.bars]);

  const titleSize = W * stageCoverTitleScale(m.title);
  const dot = m.status === "live" ? "#ef4444" : m.status === "replay" ? "#a1a1aa" : "#ffffff";

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
          <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={StyleSheet.absoluteFill}>
            <Defs>
              {m.streaks.map((s, i) => (
                <RadialGradient key={i} id={`${uid}s${i}`} cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor="#ffffff" stopOpacity={s.opacity} />
                  <Stop offset="0.5" stopColor="#ffffff" stopOpacity={s.opacity * 0.45} />
                  <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
                </RadialGradient>
              ))}
              <Pattern id={`${uid}dots`} x={1.7 * u} y={1.7 * u} width={3.4 * u} height={3.4 * u} patternUnits="userSpaceOnUse">
                <Circle cx={0} cy={0} r={Math.max(0.5, 0.1 * u)} fill="#ffffff" fillOpacity={0.22} />
              </Pattern>
            </Defs>
            <Rect width={W} height={H} fill={BASE} />
            {m.streaks.map((s, i) => (
              <G key={i} transform={`rotate(${s.rotate} ${s.x * W} ${s.y * H})`}>
                <Ellipse cx={s.x * W} cy={s.y * H} rx={(s.w * W) / 2 + 2.2 * u} ry={(s.h * W) / 2 + 2.2 * u} fill={`url(#${uid}s${i})`} />
              </G>
            ))}
            <Rect width={W} height={H} fill={`url(#${uid}dots)`} />
            <Rect x={1.4 * u} y={1.4 * u} width={W - 2.8 * u} height={H - 2.8 * u} rx={2 * u} fill="none" stroke="#ffffff" strokeOpacity={0.16} strokeWidth={1} />

            {/* Ticket body, then the paper stub over its right end. */}
            <Rect x={tl} y={tt} width={tr - tl} height={tb - tt} rx={rad} fill="#ffffff" fillOpacity={0.05} stroke="#ffffff" strokeOpacity={0.22} strokeWidth={1} />
            <Path
              d={`M${seam} ${tt}H${tr - rad}A${rad} ${rad} 0 0 1 ${tr} ${tt + rad}V${tb - rad}A${rad} ${rad} 0 0 1 ${tr - rad} ${tb}H${seam}Z`}
              fill={PAPER}
            />
            <Line x1={seam} y1={tt} x2={seam} y2={tb} stroke="#ffffff" strokeOpacity={0.35} strokeWidth={Math.max(1, 0.3 * u)} strokeDasharray={`${u} ${u}`} />
            <Circle cx={seam} cy={tt} r={notch} fill={BASE} />
            <Circle cx={seam} cy={tb} r={notch} fill={BASE} />
          </Svg>

          {!compact && (
            <View pointerEvents="none" style={[styles.row, { left: tl, right: W - tr, top: 3.6 * u }]}>
              <View style={[styles.pill, { gap: 0.7 * u, paddingHorizontal: 1.5 * u, paddingVertical: 0.7 * u, borderRadius: 0.9 * u }]}>
                <DehubMark size={1.9 * u} />
                <Text style={[styles.pillText, { fontSize: 1.7 * u, letterSpacing: 0.37 * u }]}>DEHUB</Text>
              </View>
              <Text style={[styles.tag, { fontSize: 1.35 * u }]}>{'// type = "stage"'}</Text>
            </View>
          )}

          <View
            pointerEvents="none"
            style={[styles.body, { left: tl, top: tt, width: seam - tl, height: tb - tt, paddingHorizontal: 3.2 * u, paddingVertical: (compact ? 2.2 : 2.8) * u }]}
          >
            {!compact ? (
              <View style={[styles.statusRow, { gap: 0.8 * u }]}>
                <View style={{ width: 0.9 * u, height: 0.9 * u, borderRadius: u, backgroundColor: dot }} />
                <Text style={[styles.tag, { fontSize: 1.45 * u }]} numberOfLines={1}>{m.statusTag}</Text>
              </View>
            ) : (
              <View />
            )}
            {!!m.title && (
              <Text style={[styles.title, { fontSize: titleSize, lineHeight: titleSize * 1.06 }]} numberOfLines={3}>
                {m.title.toUpperCase()}
              </Text>
            )}
            {m.host ? (
              <Text style={[styles.host, { fontSize: Math.max(7, 2 * u) }]} numberOfLines={1}>
                {"//"}
                <Text style={styles.hostName}>{m.host}</Text>
              </Text>
            ) : (
              <View />
            )}
          </View>

          <View pointerEvents="none" style={[styles.stub, { left: seam, top: tt, width: stubW, height: tb - tt, gap: 0.6 * u, paddingHorizontal: 2 * u }]}>
            {m.day ? (
              <>
                <Text style={[styles.stubMono, { fontSize: 1.6 * u, letterSpacing: 0.29 * u }]}>{m.month}</Text>
                <Text style={[styles.day, { fontSize: 10.5 * u, lineHeight: 10.5 * u }]}>{m.day}</Text>
                {!compact && (
                  <Text style={[styles.stubMono, { fontSize: 1.4 * u }]} numberOfLines={1}>
                    {`${m.weekday} · ${m.time}`}
                  </Text>
                )}
              </>
            ) : (
              <DehubMark size={8 * u} />
            )}
            {!compact && (
              <>
                <Svg width={stubW - 4 * u} height={4 * u} viewBox="0 0 1000 100" preserveAspectRatio="none" style={{ marginTop: u }}>
                  <Path d={barcode} fill={INK} />
                </Svg>
                <Text style={[styles.stubMono, { fontSize: u, letterSpacing: 0.28 * u, opacity: 0.55 }]}>{m.stubLine}</Text>
              </>
            )}
          </View>

          {!compact && (
            <View pointerEvents="none" style={[styles.siteRow, { bottom: 3.3 * u }]}>
              <View style={[styles.site, { paddingHorizontal: 1.2 * u, paddingVertical: 0.5 * u, borderRadius: 0.5 * u }]}>
                <Text style={[styles.tag, { fontSize: 1.3 * u, color: "rgba(255,255,255,0.85)" }]}>{"// dehub.io"}</Text>
              </View>
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
  row: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PAPER,
  },
  pillText: {
    color: INK,
    fontFamily: EXO,
    fontWeight: "700",
  },
  tag: {
    color: "rgba(255,255,255,0.78)",
    fontFamily: MONO,
    fontWeight: "700",
  },
  body: {
    position: "absolute",
    justifyContent: "space-between",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    color: "#ececf0",
    fontFamily: EXO,
    fontWeight: "700",
  },
  host: {
    color: "rgba(255,255,255,0.7)",
    fontFamily: EXO,
    fontWeight: "600",
  },
  hostName: {
    color: "#ffffff",
    fontWeight: "700",
  },
  stub: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  stubMono: {
    color: INK,
    fontFamily: MONO,
    fontWeight: "700",
  },
  day: {
    color: INK,
    fontFamily: EXO,
    fontWeight: "700",
    letterSpacing: -1,
  },
  siteRow: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  site: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
});

export default React.memo(GeneratedStageCover);
