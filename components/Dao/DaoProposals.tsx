/**
 * DAO proposals on the DAO screen: buy offers and spend requests, accept /
 * reject voting by recorded contribution weight, and the propose sheet.
 * Port of web's dao/DaoProposals. Paying an accepted buy offer opens the web
 * page for that proposal, where the multi-chain payment flow lives.
 */
import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import GlassModal from "../ui/GlassModal";
import { KitButton, PageSection } from "../page/PageKit";
import { DhbCoin } from "../common/DhbCoin";
import { useAppTheme, useThemeRootStyle } from "../../context/ThemeContext";
import { useAuthActions, useAuthState, useUser } from "../../context/AuthContext";
import { useSurfaceDraft } from "../../hooks/useSurfaceDraft";
import { toastError, toastSuccess } from "../../libs/toast";
import { appLocale } from "../../libs/date.util";
import { openInApp } from "../../libs/links.utils";
import { parseAmountInput, sanitizeAmountInput } from "../../libs/amount-input";
import {
  effectiveDaoProposalStatus,
  useCreateDaoProposal,
  useDaoProposals,
  useVoteDaoProposal,
  type DaoProposal,
  type DaoProposalKind,
} from "../../hooks/useDaoProposals";

const num = (v: number) => new Intl.NumberFormat(appLocale(), { maximumFractionDigits: 4 }).format(v);
const usd = (v: number) => new Intl.NumberFormat(appLocale(), { style: "currency", currency: "USD" }).format(v);
const short = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

function deadline(iso: string, closed: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return closed;
  const hours = Math.ceil(ms / 3_600_000);
  const unit = hours < 48 ? "hour" : "day";
  const count = unit === "hour" ? hours : Math.ceil(hours / 24);
  try {
    return new Intl.RelativeTimeFormat(appLocale(), { numeric: "always", style: "short" }).format(count, unit);
  } catch {
    return `${count}${unit === "hour" ? "h" : "d"}`;
  }
}

// System Light needs darker inks: the pale greens and ambers vanish on white.
const STATUS_TONE_LIGHT: Record<string, { fg: string; bg: string }> = {
  good: { fg: "#047857", bg: "rgba(16,185,129,0.14)" },
  bad: { fg: "#BE123C", bg: "rgba(244,63,94,0.12)" },
  info: { fg: "#0369A1", bg: "rgba(14,165,233,0.12)" },
  open: { fg: "#92400E", bg: "rgba(245,158,11,0.16)" },
};
const STATUS_TONE: Record<string, { fg: string; bg: string }> = {
  good: { fg: "#6EE7B7", bg: "rgba(52,211,153,0.12)" },
  bad: { fg: "#FDA4AF", bg: "rgba(251,113,133,0.12)" },
  info: { fg: "#7DD3FC", bg: "rgba(56,189,248,0.12)" },
  open: { fg: "#FDE68A", bg: "rgba(251,191,36,0.12)" },
};

function ProposalCard({ proposal, ownVote, ownWeight }: { proposal: DaoProposal; ownVote?: 1 | -1; ownWeight: number }) {
  const { t } = useTranslation();
  const user = useUser() as any;
  const { isSignedIn } = useAuthState();
  const { requireAuth } = useAuthActions();
  const vote = useVoteDaoProposal();
  const { isLight } = useAppTheme() as { isLight?: boolean };
  const tones = isLight ? STATUS_TONE_LIGHT : STATUS_TONE;
  const status = effectiveDaoProposalStatus(proposal);
  const isOpen = status === "open";
  const cast = proposal.accept_dhb + proposal.reject_dhb;
  const acceptPct = cast > 0 ? (proposal.accept_dhb / cast) * 100 : 0;
  const quorumPct = proposal.electorate_dhb > 0 ? Math.min(100, (cast / proposal.electorate_dhb) * 100) : 0;
  const wallet = String(user?.walletAddress || user?.address || "").toLowerCase();
  const isBuyer = !!wallet && wallet === proposal.proposer_address.toLowerCase();

  const label =
    status === "payment_submitted"
      ? t("dao.paymentUnderReview", { defaultValue: "Payment under review" })
      : status === "accepted" && proposal.kind === "buy"
        ? t("dao.acceptedAwaitingPayment", { defaultValue: "Accepted · awaiting payment" })
        : t(`dao.status.${status}`, { defaultValue: status.charAt(0).toUpperCase() + status.slice(1) });
  const tone =
    status === "accepted" || status === "completed"
      ? tones.good
      : status === "rejected" || status === "expired" || status === "cancelled"
        ? tones.bad
        : status === "payment_submitted"
          ? tones.info
          : tones.open;

  const castVote = (type: 1 | -1) =>
    requireAuth(() =>
      vote.mutate(
        { proposalId: proposal.id, voteType: type },
        {
          onSuccess: (r) =>
            toastSuccess(
              r.action === "removed"
                ? t("dao.voteWithdrawn", { defaultValue: "Vote withdrawn" })
                : t("dao.voteRecorded", { defaultValue: "Vote recorded" }),
            ),
          onError: (e) => toastError(e, t("dao.voteFailed", { defaultValue: "Could not record vote" })),
        },
      ),
    );
  const noWeight = isSignedIn && ownWeight <= 0;

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.metaRow}>
            <Text style={styles.kind}>
              {proposal.kind === "buy"
                ? t("copy.07070fb32c93", { defaultValue: "Buy offer" })
                : t("copy.52a9fac889f1", { defaultValue: "Spend request" })}
            </Text>
            <View style={[styles.pill, { backgroundColor: tone.bg }]}>
              <Text style={[styles.pillText, { color: tone.fg }]}>{label}</Text>
            </View>
            {isOpen && (
              <View style={styles.metaRow}>
                <Icon name="Clock" size={11} color="#71717A" />
                <Text style={styles.faint}>{deadline(proposal.voting_ends_at, t("dao.votingClosed", { defaultValue: "Voting closed" }))}</Text>
              </View>
            )}
          </View>
          <Text style={styles.title}>{proposal.title}</Text>
          <Text style={styles.faint}>
            {t("copy.9155f2107df0", { defaultValue: "by " })}
            {proposal.proposer_username ? `@${proposal.proposer_username}` : short(proposal.proposer_address)}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          {proposal.kind === "buy" ? (
            <>
              <Text style={styles.amount}>
                {num(proposal.dhb_amount ?? 0)} <DhbCoin size={13} />
              </Text>
              <Text style={styles.faint}>
                {usd(proposal.total_usd ?? 0)} · ${num(proposal.price_usd ?? 0)}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.amount}>
                {num(proposal.spend_amount ?? 0)} {proposal.spend_asset}
              </Text>
              <Text style={styles.faint}>
                {t("copy.4b00b1b86bfd", { defaultValue: "to " })}
                {short(proposal.recipient_address ?? "")}
              </Text>
            </>
          )}
        </View>
      </View>

      {!!proposal.description && <Text style={styles.body}>{proposal.description}</Text>}

      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${acceptPct}%` }]} />
      </View>
      <View style={styles.tallyRow}>
        <Text style={[styles.accept, { color: tones.good.fg }]}>
          {t("copy.e1245cea2208", { defaultValue: "Accept " })}
          {num(proposal.accept_dhb)}
        </Text>
        <Text style={[styles.reject, { color: tones.bad.fg }]}>
          {t("copy.02b24c18771c", { defaultValue: "Reject " })}
          {num(proposal.reject_dhb)}
        </Text>
      </View>
      <Text style={styles.faint}>
        {num(quorumPct)}
        {t("copy.895bc4b96601", { defaultValue: "% participation · 10% quorum · contribution-weighted snapshot" })}
      </Text>

      {isOpen && (
        <View style={[styles.metaRow, { marginTop: 10, gap: 8 }]}>
          <Pressable
            onPress={() => castVote(1)}
            disabled={vote.isPending || noWeight}
            style={[styles.voteBtn, ownVote === 1 && styles.voteAccept, (vote.isPending || noWeight) && { opacity: 0.5 }]}
            accessibilityRole="button"
            accessibilityState={{ selected: ownVote === 1 }}
          >
            <Icon name="ThumbsUp" size={14} color="#fff" />
            <Text style={styles.voteText}>{t("copy.b50104341b2b", { defaultValue: " Accept" }).trim()}</Text>
          </Pressable>
          <Pressable
            onPress={() => castVote(-1)}
            disabled={vote.isPending || noWeight}
            style={[styles.voteBtn, ownVote === -1 && styles.voteReject, (vote.isPending || noWeight) && { opacity: 0.5 }]}
            accessibilityRole="button"
            accessibilityState={{ selected: ownVote === -1 }}
          >
            <Icon name="ThumbsDown" size={14} color="#fff" />
            <Text style={styles.voteText}>{t("copy.90cdcff9db62", { defaultValue: " Reject" }).trim()}</Text>
          </Pressable>
          {isSignedIn && ownWeight > 0 && (
            <Text style={[styles.faint, { marginLeft: "auto" }]}>
              {t("copy.c4c2179c3053", { defaultValue: "Your weight: " })}
              {num(ownWeight)}
            </Text>
          )}
        </View>
      )}
      {isOpen && noWeight && (
        <Text style={[styles.faint, { marginTop: 8 }]}>
          {t("copy.f3c6dcdb78a4", { defaultValue: "Only contributors captured when this proposal opened can vote." })}
        </Text>
      )}

      {proposal.status === "accepted" && proposal.kind === "buy" && isBuyer && (
        <KitButton
          label={t("copy.a4f6b2e41037", { defaultValue: " Transfer payment" }).trim()}
          onPress={() => openInApp(`https://dehub.io/app/dao?proposal=${proposal.id}`)}
          style={{ marginTop: 12 }}
        />
      )}
      {!!proposal.payment_tx_hash && (
        <View style={styles.proof}>
          <Icon name="Check" size={14} color="#BAE6FD" />
          <Text style={styles.proofText}>
            {t("copy.4c6c7de71386", { defaultValue: " Payment proof submitted for manual DAO verification" }).trim()}
          </Text>
        </View>
      )}
    </View>
  );
}

export function ProposeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const rootStyle = useThemeRootStyle();
  const create = useCreateDaoProposal();
  const [kind, setKind] = useState<DaoProposalKind>("buy");
  const [title, setTitle] = useSurfaceDraft("components/Dao/DaoProposals.tsx:title", "", "dao");
  const [description, setDescription] = useSurfaceDraft("components/Dao/DaoProposals.tsx:description", "", "dao");
  const [dhbAmount, setDhbAmount] = useSurfaceDraft("components/Dao/DaoProposals.tsx:dhbAmount", "", "dao");
  const [priceUsd, setPriceUsd] = useSurfaceDraft("components/Dao/DaoProposals.tsx:priceUsd", "", "dao");
  const [spendAsset, setSpendAsset] = useSurfaceDraft("components/Dao/DaoProposals.tsx:spendAsset", "USDC", "dao");
  const [spendAmount, setSpendAmount] = useSurfaceDraft("components/Dao/DaoProposals.tsx:spendAmount", "", "dao");
  const [recipient, setRecipient] = useSurfaceDraft("components/Dao/DaoProposals.tsx:recipient", "", "dao");

  const dhb = parseAmountInput(dhbAmount);
  const price = parseAmountInput(priceUsd);
  const spend = parseAmountInput(spendAmount);
  const total = dhb * price;
  const buyValid = dhb > 0 && price > 0;
  const spendValid = spend > 0 && !!spendAsset.trim() && !!recipient.trim();
  const valid = !!title.trim() && !!description.trim() && (kind === "buy" ? buyValid : spendValid);

  const submit = () => {
    if (!valid) return;
    create.mutate(
      {
        kind,
        title,
        description,
        ...(kind === "buy"
          ? { dhbAmount: dhb, priceUsd: price }
          : { spendAsset, spendAmount: spend, recipientAddress: recipient.trim() }),
      },
      {
        onSuccess: () => {
          toastSuccess(t("copy.ebf6fba25211", { defaultValue: "Proposal opened for seven days" }));
          setTitle.complete(title, "");
          setDescription.complete(description, "");
          setDhbAmount.complete(dhbAmount, "");
          setPriceUsd.complete(priceUsd, "");
          setSpendAmount.complete(spendAmount, "");
          setRecipient.complete(recipient, "");
          onClose();
        },
        onError: (e) => toastError(e),
      },
    );
  };

  const field = (value: string, onChange: (v: string) => void, placeholder: string, opts: { numeric?: boolean; multiline?: boolean; mono?: boolean; max?: number } = {}) => (
    <TextInput
      value={value}
      onChangeText={opts.numeric ? (v) => onChange(sanitizeAmountInput(v)) : onChange}
      placeholder={placeholder}
      placeholderTextColor="#71717A"
      keyboardType={opts.numeric ? "decimal-pad" : "default"}
      multiline={opts.multiline}
      maxLength={opts.max}
      autoCapitalize={opts.mono ? "none" : "sentences"}
      autoCorrect={!opts.mono}
      style={[styles.input, opts.multiline && { minHeight: 90, textAlignVertical: "top" }, opts.mono && styles.mono]}
    />
  );

  const kindCard = (k: DaoProposalKind, icon: "ShoppingCart" | "Send", head: string, sub: string) => (
    <Pressable
      onPress={() => setKind(k)}
      style={[styles.kindCard, kind === k && styles.kindCardActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: kind === k }}
    >
      <Icon name={icon} size={16} color="#D4D4D8" />
      <Text style={styles.kindHead}>{head}</Text>
      <Text style={styles.faint}>{sub}</Text>
    </Pressable>
  );

  return (
    <GlassModal scrollable visible={visible} onClose={() => !create.isPending && onClose()} presentation="bottom" maxHeight="88%">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[{ padding: 18, gap: 12 }, rootStyle]}>
          <Text style={styles.sheetTitle}>{t("copy.3d08de9152fe", { defaultValue: "Propose to the DAO" })}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {kindCard("buy", "ShoppingCart", t("dao.offerToBuyTokens"), t("copy.6cf2865295e4", { defaultValue: "Name your quantity and price" }))}
            {kindCard("spend", "Send", t("copy.7ba3d14233b1", { defaultValue: "Request a spend" }), t("copy.52c6b1284570", { defaultValue: "Ask the DAO to send an asset" }))}
          </View>

          <Text style={styles.label}>{t("copy.7e8cd2056da7", { defaultValue: "Title" })}</Text>
          {field(title, setTitle, t("copy.69013bafaace", { defaultValue: "What are contributors deciding?" }), { max: 160 })}
          <Text style={styles.label}>{t("copy.45989de49fb7", { defaultValue: "Details" })}</Text>
          {field(description, setDescription, t("copy.9c7eca1df4f3", { defaultValue: "Explain the terms and why the DAO should accept." }), { multiline: true, max: 4000 })}

          {kind === "buy" ? (
            <>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={styles.label}>{t("dao.tokenAmount")}</Text>
                  {field(dhbAmount, setDhbAmount, "1000000", { numeric: true })}
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={styles.label}>{t("dao.pricePerTokenUsd")}</Text>
                  {field(priceUsd, setPriceUsd, "0.001", { numeric: true })}
                </View>
              </View>
              <View style={styles.totalBox}>
                <Text style={styles.faint}>{t("copy.700f18a93687", { defaultValue: "Offer value" })}</Text>
                <Text style={styles.total}>{usd(Number.isFinite(total) ? total : 0)}</Text>
                <Text style={styles.faint}>
                  {t("copy.4be2a5e0d00a", { defaultValue: "No escrow. If accepted, you have 72 hours to transfer payment for manual DAO verification." })}
                </Text>
              </View>
            </>
          ) : (
            <>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={styles.label}>{t("copy.80d298c9f240", { defaultValue: "Asset" })}</Text>
                  {field(spendAsset, (v) => setSpendAsset(v.toUpperCase()), "USDC", { max: 16, mono: true })}
                </View>
                <View style={{ flex: 2, gap: 6 }}>
                  <Text style={styles.label}>{t("copy.49e96d7cdf58", { defaultValue: "Amount" })}</Text>
                  {field(spendAmount, setSpendAmount, "5000", { numeric: true })}
                </View>
              </View>
              <Text style={styles.label}>{t("copy.454d03911271", { defaultValue: "Recipient address" })}</Text>
              {field(recipient, setRecipient, t("copy.9e6d88cbe11c", { defaultValue: "0x… or Solana address" }), { mono: true })}
              <Text style={styles.faint}>
                {t("copy.b8cfe281c012", { defaultValue: "An accepted spend is queued for manual DAO or multisig execution. This proposal never moves funds itself." })}
              </Text>
            </>
          )}

          <View style={styles.note}>
            <Text style={styles.faint}>{t("dao.votingPowerNote")}</Text>
          </View>

          <Pressable onPress={submit} disabled={!valid || create.isPending} style={[styles.submit, (!valid || create.isPending) && { opacity: 0.5 }]}>
            {create.isPending && <ActivityIndicator size="small" color="#000" />}
            <Text style={styles.submitText}>
              {create.isPending
                ? t("copy.d0be237244fa", { defaultValue: "Opening proposal…" })
                : t("copy.61cbb6454002", { defaultValue: "Open proposal" })}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </GlassModal>
  );
}

export default function DaoProposals() {
  const { t } = useTranslation();
  const { requireAuth } = useAuthActions();
  const { proposals, myVotes, myEligibility, isLoading, isError } = useDaoProposals();
  const [proposeOpen, setProposeOpen] = useState(false);

  return (
    <>
      <PageSection
        title={t("copy.554f86eedd6d", { defaultValue: "DAO proposals" })}
        action={<KitButton variant="quiet" label={t("copy.1cbd9e713d93", { defaultValue: "Propose" })} onPress={() => requireAuth(() => setProposeOpen(true))} />}
      >
        <Text style={[styles.faint, { marginBottom: 10 }]}>
          {t("copy.37bd766fa812", { defaultValue: "Anyone can propose. Contributors accept or reject with their recorded contribution weight." })}
        </Text>
        {isLoading ? (
          <View style={{ paddingVertical: 24, alignItems: "center" }}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : isError ? (
          <Text style={[styles.reject, { textAlign: "center", paddingVertical: 20 }]}>
            {t("copy.794c8cef5f67", { defaultValue: "Could not load DAO proposals." })}
          </Text>
        ) : proposals.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 20, gap: 4 }}>
            <Icon name="ShoppingCart" size={22} color="#52525B" />
            <Text style={styles.body}>{t("copy.1f5440e72187", { defaultValue: "No proposals yet" })}</Text>
            <Text style={styles.faint}>{t("copy.7d524ee72c64", { defaultValue: "Open the first buy offer or spending request." })}</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {proposals.map((p) => (
              <ProposalCard key={p.id} proposal={p} ownVote={myVotes[p.id]} ownWeight={myEligibility[p.id] ?? 0} />
            ))}
          </View>
        )}
      </PageSection>
      <ProposeSheet visible={proposeOpen} onClose={() => setProposeOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.03)", padding: 14 },
  cardTop: { flexDirection: "row", gap: 10 },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  kind: { color: "#A1A1AA", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6 },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 11, fontWeight: "600" },
  title: { color: "#FFFFFF", fontSize: 15, fontWeight: "600", marginTop: 6 },
  amount: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  body: { color: "#D4D4D8", fontSize: 13, lineHeight: 19, marginTop: 10 },
  faint: { color: "#71717A", fontSize: 11, lineHeight: 15 },
  bar: { height: 8, borderRadius: 4, backgroundColor: "rgba(251,113,133,0.2)", overflow: "hidden", marginTop: 12 },
  barFill: { height: "100%", backgroundColor: "#34D399" },
  tallyRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, marginBottom: 2 },
  accept: { color: "#6EE7B7", fontSize: 12 },
  reject: { color: "#FDA4AF", fontSize: 12 },
  voteBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  voteAccept: { backgroundColor: "#059669", borderColor: "#059669" },
  voteReject: { backgroundColor: "#E11D48", borderColor: "#E11D48" },
  voteText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  proof: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, padding: 10, borderRadius: 12, backgroundColor: "rgba(56,189,248,0.08)" },
  proofText: { color: "#E0F2FE", fontSize: 12, flex: 1 },
  sheetTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  kindCard: { flex: 1, gap: 4, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.03)" },
  kindCardActive: { borderColor: "rgba(255,255,255,0.3)", backgroundColor: "rgba(255,255,255,0.1)" },
  kindHead: { color: "#FFFFFF", fontSize: 13, fontWeight: "600", marginTop: 4 },
  label: { color: "#A1A1AA", fontSize: 12 },
  input: { color: "#FFFFFF", fontSize: 14, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.05)", paddingHorizontal: 12, paddingVertical: 10 },
  mono: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 13 },
  totalBox: { borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)", padding: 14, gap: 4 },
  total: { color: "#FFFFFF", fontSize: 22, fontWeight: "700" },
  note: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", padding: 10 },
  submit: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 14, backgroundColor: "#FFFFFF" },
  submitText: { color: "#000000", fontSize: 14, fontWeight: "700" },
});
