import React, { useState, useMemo } from "react";
import {
  TouchableOpacity,
  View,
  Text,
  ViewStyle,
  ImageSourcePropType,
} from "react-native";
import SmartImage from "./SmartImage";

interface AvatarProps {
  uri?: string | null;
  size?: number;
  rounded?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  fallback?: ImageSourcePropType;
  borderWidth?: number;
  borderColor?: string;
  className?: string;
  name?: string;
}

const INITIAL_BG = "#2A2C2E";
const INITIAL_COLOR = "#A6A9AC";

function getInitial(name?: string): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (trimmed.startsWith("0x") && trimmed.length > 4) return trimmed.slice(2, 4).toUpperCase();
  return trimmed.charAt(0).toUpperCase();
}

// Web renders avatars as rounded squares everywhere (rounded-md/lg), so the
// squared shape is the default; pass rounded to get a circle.
const Avatar: React.FC<AvatarProps> = ({
  uri,
  size = 40,
  rounded = false,
  onPress,
  style,
  fallback,
  borderWidth = 0,
  borderColor = "#000",
  className,
  name,
}) => {
  // There used to be a `loaded` flag set from the Image's onLoad, purely to
  // decide whether to show the initial behind it. That was a guaranteed extra
  // render for every avatar in the feed as it scrolled into view. The initial
  // now simply sits underneath the (opaque) image, so there is nothing to
  // toggle and only the error flag survives.
  //
  // It is still keyed on `uri` and reset during render rather than in an
  // effect: in a recycling list the same Avatar instance is handed a different
  // user's uri, and carrying the previous `errored` over left a row that had
  // once failed stuck on the initial letter for every user after it.
  const [load, setLoad] = useState({ uri, errored: false });
  if (load.uri !== uri) setLoad({ uri, errored: false });
  const { errored } = load;

  const radius = rounded ? size / 2 : Math.round(size * 0.16);
  const isRemote = !!uri && uri !== "default-avatar";
  const showImage = isRemote && !errored;

  const initial = useMemo(() => getInitial(name), [name]);
  const fontSize = Math.max(10, Math.round(size * 0.42));

  const content = (
    <View
      className={!onPress ? className : undefined}
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
          source={{ uri: uri! }}
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
          recyclingKey={uri}
          transition={0}
          onError={() => setLoad((s) => (s.uri === uri ? { ...s, errored: true } : s))}
        />
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.8} onPress={onPress} className={className}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

export default Avatar;
