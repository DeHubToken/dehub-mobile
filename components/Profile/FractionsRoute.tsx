import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import Icon from "../ui/Icon";
import { supabase } from "../../services/supabase";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";

interface FractionHolding {
  token_id: string;
  quantity: number;
  last_trade_at: string;
}

interface FractionsRouteProps {
  address?: string;
  isOwnProfile?: boolean;
  listHeader?: React.ReactElement | null;
}

async function fetchHoldings(address: string): Promise<FractionHolding[]> {
  const addr = address.toLowerCase();

  const [{ data: bought, error: buyErr }, { data: sold, error: sellErr }] =
    await Promise.all([
      supabase
        .from("fraction_trades")
        .select("token_id, quantity, created_at")
        .eq("buyer_address", addr),
      supabase
        .from("fraction_trades")
        .select("token_id, quantity, created_at")
        .eq("seller_address", addr),
    ]);

  if (buyErr || sellErr) throw buyErr || sellErr;

  const map = new Map<string, { qty: number; last: string }>();

  (bought || []).forEach((t: any) => {
    const cur = map.get(t.token_id) ?? { qty: 0, last: t.created_at };
    map.set(t.token_id, {
      qty: cur.qty + t.quantity,
      last: t.created_at > cur.last ? t.created_at : cur.last,
    });
  });
  (sold || []).forEach((t: any) => {
    const cur = map.get(t.token_id) ?? { qty: 0, last: t.created_at };
    map.set(t.token_id, {
      qty: cur.qty - t.quantity,
      last: t.created_at > cur.last ? t.created_at : cur.last,
    });
  });

  return Array.from(map.entries())
    .filter(([, v]) => v.qty > 0)
    .map(([token_id, v]) => ({
      token_id,
      quantity: v.qty,
      last_trade_at: v.last,
    }))
    .sort(
      (a, b) =>
        new Date(b.last_trade_at).getTime() -
        new Date(a.last_trade_at).getTime(),
    );
}

const FractionsRoute: React.FC<FractionsRouteProps> = ({
  address,
  isOwnProfile,
  listHeader,
}) => {
  const navigation = useNavigation<any>();
  const { hideUserProfile } = useUserProfileSheet();
  const [holdings, setHoldings] = useState<FractionHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!address) { setLoading(false); return; }
      if (!silent) setLoading(true);
      setError(null);
      try {
        const data = await fetchHoldings(address);
        setHoldings(data);
      } catch {
        setError("Failed to load fraction holdings");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [address],
  );

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const renderItem = useCallback(
    ({ item }: { item: FractionHolding }) => (
      <TouchableOpacity
        onPress={() => {
          hideUserProfile();
          navigation.navigate(ScreenNames.FeedDetail as never, {
            postId: item.token_id,
          } as never);
        }}
        style={styles.card}
        activeOpacity={0.75}
      >
        <View style={styles.iconBox}>
          <Icon name="ChartPie" size={22} color="#FACC15" />
        </View>
        <Text style={styles.tokenId} numberOfLines={1}>
          Post #{item.token_id}
        </Text>
        <Text style={styles.quantity}>
          {item.quantity} fraction{item.quantity !== 1 ? "s" : ""}
        </Text>
        <Text style={styles.date}>
          {new Date(item.last_trade_at).toLocaleDateString()}
        </Text>
      </TouchableOpacity>
    ),
    [navigation, hideUserProfile],
  );

  if (loading) {
    return (
      <ScrollView>
        {listHeader}
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FACC15" />
        </View>
      </ScrollView>
    );
  }

  if (error) {
    return (
      <ScrollView>
        {listHeader}
        <View style={styles.center}>
          <Icon name="CircleAlert" size={40} color="#4B5563" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => load()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (!address || holdings.length === 0) {
    return (
      <ScrollView>
        {listHeader}
        <View style={styles.center}>
          <Icon name="ChartPie" size={48} color="#4B5563" />
          <Text style={styles.emptyTitle}>No fractions held</Text>
          <Text style={styles.emptySubtitle}>
            {isOwnProfile
              ? "Buy fractions of posts to support creators"
              : "This user holds no post fractions yet"}
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <FlatList
      data={holdings}
      keyExtractor={(h) => h.token_id}
      renderItem={renderItem}
      numColumns={2}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.grid}
      ListHeaderComponent={
        <>
          {listHeader}
          <Text style={styles.count}>
            {holdings.length} post{holdings.length !== 1 ? "s" : ""} held
          </Text>
        </>
      }
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
      }
    />
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  grid: { padding: 16, paddingBottom: 80 },
  row: { justifyContent: "space-between" },
  count: { color: "#6F7174", fontSize: 12, marginBottom: 12 },
  card: {
    width: "48%",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(250,204,21,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  tokenId: { color: "#F9FBFF", fontSize: 13, fontWeight: "600" },
  quantity: { color: "#FACC15", fontSize: 12, fontWeight: "600", marginTop: 3 },
  date: { color: "#6F7174", fontSize: 10, marginTop: 4 },
  errorText: { color: "#8B8D90", fontSize: 14, textAlign: "center" },
  retryBtn: { backgroundColor: "rgba(250,204,21,0.1)", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: "#FACC15", fontSize: 14, fontWeight: "600" },
  emptyTitle: { color: "#F9FBFF", fontSize: 16, fontWeight: "600" },
  emptySubtitle: { color: "#6F7174", fontSize: 13, textAlign: "center" },
});

export default FractionsRoute;
