import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { ScreenNames } from "../navigation/ScreenNames";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWindowDimensions } from "react-native";
import LiveTab from "../components/Upload/LiveTab";
import FeedTab from "../components/Upload/FeedTab";
import VideosTab from "../components/Upload/VideosTab";
import LiveTabSkeleton from "../components/Upload/Skeletons/LiveTabSkeleton";
import VideosTabSkeleton from "../components/Upload/Skeletons/VideosTabSkeleton";
import FeedTabSkeleton from "../components/Upload/Skeletons/FeedTabSkeleton";
import ScreenHeader from "../components/ScreenHeader";

// theme removed in favor of NativeWind classes

// Order: Video, Live, Feed (Feed disabled)
const tabs = ["Videos", "Live", "Feed"] as const;

type TabKey = (typeof tabs)[number];

export default function UploadScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();

  const normalizeTabParam = useCallback((raw?: unknown): TabKey => {
    const v = String(raw || "").toLowerCase();
    if (v === "live") return "Live";
    if (v === "feed") return "Feed";
    return "Videos";
  }, []);

  // Determine initial tab from route params but clamp to allowed (Feed remains disabled)
  const initialTab = useMemo<TabKey>(() => {
    const desired = normalizeTabParam(route?.params?.tab);
    // Feed is disabled, so fallback to Videos
    return desired === "Feed" ? "Videos" : desired;
  }, [route?.params?.tab, normalizeTabParam]);

  const [active, setActive] = useState<TabKey>(initialTab);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const lastAllowedIndexRef = useRef<number>(0); // 0: Videos, 1: Live

  // Lazy mount tabs to avoid heavy work on initial open (e.g., LiveTab fetching)
  const [mounted, setMounted] = useState<Record<TabKey, boolean>>({
    Videos: initialTab === "Videos",
    Live: initialTab === "Live",
    Feed: initialTab === "Feed", // still disabled, but keep generic
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
      let idx = Math.round(e.nativeEvent.contentOffset.x / width);
      // Prevent landing on disabled Feed (index 2)
      if (idx > 1) {
        idx = lastAllowedIndexRef.current;
        scrollRef.current?.scrollTo({ x: idx * width, animated: true });
      }
      const key = tabs[idx];
      setActive(key);
      setMounted((m) => (m[key] ? m : { ...m, [key]: true }));
    },
    [width]
  );

  const onPressTab = useCallback(
    (k: TabKey) => {
      // Feed is disabled
      if (k === "Feed") return;
      const idx = tabs.indexOf(k);
      lastAllowedIndexRef.current = idx; // 0 or 1
      setActive(k);
      setMounted((m) => (m[k] ? m : { ...m, [k]: true }));
      goToIndex(idx);
    },
    [goToIndex]
  );

  // Respond to route param changes while screen is mounted
  useEffect(() => {
    const desired = normalizeTabParam(route?.params?.tab);
    const target: TabKey = desired === "Feed" ? "Videos" : desired; // clamp
    if (target !== active) {
      const idx = tabs.indexOf(target);
      lastAllowedIndexRef.current = idx;
      setActive(target);
      setMounted((m) => (m[target] ? m : { ...m, [target]: true }));
      goToIndex(idx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.tab]);

  const Segment = ({
    label,
    onPress,
    active,
    disabled,
  }: {
    label: string;
    onPress: () => void;
    active: boolean;
    disabled?: boolean;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      className={`px-4 py-1.5 rounded-full ${
        active ? "bg-white/10" : ""
      } ${disabled ? "opacity-40" : ""}`}
    >
      <Text className={active ? "text-white" : "text-theme-neutrals-400"}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-black">
      <ScreenHeader title="Upload" />
      <View className="px-4 pt-3 pb-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-theme-neutrals-300 text-2xl font-semibold">Content type</Text>
          <View className="bg-theme-neutrals-800 rounded-full px-0 py-0 flex-row items-center">
            <Segment
              label="Video"
              onPress={() => onPressTab("Videos")}
              active={active === "Videos"}
            />
            <Segment
              label="Live"
              onPress={() => onPressTab("Live")}
              active={active === "Live"}
            />
            <Segment
              label="Feed"
              onPress={() => onPressTab("Feed")}
              active={active === "Feed"}
              // disabled
            />
          </View>
        </View>
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
      >
        <View style={{ width }} className="flex-1">
          {mounted.Videos ? (
            <VideosTab onClose={nav.goBack} />
          ) : (
            <VideosTabSkeleton />
          )}
        </View>
        <View style={{ width }} className="flex-1">
          {mounted.Live ? (
            <LiveTab onClose={nav.goBack} />
          ) : (
            <LiveTabSkeleton />
          )}
        </View>
        <View style={{ width }} className="flex-1">
          {mounted.Feed ? <FeedTab /> : <FeedTabSkeleton />}
        </View>
      </ScrollView>
    </View>
  );
}
