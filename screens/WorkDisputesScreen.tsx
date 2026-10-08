import { tokenLabel } from '../libs/token-label';
/**
 * WorkDisputesScreen
 * ==================
 * Native port of the web WorkDisputesPage (/work/disputes): the arbiter queue
 * of open bounty disputes, each resolved as a worker/poster split.
 *
 * With no escrow contract deployed there is nothing held to split, so a
 * resolution is a written decision plus — only if the arbiter ticks it — a
 * transfer out of their own wallet. That transfer is a payment, so it is only
 * offered where DIGITAL_PURCHASES_ENABLED is on.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import WorkUser from "../components/Work/WorkUser";
import LoadErrorState from "../components/ui/LoadErrorState";
import { PageEmpty, PageSection } from "../components/page/PageKit";
import { DeHubLoader } from "../components/DeHubLoader";
import { useKeyboardOffset } from "../hooks/useKeyboardLayout";
import { useUser } from "../context/AuthContext";
import { DIGITAL_PURCHASES_ENABLED } from "../config/storefront";
import { appLocale } from "../libs/date.util";
import { openInApp } from "../libs/links.utils";
import { ScreenNames } from "../navigation/ScreenNames";
import {
  useAdminDisputes,
  useAdminResolveDispute,
  isWorkAdmin,

  type WorkDispute,
} from "../hooks/useWork";

type Draft = { worker: string; poster: string; notes: string; workerAddr: string; pay: boolean };

const fmt = (n: number) => n.toLocaleString(appLocale(), { maximumFractionDigits: 4 });

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <View style={{ marginBottom: 10 }}>
    <Text style={styles.fieldLabel}>{label}</Text>
    {children}
  </View>
);

export default function WorkDisputesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const keyboardOffset = useKeyboardOffset();
  const navigation = useNavigation<any>();
  const user = useUser() as any;
  const wallet: string | null = user?.walletAddress || user?.address || null;
  const admin = isWorkAdmin(wallet);

  const { data: disputes = [], isLoading, isError, refetch } = useAdminDisputes(admin);
  const resolve = useAdminResolveDispute();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const escrowed = false;

  if (!admin) {
    return (
      <View style={styles.root}>
        <ScreenHeader title={t("work.disputesTitle")} icon="governance" />
        <PageEmpty
          icon="governance"
          title={t("work.adminsOnly")}
          action={
            <Text style={styles.emptyText}>
              {t("work.adminsOnlyBody")} <Text style={styles.code}>WORK_ADMIN_ARBITERS</Text>
            </Text>
          }
        />
      </View>
    );
  }

  const renderDispute = (d: WorkDispute) => {
    const j = d.job;
    const escrowed=!!j?.fund_tx_hash;
    const v: Draft = drafts[d.id] || {
      worker: "",
      poster: "",
      notes: "",
      workerAddr: j?.awarded_worker_address ?? "",
      pay: false,
    };
    const set = (patch: Partial<Draft>) =>
      setDrafts((prev) => ({ ...prev, [d.id]: { ...v, ...patch } }));
    const workerNum = Number(v.worker) || 0;
    const posterNum = Number(v.poster) || 0;
    const remaining = j ? Number(j.total_budget) - Number(j.released_amount || 0) : 0;
    const total = workerNum + posterNum;
    const valid = !!j && workerNum>=0 && posterNum>=0 && (escrowed?Math.abs(total-remaining)<1e-9:posterNum===0 && total<=remaining) && (workerNum===0 || /^0x[a-fA-F0-9]{40}$/.test(v.workerAddr));
    const canPay = DIGITAL_PURCHASES_ENABLED && !escrowed;
    const paying = canPay && v.pay && workerNum > 0;
    const busy = resolve.isPending && resolve.variables?.dispute_id === d.id;

    return (
      <PageSection key={d.id}>
        <Pressable
          onPress={() =>
            navigation.navigate(ScreenNames.WorkJobDetail, { jobId: j?.id ?? d.job_id, job: j ?? undefined })
          }
          style={styles.titleRow}
        >
          <Text style={styles.cardTitle} numberOfLines={2}>
            {j?.title || t("work.untitled")}
          </Text>
          <Icon name="ExternalLink" size={13} color="#A1A1AA" />
        </Pressable>

        <View style={styles.openedRow}>
          <Text style={styles.dim}>{t("work.openedBy")}</Text>
          <WorkUser address={d.opened_by_address} size={22} />
          <Text style={styles.dim}>· {new Date(d.created_at).toLocaleString(appLocale())}</Text>
        </View>

        {j && (
          <View style={styles.budgetBox}>
            <Text style={styles.budgetText}>
              {t("work.unreleased", { amount: fmt(remaining), currency: tokenLabel(j.currency) })}
            </Text>
            <Text style={styles.dim}>
              {escrowed ? t("work.onchainId", { id: j.onchain_job_id ?? "—" }) : t("work.notEscrowed")}
            </Text>
          </View>
        )}

        <Text style={styles.reason}>{d.reason}</Text>
        {!!d.evidence_url && (
          <Pressable style={styles.linkRow} onPress={() => openInApp(d.evidence_url!)}>
            <Icon name="ExternalLink" size={12} color="#A1A1AA" />
            <Text style={styles.linkText} numberOfLines={1}>
              {d.evidence_url}
            </Text>
          </Pressable>
        )}

        {v.workerAddr?.length === 42 && (
          <View style={styles.payingRow}>
            <Text style={styles.payingLabel}>{t("work.paying")}</Text>
            <WorkUser address={v.workerAddr.toLowerCase()} showAddress size={24} />
          </View>
        )}

        <Field label={t("work.workerAddress")}>
          <TextInput
            value={v.workerAddr}
            onChangeText={(x) => set({ workerAddr: x.trim() })}
            placeholder="0x…"
            placeholderTextColor="#8B8D90"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
        </Field>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Field label={t("work.workerAmount", { currency: j ? tokenLabel(j.currency) : "" })}>
              <TextInput
                value={v.worker}
                onChangeText={(x) => set({ worker: x })}
                placeholder="0"
                placeholderTextColor="#8B8D90"
                keyboardType="decimal-pad"
                style={styles.input}
              />
            </Field>
          </View>
          {escrowed && <View style={{ flex: 1 }}>
            <Field label={t("work.posterRefund", { currency: j ? tokenLabel(j.currency) : "" })}>
              <TextInput
                value={v.poster}
                onChangeText={(x) => set({ poster: x })}
                placeholder="0"
                placeholderTextColor="#8B8D90"
                keyboardType="decimal-pad"
                style={styles.input}
              />
            </Field>
          </View>}
        </View>
        <Field label={t("work.detail.notesOptional")}>
          <TextInput
            value={v.notes}
            onChangeText={(x) => set({ notes: x })}
            placeholderTextColor="#8B8D90"
            style={styles.input}
          />
        </Field>

        {!escrowed && <Text style={styles.dim}>{t('work.integrity.decisionOnly')}</Text>}
        <View style={styles.footer}>
          <Text style={[styles.dim, { flex: 1 }]}>
            {t("work.disputeTotal", {
              total: fmt(total),
              remaining: fmt(remaining),
              currency: j?.currency,
            })}
          </Text>
          <Pressable
            disabled={!valid || resolve.isPending}
            onPress={() =>
              j &&
              resolve.mutate({
                dispute_id: d.id,
                job_id: d.job_id,
                currency: j.currency,
                worker_address: v.workerAddr,
                worker_amount: workerNum,
                poster_refund: posterNum,
                resolution_notes: v.notes,
                pay_worker: false,
              })
            }
            style={[styles.primaryBtn, (!valid || resolve.isPending) && styles.disabled]}
          >
            {busy ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <>
                {paying && <Icon name="Wallet" size={14} color="#000000" />}
                <Text style={styles.primaryBtnText}>
                  {t("work.resolve")}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </PageSection>
    );
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title={t("work.disputesTitle")} icon="governance" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={keyboardOffset}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.intro}>
        {escrowed ? t("work.disputesIntroEscrowed") : t("work.integrity.disputesReputation")}
          </Text>
          {isLoading ? (
            <View style={styles.center}>
              <DeHubLoader size={56} />
            </View>
          ) : isError ? (
            <LoadErrorState message={t("work.loadFailed")} onRetry={() => refetch()} />
          ) : disputes.length === 0 ? (
            <PageEmpty icon="governance" title={t("work.noDisputes")} />
          ) : (
            disputes.map(renderDispute)
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  intro: { color: "#A1A1AA", fontSize: 13, lineHeight: 19, marginBottom: 14, paddingHorizontal: 16 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardTitle: { flexShrink: 1, color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  openedRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 8 },
  dim: { color: "#808089", fontSize: 11.5 },
  budgetBox: { marginTop: 8 },
  budgetText: { color: "#D4D4D8", fontSize: 12.5, fontWeight: "600" },
  reason: { color: "#E4E4E7", fontSize: 13.5, lineHeight: 19, marginTop: 10 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  linkText: { flexShrink: 1, color: "#A1A1AA", fontSize: 12 },
  payingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  payingLabel: { color: "#808089", fontSize: 11, fontWeight: "600", textTransform: "uppercase" },

  fieldLabel: { color: "#808089", fontSize: 11, fontWeight: "600", marginBottom: 5, marginTop: 10 },
  input: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: "#FFFFFF",
    fontSize: 14,
  },

  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 6 },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: "#6EE7B7", borderColor: "#6EE7B7" },
  checkText: { flex: 1, color: "#D4D4D8", fontSize: 12.5, lineHeight: 18 },

  footer: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    minWidth: 96,
    justifyContent: "center",
  },
  primaryBtnText: { color: "#000000", fontSize: 14, fontWeight: "700" },
  disabled: { opacity: 0.4 },

  center: { alignItems: "center", justifyContent: "center", paddingVertical: 64 },
  emptyBlock: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 24 },
  adminTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", marginTop: 12 },
  emptyText: { color: "#A1A1AA", fontSize: 13, marginTop: 10, textAlign: "center", lineHeight: 19 },
  code: { color: "#E4E4E7", fontFamily: "monospace" },
});
