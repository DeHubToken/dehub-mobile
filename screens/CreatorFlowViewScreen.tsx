/**
 * CreatorFlowViewScreen — /creator/flow/:id
 * =========================================
 * One flow, read-only. Opened from your own list it shows the flow you
 * already loaded; opened from a shared link it fetches the public copy, and
 * "Open a copy" saves a private duplicate to your account — the same thing
 * web's share page does — so it shows up on your canvas to run.
 */
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import ScreenHeader from "../components/ScreenHeader";
import Icon from "../components/ui/Icon";
import FlowNodeList from "../components/CreatorFlow/FlowNodeList";
import { useUser } from "../context/AuthContext";
import { ScreenNames } from "../navigation/ScreenNames";
import type { AppStackParamList } from "../navigation/types";
import { ShareLinks } from "../navigation/linking.config";
import { toastError, toastSuccess } from "../libs";
import { copyOfFlow, fetchPublicFlow, saveFlows } from "../services/creator-flows.service";

type Nav = NativeStackNavigationProp<AppStackParamList>;

export default function CreatorFlowViewScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const qc = useQueryClient();
  const route = useRoute<RouteProp<AppStackParamList, ScreenNames.CreatorFlowView>>();
  const id = String(route.params?.id ?? "");
  const own = route.params?.flow;
  const user = useUser();
  const wallet = (user?.walletAddress || user?.address || "").toLowerCase() || null;
  const [copying, setCopying] = useState(false);

  const shared = useQuery({
    queryKey: ["creator-flow-public", id],
    queryFn: () => fetchPublicFlow(id),
    enabled: !own && !!id,
    retry: 1,
  });

  const flow = own
    ? { name: own.name, nodes: own.data?.nodes ?? [], edges: own.data?.edges ?? [], isPublic: own.isPublic }
    : shared.data
      ? { name: shared.data.name, nodes: shared.data.nodes ?? [], edges: shared.data.edges ?? [], isPublic: true }
      : null;

  const share = useCallback(() => {
    const url = ShareLinks.creatorFlow(id);
    void Share.share({ message: flow ? `${flow.name}\n${url}` : url, url }).catch(() => {});
  }, [id, flow]);

  const openCopy = useCallback(async () => {
    if (!flow) return;
    if (!wallet) {
      navigation.navigate(ScreenNames.SignIn);
      return;
    }
    setCopying(true);
    try {
      await saveFlows(wallet, [copyOfFlow(flow, t("creatorFlow.copyName", { name: flow.name }))]);
      await qc.invalidateQueries({ queryKey: ["creator-flows"] });
      toastSuccess(t("creatorFlow.copySaved"));
      navigation.navigate(ScreenNames.CreatorFlow);
    } catch {
      toastError(t("creatorFlow.copyFlowFailed"));
    } finally {
      setCopying(false);
    }
  }, [flow, wallet, navigation, qc, t]);

  const subtitle = own
    ? own.isPublic
      ? t("creatorFlow.publicHint")
      : t("creatorFlow.privateHint")
    : t("creatorFlow.sharedReadOnly");

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={flow?.name || t("creatorFlow.title")}
        subtitle={subtitle}
        rightContent={
          flow?.isPublic ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t("creatorFlow.shareFlow")} onPress={share} hitSlop={10} style={styles.headerBtn}>
              <Icon name="Share2" size={20} color="#FFFFFF" />
            </Pressable>
          ) : undefined
        }
      />
      {!flow ? (
        <View style={styles.center}>
          {shared.isError ? (
            <Text style={styles.muted}>{t("creatorFlow.notFound")}</Text>
          ) : (
            <ActivityIndicator color="#A1A1AA" />
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 16 }}>
          {!own && (
            <Pressable
              accessibilityRole="button"
              onPress={() => void openCopy()}
              disabled={copying}
              style={[styles.copyBtn, copying && { opacity: 0.6 }]}
            >
              {copying ? <ActivityIndicator size="small" color="#000000" /> : <Icon name="Copy" size={15} color="#000000" />}
              <Text style={styles.copyText}>{t("creatorFlow.openACopy")}</Text>
            </Pressable>
          )}
          <FlowNodeList nodes={flow.nodes} edges={flow.edges} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  headerBtn: { padding: 6 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  muted: { color: "#71717A", fontSize: 14, textAlign: "center" },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  copyText: { color: "#000000", fontSize: 14, fontWeight: "700" },
});
