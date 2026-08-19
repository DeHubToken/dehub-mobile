import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { RtcSurfaceView, RenderModeType, VideoSourceType } from "react-native-agora";
import Icon from "../ui/Icon";
import { useStages } from "../../context/StageContext";

/**
 * StageScreenShare — the screen a web host is sharing, on the phone's wall
 * =======================================================================
 * Stages are an audio room, so a shared screen is the one visual element in
 * one. This app watches; it never publishes (see `joinStageChannel` for why),
 * so the surface is always a remote uid handed over by
 * `onRemoteVideoStateChanged`.
 *
 * `RenderModeFit`, not the SDK's default `RenderModeHidden`: hidden crops the
 * frame to fill the box, which on a portrait phone showing a 16:9 desktop
 * means seeing the middle third of someone's screen. Fit letterboxes instead,
 * against a black background the bars cannot be told apart from.
 *
 * Sized 16:9 off the parent's width rather than a fixed height so it behaves
 * on everything from an SE to a tablet, and capped so a landscape phone does
 * not hand the whole modal over to it.
 */

interface StageScreenShareProps {
  /** Who is sharing, for the corner label. */
  sharerName?: string | null;
  /** Hard ceiling on height — the live modal is a sheet, not a page. */
  maxHeight?: number;
}

const StageScreenShare: React.FC<StageScreenShareProps> = ({ sharerName, maxHeight }) => {
  const { screenShareUid } = useStages();

  if (screenShareUid == null) return null;

  return (
    <View style={[styles.container, maxHeight ? { maxHeight } : null]}>
      <RtcSurfaceView
        style={StyleSheet.absoluteFill}
        canvas={{
          uid: screenShareUid,
          sourceType: VideoSourceType.VideoSourceRemote,
          renderMode: RenderModeType.RenderModeFit,
        }}
      />
      <View style={styles.label} pointerEvents="none">
        <Icon name="MonitorUp" size={12} color="rgba(255,255,255,0.7)" />
        <Text style={styles.labelText} numberOfLines={1}>
          {sharerName ? `@${sharerName} is sharing` : "Screen share"}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    marginBottom: 16,
  },
  label: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  labelText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 11,
    fontWeight: "500",
    maxWidth: 200,
  },
});

export default StageScreenShare;
