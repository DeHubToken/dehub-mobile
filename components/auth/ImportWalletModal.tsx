import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Dimensions, StyleSheet } from "react-native";
import GlassModal from "../ui/GlassModal";
import {
  AuthButton,
  AuthDivider,
  AuthField,
  AuthIconButton,
  AuthTextButton,
  authColors,
  authText,
} from "./AuthControls";
import { deriveAddressFromPrivateKey } from "../../libs/wallet.utils";
import { listLocalAccounts, removeLocalAccount, LocalAccount, getPrivateKeyForAddress, upsertLocalAccount } from "../../libs/wallets.local";
import { isWalletSignupBlocked, reportWalletSignupBlocked } from "../../libs/walletSignupGate";
import { miniAddress } from "../../libs/strings.util";
import * as Clipboard from "expo-clipboard";
import { openInApp } from "../../libs/links.utils";
import { WEBSITE_LINK } from "../../config";
import { ChainId } from "../../config/constants";
import { SUPPORTED_NETWORKS } from "../../config/web3.constants";
import { createLocalEip1193Provider } from "../../services/localwallet.provider";
import { setSigningProvider, setEoaSigningProvider, clearSigningProvider } from "../../libs/provider.registry";
import { useAuthState, useAuthActions } from "../../context/AuthContext";
import { toastError, toastInfo, toastWarning } from "../../libs";
import { getPreferredChainId } from "../../libs/auth.utils";

export interface ImportWalletModalProps {
  visible: boolean;
  onClose: () => void;
}

const TARGET_CHAIN_ID = ChainId.BASE_MAINNET;
const LIST_MAX_HEIGHT = Math.round(Dimensions.get("window").height * 0.45);

const ImportWalletModal: React.FC<ImportWalletModalProps> = memo(
  ({ visible, onClose }) => {
    const { isLoading: authLoading, needsUsername } = useAuthState();
    const { signInWithWallet } = useAuthActions();
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
      // Declared out here so the catch can roll back a persisted account.
      let address: string | undefined;
      try {
        setIsImporting(true);
        address = deriveAddressFromPrivateKey(privateKey)?.toLowerCase();
        if (!address) throw new Error("Invalid private key");
        // Choose preferred chain (fallback to Base) for local EIP-1193 provider
        const preferred = await getPreferredChainId();
        const effectiveChainId = preferred ?? TARGET_CHAIN_ID;
        const net = SUPPORTED_NETWORKS[effectiveChainId] || SUPPORTED_NETWORKS[ChainId.BASE_MAINNET];
        const rpcUrl = net?.rpcUrls?.[0] || SUPPORTED_NETWORKS[ChainId.BASE_MAINNET]?.rpcUrls?.[0] || "https://mainnet.base.org";
        const chainIdHex = (net?.chainId as string) || ('0x' + Number(effectiveChainId).toString(16)) || "0x2105";
        const localProvider = createLocalEip1193Provider({ privateKey, rpcUrl, chainIdHex });
        setSigningProvider(localProvider);
        setEoaSigningProvider(localProvider);
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
        // A wallet the server refused to open an account for must not be left
        // sitting in the device's local account list with its private key —
        // the import is persisted before sign-in so the signer is available,
        // which means a refusal has to undo it.
        if (address && isWalletSignupBlocked(e)) {
          await removeLocalAccount(address).catch(() => {});
        }
        if (!reportWalletSignupBlocked(e)) {
          toastError(e, "Could not import wallet");
        }
      } finally {
        setIsImporting(false);
      }
    }, [isPkValid, privateKey, refresh, signInWithWallet, onClose]);

    const handleUse = useCallback(
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
          setEoaSigningProvider(localProvider);
          try {
            await signInWithWallet(address, effectiveChainId, pk);
            // Ensure the account is persisted with its private key (idempotent)
            await upsertLocalAccount({ address, privateKey: pk });
            onClose();
          } finally {
            clearSigningProvider();
          }
        } catch (e: any) {
          if (!reportWalletSignupBlocked(e)) {
            toastError(e, "Failed to use this account");
          }
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
        <View style={styles.sheet}>
          <Text style={authText.modalTitle}>Import external wallet</Text>
          <Text style={[authText.caption, { marginTop: 8, marginBottom: 20 }]}>
            Social logins are recommended. This tool is for importing existing accounts from{" "}
            <Text style={styles.link} onPress={() => openInApp(WEBSITE_LINK)}>
              dehub.io
            </Text>
            .
          </Text>

          <AuthField
            label="Private key"
            value={privateKey}
            onChangeText={setPrivateKey}
            placeholder="0x… (64 hex)"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!showPk}
            trailing={
              <AuthIconButton
                icon={showPk ? "eye-off-outline" : "eye-outline"}
                onPress={() => setShowPk((s) => !s)}
                accessibilityLabel={showPk ? "Hide private key" : "Show private key"}
              />
            }
          />
          {clipboardPk && !privateKey ? (
            <AuthTextButton
              label="Paste from clipboard"
              onPress={() => setPrivateKey(clipboardPk)}
              tone="default"
              align="end"
            />
          ) : null}
          <AuthButton
            variant="primary"
            icon="key"
            label="Import"
            onPress={handleImport}
            disabled={!isPkValid}
            loading={busy}
            style={{ marginTop: 12 }}
          />

          <AuthDivider label="Accounts on this device" />

          {accounts.length === 0 ? (
            <Text style={[authText.caption, { textAlign: "center", marginBottom: 12 }]}>
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
                <View key={item.address} style={styles.accountRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.accountName}>
                      {item.username || "Imported account"}
                    </Text>
                    <Text style={authText.caption}>{miniAddress(item.address)}</Text>
                  </View>
                  <View style={styles.accountActions}>
                    <AuthButton
                      label="Use"
                      onPress={() => handleUse(item.address)}
                      disabled={busy}
                      style={styles.useButton}
                      accessibilityLabel={`Use account ${item.username || miniAddress(item.address)}`}
                    />
                    <AuthIconButton
                      icon="trash-outline"
                      onPress={() => handleDelete(item.address)}
                      disabled={busy}
                      accessibilityLabel={`Remove account ${item.username || miniAddress(item.address)}`}
                    />
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          <Text style={[authText.caption, { textAlign: "center", marginTop: 16 }]}>
            Learn more at{" "}
            <Text style={styles.link} onPress={() => openInApp(WEBSITE_LINK)}>
              dehub.io
            </Text>
          </Text>
        </View>
      </GlassModal>
      );
    }
  );

ImportWalletModal.displayName = "ImportWalletModal";

const styles = StyleSheet.create({
  sheet: {
    maxHeight: "90%",
    padding: 24,
  },
  link: {
    color: authColors.label,
    textDecorationLine: "underline",
  },
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

export default ImportWalletModal;
