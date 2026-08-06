import * as Linking from 'expo-linking';
import { LinkingOptions, getStateFromPath } from '@react-navigation/native';
import { ScreenNames } from './ScreenNames';
import type { RootStackParamList } from './types';
import { createLogger } from '../libs/logger';
import { emitProfileDeepLink } from '../libs/deeplink.events';

const logger = createLogger('DeepLink');

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

  // Legacy content paths (backward compat)
  LEGACY_STREAM: 'stream/:videoId',
  LEGACY_FEED: 'feeds/:postId',

  // Profile — dehub.io/:username
  PROFILE: ':username',

  // App sections — dehub.io/app/...
  NOTIFICATIONS: 'app/notifications',
  LEADERBOARD: 'app/leaderboard',
  MESSAGES: 'app/messages',
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

    if (segments[0] === 'feeds' && segments[1]) {
      const newPath = `/app/post/${segments[1]}${queryString ? `?${queryString}` : ''}`;
      logger.info('Legacy feed redirect', { from: path, to: newPath });
      return getStateFromPath(newPath, options);
    }

    // 'auth-callback' is expo-web-browser's OAuth redirect target, already
    // consumed by signInWithGoogle() — it must never be treated as a profile
    // username, and must never trigger a navigation reset that could unmount
    // the in-progress sign-in screen. 'auth' is the same situation for
    // @web3auth/react-native-sdk's connectTo() redirect (see
    // libs/legacy-web3auth.ts, reusing the pre-migration app's already
    // dashboard-whitelisted redirect path) — already consumed by that
    // promise resolving.
    const RESERVED_PREFIXES = ['app', 'stream', 'feeds', 'signin', 'welcome', 'auth-callback', 'auth'];
    if (segments[0] === 'auth-callback' || segments[0] === 'auth') {
      logger.info('Ignoring OAuth callback deep link (already consumed in-flight)', { path });
      return undefined;
    }
    if (
      segments.length === 1 &&
      !RESERVED_PREFIXES.includes(segments[0])
    ) {
      const username = decodeURIComponent(segments[0]);
      logger.info('Profile deep link', { username });
      // Emit event so UserProfileSheetProvider can open the profile bottom sheet
      emitProfileDeepLink(username);
      // Navigate to Home tab
      return {
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
      } as any;
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
  /** Comment on a post — dehub.io/app/post/:tokenId?c=commentId */
  comment: (tokenId: string | number, commentId: string | number) =>
    `${SHARE_BASE}/app/post/${encodeURIComponent(String(tokenId))}?c=${encodeURIComponent(String(commentId))}`,
  /** Notifications */
  notifications: () => `${SHARE_BASE}/app/notifications`,
  /** Leaderboard */
  leaderboard: () => `${SHARE_BASE}/app/leaderboard`,
  /** Messages */
  messages: () => `${SHARE_BASE}/app/messages`,
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
    const qp = (parsed.queryParams || {}) as Record<string, string>;
    
    // New canonical:  /app/post/:tokenId
    if (pathParts[0] === 'app' && pathParts[1] === 'post' && pathParts[2]) {
      return { type: 'post', params: { tokenId: pathParts[2], ...qp } };
    }

    // /app/notifications
    if (pathParts[0] === 'app' && pathParts[1] === 'notifications') {
      return { type: 'notifications', params: qp };
    }

    // /app/leaderboard
    if (pathParts[0] === 'app' && pathParts[1] === 'leaderboard') {
      return { type: 'leaderboard', params: qp };
    }

    // /app/messages
    if (pathParts[0] === 'app' && pathParts[1] === 'messages') {
      return { type: 'messages', params: qp };
    }

    // Legacy: /stream/:videoId
    if (pathParts[0] === 'stream' && pathParts[1]) {
      return { type: 'stream', params: { videoId: pathParts[1] } };
    }
    
    // Legacy: /feeds/:postId
    if (pathParts[0] === 'feeds' && pathParts[1]) {
      return { type: 'feed', params: { postId: pathParts[1] } };
    }

    // Profile: /:username (single segment)
    if (pathParts.length === 1 && pathParts[0] !== 'app') {
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
