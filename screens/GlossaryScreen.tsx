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
import Icon, { type IconName } from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";

interface GlossaryEntry {
  icon: IconName;
  title: string;
  description: string;
}

interface GlossarySection {
  title: string;
  entries: GlossaryEntry[];
}

const SECTIONS: GlossarySection[] = [
  {
    title: "Post Interactions",
    entries: [
      { icon: "ThumbsUp", title: "Thumbs Up (Like)", description: "Shows you like or agree with a post. Increases the post's engagement score and helps it rank higher in the feed." },
      { icon: "ThumbsDown", title: "Thumbs Down (Dislike)", description: "Shows you dislike or disagree with a post. This feedback helps improve content recommendations." },
      { icon: "MessageSquare", title: "Comment", description: "Opens the comment section where you can reply to a post, join discussions, and interact with other users." },
      { icon: "Share2", title: "Share", description: "Share a post externally via a link, or copy the post URL to your clipboard to send to others." },
      { icon: "Bookmark", title: "Bookmark", description: "Save a post to your bookmarks for later. Access all saved posts from the Bookmarks page in the sidebar." },
      { icon: "Gem", title: "Tip", description: "Send DHB tokens directly to a content creator as a reward for their content. Tips are recorded on-chain." },
      { icon: "Flag", title: "Report", description: "Flag inappropriate or harmful content for review. Reports help keep the community safe." },
      { icon: "Ellipsis", title: "More Options (⋯)", description: "Opens additional actions like editing, deleting, or reporting a post." },
    ],
  },
  {
    title: "Translation",
    entries: [
      { icon: "Languages", title: "Translate Button", description: "Translates post text, bios, and comments into your preferred language. The app auto-detects your language or you can set one manually in Settings." },
      { icon: "RotateCcw", title: "Show Original", description: "After translating, tap this to revert back to the original language of the content." },
    ],
  },
  {
    title: "Content Types",
    entries: [
      { icon: "Image", title: "Image Post", description: "A post containing one or more images. Images are stored on-chain as NFTs with a unique Token ID." },
      { icon: "Video", title: "Video Post", description: "A post containing a video. Videos can be set to public, private, or pay-per-view (PPV)." },
      { icon: "Radio", title: "Live Stream", description: "A real-time broadcast. Viewers can watch, comment, and tip the streamer. Streams use low-latency HLS technology." },
      { icon: "Clock", title: "Story", description: "Short video content that expires after 24 hours. Tap a user's avatar ring on the home feed to view their story." },
      { icon: "Play", title: "Audio", description: "An audio post with a visual waveform player. Creators can upload music, podcasts, or voice recordings." },
      { icon: "Mic", title: "Audio Space", description: "A live audio room where users can speak, listen, and raise their hand to join the conversation." },
    ],
  },
  {
    title: "Visibility & Access",
    entries: [
      { icon: "LockOpen", title: "Public", description: "Content visible to everyone. Anyone can view, like, and comment on public posts." },
      { icon: "Lock", title: "Private", description: "Content only visible to you. Private posts are hidden from other users and the public feed." },
      { icon: "Ticket", title: "Pay-Per-View (PPV)", description: "Premium content that requires a DHB token payment to unlock. Creators set the price and earn revenue from each view." },
      { icon: "Crown", title: "Subscriber Only", description: "Content restricted to users who have subscribed to the creator's channel." },
    ],
  },
  {
    title: "On-Chain Post Details",
    entries: [
      { icon: "Info", title: "Mint Transaction", description: "Tap the info icon on any post to open its mint transaction on the block explorer and verify the on-chain record. The full Post Info page — stats, holders, marketplace — lives on the web app at dehub.io." },
      { icon: "Hash", title: "Token ID", description: "The unique on-chain identifier assigned when a post is minted as an NFT." },
      { icon: "ExternalLink", title: "Transaction Hash", description: "The blockchain transaction hash from when the post was minted. Open it in the block explorer to verify the on-chain record." },
      { icon: "EyeOff", title: "Hidden Post", description: "Post owners can hide a post from public feeds (and show it again) from the post's options menu. A hidden post stays visible to its owner, marked with a Hidden chip." },
      { icon: "Pencil", title: "Edit Post", description: "Post owners can edit the title, description, and categories from the post's options menu." },
      { icon: "Ticket", title: "PPV Purchases", description: "For pay-per-view posts you own, the live ribbon shows how many viewers have purchased access." },
    ],
  },
  {
    title: "Fractions & Ownership",
    entries: [
      { icon: "ChartPie", title: "Fractions", description: "Every minted post is an NFT split into fractions. The creator starts with all of them, representing 100% ownership of the content." },
      { icon: "Users", title: "Your Holdings", description: "A profile's Fractions tab lists the posts that account co-owns and how many fractions of each. Your own tab is the same view of everything you hold." },
      { icon: "Coins", title: "Fraction Marketplace", description: "Trading — listings, offers, sales — happens on the web app at dehub.io, on each post's Post Info page. Completed trades show up in the Fractions tab here." },
    ],
  },
  {
    title: "Wallet & Tokens",
    entries: [
      { icon: "Coins", title: "DHB Token", description: "The native utility token of DeHub. Used for tipping, pay-per-view content, governance voting, and staking." },
      { icon: "Wallet", title: "Wallet", description: "Your on-chain wallet that holds your DHB tokens and other crypto assets. Connected via Web3Auth for easy access." },
      { icon: "ArrowUpDown", title: "Swap", description: "Exchange one token for another directly within the app. Swaps happen on-chain using decentralized exchanges." },
      { icon: "TrendingUp", title: "Staking", description: "Lock your DHB tokens to earn rewards over time. Staked tokens also give you increased voting power in governance." },
      { icon: "Copy", title: "Transaction Hash", description: "A unique identifier for any on-chain transaction. Open it to view the full transaction details on a blockchain explorer." },
    ],
  },
  {
    title: "Social Features",
    entries: [
      { icon: "Users", title: "Followers / Following", description: "Follow other users to see their posts in your feed. Your follower count is displayed on your profile." },
      { icon: "Bell", title: "Notifications", description: "Alerts for likes, comments, tips, follows, and other activity related to your account." },
      { icon: "Send", title: "Direct Messages", description: "Private messages between users. Currently available on the mobile app with web support coming soon." },
      { icon: "AtSign", title: "Mentions (@)", description: "Tag another user in a post or comment by typing @ followed by their username. They will receive a notification." },
    ],
  },
  {
    title: "Navigation",
    entries: [
      { icon: "House", title: "Home Feed", description: "Your main feed showing posts from people you follow and trending content." },
      { icon: "Search", title: "Explore", description: "Discover new content and users. Browse by category: videos, images, live streams, and more." },
      { icon: "Trophy", title: "Leaderboard", description: "Rankings of top users by balance, tips sent, tips received, followers, and more. Updated periodically." },
      { icon: "Sparkles", title: "AI Assistant", description: "An AI-powered chat assistant that can answer questions, generate images, create videos, and help with platform features." },
      { icon: "Settings", title: "Settings", description: "Manage your account preferences, language, privacy settings, and appearance." },
    ],
  },
  {
    title: "Governance & Community",
    entries: [
      { icon: "ShieldCheck", title: "Governance", description: "Submit and vote on proposals that shape the platform. Your voting power is weighted by your DHB holdings." },
      { icon: "Lightbulb", title: "Feature Requests", description: "Suggest new features and vote on community ideas. Popular requests get prioritized for development." },
      { icon: "ChevronUp", title: "Upvote", description: "Vote in favor of a governance proposal or feature request. Helps signal community support." },
      { icon: "ChevronDown", title: "Downvote", description: "Vote against a governance proposal or feature request. Helps signal community opposition." },
    ],
  },
  {
    title: "Badges & Ranking",
    entries: [
      { icon: "CircleCheckBig", title: "Staking Badges", description: "Badges displayed next to your username based on your total DHB holdings (wallet + staked). There are 13 tiers — the more DHB you hold, the higher your badge rank. Higher tiers grant more governance voting power and lower platform fees." },
      { icon: "Trophy", title: "Leaderboard Ranking", description: "Users are ranked by total DHB balance (wallet + staked across all chains). Rankings update periodically and track 1-day and 1-week changes. You can also sort by tips sent, tips received, followers, likes, or subscribers." },
      { icon: "TrendingUp", title: "Ranking Delta (▲▼)", description: "The green or red arrow next to a leaderboard entry shows how much a user's balance changed over the selected time period (1 day, 1 week, etc.)." },
      { icon: "Zap", title: "Token ID", description: "A unique on-chain identifier assigned to each post when it's minted as an NFT on the blockchain." },
    ],
  },
  {
    title: "Post Management",
    entries: [
      { icon: "Pencil", title: "Edit Post", description: "Modify the title or description of a post you created. Only the original creator can edit their posts." },
      { icon: "Trash2", title: "Delete Post", description: "Permanently remove a post from the feed. The on-chain record remains but the content is no longer displayed." },
      { icon: "Pin", title: "Pin Post", description: "Pin a post to the top of your profile so visitors see it first." },
      { icon: "ExternalLink", title: "View on Explorer", description: "Opens the blockchain explorer (BaseScan) to view the on-chain transaction details for a post or transfer." },
    ],
  },
];

function GlossaryCard({ icon, title, description }: GlossaryEntry) {
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
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.map((s) => ({
      ...s,
      entries: s.entries.filter(
        (e) => e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q),
      ),
    })).filter((s) => s.entries.length > 0);
  }, [query]);

  return (
    <View style={styles.root}>
      <ScreenHeader title="Glossary" subtitle="Learn what every icon and feature means" />

      {/* Search */}
      <View style={styles.searchWrap}>
        <Icon name="Search" size={16} color="#808089" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search glossary..."
          placeholderTextColor="#8B8D90"
          style={styles.searchInput}
          autoCorrect={false}
        />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 24, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {filtered.length > 0 ? (
          filtered.map((section) => (
            <View key={section.title} style={{ marginBottom: 20 }}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionBar} />
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </View>
              <View style={{ gap: 8 }}>
                {section.entries.map((entry) => (
                  <GlossaryCard key={entry.title} {...entry} />
                ))}
              </View>
            </View>
          ))
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
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  sectionBar: { width: 4, height: 20, borderRadius: 999, backgroundColor: "#D4D4D8" },
  sectionTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
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
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 48 },
  emptyText: { color: "#808089", fontSize: 13, marginTop: 12 },
});
