/**
 * Feedback — the permanent testimonial hub (mobile twin)
 * ======================================================
 * Mirror of web's src/components/app/stats/FeedbackSection.tsx. Same table,
 * same two consent booleans, same public view for the approved wall — a quote
 * left on the phone and one left on the desktop are the same row.
 *
 * Two consent boxes, not one: `allow_promo` licenses the words, `allow_name`
 * licenses attaching the person to them. Being happy to be quoted anonymously
 * is a normal position that one checkbox cannot express. Both default off, and
 * neither is required to submit.
 *
 * The wall reads `public_testimonials`, a view that carries no wallet address
 * and nulls the username unless that person consented to being named — so an
 * anonymous quote never ships an identity over the wire, whatever the client
 * chooses to render.
 *
 * StatsScreen is otherwise hardcoded English. New strings here go through
 * `t()` regardless: adding one more untranslated line to an unwired screen is
 * how those screens stay unwired.
 */

import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";

import { useUser, useAuthState } from "../../context/AuthContext";
import { supabase } from "../../services/supabase";
import { withWalletHeader } from "../../libs/supabase-wallet-client";
import { toastError, toastSuccess } from "../../libs/toast";

const MIN_LENGTH = 10;
const MAX_LENGTH = 1200;

interface ApprovedTestimonial {
  id: string;
  body: string;
  time_using: string | null;
  username: string | null;
  created_at: string;
}

/** Square box + tick. RN has no checkbox primitive and pulling one in for two
 *  boxes would be a dependency for a 20-line component. */
function CheckBox({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.box, checked && styles.boxChecked]}>
      {checked ? <Text style={styles.boxTick}>✓</Text> : null}
    </View>
  );
}

export default function FeedbackSection() {
  const { t } = useTranslation();
  const user = useUser();
  const { isSignedIn } = useAuthState();
  const walletAddress = user?.walletAddress || user?.address || null;

  const [body, setBody] = useState("");
  const [timeUsing, setTimeUsing] = useState("");
  const [allowPromo, setAllowPromo] = useState(false);
  const [allowName, setAllowName] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [approved, setApproved] = useState<ApprovedTestimonial[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("public_testimonials")
        .select("id, body, time_using, username, created_at")
        .order("created_at", { ascending: false })
        .limit(12);
      if (!cancelled && data) setApproved(data as ApprovedTestimonial[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmed = body.trim();
  const canSubmit =
    isSignedIn && !!walletAddress && trimmed.length >= MIN_LENGTH && trimmed.length <= MAX_LENGTH && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !walletAddress) return;
    setSubmitting(true);
    try {
      // The wallet header is not optional: the insert policy checks it, so
      // without it every submission fails RLS rather than arriving
      // unattributed.
      const { error } = await withWalletHeader(
        supabase.from("user_testimonials").insert({
          wallet_address: walletAddress.toLowerCase(),
          username: user?.username ?? null,
          body: trimmed,
          time_using: timeUsing.trim() || null,
          allow_promo: allowPromo,
          allow_name: allowPromo && allowName,
        }),
        walletAddress,
      );
      if (error) throw error;

      setSubmitted(true);
      setBody("");
      setTimeUsing("");
      toastSuccess(t("stats.feedback.toastSent", "Thanks — your feedback is with us"));
    } catch (err) {
      console.error("[Feedback] Submit error:", err);
      toastError(t("stats.feedback.toastFailed", "Could not send that, try again"));
    } finally {
      setSubmitting(false);
    }
  }, [allowName, allowPromo, canSubmit, t, timeUsing, trimmed, user?.username, walletAddress]);

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("stats.feedback.title", "Feedback")}</Text>
        <Text style={styles.intro}>
          {t(
            "stats.feedback.intro",
            "Been using DeHub for a while? Tell us what it has been like. Good, bad or specific — all of it is read. If you are happy for us to quote you, tick the box and we may use it in posts, videos or on the site.",
          )}
        </Text>

        {submitted ? (
          <View style={styles.done}>
            <Text style={styles.intro}>
              {t(
                "stats.feedback.thanks",
                "Got it — thank you. Anything you cleared for promotional use is reviewed by a person before it appears anywhere.",
              )}
            </Text>
            <Pressable onPress={() => setSubmitted(false)}>
              <Text style={styles.link}>{t("stats.feedback.again", "Leave more feedback")}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <TextInput
              value={body}
              onChangeText={(value) => setBody(value.slice(0, MAX_LENGTH))}
              multiline
              numberOfLines={4}
              placeholder={t("stats.feedback.placeholder", "In your own words…")}
              placeholderTextColor="#6F7174"
              style={[styles.input, styles.textarea]}
            />
            <TextInput
              value={timeUsing}
              onChangeText={(value) => setTimeUsing(value.slice(0, 80))}
              placeholder={t("stats.feedback.timeUsingPlaceholder", "How long have you been here? (optional)")}
              placeholderTextColor="#6F7174"
              style={styles.input}
            />

            <Pressable
              style={styles.consentRow}
              onPress={() => {
                const next = !allowPromo;
                setAllowPromo(next);
                if (!next) setAllowName(false);
              }}
            >
              <CheckBox checked={allowPromo} />
              <Text style={styles.consentText}>
                {t(
                  "stats.feedback.consentPromo",
                  "I authorise DeHub to quote this feedback in marketing and promotional materials.",
                )}
              </Text>
            </Pressable>

            {allowPromo ? (
              <Pressable style={[styles.consentRow, styles.consentNested]} onPress={() => setAllowName(!allowName)}>
                <CheckBox checked={allowName} />
                <Text style={styles.consentText}>
                  {t(
                    "stats.feedback.consentName",
                    "You can show my username alongside it. Leave this unticked to be quoted anonymously.",
                  )}
                </Text>
              </Pressable>
            ) : null}

            <View style={styles.submitRow}>
              <Pressable
                disabled={!canSubmit}
                onPress={handleSubmit}
                style={[styles.submit, !canSubmit && styles.submitDisabled]}
              >
                {submitting ? (
                  <ActivityIndicator color="#09090B" size="small" />
                ) : (
                  <Text style={[styles.submitText, !canSubmit && styles.submitTextDisabled]}>
                    {t("stats.feedback.submit", "Send feedback")}
                  </Text>
                )}
              </Pressable>
              <Text style={styles.counter}>
                {!isSignedIn
                  ? t("stats.feedback.signedOut", "Sign in to leave feedback")
                  : `${trimmed.length}/${MAX_LENGTH}`}
              </Text>
            </View>
          </>
        )}
      </View>

      {approved.length > 0 ? (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{t("stats.feedback.wallTitle", "What people say")}</Text>
            <Text style={styles.cardHint}>{t("stats.feedback.wallNote", "published with permission")}</Text>
          </View>
          {approved.map((item) => (
            <View key={item.id} style={styles.quote}>
              <Text style={styles.quoteBody}>“{item.body}”</Text>
              <Text style={styles.quoteBy}>
                {item.username ? `@${item.username}` : t("stats.feedback.anonymous", "A DeHub member")}
                {item.time_using ? ` · ${item.time_using}` : ""}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#1C1C1C", borderColor: "#333333", borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  cardTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  cardHint: { color: "#8B8D90", fontSize: 11 },
  intro: { color: "#A6A9AC", fontSize: 12, lineHeight: 18 },
  input: {
    backgroundColor: "#111111",
    borderColor: "#333333",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#FFFFFF",
    fontSize: 13,
  },
  textarea: { minHeight: 96, textAlignVertical: "top" },
  consentRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  consentNested: { paddingLeft: 24 },
  consentText: { color: "#A6A9AC", fontSize: 12, lineHeight: 18, flex: 1 },
  box: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#5A5C5F",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  boxChecked: { backgroundColor: "#F4F4F5", borderColor: "#F4F4F5" },
  boxTick: { color: "#09090B", fontSize: 12, fontWeight: "700", lineHeight: 14 },
  submitRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  submit: { backgroundColor: "#F4F4F5", borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  submitDisabled: { backgroundColor: "#2A2A2A" },
  submitText: { color: "#09090B", fontWeight: "700", fontSize: 13 },
  submitTextDisabled: { color: "#6F7174" },
  counter: { color: "#6F7174", fontSize: 11 },
  done: { gap: 8 },
  link: { color: "#F4F4F5", fontSize: 12, textDecorationLine: "underline" },
  quote: { backgroundColor: "#111111", borderColor: "#333333", borderWidth: 1, borderRadius: 12, padding: 12 },
  quoteBody: { color: "#D4D4D8", fontSize: 12, lineHeight: 18 },
  quoteBy: { color: "#8B8D90", fontSize: 11, marginTop: 6 },
});
