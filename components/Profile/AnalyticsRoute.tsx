import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import Svg, { Polyline, Line, Text as SvgText } from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import { getMyAnalytics, type AnalyticsResponse } from "../../services/nft.service";
import { ScreenNames } from "../../navigation/ScreenNames";
import Icon from "../ui/Icon";

type Range = "7d" | "30d" | "90d";
const RANGES: Range[] = ["7d", "30d", "90d"];

function mergeTimeSeries(
  likes: { date: string; count: number }[],
  followers: { date: string; count: number }[],
) {
  const map = new Map<string, { date: string; likes: number; followers: number }>();
  likes.forEach(({ date, count }) => map.set(date, { date, likes: count, followers: 0 }));
  followers.forEach(({ date, count }) => {
    const e = map.get(date);
    if (e) e.followers = count;
    else map.set(date, { date, likes: 0, followers: count });
  });
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function buildPoints(data: number[], width: number, height: number, padX: number, padY: number) {
  if (!data.length) return "";
  const max = Math.max(...data, 1);
  return data
    .map((v, i) => {
      const x = padX + (i / Math.max(data.length - 1, 1)) * (width - padX * 2);
      const y = padY + (1 - v / max) * (height - padY * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

interface MiniChartProps {
  likesData: number[];
  followersData: number[];
  labels: string[];
}

function MiniChart({ likesData, followersData, labels }: MiniChartProps) {
  const W = 320;
  const H = 140;
  const padX = 8;
  const padY = 8;
  const likesPts = buildPoints(likesData, W, H, padX, padY);
  const followersPts = buildPoints(followersData, W, H, padX, padY);

  const tickIndexes = labels.length <= 7
    ? labels.map((_, i) => i)
    : [0, Math.floor(labels.length / 3), Math.floor((2 * labels.length) / 3), labels.length - 1];

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <Line x1={padX} y1={H - padY} x2={W - padX} y2={H - padY} stroke="#3f3f46" strokeWidth="1" />
      {tickIndexes.map((idx) => {
        const x = padX + (idx / Math.max(labels.length - 1, 1)) * (W - padX * 2);
        const label = labels[idx] ?? "";
        const parts = label.split("-");
        const short = parts.length === 3 ? `${parseInt(parts[1])}/${parseInt(parts[2])}` : label;
        return (
          <SvgText key={idx} x={x} y={H - 1} fontSize={9} fill="#71717a" textAnchor="middle">
            {short}
          </SvgText>
        );
      })}
      {likesPts ? (
        <Polyline points={likesPts} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinejoin="round" />
      ) : null}
      {followersPts ? (
        <Polyline points={followersPts} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
      ) : null}
    </Svg>
  );
}

interface AnalyticsRouteProps {
  listHeader?: React.ReactElement | null;
}

const AnalyticsRoute: React.FC<AnalyticsRouteProps> = ({ listHeader }) => {
  const [range, setRange] = useState<Range>("30d");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (r: Range) => {
    setLoading(true);
    setError(false);
    try {
      const res = await getMyAnalytics(r);
      setData(res);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(range); }, [range, load]);

  const chartData = data ? mergeTimeSeries(data.likesOverTime, data.followersOverTime) : [];
  const labels = chartData.map((d) => d.date);
  const likesData = chartData.map((d) => d.likes);
  const followersData = chartData.map((d) => d.followers);

  const totals = data
    ? [
        { label: "Total Likes", value: data.totals.likes },
        { label: "Followers", value: data.totals.followers },
        { label: "Uploads", value: data.totals.uploads },
      ]
    : [];

  const navigation = useNavigation<any>();

  return (
    <ScrollView className="flex-1 bg-theme-neutrals-900" contentContainerStyle={{ paddingBottom: 16, gap: 16 }}>
      {listHeader}
      <View style={{ paddingHorizontal: 16, gap: 16 }}>
      {/* Earnings link */}
      <TouchableOpacity
        onPress={() => navigation.navigate(ScreenNames.Earnings as never)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "rgba(250,204,21,0.07)",
          borderWidth: 1,
          borderColor: "rgba(250,204,21,0.18)",
          borderRadius: 14,
          padding: 14,
        }}
        activeOpacity={0.8}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Icon name="TrendingUp" size={18} color="#FACC15" />
          <View>
            <Text style={{ color: "#F9FBFF", fontSize: 14, fontWeight: "700" }}>Earnings</Text>
            <Text style={{ color: "#8B8D90", fontSize: 11 }}>Tips, PPV & income breakdown</Text>
          </View>
        </View>
        <Icon name="ChevronRight" size={16} color="#FACC15" />
      </TouchableOpacity>

      <View className="flex-row items-center justify-between">
        <Text className="text-white text-base font-semibold">Engagement</Text>
        <View className="flex-row gap-2">
          {RANGES.map((r) => (
            <TouchableOpacity
              key={r}
              onPress={() => setRange(r)}
              className={`px-3 py-1 rounded-full ${range === r ? "bg-theme-accent" : "bg-theme-neutrals-800"}`}
            >
              <Text className={`text-xs font-medium ${range === r ? "text-black" : "text-theme-neutrals-300"}`}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View className="bg-theme-neutrals-800 rounded-2xl p-4">
        {loading ? (
          <View className="items-center justify-center h-36">
            <ActivityIndicator color="#888" />
          </View>
        ) : error || !chartData.length ? (
          <View className="items-center justify-center h-36">
            <Text className="text-theme-neutrals-500 text-sm">No data for this period</Text>
          </View>
        ) : (
          <>
            <MiniChart likesData={likesData} followersData={followersData} labels={labels} />
            <View className="flex-row gap-4 mt-2">
              <View className="flex-row items-center gap-1.5">
                <View className="w-3 h-0.5 bg-green-500" />
                <Text className="text-theme-neutrals-400 text-[11px]">Likes</Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <View className="w-3 h-0.5 bg-blue-500" />
                <Text className="text-theme-neutrals-400 text-[11px]">New Followers</Text>
              </View>
            </View>
          </>
        )}
      </View>

      {!loading && data && (
        <View className="flex-row gap-3">
          {totals.map((s) => (
            <View key={s.label} className="flex-1 bg-theme-neutrals-800 rounded-2xl p-4 items-center">
              <Text className="text-white text-lg font-bold">{s.value.toLocaleString()}</Text>
              <Text className="text-theme-neutrals-500 text-[11px] mt-0.5">{s.label}</Text>
            </View>
          ))}
        </View>
      )}
      </View>
    </ScrollView>
  );
};

export default AnalyticsRoute;
