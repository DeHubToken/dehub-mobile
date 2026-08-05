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
} from "react-native";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import { useAuthActions, useProvider } from "../../context/AuthContext";
import { copyToClipboard, toastError, toastInfo, apiClient } from "../../libs";
import { deriveAddressFromPrivateKey } from "../../config/web3auth.config";
import Icon from "../ui/Icon";

type ExportPrivateKeyModalProps = {
  visible: boolean;
  onClose: () => void;
};

type Step = "warn" | "reveal";

const REQUIRED_PHRASE = "I UNDERSTAND";

const ExportPrivateKeyModal: React.FC<ExportPrivateKeyModalProps> = ({
  visible,
  onClose,
}) => {
  const { t } = useTranslation();
  const { ensureProvider } = useAuthActions();
  const { providerStatus, provider, authMethod } = useProvider();
  const isLocal = useMemo(() => authMethod === 'local', [authMethod]);
  const [step, setStep] = useState<Step>("warn");
  const [confirmText, setConfirmText] = useState<string>("");
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [masked, setMasked] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const copyTimerRef = useRef<NodeJS.Timeout | null>(null);

  const canContinue = useMemo(
    () => confirmText.trim().toUpperCase() === REQUIRED_PHRASE,
    [confirmText]
  );

  const reset = useCallback(() => {
    setStep("warn");
    setConfirmText("");
    setIsFetching(false);
    setError("");
    setPrivateKey(null);
    setMasked(true);
  }, []);

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
      const ready = providerStatus === "ready" && provider;
      if (!ready) throw new Error("Wallet provider is not ready");
      const pk = await (provider as any)?.request?.({ method: "private_key" });
      if (!pk || typeof pk !== "string")
        throw new Error("Could not retrieve private key");
      setPrivateKey(pk);
      setStep("reveal");
      // Fire-and-forget tracking call (authenticated)
      void apiClient
        .get("/private_key/exported", { isAuthRequired: true })
        .catch(() => {});
    } catch (e: any) {
      console.error("[ExportPrivateKey] fetch error", e);
      setError(e?.message || t("settings.exportPkFailed"));
      toastError(e?.message || t("settings.exportPkFailed"));
    } finally {
      setIsFetching(false);
    }
  }, [ensureProvider, providerStatus, provider, isLocal, t]);

  const handleProceed = useCallback(() => {
    if (!isLocal) {
      toastInfo(t("settings.exportPkNotAvailable"));
      return;
    }
    if (!canContinue) {
      toastInfo(t("settings.exportPkTypeToProceed", { phrase: REQUIRED_PHRASE }));
      return;
    }
    void fetchPrivateKey();
  }, [canContinue, fetchPrivateKey, isLocal, t]);

  const toggleMasked = useCallback(() => {
    setMasked((m) => !m);
  }, []);

  const handleCopyPk = useCallback(() => {
    if (!privateKey) return;
    copyToClipboard(privateKey);
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
      maxHeight="75%"
      blurIntensity={30}
    >
      <View className="p-4">
        {step === "warn" && (
          <>
            <Text className="text-white font-bold text-lg mb-2">
              {t("settings.exportPrivateKey")}
            </Text>
            {isLocal ? (
              <>
                <Text className="text-red-400 text-sm mb-2">
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
                  {t("settings.exportPkTypeToContinue", { phrase: REQUIRED_PHRASE })}
                </Text>
                <TextInput
                  value={confirmText}
                  onChangeText={setConfirmText}
                  placeholder={REQUIRED_PHRASE}
                  placeholderTextColor="#8B8D90"
                  className="border border-theme-neutrals-700 rounded-md px-3 py-2 text-white bg-theme-neutrals-800"
                />
                {error ? (
                  <Text className="text-red-500 text-xs mt-2">{error}</Text>
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
                  <Text className="text-red-500 text-xs mt-2">{error}</Text>
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
              {t("settings.yourPrivateKey")}
            </Text>
            {address ? (
              <Text className="text-theme-neutrals-400 text-xs mb-2">
                {t("settings.addressLabel")}: {address}
              </Text>
            ) : null}
            <View className="flex-row items-center bg-black/50 rounded-md p-3 border border-theme-neutrals-700 mb-3">
              <TouchableOpacity
                onPress={toggleMasked}
                className="mr-3 p-1"
                accessibilityRole="button"
                accessibilityLabel={masked ? "Reveal private key" : "Hide private key"}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon name={masked ? "Eye" : "EyeOff"} size={18} color="#e5e7eb" />
              </TouchableOpacity>
              <Text
                selectable
                className="text-theme-neutrals-200 text-xs flex-1"
                numberOfLines={1}
              >
                {masked ? maskedPk : privateKey}
              </Text>
              <TouchableOpacity
                onPress={handleCopyPk}
                className="ml-3 p-1"
                accessibilityRole="button"
                accessibilityLabel="Copy private key"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon
                  name={copied ? "Check" : "Copy"}
                  size={18}
                  color={copied ? "#22C55E" : "#e5e7eb"}
                />
              </TouchableOpacity>
            </View>
            <View className="flex-row justify-end">
              <TouchableOpacity
                onPress={handleClose}
                className="h-11 px-4 rounded-xl items-center justify-center bg-theme-neutrals-700"
              >
                <Text className="text-white">{t("common.done")}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </GlassModal>
  );
};

export default ExportPrivateKeyModal;
