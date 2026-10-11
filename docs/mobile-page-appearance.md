# Mobile page appearance contracts

The reference is the phone layout on https://dehub.io. Web remains the source of the semantic icon pack and page-kit materials. Native behavior, keyboard handling, uploads, payments, and platform media controls remain in their existing handlers.

Ordinary pages use a title island in every mobile theme. Direct/public conversations use flat header chrome. Media and profile covers use explicit controls over their content. Settings and Features retain their searches and tab/filter rows inside the navigation material. Page sections use full-width hairlines on System, Immersive, and Minimal; canvas themes retain their card material. Primary and quiet page actions use the control material, while selected tabs retain the accent. Drawers and pickers use the active theme's legible panel material.

The table below is source coverage, not a claim that every private or data-dependent state has been exercised on a device. Cloud regression tests cover header visibility, section/button/panel materials, disabled actions, artwork keys, search navigation, and modal dismissal. Device checks must additionally cover a flat theme, a canvas theme, keyboard-open messaging, and representative settings/picker flows after the Android publication.

Thirty-nine additional card and picker surfaces use `ThemePanel`, preserving their dimensions, refs, and handlers. These include Ads, Chess, Cinema, Creator Flow, DePIN, Features, Saved Posts, Work, active sessions, follow/repost lists, editor text prompts, offline states, search results, TV pairing/requests, the upload queue, upload audio/poll panels, and post error states. Floating canvas-theme panels retain an opaque base so text behind the panel cannot interfere with its content. The exchange's intentional slate trading surface retains its web palette.

| Screen source | Appearance contract |
| --- | --- |
| `screens/AccountSettingsScreen.tsx` | Settings title island, search, icon tabs, shared settings panel |
| `screens/AccountsScreen.tsx` | Title island and page-kit sections/actions |
| `screens/ActiveSessionsScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/AdsScreen.tsx` | Title island and page-kit sections/actions |
| `screens/AffiliateScreen.tsx` | Title island and page-kit sections/actions |
| `screens/AgentsScreen.tsx` | Title island and page-kit sections/actions |
| `screens/AgentTasksPanel.tsx` | Nested page sections and page actions |
| `screens/AIChatScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/AppsScreen.tsx` | Title island and page-kit sections/actions |
| `screens/ArcadeChessOnlineScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/ArcadeGameScreen.tsx` | Embedded content with its own media/application canvas |
| `screens/ArcadeScreen.tsx` | Title island and page-kit sections/actions |
| `screens/auth/ImportWalletScreen.tsx` | Authentication flow and shared controls; native wallet/sign-in behavior |
| `screens/auth/OnboardingScreen.tsx` | Authentication flow and shared controls; native wallet/sign-in behavior |
| `screens/auth/SetProfileScreen.tsx` | Authentication flow and shared controls; native wallet/sign-in behavior |
| `screens/auth/SignInScreen.tsx` | Authentication flow and shared controls; native wallet/sign-in behavior |
| `screens/BridgeScreen.tsx` | Title island and page-kit sections/actions |
| `screens/BuilderPreviewScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/BuilderScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/CareersScreen.tsx` | Title island and page-kit sections/actions |
| `screens/ChatScreen.tsx` | Flat conversation header and messaging surfaces |
| `screens/CinemaScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/CommandCentreScreen.tsx` | Title island and page-kit sections/actions |
| `screens/CommunitiesScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/CommunityDetailScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/CommunityInviteScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/ConnectGuideScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/ConnectScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/ConverterScreen.tsx` | Title island and page-kit sections/actions |
| `screens/CreatorFlowScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/CreatorFlowViewScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/CreatorScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/CreatorsScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/DaoScreen.tsx` | Title island and page-kit sections/actions |
| `screens/DePinScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/DexPoolScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/DexScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/DirectMessagesScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/DpayScreen.tsx` | Title island and page-kit sections/actions |
| `screens/DraftsScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/EarningsScreen.tsx` | Title island and page-kit sections/actions |
| `screens/EditProfileScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/EventsScreen.tsx` | Title island and page-kit sections/actions |
| `screens/FeatureRequestsScreen.tsx` | Features navigation material, search, tabs, filters, request cards |
| `screens/FeedbackScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/FeedDetailScreen.tsx` | Controls over post content; intentional media surfaces |
| `screens/FeedScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/FollowListScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/FractionsScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/FullscreenVideoScreen.tsx` | Media viewer/feed with deliberate media darkness and shared controls |
| `screens/GlossaryScreen.tsx` | Title island and page-kit sections/actions |
| `screens/GovernanceProposalScreen.tsx` | Title island and page-kit sections/actions |
| `screens/GovernanceScreen.tsx` | Title island and page-kit sections/actions |
| `screens/GuideScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/HomeScreen.tsx` | Home header, navigation pill, themed feed cards |
| `screens/ImageFeedScreen.tsx` | Media viewer/feed with deliberate media darkness and shared controls |
| `screens/ImageViewerScreen.tsx` | Media viewer/feed with deliberate media darkness and shared controls |
| `screens/LaunchpadCoinScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/LaunchpadCreateScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/LaunchpadScreen.tsx` | Title island and page-kit sections/actions |
| `screens/LeaderboardScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/LikedVideosScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/ListingDetailScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/LiveChatInfoScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/LiveChatScreen.tsx` | Flat public-chat header and messaging surfaces |
| `screens/LiveProducerScreen.tsx` | Production header and shared themed controls/pickers |
| `screens/LiveViewerScreen.tsx` | Media viewer/feed with deliberate media darkness and shared controls |
| `screens/MaboroshiScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/MediaEditorScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/MigrateScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/MiniAppScreen.tsx` | Embedded content with its own media/application canvas |
| `screens/MyLibraryScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/NoInternetScreen.tsx` | Offline status surface |
| `screens/NotificationScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/NotificationSettingsScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/PackScreen.tsx` | Title island and page-kit sections/actions |
| `screens/PacksScreen.tsx` | Title island and page-kit sections/actions |
| `screens/PostInfoScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/PostResolverScreen.tsx` | Theme-aware resolver/loading surface |
| `screens/PremiumScreen.tsx` | Title island and page-kit sections/actions |
| `screens/PricingScreen.tsx` | Title island and page-kit sections/actions |
| `screens/PrivacySettingsScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/ProfileScreen.tsx` | Collapsing profile header and controls over the cover |
| `screens/PromptScreen.tsx` | Title island and the existing prompt/tuning flow |
| `screens/RaffleScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/RepostQuoteListScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/SavedPostsScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/SearchScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/ShortsViewerScreen.tsx` | Media viewer/feed with deliberate media darkness and shared controls |
| `screens/SignInTvScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/SplashScreen.tsx` | Platform boot surface |
| `screens/StagesScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/StatsScreen.tsx` | Title island and page-kit sections/actions |
| `screens/StoreDetailScreen.tsx` | Title island and page-kit sections/actions |
| `screens/StoresScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/SuperPowersScreen.tsx` | Title island and page-kit sections/actions |
| `screens/Top100Screen.tsx` | Title island and page-kit sections/actions |
| `screens/TvRequestsScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/TVScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/UploadQueueScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/UploadScreen.tsx` | Existing specialized layout and shared themed controls |
| `screens/UsernamesScreen.tsx` | Title island and page-kit sections/actions |
| `screens/VideoPlayerScreen.tsx` | Media viewer/feed with deliberate media darkness and shared controls |
| `screens/WorkDisputesScreen.tsx` | Title island and page-kit sections/actions |
| `screens/WorkEditScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/WorkHistoryScreen.tsx` | Title island and page-kit sections/actions |
| `screens/WorkJobDetailScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/WorkPostScreen.tsx` | Title island and theme-aware page canvas/controls |
| `screens/WorkScreen.tsx` | Title island and page-kit sections/actions |
| `screens/YourVideosScreen.tsx` | Title island and theme-aware page canvas/controls |
