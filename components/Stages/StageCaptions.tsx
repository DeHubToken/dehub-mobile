/**
 * StageCaptions
 * =============
 * Subtitles in a live stage: the last few lines the speakers said, in the
 * language this listener picked, above the room's controls. Lines come from
 * web speakers (see hooks/useStageCaptions). A row with the toggle and the
 * language picker sits on top, as on web's StageCaptions.
 */
import React, { useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import Dropdown from "../ui/Dropdown";
import {
  CAPTION_LANGUAGES,
  setCaptionLanguage,
  setShowCaptions,
  useCaptionLanguage,
  useShowCaptions,
  useStageCaptionFeed,
} from "../../hooks/useStageCaptions";

const AS_SPOKEN = "source";

const StageCaptions: React.FC<{ spaceId: string; speakerWallets: string[] }> = ({ spaceId, speakerWallets }) => {
  const { t } = useTranslation();
  const show = useShowCaptions();
  const language = useCaptionLanguage();
  const lines = useStageCaptionFeed(spaceId, speakerWallets, show);
  const options = useMemo(
    () => [
      { label: t("stages.asSpoken"), value: AS_SPOKEN },
      ...CAPTION_LANGUAGES.map((l) => ({ label: l.name, value: l.code })),
    ],
    [t],
  );
  const active = CAPTION_LANGUAGES.find((l) => l.code === language);

  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TouchableOpacity
          onPress={() => setShowCaptions(!show)}
          hitSlop={6}
          accessibilityRole="switch"
          accessibilityState={{ checked: show }}
          accessibilityLabel={t("stages.showSubtitles")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 10,
            height: 30,
            borderRadius: 10,
            // Coloured, not grey: the theme pass repaints neutral fills, and
            // on/off must still look different.
            backgroundColor: show ? "rgba(236,242,255,0.95)" : "rgba(255,255,255,0.06)",
          }}
        >
          <Icon name="Captions" size={15} color={show ? "#09090B" : "rgba(255,255,255,0.7)"} />
          <Text style={{ color: show ? "#09090B" : "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "600" }} numberOfLines={1}>
            {active && show ? t("stages.subtitlesIn", { language: active.name }) : t("stages.subtitles")}
          </Text>
        </TouchableOpacity>
        {show && (
          <View style={{ marginLeft: "auto", width: 150 }}>
            <Dropdown
              options={options}
              value={language ?? AS_SPOKEN}
              onChange={(v) => setCaptionLanguage(v === AS_SPOKEN ? null : v)}
              placeholder={t("stages.language")}
            />
          </View>
        )}
      </View>
      {show && lines.length > 0 && (
        <View style={{ paddingVertical: 8, gap: 4 }} accessibilityLiveRegion="polite">
          {lines.map((line) => {
            const text = (language && line.translations?.[language]) || line.text;
            return (
              <Text key={line.id} style={{ color: line.final ? "#FFFFFF" : "rgba(255,255,255,0.7)", fontSize: 14, lineHeight: 20 }}>
                <Text style={{ fontWeight: "700", color: "rgba(255,255,255,0.6)" }}>{line.name}: </Text>
                {text}
              </Text>
            );
          })}
        </View>
      )}
      {!show || lines.length === 0 ? <View style={{ height: 8 }} /> : null}
    </View>
  );
};

export default StageCaptions;
