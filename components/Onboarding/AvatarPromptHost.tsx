import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useTranslation } from "react-i18next";
import { useAuthActions, useAuthState, useUser } from "../../context/AuthContext";
import { AuthService } from "../../services/auth.service";
import { getAccount } from "../../services/user.service";
import { createRNImageFile } from "../../libs/assets.util";
import { toastSuccess } from "../../libs/toast";
import AvatarPromptSheet from "./AvatarPromptSheet";
import { hasNoAvatar, isAvatarPromptDue, recordAvatarPromptShown } from "../../libs/avatar-prompt";
import { ScreenNames } from "../../navigation/ScreenNames";
import { navigationRef } from "../../App";

/** Time on a feed before the ask, so it never lands on top of the first paint. */
const DWELL_MS = 4_000;
/** Back from the background after this long counts as a new open. */
const NEW_OPEN_AFTER_MS = 30 * 60 * 1000;

const PROMPT_SCREENS = new Set<string>([ScreenNames.Home, ScreenNames.Explore]);

// One ask per open, whatever remounts.
let askedThisOpen = false;

/**
 * Renders nothing until a signed-in account with no profile picture has sat on
 * Home or Explore for a few seconds, then offers the sheet. Schedule lives in
 * libs/avatar-prompt. Mounted in App.tsx inside AuthProvider.
 */
export default function AvatarPromptHost() {
  const { t } = useTranslation();
  const user = useUser();
  const { isSignedIn, needsUsername } = useAuthState();
  const { refreshUser, patchUser } = useAuthActions();
  const [visible, setVisible] = useState(false);
  const [openTick, setOpenTick] = useState(0);
  const backgroundedAt = useRef<number | null>(null);

  const address = (user?.walletAddress || user?.address || "") as string;
  const eligible = isSignedIn && !needsUsername && !!address && !!user?.username && hasNoAvatar(user);

  // Coming back after a long while is a new open.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") backgroundedAt.current = Date.now();
      else if (state === "active" && backgroundedAt.current && Date.now() - backgroundedAt.current > NEW_OPEN_AFTER_MS) {
        backgroundedAt.current = null;
        askedThisOpen = false;
        setOpenTick((n) => n + 1);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!eligible || askedThisOpen) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const attempt = async () => {
      if (cancelled || askedThisOpen) return;
      const route = navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;
      // Not on a feed yet (or a screen is open over it): look again shortly.
      if (!route || !PROMPT_SCREENS.has(route)) { timer = setTimeout(attempt, DWELL_MS); return; }
      if (!(await isAvatarPromptDue(address))) return;
      // The cached account can be older than a photo added on another device.
      try {
        const res: any = await getAccount(address);
        const fresh = res?.data?.result || res?.result;
        if (cancelled || !fresh || !hasNoAvatar(fresh)) return;
      } catch {
        return;
      }
      const still = navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;
      if (cancelled || !still || !PROMPT_SCREENS.has(still)) { timer = setTimeout(attempt, DWELL_MS); return; }
      askedThisOpen = true;
      void recordAvatarPromptShown(address);
      setVisible(true);
    };
    timer = setTimeout(attempt, DWELL_MS);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [eligible, address, openTick]);

  const save = useCallback(async (uri: string) => {
    const file = createRNImageFile(uri, "avatar");
    await AuthService.updateProfile({ avatar: file, avatarImg: file } as any);
    // The local file stands in until the CDN copy loads.
    await patchUser?.({ avatarImageUrl: uri } as any);
    refreshUser?.().catch(() => {});
    toastSuccess(t("avatarPrompt.saved", "Looking good"));
  }, [patchUser, refreshUser, t]);

  if (!user) return null;
  return (
    <AvatarPromptSheet
      visible={visible}
      onClose={() => setVisible(false)}
      name={user.displayName || user.username || ""}
      onSave={save}
    />
  );
}
