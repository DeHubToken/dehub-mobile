import { translateCopy as _translateCopy } from '../../i18n/copy';
import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
import { useSheetClosed } from '../../hooks/useSheetClosed';
import SheetDismissHandle from "../ui/SheetDismissHandle";
/**
 * DeHub Poster Studio.
 * ====================
 * Port of web's `PosterConfigDialog`. Anything that mentions DeHub and a piece
 * of content ("make a DeHub banner for the LCS launch") routes through here
 * instead of straight to the image paywall, because a brand poster needs a
 * format, a style archetype, which features to spotlight, and a headline that
 * is composited afterwards rather than drawn by the model.
 *
 * The detection regexes, the option lists and `buildFinalPrompt` are web's
 * verbatim. They have to be: the server pairs `bannerRenderer: 'template'` with
 * its own SM Template layout, and a style id this app invented would fall
 * through to the diffusion path and produce a poster that looks nothing like
 * the same request made on desktop.
 */

import { useTranslation } from "react-i18next";
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  useWindowDimensions,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../ui/Icon';
import { SHEET_GLASS_FILL } from "../../theme/sheetGlass";
import { SheetGlassFill } from "../ui/SheetGlass";


export type LogoVariant = 'primary' | 'icon' | 'both';

export interface PosterConfig {
  dimension: 'square' | 'portrait' | 'landscape' | 'story';
  style: string;
  features: string[];
  tagline: string;
  includeSocials: boolean;
  includeWebsite: boolean;
  extraNotes: string;
  logoVariant: LogoVariant;
  finalPrompt: string;
}

const DIMENSIONS: { value: PosterConfig['dimension']; label: string; hint: string; displayHint: string; icon: string }[] = [
  { value: 'square', get label() { return _translateCopy("copy.c11092bc0861", { defaultValue: "Square" }); }, hint: '1:1 · IG post', get displayHint() { return _translateCopy("copy.0e2e8a51b829", { defaultValue: "1:1 · IG post" }); }, icon: '⬛' },
  { value: 'portrait', get label() { return _translateCopy("copy.1ba76ea7e3d9", { defaultValue: "Poster" }); }, hint: '2:3 · story / flyer', get displayHint() { return _translateCopy("copy.6ad19c18988e", { defaultValue: "2:3 · story / flyer" }); }, icon: '📱' },
  { value: 'landscape', get label() { return _translateCopy("copy.b7f4d98f98d5", { defaultValue: "Banner" }); }, hint: '3:2 · X / YouTube', get displayHint() { return _translateCopy("copy.c5de2b8c2cfe", { defaultValue: "3:2 · X / YouTube" }); }, icon: '🖼️' },
  { value: 'story', get label() { return _translateCopy("copy.e9e509dcd358", { defaultValue: "Story" }); }, hint: '9:16 · IG story', get displayHint() { return _translateCopy("copy.d5a1ad0d32bd", { defaultValue: "9:16 · IG story" }); }, icon: '📲' },
];

const STYLES: { value: string; label: string; desc: string; displayDesc: string }[] = [
  { value: 'dehub-template', get label() { return _translateCopy("copy.6bb795fea2b8", { defaultValue: "🎯 DeHub Banner" }); }, desc: 'On-brand chrome icon + silver headline (like our blog banners)', get displayDesc() { return _translateCopy("copy.395a707bd6a3", { defaultValue: "On-brand chrome icon + silver headline (like our blog banners)" }); } },
  { value: 'auto', get label() { return _translateCopy("copy.eb1bb7452892", { defaultValue: "🎲 Surprise me" }); }, desc: 'Random top-tier archetype', get displayDesc() { return _translateCopy("copy.e71655704cae", { defaultValue: "Random top-tier archetype" }); } },
  { value: 'apple-keynote', get label() { return _translateCopy("copy.ca01201adaea", { defaultValue: "🍎 Apple Keynote" }); }, desc: 'Minimal product hero, dramatic lighting', get displayDesc() { return _translateCopy("copy.37540e858a4b", { defaultValue: "Minimal product hero, dramatic lighting" }); } },
  { value: 'a24-film', get label() { return _translateCopy("copy.edd50297ca4a", { defaultValue: "🎞️ A24 Film Poster" }); }, desc: 'Cinematic, grainy, moody', get displayDesc() { return _translateCopy("copy.681da2fcb37a", { defaultValue: "Cinematic, grainy, moody" }); } },
  { value: 'cyberpunk', get label() { return _translateCopy("copy.b534bb26caf1", { defaultValue: "🌆 Cyberpunk Street" }); }, desc: 'Neon rain, glitch, futuristic', get displayDesc() { return _translateCopy("copy.1442f8388141", { defaultValue: "Neon rain, glitch, futuristic" }); } },
  { value: 'liquid-glass', get label() { return _translateCopy("copy.f8cfb761cc4d", { defaultValue: "💧 Liquid Glass" }); }, desc: 'Frosted, translucent, premium', get displayDesc() { return _translateCopy("copy.a9a10f133c61", { defaultValue: "Frosted, translucent, premium" }); } },
  { value: 'cosmic', get label() { return _translateCopy("copy.83f29355454f", { defaultValue: "🌌 Cosmic Scale" }); }, desc: 'Nebulas, stars, epic scale', get displayDesc() { return _translateCopy("copy.e108e21d61d4", { defaultValue: "Nebulas, stars, epic scale" }); } },
  { value: 'nike-campaign', get label() { return _translateCopy("copy.7151bc120e24", { defaultValue: "👟 Nike Campaign" }); }, desc: 'Bold, motion, athletic', get displayDesc() { return _translateCopy("copy.ae279fd74c6b", { defaultValue: "Bold, motion, athletic" }); } },
  { value: 'luxury-watch', get label() { return _translateCopy("copy.878af03d5968", { defaultValue: "⌚ Luxury Ad" }); }, desc: 'Macro detail, black backdrop', get displayDesc() { return _translateCopy("copy.ddc01a6abb81", { defaultValue: "Macro detail, black backdrop" }); } },
  { value: 'rave-flyer', get label() { return _translateCopy("copy.16cc0ff62e43", { defaultValue: "🔊 Rave Flyer" }); }, desc: 'Chaotic, energetic, underground', get displayDesc() { return _translateCopy("copy.7eac8ea9382b", { defaultValue: "Chaotic, energetic, underground" }); } },
  { value: 'brutalist', get label() { return _translateCopy("copy.4330842d94b7", { defaultValue: "🧱 Brutalist Type" }); }, desc: 'Massive text, Swiss grid', get displayDesc() { return _translateCopy("copy.772ae0700671", { defaultValue: "Massive text, Swiss grid" }); } },
  { value: 'magazine', get label() { return _translateCopy("copy.bf2f3ecac4d0", { defaultValue: "📖 Magazine Cover" }); }, desc: 'Editorial, character-led', get displayDesc() { return _translateCopy("copy.26f34010faae", { defaultValue: "Editorial, character-led" }); } },
  { value: 'sci-fi-keyart', get label() { return _translateCopy("copy.7d78e5a5d486", { defaultValue: "Sci-Fi Key Art" }); }, desc: 'Blockbuster movie poster', get displayDesc() { return _translateCopy("copy.fff5a9691356", { defaultValue: "Blockbuster movie poster" }); } },
  { value: 'vaporwave', get label() { return _translateCopy("copy.d5e76a61b86a", { defaultValue: "🌴 Vaporwave" }); }, desc: 'Retro pastel, dreamy', get displayDesc() { return _translateCopy("copy.7fe666fe8198", { defaultValue: "Retro pastel, dreamy" }); } },
  { value: 'product-teaser', get label() { return _translateCopy("copy.1784371d756d", { defaultValue: "📦 Product Teaser" }); }, desc: 'Mysterious launch reveal', get displayDesc() { return _translateCopy("copy.999329632cca", { defaultValue: "Mysterious launch reveal" }); } },
  { value: 'concert-tour', get label() { return _translateCopy("copy.d9c930ee7f28", { defaultValue: "🎤 Concert Tour" }); }, desc: 'Stage haze, spotlights', get displayDesc() { return _translateCopy("copy.ac14ad27c740", { defaultValue: "Stage haze, spotlights" }); } },
];

const LOGO_VARIANTS: { value: LogoVariant; label: string; hint: string }[] = [
  { value: 'primary', get label() { return _translateCopy("copy.d5fda981cc4a", { defaultValue: "Wordmark" }); }, get hint() { return _translateCopy("copy.b68ce1077869", { defaultValue: "Long-form DeHub logo" }); } },
  { value: 'icon', get label() { return _translateCopy("copy.a35abcd6dac9", { defaultValue: "Icon" }); }, get hint() { return _translateCopy("copy.ce18d71f9095", { defaultValue: "Compact D-mark" }); } },
  { value: 'both', get label() { return _translateCopy("copy.b6c1d862f9f7", { defaultValue: "Both" }); }, get hint() { return _translateCopy("copy.5499817aec57", { defaultValue: "Wordmark + icon lockup" }); } },
];

const FEATURE_GROUPS: { group: string; displayGroup: string; items: { value: string; label: string; blurb: string; displayBlurb?: string; labelKey?: string; blurbKey?: string }[] }[] = [
  {
    group: 'Social & Feed',
    get displayGroup() { return _translateCopy("copy.beb497b64cad", { defaultValue: "Social & Feed" }); },
    items: [
      { value: 'unified-feed', get label() { return _translateCopy("copy.dd05b3bca137", { defaultValue: "📰 Unified Feed" }); }, blurb: 'Web2 + web3 social in one home', get displayBlurb() { return _translateCopy("copy.2a4f0d580082", { defaultValue: "Web2 + web3 social in one home" }); } },
      { value: 'communities', get label() { return _translateCopy("copy.269ad0d90f5a", { defaultValue: "👥 Communities" }); }, blurb: 'Token-gated groups & channels', get displayBlurb() { return _translateCopy("copy.ff8669071f40", { defaultValue: "Token-gated groups & channels" }); } },
      { value: 'stories', get label() { return _translateCopy("copy.50c8afc2eec1", { defaultValue: "📸 Stories" }); }, blurb: 'Ephemeral daily posts', get displayBlurb() { return _translateCopy("copy.eeff62cb5cc2", { defaultValue: "Ephemeral daily posts" }); } },
      { value: 'shorts', get label() { return _translateCopy("copy.365075d796de", { defaultValue: "🎞️ Shorts" }); }, blurb: 'Vertical short-form video', get displayBlurb() { return _translateCopy("copy.57091fe10c1c", { defaultValue: "Vertical short-form video" }); } },
      { value: 'multi-posting', get label() { return _translateCopy("copy.db9897e168fa", { defaultValue: "📢 Multi-Posting" }); }, blurb: 'Cross-post to X, TG, Discord, IG', get displayBlurb() { return _translateCopy("copy.2fc3a750b42f", { defaultValue: "Cross-post to X, TG, Discord, IG" }); } },
    ],
  },
  {
    group: 'Live & Media',
    get displayGroup() { return _translateCopy("copy.017e6627fea8", { defaultValue: "Live & Media" }); },
    items: [
      { value: 'livestream', get label() { return _translateCopy("copy.63cede5fbee6", { defaultValue: "Livestreaming" }); }, blurb: 'Native + aggregated streams', get displayBlurb() { return _translateCopy("copy.882538ca4a86", { defaultValue: "Native + aggregated streams" }); } },
      { value: 'streaming-agg', get label() { return _translateCopy("copy.3098854985e6", { defaultValue: "🎬 Streaming Aggregation" }); }, blurb: 'All major platforms in one', get displayBlurb() { return _translateCopy("copy.067dd84ab978", { defaultValue: "All major platforms in one" }); } },
      { value: 'stages', get label() { return _translateCopy("copy.2da0741cd536", { defaultValue: "🎙️ Stages" }); }, blurb: 'Audio rooms with AI TTS hosts', get displayBlurb() { return _translateCopy("copy.3f46fc40ad09", { defaultValue: "Audio rooms with AI TTS hosts" }); } },
      { value: 'radio', get label() { return _translateCopy("copy.a0b9c4ce5f29", { defaultValue: "📻 DeHub Radio" }); }, blurb: '24/7 crypto radio', get displayBlurb() { return _translateCopy("copy.c8881bd87d15", { defaultValue: "24/7 crypto radio" }); } },
      { value: 'tv-console', get label() { return _translateCopy("copy.393c70daa40f", { defaultValue: "TV & Console Apps" }); }, blurb: 'Living room takeover', get displayBlurb() { return _translateCopy("copy.50575a8fbd04", { defaultValue: "Living room takeover" }); } },
      { value: 'editor', get label() { return _translateCopy("copy.03bbf31aa251", { defaultValue: "🎬 In-Browser Video Editor" }); }, blurb: 'Multi-track studio at /editor', get displayBlurb() { return _translateCopy("copy.de690b83607b", { defaultValue: "Multi-track studio at /editor" }); } },
    ],
  },
  {
    group: 'Chat & Comms',
    get displayGroup() { return _translateCopy("copy.4deae69e50af", { defaultValue: "Chat & Comms" }); },
    items: [
      { value: 'dm-tipped', get label() { return _translateCopy("copy.5e0be69e7d7d", { defaultValue: "💌 Tipped DMs" }); }, blurb: 'End-to-end encrypted, tip-per-message', get displayBlurb() { return _translateCopy("copy.1fca8b1d5467", { defaultValue: "End-to-end encrypted, tip-per-message" }); } },
      { value: 'e2e', get label() { return _translateCopy("copy.b21e3238c470", { defaultValue: "E2E Encryption" }); }, blurb: 'Zero-knowledge chats', get displayBlurb() { return _translateCopy("copy.e7404303d92d", { defaultValue: "Zero-knowledge chats" }); } },
      { value: 'voice-video', get label() { return _translateCopy("copy.fc56fd22af80", { defaultValue: "🎥 Voice & Video Calls" }); }, blurb: 'WebRTC calling', get displayBlurb() { return _translateCopy("copy.ecc77bc026be", { defaultValue: "WebRTC calling" }); } },
      { value: 'voice-notes', get label() { return _translateCopy("copy.dfdd2f096f81", { defaultValue: "🎤 Voice Notes" }); }, blurb: 'Waveform-visualised messages', get displayBlurb() { return _translateCopy("copy.11503bbf728f", { defaultValue: "Waveform-visualised messages" }); } },
    ],
  },
  {
    group: 'Token & DeFi',
    get displayGroup() { return _translateCopy("copy.6ff093d0306a", { defaultValue: "Token & DeFi" }); },
    items: [
      { value: 'dhb-staking', get label() { return _translateCopy("copy.0039cdece89a", { defaultValue: "💎 Token Staking (Base)" }); }, blurb: 'Stake DeHub tokens, earn rewards', labelKey: 'poster.features.stakingLabel', blurbKey: 'poster.features.stakingBlurb' },
      { value: 'lp-farming', get label() { return _translateCopy("copy.ffd397381778", { defaultValue: "🌾 LP Farming" }); }, blurb: 'Provide liquidity, earn yield', get displayBlurb() { return _translateCopy("copy.3e251f21874b", { defaultValue: "Provide liquidity, earn yield" }); } },
      { value: 'token-bridge', get label() { return _translateCopy("copy.5441d9dc54f6", { defaultValue: "🌉 Token Bridge" }); }, blurb: 'BNB ↔ Base cross-chain', get displayBlurb() { return _translateCopy("copy.d25cbdb8a77e", { defaultValue: "BNB ↔ Base cross-chain" }); } },
      { value: 'governance', get label() { return _translateCopy("copy.7e9ecb6a5eff", { defaultValue: "🗳️ Governance" }); }, blurb: 'On-chain proposals & voting', get displayBlurb() { return _translateCopy("copy.62aae18f9b4b", { defaultValue: "On-chain proposals & voting" }); } },
      { value: 'token-utility', get label() { return _translateCopy("copy.e3e81d3d76cf", { defaultValue: "🪙 Token Utility" }); }, blurb: 'Fees, boosts, gating, tipping', get displayBlurb() { return _translateCopy("copy.46ba977c5758", { defaultValue: "Fees, boosts, gating, tipping" }); }, labelKey: 'poster.features.tokenUtilityLabel' },
      { value: 'fiat-onramp', get label() { return _translateCopy("copy.6818215dba2d", { defaultValue: "💳 Fiat On-Ramp" }); }, blurb: 'Card → USDC → DeHub tokens', blurbKey: 'poster.features.fiatOnrampBlurb' },
      { value: 'fiat-offramp', get label() { return _translateCopy("copy.b295e355b543", { defaultValue: "💵 Fiat Off-Ramp" }); }, blurb: 'Token-to-cash conversion', get displayBlurb() { return _translateCopy("copy.eaf7645fdf76", { defaultValue: "Token-to-cash conversion" }); } },
      { value: 'uniswap-swap', get label() { return _translateCopy("copy.831e71a8e8c6", { defaultValue: "🔄 In-App Swap" }); }, blurb: 'Uniswap V3, one click', get displayBlurb() { return _translateCopy("copy.cd59a4dfabcd", { defaultValue: "Uniswap V3, one click" }); } },
      { value: 'wallet', get label() { return _translateCopy("copy.e54d786a7b76", { defaultValue: "👛 Cross-Chain Wallet" }); }, blurb: 'BNB + Base aggregated', get displayBlurb() { return _translateCopy("copy.c1919aeb4349", { defaultValue: "BNB + Base aggregated" }); } },
    ],
  },
  {
    group: 'Marketplace & Commerce',
    get displayGroup() { return _translateCopy("copy.92e31dc02897", { defaultValue: "Marketplace & Commerce" }); },
    items: [
      { value: 'stores', get label() { return _translateCopy("copy.50d8d34a787b", { defaultValue: "🛍️ DeHub Stores" }); }, blurb: 'P2P commerce with DeHub tokens on Base', blurbKey: 'poster.features.storesBlurb' },
      { value: 'fractions', get label() { return _translateCopy("copy.6ee5630c9dde", { defaultValue: "🧩 Fractions" }); }, blurb: 'Fractional NFT marketplace', get displayBlurb() { return _translateCopy("copy.515c1d5bac05", { defaultValue: "Fractional NFT marketplace" }); } },
      { value: 'work', get label() { return _translateCopy("copy.fb673c9c986e", { defaultValue: "🧑‍💻 DeHub Bounties" }); }, blurb: 'Escrow bounties: social, clips, contracts', get displayBlurb() { return _translateCopy("copy.cb7691b210ac", { defaultValue: "Escrow bounties: social, clips, contracts" }); } },
      { value: 'tipping', get label() { return _translateCopy("copy.2b13f4c55720", { defaultValue: "💸 Tipping" }); }, blurb: 'Reward creators on any post', get displayBlurb() { return _translateCopy("copy.3c0a4db437c9", { defaultValue: "Reward creators on any post" }); } },
      { value: 'premium', get label() { return _translateCopy("copy.1205929886b3", { defaultValue: "👑 DeHub Extra" }); }, blurb: 'Premium tiers with cashback', get displayBlurb() { return _translateCopy("copy.088dd2c25014", { defaultValue: "Premium tiers with cashback" }); } },
    ],
  },
  {
    group: 'AI & Creator Tools',
    get displayGroup() { return _translateCopy("copy.b6a9ba9b32ec", { defaultValue: "AI & Creator Tools" }); },
    items: [
      { value: 'ai-assistant', get label() { return _translateCopy("copy.24a657b7384e", { defaultValue: "🤖 AI Assistant" }); }, blurb: 'DeHub-aware chat + skills', get displayBlurb() { return _translateCopy("copy.419f20be3aa6", { defaultValue: "DeHub-aware chat + skills" }); } },
      { value: 'ai-image', get label() { return _translateCopy("copy.fea1030abae5", { defaultValue: "🖼️ AI Image Gen" }); }, blurb: 'GPT-image-2 & Nano Banana 2', get displayBlurb() { return _translateCopy("copy.c2126c14b409", { defaultValue: "GPT-image-2 & Nano Banana 2" }); } },
      { value: 'ai-video', get label() { return _translateCopy("copy.7209e5080253", { defaultValue: "🎥 AI Video Gen" }); }, blurb: 'Per-second billed clips', get displayBlurb() { return _translateCopy("copy.42c4f0046208", { defaultValue: "Per-second billed clips" }); } },
      { value: 'ai-toolkits', get label() { return _translateCopy("copy.706d522aacec", { defaultValue: "🧰 AI Toolkits" }); }, blurb: 'Auto tips, engagement, guidance', get displayBlurb() { return _translateCopy("copy.40648ebaff2c", { defaultValue: "Auto tips, engagement, guidance" }); } },
      { value: 'characters', get label() { return _translateCopy("copy.457e30a6a1e9", { defaultValue: "🎭 Characters" }); }, blurb: '@mention reusable AI personas', get displayBlurb() { return _translateCopy("copy.0ba723902f01", { defaultValue: "@mention reusable AI personas" }); } },
      { value: 'skills', get label() { return _translateCopy("copy.b3b61e24c8f8", { defaultValue: "🧠 User Skills" }); }, blurb: 'Personal AI knowledge packs', get displayBlurb() { return _translateCopy("copy.286ec02a665a", { defaultValue: "Personal AI knowledge packs" }); } },
      { value: 'affiliate', get label() { return _translateCopy("copy.4d675ad7e188", { defaultValue: "🤝 20% Affiliate" }); }, blurb: '2-tier referral revenue share', get displayBlurb() { return _translateCopy("copy.3b3c78953fb1", { defaultValue: "2-tier referral revenue share" }); } },
    ],
  },
  {
    group: 'Games & DePIN',
    get displayGroup() { return _translateCopy("copy.890e4478587a", { defaultValue: "Games & DePIN" }); },
    items: [
      { value: 'lcs-tge', get label() { return _translateCopy("copy.94e2d0eda8c8", { defaultValue: "🎮 Last Chad Standing TGE" }); }, blurb: 'March 2026 launch', get displayBlurb() { return _translateCopy("copy.a838bc9d1fca", { defaultValue: "March 2026 launch" }); } },
      { value: 'games-hub', get label() { return _translateCopy("copy.1925f0dffb3b", { defaultValue: "🕹️ Games Hub" }); }, blurb: 'Web3-native mini games', get displayBlurb() { return _translateCopy("copy.4e574e6c75e6", { defaultValue: "Web3-native mini games" }); } },
      { value: 'depin', get label() { return _translateCopy("copy.5b560f273940", { defaultValue: "🛰️ DePIN" }); }, blurb: 'Decentralized physical infra', get displayBlurb() { return _translateCopy("copy.6bb1d39cb2ff", { defaultValue: "Decentralized physical infra" }); } },
      { value: 'sdks', get label() { return _translateCopy("copy.226d010f636d", { defaultValue: "🛠️ Developer SDKs" }); }, blurb: 'Build mini apps & games', get displayBlurb() { return _translateCopy("copy.a000e0071926", { defaultValue: "Build mini apps & games" }); } },
    ],
  },
  {
    group: 'Growth & Reach',
    get displayGroup() { return _translateCopy("copy.398618a3e14e", { defaultValue: "Growth & Reach" }); },
    items: [
      { value: 'ad-stack', get label() { return _translateCopy("copy.4f97987243b4", { defaultValue: "🎯 Advertising Stack" }); }, blurb: 'Wallet-based targeting', get displayBlurb() { return _translateCopy("copy.e8c34388bb48", { defaultValue: "Wallet-based targeting" }); } },
      { value: 'apple-store', get label() { return _translateCopy("copy.748d190d59af", { defaultValue: "📱 Apple App Store" }); }, blurb: 'Native iOS launch', get displayBlurb() { return _translateCopy("copy.9e16bcd538e1", { defaultValue: "Native iOS launch" }); } },
      { value: 'blog', get label() { return _translateCopy("copy.104272ba3fd3", { defaultValue: "✍️ Blog" }); }, blurb: 'Long-form + SEO content', get displayBlurb() { return _translateCopy("copy.acd7f89009da", { defaultValue: "Long-form + SEO content" }); } },
      { value: 'events', get label() { return _translateCopy("copy.8d14f6e72de8", { defaultValue: "Events" }); }, blurb: 'IRL & virtual RSVPs', get displayBlurb() { return _translateCopy("copy.3d1fa3c2ac97", { defaultValue: "IRL & virtual RSVPs" }); } },
      { value: 'vr-hub', get label() { return _translateCopy("copy.c6db0784ded4", { defaultValue: "🥽 V/AR Profile Hub" }); }, blurb: 'Immersive identity', get displayBlurb() { return _translateCopy("copy.c7e7451336d4", { defaultValue: "Immersive identity" }); } },
    ],
  },
];

const FEATURES = FEATURE_GROUPS.flatMap((g) => g.items);

/* ── Auto-detection from the user's prompt (web's, verbatim) ─────────────── */

function detectDimension(prompt: string): PosterConfig['dimension'] {
  const lower = prompt.toLowerCase();
  if (/\b(square|1:1|instagram post|ig post)\b/.test(lower)) return 'square';
  if (/\b(banner|wide|landscape|hero|cover|16:9|youtube|3:2|twitter header|x header)\b/.test(lower)) {
    return 'landscape';
  }
  if (/\b(story|9:16|reel|tiktok|ig story|instagram story)\b/.test(lower)) return 'story';
  return 'portrait';
}

function detectStyle(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (/\bapple|keynote|minimal(ist)?\b/.test(lower)) return 'apple-keynote';
  if (/\ba24|cinematic|film|movie\b/.test(lower)) return 'a24-film';
  if (/\bcyberpunk|neon|futur/.test(lower)) return 'cyberpunk';
  if (/\bliquid glass|frosted|translucent\b/.test(lower)) return 'liquid-glass';
  if (/\bcosmic|space|nebula|galaxy|stars\b/.test(lower)) return 'cosmic';
  if (/\bnike|athletic|sport\b/.test(lower)) return 'nike-campaign';
  if (/\bluxury|premium ad|watch ad\b/.test(lower)) return 'luxury-watch';
  if (/\brave|flyer|underground|club\b/.test(lower)) return 'rave-flyer';
  if (/\bbrutalist|swiss|helvetica\b/.test(lower)) return 'brutalist';
  if (/\bmagazine|editorial|cover story\b/.test(lower)) return 'magazine';
  if (/\bsci[- ]?fi|key ?art|blockbuster\b/.test(lower)) return 'sci-fi-keyart';
  if (/\bvaporwave|retro|80s|synthwave\b/.test(lower)) return 'vaporwave';
  if (/\bproduct|launch|teaser|reveal\b/.test(lower)) return 'product-teaser';
  if (/\bconcert|tour|stage\b/.test(lower)) return 'concert-tour';
  // Default to the on-brand template banner unless one of the cinematic scene
  // archetypes above was explicitly asked for.
  return 'dehub-template';
}

function detectFeatures(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const hits: string[] = [];
  if (/\b(lcs|last chad|tge)\b/.test(lower)) hits.push('lcs-tge');
  if (/\b(apple|app store|ios)\b/.test(lower)) hits.push('apple-store');
  if (/\b(lp farm|liquidity|yield)\b/.test(lower)) hits.push('lp-farming');
  if (/\b(staking|stake dhb)\b/.test(lower)) hits.push('dhb-staking');
  if (/\bai (toolkit|tools?|assistant|agent)\b/.test(lower)) hits.push('ai-toolkits');
  if (/\b(ad|advertis)/.test(lower)) hits.push('ad-stack');
  if (/\b(off[- ]?ramp|fiat)\b/.test(lower)) hits.push('fiat-offramp');
  if (/\bsdk|developer\b/.test(lower)) hits.push('sdks');
  if (/\bmulti[- ]?post|cross[- ]?post\b/.test(lower)) hits.push('multi-posting');
  if (/\bstream(ing)?\b/.test(lower)) hits.push('streaming');
  if (/\btv app|console\b/.test(lower)) hits.push('tv-console');
  if (/\bvr|ar|metaverse|profile hub\b/.test(lower)) hits.push('vr-hub');
  return hits;
}

function detectTagline(prompt: string): string {
  const quoted = prompt.match(/["']([^"']{4,60})["']/);
  if (quoted) return quoted[1].trim();
  const tag = prompt.match(/(?:tagline|headline|says?)\s*[:\-]\s*["']?([^"'\n,.]{4,60})["']?/i);
  if (tag) return tag[1].trim();
  return '';
}

const detectSocials = (prompt: string): boolean =>
  /\b(socials?|social links|links|handles?|follow us|find us)\b/i.test(prompt);

const detectWebsite = (prompt: string): boolean =>
  /\b(website|url|dehub\.io|domain|link to site)\b/i.test(prompt);

/* ── Prompt builder (web's, verbatim) ───────────────────────────────────── */

function buildFinalPrompt(cfg: Omit<PosterConfig, 'finalPrompt'>, userPrompt: string): string {
  const parts: string[] = [];
  parts.push(userPrompt.trim());

  const dim = DIMENSIONS.find((d) => d.value === cfg.dimension);
  if (dim) parts.push(`Format: ${dim.label} (${dim.hint}).`);

  const logoNote =
    cfg.logoVariant === 'icon'
      ? 'Reserve clear negative space for the DeHub icon mark (compact D-symbol) only — do not draw the wordmark.'
      : cfg.logoVariant === 'both'
        ? 'Reserve clear negative space for a DeHub lockup combining the icon mark and the long-form wordmark side-by-side or stacked.'
        : 'Reserve clear negative space for the DeHub long-form wordmark logo.';
  parts.push(logoNote);

  if (cfg.style && cfg.style !== 'auto' && cfg.style !== 'dehub-template') {
    const style = STYLES.find((s) => s.value === cfg.style);
    if (style) parts.push(`Style archetype: ${style.label.replace(/^[^\w]+/, '')} — ${style.desc}.`);
  }

  if (cfg.features.length) {
    const featureLabels = cfg.features
      .map((f) => FEATURES.find((x) => x.value === f))
      .filter(Boolean)
      .map((f) => `${f!.label.replace(/^[^\w]+/, '')} (${f!.blurb})`);
    parts.push(`Spotlight DeHub feature(s): ${featureLabels.join('; ')}.`);
  }

  if (cfg.tagline) {
    parts.push(
      'Reserve clean negative space above the bottom logo area for a short headline — do NOT render any headline text yourself; the real headline is composited afterward.',
    );
  }

  const linkBits: string[] = [];
  if (cfg.includeWebsite) linkBits.push('dehub.io');
  if (cfg.includeSocials) linkBits.push('x.com/dehub_official', 't.me/dehub_dhb', 'discord.gg/dehub');
  if (linkBits.length) {
    parts.push(
      `Include these links at the bottom in small Exo Light, pure white, generous letter-spacing: ${linkBits.join(' · ')}.`,
    );
  }

  if (cfg.extraNotes.trim()) parts.push(cfg.extraNotes.trim());

  return parts.join(' ');
}

interface PosterConfigSheetProps {
  visible: boolean;
  onClose: () => void;
  userPrompt: string;
  onConfirm: (config: PosterConfig) => void;
}

const PosterConfigSheetComponent: React.FC<PosterConfigSheetProps> = ({
  visible,
  onClose,
  userPrompt,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const sheetHeight = screenHeight * 0.9;
  const [dimension, setDimension] = useState<PosterConfig['dimension']>('portrait');
  const [style, setStyle] = useState('dehub-template');
  const [features, setFeatures] = useState<string[]>([]);
  const [tagline, setTagline] = useSurfaceDraft("components/Assistant/PosterConfigSheet.tsx:tagline", '');
  const [includeSocials, setIncludeSocials] = useState(false);
  const [includeWebsite, setIncludeWebsite] = useState(false);
  const [extraNotes, setExtraNotes] = useSurfaceDraft("components/Assistant/PosterConfigSheet.tsx:extraNotes", '');
  const [logoVariant, setLogoVariant] = useState<LogoVariant>('primary');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [styleListOpen, setStyleListOpen] = useState(false);

  const translateY = useSharedValue(sheetHeight);
  const backdropOpacity = useSharedValue(0);
  const [isFullyClosed, setIsFullyClosed] = useSheetClosed(visible);

  useEffect(() => {
    if (visible) {
      setIsFullyClosed(false);
      setDimension(detectDimension(userPrompt));
      setStyle(detectStyle(userPrompt));
      setFeatures(detectFeatures(userPrompt));
      setTagline.initialize(detectTagline(userPrompt));
      setIncludeSocials(detectSocials(userPrompt));
      setIncludeWebsite(detectWebsite(userPrompt));
      setExtraNotes.initialize('');
      const lower = userPrompt.toLowerCase();
      if (/\bicon|symbol|mark|d-mark|small logo\b/.test(lower)) setLogoVariant('icon');
      else if (/\bboth logos?|lockup|icon\s*\+\s*wordmark|wordmark\s*\+\s*icon\b/.test(lower)) {
        setLogoVariant('both');
      } else setLogoVariant('primary');
      setExpandedGroup(null);
      setStyleListOpen(false);
      translateY.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) });
      backdropOpacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withTiming(
        sheetHeight,
        { duration: 220, easing: Easing.in(Easing.cubic) },
        () => runOnJS(setIsFullyClosed)(true),
      );
      backdropOpacity.value = withTiming(0, { duration: 180 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, userPrompt, setExtraNotes, setTagline]);

  const closeSheet = useCallback(() => {
    translateY.value = withTiming(
      sheetHeight,
      { duration: 220, easing: Easing.in(Easing.cubic) },
      () => runOnJS(onClose)(),
    );
    backdropOpacity.value = withTiming(0, { duration: 180 });
  }, [onClose, translateY, backdropOpacity, sheetHeight]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  const toggleFeature = useCallback((value: string) => {
    setFeatures((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }, []);

  const selectedStyle = useMemo(
    () => STYLES.find((s) => s.value === style) || STYLES[0],
    [style],
  );

  const handleConfirm = useCallback(() => {
    const cfg: Omit<PosterConfig, 'finalPrompt'> = {
      dimension,
      style,
      features,
      tagline,
      includeSocials,
      includeWebsite,
      extraNotes,
      logoVariant,
    };
    onConfirm({ ...cfg, finalPrompt: buildFinalPrompt(cfg, userPrompt) });
  }, [
    dimension,
    style,
    features,
    tagline,
    includeSocials,
    includeWebsite,
    extraNotes,
    logoVariant,
    userPrompt,
    onConfirm,
  ]);

  if (isFullyClosed && !visible) return null;

  return (
    <Modal
      visible={!isFullyClosed}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeSheet}
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }, backdropStyle]}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeSheet} />
      </Animated.View>

      <KeyboardAvoidingView
        behavior="padding"
        style={s.keyboardWrap}
        pointerEvents="box-none"
      >
        <Animated.View style={[s.sheet, { maxHeight: sheetHeight, paddingBottom: insets.bottom + 12 }, sheetStyle]}>
          <SheetGlassFill style={[StyleSheet.absoluteFill, s.overlay]} />

          <SheetDismissHandle onClose={closeSheet} style={s.handleWrap}>
            <View style={s.handle} />
          </SheetDismissHandle>
          <View style={s.headerRow}>
            <View style={s.headerLeft}>
              <Icon name="Palette" size={20} color="#F9FBFF" />
              <Text style={s.title}>{t('assistant.dehubPoster')}</Text>
            </View>
            <TouchableOpacity onPress={closeSheet} activeOpacity={0.7} hitSlop={8}>
              <Icon name="X" size={20} color="#6F7174" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={s.label}>{t("poster.format")}</Text>
            <View style={s.chipRow}>
              {DIMENSIONS.map((option) => {
                const selected = dimension === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[s.formatChip, selected && s.chipSelected]}
                    onPress={() => setDimension(option.value)}
                    activeOpacity={0.75}
                  >
                    <Text style={s.chipEmoji}>{option.icon}</Text>
                    <Text style={[s.chipLabel, selected && { color: '#F9FBFF' }]}>
                      {option.label}
                    </Text>
                    <Text style={s.chipHint}>{option.displayHint}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.label}>{t("poster.style")}</Text>
            <TouchableOpacity
              style={s.selector}
              activeOpacity={0.8}
              onPress={() => setStyleListOpen((open) => !open)}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.selectorName}>{selectedStyle.label}</Text>
                <Text style={s.selectorDesc}>{selectedStyle.displayDesc}</Text>
              </View>
              <Icon name={styleListOpen ? 'ChevronUp' : 'ChevronDown'} size={18} color="#6F7174" />
            </TouchableOpacity>
            {styleListOpen && (
              <View style={s.optionList}>
                {STYLES.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[s.optionRow, style === option.value && s.chipSelected]}
                    onPress={() => {
                      setStyle(option.value);
                      setStyleListOpen(false);
                    }}
                    activeOpacity={0.75}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.optionName}>{option.label}</Text>
                      <Text style={s.optionDesc}>{option.displayDesc}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={s.label}>{t("poster.logo")}</Text>
            <View style={s.chipRow}>
              {LOGO_VARIANTS.map((option) => {
                const selected = logoVariant === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[s.logoChip, selected && s.chipSelected]}
                    onPress={() => setLogoVariant(option.value)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.chipLabel, selected && { color: '#F9FBFF' }]}>
                      {option.label}
                    </Text>
                    <Text style={s.chipHint}>{option.hint}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.label}>{t("poster.headline")}</Text>
            <TextInput
              style={s.input}
              value={tagline}
              onChangeText={setTagline}
              placeholder={t("poster.headlinePlaceholder")}
              placeholderTextColor="#4B4D50"
              maxLength={60}
            />

            <Text style={s.label}>
              {t("poster.spotlightFeatures")}{features.length > 0 ? ` (${features.length})` : ''}
            </Text>
            {FEATURE_GROUPS.map((group) => {
              const isOpen = expandedGroup === group.group;
              const selectedCount = group.items.filter((i) => features.includes(i.value)).length;
              return (
                <View key={group.group} style={s.group}>
                  <TouchableOpacity
                    style={s.groupHeader}
                    onPress={() => setExpandedGroup(isOpen ? null : group.group)}
                    activeOpacity={0.75}
                  >
                    <Text style={s.groupTitle}>
                      {group.displayGroup}
                      {selectedCount > 0 ? ` · ${selectedCount}` : ''}
                    </Text>
                    <Icon name={isOpen ? 'ChevronUp' : 'ChevronDown'} size={16} color="#6F7174" />
                  </TouchableOpacity>
                  {isOpen &&
                    group.items.map((item) => {
                      const selected = features.includes(item.value);
                      return (
                        <TouchableOpacity
                          key={item.value}
                          style={[s.optionRow, selected && s.chipSelected]}
                          onPress={() => toggleFeature(item.value)}
                          activeOpacity={0.75}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={s.optionName}>{item.labelKey ? t(item.labelKey) : item.label}</Text>
                            <Text style={s.optionDesc}>{item.blurbKey ? t(item.blurbKey) : (item.displayBlurb ?? item.blurb)}</Text>
                          </View>
                          {selected && <Icon name="Check" size={15} color="#F9FBFF" />}
                        </TouchableOpacity>
                      );
                    })}
                </View>
              );
            })}

            <View style={s.toggleRow}>
              <Text style={s.toggleLabel}>{t("poster.includeWebsite")}</Text>
              <Switch
                value={includeWebsite}
                onValueChange={setIncludeWebsite}
                trackColor={{ false: 'rgba(255,255,255,0.2)', true: 'rgba(255,255,255,0.5)' }}
                thumbColor="#F4F4F5"
              />
            </View>
            <View style={s.toggleRow}>
              <Text style={s.toggleLabel}>{t("poster.includeSocials")}</Text>
              <Switch
                value={includeSocials}
                onValueChange={setIncludeSocials}
                trackColor={{ false: 'rgba(255,255,255,0.2)', true: 'rgba(255,255,255,0.5)' }}
                thumbColor="#F4F4F5"
              />
            </View>

            <Text style={s.label}>{t("poster.extraNotes")}</Text>
            <TextInput
              style={[s.input, { minHeight: 72 }]}
              value={extraNotes}
              onChangeText={setExtraNotes}
              placeholder={t("poster.notesPlaceholder")}
              placeholderTextColor="#4B4D50"
              multiline
              textAlignVertical="top"
            />
          </ScrollView>

          <View style={s.footer}>
            <TouchableOpacity style={s.cancelBtn} onPress={closeSheet} activeOpacity={0.7}>
              <Text style={s.cancelBtnText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.confirmBtn} onPress={handleConfirm} activeOpacity={0.8}>
              <Text style={s.confirmBtnText}>{t("settings.ensContinue")}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const s = StyleSheet.create({
  keyboardWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  overlay: {
    backgroundColor: SHEET_GLASS_FILL,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  handleWrap: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#F9FBFF', fontSize: 18, fontWeight: '700' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 16 },
  label: { color: '#A6A9AC', fontSize: 12, fontWeight: '500', marginTop: 16, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  formatChip: {
    width: '48%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  logoChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  chipSelected: {
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  chipEmoji: { fontSize: 14, marginBottom: 2 },
  chipLabel: { color: '#A6A9AC', fontSize: 13, fontWeight: '600' },
  chipHint: { color: '#6F7174', fontSize: 10, marginTop: 2 },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  selectorName: { color: '#F9FBFF', fontSize: 14, fontWeight: '600' },
  selectorDesc: { color: '#6F7174', fontSize: 11, marginTop: 2 },
  optionList: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  optionName: { color: '#F9FBFF', fontSize: 13, fontWeight: '500' },
  optionDesc: { color: '#6F7174', fontSize: 11, marginTop: 2 },
  group: {
    marginBottom: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  groupTitle: { color: '#F9FBFF', fontSize: 13, fontWeight: '500' },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F9FBFF',
    fontSize: 14,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    marginTop: 8,
  },
  toggleLabel: { color: '#F9FBFF', fontSize: 14 },
  footer: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 8 },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cancelBtnText: { color: '#F9FBFF', fontSize: 15, fontWeight: '600' },
  confirmBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F4F5',
  },
  confirmBtnText: { color: '#09090B', fontSize: 15, fontWeight: '700' },
});

export default memo(PosterConfigSheetComponent);
