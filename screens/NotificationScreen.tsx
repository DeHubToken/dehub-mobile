import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  RefreshControl,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ScreenHeader from "../components/ScreenHeader";
import { getNotifications, markNotificationAsRead } from "../services/user.service";
import { toastError } from "../libs";
import { useAuth } from "../context/AuthContext";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../navigation/ScreenNames";
import { formatNotificationDate } from "../libs/date.util";

const NotificationScreen = () => {
  const { patchUser, user } = useAuth();
  const navigation = useNavigation<any>();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(
    async (address?: string) => {
      try {
        if (!address) {
          setLoading(false);
          return;
        }
        const res: any = await getNotifications(address, { unit: 40 });
        const payload = res?.data?.result || res?.result || res;
        if (payload) {
          setNotifications(payload);
          // Only patch if count changed to avoid re-render loops
          if (user?.notificationCount !== payload.length) {
            await patchUser?.({ notificationCount: payload.length });
          }
        } else {
          setNotifications([]);
        }
      } catch (e) {
        console.warn("[NotificationScreen] fetch error", e);
      } finally {
        setRefreshing(false);
        setLoading(false);
      }
    },
    [patchUser, user?.notificationCount]
  );

  useFocusEffect(
    useCallback(() => {
      const addr = user?.walletAddress || user?.address;
      fetchNotifications(addr);
    }, [fetchNotifications, user?.walletAddress, user?.address])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    const addr = user?.walletAddress || user?.address;
    fetchNotifications(addr);
  }, [fetchNotifications, user?.walletAddress, user?.address]);

  // Optimistic removal helper
  const optimisticRemove = useCallback(
    (id: string | number) => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (user?.notificationCount && user.notificationCount > 0) {
        patchUser?.({
          notificationCount: Math.max(0, user.notificationCount - 1),
        });
      }
    },
    [patchUser, user?.notificationCount]
  );

  // Row component with slide-left + optimistic removal
  const NotificationRow = useCallback(
    ({ item }: { item: any }) => {
  // console.log('[NotificationRow] item', item)
      const translateX = useRef(new Animated.Value(0)).current;
      const animatingRef = useRef(false);

      const iconName =
        item.type === "subscribe"
          ? "checkmark-circle"
          : item.type === "following"
            ? "person-add"
            : item.type === "tip"
              ? "cash"
              : item.type === "like"
                ? "thumbs-up"
                : "alert-circle";

      const handlePress = () => {
        if (animatingRef.current) return;
        animatingRef.current = true;
        const addr = user?.walletAddress || user?.address;

        // Start slide-left animation and remove when finished
        Animated.timing(translateX, {
          toValue: -160, // enough to visually slide out
          duration: 180,
          useNativeDriver: true,
        }).start(() => {
          optimisticRemove(item.id);
        });

        // Fire-and-forget mark as read (optimistic) with error handling & revert
        markNotificationAsRead(item._id).catch((err) => {
          console.error("[NotificationRow] mark as read error", err);
          setNotifications(prev => {
            const exists = prev.some(n => n.id === item.id || n._id === item._id);
            if (exists) return prev; // already present, nothing to do
            return [...prev, item];
          });
          // toastError(err, 'Failed to mark notification');
          if (user?.notificationCount !== undefined) {
            patchUser?.({ notificationCount: (user.notificationCount || 0) + 1 });
          }
        });

        // Navigate concurrently
        if (["like", "dislike", "comment"].includes(item.type)) {
          navigation.navigate(ScreenNames.VideoPlayer as any, { tokenId: item.tokenId });
        } else if (["tip", "following", "follow"].includes(item.type)) {
          // Profile tab lives inside BottomTabNavigator mounted at Root
          navigation.navigate(ScreenNames.Root as any, {
            screen: ScreenNames.Profile,
            params: { address: addr },
          });
        }
      };

      return (
        <TouchableOpacity activeOpacity={0.7} onPress={handlePress}>
          <Animated.View
            style={{ transform: [{ translateX }] }}
            className="flex-row items-center p-4 border-b border-theme-neutrals-700"
          >
            <View className="flex-row items-center flex-1">
              <Ionicons name={iconName} size={24} color="white" />
              <View className="flex-1 ml-4">
                <Text className="text-theme-neutrals-200 text-sm font-medium truncate">
                  {item.content}
                </Text>
                <Text className="text-theme-neutrals-400 text-xs mt-1">
                  {formatNotificationDate(item.updatedAt)}
                </Text>
              </View>
            </View>
            {item.image && (
              <Image source={item.image} className="w-12 h-12 rounded-md ml-4" />
            )}
          </Animated.View>
        </TouchableOpacity>
      );
    },
    [navigation, optimisticRemove, user?.walletAddress, user?.address]
  );

  const renderItem = useCallback(
    ({ item }: { item: any }) => <NotificationRow item={item} />,
    [NotificationRow]
  );

  // Skeleton rows
  const skeletonData = useMemo(
    () => Array.from({ length: 6 }, (_, i) => ({ key: `sk-${i}` })),
    []
  );
  const renderSkeleton = useCallback(
    () => (
      <View className="flex-row items-center p-4 border-b border-theme-neutrals-800">
        <View className="w-6 h-6 rounded-full bg-theme-neutrals-700" />
        <View className="flex-1 ml-4">
          <View className="h-3 w-2/3 bg-theme-neutrals-700 rounded" />
            <View className="h-3 w-1/3 bg-theme-neutrals-800 rounded mt-2" />
        </View>
        <View className="w-12 h-12 rounded-md bg-theme-neutrals-800 ml-4" />
      </View>
    ),
    []
  );

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title="Notifications" />
      {loading ? (
        <FlatList
          data={skeletonData}
          keyExtractor={(item) => item.key}
          renderItem={renderSkeleton}
        />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#fff"
            />
          }
          ListEmptyComponent={
            <View className="p-6 items-center">
              <Text className="text-theme-neutrals-400 text-xs">
                No notifications yet.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

export default NotificationScreen;
