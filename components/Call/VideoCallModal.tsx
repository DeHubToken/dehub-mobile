import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Modal, StatusBar } from "react-native";
import { TouchableOpacity } from "react-native";
import { RtcSurfaceView, VideoSourceType, RenderModeType } from "react-native-agora";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../ui/Icon";
import { useCall } from "../../context/CallContext";

const VideoCallModal: React.FC = () => {
  const {
    isCallActive,
    currentCall,
    isConnecting,
    isMuted,
    isCameraOff,
    callDuration,
    remoteUid,
    endCall,
    toggleMute,
    toggleCamera,
    switchCamera,
  } = useCall();

  const insets = useSafeAreaInsets();
  const [peerName, setPeerName] = useState<string | null>(null);

  const isVideoCall = currentCall?.call_type === "video";
  const isVisible = (isCallActive || isConnecting) && isVideoCall && !!currentCall;

  const peerAddress = currentCall ? currentCall.caller_address : "";

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
    <Modal
      visible={true}
      onRequestClose={endCall}
      statusBarTranslucent
      animationType="fade"
      transparent={false}
    >
      <StatusBar hidden />
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
          <View style={styles.remotePlaceholder}>
            <Icon name="Video" size={48} color="rgba(255,255,255,0.3)" />
            <Text style={styles.waitingText}>{statusText}</Text>
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

        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: insets.top > 0 ? insets.top + 8 : 16 }]}>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.status}>{statusText}</Text>
        </View>

        {/* Bottom controls */}
        <View style={[styles.controls, { paddingBottom: Math.max(24, insets.bottom + 12) }]}>
          <TouchableOpacity
            onPress={toggleMute}
            style={[styles.ctrlBtn, isMuted && styles.ctrlActive]}
            accessibilityRole="button"
            accessibilityLabel={isMuted ? "Unmute microphone" : "Mute microphone"}
            accessibilityState={{ selected: isMuted }}
          >
            <Icon name={isMuted ? "MicOff" : "Mic"} size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={toggleCamera}
            style={[styles.ctrlBtn, isCameraOff && styles.ctrlInactive]}
            accessibilityRole="button"
            accessibilityLabel={isCameraOff ? "Turn camera on" : "Turn camera off"}
            accessibilityState={{ selected: isCameraOff }}
          >
            <Icon name={isCameraOff ? "VideoOff" : "Video"} size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={switchCamera}
            style={styles.ctrlBtn}
            accessibilityRole="button"
            accessibilityLabel="Switch camera"
          >
            <Icon name="RefreshCw" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={endCall}
            style={styles.endBtn}
            accessibilityRole="button"
            accessibilityLabel="End call"
          >
            <Icon name="PhoneOff" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  remotePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
    gap: 12,
  },
  waitingText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 15,
  },
  localVideo: {
    position: "absolute",
    top: 60,
    right: 16,
    width: 100,
    height: 150,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    backgroundColor: "#1D1F21",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 48,
    paddingBottom: 12,
    paddingHorizontal: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
  },
  name: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  status: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    marginTop: 2,
  },
  controls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 24,
    paddingHorizontal: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
    gap: 16,
  },
  ctrlBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  ctrlActive: {
    backgroundColor: "rgba(255,255,255,0.28)",
    borderColor: "rgba(255,255,255,0.4)",
  },
  ctrlInactive: {
    backgroundColor: "rgba(255,255,255,0.4)",
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

export default VideoCallModal;
