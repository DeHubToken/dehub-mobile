/**
 * Shop link allowance
 * ===================
 * How many affiliate/shop links the signed-in creator may hang off one post.
 * Three for everybody, one more for every rung of the badge ladder.
 *
 * **Asked, not derived** — the same call the web composer makes. The client's
 * badge resolution deliberately over-reports a tier so a badge does not vanish
 * mid-stake, and the ladder scales with the DHB price, so a count worked out
 * here would offer a creator a slot the mint is about to refuse.
 * `getShopLinkAllowance` degrades to the base three on any failure, so this
 * never blocks the composer.
 */

import { useQuery } from "@tanstack/react-query";
import {
  getShopLinkAllowance,
  SHOP_LINK_BASE_ALLOWANCE,
  type ShopLinkAllowance,
} from "../services/nft.service";
import { useUser } from "../context/AuthContext";

const BASE: ShopLinkAllowance = {
  allowance: SHOP_LINK_BASE_ALLOWANCE,
  base: SHOP_LINK_BASE_ALLOWANCE,
  max: SHOP_LINK_BASE_ALLOWANCE,
  tier: null,
};

export function useShopLinkAllowance(): ShopLinkAllowance {
  const user = useUser() as any;
  const address: string | undefined = user?.address || user?.walletAddress;
  const { data } = useQuery({
    queryKey: ["shop-link-allowance", address?.toLowerCase() ?? null],
    queryFn: getShopLinkAllowance,
    enabled: !!address,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
  return data ?? BASE;
}
