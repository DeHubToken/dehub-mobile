/**
 * LiveSettingsPanel
 *
 * Slide-up panel for livestream settings: enableChat, schedule, minTip.
 * Follows the same design language as MonetizationPanel with toggle rows
 * and expandable inline forms.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import CustomSwitch from "../ui/CustomSwitch";


export type LiveSettingsState = {
  enableChat: boolean;
  scheduleEnabled: boolean;
  scheduledDate: Date | null;
  minTip: string;
};

export const INITIAL_LIVE_SETTINGS: LiveSettingsState = {
  enableChat: true,
  scheduleEnabled: false,
  scheduledDate: null,
  minTip: "1000",
};

type LiveSettingsPanelProps = {
  state: LiveSettingsState;
  onChange: (next: LiveSettingsState) => void;
};


const SECTION_HEIGHT_SCHEDULE = 220;
const SECTION_HEIGHT_TIP = 130;

type ExpandableSectionProps = {
  expanded: boolean;
  maxHeight: number;
  children: React.ReactNode;
};

const ExpandableSection: React.FC<ExpandableSectionProps> = ({
  expanded,
  maxHeight,
  children,
}) => {
  const height = useSharedValue(expanded ? maxHeight : 0);
  const opacity = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    height.value = withTiming(expanded ? maxHeight : 0, { duration: 220 });
    opacity.value = withTiming(expanded ? 1 : 0, { duration: 220 });
  }, [expanded, maxHeight, height, opacity]);

  const animStyle = useAnimatedStyle(() => ({
    height: height.value,
    opacity: opacity.value,
    overflow: "hidden" as const,
  }));

  return <Animated.View style={animStyle}>{children}</Animated.View>;
};


const LiveSettingsPanel: React.FC<LiveSettingsPanelProps> = ({
  state,
  onChange,
}) => {
  const [expandedSection, setExpandedSection] = useState<
    "schedule" | "minTip" | null
  >(null);

  // Date picker visibility (Android shows as a dialog)
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Draft tip value (not committed until confirm)
  const [tipDraft, setTipDraft] = useState(state.minTip);


  const handleChatToggle = useCallback(
    (val: boolean) => {
      onChange({ ...state, enableChat: val });
    },
    [state, onChange],
  );


  const handleScheduleToggle = useCallback(
    (val: boolean) => {
      if (val) {
        // Default to 6 hours from now
        const defaultDate = new Date(Date.now() + 6 * 60 * 60 * 1000);
        onChange({
          ...state,
          scheduleEnabled: true,
          scheduledDate: state.scheduledDate ?? defaultDate,
        });
        setExpandedSection("schedule");
      } else {
        onChange({ ...state, scheduleEnabled: false, scheduledDate: null });
        if (expandedSection === "schedule") setExpandedSection(null);
      }
    },
    [state, onChange, expandedSection],
  );

  const handleDateChange = useCallback(
    (_event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS === "android") setShowDatePicker(false);
      if (selectedDate) {
        // Keep existing time, update date
        const current = state.scheduledDate ?? new Date();
        const merged = new Date(selectedDate);
        merged.setHours(current.getHours(), current.getMinutes(), 0, 0);
        onChange({ ...state, scheduledDate: merged });
        // On Android, show time picker next
        if (Platform.OS === "android") {
          setTimeout(() => setShowTimePicker(true), 300);
        }
      }
    },
    [state, onChange],
  );

  const handleTimeChange = useCallback(
    (_event: DateTimePickerEvent, selectedTime?: Date) => {
      if (Platform.OS === "android") setShowTimePicker(false);
      if (selectedTime) {
        const current = state.scheduledDate ?? new Date();
        const merged = new Date(current);
        merged.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
        onChange({ ...state, scheduledDate: merged });
      }
    },
    [state, onChange],
  );

  const formattedDate = useMemo(() => {
    if (!state.scheduledDate) return "Not set";
    return state.scheduledDate.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [state.scheduledDate]);

  const confirmSchedule = useCallback(() => {
    setExpandedSection(null);
  }, []);


  const handleMinTipRowPress = useCallback(() => {
    setTipDraft(state.minTip);
    setExpandedSection((prev) => (prev === "minTip" ? null : "minTip"));
  }, [state.minTip]);

  const confirmTip = useCallback(() => {
    const num = Number(tipDraft);
    if (!Number.isFinite(num) || num < 0) {
      onChange({ ...state, minTip: "1000" });
    } else {
      onChange({ ...state, minTip: tipDraft });
    }
    setExpandedSection(null);
  }, [state, onChange, tipDraft]);

  const cancelTip = useCallback(() => {
    setExpandedSection(null);
  }, []);


  return (
    <View className="border-t border-theme-neutrals-700 mx-4 pt-2 pb-1">
      <View className="flex-row items-center justify-between py-3">
        <View className="flex-row items-center">
          <Ionicons name="chatbubble-outline" size={20} color="#fff" />
          <Text className="text-white text-sm ml-3">Live Chat</Text>
        </View>
        <CustomSwitch
          value={state.enableChat}
          onValueChange={handleChatToggle}
        />
      </View>

      <View className="flex-row items-center justify-between py-3">
        <View className="flex-row items-center">
          <Ionicons name="calendar-outline" size={20} color="#fff" />
          <Text className="text-white text-sm ml-3">Schedule</Text>
        </View>
        <CustomSwitch
          value={state.scheduleEnabled}
          onValueChange={handleScheduleToggle}
        />
      </View>
      <ExpandableSection
        expanded={expandedSection === "schedule" && state.scheduleEnabled}
        maxHeight={SECTION_HEIGHT_SCHEDULE}
      >
        <View className="pb-3">
          <Text className="text-white font-semibold text-sm mb-2">
            Schedule Livestream
          </Text>
          <Text className="text-theme-neutrals-400 text-xs mb-3">
            Must be at least 30 minutes from now
          </Text>

          <View className="flex-row items-center mb-3">
            <View className="flex-1 h-11 px-3 rounded-xl bg-theme-neutrals-900 border border-theme-neutrals-700 justify-center">
              <Text className="text-white text-sm">{formattedDate}</Text>
            </View>
          </View>

          <View className="flex-row gap-3 mb-2">
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              className="flex-1 flex-row items-center justify-center h-10 rounded-xl bg-theme-neutrals-900 border border-theme-neutrals-700"
            >
              <Ionicons name="calendar" size={16} color="#fff" />
              <Text className="text-white text-xs ml-2">Pick Date</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowTimePicker(true)}
              className="flex-1 flex-row items-center justify-center h-10 rounded-xl bg-theme-neutrals-900 border border-theme-neutrals-700"
            >
              <Ionicons name="time" size={16} color="#fff" />
              <Text className="text-white text-xs ml-2">Pick Time</Text>
            </TouchableOpacity>
          </View>

          {(showDatePicker || (Platform.OS === "ios" && expandedSection === "schedule")) && (
            <DateTimePicker
              value={state.scheduledDate ?? new Date(Date.now() + 6 * 60 * 60 * 1000)}
              mode="date"
              display={Platform.OS === "ios" ? "compact" : "default"}
              minimumDate={new Date()}
              onChange={handleDateChange}
              themeVariant="dark"
            />
          )}

          {showTimePicker && Platform.OS === "android" && (
            <DateTimePicker
              value={state.scheduledDate ?? new Date(Date.now() + 6 * 60 * 60 * 1000)}
              mode="time"
              display="default"
              onChange={handleTimeChange}
              themeVariant="dark"
            />
          )}

          <View className="flex-row justify-end mt-2 gap-3">
            <TouchableOpacity
              onPress={confirmSchedule}
              className="flex-row items-center px-4 py-2 rounded-lg bg-theme-blue-500"
            >
              <Ionicons name="checkmark" size={16} color="#fff" />
              <Text className="text-white text-sm ml-1">Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ExpandableSection>

      <TouchableOpacity
        onPress={handleMinTipRowPress}
        activeOpacity={0.7}
        className="flex-row items-center justify-between py-3"
      >
        <View className="flex-row items-center">
          <Ionicons name="diamond-outline" size={20} color="#fff" />
          <Text className="text-white text-sm ml-3">Min Tip</Text>
        </View>
        <Text className="text-theme-neutrals-400 text-sm">
          {state.minTip || "1000"} DHB
        </Text>
      </TouchableOpacity>
      <ExpandableSection
        expanded={expandedSection === "minTip"}
        maxHeight={SECTION_HEIGHT_TIP}
      >
        <View className="pb-3">
          <Text className="text-white font-semibold text-sm mb-2">
            Minimum Tip Amount
          </Text>
          <Text className="text-theme-neutrals-400 text-xs mb-1.5">
            Amount (DHB)
          </Text>
          <TextInput
            value={tipDraft}
            onChangeText={setTipDraft}
            placeholder="1000"
            placeholderTextColor="#6F7174"
            keyboardType="number-pad"
            className="h-11 px-3 rounded-xl bg-theme-neutrals-900 border border-theme-neutrals-700 text-white text-sm"
          />
          <View className="flex-row justify-end mt-3 gap-3">
            <TouchableOpacity onPress={cancelTip} className="px-4 py-2">
              <Text className="text-theme-neutrals-400 text-sm">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmTip}
              className="flex-row items-center px-4 py-2 rounded-lg bg-theme-blue-500"
            >
              <Ionicons name="checkmark" size={16} color="#fff" />
              <Text className="text-white text-sm ml-1">Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ExpandableSection>
    </View>
  );
};

export default React.memo(LiveSettingsPanel);
