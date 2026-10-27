import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { AppStackParamList } from '../navigation/types';
import { ScreenNames } from '../navigation/ScreenNames';
import ScreenHeader from '../components/ScreenHeader';
import { PageEmpty, PageSection, PageTabs } from '../components/page/PageKit';
import { useAppTheme } from '../context/ThemeContext';
import { openExternalLink } from '../libs/links.utils';
import { CATEGORIES, FEATURES, PLATFORMS, REVIEWED_ON, SOURCES, STATUS_LABELS, entryFor, filterFeatures, type PlatformId, type ComparisonEntry } from '../libs/platform-comparison';

export default function CompareScreen() {
  const { t } = useTranslation();
  const copy = (key: string, fallback: string) => t(`comparison.${key}`, { defaultValue: fallback });
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<AppStackParamList, ScreenNames.Compare>>();
  const [platform, setPlatform] = useState<PlatformId | 'all'>('youtube');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState(false);
  useEffect(() => {
    const incoming = route.params;
    setPlatform(incoming?.platform === 'all' ? 'all' : PLATFORMS.some(p => p.id === incoming?.platform) ? incoming!.platform as PlatformId : 'youtube');
    setCategory(CATEGORIES.includes(incoming?.category ?? '') ? incoming!.category! : 'all');
    setQuery(incoming?.q ?? '');
  }, [route.params]);
  const filtered = useMemo(() => filterFeatures(query, category), [query, category]);
  const peers = PLATFORMS.filter(item => platform === 'all' || item.id === platform);
  const entry = (value: ComparisonEntry, name: string, restricted = false) => <View style={styles.entry}>
    <View style={styles.entryHeading}><Text style={[styles.name, { color: colors.foreground }]}>{name}</Text><Text style={{ color: colors.mutedForeground }}>{copy(`status.${value.status}`, STATUS_LABELS[value.status])}</Text></View>
    <Text style={[styles.body, { color: colors.mutedForeground }]}>{value.note}</Text>
    {restricted && <Text style={[styles.body, { color: colors.mutedForeground }]}>{copy('ios', 'Purchase and reward actions are unavailable in the iOS app.')}</Text>}
    {value.source && SOURCES[value.source] && <Pressable accessibilityRole="link" onPress={() => { void openExternalLink(SOURCES[value.source!].url); }} style={styles.link}>
      <Text style={{ color: colors.foreground, textDecorationLine: 'underline' }}>{SOURCES[value.source].title}</Text>
    </Pressable>}
  </View>;
  return <View style={styles.root}>
    <ScreenHeader title={copy('title', 'Compare DeHub')} icon="glossary" tabs={<PageTabs<PlatformId | 'all'> tabs={[...PLATFORMS.map(p => ({ id: p.id, label: p.name })), { id: 'all', label: copy('allPlatforms', 'All platforms') }]} value={platform} onChange={setPlatform} />}>
      <TextInput value={query} onChangeText={setQuery} accessibilityLabel={copy('search', 'Search features')} placeholder={copy('search', 'Search features')} placeholderTextColor={colors.mutedForeground} autoCorrect={false} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
    </ScreenHeader>
    <FlatList data={filtered} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 90 }} initialNumToRender={8}
      ListHeaderComponent={<>
        <PageSection>
          <Text style={{ color: colors.mutedForeground }}>{copy('edition', 'English research edition')} · {REVIEWED_ON}</Text>
          <Text style={[styles.headline, { color: colors.foreground }]}>{copy('headline', 'Find your fit, feature by feature.')}</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>{FEATURES.length} {copy('features', 'features')} · {CATEGORIES.length} {copy('categories', 'categories')} · {PLATFORMS.length} {copy('platforms', 'other platforms')}</Text>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: method }} onPress={() => setMethod(value => !value)} style={styles.link}><Text style={{ color: colors.foreground, textDecorationLine: 'underline' }}>{copy('method', 'How to read this comparison')}</Text></Pressable>
          {method && <View style={{ gap: 12 }}>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>{copy('methodBody', 'Documented means described by the linked first-party source. Conditional means eligibility, device, region or a narrower feature applies. Related product means a companion app, integration or ecosystem implementation. Not verified is an open research item, never a claim that a feature is absent.')}</Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>{copy('scope', 'This is a growing catalogue of DeHub capabilities, not a score or an exhaustive audit of every competitor. Platform documentation can lag product changes. Older sources establish a feature, not its current price or limits.')}</Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>{copy('parity', 'DeHub web, Android and iOS capabilities differ. The iOS app does not offer crypto purchases or reward actions. Device-specific notes remain beside the relevant features. Documentation is not a guarantee of availability or earnings.')}</Text>
          </View>}
        </PageSection>
        <PageTabs<string> tabs={[{ id: 'all', label: copy('allCategories', 'All categories') }, ...CATEGORIES.map(c => ({ id: c, label: c }))]} value={category} onChange={setCategory} />
        <Text accessibilityLiveRegion="polite" style={[styles.count, { color: colors.mutedForeground }]}>{filtered.length} {copy('matching', 'matching features')}</Text>
      </>}
      renderItem={({ item }) => <PageSection>
        <Text style={{ color: colors.mutedForeground }}>{item.category}</Text>
        <Text style={[styles.feature, { color: colors.foreground }]}>{item.name}</Text>
        {entry(item.dehub, 'DeHub', item.iosRestricted)}
        {peers.map(peer => <View key={peer.id}>{entry(entryFor(item, peer.id), peer.name)}</View>)}
      </PageSection>}
      ListEmptyComponent={<PageEmpty title={copy('empty', 'No matching features')} body={copy('emptyBody', 'Try another phrase or clear the category filter.')} action={<Pressable accessibilityRole="button" onPress={() => { setQuery(''); setCategory('all'); }} style={styles.link}><Text style={{ color: colors.foreground, textDecorationLine: 'underline' }}>{copy('reset', 'Clear filters')}</Text></Pressable>} />}
    />
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 16 },
  headline: { fontSize: 27, fontWeight: '700', marginVertical: 12 },
  body: { fontSize: 14, lineHeight: 21 },
  count: { paddingHorizontal: 16, paddingVertical: 12, fontSize: 13 },
  feature: { fontSize: 18, fontWeight: '700', marginTop: 4 },
  entry: { gap: 6, marginTop: 18 },
  entryHeading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  name: { fontSize: 15, fontWeight: '600' },
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
