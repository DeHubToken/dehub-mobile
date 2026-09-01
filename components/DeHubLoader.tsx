/**
 * DeHub preloader — the animated DeHub mark (a ring sweeping around the "U").
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
import React from 'react';
import { Image } from 'expo-image';

const SOURCE = require('../assets/dehub-loader.gif');

interface DeHubLoaderProps {
  /** Rendered size in px (square). */
  size?: number;
  style?: any;
}

export const DeHubLoader = ({ size = 64, style }: DeHubLoaderProps) => (
  <Image
    source={SOURCE}
    style={[{ width: size, height: size }, style]}
    contentFit="contain"
    // The mark loops forever by design; caching it keeps a re-mount from
    // flashing an empty box on the first frame.
    cachePolicy="memory-disk"
    accessible={false}
  />
);

/** Icon-sized mark for inside a button. Default 18 px matches the icon slots. */
export const ButtonLoader = ({ size = 18, style }: DeHubLoaderProps) => (
  <DeHubLoader size={size} style={style} />
);

export default DeHubLoader;
