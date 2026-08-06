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
  // There used to be a `loaded` state set from the Image's onLoad, purely to
  // decide whether to show the initial behind it. That was a guaranteed extra
  // render for every avatar in the feed as it scrolled into view — and with RN
  // Image's lack of a disk cache, a re-download and re-decode each time a row
  // recycled. The initial now simply sits underneath the (opaque) image, so
  // there is nothing to toggle.
  const [errored, setErrored] = useState(false);
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
          marginHorizontal: 1,
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
      {showImage && (
        <SmartImage
          source={{ uri: uri! }}
          style={{
            width: "100%",
            height: "100%",
            borderRadius: radius,
            position: "absolute",
          }}
          // Same avatar across many rows is the common case, so the memory half
          // of the cache does most of the work here; the recycling key keeps a
          // reused row from flashing the previous user's face.
          recyclingKey={uri}
          transition={0}
          onError={() => setErrored(true)}
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
