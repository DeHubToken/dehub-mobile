/**
 * Entry for assets/theme-backdrop/index.html — see ./build.js.
 *
 * Mounts one of dehubweb's canvas-theme backgrounds, unchanged, inside the
 * WebView that components/theme/ThemeBackdrop.tsx puts behind the app. The
 * app names the theme in `window.__BACKDROP_THEME` (the URL hash also works,
 * for opening the page in a browser), and pauses and resumes the loop through
 * `window.dehubBackdrop.pause()`, which is web's own background gate.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { setBackgroundPaused } from '@/lib/background-gate';
import { CosmicBackground } from '@/components/app/CosmicBackground';
import { HazyNightsBackground } from '@/components/app/HazyNightsBackground';
import { SwarmsBackground } from '@/components/app/SwarmsBackground';
import { LavaLampBackground } from '@/components/app/LavaLampBackground';
import { WarBackground } from '@/components/app/WarBackground';
import { OsakaBackground } from '@/components/app/OsakaBackground';
import { JungleBackground } from '@/components/app/JungleBackground';
import { WinterSnow } from '@/components/app/WinterSnow';

const BACKGROUNDS: Record<string, React.ComponentType> = {
  cosmic: CosmicBackground,
  hazy: HazyNightsBackground,
  swarms: SwarmsBackground,
  lavalamp: LavaLampBackground,
  winter: WinterSnow,
  war: WarBackground,
  osaka: OsakaBackground,
  jungle: JungleBackground,
};

const w = window as unknown as Record<string, unknown>;
const theme = (w.__BACKDROP_THEME as string) || decodeURIComponent(window.location.hash.slice(1));
w.__THEME = theme;
w.dehubBackdrop = {
  pause(paused: boolean) {
    setBackgroundPaused(!!paused);
  },
};

const Background = BACKGROUNDS[theme];
const mount = document.getElementById('bg');
if (Background && mount) createRoot(mount).render(<Background />);
