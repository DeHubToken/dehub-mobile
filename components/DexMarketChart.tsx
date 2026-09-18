import React, { useState } from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Line, Circle, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { formatPrice, formatSize, type BookLevel } from '../libs/dex-orderbook';
import type { PricePoint } from '../libs/dex-market-data';

export default function DexMarketChart({ points, bids, asks, depth }: { points: PricePoint[]; bids: BookLevel[]; asks: BookLevel[]; depth: boolean }) {
  const { t } = useTranslation();
  const [width, setWidth] = useState(360);
  const [hover, setHover] = useState<number | null>(null);
  const data = depth ? [...bids, ...asks].map((p) => ({ x: p.price, y: p.cumulativeDhb })) : points.map((p) => ({ x: p.time, y: p.price }));
  if (!data.length) return <View style={{ height: 250, justifyContent: 'center', alignItems: 'center', padding: 20 }}><Text style={{ color: '#919ca9', textAlign: 'center' }}>{t(depth ? 'dex.noDepth' : 'dex.noHistory')}</Text></View>;
  const minX = Math.min(...data.map((p) => p.x)), maxX = Math.max(...data.map((p) => p.x));
  const low = depth ? 0 : Math.min(...data.map((p) => p.y)), high = Math.max(...data.map((p) => p.y));
  const padding = Math.max((high - low) * .12, high * .005), minY = Math.max(0, low - padding), maxY = high + padding;
  const x = (value: number) => 8 + (maxX === minX ? .5 : (value - minX) / (maxX - minX)) * 290;
  const y = (value: number) => 225 - (value - minY) / (maxY - minY || 1) * 200;
  const line = (values: { x: number; y: number }[], step = false) => values.map((p, i) => `${i ? step ? `H${x(p.x)}V${y(p.y)}` : `L${x(p.x)},${y(p.y)}` : `M${x(p.x)},${y(p.y)}`}`).join(' ');
  const cursor = hover == null ? null : data.reduce((best, p) => Math.abs(x(p.x) - hover) < Math.abs(x(best.x) - hover) ? p : best, data[0]);
  return <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} onTouchMove={(e) => setHover(e.nativeEvent.locationX / width * 370)} onTouchEnd={() => setHover(null)}>
    <Text style={{ color: '#919ca9', fontSize: 10, height: 28, paddingHorizontal: 12 }}>{cursor ? `${depth ? formatSize(cursor.y) : formatPrice(cursor.y)} ${depth ? 'DHB' : 'USD'} · ${depth ? formatPrice(cursor.x) : new Date(cursor.x * 1000).toLocaleDateString()}` : t(depth ? 'dex.depthHint' : 'dex.chartHint')}</Text>
    <Svg width="100%" height={260} viewBox="0 0 370 260">
      {[0, 1, 2, 3, 4].map((i) => { const value = minY + (maxY - minY) * i / 4; return <React.Fragment key={i}><Line x1="8" x2="298" y1={y(value)} y2={y(value)} stroke="#252b34" strokeDasharray="3 5" /><SvgText x="304" y={y(value) + 3} fill="#919ca9" fontSize="8">{depth ? formatSize(value) : formatPrice(value)}</SvgText></React.Fragment>; })}
      {depth ? [{ levels: bids, color: '#20c997' }, { levels: asks, color: '#f05b72' }].map(({ levels, color }) => { const values = [...levels].sort((a, b) => a.price - b.price).map((p) => ({ x: p.price, y: p.cumulativeDhb })); if (!values.length) return null; const path = line(values, true); return <React.Fragment key={color}><Path d={`${path}L${x(values.at(-1)!.x)},225L${x(values[0].x)},225Z`} fill={color} fillOpacity={.12} /><Path d={path} fill="none" stroke={color} strokeWidth="1.5" /><Circle cx={x(values[0].x)} cy={y(values[0].y)} r="2" fill={color} /></React.Fragment>; }) : <><Path d={`${line(data)}L${x(data.at(-1)!.x)},225L${x(data[0].x)},225Z`} fill="#20c997" fillOpacity={.07} /><Path d={line(data)} stroke="#20c997" fill="none" strokeWidth="1.5" /><Circle cx={x(data.at(-1)!.x)} cy={y(data.at(-1)!.y)} r="2.5" fill="#20c997" /></>}
      {cursor && <><Line x1={x(cursor.x)} x2={x(cursor.x)} y1="15" y2="225" stroke="#919ca9" strokeDasharray="3 4" /><Circle cx={x(cursor.x)} cy={y(cursor.y)} r="3" fill="#fff" /></>}
      {[0, 1].map((fraction) => { const value = fraction ? maxX : minX; return <SvgText key={fraction} x={fraction ? 298 : 8} y="249" textAnchor={fraction ? 'end' : 'start'} fill="#919ca9" fontSize="9">{depth ? formatPrice(value) : new Date(value * 1000).toLocaleDateString()}</SvgText>; })}
    </Svg>
  </View>;
}
