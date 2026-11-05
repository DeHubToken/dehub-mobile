/**
 * Riftn preloader — the animated Riftn mark (a ring sweeping around the "U").
 *
 * The same art the web app uses (`public/dehub-loader.gif` there), resized
 * 1080² → 240² so it costs ~60 KB: it has to render on exactly the slow
 * devices it appears on.
 *
 * `ButtonLoader` is the inline variant, sized to sit in an icon slot. It is
 * what an action button shows between the tap and the result, so a slow phone
 * or a bad connection still answers the press on the frame it happened rather
 * than looking like the tap was missed. `expo-image` animates GIFs on both
 * platforms; `ActivityIndicator` stays correct for anything that is not a
 * branded surface (native pull-to-refresh, list footers).
 *
 * The art is white-on-transparent, matching the app's dark chrome.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { Image } from 'expo-image';

const SOURCE = require('../assets/dehub-loader.gif');

/** Loads quicker than this never show a page loader at all. */
const PAGE_LOADER_GRACE_MS = 150;
/** A page loader that replaces one seen this recently appears at once, so a hand-off never blinks. */
const HANDOFF_WINDOW_MS = 400;
let lastPageLoaderGoneAt = 0;

interface DeHubLoaderProps {
  /** Rendered size in px (square). */
  size?: number;
  style?: any;
}

const Mark = ({ size, style }: { size: number; style?: any }) => (
  <Image
    source={SOURCE}
    style={[{ width: size, height: size, minWidth: size, minHeight: size, flexShrink: 0, aspectRatio: 1 }, style]}
    tintColor="#FFFFFF"
    contentFit="contain"
    // The mark loops forever by design; caching it keeps a re-mount from
    // flashing an empty box on the first frame.
    cachePolicy="memory-disk"
    accessible={false}
  />
);

/**
 * Page-sized loaders keep their space from the first frame but only become
 * visible after a short grace, so a quick load goes straight from nothing to
 * content instead of flashing the mark. One that takes over from a loader
 * just seen shows at once.
 */
function PageLoader({ size, style }: { size: number; style?: any }) {
  const [immediate] = useState(() => Date.now() - lastPageLoaderGoneAt < HANDOFF_WINDOW_MS);
  const opacity = useRef(new Animated.Value(immediate ? 1 : 0)).current;
  const shownAt = useRef<number | null>(immediate ? Date.now() : null);
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    const timer = immediate ? null : setTimeout(() => {
      shownAt.current = Date.now();
      anim = Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true });
      anim.start();
    }, PAGE_LOADER_GRACE_MS);
    return () => {
      if (timer) clearTimeout(timer);
      anim?.stop();
      if (shownAt.current != null) lastPageLoaderGoneAt = Date.now();
    };
  }, [immediate, opacity]);
  return (
    <Animated.View style={{ opacity }}>
      <Mark size={size} style={style} />
    </Animated.View>
  );
}

export const DeHubLoader = ({ size = 64, style }: DeHubLoaderProps) =>
  size >= 40 ? <PageLoader size={size} style={style} /> : <Mark size={size} style={style} />;

/** Icon-sized mark for inside a button. Default 18 px matches the icon slots. */
export const ButtonLoader = ({ size = 18, style }: DeHubLoaderProps) => (
  <DeHubLoader size={size} style={style} />
);

export default DeHubLoader;
