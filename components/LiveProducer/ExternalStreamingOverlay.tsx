import React, { memo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { truncate } from '../../libs/strings.util';
import { LIVEPEER_RTMP_SERVER } from '../../config/constants';
import { Copy } from 'lucide-react-native';
import { copyToClipboard } from '../../libs/clipboard.utils';

interface ExternalStreamingOverlayProps {
  streamKeyValue: string | null;
  streamKeyLoading: boolean;
  onExitExternal: () => void;
}

const ExternalStreamingOverlay: React.FC<ExternalStreamingOverlayProps> = ({
  streamKeyValue,
  streamKeyLoading,
  onExitExternal,
}) => {
  const onCopy = (value: string) => () => copyToClipboard(value);

  return (
    <View className="px-6 w-full">
      <Text className="text-white/80 text-center text-[12px] leading-5">
        You can't start on the app if you are streaming externally. Start from your streaming software!
      </Text>
      <View className="mt-5 items-center">
        <View className="w-full max-w-xs">
          <View className="flex-row items-center mb-3">
            <Text className="text-white/50 text-[11px] mr-1">Stream Key:</Text>
            <TouchableOpacity
              onPress={streamKeyValue ? onCopy(streamKeyValue) : undefined}
              className="flex-1"
              disabled={!streamKeyValue}
            >
              <Text className="text-white/80 text-[11px]" numberOfLines={1}>
                {streamKeyValue ? truncate(streamKeyValue, 40) : streamKeyLoading ? 'Loading…' : '—'}
              </Text>
            </TouchableOpacity>
            {streamKeyValue && <Copy size={14} color="white" />}
          </View>
          <View className="flex-row items-center">
            <Text className="text-white/50 text-[11px] mr-1">Server URL:</Text>
            <TouchableOpacity
              onPress={onCopy(LIVEPEER_RTMP_SERVER)}
              className="flex-1"
            >
              <Text className="text-white/80 text-[11px]" numberOfLines={1}>
                {truncate(LIVEPEER_RTMP_SERVER, 44)}
              </Text>
            </TouchableOpacity>
            <Copy size={14} color="white" />
          </View>
        </View>
      </View>
      <TouchableOpacity
        onPress={onExitExternal}
        className="mt-6 self-center px-4 h-10 rounded-full bg-white/10 items-center justify-center"
        activeOpacity={0.85}
      >
        <Text className="text-white/80 text-xs font-semibold">Return to In-App Producer</Text>
      </TouchableOpacity>
    </View>
  );
};

export default memo(ExternalStreamingOverlay);
