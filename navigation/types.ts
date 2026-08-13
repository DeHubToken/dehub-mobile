
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
    /** Body text to open the composer with, e.g. a scheduled stage announcement. */
    initialText?: string;
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
  /** `initialTab` lets the drawer's Staking entry deep-link straight to the stake tab. */
  [ScreenNames.Dpay]: { initialTab?: "buy" | "stake" | "bridge" | "solana" } | undefined;
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
  [ScreenNames.LiveChatInfo]: {
    room?: import('../services/livechat.service').LiveChatRoom;
    isModerator?: boolean;
    onlineCount?: number;
    participants?: import('../services/livechat.service').LiveChatUser[];
  } | undefined;
  /** No params = the signed-in user's own profile (drawer); push taps pass a target. */
  [ScreenNames.Profile]: { address?: string; username?: string } | undefined;
  [ScreenNames.Earnings]: undefined;
  [ScreenNames.MyLibrary]: undefined;
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
  [ScreenNames.ImageFeed]: {
    initialIndex?: number;
    initialItems?: import('../services/feed.unified.service').UnifiedFeedItem[];
    feedParams?: Record<string, any>;
  };
  [ScreenNames.Communities]: undefined;
  [ScreenNames.CommunityDetail]: { slug: string };
  [ScreenNames.CommunityInvite]: { code: string };
  [ScreenNames.Glossary]: undefined;
  [ScreenNames.Guide]: undefined;
  [ScreenNames.Arcade]: undefined;
  /** `slug` keys into ARCADE_GAMES; an unknown one renders the "no such game" panel. */
  [ScreenNames.ArcadeGame]: { slug: string };
  [ScreenNames.Events]: undefined;
  [ScreenNames.Careers]: undefined;
  [ScreenNames.Affiliate]: undefined;
  [ScreenNames.FeatureRequests]: undefined;
  [ScreenNames.Stores]: undefined;
  /** `listing` is the shared-item deep link (`/app/stores/<id>?listing=<id>`). */
  [ScreenNames.StoreDetail]: { storeId: string; listing?: string };
  /** `listing` seeds the detail screen from the browse grid so it paints instantly. */
  [ScreenNames.ListingDetail]: {
    listingId: string;
    listing?: import('../hooks/useStores').StoreListing;
  };
  [ScreenNames.CommandCentre]: undefined;
  [ScreenNames.Top100]: undefined;
  [ScreenNames.Ads]: undefined;
  [ScreenNames.Prompt]: undefined;
  [ScreenNames.TV]: undefined;
  [ScreenNames.Work]: undefined;
  /** `job` seeds the detail screen from the browse list so it paints instantly. */
  [ScreenNames.WorkJobDetail]: {
    jobId: string;
    job?: import('../hooks/useWork').WorkJob;
  };
  [ScreenNames.WorkPost]: undefined;
  [ScreenNames.Governance]: undefined;
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
  /** `initialPrompt` seeds the composer — used by the Prompt entry screen. */
  [ScreenNames.AIChat]: { initialPrompt?: string } | undefined;
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
