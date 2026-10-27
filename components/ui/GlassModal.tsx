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
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_HAIRLINE } from "../../theme/minimal";
import { useYieldToWalletUnlock } from "../../hooks/useYieldToWalletUnlock";
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import SwipeBackBoundary from '../common/SwipeBackBoundary';
import SheetGlass from "./SheetGlass";
import SheetBackdrop, { useSheetBackdrop } from "./SheetBackdrop";
import { SHEET_GLASS_BORDER } from "../../theme/sheetGlass";

export interface GlassModalProps {
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  /**
   * @deprecated Ignored. Every drawer's backdrop blur has the same strength
   * (SheetBackdrop), whatever the sheet passes.
   */
  blurIntensity?: number; // 0-100
  /** @deprecated Ignored; the backdrop follows the theme. */
  blurTint?: "dark" | "light" | "default";
  children: React.ReactNode;
  presentation?: "center" | "bottom";
  maxHeight?: number | string;
  /**
   * Whether a centered card blurs the page behind it ("full") or only dims
   * it ("panel", the default). Drawers (`presentation="bottom"`) always blur.
   */
  backdropScope?: "full" | "panel";
  panelHeight?: number | string | Animated.Value;
  wrapPanel?: boolean;
  // When false, disable closing via backdrop press and Android back button
  dismissible?: boolean;
  /** For static sheet content. Lists keep their own scroll container. */
  scrollable?: boolean;
  /**
   * Hide while the wallet unlock prompt is up so it is not opened behind this
   * sheet (see useYieldToWalletUnlock). Off only for the unlock sheet itself.
   */
  yieldToWalletUnlock?: boolean;
  /** Floating panels use the same active-theme material as web. */
  surface?: 'theme' | 'solid';
  /**
   * A scrollable drawer that drags shut from anywhere on it, not just the
   * handle strip: the panel follows the finger once the list is at the top,
   * so a pull that scrolls back up to the top carries on as a close.
   */
  dragFromContent?: boolean;
}

/** A GestureDetector only where a gesture is wired, so other sheets are untouched. */
const MaybeDetector: React.FC<{ gesture: React.ComponentProps<typeof GestureDetector>['gesture'] | null; children: React.ReactElement }> = ({ gesture, children }) =>
  gesture ? <GestureDetector gesture={gesture}>{children}</GestureDetector> : children;

/**
 * A reusable modal with a blurred backdrop.
 * - Drawers blur the page behind them through SheetBackdrop (see there for
 *   the per-platform rules and the tinted scrim it falls back to). The Modal's
 *   own fade carries the blur in and out with the sheet.
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
  children,
  presentation = "center",
  maxHeight = "88%",
  backdropScope = "panel",
  panelHeight,
  wrapPanel = true,
  dismissible = true,
  scrollable = false,
  yieldToWalletUnlock = true,
  surface = 'theme',
  dragFromContent = false,
}) => {
  const insets = useSafeAreaInsets();
  const yielded = useYieldToWalletUnlock(visible, yieldToWalletUnlock);
  const { isMinimal, isLight, skin } = useAppTheme();
  const isBottom = presentation === "bottom";
  // Drawers in the default dark theme take web's liquid glass; the canvas
  // themes, Minimal and System Light keep their own sheet material.
  const glassDrawer = isBottom && !skin && !isMinimal && !isLight;
  const blurBackdrop = isBottom || backdropScope === "full";
  // The Modal only renders this while it is up, so nothing samples the page
  // once it has faded out.
  const backdrop = useSheetBackdrop(blurBackdrop);
  const MessageSurface = surface === 'theme' ? require("../DM/MessageSurface").default : null;
  const translateY = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const revealInput = () => {
    const input = (TextInput as any).State?.currentlyFocusedInput?.();
    if (input) scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard(input, 24, true);
  };
  const startedAtTop = useRef(true);
  useEffect(() => {
    translateY.setValue(0);
    scrollY.current = 0;
  }, [visible, translateY]);
  const makePanResponder = (fromHandle: boolean) => PanResponder.create({
    onStartShouldSetPanResponderCapture: () => {
      startedAtTop.current = scrollY.current <= 1;
      return false;
    },
    onMoveShouldSetPanResponderCapture: (_, gesture) => {
      return isBottom && dismissible && gesture.dy > 10 &&
        gesture.dy > Math.abs(gesture.dx) * 1.5 &&
        (fromHandle || (scrollable && startedAtTop.current && scrollY.current <= 1));
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
  });
  const handleResponder = useMemo(() => makePanResponder(true),
    [dismissible, isBottom, onClose, scrollable, translateY]);

  // Content drag (dragFromContent). It runs beside the ScrollView's own
  // gesture: while the list is scrolled the list keeps the touch, and from
  // the moment it sits at the top the rest of the pull moves the panel.
  const contentDrag = isBottom && dismissible && scrollable && dragFromContent;
  const pullAnchor = useRef<number | null>(null);
  const pulled = useRef(0);
  const listGesture = useMemo(() => (contentDrag ? Gesture.Native() : null), [contentDrag]);
  const panelGesture = useMemo(() => listGesture && Gesture.Pan()
    .runOnJS(true)
    .activeOffsetY(10)
    .failOffsetX([-20, 20])
    .simultaneousWithExternalGesture(listGesture)
    .onStart(() => {
      pullAnchor.current = null;
      pulled.current = 0;
    })
    .onUpdate((e) => {
      if (pullAnchor.current === null) {
        if (scrollY.current > 1) return;
        pullAnchor.current = e.translationY;
      }
      pulled.current = Math.max(0, e.translationY - pullAnchor.current);
      if (pulled.current === 0 && scrollY.current > 1) pullAnchor.current = null;
      translateY.setValue(pulled.current);
    })
    .onEnd((e) => {
      const d = pulled.current;
      pullAnchor.current = null;
      pulled.current = 0;
      if (d > 80 || (d > 20 && e.velocityY > 700)) onClose();
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
    })
    .onFinalize(() => {
      if (pulled.current > 0) Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      pullAnchor.current = null;
      pulled.current = 0;
    }), [listGesture, onClose, translateY]);

  // While the keyboard is up the panel is lifted clear of it, and the bottom
  // inset it would otherwise reserve is under the keyboard — keeping it just
  // parks a dead strip between the sheet and the keys.
  const [keyboardUp, setKeyboardUp] = useState(false);
  // Android lift, from the keyboard event alone. KeyboardAvoidingView's
  // "height" mode re-measures itself against the event on every layout, and
  // Android hands it the keyboardDidHide event as a *change* whose screenY is
  // the main window's visible height — short of this edge-to-edge window by
  // the status and navigation bars. So after the keyboard closed, every sheet
  // stayed parked that far above the bottom, and on some phones the sheet
  // bounced between the two heights for as long as it was open (a recovery
  // sheet recorded on a Xiaomi did this ten times a second).
  // `endCoordinates.height` is the keyboard above the navigation bar, and the
  // panel here reaches the physical bottom, so the lift is that plus the bar.
  const [androidLift, setAndroidLift] = useState(0);
  const bottomInset = insets.bottom;
  useEffect(() => {
    if (!isBottom && !scrollable && Platform.OS === "ios") return;
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (event) => {
      setKeyboardUp(true);
      if (Platform.OS === "android") {
        setAndroidLift(Math.max(0, (event?.endCoordinates?.height ?? 0) + bottomInset));
      }
      requestAnimationFrame(revealInput);
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      setKeyboardUp(false);
      setAndroidLift(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [isBottom, scrollable, bottomInset]);

  // Android: a field on the screen underneath can still hold the keyboard when
  // this sheet opens over it (the email-code field behind the account
  // recovery sheet did). This window takes input focus from it, so it cannot
  // be typed into any more, but the two windows then trade the keyboard back
  // and forth. Captured while rendering — before this sheet's own fields mount
  // and autofocus — and let go once the sheet is up, so a field inside the
  // sheet is never the one blurred.
  const shown = visible && !yielded;
  const wasShown = useRef(false);
  const inputBehind = useRef<unknown>(null);
  const inputState = (TextInput as any).State;
  if (shown && !wasShown.current && Platform.OS === "android") {
    inputBehind.current = inputState?.currentlyFocusedInput?.() ?? null;
  }
  wasShown.current = shown;
  useEffect(() => {
    if (!shown || Platform.OS !== "android") return;
    const behind = inputBehind.current;
    inputBehind.current = null;
    if (behind && inputState?.currentlyFocusedInput?.() === behind) {
      inputState.blurTextInput(behind);
    }
  }, [shown, inputState]);

  return (
    <Modal
      visible={shown}
      transparent
      animationType="fade"
      // Prevent Android back button from closing when not dismissible
      onRequestClose={dismissible ? onClose : () => {}}
      // Stepping aside for the unlock prompt is not the sheet closing.
      onDismiss={yielded ? undefined : onDismiss}
      hardwareAccelerated
      // Every other sheet in the app sets this; GlassModal was the one that
      // did not, so on Android its window stopped short of the system bars and
      // the dim never reached them. A bottom sheet then sat above the gesture
      // bar AND paid the inset again as padding, which is the double gap that
      // left a strip of the feed showing under it.
      statusBarTranslucent
      navigationBarTranslucent
    >
      {/* The insets are spent on the foreground, never on this container, so
          the dim (and the blur) reach the status bar and the gesture bar
          instead of stopping short of both. */}
      <GestureHandlerRootView style={styles.container}>
      <SwipeBackBoundary onBack={dismissible ? onClose : undefined} enabled={visible && !yielded && dismissible}>
      <View style={styles.container}>
        {/* Drawers (and "full" cards) blur the page behind them; a centered
            card keeps the plain dim it always had. A tap anywhere on it still
            dismisses. */}
        {blurBackdrop ? (
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => { if (dismissible) onClose(); }}
            style={StyleSheet.absoluteFill}
          >
            <SheetBackdrop backdrop={backdrop} />
          </TouchableOpacity>
        ) : Platform.OS === "android" ? (
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => { if (dismissible) onClose(); }}
            style={StyleSheet.absoluteFill}
          />
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
              covered. iOS keeps KeyboardAvoidingView ("padding"); Android
              pads by the measured lift above instead (see androidLift). No
              keyboardVerticalOffset: the modal window starts at the top of
              the screen and this view's layout y already includes the
              foreground's top padding, so an offset counts the status bar
              twice and parks the sheet that far above the keys. */}
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            enabled={Platform.OS === "ios"}
            style={[
              styles.foregroundWrapper,
              {
                justifyContent: isBottom ? "flex-end" : "center",
                paddingHorizontal: isBottom ? 0 : 16,
              },
              // A centered card's foreground already pads the navigation bar.
              Platform.OS === "android" && androidLift > 0
                ? { paddingBottom: isBottom ? androidLift : Math.max(0, androidLift - bottomInset) }
                : null,
            ]}
          >
            {wrapPanel ? (
              <MaybeDetector gesture={panelGesture}>
              <Animated.View
                style={[
                  styles.panel,
                  isBottom ? styles.panelDrawer : styles.panelCard,
                  isMinimal && (isBottom ? styles.minimalPanelDrawer : styles.minimalPanelCard),
                  glassDrawer && styles.glassPanelDrawer,
                  {
                    maxHeight: maxHeight as any,
                    height: panelHeight as any,
                    paddingBottom: isBottom && !keyboardUp ? insets.bottom : 0,
                    transform: [{ translateY }],
                  },
                ]}
              >
                {glassDrawer ? <SheetGlass backdropBlurred={backdrop.blurred} /> : MessageSurface ? <MessageSurface /> : null}
                {scrollable ? (
                  <MaybeDetector gesture={listGesture}>
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
                  </MaybeDetector>
                ) : children}
                {/* With dragFromContent the panel's own pan covers the handle. */}
                {isBottom && dismissible && !contentDrag && (
                  <View
                    {...handleResponder.panHandlers}
                    style={{ position: "absolute", top: 0, left: "35%", right: "35%", height: 28 }}
                  />
                )}
              </Animated.View>
              </MaybeDetector>
            ) : (
              children
            )}
          </KeyboardAvoidingView>
        </View>
      </View>
      </SwipeBackBoundary>
      </GestureHandlerRootView>
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
  glassPanelDrawer: {
    backgroundColor: "transparent",
    borderColor: SHEET_GLASS_BORDER,
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
