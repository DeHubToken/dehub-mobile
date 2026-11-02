/**
 * One NFT: its live listing and offers, and what the viewer can do with it.
 *
 * Android trades here (buy, list, offer, accept, cancel) from the wallet the
 * app already holds. iOS shows the same facts with no trade buttons; in the US
 * storefront it links out to dehub.io, which Apple allows there.
 */
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ethers } from "ethers";
import { FractionSheet as Sheet, Note, Panel, PanelRow, PrimaryButton, NumberField, sheetStyles } from "../Fractions/SheetParts";
import { NftArt, formatPrice } from "./NftTile";
import { toastError, toastSuccess } from "../../libs/toast";
import { WEBSITE_LINK } from "../../config/links";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import {
  CHAIN_LABEL,
  WrongChainError,
  cancelOrder,
  checkChain,
  fillOrder,
  holding,
  listNft,
  nftMarket,
  offerOnNft,
  tokenBalance,
  type MarketCurrency,
  type MarketOrder,
  type NftTarget,
  type Signer,
} from "../../services/nft-market.service";
import { NATIVE, buildListing, buildOffer, feeOf, royaltyPaid, sellerProceeds } from "../../libs/market/seaport";

const DAYS = [7, 30, 90] as const;

interface Props {
  target: NftTarget | null;
  onClose: () => void;
  onSignIn: () => void;
  signer: Signer | null;
  /** Android: trade in the app. */
  canTrade: boolean;
  /** iOS in the US: offer the website instead. */
  linkOut: boolean;
}

const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function parseAmount(value: string, decimals: number): bigint | null {
  if (!value || !/^\d*\.?\d*$/.test(value)) return null;
  try {
    const wei = BigInt(ethers.utils.parseUnits(value, decimals).toString());
    return wei > 0n ? wei : null;
  } catch {
    return null;
  }
}

const NftSheet: React.FC<Props> = ({ target, onClose, onSignIn, signer, canTrade, linkOut }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const visible = !!target;
  const key = target ? `${target.chainId}:${target.contract}:${target.tokenId}` : "";
  const me = signer?.account?.toLowerCase() ?? "";

  const detail = useQuery({
    queryKey: ["nft-market", "nft", key],
    queryFn: () => nftMarket.nft(target!.chainId, target!.contract, target!.tokenId),
    enabled: visible,
  });
  const config = useQuery({ queryKey: ["nft-market", "config"], queryFn: nftMarket.config, staleTime: 10 * 60_000 });
  const held = useQuery({
    queryKey: ["nft-market", "held", key, me],
    queryFn: () => holding(me, { ...target!, standard: (detail.data?.nft.standard as NftTarget["standard"]) ?? target!.standard }),
    enabled: visible && !!me && (!!detail.data || !!target?.standard),
  });

  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<"none" | "list" | "offer">("none");
  const [price, setPrice] = useState("");
  const [currencyAddr, setCurrencyAddr] = useState<string>(NATIVE);
  const [days, setDays] = useState<number>(30);
  useEffect(() => {
    setMode("none");
    setPrice("");
    setCurrencyAddr(NATIVE);
    setDays(30);
  }, [key]);

  const chainId = target?.chainId ?? 0;
  const standard = ((detail.data?.nft.standard as NftTarget["standard"]) ?? target?.standard ?? "erc721") as "erc721" | "erc1155";
  const currencies: MarketCurrency[] = config.data?.chains.find((c) => c.chainId === chainId)?.currencies ?? [];
  const offerCurrencies = currencies.filter((c) => c.address.toLowerCase() !== NATIVE);
  const currency = (mode === "offer" ? offerCurrencies : currencies).find((c) => c.address.toLowerCase() === currencyAddr.toLowerCase())
    ?? (mode === "offer" ? offerCurrencies[0] : currencies[0]);
  const amount = currency ? parseAmount(price, currency.decimals) : null;

  const debouncedAmount = useDebouncedValue(amount?.toString() ?? "", 400);
  const terms = useQuery({
    queryKey: ["nft-market", "terms", key, debouncedAmount, currency?.address],
    queryFn: () => nftMarket.terms({ chainId, contract: target!.contract, tokenId: target!.tokenId, price: debouncedAmount, currency: currency!.address }),
    enabled: visible && mode !== "none" && !!debouncedAmount && !!currency,
  });

  const listings = detail.data?.listings ?? [];
  const offers = detail.data?.offers ?? [];
  const best = listings[0] ?? null;
  const holds = (held.data ?? 0n) > 0n;
  const name = detail.data?.nft.name ?? target?.name ?? `#${target?.tokenId ?? ""}`;
  const image = detail.data?.nft.image ?? target?.image ?? null;
  const collection = detail.data?.nft.collectionName ?? target?.collectionName ?? null;

  const wrongChain = useMemo(() => {
    if (!signer || !target) return null;
    try {
      checkChain(signer, target.chainId);
      return null;
    } catch (e) {
      return e instanceof WrongChainError ? e.message : null;
    }
  }, [signer, target]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["nft-market"] });
  };

  const run = async (label: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(label);
    try {
      await fn();
      toastSuccess(done);
      setMode("none");
      setPrice("");
      refresh();
    } catch (e) {
      const msg = e instanceof WrongChainError
        ? t("nftMarket.wrongChain", { chain: e.message, defaultValue: "Switch your wallet to {{chain}} to trade this" })
        : (e as Error)?.message || t("nftMarket.failed", { defaultValue: "That didn't go through. Try again." });
      toastError(/user rejected|denied|cancel/i.test(msg) ? t("nftMarket.cancelled", { defaultValue: "Cancelled" }) : msg);
    } finally {
      setBusy(null);
    }
  };

  const buy = (o: MarketOrder) => {
    if (!signer) return onSignIn();
    void run(`fill:${o.orderHash}`, () => fillOrder(signer, o), t("nftMarket.bought", { defaultValue: "It's yours" }));
  };
  const accept = (o: MarketOrder) => {
    if (!signer) return onSignIn();
    void run(`fill:${o.orderHash}`, () => fillOrder(signer, o), t("nftMarket.sold", { defaultValue: "Sold" }));
  };
  const cancel = (o: MarketOrder) => {
    if (!signer) return onSignIn();
    void run(`cancel:${o.orderHash}`, () => cancelOrder(signer, o), t("nftMarket.cancelledOrder", { defaultValue: "Cancelled on-chain" }));
  };

  const submit = () => {
    if (!signer || !target || !currency || !amount) return;
    if (!terms.data || debouncedAmount !== amount.toString()) return;
    const feeTerms = { feeRecipient: terms.data.feeRecipient, feeBps: terms.data.feeBps, royalty: terms.data.royalty };
    const nft = { contract: target.contract, tokenId: target.tokenId, standard, amount: "1" };
    if (mode === "list") {
      void run("list", () => listNft(signer, target.contract, (counter) =>
        buildListing({ seller: me, nft, currency: currency.address, price: amount, terms: feeTerms, days, counter })),
      t("nftMarket.listed", { defaultValue: "Listed for sale" }));
    } else {
      void run("offer", async () => {
        const balance = await tokenBalance(currency.address, me, chainId);
        if (balance < amount) throw new Error(t("nftMarket.notEnough", { symbol: currency.symbol, defaultValue: "Not enough {{symbol}} in your wallet" }));
        return offerOnNft(signer, currency.address, amount, (counter) =>
          buildOffer({ buyer: me, nft, currency: currency.address, price: amount, terms: feeTerms, days, counter, holder: best?.maker }));
      }, t("nftMarket.offerSent", { defaultValue: "Offer sent" }));
    }
  };

  const tradeLocked = !!busy || !!wrongChain;
  const webUrl = target ? `${WEBSITE_LINK}/nfts?chain=${target.chainId}&contract=${target.contract}&token=${target.tokenId}` : WEBSITE_LINK;

  const breakdown = (() => {
    if (!terms.data || !amount || !currency) return null;
    const feeTerms = { feeRecipient: terms.data.feeRecipient, feeBps: terms.data.feeBps, royalty: terms.data.royalty };
    const seller = mode === "list" ? me : best?.maker ?? NATIVE;
    const keep = sellerProceeds(amount, feeTerms, seller);
    const fmt = (v: bigint) => `${formatPrice(v.toString(), currency.decimals)} ${currency.symbol}`;
    return (
      <Panel>
        <PanelRow label={t("nftMarket.feeRow", { pct: (terms.data.feeBps / 100).toString(), defaultValue: "DeHub fee ({{pct}}%)" })}>
          <Text style={sheetStyles.value}>{fmt(feeOf(amount, feeTerms))}</Text>
        </PanelRow>
        {royaltyPaid(feeTerms, seller) > 0n ? (
          <PanelRow label={t("nftMarket.royaltyRow", { defaultValue: "Creator royalty" })}>
            <Text style={sheetStyles.value}>{fmt(royaltyPaid(feeTerms, seller))}</Text>
          </PanelRow>
        ) : null}
        <PanelRow strong label={mode === "list" ? t("nftMarket.youGet", { defaultValue: "You get" }) : t("nftMarket.holderGets", { defaultValue: "Holder gets" })}>
          <Text style={sheetStyles.valueStrong}>{keep > 0n ? fmt(keep) : "—"}</Text>
        </PanelRow>
      </Panel>
    );
  })();

  return (
    <Sheet visible={visible} onClose={onClose} busy={!!busy} title={name}>
      <View style={styles.artWrap}>
        <NftArt uri={image} style={styles.art} />
      </View>
      <Text style={styles.sub}>
        {[collection, CHAIN_LABEL[chainId], standard === "erc1155" ? "ERC-1155" : "ERC-721"].filter(Boolean).join(" · ")}
      </Text>

      {detail.isLoading ? <Text style={sheetStyles.center}>{t("nftMarket.loading", { defaultValue: "Loading…" })}</Text> : null}

      {best ? (
        <Panel>
          <PanelRow strong label={t("nftMarket.price", { defaultValue: "Price" })}>
            <Text style={sheetStyles.valueStrong}>{formatPrice(best.price, best.currencyDecimals)} {best.currencySymbol}</Text>
          </PanelRow>
          <PanelRow label={t("nftMarket.seller", { defaultValue: "Seller" })}>
            <Text style={sheetStyles.value}>{best.makerProfile?.username ? `@${best.makerProfile.username}` : shortAddress(best.maker)}</Text>
          </PanelRow>
          {canTrade ? (
            best.maker.toLowerCase() === me ? (
              <PrimaryButton secondary label={t("nftMarket.cancelListing", { defaultValue: "Cancel listing" })} onPress={() => cancel(best)} loading={busy === `cancel:${best.orderHash}`} disabled={tradeLocked} />
            ) : (
              <PrimaryButton label={t("nftMarket.buyNow", { defaultValue: "Buy now" })} icon="Wallet" onPress={() => buy(best)} loading={busy === `fill:${best.orderHash}`} disabled={tradeLocked} />
            )
          ) : null}
        </Panel>
      ) : detail.data ? (
        <Note text={t("nftMarket.notListed", { defaultValue: "Not listed for sale right now." })} />
      ) : null}

      {offers.length ? (
        <Panel>
          <Text style={styles.panelTitle}>{t("nftMarket.offers", { defaultValue: "Offers" })}</Text>
          {offers.slice(0, 5).map((o) => {
            const mine = o.maker.toLowerCase() === me;
            return (
              <View key={o.orderHash} style={styles.offerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={sheetStyles.value}>{formatPrice(o.price, o.currencyDecimals)} {o.currencySymbol}</Text>
                  <Text style={styles.offerMeta}>{o.makerProfile?.username ? `@${o.makerProfile.username}` : shortAddress(o.maker)}</Text>
                </View>
                {canTrade && mine ? (
                  <Pressable onPress={() => cancel(o)} disabled={tradeLocked} accessibilityRole="button">
                    <Text style={sheetStyles.link}>{t("nftMarket.cancel", { defaultValue: "Cancel" })}</Text>
                  </Pressable>
                ) : canTrade && holds ? (
                  <Pressable onPress={() => accept(o)} disabled={tradeLocked} accessibilityRole="button">
                    <Text style={[sheetStyles.link, styles.accept]}>{busy === `fill:${o.orderHash}` ? "…" : t("nftMarket.accept", { defaultValue: "Accept" })}</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </Panel>
      ) : null}

      {canTrade && wrongChain ? (
        <Note warn text={t("nftMarket.wrongChain", { chain: wrongChain, defaultValue: "Switch your wallet to {{chain}} to trade this" })} />
      ) : null}

      {canTrade && !signer ? (
        <PrimaryButton label={t("nftMarket.signInToTrade", { defaultValue: "Sign in to trade" })} onPress={onSignIn} />
      ) : null}

      {canTrade && signer && mode === "none" && detail.data ? (
        holds ? (
          !listings.some((l) => l.maker.toLowerCase() === me) ? (
            <PrimaryButton secondary label={t("nftMarket.listForSale", { defaultValue: "List for sale" })} onPress={() => { setMode("list"); setCurrencyAddr(NATIVE); }} disabled={tradeLocked} />
          ) : null
        ) : offerCurrencies.length ? (
          <PrimaryButton secondary label={t("nftMarket.makeOffer", { defaultValue: "Make an offer" })} onPress={() => { setMode("offer"); setCurrencyAddr(offerCurrencies[0].address); }} disabled={tradeLocked} />
        ) : null
      ) : null}

      {canTrade && signer && mode !== "none" ? (
        <View style={{ gap: 12 }}>
          <View style={styles.chips}>
            {(mode === "offer" ? offerCurrencies : currencies).map((c) => (
              <Chip key={c.address} label={`${c.symbol} · ${c.feeBps / 100}%`} active={currency?.address === c.address} onPress={() => setCurrencyAddr(c.address)} />
            ))}
          </View>
          <NumberField
            label={mode === "list" ? t("nftMarket.priceLabel", { defaultValue: "Price the buyer pays" }) : t("nftMarket.offerLabel", { defaultValue: "Your offer" })}
            value={price}
            onChange={setPrice}
            decimal
            unit={<Text style={styles.unit}>{currency?.symbol}</Text>}
          />
          <View style={styles.chips}>
            {DAYS.map((d) => (
              <Chip key={d} label={t("nftMarket.days", { count: d, defaultValue: "{{count}} days" })} active={days === d} onPress={() => setDays(d)} />
            ))}
          </View>
          {breakdown}
          <PrimaryButton
            label={mode === "list" ? t("nftMarket.list", { defaultValue: "List it" }) : t("nftMarket.sendOffer", { defaultValue: "Send offer" })}
            onPress={submit}
            loading={busy === "list" || busy === "offer"}
            disabled={tradeLocked || !amount || !terms.data || terms.isFetching}
          />
          <PrimaryButton secondary label={t("nftMarket.back", { defaultValue: "Back" })} onPress={() => setMode("none")} disabled={!!busy} />
          <Text style={sheetStyles.footnote}>
            {mode === "list"
              ? t("nftMarket.listHint", { defaultValue: "Signing is free. The first sale from a collection asks you to approve it once." })
              : t("nftMarket.offerHint", { defaultValue: "Signing is free. Your tokens stay in your wallet until the holder accepts." })}
          </Text>
        </View>
      ) : null}

      {!canTrade ? (
        <View style={{ gap: 10 }}>
          <Note text={t("nftMarket.viewOnly", { defaultValue: "Buying and selling NFTs isn't available in this app." })} />
          {linkOut ? (
            <PrimaryButton secondary label={t("nftMarket.tradeOnWeb", { defaultValue: "Trade on dehub.io" })} icon="ExternalLink" onPress={() => { void Linking.openURL(webUrl); }} />
          ) : null}
        </View>
      ) : null}

      {canTrade ? (
        <Text style={sheetStyles.footnote}>{t("nftMarket.feesFootnote", { defaultValue: "Fees: 2%, or 1% when paying in DHB. Every trade is one on-chain swap." })}</Text>
      ) : null}
    </Sheet>
  );
};

const Chip: React.FC<{ label: string; active: boolean; onPress: () => void }> = ({ label, active, onPress }) => (
  <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  artWrap: { width: "100%", aspectRatio: 1, borderRadius: 14, overflow: "hidden" },
  art: { width: "100%", height: "100%" },
  sub: { color: "#808089", fontSize: 12, marginTop: -4 },
  panelTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  offerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  offerMeta: { color: "#808089", fontSize: 11, marginTop: 2 },
  accept: { color: "#FFFFFF" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    height: 30,
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipActive: { backgroundColor: "rgba(255,255,255,0.16)", borderColor: "rgba(255,255,255,0.5)" },
  chipText: { color: "#A1A1AA", fontSize: 12, lineHeight: 16, fontWeight: "600" },
  chipTextActive: { color: "#FFFFFF" },
  unit: { color: "#A1A1AA", fontSize: 14, fontWeight: "600" },
});

export default NftSheet;
