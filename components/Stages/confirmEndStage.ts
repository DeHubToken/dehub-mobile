import { Alert } from "react-native";
import type { TFunction } from "i18next";

/**
 * Ending a stage takes it off the air for every listener at once and cannot
 * be undone, so both the room and the mini-player ask first — the same
 * prompt the stage card already uses.
 */
export function confirmEndStage(t: TFunction, title: string | undefined, onEnd: () => void) {
  Alert.alert(t("stages.endThisStage"), t("stages.endSpaceConfirm", { title: title || "" }), [
    { text: t("common.cancel"), style: "cancel" },
    { text: t("stages.end"), style: "destructive", onPress: onEnd },
  ]);
}

/**
 * The same prompt, answered as a promise: true to end the stage, false to keep
 * it on the air. For a host walking into another room, which cannot happen
 * without their own stage coming down first.
 */
export function askToEndStage(t: TFunction, title: string | undefined): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      t("stages.endThisStage"),
      t("stages.endSpaceConfirm", { title: title || "" }),
      [
        { text: t("common.cancel"), style: "cancel", onPress: () => resolve(false) },
        { text: t("stages.end"), style: "destructive", onPress: () => resolve(true) },
      ],
      // Android closes an alert on a tap outside it; that is a no.
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
