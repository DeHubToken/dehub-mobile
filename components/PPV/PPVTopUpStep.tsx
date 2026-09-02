/**
 * PPV Top-Up Step
 * ===============
 * What the PPV sheet shows instead of a greyed-out Pay button when the wallet
 * is short of DHB.
 *
 * The old behaviour was "Insufficient DHB balance" in red with the button
 * disabled — a dead end, shown to someone who had already decided to buy. This
 * keeps them where they are: it works out the cheapest way to buy the missing
 * DHB out of what they already hold on Base, does it in one tap, and hands
 * straight back to the unlock.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ethers } from "ethers";
import Icon from "../ui/Icon";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useERC20Contract } from "../../hooks/use-web3";
import { supportedTokens } from "../../config/constants";
import { parseTxError } from "../../libs/web3.util";
import { formatCompactNumber } from "../../libs";
import {
  applySlippage,
  buyDhbViaRoute,
  getERC20BalanceBase,
  getNativeBalanceBase,
  quoteDhbPurchase,
  waitForBalance,
  DHB_BASE,
  type DhbBuyRoute,
} from "../../services/swap.service";

const BASE_CHAIN_ID = 8453;

/**
 * Which wallet token to spend first. Gas token ahead of stables so a
 * stablecoin balance is left alone when there is ETH to spend, and the
 * cheapest route — DHB's one direct pool — is tried before any hop.
 */
const SPEND_ORDER = ["ETH", "WETH", "USDC", "USDT"];

/** An unlock that cannot be sent yet because the wallet is short of DHB. */
export interface PPVShortfall {
  /** The token the post is priced in — usually DHB. */
  symbol: string;
  /** How much of it the wallet still needs, rounded up. */
  needDhb: number;
  /** DHB held right now. */
  balanceDhb: number;
  /** The full unlock price. */
  priceDhb: number;
  /**
   * Whether DHB can be bought from inside the sheet. Uniswap liquidity for DHB
   * is Base-only, so elsewhere the viewer has to bring DHB with them and the
   * step offers funding routes instead of a swap.
   */
  canTopUpInApp: boolean;
}

interface Candidate {
  symbol: string;
  address: string;
  decimals: number;
  balance: ethers.BigNumber;
}

interface Pick {
  token: Candidate;
  route: DhbBuyRoute;
  /** Slippage-padded ceiling; the router only pulls what the trade costs. */
  maxIn: ethers.BigNumber;
}

type Phase = "scanning" | "ready" | "buying" | "nofunds" | "error";

function formatToken(wei: ethers.BigNumber, decimals: number): string {
  const value = Number(ethers.utils.formatUnits(wei, decimals));
  if (!Number.isFinite(value) || value === 0) return "0";
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return value.toFixed(value >= 1 ? 4 : 6).replace(/0+$/, "").replace(/\.$/, "");
}

export interface PPVTopUpStepProps {
  shortfall: PPVShortfall;
  account?: string;
  swapRouterContract: any;
  /** DHB has landed — the parent sends the unlock straight away. */
  onFunded: () => void;
  /** Back to the price view, sheet still open. */
  onCancel: () => void;
  /** Dismiss the sheet entirely, for the routes that navigate away. */
  onClose: () => void;
}

const PPVTopUpStep: React.FC<PPVTopUpStepProps> = ({
  shortfall,
  account,
  swapRouterContract,
  onFunded,
  onCancel,
  onClose,
}) => {
  const navigation = useNavigation<any>();
  const [phase, setPhase] = useState<Phase>("scanning");
  const [pick, setPick] = useState<Pick | null>(null);
  const [error, setError] = useState("");
  const needWeiRef = useRef(ethers.utils.parseUnits(String(shortfall.needDhb), 18));

  // An ERC20 route has to approve the router first, and that needs an
  // AA-aware contract for whichever token the scan settled on.
  const payTokenContract = useERC20Contract(
    pick && pick.route.kind === "path" ? pick.token.address : undefined,
  );

  useEffect(() => {
    needWeiRef.current = ethers.utils.parseUnits(String(shortfall.needDhb), 18);
    let cancelled = false;

    (async () => {
      setPhase("scanning");
      setError("");

      // Off Base there is no DHB pool to buy from, so there is nothing to
      // quote — the step goes straight to the funding routes.
      if (!shortfall.canTopUpInApp || !account) {
        if (!cancelled) setPhase("nofunds");
        return;
      }

      try {
        const erc20s = supportedTokens.filter(
          (t: any) => t.chainId === BASE_CHAIN_ID && t.symbol !== "DHB",
        );
        const balances: Candidate[] = await Promise.all([
          getNativeBalanceBase(account)
            .then((balance) => ({ symbol: "ETH", address: "0x0", decimals: 18, balance }))
            .catch(() => ({
              symbol: "ETH",
              address: "0x0",
              decimals: 18,
              balance: ethers.BigNumber.from(0),
            })),
          ...erc20s.map(async (token: any) => ({
            symbol: token.symbol,
            address: token.address,
            decimals: token.decimals ?? 18,
            balance: await getERC20BalanceBase(token.address, account),
          })),
        ]);
        if (cancelled) return;

        const funded = balances
          .filter((t) => t.balance.gt(0))
          .sort((a, b) => {
            const ai = SPEND_ORDER.indexOf(a.symbol);
            const bi = SPEND_ORDER.indexOf(b.symbol);
            return (ai < 0 ? SPEND_ORDER.length : ai) - (bi < 0 ? SPEND_ORDER.length : bi);
          });

        // First token that both has a route and covers the padded quote wins.
        // Quoting the whole wallet up front would be seconds of RPC to answer a
        // question one token usually settles.
        for (const token of funded) {
          const route = await quoteDhbPurchase(needWeiRef.current, token.address);
          if (cancelled) return;
          if (!route) continue;
          // A hop crosses two pools, one of them DHB's thin 1% pool, so it gets
          // more headroom than a direct swap.
          const maxIn = applySlippage(route.amountIn, route.kind === "path" ? 400 : 200);
          if (token.balance.lt(maxIn)) continue;
          setPick({ token, route, maxIn });
          setPhase("ready");
          return;
        }

        setPhase("nofunds");
      } catch (e) {
        console.warn("[PPV] Top-up scan failed:", e);
        if (!cancelled) {
          setError("Could not check your wallet just now.");
          setPhase("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shortfall, account]);

  const handleTopUp = useCallback(async () => {
    if (!pick || !account || !swapRouterContract) return;
    if (pick.route.kind === "path" && !payTokenContract) {
      setError("Preparing your wallet — try again in a moment.");
      setPhase("error");
      return;
    }

    setPhase("buying");
    setError("");
    try {
      // Measured, not derived from the displayed price: turning a float back
      // into wei can set a target the balance never quite reaches. Any
      // increase at all means the swap has been seen.
      const before = await getERC20BalanceBase(DHB_BASE, account);

      await buyDhbViaRoute({
        routerContract: swapRouterContract,
        tokenContract: payTokenContract,
        route: pick.route,
        amountOutDhb: needWeiRef.current,
        maxAmountIn: pick.maxIn,
        recipient: account,
      });

      // Let the balance actually show up before handing back. The swap is
      // mined, but the next read goes to whichever public RPC node answers,
      // and one a block behind would make the unlock believe nothing arrived
      // and buy the shortfall a second time.
      //
      // waitForBalance does not throw when it runs out of attempts — it just
      // returns the last thing it read — so its result has to be checked.
      // Discarding it is what let a lagging node hand straight back to the
      // unlock, which found the wallet still short and redrew this same step,
      // one tap away from signing a second swap for the same shortfall.
      //
      // getERC20BalanceBase also answers 0 for an unreadable balance rather
      // than failing, so `after` can be 0 here while the swap was fine. That
      // is the conservative direction: stop and let the viewer look, rather
      // than resume on a number nothing confirmed.
      const target = before.add(1);
      const after = await waitForBalance(
        () => getERC20BalanceBase(DHB_BASE, account),
        target,
      );
      if (!after.gte(target)) {
        setError(
          "Your swap may still be settling. Check your DHB balance before trying again — do not swap twice.",
        );
        setPhase("error");
        return;
      }

      // Straight back into the unlock — the sheet never closes and the viewer
      // never taps twice.
      onFunded();
    } catch (e) {
      setError(parseTxError(e, "swap") || "Top-up failed.");
      setPhase("error");
    }
  }, [pick, account, swapRouterContract, payTokenContract, onFunded]);

  const goToBuy = () => {
    onClose();
    navigation.navigate(ScreenNames.Dpay);
  };

  return (
    <View>
      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Unlock price</Text>
          <Text style={styles.summaryValue}>
            {formatCompactNumber(shortfall.priceDhb)} {shortfall.symbol}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Your balance</Text>
          <Text style={styles.summaryValue}>
            {formatCompactNumber(shortfall.balanceDhb)} {shortfall.symbol}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryRow}>
          <Text style={styles.needLabel}>You need</Text>
          <Text style={styles.needValue}>
            {formatCompactNumber(shortfall.needDhb)} {shortfall.symbol}
          </Text>
        </View>
      </View>

      {phase === "scanning" && (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color="#A6A9AC" />
          <Text style={styles.statusText}>Finding the quickest way to top you up…</Text>
        </View>
      )}

      {(phase === "ready" || phase === "buying") && pick && (
        <>
          <Text style={styles.hintText}>
            Pays about {formatToken(pick.route.amountIn, pick.token.decimals)}{" "}
            {pick.token.symbol} from your wallet, then unlocks straight away.
          </Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              onPress={phase === "buying" ? undefined : onCancel}
              disabled={phase === "buying"}
              style={[styles.closeBtn, phase === "buying" && { opacity: 0.5 }]}
              activeOpacity={0.7}
            >
              <Text style={styles.closeBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleTopUp}
              disabled={phase === "buying"}
              style={[styles.payBtn, phase === "buying" && { opacity: 0.5 }]}
              activeOpacity={0.7}
            >
              {phase === "buying" ? (
                <ActivityIndicator size="small" color="#010305" />
              ) : (
                <Text style={styles.payBtnText}>Top up &amp; unlock</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}

      {(phase === "nofunds" || phase === "error") && (
        <>
          {phase === "error" ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : (
            <Text style={styles.hintText}>
              {shortfall.canTopUpInApp
                ? "There isn't enough in your wallet on Base to cover it. Add funds and the unlock is waiting for you."
                : "This post settles on another chain, so it needs DHB in your wallet there."}
            </Text>
          )}

          <TouchableOpacity style={styles.routeBtn} onPress={goToBuy} activeOpacity={0.7}>
            <Icon name="CreditCard" size={18} color="#F9FBFF" />
            <View style={styles.routeTextWrap}>
              <Text style={styles.routeTitle}>Buy {shortfall.symbol}</Text>
              <Text style={styles.routeSub}>Top up your wallet, then come back</Text>
            </View>
            <Icon name="ChevronRight" size={16} color="#6F7174" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.closeBtnWide}
            onPress={onCancel}
            activeOpacity={0.7}
          >
            <Text style={styles.closeBtnText}>Not now</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  summary: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    gap: 8,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryLabel: {
    color: "#A6A9AC",
    fontSize: 13,
  },
  summaryValue: {
    color: "#D4D6D8",
    fontSize: 13,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  needLabel: {
    color: "#F9FBFF",
    fontSize: 14,
    fontWeight: "500",
  },
  needValue: {
    color: "#F9FBFF",
    fontSize: 17,
    fontWeight: "700",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  statusText: {
    color: "#A6A9AC",
    fontSize: 13,
    flex: 1,
  },
  hintText: {
    color: "#A6A9AC",
    fontSize: 12,
    marginBottom: 10,
  },
  errorText: {
    color: "#F4F4F5",
    fontSize: 12,
    marginBottom: 10,
  },
  routeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  routeTextWrap: {
    flex: 1,
  },
  routeTitle: {
    color: "#F9FBFF",
    fontSize: 14,
    fontWeight: "600",
  },
  routeSub: {
    color: "#6F7174",
    fontSize: 11,
    marginTop: 2,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  closeBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnWide: {
    height: 46,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    color: "#F9FBFF",
    fontSize: 14,
    fontWeight: "600",
  },
  payBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#F4F4F5",
    alignItems: "center",
    justifyContent: "center",
  },
  payBtnText: {
    color: "#010305",
    fontSize: 14,
    fontWeight: "600",
  },
});

export default PPVTopUpStep;
