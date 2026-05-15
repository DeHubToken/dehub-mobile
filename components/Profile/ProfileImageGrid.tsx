import React, { memo, useCallback, useMemo } from "react";
import { View, TouchableOpacity, FlatList, StyleSheet, Dimensions } from "react-native";
import { Image } from "expo-image";
import Icon from "../ui/Icon";
import { getImageUrlApiSimple } from "../../libs";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_GAP = 2;
const GRID_PADDING = 16;
const GRID_WIDTH = SCREEN_WIDTH - GRID_PADDING;
const SMALL = (GRID_WIDTH - GRID_GAP * 2) / 3;
const LARGE = SMALL * 2 + GRID_GAP;

const ROW_HEIGHTS = [LARGE + GRID_GAP, LARGE + GRID_GAP, SMALL + GRID_GAP];
const PATTERN_HEIGHT = ROW_HEIGHTS[0] + ROW_HEIGHTS[1] + ROW_HEIGHTS[2];

interface ImagePost {
  id: string | number;
  imageUrls?: string[];
  imageUrl?: string;
  thumbnailUrl?: string;
  [key: string]: any;
}

interface ProfileImageGridProps {
  images: ImagePost[];
  onImagePress?: (index: number) => void;
  scrollEnabled?: boolean;
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

const ImageTile = memo<{ post: ImagePost; size: number; onPress: () => void }>(
  ({ post, size, onPress }) => {
    const uri = useMemo(() => {
      if (post.imageUrls?.length) return getImageUrlApiSimple(post.imageUrls[0]);
      return getImageUrlApiSimple(post.imageUrl || post.thumbnailUrl || "");
    }, [post.imageUrls, post.imageUrl, post.thumbnailUrl]);

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={{ width: size, height: size, backgroundColor: "#262626" }}
      >
        <Image source={uri} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        {(post.imageUrls?.length ?? 0) > 1 && (
          <View style={s.multiIcon}>
            <Icon name="Copy" size={14} color="#fff" />
          </View>
        )}
      </TouchableOpacity>
    );
  },
  (prev, next) => prev.post.id === next.post.id && prev.size === next.size,
);

const GridRow = memo<{ row: GridRowData; data: ImagePost[]; onPress: (index: number) => void }>(
  ({ row, data, onPress }) => {
    const { rowType, startIndex } = row;
    const a = data[startIndex];
    const b = data[startIndex + 1];
    const c = data[startIndex + 2];

    if (rowType === 0) {
      return (
        <View style={[s.row, { marginBottom: GRID_GAP }]}>
          {a && <ImageTile post={a} size={LARGE} onPress={() => onPress(startIndex)} />}
          <View style={s.stackCol}>
            {b && <ImageTile post={b} size={SMALL} onPress={() => onPress(startIndex + 1)} />}
            {c && <ImageTile post={c} size={SMALL} onPress={() => onPress(startIndex + 2)} />}
          </View>
        </View>
      );
    }
    if (rowType === 1) {
      return (
        <View style={[s.row, { marginBottom: GRID_GAP }]}>
          <View style={s.stackCol}>
            {a && <ImageTile post={a} size={SMALL} onPress={() => onPress(startIndex)} />}
            {b && <ImageTile post={b} size={SMALL} onPress={() => onPress(startIndex + 1)} />}
          </View>
          {c && <ImageTile post={c} size={LARGE} onPress={() => onPress(startIndex + 2)} />}
        </View>
      );
    }
    return (
      <View style={[s.row, { marginBottom: GRID_GAP }]}>
        {a && <ImageTile post={a} size={SMALL} onPress={() => onPress(startIndex)} />}
        {b && <ImageTile post={b} size={SMALL} onPress={() => onPress(startIndex + 1)} />}
        {c && <ImageTile post={c} size={SMALL} onPress={() => onPress(startIndex + 2)} />}
      </View>
    );
  },
);

const ProfileImageGrid: React.FC<ProfileImageGridProps> = ({ images, onImagePress, scrollEnabled = true }) => {
  const rows = useMemo(() => buildRows(images.length), [images.length]);

  const renderRow = useCallback(
    ({ item: row }: { item: GridRowData }) => (
      <GridRow row={row} data={images} onPress={onImagePress ?? (() => {})} />
    ),
    [images, onImagePress],
  );

  const keyExtractor = useCallback((item: GridRowData) => item.key, []);
  const getItemLayout = useCallback(
    (_: any, index: number) => {
      const patternGroup = Math.floor(index / 3);
      const rowInPattern = index % 3;
      const offset =
        patternGroup * PATTERN_HEIGHT +
        (rowInPattern >= 1 ? ROW_HEIGHTS[0] : 0) +
        (rowInPattern >= 2 ? ROW_HEIGHTS[1] : 0);
      return { length: ROW_HEIGHTS[rowInPattern], offset, index };
    },
    [],
  );

  if (images.length === 0) return null;

  if (images.length < 4) {
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP, paddingHorizontal: GRID_PADDING / 2 }}>
        {images.map((post, idx) => (
          <ImageTile key={post.id} post={post} size={SMALL} onPress={() => onImagePress?.(idx)} />
        ))}
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={keyExtractor}
      renderItem={renderRow}
      getItemLayout={getItemLayout}
      contentContainerStyle={{ paddingHorizontal: GRID_PADDING / 2 }}
      showsVerticalScrollIndicator={false}
      initialNumToRender={6}
      maxToRenderPerBatch={6}
      windowSize={5}
      removeClippedSubviews
      scrollEnabled={scrollEnabled}
    />
  );
};

const s = StyleSheet.create({
  row: { flexDirection: "row", gap: GRID_GAP },
  stackCol: { gap: GRID_GAP },
  multiIcon: { position: "absolute", top: 4, right: 4 },
});

export default memo(ProfileImageGrid);
