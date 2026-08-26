/**
 * Search across every settings tab.
 *
 * Mirrors web's search box at the top of the settings page: type a setting's
 * name and the hit takes you to it — the right tab, scrolled to the section,
 * which then flashes. The index and the jump live in libs/settings-search.
 *
 * The result list renders inline rather than floating over the tab row below
 * it. An absolutely positioned dropdown needs matching zIndex on iOS and
 * elevation on Android to sit above sibling views, and gets clipped by any
 * ancestor that hides overflow; pushing the tabs down for the second someone
 * is searching costs nothing and behaves the same on both platforms.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Keyboard } from 'react-native';
import { useTranslation } from 'react-i18next';

import Icon from '../ui/Icon';
import { searchSettings, type SettingsSearchHit } from '../../libs/settings-search';

const TAB_KEYS: Record<string, string> = {
  profile: 'settings.profile',
  appearance: 'settings.appearance',
  notifications: 'settings.notifications',
  privacy: 'settings.privacy',
  content: 'settings.content',
  messages: 'settings.messages',
  assets: 'settings.assets',
  support: 'settings.support',
};

const SettingsSearchBar: React.FC<{ onSelect: (hit: SettingsSearchHit) => void }> = ({
  onSelect,
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const results = useMemo(() => searchSettings(query, t), [query, t]);
  const open = query.trim().length > 0;

  const handleSelect = (hit: SettingsSearchHit) => {
    setQuery('');
    Keyboard.dismiss();
    onSelect(hit);
  };

  return (
    <View className="mb-3">
      <View className="flex-row items-center bg-theme-neutrals-700/40 rounded-xl px-3">
        <Icon name="Search" size={16} color="#8B8D90" />
        <TextInput
          className="flex-1 text-white py-2.5 px-2 text-sm"
          placeholder={t('settings.searchPlaceholder', 'Search settings')}
          placeholderTextColor="#8B8D90"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => {
            if (results.length) handleSelect(results[0]);
          }}
        />
        {open ? (
          <TouchableOpacity
            onPress={() => setQuery('')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="X" size={16} color="#8B8D90" />
          </TouchableOpacity>
        ) : null}
      </View>

      {open ? (
        <View className="mt-2 bg-theme-neutrals-800 border border-theme-neutrals-700 rounded-xl overflow-hidden">
          {results.length ? (
            results.map((hit, i) => (
              <TouchableOpacity
                key={`${hit.tab}:${hit.anchor}:${hit.label}`}
                onPress={() => handleSelect(hit)}
                activeOpacity={0.7}
                className={`flex-row items-center justify-between px-4 py-3 ${
                  i > 0 ? 'border-t border-theme-neutrals-700' : ''
                }`}
              >
                <Text className="text-white text-sm flex-1 mr-2">{hit.displayLabel}</Text>
                <Text className="text-theme-neutrals-500 text-[11px] uppercase tracking-widest">
                  {t(TAB_KEYS[hit.tab] ?? '', hit.tab)}
                </Text>
              </TouchableOpacity>
            ))
          ) : (
            <Text className="text-theme-neutrals-500 text-sm px-4 py-3">
              {t('settings.noSearchResults', 'No matching settings')}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
};

export default SettingsSearchBar;
