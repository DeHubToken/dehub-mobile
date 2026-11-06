import React from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTranslation as _useCopy } from "react-i18next";
import {
  COIN_CHAIN_NAMES,
  coinAmountFor,
  coinKey,
  type TopUpCoin,
} from "../../libs/coinTopUp";

const COIN_LOGOS: Record<string, any> = {
  USDT: require("../../assets/tokens/USDT.png"),
  USDC: require("../../assets/tokens/USDC.png"),
};
const CHAIN_LOGOS: Record<number, any> = {
  56: require("../../assets/chains/bnb-icon.png"),
  8453: require("../../assets/chains/base-icon.png"),
};

/**
 * "Not enough DHB": the coins that can pay the same amount instead, inside the
 * generation paywall. Coins the wallet can't cover are dimmed.
 */
const CoinPayList: React.FC<{
  coins: TopUpCoin[];
  balances: Record<string, number | null>;
  picked: string | null;
  onPick: (key: string) => void;
  /** Dollars the coin has to cover. */
  usd: number;
  priceDhb: number;
  walletDhb: number;
  disabled?: boolean;
  /** Opens "Any other coin": BTC, SOL and 200+ more, paid to a one-time address. */
  onAnyCoin?: () => void;
}> = ({
  coins,
  balances,
  picked,
  onPick,
  usd,
  priceDhb,
  walletDhb,
  disabled,
  onAnyCoin,
}) => {
  const { t: _copy } = _useCopy();
  const enough = (c: TopUpCoin) => {
    const held = balances[coinKey(c)];
    return held == null || held >= Number(coinAmountFor(usd));
  };
  return (
    <View style={s.coinWrap}>
      <Text style={s.coinTitle}>
        {_copy("coinPay.title", { defaultValue: "Not enough DHB" })}
      </Text>
      <Text style={s.coinSub}>
        {_copy("coinPay.subtitle", {
          defaultValue:
            "This costs {{cost}} DHB and you hold {{held}}. Pay the same amount with another coin.",
          cost: Math.round(priceDhb).toLocaleString(),
          held: Math.round(walletDhb).toLocaleString(),
        })}
      </Text>
      {coins.length === 0 ? (
        <ActivityIndicator
          size="small"
          color="#A6A9AC"
          style={{ paddingVertical: 12 }}
        />
      ) : (
        coins.map((coin) => {
          const key = coinKey(coin);
          const ok = enough(coin);
          const held = balances[key];
          const isPicked = key === picked;
          return (
            <TouchableOpacity
              key={key}
              activeOpacity={0.8}
              disabled={!ok || disabled}
              onPress={() => onPick(key)}
              style={[
                s.coinRow,
                isPicked && s.coinRowPicked,
                !ok && { opacity: 0.4 },
              ]}
            >
              <View>
                <Image source={COIN_LOGOS[coin.symbol]} style={s.coinLogo} />
                <Image source={CHAIN_LOGOS[coin.chainId]} style={s.chainLogo} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.coinName}>
                  {coin.symbol}{" "}
                  <Text style={s.coinChain}>
                    {COIN_CHAIN_NAMES[coin.chainId]}
                  </Text>
                </Text>
                <Text style={s.coinHeld}>
                  {held == null
                    ? "…"
                    : ok
                      ? _copy("coinPay.holding", {
                          defaultValue: "Holding {{amount}} {{symbol}}",
                          amount: held.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          }),
                          symbol: coin.symbol,
                        })
                      : _copy("coinPay.notEnough", {
                          defaultValue: "Not enough",
                        })}
                </Text>
              </View>
              <Text style={s.coinAmount}>{coinAmountFor(usd)}</Text>
              {isPicked && (
                <View style={s.coinTick}>
                  <View style={s.coinTickShort} />
                  <View style={s.coinTickLong} />
                </View>
              )}
            </TouchableOpacity>
          );
        })
      )}
      {!!onAnyCoin && (
        <TouchableOpacity
          activeOpacity={0.8}
          disabled={disabled}
          onPress={onAnyCoin}
          style={[s.coinRow, s.anyRow]}
        >
          <View style={s.anyLogos}>
            <Image source={require("../../assets/tokens/BTC.png")} style={[s.anyLogo, { left: 0, top: 0 }]} />
            <Image source={require("../../assets/tokens/SOL.png")} style={[s.anyLogo, { right: 0, bottom: 0 }]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.coinName}>
              {_copy("coinPay.anyCoin", { defaultValue: "Any other coin" })}
            </Text>
            <Text style={s.coinHeld}>
              {_copy("coinPay.anyCoinHint", {
                defaultValue: "BTC, SOL, DOGE, XRP and 200+ more, from any wallet or exchange",
              })}
            </Text>
          </View>
          <Text style={s.anyChevron}>›</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  coinWrap: { paddingHorizontal: 16, marginTop: 4, gap: 6 },
  coinTitle: {
    color: "#F9FBFF",
    fontSize: 17,
    fontWeight: "800",
    paddingHorizontal: 4,
  },
  coinSub: {
    color: "#A6A9AC",
    fontSize: 13,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  coinRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  coinRowPicked: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: "rgba(255,255,255,0.2)",
  },
  coinLogo: { width: 30, height: 30, borderRadius: 15 },
  chainLogo: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  coinName: { color: "#F9FBFF", fontSize: 15, fontWeight: "800" },
  coinChain: { color: "#A6A9AC", fontSize: 12, fontWeight: "600" },
  coinHeld: { color: "#A6A9AC", fontSize: 12, marginTop: 1 },
  anyRow: {
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  anyLogos: { width: 30, height: 30 },
  anyLogo: { position: "absolute", width: 20, height: 20, borderRadius: 10 },
  anyChevron: { color: "#A6A9AC", fontSize: 22, fontWeight: "600" },
  coinAmount: { color: "#F9FBFF", fontSize: 14, fontWeight: "800" },
  coinTickShort: { position: "absolute", left: 5, top: 11, width: 6, height: 2.5, borderRadius: 1.5, backgroundColor: "#09090B", transform: [{ rotate: "45deg" }] },
  coinTickLong: { position: "absolute", left: 8, top: 9, width: 11, height: 2.5, borderRadius: 1.5, backgroundColor: "#09090B", transform: [{ rotate: "-50deg" }] },
  coinTick: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgb(255,255,255)",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default CoinPayList;
