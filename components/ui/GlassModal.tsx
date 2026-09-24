import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  TouchableOpacity,
  View,
  Platform,
  StyleSheet,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  ScrollView,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_HAIRLINE } from "../../theme/minimal";

export interface GlassModalProps {
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  blurIntensity?: number; // 0-100
  blurTint?: "dark" | "light" | "default";
  children: React.ReactNode;
  presentation?: "center" | "bottom";
  maxHeight?: number | string;
  // New: Control backdrop blur area and panel wrapping
  backdropScope?: "full" | "panel";
  panelHeight?: number | string | Animated.Value;
  wrapPanel?: boolean;
  // When false, disable closing via backdrop press and Android back button
  dismissible?: boolean;
  /** For static sheet content. Lists keep their own scroll container. */
  scrollable?: boolean;
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
  onDismiss,
  blurIntensity = 100,
  blurTint = "dark",
  children,
  presentation = "center",
  maxHeight = "88%",
  backdropScope = "panel",
  panelHeight,
  wrapPanel = true,
  dismissible = true,
  scrollable = false,
}) => {
  const insets = useSafeAreaInsets();
  const { isMinimal } = useAppTheme();
  const isBottom = presentation === "bottom";
  const translateY = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const revealInput = () => {
    const input = TextInput.State.currentlyFocusedInput();
    if (input) scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard(input, 24, true);
  };
  const startedAtTop = useRef(true);
  const startedInHandle = useRef(false);
  // Window y of the panel's top edge, so a touch can be placed in the handle
  // zone without an overlay view sitting on top of the sheet's own buttons.
  const panelRef = useRef<View>(null);
  const panelTop = useRef<number | null>(null);
  const measurePanel = () => {
    panelRef.current?.measureInWindow((_x, y) => { panelTop.current = y; });
  };
  useEffect(() => {
    translateY.setValue(0);
    scrollY.current = 0;
  }, [visible, translateY]);
  // One responder on the whole panel, capture phase only: taps still reach
  // the sheet's inputs and buttons, and only a clear downward drag is taken —
  // from the top 28dp across the full width, or anywhere in a scrollable
  // sheet that is already scrolled to the top.
  const panelResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: (evt) => {
      startedAtTop.current = scrollY.current <= 1;
      startedInHandle.current = panelTop.current != null &&
        evt.nativeEvent.pageY - panelTop.current <= HANDLE_ZONE;
      return false;
    },
    onMoveShouldSetPanResponderCapture: (_, gesture) => {
      return isBottom && dismissible && gesture.dy > 10 &&
        gesture.dy > Math.abs(gesture.dx) * 1.5 &&
        (startedInHandle.current || (scrollable && startedAtTop.current && scrollY.current <= 1));
    },
    onPanResponderMove: (_, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > 80 || (gesture.dy > 20 && gesture.vy > 0.7)) {
        onClose();
      }
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
    },
  }), [dismissible, isBottom, onClose, scrollable, translateY]);

  // While the keyboard is up, KeyboardAvoidingView already lifts the panel
  // clear of it, and the bottom inset it would otherwise reserve is under the
  // keyboard — keeping it just parks a dead strip between the sheet and the
  // keys.
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    if (!isBottom) return;
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, () => {
      setKeyboardUp(true);
      requestAnimationFrame(revealInput);
    });
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
      onDismiss={onDismiss}
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
        {backdropScope === "full" && isMinimal ? (
          // Minimal has no glass: the full-screen blur becomes a flat, heavier
          // dim so the panel still separates from whatever is behind it.
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {
              if (dismissible) onClose();
            }}
            style={StyleSheet.absoluteFill}
          >
            <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" }} />
          </TouchableOpacity>
        ) : backdropScope === "full" ? (
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
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            // This view starts below the foreground's safe-area padding;
            // keyboard frames are measured from the top of the modal window.
            keyboardVerticalOffset={insets.top}
            style={[
              styles.foregroundWrapper,
              {
                justifyContent: isBottom ? "flex-end" : "center",
                paddingHorizontal: isBottom ? 0 : 16,
              },
            ]}
          >
            {wrapPanel ? (
              <Animated.View
                ref={panelRef}
                onLayout={measurePanel}
                {...(isBottom && dismissible ? panelResponder.panHandlers : null)}
                style={[
                  styles.panel,
                  isBottom ? styles.panelDrawer : styles.panelCard,
                  isMinimal && (isBottom ? styles.minimalPanelDrawer : styles.minimalPanelCard),
                  {
                    maxHeight: maxHeight as any,
                    height: panelHeight as any,
                    paddingBottom: isBottom && !keyboardUp ? insets.bottom : 0,
                    transform: [{ translateY }],
                  },
                ]}
              >
                {scrollable ? (
                  <ScrollView
                    ref={scrollRef}
                    style={{ flexShrink: 1 }}
                    onLayout={() => { if (keyboardUp) requestAnimationFrame(revealInput); }}
                    onContentSizeChange={() => { if (keyboardUp) requestAnimationFrame(revealInput); }}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    bounces={false}
                    scrollEventThrottle={16}
                    onScroll={(event) => { scrollY.current = event.nativeEvent.contentOffset.y; }}
                  >
                    {children}
                  </ScrollView>
                ) : children}
              </Animated.View>
            ) : (
              children
            )}
          </KeyboardAvoidingView>
        </View>
      </View>
    </Modal>
  );
};

const HANDLE_ZONE = 28;

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
  // Minimal: pure black panel, one hairline where it meets the page — all
  // four sides on a floating card, the top edge only on a drawer.
  minimalPanelCard: {
    backgroundColor: "#000",
    borderColor: MINIMAL_HAIRLINE,
    borderWidth: 1,
    shadowOpacity: 0,
    elevation: 0,
  },
  minimalPanelDrawer: {
    backgroundColor: "#000",
    borderColor: MINIMAL_HAIRLINE,
    borderTopWidth: 1,
    shadowOpacity: 0,
    elevation: 0,
  },
});

export default GlassModal;
