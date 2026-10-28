/**
 * BuilderPreviewScreen — dehub.io/builder/preview/:id
 *
 * Native port of dehubweb's pages/app/BuilderPreviewPage.tsx: the public,
 * sign-in-free renderer for a Builder app. This is where a shared link lands.
 * The app loads from its own origin (<slug>.dhb.gg) once that answers;
 * private apps open only for their owner, through a signed address. Owners
 * get a Manage sheet (address, visibility, app store, versions).
 */
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { shareWithRef } from "../libs/shareRef";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import ScreenHeader from "../components/ScreenHeader";
import Icon from "../components/ui/Icon";
import { BuilderAppView } from "../components/Builder/BuilderParts";
import BuilderManageSheet from "../components/Builder/BuilderManageSheet";
import { openInApp } from "../libs/links.utils";
import { ScreenNames } from "../navigation/ScreenNames";
import type { AppStackParamList } from "../navigation/types";
import { useAuth } from "../context/AuthContext";
import {
  appHostReachable,
  builderApi,
  builderShareUrl,
  resolvePublicApp,
  type BuilderListing,
  type BuilderProject,
} from "../services/builder.service";

export default function BuilderPreviewScreen() {
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, ScreenNames.BuilderPreview>>();
  const id = params.id;
  const { user } = useAuth();
  const [nonce, setNonce] = useState(0);
  const [uri, setUri] = useState<string | null | undefined>(undefined);
  const [owned, setOwned] = useState<{ project: BuilderProject; listing: BuilderListing | null } | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const shareUrl = builderShareUrl(id);

  const load = useCallback(async () => {
    const owner = user ? await builderApi.get(id).catch(() => null) : null;
    setOwned(owner);
    let next: string | null = null;
    if (owner?.project.slug) {
      const { url } = await builderApi.previewUrl(id).catch(() => ({ url: "" }));
      if (url && (await appHostReachable(url))) next = `${url}?v=${owner.project.version}`;
    } else {
      const app = await resolvePublicApp(id).catch(() => null);
      if (app?.url && (await appHostReachable(app.url))) next = `${app.url}?v=${app.version}`;
    }
    setUri(next);
  }, [id, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const buttons = [
    ...(owned ? [{ key: "manage", icon: "Settings" as const, label: t("builder.manage.open"), run: () => setManageOpen(true) }] : []),
    { key: "reload", icon: "RefreshCw" as const, label: t("builder.reload"), run: () => setNonce((n) => n + 1) },
    { key: "open", icon: "Compass" as const, label: t("builder.openInBrowser"), run: () => void openInApp(shareUrl) },
    {
      key: "share",
      icon: "Share2" as const,
      label: t("postOptions.share"),
      run: () => void shareWithRef({ message: `${t("builder.previewHint")}\n${shareUrl}`, url: shareUrl }).catch(() => {}),
    },
  ];

  return (
    <View className="flex-1 bg-theme-background">
      <ScreenHeader
        title={t("builder.preview")}
        subtitle={t("builder.previewHint")}
        rightContent={
          <View style={{ flexDirection: "row", gap: 14 }}>
            {buttons.map((b) => (
              <Pressable key={b.key} onPress={b.run} accessibilityRole="button" accessibilityLabel={b.label} hitSlop={8} style={{ padding: 4 }}>
                <Icon name={b.icon} size={19} color="#fff" />
              </Pressable>
            ))}
          </View>
        }
      />
      {/* No insets.bottom here: the root SafeAreaView in App.tsx already pays it. */}
      <View style={{ flex: 1 }}>
        {uri !== undefined && <BuilderAppView projectId={id} nonce={nonce} uri={uri} version={owned?.project.version} />}
      </View>
      {owned && (
        <BuilderManageSheet
          visible={manageOpen}
          onClose={() => setManageOpen(false)}
          project={owned.project}
          listing={owned.listing}
          onChanged={() => void load()}
        />
      )}
    </View>
  );
}
