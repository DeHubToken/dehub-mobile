import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon from '../ui/Icon';

interface SearchMessage { _id: string; content?: string; undecryptable?: boolean }

/** Search the opened history without sending private message text elsewhere. */
export default function MessageSearch({ messages, onSelect, onClose }: {
  messages: SearchMessage[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(-1);
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? messages.filter(m => !m.undecryptable && m.content?.toLocaleLowerCase().includes(needle)) : [];
  }, [messages, query]);
  const move = (direction: number) => {
    if (!matches.length) return;
    const next = selected < 0 ? 0 : (selected + direction + matches.length) % matches.length;
    setSelected(next);
    onSelect(matches[next]._id);
  };
  return <View className="flex-row items-center px-4 py-2 border-b border-white/10 bg-white/5">
    <Icon name="Search" size={16} color="#71717A" />
    <TextInput autoFocus value={query} onChangeText={value => { setQuery(value); setSelected(-1); }}
      onSubmitEditing={() => move(1)} returnKeyType="search"
      placeholder={t('publicChat.searchPlaceholder')} placeholderTextColor="#71717A"
      accessibilityLabel={t('publicChat.searchMessages')}
      className="flex-1 text-white text-sm px-2" />
    {query.trim() ? <Text className="text-theme-neutrals-500 text-xs">{t('publicChat.resultsCount', { count: matches.length })}</Text> : null}
    <TouchableOpacity onPress={() => move(-1)} disabled={!matches.length} accessibilityRole="button" accessibilityLabel={t('dex.previous')} style={{ padding: 8 }}><Icon name="ChevronUp" size={16} color="#A1A1AA" /></TouchableOpacity>
    <TouchableOpacity onPress={() => move(1)} disabled={!matches.length} accessibilityRole="button" accessibilityLabel={t('dex.next')} style={{ padding: 8 }}><Icon name="ChevronDown" size={16} color="#A1A1AA" /></TouchableOpacity>
    <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} style={{ padding: 8 }}><Icon name="X" size={16} color="#A1A1AA" /></TouchableOpacity>
  </View>;
}
