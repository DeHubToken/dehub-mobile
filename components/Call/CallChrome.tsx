import React from "react";
import { View, Text, StyleSheet, Pressable, Modal, StatusBar } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Avatar from "../common/Avatar";
import Icon, { type IconName } from "../ui/Icon";
import { colors } from "../../theme/colors";
import { radius } from "../../theme/radius";

/**
 * The shared chrome for every call surface — incoming, voice and video.
 *
 * A call takes the whole screen, the way the platform's own phone UI does: the
 * controls have to be hittable without looking, and a sheet that can be dragged
 * away is the wrong shape for that. What stays ours is the palette — no green
 * accept and no red hang-up anywhere, because the design system keeps both off
 * every surface. The single high-contrast control is the solid light one, and
 * which action gets it depends on the screen: accept while ringing, end once
 * the call is up.
 *
 * `radius.full` is deliberate here and only here among our buttons: theme/radius
 * carves out the in-call controls as the one place that follows the platform's
 * round-button convention. Avatars stay rounded squares.
 */

export const CONTROL_SIZE = 68;
const SMALL_CONTROL_SIZE = 60;

export const CallScreen: React.FC<{
  onRequestClose: () => void;
  children: React.ReactNode;
}> = ({ onRequestClose, children }) => (
  <Modal
    visible
    onRequestClose={onRequestClose}
    statusBarTranslucent
    animationType="fade"
    transparent={false}
  >
    <StatusBar barStyle="light-content" />
    <View style={styles.screen}>
      <LinearGradient
        colors={["#26282B", "#0C0E10", colors.background]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {children}
    </View>
  </Modal>
);

/** Caller/callee block: what kind of call, who it is, and where it has got to. */
export const CallIdentity: React.FC<{
  kindLabel: string;
  kindIcon: IconName;
  name: string;
  status: string;
  avatarUri?: string | null;
  avatarSize?: number;
  compact?: boolean;
}> = ({ kindLabel, kindIcon, name, status, avatarUri, avatarSize = 104, compact }) => (
  <View style={styles.identity}>
    <View style={styles.kindRow}>
      <Icon name={kindIcon} size={13} color={colors.mutedForeground} />
      <Text style={styles.kindLabel} numberOfLines={1}>
        {kindLabel}
      </Text>
    </View>
    <Text style={[styles.name, compact && styles.nameCompact]} numberOfLines={1}>
      {name}
    </Text>
    <Text style={styles.status} numberOfLines={1}>
      {status}
    </Text>
    {!compact && (
      <View style={styles.avatarWrap}>
        <Avatar uri={avatarUri} size={avatarSize} name={name} />
      </View>
    )}
  </View>
);

/**
 * One round control with its label underneath. `active` inverts it to the solid
 * light fill — the same treatment the primary action gets — so a muted mic or a
 * live speaker reads at a glance without reaching for a colour we do not have.
 */
export const CallControl: React.FC<{
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  primary?: boolean;
  small?: boolean;
  accessibilityLabel?: string;
}> = ({ icon, label, onPress, active, primary, small, accessibilityLabel }) => {
  const size = small ? SMALL_CONTROL_SIZE : CONTROL_SIZE;
  const solid = primary || active;
  return (
    <View style={styles.controlSlot}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.control,
          { width: size, height: size, borderRadius: radius.full },
          solid ? styles.controlSolid : styles.controlGlass,
          pressed && styles.controlPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ selected: !!active }}
      >
        <Icon
          name={icon}
          size={small ? 22 : 25}
          color={solid ? colors.accentForeground : colors.foreground}
        />
      </Pressable>
      <Text style={styles.controlLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

/** The glass slab the controls sit in, welded to the bottom safe area. */
export const CallControlPanel: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.panelWrap, { paddingBottom: Math.max(20, insets.bottom + 8) }]}>
      <View style={styles.panel}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  identity: {
    alignItems: "center",
    gap: 6,
  },
  kindRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  kindLabel: {
    color: colors.mutedForeground,
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  name: {
    color: colors.foreground,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.4,
    marginTop: 2,
    maxWidth: "90%",
    textAlign: "center",
  },
  nameCompact: {
    fontSize: 20,
    fontWeight: "600",
  },
  status: {
    color: colors.mutedForeground,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
  },
  avatarWrap: {
    marginTop: 28,
    borderRadius: radius.xl + 4,
    padding: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  panelWrap: {
    paddingHorizontal: 16,
  },
  panel: {
    borderRadius: 32,
    paddingVertical: 22,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    rowGap: 22,
  },
  controlSlot: {
    width: "33.333%",
    alignItems: "center",
    gap: 10,
  },
  control: {
    alignItems: "center",
    justifyContent: "center",
  },
  controlGlass: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  controlSolid: {
    backgroundColor: colors.accent,
  },
  controlPressed: {
    opacity: 0.72,
  },
  controlLabel: {
    color: colors.mutedForeground,
    fontSize: 13,
    fontWeight: "500",
  },
});

export default CallScreen;
