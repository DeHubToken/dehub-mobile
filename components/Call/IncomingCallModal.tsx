import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { TouchableOpacity } from "react-native";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import { useCall } from "../../context/CallContext";

const IncomingCallModal: React.FC = () => {
  const { isIncoming, currentCall, acceptCall, rejectCall, peerAddress } = useCall();
  const [peerName, setPeerName] = useState<string | null>(null);

  useEffect(() => {
    if (!peerAddress) return;
    setPeerName(null);
    // TODO: fetch username from API
  }, [peerAddress]);

  const displayName = peerName
    ? `@${peerName}`
    : peerAddress
      ? `${peerAddress.slice(0, 6)}...${peerAddress.slice(-4)}`
      : "";

  return (
    <GlassModal visible={isIncoming} onClose={rejectCall} dismissible={false}>
      <View style={styles.container}>
        <View style={styles.avatarRing}>
          <View style={styles.avatar}>
            <Icon name="Phone" size={40} color="#FFFFFF" />
          </View>
        </View>
        <Text style={styles.title}>{displayName}</Text>
        <Text style={styles.subtitle}>
          {currentCall?.call_type === "video" ? "Incoming video call..." : "Incoming voice call..."}
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={rejectCall}
            style={styles.rejectBtn}
            accessibilityRole="button"
            accessibilityLabel="Decline call"
          >
            <Icon name="PhoneOff" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.spacer} />
          <TouchableOpacity
            onPress={acceptCall}
            style={styles.acceptBtn}
            accessibilityRole="button"
            accessibilityLabel="Accept call"
          >
            <Icon name="Phone" size={24} color="#09090B" />
          </TouchableOpacity>
        </View>
      </View>
    </GlassModal>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 16,
  },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "600",
  },
  subtitle: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 15,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 24,
    gap: 32,
  },
  rejectBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  acceptBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    // Accept is the solid control, decline the glass one — the pair used to be
    // green and red, which the design system keeps off every surface.
    backgroundColor: "#FAFAFA",
    alignItems: "center",
    justifyContent: "center",
  },
  spacer: {
    width: 32,
  },
});

export default IncomingCallModal;
