import React, { useCallback, useImperativeHandle, forwardRef, useEffect, useRef } from "react";
import { View, StyleSheet } from "react-native";
import { Fit, RiveView, useRiveFile, useRive } from "@rive-app/react-native";

export interface SwipeButtonRef {
  setProgress: (progress: number) => void;
  triggerComplete: () => void;
  reset: () => void;
}

interface SwipeButtonProps {
  onComplete?: () => void;
}

const SwipeButton = forwardRef<SwipeButtonRef, SwipeButtonProps>(
  ({ onComplete }, ref) => {
    const { riveFile } = useRiveFile(
      require("../../assets/riv/swipe_button.riv")
    );
    const { riveViewRef, setHybridRef } = useRive();
    const isInitialized = useRef(false);

    // Reset to idle state after view is ready
    useEffect(() => {
      if (riveViewRef && !isInitialized.current) {
        isInitialized.current = true;
        // Small delay to ensure the view is fully ready
        const timer = setTimeout(() => {
          // Reset to idle state (SwipeProgress=0, SwipeReleased=false)
          riveViewRef.setNumberInputValue("SwipeProgress", 0);
          riveViewRef.setBooleanInputValue("SwipeReleased", false);
        }, 50);
        return () => clearTimeout(timer);
      }
    }, [riveViewRef]);

    const setProgress = useCallback(
      (progress: number) => {
        if (!riveViewRef) return;
        // SwipeProgress expects 0-100
        riveViewRef.setNumberInputValue(
          "SwipeProgress",
          Math.min(100, Math.max(0, progress * 100))
        );
        // Ensure animation is playing when progress changes
        riveViewRef.playIfNeeded();
      },
      [riveViewRef]
    );

    const triggerComplete = useCallback(() => {
      if (riveViewRef) {
        riveViewRef.setBooleanInputValue("SwipeReleased", true);
        riveViewRef.playIfNeeded();
      }
      // Delay navigation to let outro animation play
      setTimeout(() => {
        onComplete?.();
      }, 500);
    }, [riveViewRef, onComplete]);

    const reset = useCallback(() => {
      if (!riveViewRef) return;
      riveViewRef.setNumberInputValue("SwipeProgress", 0);
      riveViewRef.setBooleanInputValue("SwipeReleased", false);
      riveViewRef.playIfNeeded();
    }, [riveViewRef]);

    useImperativeHandle(ref, () => ({
      setProgress,
      triggerComplete,
      reset,
    }));

    if (!riveFile) {
      return <View style={styles.swipeButton} />;
    }

    return (
      <View style={styles.swipeButton}>
        <RiveView
          hybridRef={setHybridRef}
          file={riveFile}
          autoPlay={true}
          stateMachineName="State Machine 1"
          style={styles.rive}
          fit={Fit.Contain}
        />
      </View>
    );
  }
);

SwipeButton.displayName = "SwipeButton";

const styles = StyleSheet.create({
  swipeButton: {
    width: 270,
    height: 98,
    alignItems: "center",
    justifyContent: "center",
  },
  rive: {
    width: "100%",
    height: "100%",
    backgroundColor: "transparent",
  },
});

export default SwipeButton;

