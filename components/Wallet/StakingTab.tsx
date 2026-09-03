import { DhbCoin } from "../common/DhbCoin";
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { ethers } from "ethers";
import { useUser, useProvider, useAuthActions } from "../../context/AuthContext";
import { getSigningProvider } from "../../libs/provider.registry";
import { supabase } from "../../services/supabase";
import { toastError, toastSuccess } from "../../libs/toast";

const DHB_BASE = "0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c";
// Unified transfer-based staking target (same address on Base + BNB)
const STAKING_ADDRESS = "0xcF573a682Bf7A7Cc58000e9eCA9c9d04dA102Da7";
// Legacy BNB staking contract — still holds on-chain staked balances + rewards
const BNB_STAKING_CONTRACT = "0x26d2cd7763106fdce443fadd36163e2ad33a76e6";
const DHB_BNB = "0x680D3113caf77B61b510f332D5Ef4cf5b41A761D";
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
];

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
  return val.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

const StakingTab: React.FC = () => {
  const user = useUser() as any;
  const walletAddress: string | undefined =
    user?.walletAddress || user?.address;
  const { chainId: activeChainId, provider: authProvider } = useProvider();
  const { switchChain } = useAuthActions();

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

  const fetchData = useCallback(async () => {
    try {
      const baseProvider = new ethers.providers.JsonRpcProvider(BASE_RPC);
      const baseDhb = new ethers.Contract(DHB_BASE, ERC20_ABI, baseProvider);

      const addr = walletAddress?.toLowerCase();

      const legacyStaking = walletAddress
        ? new ethers.Contract(
            BNB_STAKING_CONTRACT,
            STAKING_ABI,
            new ethers.providers.JsonRpcProvider(BNB_RPC),
          )
        : null;
      // A failed legacy read is logged, never folded into the total as a zero
      // — silently dropping it is what made the staking card and the holdings
      // leaderboard disagree.
      const legacyZero = (label: string) => (err: unknown) => {
        console.warn(`[StakingTab] legacy ${label} read failed:`, err);
        return ethers.BigNumber.from(0);
      };

      const [userWalletBal, totalStakedBal, dbRecords, legacyInfo, legacyEarned] =
        await Promise.all([
          walletAddress
            ? baseDhb.balanceOf(walletAddress).catch(() => ethers.BigNumber.from(0))
            : Promise.resolve(ethers.BigNumber.from(0)),
          baseDhb.balanceOf(STAKING_ADDRESS).catch(() => ethers.BigNumber.from(0)),
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
            ? legacyStaking
                .userInfos(walletAddress)
                .then((info: any) => ({
                  amount: info.totalAmount as ethers.BigNumber,
                  unlockAt: Number(info.unlockAt ?? 0),
                }))
                .catch((err: unknown) => {
                  legacyZero("userInfos")(err);
                  return { amount: ethers.BigNumber.from(0), unlockAt: 0 };
                })
            : Promise.resolve({ amount: ethers.BigNumber.from(0), unlockAt: 0 }),
          legacyStaking
            ? legacyStaking
                .pendingHarvest(walletAddress)
                .catch(legacyZero("pendingHarvest"))
            : Promise.resolve(ethers.BigNumber.from(0)),
        ]);

      setWalletBal(parseFloat(ethers.utils.formatUnits(userWalletBal, 18)));
      setProtocolTotal(parseFloat(ethers.utils.formatUnits(totalStakedBal, 18)));

      // Net staked + queued from the transfer-based staking ledger
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

      const legacyStakedNum = parseFloat(
        ethers.utils.formatUnits(legacyInfo.amount, 18),
      );
      setLegacyStaked(legacyStakedNum);
      setLegacyUnlockAt(legacyInfo.unlockAt);
      setUserStaked(dbStaked + legacyStakedNum);
      setUnstakeQueued(queued);
      setEarned(parseFloat(ethers.utils.formatUnits(legacyEarned, 18)));
    } catch (err) {
      console.warn("[StakingTab] fetchData error:", err);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // A fee someone accepted for one amount is not a fee they accepted for
  // another, so any edit puts the confirmation back.
  useEffect(() => {
    setEarlyConfirmed(false);
  }, [amount, mode]);

  const handleStake = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toastError("Enter a valid amount to stake.");
      return;
    }
    if (!walletAddress) {
      toastError("Wallet not connected.");
      return;
    }
    if (walletBal != null && amt > walletBal) {
      toastError("Insufficient DHB balance on Base.");
      return;
    }

    setIsBusy(true);
    try {
      const targetChainId = parseInt(BASE_CHAIN_HEX, 16);
      let sendProvider = authProvider;
      if (activeChainId !== targetChainId) {
        try {
          await switchChain(targetChainId);
        } catch {
          toastError("Failed to switch to Base network.");
          return;
        }
        sendProvider = getSigningProvider() || authProvider;
      }
      if (!sendProvider?.request) {
        toastError("Wallet not ready. Please try again.");
        return;
      }

      const iface = new ethers.utils.Interface(ERC20_ABI);
      const amountWei = ethers.utils.parseUnits(amount, 18);
      const data = iface.encodeFunctionData("transfer", [STAKING_ADDRESS, amountWei]);

      const txHash = await sendProvider.request({
        method: "eth_sendTransaction",
        params: [{ from: walletAddress, to: DHB_BASE, data }],
      });

      // Wait for confirmation before recording so we never log a failed stake.
      try {
        const provider = new ethers.providers.JsonRpcProvider(BASE_RPC);
        const receipt = await provider.waitForTransaction(txHash, 1, 90_000);
        if (receipt && receipt.status === 0) {
          toastError("Stake transaction reverted on-chain.");
          return;
        }
      } catch {
        // Confirmation timed out — still record optimistically with the hash.
      }

      try {
        await supabase.from("staking_records").insert({
          wallet_address: walletAddress.toLowerCase(),
          amount: amt,
          chain: "Base",
          tx_hash: txHash || "",
          action: "stake",
        });
      } catch (dbErr) {
        console.warn("[StakingTab] failed to record stake:", dbErr);
      }

      toastSuccess(`Staked ${amount} DHB! TX: ${txHash.slice(0, 10)}…`);
      setAmount("");
      setTimeout(fetchData, 4000);
    } catch (err: any) {
      const msg = String(err?.message || err || "Staking failed");
      if (msg.includes("user rejected") || msg.includes("cancelled")) {
        toastError("Transaction cancelled.");
      } else {
        toastError(msg.slice(0, 100));
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleUnstake = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toastError("Enter a valid amount to unstake.");
      return;
    }
    if (!walletAddress) {
      toastError("Wallet not connected.");
      return;
    }
    if (amt > userStaked) {
      toastError(`You only have ${fmt(userStaked)} DHB staked.`);
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
          ? `Only ${fmt(legacyStaked)} DHB can be unstaked right now — the rest is in the Base pool, which has no withdrawal contract yet.`
          : "Your DHB is in the Base pool, which has no withdrawal contract yet. Contact support to withdraw.",
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
        `Locked until ${new Date(legacyUnlockAt * 1000).toLocaleDateString()}. Unstaking now returns 88% — a 12% fee, about ${fmt(amt * 0.12)} DHB. Tap Unstake again to accept.`,
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
          toastError("Failed to switch to BNB Chain.");
          return;
        }
        sendProvider = getSigningProvider() || authProvider;
      }
      if (!sendProvider?.request) {
        toastError("Wallet not ready. Please try again.");
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
          toastError("Unstake reverted on-chain.");
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

      toastSuccess(`Unstaked ${amount} DHB! TX: ${txHash.slice(0, 10)}…`);
      setAmount("");
      setMode("stake");
      setTimeout(fetchData, 4000);
    } catch (err: any) {
      const msg = String(err?.message || err || "Unstake failed");
      if (msg.includes("user rejected") || msg.includes("cancelled")) {
        toastError("Transaction cancelled.");
      } else {
        toastError(msg.slice(0, 100));
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopyStakingAddress = async () => {
    await Clipboard.setStringAsync(STAKING_ADDRESS);
    toastSuccess("Staking address copied!");
  };

  // MAX on the unstake side is the legacy position, not the whole stake —
  // filling it with pool DHB would just walk the user into a rejection.
  const max = mode === "stake" ? walletBal ?? 0 : legacyStaked;
  const submit = mode === "stake" ? handleStake : handleUnstake;

  return (
    <View className="flex-1">
      {/* Stats row */}
      <View className="flex-row gap-3 mb-5">
        <View className="flex-1 bg-white/5 border border-white/10 rounded-xl p-4">
          <Text className="text-white/50 text-xs uppercase tracking-wider mb-1">
            Your Staked
          </Text>
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-white text-lg font-bold">{fmt(userStaked)}</Text>
          )}
          <Text className="text-white/60 text-xs mt-0.5">
            DHB{unstakeQueued > 0 ? ` · ${fmt(unstakeQueued)} unstaking` : ""}
          </Text>
        </View>
        <View className="flex-1 bg-white/5 border border-white/10 rounded-xl p-4">
          <Text className="text-white/50 text-xs uppercase tracking-wider mb-1">
            Wallet Balance
          </Text>
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-white text-lg font-bold">{fmt(walletBal ?? 0)}</Text>
          )}
          <Text className="text-white/60 text-xs mt-0.5">DHB on Base</Text>
        </View>
      </View>

      {/* Pending rewards (BNB legacy contract) */}
      {earned > 0 && (
        <View className="flex-row items-center justify-between bg-white/10 border border-white/20 rounded-xl p-4 mb-4">
          <View>
            <Text className="text-white/80 font-semibold text-sm">Pending Rewards</Text>
            <Text className="text-white text-lg font-bold mt-0.5">{fmt(earned)} <DhbCoin size={16} /></Text>
          </View>
          <View className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">
            <Text className="text-white/50 text-[11px]">Claim on web app</Text>
          </View>
        </View>
      )}

      {/* Stake / Unstake card */}
      <View className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4">
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
                {m}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text className="text-white/60 text-xs mb-4">
          {mode === "stake"
            ? "Stake DHB on Base to earn protocol rewards."
            : "Request an unstake. Tokens are released after a 12-day cooldown."}
        </Text>

        <View className="flex-row items-center bg-white/[0.06] border border-white/10 rounded-xl px-3 mb-3 h-12">
          <TextInput
            className="flex-1 text-white text-sm"
            placeholder="Amount"
            placeholderTextColor="rgba(255,255,255,0.5)"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />
          <TouchableOpacity
            onPress={() => setAmount(String(max))}
            className="px-2 py-3 -mr-1"
            hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
          >
            <Text className="text-white/50 text-xs font-bold uppercase">MAX</Text>
          </TouchableOpacity>
        </View>

        <Text className="text-white/60 text-xs mb-3">
          {mode === "stake"
            ? `Available: ${fmt(walletBal ?? 0)} DHB`
            : `Withdrawable: ${fmt(legacyStaked)} DHB on BNB Chain${
                userStaked - legacyStaked > 0
                  ? ` · ${fmt(userStaked - legacyStaked)} in the Base pool`
                  : ""
              }${
                legacyStaked > 0 && legacyUnlockAt > Math.floor(Date.now() / 1000)
                  ? ` · locked until ${new Date(
                      legacyUnlockAt * 1000,
                    ).toLocaleDateString()}, 12% fee before then`
                  : ""
              }`}
        </Text>

        <TouchableOpacity
          onPress={submit}
          disabled={isBusy || !amount}
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
                ? "Staking…"
                : "Requesting…"
              : mode === "stake"
              ? "Stake DHB"
              : "Request Unstake"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Protocol stats */}
      <View className="flex-row items-center justify-between bg-white/[0.03] border border-white/10 rounded-xl p-4 mb-4">
        <Text className="text-white/50 text-xs">Total staked (protocol)</Text>
        <Text className="text-white font-semibold text-sm">
          {loading ? "…" : `${fmt(protocolTotal ?? 0)} DHB`}
        </Text>
      </View>

      {/* Manual staking address */}
      <View className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
        <Text className="text-white/50 text-xs mb-2">
          Or send DHB directly to the staking address on Base:
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
        <Text className="text-white/60 text-xs">Refresh balances</Text>
      </TouchableOpacity>
    </View>
  );
};

export default StakingTab;
