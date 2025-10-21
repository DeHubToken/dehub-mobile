import React, { useState } from "react";
import {
  Image,
  TouchableOpacity,
  View,
  ViewStyle,
  ImageSourcePropType,
  ActivityIndicator,
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
}) => {
  const [loaded, setLoaded] = useState(false);
  const radius = rounded ? size / 2 : 8;
  const isRemote = !!uri && uri !== "default-avatar";

  const source: ImageSourcePropType = isRemote
    ? { uri: uri! }
    : fallback || require("../../assets/default-avatar.png");

  const content = (
    <View
      style={[
        {
          width: size,
          height: size,
          marginHorizontal: 1,
          borderRadius: radius,
          overflow: "hidden",
          borderWidth,
          borderColor,
          backgroundColor: loaded ? "transparent" : "#333", // skeleton bg
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Image
        source={source}
        style={{
          width: "100%",
          height: "100%",
          borderRadius: radius,
          position: "absolute",
        }}
        resizeMode="cover"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />

      {!loaded && (
        // <ActivityIndicator size="small" color="#999" />
        // alternatively, you can just do:
        <View style={{ flex: 1, backgroundColor: '#444' }} />
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.8} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

export default Avatar;
