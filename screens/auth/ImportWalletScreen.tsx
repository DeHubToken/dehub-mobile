import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useAuthState, useAuthActions } from "../../context/AuthContext";
import { deriveAddressFromPrivateKey } from "../../config/web3auth.config";
import {
  upsertLocalAccount,
  listLocalAccounts,
  removeLocalAccount,
  getPrivateKeyForAddress,
  LocalAccount,
} from "../../libs/wallets.local";
import { miniAddress } from "../../libs/strings.util";
import { toastError, toastInfo, toastWarning } from "../../libs";
import { openInApp } from "../../libs/links.utils";
import { WEBSITE_LINK } from "../../config";
import { ChainId } from "../../config/constants";
import { SUPPORTED_NETWORKS } from "../../config/web3.constants";
import { createLocalEip1193Provider } from "../../services/localwallet.provider";
import {
  setSigningProvider,
  clearSigningProvider,
} from "../../libs/provider.registry";
import { getPreferredChainId } from "../../libs/auth.utils";
import AccentButtonGradient from "../../components/ui/AccentButtonGradient";

// 3D wallet image
const WALLET_3D_IMAGE = require("../../assets/onboarding/wallet-3d.png");

const TARGET_CHAIN_ID = ChainId.BASE_MAINNET;

interface ImportWalletScreenProps {
  navigation: any;
}

const ImportWalletScreen: React.FC<ImportWalletScreenProps> = ({
  navigation,
}) => {
  const { isLoading: authLoading, needsUsername } = useAuthState();
  const { signInWithWallet } = useAuthActions();

  const [privateKey, setPrivateKey] = useState("");
  const [showPk, setShowPk] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [accounts, setAccounts] = useState<LocalAccount[]>([]);
  const [clipboardPk, setClipboardPk] = useState<string | null>(null);

  const busy = (authLoading || isImporting) && !needsUsername;

  // Load accounts on mount
  const refresh = useCallback(async () => {
    const list = await listLocalAccounts();
    setAccounts(list);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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

  // Check clipboard for valid private key
  useEffect(() => {
    let mounted = true;
    const checkClipboard = async () => {
      try {
        const clip = await Clipboard.getStringAsync();
        const normalized = clip?.trim();
        if (normalized && validatePk(normalized)) {
          if (mounted) {
            setClipboardPk(
              normalized.startsWith("0x") ? normalized : `0x${normalized}`
            );
          }
        } else {
          if (mounted) setClipboardPk(null);
        }
      } catch {
        if (mounted) setClipboardPk(null);
      }
    };
    checkClipboard();
    return () => {
      mounted = false;
    };
  }, [validatePk]);

  const handlePasteFromClipboard = useCallback(() => {
    if (clipboardPk) {
      setPrivateKey(clipboardPk);
    }
  }, [clipboardPk]);

  const handleImport = useCallback(async () => {
    if (!isPkValid) return;
    try {
      setIsImporting(true);
      const address = deriveAddressFromPrivateKey(privateKey)?.toLowerCase();
      if (!address) throw new Error("Invalid private key");

      const preferred = await getPreferredChainId();
      const effectiveChainId = preferred ?? TARGET_CHAIN_ID;
      const net =
        SUPPORTED_NETWORKS[effectiveChainId] ||
        SUPPORTED_NETWORKS[ChainId.BASE_MAINNET];
      const rpcUrl =
        net?.rpcUrls?.[0] ||
        SUPPORTED_NETWORKS[ChainId.BASE_MAINNET]?.rpcUrls?.[0] ||
        "https://mainnet.base.org";
      const chainIdHex =
        (net?.chainId as string) ||
        "0x" + Number(effectiveChainId).toString(16) ||
        "0x2105";

      const localProvider = createLocalEip1193Provider({
        privateKey,
        rpcUrl,
        chainIdHex,
      });
      setSigningProvider(localProvider);

      try {
        await upsertLocalAccount({ address, privateKey });
        await signInWithWallet(address, effectiveChainId, privateKey);
        toastInfo("Wallet imported");
        setPrivateKey("");
        await refresh();
      } finally {
        clearSigningProvider();
      }
    } catch (e: any) {
      toastError(e, "Could not import wallet");
    } finally {
      setIsImporting(false);
    }
  }, [isPkValid, privateKey, signInWithWallet, refresh]);

  const handleUseAccount = useCallback(
    async (address: string) => {
      try {
        setIsImporting(true);
        const pk = await getPrivateKeyForAddress(address, {
          purpose: "Unlock this DeHub wallet to use it",
          onUnverified: () =>
            toastWarning(
              "This phone has no screen lock, so anyone holding it can use your wallet. Set a passcode or biometrics in your device settings.",
            ),
        });
        if (!pk) {
          toastError(
            "No private key stored for this account. Please re-import."
          );
          return;
        }

        const preferred = await getPreferredChainId();
        const effectiveChainId = preferred ?? TARGET_CHAIN_ID;
        const net =
          SUPPORTED_NETWORKS[effectiveChainId] ||
          SUPPORTED_NETWORKS[ChainId.BASE_MAINNET];
        const rpcUrl =
          net?.rpcUrls?.[0] ||
          SUPPORTED_NETWORKS[ChainId.BASE_MAINNET]?.rpcUrls?.[0] ||
          "https://mainnet.base.org";
        const chainIdHex =
          (net?.chainId as string) ||
          "0x" + Number(effectiveChainId).toString(16) ||
          "0x2105";

        const localProvider = createLocalEip1193Provider({
          privateKey: pk,
          rpcUrl,
          chainIdHex,
        });
        setSigningProvider(localProvider);

        try {
          await signInWithWallet(address, effectiveChainId, pk);
          await upsertLocalAccount({ address, privateKey: pk });
        } finally {
          clearSigningProvider();
        }
      } catch (e: any) {
        toastError(e, "Failed to use this account");
      } finally {
        setIsImporting(false);
      }
    },
    [signInWithWallet]
  );

  const handleDeleteAccount = useCallback(
    async (address: string) => {
      try {
        await removeLocalAccount(address);
        await refresh();
      } catch {
        // no-op
      }
    },
    [refresh]
  );

  const handleGoBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleLearnMore = useCallback(() => {
    openInApp(WEBSITE_LINK);
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-black">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          className="px-6"
        >
          {/* Back Button */}
          <TouchableOpacity
            onPress={handleGoBack}
            disabled={busy}
            className="flex-row items-center mt-2 mb-2"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={24} color="#9CA3AF" />
            <Text className="text-gray-400 text-base ml-1">Back</Text>
          </TouchableOpacity>

          {/* Wallet 3D Image */}
          <View className="items-center">
            <Image
              source={WALLET_3D_IMAGE}
              style={{ width: 180, height: 180 }}
              resizeMode="contain"
            />
          </View>

          {/* Header - overlaps with image shadow */}
          <View className="items-center mb-4" style={{ marginTop: -20 }}>
            <Text className="text-white text-2xl font-bold mb-2">
              Import Wallet (Optional)
            </Text>
            <Text className="text-gray-400 text-center text-sm px-2">
              Social logins are recommended.{"\n"} This tool is for importing
              existing accounts from DeHub.io.
              {/* Only for users with existing DeHub.io wallets.{"\n"}
              You can skip this and we will create a secure{"\n"}
              wallet for you automatically. */}
            </Text>
          </View>

          {/* Private Key Input */}
          <View className="mb-2">
            <Text className="text-white text-sm font-medium mb-2">
              Private Key
            </Text>
            <View
              className="flex-row items-center border border-neutral-700 rounded-xl bg-neutral-900 px-4"
              style={{ height: 56 }}
            >
              <TextInput
                value={privateKey}
                onChangeText={setPrivateKey}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showPk}
                placeholder="Enter your private key"
                placeholderTextColor="#6B7280"
                className="flex-1 text-white text-base"
                editable={!busy}
              />
              <TouchableOpacity
                onPress={() => setShowPk(!showPk)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={showPk ? "eye-off-outline" : "eye-outline"}
                  size={22}
                  color="#9CA3AF"
                />
              </TouchableOpacity>
            </View>

            {/* Paste from clipboard */}
            {clipboardPk && !privateKey && (
              <TouchableOpacity
                onPress={handlePasteFromClipboard}
                className="mt-2 self-end"
              >
                <Text className="text-blue-400 text-sm">
                  Paste from clipboard
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Learn More Link */}
          <TouchableOpacity
            onPress={handleLearnMore}
            className="flex-row items-center justify-center my-4"
          >
            <Text className="text-gray-400 text-sm">
              Learn more at dehub.io
            </Text>
            <Ionicons
              name="open-outline"
              size={14}
              color="#9CA3AF"
              style={{ marginLeft: 4 }}
            />
          </TouchableOpacity>

          {/* Import Wallet Button */}
          <View className="items-center mb-4">
            <TouchableOpacity
              disabled={!isPkValid || busy}
              onPress={handleImport}
              style={{
                width: "100%",
                maxWidth: 280,
                opacity: !isPkValid || busy ? 0.5 : 1,
              }}
              accessibilityLabel="Import Wallet"
            >
              <AccentButtonGradient
                borderRadius={14}
                style={{
                  paddingVertical: 16,
                  alignItems: "center",
                }}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-semibold text-base">
                    Import Wallet
                  </Text>
                )}
              </AccentButtonGradient>
            </TouchableOpacity>
          </View>

          {/* Previously Imported Accounts */}
          {accounts.length > 0 && (
            <View className="mt-2">
              {/* Divider */}
              <View className="flex-row items-center my-3">
                <View className="flex-1 h-[1px] bg-neutral-700" />
                <Text className="mx-3 text-gray-500 text-xs uppercase tracking-wider">
                  Accounts on this device
                </Text>
                <View className="flex-1 h-[1px] bg-neutral-700" />
              </View>

              {/* Account List */}
              {accounts.map((account) => (
                <View
                  key={account.address}
                  className="flex-row items-center justify-between py-3 border-b border-neutral-800"
                >
                  <View className="flex-1">
                    <Text className="text-white text-sm font-medium">
                      {account.username || "Imported account"}
                    </Text>
                    <Text className="text-gray-500 text-xs">
                      {miniAddress(account.address)}
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <TouchableOpacity
                      onPress={() => handleUseAccount(account.address)}
                      disabled={busy}
                      className="px-4 py-2 rounded-lg bg-neutral-800 mr-2"
                    >
                      <Text className="text-white text-sm">Use</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteAccount(account.address)}
                      disabled={busy}
                      className="p-2 rounded-lg bg-neutral-900"
                    >
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color="#EF4444"
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Spacer */}
          <View className="flex-1 min-h-[20px]" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default ImportWalletScreen;
