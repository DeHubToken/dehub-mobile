import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { TouchableOpacity } from "react-native";
import Icon from "../ui/Icon";
import { useCall } from "../../context/CallContext";

const CallMiniPlayer: React.FC = () => {
  const { isCallActive, callDuration, endCall } = useCall();

  if (!isCallActive) return null;

  return (
    <View style={styles.container}>
      <View style={styles.info}>
        <View style={styles.iconWrap}>
          <Icon name="Phone" size={14} color="#22C55E" />
        </View>
        <Text style={styles.duration}>{callDuration}</Text>
      </View>
      <TouchableOpacity
        onPress={endCall}
        style={styles.endBtn}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="End call"
      >
        <Icon name="PhoneOff" size={14} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 80,
    left: 16,
    right: 16,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#1D1F21",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    zIndex: 100,
  },
  info: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(34,197,94,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  duration: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  endBtn: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default CallMiniPlayer;
