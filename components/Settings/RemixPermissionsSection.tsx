/**
 * Who may duet, stitch or react to your videos (Settings → Privacy). The
 * account default, the same three settings web keeps under Privacy
 * (DuetSetting, StitchPolicySetting and the reactions row). Read from the
 * public remix_settings table; saved through the remix-links function, which
 * enforces them when a remix is opened and again when it is posted.
 */
import React, { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import Icon, { type IconName } from "../ui/Icon";
import { SettingsSection, SettingsLinkRow, Divider } from "./SettingsPrimitives";
import { toastError } from "../../libs/toast";
import {
  getAccountRemixSettings,
  saveAccountRemixSetting,
  type RemixKind,
  type RemixPolicy,
  type RemixSettings,
} from "../../services/remix-links.service";

const POLICIES: RemixPolicy[] = ["everyone", "followers", "nobody"];

export default function RemixPermissionsSection({ address }: { address?: string | null }) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<RemixSettings>({ duet: "everyone", stitch: "everyone", react: "everyone" });
  const [picking, setPicking] = useState<RemixKind | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!address) return;
    let live = true;
    void getAccountRemixSettings(address).then((next) => { if (live) setSettings(next); }).catch(() => {});
    return () => { live = false; };
  }, [address]);

  if (!address) return null;

  const policyLabel = (policy: RemixPolicy) =>
    policy === "everyone" ? t("duet.policyEveryone", { defaultValue: "Everyone" })
      : policy === "followers" ? t("duet.policyFollowers", { defaultValue: "Followers" })
        : t("duet.policyNobody", { defaultValue: "No one" });

  const rows: Array<{ kind: RemixKind; icon: IconName; label: string; description: string }> = [
    {
      kind: "duet",
      icon: "Film",
      label: t("duet.allowLabel", { defaultValue: "Allow duets" }),
      description: t("duet.allowDescription", { defaultValue: "Who can record a duet next to your videos. You can change it on each post too." }),
    },
    {
      kind: "stitch",
      icon: "Scissors",
      label: t("remixLinks.stitch.allow", { defaultValue: "Allow stitches" }),
      description: t("remixLinks.stitch.allowDesc", { defaultValue: "Who can use up to 5 seconds of your videos in their own. You can change it per post too." }),
    },
    {
      kind: "react",
      icon: "MonitorPlay",
      label: t("reactions.allow", { defaultValue: "Allow reactions" }),
      description: t("reactions.allowDescription", { defaultValue: "Let other creators react to your videos, recorded or live. You can still change it on each post." }),
    },
  ];

  const choose = async (kind: RemixKind, value: RemixPolicy) => {
    setPicking(null);
    if (settings[kind] === value) return;
    const previous = settings;
    setSettings({ ...settings, [kind]: value });
    setSaving(true);
    try {
      await saveAccountRemixSetting(kind, value);
    } catch {
      setSettings(previous);
      toastError(kind === "stitch"
        ? t("remixLinks.stitch.saveFailed", { defaultValue: "Could not save your stitch setting. Try again." })
        : t("duet.saveFailed", { defaultValue: "Could not save. Try again." }));
    } finally {
      setSaving(false);
    }
  };

  const open = rows.find((row) => row.kind === picking);

  return (
    <>
      <SettingsSection label={t("remixLinks.settingsHeading", { defaultValue: "Remixes" })} icon="Film" anchor="remixes">
        {rows.map((row, index) => (
          <React.Fragment key={row.kind}>
            {index > 0 && <Divider />}
            <SettingsLinkRow
              icon={row.icon}
              label={row.label}
              description={row.description}
              value={policyLabel(settings[row.kind])}
              onPress={() => { if (!saving) setPicking(row.kind); }}
            />
          </React.Fragment>
        ))}
      </SettingsSection>

      <GlassModal scrollable visible={!!open} onClose={() => setPicking(null)} presentation="bottom" maxHeight="50%" blurIntensity={30}>
        <View className="pb-4 pt-2">
          <Text className="text-theme-neutrals-400 text-xs text-center py-3 font-semibold uppercase tracking-widest">
            {open?.label}
          </Text>
          {POLICIES.map((policy) => (
            <TouchableOpacity
              key={policy}
              onPress={() => { if (open) void choose(open.kind, policy); }}
              activeOpacity={0.7}
              className="flex-row items-center px-5 py-3.5"
            >
              <View className="flex-1">
                <Text className="text-white text-[15px] font-medium">{policyLabel(policy)}</Text>
              </View>
              {open && settings[open.kind] === policy && <Icon name="Check" size={18} color="#D4D4D8" />}
            </TouchableOpacity>
          ))}
        </View>
      </GlassModal>
    </>
  );
}
