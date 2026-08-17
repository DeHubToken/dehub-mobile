/**
 * Asset Reference Card
 * ====================
 * The card a contract address or a `$TICKER` in user-written text turns into:
 * logo, name, price, the 24h move and a 24h sparkline. Mobile counterpart of
 * web's `AssetRefCards`, sitting next to `DehubLinkCard` in every surface that
 * renders somebody's caption.
 *
 * Same fallback rule as the link cards, and for the same reason: surfaces strip
 * a contract address out of the text once they card it, so a token that cannot
 * resolve — a launch with no pool yet, a chain DexScreener does not index, a
 * rate-limited minute — would silently delete the address from the post. The
 * chip is that fallback and it copies on tap.
 *
 * Tapping a resolved card opens `CashtagSheet`, which is the full breakdown this
 * app already had; the card is the inline summary that was missing.
 */

import React, { memo, useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import Icon from '../ui/Icon';
import { copyToClipboard } from '../../libs/clipboard.utils';
import CashtagSheet from '../Home/CashtagSheet';
import {
  fetch24hSeries,
  resolveAssetRef,
  type PricePoint,
  type ResolvedAsset,
} from '../../services/asset.service';
import { type AssetRef } from '../../libs/asset-refs';

/** Same cap as the link cards: a caption can name a whole portfolio. */
export const MAX_ASSET_CARDS_PER_MESSAGE = 2;

/**
 * Width for a card inside a chat bubble, matching `DehubLinkCard`'s.
 *
 * A bubble sizes itself to its text, so a card with no intrinsic width collapses
 * — and an address-only message is exactly the case where the text is stripped
 * to nothing and there is no width to inherit.
 */
export const BUBBLE_ASSET_CARD_WIDTH = Math.min(
  240,
  Math.round(Dimensions.get('window').width * 0.75) - 40,
);

const SPARK_W = 260;
const SPARK_H = 36;

function formatPrice(value: number | null): string {
  if (value == null) return '—';
  if (value >= 1000)
    return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  if (value >= 0.0001) return `$${value.toFixed(6)}`;
  return `$${value.toFixed(8)}`;
}

function formatCompact(value: number | null | undefined): string | null {
  if (!value) return null;
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function shortAddress(address: string): string {
  return address.length > 16
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address;
}

// ── Sparkline ───────────────────────────────────────────────────────────────

const Sparkline: React.FC<{ points: PricePoint[]; positive: boolean }> = ({
  points,
  positive,
}) => {
  if (points.length < 2) return null;

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  // A flat series has zero range; without the guard every y is NaN and the path
  // silently disappears instead of drawing a straight line.
  const range = max - min || Math.abs(max) || 1;
  const step = SPARK_W / (points.length - 1);

  const coords = prices.map((price, i) => ({
    x: i * step,
    y: SPARK_H - ((price - min) / range) * (SPARK_H - 4) - 2,
  }));

  const line = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ');
  const area = `${line} L${SPARK_W},${SPARK_H} L0,${SPARK_H} Z`;
  const color = positive ? '#34d399' : '#f87171';
  const gradientId = positive ? 'asset-spark-up' : 'asset-spark-down';

  return (
    <Svg width="100%" height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}>
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={area} fill={`url(#${gradientId})`} />
      <Path d={line} fill="none" stroke={color} strokeWidth={1.5} />
    </Svg>
  );
};

// ── Fallback ────────────────────────────────────────────────────────────────

/**
 * What a stripped address becomes when nothing could resolve it. Not decorative:
 * this is the only remaining copy of an address the caption no longer shows.
 */
const AddressChip: React.FC<{ address: string }> = ({ address }) => {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    copyToClipboard(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [address]);

  return (
    <TouchableOpacity style={styles.chip} onPress={copy} activeOpacity={0.7}>
      <Text style={styles.chipText}>{shortAddress(address)}</Text>
      <Icon
        name={copied ? 'Check' : 'Copy'}
        size={12}
        color={copied ? '#34d399' : '#a1a1aa'}
      />
    </TouchableOpacity>
  );
};

// ── Card ────────────────────────────────────────────────────────────────────

const ResolvedCard: React.FC<{ asset: ResolvedAsset }> = ({ asset }) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data: series } = useQuery({
    queryKey: [
      'asset-series',
      asset.assetClass,
      asset.symbol,
      asset.chainId,
      asset.pairAddress,
    ],
    queryFn: () => fetch24hSeries(asset),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });

  const change = asset.changePercent24h;
  const positive = change == null ? true : change >= 0;

  const meta: string[] = [];
  if (asset.assetClass === 'stock') {
    if (asset.exchange) meta.push(asset.exchange);
    const cap = formatCompact(asset.marketCap);
    if (cap) meta.push(cap);
  } else {
    if (asset.chainId) meta.push(asset.chainId.toUpperCase());
    const cap = formatCompact(asset.marketCap);
    if (cap) meta.push(`MC ${cap}`);
    const vol = formatCompact(asset.volume24h);
    if (vol) meta.push(`Vol ${vol}`);
  }

  return (
    <>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => setSheetOpen(true)}
      >
        <View style={styles.row}>
          {asset.logo ? (
            <Image
              source={{ uri: asset.logo }}
              style={styles.logo}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.logo, styles.logoFallback]}>
              <Text style={styles.logoFallbackText}>
                {asset.symbol.replace(/[^A-Za-z0-9]/g, '').slice(0, 3)}
              </Text>
            </View>
          )}

          <View style={styles.body}>
            <View style={styles.titleRow}>
              <Text style={styles.symbol}>${asset.symbol}</Text>
              <Text style={styles.name} numberOfLines={1}>
                {asset.name}
              </Text>
            </View>
            {meta.length > 0 && (
              <Text style={styles.meta} numberOfLines={1}>
                {meta.join(' · ')}
              </Text>
            )}
          </View>

          <View style={styles.priceCol}>
            <Text style={styles.price}>{formatPrice(asset.price)}</Text>
            {change != null && (
              <Text
                style={[
                  styles.change,
                  { color: positive ? '#34d399' : '#f87171' },
                ]}
              >
                {positive ? '+' : ''}
                {change.toFixed(2)}%
              </Text>
            )}
          </View>
        </View>

        {!!series && series.length >= 2 && (
          <View style={styles.chartRow}>
            <View style={styles.chartWrap}>
              <Sparkline points={series} positive={positive} />
            </View>
            <Text style={styles.chartLabel}>24h</Text>
          </View>
        )}
      </TouchableOpacity>

      {sheetOpen && (
        <CashtagSheet
          visible={sheetOpen}
          symbol={asset.symbol}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
};

const AssetRefCardComponent: React.FC<{ assetRef: AssetRef }> = ({
  assetRef,
}) => {
  const { data: asset, isLoading } = useQuery({
    queryKey: ['asset', assetRef.kind, assetRef.value],
    queryFn: () => resolveAssetRef(assetRef),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });

  if (isLoading) return <View style={styles.skeleton} />;
  if (!asset) {
    // A ticker that resolved to nothing is still in the caption, so there is
    // nothing to rescue and nothing to show. A stripped address is not.
    return assetRef.strip ? <AddressChip address={assetRef.raw} /> : null;
  }
  return <ResolvedCard asset={asset} />;
};

export const AssetRefCard = memo(AssetRefCardComponent);

/** Cards for the refs a surface found, in order. */
function AssetRefCardsComponent({ refs }: { refs: AssetRef[] }) {
  if (refs.length === 0) return null;
  return (
    <>
      {refs.map((ref) => (
        <AssetRefCard key={`${ref.kind}:${ref.value}`} assetRef={ref} />
      ))}
    </>
  );
}

export const AssetRefCards = memo(AssetRefCardsComponent);

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    paddingBottom: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  logoFallback: { alignItems: 'center', justifyContent: 'center' },
  logoFallbackText: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700' },
  body: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  symbol: { color: '#fff', fontSize: 14, fontWeight: '700' },
  name: { color: 'rgba(255,255,255,0.5)', fontSize: 12, flexShrink: 1 },
  meta: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },
  priceCol: { alignItems: 'flex-end' },
  price: { color: '#fff', fontSize: 14, fontWeight: '600' },
  change: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    paddingHorizontal: 10,
  },
  chartWrap: { flex: 1 },
  chartLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 10, paddingBottom: 2 },
  skeleton: {
    height: 84,
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  chip: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  chipText: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontFamily: 'monospace' },
});

export default AssetRefCard;
