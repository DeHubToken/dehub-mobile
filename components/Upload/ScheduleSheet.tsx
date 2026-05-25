import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  ScrollView,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isBefore,
  startOfToday,
  addMonths,
  subMonths,
} from "date-fns";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";

interface ScheduleSheetProps {
  visible: boolean;
  onClose: () => void;
  scheduledDate: Date | null;
  onSchedule: (date: Date | null) => void;
}

export default function ScheduleSheet({
  visible,
  onClose,
  scheduledDate,
  onSchedule,
}: ScheduleSheetProps) {
  const today = startOfToday();

  const [currentMonth, setCurrentMonth] = useState(scheduledDate ?? today);
  const [selectedDate, setSelectedDate] = useState<Date | null>(scheduledDate);
  const [selectedTime, setSelectedTime] = useState<Date>(
    scheduledDate ?? new Date(Date.now() + 60 * 60 * 1000)
  );
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [androidPickerMode, setAndroidPickerMode] = useState<"date" | "time">("date");

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = monthStart.getDay(); // 0 = Sun
  const paddedDays: (Date | null)[] = [
    ...Array(startDayOfWeek).fill(null),
    ...daysInMonth,
  ];

  const handlePrevMonth = useCallback(() => {
    setCurrentMonth((m) => subMonths(m, 1));
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentMonth((m) => addMonths(m, 1));
  }, []);

  const handleDayPress = useCallback(
    (day: Date) => {
      if (isBefore(day, today)) return;
      setSelectedDate(day);
    },
    [today]
  );

  const handleTimeChange = useCallback((_: any, date?: Date) => {
    if (Platform.OS === "android") setShowTimePicker(false);
    if (date) setSelectedTime(date);
  }, []);

  const formatTime = (d: Date) => {
    let h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  };

  const handleConfirm = useCallback(() => {
    if (!selectedDate) return;
    const combined = new Date(selectedDate);
    combined.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
    onSchedule(combined);
    onClose();
  }, [selectedDate, selectedTime, onSchedule, onClose]);

  const handleClear = useCallback(() => {
    onSchedule(null);
    setSelectedDate(null);
    onClose();
  }, [onSchedule, onClose]);

  const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  return (
    <GlassModal
      visible={visible}
      onClose={onClose}
      presentation="bottom"
      maxHeight="90%"
      blurIntensity={40}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-white/10">
        <TouchableOpacity
          onPress={onClose}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="w-8 h-8 items-center justify-center"
        >
          <Icon name="X" size={20} color="#9CA3AF" />
        </TouchableOpacity>

        <Text className="text-white font-semibold text-base">Schedule Post</Text>

        <TouchableOpacity
          onPress={handleConfirm}
          disabled={!selectedDate}
          activeOpacity={0.7}
          className="flex-row items-center px-3 py-1.5 rounded-xl"
          style={{
            backgroundColor: selectedDate ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)",
            borderWidth: 1,
            borderColor: selectedDate ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)",
          }}
        >
          <Icon name="Check" size={14} color={selectedDate ? "#fff" : "#4B5563"} />
          <Text
            className="text-xs font-medium ml-1"
            style={{ color: selectedDate ? "#fff" : "#4B5563" }}
          >
            Confirm
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Month navigation */}
        <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
          <TouchableOpacity
            onPress={handlePrevMonth}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="w-8 h-8 items-center justify-center rounded-full"
          >
            <Icon name="ChevronLeft" size={18} color="#fff" />
          </TouchableOpacity>

          <Text className="text-white font-semibold text-sm">
            {format(currentMonth, "MMMM yyyy")}
          </Text>

          <TouchableOpacity
            onPress={handleNextMonth}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="w-8 h-8 items-center justify-center rounded-full"
          >
            <Icon name="ChevronRight" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Day labels */}
        <View className="flex-row px-4 mb-1">
          {DAY_LABELS.map((d) => (
            <View key={d} className="flex-1 items-center py-1">
              <Text className="text-xs text-zinc-500">{d}</Text>
            </View>
          ))}
        </View>

        {/* Calendar grid */}
        <View className="flex-row flex-wrap px-4">
          {paddedDays.map((day, i) => {
            if (!day) {
              return <View key={`empty-${i}`} style={{ width: `${100 / 7}%` }} />;
            }
            const isPast = isBefore(day, today);
            const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
            const isToday = isSameDay(day, today);

            return (
              <TouchableOpacity
                key={day.toISOString()}
                onPress={() => handleDayPress(day)}
                disabled={isPast}
                activeOpacity={0.7}
                style={{ width: `${100 / 7}%` }}
                className="items-center py-1"
              >
                <View
                  className="w-9 h-9 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: isSelected ? "#fff" : "transparent",
                    borderWidth: isToday && !isSelected ? 1 : 0,
                    borderColor: "rgba(255,255,255,0.3)",
                  }}
                >
                  <Text
                    className="text-xs font-medium"
                    style={{
                      color: isSelected ? "#000" : isPast ? "#374151" : "#fff",
                    }}
                  >
                    {format(day, "d")}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Time picker row */}
        <View className="mx-4 mt-4 border-t border-white/10 pt-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Icon name="Clock" size={16} color="#9CA3AF" />
              <Text className="text-white text-sm ml-2">Time</Text>
            </View>

            {Platform.OS === "ios" ? (
              <DateTimePicker
                value={selectedTime}
                mode="time"
                display="compact"
                onChange={handleTimeChange}
                style={{ marginRight: -8 }}
              />
            ) : (
              <TouchableOpacity
                onPress={() => setShowTimePicker(true)}
                activeOpacity={0.7}
                className="px-3 py-2 rounded-xl bg-white/[0.06] border border-white/10"
              >
                <Text className="text-white text-sm font-medium">
                  {formatTime(selectedTime)}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {Platform.OS === "android" && showTimePicker && (
            <DateTimePicker
              value={selectedTime}
              mode="time"
              display="default"
              onChange={handleTimeChange}
            />
          )}
        </View>

        {/* Clear button */}
        {scheduledDate && (
          <TouchableOpacity
            onPress={handleClear}
            activeOpacity={0.7}
            className="mx-4 mt-4 py-3 rounded-xl border border-red-500/20 items-center"
          >
            <Text className="text-red-400 text-sm font-medium">Remove Schedule</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </GlassModal>
  );
}
