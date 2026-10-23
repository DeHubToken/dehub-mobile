/**
 * AccountBadge — the staking badge beside a name, for rows whose payload
 * carries only a handle or wallet address (governance proposals and their
 * discussion). Looks the account up once per name and draws nothing below
 * the first tier or when the holder hides their badge.
 */
import React from "react";
import BadgeArtwork from "./BadgeArtwork";
import { getBadgeHoverOpticalStyle as getBadgeOpticalStyle } from "../../libs/misc";
import { useAccountBadge } from "../../hooks/useAccountBadge";

interface AccountBadgeProps {
  lookupId: string | null | undefined;
  /** Badge size, matched to the name's font size. */
  size: number;
  /** The name's line height, so the badge sits on its baseline. */
  lineHeight: number;
}

export default function AccountBadge({ lookupId, size, lineHeight }: AccountBadgeProps) {
  const badgeImg = useAccountBadge(lookupId);
  if (!badgeImg) return null;
  return (
    <BadgeArtwork
      source={badgeImg}
      style={[getBadgeOpticalStyle(badgeImg, size, 0, lineHeight), { marginLeft: 2 }]}
      contentFit="contain"
    />
  );
}
