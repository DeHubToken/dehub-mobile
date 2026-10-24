import React from "react";
import { Linking, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";

export type ProfileField = { name: string; value: string; verifiedAt?: string | null };

/** An https link in a field opens in the browser; anything else is plain text. */
function linkOf(value: string): string | null {
  if (!/^https:\/\/\S+$/i.test(value)) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

/**
 * The profile's label/value lines under the bio — Mastodon's profile fields
 * (backend src/profile-fields). A link whose page links back to the profile
 * with rel="me" shows a check. Same as web's ProfileFieldsList.
 */
export default function ProfileFieldsList({ fields }: { fields?: ProfileField[] | null }) {
  const { t } = useTranslation();
  if (!fields?.length) return null;
  return (
    <View testID="profile-fields" className="mt-3 overflow-hidden rounded-xl border border-white/10">
      {fields.map((field, index) => {
        const href = linkOf(field.value);
        const verified = !!field.verifiedAt && !!href;
        return (
          <View
            key={`${field.name}-${index}`}
            className={`flex-row items-center px-3 py-2 ${index > 0 ? "border-t border-white/5" : ""} ${verified ? "bg-emerald-500/10" : ""}`}
          >
            <Text className="w-28 text-xs font-semibold uppercase text-zinc-400" numberOfLines={1}>
              {field.name}
            </Text>
            {href ? (
              <TouchableOpacity className="flex-1" accessibilityRole="link" onPress={() => Linking.openURL(href).catch(() => {})}>
                <Text className="text-sm text-white underline" numberOfLines={1}>
                  {field.value.replace(/^https:\/\/(www\.)?/i, "").replace(/\/$/, "")}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text className="flex-1 text-sm text-white" numberOfLines={1}>
                {field.value}
              </Text>
            )}
            {verified && (
              <View accessibilityLabel={t("profileFields.verified")} className="ml-2">
                <Icon name="CircleCheck" size={16} color="#34D399" />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
