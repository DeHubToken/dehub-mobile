import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Image,
  Text,
  TouchableOpacity,
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StatusBar,
  Platform,
  BackHandler,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const DISMISS_THRESHOLD = 150;

const normalizeImageUri = (item: any): string => {
  if (!item) return "";
  if (typeof item === "string") return item;
  if (item.uri) return String(item.uri);
  return "";
};

const ImageViewerScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const {
    imageUrl,
    images: rawImages,
    index: paramIndex,
    initialIndex: paramInitialIndex,
    isModal,
  } = (route?.params as any) || {};

  const startIndex = paramInitialIndex ?? paramIndex ?? 0;

  const images: string[] = React.useMemo(() => {
    const src = rawImages?.length ? rawImages : imageUrl ? [imageUrl] : [];
    return src.map(normalizeImageUri).filter(Boolean);
  }, [rawImages, imageUrl]);

  const safeStartIndex = Math.max(0, Math.min(startIndex, images.length - 1));
  const [currentIndex, setCurrentIndex] = useState(safeStartIndex);
  const indexRef = useRef(safeStartIndex);

  const mainListRef = useRef<FlatList<any>>(null);
  const thumbListRef = useRef<FlatList<any>>(null);

  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const isDismissing = useRef(false);

  const closeViewer = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closeViewer();
      return true;
    });
    return () => sub.remove();
  }, [closeViewer]);

  const panGesture = Gesture.Pan()
    .activeOffsetY(15)
    .failOffsetX([-10, 10])
    .onUpdate((e) => {
      if (isDismissing.current) return;
      const dy = Math.max(0, e.translationY);
      translateY.value = dy;
      opacity.value = interpolate(dy, [0, DISMISS_THRESHOLD * 2], [1, 0.3], Extrapolation.CLAMP);
    })
    .onEnd((e) => {
      if (isDismissing.current) return;
      if (e.translationY > DISMISS_THRESHOLD) {
        isDismissing.current = true;
        translateY.value = withTiming(SCREEN_H, { duration: 200 });
        opacity.value = withTiming(0, { duration: 200 }, () => {
          runOnJS(closeViewer)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
        opacity.value = withSpring(1);
      }
    });

  const animatedContainer = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const animatedBg = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: SCREEN_W,
      offset: SCREEN_W * index,
      index,
    }),
    [],
  );

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const idx = Math.round(x / SCREEN_W);
      const clamped = Math.max(0, Math.min(idx, images.length - 1));
      indexRef.current = clamped;
      setCurrentIndex(clamped);
    },
    [images.length],
  );

  const scrollToImage = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(idx, images.length - 1));
      mainListRef.current?.scrollToIndex({ index: clamped, animated: true });
      indexRef.current = clamped;
      setCurrentIndex(clamped);
    },
    [images.length],
  );

  useEffect(() => {
    if (images.length > 1) {
      thumbListRef.current?.scrollToIndex({
        index: Math.max(0, Math.min(currentIndex, images.length - 1)),
        animated: true,
        viewPosition: 0.5,
      });
    }
  }, [currentIndex, images.length]);

  const renderItem = useCallback(
    ({ item }: { item: string }) => (
      <View
        style={{ width: SCREEN_W, height: SCREEN_H }}
        className="items-center justify-center"
      >
        <Image
          source={{ uri: item }}
          style={{ width: SCREEN_W, height: SCREEN_H }}
          resizeMode="contain"
        />
      </View>
    ),
    [],
  );

  const keyExtractor = useCallback((_: string, i: number) => `img-${i}`, []);

  const renderThumb = useCallback(
    ({ item, index }: { item: string; index: number }) => {
      const isActive = index === currentIndex;
      return (
        <TouchableOpacity
          onPress={() => scrollToImage(index)}
          activeOpacity={0.8}
          style={{
            marginRight: 8,
            borderRadius: 8,
            borderWidth: isActive ? 2 : 0,
            borderColor: isActive ? "#fff" : "transparent",
          }}
        >
          <Image
            source={{ uri: item }}
            style={{ width: 56, height: 56, borderRadius: 6 }}
            resizeMode="cover"
          />
        </TouchableOpacity>
      );
    },
    [currentIndex, scrollToImage],
  );

  const thumbKeyExtractor = useCallback((_: string, i: number) => `thumb-${i}`, []);

  const showStrip = images.length > 1;

  return (
    <View className="flex-1 bg-black">
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <Animated.View
        style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#000" }, animatedBg]}
      />

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[{ flex: 1 }, animatedContainer]}>
          <FlatList
            ref={mainListRef}
            data={images}
            keyExtractor={keyExtractor}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={safeStartIndex}
            getItemLayout={getItemLayout}
            renderItem={renderItem}
            onMomentumScrollEnd={onScrollEnd}
            bounces={false}
            windowSize={3}
            maxToRenderPerBatch={3}
            removeClippedSubviews={Platform.OS !== "ios"}
          />
        </Animated.View>
      </GestureDetector>

      <View
        className="absolute z-50 flex-row items-center justify-between"
        style={{ top: insets.top + 8, left: 12, right: 12 }}
      >
        <TouchableOpacity
          onPress={closeViewer}
          activeOpacity={0.7}
          className="bg-black/50 p-2 rounded-full"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        {images.length > 1 && (
          <View className="bg-black/50 px-3 py-1 rounded-full">
            <Text className="text-white text-xs font-semibold">
              {currentIndex + 1} / {images.length}
            </Text>
          </View>
        )}
      </View>

      {showStrip && (
        <View
          className="absolute left-0 right-0"
          style={{ bottom: insets.bottom + 12 }}
        >
          <FlatList
            ref={thumbListRef}
            data={images}
            keyExtractor={thumbKeyExtractor}
            renderItem={renderThumb}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16 }}
            extraData={currentIndex}
            getItemLayout={(_, i) => ({ length: 64, offset: 64 * i, index: i })}
          />
        </View>
      )}
    </View>
  );
};

export default ImageViewerScreen;
