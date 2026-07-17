import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRoute, useNavigation } from "@react-navigation/native";
import ScreenHeader from "../components/ScreenHeader";
import ConfirmModal from "../components/common/ConfirmModal";
import Avatar from "../components/common/Avatar";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import {
  getLiveChatRoom,
  getLiveChatUserProfile,
  unbanUser as unbanUserApi,
} from "../services/livechat.service";
import type { LiveChatRoom, LiveChatUser } from "../services/livechat.service";
import { getAvatarUrl, getBadgeUrl, resolveBadgeBalance } from "../libs/misc";

/* ─── Types ─────────────────────────────────────────────────── */

interface RouteParams {
  room?: LiveChatRoom;
  isModerator?: boolean;
  onlineCount?: number;
  participants?: LiveChatUser[];
}

/* ─── Section Header ────────────────────────────────────────── */

const SectionHeader: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  count?: number;
  iconColor?: string;
}> = ({ icon, title, count, iconColor = "rgba(255,255,255,0.5)" }) => (
  <View className="flex-row items-center gap-2 px-4 pt-5 pb-2">
    <Ionicons name={icon} size={18} color={iconColor} />
    <Text className="text-white/50 text-xs font-semibold uppercase tracking-wider">
      {title}
    </Text>
    {count != null && (
      <View className="bg-white/10 rounded-full px-2 py-0.5 ml-auto">
        <Text className="text-white/40 text-[11px]">{count}</Text>
      </View>
    )}
  </View>
);

/* ─── User Row ─────────────────────────────────────────────── */

const UserRow: React.FC<{
  user: LiveChatUser;
  trailing?: React.ReactNode;
  onPress?: () => void;
}> = ({ user, trailing, onPress }) => {
  const avatarUrl = getAvatarUrl(user.avatarUrl || "");
  const displayName = user.displayName || user.username || user.address?.slice(0, 10) || "Unknown";
  const badgeBalance = resolveBadgeBalance(user);
  const badgeImg = getBadgeUrl(badgeBalance);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.6 : 1}
      className="flex-row items-center px-4 py-3 gap-3"
    >
      <Avatar uri={avatarUrl} size={36} name={displayName} />
      <View className="flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text className="text-white text-sm font-medium" numberOfLines={1}>
            {displayName}
          </Text>
          {!!badgeImg && (
            <Image source={badgeImg} style={{ width: 14, height: 14 }} resizeMode="contain" />
          )}
          {user.isModerator && (
            <View className="bg-amber-500/20 rounded px-1 py-0.5">
              <Text className="text-amber-400 text-[9px] font-bold">MOD</Text>
            </View>
          )}
        </View>
        {user.username && user.displayName && user.username !== user.displayName && (
          <Text className="text-white/30 text-xs">@{user.username}</Text>
        )}
      </View>
      {trailing}
    </TouchableOpacity>
  );
};

/* ─── Info Row ─────────────────────────────────────────────── */

const InfoRow: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}> = ({ icon, label, value }) => (
  <View className="flex-row items-center px-4 py-3 gap-3">
    <View className="w-8 h-8 bg-white/5 rounded-lg items-center justify-center">
      <Ionicons name={icon} size={16} color="rgba(255,255,255,0.4)" />
    </View>
    <View className="flex-1">
      <Text className="text-white/40 text-[11px]">{label}</Text>
      <Text className="text-white text-sm">{value}</Text>
    </View>
  </View>
);

/* ─── Main Screen ───────────────────────────────────────────── */

const LiveChatInfoScreen: React.FC = () => {
  const { t } = useTranslation();
  const route = useRoute<any>();
  const navigation = useNavigation();
  const { showUserProfile } = useUserProfileSheet();

  const params: RouteParams = route.params || {};
  const passedRoom = params.room;
  const passedIsMod = params.isModerator ?? false;
  const passedOnlineCount = params.onlineCount ?? 0;
  const passedParticipants = params.participants ?? [];

  const [room, setRoom] = useState<LiveChatRoom | null>(passedRoom || null);
  const [loading, setLoading] = useState(!passedRoom);
  const [refreshing, setRefreshing] = useState(false);

  // Resolved user profiles for moderators & banned users
  const [modProfiles, setModProfiles] = useState<LiveChatUser[]>([]);
  const [bannedProfiles, setBannedProfiles] = useState<LiveChatUser[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    title: string;
    description?: string;
    confirmText: string;
    confirmKind: "primary" | "danger" | "neutral";
    onConfirm: () => void;
  }>({ visible: false, title: "", confirmText: "OK", confirmKind: "primary", onConfirm: () => {} });

  const showConfirm = useCallback(
    (opts: {
      title: string;
      description?: string;
      confirmText: string;
      confirmKind?: "primary" | "danger" | "neutral";
      onConfirm: () => void;
    }) => {
      setConfirmModal({
        visible: true,
        title: opts.title,
        description: opts.description,
        confirmText: opts.confirmText,
        confirmKind: opts.confirmKind || "primary",
        onConfirm: opts.onConfirm,
      });
    },
    [],
  );

  const dismissConfirm = useCallback(() => {
    setConfirmModal((prev) => ({ ...prev, visible: false }));
  }, []);

  const fetchRoom = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const r = await getLiveChatRoom();
      setRoom(r);
    } catch (e) {
      console.error("[LiveChatInfo] fetchRoom error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Resolve user profiles from address arrays
  const resolveProfiles = useCallback(async (currentRoom: LiveChatRoom) => {
    setProfilesLoading(true);
    try {
      const [mods, banned] = await Promise.all([
        Promise.all(
          (currentRoom.moderators || []).map(async (addr) => {
            try {
              return await getLiveChatUserProfile(addr);
            } catch {
              return { address: addr } as LiveChatUser;
            }
          }),
        ),
        Promise.all(
          (currentRoom.bannedUsers || []).map(async (addr) => {
            try {
              return await getLiveChatUserProfile(addr);
            } catch {
              return { address: addr } as LiveChatUser;
            }
          }),
        ),
      ]);
      setModProfiles(mods);
      setBannedProfiles(banned);
    } catch (e) {
      console.error("[LiveChatInfo] resolveProfiles error:", e);
    } finally {
      setProfilesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!passedRoom) fetchRoom();
  }, [passedRoom, fetchRoom]);

  useEffect(() => {
    if (room) resolveProfiles(room);
  }, [room, resolveProfiles]);

  const handleRefresh = useCallback(() => {
    fetchRoom(true);
  }, [fetchRoom]);

  const handleUnban = useCallback(
    (user: LiveChatUser) => {
      const name = user.displayName || user.username || user.address?.slice(0, 10) || "this user";
      showConfirm({
        title: "Unban User",
        description: `Are you sure you want to unban ${name}?`,
        confirmText: "Unban",
        confirmKind: "primary",
        onConfirm: async () => {
          dismissConfirm();
          try {
            await unbanUserApi(user.address);
            // Remove from local state
            setBannedProfiles((prev) => prev.filter((u) => u.address !== user.address));
            setRoom((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                bannedUsers: prev.bannedUsers.filter(
                  (a) => a.toLowerCase() !== user.address.toLowerCase(),
                ),
              };
            });
          } catch (e) {
            showConfirm({
              title: "Error",
              description: "Failed to unban user",
              confirmText: "OK",
              onConfirm: dismissConfirm,
            });
          }
        },
      });
    },
    [showConfirm, dismissConfirm],
  );

  const handleUserPress = useCallback(
    (address: string) => {
      if (address) showUserProfile(address);
    },
    [showUserProfile],
  );

  if (loading) {
    return (
      <View className="flex-1 bg-black">
        <ScreenHeader title={t("screens.chatInfo")} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="rgba(255,255,255,0.3)" />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <ScreenHeader title={t("screens.chatInfo")} />

      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FFFFFF" />
        }
      >
        <View className="items-center pt-6 pb-4 px-4">
          <View className="w-16 h-16 bg-blue-500/20 rounded-full items-center justify-center mb-3">
            <Ionicons name="chatbubbles" size={28} color="#3B82F6" />
          </View>
          <Text className="text-white text-lg font-bold">{room?.name || "Public Chat"}</Text>
          {room?.description ? (
            <Text className="text-white/40 text-sm text-center mt-1">{room.description}</Text>
          ) : null}
        </View>

        <View className="mx-4 bg-white/5 rounded-2xl overflow-hidden mb-2">
          <InfoRow
            icon="people-outline"
            label="Online"
            value={`${passedOnlineCount || room?.onlineCount || 0} users`}
          />
          <View className="h-px bg-white/5 mx-4" />
          <InfoRow
            icon="chatbubble-outline"
            label="Total Messages"
            value={`${room?.messageCount?.toLocaleString() || "0"}`}
          />
          <View className="h-px bg-white/5 mx-4" />
          <InfoRow
            icon="time-outline"
            label="Slow Mode"
            value={room?.slowMode ? `${room.slowModeSeconds}s cooldown` : "Off"}
          />
          {!!room?.minStakeRequired && room.minStakeRequired > 0 && (
            <>
              <View className="h-px bg-white/5 mx-4" />
              <InfoRow
                icon="lock-closed-outline"
                label="Min Stake Required"
                value={`${room.minStakeRequired.toLocaleString()} DHB`}
              />
            </>
          )}
        </View>

        {room?.pinnedMessages && room.pinnedMessages.length > 0 && (
          <>
            <SectionHeader
              icon="pin-outline"
              title={t("screens.pinnedMessages")}
              count={room.pinnedMessages.length}
            />
            <View className="mx-4 bg-white/5 rounded-2xl overflow-hidden">
              {room.pinnedMessages.map((msg, idx) => (
                <React.Fragment key={msg._id || (msg as any).id || `pin-${idx}`}>
                  {idx > 0 && <View className="h-px bg-white/5 mx-4" />}
                  <View className="px-4 py-3">
                    <View className="flex-row items-center gap-2 mb-1">
                      <MaterialCommunityIcons
                        name="pin"
                        size={12}
                        color="rgba(255,255,255,0.3)"
                        style={{ transform: [{ rotate: "45deg" }] }}
                      />
                      <Text className="text-white/40 text-[11px]">
                        {msg.sender?.displayName || msg.sender?.username || msg.senderAddress?.slice(0, 8)}
                      </Text>
                    </View>
                    <Text className="text-white/70 text-sm" numberOfLines={2}>
                      {msg.content || (msg.gif ? "GIF" : msg.media?.length ? "Media" : "")}
                    </Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
          </>
        )}

        {/* TODO: Participants section — revisit later
        <SectionHeader
          icon="people-outline"
          title={t("screens.participants")}
          count={passedParticipants.length}
        />
        <View className="mx-4 bg-white/5 rounded-2xl overflow-hidden">
          {passedParticipants.length === 0 ? (
            <View className="items-center py-6">
              <Text className="text-white/30 text-sm">No participants yet</Text>
            </View>
          ) : (
            passedParticipants.map((u, idx) => (
              <React.Fragment key={u.address || `part-${idx}`}>
                {idx > 0 && <View className="h-px bg-white/5 mx-4" />}
                <UserRow user={u} onPress={() => handleUserPress(u.address)} />
              </React.Fragment>
            ))
          )}
        </View>
        */}

        <SectionHeader
          icon="shield-checkmark-outline"
          title={t("screens.moderators")}
          count={room?.moderators?.length || 0}
          iconColor="#F59E0B"
        />
        <View className="mx-4 bg-white/5 rounded-2xl overflow-hidden">
          {profilesLoading && modProfiles.length === 0 ? (
            <View className="items-center py-6">
              <ActivityIndicator size="small" color="rgba(255,255,255,0.3)" />
            </View>
          ) : modProfiles.length === 0 ? (
            <View className="items-center py-6">
              <Text className="text-white/30 text-sm">No moderators</Text>
            </View>
          ) : (
            modProfiles.map((u, idx) => (
              <React.Fragment key={u.address || `mod-${idx}`}>
                {idx > 0 && <View className="h-px bg-white/5 mx-4" />}
                <UserRow user={u} onPress={() => handleUserPress(u.address)} />
              </React.Fragment>
            ))
          )}
        </View>

        {passedIsMod && (
          <>
            <SectionHeader
              icon="ban-outline"
              title={t("screens.bannedUsers")}
              count={room?.bannedUsers?.length || 0}
              iconColor="#EF4444"
            />
            <View className="mx-4 bg-white/5 rounded-2xl overflow-hidden mb-8">
              {profilesLoading && bannedProfiles.length === 0 ? (
                <View className="items-center py-6">
                  <ActivityIndicator size="small" color="rgba(255,255,255,0.3)" />
                </View>
              ) : bannedProfiles.length === 0 ? (
                <View className="items-center py-6">
                  <Text className="text-white/30 text-sm">No banned users</Text>
                </View>
              ) : (
                bannedProfiles.map((u, idx) => (
                  <React.Fragment key={u.address || `ban-${idx}`}>
                    {idx > 0 && <View className="h-px bg-white/5 mx-4" />}
                    <UserRow
                      user={u}
                      onPress={() => handleUserPress(u.address)}
                      trailing={
                        <TouchableOpacity
                          onPress={() => handleUnban(u)}
                          activeOpacity={0.6}
                          className="bg-white/10 rounded-lg px-3 py-1.5"
                        >
                          <Text className="text-white text-xs font-medium">Unban</Text>
                        </TouchableOpacity>
                      }
                    />
                  </React.Fragment>
                ))
              )}
            </View>
          </>
        )}

        <View className="h-10" />
      </ScrollView>

      <ConfirmModal
        visible={confirmModal.visible}
        title={confirmModal.title}
        description={confirmModal.description}
        confirmText={confirmModal.confirmText}
        confirmKind={confirmModal.confirmKind}
        onConfirm={confirmModal.onConfirm}
        onCancel={dismissConfirm}
      />
    </View>
  );
};

export default LiveChatInfoScreen;
