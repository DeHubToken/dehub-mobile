import { useEffect } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useUser } from "../../context/AuthContext";
import { useCloudProjectPresence } from "../../libs/editor/useCloudProjectPresence";
import { nativeCloudProjectSession } from "../../libs/editor/cloudProjectDevice";
import { ensureWalletSession } from "../../libs/wallet-session";
export function LiveProjectSession({ projectId }: { projectId: string }) {
  const user = useUser(), { t } = useTranslation(), address = user?.walletAddress || user?.address;
  const live = useCloudProjectPresence(address, projectId, nativeCloudProjectSession, ensureWalletSession);
  useEffect(() => { const subscription = AppState.addEventListener("change", state => { if (state !== "active") live.leave(); }); return () => subscription.remove(); }, [address, projectId]);
  const joined = live.status === "connected", waiting = live.status === "connecting";
  return <View className="border-b border-white/10 px-3 py-1" style={{ gap: 4 }}>
    <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
      <Pressable accessibilityRole="button" disabled={waiting} onPress={() => joined ? live.leave() : void live.join()} className="rounded-lg border border-white/15 px-2 py-1"><Text className="text-white text-xs">{t(waiting ? "editor.live.joining" : joined ? "editor.live.leave" : "editor.live.join")}</Text></Pressable>
      <Text accessibilityLiveRegion="polite" className="text-white/70 text-xs">{joined ? t("editor.live.connected", { count: live.participants.length, revision: live.revision }) : t(live.status === "disconnected" ? "editor.live.disconnected" : "editor.live.hint")}</Text>
      {joined && <Pressable accessibilityRole="button" onPress={live.refresh}><Text className="text-white text-xs underline">{t("common.refresh")}</Text></Pressable>}
    </View>
    {joined && <Text className="text-white/50 text-[10px]" numberOfLines={2}>{live.participants.map(p => `${p.wallet.slice(0, 6)}…${p.wallet.slice(-4)}${p.connections > 1 ? ` (${p.connections})` : ""}`).join(", ")}{" · "}{t("editor.live.saveHint")}</Text>}
    {live.error && <Text accessibilityLiveRegion="assertive" className="text-red-300 text-xs">{t("editor.live.error")}</Text>}
  </View>;
}
