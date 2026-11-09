/**
 * SpotifyMiniPlayer — the corner player for Spotify links
 * =======================================================
 * Mounted once, app-wide, beside the radio and audio post players. Empty until
 * a Spotify card's Play is pressed; then it holds Spotify's own embed in a
 * small WebView, so the song keeps going while you scroll and move between
 * screens.
 *
 * The WebView runs Spotify's iFrame API: one tap on our card starts the song,
 * and pause state comes back to the cards. Without a Spotify sign-in inside the
 * app the embed plays 30 second previews; the card's open button hands the
 * song to the Spotify app for the full track.
 *
 * Shares the app's audio focus manager: Spotify starting stops the radio or an
 * audio post, and either of those starting pauses Spotify.
 *
 * Mirrors web's components/app/spotify/SpotifyMiniPlayer.tsx.
 *
 * @module components/Music/SpotifyMiniPlayer
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Linking, StyleSheet, TouchableOpacity, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useTranslation } from 'react-i18next';
import Icon from '../ui/Icon';
import { KeepDarkScope } from '../../libs/jsx/tone';
import { releaseAudioFocus, requestAudioFocus } from '../../libs/audioFocus';
import { closeSpotify, reportSpotifyPaused, setSpotifyToggleHandler, useSpotifyPlayer } from '../../libs/spotify-player';
import { useStages } from '../../context/StageContext';

const EMBED_HEIGHT = 80;
const BASE_URL = 'https://riftn.com/';

/** The page inside the WebView: Spotify's controller and a tiny command hook. */
function playerHtml(uri: string): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}iframe{display:block;border:0}</style></head>
<body><div id="e"></div><script>
var C=null,pending=true,next=null;
function send(m){try{window.ReactNativeWebView.postMessage(JSON.stringify(m))}catch(_){}}
window.onSpotifyIframeApiReady=function(api){
  api.createController(document.getElementById('e'),{uri:${JSON.stringify(uri)},width:'100%',height:${EMBED_HEIGHT}},function(c){
    C=c;
    c.addListener('ready',function(){if(next){var u=next;next=null;pending=true;c.loadUri(u);return;}if(pending){pending=false;c.play();}});
    c.addListener('playback_update',function(e){if(e&&e.data&&typeof e.data.isPaused==='boolean')send({t:'update',paused:e.data.isPaused});});
  });
};
window.__spotify=function(cmd,arg){if(!C){if(cmd==='load')next=arg;return;}if(cmd==='load'){pending=true;C.loadUri(arg);}else if(cmd==='toggle'){C.togglePlay();}else if(cmd==='pause'){C.pause();}};
</script><script src="https://open.spotify.com/embed/iframe-api/v1" async></script></body></html>`;
}

const SpotifyMiniPlayer: React.FC = () => {
  const { current } = useSpotifyPlayer();
  if (!current) return null;
  return <SpotifyMiniPlayerPanel uri={current.link.uri} />;
};

function SpotifyMiniPlayerPanel({ uri }: { uri: string }) {
  const { t } = useTranslation();
  const { currentSpace, isConnected } = useStages();
  const webRef = useRef<WebView>(null);
  // Built for the first song only; later songs load into the same embed.
  const [firstUri] = React.useState(uri);
  const loadedUri = useRef(uri);
  const html = useMemo(() => playerHtml(firstUri), [firstUri]);

  const run = useCallback((cmd: string, arg?: string) => {
    webRef.current?.injectJavaScript(`window.__spotify&&window.__spotify(${JSON.stringify(cmd)},${JSON.stringify(arg ?? null)});true;`);
  }, []);

  // Stable: it is this player's identity in the audio focus manager.
  const pause = useCallback(() => run('pause'), [run]);

  useEffect(() => {
    if (loadedUri.current === uri) return;
    loadedUri.current = uri;
    run('load', uri);
  }, [uri, run]);

  useEffect(() => {
    setSpotifyToggleHandler(() => run('toggle'));
    return () => {
      setSpotifyToggleHandler(null);
      releaseAudioFocus(pause);
    };
  }, [run, pause]);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    let msg: { t?: string; paused?: boolean } | null = null;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (msg?.t !== 'update' || typeof msg.paused !== 'boolean') return;
    if (msg.paused) releaseAudioFocus(pause);
    else requestAudioFocus(pause);
    reportSpotifyPaused(msg.paused);
  }, [pause]);

  // Anything the embed tries to open (the Spotify logo, "Open app", sign in)
  // goes to the Spotify app or the browser, never inside this little frame.
  const openOutside = useCallback((url: string) => {
    if (/^https?:\/\//i.test(url) || /^spotify:/i.test(url)) void Linking.openURL(url).catch(() => {});
  }, []);

  const aboveLiveBar = !!currentSpace && isConnected;

  return (
    <KeepDarkScope>
      <View style={[styles.container, aboveLiveBar && styles.aboveLiveBar]} pointerEvents="box-none">
        <View style={styles.frame}>
          <WebView
            ref={webRef}
            source={{ html, baseUrl: BASE_URL }}
            originWhitelist={['*']}
            onMessage={onMessage}
            javaScriptEnabled
            domStorageEnabled
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
            scrollEnabled={false}
            bounces={false}
            overScrollMode="never"
            setSupportMultipleWindows
            onOpenWindow={(e) => openOutside(e.nativeEvent.targetUrl)}
            onShouldStartLoadWithRequest={(req) => {
              if (req.url === 'about:blank' || req.url.startsWith(BASE_URL)) return true;
              // iOS reports sub-frame loads here too; the embed iframe must load.
              if (req.isTopFrame === false) return true;
              openOutside(req.url);
              return false;
            }}
            style={styles.webview}
            containerStyle={styles.webview}
          />
        </View>
        {/* dark-surface: keeps the theme's control material off this X,
            which sits on the dark player, not on the page. */}
        <TouchableOpacity
          onPress={closeSpotify}
          className="dark-surface"
          style={styles.closeBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('spotify.stopAndClose', { defaultValue: 'Stop and close' })}
        >
          <Icon name="X" size={14} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </KeepDarkScope>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    // Clear of the floating tab bar, matching the radio and audio post players.
    bottom: 80,
    left: 16,
    right: 16,
    zIndex: 99,
  },
  aboveLiveBar: { bottom: 140 },
  frame: {
    height: EMBED_HEIGHT + 12,
    padding: 6,
    borderRadius: 18,
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  closeBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 28,
    height: 28,
    borderRadius: 14,
    // Pure black: System Light leaves it alone (a grey scrim would flip to
    // white and hide the white X).
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default SpotifyMiniPlayer;
