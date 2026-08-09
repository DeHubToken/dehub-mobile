/**
 * FeatureRequestsScreen
 * =====================
 * Native port of the web FeaturesPage (/features). Same Supabase tables and the
 * same vote semantics — see hooks/useFeatureRequests.ts.
 *
 * Scope vs web: browse, search, filter, sort, vote, submit and comment threads.
 * Comments expand inline inside the card exactly as on web (the comment button
 * toggles them, and the query is gated on the toggle so collapsed cards fetch
 * nothing). Media attachments on submit and author edit/delete are not ported —
 * they need the upload pipeline.
 */
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ScrollView,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import Avatar from "../components/common/Avatar";
import { runWithPermissions } from "../libs/permissions.util";
import { theme } from "../theme";
import { getAvatarUrl } from "../libs/misc";
import { formatCompactNumber } from "../libs";
import { useUser, useAuthState } from "../context/AuthContext";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import { ScreenNames } from "../navigation/ScreenNames";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  useFeatureRequests,
  useShippedFeatures,
  useTotalFeatureCount,
  useUserVotes,
  useVoteFeatureRequest,
  useSubmitFeatureRequest,
  useFeatureRequestComments,
  useSubmitComment,
  useDeleteComment,
  CATEGORY_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
  type FeatureCategory,
  type FeatureRequest,
  type FeatureSort,
} from "../hooks/useFeatureRequests";

const COMMENT_MAX = 1000;
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const SORTS: { key: FeatureSort; labelKey: string }[] = [
  { key: "most_voted", labelKey: "features.mostVoted" },
  { key: "newest", labelKey: "features.newest" },
];

const CATEGORY_I18N: Record<FeatureCategory, string> = {
  ui_ux: "features.uiUx",
  performance: "features.performance",
  new_feature: "features.newFeature",
  bug_fix: "features.bugFix",
  integration: "features.integration",
  other: "features.other",
};

const STATUS_I18N: Record<string, string> = {
  open: "features.statusOpen",
  under_review: "features.statusUnderReview",
  planned: "features.statusPlanned",
  in_progress: "features.statusInProgress",
  completed: "features.statusCompleted",
  shipped: "features.shipped",
  declined: "features.statusDeclined",
};

const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS) as FeatureCategory[];

const TITLE_MAX = 100;
const DESC_MAX = 1000;

function timeAgo(iso: string, t: TFunction): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t("features.justNow");
  const m = Math.floor(s / 60);
  if (m < 60) return t("features.minutesAgo", { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("features.hoursAgo", { count: h });
  const d = Math.floor(h / 24);
  if (d < 30) return t("features.daysAgo", { count: d });
  return t("features.monthsAgo", { count: Math.floor(d / 30) });
}

// ── Card ────────────────────────────────────────────────────────────────────

/**
 * Inline comment thread. Mounted only when the card is expanded, so the query
 * stays gated exactly like web's `useFeatureRequestComments(showComments ? id : null)`.
 */
const CommentsSection: React.FC<{ featureId: string; isAuthed: boolean }> = ({
  featureId,
  isAuthed,
}) => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const user = useUser() as any;
  const { showUserProfile } = useUserProfileSheet();
  const myWallet: string = (user?.walletAddress || user?.address || "").toLowerCase();

  const { data: comments = [], isLoading } = useFeatureRequestComments(featureId);
  const submitComment = useSubmitComment();
  const deleteComment = useDeleteComment();
  const [draft, setDraft] = useState("");

  const send = useCallback(() => {
    const content = draft.trim();
    if (!content || submitComment.isPending) return;
    if (!isAuthed) {
      navigation.navigate(ScreenNames.SignIn);
      return;
    }
    submitComment.mutate(
      { featureRequestId: featureId, content },
      { onSuccess: () => setDraft("") },
    );
  }, [draft, submitComment, isAuthed, navigation, featureId]);

  const confirmDelete = useCallback(
    (commentId: string) => {
      Alert.alert(t("features.deleteCommentTitle"), t("features.deleteCommentDescription"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => deleteComment.mutate({ commentId, featureRequestId: featureId }),
        },
      ]);
    },
    [deleteComment, featureId, t],
  );

  return (
    <View style={styles.commentsWrap}>
      {isLoading ? (
        <ActivityIndicator color="#FFFFFF" style={{ marginVertical: 14 }} />
      ) : comments.length === 0 ? (
        <Text style={styles.noComments}>{t("features.noComments")}</Text>
      ) : (
        comments.map((c) => {
          const name = c.username || shortAddr(c.wallet_address);
          const isMine = !!myWallet && c.wallet_address?.toLowerCase() === myWallet;
          return (
            <View key={c.id} style={styles.commentRow}>
              <Pressable onPress={() => showUserProfile(c.username || c.wallet_address)}>
                <Avatar uri={getAvatarUrl(c.avatar)} size={26} name={name} />
              </Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.commentHead}>
                  <Text style={styles.commentAuthor} numberOfLines={1}>
                    @{name}
                  </Text>
                  <Text style={styles.commentTime}>{timeAgo(c.created_at, t)}</Text>
                  {isMine && (
                    <Pressable
                      onPress={() => confirmDelete(c.id)}
                      hitSlop={16}
                      style={{ marginLeft: "auto" }}
                      accessibilityRole="button"
                      accessibilityLabel={t("common.delete")}
                    >
                      <Icon name="Trash2" size={12} color="#71717A" />
                    </Pressable>
                  )}
                </View>
                <Text style={styles.commentBody}>{c.content}</Text>
              </View>
            </View>
          );
        })
      )}

      {isAuthed ? (
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={(v) => setDraft(v.slice(0, COMMENT_MAX))}
            placeholder={t("features.addComment")}
            placeholderTextColor="#8B8D90"
            style={styles.composerInput}
            multiline
          />
          <Pressable
            onPress={send}
            disabled={!draft.trim() || submitComment.isPending}
            accessibilityRole="button"
            accessibilityLabel="Send comment"
            style={[
              styles.sendBtn,
              (!draft.trim() || submitComment.isPending) && styles.sendBtnDisabled,
            ]}
          >
            {submitComment.isPending ? (
              <ActivityIndicator size="small" color="#000000" />
            ) : (
              <Icon name="ArrowUp" size={15} color="#000000" />
            )}
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => navigation.navigate(ScreenNames.SignIn)}
          style={styles.signInBar}
        >
          <Text style={styles.signInText}>{t("features.signInToComment")}</Text>
        </Pressable>
      )}
    </View>
  );
};

const FeatureCard: React.FC<{
  feature: FeatureRequest;
  myVote: number | undefined;
  onVote: (voteType: 1 | -1) => void;
  votable: boolean;
  isAuthed: boolean;
}> = ({ feature, myVote, onVote, votable, isAuthed }) => {
  const { t } = useTranslation();
  const author =
    feature.author_username ||
    `${feature.author_wallet_address.slice(0, 6)}…${feature.author_wallet_address.slice(-4)}`;
  // The shared STATUS_COLORS map ships violet for in_progress; keep badges monochrome here.
  const statusColor =
    feature.status === "in_progress" ? "#D4D4D8" : STATUS_COLORS[feature.status] ?? "#A1A1AA";
  // Web toggles comments per card with a local `showComments` flag.
  const [showComments, setShowComments] = useState(false);

  return (
    <View style={styles.card}>
      <View style={styles.cardBody}>
        {/* Vote column */}
        <View style={styles.voteCol}>
          <Pressable
            onPress={() => votable && onVote(1)}
            hitSlop={10}
            style={[styles.voteBtn, myVote === 1 && styles.voteBtnUpActive]}
            disabled={!votable}
            accessibilityRole="button"
            accessibilityLabel="Upvote"
            accessibilityState={{ selected: myVote === 1 }}
          >
            <Icon name="ChevronUp" size={18} color={myVote === 1 ? "#22C55E" : "#A1A1AA"} />
          </Pressable>
          <Text style={styles.voteCount}>{formatCompactNumber(feature.vote_count ?? 0)}</Text>
          <Pressable
            onPress={() => votable && onVote(-1)}
            hitSlop={10}
            style={[styles.voteBtn, myVote === -1 && styles.voteBtnDownActive]}
            disabled={!votable}
            accessibilityRole="button"
            accessibilityLabel="Downvote"
            accessibilityState={{ selected: myVote === -1 }}
          >
            <Icon name="ChevronDown" size={18} color={myVote === -1 ? "#EF4444" : "#A1A1AA"} />
          </Pressable>
        </View>

        {/* Content */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { borderColor: `${statusColor}55` }]}>
              <View style={[styles.dot, { backgroundColor: statusColor }]} />
              <Text style={[styles.badgeText, { color: statusColor }]}>
                {STATUS_I18N[feature.status] ? t(STATUS_I18N[feature.status]) : (STATUS_LABELS[feature.status] ?? feature.status)}
              </Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {CATEGORY_I18N[feature.category] ? t(CATEGORY_I18N[feature.category]) : (CATEGORY_LABELS[feature.category] ?? feature.category)}
              </Text>
            </View>
          </View>

          <Text style={styles.cardTitle}>{feature.title}</Text>
          {!!feature.description && (
            <Text style={styles.cardDesc} numberOfLines={4}>
              {feature.description}
            </Text>
          )}
          {!!feature.image_url && (
            <Image
              source={{ uri: feature.image_url }}
              style={styles.cardImage}
              contentFit="cover"
              transition={200}
            />
          )}

          <View style={styles.authorRow}>
            <Avatar uri={getAvatarUrl(feature.author_avatar)} size={20} name={author} />
            <Text style={styles.authorName} numberOfLines={1}>
              @{author}
            </Text>
            <Text style={styles.time}>{timeAgo(feature.created_at, t)}</Text>
            <Pressable
              onPress={() => setShowComments((s) => !s)}
              hitSlop={14}
              style={[styles.metaItem, showComments && styles.metaItemActive]}
            >
              <Icon
                name="MessageCircle"
                size={12}
                color={showComments ? "#FFFFFF" : "#71717A"}
              />
              <Text style={[styles.metaText, showComments && { color: "#FFFFFF" }]}>
                {formatCompactNumber(feature.comment_count ?? 0)}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {showComments && <CommentsSection featureId={feature.id} isAuthed={isAuthed} />}
    </View>
  );
};

// ── Submit sheet ────────────────────────────────────────────────────────────

const SubmitSheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  onSubmit: (v: {
    title: string;
    description: string;
    category: FeatureCategory;
    mediaUri?: string | null;
  }) => void;
  submitting: boolean;
}> = ({ visible, onClose, onSubmit, submitting }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<FeatureCategory>("new_feature");
  const [mediaUri, setMediaUri] = useState<string | null>(null);

  const valid = title.trim().length > 0 && description.trim().length > 0;

  const pickMedia = useCallback(async () => {
    await runWithPermissions(["photos"], async () => {
      const mediaTypesCompat: any = (ImagePicker as any).MediaType
        ? [(ImagePicker as any).MediaType.image]
        : ImagePicker.MediaTypeOptions.Images;
      const pick = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: mediaTypesCompat,
        quality: 0.85,
      });
      if (!pick.canceled && pick.assets?.[0]?.uri) setMediaUri(pick.assets[0].uri);
    });
  }, []);

  const reset = useCallback(() => {
    setTitle("");
    setDescription("");
    setCategory("new_feature");
    setMediaUri(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.modalBackdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ width: "100%" }}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t("features.submitDrawerTitle")}</Text>
              <Pressable
                onPress={handleClose}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Icon name="X" size={20} color="#A1A1AA" />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>{t("features.titleLabel")}</Text>
              <TextInput
                value={title}
                onChangeText={(v) => setTitle(v.slice(0, TITLE_MAX))}
                placeholder={t("features.titlePlaceholder")}
                placeholderTextColor="#8B8D90"
                style={styles.input}
              />
              <Text style={styles.counter}>
                {title.length}/{TITLE_MAX}
              </Text>

              <Text style={styles.fieldLabel}>{t("features.descriptionLabel")}</Text>
              <TextInput
                value={description}
                onChangeText={(v) => setDescription(v.slice(0, DESC_MAX))}
                placeholder={t("features.descriptionPlaceholder")}
                placeholderTextColor="#8B8D90"
                multiline
                style={[styles.input, styles.textarea]}
              />
              <Text style={styles.counter}>
                {description.length}/{DESC_MAX}
              </Text>

              <Text style={styles.fieldLabel}>{t("features.categoryLabel")}</Text>
              <View style={styles.catWrap}>
                {CATEGORY_KEYS.map((key) => {
                  const active = category === key;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => setCategory(key)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {t(CATEGORY_I18N[key])}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>{t("features.attachmentOptional")}</Text>
              {mediaUri ? (
                <View style={styles.mediaPreview}>
                  <Image source={{ uri: mediaUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  <Pressable
                    style={styles.mediaRemove}
                    onPress={() => setMediaUri(null)}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="Remove attachment"
                  >
                    <Icon name="X" size={13} color="#FFFFFF" />
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.mediaAdd} onPress={pickMedia}>
                  <Icon name="ImagePlus" size={18} color="#A1A1AA" />
                  <Text style={styles.mediaAddText}>{t("features.addScreenshot")}</Text>
                </Pressable>
              )}
            </ScrollView>

            <Pressable
              onPress={() => {
                if (!valid || submitting) return;
                onSubmit({ title, description, category, mediaUri });
                reset();
              }}
              style={[styles.submitBtn, (!valid || submitting) && styles.submitBtnDisabled]}
              disabled={!valid || submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#000000" />
              ) : (
                <Text style={styles.submitBtnText}>{t("features.submitRequest")}</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

// ── Screen ──────────────────────────────────────────────────────────────────

export default function FeatureRequestsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { isSignedIn, needsUsername } = useAuthState();
  const isAuthed = isSignedIn && !needsUsername;

  const [view, setView] = useState<"open" | "shipped">("open");
  const [sort, setSort] = useState<FeatureSort>("most_voted");
  const [category, setCategory] = useState<FeatureCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  // 300ms to match web's useDebouncedValue(searchInput, 300) on FeaturesPage.
  React.useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const {
    data,
    isLoading,
    isError,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useFeatureRequests(sort, category, debouncedSearch);

  const shipped = useShippedFeatures();
  const { data: totalCount } = useTotalFeatureCount();
  const { data: votes } = useUserVotes();
  const voteMutation = useVoteFeatureRequest();
  const submitMutation = useSubmitFeatureRequest();

  const openItems = useMemo(() => data?.pages.flat() ?? [], [data]);
  const items = view === "shipped" ? shipped.data ?? [] : openItems;

  const handleVote = useCallback(
    (feature: FeatureRequest, voteType: 1 | -1) => {
      if (!isAuthed) {
        navigation.navigate(ScreenNames.SignIn);
        return;
      }
      voteMutation.mutate({
        featureRequestId: feature.id,
        voteType,
        currentVote: votes?.[feature.id],
      });
    },
    [isAuthed, navigation, voteMutation, votes],
  );

  const renderItem = useCallback(
    ({ item }: { item: FeatureRequest }) => (
      <FeatureCard
        feature={item}
        myVote={votes?.[item.id]}
        onVote={(v) => handleVote(item, v)}
        votable={view === "open"}
        isAuthed={isAuthed}
      />
    ),
    [votes, handleVote, view, isAuthed],
  );

  const keyExtractor = useCallback((f: FeatureRequest) => f.id, []);

  const loading = view === "shipped" ? shipped.isLoading : isLoading;
  const refreshing = view === "shipped" ? shipped.isRefetching : isRefetching;
  const onRefresh = view === "shipped" ? shipped.refetch : refetch;

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={t("features.title")}
        subtitle={
          typeof totalCount === "number"
            ? t("features.submittedSubtitle", { count: formatCompactNumber(totalCount) })
            : t("features.shapeNext")
        }
        rightContent={
          <Pressable
            onPress={() => (isAuthed ? setSheetOpen(true) : navigation.navigate(ScreenNames.SignIn))}
            hitSlop={10}
            style={styles.addBtn}
            accessibilityRole="button"
            accessibilityLabel={t("features.submitDrawerTitle")}
          >
            <Icon name="Plus" size={20} color="#000000" />
          </Pressable>
        }
      />

      {/* Open / Shipped */}
      <View style={styles.segment}>
        {(["open", "shipped"] as const).map((v) => (
          <Pressable
            key={v}
            onPress={() => setView(v)}
            style={[styles.segmentBtn, view === v && styles.segmentBtnActive]}
          >
            <Text style={[styles.segmentText, view === v && styles.segmentTextActive]}>
              {v === "open" ? t("features.statusOpen") : t("features.shipped")}
            </Text>
          </Pressable>
        ))}
      </View>

      {view === "open" && (
        <>
          <View style={styles.searchWrap}>
            <Icon name="Search" size={15} color="#71717A" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t("features.searchPlaceholder")}
              placeholderTextColor="#8B8D90"
              style={styles.searchInput}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Icon name="X" size={15} color="#71717A" />
              </Pressable>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {SORTS.map((s) => (
              <Pressable
                key={s.key}
                onPress={() => setSort(s.key)}
                style={[styles.chip, sort === s.key && styles.chipActive]}
              >
                <Text style={[styles.chipText, sort === s.key && styles.chipTextActive]}>
                  {t(s.labelKey)}
                </Text>
              </Pressable>
            ))}
            <View style={styles.chipDivider} />
            <Pressable
              onPress={() => setCategory("all")}
              style={[styles.chip, category === "all" && styles.chipActive]}
            >
              <Text style={[styles.chipText, category === "all" && styles.chipTextActive]}>
                {t("features.all")}
              </Text>
            </Pressable>
            {CATEGORY_KEYS.map((key) => (
              <Pressable
                key={key}
                onPress={() => setCategory(key)}
                style={[styles.chip, category === key && styles.chipActive]}
              >
                <Text style={[styles.chipText, category === key && styles.chipTextActive]}>
                  {t(CATEGORY_I18N[key])}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      ) : isError && view === "open" ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{t("features.loadFailed")}</Text>
          <Pressable onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t("common.retry")}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: insets.bottom + 24,
            paddingTop: 4,
            gap: 12,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.accent}
            />
          }
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (view === "open" && hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator color="#FFFFFF" style={{ marginVertical: 16 }} />
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Icon name="Lightbulb" size={44} color="#3F3F46" />
              <Text style={styles.emptyText}>
                {view === "shipped"
                  ? t("features.noShippedYet")
                  : debouncedSearch
                    ? t("features.noSearchResults")
                    : t("features.noRequestsYet")}
              </Text>
            </View>
          }
        />
      )}

      <SubmitSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        submitting={submitMutation.isPending}
        onSubmit={(v) => {
          submitMutation.mutate(v, { onSuccess: () => setSheetOpen(false) });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  segment: {
    flexDirection: "row",
    gap: 4,
    marginHorizontal: 12,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 999,
    padding: 3,
  },
  segmentBtn: { flex: 1, paddingVertical: 7, borderRadius: 999, alignItems: "center" },
  segmentBtnActive: { backgroundColor: "rgba(255,255,255,0.15)" },
  segmentText: { color: "#A1A1AA", fontSize: 13, fontWeight: "600" },
  segmentTextActive: { color: "#FFFFFF" },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 14, padding: 0 },

  chipRow: { gap: 8, paddingHorizontal: 12, paddingVertical: 10, alignItems: "center" },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipActive: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
  chipText: { color: "#A1A1AA", fontSize: 12.5, fontWeight: "600" },
  chipTextActive: { color: "#000000" },
  chipDivider: {
    width: 1,
    height: 18,
    backgroundColor: "rgba(255,255,255,0.14)",
    marginHorizontal: 2,
  },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 64 },
  emptyText: { color: "#71717A", fontSize: 13, marginTop: 12, textAlign: "center" },
  retryBtn: {
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  retryText: { color: "#FAFAFA", fontSize: 13, fontWeight: "600" },

  card: {
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 12,
  },
  cardBody: { flexDirection: "row", gap: 12 },
  voteCol: { alignItems: "center", width: 38, paddingTop: 2 },
  voteBtn: {
    width: 30,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  voteBtnUpActive: { backgroundColor: "rgba(52,211,153,0.15)" },
  voteBtnDownActive: { backgroundColor: "rgba(248,113,113,0.15)" },
  voteCount: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", paddingVertical: 4 },

  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 6 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  dot: { width: 5, height: 5, borderRadius: 999 },
  badgeText: { color: "#A1A1AA", fontSize: 10.5, fontWeight: "600" },

  cardTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "600", lineHeight: 20 },
  cardDesc: { color: "#A1A1AA", fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  cardImage: {
    width: "100%",
    height: 150,
    borderRadius: 10,
    marginTop: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
  },

  mediaPreview: {
    width: "100%",
    height: 140,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
    marginBottom: 8,
  },
  mediaRemove: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.70)",
    alignItems: "center",
    justifyContent: "center",
  },
  mediaAdd: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.20)",
    marginBottom: 8,
  },
  mediaAddText: { color: "#A1A1AA", fontSize: 13, fontWeight: "600" },

  authorRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  authorName: { color: "#D4D4D8", fontSize: 11.5, flexShrink: 1 },
  time: { color: "#A1A1AA", fontSize: 12 },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginLeft: "auto",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  metaItemActive: { backgroundColor: "rgba(255,255,255,0.12)" },
  metaText: { color: "#71717A", fontSize: 11 },

  commentsWrap: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  noComments: { color: "#A1A1AA", fontSize: 12, paddingVertical: 6 },
  commentRow: { flexDirection: "row", gap: 9, paddingVertical: 7 },
  commentHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  commentAuthor: { color: "#E4E4E7", fontSize: 12, fontWeight: "600", flexShrink: 1 },
  commentTime: { color: "#A1A1AA", fontSize: 12 },
  commentBody: { color: "#D4D4D8", fontSize: 12.5, lineHeight: 18, marginTop: 2 },

  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 10 },
  composerInput: {
    flex: 1,
    maxHeight: 100,
    color: "#FFFFFF",
    fontSize: 13.5,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.35 },
  signInBar: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    paddingVertical: 10,
    alignItems: "center",
  },
  signInText: { color: "#A1A1AA", fontSize: 13, fontWeight: "600" },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#0C0C0E",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    paddingHorizontal: 18,
    paddingTop: 16,
    maxHeight: "88%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sheetTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  fieldLabel: { color: "#A1A1AA", fontSize: 12, fontWeight: "600", marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#FFFFFF",
    fontSize: 14,
  },
  textarea: { minHeight: 110, textAlignVertical: "top" },
  counter: { color: "#A1A1AA", fontSize: 12, textAlign: "right", marginTop: 4 },
  catWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },

  submitBtn: {
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    paddingVertical: 13,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: "#000000", fontSize: 14.5, fontWeight: "700" },
});
