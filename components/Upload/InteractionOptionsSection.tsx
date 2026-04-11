import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

export interface InteractionOptionsProps {
  enableChat: boolean;
  setEnableChat: (v: (prev: boolean) => boolean | boolean) => void;
  scheduleEnabled: boolean;
  setScheduleEnabled: (v: (prev: boolean) => boolean | boolean) => void;
  scheduledDate: Date | null;
  setScheduledDate: (d: Date | null) => void;
  minTip: string;
  setMinTip: (v: string) => void;
}

const InteractionOptionsSection: React.FC<InteractionOptionsProps> = ({
  enableChat,
  setEnableChat,
  scheduleEnabled,
  setScheduleEnabled,
  scheduledDate,
  setScheduledDate,
  minTip,
  setMinTip,
}) => {
  const [open, setOpen] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

  // When schedule is enabled and no date yet, preset to now + 6h
  useEffect(() => {
    if (scheduleEnabled && !scheduledDate) {
      setScheduledDate(new Date(Date.now() + SIX_HOURS_MS));
    }
  }, [scheduleEnabled, scheduledDate, setScheduledDate]);

  const formatDateTime = useCallback((d: Date | null) => {
    if (!d) return 'Pick Date & Time (+6h default)';
    const day = d.getDate().toString().padStart(2, '0');
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const month = monthNames[d.getMonth()];
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12; if (hours === 0) hours = 12;
    return `${day} ${month} ${year} • ${hours}:${minutes} ${ampm}`;
  }, []);

  const openPicker = useCallback(() => {
    if (Platform.OS === 'android') {
      setPickerMode('date');
      setShowPicker(true);
    } else {
      setPickerMode('datetime' as any); // iOS single combined picker
      setShowPicker(true);
    }
  }, []);

  const onChangePicker = useCallback((e: any, date?: Date) => {
    if (Platform.OS === 'android') {
      if (pickerMode === 'date') {
        if (date) {
          // keep time if previously set
          const base = scheduledDate || new Date(Date.now() + SIX_HOURS_MS);
          const merged = new Date(date);
          merged.setHours(base.getHours(), base.getMinutes(), 0, 0);
          setScheduledDate(merged);
        }
        // show time picker next
        setPickerMode('time');
        setShowPicker(true);
        return;
      }
      if (pickerMode === 'time') {
        setShowPicker(false);
        if (date) {
          const existing = scheduledDate || new Date(Date.now() + SIX_HOURS_MS);
            const updated = new Date(existing);
          updated.setHours(date.getHours(), date.getMinutes(), 0, 0);
          setScheduledDate(updated);
        }
        setPickerMode('date');
        return;
      }
    } else {
      // iOS combined
      if (date) setScheduledDate(date);
    }
    if (Platform.OS !== 'android') setShowPicker(false);
  }, [pickerMode, scheduledDate, setScheduledDate]);

  return (
    <View className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      <TouchableOpacity
        onPress={() => setOpen(o => !o)}
        className="px-4 py-3 flex-row items-center justify-between"
        activeOpacity={0.7}
      >
        <Text className="text-white font-semibold">Interaction</Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color="#9CA3AF"
        />
      </TouchableOpacity>
      {open && (
        <View className="px-4 pb-4">
          <View className="flex-row items-center justify-between py-2">
            <Text className="text-white">Enable Chat</Text>
            <TouchableOpacity
              onPress={() => setEnableChat(v => typeof v === 'function' ? !enableChat : !enableChat)}
              className={`w-10 h-6 rounded-full ${enableChat ? 'bg-blue-600' : 'bg-zinc-700'} items-${enableChat ? 'end' : 'start'} justify-center px-1`}
            >
              <View className="w-4 h-4 rounded-full bg-white" />
            </TouchableOpacity>
          </View>
          <View className="pt-2">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-white">Schedule</Text>
              <TouchableOpacity
                onPress={() => setScheduleEnabled(v => typeof v === 'function' ? !scheduleEnabled : !scheduleEnabled)}
                className={`w-10 h-6 rounded-full ${scheduleEnabled ? 'bg-blue-600' : 'bg-zinc-700'} items-${scheduleEnabled ? 'end' : 'start'} justify-center px-1`}
              >
                <View className="w-4 h-4 rounded-full bg-white" />
              </TouchableOpacity>
            </View>
            {scheduleEnabled && (
              <View className="mb-3">
                <TouchableOpacity
                  onPress={openPicker}
                  className="h-12 rounded-xl bg-zinc-900 border border-zinc-800 px-3 justify-center"
                >
                  <Text className="text-white text-sm" numberOfLines={1}>
                    {formatDateTime(scheduledDate)}
                  </Text>
                </TouchableOpacity>
                {showPicker && (
                  <DateTimePicker
                    value={scheduledDate || new Date(Date.now() + SIX_HOURS_MS)}
                    mode={Platform.OS === 'ios' ? 'datetime' : pickerMode}
                    onChange={onChangePicker}
                    minimumDate={new Date(Date.now() + 5 * 60 * 1000)}
                  />
                )}
              </View>
            )}
          </View>
          <View className="pt-1 flex-row items-center justify-between">
            <Text className="text-white mr-4">Min. Tip</Text>
            <TextInput
              value={minTip}
              onChangeText={setMinTip}
              keyboardType="number-pad"
              className="flex-1 h-12 rounded-xl bg-zinc-900 border border-zinc-800 px-3 text-white"
              placeholder="1000 DHB"
              placeholderTextColor="#525252"
            />
          </View>
        </View>
      )}
    </View>
  );
};

export default InteractionOptionsSection;
