import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { useAppTheme } from "../../context/ThemeContext";
import { isThemeBackdropVisible, subscribeThemeBackdrop } from "../../libs/themeBackdrop";
import { createLogger } from "../../libs/logger";

const log = createLogger("ThemeBackdrop");

/**
 * The live background of web's canvas themes, running behind the app.
 *
 * assets/theme-backdrop/index.html is dehubweb's own background code — the
 * Three.js scenes for Cosmic, Hazy Nights, Swarms, War, Osaka and Jungle and
 * the 2D canvases for Lava Lamp and Winter — bundled unchanged by
 * scripts/theme-backdrop/build.js. Running the same code keeps the phone
 * identical to the site and means a background changed on web is one rebuild
 * away here, not a port.
 *
 * It sits under the navigator at the root. The home feed is transparent over
 * it; every other screen paints the theme's page colour on top, so the loop is
 * paused unless home is in front (libs/themeBackdrop) and the app is active.
 *
 * The page loads with https://dehub.io/ as its base, the way the photo editor
 * loads its canvas, so Osaka's rain loop streams from the site as a
 * same-origin video (a WebGL texture needs that) instead of shipping in the
 * app.
 */

const PAGE = require("../../assets/theme-backdrop/index.html");

let pageHtml: Promise<string> | null = null;
function loadPage(): Promise<string> {
  if (!pageHtml) {
    pageHtml = (async () => {
      const asset = Asset.fromModule(PAGE);
      await asset.downloadAsync();
      if (!asset.localUri) throw new Error("backdrop page has no local file");
      return FileSystem.readAsStringAsync(asset.localUri);
    })();
    pageHtml.catch(() => {
      // A failed read must not stick: the next theme switch tries again.
      pageHtml = null;
    });
  }
  return pageHtml;
}

const ThemeBackdrop: React.FC = () => {
  const { skin, theme } = useAppTheme();
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const webRef = useRef<WebView>(null);
  // One object per page: a new `source` identity reloads the WebView.
  const source = useMemo(() => (html ? { html, baseUrl: "https://dehub.io/" } : null), [html]);

  useEffect(() => {
    setFailed(false);
    if (!skin) {
      setHtml(null);
      return;
    }
    let cancelled = false;
    // Let the first screen draw before a WebView and a GL context compete
    // with it for the main thread.
    const timer = setTimeout(() => {
      loadPage()
        .then((page) => {
          if (cancelled) return;
          const named = `<script>window.__BACKDROP_THEME=${JSON.stringify(theme)};</script>`;
          setHtml(page.replace("<head>", `<head>${named}`));
        })
        .catch((e) => log.warn("Theme backdrop unavailable", e));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [skin, theme]);

  // Web's own pause gate: stop drawing whenever nothing can see the frames.
  const sync = useCallback(() => {
    const running = AppState.currentState === "active" && isThemeBackdropVisible();
    webRef.current?.injectJavaScript(
      `window.dehubBackdrop&&window.dehubBackdrop.pause(${running ? "false" : "true"});true;`,
    );
  }, []);

  useEffect(() => {
    const appState = AppState.addEventListener("change", sync);
    const unsubscribe = subscribeThemeBackdrop(sync);
    return () => {
      appState.remove();
      unsubscribe();
    };
  }, [sync]);

  // The renderer can be killed under memory pressure; without a handler that
  // takes the app down with it on Android. Drop the backdrop instead — the
  // page colour underneath still reads as the theme.
  const onGone = useCallback(() => {
    log.warn("Theme backdrop renderer went away");
    setFailed(true);
  }, []);

  if (!skin) return null;

  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: skin.page }]}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {source && !failed ? (
        <WebView
          key={theme}
          ref={webRef}
          source={source}
          originWhitelist={["*"]}
          javaScriptEnabled
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          setSupportMultipleWindows={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          androidLayerType="hardware"
          onLoadEnd={sync}
          onRenderProcessGone={onGone}
          onContentProcessDidTerminate={onGone}
          style={[styles.web, { backgroundColor: skin.page }]}
          containerStyle={{ backgroundColor: skin.page }}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  web: { flex: 1 },
});

export default memo(ThemeBackdrop);
