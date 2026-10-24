import React from "react";
import { Modal } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ImageViewer } from "../../screens/ImageViewerScreen";

/**
 * The fullscreen image viewer as an overlay, for surfaces that sit above the
 * navigator (a profile on Android), where navigating to ImageViewer opens it
 * underneath them.
 */
export default function ImageViewerModal({ images, onClose }: {
  /** Nothing to show closes it. */
  images: string[] | null;
  onClose: () => void;
}) {
  if (!images?.length) return null;
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ImageViewer params={{ images, initialIndex: 0 }} onClose={onClose} />
      </GestureHandlerRootView>
    </Modal>
  );
}
