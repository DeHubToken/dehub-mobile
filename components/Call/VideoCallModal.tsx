import React from "react";
import { View, Text, StyleSheet, Modal, StatusBar } from "react-native";
import { RtcSurfaceView, VideoSourceType, RenderModeType } from "react-native-agora";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { colors } from "../../theme/colors";
import { radius } from "../../theme/radius";
import { useCall } from "../../context/CallContext";
import { CallIdentity, CallControl, CallControlPanel } from "./CallChrome";
import { usePeerIdentity } from "./usePeerIdentity";

const VideoCallModal: React.FC = () => {
  const {
    isCallActive,
    currentCall,
    isConnecting,
    isMuted,
    isSpeakerOn,
    isCameraOff,
    callDuration,
    remoteUid,
    peerAddress,
    isMinimized,
    setMinimized,
    endCall,
    toggleMute,
    toggleSpeaker,
    toggleCamera,
    switchCamera,
  } = useCall();

  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const peer = usePeerIdentity(peerAddress);

  const isVideoCall = currentCall?.call_type === "video";
  const isVisible = (isCallActive || isConnecting) && isVideoCall && !!currentCall;

  if (!isVisible || isMinimized) return null;

  const statusText = isConnecting
    ? t("calls.connecting")
    : callDuration !== "00:00"
      ? callDuration
      : t("calls.connected");

  return (
    <Modal
      visible
      onRequestClose={() => setMinimized(true)}
      statusBarTranslucent
      animationType="fade"
      transparent={false}
    >
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        {/* Remote video (full-screen) */}
        {remoteUid ? (
          <RtcSurfaceView
            style={StyleSheet.absoluteFill}
            canvas={{
              uid: remoteUid,
              sourceType: VideoSourceType.VideoSourceRemote,
              renderMode: RenderModeType.RenderModeFit,
            }}
          />
        ) : (
          // Nobody on the far side yet, so this is the ringing screen: show who
          // is being called rather than an anonymous camera glyph.
          <View style={[styles.waiting, { paddingTop: insets.top + 56 }]}>
            <LinearGradient
              colors={["#26282B", "#0C0E10", colors.background]}
              locations={[0, 0.45, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <CallIdentity
              kindIcon="Video"
              kindLabel={t("calls.videoCall")}
              name={peer.name}
              status={statusText}
              avatarUri={peer.avatarUrl}
            />
          </View>
        )}

        {/* Local video (PiP) — always mounted so startPreview can attach before state update */}
        <View
          style={[
            styles.localVideo,
            { top: Math.max(60, insets.top + 80), opacity: isCameraOff ? 0 : 1 },
          ]}
          pointerEvents={isCameraOff ? "none" : "box-none"}
        >
          <RtcSurfaceView
            style={StyleSheet.absoluteFill}
            zOrderMediaOverlay={true}
            canvas={{
              uid: 0,
              sourceType: VideoSourceType.VideoSourceCamera,
              renderMode: RenderModeType.RenderModeHidden,
            }}
          />
        </View>

        {/* Name + duration ride over the remote video once it is up */}
        {!!remoteUid && (
          <View style={[styles.topBar, { paddingTop: insets.top > 0 ? insets.top + 10 : 18 }]}>
            <LinearGradient
              colors={["rgba(1,3,5,0.85)", "rgba(1,3,5,0)"]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <Text style={styles.name} numberOfLines={1}>
              {peer.name}
            </Text>
            <Text style={styles.status}>{statusText}</Text>
          </View>
        )}

        {isCameraOff && (
          <View style={[styles.cameraOffPill, { top: Math.max(60, insets.top + 80) }]}>
            <Icon name="VideoOff" size={13} color={colors.mutedForeground} />
            <Text style={styles.cameraOffText}>{t("calls.cameraOff")}</Text>
          </View>
        )}

        <View style={styles.controlsDock}>
          <CallControlPanel>
            <CallControl
              icon={isSpeakerOn ? "Volume2" : "Volume1"}
              label={t("calls.speaker")}
              onPress={toggleSpeaker}
              active={isSpeakerOn}
              small
            />
            <CallControl
              icon={isMuted ? "MicOff" : "Mic"}
              label={isMuted ? t("calls.unmute") : t("calls.mute")}
              onPress={toggleMute}
              active={isMuted}
              small
            />
            <CallControl
              icon={isCameraOff ? "VideoOff" : "Video"}
              label={t("calls.camera")}
              onPress={toggleCamera}
              active={isCameraOff}
              small
            />
            <CallControl
              icon="RefreshCw"
              label={t("calls.flip")}
              onPress={switchCamera}
              small
            />
            <CallControl
              icon="PhoneOff"
              label={t("calls.end")}
              onPress={endCall}
              primary
              small
            />
          </CallControlPanel>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  waiting: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  localVideo: {
    position: "absolute",
    top: 60,
    left: 16,
    width: 104,
    height: 156,
    borderRadius: radius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: colors.neutrals[800],
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingBottom: 26,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  name: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: "600",
  },
  status: {
    color: colors.mutedForeground,
    fontSize: 13,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  cameraOffPill: {
    position: "absolute",
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  cameraOffText: {
    color: colors.mutedForeground,
    fontSize: 12,
    fontWeight: "500",
  },
  controlsDock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
});

export default VideoCallModal;
