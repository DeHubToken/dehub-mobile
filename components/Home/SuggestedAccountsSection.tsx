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
import { GestureDetector } from "react-native-gesture-handler";
import { useHorizontalScrollGuard } from "../../context/PagerGestureContext";
import { useTranslation } from "react-i18next";
import { getSuggestedAccounts, type SuggestedAccount } from "../../services/user.service";
import Icon from "../ui/Icon";
import { useUser } from "../../context/AuthContext";
import SuggestedAccountCard from "./SuggestedAccountCard";
import type { FollowState } from "../Search/SearchAccountChip";


const SuggestedAccountsSection: React.FC = () => {
  const user = useUser() as { address?: string } | null;
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<SuggestedAccount[]>([]);
  const [followedAddresses, setFollowedAddresses] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState(false);
  const fetchedRef = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);

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

  // Load more when all visible accounts have been followed
  useEffect(() => {
    const visible = accounts.filter((a) => a.address);
    if (visible.length > 0 && visible.every((a) => followedAddresses.has(a.address)) && !loadingMore) {
      let mounted = true;
      (async () => {
        setLoadingMore(true);
        const newItems = await getSuggestedAccounts();
        if (mounted) {
          // Replace with new batch and reset followed set
          if (newItems.length > 0) {
            setAccounts(newItems);
            setFollowedAddresses(new Set());
          } else {
            setDismissed(true);
          }
          setLoadingMore(false);
        }
      })();
      return () => {
        mounted = false;
      };
    }
  }, [accounts, followedAddresses, loadingMore]);

  const handleDismissCard = useCallback((address: string) => {
    setAccounts((prev) => prev.filter((a) => a.address !== address));
  }, []);

  const handleDismissAll = useCallback(() => {
    setDismissed(true);
  }, []);

  const handleFollowChange = useCallback(
    (address: string, newState: FollowState) => {
      setFollowedAddresses((prev) => {
        const next = new Set(prev);
        if (newState === "following" || newState === "pending") {
          next.add(address);
        } else {
          next.delete(address);
        }
        return next;
      });
    },
    [],
  );

  const visibleAccounts = useMemo(
    () => accounts.filter((a) => a.address),
    [accounts],
  );

  // While this carousel is scrolling it blocks Home's page-turn gesture, so a
  // sideways drag here scrolls the carousel instead of switching feed tabs.
  // Must stay above the early return below so hook order is stable.
  const scrollGuard = useHorizontalScrollGuard();

  if (dismissed || visibleAccounts.length === 0) return null;

  const renderItem: ListRenderItem<SuggestedAccount> = ({ item }) => (
    <SuggestedAccountCard
      account={item}
      onFollowChange={handleFollowChange}
      onDismiss={handleDismissCard}
    />
  );

  const keyExtractor = (item: SuggestedAccount) => item.address;

  const list = (
    <FlatList
      data={visibleAccounts}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      horizontal
      showsHorizontalScrollIndicator={false}
      nestedScrollEnabled
      contentContainerStyle={{ paddingHorizontal: 8 }}
    />
  );

  return (
    <View className="mb-3">
      {/* Header row */}
      <View className="flex-row items-center justify-between px-2 mb-2.5">
        <Text className="text-white text-sm font-semibold">
          {t("profile.followSuggestions")}
        </Text>
        <TouchableOpacity
          onPress={handleDismissAll}
          activeOpacity={0.7}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Icon name="X" size={18} color="#6F7174" />
        </TouchableOpacity>
      </View>

      {/* Horizontal scroll */}
      {scrollGuard ? <GestureDetector gesture={scrollGuard}>{list}</GestureDetector> : list}
    </View>
  );
};

export default React.memo(SuggestedAccountsSection);
