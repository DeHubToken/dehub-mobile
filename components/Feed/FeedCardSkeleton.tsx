import React from "react";
import { View, StyleSheet } from "react-native";
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_HAIRLINE, MINIMAL_INSET } from "../../theme/minimal";
import { FEED_BENTO_RADIUS } from "../../libs/feed-image-layout";
import SkeletonBlock from "./SkeletonBlock";

interface FeedCardSkeletonProps {
  count?: number;
  cinematic?: boolean;
  topChromeInset?: number;
  edgeInset?: number;
}

const FeedCardSkeleton: React.FC<FeedCardSkeletonProps> = ({ count = 3, cinematic = false, topChromeInset = 0, edgeInset = 0 }) => {
  const { theme, isMinimal, skin } = useAppTheme();
  const edge = cinematic && theme === "immersive" && !skin;
  const inset = edge || isMinimal ? MINIMAL_INSET : 12;
  const shape = isMinimal || skin?.square ? 0 : FEED_BENTO_RADIUS;
  return (
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: count }, (_, idx) => {
        const variant = idx % 3;
        const media = variant !== 2;
        const firstMedia = edge && idx === 0 && topChromeInset > 0;
        const header = (
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 12 }}>
            <SkeletonBlock style={{ width: 36, height: 36, borderRadius: shape ? 6 : 0 }} />
            <View style={{ flex: 1, gap: 6, paddingTop: 2 }}>
              <SkeletonBlock style={{ width: "65%", maxWidth: 128, height: 14 }} />
              <SkeletonBlock style={{ width: "45%", maxWidth: 80, height: 12 }} />
            </View>
            <SkeletonBlock style={{ width: 20, height: 20 }} />
          </View>
        );
        const picture = media ? (
          <SkeletonBlock style={{ aspectRatio: variant === 0 ? firstMedia ? 9 / 16 : 16 / 9 : 4 / 3, marginHorizontal: edge || isMinimal ? -inset : 0, marginBottom: 12, borderRadius: edge || isMinimal ? 0 : shape }} />
        ) : null;
        return (
          <View key={idx} style={edge || isMinimal ? {
            paddingTop: firstMedia ? 0 : isMinimal ? 22 : 20,
            paddingHorizontal: inset,
            paddingBottom: isMinimal ? 18 : 20,
            marginHorizontal: -edgeInset,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: MINIMAL_HAIRLINE,
          } : [skin?.card ?? {
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            backgroundColor: "rgba(255,255,255,0.03)",
            borderRadius: FEED_BENTO_RADIUS,
          }, { padding: 12, marginVertical: 6 }]}>
            {firstMedia ? <>{picture}{header}</> : <>{header}{picture}</>}
            <View style={{ gap: 8, marginBottom: 12 }}>
              <SkeletonBlock style={{ width: "85%", height: 14 }} />
              <SkeletonBlock style={{ width: "60%", height: 12 }} />
              {!media && <SkeletonBlock style={{ width: "72%", height: 12 }} />}
              <SkeletonBlock style={{ width: 96, height: 10 }} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              {[32, 32, 48, 64].map((width, i) => (
                <SkeletonBlock key={i} style={{ width, height: 32, borderRadius: shape, ...(i === 3 ? { marginLeft: "auto" } : {}) }} />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
};

export default FeedCardSkeleton;
