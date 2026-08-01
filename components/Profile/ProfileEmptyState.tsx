import React, { memo } from "react";
import {
  Image,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";

export type ProfileEmptyStateKind =
  | "home"
  | "posts"
  | "images"
  | "videos"
  | "subscribers"
  | "songs"
  | "live"
  | "fractions"
  | "pinned";

const ICONS: Record<ProfileEmptyStateKind, ImageSourcePropType> = {
  home: require("../../assets/web-icons/home-3d-icon.png"),
  posts: require("../../assets/web-icons/comment-3d-icon.png"),
  images: require("../../assets/web-icons/image-frame-3d-icon.png"),
  videos: require("../../assets/web-icons/filmstrip-3d-icon.png"),
  subscribers: require("../../assets/web-icons/subs-3d-icon.png"),
  songs: require("../../assets/web-icons/audio-3d-icon.png"),
  live: require("../../assets/web-icons/live-3d-icon.png"),
  fractions: require("../../assets/web-icons/fractions-3d-icon.png"),
  pinned: require("../../assets/web-icons/bookmark-3d-icon.png"),
};

interface ProfileEmptyStateProps {
  kind: ProfileEmptyStateKind;
  title: string;
  subtitle: string;
}

const ProfileEmptyState: React.FC<ProfileEmptyStateProps> = ({
  kind,
  title,
  subtitle,
}) => (
  <View className="items-center justify-center px-6 py-12">
    <Image
      source={ICONS[kind]}
      accessibilityLabel={title}
      resizeMode="contain"
      style={{ width: 64, height: 64, marginBottom: 12 }}
    />
    <Text className="text-white text-lg font-medium text-center">{title}</Text>
    <Text className="text-white/70 text-sm mt-1 text-center">{subtitle}</Text>
  </View>
);

export default memo(ProfileEmptyState);
