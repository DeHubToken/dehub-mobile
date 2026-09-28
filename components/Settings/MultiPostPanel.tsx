import React, { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Linking } from "react-native";
import { useTranslation } from "react-i18next";
import * as WebBrowser from "expo-web-browser";
import Slider from "@react-native-community/slider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "../ui/Icon";
import type { IconName } from "../ui/iconRegistry";
import { SettingsAnchor, SettingsScrollView } from "./SettingsAnchor";
import { SettingsSection, SettingsInfoRow, Divider } from "./SettingsPrimitives";
import { useUser } from "../../context/AuthContext";
import { toastError, toastSuccess } from "../../libs/toast";
import {
  BUNDLE_STOPS, CREDIT_PRICE_USD, DEFAULT_PLATFORM_CREDITS, bundleDiscount, bundlePriceUsd, creditsFor,
} from "../../libs/social-pricing";
import {
  MULTIPOST_PLATFORMS, MULTIPOST_REDIRECT, PLATFORM_NAMES,
  buyCredits, disconnectAccount, getMultipostStatus, startConnect,
} from "../../services/multipost.service";

const PLATFORM_ICON: Record<string, IconName> = { twitter: "Twitter", instagram: "Instagram", facebook: "Facebook" };
export const platformIcon = (platform: string): IconName => PLATFORM_ICON[platform] ?? "Globe";

export function useMultipostWallet(): string | null {
  const user = useUser() as any;
  const w = user?.walletAddress || user?.address;
  return w ? String(w).toLowerCase() : null;
}

export const multipostQueryKey = (wallet: string | null) => ["multipost", "status", wallet] as const;

const MultiPostPanel: React.FC = () => {
  const { t } = useTranslation();
  const wallet = useMultipostWallet();
  const qc = useQueryClient();
  const [stopIndex, setStopIndex] = useState(3);
  const [buying, setBuying] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);

  const status = useQuery({
    queryKey: multipostQueryKey(wallet),
    queryFn: () => getMultipostStatus(wallet),
    enabled: !!wallet,
    staleTime: 30_000,
    // Farcaster approval happens in another app, so keep checking while it is pending.
    refetchInterval: (query) => (query.state.data?.accounts.some((a) => a.pending) ? 5000 : false),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: multipostQueryKey(wallet) });

  const credits = BUNDLE_STOPS[stopIndex];
  const discount = bundleDiscount(credits);
  const total = bundlePriceUsd(credits);
  const accounts = status.data?.accounts ?? [];
  const connected = new Set(accounts.filter((a) => !a.pending).map((a) => a.platform));

  const handleConnect = async (platform: string) => {
    setConnecting(platform);
    try {
      const authUrl = await startConnect(wallet, platform);
      if (!authUrl) {
        refresh();
        return;
      }
      if (platform === "farcaster") {
        // Approval happens in the Farcaster app; the status query picks it up.
        await Linking.openURL(authUrl);
        refresh();
        return;
      }
      const result = await WebBrowser.openAuthSessionAsync(authUrl, MULTIPOST_REDIRECT);
      if (result.type === "success") {
        const query = result.url.split("?")[1] ?? "";
        if (/(^|&)connected=/.test(query)) toastSuccess(t("multiPost.connectedToast", { platform: PLATFORM_NAMES[platform] }));
        else toastError(null, t("multiPost.connectFailed", { platform: PLATFORM_NAMES[platform] }));
      }
      refresh();
    } catch (e) {
      toastError(e, t("multiPost.connectFailed", { platform: PLATFORM_NAMES[platform] }));
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (accountId: string) => {
    try {
      await disconnectAccount(wallet, accountId);
      toastSuccess(t("multiPost.disconnected"));
      refresh();
    } catch (e) {
      toastError(e);
    }
  };

  const handleBuy = async () => {
    setBuying(true);
    try {
      await buyCredits(wallet, credits);
      toastSuccess(t("multiPost.bought", { count: credits }));
      refresh();
    } catch (e) {
      toastError(e);
    } finally {
      setBuying(false);
    }
  };

  if (!wallet) {
    return <Text className="text-theme-neutrals-400 text-sm m-4">{t("multiPost.signIn")}</Text>;
  }

  return (
    <SettingsScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
      <SettingsAnchor id="multipost">
        <View className="mt-4">
          <Text className="text-white text-lg font-semibold">{t("multiPost.title")}</Text>
          <Text className="text-theme-neutrals-400 text-sm mt-1">{t("multiPost.intro")}</Text>
        </View>
      </SettingsAnchor>

      <SettingsSection
        label={t("multiPost.creditsHeading")}
        icon="Coins"
        note={`${t("multiPost.creditRules", { x: creditsFor("twitter"), farcaster: creditsFor("farcaster"), other: DEFAULT_PLATFORM_CREDITS })} ${t("multiPost.payAsYouGoCredits", { price: CREDIT_PRICE_USD.toFixed(2) })}`}
      >
        <SettingsInfoRow icon="Coins" label={t("multiPost.credits", { count: status.data?.credits ?? 0 })} />
        <Divider />
        <View className="px-4 py-4">
          <View className="flex-row justify-between items-baseline mb-2">
            <Text className="text-white text-base leading-5 font-medium">{t("multiPost.topUpTitle")}</Text>
            <Text className="text-emerald-400 text-sm">
              {discount > 0 ? t("multiPost.discount", { percent: Math.round(discount * 100) }) : t("multiPost.noDiscount")}
            </Text>
          </View>
          <Slider
            minimumValue={0}
            maximumValue={BUNDLE_STOPS.length - 1}
            step={1}
            value={stopIndex}
            onValueChange={(v) => setStopIndex(Math.round(v))}
            minimumTrackTintColor="#F4F4F5"
            maximumTrackTintColor="rgba(255,255,255,0.18)"
            thumbTintColor="#FFFFFF"
            accessibilityLabel={t("multiPost.topUpTitle")}
          />
          <View className="flex-row justify-between">
            {BUNDLE_STOPS.map((s) => (
              <Text key={s} className="text-theme-neutrals-500" style={{ fontSize: 10 }}>{s >= 1000 ? `${s / 1000}k` : s}</Text>
            ))}
          </View>
          <View className="flex-row items-center justify-between mt-4">
            <View className="flex-1 mr-3">
              <Text className="text-white font-semibold">{t("multiPost.topUpCredits", { count: credits })}</Text>
              <Text className="text-theme-neutrals-400 text-xs mt-0.5">
                {t("multiPost.total", { usd: total.toFixed(2) })} · {t("multiPost.perCredit", { price: (total / credits).toFixed(3) })}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleBuy}
              disabled={buying}
              className="px-4 py-2.5 rounded-xl bg-white"
              style={{ opacity: buying ? 0.6 : 1 }}
              accessibilityRole="button"
            >
              <Text className="text-black font-semibold text-sm">{buying ? t("multiPost.buying") : t("multiPost.buy")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SettingsSection>

      <SettingsSection label={t("multiPost.connectedHeading")} icon="Link2">
        {status.isLoading ? (
          <ActivityIndicator className="my-4" color="#fff" />
        ) : status.isError ? (
          <Text className="text-red-400 text-sm p-4">{t("multiPost.loadFailed")}</Text>
        ) : accounts.length === 0 ? (
          <Text className="text-theme-neutrals-500 text-sm p-4">{t("multiPost.noAccounts")}</Text>
        ) : (
          accounts.map((a, i) => (
            <View key={a.id}>
              {i > 0 && <Divider />}
              <SettingsInfoRow
                icon={platformIcon(a.platform)}
                label={PLATFORM_NAMES[a.platform] ?? a.platform}
                description={a.pending ? t("multiPost.pendingApproval") : a.username ? `@${a.username.replace(/^@/, "")}` : undefined}
                right={
                  <View className="flex-row items-center gap-3">
                    {a.pending && a.approvalUrl ? (
                      <TouchableOpacity onPress={() => Linking.openURL(a.approvalUrl!)} accessibilityRole="button">
                        <Text className="text-white text-xs font-medium">{t("multiPost.approve")}</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity onPress={() => handleDisconnect(a.id)} accessibilityRole="button" accessibilityLabel={t("multiPost.disconnect")}>
                      <Text className="text-theme-neutrals-400 text-xs">{t("multiPost.disconnect")}</Text>
                    </TouchableOpacity>
                  </View>
                }
              />
            </View>
          ))
        )}
      </SettingsSection>

      <SettingsSection label={t("multiPost.connectMore")} icon="Plus" note={`${t("multiPost.platformNotes")} ${t("multiPost.farcasterNote")}`}>
        {MULTIPOST_PLATFORMS.map((platform, i) => (
          <View key={platform}>
            {i > 0 && <Divider />}
            <TouchableOpacity onPress={() => handleConnect(platform)} disabled={connecting !== null} activeOpacity={0.7}>
              <SettingsInfoRow
                icon={platformIcon(platform)}
                label={PLATFORM_NAMES[platform]}
                right={
                  connecting === platform ? (
                    <ActivityIndicator color="#fff" />
                  ) : connected.has(platform) ? (
                    <Icon name="Share2" size={16} color="#34D399" />
                  ) : (
                    <Text className="text-theme-neutrals-400 text-xs">{t("multiPost.connect")}</Text>
                  )
                }
              />
            </TouchableOpacity>
          </View>
        ))}
      </SettingsSection>
    </SettingsScrollView>
  );
};

export default MultiPostPanel;
