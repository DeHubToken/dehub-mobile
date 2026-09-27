/**
 * BuilderPreviewScreen — dehub.io/builder/preview/:id
 *
 * Native port of dehubweb's pages/app/BuilderPreviewPage.tsx: the public,
 * sign-in-free renderer for a Builder app. This is where a shared link lands.
 */
import React, { useState } from "react";
import { Pressable, Share, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import ScreenHeader from "../components/ScreenHeader";
import Icon from "../components/ui/Icon";
import { BuilderAppView } from "../components/Builder/BuilderParts";
import { openInApp } from "../libs/links.utils";
import { ScreenNames } from "../navigation/ScreenNames";
import type { AppStackParamList } from "../navigation/types";
import { builderShareUrl } from "../services/builder.service";

export default function BuilderPreviewScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { params } = useRoute<RouteProp<AppStackParamList, ScreenNames.BuilderPreview>>();
  const id = params.id;
  const [nonce, setNonce] = useState(0);
  const shareUrl = builderShareUrl(id);

  const buttons = [
    { key: "reload", icon: "RefreshCw" as const, label: t("builder.reload"), run: () => setNonce((n) => n + 1) },
    { key: "open", icon: "Compass" as const, label: t("builder.openInBrowser"), run: () => void openInApp(shareUrl) },
    {
      key: "share",
      icon: "Share2" as const,
      label: t("postOptions.share"),
      run: () => void Share.share({ message: `${t("builder.previewHint")}\n${shareUrl}`, url: shareUrl }).catch(() => {}),
    },
  ];

  return (
    <View style={styles.screen}>
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
      <View style={{ flex: 1, paddingBottom: insets.bottom }}>
        <BuilderAppView projectId={id} nonce={nonce} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
});
