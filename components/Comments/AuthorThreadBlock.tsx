/**
 * The author thread under a post: the creator's opening comments (see
 * libs/author-thread). A "Thread · N parts" marker sits right under the
 * post's buttons and one line runs from it down through every part's avatar,
 * so the parts read as the post carrying on, not as comments. Rows are drawn
 * by the caller so they keep every comment action.
 *
 * The post's author also gets their tools under it, as on web (AuthorThread):
 * "Add to thread" brings up the comment box, and with two or more parts
 * "Reorder" turns the block into a list they can put in order by holding and
 * dragging a part, or with its arrows, then saving.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import PrimaryButton from "../ui/PrimaryButton";
import { ReorderItem, justDropped, useReorder } from "../common/Reorder";
import { isLightTone, colors } from "../../theme/colors";

interface AuthorTools {
  /** Bring up the comment box to write the next part. */
  onAddPart: () => void;
  /** Save the parts in this order, first to last. Rejects when it fails. */
  onSaveOrder: (ids: string[]) => Promise<void>;
}

interface Props<T extends { id: number | string }> {
  entries: T[];
  renderRow: (entry: T) => React.ReactNode;
  /** The one line a part shows while reordering. */
  summarize?: (entry: T) => string;
  /** Present only when the viewer wrote the post. */
  author?: AuthorTools;
}

/** The post's avatar is centred 32 in from the screen edge; the line runs there. */
const LINE_X = 32;
/** A comment row's 32pt avatar starts 10 below the row's top. */
const AVATAR_TOP = 10;
const TOOL_HEIGHT = 34;
const PLUS_SIZE = 24;
/** Every reorder row is the same height, which is what the drag's slots need. */
const ROW_HEIGHT = 64;
const ROW_GAP = 6;

export default function AuthorThreadBlock<T extends { id: number | string }>({ entries, renderRow, summarize, author }: Props<T>) {
  const [reordering, setReordering] = useState(false);
  // Where the line stops: the last part's avatar, or the author's "+".
  const [lineEnd, setLineEnd] = useState(0);
  const { t } = useTranslation();
  const light = isLightTone();
  const line = light ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.24)";

  // Fewer than two parts leaves nothing to put in order.
  useEffect(() => { if (entries.length < 2) setReordering(false); }, [entries.length]);

  if (entries.length === 0 && !author) return null;

  if (reordering && author) {
    return (
      <ThreadReorder
        entries={entries}
        summarize={summarize ?? (() => "")}
        onSave={author.onSaveOrder}
        onClose={() => setReordering(false)}
      />
    );
  }

  const hasParts = entries.length > 0;
  return (
    <View>
      {hasParts && lineEnd > 0 && (
        <View pointerEvents="none" style={[styles.line, { height: lineEnd, backgroundColor: line }]} />
      )}
      {hasParts && (
        <View style={styles.bridge}>
          {/* A ring drawn as two fills: light themes drop borders on small round views. */}
          <View style={[styles.ring, { backgroundColor: line }]}>
            <View style={[styles.ringInner, { backgroundColor: colors.background }]}>
              <Icon name="MessageSquareText" size={12} color={colors.mutedForeground} />
            </View>
          </View>
          <Text style={[styles.bridgeLabel, { color: colors.mutedForeground }]}>
            {t("comments.threadParts.label", { count: entries.length + 1 })}
          </Text>
        </View>
      )}
      {/* The caller pads rows 32 for normal comments; parts step out 16 so
          their avatars sit under the post's own avatar, on the line. */}
      {entries.map((entry, i) => (
        <View
          key={entry.id}
          style={styles.row}
          onLayout={!author && i === entries.length - 1 ? (e) => setLineEnd(e.nativeEvent.layout.y + AVATAR_TOP) : undefined}
        >
          {renderRow(entry)}
        </View>
      ))}
      {author && (
        <View
          style={styles.tools}
          onLayout={hasParts ? (e) => setLineEnd(e.nativeEvent.layout.y + 2 + (TOOL_HEIGHT - PLUS_SIZE) / 2) : undefined}
        >
          <Pressable
            onPress={author.onAddPart}
            accessibilityRole="button"
            style={({ pressed }) => [styles.tool, pressed && styles.pressed]}
            hitSlop={6}
          >
            <View style={[styles.ring, styles.plus, { backgroundColor: line }]}>
              <View style={[styles.ringInner, { backgroundColor: colors.background }]}>
                <Icon name="Plus" size={14} color={colors.mutedForeground} />
              </View>
            </View>
            <Text style={[styles.toolText, { color: colors.mutedForeground }]}>{t("comments.threadParts.addPart")}</Text>
          </Pressable>
          {entries.length >= 2 && (
            <Pressable
              onPress={() => setReordering(true)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.tool, pressed && styles.pressed]}
              hitSlop={6}
            >
              <Icon name="ArrowUpDown" size={16} color={colors.mutedForeground} />
              <Text style={[styles.toolText, { color: colors.mutedForeground }]}>{t("comments.threadParts.reorder")}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function ThreadReorder<T extends { id: number | string }>({
  entries,
  summarize,
  onSave,
  onClose,
}: {
  entries: T[];
  summarize: (entry: T) => string;
  onSave: (ids: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [ids, setIds] = useState(() => entries.map((e) => String(e.id)));
  const [saving, setSaving] = useState(false);
  const byId = useMemo(() => new Map(entries.map((e) => [String(e.id), e])), [entries]);
  const reorder = useReorder({ ids, onCommit: setIds, disabled: saving, liftScale: 1.02 });
  const light = isLightTone();
  const rowBg = light ? "rgba(0,0,0,0.035)" : "rgba(255,255,255,0.06)";
  const rowBorder = light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)";
  const numBg = light ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.1)";
  const changed = ids.some((id, i) => id !== String(entries[i]?.id));

  const move = (id: string, delta: number) => {
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, id);
    // The two parts glide past each other instead of jumping.
    reorder.animateChange(() => setIds(next), next);
  };

  const save = async () => {
    if (!changed) { onClose(); return; }
    setSaving(true);
    try {
      await onSave(ids);
      onClose();
    } catch {
      setSaving(false);
    }
  };

  return (
    <View style={styles.reorderWrap}>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>{t("comments.threadParts.reorderHint")}</Text>
      <View>
        {reorder.order.map((id, index) => {
          const entry = byId.get(id);
          if (!entry) return null;
          const lifted = reorder.draggingId === id;
          return (
            <ReorderItem key={id} id={id} ctx={reorder.ctx} style={{ height: ROW_HEIGHT + ROW_GAP, paddingBottom: ROW_GAP }}>
              <View
                style={[
                  styles.partRow,
                  { backgroundColor: lifted ? (light ? "#FFFFFF" : "rgba(255,255,255,0.14)") : rowBg, borderColor: rowBorder },
                ]}
              >
                <View style={[styles.num, { backgroundColor: numBg }]}>
                  <Text style={[styles.numText, { color: colors.foreground }]}>{index + 1}</Text>
                </View>
                <Text style={[styles.partText, { color: colors.foreground }]} numberOfLines={2}>
                  {summarize(entry) || "…"}
                </Text>
                <Pressable
                  onPress={() => { if (!justDropped()) move(id, -1); }}
                  disabled={index === 0 || saving}
                  accessibilityRole="button"
                  accessibilityLabel={t("comments.threadParts.moveUp", { n: index + 1 })}
                  hitSlop={4}
                  style={[styles.arrow, (index === 0 || saving) && styles.dim]}
                >
                  <Icon name="ChevronUp" size={18} color={colors.foreground} />
                </Pressable>
                <Pressable
                  onPress={() => { if (!justDropped()) move(id, 1); }}
                  disabled={index === reorder.order.length - 1 || saving}
                  accessibilityRole="button"
                  accessibilityLabel={t("comments.threadParts.moveDown", { n: index + 1 })}
                  hitSlop={4}
                  style={[styles.arrow, (index === reorder.order.length - 1 || saving) && styles.dim]}
                >
                  <Icon name="ChevronDown" size={18} color={colors.foreground} />
                </Pressable>
                <View style={styles.grip} pointerEvents="none">
                  <Icon name="Grip" size={16} color={colors.mutedForeground} />
                </View>
              </View>
            </ReorderItem>
          );
        })}
      </View>
      <View style={styles.actions}>
        <Pressable onPress={onClose} disabled={saving} accessibilityRole="button" style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
          <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>{t("common.cancel")}</Text>
        </Pressable>
        {/* The theme's own primary button, so Save matches every theme. */}
        <PrimaryButton title={t("comments.threadParts.save")} onPress={() => { void save(); }} disabled={saving} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { position: "absolute", left: LINE_X - 1, top: 0, width: 2, borderRadius: 1 },
  bridge: { height: 34, flexDirection: "row", alignItems: "center", paddingLeft: LINE_X - 12 },
  ring: { width: 24, height: 24, borderRadius: 12, padding: 1.5 },
  ringInner: { flex: 1, alignSelf: "stretch", borderRadius: 12, alignItems: "center", justifyContent: "center" },
  bridgeLabel: { fontSize: 12, fontWeight: "600", marginLeft: 8 },
  row: { marginLeft: -16 },
  tools: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: LINE_X - 12 - 8, paddingTop: 2, paddingBottom: 6 },
  tool: { flexDirection: "row", alignItems: "center", gap: 6, height: TOOL_HEIGHT, paddingHorizontal: 8, borderRadius: TOOL_HEIGHT / 2 },
  pressed: { opacity: 0.6 },
  plus: { width: PLUS_SIZE, height: PLUS_SIZE, borderRadius: PLUS_SIZE / 2 },
  toolText: { fontSize: 13, fontWeight: "500" },
  reorderWrap: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6 },
  hint: { fontSize: 12, marginBottom: 8, paddingHorizontal: 4 },
  partRow: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 10,
    paddingRight: 4,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  numText: { fontSize: 11, fontWeight: "600" },
  partText: { flex: 1, fontSize: 14, lineHeight: 19 },
  arrow: { width: 34, height: 40, alignItems: "center", justifyContent: "center" },
  dim: { opacity: 0.25 },
  grip: { width: 24, alignItems: "center", justifyContent: "center" },
  actions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 6 },
  cancel: { height: 40, paddingHorizontal: 14, justifyContent: "center", borderRadius: 20 },
  cancelText: { fontSize: 14 },
});
