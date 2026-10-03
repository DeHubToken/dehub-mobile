import React, { forwardRef, useEffect, useImperativeHandle, useRef, useSyncExternalStore } from 'react';
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
};
let hosted: HostedView | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => hosted;
const notify = () => listeners.forEach(listener => listener());

function closeHosted(entry: HostedView) {
  if (hosted !== entry) return;
  hosted = null;
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
      if (key === 'startPictureInPicture') return async () => {
        if (hosted?.token === token && hosted.view) return hosted.view.startPictureInPicture();
        if (hosted) throw new Error('A picture-in-picture player is already active');
        const current = propsRef.current;
        if (!current.player) return;
        await configureForBackgroundPlayback();
        current.player.staysActiveInBackground = true;
        current.player.showNowPlayingNotification = true;
        setPictureInPicturePlayer(current.player);
        let timeout: ReturnType<typeof setTimeout>;
        let resolveReady: (view: VideoView) => void;
        const ready = new Promise<VideoView>((resolve, reject) => {
          resolveReady = resolve;
          timeout = setTimeout(() => reject(new Error('Picture-in-picture view did not mount')), 5000);
        });
        const next: HostedView = { token, props: current, view: null, ready: view => resolveReady(view) };
        hosted = next;
        notify();
        try {
          const view = await ready;
          clearTimeout(timeout!);
          // Give the native player surface its first layout before requesting PiP.
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          await view.startPictureInPicture();
        } catch (error) {
          clearTimeout(timeout!);
          closeHosted(next);
          throw error;
        }
      };
      const view = hosted?.token === token ? hosted.view : local.current;
      const value = view && Reflect.get(view, key);
      return typeof value === 'function' ? value.bind(view) : value;
    },
  }), [token]);
  // Automatic PiP uses the inline view. Keep that route mounted until it ends;
  // pushes and tab changes remain available and do not remove its native view.
  useEffect(() => navigation.addListener('beforeRemove', event => {
    if (hosted?.token !== token && isPictureInPicturePlayer(propsRef.current.player)) event.preventDefault();
  }), [navigation, token]);
  if (entry?.token === token) return <View style={props.style} />;
  return <VideoView {...props} ref={local}
    onPictureInPictureStart={() => {
      if (props.player) {
        props.player.staysActiveInBackground = true;
        setPictureInPicturePlayer(props.player);
      }
      props.onPictureInPictureStart?.();
    }}
    onPictureInPictureStop={() => {
      if (isPictureInPicturePlayer(props.player)) setPictureInPicturePlayer(null);
      props.onPictureInPictureStop?.();
    }}
  />;
});

/** Mounted alongside the navigator, never inside the source screen or list cell. */
export function PictureInPictureHost() {
  const entry = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (!entry) return null;
  return <VideoView {...entry.props}
    ref={view => { entry.view = view; if (view) entry.ready(view); }}
    style={styles.host}
    nativeControls={false}
    startsPictureInPictureAutomatically={false}
    onPictureInPictureStart={() => entry.props.onPictureInPictureStart?.()}
    onPictureInPictureStop={() => { closeHosted(entry); entry.props.onPictureInPictureStop?.(); }}
  />;
}

const styles = StyleSheet.create({ host: { position: 'absolute', right: 12, bottom: 90, width: 280, height: 158, zIndex: 10000 } });
