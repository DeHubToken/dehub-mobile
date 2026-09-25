import React, { useState } from "react";
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { ethers } from "ethers";
import GlassModal from "../ui/GlassModal";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import AddressInputTools from "../common/AddressInputTools";
import { sanitizeAmountInput } from "../../libs/amount-input";
import { toastError, toastSuccess } from "../../libs/toast";
import { ARC_UNAVAILABLE, ARC_WALLET_LOCKED, sendArcUsdc } from "../../libs/arc-wallet";

interface ArcSendSheetProps {
  open: boolean;
  onClose: () => void;
  /** The session's Safe address — the account holding the USDC. */
  address: string;
  balance: number;
  onSent: () => void;
}

const ArcSendSheet: React.FC<ArcSendSheetProps> = ({ open, onClose, address, balance, onSent }) => {
  const { t } = useTranslation();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);

  const trimmedTo = to.trim();
  const validTo = ethers.utils.isAddress(trimmedTo);
  const toSelf = validTo && trimmedTo.toLowerCase() === address.toLowerCase();
  const value = Number(amount);
  const insufficient = value > balance;
  const canSend = validTo && !toSelf && value > 0 && !insufficient && !sending;

  const close = () => {
    if (sending) return;
    setTo("");
    setAmount("");
    onClose();
  };

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await sendArcUsdc(address, trimmedTo, amount);
      toastSuccess(t("transfer.sent"));
      onSent();
      setTo("");
      setAmount("");
      onClose();
    } catch (e: any) {
      const message =
        e?.message === ARC_WALLET_LOCKED
          ? t("transfer.unlockToSend")
          : e?.message === ARC_UNAVAILABLE
          ? t("transfer.arcUnavailable")
          : e;
      toastError(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <GlassModal visible={open} onClose={close} presentation="center" blurIntensity={40}>
      <View className="p-6 gap-5">
        <Text className="text-white font-bold text-2xl tracking-wider">{t("transfer.arcTitle")}</Text>
        <View>
          <Text className="text-base text-white mb-2">
            {t("transfer.enterAmount")} <Text className="text-theme-accent font-semibold">USDC</Text>
          </Text>
          <TextInput
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor="#8B8D90"
            value={amount}
            onChangeText={(v) => setAmount(sanitizeAmountInput(v))}
            className="border border-theme-neutrals-700 rounded-lg px-3 h-12 text-white text-base"
          />
          <Text className="text-[11px] text-white/60 mt-2">
            {t("transfer.balance", { balance: balance.toLocaleString(undefined, { maximumFractionDigits: 6 }) })} USDC
          </Text>
          <Text className="text-[11px] text-white/50 mt-1">{t("transfer.arcFeeNote")}</Text>
          {insufficient && <Text className="text-xs text-white/80 mt-1">{t("transfer.insufficient")}</Text>}
        </View>
        <View>
          <Text className="text-white text-base font-semibold mb-2">{t("transfer.recipientAddress")}</Text>
          <TextInput
            placeholder="0x…"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            placeholderTextColor="#8B8D90"
            value={to}
            onChangeText={setTo}
            className="border border-theme-neutrals-700 rounded-lg px-3 h-12 text-white text-base"
          />
          <AddressInputTools scan onValue={setTo} />
          {!!trimmedTo && !validTo && (
            <Text className="text-xs text-white/80 mt-1">{t("transfer.invalidAddress")}</Text>
          )}
          {toSelf && <Text className="text-xs text-white/80 mt-1">{t("transfer.toSelfHint")}</Text>}
        </View>
        <View className="flex-row items-center justify-center gap-3">
          <AccentButtonGradient>
            <TouchableOpacity
              disabled={!canSend}
              onPress={handleSend}
              className={`flex-row items-center gap-2 px-5 h-11 rounded-xl bg-transparent ${!canSend ? "opacity-60" : ""}`}
            >
              {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="arrow-up" size={18} color="#fff" />}
              <Text className="text-white font-semibold">
                {sending ? t("transfer.transferring") : t("assets.send")}
              </Text>
            </TouchableOpacity>
          </AccentButtonGradient>
          <TouchableOpacity
            disabled={sending}
            onPress={close}
            className={`px-5 h-11 rounded-xl bg-theme-neutrals-700 items-center justify-center ${sending ? "opacity-60" : ""}`}
          >
            <Text className="text-white font-semibold">{t("common.cancel")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </GlassModal>
  );
};

export default ArcSendSheet;
