/**
 * ListingDetailScreen
 * ===================
 * Native port of the web ListingDetailDrawer. Listings are priced in USD and
 * settled in DHB on Base: the buyer transfers DHB directly to the seller, then
 * the order row is written with the resulting tx hash — identical to web.
 *
 * The transfer follows the same pattern as Wallet/StakingTab (ensureChain →
 * encoded ERC-20 transfer → sendTransaction → waitForTransaction), which is the
 * proven on-chain write path in this app.
 */
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { ethers } from "ethers";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import Icon from "../components/ui/Icon";
import Avatar from "../components/common/Avatar";
import { theme } from "../theme";
import { getAvatarUrl } from "../libs/misc";
import { toastError, toastSuccess } from "../libs/toast";
import { useUser, useAuthState } from "../context/AuthContext";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import { useERC20Contract, useWeb3Provider } from "../hooks/use-web3";
import { writeContractAA } from "../libs/aa.write";
import { web3AuthService } from "../services/web3auth.service";
import { ChainId, DHB_ADDRESSESS } from "../config/constants";
import { ScreenNames } from "../navigation/ScreenNames";
import type { AppStackParamList } from "../navigation/types";
import {
  useStoreListing,
  useTokenPrices,
  useCreateOrder,
  useListingReviews,
  useHasPurchased,
  useCreateReview,
  averageRating,
  type StoreReview,
} from "../hooks/useStores";

/** Listings settle in DHB on Base, matching web's ListingDetailDrawer. */
const DHB_BASE = DHB_ADDRESSESS[ChainId.BASE_MAINNET];
const BASE_CHAIN_HEX = "0x2105"; // 8453

function money(n: number): string {
  const v = Number(n) || 0;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const Stars: React.FC<{ value: number; size?: number; onPick?: (n: number) => void }> = ({
  value,
  size = 14,
  onPick,
}) => (
  <View style={{ flexDirection: "row", gap: 2 }}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Pressable key={n} onPress={onPick ? () => onPick(n) : undefined} disabled={!onPick} hitSlop={4}>
        <Icon
          name="Star"
          size={size}
          color={n <= Math.round(value) ? "#FBBF24" : "#3F3F46"}
          fill={n <= Math.round(value) ? "#FBBF24" : "transparent"}
        />
      </Pressable>
    ))}
  </View>
);

const ReviewRow: React.FC<{ review: StoreReview }> = ({ review }) => (
  <View style={styles.reviewRow}>
    <View style={styles.reviewHead}>
      <Text style={styles.reviewAuthor}>{shortAddr(review.reviewer_address)}</Text>
      <Stars value={review.rating} size={12} />
    </View>
    {!!review.comment && <Text style={styles.reviewBody}>{review.comment}</Text>}
  </View>
);

export default function ListingDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<AppStackParamList, ScreenNames.ListingDetail>>();
  const { listingId, listing: seed } = route.params;
  const { width: screenW } = useWindowDimensions();

  const user = useUser() as any;
  const { isSignedIn, needsUsername } = useAuthState();
  const isAuthed = isSignedIn && !needsUsername;
  const myWallet: string = (user?.walletAddress || user?.address || "").toLowerCase();
  const { showUserProfile } = useUserProfileSheet();
  const { chainId } = useWeb3Provider();
  const tokenContract = useERC20Contract(DHB_BASE);

  const { data: listing, isLoading, refetch, isRefetching } = useStoreListing(listingId, seed);
  const { data: prices } = useTokenPrices();
  const createOrder = useCreateOrder();
  const reviews = useListingReviews(listingId);
  const hasPurchased = useHasPurchased(listingId);
  const createReview = useCreateReview();

  const [imgIdx, setImgIdx] = useState(0);
  const [shipping, setShipping] = useState("");
  const [notes, setNotes] = useState("");
  const [buying, setBuying] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");

  const dhbPrice = prices?.DHB ?? 0;
  const priceUsd = Number(listing?.price ?? 0);
  // Round up so a fractional DHB price never underpays the seller.
  const priceDhb = dhbPrice > 0 ? Math.ceil(priceUsd / dhbPrice) : 0;

  const images = useMemo(
    () => (Array.isArray(listing?.images) ? (listing!.images as string[]) : []),
    [listing],
  );
  const sellerAddress = (listing?.wallet_address || listing?.stores?.wallet_address || "").toLowerCase();
  const isSelf = !!myWallet && myWallet === sellerAddress;
  const soldOut = listing?.stock_quantity === 0;
  const { avg, count } = averageRating(reviews.data);

  const handleBuy = useCallback(async () => {
    if (!isAuthed) {
      navigation.navigate(ScreenNames.SignIn);
      return;
    }
    if (!listing || !sellerAddress) return;
    if (dhbPrice <= 0 || priceDhb <= 0) {
      toastError("DHB price unavailable — try again in a moment.");
      return;
    }

    if (!tokenContract) {
      toastError("Wallet not ready — try again in a moment.");
      return;
    }

    setBuying(true);
    try {
      // Best-effort chain switch. Only meaningful for the Web3Auth provider;
      // other providers manage their own chain, so a failure here is not fatal.
      if (chainId !== ChainId.BASE_MAINNET) {
        try {
          await web3AuthService.ensureChain(BASE_CHAIN_HEX as `0x${string}`);
        } catch {
          // fall through — writeContractAA's preflight will surface a real problem
        }
      }

      const amountWei = ethers.utils.parseUnits(String(priceDhb), 18);

      // Fail before signing if the balance can't cover it (same preflight as
      // TransferModal) — an opaque on-chain revert is a bad payment UX.
      try {
        const signerAddr = await tokenContract.signer?.getAddress?.();
        const bal = await tokenContract.balanceOf(signerAddr);
        if (bal && bal.lt(amountWei)) {
          toastError("Insufficient DHB balance for this purchase.");
          return;
        }
      } catch {
        // Preflight is advisory only.
      }

      // AA-aware write: routes through the bundler for Web3Auth smart wallets
      // and through the EOA signer otherwise. Using web3AuthService directly
      // here would break every non-Web3Auth provider and skip gas sponsorship.
      const res = await writeContractAA(
        tokenContract,
        "transfer",
        [sellerAddress, amountWei],
        { context: "purchase" },
      );

      // Confirm before recording, so a reverted transfer never becomes an order.
      let txHash = res.hash ?? "";
      try {
        const receipt = await res.wait(1);
        if (receipt?.status === 0) {
          toastError("Payment reverted on-chain — no order was created.");
          return;
        }
        txHash = txHash || receipt?.transactionHash || "";
      } catch {
        // Confirmation timed out; record optimistically with the hash so the
        // buyer keeps proof of payment.
      }

      await createOrder.mutateAsync({
        listing_id: listing.id,
        seller_address: sellerAddress,
        amount: priceUsd,
        tx_hash: txHash,
        shipping_address: shipping.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      setShipping("");
      setNotes("");
      void hasPurchased.refetch();
    } catch (err: any) {
      const msg = String(err?.message || err || "Purchase failed");
      if (msg.includes("user rejected") || msg.includes("cancelled")) {
        toastError("Transaction cancelled.");
      } else {
        toastError(msg.slice(0, 120));
      }
    } finally {
      setBuying(false);
    }
  }, [
    isAuthed,
    navigation,
    listing,
    sellerAddress,
    dhbPrice,
    priceDhb,
    priceUsd,
    shipping,
    notes,
    createOrder,
    hasPurchased,
    tokenContract,
    chainId,
  ]);

  const submitReview = useCallback(() => {
    if (!rating) {
      toastError("Pick a star rating first.");
      return;
    }
    createReview.mutate(
      { listing_id: listingId, rating, comment: reviewText.trim() || undefined },
      {
        onSuccess: () => {
          setRating(0);
          setReviewText("");
        },
      },
    );
  }, [rating, reviewText, createReview, listingId]);

  if (isLoading && !listing) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
            <Icon name="ArrowLeft" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Listing</Text>
        </View>
        <View style={styles.center}>
          <Icon name="Package" size={40} color="#3F3F46" />
          <Text style={styles.emptyText}>This listing is no longer available</Text>
        </View>
      </View>
    );
  }

  const heroH = Math.round(screenW * 0.82);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Icon name="ArrowLeft" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {listing.title}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={theme.colors.accentForeground}
          />
        }
      >
        {/* Images */}
        <View style={{ height: heroH, backgroundColor: "#0A0A0A" }}>
          {images.length > 0 ? (
            <>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) =>
                  setImgIdx(Math.round(e.nativeEvent.contentOffset.x / screenW))
                }
              >
                {images.map((uri, i) => (
                  <Image
                    key={`${uri}-${i}`}
                    source={{ uri }}
                    style={{ width: screenW, height: heroH }}
                    contentFit="cover"
                    transition={200}
                  />
                ))}
              </ScrollView>
              {images.length > 1 && (
                <View style={styles.dots}>
                  {images.map((_, i) => (
                    <View key={i} style={[styles.dot, i === imgIdx && styles.dotActive]} />
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={styles.center}>
              <Icon name="Package" size={40} color="#3F3F46" />
            </View>
          )}
        </View>

        <View style={{ padding: 14 }}>
          <Text style={styles.title}>{listing.title}</Text>

          <View style={styles.priceRow}>
            <Text style={styles.priceUsd}>{money(priceUsd)}</Text>
            {priceDhb > 0 && (
              <Text style={styles.priceDhb}>≈ {priceDhb.toLocaleString("en-US")} DHB</Text>
            )}
          </View>

          <View style={styles.tagRow}>
            <View style={styles.tag}>
              <Text style={styles.tagText}>{listing.category}</Text>
            </View>
            {!!listing.condition && (
              <View style={styles.tag}>
                <Text style={styles.tagText}>{listing.condition}</Text>
              </View>
            )}
            <View style={styles.tag}>
              <Text style={styles.tagText}>{listing.is_digital ? "Digital" : "Physical"}</Text>
            </View>
            {typeof listing.stock_quantity === "number" && (
              <View style={styles.tag}>
                <Text style={styles.tagText}>{listing.stock_quantity} in stock</Text>
              </View>
            )}
          </View>

          {count > 0 && (
            <View style={styles.ratingRow}>
              <Stars value={avg} />
              <Text style={styles.ratingText}>
                {avg.toFixed(1)} ({count})
              </Text>
            </View>
          )}

          {/* Seller */}
          {!!listing.stores && (
            <Pressable
              style={styles.sellerRow}
              onPress={() =>
                listing.store_id
                  ? navigation.navigate(ScreenNames.StoreDetail, { storeId: listing.store_id })
                  : showUserProfile(sellerAddress)
              }
            >
              <Avatar
                uri={getAvatarUrl(listing.stores.avatar_url)}
                size={32}
                rounded
                name={listing.stores.name}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.sellerName} numberOfLines={1}>
                  {listing.stores.name}
                </Text>
                <Text style={styles.sellerAddr}>{shortAddr(sellerAddress)}</Text>
              </View>
              <Icon name="ChevronRight" size={16} color="#52525B" />
            </Pressable>
          )}

          {!!listing.description && <Text style={styles.desc}>{listing.description}</Text>}

          {!!listing.shipping_info && (
            <View style={styles.infoBox}>
              <Icon name="Truck" size={14} color="#A1A1AA" />
              <Text style={styles.infoText}>{listing.shipping_info}</Text>
            </View>
          )}

          {/* Buy */}
          {isSelf ? (
            <View style={styles.noteBox}>
              <Text style={styles.noteText}>This is your own listing.</Text>
            </View>
          ) : soldOut ? (
            <View style={styles.noteBox}>
              <Text style={styles.noteText}>Sold out.</Text>
            </View>
          ) : (
            <>
              {!listing.is_digital && (
                <>
                  <Text style={styles.fieldLabel}>Shipping address</Text>
                  <TextInput
                    value={shipping}
                    onChangeText={setShipping}
                    placeholder="Where should this be sent?"
                    placeholderTextColor="#52525B"
                    multiline
                    style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
                  />
                </>
              )}
              <Text style={styles.fieldLabel}>Note to seller (optional)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Size, colour, anything else"
                placeholderTextColor="#52525B"
                style={styles.input}
              />

              <Pressable
                onPress={handleBuy}
                disabled={buying || priceDhb <= 0}
                style={[styles.buyBtn, (buying || priceDhb <= 0) && styles.buyBtnDisabled]}
              >
                {buying ? (
                  <ActivityIndicator color="#000000" />
                ) : (
                  <>
                    <Icon name="ShoppingCart" size={17} color="#000000" />
                    <Text style={styles.buyBtnText}>
                      {priceDhb > 0
                        ? `Buy for ${priceDhb.toLocaleString("en-US")} DHB`
                        : "Loading price…"}
                    </Text>
                  </>
                )}
              </Pressable>
              <Text style={styles.buyHint}>
                Paid in DHB on Base, directly to the seller's wallet.
              </Text>
            </>
          )}

          {/* Reviews */}
          <Text style={styles.sectionTitle}>
            {count === 1 ? "1 review" : `${count} reviews`}
          </Text>

          {hasPurchased.data && (
            <View style={styles.reviewComposer}>
              <Stars value={rating} size={22} onPick={setRating} />
              <TextInput
                value={reviewText}
                onChangeText={setReviewText}
                placeholder="How was it?"
                placeholderTextColor="#52525B"
                style={[styles.input, { marginTop: 10 }]}
                multiline
              />
              <Pressable
                onPress={submitReview}
                disabled={createReview.isPending}
                style={[styles.reviewBtn, createReview.isPending && styles.buyBtnDisabled]}
              >
                {createReview.isPending ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <Text style={styles.reviewBtnText}>Post review</Text>
                )}
              </Pressable>
            </View>
          )}

          {(reviews.data ?? []).length === 0 ? (
            <Text style={styles.emptyText}>No reviews yet</Text>
          ) : (
            (reviews.data ?? []).map((r) => <ReviewRow key={r.id} review={r} />)
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", flex: 1 },

  dots: {
    position: "absolute",
    bottom: 10,
    alignSelf: "center",
    flexDirection: "row",
    gap: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.35)" },
  dotActive: { backgroundColor: "#FFFFFF" },

  title: { color: "#FFFFFF", fontSize: 19, fontWeight: "700", lineHeight: 25 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 8 },
  priceUsd: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" },
  priceDhb: { color: "#A1A1AA", fontSize: 13, fontWeight: "600" },

  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  tag: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  tagText: { color: "#A1A1AA", fontSize: 11, fontWeight: "600", textTransform: "capitalize" },

  ratingRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 12 },
  ratingText: { color: "#A1A1AA", fontSize: 12.5, fontWeight: "600" },

  sellerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
    padding: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  sellerName: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "600" },
  sellerAddr: { color: "#71717A", fontSize: 11, marginTop: 2 },

  desc: { color: "#D4D4D8", fontSize: 13.5, lineHeight: 20, marginTop: 16 },

  infoBox: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    marginTop: 14,
    padding: 11,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  infoText: { color: "#A1A1AA", fontSize: 12.5, lineHeight: 18, flex: 1 },

  noteBox: {
    marginTop: 18,
    padding: 13,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
  },
  noteText: { color: "#A1A1AA", fontSize: 13, fontWeight: "600" },

  fieldLabel: { color: "#A1A1AA", fontSize: 12, fontWeight: "600", marginTop: 16, marginBottom: 6 },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#FFFFFF",
    fontSize: 14,
  },

  buyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 18,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    paddingVertical: 14,
  },
  buyBtnDisabled: { opacity: 0.45 },
  buyBtnText: { color: "#000000", fontSize: 15, fontWeight: "700" },
  buyHint: { color: "#52525B", fontSize: 11, textAlign: "center", marginTop: 8 },

  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 26,
    marginBottom: 10,
  },
  reviewComposer: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 14,
  },
  reviewBtn: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    paddingVertical: 10,
    alignItems: "center",
  },
  reviewBtnText: { color: "#000000", fontSize: 13.5, fontWeight: "700" },

  reviewRow: {
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  reviewHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  reviewAuthor: { color: "#E4E4E7", fontSize: 12.5, fontWeight: "600" },
  reviewBody: { color: "#A1A1AA", fontSize: 13, lineHeight: 19, marginTop: 5 },

  emptyText: { color: "#71717A", fontSize: 13, marginTop: 8, textAlign: "center" },
});
