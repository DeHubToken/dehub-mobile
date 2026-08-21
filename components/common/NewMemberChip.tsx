/**
 * New Member Chip (mobile)
 * ========================
 * The temporary "New here" marker beside a name, for the first
 * NEW_MEMBER_WINDOW_DAYS after an account is created. Twin of web's
 * `components/app/NewMemberChip.tsx`.
 *
 * Renders nothing when the person is not new, or has opted out — the two cases
 * are indistinguishable here on purpose, because RLS never returns the row.
 */
import React, { FC } from "react";
import { View, Text } from "react-native";
import Icon from "../ui/Icon";
import { useIsNewMember } from "../../hooks/useNewMembers";

interface NewMemberChipProps {
  address?: string | null;
}

const NewMemberChip: FC<NewMemberChipProps> = ({ address }) => {
  const { isNew } = useIsNewMember(address);

  if (!isNew) return null;

  return (
    <View className="flex-row items-center rounded-md border border-white/15 bg-white/10 px-2 py-0.5">
      <Icon name="Sparkles" size={11} color="#FFFFFF" />
      <Text className="text-white text-[11px] font-medium ml-1">New here</Text>
    </View>
  );
};

export default React.memo(NewMemberChip);
