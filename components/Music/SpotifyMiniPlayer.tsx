/**
 * SpotifyMiniPlayer — the engine behind every Spotify card, plus the corner player
 * ================================================================================
 * Mounted once, app-wide, beside the radio and audio post players. Empty until
 * a Spotify card's Play is pressed; then it holds Spotify's own embed in a
 * small WebView, out of sight, and our cards are its face: the song plays
 * right inside the post (or grid tile) you pressed Play on.
 *
 * The corner player (our bar, not Spotify's) appears when you ask for it with
 * the pop-out button, or when the screen the card is on is left, so the song
 * can always be paused or stopped. If the embed will not start on its own,
 * Spotify's player is shown so it can be tapped.
 *
 * The WebView runs Spotify's iFrame API: one tap on our card starts the song,
 * and pause state and progress come back to the cards. Without a Spotify
 * sign-in inside the app the embed plays 30 second previews; the card's open
 * button hands the song to the Spotify app for the full track.
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
import {
  closeSpotify,
  reportSpotifyPlayback,
  setSpotifyHandlers,
  setSpotifyNeedsTap,
  useSpotifyPlayer,
} from '../../libs/spotify-player';
import { SpotifyNowPlayingBar } from '../common/SpotifyCard';
import { useStages } from '../../context/StageContext';

const EMBED_HEIGHT = 80;
/** How long a pressed Play may take to start before the embed is shown to be tapped. */
const START_GRACE_MS = 7000;
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
    c.addListener('playback_update',function(e){var d=e&&e.data;if(!d)return;send({t:'update',paused:d.isPaused,buffering:d.isBuffering,position:d.position,duration:d.duration});});
  });
};
window.__spotify=function(cmd,arg){if(!C){if(cmd==='load')next=arg;return;}if(cmd==='load'){pending=true;C.loadUri(arg);}else if(cmd==='toggle'){C.togglePlay();}else if(cmd==='pause'){C.pause();}else if(cmd==='seek'){C.seek(Number(arg)||0);}};
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
  const { popout, inView, needsTap, isPaused } = useSpotifyPlayer();
  const playingRef = useRef(false);
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
    playingRef.current = false;
    run('load', uri);
  }, [uri, run]);

  // A pressed Play that has not started after a while: show Spotify's player
  // so it can be tapped.
  useEffect(() => {
    setSpotifyNeedsTap(false);
    const timer = setTimeout(() => {
      if (!playingRef.current) setSpotifyNeedsTap(true);
    }, START_GRACE_MS);
    return () => clearTimeout(timer);
  }, [uri]);

  useEffect(() => {
    setSpotifyHandlers({
      toggle: () => run('toggle'),
      pause: () => run('pause'),
      seek: (seconds) => run('seek', String(seconds)),
    });
    return () => {
      setSpotifyHandlers(null);
      releaseAudioFocus(pause);
    };
  }, [run, pause]);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    let msg: { t?: string; paused?: boolean; buffering?: boolean; position?: number; duration?: number } | null = null;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (msg?.t !== 'update') return;
    if (typeof msg.paused === 'boolean') {
      playingRef.current = !msg.paused;
      if (msg.paused) releaseAudioFocus(pause);
      else requestAudioFocus(pause);
    }
    reportSpotifyPlayback({
      isPaused: typeof msg.paused === 'boolean' ? msg.paused : undefined,
      isBuffering: typeof msg.buffering === 'boolean' ? msg.buffering : undefined,
      position: typeof msg.position === 'number' ? msg.position : undefined,
      duration: typeof msg.duration === 'number' ? msg.duration : undefined,
    });
  }, [pause]);

  // Anything the embed tries to open (the Spotify logo, "Open app", sign in)
  // goes to the Spotify app or the browser, never inside this little frame.
  const openOutside = useCallback((url: string) => {
    if (/^https?:\/\//i.test(url) || /^spotify:/i.test(url)) void Linking.openURL(url).catch(() => {});
  }, []);

  const aboveLiveBar = !!currentSpace && isConnected;
  // Spotify's own player shows only when it has to be tapped; otherwise it
  // plays out of sight and our bar steps in when the card is not on screen.
  const showEmbed = needsTap && isPaused !== false;
  const showBar = !showEmbed && (popout || !inView);

  return (
    <KeepDarkScope>
      <View style={[styles.container, aboveLiveBar && styles.aboveLiveBar]} pointerEvents="box-none">
        {showBar && <SpotifyNowPlayingBar />}
        {/* Same element whether shown or not, so the song never reloads. */}
        <View style={[styles.frame, !showEmbed && styles.frameHidden]} pointerEvents={showEmbed ? 'auto' : 'none'}>
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
        {showEmbed && (
          // dark-surface: keeps the theme's control material off this X,
          // which sits on the dark player, not on the page.
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
        )}
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
  // Out of sight but still laid out on screen, so the WebView keeps playing.
  frameHidden: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
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
