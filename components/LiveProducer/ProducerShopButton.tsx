/**
 * Producer Shop Button
 * ====================
 * Host-side shopping controls while broadcasting from the phone: attach
 * listings from your store, put one "on air", take it off, remove it.
 *
 * A floating button plus its own sheet, rather than another prop on
 * ProducerControlsBar — the controls bar is a fixed row of circular buttons
 * with a settled layout, and widening its contract for a feature most streams
 * do not use would touch every caller.
 *
 * Attaching is deliberately limited to listings that already exist. Creating a
 * listing needs the image-upload pipeline that mobile's store tooling has not
 * ported yet, and mid-broadcast is the worst possible time to ask someone to
 * photograph a product.
 */

import React, { memo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Modal,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { ShoppingBag, X, Package, Radio, Trash2 } from "lucide-react-native";
import {
  useStreamProducts,
  useStreamProductActions,
  effectivePrice,
} from "../../hooks/useStreamShopping";
import type { StreamProduct } from "../../hooks/useStreamShopping";
import { useMyListings } from "../../hooks/useStores";

const Thumb = memo(function Thumb({ uri, size }: { uri?: string; size: number }) {
  return (
    <View
      style={{ width: size, height: size, borderRadius: 10 }}
      className="bg-white/10 overflow-hidden items-center justify-center"
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="cover" />
      ) : (
        <Package size={size * 0.4} color="#71717a" />
      )}
    </View>
  );
});

interface Props {
  tokenId: string | number | null | undefined;
  /** Hidden along with the rest of the chrome when the host taps to clear the UI. */
  visible?: boolean;
}

export default function ProducerShopButton({ tokenId, visible = true }: Props) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const { products } = useStreamProducts(tokenId);
  const { attach, detach, pin, unpin } = useStreamProductActions(tokenId);
  const { data: listings = [], isLoading } = useMyListings();

  if (!visible || tokenId == null) return null;

  const attachedIds = new Set(products.map((p) => p.listing_id));
  // `any` matches how the rest of the stores surface types listing rows: the
  // generated Row types `images` as Json, which fights every consumer.
  const available = (listings as any[]).filter(
    (l) => l.status === "active" && !attachedIds.has(l.id),
  );
  const pinnedId = products.find((p) => p.is_pinned)?.listing_id || null;

  const renderAttached = (product: StreamProduct) => {
    const soldOut = product.store_listings?.stock_quantity === 0;
    const isPinned = product.listing_id === pinnedId;
    return (
      <View
        key={product.id}
        className={`flex-row items-center p-2 mb-2 rounded-2xl border ${
          isPinned ? "border-white/30 bg-white/10" : "border-white/10 bg-white/5"
        }`}
      >
        <Thumb uri={product.store_listings?.images?.[0]} size={44} />
        <View className="flex-1 mx-2.5">
          <Text className="text-white text-xs" numberOfLines={1}>
            {product.store_listings?.title}
          </Text>
          <Text className="text-zinc-500 text-[10px] mt-0.5">
            ${effectivePrice(product)}
            {product.live_price != null ? "  ·  live price" : ""}
            {soldOut ? "  ·  sold out" : ""}
          </Text>
        </View>

        {/* One product is on air at a time — the partial unique index in the
            schema guarantees it, so this moves the pin rather than stacking. */}
        <TouchableOpacity
          onPress={() => (isPinned ? unpin.mutate() : pin.mutate(product.listing_id))}
          disabled={soldOut || pin.isPending || unpin.isPending}
          className={`flex-row items-center px-2.5 py-1.5 rounded-lg ${
            isPinned ? "bg-white" : "bg-white/10"
          } ${soldOut ? "opacity-40" : ""}`}
        >
          <Radio size={11} color={isPinned ? "#09090B" : "#d4d4d8"} />
          <Text
            className={`text-[10px] font-bold uppercase ml-1 ${
              isPinned ? "text-[#09090B]" : "text-zinc-300"
            }`}
          >
            {isPinned ? "On air" : "Air"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => detach.mutate(product.listing_id)}
          disabled={detach.isPending}
          hitSlop={8}
          className="ml-2 w-7 h-7 items-center justify-center"
        >
          <Trash2 size={14} color="#71717a" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        className="flex-row items-center rounded-xl bg-zinc-900/60 px-3 py-2"
      >
        <ShoppingBag size={14} color="#ffffff" />
        {products.length > 0 ? (
          <Text className="text-white text-[11px] font-semibold ml-1.5">{products.length}</Text>
        ) : null}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-zinc-900 rounded-t-3xl border-t border-white/10 px-4 pt-4 pb-8 max-h-[75%]">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-white font-semibold text-base">
                {adding ? "Add to this stream" : "Stream shop"}
              </Text>
              <View className="flex-row items-center">
                <TouchableOpacity
                  onPress={() => setAdding((v) => !v)}
                  className="bg-white/10 rounded-lg px-3 py-1.5 mr-3"
                >
                  <Text className="text-white text-xs font-semibold">
                    {adding ? "Done" : "Add"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10}>
                  <X size={20} color="#a1a1aa" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView>
              {adding ? (
                isLoading ? (
                  <ActivityIndicator size="small" color="#a1a1aa" style={{ marginVertical: 24 }} />
                ) : !available.length ? (
                  <Text className="text-zinc-500 text-xs text-center py-8">
                    {listings.length
                      ? "Everything active in your store is already on this stream."
                      : "You don't have any listings yet. Create them on the web store first."}
                  </Text>
                ) : (
                  available.map((listing) => (
                    <View
                      key={listing.id}
                      className="flex-row items-center p-2 mb-2 rounded-2xl border border-white/10 bg-white/5"
                    >
                      <Thumb uri={listing.images?.[0]} size={44} />
                      <View className="flex-1 mx-2.5">
                        <Text className="text-white text-xs" numberOfLines={1}>
                          {listing.title}
                        </Text>
                        <Text className="text-zinc-500 text-[10px] mt-0.5">${listing.price}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => attach.mutate({ listingId: listing.id })}
                        disabled={attach.isPending}
                        className="bg-white rounded-lg px-3 py-1.5"
                      >
                        <Text className="text-[#09090B] text-[11px] font-semibold">Add</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )
              ) : !products.length ? (
                <Text className="text-zinc-500 text-xs text-center py-8">
                  Add something from your store and viewers can buy it without leaving the stream.
                </Text>
              ) : (
                products.map(renderAttached)
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
