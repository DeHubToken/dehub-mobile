import React from "react";
import { View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCall } from "../../context/CallContext";
import { CallScreen, CallIdentity, CallControl, CallControlPanel } from "./CallChrome";
import { usePeerIdentity } from "./usePeerIdentity";

const IncomingCallModal: React.FC = () => {
  const { isIncoming, currentCall, acceptCall, rejectCall, peerAddress } = useCall();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const peer = usePeerIdentity(peerAddress);

  // Back must not decline the call; Accept and Decline are the only exits.
  const ignoreBack = () => {};

  if (!isIncoming) return null;

  const isVideo = currentCall?.call_type === "video";

  return (
    <CallScreen onRequestClose={ignoreBack}>
      <View style={[styles.body, { paddingTop: insets.top + 56 }]}>
        <CallIdentity
          kindIcon={isVideo ? "Video" : "Phone"}
          kindLabel={isVideo ? t("calls.videoCall") : t("calls.voiceCall")}
          name={peer.name}
          status={t("calls.incoming")}
          avatarUri={peer.avatarUrl}
        />
      </View>
      <CallControlPanel>
        <CallControl icon="PhoneOff" label={t("calls.decline")} onPress={rejectCall} />
        <CallControl icon="Phone" label={t("calls.accept")} onPress={acceptCall} primary />
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

export default IncomingCallModal;
