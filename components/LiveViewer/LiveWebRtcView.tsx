/**
 * The picture for a stream being played over WebRTC.
 *
 * Split out so the WebRTC import stays behind one small component: RTCView
 * comes from react-native-webrtc, which the viewer half of the app otherwise
 * never touches.
 *
 * Deliberately plain — no controls, no overlays. Everything a viewer taps on a
 * live stream is drawn by LiveStreamPlayer on top of whatever is rendering the
 * picture, so this has to be exactly what VideoArea is underneath: a surface
 * that fills its parent and nothing else.
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import { RTCView, type MediaStream } from "react-native-webrtc";

interface Props {
  stream: MediaStream;
  /** `cover` fills the frame and crops; the feed and the viewer both want it. */
  objectFit?: "cover" | "contain";
}

const LiveWebRtcView: React.FC<Props> = ({ stream, objectFit = "contain" }) => (
  <View style={[StyleSheet.absoluteFill, styles.backdrop]}>
    <RTCView
      streamURL={stream.toURL()}
      style={StyleSheet.absoluteFill}
      objectFit={objectFit}
      /* On Android an RTCView is a SurfaceView, and two of them at zOrder 0
         resolve by luck. The feed's own preview of the same stream can still
         hold its surface underneath this screen — pages stay mounted — and
         when it did, the post page drew black over a card that kept playing.
         The viewer's picture sits above anything the feed left behind. */
      zOrder={1}
    />
  </View>
);

const styles = StyleSheet.create({
  // Letterboxing is drawn by us, not left to whatever sits behind the surface.
  backdrop: { backgroundColor: "#000" },
});

export default LiveWebRtcView;
