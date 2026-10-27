/**
 * Owner controls for a Builder app — native port of dehubweb's
 * components/builder/BuilderManageSheet.tsx: the app's own address
 * (<slug>.dehub.app), public/private, publishing to the DeHub app store, and
 * every saved version with one-tap restore.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import CustomSwitch from "../ui/CustomSwitch";
import { toastError, toastSuccess } from "../../libs/toast";
import { openInApp } from "../../libs/links.utils";
import { SHARE_ORIGIN } from "../../libs/dehub-links";
import {
  BUILDER_APPS_DOMAIN,
  builderApi,
  builderAppUrl,
  type BuilderListing,
  type BuilderProject,
  type BuilderVersion,
} from "../../services/builder.service";

interface Props {
  visible: boolean;
  onClose: () => void;
  project: BuilderProject;
  listing: BuilderListing | null;
  onChanged: () => void;
}

function Btn({ label, onPress, disabled, primary }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: primary ? "#fff" : "rgba(255,255,255,0.1)",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ color: primary ? "#000" : "#fff", fontSize: 13, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

const h = { color: "#fff", fontSize: 14, fontWeight: "600" as const, marginBottom: 6 };
const dim = { color: "#949499", fontSize: 12 };

export default function BuilderManageSheet({ visible, onClose, project, listing, onChanged }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [slug, setSlug] = useState(project.slug ?? "");
  const [versions, setVersions] = useState<BuilderVersion[] | null>(null);

  useEffect(() => setSlug(project.slug ?? ""), [project.slug]);

  const loadVersions = useCallback(() => {
    builderApi.versions(project.id).then((r) => setVersions(r.versions)).catch(() => setVersions([]));
  }, [project.id]);

  useEffect(() => {
    if (visible) loadVersions();
  }, [visible, loadVersions, project.version]);

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) toastSuccess(done);
      onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const url = project.slug ? builderAppUrl(project.slug) : null;
  const published = !!listing?.published;

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom" scrollable>
      <View style={{ padding: 20, gap: 22 }}>
        <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700" }}>
          {project.emoji} {project.name}
        </Text>

        <View>
          <Text style={h}>{t("builder.manage.address")}</Text>
          {url && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <Text style={{ color: "#fff", flex: 1 }} numberOfLines={1} onPress={() => void openInApp(url)}>
                {url}
              </Text>
              <Btn
                label={t("builder.manage.copy")}
                onPress={() => void Clipboard.setStringAsync(url).then(() => toastSuccess(t("builder.manage.copied")))}
              />
            </View>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TextInput
              value={slug}
              onChangeText={(v) => setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              maxLength={40}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={t("builder.manage.address")}
              style={{ flex: 1, color: "#fff", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }}
            />
            <Text style={dim}>.{BUILDER_APPS_DOMAIN}</Text>
            <Btn
              primary
              label={t("builder.manage.save")}
              disabled={!slug || slug === project.slug || busy}
              onPress={() => void run(() => builderApi.setSlug(project.id, slug), t("builder.manage.addressSaved"))}
            />
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={h}>{t("builder.manage.public")}</Text>
            <Text style={dim}>{project.is_public ? t("builder.manage.publicHint") : t("builder.manage.privateHint")}</Text>
          </View>
          <CustomSwitch
            value={project.is_public}
            disabled={busy}
            accessibilityLabel={t("builder.manage.public")}
            onValueChange={(v) => void run(() => builderApi.setVisibility(project.id, v))}
          />
        </View>

        <View>
          <Text style={h}>{t("builder.manage.store")}</Text>
          {published ? (
            <>
              <Text style={[dim, { marginBottom: 8 }]}>
                {listing?.tier === "unlisted" ? t("builder.manage.inStoreUnreviewed") : t("builder.manage.inStore")}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Btn label={t("builder.manage.viewInStore")} onPress={() => void openInApp(`${SHARE_ORIGIN}/apps/${listing!.slug}`)} />
                <Btn
                  label={t("builder.manage.unpublish")}
                  disabled={busy}
                  onPress={() => void run(() => builderApi.unpublish(project.id), t("builder.manage.unpublished"))}
                />
              </View>
            </>
          ) : (
            <>
              <Text style={[dim, { marginBottom: 8 }]}>{t("builder.manage.publishHint")}</Text>
              <View style={{ flexDirection: "row" }}>
                <Btn
                  primary
                  label={t("builder.manage.publish")}
                  disabled={busy || project.version < 1}
                  onPress={() => void run(() => builderApi.publish(project.id), t("builder.manage.publishedToast"))}
                />
              </View>
            </>
          )}
        </View>

        <View>
          <Text style={h}>{t("builder.manage.versions")}</Text>
          {versions === null ? (
            <ActivityIndicator color="#fff" />
          ) : versions.length === 0 ? (
            <Text style={dim}>{t("builder.manage.noVersions")}</Text>
          ) : (
            versions.map((v) => (
              <View key={v.version} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>
                    v{v.version} · {new Date(v.created_at).toLocaleString()}
                  </Text>
                  {!!v.summary && (
                    <Text style={dim} numberOfLines={2}>
                      {v.summary}
                    </Text>
                  )}
                </View>
                {v.version === project.version ? (
                  <Text style={dim}>{t("builder.manage.current")}</Text>
                ) : (
                  <Btn
                    label={t("builder.manage.restore")}
                    disabled={busy}
                    onPress={() =>
                      void run(() => builderApi.restore(project.id, v.version), t("builder.manage.restored", { version: v.version }))
                    }
                  />
                )}
              </View>
            ))
          )}
        </View>
      </View>
    </GlassModal>
  );
}
