import React, { useEffect, useMemo, useState } from "react";
import {
  Image,
  ImageSourcePropType,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";

export interface AvatarProps {
  uri?: string | null;
  size?: number; // pixels
  rounded?: boolean;
  className?: string;
  style?: ViewStyle;
  onPress?: () => void;
  fallback?: ImageSourcePropType; // optional local fallback (default-avatar)
  showSkeleton?: boolean; // default true for remote uri
  borderWidth?: number;
  borderColor?: string;
}

export const AvatarSkeleton: React.FC<{
  size: number;
  className?: string;
  style?: ViewStyle;
  borderWidth?: number;
  borderColor?: string;
}> = ({ size, className, style, borderWidth, borderColor }) => (
  <View
    className={`bg-theme-neutrals-800 rounded-full animate-pulse ${
      className || ""
    }`}
    style={{
      width: size,
      height: size,
      borderWidth,
      borderColor,
      ...(style || {}),
    }}
  />
);

const Avatar: React.FC<AvatarProps> = ({
  uri,
  size = 40,
  rounded = true,
  className,
  style,
  onPress,
  fallback,
  showSkeleton = true,
  borderWidth,
  borderColor,
}) => {
  const isRemote = typeof uri === "string" && !!uri && uri !== "default-avatar";
  const [loaded, setLoaded] = useState<boolean>(!isRemote);

  useEffect(() => {
    // Reset load state when uri changes
    setLoaded(!isRemote);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  const source: ImageSourcePropType | undefined = useMemo(() => {
    if (isRemote) return { uri: uri as string };
    if (fallback) return fallback;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require("../../assets/default-avatar.png");
    } catch {
      return undefined;
    }
  }, [isRemote, uri, fallback]);

  const radius = rounded ? size / 2 : 8;
  // Apply a default 1px margin unless caller provided any margin in style
  const hasCustomMargin =
    !!style &&
    (style.margin != null ||
      (style as any).marginHorizontal != null ||
      (style as any).marginVertical != null ||
      (style as any).marginTop != null ||
      (style as any).marginRight != null ||
      (style as any).marginBottom != null ||
      (style as any).marginLeft != null);
  const defaultMargin = hasCustomMargin ? undefined : 1;
  const Container: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <View
      className={`${className || ""}`}
      style={{
        width: size,
        height: size,
        borderWidth,
        borderColor,
        borderRadius: radius,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        margin: defaultMargin,
        ...(style || {}),
      }}
    >
      {children}
    </View>
  );

  const imageNode = source ? (
    <Image
      source={source}
      onLoadStart={() => setLoaded(false)}
      onLoadEnd={() => setLoaded(true)}
      resizeMode="cover"
      style={{ width: "100%", height: "100%", borderRadius: radius }}
    />
  ) : (
    <View style={{ width: "100%", height: "100%" }} />
  );

  const skeletonVisible = showSkeleton && isRemote && !loaded;
  const body = (
    <Container>
      {imageNode}
      {skeletonVisible ? (
        <View
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <AvatarSkeleton size={size} />
        </View>
      ) : null}
    </Container>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        {body}
      </TouchableOpacity>
    );
  }
  return body;
};

export default Avatar;
