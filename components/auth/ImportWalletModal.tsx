import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import GlassModal from "../ui/GlassModal";
import { Ionicons } from "@expo/vector-icons";
import { deriveAddressFromPrivateKey } from "../../config/web3auth.config";
import { listLocalAccounts, removeLocalAccount, LocalAccount, getPrivateKeyForAddress, upsertLocalAccount } from "../../libs/wallets.local";
import { miniAddress } from "../../libs/strings.util";
import * as Clipboard from "expo-clipboard";
import { openInApp } from "../../libs/links.utils";
import { WEBSITE_LINK } from "../../config";
import { ChainId } from "../../config/constants";
import { SUPPORTED_NETWORKS } from "../../config/web3.constants";
import { createLocalEip1193Provider } from "../../services/localwallet.provider";
import { setSigningProvider, clearSigningProvider } from "../../libs/provider.registry";
import { useAuth } from "../../context/AuthContext";
import { toastError, toastInfo } from "../../libs";
import { getPreferredChainId } from "../../libs/auth.utils";

export interface ImportWalletModalProps {
  visible: boolean;
  onClose: () => void;
}

const TARGET_CHAIN_ID = ChainId.BASE_MAINNET;
const LIST_MAX_HEIGHT = Math.round(Dimensions.get("window").height * 0.45);

const ImportWalletModal: React.FC<ImportWalletModalProps> = memo(
  ({ visible, onClose }) => {
    const {
      signInWithWallet,
      isLoading: authLoading,
      needsUsername,
    } = useAuth();
    const [privateKey, setPrivateKey] = useState<string>("");
    const [showPk, setShowPk] = useState<boolean>(false);
    const [isImporting, setIsImporting] = useState<boolean>(false);
  const [accounts, setAccounts] = useState<LocalAccount[]>([]);
  const [clipboardPk, setClipboardPk] = useState<string | null>(null);

    const busy = (authLoading || isImporting) && !needsUsername;

    const refresh = useCallback(async () => {
      const list = await listLocalAccounts();
      setAccounts(list);
    }, []);

    useEffect(() => {
      if (visible) refresh();
    }, [visible, refresh]);

    const validatePk = useCallback((pk: string) => {
      const v = pk.trim();
      if (!v) return false;
      const hex = v.startsWith("0x") ? v.slice(2) : v;
      return /^[0-9a-fA-F]{64}$/.test(hex);
    }, []);

    const isPkValid = useMemo(
      () => validatePk(privateKey),
      [privateKey, validatePk]
    );

    useEffect(() => {
      let mounted = true;
      const run = async () => {
        if (!visible) {
          setClipboardPk(null);
          return;
        }
        try {
          const clip = await Clipboard.getStringAsync();
          const normalized = clip?.trim();
          if (normalized && validatePk(normalized)) {
            if (mounted)
              setClipboardPk(
                normalized.startsWith("0x") ? normalized : `0x${normalized}`
              );
          } else {
            if (mounted) setClipboardPk(null);
          }
        } catch {
          if (mounted) setClipboardPk(null);
        }
      };
      run();
      return () => {
        mounted = false;
      };
    }, [visible, validatePk]);

    const handleImport = useCallback(async () => {
      if (!isPkValid) return;
      try {
        setIsImporting(true);
        const address = deriveAddressFromPrivateKey(privateKey)?.toLowerCase();
        if (!address) throw new Error("Invalid private key");
        // Choose preferred chain (fallback to Base) for local EIP-1193 provider
        const preferred = await getPreferredChainId();
        const effectiveChainId = preferred ?? TARGET_CHAIN_ID;
        const net = SUPPORTED_NETWORKS[effectiveChainId] || SUPPORTED_NETWORKS[ChainId.BASE_MAINNET];
        const rpcUrl = net?.rpcUrls?.[0] || SUPPORTED_NETWORKS[ChainId.BASE_MAINNET]?.rpcUrls?.[0] || "https://mainnet.base.org";
        const chainIdHex = (net?.chainId as string) || ('0x' + Number(effectiveChainId).toString(16)) || "0x2105";
        const localProvider = createLocalEip1193Provider({ privateKey, rpcUrl, chainIdHex });
        setSigningProvider(localProvider);
        try {
            // Persist the address + private key immediately; username will be added later in AuthContext
            await upsertLocalAccount({ address, privateKey });
          await signInWithWallet(address, effectiveChainId, privateKey);
          // Local account persistence will occur centrally after username is available
          toastInfo("Wallet imported");
          setPrivateKey("");
          await refresh();
          onClose();
        } finally {
          clearSigningProvider();
        }
      } catch (e: any) {
        toastError(e, "Could not import wallet");
      } finally {
        setIsImporting(false);
      }
    }, [isPkValid, privateKey, refresh, signInWithWallet, onClose]);

    const handleUse = useCallback(
      async (address: string) => {
        try {
          setIsImporting(true);
          const pk = await getPrivateKeyForAddress(address);
          if (!pk) {
            toastError(
              "No private key is stored for this account. Please re-import this wallet to link its key."
            );
            return;
          }
          const preferred = await getPreferredChainId();
          const effectiveChainId = preferred ?? TARGET_CHAIN_ID;
          const net = SUPPORTED_NETWORKS[effectiveChainId] || SUPPORTED_NETWORKS[ChainId.BASE_MAINNET];
          const rpcUrl = net?.rpcUrls?.[0] || SUPPORTED_NETWORKS[ChainId.BASE_MAINNET]?.rpcUrls?.[0] || "https://mainnet.base.org";
          const chainIdHex = (net?.chainId as string) || ('0x' + Number(effectiveChainId).toString(16)) || "0x2105";
          const localProvider = createLocalEip1193Provider({ privateKey: pk, rpcUrl, chainIdHex });
          setSigningProvider(localProvider);
          try {
            await signInWithWallet(address, effectiveChainId, pk);
            // Ensure the account is persisted with its private key (idempotent)
            await upsertLocalAccount({ address, privateKey: pk });
            onClose();
          } finally {
            clearSigningProvider();
          }
        } catch (e: any) {
          toastError(e, "Failed to use this account");
        } finally {
          setIsImporting(false);
        }
      },
      [signInWithWallet, onClose]
    );

    const handleDelete = useCallback(
      async (address: string) => {
        try {
          await removeLocalAccount(address);
          await refresh();
        } catch (e) {
          // no-op
        }
      },
      [refresh]
    );

    return (
      <GlassModal
        visible={visible}
        onClose={onClose}
        presentation="center"
        blurIntensity={50}
        dismissible={!busy}
      >
        <View className="max-h-[90%] p-6">
          <View className="px-5 pt-5 pb-3">
            <Text className="text-white text-lg font-semibold">
              Import external wallet
            </Text>
            <Text className="text-theme-neutrals-400 text-xs mt-2">
              Social logins are recommended. This tool is for importing existing
              accounts from
              <Text
                className="text-blue-400"
                onPress={() => openInApp(WEBSITE_LINK)}
              >
                {" "}
                dehub.io
              </Text>
              .
            </Text>
          </View>

          <View className="px-5 mb-3">
            <Text className="text-theme-neutrals-500 text-xs mb-2">
              Private key
            </Text>
            <View className="flex-row items-center rounded-xl border border-theme-neutrals-700 bg-theme-neutrals-900 px-3 py-2">
              <TextInput
                value={privateKey}
                onChangeText={setPrivateKey}
                placeholder="0x... (64 hex)"
                placeholderTextColor="#6B7280"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showPk}
                className="flex-1 text-white text-sm"
              />
              <TouchableOpacity
                onPress={() => setShowPk((s) => !s)}
                className="pl-2 py-1"
              >
                <Ionicons
                  name={showPk ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color="#9CA3AF"
                />
              </TouchableOpacity>
            </View>
            {clipboardPk && !privateKey ? (
              <TouchableOpacity
                onPress={() => setPrivateKey(clipboardPk)}
                className="mt-2 self-end"
              >
                <Text className="text-blue-400 text-xs">Paste from clipboard</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={handleImport}
              disabled={!isPkValid || busy}
              className={`mt-3 rounded-xl px-4 py-3 items-center active:opacity-80 bg-theme-accent`}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white text-sm">Import</Text>
              )}
            </TouchableOpacity>
          </View>

          <View className="px-5 mt-2">
            <View className="flex-row items-center my-2">
              <View className="flex-1 h-[1px] bg-theme-neutrals-800" />
              <Text className="mx-3 text-theme-neutrals-500 text-[11px] uppercase tracking-wider">
                Accounts on this device
              </Text>
              <View className="flex-1 h-[1px] bg-theme-neutrals-800" />
            </View>
          </View>

          <View className="px-5">
            {accounts.length === 0 ? (
              <Text className="text-theme-neutrals-500 text-xs text-center mt-3 mb-6">
                No imported accounts yet.
              </Text>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: LIST_MAX_HEIGHT }}
                contentContainerStyle={{ paddingBottom: 12 }}
              >
                {accounts.map((item) => (
                  <View
                    key={item.address}
                    className="py-3 border-b border-theme-neutrals-800 flex-row items-center justify-between"
                  >
                    <View>
                      <Text className="text-white text-sm font-medium">
                        {item.username || "Imported account"}
                      </Text>
                      <Text className="text-theme-neutrals-500 text-xs">
                        {miniAddress(item.address)}
                      </Text>
                    </View>
                    <View className="flex-row items-center">
                      <TouchableOpacity
                        onPress={() => handleUse(item.address)}
                        className="px-3 py-2 rounded-lg bg-theme-neutrals-800 mr-2"
                      >
                        <Text className="text-white text-xs">Use</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDelete(item.address)}
                        className="p-2 rounded-lg bg-theme-neutrals-900"
                      >
                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

          <View className="px-5 py-4">
            <Text className="text-theme-neutrals-500 text-[11px] text-center">
              Learn more at
              <Text
                className="text-blue-400"
                onPress={() => openInApp(WEBSITE_LINK)}
              >
                {" "}
                dehub.io
              </Text>
            </Text>
          </View>
        </View>
      </GlassModal>
      );
    }
  );

ImportWalletModal.displayName = "ImportWalletModal";
export default ImportWalletModal;
