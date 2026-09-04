import * as Linking from 'expo-linking';
import { LinkingOptions, getStateFromPath } from '@react-navigation/native';
import { ScreenNames } from './ScreenNames';
import type { RootStackParamList } from './types';
import { createLogger } from '../libs/logger';
import { emitProfileDeepLink, emitStageDeepLink } from '../libs/deeplink.events';
import { couldBeProfileSegment, isEnsHandle } from '../libs/ens-handle';
import { RESERVED_LINK_SEGMENTS } from '../libs/reserved-usernames';

const logger = createLogger('DeepLink');

/**
 * Navigation state for "put the app on Home".
 *
 * Used by every link whose destination is not a screen — a profile sheet, a
 * stage modal. The surface opens over Home rather than over whatever the app
 * happened to be showing, and the modal itself is raised through
 * libs/deeplink.events.
 */
const homeState = () =>
  ({
    routes: [
      {
        name: ScreenNames.App,
        state: {
          routes: [
            {
              name: ScreenNames.Root,
              state: {
                routes: [{ name: ScreenNames.Home }],
              },
            },
          ],
        },
      },
    ],
  }) as any;

/** 
 * Domains that should open in the app via Universal Links / App Links 
 * Add more domains as needed (e.g., 'dehub.io', 'app.dehub.io')
 */
export const UNIVERSAL_LINK_DOMAINS = [
  'dehub.io',
  'legacy.dehub.io', // backward compat
] as const;

/**
 * Extract username from a username.dehub.io subdomain URL.
 * Returns the subdomain username, or null if not a recognized subdomain.
 */
function extractSubdomainUsername(url: string): string | null {
  try {
    const { hostname } = new URL(url);
    const parts = hostname.split('.');
    // Must be exactly *.dehub.io and not www
    if (parts.length === 3 && parts[1] === 'dehub' && parts[2] === 'io' && parts[0] !== 'www') {
      return parts[0];
    }
  } catch {
    // not a valid URL — ignore
  }
  return null;
}

export const APP_SCHEME = 'dehub';

/**
 * One-segment paths that belong to a route, not to a person.
 *
 * Module scope on purpose: two places below decide "is this first segment a
 * profile?" — getStateFromPath, which actually opens the sheet, and
 * parseDeepLink, which reports what a URL is. dehubweb had the same judgement
 * in four places and they drifted apart, which is how dehub.io/mal.eth ended up
 * unfurling as the homepage there. One list, one helper, both callers.
 *
 * Any future top-level route needs an entry here. The mirror of this rule for
 * profile NAMES is libs/reserved-usernames.ts, which lists these and more.
 *
 * - 'auth-callback' is expo-web-browser's OAuth redirect target, already
 *   consumed by signInWithGoogle(). 'auth' is the same situation for
 *   @web3auth/react-native-sdk's connectTo() redirect (see
 *   libs/legacy-web3auth.ts, reusing the pre-migration app's already
 *   dashboard-whitelisted redirect path), already consumed by that promise
 *   resolving. Both get their own branch below, which resolves nothing.
 * - 'arcade' is a one-segment product URL (dehub.io/arcade); without it the
 *   grid link reads as the username @arcade and opens an empty profile sheet.
 * - 'stage' and 'stages' are handled above whenever they carry an id, but a
 *   bare /stage would otherwise fall through and open the profile @stage.
 *   Both are reserved on the web for the same reason.
 * - 'builder' is the newest of these: the web app moved its app builder to
 *   dehub.io/builder, so a tapped link would open the profile @builder.
 * - 'usernames' is the handle marketplace, and is here for a different reason
 *   than the rest: it HAS a screen and a DeepLinkPaths entry, but the profile
 *   branch runs BEFORE getStateFromPath, so without an entry the path would be
 *   claimed as @usernames and never reach the route that exists for it.
 *   'accounts' — the account marketplace — is here for exactly the same reason.
 */
// One list, from libs/reserved-usernames.ts.
//
// This was fourteen names maintained by hand while that file already held
// ninety-four and libs/dehub-links.ts a third of forty-eight. Eighty-four
// canonical names were missing here, so /docs, /music, /shorts, /tv, /work,
// /explore, /settings, /wallet, /messages, /leaderboard and /governance were
// all read as usernames and opened an empty profile sheet.
//
// The comment above about "one list, one helper, both callers" was right about
// the two callers in this file and wrong about the scope: the judgement lives
// in three files, so the list has to.
const RESERVED_PREFIXES = RESERVED_LINK_SEGMENTS;

export const getDeepLinkPrefix = (): string[] => {
  const prefixes = [
    // Custom scheme
    Linking.createURL('/'),
    `${APP_SCHEME}://`,
    // Universal links (HTTPS)
    ...UNIVERSAL_LINK_DOMAINS.map(domain => `https://${domain}/`),
    // HTTP fallback (for testing)
    ...UNIVERSAL_LINK_DOMAINS.map(domain => `http://${domain}/`),
  ];
  
  return prefixes;
};

/**
 * Deep link path patterns
 * Centralized for easy maintenance and documentation
 */
export const DeepLinkPaths = {
  // Content — dehub.io/app/post/:tokenId
  POST: 'app/post/:tokenId',

  // An off-chain post's own slug — dehub.io/newpost/:newPostId. Top-level,
  // like the canonical share form web hands out. PostResolverScreen resolves
  // it to a tokenId through GET /newpost/:n.
  NEWPOST: 'newpost/:newPostId',

  // Legacy content paths (backward compat)
  LEGACY_STREAM: 'stream/:videoId',
  LEGACY_FEED: 'feeds/:postId',

  // Profile — dehub.io/:username
  PROFILE: ':username',

  // App sections — dehub.io/app/...
  NOTIFICATIONS: 'app/notifications',
  LEADERBOARD: 'app/leaderboard',
  MESSAGES: 'app/messages',

  // Communities — the invite path has to be declared before the slug one, or
  // ':slug' swallows 'join' and the code is lost.
  COMMUNITY_INVITE: 'app/communities/join/:code',
  COMMUNITY: 'app/communities/:slug',

  // Commerce — dehub.io/app/stores/:storeId (+ ?listing=<id> for one item)
  STORE: 'app/stores/:storeId',

  // Handle marketplace. Web canonicalises /app/usernames onto the bare path and
  // shares the bare form, so that is the one declared here. `?handle=` on a
  // shared listing link rides through as a route param and seeds the search
  // box, so the link lands on the handle rather than on the front of the shop.
  USERNAMES: 'usernames',

  // Account marketplace — dehub.io/accounts, the bare path web canonicalises
  // onto. `?handle=` on a shared listing link seeds the search box.
  ACCOUNTS: 'accounts',

  // Events — dehub.io/app/events/:eventNumber. There is no per-event screen
  // yet, so this lands on the list; a link that opens the right part of the
  // app beats one that opens the website in a browser.
  EVENT: 'app/events/:eventNumber',

  // Arcade — dehub.io/arcade is the canonical grid URL on the web, and
  // /arcade/:slug is one game. The player-path is declared before the grid for
  // the same reason the community invite is: the more specific pattern first.
  //
  // A slug the native registry does not carry (the web lists games this app
  // deliberately omits — see config/arcade-games) lands on the player's "no
  // such game" panel, which offers the grid. That is the right end state for a
  // link to a game a phone cannot play: it says so, in the app, instead of
  // opening a world the player cannot move in.
  ARCADE_GAME: 'arcade/:slug',
  ARCADE: 'arcade',
} as const;

/**
 * Main linking configuration for React Navigation
 * Maps URL paths to screens with param parsing
 */
export const linkingConfig: LinkingOptions<RootStackParamList> = {
  prefixes: getDeepLinkPrefix(),
  
  config: {
    // Initial route when no path matches
    initialRouteName: ScreenNames.App,
    
    screens: {
      [ScreenNames.App]: {
        // Nested screens within AppNavigator
        screens: {
          // Post resolver (detects video vs feed and redirects)
          // URL: dehub.io/app/post/:tokenId  (also handles ?c=commentId)
          [ScreenNames.PostResolver]: {
            path: DeepLinkPaths.POST,
            parse: {
              tokenId: (tokenId: string) => tokenId,
            },
          },

          // Off-chain post slug. Same resolver component; it sees newPostId
          // instead of tokenId and resolves through the API first.
          [ScreenNames.PostResolverNewPost]: {
            path: DeepLinkPaths.NEWPOST,
            parse: {
              newPostId: (n: string) => n,
            },
          },

          // Legacy: Video Player  (stream/:videoId)
          // Kept for backward compatibility with old shared links
          // Legacy /feeds/:postId is handled via getStateFromPath redirect
          [ScreenNames.VideoPlayer]: {
            path: DeepLinkPaths.LEGACY_STREAM,
            parse: {
              videoId: (videoId: string) => videoId,
            },
          },

          [ScreenNames.Notifications]: DeepLinkPaths.NOTIFICATIONS,

          [ScreenNames.Leaderboard]: DeepLinkPaths.LEADERBOARD,

          // An invite link shared from either client opens straight into the
          // join screen rather than bouncing through the website.
          [ScreenNames.CommunityInvite]: {
            path: DeepLinkPaths.COMMUNITY_INVITE,
            parse: { code: (code: string) => code },
          },

          [ScreenNames.CommunityDetail]: {
            path: DeepLinkPaths.COMMUNITY,
            parse: { slug: (slug: string) => slug },
          },

          // `?listing=` rides through as a route param; StoreDetailScreen
          // pushes the item screen when it is present, so a shared item link
          // lands on the item and not on the shop around it.
          [ScreenNames.StoreDetail]: {
            path: DeepLinkPaths.STORE,
            parse: { storeId: (storeId: string) => storeId },
          },

          [ScreenNames.Usernames]: DeepLinkPaths.USERNAMES,

          [ScreenNames.Accounts]: DeepLinkPaths.ACCOUNTS,

          [ScreenNames.Events]: DeepLinkPaths.EVENT,

          [ScreenNames.ArcadeGame]: {
            path: DeepLinkPaths.ARCADE_GAME,
            parse: { slug: (slug: string) => slug },
          },

          [ScreenNames.Arcade]: DeepLinkPaths.ARCADE,

          [ScreenNames.Root]: {
            screens: {
              [ScreenNames.DM]: DeepLinkPaths.MESSAGES,
            },
          },
        },
      },
      
      [ScreenNames.Auth]: {
        screens: {
          [ScreenNames.SignIn]: 'signin',
          [ScreenNames.Onboarding]: 'welcome',
        },
      },
    },
  },
  
  /**
   * Custom state resolution for complex deep link scenarios
   * This runs BEFORE the default path matching
   */
  getStateFromPath: (path, options) => {
    logger.info('Processing deep link', { path });

    // OAuth redirects (dehub://auth-callback#access_token=...&refresh_token=...)
    // carry their payload as a URL FRAGMENT. That fragment is already consumed
    // by WebBrowser.openAuthSessionAsync inside signInWithGoogle() — but on
    // Android the same URL can ALSO be delivered here as a second, generic
    // incoming deep link. Strip the fragment BEFORE any segment matching so it
    // can never glue onto a path segment (e.g. 'auth-callback#access_token=…'
    // failing an exact 'auth-callback' match and being misread as a profile
    // username lookup, which was interrupting sign-in mid-flow).
    const hashIndex = path.indexOf('#');
    const pathNoFragment = hashIndex >= 0 ? path.slice(0, hashIndex) : path;

    // Normalize the path
    const normalizedPath = pathNoFragment.replace(/^\/+/, '');
    const parts = normalizedPath.split('?');
    const pathOnly = parts[0] || '';
    const queryString = parts[1] || '';
    const segments = pathOnly.split('/').filter(Boolean);

    // Web answers every /app section at the bare path as well, canonicalises
    // onto it and shares it — a store link is handed out as dehub.io/stores/<id>
    // now, not dehub.io/app/stores/<id>. The routes below are declared with the
    // prefix, so put it back before matching rather than declaring each path
    // twice; a bare form that reached the default matcher resolved to nothing
    // and the link opened the website instead of the app.
    const APP_PREFIXED = new Set([
      'post', 'notifications', 'leaderboard', 'messages', 'communities',
      'stores', 'events',
    ]);
    if (segments.length > 0 && APP_PREFIXED.has(segments[0])) {
      const newPath = `/app/${segments.join('/')}${queryString ? `?${queryString}` : ''}`;
      logger.info('Bare /app section rewritten', { from: path, to: newPath });
      return getStateFromPath(newPath, options);
    }

    if (segments[0] === 'feeds' && segments[1]) {
      const newPath = `/app/post/${segments[1]}${queryString ? `?${queryString}` : ''}`;
      logger.info('Legacy feed redirect', { from: path, to: newPath });
      return getStateFromPath(newPath, options);
    }

    // Stage invite links, both shapes the web app hands out. Stages are modals
    // rather than a screen, so there is no route for React Navigation to
    // resolve and these previously fell through to "could not be resolved" —
    // an invite link tapped on a phone with the app installed did nothing.
    // Handled through the same event bus profiles use, with the app itself
    // sent to Home so the modal opens over something.
    if (segments[0] === 'stage' && segments[1]) {
      const id = decodeURIComponent(segments[1]);
      logger.info('Stage deep link', { id });
      emitStageDeepLink({ id });
      return homeState();
    }
    if (segments[0] === 'stages') {
      // Only the numeric shape is a stage; bare /stages is the hub, and
      // anything else under it has no route on the web either.
      const shortId = segments[1] && /^\d+$/.test(segments[1]) ? Number(segments[1]) : undefined;
      logger.info('Stage deep link', { shortId });
      emitStageDeepLink(shortId != null ? { shortId } : {});
      return homeState();
    }

    // Already consumed in-flight by the sign-in promise that opened it (see
    // RESERVED_PREFIXES). It must never be read as a profile username, and must
    // never trigger a navigation reset that could unmount the sign-in screen
    // mid-flow, so this resolves nothing at all rather than resolving Home.
    if (segments[0] === 'auth-callback' || segments[0] === 'auth') {
      logger.info('Ignoring OAuth callback deep link (already consumed in-flight)', { path });
      return undefined;
    }
    // couldBeProfileSegment carries two rules this branch was missing.
    //
    // A dotted segment is a file, not a person — /favicon.ico and
    // /apple-app-site-association.json were opening an empty profile sheet for
    // @favicon.ico, because the only test here was the reserved list.
    // Usernames cannot contain a dot, so nothing real is refused by adding it.
    //
    // Except a `.eth` handle, which IS a person. A verified ENS name is an
    // alias on the account (accounts.ensName — the username is untouched), and
    // dehub.io/mal.eth is a real profile URL that web already serves. The
    // decoded segment goes straight through to account_info exactly as a
    // username does; that endpoint answers for either.
    if (segments.length === 1 && couldBeProfileSegment(segments[0], RESERVED_PREFIXES)) {
      const username = decodeURIComponent(segments[0]);
      logger.info('Profile deep link', { username, ens: isEnsHandle(username) });
      // Emit event so UserProfileSheetProvider can open the profile bottom sheet
      emitProfileDeepLink(username);
      // Navigate to Home tab
      return homeState();
    }
    
    // Use default path matching for everything else
    const state = getStateFromPath(path, options);
    
    if (state) {
      logger.info('Deep link resolved', { 
        path, 
        routes: state.routes?.map(r => r.name) 
      });
    } else {
      logger.warn('Deep link could not be resolved', { path });
    }
    
    return state;
  },
  
  /**
   * Subscribe to incoming deep links
   * This handles links opened while the app is running
   */
  subscribe: (listener) => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      logger.info('Received deep link while app open', { url });
      // Rewrite username.dehub.io → dehub.io/:username so getStateFromPath handles it
      const subdomain = extractSubdomainUsername(url);
      if (subdomain) {
        const rewritten = `https://dehub.io/${subdomain}`;
        logger.info('Subdomain deep link rewritten', { from: url, to: rewritten });
        listener(rewritten);
        return;
      }
      listener(url);
    });
    return () => { subscription.remove(); };
  },

  /**
   * Get the initial URL that launched the app
   */
  getInitialURL: async () => {
    const url = await Linking.getInitialURL();
    if (!url) return url;

    logger.info('App launched with deep link', { url });

    // Rewrite username.dehub.io → dehub.io/:username
    const subdomain = extractSubdomainUsername(url);
    if (subdomain) {
      const rewritten = `https://dehub.io/${subdomain}`;
      logger.info('Subdomain launch rewritten', { from: url, to: rewritten });
      return rewritten;
    }
    return url;
  },
};

const SHARE_BASE = `https://${UNIVERSAL_LINK_DOMAINS[0]}`;

/**
 * Generate a deep link URL for sharing
 * 
 * @example
 * createDeepLink('POST', { tokenId: 'abc123' })
 * // Returns: 'https://dehub.io/app/post/abc123'
 */
export const createDeepLink = (
  type: keyof typeof DeepLinkPaths,
  params: Record<string, string>
): string => {
  let path: string = DeepLinkPaths[type];
  
  // Replace path parameters
  Object.entries(params).forEach(([key, value]) => {
    path = path.replace(`:${key}`, encodeURIComponent(value));
  });
  
  return `${SHARE_BASE}/${path}`;
};

export const ShareLinks = {
  /** Feed post or video — dehub.io/app/post/:tokenId */
  post: (tokenId: string | number) => `${SHARE_BASE}/app/post/${encodeURIComponent(String(tokenId))}`,
  /** Profile — dehub.io/:username */
  profile: (username: string) => `${SHARE_BASE}/${encodeURIComponent(username)}`,
  /**
   * The same profile at its verified ENS name — dehub.io/mal.eth.
   *
   * A second URL for one profile, not a replacement: the username is what the
   * account is called, while a `.eth` name is a claim on something that can be
   * sold or left to expire. Web's profile header offers both for the same
   * reason, and its canonical still points at /username.
   */
  ensProfile: (ensName: string) => `${SHARE_BASE}/${encodeURIComponent(ensName)}`,
  /** Comment on a post — dehub.io/app/post/:tokenId?c=commentId */
  comment: (tokenId: string | number, commentId: string | number) =>
    `${SHARE_BASE}/app/post/${encodeURIComponent(String(tokenId))}?c=${encodeURIComponent(String(commentId))}`,
  /** Notifications */
  notifications: () => `${SHARE_BASE}/app/notifications`,
  /** Leaderboard */
  leaderboard: () => `${SHARE_BASE}/app/leaderboard`,
  /** Messages */
  messages: () => `${SHARE_BASE}/app/messages`,
  /** Community — dehub.io/app/communities/:slug */
  community: (slug: string) => `${SHARE_BASE}/app/communities/${encodeURIComponent(slug)}`,
  /** Community invite — dehub.io/app/communities/join/:code */
  communityInvite: (code: string) => `${SHARE_BASE}/app/communities/join/${encodeURIComponent(code)}`,
  /** Store — dehub.io/app/stores/:storeId */
  store: (storeId: string) => `${SHARE_BASE}/app/stores/${encodeURIComponent(storeId)}`,
  /**
   * Shop item — dehub.io/app/stores/:storeId?listing=:listingId
   *
   * The item id rides in the query rather than the path because that is the
   * URL the web app builds and the one its store page reads. A link shared
   * from mobile has to open on web, so the shape is not ours to choose.
   */
  listing: (storeId: string, listingId: string) =>
    `${SHARE_BASE}/app/stores/${encodeURIComponent(storeId)}?listing=${encodeURIComponent(listingId)}`,
  /**
   * Handle for sale — dehub.io/usernames?handle=:handle
   *
   * The bare path, not `/app/usernames`: the web worker canonicalises the two
   * onto this one, so a link shared from a phone has to be the form web itself
   * publishes or it indexes and unfurls as a duplicate.
   */
  usernameListing: (handle: string) =>
    `${SHARE_BASE}/usernames?handle=${encodeURIComponent(handle)}`,
  /**
   * Account for sale — dehub.io/accounts?handle=:handle
   *
   * Same shape as the handle market: the bare path is the one web publishes,
   * with the handle riding in the query to seed the search box.
   */
  accountListing: (handle: string) =>
    `${SHARE_BASE}/accounts?handle=${encodeURIComponent(handle)}`,
  /** Event — dehub.io/app/events/:eventNumber */
  event: (eventNumber: string | number) =>
    `${SHARE_BASE}/app/events/${encodeURIComponent(String(eventNumber))}`,
  /**
   * Stage invite / announcement — dehub.io/stages/:n, or dehub.io/stage/:uuid
   * for a row that predates short ids.
   *
   * Top-level, not under /app: that is the shape web's invite route already
   * serves, and a link shared from here has to open there. Pass the row rather
   * than a bare id wherever one is to hand — web's share sheet prefers the
   * short form, so a mobile link built from the uuid is the odd one out.
   */
  stage: (stage: string | { id: string; short_id?: number | null }) => {
    if (typeof stage === 'string') return `${SHARE_BASE}/stage/${encodeURIComponent(stage)}`;
    return stage.short_id != null
      ? `${SHARE_BASE}/stages/${stage.short_id}`
      : `${SHARE_BASE}/stage/${encodeURIComponent(stage.id)}`;
  },
  /** Bounty detail — dehub.io/bounty/:jobNumber */
  bounty: (jobNumber: string | number) => `${SHARE_BASE}/bounty/${encodeURIComponent(String(jobNumber))}`,
  /** Arcade grid — dehub.io/arcade */
  arcade: () => `${SHARE_BASE}/arcade`,
  /** One game — dehub.io/arcade/:slug */
  arcadeGame: (slug: string) => `${SHARE_BASE}/arcade/${encodeURIComponent(slug)}`,
};

/**
 * Parse a URL to extract the deep link type and params
 * Useful for analytics or custom handling
 */
export const parseDeepLink = (url: string): { type: string; params: Record<string, string> } | null => {
  try {
    const parsed = Linking.parse(url);
    
    if (!parsed.path) {
      return null;
    }
    
    const pathParts = parsed.path.split('/').filter(Boolean);
    // The /app sections answer at the bare path too and web shares the bare
    // form, so the branches for those read this instead of pathParts: it is the
    // path with the prefix taken off when it is there. Everything below that is
    // top-level on the web (arcade, stream, newpost, a profile) keeps reading
    // pathParts, which is unchanged.
    const appParts = pathParts[0] === 'app' ? pathParts.slice(1) : pathParts;
    const qp = (parsed.queryParams || {}) as Record<string, string>;

    // New canonical:  /app/post/:tokenId
    if (appParts[0] === 'post' && appParts[1]) {
      return { type: 'post', params: { tokenId: appParts[1], ...qp } };
    }

    // /app/notifications
    if (appParts[0] === 'notifications') {
      return { type: 'notifications', params: qp };
    }

    // /app/leaderboard
    if (appParts[0] === 'leaderboard') {
      return { type: 'leaderboard', params: qp };
    }

    // /app/messages
    if (appParts[0] === 'messages') {
      return { type: 'messages', params: qp };
    }

    // /app/communities/join/:code  — checked before the slug form below
    if (appParts[0] === 'communities' && appParts[1] === 'join' && appParts[2]) {
      return { type: 'communityInvite', params: { code: appParts[2], ...qp } };
    }

    // /app/communities/:slug
    if (appParts[0] === 'communities' && appParts[1]) {
      return { type: 'community', params: { slug: appParts[1], ...qp } };
    }

    // /app/stores/:storeId — with ?listing= it is one item, without it the shop
    if (appParts[0] === 'stores' && appParts[1]) {
      return qp.listing
        ? { type: 'listing', params: { storeId: appParts[1], ...qp } }
        : { type: 'store', params: { storeId: appParts[1], ...qp } };
    }

    // /app/events/:eventNumber
    if (appParts[0] === 'events' && appParts[1]) {
      return { type: 'event', params: { eventNumber: appParts[1], ...qp } };
    }

    // /arcade/:slug and /arcade — checked before the single-segment profile
    // branch below, which would otherwise report the grid as the user @arcade.
    if (pathParts[0] === 'arcade') {
      return pathParts[1]
        ? { type: 'arcadeGame', params: { slug: pathParts[1], ...qp } }
        : { type: 'arcade', params: qp };
    }

    // Legacy: /stream/:videoId
    if (pathParts[0] === 'stream' && pathParts[1]) {
      return { type: 'stream', params: { videoId: pathParts[1] } };
    }
    
    // Legacy: /feeds/:postId
    if (pathParts[0] === 'feeds' && pathParts[1]) {
      return { type: 'feed', params: { postId: pathParts[1] } };
    }

    // Profile: /:username or /:name.eth (single segment). Shares the reserved
    // list and the dot rule with getStateFromPath above — this used to exclude
    // 'app' and nothing else, so it reported /arcade as the user @arcade.
    if (pathParts.length === 1 && couldBeProfileSegment(pathParts[0], RESERVED_PREFIXES)) {
      return { type: 'profile', params: { username: pathParts[0] } };
    }
    
    // Fallback
    return {
      type: pathParts[0] || 'unknown',
      params: qp,
    };
  } catch (error) {
    logger.error('Failed to parse deep link', { url, error });
    return null;
  }
};

export default linkingConfig;
