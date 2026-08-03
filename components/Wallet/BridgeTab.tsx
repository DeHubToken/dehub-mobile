import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { ethers } from "ethers";
import { useUser, useProvider, useAuthActions } from "../../context/AuthContext";
import { getSigningProvider } from "../../libs/provider.registry";
import { supabase } from "../../services/supabase";
import { toastError, toastSuccess } from "../../libs/toast";

interface BridgeTransfer {
  txHash: string;
  from: string;
  amount: string;
  chain: string;
  chainId: number;
  explorerUrl: string;
  timestamp: number;
  status: string;
}

function timeAgo(unix: number): string {
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const DHB_BASE = "0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c";
const DHB_BNB = "0x680D3113caf77B61b510f332D5Ef4cf5b41A761D";
const BRIDGE_ADDRESS = "0x11D79aE9a0F8a8f9Fcf5BE71e403ed203EC2394d";

const BASE_RPC = "https://mainnet.base.org";
const BNB_RPC = "https://bsc-dataseed.binance.org";
const BASE_CHAIN_HEX = "0x2105"; // 8453
const BNB_CHAIN_HEX = "0x38";   // 56

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

type Direction = "base-to-bnb" | "bnb-to-base";

function formatDHB(raw: ethers.BigNumber | null): string {
  if (!raw) return "—";
  const val = parseFloat(ethers.utils.formatUnits(raw, 18));
  if (val === 0) return "0";
  if (val >= 1_000_000) return (val / 1_000_000).toFixed(2) + "M";
  if (val >= 1_000) return (val / 1_000).toFixed(2) + "K";
  return val.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

const BridgeTab: React.FC = () => {
  const user = useUser() as any;
  const walletAddress: string | undefined =
    user?.walletAddress || user?.address;
  const { chainId, provider } = useProvider();
  const { switchChain } = useAuthActions();

  const [baseBal, setBaseBal] = useState<ethers.BigNumber | null>(null);
  const [bnbBal, setBnbBal] = useState<ethers.BigNumber | null>(null);
  const [loading, setLoading] = useState(true);
  const [direction, setDirection] = useState<Direction>("base-to-bnb");
  const [amount, setAmount] = useState("");
  const [isBridging, setIsBridging] = useState(false);
  const [transfers, setTransfers] = useState<BridgeTransfer[]>([]);
  const [loadingTransfers, setLoadingTransfers] = useState(true);

  const fetchTransfers = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("bridge-transfers");
      if (error) throw error;
      const all = (data?.transfers ?? []) as BridgeTransfer[];
      const mine = walletAddress
        ? all.filter((t) => t.from?.toLowerCase() === walletAddress.toLowerCase())
        : all;
      setTransfers(mine.slice(0, 5));
    } catch (err) {
      console.warn("[BridgeTab] fetchTransfers error:", err);
    } finally {
      setLoadingTransfers(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  const fetchBalances = useCallback(async () => {
    if (!walletAddress) {
      setLoading(false);
      return;
    }
    try {
      const baseProvider = new ethers.providers.JsonRpcProvider(BASE_RPC);
      const bnbProvider = new ethers.providers.JsonRpcProvider(BNB_RPC);
      const baseContract = new ethers.Contract(DHB_BASE, ERC20_ABI, baseProvider);
      const bnbContract = new ethers.Contract(DHB_BNB, ERC20_ABI, bnbProvider);

      const [base, bnb] = await Promise.all([
        baseContract.balanceOf(walletAddress).catch(() => ethers.BigNumber.from(0)),
        bnbContract.balanceOf(walletAddress).catch(() => ethers.BigNumber.from(0)),
      ]);

      setBaseBal(base);
      setBnbBal(bnb);
    } catch (err) {
      console.warn("[BridgeTab] fetchBalances error:", err);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  const sourceBal = direction === "base-to-bnb" ? baseBal : bnbBal;
  const sourceChain = direction === "base-to-bnb" ? "Base" : "BNB Chain";
  const destChain = direction === "base-to-bnb" ? "BNB Chain" : "Base";
  const sourceChainHex = direction === "base-to-bnb" ? BASE_CHAIN_HEX : BNB_CHAIN_HEX;
  const sourceToken = direction === "base-to-bnb" ? DHB_BASE : DHB_BNB;
  const sourceBalF = formatDHB(sourceBal);

  const handleBridge = async () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      toastError("Enter a valid amount to bridge.");
      return;
    }
    if (!walletAddress) {
      toastError("Wallet not connected.");
      return;
    }
    if (sourceBal) {
      const amountWei = ethers.utils.parseUnits(amount, 18);
      if (amountWei.gt(sourceBal)) {
        toastError(`Insufficient DHB on ${sourceChain}.`);
        return;
      }
    }

    setIsBridging(true);
    try {
      const targetChainId = parseInt(sourceChainHex, 16);
      let activeProvider = provider;
      if (chainId !== targetChainId) {
        try {
          await switchChain(targetChainId);
        } catch {
          toastError(`Could not switch to ${sourceChain}. Please try again.`);
          return;
        }
        activeProvider = getSigningProvider() || provider;
      }
      if (!activeProvider?.request) {
        toastError("Wallet not ready. Please try again.");
        return;
      }

      const iface = new ethers.utils.Interface(ERC20_ABI);
      const amountWei = ethers.utils.parseUnits(amount, 18);
      const data = iface.encodeFunctionData("transfer", [BRIDGE_ADDRESS, amountWei]);

      const txHash = await activeProvider.request({
        method: "eth_sendTransaction",
        params: [{ from: walletAddress, to: sourceToken, data }],
      });

      toastSuccess(`Bridge initiated! TX: ${txHash.slice(0, 10)}…`);
      toastSuccess(`${amount} DHB sent from ${sourceChain} → ${destChain}. Tokens arrive shortly.`);
      setAmount("");
      setTimeout(fetchBalances, 8000);
      setTimeout(fetchTransfers, 8000);
    } catch (err: any) {
      const msg = String(err?.message || err || "Bridge failed");
      if (msg.includes("user rejected") || msg.includes("cancelled")) {
        toastError("Transaction cancelled.");
      } else if (msg.includes("transfer amount exceeds balance") || msg.includes("exceeds balance")) {
        toastError(`Insufficient DHB on ${sourceChain}. On-chain balance may differ from displayed.`);
      } else if (msg.includes("gas") || msg.includes("aa21") || msg.includes("aa25")) {
        toastError(`Need native ${direction === "base-to-bnb" ? "ETH" : "BNB"} for gas on ${sourceChain}.`);
      } else {
        toastError(msg.slice(0, 100));
      }
    } finally {
      setIsBridging(false);
    }
  };

  const handleCopyBridgeAddress = async () => {
    await Clipboard.setStringAsync(BRIDGE_ADDRESS);
    toastSuccess("Bridge address copied!");
  };

  return (
    <View className="flex-1">
      {/* Balance stats */}
      <View className="flex-row gap-3 mb-5">
        <View className="flex-1 bg-white/5 border border-white/10 rounded-xl p-4">
          <Text className="text-white/50 text-[10px] uppercase tracking-wider mb-1">
            Base
          </Text>
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-white text-lg font-bold">{formatDHB(baseBal)}</Text>
          )}
          <Text className="text-white/40 text-[10px] mt-0.5">DHB</Text>
        </View>
        <View className="flex-1 bg-white/5 border border-white/10 rounded-xl p-4">
          <Text className="text-white/50 text-[10px] uppercase tracking-wider mb-1">
            BNB Chain
          </Text>
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-white text-lg font-bold">{formatDHB(bnbBal)}</Text>
          )}
          <Text className="text-white/40 text-[10px] mt-0.5">DHB</Text>
        </View>
      </View>

      {/* Bridge card */}
      <View className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4">
        <Text className="text-white font-semibold text-base mb-4">Bridge DHB</Text>

        {/* Direction display */}
        <View className="flex-row items-center gap-3 mb-5">
          <View className="flex-1 border border-white/10 bg-white/[0.03] rounded-xl p-3 items-center">
            <Text className="text-white/40 text-[10px] uppercase tracking-wider mb-1">
              From
            </Text>
            <Text className="text-white text-sm font-semibold">{sourceChain}</Text>
          </View>

          <TouchableOpacity
            onPress={() => {
              setDirection((d) =>
                d === "base-to-bnb" ? "bnb-to-base" : "base-to-bnb"
              );
              setAmount("");
            }}
            className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 items-center justify-center"
          >
            <Ionicons name="swap-vertical-outline" size={18} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>

          <View className="flex-1 border border-white/10 bg-white/[0.03] rounded-xl p-3 items-center">
            <Text className="text-white/40 text-[10px] uppercase tracking-wider mb-1">
              To
            </Text>
            <Text className="text-white text-sm font-semibold">{destChain}</Text>
          </View>
        </View>

        {/* Available balance */}
        <Text className="text-white/40 text-xs mb-3">
          Available:{" "}
          <Text className="text-white/70 font-medium">{sourceBalF} DHB</Text> on{" "}
          {sourceChain}
        </Text>

        {/* Amount input */}
        <View className="flex-row items-center bg-white/[0.06] border border-white/10 rounded-xl px-3 mb-4 h-12">
          <TextInput
            className="flex-1 text-white text-sm"
            placeholder="0"
            placeholderTextColor="rgba(255,255,255,0.3)"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />
          <TouchableOpacity
            onPress={() => {
              if (sourceBal) {
                setAmount(ethers.utils.formatUnits(sourceBal, 18));
              }
            }}
          >
            <Text className="text-white/50 text-xs font-bold uppercase">MAX</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={handleBridge}
          disabled={isBridging || !amount}
          className={`h-12 rounded-xl items-center justify-center flex-row gap-2 ${
            isBridging || !amount
              ? "bg-white/10"
              : "bg-white/15 border border-white/20"
          }`}
        >
          {isBridging ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="swap-horizontal-outline" size={16} color="white" />
          )}
          <Text className="text-white font-semibold text-sm">
            {isBridging ? "Bridging…" : `Bridge ${sourceChain} → ${destChain}`}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Info note */}
      <View className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-4">
        <View className="flex-row items-center gap-2 mb-2">
          <Ionicons name="information-circle-outline" size={16} color="#D4D4D8" />
          <Text className="text-blue-400 font-semibold text-sm">How it works</Text>
        </View>
        <Text className="text-white/60 text-xs leading-5">
          Send DHB to the bridge relay address on the source chain. The relay
          automatically delivers the equivalent amount on the destination chain
          within minutes.
        </Text>
      </View>

      {/* Recent bridges */}
      <View className="bg-white/[0.03] border border-white/10 rounded-xl p-4 mb-4">
        <Text className="text-white/50 text-xs uppercase tracking-wider mb-3">
          Your recent bridges
        </Text>
        {loadingTransfers ? (
          <View className="items-center py-4">
            <ActivityIndicator size="small" color="#fff" />
          </View>
        ) : transfers.length === 0 ? (
          <Text className="text-white/30 text-xs text-center py-3">
            No bridge transfers in the last 7 days.
          </Text>
        ) : (
          <View className="gap-2">
            {transfers.map((t) => (
              <TouchableOpacity
                key={`${t.txHash}-${t.from}`}
                onPress={() => t.explorerUrl && Linking.openURL(t.explorerUrl)}
                className="flex-row items-center gap-3 bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5"
              >
                <View
                  className={`w-8 h-8 rounded-lg items-center justify-center ${
                    t.chainId === 8453
                      ? "bg-blue-500/10 border border-blue-500/20"
                      : "bg-yellow-500/10 border border-yellow-500/20"
                  }`}
                >
                  <Text
                    className={`text-[10px] font-bold ${
                      t.chainId === 8453 ? "text-blue-400" : "text-yellow-400"
                    }`}
                  >
                    {t.chainId === 8453 ? "B" : "BNB"}
                  </Text>
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-white text-sm font-medium">
                    {(Number(t.amount) || 0).toLocaleString("en-US", {
                      maximumFractionDigits: 4,
                    })}{" "}
                    DHB
                  </Text>
                  <Text className="text-white/30 text-[10px] mt-0.5">
                    from {t.chain} · {timeAgo(t.timestamp)}
                  </Text>
                </View>
                <Ionicons name="open-outline" size={14} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Manual bridge address */}
      <View className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
        <Text className="text-white/50 text-xs mb-2">
          Bridge relay address (send DHB here on source chain):
        </Text>
        <TouchableOpacity
          onPress={handleCopyBridgeAddress}
          className="flex-row items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2"
        >
          <Text className="flex-1 text-white/60 text-[11px] font-mono">
            {BRIDGE_ADDRESS.slice(0, 10)}…{BRIDGE_ADDRESS.slice(-6)}
          </Text>
          <Ionicons name="copy-outline" size={14} color="rgba(255,255,255,0.4)" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={fetchBalances}
        className="mt-4 items-center flex-row justify-center gap-2"
      >
        <Ionicons name="refresh-outline" size={14} color="rgba(255,255,255,0.4)" />
        <Text className="text-white/40 text-xs">Refresh balances</Text>
      </TouchableOpacity>
    </View>
  );
};

export default BridgeTab;
