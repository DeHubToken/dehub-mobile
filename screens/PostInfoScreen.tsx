/**
 * PostInfoScreen
 * ==============
 * Native port of web's /app/post/:id/info. The on-chain block (token id, mint
 * time, transaction, fractions) is one section of the page — a post published
 * off-chain still has a creator, engagement, sales, content and owner
 * controls, so only that one section waits on a mint. The info button used to
 * open the explorer directly, which left unminted posts with nothing but a
 * "mint to unlock" toast.
 */
import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Icon, { type IconName } from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import Avatar from "../components/common/Avatar";
import EditPostModal from "../components/common/EditPostModal";
import BuyFractionSheet from "../components/Fractions/BuyFractionSheet";
import SellFractionsSheet, { type SellTarget } from "../components/Fractions/SellFractionsSheet";
import MakeOfferSheet, { type OfferTarget } from "../components/Fractions/MakeOfferSheet";
import { fmt, shortAddress } from "../components/Fractions/fractionFormat";
import { DeHubLoader } from "../components/DeHubLoader";
import { getNFT, getPpvSalesCount, togglePostVisibility } from "../services/nft.service";
import { supabase } from "../services/supabase";
import { useMintExistingPost } from "../hooks/useMintExistingPost";
import MintChainSheet from "../components/common/MintChainSheet";
import { useFractionBalance } from "../hooks/useFractionPortfolio";
import {
  DEFAULT_FRACTION_CHAIN,
  TOTAL_FRACTIONS,
  useFractionListings,
  type FractionListing,
} from "../hooks/useFractionMarket";
import { useUser } from "../context/AuthContext";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import { getAvatarUrl, getImageUrl } from "../libs/misc";
import { resolveViewCount } from "../libs/numbers.util";
import { copyToClipboard } from "../libs/clipboard.utils";
import { getTransactionLink, openInApp } from "../libs/links.utils";
import { toastError, toastSuccess } from "../libs/toast";
import { ScreenNames } from "../navigation/ScreenNames";
import { DhbCoin } from "../components/common/DhbCoin";
import TranscriptSection from "../components/Post/TranscriptSection";
import PostReactorsSection from "../components/Post/PostReactorsSection";
import PostStatsSection from "../components/Post/stats/PostStatsSection";
import { setPostStartTime } from "../libs/post-start-time";
import { Image } from "expo-image";
import { getTokenHolders } from "../libs/token-holders";

const MEDALS: Record<number, number> = {
  1: require("../assets/badges/1-medal.png"),
  2: require("../assets/badges/2-medal.png"),
  3: require("../assets/badges/3-medal.png"),
};

const EXPLORER_NAMES: Record<number, string> = { 8453: "BaseScan", 56: "BscScan" };

const Section: React.FC<{ title?: string; right?: React.ReactNode; children: React.ReactNode }> = ({
  title,
  right,
  children,
}) => (
  <View style={styles.section}>
    {!!title && (
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {right}
      </View>
    )}
    {children}
  </View>
);

const Stat: React.FC<{ icon: IconName; value: React.ReactNode; label: string; wide?: boolean }> = ({
  icon,
  value,
  label,
  wide,
}) => (
  <View style={[styles.stat, wide && styles.statWide]}>
    <Icon name={icon} size={20} color="#FFFFFF" />
    <View style={{ flexShrink: 1 }}>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  </View>
);

export default function PostInfoScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const tokenId = String(route.params?.tokenId ?? route.params?.postId ?? "");
  const queryClient = useQueryClient();
  const user = useUser();
  const { showUserProfile } = useUserProfileSheet();
  const { mint, isMinting } = useMintExistingPost();

  const [editing, setEditing] = useState(false);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [buying, setBuying] = useState<FractionListing | null>(null);
  const [selling, setSelling] = useState<SellTarget | null>(null);
  const [offering, setOffering] = useState<OfferTarget | null>(null);

  const { data: post, isLoading, refetch } = useQuery({
    queryKey: ["post-info", tokenId],
    queryFn: async () => (await getNFT(tokenId)).result as any,
    enabled: !!tokenId,
    staleTime: 60_000,
  });

  const isUnminted = post?.status === "signed";
  const isMinted = post?.status === "minted";
  const chainId = Number(post?.chainId) || DEFAULT_FRACTION_CHAIN;
  const isPPV = !!(post?.is_ppv || post?.streamInfo?.isPayPerView);
  const ppvPrice = post?.ppv_price ?? post?.streamInfo?.payPerViewAmount;
  const ppvCurrency = post?.ppv_currency || "DHB";
  const ppvUnit = ppvCurrency.toUpperCase() === "DHB" ? <DhbCoin size={15} /> : ppvCurrency;

  const { data: ppvSales } = useQuery({
    queryKey: ["ppv-sales-count", tokenId],
    queryFn: async () => (await getPpvSalesCount(tokenId)).salesCount ?? 0,
    enabled: !!tokenId && isPPV,
    staleTime: 60_000,
  });

  // Same floor as web: tip_records only has rows a client confirmed, the
  // backend total has the rest — show whichever is higher.
  const { data: recordedTips = 0 } = useQuery({
    queryKey: ["post-tips", tokenId],
    queryFn: async () => {
      const { data, error } = await supabase.from("tip_records").select("amount").eq("token_id", tokenId);
      return error || !data ? 0 : data.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
    },
    enabled: !!tokenId,
    staleTime: 120_000,
  });

  const { data: listings = [] } = useFractionListings(isMinted ? tokenId : undefined);
  const { data: myBalance } = useFractionBalance(isMinted ? tokenId : undefined, chainId);
  // Read from the chain, so cached for five minutes like web.
  const { data: holders = [], isLoading: loadingHolders } = useQuery({
    queryKey: ["token-holders", tokenId, chainId],
    enabled: isMinted && tokenId != null,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: () => getTokenHolders(tokenId!, chainId),
  });

  const viewer = (user?.address || user?.walletAddress || "").toLowerCase();
  const minter = String(post?.minter || "");
  const isOwner = post?.isOwner === true || (!!viewer && viewer === minter.toLowerCase());
  const categories: string[] = useMemo(
    () => (Array.isArray(post?.category) ? post.category : post?.category ? [post.category] : []),
    [post?.category],
  );

  const copy = (text: string) => {
    copyToClipboard(text);
    toastSuccess(t("postInfo.copied"));
  };

  const [mintSheet, setMintSheet] = useState(false);
  const handleMint = async (chosenChainId: number) => {
    if (!post?.tokenId) return;
    const ok = await mint(Number(post.tokenId), chainId, chosenChainId);
    if (ok) {
      setMintSheet(false);
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["single-post", tokenId] });
    }
  };

  const setHidden = async (hidden: boolean) => {
    if (savingVisibility || !!post?.isHidden === hidden) return;
    setSavingVisibility(true);
    try {
      await togglePostVisibility(tokenId, hidden);
      queryClient.setQueryData(["post-info", tokenId], (old: any) => (old ? { ...old, isHidden: hidden } : old));
      toastSuccess(t("postInfo.visibilityUpdated"));
    } catch {
      toastError(t("postInfo.visibilityFailed"));
    } finally {
      setSavingVisibility(false);
    }
  };

  const postSnapshot = {
    title: post?.name || post?.title || undefined,
    imageUrl: post?.imageUrl ? getImageUrl(post.imageUrl) : undefined,
    type: post?.postType || undefined,
  };

  if (isLoading) {
    return (
      <View style={styles.root}>
        <ScreenHeader title={t("postInfo.title")} />
        <View style={styles.center}><DeHubLoader size={56} /></View>
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.root}>
        <ScreenHeader title={t("postInfo.title")} />
        <View style={styles.center}>
          <Text style={styles.muted}>{t("postInfo.notFound")}</Text>
          <Pressable onPress={() => navigation.goBack()} style={styles.button}>
            <Text style={styles.buttonText}>{t("postInfo.goBack")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (post.status === "pending") {
    return (
      <View style={styles.root}>
        <ScreenHeader title={t("postInfo.title")} />
        <View style={styles.center}>
          <ActivityIndicator color="#FFFFFF" size="large" />
          <Text style={styles.heading}>{t("postInfo.uploadProcessing")}</Text>
          <Text style={[styles.muted, styles.centerText]}>{t("postInfo.processingDesc")}</Text>
          <Text style={[styles.faint, styles.centerText]}>{t("postInfo.processingNote")}</Text>
        </View>
      </View>
    );
  }

  const likes = post.totalVotes?.for ?? post.like_count ?? 0;
  const dislikes = post.totalVotes?.against ?? post.dislike_count ?? 0;
  const views = resolveViewCount(post);
  const comments = post.commentCount ?? post.comment_count ?? 0;
  const likeRatio = likes + dislikes > 0 ? Math.round((likes / (likes + dislikes)) * 100) : 100;
  const postTips = Math.max(recordedTips, Number(post.totalTips) || 0);
  const creatorTips = Number(post.minterUser?.receivedTips) || 0;
  const creatorName = post.minterDisplayName || post.mintername || shortAddress(minter);
  const isLive = post.postType === "live" || post.isLive !== undefined;
  const txUrl = post.mintTxHash ? getTransactionLink(chainId, post.mintTxHash) : null;
  const created = post.createdAt ? new Date(post.createdAt) : null;
  const floor = listings[0];

  return (
    <View style={styles.root}>
      <ScreenHeader title={t("postInfo.title")} />
      <ScrollView contentContainerStyle={styles.body}>
        {/* On-chain block — the only part that needs a mint. */}
        <Section>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.label}>{t("postInfo.tokenId")}</Text>
              <Text style={styles.tokenId}>#{post.tokenId}</Text>
            </View>
            <View style={[styles.statusPill, isMinted && styles.statusMinted]}>
              <Text style={[styles.statusText, isMinted && styles.statusMintedText]}>
                {isUnminted ? t("postInfo.notMinted") : post.status}
              </Text>
            </View>
          </View>
          {isUnminted ? (
            <View style={[styles.divider, styles.placeholder]}>
              <Icon name="Package" size={28} color="rgba(255,255,255,0.4)" />
              <Text style={[styles.muted, styles.centerText]}>{t("postInfo.mintToGenerate")}</Text>
              <Text style={[styles.faint, styles.centerText]}>{t("postInfo.mintDetailsLater")}</Text>
              {isOwner && (
                <Pressable onPress={() => setMintSheet(true)} disabled={isMinting} style={[styles.button, isMinting && { opacity: 0.5 }]}>
                  {isMinting && <ActivityIndicator color="#FFFFFF" size="small" />}
                  <Text style={styles.buttonText}>{t("postInfo.mintPost")}</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <>
              {created && (
                <View style={styles.divider}>
                  <Text style={styles.label}>{t("postInfo.mintedOn")}</Text>
                  <Text style={styles.value}>{created.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</Text>
                  <Text style={styles.muted}>{created.toLocaleTimeString()}</Text>
                </View>
              )}
              {!!post.mintTxHash && (
                <View style={styles.divider}>
                  <Text style={styles.label}>{t("postInfo.transactionHash")}</Text>
                  <View style={styles.rowCenter}>
                    <Text style={styles.hash} selectable>{post.mintTxHash}</Text>
                    <Pressable onPress={() => copy(post.mintTxHash)} hitSlop={8} accessibilityLabel={t("postInfo.transactionHash")}>
                      <Icon name="Copy" size={18} color="rgba(255,255,255,0.6)" />
                    </Pressable>
                    {!!txUrl && (
                      <Pressable onPress={() => openInApp(txUrl)} hitSlop={8}>
                        <Icon name="ExternalLink" size={18} color="rgba(255,255,255,0.6)" />
                      </Pressable>
                    )}
                  </View>
                  <Text style={styles.faint}>
                    {t("postInfo.viewOnExplorer", { explorer: EXPLORER_NAMES[chainId] || EXPLORER_NAMES[8453] })}
                  </Text>
                </View>
              )}
            </>
          )}
        </Section>

        {/* The creator's own stats: reach, badges, watch time, signed in vs out */}
        {isOwner && !!tokenId && !isLive && <PostStatsSection tokenId={tokenId} />}

        {isLive && (
          <Section title={t("postInfo.streamInfo")}>
            <View style={styles.rowCenter}>
              <Icon name="Radio" size={20} color={post.isLive ? "#F87171" : "#71717A"} />
              <View>
                <Text style={styles.value}>{post.isLive ? t("postInfo.currentlyLive") : t("postInfo.streamOffline")}</Text>
                <Text style={styles.muted}>{t("postInfo.totalViews", { count: post.totalViews ?? post.views ?? 0 })}</Text>
              </View>
            </View>
          </Section>
        )}

        <Section title={t("postInfo.creator")}>
          <Pressable style={styles.rowCenter} onPress={() => minter && showUserProfile(post.minterUsername || post.mintername || minter)}>
            <Avatar uri={getAvatarUrl(post.minterAvatarUrl || "")} size={44} name={creatorName} />
            <View style={{ flex: 1 }}>
              <Text style={styles.value} numberOfLines={1}>{creatorName}</Text>
              <Text style={styles.mono} numberOfLines={1}>{shortAddress(minter)}</Text>
            </View>
            <Pressable onPress={() => copy(minter)} hitSlop={8}>
              <Icon name="Copy" size={18} color="rgba(255,255,255,0.6)" />
            </Pressable>
          </Pressable>
        </Section>

        {isOwner && (
          <Section>
            <Pressable style={styles.rowCenter} onPress={() => setEditing(true)}>
              <Icon name="Pencil" size={18} color="#FFFFFF" />
              <Text style={styles.value}>{t("postOptions.editPost")}</Text>
            </Pressable>
          </Section>
        )}

        {isOwner && (
          <Section title={t("postInfo.visibility")} right={savingVisibility ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}>
            {([false, true] as const).map((hidden) => {
              const active = !!post.isHidden === hidden;
              return (
                <Pressable key={String(hidden)} onPress={() => setHidden(hidden)} style={[styles.option, active && styles.optionActive]}>
                  <Icon name={hidden ? "EyeOff" : "Globe"} size={18} color="#FFFFFF" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.value}>{hidden ? t("postInfo.unlisted") : t("postInfo.public")}</Text>
                    <Text style={styles.muted}>{hidden ? t("postInfo.unlistedDesc") : t("postInfo.publicDesc")}</Text>
                  </View>
                  {active && <Icon name="Check" size={18} color="#FFFFFF" />}
                </Pressable>
              );
            })}
          </Section>
        )}

        {isMinted && (
          <Section
            title={t("postInfo.fractionOwnership")}
            right={<Text style={styles.faint}>{t("postInfo.total", { count: TOTAL_FRACTIONS })}</Text>}
          >
            {!!myBalance && myBalance > 0 && (
              <View style={styles.rowBetween}>
                <Text style={[styles.value, { flexShrink: 1 }]}>
                  {t("postInfo.yourFractions", { count: myBalance, total: TOTAL_FRACTIONS })}
                </Text>
                <Pressable
                  style={styles.smallButton}
                  onPress={() => setSelling({ tokenId, chainId, post: postSnapshot })}
                >
                  <Text style={styles.buttonText}>{t("fractions.sell")}</Text>
                </Pressable>
              </View>
            )}
            <Text style={[styles.label, { marginTop: 8 }]}>{t("postInfo.forSale")}</Text>
            {listings.length === 0 ? (
              <Text style={styles.muted}>{t("fractions.noneForSale")}</Text>
            ) : (
              listings.slice(0, 5).map((l) => (
                <Pressable key={l.id} style={styles.listing} onPress={() => setBuying(l)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.value}>${fmt(l.price_per_fraction)} <Text style={styles.muted}>{t("fractions.perFraction")}</Text></Text>
                    <Text style={styles.muted}>
                      {t("fractions.availableCount", { count: l.quantity - l.filled_quantity })} · {shortAddress(l.seller_address)}
                    </Text>
                  </View>
                  <Icon name="ChevronRight" size={18} color="rgba(255,255,255,0.5)" />
                </Pressable>
              ))
            )}
            <Pressable
              style={[styles.button, { alignSelf: "stretch" }]}
              onPress={() => setOffering({ tokenId, chainId, title: postSnapshot.title ?? null, targetSeller: floor?.seller_address })}
            >
              <Text style={styles.buttonText}>{t("fractions.makeAnOffer")}</Text>
            </Pressable>

            <View style={[styles.rowBetween, { marginTop: 12 }]}>
              <Text style={styles.label}>{t("postInfo.distribution")}</Text>
              <Text style={styles.value}>
                {loadingHolders
                  ? t("postInfo.loading")
                  : holders.length > 0
                    ? t("postInfo.owner", { count: holders.length })
                    : t("postInfo.unavailable")}
              </Text>
            </View>
            {loadingHolders ? (
              <ActivityIndicator color="rgba(255,255,255,0.6)" style={{ paddingVertical: 8 }} />
            ) : holders.length === 0 ? (
              // A failed chain read, or no transfers in the scanned window, says
              // nothing about who owns it, so no "creator owns 100%" row here.
              <Text style={styles.muted}>{t("postInfo.ownersUnavailable")}</Text>
            ) : (
              holders
                .filter((h) => !!h.address)
                .map((h, i) => (
                  <View key={h.address} style={styles.holderRow}>
                    {MEDALS[i + 1] ? (
                      <Image source={MEDALS[i + 1]} style={styles.medal} contentFit="contain" />
                    ) : (
                      <View style={styles.rank}>
                        <Text style={styles.rankText}>{i + 1}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.value, styles.holderAddress]} numberOfLines={1}>{shortAddress(h.address)}</Text>
                      <Text style={styles.muted}>
                        {h.balance}/{TOTAL_FRACTIONS}
                        {t("copy.854cbbb4f34f", { defaultValue: " fractions (" })}
                        {h.percentage}%)
                      </Text>
                    </View>
                    <Pressable
                      hitSlop={8}
                      onPress={() => {
                        copyToClipboard(h.address);
                        toastSuccess(t("postInfo.copied"));
                      }}
                      accessibilityLabel={t("copy.7614c65db3bf", { defaultValue: "Copy wallet address" })}
                    >
                      <Icon name="Copy" size={16} color="rgba(255,255,255,0.6)" />
                    </Pressable>
                  </View>
                ))
            )}
          </Section>
        )}

        <Section title={t("postInfo.engagement")}>
          <View style={styles.ratio}>
            <View style={styles.rowBetween}>
              <Text style={styles.muted}>{t("postInfo.likeRatio")}</Text>
              <Text style={styles.statValue}>{likeRatio}%</Text>
            </View>
            <View style={styles.bar}><View style={[styles.barFill, { width: `${likeRatio}%` }]} /></View>
          </View>
          <View style={styles.grid}>
            <Stat icon="ThumbsUp" value={likes.toLocaleString()} label={t("postInfo.likes")} />
            <Stat icon="ThumbsDown" value={dislikes.toLocaleString()} label={t("postInfo.dislikes")} />
            <Stat icon="Eye" value={views.toLocaleString()} label={t("postInfo.views")} />
            <Stat icon="MessageSquare" value={Number(comments).toLocaleString()} label={t("postInfo.comments")} />
            <Stat icon="Coins" value={postTips.toLocaleString()} label={t("postInfo.tipsOnPost")} wide />
            <Stat icon="Wallet" value={creatorTips.toLocaleString()} label={t("postInfo.totalTipsCreator")} wide />
          </View>
        </Section>

        {/* Who reacted - only the author gets person rows */}
        {isOwner && tokenId != null && <PostReactorsSection tokenId={tokenId} />}

        {isPPV && (
          <Section title={t("postInfo.payPerView")}>
            <View style={styles.grid}>
              <Stat icon="Ticket" value={String(ppvSales ?? 0)} label={t("postInfo.ppvSales")} />
              {ppvPrice != null && (
                <Stat icon="Lock" value={<>{ppvPrice} {ppvUnit}</>} label={t("postInfo.price")} />
              )}
              {ppvPrice != null && (
                <Stat
                  icon="Coins"
                  value={<>{((ppvSales ?? 0) * Number(ppvPrice)).toLocaleString()} {ppvUnit}</>}
                  label={t("postInfo.totalRevenue")}
                  wide
                />
              )}
            </View>
          </Section>
        )}

        {!!(post.name || post.description) && (
          <Section title={t("postInfo.content")}>
            {!!post.name && <Text style={styles.value}>{post.name}</Text>}
            {!!post.description && <Text style={styles.muted}>{post.description}</Text>}
          </Section>
        )}

        {!!post.videoUrl && (
          <TranscriptSection
            tokenId={post.tokenId}
            onSeek={(seconds) => {
              // This screen has no player: open the post at that moment.
              setPostStartTime(post.tokenId, Math.floor(seconds));
              navigation.push(ScreenNames.FeedDetail, { tokenId: String(post.tokenId) });
            }}
          />
        )}

        {categories.length > 0 && (
          <Section title={t("postInfo.categories")}>
            <View style={styles.chips}>
              {categories.map((c) => (
                <View key={c} style={styles.chip}><Text style={styles.chipText}>{c}</Text></View>
              ))}
            </View>
          </Section>
        )}
      </ScrollView>

      {isOwner && (
        <EditPostModal
          visible={editing}
          onClose={() => setEditing(false)}
          tokenId={post.tokenId}
          initialTitle={post.name || post.title || ""}
          initialDescription={post.description || ""}
          initialCategories={categories}
          initialContentRating={post.contentRating}
          initialForKids={post.forKids}
          initialSpoilerText={post.spoilerText}
          initialQuotePolicy={post.quotePolicy}
          initialReplyPolicy={post.replyPolicy}
          initialShopLinks={post.shopLinks}
          alwaysShowTitle={post.postType === "feed-audio"}
          onSuccess={(edited) => {
            queryClient.setQueryData(["post-info", tokenId], (old: any) => (old ? { ...old, ...edited } : old));
          }}
        />
      )}
      <BuyFractionSheet
        listing={buying}
        onClose={() => setBuying(null)}
        onSignIn={() => {
          setBuying(null);
          navigation.navigate(ScreenNames.SignIn);
        }}
        onMakeOffer={(l) => {
          setBuying(null);
          setOffering({
            tokenId: l.token_id,
            chainId: l.chain_id || chainId,
            targetSeller: l.seller_address,
            listingId: l.id,
            title: l.post_title,
          });
        }}
      />
      {isOwner && isUnminted && (
        <MintChainSheet
          visible={mintSheet}
          onClose={() => setMintSheet(false)}
          defaultChainId={chainId}
          isMinting={isMinting}
          onConfirm={handleMint}
        />
      )}
      <SellFractionsSheet target={selling} onClose={() => setSelling(null)} />
      <MakeOfferSheet target={offering} onClose={() => setOffering(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  // Same 8pt side inset as the ScreenHeader island above, so the cards and
  // the top pill share their left and right edges.
  body: { paddingHorizontal: 8, paddingTop: 16, gap: 16, paddingBottom: 48 },
  section: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  holderRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 },
  medal: { width: 36, height: 36 },
  rank: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  rankText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  holderAddress: { fontFamily: "monospace", fontSize: 13 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: "600" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: 12 },
  divider: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)", paddingTop: 14, gap: 4 },
  placeholder: { alignItems: "center", paddingVertical: 20, gap: 8 },
  label: { color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: "500" },
  tokenId: { color: "#FFFFFF", fontSize: 22, fontWeight: "700", marginTop: 4 },
  value: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  heading: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  muted: { color: "rgba(255,255,255,0.6)", fontSize: 13, lineHeight: 18 },
  faint: { color: "rgba(255,255,255,0.4)", fontSize: 12, lineHeight: 16 },
  centerText: { textAlign: "center", maxWidth: 300 },
  mono: { color: "rgba(255,255,255,0.6)", fontSize: 13, fontFamily: "monospace" },
  hash: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "monospace",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 10,
    borderRadius: 8,
  },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.1)" },
  statusText: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "600" },
  statusMinted: { backgroundColor: "rgba(34,197,94,0.2)" },
  statusMintedText: { color: "#4ADE80" },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  smallButton: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.12)" },
  buttonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  optionActive: { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.25)" },
  listing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  ratio: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 12, gap: 8 },
  bar: { height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: "#FFFFFF", borderRadius: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stat: {
    flexBasis: "47%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  statWide: { flexBasis: "100%" },
  statValue: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  statLabel: { color: "rgba(255,255,255,0.6)", fontSize: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.1)" },
  chipText: { color: "#FFFFFF", fontSize: 13 },
});
