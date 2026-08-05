/**
 * CommunityInviteScreen
 * =====================
 * The landing screen behind /app/communities/join/<code>. The preview RPC is
 * public — it answers for signed-out visitors too — so the screen renders the
 * community first and only asks for a wallet when the join button is pressed.
 *
 * previewCommunityInvite is a plain async call rather than a react-query hook,
 * so its loading/error state lives here in local state.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import ScreenHeader from "../components/ScreenHeader";
import Icon from "../components/ui/Icon";
import { theme } from "../theme";
import { useAuthActions } from "../context/AuthContext";
import { useWalletAddress } from "../hooks/useCommunityAdmin";
import { previewCommunityInvite, joinCommunityViaInvite } from "../services/communities.service";
import { communityErrorMessage } from "../libs/community-permissions";
import { ScreenNames } from "../navigation/ScreenNames";
import { formatCompactNumber } from "../libs/numbers.util";
import { toastError, toastSuccess } from "../libs/toast";
import type { CommunityInvitePreview } from "../types/community";

const CommunityInviteScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const code: string = route.params?.code || "";
  const walletAddress = useWalletAddress();
  const { requireAuth } = useAuthActions();

  const [preview, setPreview] = useState<CommunityInvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [joining, setJoining] = useState(false);

  const walletRef = useRef(walletAddress);
  useEffect(() => {
    walletRef.current = walletAddress;
  }, [walletAddress]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!code) {
        setFailed(true);
        setLoading(false);
        return;
      }
      setLoading(true);
      setFailed(false);
      try {
        const result = await previewCommunityInvite(code);
        if (!cancelled) setPreview(result);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const goToCommunities = useCallback(() => {
    navigation.navigate(ScreenNames.Communities);
  }, [navigation]);

  const handleJoin = useCallback(() => {
    if (!preview?.is_valid || joining) return;
    requireAuth(async () => {
      // requireAuth stores this closure and replays it after sign-in, so the
      // captured walletAddress is still the signed-out null at that point. This
      // is the primary path here — an invite link opened by a logged-out
      // visitor — so read it from the ref instead.
      const wallet = walletRef.current;
      if (!wallet) return;
      setJoining(true);
      try {
        await joinCommunityViaInvite(wallet, code);
        toastSuccess(
          preview.requires_approval
            ? t("communities.joinRequestSent", { defaultValue: "Request sent" })
            : t("communities.joined", { defaultValue: "Joined" }),
        );
        navigation.navigate(ScreenNames.CommunityDetail, { slug: preview.slug });
      } catch (error) {
        toastError(
          communityErrorMessage(
            error,
            t("communities.invite.joinFailed", { defaultValue: "Failed to join" }),
          ),
        );
      } finally {
        setJoining(false);
      }
    });
  }, [preview, joining, requireAuth, code, navigation, t]);

  if (loading) {
    return (
      <View className="flex-1 bg-theme-neutrals-900">
        <ScreenHeader title={t("communities.title")} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </View>
    );
  }

  if (failed || !preview || !preview.is_valid) {
    const reason = preview?.reason || "not_found";
    const message =
      reason === "revoked"
        ? t("communities.invite.revoked", { defaultValue: "This invite link was revoked." })
        : reason === "expired"
          ? t("communities.invite.expired", { defaultValue: "This invite link has expired." })
          : reason === "exhausted"
            ? t("communities.invite.exhausted", {
                defaultValue: "This invite link has reached its member limit.",
              })
            : t("communities.invite.notFound", { defaultValue: "This invite link is not valid." });

    return (
      <View className="flex-1 bg-theme-neutrals-900">
        <ScreenHeader title={t("communities.title")} />
        <View className="flex-1 items-center justify-center px-6">
          <View style={styles.invalidCard}>
            <Icon name="Link" size={22} color="#71717a" />
            <Text className="text-white text-sm text-center mt-3">{message}</Text>
            <TouchableOpacity style={styles.secondaryBtn} onPress={goToCommunities}>
              <Text style={styles.secondaryBtnText}>{t("communities.backButton")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  const joinLabel = preview.requires_approval
    ? t("communities.invite.requestToJoin", { defaultValue: "Request to join" })
    : t("communities.join");

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title={preview.name || t("communities.title")} />
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 48 }}>
        <View style={styles.bannerWrap}>
          {preview.banner_url ? (
            <Image source={{ uri: preview.banner_url }} style={styles.banner} contentFit="cover" />
          ) : (
            <View style={[styles.banner, styles.bannerPlaceholder]} />
          )}
          <View style={styles.avatarOverlay}>
            <View style={styles.avatarBox}>
              {preview.avatar_url ? (
                <Image
                  source={{ uri: preview.avatar_url }}
                  style={styles.avatar}
                  contentFit="cover"
                />
              ) : (
                <Icon name="Users" size={28} color="#71717a" />
              )}
            </View>
          </View>
        </View>

        <View className="px-4 pt-12">
          <Text className="text-white text-xl font-bold" numberOfLines={2}>
            {preview.name || t("communities.title")}
          </Text>
          <Text className="text-zinc-500 text-sm mt-1">
            {formatCompactNumber(preview.member_count)} {t("communities.membersLabel")}
          </Text>

          {!!preview.description && (
            <Text className="text-zinc-300 text-sm mt-3 leading-5">{preview.description}</Text>
          )}

          <TouchableOpacity
            style={[styles.actionBtn, joining && styles.btnDisabled]}
            onPress={handleJoin}
            disabled={joining}
          >
            {joining ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.actionBtnText}>{joinLabel}</Text>
            )}
          </TouchableOpacity>

          {!!preview.requires_approval && (
            <Text className="text-zinc-500 text-xs mt-3">
              {t("communities.invite.approvalNote", {
                defaultValue: "An admin has to approve your request before you can join.",
              })}
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  bannerWrap: { height: 140, position: "relative" },
  banner: { width: "100%", height: "100%" },
  bannerPlaceholder: { backgroundColor: "#1a1d21" },
  avatarOverlay: { position: "absolute", left: 16, bottom: -32 },
  avatarBox: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: "#111316",
    borderWidth: 3,
    borderColor: "#010305",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatar: { width: "100%", height: "100%" },
  invalidCard: {
    width: "100%",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 20,
  },
  actionBtn: {
    marginTop: 20,
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: { color: "#000", fontWeight: "700", fontSize: 14 },
  btnDisabled: { opacity: 0.6 },
  secondaryBtn: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  secondaryBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});

export default CommunityInviteScreen;
