import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SmartImage from './common/SmartImage';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ScreenNames } from '../navigation/ScreenNames';
import { listPools, POOL_CHAIN_INFO, type DexPool } from '../libs/dex-pools';
import DexAddPoolSheet from './DexAddPoolSheet';

const DEHUB_COIN = require('../assets/web-icons/dehub-coin.png');
// Ticker and venue names, not prose: the same in every language.
const HOUSE_PAIR = 'DHB / USD';
const HOUSE_VENUE = 'DeHub · Base';

export function usePools() {
  return useQuery({ queryKey: ['dex-pools'], queryFn: listPools, staleTime: 60_000 });
}

export function DexPoolAvatar({ pool, size = 34 }: { pool: Pick<DexPool, 'image_url' | 'symbol'> | null; size?: number }) {
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (!pool) return <Image source={DEHUB_COIN} style={round} />;
  if (pool.image_url) return <SmartImage source={{ uri: pool.image_url }} recyclingKey={pool.image_url} style={[round, s.avatarBg]} />;
  return <View style={[round, s.avatarBg, s.initials]}><Text style={[s.initialsText, { fontSize: size * 0.36 }]}>{pool.symbol.slice(0, 2).toUpperCase()}</Text></View>;
}

/** The pair title. Opens the list of every pool and the button to add one. */
export default function DexPoolPicker({ current, rightContent }: { current: DexPool | null; rightContent?: React.ReactNode }) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const { data: pools = [], isLoading } = usePools();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pools;
    return pools.filter((p) => p.symbol.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.token_address.toLowerCase() === q);
  }, [pools, query]);
  const showHouse = !query || 'dhb dehub'.includes(query.trim().toLowerCase());

  const close = () => { setOpen(false); setQuery(''); };
  const goHouse = () => { close(); if (current) navigation.navigate(ScreenNames.Dex); };
  const goPool = (pool: DexPool) => { close(); navigation.navigate(ScreenNames.DexPool, { chain: pool.chain, address: pool.token_address }); };

  return <View style={s.row}>
    <DexPoolAvatar pool={current} />
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('dex.pools.title')} style={s.pairButton} onPress={() => setOpen(true)}>
      <Text style={s.pair}>{current ? current.symbol : 'DHB'} <Text style={s.muted}>/</Text> USD</Text>
      <Text style={s.chevron}>▾</Text>
    </TouchableOpacity>
    {rightContent}
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={s.backdrop} onPress={close}>
        <Pressable style={s.menu} onPress={() => {}}>
          <Text style={s.title}>{t('dex.pools.title')}</Text>
          <TextInput autoFocus placeholder={t('dex.pools.search')} accessibilityLabel={t('dex.pools.search')} placeholderTextColor="#596675" value={query} onChangeText={setQuery} style={s.search} autoCapitalize="none" autoCorrect={false} />
          <ScrollView style={s.list} keyboardShouldPersistTaps="handled">
            {showHouse && <TouchableOpacity accessibilityRole="button" style={[s.item, !current && s.itemActive]} onPress={goHouse}>
              <DexPoolAvatar pool={null} size={28} /><View style={s.itemText}><Text style={s.itemTitle}>{HOUSE_PAIR}</Text><Text style={s.muted}>{HOUSE_VENUE}</Text></View>
            </TouchableOpacity>}
            {filtered.map((pool) => <TouchableOpacity accessibilityRole="button" key={pool.id} style={[s.item, current?.id === pool.id && s.itemActive]} onPress={() => goPool(pool)}>
              <DexPoolAvatar pool={pool} size={28} /><View style={s.itemText}><Text style={s.itemTitle}>{pool.symbol} / USD</Text><Text style={s.muted} numberOfLines={1}>{pool.name} · {POOL_CHAIN_INFO[pool.chain].name}</Text></View>
            </TouchableOpacity>)}
            {isLoading && <View style={s.note}><ActivityIndicator color="#20c997" /><Text style={s.muted}>{t('dex.pools.loading')}</Text></View>}
            {!isLoading && !!query && !filtered.length && <Text style={[s.muted, s.note]}>{t('dex.pools.noMatch')}</Text>}
          </ScrollView>
          <TouchableOpacity accessibilityRole="button" style={s.add} onPress={() => { close(); setAdding(true); }}><Text style={s.addText}>+ {t('dex.pools.add')}</Text></TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
    <DexAddPoolSheet visible={adding} onClose={() => setAdding(false)} onCreated={goPool} />
  </View>;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  pairButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pair: { color: '#edf1f6', fontSize: 23, fontWeight: '600' },
  chevron: { color: '#919ca9', fontSize: 16 },
  muted: { color: '#919ca9', fontSize: 11 },
  avatarBg: { backgroundColor: '#1d232b' },
  initials: { alignItems: 'center', justifyContent: 'center' },
  initialsText: { color: '#e9edf2', fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-start', paddingTop: 90, paddingHorizontal: 14 },
  menu: { backgroundColor: '#11151b', borderColor: '#252b34', borderWidth: 1, borderRadius: 10, padding: 12, maxHeight: '80%' },
  title: { color: '#e9edf2', fontWeight: '600', fontSize: 15, marginBottom: 10 },
  search: { color: '#f4f6f8', borderColor: '#343e4b', borderWidth: 1, borderRadius: 6, backgroundColor: '#0b0e13', paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  list: { marginTop: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 6 },
  itemActive: { backgroundColor: '#1d232b' },
  itemText: { flex: 1 },
  itemTitle: { color: '#e9edf2', fontSize: 13, fontWeight: '600', marginBottom: 2 },
  note: { padding: 16, alignItems: 'center', gap: 8, textAlign: 'center' },
  add: { marginTop: 10, padding: 12, borderRadius: 6, borderWidth: 1, borderColor: '#343e4b', alignItems: 'center' },
  addText: { color: '#e9edf2', fontWeight: '600', fontSize: 13 },
});
