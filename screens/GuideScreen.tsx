/**
 * GuideScreen
 * ===========
 * Native port of the web GuidePage (/guide). A step-by-step walkthrough of every
 * feature, as expandable sections with search. Pure static content — no API.
 * Content and wording mirror the web app.
 */
import React, { useMemo, useState, useCallback } from "react";
import { View, Text, TextInput, ScrollView, StyleSheet, Pressable, LayoutAnimation, Platform, UIManager } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon, { type IconName } from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface GuideSection {
  id: string;
  title: string;
  icon: IconName;
  intro: string;
  steps: string[];
  tips?: string[];
}

const SECTIONS: GuideSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: "LogIn",
    intro: "DeHub supports two ways to sign in: social login via Web3Auth (email, Google, X, etc.) or connecting an external wallet like MetaMask. Social-login users get a smart account — the platform covers all gas fees. External-wallet users need to hold gas on the relevant chain.",
    steps: [
      "Visit dehub.io and click 'Launch App' or navigate to /app.",
      "Choose 'Sign In' — you'll see social login options (Google, X, Email, etc.) and a 'Connect Wallet' option for external wallets.",
      "If using social login, complete the sign-in flow. A smart account is created for you automatically.",
      "If connecting an external wallet, approve the connection in your wallet extension or mobile app.",
      "After signing in, you'll be prompted to set a username. This is required to interact on the platform.",
      "You're in! Explore the feed, set up your profile, and start posting.",
    ],
    tips: [
      "Social-login users never pay gas — DeHub covers it via account abstraction.",
      "External-wallet users need gas on the chain they're interacting with.",
      "You can copy your wallet address from the sidebar or your profile page.",
    ],
  },
  {
    id: "home-feed",
    title: "Home Feed",
    icon: "House",
    intro: "The home feed is where you see posts from people you follow and trending content. It supports multiple content-type tabs and sorting options.",
    steps: [
      "Navigate to /app — this is your home feed.",
      "Use the top tabs to filter by content type: Home (all), Videos, Images, Shorts, Music, or Live streams.",
      "Swipe left/right on the tabs to see more options on mobile.",
      "Use the filter/sort button (top-right of the feed) to change sorting: Hot, New, or Top.",
      "Pull down to refresh the feed on mobile.",
      "Scroll down to load more posts automatically (infinite scroll).",
      "Toggle between Grid and Feed view using the layout switcher.",
    ],
    tips: [
      "Grid view is great for browsing images quickly.",
      "The 'Home' tab shows all content types mixed together.",
      "Live tab shows currently active live streams.",
    ],
  },
  {
    id: "creating-posts",
    title: "Creating Posts",
    icon: "SquarePen",
    intro: "Create text posts, share images, videos, voice notes, GIFs, and more. Use hashtags, cashtags, and mentions to increase reach.",
    steps: [
      "Click the 'Post' button in the sidebar (desktop) or the + button (mobile).",
      "Type your text in the compose area.",
      "To add an image or video, click the media icon and select a file.",
      "To record a voice note, click the microphone icon.",
      "To add a GIF, click the GIF icon and search for one.",
      "Use #hashtags to categorize your post (e.g., #crypto, #defi).",
      "Use $cashtags to reference tokens (e.g., $DHB, $ETH).",
      "Use @mentions to tag other users (e.g., @username).",
      "Click 'Post' to publish. Your post appears in the feed immediately.",
    ],
    tips: [
      "Posts support markdown-style formatting.",
      "You can quote-post by clicking the repost icon on any post and selecting 'Quote'.",
      "Categories (hashtags) appear in the 'Talk of the Town' leaderboard.",
    ],
  },
  {
    id: "interacting-with-posts",
    title: "Interacting with Posts",
    icon: "ThumbsUp",
    intro: "Engage with content by voting, commenting, tipping, bookmarking, sharing, and translating.",
    steps: [
      "Upvote or downvote a post using the arrow icons on the left side of any post.",
      "Click the comment icon to open the comment section and leave a reply.",
      "Click the gem/tip icon to send a DHB tip to the post creator.",
      "Click the bookmark icon to save a post for later.",
      "Click the share icon to copy the post link or share externally.",
      "Click the translate button (globe icon) on any post to translate text to your language.",
      "For image posts, use the 'Translate Image' button to get an AI-translated version of text within the image.",
      "Click on any post to open it in full-screen single-post view.",
    ],
    tips: [
      "Tips go directly to the creator's wallet in DHB tokens.",
      "You can set a tip amount via quick-select buttons or enter a custom amount.",
      "Bookmarked posts are accessible from the Bookmarks page in the sidebar.",
    ],
  },
  {
    id: "explore-search",
    title: "Explore & Search",
    icon: "Search",
    intro: "Discover new content and users through the explore page and powerful search functionality.",
    steps: [
      "Navigate to /app/explore from the sidebar.",
      "Use the search bar at the top to search for users, posts, or content.",
      "Filter results by tab: All, People, Posts, Images, Videos, Music, Live.",
      "Browse trending topics and categories on the explore page.",
      "Click on a trending topic to see all related posts.",
      "Click on a user in search results to visit their profile.",
    ],
    tips: [
      "Search supports usernames, wallet addresses, and content keywords.",
      "Trending topics update based on recent posting activity.",
    ],
  },
  {
    id: "profile",
    title: "Profile",
    icon: "User",
    intro: "Your profile showcases your posts, followers, following, and wallet information.",
    steps: [
      "Click your avatar or 'Profile' in the sidebar to view your profile.",
      "Click 'Edit Profile' to update your display name, bio, and avatar.",
      "Upload a profile picture by clicking on your avatar in edit mode.",
      "View your follower and following counts on your profile page.",
      "Browse your own posts, media, and liked content via the profile tabs.",
      "Copy your wallet address by clicking the copy icon next to it.",
      "Visit other users' profiles by clicking their username or avatar anywhere on the platform.",
    ],
    tips: [
      "Your username is unique and appears in your profile URL (dehub.io/@username).",
      "Privacy settings let you control who can see your follower counts.",
    ],
  },
  {
    id: "messages",
    title: "Messages",
    icon: "MessageCircle",
    intro: "Send direct messages to other users on the platform.",
    steps: [
      "Click 'Messages' in the sidebar to open the messaging page.",
      "Click the compose button to start a new conversation.",
      "Search for a user by username to message them.",
      "Type your message and press send.",
      "View your conversation history in the messages list.",
      "Click on a conversation to continue chatting.",
    ],
    tips: [
      "You'll receive a notification when someone messages you.",
      "Creators can lock messages behind a tip requirement.",
    ],
  },
  {
    id: "ai-assistant",
    title: "AI Assistant",
    icon: "Bot",
    intro: "Chat with DeHub's built-in AI assistant for help, information, and creative tasks.",
    steps: [
      "Click 'Assistant' in the sidebar to open the AI chat.",
      "Type your question or request in the chat input.",
      "The AI can help with crypto information, platform questions, and general knowledge.",
      "Start a new conversation by clicking the new chat button.",
      "View your conversation history in the sidebar of the assistant page.",
      "You can attach images for the AI to analyze.",
    ],
    tips: [
      "The AI remembers context within a conversation.",
      "You can ask the AI about DeHub features, crypto terms, or general questions.",
      "Previous conversations are saved and accessible anytime.",
    ],
  },
  {
    id: "notifications",
    title: "Notifications",
    icon: "Bell",
    intro: "Stay updated with likes, comments, tips, follows, and other activity on your content.",
    steps: [
      "Click the bell icon or 'Notifications' in the sidebar.",
      "View all notifications in a chronological list.",
      "Click on a notification to navigate to the related content.",
      "Notifications include: new followers, post votes, comments, tips, and mentions.",
      "Unread notifications are highlighted — they mark as read when viewed.",
    ],
    tips: [
      "The notification badge shows the count of unread notifications.",
      "Tip notifications show the amount of DHB you received.",
    ],
  },
  {
    id: "wallet",
    title: "Wallet",
    icon: "Wallet",
    intro: "View your DHB balances across multiple chains, check staking deposits, and manage your assets.",
    steps: [
      "Click 'Wallet' in the sidebar to open the wallet page.",
      "View your total DHB balance aggregated across all supported chains.",
      "See per-chain breakdowns: Ethereum, Base, BNB Chain, and more.",
      "Check your staking deposits and rewards.",
      "Click 'Refresh Scan' to update your balances from on-chain data.",
      "Copy your wallet address to receive tokens from others.",
    ],
    tips: [
      "Balances update automatically but you can force a refresh anytime.",
      "The wallet shows both liquid (available) and staked balances.",
    ],
  },
  {
    id: "staking",
    title: "Staking",
    icon: "Landmark",
    intro: "Stake your DHB tokens to earn rewards and increase your governance voting power.",
    steps: [
      "Navigate to the 'Staking' page from the sidebar.",
      "Enter the amount of DHB you want to stake.",
      "Select the chain you want to stake on.",
      "Confirm the transaction in your wallet (external wallets) or it auto-executes (social login).",
      "View your staked amounts and any pending rewards.",
      "To unstake, enter the amount and confirm the unstaking transaction.",
    ],
    tips: [
      "Staking increases your vote weight in governance proposals.",
      "Social-login users don't need gas to stake — it's gasless.",
      "You can stake on multiple chains simultaneously.",
    ],
  },
  {
    id: "leaderboard",
    title: "Leaderboard",
    icon: "Trophy",
    intro: "See who's on top! The leaderboard ranks users by balance, daily spending, and trending topics.",
    steps: [
      "Navigate to the 'Leaderboard' page from the sidebar.",
      "Switch between tabs: Balance, Daily Spent, and Talk of the Town.",
      "Balance tab ranks users by their total DHB holdings.",
      "Daily Spent tab shows who's been most active tipping in the last 24 hours.",
      "Talk of the Town shows the most-discussed topics/categories.",
      "Click on any user to visit their profile.",
      "The leaderboard updates periodically throughout the day.",
    ],
    tips: [
      "Daily rankings reset every 24 hours.",
      "Talk of the Town tracks single-word categories from hashtags.",
    ],
  },
  {
    id: "command-centre",
    title: "Command Centre",
    icon: "LayoutDashboard",
    intro: "A dashboard overview showing your key metrics and platform activity at a glance.",
    steps: [
      "Click 'Command Centre' in the sidebar.",
      "View your profile summary, including post count, followers, and engagement.",
      "See your recent activity and trending topics.",
      "Access quick links to commonly used features.",
    ],
    tips: ["The Command Centre gives you a bird's-eye view of your DeHub presence."],
  },
  {
    id: "governance",
    title: "Governance",
    icon: "Vote",
    intro: "Participate in platform governance by creating proposals and voting on community decisions.",
    steps: [
      "Navigate to 'Governance' from the sidebar.",
      "Browse active proposals submitted by the community.",
      "Click on a proposal to read its full description and discussion.",
      "Vote on proposals using the thumbs up/down buttons — your vote weight depends on your DHB stake.",
      "Leave comments on proposals to discuss with the community.",
      "Submit your own proposal by clicking the 'Create Proposal' button.",
    ],
    tips: [
      "Your voting power is determined by your staked DHB amount.",
      "Badge holders may get additional vote weight.",
      "Proposals go through stages: Active → Passed/Rejected.",
    ],
  },
  {
    id: "bookmarks",
    title: "Bookmarks",
    icon: "Bookmark",
    intro: "Save posts to your bookmarks for easy access later.",
    steps: [
      "Click the bookmark icon on any post to save it.",
      "Navigate to 'Bookmarks' in the sidebar to view all saved posts.",
      "Click on a bookmarked post to view it in full.",
      "Remove a bookmark by clicking the bookmark icon again.",
    ],
    tips: [
      "Bookmarks are private — only you can see your saved posts.",
      "There's no limit to how many posts you can bookmark.",
    ],
  },
  {
    id: "settings",
    title: "Settings",
    icon: "Settings",
    intro: "Customize your DeHub experience with language, privacy, and display preferences.",
    steps: [
      "Click 'Settings' in the sidebar.",
      "Change your display language from the language selector.",
      "Adjust privacy settings: control who sees your follower counts and following list.",
      "Set your default post visibility preferences.",
      "Manage notification preferences.",
    ],
    tips: [
      "DeHub supports multiple languages — the entire interface translates.",
      "Privacy settings apply immediately.",
    ],
  },
  {
    id: "buying-dhb",
    title: "Buying DHB",
    icon: "ShoppingCart",
    intro: "Buy DHB tokens directly within the app using the built-in swap interface.",
    steps: [
      "Navigate to the 'Buy' page from the sidebar.",
      "Select the token you want to swap from (e.g., ETH, USDC).",
      "Enter the amount you want to spend or the amount of DHB you want to receive.",
      "Review the exchange rate and estimated output.",
      "Click the settings gear icon to adjust slippage tolerance (default is 1%).",
      "Confirm the swap transaction.",
      "DHB tokens will appear in your wallet once the transaction completes.",
    ],
    tips: [
      "Higher slippage tolerance = more likely to execute, but potential for worse pricing.",
      "Always check the exchange rate before confirming.",
      "You can set custom slippage in the settings panel.",
    ],
  },
  {
    id: "bridge",
    title: "Bridge",
    icon: "ArrowLeftRight",
    intro: "Move your DHB tokens between supported blockchains using the cross-chain bridge.",
    steps: [
      "Navigate to the 'Bridge' page from the sidebar.",
      "Select the source chain (where your DHB currently is).",
      "Select the destination chain (where you want to send DHB).",
      "Enter the amount of DHB to bridge.",
      "Review the bridge fee and estimated arrival time.",
      "Confirm the bridge transaction.",
      "Wait for the transaction to complete — bridging may take a few minutes.",
    ],
    tips: [
      "Bridge fees vary by chain pair.",
      "Bridging typically takes 1-5 minutes depending on the chains involved.",
      "Always double-check the destination chain before confirming.",
    ],
  },
  {
    id: "music-tv",
    title: "Music & TV",
    icon: "Music",
    intro: "Enjoy media content directly within DeHub — stream music and watch live TV channels.",
    steps: [
      "Navigate to 'Music' from the sidebar to browse and play music posts.",
      "Navigate to 'TV' to access live TV channels.",
      "Browse channels by category or country.",
      "Click on a channel to start watching.",
      "Use the player controls to adjust volume and playback.",
      "Report broken channels using the report button.",
    ],
    tips: [
      "TV channels are community-verified for reliability.",
      "Music posts can be played while browsing other content.",
    ],
  },
  {
    id: "post-info",
    title: "Posts & Fractions",
    icon: "BookOpen",
    intro: "Every minted post on DeHub is an NFT split into fractions, so a post can be co-owned. On mobile you can see your holdings; buying, selling and offers happen on the web app.",
    steps: [
      "Tap the info icon on any post to open its mint transaction on the block explorer and verify the on-chain record.",
      "Open a profile and switch to the Fractions tab to see which posts that account holds fractions of, with quantities.",
      "Your own Fractions tab is the same view of everything you co-own.",
    ],
    tips: [
      "Every post starts with the creator holding all of its fractions (100% ownership).",
      "The mint transaction links to the block explorer for the chain the post was minted on.",
    ],
  },
  {
    id: "trading-fractions",
    title: "Trading Fractions",
    icon: "ShoppingCart",
    intro: "Fraction trading — browsing listings, making offers, listing your own — lives on the web app at dehub.io, on each post's Post Info page.",
    steps: [
      "Open dehub.io in a browser and sign in with the same account.",
      "Open the post's Post Info page and switch to its Marketplace tab.",
      "Browse listings, make an offer at your price, or list fractions you hold.",
      "Once a trade completes, the change shows up in your Fractions tab here on mobile.",
    ],
    tips: [
      "Owning fractions of a post means you hold a share of that on-chain NFT.",
      "Check a post's holders on the web marketplace to see ownership distribution before buying.",
      "As a creator, selling fractions lets fans co-own your content.",
    ],
  },
  {
    id: "minting-posts",
    title: "Minting Posts (Creating NFTs)",
    icon: "SquarePen",
    intro: "When you create a post on DeHub, it's automatically minted as an NFT on the blockchain. You don't need to do anything special — every post is an NFT.",
    steps: [
      "Click the 'Post' button in the sidebar (desktop) or the + button (mobile).",
      "Write your text, attach media (images, videos, audio), and add categories.",
      "Click 'Post' to publish — your content is immediately minted as an NFT on the Base blockchain.",
      "Each minted post gets a unique Token ID and a transaction hash you can verify on-chain.",
      "You automatically receive all 100 fractions (100% ownership) of your newly minted post.",
      "View your post's on-chain details anytime by tapping the info icon on the post.",
    ],
    tips: [
      "Social-login users pay zero gas — DeHub sponsors all minting fees.",
      "External-wallet users need ETH on Base for gas.",
      "Once minted, the on-chain record is permanent even if the post is later deleted from the feed.",
      "You can change your post's visibility after minting (Public, Unlisted, or Private).",
    ],
  },
  {
    id: "glossary",
    title: "Glossary",
    icon: "BookOpen",
    intro: "A comprehensive glossary of crypto and platform terminology to help you navigate Web3.",
    steps: [
      "Navigate to 'Glossary' from the sidebar.",
      "Browse terms alphabetically or use the search to find specific terms.",
      "Click on a term to see its full definition and explanation.",
      "Terms cover crypto concepts, DeFi terminology, and DeHub-specific features.",
    ],
    tips: [
      "Great resource for newcomers to crypto and Web3.",
      "The glossary is regularly updated with new terms.",
    ],
  },
];

function sectionMatches(section: GuideSection, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const haystack = [section.title, section.intro, ...section.steps, ...(section.tips || [])]
    .join(" ")
    .toLowerCase();
  return tokens.every((tok) => haystack.includes(tok));
}

export default function GuideScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([SECTIONS[0].id]));

  const tokens = useMemo(
    () => query.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [query],
  );

  const filtered = useMemo(() => SECTIONS.filter((s) => sectionMatches(s, tokens)), [tokens]);

  const toggle = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <View style={styles.root}>
      <ScreenHeader title="Guide" subtitle="Step-by-step walkthrough of every feature" />

      {/* Search */}
      <View style={styles.searchWrap}>
        <Icon name="Search" size={16} color="#71717A" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search the guide..."
          placeholderTextColor="#8B8D90"
          style={styles.searchInput}
          autoCorrect={false}
        />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 24, paddingTop: 8, gap: 8 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {filtered.length > 0 ? (
          filtered.map((section) => {
            const isOpen = expanded.has(section.id) || tokens.length > 0;
            return (
              <View key={section.id} style={styles.section}>
                <Pressable
                  style={styles.sectionHeader}
                  onPress={() => toggle(section.id)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                >
                  <View style={styles.sectionIcon}>
                    <Icon name={section.icon} size={18} color="#FFFFFF" strokeWidth={1.8} />
                  </View>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <Icon name={isOpen ? "ChevronUp" : "ChevronDown"} size={18} color="#71717A" />
                </Pressable>

                {isOpen && (
                  <View style={styles.sectionBody}>
                    <Text style={styles.intro}>{section.intro}</Text>

                    {section.steps.map((step, i) => (
                      <View key={i} style={styles.stepRow}>
                        <View style={styles.stepNum}>
                          <Text style={styles.stepNumText}>{i + 1}</Text>
                        </View>
                        <Text style={styles.stepText}>{step}</Text>
                      </View>
                    ))}

                    {section.tips && section.tips.length > 0 && (
                      <View style={styles.tipsBox}>
                        {section.tips.map((tip, i) => (
                          <View key={i} style={styles.tipRow}>
                            <Icon name="Lightbulb" size={13} color="#D4D4D8" />
                            <Text style={styles.tipText}>{tip}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })
        ) : (
          <View style={styles.empty}>
            <Icon name="Search" size={28} color="#52525B" />
            <Text style={styles.emptyText}>No results for "{query}"</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 14, padding: 0 },
  section: {
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  sectionTitle: { flex: 1, color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  sectionBody: { paddingHorizontal: 12, paddingBottom: 14, gap: 10 },
  intro: { color: "#A1A1AA", fontSize: 13, lineHeight: 19 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  stepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
    marginTop: 1,
  },
  stepNumText: { color: "#E4E4E7", fontSize: 11, fontWeight: "700" },
  stepText: { flex: 1, color: "#D4D4D8", fontSize: 13, lineHeight: 19 },
  tipsBox: {
    marginTop: 2,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    gap: 6,
  },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  tipText: { flex: 1, color: "#D4D4D8", fontSize: 12, lineHeight: 17 },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 48 },
  emptyText: { color: "#71717A", fontSize: 13, marginTop: 12 },
});
