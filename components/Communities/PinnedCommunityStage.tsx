import React from "react";
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import type { Community } from "../../types/community";
import { storageImageSource } from "../../libs/cdnImage";
import { useAppTheme } from "../../context/ThemeContext";
import Icon from "../ui/Icon";

/** Paint only the details area; leave the overlapping avatar outside the clip. */
export function PinnedCommunityWash({ community }: { community?: Community | null }) {
  const { isMinimal } = useAppTheme();
  if (!community?.banner_url) return null;
  return (
    <View pointerEvents="none" style={styles.wash} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image
        source={storageImageSource(community.banner_url, 480)}
        contentFit="cover"
        blurRadius={40}
        style={[styles.washImage, { opacity: isMinimal ? 0.3 : 0.5 }]}
      />
    </View>
  );
}

export function PinnedCommunityStrip({ community, onOpen, onManagePins }: {
  community: Community;
  onOpen: () => void;
  onManagePins?: () => void;
}) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  return (
    <View style={styles.strip}>
      <Image source={storageImageSource(community.banner_url, width)} style={StyleSheet.absoluteFillObject} contentFit="cover" contentPosition="center bottom" />
      <LinearGradient
        colors={["rgba(6,4,18,0.86)", "rgba(6,4,18,0.5)", "rgba(6,4,18,0.12)"]}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <TouchableOpacity onPress={onOpen} style={styles.community} accessibilityRole="button" activeOpacity={0.8}>
        <View style={styles.avatar}>
          {community.avatar_url ? (
            <Image source={storageImageSource(community.avatar_url, 32)} style={StyleSheet.absoluteFillObject} contentFit="cover" />
          ) : <Icon name="Users" size={16} color="#fff" />}
        </View>
        <View style={styles.body}>
          <Text numberOfLines={1} style={styles.name}>{community.name}</Text>
          <View style={styles.meta}>
            <Icon name="Pin" size={12} color="#fff" />
            <Text numberOfLines={1} style={styles.members}>
              {t("comments.pinnedBadge")} · {community.member_count.toLocaleString()} {t("communities.members")}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
      {onManagePins && (
        <TouchableOpacity onPress={onManagePins} style={styles.manage} hitSlop={6} accessibilityRole="button" accessibilityLabel={t("communities.pinToProfile")}>
          <Icon name="Pin" size={14} color="#fff" />
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={onOpen} style={styles.open} hitSlop={6} accessibilityRole="button">
        <Text style={styles.openText}>{t("wallet.view")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wash: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  washImage: { position: "absolute", top: -64, bottom: -64, left: -64, right: -64 },
  strip: { height: 72, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, overflow: "hidden", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.14)" },
  community: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  avatar: { width: 32, height: 32, borderRadius: 9, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  body: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, fontWeight: "600", color: "#fff" },
  meta: { flexDirection: "row", alignItems: "center", gap: 4, opacity: 0.8, marginTop: 2 },
  members: { flexShrink: 1, fontSize: 12, color: "#fff" },
  manage: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", backgroundColor: "rgba(0,0,0,0.3)" },
  open: { height: 32, paddingHorizontal: 12, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", backgroundColor: "rgba(255,255,255,0.1)" },
  openText: { fontSize: 13, fontWeight: "500", color: "#fff" },
});
