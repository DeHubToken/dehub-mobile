import React, { memo, useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, Dimensions } from 'react-native';
import GlassModal from '../ui/GlassModal';
import { LiveStreamEntity } from '../../services/live.service';
import { truncate } from '../../libs/strings.util';
import { X, Copy } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { LIVEPEER_RTMP_SERVER } from '../../config/constants';
import { copyToClipboard } from '../../libs/clipboard.utils';

interface StreamDetailsTooltipProps {
  visible: boolean;
  sourceRect: { x: number; y: number; width: number; height: number } | null;
  streamEntity: LiveStreamEntity | null;
  streamKeyValue: string | null;
  streamKeyLoading: boolean;
  streamKeyError: string | null;
  onClose: () => void;
  onInteract: () => void;
}

const StreamDetailsTooltip: React.FC<StreamDetailsTooltipProps> = ({
  visible,
  sourceRect,
  streamEntity,
  streamKeyValue,
  streamKeyLoading,
  streamKeyError,
  onClose,
  onInteract,
}) => {
  const { width: screenWidth } = Dimensions.get('window');
  const tooltipWidth = Math.min(screenWidth - 64, 360);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedServer, setCopiedServer] = useState(false);

  const onCopy = useCallback((type: 'key' | 'server', value: string) => () => {
    copyToClipboard(value);
    if (type === 'key') {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 1600);
    } else {
      setCopiedServer(true);
      setTimeout(() => setCopiedServer(false), 1600);
    }
    onInteract();
  }, [onInteract]);

  if (!visible || !sourceRect || !streamEntity) return null;

  return (
    <GlassModal
      visible={visible}
      onClose={onClose}
      backdropScope="panel"
      wrapPanel={false}
    >
      <View
        style={{
          position: 'absolute',
          left: Math.min(Math.max(12, sourceRect.x), screenWidth - tooltipWidth - 12),
          top: sourceRect.y - 12,
          width: tooltipWidth,
        }}
      >
        <View className="rounded-xl overflow-hidden border border-white/10" onTouchStart={onInteract}>
          <BlurView intensity={80} tint="dark" style={{ position: 'absolute', inset: 0 }} />
            <View className="absolute inset-0 bg-black/30" />
            <View className="p-4 pb-5">
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                className="absolute top-2 right-2 p-1 rounded-full bg-white/10"
              >
                <X size={14} color="#ffffff" />
              </TouchableOpacity>
              <Text className="text-white font-semibold text-sm" numberOfLines={2}>
                {streamEntity.title || 'Untitled Stream'}
              </Text>
              {streamEntity.description ? (
                <Text className="text-white/70 text-[11px] mt-1.5" style={{ lineHeight: 17 }}>
                  {streamEntity.description}
                </Text>
              ) : null}
              <View className="mt-3">
                <Text className="text-white/50 text-[11px]">
                  Status: <Text className="text-white/70">{streamEntity.status || 'unknown'}</Text>
                </Text>
                {streamEntity.playbackId && (
                  <Text className="text-white/50 text-[11px] mt-1">
                    Playback ID: <Text className="text-white/70">{truncate(streamEntity.playbackId, 28)}</Text>
                  </Text>
                )}
                <View className="mt-1">
                  <View className="flex-row items-center">
                    <Text className="text-white/50 text-[11px] mr-1">Key:</Text>
                    {streamKeyLoading ? (
                      <Text className="text-white/40 text-[11px]">Loading…</Text>
                    ) : streamKeyError ? (
                      <Text className="text-red-400 text-[11px]" numberOfLines={1}>{truncate(streamKeyError, 32)}</Text>
                    ) : streamKeyValue ? (
                      <TouchableOpacity
                        onPress={onCopy('key', streamKeyValue)}
                        className="flex-1"
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text className="text-white/70 text-[11px]" numberOfLines={1}>
                          {copiedKey ? 'Copied!' : truncate(streamKeyValue, 36)}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <Text className="text-white/40 text-[11px]">Unavailable</Text>
                    )}
                    {!copiedKey && !streamKeyLoading && streamKeyValue && <Copy size={14} color="white" />}
                  </View>
                </View>
                {streamEntity.livepeerId && (
                  <Text className="text-white/50 text-[11px] mt-1">
                    Livepeer ID: <Text className="text-white/70">{truncate(streamEntity.livepeerId, 28)}</Text>
                  </Text>
                )}
                <View className="mt-2 flex-row items-center">
                  <Text className="text-white/50 text-[11px] mr-1">RTMP:</Text>
                  <TouchableOpacity
                    onPress={onCopy('server', LIVEPEER_RTMP_SERVER)}
                    className="flex-1"
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text className="text-white/70 text-[11px]" numberOfLines={1}>
                      {copiedServer ? 'Copied!' : truncate(LIVEPEER_RTMP_SERVER, 40)}
                    </Text>
                  </TouchableOpacity>
                  {!copiedServer && <Copy size={14} color="white" />}
                </View>
              </View>
            </View>
        </View>
        <View
          style={{
            position: 'absolute',
            bottom: -8,
            left: 28,
            width: 16,
            height: 16,
            transform: [{ rotate: '45deg' }],
          }}
        >
          <BlurView intensity={80} tint="dark" style={{ position: 'absolute', inset: 0, borderRadius: 4 }} />
          <View className="absolute inset-0 bg-black/30 rounded" />
          <View className="absolute inset-0 rounded border border-white/10" />
        </View>
      </View>
    </GlassModal>
  );
};

export default memo(StreamDetailsTooltip);
