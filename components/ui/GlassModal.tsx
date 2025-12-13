import React from "react";
import {
  Modal,
  TouchableOpacity,
  View,
  Platform,
  StyleSheet,
  UIManager,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";

export interface GlassModalProps {
  visible: boolean;
  onClose: () => void;
  blurIntensity?: number; // 0-100
  blurTint?: "dark" | "light" | "default";
  children: React.ReactNode;
  presentation?: "center" | "bottom";
  maxHeight?: number | string;
  // New: Control backdrop blur area and panel wrapping
  backdropScope?: "full" | "panel";
  panelHeight?: number | Animated.Value;
  wrapPanel?: boolean;
  // When false, disable closing via backdrop press and Android back button
  dismissible?: boolean;
}

/**
 * A reusable modal with a blurred backdrop.
 * - Uses expo-blur directly (no dynamic require or UIManager checks).
 * - Falls back to a semi-transparent black background if blur fails.
 */
const GlassModal: React.FC<GlassModalProps> = ({
  visible,
  onClose,
  blurIntensity = 100,
  blurTint = "dark",
  children,
  presentation = "center",
  maxHeight = "88%",
  backdropScope = "panel",
  panelHeight,
  wrapPanel = true,
  dismissible = true,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Prevent Android back button from closing when not dismissible
      onRequestClose={dismissible ? onClose : () => {}}
      statusBarTranslucent
      hardwareAccelerated
    >
      <View style={styles.container}>
        {/* Backdrop */}
        {/* Default: non-blurred dim backdrop; no full-screen blur */}
        {backdropScope === "full" ? (
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {
              if (dismissible) onClose();
            }}
            style={StyleSheet.absoluteFill}
          >
            <BlurView
              intensity={blurIntensity}
              tint={blurTint}
              style={StyleSheet.absoluteFill}
              {...(Platform.OS === "android" ? { experimentalBlurMethod: "dimezisBlurView" } : {})}
            />
            <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.25)" }} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {
              if (dismissible) onClose();
            }}
            style={StyleSheet.absoluteFill}
          >
            <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" }} />
          </TouchableOpacity>
        )}

        {/* Foreground panel */}
        <SafeAreaView
          style={[
            styles.foregroundWrapper,
            {
              justifyContent: presentation === "bottom" ? "flex-end" : "center",
            },
          ]}
          edges={presentation === "bottom" ? ['bottom'] : ['top', 'bottom']}
        >
          {wrapPanel ? (
            <View
              style={[
                styles.panel,
                {
                  maxHeight: maxHeight as any,
                  borderRadius: presentation === "bottom" ? 20 : 16,
                },
              ]}
            >
              {/* Panel-only blur background */}
              <BlurView
                intensity={blurIntensity}
                tint={blurTint}
                style={StyleSheet.absoluteFill}
                {...(Platform.OS === "android" ? { experimentalBlurMethod: "dimezisBlurView" } : {})}
              />
              <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.25)" }} />
              {children}
            </View>
          ) : (
            children
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  foregroundWrapper: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  panel: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: "rgba(20,20,20,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
});

export default GlassModal;
