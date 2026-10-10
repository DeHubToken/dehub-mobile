import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore } from 'react';
import { VideoView, type VideoViewProps } from 'expo-video';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { configureForBackgroundPlayback, releaseBackgroundPlayback } from '../../libs/audioSession';
import { isPictureInPicturePlayer, setPictureInPicturePlayer } from '../../libs/pictureInPicture';

type HostedView = {
  token: object;
  props: VideoViewProps;
  view: VideoView | null;
  ready: (view: VideoView) => void;
  started: () => void;
  active: boolean;
  restorePlayer: () => void;
};
let hosted: HostedView | null = null;
let starting: Promise<void> | null = null;
let startingToken: object | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => hosted;
const notify = () => listeners.forEach(listener => listener());

function closeHosted(entry: HostedView) {
  if (hosted !== entry) return;
  hosted = null;
  entry.restorePlayer();
  setPictureInPicturePlayer(null);
  notify();
  void releaseBackgroundPlayback().catch(() => {});
}

/** Manual PiP moves to a root view before entering, so its route can disappear. */
export const PersistentVideoView = forwardRef<VideoView, VideoViewProps>((props, ref) => {
  const local = useRef<VideoView>(null);
  const token = useRef({}).current;
  const entry = useSyncExternalStore(subscribe, snapshot, snapshot);
  const navigation = useNavigation();
  const propsRef = useRef(props);
  propsRef.current = props;
  useImperativeHandle(ref, () => new Proxy({} as VideoView, {
    get: (_target, key) => {
      if (key === 'startPictureInPicture') return () => {
        if (starting) return startingToken === token ? starting : Promise.reject(new Error('A picture-in-picture player is already starting'));
        startingToken = token;
        starting = (async () => {
        if (hosted?.props.player === propsRef.current.player && hosted?.active) return;
        if (hosted) throw new Error('A picture-in-picture player is already active');
        const current = propsRef.current;
        if (!current.player) return;
        await configureForBackgroundPlayback();
        const { staysActiveInBackground, showNowPlayingNotification } = current.player;
        current.player.staysActiveInBackground = true;
        current.player.showNowPlayingNotification = true;
        setPictureInPicturePlayer(current.player);
        let timeout: ReturnType<typeof setTimeout>;
        let resolveReady: (view: VideoView) => void;
        let resolveStarted: () => void;
        const ready = new Promise<VideoView>(resolve => { resolveReady = resolve; });
        const started = new Promise<void>(resolve => { resolveStarted = resolve; });
        const next: HostedView = {
          token, props: current, view: null, active: false,
          ready: view => resolveReady(view),
          started: () => resolveStarted(),
          restorePlayer: () => {
            if (!current.player) return;
            current.player.staysActiveInBackground = staysActiveInBackground;
            current.player.showNowPlayingNotification = showNowPlayingNotification;
          },
        };
        hosted = next;
        notify();
        try {
          await Promise.race([
            (async () => {
              // A mounted ref is not an AVPlayer surface ready for PiP. Wait
              // for layout and a decoded frame, then for the OS start event.
              const view = await ready;
              if (hosted !== next) return;
              await view.startPictureInPicture();
              await started;
            })(),
            new Promise<never>((_, reject) => {
              timeout = setTimeout(() => reject(new Error('Picture-in-picture did not start')), 5000);
            }),
          ]);
        } catch (error) {
          void next.view?.stopPictureInPicture().catch(() => {});
          closeHosted(next);
          throw error;
        } finally {
          clearTimeout(timeout!);
        }
        })().finally(() => { starting = null; startingToken = null; });
        return starting;
      };
      const view = hosted?.props.player === propsRef.current.player ? hosted?.view : local.current;
      const value = view && Reflect.get(view, key);
      return typeof value === 'function' ? value.bind(view) : value;
    },
  }), [token]);
  // Automatic PiP uses the inline view. Keep that route mounted until it ends;
  // pushes and tab changes remain available and do not remove its native view.
  useEffect(() => navigation.addListener('beforeRemove', event => {
    if (hosted?.props.player !== propsRef.current.player && isPictureInPicturePlayer(propsRef.current.player)) event.preventDefault();
  }), [navigation, token]);
  if (entry?.props.player === props.player && entry) return <View style={props.style} />;
  return <VideoView {...props} ref={local}
    allowsVideoFrameAnalysis={false}
    onPictureInPictureStart={() => {
      if (props.player) {
        props.player.staysActiveInBackground = true;
        setPictureInPicturePlayer(props.player);
      }
      props.onPictureInPictureStart?.();
    }}
    onPictureInPictureStop={() => {
      // The outgoing inline view can report stop after ownership moved to
      // the root. It must not release the player underneath the new host.
      if (hosted?.props.player === props.player) return;
      if (isPictureInPicturePlayer(props.player)) setPictureInPicturePlayer(null);
      props.onPictureInPictureStop?.();
    }}
  />;
});

/** Mounted alongside the navigator, never inside the source screen or list cell. */
export function PictureInPictureHost() {
  const entry = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (!entry) return null;
  return <HostedVideo entry={entry} />;
}

function HostedVideo({ entry }: { entry: HostedView }) {
  const [active, setActive] = useState(false);
  const laidOut = useRef(false);
  const renderedFrame = useRef(false);
  const ready = () => {
    if (entry.view && laidOut.current && renderedFrame.current) entry.ready(entry.view);
  };
  return <VideoView {...entry.props}
    allowsVideoFrameAnalysis={false}
    ref={view => { entry.view = view; ready(); }}
    onLayout={event => {
      laidOut.current = event.nativeEvent.layout.width > 0 && event.nativeEvent.layout.height > 0;
      ready();
    }}
    onFirstFrameRender={() => { renderedFrame.current = true; ready(); }}
    // The root view is only the native source. Once the OS owns the visible
    // window, leave no second, inert rectangle on top of the app.
    style={[styles.host, active && styles.hidden]}
    pointerEvents="none"
    nativeControls={false}
    allowsPictureInPicture
    startsPictureInPictureAutomatically={false}
    onPictureInPictureStart={() => {
      if (hosted !== entry) { void entry.view?.stopPictureInPicture().catch(() => {}); return; }
      entry.active = true;
      setActive(true);
      entry.started();
      entry.props.onPictureInPictureStart?.();
    }}
    onPictureInPictureStop={() => {
      if (hosted !== entry) return;
      closeHosted(entry);
      entry.props.onPictureInPictureStop?.();
    }}
  />;
}

const styles = StyleSheet.create({
  host: { position: 'absolute', right: 12, bottom: 90, width: 280, height: 158, zIndex: 10000 },
  hidden: { opacity: 0 },
});
