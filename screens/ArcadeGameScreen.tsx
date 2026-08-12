/**
 * ArcadeGameScreen
 * ================
 * One game, the whole screen, nothing else. The native counterpart of the web
 * ArcadeGamePage (/arcade/:slug).
 *
 * Everything game-specific — the URL, the boot shape, the copy — comes from
 * `config/arcade-games`. This screen knows how to host a game and nothing
 * about any particular one.
 *
 * WHY THIS DRAWS ITS OWN EXIT
 * ---------------------------
 * The web arcade does not: it relies on the browser's Back plus a "Leave Game"
 * control that the vendored build adds to its own settings menu. That control
 * is created only when `window.parent !== window` — it exists to solve a
 * problem this screen does not have, namely that a click cannot be aimed at
 * host chrome layered over an iframe holding a pointer lock. A WebView loads
 * the game as a TOP-LEVEL document, so `window.parent === window` and the
 * button is never built. The web's `postMessage` exit bridge is therefore inert
 * here by construction, and there is deliberately no listener for it.
 *
 * That leaves the way out to this screen, and it cannot be a swipe: the board
 * is driven by drag-to-orbit, so a horizontal drag belongs to the game and the
 * stack's edge-swipe cannot be relied on. Hence a real, always-visible control
 * rather than one that fades out — on iOS it would otherwise be the only exit,
 * and a hidden only-exit is a trap.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, StatusBar } from "react-native";
import { WebView } from "react-native-webview";
import type { WebViewNavigation } from "react-native-webview";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as ScreenOrientation from "expo-screen-orientation";
import Icon from "../components/ui/Icon";
import { ScreenNames } from "../navigation/ScreenNames";
import { getArcadeGame } from "../config/arcade-games";
import { openInApp } from "../libs/links.utils";
import { WEBSITE_LINK } from "../config/links";
import { colors } from "../theme/colors";

/** Nothing below this is reported: an opening 0% reads as "did not start". */
const FLOOR = 2;
/** The curve's ceiling. Only the load event gets past it. */
const CEILING = 99;
/** Refresh interval. Fast enough to look live, cheap enough to ignore. */
const STEP_MS = 120;
/** How long 100% stays up once ready, so the fill visibly lands. */
const SETTLE_MS = 320;
/**
 * Hard ceiling on the boot readout, in ms.
 *
 * `onLoadEnd` is the signal that retires the panel. If a request stalls behind
 * a captive portal or a dead connection that event may never arrive, and a
 * progress bar with no way to end is worse than no bar. Well past the slowest
 * boot measured.
 */
const BOOT_CAP_MS = 120000;

/**
 * A percentage readout for the game's boot.
 *
 * The number is MODELLED, not measured: an exponential approach that is fastest
 * at the start, always moving, and clamped below 100 so it can never claim to
 * be finished over a game that has not started. `bootTauMs` is the curve's time
 * constant — progress passes 63% at tau, 86% at 2x.
 *
 * King's Gambit has a real loading screen of its own that counts figures as
 * they land, which is better than anything modelled from out here. So this only
 * has to cover the gap before the WebView's first paint, and it is retired at
 * `onLoadEnd` rather than left to run behind a game already showing its own
 * progress. Kept deliberately short (tau 6s in the registry) for that reason.
 */
function useBootProgress(ready: boolean, tauMs: number) {
  const [pct, setPct] = useState(FLOOR);
  const [showBoot, setShowBoot] = useState(true);
  // One start stamp for the life of the overlay. Deriving it from state would
  // restart the curve on every re-render.
  const startedRef = useRef(0);
  if (startedRef.current === 0) startedRef.current = Date.now();

  useEffect(() => {
    if (ready) return;
    const id = setInterval(() => {
      const t = Date.now() - startedRef.current;
      const eased = 1 - Math.exp(-t / tauMs);
      const next = Math.min(CEILING, Math.max(FLOOR, Math.round(eased * 100)));
      // Guarded rather than assigned: a backgrounded app must never walk the
      // number backwards when it wakes.
      setPct((prev) => (next > prev ? next : prev));
    }, STEP_MS);
    return () => clearInterval(id);
  }, [ready, tauMs]);

  useEffect(() => {
    if (!ready) return;
    setPct(100);
    // The fill is mid-transition when this fires, so the panel stays put long
    // enough for it to arrive. Without the hold the readout vanishes at 90-odd
    // percent and the load looks abandoned rather than finished.
    const id = setTimeout(() => setShowBoot(false), SETTLE_MS);
    return () => clearTimeout(id);
  }, [ready]);

  return { pct, showBoot, dismiss: useCallback(() => setShowBoot(false), []) };
}

const NotInTheArcade = ({ slug, onBack }: { slug?: string; onBack: () => void }) => (
  <View style={styles.panel}>
    <Icon name="Gamepad2" size={30} color="#52525B" />
    <Text style={styles.panelBody}>
      There is no game called <Text style={styles.panelSlug}>{slug}</Text> in the arcade.
    </Text>
    <Pressable onPress={onBack} style={styles.panelButton}>
      <Text style={styles.panelButtonLabel}>See what is here</Text>
    </Pressable>
  </View>
);

const ArcadeGameScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const slug: string | undefined = route.params?.slug;
  const game = getArcadeGame(slug);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const { pct, showBoot, dismiss } = useBootProgress(ready || failed, game?.bootTauMs ?? 8000);

  // A deep link opens the player with nothing beneath it, so "back" has to mean
  // the grid rather than an empty stack the app cannot pop.
  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.replace(ScreenNames.Arcade);
  }, [navigation]);

  useEffect(() => {
    if (ready) return;
    const id = setTimeout(() => setReady(true), BOOT_CAP_MS);
    return () => clearTimeout(id);
  }, [ready]);

  useEffect(() => {
    // The app is portrait-locked (app.json), but a 3D board on a phone is worth
    // far more space than a portrait window gives it. Unlock for the duration
    // and put the lock back on the way out, so the rest of the app is
    // unaffected by having visited here.
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  /**
   * Keep the WebView on the game.
   *
   * The engine itself never navigates — it is a single-page canvas — so any
   * top-level load away from dehub.io is either an outbound link in its credits
   * or something unexpected. Either way it belongs in the browser and not in a
   * chrome-less window the user cannot read a URL bar in. Sub-resource requests
   * (the ~44 MB of armies from upstream's bucket) do not pass through here.
   */
  const onShouldStartLoadWithRequest = useCallback((req: WebViewNavigation) => {
    if (req.url.startsWith(`${WEBSITE_LINK}/`) || req.url === WEBSITE_LINK) return true;
    // about:blank and the initial load are allowed through; anything else that
    // is a real http(s) destination goes out to the system browser.
    if (/^https?:\/\//i.test(req.url)) {
      openInApp(req.url);
      return false;
    }
    return true;
  }, []);

  if (!game) {
    return (
      <View style={styles.screen}>
        <StatusBar hidden />
        <NotInTheArcade slug={slug} onBack={goBack} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar hidden />

      {failed ? (
        <View style={styles.panel}>
          <Text style={styles.panelKicker}>COULD NOT REACH THE ARCADE</Text>
          <Text style={styles.panelTitle}>{game.title} did not load</Text>
          <Text style={styles.panelBody}>
            The game is served from dehub.io and is downloaded when you open it, so it needs a
            working connection the first time. Check yours and try again.
          </Text>
          <Pressable onPress={goBack} style={styles.panelButton}>
            <Text style={styles.panelButtonLabel}>Back to the arcade</Text>
          </Pressable>
        </View>
      ) : (
        <WebView
          source={{ uri: game.url }}
          style={styles.web}
          // The game is the only thing on screen and it paints black before it
          // paints anything else; a white default flashes on every open.
          containerStyle={styles.web}
          // Scrolling belongs to the game: the board is orbited by dragging, and
          // a scroll view under it would steal those gestures and rubber-band
          // the canvas around at the edges.
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          // WebGL wants a hardware-backed layer on Android. The default
          // ('none') lets the platform choose, and it has been observed to
          // choose software for a full-screen WebView.
          androidLayerType="hardware"
          // The engine remembers the player's quality override between sessions.
          domStorageEnabled
          javaScriptEnabled
          // The score and the battle cries should start with the game rather
          // than wait for a second tap the player has no reason to make.
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          // Nothing here should ever open a second window.
          setSupportMultipleWindows={false}
          // ~44 MB of armies come down on first play; caching them is the
          // difference between a first open and every open.
          cacheEnabled
          onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
          // The game draws its own loading screen with a real count, so first
          // paint is the right moment to hand over — anything after that would
          // hide a readout better than this one.
          onLoadEnd={() => setReady(true)}
          onError={() => setFailed(true)}
          onHttpError={() => setFailed(true)}
        />
      )}

      {/* The way out. Always visible: an edge-swipe belongs to the board and on
          iOS there is no hardware back, so this is the only exit and must not
          be something the player has to discover.

          Offset by a flat 10 rather than `insets.top + 10`. Every screen in the
          app renders inside the SafeAreaView in App.tsx, so this one's origin is
          already past the notch — adding the device inset again would push the
          control a status bar's height down into the board. */}
      <Pressable
        onPress={goBack}
        accessibilityRole="button"
        accessibilityLabel="Leave the game"
        hitSlop={12}
        style={styles.exit}
      >
        <Icon name="ChevronLeft" size={20} color="#FFFFFF" />
      </Pressable>

      {/* Boot readout. A percentage and a bar, nothing else: the only question
          somebody staring at a black screen has is "is this doing anything". */}
      {!failed && showBoot ? (
        <View style={styles.boot} pointerEvents="box-none">
          <Text style={styles.bootTitle}>{game.title}</Text>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={`Loading ${game.title}`}
            accessibilityValue={{ min: 0, max: 100, now: pct }}
            style={styles.bootTrack}
          >
            <View style={[styles.bootFill, { width: `${pct}%` }]} />
          </View>
          {/* Hidden from the accessibility tree: the progressbar above already
              carries the number, and announcing a value that moves every 120ms
              would have a screen reader read the panel over and over. */}
          <Text style={styles.bootPct} accessibilityElementsHidden importantForAccessibility="no">
            {pct}%
          </Text>
          <Pressable onPress={dismiss} hitSlop={10}>
            <Text style={styles.bootHide}>Hide this</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  web: { flex: 1, backgroundColor: "#000" },
  exit: {
    position: "absolute",
    top: 10,
    left: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  boot: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    backgroundColor: "rgba(0,0,0,0.85)",
  },
  bootTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  bootTrack: {
    height: 4,
    width: 224,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  bootFill: { height: "100%", borderRadius: 2, backgroundColor: "#FFFFFF" },
  bootPct: { color: "#71717A", fontSize: 12, fontVariant: ["tabular-nums"] },
  bootHide: { color: "#71717A", fontSize: 11, textDecorationLine: "underline" },
  panel: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  panelKicker: {
    color: "#FBBF24",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 2,
  },
  panelTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "600" },
  panelBody: {
    color: "#A1A1AA",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    maxWidth: 340,
  },
  panelSlug: { color: "#E4E4E7", fontFamily: "monospace" },
  panelButton: {
    marginTop: 6,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 9,
    backgroundColor: colors.accent,
  },
  panelButtonLabel: {
    color: colors.accentForeground,
    fontSize: 12,
    fontWeight: "600",
  },
});

export default ArcadeGameScreen;
