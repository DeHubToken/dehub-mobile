
import type { StackScreenProps, StackNavigationProp } from '@react-navigation/stack';
import type {
  BottomTabScreenProps as RNBottomTabScreenProps,
  BottomTabNavigationProp,
} from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, CompositeNavigationProp, NavigatorScreenParams } from '@react-navigation/native';
import { ScreenNames } from './ScreenNames';

export type RootStackParamList = {
  [ScreenNames.App]: NavigatorScreenParams<AppStackParamList> | undefined;
  [ScreenNames.Auth]: NavigatorScreenParams<AuthStackParamList> | undefined;
  [ScreenNames.Test]: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = StackScreenProps<
  RootStackParamList,
  T
>;

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

export type AppStackParamList = {
  [ScreenNames.Root]: NavigatorScreenParams<BottomTabParamList> | undefined;
  [ScreenNames.Upload]: {
    tab?: 'feed' | undefined;
    draft?: import('../hooks/useDrafts').Draft;
    quotedTokenId?: number | string;
    quotedPost?: Record<string, unknown>;
  } | undefined;
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
    imageUrl?: string;
    images?: (string | { uri: string })[];
    initialIndex?: number;
    index?: number;
    allowDownload?: boolean;
  };
  [ScreenNames.Chat]: {
    conversationId?: string;
    targetAddress?: string;
    targetUser?: Record<string, unknown>;
    title?: string;
  };
  [ScreenNames.Search]: {
    query?: string;
  } | undefined;
  [ScreenNames.AccountSettings]: undefined;
  [ScreenNames.ActiveSessions]: undefined;
  [ScreenNames.YourVideos]: undefined;
  [ScreenNames.LikedVideos]: undefined;
  [ScreenNames.SavedPosts]: undefined;
  [ScreenNames.EditProfile]: undefined;
  [ScreenNames.Dpay]: undefined;
  [ScreenNames.PrivacySettings]: undefined;
  [ScreenNames.UploadQueue]: undefined;
  [ScreenNames.Drafts]: undefined;
  [ScreenNames.SignIn]: undefined; // Modal sign-in from app
  [ScreenNames.FollowList]: {
    address: string;
    username?: string;
    initialTab?: 'followers' | 'following';
    hideFollowers?: boolean;
    isOwnProfile?: boolean;
  };
  [ScreenNames.RepostQuoteList]: {
    tokenId: number | string;
    initialTab?: 'reposts' | 'quotes';
    repostCount?: number;
    quoteCount?: number;
  };
  [ScreenNames.LiveChat]: undefined;
  [ScreenNames.FullscreenVideo]: {
    videoUrl: string;
    startTime?: number;
    isMuted?: boolean;
    thumbnail?: string;
    tokenId?: string | number;
    isSignedIn?: boolean;
  };
  [ScreenNames.ShortsViewer]: {
    initialIndex?: number;
    initialItems?: import('../services/feed.unified.service').UnifiedFeedItem[];
    feedParams?: Record<string, any>;
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

export type BottomTabParamList = {
  [ScreenNames.Home]: undefined;
  [ScreenNames.DM]: undefined;
  [ScreenNames.UploadTab]: undefined;
  [ScreenNames.AIChat]: undefined;
  [ScreenNames.Explore]: undefined;
};

export type BottomTabScreenProps<T extends keyof BottomTabParamList> = CompositeScreenProps<
  RNBottomTabScreenProps<BottomTabParamList, T>,
  AppStackScreenProps<keyof AppStackParamList>
>;

export type AppNavigationProp = AppStackNavigationProp<keyof AppStackParamList>;

export type UseNavigationType = AppStackNavigationProp<keyof AppStackParamList>;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
