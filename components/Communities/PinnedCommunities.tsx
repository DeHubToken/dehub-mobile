import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Pressable,
} from "react-native";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import type { Community } from "../../types/community";
import {
  getPinnedCommunities,
  getUserCommunities,
  pinCommunity,
  unpinCommunity,
} from "../../services/communities.service";
import { useUser } from "../../context/AuthContext";
import { ScreenNames } from "../../navigation/ScreenNames";
import { formatCompactNumber } from "../../libs/numbers.util";
import { toastError, toastSuccess } from "../../libs/toast";

const MAX_PINS = 3;

interface Props {
  walletAddress: string;
  isOwnProfile: boolean;
}

const PinnedCommunities: React.FC<Props> = ({ walletAddress, isOwnProfile }) => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const currentUser = useUser() as any;
  const ownWallet = currentUser?.address || currentUser?.walletAddress || "";
  const [pinned, setPinned] = useState<(Community & { pinId: string })[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadPins = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const rows = await getPinnedCommunities(walletAddress);
      setPinned(
        rows
          .map((p) => {
            const c = p.communities;
            if (!c?.id) return null;
            return { ...c, pinId: p.id };
          })
          .filter(Boolean) as (Community & { pinId: string })[],
      );
    } catch {
      setPinned([]);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    loadPins();
  }, [loadPins]);

  const openCommunity = useCallback(
    (slug: string) => {
      navigation.navigate(ScreenNames.CommunityDetail, { slug });
    },
    [navigation],
  );

  if (loading) return null;
  if (pinned.length === 0 && !isOwnProfile) return null;

  return (
    <View style={styles.wrap}>
      {pinned.map((community) => (
        <TouchableOpacity
          key={community.pinId}
          style={styles.pinCard}
          activeOpacity={0.8}
          onPress={() => openCommunity(community.slug)}
        >
          {!!community.banner_url && (
            <>
              <Image source={{ uri: community.banner_url }} style={styles.pinBanner} contentFit="cover" />
              <View style={styles.pinScrim} />
            </>
          )}
          <View style={styles.pinAvatar}>
            {community.avatar_url ? (
              <Image source={{ uri: community.avatar_url }} style={styles.pinAvatarImg} contentFit="cover" />
            ) : (
              <Icon name="Users" size={20} color="#71717a" />
            )}
          </View>
          <View style={styles.pinBody}>
            <Text style={styles.pinName} numberOfLines={1}>
              {community.name}
            </Text>
            {!!community.description && (
              <Text style={styles.pinDesc} numberOfLines={1}>
                {community.description}
              </Text>
            )}
            <Text style={styles.pinMembers}>
              {formatCompactNumber(community.member_count)} {t("communities.membersLabel")}
            </Text>
          </View>
          {isOwnProfile && (
            <TouchableOpacity
              style={styles.pinManage}
              onPress={(e) => {
                e.stopPropagation?.();
                setPickerOpen(true);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("communities.pinToProfile")}
            >
              <Icon name="Pin" size={14} color="#a1a1aa" />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      ))}
      {isOwnProfile && pinned.length < MAX_PINS && (
        <TouchableOpacity style={styles.addPin} onPress={() => setPickerOpen(true)} activeOpacity={0.7}>
          <Icon name="Plus" size={14} color="#71717a" />
          <Text style={styles.addPinText}>{t("communities.pinCommunity")}</Text>
        </TouchableOpacity>
      )}
      <PinPickerModal
        visible={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          loadPins();
        }}
        walletAddress={ownWallet}
        pinnedIds={new Set(pinned.map((p) => p.id))}
        nextOrder={pinned.length}
      />
    </View>
  );
};

function PinPickerModal({
  visible,
  onClose,
  walletAddress,
  pinnedIds,
  nextOrder,
}: {
  visible: boolean;
  onClose: () => void;
  walletAddress: string;
  pinnedIds: Set<string>;
  nextOrder: number;
  onUpdated?: () => void;
}) {
  const { t } = useTranslation();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !walletAddress) return;
    let cancelled = false;
    setLoading(true);
    getUserCommunities(walletAddress)
      .then((rows) => {
        if (cancelled) return;
        setCommunities(rows.map((r) => r.communities).filter((c) => c?.id));
      })
      .catch(() => setCommunities([]))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, walletAddress]);

  const togglePin = async (community: Community) => {
    if (!walletAddress || busyId) return;
    setBusyId(community.id);
    try {
      if (pinnedIds.has(community.id)) {
        await unpinCommunity(walletAddress, community.id);
        toastSuccess(t("communities.unpin"));
      } else if (pinnedIds.size >= MAX_PINS) {
        toastError(t("communities.maxPins"));
      } else {
        await pinCommunity(walletAddress, community.id, nextOrder);
        toastSuccess(t("communities.pin"));
      }
      onClose();
    } catch {
      toastError(t("communities.pinUpdateFailed"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>{t("communities.pinToProfile")}</Text>
          {loading ? (
            <ActivityIndicator color="#F4F4F5" style={{ marginVertical: 24 }} />
          ) : communities.length === 0 ? (
            <Text style={styles.modalEmpty}>{t("communities.noCommunities")}</Text>
          ) : (
            <FlatList
              data={communities}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => {
                const isPinned = pinnedIds.has(item.id);
                const canAdd = isPinned || pinnedIds.size < MAX_PINS;
                return (
                  <TouchableOpacity
                    style={styles.pickerRow}
                    disabled={!canAdd || busyId === item.id}
                    onPress={() => togglePin(item)}
                  >
                    <View style={styles.pickerAvatar}>
                      {item.avatar_url ? (
                        <Image source={{ uri: item.avatar_url }} style={styles.pickerAvatarImg} contentFit="cover" />
                      ) : (
                        <Icon name="Users" size={16} color="#71717a" />
                      )}
                    </View>
                    <Text style={styles.pickerName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {isPinned ? (
                      <Icon name="X" size={18} color="#EF4444" />
                    ) : canAdd ? (
                      <Icon name="Plus" size={18} color="#71717a" />
                    ) : null}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, gap: 8 },
  pinCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    position: "relative",
  },
  pinBanner: { ...StyleSheet.absoluteFillObject, opacity: 0.35 },
  pinScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  pinAvatar: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    zIndex: 1,
  },
  pinAvatarImg: { width: "100%", height: "100%" },
  pinBody: { flex: 1, zIndex: 1 },
  pinName: { color: "#fff", fontSize: 14, fontWeight: "600" },
  pinDesc: { color: "#a1a1aa", fontSize: 12, marginTop: 2 },
  pinMembers: { color: "#A1A1AA", fontSize: 12, marginTop: 4 },
  pinManage: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  addPin: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderStyle: "dashed",
  },
  addPinText: { color: "#A1A1AA", fontSize: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "rgba(12,12,14,0.96)",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 20,
    paddingBottom: 32,
    maxHeight: "70%",
  },
  modalTitle: { color: "#fff", fontSize: 16, fontWeight: "600", marginBottom: 12 },
  modalEmpty: { color: "#71717a", textAlign: "center", paddingVertical: 24, fontSize: 14 },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  pickerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pickerAvatarImg: { width: "100%", height: "100%" },
  pickerName: { flex: 1, color: "#fff", fontSize: 14 },
});

export default PinnedCommunities;
