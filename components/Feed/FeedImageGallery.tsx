import React from 'react';
import { View, Image, TouchableOpacity } from 'react-native';

type ImageDef = { url: string; alt?: string };

const LazyImg = ({ url }: { url: string }) => {
  const [loaded, setLoaded] = React.useState(false);
  return (
    <View className="w-full h-full bg-neutral-800 overflow-hidden">
      {!loaded && <View className="absolute inset-0 bg-neutral-800 animate-pulse" />}
      <Image
        source={{ uri: url }}
        className="w-full h-full"
        resizeMode="cover"
        onLoadStart={() => setLoaded(false)}
        onLoadEnd={() => setLoaded(true)}
      />
    </View>
  );
};

type Props = { images: ImageDef[]; onPress?: (index: number) => void };

const FeedImageGallery = ({ images, onPress }: Props) => {
  const arr = Array.isArray(images) ? images.slice(0, 4) : [];
  const count = arr.length;
  if (!count) return null;

  const wrap = (child: React.ReactNode, index: number) => (
    <TouchableOpacity key={index} activeOpacity={0.9} onPress={() => onPress?.(index)}>
      {child}
    </TouchableOpacity>
  );

  if (count === 1) {
    return (
      <View className="px-3 pb-2">
        {/* Single box */}
        <View className="relative w-full overflow-hidden rounded-xl" style={{ height: 220 }}>
          {wrap(<LazyImg url={arr[0].url} />, 0)}
        </View>
      </View>
    );
  }

  if (count === 2) {
    return (
      <View className="px-3 pb-2">
        {/* Two boxes side-by-side */}
        <View className="flex flex-row gap-1" style={{ height: 220 }}>
          <View className="flex-1 overflow-hidden rounded-xl">{wrap(<LazyImg url={arr[0].url} />, 0)}</View>
          <View className="flex-1 overflow-hidden rounded-xl">{wrap(<LazyImg url={arr[1].url} />, 1)}</View>
        </View>
      </View>
    );
  }

  if (count === 3) {
    return (
      <View className="px-3 pb-2">
        {/* One left, two stacked on right */}
        <View className="flex flex-row gap-1" style={{ height: 220 }}>
          <View className="flex-1 overflow-hidden rounded-xl">{wrap(<LazyImg url={arr[0].url} />, 0)}</View>
          <View className="flex-1 flex-col gap-1">
            <View className="flex-1 overflow-hidden rounded-xl">{wrap(<LazyImg url={arr[1].url} />, 1)}</View>
            <View className="flex-1 overflow-hidden rounded-xl">{wrap(<LazyImg url={arr[2].url} />, 2)}</View>
          </View>
        </View>
      </View>
    );
  }

  if (count === 4) {
    return (
      <View className="px-3 pb-2">
        {/* Four square boxes */}
        <View className="flex flex-row gap-1">
          <View className="flex-1 flex-col gap-1">
            <View className="overflow-hidden rounded-xl" style={{ aspectRatio: 1 }}>
              {wrap(<LazyImg url={arr[0].url} />, 0)}
            </View>
            <View className="overflow-hidden rounded-xl" style={{ aspectRatio: 1 }}>
              {wrap(<LazyImg url={arr[2].url} />, 2)}
            </View>
          </View>
          <View className="flex-1 flex-col gap-1">
            <View className="overflow-hidden rounded-xl" style={{ aspectRatio: 1 }}>
              {wrap(<LazyImg url={arr[1].url} />, 1)}
            </View>
            <View className="overflow-hidden rounded-xl" style={{ aspectRatio: 1 }}>
              {wrap(<LazyImg url={arr[3].url} />, 3)}
            </View>
          </View>
        </View>
      </View>
    );
  }

  return null;
};

export default FeedImageGallery;
