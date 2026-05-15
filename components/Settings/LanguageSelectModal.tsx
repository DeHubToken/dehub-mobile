import React, { useCallback, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, TextInput } from "react-native";
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

  const currentLang = i18n.language;
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
      presentation="center"
      maxHeight="80%"
      blurIntensity={30}
    >
      <View className="p-4">
        <Text className="text-white font-semibold text-lg">Language</Text>
        <Text className="text-theme-neutrals-400 text-xs mt-1">
          Choose your preferred language
        </Text>

        {/* Current language badge */}
        {currentLangInfo && (
          <View className="bg-blue-600/10 border border-blue-500/20 rounded-xl px-3 py-2 mt-3 flex-row items-center">
            <Icon name="Globe" size={14} color="#60a5fa" />
            <Text className="text-blue-300 text-xs ml-2">
              Current: {currentLangInfo.nativeName} ({currentLangInfo.name})
            </Text>
          </View>
        )}

        {/* Search */}
        <View className="mt-3 bg-theme-neutrals-800 rounded-xl border border-theme-neutrals-700 flex-row items-center px-3">
          <Icon name="Search" size={14} color="#6b7280" />
          <TextInput
            className="flex-1 text-white text-sm py-2.5 ml-2"
            placeholder="Search languages..."
            placeholderTextColor="#6b7280"
            value={search}
            onChangeText={setSearch}
            autoFocus={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Icon name="X" size={14} color="#6b7280" />
            </TouchableOpacity>
          )}
        </View>

        {/* Language list */}
        <View className="mt-2 max-h-96">
          <View className="bg-theme-neutrals-800 rounded-xl border border-theme-neutrals-700 overflow-hidden">
            {filtered.map((lang, idx) => {
              const isActive = lang.code === currentLang;
              const isLast = idx === filtered.length - 1;

              return (
                <TouchableOpacity
                  key={lang.code}
                  onPress={() => handleSelect(lang.code)}
                  activeOpacity={0.7}
                  className={`px-4 py-3 flex-row items-center justify-between ${
                    isActive ? "bg-blue-600/10" : ""
                  } ${!isLast ? "border-b border-theme-neutrals-700" : ""}`}
                >
                  <View className="flex-1 mr-3">
                    <Text
                      className={`text-sm ${
                        isActive ? "text-blue-400 font-semibold" : "text-white"
                      }`}
                    >
                      {lang.nativeName}
                    </Text>
                    <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                      {lang.name} ({lang.code})
                    </Text>
                  </View>
                  {isActive && (
                    <Icon name="Check" size={16} color="#60a5fa" />
                  )}
                </TouchableOpacity>
              );
            })}
            {filtered.length === 0 && (
              <View className="px-4 py-6 items-center">
                <Text className="text-theme-neutrals-500 text-sm">
                  No languages found
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </GlassModal>
  );
};

export default LanguageSelectModal;
