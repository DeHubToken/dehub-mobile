/**
 * The pieces every fraction sheet is built from: the bottom drawer, a summary
 * panel, notes and warnings, the quantity picker, and the primary button. Kept
 * together so buy, sell and offer read as one flow and cannot drift apart.
 */
import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator } from "react-native";
import Slider from "@react-native-community/slider";
import GlassModal from "../ui/GlassModal";
import Icon, { type IconName } from "../ui/Icon";
import { clampInt, WARN } from "./fractionFormat";

export const FractionSheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  busy?: boolean;
  title: string;
  children: React.ReactNode;
}> = ({ visible, onClose, busy, title, children }) => (
  <GlassModal
    visible={visible}
    onClose={() => {
      if (!busy) onClose();
    }}
    presentation="bottom"
    dismissible={!busy}
    maxHeight="88%"
  >
    <View style={styles.sheet}>
      <View style={styles.grabber} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.body}
      >
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {children}
      </ScrollView>
    </View>
  </GlassModal>
);

export const Panel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={styles.panel}>{children}</View>
);

export const PanelRow: React.FC<{ label: string; children: React.ReactNode; strong?: boolean }> = ({
  label,
  children,
  strong,
}) => (
  <View style={[styles.row, strong && styles.rowStrong]}>
    <Text style={strong ? styles.rowLabelStrong : styles.rowLabel}>{label}</Text>
    <View style={styles.rowValue}>{children}</View>
  </View>
);

export const Note: React.FC<{ text: string; warn?: boolean; icon?: IconName }> = ({ text, warn, icon }) => (
  <View style={[styles.note, warn && styles.noteWarn]}>
    <Icon name={icon || (warn ? "TriangleAlert" : "Info")} size={14} color={warn ? WARN : "#808089"} />
    <Text style={[styles.noteText, warn && styles.noteTextWarn]}>{text}</Text>
  </View>
);

export const PrimaryButton: React.FC<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  secondary?: boolean;
}> = ({ label, onPress, disabled, loading, icon, secondary }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled || loading}
    accessibilityRole="button"
    accessibilityLabel={label}
    style={[styles.btn, secondary && styles.btnSecondary, (disabled || loading) && styles.btnDisabled]}
  >
    {loading ? (
      <ActivityIndicator size="small" color={secondary ? "#FFFFFF" : "#09090B"} />
    ) : (
      !!icon && <Icon name={icon} size={16} color={secondary ? "#FFFFFF" : "#09090B"} />
    )}
    <Text style={[styles.btnText, secondary && styles.btnTextSecondary]}>{label}</Text>
  </Pressable>
);

/** Slider plus a typed box, both clamped to [1, max]. */
export const QuantityPicker: React.FC<{
  label: string;
  hint: string;
  value: number;
  max: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}> = ({ label, hint, value, max, onChange, disabled }) => (
  <View style={styles.qty}>
    <View style={styles.qtyHead}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldHint}>{hint}</Text>
    </View>
    <View style={styles.qtyRow}>
      <Slider
        style={styles.slider}
        minimumValue={1}
        maximumValue={Math.max(1, max)}
        step={1}
        value={value}
        onValueChange={(v) => onChange(Math.round(v))}
        disabled={disabled || max <= 1}
        minimumTrackTintColor="#F4F4F5"
        maximumTrackTintColor="rgba(255,255,255,0.18)"
        thumbTintColor="#FFFFFF"
      />
      <TextInput
        value={value ? String(value) : ""}
        onChangeText={(txt) => onChange(clampInt(txt, 1, Math.max(1, max)))}
        keyboardType="number-pad"
        editable={!disabled}
        style={styles.qtyInput}
        accessibilityLabel={label}
      />
    </View>
  </View>
);

/** A labelled number box with a unit on the right. */
export const NumberField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit?: React.ReactNode;
  decimal?: boolean;
  right?: React.ReactNode;
}> = ({ label, value, onChange, unit, decimal, right }) => (
  <View style={styles.field}>
    <View style={styles.qtyHead}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {right}
    </View>
    <View style={styles.inputWrap}>
      <TextInput
        value={value}
        onChangeText={(txt) => onChange(decimal ? txt.replace(",", ".").replace(/[^\d.]/g, "") : txt.replace(/[^\d]/g, ""))}
        keyboardType={decimal ? "decimal-pad" : "number-pad"}
        placeholder={decimal ? "0.00" : "0"}
        placeholderTextColor="#52525B"
        style={styles.input}
        accessibilityLabel={label}
      />
      {unit}
    </View>
  </View>
);

export const sheetStyles = StyleSheet.create({
  value: { color: "#FFFFFF", fontSize: 13, flexShrink: 0 },
  valueStrong: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", flexShrink: 0 },
  sub: { color: "#808089", fontSize: 11, textAlign: "right" },
  center: { color: "#A1A1AA", fontSize: 13, textAlign: "center", paddingVertical: 18, lineHeight: 19 },
  footnote: { color: "#808089", fontSize: 11.5, textAlign: "center", lineHeight: 17 },
  link: { color: "#A1A1AA", fontSize: 12, fontWeight: "600" },
});

const styles = StyleSheet.create({
  sheet: { paddingTop: 8 },
  grabber: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.22)",
    marginBottom: 12,
  },
  body: { paddingHorizontal: 18, paddingBottom: 26, gap: 14 },
  title: { color: "#FFFFFF", fontSize: 19, fontWeight: "700" },

  panel: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 10,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  rowStrong: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.10)", paddingTop: 10 },
  rowLabel: { color: "#A1A1AA", fontSize: 13, flexShrink: 1 },
  rowLabelStrong: { color: "#FFFFFF", fontSize: 14, fontWeight: "600", flexShrink: 1 },
  rowValue: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },

  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  noteWarn: { backgroundColor: "rgba(252,211,77,0.08)", borderColor: "rgba(252,211,77,0.22)" },
  noteText: { flex: 1, color: "#A1A1AA", fontSize: 12, lineHeight: 17 },
  noteTextWarn: { color: "#FDE68A" },

  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#F4F4F5",
  },
  btnSecondary: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  btnDisabled: { opacity: 0.45 },
  // The accent is near-white, so its foreground has to be the near-black.
  btnText: { color: "#09090B", fontSize: 15, fontWeight: "700", flexShrink: 0 },
  btnTextSecondary: { color: "#FFFFFF" },

  qty: { gap: 8 },
  field: { gap: 8 },
  qtyHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  fieldLabel: { color: "#A1A1AA", fontSize: 13, flexShrink: 1 },
  fieldHint: { color: "#808089", fontSize: 11.5, flexShrink: 1, textAlign: "right" },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  slider: { flex: 1, height: 36 },
  qtyInput: {
    width: 76,
    textAlign: "center",
    color: "#FFFFFF",
    fontSize: 15,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  input: { flex: 1, color: "#FFFFFF", fontSize: 16, paddingVertical: 12 },
});
