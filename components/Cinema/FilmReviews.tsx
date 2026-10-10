import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
/**
 * DeHub's own ratings and reviews for one title. Mirrors web's FilmReviews:
 * reads are open, writing needs a signed-in wallet, and while the
 * film-reviews function is not deployed the section renders nothing rather
 * than an empty list that reads as "nobody has reviewed this".
 */
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "../ui/Icon";
import { useUser } from "../../context/AuthContext";
import { toastError, toastSuccess } from "../../libs";
import {
  deleteFilmReview,
  fetchFilmReviews,
  saveFilmReview,
  FilmReviewsUnavailableError,
} from "../../services/film-reviews.service";
import type { JustWatchTitleDetail, ObjectType } from "../../services/justwatch.service";

const MAX_BODY = 4000;

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function Stars({ value, size = 14, onRate }: { value: number; size?: number; onRate?: (n: number) => void }) {
  const { t } = useTranslation();
  return (
    <View
      style={styles.stars}
      accessibilityRole={onRate ? undefined : "image"}
      accessibilityLabel={onRate ? undefined : t("cinema.starsOutOfFive", { value })}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const on = star <= Math.round(value);
        const glyph = <Icon name="Star" size={size} color={on ? "#FFFFFF" : "#3F3F46"} fill={on ? "#FFFFFF" : "transparent"} />;
        return onRate ? (
          <Pressable
            key={star}
            accessibilityRole="button"
            accessibilityLabel={t("cinema.rateOutOfFive", { value: star })}
            accessibilityState={{ selected: value === star }}
            onPress={() => onRate(star)}
            hitSlop={4}
            style={{ padding: 2 }}
          >
            {glyph}
          </Pressable>
        ) : (
          <View key={star}>{glyph}</View>
        );
      })}
    </View>
  );
}

export default function FilmReviews({
  justwatchId,
  objectType,
  title,
}: {
  justwatchId: string;
  objectType: ObjectType;
  title: JustWatchTitleDetail | null;
}) {
  const { t } = useTranslation();
  const user = useUser();
  const me = (user?.walletAddress || user?.address || "").toLowerCase() || null;
  const qc = useQueryClient();
  const queryKey = ["film-reviews", objectType, justwatchId] as const;

  const { data, isPending, error } = useQuery({
    queryKey,
    queryFn: () => fetchFilmReviews(justwatchId, objectType),
    staleTime: 60 * 1000,
    retry: (count, err) => !(err instanceof FilmReviewsUnavailableError) && count < 2,
  });
  const save = useMutation({
    mutationFn: (input: { rating: number; body: string }) =>
      saveFilmReview({
        justwatchId,
        objectType,
        rating: input.rating,
        body: input.body,
        title: title?.title ?? "",
        poster: title?.poster,
        year: title?.year,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const remove = useMutation({
    mutationFn: () => deleteFilmReview(justwatchId, objectType),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const mine = data?.reviews.find((r) => r.address.toLowerCase() === me) ?? null;
  const others = data?.reviews.filter((r) => r.address.toLowerCase() !== me) ?? [];
  const [rating, setRating] = useState(0);
  const [body, setBody] = useSurfaceDraft("components/Cinema/FilmReviews.tsx:body", "", justwatchId);

  useEffect(() => {
    setRating(mine?.rating ?? 0);
    setBody.initialize(mine?.body ?? "");
  }, [mine?.id, mine?.rating, mine?.body, justwatchId, setBody]);

  if (error instanceof FilmReviewsUnavailableError) return null;

  const summary = data?.summary;

  const errorText = (e: unknown, fallbackKey: string) =>
    e instanceof Error && e.message !== "SIGN_IN_REQUIRED" ? e.message : t(fallbackKey);

  const submit = async () => {
    if (!title) return;
    try {
      await save.mutateAsync({ rating, body: body.trim() });
      toastSuccess(mine ? t("cinema.reviewUpdated") : t("cinema.reviewPosted"));
    } catch (e) {
      toastError(errorText(e, "cinema.reviewSaveFailed"));
    }
  };

  const discard = async () => {
    try {
      await remove.mutateAsync();
      setRating(0);
      setBody.complete(body, "");
      toastSuccess(t("cinema.reviewRemoved"));
    } catch (e) {
      toastError(errorText(e, "cinema.reviewRemoveFailed"));
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={styles.heading} accessibilityRole="header">
          {t("cinema.ratingsAndReviews")}
        </Text>
        {summary?.count ? (
          <View style={styles.summary}>
            <Stars value={summary.average ?? 0} size={12} />
            <Text style={styles.small}>{t("cinema.reviewSummary", { average: summary.average, count: summary.count })}</Text>
          </View>
        ) : null}
      </View>

      {isPending && (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color="#71717A" />
          <Text style={styles.small}>{t("cinema.loadingReviews")}</Text>
        </View>
      )}

      {me ? (
        <View style={styles.composer}>
          <View style={styles.rateRow}>
            <Text style={styles.muted}>{mine ? t("cinema.yourRating") : t("cinema.rateIt")}</Text>
            <Stars value={rating} size={24} onRate={setRating} />
          </View>
          {rating > 0 && (
            <>
              <TextInput
                value={body}
                onChangeText={(v) => setBody(v.slice(0, MAX_BODY))}
                placeholder={t("cinema.reviewPlaceholder")}
                placeholderTextColor="#52525B"
                accessibilityLabel={t("cinema.yourReview")}
                multiline
                style={styles.input}
              />
              <View style={styles.actions}>
                <Text style={styles.small}>
                  {body.length}/{MAX_BODY}
                </Text>
                <View style={styles.actionButtons}>
                  {mine && (
                    <Pressable
                      accessibilityRole="button"
                      onPress={discard}
                      disabled={remove.isPending}
                      style={[styles.ghostBtn, remove.isPending && { opacity: 0.5 }]}
                    >
                      <Icon name="Trash2" size={14} color="#A1A1AA" />
                      <Text style={styles.muted}>{t("cinema.remove")}</Text>
                    </Pressable>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    onPress={submit}
                    disabled={save.isPending || rating < 1}
                    style={[styles.primaryBtn, (save.isPending || rating < 1) && { opacity: 0.4 }]}
                  >
                    <Text style={styles.primaryText}>
                      {save.isPending ? t("cinema.saving") : mine ? t("cinema.update") : t("cinema.postReview")}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </>
          )}
        </View>
      ) : (
        <Text style={[styles.muted, { marginTop: 12 }]}>{t("cinema.signInToReview")}</Text>
      )}

      {others.map((review) => (
        <View key={review.id} style={styles.review}>
          <View style={styles.reviewHead}>
            <Text style={styles.address}>{shortAddress(review.address)}</Text>
            <Stars value={review.rating} size={12} />
          </View>
          {!!review.body && <Text style={styles.reviewBody}>{review.body}</Text>}
        </View>
      ))}

      {!isPending && !summary?.count && me && <Text style={[styles.small, { marginTop: 12 }]}>{t("cinema.beFirst")}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 28, paddingTop: 20, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.10)" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  heading: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  summary: { flexDirection: "row", alignItems: "center", gap: 6 },
  stars: { flexDirection: "row", alignItems: "center", gap: 2 },
  small: { color: "#71717A", fontSize: 12 },
  muted: { color: "#A1A1AA", fontSize: 14 },
  loading: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  composer: { marginTop: 14, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", padding: 14 },
  rateRow: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  input: {
    marginTop: 12,
    minHeight: 80,
    textAlignVertical: "top",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 12,
    color: "#FFFFFF",
    fontSize: 14,
  },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  actionButtons: { flexDirection: "row", alignItems: "center", gap: 8 },
  ghostBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8 },
  primaryBtn: { borderRadius: 10, backgroundColor: "#FFFFFF", paddingHorizontal: 16, paddingVertical: 8 },
  primaryText: { color: "#000000", fontSize: 14, fontWeight: "600" },
  review: { marginTop: 16 },
  reviewHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  address: { color: "#71717A", fontSize: 12, fontFamily: "monospace" },
  reviewBody: { color: "#D4D4D8", fontSize: 14, lineHeight: 21, marginTop: 6 },
});
