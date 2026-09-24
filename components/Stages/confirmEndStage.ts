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
