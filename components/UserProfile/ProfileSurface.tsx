import React from "react";
import { Modal, Platform, StyleSheet } from "react-native";
import AnimatedModal from "react-native-modal";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Keep Android media in the activity window, where AppState can track focus. */
export default function ProfileSurface({ visible, onClose, children }: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  if (Platform.OS !== "android") {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}
        presentationStyle="fullScreen" statusBarTranslucent>
        {children}
      </Modal>
    );
  }
  return (
    <AnimatedModal isVisible={visible} coverScreen={false} hasBackdrop={false}
      animationIn="slideInUp" animationOut="slideOutDown"
      animationInTiming={300} animationOutTiming={300}
      onBackButtonPress={onClose}
      style={[StyleSheet.absoluteFill, {
        margin: 0,
        top: -insets.top, bottom: -insets.bottom,
        left: -insets.left, right: -insets.right,
      }]}>
      {children}
    </AnimatedModal>
  );
}
