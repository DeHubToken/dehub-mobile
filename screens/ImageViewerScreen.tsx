import React, { memo, useCallback, useEffect, useRef, useState } from "react";
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

/** Zoomable image — double-tap to zoom, pinch-to-zoom, pan when zoomed. */
const ZoomableImage = memo(
  ({ uri, onZoomChange }: { uri: string; onZoomChange?: (zoomed: boolean) => void }) => {
    const scale = useSharedValue(1);
    const savedScale = useSharedValue(1);
    const offsetX = useSharedValue(0);
    const offsetY = useSharedValue(0);
    const savedOffsetX = useSharedValue(0);
    const savedOffsetY = useSharedValue(0);
    const pinchFocalX = useSharedValue(0);
    const pinchFocalY = useSharedValue(0);

    // ── Double-tap: toggle 1x ↔ 2.5x ──
    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(250)
      .onEnd((e) => {
        if (scale.value > 1.05) {
          // Reset
          scale.value = withTiming(1, { duration: 300 });
          offsetX.value = withTiming(0, { duration: 300 });
          offsetY.value = withTiming(0, { duration: 300 });
          savedScale.value = 1;
          savedOffsetX.value = 0;
          savedOffsetY.value = 0;
          if (onZoomChange) runOnJS(onZoomChange)(false);
        } else {
          const target = 2.5;
          const fx = e.x - SCREEN_W / 2;
          const fy = e.y - SCREEN_H / 2;
          const tx = -fx * (target - 1);
          const ty = -fy * (target - 1);
          const maxX = (SCREEN_W * target - SCREEN_W) / 2;
          const maxY = (SCREEN_H * target - SCREEN_H) / 2;
          const cx = Math.max(-maxX, Math.min(maxX, tx));
          const cy = Math.max(-maxY, Math.min(maxY, ty));
          scale.value = withTiming(target, { duration: 300 });
          offsetX.value = withTiming(cx, { duration: 300 });
          offsetY.value = withTiming(cy, { duration: 300 });
          savedScale.value = target;
          savedOffsetX.value = cx;
          savedOffsetY.value = cy;
          if (onZoomChange) runOnJS(onZoomChange)(true);
        }
      });

    // ── Pinch: zoom 1–4x with focal point ──
    const pinch = Gesture.Pinch()
      .onStart((e) => {
        savedScale.value = scale.value;
        savedOffsetX.value = offsetX.value;
        savedOffsetY.value = offsetY.value;
        pinchFocalX.value = e.focalX - SCREEN_W / 2;
        pinchFocalY.value = e.focalY - SCREEN_H / 2;
      })
      .onUpdate((e) => {
        const newScale = Math.max(1, Math.min(4, savedScale.value * e.scale));
        const ratio = newScale / savedScale.value;
        offsetX.value =
          pinchFocalX.value + (savedOffsetX.value - pinchFocalX.value) * ratio;
        offsetY.value =
          pinchFocalY.value + (savedOffsetY.value - pinchFocalY.value) * ratio;
        scale.value = newScale;
      })
      .onEnd(() => {
        if (scale.value <= 1.05) {
          scale.value = withTiming(1, { duration: 200 });
          offsetX.value = withTiming(0, { duration: 200 });
          offsetY.value = withTiming(0, { duration: 200 });
          savedScale.value = 1;
          savedOffsetX.value = 0;
          savedOffsetY.value = 0;
          if (onZoomChange) runOnJS(onZoomChange)(false);
        } else {
          savedScale.value = scale.value;
          savedOffsetX.value = offsetX.value;
          savedOffsetY.value = offsetY.value;
          // Clamp offsets
          const maxX = Math.max(
            0,
            (SCREEN_W * scale.value - SCREEN_W) / 2,
          );
          const maxY = Math.max(
            0,
            (SCREEN_H * scale.value - SCREEN_H) / 2,
          );
          offsetX.value = withSpring(
            Math.max(-maxX, Math.min(maxX, offsetX.value)),
            { damping: 20, stiffness: 200 },
          );
          offsetY.value = withSpring(
            Math.max(-maxY, Math.min(maxY, offsetY.value)),
            { damping: 20, stiffness: 200 },
          );
          if (onZoomChange) runOnJS(onZoomChange)(true);
        }
      });

    // ── Pan: move image when zoomed (manualActivation fails when at 1x) ──
    const pan = Gesture.Pan()
      .minPointers(1)
      .maxPointers(2)
      .manualActivation(true)
      .onTouchesMove((_e, stateManager) => {
        if (scale.value > 1.05) {
          stateManager.activate();
        } else {
          stateManager.fail();
        }
      })
      .onStart(() => {
        savedOffsetX.value = offsetX.value;
        savedOffsetY.value = offsetY.value;
      })
      .onUpdate((e) => {
        offsetX.value = savedOffsetX.value + e.translationX;
        offsetY.value = savedOffsetY.value + e.translationY;
      })
      .onEnd(() => {
        const maxX = Math.max(
          0,
          (SCREEN_W * scale.value - SCREEN_W) / 2,
        );
        const maxY = Math.max(
          0,
          (SCREEN_H * scale.value - SCREEN_H) / 2,
        );
        offsetX.value = withSpring(
          Math.max(-maxX, Math.min(maxX, offsetX.value)),
          { damping: 20, stiffness: 200 },
        );
        offsetY.value = withSpring(
          Math.max(-maxY, Math.min(maxY, offsetY.value)),
          { damping: 20, stiffness: 200 },
        );
      });

    const composed = Gesture.Simultaneous(pinch, doubleTap, pan);

    const animStyle = useAnimatedStyle(() => ({
      transform: [
        { translateX: offsetX.value },
        { translateY: offsetY.value },
        { scale: scale.value },
      ],
    }));

    return (
      <View style={{ width: SCREEN_W, height: SCREEN_H, overflow: "hidden" }}>
        <GestureDetector gesture={composed}>
          <Animated.View
            style={[
              {
                width: SCREEN_W,
                height: SCREEN_H,
                justifyContent: "center",
                alignItems: "center",
              },
              animStyle,
            ]}
          >
            <Image
              source={{ uri }}
              style={{ width: SCREEN_W, height: SCREEN_H }}
              resizeMode="contain"
            />
          </Animated.View>
        </GestureDetector>
      </View>
    );
  },
);

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
  const [isZoomed, setIsZoomed] = useState(false);

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
    .enabled(!isZoomed)
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
      setIsZoomed(false);
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

  const handleZoomChange = useCallback((zoomed: boolean) => {
    setIsZoomed(zoomed);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: string }) => (
      <ZoomableImage uri={item} onZoomChange={handleZoomChange} />
    ),
    [handleZoomChange],
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
            scrollEnabled={!isZoomed}
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
