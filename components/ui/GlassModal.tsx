import React, { useEffect, useState } from "react";
import {
  Modal,
  TouchableOpacity,
  View,
  Platform,
  StyleSheet,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
 *
 * `presentation="bottom"` is a drawer, not a floating card: it spans the full
 * width and is welded to the bottom edge of the screen, with only its top
 * corners rounded and only a top hairline. The device's bottom inset is
 * padding *inside* the panel rather than a gap beneath it — as a gap it left a
 * strip of the dimmed feed showing under every sheet in the app, and the panel
 * read as hovering rather than as a drawer.
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
  const insets = useSafeAreaInsets();
  const isBottom = presentation === "bottom";

  // While the keyboard is up, KeyboardAvoidingView already lifts the panel
  // clear of it, and the bottom inset it would otherwise reserve is under the
  // keyboard — keeping it just parks a dead strip between the sheet and the
  // keys.
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    if (!isBottom) return;
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, () => setKeyboardUp(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [isBottom]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Prevent Android back button from closing when not dismissible
      onRequestClose={dismissible ? onClose : () => {}}
      hardwareAccelerated
      // Every other sheet in the app sets this; GlassModal was the one that
      // did not, so on Android its window stopped short of the system bars and
      // the dim never reached them. A bottom sheet then sat above the gesture
      // bar AND paid the inset again as padding, which is the double gap that
      // left a strip of the feed showing under it.
      statusBarTranslucent
    >
      {/* The insets are spent on the foreground, never on this container, so
          the dim (and the blur) reach the status bar and the gesture bar
          instead of stopping short of both. */}
      <View style={styles.container}>
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

        {/* The insets live on this layer, not on the KeyboardAvoidingView:
            `behavior="padding"` composes its own paddingBottom over whatever
            style it is handed, so a bottom inset set there is silently dropped.
            A drawer wants none of it anyway — it owns the bottom edge. */}
        <View
          style={[
            styles.foreground,
            {
              paddingTop: insets.top,
              paddingBottom: isBottom ? 0 : insets.bottom,
            },
          ]}
          pointerEvents="box-none"
        >
          {/* Keyboard handling lives here so every GlassModal sheet gets it:
              Android is edge-to-edge (SDK 54), where the window no longer
              resizes for the keyboard, so inputs in bottom sheets were
              covered. */}
          <KeyboardAvoidingView
            behavior="padding"
            style={[
              styles.foregroundWrapper,
              {
                justifyContent: isBottom ? "flex-end" : "center",
                paddingHorizontal: isBottom ? 0 : 16,
              },
            ]}
          >
            {wrapPanel ? (
              <View
                style={[
                  styles.panel,
                  isBottom ? styles.panelDrawer : styles.panelCard,
                  {
                    maxHeight: maxHeight as any,
                    paddingBottom: isBottom && !keyboardUp ? insets.bottom : 0,
                  },
                ]}
              >
                {children}
              </View>
            ) : (
              children
            )}
          </KeyboardAvoidingView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  foreground: {
    flex: 1,
  },
  foregroundWrapper: {
    flex: 1,
    alignItems: "center",
  },
  panel: {
    width: "100%",
    overflow: "hidden",
    // Opaque: these panels sit over chat/video, and the old 68% fill let
    // content bleed through behind text.
    backgroundColor: "#0C0C0E",
    borderColor: "rgba(255,255,255,0.14)",
  },
  panelCard: {
    borderRadius: 16,
    borderWidth: 1,
  },
  // Welded to the bottom and both sides: the only edge that can show a border
  // is the top one, and the only corners that can be round are the top two.
  panelDrawer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
  },
});

export default GlassModal;
