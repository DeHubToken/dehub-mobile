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
import { useUser } from "../../context/AuthContext";
import { web3AuthService } from "../../services/web3auth.service";
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

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

const STAKING_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function earned(address account) view returns (uint256)",
];

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

  const [walletBal, setWalletBal] = useState<number | null>(null);
  const [protocolTotal, setProtocolTotal] = useState<number | null>(null);
  const [userStaked, setUserStaked] = useState<number>(0);
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

      const [userWalletBal, totalStakedBal, dbRecords, legacyStaked, legacyEarned] =
        await Promise.all([
          walletAddress
            ? baseDhb.balanceOf(walletAddress).catch(() => ethers.BigNumber.from(0))
            : Promise.resolve(ethers.BigNumber.from(0)),
          baseDhb.balanceOf(STAKING_ADDRESS).catch(() => ethers.BigNumber.from(0)),
          addr
            ? supabase
                .from("staking_records")
                .select("amount, action")
                .eq("wallet_address", addr)
            : Promise.resolve({ data: [] as any[] }),
          // Legacy on-chain staked balance on BNB (read-only)
          walletAddress
            ? new ethers.Contract(
                BNB_STAKING_CONTRACT,
                STAKING_ABI,
                new ethers.providers.JsonRpcProvider(BNB_RPC),
              )
                .balanceOf(walletAddress)
                .catch(() => ethers.BigNumber.from(0))
            : Promise.resolve(ethers.BigNumber.from(0)),
          walletAddress
            ? new ethers.Contract(
                BNB_STAKING_CONTRACT,
                STAKING_ABI,
                new ethers.providers.JsonRpcProvider(BNB_RPC),
              )
                .earned(walletAddress)
                .catch(() => ethers.BigNumber.from(0))
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
        else if (r.action === "unstake") {
          dbStaked -= Number(r.amount);
          queued += Number(r.amount);
        }
      }
      if (dbStaked < 0) dbStaked = 0;

      const legacyStakedNum = parseFloat(ethers.utils.formatUnits(legacyStaked, 18));
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
      const chainOk = await web3AuthService.ensureChain(BASE_CHAIN_HEX as `0x${string}`);
      if (!chainOk) {
        toastError("Failed to switch to Base network.");
        return;
      }

      const iface = new ethers.utils.Interface(ERC20_ABI);
      const amountWei = ethers.utils.parseUnits(amount, 18);
      const data = iface.encodeFunctionData("transfer", [STAKING_ADDRESS, amountWei]);

      const txHash = await web3AuthService.sendTransaction({
        to: DHB_BASE,
        data: data as `0x${string}`,
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

    setIsBusy(true);
    try {
      const { error } = await supabase.from("staking_records").insert({
        wallet_address: walletAddress.toLowerCase(),
        amount: amt,
        chain: "Base",
        action: "unstake",
        tx_hash: `unstake-request-${Date.now()}`,
      });
      if (error) throw error;

      toastSuccess(
        `Unstake requested for ${amount} DHB. Tokens are released after the 12-day cooldown.`,
      );
      setAmount("");
      setMode("stake");
      setTimeout(fetchData, 1500);
    } catch (err: any) {
      toastError(String(err?.message || "Unstake request failed").slice(0, 100));
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopyStakingAddress = async () => {
    await Clipboard.setStringAsync(STAKING_ADDRESS);
    toastSuccess("Staking address copied!");
  };

  const max = mode === "stake" ? walletBal ?? 0 : userStaked;
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
        <View className="flex-row items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 mb-4">
          <View>
            <Text className="text-emerald-400 font-semibold text-sm">Pending Rewards</Text>
            <Text className="text-white text-lg font-bold mt-0.5">{fmt(earned)} DHB</Text>
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
            : `Staked: ${fmt(userStaked)} DHB`}
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
