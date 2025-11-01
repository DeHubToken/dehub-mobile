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
import GlassModal from "../ui/GlassModal";
import { useAuth } from "../../context/AuthContext";
import { copyToClipboard, toastError, toastInfo, apiClient } from "../../libs";
import { deriveAddressFromPrivateKey } from "../../config/web3auth.config";
import { Ionicons } from "@expo/vector-icons";

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
  const { ensureProvider, providerStatus, provider } = useAuth();
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
      setError(e?.message || "Failed to export private key");
      toastError(e?.message || "Failed to export private key");
    } finally {
      setIsFetching(false);
    }
  }, [ensureProvider, providerStatus, provider]);

  const handleProceed = useCallback(() => {
    if (!canContinue) {
      toastInfo(`Type "${REQUIRED_PHRASE}" to proceed`);
      return;
    }
    void fetchPrivateKey();
  }, [canContinue, fetchPrivateKey]);

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
              Export Private Key
            </Text>
            <Text className="text-red-400 text-sm mb-2">
              Highly sensitive — handle with extreme care.
            </Text>
            <View className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 mb-3">
              <Text className="text-gray-300 text-sm">
                - Anyone with your private key can move your funds.
              </Text>
              <Text className="text-gray-300 text-sm mt-1">
                - Never share it. We will never ask for it.
              </Text>
              <Text className="text-gray-300 text-sm mt-1">
                - Store securely in a password manager or offline.
              </Text>
              <Text className="text-gray-300 text-sm mt-1">
                - We cannot recover lost funds or compromised keys.
              </Text>
            </View>
            <Text className="text-gray-400 text-xs mb-1">
              Type "{REQUIRED_PHRASE}" to continue
            </Text>
            <TextInput
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder={REQUIRED_PHRASE}
              placeholderTextColor="#6b7280"
              className="border border-zinc-700 rounded-md px-3 py-2 text-white bg-zinc-900"
            />
            {error ? (
              <Text className="text-red-500 text-xs mt-2">{error}</Text>
            ) : null}
            <View className="flex-row justify-end mt-4">
              <TouchableOpacity
                onPress={handleClose}
                className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 mr-2"
              >
                <Text className="text-white">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={!canContinue || isFetching}
                onPress={handleProceed}
                className={`px-3 py-2 rounded-lg ${
                  canContinue ? "bg-blue-600" : "bg-zinc-700"
                } ${isFetching ? "opacity-80" : ""}`}
              >
                {isFetching ? (
                  <View className="flex-row items-center">
                    <ActivityIndicator color="#FFFFFF" size="small" />
                    <Text className="text-white font-semibold ml-2">
                      Preparing…
                    </Text>
                  </View>
                ) : (
                  <Text className="text-white font-semibold">I Understand</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}

        {step === "reveal" && (
          <>
            <Text className="text-white font-bold text-lg mb-2">
              Your Private Key
            </Text>
            {address ? (
              <Text className="text-gray-400 text-xs mb-2">
                Address: {address}
              </Text>
            ) : null}
            <View className="flex-row items-center bg-black/50 rounded-md p-3 border border-zinc-800 mb-3">
              <TouchableOpacity onPress={toggleMasked} className="mr-3 p-1">
                <Ionicons
                  name={masked ? "eye-outline" : "eye-off-outline"}
                  size={18}
                  color="#e5e7eb"
                />
              </TouchableOpacity>
              <Text
                selectable
                className="text-gray-200 text-xs flex-1"
                numberOfLines={1}
              >
                {masked ? maskedPk : privateKey}
              </Text>
              <TouchableOpacity onPress={handleCopyPk} className="ml-3 p-1">
                <Ionicons
                  name={copied ? "checkmark-outline" : "copy-outline"}
                  size={18}
                  color={copied ? "#10b981" : "#e5e7eb"}
                />
              </TouchableOpacity>
            </View>
            <View className="flex-row justify-end">
              <TouchableOpacity
                onPress={handleClose}
                className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700"
              >
                <Text className="text-white">Done</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </GlassModal>
  );
};

export default ExportPrivateKeyModal;
