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

const MAX_DISPLAY = 3;

const MutualFollowers: React.FC<MutualFollowersProps> = ({ mutuals }) => {
  const { t: _copy } = _useCopy();
  if (!mutuals.length) return null;

  const displayed = mutuals.slice(0, MAX_DISPLAY);
  const remaining = mutuals.length - MAX_DISPLAY;

  const names = displayed.map((m) => m.user.username || m.user.displayName || _copy("copy.b23a6a8439c0", { defaultValue: "unknown" }));

  let text: string;
  if (names.length === 1) {
    text = names[0];
  } else if (names.length === 2) {
    text = _copy("copy.f4780f76354c", { defaultValue: "{{value1}} and {{value2}}", value1: names[0], value2: names[1] });
  } else {
    text =
      remaining > 0
        ? `${names.join(", ")} +${remaining}`
        : _copy("copy.3ff66a9762c9", { defaultValue: "{{value1}}, {{value2}} and {{value3}}", value1: names[0], value2: names[1], value3: names[2] });
  }

  const countLabel =
    mutuals.length === 1
      ? _copy("profile.mutualsOne", { defaultValue: "{{count}} Mutual:", count: mutuals.length })
      : _copy("profile.mutualsMany", { defaultValue: "{{count}} Mutuals:", count: mutuals.length });

  return (
    <View className="flex-row items-center mt-3 gap-2">
      <Text className="text-zinc-400 text-xs" numberOfLines={1}>
        {countLabel}
      </Text>
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
      <Text className="text-zinc-400 text-xs flex-1" numberOfLines={1} accessibilityLabel={_copy("copy.fef6a1a97127", { defaultValue: "Followed by {{value1}}", value1: text })}>
        {text}
      </Text>
    </View>
  );
};

export default MutualFollowers;
