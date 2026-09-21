/**
 * Settings entry for the guided walkthrough.
 *
 * The home card can be put away with its X, and putting something away has to
 * be undoable somewhere obvious or it is just gone. This is that somewhere: it
 * reopens the checklist for somebody who has one and starts one for somebody
 * who never took the offer — which is most people, since the offer is only
 * made to a brand-new account.
 *
 * Carries its own sheet rather than steering the home card, so the walkthrough
 * opens where the person tapped instead of on a screen two tabs away.
 */
import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import { SettingsLinkRow } from "./SettingsPrimitives";
import GettingStartedSheet from "../Onboarding/GettingStartedSheet";
import { useOnboarding } from "../../context/OnboardingChecklistContext";

const GettingStartedRow: React.FC = () => {
  const { t } = useTranslation();
  const onboarding = useOnboarding();
  const [open, setOpen] = useState(false);

  if (!onboarding) return null;

  return (
    <>
      <SettingsLinkRow
        icon="Compass"
        label={t("onboarding.checklist.title")}
        description={
          onboarding.progress
            ? t("onboarding.checklist.progress", {
                done: onboarding.settled,
                total: onboarding.total,
              })
            : t("onboarding.checklist.subtitle")
        }
        onPress={() => {
          onboarding.reopen();
          setOpen(true);
        }}
      />
      <GettingStartedSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
};

export default GettingStartedRow;
