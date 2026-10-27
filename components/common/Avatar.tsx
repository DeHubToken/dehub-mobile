import React, { useState, useMemo } from "react";
import {
  TouchableOpacity,
  View,
  Text,
  ViewStyle,
  ImageSourcePropType,
} from "react-native";
import SmartImage from "./SmartImage";
import LiveRipple from "./LiveRipple";

interface AvatarProps {
  uri?: string | null;
  /**
   * Tried when `uri` fails, before falling back to the initial: the wallet's
   * own picture, for rows that stored a path that has since gone stale.
   */
  fallbackUri?: string | null;
  size?: number;
  /** Corner radius; defaults to 16% of the size. */
  radius?: number;
  onPress?: () => void;
  style?: ViewStyle;
  fallback?: ImageSourcePropType;
  borderWidth?: number;
  borderColor?: string;
  className?: string;
  name?: string;
  /** On air right now: red outlines ripple out from behind the avatar. */
  live?: boolean;
  /** Profile-sized avatars: a much quieter ripple (see LiveRipple `quiet`). */
  liveQuiet?: boolean;
}

const INITIAL_BG = "#2A2C2E";
const INITIAL_COLOR = "#A6A9AC";

function getInitial(name?: string): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (trimmed.startsWith("0x") && trimmed.length > 4) return trimmed.slice(2, 4).toUpperCase();
  return trimmed.charAt(0).toUpperCase();
}

// Web renders every avatar as a rounded square -- its Avatar primitive is
// rounded-lg and nothing overrides it -- so there is no circular variant here
// to reach for. Only coins and chain logos stay round, and those are images,
// not avatars.
const Avatar: React.FC<AvatarProps> = ({
  uri,
  fallbackUri,
  size = 40,
  radius: radiusProp,
  onPress,
  style,
  fallback,
  borderWidth = 0,
  borderColor = "#000",
  className,
  name,
  live = false,
  liveQuiet = false,
}) => {
  // There used to be a `loaded` flag set from the Image's onLoad, purely to
  // decide whether to show the initial behind it. That was a guaranteed extra
  // render for every avatar in the feed as it scrolled into view. The initial
  // now simply sits underneath the (opaque) image, so there is nothing to
  // toggle and only the failure count survives: `step` walks the sources in
  // order, the stored picture, then the fallback, then the initial alone.
  //
  // It is keyed on the sources and reset during render rather than in an
  // effect: in a recycling list the same Avatar instance is handed a different
  // user's uri, and carrying the previous failures over left a row that had
  // once failed stuck on the initial letter for every user after it.
  const sources = useMemo(() => {
    const out: string[] = [];
    for (const u of [uri, fallbackUri]) {
      if (u && u !== "default-avatar" && !out.includes(u)) out.push(u);
    }
    return out;
  }, [uri, fallbackUri]);
  const key = sources.join("|");
  const [load, setLoad] = useState({ key, step: 0 });
  if (load.key !== key) setLoad({ key, step: 0 });
  const current = load.key === key ? sources[load.step] : sources[0];

  const radius = radiusProp ?? Math.round(size * 0.16);
  const showImage = !!current;

  const initial = useMemo(() => getInitial(name), [name]);
  const fontSize = Math.max(10, Math.round(size * 0.42));

  // When live, the className (usually a margin) moves to the ripple's wrapper
  // so the rings stay centred on the box itself.
  const content = (
    <View
      className={!onPress && !live ? className : undefined}
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius,
          overflow: "hidden",
          borderWidth,
          borderColor,
          backgroundColor: INITIAL_BG,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Text
        style={{ fontSize, fontWeight: "700", color: INITIAL_COLOR }}
        numberOfLines={1}
      >
        {initial}
      </Text>
      {/* SmartImage (expo-image), not RN Image: every avatar in the app comes
          through here, and RN's Image has no disk cache — each one was
          re-downloaded and re-decoded on every scroll-back. It sits on top of
          the initial rather than swapping with it, so nothing re-renders once
          the bytes arrive. */}
      {showImage && (
        <SmartImage
          source={{ uri: current }}
          style={{
            width: "100%",
            height: "100%",
            borderRadius: radius,
            position: "absolute",
          }}
          contentFit="cover"
          // Same avatar across many rows is the common case, so the memory half
          // of the cache does most of the work here; the recycling key keeps a
          // reused row from flashing the previous user's face.
          recyclingKey={current}
          transition={0}
          onError={() => setLoad((s) => (s.key === key ? { ...s, step: s.step + 1 } : s))}
        />
      )}
    </View>
  );

  const box = live ? (
    <LiveRipple size={size} radius={radius} quiet={liveQuiet} className={!onPress ? className : undefined}>
      {content}
    </LiveRipple>
  ) : content;

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.8} onPress={onPress} className={className}>
        {box}
      </TouchableOpacity>
    );
  }

  return box;
};

export default React.memo(Avatar);
