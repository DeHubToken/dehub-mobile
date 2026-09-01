/**
 * Stream Shop Overlay
 * ===================
 * Viewer-facing shopping for a live stream, mirroring the web rail:
 *
 *  - a card for whatever the host has put "on air", floating above the chat
 *  - a bag button opening the full list
 *  - a checkout sheet that quotes server-side and pays in DHB
 *
 * Rendered inside the player rather than routed to. A `transparentModal` screen
 * leaves the surface below visible but NOT interactive (CardStack gives it
 * `activityState = 1`), which would freeze the stream's chat and reactions
 * behind an open shop. RN's own `<Modal>` is fine — it is in-screen.
 *
 * Prices shown here are display only; the amount actually signed for comes from
 * the live-checkout quote taken when the sheet opens.
 */

import React, { memo, useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Modal,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { ShoppingBag, X, Package } from "lucide-react-native";
import { useStreamProducts, useLiveCheckout, effectivePrice } from "../../hooks/useStreamShopping";
import type { StreamProduct, LiveQuote } from "../../hooks/useStreamShopping";
import { useERC20Contract } from "../../hooks/use-web3";
import { writeContractAA } from "../../libs/aa.write";
import { DHB_ADDRESSESS, ChainId } from "../../config/constants";
import { useUser } from "../../context/AuthContext";

/** Below this, say how many are left — urgency is only fair when it's true. */
const LOW_STOCK_THRESHOLD = 10;

/**
 * Prices are never compacted. formatCompactNumber turns 1200 into "1.2K",
 * which is right for viewer counts and wrong for something someone is about to
 * pay — a shopper needs the exact figure.
 */
function money(value: number): string {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  const [intPart, decPart] = (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)).split(".");
  // Group the integer part only — grouping the decimals turns 1234.50 into
  // "1,234.5,0".
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart ? `${grouped}.${decPart}` : grouped;
}

function stockLabel(product: StreamProduct): string | null {
  const stock = product.store_listings?.stock_quantity;
  if (stock === null || stock === undefined) return null;
  if (stock > LOW_STOCK_THRESHOLD) return null;
  return stock === 1 ? "Last one" : `${stock} left`;
}

const Thumb = memo(function Thumb({
  product,
  size,
  radius = 10,
}: {
  product: StreamProduct;
  size: number;
  radius?: number;
}) {
  const uri = product.store_listings?.images?.[0];
  return (
    <View
      style={{ width: size, height: size, borderRadius: radius }}
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

function PriceText({ product, className }: { product: StreamProduct; className?: string }) {
  const usd = effectivePrice(product);
  const list = Number(product.store_listings?.price ?? 0);
  const discounted = product.live_price != null && product.live_price < list;
  return (
    <View className="flex-row items-baseline">
      <Text className={className || "text-white font-semibold text-sm"}>
        ${money(usd)}
      </Text>
      {discounted ? (
        <Text className="text-zinc-500 text-[11px] line-through ml-1.5">
          ${money(list)}
        </Text>
      ) : null}
    </View>
  );
}

/** Quote → pay → confirm, in a sheet. */
/**
 * The buy sheet. Exported so the Shop board can reuse it — the quote, the
 * transfer and the confirm are all one path, and a second copy of it is how
 * two surfaces end up disagreeing about what somebody was charged.
 */
export function CheckoutSheet({
  tokenId,
  product,
  visible,
  onClose,
}: {
  tokenId: string | number | null | undefined;
  product: StreamProduct | null;
  visible: boolean;
  onClose: () => void;
}) {
  const user = useUser() as any;
  const wallet = (user?.walletAddress || user?.address || null) as string | null;
  const dhbAddress = DHB_ADDRESSESS[ChainId.BASE_MAINNET];
  const dhbContract = useERC20Contract(dhbAddress);

  const [quote, setQuote] = useState<LiveQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [shipping, setShipping] = useState("");
  const [notes, setNotes] = useState("");

  const sendTransfer = useCallback(
    async (to: string, amountWholeTokens: number): Promise<string> => {
      if (!dhbContract) throw new Error("Wallet is not ready yet");
      // The quote is always a whole number of DHB, and DHB has 18 decimals, so
      // the wei string is the integer with 18 zeros after it. Built as a string
      // rather than with BigInt because nothing else in this app uses BigInt —
      // Hermes support for it depends on the RN version and the Babel target,
      // and this is not the code path to find that out on.
      const units = `${Math.ceil(amountWholeTokens)}${"0".repeat(18)}`;
      const res = await writeContractAA(dhbContract, "transfer", [to, units], {
        context: "live-purchase",
      });
      return res?.hash || "";
    },
    [dhbContract],
  );

  const { getQuote, buy } = useLiveCheckout(tokenId, sendTransfer);
  const listing = product?.store_listings || null;

  // Re-quote on every open: a stream runs for hours and the host can re-price
  // or sell out mid-broadcast, so a stale quote is not one to charge against.
  useEffect(() => {
    if (!visible || !listing) return;
    let cancelled = false;
    setQuote(null);
    setQuoteError(null);
    setShipping("");
    setNotes("");
    getQuote
      .mutateAsync(listing.id)
      .then((q) => {
        if (!cancelled) setQuote(q);
      })
      .catch((err: Error) => {
        if (!cancelled) setQuoteError(err.message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, listing?.id]);

  if (!product || !listing) return null;

  const isSelf = wallet?.toLowerCase() === listing.wallet_address?.toLowerCase();
  const needsShipping = !listing.is_digital;
  const canBuy =
    !!quote && !quote.paymentsFrozen && !isSelf && (!needsShipping || shipping.trim().length > 0) && !buy.isPending;

  const handleBuy = async () => {
    if (!quote) return;
    try {
      await buy.mutateAsync({
        quote,
        shippingAddress: shipping.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch {
      // useLiveCheckout toasts the reason; the sheet stays open so the buyer
      // can read it and retry without retyping their address.
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/60">
        <View className="bg-zinc-900 rounded-t-3xl border-t border-white/10 px-4 pt-4 pb-8">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-white font-semibold text-base flex-1 mr-3" numberOfLines={1}>
              {listing.title}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <X size={20} color="#a1a1aa" />
            </TouchableOpacity>
          </View>

          <ScrollView className="max-h-[420px]" keyboardShouldPersistTaps="handled">
            <View className="flex-row mb-4">
              <Thumb product={product} size={80} radius={14} />
              <View className="flex-1 ml-3 justify-center">
                {quote ? (
                  <>
                    <Text className="text-white text-2xl font-bold">
                      {money(quote.dhbAmount)} DHB
                    </Text>
                    <Text className="text-zinc-500 text-xs mt-0.5">
                      ${money(quote.priceUsd)} USD
                    </Text>
                  </>
                ) : quoteError ? (
                  <Text className="text-red-400 text-sm">{quoteError}</Text>
                ) : (
                  <View className="flex-row items-center">
                    <ActivityIndicator size="small" color="#a1a1aa" />
                    <Text className="text-zinc-400 text-sm ml-2">Getting price…</Text>
                  </View>
                )}
              </View>
            </View>

            {listing.description ? (
              <Text className="text-zinc-300 text-sm mb-4" numberOfLines={4}>
                {listing.description}
              </Text>
            ) : null}

            {/* DHB is ERC20Pausable and paused right now. Saying so beats
                opening a wallet to spend gas on a guaranteed revert. Read per
                quote, so it clears itself once the token is unpaused. */}
            {quote?.paymentsFrozen ? (
              <View className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 mb-4">
                <Text className="text-amber-300 font-semibold text-xs">
                  DHB transfers are paused
                </Text>
                <Text className="text-amber-200/80 text-xs mt-1">
                  Buying is unavailable until trading resumes. Nothing has been charged.
                </Text>
              </View>
            ) : null}

            {isSelf ? (
              <View className="rounded-2xl border border-white/10 bg-white/5 p-3 mb-4">
                <Text className="text-zinc-400 text-xs">This is your own listing.</Text>
              </View>
            ) : null}

            {!isSelf && quote && !quote.paymentsFrozen ? (
              <>
                {needsShipping ? (
                  <View className="mb-3">
                    <Text className="text-zinc-400 text-xs mb-1.5">Shipping address</Text>
                    <TextInput
                      value={shipping}
                      onChangeText={setShipping}
                      placeholder="Name, street, city, postcode, country"
                      placeholderTextColor="#52525b"
                      multiline
                      className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm"
                      style={{ minHeight: 72, textAlignVertical: "top" }}
                    />
                  </View>
                ) : null}
                <View className="mb-4">
                  <Text className="text-zinc-400 text-xs mb-1.5">Note to seller (optional)</Text>
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Size, colour, anything else…"
                    placeholderTextColor="#52525b"
                    className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm"
                  />
                </View>
              </>
            ) : null}
          </ScrollView>

          <TouchableOpacity
            onPress={handleBuy}
            disabled={!canBuy}
            className={`rounded-2xl py-3.5 items-center justify-center flex-row ${
              canBuy ? "bg-white" : "bg-white/20"
            }`}
          >
            {buy.isPending ? (
              <>
                <ActivityIndicator size="small" color="#09090B" />
                <Text className="text-[#09090B] font-semibold ml-2">Confirming payment…</Text>
              </>
            ) : (
              <Text className={canBuy ? "text-[#09090B] font-semibold" : "text-white/50 font-semibold"}>
                Buy now
              </Text>
            )}
          </TouchableOpacity>

          {buy.isPending ? (
            <Text className="text-zinc-500 text-[11px] text-center mt-2">
              Don't close this — the order is written once the transfer is confirmed on Base.
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/** The full product list. */
function ProductSheet({
  products,
  visible,
  onClose,
  onSelect,
}: {
  products: StreamProduct[];
  visible: boolean;
  onClose: () => void;
  onSelect: (p: StreamProduct) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/60">
        <View className="bg-zinc-900 rounded-t-3xl border-t border-white/10 px-4 pt-4 pb-8 max-h-[70%]">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-white font-semibold text-base">Shop this stream</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <X size={20} color="#a1a1aa" />
            </TouchableOpacity>
          </View>

          <ScrollView>
            {products.map((product) => {
              const label = stockLabel(product);
              return (
                <TouchableOpacity
                  key={product.id}
                  onPress={() => onSelect(product)}
                  className="flex-row items-center p-2 mb-2 rounded-2xl border border-white/10 bg-white/5"
                >
                  <Thumb product={product} size={56} radius={12} />
                  <View className="flex-1 ml-3">
                    <Text className="text-white text-sm" numberOfLines={1}>
                      {product.store_listings?.title}
                    </Text>
                    <View className="flex-row items-center mt-0.5">
                      <PriceText product={product} />
                      {label ? (
                        <Text className="text-amber-400 text-[10px] font-semibold ml-2 uppercase">
                          {label}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  {product.is_pinned ? (
                    <View className="bg-white rounded px-1.5 py-0.5">
                      <Text className="text-[9px] font-bold text-black uppercase">On air</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

interface Props {
  tokenId: string | number | null | undefined;
}

export default function StreamShopOverlay({ tokenId }: Props) {
  const { sellable, pinned } = useStreamProducts(tokenId);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [checkoutFor, setCheckoutFor] = useState<StreamProduct | null>(null);

  if (!sellable.length) return null;

  // Dismissal is per-pin: putting something new on air brings the card back,
  // which is the host's cue working rather than a viewer being re-nagged.
  // Held as a value rather than a boolean so the JSX below narrows it — a
  // separate `showPinned` flag leaves `pinned` as StreamProduct | null inside
  // the branch, which strict mode rejects.
  const activePinned = pinned && pinned.id !== dismissedId ? pinned : null;
  const pinnedStock = activePinned ? stockLabel(activePinned) : null;

  return (
    <View pointerEvents="box-none">
      {activePinned ? (
        <View className="mx-3 mb-2 flex-row items-center rounded-2xl bg-black/70 border border-white/15 p-2">
          <Thumb product={activePinned} size={44} />
          <View className="flex-1 mx-2.5">
            <Text className="text-white text-xs font-medium" numberOfLines={1}>
              {activePinned.store_listings?.title}
            </Text>
            <View className="flex-row items-center">
              <PriceText product={activePinned} />
              {pinnedStock ? (
                <Text className="text-amber-400 text-[10px] font-semibold ml-2 uppercase">
                  {pinnedStock}
                </Text>
              ) : null}
            </View>
          </View>
          <TouchableOpacity
            onPress={() => setCheckoutFor(activePinned)}
            className="bg-white rounded-xl px-3.5 py-2"
          >
            <Text className="text-[#09090B] text-xs font-semibold">Buy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setDismissedId(activePinned.id)}
            hitSlop={8}
            className="ml-1.5 w-6 h-6 items-center justify-center"
          >
            <X size={14} color="#a1a1aa" />
          </TouchableOpacity>
        </View>
      ) : (
        <View className="flex-row justify-end mx-3 mb-2">
          <TouchableOpacity
            onPress={() => setListOpen(true)}
            className="flex-row items-center rounded-full bg-black/70 border border-white/15 px-3 py-2"
          >
            <ShoppingBag size={14} color="#ffffff" />
            <Text className="text-white text-xs font-semibold ml-1.5">
              Shop · {sellable.length}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <ProductSheet
        products={sellable}
        visible={listOpen}
        onClose={() => setListOpen(false)}
        onSelect={(p) => {
          setListOpen(false);
          setCheckoutFor(p);
        }}
      />

      <CheckoutSheet
        tokenId={tokenId}
        product={checkoutFor}
        visible={!!checkoutFor}
        onClose={() => setCheckoutFor(null)}
      />
    </View>
  );
}
