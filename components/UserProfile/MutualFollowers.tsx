import React from "react";
import { View, Text } from "react-native";
import Avatar from "../common/Avatar";
import { theme } from "../../theme";
import { getAvatarUrl } from "../../libs/misc";
import type { FollowListItem } from "../../services/user.service";

interface MutualFollowersProps {
  mutuals: FollowListItem[];
}

const MAX_DISPLAY = 3;

const MutualFollowers: React.FC<MutualFollowersProps> = ({ mutuals }) => {
  if (!mutuals.length) return null;

  const displayed = mutuals.slice(0, MAX_DISPLAY);
  const remaining = mutuals.length - MAX_DISPLAY;

  const names = displayed.map((m) => m.user.username || m.user.displayName || "unknown");

  let text: string;
  if (names.length === 1) {
    text = names[0];
  } else if (names.length === 2) {
    text = `${names[0]} and ${names[1]}`;
  } else {
    text =
      remaining > 0
        ? `${names.join(", ")} +${remaining}`
        : `${names[0]}, ${names[1]} and ${names[2]}`;
  }

  return (
    <View className="flex-row items-center mt-3 gap-2">
      <View className="flex-row">
        {displayed.map((m, i) => (
          <Avatar
            key={m.user.address}
            uri={getAvatarUrl(m.user.avatarImageUrl)}
            size={20}
            name={m.user.username || m.user.displayName || m.user.address}
            style={i > 0 ? { marginLeft: -6, borderWidth: 1.5, borderColor: theme.colors.neutrals[900] } : undefined}
          />
        ))}
      </View>
      {/* Shown without the words: the faces and names already say it. */}
      <Text className="text-zinc-400 text-xs flex-1" numberOfLines={1} accessibilityLabel={`Followed by ${text}`}>
        {text}
      </Text>
    </View>
  );
};

export default MutualFollowers;
