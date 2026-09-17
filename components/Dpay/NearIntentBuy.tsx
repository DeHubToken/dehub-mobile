import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useUser } from "../../context/AuthContext";
import { toastError, toastSuccess } from "../../libs/toast";
import {
  createCryptoPurchaseIntent,
  getCryptoPayableAssets,
  getCryptoPurchaseQuote,
  getCryptoPurchaseStatus,
  type CryptoPayableAsset,
  type CryptoPurchaseIntent,
  type CryptoPurchaseQuote,
} from "../../services/dpay.service";

const EVM_CHAINS = new Set(["eth", "base", "arb", "bsc", "pol", "op", "avax", "gnosis", "scroll", "monad", "bera", "xlayer", "plasma", "abs", "hypercore"]);
const CHAIN_NAMES: Record<string, string> = { eth: "Ethereum", base: "Base", arb: "Arbitrum", bsc: "BNB Chain", pol: "Polygon", sol: "Solana", btc: "Bitcoin", near: "NEAR", tron: "Tron", xrp: "XRP Ledger", ton: "TON", sui: "Sui" };
const chainName = (id: string) => CHAIN_NAMES[id] || id.toUpperCase();

const NearIntentBuy: React.FC = () => {
  const user = useUser() as any;
  const walletAddress = (user?.walletAddress || user?.address || "") as string;
  const [assets, setAssets] = useState<CryptoPayableAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [search, setSearch] = useState("");
  const [assetId, setAssetId] = useState("");
  const [dhbAmount, setDhbAmount] = useState("50000");
  const [manualRefund, setManualRefund] = useState("");
  const [quote, setQuote] = useState<CryptoPurchaseQuote | null>(null);
  const [intent, setIntent] = useState<CryptoPurchaseIntent | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getCryptoPayableAssets().then(tokens => { if (active) setAssets(tokens); })
      .catch(error => toastError(error, "Payment tokens are unavailable"))
      .finally(() => { if (active) setLoadingAssets(false); });
    return () => { active = false; };
  }, []);
  const selected = assets.find(asset => asset.assetId === assetId);
  const filtered = useMemo(() => assets.filter(asset =>
    !/deprecated/i.test(asset.symbol) && `${asset.symbol} ${chainName(asset.blockchain)}`.toLowerCase().includes(search.toLowerCase()),
  ), [assets, search]);
  const refundTo = selected && EVM_CHAINS.has(selected.blockchain) ? walletAddress : manualRefund.trim();
  const amount = Math.floor(Number(dhbAmount));
  useEffect(() => { setQuote(null); }, [assetId, dhbAmount, manualRefund]);
  useEffect(() => {
    if (!intent || ["sent", "REFUNDED", "FAILED", "EXPIRED"].includes(status)) return;
    let active = true;
    const check = async () => {
      try {
        const result = await getCryptoPurchaseStatus(intent.id);
        if (active) setStatus(result.tokenSendStatus === "sent" ? "sent" : result.settlement);
      } catch { /* The address stays visible when a status read fails. */ }
    };
    void check();
    const timer = setInterval(check, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [intent?.id, status]);

  const requestQuote = async () => {
    if (!selected || !Number.isFinite(amount) || amount <= 0) return;
    setBusy(true);
    try { setQuote(await getCryptoPurchaseQuote({ originAsset: selected.assetId, tokensToReceive: amount, refundTo: refundTo || undefined })); }
    catch (error) { toastError(error, "Could not price this purchase"); }
    finally { setBusy(false); }
  };
  const requestAddress = async () => {
    if (!selected || !walletAddress || !refundTo || !quote) return;
    setBusy(true);
    try {
      const opened = await createCryptoPurchaseIntent({ originAsset: selected.assetId, tokensToReceive: amount, receiverAddress: walletAddress, refundTo, termsAndServicesAccepted: true });
      setIntent(opened); setStatus("PENDING_DEPOSIT");
    } catch (error) { toastError(error, "Could not open this purchase"); }
    finally { setBusy(false); }
  };
  const copy = async (value: string) => { await Clipboard.setStringAsync(value); toastSuccess("Copied"); };

  return <View className="bg-theme-neutrals-800 rounded-xl p-4 border border-theme-neutrals-700/60 my-4">
    <Text className="text-white font-semibold text-lg">Pay with crypto</Text>
    <Text className="text-theme-neutrals-400 text-xs mt-1 mb-3">Use any payment token supported by NEAR Intents. DHB arrives on Base.</Text>
    {!intent ? <>
      <Text className="text-theme-neutrals-400 text-xs mb-1">DHB to receive</Text>
      <TextInput value={dhbAmount} onChangeText={setDhbAmount} keyboardType="numeric" placeholder="50000" placeholderTextColor="#71717A" className="bg-theme-neutrals-900 text-white rounded-xl px-3 py-3 mb-3" />
      <TextInput value={search} onChangeText={setSearch} placeholder="Search token or chain" placeholderTextColor="#71717A" className="bg-theme-neutrals-900 text-white rounded-xl px-3 py-3 mb-2" />
      <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }}>
        {filtered.map(asset => <TouchableOpacity key={asset.assetId} onPress={() => { setAssetId(asset.assetId); setManualRefund(""); }} className={`rounded-lg px-3 py-2 mb-1 ${assetId === asset.assetId ? "bg-white/20" : "bg-theme-neutrals-900"}`}>
          <Text className="text-white text-sm"><Text className="font-semibold">{asset.symbol}</Text> on {chainName(asset.blockchain)}</Text>
        </TouchableOpacity>)}
        {loadingAssets && <ActivityIndicator color="white" />}
        {!loadingAssets && filtered.length === 0 && <Text className="text-theme-neutrals-400 text-sm py-3">No matching tokens</Text>}
      </ScrollView>
      {selected && <>
        {!EVM_CHAINS.has(selected.blockchain) && <View className="mt-3">
          <Text className="text-theme-neutrals-400 text-xs mb-1">Your {chainName(selected.blockchain)} refund address</Text>
          <TextInput value={manualRefund} onChangeText={setManualRefund} autoCapitalize="none" placeholder="Address on the payment chain" placeholderTextColor="#71717A" className="bg-theme-neutrals-900 text-white rounded-xl px-3 py-3" />
          <Text className="text-theme-neutrals-400 text-xs mt-1">Failed payments return to this address.</Text>
        </View>}
        {quote && <View className="rounded-xl bg-theme-neutrals-900 p-3 mt-3"><Text className="text-white text-sm">Send {quote.amountInFormatted} {selected.symbol} on {chainName(selected.blockchain)}</Text><Text className="text-theme-neutrals-400 text-xs mt-1">Receive {amount.toLocaleString()} DHB · Estimated {Math.ceil(quote.timeEstimateSeconds / 60)} min</Text></View>}
        <TouchableOpacity onPress={quote ? requestAddress : requestQuote} disabled={busy || amount <= 0 || (!!quote && !refundTo)} className="bg-white/15 border border-white/25 rounded-xl py-3 mt-3 items-center disabled:opacity-50">
          {busy ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold">{quote ? "Get payment address" : "Get crypto quote"}</Text>}
        </TouchableOpacity>
      </>}
    </> : <View>
      <Text className="text-white mb-2">Send exactly {intent.amountInFormatted} {selected?.symbol} on {chainName(selected?.blockchain || "")}.</Text>
      <TouchableOpacity onPress={() => copy(intent.depositAddress)} className="bg-theme-neutrals-900 rounded-xl p-3 mb-2"><Text selectable className="text-white text-xs">{intent.depositAddress}</Text><Text className="text-theme-neutrals-400 text-xs mt-1">Tap to copy payment address</Text></TouchableOpacity>
      {intent.depositMemo && <TouchableOpacity onPress={() => copy(intent.depositMemo!)} className="bg-theme-neutrals-900 rounded-xl p-3 mb-2"><Text className="text-amber-300 text-xs">Include this memo with your payment:</Text><Text selectable className="text-white">{intent.depositMemo}</Text><Text className="text-theme-neutrals-400 text-xs">Tap to copy memo</Text></TouchableOpacity>}
      <Text className="text-theme-neutrals-400 text-xs mt-2">{status === "sent" ? "DHB delivered" : status === "SUCCESS" ? "Crypto settled. Delivering DHB…" : `Status: ${status.replace(/_/g, " ").toLowerCase()}`}</Text>
      <Text className="text-theme-neutrals-400 text-xs mt-1">Address expires {new Date(intent.expiresAt * 1000).toLocaleString()}.</Text>
      <TouchableOpacity onPress={() => { setIntent(null); setQuote(null); setStatus(""); }} className="py-3 mt-2"><Text className="text-white text-center">Start another purchase</Text></TouchableOpacity>
    </View>}
  </View>;
};

export default NearIntentBuy;
