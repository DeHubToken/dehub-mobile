import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
/**
 * Geo-blocking — mirrors web's `GeoBlockingSelector`
 * (dehubweb src/pages/app/SettingsPage.tsx), including the same country list
 * and the searchable picker.
 *
 * Like web, the selection is client-side only today: nothing is sent to the
 * API yet. Unlike web (which keeps it in component state and loses it on tab
 * change) this persists to AsyncStorage so the chips survive a remount.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon from '../ui/Icon';
import GlassModal from '../ui/GlassModal';
import { SectionLabel } from './SettingsPrimitives';
import { useAppPrefs, setAppPref } from '../../hooks/useAppPrefs';
import { translateCopy as _translateCopy } from "../../i18n/copy";

/** Same list, same order as web's `COUNTRIES`. */
export const COUNTRIES: { code: string; name: string }[] = [
  { code: 'US', get name() { return _translateCopy("copy.49dca65f362f", { defaultValue: "United States" }); } },
  { code: 'GB', get name() { return _translateCopy("copy.8d23a6e37e0a", { defaultValue: "United Kingdom" }); } },
  { code: 'CA', get name() { return _translateCopy("copy.be55ef3f4c4e", { defaultValue: "Canada" }); } },
  { code: 'AU', get name() { return _translateCopy("copy.c1ef40ce0484", { defaultValue: "Australia" }); } },
  { code: 'DE', get name() { return _translateCopy("copy.80db4ccdca10", { defaultValue: "Germany" }); } },
  { code: 'FR', get name() { return _translateCopy("copy.7a1ca4ef7515", { defaultValue: "France" }); } },
  { code: 'IT', get name() { return _translateCopy("copy.5a9cf672c8be", { defaultValue: "Italy" }); } },
  { code: 'ES', get name() { return _translateCopy("copy.8ef41e6f4b07", { defaultValue: "Spain" }); } },
  { code: 'NL', get name() { return _translateCopy("copy.3a386c13d283", { defaultValue: "Netherlands" }); } },
  { code: 'BE', get name() { return _translateCopy("copy.348841ef53db", { defaultValue: "Belgium" }); } },
  { code: 'CH', get name() { return _translateCopy("copy.2275583196d7", { defaultValue: "Switzerland" }); } },
  { code: 'AT', get name() { return _translateCopy("copy.c9cab0238deb", { defaultValue: "Austria" }); } },
  { code: 'SE', get name() { return _translateCopy("copy.853637136575", { defaultValue: "Sweden" }); } },
  { code: 'NO', get name() { return _translateCopy("copy.bea54a349795", { defaultValue: "Norway" }); } },
  { code: 'DK', get name() { return _translateCopy("copy.c52709757760", { defaultValue: "Denmark" }); } },
  { code: 'FI', get name() { return _translateCopy("copy.aed8f531aa7e", { defaultValue: "Finland" }); } },
  { code: 'PL', get name() { return _translateCopy("copy.7f69649ad704", { defaultValue: "Poland" }); } },
  { code: 'PT', get name() { return _translateCopy("copy.4c7de2c3da6d", { defaultValue: "Portugal" }); } },
  { code: 'IE', get name() { return _translateCopy("copy.02bf1dfa9a03", { defaultValue: "Ireland" }); } },
  { code: 'GR', get name() { return _translateCopy("copy.9c93ad439373", { defaultValue: "Greece" }); } },
  { code: 'CZ', get name() { return _translateCopy("copy.1c769ecb9e80", { defaultValue: "Czech Republic" }); } },
  { code: 'RO', get name() { return _translateCopy("copy.ea23726dd0fd", { defaultValue: "Romania" }); } },
  { code: 'HU', get name() { return _translateCopy("copy.504be3084f44", { defaultValue: "Hungary" }); } },
  { code: 'JP', get name() { return _translateCopy("copy.647294383b2c", { defaultValue: "Japan" }); } },
  { code: 'KR', get name() { return _translateCopy("copy.c85329e3779e", { defaultValue: "South Korea" }); } },
  { code: 'CN', get name() { return _translateCopy("copy.10436829032f", { defaultValue: "China" }); } },
  { code: 'IN', get name() { return _translateCopy("copy.abd149214539", { defaultValue: "India" }); } },
  { code: 'SG', get name() { return _translateCopy("copy.c96dd81db196", { defaultValue: "Singapore" }); } },
  { code: 'HK', get name() { return _translateCopy("copy.1ed8c7e56c94", { defaultValue: "Hong Kong" }); } },
  { code: 'TW', get name() { return _translateCopy("copy.dd76af196e2c", { defaultValue: "Taiwan" }); } },
  { code: 'TH', get name() { return _translateCopy("copy.6e49e65081b2", { defaultValue: "Thailand" }); } },
  { code: 'MY', get name() { return _translateCopy("copy.084504165b07", { defaultValue: "Malaysia" }); } },
  { code: 'ID', get name() { return _translateCopy("copy.dbc74a36d8e7", { defaultValue: "Indonesia" }); } },
  { code: 'PH', get name() { return _translateCopy("copy.c3782c86d809", { defaultValue: "Philippines" }); } },
  { code: 'VN', get name() { return _translateCopy("copy.2e5e81066a29", { defaultValue: "Vietnam" }); } },
  { code: 'NZ', get name() { return _translateCopy("copy.2898e16d4e4e", { defaultValue: "New Zealand" }); } },
  { code: 'BR', get name() { return _translateCopy("copy.07f62b021771", { defaultValue: "Brazil" }); } },
  { code: 'MX', get name() { return _translateCopy("copy.a7d355b26bda", { defaultValue: "Mexico" }); } },
  { code: 'AR', get name() { return _translateCopy("copy.ea0b937ea317", { defaultValue: "Argentina" }); } },
  { code: 'CL', get name() { return _translateCopy("copy.f5273e236d49", { defaultValue: "Chile" }); } },
  { code: 'CO', get name() { return _translateCopy("copy.6b615adb1300", { defaultValue: "Colombia" }); } },
  { code: 'PE', get name() { return _translateCopy("copy.508731a3c5d3", { defaultValue: "Peru" }); } },
  { code: 'ZA', get name() { return _translateCopy("copy.3e049d78d958", { defaultValue: "South Africa" }); } },
  { code: 'EG', get name() { return _translateCopy("copy.557c1599d9a0", { defaultValue: "Egypt" }); } },
  { code: 'NG', get name() { return _translateCopy("copy.04952a0f984d", { defaultValue: "Nigeria" }); } },
  { code: 'KE', get name() { return _translateCopy("copy.74e1891dc615", { defaultValue: "Kenya" }); } },
  { code: 'AE', get name() { return _translateCopy("copy.dd64913c8b91", { defaultValue: "United Arab Emirates" }); } },
  { code: 'SA', get name() { return _translateCopy("copy.ed9ad13611d7", { defaultValue: "Saudi Arabia" }); } },
  { code: 'IL', get name() { return _translateCopy("copy.3552ac0c0324", { defaultValue: "Israel" }); } },
  { code: 'TR', get name() { return _translateCopy("copy.07c67d76ef92", { defaultValue: "Turkey" }); } },
  { code: 'RU', get name() { return _translateCopy("copy.33a3d8ed92b0", { defaultValue: "Russia" }); } },
  { code: 'UA', get name() { return _translateCopy("copy.580eedc669f3", { defaultValue: "Ukraine" }); } },
];

const GeoBlockingSection: React.FC = () => {
  const { t } = useTranslation();
  const { geoBlockedCountries } = useAppPrefs();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useSurfaceDraft("components/Settings/GeoBlockingSection.tsx:search", '');

  const filtered = useMemo(
    () => COUNTRIES.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())),
    [search]
  );

  const toggleCountry = (code: string) => {
    const next = geoBlockedCountries.includes(code)
      ? geoBlockedCountries.filter((c) => c !== code)
      : [...geoBlockedCountries, code];
    setAppPref('geoBlockedCountries', next);
  };

  return (
    <View className="mt-6">
      <SectionLabel label={t('settings.geoBlocking')} icon="MapPin" />
      <Text className="text-theme-neutrals-500 text-xs mb-3 ml-1">
        {t('settings.geoBlockingDesc')}
      </Text>

      {geoBlockedCountries.length > 0 ? (
        <View className="flex-row flex-wrap mb-3" style={{ gap: 8 }}>
          {geoBlockedCountries.map((code) => (
            <TouchableOpacity
              key={code}
              onPress={() => toggleCountry(code)}
              activeOpacity={0.7}
              className="flex-row items-center bg-white/15 px-3 py-1.5 rounded-lg"
              style={{ gap: 6 }}
            >
              <Icon name="MapPin" size={12} color="#F4F4F5" />
              <Text className="text-white/80 text-xs">
                {COUNTRIES.find((c) => c.code === code)?.name ?? code}
              </Text>
              <Icon name="X" size={12} color="#F4F4F5" />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        className="flex-row items-center justify-between px-4 py-2 bg-theme-neutrals-800 border border-theme-neutrals-700 rounded-xl"
      >
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <Icon name="MapPin" size={16} color="#6b7280" />
          <Text className="text-theme-neutrals-400 text-sm">
            {geoBlockedCountries.length === 0
              ? t('settings.selectCountries')
              : `${geoBlockedCountries.length} ${
                  geoBlockedCountries.length === 1
                    ? t('settings.countryBlocked')
                    : t('settings.countriesBlocked')
                }`}
          </Text>
        </View>
        <Icon name="ChevronDown" size={16} color="#6b7280" />
      </TouchableOpacity>

      <GlassModal
        visible={open}
        onClose={() => setOpen(false)}
        presentation="bottom"
        maxHeight="70%"
        blurIntensity={30}
      >
        <View className="flex-1">
          <View className="px-5 pt-4 pb-3 border-b border-white/10">
            <Text className="text-white font-bold text-base mb-3">
              {t('settings.blockCountries')}
            </Text>
            <View className="flex-row items-center bg-theme-neutrals-800 border border-theme-neutrals-700 rounded-xl px-3">
              <Icon name="Search" size={16} color="#6b7280" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t('settings.searchCountries')}
                placeholderTextColor="#6b7280"
                className="flex-1 text-white text-sm px-2 h-11"
              />
              {search ? (
                <TouchableOpacity
                  onPress={() => setSearch.complete(search, '')}
                  activeOpacity={0.7}
                  className="p-2 -mr-2"
                  accessibilityRole="button"
                  accessibilityLabel={t("sidebar.clearSearch")}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Icon name="X" size={16} color="#6b7280" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text className="text-theme-neutrals-500 text-sm text-center py-8">
                {t('settings.noCountriesFound')}
              </Text>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => toggleCountry(item.code)}
                activeOpacity={0.7}
                className="flex-row items-center justify-between px-5 py-3.5"
              >
                <Text className="text-white text-sm">{item.name}</Text>
                {geoBlockedCountries.includes(item.code) ? (
                  <View className="w-5 h-5 rounded bg-white/20 items-center justify-center">
                    <Icon name="Check" size={12} color="#fff" />
                  </View>
                ) : null}
              </TouchableOpacity>
            )}
          />
        </View>
      </GlassModal>
    </View>
  );
};

export default GeoBlockingSection;
