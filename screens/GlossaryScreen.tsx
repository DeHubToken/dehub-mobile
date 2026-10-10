import { translateCopy as _translateCopy } from '../i18n/copy';
import { useSurfaceDraft } from '../hooks/useSurfaceDraft';
/**
 * GlossaryScreen
 * ==============
 * Native port of the web GlossaryPage (/app/glossary). Explains every icon,
 * button and feature of the app. Pure static content + client-side search —
 * no API. Sections and wording mirror the web app.
 */
import React, { useMemo, useState } from "react";
import { View, Text, TextInput, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import { PageEmpty, PageSection } from "../components/page/PageKit";

/** Plain text, or an i18n key for a line that has already been translated. */
type Copy = string | { key: string };

interface GlossaryEntry {
  icon: IconName;
  title: string;
  description: Copy;
}

interface GlossarySection {
  title: string;
  entries: GlossaryEntry[];
}

interface ResolvedEntry extends Omit<GlossaryEntry, "description"> {
  description: string;
}

const SECTIONS: GlossarySection[] = [
  {
    get title() { return _translateCopy("copy.9677cceec070", { defaultValue: "Post Interactions" }); },
    entries: [
      { icon: "ThumbsUp", get title() { return _translateCopy("copy.5d2d039efd84", { defaultValue: "Thumbs Up (Like)" }); }, get description() { return _translateCopy("copy.ce3e77cea442", { defaultValue: "Shows you like or agree with a post. Increases the post's engagement score and helps it rank higher in the feed." }); } },
      { icon: "ThumbsDown", get title() { return _translateCopy("copy.c88d5b51caf0", { defaultValue: "Thumbs Down (Dislike)" }); }, get description() { return _translateCopy("copy.846ebd41bcef", { defaultValue: "Shows you dislike or disagree with a post. Hold the thumbs up and pick 👎, the last reaction in the tray. This feedback helps improve content recommendations." }); } },
      { icon: "MessageSquare", get title() { return _translateCopy("copy.44f5e3fbec57", { defaultValue: "Comment" }); }, get description() { return _translateCopy("copy.da90edc91f4a", { defaultValue: "Opens the comment section where you can reply to a post, join discussions, and interact with other users." }); } },
      { icon: "Share2", get title() { return _translateCopy("copy.29887a5ff984", { defaultValue: "Share" }); }, get description() { return _translateCopy("copy.dfc22c6b07ab", { defaultValue: "Share a post externally via a link, or copy the post URL to your clipboard to send to others." }); } },
      { icon: "Bookmark", get title() { return _translateCopy("copy.1bac4007880b", { defaultValue: "Bookmark" }); }, get description() { return _translateCopy("copy.f8d6b01ecf54", { defaultValue: "Save a post to your bookmarks for later. Access all saved posts from the Bookmarks page in the sidebar." }); } },
      { icon: "Gem", get title() { return _translateCopy("copy.a4245a3c4f56", { defaultValue: "Tip" }); }, description: { key: "screens.glossaryTipDesc" } },
      { icon: "Flag", get title() { return _translateCopy("copy.b6ce788d9786", { defaultValue: "Report" }); }, get description() { return _translateCopy("copy.773e51beddb6", { defaultValue: "Flag inappropriate or harmful content for review. Reports help keep the community safe." }); } },
      { icon: "Ellipsis", get title() { return _translateCopy("copy.762add13d2dd", { defaultValue: "More Options (⋯)" }); }, get description() { return _translateCopy("copy.88cbd2bd6f68", { defaultValue: "Opens additional actions like editing, deleting, or reporting a post." }); } },
    ],
  },
  {
    get title() { return _translateCopy("copy.6fbd766b1a71", { defaultValue: "Translation" }); },
    entries: [
      { icon: "Languages", get title() { return _translateCopy("copy.e3bb40bf97be", { defaultValue: "Translate Button" }); }, get description() { return _translateCopy("copy.c75004c6a69c", { defaultValue: "Translates post text, bios, and comments into your preferred language. The app auto-detects your language or you can set one manually in Settings." }); } },
      { icon: "RotateCcw", get title() { return _translateCopy("copy.f5f8313a3e8f", { defaultValue: "Show Original" }); }, get description() { return _translateCopy("copy.7082d395b8d2", { defaultValue: "After translating, tap this to revert back to the original language of the content." }); } },
    ],
  },
  {
    get title() { return _translateCopy("copy.aa21cfda3bbf", { defaultValue: "Content Types" }); },
    entries: [
      { icon: "Image", get title() { return _translateCopy("copy.98e7859fecd0", { defaultValue: "Image Post" }); }, get description() { return _translateCopy("copy.a9805864ceb9", { defaultValue: "A post containing one or more images. Images are stored on-chain as NFTs with a unique Token ID." }); } },
      { icon: "Video", get title() { return _translateCopy("copy.80557bda57d2", { defaultValue: "Video Post" }); }, get description() { return _translateCopy("copy.1710a2af3842", { defaultValue: "A post containing a video. Videos can be set to public, private, or pay-per-view (PPV)." }); } },
      { icon: "Radio", get title() { return _translateCopy("copy.7975f2a611d0", { defaultValue: "Live Stream" }); }, get description() { return _translateCopy("copy.0c08345acca1", { defaultValue: "A real-time broadcast. Viewers can watch, comment, and tip the streamer. Streams use low-latency HLS technology." }); } },
      { icon: "Play", get title() { return _translateCopy("copy.bc1b88907d3b", { defaultValue: "Audio" }); }, get description() { return _translateCopy("copy.1e5304270961", { defaultValue: "An audio post with a visual waveform player. Creators can upload music, podcasts, or voice recordings." }); } },
      { icon: "Mic", get title() { return _translateCopy("copy.c86fdb55e2fa", { defaultValue: "Audio Space" }); }, get description() { return _translateCopy("copy.3010b02a4030", { defaultValue: "A live audio room where users can speak, listen, and raise their hand to join the conversation." }); } },
    ],
  },
  {
    get title() { return _translateCopy("copy.39924344e766", { defaultValue: "Visibility & Access" }); },
    entries: [
      { icon: "LockOpen", get title() { return _translateCopy("copy.591935b15b1c", { defaultValue: "Public" }); }, get description() { return _translateCopy("copy.51f926834f07", { defaultValue: "Content visible to everyone. Anyone can view, like, and comment on public posts." }); } },
      { icon: "Lock", get title() { return _translateCopy("copy.c63eb6720c6e", { defaultValue: "Private" }); }, get description() { return _translateCopy("copy.04d02a85c7b9", { defaultValue: "Content only visible to you. Private posts are hidden from other users and the public feed." }); } },
      { icon: "Ticket", get title() { return _translateCopy("copy.1c1f651829b5", { defaultValue: "Pay-Per-View (PPV)" }); }, description: { key: "screens.glossaryPpvDesc" } },
      { icon: "Crown", get title() { return _translateCopy("copy.ad2cbb28a08f", { defaultValue: "Subscriber Only" }); }, get description() { return _translateCopy("copy.877e1e86bf2a", { defaultValue: "Content restricted to users who have subscribed to the creator's channel." }); } },
    ],
  },
  {
    get title() { return _translateCopy("copy.8eb58739cb35", { defaultValue: "On-Chain Post Details" }); },
    entries: [
      { icon: "Info", get title() { return _translateCopy("copy.3c1c1229f7a3", { defaultValue: "Mint Transaction" }); }, description: { key: "screens.glossaryMintTxDesc" } },
      { icon: "Hash", get title() { return _translateCopy("copy.15ef844f362f", { defaultValue: "Token ID" }); }, get description() { return _translateCopy("copy.29e67c672ae2", { defaultValue: "The unique on-chain identifier assigned when a post is minted as an NFT." }); } },
      { icon: "ExternalLink", get title() { return _translateCopy("copy.0cce4de1bf95", { defaultValue: "Transaction Hash" }); }, get description() { return _translateCopy("copy.3b76196efd42", { defaultValue: "The blockchain transaction hash from when the post was minted. Open it in the block explorer to verify the on-chain record." }); } },
      { icon: "EyeOff", get title() { return _translateCopy("copy.b42d2c19a678", { defaultValue: "Hidden Post" }); }, get description() { return _translateCopy("copy.ba9cdea7f89a", { defaultValue: "Post owners can hide a post from public feeds (and show it again) from the post's options menu. A hidden post stays visible to its owner, marked with a Hidden chip." }); } },
      { icon: "Pencil", get title() { return _translateCopy("copy.cc54b50c5162", { defaultValue: "Edit Post" }); }, get description() { return _translateCopy("copy.14623206ad2e", { defaultValue: "Post owners can edit the title, description, and categories from the post's options menu." }); } },
      { icon: "Ticket", get title() { return _translateCopy("copy.dbc6e9280cb5", { defaultValue: "PPV Purchases" }); }, get description() { return _translateCopy("copy.65f9597a741f", { defaultValue: "For pay-per-view posts you own, the live ribbon shows how many viewers have purchased access." }); } },
    ],
  },
  {
    get title() { return _translateCopy("copy.c1448858f4d7", { defaultValue: "Fractions & Ownership" }); },
    entries: [
      { icon: "ChartPie", get title() { return _translateCopy("copy.487aaa977933", { defaultValue: "Fractions" }); }, get description() { return _translateCopy("copy.2f7f38f2e370", { defaultValue: "Every minted post is an NFT split into fractions. The creator starts with all of them, representing 100% ownership of the content." }); } },
      { icon: "Users", get title() { return _translateCopy("copy.8a22ea8e4d1a", { defaultValue: "Your Holdings" }); }, get description() { return _translateCopy("copy.a6a88965826a", { defaultValue: "A profile's Fractions tab lists the posts that account co-owns and how many fractions of each. Your own tab is the same view of everything you hold." }); } },
      { icon: "Coins", get title() { return _translateCopy("copy.380d64545671", { defaultValue: "Fraction Marketplace" }); }, get description() { return _translateCopy("copy.e36c6ed4c9a7", { defaultValue: "Trading — listings, offers, sales — happens on the web app at dehub.io, on each post's Post Info page. Completed trades show up in the Fractions tab here." }); } },
    ],
  },
  {
    get title() { return _translateCopy("copy.0dbd9ab3c07a", { defaultValue: "Wallet & Tokens" }); },
    entries: [
      { icon: "Coins", get title() { return _translateCopy("copy.7cd63b610e6d", { defaultValue: "DeHub tokens" }); }, description: { key: "screens.glossaryDhbTokenDesc" } },
      { icon: "Wallet", get title() { return _translateCopy("copy.d1c9a01d57e9", { defaultValue: "Wallet" }); }, description: { key: "screens.glossaryWalletDesc" } },
      { icon: "ArrowUpDown", get title() { return _translateCopy("copy.6ec282d40a8a", { defaultValue: "Swap" }); }, get description() { return _translateCopy("copy.13e8618e9f6a", { defaultValue: "Exchange one token for another directly within the app. Swaps happen on-chain using decentralized exchanges." }); } },
      { icon: "TrendingUp", get title() { return _translateCopy("copy.5190ff487713", { defaultValue: "Staking" }); }, description: { key: "screens.glossaryStakingDesc" } },
      { icon: "Copy", get title() { return _translateCopy("copy.0cce4de1bf95", { defaultValue: "Transaction Hash" }); }, get description() { return _translateCopy("copy.520cf6869b44", { defaultValue: "A unique identifier for any on-chain transaction. Open it to view the full transaction details on a blockchain explorer." }); } },
    ],
  },
  {
    get title() { return _translateCopy("copy.feaf91211f32", { defaultValue: "Social Features" }); },
    entries: [
      { icon: "Users", get title() { return _translateCopy("copy.72507a1a8d13", { defaultValue: "Followers / Following" }); }, get description() { return _translateCopy("copy.e7644429fdad", { defaultValue: "Follow other users to see their posts in your feed. Your follower count is displayed on your profile." }); } },
      { icon: "Bell", get title() { return _translateCopy("copy.788011833a5a", { defaultValue: "Notifications" }); }, get description() { return _translateCopy("copy.869506b2aea3", { defaultValue: "Alerts for likes, comments, tips, follows, and other activity related to your account." }); } },
      { icon: "Send", get title() { return _translateCopy("copy.c61ca1c37c27", { defaultValue: "Direct Messages" }); }, get description() { return _translateCopy("copy.67581425b0e7", { defaultValue: "Private messages between users. Currently available on the mobile app with web support coming soon." }); } },
      { icon: "AtSign", get title() { return _translateCopy("copy.c15b93ef43c2", { defaultValue: "Mentions (@)" }); }, get description() { return _translateCopy("copy.0954e92b6ff1", { defaultValue: "Tag another user in a post or comment by typing @ followed by their username. They will receive a notification." }); } },
    ],
  },
  {
    get title() { return _translateCopy("copy.3db65f8c2a7d", { defaultValue: "Navigation" }); },
    entries: [
      { icon: "House", get title() { return _translateCopy("copy.8e1154092232", { defaultValue: "Home Feed" }); }, get description() { return _translateCopy("copy.f8f2edb787a3", { defaultValue: "Your main feed showing posts from people you follow and trending content." }); } },
      { icon: "Search", get title() { return _translateCopy("copy.3b73900b8d29", { defaultValue: "Explore" }); }, get description() { return _translateCopy("copy.de7f043f74a0", { defaultValue: "Discover new content and users. Browse by category: videos, images, live streams, and more." }); } },
      { icon: "Trophy", get title() { return _translateCopy("copy.31b471215872", { defaultValue: "Leaderboard" }); }, get description() { return _translateCopy("copy.f4697afb34f4", { defaultValue: "Rankings of top users by balance, tips sent, tips received, followers, and more. Updated periodically." }); } },
      { icon: "Sparkles", get title() { return _translateCopy("copy.0ad1b06f64f2", { defaultValue: "AI Assistant" }); }, get description() { return _translateCopy("copy.56196e073a9a", { defaultValue: "An AI-powered chat assistant that can answer questions, generate images, create videos, and help with platform features." }); } },
      { icon: "Settings", get title() { return _translateCopy("copy.74a883a037bc", { defaultValue: "Settings" }); }, get description() { return _translateCopy("copy.56acc0370df9", { defaultValue: "Manage your account preferences, language, privacy settings, and appearance." }); } },
    ],
  },
  {
    get title() { return _translateCopy("copy.91f30ce5eeb9", { defaultValue: "Governance & Community" }); },
    entries: [
      { icon: "ShieldCheck", get title() { return _translateCopy("copy.86f8a694159b", { defaultValue: "Governance" }); }, description: { key: "screens.glossaryGovernanceDesc" } },
      { icon: "Lightbulb", get title() { return _translateCopy("copy.d737b736eae8", { defaultValue: "Feature Requests" }); }, get description() { return _translateCopy("copy.ec9eff0f3f13", { defaultValue: "Suggest new features and vote on community ideas. Popular requests get prioritized for development." }); } },
      { icon: "ChevronUp", get title() { return _translateCopy("copy.bc7b4fda29f9", { defaultValue: "Upvote" }); }, get description() { return _translateCopy("copy.a719eb990599", { defaultValue: "Vote in favor of a governance proposal or feature request. Helps signal community support." }); } },
      { icon: "ChevronDown", get title() { return _translateCopy("copy.adad75f48d49", { defaultValue: "Downvote" }); }, get description() { return _translateCopy("copy.ddea42290677", { defaultValue: "Vote against a governance proposal or feature request. Helps signal community opposition." }); } },
    ],
  },
  {
    get title() { return _translateCopy("copy.44d1b649568c", { defaultValue: "Badges & Ranking" }); },
    entries: [
      { icon: "CircleCheckBig", get title() { return _translateCopy("copy.5f29db2f7ae5", { defaultValue: "Staking Badges" }); }, description: { key: "screens.glossaryStakingBadgesDesc" } },
      { icon: "Trophy", get title() { return _translateCopy("copy.23ad0f440f48", { defaultValue: "Leaderboard Ranking" }); }, description: { key: "screens.glossaryLeaderboardDesc" } },
      { icon: "TrendingUp", get title() { return _translateCopy("copy.5d788f95f78a", { defaultValue: "Ranking Delta (▲▼)" }); }, get description() { return _translateCopy("copy.9e9fa15a8dfa", { defaultValue: "The green or red arrow next to a leaderboard entry shows how much a user's balance changed over the selected time period (1 day, 1 week, etc.)." }); } },
      { icon: "Zap", get title() { return _translateCopy("copy.15ef844f362f", { defaultValue: "Token ID" }); }, description: { key: "screens.glossaryTokenIdDesc" } },
    ],
  },
  {
    get title() { return _translateCopy("copy.bb9a702dd998", { defaultValue: "Post Management" }); },
    entries: [
      { icon: "Pencil", get title() { return _translateCopy("copy.cc54b50c5162", { defaultValue: "Edit Post" }); }, get description() { return _translateCopy("copy.fdd9e13d471c", { defaultValue: "Modify the title or description of a post you created. Only the original creator can edit their posts." }); } },
      { icon: "Trash2", get title() { return _translateCopy("copy.e139251e4f5b", { defaultValue: "Delete Post" }); }, get description() { return _translateCopy("copy.2695e9e3ae52", { defaultValue: "Permanently remove a post from the feed. The on-chain record remains but the content is no longer displayed." }); } },
      { icon: "Pin", get title() { return _translateCopy("copy.f4eab5052f27", { defaultValue: "Pin Post" }); }, get description() { return _translateCopy("copy.e3be5bc43d91", { defaultValue: "Pin a post to the top of your profile so visitors see it first." }); } },
      { icon: "ExternalLink", get title() { return _translateCopy("copy.e3e2d15aa3c2", { defaultValue: "View on Explorer" }); }, get description() { return _translateCopy("copy.2405f38579b8", { defaultValue: "Opens the blockchain explorer (BaseScan) to view the on-chain transaction details for a post or transfer." }); } },
    ],
  },
];

function GlossaryCard({ icon, title, description }: ResolvedEntry) {
  return (
    <View style={styles.card}>
      <View style={styles.cardIcon}>
        <Icon name={icon} size={18} color="#D4D4D8" strokeWidth={1.8} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDesc}>{description}</Text>
      </View>
    </View>
  );
}

export default function GlossaryScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useSurfaceDraft("screens/GlossaryScreen.tsx:query", "");

  const sections = useMemo(
    () =>
      SECTIONS.map((s) => ({
        ...s,
        entries: s.entries.map((e): ResolvedEntry => ({
          ...e,
          description: typeof e.description === "string" ? e.description : t(e.description.key),
        })),
      })),
    [t],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections.map((s) => ({
      ...s,
      entries: s.entries.filter(
        (e) => e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q),
      ),
    })).filter((s) => s.entries.length > 0);
  }, [query, sections]);

  return (
    <View style={styles.root}>
      <ScreenHeader title={t("nav.glossary")} subtitle={t("screens.glossarySubtitle")} icon="glossary" />

      {/* Search */}
      <View style={styles.searchWrap}>
        <Icon name="Search" size={16} color="#808089" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("screens.searchGlossary")}
          placeholderTextColor="#8B8D90"
          style={styles.searchInput}
          autoCorrect={false}
        />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {filtered.length > 0 ? (
          filtered.map((section) => (
            <PageSection key={section.title} title={section.title}>
              <View style={{ gap: 14 }}>
                {section.entries.map((entry) => (
                  <GlossaryCard key={entry.title} {...entry} />
                ))}
              </View>
            </PageSection>
          ))
        ) : (
          <PageEmpty
            icon={<View style={{ marginBottom: 12 }}><Icon name="Search" size={28} color="#52525B" /></View>}
            title={t("screens.noResultsFor", { query })}
          />
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
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  cardBody: { flex: 1 },
  cardTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "600", marginBottom: 2 },
  cardDesc: { color: "#A1A1AA", fontSize: 14, lineHeight: 20 },
});
