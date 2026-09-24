import React, { memo, useCallback, useMemo } from "react";
import { View, TouchableOpacity, StyleSheet, Dimensions, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import Animated from "react-native-reanimated";
import { Image } from "expo-image";
import Icon from "../ui/Icon";
import { getImageUrlApiSimple } from "../../libs";
import { useAppTheme } from "../../context/ThemeContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Tile sizes follow from the outer padding and the gap, so each theme gets its
// own set: the system grid sits 8pt in from each edge with 2pt gutters; the
// minimal grid runs edge to edge with 1pt gutters on black, like web.
const makeGridMetrics = (gap: number, padding: number, placeholder: string) => {
  const small = (SCREEN_WIDTH - padding - gap * 2) / 3;
  const large = small * 2 + gap;
  const rowHeights = [large + gap, large + gap, small + gap];
  return {
    gap,
    padding,
    placeholder,
    small,
    large,
    rowHeights,
    patternHeight: rowHeights[0] + rowHeights[1] + rowHeights[2],
  };
};
type GridMetrics = ReturnType<typeof makeGridMetrics>;
const SYSTEM_GRID = makeGridMetrics(2, 16, "#1D1F21");
const MINIMAL_GRID = makeGridMetrics(1, 0, "#000");

interface ImagePost {
  id?: string | number;
  tokenId?: string | number;
  imageUrls?: string[];
  imageUrl?: string;
  thumbnailUrl?: string;
  [key: string]: any;
}

interface ProfileImageGridProps {
  images: ImagePost[];
  listRef?: React.RefObject<import("react-native").FlatList<any> | null>;
  onImagePress?: (index: number) => void;
  scrollEnabled?: boolean;
  /** Either a plain callback, or a Reanimated worklet scroll handler. */
  onScroll?: ((e: NativeSyntheticEvent<NativeScrollEvent>) => void) | any;
  ListHeaderComponent?: React.ReactElement | null;
}

interface GridRowData {
  key: string;
  rowType: 0 | 1 | 2;
  startIndex: number;
}

const buildRows = (count: number): GridRowData[] => {
  const rows: GridRowData[] = [];
  let index = 0;
  let rowNum = 0;
  while (index < count) {
    rows.push({ key: `gpr-${rowNum}`, rowType: (rowNum % 3) as 0 | 1 | 2, startIndex: index });
    index += 3;
    rowNum++;
  }
  return rows;
};

const ImageTile = memo<{ post: ImagePost; size: number; placeholder: string; onPress: () => void }>(
  ({ post, size, placeholder, onPress }) => {
    const uri = useMemo(() => {
      if (post.imageUrls?.length) return getImageUrlApiSimple(post.imageUrls[0]);
      return getImageUrlApiSimple(post.imageUrl || post.thumbnailUrl || "");
    }, [post.imageUrls, post.imageUrl, post.thumbnailUrl]);

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={{ width: size, height: size, backgroundColor: placeholder }}
      >
        <Image
          source={uri}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          recyclingKey={uri}
          cachePolicy="memory-disk"
          transition={150}
        />
        {(post.imageUrls?.length ?? 0) > 1 && (
          <View style={s.multiIcon}>
            <Icon name="Copy" size={14} color="#fff" />
          </View>
        )}
      </TouchableOpacity>
    );
  },
  (prev, next) =>
    prev.onPress === next.onPress && prev.post === next.post &&
    (prev.post.id ?? prev.post.tokenId) ===
      (next.post.id ?? next.post.tokenId) && prev.size === next.size &&
    prev.placeholder === next.placeholder,
);

const GridRow = memo<{ row: GridRowData; data: ImagePost[]; m: GridMetrics; onPress: (index: number) => void }>(
  ({ row, data, m, onPress }) => {
    const { rowType, startIndex } = row;
    const a = data[startIndex];
    const b = data[startIndex + 1];
    const c = data[startIndex + 2];
    const rowStyle = [s.row, { gap: m.gap, marginBottom: m.gap }];
    const colStyle = { gap: m.gap };

    if (rowType === 0) {
      return (
        <View style={rowStyle}>
          {a && <ImageTile post={a} size={m.large} placeholder={m.placeholder} onPress={() => onPress(startIndex)} />}
          <View style={colStyle}>
            {b && <ImageTile post={b} size={m.small} placeholder={m.placeholder} onPress={() => onPress(startIndex + 1)} />}
            {c && <ImageTile post={c} size={m.small} placeholder={m.placeholder} onPress={() => onPress(startIndex + 2)} />}
          </View>
        </View>
      );
    }
    if (rowType === 1) {
      return (
        <View style={rowStyle}>
          <View style={colStyle}>
            {a && <ImageTile post={a} size={m.small} placeholder={m.placeholder} onPress={() => onPress(startIndex)} />}
            {b && <ImageTile post={b} size={m.small} placeholder={m.placeholder} onPress={() => onPress(startIndex + 1)} />}
          </View>
          {c && <ImageTile post={c} size={m.large} placeholder={m.placeholder} onPress={() => onPress(startIndex + 2)} />}
        </View>
      );
    }
    return (
      <View style={rowStyle}>
        {a && <ImageTile post={a} size={m.small} placeholder={m.placeholder} onPress={() => onPress(startIndex)} />}
        {b && <ImageTile post={b} size={m.small} placeholder={m.placeholder} onPress={() => onPress(startIndex + 1)} />}
        {c && <ImageTile post={c} size={m.small} placeholder={m.placeholder} onPress={() => onPress(startIndex + 2)} />}
      </View>
    );
  },
);

const ProfileImageGrid: React.FC<ProfileImageGridProps> = ({ images, listRef, onImagePress, scrollEnabled = true, onScroll, ListHeaderComponent }) => {
  const { isMinimal } = useAppTheme();
  const m = isMinimal ? MINIMAL_GRID : SYSTEM_GRID;
  const rows = useMemo(() => buildRows(images.length), [images.length]);

  const renderRow = useCallback(
    ({ item: row }: { item: GridRowData }) => (
      <GridRow row={row} data={images} m={m} onPress={onImagePress ?? (() => {})} />
    ),
    [images, m, onImagePress],
  );

  const keyExtractor = useCallback((item: GridRowData) => item.key, []);
  const getItemLayout = useCallback(
    (_: any, index: number) => {
      const patternGroup = Math.floor(index / 3);
      const rowInPattern = index % 3;
      const offset =
        patternGroup * m.patternHeight +
        (rowInPattern >= 1 ? m.rowHeights[0] : 0) +
        (rowInPattern >= 2 ? m.rowHeights[1] : 0);
      return { length: m.rowHeights[rowInPattern], offset, index };
    },
    [m],
  );

  if (images.length === 0) return ListHeaderComponent ?? null;

  if (images.length < 4) {
    return (
      <Animated.FlatList
        ref={listRef}
        data={[]}
        keyExtractor={() => "x"}
        renderItem={null as any}
        ListHeaderComponent={
          <>
            {ListHeaderComponent}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: m.gap, paddingHorizontal: m.padding / 2 }}>
              {images.map((post, idx) => (
                <ImageTile
                  key={post.id ?? post.tokenId ?? idx}
                  post={post}
                  size={m.small}
                  placeholder={m.placeholder}
                  onPress={() => onImagePress?.(idx)}
                />
              ))}
            </View>
          </>
        }
        scrollEnabled={scrollEnabled}
        onScroll={onScroll}
        scrollEventThrottle={16}
      />
    );
  }

  return (
    <Animated.FlatList
        ref={listRef}
      data={rows}
      keyExtractor={keyExtractor}
      renderItem={renderRow}
      // getItemLayout assumes a fixed row pattern with no header; skip it when a
      // (variable-height) header is present so scroll offsets stay correct.
      getItemLayout={ListHeaderComponent ? undefined : getItemLayout}
      contentContainerStyle={{ paddingHorizontal: m.padding / 2 }}
      showsVerticalScrollIndicator={false}
      initialNumToRender={6}
      maxToRenderPerBatch={6}
      windowSize={5}
      removeClippedSubviews={false}
      scrollEnabled={scrollEnabled}
      onScroll={onScroll}
      ListHeaderComponent={ListHeaderComponent}
      scrollEventThrottle={16}
    />
  );
};

const s = StyleSheet.create({
  // Gaps come from the active GridMetrics, applied inline by GridRow.
  row: { flexDirection: "row" },
  multiIcon: { position: "absolute", top: 4, right: 4, backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 6, padding: 3 },
});

export default memo(ProfileImageGrid);
