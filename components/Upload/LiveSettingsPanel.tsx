import { useSurfaceDraft, draftIdentity } from '../../hooks/useSurfaceDraft';
/**
 * LiveSettingsPanel
 *
 * Slide-up panel for livestream settings: enableChat, schedule, minTip.
 * Follows the same design language as MonetizationPanel with toggle rows
 * and expandable inline forms.
 */
import { DhbCoin } from "../common/DhbCoin";
import { useTranslation } from "react-i18next";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import ScheduleSheet from "./ScheduleSheet";
import Icon from "../ui/Icon";
import GlassIndicator from "../ui/GlassIndicator";
import CustomSwitch from "../ui/CustomSwitch";


export type LiveSettingsState = {
  enableChat: boolean;
  scheduleEnabled: boolean;
  scheduledDate: Date | null;
  minTip: string;
  /**
   * Publish from OBS or another encoder rather than from the phone's camera.
   *
   * Picked in the live menu before anything is minted, so the producer opens
   * on the ingest details instead of a camera the creator does not want. It is
   * not shown in the settings panel — the menu is where the choice is made.
   */
  useEncoder: boolean;
  /**
   * Deliver over HLS from about twenty seconds behind live instead of WebRTC,
   * for a broadcast expected to draw a crowd. Optional so a draft saved before
   * it existed restores as a normal broadcast.
   */
  bigEvent?: boolean;
};

export const INITIAL_LIVE_SETTINGS: LiveSettingsState = {
  enableChat: true,
  scheduleEnabled: false,
  scheduledDate: null,
  minTip: "1000",
  useEncoder: false,
  bigEvent: false,
};

type LiveSettingsPanelProps = {
  draftScope?: string;
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
  draftScope = "post:new",
  state,
  onChange,
}) => {
  const { t, i18n } = useTranslation();
  const [expandedSection, setExpandedSection] = useState<
    "schedule" | "minTip" | null
  >(null);

  // Date picker visibility (Android shows as a dialog)
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Draft tip value (not committed until confirm)
  const [tipDraft, setTipDraft] = useSurfaceDraft("components/Upload/LiveSettingsPanel.tsx:tipDraft", state.minTip, draftScope);


  const handleChatToggle = useCallback(
    (val: boolean) => {
      onChange({ ...state, enableChat: val });
    },
    [state, onChange],
  );

  const handleBigEventToggle = useCallback(
    (val: boolean) => {
      onChange({ ...state, bigEvent: val });
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
        setShowDatePicker(true);
      } else {
        onChange({ ...state, scheduleEnabled: false, scheduledDate: null });
        if (expandedSection === "schedule") setExpandedSection(null);
      }
    },
    [state, onChange, expandedSection],
  );



  const formattedDate = useMemo(() => {
    if (!state.scheduledDate) return t("live.notSet");
    return state.scheduledDate.toLocaleString(i18n.language || undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [state.scheduledDate, t, i18n.language]);

  const confirmSchedule = useCallback(() => {
    setExpandedSection(null);
  }, []);


  const handleMinTipRowPress = useCallback(() => {
    setTipDraft.initialize(state.minTip);
    setExpandedSection((prev) => (prev === "minTip" ? null : "minTip"));
  }, [state.minTip, setTipDraft]);

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
          <Text className="text-white text-sm ml-3">{t("live.liveChat")}</Text>
        </View>
        <CustomSwitch
          value={state.enableChat}
          onValueChange={handleChatToggle}
        />
      </View>

      <View className="flex-row items-center justify-between py-3">
        <View className="flex-row items-center flex-1 pr-3">
          <Ionicons name="people-outline" size={20} color="#fff" />
          <View className="ml-3 flex-1">
            <Text className="text-white text-sm">{t("live.bigEvent")}</Text>
            <Text className="text-theme-neutrals-400 text-xs mt-0.5">
              {t("live.bigEventHint")}
            </Text>
          </View>
        </View>
        <CustomSwitch
          value={!!state.bigEvent}
          onValueChange={handleBigEventToggle}
        />
      </View>

      <View className="flex-row items-center justify-between py-3">
        <View className="flex-row items-center">
          <Ionicons name="calendar-outline" size={20} color="#fff" />
          <Text className="text-white text-sm ml-3">{t("upload.schedule")}</Text>
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
            {t("upload.scheduleLivestream")}
          </Text>
          <Text className="text-theme-neutrals-400 text-xs mb-3">
            {t("upload.scheduleMin30")}
          </Text>

          <TouchableOpacity
            onPress={() => setShowDatePicker(true)}
            accessibilityRole="button"
            className="flex-row items-center mb-3 h-11 px-3 rounded-xl bg-theme-neutrals-900 border border-theme-neutrals-700"
          >
            <Ionicons name="calendar" size={16} color="#fff" />
            <Text className="text-white text-sm ml-2 flex-1">{formattedDate}</Text>
            <Ionicons name="chevron-forward" size={16} color="#fff" />
          </TouchableOpacity>
          <ScheduleSheet
            visible={showDatePicker}
            onClose={() => setShowDatePicker(false)}
            scheduledDate={state.scheduledDate}
            onSchedule={(date) => onChange({ ...state, scheduleEnabled: !!date, scheduledDate: date })}
            title={t("upload.scheduleLivestream")}
            minimumMinutes={30}
            kind="live"
          />

          <View className="flex-row justify-end mt-2 gap-3">
            <TouchableOpacity
              onPress={confirmSchedule}
              className="flex-row items-center px-4 py-2 rounded-xl overflow-hidden"
            >
              <GlassIndicator borderRadius={12} />
              <Icon name="Check" size={16} color="#fff" />
              <Text className="text-white text-sm ml-1">{t("common.done")}</Text>
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
          <Text className="text-white text-sm ml-3">{t("live.minTip")}</Text>
        </View>
        <Text className="text-theme-neutrals-400 text-sm">
          {state.minTip || "1000"} <DhbCoin />
        </Text>
      </TouchableOpacity>
      <ExpandableSection
        expanded={expandedSection === "minTip"}
        maxHeight={SECTION_HEIGHT_TIP}
      >
        <View className="pb-3">
          <Text className="text-white font-semibold text-sm mb-2">
            {t("upload.minTipAmount")}
          </Text>
          <Text className="text-theme-neutrals-400 text-xs mb-1.5">
            {t("dao.amountLabel")}
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
              <Text className="text-theme-neutrals-400 text-sm">{t("common.cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmTip}
              className="flex-row items-center px-4 py-2 rounded-xl overflow-hidden"
            >
              <GlassIndicator borderRadius={12} />
              <Icon name="Check" size={16} color="#fff" />
              <Text className="text-white text-sm ml-1">{t("common.confirm")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ExpandableSection>
    </View>
  );
};

export default React.memo(LiveSettingsPanel);
