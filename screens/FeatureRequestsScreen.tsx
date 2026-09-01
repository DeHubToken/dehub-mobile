/**
 * FeatureRequestsScreen
 * =====================
 * Native port of the web FeaturesPage (/app/features), laid out to match what
 * that page renders at a 375pt viewport: one dark bento holding the title,
 * search, the Requests / Shipping / Shipped tabs, the category pills and the
 * sort tabs — then a list of cards below it.
 *
 * Sizes here are the measured web values, not eyeballed: bento 16pt padding /
 * 16pt radius, search 40pt tall, tab strip 48pt with 40pt tabs, chips 32pt tall
 * at 12pt horizontal padding, cards 12pt padding on a rgba(255,255,255,0.03)
 * fill with a rgba(255,255,255,0.12) hairline.
 *
 * Layout rule this screen has to keep: **no label may be allowed to shrink.**
 * Under Fabric a `<Text>` that flex-shrinks below its intrinsic width renders as
 * a bare `…` on Android, which is what turned the tab and chip labels into
 * ellipses. Every label below is `flexShrink: 0`, every horizontal strip is
 * `flexGrow: 0` so it cannot eat the list's vertical space, and the tab type is
 * sized against measured text widths rather than guessed at — three tabs with
 * icons and count badges fit from 360pt up, and the icons drop below that.
 *
 * Not ported from web: the per-card translate control, and the Bookmark / Tips /
 * Post-info actions in the shared post ActionBar — none of them have a
 * feature-request row behind them, so they would ship as dead buttons.
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
  Share,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Icon from "../components/ui/Icon";
import Avatar from "../components/common/Avatar";
import { runWithPermissions } from "../libs/permissions.util";
import { toastWarning } from "../libs/toast";
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
  useInProgressFeatures,
  useFeatureCounts,
  useUserVotes,
  useVoteFeatureRequest,
  useSubmitFeatureRequest,
  useEditFeatureRequest,
  useDeleteFeatureRequest,
  useFeatureRequestComments,
  useSubmitComment,
  useDeleteComment,
  featureAttachments,
  isVideoAttachment,
  MAX_FEATURE_ATTACHMENTS,
  MAX_FEATURE_ATTACHMENT_BYTES,
  CATEGORY_LABELS,
  STATUS_LABELS,
  type FeatureCategory,
  type FeatureRequest,
  type FeatureSort,
  type FeatureStatus,
} from "../hooks/useFeatureRequests";

const COMMENT_MAX = 500;
const TITLE_MAX = 100;
const DESC_MAX = 1000;
const DEVICE_MAX = 300;

/** Web's header lightbulb, served from the same place the site serves it. */
const HEADER_ICON_URI = "https://dehub.io/theme-icons/system/features.webp";

type PageTab = "requests" | "shipping" | "shipped";

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

const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS) as FeatureCategory[];

/**
 * Rows predate the current category set, so a stored value can be one this
 * build has never heard of. Fall back to `other` rather than handing `t()` an
 * undefined key.
 */
function categoryLabel(t: TFunction, category: FeatureCategory): string {
  const key = CATEGORY_I18N[category] ?? CATEGORY_I18N.other;
  return t(key, CATEGORY_LABELS[category] ?? CATEGORY_LABELS.other);
}

const STATUS_I18N: Record<string, string> = {
  open: "features.statusOpen",
  under_review: "features.statusUnderReview",
  planned: "features.statusPlanned",
  in_progress: "features.statusInProgress",
  completed: "features.statusCompleted",
  shipped: "features.shipped",
  declined: "features.statusDeclined",
};

/**
 * Statuses worth a badge on an open request. `open` is the default and adds
 * nothing; shipped and completed live on their own tab. Same set, same hues as
 * web's STATUS_BADGE_STYLES.
 */
const STATUS_BADGE: Partial<Record<FeatureStatus, { fg: string; bg: string; bd: string }>> = {
  under_review: { fg: "#D4D4D8", bg: "rgba(255,255,255,0.15)", bd: "rgba(255,255,255,0.25)" },
  planned: { fg: "#D4D4D8", bg: "rgba(255,255,255,0.15)", bd: "rgba(255,255,255,0.25)" },
  in_progress: { fg: "#D4D4D8", bg: "rgba(255,255,255,0.15)", bd: "rgba(255,255,255,0.25)" },
  declined: { fg: "#F4F4F5", bg: "rgba(255,255,255,0.15)", bd: "rgba(255,255,255,0.25)" },
};

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

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// ── Attachments ─────────────────────────────────────────────────────────────

/**
 * A request's attachments: one fills the card, several tile two-up so a
 * multi-screenshot bug report stays scannable. Mirrors web's FeatureAttachments.
 */
const Attachments: React.FC<{ feature: FeatureRequest }> = ({ feature }) => {
  const urls = featureAttachments(feature);
  const { width } = useWindowDimensions();
  if (urls.length === 0) return null;

  // Card is screen − 16 (page gutters) − 24 (card padding); two-up splits it.
  const tile = (width - 40 - 6) / 2;

  if (urls.length === 1) {
    return (
      <View style={styles.mediaSingle}>
        <Image
          source={{ uri: urls[0] }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          transition={200}
        />
        {isVideoAttachment(urls[0]) && (
          <View style={styles.playBadge}>
            <Icon name="Play" size={16} color="#FFFFFF" />
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.mediaGrid}>
      {urls.map((url) => (
        <View key={url} style={[styles.mediaTile, { width: tile, height: tile * 0.5625 }]}>
          <Image
            source={{ uri: url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
          />
          {isVideoAttachment(url) && (
            <View style={styles.playBadge}>
              <Icon name="Play" size={14} color="#FFFFFF" />
            </View>
          )}
        </View>
      ))}
    </View>
  );
};

// ── Comments ────────────────────────────────────────────────────────────────

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
        { text: t("common.cancel", "Cancel"), style: "cancel" },
        {
          text: t("common.delete", "Delete"),
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
        <ActivityIndicator color="#71717A" style={{ paddingVertical: 12 }} />
      ) : comments.length === 0 ? (
        <Text style={styles.noComments}>{t("features.noComments")}</Text>
      ) : (
        comments.map((c) => {
          const name = c.username ? `@${c.username}` : shortAddr(c.wallet_address);
          const isOwn = !!myWallet && myWallet === c.wallet_address.toLowerCase();
          return (
            <View key={c.id} style={styles.commentRow}>
              <Pressable
                onPress={() => showUserProfile?.(c.username || c.wallet_address)}
                style={{ flexShrink: 0 }}
              >
                <Avatar uri={getAvatarUrl(c.avatar)} size={24} name={c.username || c.wallet_address} />
              </Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.commentHead}>
                  <Text style={styles.commentAuthor} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={styles.commentTime}>{timeAgo(c.created_at, t)}</Text>
                  {isOwn && (
                    <Pressable
                      onPress={() => confirmDelete(c.id)}
                      hitSlop={10}
                      style={{ marginLeft: "auto" }}
                      accessibilityRole="button"
                      accessibilityLabel="Delete comment"
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
            placeholderTextColor="#52525B"
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
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Icon name="Send" size={14} color="#FFFFFF" />
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

// ── Card ────────────────────────────────────────────────────────────────────

const ActionButton: React.FC<{
  icon: React.ComponentProps<typeof Icon>["name"];
  label: string;
  count?: number;
  active?: boolean;
  onPress: () => void;
}> = ({ icon, label, count, active, onPress }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={count === undefined ? label : `${label}, ${count}`}
    accessibilityState={active === undefined ? undefined : { selected: active }}
    // Vertical slop takes the 18pt icon to a 44pt tap height without changing
    // layout; horizontal stays small so neighbouring buttons don't steal taps.
    hitSlop={{ top: 13, bottom: 13, left: 6, right: 6 }}
    style={styles.actionBtn}
  >
    <Icon
      name={icon}
      size={18}
      color={active ? "#FFFFFF" : "#A1A1AA"}
      fill={active ? "#FFFFFF" : undefined}
      strokeWidth={active ? 2.4 : 1.8}
    />
    {count !== undefined && (
      <Text style={[styles.actionCount, active && { color: "#FFFFFF" }]}>
        {formatCompactNumber(count)}
      </Text>
    )}
  </Pressable>
);

const FeatureCard: React.FC<{
  feature: FeatureRequest;
  myVote: number | undefined;
  onVote: (voteType: 1 | -1) => void;
  isAuthed: boolean;
}> = ({ feature, myVote, onVote, isAuthed }) => {
  const { t } = useTranslation();
  const user = useUser() as any;
  const { showUserProfile } = useUserProfileSheet();
  const [showComments, setShowComments] = useState(false);
  const [editing, setEditing] = useState(false);

  const editMutation = useEditFeatureRequest();
  const deleteMutation = useDeleteFeatureRequest();

  const myWallet: string = (user?.walletAddress || user?.address || "").toLowerCase();
  const isAuthor = !!myWallet && myWallet === feature.author_wallet_address.toLowerCase();

  const displayName = feature.author_username || feature.author_wallet_address.slice(0, 6);
  const handle = feature.author_username
    ? `@${feature.author_username}`
    : shortAddr(feature.author_wallet_address);

  const [editTitle, setEditTitle] = useState(feature.title);
  const [editDescription, setEditDescription] = useState(feature.description);
  const [editCategory, setEditCategory] = useState<FeatureCategory>(feature.category);

  const badge = STATUS_BADGE[feature.status];

  const openMenu = useCallback(() => {
    Alert.alert(feature.title, undefined, [
      {
        text: t("features.edit", "Edit"),
        onPress: () => {
          setEditTitle(feature.title);
          setEditDescription(feature.description);
          setEditCategory(feature.category);
          setEditing(true);
        },
      },
      {
        text: t("common.delete", "Delete"),
        style: "destructive",
        onPress: () =>
          Alert.alert(
            t("features.deleteRequestTitle", "Delete this request?"),
            t("features.deleteRequestDescription", "This can't be undone."),
            [
              { text: t("common.cancel", "Cancel"), style: "cancel" },
              {
                text: t("common.delete", "Delete"),
                style: "destructive",
                onPress: () => deleteMutation.mutate(feature.id),
              },
            ],
          ),
      },
      { text: t("common.cancel", "Cancel"), style: "cancel" },
    ]);
  }, [feature, t, deleteMutation]);

  const onShare = useCallback(() => {
    void Share.share({
      message: `${feature.title}\nhttps://dehub.io/app/features?feature=${feature.id}`,
    });
  }, [feature.id, feature.title]);

  return (
    <View style={styles.card}>
      {/* Header — avatar, name, @handle · time, author menu */}
      <View style={styles.cardHead}>
        <Pressable
          onPress={() => showUserProfile?.(feature.author_username || feature.author_wallet_address)}
          style={{ flexShrink: 0 }}
        >
          <Avatar uri={getAvatarUrl(feature.author_avatar)} size={36} name={displayName} />
        </Pressable>
        <View style={styles.cardHeadText}>
          <Text style={styles.authorName} numberOfLines={1}>
            {displayName}
          </Text>
          <View style={styles.handleRow}>
            <Text style={styles.handle} numberOfLines={1}>
              {handle}
            </Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.time}>{timeAgo(feature.created_at, t)}</Text>
          </View>
        </View>
        {isAuthor && !editing && (
          <Pressable
            onPress={openMenu}
            hitSlop={10}
            style={styles.menuBtn}
            accessibilityRole="button"
            accessibilityLabel="Request options"
          >
            <Icon name="EllipsisVertical" size={16} color="#71717A" />
          </Pressable>
        )}
      </View>

      {editing ? (
        <View style={{ gap: 10, paddingTop: 4 }}>
          <View>
            <Text style={styles.editLabel}>{t("features.titleLabel")}</Text>
            <TextInput
              value={editTitle}
              onChangeText={(v) => setEditTitle(v.slice(0, TITLE_MAX))}
              style={styles.input}
              placeholderTextColor="#52525B"
            />
          </View>
          <View>
            <Text style={styles.editLabel}>{t("features.descriptionLabel")}</Text>
            <TextInput
              value={editDescription}
              onChangeText={(v) => setEditDescription(v.slice(0, DESC_MAX))}
              style={[styles.input, styles.textarea]}
              multiline
              placeholderTextColor="#52525B"
            />
          </View>
          <View>
            <Text style={styles.editLabel}>{t("features.categoryLabel")}</Text>
            <View style={styles.catWrap}>
              {CATEGORY_KEYS.map((key) => {
                const active = editCategory === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setEditCategory(key)}
                    style={[styles.sheetChip, active && styles.sheetChipActive]}
                  >
                    <Text style={[styles.sheetChipText, active && styles.sheetChipTextActive]}>
                      {t(CATEGORY_I18N[key])}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() =>
                editMutation.mutate(
                  {
                    id: feature.id,
                    title: editTitle,
                    description: editDescription,
                    category: editCategory,
                  },
                  { onSuccess: () => setEditing(false) },
                )
              }
              disabled={!editTitle.trim() || !editDescription.trim() || editMutation.isPending}
              style={[
                styles.glassBtnSm,
                (!editTitle.trim() || !editDescription.trim()) && styles.disabled,
              ]}
            >
              {editMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.glassBtnText}>{t("common.save", "Save")}</Text>
              )}
            </Pressable>
            <Pressable onPress={() => setEditing(false)} style={styles.ghostBtnSm}>
              <Text style={styles.ghostBtnText}>{t("common.cancel", "Cancel")}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={{ paddingTop: 4, gap: 8 }}>
          <Text style={styles.cardTitle}>{feature.title}</Text>
          {!!feature.description && <Text style={styles.cardDesc}>{feature.description}</Text>}

          <Attachments feature={feature} />

          <View style={styles.badgeRow}>
            <View style={styles.catBadge}>
              <Text style={styles.catBadgeText}>{categoryLabel(t, feature.category)}</Text>
            </View>
            {badge && (
              <View
                style={[styles.statusBadge, { backgroundColor: badge.bg, borderColor: badge.bd }]}
              >
                <Text style={[styles.statusBadgeText, { color: badge.fg }]}>
                  {t(STATUS_I18N[feature.status], STATUS_LABELS[feature.status])}
                </Text>
              </View>
            )}
          </View>

          {/* Actions — dislike · share · comment · like, spread edge to edge
              exactly as the feed's FeedActionBar does. */}
          <View style={styles.actionRow}>
            <ActionButton
              icon="ThumbsDown"
              label="Dislike"
              count={feature.dislike_count ?? 0}
              active={myVote === -1}
              onPress={() => onVote(-1)}
            />
            <ActionButton icon="Share2" label="Share" onPress={onShare} />
            <ActionButton
              icon="MessageSquare"
              label="Comments"
              count={feature.comment_count ?? 0}
              active={showComments}
              onPress={() => setShowComments((s) => !s)}
            />
            <ActionButton
              icon="ThumbsUp"
              label="Like"
              count={feature.like_count ?? 0}
              active={myVote === 1}
              onPress={() => onVote(1)}
            />
          </View>
        </View>
      )}

      {showComments && !editing && (
        <CommentsSection featureId={feature.id} isAuthed={isAuthed} />
      )}
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
    mediaUris: string[];
  }) => void;
  submitting: boolean;
  initialCategory?: FeatureCategory;
}> = ({ visible, onClose, onSubmit, submitting, initialCategory }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [device, setDevice] = useState("");
  const [category, setCategory] = useState<FeatureCategory>(initialCategory || "new_feature");
  const [mediaUris, setMediaUris] = useState<string[]>([]);

  // The sheet stays mounted between opens, so the category has to be re-seeded
  // when it opens — otherwise it keeps whatever the last submission chose.
  React.useEffect(() => {
    if (visible) setCategory(initialCategory || "new_feature");
  }, [visible, initialCategory]);

  const valid = title.trim().length > 0 && description.trim().length > 0;

  const pickMedia = useCallback(async () => {
    await runWithPermissions(["photos"], async () => {
      const pick = await ImagePicker.launchImageLibraryAsync({
        // String literals, not `MediaType.image`: `MediaType` is a TypeScript
        // union with no runtime object behind it, so reaching into it throws.
        mediaTypes: ["images", "videos"],
        quality: 0.85,
        allowsMultipleSelection: true,
        selectionLimit: MAX_FEATURE_ATTACHMENTS - mediaUris.length,
      });
      if (pick.canceled) return;

      const assets = pick.assets ?? [];
      // Same per-file ceiling web enforces. An oversized file read into a Blob
      // for upload is also the fastest way to run the app out of memory.
      const accepted = assets.filter(
        (a) => a.uri && (a.fileSize ?? 0) <= MAX_FEATURE_ATTACHMENT_BYTES,
      );
      if (accepted.length < assets.length) {
        toastWarning(t("features.attachmentTooLarge", "Each file must be under 20MB"));
      }
      setMediaUris((prev) =>
        [...prev, ...accepted.map((a) => a.uri)].slice(0, MAX_FEATURE_ATTACHMENTS),
      );
    });
  }, [mediaUris.length, t]);

  const reset = useCallback(() => {
    setTitle("");
    setDescription("");
    setDevice("");
    setCategory(initialCategory || "new_feature");
    setMediaUris([]);
  }, [initialCategory]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleSubmit = useCallback(() => {
    if (!valid || submitting) return;
    // Web appends the device line to the description rather than storing it in
    // its own column — keep the two boards' rows identical.
    const fullDescription = device.trim()
      ? `${description.trim()}\n\n📱 Device & OS: ${device.trim()}`
      : description.trim();
    onSubmit({ title, description: fullDescription, category, mediaUris });
    reset();
  }, [valid, submitting, device, description, title, category, mediaUris, onSubmit, reset]);

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
                style={styles.sheetClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Icon name="X" size={16} color="#A1A1AA" />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>{t("features.titleLabel")}</Text>
              <TextInput
                value={title}
                onChangeText={(v) => setTitle(v.slice(0, TITLE_MAX))}
                placeholder={t("features.titlePlaceholder")}
                placeholderTextColor="#52525B"
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
                placeholderTextColor="#52525B"
                multiline
                style={[styles.input, styles.textarea]}
              />
              <Text style={styles.counter}>
                {description.length}/{DESC_MAX}
              </Text>

              <Text style={styles.fieldLabel}>
                {t("features.deviceLabel", "Device & OS Details (optional)")}
              </Text>
              <TextInput
                value={device}
                onChangeText={(v) => setDevice(v.slice(0, DEVICE_MAX))}
                placeholder={t(
                  "features.devicePlaceholder",
                  "e.g. iPhone 15 Pro, iOS 18.2 / Samsung S24, Android 15…",
                )}
                placeholderTextColor="#52525B"
                multiline
                style={[styles.input, styles.textareaSm]}
              />
              <Text style={styles.counter}>
                {device.length}/{DEVICE_MAX}
              </Text>

              <Text style={styles.fieldLabel}>{t("features.categoryLabel")}</Text>
              <View style={styles.catWrap}>
                {CATEGORY_KEYS.map((key) => {
                  const active = category === key;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => setCategory(key)}
                      style={[styles.sheetChip, active && styles.sheetChipActive]}
                    >
                      <Text style={[styles.sheetChipText, active && styles.sheetChipTextActive]}>
                        {t(CATEGORY_I18N[key])}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>
                {t("features.attachLabel", "Attach Images or Videos (optional)")}
                <Text style={styles.fieldLabelMuted}>
                  {" "}
                  — {t("features.upTo", "up to {{max}}", { max: MAX_FEATURE_ATTACHMENTS })}
                </Text>
              </Text>

              {mediaUris.length > 0 && (
                <View style={styles.pickGrid}>
                  {mediaUris.map((uri, i) => (
                    <View key={`${uri}-${i}`} style={styles.pickTile}>
                      <Image
                        source={{ uri }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                      />
                      <Pressable
                        style={styles.pickRemove}
                        onPress={() => setMediaUris((p) => p.filter((_, idx) => idx !== i))}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove attachment ${i + 1}`}
                      >
                        <Icon name="X" size={12} color="#FFFFFF" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}

              {mediaUris.length < MAX_FEATURE_ATTACHMENTS && (
                <Pressable style={styles.mediaAdd} onPress={pickMedia}>
                  <Icon name="ImagePlus" size={20} color="#71717A" />
                  <Text style={styles.mediaAddText}>
                    {mediaUris.length === 0
                      ? t("features.clickToUpload", "Tap to upload")
                      : t("features.addAnother", "Add another")}
                  </Text>
                </Pressable>
              )}
            </ScrollView>

            <Pressable
              onPress={handleSubmit}
              style={[styles.glassBtn, (!valid || submitting) && styles.disabled]}
              disabled={!valid || submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Icon name="Sparkles" size={16} color="#FFFFFF" />
                  <Text style={styles.glassBtnText}>{t("features.submitRequest")}</Text>
                </>
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
  const { width } = useWindowDimensions();
  const navigation = useNavigation<any>();
  const { isSignedIn, needsUsername } = useAuthState();
  const isAuthed = isSignedIn && !needsUsername;

  const [tab, setTab] = useState<PageTab>("requests");
  const [sort, setSort] = useState<FeatureSort>("most_voted");
  const [category, setCategory] = useState<FeatureCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);

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
  const inProgress = useInProgressFeatures();
  const { data: counts } = useFeatureCounts();
  const { data: votes } = useUserVotes();
  const voteMutation = useVoteFeatureRequest();
  const submitMutation = useSubmitFeatureRequest();

  const requestItems = useMemo(() => data?.pages.flat() ?? [], [data]);
  const items =
    tab === "shipped"
      ? shipped.data ?? []
      : tab === "shipping"
        ? inProgress.data ?? []
        : requestItems;

  const totalCount = counts?.total ?? requestItems.length;
  const openCount = counts?.open ?? requestItems.length;
  const shippedCount = shipped.data?.length ?? 0;
  const inProgressCount = inProgress.data?.length ?? 0;

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
        isAuthed={isAuthed}
      />
    ),
    [votes, handleVote, isAuthed],
  );

  const keyExtractor = useCallback((f: FeatureRequest) => f.id, []);

  const loading =
    tab === "shipped" ? shipped.isLoading : tab === "shipping" ? inProgress.isLoading : isLoading;
  const refreshing =
    tab === "shipped"
      ? shipped.isRefetching
      : tab === "shipping"
        ? inProgress.isRefetching
        : isRefetching;
  const onRefresh =
    tab === "shipped" ? shipped.refetch : tab === "shipping" ? inProgress.refetch : refetch;

  const openSheet = () =>
    isAuthed ? setSheetOpen(true) : navigation.navigate(ScreenNames.SignIn);

  /**
   * One tab's width: screen − 16 page gutter − 32 bento padding − 8 strip
   * padding − 8 gaps, split three ways. "Shipping" plus its icon and a
   * three-digit badge measures ~91pt, so below 96 the icons come off rather
   * than let anything spill out of its tab.
   */
  const tabWidth = (width - 64) / 3;
  const showTabIcons = tabWidth >= 96;

  const TABS: { key: PageTab; label: string; icon?: React.ComponentProps<typeof Icon>["name"]; count: number }[] = [
    { key: "requests", label: t("features.requests"), count: openCount },
    { key: "shipping", label: t("features.shipping", "Shipping"), icon: "Loader", count: inProgressCount },
    { key: "shipped", label: t("features.shipped"), icon: "CircleCheck", count: shippedCount },
  ];

  const emptyCopy =
    tab === "shipped"
      ? { title: t("features.noShippedYet"), body: t("features.shippedAppearHere") }
      : tab === "shipping"
        ? {
            title: t("features.noShippingYet", "Nothing in progress"),
            body: t("features.shippingAppearHere", "Requests being built will appear here."),
          }
        : debouncedSearch
          ? { title: t("features.noSearchResults"), body: "" }
          : { title: t("features.noRequestsYet"), body: t("features.beFirstIdea") };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Back sits above the bento, not inside it. Web's app shell carries the
          back affordance in its own chrome; folding it into the title row here
          cost ~40pt and left "Feature Requests" one device width from
          truncating. */}
      {navigation.canGoBack?.() && (
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={styles.backRow}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Icon name="ArrowLeft" size={20} color="#FAFAFA" />
        </Pressable>
      )}

      {/* Header bento — the whole page header on web at this width. */}
      <View style={styles.bento}>
        <View style={styles.bentoTop}>
          {iconFailed ? (
            <View style={styles.headerIconFallback}>
              <Icon name="Lightbulb" size={26} color="#FAFAFA" />
            </View>
          ) : (
            <Image
              source={{ uri: HEADER_ICON_URI }}
              style={styles.headerIcon}
              contentFit="contain"
              transition={150}
              onError={() => setIconFailed(true)}
            />
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.pageTitle} numberOfLines={1}>
              {t("features.title")}
            </Text>
            <Text style={styles.pageSubtitle} numberOfLines={1}>
              {totalCount === 1
                ? t("features.ideaSubmitted")
                : t("features.ideasSubmitted", { count: totalCount })}
            </Text>
          </View>
          <Pressable
            onPress={openSheet}
            hitSlop={8}
            style={styles.headerAddBtn}
            accessibilityRole="button"
            accessibilityLabel={t("features.submitDrawerTitle")}
          >
            <Icon name="Plus" size={16} color="#FFFFFF" />
          </Pressable>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <Icon name="Search" size={16} color="#71717A" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t("features.searchPlaceholder")}
            placeholderTextColor="#71717A"
            style={styles.searchInput}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Icon name="X" size={15} color="#71717A" />
            </Pressable>
          )}
        </View>

        {/* Requests / Shipping / Shipped */}
        <View style={styles.tabStrip}>
          {TABS.map((tabDef) => {
            const active = tab === tabDef.key;
            return (
              <Pressable
                key={tabDef.key}
                onPress={() => setTab(tabDef.key)}
                style={[styles.tab, active && styles.tabActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                {tabDef.icon && showTabIcons && (
                  <Icon name={tabDef.icon} size={12} color={active ? "#FFFFFF" : "#71717A"} />
                )}
                {/* flexShrink: 0 — a shrinking label renders as a bare "…". */}
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{tabDef.label}</Text>
                {tabDef.count > 0 && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{formatCompactNumber(tabDef.count)}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {tab === "requests" && (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              // flexGrow: 0 — without it the strip expands to fill the column
              // and squashes the list underneath it.
              style={styles.strip}
              contentContainerStyle={styles.stripContent}
            >
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

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.strip}
              contentContainerStyle={styles.sortStripContent}
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
            </ScrollView>
          </>
        )}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      ) : isError && tab === "requests" ? (
        <View style={styles.emptyBento}>
          <Text style={styles.emptyTitle}>{t("features.loadFailed")}</Text>
          <Pressable onPress={() => refetch()} style={styles.glassBtnSm}>
            <Text style={styles.glassBtnText}>{t("common.retry")}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingHorizontal: 8,
            paddingBottom: insets.bottom + 24,
            paddingTop: 8,
            gap: 12,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.accent}
            />
          }
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (tab === "requests" && hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator color="#71717A" style={{ marginVertical: 16 }} />
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyBento}>
              <Icon name="Lightbulb" size={44} color="#3F3F46" />
              <Text style={styles.emptyTitle}>{emptyCopy.title}</Text>
              {!!emptyCopy.body && <Text style={styles.emptyBody}>{emptyCopy.body}</Text>}
              {tab === "requests" && !debouncedSearch && (
                <Pressable onPress={openSheet} style={styles.glassBtn}>
                  <Icon name="Plus" size={16} color="#FFFFFF" />
                  <Text style={styles.glassBtnText}>{t("features.submitFeatureRequest")}</Text>
                </Pressable>
              )}
            </View>
          }
        />
      )}

      <SubmitSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        submitting={submitMutation.isPending}
        initialCategory={category !== "all" ? category : undefined}
        onSubmit={(v) => {
          submitMutation.mutate(v, { onSuccess: () => setSheetOpen(false) });
        }}
      />
    </View>
  );
}

/**
 * Glass fill for an active tab / chip / primary button — the flat equivalent of
 * web's `bg-gradient-to-br from-white/20 via-white/10 to-white/5` plus its
 * white/30 hairline.
 */
const GLASS_BG = "rgba(255,255,255,0.12)";
const GLASS_BORDER = "rgba(255,255,255,0.30)";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },

  // Header bento — zinc-900, 16pt radius, 16pt padding, 8pt page gutter.
  bento: {
    backgroundColor: "#18181B",
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 8,
    marginTop: 4,
  },
  bentoTop: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  backRow: {
    width: 40,
    height: 40,
    marginLeft: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIcon: { width: 48, height: 48, flexShrink: 0 },
  headerIconFallback: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  pageTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "700" },
  pageSubtitle: { color: "#71717A", fontSize: 13, marginTop: 2 },
  headerAddBtn: {
    flexShrink: 0,
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },

  // Search — 40pt, zinc-800 on a zinc-700 hairline.
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#27272A",
    borderWidth: 1,
    borderColor: "#3F3F46",
    marginBottom: 12,
  },
  searchInput: { flex: 1, minWidth: 0, color: "#FFFFFF", fontSize: 14, padding: 0 },

  // Tab strip — 48pt outer, three 40pt tabs.
  tabStrip: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderRadius: 12,
    backgroundColor: "rgba(39,39,42,0.4)",
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 1,
    // Always bordered, transparent when inactive: adding the border only on the
    // active tab would shift its label by a pixel on every switch.
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabActive: { backgroundColor: GLASS_BG, borderColor: GLASS_BORDER },
  // Measured: "Shipping" at 12pt is 46.8pt, so icon + label + a three-digit
  // badge comes to ~91pt against the 98.7pt tab a 360pt screen gives. The icon
  // drops below that (see showTabIcons). flexShrink: 0 so a label can never
  // ellipsize to a bare "…".
  tabText: { color: "#71717A", fontSize: 12, fontWeight: "500", flexShrink: 0 },
  tabTextActive: { color: "#FFFFFF" },
  tabBadge: {
    flexShrink: 0,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  tabBadgeText: { color: "rgba(255,255,255,0.7)", fontSize: 9.5, fontWeight: "600" },

  // Category pills + sort tabs.
  strip: { flexGrow: 0 },
  stripContent: { gap: 8, paddingBottom: 4, alignItems: "center" },
  sortStripContent: { gap: 6, alignItems: "center" },
  chip: {
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  chipActive: { backgroundColor: GLASS_BG, borderColor: GLASS_BORDER },
  chipText: { color: "#A1A1AA", fontSize: 13.5, fontWeight: "500", flexShrink: 0 },
  chipTextActive: { color: "#FFFFFF" },

  // Cards.
  card: {
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: 12,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardHeadText: { flex: 1, minWidth: 0 },
  authorName: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  handleRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  handle: { color: "#71717A", fontSize: 12, flexShrink: 1 },
  dot: { color: "#52525B", fontSize: 12 },
  time: { color: "#71717A", fontSize: 12, flexShrink: 0 },
  menuBtn: { flexShrink: 0, width: 28, height: 28, alignItems: "center", justifyContent: "center" },

  cardTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "600", lineHeight: 18 },
  cardDesc: { color: "#A1A1AA", fontSize: 14, lineHeight: 22 },

  mediaSingle: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.30)",
  },
  mediaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  mediaTile: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.30)",
  },
  playBadge: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
  },

  badgeRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  catBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
  },
  catBadgeText: { color: "#D4D4D8", fontSize: 10, fontWeight: "500", flexShrink: 0 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  statusBadgeText: { fontSize: 10, fontWeight: "500", flexShrink: 0 },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionCount: { color: "#8B8D90", fontSize: 12 },

  // Comments.
  commentsWrap: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  noComments: { color: "#71717A", fontSize: 12, textAlign: "center", paddingVertical: 8 },
  commentRow: { flexDirection: "row", gap: 8, paddingVertical: 5 },
  commentHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  commentAuthor: { color: "#A1A1AA", fontSize: 11, fontWeight: "500", flexShrink: 1 },
  commentTime: { color: "#71717A", fontSize: 10, flexShrink: 0 },
  commentBody: { color: "#D4D4D8", fontSize: 12, lineHeight: 18, marginTop: 1 },

  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 10 },
  composerInput: {
    flex: 1,
    minHeight: 32,
    maxHeight: 100,
    color: "#FFFFFF",
    fontSize: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },
  sendBtnDisabled: { opacity: 0.3 },
  signInBar: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    paddingVertical: 10,
    alignItems: "center",
  },
  signInText: { color: "#A1A1AA", fontSize: 12.5, fontWeight: "500" },

  // Empty / error bento.
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 64 },
  emptyBento: {
    backgroundColor: "#18181B",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "600", textAlign: "center" },
  emptyBody: { color: "#71717A", fontSize: 13, textAlign: "center" },

  // Buttons.
  glassBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },
  glassBtnSm: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },
  glassBtnText: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "600", flexShrink: 0 },
  ghostBtnSm: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    justifyContent: "center",
  },
  ghostBtnText: { color: "#A1A1AA", fontSize: 13.5, fontWeight: "500", flexShrink: 0 },
  disabled: { opacity: 0.4 },

  // Submit sheet.
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#0A0A0B",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    paddingHorizontal: 16,
    paddingTop: 16,
    maxHeight: "88%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sheetTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "700", flexShrink: 1 },
  sheetClose: {
    flexShrink: 0,
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#27272A",
  },
  fieldLabel: { color: "#A1A1AA", fontSize: 12, fontWeight: "500", marginBottom: 4, marginTop: 12 },
  fieldLabelMuted: { color: "#52525B", fontWeight: "400" },
  editLabel: { color: "#71717A", fontSize: 12, marginBottom: 4 },
  input: {
    backgroundColor: "#18181B",
    borderWidth: 1,
    borderColor: "#27272A",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#FFFFFF",
    fontSize: 14,
  },
  textarea: { minHeight: 100, textAlignVertical: "top" },
  textareaSm: { minHeight: 60, textAlignVertical: "top" },
  counter: { color: "#71717A", fontSize: 11, textAlign: "right", marginTop: 4 },
  catWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sheetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "#27272A",
  },
  sheetChipActive: { backgroundColor: "#FFFFFF" },
  sheetChipText: { color: "#A1A1AA", fontSize: 12, fontWeight: "500", flexShrink: 0 },
  sheetChipTextActive: { color: "#000000" },

  pickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  pickTile: {
    width: "31%",
    aspectRatio: 1,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "#18181B",
  },
  pickRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  mediaAdd: {
    height: 96,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(24,24,27,0.5)",
  },
  mediaAddText: { color: "#71717A", fontSize: 12, flexShrink: 0 },
});
