/**
 * AdsScreen
 * =========
 * Native port of web's AdsPage (/app/ads) — the POVR advertiser portal, with
 * the same three tabs: Overview, Campaigns, Billing.
 *
 * Top-up mirrors web's AdTopUpModal exactly: transfer DHB on-chain to the ads
 * treasury, then hand the tx hash to the `ads-topup` edge function, which
 * verifies it independently and credits USD at the live DHB price. The transfer
 * goes through writeContractAA (libs/aa.write) — the same AA-aware path the
 * Stores checkout uses, so smart wallets keep gas sponsorship and non-Web3Auth
 * providers still work.
 *
 * Not ported from web: the full CampaignWizard targeting editor (communities,
 * behaviours, followed creators). Campaigns here target by badge tier, which is
 * what drives CPM; the finer targeting is a follow-up.
 */
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import Svg, { Polyline, Line as SvgLine } from "react-native-svg";
import { ethers } from "ethers";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../components/ui/Icon";
import { theme } from "../theme";
import { formatCompactNumber } from "../libs";
import { toastError } from "../libs/toast";
import { useAuthState } from "../context/AuthContext";
import { useGateToHome } from "../hooks/useGateToHome";
import { useERC20Contract, useWeb3Provider } from "../hooks/use-web3";
import { writeContractAA } from "../libs/aa.write";
import { ChainId, DHB_ADDRESSESS } from "../config/constants";
import { useTokenPrices } from "../hooks/useStores";
import {
  useAdAccount,
  useEnsureAdAccount,
  useAdCampaigns,
  useCreateCampaign,
  useUpdateCampaign,
  useDeleteCampaign,
  useAllCampaignStats,
  useAdPayments,
  useTopUpCredit,
  rollupStats,
  statsByDay,
  blendedCpmUsd,
  tierLabel,
  POVR_TIERS,
  type AdCampaign,
  type CampaignStatus,
} from "../hooks/useAds";

/** Same treasury the AI credits / paywalls pay into (see ads-topup edge fn). */
const ADS_TREASURY = "0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c";
const DHB_BASE = DHB_ADDRESSESS[ChainId.BASE_MAINNET];
const TOPUP_PRESETS = [25, 100, 500];

const OBJECTIVES = ["awareness", "traffic", "engagement"] as const;

const STATUS_COLOR: Record<string, string> = {
  active: "#34D399",
  paused: "#D4D4D8",
  pending_review: "#D4D4D8",
  draft: "#A1A1AA",
  rejected: "#F87171",
  completed: "#818CF8",
  archived: "#71717A",
};

const usd = (n: number) =>
  `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Small pieces ────────────────────────────────────────────────────────────

const Kpi: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.kpi}>
    <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
      {value}
    </Text>
    <Text style={styles.kpiLabel}>{label}</Text>
  </View>
);

/** 14-day impressions/clicks sparkline — react-native-svg, like the other charts. */
const PerfChart: React.FC<{ series: { day: string; impressions: number; clicks: number }[] }> = ({
  series,
}) => {
  const { t } = useTranslation();
  const W = 320;
  const H = 110;
  const PAD = 8;
  if (series.length < 2) {
    return (
      <View style={styles.chartEmpty}>
        <Text style={styles.dim}>{t("ads.notEnoughData")}</Text>
      </View>
    );
  }
  const build = (vals: number[]) => {
    const max = Math.max(...vals, 1);
    return vals
      .map((v, i) => {
        const x = PAD + (i / Math.max(vals.length - 1, 1)) * (W - PAD * 2);
        const y = PAD + (1 - v / max) * (H - PAD * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  };
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <SvgLine x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#3f3f46" strokeWidth="1" />
      <Polyline points={build(series.map((s) => s.impressions))} fill="none" stroke="#F4F4F5" strokeWidth="2" />
      <Polyline points={build(series.map((s) => s.clicks))} fill="none" stroke="#22c55e" strokeWidth="2" />
    </Svg>
  );
};

// ── Campaign form ───────────────────────────────────────────────────────────

const CampaignForm: React.FC<{ visible: boolean; onClose: () => void }> = ({ visible, onClose }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const create = useCreateCampaign();
  const [name, setName] = useState("");
  const [objective, setObjective] = useState<string>("awareness");
  const [daily, setDaily] = useState("");
  const [total, setTotal] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [tiers, setTiers] = useState<string[]>([]);

  const cpm = useMemo(() => blendedCpmUsd(tiers), [tiers]);
  const estImpressions = useMemo(() => {
    const budget = Number(total) || 0;
    return cpm > 0 ? Math.round((budget / cpm) * 1000) : 0;
  }, [total, cpm]);

  const valid = name.trim().length > 0 && Number(daily) > 0 && Number(total) > 0;

  const submit = useCallback(() => {
    if (!valid) return;
    create.mutate(
      {
        name: name.trim(),
        objective,
        daily_budget_usd: Number(daily),
        total_budget_usd: Number(total),
        targeting: tiers.length ? { tiers } : {},
        cta_url: ctaUrl.trim() || null,
        status: "pending_review",
      },
      {
        onSuccess: () => {
          setName(""); setDaily(""); setTotal(""); setCtaUrl(""); setTiers([]);
          onClose();
        },
      },
    );
  }, [valid, create, name, objective, daily, total, tiers, ctaUrl, onClose]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{t("ads.newCampaign")}</Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Icon name="X" size={20} color="#A1A1AA" />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>{t("ads.campaignName")}</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t("ads.campaignNamePlaceholder")}
                placeholderTextColor="#52525B"
                style={styles.input}
              />

              <Text style={styles.label}>{t("ads.objective")}</Text>
              <View style={styles.chipWrap}>
                {OBJECTIVES.map((o) => (
                  <Pressable
                    key={o}
                    onPress={() => setObjective(o)}
                    style={[styles.chip, objective === o && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, objective === o && styles.chipTextActive]}>
                      {t(`ads.objectives.${o}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>{t("ads.dailyBudget")}</Text>
              <TextInput
                value={daily}
                onChangeText={setDaily}
                placeholder="25"
                placeholderTextColor="#52525B"
                keyboardType="decimal-pad"
                style={styles.input}
              />

              <Text style={styles.label}>{t("ads.totalBudget")}</Text>
              <TextInput
                value={total}
                onChangeText={setTotal}
                placeholder="500"
                placeholderTextColor="#52525B"
                keyboardType="decimal-pad"
                style={styles.input}
              />

              <Text style={styles.label}>{t("ads.landingUrl")}</Text>
              <TextInput
                value={ctaUrl}
                onChangeText={setCtaUrl}
                placeholder="https://…"
                placeholderTextColor="#52525B"
                autoCapitalize="none"
                keyboardType="url"
                style={styles.input}
              />

              <Text style={styles.label}>{t("ads.targetTiers")}</Text>
              <View style={styles.chipWrap}>
                {POVR_TIERS.map((t) => {
                  const on = tiers.includes(t.name);
                  return (
                    <Pressable
                      key={t.name}
                      onPress={() =>
                        setTiers((prev) =>
                          prev.includes(t.name) ? prev.filter((x) => x !== t.name) : [...prev, t.name],
                        )
                      }
                      style={[styles.chip, on && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextActive]}>
                        {tierLabel(t.name)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.estBox}>
                <Text style={styles.dim}>{t("ads.blendedCpm")}</Text>
                <Text style={styles.estValue}>{usd(cpm)}</Text>
                <Text style={[styles.dim, { marginTop: 6 }]}>
                  {t("ads.estimatedImpressions", {
                    count: formatCompactNumber(estImpressions),
                    amount: usd(Number(total) || 0),
                  })}
                </Text>
              </View>
            </ScrollView>

            <Pressable
              onPress={submit}
              disabled={!valid || create.isPending}
              style={[styles.primaryBtn, (!valid || create.isPending) && styles.disabled]}
            >
              {create.isPending ? (
                <ActivityIndicator color="#000000" />
              ) : (
                <Text style={styles.primaryBtnText}>{t("ads.submitForReview")}</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

// ── Screen ──────────────────────────────────────────────────────────────────

export default function AdsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { isSignedIn, needsUsername } = useAuthState();
  useGateToHome(isSignedIn && !needsUsername);

  const [tab, setTab] = useState<"overview" | "campaigns" | "billing">("overview");
  const [formOpen, setFormOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState<number>(100);
  const [buying, setBuying] = useState(false);

  const account = useAdAccount();
  const ensureAccount = useEnsureAdAccount();
  const campaigns = useAdCampaigns();
  const payments = useAdPayments();
  const topUp = useTopUpCredit();
  const updateCampaign = useUpdateCampaign();
  const deleteCampaign = useDeleteCampaign();

  const campaignIds = useMemo(() => (campaigns.data ?? []).map((c) => c.id), [campaigns.data]);
  const stats = useAllCampaignStats(campaignIds);
  const kpis = useMemo(() => rollupStats(stats.data), [stats.data]);
  const series = useMemo(() => statsByDay(stats.data).slice(-14), [stats.data]);

  const { chainId } = useWeb3Provider();
  const tokenContract = useERC20Contract(DHB_BASE);
  const { data: prices } = useTokenPrices();
  const dhbPrice = prices?.DHB ?? 0;

  const dhbForTopUp = dhbPrice > 0 ? Math.ceil(topUpAmount / dhbPrice) : 0;

  const onRefresh = useCallback(() => {
    void account.refetch();
    void campaigns.refetch();
    void stats.refetch();
    void payments.refetch();
  }, [account, campaigns, stats, payments]);

  const handleTopUp = useCallback(async () => {
    if (!tokenContract) {
      toastError(t("ads.walletNotReady"));
      return;
    }
    if (dhbPrice <= 0 || dhbForTopUp <= 0) {
      toastError(t("ads.priceUnavailable"));
      return;
    }
    setBuying(true);
    try {
      const amountWei = ethers.utils.parseUnits(String(dhbForTopUp), 18);

      try {
        const signerAddr = await tokenContract.signer?.getAddress?.();
        const bal = await tokenContract.balanceOf(signerAddr);
        if (bal && bal.lt(amountWei)) {
          toastError(t("ads.insufficientBalance"));
          return;
        }
      } catch {
        /* advisory only */
      }

      const res = await writeContractAA(
        tokenContract,
        "transfer",
        [ADS_TREASURY, amountWei],
        { context: "Ads balance top-up" },
      );

      let txHash = res.hash ?? "";
      try {
        const receipt = await res.wait(1);
        if (receipt?.status === 0) {
          toastError(t("ads.transferReverted"));
          return;
        }
        txHash = txHash || receipt?.transactionHash || "";
      } catch {
        /* confirmation timed out; still submit the hash for verification */
      }

      if (!txHash) {
        toastError(t("ads.noTransactionHash"));
        return;
      }
      await topUp.mutateAsync(txHash);
    } catch (err: any) {
      const msg = String(err?.message || err || t("ads.topUpFailed"));
      if (msg.includes("user rejected") || msg.includes("cancelled")) {
        toastError(t("ads.transactionCancelled"));
      } else {
        toastError(msg.slice(0, 120));
      }
    } finally {
      setBuying(false);
    }
  }, [tokenContract, dhbPrice, dhbForTopUp, chainId, topUp, t]);

  const campaignMenu = useCallback(
    (c: AdCampaign) => {
      const next: CampaignStatus = c.status === "active" ? "paused" : "active";
      Alert.alert(c.name, t("ads.spentOf", { spent: usd(c.spent_usd), total: usd(c.total_budget_usd) }), [
        {
          text: c.status === "active" ? t("ads.pause") : t("ads.resume"),
          onPress: () => updateCampaign.mutate({ id: c.id, status: next }),
        },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => deleteCampaign.mutate(c.id),
        },
        { text: t("common.cancel"), style: "cancel" },
      ]);
    },
    [updateCampaign, deleteCampaign, t],
  );

  const hasAccount = !!account.data;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Icon name="ArrowLeft" size={22} color="#FFFFFF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t("nav.ads")}</Text>
          <Text style={styles.subtitle}>{t("ads.subtitle")}</Text>
        </View>
        {tab === "campaigns" && hasAccount && (
          <Pressable onPress={() => setFormOpen(true)} hitSlop={10} style={styles.addBtn}>
            <Icon name="Plus" size={20} color="#000000" />
          </Pressable>
        )}
      </View>

      <View style={styles.segment}>
        {(["overview", "campaigns", "billing"] as const).map((tabKey) => (
          <Pressable
            key={tabKey}
            onPress={() => setTab(tabKey)}
            style={[styles.segmentBtn, tab === tabKey && styles.segmentBtnActive]}
          >
            <Text style={[styles.segmentText, tab === tabKey && styles.segmentTextActive]}>
              {t(`ads.tabs.${tabKey}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 28, gap: 12 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={account.isRefetching || campaigns.isRefetching}
            onRefresh={onRefresh}
            tintColor={theme.colors.accentForeground}
          />
        }
      >
        {account.isLoading ? (
          <ActivityIndicator size="large" color="#FFFFFF" style={{ marginTop: 40 }} />
        ) : !hasAccount ? (
          <View style={styles.card}>
            <Icon name="Megaphone" size={34} color="#3F3F46" />
            <Text style={styles.emptyTitle}>{t("ads.advertiseTitle")}</Text>
            <Text style={styles.dim}>{t("ads.advertiseDescription")}</Text>
            <Pressable
              onPress={() => ensureAccount.mutate(undefined)}
              disabled={ensureAccount.isPending}
              style={[styles.primaryBtn, ensureAccount.isPending && styles.disabled]}
            >
              {ensureAccount.isPending ? (
                <ActivityIndicator color="#000000" />
              ) : (
                <Text style={styles.primaryBtnText}>{t("ads.openAccount")}</Text>
              )}
            </Pressable>
          </View>
        ) : tab === "overview" ? (
          <>
            <View style={styles.card}>
              <Text style={styles.dim}>{t("ads.availableCredit")}</Text>
              <Text style={styles.balance}>{usd(account.data!.balance_usd)}</Text>
              <Text style={styles.dim}>
                {t("ads.accountTotals", {
                  spent: usd(account.data!.total_spent_usd),
                  deposited: usd(account.data!.total_deposited_usd),
                })}
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t("ads.performance")}</Text>
              <View style={styles.kpiRow}>
                <Kpi label={t("ads.impressions")} value={formatCompactNumber(kpis.impressions)} />
                <Kpi label={t("ads.clicks")} value={formatCompactNumber(kpis.clicks)} />
                <Kpi label="CTR" value={`${kpis.ctr.toFixed(2)}%`} />
              </View>
              <View style={[styles.kpiRow, { marginTop: 8 }]}>
                <Kpi label={t("ads.spend")} value={usd(kpis.spend)} />
                <Kpi label={t("ads.ecpm")} value={usd(kpis.ecpm)} />
                <Kpi label={t("ads.campaigns")} value={String((campaigns.data ?? []).length)} />
              </View>
              <View style={{ marginTop: 14 }}>
                <PerfChart series={series} />
                <View style={styles.legend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: "#F4F4F5" }]} />
                    <Text style={styles.legendText}>{t("ads.impressions")}</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: "#22c55e" }]} />
                    <Text style={styles.legendText}>{t("ads.clicks")}</Text>
                  </View>
                </View>
              </View>
            </View>
          </>
        ) : tab === "campaigns" ? (
          campaigns.isLoading ? (
            <ActivityIndicator color="#FFFFFF" style={{ marginTop: 30 }} />
          ) : (campaigns.data ?? []).length === 0 ? (
            <View style={styles.card}>
              <Icon name="Megaphone" size={32} color="#3F3F46" />
              <Text style={styles.emptyTitle}>{t("ads.noCampaigns")}</Text>
              <Pressable onPress={() => setFormOpen(true)} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>{t("ads.createCampaign")}</Text>
              </Pressable>
            </View>
          ) : (
            (campaigns.data ?? []).map((c) => {
              const pct =
                c.total_budget_usd > 0
                  ? Math.min(100, (Number(c.spent_usd) / Number(c.total_budget_usd)) * 100)
                  : 0;
              return (
                <Pressable key={c.id} style={styles.card} onPress={() => campaignMenu(c)}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.campaignName} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <View
                      style={[
                        styles.statusPill,
                        { backgroundColor: `${STATUS_COLOR[c.status] ?? "#71717A"}22` },
                      ]}
                    >
                      <Text style={[styles.statusText, { color: STATUS_COLOR[c.status] ?? "#A1A1AA" }]}>
                        {t(`ads.statuses.${c.status}`)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.dim}>
                    {t(`ads.objectives.${c.objective}`)} · {t("ads.perDay", { amount: usd(c.daily_budget_usd) })}
                  </Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${pct}%` }]} />
                  </View>
                  <Text style={styles.dim}>
                    {t("ads.spentOf", { spent: usd(c.spent_usd), total: usd(c.total_budget_usd) })}
                  </Text>
                </Pressable>
              );
            })
          )
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.dim}>{t("ads.availableCredit")}</Text>
              <Text style={styles.balance}>{usd(account.data!.balance_usd)}</Text>

              <Text style={[styles.label, { marginTop: 14 }]}>{t("ads.addCredit")}</Text>
              <View style={styles.chipWrap}>
                {TOPUP_PRESETS.map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => setTopUpAmount(p)}
                    style={[styles.chip, topUpAmount === p && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, topUpAmount === p && styles.chipTextActive]}>
                      ${p}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                onPress={handleTopUp}
                disabled={buying || topUp.isPending || dhbForTopUp <= 0}
                style={[
                  styles.primaryBtn,
                  (buying || topUp.isPending || dhbForTopUp <= 0) && styles.disabled,
                ]}
              >
                {buying || topUp.isPending ? (
                  <ActivityIndicator color="#000000" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {dhbForTopUp > 0
                      ? t("ads.payDhb", { amount: dhbForTopUp.toLocaleString() })
                      : t("ads.loadingPrice")}
                  </Text>
                )}
              </Pressable>
              <Text style={styles.hint}>{t("ads.topUpExplanation")}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t("ads.paymentHistory")}</Text>
              {payments.isLoading ? (
                <ActivityIndicator color="#FFFFFF" style={{ marginVertical: 18 }} />
              ) : (payments.data ?? []).length === 0 ? (
                <Text style={[styles.dim, { paddingVertical: 12 }]}>{t("ads.noPayments")}</Text>
              ) : (
                (payments.data ?? []).map((p) => (
                  <View key={p.id} style={styles.payRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.payAmount}>{usd(p.usd_value)}</Text>
                      <Text style={styles.dim}>
                        {p.dhb_amount.toLocaleString()} DHB · {p.chain}
                      </Text>
                    </View>
                    <Text style={styles.dim}>
                      {new Date(p.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>

      <CampaignForm visible={formOpen} onClose={() => setFormOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  header: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 12, paddingVertical: 12,
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { color: "#FFFFFF", fontSize: 21, fontWeight: "700" },
  subtitle: { color: "#71717A", fontSize: 12, marginTop: 1 },
  addBtn: {
    width: 34, height: 34, borderRadius: 999, backgroundColor: "#FFFFFF",
    alignItems: "center", justifyContent: "center",
  },

  segment: {
    flexDirection: "row", gap: 4, marginHorizontal: 12, marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 999, padding: 3,
  },
  segmentBtn: { flex: 1, paddingVertical: 7, borderRadius: 999, alignItems: "center" },
  segmentBtnActive: { backgroundColor: "rgba(255,255,255,0.15)" },
  segmentText: { color: "#A1A1AA", fontSize: 12.5, fontWeight: "600" },
  segmentTextActive: { color: "#FFFFFF" },

  card: {
    borderRadius: 12, backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", padding: 16, gap: 6,
  },
  cardTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", marginBottom: 4 },
  dim: { color: "#71717A", fontSize: 12, lineHeight: 17 },
  emptyTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", marginTop: 6 },
  balance: { color: "#FFFFFF", fontSize: 30, fontWeight: "800" },
  hint: { color: "#52525B", fontSize: 10.5, lineHeight: 15, marginTop: 8 },

  kpiRow: { flexDirection: "row", gap: 8 },
  kpi: {
    flex: 1, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)",
    paddingVertical: 10, paddingHorizontal: 8, alignItems: "center",
  },
  kpiValue: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  kpiLabel: { color: "#71717A", fontSize: 10, marginTop: 3 },

  chartEmpty: { height: 100, alignItems: "center", justifyContent: "center" },
  legend: { flexDirection: "row", gap: 14, justifyContent: "center", marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 999 },
  legendText: { color: "#A1A1AA", fontSize: 11 },

  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  campaignName: { color: "#FFFFFF", fontSize: 14.5, fontWeight: "700", flex: 1 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: 10.5, fontWeight: "700", textTransform: "capitalize" },
  progressTrack: {
    height: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden", marginVertical: 6,
  },
  progressFill: { height: "100%", backgroundColor: "#FFFFFF" },

  payRow: {
    flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9,
    borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)",
  },
  payAmount: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "700" },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#0A0A0A", borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderTopWidth: 1, borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 18, paddingTop: 16, maxHeight: "90%",
  },
  sheetHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8,
  },
  sheetTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },

  label: { color: "#A1A1AA", fontSize: 12, fontWeight: "600", marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)", borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, color: "#FFFFFF", fontSize: 14,
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipActive: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
  chipText: { color: "#A1A1AA", fontSize: 11.5, fontWeight: "600", textTransform: "capitalize" },
  chipTextActive: { color: "#000000" },

  estBox: {
    marginTop: 14, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)", padding: 12,
  },
  estValue: { color: "#FFFFFF", fontSize: 20, fontWeight: "800", marginTop: 2 },

  primaryBtn: {
    marginTop: 14, borderRadius: 14, backgroundColor: "#FFFFFF",
    paddingVertical: 13, alignItems: "center", justifyContent: "center",
  },
  primaryBtnText: { color: "#000000", fontSize: 14.5, fontWeight: "700" },
  disabled: { opacity: 0.4 },
});
