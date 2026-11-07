/**
 * Settings → Privacy switch for sending data to third-party AI (App Store
 * build). Turning it on shows the same disclosure as the first-use prompt;
 * turning it off stops every AI feature, auto-translate included.
 */
import React, { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { SettingsSection, SettingsToggleRow } from "./SettingsPrimitives";
import { ensureAiConsent, hasAiConsent, setAiConsent, subscribeAiConsent } from "../../libs/ai-consent";

const AiConsentSection: React.FC = () => {
  const { t } = useTranslation();
  const allowed = useSyncExternalStore(subscribeAiConsent, hasAiConsent);
  return (
    <SettingsSection label={t("aiConsent.settingLabel", "AI features")} icon="Sparkles" anchor="ai-features">
      <SettingsToggleRow
        icon="Sparkles"
        label={t("aiConsent.settingLabel", "AI features")}
        description={t(
          "aiConsent.settingDesc",
          "Let the assistant, translation, suggested replies and writing help send what you give them to third-party AI providers.",
        )}
        value={allowed}
        onValueChange={(next) => {
          if (next) void ensureAiConsent();
          else setAiConsent(false);
        }}
      />
    </SettingsSection>
  );
};

export default AiConsentSection;
