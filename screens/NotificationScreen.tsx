import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  RefreshControl,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
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

  // Enable LayoutAnimation on Android for smooth list reflow
  useEffect(() => {
    // Avoid calling in Fabric/New Arch where it's a no-op warning
    const isFabric = (global as any)?.nativeFabricUIManager != null;
    if (
      Platform.OS === "android" &&
      UIManager.setLayoutAnimationEnabledExperimental &&
      !isFabric
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  // Resolve a stable unique key for a notification item
  const resolveItemKey = useCallback((n: any, index?: number) => {
    const primary = n?.id || n?._id || n?.notificationId;
    if (primary != null) return String(primary);
    const composite = `${n?.type ?? ""}-${n?.tokenId ?? ""}-${n?.updatedAt ?? ""}-${n?.createdAt ?? ""}`;
    if (composite.replace(/-/g, "").length > 0) return composite;
    return index !== undefined ? `idx-${index}` : `${Math.random()}`;
  }, []);

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
    (resolvedKey: string) => {
      // Remove by the exact key used by FlatList
      setNotifications((prev) => prev.filter((n, i) => resolveItemKey(n, i) !== resolvedKey));
      if (user?.notificationCount && user.notificationCount > 0) {
        patchUser?.({
          notificationCount: Math.max(0, user.notificationCount - 1),
        });
      }
    },
    [patchUser, resolveItemKey, user?.notificationCount]
  );

  // Row component with slide-left + optimistic removal
  const NotificationRow = useCallback(
    ({ item, index }: { item: any; index: number }) => {
  // console.log('[NotificationRow] item', item)
      const translateX = useRef(new Animated.Value(0)).current;
      const opacity = useRef(new Animated.Value(1)).current;
      const animatingRef = useRef(false);
      const effectiveKey = resolveItemKey(item, index);

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
        // Snapshot values to avoid issues during re-render/removal
        const addr = user?.walletAddress || user?.address;
        const itemType: string | undefined = item?.type;
        const tokenId: number | string | undefined = item?.tokenId;

        // Smooth slide-left + fade out, then collapse space with LayoutAnimation
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.spring(translateX, {
            toValue: -50,
            useNativeDriver: true,
            friction: 7,
            tension: 70,
          }),
        ]).start(() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          optimisticRemove(effectiveKey);
        });

        // Fire-and-forget mark as read (optimistic) with error handling & revert
        if (item?._id) {
          markNotificationAsRead(item._id).catch((err) => {
          console.error("[NotificationRow] mark as read error", err);
          setNotifications(prev => {
            // Avoid duplicates by comparing resolved keys
            const removedKey = effectiveKey;
            const exists = prev.some((n, i) => resolveItemKey(n, i) === removedKey);
            if (exists) return prev; // already present
            return [...prev, item];
          });
          // toastError(err, 'Failed to mark notification');
          if (user?.notificationCount !== undefined) {
            patchUser?.({ notificationCount: (user.notificationCount || 0) + 1 });
          }
          });
        }

        // Navigate concurrently
        if (["like", "dislike", "comment"].includes(itemType ?? "")) {
          if (tokenId != null) {
            navigation.navigate(ScreenNames.VideoPlayer as any, { tokenId });
          } else {
            // Fallback: ignore navigation if tokenId missing
            // Optionally: toastError(new Error('Missing token id'), 'Unable to open video');
          }
        } else if (["tip", "following", "follow"].includes(itemType ?? "")) {
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
            style={{ transform: [{ translateX }], opacity }}
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
    ({ item, index }: { item: any; index: number }) => (
      <NotificationRow item={item} index={index} />
    ),
    [NotificationRow]
  );
  const keyExtractor = useCallback((item: any, index: number) => resolveItemKey(item, index), [resolveItemKey]);

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
          keyExtractor={keyExtractor}
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
