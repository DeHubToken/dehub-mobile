/**
 * BridgeScreen
 * ============
 * Native port of the web Bridge page (dehub.io/app/bridge): move DeHub tokens
 * between Base and BNB Chain, plus the public list of recent bridge transfers.
 *
 * The bridge itself is the wallet's Bridge tab (components/Wallet/BridgeTab) —
 * same balances, same signer, same relay address — so this screen adds no
 * wallet plumbing of its own. That tab hides the send controls in the App
 * Store build; balances and history stay readable.
 */
import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import ScreenHeader from "../components/ScreenHeader";
import { KitButton, PageEmpty, PageSection } from "../components/page/PageKit";
import BridgeTab from "../components/Wallet/BridgeTab";
import BridgeQueue from "../components/Wallet/BridgeQueue";
import { DeHubRefreshControl, DeHubRefreshMark } from "../components/Feed/DeHubRefreshControl";
import { useAuthState } from "../context/AuthContext";
import { useKeyboardOffset } from "../hooks/useKeyboardLayout";
import { ScreenNames } from "../navigation/ScreenNames";

export default function BridgeScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const keyboardOffset = useKeyboardOffset();
  const { isSignedIn } = useAuthState();
  // BridgeTab loads its balances on mount; remounting it is its refresh.
  const [tabKey, setTabKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setTabKey((k) => k + 1);
    await queryClient.invalidateQueries({ queryKey: ["bridge-transfers"] }).catch(() => {});
    setRefreshing(false);
  }, [queryClient]);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior="padding"
      keyboardVerticalOffset={keyboardOffset}
    >
      <ScreenHeader title={t("nav.bridge")} subtitle={t("bridge.subtitle")} icon="bridge" />
      <ScrollView
        contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<DeHubRefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ffffff" />}
      >
        {isSignedIn ? (
          <PageSection>
            <BridgeTab key={tabKey} />
          </PageSection>
        ) : (
          <PageSection flush>
            <PageEmpty
              icon="bridge"
              title={t("nav.bridge")}
              body={t("bridge.signInToBridge")}
              action={<KitButton label={t("common.signIn")} onPress={() => navigation.navigate(ScreenNames.SignIn)} />}
            />
          </PageSection>
        )}
        <BridgeQueue />
      </ScrollView>
      <DeHubRefreshMark refreshing={refreshing} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
});
