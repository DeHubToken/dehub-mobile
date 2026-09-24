import React, { useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

type DpayAboutProps = {
  defaultOpen?: boolean;
};

const SectionRow: React.FC<{ icon: keyof typeof Ionicons.glyphMap; title: string; children: React.ReactNode }>
  = ({ icon, title, children }) => (
    <View className="mb-3">
      <View className="flex-row items-center mb-1">
        <Ionicons name={icon} size={14} color="#A6A9AC" />
        <Text className="text-white font-medium ml-2">{title}</Text>
      </View>
      <Text className="text-theme-neutrals-400 text-xs leading-5">
        {children as any}
      </Text>
    </View>
  );

const DpayAbout: React.FC<DpayAboutProps> = ({ defaultOpen = false }) => {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState<boolean>(defaultOpen);

  const toggle = React.useCallback(() => setOpen((v) => !v), []);

  return (
    <View className="mt-4 rounded-xl border border-theme-neutrals-700/60 bg-theme-neutrals-800">
      <TouchableOpacity
        onPress={toggle}
        activeOpacity={0.85}
        className="px-4 py-3 flex-row items-center justify-between"
      >
        <View>
          <Text className="text-white font-semibold">{t("dpay.aboutTitle")}</Text>
          {!open && (
            <Text className="text-theme-neutrals-400 text-[11px] mt-0.5">{t("dpay.aboutSubtitle")}</Text>
          )}
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color="#A6A9AC" />
      </TouchableOpacity>

      {open && (
        <View className="px-4 pb-4">
          <SectionRow icon="pricetag" title={t("dpay.aboutTokenTitle")}>
            {t("dpay.aboutTokenBody")}
          </SectionRow>
          <SectionRow icon="flash" title={t("dpay.aboutInstantTitle")}>
            {t("dpay.aboutInstantBody")}
          </SectionRow>
          <SectionRow icon="shield-checkmark" title={t("dpay.aboutSecureTitle")}>
            {t("dpay.aboutSecureBody")}
          </SectionRow>
        </View>
      )}
    </View>
  );
};

export default DpayAbout;
