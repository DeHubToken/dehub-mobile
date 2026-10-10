import { useSurfaceDraft } from '../hooks/useSurfaceDraft';
import { tokenLabel } from '../libs/token-label';
/**
 * WorkEditScreen
 * ==============
 * Native port of the web WorkEditPage (/bounty/:n/edit, legacy
 * /work/:uuid/edit). Poster-only; the copy fields are always editable while
 * the bounty is live, the money fields only while `isBudgetEditable` holds.
 * Editing never moves money — it only rewrites the listing.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import LoadErrorState from "../components/ui/LoadErrorState";
import { DeHubLoader } from "../components/DeHubLoader";
import { useKeyboardOffset } from "../hooks/useKeyboardLayout";
import { useUser } from "../context/AuthContext";
import { appLocale, parseDateOnly } from "../libs/date.util";
import { ScreenNames } from "../navigation/ScreenNames";
import type { AppStackParamList } from "../navigation/types";
import {
  useWorkJob,
  useUpdateJob,
  isJobEditable,
  isBudgetEditable,
  WORK_PLATFORMS,
  type WorkJob,
  type WorkCurrency,
  type WorkPlatform,
} from "../hooks/useWork";

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <View style={{ marginBottom: 14 }}>
    <Text style={styles.fieldLabel}>{label}</Text>
    {children}
  </View>
);

function toISODate(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Why the money fields are frozen, in the order the poster would hit them. */
function budgetLockReasonKey(job: WorkJob): string {
  if (job.fund_tx_hash) return "work.lockedFunded";
  if (job.application_count > 0 || job.submission_count > 0) return "work.lockedApplied";
  return "work.lockedUnderway";
}

export default function WorkEditScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const keyboardOffset = useKeyboardOffset();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<AppStackParamList, ScreenNames.WorkEdit>>();
  const { jobKey, job: seed } = route.params;

  const user = useUser() as any;
  const me: string | undefined =
    (user?.walletAddress || user?.address || "").toLowerCase() || undefined;

  const { data: job, isLoading, isError, refetch } = useWorkJob(jobKey, seed);
  const updateJob = useUpdateJob();

  const [title, setTitle] = useSurfaceDraft("screens/WorkEditScreen.tsx:title", "");
  const [description, setDescription] = useSurfaceDraft("screens/WorkEditScreen.tsx:description", "");
  const [platform, setPlatform] = useState<WorkPlatform>("x");
  const [targetUrl, setTargetUrl] = useSurfaceDraft("screens/WorkEditScreen.tsx:targetUrl", "");
  const [currency, setCurrency] = useState<WorkCurrency>("DHB");
  const [pricePerUnit, setPricePerUnit] = useSurfaceDraft("screens/WorkEditScreen.tsx:pricePerUnit", "");
  const [maxUnits, setMaxUnits] = useSurfaceDraft("screens/WorkEditScreen.tsx:maxUnits", "");
  const [deadline, setDeadline] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  // Seed once, so a background refetch never stomps what is being typed.
  const [seededId, setSeededId] = useState<string | null>(null);

  useEffect(() => {
    if (!job || seededId === job.id) return;
    setTitle.initialize(job.title);
    setDescription.initialize(job.description);
    setPlatform(job.platform ?? "x");
    setTargetUrl.initialize(job.target_url ?? "");
    setCurrency(job.currency);
    setPricePerUnit.initialize(String(Number(job.price_per_unit) || 0));
    setMaxUnits.initialize(String(Number(job.max_units) || 1));
    setDeadline(job.deadline ? job.deadline.slice(0, 10) : "");
    setSeededId(job.id);
  }, [job, seededId, setDescription, setMaxUnits, setPricePerUnit, setTargetUrl, setTitle]);

  const onDateChange = useCallback((_e: DateTimePickerEvent, selected?: Date) => {
    setShowDatePicker(Platform.OS === "ios");
    if (selected) setDeadline(toISODate(selected));
  }, []);

  const backToBounty = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else if (job) navigation.replace(ScreenNames.WorkJobDetail, { jobId: job.id, job });
    else navigation.navigate(ScreenNames.Work);
  }, [navigation, job]);

  if (isLoading && !job) {
    return (
      <View style={[styles.root, styles.center]}>
        <DeHubLoader size={56} />
      </View>
    );
  }

  if (!job) {
    return (
      <View style={styles.root}>
        <ScreenHeader title={t("work.editTitle")} />
        {isError ? (
          <LoadErrorState message={t("work.jobLoadFailed")} onRetry={() => refetch()} />
        ) : (
          <View style={styles.center}>
            <Icon name="Briefcase" size={40} color="#3F3F46" />
            <Text style={styles.dim}>{t("work.detail.notFound")}</Text>
          </View>
        )}
      </View>
    );
  }

  const isPoster = !!me && me === job.poster_address.toLowerCase();
  if (!isPoster || !isJobEditable(job)) {
    return (
      <View style={styles.root}>
        <ScreenHeader title={t("work.editTitle")} />
        <View style={styles.blocked}>
          <Text style={styles.blockedText}>
            {!me
              ? t("work.signInToEdit")
              : !isPoster
                ? t("work.onlyPosterCanEdit")
                : t("work.statusNotEditable", {
                    status: t(`work.status.${job.status}`, { defaultValue: job.status }),
                  })}
          </Text>
          <View style={styles.navRow}>
            {!me && (
              <Pressable
                onPress={() => navigation.navigate(ScreenNames.SignIn)}
                style={[styles.primaryBtn, { flex: 1 }]}
              >
                <Text style={styles.primaryBtnText}>{t("common.signIn")}</Text>
              </Pressable>
            )}
            <Pressable onPress={backToBounty} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>{t("work.backToBounty")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const budgetEditable = isBudgetEditable(job);
  const unitLabel = t(`work.units.${job.job_type}`);
  const priceNum = Number(pricePerUnit) || 0;
  const unitsNum = job.job_type === "contract" ? 1 : Number(maxUnits) || 0;
  const total = priceNum * unitsNum;
  const canSave =
    !!title.trim() && !!description.trim() && !updateJob.isPending && (!budgetEditable || total > 0);

  const handleSave = async () => {
    try {
      await updateJob.mutateAsync({
        id: job.id,
        title: title.trim(),
        description: description.trim(),
        platform: job.job_type !== "contract" ? platform : null,
        target_url: job.job_type !== "contract" ? targetUrl.trim() : null,
        deadline: deadline || null,
        budget: budgetEditable
          ? { currency, price_per_unit: priceNum, max_units: unitsNum }
          : undefined,
      });
      backToBounty();
    } catch {
      /* toast already shown by the mutation */
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={t("work.editTitle")}
        subtitle={t("work.typeLockedNote", { type: t(`work.postTypes.${job.job_type}.label`) })}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={keyboardOffset}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Field label={t("work.fields.title")}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={t("work.fields.titlePlaceholder")}
              placeholderTextColor="#8B8D90"
              style={styles.input}
            />
          </Field>
          <Field label={t("work.fields.description")}>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={t("work.fields.descriptionPlaceholder")}
              placeholderTextColor="#8B8D90"
              multiline
              style={[styles.input, { minHeight: 120, textAlignVertical: "top" }]}
            />
          </Field>

          {job.job_type !== "contract" && (
            <>
              <Field label={t("work.fields.platform")}>
                <View style={styles.chipWrap}>
                  {WORK_PLATFORMS.map((p) => (
                    <Pressable
                      key={p}
                      onPress={() => setPlatform(p)}
                      style={[styles.chip, platform === p && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, platform === p && styles.chipTextActive]}>
                        {p.toUpperCase()}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Field>
              <Field
                label={
                  job.job_type === "clipping"
                    ? t("work.fields.originalContentUrl")
                    : t("work.fields.targetUrl")
                }
              >
                <TextInput
                  value={targetUrl}
                  onChangeText={setTargetUrl}
                  placeholder="https://…"
                  placeholderTextColor="#8B8D90"
                  autoCapitalize="none"
                  keyboardType="url"
                  style={styles.input}
                />
              </Field>
            </>
          )}

          {budgetEditable ? (
            <>
              <Field label={t("work.fields.currency")}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(["DHB", "USDC"] as WorkCurrency[]).map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => setCurrency(c)}
                      style={[styles.currencyBtn, currency === c && styles.currencyBtnActive]}
                    >
                      <Text style={[styles.currencyText, currency === c && styles.currencyTextActive]}>
                        {tokenLabel(c)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Field>
              <Field
                label={
                  job.job_type === "contract"
                    ? t("work.fields.totalBudget")
                    : t("work.fields.pricePer", { unit: unitLabel })
                }
              >
                <TextInput
                  value={pricePerUnit}
                  onChangeText={setPricePerUnit}
                  placeholder="0.00"
                  placeholderTextColor="#8B8D90"
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
              </Field>
              {job.job_type !== "contract" && (
                <Field label={t("work.fields.maxUnits", { unit: unitLabel })}>
                  <TextInput
                    value={maxUnits}
                    onChangeText={setMaxUnits}
                    placeholder="100"
                    placeholderTextColor="#8B8D90"
                    keyboardType="number-pad"
                    style={styles.input}
                  />
                </Field>
              )}
              <View style={styles.totalBox}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>{t("work.totalEscrow")}</Text>
                  <Text style={styles.totalValue}>
                    {total.toLocaleString(appLocale(), { maximumFractionDigits: 4 })} {tokenLabel(currency)}
                  </Text>
                </View>
              </View>
            </>
          ) : (
            <View style={styles.totalBox}>
              <View style={styles.totalRow}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Icon name="Lock" size={13} color="#A1A1AA" />
                  <Text style={styles.totalLabel}>{t("work.detail.total")}</Text>
                </View>
                <Text style={styles.totalValue}>
                  {Number(job.total_budget).toLocaleString(appLocale(), { maximumFractionDigits: 4 })}{" "}
                  {tokenLabel(job.currency)}
                </Text>
              </View>
              <Text style={styles.totalHint}>{t(budgetLockReasonKey(job))}</Text>
            </View>
          )}

          <View style={{ height: 14 }} />
          <Field label={t("work.fields.deadlineOptional")}>
            <Pressable disabled={!!job.fund_tx_hash || job.funding_state!=="unfunded"} onPress={() => setShowDatePicker(true)} style={styles.input}>
              <Text style={{ color: deadline ? "#FFFFFF" : "#8B8D90", fontSize: 14 }}>
                {deadline || t("work.fields.pickDate")}
              </Text>
            </Pressable>
            {deadline.length > 0 && !job.fund_tx_hash && job.funding_state==="unfunded" && (
              <Pressable
                onPress={() => setDeadline("")}
                hitSlop={16}
                accessibilityRole="button"
                accessibilityLabel={t("work.fields.clearDeadline")}
              >
                <Text style={styles.clearDate}>{t("work.fields.clearDeadline")}</Text>
              </Pressable>
            )}
            {showDatePicker && (
              <DateTimePicker
                value={deadline ? parseDateOnly(deadline) : new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                minimumDate={new Date()}
                onChange={onDateChange}
              />
            )}
          </Field>

          <View style={styles.navRow}>
            <Pressable onPress={backToBounty} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>{t("common.cancel")}</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={!canSave}
              style={[styles.primaryBtn, { flex: 1 }, !canSave && styles.disabled]}
            >
              {updateJob.isPending ? (
                <ActivityIndicator color="#000000" />
              ) : (
                <Text style={styles.primaryBtnText}>{t("common.saveChanges")}</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  dim: { color: "#A1A1AA", fontSize: 13 },

  blocked: { padding: 16 },
  blockedText: { color: "#A1A1AA", fontSize: 14, lineHeight: 20 },

  fieldLabel: { color: "#A1A1AA", fontSize: 12, fontWeight: "600", marginBottom: 6 },
  input: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: "#FFFFFF",
    fontSize: 14,
  },
  clearDate: { color: "#808089", fontSize: 11.5, marginTop: 6 },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipActive: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
  chipText: { color: "#A1A1AA", fontSize: 11.5, fontWeight: "700" },
  chipTextActive: { color: "#000000" },

  currencyBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  currencyBtnActive: { backgroundColor: "#FFFFFF" },
  currencyText: { color: "#A1A1AA", fontSize: 13.5, fontWeight: "600" },
  currencyTextActive: { color: "#000000" },

  totalBox: {
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 14,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { color: "#A1A1AA", fontSize: 13 },
  totalValue: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  totalHint: { color: "#808089", fontSize: 11.5, marginTop: 6, lineHeight: 16 },

  navRow: { flexDirection: "row", gap: 8, marginTop: 18 },
  primaryBtn: {
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#000000", fontSize: 14.5, fontWeight: "700" },
  secondaryBtn: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.10)",
    paddingVertical: 13,
    alignItems: "center",
  },
  secondaryBtnText: { color: "#FFFFFF", fontSize: 14.5, fontWeight: "600" },
  disabled: { opacity: 0.4 },
});
