import React, { useState } from "react";
import { Image, Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import SheetDismissHandle from "../ui/SheetDismissHandle";
import CustomSwitch from "../ui/CustomSwitch";
import type { PhoneStudio } from "../../hooks/usePhoneStudio";
import {
  BACKGROUND_COLORS,
  BACKGROUND_MODES,
  COUNTDOWN_MINUTES,
  SCENE_IDS,
  SOURCE_POSITIONS,
  SOURCE_SIZES,
} from "../../libs/phone-studio/scenes";

type Tab = "scenes" | "background" | "sources" | "widgets";
const TABS: Tab[] = ["scenes", "background", "sources", "widgets"];

interface StudioSheetProps {
  visible: boolean;
  studio: PhoneStudio;
  onClose: () => void;
}

function Chip({
  label,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      className={`mr-2 mb-2 px-3 py-2 rounded-xl border ${
        selected ? "bg-white/20 border-white/30" : "bg-white/5 border-white/10"
      } ${disabled ? "opacity-40" : ""}`}
      hitSlop={{ top: 6, bottom: 6 }}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
    >
      <Text className={`text-xs font-medium ${selected ? "text-white" : "text-white/60"}`}>{label}</Text>
    </TouchableOpacity>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text className="text-white/50 text-[11px] font-semibold uppercase mb-2 mt-1">{children}</Text>;
}

/**
 * The phone studio — scenes, background, an image or logo, and widgets in the
 * video — as one sheet over the preview, built like the look picker next door
 * (VideoLookSheet). Nothing dismisses on select: every change shows in the
 * preview underneath straight away, because the preview IS the outgoing
 * picture.
 *
 * Wording is shared with the web studio's deck (`studioDeck.*`).
 */
const StudioSheet: React.FC<StudioSheetProps> = ({ visible, studio, onClose }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("scenes");

  const tabLabel = (id: Tab) =>
    id === "scenes"
      ? t("studioDeck.scenes.title")
      : id === "background"
        ? t("studioDeck.background.title")
        : id === "sources"
          ? t("studioDeck.sources.title")
          : t("studioDeck.widgets.tab");

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        className="flex-1"
        activeOpacity={1}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t("common.close")}
      />
      <View
        className="bg-zinc-950 border-t border-white/10 rounded-t-2xl px-4 pt-4"
        style={{ paddingBottom: Math.max(32, insets.bottom + 16), maxHeight: "70%" }}
      >
        <SheetDismissHandle onClose={onClose} className="flex-row items-center justify-between mb-3">
          <Text className="text-white text-base font-semibold">{t("studioDeck.phone.title")}</Text>
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.8}
            className="px-3 py-1.5 rounded-xl bg-white/10"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
          >
            <Text className="text-white text-xs font-medium">{t("common.done")}</Text>
          </TouchableOpacity>
        </SheetDismissHandle>

        <View className="flex-row mb-3 rounded-xl bg-white/5 p-1" accessibilityRole="tablist">
          {TABS.map((id) => {
            const selected = id === tab;
            return (
              <TouchableOpacity
                key={id}
                onPress={() => setTab(id)}
                activeOpacity={0.8}
                className={`flex-1 py-2 rounded-lg items-center ${selected ? "bg-white/15" : ""}`}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
                <Text className={`text-xs font-semibold ${selected ? "text-white" : "text-white/50"}`} numberOfLines={1}>
                  {tabLabel(id)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {tab === "scenes" ? <ScenesPanel studio={studio} /> : null}
          {tab === "background" ? <BackgroundPanel studio={studio} /> : null}
          {tab === "sources" ? <SourcesPanel studio={studio} /> : null}
          {tab === "widgets" ? <WidgetsPanel studio={studio} /> : null}
        </ScrollView>
      </View>
    </Modal>
  );
};

function ScenesPanel({ studio }: { studio: PhoneStudio }) {
  const { t } = useTranslation();
  return (
    <View>
      {SCENE_IDS.map((id) => {
        const selected = studio.scene === id;
        return (
          <TouchableOpacity
            key={id}
            onPress={() => studio.setScene(id)}
            activeOpacity={0.85}
            className={`mb-2 px-3 py-3 rounded-xl border ${
              selected ? "bg-white/15 border-white/30" : "bg-white/5 border-white/10"
            }`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text className="text-white text-sm font-semibold">{t(`studioDeck.scenes.names.${id}`)}</Text>
            <Text className="text-white/50 text-[11px] mt-0.5">{t(`studioDeck.scenes.hints.${id}`)}</Text>
          </TouchableOpacity>
        );
      })}
      <Label>{t("studioDeck.scenes.countdown")}</Label>
      <View className="flex-row flex-wrap">
        {COUNTDOWN_MINUTES.map((m) => (
          <Chip
            key={m}
            label={m === 0 ? t("studioDeck.scenes.noCountdown") : t("studioDeck.scenes.minutes", { count: m })}
            selected={studio.countdownMinutes === m}
            onPress={() => studio.setCountdownMinutes(m)}
          />
        ))}
      </View>
    </View>
  );
}

function BackgroundPanel({ studio }: { studio: PhoneStudio }) {
  const { t } = useTranslation();
  if (!studio.backgroundSupported) {
    return <Text className="text-white/60 text-xs">{t("studioDeck.background.failed")}</Text>;
  }
  const { background } = studio;
  return (
    <View>
      <View className="flex-row flex-wrap">
        {BACKGROUND_MODES.map((mode) => (
          <Chip
            key={mode}
            label={t(`studioDeck.background.modes.${mode}`)}
            selected={background.mode === mode}
            onPress={() => void studio.setBackgroundMode(mode)}
          />
        ))}
      </View>
      {background.mode === "color" ? (
        <View className="flex-row flex-wrap mt-1">
          {BACKGROUND_COLORS.map((color) => {
            const selected = background.color.toLowerCase() === color;
            return (
              <TouchableOpacity
                key={color}
                onPress={() => studio.setBackgroundColor(color)}
                activeOpacity={0.8}
                className={`mr-2 mb-2 w-9 h-9 rounded-full border-2 ${selected ? "border-white" : "border-white/10"}`}
                style={{ backgroundColor: color }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={color}
              />
            );
          })}
        </View>
      ) : null}
      {background.mode === "image" && background.imageUri ? (
        <View className="flex-row items-center mt-1">
          <Image source={{ uri: background.imageUri }} className="w-16 h-16 rounded-lg mr-3" resizeMode="cover" />
          <TouchableOpacity
            onPress={() => void studio.pickBackground()}
            activeOpacity={0.8}
            className="px-3 py-2 rounded-xl bg-white/10"
            accessibilityRole="button"
          >
            <Text className="text-white text-xs font-medium">{t("studioDeck.scenes.picture")}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <Text className="text-white/40 text-[11px] mt-3">{t("studioDeck.background.hint")}</Text>
    </View>
  );
}

function SourcesPanel({ studio }: { studio: PhoneStudio }) {
  const { t } = useTranslation();
  const { image } = studio;
  return (
    <View>
      {image ? (
        <>
          <View className="flex-row items-center mb-3">
            <Image source={{ uri: image.uri }} className="w-14 h-14 rounded-lg mr-3" resizeMode="contain" />
            <View className="flex-1">
              <Text className="text-white text-sm font-semibold">{t("studioDeck.sources.image")}</Text>
              <View className="flex-row items-center mt-1">
                <Text className="text-white/60 text-xs mr-2">{t("studioDeck.sources.show")}</Text>
                <CustomSwitch
                  value={image.visible}
                  onValueChange={studio.setImageVisible}
                  accessibilityLabel={t("studioDeck.sources.show")}
                />
              </View>
            </View>
            <TouchableOpacity
              onPress={studio.removeImage}
              activeOpacity={0.8}
              className="px-3 py-2 rounded-xl bg-white/10"
              accessibilityRole="button"
            >
              <Text className="text-white text-xs font-medium">{t("studioDeck.remove")}</Text>
            </TouchableOpacity>
          </View>
          <View className="flex-row flex-wrap">
            {SOURCE_POSITIONS.map((p) => (
              <Chip
                key={p}
                label={t(`studioDeck.sources.positions.${p}`)}
                selected={image.position === p}
                onPress={() => studio.setImagePosition(p)}
              />
            ))}
          </View>
          <View className="flex-row flex-wrap">
            {SOURCE_SIZES.map((s) => (
              <Chip
                key={s}
                label={t(`studioDeck.sources.sizes.${s}`)}
                selected={image.size === s}
                onPress={() => studio.setImageSize(s)}
              />
            ))}
          </View>
        </>
      ) : null}
      <TouchableOpacity
        onPress={() => void studio.pickImage()}
        activeOpacity={0.85}
        className="mt-1 px-3 py-3 rounded-xl bg-white/5 border border-white/10 items-center"
        accessibilityRole="button"
      >
        <Text className="text-white text-sm font-semibold">{t("studioDeck.sources.addImage")}</Text>
      </TouchableOpacity>
      <Text className="text-white/40 text-[11px] mt-3">{t("studioDeck.sources.hint")}</Text>
    </View>
  );
}

function WidgetsPanel({ studio }: { studio: PhoneStudio }) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center">
      <View className="flex-1 pr-3">
        <Text className="text-white text-sm font-medium">{t("studioDeck.widgets.title")}</Text>
        <Text className="text-white/50 text-[11px] mt-0.5">{t("studioDeck.widgets.hint")}</Text>
      </View>
      <CustomSwitch
        value={studio.widgetsInVideo}
        onValueChange={(on) => void studio.setWidgetsInVideo(on)}
        disabled={!studio.widgetsAvailable || studio.widgetsBusy}
        accessibilityLabel={t("studioDeck.widgets.title")}
      />
    </View>
  );
}

export default StudioSheet;
