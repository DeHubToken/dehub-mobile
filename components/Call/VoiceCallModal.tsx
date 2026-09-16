import React from "react";
import { View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCall } from "../../context/CallContext";
import { CallScreen, CallIdentity, CallControl, CallControlPanel } from "./CallChrome";
import { usePeerIdentity } from "./usePeerIdentity";

const VoiceCallModal: React.FC = () => {
  const {
    isCallActive,
    currentCall,
    isConnecting,
    isMuted,
    isSpeakerOn,
    callDuration,
    endCall,
    toggleMute,
    toggleSpeaker,
    peerAddress,
  } = useCall();

  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const peer = usePeerIdentity(peerAddress);

  const isAudioCall = currentCall?.call_type === "audio";
  const isVisible = (isCallActive || isConnecting) && isAudioCall && !!currentCall;

  if (!isVisible) return null;

  const statusText = isConnecting
    ? t("calls.connecting")
    : callDuration !== "00:00"
      ? callDuration
      : t("calls.connected");

  return (
    <CallScreen onRequestClose={endCall}>
      <View style={[styles.body, { paddingTop: insets.top + 56 }]}>
        <CallIdentity
          kindIcon="Phone"
          kindLabel={t("calls.voiceCall")}
          name={peer.name}
          status={statusText}
          avatarUri={peer.avatarUrl}
        />
      </View>
      <CallControlPanel>
        <CallControl
          icon={isSpeakerOn ? "Volume2" : "Volume1"}
          label={t("calls.speaker")}
          onPress={toggleSpeaker}
          active={isSpeakerOn}
        />
        <CallControl
          icon={isMuted ? "MicOff" : "Mic"}
          label={isMuted ? t("calls.unmute") : t("calls.mute")}
          onPress={toggleMute}
          active={isMuted}
        />
        <CallControl icon="PhoneOff" label={t("calls.end")} onPress={endCall} primary />
      </CallControlPanel>
    </CallScreen>
  );
};

const styles = StyleSheet.create({
  body: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 24,
  },
});

export default VoiceCallModal;
