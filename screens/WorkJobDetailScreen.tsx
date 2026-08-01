/**
 * WorkJobDetailScreen
 * ===================
 * Native port of the web WorkJobDetailPage (/work/:jobId). The role logic
 * (isPoster / isAwarded / canReview) and every gate on the apply, submit,
 * approve, review and dispute controls mirrors web exactly.
 *
 * One platform difference: web uses window.prompt() for the rejection reason.
 * Alert.prompt is iOS-only in React Native, so rejection uses a small modal
 * with a text field instead — same data, works on both platforms.
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../components/ui/Icon";
import { theme } from "../theme";
import { openInApp } from "../libs/links.utils";
import { toastError } from "../libs/toast";
import { useUser } from "../context/AuthContext";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import { ScreenNames } from "../navigation/ScreenNames";
import type { AppStackParamList } from "../navigation/types";
import {
  useWorkJob,
  useJobApplications,
  useJobSubmissions,
  useJobReviews,
  useApplyToJob,
  useAwardApplicant,
  useSubmitProof,
  useApproveSubmission,
  useRejectSubmission,
  useLeaveReview,
  useOpenDispute,
  useMarkComplete,
  type WorkJobStatus,
  type WorkSubmission,
} from "../hooks/useWork";

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const num = (n: number, max = 4) =>
  (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: max });

/** Matches web's status pill colours. */
const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  open: { bg: "rgba(16,185,129,0.20)", fg: "#6EE7B7" },
  disputed: { bg: "rgba(239,68,68,0.20)", fg: "#FCA5A5" },
  completed: { bg: "rgba(59,130,246,0.20)", fg: "#BFDBFE" },
};
const statusStyle = (s: WorkJobStatus) =>
  STATUS_STYLE[s] ?? { bg: "rgba(255,255,255,0.10)", fg: "#A1A1AA" };

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={{ flex: 1 }}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </View>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const Stars: React.FC<{ value: number; size?: number; onPick?: (n: number) => void }> = ({
  value,
  size = 14,
  onPick,
}) => (
  <View style={{ flexDirection: "row", gap: 3 }}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Pressable key={n} onPress={onPick ? () => onPick(n) : undefined} disabled={!onPick} hitSlop={4}>
        <Icon
          name="Star"
          size={size}
          color={n <= value ? "#FBBF24" : "#3F3F46"}
          fill={n <= value ? "#FBBF24" : "transparent"}
        />
      </Pressable>
    ))}
  </View>
);

export default function WorkJobDetailScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<AppStackParamList, ScreenNames.WorkJobDetail>>();
  const { jobId, job: seed } = route.params;

  const user = useUser() as any;
  const me: string | undefined = (user?.walletAddress || user?.address || "")
    .toLowerCase() || undefined;
  const { showUserProfile } = useUserProfileSheet();

  const { data: job, isLoading, refetch, isRefetching } = useWorkJob(jobId, seed);
  const { data: applications = [] } = useJobApplications(jobId);
  const { data: submissions = [] } = useJobSubmissions(jobId);
  const { data: reviews = [] } = useJobReviews(jobId);

  const applyMutation = useApplyToJob();
  const awardMutation = useAwardApplicant();
  const submitMutation = useSubmitProof();
  const approveMutation = useApproveSubmission();
  const rejectMutation = useRejectSubmission();
  const reviewMutation = useLeaveReview();
  const disputeMutation = useOpenDispute();
  const completeMutation = useMarkComplete();

  const [coverLetter, setCoverLetter] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [proofText, setProofText] = useState("");
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [showDispute, setShowDispute] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<WorkSubmission | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const requireAuth = useCallback(() => {
    if (!me) {
      navigation.navigate(ScreenNames.SignIn);
      return false;
    }
    return true;
  }, [me, navigation]);

  /**
   * Web calls window.prompt('Reason for rejection?'). Alert.prompt is the exact
   * native equivalent but is iOS-only, so Android falls back to a modal with
   * the same single text field. Both submit only when a reason is given, which
   * is what web's `if (reason)` guard does.
   */
  const promptReject = useCallback(
    (submission: WorkSubmission) => {
      if (Platform.OS === "ios") {
        Alert.prompt(
          t("work.detail.rejectionReason"),
          undefined,
          (reason) => {
            if (reason && reason.trim()) {
              rejectMutation.mutate({
                submission_id: submission.id,
                job_id: submission.job_id,
                reason: reason.trim(),
              });
            }
          },
          "plain-text",
        );
        return;
      }
      setRejectTarget(submission);
      setRejectReason("");
    },
    [rejectMutation, t],
  );

  const roles = useMemo(() => {
    if (!job) return null;
    const isPoster = me === job.poster_address.toLowerCase();
    const isAwarded =
      !!me && !!job.awarded_worker_address && me === job.awarded_worker_address.toLowerCase();
    const myApp = applications.find((a) => a.applicant_address.toLowerCase() === me);
    const myReview = reviews.find((r) => r.reviewer_address.toLowerCase() === me);
    const isCompleted = job.status === "completed";
    const canReview =
      isCompleted &&
      (isPoster ||
        submissions.some(
          (s) => s.worker_address.toLowerCase() === me && s.approval_status === "approved",
        ));
    return { isPoster, isAwarded, myApp, myReview, isCompleted, canReview };
  }, [job, me, applications, reviews, submissions]);

  if (isLoading && !job) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  if (!job || !roles) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
            <Icon name="ArrowLeft" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>{t("work.bounty")}</Text>
        </View>
        <View style={styles.center}>
          <Text style={styles.dim}>{t("work.detail.notFound")}</Text>
        </View>
      </View>
    );
  }

  const { isPoster, isAwarded, myApp, myReview, canReview } = roles;
  const st = statusStyle(job.status);

  const canApply =
    job.job_type === "contract" && !isPoster && !myApp && !isAwarded && job.status === "open";
  const canSubmitProof =
    ((job.job_type !== "contract" && !isPoster) || isAwarded) &&
    job.status !== "completed" &&
    job.status !== "cancelled";
  const showSubmissions = job.job_type !== "contract" || isAwarded || isPoster;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Icon name="ArrowLeft" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {job.title}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top + 44}
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={theme.colors.accentForeground}
            />
          }
        >
          {/* Header card */}
          <View style={styles.card}>
            <View style={styles.badgeRow}>
              <View style={styles.badge}>
                <Icon name="Briefcase" size={11} color="#D4D4D8" />
                <Text style={styles.badgeText}>{t(`work.types.${job.job_type}`)}</Text>
              </View>
              {!!job.platform && (
                <View style={styles.badgeDim}>
                  <Text style={styles.badgeDimText}>{job.platform.toUpperCase()}</Text>
                </View>
              )}
              <View style={[styles.badgeDim, { backgroundColor: st.bg }]}>
                <Text style={[styles.badgeDimText, { color: st.fg }]}>
                  {t(`work.status.${job.status}`, { defaultValue: job.status })}
                </Text>
              </View>
            </View>

            <Text style={styles.jobTitle}>{job.title}</Text>
            <Text style={styles.jobDesc}>{job.description}</Text>

            {!!job.target_url && (
              <Pressable style={styles.linkRow} onPress={() => openInApp(job.target_url!)}>
                <Icon name="ExternalLink" size={12} color="#A1A1AA" />
                <Text style={styles.linkText} numberOfLines={1}>
                  {job.target_url}
                </Text>
              </Pressable>
            )}

            <View style={styles.statRow}>
              <Stat label={t("work.detail.total")} value={`${num(job.total_budget)} ${job.currency}`} />
              {job.job_type !== "contract" ? (
                <Stat label={t("work.detail.perUnit")} value={`${job.price_per_unit} ${job.currency}`} />
              ) : (
                <Stat label={t("work.detail.type")} value={t("work.types.contract")} />
              )}
              <Stat label={t("work.detail.slots")} value={`${job.units_approved}/${job.max_units}`} />
            </View>

            <Pressable onPress={() => showUserProfile(job.poster_address)}>
              <Text style={styles.postedBy}>
                {t("work.detail.postedBy")} {""}
                <Text style={styles.postedByLink}>{shortAddr(job.poster_address)}</Text>
              </Text>
            </Pressable>
          </View>

          {/* Applications — contract jobs only */}
          {job.job_type === "contract" && (
            <Section title={t("work.detail.applicants", { count: applications.length })}>
              {canApply && (
                <View style={{ marginBottom: 14, gap: 8 }}>
                  <TextInput
                    value={coverLetter}
                    onChangeText={setCoverLetter}
                    placeholder={t("work.detail.coverLetterPlaceholder")}
                    placeholderTextColor="#52525B"
                    multiline
                    style={[styles.input, styles.textarea]}
                  />
                  <Pressable
                    disabled={!coverLetter.trim() || applyMutation.isPending}
                    onPress={() => {
                      if (!requireAuth()) return;
                      applyMutation.mutate(
                        { job_id: job.id, cover_letter: coverLetter.trim() },
                        { onSuccess: () => setCoverLetter("") },
                      );
                    }}
                    style={[
                      styles.primaryBtn,
                      (!coverLetter.trim() || applyMutation.isPending) && styles.disabled,
                    ]}
                  >
                    <Text style={styles.primaryBtnText}>{t("work.detail.apply")}</Text>
                  </Pressable>
                </View>
              )}

              {applications.length === 0 ? (
                <Text style={styles.dim}>{t("work.detail.noApplicants")}</Text>
              ) : (
                applications.map((a) => (
                  <View key={a.id} style={styles.row}>
                    <View style={styles.rowHead}>
                      <Pressable onPress={() => showUserProfile(a.applicant_address)}>
                        <Text style={styles.rowAddr}>{shortAddr(a.applicant_address)}</Text>
                      </Pressable>
                      <View
                        style={[
                          styles.pill,
                          a.status === "awarded" && { backgroundColor: "rgba(16,185,129,0.20)" },
                        ]}
                      >
                        <Text
                          style={[styles.pillText, a.status === "awarded" && { color: "#6EE7B7" }]}
                        >
                          {t(`work.status.${a.status}`, { defaultValue: a.status })}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.rowBody}>{a.cover_letter}</Text>
                    {isPoster && a.status === "pending" && job.status === "open" && (
                      <Pressable
                        onPress={() =>
                          awardMutation.mutate({
                            job_id: job.id,
                            onchain_job_id: job.onchain_job_id,
                            application_id: a.id,
                            worker_address: a.applicant_address,
                          })
                        }
                        style={styles.smallBtn}
                      >
                        <Text style={styles.smallBtnText}>{t("work.detail.awardEscrow")}</Text>
                      </Pressable>
                    )}
                  </View>
                ))
              )}
            </Section>
          )}

          {/* Submissions */}
          {showSubmissions && (
            <Section title={t("work.detail.submissions", { count: submissions.length })}>
              {canSubmitProof && (
                <View style={{ marginBottom: 14, gap: 8 }}>
                  <TextInput
                    value={proofUrl}
                    onChangeText={setProofUrl}
                    placeholder={t("work.detail.proofUrlPlaceholder")}
                    placeholderTextColor="#52525B"
                    autoCapitalize="none"
                    style={styles.input}
                  />
                  <TextInput
                    value={proofText}
                    onChangeText={setProofText}
                    placeholder={t("work.detail.notesOptional")}
                    placeholderTextColor="#52525B"
                    multiline
                    style={[styles.input, { minHeight: 60, textAlignVertical: "top" }]}
                  />
                  <Pressable
                    disabled={!proofUrl.trim() || submitMutation.isPending}
                    onPress={() => {
                      if (!requireAuth()) return;
                      submitMutation.mutate(
                        {
                          job_id: job.id,
                          proof_url: proofUrl.trim(),
                          proof_text: proofText.trim(),
                          platform: job.platform ?? undefined,
                        },
                        {
                          onSuccess: () => {
                            setProofUrl("");
                            setProofText("");
                          },
                        },
                      );
                    }}
                    style={[
                      styles.primaryBtn,
                      (!proofUrl.trim() || submitMutation.isPending) && styles.disabled,
                    ]}
                  >
                    <Text style={styles.primaryBtnText}>{t("work.detail.submitProof")}</Text>
                  </Pressable>
                </View>
              )}

              {submissions.length === 0 ? (
                <Text style={styles.dim}>{t("work.detail.noSubmissions")}</Text>
              ) : (
                submissions.map((s) => {
                  const approved = s.approval_status === "approved";
                  const rejected = s.approval_status === "rejected";
                  return (
                    <View key={s.id} style={styles.row}>
                      <View style={styles.rowHead}>
                        <Pressable onPress={() => showUserProfile(s.worker_address)}>
                          <Text style={styles.rowAddr}>{shortAddr(s.worker_address)}</Text>
                        </Pressable>
                        <View
                          style={[
                            styles.pill,
                            approved && { backgroundColor: "rgba(16,185,129,0.20)" },
                            rejected && { backgroundColor: "rgba(239,68,68,0.20)" },
                          ]}
                        >
                          <Text
                            style={[
                              styles.pillText,
                              approved && { color: "#6EE7B7" },
                              rejected && { color: "#FCA5A5" },
                            ]}
                          >
                            {t(`work.status.${s.approval_status}`, {
                              defaultValue: s.approval_status,
                            })}
                          </Text>
                        </View>
                      </View>

                      <Pressable style={styles.linkRow} onPress={() => openInApp(s.proof_url)}>
                        <Icon name="ExternalLink" size={11} color="#A1A1AA" />
                        <Text style={styles.linkText} numberOfLines={2}>
                          {s.proof_url}
                        </Text>
                      </Pressable>

                      {!!s.proof_text && <Text style={styles.rowBody}>{s.proof_text}</Text>}

                      {approved && s.payout_amount > 0 && (
                        <Text style={styles.paidText}>
                          {t("work.detail.paid", {
                            amount: s.payout_amount,
                            currency: job.currency,
                          })}
                        </Text>
                      )}

                      {isPoster && s.approval_status === "pending" && (
                        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                          <Pressable
                            onPress={() =>
                              approveMutation.mutate({
                                submission_id: s.id,
                                job_id: job.id,
                                onchain_job_id: job.onchain_job_id,
                                worker_address: s.worker_address,
                                payout_amount:
                                  job.job_type === "contract"
                                    ? job.total_budget
                                    : job.price_per_unit,
                              })
                            }
                            style={styles.approveBtn}
                          >
                            <Icon name="Check" size={12} color="#6EE7B7" />
                            <Text style={styles.approveText}>{t("work.detail.approveRelease")}</Text>
                          </Pressable>
                          <Pressable onPress={() => promptReject(s)} style={styles.rejectBtn}>
                            <Icon name="X" size={12} color="#FCA5A5" />
                            <Text style={styles.rejectText}>{t("work.detail.reject")}</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </Section>
          )}

          {/* Reviews */}
          <Section title={t("work.detail.reviews", { count: reviews.length })}>
            {canReview && !myReview && (
              <View style={{ marginBottom: 14, gap: 10 }}>
                <Stars value={rating} size={26} onPick={setRating} />
                <TextInput
                  value={reviewComment}
                  onChangeText={setReviewComment}
                  placeholder={t("work.detail.reviewPlaceholder")}
                  placeholderTextColor="#52525B"
                  multiline
                  style={[styles.input, { minHeight: 60, textAlignVertical: "top" }]}
                />
                <Pressable
                  onPress={() => {
                    const reviewee = isPoster
                      ? submissions.find((s) => s.approval_status === "approved")?.worker_address ??
                        job.awarded_worker_address
                      : job.poster_address;
                    if (!reviewee) {
                      toastError(t("work.detail.noCounterparty"));
                      return;
                    }
                    reviewMutation.mutate(
                      {
                        job_id: job.id,
                        reviewee_address: reviewee,
                        reviewer_role: isPoster ? "poster" : "worker",
                        rating,
                        comment: reviewComment.trim(),
                      },
                      { onSuccess: () => setReviewComment("") },
                    );
                  }}
                  style={styles.primaryBtn}
                >
                  <Text style={styles.primaryBtnText}>{t("work.detail.postReview")}</Text>
                </Pressable>
              </View>
            )}

            {reviews.length === 0 ? (
              <Text style={styles.dim}>{t("work.detail.noReviews")}</Text>
            ) : (
              reviews.map((r) => (
                <View key={r.id} style={styles.row}>
                  <View style={styles.rowHead}>
                    <Pressable onPress={() => showUserProfile(r.reviewer_address)}>
                      <Text style={styles.rowAddr}>{shortAddr(r.reviewer_address)}</Text>
                    </Pressable>
                    <Stars value={r.rating} size={13} />
                  </View>
                  {!!r.comment && <Text style={styles.rowBody}>{r.comment}</Text>}
                </View>
              ))
            )}
          </Section>

          {/* Actions */}
          <View style={styles.actions}>
            {isPoster && job.status === "in_progress" && (
              <Pressable onPress={() => completeMutation.mutate(job.id)} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>{t("work.detail.markComplete")}</Text>
              </Pressable>
            )}
            {(isPoster || isAwarded) &&
              job.status !== "completed" &&
              job.status !== "disputed" && (
                <Pressable onPress={() => setShowDispute((s) => !s)} style={styles.disputeBtn}>
                  <Icon name="TriangleAlert" size={13} color="#FCA5A5" />
                  <Text style={styles.disputeBtnText}>{t("work.detail.openDispute")}</Text>
                </Pressable>
              )}
          </View>

          {showDispute && (
            <View style={styles.disputeBox}>
              <TextInput
                value={disputeReason}
                onChangeText={setDisputeReason}
                placeholder={t("work.detail.disputePlaceholder")}
                placeholderTextColor="#52525B"
                multiline
                style={[styles.input, styles.textarea]}
              />
              <Pressable
                disabled={!disputeReason.trim()}
                onPress={() => {
                  disputeMutation.mutate({
                    job_id: job.id,
                    onchain_job_id: job.onchain_job_id,
                    reason: disputeReason.trim(),
                  });
                  setShowDispute(false);
                  setDisputeReason("");
                }}
                style={[styles.disputeSubmit, !disputeReason.trim() && styles.disabled]}
              >
                <Text style={styles.disputeSubmitText}>{t("work.detail.submitDispute")}</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Rejection reason — web uses window.prompt(), which RN has no
          cross-platform equivalent for. */}
      <Modal
        visible={!!rejectTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("work.detail.rejectionReason")}</Text>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder={t("work.detail.rejectionPlaceholder")}
              placeholderTextColor="#52525B"
              multiline
              autoFocus
              style={[styles.input, styles.textarea]}
            />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Pressable
                onPress={() => setRejectTarget(null)}
                style={[styles.secondaryBtn, { flex: 1 }]}
              >
                <Text style={styles.secondaryBtnText}>{t("common.cancel")}</Text>
              </Pressable>
              <Pressable
                disabled={!rejectReason.trim()}
                onPress={() => {
                  const target = rejectTarget;
                  if (!target || !rejectReason.trim()) return;
                  rejectMutation.mutate({
                    submission_id: target.id,
                    job_id: job.id,
                    reason: rejectReason.trim(),
                  });
                  setRejectTarget(null);
                  setRejectReason("");
                }}
                style={[styles.rejectConfirm, !rejectReason.trim() && styles.disabled, { flex: 1 }]}
              >
                <Text style={styles.rejectConfirmText}>{t("work.detail.reject")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", flex: 1 },

  card: {
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 16,
    marginBottom: 14,
  },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  badgeText: { color: "#D4D4D8", fontSize: 10.5, fontWeight: "600", textTransform: "capitalize" },
  badgeDim: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  badgeDimText: {
    color: "#A1A1AA",
    fontSize: 10.5,
    fontWeight: "600",
    textTransform: "capitalize",
  },

  jobTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "700", lineHeight: 26 },
  jobDesc: { color: "#D4D4D8", fontSize: 13.5, lineHeight: 20, marginTop: 8 },

  linkRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  linkText: { color: "#A1A1AA", fontSize: 11.5, flex: 1 },

  statRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
  },
  statLabel: { color: "#71717A", fontSize: 10.5, fontWeight: "600" },
  statValue: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "700", marginTop: 3 },

  postedBy: { color: "#52525B", fontSize: 11, marginTop: 12 },
  postedByLink: { color: "#A1A1AA", textDecorationLine: "underline" },

  section: { marginBottom: 18 },
  sectionTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", marginBottom: 10 },

  row: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    marginBottom: 8,
  },
  rowHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  rowAddr: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  rowBody: { color: "#A1A1AA", fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  pillText: {
    color: "#A1A1AA",
    fontSize: 10.5,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  paidText: { color: "#6EE7B7", fontSize: 11, marginTop: 6 },

  input: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#FFFFFF",
    fontSize: 14,
  },
  textarea: { minHeight: 84, textAlignVertical: "top" },

  primaryBtn: {
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  primaryBtnText: { color: "#000000", fontSize: 14, fontWeight: "700" },
  disabled: { opacity: 0.4 },

  smallBtn: {
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  smallBtnText: { color: "#000000", fontSize: 12, fontWeight: "700" },

  approveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "rgba(16,185,129,0.20)",
  },
  approveText: { color: "#6EE7B7", fontSize: 11.5, fontWeight: "700" },
  rejectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "rgba(239,68,68,0.20)",
  },
  rejectText: { color: "#FCA5A5", fontSize: 11.5, fontWeight: "700" },

  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  disputeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(239,68,68,0.20)",
  },
  disputeBtnText: { color: "#FECACA", fontSize: 13.5, fontWeight: "600" },
  disputeBox: {
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "rgba(239,68,68,0.05)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.20)",
    gap: 10,
  },
  disputeSubmit: {
    borderRadius: 12,
    backgroundColor: "rgba(239,68,68,0.30)",
    paddingVertical: 11,
    alignItems: "center",
  },
  disputeSubmitText: { color: "#FEE2E2", fontSize: 13.5, fontWeight: "700" },

  dim: { color: "#71717A", fontSize: 13 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  modalCard: {
    backgroundColor: "#0A0A0A",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: 18,
  },
  modalTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", marginBottom: 12 },
  secondaryBtn: {
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    paddingVertical: 11,
    alignItems: "center",
  },
  secondaryBtnText: { color: "#E4E4E7", fontSize: 13.5, fontWeight: "600" },
  rejectConfirm: {
    borderRadius: 12,
    backgroundColor: "rgba(239,68,68,0.30)",
    paddingVertical: 11,
    alignItems: "center",
  },
  rejectConfirmText: { color: "#FEE2E2", fontSize: 13.5, fontWeight: "700" },
});
