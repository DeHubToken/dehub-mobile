import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  FlatList,
  Keyboard,
} from "react-native";
import GlassModal from "../ui/GlassModal";
import { Ionicons } from "@expo/vector-icons";
import { useUser, useAuthActions, useProvider, User } from "../../context/AuthContext";
import { supportedTokens } from "../../config/constants";
import { useDebounceCallback } from "../../hooks/useDebounceCallback";
import { usersSearch } from "../../services/user.service";
import { getAvatarUrl } from "../../libs/misc";
import Avatar from "../common/Avatar";
import { truncateAddress } from "../../libs/strings.util";
import { useERC20Contract, useWeb3Provider } from "../../hooks/use-web3";
import { ethers, providers } from "ethers";
import { toastError, toastSuccess } from "../../libs/toast";
import { parseTxError } from "../../libs/web3.util";
import { erc20TransferAA } from "../../libs/aa.write";
import AccentButtonGradient from "../ui/AccentButtonGradient";

export interface TransferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TransferModal: React.FC<TransferModalProps> = ({
  open,
  onOpenChange,
}) => {
  const user = useUser();
  const { requireAuth, patchUser } = useAuthActions();
  const { provider } = useProvider();
  const { chainId, account } = useWeb3Provider();
  const [amount, setAmount] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [results, setResults] = useState<User[]>([]);
  const [recipient, setRecipient] = useState<User | null>(null);
  const [sending, setSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState<boolean>(false);
  const searchIdRef = useRef<number>(0);
  const [recipientFromAddress, setRecipientFromAddress] =
    useState<boolean>(false);

  const selectedLabel = useMemo(() => {
    if (!recipient) return "";
    const addr = (recipient.walletAddress ||
      (recipient as any).address) as string;
    return (
      recipient.username ||
      (recipient as any).displayName ||
      truncateAddress(addr)
    );
  }, [recipient]);

  const dhbMeta = useMemo(() => {
    if (!chainId) return undefined;
    return supportedTokens.find(
      (t) => t.chainId === chainId && t.symbol === "DHB"
    );
  }, [chainId]);
  const tokenAddress = dhbMeta?.address;
  const tokenDecimals = dhbMeta?.decimals || 18;
  const tokenContract = useERC20Contract(tokenAddress);
  // console.log("[TransferModal] tokenContract", { tokenContract });
  const balance = (user?.tokenBalances?.DHB ?? 0) as number;
  const numericAmount = Number(amount) || 0;
  const insufficient = numericAmount > balance;
  // Debounced user search
  const performSearch = useCallback(
    async (text: string) => {
      const q = (text || "").trim();
      if (!open || !showResults || !!recipient || q.length < 2) {
        setLoading(false);
        if (q.length === 0) setResults([]);
        return;
      }
      const reqId = ++searchIdRef.current;
      try {
        setLoading(true);
        const res: any = await usersSearch(q);
        if (searchIdRef.current === reqId) {
          setResults((res?.data?.result || res?.result || []) as User[]);
        }
      } catch (e) {
        if (searchIdRef.current === reqId) {
          console.warn("[TransferModal] search failed", e);
        }
      } finally {
        if (searchIdRef.current === reqId) {
          setLoading(false);
        }
      }
    },
    [open, showResults, recipient]
  );
  const debouncedSearch = useDebounceCallback(performSearch, 300);

  useEffect(() => {
    if (!open) return;
    debouncedSearch(query);
  }, [query, open, showResults, recipient]);

  const close = useCallback(() => {
    if (sending) return;
    onOpenChange(false);
    setTimeout(() => {
      setAmount("");
      setQuery("");
      setResults([]);
      setRecipient(null);
      setError(null);
      setSending(false);
      setShowResults(false);
      setRecipientFromAddress(false);
    }, 250);
  }, [onOpenChange, sending]);

  const canSend = useMemo(() => {
    const a = Number(amount || 0);
    const to = recipient?.walletAddress || recipient?.address;
    if (!a || a <= 0) return false;
    if (!to) return false;
    if (!account) return false;
    if (!tokenContract || !tokenAddress) return false;
    if (String(to).toLowerCase() === String(account).toLowerCase())
      return false;
    return true;
  }, [amount, recipient, account, tokenContract, tokenAddress]);

  const handleSend = useCallback(async () => {
    requireAuth(async () => {
      if (sending || !canSend) return;
      if (account?.toLowerCase() === recipient?.walletAddress?.toLowerCase()) {
        setError("You cannot send tokens to yourself");
        return;
      }
      setError(null);
      if (!tokenContract || !recipient || !tokenAddress) return;
      try {
        setSending(true);
        const toAddr = (recipient.walletAddress || recipient.address) as string;
        const amountBN = ethers.utils.parseUnits(String(amount), tokenDecimals);
        console.log("[DEBUG] tokenAddress", tokenAddress);
        console.log(
          "[DEBUG] recipient",
          recipient?.walletAddress || recipient?.address
        );

        // Preflight diagnostics to avoid opaque reverts
        try {
          const signerAddr = await tokenContract.signer.getAddress?.();
          const signerChainId = await tokenContract.signer.getChainId?.();
          const onchainBal = await tokenContract.balanceOf(signerAddr);
          const dec = await tokenContract.decimals?.();
          const sym = await tokenContract.symbol?.();
          console.log("[TransferModal] preflight", {
            signerAddr,
            signerChainId,
            tokenAddress,
            tokenDecimals,
            onchainBal: onchainBal?.toString?.(),
            amountBN: amountBN.toString(),
            symbol: sym,
            decimals: dec,
          });
          if (onchainBal && onchainBal.lt(amountBN)) {
            setError("Insufficient on-chain balance for this token");
            setSending(false);
            return;
          }
        } catch (pfErr) {
          console.warn("[TransferModal] preflight checks failed", pfErr);
        }

        // Use AA-aware write helper which handles web3auth vs local EOA paths
        await erc20TransferAA(tokenContract, toAddr, amountBN, {
          context: "send",
        });
        close();
        toastSuccess("Transfer sent");
        try {
          await patchUser(
            (prev) =>
              ({
                tokenBalances: {
                  ...(prev.tokenBalances || {}),
                  DHB: Math.max(
                    0,
                    Number((prev.tokenBalances || {}).DHB || 0) -
                      Number(amount || 0)
                  ),
                },
              } as any)
          );
        } catch {}
      } catch (e: any) {
        console.warn("[TransferModal] transfer failed", e);
        setError(parseTxError(e?.message, "send"));
        // toastError(e, "Transfer failed");
      } finally {
        setSending(false);
      }
    });
  }, [
    requireAuth,
    sending,
    canSend,
    tokenContract,
    recipient,
    tokenAddress,
    amount,
    tokenDecimals,
    patchUser,
    close,
  ]);

  const renderItem = useCallback(
    ({ item }: { item: User }) => {
      const addr = (item.walletAddress || (item as any).address) as string;
      const selected =
        recipient?.walletAddress === addr || recipient?.address === addr;
      return (
        <TouchableOpacity
          className={`flex-row items-center p-2 rounded-lg ${
            selected ? "bg-theme-neutrals-800" : "bg-theme-neutrals-900"
          }`}
          onPress={() => {
            setRecipient(item);
            setLoading(false);
            const addr = (item.walletAddress ||
              (item as any).address) as string;
            setQuery(
              item.username ||
                (item as any).displayName ||
                truncateAddress(addr)
            );
            searchIdRef.current++;
            setShowResults(false);
            setRecipientFromAddress(false);
          }}
          activeOpacity={0.85}
        >
          <Avatar uri={getAvatarUrl(item.avatarImageUrl)} size={32} name={item.username || item.displayName} />
          <View className="ml-2 flex-1">
            <Text className="text-white text-sm" numberOfLines={1}>
              {item.username || item.displayName || truncateAddress(addr)}
            </Text>
            <Text
              className="text-theme-neutrals-400 text-[11px]"
              numberOfLines={1}
            >
              {truncateAddress(addr)}
            </Text>
          </View>
          {selected && (
            <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
          )}
        </TouchableOpacity>
      );
    },
    [recipient]
  );
  return (
    <GlassModal
      visible={open}
      onClose={close}
      presentation="center"
      blurIntensity={40}
    >
      <View className="p-6 gap-5 relative">
        <View className="gap-2">
          <Text className="text-white font-bold text-3xl tracking-wider">
            Transfer tokens
          </Text>
          {!!recipient && (
            <Text className="text-white/70 text-xs">
              Recipient:{" "}
              {truncateAddress(
                (recipient.walletAddress ||
                  (recipient as any).address) as string
              )}
            </Text>
          )}
        </View>
        <View>
          <Text className="text-base text-white mb-2">
            Enter amount of{" "}
            <Text className="text-theme-accent font-semibold">$DHB:</Text>
          </Text>
          <TextInput
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor="#666"
            value={amount}
            onChangeText={setAmount}
            className="border border-theme-neutrals-700 rounded-lg px-3 h-12 text-white text-base"
          />
          <View className="flex-row justify-between mt-2">
            <Text className="text-[11px] text-white/60">
              Balance: {balance} DHB
            </Text>
          </View>
          {insufficient && (
            <Text className="text-xs text-red-400 mt-1">
              Insufficient balance
            </Text>
          )}
          {!!recipient &&
            String(
              (recipient.walletAddress || (recipient as any).address) as string
            ).toLowerCase() === String(account).toLowerCase() && (
              <Text className="text-xs text-red-400 mt-1">
                You can't transfer to yourself
              </Text>
            )}
          {!!error && (
            <Text className="text-xs text-red-400 mt-1">{error}</Text>
          )}
        </View>
        <View className="relative z-10">
          <View>
            <Text className="text-white text-base font-semibold mb-2">
              Search for a user
            </Text>
            <View className="relative">
              <TextInput
                placeholder="Enter username or paste address"
                placeholderTextColor="#666"
                value={query}
                onChangeText={(t) => {
                  setQuery(t);
                  const trimmed = (t || "").trim();
                  // If a valid address is pasted/typed, set as recipient and bypass search
                  if (ethers.utils?.isAddress?.(trimmed)) {
                    setRecipient({
                      address: trimmed,
                      walletAddress: trimmed,
                    } as any);
                    setRecipientFromAddress(true);
                    setResults([]);
                    setLoading(false);
                    setShowResults(false);
                    searchIdRef.current++;
                    return;
                  }
                  // If editing after setting address, clear recipient
                  if (
                    recipientFromAddress &&
                    !ethers.utils?.isAddress?.(trimmed)
                  ) {
                    setRecipient(null);
                    setRecipientFromAddress(false);
                  }
                  // Regular search behavior
                  if (trimmed.length === 0) {
                    setResults([]);
                    setLoading(false);
                    setShowResults(false);
                    searchIdRef.current++;
                  } else {
                    setShowResults(trimmed.length >= 2);
                  }
                }}
                onFocus={() =>
                  setShowResults(
                    !recipientFromAddress && (query || "").trim().length >= 2
                  )
                }
                className="border border-theme-neutrals-700 rounded-lg pr-10 pl-3 h-12 text-white text-base"
              />
              {recipientFromAddress && (
                <TouchableOpacity
                  onPress={() => {
                    setQuery("");
                    setRecipient(null);
                    setRecipientFromAddress(false);
                    setResults([]);
                    setShowResults(false);
                    setLoading(false);
                    searchIdRef.current++;
                  }}
                  className="absolute right-2 top-2 h-8 w-8 items-center justify-center"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={20} color="#e7e6e6ff" />
                </TouchableOpacity>
              )}
            </View>
            {!!recipient && !loading && !showResults && (
              <View className="mt-2">
                <View className="flex-row items-center p-2 rounded-lg bg-theme-neutrals-900">
                  <Avatar
                    uri={getAvatarUrl(recipient.avatarImageUrl)}
                    size={32}
                    name={selectedLabel}
                  />
                  <View className="ml-2 flex-1">
                    <Text className="text-white text-sm" numberOfLines={1}>
                      {recipientFromAddress ? "Transferring to" : selectedLabel}
                    </Text>
                    <Text
                      className="text-theme-neutrals-400 text-[11px]"
                      numberOfLines={1}
                    >
                      {truncateAddress(
                        (recipient.walletAddress ||
                          (recipient as any).address) as string
                      )}
                    </Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
                </View>
              </View>
            )}
            {loading && !recipient && (
              <View className="py-2 items-center">
                <ActivityIndicator color="#fff" />
              </View>
            )}
            {showResults && (
              <FlatList
                data={results}
                keyExtractor={(item) =>
                  String((item as any).address || item.walletAddress)
                }
                renderItem={renderItem}
                className="max-h-48"
                keyboardShouldPersistTaps="handled"
              />
            )}
          </View>
        </View>
        <View className="flex-row items-center justify-center gap-3">
          <AccentButtonGradient>
            <TouchableOpacity
              disabled={!canSend || sending}
              onPress={handleSend}
              className={`flex-row items-center gap-2 px-5 h-11 rounded-full bg-transparent ${
                !canSend || sending ? "opacity-60" : ""
              }`}
            >
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="swap-horizontal" size={18} color="#fff" />
              )}
              <Text className="text-white font-semibold">
                {sending ? "Transferring..." : "Transfer"}
              </Text>
            </TouchableOpacity>
          </AccentButtonGradient>
          <TouchableOpacity
            disabled={sending}
            onPress={close}
            className={`px-5 h-11 rounded-full bg-theme-neutrals-700 items-center justify-center ${
              sending ? "opacity-60" : ""
            }`}
          >
            <Text className="text-white font-semibold">Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </GlassModal>
  );
};

export default TransferModal;
