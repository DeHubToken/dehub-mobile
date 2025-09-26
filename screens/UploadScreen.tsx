import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../navigation/ScreenNames";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWindowDimensions } from "react-native";
import LiveTab from "../components/Upload/LiveTab";
import FeedTab from "../components/Upload/FeedTab";
import VideosTab from "../components/Upload/VideosTab";
import LiveTabSkeleton from "../components/Upload/Skeletons/LiveTabSkeleton";
import VideosTabSkeleton from "../components/Upload/Skeletons/VideosTabSkeleton";
import FeedTabSkeleton from "../components/Upload/Skeletons/FeedTabSkeleton";

// theme removed in favor of NativeWind classes

const tabs = ["Live", "Videos", "Feed"] as const;

type TabKey = (typeof tabs)[number];

export default function UploadScreen() {
  const nav = useNavigation<any>();
  const [active, setActive] = useState<TabKey>("Videos");
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  // Lazy mount tabs to avoid heavy work on initial open (e.g., LiveTab fetching)
  const [mounted, setMounted] = useState<Record<TabKey, boolean>>({
    Live: false,
    Videos: true, // first screen
    Feed: false,
  });

  useEffect(() => {
    const idx = tabs.indexOf(active);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: idx * width, animated: false });
    });
  }, [width]);

  const goToIndex = useCallback(
    (idx: number) => {
      scrollRef.current?.scrollTo({ x: idx * width, animated: true });
    },
    [width]
  );

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / width);
      const key = tabs[idx];
      setActive(key);
      setMounted((m) => (m[key] ? m : { ...m, [key]: true }));
    },
    [width]
  );

  const onPressTab = useCallback(
    (k: TabKey) => {
      const idx = tabs.indexOf(k);
      setActive(k);
      // Ensure destination tab is mounted before scroll for a smooth transition
      setMounted((m) => (m[k] ? m : { ...m, [k]: true }));
      goToIndex(idx);
    },
    [goToIndex]
  );

  const TabText = ({
    label,
    onPress,
    active,
  }: {
    label: TabKey;
    onPress: () => void;
    active: boolean;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      className={
        (active
          ? "bg-zinc-800 border-zinc-700"
          : "") +
        " px-4 py-2 rounded-full border"
      }
    >
      <Text className={active ? "text-white" : "text-gray-400"}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-black">
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
      >
        <View style={{ width }} className="flex-1">
          {mounted.Live ? (
            <LiveTab onClose={nav.goBack} />
          ) : (
            <LiveTabSkeleton />
          )}
        </View>
        <View style={{ width }} className="flex-1">
          {mounted.Videos ? (
            <VideosTab onClose={nav.goBack} />
          ) : (
            <VideosTabSkeleton />
          )}
        </View>
        <View style={{ width }} className="flex-1">
          {mounted.Feed ? <FeedTab /> : <FeedTabSkeleton />}
        </View>
      </ScrollView>

      <View
        style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 12 }}
      >
        <View className="flex-row justify-center items-center">
          {tabs.map((k) => (
            <View key={k} className="mx-1.5">
              <TabText label={k} onPress={() => onPressTab(k)} active={active === k} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
