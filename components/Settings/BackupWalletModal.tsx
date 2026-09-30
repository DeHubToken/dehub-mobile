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
  ActivityIndicator,
  TextInput,
  ScrollView,
} from "react-native";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import { useAuthActions, useProvider } from "../../context/AuthContext";
import { copySecretToClipboard, toastError, toastInfo, apiClient } from "../../libs";
import { deriveAddressFromPrivateKey } from "../../libs/wallet.utils";
import Icon from "../ui/Icon";
import { useSecureScreen } from "../../hooks/useSecureScreen";
import { AuthButton, AuthErrorNotice, AuthField, AuthTextButton, authColors, authText } from "../auth/AuthControls";
import { RecoveryPhraseGrid, RecoveryPhraseWarnings } from "../auth/RecoveryPhrase";
import { getSupabaseUserId } from "../../services/auth/supabaseAuth.service";
import { fetchWalletReliably } from "../../libs/wallet-core/store";
import { decryptString, getPayloadKdf, type EncryptedPayload } from "../../libs/wallet-core/crypto";
import { hasBiometricWrapKey, unlockWithBiometrics } from "../../libs/wallet-core/biometric-unlock";
import { deriveFromSecret, isValidMnemonic } from "../../libs/wallet-core/derive";
import { markBackedUp } from "../../libs/wallet-core/backup-status";
import { createLogger } from "../../libs/logger";

const log = createLogger("BackupWalletModal");

type BackupWalletModalProps = {
  visible: boolean;
  onClose: () => void;
  /** The 12 words were shown, and the backup was recorded at this time. */
  onBackedUp?: (backedUpAt: string) => void;
};

type Step = "warn" | "reveal";

/**
 * Where the 12 words stand once the private key is in hand. The words live
 * only in the cloud row, encrypted, so showing them means opening it again:
 * with this phone's biometric key, or with the wallet password.
 *  - none: no phrase behind this wallet (imported from a key, or no cloud row)
 *    — only the private key is offered.
 */
type Words =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "biometric" }
  | { kind: "password"; payload: EncryptedPayload }
  | { kind: "ready"; phrase: string };

const BackupWalletModal: React.FC<BackupWalletModalProps> = ({
  visible,
  onClose,
  onBackedUp,
}) => {
  const { t } = useTranslation();
  // The phrase is typed in the reader's own language, so it is translated and
  // matched without regard to case — a locale may not have capitals at all.
  const requiredPhrase = t("settings.exportPkConfirmPhrase");
  const { ensureProvider } = useAuthActions();
  const { providerStatus, provider, authMethod } = useProvider();
  // The fetch below awaits ensureProvider() and then needs the provider that
  // call produced; the render closure still holds the pre-call value, which
  // made the first attempt fail whenever the provider was not already ready.
  const providerRef = useRef<{ status: typeof providerStatus; provider: typeof provider }>({
    status: providerStatus,
    provider,
  });
  providerRef.current = { status: providerStatus, provider };
  const isLocal = useMemo(() => authMethod === 'local', [authMethod]);
  const [step, setStep] = useState<Step>("warn");
  const [confirmText, setConfirmText] = useState<string>("");
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [masked, setMasked] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  useSecureScreen(visible, "export-private-key");
  const copyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [words, setWords] = useState<Words>({ kind: "loading" });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [walletPassword, setWalletPassword] = useState("");
  const [wordsBusy, setWordsBusy] = useState(false);
  const [wordsError, setWordsError] = useState<string | null>(null);
  // The cloud wallet the words belong to; the backup status is keyed on it.
  const walletRef = useRef<{ userId: string; ethAddress: string; payload: EncryptedPayload } | null>(null);
  const markedRef = useRef(false);
  // Bumped on every close, so a lookup still running from a closed sheet
  // cannot raise a biometric prompt or write into the next opening.
  const sessionRef = useRef(0);

  const canContinue = useMemo(
    () => confirmText.trim().toLocaleLowerCase() === requiredPhrase.trim().toLocaleLowerCase(),
    [confirmText, requiredPhrase]
  );

  const reset = useCallback(() => {
    setStep("warn");
    setConfirmText("");
    setIsFetching(false);
    setError("");
    setPrivateKey(null);
    setMasked(true);
    setWords({ kind: "loading" });
    setShowAdvanced(false);
    setWalletPassword("");
    setWordsBusy(false);
    setWordsError(null);
    walletRef.current = null;
    markedRef.current = false;
    sessionRef.current += 1;
  }, []);

  /** Accept a decrypted secret only if it is a phrase for THIS key. */
  const acceptSecret = useCallback((secret: string, pk: string) => {
    if (!isValidMnemonic(secret)) return false;
    try {
      if (deriveFromSecret(secret).ethPrivateKey.toLowerCase() !== pk.toLowerCase()) return false;
    } catch {
      return false;
    }
    setWords({ kind: "ready", phrase: deriveFromSecret(secret).secret });
    return true;
  }, []);

  const openWithBiometrics = useCallback(
    async (pk: string) => {
      const wallet = walletRef.current;
      if (!wallet) return;
      setWordsBusy(true);
      setWordsError(null);
      try {
        const secret = await unlockWithBiometrics(wallet.ethAddress, wallet.payload);
        if (!acceptSecret(secret, pk)) setWords({ kind: "none" });
      } catch (e) {
        log.warn("words:biometric-failed", e);
        setWords({ kind: "biometric" });
        setWordsError(t("walletSetup.biometricFailed"));
      } finally {
        setWordsBusy(false);
      }
    },
    [acceptSecret, t]
  );

  /**
   * Find the words behind the key just revealed. Anything that does not add
   * up — no identity, no row, a row for another wallet, a secret that is a
   * raw key — leaves the private key as the only thing to show.
   */
  const loadWords = useCallback(
    async (pk: string) => {
      const session = sessionRef.current;
      setWords({ kind: "loading" });
      try {
        const userId = await getSupabaseUserId();
        if (!userId) return setWords({ kind: "none" });
        const { wallet } = await fetchWalletReliably(userId);
        if (session !== sessionRef.current) return;
        const pkAddress = deriveAddressFromPrivateKey(pk)?.toLowerCase();
        if (!wallet?.payload || !pkAddress || wallet.ethAddress.toLowerCase() !== pkAddress) {
          return setWords({ kind: "none" });
        }
        walletRef.current = { userId, ethAddress: wallet.ethAddress, payload: wallet.payload };
        if (getPayloadKdf(wallet.payload) === "hkdf") {
          if (!(await hasBiometricWrapKey(wallet.ethAddress))) return setWords({ kind: "none" });
          if (session !== sessionRef.current) return;
          setWords({ kind: "biometric" });
          await openWithBiometrics(pk);
          return;
        }
        setWords({ kind: "password", payload: wallet.payload });
      } catch (e) {
        log.warn("words:load-failed", e);
        setWords({ kind: "none" });
      }
    },
    [openWithBiometrics]
  );

  const openWithPassword = useCallback(async () => {
    if (words.kind !== "password" || !privateKey || !walletPassword || wordsBusy) return;
    setWordsBusy(true);
    setWordsError(null);
    try {
      const secret = await decryptString(words.payload, walletPassword);
      if (!acceptSecret(secret, privateKey)) setWords({ kind: "none" });
      setWalletPassword("");
    } catch {
      setWordsError(t("walletSetup.incorrectPassword"));
    } finally {
      setWordsBusy(false);
    }
  }, [words, privateKey, walletPassword, wordsBusy, acceptSecret, t]);

  /** Seeing the words is the backup. Recorded once per opening. */
  const handleWordsRevealed = useCallback(() => {
    const wallet = walletRef.current;
    if (!wallet || markedRef.current) return;
    markedRef.current = true;
    const at = new Date().toISOString();
    void markBackedUp(wallet.userId, wallet.ethAddress).then((ok) => {
      if (ok) onBackedUp?.(at);
      else markedRef.current = false;
    });
  }, [onBackedUp]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const fetchPrivateKey = useCallback(async () => {
    setIsFetching(true);
    setError("");
    try {
      if (!isLocal) {
        throw new Error(
          "Private keys cannot be exported for smart accounts. Use an imported/local wallet."
        );
      }
      await ensureProvider();
      // The provider lands in context state; give React a few frames to
      // commit it before giving up.
      let live = providerRef.current;
      for (let i = 0; i < 20 && !(live.status === "ready" && live.provider); i += 1) {
        await new Promise((r) => setTimeout(r, 50));
        live = providerRef.current;
      }
      const ready = live.status === "ready" && live.provider;
      if (!ready) throw new Error("Wallet provider is not ready");
      const pk = await (live.provider as any)?.request?.({ method: "private_key" });
      if (!pk || typeof pk !== "string")
        throw new Error("Could not retrieve private key");
      setPrivateKey(pk);
      setStep("reveal");
      void loadWords(pk);
      // Fire-and-forget tracking call (authenticated)
      void apiClient
        .get("/private_key/exported", { isAuthRequired: true })
        .catch(() => {});
    } catch (e: any) {
      log.error("fetch-private-key:failed", e);
      setError(e?.message || t("settings.exportPkFailed"));
      toastError(e?.message || t("settings.exportPkFailed"));
    } finally {
      setIsFetching(false);
    }
  }, [ensureProvider, providerStatus, provider, isLocal, t, loadWords]);

  const handleProceed = useCallback(() => {
    if (!isLocal) {
      toastInfo(t("settings.exportPkNotAvailable"));
      return;
    }
    if (!canContinue) {
      toastInfo(t("settings.exportPkTypeToProceed", { phrase: requiredPhrase }));
      return;
    }
    void fetchPrivateKey();
  }, [canContinue, fetchPrivateKey, isLocal, t, requiredPhrase]);

  const toggleMasked = useCallback(() => {
    setMasked((m) => !m);
  }, []);

  const handleCopyPk = useCallback(() => {
    if (!privateKey) return;
    void copySecretToClipboard(privateKey);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  }, [privateKey]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // (tracking moved into fetchPrivateKey success path)

  const address = useMemo(
    () => (privateKey ? deriveAddressFromPrivateKey(privateKey) : null),
    [privateKey]
  );
  const maskedPk = useMemo(
    () =>
      privateKey
        ? `${privateKey.slice(0, 6)}••••••••••••••••••••••${privateKey.slice(
            -4
          )}`
        : "",
    [privateKey]
  );

  return (
    <GlassModal
      visible={visible}
      onClose={handleClose}
      presentation="center"
      maxHeight="85%"
      blurIntensity={30}
    >
      <ScrollView
        style={{ flexShrink: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16 }}
      >
        {step === "warn" && (
          <>
            <Text className="text-white font-bold text-lg mb-2">
              {t("walletBackup.title")}
            </Text>
            {isLocal ? (
              <>
                <Text className="text-white/80 text-sm mb-2">
                  {t("settings.exportPkWarning")}
                </Text>
                <View className="bg-theme-neutrals-800 border border-theme-neutrals-700 rounded-lg p-3 mb-3">
                  <Text className="text-theme-neutrals-300 text-sm">
                    - {t("settings.exportPkBullet1")}
                  </Text>
                  <Text className="text-theme-neutrals-300 text-sm mt-1">
                    - {t("settings.exportPkBullet2")}
                  </Text>
                  <Text className="text-theme-neutrals-300 text-sm mt-1">
                    - {t("settings.exportPkBullet3")}
                  </Text>
                  <Text className="text-theme-neutrals-300 text-sm mt-1">
                    - {t("settings.exportPkBullet4")}
                  </Text>
                </View>
                <Text className="text-theme-neutrals-400 text-xs mb-1">
                  {t("settings.exportPkTypeToContinue", { phrase: requiredPhrase })}
                </Text>
                <TextInput
                  value={confirmText}
                  onChangeText={setConfirmText}
                  placeholder={requiredPhrase}
                  placeholderTextColor="#8B8D90"
                  className="border border-theme-neutrals-700 rounded-md px-3 py-2 text-white bg-theme-neutrals-800"
                />
                {error ? (
                  <Text className="text-white/80 text-xs mt-2">{error}</Text>
                ) : null}
                <View className="flex-row justify-end mt-4">
                  <TouchableOpacity
                    onPress={handleClose}
                    className="h-11 px-4 rounded-xl items-center justify-center bg-theme-neutrals-700 mr-2"
                  >
                    <Text className="text-white">{t("common.cancel")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={!canContinue || isFetching}
                    onPress={handleProceed}
                    className={`h-11 px-4 rounded-xl items-center justify-center bg-white/10 border border-white/20 ${
                      canContinue ? "" : "opacity-40"
                    } ${isFetching ? "opacity-80" : ""}`}
                  >
                    {isFetching ? (
                      <View className="flex-row items-center">
                        <ActivityIndicator color="#FFFFFF" size="small" />
                        <Text className="text-white font-semibold ml-2">
                          {t("settings.preparing")}
                        </Text>
                      </View>
                    ) : (
                      <Text className="text-white font-semibold">{t("settings.iUnderstand")}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View className="bg-theme-neutrals-800 border border-theme-neutrals-700 rounded-lg p-3 mb-3">
                  <Text className="text-theme-neutrals-300 text-sm">
                    {t("settings.exportPkSmartAccount1")}
                  </Text>
                  <Text className="text-theme-neutrals-300 text-sm mt-1">
                    {t("settings.exportPkSmartAccount2")}
                  </Text>
                </View>
                {error ? (
                  <Text className="text-white/80 text-xs mt-2">{error}</Text>
                ) : null}
                <View className="flex-row justify-end mt-2">
                  <TouchableOpacity
                    onPress={handleClose}
                    className="h-11 px-4 rounded-xl items-center justify-center bg-theme-neutrals-700"
                  >
                    <Text className="text-white">{t("common.close")}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </>
        )}

        {step === "reveal" && (
          <>
            <Text className="text-white font-bold text-lg mb-2">
              {t("walletBackup.title")}
            </Text>
            {address ? (
              <Text className="text-theme-neutrals-400 text-xs mb-3">
                {t("settings.addressLabel")}: {address}
              </Text>
            ) : null}

            {words.kind === "loading" && (
              <ActivityIndicator color={authColors.label} style={{ marginVertical: 24 }} />
            )}

            {words.kind === "ready" && (
              <>
                <Text style={[authText.emphasis, { marginBottom: 8 }]}>{t("walletBackup.tabWords")}</Text>
                <RecoveryPhraseGrid phrase={words.phrase} onReveal={handleWordsRevealed} />
                <RecoveryPhraseWarnings />
              </>
            )}

            {words.kind === "password" && (
              <>
                <Text style={[authText.emphasis, { marginBottom: 4 }]}>{t("walletBackup.tabWords")}</Text>
                <Text style={[authText.body, { marginBottom: 12 }]}>{t("walletBackup.passwordToShowWords")}</Text>
                <AuthField
                  label={t("walletSetup.walletPassword")}
                  value={walletPassword}
                  onChangeText={setWalletPassword}
                  placeholder={t("walletSetup.password")}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  textContentType="password"
                  autoComplete="current-password"
                  editable={!wordsBusy}
                  onSubmitEditing={openWithPassword}
                />
                <AuthErrorNotice message={wordsError} style={{ marginTop: 12 }} />
                <AuthButton
                  variant="primary"
                  label={t("walletBackup.showWords")}
                  onPress={openWithPassword}
                  disabled={!walletPassword}
                  loading={wordsBusy}
                  style={{ marginTop: 12 }}
                />
              </>
            )}

            {words.kind === "biometric" && (
              <>
                <Text style={[authText.emphasis, { marginBottom: 8 }]}>{t("walletBackup.tabWords")}</Text>
                <AuthErrorNotice message={wordsError} style={{ marginBottom: 12 }} />
                <AuthButton
                  variant="primary"
                  icon="finger-print"
                  label={t("walletBackup.showWords")}
                  onPress={() => privateKey && void openWithBiometrics(privateKey)}
                  loading={wordsBusy}
                />
              </>
            )}

            {/* The private key sits behind "Advanced" whenever there are words
                to offer; a wallet without them only has the key. */}
            {words.kind !== "none" && words.kind !== "loading" && (
              <AuthTextButton
                label={t("walletBackup.advanced")}
                onPress={() => setShowAdvanced((v) => !v)}
                tone="default"
                align="start"
                accessibilityLabel={t("walletBackup.advanced")}
                style={{ marginTop: 12 }}
              />
            )}

            {(words.kind === "none" || showAdvanced) && (
              <>
                <Text style={[authText.emphasis, { marginTop: 8, marginBottom: 8 }]}>
                  {t("walletBackup.tabPrivateKey")}
                </Text>
                <View className="flex-row items-center rounded-md p-3 border border-theme-neutrals-700 mb-3" style={{ backgroundColor: authColors.field }}>
                  <TouchableOpacity
                    onPress={toggleMasked}
                    className="mr-3 p-1"
                    accessibilityRole="button"
                    accessibilityLabel={masked ? t("auth.showPrivateKey") : t("auth.hidePrivateKey")}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Icon name={masked ? "Eye" : "EyeOff"} size={18} color={authColors.label} />
                  </TouchableOpacity>
                  <Text
                    selectable
                    className="text-theme-neutrals-200 text-xs flex-1"
                    // All 64 characters have to be readable to be written down.
                    numberOfLines={masked ? 1 : undefined}
                  >
                    {masked ? maskedPk : privateKey}
                  </Text>
                  <TouchableOpacity
                    onPress={handleCopyPk}
                    className="ml-3 p-1"
                    accessibilityRole="button"
                    accessibilityLabel={t("settings.exportPkCopy")}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Icon name={copied ? "Check" : "Copy"} size={18} color={authColors.label} />
                  </TouchableOpacity>
                </View>
                {words.kind === "none" && <RecoveryPhraseWarnings />}
              </>
            )}

            <View className="flex-row justify-end mt-4">
              <TouchableOpacity
                onPress={handleClose}
                className="h-11 px-4 rounded-xl items-center justify-center bg-theme-neutrals-700"
              >
                <Text className="text-white">{t("common.done")}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </GlassModal>
  );
};

export default BackupWalletModal;
