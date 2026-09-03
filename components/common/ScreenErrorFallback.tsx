import React, { FC, ReactNode, useCallback, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useNavigation, type ScreenLayoutArgs } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import ErrorBoundary from "../ErrorBoundary";
import { restartApp } from "../../libs/crashRecovery";
import { ScreenNames } from "../../navigation/ScreenNames";

/**
 * What a screen shows when it throws, instead of taking the navigator with it.
 *
 * Every screen in the app is wrapped in one of these (see `screenLayout` in
 * AppNavigator and BottomTabNavigator). A render fault in one screen used to
 * climb to the boundary above NavigationContainer, which unmounted the whole
 * navigator — every tab, every stacked screen, the mini players — and offered
 * a "Try Again" that re-rendered the same fault. Now the fault stops at the
 * screen, the rest of the app keeps running, and the person can go back to
 * where they were.
 */

interface FallbackProps {
  retry: () => void;
}

const Action: FC<{ label: string; onPress: () => void; primary?: boolean }> = ({
  label,
  onPress,
  primary,
}) => (
  <Pressable
    onPress={onPress}
    className={
      primary
        ? "h-11 px-6 rounded-full bg-white items-center justify-center"
        : "h-11 px-6 rounded-full bg-zinc-800 items-center justify-center"
    }
    accessibilityRole="button"
  >
    <Text className={primary ? "text-black font-semibold" : "text-white font-semibold"}>
      {label}
    </Text>
  </Pressable>
);

export const ScreenErrorFallback: FC<FallbackProps> = ({ retry }) => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const [restarting, setRestarting] = useState(false);

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    // Nothing behind this screen: the initial route itself failed. Home is the
    // one place guaranteed to exist.
    navigation.navigate(ScreenNames.Root as never);
  }, [navigation]);

  const restart = useCallback(() => {
    setRestarting(true);
    void restartApp("user", "", { userInitiated: true }).then((ok) => {
      if (!ok) setRestarting(false);
    });
  }, []);

  return (
    <View className="flex-1 bg-theme-background items-center justify-center px-8">
      <View className="rounded-full bg-zinc-900 p-6 mb-4">
        <Ionicons name="alert-circle-outline" size={48} color="#a1a1aa" />
      </View>
      <Text className="text-white text-xl font-bold text-center mb-2">
        {t("common.somethingWentWrong")}
      </Text>
      <Text className="text-zinc-400 text-base text-center mb-6">
        {t("common.screenProblem")}
      </Text>
      <View className="flex-row gap-3 mb-3">
        <Action label={t("common.tryAgain")} onPress={retry} primary />
        <Action label={t("common.goBack")} onPress={goBack} />
      </View>
      <Pressable onPress={restart} disabled={restarting} accessibilityRole="button">
        <Text className="text-zinc-500 text-sm underline">{t("common.restartApp")}</Text>
      </Pressable>
    </View>
  );
};

interface ScreenErrorBoundaryProps {
  name: string;
  children: ReactNode;
}

/** One boundary per screen, named so the log row says which screen fell over. */
export const ScreenErrorBoundary: FC<ScreenErrorBoundaryProps> = ({ name, children }) => (
  <ErrorBoundary
    scope={`screen:${name}`}
    renderFallback={(retry) => <ScreenErrorFallback retry={retry} />}
  >
    {children}
  </ErrorBoundary>
);

/**
 * The `screenLayout` both navigators pass: every screen renders inside its own
 * boundary. Module-level so its identity never changes between renders — a
 * fresh function per render would remount every screen.
 */
export function withScreenBoundary({ route, children }: ScreenLayoutArgs<any, any, any, any>) {
  return <ScreenErrorBoundary name={String(route.name)}>{children}</ScreenErrorBoundary>;
}

export default ScreenErrorBoundary;
