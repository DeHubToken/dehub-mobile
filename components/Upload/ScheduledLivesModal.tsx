import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import GlassModal from "../ui/GlassModal";
import { ScheduledLiveItem } from "../../services/live.service";
import { resolveThumbnail } from "../../libs";

type Props = {
  visible: boolean;
  onClose: () => void;
  scheduledLives: ScheduledLiveItem[];
  onOpen?: (item: ScheduledLiveItem) => void;
  dueLives?: ScheduledLiveItem[];
};

const ScheduledLivesModal: React.FC<Props> = ({
  visible,
  onClose,
  scheduledLives,
  onOpen,
  dueLives = [],
}) => {
  const formatFullDate = (d: string | number | Date | null | undefined) => {
    if (!d) return "";
    const date = new Date(d);
    if (isNaN(date.getTime())) return "";
    try {
      const timeStr = date.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      } as any);
      const dateStr = date.toLocaleDateString(undefined, {
        weekday: "short",
        month: "long",
        day: "2-digit",
        year: "numeric",
      } as any);
      return `${timeStr}, ${dateStr}`;
    } catch {
      return date.toString();
    }
  };
  const formatRelative = (d: string | number | Date | null | undefined) => {
    if (!d) return "";
    const target = new Date(d).getTime();
    const now = Date.now();
    if (!Number.isFinite(target)) return "";
    const diff = target - now;
    const abs = Math.abs(diff);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const month = 30 * day;
    const dir = diff >= 0 ? "in " : "";
    const suffix = diff < 0 ? " ago" : "";
    if (abs < minute) return diff >= 0 ? "in <1m" : "<1m ago";
    if (abs < hour) return `${dir}${Math.ceil(abs / minute)}m${suffix}`;
    if (abs < day) return `${dir}${Math.ceil(abs / hour)}hr${suffix}`;
    if (abs < month) return `${dir}${Math.ceil(abs / day)}d${suffix}`;
    const months = Math.ceil(abs / month);
    return `${dir}${months}mo${suffix}`;
  };
  return (
    <GlassModal
      visible={visible}
      onClose={onClose}
      presentation="center"
      maxHeight="70%"
      blurIntensity={30}
    >
      <View className="p-4">
        <Text className="text-white text-lg font-semibold mb-3">
          Scheduled Lives
        </Text>
        {scheduledLives.length === 0 && dueLives.length === 0 ? (
          <Text className="text-zinc-400 text-sm">
            No scheduled or due streams.
          </Text>
        ) : (
          <View>
            {scheduledLives.map((s) => {
              const dateStr = formatFullDate(s.scheduleAt as any);
              const relStr = formatRelative(s.scheduleAt as any);
              const thumbUrl = resolveThumbnail(s as any);
              const hasThumb = !!thumbUrl;
              return (
                <TouchableOpacity
                  key={s.streamId}
                  activeOpacity={0.85}
                  className="mb-3 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden flex-row items-start p-2"
                  onPress={() => {
                    onClose();
                    onOpen?.(s);
                  }}
                >
                  <View
                    className="rounded-md overflow-hidden bg-zinc-800 justify-center items-center"
                    style={{ width: 150, aspectRatio: 16 / 9 }}
                  >
                    {hasThumb ? (
                      <Image
                        source={{ uri: thumbUrl as string }}
                        className="absolute inset-0 w-full h-full"
                        resizeMode="cover"
                      />
                    ) : (
                      <View className="absolute inset-0 w-full h-full bg-zinc-800" />
                    )}
                  </View>
                  <View className="flex-1 ml-3">
                    <Text
                      className="text-white text-sm font-bold"
                      numberOfLines={2}
                    >
                      {s.name || "Untitled"}
                    </Text>
                    {dateStr ? (
                      <Text
                        className="text-theme-neutrals-300 text-xs mt-1"
                        numberOfLines={2}
                      >
                        {dateStr}
                      </Text>
                    ) : null}
                    {relStr ? (
                      <Text className="text-zinc-400 text-[11px] mt-0.5">
                        {relStr}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}

            {dueLives.length > 0 && (
              <>
                <View className="h-px bg-white/10 my-2" />
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-white text-sm font-semibold">
                    Due Streams
                  </Text>
                  <View className="px-2 py-0.5 rounded-full bg-white/10">
                    <Text className="text-[10px] text-white/80">
                      {dueLives.length}
                    </Text>
                  </View>
                </View>
                {dueLives.map((s) => {
                  const thumbUrl = resolveThumbnail(s as any);
                  const hasThumb = !!thumbUrl;
                  const dateStr = s.scheduleAt
                    ? formatFullDate(s.scheduleAt as any)
                    : "";
                  const relStr = s.scheduleAt
                    ? formatRelative(s.scheduleAt as any)
                    : "";
                  return (
                    <TouchableOpacity
                      key={s.streamId}
                      activeOpacity={0.85}
                      className="mb-3 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden flex-row items-start p-2"
                      onPress={() => {
                        onClose();
                        onOpen?.(s);
                      }}
                    >
                      <View
                        className="rounded-md overflow-hidden bg-zinc-800 justify-center items-center"
                        style={{ width: 150, aspectRatio: 16 / 9 }}
                      >
                        {hasThumb ? (
                          <Image
                            source={{ uri: thumbUrl as string }}
                            className="absolute inset-0 w-full h-full"
                            resizeMode="cover"
                          />
                        ) : (
                          <View className="absolute inset-0 w-full h-full bg-zinc-800" />
                        )}
                      </View>
                      <View className="flex-1 ml-3">
                        <Text
                          className="text-white text-sm font-bold"
                          numberOfLines={2}
                        >
                          {s.name || "Untitled"}
                        </Text>
                        <View className="flex justify-center items-start mt-1">
                          <View className="px-1.5 py-0.5 rounded bg-red-600/70 mr-2">
                            <Text className="text-[10px] text-white">
                              Offline
                            </Text>
                          </View>
                          {dateStr ? (
                            <Text
                              className="text-theme-neutrals-300 text-xs"
                              numberOfLines={1}
                            >
                              {dateStr}
                            </Text>
                          ) : null}
                        </View>
                        {relStr ? (
                          <Text className="text-zinc-400 text-[11px] mt-0.5">
                            {relStr}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </View>
        )}
      </View>
    </GlassModal>
  );
};

export default ScheduledLivesModal;
