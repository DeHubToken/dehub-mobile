import React, { useState } from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Line, Rect, Circle, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { formatPrice, formatSize, type BookLevel } from '../libs/dex-orderbook';
import type { Candle } from '../libs/dex-live-market';

export default function DexMarketChart({ candles, bids, asks, depth }: { candles: Candle[]; bids: BookLevel[]; asks: BookLevel[]; depth: boolean }) {
  const { t } = useTranslation();
  const [width, setWidth] = useState(360);
  const [hover, setHover] = useState<number | null>(null);
  const data = depth ? [...bids, ...asks].map((p) => ({ x: p.price, y: p.cumulativeDhb })) : candles.map((p) => ({ x: p.time, y: p.close }));
  if (!data.length) return <View style={{ height: 250, justifyContent: 'center', alignItems: 'center', padding: 20 }}><Text style={{ color: '#919ca9', textAlign: 'center' }}>{depth ? t('dex.noDepth') : t('dex.noSellHistory', { defaultValue: 'Candles start when verified sell liquidity is available.' })}</Text></View>;
  const minX = Math.min(...data.map((p) => p.x)), maxX = Math.max(...data.map((p) => p.x));
  const low = depth ? 0 : Math.min(...candles.map((p) => p.low)), high = depth ? Math.max(...data.map((p) => p.y)) : Math.max(...candles.map((p) => p.high));
  const padding = Math.max((high - low) * .12, high * .005), minY = Math.max(0, low - padding), maxY = high + padding;
  const axisStep = (maxY - minY) / 4;
  const axisDecimals = axisStep > 0 && Number.isFinite(axisStep) ? Math.min(8, Math.max(2, Math.ceil(-Math.log10(axisStep)) + 1)) : 2;
  const x = (value: number) => 8 + (maxX === minX ? .5 : (value - minX) / (maxX - minX)) * 290;
  const y = (value: number) => 225 - (value - minY) / (maxY - minY || 1) * 200;
  const line = (values: { x: number; y: number }[], step = false) => values.map((p, i) => `${i ? step ? `H${x(p.x)}V${y(p.y)}` : `L${x(p.x)},${y(p.y)}` : `M${x(p.x)},${y(p.y)}`}`).join(' ');
  const cursor = hover == null ? null : data.reduce((best, p) => Math.abs(x(p.x) - hover) < Math.abs(x(best.x) - hover) ? p : best, data[0]);
  return <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} onTouchMove={(e) => setHover(e.nativeEvent.locationX / width * 370)} onTouchEnd={() => setHover(null)}>
    <Text style={{ color: '#919ca9', fontSize: 10, height: 28, paddingHorizontal: 12 }}>{cursor ? `${depth ? `${formatSize(cursor.y)} DHB` : `$${formatPrice(cursor.y)}`} · ${depth ? formatPrice(cursor.x) : new Date(cursor.x * 1000).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' })}` : depth ? t('dex.depthHint') : t('dex.chartHint', { defaultValue: 'DHB price · USD · all pools · drag to inspect' })}</Text>
    <Svg width="100%" height={260} viewBox="0 0 370 260">
      {[0, 1, 2, 3, 4].map((i) => { const value = minY + (maxY - minY) * i / 4; return <React.Fragment key={i}><Line x1="8" x2="298" y1={y(value)} y2={y(value)} stroke="#252b34" strokeDasharray="3 5" /><SvgText x="304" y={y(value) + 3} fill="#919ca9" fontSize="8">{depth ? formatSize(value) : value.toFixed(axisDecimals)}</SvgText></React.Fragment>; })}
      {depth ? [{ levels: bids, color: '#20c997' }, { levels: asks, color: '#f05b72' }].map(({ levels, color }) => { const values = [...levels].sort((a, b) => a.price - b.price).map((p) => ({ x: p.price, y: p.cumulativeDhb })); if (!values.length) return null; const path = line(values, true); return <React.Fragment key={color}><Path d={`${path}L${x(values.at(-1)!.x)},225L${x(values[0].x)},225Z`} fill={color} fillOpacity={.12} /><Path d={path} fill="none" stroke={color} strokeWidth="1.5" /><Circle cx={x(values[0].x)} cy={y(values[0].y)} r="2" fill={color} /></React.Fragment>; }) : candles.map((candle) => {
        const color = candle.close >= candle.open ? '#20c997' : '#f05b72';
        const width = Math.max(1, Math.min(10, 220 / candles.length));
        return <React.Fragment key={candle.time}><Line x1={x(candle.time)} x2={x(candle.time)} y1={y(candle.high)} y2={y(candle.low)} stroke={color} /><Rect x={x(candle.time) - width / 2} y={Math.min(y(candle.open), y(candle.close))} width={width} height={Math.max(1, Math.abs(y(candle.open) - y(candle.close)))} fill={color} /></React.Fragment>;
      })}
      {cursor && <><Line x1={x(cursor.x)} x2={x(cursor.x)} y1="15" y2="225" stroke="#919ca9" strokeDasharray="3 4" /><Circle cx={x(cursor.x)} cy={y(cursor.y)} r="3" fill="#fff" /></>}
      {[0, 1].map((fraction) => { const value = fraction ? maxX : minX; return <SvgText key={fraction} x={fraction ? 298 : 8} y="249" textAnchor={fraction ? 'end' : 'start'} fill="#919ca9" fontSize="9">{depth ? formatPrice(value) : new Date(value * 1000).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' })}</SvgText>; })}
    </Svg>
  </View>;
}
