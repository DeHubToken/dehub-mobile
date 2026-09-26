import { DhbCoin } from "../common/DhbCoin";
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { ethers } from "ethers";
import { useUser, useProvider, useAuthActions } from "../../context/AuthContext";
import { useFocusedInterval } from "../../hooks/useFocusedInterval";
import { getSigningProvider } from "../../libs/provider.registry";
import { supabase } from "../../services/supabase";
import { toastError, toastInfo, toastSuccess } from "../../libs/toast";
import { refreshStakingPosition } from "../../services/staking.service";
import { getAccount } from "../../services/user.service";
import { dhbStaked } from "../../libs/dhb-position";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { confirmStake, readStakeReceipt, type StakeAttempt } from "../../libs/stake-confirmation";
import { createLogger } from "../../libs/logger";
import { legacyWalletAddresses } from "../../libs/legacy-wallet-addresses";
const stakeLog = createLogger("Staking");
const pendingStakeKey = (wallet: string) => `dehub:pending-stake:${wallet.toLowerCase()}`;
const recordStakeEvent = (message: string, attempt: StakeAttempt, outcome?: string) => {
  void supabase.functions.invoke('client-logs', { body: {
    level: 'info', component: 'Staking', message, user_address: attempt.wallet,
    metadata: { ...attempt, outcome, client_time: new Date().toISOString() },
  } }).catch(() => {});
};
import { FIELD_TEXT } from "../../theme/inputs";
import { appLocale } from "../../libs/date.util";
import { sanitizeAmountInput } from "../../libs/amount-input";
import { useAppTheme } from "../../context/ThemeContext";
import { minimalFlat, minimalRow } from "../../theme/minimal";

const DHB_BASE = "0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c";
// Unified transfer-based staking target (same address on Base + BNB)
const STAKING_ADDRESS = "0xcF573a682Bf7A7Cc58000e9eCA9c9d04dA102Da7";
// Legacy BNB staking contract — still holds on-chain staked balances + rewards
const BNB_STAKING_CONTRACT = "0x26d2cd7763106fdce443fadd36163e2ad33a76e6";
const DHB_BNB = "0x680D3113caf77B61b510f332D5Ef4cf5b41A761D";
// Earlier transfer-based staking address on Base; still holds deposits.
const BASE_LEGACY_STAKING_ADDRESS = "0x7b10dd033Ac41B8AF85eE1701e344B86e446250B";
const BASE_RPC = "https://mainnet.base.org";
const BNB_RPC = "https://bsc-dataseed.binance.org";
const BASE_CHAIN_HEX = "0x2105"; // 8453
const BNB_CHAIN_HEX = "0x38"; // 56

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

// The legacy DeHubStaking (UUPS) contract has no balanceOf/earned — calling
// either reverts, and a catch-to-zero reads that revert as a real balance of
// nothing. Staked amount lives in userInfos().totalAmount, rewards in
// pendingHarvest(); same reads the web app and the leaderboard use.
const STAKING_ABI = [
  "function userInfos(address) view returns (uint256 totalAmount, uint256 unlockAt, uint256 lastTierIndex, uint256 lastRewardIndex, uint256 harvestTotal, uint256 harvestClaimed, uint256 lastStakeAt)",
  "function pendingHarvest(address account) view returns (uint256)",
  "function unstake(uint256 amount)",
  "function totalStaked() view returns (uint256)",
];

/**
 * DHB staked across the whole protocol — the same four pools the web app sums:
 * the unified address and the older transfer address on Base, the unified
 * address on BNB, and the legacy BNB contract (its `totalStaked()`, since the
 * token balance there also includes the reward pool). Reading only the Base
 * unified address undercounts by everything still sitting in the others.
 */
async function readProtocolTotal(
  baseProvider: ethers.providers.Provider,
  bnbProvider: ethers.providers.Provider,
): Promise<ethers.BigNumber | null> {
  const baseDhb = new ethers.Contract(DHB_BASE, ERC20_ABI, baseProvider);
  const bnbDhb = new ethers.Contract(DHB_BNB, ERC20_ABI, bnbProvider);
  const legacy = new ethers.Contract(BNB_STAKING_CONTRACT, STAKING_ABI, bnbProvider);
  try {
    const parts: ethers.BigNumber[] = await Promise.all([
      baseDhb.balanceOf(STAKING_ADDRESS),
      baseDhb.balanceOf(BASE_LEGACY_STAKING_ADDRESS),
      bnbDhb.balanceOf(STAKING_ADDRESS),
      legacy.totalStaked(),
    ]);
    return parts.reduce((a, b) => a.add(b), ethers.BigNumber.from(0));
  } catch (err) {
    console.warn("[StakingTab] protocol total read failed:", err);
    return null;
  }
}

/**
 * True for a `staking_records` row that is still a *request* rather than a
 * settled withdrawal.
 *
 * Queue rows carry a synthetic `unstake-request-<ts>` hash and wait on a
 * manual treasury payout. A withdrawal from the legacy BNB contract is
 * recorded with its real transaction hash and has already moved the tokens —
 * the on-chain position dropped with it, so counting one here would subtract
 * the same DHB twice and leave a phantom "unstaking" figure on the card.
 */
function isPendingQueueRow(txHash: string | null | undefined): boolean {
  return !(txHash ?? "").startsWith("0x");
}

function fmt(val: number): string {
  if (!Number.isFinite(val) || val === 0) return "0";
  if (val >= 1_000_000) return (val / 1_000_000).toFixed(2) + "M";
  if (val >= 1_000) return (val / 1_000).toFixed(2) + "K";
  return val.toLocaleString(appLocale(), { maximumFractionDigits: 2 });
}

const StakingTab: React.FC = () => {
  const { t } = useTranslation();
  // Minimal: the section cards dissolve into hairline-separated rows; the
  // mode toggle, amount field and buttons keep their fill.
  const { isMinimal } = useAppTheme();
  const mRow = isMinimal ? minimalRow : undefined;
  const mFlat = isMinimal ? minimalFlat : undefined;
  const user = useUser() as any;
  // Held in a ref so the fetch below can fall back to the session's own copy of
  // the account without re-running every time anything else on the user (an
  // unread count, a follow) changes.
  const userRef = useRef(user);
  userRef.current = user;
  const walletAddress: string | undefined =
    user?.walletAddress || user?.address;
  const { chainId: activeChainId, provider: authProvider } = useProvider();
  const { switchChain } = useAuthActions();

  const [pendingStake, setPendingStake] = useState<StakeAttempt | null>(null);
  const [pendingLoaded, setPendingLoaded] = useState(false);
  const checkingStake = useRef(false);
  const receiptDiagnostics = useRef(new Set<string>());
  const sendingStake = useRef(false);
  const [walletBal, setWalletBal] = useState<number | null>(null);
  const [protocolTotal, setProtocolTotal] = useState<number | null>(null);
  const [userStaked, setUserStaked] = useState<number>(0);
  /**
   * The slice of `userStaked` that sits in the legacy BNB contract.
   *
   * This is the only staked DHB anyone can actually withdraw themselves: it is
   * a real contract with an `unstake()`. The rest is in the transfer pool,
   * which is a plain wallet — there is no function to call and no amount of UI
   * makes one appear.
   */
  const [legacyStaked, setLegacyStaked] = useState<number>(0);
  /** When the legacy contract will let that position out (unix seconds, 0 = unknown). */
  const [legacyUnlockAt, setLegacyUnlockAt] = useState<number>(0);
  /** The user has been shown the 12% early-unstake fee and tapped again anyway. */
  const [earlyConfirmed, setEarlyConfirmed] = useState(false);
  const [unstakeQueued, setUnstakeQueued] = useState<number>(0);
  const [earned, setEarned] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"stake" | "unstake">("stake");
  const [amount, setAmount] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  /** A manual "did my transfer land yet?" check is in flight. */
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const baseProvider = new ethers.providers.JsonRpcProvider(BASE_RPC);
      const baseDhb = new ethers.Contract(DHB_BASE, ERC20_ABI, baseProvider);
      const bnbProvider = new ethers.providers.JsonRpcProvider(BNB_RPC);

      const addr = walletAddress?.toLowerCase();

      const legacyStaking = walletAddress
        ? new ethers.Contract(
            BNB_STAKING_CONTRACT,
            STAKING_ABI,
            bnbProvider,
          )
        : null;
      // A failed legacy read is logged, never folded into the total as a zero
      // — silently dropping it is what made the staking card and the holdings
      // leaderboard disagree.
      const legacyZero = (label: string) => (err: unknown) => {
        console.warn(`[StakingTab] legacy ${label} read failed:`, err);
        return ethers.BigNumber.from(0);
      };

      const legacyAddresses = walletAddress
        ? await legacyWalletAddresses(walletAddress)
        : [];
      const [userWalletBal, totalStakedBal, dbRecords, legacyInfos, legacyEarned, account] =
        await Promise.all([
          walletAddress
            ? baseDhb.balanceOf(walletAddress).catch(() => ethers.BigNumber.from(0))
            : Promise.resolve(ethers.BigNumber.from(0)),
          readProtocolTotal(baseProvider, bnbProvider),
          addr
            ? supabase
                .from("staking_records")
                .select("amount, action, tx_hash")
                .eq("wallet_address", addr)
            : Promise.resolve({ data: [] as any[] }),
          // Legacy on-chain position on BNB. Both fields matter: the amount is
          // what can be withdrawn, and `unlockAt` is what decides whether
          // `unstake()` would revert if we let them press it.
          legacyStaking
            ? Promise.all(legacyAddresses.map((address) =>
                legacyStaking.userInfos(address)
                  .then((info: any) => ({
                    amount: info.totalAmount as ethers.BigNumber,
                    unlockAt: Number(info.unlockAt ?? 0),
                  }))
                  .catch((err: unknown) => {
                    legacyZero("userInfos")(err);
                    return { amount: ethers.BigNumber.from(0), unlockAt: 0 };
                  }),
              ))
            : Promise.resolve([]),
          legacyStaking
            ? legacyStaking
                .pendingHarvest(walletAddress)
                .catch(legacyZero("pendingHarvest"))
            : Promise.resolve(ethers.BigNumber.from(0)),
          // The staked figure itself. Read fresh rather than off the session
          // user, which is only re-enriched on a throttle — someone who has
          // just deposited would otherwise see the old number.
          walletAddress
            ? getAccount(walletAddress)
                .then((res: any) => res?.data?.result || res?.result || null)
                .catch((err: unknown) => {
                  console.warn("[StakingTab] account_info read failed:", err);
                  return null;
                })
            : Promise.resolve(null),
        ]);

      setWalletBal(parseFloat(ethers.utils.formatUnits(userWalletBal, 18)));
      // A failed read keeps the last good figure rather than flashing a low one.
      if (totalStakedBal) {
        setProtocolTotal(parseFloat(ethers.utils.formatUnits(totalStakedBal, 18)));
      }

      // The withdrawal queue, and a last-resort staked figure. `staking_records`
      // only ever held the deposits made through the apps, so it is a record of
      // requests, not of the position — see the API read below.
      let dbStaked = 0;
      let queued = 0;
      const records = (dbRecords as any)?.data || [];
      for (const r of records) {
        if (r.action === "stake") dbStaked += Number(r.amount);
        else if (r.action === "unstake" && isPendingQueueRow(r.tx_hash)) {
          dbStaked -= Number(r.amount);
          queued += Number(r.amount);
        }
      }
      if (dbStaked < 0) dbStaked = 0;

      // Old positions can be keyed by either the owner EOA or DeHub's
      // deterministic Safe. Keep the non-zero position instead of assuming
      // the address form stored on the current profile is the one that staked.
      const legacyInfo = legacyInfos.reduce(
        (best, info) => info.amount.gt(best.amount) ? info : best,
        { amount: ethers.BigNumber.from(0), unlockAt: 0 },
      );
      const legacyStakedNum = parseFloat(
        ethers.utils.formatUnits(legacyInfo.amount, 18),
      );
      setLegacyStaked(legacyStakedNum);
      setLegacyUnlockAt(legacyInfo.unlockAt);

      // What is actually staked, as the API counts it: pool deposits on both
      // chains plus the legacy contract. The API derives that from the DHB
      // transfer log, which is the only complete record — a deposit sent
      // straight to the staking address never reaches `staking_records`, and
      // this card used to read 0 for anyone who made one while the Assets row
      // directly above it, which does read the API, showed the whole position.
      //
      // The legacy contract is a live read and the API includes it, so the
      // larger of the two is still the API's own number; it only matters if a
      // chain row is missing from the account.
      const serverStaked = dhbStaked(account) ?? dhbStaked(userRef.current);
      const stakedTotal =
        serverStaked === null
          ? dbStaked + legacyStakedNum
          : Math.max(serverStaked, legacyStakedNum);
      setUserStaked(stakedTotal);
      setUnstakeQueued(queued);
      setEarned(parseFloat(ethers.utils.formatUnits(legacyEarned, 18)));
      // Returned as well as stored, so the refresh button can say what changed
      // without reading state it captured before the fetch.
      return stakedTotal;
    } catch (err) {
      console.warn("[StakingTab] fetchData error:", err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  /**
   * Ask the backend to credit a transfer that has just landed, then re-read.
   *
   * Reports what changed rather than just spinning: "nothing new" is a useful
   * answer when someone is checking whether their transfer arrived, and a
   * silent refresh looks identical to a broken one.
   */
  const handleRefreshPosition = useCallback(async () => {
    if (!walletAddress || isRefreshing) return;
    setIsRefreshing(true);
    const before = userStaked;
    try {
      await refreshStakingPosition(walletAddress);
      const after = await fetchData();
      if (after === null) {
        toastError(t("staking.refreshFailed"));
      } else if (after > before + 0.000001) {
        toastSuccess(t("staking.foundNewStake", { amount: fmt(after - before) }));
      } else {
        toastInfo(t("staking.noNewTransfers"));
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [walletAddress, isRefreshing, userStaked, fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // A fee someone accepted for one amount is not a fee they accepted for
  // another, so any edit puts the confirmation back.
  useEffect(() => {
    setEarlyConfirmed(false);
  }, [amount, mode]);

  const checkPendingStake = async (attempt: StakeAttempt) => {
    if (checkingStake.current) return;
    checkingStake.current = true;
    try {
      const outcome = await confirmStake(attempt, [BASE_RPC, 'https://base-rpc.publicnode.com'].map(url => () => readStakeReceipt(url, attempt.hash)), error => {
        const diagnostic = `${attempt.hash}:${String(error)}`;
        if (receiptDiagnostics.current.has(diagnostic)) return;
        receiptDiagnostics.current.add(diagnostic);
        stakeLog.error('Receipt lookup unavailable', { hash: attempt.hash, chainId: attempt.chainId }, String(error));
      });
      if (outcome === 'pending') return;
      if (outcome === 'confirmed') {
        if (!attempt.confirmed) {
          attempt = { ...attempt, confirmed: true };
          setPendingStake(previous => previous?.hash === attempt.hash ? attempt : previous);
          try { await AsyncStorage.setItem(pendingStakeKey(attempt.wallet), JSON.stringify(attempt)); } catch {}
          toastSuccess(t("staking.stakeConfirmedOnBase", { amount: attempt.amount }));
        }
        try {
          const { error } = await supabase.functions.invoke('sync-staking-deposits', { body: { wallet: attempt.wallet } });
          if (error) throw error;
          const record = await supabase.from('staking_records').select('tx_hash').eq('tx_hash', attempt.hash).maybeSingle();
          if (record.error || !record.data) return;
        } catch (error) { stakeLog.error('Confirmed stake record pending sync', { hash: attempt.hash }, String(error)); return; }
        // Awaited: the card now reads its staked figure from the API, so
        // re-reading before the backend has credited the transfer would just
        // show the old number again.
        await refreshStakingPosition(attempt.wallet);
        void fetchData();
      } else {
        toastError(t("staking.stakeReverted"));
      }
      recordStakeEvent('Stake outcome verified', attempt, outcome);
      try { await AsyncStorage.removeItem(pendingStakeKey(attempt.wallet)); } catch {}
      setPendingStake(previous => previous?.hash === attempt.hash ? null : previous);
    } finally { checkingStake.current = false; }
  };

  useEffect(() => {
    let cancelled = false;
    setPendingLoaded(false);
    setPendingStake(null);
    if (!walletAddress) { setPendingLoaded(true); return; }
    AsyncStorage.getItem(pendingStakeKey(walletAddress)).then(raw => {
      if (cancelled) return;
      const saved = JSON.parse(raw || 'null');
      if (saved?.wallet?.toLowerCase() === walletAddress.toLowerCase() && /^0x[0-9a-f]{64}$/i.test(saved.hash)) setPendingStake(saved);
    }).catch(() => {}).finally(() => { if (!cancelled) setPendingLoaded(true); });
    return () => { cancelled = true; };
  }, [walletAddress]);

  const pendingStakeIsOurs =
    !!pendingStake && pendingStake.wallet.toLowerCase() === walletAddress?.toLowerCase();
  useEffect(() => {
    if (!pendingStakeIsOurs || !pendingStake) return;
    void checkPendingStake(pendingStake);
  }, [pendingStake, pendingStakeIsOurs]);
  // An on-chain read every 15s, but only while the wallet is the screen being
  // looked at — not for as long as it sits in the stack under Home.
  useFocusedInterval(
    () => { if (pendingStake) void checkPendingStake(pendingStake); },
    pendingStakeIsOurs ? 15_000 : null,
    { catchUp: true },
  );

  const handleStake = async () => {
    if (sendingStake.current || pendingStake || !pendingLoaded) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toastError(t("staking.enterValidStakeAmount"));
      return;
    }
    if (!walletAddress) {
      toastError(t("staking.walletNotConnected"));
      return;
    }
    if (walletBal != null && amt > walletBal) {
      toastError(t("staking.insufficientOnBase"));
      return;
    }

    setIsBusy(true);
    sendingStake.current = true;
    try {
      const targetChainId = parseInt(BASE_CHAIN_HEX, 16);
      let sendProvider = authProvider;
      if (activeChainId !== targetChainId) {
        try {
          await switchChain(targetChainId);
        } catch {
          toastError(t("staking.switchBaseFailed"));
          return;
        }
        sendProvider = getSigningProvider() || authProvider;
      }
      if (!sendProvider?.request) {
        toastError(t("staking.walletNotReady"));
        return;
      }

      const iface = new ethers.utils.Interface(ERC20_ABI);
      const amountWei = ethers.utils.parseUnits(amount, 18);
      const data = iface.encodeFunctionData("transfer", [STAKING_ADDRESS, amountWei]);

      const txHash = await sendProvider.request({
        method: "eth_sendTransaction",
        params: [{ from: walletAddress, to: DHB_BASE, data }],
      });

      const attempt: StakeAttempt = {
        hash: txHash, wallet: walletAddress, chainId: targetChainId, token: DHB_BASE,
        pool: STAKING_ADDRESS, amount, amountHex: amountWei.toHexString(),
      };
      setPendingStake(attempt);
      setAmount('');
      try { await AsyncStorage.setItem(pendingStakeKey(walletAddress), JSON.stringify(attempt)); }
      catch (error) { stakeLog.error('Pending stake storage unavailable', { hash: txHash }, String(error)); }
      recordStakeEvent('Stake submitted; awaiting receipt', attempt);
      toastInfo(t("staking.stakeSubmitted"));
    } catch (err: any) {
      stakeLog.error('Stake request unresolved', { wallet: walletAddress }, err);
      const msg = String(err?.message || err).toLowerCase();
      if (err?.code === 4001 || msg.includes('user rejected') || msg.includes('user denied')) {
        toastInfo(t("staking.txCancelledInWallet"));
      } else {
        toastInfo(t("staking.stakeUnconfirmed"));
      }
    } finally {
      sendingStake.current = false;
      setIsBusy(false);
    }
  };

  const handleUnstake = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toastError(t("staking.enterValidUnstakeAmount"));
      return;
    }
    if (!walletAddress) {
      toastError(t("staking.walletNotConnected"));
      return;
    }
    if (amt > userStaked) {
      toastError(t("staking.onlyThisMuchStaked", { amount: fmt(userStaked) }));
      return;
    }
    // Only the legacy BNB position is withdrawable. The rest sits in the
    // transfer pool, which is a wallet rather than a contract — there is
    // nothing to call. This used to write a `staking_records` row and promise
    // a 12-day cooldown; no payout process was ever built behind it, so those
    // rows just accumulated. Better to say so than to bank another one.
    if (amt > legacyStaked) {
      toastError(
        legacyStaked > 0
          ? t("staking.onlyLegacyWithdrawable", { amount: fmt(legacyStaked) })
          : t("staking.poolHasNoWithdrawal"),
      );
      return;
    }
    // Early unstake is allowed and costs 12% — the contract returns 88% before
    // the unlock date. Blocking it would deny something the contract supports,
    // but letting it through on one tap would take the fee out of someone who
    // never saw it mentioned. So: say the number, then let the next tap go.
    const nowSeconds = Math.floor(Date.now() / 1000);
    const isLocked = legacyUnlockAt > nowSeconds;
    if (isLocked && !earlyConfirmed) {
      setEarlyConfirmed(true);
      toastError(
        t("staking.lockedEarlyFee", {
          date: new Date(legacyUnlockAt * 1000).toLocaleDateString(appLocale()),
          fee: fmt(amt * 0.12),
        }),
      );
      return;
    }

    setIsBusy(true);
    try {
      const targetChainId = parseInt(BNB_CHAIN_HEX, 16);
      let sendProvider = authProvider;
      if (activeChainId !== targetChainId) {
        try {
          await switchChain(targetChainId);
        } catch {
          toastError(t("staking.switchBnbFailed"));
          return;
        }
        sendProvider = getSigningProvider() || authProvider;
      }
      if (!sendProvider?.request) {
        toastError(t("staking.walletNotReady"));
        return;
      }

      const iface = new ethers.utils.Interface(STAKING_ABI);
      const data = iface.encodeFunctionData("unstake", [
        ethers.utils.parseUnits(amount, 18),
      ]);

      const txHash = await sendProvider.request({
        method: "eth_sendTransaction",
        params: [{ from: walletAddress, to: BNB_STAKING_CONTRACT, data }],
      });

      try {
        const provider = new ethers.providers.JsonRpcProvider(BNB_RPC);
        const receipt = await provider.waitForTransaction(txHash, 1, 90_000);
        if (receipt && receipt.status === 0) {
          toastError(t("staking.unstakeReverted"));
          return;
        }
      } catch {
        // Confirmation timed out — the transaction is still in flight, and the
        // next fetchData will show the real position either way.
      }

      // Recorded so the withdrawal shows in history on web too. The real hash
      // is what marks it settled — see isPendingQueueRow above.
      try {
        await supabase.from("staking_records").insert({
          wallet_address: walletAddress.toLowerCase(),
          amount: amt,
          chain: "BNB",
          action: "unstake",
          tx_hash: txHash,
        });
      } catch (dbErr) {
        console.warn("[StakingTab] failed to record withdrawal:", dbErr);
      }

      toastSuccess(t("staking.unstakeSent", { amount, hash: txHash.slice(0, 10) }));
      setAmount("");
      setMode("stake");
      setTimeout(fetchData, 4000);
    } catch (err: any) {
      // The wallet's own message is passed through untranslated — it is the
      // only description of what actually went wrong, and translating it would
      // mean guessing at a string we did not write.
      const msg = String(err?.message || err || "");
      if (msg.includes("user rejected") || msg.includes("cancelled")) {
        toastError(t("staking.txCancelled"));
      } else {
        toastError(msg ? msg.slice(0, 100) : t("staking.unstakeFailed"));
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopyStakingAddress = async () => {
    await Clipboard.setStringAsync(STAKING_ADDRESS);
    toastSuccess(t("staking.addressCopied"));
  };

  // MAX on the unstake side is the legacy position, not the whole stake —
  // filling it with pool DHB would just walk the user into a rejection.
  const max = mode === "stake" ? walletBal ?? 0 : legacyStaked;
  const submit = mode === "stake" ? handleStake : handleUnstake;

  return (
    <View className="flex-1">
      {pendingStake && pendingStake.wallet.toLowerCase() === walletAddress?.toLowerCase() && (
        <View accessibilityRole="summary" className="mb-4 rounded-xl border border-white/20 p-3" style={mRow}>
          <Text className="text-white">{pendingStake.confirmed
            ? t("staking.pendingConfirmed", { amount: pendingStake.amount })
            : t("staking.pendingSubmitted", { amount: pendingStake.amount })}</Text>
          <TouchableOpacity onPress={() => { void Linking.openURL(`https://basescan.org/tx/${pendingStake.hash}`); }}>
            <Text className="text-white underline mt-2">{t("staking.viewTransaction")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { void checkPendingStake(pendingStake); }}>
            <Text className="text-white underline mt-2">{t("staking.checkAgain")}</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Stats row */}
      <View className="flex-row gap-3 mb-5" style={mRow}>
        <View className="flex-1 bg-white/5 border border-white/10 rounded-xl p-4" style={mFlat}>
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-white/50 text-xs uppercase tracking-wider">
              {t("staking.yourStaked")}
            </Text>
            {/* Staking is a bare transfer, so a stake made outside the app —
                or seconds ago — is invisible until the backend's scanner comes
                round. This asks it to look now. */}
            <TouchableOpacity
              onPress={handleRefreshPosition}
              disabled={isRefreshing}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={t("staking.checkForNewStake")}
            >
              {isRefreshing ? (
                <ActivityIndicator size="small" color="#ffffff99" />
              ) : (
                <Ionicons name="refresh" size={14} color="#ffffff99" />
              )}
            </TouchableOpacity>
          </View>
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-white text-lg font-bold">{fmt(userStaked)}</Text>
          )}
          <Text className="text-white/60 text-xs mt-0.5">
            {t("staking.tokensUnit")}{unstakeQueued > 0
              ? ` · ${t("staking.amountUnstaking", { amount: fmt(unstakeQueued) })}`
              : ""}
          </Text>
        </View>
        <View className="flex-1 bg-white/5 border border-white/10 rounded-xl p-4" style={mFlat}>
          <Text className="text-white/50 text-xs uppercase tracking-wider mb-1">
            {t("staking.walletBalance")}
          </Text>
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-white text-lg font-bold">{fmt(walletBal ?? 0)}</Text>
          )}
          <Text className="text-white/60 text-xs mt-0.5">{t("staking.dhbOnBase")}</Text>
        </View>
      </View>

      {/* Pending rewards (BNB legacy contract) */}
      {earned > 0 && (
        <View className="flex-row items-center justify-between bg-white/10 border border-white/20 rounded-xl p-4 mb-4" style={mRow}>
          <View>
            <Text className="text-white/80 font-semibold text-sm">{t("staking.pendingRewards")}</Text>
            <Text className="text-white text-lg font-bold mt-0.5">{fmt(earned)} <DhbCoin size={16} /></Text>
          </View>
          <View className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">
            <Text className="text-white/50 text-[11px]">{t("staking.claimOnWeb")}</Text>
          </View>
        </View>
      )}

      {/* Stake / Unstake card */}
      <View className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4" style={mRow}>
        {/* Mode toggle */}
        <View className="flex-row bg-white/[0.04] rounded-xl p-1 mb-4">
          {(["stake", "unstake"] as const).map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => {
                setMode(m);
                setAmount("");
              }}
              className={`flex-1 py-2 rounded-lg items-center ${
                mode === m ? "bg-white/15" : ""
              }`}
            >
              <Text
                className={`text-sm font-semibold capitalize ${
                  mode === m ? "text-white" : "text-white/40"
                }`}
              >
                {m === "stake" ? t("staking.stake") : t("staking.unstake")}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text className="text-white/60 text-xs mb-4">
          {mode === "stake"
            ? t("staking.stakeOnBaseDesc")
            : t("staking.unstakeFromBnbDesc")}
        </Text>

        <View className="flex-row items-center bg-white/[0.06] border border-white/10 rounded-xl px-3 mb-3 h-12">
          <TextInput
            className="flex-1 text-white text-sm"
            placeholder={t("staking.amount")}
            placeholderTextColor="rgba(255,255,255,0.5)"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={(v) => setAmount(sanitizeAmountInput(v))}
            style={FIELD_TEXT}
          />
          <TouchableOpacity
            onPress={() => setAmount(String(max))}
            className="px-2 py-3 -mr-1"
            hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
          >
            <Text className="text-white/50 text-xs font-bold uppercase">{t("staking.max")}</Text>
          </TouchableOpacity>
        </View>

        <Text className="text-white/60 text-xs mb-3">
          {mode === "stake"
            ? t("staking.availableToStake", { amount: fmt(walletBal ?? 0) })
            : `${t("staking.withdrawableOnBnb", { amount: fmt(legacyStaked) })}${
                userStaked - legacyStaked > 0
                  ? ` · ${t("staking.restInBasePool", {
                      amount: fmt(userStaked - legacyStaked),
                    })}`
                  : ""
              }${
                legacyStaked > 0 && legacyUnlockAt > Math.floor(Date.now() / 1000)
                  ? ` · ${t("staking.lockedUntilWithFee", {
                      date: new Date(legacyUnlockAt * 1000).toLocaleDateString(appLocale()),
                    })}`
                  : ""
              }`}
        </Text>

        <TouchableOpacity
          onPress={submit}
          disabled={isBusy || !amount || (mode === "stake" && (!!pendingStake || !pendingLoaded))}
          className={`h-12 rounded-xl items-center justify-center flex-row gap-2 ${
            isBusy || !amount ? "bg-white/10" : "bg-white/15 border border-white/20"
          }`}
        >
          {isBusy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons
              name={mode === "stake" ? "lock-closed-outline" : "lock-open-outline"}
              size={16}
              color="white"
            />
          )}
          <Text className="text-white font-semibold text-sm">
            {isBusy
              ? mode === "stake"
                ? t("staking.staking")
                : t("staking.unstaking")
              : mode === "stake"
              ? t("staking.stakeDhb")
              : t("staking.unstake")}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Protocol stats */}
      <View className="flex-row items-center justify-between bg-white/[0.03] border border-white/10 rounded-xl p-4 mb-4" style={mRow}>
        <Text className="text-white/50 text-xs">{t("staking.totalStakedProtocol")}</Text>
        <Text className="text-white font-semibold text-sm">
          {loading ? "…" : t("staking.tokenAmount", { amount: fmt(protocolTotal ?? 0) })}
        </Text>
      </View>

      {/* Manual staking address */}
      <View className="bg-white/[0.03] border border-white/10 rounded-xl p-4" style={mFlat}>
        <Text className="text-white/50 text-xs mb-2">
          {t("staking.orSendDirectly")}
        </Text>
        <TouchableOpacity
          onPress={handleCopyStakingAddress}
          className="flex-row items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2"
        >
          <Text className="flex-1 text-white/60 text-[11px] font-mono">
            {STAKING_ADDRESS.slice(0, 10)}…{STAKING_ADDRESS.slice(-6)}
          </Text>
          <Ionicons name="copy-outline" size={14} color="rgba(255,255,255,0.4)" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={fetchData}
        className="mt-4 items-center flex-row justify-center gap-2"
      >
        <Ionicons name="refresh-outline" size={14} color="rgba(255,255,255,0.6)" />
        <Text className="text-white/60 text-xs">{t("staking.refreshBalances")}</Text>
      </TouchableOpacity>
    </View>
  );
};

export default StakingTab;
