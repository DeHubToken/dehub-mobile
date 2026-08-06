import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
} from "react-native";
import Icon from "../ui/Icon";
import { copyToClipboard } from "../../libs";
import { toastError } from "../../libs/toast";
import {
  AFFILIATE_COMMISSION_PCT,
  buildInviteLink,
  buildInviteMessage,
  resolveInviteCode,
} from "../../libs/affiliate";
import { shareProfile } from "../../libs/misc";

interface Props {
  address?: string | null;
  shareName?: string | null;
  style?: ViewStyle;
}

/**
 * "Invite friends & earn" card. Resolves the wallet's stable affiliate code
 * from Supabase (creating it on first use) and shares the /r/{code} link via
 * the native share sheet. Used on the Earnings and Profile screens.
 */
const InviteFriendsCard: React.FC<Props> = ({ address, shareName, style }) => {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);

  const addr = (address || "").toLowerCase();

  useEffect(() => {
    let cancelled = false;
    if (!addr) return;
    setLoading(true);
    resolveInviteCode(addr, shareName)
      .then((c) => {
        if (!cancelled) setCode(c);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [addr, shareName]);

  const link = code ? buildInviteLink(code) : "";

  const onShare = useCallback(async () => {
    if (!addr) return;
    setSharing(true);
    try {
      const c = code || (await resolveInviteCode(addr, shareName));
      if (!c) {
        toastError("Could not load your invite link. Try again.");
        return;
      }
      if (!code) setCode(c);
      const l = buildInviteLink(c);
      await shareProfile(l, buildInviteMessage(c, l));
    } catch (e) {
      toastError(e, "Share failed");
    } finally {
      setSharing(false);
    }
  }, [addr, code, shareName]);

  if (!addr) return null;

  return (
    <View style={[styles.card, style]}>
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <Icon name="Gift" size={18} color="#D4D4D8" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Invite friends & earn {AFFILIATE_COMMISSION_PCT}%</Text>
          <Text style={styles.subtitle}>
            Share your link — earn {AFFILIATE_COMMISSION_PCT}% commission when they join and trade.
          </Text>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.codePill}
          activeOpacity={0.7}
          disabled={!link}
          onPress={() => link && copyToClipboard(link)}
          accessibilityLabel="Copy invite link"
        >
          {loading ? (
            <ActivityIndicator size="small" color="#8B8D90" />
          ) : (
            <>
              <Text style={styles.codeText} numberOfLines={1}>
                {code ? `dehub.io/r/${code}` : "Tap share to get your link"}
              </Text>
              {!!code && <Icon name="Copy" size={13} color="#8B8D90" />}
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.shareBtn}
          activeOpacity={0.85}
          onPress={onShare}
          disabled={sharing}
          accessibilityLabel="Share invite link"
        >
          {sharing ? (
            <ActivityIndicator size="small" color="#09090B" />
          ) : (
            <>
              <Icon name="Share2" size={15} color="#09090B" />
              <Text style={styles.shareText}>Share</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 14,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: "#F9FBFF", fontSize: 15, fontWeight: "700" },
  subtitle: { color: "#8B8D90", fontSize: 12, marginTop: 2, lineHeight: 16 },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  codePill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  codeText: { color: "#D4D6D9", fontSize: 12, flex: 1 },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#D4D4D8",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 44,
    minWidth: 96,
  },
  shareText: { color: "#09090B", fontSize: 14, fontWeight: "700" },
});

export default InviteFriendsCard;
