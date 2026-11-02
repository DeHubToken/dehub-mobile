/**
 * A profile link for a name nobody owns, opened by somebody who is signed out.
 *
 * "Reserve now" holds the name for this install for one minute while they
 * sign up (services/usernameHold.ts). The hold ends when they finish sign up,
 * tap "Let it go", leave the screen, or the minute runs out. Signed-in people
 * never see this: they get the plain "not found". Matches dehubweb's
 * src/components/app/profile/UsernameReserve.tsx.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemeIcon, KitButton } from "../page/PageKit";
import { currentHold, releaseUsername, reserveUsername } from "../../services/usernameHold";

export type ReserveState = "avail" | "held" | "ended" | "busy";

interface Props {
  username: string;
  /** Opens sign in / sign up. */
  onSignUp: () => void;
  /** True once they are signed in: the hold is theirs to use, not to drop. */
  signedIn?: boolean;
  /** The name got taken while they looked. */
  onTaken?: () => void;
  /** Screenshot harness: render a state without the network. */
  preview?: { state: ReserveState; secondsLeft?: number };
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function UsernameReserve({ username, onSignUp, signedIn, onTaken, preview }: Props) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const name = username.trim().replace(/^@+/, "").toLowerCase();

  const [{ state, until }, setHold] = useState<{ state: ReserveState; until: number }>(() => {
    if (preview) return { state: preview.state, until: Date.now() + (preview.secondsLeft ?? 59) * 1000 };
    const hold = currentHold();
    return hold && hold.username === name ? { state: "held", until: hold.expiresAt } : { state: "avail", until: 0 };
  });
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (preview || (state !== "held" && state !== "busy")) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [state, preview]);

  const left = until - now;
  useEffect(() => {
    if (preview) return;
    if (state === "held" && left <= 0) {
      releaseUsername();
      setHold({ state: "ended", until: 0 });
    } else if (state === "busy" && left <= 0) {
      setHold({ state: "avail", until: 0 });
    }
  }, [state, left, preview]);

  // Leaving the screen lets the name go, unless they just signed in with it.
  const signedInRef = useRef(!!signedIn);
  signedInRef.current = !!signedIn;
  useEffect(() => {
    if (preview) return;
    return () => {
      if (!signedInRef.current && currentHold()?.username === name) releaseUsername();
    };
  }, [name, preview]);

  const reserve = useCallback(async () => {
    if (preview || pending) return;
    setPending(true);
    try {
      const res = await reserveUsername(name);
      if (res?.held) {
        setNow(Date.now());
        setHold({ state: "held", until: Date.parse(res.expiresAt) });
        onSignUp();
      } else if (res && "reason" in res && res.reason === "held" && res.expiresAt) {
        setNow(Date.now());
        setHold({ state: "busy", until: Date.parse(res.expiresAt) });
      } else {
        onTaken?.();
      }
    } catch {
      // Hold service unreachable: still let them sign up and pick the name there.
      onSignUp();
    } finally {
      setPending(false);
    }
  }, [name, pending, preview, onSignUp, onTaken]);

  const letGo = useCallback(() => {
    if (!preview) releaseUsername();
    setHold({ state: "avail", until: 0 });
  }, [preview]);

  const eyebrow = {
    avail: t("profile.reserve.available", { defaultValue: "Username available" }),
    held: t("profile.reserve.held", { defaultValue: "Held for you" }),
    ended: t("profile.reserve.ended", { defaultValue: "Hold ended" }),
    busy: t("profile.reserve.busy", { defaultValue: "Being reserved" }),
  }[state];
  const body = {
    avail: t("profile.reserve.availableBody", { defaultValue: "dehub.io/{{name}} is free right now. Reserve it and we hold it for one minute while you sign up.", name }),
    held: t("profile.reserve.heldBody", { defaultValue: "Nobody else can take @{{name}} until the timer runs out. Finish sign up to keep it.", name }),
    ended: t("profile.reserve.endedBody", { defaultValue: "Your minute ran out, so @{{name}} is open to everyone again. It is still free.", name }),
    busy: t("profile.reserve.busyBody", { defaultValue: "Someone is signing up as @{{name}} right now. If they do not finish, it frees up when the timer ends.", name }),
  }[state];

  // Long names shrink to one line instead of wrapping a lone letter.
  const col = Math.min(width - 32, 400);
  const nameSize = Math.min(64, col / ((name.length + 1) * 0.62));

  return (
    <View className="flex-1 items-center justify-center px-4 py-16" testID={`username-reserve-${state}`}>
      <View style={{ width: col, alignItems: "center" }}>
        <ThemeIcon icon={state === "held" ? "lock" : "usernames"} size={76} />
        <Text className="text-zinc-400 text-xs font-semibold uppercase mt-3.5" style={{ letterSpacing: 1 }}>
          {eyebrow}
        </Text>
        <Text
          className="text-white font-extrabold text-center"
          style={{ fontSize: nameSize, lineHeight: nameSize * 1.05, letterSpacing: -nameSize * 0.035, marginTop: 14, marginBottom: 10 }}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          @{name}
        </Text>
        {state === "held" || state === "busy" ? (
          <Text className="text-white font-bold" style={{ fontSize: 40, lineHeight: 46, fontVariant: ["tabular-nums"], marginBottom: 6 }}>
            {fmt(left)}
          </Text>
        ) : null}
        <Text className="text-zinc-400 text-sm text-center leading-5 mb-6" style={{ maxWidth: 340 }}>
          {body}
        </Text>
        {state === "held" ? (
          <KitButton label={t("profile.reserve.finish", { defaultValue: "Finish sign up" })} onPress={onSignUp} style={{ alignSelf: "stretch" }} />
        ) : (
          <KitButton
            label={state === "ended" ? t("profile.reserve.again", { defaultValue: "Reserve again" }) : t("profile.reserve.cta", { defaultValue: "Reserve now" })}
            onPress={reserve}
            disabled={pending || state === "busy"}
            style={{ alignSelf: "stretch" }}
          />
        )}
        {state === "held" ? (
          <Pressable onPress={letGo} accessibilityRole="button" style={{ marginTop: 16, padding: 4 }}>
            <Text className="text-white text-sm font-semibold">{t("profile.reserve.letGo", { defaultValue: "Let it go" })}</Text>
          </Pressable>
        ) : (
          <View className="flex-row items-center" style={{ marginTop: 16 }}>
            <Text className="text-zinc-400 text-sm">{t("profile.reserve.haveAccount", { defaultValue: "Have an account?" })} </Text>
            <Pressable onPress={onSignUp} accessibilityRole="button" style={{ padding: 4 }}>
              <Text className="text-white text-sm font-semibold">{t("profile.reserve.signIn", { defaultValue: "Sign in" })}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}
