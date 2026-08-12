/**
 * The Arcade registry (native).
 * =============================
 * One entry per playable game, and the single source of truth behind the
 * Arcade grid and the Arcade player. Mirrors dehubweb's
 * `src/config/arcade-games.ts` — same slugs, same copy, same art — so the two
 * catalogues stay diffable by eye.
 *
 * WHY THIS LIST IS SHORTER THAN THE WEB'S
 * ---------------------------------------
 * The web arcade carries three games. Two of them cannot be played on a
 * touchscreen, and that is a property of the engines rather than something to
 * be worked around from out here:
 *
 *   - Claude of Duty is mouse-look and WASD. Its four `requestPointerLock`
 *     calls are the whole camera, and its single `touchstart` listener is in
 *     the gesture list that unlocks the audio context — not a control.
 *   - Jungle Trail is the same shape: `requestPointerLock` plus `mousemove`
 *     for the head and `keydown`/`keyup` for the legs, and no touch handler
 *     anywhere in `src/player/controller.js`.
 *
 * Neither engine has a mobile control scheme to fall back to, and a WebView
 * does not grant pointer lock, so a phone cannot drive either one even with a
 * keyboard attached. Both would boot to a world the player cannot move in.
 * They are therefore absent here rather than listed and disabled — a card that
 * exists only to say "not on this device" is worse than no card.
 *
 * King's Gambit is a different engine and genuinely lands on touch: board and
 * camera are driven by pointer events with `setPointerCapture`, and the build
 * ships `@media (hover:none) and (pointer:coarse)` plus a phone breakpoint at
 * 600px. It is the whole mobile arcade today.
 *
 * If either of the other two ever grows touch controls, restoring it is one
 * entry in this file — nothing else here is per-game.
 *
 * WHERE THE GAMES COME FROM
 * -------------------------
 * The builds are vendored in dehubweb under `public/<slug>-game/` and served
 * from dehub.io. They are NOT bundled into the app: the arcade would add
 * megabytes to every install for something most sessions never open, and
 * King's Gambit fetches ~44 MB of armies from upstream's bucket at runtime
 * regardless. Loading the same URL the web arcade loads also means a re-vendor
 * on the web reaches this app with no mobile release at all.
 *
 * The consequence to keep in mind: the app is a client of dehub.io here, so
 * the games follow that deploy and not this one.
 */

import { WEBSITE_LINK } from './links';

export interface ArcadeGameCredit {
  /** Upstream project name, as its authors write it. */
  name: string;
  /** Upstream repository. */
  url: string;
  /** SPDX-ish short name. */
  licence: string;
  /**
   * Full licence text, which lives at the root of the DEHUBWEB repo alongside
   * the vendored build it covers. Recorded here for provenance; there is no
   * copy of it in this repo to point at.
   */
  licenceFile: string;
}

export interface ArcadeGame {
  /** Route param under the Arcade, and the key everything else joins on. */
  slug: string;
  title: string;
  /** One line, card-sized. */
  tagline: string;
  /**
   * One sentence, kept to roughly the same length as every other entry's so a
   * multi-card grid does not go ragged. Same copy as the web registry.
   */
  description: string;
  /** Verb for the card's button — these are different kinds of game. */
  action: string;
  /** Card art: a real capture from the game, not marketing material. */
  art: string;
  /** Alt text for the art. */
  artAlt: string;
  credit: ArcadeGameCredit;
  /** Absolute URL the WebView loads. */
  url: string;
  /**
   * Time constant for the modelled progress bar, in ms. Progress passes 63% at
   * tau and 86% at 2x tau; it is a shape, not a measurement.
   */
  bootTauMs: number;
}

/**
 * NOT PORTED: the web registry's `exitSource`.
 *
 * On the web each build adds a "Leave Game" item to its own settings menu that
 * posts `{ source, type: 'exit' }` to the host. That control is built only when
 * `window.parent !== window`, because it exists to solve an iframe problem —
 * host chrome cannot be clicked through a pointer lock. A WebView loads the
 * game as a top-level document, so the button is never created and the channel
 * can never carry anything. ArcadeGameScreen draws its own exit instead, and
 * deliberately registers no listener for a message that cannot arrive.
 */

export const ARCADE_GAMES: ArcadeGame[] = [
  {
    slug: 'kings-gambit',
    title: "King's Gambit",
    tagline: 'Cinematic 3D chess. Three civilisations, one board.',
    description:
      'Chess with an army behind every piece. Three rigged civilisations march, strike and fall across a marble board in four battlegrounds, at three engine strengths.',
    action: 'Play',
    art: `${WEBSITE_LINK}/arcade/kings-gambit.webp`,
    artAlt: "Two armies of sculpted 3D chess figures facing each other across a lit board in King's Gambit",
    credit: {
      name: "King's Gambit",
      url: 'https://github.com/alexngdev99/rork-medieval-3d-chess',
      licence: 'MIT',
      licenceFile: 'LICENSE-KingsGambit',
    },
    // The engine reads no settings from the URL: it detects a quality preset
    // itself, steps down on sustained bad frame times, and remembers the
    // player's override. There is nothing useful to pass in.
    url: `${WEBSITE_LINK}/chess-game/index.html`,
    // The game has a real loading screen with a real count ("carving 3 of 6
    // figures"), driven by actual download completions. Its own readout is
    // better than anything modelled out here, so this bar only covers the gap
    // before the WebView's first paint — hence the short tau.
    bootTauMs: 6000,
  },
];

export function getArcadeGame(slug: string | undefined): ArcadeGame | undefined {
  return ARCADE_GAMES.find((game) => game.slug === slug);
}
