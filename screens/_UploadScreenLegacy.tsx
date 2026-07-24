import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  KeyboardAvoidingView,
  Platform,
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
import TabButton from "../components/Upload/TabButton";
import { useProvider } from "../context/AuthContext";
import { ChainId } from "../config/constants";
import ChainSwitchModal from "../components/Settings/ChainSwitchModal";
import { Image } from "react-native";

// theme removed in favor of NativeWind classes

// Order: Video, Live, Feed
const tabs = ["Videos", "Live", "Feed"] as const;

type TabKey = (typeof tabs)[number];

export default function UploadScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { chainId, isSwitchingChain } = useProvider();

  const normalizeTabParam = useCallback((raw?: unknown): TabKey => {
    const v = String(raw || "").toLowerCase();
    if (v === "live") return "Live";
    if (v === "feed") return "Feed";
    return "Videos";
  }, []);

  // Determine initial tab from route params
  const initialTab = useMemo<TabKey>(() => {
    const desired = normalizeTabParam(route?.params?.tab);
    return desired;
  }, [route?.params?.tab, normalizeTabParam]);

  const [active, setActive] = useState<TabKey>(initialTab);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const lastAllowedIndexRef = useRef<number>(tabs.indexOf(initialTab));

  // Lazy mount tabs to avoid heavy work on initial open (e.g., LiveTab fetching)
  const [mounted, setMounted] = useState<Record<TabKey, boolean>>({
    Videos: initialTab === "Videos",
    Live: initialTab === "Live",
    Feed: initialTab === "Feed", // still disabled, but keep generic
  });
  const [chainModalVisible, setChainModalVisible] = useState(false);
  // console.log({ initialTab, routeTab: route?.params?.tab, active, mounted });

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
      const key = tabs[idx];
      setActive(key);
      setMounted((m) => (m[key] ? m : { ...m, [key]: true }));
    },
    [width]
  );

  const onPressTab = useCallback(
    (k: TabKey) => {
      const idx = tabs.indexOf(k);
      lastAllowedIndexRef.current = idx;
      setActive(k);
      setMounted((m) => (m[k] ? m : { ...m, [k]: true }));
      goToIndex(idx);
    },
    [goToIndex]
  );

  // Respond to route param changes while screen is mounted
  useEffect(() => {
    const desired = normalizeTabParam(route?.params?.tab);
    if (desired !== active) {
      const idx = tabs.indexOf(desired);
      lastAllowedIndexRef.current = idx;
      setActive(desired);
      setMounted((m) => (m[desired] ? m : { ...m, [desired]: true }));
      goToIndex(idx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.tab]);

  // Tab button callbacks
  const onPressVideos = useCallback(() => onPressTab("Videos"), [onPressTab]);
  const onPressLive = useCallback(() => onPressTab("Live"), [onPressTab]);
  const onPressFeed = useCallback(() => onPressTab("Feed"), [onPressTab]);

  const ChainButton = useCallback(() => {
    const onOpen = () => setChainModalVisible(true);
    const isBase = chainId === ChainId.BASE_MAINNET;
    const isBNB = chainId === ChainId.BSC_MAINNET;
    return (
      <TouchableOpacity
        onPress={onOpen}
        disabled={!!isSwitchingChain}
        activeOpacity={0.8}
        className={`w-10 h-10 rounded-full bg-theme-neutrals-800 items-center justify-center ml-2 ${isSwitchingChain ? 'opacity-50' : ''}`}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {isBase && (
          <Image source={require("../assets/chains/base-icon.png")} style={{ width: 20, height: 20 }} />
        )}
        {isBNB && (
          <Image source={require("../assets/chains/bnb-icon.png")} style={{ width: 20, height: 20 }} />
        )}
        {!isBase && !isBNB && (
          <Text className="text-theme-neutrals-300 text-xs">—</Text>
        )}
      </TouchableOpacity>
    );
  }, [chainId, isSwitchingChain]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <View className="flex-1 bg-black">
        <ScreenHeader
          title="Upload"
          rightContent={<ChainButton />}
        />
        <View className="px-4 pt-3 pb-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-theme-neutrals-300 text-2xl font-semibold">
              Content type
            </Text>
            <View className="bg-theme-neutrals-800 rounded-full px-0 py-0 flex-row items-center z-10">
              <TabButton label="Video" onPress={onPressVideos} active={active === "Videos"} />
              <TabButton label="Live" onPress={onPressLive} active={active === "Live"} />
              <TabButton label="Feed" onPress={onPressFeed} active={active === "Feed"} />
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
      <ChainSwitchModal
        visible={chainModalVisible}
        onClose={() => setChainModalVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}
