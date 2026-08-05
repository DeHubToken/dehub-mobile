import React from "react";
import { Pressable, View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Avatar from "../common/Avatar";
import Icon from "../ui/Icon";
import ShimmerBorder from "./ShimmerBorder";

interface StoryAvatarRingProps {
  uri?: string;
  name: string;
  size: number;
  hasStories: boolean;
  unwatched?: boolean;
  onPressStory?: () => void;
  onPressAvatar?: () => void;
  rounded?: boolean;
}

const StoryAvatarRing: React.FC<StoryAvatarRingProps> = ({
  uri,
  name,
  size,
  hasStories,
  unwatched = true,
  onPressStory,
  onPressAvatar,
  rounded = false,
}) => {
  const borderRadius = rounded ? size / 2 : 12;
  const innerSize = hasStories ? Math.max(size - 8, size * 0.82) : size;

  const avatar = (
    <Avatar
      uri={uri}
      size={innerSize}
      name={name}
      rounded={rounded}
      style={{ borderWidth: hasStories ? 2 : 3, borderColor: "#010305" }}
    />
  );

  if (!hasStories) {
    return (
      <Pressable onPress={onPressAvatar} disabled={!onPressAvatar}>
        <Avatar
          uri={uri}
          size={size}
          name={name}
          rounded={rounded}
          onPress={onPressAvatar}
          style={{ borderWidth: 3, borderColor: "#010305" }}
        />
      </Pressable>
    );
  }

  const playBadge = (
    <View style={styles.playBadge} pointerEvents="none">
      <Icon name="Play" size={Math.max(10, size * 0.16)} color="#fff" fill="#fff" />
    </View>
  );

  const ringBody = (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {avatar}
      {playBadge}
    </View>
  );

  if (unwatched) {
    return (
      <Pressable
        onPress={onPressStory}
        onLongPress={onPressAvatar}
        delayLongPress={350}
        accessibilityLabel="View story"
      >
        <LinearGradient
          colors={["#FFFFFF", "#A1A1AA", "#FFFFFF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            padding: 2.5,
            borderRadius,
            width: size,
            height: size,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {ringBody}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPressStory}
      onLongPress={onPressAvatar}
      delayLongPress={350}
      accessibilityLabel="View story"
    >
      <ShimmerBorder active={false} size={size} borderRadius={borderRadius}>
        {ringBody}
      </ShimmerBorder>
    </Pressable>
  );
};

export default StoryAvatarRing;

const styles = StyleSheet.create({
  playBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderWidth: 1.5,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});
