/**
 * Deep Linking Configuration
 * 
 * Centralized configuration for all deep links and universal links.
 * Follows the pattern used by YouTube, Twitter, and Instagram.
 * 
 * Supported URL formats:
 * - Custom scheme: dehub://stream/123
 * - Universal links: https://legacy.dehub.io/stream/123
 * 
 * To add a new deep link:
 * 1. Add the path pattern to the appropriate screen in LINKING_CONFIG.screens
 * 2. Define any param parsing in the path (e.g., :tokenId for path params)
 * 3. Use parse/stringify for custom param transformations
 */
import * as Linking from 'expo-linking';
import { LinkingOptions, getStateFromPath } from '@react-navigation/native';
import { ScreenNames } from './ScreenNames';
import type { RootStackParamList } from './types';
import { createLogger } from '../libs/logger';

const logger = createLogger('DeepLink');

// =============================================================================
// Configuration
// =============================================================================

/** 
 * Domains that should open in the app via Universal Links / App Links 
 * Add more domains as needed (e.g., 'dehub.io', 'app.dehub.io')
 */
export const UNIVERSAL_LINK_DOMAINS = [
  'legacy.dehub.io',
  // Add future domains here:
  // 'dehub.io',
  // 'app.dehub.io',
] as const;

/**
 * Custom URL scheme for direct app links
 */
export const APP_SCHEME = 'dehub';

/**
 * Get the base URL for deep linking
 */
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

// =============================================================================
// Path Definitions
// =============================================================================

/**
 * Deep link path patterns
 * Centralized for easy maintenance and documentation
 */
export const DeepLinkPaths = {
  // Content (ACTIVE)
  STREAM: 'stream/:videoId',
  FEED: 'feeds/:postId',
  
  // TODO: Uncomment when ready to enable
  // // Live
  // LIVE: 'live/:streamId',
  // 
  // // Social
  // PROFILE: 'profile/:username',
  // USER: 'u/:username', // Short alias
  // 
  // // Notifications
  // NOTIFICATIONS: 'notifications',
  // 
  // // Search
  // SEARCH: 'search',
  // SEARCH_QUERY: 'search/:query',
  // 
  // // Settings
  // SETTINGS: 'settings',
  // 
  // // Auth (for magic links, invites, etc.)
  // INVITE: 'invite/:code',
  // 
  // // DMs
  // CHAT: 'chat/:recipientId',
  // MESSAGES: 'messages',
} as const;

// =============================================================================
// Linking Configuration
// =============================================================================

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
      // =======================================================================
      // App Stack (Main authenticated/unauthenticated screens)
      // =======================================================================
      [ScreenNames.App]: {
        // Nested screens within AppNavigator
        screens: {
          // -------------------------------------------------------------------
          // Video Player
          // URL: legacy.dehub.io/stream/abc123
          // -------------------------------------------------------------------
          [ScreenNames.VideoPlayer]: {
            path: DeepLinkPaths.STREAM,
            parse: {
              videoId: (videoId: string) => videoId,
            },
          },
          
          // -------------------------------------------------------------------
          // Feed Detail
          // URL: legacy.dehub.io/feeds/post123
          // -------------------------------------------------------------------
          [ScreenNames.FeedDetail]: {
            path: DeepLinkPaths.FEED,
            parse: {
              postId: (postId: string) => postId,
            },
          },
          
          // TODO: Uncomment when ready to enable these deep links
          // // -------------------------------------------------------------------
          // // Live Viewer
          // // URL: legacy.dehub.io/live/stream123
          // // -------------------------------------------------------------------
          // [ScreenNames.LiveViewer]: {
          //   path: DeepLinkPaths.LIVE,
          //   parse: {
          //     streamId: (streamId: string) => streamId,
          //   },
          // },
          // 
          // // -------------------------------------------------------------------
          // // Notifications
          // // URL: legacy.dehub.io/notifications
          // // -------------------------------------------------------------------
          // [ScreenNames.Notifications]: DeepLinkPaths.NOTIFICATIONS,
          // 
          // // -------------------------------------------------------------------
          // // Search
          // // URL: legacy.dehub.io/search or legacy.dehub.io/search/query
          // // -------------------------------------------------------------------
          // [ScreenNames.Search]: {
          //   path: DeepLinkPaths.SEARCH_QUERY,
          //   parse: {
          //     query: (query: string) => decodeURIComponent(query),
          //   },
          // },
          // 
          // // -------------------------------------------------------------------
          // // Chat / DM
          // // URL: legacy.dehub.io/chat/user123
          // // -------------------------------------------------------------------
          // [ScreenNames.Chat]: {
          //   path: DeepLinkPaths.CHAT,
          //   parse: {
          //     recipientId: (recipientId: string) => recipientId,
          //   },
          // },
          // 
          // // -------------------------------------------------------------------
          // // Settings
          // // URL: legacy.dehub.io/settings
          // // -------------------------------------------------------------------
          // [ScreenNames.AccountSettings]: DeepLinkPaths.SETTINGS,
          // 
          // // -------------------------------------------------------------------
          // // Root Tab Navigator (Home, Feed, DM, Profile tabs)
          // // -------------------------------------------------------------------
          // [ScreenNames.Root]: {
          //   screens: {
          //     [ScreenNames.Home]: 'home',
          //     [ScreenNames.Feed]: 'feed',
          //     [ScreenNames.DM]: DeepLinkPaths.MESSAGES,
          //     [ScreenNames.Profile]: 'profile',
          //   },
          // },
        },
      },
      
      // =======================================================================
      // Auth Stack (Onboarding, Sign In, etc.)
      // =======================================================================
      [ScreenNames.Auth]: {
        screens: {
          [ScreenNames.SignIn]: 'signin',
          [ScreenNames.Onboarding]: 'welcome',
        },
      },
    },
  },
  
  // ===========================================================================
  // Custom URL Handling
  // ===========================================================================
  
  /**
   * Custom state resolution for complex deep link scenarios
   * This runs BEFORE the default path matching
   */
  getStateFromPath: (path, options) => {
    logger.info('Processing deep link', { path });
    
    // Normalize the path (remove leading slashes, decode URI)
    const normalizedPath = path.replace(/^\/+/, '');
    
    // Handle legacy URL patterns or redirects here
    // Example: Redirect old URLs to new format
    // if (normalizedPath.startsWith('video/')) {
    //   const newPath = normalizedPath.replace('video/', 'stream/');
    //   return getStateFromPath(newPath, options);
    // }
    
    // Use default path matching
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
    // Handle links when app is already open
    const subscription = Linking.addEventListener('url', ({ url }) => {
      logger.info('Received deep link while app open', { url });
      listener(url);
    });
    
    return () => {
      subscription.remove();
    };
  },
  
  /**
   * Get the initial URL that launched the app
   */
  getInitialURL: async () => {
    // Check if the app was opened via a deep link
    const url = await Linking.getInitialURL();
    
    if (url) {
      logger.info('App launched with deep link', { url });
    }
    
    return url;
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a deep link URL for sharing
 * 
 * @example
 * createDeepLink('STREAM', { videoId: 'abc123' })
 * // Returns: 'https://legacy.dehub.io/stream/abc123'
 */
export const createDeepLink = (
  type: keyof typeof DeepLinkPaths,
  params: Record<string, string>
): string => {
  const baseDomain = UNIVERSAL_LINK_DOMAINS[0];
  let path: string = DeepLinkPaths[type];
  
  // Replace path parameters
  Object.entries(params).forEach(([key, value]) => {
    path = path.replace(`:${key}`, encodeURIComponent(value));
  });
  
  return `https://${baseDomain}/${path}`;
};

/**
 * Generate share links for content
 */
export const ShareLinks = {
  video: (videoId: string) => createDeepLink('STREAM', { videoId }),
  feed: (postId: string) => createDeepLink('FEED', { postId }),
  // TODO: Uncomment when ready
  // live: (streamId: string) => createDeepLink('LIVE', { streamId }),
  // profile: (username: string) => createDeepLink('PROFILE', { username }),
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
    
    // Match against known patterns
    if (pathParts[0] === 'stream' && pathParts[1]) {
      return { type: 'stream', params: { videoId: pathParts[1] } };
    }
    
    if (pathParts[0] === 'feeds' && pathParts[1]) {
      return { type: 'feed', params: { postId: pathParts[1] } };
    }
    
    // TODO: Uncomment when ready
    // if (pathParts[0] === 'live' && pathParts[1]) {
    //   return { type: 'live', params: { streamId: pathParts[1] } };
    // }
    // 
    // if (pathParts[0] === 'profile' && pathParts[1]) {
    //   return { type: 'profile', params: { username: pathParts[1] } };
    // }
    
    // Query params
    return {
      type: pathParts[0] || 'unknown',
      params: parsed.queryParams as Record<string, string> || {},
    };
  } catch (error) {
    logger.error('Failed to parse deep link', { url, error });
    return null;
  }
};

export default linkingConfig;
