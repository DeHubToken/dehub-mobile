import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
/** Feedback submissions and the paginated, consent-approved public wall. */

import React, { useCallback, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";

import { useUser, useAuthState } from "../../context/AuthContext";
import { supabase } from "../../services/supabase";
import { withWalletHeader } from "../../libs/supabase-wallet-client";
import { toastError, toastSuccess } from "../../libs/toast";
import { KitButton, PageSection } from "../page/PageKit";
import Avatar from "../common/Avatar";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { getAccountSummariesByUsernames, type AccountSummary } from "../../services/user.service";
import { getAvatarUrl } from "../../libs/misc";

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

export default function FeedbackSection({ source }: { source?: 'converter' | 'migration' } = {}) {
  const { t } = useTranslation();
  const contextTitle = source === 'converter' ? t('converter.title') : source === 'migration' ? t('migrate.title') : '';
  const prefix = contextTitle ? `[${contextTitle}]\n` : '';
  const bodyLimit = MAX_LENGTH - prefix.length;
  const user = useUser();
  const { isSignedIn } = useAuthState();
  const walletAddress = user?.walletAddress || user?.address || null;

  const [body, setBody] = useSurfaceDraft("components/Stats/FeedbackSection.tsx:body", "");
  const [timeUsing, setTimeUsing] = useSurfaceDraft("components/Stats/FeedbackSection.tsx:timeUsing", "");
  const [allowPromo, setAllowPromo] = useState(false);
  const [allowName, setAllowName] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const feedback = useInfiniteQuery({
    queryKey: ['public-testimonials'],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase
        .from("public_testimonials")
        .select("id, body, time_using, username, created_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(pageParam, pageParam + 23);
      if (error) throw error;
      return (data ?? []) as ApprovedTestimonial[];
    },
    getNextPageParam: (lastPage, pages) => lastPage.length === 24 ? pages.length * 24 : undefined,
    staleTime: 60_000,
  });
  const approved = useMemo(() => feedback.data?.pages.flat() ?? [], [feedback.data]);
  const { showUserProfile } = useUserProfileSheet();

  // Faces for the wall: one batched lookup per hundred handles, not one per card.
  const usernamesKey = useMemo(
    () => [...new Set(approved.map((item) => item.username?.toLowerCase()).filter(Boolean) as string[])].sort().join(","),
    [approved],
  );
  const { data: accounts } = useQuery({
    queryKey: ["feedback-wall-accounts", usernamesKey],
    enabled: usernamesKey.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const names = usernamesKey.split(",");
      const chunks: string[][] = [];
      for (let i = 0; i < names.length; i += 100) chunks.push(names.slice(i, i + 100));
      const results = await Promise.all(chunks.map((chunk) => getAccountSummariesByUsernames(chunk).catch(() => [] as AccountSummary[])));
      const byName: Record<string, AccountSummary> = {};
      for (const account of results.flat()) {
        if (account?.username) byName[account.username.toLowerCase()] = account;
      }
      return byName;
    },
  });

  const trimmed = body.trim();
  const canSubmit =
    isSignedIn && !!walletAddress && trimmed.length >= MIN_LENGTH && trimmed.length <= bodyLimit && !submitting;

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
          body: prefix + trimmed,
          time_using: timeUsing.trim() || null,
          allow_promo: allowPromo,
          allow_name: allowPromo && allowName,
        }),
        walletAddress,
      );
      if (error) throw error;

      setSubmitted(true);
      setBody.complete(body, "");
      setTimeUsing.complete(timeUsing, "");
      toastSuccess(t("stats.feedback.toastSent", "Thanks — your feedback is with us"));
    } catch (err) {
      console.error("[Feedback] Submit error:", err);
      toastError(t("stats.feedback.toastFailed", "Could not send that, try again"));
    } finally {
      setSubmitting(false);
    }
  }, [allowName, allowPromo, canSubmit, t, timeUsing, trimmed, user?.username, walletAddress, setBody, setTimeUsing, body, prefix]);

  return (
    <>
      <PageSection title={t("stats.feedback.title", "Feedback")} style={styles.card}>
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
            {contextTitle ? <Text style={styles.intro}>{contextTitle}</Text> : null}
            <TextInput
              value={body}
              onChangeText={(value) => setBody(value.slice(0, bodyLimit))}
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
              <KitButton
                disabled={!canSubmit}
                onPress={handleSubmit}
                label={t(submitting ? 'stats.feedback.sending' : 'stats.feedback.submit')}
              />
              <Text style={styles.counter}>
                {!isSignedIn
                  ? t("stats.feedback.signedOut", "Sign in to leave feedback")
                  : `${trimmed.length}/${bodyLimit}`}
              </Text>
            </View>
          </>
        )}
      </PageSection>

        <PageSection
          title={t("stats.feedback.wallTitle", "What people say")}
          action={<Text style={styles.cardHint}>{t("stats.feedback.wallNote", "published with permission")}</Text>}
          style={styles.card}
        >
          <Text style={styles.intro} accessibilityLiveRegion="polite">
            {feedback.isPending ? t('common.loading') : null}
            {!feedback.isPending && !feedback.isError && approved.length === 0 ? t('common.noResults') : null}
            {feedback.isError ? t('common.failedToLoad') : null}
          </Text>
          {approved.map((item) => {
            const account = item.username ? accounts?.[item.username.toLowerCase()] : undefined;
            const handle = account?.username ?? item.username;
            const name = account?.displayName || handle || t("stats.feedback.anonymous", "A DeHub member");
            const sub = [handle ? `@${handle}` : "", item.time_using ?? ""].filter(Boolean).join(" · ");
            const target = account?.address || handle;
            return (
              <View key={item.id} style={styles.quote}>
                <Pressable
                  accessibilityRole={target ? "link" : undefined}
                  disabled={!target}
                  onPress={() => { if (target) showUserProfile(target, { source: "feedback" }); }}
                  style={({ pressed }) => [styles.quoteHead, pressed && { opacity: 0.7 }]}
                >
                  <Avatar
                    uri={account?.avatarImageUrl ? getAvatarUrl(account.avatarImageUrl, 32) : undefined}
                    name={handle ? name : "“"}
                    size={32}
                  />
                  <View style={styles.quoteWho}>
                    <Text style={styles.quoteName} numberOfLines={1}>{name}</Text>
                    {sub ? <Text style={styles.quoteBy} numberOfLines={1}>{sub}</Text> : null}
                  </View>
                </Pressable>
                <Text style={styles.quoteBody}>“{item.body}”</Text>
              </View>
            );
          })}
          {(feedback.isError || feedback.hasNextPage) ? (
            <KitButton variant="quiet" disabled={feedback.isFetching}
              label={t(feedback.isFetching ? 'common.loading' : feedback.isError ? 'common.retry' : 'search.loadMore')}
              onPress={() => { void (feedback.isError ? (approved.length ? feedback.fetchNextPage() : feedback.refetch()) : feedback.fetchNextPage()); }} />
          ) : null}
        </PageSection>
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
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
  quoteHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, alignSelf: "flex-start", maxWidth: "100%" },
  quoteWho: { flexShrink: 1 },
  quoteName: { color: "#F4F4F5", fontSize: 12, fontWeight: "600" },
  quoteBy: { color: "#8B8D90", fontSize: 11 },
});
