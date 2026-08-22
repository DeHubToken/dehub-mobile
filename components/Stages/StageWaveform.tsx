/**
 * StageWaveform — the seekable bar every stage recording is played from
 * ====================================================================
 * A port of web's `StaticWaveform`: 90 bars whose heights are generated from a
 * seed (the stage id), so a given recording always draws the same shape, with
 * the played portion lit and the rest dimmed.
 *
 * It is a picture of a recording, not of its audio — web samples an analyser
 * for the live-stage meter, but for a *recording* it deliberately shows the
 * static seeded pattern with a progress fill, because bars bouncing on top of
 * a fill made the playhead impossible to read. This matches that.
 *
 * Drag or tap to seek. The fill follows the finger locally so the gesture feels
 * attached to the bar, and the real seek is issued on release. When the source
 * cannot be scrubbed at all — the container web records into carries no index
 * (see libs/stage-playback) — pass no `onSeek` and it renders as a plain
 * progress bar rather than swallowing drags.
 *
 * @module components/Stages/StageWaveform
 */

import React, { useCallback, useMemo, useState } from "react";
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { ClipPath, Defs, G, Rect } from "react-native-svg";

const BAR_COUNT = 90;
const BAR_WIDTH = 2;
const BAR_GAP = 1.5;
const VIEW_WIDTH = BAR_COUNT * (BAR_WIDTH + BAR_GAP);
const VIEW_HEIGHT = 60;

/** mulberry32 — same PRNG as web, so a stage draws the same shape on both. */
function seedRandom(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return () => {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateBars(seed: string): number[] {
  const rand = seedRandom(seed);
  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const t = i / (BAR_COUNT - 1);
    const envelope = 0.3 + 0.7 * Math.sin(t * Math.PI);
    const noise = 0.4 + 0.6 * rand();
    bars.push(envelope * noise);
  }
  return bars;
}

let clipSeq = 0;

export interface StageWaveformProps {
  /** Stage id. Any stable string — it only has to hash the same twice. */
  seed: string;
  /** 0–1. Undefined draws the whole bar dim, which is the idle state. */
  progress?: number;
  /** Called with 0–1 on release. Omit to make the bar non-interactive. */
  onSeek?: (position: number) => void;
  height?: number;
  /** Lit colour. The dim layer is always this at low opacity. */
  color?: string;
  style?: StyleProp<ViewStyle>;
}

const StageWaveform: React.FC<StageWaveformProps> = ({
  seed,
  progress,
  onSeek,
  height = 36,
  color = "#FFFFFF",
  style,
}) => {
  const bars = useMemo(() => generateBars(seed), [seed]);
  const [width, setWidth] = useState(0);
  /** Where the finger is, 0–1, while a drag is in flight. */
  const [dragAt, setDragAt] = useState<number | null>(null);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  }, []);

  const ratioAt = useCallback(
    (x: number) => {
      if (width <= 0) return 0;
      return Math.max(0, Math.min(1, x / width));
    },
    [width],
  );

  const gesture = useMemo(() => {
    if (!onSeek) return null;

    // runOnJS on both: reanimated's babel plugin workletizes gesture callbacks,
    // and a worklet calling setState directly crashes on the UI thread. These
    // callbacks only move a piece of React state, so they belong on JS.
    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((e) => {
        onSeek(ratioAt(e.x));
      });

    // activeOffsetX so a vertical flick still scrolls the list underneath —
    // these rows live inside a scrolling modal and a bar that claimed every
    // touch would make the Recorded list impossible to scroll past.
    const pan = Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-6, 6])
      .failOffsetY([-12, 12])
      .onBegin((e) => setDragAt(ratioAt(e.x)))
      .onUpdate((e) => setDragAt(ratioAt(e.x)))
      .onEnd((e) => onSeek(ratioAt(e.x)))
      .onFinalize(() => setDragAt(null));

    return Gesture.Race(pan, tap);
  }, [onSeek, ratioAt]);

  const shown = dragAt ?? progress;
  const hasProgress = typeof shown === "number" && Number.isFinite(shown);
  const p = hasProgress ? Math.min(1, Math.max(0, shown as number)) : 0;

  // Two layers under one clip rather than 90 per-bar opacities: the fill is a
  // single value that changes five times a second, and re-deriving ninety
  // <Rect> props each time re-rendered the whole Recorded list.
  const rects = useMemo(
    () =>
      bars.map((h, i) => {
        const barHeight = h * VIEW_HEIGHT * 0.85;
        return (
          <Rect
            key={i}
            x={i * (BAR_WIDTH + BAR_GAP)}
            y={(VIEW_HEIGHT - barHeight) / 2}
            width={BAR_WIDTH}
            height={barHeight}
            rx={1}
          />
        );
      }),
    [bars],
  );

  // Per-instance, not per-seed: the same recording can be on screen twice (a
  // Recorded row and the corner player), and two <ClipPath id> that match is
  // one of them silently taking the other's fill.
  const clipId = useMemo(() => `stage-wf-${(clipSeq += 1)}`, []);

  const svg = (
    <View style={[{ height, justifyContent: "center" }, style]} onLayout={onLayout}>
      <Svg width="100%" height={height} viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} preserveAspectRatio="none">
        <Defs>
          <ClipPath id={clipId}>
            <Rect x={0} y={0} width={Math.max(0.0001, p * VIEW_WIDTH)} height={VIEW_HEIGHT} />
          </ClipPath>
        </Defs>
        <G fill={color} opacity={0.18}>
          {rects}
        </G>
        {hasProgress && (
          <G fill={color} opacity={0.95} clipPath={`url(#${clipId})`}>
            {rects}
          </G>
        )}
      </Svg>
    </View>
  );

  if (!gesture) return svg;
  return <GestureDetector gesture={gesture}>{svg}</GestureDetector>;
};

export default React.memo(StageWaveform);
