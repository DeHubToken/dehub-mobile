/**
 * The picture for a stream being played over WebRTC.
 *
 * Split out so the WebRTC import stays behind one small component: RTCView
 * comes from react-native-webrtc, which the viewer half of the app otherwise
 * never touches.
 *
 * LiveStreamPlayer owns the controls. This surface keeps a small loader visible
 * until the native renderer reports a picture size.
 */

import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { RTCView, type MediaStream } from "react-native-webrtc";
import { useKeepAwake } from "expo-keep-awake";
import { DeHubLoader } from "../DeHubLoader";

interface Props {
  stream: MediaStream;
  /** `cover` fills the frame and crops; the feed and the viewer both want it. */
  objectFit?: "cover" | "contain";
}

const LiveWebRtcView: React.FC<Props> = ({ stream, objectFit = "contain" }) => {
  const [renderedStream, setRenderedStream] = useState<MediaStream | null>(null);
  // Unlike the HLS player, RTCView does not hold the screen on by itself.
  useKeepAwake("live-webrtc-view");
  return (
  <View style={[StyleSheet.absoluteFill, styles.backdrop]}>
    <RTCView
      streamURL={stream.toURL()}
      style={StyleSheet.absoluteFill}
      objectFit={objectFit}
      onDimensionsChange={({ nativeEvent: { width, height } }) => {
        if (width > 0 && height > 0) setRenderedStream(stream);
      }}
      /* On Android an RTCView is a SurfaceView, and two of them at zOrder 0
         resolve by luck. The feed's own preview of the same stream can still
         hold its surface underneath this screen — pages stay mounted — and
         when it did, the post page drew black over a card that kept playing.
         The viewer's picture sits above anything the feed left behind. */
      zOrder={1}
    />
    {renderedStream !== stream && (
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <DeHubLoader size={40} />
      </View>
    )}
  </View>
);
};

const styles = StyleSheet.create({
  // Letterboxing is drawn by us, not left to whatever sits behind the surface.
  backdrop: { backgroundColor: "#000" },
});

export default LiveWebRtcView;
