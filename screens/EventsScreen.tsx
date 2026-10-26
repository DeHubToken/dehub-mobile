/**
 * EventsScreen
 * ============
 * Native port of the web EventsPage (/app/events). Lists community events from
 * Supabase with Upcoming / Past / Mine filters and going/interested RSVP.
 */
import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, useWindowDimensions } from "react-native";
import { DeHubRefreshControl, DeHubRefreshMark } from "../components/Feed/DeHubRefreshControl";
import { DeHubLoader } from "../components/DeHubLoader";
import { Image } from "expo-image";
import { storageImageSource } from "../libs/cdnImage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import { KitButton, PageEmpty, PageSection, PageTabs } from "../components/page/PageKit";
import { useUser, useAuthState, useAuthActions } from "../context/AuthContext";
import { theme } from "../theme";
import { toastInfo, toastError } from "../libs";
import { DhbCoin } from "../components/common/DhbCoin";
import EventDetailSheet from "../components/Events/EventDetailSheet";
import EventFormSheet from "../components/Events/EventFormSheet";
import {
  getEventByNumber,
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
  onOpen: (event: CommunityEvent) => void;
}

export const EventCard: React.FC<EventCardProps> = ({ event, rsvp, onRsvp, onOpen }) => {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const going = rsvp === "going";
  const interested = rsvp === "interested";
  return (
    <PageSection flush>
      <Pressable onPress={() => onOpen(event)} accessibilityRole="button" accessibilityLabel={event.title}>
        {event.cover_image_url ? (
          <Image source={storageImageSource(event.cover_image_url, windowWidth)} style={styles.cover} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]}>
            <Icon name="CalendarDays" size={32} color="#3F3F46" />
          </View>
        )}

        <View style={styles.cardBody}>
          <Text style={styles.dateText}>{formatEventDate(event.starts_at)}</Text>
          <View style={styles.titleRow}>
            {event.is_private && <Icon name="Lock" size={13} color="#A1A1AA" />}
            <Text style={[styles.eventTitle, { flex: 1 }]} numberOfLines={2}>{event.title}</Text>
          </View>

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
        </View>
      </Pressable>

      <View style={styles.actionsWrap}>
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
  const [openEvent, setOpenEvent] = useState<CommunityEvent | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { requireAuth } = useAuthActions();
  const route = useRoute<any>();
  const linkedNumber = Number(route.params?.eventNumber);

  // dehub.io/app/events/:n lands here: open that event over the list.
  useEffect(() => {
    if (!Number.isFinite(linkedNumber) || linkedNumber <= 0) return;
    let cancelled = false;
    getEventByNumber(linkedNumber)
      .then((e) => {
        if (!cancelled && e) setOpenEvent(e);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [linkedNumber]);

  const { data: events = [], isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["events", filter, wallet],
    queryFn: () => getEvents(filter, wallet),
  });

  const { data: myRsvps = {} } = useQuery({
    queryKey: ["my-rsvps", wallet],
    queryFn: () => getMyRsvps(wallet as string),
    enabled: !!wallet && isSignedIn,
  });

  const pendingRsvps = useRef(new Set<string>());
  const rsvpMutation = useMutation({
    onMutate: async ({ eventId, status }) => {
      await Promise.all([queryClient.cancelQueries({ queryKey: ["my-rsvps", wallet] }), queryClient.cancelQueries({ queryKey: ["events"] })]);
      const previous = queryClient.getQueryData<Record<string, RsvpStatus>>(["my-rsvps", wallet]);
      const event = events.find(row => row.id === eventId);
      if (!previous || !event) return;
      const counts = {
        going_count: Math.max(0, event.going_count + Number(status === "going") - Number(previous[eventId] === "going" || previous[eventId] === "approved")),
        interested_count: Math.max(0, event.interested_count + Number(status === "interested") - Number(previous[eventId] === "interested")),
      };
      queryClient.setQueryData<Record<string, RsvpStatus>>(["my-rsvps", wallet], old => {
        const next = { ...old };
        if (status === "remove") delete next[eventId]; else next[eventId] = status;
        return next;
      });
      queryClient.setQueriesData<CommunityEvent[]>({ queryKey: ["events"] }, rows => rows?.map(row => row.id === eventId ? { ...row, ...counts } : row));
      return { previous: previous[eventId], event };
    },
    mutationFn: ({ eventId, status }: { eventId: string; status: "going" | "interested" | "remove" }) =>
      toggleRsvp(eventId, status, wallet as string),
    onSettled: (_data, _error, { eventId }) => {
      pendingRsvps.current.delete(eventId);
      queryClient.invalidateQueries({ queryKey: ["my-rsvps", wallet] });
      queryClient.invalidateQueries({ queryKey: ["events"], refetchType: "none" });
    },
    onError: (_error, { eventId }, context) => {
      if (context) {
        queryClient.setQueryData<Record<string, RsvpStatus>>(["my-rsvps", wallet], old => {
          const next = { ...old };
          if (context.previous === undefined) delete next[eventId]; else next[eventId] = context.previous;
          return next;
        });
        queryClient.setQueriesData<CommunityEvent[]>({ queryKey: ["events"] }, rows => rows?.map(row => row.id === eventId ? { ...row, going_count: context.event.going_count, interested_count: context.event.interested_count } : row));
      }
      toastError(t("events.rsvpFailed"));
    },
  });

  const handleRsvp = useCallback(
    (event: CommunityEvent, status: "going" | "interested") => {
      if (!isSignedIn || !wallet) {
        toastInfo(t("events.signInToRsvp"));
        return;
      }
      const current = myRsvps[event.id];
      // Private and gated events are decided in the detail sheet.
      if (event.is_private || (event.gate_fee ?? 0) > 0) {
        setOpenEvent(event);
        return;
      }
      // Tapping the active status again clears it, mirroring the web toggle.
      const next = current === status ? "remove" : status;
      if (pendingRsvps.current.has(event.id)) return;
      pendingRsvps.current.add(event.id);
      rsvpMutation.mutate({ eventId: event.id, status: next });
    },
    [isSignedIn, wallet, myRsvps, rsvpMutation, t],
  );

  const keyExtractor = useCallback((e: CommunityEvent) => e.id, []);
  const renderItem = useCallback(
    ({ item }: { item: CommunityEvent }) => (
      <EventCard event={item} rsvp={myRsvps[item.id]} onRsvp={handleRsvp} onOpen={setOpenEvent} />
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
      <ScreenHeader icon="events" title={t("nav.events")} subtitle={t("events.subtitle")}
        rightContent={
          <Pressable
            onPress={() => requireAuth(() => setCreateOpen(true))}
            accessibilityRole="button"
            accessibilityLabel={t("events.createEvent")}
            className="items-center justify-center bg-theme-neutrals-800"
            style={{ width: 36, height: 36, borderRadius: 10 }}
          >
            <Icon name="Plus" size={18} color="#FFFFFF" />
          </Pressable>
        }
        tabs={
          <PageTabs
            value={filter}
            onChange={setFilter}
            tabs={FILTERS.map((f) => ({ id: f.key, label: t(f.labelKey) }))}
            style={{ paddingBottom: 10 }}
          />
        }
      />

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
      <EventDetailSheet event={openEvent} visible={!!openEvent} onClose={() => setOpenEvent(null)} />
      {createOpen && (
        <EventFormSheet visible={createOpen} onClose={() => setCreateOpen(false)} onCreated={setOpenEvent} />
      )}
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
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionsWrap: { paddingHorizontal: 16, paddingBottom: 16, marginTop: -8 },
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
