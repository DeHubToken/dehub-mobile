import React, { useCallback, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, TextInput, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import i18n, { SUPPORTED_LANGUAGES, loadLanguage } from "../../i18n";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "user-preferred-language";

export type LanguageSelectModalProps = {
  visible: boolean;
  onClose: () => void;
};

const LanguageSelectModal: React.FC<LanguageSelectModalProps> = ({
  visible,
  onClose,
}) => {
  const [search, setSearch] = useState("");
  const { i18n: i18nHook, t } = useTranslation();
  const currentLang = i18nHook.language;
  const currentLangInfo = SUPPORTED_LANGUAGES.find(
    (l) => l.code === currentLang
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return SUPPORTED_LANGUAGES;
    const q = search.toLowerCase().trim();
    return SUPPORTED_LANGUAGES.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.nativeName.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q)
    );
  }, [search]);

  const handleSelect = useCallback(
    async (code: string) => {
      if (code === currentLang) {
        onClose();
        return;
      }
      try {
        await AsyncStorage.setItem(STORAGE_KEY, code);
        await loadLanguage(code);
        await i18n.changeLanguage(code);
      } catch {
        // silently fall back
      } finally {
        onClose();
      }
    },
    [currentLang, onClose]
  );

  return (
    <GlassModal
      visible={visible}
      onClose={onClose}
      presentation="bottom"
      maxHeight="82%"
      blurIntensity={30}
    >
      <View className="px-5 pt-4 pb-3 border-b border-white/10">
        <View className="flex-row items-center justify-between">
          <Text className="text-white font-bold text-base">{t("settings.language")}</Text>
          {currentLangInfo && (
            <View className="bg-theme-neutrals-700/60 rounded-full px-3 py-1 flex-row items-center">
              <Icon name="Globe" size={11} color="#9ca3af" />
              <Text className="text-theme-neutrals-300 text-[11px] ml-1.5 font-medium">
                {currentLangInfo.code.toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <Text className="text-theme-neutrals-500 text-xs mt-1">
          {t("settings.languageDesc")}
        </Text>
      </View>

      <View className="px-4 pb-4">
        {/* Search */}
        <View className="mt-4 bg-theme-neutrals-800 rounded-xl border border-theme-neutrals-700 flex-row items-center px-3">
          <Icon name="Search" size={14} color="#6b7280" />
          <TextInput
            className="flex-1 text-white text-sm py-2.5 ml-2"
            placeholder={t("settings.searchLanguages")}
            placeholderTextColor="#6b7280"
            value={search}
            onChangeText={setSearch}
            autoFocus={false}
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch("")}
              className="p-2 -mr-2"
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="X" size={14} color="#6b7280" />
            </TouchableOpacity>
          )}
        </View>

        {/* Language list */}
        <ScrollView
          style={{ maxHeight: 420, marginTop: 10 }}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View className="bg-theme-neutrals-800 rounded-xl border border-theme-neutrals-700 overflow-hidden">
            {filtered.map((lang, idx) => {
              const isActive = lang.code === currentLang;
              const isLast = idx === filtered.length - 1;

              return (
                <TouchableOpacity
                  key={lang.code}
                  onPress={() => handleSelect(lang.code)}
                  activeOpacity={0.7}
                  className={`px-4 py-3.5 flex-row items-center justify-between ${
                    isActive ? "bg-white/5" : ""
                  } ${!isLast ? "border-b border-theme-neutrals-700/60" : ""}`}
                >
                  <View className="flex-1 mr-3">
                    <Text
                      className={`text-sm ${
                        isActive ? "text-white font-semibold" : "text-theme-neutrals-200"
                      }`}
                    >
                      {lang.nativeName}
                    </Text>
                    <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                      {lang.name} · {lang.code}
                    </Text>
                  </View>
                  {isActive && (
                    <View className="w-5 h-5 rounded-full bg-white/10 items-center justify-center">
                      <Icon name="Check" size={12} color="#e5e7eb" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
            {filtered.length === 0 && (
              <View className="px-4 py-8 items-center">
                <Icon name="Search" size={22} color="#4b5563" />
                <Text className="text-theme-neutrals-500 text-sm mt-2">
                  {t("settings.noLanguagesFound")}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </GlassModal>
  );
};

export default LanguageSelectModal;
