/**
 * A community's Events tab, port of dehubweb's communities/CommunityEvents:
 * upcoming then past events of this community, a Create Event button for
 * members with the create events right, and the event sheet on tap.
 */
import React, { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View, type ListRenderItem } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import Icon from "../ui/Icon";
import { DeHubLoader } from "../DeHubLoader";
import { PageEmpty } from "../page/PageKit";
import { EventCard } from "../../screens/EventsScreen";
import EventDetailSheet from "./EventDetailSheet";
import EventFormSheet from "./EventFormSheet";
import { useAuthActions } from "../../context/AuthContext";
import { getCommunityEvents, type CommunityEvent } from "../../services/events.service";

type Row = { kind: "head"; label: string } | { kind: "event"; event: CommunityEvent };

interface Props {
  communityId: string;
  canCreate: boolean;
  listHeader?: React.ReactElement;
  refreshControl?: React.ReactElement<any>;
}

export default function CommunityEventsTab({ communityId, canCreate, listHeader, refreshControl }: Props) {
  const { t } = useTranslation();
  const { requireAuth } = useAuthActions();
  const [open, setOpen] = useState<CommunityEvent | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["community-events", communityId],
    queryFn: () => getCommunityEvents(communityId),
  });

  const rows = useMemo<Row[]>(() => {
    const now = Date.now();
    const upcoming = events.filter((e) => new Date(e.starts_at).getTime() >= now);
    const past = events.filter((e) => new Date(e.starts_at).getTime() < now).reverse();
    const out: Row[] = [];
    if (upcoming.length) {
      out.push({ kind: "head", label: t("copy.5f1a2542e4e4", { defaultValue: "Upcoming" }) });
      upcoming.forEach((event) => out.push({ kind: "event", event }));
    }
    if (past.length) {
      out.push({ kind: "head", label: t("copy.ca1530e8d701", { defaultValue: "Past" }) });
      past.forEach((event) => out.push({ kind: "event", event }));
    }
    return out;
  }, [events, t]);

  const renderItem: ListRenderItem<Row> = ({ item }) =>
    item.kind === "head" ? (
      <Text style={styles.head}>{item.label.toUpperCase()}</Text>
    ) : (
      // RSVP happens in the sheet here, where privacy and fees are handled.
      <EventCard event={item.event} onOpen={setOpen} onRsvp={(e) => setOpen(e)} />
    );

  return (
    <>
      <FlatList
        style={{ flex: 1 }}
        data={rows}
        keyExtractor={(r, i) => (r.kind === "event" ? r.event.id : `h-${i}`)}
        renderItem={renderItem}
        refreshControl={refreshControl}
        contentContainerStyle={{ paddingBottom: 80 }}
        ListHeaderComponent={
          <>
            {listHeader}
            {canCreate && (
              <Pressable style={styles.create} onPress={() => requireAuth(() => setCreateOpen(true))} accessibilityRole="button">
                <Icon name="Plus" size={15} color="#fff" />
                <Text style={styles.createText}>{t("copy.7a9f7d429145", { defaultValue: "Create Event" })}</Text>
              </Pressable>
            )}
          </>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <DeHubLoader size={44} />
            </View>
          ) : (
            <PageEmpty
              icon="events"
              title={t("copy.de54ef8dc9c2", { defaultValue: "No events yet" })}
              body={t("copy.008ad4d946bb", { defaultValue: "Community events will appear here." })}
            />
          )
        }
      />
      <EventDetailSheet event={open} visible={!!open} onClose={() => setOpen(null)} />
      {createOpen && (
        <EventFormSheet visible={createOpen} onClose={() => setCreateOpen(false)} communityId={communityId} onCreated={setOpen} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  head: { color: "#71717A", fontSize: 11, fontWeight: "600", letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  create: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginHorizontal: 16, marginTop: 12, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  createText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
