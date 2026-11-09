/**
 * Confirm before paying to open a locked DM photo or video.
 *
 * Price, who gets paid, Close or Pay. Paying and confirming show on the Pay
 * button rather than as toasts, then a short tick, then the caller closes the
 * sheet and the photo opens with a reveal. Same look as the PPV sheet.
 */
import React, { useEffect } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, { Easing, FadeInDown, ZoomIn, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import SmartImage from "../common/SmartImage";
import { SHEET_GLASS_FILL } from "../../theme/sheetGlass";
import { SheetGlassFill } from "../ui/SheetGlass";
import SheetBackdrop, { useSheetBackdrop } from "../ui/SheetBackdrop";
import { useSheetClosed } from "../../hooks/useSheetClosed";

export type UnlockPhase = "idle" | "paying" | "confirming" | "done";

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  who: string;
  sub: string;
  previewUri?: string;
  priceLabel: string;
  dhbLabel: string;
  phase: UnlockPhase;
  doneLabel: string;
  onPay: () => void;
}

const HIDE = 520;

export default function UnlockConfirmSheet({ visible, onClose, title, who, sub, previewUri, priceLabel, dhbLabel, phase, doneLabel, onPay }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const backdrop = useSheetBackdrop();
  const [isFullyClosed, setIsFullyClosed] = useSheetClosed(visible);
  const busy = phase === "paying" || phase === "confirming";
  const y = useSharedValue(HIDE);
  const fade = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setIsFullyClosed(false);
      y.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
      fade.value = withTiming(1, { duration: 250 });
    } else {
      y.value = withTiming(HIDE, { duration: 220, easing: Easing.in(Easing.cubic) }, () => runOnJS(setIsFullyClosed)(true));
      fade.value = withTiming(0, { duration: 180 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const close = () => { if (!busy) onClose(); };

  if (!visible && isFullyClosed) return null;

  return (
    <Modal visible={visible || !isFullyClosed} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <SheetBackdrop backdrop={backdrop} />
        <Pressable style={{ flex: 1 }} onPress={close} />
      </Animated.View>
      <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }, sheetStyle]} testID="unlock-confirm-sheet">
        <SheetGlassFill backdropBlurred={backdrop.blurred} style={[StyleSheet.absoluteFill, styles.overlay]} />
        <View style={styles.handleWrap}><View style={styles.handle} /></View>
        {phase === "done" ? (
          <View style={styles.doneWrap}>
            <Animated.View entering={ZoomIn.duration(350).springify().damping(12)} style={styles.doneCircle}>
              <Icon name="Check" size={28} color="#F9FBFF" />
            </Animated.View>
            <Animated.Text entering={FadeInDown.delay(120).duration(300)} style={styles.doneTitle}>
              {t("dmPaidLock.unlocked", "Unlocked")}
            </Animated.Text>
            <Animated.Text entering={FadeInDown.delay(200).duration(300)} style={styles.sub}>{doneLabel}</Animated.Text>
          </View>
        ) : (
          <View style={styles.content}>
            <View style={styles.headerRow}>
              <Icon name="Ticket" size={18} color="#F9FBFF" />
              <Text style={styles.headerTitle}>{title}</Text>
            </View>
            <View style={styles.whoRow}>
              <View style={styles.thumb}>
                {previewUri ? <SmartImage source={{ uri: previewUri }} style={{ width: "100%", height: "100%" }} contentFit="cover" blurRadius={10} /> : null}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                {who ? <Text style={styles.who} numberOfLines={1}>{who}</Text> : null}
                {sub ? <Text style={styles.sub} numberOfLines={1}>{sub}</Text> : null}
              </View>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>{t("ppv.unlockPrice")}</Text>
              <Text style={styles.priceValue}>
                {priceLabel}
                <Text style={styles.priceDhb}>{"  " + dhbLabel}</Text>
              </Text>
            </View>
            <View style={styles.buttonRow}>
              <TouchableOpacity onPress={close} disabled={busy} style={[styles.closeBtn, busy && { opacity: 0.5 }]} activeOpacity={0.7}>
                <Text style={styles.closeBtnText}>{t("common.close")}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onPay} disabled={busy} style={[styles.payBtn, busy && { opacity: 0.85 }]} activeOpacity={0.7} testID="unlock-pay">
                {busy ? <ActivityIndicator size="small" color="#010305" /> : null}
                <Text style={styles.payBtnText}>
                  {phase === "paying"
                    ? t("paywall.paying", "Paying…")
                    : phase === "confirming"
                      ? t("upload.stageConfirming", "Confirming…")
                      : t("dmPaidLock.unlockFor", { defaultValue: "Unlock for {{price}}", price: priceLabel })}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.statusLine}>
              {phase === "confirming"
                  ? t("dmPaidLock.confirming", "Confirming payment…")
                  : " "}
            </Text>
          </View>
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" },
  overlay: { backgroundColor: SHEET_GLASS_FILL, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  handleWrap: { alignItems: "center", paddingVertical: 10 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" },
  content: { paddingHorizontal: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  headerTitle: { color: "#F9FBFF", fontSize: 17, fontWeight: "700" },
  whoRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  thumb: { width: 44, height: 44, borderRadius: 10, overflow: "hidden", backgroundColor: "#27272a" },
  who: { color: "#F9FBFF", fontSize: 14, fontWeight: "600" },
  sub: { color: "#A6A9AC", fontSize: 12.5 },
  priceRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", paddingHorizontal: 16, paddingVertical: 14, marginBottom: 12,
  },
  priceLabel: { color: "#A6A9AC", fontSize: 14, fontWeight: "500" },
  priceValue: { color: "#F9FBFF", fontSize: 17, fontWeight: "700" },
  priceDhb: { color: "#A6A9AC", fontSize: 12, fontWeight: "500" },
  buttonRow: { flexDirection: "row", gap: 12, marginTop: 4 },
  closeBtn: {
    flex: 1, height: 46, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center",
  },
  closeBtnText: { color: "#F9FBFF", fontSize: 14, fontWeight: "600" },
  payBtn: { flex: 1, height: 46, borderRadius: 12, backgroundColor: "#F4F4F5", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  payBtnText: { color: "#010305", fontSize: 14, fontWeight: "600" },
  statusLine: { color: "#A6A9AC", fontSize: 12, textAlign: "center", marginTop: 10, minHeight: 16 },
  doneWrap: { alignItems: "center", gap: 6, paddingTop: 12, paddingBottom: 28 },
  doneCircle: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: "#F9FBFF", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  doneTitle: { color: "#F9FBFF", fontSize: 18, fontWeight: "800" },
});
