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
  // Keyed on `uri` and reset during render rather than in an effect: in a
  // recycling list the same Avatar instance is handed a different user's uri,
  // and carrying the previous `loaded`/`errored` over meant a recycled row
  // either skipped the initial-letter placeholder or stayed stuck on it.
  const [load, setLoad] = useState({ uri, loaded: false, errored: false });
  if (load.uri !== uri) setLoad({ uri, loaded: false, errored: false });
  const { loaded, errored } = load;

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
          backgroundColor: showImage && loaded ? "transparent" : INITIAL_BG,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      {showImage ? (
        <>
          {/* SmartImage (expo-image), not RN Image: every avatar in the app
              comes through here, and RN's Image has no disk cache — each one
              re-downloaded and re-decoded on every scroll-back. `recyclingKey`
              is the uri so a reused row can never flash the previous user's
              face before the new one decodes. */}
          <SmartImage
            source={{ uri: uri! }}
            style={{
              width: "100%",
              height: "100%",
              borderRadius: radius,
              position: "absolute",
            }}
            contentFit="cover"
            recyclingKey={uri}
            onLoadEnd={() => setLoad((s) => (s.uri === uri ? { ...s, loaded: true } : s))}
            onError={() => setLoad((s) => (s.uri === uri ? { ...s, errored: true } : s))}
          />
          {!loaded && (
            <Text
              style={{
                fontSize,
                fontWeight: "700",
                color: INITIAL_COLOR,
              }}
              numberOfLines={1}
            >
              {initial}
            </Text>
          )}
        </>
      ) : (
        <Text
          style={{
            fontSize,
            fontWeight: "700",
            color: INITIAL_COLOR,
          }}
          numberOfLines={1}
        >
          {initial}
        </Text>
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
