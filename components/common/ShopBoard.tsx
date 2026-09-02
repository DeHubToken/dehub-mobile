/**
 * Shop board
 * ==========
 * What a creator is selling or pointing at, behind a Shop button on the post.
 * Two kinds of row:
 *
 *  - **Listings** from their own DeHub shop, which check out in-app through
 *    `live-checkout` — server-quoted and chain-verified, the same path the live
 *    shopping overlay uses.
 *  - **Affiliate links**, which leave the app.
 *
 * Listings come first. Something a viewer can buy here without going anywhere
 * is worth more to both sides than a link that hands them to Amazon, and the
 * ordering is the only place that preference gets expressed.
 *
 * **The listing rows are fetched on open, never with the feed.** An always-on
 * `useStreamProducts` per card is a Supabase query and a realtime channel per
 * card, to answer a question the post's `shopListingCount` already answers off
 * the feed payload. So the button is right before anything is fetched, and the
 * query starts on the tap.
 *
 * That count is a hint and can be stale. The rows come from `stream_products`,
 * which is ownership-checked, so a stale count shows a shorter board rather
 * than something the creator does not sell.
 *
 * An RN `<Modal>`, not a `transparentModal` screen: a transparent modal screen
 * leaves the surface below visible but NOT interactive (CardStack gives it
 * `activityState = 1`), which would freeze a live stream's chat and reactions
 * behind an open board — the same trap StreamShopOverlay documents.
 *
 * Every affiliate row is disclosed as one. That is a disclosure the creator
 * would otherwise have to remember, so the surface makes it.
 *
 * Renders nothing when the post has no board at all, so it is safe to drop into
 * any card or player.
 */

import React, { memo, useState } from "react";
import { View, Text, TouchableOpacity, Modal, ScrollView, Linking, Image, ActivityIndicator } from "react-native";
import Icon from "../ui/Icon";
import { useStreamProducts, effectivePrice } from "../../hooks/useStreamShopping";
import type { StreamProduct } from "../../hooks/useStreamShopping";
import type { ShopLink } from "../../services/nft.service";
import { CheckoutSheet } from "../LiveViewer/StreamShopOverlay";

interface ShopBoardProps {
  /** The post's tokenId — what `stream_products` is keyed on. */
  tokenId?: string | number | null;
  links?: ShopLink[] | null;
  /**
   * How many store listings the post claims, straight off the feed payload.
   * Lets the button be right before a single row is fetched.
   */
  listingCount?: number | null;
  /**
   * `overlay` floats the button over a player, bottom-left and clear of the
   * controls on the right — live, where not leaving the stream is the point.
   * `inline` puts the button in the flow of a feed card.
   */
  variant?: "overlay" | "inline";
}

/** `https://www.amazon.co.uk/dp/x?tag=…` reads as `amazon.co.uk` under the label. */
function hostOf(url: string): string {
  const match = /^https?:\/\/([^/?#]+)/i.exec(url);
  return match ? match[1].replace(/^www\./i, "") : url;
}

/** Below this, say how many are left — urgency is only fair when it is true. */
const LOW_STOCK_THRESHOLD = 10;

/**
 * Prices are never compacted. formatCompactNumber turns 1200 into "1.2K",
 * which is right for viewer counts and wrong for something someone is about to
 * pay.
 */
function money(value: number): string {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  const [intPart, decPart] = (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart ? `${grouped}.${decPart}` : grouped;
}

const ListingRow = memo(function ListingRow({
  product,
  onBuy,
}: {
  product: StreamProduct;
  onBuy: () => void;
}) {
  const listing = product.store_listings;
  const stock = listing?.stock_quantity;
  const image = listing?.images?.[0];

  return (
    <TouchableOpacity
      onPress={onBuy}
      activeOpacity={0.8}
      className="flex-row items-center px-3 py-3 rounded-xl bg-white/[0.06] border border-white/10 mb-1.5"
    >
      <View
        style={{ width: 40, height: 40, borderRadius: 10 }}
        className="bg-white/10 overflow-hidden items-center justify-center mr-3"
      >
        {image ? (
          <Image source={{ uri: image }} style={{ width: 40, height: 40 }} resizeMode="cover" />
        ) : (
          <Icon name="Package" size={16} color="#808089" />
        )}
      </View>
      <View className="flex-1 mr-3">
        <Text className="text-white text-sm" numberOfLines={1}>
          {listing?.title}
        </Text>
        <View className="flex-row items-center">
          {/* Display only — the amount a buyer signs for is quoted when the
              checkout sheet opens. */}
          <Text className="text-theme-neutrals-400 text-xs">${money(effectivePrice(product))}</Text>
          {stock !== null && stock !== undefined && stock <= LOW_STOCK_THRESHOLD ? (
            <Text className="text-amber-400 text-[10px] font-semibold ml-2 uppercase">
              {stock === 1 ? "Last one" : `${stock} left`}
            </Text>
          ) : null}
        </View>
      </View>
      <Text className="text-white/70 text-xs font-medium">Buy</Text>
    </TouchableOpacity>
  );
});

export default memo(function ShopBoard({
  tokenId,
  links,
  listingCount,
  variant = "inline",
}: ShopBoardProps) {
  const [open, setOpen] = useState(false);
  const [checkout, setCheckout] = useState<StreamProduct | null>(null);

  const linkRows = links ?? [];
  const claimedListings = Math.max(0, listingCount ?? 0);

  // Only once the board is open — see the note at the top of the file.
  const { sellable, isLoading } = useStreamProducts(tokenId ?? null, open && claimedListings > 0);

  // The button draws off the claim, so it is right before anything is fetched.
  const total = linkRows.length + claimedListings;
  if (total === 0) return null;

  const overlay = variant === "overlay";

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        className="flex-row items-center px-3 py-2 rounded-full bg-black/60 border border-white/15 self-start"
        style={overlay ? { position: "absolute", left: 12, bottom: 12, zIndex: 20 } : { marginTop: 8 }}
      >
        <Icon name="ShoppingBag" size={15} color="#fff" />
        <Text className="text-white text-sm font-medium ml-1.5">Shop</Text>
        <Text className="text-theme-neutrals-500 text-xs ml-1.5">{total}</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View className="flex-1 justify-end" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          {/* The dim area above the board closes it — a bottom sheet that can
              only be dismissed by its own small X is the one people get stuck
              in. */}
          <TouchableOpacity className="flex-1" activeOpacity={1} onPress={() => setOpen(false)} />

          <View
            className="bg-black/90 border-t border-white/10"
            style={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "70%" }}
          >
            <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
              <View className="flex-row items-center">
                <Icon name="ShoppingBag" size={16} color="#fff" />
                <Text className="text-white text-base font-semibold ml-2">Shop</Text>
              </View>
              <TouchableOpacity onPress={() => setOpen(false)} activeOpacity={0.7} hitSlop={10}>
                <Icon name="X" size={18} color="#A1A1AA" />
              </TouchableOpacity>
            </View>

            <ScrollView className="px-3 pb-6">
              {claimedListings > 0 && isLoading ? (
                <View className="py-4 items-center">
                  <ActivityIndicator color="#808089" />
                </View>
              ) : null}

              {sellable.map((product) => (
                <ListingRow key={product.id} product={product} onBuy={() => setCheckout(product)} />
              ))}

              {linkRows.length > 0 ? (
                <>
                  {sellable.length > 0 ? (
                    <View className="h-px bg-white/10 my-2" />
                  ) : null}
                  <Text className="px-1 pb-2 text-theme-neutrals-500 text-xs leading-4">
                    Affiliate links — the creator may earn a commission on anything you buy.
                    Prices are the same for you.
                  </Text>
                  {linkRows.map((link, index) => (
                    <TouchableOpacity
                      key={`${link.url}-${index}`}
                      onPress={() => Linking.openURL(link.url).catch(() => {})}
                      activeOpacity={0.8}
                      className="flex-row items-center px-3 py-3 rounded-xl bg-white/[0.06] border border-white/10 mb-1.5"
                    >
                      <View className="flex-1 mr-3">
                        <Text className="text-white text-sm" numberOfLines={1}>
                          {link.label}
                        </Text>
                        <Text className="text-theme-neutrals-500 text-xs mt-0.5" numberOfLines={1}>
                          {hostOf(link.url)}
                        </Text>
                      </View>
                      <Icon name="ExternalLink" size={15} color="#808089" />
                    </TouchableOpacity>
                  ))}
                </>
              ) : null}

              {/* The count said there was something and nothing resolved — a
                  listing sold out, was de-listed, or came off the rail since
                  this post was published. Saying so beats an empty panel. */}
              {!isLoading && sellable.length === 0 && linkRows.length === 0 ? (
                <Text className="py-4 text-center text-theme-neutrals-500 text-xs">
                  Nothing on sale here right now.
                </Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {checkout ? (
        <CheckoutSheet
          tokenId={tokenId ?? null}
          product={checkout}
          visible={!!checkout}
          onClose={() => setCheckout(null)}
        />
      ) : null}
    </>
  );
});
