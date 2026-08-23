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

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
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

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.9;

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

const DIMENSIONS: { value: PosterConfig['dimension']; label: string; hint: string; icon: string }[] = [
  { value: 'square', label: 'Square', hint: '1:1 · IG post', icon: '⬛' },
  { value: 'portrait', label: 'Poster', hint: '2:3 · story / flyer', icon: '📱' },
  { value: 'landscape', label: 'Banner', hint: '3:2 · X / YouTube', icon: '🖼️' },
  { value: 'story', label: 'Story', hint: '9:16 · IG story', icon: '📲' },
];

const STYLES: { value: string; label: string; desc: string }[] = [
  { value: 'dehub-template', label: '🎯 DeHub Banner', desc: 'On-brand chrome icon + silver headline (like our blog banners)' },
  { value: 'auto', label: '🎲 Surprise me', desc: 'Random top-tier archetype' },
  { value: 'apple-keynote', label: '🍎 Apple Keynote', desc: 'Minimal product hero, dramatic lighting' },
  { value: 'a24-film', label: '🎞️ A24 Film Poster', desc: 'Cinematic, grainy, moody' },
  { value: 'cyberpunk', label: '🌆 Cyberpunk Street', desc: 'Neon rain, glitch, futuristic' },
  { value: 'liquid-glass', label: '💧 Liquid Glass', desc: 'Frosted, translucent, premium' },
  { value: 'cosmic', label: '🌌 Cosmic Scale', desc: 'Nebulas, stars, epic scale' },
  { value: 'nike-campaign', label: '👟 Nike Campaign', desc: 'Bold, motion, athletic' },
  { value: 'luxury-watch', label: '⌚ Luxury Ad', desc: 'Macro detail, black backdrop' },
  { value: 'rave-flyer', label: '🔊 Rave Flyer', desc: 'Chaotic, energetic, underground' },
  { value: 'brutalist', label: '🧱 Brutalist Type', desc: 'Massive text, Swiss grid' },
  { value: 'magazine', label: '📖 Magazine Cover', desc: 'Editorial, character-led' },
  { value: 'sci-fi-keyart', label: '🚀 Sci-Fi Key Art', desc: 'Blockbuster movie poster' },
  { value: 'vaporwave', label: '🌴 Vaporwave', desc: 'Retro pastel, dreamy' },
  { value: 'product-teaser', label: '📦 Product Teaser', desc: 'Mysterious launch reveal' },
  { value: 'concert-tour', label: '🎤 Concert Tour', desc: 'Stage haze, spotlights' },
];

const LOGO_VARIANTS: { value: LogoVariant; label: string; hint: string }[] = [
  { value: 'primary', label: 'Wordmark', hint: 'Long-form DeHub logo' },
  { value: 'icon', label: 'Icon', hint: 'Compact D-mark' },
  { value: 'both', label: 'Both', hint: 'Wordmark + icon lockup' },
];

const FEATURE_GROUPS: { group: string; items: { value: string; label: string; blurb: string }[] }[] = [
  {
    group: 'Social & Feed',
    items: [
      { value: 'unified-feed', label: '📰 Unified Feed', blurb: 'Web2 + web3 social in one home' },
      { value: 'communities', label: '👥 Communities', blurb: 'Token-gated groups & channels' },
      { value: 'stories', label: '📸 Stories', blurb: 'Ephemeral daily posts' },
      { value: 'shorts', label: '🎞️ Shorts', blurb: 'Vertical short-form video' },
      { value: 'multi-posting', label: '📢 Multi-Posting', blurb: 'Cross-post to X, TG, Discord, IG' },
    ],
  },
  {
    group: 'Live & Media',
    items: [
      { value: 'livestream', label: '📡 Livestreaming', blurb: 'Native + aggregated streams' },
      { value: 'streaming-agg', label: '🎬 Streaming Aggregation', blurb: 'All major platforms in one' },
      { value: 'stages', label: '🎙️ Stages', blurb: 'Audio rooms with AI TTS hosts' },
      { value: 'radio', label: '📻 DeHub Radio', blurb: '24/7 crypto radio' },
      { value: 'tv-console', label: '📺 TV & Console Apps', blurb: 'Living room takeover' },
      { value: 'editor', label: '🎬 In-Browser Video Editor', blurb: 'Multi-track studio at /editor' },
    ],
  },
  {
    group: 'Chat & Comms',
    items: [
      { value: 'dm-tipped', label: '💌 Tipped DMs', blurb: 'End-to-end encrypted, tip-per-message' },
      { value: 'e2e', label: '🔒 E2E Encryption', blurb: 'Zero-knowledge chats' },
      { value: 'voice-video', label: '🎥 Voice & Video Calls', blurb: 'WebRTC calling' },
      { value: 'voice-notes', label: '🎤 Voice Notes', blurb: 'Waveform-visualised messages' },
    ],
  },
  {
    group: 'Token & DeFi',
    items: [
      { value: 'dhb-staking', label: '💎 DHB Staking (Base)', blurb: 'Stake DHB, earn rewards' },
      { value: 'lp-farming', label: '🌾 LP Farming', blurb: 'Provide liquidity, earn yield' },
      { value: 'token-bridge', label: '🌉 Token Bridge', blurb: 'BNB ↔ Base cross-chain' },
      { value: 'governance', label: '🗳️ Governance', blurb: 'On-chain proposals & voting' },
      { value: 'token-utility', label: '🪙 DHB Utility', blurb: 'Fees, boosts, gating, tipping' },
      { value: 'fiat-onramp', label: '💳 Fiat On-Ramp', blurb: 'Card → USDC → DHB' },
      { value: 'fiat-offramp', label: '💵 Fiat Off-Ramp', blurb: 'Token-to-cash conversion' },
      { value: 'uniswap-swap', label: '🔄 In-App Swap', blurb: 'Uniswap V3, one click' },
      { value: 'wallet', label: '👛 Cross-Chain Wallet', blurb: 'BNB + Base aggregated' },
    ],
  },
  {
    group: 'Marketplace & Commerce',
    items: [
      { value: 'stores', label: '🛍️ DeHub Stores', blurb: 'P2P commerce on Base DHB' },
      { value: 'fractions', label: '🧩 Fractions', blurb: 'Fractional NFT marketplace' },
      { value: 'work', label: '🧑‍💻 DeHub Bounties', blurb: 'Escrow bounties: social, clips, contracts' },
      { value: 'tipping', label: '💸 Tipping', blurb: 'Reward creators on any post' },
      { value: 'premium', label: '👑 DeHub Extra', blurb: 'Premium tiers with cashback' },
    ],
  },
  {
    group: 'AI & Creator Tools',
    items: [
      { value: 'ai-assistant', label: '🤖 AI Assistant', blurb: 'DeHub-aware chat + skills' },
      { value: 'ai-image', label: '🖼️ AI Image Gen', blurb: 'GPT-image-2 & Nano Banana 2' },
      { value: 'ai-video', label: '🎥 AI Video Gen', blurb: 'Per-second billed clips' },
      { value: 'ai-toolkits', label: '🧰 AI Toolkits', blurb: 'Auto tips, engagement, guidance' },
      { value: 'characters', label: '🎭 Characters', blurb: '@mention reusable AI personas' },
      { value: 'skills', label: '🧠 User Skills', blurb: 'Personal AI knowledge packs' },
      { value: 'affiliate', label: '🤝 20% Affiliate', blurb: '2-tier referral revenue share' },
    ],
  },
  {
    group: 'Games & DePIN',
    items: [
      { value: 'lcs-tge', label: '🎮 Last Chad Standing TGE', blurb: 'March 2026 launch' },
      { value: 'games-hub', label: '🕹️ Games Hub', blurb: 'Web3-native mini games' },
      { value: 'depin', label: '🛰️ DePIN', blurb: 'Decentralized physical infra' },
      { value: 'sdks', label: '🛠️ Developer SDKs', blurb: 'Build mini apps & games' },
    ],
  },
  {
    group: 'Growth & Reach',
    items: [
      { value: 'ad-stack', label: '🎯 Advertising Stack', blurb: 'Wallet-based targeting' },
      { value: 'apple-store', label: '📱 Apple App Store', blurb: 'Native iOS launch' },
      { value: 'blog', label: '✍️ Blog', blurb: 'Long-form + SEO content' },
      { value: 'events', label: '📅 Events', blurb: 'IRL & virtual RSVPs' },
      { value: 'vr-hub', label: '🥽 V/AR Profile Hub', blurb: 'Immersive identity' },
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
  const insets = useSafeAreaInsets();
  const [dimension, setDimension] = useState<PosterConfig['dimension']>('portrait');
  const [style, setStyle] = useState('dehub-template');
  const [features, setFeatures] = useState<string[]>([]);
  const [tagline, setTagline] = useState('');
  const [includeSocials, setIncludeSocials] = useState(false);
  const [includeWebsite, setIncludeWebsite] = useState(false);
  const [extraNotes, setExtraNotes] = useState('');
  const [logoVariant, setLogoVariant] = useState<LogoVariant>('primary');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [styleListOpen, setStyleListOpen] = useState(false);

  const translateY = useSharedValue(SHEET_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const [isFullyClosed, setIsFullyClosed] = useState(!visible);

  useEffect(() => {
    if (visible) {
      setIsFullyClosed(false);
      setDimension(detectDimension(userPrompt));
      setStyle(detectStyle(userPrompt));
      setFeatures(detectFeatures(userPrompt));
      setTagline(detectTagline(userPrompt));
      setIncludeSocials(detectSocials(userPrompt));
      setIncludeWebsite(detectWebsite(userPrompt));
      setExtraNotes('');
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
        SHEET_HEIGHT,
        { duration: 220, easing: Easing.in(Easing.cubic) },
        () => runOnJS(setIsFullyClosed)(true),
      );
      backdropOpacity.value = withTiming(0, { duration: 180 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, userPrompt]);

  const closeSheet = useCallback(() => {
    translateY.value = withTiming(
      SHEET_HEIGHT,
      { duration: 220, easing: Easing.in(Easing.cubic) },
      () => runOnJS(onClose)(),
    );
    backdropOpacity.value = withTiming(0, { duration: 180 });
  }, [onClose, translateY, backdropOpacity]);

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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.keyboardWrap}
        pointerEvents="box-none"
      >
        <Animated.View style={[s.sheet, { paddingBottom: insets.bottom + 12 }, sheetStyle]}>
          <View style={[StyleSheet.absoluteFill, s.overlay]} />

          <View style={s.handleWrap}>
            <View style={s.handle} />
          </View>
          <View style={s.headerRow}>
            <View style={s.headerLeft}>
              <Icon name="Palette" size={20} color="#F9FBFF" />
              <Text style={s.title}>DeHub Poster</Text>
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
            <Text style={s.label}>Format</Text>
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
                    <Text style={s.chipHint}>{option.hint}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.label}>Style</Text>
            <TouchableOpacity
              style={s.selector}
              activeOpacity={0.8}
              onPress={() => setStyleListOpen((open) => !open)}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.selectorName}>{selectedStyle.label}</Text>
                <Text style={s.selectorDesc}>{selectedStyle.desc}</Text>
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
                      <Text style={s.optionDesc}>{option.desc}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={s.label}>Logo</Text>
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

            <Text style={s.label}>Headline</Text>
            <TextInput
              style={s.input}
              value={tagline}
              onChangeText={setTagline}
              placeholder="Composited crisply after generation — leave blank for none"
              placeholderTextColor="#4B4D50"
              maxLength={60}
            />

            <Text style={s.label}>
              Spotlight features{features.length > 0 ? ` (${features.length})` : ''}
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
                      {group.group}
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
                            <Text style={s.optionName}>{item.label}</Text>
                            <Text style={s.optionDesc}>{item.blurb}</Text>
                          </View>
                          {selected && <Icon name="Check" size={15} color="#F9FBFF" />}
                        </TouchableOpacity>
                      );
                    })}
                </View>
              );
            })}

            <View style={s.toggleRow}>
              <Text style={s.toggleLabel}>Include website</Text>
              <Switch
                value={includeWebsite}
                onValueChange={setIncludeWebsite}
                trackColor={{ false: 'rgba(255,255,255,0.2)', true: 'rgba(255,255,255,0.5)' }}
                thumbColor="#F4F4F5"
              />
            </View>
            <View style={s.toggleRow}>
              <Text style={s.toggleLabel}>Include socials</Text>
              <Switch
                value={includeSocials}
                onValueChange={setIncludeSocials}
                trackColor={{ false: 'rgba(255,255,255,0.2)', true: 'rgba(255,255,255,0.5)' }}
                thumbColor="#F4F4F5"
              />
            </View>

            <Text style={s.label}>Extra notes</Text>
            <TextInput
              style={[s.input, { minHeight: 72 }]}
              value={extraNotes}
              onChangeText={setExtraNotes}
              placeholder="Anything else the poster must show"
              placeholderTextColor="#4B4D50"
              multiline
              textAlignVertical="top"
            />
          </ScrollView>

          <View style={s.footer}>
            <TouchableOpacity style={s.cancelBtn} onPress={closeSheet} activeOpacity={0.7}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.confirmBtn} onPress={handleConfirm} activeOpacity={0.8}>
              <Text style={s.confirmBtnText}>Continue</Text>
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
    maxHeight: SHEET_HEIGHT,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  overlay: {
    backgroundColor: '#0C0C0E',
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
