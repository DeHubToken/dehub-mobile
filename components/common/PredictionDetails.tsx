import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { LinkPreviewData } from '../../libs/link-preview';
import { formatPredictionProbability } from '../../libs/predictions';
import Icon from '../ui/Icon';

export default function PredictionDetails({ preview }: { preview: LinkPreviewData }) {
  const { t, i18n } = useTranslation();
  const data = preview.prediction;
  if (!data) return null;
  return (
    <View style={styles.details}>
      {data.markets.map((market, index) => (
        <View key={`${market.question}-${index}`} style={styles.market}>
          <View style={styles.row}>
            <Text style={styles.question}>{market.question !== preview.title ? market.question : null}</Text>
            <Text style={styles.muted}>{t(`support.status.${market.status}`)}</Text>
          </View>
          {market.outcomes.map((outcome, outcomeIndex) => (
            <View key={`${outcome.label}-${outcomeIndex}`} style={styles.outcome}>
              <View style={[styles.bar, { width: `${outcome.probability * 100}%` }]} />
              <View style={styles.row}>
                <Text style={styles.label}>{outcome.label}</Text>
                <Text style={styles.probability}>{formatPredictionProbability(outcome.probability, i18n.language)}</Text>
              </View>
            </View>
          ))}
        </View>
      ))}
      {data.totalMarkets > data.markets.length && <Text style={styles.muted}>+{data.totalMarkets - data.markets.length}</Text>}
      <View style={styles.timeRow}>
        <Icon name="Clock" size={10} color="#a1a1aa" />
        <Text style={styles.timestamp}>
          {data.fetchedAt ? new Date(data.fetchedAt).toLocaleString(i18n.language) : t('common.failedToLoad')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  details: { marginTop: 12, gap: 12 },
  market: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  question: { flex: 1, color: '#d4d4d8', fontSize: 12 },
  muted: { color: '#a1a1aa', fontSize: 11 },
  outcome: { borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 10, paddingVertical: 8 },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.1)' },
  label: { flex: 1, color: '#fff', fontSize: 12 },
  probability: { color: '#fff', fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  timestamp: { color: '#a1a1aa', fontSize: 10 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
