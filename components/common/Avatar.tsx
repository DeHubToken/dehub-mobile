import React, { useState, useMemo } from "react";
import {
  Image,
  TouchableOpacity,
  View,
  Text,
  ViewStyle,
  ImageSourcePropType,
} from "react-native";

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

const Avatar: React.FC<AvatarProps> = ({
  uri,
  size = 40,
  rounded = true,
  onPress,
  style,
  fallback,
  borderWidth = 0,
  borderColor = "#000",
  className,
  name,
}) => {
  const [loaded, setLoaded] = useState(false);
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
          backgroundColor: showImage && loaded ? "transparent" : INITIAL_BG,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      {showImage ? (
        <>
          <Image
            source={{ uri: uri! }}
            style={{
              width: "100%",
              height: "100%",
              borderRadius: radius,
              position: "absolute",
            }}
            resizeMode="cover"
            onLoad={() => setLoaded(true)}
            onError={() => { setLoaded(true); setErrored(true); }}
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
