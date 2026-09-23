import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, TouchableOpacity, View } from "react-native";
import GlassModal from "../ui/GlassModal";
import DpayTopUpForm from "./DpayTopUpForm";
import NearIntentBuy from "./NearIntentBuy";

export default function BuyDhbSheet({ visible, onClose, onDelivered, initialMethod = "card" }: {
  visible: boolean;
  onClose: () => void;
  onDelivered?: () => void;
  initialMethod?: "card" | "crypto";
}) {
  const [method, setMethod] = useState<"card" | "crypto">(initialMethod);
  const { t } = useTranslation();
  const delivered = () => { onDelivered?.(); onClose(); };
  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom" maxHeight="90%" scrollable>
      <View className="p-5">
        <Text className="text-white text-2xl font-bold mb-1">{t("superpowers.getDhb")}</Text>
        <Text className="text-white/60 text-xs mb-4">{t("superpowers.holdToUnlock")}</Text>
        <View className="flex-row gap-2 mb-4">
          {(["card", "crypto"] as const).map(option => (
            <TouchableOpacity key={option} onPress={() => setMethod(option)}
              className={`flex-1 h-11 rounded-xl border items-center justify-center ${method === option ? "bg-white/20 border-white/40" : "bg-white/5 border-white/10"}`}>
              <Text className="text-white font-semibold">{option === "card" ? "Card" : "Crypto"}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {method === "card" ? <DpayTopUpForm embedded onDelivered={delivered} /> :
          <NearIntentBuy active initialDhbAmount={1} onDelivered={delivered} />}
        <TouchableOpacity onPress={onClose} className="h-11 mt-4 rounded-xl bg-white/10 items-center justify-center">
          <Text className="text-white font-semibold">{t("profile.back")}</Text>
        </TouchableOpacity>
      </View>
    </GlassModal>
  );
}
