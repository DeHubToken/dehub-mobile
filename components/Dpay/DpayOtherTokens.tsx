import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { MOONPAY_CURRENCIES, createMoonPayBuyUrl } from "../../services";
import { openInApp } from "../../libs/links.utils";
import { toastError, toastSuccess } from "../../libs/toast";
import { theme } from "../../theme";

/**
 * The card rail for everything dpay does not stock. dpay sells DHB out of a hot
 * wallet; this sends the user to MoonPay for the chain's own assets, delivered
 * straight to their wallet.
 *
 * It carries its own amount rather than borrowing the top-up form's, because it
 * is a separate purchase of a different asset from a different provider -
 * sharing one figure across the two reads as one transaction when it is not.
 */
const MIN_AMOUNT = 5;

const DpayOtherTokens: React.FC = () => {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("50");
  const [pending, setPending] = useState<string | null>(null);

  const numericAmount = Number(amount);
  const amountIsValid = Number.isFinite(numericAmount) && numericAmount >= MIN_AMOUNT;

  const handleBuy = async (currencyCode: string) => {
    if (!amountIsValid) {
      toastError(t("buyCoins.minPurchase"));
      return;
    }
    setPending(currencyCode);
    try {
      const url = await createMoonPayBuyUrl({
        currencyCode,
        baseCurrencyAmount: numericAmount,
      });
      toastSuccess(t("buyCoins.redirecting"));
      await openInApp(url);
    } catch (error: any) {
      toastError(error?.message || t("buyCoins.failedPurchase"));
    } finally {
      setPending(null);
    }
  };

  return (
    <View className="bg-theme-neutrals-800 rounded-xl p-4 border border-theme-neutrals-700/60 my-4">
      <Text className="text-white font-semibold tracking-wide">
        {t("buyCoins.otherTokens")}
      </Text>
      <Text className="text-theme-neutrals-400 text-xs mt-1 mb-3">
        {t("buyCoins.otherTokensDesc")}
      </Text>

      <View className="flex-row items-center bg-theme-neutrals-900 rounded-xl px-3 mb-3 border border-theme-neutrals-700/60">
        <Text className="text-theme-neutrals-400 text-base mr-1">$</Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="50"
          placeholderTextColor={theme.colors.neutrals[500]}
          className="flex-1 text-white text-base py-3"
        />
      </View>

      <View className="flex-row gap-3">
        {MOONPAY_CURRENCIES.map((currency) => (
          <TouchableOpacity
            key={currency.code}
            onPress={() => handleBuy(currency.code)}
            disabled={pending !== null || !amountIsValid}
            className={`flex-1 flex-row items-center gap-2 rounded-xl px-3 py-3 bg-theme-neutrals-900 border border-theme-neutrals-700/60 ${
              pending !== null || !amountIsValid ? "opacity-50" : ""
            }`}
          >
            {pending === currency.code ? (
              <ActivityIndicator size="small" color={theme.colors.neutrals[100]} />
            ) : (
              <Ionicons name="card-outline" size={18} color={theme.colors.neutrals[100]} />
            )}
            <View className="flex-1">
              <Text className="text-white font-medium text-sm">{currency.symbol}</Text>
              <Text className="text-theme-neutrals-400 text-xs" numberOfLines={1}>
                {currency.name}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

export default DpayOtherTokens;
