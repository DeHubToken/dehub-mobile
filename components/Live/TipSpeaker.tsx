/**
 * The thing that actually says a tip message out loud.
 *
 * A zero-size WebView holding eSpeak NG. React Native has no WebAssembly, so
 * the synthesiser cannot run in JS here — but it runs perfectly well in the
 * WebView that is already in the binary, and the WebView plays its own audio,
 * so nothing has to cross the bridge except the sentence to read.
 *
 * Mount it once, wherever a viewer is watching a live stream. It registers
 * itself with libs/tipTts and unregisters on unmount, so `speakTipMessage`
 * anywhere in the app finds it without prop-drilling a ref through the player.
 *
 * See libs/tipTts for why this is a WebView and not expo-speech (short version:
 * OTA, and the same voice as the browser).
 */
import React, { useCallback, useEffect, useRef } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { registerTipSpeaker } from "../../libs/tipTts";

const CDN = "https://cdn.jsdelivr.net/npm/mespeak@2.0.2";

/**
 * The page the WebView runs.
 *
 * `loadVoice` REPORTS FAILURE AND MUST STILL BE CALLED. Its callback comes back
 * `(false, "en/en-us")` because the dictionary file it wants to create is
 * already in the emscripten filesystem — but the voice is installed by the time
 * it says so. Without the call, `speak` returns nothing at all and the only
 * sign is a console warning; measured on the real engine, config alone yields 0
 * bytes and the same sentence after `loadVoice` yields 83 kB. So the callback's
 * verdict is deliberately ignored, and it is raced against a timeout so a
 * callback that never fires cannot wedge the queue.
 *
 * Lines that arrive before the engine has loaded are held in `queue` and drained
 * once it is ready — the first gift of a stream must not be the one that gets
 * swallowed while ~590 kB comes down.
 */
const PAGE = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:transparent">
<script type="module">
  const queue = [];
  let speak = null;
  let playing = false;

  async function drain() {
    if (playing || !speak) return;
    playing = true;
    try {
      while (queue.length > 0) {
        const text = queue.shift();
        let wav;
        try {
          wav = speak(text, { rawdata: 'base64', variant: 'old', speed: 135, pitch: 25, amplitude: 100 });
        } catch (e) { continue; }
        if (!wav) continue;
        await new Promise((done) => {
          const a = new Audio('data:audio/wav;base64,' + wav);
          a.onended = done;
          a.onerror = done;
          a.play().catch(done);
        });
      }
    } finally { playing = false; }
  }

  // Called from the native side via injectJavaScript.
  window.__speak = (text) => {
    if (!text) return;
    queue.push(text);
    if (queue.length > 5) queue.shift();
    drain();
  };

  try {
    const mod = await import('${CDN}/src/index.js/+esm');
    const engine = mod.default || mod;
    if (!engine.isConfigLoaded()) {
      engine.loadConfig(await (await fetch('${CDN}/src/mespeak_config.json')).json());
    }
    const voice = await (await fetch('${CDN}/voices/en/en-us.json')).json();
    await new Promise((done) => {
      const t = setTimeout(done, 5000);
      try {
        engine.loadVoice(voice, () => { clearTimeout(t); done(); });
      } catch (e) { clearTimeout(t); done(); }
    });
    speak = engine.speak.bind(engine);
    drain();
  } catch (e) {
    // No voice this session. Silence is the correct failure here — the
    // celebration and the on-screen text still play.
  }
</script></body>`;

export function TipSpeaker() {
  const webRef = useRef<WebView>(null);

  const send = useCallback((text: string) => {
    // JSON.stringify does the escaping, including the quotes — a tip message is
    // attacker-controlled text and this is the one place it becomes code.
    webRef.current?.injectJavaScript(
      `window.__speak && window.__speak(${JSON.stringify(text)}); true;`
    );
  }, []);

  useEffect(() => {
    registerTipSpeaker(send);
    return () => registerTipSpeaker(null);
  }, [send]);

  return (
    // Not `display: none` and not zero-size: some WebView builds skip loading or
    // refuse audio for a view they consider invisible. One pixel, off-screen,
    // and untouchable instead.
    <View
      pointerEvents="none"
      style={{ position: "absolute", width: 1, height: 1, opacity: 0, left: -10, top: -10 }}
    >
      <WebView
        ref={webRef}
        source={{ html: PAGE, baseUrl: "https://dehub.io" }}
        originWhitelist={["*"]}
        // Without this the WebView waits for a tap that will never come, and
        // every tip is read out to nobody.
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        javaScriptEnabled
        domStorageEnabled
        androidLayerType="software"
        style={{ width: 1, height: 1, backgroundColor: "transparent" }}
      />
    </View>
  );
}

export default TipSpeaker;
