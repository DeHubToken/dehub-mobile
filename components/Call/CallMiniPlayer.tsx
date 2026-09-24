import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { TouchableOpacity } from "react-native";
import Icon from "../ui/Icon";
import { radius } from "../../theme/radius";
import { useCall } from "../../context/CallContext";
import { useTranslation } from "react-i18next";

const CallMiniPlayer: React.FC = () => {
  const { isCallActive, isConnecting, callDuration, endCall, setMinimized } = useCall();
  const { t } = useTranslation();

  if (!isCallActive && !isConnecting) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.info}
        onPress={() => setMinimized(false)}
        accessibilityRole="button"
        accessibilityLabel={t("calls.expand")}
      >
        <View style={styles.iconWrap}>
          <Icon name="Phone" size={14} color="#F4F4F5" />
        </View>
        <Text style={styles.duration}>{callDuration}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={endCall}
        style={styles.endBtn}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t("calls.end")}
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
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: "rgba(255,255,255,0.15)",
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
    borderRadius: radius.full,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default CallMiniPlayer;
