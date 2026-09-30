/**
 * New Member Chip (mobile)
 * ========================
 * The temporary "New" marker beside a name, for the first
 * NEW_MEMBER_WINDOW_DAYS after an account is created. Twin of web's
 * `components/app/NewMemberChip.tsx`.
 *
 * Renders nothing when the person is not new, or has opted out — the two cases
 * are indistinguishable here on purpose, because RLS never returns the row.
 */
import React, { FC } from "react";
import { View, Text } from "react-native";
import { useIsNewMember } from "../../hooks/useNewMembers";

interface NewMemberChipProps {
  address?: string | null;
  /** Laid straight over a photo or video frame: a darker fill that reads on
   *  a bright picture. */
  overMedia?: boolean;
}

const CHIP_HEIGHT = 16;
const CHIP_TEXT_LINE_HEIGHT = 12;

const OVER_MEDIA = {
  borderColor: "rgba(255,255,255,0.22)",
  backgroundColor: "rgba(0,0,0,0.38)",
  shadowColor: "#000",
  shadowOpacity: 0.3,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 1 },
  elevation: 2,
} as const;

const NewMemberChip: FC<NewMemberChipProps> = ({ address, overMedia = false }) => {
  const { isNew } = useIsNewMember(address);

  if (!isNew) return null;

  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          flexShrink: 0,
          height: CHIP_HEIGHT,
          paddingHorizontal: 6,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.15)",
          backgroundColor: "rgba(255,255,255,0.10)",
        },
        overMedia ? OVER_MEDIA : null,
      ]}
    >
      <Text
        style={{
          color: "#FFFFFF",
          fontSize: 10,
          lineHeight: CHIP_TEXT_LINE_HEIGHT,
          fontWeight: "600",
        }}
      >
        New
      </Text>
    </View>
  );
};

export default React.memo(NewMemberChip);
