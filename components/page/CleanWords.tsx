/**
 * Word tabs under a page's pill: the lit word bold with a white underline,
 * the rest quiet, one hairline under the row. The look Explore's category
 * words use, for any page with a few sorts. Twin of web's CleanWords.
 */
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export function CleanWords<T extends string>({
  items,
  value,
  onChange,
  gutter = 16,
}: {
  items: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  gutter?: number;
}) {
  return (
    <View style={{ marginHorizontal: gutter }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.words}>
        {items.map((item) => {
          const active = item.id === value;
          return (
            <Pressable
              key={item.id}
              onPress={() => onChange(item.id)}
              style={styles.word}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text className={active ? "text-white" : "text-theme-neutrals-500"} style={[styles.wordText, active && styles.wordTextActive]}>
                {item.label}
              </Text>
              {active ? <View className="bg-white" style={styles.underline} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
      <View className="bg-theme-neutrals-800" style={styles.hairline} />
    </View>
  );
}

const styles = StyleSheet.create({
  words: { gap: 20, paddingRight: 8 },
  word: { paddingTop: 6, paddingBottom: 10 },
  wordText: { fontSize: 15, fontWeight: "500" },
  wordTextActive: { fontWeight: "600" },
  underline: { position: "absolute", left: 0, right: 0, bottom: 0, height: 3, borderRadius: 2, zIndex: 1 },
  hairline: { height: StyleSheet.hairlineWidth },
});
