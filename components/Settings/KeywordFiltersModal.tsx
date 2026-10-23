import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import Icon from '../ui/Icon';
import GlassModal from '../ui/GlassModal';
import { toastError, toastSuccess } from '../../libs';
import { KEYWORD_FILTERS_QUERY_KEY, useKeywordFilters } from '../../hooks/useKeywordFilters';
import {
  createKeywordFilter,
  deleteKeywordFilter,
  FILTER_CONTEXTS,
  type FilterAction,
  type FilterContext,
  type KeywordFilter,
} from '../../services/keyword-filter.service';

/** "For how long" choices, in seconds; null keeps the filter until removed. */
const DURATIONS: Array<{ key: string; seconds: number | null }> = [
  { key: 'forever', seconds: null },
  { key: 'duration1h', seconds: 60 * 60 },
  { key: 'duration1d', seconds: 24 * 60 * 60 },
  { key: 'duration7d', seconds: 7 * 24 * 60 * 60 },
  { key: 'duration30d', seconds: 30 * 24 * 60 * 60 },
];

export type KeywordFiltersModalProps = {
  visible: boolean;
  onClose: () => void;
};

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`mr-2 mb-2 rounded-full px-3 py-1.5 ${selected ? 'bg-white' : 'bg-white/10'}`}
    >
      <Text className={`text-xs ${selected ? 'text-black font-semibold' : 'text-white'}`}>{label}</Text>
    </TouchableOpacity>
  );
}

/**
 * Settings → Privacy → Muted words. The viewer's keyword filters: posts and
 * comments containing one are hidden, or folded behind a line naming it, in
 * the places picked. Matching is KeywordFilterGate's; this only edits the
 * list. Same choices as web's KeywordFiltersSection.
 */
const KeywordFiltersModal: React.FC<KeywordFiltersModalProps> = ({ visible, onClose }) => {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const filters = useKeywordFilters();
  const [phrase, setPhrase] = useState('');
  const [wholeWord, setWholeWord] = useState(true);
  const [action, setAction] = useState<FilterAction>('warn');
  const [duration, setDuration] = useState(0);
  const [contexts, setContexts] = useState<FilterContext[]>([...FILTER_CONTEXTS]);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: KEYWORD_FILTERS_QUERY_KEY }), [queryClient]);

  const toggleContext = (context: FilterContext) =>
    setContexts((prev) => (prev.includes(context) ? prev.filter((c) => c !== context) : [...prev, context]));

  const handleAdd = async () => {
    const text = phrase.trim();
    if (!text || !contexts.length || saving) return;
    setSaving(true);
    try {
      await createKeywordFilter({ phrase: text, wholeWord, action, contexts, expiresIn: DURATIONS[duration].seconds });
      toastSuccess(t('keywordFilters.added', { phrase: text }));
      setPhrase('');
      await refresh();
    } catch {
      toastError(t('keywordFilters.failed'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (filter: KeywordFilter) => {
    setRemoving(filter.id);
    try {
      await deleteKeywordFilter(filter.id);
      await refresh();
    } catch {
      toastError(t('keywordFilters.failed'));
    } finally {
      setRemoving(null);
    }
  };

  const summary = (filter: KeywordFilter) =>
    [
      t(filter.action === 'hide' ? 'keywordFilters.hide' : 'keywordFilters.warn'),
      filter.contexts.length === FILTER_CONTEXTS.length ? null : filter.contexts.map((c) => t(`keywordFilters.${c}`)).join(', '),
      filter.expiresAt
        ? t('keywordFilters.until', {
            date: new Date(filter.expiresAt).toLocaleString(i18n.resolvedLanguage ?? i18n.language),
          })
        : null,
    ]
      .filter(Boolean)
      .join(' · ');

  const canAdd = !!phrase.trim() && contexts.length > 0 && !saving;

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom" maxHeight="85%" blurIntensity={30}>
      <View className="px-5 pt-4 pb-3 border-b border-white/10">
        <Text className="text-white font-bold text-base">{t('keywordFilters.title')}</Text>
        <Text className="text-theme-neutrals-400 text-xs mt-1">{t('keywordFilters.description')}</Text>
      </View>
      <ScrollView className="px-4 pt-4" keyboardShouldPersistTaps="handled">
        <View className="flex-row items-center">
          <TextInput
            value={phrase}
            onChangeText={(value) => setPhrase(value.slice(0, 100))}
            onSubmitEditing={() => void handleAdd()}
            placeholder={t('keywordFilters.placeholder')}
            placeholderTextColor="#8B8D90"
            accessibilityLabel={t('keywordFilters.placeholder')}
            maxLength={100}
            returnKeyType="done"
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm"
          />
          <TouchableOpacity
            onPress={() => void handleAdd()}
            disabled={!canAdd}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canAdd }}
            className={`ml-2 h-11 px-4 rounded-xl items-center justify-center bg-white ${canAdd ? '' : 'opacity-40'}`}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text className="text-black text-sm font-semibold">{t('keywordFilters.add')}</Text>
            )}
          </TouchableOpacity>
        </View>

        <View className="mt-3 flex-row items-center justify-between">
          <Text className="text-white text-sm">{t('keywordFilters.wholeWord')}</Text>
          <Switch value={wholeWord} onValueChange={setWholeWord} />
        </View>

        <Text className="text-theme-neutrals-400 text-xs mt-4 mb-2">{t('keywordFilters.whenMatches')}</Text>
        <View className="flex-row flex-wrap">
          <Chip label={t('keywordFilters.warn')} selected={action === 'warn'} onPress={() => setAction('warn')} />
          <Chip label={t('keywordFilters.hide')} selected={action === 'hide'} onPress={() => setAction('hide')} />
        </View>

        <Text className="text-theme-neutrals-400 text-xs mt-2 mb-2">{t('keywordFilters.howLong')}</Text>
        <View className="flex-row flex-wrap">
          {DURATIONS.map((d, index) => (
            <Chip key={d.key} label={t(`keywordFilters.${d.key}`)} selected={duration === index} onPress={() => setDuration(index)} />
          ))}
        </View>

        <Text className="text-theme-neutrals-400 text-xs mt-2 mb-2">{t('keywordFilters.where')}</Text>
        <View className="flex-row flex-wrap">
          {FILTER_CONTEXTS.map((context) => (
            <Chip
              key={context}
              label={t(`keywordFilters.${context}`)}
              selected={contexts.includes(context)}
              onPress={() => toggleContext(context)}
            />
          ))}
        </View>

        <View className="mt-3 mb-6 bg-theme-neutrals-900 rounded-xl border border-theme-neutrals-800 overflow-hidden">
          {filters.length === 0 ? (
            <View className="px-4 py-6 items-center justify-center">
              <Icon name="Funnel" size={28} color="#4b5563" />
              <Text className="text-theme-neutrals-400 text-sm mt-2">{t('keywordFilters.empty')}</Text>
            </View>
          ) : (
            filters.map((filter) => (
              <View key={filter.id} className="px-4 py-3 border-b border-theme-neutrals-800 flex-row items-center">
                <View className="flex-1 min-w-0 mr-3">
                  <Text className="text-white text-sm font-medium" numberOfLines={1}>{filter.phrase}</Text>
                  <Text className="text-theme-neutrals-400 text-[11px] mt-0.5" numberOfLines={1}>{summary(filter)}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => void handleRemove(filter)}
                  disabled={removing === filter.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('keywordFilters.remove')}: ${filter.phrase}`}
                  hitSlop={{ top: 8, bottom: 8 }}
                  className="bg-theme-neutrals-800 border border-theme-neutrals-700 px-3 py-1.5 rounded-xl"
                >
                  {removing === filter.id ? (
                    <ActivityIndicator size="small" color="#F4F4F5" />
                  ) : (
                    <Text className="text-white/80 text-xs font-semibold">{t('keywordFilters.remove')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </GlassModal>
  );
};

export default KeywordFiltersModal;
