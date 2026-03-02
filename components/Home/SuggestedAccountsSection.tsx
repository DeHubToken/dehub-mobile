/**
 * SuggestedAccountsSection – Horizontal carousel of suggested accounts.
 *
 * Fetches GET /suggested-accounts on mount, then renders only once data
 * arrives — no loading skeleton, no flash. Big-app pattern: invisible until ready.
 *
 * Placed as a ListHeaderComponent inside InfiniteVideoFeed on the HomeScreen.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, type ListRenderItem } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getSuggestedAccounts, type SuggestedAccount } from "../../services/user.service";
import { useAuth } from "../../context/AuthContext";
import SuggestedAccountCard from "./SuggestedAccountCard";
import type { FollowState } from "../Search/SearchAccountChip";


const SuggestedAccountsSection: React.FC = () => {
  const { user } = useAuth() as { user: { address?: string } | null };
  const [accounts, setAccounts] = useState<SuggestedAccount[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const fetchedRef = useRef(false);

  // Fetch once on mount (only when authenticated)
  useEffect(() => {
    if (!user?.address || fetchedRef.current) return;
    fetchedRef.current = true;

    let mounted = true;
    (async () => {
      const items = await getSuggestedAccounts();
      if (mounted && items.length > 0) {
        setAccounts(items);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [user?.address]);


  const handleDismissCard = useCallback((address: string) => {
    setAccounts((prev) => prev.filter((a) => a.address !== address));
  }, []);

  const handleDismissAll = useCallback(() => {
    setDismissed(true);
  }, []);

  const handleFollowChange = useCallback(
    (_address: string, _newState: FollowState) => {
      // Could remove card after follow, but keeping it is fine — user can dismiss.
    },
    [],
  );


  const visibleAccounts = useMemo(
    () => accounts.filter((a) => a.address),
    [accounts],
  );

  if (dismissed || visibleAccounts.length === 0) return null;

  const renderItem: ListRenderItem<SuggestedAccount> = ({ item }) => (
    <SuggestedAccountCard
      account={item}
      onFollowChange={handleFollowChange}
      onDismiss={handleDismissCard}
    />
  );

  const keyExtractor = (item: SuggestedAccount) => item.address;

  return (
    <View className="mb-3">
      {/* Header row */}
      <View className="flex-row items-center justify-between px-0 mb-2.5">
        <Text className="text-white text-sm font-semibold">
          Suggested for you
        </Text>
        <TouchableOpacity
          onPress={handleDismissAll}
          activeOpacity={0.7}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Ionicons name="close" size={18} color="#6F7174" />
        </TouchableOpacity>
      </View>

      {/* Horizontal scroll */}
      <FlatList
        data={visibleAccounts}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 0 }}
      />
    </View>
  );
};

export default React.memo(SuggestedAccountsSection);
