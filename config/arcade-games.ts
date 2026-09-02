/**
 * The Arcade registry (native).
 * =============================
 * One entry per playable game, and the single source of truth behind the
 * Arcade grid and the Arcade player. Mirrors dehubweb's
 * `src/config/arcade-games.ts` — same slugs, same copy, same art — so the two
 * catalogues stay diffable by eye.
 *
 * HOW THE OTHER TWO BECAME PLAYABLE
 * ---------------------------------
 * This list was one game long when the arcade first shipped here. Claude of
 * Duty and Jungle Trail are mouse-look-and-WASD upstream — between them four
 * `requestPointerLock` calls, `mousemove` for the head and `keydown`/`keyup`
 * for the legs, and no touch handler in either engine — so a phone reached the
 * end of a long bake and stood somewhere it could neither move nor look. A
 * WebView is never granted pointer lock, so a keyboard would not have helped.
 *
 * They are here now because dehubweb grew a touch layer for them
 * (`public/arcade-touch/`, plus a per-game adapter in each vendored
 * `index.html`): an on-screen stick, a look-drag surface and action buttons,
 * behind a coarse-pointer check so a desktop player never sees them. Since the
 * games are loaded from dehub.io rather than bundled, that arrived here with no
 * release of this app at all.
 *
 * WHAT THAT MEANS FOR THIS FILE
 * -----------------------------
 * Nothing in this repo makes those two playable, and nothing here can tell
 * whether they still are. **If the stick or the buttons regress on the web,
 * these two entries become cards that open a game nobody can move in** — the
 * exact state they were kept out of the list to avoid. The guard against that
 * lives with the code it protects, in dehubweb's `src/test/arcade.test.ts`,
 * which asserts the adapters still line up with the engines they reach into.
 *
 * King's Gambit needs none of that: it is a different engine that was always
 * touch-native, with pointer events, `setPointerCapture`, a coarse-pointer
 * media query and a phone breakpoint at 600px.
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
  /**
   * `postMessage({ source })` value the game's own page uses to announce that
   * its engine is up, for the games whose boot is long enough to need one.
   *
   * Without this the readout would retire at `onLoadEnd` — the moment the
   * DOCUMENT finished loading, which for these two is the moment a bake of
   * 25-60 seconds BEGINS, and it renders black throughout. That is
   * indistinguishable from a crash, and is exactly how the web embed was first
   * reported.
   *
   * It works here for a reason worth writing down, because the neighbouring
   * exit bridge does not (see the note below): the readiness scripts are not
   * gated on being framed. They call `parent.postMessage` unconditionally, and
   * in a top-level WebView `parent === window`, so the message is dispatched to
   * the game's own window — where the forwarder ArcadeGameScreen injects picks
   * it up and hands it to React Native.
   */
  readySource?: string;
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
  {
    slug: 'claude-of-duty',
    title: 'Claude of Duty',
    tagline: 'A browser FPS with every asset generated at boot.',
    description:
      'A first-person shooter that ships no art at all: every mesh, texture, weapon and sound is generated in JavaScript on your machine while the level loads.',
    action: 'Deploy',
    art: `${WEBSITE_LINK}/arcade/claude-of-duty.webp`,
    artAlt: 'First-person view down a weapon across the procedurally generated terrain of Claude of Duty',
    credit: {
      name: 'Claude of Duty',
      url: 'https://github.com/mshumer/Claude-of-Duty',
      licence: 'MIT',
      licenceFile: 'LICENSE-ClaudeOfDuty',
    },
    /*
     * Both settings are pinned rather than negotiated, because unlike the web
     * host there is nothing here to negotiate with: that page picks `q` from a
     * live GPU probe, and this side has no DOM to probe from before the WebView
     * exists. `low` is what the same probe resolves to on any coarse pointer
     * anyway, so this is the answer it would have reached, arrived at earlier.
     *
     * `prewarm=0` is not an optimisation but a hang fix — see the long note in
     * dehubweb's WarGameLauncher, which owns this URL's history.
     */
    url: `${WEBSITE_LINK}/war-game/index.html?q=low&prewarm=0`,
    // 25-60s of procedural baking with no loading UI of its own, and it renders
    // black throughout. Without a readout that is indistinguishable from a
    // crash, which is exactly how it was first reported on the web.
    bootTauMs: 22000,
    readySource: 'war-game',
  },
  {
    slug: 'jungle-trail',
    title: 'Jungle Trail',
    tagline: 'Walk a rainforest that is built the moment you arrive.',
    description:
      'A first-person walk through a procedurally generated rainforest — a hundred thousand plants, weather and a day cycle, all grown on your machine as you arrive.',
    action: 'Walk in',
    art: `${WEBSITE_LINK}/arcade/jungle-trail.webp`,
    artAlt: 'A path through dense procedurally generated rainforest canopy in Jungle Trail',
    credit: {
      name: 'Jungle Trail',
      url: 'https://github.com/StarKnightt/jungle-trail',
      licence: 'MIT',
      licenceFile: 'LICENSE-JungleTrail',
    },
    /*
     * The tier goes in the HASH, not the query string — that is where this
     * engine reads its settings (`new URLSearchParams(location.hash.slice(1))`).
     * `?tier=low` is silently ignored, which is the kind of bug that looks like
     * "the quality setting does nothing".
     *
     * Pinning also switches OFF the engine's own adaptive downgrade, which is
     * normally the better judge because it watches real frame times. It is
     * still right here: this is a phone, which is the one case the web host
     * pins for too.
     */
    url: `${WEBSITE_LINK}/jungle-game/index.html#tier=low`,
    // The world is built inside one synchronous constructor, so there is no
    // progress to report from inside — this bar is modelled against a clock.
    bootTauMs: 14000,
    readySource: 'jungle-game',
  },
  {
    slug: 'trenchstar',
    title: 'Trenchstar',
    tagline: 'Stand in a trading floor built out of live markets.',
    description:
      'The mother of all arenas. Trade like a time traveller with dozens of screens. Enjoy live feeds from Binance, Dexscreener or any thing you want from videos, to browser tabs and all between.',
    action: 'Take the desk',
    art: `${WEBSITE_LINK}/arcade/trenchstar.webp`,
    artAlt:
      'A curved wall of live candle charts and market panels around a dark trading floor in Trenchstar',
    credit: {
      name: 'Trenchstar',
      url: 'https://dehub.io',
      licence: 'MIT',
      licenceFile: 'LICENSE-Trenchstar',
    },
    /*
     * Touch-native from the start, unlike the two shooters above: a thumbstick
     * appears under the left thumb in walk mode, a one-finger drag looks
     * around, two fingers fly the desk camera along its view ray, and every
     * panel on the wall is a tap. Nothing here had to wait for an adapter.
     *
     * `q=phone` pins the room's quality tier. The page would reach the same
     * answer from a coarse-pointer media query, but a WebView is not obliged to
     * report one, and the wrong guess is a dpr-3 phone rendering a 4K frame
     * through a post chain with a live mirror floor. Pinned, it starts at a
     * capped pixel ratio, no shadow map, a quarter-size reflection and a small
     * room probe, and still degrades further on its own if the frame time says
     * so. Same host as the web arcade, so a re-vendor there reaches this app
     * with no release.
     */
    url: `${WEBSITE_LINK}/trenchstar-game/index.html?q=phone`,
    // It draws its own boot readout — engine, markets, world, paint — with a
    // real percentage, so the modelled bar only has to cover the gap before
    // the WebView's first paint and retires at `onLoadEnd`. No readySource:
    // the room never announces readiness to anyone — its own boot screen is
    // the readout — so there is nothing for a bridge to forward.
    bootTauMs: 6000,
  },
];

export function getArcadeGame(slug: string | undefined): ArcadeGame | undefined {
  return ARCADE_GAMES.find((game) => game.slug === slug);
}
