/**
 * EventsScreen
 * ============
 * Native port of the web EventsPage (/app/events). Lists community events from
 * Supabase with Upcoming / Past / Mine filters and going/interested RSVP.
 */
import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Icon from "../components/ui/Icon";
import { useUser, useAuthState } from "../context/AuthContext";
import { theme } from "../theme";
import { toastInfo, toastError, formatCompactNumber } from "../libs";
import {
  getEvents,
  getMyRsvps,
  toggleRsvp,
  type CommunityEvent,
  type RsvpStatus,
  type EventsFilter,
} from "../services/events.service";

const FILTERS: { key: EventsFilter; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "my", label: "Mine" },
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatEventDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const mm = m.toString().padStart(2, "0");
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()} · ${h}:${mm} ${ampm}`;
}

interface EventCardProps {
  event: CommunityEvent;
  rsvp?: RsvpStatus;
  onRsvp: (event: CommunityEvent, status: "going" | "interested") => void;
}

const EventCard: React.FC<EventCardProps> = ({ event, rsvp, onRsvp }) => {
  const going = rsvp === "going";
  const interested = rsvp === "interested";
  return (
    <View style={styles.card}>
      {event.cover_image_url ? (
        <Image source={event.cover_image_url} style={styles.cover} contentFit="cover" transition={150} />
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
            <Icon name="MapPin" size={13} color="#71717A" />
            <Text style={styles.locationText} numberOfLines={1}>{event.location}</Text>
          </View>
        )}

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{formatCompactNumber(event.going_count || 0)} going</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaText}>{formatCompactNumber(event.interested_count || 0)} interested</Text>
          {(event.gate_fee ?? 0) > 0 && (
            <>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.gateFee}>{event.gate_fee} DHB</Text>
            </>
          )}
        </View>

        <View style={styles.actions}>
          <Pressable
            style={[styles.rsvpBtn, going && styles.rsvpBtnActive]}
            onPress={() => onRsvp(event, "going")}
          >
            <Icon name="Check" size={14} color={going ? "#000000" : "#FFFFFF"} />
            <Text style={[styles.rsvpText, going && styles.rsvpTextActive]}>Going</Text>
          </Pressable>
          <Pressable
            style={[styles.rsvpBtn, interested && styles.rsvpBtnActive]}
            onPress={() => onRsvp(event, "interested")}
          >
            <Icon name="Star" size={14} color={interested ? "#000000" : "#FFFFFF"} />
            <Text style={[styles.rsvpText, interested && styles.rsvpTextActive]}>Interested</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
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
    onError: () => toastError("Could not update RSVP"),
  });

  const handleRsvp = useCallback(
    (event: CommunityEvent, status: "going" | "interested") => {
      if (!isSignedIn || !wallet) {
        toastInfo("Sign in to RSVP to events");
        return;
      }
      const current = myRsvps[event.id];
      // Tapping the active status again clears it, mirroring the web toggle.
      const next = current === status ? "remove" : status;
      rsvpMutation.mutate({ eventId: event.id, status: next });
    },
    [isSignedIn, wallet, myRsvps, rsvpMutation],
  );

  const keyExtractor = useCallback((e: CommunityEvent) => e.id, []);
  const renderItem = useCallback(
    ({ item }: { item: CommunityEvent }) => (
      <EventCard event={item} rsvp={myRsvps[item.id]} onRsvp={handleRsvp} />
    ),
    [myRsvps, handleRsvp],
  );

  const emptyLabel = useMemo(() => {
    if (filter === "my") return "You haven't created any events yet";
    if (filter === "past") return "No past events";
    return "No upcoming events";
  }, [filter]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Icon name="ArrowLeft" size={22} color="#FFFFFF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Events</Text>
          <Text style={styles.subtitle}>Discover and RSVP to community events</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Couldn't load events</Text>
          <Pressable onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 24, paddingTop: 4, gap: 12 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.colors.accentForeground} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Icon name="CalendarDays" size={44} color="#3F3F46" />
              <Text style={styles.emptyText}>{emptyLabel}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 12 },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { color: "#FFFFFF", fontSize: 21, fontWeight: "700" },
  subtitle: { color: "#71717A", fontSize: 12, marginTop: 1 },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingBottom: 10 },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  filterChipActive: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
  filterText: { color: "#A1A1AA", fontSize: 13, fontWeight: "600" },
  filterTextActive: { color: "#000000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 64 },
  emptyText: { color: "#71717A", fontSize: 13, marginTop: 12 },
  retryBtn: { marginTop: 14, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 12, backgroundColor: "#27272A" },
  retryText: { color: "#FAFAFA", fontSize: 13, fontWeight: "600" },
  card: {
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  cover: { width: "100%", height: 150, backgroundColor: "#18181B" },
  coverPlaceholder: { alignItems: "center", justifyContent: "center" },
  cardBody: { padding: 12, gap: 6 },
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
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  rsvpBtnActive: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
  rsvpText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  rsvpTextActive: { color: "#000000" },
});
