/**
 * DeHub Link Card
 * ===============
 * Turns a parsed DeHub entity link into a card. The mobile counterpart of the
 * web app's DehubLinkEmbed, and the same deal: every surface that shows
 * user-written text renders links through here, so a shop item looks the same
 * in a DM as it does in the feed.
 *
 * Mobile recognised exactly one link shape before this — `/post/<id>` in a DM.
 * A community, a shop item, an event or a profile link arrived as a bare URL
 * everywhere, including in messages sent from the web app where the sender had
 * just watched it render as a card.
 *
 * Cards fall back to a chip that still opens the link. Surfaces strip the URL
 * out of the text on the assumption the card replaces it, so a card that
 * rendered nothing when its entity failed to load would take the link with it.
 */

import React, { memo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import Icon, { type IconName } from '../ui/Icon';
import SharedPostPreview from '../DM/SharedPostPreview';
import { ScreenNames } from '../../navigation/ScreenNames';
import { supabase } from '../../services/supabase';
import { getCommunityBySlug, previewCommunityInvite } from '../../services/communities.service';
import { getAccount } from '../../services/user.service';
import { useStoreById, useStoreListing } from '../../hooks/useStores';
import { getAvatarUrl } from '../../libs/misc';
import { formatCompactNumber } from '../../libs/numbers.util';
import { dehubLinkLabel, type DehubLinkMatch } from '../../libs/dehub-links';
import { useStages } from '../../context/StageContext';

/** How many cards one message or caption may draw before the rest stay as text. */
export const MAX_CARDS_PER_MESSAGE = 2;

// ── Shared shell ────────────────────────────────────────────────────────────

interface RowCardProps {
  /** Small label above the title: "Community invite", "Item", … */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  meta?: string;
  imageUri?: string | null;
  /** Icon shown when there is no image. */
  fallbackIcon: IconName;
  bannerUri?: string | null;
  dimmed?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}

const RowCard: React.FC<RowCardProps> = ({
  eyebrow,
  title,
  subtitle,
  meta,
  imageUri,
  fallbackIcon,
  bannerUri,
  dimmed,
  onPress,
  onLongPress,
}) => (
  <TouchableOpacity
    activeOpacity={0.8}
    onPress={onPress}
    onLongPress={onLongPress}
    delayLongPress={350}
    style={[styles.card, dimmed && styles.cardDimmed]}
  >
    {/* The cover, whole and uncropped — the same 16:9 contain-on-black
        treatment the stage page itself uses. It used to be a dimmed
        object-cover layer BEHIND the row, which reduced a full graphic to
        ~68px of its middle. */}
    {!!bannerUri && (
      <Image source={{ uri: bannerUri }} style={styles.banner} contentFit="contain" />
    )}
    <View style={styles.row}>
      {/* With the banner showing the artwork in full, repeating it as a 48px
          square is noise — the thumb only earns its place bannerless. */}
      {!bannerUri && (
        <View style={styles.thumbWrap}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.thumb} contentFit="cover" />
          ) : (
            <Icon name={fallbackIcon} size={20} color="#71717a" />
          )}
        </View>
      )}
      <View style={styles.body}>
        {!!eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
        {!!meta && <Text style={styles.meta}>{meta}</Text>}
      </View>
    </View>
  </TouchableOpacity>
);

const SkeletonCard = () => <View style={styles.skeleton} />;

// ── Per-kind cards ──────────────────────────────────────────────────────────

const CommunityCardEmbed: React.FC<{ slug: string; onOpen: () => void; fallback: React.ReactElement }> = ({
  slug,
  onOpen,
  fallback,
}) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dehub-link', 'community', slug],
    queryFn: () => getCommunityBySlug(slug),
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <SkeletonCard />;
  if (isError || !data) return fallback;

  return (
    <RowCard
      eyebrow="Community"
      title={data.name}
      subtitle={data.description || undefined}
      meta={`${formatCompactNumber(data.member_count ?? 0)} members`}
      imageUri={data.avatar_url}
      bannerUri={data.banner_url}
      fallbackIcon="Users"
      onPress={onOpen}
    />
  );
};

const InviteCardEmbed: React.FC<{ code: string; onOpen: () => void; fallback: React.ReactElement }> = ({
  code,
  onOpen,
  fallback,
}) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dehub-link', 'invite', code],
    queryFn: () => previewCommunityInvite(code),
    staleTime: 30_000,
    retry: false,
  });

  if (isLoading) return <SkeletonCard />;
  if (isError || !data) return fallback;

  // An invite that has been revoked, has expired or has hit its cap looks
  // identical to a live one until it is tapped. Say so on the card instead.
  const invalidCopy: Record<string, string> = {
    revoked: 'Invite revoked',
    expired: 'Invite expired',
    exhausted: 'Invite fully used',
    not_found: 'Invite not found',
  };

  if (!data.is_valid) {
    return (
      <RowCard
        dimmed
        eyebrow={invalidCopy[data.reason ?? 'not_found'] ?? 'Invite unavailable'}
        title="This invite cannot be used"
        fallbackIcon="Ticket"
        onPress={onOpen}
      />
    );
  }

  return (
    <RowCard
      eyebrow="Community invite"
      title={data.name || 'a community'}
      subtitle={data.description || undefined}
      meta={[
        typeof data.member_count === 'number' ? `${formatCompactNumber(data.member_count)} members` : null,
        data.requires_approval ? 'Approval needed' : null,
      ]
        .filter(Boolean)
        .join(' · ')}
      imageUri={data.avatar_url}
      bannerUri={data.banner_url}
      fallbackIcon="Ticket"
      onPress={onOpen}
    />
  );
};

const StoreCardEmbed: React.FC<{ storeId: string; onOpen: () => void; fallback: React.ReactElement }> = ({
  storeId,
  onOpen,
  fallback,
}) => {
  const { data, isLoading, isError } = useStoreById(storeId);

  if (isLoading) return <SkeletonCard />;
  if (isError || !data) return fallback;

  return (
    <RowCard
      eyebrow="Store"
      title={data.name || 'Store'}
      subtitle={data.description || undefined}
      imageUri={data.avatar_url}
      bannerUri={data.banner_url}
      fallbackIcon="Store"
      onPress={onOpen}
    />
  );
};

const ListingCardEmbed: React.FC<{ listingId: string; onOpen: () => void; fallback: React.ReactElement }> = ({
  listingId,
  onOpen,
  fallback,
}) => {
  const { data, isLoading, isError } = useStoreListing(listingId);

  if (isLoading) return <SkeletonCard />;
  if (isError || !data) return fallback;

  const images = Array.isArray(data.images) ? (data.images as string[]) : [];
  const price = Number(data.price) || 0;
  const soldOut = data.stock_quantity === 0;

  return (
    <RowCard
      eyebrow={data.stores?.name || 'Item'}
      title={data.title}
      subtitle={`$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${soldOut ? ' · sold out' : ''}`}
      imageUri={images[0]}
      fallbackIcon="Image"
      dimmed={soldOut}
      onPress={onOpen}
    />
  );
};

const EventCardEmbed: React.FC<{ eventNumber: string; onOpen: () => void; fallback: React.ReactElement }> = ({
  eventNumber,
  onOpen,
  fallback,
}) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dehub-link', 'event', eventNumber],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_events')
        .select('*')
        .eq('event_number', Number(eventNumber))
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    staleTime: 60_000,
  });

  if (isLoading) return <SkeletonCard />;
  if (isError || !data) return fallback;

  const starts = data.starts_at ? new Date(data.starts_at) : null;
  const when = starts
    ? starts.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : '';
  const time = starts
    ? starts.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : '';

  return (
    <RowCard
      eyebrow={data.is_private ? 'Private event' : 'Event'}
      title={data.title}
      subtitle={[when, time].filter(Boolean).join(' · ') || undefined}
      meta={[
        `${Number(data.going_count) || 0} going`,
        data.location ? String(data.location) : null,
      ]
        .filter(Boolean)
        .join(' · ')}
      imageUri={data.cover_image_url}
      bannerUri={data.cover_image_url}
      fallbackIcon="Calendar"
      onPress={onOpen}
    />
  );
};

const StageCardEmbed: React.FC<{ stageId: string; onOpen: () => void; fallback: React.ReactElement }> = ({
  stageId,
  onOpen,
  fallback,
}) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dehub-link', 'stage', stageId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audio_spaces')
        .select('*')
        .eq('id', stageId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    // A scheduled stage's only volatile field is whether it has started, and
    // the card is cheap to be a minute stale about.
    staleTime: 60_000,
  });

  if (isLoading) return <SkeletonCard />;
  if (isError || !data) return fallback;

  const starts = data.scheduled_at ? new Date(data.scheduled_at) : null;
  const isLive = data.status === 'live';
  const isEnded = data.status === 'ended';
  const isOverdue = !!starts && starts.getTime() < Date.now();

  const when = starts
    ? starts.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : '';
  const time = starts
    ? starts.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : '';

  // A live stage has already answered "when", and an ended one has nothing to
  // answer — so the subtitle only carries a date while the stage is upcoming.
  const subtitle = isLive
    ? `${Math.max(1, (data.speaker_count || 1) + (data.listener_count || 0))} listening`
    : isEnded
      ? 'Ended'
      : [when, time].filter(Boolean).join(' · ') || undefined;

  return (
    <RowCard
      eyebrow={isLive ? 'Live now' : isEnded ? 'Stage' : isOverdue ? 'Starting soon' : 'Upcoming stage'}
      title={data.title}
      subtitle={subtitle}
      meta={`@${data.host_username || String(data.host_wallet_address || '').slice(0, 6)}`}
      imageUri={data.cover_image_url}
      bannerUri={data.cover_image_url}
      fallbackIcon="Mic"
      dimmed={isEnded}
      onPress={onOpen}
    />
  );
};

const ProfileCardEmbed: React.FC<{ username: string; onOpen: () => void; fallback: React.ReactElement }> = ({
  username,
  onOpen,
  fallback,
}) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dehub-link', 'profile', username.toLowerCase()],
    queryFn: () => getAccount(username),
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <SkeletonCard />;

  // `/:username` is the web app's catch-all route, so a link to a page that has
  // since been renamed arrives here looking like a person who does not exist.
  // The link is better than a card claiming a stranger.
  const user: any = (data as any)?.result ?? data;
  if (isError || !user || (!user.username && !user.address)) return fallback;

  const handle = String(user.username || username).replace('@', '');
  const followers =
    typeof user.followers === 'number'
      ? user.followers
      : Array.isArray(user.followers)
        ? user.followers.length
        : 0;
  const avatar = user.avatarImageUrl || user.avatarUrl || user.avatar_url;

  return (
    <RowCard
      eyebrow="Profile"
      title={user.displayName || user.display_name || handle}
      subtitle={`@${handle}`}
      meta={`${formatCompactNumber(followers)} followers`}
      imageUri={avatar ? getAvatarUrl(avatar) : null}
      fallbackIcon="User"
      onPress={onOpen}
    />
  );
};

// ── Dispatcher ──────────────────────────────────────────────────────────────

interface DehubLinkCardProps {
  link: DehubLinkMatch;
  /** DM bubbles tint their content to match the sender's side. */
  isMine?: boolean;
  /** Caption that arrived alongside the link — used as a post card's title. */
  fallbackTitle?: string;
  /**
   * Inside a DM bubble, which sizes itself to its content and so gives a
   * full-width child nothing to resolve against. Pins the card to the same
   * width the post card already uses.
   */
  inBubble?: boolean;
  onLongPress?: () => void;
}

/**
 * Open a DeHub link inside the app.
 *
 * Exported because the feed's caption renderer needs the same routing: a
 * dehub.io link there used to be handed to the in-app browser, so tapping a
 * link to our own community loaded a web view of the site inside the app.
 */
export function useOpenDehubLink() {
  const navigation = useNavigation<any>();
  const { openModal: openStages, joinSpace } = useStages();

  return useCallback(
    (link: DehubLinkMatch) => {
      switch (link.kind) {
        case 'post':
          navigation.navigate(ScreenNames.FeedDetail, { tokenId: link.tokenId });
          return;
        case 'profile':
          navigation.navigate(ScreenNames.Profile, { username: link.username });
          return;
        case 'community':
          navigation.navigate(ScreenNames.CommunityDetail, { slug: link.slug });
          return;
        case 'communityInvite':
          navigation.navigate(ScreenNames.CommunityInvite, { code: link.code });
          return;
        case 'store':
          navigation.navigate(ScreenNames.StoreDetail, { storeId: link.storeId });
          return;
        case 'listing':
          navigation.navigate(ScreenNames.ListingDetail, { listingId: link.listingId });
          return;
        case 'event':
          // There is no per-event screen on mobile yet; the list is where an
          // event link can actually land, and it beats a dead tap.
          navigation.navigate(ScreenNames.Events);
          return;
        case 'stage':
          // Stages are modal-based on native — there is no stage screen to
          // navigate to. Joining is attempted first because a live stage is
          // what the link most often points at; joinSpace refuses anything
          // that is not live, and the browse modal (which lists upcoming) is
          // the right landing spot for a stage that has not started.
          openStages('browse');
          void joinSpace(link.stageId!).then((ok) => {
            if (ok) openStages('live');
          });
          return;
        default:
          return;
      }
    },
    [navigation, openStages, joinSpace],
  );
}

const DehubLinkCardComponent: React.FC<DehubLinkCardProps> = ({
  link,
  isMine = false,
  fallbackTitle,
  inBubble = false,
  onLongPress,
}) => {
  const openLink = useOpenDehubLink();
  const open = useCallback(() => openLink(link), [openLink, link]);

  const fallback = (
    <RowCard
      eyebrow="DeHub"
      title={`View ${dehubLinkLabel(link.kind)}`}
      subtitle={`dehub.io${link.path}`}
      fallbackIcon="Link"
      onPress={open}
      onLongPress={onLongPress}
    />
  );

  // The post card owns its own box (width, padding) so it can match the bubble
  // exactly; the rest share one shell and get sized here.
  if (link.kind === 'post') {
    return (
      <SharedPostPreview
        tokenId={link.tokenId!}
        isMine={isMine}
        fallbackTitle={fallbackTitle}
        onPress={open}
        onLongPress={onLongPress}
      />
    );
  }

  let card: React.ReactElement;
  switch (link.kind) {
    case 'profile':
      card = <ProfileCardEmbed username={link.username!} onOpen={open} fallback={fallback} />;
      break;
    case 'community':
      card = <CommunityCardEmbed slug={link.slug!} onOpen={open} fallback={fallback} />;
      break;
    case 'communityInvite':
      card = <InviteCardEmbed code={link.code!} onOpen={open} fallback={fallback} />;
      break;
    case 'store':
      card = <StoreCardEmbed storeId={link.storeId!} onOpen={open} fallback={fallback} />;
      break;
    case 'listing':
      card = <ListingCardEmbed listingId={link.listingId!} onOpen={open} fallback={fallback} />;
      break;
    case 'event':
      card = <EventCardEmbed eventNumber={link.eventNumber!} onOpen={open} fallback={fallback} />;
      break;
    case 'stage':
      card = <StageCardEmbed stageId={link.stageId!} onOpen={open} fallback={fallback} />;
      break;
    default:
      card = fallback;
  }

  return inBubble ? <View style={styles.bubbleWrap}>{card}</View> : card;
};

// Matches SharedPostPreview's CARD_WIDTH: the bubble caps at 75% of the row,
// and the card plus its margins has to stay inside that or the bubble's
// overflow-hidden clips its right edge on narrow screens.
const BUBBLE_CARD_WIDTH = Math.min(240, Math.round(Dimensions.get('window').width * 0.75) - 40);

const styles = StyleSheet.create({
  bubbleWrap: { width: BUBBLE_CARD_WIDTH, paddingHorizontal: 8, paddingBottom: 2 },
  card: {
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    position: 'relative',
  },
  cardDimmed: { opacity: 0.65 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
  },
  banner: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  thumbWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumb: { width: '100%', height: '100%' },
  body: { flex: 1, minWidth: 0 },
  eyebrow: { color: '#71717a', fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  title: { color: '#fff', fontSize: 14, fontWeight: '600', marginTop: 1 },
  subtitle: { color: '#d4d4d8', fontSize: 12, marginTop: 2 },
  meta: { color: '#a1a1aa', fontSize: 12, marginTop: 3 },
  skeleton: {
    height: 68,
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
});

export default memo(DehubLinkCardComponent);

/** Render every card a block of text has earned, capped. */
export const DehubLinkCards: React.FC<{
  links: DehubLinkMatch[];
  isMine?: boolean;
  onLongPress?: () => void;
}> = ({ links, isMine, onLongPress }) => {
  if (links.length === 0) return null;
  return (
    <>
      {links.slice(0, MAX_CARDS_PER_MESSAGE).map((link) => (
        <DehubLinkCardComponent
          key={`${link.kind}-${link.path}`}
          link={link}
          isMine={isMine}
          onLongPress={onLongPress}
        />
      ))}
    </>
  );
};
