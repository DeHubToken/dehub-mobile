import React from "react";
import { View, Text, Image } from "react-native";
import { useTranslation } from "react-i18next";
import baseIcon from "../../assets/chains/base-icon.png";
import dhbIcon from "../../assets/tokens/DHB.png";

type Props = {
  transfersTotal?: number | null;
  supplyAmount?: number | null;
};

const Card: React.FC<{
  title: string;
  children: React.ReactNode;
  className?: string;
}> = ({ title, children, className }) => (
  <View
    className={`bg-theme-neutrals-800 rounded-xl p-4 border border-theme-neutrals-700/60 ${
      className || ""
    }`}
  >
    <Text className="text-white font-semibold mb-2 tracking-wide">{title}</Text>
    {children}
  </View>
);

const DpayInfoCards: React.FC<Props> = ({ transfersTotal, supplyAmount }) => {
  const { t } = useTranslation();
  return (
    <View className="flex-row gap-3 my-4">
      <Card title={t("dpay.transfersSummary")} className="flex-1">
        <View className="flex-row items-center mb-2">
          <View className="flex-row items-center">
            <Image source={baseIcon} className="w-6 h-6 rounded-full" />
            <Image
              source={dhbIcon}
              className="w-6 h-6 rounded-full -ml-4 border border-theme-neutrals-900"
            />
          </View>
          <Text className="text-zinc-300 text-lg font-semibold ml-2">DHB</Text>
        </View>
        <Text className="text-theme-accent text-2xl font-bold">
          {typeof transfersTotal === "number"
            ? transfersTotal.toLocaleString()
            : "—"}
        </Text>
      </Card>
      <Card title={t("dpay.availableToBuy")} className="flex-1">
        <View className="flex-row items-center mb-2">
          <View className="flex-row items-center">
            <Image source={baseIcon} className="w-6 h-6 rounded-full" />
            <Image
              source={dhbIcon}
              className="w-6 h-6 rounded-full -ml-4 border border-theme-neutrals-900"
            />
          </View>
          <Text className="text-zinc-300 text-lg font-semibold ml-2">DHB</Text>
        </View>
        {typeof supplyAmount === "number" ? (
          supplyAmount === 0 ? (
            <Text className="text-zinc-300 text-sm">
              DHB : <Text className="text-[#F4F4F5]">{t("dpay.noSupplyShort")}</Text>
            </Text>
          ) : (
            <Text className="text-theme-accent text-2xl font-bold">
              {supplyAmount.toLocaleString(undefined, {
                maximumFractionDigits: 4,
              })}
            </Text>
          )
        ) : (
          <Text className="text-zinc-400 text-sm">DHB : —</Text>
        )}
      </Card>
    </View>
  );
};

export default DpayInfoCards;
