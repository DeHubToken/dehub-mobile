/**
 * EventsScreen
 * ============
 * Native port of the web EventsPage (/app/events). Lists community events from
 * Supabase with Upcoming / Past / Mine filters and going/interested RSVP.
 */
import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, useWindowDimensions } from "react-native";
import { DeHubRefreshControl, DeHubRefreshMark } from "../components/Feed/DeHubRefreshControl";
import { DeHubLoader } from "../components/DeHubLoader";
import { Image } from "expo-image";
import { storageImageSource } from "../libs/cdnImage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import { KitButton, PageEmpty, PageSection, PageTabs } from "../components/page/PageKit";
import { useUser, useAuthState } from "../context/AuthContext";
import { theme } from "../theme";
import { toastInfo, toastError } from "../libs";
import { DhbCoin } from "../components/common/DhbCoin";
import {
  getEvents,
  getMyRsvps,
  toggleRsvp,
  type CommunityEvent,
  type RsvpStatus,
  type EventsFilter,
} from "../services/events.service";

const FILTERS: { key: EventsFilter; labelKey: string }[] = [
  { key: "upcoming", labelKey: "stages.tabUpcoming" },
  { key: "past", labelKey: "stages.past" },
  { key: "my", labelKey: "events.mine" },
];

// Intl handles the weekday/month names, the date order and 12- vs 24-hour
// clocks per locale, so there is nothing here to translate by hand.
function formatEventDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const lang = i18n.language || undefined;
  const day = d.toLocaleDateString(lang, { weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(lang, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

interface EventCardProps {
  event: CommunityEvent;
  rsvp?: RsvpStatus;
  onRsvp: (event: CommunityEvent, status: "going" | "interested") => void;
}

const EventCard: React.FC<EventCardProps> = ({ event, rsvp, onRsvp }) => {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const going = rsvp === "going";
  const interested = rsvp === "interested";
  return (
    <PageSection flush>
      {event.cover_image_url ? (
        <Image source={storageImageSource(event.cover_image_url, windowWidth)} style={styles.cover} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]}>
          <Icon name="CalendarDays" size={32} color="#3F3F46" />
        </View>
      )}

      <View style={styles.cardBody}>
        <Text style={styles.dateText}>{formatEventDate(event.starts_at)}</Text>
        <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>

        {!!event.location && (
          <View style={styles.locationRow}>
            <Icon name="MapPin" size={13} color="#808089" />
            <Text style={styles.locationText} numberOfLines={1}>{event.location}</Text>
          </View>
        )}

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{t("events.goingCount", { count: event.going_count || 0 })}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaText}>{t("events.interestedCount", { count: event.interested_count || 0 })}</Text>
          {(event.gate_fee ?? 0) > 0 && (
            <>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.gateFee}>{event.gate_fee} <DhbCoin size={12} /></Text>
            </>
          )}
        </View>

        <View style={styles.actions}>
          <Pressable
            style={[styles.rsvpBtn, going && styles.rsvpBtnActive]}
            onPress={() => onRsvp(event, "going")}
            accessibilityRole="button"
            accessibilityState={{ selected: going }}
          >
            <Icon name="Check" size={14} color={going ? "#000000" : "#FFFFFF"} />
            <Text style={[styles.rsvpText, going && styles.rsvpTextActive]}>{t("events.going")}</Text>
          </Pressable>
          <Pressable
            style={[styles.rsvpBtn, interested && styles.rsvpBtnActive]}
            onPress={() => onRsvp(event, "interested")}
            accessibilityRole="button"
            accessibilityState={{ selected: interested }}
          >
            <Icon name="Star" size={14} color={interested ? "#000000" : "#FFFFFF"} />
            <Text style={[styles.rsvpText, interested && styles.rsvpTextActive]}>{t("events.interested")}</Text>
          </Pressable>
        </View>
      </View>
    </PageSection>
  );
};

export default function EventsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const user = useUser() as { walletAddress?: string; address?: string } | null;
  const { isSignedIn } = useAuthState();
  const wallet = user?.walletAddress || user?.address || null;
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<EventsFilter>("upcoming");

  const { data: events = [], isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["events", filter, wallet],
    queryFn: () => getEvents(filter, wallet),
  });

  const { data: myRsvps = {} } = useQuery({
    queryKey: ["my-rsvps", wallet],
    queryFn: () => getMyRsvps(wallet as string),
    enabled: !!wallet && isSignedIn,
  });

  const rsvpMutation = useMutation({
    mutationFn: ({ eventId, status }: { eventId: string; status: "going" | "interested" | "remove" }) =>
      toggleRsvp(eventId, status, wallet as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-rsvps", wallet] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: () => toastError(t("events.rsvpFailed")),
  });

  const handleRsvp = useCallback(
    (event: CommunityEvent, status: "going" | "interested") => {
      if (!isSignedIn || !wallet) {
        toastInfo(t("events.signInToRsvp"));
        return;
      }
      const current = myRsvps[event.id];
      // Tapping the active status again clears it, mirroring the web toggle.
      const next = current === status ? "remove" : status;
      rsvpMutation.mutate({ eventId: event.id, status: next });
    },
    [isSignedIn, wallet, myRsvps, rsvpMutation, t],
  );

  const keyExtractor = useCallback((e: CommunityEvent) => e.id, []);
  const renderItem = useCallback(
    ({ item }: { item: CommunityEvent }) => (
      <EventCard event={item} rsvp={myRsvps[item.id]} onRsvp={handleRsvp} />
    ),
    [myRsvps, handleRsvp],
  );

  const emptyLabel = useMemo(() => {
    if (filter === "my") return t("events.noneCreated");
    if (filter === "past") return t("events.noPast");
    return t("events.noUpcoming");
  }, [filter, t]);

  return (
    <View className="bg-theme-neutrals-900" style={styles.root}>
      <ScreenHeader icon="events" title={t("nav.events")} subtitle={t("events.subtitle")} />

      <View>
        <PageTabs
          value={filter}
          onChange={setFilter}
          tabs={FILTERS.map((f) => ({ id: f.key, label: t(f.labelKey) }))}
          style={{ paddingBottom: 10 }}
        />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <DeHubLoader size={56} />
        </View>
      ) : isError ? (
        <PageEmpty
          title={t("events.loadFailed")}
          action={<KitButton variant="quiet" label={t("common.retry")} onPress={() => refetch()} />}
        />
      ) : (
        <FlatList
          data={events}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 4 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <DeHubRefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.colors.accent} />
          }
          ListEmptyComponent={
            <PageEmpty icon="events" title={emptyLabel} />
          }
        />
      )}
      <DeHubRefreshMark refreshing={isRefetching} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 64 },
  cover: { width: "100%", height: 150, backgroundColor: "#18181B" },
  coverPlaceholder: { alignItems: "center", justifyContent: "center" },
  cardBody: { padding: 16, gap: 6 },
  dateText: { color: theme.colors.accent, fontSize: 12, fontWeight: "600" },
  eventTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", lineHeight: 20 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  locationText: { color: "#A1A1AA", fontSize: 12, flex: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  metaText: { color: "#A1A1AA", fontSize: 12 },
  metaDot: { color: "#52525B", fontSize: 12 },
  gateFee: { color: theme.colors.accent, fontSize: 12, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 8, marginTop: 8 },
  rsvpBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  rsvpBtnActive: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
  rsvpText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  rsvpTextActive: { color: "#000000" },
});
