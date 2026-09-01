import React, { memo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { truncate } from '../../libs/strings.util';
import { LIVEPEER_RTMP_SERVER } from '../../config/constants';
import { Copy, Wifi } from 'lucide-react-native';
import { copyToClipboard } from '../../libs/clipboard.utils';

interface ExternalStreamingOverlayProps {
  streamKeyValue: string | null;
  streamKeyLoading: boolean;
  onExitExternal: () => void;
  isLive?: boolean;
}

const ExternalStreamingOverlay: React.FC<ExternalStreamingOverlayProps> = ({
  streamKeyValue,
  streamKeyLoading,
  onExitExternal,
  isLive = false,
}) => {
  const onCopy = (value: string) => () => copyToClipboard(value);

  return (
    <View className="px-6 w-full items-center">
      {isLive ? (
        <View className="flex-row items-center gap-2 mb-3">
          <View className="w-2.5 h-2.5 rounded-full bg-white" />
          <Text className="text-white font-bold text-sm tracking-wider">STREAMING FROM EXTERNAL DEVICE</Text>
        </View>
      ) : (
        <View className="flex-row items-center gap-2 mb-3">
          <Wifi color="#A6A9AC" size={16} />
          <Text className="text-white/80 font-semibold text-sm">External Streaming Mode</Text>
        </View>
      )}

      <Text className="text-white/60 text-center text-[11px] leading-5 mb-4">
        {isLive
          ? 'Your stream is live via external software. The in-app camera is disabled.'
          : 'Connect your streaming software using the details below, then start broadcasting.'}
      </Text>

      <View className="w-full max-w-xs">
        <View className="flex-row items-center mb-3 bg-white/5 rounded-xl px-3 py-2">
          <Text className="text-white/50 text-[11px] mr-2 w-20">Stream Key</Text>
          <TouchableOpacity
            onPress={streamKeyValue ? onCopy(streamKeyValue) : undefined}
            className="flex-1 flex-row items-center"
            disabled={!streamKeyValue}
          >
            <Text className="text-white/80 text-[11px] flex-1" numberOfLines={1}>
              {streamKeyValue ? truncate(streamKeyValue, 30) : streamKeyLoading ? 'Loading…' : '—'}
            </Text>
            {streamKeyValue && <Copy size={13} color="#A6A9AC" />}
          </TouchableOpacity>
        </View>
        <View className="flex-row items-center bg-white/5 rounded-xl px-3 py-2">
          <Text className="text-white/50 text-[11px] mr-2 w-20">Server URL</Text>
          <TouchableOpacity
            onPress={onCopy(LIVEPEER_RTMP_SERVER)}
            className="flex-1 flex-row items-center"
          >
            <Text className="text-white/80 text-[11px] flex-1" numberOfLines={1}>
              {truncate(LIVEPEER_RTMP_SERVER, 30)}
            </Text>
            <Copy size={13} color="#A6A9AC" />
          </TouchableOpacity>
        </View>
      </View>

      {!isLive && (
        <TouchableOpacity
          onPress={onExitExternal}
          className="mt-5 self-center px-5 h-10 rounded-xl bg-white/10 items-center justify-center"
          activeOpacity={0.85}
        >
          <Text className="text-white/80 text-xs font-semibold">Use In-App Camera Instead</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default memo(ExternalStreamingOverlay);
