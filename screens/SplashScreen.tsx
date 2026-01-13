import React from "react";
import { View, StyleSheet } from "react-native";
import { Fit, RiveView, useRiveFile, useRive } from "@rive-app/react-native";

export default function SplashScreen() {
  const { riveFile } = useRiveFile(
    require("../assets/riv/dehub_-_loading_screen.riv")
  );
  const { riveViewRef, setHybridRef } = useRive();

  return (
    <View style={styles.container}>
      {riveFile && (
        <RiveView
          hybridRef={setHybridRef}
          file={riveFile}
          autoPlay={true}
          stateMachineName="MainSM"
          style={styles.rive}
          fit={Fit.Contain}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  rive: {
    width: "100%",
    height: "100%",
  },
});
