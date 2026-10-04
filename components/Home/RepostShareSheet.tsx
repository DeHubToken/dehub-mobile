import React, { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Pressable, Share, StyleSheet, Text, View } from "react-native";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import type { IconName } from "../ui/Icon";
import { formatCompactNumber } from "../../libs/numbers.util";
import { useAppTheme } from "../../context/ThemeContext";

const TEXT = "#F4F4F5";
const MUTED = "#9A9AA2";
const CHIP = "rgba(255,255,255,0.08)";
const LINE = "rgba(255,255,255,0.10)";

// Brand names, the same in every language.
const BRAND_X = "X";
const BRAND_WHATSAPP = "WhatsApp";

export interface RepostShareSheetProps {
  visible: boolean;
  onClose: () => void;
  isReposted: boolean;
  onRepost: () => void;
  onUndoRepost: () => void;
  onQuote: () => void;
  onCopyLink: () => void;
  /** The post's public link, for the share targets. */
  shareUrl: string;
  /** The post's title, carried along as the share text where a target takes one. */
  shareText?: string;
  quoteCount: number;
  repostCount: number;
  onViewQuotes: () => void;
  onViewReposts: () => void;
}

/** Share targets that take a link in their URL; each falls back to its web page. */
export function shareTargetUrl(target: "x" | "telegram" | "whatsapp", url: string, text?: string): string {
  const u = encodeURIComponent(url);
  const msg = encodeURIComponent(text ? `${text} ${url}` : url);
  switch (target) {
    case "x":
      return `https://x.com/intent/post?url=${u}${text ? `&text=${encodeURIComponent(text)}` : ""}`;
    case "telegram":
      return `https://t.me/share/url?url=${u}${text ? `&text=${encodeURIComponent(text)}` : ""}`;
    case "whatsapp":
      return `https://wa.me/?text=${msg}`;
  }
}

function ShareTarget({ icon, glyph, label, onPress, radius }: { icon?: IconName; glyph?: string; label: string; onPress: () => void; radius: number }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.target}>
      <View style={[styles.targetIcon, { borderRadius: radius }]}>
        {icon ? <Icon name={icon} size={20} color={TEXT} /> : <Text style={styles.glyph}>{glyph}</Text>}
      </View>
      <Text numberOfLines={1} style={styles.targetLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * The post page's one sheet for passing a post on: repost (or undo it) and
 * quote as two big tiles, a row of places to share the link, then the lists
 * of who quoted it and who reposted it.
 */
function RepostShareSheetComponent({
  visible,
  onClose,
  isReposted,
  onRepost,
  onUndoRepost,
  onQuote,
  onCopyLink,
  shareUrl,
  shareText,
  quoteCount,
  repostCount,
  onViewQuotes,
  onViewReposts,
}: RepostShareSheetProps) {
  const { t } = useTranslation();
  const { skin } = useAppTheme();
  const radius = skin?.square ? 0 : 12;

  const later = useCallback((fn: () => void) => {
    onClose();
    setTimeout(fn, 300);
  }, [onClose]);

  const openTarget = useCallback((target: "x" | "telegram" | "whatsapp") => {
    onClose();
    Linking.openURL(shareTargetUrl(target, shareUrl, shareText)).catch(() => {});
  }, [onClose, shareUrl, shareText]);

  const nativeShare = useCallback(() => {
    later(() => {
      Share.share({ message: shareText ? `${shareText}\n${shareUrl}` : shareUrl, url: shareUrl }).catch(() => {});
    });
  }, [later, shareUrl, shareText]);

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom" scrollable maxHeight="80%" blurIntensity={50}>
      <View style={styles.grabWrap}>
        <View style={styles.grab} />
      </View>
      <View style={styles.body} testID="repost-share-sheet">
        <Text style={styles.title}>{t("feedCard.repostAndShare")}</Text>
        <View style={styles.tiles}>
          <Pressable
            onPress={() => {
              if (isReposted) onUndoRepost();
              else onRepost();
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel={isReposted ? t("feedCard.undoRepost") : t("feedCard.repost")}
            style={[styles.bigTile, { borderRadius: radius }]}
          >
            <View style={styles.tileHead}>
              <Icon name="Repeat2" size={20} color={TEXT} strokeWidth={isReposted ? 2.6 : 2} />
              <Text style={styles.tileTitle}>{isReposted ? t("feedCard.undoRepost") : t("feedCard.repost")}</Text>
            </View>
            <Text style={styles.tileHint}>{t("feedCard.repostHint")}</Text>
          </Pressable>
          <Pressable
            onPress={() => later(onQuote)}
            accessibilityRole="button"
            accessibilityLabel={t("transcript.quote")}
            style={[styles.bigTile, { borderRadius: radius }]}
          >
            <View style={styles.tileHead}>
              <Icon name="Quote" size={20} color={TEXT} />
              <Text style={styles.tileTitle}>{t("transcript.quote")}</Text>
            </View>
            <Text style={styles.tileHint}>{t("feedCard.quoteHint")}</Text>
          </Pressable>
        </View>

        <Text style={styles.section}>{t("feedCard.shareTo")}</Text>
        <View style={styles.targets}>
          <ShareTarget
            icon="Link"
            label={t("postOptions.copyLink")}
            radius={radius}
            onPress={() => {
              onCopyLink();
              onClose();
            }}
          />
          <ShareTarget glyph="𝕏" label={BRAND_X} radius={radius} onPress={() => openTarget("x")} />
          <ShareTarget icon="Send" label={t("careers.telegram")} radius={radius} onPress={() => openTarget("telegram")} />
          <ShareTarget icon="MessageCircle" label={BRAND_WHATSAPP} radius={radius} onPress={() => openTarget("whatsapp")} />
          <ShareTarget icon="Ellipsis" label={t("feedCard.moreShare")} radius={radius} onPress={nativeShare} />
        </View>

        <View style={[styles.lists, { borderRadius: radius }]}>
          <Pressable
            onPress={() => later(onViewQuotes)}
            accessibilityRole="button"
            accessibilityLabel={`${t("feedCard.viewQuotes")}, ${quoteCount}`}
            style={styles.listRow}
          >
            <Icon name="Quote" size={18} color={TEXT} />
            <Text style={styles.listLabel}>{t("feedCard.viewQuotes")}</Text>
            <Text style={styles.listCount}>{formatCompactNumber(quoteCount)}</Text>
            <Icon name="ChevronRight" size={16} color={MUTED} />
          </Pressable>
          <View style={styles.listDivider} />
          <Pressable
            onPress={() => later(onViewReposts)}
            accessibilityRole="button"
            accessibilityLabel={`${t("feedCard.viewReposts")}, ${repostCount}`}
            style={styles.listRow}
          >
            <Icon name="Repeat2" size={18} color={TEXT} />
            <Text style={styles.listLabel}>{t("feedCard.viewReposts")}</Text>
            <Text style={styles.listCount}>{formatCompactNumber(repostCount)}</Text>
            <Icon name="ChevronRight" size={16} color={MUTED} />
          </Pressable>
        </View>
      </View>
    </GlassModal>
  );
}

const styles = StyleSheet.create({
  grabWrap: { alignItems: "center", paddingTop: 10, paddingBottom: 2 },
  grab: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.22)" },
  body: { paddingHorizontal: 14, paddingBottom: 18 },
  title: { color: TEXT, fontSize: 16, fontWeight: "800", paddingTop: 8, paddingBottom: 12, paddingHorizontal: 2 },
  tiles: { flexDirection: "row", gap: 8 },
  bigTile: { flex: 1, padding: 12, backgroundColor: CHIP, borderWidth: 1, borderColor: LINE },
  tileHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  tileTitle: { color: TEXT, fontSize: 15, fontWeight: "800", flexShrink: 1 },
  tileHint: { color: MUTED, fontSize: 12, marginTop: 4 },
  section: {
    color: MUTED,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    paddingTop: 16,
    paddingBottom: 8,
    paddingHorizontal: 2,
  },
  targets: { flexDirection: "row", gap: 6 },
  target: { flex: 1, alignItems: "center", gap: 6 },
  targetIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CHIP,
    borderWidth: 1,
    borderColor: LINE,
  },
  glyph: { color: TEXT, fontSize: 19, fontWeight: "800" },
  targetLabel: { color: "#D4D4D8", fontSize: 11.5 },
  lists: { marginTop: 16, borderWidth: 1, borderColor: LINE, overflow: "hidden" },
  listRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 13 },
  listLabel: { flex: 1, color: TEXT, fontSize: 15, fontWeight: "700" },
  listCount: { color: MUTED, fontSize: 14, fontWeight: "700" },
  listDivider: { height: StyleSheet.hairlineWidth, backgroundColor: LINE },
});

const RepostShareSheet = memo(RepostShareSheetComponent);
export default RepostShareSheet;
