/**
 * Badge Patron Chip (mobile)
 * ==========================
 * "Lent by @someone", beside a name whose badge was delegated rather than
 * earned. Twin of web's `components/app/BadgePatronChip.tsx`.
 *
 * A lent badge draws identically to an earned one everywhere in the app — that
 * is deliberate, it is the same influence — so this chip is the one place that
 * says where it came from. Two things follow from putting it here and nowhere
 * else: a delegation becomes something to show off rather than something to
 * hide, and there is a trail when somebody starts handing badges to spam
 * accounts.
 *
 * Renders nothing for the overwhelming majority of accounts, whose badge is
 * their own.
 */
import React, { FC } from "react";
import { View, Text, Image } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { fetchBadgePatron } from "../../services/badge-delegation.service";
import { badgeImageFor } from "../../libs";

interface BadgePatronChipProps {
  /** Username or wallet address of the account being drawn. */
  lookupId?: string | null;
}

const BadgePatronChip: FC<BadgePatronChipProps> = ({ lookupId }) => {
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
  const source = badgeImageFor(data.tier);

  return (
    <View className="flex-row items-center rounded-md border border-white/15 bg-white/10 px-2 py-0.5">
      {source ? <Image source={source} className="w-3 h-3 mr-1" /> : null}
      <Text className="text-white text-[11px] font-medium" numberOfLines={1}>
        Lent by {handle ? `@${handle}` : "another holder"}
      </Text>
    </View>
  );
};

export default React.memo(BadgePatronChip);
