/**
 * The author thread under a post: the creator's opening comments (see
 * libs/author-thread), joined to each other by one line through the avatar
 * column. Rows are drawn by the caller so they keep every comment action.
 */
import React from "react";
import { StyleSheet, View } from "react-native";

interface Props<T extends { id: number | string }> {
  entries: T[];
  renderRow: (entry: T) => React.ReactNode;
}

export default function AuthorThreadBlock<T extends { id: number | string }>({ entries, renderRow }: Props<T>) {
  if (entries.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {/* Rows are px-8 with a 32pt avatar padded 10 from the top, so the line
          runs at x = 48 and meets each avatar's centre at y = 26. Segments per
          row, so it starts at the first avatar and stops at the last. */}
      {entries.map((entry, i) => (
        <View key={entry.id} style={styles.row}>
          {i > 0 && <View style={styles.above} pointerEvents="none" />}
          {i < entries.length - 1 && <View style={styles.below} pointerEvents="none" />}
          {renderRow(entry)}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 4 },
  row: { position: "relative" },
  above: { position: "absolute", left: 48, top: 0, height: 26, width: 1, backgroundColor: "rgba(255,255,255,0.2)" },
  below: { position: "absolute", left: 48, top: 26, bottom: 0, width: 1, backgroundColor: "rgba(255,255,255,0.2)" },
});
