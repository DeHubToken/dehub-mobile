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

/** Same list, same order as web's `COUNTRIES`. */
export const COUNTRIES: { code: string; name: string }[] = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'AT', name: 'Austria' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'IE', name: 'Ireland' },
  { code: 'GR', name: 'Greece' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'RO', name: 'Romania' },
  { code: 'HU', name: 'Hungary' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'CN', name: 'China' },
  { code: 'IN', name: 'India' },
  { code: 'SG', name: 'Singapore' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'TH', name: 'Thailand' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'PH', name: 'Philippines' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CL', name: 'Chile' },
  { code: 'CO', name: 'Colombia' },
  { code: 'PE', name: 'Peru' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'EG', name: 'Egypt' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'KE', name: 'Kenya' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'IL', name: 'Israel' },
  { code: 'TR', name: 'Turkey' },
  { code: 'RU', name: 'Russia' },
  { code: 'UA', name: 'Ukraine' },
];

const GeoBlockingSection: React.FC = () => {
  const { t } = useTranslation();
  const { geoBlockedCountries } = useAppPrefs();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

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
    <View className="mt-6 mx-4">
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
        className="flex-row items-center justify-between px-4 py-3.5 bg-theme-neutrals-800 border border-theme-neutrals-700 rounded-xl"
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
                  onPress={() => setSearch('')}
                  activeOpacity={0.7}
                  className="p-2 -mr-2"
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
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
