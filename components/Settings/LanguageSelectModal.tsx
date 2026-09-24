import React, { useCallback, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, TextInput, ScrollView, DevSettings } from "react-native";
import * as Updates from "expo-updates";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import i18n, { SUPPORTED_LANGUAGES, loadLanguage, applyLayoutDirection } from "../../i18n";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { toastError } from "../../libs/toast";

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
      let needsReload = false;
      try {
        // Load before persisting: a locale that fails to load must not be
        // saved as the preference, or every launch comes up in English.
        const loaded = await loadLanguage(code);
        if (!loaded) throw new Error(`locale ${code} failed to load`);
        await AsyncStorage.setItem(STORAGE_KEY, code);
        await i18n.changeLanguage(code);
        needsReload = applyLayoutDirection(code);
      } catch {
        toastError(t("settings.languageLoadFailed"));
      } finally {
        onClose();
      }
      // Switching between a left-to-right and a right-to-left language only
      // takes effect after a restart; do it now rather than leave the screens
      // mirrored the wrong way until the next launch.
      if (needsReload) {
        Updates.reloadAsync().catch(() => DevSettings.reload());
      }
    },
    [currentLang, onClose, t]
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

      {/* Shrinkable, so GlassModal's 82% cap bounds the list instead of a fixed
          420pt that overflowed the sheet and clipped the bottom rows. */}
      <View className="px-4 pb-4" style={{ flexShrink: 1 }}>
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
              accessibilityLabel={t("sidebar.clearSearch")}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="X" size={14} color="#6b7280" />
            </TouchableOpacity>
          )}
        </View>

        {/* Language list */}
        <ScrollView
          style={{ flexShrink: 1, marginTop: 10 }}
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
