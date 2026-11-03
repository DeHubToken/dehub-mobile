/**
 * Remix credit chips on a video, the app side of web's DuetCredit,
 * StitchAttribution and ReactionChips:
 *
 *   on a remix     "Duet with @x" / "Stitched from @x" / "Reaction to @x",
 *                  opening the original
 *   on an original "3 duets" / "2 Stitches" / "5 reactions", opening the list
 *
 * Renders nothing until the post has a link or a count, so a plain video
 * keeps its layout exactly as before.
 */
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../ui/Icon";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useAppTheme } from "../../context/ThemeContext";
import { getRemixInfo, NO_REMIX_INFO, type RemixInfo, type RemixKind } from "../../services/remix-links.service";

const ICON: Record<RemixKind, IconName> = { duet: "Film", stitch: "Scissors", react: "MonitorPlay" };

const shortAddress = (address: string) => (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "");

export function useRemixInfo(tokenId: string | number | null | undefined, enabled = true): RemixInfo {
  const [info, setInfo] = useState<RemixInfo>(NO_REMIX_INFO);
  useEffect(() => {
    let live = true;
    setInfo(NO_REMIX_INFO);
    if (enabled && tokenId != null) void getRemixInfo(tokenId).then((next) => { if (live) setInfo(next); });
    return () => { live = false; };
  }, [tokenId, enabled]);
  return info;
}

interface Props {
  tokenId: string | number | null | undefined;
  /** Over a video (Shorts viewer): white on a dark wash in every theme. */
  overlay?: boolean;
  /** Off for posts that can't be remixed (lives, photos), so they never ask. */
  enabled?: boolean;
  /** Runs before leaving for another post, e.g. to close a viewer. */
  onNavigate?: () => void;
  style?: object;
}

export default function RemixCredits({ tokenId, overlay = false, enabled = true, onNavigate, style }: Props) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { isLight } = useAppTheme();
  const { source, counts } = useRemixInfo(tokenId, enabled);
  if (!source && !counts.duets && !counts.stitches && !counts.reactions) return null;

  const openPost = (id: number) => {
    onNavigate?.();
    navigation.push(ScreenNames.PostResolver, { tokenId: String(id) });
  };
  const openList = (kind: RemixKind) => {
    onNavigate?.();
    navigation.push(ScreenNames.RemixList, { tokenId: String(tokenId), kind });
  };

  const chips: Array<{ key: string; kind: RemixKind; label: string; onPress: () => void }> = [];
  if (source) {
    const name = source.username ? `@${source.username}` : shortAddress(source.address);
    const label = source.kind === "duet"
      ? (source.username
        ? t("duet.with", { username: source.username, defaultValue: "Duet with @{{username}}" })
        : t("duet.withOriginal", { defaultValue: "Duet · see original" }))
      : source.kind === "stitch"
        ? t("remixLinks.stitch.from", { name, defaultValue: "Stitched from {{name}}" })
        : `${t("reactions.reactionTo", { defaultValue: "Reaction to" })}${name ? ` ${name}` : ""}`;
    chips.push({ key: "source", kind: source.kind, label, onPress: () => openPost(source.tokenId) });
  }
  if (counts.duets > 0) {
    chips.push({ key: "duets", kind: "duet", label: t("duet.count", { count: counts.duets, defaultValue: "{{count}} duets" }), onPress: () => openList("duet") });
  }
  if (counts.stitches > 0) {
    chips.push({ key: "stitches", kind: "stitch", label: t("remixLinks.stitch.count", { count: counts.stitches, defaultValue: "{{count}} Stitches" }), onPress: () => openList("stitch") });
  }
  if (counts.reactions > 0) {
    chips.push({ key: "reactions", kind: "react", label: t("reactions.count", { count: counts.reactions, defaultValue: "{{count}} reactions" }), onPress: () => openList("react") });
  }

  return (
    // dark-surface: over a video the chips keep their white-on-dark look in
    // light themes too, like the rest of the Shorts chrome.
    <View className={overlay ? "dark-surface" : undefined} style={[styles.row, style]}>
      {chips.map((chip) => (
        <Pressable
          key={chip.key}
          onPress={chip.onPress}
          hitSlop={6}
          accessibilityRole="link"
          accessibilityLabel={chip.label}
          className={overlay ? "dark-surface" : "bg-theme-neutrals-800"}
          style={overlay ? styles.overlayHit : styles.chip}
        >
          {/* Over a video the dark wash sits on a child View: a Touchable's own
              neutral fill is repainted as the theme's control material, which
              is a light pill in light themes, under white text. */}
          <View pointerEvents="none" className={overlay ? "dark-surface" : undefined} style={[styles.inner, overlay && [styles.chip, styles.chipOverlay]]}>
            <Icon name={ICON[chip.kind]} size={13} color={overlay ? "#fff" : isLight ? "#3f3f46" : "#e4e4e7"} />
            <Text numberOfLines={1} className={overlay ? "dark-surface" : "text-theme-neutrals-100"} style={[styles.label, overlay && styles.labelOverlay]}>
              {chip.label}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, maxWidth: "100%" },
  overlayHit: { maxWidth: "100%" },
  chipOverlay: { backgroundColor: "rgba(0,0,0,0.5)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.25)" },
  inner: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  label: { fontSize: 12, fontWeight: "600", flexShrink: 1 },
  labelOverlay: { color: "#fff" },
});
