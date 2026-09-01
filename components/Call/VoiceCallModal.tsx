import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { TouchableOpacity } from "react-native";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import { useCall } from "../../context/CallContext";

const VoiceCallModal: React.FC = () => {
  const {
    isCallActive,
    currentCall,
    isConnecting,
    isMuted,
    callDuration,
    endCall,
    toggleMute,
    peerAddress,
  } = useCall();

  const [peerName, setPeerName] = useState<string | null>(null);

  const isAudioCall = currentCall?.call_type === "audio";
  const isVisible = (isCallActive || isConnecting) && isAudioCall && !!currentCall;

  useEffect(() => {
    if (!peerAddress) return;
    setPeerName(null);
    // TODO: fetch username from API
  }, [peerAddress]);

  if (!isVisible) return null;

  const displayName = peerName
    ? `@${peerName}`
    : peerAddress
      ? `${peerAddress.slice(0, 6)}...${peerAddress.slice(-4)}`
      : "";

  const statusText = isConnecting
    ? "Connecting..."
    : callDuration !== "00:00"
      ? callDuration
      : "Connected";

  return (
    <GlassModal visible={true} onClose={endCall} dismissible={false}>
      <View style={styles.container}>
        <View style={styles.avatarRing}>
          <View style={styles.avatar}>
            <Icon name="Phone" size={40} color="#FFFFFF" />
          </View>
        </View>
        <Text style={styles.title}>{displayName}</Text>
        <Text style={styles.subtitle}>{statusText}</Text>

        <View style={styles.actions}>
          <TouchableOpacity
            onPress={toggleMute}
            style={[styles.roundBtn, isMuted && styles.activeBtn]}
            accessibilityRole="button"
            accessibilityLabel={isMuted ? "Unmute microphone" : "Mute microphone"}
            accessibilityState={{ selected: isMuted }}
          >
            <Icon name={isMuted ? "MicOff" : "Mic"} size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={endCall}
            style={styles.endBtn}
            accessibilityRole="button"
            accessibilityLabel="End call"
          >
            <Icon name="PhoneOff" size={22} color="#FFFFFF" />
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
    gap: 12,
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
    gap: 24,
  },
  roundBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  activeBtn: {
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  endBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default VoiceCallModal;
