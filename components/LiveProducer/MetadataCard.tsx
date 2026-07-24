import React, { forwardRef, memo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LiveStreamEntity } from '../../services/live.service';
import { truncate } from '../../libs/strings.util';

interface MetadataCardProps {
  loading: boolean;
  streamEntity: LiveStreamEntity | null;
  streamId?: string;
  onPress: () => void;
}

const MetadataCard = forwardRef<View, MetadataCardProps>(({ loading, streamEntity, streamId, onPress }, ref) => {
  return (
    <View className="absolute left-4 bottom-40 w-[54%]" pointerEvents="box-none">
      <TouchableOpacity
        ref={ref as any}
        activeOpacity={0.85}
        onPress={onPress}
        disabled={!streamEntity}
        className="bg-black/40 rounded-xl p-3 border border-white/10"
      >
        {loading ? (
          <View>
            <View className="h-4 w-40 rounded bg-white/10 mb-2" />
            <View className="h-3 w-24 rounded bg-white/10 mb-1" />
            <View className="h-3 w-32 rounded bg-white/10" />
          </View>
        ) : (
          <>
            <Text className="text-white font-semibold text-sm" numberOfLines={1}>
              {streamEntity?.title
                ? truncate(streamEntity.title, 40)
                : streamId
                ? `Stream ${streamId.slice(0, 6)}…`
                : ''}
            </Text>
            {streamEntity?.description ? (
              <Text className="text-white/60 text-[11px] mt-0.5" numberOfLines={2}>
                {truncate(streamEntity.description, 80)}
              </Text>
            ) : null}
          </>
        )}
      </TouchableOpacity>
    </View>
  );
});

export default memo(MetadataCard);
