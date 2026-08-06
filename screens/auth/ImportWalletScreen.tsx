import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { useAuthState, useAuthActions } from "../../context/AuthContext";
import { deriveAddressFromPrivateKey } from "../../libs/wallet.utils";
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
import {
  AuthButton,
  AuthDivider,
  AuthField,
  AuthIconButton,
  AuthTextButton,
  authColors,
  authText,
} from "../../components/auth/AuthControls";
import ScreenHeader from "../../components/ScreenHeader";

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
    <SafeAreaView className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title="Import Wallet" onBackPress={handleGoBack} />
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
          {/* Wallet 3D Image */}
          <View className="items-center">
            <Image
              source={WALLET_3D_IMAGE}
              style={{ width: 180, height: 180 }}
              resizeMode="contain"
            />
          </View>

          {/* Header - overlaps with image shadow */}
          <View style={{ alignItems: "center", marginTop: -20, marginBottom: 24 }}>
            <Text style={[authText.title, { marginBottom: 8 }]}>
              Import Wallet (Optional)
            </Text>
            <Text style={[authText.body, { textAlign: "center", paddingHorizontal: 8 }]}>
              Social logins are recommended.{"\n"} This tool is for importing
              existing accounts from DeHub.io.
            </Text>
          </View>

          {/* Private Key Input */}
          <AuthField
            label="Private Key"
            value={privateKey}
            onChangeText={setPrivateKey}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!showPk}
            placeholder="Enter your private key"
            editable={!busy}
            trailing={
              <AuthIconButton
                icon={showPk ? "eye-off-outline" : "eye-outline"}
                onPress={() => setShowPk(!showPk)}
                accessibilityLabel={showPk ? "Hide private key" : "Show private key"}
              />
            }
          />

          {/* Paste from clipboard */}
          {clipboardPk && !privateKey && (
            <AuthTextButton
              label="Paste from clipboard"
              onPress={handlePasteFromClipboard}
              tone="default"
              align="end"
            />
          )}

          {/* Import Wallet Button */}
          <AuthButton
            variant="primary"
            label="Import Wallet"
            onPress={handleImport}
            disabled={!isPkValid}
            loading={busy}
            style={{ marginTop: 16 }}
          />

          {/* Learn More Link */}
          <AuthTextButton
            label="Learn more at dehub.io"
            onPress={handleLearnMore}
            style={{ marginTop: 8 }}
          />

          {/* Previously Imported Accounts */}
          {accounts.length > 0 && (
            <View style={{ marginTop: 8 }}>
              <AuthDivider label="Accounts on this device" />

              {accounts.map((account) => (
                <View key={account.address} style={styles.accountRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.accountName}>
                      {account.username || "Imported account"}
                    </Text>
                    <Text style={authText.caption}>{miniAddress(account.address)}</Text>
                  </View>
                  <View style={styles.accountActions}>
                    <AuthButton
                      label="Use"
                      onPress={() => handleUseAccount(account.address)}
                      disabled={busy}
                      style={styles.useButton}
                      accessibilityLabel={`Use account ${account.username || miniAddress(account.address)}`}
                    />
                    <AuthIconButton
                      icon="trash-outline"
                      onPress={() => handleDeleteAccount(account.address)}
                      disabled={busy}
                      accessibilityLabel={`Remove account ${account.username || miniAddress(account.address)}`}
                    />
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

const styles = StyleSheet.create({
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: authColors.hairline,
  },
  accountName: {
    color: authColors.label,
    fontSize: 14,
    fontWeight: "500",
  },
  accountActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  useButton: {
    width: "auto",
    minHeight: 44,
    paddingHorizontal: 16,
  },
});

export default ImportWalletScreen;
