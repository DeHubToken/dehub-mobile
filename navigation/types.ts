/**
 * Navigation Type Definitions
 * 
 * This file contains all TypeScript type definitions for the navigation system.
 * Using proper types ensures compile-time safety when navigating between screens.
 */

import type { StackScreenProps, StackNavigationProp } from '@react-navigation/stack';
import type {
  BottomTabScreenProps as RNBottomTabScreenProps,
  BottomTabNavigationProp,
} from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, CompositeNavigationProp, NavigatorScreenParams } from '@react-navigation/native';
import { ScreenNames } from './ScreenNames';

// =============================================================================
// Root Navigator Types
// =============================================================================

export type RootStackParamList = {
  [ScreenNames.App]: NavigatorScreenParams<AppStackParamList> | undefined;
  [ScreenNames.Auth]: NavigatorScreenParams<AuthStackParamList> | undefined;
  [ScreenNames.Test]: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = StackScreenProps<
  RootStackParamList,
  T
>;

// =============================================================================
// Auth Navigator Types
// =============================================================================

export type AuthStackParamList = {
  [ScreenNames.Onboarding]: undefined;
  [ScreenNames.SignIn]: undefined;
  [ScreenNames.SetProfile]: undefined;
  [ScreenNames.ImportWallet]: undefined;
};

export type AuthStackScreenProps<T extends keyof AuthStackParamList> = CompositeScreenProps<
  StackScreenProps<AuthStackParamList, T>,
  RootStackScreenProps<keyof RootStackParamList>
>;

// =============================================================================
// App Navigator Types (Main Stack)
// =============================================================================

export type AppStackParamList = {
  [ScreenNames.Root]: NavigatorScreenParams<BottomTabParamList> | undefined;
  [ScreenNames.Upload]: { tab?: 'feed' | undefined; draft?: import('../hooks/useDrafts').Draft } | undefined;
  [ScreenNames.VideoPlayer]: {
    videoId?: string;
    sourceUrl?: string;
    title?: string;
    autoplay?: boolean;
  };
  [ScreenNames.LiveProducer]: {
    streamId?: string;
    tokenId?: number;
    ingestUrl?: string;
    streamKey?: string;
  } | undefined;
  [ScreenNames.LiveViewer]: {
    streamId?: string;
    playbackId?: string;
    hostUsername?: string;
  };
  [ScreenNames.Leaderboard]: undefined;
  [ScreenNames.Notifications]: undefined;
  [ScreenNames.NotificationSettings]: undefined;
  [ScreenNames.Feed]: undefined;
  [ScreenNames.PostResolver]: {
    tokenId?: string;
    postId?: string;
    commentId?: string;
  };
  [ScreenNames.FeedDetail]: {
    postId?: string;
    tokenId?: string;
    commentId?: string;
  };
  [ScreenNames.ImageViewer]: {
    imageUrl: string;
    images?: string[];
    initialIndex?: number;
  };
  [ScreenNames.Chat]: {
    recipientId: string;
    recipientUsername?: string;
  };
  [ScreenNames.Search]: {
    query?: string;
  } | undefined;
  [ScreenNames.AccountSettings]: undefined;
  [ScreenNames.YourVideos]: undefined;
  [ScreenNames.LikedVideos]: undefined;
  [ScreenNames.SavedPosts]: undefined;
  [ScreenNames.EditProfile]: undefined;
  [ScreenNames.Dpay]: undefined;
  [ScreenNames.PrivacySettings]: undefined;
  [ScreenNames.Drafts]: undefined;
  [ScreenNames.SignIn]: undefined; // Modal sign-in from app
  [ScreenNames.FollowList]: {
    address: string;
    username?: string;
    initialTab?: 'followers' | 'following';
    hideFollowers?: boolean;
    isOwnProfile?: boolean;
  };
};

export type AppStackScreenProps<T extends keyof AppStackParamList> = CompositeScreenProps<
  StackScreenProps<AppStackParamList, T>,
  RootStackScreenProps<keyof RootStackParamList>
>;

export type AppStackNavigationProp<T extends keyof AppStackParamList> = CompositeNavigationProp<
  StackNavigationProp<AppStackParamList, T>,
  StackNavigationProp<RootStackParamList>
>;

// =============================================================================
// Bottom Tab Navigator Types
// =============================================================================

export type BottomTabParamList = {
  [ScreenNames.Home]: undefined;
  [ScreenNames.Feed]: undefined;
  [ScreenNames.UploadTab]: undefined;
  [ScreenNames.DM]: undefined;
  [ScreenNames.Profile]: undefined;
};

export type BottomTabScreenProps<T extends keyof BottomTabParamList> = CompositeScreenProps<
  RNBottomTabScreenProps<BottomTabParamList, T>,
  AppStackScreenProps<keyof AppStackParamList>
>;

// =============================================================================
// Convenience Types for Components
// =============================================================================

/**
 * Generic navigation prop that can be used in components that don't need
 * specific screen params. Prefer using screen-specific props when possible.
 */
export type AppNavigationProp = AppStackNavigationProp<keyof AppStackParamList>;

/**
 * Type helper for useNavigation hook
 * Usage: const navigation = useNavigation<UseNavigationType>();
 */
export type UseNavigationType = AppStackNavigationProp<keyof AppStackParamList>;

// =============================================================================
// Declaration Merge for useNavigation type inference
// =============================================================================

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
