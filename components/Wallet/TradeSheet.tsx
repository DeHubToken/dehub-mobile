import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ethers } from "ethers";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import { ChainId } from "../../config/constants";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useDexSigner } from "../../hooks/useDexSigner";
import { toastSuccess } from "../../libs";
import { dexActionError } from "../../libs/dex-action-error";
import { formatPrice, formatSize } from "../../libs/dex-orderbook";
import { evmProvider, quoteSwap, runSwap, type SwapCall } from "../../libs/dex-evm-swap";
import { DHB_BASE, POOL_CHAIN_INFO } from "../../libs/dex-pools";
import { mintSell, quoteSell, type SellInput } from "../../libs/dex-v4";
import { withWalletHeader } from "../../libs/supabase-wallet-client";
import { supabase } from "../../services/supabase";

const USDC = POOL_CHAIN_INFO.base.usdc;
const ERC20 = ["function balanceOf(address) view returns (uint256)"];
/** Same key and shape the DEX screen resumes from, so a listing that mints but fails to
 *  register is picked up there instead of being lost. */
const pendingKey = (wallet: string) => `dex-pending:${wallet.toLowerCase()}`;

type Step = "choose" | "amount" | "price" | "review" | "done";
type Route = "instant" | "list";

const decimal = (value: string) => value.replace(",", ".").replace(/[^\d.]/g, "");
const toUnits = (value: string) => {
  const [whole = "0", fraction = ""] = value.split(".");
  try { return BigInt(ethers.utils.parseUnits(`${whole || "0"}.${fraction.slice(0, 18) || "0"}`, 18).toString()); } catch { return null; }
};
const units18 = (value: bigint) => ethers.utils.formatUnits(value.toString(), 18);

/** Wallet "Trade": pick Easy trade or the full Exchange. Easy trade sells DHB on Base in three
 *  steps. A market or at/below-market price sells instantly; a price above market is listed as a
 *  single-sided position on the exchange's own book. */
export default function TradeSheet({ visible, onClose, address }: { visible: boolean; onClose: () => void; address: string }) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const signer = useDexSigner();

  const [step, setStep] = useState<Step>("choose");
  const [balance, setBalance] = useState<bigint>(0n);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"market" | "custom">("market");
  const [price, setPrice] = useState("");
  const [quote, setQuote] = useState<SwapCall | null>(null);
  const [quotedAt, setQuotedAt] = useState(0);
  const [route, setRoute] = useState<Route>("instant");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ route: Route; amount: string; usdc: number; price: number } | null>(null);

  useEffect(() => {
    if (!visible) {
      setStep("choose"); setAmount(""); setMode("market"); setPrice(""); setQuote(null);
      setNotice(""); setError(""); setStage(""); setResult(null);
      return;
    }
    let live = true;
    if (address) {
      (new ethers.Contract(DHB_BASE, ERC20, evmProvider(ChainId.BASE_MAINNET)).balanceOf(address) as Promise<ethers.BigNumber>)
        .then((value) => { if (live) setBalance(BigInt(value.toString())); }).catch(() => {});
    }
    return () => { live = false; };
  }, [visible, address]);

  const amountUnits = amount ? toUnits(amount) : null;
  const amountOk = amountUnits != null && amountUnits > 0n && amountUnits <= balance;
  const quotedUsdc = quote ? Number(ethers.utils.formatUnits(quote.amountOut.toString(), 6)) : 0;
  const marketRate = quote && Number(amount) > 0 ? quotedUsdc / Number(amount) : null;
  const myPrice = Number(price);

  async function fetchQuote() {
    const next = await quoteSwap({ chainId: ChainId.BASE_MAINNET, tokenIn: DHB_BASE, tokenOut: USDC, amountIn: amountUnits!, recipient: address });
    setQuote(next); setQuotedAt(Date.now());
    return next;
  }
  async function toPrice() {
    if (!amountOk) return;
    if (!address) { setError(t("dex.connectWallet")); return; }
    setBusy(true); setError("");
    try { await fetchQuote(); setStep("price"); }
    catch (e) { setError(dexActionError(e, t("easyTrade.quoteFailed"))); }
    finally { setBusy(false); }
  }
  function toReview() {
    setError(""); setNotice("");
    if (mode === "custom" && !(myPrice > 0)) { setError(t("easyTrade.enterPrice")); return; }
    // Only a price above what the market pays right now needs to wait on the book.
    setRoute(mode === "custom" && marketRate != null && myPrice > marketRate ? "list" : "instant");
    setStep("review");
  }

  async function sellInstantly() {
    // A quote older than half a minute is re-read so the minimum out reflects the market now.
    const live = quote && Date.now() - quotedAt < 30_000 ? quote : await fetchQuote();
    const provider = await signer(ChainId.BASE_MAINNET, t("dex.unlockWallet"));
    setStage(t("dex.stage.swap"));
    await runSwap(live, provider, address);
    finish("instant", Number(ethers.utils.formatUnits(live.amountOut.toString(), 6)));
  }
  async function confirm() {
    if (!address || !amountUnits) return;
    setBusy(true); setError("");
    try {
      if (route === "list") {
        const input: SellInput = {
          walletAddress: address, chainId: ChainId.BASE_MAINNET, side: "sell", amount: units18(amountUnits),
          minPrice: myPrice.toFixed(8), maxPrice: (myPrice * 1.001).toFixed(8),
        };
        try {
          await quoteSell(input);
        } catch (e) {
          // The book's own pool already trades above this price, so it would fill at once:
          // selling instantly gets at least as much without a position to withdraw later.
          if (!/overlaps the pool price/i.test((e as Error).message ?? "")) throw e;
          setRoute("instant"); setNotice(t("easyTrade.marketMoved"));
          await sellInstantly(); return;
        }
        const provider = await signer(ChainId.BASE_MAINNET, t("dex.unlockWallet"));
        const minted = await mintSell(input, provider, (s) => setStage(t(`dex.stage.${s}`)), (txHash) => {
          void AsyncStorage.setItem(pendingKey(address), JSON.stringify({ input, txHash })).catch(() => {});
        });
        setStage(t("dex.stage.index"));
        const { error: saveError } = await withWalletHeader(supabase.from("dex_sell_positions").upsert({
          chain_id: ChainId.BASE_MAINNET, token_id: minted.tokenId, owner_address: address, mint_tx_hash: minted.txHash,
          side: "sell", dhb_amount: Number(input.amount), usdc_amount: null,
          min_usdc_per_dhb: Number(input.minPrice), max_usdc_per_dhb: Number(input.maxPrice),
        }, { onConflict: "chain_id,token_id", ignoreDuplicates: true }), address);
        if (saveError) throw new Error(t("dex.registrationFailed"));
        await AsyncStorage.removeItem(pendingKey(address)).catch(() => {});
        finish("list", Number(input.amount) * myPrice);
        return;
      }
      await sellInstantly();
    } catch (e) {
      setError(dexActionError(e, t("dex.prepareFailed")));
    } finally { setBusy(false); setStage(""); }
  }

  function finish(done: Route, usdc: number) {
    setResult({ route: done, amount, usdc, price: myPrice });
    setStep("done");
    toastSuccess(done === "list"
      ? t("easyTrade.doneList", { amount: formatSize(Number(amount)), price: formatPrice(myPrice) })
      : t("easyTrade.doneInstant", { amount: formatSize(Number(amount)) }));
  }
  function openExchange() { onClose(); navigation.navigate(ScreenNames.Dex); }
  const back = () => { setError(""); setNotice(""); setStep(step === "review" ? "price" : step === "price" ? "amount" : "choose"); };

  const title = step === "choose" ? t("easyTrade.chooseTitle") : step === "amount" ? t("easyTrade.sellTitle")
    : step === "price" ? t("easyTrade.priceTitle") : step === "review" ? t("easyTrade.reviewTitle") : t("easyTrade.doneTitle");
  const stepIndex = step === "amount" ? 1 : step === "price" ? 2 : step === "review" ? 3 : 0;
  const row = "px-4 py-3.5 rounded-2xl bg-theme-neutrals-800/60 border border-white/10";
  const selected = "border-white/60 bg-white/10";

  const Primary = ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => (
    <TouchableOpacity activeOpacity={0.8} disabled={disabled || busy} onPress={onPress}
      className={`h-12 rounded-xl bg-white flex-row items-center justify-center ${disabled || busy ? "opacity-40" : ""}`}>
      {busy ? <><ActivityIndicator color="#000" /><Text className="text-black font-semibold ml-2" numberOfLines={1}>{stage || t("easyTrade.working")}</Text></>
        : <Text className="text-black font-semibold">{label}</Text>}
    </TouchableOpacity>
  );

  return (
    <GlassModal visible={visible} onClose={() => { if (!busy) onClose(); }} dismissible={!busy} presentation="bottom" maxHeight="90%" scrollable>
      <View className="px-5 pt-5 pb-6">
        <View className="flex-row items-center mb-4">
          {step !== "choose" && step !== "done" && (
            <TouchableOpacity onPress={back} disabled={busy} accessibilityLabel={t("easyTrade.back")} className="mr-2 p-1">
              <Icon name="ArrowLeft" size={20} color="#d4d4d8" />
            </TouchableOpacity>
          )}
          <Text className="text-white text-lg font-semibold flex-1">{title}</Text>
          {stepIndex > 0 && <Text className="text-theme-neutrals-400 text-xs">{t("easyTrade.stepOf", { step: stepIndex, total: 3 })}</Text>}
        </View>

        {step === "choose" && (
          <View>
            <TouchableOpacity activeOpacity={0.7} onPress={() => setStep("amount")} className={`${row} flex-row items-center mb-2`}>
              <View className="mr-3 w-9 h-9 rounded-xl bg-theme-neutrals-700/50 items-center justify-center"><Icon name="Sparkles" size={18} color="#ffffff" /></View>
              <View className="flex-1"><Text className="text-white text-sm font-semibold">{t("easyTrade.easyTitle")}</Text><Text className="text-theme-neutrals-400 text-xs mt-0.5">{t("easyTrade.easyHint")}</Text></View>
              <Icon name="ChevronRight" size={18} color="#6b7280" />
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} onPress={openExchange} className={`${row} flex-row items-center`}>
              <View className="mr-3 w-9 h-9 rounded-xl bg-theme-neutrals-700/50 items-center justify-center"><Icon name="ChartNoAxesCombined" size={18} color="#ffffff" /></View>
              <View className="flex-1"><Text className="text-white text-sm font-semibold">{t("easyTrade.exchangeTitle")}</Text><Text className="text-theme-neutrals-400 text-xs mt-0.5">{t("easyTrade.exchangeHint")}</Text></View>
              <Icon name="ChevronRight" size={18} color="#6b7280" />
            </TouchableOpacity>
          </View>
        )}

        {step === "amount" && (
          <View>
            <View className="flex-row items-center rounded-xl border border-white/10 bg-white/5">
              <TextInput autoFocus keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#52525b" value={amount}
                accessibilityLabel={t("easyTrade.sellTitle")}
                onChangeText={(v) => { setAmount(decimal(v)); setQuote(null); }}
                className="flex-1 px-4 py-4 text-3xl font-semibold text-white" />
              <Text className="pr-4 text-sm text-theme-neutrals-400">DHB</Text>
            </View>
            <View className="flex-row items-center justify-between mt-3 mb-4">
              <Text className="text-xs text-theme-neutrals-400 flex-1">{t("easyTrade.available", { amount: formatSize(Number(units18(balance))) })}</Text>
              {[25, 50, 100].map((pct) => (
                <TouchableOpacity key={pct} disabled={balance === 0n} onPress={() => { setAmount(units18(balance * BigInt(pct) / 100n)); setQuote(null); }}
                  className={`ml-1.5 px-2.5 py-1 rounded-lg border border-white/10 ${balance === 0n ? "opacity-40" : ""}`}>
                  <Text className="text-xs text-white">{pct === 100 ? t("easyTrade.max") : `${pct}%`}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {balance === 0n && <Text className="text-xs text-theme-neutrals-400 mb-3">{t("easyTrade.noDhb")}</Text>}
            {!!amount && !amountOk && balance > 0n && <Text className="text-xs text-red-300 mb-3">{t("dex.checkAmount", { token: "DHB" })}</Text>}
            <Primary label={t("easyTrade.next")} disabled={!amountOk} onPress={() => void toPrice()} />
          </View>
        )}

        {step === "price" && (
          <View>
            <TouchableOpacity activeOpacity={0.7} onPress={() => setMode("market")} className={`${row} mb-2 flex-row items-center ${mode === "market" ? selected : ""}`}>
              <View className="flex-1">
                <Text className="text-white text-sm font-semibold">{t("easyTrade.marketRate")}</Text>
                <Text className="text-theme-neutrals-400 text-xs mt-0.5">{t("easyTrade.marketRateHint", { price: formatPrice(marketRate), usdc: formatSize(quotedUsdc) })}</Text>
              </View>
              {mode === "market" && <Icon name="Check" size={18} color="#ffffff" />}
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.9} onPress={() => setMode("custom")} className={`${row} mb-4 ${mode === "custom" ? selected : ""}`}>
              <View className="flex-row items-center">
                <View className="flex-1">
                  <Text className="text-white text-sm font-semibold">{t("easyTrade.myPrice")}</Text>
                  <Text className="text-theme-neutrals-400 text-xs mt-0.5">{t("easyTrade.myPriceHint")}</Text>
                </View>
                {mode === "custom" && <Icon name="Check" size={18} color="#ffffff" />}
              </View>
              {mode === "custom" && (
                <>
                  <View className="flex-row items-center rounded-lg border border-white/10 bg-black/30 mt-3">
                    <Text className="pl-3 text-theme-neutrals-400">$</Text>
                    <TextInput autoFocus keyboardType="decimal-pad" value={price} onChangeText={(v) => setPrice(decimal(v))}
                      placeholder={marketRate ? marketRate.toFixed(6) : "0.00"} placeholderTextColor="#52525b"
                      accessibilityLabel={t("easyTrade.myPriceHint")} className="flex-1 px-2 py-3 text-lg text-white" />
                  </View>
                  {myPrice > 0 && marketRate != null && (
                    <Text className="text-xs text-zinc-300 mt-2 leading-5">
                      {myPrice > marketRate ? t("easyTrade.routeList", { price: formatPrice(myPrice) }) : t("easyTrade.routeInstant")}
                    </Text>
                  )}
                </>
              )}
            </TouchableOpacity>
            <Primary label={t("easyTrade.next")} onPress={toReview} />
          </View>
        )}

        {step === "review" && (
          <View>
            <View className={`${row} mb-3`}>
              {[
                [t("easyTrade.youSell"), `${formatSize(Number(amount))} DHB`],
                [t("easyTrade.method"), route === "list" ? t("easyTrade.methodList", { price: formatPrice(myPrice) }) : t("easyTrade.methodInstant")],
                [route === "list" ? t("easyTrade.ifFilled") : t("easyTrade.youGet"), `${formatSize(route === "list" ? Number(amount) * myPrice : quotedUsdc)} USDC`],
              ].map(([label, value], i) => (
                <View key={label} className={`flex-row justify-between ${i ? "mt-2.5" : ""}`}>
                  <Text className="text-theme-neutrals-400 text-sm">{label}</Text>
                  <Text className={`text-white text-sm ${i === 2 ? "font-semibold" : ""}`}>{value}</Text>
                </View>
              ))}
            </View>
            <Text className="text-xs text-theme-neutrals-400 mb-3 leading-5">{route === "list" ? t("easyTrade.listNote") : t("dex.pool.instantNote")}</Text>
            {!!notice && <Text className="text-xs text-amber-200 mb-3">{notice}</Text>}
            <Primary label={t("easyTrade.confirm")} onPress={() => void confirm()} />
          </View>
        )}

        {step === "done" && result && (
          <View className="items-center py-2">
            <View className="w-12 h-12 rounded-full bg-white/10 items-center justify-center mb-3"><Icon name="Check" size={24} color="#ffffff" /></View>
            <Text className="text-white font-semibold text-center">{result.route === "list"
              ? t("easyTrade.doneList", { amount: formatSize(Number(result.amount)), price: formatPrice(result.price) })
              : t("easyTrade.doneInstant", { amount: formatSize(Number(result.amount)) })}</Text>
            <Text className="text-sm text-theme-neutrals-400 text-center mt-2 mb-4">{result.route === "list" ? t("easyTrade.doneListHint") : t("easyTrade.doneInstantHint", { usdc: formatSize(result.usdc) })}</Text>
            <View className="flex-row w-full">
              {result.route === "list" && (
                <TouchableOpacity onPress={openExchange} className="flex-1 h-12 rounded-xl border border-white/15 items-center justify-center mr-2">
                  <Text className="text-white">{t("easyTrade.openExchange")}</Text>
                </TouchableOpacity>
              )}
              <View className="flex-1"><Primary label={t("easyTrade.done")} onPress={onClose} /></View>
            </View>
          </View>
        )}

        {!!error && (
          <View className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2.5">
            <Text className="text-xs text-red-200">{error}</Text>
          </View>
        )}
      </View>
    </GlassModal>
  );
}
