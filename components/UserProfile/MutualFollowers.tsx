import { useTranslation as _useCopy } from 'react-i18next';
import React from "react";
import { View, Text } from "react-native";
import Avatar from "../common/Avatar";
import { theme } from "../../theme";
import { getAvatarUrl } from "../../libs/misc";
import type { FollowListItem } from "../../services/user.service";

interface MutualFollowersProps {
  mutuals: FollowListItem[];
}

const MAX_DISPLAY = 5;

const MutualFollowers: React.FC<MutualFollowersProps> = ({ mutuals }) => {
  const { t: _copy } = _useCopy();
  if (!mutuals.length) return null;

  // Faces only: the count tag already says how many.
  const displayed = mutuals.slice(0, MAX_DISPLAY);
  const names = displayed
    .map((m) => m.user.username || m.user.displayName)
    .filter(Boolean)
    .join(", ");

  const countLabel =
    mutuals.length === 1
      ? _copy("profile.mutualsOne", { defaultValue: "{{count}} Mutual:", count: mutuals.length })
      : _copy("profile.mutualsMany", { defaultValue: "{{count}} Mutuals:", count: mutuals.length });

  return (
    <View className="flex-row items-center mt-3 gap-2">
      <Text className="text-zinc-400 text-xs" numberOfLines={1}>
        {countLabel}
      </Text>
      <View className="flex-row" accessible accessibilityLabel={names}>
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
    </View>
  );
};

export default MutualFollowers;
