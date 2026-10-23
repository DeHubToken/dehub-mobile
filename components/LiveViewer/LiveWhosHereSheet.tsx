/**
 * "Who's here": the live room's people, in one sheet.
 *
 * Opened from the faces pill under the header. Four lists, best first:
 *   Host          who started the stream, and when
 *   Top tippers   confirmed DHB sent to this stream, summed per person
 *   Most active   chat lines since the stream went on air
 *   Here now      who is watching, newest first
 *
 * Canvas themes draw each list as a glass bento. System has no boxes (the
 * full-immersive rule): the lists sit full width between hairlines.
 */
import React, { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatDistance } from "date-fns";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import Avatar from "../common/Avatar";
import { DhbCoin } from "../common/DhbCoin";
import { getAvatarUrl } from "../../libs/misc";
import { truncateAddress } from "../../libs/strings.util";
import { formatCompactNumber } from "../../libs/numbers.util";
import { useAppTheme } from "../../context/ThemeContext";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import type { LiveAudience, LiveAudienceAccount } from "../../services/live.service";
import { liveAccent } from "./liveAccent";

const TEXT = "#F4F4F5";
const MUTED = "#9A9AA2";
const LINE = "rgba(255,255,255,0.10)";

interface Props {
  visible: boolean;
  onClose: () => void;
  audience: LiveAudience | undefined;
  loading: boolean;
}

export const audienceName = (a: LiveAudienceAccount) =>
  a.displayName || a.username || truncateAddress(a.address || "", 4, 4);

const Row: React.FC<{
  account: LiveAudienceAccount;
  meta: React.ReactNode;
  right?: React.ReactNode;
  large?: boolean;
  onOpen: (a: LiveAudienceAccount) => void;
  divider: boolean;
}> = ({ account, meta, right, large, onOpen, divider }) => (
  <Pressable
    onPress={() => onOpen(account)}
    accessibilityRole="button"
    accessibilityLabel={audienceName(account)}
    style={[styles.row, divider ? styles.rowDivider : null]}
  >
    <Avatar uri={getAvatarUrl(account.avatarImageUrl) || undefined} size={large ? 36 : 32} name={audienceName(account)} />
    <View style={styles.rowText}>
      <Text style={styles.name} numberOfLines={1}>{audienceName(account)}</Text>
      <View style={styles.metaRow}>{meta}</View>
    </View>
    {right}
  </Pressable>
);

function LiveWhosHereSheetComponent({ visible, onClose, audience, loading }: Props) {
  const { t } = useTranslation();
  const { skin, theme, accent } = useAppTheme();
  const { showUserProfile } = useUserProfileSheet();
  const boxed = !!skin;
  const radius = skin?.square ? 0 : 14;
  const tint = liveAccent(theme, accent);

  const open = useCallback(
    (a: LiveAudienceAccount) => {
      const id = a.username || a.address;
      if (!id) return;
      onClose();
      setTimeout(() => showUserProfile(id), 250);
    },
    [onClose, showUserProfile],
  );

  const section = (label: string, children: React.ReactNode) => (
    <View style={[boxed ? [styles.bento, { borderRadius: radius }] : styles.flat]}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );

  const host = audience?.host;
  const startedAt = host?.startedAt ? new Date(host.startedAt) : null;
  const tippers = audience?.topTippers ?? [];
  const active = audience?.mostActive ?? [];
  const here = audience?.here ?? [];

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom" scrollable maxHeight="82%" blurIntensity={50}>
      <View style={styles.grabWrap}>
        <View style={styles.grab} />
      </View>
      <View style={styles.body} testID="live-whos-here-sheet">
        <View style={styles.head}>
          <Text style={styles.title}>{t("liveViewer.whosHere")}</Text>
          <View style={styles.watching}>
            <Icon name="Eye" size={14} color={MUTED} />
            <Text style={styles.watchingText}>
              {t("liveViewer.watchingCount", { count: audience?.watching ?? 0, formatted: formatCompactNumber(audience?.watching ?? 0) })}
            </Text>
          </View>
        </View>

        {host
          ? section(
              t("liveViewer.host"),
              <Row
                account={host}
                large
                onOpen={open}
                divider={false}
                meta={
                  startedAt ? (
                    <Text style={styles.meta}>
                      {t("liveViewer.startedAgo", { time: formatDistance(startedAt, new Date(), { addSuffix: true }) })}
                    </Text>
                  ) : null
                }
              />,
            )
          : null}

        {tippers.length
          ? section(
              t("liveViewer.topTippers"),
              tippers.slice(0, 5).map((p, i) => (
                <Row
                  key={p.address}
                  account={p}
                  onOpen={open}
                  divider={!boxed && i > 0}
                  meta={
                    <>
                      <DhbCoin size={11} />
                      <Text style={styles.meta}>{formatCompactNumber(p.total)}</Text>
                    </>
                  }
                  right={i === 0 ? <Icon name="Crown" size={16} color={tint} /> : <Text style={styles.rank}>{i + 1}</Text>}
                />
              )),
            )
          : null}

        {active.length
          ? section(
              t("liveViewer.mostActive"),
              active.slice(0, 5).map((p, i) => (
                <Row
                  key={p.address}
                  account={p}
                  onOpen={open}
                  divider={!boxed && i > 0}
                  meta={
                    <>
                      <Icon name="MessageCircle" size={11} color={MUTED} />
                      <Text style={styles.meta}>{formatCompactNumber(p.messages)}</Text>
                    </>
                  }
                  right={<Text style={styles.rank}>{i + 1}</Text>}
                />
              )),
            )
          : null}

        {section(
          t("liveViewer.hereNow"),
          here.length ? (
            here.slice(0, 30).map((p, i) => (
              <Row
                key={p.address}
                account={p}
                onOpen={open}
                divider={!boxed && i > 0}
                meta={
                  <Text style={styles.meta}>
                    {t("liveViewer.joined")} {formatDistance(new Date(p.joinedAt), new Date(), { addSuffix: true })}
                  </Text>
                }
              />
            ))
          ) : (
            <Text style={styles.empty}>{loading ? "…" : t("liveViewer.nobodyYet")}</Text>
          ),
        )}
      </View>
    </GlassModal>
  );
}

const styles = StyleSheet.create({
  grabWrap: { alignItems: "center", paddingTop: 10, paddingBottom: 2 },
  grab: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.22)" },
  body: { paddingBottom: 18 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  title: { color: TEXT, fontSize: 16, fontWeight: "800" },
  watching: { flexDirection: "row", alignItems: "center", gap: 5 },
  watchingText: { color: MUTED, fontSize: 13, fontWeight: "600" },
  bento: { marginHorizontal: 12, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: LINE },
  flat: { paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.16)" },
  label: { color: MUTED, fontSize: 11, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: LINE },
  rowText: { flex: 1, minWidth: 0 },
  name: { color: TEXT, fontSize: 14, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  meta: { color: MUTED, fontSize: 12 },
  rank: { color: MUTED, fontSize: 13, fontWeight: "800", minWidth: 16, textAlign: "right" },
  empty: { color: MUTED, fontSize: 13, paddingVertical: 8 },
});

export default memo(LiveWhosHereSheetComponent);
