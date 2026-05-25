import React from "react";
import { TouchableOpacity, View, StyleSheet } from "react-native";
import Icon from "../ui/Icon";
import { useCall } from "../../context/CallContext";

interface CallButtonProps {
  recipientAddress: string;
}

const CallButton: React.FC<CallButtonProps> = ({ recipientAddress }) => {
  const { startCall, isCallActive, isConnecting } = useCall();
  const disabled = isCallActive || isConnecting;

  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={() => startCall(recipientAddress, "audio")}
        disabled={disabled}
        style={[styles.btn, disabled && styles.disabled]}
        activeOpacity={0.6}
      >
        <Icon name="Phone" size={18} color={disabled ? "#71717A" : "#FFFFFF"} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => startCall(recipientAddress, "video")}
        disabled={disabled}
        style={[styles.btn, disabled && styles.disabled]}
        activeOpacity={0.6}
      >
        <Icon name="Video" size={18} color={disabled ? "#71717A" : "#FFFFFF"} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  disabled: {
    opacity: 0.4,
  },
});

export default CallButton;
