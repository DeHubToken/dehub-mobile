/**
 * A person on a bounty — poster, applicant, worker or reviewer.
 *
 * Native counterpart of the web `WorkUser` (src/features/work/components).
 * Tapping opens the profile sheet, which is what the bare address rows already
 * did, so this changes what is drawn and not where it goes.
 *
 * The address stays visible under the name wherever this wallet is the one
 * being paid: a username is a display name, but the transfer goes to the
 * address, and the poster is entitled to check it before signing.
 */
import React from "react";
import { Pressable, Text, View, StyleSheet, type ViewStyle } from "react-native";
import Avatar from "../common/Avatar";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { useWorkProfile, workProfileAvatar, workProfileName } from "../../hooks/useWorkProfiles";

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function WorkUser({
  address,
  size = 28,
  showAddress = false,
  style,
}: {
  address: string;
  size?: number;
  /** Print the raw address under the name — use wherever this wallet gets paid. */
  showAddress?: boolean;
  style?: ViewStyle;
}) {
  const { showUserProfile } = useUserProfileSheet();
  const profile = useWorkProfile(address);
  const name = workProfileName(profile, address);
  const uri = workProfileAvatar(profile, size);

  return (
    <Pressable
      onPress={() => showUserProfile(address)}
      style={[styles.wrap, style]}
      hitSlop={6}
    >
      <Avatar uri={uri} size={size} rounded name={name} />
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {showAddress && (
          <Text style={styles.addr} numberOfLines={1}>
            {shortAddr(address)}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  text: { flexShrink: 1, minWidth: 0 },
  name: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  addr: { color: "rgba(255,255,255,0.40)", fontSize: 10, fontVariant: ["tabular-nums"] },
});
