import { useTranslation as _useCopy } from 'react-i18next';
import BadgeArtwork from "../common/BadgeArtwork";
import { getBadgeHoverOpticalStyle } from "../../libs/misc";
/**
 * SuggestedAccountCard – a "cover card" for the who-to-follow rows.
 *
 * A mini profile, the same card web draws (components/app/FollowCoverCard.tsx):
 *   • the banner their profile shows (their own, or the same default banner
 *     the profile picks for them), with a small X to skip them
 *   • the avatar over the banner's lower edge, name + badge, @handle
 *   • two lines of bio, or "No bio yet"
 *   • the faces and names of people you follow who follow them, when any do
 *   • follower count and a solid Follow button in the theme's accent, reading
 *     Follow back when they already follow you
 *
 * Skinned themes draw the card in their own surface (skin.card). System,
 * System Light and Minimal draw no box at all: the cards stand on the page with
 * a hairline between them, as their feeds do. Written dark like the rest of
 * the app; System Light's tone pass turns the greys around.
 */
import React, { FC, useCallback, useState, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, type StyleProp, type ViewStyle } from "react-native";
import SmartImage from "../common/SmartImage";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import Icon from "../ui/Icon";
import { useUser } from "../../context/AuthContext";
import { getAvatarUrl, getBadgeUrlFor, getCoverUrl, getDefaultBanner, DEFAULT_BANNER_SENTINEL } from "../../libs/misc";
import { formatCompactNumber } from "../../libs/numbers.util";
import {
  followUser,
  unfollowUser,
  type SuggestedAccount,
} from "../../services/user.service";
import { reportActionError } from "../../libs/error-feedback";
import Avatar from "../common/Avatar";
import type { FollowState } from "../Search/SearchAccountChip";
import { useAppTheme } from "../../context/ThemeContext";
import { MONO_TEXT } from "../../theme/skins";

export const COVER_CARD_WIDTH = 232;
const COVER_H = 76;
const AVATAR = 56;

/** Hairline between flat cards (System, System Light, Minimal). */
const FLAT_DIVIDER = "rgba(255,255,255,0.12)";

/** Follow button, avatar ring and text per theme: the theme's one accent. */
interface CardInk {
  button: string;
  buttonText: string;
  ring: string;
  ringWidth: number;
  ink: string;
  muted: string;
  avatarFill: string;
}

const DEFAULT_INK: CardInk = {
  button: "#FFFFFF",
  buttonText: "#09090B",
  ring: "#0A0A0A",
  ringWidth: 3,
  ink: "#FFFFFF",
  muted: "#A1A1AA",
  avatarFill: "#2A2C2E",
};
const GLASS_INK: CardInk = { ...DEFAULT_INK, ring: "rgba(255,255,255,0.9)", ringWidth: 2, muted: "rgba(255,255,255,0.64)" };

const THEME_INK: Record<string, CardInk> = {
  glass: { ...GLASS_INK, button: "#D7FFFF", buttonText: "#06343B", ink: "#F2FFFF", muted: "#B8D5D8", ring: "rgba(225,255,255,0.85)" },
  cosmic: GLASS_INK,
  hazy: GLASS_INK,
  swarms: GLASS_INK,
  lavalamp: GLASS_INK,
  winter: GLASS_INK,
  island: { ...GLASS_INK, button: "#FF7A8A", buttonText: "#2A0A10" },
  horror: { ...GLASS_INK, button: "#FF2B2B", buttonText: "#FFFFFF" },
  osaka: { ...DEFAULT_INK, button: "rgb(255,111,181)", buttonText: "#1A0614", ring: "rgba(111,227,255,0.7)", ringWidth: 1.5, ink: "#F4F1FF", muted: "rgb(176,170,196)", avatarFill: "rgba(255,111,181,0.2)" },
  war: { ...DEFAULT_INK, button: "rgb(79,227,224)", buttonText: "#041312", ring: "rgba(79,227,224,0.7)", ringWidth: 1.5, ink: "rgb(214,208,190)", muted: "rgb(190,196,194)", avatarFill: "rgba(79,227,224,0.16)" },
  hacker: { ...DEFAULT_INK, button: "rgb(57,255,136)", buttonText: "#001A09", ring: "rgba(57,255,136,0.7)", ringWidth: 1.5, ink: "rgb(57,255,136)", muted: "rgb(120,200,150)", avatarFill: "rgba(57,255,136,0.14)" },
  jungle: { ...DEFAULT_INK, button: "#E2B060", buttonText: "#22160A", ring: "rgb(38,28,19)", ink: "rgb(246,240,227)", muted: "rgb(198,182,158)", avatarFill: "rgba(226,176,96,0.2)" },
};

interface SuggestedAccountCardProps {
  account: SuggestedAccount;
  onFollowChange?: (address: string, newState: FollowState) => void;
  /** Called when user dismisses this suggestion (X button). */
  onDismiss?: (address: string) => void;
  /** Last card in the row: no hairline after it in the flat themes. */
  isLast?: boolean;
  /** Some card in the row has mutual friends: keep the line so the row lines up. */
  reasonRow?: boolean;
}


const SuggestedAccountCardComponent: FC<SuggestedAccountCardProps> = ({
  account,
  onFollowChange,
  onDismiss,
  isLast = false,
  reasonRow = false,
}) => {
  const { t: _copy } = _useCopy();
  const { showUserProfile } = useUserProfileSheet();
  const { skin, theme } = useAppTheme();
  const authUser = useUser() as { address?: string } | null;
  const myAddress = authUser?.address;
  const flat = !skin;
  const ink = (theme && THEME_INK[theme]) || DEFAULT_INK;
  const square = !!skin?.square;
  const mono = !!skin?.mono;

  const isOwnAccount = !!(
    myAddress &&
    account.address &&
    myAddress.toLowerCase() === account.address.toLowerCase()
  );

  // Follow state
  const [isFollowing, setIsFollowing] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  const username = account.username || account.address?.slice(0, 6) || "unknown";
  const displayName = account.displayName || username;
  const avatarSrc = getAvatarUrl(account.avatarImageUrl || "");
  const displayAvatar =
    avatarSrc && avatarSrc !== "default-avatar" ? avatarSrc : undefined;
  const coverSrc = account.coverImageUrl ? getCoverUrl(account.coverImageUrl, COVER_CARD_WIDTH) : DEFAULT_BANNER_SENTINEL;
  const cover = coverSrc !== DEFAULT_BANNER_SENTINEL ? coverSrc : undefined;
  const followers = account.followers ?? 0;
  const badgeImage = getBadgeUrlFor(account);
  const bio = account.aboutMe?.trim() || "";
  const mutuals = useMemo(
    () => (account.mutualConnections ?? []).slice(0, 2),
    [account.mutualConnections],
  );

  const reasonLine = useMemo(() => {
    if (mutuals.length) {
      const names = mutuals
        .map((c) => c.displayName || c.username || "someone")
        .join(", ");
      return _copy("copy.fef6a1a97127", { defaultValue: "Followed by {{value1}}", value1: names });
    }
    return null;
  }, [mutuals, _copy]);


  const handlePress = useCallback(() => {
    const identifier = account.username || account.address;
    if (!identifier) return;
    showUserProfile(identifier);
  }, [account.username, account.address, showUserProfile]);

  const handleDismiss = useCallback(() => {
    onDismiss?.(account.address);
  }, [account.address, onDismiss]);

  const handleFollowToggle = useCallback(async () => {
    if (!myAddress || !account.address || isOwnAccount) return;
    setFollowLoading(true);
    try {
      if (isFollowing || isPending) {
        await unfollowUser(myAddress, account.address);
        setIsFollowing(false);
        setIsPending(false);
        onFollowChange?.(account.address, {
          isFollowing: false,
          isFollowRequestPending: false,
        });
      } else {
        const res = await followUser(myAddress, account.address);
        if (res.status === "pending") {
          setIsPending(true);
          setIsFollowing(false);
          onFollowChange?.(account.address, {
            isFollowing: false,
            isFollowRequestPending: true,
          });
        } else {
          setIsFollowing(true);
          setIsPending(false);
          onFollowChange?.(account.address, {
            isFollowing: true,
            isFollowRequestPending: false,
          });
        }
      }
    } catch (e) {
      console.error("[SuggestedAccountCard] follow error", e);
      // The row hides a card shortly after its follow lands, so a rejected tap
      // has to put it back — and a rejection from the rate limiter says so out
      // loud, because the reader is usually mid-burst and not watching.
      onFollowChange?.(account.address, {
        isFollowing: false,
        isFollowRequestPending: false,
      });
      reportActionError(e, "Couldn't follow this account");
    } finally {
      setFollowLoading(false);
    }
  }, [myAddress, account.address, isOwnAccount, isFollowing, isPending, onFollowChange]);

  const done = isFollowing || isPending;
  const followLabel = isPending
    ? _copy("follow.requested", { defaultValue: "Requested" })
    : isFollowing
      ? _copy("follow.following", { defaultValue: "Following" })
      : account.followsYou
        ? _copy("follow.followBack", { defaultValue: "Follow back" })
        : _copy("follow.follow", { defaultValue: "Follow" });

  // Skinned themes: the theme's own card, clipped so the banner takes its top
  // corners. Flat themes: no surface, a hairline after the card.
  const cardStyle: StyleProp<ViewStyle> = flat
    ? [styles.card, styles.flatCard, !isLast && styles.flatDivider]
    : [styles.card, skin!.card as ViewStyle, { overflow: "hidden" }, square && { borderRadius: 0 }];
  const coverRadius = flat ? (theme === "minimal" ? 0 : 10) : 0;
  const pad = flat ? 0 : 12;
  const textMono = mono ? MONO_TEXT : undefined;

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={handlePress} style={cardStyle}>
      {/* The banner is a picture: dark-surface keeps System Light's tone pass
          off it and off the X chip that sits on it. */}
      <View className="dark-surface" style={[styles.cover, { borderRadius: coverRadius }]}>
        <SmartImage
          source={cover ? { uri: cover } : getDefaultBanner(account.address || "")}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
        {/* Fill on an inner view: a neutral-filled touchable would be
            repainted as the theme's control glass (libs/jsx/controls.js). */}
        <TouchableOpacity
          onPress={handleDismiss}
          activeOpacity={0.6}
          style={styles.dismissHit}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          accessibilityLabel={_copy("converter.dismiss", { defaultValue: "Dismiss" })}
        >
          <View style={[styles.dismiss, square && { borderRadius: 0 }]}>
            <Icon name="X" size={13} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
      </View>

      <View style={{ marginTop: -AVATAR / 2, marginLeft: flat ? 10 : pad, alignSelf: "flex-start" }}>
        <Avatar
          uri={displayAvatar}
          size={AVATAR}
          name={displayName}
          borderWidth={ink.ringWidth}
          borderColor={ink.ring}
          style={square ? { borderRadius: 0 } : undefined}
        />
      </View>

      <View style={{ paddingHorizontal: pad, paddingTop: 8, paddingBottom: pad }}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: ink.ink }, textMono]} numberOfLines={1}>
            {displayName}
          </Text>
          {badgeImage ? (
            <BadgeArtwork
              source={badgeImage}
              style={getBadgeHoverOpticalStyle(badgeImage, 15, 0, 20)}
              contentFit="contain"
            />
          ) : null}
        </View>
        <Text style={[styles.handle, { color: ink.muted }, textMono]} numberOfLines={1}>
          @{username}
        </Text>
        <Text
          style={[styles.bio, bio ? { color: ink.ink } : [styles.bioEmpty, { color: ink.muted }]]}
          numberOfLines={2}
        >
          {bio || _copy("copy.0c820caf16c0", { defaultValue: "No bio yet" })}
        </Text>

        {reasonLine || reasonRow ? (
        <View style={styles.reasonRow}>
          {mutuals.length > 0 ? (
            <View style={styles.mutuals}>
              {mutuals.map((m, i) => {
                const src = getAvatarUrl(m.avatarImageUrl || "");
                const face = src && src !== "default-avatar" ? src : undefined;
                return (
                  <View
                    key={m.address}
                    style={[
                      styles.mutual,
                      { borderColor: ink.ring, backgroundColor: ink.avatarFill, marginLeft: i === 0 ? 0 : -5 },
                      square && { borderRadius: 0 },
                    ]}
                  >
                    {face ? <SmartImage source={{ uri: face }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                  </View>
                );
              })}
            </View>
          ) : null}
          {reasonLine ? (
            <Text style={[styles.reason, { color: ink.muted }]} numberOfLines={1}>
              {reasonLine}
            </Text>
          ) : null}
        </View>
        ) : null}

        <View style={styles.foot}>
          <Text style={[styles.count, { color: ink.muted }]} numberOfLines={1}>
            {_copy("follow.followerCount", { defaultValue: "{{compact}} followers", compact: formatCompactNumber(followers) })}
          </Text>
          {isOwnAccount ? null : (
            // The solid accent is the point of this button, so its fill sits
            // on an inner view where the control pass leaves it alone.
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleFollowToggle}
              disabled={followLoading}
              hitSlop={{ top: 6, bottom: 6 }}
            >
              <View
                style={[
                  styles.follow,
                  done
                    ? { backgroundColor: "rgba(255,255,255,0.12)" }
                    : { backgroundColor: ink.button },
                  theme === "minimal" || square ? { borderRadius: 0 } : undefined,
                  mono ? { paddingHorizontal: 12 } : undefined,
                ]}
              >
              {followLoading ? (
                <ActivityIndicator size="small" color={done ? ink.ink : ink.buttonText} />
              ) : (
                <View style={styles.followInner}>
                  {done ? <Icon name={isPending ? "Clock" : "Check"} size={13} color={ink.ink} /> : null}
                  <Text style={[styles.followLabel, { color: done ? ink.ink : ink.buttonText }, textMono]}>
                    {followLabel}
                  </Text>
                </View>
              )}
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: COVER_CARD_WIDTH,
    marginRight: 10,
  },
  flatCard: {
    paddingRight: 14,
    marginRight: 14,
  },
  flatDivider: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: FLAT_DIVIDER,
  },
  cover: {
    height: COVER_H,
    overflow: "hidden",
    backgroundColor: "#27272A",
  },
  dismissHit: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  dismiss: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 20,
  },
  name: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    flexShrink: 1,
  },
  handle: {
    fontSize: 13,
    lineHeight: 17,
  },
  bio: {
    fontSize: 13,
    lineHeight: 17.5,
    marginTop: 6,
    minHeight: 35,
  },
  bioEmpty: {
    fontStyle: "italic",
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 18,
    marginTop: 8,
  },
  mutuals: {
    flexDirection: "row",
    marginRight: 6,
  },
  mutual: {
    width: 18,
    height: 18,
    borderRadius: 6,
    borderWidth: 1.5,
    overflow: "hidden",
  },
  reason: {
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 1,
  },
  foot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  count: {
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 1,
    marginRight: 8,
  },
  follow: {
    height: 32,
    minWidth: 84,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  followInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  followLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
});

export const SuggestedAccountCard = React.memo(SuggestedAccountCardComponent);
export default SuggestedAccountCard;
