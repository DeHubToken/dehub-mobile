/**
 * WorkPostScreen
 * ==============
 * Native port of the web WorkPostPage (/work/post). Same three steps, same
 * fields, same validation gates and the same escrow disclaimer copy.
 *
 * `deadline` is sent as a YYYY-MM-DD string, matching web's <input type="date">.
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
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../components/ui/Icon";
import ScreenHeader, { SCREEN_HEADER_HEIGHT } from "../components/ScreenHeader";
import { useKeyboardOffset } from "../hooks/useKeyboardLayout";
import { useAuthState } from "../context/AuthContext";
import { ScreenNames } from "../navigation/ScreenNames";
import {
  useCreateJob,
  WORK_PLATFORMS,
  type WorkJobType,
  type WorkCurrency,
  type WorkPlatform,
} from "../hooks/useWork";

const TYPE_OPTIONS: Array<{
  id: WorkJobType;
  icon: IconName;
}> = [
  {
    id: "shill",
    icon: "MessageSquare",
  },
  {
    id: "clipping",
    icon: "Scissors",
  },
  {
    id: "contract",
    icon: "Briefcase",
  },
];

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <View style={{ marginBottom: 14 }}>
    <Text style={styles.fieldLabel}>{label}</Text>
    {children}
  </View>
);

/** Local YYYY-MM-DD, matching what web's date input submits. */
function toISODate(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function WorkPostScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // ScreenHeader sits above the KeyboardAvoidingView, on top of the inset the
  // root SafeAreaView already spent.
  const keyboardOffset = useKeyboardOffset(SCREEN_HEADER_HEIGHT);
  const navigation = useNavigation<any>();
  const { isSignedIn, needsUsername } = useAuthState();
  const isAuthed = isSignedIn && !needsUsername;
  const createJob = useCreateJob();

  const [step, setStep] = useState(1);
  const [jobType, setJobType] = useState<WorkJobType>("shill");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [platform, setPlatform] = useState<WorkPlatform>("x");
  const [targetUrl, setTargetUrl] = useState("");
  const [currency, setCurrency] = useState<WorkCurrency>("DHB");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [maxUnits, setMaxUnits] = useState("");
  const [deadline, setDeadline] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  const priceNum = Number(pricePerUnit) || 0;
  const unitsNum = jobType === "contract" ? 1 : Number(maxUnits) || 0;
  const total = priceNum * unitsNum;
  const unitLabel = useMemo(() => t(`work.units.${jobType}`), [jobType, t]);

  const onDateChange = useCallback((_e: DateTimePickerEvent, selected?: Date) => {
    setShowDatePicker(Platform.OS === "ios");
    if (selected) setDeadline(toISODate(selected));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!isAuthed) {
      navigation.navigate(ScreenNames.SignIn);
      return;
    }
    try {
      const job = await createJob.mutateAsync({
        job_type: jobType,
        title: title.trim(),
        description: description.trim(),
        platform: jobType !== "contract" ? platform : undefined,
        target_url: targetUrl.trim() || undefined,
        currency,
        price_per_unit: priceNum,
        max_units: jobType === "contract" ? 1 : unitsNum,
        deadline: deadline || undefined,
      });
      // Replace so Back from the new job returns to the board, not the form.
      navigation.replace(ScreenNames.WorkJobDetail, { jobId: job.id, job });
    } catch {
      /* toast already shown by the mutation */
    }
  }, [
    isAuthed,
    navigation,
    createJob,
    jobType,
    title,
    description,
    platform,
    targetUrl,
    currency,
    priceNum,
    unitsNum,
    deadline,
  ]);

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={t("work.postBounty")}
        subtitle={t("work.stepOf", { step, total: 3 })}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={keyboardOffset}
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {step === 1 && (
            <View style={{ gap: 10 }}>
              {TYPE_OPTIONS.map((option) => {
                const active = jobType === option.id;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => setJobType(option.id)}
                    style={[styles.typeCard, active && styles.typeCardActive]}
                  >
                    <View style={styles.typeIcon}>
                      <Icon name={option.icon} size={20} color="#FFFFFF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.typeLabel}>{t(`work.postTypes.${option.id}.label`)}</Text>
                      <Text style={styles.typeDesc}>
                        {t(`work.postTypes.${option.id}.description`)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
              <Pressable onPress={() => setStep(2)} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>{t("work.continue")}</Text>
              </Pressable>
            </View>
          )}

          {step === 2 && (
            <View>
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

              {jobType !== "contract" && (
                <>
                  <Field label={t("work.fields.platform")}>
                    <View style={styles.chipWrap}>
                      {WORK_PLATFORMS.map((p) => (
                        <Pressable
                          key={p}
                          onPress={() => setPlatform(p)}
                          style={[styles.chip, platform === p && styles.chipActive]}
                        >
                          <Text
                            style={[styles.chipText, platform === p && styles.chipTextActive]}
                          >
                            {p.toUpperCase()}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </Field>
                  <Field
                    label={
                      jobType === "clipping"
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

              <View style={styles.navRow}>
                <Pressable onPress={() => setStep(1)} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>{t("common.goBack")}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setStep(3)}
                  disabled={!title.trim() || !description.trim()}
                  style={[
                    styles.primaryBtn,
                    { flex: 1 },
                    (!title.trim() || !description.trim()) && styles.disabled,
                  ]}
                >
                  <Text style={styles.primaryBtnText}>{t("work.continue")}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {step === 3 && (
            <View>
              <Field label={t("work.fields.currency")}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(["DHB", "USDC"] as WorkCurrency[]).map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => setCurrency(c)}
                      style={[styles.currencyBtn, currency === c && styles.currencyBtnActive]}
                    >
                      <Text
                        style={[
                          styles.currencyText,
                          currency === c && styles.currencyTextActive,
                        ]}
                      >
                        {c}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Field>

              <Field
                label={
                  jobType === "contract"
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

              {jobType !== "contract" && (
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

              <Field label={t("work.fields.deadlineOptional")}>
                <Pressable onPress={() => setShowDatePicker(true)} style={styles.input}>
                  <Text style={{ color: deadline ? "#FFFFFF" : "#8B8D90", fontSize: 14 }}>
                    {deadline || t("work.fields.pickDate")}
                  </Text>
                </Pressable>
                {deadline.length > 0 && (
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
                    value={deadline ? new Date(deadline) : new Date()}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    minimumDate={new Date()}
                    onChange={onDateChange}
                  />
                )}
              </Field>

              <View style={styles.totalBox}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>{t("work.totalEscrow")}</Text>
                  <Text style={styles.totalValue}>
                    {total.toLocaleString(undefined, { maximumFractionDigits: 4 })} {currency}
                  </Text>
                </View>
                <Text style={styles.totalHint}>
                  {t("work.platformFee")}
                </Text>
                <Text style={styles.totalWarn}>
                  {t("work.escrowNotice")}
                </Text>
              </View>

              <View style={styles.navRow}>
                <Pressable onPress={() => setStep(2)} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>{t("common.goBack")}</Text>
                </Pressable>
                <Pressable
                  onPress={handleSubmit}
                  disabled={createJob.isPending || total <= 0}
                  style={[
                    styles.primaryBtn,
                    { flex: 1 },
                    (createJob.isPending || total <= 0) && styles.disabled,
                  ]}
                >
                  {createJob.isPending ? (
                    <ActivityIndicator color="#000000" />
                  ) : (
                    <Text style={styles.primaryBtnText}>{t("work.postJob")}</Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },

  typeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  typeCardActive: { backgroundColor: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.30)" },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  typeLabel: { color: "#FFFFFF", fontSize: 14.5, fontWeight: "700" },
  typeDesc: { color: "#A1A1AA", fontSize: 12, marginTop: 3, lineHeight: 17 },

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
  clearDate: { color: "#71717A", fontSize: 11.5, marginTop: 6 },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
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
    marginTop: 4,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { color: "#A1A1AA", fontSize: 13 },
  totalValue: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  totalHint: { color: "#71717A", fontSize: 11.5, marginTop: 5 },
  totalWarn: { color: "rgba(253,230,138,0.80)", fontSize: 11, marginTop: 8, lineHeight: 16 },

  navRow: { flexDirection: "row", gap: 8, marginTop: 18 },
  primaryBtn: {
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    paddingVertical: 13,
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
