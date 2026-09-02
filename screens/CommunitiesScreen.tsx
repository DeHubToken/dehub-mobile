import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import ScreenHeader from "../components/ScreenHeader";
import CommunityCard from "../components/Communities/CommunityCard";
import CreateCommunitySheet from "../components/Communities/CreateCommunitySheet";
import Icon from "../components/ui/Icon";
import { theme } from "../theme";
import { useUser, useAuthState, useAuthActions } from "../context/AuthContext";
import {
  discoverCommunities,
  getCommunityActivityScores,
  getUserCommunities,
} from "../services/communities.service";
import type { Community, UserCommunityRow } from "../types/community";
import { ScreenNames } from "../navigation/ScreenNames";

type SortMode = "top" | "new" | "hot";

const CommunitiesScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const user = useUser() as any;
  const { isSignedIn } = useAuthState();
  const { requireAuth } = useAuthActions();
  const walletAddress = user?.address || user?.walletAddress || "";

  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("top");
  const [userRows, setUserRows] = useState<UserCommunityRow[]>([]);
  const [allCommunities, setAllCommunities] = useState<Community[]>([]);
  const [activityScores, setActivityScores] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [discover, scores, mine] = await Promise.all([
        discoverCommunities(),
        getCommunityActivityScores(),
        walletAddress ? getUserCommunities(walletAddress) : Promise.resolve([]),
      ]);
      setAllCommunities(discover);
      setActivityScores(scores);
      setUserRows(mine);
    } catch {
      // keep previous data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const userCommunityIds = useMemo(() => new Set(userRows.map((r) => r.community_id)), [userRows]);
  const roleMap = useMemo(() => {
    const map: Record<string, string> = {};
    userRows.forEach((r) => {
      map[r.community_id] = r.role;
    });
    return map;
  }, [userRows]);

  const myCommunities = useMemo(() => {
    return userRows
      .filter((m) => m.communities?.id)
      .map((m) => ({ ...m.communities, _role: m.role } as Community & { _role: string }));
  }, [userRows]);

  const otherCommunities = useMemo(() => {
    const list = allCommunities.filter((c) => !userCommunityIds.has(c.id));
    if (sortMode === "new") {
      return [...list].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }
    if (sortMode === "hot") {
      return [...list].sort((a, b) => {
        const sa = (a.member_count || 0) + (activityScores[a.id] || 0);
        const sb = (b.member_count || 0) + (activityScores[b.id] || 0);
        return sb - sa;
      });
    }
    return list;
  }, [allCommunities, userCommunityIds, sortMode, activityScores]);

  const filterBySearch = useCallback(
    <T extends Community>(list: T[]) =>
      search.trim()
        ? list.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
        : list,
    [search],
  );

  const flatData = useMemo(() => {
    type Row = Community & { _section?: string; _role?: string };
    const sortedMine = [...myCommunities].sort((a, b) => {
      if (a._role === "owner" && b._role !== "owner") return -1;
      if (a._role !== "owner" && b._role === "owner") return 1;
      return 0;
    });
    const mine = filterBySearch(sortedMine);
    const others = filterBySearch(otherCommunities);
    const out: Row[] = [];
    if (mine.length) {
      mine.forEach((c) => out.push({ ...c, _section: t("communities.myCommunities", "My communities"), _role: c._role }));
    }
    if (others.length) {
      others.forEach((c) => out.push({ ...c, _section: t("communities.discover", "Discover"), _role: roleMap[c.id] }));
    }
    return out;
  }, [myCommunities, otherCommunities, filterBySearch, roleMap, t]);

  const openCommunity = (slug: string) => {
    navigation.navigate(ScreenNames.CommunityDetail, { slug });
  };

  const handleCreate = () => {
    requireAuth(() => setCreateOpen(true));
  };

  const createButton = isSignedIn ? (
    <TouchableOpacity
      onPress={handleCreate}
      className="flex-row items-center gap-1 bg-white px-3 py-2 rounded-full"
    >
      <Icon name="Plus" size={16} color="#000" />
      <Text className="text-black text-sm font-semibold">{t("communities.create")}</Text>
    </TouchableOpacity>
  ) : undefined;

  const ListHeader = (
    <View>
      <View className="flex-row items-center bg-theme-neutrals-800 rounded-xl px-3 mb-3">
        <Icon name="Search" size={18} color="#A1A1AA" />
        <TextInput
          className="flex-1 text-white py-3 px-2 text-sm"
          placeholder={t("communities.searchPlaceholder")}
          placeholderTextColor="#8B8D90"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View className="flex-row gap-2 mb-4">
        {(["top", "new", "hot"] as SortMode[]).map((mode) => (
          <TouchableOpacity
            key={mode}
            onPress={() => setSortMode(mode)}
            hitSlop={{ top: 8, bottom: 8 }}
            className={`px-3 py-1.5 rounded-full border ${
              sortMode === mode ? "bg-white/10 border-white/20" : "border-white/10"
            }`}
          >
            <Text className={`text-xs font-medium ${sortMode === mode ? "text-white" : "text-zinc-400"}`}>
              {t(`communities.sort.${mode}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View className="flex-1 bg-theme-neutrals-900">
        <ScreenHeader title={t("communities.title")} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title={t("communities.title")} rightContent={createButton} />
      <FlatList
        data={flatData}
        keyExtractor={(item) => item.id}
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={9}
        removeClippedSubviews
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        ListHeaderComponent={ListHeader}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={theme.colors.accent}
          />
        }
        ListEmptyComponent={
          <Text className="text-zinc-400 text-center py-8">
            {t("communities.noCommunities")}
          </Text>
        }
        renderItem={({ item, index }) => {
          const showSection =
            index === 0 || flatData[index - 1]?._section !== item._section;
          return (
            <View>
              {showSection && (
                <Text className="text-zinc-400 text-xs font-semibold uppercase mb-2 mt-2">
                  {item._section}
                </Text>
              )}
              <CommunityCard
                community={item}
                role={item._role}
                onPress={() => openCommunity(item.slug)}
              />
            </View>
          );
        }}
      />
      <CreateCommunitySheet
        visible={createOpen}
        walletAddress={walletAddress}
        onClose={() => setCreateOpen(false)}
        onCreated={(c) => openCommunity(c.slug)}
      />
    </View>
  );
};

export default CommunitiesScreen;
