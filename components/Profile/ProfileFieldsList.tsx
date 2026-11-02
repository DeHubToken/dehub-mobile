import React from "react";
import { Linking, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { displayFieldUrl, fieldLink, presetById, presetOf, splitProfileFields } from "../../libs/profile-field-presets";
import { PROFILE_FIELD_ICONS } from "./ProfileFieldsEditor";

export type ProfileField = { name: string; value: string; verifiedAt?: string | null };

const ICON = "#A1A1AA";

/**
 * The profile's label/value lines under the bio — Mastodon's profile fields
 * (backend src/profile-fields). Website and the other link kinds are not
 * here: they show with the social links (ProfileLinksPill). A link whose page
 * links back to the profile with rel="me" shows a check. Same as web's
 * ProfileFieldsList.
 */
export default function ProfileFieldsList({ fields }: { fields?: ProfileField[] | null }) {
  const { t } = useTranslation();
  const { rest } = splitProfileFields(fields);
  if (!rest.length) return null;
  return (
    <View testID="profile-fields" className="mt-3" style={{ gap: 6 }}>
      {rest.map((field, index) => {
        const href = fieldLink(field.value);
        const verified = !!field.verifiedAt && !!href;
        const preset = presetOf(field.name);
        const label = preset === "custom"
          ? field.name
          : t(`profileFields.presets.${preset}`, { defaultValue: presetById(preset)!.name });
        return (
          <View key={`${field.name}-${index}`} className="flex-row items-center" style={{ gap: 8 }}>
            {preset === "custom" ? (
              <Text className="text-sm text-zinc-400" numberOfLines={1} style={{ maxWidth: 140, flexShrink: 0 }}>
                {label}
              </Text>
            ) : (
              <View accessible accessibilityLabel={label} style={{ flexShrink: 0 }}>
                <Icon name={PROFILE_FIELD_ICONS[preset]} size={16} color={ICON} />
              </View>
            )}
            {href ? (
              <TouchableOpacity className="flex-shrink" accessibilityRole="link" onPress={() => Linking.openURL(href).catch(() => {})}>
                <Text className="text-sm text-white/90" numberOfLines={1}>
                  {displayFieldUrl(field.value)}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text className="flex-shrink text-sm text-white/90" numberOfLines={1}>
                {field.value}
              </Text>
            )}
            {verified && (
              <View accessibilityLabel={t("profileFields.verified")}>
                <Icon name="CircleCheck" size={16} color="#34D399" />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
