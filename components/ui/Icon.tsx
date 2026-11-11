import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Pressable,
  Text,
  StyleSheet,
  Modal,
  Dimensions,
  Platform,
  PixelRatio,
  findNodeHandle,
  type TextStyle,
} from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
} from "react-native-reanimated";
import { colors } from "../../theme/colors";
import GlassIndicator, { GLASS_SHADOW } from "./GlassIndicator";
// Not lucide's `icons` barrel: that bundles and evaluates every icon at boot.
import { iconRegistry, type IconName as RegistryIconName } from "./iconRegistry";
import { getCutIcon, type CutIconName } from "./cut-icons";
import { iconPaths } from "./iconPaths";
import { iconGlyphs } from "./iconGlyphs";
import { cutIconGlyphs } from "./cutIconGlyphs";
import { CUT_ICON_FONT_FAMILY, ICON_FONT_FAMILY, isCutIconFontReady, isIconFontReady } from "../../libs/iconFont";
import Svg, { Path } from "react-native-svg";

export type IconName = RegistryIconName | CutIconName;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
  gradient?: string[];
  tooltip?: string;
  glass?: boolean;
  glassBorderRadius?: number;
  glassPadding?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Screen-reader label for interactive icons; falls back to the tooltip text. */
  accessibilityLabel?: string;
}

const TOOLTIP_SHOW_DURATION = 1500;
const LONG_PRESS_DELAY = 400;

// A shape after the first in these is an open, zero-area stroke (the thumb's
// cuff line), so a fill over the merged path paints what per-shape fills do.
const FILL_SAFE_MERGED = new Set<string>(["ThumbsUp", "ThumbsDown"]);

type Glyph = { char: string; family: string };

/**
 * The icon's glyph in an icon font, when the font can draw it exactly. Android
 * only — there every SvgView is rasterised in software into its own bitmap;
 * iOS draws paths on the GPU.
 *
 * Lucide icons: their own stroke (2), unfilled, no gradient. Cut icons (most
 * of a feed card): their default stroke, either unfilled or filled with their
 * own colour, which is how the action bar draws a liked thumb or a saved
 * bookmark. Any other stroke or fill keeps the SVG.
 */
function glyphFor(name: IconName, strokeWidth: number, color: string, fill?: string, gradient?: string[]): Glyph | undefined {
  if (Platform.OS !== "android" || strokeWidth !== 2) return undefined;
  if (gradient && gradient.length >= 2) return undefined;
  const unfilled = !fill || fill === "none";
  if (getCutIcon(name)) {
    if (!isCutIconFontReady()) return undefined;
    const cut = cutIconGlyphs[name];
    const char = !cut ? undefined : unfilled ? cut.o : fill.toLowerCase() === color.toLowerCase() ? cut.f : undefined;
    return char ? { char, family: CUT_ICON_FONT_FAMILY } : undefined;
  }
  if (!unfilled || !isIconFontReady()) return undefined;
  const char = iconGlyphs[name as RegistryIconName];
  return char ? { char, family: ICON_FONT_FAMILY } : undefined;
}

/** Side room around a glyph's box, as a share of its size. */
const GLYPH_SLACK = 0.25;

/** One style per font, size and colour, so a glyph's props stay referentially stable. */
const glyphStyles = new Map<string, TextStyle>();

function glyphStyle(family: string, size: number, color: string): TextStyle {
  const key = `${family}|${size}|${color}`;
  let style = glyphStyles.get(key);
  if (!style) {
    // Android rounds a font size up to whole pixels. Aiming just under the
    // box's own pixel height lands that rounding on the box, not one past it.
    const ratio = PixelRatio.get();
    const fontSize = (Math.round(size * ratio) - 0.01) / ratio;
    style = {
      fontFamily: family,
      // Registered for the normal face only; any other weight falls back to a
      // system font with no such glyph.
      fontWeight: "normal",
      fontStyle: "normal",
      fontSize,
      // Each font's em is its whole line (ascent 1000, descent 0), so a line
      // height equal to the size puts the artwork's grid on the box 1:1.
      lineHeight: fontSize,
      includeFontPadding: false,
      textAlign: "center",
      textAlignVertical: "center",
      // A TextView clips its ink to its own box, and Android can set a glyph
      // a few pixels off the box's centre. Glyphs that run to the em's edges
      // (Radio's outer arcs) then lost a sliver of one side. A wider box, its
      // extra width taken back by the margins, keeps the icon's place and
      // size and gives the ink room.
      width: size + GLYPH_SLACK * 2 * size,
      marginHorizontal: -GLYPH_SLACK * size,
      height: size,
      color,
    };
    glyphStyles.set(key, style);
  }
  return style;
}

function renderGlyph(glyph: Glyph, size: number, color: string) {
  return (
    <Text
      cssInterop={false}
      allowFontScaling={false}
      accessible={false}
      importantForAccessibility="no"
      style={glyphStyle(glyph.family, size, color)}
    >
      {glyph.char}
    </Text>
  );
}

const Icon: React.FC<IconProps> = (props) => {
  const glyph = glyphFor(props.name, props.strokeWidth ?? 2, props.color ?? colors.foreground, props.fill, props.gradient);
  // A bare icon, which is most of a feed card, is one Text and runs no hooks.
  if (glyph && !props.glass && !props.tooltip && !props.onPress && !props.onLongPress) {
    return renderGlyph(glyph, props.size ?? 24, props.color ?? colors.foreground);
  }
  return <IconWithChrome {...props} glyph={glyph} />;
};

const IconWithChrome: React.FC<IconProps & { glyph?: Glyph }> = ({
  name,
  size = 24,
  color = colors.foreground,
  strokeWidth = 2,
  fill,
  gradient,
  tooltip,
  glass = false,
  glassBorderRadius = 12,
  glassPadding = 10,
  onPress,
  onLongPress,
  accessibilityLabel,
  glyph,
}) => {
  const LucideIcon = getCutIcon(name) ?? iconRegistry[name as RegistryIconName];
  const CutIcon = getCutIcon(name);
  const iconRef = useRef<View>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number; w: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = useCallback(() => {
    if (!tooltip || !iconRef.current) return;
    iconRef.current.measureInWindow((x, y, w, _h) => {
      setTooltipPos({ x, y, w });
      setTooltipVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        setTooltipVisible(false);
        setTooltipPos(null);
      }, TOOLTIP_SHOW_DURATION);
    });
  }, [tooltip]);

  const handleLongPress = useCallback(() => {
    if (onLongPress) {
      onLongPress();
      return;
    }
    showTooltip();
  }, [onLongPress, showTooltip]);

  if (!LucideIcon) {
    if (__DEV__) console.warn(`[Icon] "${name}" is not in iconRegistry; run \`npm run icons:write\``);
    return <View style={{ width: size, height: size }} />;
  }
  // One merged path is three native views at most, instead of one per shape.
  // A fill spreads over the merged outline the same as over one shape, so
  // filled icons use it only when they are one shape.
  const merged = CutIcon || (gradient && gradient.length >= 2) ? undefined : iconPaths[name as RegistryIconName];
  const single =
    merged && (!fill || fill === "none" || merged[1] === 1 || FILL_SAFE_MERGED.has(name)) ? merged[0] : null;

  const iconElement = glyph ? (
    renderGlyph(glyph, size, color)
  ) : single ? (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={single}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={fill || "none"}
      />
    </Svg>
  ) : gradient && gradient.length >= 2 ? (
    <MaskedView
      style={{ width: size, height: size }}
      maskElement={
        <LucideIcon size={size} color="#fff" strokeWidth={strokeWidth} />
      }
    >
      <LinearGradient
        style={{ flex: 1 }}
        colors={gradient as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
    </MaskedView>
  ) : (
    <LucideIcon size={size} color={color} strokeWidth={strokeWidth} fill={fill || "none"} />
  );

  const isInteractive = !!(tooltip || onPress || onLongPress);

  const tooltipModal = tooltipVisible && tooltipPos ? (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        setTooltipVisible(false);
        setTooltipPos(null);
      }}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => {
          setTooltipVisible(false);
          setTooltipPos(null);
        }}
      >
        <View
          onLayout={(e) => {
            const bubbleW = e.nativeEvent.layout.width;
            const screenW = Dimensions.get("window").width;
            const idealLeft = tooltipPos.x + tooltipPos.w / 2 - bubbleW / 2;
            const clampedLeft = Math.max(8, Math.min(idealLeft, screenW - bubbleW - 8));
            if (Math.abs(clampedLeft - idealLeft) > 1) {
              e.currentTarget?.setNativeProps?.({ style: { left: clampedLeft } });
            }
          }}
          style={{
            position: "absolute",
            top: tooltipPos.y - 40,
            left: Math.max(8, tooltipPos.x + tooltipPos.w / 2 - 50),
            alignItems: "center",
            zIndex: 9999,
          }}
          pointerEvents="none"
        >
          <View style={styles.tooltipBubble}>
            <View style={styles.tooltipGlassOverlay}>
              <Text style={styles.tooltipText}>{tooltip}</Text>
            </View>
          </View>
          <View style={styles.tooltipArrow} />
        </View>
      </Pressable>
    </Modal>
  ) : null;

  if (glass) {
    const containerSize = size + glassPadding * 2;
    if (isInteractive) {
      return (
        <>
          <Pressable
            ref={iconRef}
            onPress={onPress}
            onLongPress={(tooltip || onLongPress) ? handleLongPress : undefined}
            delayLongPress={LONG_PRESS_DELAY}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? tooltip}
            style={[
              styles.glassContainer,
              {
                width: containerSize,
                height: containerSize,
                borderRadius: glassBorderRadius,
              },
              GLASS_SHADOW,
            ]}
          >
            <GlassIndicator borderRadius={glassBorderRadius} />
            {iconElement}
          </Pressable>
          {tooltipModal}
        </>
      );
    }
    return (
      <View
        ref={iconRef}
        style={[
          styles.glassContainer,
          {
            width: containerSize,
            height: containerSize,
            borderRadius: glassBorderRadius,
          },
          GLASS_SHADOW,
        ]}
      >
        <GlassIndicator borderRadius={glassBorderRadius} />
        {iconElement}
      </View>
    );
  }

  if (isInteractive) {
    return (
      <>
        <Pressable
          ref={iconRef}
          onPress={onPress}
          onLongPress={(tooltip || onLongPress) ? handleLongPress : undefined}
          delayLongPress={LONG_PRESS_DELAY}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? tooltip}
        >
          {iconElement}
        </Pressable>
        {tooltipModal}
      </>
    );
  }

  return iconElement;
};

const styles = StyleSheet.create({
  glassContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  tooltipBubble: {
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.15)",
  },
  tooltipGlassOverlay: {
    backgroundColor: "#1D1F21",
  },
  tooltipText: {
    color: "#F3F4F6",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tooltipArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 5,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "rgba(50, 50, 55, 0.7)",
  },
});

// A feed card holds ten or more of these; without memo every one re-rendered
// with the card.
export default React.memo(Icon);
