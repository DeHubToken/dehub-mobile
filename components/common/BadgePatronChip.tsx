/**
 * Badge Patron Chip (mobile)
 * ==========================
 * "Lent by @someone", for a badge that was delegated rather than earned. Twin
 * of web's `components/app/BadgePatronChip.tsx`, where it is a hover tooltip.
 *
 * There is no hover on a phone, so the equivalent is a tap: the chip is
 * collapsed to a small chevron button by default and expands when pressed,
 * collapsing again on a second press. Same intent as web's version — a lent
 * badge should read as the badge, not as an annotation sitting permanently
 * beside the name — while still being reachable, which a hover-only rule
 * would not be here.
 *
 * Renders nothing at all for the overwhelming majority of accounts, whose
 * badge is their own.
 */
import React, { FC, useState } from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import { useQuery } from "@tanstack/react-query";
import Icon from "../ui/Icon";
import { fetchBadgePatron } from "../../services/badge-delegation.service";
import { badgeImageFor } from "../../libs";

interface BadgePatronChipProps {
  /** Username or wallet address of the account being drawn. */
  lookupId?: string | null;
}

const BadgePatronChip: FC<BadgePatronChipProps> = ({ lookupId }) => {
  const [expanded, setExpanded] = useState(false);

  const { data } = useQuery({
    queryKey: ["badge-patron", lookupId],
    queryFn: () => fetchBadgePatron(lookupId!),
    enabled: Boolean(lookupId),
    // Delegations change rarely, and a stale one is a cosmetic wrong-name
    // rather than a wrong badge — the badge itself comes from badgeBalance.
    staleTime: 10 * 60 * 1000,
    // An account with no patron 200s with a null result, so a failure here is
    // a real error and not worth retrying in front of someone.
    retry: false,
  });

  if (!data?.grantor) return null;

  const handle = data.grantor.username || data.grantor.displayName || null;
  const who = handle ? `@${handle}` : "another holder";
  const source = badgeImageFor(data.tier);

  return (
    <TouchableOpacity
      onPress={() => setExpanded(prev => !prev)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`This ${data.tier} badge was lent by ${who}`}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      className="flex-row items-center rounded-md border border-white/15 bg-white/10 px-1.5 py-0.5"
    >
      {source ? <Image source={source} className="w-3 h-3" /> : null}
      {expanded ? (
        <Text className="text-white text-[11px] font-medium ml-1" numberOfLines={1}>
          Lent by {who}
        </Text>
      ) : (
        <Icon name="ChevronDown" size={10} color="#FFFFFF" />
      )}
    </TouchableOpacity>
  );
};

export default React.memo(BadgePatronChip);
