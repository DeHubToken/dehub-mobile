/**
 * RecentActionsTab
 * ================
 * Telegram's "Recent Actions" — the community moderation log, newest first.
 *
 * The log is a moderator-only read (the service filters it by the caller's
 * wallet server-side), so the query only runs for someone holding
 * restrict_members. Rows are read-only: nothing here mutates, so there is no
 * busy state and no toast.
 *
 * Entries are bounded — the service caps at 200 and this renders 100 at a time
 * behind a "Show more" step, because these sheets have no virtualisation.
 */
import React, { memo, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import Icon from "../../ui/Icon";
import { shortWallet, useCommunityAdminLogQuery } from "../../../hooks/useCommunityAdmin";
import { ADMIN_LOG_VERBS, getCommunityAbilities, isForever } from "../../../libs/community-permissions";
import type { Community, CommunityAdminLogEntry, CommunityMember } from "../../../types/community";

const INITIAL_CAP = 100;
const STEP = 50;
const CONTENT_MAX = 140;

type FilterKey = "all" | "members" | "messages" | "settings" | "invites";

/** Unknown actions match no bucket, so they only ever show under "All". */
const FILTER_BUCKETS: Record<Exclude<FilterKey, "all">, string[]> = {
  members: [
    "promote_admin",
    "demote_admin",
    "transfer_ownership",
    "ban_member",
    "unban_member",
    "kick_member",
    "mute_member",
    "unmute_member",
    "approve_member",
    "reject_member",
  ],
  messages: ["delete_message", "purge_messages", "pin_message", "unpin_message"],
  settings: ["update_settings"],
  invites: ["create_invite", "revoke_invite", "invite_used"],
};

const FILTER_SETS: Record<Exclude<FilterKey, "all">, Set<string>> = {
  members: new Set(FILTER_BUCKETS.members),
  messages: new Set(FILTER_BUCKETS.messages),
  settings: new Set(FILTER_BUCKETS.settings),
  invites: new Set(FILTER_BUCKETS.invites),
};

const FILTERS: { key: FilterKey; labelKey: string; label: string }[] = [
  { key: "all", labelKey: "all", label: "All" },
  { key: "members", labelKey: "members", label: "Members" },
  { key: "messages", labelKey: "messages", label: "Messages" },
  { key: "settings", labelKey: "settings", label: "Settings" },
  { key: "invites", labelKey: "invites", label: "Invites" },
];

/** Raw settings-patch keys → the chip copy. The four ticker_* keys collapse. */
const SETTING_KEY_LABELS: Record<string, { key: string; label: string }> = {
  name: { key: "name", label: "name" },
  description: { key: "description", label: "description" },
  avatar_url: { key: "avatar", label: "avatar" },
  banner_url: { key: "banner", label: "banner" },
  is_private: { key: "privacy", label: "privacy" },
  rules: { key: "rules", label: "rules" },
  slow_mode_seconds: { key: "slowMode", label: "slow mode" },
  default_permissions: { key: "permissions", label: "permissions" },
  ticker_symbol: { key: "ticker", label: "ticker" },
  ticker_contract_address: { key: "ticker", label: "ticker" },
  ticker_chain_id: { key: "ticker", label: "ticker" },
  ticker_pair_address: { key: "ticker", label: "ticker" },
};

const DURATION_ACTIONS = new Set(["ban_member", "mute_member"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/** Minute resolution, unlike the day-resolution one on CommunityCard. */
function formatRelativeTime(dateString: string, t: TFunction): string {
  const stamp = new Date(dateString).getTime();
  if (Number.isNaN(stamp)) return "";
  const minutes = Math.floor((Date.now() - stamp) / 60000);
  if (minutes < 1) return t("communities.manage.log.justNow", { defaultValue: "just now" });
  if (minutes < 60) {
    return t("communities.manage.log.minutesAgo", { defaultValue: "{{value}}m ago", value: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return t("communities.manage.log.hoursAgo", { defaultValue: "{{value}}h ago", value: hours });
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return t("communities.manage.log.daysAgo", { defaultValue: "{{value}}d ago", value: days });
  }
  if (days < 30) {
    return t("communities.manage.log.weeksAgo", {
      defaultValue: "{{value}}w ago",
      value: Math.floor(days / 7),
    });
  }
  if (days < 365) {
    return t("communities.manage.log.monthsAgo", {
      defaultValue: "{{value}}mo ago",
      value: Math.floor(days / 30),
    });
  }
  return t("communities.manage.log.yearsAgo", {
    defaultValue: "{{value}}y ago",
    value: Math.floor(days / 365),
  });
}

/** created_at → detail.until, which is how a restriction's length is recorded. */
function formatRestriction(entry: CommunityAdminLogEntry, t: TFunction): string {
  const forever = t("communities.manage.log.permanently", { defaultValue: "permanently" });
  const until = asString(asRecord(entry.detail)?.until);
  if (!until) return forever;

  const end = new Date(until);
  const start = new Date(entry.created_at).getTime();
  if (Number.isNaN(end.getTime()) || Number.isNaN(start) || isForever(end)) return forever;

  const minutes = Math.max(1, Math.round((end.getTime() - start) / 60000));
  if (minutes < 60) {
    return t("communities.manage.log.forMinutes", { defaultValue: "for {{value}} min", value: minutes });
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return t("communities.manage.log.forHours", { defaultValue: "for {{value}}h", value: hours });
  }
  const days = Math.round(hours / 24);
  if (days < 7) {
    return t("communities.manage.log.forDays", { defaultValue: "for {{value}}d", value: days });
  }
  return t("communities.manage.log.forWeeks", {
    defaultValue: "for {{value}}w",
    value: Math.round(days / 7),
  });
}

/** The patch may be the bare detail object or nested under detail.patch. */
function settingChips(detail: unknown): { key: string; label: string }[] {
  const root = asRecord(detail);
  if (!root) return [];
  const patch = asRecord(root.patch) ?? root;

  const chips: { key: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const raw of Object.keys(patch)) {
    if (raw === "patch") continue;
    const mapped = SETTING_KEY_LABELS[raw] ?? { key: raw, label: raw.replace(/_/g, " ") };
    if (seen.has(mapped.key)) continue;
    seen.add(mapped.key);
    chips.push(mapped);
  }
  return chips;
}

const LogRow = memo(function LogRow({ entry }: { entry: CommunityAdminLogEntry }) {
  const { t } = useTranslation();

  const verb = t(`communities.manage.log.verbs.${entry.action}`, {
    defaultValue: ADMIN_LOG_VERBS[entry.action] ?? entry.action.replace(/_/g, " "),
  });
  const actor = entry.actor_wallet_address
    ? shortWallet(entry.actor_wallet_address)
    : t("communities.manage.log.unknownActor", { defaultValue: "Someone" });
  const target = entry.target_wallet_address ? shortWallet(entry.target_wallet_address) : null;

  const detail = asRecord(entry.detail);
  const chips: { key: string; label: string }[] =
    entry.action === "update_settings" ? settingChips(entry.detail) : [];
  const rawContent = entry.action === "delete_message" ? asString(detail?.content) : null;
  const quoted =
    rawContent && rawContent.length > CONTENT_MAX
      ? `${rawContent.slice(0, CONTENT_MAX)}…`
      : rawContent;
  const restriction = DURATION_ACTIONS.has(entry.action) ? formatRestriction(entry, t) : null;
  const reason = DURATION_ACTIONS.has(entry.action) ? asString(detail?.reason) : null;

  return (
    <View className="py-3 border-b border-white/5">
      <Text className="text-zinc-300 text-sm leading-5">
        <Text className="text-white text-sm font-mono">{actor}</Text>
        <Text>{` ${verb}`}</Text>
        {!!target && <Text className="text-white text-sm font-mono">{` ${target}`}</Text>}
        {!!restriction && <Text className="text-zinc-400">{` ${restriction}`}</Text>}
      </Text>

      {chips.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5 mt-2">
          {chips.map((chip) => (
            <View key={chip.key} style={styles.chip}>
              <Text style={styles.chipText}>
                {t(`communities.manage.log.settingKeys.${chip.key}`, { defaultValue: chip.label })}
              </Text>
            </View>
          ))}
        </View>
      )}

      {!!quoted && (
        <View style={styles.quote}>
          <Text className="text-zinc-400 text-xs leading-5">{quoted}</Text>
        </View>
      )}

      {!!reason && (
        <Text className="text-zinc-400 text-xs mt-1.5">
          {t("communities.manage.log.reason", { defaultValue: "Reason: {{value}}", value: reason })}
        </Text>
      )}

      <Text className="text-zinc-400 text-xs mt-1.5">{formatRelativeTime(entry.created_at, t)}</Text>
    </View>
  );
});

interface RecentActionsTabProps {
  community: Community;
  membership: CommunityMember | null | undefined;
}

export function RecentActionsTab({ community, membership }: RecentActionsTabProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [limit, setLimit] = useState(INITIAL_CAP);

  const abilities = useMemo(
    () => getCommunityAbilities(community, membership),
    [community, membership],
  );
  const canView = abilities.can("restrict_members");

  const { data, isLoading } = useCommunityAdminLogQuery(community.id, canView);

  const entries = useMemo(() => {
    const rows = [...(data ?? [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    if (filter === "all") return rows;
    const bucket = FILTER_SETS[filter];
    return rows.filter((entry) => bucket.has(entry.action));
  }, [data, filter]);

  const visible = entries.slice(0, limit);
  const remaining = entries.length - visible.length;

  const selectFilter = (key: FilterKey) => {
    setFilter(key);
    setLimit(INITIAL_CAP);
  };

  if (!canView) {
    return (
      <View className="px-4 py-10">
        <Text className="text-zinc-400 text-sm text-center">
          {t("communities.manage.log.restricted", {
            defaultValue: "Only moderators can see the moderation log.",
          })}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((item) => {
          const active = filter === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              onPress={() => selectFilter(item.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {t(`communities.manage.log.filters.${item.labelKey}`, { defaultValue: item.label })}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <View className="py-10 items-center">
          <ActivityIndicator size="small" color="#F4F4F5" />
        </View>
      ) : visible.length === 0 ? (
        <View className="py-10 items-center gap-2">
          <Icon name="History" size={24} color="#3f3f46" />
          <Text className="text-zinc-400 text-sm text-center">
            {t("communities.manage.log.empty", {
              defaultValue: "Nothing here yet. Moderation actions will show up as they happen.",
            })}
          </Text>
        </View>
      ) : (
        <View className="mt-1">
          {visible.map((entry) => (
            <LogRow key={entry.id} entry={entry} />
          ))}
          {remaining > 0 && (
            <TouchableOpacity style={styles.showMore} onPress={() => setLimit((n) => n + STEP)}>
              <Text style={styles.showMoreText}>
                {t("communities.manage.log.showMore", {
                  defaultValue: "Show more ({{value}})",
                  value: remaining,
                })}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  filterRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 4, paddingBottom: 4 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  filterChipActive: { backgroundColor: "#fff", borderColor: "#fff" },
  filterText: { color: "#a1a1aa", fontSize: 12, fontWeight: "600" },
  filterTextActive: { color: "#000" },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  chipText: { color: "#d4d4d8", fontSize: 11, fontWeight: "600" },
  quote: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderLeftWidth: 2,
    borderLeftColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  showMore: {
    marginTop: 12,
    marginBottom: 4,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  showMoreText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
