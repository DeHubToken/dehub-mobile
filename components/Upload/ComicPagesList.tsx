import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";

const CAPTION_MAX = 500;

export interface ComicPage {
  uri: string;
  caption?: string;
  description?: string;
}

/**
 * The Comic tab's captions: one row per page, in the order of the photo strip
 * above (which reorders, edits and removes). Each page gets a caption shown on
 * the card, and alt text through the same sheet the strip uses.
 */
export default function ComicPagesList({ pages, limit, onCaption, onAlt }: {
  pages: ComicPage[];
  limit: number;
  onCaption: (index: number, caption: string) => void;
  onAlt: (index: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={{ marginTop: 14, gap: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
          {t("comic.editor.count", { defaultValue: "{{count}} of {{limit}} pages", count: pages.length, limit })}
        </Text>
        {pages.length > 1 ? (
          <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
            {t("comic.editor.coverHint", { defaultValue: "Page 1 is the cover" })}
          </Text>
        ) : null}
      </View>
      {pages.length === 0 ? (
        <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, lineHeight: 18 }}>
          {t("comic.editor.empty", { defaultValue: "Add your pages with the photo button. Each page gets a caption and alt text." })}
        </Text>
      ) : null}
      {pages.map((page, i) => (
        <View
          key={`${page.uri}-${i}`}
          style={{ flexDirection: "row", gap: 10, padding: 8, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)" }}
        >
          <View style={{ alignItems: "center", gap: 4 }}>
            <Image source={{ uri: page.uri }} style={{ width: 56, height: 72, borderRadius: 8 }} contentFit="cover" />
            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontFamily: "monospace" }}>
              {i === 0 ? t("comic.editor.cover", { defaultValue: "Cover" }) : String(i + 1).padStart(2, "0")}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <TextInput
              value={page.caption ?? ""}
              onChangeText={text => onCaption(i, text.slice(0, CAPTION_MAX))}
              maxLength={CAPTION_MAX}
              multiline
              placeholder={t("comic.editor.caption", { defaultValue: "Caption for this page" })}
              placeholderTextColor="rgba(255,255,255,0.4)"
              style={{ color: "#fff", fontSize: 14, minHeight: 40, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(0,0,0,0.25)" }}
            />
            <Pressable
              onPress={() => onAlt(i)}
              accessibilityRole="button"
              style={{ paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(0,0,0,0.25)" }}
            >
              <Text numberOfLines={1} style={{ color: page.description ? "#fff" : "rgba(255,255,255,0.4)", fontSize: 12 }}>
                {page.description || t("comic.editor.alt", { defaultValue: "Alt text: what the page shows" })}
              </Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}
