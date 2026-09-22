/**
 * OffersPanel
 * ===========
 * Bids for the handle you are wearing, and bids you have made for other
 * people's.
 *
 * Beyond listing rows this screen has one job, and it is a copy job: at every
 * step it has to say what has **not** happened yet. An offer takes no money.
 * Accepting one takes no money and moves no handle — it holds your name for
 * one buyer until they pay, and you can take that back. Every state here that
 * looks like a completed trade is actually a promise, and a reader who thinks
 * otherwise will either spend a name they still own or wait for DHB that was
 * never sent.
 *
 * Paying for an accepted offer reuses the ordinary buy sheet. An accepted
 * offer is a listing reserved for one address, so there is nothing to build:
 * the row is shaped into the listing it already is and handed over, which also
 * means the buyer gets the same "you are giving up your current handle"
 * warning a shop-window purchase gives them.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { DhbCoin } from "../common/DhbCoin";
import { DeHubLoader } from "../DeHubLoader";
import { useMyUsernameMarket, useUsernameMarketConfig } from "../../hooks/useUsernameMarket";
import {
  useAcceptUsernameOffer,
  useDeclineUsernameOffer,
  useMyUsernameOffers,
  useWithdrawUsernameOffer,
} from "../../hooks/useUsernameOffers";
import type { UsernameOffer } from "../../services/username-offers.service";
import type { UsernameListing } from "../../services/username-market.service";
import BuyUsernameSheet from "./BuyUsernameSheet";

interface Props {
  isAuthed: boolean;
  onSignIn: () => void;
}

/** Still actionable by somebody. Everything else is history. */
function isLive(offer: UsernameOffer) {
  return offer.status === "pending" || offer.status === "accepted";
}

/**
 * An accepted offer, shaped into the listing it already is on the server.
 *
 * Not a fake: `listingId` names a real reserved listing, and the buy sheet
 * re-quotes it from the server before anybody can pay. The fields here are
 * only what the sheet renders while that quote is in flight.
 */
function asListing(offer: UsernameOffer): UsernameListing | null {
  if (!offer.listingId) return null;
  return {
    id: offer.listingId,
    username: offer.username,
    priceDhb: offer.priceDhb,
    priceUsd: offer.priceUsd,
    description: null,
    length: offer.username.length,
    isNumeric: /^[0-9]+$/.test(offer.username),
    seller: {
      address: offer.ownerAddress,
      displayName: offer.counterparty?.displayName ?? null,
      avatarUrl: offer.counterparty?.avatarUrl ?? null,
      badgeBalance: offer.counterparty?.badgeBalance ?? 0,
    },
    createdAt: offer.createdAt,
  } as UsernameListing;
}

/**
 * "in 6 days", in the reader's own language.
 *
 * `Intl.RelativeTimeFormat` rather than a hand-rolled table because this app
 * ships in 110 locales and a bespoke "d/h/m" is only ever right in one.
 */
function relative(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms)) return "";
  const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const days = Math.round(ms / 86_400_000);
  if (Math.abs(days) >= 1) return fmt.format(days, "day");
  const hours = Math.round(ms / 3_600_000);
  if (Math.abs(hours) >= 1) return fmt.format(hours, "hour");
  return fmt.format(Math.round(ms / 60_000), "minute");
}

function who(offer: UsernameOffer): string {
  const name = offer.counterparty?.username || offer.counterparty?.displayName;
  if (name) return `@${name}`;
  const address = offer.counterparty?.address || "";
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
}

function Money({ offer }: { offer: UsernameOffer }) {
  return (
    <View style={styles.money}>
      <Text style={styles.moneyUsd}>
        ${offer.priceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </Text>
      <View style={styles.moneyDhb}>
        <DhbCoin size={11} />
        <Text style={styles.moneyDhbText}>
          {offer.priceDhb.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </Text>
      </View>
    </View>
  );
}

// ── Incoming ────────────────────────────────────────────────────────────────

function IncomingRow({ offer }: { offer: UsernameOffer }) {
  const { t } = useTranslation();
  const { data: config } = useUsernameMarketConfig();
  const { data: mine } = useMyUsernameMarket(true);
  const accept = useAcceptUsernameOffer();
  const decline = useDeclineUsernameOffer();

  const [answering, setAnswering] = useState(false);
  const [replacement, setReplacement] = useState("");

  const replacementValid =
    /^[a-z0-9_-]{1,30}$/.test(replacement.trim().toLowerCase()) &&
    replacement.trim().toLowerCase() !== offer.username;

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.grow}>
          <Text style={styles.handle}>
            <Text style={styles.at}>@</Text>
            {offer.username}
          </Text>
          <Text style={styles.meta}>
            {who(offer)} · {t("usernames.offerExpires", { when: relative(offer.expiresAt) })}
          </Text>
        </View>
        <Money offer={offer} />
      </View>

      {!!offer.message && <Text style={styles.message}>{offer.message}</Text>}

      {offer.status === "accepted" ? (
        <View style={styles.block}>
          {/* The single most misreadable state here: the owner has said yes,
              still holds the handle, and is owed nothing until the buyer pays.
              Said plainly rather than as a status chip. */}
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              {t("usernames.acceptedAwaitingPayment", { handle: offer.replacementUsername || "" })}
            </Text>
          </View>
          <Pressable
            style={[styles.secondaryBtn, decline.isPending && styles.disabled]}
            disabled={decline.isPending}
            onPress={() => decline.mutate(offer.id)}
          >
            {decline.isPending ? (
              <ActivityIndicator size="small" color="#F4F4F5" />
            ) : (
              <Icon name="X" size={15} color="#F4F4F5" />
            )}
            <Text style={styles.secondaryBtnText}>{t("usernames.withdrawAcceptance")}</Text>
          </Pressable>
        </View>
      ) : answering ? (
        <View style={styles.block}>
          <Text style={styles.fieldLabel}>{t("usernames.newHandleWhenSold")}</Text>
          <View style={styles.inputRow}>
            <Text style={styles.inputPrefix}>@</Text>
            <TextInput
              value={replacement}
              onChangeText={(v) => setReplacement(v.replace(/[^A-Za-z0-9_-]/g, "").toLowerCase())}
              placeholder={`${mine?.currentUsername || offer.username}_2`.slice(0, 30)}
              placeholderTextColor="#8B8D90"
              maxLength={config?.usernameMaxLength ?? 30}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              style={styles.inputInline}
            />
          </View>
          <Text style={styles.hint}>{t("usernames.acceptMovesNothingYet")}</Text>
          <View style={styles.actions}>
            <Pressable
              style={[
                styles.primaryBtn,
                styles.grow,
                (!replacementValid || accept.isPending) && styles.disabled,
              ]}
              disabled={!replacementValid || accept.isPending}
              onPress={() =>
                accept.mutate({
                  offerId: offer.id,
                  replacementUsername: replacement.trim().toLowerCase(),
                })
              }
            >
              {accept.isPending && <ActivityIndicator size="small" color="#09090B" />}
              <Text style={styles.primaryBtnText}>{t("usernames.confirmAccept")}</Text>
            </Pressable>
            <Pressable style={styles.ghostBtn} onPress={() => setAnswering(false)}>
              <Text style={styles.ghostBtnText}>{t("usernames.cancel")}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          <Pressable style={[styles.primaryBtn, styles.grow]} onPress={() => setAnswering(true)}>
            <Icon name="Check" size={15} color="#09090B" />
            <Text style={styles.primaryBtnText}>{t("usernames.acceptOffer")}</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryBtn, styles.grow, decline.isPending && styles.disabled]}
            disabled={decline.isPending}
            onPress={() => decline.mutate(offer.id)}
          >
            {decline.isPending ? (
              <ActivityIndicator size="small" color="#F4F4F5" />
            ) : (
              <Icon name="X" size={15} color="#F4F4F5" />
            )}
            <Text style={styles.secondaryBtnText}>{t("usernames.declineOffer")}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ── Outgoing ────────────────────────────────────────────────────────────────

function OutgoingRow({ offer, onPay }: { offer: UsernameOffer; onPay: () => void }) {
  const { t } = useTranslation();
  const withdraw = useWithdrawUsernameOffer();

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.grow}>
          <Text style={styles.handle}>
            <Text style={styles.at}>@</Text>
            {offer.username}
          </Text>
          <Text style={styles.meta}>
            {offer.status === "accepted"
              ? t("usernames.payBefore", { when: relative(offer.expiresAt) })
              : t("usernames.awaitingOwner")}
          </Text>
        </View>
        <Money offer={offer} />
      </View>

      {offer.status === "accepted" && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{t("usernames.offerAcceptedPayNow")}</Text>
        </View>
      )}

      <View style={styles.actions}>
        {offer.status === "accepted" && (
          <Pressable style={[styles.primaryBtn, styles.grow]} onPress={onPay}>
            <Text style={styles.primaryBtnText}>{t("usernames.payAndClaim")}</Text>
          </Pressable>
        )}
        <Pressable
          style={[
            styles.secondaryBtn,
            offer.status !== "accepted" && styles.grow,
            withdraw.isPending && styles.disabled,
          ]}
          disabled={withdraw.isPending}
          onPress={() => withdraw.mutate(offer.id)}
        >
          {withdraw.isPending ? (
            <ActivityIndicator size="small" color="#F4F4F5" />
          ) : (
            <Icon name="Trash2" size={15} color="#F4F4F5" />
          )}
          <Text style={styles.secondaryBtnText}>{t("usernames.withdrawOffer")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PastRow({ offer }: { offer: UsernameOffer }) {
  const { t } = useTranslation();
  return (
    <View style={styles.pastRow}>
      <View style={styles.grow}>
        <Text style={styles.pastHandle}>
          <Text style={styles.at}>@</Text>
          {offer.username}
        </Text>
        <Text style={styles.meta}>{t(`usernames.offerStatus.${offer.status}`)}</Text>
      </View>
      <Text style={styles.meta}>
        ${offer.priceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </Text>
    </View>
  );
}

// ── Panel ───────────────────────────────────────────────────────────────────

const OffersPanel: React.FC<Props> = ({ isAuthed, onSignIn }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useMyUsernameOffers(isAuthed);
  const [paying, setPaying] = useState<UsernameListing | null>(null);

  if (!isAuthed) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>{t("usernames.signInForOffers")}</Text>
        <Pressable style={styles.primaryBtn} onPress={onSignIn}>
          <Text style={styles.primaryBtnText}>{t("usernames.signIn")}</Text>
        </Pressable>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <DeHubLoader size={56} />
      </View>
    );
  }

  const incoming = (data?.incoming ?? []).filter(isLive);
  const outgoing = (data?.outgoing ?? []).filter(isLive);
  const past = [...(data?.incoming ?? []), ...(data?.outgoing ?? [])].filter((o) => !isLive(o));

  return (
    <>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 96 }]}
      >
        <Text style={styles.sectionTitle}>{t("usernames.offersForYou")}</Text>
        {incoming.length === 0 ? (
          <Text style={styles.empty}>{t("usernames.noIncomingOffers")}</Text>
        ) : (
          incoming.map((offer) => <IncomingRow key={offer.id} offer={offer} />)
        )}

        <Text style={styles.sectionTitle}>{t("usernames.offersYouMade")}</Text>
        {outgoing.length === 0 ? (
          <Text style={styles.empty}>{t("usernames.noOutgoingOffers")}</Text>
        ) : (
          outgoing.map((offer) => (
            <OutgoingRow key={offer.id} offer={offer} onPay={() => setPaying(asListing(offer))} />
          ))
        )}

        {past.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>{t("usernames.offerHistory")}</Text>
            {past.map((offer) => (
              <PastRow key={offer.id} offer={offer} />
            ))}
          </>
        )}
      </ScrollView>

      <BuyUsernameSheet
        listing={paying}
        visible={!!paying}
        onClose={() => setPaying(null)}
        isAuthed={isAuthed}
        onSignIn={onSignIn}
      />
    </>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 16, gap: 10 },

  center: { alignItems: "center", justifyContent: "center", paddingVertical: 56, gap: 14 },
  emptyText: { color: "#A1A1AA", fontSize: 13, textAlign: "center", paddingHorizontal: 32 },

  sectionTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", marginTop: 10 },
  empty: {
    color: "#808089",
    fontSize: 11.5,
    lineHeight: 17,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },

  card: {
    borderRadius: 14,
    padding: 14,
    gap: 11,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  grow: { flex: 1 },
  handle: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  pastHandle: { color: "#D4D4D8", fontSize: 14 },
  at: { color: "#808089" },
  meta: { color: "#808089", fontSize: 11, lineHeight: 16, marginTop: 2 },
  message: {
    color: "#D4D4D8",
    fontSize: 12,
    lineHeight: 18,
    padding: 9,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.40)",
  },

  money: { alignItems: "flex-end" },
  moneyUsd: { color: "#FFFFFF", fontSize: 14.5, fontWeight: "700" },
  moneyDhb: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  moneyDhbText: { color: "#808089", fontSize: 11 },

  block: { gap: 9 },
  notice: {
    padding: 11,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
  },
  noticeText: { color: "#D4D4D8", fontSize: 11.5, lineHeight: 17 },

  fieldLabel: { color: "#808089", fontSize: 11, fontWeight: "600" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  inputPrefix: { color: "#808089", fontSize: 14 },
  inputInline: { flex: 1, color: "#FFFFFF", fontSize: 14, paddingVertical: 10, paddingLeft: 2 },
  hint: { color: "#808089", fontSize: 11, lineHeight: 16 },

  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  disabled: { opacity: 0.45 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: "#F4F4F5",
  },
  // The accent is near-white; its foreground has to be the near-black.
  primaryBtnText: { color: "#09090B", fontSize: 14, fontWeight: "700" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  secondaryBtnText: { color: "#F4F4F5", fontSize: 14, fontWeight: "600" },
  ghostBtn: { paddingVertical: 12, paddingHorizontal: 14 },
  ghostBtnText: { color: "#A1A1AA", fontSize: 14, fontWeight: "600" },

  pastRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
});

export default OffersPanel;
