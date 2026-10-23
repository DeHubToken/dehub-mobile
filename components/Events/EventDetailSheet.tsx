/**
 * One event, opened from a card: port of dehubweb's EventDetailDrawer.
 *
 * Shows the cover (tap for full screen), date, place and details; Going /
 * Interested; who is coming; the event chat; and the share link. Gated events
 * take their entry fee as a fixed tip to the creator (recorded in
 * event_gate_payments like web), private events take access requests the
 * creator approves or denies here. The creator, or a community admin with the
 * manage events right, can edit or delete.
 */
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import Avatar from "../common/Avatar";
import { DhbCoin } from "../common/DhbCoin";
import GlassTipSheet from "../Tip/GlassTipSheet";
import EventChat from "./EventChat";
import EventFormSheet from "./EventFormSheet";
import { useThemeRootStyle } from "../../context/ThemeContext";
import { useAuthActions, useAuthState, useUser } from "../../context/AuthContext";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { useCommunityMembershipQuery } from "../../hooks/useCommunityAdmin";
import { resolvePermission } from "../../libs/community-permissions";
import { storageImageSource } from "../../libs/cdnImage";
import { getAvatarUrl } from "../../libs/misc";
import { appLocale } from "../../libs/date.util";
import { copyToClipboard } from "../../libs/clipboard.utils";
import { toastError, toastInfo, toastSuccess } from "../../libs/toast";
import { ShareLinks } from "../../navigation/linking.config";
import { getAccountSummaries } from "../../services/user.service";
import {
  deleteEvent,
  getEventRsvps,
  hasPaidEventGate,
  manageRsvp,
  recordEventGatePayment,
  toggleRsvp,
  type CommunityEvent,
  type EventRsvp,
} from "../../services/events.service";

const BASE_CHAIN_ID = 8453;

interface Props {
  event: CommunityEvent | null;
  visible: boolean;
  onClose: () => void;
}

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function EventDetailSheet({ event, visible, onClose }: Props) {
  const { t } = useTranslation();
  const rootStyle = useThemeRootStyle();
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const user = useUser() as any;
  const { isSignedIn } = useAuthState();
  const { requireAuth } = useAuthActions();
  const { showUserProfile } = useUserProfileSheet();
  const wallet: string | null = user?.walletAddress || user?.address || null;
  const me = wallet?.toLowerCase() ?? null;

  const [guestsType, setGuestsType] = useState<"going" | "interested" | null>(null);
  const [showFull, setShowFull] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [editing, setEditing] = useState(false);

  const eventId = event?.id;
  const { data: rsvps = [] } = useQuery({
    queryKey: ["event-rsvps", eventId],
    enabled: !!eventId && visible,
    queryFn: () => getEventRsvps(eventId!),
  });
  const hasFee = (event?.gate_fee ?? 0) > 0;
  const { data: hasPaid = false, isLoading: checkingPaid } = useQuery({
    queryKey: ["event-gate-paid", eventId, me],
    enabled: !!eventId && !!me && hasFee && visible,
    queryFn: () => hasPaidEventGate(eventId!, me!),
  });
  const { data: membership } = useCommunityMembershipQuery(event?.community_id ?? undefined);

  const myRsvp = useMemo(() => rsvps.find((r) => r.wallet_address.toLowerCase() === me), [rsvps, me]);
  const goingList = rsvps.filter((r) => r.status === "going" || r.status === "approved");
  const interestedList = rsvps.filter((r) => r.status === "interested");
  const pendingList = rsvps.filter((r) => r.status === "pending");

  const guestAddrs = (guestsType === "going" ? goingList : guestsType === "interested" ? interestedList : []).map(
    (r) => r.wallet_address,
  );
  const { data: guestProfiles = [] } = useQuery({
    queryKey: ["event-guests", eventId, guestsType, guestAddrs.length],
    enabled: guestAddrs.length > 0,
    queryFn: () => getAccountSummaries(guestAddrs.slice(0, 100)),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["event-rsvps", eventId] });
    queryClient.invalidateQueries({ queryKey: ["my-rsvps"] });
    queryClient.invalidateQueries({ queryKey: ["events"] });
  };

  const rsvpMutation = useMutation({
    mutationFn: (status: "going" | "interested" | "pending" | "remove") =>
      toggleRsvp(eventId!, status, wallet!),
    onSuccess: refresh,
    onError: () => toastError(t("events.rsvpFailed")),
  });
  const manageMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "approved" | "denied" }) => manageRsvp(id, status, wallet!),
    onSuccess: refresh,
    onError: (e) => toastError(e),
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteEvent(eventId!, wallet!),
    onSuccess: () => {
      toastSuccess(t("copy.5b7a1ac615bb", { defaultValue: "Event deleted" }));
      queryClient.invalidateQueries({ queryKey: ["events"] });
      onClose();
    },
    onError: (e) => toastError(e),
  });

  if (!event) return null;

  const isCreator = !!me && event.creator_wallet_address.toLowerCase() === me;
  const canModerate = isCreator || resolvePermission(null, membership ?? null, "manage_events");
  const isPrivate = !!event.is_private;
  const isGated = hasFee && !isCreator && !hasPaid;
  const status = myRsvp?.status;
  const isApproved = status === "approved" || status === "going";
  const isPending = status === "pending";
  const isDenied = status === "denied";
  const isPrivateBlocked = isPrivate && !isCreator && !isApproved;
  const canInteract = !isGated && !isPrivateBlocked;

  const needAuth = () => {
    if (isSignedIn && wallet) return false;
    requireAuth(() => {});
    return true;
  };

  const handleRsvp = (next: "going" | "interested") => {
    if (needAuth()) return;
    if (isGated) return toastInfo(t("events.payFeeToJoin"));
    if (isPrivateBlocked) return toastInfo(t("events.needApproval"));
    rsvpMutation.mutate(status === next ? "remove" : next);
  };

  const handleRequest = () => {
    if (needAuth()) return;
    if (isPending) rsvpMutation.mutate("remove");
    else rsvpMutation.mutate("pending", { onSuccess: () => toastSuccess(t("events.requestSent")) });
  };

  const start = new Date(event.starts_at);
  const lang = appLocale();
  const month = start.toLocaleDateString(lang, { month: "short" }).toUpperCase();
  const day = start.toLocaleDateString(lang, { day: "numeric" });
  const when =
    `${start.toLocaleDateString(lang, { weekday: "long", month: "long", day: "numeric" })} · ${start.toLocaleTimeString(lang, { hour: "numeric", minute: "2-digit" })}` +
    (event.ends_at ? ` – ${new Date(event.ends_at).toLocaleTimeString(lang, { hour: "numeric", minute: "2-digit" })}` : "");
  const link = ShareLinks.event(event.event_number);
  const creatorName = event.creator_username || short(event.creator_wallet_address);

  const share = () => {
    Share.share({ message: `${event.title}\n${link}` }).catch(() => {});
  };

  const statusLine = isApproved
    ? t("events.youreApproved")
    : isPending
      ? t("events.requestPending")
      : isDenied
        ? t("events.requestDenied")
        : t("events.requestAccessToAttend");

  const profileById = new Map(guestProfiles.map((p) => [p.address.toLowerCase(), p]));

  return (
    <>
      <GlassModal visible={visible} onClose={onClose} presentation="bottom" maxHeight="92%">
        <ScrollView style={rootStyle} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 28 }}>
          {!!event.cover_image_url && (
            <Pressable onPress={() => setShowFull(true)}>
              <Image source={storageImageSource(event.cover_image_url, width)} style={styles.cover} contentFit="cover" transition={150} />
              {isPrivate && (
                <View style={styles.privateBadge}>
                  <Icon name="Lock" size={11} color="#D4D4D8" />
                  <Text style={styles.privateBadgeText}>{t("events.private")}</Text>
                </View>
              )}
            </Pressable>
          )}

          <View style={styles.body}>
            <View style={styles.titleRow}>
              <View style={styles.dateBox}>
                <Text style={styles.dateMonth}>{month}</Text>
                <Text style={styles.dateDay}>{day}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.title}>{event.title}</Text>
                <View style={styles.metaRow}>
                  <Icon name="CalendarDays" size={13} color="#A1A1AA" />
                  <Text style={styles.meta}>{when}</Text>
                </View>
                {!!event.location && (
                  <View style={styles.metaRow}>
                    <Icon name="MapPin" size={13} color="#A1A1AA" />
                    <Text style={styles.meta}>{event.location}</Text>
                  </View>
                )}
              </View>
              <Pressable onPress={share} style={styles.iconBtn} accessibilityLabel={t("copy.29887a5ff984", { defaultValue: "Share" })}>
                <Icon name="Share2" size={16} color="#D4D4D8" />
              </Pressable>
              <Pressable onPress={onClose} style={styles.iconBtn} accessibilityLabel={t("events.cancel")}>
                <Icon name="X" size={16} color="#D4D4D8" />
              </Pressable>
            </View>

            {hasFee && (
              <View style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={styles.rowGap}>
                    <DhbCoin size={18} />
                    <Text style={styles.cardTitle}>{t("events.entryFeeCoins", { count: event.gate_fee })}</Text>
                  </View>
                  {isCreator ? (
                    <Text style={styles.faint}>{t("events.youAreCreator")}</Text>
                  ) : hasPaid ? (
                    <View style={styles.rowGap}>
                      <Icon name="CircleCheck" size={14} color="#4ADE80" />
                      <Text style={styles.okText}>{t("copy.93cb6b12aa06", { defaultValue: " Paid" }).trim()}</Text>
                    </View>
                  ) : (
                    <Pressable
                      style={[styles.primaryBtn, checkingPaid && { opacity: 0.5 }]}
                      disabled={checkingPaid}
                      onPress={() => !needAuth() && setShowPay(true)}
                    >
                      <Icon name="Lock" size={13} color="#000" />
                      <Text style={styles.primaryText}>{t("events.payToJoin")}</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            )}

            {isPrivate && !isCreator && (
              <View style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={[styles.rowGap, { flex: 1 }]}>
                    <Icon name="Lock" size={15} color="#A1A1AA" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{t("events.privateEvent")}</Text>
                      <Text style={styles.faint}>{statusLine}</Text>
                    </View>
                  </View>
                  {isApproved ? (
                    <View style={styles.rowGap}>
                      <Icon name="CircleCheck" size={14} color="#4ADE80" />
                      <Text style={styles.okText}>{t("copy.81cc1e80317c", { defaultValue: " Approved" }).trim()}</Text>
                    </View>
                  ) : isDenied ? (
                    <Text style={styles.badText}>{t("copy.68cc8e3eaed5", { defaultValue: " Denied" }).trim()}</Text>
                  ) : (
                    <Pressable
                      style={isPending ? styles.quietBtn : styles.primaryBtn}
                      disabled={rsvpMutation.isPending}
                      onPress={handleRequest}
                    >
                      {isPending && <Icon name="Clock" size={13} color="#D4D4D8" />}
                      <Text style={isPending ? styles.quietText : styles.primaryText}>
                        {isPending ? t("events.pending") : t("events.requestAccess")}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
            )}

            {isCreator && isPrivate && pendingList.length > 0 && (
              <View style={[styles.card, styles.pendingCard]}>
                <View style={styles.rowGap}>
                  <Icon name="Clock" size={14} color="#FBBF24" />
                  <Text style={styles.cardTitle}>
                    {t("copy.513ee42263bc", { defaultValue: "Pending Requests (" })}
                    {pendingList.length})
                  </Text>
                </View>
                {pendingList.map((r: EventRsvp) => (
                  <View key={r.id} style={[styles.cardRow, { paddingVertical: 6 }]}>
                    <Pressable style={[styles.rowGap, { flex: 1 }]} onPress={() => showUserProfile(r.wallet_address, { source: "event" })}>
                      <Avatar size={26} name={r.wallet_address.slice(2, 4)} />
                      <Text style={styles.meta}>{short(r.wallet_address)}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.smallIcon, { backgroundColor: "rgba(34,197,94,0.12)" }]}
                      onPress={() => manageMutation.mutate({ id: r.id, status: "approved" })}
                      accessibilityLabel={t("copy.81cc1e80317c", { defaultValue: " Approved" }).trim()}
                    >
                      <Icon name="UserCheck" size={14} color="#4ADE80" />
                    </Pressable>
                    <Pressable
                      style={[styles.smallIcon, { backgroundColor: "rgba(239,68,68,0.12)" }]}
                      onPress={() => manageMutation.mutate({ id: r.id, status: "denied" })}
                      accessibilityLabel={t("copy.68cc8e3eaed5", { defaultValue: " Denied" }).trim()}
                    >
                      <Icon name="UserMinus" size={14} color="#F87171" />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.rsvpRow}>
              {(["going", "interested"] as const).map((k) => {
                const active = status === k;
                return (
                  <Pressable
                    key={k}
                    onPress={() => handleRsvp(k)}
                    disabled={rsvpMutation.isPending}
                    style={[styles.rsvpBtn, active && styles.rsvpBtnActive, !canInteract && { opacity: 0.5 }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Icon name={k === "going" ? "CircleCheck" : "Flame"} size={15} color={active ? "#000" : "#fff"} />
                    <Text style={[styles.rsvpText, active && { color: "#000" }]}>
                      {k === "going"
                        ? t("events.goingWithCount", { count: goingList.length })
                        : t("events.interestedWithCount", { count: interestedList.length })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {!!event.description && (
              <View>
                <Text style={styles.section}>{t("events.details")}</Text>
                <Text style={styles.desc}>{event.description}</Text>
              </View>
            )}

            {(goingList.length > 0 || interestedList.length > 0) && (
              <View>
                <Text style={styles.section}>{t("events.guests")}</Text>
                <View style={[styles.rowGap, { gap: 16 }]}>
                  {(["going", "interested"] as const).map((k) => (
                    <Pressable key={k} style={styles.rowGap} onPress={() => setGuestsType(guestsType === k ? null : k)}>
                      <Icon name={k === "going" ? "Users" : "Flame"} size={13} color={guestsType === k ? "#fff" : "#A1A1AA"} />
                      <Text style={[styles.meta, guestsType === k && { color: "#fff" }]}>
                        {k === "going"
                          ? t("events.goingCount", { count: goingList.length })
                          : t("events.interestedCount", { count: interestedList.length })}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {!!guestsType && (
                  <View style={{ marginTop: 8, gap: 2 }}>
                    {guestAddrs.length === 0 ? (
                      <Text style={styles.faint}>{t("events.noOneYet")}</Text>
                    ) : (
                      guestAddrs.slice(0, 100).map((addr) => {
                        const p = profileById.get(addr.toLowerCase());
                        const name = p?.displayName || p?.username || short(addr);
                        return (
                          <Pressable
                            key={addr}
                            style={[styles.rowGap, { paddingVertical: 6 }]}
                            onPress={() => showUserProfile(p?.username || addr, { source: "event" })}
                          >
                            <Avatar uri={p?.avatarImageUrl ? getAvatarUrl(p.avatarImageUrl, 30) : undefined} name={name} size={30} />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.cardTitle} numberOfLines={1}>{name}</Text>
                              {!!p?.username && <Text style={styles.faint}>@{p.username}</Text>}
                            </View>
                          </Pressable>
                        );
                      })
                    )}
                  </View>
                )}
              </View>
            )}

            {canInteract ? (
              <EventChat eventId={event.id} />
            ) : (
              <View style={styles.locked}>
                <Icon name="Lock" size={18} color="#52525B" />
                <Text style={[styles.faint, { textAlign: "center" }]}>
                  {isGated
                    ? t("events.payFeeForChat")
                    : isPending
                      ? t("events.requestPendingReview")
                      : isDenied
                        ? t("events.requestWasDenied")
                        : t("events.requestAccessForChat")}
                </Text>
              </View>
            )}

            <View style={styles.footer}>
              <Pressable
                style={[styles.rowGap, { flex: 1 }]}
                onPress={() => showUserProfile(event.creator_username || event.creator_wallet_address, { source: "event" })}
              >
                <Avatar uri={event.creator_avatar ? getAvatarUrl(event.creator_avatar, 24) : undefined} name={creatorName} size={24} />
                <Text style={styles.faint} numberOfLines={1}>
                  {t("copy.b2742e6cae24", { defaultValue: "Created by " })}
                  <Text style={{ color: "#D4D4D8", fontWeight: "600" }}>{creatorName}</Text>
                </Text>
              </Pressable>
              {canModerate && (
                <>
                  {isCreator && (
                    <Pressable style={styles.footerBtn} onPress={() => setEditing(true)}>
                      <Icon name="Pencil" size={14} color="#A1A1AA" />
                      <Text style={styles.meta}>{t("events.edit")}</Text>
                    </Pressable>
                  )}
                  <Pressable style={styles.footerBtn} disabled={deleteMutation.isPending} onPress={() => deleteMutation.mutate()}>
                    {deleteMutation.isPending ? (
                      <ActivityIndicator size="small" color="#F87171" />
                    ) : (
                      <Icon name="Trash2" size={14} color="#F87171" />
                    )}
                    <Text style={styles.badText}>{t("events.delete")}</Text>
                  </Pressable>
                </>
              )}
            </View>
            <Pressable
              onPress={() => {
                copyToClipboard(link);
                toastSuccess(t("copy.d12860c21e78", { defaultValue: "Link copied" }));
              }}
              style={[styles.rowGap, { alignSelf: "center" }]}
            >
              <Icon name="Link" size={12} color="#71717A" />
              <Text style={styles.faint}>{t("copy.dbf362d4f210", { defaultValue: "Copy link" })}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </GlassModal>

      {isCreator && editing && (
        <EventFormSheet visible={editing} onClose={() => setEditing(false)} event={event} />
      )}

      {showPay && (
        <GlassTipSheet
          visible={showPay}
          onClose={() => setShowPay(false)}
          toAddress={event.creator_wallet_address}
          tokenId={0}
          tipContext="user"
          recipientName={creatorName}
          lockedAmount={event.gate_fee}
          onSuccess={(amount, txHash) => {
            setShowPay(false);
            if (!txHash || !wallet) return;
            recordEventGatePayment({
              eventId: event.id,
              payer: wallet,
              creator: event.creator_wallet_address,
              amount,
              txHash,
              chainId: BASE_CHAIN_ID,
            })
              .catch(() => {})
              .finally(() => queryClient.invalidateQueries({ queryKey: ["event-gate-paid", event.id] }));
          }}
        />
      )}

      <Modal visible={showFull && !!event.cover_image_url} transparent animationType="fade" onRequestClose={() => setShowFull(false)}>
        <Pressable style={styles.lightbox} onPress={() => setShowFull(false)}>
          {!!event.cover_image_url && (
            <Image source={storageImageSource(event.cover_image_url, width)} style={{ width: "92%", height: "80%" }} contentFit="contain" />
          )}
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  cover: { width: "100%", height: 190, backgroundColor: "#18181B" },
  privateBadge: { position: "absolute", top: 10, left: 10, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: "rgba(0,0,0,0.6)" },
  privateBadgeText: { color: "#D4D4D8", fontSize: 10, fontWeight: "600" },
  body: { padding: 16, gap: 16 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  dateBox: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignItems: "center" },
  dateMonth: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "700" },
  dateDay: { color: "#fff", fontSize: 20, fontWeight: "700" },
  title: { color: "#fff", fontSize: 18, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  meta: { color: "#A1A1AA", fontSize: 13, flexShrink: 1 },
  iconBtn: { padding: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)" },
  card: { borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.03)", padding: 12, gap: 6 },
  pendingCard: { borderColor: "rgba(245,158,11,0.25)", backgroundColor: "rgba(245,158,11,0.05)" },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  rowGap: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { color: "#fff", fontSize: 14, fontWeight: "600" },
  faint: { color: "#71717A", fontSize: 12 },
  okText: { color: "#4ADE80", fontSize: 12, fontWeight: "600" },
  badText: { color: "#F87171", fontSize: 12, fontWeight: "600" },
  primaryBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: "#fff" },
  primaryText: { color: "#000", fontSize: 13, fontWeight: "700" },
  quietBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  quietText: { color: "#D4D4D8", fontSize: 13, fontWeight: "600" },
  smallIcon: { padding: 7, borderRadius: 10 },
  rsvpRow: { flexDirection: "row", gap: 8 },
  rsvpBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  rsvpBtnActive: { backgroundColor: "#fff", borderColor: "#fff" },
  rsvpText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  section: { color: "#fff", fontSize: 14, fontWeight: "600", marginBottom: 6 },
  desc: { color: "#A1A1AA", fontSize: 14, lineHeight: 20 },
  locked: { alignItems: "center", gap: 8, paddingVertical: 20 },
  footer: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  footerBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10 },
  lightbox: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" },
});
