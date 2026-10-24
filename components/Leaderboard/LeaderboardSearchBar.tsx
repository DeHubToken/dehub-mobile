import React from "react";
import { View, TextInput } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "../../theme";
import { useTranslation } from "react-i18next";
import { SEARCH_INPUT_CLEAR, useSearchFieldMaterial } from '../../hooks/useSearchFieldMaterial';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  /** The bar now rides the collapsing header, so focusing it has to bring
   *  that header back — otherwise you can be typing into a field that has
   *  slid off the top of the screen. */
  onFocus?: () => void;
}

const LeaderboardSearchBar: React.FC<Props> = ({ value, onChangeText, onFocus }) => {
  const { t } = useTranslation();
  const searchField = useSearchFieldMaterial();
  return (
    <View className="mx-4 mt-3 mb-2 flex-row items-center rounded-xl px-3 py-2.5" style={searchField.surface}>
      <Ionicons name="search" size={16} color={theme.colors.neutrals[400]} style={{ marginRight: 8 }} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => { searchField.onFocus(); onFocus?.(); }}
        onBlur={searchField.onBlur}
        placeholder={t("leaderboard.searchUsers")}
        placeholderTextColor={theme.colors.neutrals[400]}
        className="flex-1 text-white text-sm p-0"
        style={SEARCH_INPUT_CLEAR}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
    </View>
  );
};

export default React.memo(LeaderboardSearchBar);
