import React, { useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "../../context/AuthContext";
import { toastError, toastSuccess } from "../../libs/toast";
import { openExternalLink } from "../../libs/links.utils";
import Icon from "../ui/Icon";
import { GITHUB_SVG_XML } from "../../config/socialIcons";
import { GITHUB_REDIRECT, githubLink, githubProfileUrl, githubResultFrom } from "../../services/github-link.service";

/**
 * GitHub on Edit profile. No box to type in, unlike the rows above it: the
 * account is proven by signing in to GitHub in the in-app browser, so a
 * profile can only ever show a GitHub its owner controls.
 */
const GithubLinkRow: React.FC = () => {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth() as any;
  const wallet = user?.walletAddress || user?.address;
  const [busy, setBusy] = useState(false);
  const status = useQuery({ queryKey: ["github-link", wallet], queryFn: githubLink.status, enabled: !!wallet, staleTime: 30_000 });
  const data = status.data;

  const done = async () => {
    await status.refetch();
    await refreshUser?.().catch(() => undefined);
  };

  const connect = async () => {
    setBusy(true);
    try {
      const result = await WebBrowser.openAuthSessionAsync(await githubLink.connect(), GITHUB_REDIRECT);
      const outcome = result.type === "success" ? githubResultFrom(result.url) : null;
      if (outcome === "connected") toastSuccess(t("githubLink.connected"));
      else if (outcome === "taken") toastError(t("githubLink.taken"));
      else if (outcome === "failed") toastError(t("githubLink.failed"));
      await done();
    } catch (e) {
      toastError(e, t("githubLink.failed"));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await githubLink.disconnect();
      await done();
      toastSuccess(t("githubLink.disconnected"));
    } catch (e) {
      toastError(e, t("githubLink.failed"));
    } finally {
      setBusy(false);
    }
  };

  const connected = !!(data?.connected && data.login);
  const unavailable = !!data && !data.available;

  return (
    <View>
      <View className="flex-row items-center bg-theme-neutrals-900 rounded-xl border border-theme-neutrals-700 overflow-hidden">
        <View className="pl-3.5 pr-2.5 py-3">
          <SvgXml xml={GITHUB_SVG_XML.replace(/currentColor/g, "#9ca3af")} width={18} height={18} />
        </View>
        {status.isPending ? (
          <View className="flex-1 py-3 pr-4"><ActivityIndicator size="small" color="#9ca3af" /></View>
        ) : connected ? (
          <TouchableOpacity
            className="flex-1 flex-row items-center py-3 pr-2"
            style={{ gap: 6, minWidth: 0 }}
            onPress={() => openExternalLink(githubProfileUrl(data!.login!))}
            accessibilityRole="link"
            accessibilityLabel={`${t("githubLink.verifiedAria")} @${data!.login}`}
          >
            <Text className="text-white text-base flex-shrink" numberOfLines={1}>@{data!.login}</Text>
            <Icon name="CircleCheck" size={16} color="#34D399" />
          </TouchableOpacity>
        ) : (
          <Text className="flex-1 text-neutral-500 text-base py-3 pr-2">GitHub</Text>
        )}
        {!status.isPending ? (
          <TouchableOpacity
            accessibilityRole="button"
            disabled={busy || (!connected && (unavailable || status.isError))}
            onPress={() => void (connected ? disconnect() : connect())}
            className="mr-2 rounded-lg border border-theme-neutrals-700 px-3 py-1.5"
            style={{ opacity: busy || (!connected && (unavailable || status.isError)) ? 0.5 : 1 }}
          >
            <Text className="text-theme-neutrals-100 text-sm">
              {connected ? t("githubLink.disconnect") : t("githubLink.connect")}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {!connected && !status.isPending ? (
        <Text className="text-neutral-500 text-xs mt-2 ml-1">
          {unavailable ? t("githubLink.unavailable") : t("githubLink.hint")}
        </Text>
      ) : null}
    </View>
  );
};

export default GithubLinkRow;
