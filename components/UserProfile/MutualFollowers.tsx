import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import Avatar from "../common/Avatar";
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
    text = `Followed by ${names[0]}`;
  } else if (names.length === 2) {
    text = `Followed by ${names[0]} and ${names[1]}`;
  } else {
    text = `Followed by ${names[0]}, ${names[1]} and ${names.slice(2).join(", ")}${
      remaining > 0 ? ` and ${remaining} other${remaining > 1 ? "s" : ""}` : ""
    }`;
  }

  return (
    <TouchableOpacity activeOpacity={0.7} className="flex-row items-center mt-3 gap-2">
      <View className="flex-row">
        {displayed.map((m, i) => (
          <Avatar
            key={m.user.address}
            uri={getAvatarUrl(m.user.avatarImageUrl)}
            size={20}
            name={m.user.username || m.user.displayName || m.user.address}
            style={i > 0 ? { marginLeft: -6, borderWidth: 1.5, borderColor: "#010305" } : undefined}
          />
        ))}
      </View>
      <Text className="text-zinc-500 text-xs flex-1" numberOfLines={1}>
        {text}
      </Text>
    </TouchableOpacity>
  );
};

export default MutualFollowers;
