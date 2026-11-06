import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import qrcode from "qrcode-generator";
import { useTranslation as _useCopy } from "react-i18next";
import Icon from "../ui/Icon";
import { copyToClipboard } from "../../libs/clipboard.utils";
import { toastError, toastSuccess } from "../../libs/toast";
import { estimateMinutes, formatPaymentAmount, paymentChainName } from "../../libs/crypto-purchase";
import {
  ANY_COIN_MIN_USD,
  anyCoinIntentStatus,
  fetchAnyCoins,
  intentInFlight,
  isEvmCoin,
  listAnyCoinIntents,
  openAnyCoinIntent,
  quoteAnyCoin,
  type AnyCoin,
  type AnyCoinIntent,
  type AnyCoinQuote,
} from "../../libs/studioCoinIntent";

const LOGOS: Record<string, any> = {
  BTC: require("../../assets/tokens/BTC.png"),
  ETH: require("../../assets/tokens/ETH.png"),
  SOL: require("../../assets/tokens/SOL.png"),
  BNB: require("../../assets/tokens/BNB.png"),
  USDC: require("../../assets/tokens/USDC.png"),
  USDT: require("../../assets/tokens/USDT.png"),
};

function CoinIcon({ symbol, size = 30 }: { symbol: string; size?: number }) {
  if (LOGOS[symbol]) return <Image source={LOGOS[symbol]} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  const hue = [...symbol].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
  return (
    <View style={[s.letters, { width: size, height: size, borderRadius: size / 2, backgroundColor: `hsl(${hue}, 45%, 32%)` }]}>
      <Text style={s.lettersText}>{symbol.slice(0, 3)}</Text>
    </View>
  );
}

function Qr({ value }: { value: string }) {
  const qr = useMemo(() => {
    const code = qrcode(0, "M");
    code.addData(value);
    code.make();
    const size = code.getModuleCount();
    let path = "";
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (code.isDark(y, x)) path += `M${x + 2},${y + 2}h1v1h-1z`;
    return { size: size + 4, path };
  }, [value]);
  return (
    <View style={s.qr}>
      <Svg width={112} height={112} viewBox={`0 0 ${qr.size} ${qr.size}`}>
        <Path fill="#000" d={qr.path} />
      </Svg>
    </View>
  );
}

/**
 * "Any other coin" inside the generation paywall: pay from any wallet or
 * exchange in one of the 200+ coins NEAR Intents carries. The dollars land in
 * the Studio balance, then `onFunded` runs the job.
 */
const AnyCoinPay: React.FC<{
  usdNeeded: number;
  account?: string | null;
  solanaAddress?: string | null;
  onBack: () => void;
  onFunded: () => void;
  /** Harness only: fixed coins and an optional open payment, nothing is sent. */
  preview?: { coins: AnyCoin[]; intent?: AnyCoinIntent };
}> = ({ usdNeeded, account, solanaAddress, onBack, onFunded, preview }) => {
  const { t: _copy } = _useCopy();
  const usd = Math.max(ANY_COIN_MIN_USD, Math.ceil(usdNeeded * 100) / 100);
  const [coins, setCoins] = useState<AnyCoin[]>(preview?.coins || []);
  const [coinsState, setCoinsState] = useState<"loading" | "ok" | "error">(preview ? "ok" : "loading");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<AnyCoin | null>(null);
  const [refund, setRefund] = useState("");
  const [quote, setQuote] = useState<AnyCoinQuote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [intent, setIntent] = useState<AnyCoinIntent | null>(preview?.intent || null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (preview) return;
    let alive = true;
    fetchAnyCoins()
      .then((list) => { if (alive) { setCoins(list); setCoinsState("ok"); } })
      .catch(() => alive && setCoinsState("error"));
    // A payment opened earlier and not finished picks up where it left off.
    listAnyCoinIntents()
      .then((rows) => {
        const live = rows.find((row) => intentInFlight(row));
        if (alive && live) setIntent((cur) => cur || live);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [preview]);

  useEffect(() => {
    if (!picked) return;
    setRefund(isEvmCoin(picked) ? account || "" : picked.blockchain === "sol" ? solanaAddress || "" : "");
    setError("");
    setQuote(null);
    setQuoteError("");
    if (preview) {
      setQuote({ amountInFormatted: picked.price ? String(usd / picked.price) : null, amountInUsd: null, timeEstimateSeconds: 60, usd, raisedToMinimum: false });
      return;
    }
    let alive = true;
    quoteAnyCoin(picked.assetId, usd)
      .then((q) => alive && setQuote(q))
      .catch((e) => alive && setQuoteError(e instanceof Error ? e.message : ""));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked?.assetId]);

  // Watch an open payment until the dollars are in the Studio balance.
  useEffect(() => {
    if (!intent || preview || intent.credited || !intentInFlight(intent)) return;
    const timer = setTimeout(async () => {
      try { setIntent(await anyCoinIntentStatus(intent.id)); } catch { /* next tick */ }
    }, 10_000);
    return () => clearTimeout(timer);
  }, [intent, preview]);
  useEffect(() => {
    if (!intent?.credited || preview) return;
    toastSuccess(_copy("anyCoin.landed", { defaultValue: "${{usd}} added to your Studio balance", usd: (intent.creditedUsd ?? intent.usd).toFixed(2) }));
    onFunded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent?.credited]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? coins.filter((c) => `${c.symbol} ${paymentChainName(c.blockchain)} ${c.blockchain} ${c.contractAddress || ""}`.toLowerCase().includes(q))
      : coins;
    return list.slice(0, q ? 60 : 30);
  }, [coins, search]);

  const copy = (value: string) => {
    copyToClipboard(value);
    toastSuccess(_copy("anyCoin.copied", { defaultValue: "Copied" }));
  };

  const open = async () => {
    if (!picked || preview || opening) return;
    setOpening(true);
    setError("");
    try {
      setIntent(await openAnyCoinIntent(picked.assetId, quote?.usd || usd, refund.trim()));
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setError(message || _copy("anyCoin.openFailed", { defaultValue: "Could not open that payment. Try again." }));
    } finally {
      setOpening(false);
    }
  };

  const header = (title: string, back: () => void) => (
    <View style={s.header}>
      <TouchableOpacity
        onPress={back}
        style={s.back}
        accessibilityLabel={_copy("anyCoin.back", { defaultValue: "Back" })}
        activeOpacity={0.7}
      >
        <Icon name="ArrowLeft" size={18} color="#F9FBFF" />
      </TouchableOpacity>
      <Text style={s.title}>{title}</Text>
    </View>
  );

  // Step 3: the address to send to.
  if (intent) {
    const minutes = estimateMinutes(intent.timeEstimateSeconds);
    const failed = !intent.credited && !intentInFlight(intent);
    const status = intent.credited
      ? _copy("anyCoin.statusDone", { defaultValue: "Paid. Starting your job…" })
      : failed
        ? intent.settlement === "REFUNDED"
          ? _copy("anyCoin.statusRefunded", { defaultValue: "Refunded to your address." })
          : _copy("anyCoin.statusExpired", { defaultValue: "This payment address has closed. Nothing was taken." })
        : intent.settlement === "INCOMPLETE_DEPOSIT"
          ? _copy("anyCoin.statusShort", { defaultValue: "Less than the amount arrived. Send the rest to the same address." })
          : intent.settlement === "PENDING_DEPOSIT"
            ? _copy("anyCoin.statusWaiting", { defaultValue: "Waiting for your payment…" })
            : _copy("anyCoin.statusSwapping", { defaultValue: "Payment seen. Converting it…" });
    return (
      <View style={s.wrap}>
        {header(_copy("anyCoin.sendTitle", { defaultValue: "Send {{symbol}}", symbol: intent.originSymbol }), () => {
          setIntent(null);
          if (!picked) onBack();
        })}
        <View style={s.sendCard}>
          <Qr value={intent.depositAddress} />
          <View style={{ flex: 1 }}>
            <Text style={s.muted}>{_copy("anyCoin.exactAmount", { defaultValue: "Send exactly" })}</Text>
            <TouchableOpacity onPress={() => copy(intent.amountInFormatted)} style={s.amountRow} activeOpacity={0.7}>
              <Text style={s.amount}>{formatPaymentAmount(intent.amountInFormatted)}</Text>
              <Icon name="Copy" size={14} color="#A6A9AC" />
            </TouchableOpacity>
            <Text style={s.coinName}>
              {intent.originSymbol}{" "}
              <Text style={s.muted}>{_copy("anyCoin.onChain", { defaultValue: "on {{chain}}", chain: paymentChainName(intent.originBlockchain) })}</Text>
            </Text>
            <Text style={[s.muted, { marginTop: 4 }]}>
              {_copy("anyCoin.worth", { defaultValue: "≈ ${{usd}} to your Studio balance", usd: intent.usd.toFixed(2) })}
            </Text>
          </View>
        </View>
        <Text style={s.muted}>{_copy("anyCoin.toAddress", { defaultValue: "To this address" })}</Text>
        <TouchableOpacity onPress={() => copy(intent.depositAddress)} style={s.addressRow} activeOpacity={0.7}>
          <Text style={s.address}>{intent.depositAddress}</Text>
          <View style={{ width: 16, flexShrink: 0 }}><Icon name="Copy" size={16} color="#A6A9AC" /></View>
        </TouchableOpacity>
        {!!intent.depositMemo && (
          <TouchableOpacity onPress={() => copy(intent.depositMemo!)} style={s.memo} activeOpacity={0.7}>
            <Text style={s.memoNote}>{_copy("anyCoin.memo", { defaultValue: "Add this memo or the payment is lost:" })}</Text>
            <Text style={s.address}>{intent.depositMemo}</Text>
          </TouchableOpacity>
        )}
        <View style={[s.status, failed && s.statusFailed]}>
          {intent.credited ? (
            <Icon name="Check" size={16} color="#34D399" />
          ) : !failed ? (
            <ActivityIndicator size="small" color="#A6A9AC" />
          ) : null}
          <Text style={[s.statusText, failed && { color: "#FCA5A5" }]}>{status}</Text>
        </View>
        {!failed && !intent.credited && (
          <Text style={s.small}>
            {minutes
              ? _copy("anyCoin.timing", { defaultValue: "Usually about {{minutes}} min after your payment confirms. You can close this; it still lands.", minutes })
              : _copy("anyCoin.timingUnknown", { defaultValue: "Lands once your payment confirms. You can close this; it still lands." })}
          </Text>
        )}
      </View>
    );
  }

  // Step 2: refund address and price.
  if (picked) {
    return (
      <View style={s.wrap}>
        {header(_copy("anyCoin.payTitle", { defaultValue: "Pay with {{symbol}}", symbol: picked.symbol }), () => setPicked(null))}
        <View style={s.row}>
          <CoinIcon symbol={picked.symbol} size={34} />
          <View style={{ flex: 1 }}>
            <Text style={s.coinName}>
              {picked.symbol} <Text style={s.muted}>{paymentChainName(picked.blockchain)}</Text>
            </Text>
            <Text style={s.muted}>{_copy("anyCoin.covers", { defaultValue: "Covers ${{usd}}", usd: (quote?.usd || usd).toFixed(2) })}</Text>
          </View>
          {quote?.amountInFormatted ? (
            <Text style={s.price}>≈ {formatPaymentAmount(quote.amountInFormatted)}</Text>
          ) : quoteError ? null : (
            <ActivityIndicator size="small" color="#A6A9AC" />
          )}
        </View>
        {!!quote?.raisedToMinimum && (
          <Text style={s.warn}>
            {_copy("anyCoin.minimum", { defaultValue: "{{symbol}} payments start at ${{usd}}. The extra stays in your Studio balance.", symbol: picked.symbol, usd: quote.usd.toFixed(2) })}
          </Text>
        )}
        {!!quoteError && <Text style={s.error}>{quoteError}</Text>}
        <Text style={s.muted}>
          {_copy("anyCoin.refundLabel", { defaultValue: "Your {{chain}} address, for refunds", chain: paymentChainName(picked.blockchain) })}
        </Text>
        <TextInput
          value={refund}
          onChangeText={setRefund}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={_copy("anyCoin.refundPlaceholder", { defaultValue: "Paste an address you own" })}
          placeholderTextColor="#6F7174"
          style={s.input}
        />
        <Text style={s.small}>
          {_copy("anyCoin.refundHint", { defaultValue: "Only used if the payment can’t go through. Use your own wallet, not an exchange." })}
        </Text>
        {!!error && <Text style={s.error}>{error}</Text>}
        <TouchableOpacity
          onPress={open}
          disabled={opening || !refund.trim() || !quote?.amountInFormatted}
          style={[s.cta, (opening || !refund.trim() || !quote?.amountInFormatted) && { opacity: 0.5 }]}
          activeOpacity={0.8}
        >
          {opening ? <ActivityIndicator size="small" color="#09090B" /> : (
            <Text style={s.ctaText}>{_copy("anyCoin.getAddress", { defaultValue: "Get payment address" })}</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  // Step 1: pick a coin.
  return (
    <View style={s.wrap}>
      {header(_copy("anyCoin.title", { defaultValue: "Any other coin" }), onBack)}
      <View style={s.search}>
        <Icon name="Search" size={16} color="#A6A9AC" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={_copy("anyCoin.search", { defaultValue: "Search {{count}} coins", count: coins.length || 200 })}
          placeholderTextColor="#6F7174"
          style={s.searchInput}
        />
      </View>
      {coinsState === "loading" ? (
        <ActivityIndicator size="small" color="#A6A9AC" style={{ paddingVertical: 16 }} />
      ) : coinsState === "error" ? (
        <Text style={s.empty}>{_copy("anyCoin.loadFailed", { defaultValue: "Could not load coins. Try again shortly." })}</Text>
      ) : rows.length === 0 ? (
        <Text style={s.empty}>{_copy("anyCoin.noMatch", { defaultValue: "No coin matches that." })}</Text>
      ) : (
        rows.map((coin) => (
          <TouchableOpacity key={coin.assetId} onPress={() => setPicked(coin)} style={s.row} activeOpacity={0.8}>
            <CoinIcon symbol={coin.symbol} />
            <View style={{ flex: 1 }}>
              <Text style={s.coinName}>{coin.symbol}</Text>
              <Text style={s.muted}>{paymentChainName(coin.blockchain)}</Text>
            </View>
            {!!coin.price && coin.price > 0 && (
              <Text style={s.price}>{formatPaymentAmount(String(usd / coin.price))}</Text>
            )}
          </TouchableOpacity>
        ))
      )}
      <Text style={[s.small, { textAlign: "center" }]}>
        {_copy("anyCoin.note", { defaultValue: "Send from any wallet or exchange. It lands in your Studio balance." })}
      </Text>
    </View>
  );
};

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 16, marginTop: 4, gap: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 2 },
  back: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  title: { color: "#F9FBFF", fontSize: 17, fontWeight: "800" },
  search: { flexDirection: "row", alignItems: "center", gap: 8, height: 44, borderRadius: 14, paddingHorizontal: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.06)" },
  searchInput: { flex: 1, color: "#F9FBFF", fontSize: 14, paddingVertical: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.06)" },
  letters: { alignItems: "center", justifyContent: "center" },
  lettersText: { color: "#F9FBFF", fontSize: 10, fontWeight: "800" },
  coinName: { color: "#F9FBFF", fontSize: 15, fontWeight: "800" },
  muted: { color: "#A6A9AC", fontSize: 12 },
  small: { color: "#6F7174", fontSize: 11 },
  price: { color: "#F9FBFF", fontSize: 14, fontWeight: "800" },
  empty: { color: "#A6A9AC", fontSize: 13, textAlign: "center", paddingVertical: 16 },
  warn: { color: "#FDE68A", fontSize: 12 },
  error: { color: "#FCA5A5", fontSize: 12 },
  input: { height: 44, borderRadius: 14, paddingHorizontal: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.06)", color: "#F9FBFF", fontSize: 13 },
  cta: { height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", marginTop: 4 },
  ctaText: { color: "#09090B", fontSize: 16, fontWeight: "800" },
  sendCard: { flexDirection: "row", gap: 12, padding: 12, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.06)" },
  qr: { width: 124, height: 124, borderRadius: 14, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  amountRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  amount: { color: "#F9FBFF", fontSize: 22, fontWeight: "800" },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)" },
  address: { flex: 1, color: "#F9FBFF", fontSize: 12, fontFamily: "monospace" },
  memo: { borderRadius: 14, borderWidth: 1, borderColor: "rgba(251,191,36,0.4)", padding: 12, gap: 4 },
  memoNote: { color: "#FCD34D", fontSize: 12 },
  status: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)" },
  statusFailed: { backgroundColor: "rgba(239,68,68,0.1)" },
  statusText: { color: "#F9FBFF", fontSize: 13, fontWeight: "600", flex: 1 },
});

export default AnyCoinPay;
