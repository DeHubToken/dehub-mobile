import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Pattern, Rect } from "react-native-svg";
import { useAppTheme } from "../../context/ThemeContext";

/**
 * The soft dot pattern behind a chat thread, the same 22px grid web's /chat
 * draws, so bubbles read as objects on a surface. Ink dots on System Light,
 * white dots everywhere else; faint enough to sit under any theme's canvas.
 */
function ChatWallpaper() {
  const { isLight } = useAppTheme();
  const dot = isLight ? "rgba(0,0,0,0.09)" : "rgba(255,255,255,0.08)";
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="chatDots" x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse">
            <Circle cx="11" cy="11" r="1.1" fill={dot} />
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#chatDots)" />
      </Svg>
    </View>
  );
}

export default memo(ChatWallpaper);
