/**
 * Audio post visualizers — the mobile half of web's `visualizer-styles.ts`
 * =======================================================================
 * Every style the web audio card offers, drawn with the pieces this app
 * actually has. Web renders to a canvas off a Web Audio `AnalyserNode`; there
 * is no analyser behind `expo-av` playback and no canvas here, so each style is
 * built from Views driven by Reanimated shared values on the UI thread.
 *
 * The motion is therefore synthesised rather than sampled — the same compromise
 * the three styles that shipped before this file already made. What matters is
 * that a track looks like the same *thing* on both apps: same style keys, same
 * order, same silhouette, same colour rule.
 *
 * Three rules run through all of it:
 *
 *   · ONE CLOCK, MANY CONSTANTS. A style animates a single shared value 0→1 on
 *     a loop and every element derives its own state from that plus fixed
 *     per-element numbers. Eighty elements each running their own
 *     `withRepeat(withSequence(...))` is eighty animations to schedule and they
 *     drift apart; one clock is one.
 *
 *   · THE CLOCK WRAPS, SO EVERY MULTIPLIER IS AN INTEGER. `sin((k·clock)·2π)`
 *     is only continuous across the 1→0 wrap when k is a whole number. A
 *     fractional rate looks fine for one cycle and then visibly jumps, once a
 *     second, forever. Variety comes from the phase offsets instead.
 *
 *   · PURE TRANSFORMS. Nothing animates a layout prop. A bar that grows
 *     radially is `[{rotate}, {translateY: -(R + h·s/2)}, {scaleY: s}]` — scale
 *     about the element's own centre, push it out far enough that its inner end
 *     lands on the ring, then swing it round. No re-layout per frame.
 *
 * Colour rule: hue 0 is white, on both apps. The slider starts there and the
 * monochrome default is the house style, so a card nobody has touched plays
 * back in chrome. Web's analyser styles used to read 0 as red and have been
 * brought onto this rule; the two are the same now, so do not reintroduce a
 * per-platform default here.
 *
 * @module components/Home/AudioVisualizers
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  type GestureResponderHandlers,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

/* ─── Style list ────────────────────────────────────────────────────────── */

/** Same keys and same order as web's `VisualizerStyle`. */
export type VisualizerStyle =
  | "static"
  | "bars"
  | "waveform"
  | "circular"
  | "spectrum"
  | "mirror"
  | "rings"
  | "pulse"
  | "terrain"
  | "orb";

export const VISUALIZER_STYLES: { value: VisualizerStyle; label: string }[] = [
  { value: "static", label: "Default" },
  { value: "bars", label: "Bars" },
  { value: "waveform", label: "Wave" },
  { value: "circular", label: "Radial" },
  { value: "spectrum", label: "Spectrum" },
  { value: "mirror", label: "Mirror" },
  { value: "rings", label: "Rings" },
  { value: "pulse", label: "Pulse" },
  { value: "terrain", label: "Terrain" },
  { value: "orb", label: "Orb" },
];

/* ─── Shared constants and helpers ──────────────────────────────────────── */

export const BAR_COUNT = 80;
export const BAR_WIDTH = 2.5;
export const BAR_GAP = 1.5;
export const WAVEFORM_HEIGHT = 60;

export const COMPACT_BAR_COUNT = 40;
export const COMPACT_BAR_WIDTH = 2;
export const COMPACT_BAR_GAP = 1;
export const COMPACT_WAVEFORM_HEIGHT = 28;

/**
 * How tall the band is for a given style, when the caller has not fixed it.
 *
 * Web can leave its canvas one shape for everything because that canvas is
 * already 2:1 — a centred ball sized off the short edge still fills a third of
 * it. Mobile's default band is 5:1, and a ball sized off 60px of height is a
 * marble lost in the middle of the card. So the styles that draw a scene get a
 * square-ish band and the ones that draw a row of bars keep the short one. Two
 * heights, so switching styles is at most one jump.
 */
export const styleBandHeight = (style: VisualizerStyle): number => {
  switch (style) {
    case "circular":
    case "spectrum":
    case "rings":
    case "pulse":
    case "terrain":
    case "orb":
      return 150;
    default:
      return WAVEFORM_HEIGHT;
  }
};

const TAU = Math.PI * 2;

/** hue 0 → white. See the colour rule at the top of the file. */
const tint = (hue: number, lightness: number, alpha: number) =>
  hue === 0
    ? `rgba(255,255,255,${alpha})`
    : `hsla(${hue}, 82%, ${lightness}%, ${alpha})`;

/** mulberry32 — the same PRNG as web, so a post draws the same shape on both. */
export const seedRandom = (str: string) => {
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
};

export const generateBars = (seed: string, count: number): number[] => {
  const rand = seedRandom(seed);
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const envelope = 0.3 + 0.7 * Math.sin(t * Math.PI);
    const noise = 0.4 + 0.6 * rand();
    bars.push(envelope * noise);
  }
  return bars;
};

/**
 * Width of the band, measured. Most of the new styles are centred or full bleed
 * and cannot be laid out until they know it. The caller's own `onLayout` still
 * has to fire — the seek surface reads its width from it — so it is chained
 * rather than replaced.
 */
const useBandWidth = (onLayout?: (e: LayoutChangeEvent) => void) => {
  const [width, setWidth] = useState(0);
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const w = e.nativeEvent.layout.width;
      setWidth((prev) => (Math.abs(prev - w) < 1 ? prev : w));
      onLayout?.(e);
    },
    [onLayout],
  );
  return { width, handleLayout };
};

/** The 0→1 loop everything else derives from. */
const useClock = (playing: boolean, periodMs: number) => {
  const clock = useSharedValue(0);
  useEffect(() => {
    if (!playing) {
      cancelAnimation(clock);
      return;
    }
    // Restart at 0 rather than resuming: `withRepeat(withTiming(1, …))` re-runs
    // the same 0→1 timing each iteration, so a clock left partway through would
    // finish its first lap and then sit still at 1 forever.
    clock.value = 0;
    clock.value = withRepeat(
      withTiming(1, { duration: periodMs, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(clock);
  }, [playing, periodMs, clock]);
  return clock;
};

/**
 * How hard the style is being driven, 0 when stopped. Everything that reacts
 * multiplies by this, so pausing settles the band rather than freezing it
 * mid-swing.
 */
const useDrive = (playing: boolean) => {
  const drive = useSharedValue(0);
  useEffect(() => {
    drive.value = withTiming(playing ? 1 : 0, {
      duration: playing ? 420 : 500,
      easing: Easing.out(Easing.quad),
    });
  }, [playing, drive]);
  return drive;
};

interface BandProps {
  seed: string;
  isPlaying: boolean;
  hue: number;
  height: number;
  onLayout?: (e: LayoutChangeEvent) => void;
  panHandlers?: Partial<GestureResponderHandlers>;
}

/* ─── Static (Default) ──────────────────────────────────────────────────── */

interface WaveformBarsProps {
  bars: number[];
  wHeight: number;
  bw: number;
  bg: number;
  count: number;
  color: string;
}

/** Memo'd bar row, never re-renders on seek. */
export const WaveformBars: React.FC<WaveformBarsProps> = memo(
  ({ bars, wHeight, bw, bg, count, color }) => (
    <View style={{ flexDirection: "row", alignItems: "center", height: wHeight }}>
      {bars.map((h, i) => (
        <View
          key={i}
          style={{
            width: bw,
            height: Math.max(2, h * wHeight * 0.85),
            borderRadius: bw / 2,
            marginRight: i < count - 1 ? bg : 0,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  ),
);

interface StaticWaveformProps {
  seed: string;
  position: SharedValue<number>;
  compact?: boolean;
  hue: number;
  /** Overrides the band height so fullscreen renders the same waveform big. */
  height?: number;
  onLayout?: (e: LayoutChangeEvent) => void;
  panHandlers?: Partial<GestureResponderHandlers>;
}

export const StaticWaveform: React.FC<StaticWaveformProps> = memo(
  ({ seed, position, compact, hue, height, onLayout, panHandlers }) => {
    const count = compact ? COMPACT_BAR_COUNT : BAR_COUNT;
    const bw = compact ? COMPACT_BAR_WIDTH : BAR_WIDTH;
    const bg = compact ? COMPACT_BAR_GAP : BAR_GAP;
    const wHeight = height ?? (compact ? COMPACT_WAVEFORM_HEIGHT : WAVEFORM_HEIGHT);
    const bars = useMemo(() => generateBars(seed, count), [seed, count]);

    const playedColor = hue === 0 ? "rgba(255,255,255,0.85)" : `hsla(${hue}, 80%, 70%, 0.9)`;
    const unplayedColor = "rgba(255,255,255,0.15)";

    const playedLayerStyle = useAnimatedStyle(() => ({
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: `${position.value * 100}%`,
      overflow: "hidden",
    }));

    return (
      <View onLayout={onLayout} {...(panHandlers || {})} style={{ height: wHeight }}>
        {/* Unplayed layer — static, never re-renders during seek */}
        <WaveformBars bars={bars} wHeight={wHeight} bw={bw} bg={bg} count={count} color={unplayedColor} />
        {/* Played layer — only clip width changes, bars never re-render */}
        <Animated.View style={playedLayerStyle}>
          <WaveformBars bars={bars} wHeight={wHeight} bw={bw} bg={bg} count={count} color={playedColor} />
        </Animated.View>
      </View>
    );
  },
);

/* ─── Bars / Mirror ─────────────────────────────────────────────────────── */

interface AnimBarProps {
  index: number;
  clock: SharedValue<number>;
  drive: SharedValue<number>;
  baseHeight: number;
  maxH: number;
  minH: number;
  barWidth: number;
  barGap: number;
  barCount: number;
  hue: number;
  mode: "bars" | "mirror";
}

const AnimBar: React.FC<AnimBarProps> = memo(
  ({ index, clock, drive, baseHeight, maxH, minH, barWidth, barGap, barCount, hue, mode }) => {
    // Integer rate, per-bar phase — see the wrap rule at the top.
    const rate = 2 + ((index * 47) % 4);
    const offset = ((index * 23) % 180) / 180;

    const barStyle = useAnimatedStyle(() => {
      const swing = 0.5 + 0.5 * Math.sin((clock.value * rate + offset) * TAU);
      const peak = baseHeight + (maxH - baseHeight) * swing;
      const h = minH + (peak - minH) * drive.value;
      return { transform: [{ scaleY: Math.max(0.02, h / maxH) }] };
    });

    const color = hue === 0 ? "rgba(255,255,255,0.55)" : `hsla(${(hue + index * 2) % 360}, 75%, 65%, 0.7)`;

    if (mode === "mirror") {
      return (
        <View
          style={{
            width: barWidth,
            marginRight: index < barCount - 1 ? barGap : 0,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Animated.View
            style={[
              barStyle,
              { width: barWidth, height: maxH, borderRadius: barWidth / 2, backgroundColor: color },
            ]}
          />
          <View style={{ height: 2 }} />
          <Animated.View
            style={[
              barStyle,
              {
                width: barWidth,
                height: maxH,
                borderRadius: barWidth / 2,
                backgroundColor: color,
                opacity: 0.4,
              },
            ]}
          />
        </View>
      );
    }

    return (
      <Animated.View
        style={[
          barStyle,
          {
            width: barWidth,
            height: maxH,
            borderRadius: barWidth / 2,
            marginRight: index < barCount - 1 ? barGap : 0,
            backgroundColor: color,
          },
        ]}
      />
    );
  },
);

const BarsVisualizer: React.FC<BandProps & { mode: "bars" | "mirror" }> = memo(
  ({ seed, isPlaying, hue, height, mode, onLayout, panHandlers }) => {
    const maxH = mode === "mirror" ? height / 2 - 2 : height;
    const minH = 3;
    const bars = useMemo(() => generateBars(seed, BAR_COUNT), [seed]);
    const clock = useClock(isPlaying, 2400);
    const drive = useDrive(isPlaying);

    return (
      <View
        onLayout={onLayout}
        {...(panHandlers || {})}
        style={{
          flexDirection: "row",
          alignItems: mode === "mirror" ? "center" : "flex-end",
          height,
          justifyContent: "center",
        }}
      >
        {bars.map((h, i) => (
          <AnimBar
            key={i}
            index={i}
            clock={clock}
            drive={drive}
            baseHeight={Math.max(minH, h * maxH * 0.7)}
            maxH={maxH}
            minH={minH}
            barWidth={BAR_WIDTH}
            barGap={BAR_GAP}
            barCount={BAR_COUNT}
            hue={hue}
            mode={mode}
          />
        ))}
        {/* Web fills its bars with a vertical gradient so they read bright at
            the tip and fall away at the root. Eighty gradient views would be a
            gradient per bar; one shade laid over the whole row buys the same
            depth for one view. Bars fade downwards, Mirror fades away from the
            centre line in both directions. */}
        <LinearGradient
          pointerEvents="none"
          colors={
            mode === "mirror"
              ? ["rgba(0,0,0,0.5)", "rgba(0,0,0,0)", "rgba(0,0,0,0.5)"]
              : ["rgba(0,0,0,0)", "rgba(0,0,0,0.55)"]
          }
          locations={mode === "mirror" ? [0, 0.5, 1] : [0.35, 1]}
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        />
      </View>
    );
  },
);

/* ─── Wave — the oscilloscope trace ─────────────────────────────────────── */

/**
 * More, and overlapping. At 76 segments the trace broke into a dotted line
 * wherever it was steep: consecutive samples moved further apart vertically
 * than a segment was tall, so the gaps showed. Smaller horizontal steps mean
 * smaller vertical steps, and the negative margin laps each segment over its
 * neighbour so a steep run still reads as one line.
 */
const WAVE_SEGMENTS = 96;
const WAVE_THICKNESS = 4;
const WAVE_OVERLAP = 1;

interface WaveDotProps {
  clock: SharedValue<number>;
  drive: SharedValue<number>;
  t: number;
  amp: number;
  color: string;
}

/**
 * One sample of the trace. Three sine terms rather than one: a single sine
 * reads as a skipping rope, three at unrelated spatial rates read as a signal.
 */
const WaveDot: React.FC<WaveDotProps> = memo(({ clock, drive, t, amp, color }) => {
  const style = useAnimatedStyle(() => {
    const c = clock.value;
    const y =
      0.55 * Math.sin((t * 3.2 + c) * TAU) +
      0.32 * Math.sin((t * 7.3 - c * 2) * TAU) +
      0.13 * Math.sin((t * 13.1 + c * 3) * TAU);
    return { transform: [{ translateY: y * amp * (0.18 + 0.82 * drive.value) }] };
  });

  return (
    <Animated.View
      style={[
        {
          flex: 1,
          height: WAVE_THICKNESS,
          borderRadius: WAVE_THICKNESS / 2,
          marginHorizontal: -WAVE_OVERLAP,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
});

const WaveVisualizer: React.FC<BandProps> = memo(
  ({ isPlaying, hue, height, seed, onLayout, panHandlers }) => {
    const clock = useClock(isPlaying, 1900);
    const drive = useDrive(isPlaying);
    const color = tint(hue, 78, 0.85);

    // A scope tapers at the edges of its window; a flat-topped envelope reads
    // as wallpaper instead.
    const segments = useMemo(() => {
      const rand = seedRandom(seed);
      return Array.from({ length: WAVE_SEGMENTS }, (_, i) => {
        const t = i / (WAVE_SEGMENTS - 1);
        const envelope = Math.pow(Math.sin(t * Math.PI), 0.55);
        return { t, amp: (height / 2 - WAVE_THICKNESS) * envelope * (0.62 + 0.38 * rand()) };
      });
    }, [seed, height]);

    return (
      <View
        onLayout={onLayout}
        {...(panHandlers || {})}
        style={{ height, flexDirection: "row", alignItems: "center" }}
      >
        {/* Centre line, so the trace has a zero to swing about. */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: height / 2,
            height: 1,
            backgroundColor: tint(hue, 80, 0.14),
          }}
        />
        {segments.map((s, i) => (
          <WaveDot key={i} clock={clock} drive={drive} t={s.t} amp={s.amp} color={color} />
        ))}
      </View>
    );
  },
);

/* ─── Radial ────────────────────────────────────────────────────────────── */

const RADIAL_BARS = 56;

interface RadialBarProps {
  clock: SharedValue<number>;
  drive: SharedValue<number>;
  angle: number;
  radius: number;
  maxLen: number;
  barW: number;
  rate: number;
  offset: number;
  color: string;
  box: number;
}

const RadialBar: React.FC<RadialBarProps> = memo(
  ({ clock, drive, angle, radius, maxLen, barW, rate, offset, color, box }) => {
    const style = useAnimatedStyle(() => {
      const swing = 0.5 + 0.5 * Math.sin((clock.value * rate + offset) * TAU);
      const s = Math.max(0.06, (0.12 + 0.88 * swing) * (0.2 + 0.8 * drive.value));
      return {
        transform: [
          { rotate: `${angle}rad` },
          { translateY: -(radius + (maxLen * s) / 2) },
          { scaleY: s },
        ],
      };
    });

    return (
      <Animated.View
        style={[
          {
            position: "absolute",
            left: box / 2 - barW / 2,
            top: box / 2 - maxLen / 2,
            width: barW,
            height: maxLen,
            borderRadius: barW / 2,
            backgroundColor: color,
          },
          style,
        ]}
      />
    );
  },
);

const RadialVisualizer: React.FC<BandProps> = memo(
  ({ isPlaying, hue, height, onLayout, panHandlers }) => {
    const { width, handleLayout } = useBandWidth(onLayout);
    const clock = useClock(isPlaying, 2600);
    const drive = useDrive(isPlaying);

    const box = Math.min(width || height, height);
    const radius = box * 0.26;
    const maxLen = box * 0.2;
    const barW = Math.max(1.5, ((TAU * radius) / RADIAL_BARS) * 0.62);
    const hoop = Math.max(1, radius - 4);

    const bars = useMemo(
      () =>
        Array.from({ length: RADIAL_BARS }, (_, i) => ({
          angle: (i / RADIAL_BARS) * TAU,
          rate: 1 + ((i * 37) % 3),
          offset: ((i * 61) % 100) / 100,
        })),
      [],
    );

    return (
      <View onLayout={handleLayout} {...(panHandlers || {})} style={{ height, alignItems: "center" }}>
        <View style={{ width: box, height: box, marginTop: (height - box) / 2 }}>
          {box > 0 && (
            <>
              {/* Web draws a faint hoop just inside the spokes; without it the
                  ring has no centre. Under them, so a spoke's inner end can
                  cross it. */}
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: box / 2 - hoop,
                  top: box / 2 - hoop,
                  width: hoop * 2,
                  height: hoop * 2,
                  borderRadius: hoop,
                  borderWidth: 1,
                  borderColor: tint(hue, 82, 0.28),
                }}
              />
              {bars.map((b, i) => (
                <RadialBar
                  key={i}
                  clock={clock}
                  drive={drive}
                  angle={b.angle}
                  radius={radius}
                  maxLen={maxLen}
                  barW={barW}
                  rate={b.rate}
                  offset={b.offset}
                  color={tint(hue, 70, 0.75)}
                  box={box}
                />
              ))}
            </>
          )}
        </View>
      </View>
    );
  },
);

/* ─── Spectrum ──────────────────────────────────────────────────────────── */

const SPECTRUM_COLUMNS = 34;

/**
 * A spectrogram scrolls a history of frames off the right edge. With nothing to
 * record, this scrolls a seeded picture of one instead: the column strip is
 * rendered twice and slid left by exactly its own width, so the loop has no
 * seam, and the seed makes a given post always show the same pattern.
 */
const SpectrumVisualizer: React.FC<BandProps> = memo(
  ({ seed, isPlaying, hue, height, onLayout, panHandlers }) => {
    const { width, handleLayout } = useBandWidth(onLayout);
    const drive = useDrive(isPlaying);
    const scroll = useSharedValue(0);

    const colWidth = width > 0 ? width / SPECTRUM_COLUMNS : 0;
    const stripWidth = colWidth * SPECTRUM_COLUMNS;

    useEffect(() => {
      if (!isPlaying || stripWidth <= 0) {
        cancelAnimation(scroll);
        return;
      }
      scroll.value = 0;
      scroll.value = withRepeat(
        withTiming(-stripWidth, { duration: 5200, easing: Easing.linear }),
        -1,
        false,
      );
      return () => cancelAnimation(scroll);
    }, [isPlaying, stripWidth, scroll]);

    // Per column: five stops top→bottom. Web tilts intensity down the spectrum
    // and shifts hue with it; same shape here, five stops instead of one pixel
    // per row.
    const columns = useMemo(() => {
      const rand = seedRandom(seed);
      return Array.from({ length: SPECTRUM_COLUMNS }, () => {
        // Roughly one column in seven is a transient. Without them every column
        // lands in the same middle band and the strip reads as wallpaper.
        const punch = rand() > 0.86 ? 1 : 0.22 + 0.5 * rand();
        return Array.from({ length: 5 }, (_, row) => {
          // row 0 is the top of the gradient = the high frequencies.
          const f = 1 - row / 4;
          const intensity = Math.pow(f, 1.5) * punch * (0.55 + 0.45 * rand());
          const light = Math.round(8 + intensity * 62);
          const h = hue === 0 ? 0 : Math.round((hue + intensity * 60) % 360);
          const s = hue === 0 ? 0 : Math.round(70 + intensity * 25);
          return `hsla(${h}, ${s}%, ${light}%, ${(0.25 + intensity * 0.75).toFixed(3)})`;
        });
      });
    }, [seed, hue]);

    const stripStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: scroll.value }],
      opacity: 0.45 + 0.55 * drive.value,
    }));

    return (
      <View
        onLayout={handleLayout}
        {...(panHandlers || {})}
        style={{ height, overflow: "hidden", backgroundColor: "rgba(0,0,0,0.35)" }}
      >
        <Animated.View style={[{ flexDirection: "row", height }, stripStyle]}>
          {colWidth > 0 &&
            [0, 1].map((copy) =>
              columns.map((stops, i) => (
                <LinearGradient
                  key={`${copy}-${i}`}
                  colors={stops as [string, string, ...string[]]}
                  style={{ width: colWidth, height }}
                />
              )),
            )}
        </Animated.View>
        {/* The lit edge web paints where new frames arrive. */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: 3,
            backgroundColor: tint(hue, 60, 0.5),
          }}
        />
      </View>
    );
  },
);

/* ─── Rings ─────────────────────────────────────────────────────────────── */

const RING_COUNT = 5;

interface RingProps {
  clock: SharedValue<number>;
  drive: SharedValue<number>;
  index: number;
  box: number;
  color: string;
}

const Ring: React.FC<RingProps> = memo(({ clock, drive, index, box, color }) => {
  const style = useAnimatedStyle(() => {
    // Each ring is the same ripple, one slot further along. frac() rather than
    // a sine, so the wrap is the point instead of a glitch.
    const raw = clock.value + index / RING_COUNT;
    const p = raw - Math.floor(raw);
    return {
      transform: [{ scale: 0.12 + p * 0.88 }],
      opacity: (1 - p) * (0.15 + 0.75 * drive.value),
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: 0,
          top: 0,
          width: box,
          height: box,
          borderRadius: box / 2,
          borderWidth: 2,
          borderColor: color,
        },
        style,
      ]}
    />
  );
});

const RingsVisualizer: React.FC<BandProps> = memo(
  ({ isPlaying, hue, height, onLayout, panHandlers }) => {
    const { width, handleLayout } = useBandWidth(onLayout);
    const clock = useClock(isPlaying, 2300);
    const drive = useDrive(isPlaying);
    const box = Math.min(width || height, height);
    const coreSize = box * 0.3;

    const coreStyle = useAnimatedStyle(() => {
      const beat = 0.5 + 0.5 * Math.sin(clock.value * TAU * 2);
      return {
        transform: [{ scale: 0.75 + (0.15 + 0.35 * beat) * drive.value }],
        opacity: 0.3 + 0.6 * drive.value,
      };
    });

    return (
      <View onLayout={handleLayout} {...(panHandlers || {})} style={{ height, alignItems: "center" }}>
        <View style={{ width: box, height: box, marginTop: (height - box) / 2, overflow: "hidden" }}>
          {box > 0 && (
            <>
              {Array.from({ length: RING_COUNT }, (_, i) => (
                <Ring key={i} clock={clock} drive={drive} index={i} box={box} color={tint(hue, 68, 0.85)} />
              ))}
              {/* Centre pulse. Web fades a radial gradient here; three nested
                  discs are the closest RN gets without one. */}
              <Animated.View
                style={[
                  {
                    position: "absolute",
                    left: box / 2 - coreSize / 2,
                    top: box / 2 - coreSize / 2,
                    width: coreSize,
                    height: coreSize,
                    borderRadius: coreSize / 2,
                    backgroundColor: tint(hue, 70, 0.18),
                    alignItems: "center",
                    justifyContent: "center",
                  },
                  coreStyle,
                ]}
              >
                <View
                  style={{
                    width: coreSize * 0.6,
                    height: coreSize * 0.6,
                    borderRadius: coreSize * 0.3,
                    backgroundColor: tint(hue, 78, 0.3),
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <View
                    style={{
                      width: coreSize * 0.28,
                      height: coreSize * 0.28,
                      borderRadius: coreSize * 0.14,
                      backgroundColor: tint(hue, 92, 0.75),
                    }}
                  />
                </View>
              </Animated.View>
            </>
          )}
        </View>
      </View>
    );
  },
);

/* ─── Pulse ─────────────────────────────────────────────────────────────── */

interface LobeRingProps {
  clock: SharedValue<number>;
  drive: SharedValue<number>;
  box: number;
  lobes: number;
  lobeSize: number;
  orbit: number;
  turns: number;
  breathe: number;
  /** Opaque — the layer's transparency is the group's, not the discs'. */
  color: string;
  alpha: number;
}

/**
 * A ring of overlapping soft discs. On its own it is a lumpy circle; three of
 * them turning at different rates and breathing out of step read as one blob
 * whose outline never repeats — which is what web's frequency-morphed bezier
 * blob looks like from across the room, and it costs no path maths.
 *
 * The discs are opaque and the transparency lives on the group. Alpha per disc
 * makes every overlap a darker patch and the layer reads as a Venn diagram
 * instead of one body; a parent opacity composites the discs first and fades
 * the result, which is the whole point of drawing it this way.
 */
const LobeRing: React.FC<LobeRingProps> = memo(
  ({ clock, drive, box, lobes, lobeSize, orbit, turns, breathe, color, alpha }) => {
    const style = useAnimatedStyle(() => {
      const s = 1 + (0.06 + 0.18 * Math.sin(clock.value * breathe * TAU)) * drive.value;
      return {
        transform: [{ rotate: `${clock.value * turns * TAU}rad` }, { scale: s }],
        opacity: alpha * (0.45 + 0.55 * drive.value),
      };
    });

    return (
      <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: box, height: box }, style]}>
        {Array.from({ length: lobes }, (_, i) => {
          const a = (i / lobes) * TAU;
          return (
            <View
              key={i}
              style={{
                position: "absolute",
                left: box / 2 - lobeSize / 2 + Math.cos(a) * orbit,
                top: box / 2 - lobeSize / 2 + Math.sin(a) * orbit,
                width: lobeSize,
                height: lobeSize,
                borderRadius: lobeSize / 2,
                backgroundColor: color,
              }}
            />
          );
        })}
      </Animated.View>
    );
  },
);

const PulseVisualizer: React.FC<BandProps> = memo(
  ({ isPlaying, hue, height, onLayout, panHandlers }) => {
    const { width, handleLayout } = useBandWidth(onLayout);
    const clock = useClock(isPlaying, 5200);
    const drive = useDrive(isPlaying);
    const box = Math.min(width || height, height);
    const coreSize = box * 0.26;

    const coreStyle = useAnimatedStyle(() => {
      const beat = 0.5 + 0.5 * Math.sin(clock.value * TAU * 3);
      return {
        transform: [{ scale: 0.72 + (0.2 + 0.42 * beat) * drive.value }],
        opacity: 0.45 + 0.55 * drive.value,
      };
    });

    return (
      <View onLayout={handleLayout} {...(panHandlers || {})} style={{ height, alignItems: "center" }}>
        <View style={{ width: box, height: box, marginTop: (height - box) / 2 }}>
          {box > 0 && (
            <>
              {/* Outer is web's high band: widest, faintest, hue-shifted most. */}
              <LobeRing
                clock={clock}
                drive={drive}
                box={box}
                lobes={6}
                lobeSize={box * 0.46}
                orbit={box * 0.17}
                turns={1}
                breathe={1}
                color={tint(hue === 0 ? 0 : (hue + 60) % 360, 62, 1)}
                alpha={0.16}
              />
              <LobeRing
                clock={clock}
                drive={drive}
                box={box}
                lobes={5}
                lobeSize={box * 0.36}
                orbit={box * 0.12}
                turns={-2}
                breathe={2}
                color={tint(hue === 0 ? 0 : (hue + 30) % 360, 68, 1)}
                alpha={0.24}
              />
              <LobeRing
                clock={clock}
                drive={drive}
                box={box}
                lobes={4}
                lobeSize={box * 0.28}
                orbit={box * 0.07}
                turns={3}
                breathe={3}
                color={tint(hue, 74, 1)}
                alpha={0.34}
              />
              {/* Bright centre — the one part of the blob that reads as a source
                  of light rather than a body. */}
              <Animated.View
                style={[
                  {
                    position: "absolute",
                    left: box / 2 - coreSize / 2,
                    top: box / 2 - coreSize / 2,
                    width: coreSize,
                    height: coreSize,
                    borderRadius: coreSize / 2,
                    backgroundColor: tint(hue, 88, 0.5),
                    alignItems: "center",
                    justifyContent: "center",
                  },
                  coreStyle,
                ]}
              >
                <View
                  style={{
                    width: coreSize * 0.5,
                    height: coreSize * 0.5,
                    borderRadius: coreSize * 0.25,
                    backgroundColor: tint(hue, 96, 0.9),
                  }}
                />
              </Animated.View>
            </>
          )}
        </View>
      </View>
    );
  },
);

/* ─── Terrain ───────────────────────────────────────────────────────────── */

const TERRAIN_ROWS = 14;
const TERRAIN_COLS = 13;

interface TerrainRowProps {
  clock: SharedValue<number>;
  drive: SharedValue<number>;
  index: number;
  groundH: number;
  color: string;
}

/**
 * One horizontal grid line. Rows do not translate as a block: perspective
 * spacing is not uniform, so a block translate slides the whole grid instead of
 * making it flow towards you. Each row walks its own 0→1 and is placed through
 * the same perspective curve, which is what the flow actually is.
 */
const TerrainRow: React.FC<TerrainRowProps> = memo(({ clock, drive, index, groundH, color }) => {
  const style = useAnimatedStyle(() => {
    const raw = clock.value + index / TERRAIN_ROWS;
    const p = raw - Math.floor(raw);
    return {
      transform: [{ translateY: groundH * Math.pow(p, 2.2) }],
      opacity: (0.15 + 0.85 * p) * (0.4 + 0.6 * drive.value),
    };
  });

  return (
    <Animated.View
      style={[
        { position: "absolute", left: 0, right: 0, top: 0, height: 1, backgroundColor: color },
        style,
      ]}
    />
  );
});

const TerrainVisualizer: React.FC<BandProps> = memo(
  ({ isPlaying, hue, height, onLayout, panHandlers }) => {
    const { width, handleLayout } = useBandWidth(onLayout);
    const clock = useClock(isPlaying, 3400);
    const drive = useDrive(isPlaying);

    const horizon = height * 0.35;
    const groundH = height - horizon;
    const sunSize = Math.max(24, height * 0.34);
    const line = tint(hue, 62, 0.55);

    const sunStyle = useAnimatedStyle(() => ({
      transform: [{ scale: 0.9 + 0.1 * Math.sin(clock.value * TAU) * drive.value }],
      opacity: 0.5 + 0.5 * drive.value,
    }));

    // Kept very low at hue 0: a white sky gradient over a dark card is a grey
    // slab, not a sky. The light in this scene comes from the sun.
    const skyTop = hue === 0 ? "rgba(255,255,255,0.015)" : `hsla(${(hue + 180) % 360}, 60%, 22%, 0.4)`;
    const skyBottom = hue === 0 ? "rgba(255,255,255,0.07)" : `hsla(${hue}, 80%, 48%, 0.28)`;

    return (
      <View
        onLayout={handleLayout}
        {...(panHandlers || {})}
        style={{ height, overflow: "hidden", backgroundColor: "rgba(0,0,0,0.3)" }}
      >
        <LinearGradient
          colors={[skyTop, skyBottom]}
          style={{ position: "absolute", left: 0, right: 0, top: 0, height: horizon }}
        />

        {width > 0 && (
          <Animated.View
            style={[
              {
                position: "absolute",
                left: width / 2 - sunSize / 2,
                top: horizon - sunSize / 2,
                width: sunSize,
                height: sunSize,
                borderRadius: sunSize / 2,
                overflow: "hidden",
              },
              sunStyle,
            ]}
          >
            <LinearGradient
              colors={[
                tint(hue === 0 ? 0 : (hue + 40) % 360, 95, 0.95),
                tint(hue, 70, 0.55),
                tint(hue, 55, 0.05),
              ]}
              style={{ flex: 1 }}
            />
            {/* Slats across the lower half. Four bars of the card's own
                backdrop, widening downwards — the one detail that makes a
                bright disc read as the synthwave sun rather than a marble. */}
            {[0.52, 0.66, 0.79, 0.91].map((at, i) => (
              <View
                key={at}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: sunSize * at,
                  height: 1.5 + i * 1.2,
                  // Translucent black rather than the card's colour: the card
                  // is 65% black over whatever the theme paints, and the
                  // fullscreen modal is pure black. A hardcoded hex is right in
                  // exactly one of those places.
                  backgroundColor: "rgba(0,0,0,0.9)",
                }}
              />
            ))}
          </Animated.View>
        )}

        {/* Ground. Clipped to below the horizon, so the converging lines can be
            plain rotated views without escaping into the sky. */}
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: horizon,
            height: groundH,
            overflow: "hidden",
          }}
        >
          {width > 0 &&
            Array.from({ length: TERRAIN_COLS }, (_, i) => {
              const spread = (i / (TERRAIN_COLS - 1) - 0.5) * 2; // -1 … 1
              const len = groundH * 2.4;
              return (
                <View
                  key={i}
                  style={{
                    position: "absolute",
                    left: width / 2,
                    top: 0,
                    width: 1,
                    height: len,
                    backgroundColor: line,
                    opacity: 0.35,
                    /* Rotate about the TOP edge so every column meets at the
                       vanishing point. RN rotates about the centre, so the pair
                       of translates has to move the top edge onto the origin
                       first (right-most transform applies first) and put it
                       back after. Swapping their signs rotates about the wrong
                       point and the lines fan out from nowhere. */
                    transform: [
                      { translateY: -len / 2 },
                      { rotate: `${spread * 0.62}rad` },
                      { translateY: len / 2 },
                    ],
                  }}
                />
              );
            })}
          {Array.from({ length: TERRAIN_ROWS }, (_, i) => (
            <TerrainRow key={i} clock={clock} drive={drive} index={i} groundH={groundH} color={line} />
          ))}
        </View>
      </View>
    );
  },
);

/* ─── Orb ───────────────────────────────────────────────────────────────── */

/**
 * The assistant's ball of cosmic dust, playing a track.
 *
 * GEOMETRY IS SHARED WITH components/DM/ReplyOrb.tsx, dehubweb's
 * src/components/app/chat/ReplyOrb.tsx and dehubweb's canvas transcription of
 * it in visualizer-styles.ts: same 30 grains, same uniform-y latitudes, same
 * golden-angle longitudes, same -14° lean, same 0.42/0.05/0.62 ratios, same
 * 0.55+0.45·depth scale and 0.2+0.8·depth fade, same 9000ms idle spin. Change
 * one, change all four, or the ball stops being the same object.
 *
 * Playing is the orb's own "thinking" state: it spins at 2600ms and the haze
 * pulses at 1200ms. Each grain also gets a shimmer of its own, so the surface
 * moves rather than the whole ball scaling — that is what web gets by giving
 * every grain its own slice of the spectrum, on a clock instead of an analyser.
 */
const ORB_MOTES = 30;
const ORB_GOLDEN_FRACTION = 0.381966;
const ORB_DURATION = {
  idle: { spin: 9000, haze: 3000 },
  thinking: { spin: 2600, haze: 1200 },
} as const;
const ORB_RATIO = { sphere: 0.42, mote: 0.05, haze: 0.62 } as const;
const ORB_TILT_DEG = -14;

const ORB_LAYOUT = Array.from({ length: ORB_MOTES }, (_, i) => {
  const t = (i + 0.5) / ORB_MOTES;
  const y = 1 - 2 * t;
  return {
    y,
    ringRadius: Math.sqrt(Math.max(0, 1 - y * y)),
    phase: (i * ORB_GOLDEN_FRACTION) % 1,
    bright: i % 7 === 3,
  };
});

interface OrbMoteProps {
  spin: SharedValue<number>;
  drive: SharedValue<number>;
  phase: number;
  ringRadius: number;
  y: number;
  size: number;
  radius: number;
  box: number;
  color: string;
  /** Integer rate this grain shimmers at, standing in for its band on web. */
  shimmer: number;
}

const OrbMote: React.FC<OrbMoteProps> = memo(
  ({ spin, drive, phase, ringRadius, y, size, radius, box, color, shimmer }) => {
    const style = useAnimatedStyle(() => {
      const angle = (spin.value + phase) * TAU;
      // cos gives depth: +1 is the front of the ball, -1 the back.
      const depth = (Math.cos(angle) + 1) / 2;
      const lift = (0.5 + 0.5 * Math.sin((spin.value * shimmer + phase) * TAU)) * drive.value;
      return {
        transform: [
          { translateX: ringRadius * radius * Math.sin(angle) * (1 + lift * 0.22) },
          // `top` already carries the latitude; this is only the lift off it.
          { translateY: y * radius * lift * 0.22 },
          { scale: (0.55 + 0.45 * depth) * (1 + lift * 0.5) },
        ],
        opacity: (0.2 + 0.8 * depth) * (0.75 + 0.35 * lift),
      };
    });

    return (
      <Animated.View
        style={[
          {
            position: "absolute",
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            // Latitude is fixed; only the ring sweep is animated.
            left: (box - size) / 2,
            top: (box - size) / 2 + y * radius,
          },
          style,
        ]}
      />
    );
  },
);

const OrbVisualizer: React.FC<BandProps> = memo(
  ({ isPlaying, hue, height, onLayout, panHandlers }) => {
    const { width, handleLayout } = useBandWidth(onLayout);
    const box = Math.min(width || height, height);
    const R = box * ORB_RATIO.sphere;
    const moteBase = Math.max(1.5, box * ORB_RATIO.mote);
    const hazeSize = box * ORB_RATIO.haze;

    const spin = useSharedValue(0);
    const haze = useSharedValue(0);
    const drive = useDrive(isPlaying);

    const spinMs = isPlaying ? ORB_DURATION.thinking.spin : ORB_DURATION.idle.spin;
    const hazeMs = isPlaying ? ORB_DURATION.thinking.haze : ORB_DURATION.idle.haze;

    useEffect(() => {
      // Restart from zero on a state change so a slow idle cycle cannot stall
      // halfway into the fast one.
      cancelAnimation(spin);
      cancelAnimation(haze);
      spin.value = 0;
      haze.value = 0;
      spin.value = withRepeat(withTiming(1, { duration: spinMs, easing: Easing.linear }), -1, false);
      haze.value = withRepeat(
        withTiming(1, { duration: hazeMs / 2, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
      return () => {
        cancelAnimation(spin);
        cancelAnimation(haze);
      };
    }, [spinMs, hazeMs, spin, haze]);

    const hazeStyle = useAnimatedStyle(() => ({
      opacity: (0.5 + haze.value * 0.4) * (0.6 + 0.4 * drive.value),
      transform: [{ scale: 1 + haze.value * (0.12 + 0.2 * drive.value) }],
    }));

    const moteColor = tint(hue, 78, 0.68);
    const brightColor = tint(hue, 92, 0.95);

    return (
      <View onLayout={handleLayout} {...(panHandlers || {})} style={{ height, alignItems: "center" }}>
        <View
          style={{
            width: box,
            height: box,
            marginTop: (height - box) / 2,
            transform: [{ rotate: `${ORB_TILT_DEG}deg` }],
          }}
          pointerEvents="none"
        >
          {box > 0 && (
            <>
              {/* Faint core haze — without it the motes read as a ring of dots
                  rather than a body with volume. RN has no radial gradient
                  without a dependency, so this is three nested discs: the glow
                  web gets from gradient stops, in three steps. */}
              <Animated.View
                style={[
                  {
                    position: "absolute",
                    width: hazeSize,
                    height: hazeSize,
                    borderRadius: hazeSize / 2,
                    left: (box - hazeSize) / 2,
                    top: (box - hazeSize) / 2,
                    backgroundColor: tint(hue, 70, 0.07),
                    alignItems: "center",
                    justifyContent: "center",
                  },
                  hazeStyle,
                ]}
              >
                <View
                  style={{
                    width: hazeSize * 0.62,
                    height: hazeSize * 0.62,
                    borderRadius: hazeSize * 0.31,
                    backgroundColor: tint(hue, 78, 0.1),
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <View
                    style={{
                      width: hazeSize * 0.32,
                      height: hazeSize * 0.32,
                      borderRadius: hazeSize * 0.16,
                      backgroundColor: tint(hue, 90, 0.16),
                    }}
                  />
                </View>
              </Animated.View>

              {ORB_LAYOUT.map((m, i) => (
                <OrbMote
                  key={i}
                  spin={spin}
                  drive={drive}
                  phase={m.phase}
                  ringRadius={m.ringRadius}
                  y={m.y}
                  size={m.bright ? moteBase * 1.45 : moteBase}
                  radius={R}
                  box={box}
                  color={m.bright ? brightColor : moteColor}
                  shimmer={2 + ((i * 7) % 5)}
                />
              ))}
            </>
          )}
        </View>
      </View>
    );
  },
);

/* ─── Dispatcher ────────────────────────────────────────────────────────── */

export interface AudioVisualizerProps {
  style: VisualizerStyle;
  seed: string;
  isPlaying: boolean;
  hue: number;
  /** Playhead 0–1, shared so a drag moves the default waveform off the UI thread. */
  position: SharedValue<number>;
  /** Overrides the band height so fullscreen renders the same style big. */
  height?: number;
  onLayout?: (e: LayoutChangeEvent) => void;
  panHandlers?: Partial<GestureResponderHandlers>;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = memo((props) => {
  const { style, seed, isPlaying, hue, position, onLayout, panHandlers } = props;
  const height = props.height ?? styleBandHeight(style);
  const band = { seed, isPlaying, hue, height, onLayout, panHandlers };

  switch (style) {
    case "waveform":
      return <WaveVisualizer {...band} />;
    case "circular":
      return <RadialVisualizer {...band} />;
    case "spectrum":
      return <SpectrumVisualizer {...band} />;
    case "rings":
      return <RingsVisualizer {...band} />;
    case "pulse":
      return <PulseVisualizer {...band} />;
    case "terrain":
      return <TerrainVisualizer {...band} />;
    case "orb":
      return <OrbVisualizer {...band} />;
    case "bars":
    case "mirror":
      return <BarsVisualizer {...band} mode={style} />;
    case "static":
    default:
      return (
        <StaticWaveform
          seed={seed}
          position={position}
          hue={hue}
          height={height}
          onLayout={onLayout}
          panHandlers={panHandlers}
        />
      );
  }
});

AudioVisualizer.displayName = "AudioVisualizer";
